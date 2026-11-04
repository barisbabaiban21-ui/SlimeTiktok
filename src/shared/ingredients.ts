import type { IngredientDef, IngredientId } from './types.js';

/** Real household names, as used on the streams. Gameplay numbers are tuned for fun, not chemistry. */
export const CATALOG: Record<IngredientId, IngredientDef> = {
  su:             { id: 'su', name: 'Su', kind: 'risky', grams: 120, consistency: -6, fluff: 0, sparkle: 0, chaos: 0, durationMs: 2200, color: '#7cc7ff', protects: undefined },
  su_koruma:      { id: 'su_koruma', name: 'Su koruma', kind: 'protect', grams: 0, consistency: 0, fluff: 0, sparkle: 0, chaos: 0, durationMs: 0, color: '#4ea3ff', protects: 'su' },
  tiras_kopugu:   { id: 'tiras_kopugu', name: 'Tıraş köpüğü', kind: 'base', grams: 160, consistency: -3, fluff: 14, sparkle: 0, chaos: 0, durationMs: 2600, color: '#ffffff' },
  sim:            { id: 'sim', name: 'Sim', kind: 'base', grams: 25, consistency: 0, fluff: 0, sparkle: 14, chaos: 0, durationMs: 1800, color: '#ffd84a' },
  pudra:          { id: 'pudra', name: 'Pudra', kind: 'base', grams: 60, consistency: 6, fluff: -4, sparkle: 0, chaos: 0, durationMs: 2000, color: '#f4e9ee' },
  boraks:         { id: 'boraks', name: 'Boraks', kind: 'base', grams: 40, consistency: 26, fluff: 0, sparkle: 0, chaos: 0, durationMs: 2000, color: '#e9f4ff' },
  tutkal:         { id: 'tutkal', name: 'Tutkal', kind: 'base', grams: 450, consistency: 5, fluff: 0, sparkle: 0, chaos: 0, durationMs: 3000, color: '#f7f7f2' },
  sampuan:        { id: 'sampuan', name: 'Şampuan', kind: 'base', grams: 150, consistency: -6, fluff: 5, sparkle: 2, chaos: 0, durationMs: 2400, color: '#8fe3c4' },
  boya:           { id: 'boya', name: 'Boya', kind: 'base', grams: 30, consistency: 0, fluff: 0, sparkle: 0, chaos: 0, durationMs: 2000, color: '#ff5fa2' },
  ketcap:         { id: 'ketcap', name: 'Ketçap', kind: 'risky', grams: 90, consistency: -4, fluff: 0, sparkle: 0, chaos: 26, durationMs: 2200, color: '#d8261c', protects: undefined },
  ketcap_koruma:  { id: 'ketcap_koruma', name: 'Ketçap koruma', kind: 'protect', grams: 0, consistency: 0, fluff: 0, sparkle: 0, chaos: 0, durationMs: 0, color: '#ff8a7a', protects: 'ketcap' },
  sirke:          { id: 'sirke', name: 'Sirke', kind: 'risky', grams: 70, consistency: -8, fluff: 6, sparkle: 0, chaos: 16, durationMs: 2200, color: '#f3e7a1' },
  yumurta:        { id: 'yumurta', name: 'Yumurta', kind: 'risky', grams: 110, consistency: -10, fluff: 0, sparkle: 0, chaos: 22, durationMs: 2400, color: '#ffc93c', protects: undefined },
  yumurta_koruma: { id: 'yumurta_koruma', name: 'Yumurta koruma', kind: 'protect', grams: 0, consistency: 0, fluff: 0, sparkle: 0, chaos: 0, durationMs: 0, color: '#ffe08a', protects: 'yumurta' },
  boncuk:         { id: 'boncuk', name: 'Boncuk', kind: 'base', grams: 55, consistency: 2, fluff: 0, sparkle: 4, chaos: 0, durationMs: 2000, color: '#ff7ad9' },
  kova:           { id: 'kova', name: 'Dev tutkal kovası', kind: 'base', grams: 4000, consistency: 10, fluff: 0, sparkle: 4, chaos: 0, durationMs: 4200, color: '#fafafa' }
};
/** Paint cycles through this palette; deterministic by how many paints were poured. */
export const PAINTS = [330, 190, 120, 275, 25, 55, 210, 0] as const;
/** Ingredients that recipe calls may ask for. Never protections, never chaos. */
export const RECIPE_POOL: IngredientId[] = ['tiras_kopugu', 'boraks', 'tutkal', 'sim', 'pudra', 'boya', 'sampuan', 'boncuk'];
/** Shields are short on purpose: a few cheap gifts must not switch off the water comedy for minutes. */
export const PROTECT_MS_PER_UNIT = 8000;
export const PROTECT_MAX_MS = 45000;
export const BONUS_MS = 60000;
export const MAX_QUEUE_ENTRIES = 300;
export const MAX_GRAMS_PER_ACTION = 50_000_000;
