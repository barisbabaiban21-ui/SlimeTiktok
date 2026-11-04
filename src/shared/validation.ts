import { DEFAULT_SETTINGS, INGREDIENTS } from './types.js';
import type { LiveEvent, Settings, GiftRule, IngredientId } from './types.js';
import { chatCommand, cleanChat } from '../../bridges/chat.mjs';
export { COMMANDS } from '../../bridges/chat.mjs';
export class ValidationError extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Expected an object');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 128): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ValidationError('Invalid text field');
  return value.trim();
}
export function number(value: unknown, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new ValidationError('Number outside allowed range');
  return value;
}
export function displayName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').slice(0, 28) || 'Viewer';
}
const bool = (v: unknown, name: string, fallback?: boolean): boolean => {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== 'boolean') throw new ValidationError(`Invalid ${name} switch`);
  return v;
};
export function parseSettings(value: unknown): Settings {
  const o = object(value);
  if (o.locale !== 'tr' && o.locale !== 'en') throw new ValidationError('Invalid locale');
  if (!Array.isArray(o.giftRules) || o.giftRules.length < 1 || o.giftRules.length > 32) throw new ValidationError('1–32 gift rules required');
  const giftRules: GiftRule[] = o.giftRules.map(value => {
    const r = object(value);
    if (!INGREDIENTS.includes(r.ingredient as IngredientId)) throw new ValidationError('Invalid ingredient');
    const giftId = r.giftId === '' ? '' : text(r.giftId, 40);
    const label = r.label === undefined || r.label === '' ? '' : displayName(text(r.label, 40));
    return { giftId, minCoins: number(r.minCoins, 1, 1000000, true), ingredient: r.ingredient as IngredientId, units: number(r.units, 1, 100, true), label };
  });
  if (new Set(giftRules.filter(r => r.giftId).map(r => r.giftId)).size !== giftRules.filter(r => r.giftId).length) throw new ValidationError('Duplicate gift IDs');
  const d = DEFAULT_SETTINGS;
  const num = (k: 'speed' | 'recipeEverySec' | 'recipeSeconds' | 'chatterSec', lo: number, hi: number) => o[k] === undefined ? d[k] : number(o[k], lo, hi);
  return { locale: o.locale, showNames: bool(o.showNames, 'names'), growthEnabled: bool(o.growthEnabled, 'growth', true),
    voiceEnabled: bool(o.voiceEnabled, 'voice', true), speed: num('speed', 0.25, 4),
    chatEcho: bool(o.chatEcho, 'chatEcho', false), chatActions: bool(o.chatActions, 'chatActions', true),
    recipeEverySec: num('recipeEverySec', 30, 3600), recipeSeconds: num('recipeSeconds', 20, 600), chatterSec: num('chatterSec', 8, 600),
    goalCoins: o.goalCoins === undefined ? d.goalCoins : number(o.goalCoins, 10, 1_000_000, true),
    goalReward: o.goalReward === undefined ? d.goalReward : INGREDIENTS.includes(o.goalReward as IngredientId) && o.goalReward !== 'su' ? o.goalReward as IngredientId : (() => { throw new ValidationError('Invalid goal reward'); })(),
    giftRules };
}
export function parseEvent(value: unknown, now = Date.now()): LiveEvent {
  const o = object(value), user = object(o.user);
  const kinds = ['gift', 'like', 'comment', 'follow', 'join'], sources = ['webhook', 'tiktok', 'tikfinity', 'demo'];
  if (!kinds.includes(String(o.kind)) || !sources.includes(String(o.source))) throw new ValidationError('Invalid kind or source');
  const timestamp = number(o.timestamp, now - 600000, now + 30000, true);
  const e: LiveEvent = { id: text(o.id, 160), roomId: text(o.roomId, 100), source: o.source as LiveEvent['source'],
    kind: o.kind as LiveEvent['kind'], timestamp, user: { id: text(user.id, 128), name: displayName(text(user.name, 128)) } };
  if (e.kind === 'gift') {
    const g = object(o.gift);
    e.gift = { id: text(g.id, 40), name: displayName(text(g.name, 80)), coins: number(g.coins, 1, 1000000, true), repeat: number(g.repeat, 1, 10000, true) };
    if (g.streakId !== undefined) e.gift.streakId = text(g.streakId, 120);
    if (e.gift.repeat > 1 && !e.gift.streakId) throw new ValidationError('Cumulative gift requires a stable streakId');
    if (g.ended !== undefined) {
      if (typeof g.ended !== 'boolean') throw new ValidationError('Invalid ended flag');
      e.gift.ended = g.ended;
    }
  }
  if (e.kind === 'like') e.count = number(o.count, 1, 5000, true);
  if (e.kind === 'comment') {
    for (const k of ['command', 'text']) if (o[k] !== undefined && (typeof o[k] !== 'string' || (o[k] as string).length > 200)) throw new ValidationError('Invalid comment text');
    if (o.command === undefined && o.text === undefined) throw new ValidationError('Missing comment');
    e.command = chatCommand(o.command || o.text);
    const filtered = cleanChat(o.text);
    if (filtered) e.text = filtered;
  }
  return e;
}
export const defaultSettings = (): Settings => structuredClone(DEFAULT_SETTINGS);
