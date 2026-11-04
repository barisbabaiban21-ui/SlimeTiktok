import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/** A text-to-speech backend. Runs on the server only; keys never reach the browser. */
export interface VoiceProvider {
  readonly name: string;
  synthesize(text: string, signal: AbortSignal): Promise<{ mime: string; bytes: Uint8Array }>;
}
const EXT: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };
export const VOICE_MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm' };

async function audioResponse(res: Response): Promise<{ mime: string; bytes: Uint8Array }> {
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
  const mime = String(res.headers.get('content-type') ?? 'audio/mpeg').split(';')[0]!.trim();
  if (!EXT[mime]) throw new Error('TTS returned a non-audio response');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength < 64 || bytes.byteLength > 5_000_000) throw new Error('TTS audio size out of range');
  return { mime, bytes };
}

/**
 * Generic adapter: POST {text, voice} as JSON, receive audio bytes.
 * Fits a small proxy in front of any vendor. Untested against a real vendor.
 */
class HttpProvider implements VoiceProvider {
  readonly name = 'http';
  constructor(private url: string, private key: string, private voice: string) {}
  async synthesize(text: string, signal: AbortSignal) {
    return audioResponse(await fetch(this.url, { method: 'POST', signal,
      headers: { 'content-type': 'application/json', ...(this.key ? { authorization: `Bearer ${this.key}` } : {}) },
      body: JSON.stringify({ text, voice: this.voice, language: 'tr' }) }));
  }
}
/** ElevenLabs text-to-speech REST endpoint. Untested here: no key in this environment. */
class ElevenLabsProvider implements VoiceProvider {
  readonly name = 'elevenlabs';
  constructor(private key: string, private voice: string, private model: string) {}
  async synthesize(text: string, signal: AbortSignal) {
    return audioResponse(await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voice)}?output_format=mp3_44100_128`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json', accept: 'audio/mpeg', 'xi-api-key': this.key },
      body: JSON.stringify({ text, model_id: this.model || 'eleven_multilingual_v2', language_code: 'tr' }) }));
  }
}
/** OpenAI-compatible /audio/speech endpoint. Untested here: no key in this environment. */
class OpenAIProvider implements VoiceProvider {
  readonly name = 'openai';
  constructor(private key: string, private voice: string, private model: string, private base: string) {}
  async synthesize(text: string, signal: AbortSignal) {
    return audioResponse(await fetch(`${this.base.replace(/\/$/, '')}/audio/speech`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ model: this.model || 'gpt-4o-mini-tts', voice: this.voice || 'onyx', input: text, response_format: 'mp3',
        instructions: 'Enerjik, sıcak, esprili bir Türk dayısı gibi konuş. Canlı yayındasın.' }) }));
  }
}

/**
 * fal.ai hosted models through the synchronous fal.run endpoint. The default is xAI TTS,
 * which takes {text, voice, language}; tested against xai/tts/v1 with the voice "rex".
 */
class FalProvider implements VoiceProvider {
  readonly name = 'fal';
  constructor(private key: string, private model: string, private voice: string) {}
  async synthesize(text: string, signal: AbortSignal) {
    const res = await fetch(`https://fal.run/${this.model}`, { method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: `Key ${this.key}` },
      body: JSON.stringify({ text, voice: this.voice, language: 'tr' }) });
    if (!res.ok) throw new Error(`fal HTTP ${res.status}`);
    const out = await res.json() as { audio?: { url?: unknown } };
    const url = typeof out.audio?.url === 'string' ? out.audio.url : '';
    if (!/^https:\/\//.test(url)) throw new Error('fal returned no audio URL');
    return audioResponse(await fetch(url, { signal }));
  }
}

export function createProvider(env: NodeJS.ProcessEnv): VoiceProvider | null {
  const kind = (env.TTS_PROVIDER ?? 'none').toLowerCase(), key = env.TTS_API_KEY ?? '', voice = env.TTS_VOICE ?? '', model = env.TTS_MODEL ?? '';
  if (kind === 'none' || kind === '') return null;
  if (kind === 'fal') {
    const falKey = key || env.FAL_KEY || '';
    if (!falKey) throw new Error('FAL_KEY (or TTS_API_KEY) is required for TTS_PROVIDER=fal');
    return new FalProvider(falKey, model || 'xai/tts/v1', voice || 'rex');
  }
  if (kind === 'http') {
    const url = env.TTS_URL ?? '';
    if (!/^https?:\/\//.test(url)) throw new Error('TTS_URL must be an http(s) URL for TTS_PROVIDER=http');
    return new HttpProvider(url, key, voice);
  }
  if (!key) throw new Error('TTS_API_KEY is required for this TTS_PROVIDER');
  if (kind === 'elevenlabs') { if (!voice) throw new Error('TTS_VOICE (voice ID) is required for ElevenLabs'); return new ElevenLabsProvider(key, voice, model); }
  if (kind === 'openai') return new OpenAIProvider(key, voice, model, env.TTS_URL || 'https://api.openai.com/v1');
  throw new Error('TTS_PROVIDER must be none, fal, http, elevenlabs or openai');
}

const MP3_KBPS = [[0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]] as const;
const MP3_RATES: Record<number, readonly number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
/** Playback length of an MP3 (Layer III frames, CBR or VBR) or PCM WAV file; null when it cannot tell. */
export function audioDurationMs(bytes: Uint8Array, ext: string): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ext === 'wav') {
    let byteRate = 0;
    for (let i = 12; i + 8 <= bytes.length;) {
      const id = String.fromCharCode(...bytes.subarray(i, i + 4)), size = view.getUint32(i + 4, true);
      if (id === 'fmt ' && i + 20 <= bytes.length) byteRate = view.getUint32(i + 16, true);
      if (id === 'data') return byteRate ? Math.round(Math.min(size, bytes.length - i - 8) / byteRate * 1000) : null;
      i += 8 + size + (size & 1);
    }
    return null;
  }
  if (ext !== 'mp3') return null;
  let i = 0, samples = 0, rate = 0;
  // An ID3v2 tag sits in front of the first frame; its size is stored in 7-bit bytes.
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 && bytes.length > 10) i = 10 + (bytes[6]! << 21 | bytes[7]! << 14 | bytes[8]! << 7 | bytes[9]!);
  while (i + 4 <= bytes.length) {
    const h = view.getUint32(i);
    const version = (h >>> 19) & 3, layer = (h >>> 17) & 3, bitrate = (h >>> 12) & 15, sr = (h >>> 10) & 3;
    if ((h >>> 21) !== 0x7ff || version === 1 || layer !== 1 || bitrate === 0 || bitrate === 15 || sr === 3) { i++; continue; }
    const mpeg1 = version === 3, hz = MP3_RATES[version]![sr]!;
    const length = Math.floor((mpeg1 ? 144 : 72) * MP3_KBPS[mpeg1 ? 0 : 1][bitrate]! * 1000 / hz) + ((h >>> 9) & 1);
    samples += mpeg1 ? 1152 : 576; rate = hz; i += length;
  }
  return rate ? Math.round(samples / rate * 1000) : null;
}

/** A cached voice file and how long it plays. */
export interface Clip { file: string; durationMs: number | null }
export interface VoiceOptions { concurrency?: number; dailyChars?: number; timeoutMs?: number; waitMs?: number }
/** Reads the TTS_* tuning knobs; out-of-range values fall back to safe defaults. */
export function voiceOptions(env: NodeJS.ProcessEnv): VoiceOptions & { prewarm: boolean } {
  const int = (v: string | undefined, def: number, lo: number, hi: number): number => {
    const n = Number(v); return v !== undefined && v !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : def;
  };
  return { waitMs: int(env.TTS_WAIT_MS, 4000, 500, 15000), dailyChars: int(env.TTS_DAILY_CHARS, 100_000, 0, 10_000_000),
    concurrency: int(env.TTS_CONCURRENCY, 2, 1, 6), prewarm: env.TTS_PREWARM !== 'false' };
}

/**
 * Disk cache plus a small bounded queue: identical lines are deduplicated, a few syntheses run at once,
 * and a daily character budget stops paid synthesis (captions keep working) once it is spent.
 */
export class VoiceService {
  readonly dir: string;
  failures = 0;
  /** Synthesis runs only while this returns true, e.g. while an overlay is watching. Cached clips are always served. */
  audience: () => boolean = () => true;
  private inflight = new Map<string, Promise<Clip | null>>();
  private queue: (() => void)[] = [];
  private running = 0;
  private waiting = 0;
  private usage = { day: '', chars: 0 };
  private readonly concurrency: number;
  readonly dailyChars: number;
  private readonly timeoutMs: number;
  readonly waitMs: number;
  constructor(readonly provider: VoiceProvider | null, dataDir: string, private voiceId = '', options: VoiceOptions = {}) {
    this.dir = join(dataDir, 'voice');
    this.waitMs = options.waitMs ?? 4000;
    this.concurrency = Math.max(1, options.concurrency ?? 2);
    this.dailyChars = Math.max(0, options.dailyChars ?? 100_000);
    // Late audio is still worth keeping: the line was already captioned, but the next time it plays with voice.
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (provider && dataDir !== ':memory:') {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      try { this.usage = JSON.parse(readFileSync(join(this.dir, 'usage.json'), 'utf8')) as { day: string; chars: number }; } catch { /* first run */ }
    }
  }
  get ready(): boolean { return !!this.provider; }
  cached(): number { try { return readdirSync(this.dir).filter(f => !f.startsWith('.') && f !== 'usage.json').length; } catch { return 0; } }
  /** Characters sent to the provider today (UTC), for the admin panel and the budget. */
  charsToday(now = Date.now()): number { return this.usage.day === new Date(now).toISOString().slice(0, 10) ? this.usage.chars : 0; }
  key(text: string): string { return createHash('sha256').update(JSON.stringify([this.provider?.name, this.voiceId, text])).digest('hex').slice(0, 32); }
  private find(key: string): Clip | null {
    for (const ext of Object.keys(VOICE_MIME)) {
      const file = `${key}.${ext}`;
      if (existsSync(join(this.dir, file))) {
        let durationMs: number | null = null;
        try { durationMs = audioDurationMs(readFileSync(join(this.dir, file)), ext); } catch { /* unreadable: play without timing */ }
        return { file, durationMs };
      }
    }
    return null;
  }
  private spend(chars: number): boolean {
    const day = new Date().toISOString().slice(0, 10);
    if (this.usage.day !== day) this.usage = { day, chars: 0 };
    if (this.usage.chars + chars > this.dailyChars) return false;
    this.usage.chars += chars;
    try { writeFileSync(join(this.dir, 'usage.json'), JSON.stringify(this.usage), { mode: 0o600 }); } catch { /* in-memory budget still holds */ }
    return true;
  }
  private async slot<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) await new Promise<void>(resolve => this.queue.push(resolve));
    this.running++;
    try { return await work(); } finally { this.running--; this.queue.shift()?.(); }
  }
  /** Resolves to a cached clip such as `ab12….mp3`, or null when unavailable. Warming ignores the audience gate. */
  request(text: string, warming = false): Promise<Clip | null> {
    if (!this.provider) return Promise.resolve(null);
    const key = this.key(text);
    const hit = this.find(key);
    if (hit) return Promise.resolve(hit);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    if (this.waiting >= 6 || (!warming && !this.audience())) return Promise.resolve(null);
    if (!this.spend(text.length)) return Promise.resolve(null);
    this.waiting++;
    const job = this.slot(async () => {
      try {
        const out = await this.provider!.synthesize(text, AbortSignal.timeout(this.timeoutMs));
        const ext = EXT[out.mime]!, name = `${key}.${ext}`, tmp = join(this.dir, `.${name}.tmp`);
        writeFileSync(tmp, out.bytes, { mode: 0o600 }); renameSync(tmp, join(this.dir, name));
        return { file: name, durationMs: audioDurationMs(out.bytes, ext) };
      } catch { this.failures++; return null; }
      finally { this.waiting--; this.inflight.delete(key); }
    });
    this.inflight.set(key, job);
    return job;
  }
  /** Synthesizes fixed lines ahead of time, one by one, yielding to live lines. Returns how many were new. */
  async warm(texts: string[], stopped: () => boolean = () => false): Promise<number> {
    let made = 0;
    for (const text of texts) {
      if (stopped() || !this.provider) break;
      if (this.find(this.key(text))) continue;
      while (this.waiting > 0 && !stopped()) await new Promise(r => setTimeout(r, 250));
      if (await this.request(text, true)) made++;
      else if (this.charsToday() + text.length > this.dailyChars) break;
    }
    return made;
  }
}
