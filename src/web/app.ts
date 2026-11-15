import { MeshLambertMaterial } from 'three';
import type { PublicSnapshot, Speech, RoachDancer } from '../shared/types.js';
import { CATALOG } from '../shared/ingredients.js';
import { DEGRADATION_NAMES, goalTarget } from '../shared/engine.js';
import { Stage } from './scene/stage.js';
import { makeProp } from './scene/effects.js';
import { AudioEngine } from './audio.js';
import { LipSync } from './lipsync.js';
import { $, el, set, icon, ingName, kg, notice } from './dom.js';
import { mountAdmin } from './admin.js';
import type { Expression } from './scene/dayi.js';

const overlay = location.pathname === '/overlay', admin = location.pathname === '/admin';
const params = new URLSearchParams(location.search);
document.body.classList.toggle('overlay-mode', overlay); document.body.classList.toggle('admin-mode', admin); document.body.classList.toggle('wedding-overlay', overlay);
const app = $('app');
const stageHtml = `<div class="stage slime-stage" id="stage"><canvas id="garden" aria-label="Cıvık Dayı canlı slime yayını"></canvas>
<div class="roach-halay" id="roach-halay" hidden aria-live="polite"><div class="roach-wedding-lights">✦ ✧ ✦ ✧ ✦ ✧ ✦</div><div class="roach-wedding-sign">💍 DÜĞÜNÜMÜZE HOŞ GELDİNİZ 💍</div><div class="roach-wedding-couple" id="roach-wedding-couple"></div><div class="roach-line" id="roach-line"></div><div class="roach-wedding-sub">🥁 DAVUL · ZURNA · HALAY 🎺</div><div class="roach-wedding-lights">✧ ✦ ✧ ✦ ✧ ✦ ✧</div></div><div class="roach-gift-guide" id="roach-gift-guide"><b>HALAYA GİRİŞ HEDİYELERİ</b><div id="roach-gift-list"></div></div><div class="hud">
  <section class="hud-card" id="hud-card"><div class="hud-row"><b id="hud-stage"></b><span id="hud-level"></span></div><div class="hud-bar"><i id="hud-progress"></i></div><div class="hud-row hud-small"><span id="hud-water"></span><span class="anger" id="hud-anger"><i id="hud-anger-bar"></i></span></div><div class="teams" id="teams"><i id="team-bar"></i><span id="team-text"></span></div></section>
  <div class="gold-badge" id="gold" hidden>ALTIN SLIME · 2× BÜYÜME <b id="gold-time"></b></div>
  <section class="vote-card goal-card" id="goal" hidden><b id="goal-title"></b><span id="goal-time"></span><div class="goal-bar"><i id="goal-bar"></i></div><p id="goal-copy"></p></section>
  <section class="vote-card" id="vote" hidden><b>DANS OYLAMASI</b><span id="vote-time"></span><ol id="vote-list"></ol><p>Chat'e rakamı yaz!</p></section>
  <div class="caption bubble" id="caption" hidden><span id="caption-text"></span></div>
  <div class="safe-zones" id="safe-zones" hidden><i class="z-top"></i><i class="z-left"></i><i class="z-right"></i><i class="z-chat"></i><i class="z-buttons"></i><i class="z-bottom"></i></div>
</div>
<div class="pause-veil" id="pause-veil" hidden><span>Ⅱ</span><strong id="pause-title">Yayın duraklatıldı</strong><p id="pause-copy">Lütfen şu anda hediye göndermeyin.</p></div></div>`;
app.innerHTML = `<aside class="rail"><a class="brand-mark" href="/" aria-label="Slime"><img src="/icon.svg" alt=""></a><a class="rail-link ${!admin ? 'selected' : ''}" href="/" aria-label="Yayın stüdyosu">◉</a><a class="rail-link ${admin ? 'selected' : ''}" href="/admin" aria-label="Kontrol odası">☷</a><a class="rail-link" href="/overlay" target="_blank" rel="noopener" aria-label="Yayın ekranı">↗</a><span class="rail-bottom">CD</span></aside>
<div class="shell"><header class="topbar"><a href="/" class="wordmark">cıvık<span>dayı</span><span class="wordmark-dot">✳</span></a><span class="top-divider"></span><span class="top-title">DEV SLIME / ${admin ? 'KONTROL ODASI' : 'STÜDYO'}</span><span id="connection" class="connection">Bağlanıyor</span></header>
<main class="workspace"><section class="intro"><span class="eyebrow">HEDİYE AT, SLIME BÜYÜSÜN</span><h1>Masada<br>bir slime.<br><em>Sonu yok.</em></h1><p class="intro-copy">Her hediye bir malzeme.<br>Dayı sırayla döker, yoğurur, konuşur.<br>Slime masadan taşar, odayı doldurur.</p><div class="intro-line"></div><div class="today"><div><strong id="total-mass">0</strong><span>Toplam slime</span></div><div><strong id="recipes">0</strong><span>Tutan tarif</span></div></div><a class="button primary external" href="/overlay" target="_blank" rel="noopener">Yayın ekranını aç <span>↗</span></a><button id="copy-link" class="text-button">OBS bağlantısını kopyala</button><div class="studio-note"><span>↳</span><p>9:16 yayın sahnesi<br><b>Gerçek zamanlı 3D, sunucu otoriteli.</b></p></div></section>
<section class="preview-column"><div class="preview-label"><span><i></i> YAYIN ÖNİZLEMESİ</span><span>9:16</span></div>${stageHtml}<div class="preview-footer"><span id="queue-label">SIRA 0</span><button id="sound" class="text-button" aria-pressed="false">♫ Ses kapalı</button><span id="quality">${params.get('quality') === 'low' ? 'WEBGL · LOW' : 'WEBGL · HIGH'}</span></div></section>
<aside class="right-column"><section class="panel" id="community"><div class="panel-head"><span class="eyebrow">BUGÜNÜN USTALARI</span><span class="pill">UTC</span></div><h2>Slime'ı kim<br>büyütüyor?</h2><div id="leaders" class="leader-list"></div><div class="panel-divider"></div><span class="eyebrow">SIRADAKİLER</span><div id="upcoming" class="activity-list"></div><p class="fine-print" id="mode-note">Demo verileri gerçek gelir değildir.</p></section><section class="panel operator" id="operator"></section><div class="micro-footer">CIVIK DAYI · DEV SLIME</div></aside></main><footer class="page-footer"><span>Bir kase slime ile başladı.</span><span>Cıvık Dayı / 2026</span></footer></div><div id="toast" class="toast" role="status"></div>`;

const audio = new AudioEngine(), lips = new LipSync();
let speech: Speech | null = null, speechSeq = 0, speechMood: Expression | null = null;
const stage = new Stage($('garden') as HTMLCanvasElement, params.get('quality') === 'low', {
  squish: s => audio.squish(s), pour: s => audio.pour(s), chime: () => audio.chime(), pop: () => audio.pop(), boost: on => audio.boost(on), danceTrack: name => audio.danceTrack(name)
});
stage.mouth = () => lips.sample(performance.now(), audio.level());
stage.expression = () => (lips.active ? speechMood : null);
(window as unknown as { __slime: unknown }).__slime = { fps: () => stage.fps, stage, LAMBERT: MeshLambertMaterial, makeProp, audio };
mountAdmin();

let last: PublicSnapshot | null = null, lastReceived = 0, leadersKey = '', upKey = '';
function update(s: PublicSnapshot): void {
  last = s; lastReceived = Date.now();
  stage.update(s);
  const roachLine = $('roach-line');
  const roachHalay = $('roach-halay');
  const roleNames: Record<string, string> = { halaybasi: 'HALAY BAŞI', gelin: 'GELİN', damat: 'DAMAT' };
  const roleEmojis: Record<string, string> = { halaybasi: '👑', gelin: '👰', damat: '🤵' };
  const weddingGifts = s.settings.giftRules.filter(rule => rule.weddingEntry && rule.giftId && rule.minCoins >= 5);
  $('roach-gift-list').innerHTML = weddingGifts.map(rule => `<span class="roach-gift-ticket">🎁 ${escapeHtml(rule.label || 'Özel hediye')} · ${rule.minCoins} 💎</span>`).join('');
  const previewDancers: RoachDancer[] = overlay && params.get('weddingDemo') === '1' && s.dancers.length === 0
    ? Array.from({ length: 30 }, (_, i) => ({ id: `preview-${i}`, name: ['Ayşe', 'Mehmet', 'Zeynep', 'Emre', 'Elif'][i % 5]!, joinedAt: s.now, ...(i === 0 ? { role: 'halaybasi' as const } : i === 1 ? { role: 'gelin' as const } : i === 2 ? { role: 'damat' as const } : {}) }))
    : [];
  const dancers = s.dancers.length ? s.dancers : previewDancers;
  const featured = dancers.filter(d => d.role);
  $('roach-wedding-couple').innerHTML = featured.slice(-3).map(d => `<span class="wedding-role ${d.role}">${roleEmojis[d.role!] ?? '💍'} <b>${roleNames[d.role!] ?? 'DÜĞÜN KONUKLARI'}</b><small>${escapeHtml(d.name)}</small></span>`).join('');
  roachLine.innerHTML = dancers.length ? dancers.map((dancer, i) => `<span class="roach-dancer ${dancer.role ? 'is-featured ' + dancer.role : ''}" style="--dance-delay:${(i % 8) * -0.11}s"><b>${dancer.role ? (roleEmojis[dancer.role!] ?? '🪳') : '🪳'}</b><small>${escapeHtml(dancer.name)}</small></span>`).join('') : (overlay ? '<div class="roach-waiting">🎺 İLK HEDİYEYLE HALAY BAŞLIYOR!<small>5+ jetonluk seçili bir hediye gönder, 30 böcek piste insin.</small></div>' : '');
  roachHalay.hidden = dancers.length === 0 && !overlay;
  audio.halay(dancers.length > 0);
  const g = s.game, d = s.derived;
  set('connection', s.mode === 'demo' ? 'Demo bağlantısı' : s.source.connected ? 'Canlı bağlantı' : 'Kaynak bekleniyor'); $('connection').classList.toggle('offline', !s.source.connected);
  set('total-mass', kg(g.mass)); set('recipes', String(g.recipesDone));
  set('queue-label', `SIRA ${d.queuedTotal}`);
  // Only what TikTok cannot show: the slime's state and the water fight. Gifts, wishes, ranking, goals,
  // joins and follows are TikTok's own UI, and nothing here may cover Dayı's face.
  const lvl = d.milestone;
  set('hud-stage', `${DEGRADATION_NAMES[d.degradation].toLocaleUpperCase('tr')} SLIME`);
  $('hud-card').dataset.stage = d.degradation;
  set('hud-level', `SEVİYE ${lvl.index + 1}`);
  $('hud-progress').style.width = `${(lvl.progress * 100).toFixed(1)}%`;
  set('hud-water', `Sulanma %${d.waterPercent}`);
  $('hud-anger').dataset.stage = d.angerStage;
  $('hud-anger-bar').style.width = `${Math.round(g.anger)}%`;
  // Golden slime (double growth): a badge with the seconds left.
  $('gold').hidden = !(g.bonusMs > 0);
  if (g.bonusMs > 0) set('gold-time', `${Math.ceil(g.bonusMs / 1000)} sn`);
  // Room goals (chat word, like race) and the fastest finger: what to do, progress, seconds left; then the winner.
  const goal = s.show && ['challenge', 'likeGoal', 'fastest'].includes(s.show.type) ? s.show : null;
  $('goal').hidden = !goal;
  if (goal) {
    const left = Math.max(0, Math.ceil((goal.at + goal.durationMs - s.now) / 1000));
    set('goal-time', `${left} sn`);
    if (goal.type === 'fastest') {
      set('goal-title', 'HIZLI PARMAK'); set('goal-copy', goal.winner ? `Kazanan: ${goal.winner}!` : 'İlk "slime" yazan kazanır!');
      $('goal-bar').style.width = goal.winner ? '100%' : '0%';
    } else {
      const g2 = goal.goal ?? { need: 1, got: 0 };
      set('goal-title', goal.type === 'likeGoal' ? 'BEĞENİ YARIŞI' : 'GÖREV');
      set('goal-copy', goal.type === 'likeGoal' ? `${g2.got} / ${g2.need} beğeni → dev kova!` : `${g2.got} / ${g2.need} kişi "yoğur" yazsın → 2× büyüme!`);
      $('goal-bar').style.width = `${Math.round(100 * Math.min(1, g2.got / g2.need))}%`;
    }
  }
  // Dance vote: options, live tally and seconds left.
  const vote = s.show?.type === 'vote' && s.show.votes ? s.show : null;
  $('vote').hidden = !vote;
  if (vote) {
    const names = ['Halay', 'Çiftetelli', 'Horon', 'Erik Dalı'], total = vote.votes!.reduce((a, b) => a + b, 0) || 1;
    $('vote-list').innerHTML = vote.votes!.map((n, i) => `<li><i style="width:${Math.round(100 * n / total)}%"></i><em>${i + 1}</em> ${names[i]}<span>${n}</span></li>`).join('');
    set('vote-time', `${Math.max(0, Math.ceil((vote.at + vote.durationMs - s.now) / 1000))} sn`);
  }
  set('team-text', `SU ${Math.floor(g.teams.water)} — ${Math.floor(g.teams.rescue)} KURTARICI`);
  $('team-bar').style.width = `${g.teams.water + g.teams.rescue ? 100 * g.teams.water / (g.teams.water + g.teams.rescue) : 50}%`;
  // Speech: captions always, voice when available.
  if (s.speech && s.speech.seq !== speechSeq) {
    audio.stopVoice();
    // Voice tags ([laugh], <slow>…</slow>) shape the audio only; captions show the words.
    const words = s.speech.text.replace(/<\/?[a-z]+>|\[[a-z]+\]/gi, '').replace(/\s+/g, ' ').trim();
    speechSeq = s.speech.seq; speech = { ...s.speech, text: words }; speechMood = s.speech.mood;
    // A line that starts in rage plays like a slowed tape, and the black-and-white slow motion lasts until it ends.
    const tape = stage.raging, ms = s.speech.durationMs / (tape ? AudioEngine.TAPE : 1);
    if (tape) stage.extendRage(ms);
    lips.speak(words, ms);
    if (s.speech.audio) audio.playVoice(`/api/voice/${s.speech.audio}`, tape);
  }
  if (!s.speech && speech) { speech = null; speechMood = null; lips.stop(); audio.stopVoice(); }
  const lk = JSON.stringify(s.leaders);
  if (lk !== leadersKey) {
    leadersKey = lk;
    $('leaders').replaceChildren(...s.leaders.slice(0, 5).map((l, i) => { const n = el('div', 'leader-row'); n.append(el('span', 'rank', String(i + 1).padStart(2, '0')), el('span', 'avatar', l.name.slice(0, 1)), el('span', 'leader-name', l.name), el('strong', '', kg(l.points))); return n; }));
    if (!s.leaders.length) $('leaders').append(el('p', 'empty', 'İlk malzemeyi bekliyoruz.'));
  }
  const uk = JSON.stringify(d.upcoming);
  if (uk !== upKey) {
    upKey = uk;
    $('upcoming').replaceChildren(...d.upcoming.slice(0, 5).map(q => { const n = el('div', 'activity-row'); const ic = el('span', 'activity-icon'); ic.innerHTML = icon(q.ing); n.append(ic, el('span', '', `${q.actor} · ${ingName(q.ing)}`), el('b', '', `×${q.n}`)); return n; }));
    if (!d.upcoming.length) $('upcoming').append(el('p', 'empty', 'Sıra boş. Dayı yoğuruyor.'));
  }
  set('mode-note', s.mode === 'demo' ? 'Demo hareketleri otomatik üretilir; gerçek hediye veya gelir değildir.' : 'Beğeniler ve !yoğur komutu da slime\'ı büyütür.');
  $('pause-veil').hidden = !g.paused;
}
// Karaoke captions run on animation frames, independent of the 4 Hz snapshot.
function captions(): void {
  requestAnimationFrame(captions);
  const live = speech && lips.active;
  $('caption').hidden = !live;
  if (live && speech) {
    const n = Math.ceil(lips.progress() * speech.text.length);
    const html = `<em>${escapeHtml(speech.text.slice(0, n))}</em>${escapeHtml(speech.text.slice(n))}`;
    const t = $('caption-text'); if (t.innerHTML !== html) t.innerHTML = html;
  }
}
const escapeHtml = (x: string) => x.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
requestAnimationFrame(captions);

const events = new EventSource('/api/events');
events.addEventListener('state', event => { try { update(JSON.parse((event as MessageEvent<string>).data) as PublicSnapshot); } catch (e) { console.error(e); notice('Yayın verisi okunamadı.', true); } });
events.onerror = () => { set('connection', 'Bağlantı yeniden kuruluyor'); $('connection').classList.add('offline'); };
const stale = setInterval(() => { if (Date.now() - lastReceived > 6000) { $('pause-veil').hidden = false; set('pause-title', 'Bağlantı bekleniyor'); set('pause-copy', 'Lütfen bağlantı gelene kadar hediye göndermeyin.'); } else if (last && !last.game.paused) { set('pause-title', 'Yayın duraklatıldı'); } }, 1000);
$('sound').onclick = async () => { try { if (audio.enabled) audio.disable(); else await audio.enable(); set('sound', audio.enabled ? '♫ Ses açık' : '♫ Ses kapalı'); $('sound').setAttribute('aria-pressed', String(audio.enabled)); } catch { notice('Ses başlatılamadı.', true); } };
$('copy-link').onclick = () => { void navigator.clipboard.writeText(`${location.origin}/overlay?audio=1`).then(() => notice('OBS tarayıcı kaynağı bağlantısı kopyalandı.')).catch(() => notice('Yayın adresi: ' + location.origin + '/overlay?audio=1')); };
if (params.get('audio') === '1') {
  void audio.enable().catch(() => undefined);
  // Browsers keep audio muted until the page is clicked once; OBS and LIVE Studio usually allow it straight away.
  for (const type of ['pointerdown', 'keydown'] as const) addEventListener(type, () => void audio.enable().catch(() => undefined), { once: true });
}
// ?safe=1 draws TikTok's own UI zones over the stage, to check the layout against them.
$('safe-zones').hidden = params.get('safe') !== '1';
addEventListener('beforeunload', () => { events.close(); clearInterval(stale); stage.destroy(); audio.disable(); });
