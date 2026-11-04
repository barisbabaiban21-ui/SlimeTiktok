/**
 * Synthetic play harness: a virtual clock, a live-mode game service and invariant checks
 * that run after every step. Used by tests/scenarios.test.ts and scripts/soak.mjs.
 */
import { Store } from '../src/server/store.js';
import { GameService } from '../src/server/service.js';
import { derive, goalTarget } from '../src/shared/engine.js';
import { MAX_QUEUE_ENTRIES, PROTECT_MAX_MS, BONUS_MS } from '../src/shared/ingredients.js';
import { INGREDIENTS, PROTECTABLE } from '../src/shared/types.js';
import type { GameState, LiveEvent, PublicSnapshot, Settings } from '../src/shared/types.js';

export function stateViolations(s: GameState, settings: Settings): string[] {
  const v: string[] = [];
  const num = (name: string, x: unknown, lo = -Infinity, hi = Infinity) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) v.push(`${name} not finite: ${String(x)}`);
    else if (x < lo || x > hi) v.push(`${name} out of range: ${x}`);
  };
  num('mass', s.mass, 0); num('consistency', s.consistency, -100, 100); num('fluff', s.fluff, 0, 100);
  num('sparkle', s.sparkle, 0, 100); num('beads', s.beads, 0, 100); num('hue', s.hue, 0, 360);
  num('anger', s.anger, 0, 100); num('teams.water', s.teams.water, 0); num('teams.rescue', s.teams.rescue, 0);
  num('explosionUntilMs', s.explosionUntilMs, 0); num('nextExplosionMs', s.nextExplosionMs, 0);
  num('bonusMs', s.bonusMs, 0, BONUS_MS); num('goalProgress', s.goalProgress, 0);
  if (s.goalProgress >= goalTarget(settings, s)) v.push(`goalProgress ${s.goalProgress} ≥ goal ${goalTarget(settings, s)}`);
  for (const k of ['ketcap', 'yumurta', 'sirke'] as const) num(`stains.${k}`, s.stains[k], 0, 100);
  for (const p of PROTECTABLE) num(`protect.${p}`, s.protect[p], 0, PROTECT_MAX_MS);
  if (s.queue.length > MAX_QUEUE_ENTRIES + 20) v.push(`queue too long: ${s.queue.length}`);
  for (const q of s.queue) {
    if (!INGREDIENTS.includes(q.ing)) v.push(`bad queue ingredient ${q.ing}`);
    if (!Number.isInteger(q.n) || q.n <= 0) v.push(`bad queue count ${q.n}`);
    if (q.ing.endsWith('_koruma')) v.push('a protection entered the queue');
  }
  if (s.current) { num('current.n', s.current.n, 1); num('current.durationMs', s.current.durationMs, 1, 60000); }
  if (s.recipe) for (const [k, n] of Object.entries(s.recipe.items)) if ((s.recipe.got[k as never] ?? 0) > (n ?? 0)) v.push('recipe over-filled');
  return v;
}
export function snapshotViolations(p: PublicSnapshot): string[] {
  const v: string[] = [];
  const json = JSON.stringify(p);
  if (Buffer.byteLength(json) >= 32768) v.push(`snapshot ${Buffer.byteLength(json)} bytes`);
  if (/NaN|Infinity/.test(json)) v.push('snapshot contains NaN/Infinity');
  if ('queue' in p.game) v.push('raw queue leaked');
  if (p.menu.filter(m => m.needed).length > 1) v.push('more than one needed item');
  if (p.speech && (/\{\w+\}/.test(p.speech.text) || p.speech.text.length > 220 || /\s,|,\s*[!?.]|^\s*,/.test(p.speech.text))) v.push(`bad speech: ${p.speech.text}`);
  return v;
}

export interface SimStats { gifts: number; coins: number; ticks: number; speeches: Set<string>; spoken: { at: number; text: string }[]; violations: string[]; maxQueue: number; maxQueueUnits: number; maxSnapshot: number }
export class Sim {
  readonly g: GameService;
  now: number;
  private seq = 0;
  /** Event ids must stay unique across restarts of the same database. */
  private readonly session = Math.random().toString(36).slice(2, 8);
  private lastMass: number;
  private lastHeartbeat = 0;
  private lastSpeech = -1;
  readonly stats: SimStats = { gifts: 0, coins: 0, ticks: 0, speeches: new Set(), spoken: [], violations: [], maxQueue: 0, maxQueueUnits: 0, maxSnapshot: 0 };
  constructor(store = new Store(':memory:'), settings?: Partial<Settings>, start = Date.now()) {
    this.now = start;
    this.g = new GameService(store, 'live', 'sim-secret');
    if (settings) this.g.configure({ ...this.g.settings, ...settings });
    this.g.heartbeat('sim', true, this.now); this.g.control('resume');
    this.lastMass = this.g.state.mass;
  }
  private check(where: string): void {
    const s = this.g.state;
    if (s.mass + 1e-6 < this.lastMass) this.stats.violations.push(`${where}: mass decreased ${this.lastMass} → ${s.mass}`);
    this.lastMass = s.mass;
    for (const x of stateViolations(s, this.g.settings)) this.stats.violations.push(`${where}: ${x}`);
    this.stats.maxQueue = Math.max(this.stats.maxQueue, s.queue.length);
    this.stats.maxQueueUnits = Math.max(this.stats.maxQueueUnits, derive(s).queuedTotal);
  }
  /** Advances the virtual clock in the server's own 100 ms steps. */
  advance(ms: number, snapshotEvery = 2500): void {
    for (let t = 0; t < ms; t += 100) {
      this.now += 100;
      if (this.now - this.lastHeartbeat >= 10000) { this.g.heartbeat('sim', true, this.now); this.lastHeartbeat = this.now; }
      this.g.tick(100, this.now); this.stats.ticks++;
      if (this.stats.ticks % (snapshotEvery / 100) === 0) this.snapshot();
      if (this.stats.violations.length > 50) return;
    }
    this.check('tick');
  }
  snapshot(): PublicSnapshot {
    const p = this.g.public(this.now);
    this.stats.maxSnapshot = Math.max(this.stats.maxSnapshot, JSON.stringify(p).length);
    for (const x of snapshotViolations(p)) this.stats.violations.push(`snapshot: ${x}`);
    if (p.speech && p.speech.seq !== this.lastSpeech) { this.lastSpeech = p.speech.seq; this.stats.speeches.add(p.speech.text); this.stats.spoken.push({ at: this.now, text: p.speech.text }); }
    return p;
  }
  event(e: Omit<LiveEvent, 'id' | 'source' | 'roomId' | 'timestamp'> & { id?: string }): ReturnType<GameService['ingest']> {
    const r = this.g.ingest({ id: e.id ?? `${this.session}-${++this.seq}`, source: 'tiktok', roomId: 'room', timestamp: this.now, ...e } as LiveEvent, this.now);
    this.check(`event ${e.kind}`);
    return r;
  }
  gift(user: string, coins: number, repeat = 1, giftId = `g${coins}`, streakId?: string): ReturnType<GameService['ingest']> {
    const r = this.event({ kind: 'gift', user: { id: user, name: user }, gift: { id: giftId, name: giftId, coins, repeat, streakId: streakId ?? `${user}-${++this.seq}` } });
    if (r.coins > 0) { this.stats.gifts++; this.stats.coins += r.coins; }
    return r;
  }
  close(): void { this.g.close(); }
}
/** Small deterministic PRNG so failures reproduce. */
export function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
/** A TikTok-like room: mostly 1-coin roses, occasional big gifts, streaks, likes, chat. */
export function crowd(sim: Sim, r: () => number, seconds: number, giftsPerSecond: number, users = 400): void {
  // Weighted like a real room: roses everywhere, mid gifts sometimes, big ones rarely.
  // TikTok's real price steps (catalog 2026-11-04), cheap gifts dominating.
  const coinsTable = [...Array(30).fill(1), ...Array(6).fill(5), 10, 10, 15, 20, 30, 99, 100, 149, 199, 249, 299, 349, 500];
  for (let s = 0; s < seconds; s++) {
    const n = Math.floor(giftsPerSecond) + (r() < giftsPerSecond % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const u = `u${Math.floor(r() * users)}`, coins = coinsTable[Math.floor(r() * coinsTable.length)]!;
      const repeat = coins <= 5 && r() < 0.3 ? 1 + Math.floor(r() * 30) : 1;
      sim.gift(u, coins, repeat);
    }
    if (r() < 0.6) sim.event({ kind: 'like', count: 1 + Math.floor(r() * 15), user: { id: `u${Math.floor(r() * users)}`, name: 'liker' } });
    if (r() < 0.2) sim.event({ kind: 'comment', command: r() < 0.5 ? '!yoğur' : '!uzat', user: { id: `u${Math.floor(r() * users)}`, name: 'chat' } });
    if (r() < 0.02) sim.event({ kind: 'follow', user: { id: `u${Math.floor(r() * users)}`, name: 'fan' } });
    sim.advance(1000);
  }
}
