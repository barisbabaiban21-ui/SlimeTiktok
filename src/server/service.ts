import { randomUUID } from 'node:crypto';
import { addGoal, advance, angerStage, derive, enqueue, freeAction, freeIngredient, freshState, need, restoredState, texture } from '../shared/engine.js';
import { chatCommand, cleanChat } from '../../bridges/chat.mjs';
import type { EngineEvent } from '../shared/engine.js';
import { CATALOG } from '../shared/ingredients.js';
import { defaultSettings, parseSettings } from '../shared/validation.js';
import type { Activity, AdminSnapshot, GameState, IngredientId, LiveEvent, MenuRow, Mode, PublicSnapshot, Settings, Show, ShowType } from '../shared/types.js';
import { pseudonym } from './security.js';
import { Store } from './store.js';
import { EngagementStore } from './engagement.js';
import type { Welcome } from '../shared/growth.js';
import { Director, SELF_ACTOR, speakableName } from './dialogue.js';
import { VoiceService } from './voice.js';

/** Base grams per second that likes and chat commands can add across the whole room. */
const FREE_GRAMS_PER_SECOND = 30;
const DEMO_NAMES = ['Ayşe', 'Mehmet', 'Zeynep', 'Emre', 'Elif', 'Burak', 'Selin', 'Can'];

export class GameService {
  readonly engagement: EngagementStore;
  readonly director: Director;
  private welcome: Welcome | null = null;
  state: GameState;
  settings: Settings;
  armed = false;
  source = { connected: false, provider: 'none', lastHeartbeat: 0 };
  private activity: Activity[] = [];
  /** Rose senders join the on-screen cockroach halay; names are sanitized before display. */
  private dancers: { id: string; name: string; joinedAt: number }[] = [];
  private activitySeq = 0;
  private lastSave = 0;
  private lastPrune = 0;
  private lastDemo = 0;
  private demoStep = 0;
  /** Spoken names stay in memory only, keyed by the on-screen actor label. */
  private spoken = new Map<string, string>();
  readonly startedAt = Date.now();
  constructor(readonly store: Store, readonly mode: Mode, private readonly secret: string, readonly voice = new VoiceService(null, ':memory:')) {
    // Demo viewers are fictional, so their names are shown; live rooms start anonymous.
    this.settings = parseSettings({ chatEcho: mode === 'demo', ...(store.get<Partial<Settings>>('settings') ?? { ...defaultSettings(), showNames: mode === 'demo', chatEcho: mode === 'demo' }) });
    const saved = store.get('state');
    this.state = saved ? restoredState(saved, this.settings) : freshState(this.settings);
    // Demo and real gifts must NEVER share the same database or scoreboard.
    const savedMode = store.get<Mode>('mode');
    if (savedMode && savedMode !== mode) throw new Error('Use a separate database for demo and live');
    store.set('mode', mode);
    this.engagement = new EngagementStore(store);
    this.director = new Director(voice.ready ? text => voice.request(text) : undefined, voice.waitMs);
    if (mode === 'live') { this.state.paused = true; this.state.pauseReason = 'operator_required'; }
    else this.source = { connected: true, provider: 'simulator', lastHeartbeat: Date.now() };
    store.transaction(() => store.save(this.state, this.settings));
  }
  private nameOf = (actor: string): string | null => speakableName(this.spoken.get(actor) ?? actor, this.settings.showNames);
  /** Funny titles for the room's regulars: the top water thrower and the top rescuer (3 or more), as he says their name. */
  private readonly titles = new Map<string, string>();
  private readonly waterBy = new Map<string, number>(); private readonly rescueBy = new Map<string, number>();
  private titledName = (actor: string): string | null => {
    const name = this.nameOf(actor); if (!name) return name;
    const top = (m: Map<string, number>) => { let best = '', n = 0; for (const [k, v] of m) if (v > n) { best = k; n = v; } return n >= 3 ? best : ''; };
    const given = this.titles.get(actor); if (given) return `${given} ${name}`;
    if (top(this.waterBy) === actor) return `Su Teröristi ${name}`;
    if (top(this.rescueBy) === actor) return `Baş Kurtarıcı ${name}`;
    return name;
  };
  /** When nobody sends anything he keeps making slime himself: a small pour every 10-15 s, what the slime needs if he can. */
  private lastGiftAt = 0; private nextSelfAt = Date.now() + 8000;
  private selfMake(now: number): void {
    const s = this.state;
    if (s.paused || s.current || s.queue.length || now < this.nextSelfAt || now - this.lastGiftAt < 8000 || s.anger >= 45 || (this.show && this.show.type !== 'golden')) return;
    this.nextSelfAt = now + 10000 + Math.random() * 5000;
    const pool: IngredientId[] = ['tutkal', 'tutkal', 'boya', 'sim', 'tiras_kopugu', 'sampuan', 'boncuk', 'pudra'];
    const n = need(s).ing, ing = pool.includes(n) || n === 'boraks' ? n : pool[Math.floor(Math.random() * pool.length)]!;
    const out = enqueue(s, this.settings, ing, 1, SELF_ACTOR);
    this.state = out.state; this.react(out.events);
  }
  private lastJoinPour = 0; private nextHowtoAt = Date.now() + 40000;
  private vote: { seq: number; votes: number[]; voters: Set<string>; endsAt: number } | null = null;
  private static readonly DANCE_FOR_OPTION = [0, 2, 4, 5]; // vote 1 twist, 2 chicken, 3 conga, 4 Osman Tuş
  private static readonly DANCE_NAMES = ['twist', 'tavuk dansı', 'kongo', 'Osman Tuş'];
  /** Every 40-60 s (when he is free) he tells the room how to play: a chat word or what a gift does. */
  private howto(now: number): void {
    if (this.state.paused || now < this.nextHowtoAt) return;
    this.nextHowtoAt = now + 40000 + Math.random() * 20000;
    const rows = this.menu().filter(r => r.kind !== 'protect' && r.label && !/jeton|Hediye \d/.test(r.label));
    if (rows.length && Math.random() < 0.5) {
      const r = rows[Math.floor(Math.random() * rows.length)]!;
      this.director.howto({ hediye: r.label, malzeme: r.name.toLocaleLowerCase('tr') });
    } else this.director.howto(null);
  }
  private goalUsers = new Set<string>();
  /** A room goal resolved: a win pays out (double growth, or his giant bucket) with a party. */
  private goalDone(kind: 'challenge' | 'likeGoal', won: boolean): void {
    this.director.goalResult(kind, won);
    if (!won) return;
    if (kind === 'challenge') this.state.bonusMs = Math.max(this.state.bonusMs, 30000);
    else { const out = enqueue(this.state, this.settings, 'kova', 1, SELF_ACTOR); this.state = out.state; this.react(out.events); }
  }
  private show: Show | null = null; private showSeq = 0; private nextShowAt = Date.now() + 30000; private lastShow: ShowType | '' = ''; private lightsBackAt = 0;
  /** Between gifts, every few minutes (faster in the demo), when he is not angry: a short show. */
  private shows(now: number): void {
    if (this.lightsBackAt && now >= this.lightsBackAt) { this.lightsBackAt = 0; this.director.lightsBack(); }
    // Time paused (before Start, or while the source is down) does not count: the first show comes a while after.
    if (this.state.paused) { this.nextShowAt = Math.max(this.nextShowAt, now + 30000); this.nextSelfAt = Math.max(this.nextSelfAt, now + 8000); return; }
    // The vote closes into the winning dance, with the mirror ball.
    if (this.vote && now >= this.vote.endsAt) {
      const v = this.vote.votes, best = v.reduce((b, n, i) => (n > v[b]! ? i : b), Math.floor(Math.random() * 4));
      const variant = GameService.DANCE_FOR_OPTION[best]!;
      this.vote = null;
      this.show = { seq: ++this.showSeq, type: 'dance', at: now, durationMs: 12000, variant, disco: true };
      this.lastShow = 'vote';
      this.director.voteWinner(GameService.DANCE_NAMES[best]!);
      return;
    }
    // Room goals and the fastest finger end with a verdict.
    if (this.show && now > this.show.at + this.show.durationMs) {
      const sh = this.show;
      if ((sh.type === 'challenge' || sh.type === 'likeGoal') && sh.goal) this.goalDone(sh.type, sh.goal.got >= sh.goal.need);
      if (sh.type === 'fastest' && !sh.winner) this.director.fastest(null);
    }
    if (this.show && now > this.show.at + this.show.durationMs) this.show = null;
    if ((this.show && this.show.type !== 'golden') || this.state.paused || now < this.nextShowAt) return;
    // Only an explosion holds a show back; an angry Dayı still dances (and it is funnier).
    if (this.state.elapsedMs < this.state.explosionUntilMs) { this.nextShowAt = now + 5000; return; }
    // Dances come up most (a chat vote picks some of them); golden slime and the power cut are rarer treats.
    // Dances dominate: a fast, fun stream. The rest keep it surprising.
    const pool: ShowType[] = ['vote', 'vote', 'dance', 'dance', 'dance', 'dance', 'quietDance', 'quietDance', 'likeGoal', 'challenge', 'fastest', 'rain', 'bucket', 'joke', 'party', 'golden', 'blackout', 'rage', 'rage'];
    const kinds = pool.filter(k => k !== this.lastShow && !(k === 'golden' && this.state.bonusMs > 0));
    const type = kinds[Math.floor(Math.random() * kinds.length)]!;
    const durationMs = { dance: 10000, quietDance: 14000, blackout: 3200, golden: 45000, joke: 5500, wave: 4500, party: 5000, vote: 15000,
      rain: 6000, bucket: 6000, challenge: 20000, likeGoal: 30000, fastest: 15000, rage: 6000 }[type];
    this.show = { seq: ++this.showSeq, type, at: now, durationMs, variant: [0, 1, 2, 3, 4, 4, 5, 5][Math.floor(Math.random() * 8)]!, disco: Math.random() < 0.85 };
    if (type === 'challenge') { this.show.goal = { need: 3, got: 0 }; this.goalUsers = new Set(); }
    if (type === 'likeGoal') this.show.goal = { need: 100, got: 0 };
    if (type === 'bucket') { const out = enqueue(this.state, this.settings, 'kova', 1, SELF_ACTOR); this.state = out.state; this.react(out.events); }
    if (type === 'vote') { this.show.votes = [0, 0, 0, 0]; this.vote = { seq: this.show.seq, votes: this.show.votes, voters: new Set(), endsAt: now + durationMs }; }
    this.lastShow = type;
    if (type === 'golden') this.state.bonusMs = Math.max(this.state.bonusMs, durationMs);
    if (type === 'blackout') this.lightsBackAt = now + durationMs;
    this.director.show(type);
    if (type === 'quietDance') this.director.quiet(now + durationMs);
    const [lo, hi] = this.mode === 'demo' ? [12000, 20000] : [40000, 75000];
    // Golden slime runs in the background: the next show need not wait for it.
    this.nextShowAt = now + (type === 'golden' ? 6000 : durationMs) + lo + Math.random() * (hi - lo);
  }
  private lastNeed = ''; private lastNeedAt = 0; private clock = Date.now();
  /**
   * Free interactions share one room-wide budget of base grams per second, so a big room
   * liking nonstop still grows the slime but never outpaces paid ingredients.
   */
  private freeBudget = 120; private freeAt = Date.now();
  private freeShare(want: number, now: number): number {
    this.freeBudget = Math.min(120, this.freeBudget + Math.max(0, now - this.freeAt) / 1000 * FREE_GRAMS_PER_SECOND); this.freeAt = now;
    const got = Math.min(want, this.freeBudget); this.freeBudget -= got;
    return want > 0 ? got / want : 0;
  }
  private react(events: EngineEvent[]): void {
    for (const e of events) {
      if (e.type === 'goal') { this.director.goal(e.reward); continue; }
      // A pour that pushed the texture the wrong way gets called out, naming the fix.
      if (e.type === 'performed' && e.action.actor !== SELF_ACTOR && e.action.ing !== 'su' && this.director.wrongPour(e.action, need(this.state), this.nameOf(e.action.actor))) { this.lastNeedAt = this.clock; this.lastNeed = need(this.state).ing; continue; }
      if (e.type === 'performed' && e.action.ing === 'su' && !e.action.blocked) this.waterBy.set(e.action.actor, (this.waterBy.get(e.action.actor) ?? 0) + 1);
      if (e.type === 'rescued' || (e.type === 'protected' && e.target === 'su')) this.rescueBy.set(e.actor, (this.rescueBy.get(e.actor) ?? 0) + 1);
      this.director.onEvent(e, this.titledName, this.state.mass);
    }
  }
  /** The character keeps steering the room toward what the slime needs. */
  private steer(now: number): void {
    const n = need(this.state);
    if ((n.ing !== this.lastNeed && now - this.lastNeedAt > 8000) || now - this.lastNeedAt > 40000) {
      this.lastNeed = n.ing; this.lastNeedAt = now; this.director.needCall(n);
    }
  }
  tick(deltaMs: number, now = Date.now()): void {
    this.clock = now;
    this.director.setClock(now);
    if (this.mode === 'live' && (!this.source.connected || now - this.source.lastHeartbeat > 45000)) {
      this.source.connected = false;
      if (!this.state.paused) { this.state.paused = true; this.state.pauseReason = 'source_disconnected'; }
    }
    const { state, events } = advance(this.state, this.settings, deltaMs);
    this.state = state;
    this.react(events);
    if (!state.paused) { if (texture(state.consistency) === 'perfect') this.director.texture('perfect'); else this.director.texture('normal'); this.steer(now); }
    if (!state.paused && state.anger < 20 && texture(state.consistency) === 'perfect' && now - this.director.lastSpokeAt > 10000) this.director.bait();
    this.director.anger = angerStage(state.anger);
    this.shows(now);
    this.selfMake(now);
    this.howto(now);
    this.director.tick(now, state.mass, this.settings.chatterSec, this.settings.voiceEnabled && !state.paused);
    if (events.some(e => e.type !== 'started') || now - this.lastSave >= 1000) {
      this.store.transaction(() => this.store.save(state, this.settings));
      this.lastSave = now;
    }
    if (now - this.lastPrune > 3600000) { this.store.prune(now); this.engagement.prune(now); this.lastPrune = now; }
    // A gift every 4 s: busy, but closer to a real room than a gift a second.
    if (this.mode === 'demo' && !state.paused && now - this.lastDemo > 4000) this.demo(now);
  }
  /** Synthetic viewers that walk the whole catalog, protections and chaos included. */
  private demo(now: number): void {
    this.lastDemo = now; this.source.lastHeartbeat = now;
    const step = this.demoStep++, n = step % DEMO_NAMES.length;
    const user = { id: `demo-${n}`, name: DEMO_NAMES[n]! };
    const base = { id: randomUUID(), source: 'demo' as const, roomId: 'demo', timestamp: now, user };
    if (step % 9 === 4) return void this.ingest({ ...base, kind: 'like', count: 25 }, now);
    if (step % 7 === 2) return void this.ingest({ ...base, kind: 'join' }, now);
    if (this.vote) return void this.ingest({ ...base, kind: 'comment', text: String(1 + Math.floor(Math.random() * 4)) }, now);
    if (this.show?.type === 'challenge') return void this.ingest({ ...base, kind: 'comment', command: 'yoğur' }, now);
    if (this.show?.type === 'likeGoal') return void this.ingest({ ...base, kind: 'like', count: 25 }, now);
    if (this.show?.type === 'fastest') return void this.ingest({ ...base, kind: 'comment', text: 'slime' }, now);
    if (step % 23 === 11) return void this.ingest({ ...base, kind: 'comment', command: ['su', 'boraks', 'köpük', 'yoğur', 'uzat'][step % 5]! }, now);
    if (step % 19 === 8) return void this.ingest({ ...base, kind: 'comment', text: 'Dayı bu slime nereye kadar büyür?' }, now);
    if (step % 41 === 20) return void this.ingest({ ...base, kind: 'follow' }, now);
    // A two-minute rhythm shows the whole loop: a calm stretch, a water storm, then the rescuers.
    const cycle = step % 80, storm = cycle >= 34 && cycle < 70, rescuing = cycle >= 68 && cycle < 78 && step % 2 === 0;
    const pick = (ing: IngredientId) => this.settings.giftRules.find(r => r.ingredient === ing);
    // Shields are rare outside a storm, or demo water would never land.
    const rules = this.settings.giftRules.filter(r => r.ingredient !== 'su_koruma' || step % 47 === 0);
    // Cheap gifts dominate, like a real room; expensive ones show up now and then.
    const weights = rules.map(r => 1 / Math.sqrt(r.minCoins));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = ((Math.sin(step * 12.9898) * 43758.5453) % 1 + 1) % 1 * total, i = 0;
    while (i < rules.length - 1 && t > weights[i]!) { t -= weights[i]!; i++; }
    const rule = (rescuing && pick('boraks')) || (storm && pick('su')) || rules[i];
    if (!rule) return;
    const repeat = rule.minCoins <= 5 && step % 3 === 0 ? 1 + (step % 4) : 1;
    this.ingest({ ...base, kind: 'gift', gift: { id: rule.giftId || `demo-${rule.ingredient}`, name: CATALOG[rule.ingredient].name, coins: rule.minCoins, repeat, streakId: base.id } }, now);
  }
  private ruleFor(giftId: string, coins: number) {
    return this.settings.giftRules.find(r => r.giftId === giftId) ??
      this.settings.giftRules.filter(r => !r.giftId && r.minCoins <= coins).sort((a, b) => b.minCoins - a.minCoins)[0];
  }
  ingest(event: LiveEvent, now = Date.now()): { status: string; delta: number; coins: number } {
    this.clock = now;
    this.director.setClock(now);
    if ((event.source === 'demo') !== (this.mode === 'demo')) throw new Error('Event mode does not match server mode');
    const user = pseudonym(this.secret, event.user.id);
    const key = JSON.stringify([event.source, event.roomId, event.id]);
    const actor = this.settings.showNames ? event.user.name : `Viewer ${user.slice(0, 4).toUpperCase()}`;
    let updated: GameState | undefined, activity: Activity | undefined, welcome: Welcome | undefined, events: EngineEvent[] = [];
    const command = chatCommand(event.command || event.text);
    let follow = false, gesture = false, joined = false, echo = '';
    const result = this.store.transaction(() => {
      if (this.store.seen(key)) return { status: 'duplicate', delta: 0, coins: 0 };
      let delta = 1, coins = 0, points = 0, status = 'no_effect';
      const blocked = this.store.isBlocked(user), paused = this.state.paused;
      if (event.kind === 'gift' && event.gift) {
        this.lastGiftAt = now;
        const g = event.gift;
        delta = this.store.giftDelta(JSON.stringify([event.source, event.roomId, user, g.id, g.streakId ?? event.id]), g.repeat, now);
        coins = g.coins * delta;
        const rule = this.ruleFor(g.id, g.coins);
        if (rule && delta > 0) {
          const units = Math.min(10000, rule.units * delta), def = CATALOG[rule.ingredient];
          points = (def.kind === 'protect' ? 100 : def.grams) * units;
          status = 'applied';
          if (!blocked && !paused) {
            if (g.id === '5655') {
              const dancerName = speakableName(event.user.name, true) ?? 'Gizemli Yeğen';
              for (let i = 0; i < Math.min(delta, 5); i++) this.dancers.push({ id: randomUUID(), name: dancerName, joinedAt: now });
              this.dancers = this.dancers.slice(-12);
              this.show = { seq: ++this.showSeq, type: 'dance', at: now, durationMs: 15000, variant: 4, disco: true };
              this.lastShow = 'dance';
            }
            const out = enqueue(this.state, this.settings, rule.ingredient, units, actor, cleanChat(g.name).slice(0, 28) || 'hediyen');
            updated = out.state; events = out.events;
            // Every coin also fills the shared goal bar.
            const goal = addGoal(updated, this.settings, coins); updated = goal.state; events.push(...goal.events);
            activity = { id: ++this.activitySeq, name: actor, ing: rule.ingredient, n: units, at: now, demo: this.mode === 'demo',
              note: def.kind === 'protect' ? 'koruma' : 'sırada' };
          }
        } else if (delta === 0) status = 'duplicate_streak';
      } else if (event.kind === 'comment' && this.show?.type === 'fastest' && !this.show.winner && /(^|\s)slime(\s|$|[!.?])/i.test(event.text ?? event.command ?? '')) {
        // The fastest finger: the first "slime" wins, by name (or a friendly address if names are off).
        if (!blocked && !paused) {
          this.show.winner = actor; status = 'applied';
          this.titles.set(actor, 'Hızlı Parmak'); this.director.fastest(this.titledName(actor));
          this.show.durationMs = Math.min(this.show.durationMs, now - this.show.at + 3000);
        }
      } else if (event.kind === 'comment' && command.startsWith('!oy')) {
        // A dance vote: one per viewer, only while a vote is open; the tally shows on screen.
        if (this.vote && !this.vote.voters.has(user) && !blocked && !paused) { this.vote.voters.add(user); this.vote.votes[Number(command.slice(3)) - 1]!++; status = 'applied'; }
      } else if (event.kind === 'comment') {
        // A chat challenge counts everyone who writes the word, once each.
        if (this.show?.type === 'challenge' && this.show.goal && /^!?yo[gğ]ur$/.test(command) && !blocked && !paused && !this.goalUsers.has(user)) {
          this.goalUsers.add(user); this.show.goal.got++;
          if (this.show.goal.got >= this.show.goal.need) { this.goalDone('challenge', true); this.show.durationMs = now - this.show.at + 2500; this.show.goal.got = this.show.goal.need; this.show.type = 'party'; }
        }
        if (command && this.settings.chatActions && this.store.cooldown(`chat:${user}`, 20000, now)) {
          status = 'applied';
          if (!blocked && !paused) {
            const share = this.freeShare(40, now), word = command.replace(/^!/, '');
            const ing = word === 'su' ? 'su' : word === 'boraks' ? 'boraks' : word === 'köpük' || word === 'kopuk' ? 'tiras_kopugu' : null;
            if (share > 0) {
              if (ing) { const out = freeIngredient(this.state, ing, actor, share); updated = out.state; events = out.events; }
              else { updated = freeAction(this.state, 'command', 1, actor, command, share); gesture = true; }
              points = (ing ? Math.min(40, CATALOG[ing].grams / 3) : 40) * share;
              activity = { id: ++this.activitySeq, name: actor, ing: 'command', n: 1, at: now, demo: this.mode === 'demo', note: command };
            } else status = 'rate_limited';
          }
        }
        if (!command && !blocked && !paused && this.settings.showNames && this.settings.chatEcho) echo = cleanChat(event.text ?? event.command);
      } else if (event.kind === 'join' && this.store.cooldown(`join:${user}`, 60000, now)) {
        status = 'applied'; joined = !blocked && !paused;
        // Everyone who comes in adds a little slime; he pours some glue at most every 6 s so it stays readable.
        if (joined) {
          const pour = now - this.lastJoinPour > 6000; if (pour) this.lastJoinPour = now;
          updated = pour ? freeAction(this.state, 'command', 1, actor, '!slime', this.freeShare(40, now)) : freeAction(this.state, 'like', 30, actor, '', this.freeShare(15, now));
        }
      } else if (event.kind === 'like' && this.show?.type === 'likeGoal' && this.show.goal && !blocked && !paused && this.show.goal.got < this.show.goal.need) {
        // The like race counts every tap; reaching the goal pays out at once.
        this.show.goal.got = Math.min(this.show.goal.need, this.show.goal.got + (event.count ?? 1)); status = 'applied';
        if (this.show.goal.got >= this.show.goal.need) { this.goalDone('likeGoal', true); this.show.durationMs = now - this.show.at + 2500; this.show.type = 'party'; }
        updated = freeAction(this.state, 'like', event.count ?? 1, actor, '', this.freeShare(Math.min(30, event.count ?? 1) / 2, now));
      } else if (event.kind === 'like' && this.store.cooldown(`like:${user}`, 2000, now)) {
        points = Math.min(2500, (event.count ?? 1) / 2); status = 'applied';
        if (!blocked && !paused) {
          updated = freeAction(this.state, 'like', event.count ?? 1, actor, '', this.freeShare(Math.min(30, event.count ?? 1) / 2, now));
          activity = { id: ++this.activitySeq, name: actor, ing: 'like', n: event.count ?? 1, at: now, demo: this.mode === 'demo', note: 'yoğurdu' };
        }
      } else if (event.kind === 'follow' && this.store.cooldown(`follow:${user}`, 86400000, now)) {
        points = 300; status = 'applied'; follow = true;
        if (!blocked && !paused) {
          updated = freeAction(this.state, 'follow', 1, actor);
          activity = { id: ++this.activitySeq, name: actor, ing: 'follow', n: 1, at: now, demo: this.mode === 'demo', note: 'takip' };
        }
      }
      if (blocked && status === 'applied') { status = 'blocked'; points = 0; }
      if (paused && status === 'applied') { status = 'recorded_paused'; points = 0; }
      if (updated || joined) {
        const visit = this.engagement.record(user, event.kind === 'gift', coins, now);
        if (visit.firstToday && visit.activeDays > 1) welcome = { name: actor, activeDays: visit.activeDays, badge: visit.badge, at: now };
      }
      // Coins observed during a pause are auditable, but never claimed to have affected play.
      if (points > 0 || coins > 0) this.store.credit(user, event.user.name, points, coins, now);
      this.store.record(key, user, event.kind, status, coins, now);
      if (updated) this.store.save(updated, this.settings);
      return { status, delta, coins };
    });
    if (updated || joined || echo) this.director.roomActive();
    if (joined) this.director.join(this.nameOf(actor));
    if (echo) this.director.echo(this.nameOf(actor), echo);
    if (updated) {
      this.state = updated;
      if (this.settings.showNames) this.spoken.set(actor, event.user.name);
      if (this.spoken.size > 500) this.spoken.delete(this.spoken.keys().next().value!);
      this.react(events);
      if (follow) this.director.follow(this.nameOf(actor));
      if (gesture && this.state.gesture) this.director.gesture(this.state.gesture.type);
    }
    if (welcome) { this.welcome = welcome; if (this.settings.growthEnabled && !joined) this.director.welcome(welcome, this.nameOf(actor)); }
    if (activity) this.activity = [activity, ...this.activity].slice(0, 8);
    return result;
  }
  heartbeat(provider: string, connected: boolean, now = Date.now()): void {
    this.source = { provider: provider.slice(0, 32), connected, lastHeartbeat: now };
    if (connected && this.armed && this.state.pauseReason === 'source_disconnected') {
      this.state.paused = false; this.state.pauseReason = '';
    }
  }
  control(command: string): void {
    if (command === 'pause' || command === 'panic') {
      this.armed = false; this.state.paused = true; this.state.pauseReason = command === 'panic' ? 'emergency_stop' : 'operator_paused';
      this.director.clear();
    } else if (command === 'resume') {
      if (this.mode === 'live' && (!this.source.connected || Date.now() - this.source.lastHeartbeat > 45000)) throw new Error('No healthy live event source');
      this.armed = true; this.state.paused = false; this.state.pauseReason = '';
    } else if (command === 'clear_queue') {
      this.state = { ...this.state, queue: [], teams: { water: 0, rescue: 0 }, rescuer: null };
    } else throw new Error('Unknown control');
    this.store.transaction(() => this.store.save(this.state, this.settings));
  }
  configure(value: unknown): void {
    const settings = parseSettings(value);
    const state = structuredClone(this.state);
    if (!settings.showNames) {
      this.spoken.clear();
      state.queue = state.queue.map(q => ({ ...q, actor: 'Viewer' }));
      if (state.current) state.current.actor = 'Viewer';
      if (state.lastAction) state.lastAction.actor = 'Viewer';
      if (state.gesture) state.gesture.actor = 'Viewer';
      if (state.rescuer) state.rescuer.actor = 'Viewer';
      this.director.clear();
    }
    this.store.transaction(() => this.store.save(state, settings));
    if (!settings.chatEcho || !settings.voiceEnabled) this.director.clear();
    this.state = state;
    this.settings = settings;
    this.activity = [];
    this.welcome = null;
  }
  preview(ing: IngredientId, units: number): void {
    if (this.mode !== 'demo') throw new Error('Synthetic actions are disabled in live mode');
    const out = enqueue(this.state, this.settings, ing, units, 'STÜDYO TESTİ');
    this.state = out.state; this.react(out.events);
    this.store.transaction(() => this.store.save(this.state, this.settings));
  }
  menu(): MenuRow[] {
    const d = derive(this.state), seen = new Set<IngredientId>(), rows: MenuRow[] = [];
    const rules = [...this.settings.giftRules.filter(r => r.giftId), ...this.settings.giftRules.filter(r => !r.giftId).sort((a, b) => a.minCoins - b.minCoins)];
    for (const r of rules) {
      if (seen.has(r.ingredient)) continue;
      seen.add(r.ingredient);
      const def = CATALOG[r.ingredient];
      rows.push({ ing: r.ingredient, name: def.name, kind: def.kind, label: r.label || (r.giftId ? `Hediye ${r.giftId}` : `${r.minCoins}+ jeton`), queued: d.queued[r.ingredient] ?? 0, needed: d.need.ing === r.ingredient });
    }
    return rows;
  }
  public(now = Date.now()): PublicSnapshot {
    const { queue: _queue, ...game } = this.state;
    return { now, mode: this.mode, dancers: this.dancers.map(d => ({ ...d })), game: structuredClone(game), derived: derive(this.state), menu: this.menu(), settings: structuredClone(this.settings),
      growth: { enabled: this.settings.growthEnabled,
        welcome: this.settings.growthEnabled && !this.state.paused && this.welcome && now - this.welcome.at < 8000 ? { ...this.welcome } : null },
      speech: this.director.live(now), show: this.show ? { ...this.show, ...(this.show.votes ? { votes: [...this.show.votes] } : {}), ...(this.show.goal ? { goal: { ...this.show.goal } } : {}), ...(this.show.winner ? { winner: this.nameOf(this.show.winner) ?? 'bir yeğen' } : {}) } : null,
      leaders: this.store.leaders(now, this.settings.showNames), activity: this.activity.filter(a => now - a.at < 15000), source: { ...this.source } };
  }
  admin(clients: number): AdminSnapshot {
    return { ...this.public(), growthMetrics: this.engagement.metrics(), armed: this.armed, blocked: this.store.blocked(), recent: this.store.recent(),
      voice: { provider: this.voice.provider?.name ?? 'none', ready: this.voice.ready, cached: this.voice.cached(), failures: this.voice.failures,
        charsToday: this.voice.charsToday(), dailyChars: this.voice.dailyChars },
      metrics: { ...this.store.metrics(), clients, uptime: Math.round((Date.now() - this.startedAt) / 1000) } };
  }
  ready(now = Date.now()): boolean {
    return !this.state.paused && (this.mode === 'demo' || (this.armed && this.source.connected && now - this.source.lastHeartbeat < 45000));
  }
  close(): void { this.store.transaction(() => this.store.save(this.state, this.settings)); this.store.close(); }
}
