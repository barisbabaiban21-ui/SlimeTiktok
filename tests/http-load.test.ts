/** Real HTTP under load: concurrent signed gifts, live SSE screens, hostile requests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Store } from '../src/server/store.js';
import { GameService } from '../src/server/service.js';
import { createApp } from '../src/server/http.js';
import { sign } from '../src/server/security.js';
import { derive } from '../src/shared/engine.js';
import { stateViolations } from './harness.js';

test('3,000 concurrent signed gifts with SSE screens attached: no errors, no double counting', async () => {
  const secret = 'k'.repeat(64), token = 't'.repeat(64), service = new GameService(new Store(':memory:'), 'live', secret);
  const app = createApp(service, { host: '127.0.0.1', port: 0, origin: 'http://localhost:3000', adminToken: token, secret, dataDir: '.', mode: 'live', publicDir: resolve('dist/public'), ttsVoice: '' });
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const post = (path: string, value: unknown, opts: { ts?: string; sig?: string; raw?: string } = {}) => {
    const b = opts.raw ?? JSON.stringify(value), ts = opts.ts ?? String(Date.now());
    return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-slime-timestamp': ts, 'x-slime-signature': opts.sig ?? sign(secret, ts, b) }, body: b });
  };
  const controllers: AbortController[] = [];
  try {
    assert.equal((await post('/api/source', { provider: 'load', connected: true })).status, 200);
    assert.equal((await fetch(base + '/api/admin/control', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{"command":"resume"}' })).status, 200);
    // Eight overlay screens listening the whole time.
    let frames = 0;
    for (let i = 0; i < 8; i++) {
      const c = new AbortController(); controllers.push(c);
      void fetch(base + '/api/events', { signal: c.signal }).then(async res => {
        const reader = res.body!.getReader();
        for (;;) { const { done, value } = await reader.read(); if (done) break; frames += new TextDecoder().decode(value).split('event: state').length - 1; }
      }).catch(() => undefined);
    }
    const statuses = new Map<number, number>();
    let coins = 0;
    for (let batch = 0; batch < 30; batch++) {
      const results = await Promise.all(Array.from({ length: 100 }, (_, i) => {
        const n = batch * 100 + i;
        return post('/api/ingest', { id: `load-${n}`, source: 'tiktok', roomId: 'r', timestamp: Date.now(), kind: 'gift', user: { id: `u${n % 700}`, name: `User ${n % 700}` },
          gift: { id: `g${n % 5}`, name: 'Gift', coins: [1, 5, 10, 199, 500][n % 5], repeat: 1, streakId: `s${n}` } });
      }));
      for (const r of results) {
        statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
        const body = await r.json() as { coins?: number }; coins += body.coins ?? 0;
      }
    }
    assert.deepEqual([...statuses.keys()].sort(), [200], `statuses ${JSON.stringify([...statuses])}`);
    assert.equal(coins, service.store.metrics().coins, 'every coin is accounted exactly once');
    // The same 100 events again are all duplicates.
    const again = await Promise.all(Array.from({ length: 100 }, (_, i) => post('/api/ingest', { id: `load-${i}`, source: 'tiktok', roomId: 'r', timestamp: Date.now(), kind: 'gift', user: { id: `u${i % 700}`, name: 'x' }, gift: { id: `g${i % 5}`, name: 'Gift', coins: [1, 5, 10, 199, 500][i % 5], repeat: 1, streakId: `s${i}` } })));
    for (const r of again) assert.equal((await r.json() as { status: string }).status, 'duplicate');
    assert.equal(coins, service.store.metrics().coins);
    await new Promise(r => setTimeout(r, 1500));
    assert.ok(frames >= 8 * 3, `SSE screens kept receiving (${frames} frames)`);
    assert.deepEqual(stateViolations(service.state, service.settings), []);
    assert.ok(derive(service.state).queuedTotal > 0);
    // Hostile traffic.
    assert.equal((await post('/api/ingest', { x: 1 }, { sig: 'f'.repeat(64) })).status, 401, 'bad signature');
    assert.equal((await post('/api/ingest', { x: 1 }, { ts: String(Date.now() - 120000) })).status, 401, 'replayed old timestamp');
    assert.equal((await post('/api/ingest', null, { raw: JSON.stringify({ pad: 'x'.repeat(40000) }) })).status, 413, 'oversized body');
    assert.equal((await post('/api/ingest', null, { raw: '{not json' })).status, 400, 'malformed JSON');
    assert.equal((await post('/api/ingest', { id: 'demo', source: 'demo', roomId: 'r', timestamp: Date.now(), kind: 'gift', user: { id: 'u', name: 'u' }, gift: { id: 'g', name: 'g', coins: 1, repeat: 1 } })).status, 422, 'demo events refused in live');
    // Screen limit: the 33rd overlay connection is refused instead of exhausting the server.
    const extra: AbortController[] = [];
    const codes: number[] = [];
    for (let i = 0; i < 30; i++) { const c = new AbortController(); extra.push(c); controllers.push(c); codes.push((await fetch(base + '/api/events', { signal: c.signal })).status); }
    assert.ok(codes.includes(429), 'too many screens are refused');
    assert.equal((await fetch(base + '/healthz')).status, 200, 'still healthy');
  } finally {
    for (const c of controllers) c.abort();
    await app.close();
  }
});
