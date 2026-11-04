import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Director, warmLines } from '../src/server/dialogue.js';
import { audioDurationMs, createProvider, voiceOptions, VoiceService } from '../src/server/voice.js';
import type { VoiceProvider } from '../src/server/voice.js';

/** Builds a Layer III stream of identical frames from a 4-byte header. */
function mp3(header: number[], frameBytes: number, frames: number, id3 = 0): Uint8Array {
  const out = new Uint8Array(id3 + frameBytes * frames);
  if (id3) out.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, (id3 - 10) >> 7, (id3 - 10) & 127]);
  for (let f = 0; f < frames; f++) out.set(header, id3 + f * frameBytes);
  return out;
}
function wav(byteRate: number, dataBytes: number): Uint8Array {
  const b = new Uint8Array(44 + dataBytes), v = new DataView(b.buffer);
  b.set([...'RIFF'].map(c => c.charCodeAt(0)), 0); v.setUint32(4, 36 + dataBytes, true); b.set([...'WAVEfmt '].map(c => c.charCodeAt(0)), 8);
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, byteRate / 2, true); v.setUint32(28, byteRate, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); b.set([...'data'].map(c => c.charCodeAt(0)), 36); v.setUint32(40, dataBytes, true);
  return b;
}
const tick = () => new Promise(r => setTimeout(r, 5));

test('audio length is read from MP3 frames and WAV headers', () => {
  // xAI over fal: MPEG-2 Layer III, 24 kHz, 128 kbps → 384-byte frames of 24 ms.
  assert.equal(audioDurationMs(mp3([0xff, 0xf3, 0xc4, 0xc0], 384, 100), 'mp3'), 2400);
  assert.equal(audioDurationMs(mp3([0xff, 0xf3, 0xc4, 0xc0], 384, 100, 138), 'mp3'), 2400);
  // MPEG-1 Layer III, 44.1 kHz, 128 kbps → 417-byte frames of 1152 samples.
  assert.equal(audioDurationMs(mp3([0xff, 0xfb, 0x90, 0xc0], 417, 50), 'mp3'), Math.round(50 * 1152 / 44100 * 1000));
  assert.equal(audioDurationMs(wav(48000, 96000), 'wav'), 2000);
  assert.equal(audioDurationMs(new Uint8Array(200), 'mp3'), null);
  assert.equal(audioDurationMs(new Uint8Array(200), 'ogg'), null);
});

test('a line plays for as long as its audio, and goes out as a caption when audio is late', async () => {
  const d = new Director(async () => ({ file: 'a'.repeat(32) + '.mp3', durationMs: 9000 }), 1000);
  d.say(['Kısa.'], {}, 1);
  d.tick(0, 1000, 999, true); await tick();
  assert.equal(d.current?.audio, 'a'.repeat(32) + '.mp3');
  assert.equal(d.current?.durationMs, 9250);
  const slow = new Director(() => new Promise(() => undefined), 30);
  slow.say(['Bekleyen cümle.'], {}, 1);
  const now = () => slow.current;
  slow.tick(0, 1000, 999, true); assert.equal(now(), null);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(now()?.audio, null); assert.equal(now()?.text, 'Bekleyen cümle.');
});

test('the next line is voiced while the current one is still playing', async () => {
  const asked: string[] = [];
  const d = new Director(async text => { asked.push(text); return { file: 'b'.repeat(32) + '.mp3', durationMs: 3000 }; }, 1000);
  d.say(['Birinci cümle.'], {}, 2);
  d.tick(0, 1000, 999, true); await tick();
  d.say(['İkinci cümle.'], {}, 2);
  d.tick(100, 1000, 999, true);
  assert.deepEqual(asked, ['Birinci cümle.', 'İkinci cümle.']);
  d.tick(200, 1000, 999, true);
  assert.equal(asked.length, 2, 'asked once per line');
});

test('the daily character budget, the audience gate and concurrency bound paid synthesis', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slime-voice-'));
  let calls = 0, live = 0, peak = 0;
  const fake: VoiceProvider = { name: 'fake', synthesize: async () => {
    calls++; live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 20)); live--;
    return { mime: 'audio/mpeg', bytes: mp3([0xff, 0xf3, 0xc4, 0xc0], 384, 50) };
  } };
  try {
    const v = new VoiceService(fake, dir, 'rex', { dailyChars: 30, concurrency: 2 });
    assert.equal(await v.request('x'.repeat(31)), null); assert.equal(calls, 0);
    const clip = await v.request('Merhaba');
    assert.equal(clip?.durationMs, 1200); assert.equal(v.charsToday(), 7);
    v.audience = () => false;
    assert.equal(await v.request('Kimse izlemiyor'), null); assert.equal(calls, 1);
    assert.deepEqual(await v.request('Merhaba'), clip, 'cached clips are served without an audience');
    v.audience = () => true;
    await Promise.all(['bir', 'iki', 'üç', 'dört'].map(t => v.request(t)));
    assert.equal(peak, 2); assert.equal(calls, 5);
    // The budget survives a restart.
    const again = new VoiceService(fake, dir, 'rex', { dailyChars: 30 });
    assert.equal(again.charsToday(), v.charsToday());
  } finally { rmSync(dir, { recursive: true }); }
});

test('warm-up voices every fixed line once and ignores the audience gate', async () => {
  const lines = warmLines();
  assert.ok(lines.length > 120, `${lines.length} lines`);
  assert.equal(new Set(lines).size, lines.length);
  for (const l of lines) assert.ok(!/[{}]/.test(l) && l.length <= 220 && l === l.trim(), l);
  assert.ok(lines.includes('Disko topu gibi oldu bu slime!'));
  assert.ok(lines.includes('Su ekliyoruz kirvem, azar azar, böceğin usta.'));
  const dir = mkdtempSync(join(tmpdir(), 'slime-voice-'));
  let calls = 0;
  try {
    const v = new VoiceService({ name: 'fake', synthesize: async () => { calls++; return { mime: 'audio/mpeg', bytes: new Uint8Array(200) }; } }, dir);
    v.audience = () => false;
    assert.equal(await v.warm(lines.slice(0, 5)), 5);
    assert.equal(await v.warm(lines.slice(0, 5)), 0, 'second warm-up is free');
    assert.equal(calls, 5);
  } finally { rmSync(dir, { recursive: true }); }
});

test('the fal provider calls fal.run with the xAI voice and downloads the audio', async () => {
  assert.equal(createProvider({ TTS_PROVIDER: 'fal', FAL_KEY: 'k' })?.name, 'fal');
  assert.throws(() => createProvider({ TTS_PROVIDER: 'fal' }), /FAL_KEY/);
  assert.deepEqual(voiceOptions({ TTS_WAIT_MS: '6500', TTS_DAILY_CHARS: 'x', TTS_PREWARM: 'false' }), { waitMs: 6500, dailyChars: 100_000, concurrency: 2, prewarm: false });
  const seen: { url: string; init?: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), init });
    if (seen.length === 1) return new Response(JSON.stringify({ audio: { url: 'https://v3.fal.media/files/x.mp3' } }), { headers: { 'content-type': 'application/json' } });
    return new Response(new Uint8Array(500), { headers: { 'content-type': 'audio/mpeg' } });
  }) as typeof fetch;
  try {
    const out = await createProvider({ TTS_PROVIDER: 'fal', FAL_KEY: 'secret', TTS_VOICE: 'rex' })!.synthesize('Merhaba', AbortSignal.timeout(1000));
    assert.equal(out.mime, 'audio/mpeg'); assert.equal(out.bytes.byteLength, 500);
    assert.equal(seen[0]!.url, 'https://fal.run/xai/tts/v1');
    assert.equal((seen[0]!.init!.headers as Record<string, string>).authorization, 'Key secret');
    assert.deepEqual(JSON.parse(String(seen[0]!.init!.body)), { text: 'Merhaba', voice: 'rex', language: 'tr' });
    assert.equal(seen[1]!.url, 'https://v3.fal.media/files/x.mp3');
  } finally { globalThis.fetch = original; }
});
