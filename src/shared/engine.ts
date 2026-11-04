import { clamp, INGREDIENTS, PROTECTABLE } from './types.js';
import type { AngerStage, Degradation, Derived, GameState, IngredientId, Milestone, Need, PerformedAction, Protectable, QueueItem, Recipe, RescueIngredient, Settings } from './types.js';
import { BONUS_MS, CATALOG, MAX_GRAMS_PER_ACTION, MAX_QUEUE_ENTRIES, PAINTS, PROTECT_MAX_MS, PROTECT_MS_PER_UNIT, RECIPE_POOL } from './ingredients.js';

/** Pure, deterministic simulation. All gameplay time advances on the server. */
export type EngineEvent =
  | { type: 'started'; action: GameState['current'] & {} }
  | { type: 'performed'; action: PerformedAction }
  | { type: 'protected'; target: Protectable; actor: string; ms: number; giftName?: string }
  | { type: 'milestone'; milestone: Milestone }
  | { type: 'recipe_new'; recipe: Recipe }
  | { type: 'recipe_done'; recipe: Recipe }
  | { type: 'recipe_failed'; recipe: Recipe }
  | { type: 'water'; actor: string; anger: AngerStage; changed: boolean; explosion: boolean }
  | { type: 'degradation'; stage: Degradation; actor: string }
  | { type: 'rescued'; actor: string; ing: RescueIngredient }
  | { type: 'goal'; reward: IngredientId; count: number };

export const IDEAL_CONSISTENCY = 5;
/** Roughly ten gifted units in the last couple of minutes before a recipe call opens. */
export const RECIPE_MIN_ACTIVITY = 10;
export const EXPLOSION_COOLDOWN_MS = 60000, EXPLOSION_MS = 3500, RESCUER_MS = 8000, ANGER_DWELL_MS = 6000;
/** Anger needed to enter request, begging, angry and explosion. */
const ANGER_STEPS = [20, 45, 70, 90] as const;
export const DEGRADATION_NAMES: Record<Degradation, string> = { good: 'Kıvamında', loose: 'Cıvık', flowing: 'Akıyor', soup: 'Çorba' };
const START_MASS = 500;

export function degradation(c: number): Degradation { return c < -70 ? 'soup' : c < -45 ? 'flowing' : c < -20 ? 'loose' : 'good'; }
export function angerStage(n: number): AngerStage { return n >= 90 ? 'explosion' : n >= 70 ? 'angry' : n >= 45 ? 'begging' : n >= 20 ? 'request' : 'calm'; }
/** Water percentage is a view of consistency, never a second source of truth. */
export function waterPercent(c: number): number { return Math.floor(clamp((100 - c) / 2, 0, 100)); }

function waterReaction(state: GameState, n: number, before: number, actor: string, events: EngineEvent[]): void {
  const prev = angerStage(state.anger);
  // A merged pour of many waters counts like a pour or two, so the begging is heard before the explosion.
  let next = state.anger + (before < -20 ? 9 : 5) * Math.min(1.4, Math.sqrt(n));
  // Stages are never skipped, and each one holds for a few seconds.
  const i = ANGER_STEPS.filter(t => state.anger >= t).length;
  if (i < ANGER_STEPS.length) next = Math.min(next, (state.elapsedMs - state.angerStageMs < ANGER_DWELL_MS ? ANGER_STEPS[i]! : ANGER_STEPS[i + 1] ?? 101) - 0.01);
  // After an explosion he stays angry, not exploding, until the cooldown ends.
  if (state.elapsedMs < state.nextExplosionMs) next = Math.min(next, 85);
  state.anger = clamp(next, 0, 100);
  if (angerStage(state.anger) !== prev) state.angerStageMs = state.elapsedMs;
  state.lastWaterMs = state.elapsedMs; state.teams.water += n;
  const explosion = state.anger >= 90 && state.elapsedMs >= state.nextExplosionMs;
  if (explosion) { state.explosionUntilMs = state.elapsedMs + EXPLOSION_MS; state.nextExplosionMs = state.elapsedMs + EXPLOSION_COOLDOWN_MS; }
  events.push({ type: 'water', actor, anger: angerStage(state.anger), changed: prev !== angerStage(state.anger), explosion });
}
function rescue(state: GameState, ing: RescueIngredient, n: number, before: number, actor: string, events: EngineEvent[]): void {
  const prev = angerStage(state.anger);
  state.anger = Math.max(0, state.anger - 10 * n); state.teams.rescue += n;
  if (angerStage(state.anger) !== prev) state.angerStageMs = state.elapsedMs;
  if (before < -45) {
    state.rescuer = { actor, ing, untilMs: state.elapsedMs + RESCUER_MS };
    events.push({ type: 'rescued', actor, ing });
  }
}

export function freshState(settings: Settings): GameState {
  return {
    version: 2, elapsedMs: 0, simulatedMs: 0, mass: START_MASS,
    consistency: IDEAL_CONSISTENCY, fluff: 0, sparkle: 0, hue: 36,
    anger: 0, lastWaterMs: 0, explosionUntilMs: 0, nextExplosionMs: 0, angerStageMs: 0, teams: { water: 0, rescue: 0 }, rescuer: null,
    stains: { ketcap: 0, yumurta: 0, sirke: 0 },
    queue: [], current: null, protect: { su: 0, ketcap: 0, yumurta: 0 },
    recipe: null, recipeSeq: 0, nextRecipeMs: Math.min(30000, settings.recipeEverySec * 1000), recipesDone: 0, bonusMs: 0,
    beads: 0, goalProgress: 0, goalsDone: 0, recentUnits: 0,
    totals: {}, actions: 0, paused: false, pauseReason: '', lastAction: null, gesture: null
  };
}

/** Kilogram floors. Past the list the slime keeps going in x10 steps forever. */
const STAGES: [number, string][] = [
  [0, 'Kase'], [2, 'Masa'], [15, 'Masadan taşıyor'], [60, 'Yere yayıldı'], [250, 'Oda'],
  [1000, 'Kapıdan çıktı'], [5000, 'Apartman'], [25000, 'Sokak'], [100000, 'Mahalle'],
  [500000, 'İlçe'], [2500000, 'Şehir'], [15000000, 'Bölge'], [100000000, 'Ülke'], [1e9, 'Kıta'], [1e10, 'Dünya']
];
export function milestone(grams: number): Milestone {
  const kg = Math.max(0, grams / 1000);
  let index = 0;
  while (index + 1 < STAGES.length && kg >= STAGES[index + 1]![0]) index++;
  let floorKg = STAGES[index]![0], name = STAGES[index]![1], nextKg: number;
  if (index === STAGES.length - 1) {
    const extra = Math.floor(Math.log10(Math.max(1, kg / floorKg)));
    floorKg = floorKg * 10 ** extra; nextKg = floorKg * 10; index += extra;
    if (extra > 0) name = `Dünya ×10${String(extra + 0).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]).join('')}`;
  } else nextKg = STAGES[index + 1]![0];
  const progress = clamp((kg - floorKg) / (nextKg - floorKg), 0, 1);
  return { index, name, floorKg, nextKg, progress };
}
export function texture(consistency: number): Derived['texture'] {
  if (consistency < -50) return 'runny';
  if (consistency > 60) return 'rubbery';
  return Math.abs(consistency - IDEAL_CONSISTENCY) <= 25 ? 'perfect' : 'normal';
}
export function multiplier(state: GameState): number {
  const t = texture(state.consistency), stage = degradation(state.consistency);
  const tex = stage === 'soup' ? 0 : stage === 'flowing' ? 0.5 : stage === 'loose' ? 0.8 : t === 'perfect' ? 1.5 : t === 'rubbery' ? 0.6 : 1;
  return tex * (state.bonusMs > 0 ? 2 : 1);
}
/** Bigger slime, bigger handfuls: incremental scaling, bounded per action. */
export function growthFactor(mass: number): number { return 1 + Math.sqrt(Math.max(0, mass) / 1000) / 4; }

function hash(n: number): number {
  let x = (n + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
export function makeRecipe(id: number, endsMs: number): Recipe {
  const pool = [...RECIPE_POOL], items: Recipe['items'] = {};
  let h = hash(id);
  for (let i = 0; i < 3; i++) {
    const pick = pool.splice(h % pool.length, 1)[0]!;
    items[pick] = 1 + ((h >>> 8) % 3);
    h = hash(h);
  }
  return { id, items, got: {}, endsMs };
}
export function recipeComplete(r: Recipe): boolean {
  return Object.entries(r.items).every(([k, need]) => (r.got[k as IngredientId] ?? 0) >= (need ?? 0));
}
export function queuedTotal(state: GameState): number { return state.queue.reduce((a, q) => a + q.n, 0); }

/** Accepts gift units. Protections apply instantly; everything else waits for the character. */
export function enqueue(input: GameState, settings: Settings, ing: IngredientId, units: number, actor: string, giftName?: string): { state: GameState; events: EngineEvent[] } {
  const state = structuredClone(input), events: EngineEvent[] = [];
  if (state.paused || !Number.isFinite(units) || units <= 0) return { state, events };
  const n = Math.floor(clamp(units, 1, 10000)), def = CATALOG[ing];
  state.recentUnits = Math.min(1000, (state.recentUnits ?? 0) + Math.min(n, 20));
  if (def.kind === 'protect' && def.protects) {
    const ms = Math.min(PROTECT_MAX_MS, state.protect[def.protects] + n * PROTECT_MS_PER_UNIT) - state.protect[def.protects];
    state.protect[def.protects] += ms;
    state.totals[ing] = (state.totals[ing] ?? 0) + n;
    events.push({ type: 'protected', target: def.protects, actor, ms, ...(giftName ? { giftName } : {}) });
    if (ing === 'su_koruma') rescue(state, ing, n, state.consistency, actor, events);
  } else {
    const last = state.queue[state.queue.length - 1];
    if (last && last.ing === ing && last.actor === actor && last.giftName === giftName) last.n += n;
    else if (state.queue.length >= MAX_QUEUE_ENTRIES) {
      // Full backlog: fold into the newest entry of the same ingredient, else into the newest entry.
      const same = [...state.queue].reverse().find(q => q.ing === ing);
      if (same) same.n += n; else state.queue.push({ ing, actor, n, ...(giftName ? { giftName } : {}) });
      if (state.queue.length > MAX_QUEUE_ENTRIES + 20) state.queue.splice(MAX_QUEUE_ENTRIES, state.queue.length - MAX_QUEUE_ENTRIES);
    } else state.queue.push({ ing, actor, n, ...(giftName ? { giftName } : {}) });
  }
  if (state.recipe && state.recipe.items[ing]) {
    state.recipe.got[ing] = Math.min(state.recipe.items[ing]!, (state.recipe.got[ing] ?? 0) + n);
    if (recipeComplete(state.recipe)) {
      events.push({ type: 'recipe_done', recipe: state.recipe });
      state.recipesDone++; state.bonusMs = BONUS_MS; state.recipe = null;
      state.nextRecipeMs = state.elapsedMs + settings.recipeEverySec * 1000;
    }
  }
  return { state, events };
}

/** Free interactions: tiny direct effects, never queued, never blocked. */
/** scale (0..1) lets the service ration free growth across a whole room. */
export function freeAction(input: GameState, kind: 'like' | 'follow' | 'command', amount: number, actor: string, command = '', scale = 1): GameState {
  const state = structuredClone(input);
  if (state.paused || !Number.isFinite(scale) || scale <= 0) return state;
  const grams = (kind === 'follow' ? 300 : kind === 'command' ? 40 : clamp(amount, 1, 30) / 2) * clamp(scale, 0, 1);
  if (degradation(state.consistency) !== 'soup') state.mass += grams * growthFactor(state.mass);
  if (kind === 'like') state.consistency += (IDEAL_CONSISTENCY - state.consistency) * (state.consistency < -45 ? 0.004 : 0.02) * clamp(scale, 0, 1);
  if (kind !== 'like') {
    const type = kind === 'follow' ? 'wave' : command === '!uzat' || command === '!stretch' || command === 'uzat' ? 'stretch' : 'knead';
    state.gesture = { seq: (state.gesture?.seq ?? 0) + 1, type, actor, atMs: state.elapsedMs, ...(kind === 'follow' || command === '!slime' ? { pour: 'tutkal' as const } : {}) };
  }
  return state;
}

/** A chat ingredient is at most a third of a paid unit; it never enters the gift queue. */
export function freeIngredient(input: GameState, ing: 'su' | 'boraks' | 'tiras_kopugu', actor: string, scale: number): { state: GameState; events: EngineEvent[] } {
  const state = structuredClone(input), events: EngineEvent[] = [];
  if (state.paused || !Number.isFinite(scale) || scale <= 0) return { state, events };
  const share = clamp(scale, 0, 1), units = share / 3, def = CATALOG[ing], before = state.consistency;
  const blocked = ing === 'su' && state.protect.su > 0;
  state.gesture = { seq: (state.gesture?.seq ?? 0) + 1, type: 'knead', actor, pour: ing, atMs: state.elapsedMs, blocked };
  if (!blocked) {
    if (degradation(before) !== 'soup') state.mass += Math.min(40, def.grams / 3) * share * growthFactor(state.mass);
    state.consistency = clamp(before + def.consistency * units, -100, 100);
    state.fluff = clamp(state.fluff + def.fluff * units, 0, 100);
    if (ing === 'su') waterReaction(state, units, before, actor, events);
    if (ing === 'boraks') rescue(state, ing, units, before, actor, events);
    if (degradation(before) !== degradation(state.consistency)) events.push({ type: 'degradation', stage: degradation(state.consistency), actor });
  }
  return { state, events };
}

function startNext(state: GameState, settings: Settings, events: EngineEvent[]): void {
  const head = state.queue[0];
  if (!head) return;
  const total = queuedTotal(state);
  const batch = Math.max(1, Math.floor(total / 8));
  // One pour serves everyone near the front who sent the same ingredient, so a room full of
  // single roses from different viewers does not wait in line one rose at a time.
  let n = 0;
  for (let i = 0; i < state.queue.length && i < 40 && n < batch; i++) {
    const q = state.queue[i]!;
    if (q.ing !== head.ing) continue;
    const k = Math.min(q.n, batch - n); q.n -= k; n += k;
  }
  state.queue = state.queue.filter(q => q.n > 0);
  const def = CATALOG[head.ing];
  const blocked = def.kind === 'risky' && PROTECTABLE.includes(head.ing as Protectable) && state.protect[head.ing as Protectable] > 0;
  const rush = 1 + Math.min(3, Math.log2(1 + total) / 3);
  const durationMs = Math.round((blocked ? 1400 : def.durationMs) / clamp(settings.speed, 0.25, 4) / rush);
  state.current = { seq: state.actions + 1, ing: head.ing, actor: head.actor, n, startedMs: state.elapsedMs, durationMs, blocked, ...(head.giftName ? { giftName: head.giftName } : {}) };
  events.push({ type: 'started', action: { ...state.current } });
}

function perform(state: GameState, events: EngineEvent[]): void {
  const c = state.current!;
  state.current = null; state.actions++;
  const def = CATALOG[c.ing];
  let grams = 0;
  if (!c.blocked) {
    const before = milestone(state.mass).index;
    const consistency = state.consistency;
    const root = Math.sqrt(c.n);
    grams = Math.min(MAX_GRAMS_PER_ACTION, def.grams * c.n * growthFactor(state.mass) * multiplier(state));
    state.mass += grams;
    state.consistency = clamp(state.consistency + def.consistency * root, -100, 100);
    if (c.ing === 'su') waterReaction(state, c.n, consistency, c.actor, events);
    if (c.ing === 'boraks' || c.ing === 'tutkal') rescue(state, c.ing, c.n, consistency, c.actor, events);
    if (degradation(consistency) !== degradation(state.consistency)) events.push({ type: 'degradation', stage: degradation(state.consistency), actor: c.actor });
    state.fluff = clamp(state.fluff + def.fluff * root, 0, 100);
    state.sparkle = clamp(state.sparkle + def.sparkle * root, 0, 100);
    if (c.ing === 'ketcap') state.stains.ketcap = clamp(state.stains.ketcap + def.chaos * root, 0, 100);
    if (c.ing === 'yumurta') state.stains.yumurta = clamp(state.stains.yumurta + def.chaos * root, 0, 100);
    if (c.ing === 'boncuk') state.beads = clamp(state.beads + 18 * root, 0, 100);
    if (c.ing === 'sirke') state.stains.sirke = clamp(state.stains.sirke + def.chaos * root, 0, 100);
    if (c.ing === 'boya') state.hue = PAINTS[(state.totals.boya ?? 0) % PAINTS.length]!;
    state.totals[c.ing] = (state.totals[c.ing] ?? 0) + c.n;
    const after = milestone(state.mass);
    if (after.index > before) events.push({ type: 'milestone', milestone: after });
  } else state.totals[c.ing] = (state.totals[c.ing] ?? 0) + c.n;
  state.lastAction = { seq: c.seq, ing: c.ing, actor: c.actor, n: c.n, grams, blocked: c.blocked };
  events.push({ type: 'performed', action: { ...state.lastAction } });
}

export function advance(input: GameState, settings: Settings, deltaMs: number): { state: GameState; events: EngineEvent[] } {
  const state = structuredClone(input), events: EngineEvent[] = [];
  if (state.paused || !Number.isFinite(deltaMs) || deltaMs <= 0) return { state, events };
  // A stalled process cannot fast-forward or award offline progress.
  const ms = clamp(deltaMs, 0, 250), dt = ms / 1000;
  state.elapsedMs += ms; state.simulatedMs += ms;
  for (const p of PROTECTABLE) state.protect[p] = Math.max(0, state.protect[p] - ms);
  state.bonusMs = Math.max(0, state.bonusMs - ms);
  // The character keeps kneading: texture drifts home, foam settles, stains fade.
  const oldStage = degradation(state.consistency);
  state.consistency += (IDEAL_CONSISTENCY - state.consistency) * (state.consistency < -45 ? 0.004 : 0.02) * dt;
  if (degradation(state.consistency) !== oldStage) events.push({ type: 'degradation', stage: degradation(state.consistency), actor: '' });
  const quietMs = Math.min(ms, Math.max(0, state.elapsedMs - state.lastWaterMs - 8000)), angerBefore = angerStage(state.anger);
  state.anger = Math.max(0, state.anger - 3 * quietMs / 1000);
  // The explosion is a moment: once it has played, he settles back to angry for the cooldown.
  if (state.elapsedMs >= state.explosionUntilMs && state.elapsedMs < state.nextExplosionMs) state.anger = Math.min(state.anger, 85);
  if (angerStage(state.anger) !== angerBefore) state.angerStageMs = state.elapsedMs;
  if (state.rescuer && state.elapsedMs >= state.rescuer.untilMs) state.rescuer = null;
  state.fluff = Math.max(0, state.fluff - 0.25 * dt);
  state.sparkle = Math.max(0, state.sparkle - 0.1 * dt);
  for (const k of ['ketcap', 'yumurta', 'sirke'] as const) state.stains[k] = Math.max(0, state.stains[k] - 0.6 * dt);
  state.beads = Math.max(0, state.beads - 0.15 * dt);
  state.recentUnits = (state.recentUnits ?? 0) * Math.exp(-dt / 120);
  if (state.current && state.elapsedMs - state.current.startedMs >= state.current.durationMs) perform(state, events);
  if (!state.current) startNext(state, settings, events);
  if (state.recipe && state.elapsedMs >= state.recipe.endsMs) {
    events.push({ type: 'recipe_failed', recipe: state.recipe });
    state.recipe = null; state.nextRecipeMs = state.elapsedMs + settings.recipeEverySec * 1000;
  } else if (!state.recipe && state.elapsedMs >= state.nextRecipeMs && (state.recentUnits ?? 0) < RECIPE_MIN_ACTIVITY) {
    // A quiet room would only hear recipes open and fail; check again in a minute.
    state.nextRecipeMs = state.elapsedMs + 60000;
  } else if (!state.recipe && state.elapsedMs >= state.nextRecipeMs) {
    state.recipeSeq++;
    state.recipe = makeRecipe(state.recipeSeq, state.elapsedMs + settings.recipeSeconds * 1000);
    events.push({ type: 'recipe_new', recipe: state.recipe });
  }
  return { state, events };
}

/**
 * The one thing the slime needs most, in priority order: fix the texture first,
 * then give it volume and shine, otherwise just grow. Pure, so tests and UI agree.
 */
export function need(state: GameState): Need {
  if (state.consistency < -30) return { ing: 'boraks', reason: 'runny' };
  if (state.consistency > 40) return { ing: state.protect.su > 0 ? 'sampuan' : 'su', reason: 'rubbery' };
  if (state.fluff < 8) return { ing: 'tiras_kopugu', reason: 'flat' };
  if (state.sparkle < 8) return { ing: 'sim', reason: 'dull' };
  return { ing: 'tutkal', reason: 'grow' };
}
/** The bar grows 20 % with every completion, up to ten times the base, so goals stay an event. */
export function goalTarget(settings: Settings, state: GameState): number {
  return Math.round(settings.goalCoins * (1 + 0.2 * Math.min(45, state.goalsDone)));
}
/** Adds gift coins to the community goal; each full bar queues the reward for everyone. */
export function addGoal(input: GameState, settings: Settings, coins: number): { state: GameState; events: EngineEvent[] } {
  let state = input; const events: EngineEvent[] = [];
  if (state.paused || !(coins > 0) || settings.goalCoins <= 0) return { state, events };
  state = structuredClone(input);
  state.goalProgress += Math.min(coins, 1_000_000);
  let reached = 0;
  const done: number[] = [];
  while (state.goalProgress >= goalTarget(settings, state) && done.length < 20) { state.goalProgress -= goalTarget(settings, state); state.goalsDone++; done.push(state.goalsDone); }
  if (state.goalProgress >= goalTarget(settings, state)) state.goalProgress = 0;
  for (let i = 0; i < done.length; i++) {
    const out = enqueue(state, settings, settings.goalReward, 1, 'Herkes');
    state = out.state; events.push(...out.events, { type: 'goal', reward: settings.goalReward, count: state.goalsDone });
  }
  return { state, events };
}
export function derive(state: GameState): Derived {
  const queued: Derived['queued'] = {};
  for (const q of state.queue) queued[q.ing] = (queued[q.ing] ?? 0) + q.n;
  const upcoming: QueueItem[] = state.queue.slice(0, 8).map(q => ({ ...q }));
  return { queued, queuedTotal: queuedTotal(state), upcoming, milestone: milestone(state.mass), multiplier: multiplier(state), texture: texture(state.consistency), need: need(state),
    waterPercent: waterPercent(state.consistency), degradation: degradation(state.consistency), angerStage: angerStage(state.anger) };
}

export function restoredState(value: unknown, settings: Settings): GameState {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved game');
  const s = value as Record<string, unknown>;
  if (s.version === 1) throw new Error('This database belongs to the old egg game; use a fresh DATA_DIR');
  if (s.version !== 2 || typeof s.paused !== 'boolean' || !Array.isArray(s.queue)) throw new Error('Unsupported saved game');
  const base = freshState(settings);
  for (const key of ['elapsedMs', 'simulatedMs', 'mass', 'fluff', 'sparkle', 'hue', 'recipeSeq', 'nextRecipeMs', 'recipesDone', 'bonusMs', 'actions'] as const) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || (s[key] as number) < 0) throw new Error(`Invalid saved ${key}`);
  }
  if (typeof s.consistency !== 'number' || !Number.isFinite(s.consistency)) throw new Error('Invalid saved consistency');
  const queue = (s.queue as unknown[]).filter((q): q is QueueItem => !!q && typeof q === 'object'
    && INGREDIENTS.includes((q as QueueItem).ing) && typeof (q as QueueItem).actor === 'string'
    && Number.isInteger((q as QueueItem).n) && (q as QueueItem).n > 0).slice(0, MAX_QUEUE_ENTRIES);
  const out = { ...base, ...(s as unknown as GameState), queue };
  for (const key of ['anger', 'lastWaterMs', 'explosionUntilMs', 'nextExplosionMs', 'angerStageMs'] as const) {
    if (!Number.isFinite(out[key]) || out[key] < 0 || (key === 'anger' && out[key] > 100)) throw new Error(`Invalid saved ${key}`);
  }
  for (const n of [out.teams.water, out.teams.rescue]) if (!Number.isFinite(n) || n < 0) throw new Error('Invalid saved teams');
  return out;
}
