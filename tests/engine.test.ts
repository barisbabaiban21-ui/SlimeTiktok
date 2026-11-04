import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, derive, enqueue, freeAction, freshState, makeRecipe, milestone, restoredState, texture } from '../src/shared/engine.js';
import { CATALOG, MAX_QUEUE_ENTRIES, PROTECT_MAX_MS } from '../src/shared/ingredients.js';
import { defaultSettings } from '../src/shared/validation.js';
import type { GameState } from '../src/shared/types.js';
const cfg = defaultSettings();
/** Runs the server loop in 100 ms steps, the way http.ts does. */
function run(s: GameState, ms: number) { const events = []; for (let t = 0; t < ms; t += 100) { const r = advance(s, cfg, 100); s = r.state; events.push(...r.events); } return { state: s, events }; }

test('gifts queue up and the character performs them one at a time, growing the slime', () => {
  let s = freshState(cfg); const start = s.mass;
  s = enqueue(s, cfg, 'tutkal', 1, 'Ada').state;
  s = enqueue(s, cfg, 'tiras_kopugu', 1, 'Can').state;
  assert.equal(derive(s).queuedTotal, 2);
  let r = run(s, 200); s = r.state;
  assert.equal(s.current?.ing, 'tutkal'); assert.equal(derive(s).queuedTotal, 1);
  r = run(s, 8000); s = r.state;
  assert.equal(derive(s).queuedTotal, 0); assert.equal(s.current, null);
  assert.ok(s.mass > start + CATALOG.tutkal.grams);
  assert.deepEqual(r.events.filter(e => e.type === 'performed').map(e => e.type === 'performed' && e.action.ing), ['tutkal', 'tiras_kopugu']);
  assert.equal(s.totals.tutkal, 1); assert.ok(s.fluff > 0);
});
test('protection applies instantly and blocks the next water without touching the mass', () => {
  let s = freshState(cfg);
  const p = enqueue(s, cfg, 'su_koruma', 1, 'Guard'); s = p.state;
  assert.equal(derive(s).queuedTotal, 0, 'protections never queue');
  assert.equal(s.protect.su, 8000); assert.equal(p.events[0]?.type, 'protected');
  s = enqueue(s, cfg, 'su', 3, 'Splash').state;
  const before = s.mass;
  const r = run(s, 6000); s = r.state;
  const done = r.events.find(e => e.type === 'performed');
  assert.ok(done && done.type === 'performed' && done.action.blocked);
  assert.equal(s.mass, before); assert.equal(s.totals.su, 3);
  // Shields are capped like the old kalkan.
  s = enqueue(s, cfg, 'su_koruma', 100, 'Guard').state; assert.equal(s.protect.su, PROTECT_MAX_MS);
});
test('water without protection thins the slime; borax firms it back', () => {
  let s = freshState(cfg);
  s = enqueue(s, cfg, 'su', 9, 'Splash').state;
  s = run(s, 20000).state;
  assert.ok(s.consistency < -10, `consistency ${s.consistency}`);
  const runny = s.consistency;
  s = enqueue(s, cfg, 'boraks', 4, 'Fix').state;
  s = run(s, 10000).state;
  assert.ok(s.consistency > runny);
  assert.equal(texture(-80), 'runny'); assert.equal(texture(5), 'perfect'); assert.equal(texture(90), 'rubbery');
});
test('a huge streak is worked through in batches, not one action per rose', () => {
  let s = freshState(cfg);
  s = enqueue(s, cfg, 'sim', 1000, 'Whale').state;
  const r = run(s, 120000); s = r.state;
  assert.equal(derive(s).queuedTotal, 0);
  assert.ok(r.events.filter(e => e.type === 'performed').length < 120);
  assert.equal(s.totals.sim, 1000);
});
test('the queue is bounded and merges consecutive gifts from the same viewer', () => {
  let s = freshState(cfg);
  s = enqueue(s, cfg, 'sim', 1, 'A').state; s = enqueue(s, cfg, 'sim', 2, 'A').state;
  assert.equal(s.queue.length, 1); assert.equal(s.queue[0]!.n, 3);
  for (let i = 0; i < 1000; i++) s = enqueue(s, cfg, i % 2 ? 'sim' : 'boya', 1, `U${i}`).state;
  assert.ok(s.queue.length <= MAX_QUEUE_ENTRIES + 20);
  assert.equal(derive(s).queuedTotal, 1003);
});
test('recipes are deterministic, fill from gifts and grant a timed double bonus', () => {
  assert.deepEqual(makeRecipe(7, 0), makeRecipe(7, 0));
  let s = { ...freshState(cfg), recentUnits: 50 };
  let r = run(s, 31000); s = r.state;
  assert.ok(s.recipe); assert.ok(r.events.some(e => e.type === 'recipe_new'));
  const out = Object.entries(s.recipe!.items).reduce((acc, [k, n]) => {
    const step = enqueue(acc.state, cfg, k as never, n!, 'Chat'); return { state: step.state, events: [...acc.events, ...step.events] };
  }, { state: s, events: [] as ReturnType<typeof enqueue>['events'] });
  s = out.state;
  assert.ok(out.events.some(e => e.type === 'recipe_done'));
  assert.equal(s.recipe, null); assert.equal(s.recipesDone, 1); assert.equal(s.bonusMs, 60000);
  assert.equal(derive(s).multiplier, 3, 'perfect texture x1.5 with recipe x2');
});
test('an expired recipe fails quietly and schedules the next one', () => {
  let s = { ...freshState(cfg), recentUnits: 500 };
  s = run(s, 31000).state; assert.ok(s.recipe);
  const r = run(s, cfg.recipeSeconds * 1000 + 500); s = r.state;
  assert.ok(r.events.some(e => e.type === 'recipe_failed')); assert.equal(s.recipe, null);
});
test('milestones climb forever', () => {
  assert.equal(milestone(500).name, 'Kase');
  assert.equal(milestone(2000).name, 'Masa');
  assert.equal(milestone(60_000).name, 'Yere yayıldı');
  const world = milestone(1e13), far = milestone(1e16);
  assert.ok(far.index > world.index); assert.ok(far.nextKg > far.floorKg);
  let s = freshState(cfg); s.mass = 1990;
  s = enqueue(s, cfg, 'tutkal', 1, 'A').state;
  const r = run(s, 5000);
  assert.ok(r.events.some(e => e.type === 'milestone'));
});
test('paused games ignore gifts and time; free actions are small and never queue', () => {
  let s = freshState(cfg); s.paused = true;
  assert.deepEqual(enqueue(s, cfg, 'kova', 1, 'A').state.queue, []);
  assert.equal(advance(s, cfg, 100).state.elapsedMs, 0);
  s = freshState(cfg);
  const liked = freeAction(s, 'like', 5000, 'A');
  assert.ok(liked.mass > s.mass && liked.mass - s.mass < 5000);
  assert.equal(freeAction(s, 'command', 1, 'A', '!uzat').gesture?.type, 'stretch');
  assert.equal(freeAction(s, 'follow', 1, 'A').gesture?.type, 'wave');
});
test('a stalled process cannot fast-forward', () => {
  const s = freshState(cfg);
  assert.equal(advance(s, cfg, 3_600_000).state.elapsedMs, 250);
});
test('saved games round-trip and the old egg save is refused', () => {
  let s = freshState(cfg); s = enqueue(s, cfg, 'sim', 2, 'A').state;
  assert.deepEqual(restoredState(JSON.parse(JSON.stringify(s)), cfg), s);
  assert.throws(() => restoredState({ version: 1, phase: 'incubating', paused: false }, cfg), /old egg game/);
  assert.throws(() => restoredState({ ...s, mass: -1 }, cfg));
  assert.deepEqual(restoredState({ ...s, queue: [{ ing: 'nope', actor: 'x', n: 1 }, ...s.queue] }, cfg).queue, s.queue);
});
test('the slime says what it needs: texture first, then volume, shine, growth', async () => {
  const { need } = await import('../src/shared/engine.js');
  const s = freshState(cfg);
  s.consistency = -60; assert.deepEqual(need(s), { ing: 'boraks', reason: 'runny' });
  s.consistency = 70; assert.equal(need(s).ing, 'su');
  s.protect.su = 5000; assert.equal(need(s).ing, 'sampuan', 'never asks for water it is protected against');
  s.consistency = 5; s.fluff = 0; assert.equal(need(s).ing, 'tiras_kopugu');
  s.fluff = 30; s.sparkle = 0; assert.equal(need(s).ing, 'sim');
  s.sparkle = 30; assert.deepEqual(need(s), { ing: 'tutkal', reason: 'grow' });
});
test('every goal bar of gift coins queues the reward for everyone', async () => {
  const { addGoal } = await import('../src/shared/engine.js');
  let s = freshState(cfg);
  let r = addGoal(s, cfg, 499); s = r.state; assert.equal(s.goalProgress, 499); assert.equal(r.events.length, 0);
  // 500 → 600 → 700: the bar grows after every completion.
  r = addGoal(s, cfg, 1002); s = r.state;
  assert.equal(s.goalsDone, 2); assert.equal(s.goalProgress, 401);
  assert.equal(derive(s).queued.kova, 2); assert.equal(r.events.filter(e => e.type === 'goal').length, 2);
  s.paused = true; assert.equal(addGoal(s, cfg, 5000).state.goalsDone, 2);
});
test('beads mix in and fade slowly', () => {
  let s = enqueue(freshState(cfg), cfg, 'boncuk', 2, 'A').state;
  s = run(s, 4000).state; assert.ok(s.beads > 20);
  const b = s.beads; s = run(s, 10000).state; assert.ok(s.beads < b && s.beads > b - 3);
});
test('recipes wait for a lively room instead of failing all night', () => {
  let s = freshState(cfg);
  const r = run(s, 10 * 60_000); s = r.state;
  assert.equal(r.events.filter(e => e.type === 'recipe_new').length, 0, 'empty room: no recipe calls');
  // The room wakes up: a gift every few seconds for two minutes.
  let opened = false;
  for (let i = 0; i < 40 && !opened; i++) { s = enqueue(s, cfg, 'sim', 1, `u${i}`).state; const r2 = run(s, 3000); s = r2.state; opened = r2.events.some(e => e.type === 'recipe_new'); }
  assert.ok(opened, 'a busy room gets one');
});
