import { CATALOG } from '../shared/ingredients.js';
import type { IngredientId } from '../shared/types.js';
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; }
export function set(id: string, value: string): void { const n = document.getElementById(id); if (n && n.textContent !== value) n.textContent = value; }
export function $(id: string): HTMLElement { return document.getElementById(id)!; }
export function notice(message: string, bad = false): void { const n = $('toast'); n.textContent = message; n.classList.toggle('bad', bad); n.classList.add('show'); setTimeout(() => n.classList.remove('show'), 4500); }
export const ingName = (ing: string): string => (CATALOG as Record<string, { name: string }>)[ing]?.name ?? ing;
export const kg = (grams: number): string => {
  const v = grams / 1000;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} milyon kg`;
  if (v >= 1000) return `${Math.round(v).toLocaleString('tr-TR')} kg`;
  return `${v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
};
const esc = (s: string) => s.replace(/[^#a-zA-Z0-9]/g, '');
/** Original inline SVG icons. No emoji font, no third-party gift art. */
export function icon(ing: IngredientId | 'like' | 'follow' | 'command'): string {
  const svg = (body: string) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
  if (ing === 'like') return svg('<path d="M16 27 5 16a6 6 0 0 1 11-7 6 6 0 0 1 11 7Z" fill="#ff4f7b"/>');
  if (ing === 'follow') return svg('<circle cx="16" cy="11" r="6" fill="#fff"/><path d="M5 28a11 9 0 0 1 22 0Z" fill="#fff"/>');
  if (ing === 'command') return svg('<path d="M6 8h20v13H14l-6 5v-5H6Z" fill="#9be7ff"/>');
  const c = esc(CATALOG[ing].color);
  if (CATALOG[ing].kind === 'protect') return svg(`<path d="M16 3 27 7v8c0 7-5 12-11 14C10 27 5 22 5 15V7Z" fill="${c}"/><path d="m11 16 4 4 7-8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`);
  if (ing === 'yumurta') return svg('<ellipse cx="16" cy="17" rx="9" ry="12" fill="#fff4de"/><circle cx="16" cy="19" r="4.5" fill="#ffc93c"/>');
  if (ing === 'kova') return svg('<path d="M6 10h20l-3 18H9Z" fill="#e8eef3"/><path d="M6 10a10 6 0 0 1 20 0" stroke="#7b8b98" stroke-width="2.5" fill="none"/><ellipse cx="16" cy="10" rx="10" ry="3" fill="#fafafa" stroke="#9aa"/>');
  if (ing === 'boncuk') return svg('<circle cx="10" cy="12" r="5" fill="#ff5fa2"/><circle cx="21" cy="10" r="5" fill="#40c4ff"/><circle cx="15" cy="21" r="5" fill="#ffd84a"/><circle cx="25" cy="21" r="4" fill="#7cff9b"/><circle cx="9" cy="11" r="1.5" fill="#fff"/>');
  if (ing === 'sim') return svg('<path d="m16 3 3 9 9 4-9 3-3 10-3-10-9-3 9-4Z" fill="#ffd84a"/><circle cx="26" cy="6" r="2" fill="#fff3a6"/>');
  if (ing === 'tiras_kopugu') return svg('<rect x="10" y="9" width="12" height="20" rx="3" fill="#3f7fd8"/><rect x="13" y="4" width="6" height="6" rx="1" fill="#ddd"/><circle cx="23" cy="6" r="4" fill="#fff"/><circle cx="27" cy="10" r="3" fill="#fff"/>');
  if (ing === 'boraks' || ing === 'pudra') return svg(`<rect x="7" y="9" width="18" height="19" rx="2" fill="${ing === 'boraks' ? '#e9f4ff' : '#ffe4ef'}" stroke="#9fb3c8"/><rect x="7" y="9" width="18" height="6" fill="${ing === 'boraks' ? '#5b8bd6' : '#ff8fb8'}"/>`);
  return svg(`<rect x="10" y="10" width="12" height="19" rx="4" fill="${c}" stroke="#0003"/><rect x="13" y="4" width="6" height="7" rx="1.5" fill="${ing === 'tutkal' ? '#e53935' : '#fff'}"/>`);
}
