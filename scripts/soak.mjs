// 24-hour synthetic soak: a day of quiet hours, busy evenings and gift storms on a virtual clock.
// Usage: npm run build && node scripts/soak.mjs [hours=24] [seed=7]
import { Sim, crowd, rng } from '../dist/tests/harness.js';
import { derive } from '../dist/src/shared/engine.js';

const hours = Number(process.argv[2] ?? 24), seed = Number(process.argv[3] ?? 7);
const r = rng(seed), sim = new Sim();
const started = performance.now(), heap = [];
// Gifts per second by hour of day: dead at night, peaking in the evening.
const curve = [0.05, 0.03, 0.02, 0.02, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.6, 0.7, 0.8, 1, 1.4, 2, 3, 3.5, 3, 1.5, 0.5];
let storms = 0;
for (let h = 0; h < hours; h++) {
  const rate = curve[h % 24];
  for (let m = 0; m < 60; m++) {
    // A storm: somebody's battle or a raid, 40 gifts a second for 20 seconds.
    if (rate >= 1 && r() < 0.08) { crowd(sim, r, 20, 40, 3000); storms++; crowd(sim, r, 40, rate); }
    else crowd(sim, r, 60, rate);
    if (sim.stats.violations.length) break;
  }
  if (global.gc) global.gc();
  heap.push(Math.round(process.memoryUsage().heapUsed / 1e6));
  const s = sim.g.state;
  console.log(JSON.stringify({ hour: h + 1, rate, massKg: Math.round(s.mass / 1000), stage: derive(s).milestone.name, queue: derive(s).queuedTotal,
    goals: s.goalsDone, recipes: s.recipesDone, lines: sim.stats.speeches.size, heapMB: heap.at(-1), violations: sim.stats.violations.length }));
  if (sim.stats.violations.length) break;
}
const s = sim.g.state;
const report = {
  simulatedHours: hours, wallSeconds: Math.round((performance.now() - started) / 1000), gifts: sim.stats.gifts, coins: sim.stats.coins, storms,
  finalMassKg: Math.round(s.mass / 1000), stage: derive(s).milestone.name, actions: s.actions, goals: s.goalsDone, recipes: s.recipesDone,
  peakQueueEntries: sim.stats.maxQueue, peakQueueUnits: sim.stats.maxQueueUnits, maxSnapshotBytes: sim.stats.maxSnapshot,
  distinctLines: sim.stats.speeches.size, heapMB: { first: heap[0], last: heap.at(-1), max: Math.max(...heap) },
  violations: sim.stats.violations.slice(0, 20)
};
console.log(JSON.stringify(report, null, 2));
sim.close();
process.exitCode = report.violations.length ? 1 : 0;
