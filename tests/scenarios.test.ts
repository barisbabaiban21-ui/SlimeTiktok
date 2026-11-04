/** Scenario tests on synthetic traffic. Every step is checked against the invariants in harness.ts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sim, crowd, rng, stateViolations } from './harness.js';
import { Store } from '../src/server/store.js';
import { pseudonym } from '../src/server/security.js';
import { advance, angerStage, degradation, derive, enqueue, freshState, milestone, multiplier, need, restoredState, waterPercent } from '../src/shared/engine.js';
import { Director, WATER_LINES, STAGE_LINES, BAIT, RESCUE, WATER_SHIELD, warmLines } from '../src/server/dialogue.js';
import { parseEvent, parseSettings, defaultSettings, ValidationError } from '../src/shared/validation.js';
import { CATALOG } from '../src/shared/ingredients.js';
import { INGREDIENTS } from '../src/shared/types.js';
import type { GameState } from '../src/shared/types.js';

const clean = (sim: Sim) => assert.deepEqual(sim.stats.violations.slice(0, 5), []);

test('water show: one water every two seconds reaches soup in 30–60 seconds, with all anger stages', () => {
  const sim = new Sim(undefined, { goalCoins: 1000000 });
  try {
    const stages = new Set(['good']), anger = new Set(['calm']); let soupAt = 0;
    for (let s = 0; s < 60; s += 2) {
      sim.gift(`su${s % 6}`, 1); sim.advance(2000, 100);
      stages.add(degradation(sim.g.state.consistency)); anger.add(angerStage(sim.g.state.anger));
      if (!soupAt && degradation(sim.g.state.consistency) === 'soup') soupAt = s + 2;
    }
    assert.deepEqual([...stages], ['good', 'loose', 'flowing', 'soup']);
    assert.deepEqual([...anger], ['calm', 'request', 'begging', 'angry', 'explosion']);
    assert.ok(soupAt >= 30 && soupAt <= 60, `soup at ${soupAt}s`);
    assert.equal(multiplier(sim.g.state), 0);
    const mass = sim.g.state.mass, points = sim.snapshot().leaders[0]!.points;
    sim.gift('su0', 1); sim.advance(2000);
    assert.equal(sim.g.state.mass, mass); assert.ok(sim.g.state.goalProgress > 30);
    assert.ok(sim.snapshot().leaders.some(l => l.points >= points));
    sim.event({ kind: 'follow', user: { id: 'fan', name: 'Fan' } });
    assert.equal(sim.g.state.mass, mass, 'free growth also stops in soup');
    clean(sim);
  } finally { sim.close(); }
});

test('water show: rescue, quiet recovery, shield and clear-queue retain mass and reset teams', () => {
  const sim = new Sim(undefined, { showNames: true });
  try {
    for (let i = 0; i < 30; i++) { sim.gift('Su', 1); sim.advance(2000); }
    const angry = sim.g.state.anger, mass = sim.g.state.mass;
    for (let i = 0; i < 3; i++) { sim.gift('Ela', 5, 1, '5487'); sim.advance(2000); }
    assert.ok(sim.g.state.consistency >= -45, `rescued to ${sim.g.state.consistency}`);
    assert.ok(sim.g.state.anger <= angry - 30);
    assert.equal(sim.g.state.rescuer?.actor, 'Ela'); assert.ok(sim.g.state.mass >= mass);
    sim.advance(40000); assert.equal(sim.g.state.anger, 0); assert.equal(sim.g.state.rescuer, null);
    sim.gift('Kalkan', 10, 1, '8913'); const water = sim.g.state.teams.water;
    sim.gift('Su', 1); sim.advance(2000);
    assert.equal(sim.g.state.teams.water, water, 'blocked water does not raise anger or water score');
    assert.equal(sim.g.state.anger, 0);
    sim.g.control('clear_queue'); assert.deepEqual(sim.g.state.teams, { water: 0, rescue: 0 }); clean(sim);
  } finally { sim.close(); }
});

test('water show: explosions cannot repeat inside sixty seconds, and survive a save', () => {
  const sim = new Sim();
  try {
    const explosions: number[] = []; let seen = 0;
    for (let s = 0; s < 160; s += 2) {
      sim.gift('Su', 1); sim.advance(2000);
      if (sim.g.state.nextExplosionMs !== seen) { seen = sim.g.state.nextExplosionMs; explosions.push(seen); }
    }
    assert.ok(explosions.length >= 2);
    for (let i = 1; i < explosions.length; i++) assert.ok(explosions[i]! - explosions[i - 1]! >= 60000);
    const saved = JSON.parse(JSON.stringify(sim.g.state));
    const restored = restoredState(saved, sim.g.settings);
    assert.equal(restored.nextExplosionMs, sim.g.state.nextExplosionMs);
    assert.deepEqual(advance(restored, sim.g.settings, 100), advance(sim.g.state, sim.g.settings, 100), 'restored reactions remain deterministic');
    clean(sim);
  } finally { sim.close(); }
});

test('water show: same-stage complaints are at least five seconds apart, transitions interrupt', () => {
  const d = new Director(), spoken: number[] = []; let seq = 0;
  for (let t = 0; t < 30000; t += 100) {
    d.setClock(t);
    d.onEvent({ type: 'water', actor: 'Ela', anger: 'begging', changed: false, explosion: false }, () => 'Ela', 500);
    d.tick(t, 500, 600, true);
    if (d.current && seq !== d.current.seq) { seq = d.current.seq; spoken.push(t); }
  }
  assert.ok(spoken.length >= 4);
  for (let i = 1; i < spoken.length; i++) assert.ok(spoken[i]! - spoken[i - 1]! >= 5000);
  d.setClock(30000); d.onEvent({ type: 'water', actor: 'Ela', anger: 'explosion', changed: true, explosion: true }, () => 'Ela', 500);
  d.tick(30000, 500, 600, true); assert.equal(d.current?.mood, 'explosion');
});

test('water show: thresholds, slow recovery, old saves and all fixed speech warm-ups', () => {
  assert.deepEqual([-100, 5, 100].map(waterPercent), [100, 47, 0]);
  const cfg = defaultSettings(), base = freshState(cfg);
  assert.deepEqual([-71, -70, -46, -45, -21, -20, 5].map(c => multiplier({ ...base, consistency: c })), [0, .5, .5, .8, .8, 1.5, 1.5]);
  const next = advance({ ...base, consistency: -80 }, cfg, 250).state;
  assert.ok(next.consistency - -80 < .1);
  const old = JSON.parse(JSON.stringify(base));
  for (const k of ['anger', 'lastWaterMs', 'explosionUntilMs', 'nextExplosionMs', 'teams', 'rescuer']) delete old[k];
  assert.equal(restoredState(old, cfg).anger, 0);
  const warm = warmLines();
  for (const line of [...Object.values(WATER_LINES).flat(), ...Object.values(STAGE_LINES).flat(), ...BAIT, ...RESCUE, ...WATER_SHIELD]) {
    if (!line.includes('{')) assert.ok(warm.includes(line), line);
  }
  assert.ok(warm.every(l => !/[{}]/.test(l)));
});

test('a normal evening: 2 simulated hours of a busy room stays healthy and keeps talking', () => {
  const sim = new Sim(), r = rng(1);
  try {
    crowd(sim, r, 7200, 1.5);
    clean(sim);
    const s = sim.g.state, d = derive(s);
    assert.ok(s.mass > 50_000, `mass ${s.mass}`);
    assert.ok(sim.stats.maxQueue < 120, `queue entries peaked at ${sim.stats.maxQueue}`);
    sim.advance(60_000);
    assert.equal(derive(sim.g.state).queuedTotal, 0, 'a minute after the room goes quiet everything is poured');
    void d;
    assert.ok(s.recipesDone >= 1 && s.goalsDone >= 1, 'recipes and goals happen');
    assert.ok(sim.stats.speeches.size > 60, `variety: ${sim.stats.speeches.size} distinct lines`);
    for (const ing of INGREDIENTS) if (!ing.endsWith('_koruma')) assert.ok((s.totals[ing] ?? 0) > 0, `${ing} never performed`);
  } finally { sim.close(); }
});

test('gift storm: 20,000 gifts in one second from 5,000 viewers are bounded and drain', () => {
  const sim = new Sim(), r = rng(2);
  try {
    const t0 = performance.now();
    for (let i = 0; i < 20000; i++) sim.gift(`u${Math.floor(r() * 5000)}`, [1, 5, 10, 199][i % 4]!, 1 + (i % 7));
    const ingestMs = performance.now() - t0;
    clean(sim);
    assert.ok(sim.g.state.queue.length <= 320, `queue entries ${sim.g.state.queue.length}`);
    assert.ok(ingestMs / 20000 < 2, `ingest ${(ingestMs / 20000).toFixed(3)} ms/event`);
    const units = derive(sim.g.state).queuedTotal;
    // Batching means even a huge backlog clears in minutes, not hours.
    let waited = 0;
    while (derive(sim.g.state).queuedTotal > 0 && waited < 3600_000) { sim.advance(10_000); waited += 10_000; }
    clean(sim);
    assert.equal(derive(sim.g.state).queuedTotal, 0, `${units} units still queued after an hour`);
    assert.ok(waited <= 20 * 60_000, `drained ${units} units in ${waited / 60000} min`);
  } finally { sim.close(); }
});

test('whale: one 10,000-repeat bucket streak is capped and never stalls the game', () => {
  const sim = new Sim();
  try {
    for (const rep of [1, 50, 400, 3000, 10000, 10000]) sim.gift('whale', 500, rep, 'bucket', 'whale-streak');
    clean(sim);
    // 10,000 from the streak plus the free buckets its coins earned on the goal bar (and any of his own show buckets).
    const own = sim.g.state.queue.filter(q => q.actor === 'Cıvık Böcek' && q.ing === 'kova').reduce((a, q) => a + q.n, 0);
    assert.equal((derive(sim.g.state).queued.kova ?? 0) - own, 10000 + sim.g.state.goalsDone);
    sim.advance(30 * 60_000);
    clean(sim);
    assert.equal(derive(sim.g.state).queuedTotal, 0);
    assert.ok(sim.g.state.totals.kova! >= 10000 + sim.g.state.goalsDone);
    assert.ok(Number.isFinite(sim.g.state.mass));
  } finally { sim.close(); }
});

test('protection war: water attackers versus shield buyers, shields stay capped and water is blocked', () => {
  const sim = new Sim(), r = rng(3);
  try {
    let blocked = 0;
    for (let s = 0; s < 600; s++) {
      for (let i = 0; i < 4; i++) sim.gift(`att${Math.floor(r() * 50)}`, 1, 1);
      if (s % 3 === 0) sim.gift(`def${Math.floor(r() * 20)}`, 10, 3, '8913');
      sim.advance(1000);
      if (sim.g.state.lastAction?.blocked) blocked++;
    }
    clean(sim);
    assert.ok(sim.g.state.protect.su <= 180000);
    assert.ok(blocked > 50, `blocked ${blocked}`);
  } finally { sim.close(); }
});

test('only water and no protection: the slime runs, the character asks for borax, nothing breaks', () => {
  const sim = new Sim();
  try {
    for (let i = 0; i < 300; i++) { sim.gift(`w${i % 30}`, 1); sim.advance(300); }
    sim.advance(60_000);
    clean(sim);
    assert.ok(sim.g.state.consistency < -30, `consistency ${sim.g.state.consistency}`);
    assert.equal(need(sim.g.state).ing, 'boraks');
    assert.ok([...sim.stats.speeches].some(t => /boraks/i.test(t)), 'asked for borax');
  } finally { sim.close(); }
});

test('only chaos: ketchup, vinegar and eggs never reduce the mass', () => {
  const sim = new Sim(), r = rng(4);
  try {
    for (let i = 0; i < 2000; i++) { sim.gift(`c${i % 40}`, [50, 80, 99][Math.floor(r() * 3)]!); if (i % 5 === 0) sim.advance(1000); }
    sim.advance(10 * 60_000);
    clean(sim);
  } finally { sim.close(); }
});

test('extreme mass: a world-sized slime keeps finite numbers, sane milestone names and formatting', () => {
  let s: GameState = freshState(defaultSettings());
  const cfg = defaultSettings();
  for (const m of [1e6, 1e9, 1e12, 1e15, 1e18, 1e24, 1e30]) {
    s = { ...s, mass: m };
    s = enqueue(s, cfg, 'kova', 1000, 'A').state;
    for (let i = 0; i < 400; i++) s = advance(s, cfg, 100).state;
    assert.deepEqual(stateViolations(s, cfg), []);
    const ms = milestone(s.mass);
    assert.ok(Number.isFinite(ms.nextKg) && ms.nextKg > ms.floorKg, `milestone at ${m}`);
    assert.ok(ms.name.length < 24, `milestone name too long at ${m}: ${ms.name}`);
  }
});

test('pause, emergency stop and a dropped source mid-action freeze the game and lose nothing', () => {
  const sim = new Sim();
  try {
    for (let i = 0; i < 20; i++) sim.gift(`p${i}`, 199);
    sim.advance(1500);
    const before = derive(sim.g.state).queuedTotal, mass = sim.g.state.mass;
    sim.g.control('pause');
    assert.equal(sim.gift('late', 199).status, 'recorded_paused');
    sim.advance(60_000);
    assert.equal(sim.g.state.mass, mass); assert.equal(derive(sim.g.state).queuedTotal, before);
    sim.g.heartbeat('sim', true, sim.now); sim.g.control('resume');
    // Source silence for 46 s pauses a live game automatically.
    for (let t = 0; t < 46_000; t += 100) { sim.now += 100; sim.g.tick(100, sim.now); }
    assert.ok(sim.g.state.paused); assert.equal(sim.g.state.pauseReason, 'source_disconnected');
    sim.g.heartbeat('sim', true, sim.now);
    assert.equal(sim.g.state.paused, false, 'armed game resumes when the source returns');
    sim.g.control('panic'); assert.ok(sim.g.state.paused && !sim.g.armed);
    sim.g.heartbeat('sim', true, sim.now); assert.ok(sim.g.state.paused, 'panic is not undone by a heartbeat');
    clean(sim);
  } finally { sim.close(); }
});

test('settings changed mid-stream: smaller goal, removed rules, speed extremes, names off', () => {
  const sim = new Sim(undefined, { showNames: true });
  try {
    for (let i = 0; i < 300; i++) sim.gift(`s${i % 20}`, 10);
    sim.advance(5000);
    const s = defaultSettings();
    s.goalCoins = 10; s.speed = 4; s.showNames = false; s.giftRules = [{ giftId: '', minCoins: 1, ingredient: 'boncuk', units: 1, label: '' }];
    sim.g.configure(s);
    assert.ok(sim.g.state.queue.every(q => q.actor === 'Viewer'), 'names scrubbed from the queue');
    sim.gift('x', 1000);
    clean(sim);
    sim.advance(5 * 60_000);
    sim.g.configure({ ...s, speed: 0.25, goalCoins: 1_000_000 });
    for (let i = 0; i < 50; i++) sim.gift(`y${i}`, 1);
    sim.advance(5 * 60_000);
    clean(sim);
    assert.ok(sim.snapshot().menu.every(m => m.ing === 'boncuk'));
  } finally { sim.close(); }
});

test('restart in the middle of a storm keeps queue, goal, recipe and streak dedup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slime-restart-'));
  try {
    const path = join(dir, 'live.sqlite');
    let sim = new Sim(new Store(path));
    for (let i = 0; i < 2000; i++) sim.gift(`r${i % 300}`, [1, 10, 199][i % 3]!, 1, 'g', `streak-${i % 300}-${i % 3}`);
    sim.advance(31_000);
    const s1 = structuredClone(sim.g.state);
    sim.close();
    sim = new Sim(new Store(path), undefined, s1.elapsedMs ? Date.now() + 40_000 : Date.now());
    const s2 = sim.g.state;
    assert.deepEqual(s2.queue, s1.queue); assert.equal(s2.goalProgress, s1.goalProgress);
    assert.equal(s2.mass, s1.mass); assert.deepEqual(s2.recipe, s1.recipe);
    // Replayed streak frames after restart are recognised as duplicates.
    assert.equal(sim.gift('r5', 1, 1, 'g', 'streak-5-2').status, 'duplicate_streak');
    sim.advance(10_000);
    clean(sim);
    sim.close();
  } finally { rmSync(dir, { recursive: true }); }
});

test('streak frames out of order, repeated, ended early or decreasing count only once', () => {
  const sim = new Sim();
  try {
    const frames = [1, 3, 2, 3, 5, 4, 5, 5, 1];
    let coins = 0;
    for (const f of frames) coins += sim.gift('st', 10, f, 'sim', 'one').coins;
    assert.equal(coins, 50);
    assert.equal(derive(sim.g.state).queued.sim, 5);
    clean(sim);
  } finally { sim.close(); }
});

test('likes, follows and chat spam are rate limited and cannot outgrow paid gifts', () => {
  const sim = new Sim();
  try {
    const m0 = sim.g.state.mass;
    for (let s = 0; s < 600; s++) {
      for (let u = 0; u < 200; u++) sim.event({ kind: 'like', count: 15, user: { id: `l${u}`, name: 'l' } });
      for (let u = 0; u < 50; u++) sim.event({ kind: 'comment', command: '!yoğur', user: { id: `c${u}`, name: 'c' } });
      sim.event({ kind: 'follow', user: { id: 'f', name: 'f' } });
      sim.advance(1000, 10_000);
    }
    clean(sim);
    const free = sim.g.state.mass - m0;
    const paid = new Sim();
    try {
      for (let s = 0; s < 600; s++) { paid.gift(`p${s % 50}`, 199); paid.advance(1000, 60_000); }
      assert.ok(free < paid.g.state.mass, `free growth ${free} vs one tutkal per second ${paid.g.state.mass}`);
    } finally { paid.close(); }
  } finally { sim.close(); }
});

test('blocked viewers are recorded but never move the game', () => {
  const sim = new Sim();
  try {
    sim.g.store.block(pseudonym('sim-secret', 'troll'), true);
    const mass = sim.g.state.mass;
    for (let i = 0; i < 500; i++) assert.equal(sim.gift('troll', 500, 1).status, 'blocked');
    sim.event({ kind: 'like', count: 15, user: { id: 'troll', name: 't' } });
    sim.advance(10_000);
    assert.equal(derive(sim.g.state).queuedTotal, 0); assert.equal(sim.g.state.goalProgress, 0);
    assert.ok(sim.g.state.mass - mass < 1, 'no growth from a blocked viewer');
    assert.ok(sim.g.store.metrics().coins >= 250000, 'coins still audited');
    clean(sim);
  } finally { sim.close(); }
});

test('clock anomalies: zero, negative, NaN and huge deltas, and time going backwards', () => {
  const sim = new Sim();
  try {
    for (const d of [0, -1000, Number.NaN, Number.POSITIVE_INFINITY, 1e12]) sim.g.tick(d, sim.now);
    sim.now -= 3_600_000; sim.g.tick(100, sim.now); sim.gift('back', 199);
    sim.now += 7_200_000; sim.advance(2000);
    clean(sim);
    assert.ok(sim.g.state.elapsedMs < 10_000, `elapsed ${sim.g.state.elapsedMs}`);
  } finally { sim.close(); }
});

test('fuzz: random and hostile payloads only ever raise ValidationError', () => {
  const r = rng(9), now = Date.now();
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const junk = (): unknown => pick<unknown>([null, undefined, '', ' ', 'x'.repeat(500), -1, 0, 1e309, Number.NaN, true, [], {}, { a: 1 }, '!yoğur', '<script>', '‮', 2 ** 53 + 1, -0]);
  let ok = 0;
  for (let i = 0; i < 20000; i++) {
    const ev: Record<string, unknown> = { id: r() < 0.9 ? `id${i}` : junk(), source: pick(['tiktok', 'demo', 'webhook', 'evil', junk()]), roomId: r() < 0.9 ? 'room' : junk(),
      timestamp: r() < 0.8 ? now : junk(), kind: pick(['gift', 'like', 'comment', 'follow', 'share', junk()]),
      user: r() < 0.9 ? { id: r() < 0.9 ? `u${i}` : junk(), name: r() < 0.9 ? 'Ada' : junk() } : junk(),
      gift: r() < 0.8 ? { id: r() < 0.9 ? 'g' : junk(), name: 'Rose', coins: r() < 0.8 ? 1 + Math.floor(r() * 100) : junk(), repeat: r() < 0.8 ? 1 + Math.floor(r() * 10) : junk(), streakId: r() < 0.8 ? 's' : junk(), ended: r() < 0.9 ? false : junk() } : junk(),
      count: r() < 0.8 ? 5 : junk(), command: r() < 0.8 ? '!uzat' : junk() };
    try { parseEvent(ev, now); ok++; } catch (e) { assert.ok(e instanceof ValidationError, `unexpected ${String(e)} for ${JSON.stringify(ev)}`); }
  }
  assert.ok(ok > 1000, `some valid events got through (${ok})`);
  for (let i = 0; i < 3000; i++) {
    const s: Record<string, unknown> = { ...defaultSettings(), [pick(['speed', 'goalCoins', 'goalReward', 'recipeSeconds', 'locale', 'giftRules', 'showNames'])]: junk() };
    try { parseSettings(s); } catch (e) { assert.ok(e instanceof ValidationError, `settings: ${String(e)}`); }
  }
});

test('every ingredient works alone for an hour without violating anything', () => {
  for (const ing of INGREDIENTS) {
    const s = defaultSettings();
    s.giftRules = [{ giftId: '', minCoins: 1, ingredient: ing, units: 1, label: '' }];
    const sim = new Sim(undefined, s);
    try {
      for (let m = 0; m < 60; m++) { for (let i = 0; i < 20; i++) sim.gift(`u${i}`, 1); sim.advance(60_000, 30_000); }
      assert.deepEqual(sim.stats.violations.slice(0, 3), [], ing);
      if (CATALOG[ing].kind === 'protect') assert.equal(derive(sim.g.state).queuedTotal, 0);
    } finally { sim.close(); }
  }
});

// Phase B: the stream talks like a host — batched welcomes, thanks by name, filtered chat echo, free chat words.
const NAMES = ['Ada', 'Bora', 'Ceren', 'Deniz', 'Ece', 'Fatih', 'Gizem', 'Hakan', 'Irmak', 'Kaan', 'Lale', 'Mert'];

test('arrivals are welcomed in batches of at most five names, at most every six seconds', () => {
  const sim = new Sim(undefined, { showNames: true });
  try {
    // A burst lands in one line; a steady trickle over half a minute needs several.
    for (let i = 0; i < 36; i++) { sim.event({ kind: 'join', user: { id: `j${i}`, name: NAMES[i % NAMES.length]! } }); sim.advance(1_000, 500); }
    sim.advance(10_000, 500);
    const welcomes = sim.stats.spoken.filter(s => /hoş gel|memleket nereydi/i.test(s.text));
    assert.ok(welcomes.length >= 2, `${welcomes.length} welcome lines`);
    for (const w of welcomes) assert.ok(new Set(NAMES.filter(n => w.text.includes(n))).size <= 5 && w.text.length <= 60, w.text);
    for (let i = 1; i < welcomes.length; i++) assert.ok(welcomes[i]!.at - welcomes[i - 1]!.at >= 6000, 'welcomes are at least six seconds apart');
    clean(sim);
  } finally { sim.close(); }
  const anon = new Sim();
  try {
    for (let i = 0; i < 7; i++) anon.event({ kind: 'join', user: { id: `a${i}`, name: NAMES[i]! } });
    anon.advance(15_000, 500);
    // Names off: a welcome is still said, with no name in it.
    const anonWelcomes = anon.stats.spoken.filter(s => /hoş gelin|divalar geliyor/i.test(s.text));
    assert.ok(anonWelcomes.length > 0, 'names off: a nameless welcome');
    assert.ok(anonWelcomes.every(s => !NAMES.some(n => s.text.includes(n))), 'names off: no name is spoken');
    assert.ok(!anon.stats.spoken.some(s => NAMES.some(n => s.text.includes(n))), 'names off: no name is spoken');
  } finally { anon.close(); }
});

test('chat echo reads only short filtered comments, at most every twenty seconds, and only when allowed', () => {
  const sim = new Sim(undefined, { showNames: true, chatEcho: true });
  try {
    sim.event({ kind: 'comment', text: 'bak www.site.com gel', user: { id: 'c1', name: 'Ada' } });
    sim.event({ kind: 'comment', text: 'amk slime', user: { id: 'c2', name: 'Bora' } });
    sim.advance(8_000, 500);
    assert.ok(!sim.stats.spoken.some(s => /diyor ki/.test(s.text)), 'links and blocked words are never read');
    for (let i = 0; i < 6; i++) { sim.event({ kind: 'comment', text: `dayı bu ne güzel olmuş ${i}`, user: { id: `e${i}`, name: NAMES[i]! } }); sim.advance(2_000, 500); }
    sim.advance(10_000, 500);
    const echoes = sim.stats.spoken.filter(s => /diyor ki/.test(s.text));
    assert.ok(echoes.length >= 1 && echoes.length <= 2, `${echoes.length} echoes in ~22 s`);
    for (let i = 1; i < echoes.length; i++) assert.ok(echoes[i]!.at - echoes[i - 1]!.at >= 20_000);
    assert.match(echoes[0]!.text, /^\S+ diyor ki: dayı bu ne güzel olmuş \d$/);
  } finally { sim.close(); }
  for (const settings of [{ showNames: true, chatEcho: false }, { showNames: false, chatEcho: true }]) {
    const off = new Sim(undefined, settings);
    try {
      for (let i = 0; i < 4; i++) { off.event({ kind: 'comment', text: 'merhaba dayı', user: { id: `o${i}`, name: 'Ada' } }); off.advance(5_000, 500); }
      assert.ok(!off.stats.spoken.some(s => /diyor ki/.test(s.text)), JSON.stringify(settings));
    } finally { off.close(); }
  }
});

test('chat words are free actions, rate limited per viewer and weaker than a paid unit', () => {
  const sim = new Sim(undefined, { showNames: true });
  try {
    const before = sim.g.state.consistency;
    assert.equal(sim.event({ kind: 'comment', command: 'su', user: { id: 'w1', name: 'Ada' } }).status, 'applied');
    const free = sim.g.state.consistency - before;
    assert.ok(free < 0 && free >= CATALOG.su.consistency / 3 - 1e-9, `free water moved consistency by ${free}`);
    assert.notEqual(sim.event({ kind: 'comment', command: 'su', user: { id: 'w1', name: 'Ada' } }).status, 'applied', 'second word inside 20 s is ignored');
    sim.advance(21_000);
    assert.equal(sim.event({ kind: 'comment', command: 'su', user: { id: 'w1', name: 'Ada' } }).status, 'applied', 'allowed again after 20 s');
    assert.equal(sim.g.state.queue.length, 0, 'free words never enter the paid queue');
    const r = sim.event({ kind: 'comment', text: 'slime ekle', user: { id: 'w2', name: 'Bora' } });
    assert.equal(r.status, 'applied');
    assert.equal(sim.g.state.gesture?.pour, 'tutkal');
  } finally { sim.close(); }
  const off = new Sim(undefined, { chatActions: false });
  try { assert.notEqual(off.event({ kind: 'comment', command: 'su', user: { id: 'w3', name: 'Can' } }).status, 'applied'); } finally { off.close(); }
});

test('a follow thanks the viewer by name and pours slime; gifts are thanked by their real name', () => {
  const sim = new Sim(undefined, { showNames: true });
  try {
    sim.event({ kind: 'follow', user: { id: 'f1', name: 'Belinay' } });
    assert.equal(sim.g.state.gesture?.pour, 'tutkal');
    sim.advance(6_000, 500);
    assert.ok(sim.stats.spoken.some(s => /Belinay/.test(s.text) && /slime ekliyorum/.test(s.text)), [...sim.stats.speeches].join(' | '));
    sim.event({ kind: 'gift', user: { id: 'g1', name: 'Ela' }, gift: { id: '5487', name: 'Finger Heart', coins: 5, repeat: 1, streakId: 's1' } });
    sim.advance(8_000, 500);
    assert.ok(sim.stats.spoken.some(s => /Ela/.test(s.text) && /Finger Heart/.test(s.text)), [...sim.stats.speeches].join(' | '));
    clean(sim);
  } finally { sim.close(); }
});

test('join and comment text validate at the server boundary', () => {
  const base = { id: 'x', source: 'tiktok', roomId: 'r', timestamp: Date.now(), user: { id: 'u', name: 'n' } };
  assert.equal(parseEvent({ ...base, kind: 'join' }).kind, 'join');
  assert.equal(parseEvent({ ...base, kind: 'comment', text: 'bak www.site.com' }).text, undefined);
  assert.equal(parseEvent({ ...base, kind: 'comment', text: 'slime ekle' }).command, '!slime');
  assert.throws(() => parseEvent({ ...base, kind: 'comment', text: 'x'.repeat(201) }), ValidationError);
});

// Phase A fixes from the live browser check: pacing of the anger, tone, rescue thanks, shorter shields.
const CHEERFUL_WATER = /su geliyor|Su ekliyoruz|Bir bardak su|Su mu\? Peki|Şıpır şıpır|Musluğu açtık|için!|geldi!$/;

test('a steady water storm walks through every anger stage in order and is heard at each one', () => {
  const sim = new Sim(undefined, { showNames: true, goalCoins: 1_000_000 });
  try {
    const stages: { at: number; stage: string }[] = [];
    for (let s = 0; s < 90; s++) {
      sim.gift(NAMES[s % 4]!, 1, 1, '5655', `w${s}`);
      sim.advance(1_000, 500);
      const stage = angerStage(sim.g.state.anger);
      if (stages.at(-1)?.stage !== stage) stages.push({ at: s, stage });
    }
    const order = stages.map(x => x.stage);
    assert.deepEqual(order.slice(0, 5), ['calm', 'request', 'begging', 'angry', 'explosion'], order.join(' → '));
    for (let i = 1; i < 4; i++) assert.ok(stages[i + 1]!.at - stages[i]!.at >= 6, `${stages[i]!.stage} lasted ${stages[i + 1]!.at - stages[i]!.at} s`);
    const boom = stages.find(x => x.stage === 'explosion')!.at;
    assert.ok(boom >= 20 && boom <= 60, `explosion after ${boom} s`);
    // The explosion is a moment: he settles to angry and does not explode again during the cooldown.
    const after = stages.filter(x => x.at > boom);
    assert.equal(after[0]?.stage, 'angry');
    assert.ok(!after.some(x => x.stage === 'explosion' && x.at < boom + 55), after.map(x => `${x.at}:${x.stage}`).join(' '));
    const angryLines = sim.stats.spoken.filter(x => x.at > sim.now - 60_000);
    assert.ok(!angryLines.some(x => CHEERFUL_WATER.test(x.text)), angryLines.map(x => x.text).join(' | '));
    clean(sim);
  } finally { sim.close(); }
});

test('a named rescue is thanked out loud, even in the middle of a storm', () => {
  const sim = new Sim(undefined, { showNames: true, goalCoins: 1_000_000 });
  try {
    for (let s = 0; s < 45; s++) { sim.gift(NAMES[s % 4]!, 1, 1, '5655', `w${s}`); sim.advance(1_000, 500); }
    assert.ok(sim.g.state.consistency < -45, `storm left consistency at ${sim.g.state.consistency}`);
    const from = sim.now;
    sim.gift('Selin', 20, 1, '5487', 'r1');
    for (let s = 0; s < 12; s++) { sim.gift(NAMES[s % 4]!, 1, 1, '5655', `x${s}`); sim.advance(1_000, 500); }
    const lines = sim.stats.spoken.filter(x => x.at >= from);
    assert.ok(lines.some(x => /Selin/.test(x.text) && RESCUE.some(r => r.split('{ad}')[1] && x.text.includes(r.split('{ad}')[1]!.trim().slice(0, 12)))), lines.map(x => x.text).join(' | '));
  } finally { sim.close(); }
});

test('water shields are short: eight seconds a unit, capped at forty-five', () => {
  const s = freshState(defaultSettings());
  let out = enqueue(s, defaultSettings(), 'su_koruma', 1, 'a').state;
  assert.equal(out.protect.su, 8000);
  out = enqueue(out, defaultSettings(), 'su_koruma', 50, 'b').state;
  assert.equal(out.protect.su, 45000);
});
