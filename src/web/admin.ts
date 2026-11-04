import type { AdminSnapshot, Settings, GiftRule, IngredientId } from '../shared/types.js';
import { INGREDIENTS } from '../shared/types.js';
import { $, el, notice, set, ingName } from './dom.js';
let token = ''; let snapshot: AdminSnapshot | null = null; let poll: ReturnType<typeof setInterval> | null = null; let editing = false; let refreshing = false;
async function api(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`/api/admin/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
  const data = await res.json() as { error?: string }; if (!res.ok) throw Error(data.error ?? 'İşlem başarısız'); return data;
}
const NUMS = ['speed', 'recipeEverySec', 'recipeSeconds', 'chatterSec', 'goalCoins'] as const;
const SWITCHES = ['showNames', 'growthEnabled', 'voiceEnabled', 'chatEcho', 'chatActions'] as const;
async function refresh(): Promise<void> {
  if (refreshing) return; refreshing = true;
  try {
    snapshot = await api('state') as AdminSnapshot;
    set('metric-events', snapshot.metrics.events.toLocaleString()); set('metric-coins', snapshot.metrics.coins.toLocaleString()); set('metric-players', String(snapshot.metrics.players)); set('metric-uptime', `${Math.floor(snapshot.metrics.uptime / 3600)}s ${Math.floor(snapshot.metrics.uptime % 3600 / 60)}dk`);
    set('operator-state', snapshot.game.paused ? 'DURAKLATILDI' : 'ÇALIŞIYOR'); set('provider-detail', `${snapshot.source.provider} · ${snapshot.source.connected ? 'bağlı' : 'bağlı değil'} · ${snapshot.metrics.clients} ekran`);
    const v = snapshot.voice;
    set('voice-detail', v.ready ? `Ses: ${v.provider} · ${v.cached} kayıtlı cümle · ${v.failures} hata · bugün ${v.charsToday.toLocaleString('tr-TR')}/${v.dailyChars.toLocaleString('tr-TR')} karakter` : 'Ses: TTS sağlayıcısı yok, sadece altyazı (.env → TTS_PROVIDER)');
    const growth = snapshot.growthMetrics;
    const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
    set('growth-participants', String(growth.participants)); set('growth-gifters', `${growth.gifters} / ${growth.participants}`);
    set('growth-conversion', percent(growth.giftParticipationRate)); set('growth-returning', String(growth.returningParticipants));
    set('growth-d1', percent(growth.d1.rate));
    set('growth-dates', `${growth.fromDay} → ${growth.throughDay} · UTC · bugün dahil 7 gün${snapshot.mode === 'demo' ? ' · SİMÜLASYON' : ''}`);
    $('demo-tools').hidden = snapshot.mode !== 'demo';
    if (!editing) fillSettings(snapshot.settings);
    const recent = $('audit'); recent.replaceChildren(); for (const row of snapshot.recent.slice(0, 12)) { const n = el('div', 'audit-row'); n.append(el('span', 'mono', new Date(row.at).toLocaleTimeString()), el('span', '', row.kind), el('span', 'muted', row.result)); recent.append(n); }
    set('blocked-count', `${snapshot.blocked.length} engellenmiş kullanıcı`);
  } catch (e) { notice(e instanceof Error ? e.message : 'Panel bağlantısı kesildi', true); } finally { refreshing = false; }
}
function ruleRow(rule: GiftRule): HTMLElement {
  const row = el('div', 'rule-row slime-rule');
  const id = el('input'); id.placeholder = 'Tüm hediyeler'; id.value = rule.giftId; id.dataset.field = 'giftId'; id.setAttribute('aria-label', 'Hediye kimliği');
  const coins = el('input'); coins.type = 'number'; coins.min = '1'; coins.max = '1000000'; coins.value = String(rule.minCoins); coins.dataset.field = 'minCoins'; coins.setAttribute('aria-label', 'Minimum birim jeton');
  const ing = el('select'); ing.dataset.field = 'ingredient'; ing.setAttribute('aria-label', 'Malzeme'); for (const a of INGREDIENTS) { const opt = el('option', '', ingName(a)); opt.value = a; ing.append(opt); } ing.value = rule.ingredient;
  const units = el('input'); units.type = 'number'; units.min = '1'; units.max = '100'; units.value = String(rule.units); units.dataset.field = 'units'; units.setAttribute('aria-label', 'Adet');
  const label = el('input'); label.placeholder = 'Ekranda: Gül'; label.value = rule.label; label.dataset.field = 'label'; label.setAttribute('aria-label', 'Ekrandaki hediye adı');
  const remove = el('button', 'icon-button', '×'); remove.type = 'button'; remove.setAttribute('aria-label', 'Kuralı sil'); remove.onclick = () => { row.remove(); editing = true; };
  row.append(id, coins, ing, units, label, remove); return row;
}
function fillSettings(s: Settings): void {
  for (const k of NUMS) ($(k) as HTMLInputElement).value = String(s[k]);
  ($('locale') as HTMLSelectElement).value = s.locale; ($('goalReward') as HTMLSelectElement).value = s.goalReward;
  for (const k of SWITCHES) ($(k) as HTMLInputElement).checked = s[k];
  $('rules').replaceChildren(...s.giftRules.map(ruleRow));
}
export function mountAdmin(): void {
  $('operator').innerHTML = `<div class="panel-head"><span class="eyebrow">KONTROL ODASI</span><span class="tiny-dot"></span></div>
    <div id="login"><h2>Slime senin<br>kontrolünde.</h2><p class="muted">Yönetim anahtarınla giriş yap. Anahtar yalnızca bu sekmenin belleğinde tutulur.</p>
    <form id="login-form"><label for="admin-token">Yönetim anahtarı</label><input id="admin-token" type="password" autocomplete="off" required placeholder=".env → ADMIN_TOKEN"><button class="button primary" type="submit">Kontrol odasını aç <span>↗</span></button></form></div>
    <div id="controls" hidden><div class="status-line"><strong id="operator-state">—</strong><button id="logout" class="text-button">Çıkış</button></div><p id="provider-detail" class="muted small"></p><p id="voice-detail" class="muted small"></p>
    <div class="button-grid"><button class="button primary" data-control="resume">▶ Başlat</button><button class="button" data-control="pause">Ⅱ Duraklat</button><button class="button" data-control="clear_queue">↻ Sırayı temizle</button><button class="button danger" data-control="panic">■ Acil durdur</button></div>
    <div class="metrics"><div><strong id="metric-events">0</strong><span>Olay · 7 gün</span></div><div><strong id="metric-coins">0</strong><span>Gözlenen jeton*</span></div><div><strong id="metric-players">0</strong><span>Oyuncu · 30 gün</span></div><div><strong id="metric-uptime">0</strong><span>Çalışma süresi</span></div></div><p class="small muted">* Nakit gelir değildir. Demo modunda tümü simülasyondur.</p>
    <details class="growth-metrics"><summary>Katılım ve hediye dönüşümü</summary><p id="growth-dates" class="small muted"></p>
    <div class="metrics"><div><strong id="growth-participants">—</strong><span>Aktif katılımcı</span></div><div><strong id="growth-returning">—</strong><span>2+ gün katılan</span></div><div><strong id="growth-conversion">—</strong><span>Hediye gönderen oranı</span></div><div><strong id="growth-gifters">—</strong><span>Gönderen / katılımcı</span></div></div>
    <p class="growth-d1"><strong id="growth-d1">—</strong> ertesi gün tekrar katılım</p></details>
    <div id="demo-tools"><span class="eyebrow">SADECE DEMO · MALZEME TESTİ</span><div class="test-buttons">${INGREDIENTS.map(a => `<button class="button" data-test="${a}">${ingName(a)}</button>`).join('')}</div></div>
    <details open class="settings-details"><summary>Oyun ve hediye ayarları</summary><form id="settings-form"><div class="field-grid"><label>Dayı hızı (×)<input id="speed" type="number" min="0.25" max="4" step="0.05" required></label><label>Tarif aralığı / sn<input id="recipeEverySec" type="number" min="30" max="3600" required></label><label>Tarif süresi / sn<input id="recipeSeconds" type="number" min="20" max="600" required></label><label>Sessizlikte konuş / sn<input id="chatterSec" type="number" min="8" max="600" required></label><label>Ortak hedef / jeton<input id="goalCoins" type="number" min="10" max="1000000" required></label><label>Hedef ödülü<select id="goalReward">${INGREDIENTS.filter(a => a !== 'su').map(a => `<option value="${a}">${ingName(a)}</option>`).join('')}</select></label></div>
    <label>Dil<select id="locale"><option value="tr">Türkçe</option><option value="en">English</option></select></label><label class="check"><input id="voiceEnabled" type="checkbox">Dayı konuşsun (altyazı + TTS)</label><label class="check"><input id="showNames" type="checkbox">Kullanıcı adlarını göster ve sesli oku</label><label class="check"><input id="chatActions" type="checkbox">Sohbet kelimeleriyle ücretsiz aksiyon (20 sn)</label><label class="check"><input id="chatEcho" type="checkbox">Filtrelenmiş kısa yorumları sesli oku (isimler açıkken)</label><label class="check"><input id="growthEnabled" type="checkbox">Geri dönen izleyiciyi karşıla</label><p class="small muted">Adlar filtreden geçer; uygunsuz adlar yerine "yeğenim" denir.</p>
    <div class="rule-heading slime-rule"><span>Hediye ID</span><span>Jeton ≥</span><span>Malzeme</span><span>Adet</span><span>Ekranda</span></div><div id="rules"></div><button id="add-rule" class="text-button" type="button">+ Hediye kuralı ekle</button><p class="small muted">Önce hediye ID eşleşir, yoksa birim jeton eşiği. "Koruma" malzemeleri anında aktif olur, sıraya girmez.</p><button class="button primary" type="submit">Ayarları kaydet</button></form></details>
    <details><summary>Moderasyon</summary><form id="block-form"><label>Platform kullanıcı ID<input id="block-id" required placeholder="Sayısal ID; kullanıcı adı değil"></label><div class="button-grid"><button class="button" type="submit">Engelle</button><button id="unblock" class="button" type="button">Engeli kaldır</button></div></form><p id="blocked-count" class="small muted"></p><p class="small muted">Sohbet okuma açıksa yalnızca filtreden geçen kısa yorumlar seslendirilir. Kullanıcı ID'leri tek yönlü özetlenir.</p></details>
    <details><summary>Olay günlüğü</summary><div id="audit"></div></details></div>`;
  $('login-form').addEventListener('submit', async e => { e.preventDefault(); token = ($('admin-token') as HTMLInputElement).value.trim(); try { snapshot = await api('state') as AdminSnapshot; ($('admin-token') as HTMLInputElement).value = ''; $('login').hidden = true; $('controls').hidden = false; await refresh(); poll = setInterval(() => void refresh(), 3000); } catch { token = ''; notice('Anahtar doğrulanamadı.', true); } });
  $('logout').onclick = () => { token = ''; if (poll) clearInterval(poll); $('login').hidden = false; $('controls').hidden = true; };
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) button.onclick = async () => {
    const command = button.dataset.control!; if (command === 'clear_queue' && !confirm('Bekleyen tüm malzemeler silinsin mi?')) return;
    try { await api('control', { command }); await refresh(); notice(command === 'panic' ? 'Yayın için hazır durumu kapatıldı.' : 'Komut uygulandı.'); } catch (e) { notice(e instanceof Error ? e.message : 'İşlem başarısız', true); }
  };
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-test]')) button.onclick = async () => { try { await api('test', { ingredient: button.dataset.test as IngredientId, units: 1 }); } catch (e) { notice(String(e), true); } };
  $('settings-form').addEventListener('input', () => editing = true);
  $('add-rule').onclick = () => { if ($('rules').children.length < 32) { $('rules').append(ruleRow({ giftId: '', minCoins: 1, ingredient: 'tutkal', units: 1, label: '' })); editing = true; } };
  $('settings-form').addEventListener('submit', async e => {
    e.preventDefault(); if (!snapshot) return; const settings: Settings = { ...snapshot.settings };
    for (const k of NUMS) settings[k] = Number(($(k) as HTMLInputElement).value);
    settings.locale = ($('locale') as HTMLSelectElement).value as 'tr' | 'en'; settings.goalReward = ($('goalReward') as HTMLSelectElement).value as IngredientId;
    for (const k of SWITCHES) settings[k] = ($(k) as HTMLInputElement).checked;
    settings.giftRules = [...$('rules').children].map(row => { const value = (key: string) => (row.querySelector(`[data-field="${key}"]`) as HTMLInputElement).value; return { giftId: value('giftId').trim(), minCoins: Number(value('minCoins')), ingredient: value('ingredient') as IngredientId, units: Number(value('units')), label: value('label').trim() }; });
    try { await api('settings', settings); editing = false; await refresh(); notice('Ayarlar kaydedildi.'); } catch (e) { notice(e instanceof Error ? e.message : 'Ayarlar geçersiz', true); }
  });
  const block = async (blocked: boolean) => { try { await api('block', { userId: ($('block-id') as HTMLInputElement).value, blocked }); await refresh(); notice('Moderasyon güncellendi.'); } catch (e) { notice(String(e), true); } };
  $('block-form').addEventListener('submit', e => { e.preventDefault(); void block(true); }); $('unblock').onclick = () => void block(false);
  addEventListener('beforeunload', () => { if (poll) clearInterval(poll); token = ''; });
}
