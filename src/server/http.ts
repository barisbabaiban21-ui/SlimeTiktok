import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { INGREDIENTS } from '../shared/types.js';
import type { IngredientId } from '../shared/types.js';
import { VOICE_MIME } from './voice.js';
import { join } from 'node:path';
import { number, object, parseEvent, text, ValidationError } from '../shared/validation.js';
import { constantEqual, Limiter, pseudonym, verifySignature } from './security.js';
import { GameService } from './service.js';
import type { Config } from './config.js';
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function body(req: IncomingMessage): Promise<string> {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Use application/json');
  let size = 0; const parts: Buffer[] = [];
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 32768) throw new HttpError(413, 'Body exceeds 32 KB');
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts).toString('utf8');
}
function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
export function createApp(service: GameService, cfg: Config) {
  const streams = new Map<ServerResponse, string>(), limiter = new Limiter();
  // Nobody watching means nobody hears it: new lines are not sent for paid synthesis.
  service.voice.audience = () => streams.size > 0;
  let lastTick = performance.now(), stopped = false;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
    const ip = req.socket.remoteAddress ?? 'unknown';
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      const method = req.method ?? 'GET';
      if (req.headers.origin && req.headers.origin !== cfg.origin) throw new HttpError(403, 'Origin not allowed');
      if (path.startsWith('/api/admin/')) {
        if (!limiter.allow(`admin:${ip}`, 240)) throw new HttpError(429, 'Slow down');
        if (!constantEqual(String(req.headers.authorization ?? ''), `Bearer ${cfg.adminToken}`)) throw new HttpError(401, 'Authentication required');
      }
      if (method === 'GET' && path === '/healthz') return json(res, 200, { ok: !stopped, mode: cfg.mode });
      if (method === 'GET' && path === '/readyz') return json(res, service.ready() ? 200 : 503, { ready: service.ready(), mode: cfg.mode, reason: service.state.pauseReason || null });
      if (method === 'GET' && path === '/api/state') {
        if (!limiter.allow(`read:${ip}`, 180)) throw new HttpError(429, 'Slow down');
        return json(res, 200, service.public());
      }
      if (method === 'GET' && path === '/api/events') {
        if (streams.size >= 32 || [...streams.values()].filter(v => v === ip).length >= 8 || !limiter.allow(`sse:${ip}`, 30)) throw new HttpError(429, 'Too many overlay connections');
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'connection': 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`retry: 3000\nevent: state\ndata: ${JSON.stringify(service.public())}\n\n`);
        streams.set(res, ip); res.on('close', () => streams.delete(res)); return;
      }
      if (method === 'POST' && (path === '/api/ingest' || path === '/api/source')) {
        if (!limiter.allow(`ingest:${ip}`, 6000)) throw new HttpError(429, 'Ingress rate limit');
        const raw = await body(req);
        if (!verifySignature(cfg.secret, String(req.headers['x-slime-timestamp'] ?? ''), String(req.headers['x-slime-signature'] ?? ''), raw)) throw new HttpError(401, 'Invalid signature or expired timestamp');
        const data: unknown = JSON.parse(raw);
        if (path === '/api/source') {
          const o = object(data);
          if (typeof o.connected !== 'boolean') throw new ValidationError('connected must be boolean');
          service.heartbeat(text(o.provider, 32), o.connected); return json(res, 200, { ok: true });
        }
        const event = parseEvent(data);
        if ((event.source === 'demo') !== (cfg.mode === 'demo')) throw new HttpError(422, 'Event source does not match MODE');
        return json(res, 200, service.ingest(event));
      }
      if (method === 'GET' && path === '/api/admin/state') return json(res, 200, service.admin(streams.size));
      if (method === 'POST' && path.startsWith('/api/admin/')) {
        const data = object(JSON.parse(await body(req)));
        if (path === '/api/admin/control') service.control(text(data.command, 20));
        else if (path === '/api/admin/settings') service.configure(data);
        else if (path === '/api/admin/test') {
          if (cfg.mode !== 'demo') throw new HttpError(403, 'Studio tests are disabled in live mode');
          const ing = text(data.ingredient, 20) as IngredientId;
          if (!INGREDIENTS.includes(ing)) throw new ValidationError('Invalid ingredient');
          service.preview(ing, number(data.units, 1, 100, true));
        } else if (path === '/api/admin/block') {
          if (typeof data.blocked !== 'boolean') throw new ValidationError('Invalid blocked flag');
          service.store.block(pseudonym(cfg.secret, text(data.userId, 128)), data.blocked);
        } else throw new HttpError(404, 'Not found');
        return json(res, 200, { ok: true });
      }
      const voice = /^\/api\/voice\/([a-f0-9]{32})\.(mp3|wav|ogg|webm)$/.exec(path);
      if (method === 'GET' && voice) {
        if (!limiter.allow(`voice:${ip}`, 600)) throw new HttpError(429, 'Slow down');
        try {
          const bytes = await readFile(join(service.voice.dir, `${voice[1]}.${voice[2]}`));
          res.writeHead(200, { 'content-type': VOICE_MIME[voice[2]!]!, 'cache-control': 'public, max-age=86400, immutable', 'content-length': bytes.byteLength });
          return void res.end(bytes);
        } catch { throw new HttpError(404, 'Not found'); }
      }
      if (path.startsWith('/api/')) throw new HttpError(404, 'Not found');
      if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      if (!limiter.allow(`static:${ip}`, 600)) throw new HttpError(429, 'Slow down');
      const clean = decodeURIComponent(path);
      const file = resolve(cfg.publicDir, ['/', '/overlay', '/admin'].includes(clean) ? 'index.html' : `.${clean}`);
      if (!file.startsWith(cfg.publicDir + sep)) throw new HttpError(403, 'Invalid path');
      const mime: Record<string,string> = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.map':'application/json', '.woff2':'font/woff2', '.bin':'application/octet-stream', '.hdr':'application/octet-stream', '.glb':'model/gltf-binary', '.jpg':'image/jpeg', '.webp':'image/webp', '.ktx2':'image/ktx2', '.mp3':'audio/mpeg' };
      if (!mime[extname(file)]) throw new HttpError(404, 'Not found');
      try {
        const info = await stat(file);
        if (!info.isFile()) throw new HttpError(404, 'Not found');
        res.setHeader('content-type', `${mime[extname(file)]}; charset=utf-8`);
        res.setHeader('cache-control', 'no-cache');
        res.end(method === 'HEAD' ? undefined : await readFile(file));
      } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(404, 'Not found'); }
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      const status = error instanceof HttpError ? error.status : error instanceof ValidationError || error instanceof SyntaxError ? 400 : 409;
      const message = error instanceof HttpError || error instanceof ValidationError ? error.message : 'Request could not be completed';
      if (status === 409) console.error(JSON.stringify({ level: 'error', event: 'request_failed', type: error instanceof Error ? error.name : 'unknown' }));
      json(res, status, { error: message });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  const tick = setInterval(() => {
    const now = performance.now();
    try { service.tick(now - lastTick); }
    catch { service.state.paused = true; service.state.pauseReason = 'storage_error'; service.armed = false; console.error('{"level":"error","event":"simulation_failed"}'); }
    lastTick = now;
  }, 100);
  const send = setInterval(() => {
    if (!streams.size) return;
    try {
      const frame = `event: state\ndata: ${JSON.stringify(service.public())}\n\n`;
      for (const res of streams.keys()) {
        if (res.writableLength > 131072) { res.destroy(); streams.delete(res); } else res.write(frame);
      }
    } catch { console.error('{"level":"error","event":"snapshot_failed"}'); }
  }, 250);
  async function close(): Promise<void> {
    if (stopped) return; stopped = true;
    clearInterval(tick); clearInterval(send);
    for (const res of streams.keys()) res.end();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    service.close();
  }
  return { server, close };
}
