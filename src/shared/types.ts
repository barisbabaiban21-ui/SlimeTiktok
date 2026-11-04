import type { GrowthMetrics, GrowthSnapshot } from './growth.js';
export type Mode = 'demo' | 'live';

export const INGREDIENTS = [
  'su', 'su_koruma', 'tiras_kopugu', 'sim', 'pudra', 'boraks', 'tutkal', 'sampuan', 'boya',
  'ketcap', 'ketcap_koruma', 'sirke', 'yumurta', 'yumurta_koruma', 'kova', 'boncuk'
] as const;
export type IngredientId = typeof INGREDIENTS[number];
/** base: always helps. risky: can be blocked by a protection. protect: instant shield, never queued. */
export type IngredientKind = 'base' | 'risky' | 'protect';
export type Protectable = 'su' | 'ketcap' | 'yumurta';
export const PROTECTABLE: Protectable[] = ['su', 'ketcap', 'yumurta'];

export interface IngredientDef {
  id: IngredientId; name: string; kind: IngredientKind;
  /** Base grams per unit before growth, consistency and bonus multipliers. */
  grams: number; consistency: number; fluff: number; sparkle: number; chaos: number;
  /** Time the character needs for one action at speed 1. */
  durationMs: number; color: string; protects?: Protectable;
}

export interface GiftRule { giftId: string; minCoins: number; ingredient: IngredientId; units: number; label: string }
export interface Settings {
  locale: 'tr' | 'en'; showNames: boolean; growthEnabled: boolean; voiceEnabled: boolean;
  chatEcho: boolean; chatActions: boolean;
  /** Character work speed multiplier. */
  speed: number;
  /** Seconds between recipe calls and how long each call stays open. */
  recipeEverySec: number; recipeSeconds: number;
  /** Community goal: every goalCoins gift coins, everyone gets goalReward for free. */
  goalCoins: number; goalReward: IngredientId;
  /** Seconds of silence before the character fills the air. */
  chatterSec: number;
  giftRules: GiftRule[];
}
export const DEFAULT_SETTINGS: Settings = {
  locale: 'tr', showNames: false, growthEnabled: true, voiceEnabled: true, chatEcho: false, chatActions: true,
  speed: 1, recipeEverySec: 150, recipeSeconds: 90, chatterSec: 25, goalCoins: 500, goalReward: 'kova',
  // Real TikTok gift IDs (catalog fetched 2026-11-04); prices are the catalog's coin values.
  // The water fight is on the cheapest gifts: Rose throws water, Finger Heart rescues, Rosa shields.
  giftRules: [
    { giftId: '5655', minCoins: 1, ingredient: 'su', units: 1, label: 'Gül' },
    { giftId: '5487', minCoins: 5, ingredient: 'boraks', units: 1, label: 'Parmak Kalp' },
    { giftId: '8913', minCoins: 10, ingredient: 'su_koruma', units: 1, label: 'Rosa' },
    { giftId: '5269', minCoins: 1, ingredient: 'tiras_kopugu', units: 1, label: 'TikTok' },
    { giftId: '6064', minCoins: 1, ingredient: 'sim', units: 1, label: 'GG' },
    { giftId: '5658', minCoins: 20, ingredient: 'tutkal', units: 1, label: 'Parfüm' },
    { giftId: '5879', minCoins: 30, ingredient: 'ketcap', units: 1, label: 'Donut' },
    { giftId: '5585', minCoins: 100, ingredient: 'yumurta', units: 1, label: 'Konfeti' },
    { giftId: '5566', minCoins: 100, ingredient: 'sirke', units: 1, label: 'Mishka Bear' },
    { giftId: '5486', minCoins: 100, ingredient: 'sirke', units: 1, label: 'Mishka Bear' },
    { giftId: '5660', minCoins: 100, ingredient: 'ketcap_koruma', units: 1, label: 'Kalpli Eller' },
    { giftId: '5924', minCoins: 100, ingredient: 'ketcap_koruma', units: 1, label: 'Kalpli Eller' },
    { giftId: '6267', minCoins: 299, ingredient: 'yumurta_koruma', units: 1, label: 'Corgi' },
    { giftId: '7168', minCoins: 500, ingredient: 'kova', units: 1, label: 'Para Tabancası' },
    // Any other gift lands on a TikTok price step. Shields only come from their own gifts.
    { giftId: '', minCoins: 1, ingredient: 'su', units: 1, label: '1 jeton' },
    { giftId: '', minCoins: 5, ingredient: 'tiras_kopugu', units: 1, label: '5+ jeton' },
    { giftId: '', minCoins: 10, ingredient: 'sim', units: 1, label: '10+ jeton' },
    { giftId: '', minCoins: 15, ingredient: 'boraks', units: 1, label: '15+ jeton' },
    { giftId: '', minCoins: 20, ingredient: 'pudra', units: 1, label: '20+ jeton' },
    { giftId: '', minCoins: 30, ingredient: 'sampuan', units: 1, label: '30+ jeton' },
    { giftId: '', minCoins: 99, ingredient: 'boya', units: 1, label: '99+ jeton' },
    { giftId: '', minCoins: 100, ingredient: 'ketcap', units: 1, label: '100+ jeton' },
    { giftId: '', minCoins: 149, ingredient: 'boncuk', units: 1, label: '149+ jeton' },
    { giftId: '', minCoins: 199, ingredient: 'tutkal', units: 1, label: '199+ jeton' },
    { giftId: '', minCoins: 249, ingredient: 'sirke', units: 1, label: '249+ jeton' },
    { giftId: '', minCoins: 349, ingredient: 'yumurta', units: 1, label: '349+ jeton' },
    { giftId: '', minCoins: 500, ingredient: 'kova', units: 1, label: '500+ jeton' }
  ]
};

export interface QueueItem { ing: IngredientId; actor: string; n: number; giftName?: string }
export interface CurrentAction { seq: number; ing: IngredientId; actor: string; n: number; startedMs: number; durationMs: number; blocked: boolean; giftName?: string }
export interface Recipe { id: number; items: Partial<Record<IngredientId, number>>; got: Partial<Record<IngredientId, number>>; endsMs: number }
export interface PerformedAction { seq: number; ing: IngredientId; actor: string; n: number; grams: number; blocked: boolean }
export interface Gesture { seq: number; type: 'stretch' | 'knead' | 'wave'; actor: string; pour?: IngredientId; atMs?: number; blocked?: boolean }
export type Degradation = 'good' | 'loose' | 'flowing' | 'soup';
export type AngerStage = 'calm' | 'request' | 'begging' | 'angry' | 'explosion';
export type RescueIngredient = 'boraks' | 'tutkal' | 'su_koruma';

export interface GameState {
  version: 2; elapsedMs: number; simulatedMs: number;
  /** Total slime mass in grams. Never decreases. */
  mass: number;
  /** -100 runny ... +100 rubbery. The sweet spot sits near +5. */
  consistency: number; fluff: number; sparkle: number; hue: number;
  anger: number; lastWaterMs: number; explosionUntilMs: number; nextExplosionMs: number;
  /** When the anger stage last changed; stages hold for a few seconds so every one is heard. */
  angerStageMs: number;
  teams: { water: number; rescue: number };
  rescuer: { actor: string; ing: RescueIngredient; untilMs: number } | null;
  stains: { ketcap: number; yumurta: number; sirke: number };
  queue: QueueItem[]; current: CurrentAction | null;
  protect: Record<Protectable, number>;
  recipe: Recipe | null; recipeSeq: number; nextRecipeMs: number; recipesDone: number; bonusMs: number;
  /** Coloured beads mixed in, 0..100. */
  beads: number;
  goalProgress: number; goalsDone: number;
  /** Decaying count of recently gifted units: how lively the room is. */
  recentUnits: number;
  totals: Partial<Record<IngredientId, number>>; actions: number;
  paused: boolean; pauseReason: string;
  lastAction: PerformedAction | null; gesture: Gesture | null;
}

export interface LiveEvent {
  id: string; source: 'webhook' | 'tiktok' | 'tikfinity' | 'demo';
  roomId: string; timestamp: number; kind: 'gift' | 'like' | 'comment' | 'follow' | 'join';
  user: { id: string; name: string }; count?: number; command?: string; text?: string;
  gift?: { id: string; name: string; coins: number; repeat: number; streakId?: string; ended?: boolean };
}
export interface Leader { name: string; points: number; coins: number }
export interface Activity { id: number; name: string; ing: IngredientId | 'like' | 'follow' | 'command'; n: number; at: number; demo: boolean; note: string }
export interface Speech { seq: number; text: string; audio: string | null; at: number; durationMs: number; mood: 'happy' | 'shock' | 'excited' | 'calm' | 'begging' | 'angry' | 'explosion' }
export interface MenuRow { ing: IngredientId; name: string; label: string; queued: number; kind: IngredientKind; needed: boolean }
/** What the slime needs right now; the character says it out loud and the menu highlights it. */
export interface Need { ing: IngredientId; reason: 'runny' | 'rubbery' | 'flat' | 'dull' | 'grow' }
export interface Milestone { index: number; name: string; floorKg: number; nextKg: number; progress: number }
export interface Derived {
  queued: Partial<Record<IngredientId, number>>; queuedTotal: number; upcoming: QueueItem[];
  milestone: Milestone; multiplier: number; texture: 'runny' | 'perfect' | 'normal' | 'rubbery'; need: Need;
  waterPercent: number; degradation: Degradation; angerStage: AngerStage;
}
/** A little show between gifts, so the room is never quiet: a dance break, a fake power cut, golden slime, a joke. */
export type ShowType = 'dance' | 'quietDance' | 'blackout' | 'golden' | 'joke' | 'wave' | 'party' | 'vote'
  | 'rain' | 'bucket' | 'challenge' | 'likeGoal' | 'fastest' | 'rage';
/** variant: which dance (0 twist, 1 cabbage patch, 2 chicken, 3 running man). A vote carries the tally per option 1-4. disco: the mirror ball comes down. */
export interface Show { seq: number; type: ShowType; at: number; durationMs: number; variant: number; votes?: number[]; disco?: boolean;
  /** Room goals (chat words, likes): progress towards `need`. */ goal?: { need: number; got: number }; winner?: string }
export interface PublicSnapshot {
  now: number; mode: Mode; game: Omit<GameState, 'queue'>; derived: Derived; menu: MenuRow[];
  settings: Settings; leaders: Leader[]; activity: Activity[]; growth: GrowthSnapshot; speech: Speech | null; show: Show | null;
  source: { connected: boolean; provider: string; lastHeartbeat: number };
}
export interface AdminSnapshot extends PublicSnapshot {
  metrics: { events: number; coins: number; players: number; clients: number; uptime: number };
  growthMetrics: GrowthMetrics; voice: { provider: string; ready: boolean; cached: number; failures: number; charsToday: number; dailyChars: number };
  armed: boolean; blocked: string[]; recent: { id: string; kind: string; result: string; at: number }[];
}
export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
