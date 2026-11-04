import { CATALOG } from '../shared/ingredients.js';
import { badgeName } from '../shared/growth.js';
import type { Welcome } from '../shared/growth.js';
import type { EngineEvent } from '../shared/engine.js';
import type { AngerStage, Degradation, IngredientId, Need, PerformedAction, Protectable, Recipe, ShowType, Speech } from '../shared/types.js';
import { blockedText, cleanChat } from '../../bridges/chat.mjs';

/** Cıvık Böcek: an original, loud, warm Turkish uncle who runs a slime stream. */
const ADDRESS = ['kirvem', 'gülüm', 'abi', 'kardeşim', 'canım', 'diva'];

/** Names are a moderation surface: off by default, sanitized and blocklisted when on. */
export function speakableName(name: string, showNames: boolean): string | null {
  if (!showNames) return null;
  const clean = name.normalize('NFC').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  if (clean.length < 2 || /^viewer\b/i.test(clean)) return null;
  if (blockedText(name)) return null;
  return clean;
}

const STARTED: Record<IngredientId, string[]> = {
  su: ['{ad}, su geliyor! Aman ha, cıvık olmasın!', 'Su ekliyoruz {ad}, azar azar, böceğin usta.', 'Bir bardak su daha! Hadi bakalım {ad}.',
    'Su mu? Peki {ad}, ama kontrollü!', 'Şıpır şıpır su geliyor, sağ ol {ad}.', 'Musluğu açtık {ad}, dikkat taşmasın!'],
  su_koruma: [], ketcap_koruma: [], yumurta_koruma: [],
  tiras_kopugu: ['Tıraş köpüğü! {ad}, bulut gibi oldu bak!', 'Fışşş! Köpük geldi {ad}, kabarıyor kabarıyor!', 'Köpük köpük! Sağ ol {ad}, pamuk gibi!',
    'Berberden yeni çıktım sanki, köpük geldi {ad}!', 'Bu köpükle sakal da tıraş olur, eyvallah {ad}!', 'Kabardı kabardı, {ad} sayesinde!'],
  sim: ['Sim geldi! Pırıl pırıl oldu maşallah.', '{ad}, simi serpiyorum, düğün salonu gibi oldu!', 'Işıl ışıl! Sim yağmuru {ad}!',
    'Gözümüz kamaştı {ad}, ne güzel parlıyor!', 'Simi bol koy dedin, koydum {ad}!', 'Disko topu gibi oldu bu slime!'],
  pudra: ['Pudra döküyoruz, yumuşacık olacak {ad}.', 'Bebek pudrası gibi kokuyor, sağ ol {ad}!', 'Pudra geldi, kadife gibi oldu {ad}.',
    'Hapşu! Pudra burnuma kaçtı {ad}!'],
  boraks: ['Boraks geldi! Şimdi toparlanır bu, sağ ol {ad}.', 'Azıcık boraks, kıvam yerine oturuyor {ad}!', 'Boraks! Bak bak, nasıl toplandı!',
    'İşte ilaç gibi geldi boraks, eyvallah {ad}!', 'Boraksla toparladık, ustalık bu {ad}.'],
  tutkal: ['Tutkal! Koca şişeyi boşaltıyorum {ad}!', 'Tutkal geldi, slime büyüyor büyüyor!', 'Bembeyaz tutkal, oh mis! Eksik olma {ad}.',
    'Tutkal mı dedin {ad}? Al sana tutkal!', 'Bu tutkal kilo aldırır, sağ ol {ad}!', 'Şişenin dibini kazıdım {ad}, hepsi slime\'a!'],
  sampuan: ['Şampuan! Mis gibi kokuyor, eksik olma {ad}.', 'Biraz şampuan, parlasın bu slime!', 'Elma kokulu şampuan, eyvallah {ad}!',
    'Şampuanla yumuşattık, ipek gibi {ad}.'],
  boya: ['Boya geldi! Bakalım ne renk olacak?', '{ad} renk değiştirdi, bayıldım!', 'Boyayı döküyorum, karıştır karıştır!',
    'Yeni renk geldi {ad}, ressam olduk!', 'Rengini sevdim {ad}, sağ ol!'],
  ketcap: ['Ketçap mı?! {ad}, ne yaptın sen!', 'Kim attı bu ketçabı! Patates mi kızartıyoruz?', 'Eyvah eyvah, ketçap! Kıpkırmızı oldu!',
    '{ad}, ketçap atıyorsun ama koruma da alın abiler!', 'Ketçap! Bu slime değil, hamburger oldu!'],
  sirke: ['Sirke! Ooof, salata gibi koktu ortalık.', '{ad} sirke attı! Köpürdü bak köpürdü!', 'Sirke mi? Turşu kuruyoruz galiba {ad}!',
    'Ekşi ekşi koktu, {ad} ne yaptın!'],
  yumurta: ['Yumurta! Çat diye kırdım. {ad}, menemen mi yapıyoruz?', 'Yumurta geldi! Kaygan oldu, tutamıyorum!', 'Yumurtayı attın {ad}, şimdi omlet oldu!',
    'Sarısı ortada, {ad} kahvaltıya mı çağırıyorsun?'],
  boncuk: ['Boncuk geldi! Rengarenk oldu bak {ad}!', 'Boncukları serpiyorum, şıkır şıkır!', 'Nazar boncuğu gibi oldu, sağ ol {ad}!',
    'Boncuk boncuk parlıyor, eyvallah {ad}!'],
  kova: ['DEV KOVA! {ad}, sen nesin be! Hepsini döküyorum!', 'Kova geldi! Herkes geri çekilsin, dökülüyor!', 'Kova mı?! {ad}, adamsın! Döküyorum hepsini!',
    'Bu kova dağ gibi {ad}, slime uçtu!']
};
const BLOCKED: Record<Protectable, string[]> = {
  su: ['Su korumalı {ad}, su yok! Kenara koydum.', 'Ha ha! Koruma var, o su giremez!', 'Su yasak kirvem, kalkan açık!', 'Kalkan var {ad}, su geri döndü!'],
  ketcap: ['Ketçap korumalı! Kurtardık slime\'ı, yaşasın!', 'Ketçap mı? Koruma var, ketçap köfteye gitsin!', 'Ketçap duvara çarptı, koruma sağlam!'],
  yumurta: ['Yumurta koruması aktif, yumurta kahvaltıya!', 'Koruma var, yumurta giremez kirvem!', 'Yumurtayı kenara koydum, kalkan açık!']
};
const PROTECTED = ['{hedef} koruması geldi! {ad} sağ ol, şimdi {hedef} yasak.', '{ad} koruma aldı! {sn} saniye {hedef} yok, rahatız.',
  'Kalkan açıldı! {sn} saniye {hedef} giremez, eyvallah {ad}.', '{ad} slime\'ı korumaya aldı, {hedef} atan boşuna uğraşmasın!'];
const MILESTONE = ['Vay vay vay! Slime {asama} seviyesine geldi! Tam {kg} kilo!', 'Rekor! {asama}! Biz bu işi başardık arkadaşlar!', 'İnanmıyorum! {asama} oldu, {kg} kilo slime!',
  'Yeni seviye: {asama}! Bu yayın tarihe geçer!', '{kg} kilo! {asama} seviyesindeyiz, durmak yok!'];
const RECIPE_NEW = ['Tarif zamanı! {tarif} istiyorum, hadi bakalım!', 'Böceknın tarifi: {tarif}! Tutarsa iki kat büyüme!', 'Yeni tarif: {tarif}. Birlikte yapalım abiler!',
  'Böceknın gizli tarifi geldi: {tarif}!'];
const RECIPE_DONE = ['Tarif tuttu! Bir dakika boyunca iki kat büyüyoruz!', 'Bravo abiler! Tarif tamam, çarpan geldi!', 'Tarif tamam! İki kat, iki kat!'];
const RECIPE_FAILED = ['Tarif tutmadı ama dert değil, devam ediyoruz!', 'Olmadı bu sefer, bir sonrakinde yaparız.', 'Tarif kaçtı, ama slime kaçmaz!'];
/** Dative forms, because Turkish suffixes follow vowel harmony and a template cannot guess them. */
const DATIVE: Partial<Record<IngredientId, string>> = {
  su: 'suya', boraks: 'boraksa', tiras_kopugu: 'tıraş köpüğüne', sim: 'sime', tutkal: 'tutkala', sampuan: 'şampuana',
  pudra: 'pudraya', boya: 'boyaya', boncuk: 'boncuğa', ketcap: 'ketçaba', sirke: 'sirkeye', yumurta: 'yumurtaya', kova: 'kovaya'
};
const NEED: Record<Need['reason'], string[]> = {
  runny: ['Off, çok cıvık oldu. Bu slime\'ın boraksa ihtiyacı var!', 'Akıyor akıyor! Biraz boraks atın abiler.'],
  rubbery: ['Lastik gibi oldu, bu slime\'ın {lazim} ihtiyacı var.', 'Sertleşti bu! {Lazim} lazım, yumuşatalım.'],
  flat: ['Bu slime çok sönük, tıraş köpüğüne ihtiyacı var!', 'Kabarması lazım, köpük gelsin abiler!'],
  dull: ['Parlaklık yok bunda, biraz sim lazım.', 'Sim atın da pırıl pırıl olsun!'],
  grow: ['Kıvam tamam, şimdi büyüme zamanı. Tutkal gelsin!', 'Bu slime\'ın tutkala ihtiyacı var, büyütelim!']
};
/** The ingredient made things worse: say so and name what it actually needs. */
const WRONG: Record<'runny' | 'rubbery', string[]> = {
  runny: ['Off, suya değil boraksa ihtiyacı var.', '{ad}, daha da cıvıdı! Boraks lazım bize.'],
  rubbery: ['Of, iyice sertleşti. Bu slime\'ın {yanlis} değil {lazim} ihtiyacı var.', '{ad}, eyvallah ama taş gibi oldu. {Lazim} lazım!']
};
const GOAL = ['Hedef doldu! Herkese bedava {odul}! Döküyorum!', 'Bravo abiler, ortak hedef tamam! {Odul} geliyor!'];
export const FOLLOW = ['Takip için teşekkürler {ad}, slime ekliyorum!', 'Sağ ol {ad}! Takip geldi, slime ekliyorum!'];
const GIFT_THANKS = ['{ad} buraları aydınlattı! {hediye} için eyvallah abi!', 'Oha {ad}, {hediye}! Makarayız abi, makara!', '{hediye} geldi abi! {ad}, sen bir divasın!',
  'Eyvallah {ad}! {hediye} ile buralar aydınlandı!', '{ad} abi, {hediye} için sağ ol, tutku ya!'];
const JOIN_NAMED = ['{adlar}, memleket nereydi kardeşim? Makarayız abi.', 'Gülüm {adlar}, hoş gelin, buraları bir aydınlat hele...', 'Kirvem {adlar}, hoş geldin, buraları bir aydınlat hele.'];
const JOIN_COUNT = ['Gülüm hoş gelin, buraları bir aydınlat hele...', 'Evet abi divalar geliyor, divayız abi. Slime yaparız.'];
const CHAT_ECHO = ['{ad} diyor ki: {yorum}'];
const WELCOME = ['Kirvem {ad}, hoş geldin, buraları bir aydınlat hele.', '{ad}, memleket nereydi kardeşim? Makarayız abi.', 'Gülüm {ad}, hoş gelin, buraları bir aydınlat hele...'];
const GESTURE = { stretch: ['Uzatıyorum bak! Uzaaaaa!', 'Şuna bak nasıl uzuyor!'], knead: ['Yoğuruyorum, yoğuruyorum...', 'Elimde hamur gibi, oh!'], wave: [] as string[] };
const TEXTURE = {
  runny: ['Eyvah, çok cıvık oldu! Biraz boraks lazım.', 'Su gibi oldu bu, akıyor! Boraks, tutkal, yetişin!'],
  rubbery: ['Lastik gibi oldu bu! Biraz köpük, biraz şampuan lazım.', 'Taş gibi sertleşti, yumuşatalım bunu!'],
  perfect: ['Kıvam tam oldu! Bir buçuk kat büyüme!', 'İşte kıvam bu! İpek gibi!'],
  normal: [] as string[]
};
export const WATER_LINES: Record<AngerStage, string[]> = {
  calm: [],
  request: ['Abiler, su yeter ama, bak cıvıyor.', '{ad}, yavaş! Su değil, boraks lazım.', 'Kim bu kadar su atıyor abiler?'],
  begging: ['Ne olur su atmayın! Elimden akıp gidiyor!', '{ad}, kurban olayım, bir su daha atma!', 'Yalvarıyorum abiler, bu benim emeğim!'],
  angry: ['Yine mi su?! Kaç kere söyledim su atmayın diye!', '{ad}! Gördüm seni! Yeter artık!', 'Of of of! Musluğu açık mı unuttunuz?!'],
  explosion: ['İki gözüm şuraları bir aydınlat hele...']
};
/** The moment his anger tips into fury: the stream goes black and white and slow, and his voice plays like a slowed-down tape. */
const RAGE = ['İki gözüm şuraları bir aydınlat hele...'];
export const STAGE_LINES: Record<Degradation, string[]> = {
  good: ['Oh be, kıvam toparlandı! Ellerinize sağlık!'],
  loose: ['Cıvımaya başladı! Abiler, suyu kesin!'],
  flowing: ['Elimden akıyor! Boraks lazım, yetişin!'],
  soup: ['Eyvah! Slime çorba oldu! Boraks atın, kurtarın!']
};
/** Water while he is already upset: short, named and fed up, never the cheerful pour line. */
export const WATER_ANNOYED = ['{ad}, yine mi su?!', 'Su mu yine {ad}? Of of!', '{ad}, bari boraks atsaydın!', 'Gene su! {ad}, sana ne yaptım ben?'];
export const BAIT = ['Kıvam mükemmel. Sakın ha, sakın su atmayın!', 'Şu an kimse su atmasın, bak uyarıyorum!'];
export const RESCUE = ['{ad} kurtardı! Slime toparlanıyor, aslansın!', 'Kurtarıcımız {ad}! İyi ki varsın!'];
export const WATER_SHIELD = ['Koruma geldi! {ad} sağ olsun, su giremez!'];
const SHOW: Record<ShowType, string[]> = {
  rage: ['İki gözüm şuraları bir aydınlat hele...'],
  vote: ['Dans oylaması abi! Bir twist, iki tavuk, üç kongo, dört Osman Tuş! Yazın!'],
  rain: ['Ben divayım, divalar slime yapar...'], bucket: ['Abi slime ya, tutku ya...'],
  challenge: ['Üç kişi yoğur yazarsa slime iki kat büyür abi!'], likeGoal: ['Yüz beğeni gelirse dev kova abi! Basın!'], fastest: ['İlk slime yazan kazanır abi!'],
  quietDance: [], wave: ['Kirvem hoş geldin, buraları bir aydınlat hele.'], party: ['Böceğiz di mi abi, komiğiz di mi abi...'],
  dance: ['Evet abi divalar geliyor, divayız abi. Slime yaparız.'], blackout: ['İki gözüm şuraları bir aydınlat hele...'],
  golden: ['Abi slime ya, tutku ya... Şimdi gelen her şey iki kat!'], joke: ['Böceğiz di mi abi, komiğiz di mi abi...']
};
/** Lines for his own pours, when nobody is sending anything: he keeps making slime and talks about it. */
export const SELF_ACTOR = 'Cıvık Böcek';
/** His own pours are quiet: he says enough already. */
const SELF: Partial<Record<IngredientId, string[]>> = {};
/** He tells the room how to play: what to write, what each gift does. Gift lines are filled from the menu. */
const HOWTO = [] as string[];
const HOWTO_GIFT = [] as string[];
const GOAL_WIN = { challenge: ['Başardınız abiler! Çift büyüme açıldı!', 'Oley! Görev tamam, slime uçuyor!'], likeGoal: ['Yüz beğeni! Söz verdim, dev kova geliyor!', 'Bravo abiler! Dev kova sizin için!'] };
const GOAL_LOSE = { challenge: ['Olmadı abiler, bir dahakine daha hızlı!'], likeGoal: ['Yetmedi be abiler! Bir dahakine daha çok basın!'] };
const FASTEST_WIN = ['En hızlı {ad}! Bugünün hızlı parmağı sensin!', 'Kazanan {ad}! Şimşek gibi kirvem!'];
const FASTEST_NONE = ['Kimse yazmadı mı? Uyuyor musunuz abiler!'];
const VOTE_WIN = ['Kazanan {dans}! Hadi bakalım, müzik!', 'Oylar geldi, {dans} kazandı! Başlıyorum!'];
const BLACKOUT_BACK = ['Abi slime ya, tutku ya...'];
const CHATTER = ['Makarayız abi, slime yapıyoruz abi canlı yayın abi...', 'Böceğiz di mi abi, komiğiz di mi abi...', 'Abi slime ya, tutku ya...', 'Ben divayım, divalar slime yapar...', 'Evet abi divalar geliyor, divayız abi. Slime yaparız.'];

export const kgText = (grams: number): string => {
  const kg = grams / 1000;
  return kg >= 1000 ? Math.round(kg).toLocaleString('tr-TR') : kg.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
};
export function recipeText(r: Recipe): string {
  return Object.entries(r.items).map(([k, n]) => `${n} ${CATALOG[k as IngredientId].name.toLocaleLowerCase('tr')}`).join(', ');
}

function render(raw: string, vars: Record<string, string>): string {
  let out = raw.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  // A missing name leaves a dangling comma or space; tidy it.
  out = out.replace(/\s+,/g, ',').replace(/,\s*([!?.])/g, '$1').replace(/^,\s*/, '').replace(/\s{2,}/g, ' ').trim();
  return out.charAt(0).toLocaleUpperCase('tr') + out.slice(1);
}
/** Keep captions and warm-up audio identical, including shortened old templates. */
function shortSpeech(text: string): string { return text.length <= 60 ? text : text.slice(0, 59).replace(/\s+\S*$/, '').replace(/[,;:]$/, '') + '…'; }
/**
 * Every line that can be said without a live value: fixed lines, plus lines whose only blank is the
 * viewer's address when names are off. Voicing these before the stream makes most speech instant.
 */
export function warmLines(): string[] {
  const lists = [...Object.values(STARTED), ...Object.values(BLOCKED), PROTECTED, RECIPE_DONE, RECIPE_FAILED, ...Object.values(NEED),
    FOLLOW, HOWTO, FASTEST_NONE, ...Object.values(GOAL_WIN), ...Object.values(GOAL_LOSE), ...Object.values(SELF), ...Object.values(SHOW), BLACKOUT_BACK, ...Object.values(GESTURE), ...Object.values(TEXTURE), ...Object.values(WRONG), CHATTER, GIFT_THANKS.map(l => l.replace('{hediye}', 'hediyen')),
    ...Object.values(WATER_LINES), RAGE, ...Object.values(STAGE_LINES), BAIT, RESCUE, WATER_SHIELD, WATER_ANNOYED];
  const out = new Set<string>();
  for (const raw of lists.flat()) {
    const blanks = new Set([...raw.matchAll(/\{(\w+)\}/g)].map(m => m[1]));
    if (!blanks.size) out.add(render(raw, {}));
    // One form per line (the first address); the other forms are voiced the first time they are said.
    else if (blanks.size === 1 && blanks.has('ad')) out.add(render(raw, { ad: ADDRESS[0]! }));
  }
  return [...new Set([...out].map(shortSpeech))];
}

const PERSONA = new Set<string[]>([CHATTER, JOIN_NAMED, JOIN_COUNT, WELCOME, BLACKOUT_BACK, ...Object.values(SHOW)]);
interface Line { text: string; priority: number; mood: Speech['mood']; at: number; action: boolean; key: string; cooldownMs: number; prefetched?: boolean }
export class Director {
  private seq = 0;
  private pick = 7;
  private pending: Line[] = [];
  current: Speech | null = null;
  private busyUntil = 0;
  lastSpokeAt = 0;
  private lastTexture = 'perfect';
  private delivered = new Map<string, number>();
  private generation = 0; private currentPriority = 0;
  private joins = 0; private joinNames: string[] = []; private joinAt = 0;
  private activeAt = -Infinity;
  /** The room's anger stage, kept current by the service so pour lines match his mood. */
  anger: AngerStage = 'calm';
  private thankTurn = false;
  /** Game clock, advanced by tick(); simulations run faster than the wall clock. */
  private clock = Date.now();
  /** waitMs: how long a new line may wait for its audio before it goes out as a caption only. */
  constructor(private readonly synth?: (text: string) => Promise<{ file: string; durationMs: number | null } | null>, private readonly waitMs = 4000) {}
  /** Shuffle bags: every line of a list is used once before any repeats, never twice in a row. */
  // Weak keys: a list that is no longer referenced takes its bag with it.
  private bags = new WeakMap<string[], number[]>();
  private lastPicked = new WeakMap<string[], number>();
  private choose(list: string[], vars: Record<string, string>): string {
    let bag = this.bags.get(list);
    if (!bag || !bag.length) {
      bag = list.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) { this.pick = (this.pick * 1103515245 + 12345) >>> 0; const j = this.pick % (i + 1); [bag[i], bag[j]] = [bag[j]!, bag[i]!]; }
      if (bag.length > 1 && bag[bag.length - 1] === this.lastPicked.get(list)) bag.unshift(bag.pop()!);
      this.bags.set(list, bag);
    }
    const index = bag.pop()!; this.lastPicked.set(list, index);
    return render(list[index] ?? '', vars);
  }
  private address(name: string | null): string { return name ?? ADDRESS[this.pick % ADDRESS.length]!; }
  setClock(now: number): void { this.clock = now; }
  /** Cancels stale names and any outstanding synthesis publication. */
  clear(): void { this.generation++; this.pending = []; this.current = null; this.busyUntil = 0; this.currentPriority = 0; this.joins = 0; this.joinNames = []; this.activeAt = -Infinity; }
  roomActive(): void { this.activeAt = this.clock; }
  join(name: string | null): void {
    if (!this.joins) this.joinAt = this.clock;
    this.joins = Math.min(1000000, this.joins + 1);
    const safe = name && speakableName(name, true);
    if (safe && this.joinNames.length < 5) this.joinNames.push(safe);
  }
  private welcomeBatch(): void {
    if (!this.joins || this.clock - this.joinAt < 6000) return;
    const names: string[] = [];
    for (const name of this.joinNames) if (`Hoş geldiniz ${[...names, name].join(', ')}!`.length <= 60) names.push(name);
    const accepted = names.length ? this.say(JOIN_NAMED, { adlar: names.join(', ') }, 3, 'happy', false, '', 'join', 6000)
      : this.say(JOIN_COUNT, { sayi: String(this.joins) }, 3, 'happy', false, '', 'join', 6000);
    if (accepted) { this.joins = 0; this.joinNames = []; }
  }
  echo(name: string | null, text: string): boolean {
    const safe = cleanChat(text), actor = name && speakableName(name, true);
    return !!safe && !!actor && this.say(CHAT_ECHO, { ad: actor, yorum: safe }, 2, 'happy', false, '', 'echo', 20000);
  }
  gift(name: string | null, giftName: string, big = false): void {
    const ad = name ? name.split(' ')[0]!.slice(0, 12) : 'kirvem';
    this.say(GIFT_THANKS, { ad, hediye: cleanChat(giftName).slice(0, 28) || 'hediyen' }, big ? 5 : 4, big ? 'excited' : 'happy', true);
  }
  say(list: string[], vars: Record<string, string>, priority: number, mood: Speech['mood'] = 'happy', action = false, suffix = '', key = '', cooldownMs = 0): boolean {
    if (!list.length) return false;
    // A quiet dance break: only the big moments (rage, rescue, soup) break the silence.
    if (this.clock < this.quietUntil && priority < 6) return false;
    if (key && (this.clock - (this.delivered.get(key) ?? -Infinity) < cooldownMs || this.pending.some(l => l.key === key))) return false;
    // His catchphrases are never repeated within 90 s; game lines (water, needs, gifts) may come again.
    const fresh = PERSONA.has(list) ? list.filter(l => !this.recentlySaid(render(l, vars))) : list;
    if (!fresh.length) return false;
    const text = shortSpeech(this.choose(fresh, vars) + suffix);
    if (!text) return false;
    // Only the newest action comment matters; older ones would describe the wrong pour.
    if (action) this.pending = this.pending.filter(l => !l.action || l.priority > priority);
    // Low priority lines are dropped under pressure rather than piling up behind the action.
    if (this.pending.length >= 3) {
      const low = this.pending.findIndex(l => l.priority < priority);
      if (low < 0) return false;
      this.pending.splice(low, 1);
    }
    if (priority >= 6 && priority > this.currentPriority) { this.generation++; this.busyUntil = this.clock; this.current = null; }
    this.pending.push({ text, priority, mood, at: this.clock, action, key, cooldownMs });
    this.pending.sort((a, b) => b.priority - a.priority);
    return true;
  }
  onEvent(e: EngineEvent, name: (actor: string) => string | null, mass: number): void {
    if (e.type === 'started') {
      const a = e.action;
      if (a.actor === SELF_ACTOR) { this.say(SELF[a.ing] ?? [], {}, 1, 'happy', true, '', `self:${a.ing}`, 15000); return; }
      if (a.ing === 'su' && !a.blocked && this.anger !== 'calm') {
        this.say(WATER_ANNOYED, { ad: this.address(name(a.actor)) }, 3, this.anger === 'request' || this.anger === 'begging' ? 'begging' : 'angry', true, '', 'water:annoyed', 4000);
        return;
      }
      // Thanks by gift name alternate with the ingredient's own joke; big gifts are always thanked.
      if (a.giftName && (a.ing === 'kova' || a.n >= 5 || (this.thankTurn = !this.thankTurn))) return this.gift(name(a.actor), a.giftName, a.ing === 'kova' || a.n >= 5);
      if (a.blocked) { this.say(BLOCKED[a.ing as Protectable] ?? [], { ad: this.address(name(a.actor)) }, 2, 'excited', true); return; }
      const lines = STARTED[a.ing], vars = { ad: this.address(name(a.actor)) };
      const chaos = a.ing === 'ketcap' || a.ing === 'yumurta' || a.ing === 'sirke';
      const big = a.ing === 'kova' || a.n >= 5;
      this.say(lines, vars, big || chaos ? 2 : 1, chaos ? 'shock' : big ? 'excited' : 'happy', true, a.n > 1 ? ` Tam ${a.n} tane!` : '');
    } else if (e.type === 'protected') {
      if (e.giftName) return this.gift(name(e.actor), e.giftName);
      this.say(PROTECTED, { ad: this.address(name(e.actor)), hedef: CATALOG[e.target].name.toLocaleLowerCase('tr'), sn: String(Math.round(e.ms / 1000)) }, 2, 'excited');
    } else if (e.type === 'water') {
      const stage = e.explosion ? 'explosion' : e.anger === 'explosion' ? 'angry' : e.anger;
      const mood = stage === 'request' || stage === 'begging' ? 'begging' : stage === 'angry' ? 'angry' : stage === 'explosion' ? 'explosion' : 'calm';
      // Tipping into fury gets the slow rage line, in step with the black-and-white slow motion on screen.
      const lines = stage === 'angry' && e.changed ? RAGE : WATER_LINES[stage];
      this.say(lines, { ad: this.address(name(e.actor)) }, e.explosion ? 8 : e.changed ? 6 : 4, mood, true, '', `water:${stage}`, e.explosion ? 60000 : 5000);
    } else if (e.type === 'degradation') {
      this.say(STAGE_LINES[e.stage], {}, e.stage === 'soup' ? 7 : 6, e.stage === 'good' ? 'happy' : 'begging', true, '', `stage:${e.stage}`, 5000);
    } else if (e.type === 'rescued') {
      // A rescue is a headline moment: it outranks ordinary water complaints and may cut in.
      this.say(e.ing === 'su_koruma' ? WATER_SHIELD : RESCUE, { ad: this.address(name(e.actor)) }, 7, 'excited', true, '', 'rescue', 6000);
    } else if (e.type === 'milestone') {
      this.say(MILESTONE, { asama: e.milestone.name, kg: kgText(mass) }, 3, 'excited');
    } else if (e.type === 'recipe_new') this.say(RECIPE_NEW, { tarif: recipeText(e.recipe) }, 3, 'excited');
    else if (e.type === 'recipe_done') this.say(RECIPE_DONE, {}, 3, 'excited');
    else if (e.type === 'recipe_failed') this.say(RECIPE_FAILED, {}, 1, 'calm');
  }
  /** Tells the room what to send next. */
  needCall(n: Need): void {
    const lazim = DATIVE[n.ing] ?? CATALOG[n.ing].name;
    this.say(NEED[n.reason], { lazim, Lazim: CATALOG[n.ing].name }, 1, n.reason === 'grow' ? 'excited' : 'calm');
  }
  /** Reacts when a pour pushed the texture the wrong way. */
  private lastWrongAt = -Infinity;
  wrongPour(a: PerformedAction, n: Need, name: string | null): boolean {
    // A room spamming the cheapest gift should not hear the same complaint every pour.
    if (this.clock - this.lastWrongAt < 20000) return false;
    if (a.blocked || (n.reason !== 'runny' && n.reason !== 'rubbery') || a.ing === n.ing) return false;
    const dir = CATALOG[a.ing].consistency;
    if ((n.reason === 'runny' && dir >= 0) || (n.reason === 'rubbery' && dir <= 0)) return false;
    this.lastWrongAt = this.clock;
    this.say(WRONG[n.reason], { ad: this.address(name), yanlis: DATIVE[a.ing] ?? CATALOG[a.ing].name.toLocaleLowerCase('tr'), lazim: DATIVE[n.ing] ?? CATALOG[n.ing].name, Lazim: CATALOG[n.ing].name }, 2, 'shock');
    return true;
  }
  private lastGoalAt = -Infinity;
  private lastBaitAt = -Infinity;
  bait(): void {
    if (this.clock - this.lastBaitAt < 60000 || this.clock - this.lastSpokeAt < 10000) return;
    this.lastBaitAt = this.clock; this.say(BAIT, {}, 0, 'happy');
  }
  goal(reward: IngredientId): void {
    // Several bars can fill in a rush; one announcement per half minute is plenty.
    if (this.clock - this.lastGoalAt < 30000) return;
    this.lastGoalAt = this.clock;
    this.say(GOAL, { odul: CATALOG[reward].name.toLocaleLowerCase('tr'), Odul: CATALOG[reward].name }, 2, 'excited');
  }
  /** A show starts: he announces it (the blackout also gets a line when the lights come back). */
  show(type: ShowType): void { if (!SHOW[type].length) return; this.say(SHOW[type], {}, 5, type === 'blackout' ? 'shock' : 'excited', false, '', `show:${type}`, 20000); }
  private quietUntil = 0;
  private readonly saidAt = new Map<string, number>();
  private recentlySaid(text: string): boolean { const at = this.saidAt.get(shortSpeech(text)); return at !== undefined && this.clock - at < 90000; }
  /** He keeps quiet until `until` (and drops what was waiting to be said). */
  quiet(until: number): void { this.quietUntil = until; this.pending = this.pending.filter(l => l.priority >= 6); }
  /** One line telling the room how to steer him: a chat word, or what a gift does. */
  howto(gift: { hediye: string; malzeme: string } | null): void {
    if (gift) this.say(HOWTO_GIFT, gift, 1, 'excited', false, '', 'howto', 15000);
    else this.say(HOWTO, {}, 1, 'excited', false, '', 'howto', 15000);
  }
  goalResult(kind: 'challenge' | 'likeGoal', won: boolean): void { this.say(won ? GOAL_WIN[kind] : GOAL_LOSE[kind], {}, 6, won ? 'excited' : 'begging', false, '', `goal:${kind}`, 10000); }
  fastest(name: string | null): void { if (name) this.say(FASTEST_WIN, { ad: name }, 6, 'excited', false, '', 'fastest', 8000); else this.say(FASTEST_NONE, {}, 4, 'calm'); }
  voteWinner(dance: string): void { this.say(VOTE_WIN, { dans: dance }, 6, 'excited', false, '', 'vote:win', 10000); }
  lightsBack(): void { this.say(BLACKOUT_BACK, {}, 4, 'happy'); }
  follow(name: string | null): void { this.say(FOLLOW, { ad: this.address(name) }, 4, 'happy'); }
  welcome(w: Welcome, name: string | null): void { if (name) this.say(WELCOME, { ad: name, rozet: badgeName(w.badge) }, 3, 'happy', false, '', 'join', 6000); }
  gesture(type: 'stretch' | 'knead' | 'wave'): void { this.say(GESTURE[type], {}, 0, 'happy'); }
  texture(t: 'runny' | 'perfect' | 'normal' | 'rubbery'): void {
    if (t !== this.lastTexture) { this.lastTexture = t; this.say(TEXTURE[t], {}, 1, t === 'perfect' ? 'excited' : 'shock'); }
  }
  /** Returns true when a new line went live. */
  tick(now: number, mass: number, chatterSec: number, enabled: boolean): boolean {
    this.clock = now;
    if (!enabled) { this.clear(); return false; }
    this.welcomeBatch();
    if (now < this.busyUntil) {
      // While he talks, voice the line that is next in turn so it does not go stale waiting for audio.
      const next = this.pending[0];
      if (this.synth && next && !next.prefetched) { next.prefetched = true; void this.synth(next.text).catch(() => undefined); }
      return false;
    }
    if (!this.pending.length && (now - this.lastSpokeAt > chatterSec * 1000 || (now - this.activeAt < 10000 && now - this.busyUntil >= 2000))) this.say(CHATTER, { kg: kgText(mass) }, 0, 'calm');
    // Stale chatter about a pour that already finished is dropped; milestones and recipes keep.
    this.pending = this.pending.filter(l => now - l.at < (l.priority >= 3 ? 15000 : 5000) && (!l.key || now - (this.delivered.get(l.key) ?? -Infinity) >= l.cooldownMs));
    const line = this.pending.shift();
    if (!line) return false;
    const durationMs = Math.max(1400, line.text.length * 48 + 350);
    const seq = ++this.seq;
    if (line.key) this.delivered.set(line.key, now);
    this.saidAt.set(line.text, now);
    this.currentPriority = line.priority;
    const generation = ++this.generation;
    this.busyUntil = now + durationMs + 350; this.lastSpokeAt = now;
    this.current = { seq, text: line.text, audio: null, at: now, durationMs, mood: line.mood };
    if (this.synth) {
      // Hold the line briefly for audio; publish text-only if synthesis is slow or fails.
      const held = this.current;
      this.current = null; this.busyUntil = now + this.waitMs + 500;
      let done = false;
      const publish = (clip: { file: string; durationMs: number | null } | null): void => {
        if (done || generation !== this.generation) return; done = true;
        const at = Date.now();
        if (line.key) this.delivered.set(line.key, at);
        // Real audio length drives captions, lip sync and the next line, so speech is never cut off.
        const durationMs = clip?.durationMs ? Math.max(1400, clip.durationMs + 250) : held.durationMs;
        this.current = { ...held, audio: clip?.file ?? null, at, durationMs };
        this.busyUntil = at + durationMs + 350; this.lastSpokeAt = at;
      };
      const timer = setTimeout(() => publish(null), this.waitMs);
      void this.synth(line.text).then(c => { clearTimeout(timer); publish(c); }, () => { clearTimeout(timer); publish(null); });
    }
    return true;
  }
  live(now: number): Speech | null {
    return this.current && now - this.current.at < this.current.durationMs + 1500 ? this.current : null;
  }
}
