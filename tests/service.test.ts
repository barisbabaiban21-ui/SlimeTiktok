import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/server/store.js';
import { GameService } from '../src/server/service.js';
import { Director, speakableName } from '../src/server/dialogue.js';
import { VoiceService } from '../src/server/voice.js';
import type { VoiceProvider } from '../src/server/voice.js';
import { derive } from '../src/shared/engine.js';
import { defaultSettings, parseSettings, parseEvent } from '../src/shared/validation.js';
import type { LiveEvent } from '../src/shared/types.js';
const make = () => new GameService(new Store(':memory:'), 'demo', 'test-secret');
function gift(id: string, repeat = 1, coins = 199, gid = 'rose'): LiveEvent { return { id, source: 'demo', roomId: 'r', timestamp: Date.now(), kind: 'gift', user: { id: 'u', name: 'Person' }, gift: { id: gid, name: 'Rose', coins, repeat, streakId: 's' } }; }

test('duplicate events and cumulative streak ends never double count', () => {
  const g = make(); try {
    assert.equal(g.ingest(gift('1', 1)).coins, 199);
    assert.equal(g.ingest(gift('2', 5)).coins, 4 * 199);
    assert.equal(g.ingest(gift('3', 5)).coins, 0);
    assert.equal(g.ingest(gift('2', 5)).status, 'duplicate');
    assert.equal(derive(g.state).queued.tutkal, 5);
  } finally { g.close(); }
});
test('coin tiers and exact gift IDs map gifts to ingredients', () => {
  const g = make(); try {
    g.ingest(gift('a', 1, 1, 'g1')); assert.equal(derive(g.state).queued.su, 1);
    g.ingest(gift('b', 1, 10, '8913')); assert.ok(g.state.protect.su > 0, 'protection is instant (Rosa)');
    // An operator remaps Rose to the giant bucket.
    const s = defaultSettings(); s.giftRules = s.giftRules.map(r => r.giftId === '5655' ? { ...r, ingredient: 'kova', units: 2 } : r);
    g.configure(s);
    g.ingest({ ...gift('c', 1, 1, '5655'), gift: { id: '5655', name: 'Rose', coins: 1, repeat: 1, streakId: 'z' } });
    assert.equal(derive(g.state).queued.kova, 2);
    const row = g.menu().find(m => m.ing === 'kova')!; assert.equal(row.label, 'Gül'); assert.equal(row.queued, 2);
    assert.equal(new Set(g.menu().map(m => m.ing)).size, g.menu().length);
  } finally { g.close(); }
});
test('wedding floor accepts unmapped gifts, gives 30 initial roaches, rotates featured roles and expires passes', () => {
  const g = make();
  try {
    const now = Date.now();
    const event = (id: string, user: string, coins: number, giftId: string): LiveEvent => ({
      id, source: 'demo', roomId: 'wedding', timestamp: now, kind: 'gift',
      user: { id: user, name: user },
      gift: { id: giftId, name: 'Düğün Hediyesi', coins, repeat: 1, streakId: id }
    });
    assert.equal(g.ingest(event('entry', 'Misafir1', 5, 'unmapped-5'), now).status, 'no_effect');
    const settings = defaultSettings(); settings.giftRules = settings.giftRules.map(rule => rule.giftId === '5487' ? { ...rule, weddingEntry: true } : rule); g.configure(settings);
    assert.equal(g.ingest(event('entry2', 'Misafir1', 5, '5487'), now + 10).status, 'applied');
    assert.equal(g.public(now + 10).dancers.length, 30, 'first selected gift creates a 30-roach halay');
    assert.equal(g.ingest(event('role1', 'Misafir2', 100, 'unmapped-100'), now + 1000).status, 'no_effect');
    const selected = defaultSettings(); selected.giftRules = selected.giftRules.map(rule => ['5487', '5585'].includes(rule.giftId) ? { ...rule, weddingEntry: true } : rule); g.configure(selected);
    assert.equal(g.ingest(event('role1b', 'Misafir2', 100, '5585'), now + 1010).status, 'applied');
    const afterRole = g.public(now + 1010).dancers;
    assert.equal(afterRole.filter(d => d.role === 'halaybasi').length, 1);
    assert.ok(afterRole.some(d => d.name === 'Misafir2' && d.role === 'halaybasi'));
    g.tick(100, now + 10 * 60 * 1000 + 1011);
    assert.equal(g.public(now + 10 * 60 * 1000 + 1011).dancers.length, 0, 'all passes expire at ten minutes');
    assert.equal(g.ingest(event('return', 'Misafir1', 5, '5487'), now + 10 * 60 * 1000 + 1012).status, 'applied');
    assert.equal(g.public(now + 10 * 60 * 1000 + 1012).dancers.length, 30, 'the same viewer can rejoin after expiry');
  } finally { g.close(); }
});

test('paused gifts are accounted but not presented as game effects', () => {
  const g = make(); try { g.control('pause'); assert.equal(g.ingest(gift('a')).status, 'recorded_paused'); assert.equal(derive(g.state).queuedTotal, 0); assert.equal(g.store.metrics().coins, 199); } finally { g.close(); }
});
test('state, idempotency and gift streak survive database reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slime-')); const path = join(dir, 'test.sqlite');
  const a = new GameService(new Store(path), 'demo', 's'); a.ingest(gift('a', 3)); a.close();
  const b = new GameService(new Store(path), 'demo', 's');
  try { assert.equal(derive(b.state).queued.tutkal, 3); assert.equal(b.ingest(gift('a', 3)).status, 'duplicate'); assert.equal(b.ingest(gift('b', 5)).coins, 2 * 199); }
  finally { b.close(); rmSync(dir, { recursive: true }); }
});
test('an old egg database is refused instead of silently mixed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slime-')); const path = join(dir, 'old.sqlite');
  const old = new Store(path); old.set('schema', 1); old.close();
  try { assert.throws(() => new Store(path), /old egg game/); } finally { rmSync(dir, { recursive: true }); }
});
test('live mode starts disarmed, requires a source and blocks synthetic actions', () => {
  const g = new GameService(new Store(':memory:'), 'live', 's'); try { assert.ok(g.state.paused); assert.throws(() => g.control('resume')); g.heartbeat('test', true); g.control('resume'); assert.ok(g.ready()); assert.throws(() => g.preview('tutkal', 1)); assert.throws(() => g.ingest(gift('a'))); g.tick(100, Date.now() + 50000); assert.ok(g.state.paused); } finally { g.close(); }
});
test('free commands have a cooldown and the public snapshot hides the raw queue', () => {
  const g = make(); try {
    const e: LiveEvent = { id: 'a', source: 'demo', roomId: 'r', timestamp: Date.now(), kind: 'comment', command: '!uzat', user: { id: 'u', name: 'Person' } };
    const m0 = g.state.mass; g.ingest(e, 10000); const m1 = g.state.mass; g.ingest({ ...e, id: 'b' }, 11000);
    assert.ok(m1 > m0); assert.equal(g.state.mass, m1);
    for (let i = 0; i < 50; i++) g.ingest(gift(`q${i}`, 1, 10, `g${i}`));
    const snap = g.public();
    assert.equal('queue' in snap.game, false); assert.ok(snap.derived.upcoming.length <= 8);
    assert.ok(JSON.stringify(snap).length < 32768);
  } finally { g.close(); }
});
test('the demo room walks the whole catalog and the character talks', () => {
  const g = make(); try {
    let now = Date.now(); const said = new Set<string>();
    for (let i = 0; i < 12000; i++) { now += 100; g.tick(100, now); const s = g.public(now).speech; if (s) said.add(s.text); }
    const totals = g.state.totals;
    for (const ing of ['su', 'tutkal', 'ketcap', 'kova', 'sim'] as const) assert.ok((totals[ing] ?? 0) > 0, `demo never used ${ing}`);
    assert.ok(Object.keys(totals).some(k => k.endsWith('_koruma')));
    assert.ok(said.size > 10, `only ${said.size} lines`);
    assert.ok([...said].every(t => !/\{\w+\}/.test(t) && !/^\s*,/.test(t)), 'no unfilled templates');
  } finally { g.close(); }
});
test('names are spoken only when allowed and never when blocklisted', () => {
  assert.equal(speakableName('Ahmet Kocaman', false), null);
  assert.equal(speakableName('Ahmet Kocaman', true), 'Ahmet Kocaman');
  assert.equal(speakableName('🔥z🔥', true), null);
  assert.equal(speakableName('xXamkXx', true), null);
  assert.equal(speakableName('Viewer AB12', true), null);
  const d = new Director(); d.onEvent({ type: 'started', action: { seq: 1, ing: 'tutkal', actor: 'Viewer AB12', n: 1, startedMs: 0, durationMs: 1000, blocked: false } }, () => null, 1000);
  d.tick(0, 1000, 25, true); assert.ok(d.current && !d.current.text.includes('Viewer'));
});
test('voice synthesis is cached, single-flight and never blocks a line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slime-voice-'));
  let calls = 0;
  const fake: VoiceProvider = { name: 'fake', synthesize: async () => { calls++; return { mime: 'audio/mpeg', bytes: new Uint8Array(200) }; } };
  const v = new VoiceService(fake, dir, 'v1');
  try {
    const [a, b] = await Promise.all([v.request('Merhaba yeğenim'), v.request('Merhaba yeğenim')]);
    assert.equal(a, b); assert.match(a!.file, /^[a-f0-9]{32}\.mp3$/); assert.equal(calls, 1);
    assert.deepEqual(await v.request('Merhaba yeğenim'), a); assert.equal(calls, 1); assert.equal(v.cached(), 1);
    const broken = new VoiceService({ name: 'x', synthesize: async () => { throw new Error('down'); } }, dir);
    assert.equal(await broken.request('başka'), null); assert.equal(broken.failures, 1);
  } finally { rmSync(dir, { recursive: true }); }
});
test('settings and events validate the slime vocabulary', () => {
  assert.throws(() => parseSettings({ ...defaultSettings(), giftRules: [{ giftId: '', minCoins: 1, ingredient: 'warm', units: 1, label: '' }] }));
  assert.equal(parseSettings({ ...defaultSettings(), speed: undefined }).speed, 1);
  assert.throws(() => parseSettings({ ...defaultSettings(), speed: 99 }));
  const base = { id: 'x', source: 'demo', roomId: 'r', timestamp: Date.now(), kind: 'comment', user: { id: 'u', name: 'n' } };
  assert.equal(parseEvent({ ...base, command: '!YOĞUR şimdi' }).command, '!yoğur');
  assert.equal(parseEvent({ ...base, command: '!feed' }).command, '');
});
test('failed database transaction rolls back partial writes', () => {
  const s = new Store(':memory:'); try { assert.throws(() => s.transaction(() => { s.set('test', 1); throw Error('fail'); })); assert.equal(s.get('test'), undefined); } finally { s.close(); }
});
test('a pour that makes it worse is called out with the right fix, in correct Turkish', () => {
  const d = new Director();
  const ok = d.wrongPour({ seq: 1, ing: 'su', actor: 'Mazlum', n: 1, grams: 100, blocked: false }, { ing: 'boraks', reason: 'runny' }, 'Mazlum');
  assert.ok(ok); d.tick(0, 1000, 25, true);
  assert.match(d.current!.text, /suya değil boraksa ihtiyacı var|Boraks lazım/);
  assert.equal(new Director().wrongPour({ seq: 1, ing: 'boraks', actor: 'A', n: 1, grams: 1, blocked: false }, { ing: 'boraks', reason: 'runny' }, null), false);
  const e = new Director(); e.needCall({ ing: 'tiras_kopugu', reason: 'flat' }); e.tick(0, 1000, 25, true);
  assert.match(e.current!.text, /köpü/);
});
test('gift coins fill the shared goal and the menu marks what is needed', () => {
  const g = make(); try {
    const s = defaultSettings(); s.goalCoins = 100; g.configure(s);
    g.ingest(gift('a', 1, 199, 'tut'));
    assert.equal(g.state.goalsDone, 1); assert.equal(g.state.goalProgress, 99);
    assert.equal(g.menu().filter(m => m.needed).length, 1);
  } finally { g.close(); }
});
test('with no gifts he keeps making slime himself, and the first show waits after Start', () => {
  const g = new GameService(new Store(':memory:'), 'live', 'test-secret'); try {
    let now = Date.now();
    g.heartbeat('tiktok', true); g.control('resume');
    let self = false, show = false;
    for (let i = 0; i < 25; i++) { // 25 s, one tick per second
      now += 1000; g.heartbeat('tiktok', true); g.tick(1000, now);
      if (g.state.current?.actor === 'Cıvık Böcek' || g.state.lastAction?.actor === 'Cıvık Böcek') self = true;
      if (g.public(now).show) show = true;
    }
    assert.ok(self, 'he pours something himself within 25 s of silence');
    assert.equal(show, false, 'no show in the first 25 s after Start');
    assert.equal(g.store.leaders(now, true).length, 0, 'his own pours never reach the leaderboard');
  } finally { g.close(); }
});
test('a chat vote picks the dance, one vote per viewer; everyone who joins adds slime', () => {
  const g = make(); try {
    type Priv = { vote: { seq: number; votes: number[]; voters: Set<string>; endsAt: number } | null; show: { type: string; variant: number; seq: number; at: number; durationMs: number; votes?: number[] } | null; shows(now: number): void };
    const priv = g as unknown as Priv;
    // Open a vote by hand, as the scheduler would.
    const now = Date.now(), votes = [0, 0, 0, 0];
    priv.show = { type: 'vote', variant: 0, votes, seq: 1, at: now, durationMs: 15000 };
    priv.vote = { seq: 1, votes, voters: new Set(), endsAt: now + 15000 };
    const vote = (id: string, user: string, text: string): LiveEvent => ({ id, source: 'demo', roomId: 'r', timestamp: now, kind: 'comment', user: { id: user, name: user }, text });
    g.ingest(vote('v1', 'a', '2'), now); g.ingest(vote('v2', 'b', '2'), now); g.ingest(vote('v3', 'a', '3'), now); g.ingest(vote('v4', 'c', '3 '), now);
    assert.deepEqual(priv.vote!.votes, [0, 2, 1, 0], 'one vote each; a repeat voter is ignored');
    // When it closes, the winner (option 2: chicken) dances.
    priv.shows(now + 15001);
    assert.equal(priv.show!.type, 'dance'); assert.equal(priv.show!.variant, 2);
    const before = g.state.mass;
    g.ingest({ id: 'j1', source: 'demo', roomId: 'r', timestamp: now, kind: 'join', user: { id: 'newbie', name: 'Newbie' } }, now + 16000);
    assert.ok(g.state.mass > before, 'a join grows the slime');
  } finally { g.close(); }
});
