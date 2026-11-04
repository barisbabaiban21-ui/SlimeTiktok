import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CurrentAction, IngredientId, PublicSnapshot } from '../../shared/types.js';
import { CATALOG } from '../../shared/ingredients.js';
import { DayiRig } from './dayi-rig.js';
import { addLights } from './lights.js';
import type { Expression, Pose } from './dayi.js';
import { Flood, PAN_R, PAN_RIM, PAN_X, PAN_Z, Slime, panFloor } from './slime.js';
import { Effects, makeProp, pourStyle } from './effects.js';
import { Post, loadWorkshop } from './post.js';
import { buildWorkshop } from './workshop.js';
import { Disco } from './disco.js';
import { Rain } from './rain.js';
import type { Mouth } from '../lipsync.js';

// Close-up like a phone stream: his head under TikTok's top bar, the slime in the lower third.
const TABLE_TOP = 0.95, CAM_Z = 2.7, CAM_Y = 1.62, LOOK_Y = 1.58, CAM_FOV = 44;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return t;
}
const wood = (base: string, line: string) => canvasTexture(1024, 1024, g => {
  g.fillStyle = base; g.fillRect(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y += 4) { g.strokeStyle = line; g.lineWidth = 1.5; g.globalAlpha = 0.06 + Math.random() * 0.12; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin(x / 90 + y) * 3); g.stroke(); }
  g.globalAlpha = 1;
});

/** How long one gift plays on screen: a whole pour at the clips' natural speed. */
/** At most one gift waits, so what he says and what he does stay within a few seconds of each other. */
const MAX_PENDING = 1;
function visualMs(a: CurrentAction): number { return a.blocked ? 3000 : a.ing === 'kova' ? 6000 : 4800; }
const AMBIENT = new Set<Pose>(['idle', 'knead', 'begging', 'angry']);
type Shot = 'wide' | 'pan' | 'face' | 'out';
const STAGE_SHOWS = new Set(['dance', 'quietDance', 'joke', 'wave', 'party']);

export interface Events { squish(strength?: number): void; pour(seconds: number): void; chime(): void; pop(): void; boost(on: boolean): void; danceTrack(name: string | null): void }

/** Owns the renderer and translates server snapshots into character and slime motion. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly room = new THREE.Group();
  private readonly table = new THREE.Group();
  private bg: { scene: THREE.Scene; rt: THREE.WebGLRenderTarget } | null = null;
  private bakedDist = -1;
  private readonly camera = new THREE.PerspectiveCamera(CAM_FOV, 9 / 16, 0.1, 50);
  readonly dayi: DayiRig;
  private readonly slime: Slime;
  private readonly flood: Flood;
  private readonly fx: Effects;
  private readonly freeFx: Effects;
  private freePour: { ing: IngredientId; until: number } | null = null;
  private readonly freeProps = new Map<IngredientId, THREE.Group>();
  private readonly bowl: THREE.Mesh;
  private readonly post: Post | null;
  private readonly disco: Disco;
  private readonly rain: Rain;
  private readonly clock = new THREE.Timer();
  private snap: PublicSnapshot | null = null;
  private action: { a: CurrentAction; begin: number; dur: number; dropped: boolean; burst: boolean } | null = null;
  private readonly pending: CurrentAction[] = [];
  private held: { pose: Pose; since: number } = { pose: 'idle', since: 0 };
  private lastSeq = 0; private gestureSeq = -1; private gesture: { type: string; until: number } | null = null;
  private celebrateUntil = 0; private shockUntil = 0;
  private milestoneIdx = -1; private recipesDone = -1;
  private shot: { name: Shot; since: number } = { name: 'wide', since: 0 }; private dolly = 0; private closeups = 0;
  private prevAnger = 0; private rageUntil = 0; private slowmo = 0; private slowT = 0; private rageSeq = -1;
  private readonly camPos = new THREE.Vector3(); private readonly camLook = new THREE.Vector3();
  private readonly v3a = new THREE.Vector3(); private readonly v3b = new THREE.Vector3();
  private seenActivity = 0; private golden = false; private showCut = -1; private partyBurst = -1;
  private showSeen = { seq: -1, at: 0 };
  /** When this client first saw the show (its clock, so a late overlay still plays the rest of it). */
  private showSeenAt(show: { seq: number; at: number }): number {
    if (show.seq !== this.showSeen.seq) this.showSeen = { seq: show.seq, at: performance.now() - Math.max(0, Date.now() - show.at) };
    return this.showSeen.at;
  }
  private camDist = CAM_Z; private size = 0.2; private raf = 0; private frames = 0;
  private readonly hands = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly color = new THREE.Color();
  mouth: () => Mouth = () => ({ open: 0, wide: 1 });
  expression: () => Expression | null = () => null;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly low: boolean, private readonly sound: Events) {
    this.dayi = new DayiRig(low);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
    // CPU broadcasters render 3D at 75 %; the DOM HUD on top stays sharp.
    // Full quality never draws below the 1080×1920 broadcast frame, whatever the window size.
    this.renderer.setPixelRatio(low ? 0.75 : this.hiRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping: ACES pushed everything towards orange.
    this.renderer.toneMapping = THREE.NeutralToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = !low; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.buildRoom();
    if (low) {
      // CPU WebGL is fill-rate bound: the static room is rendered once into a texture
      // and only the character, table and slime are shaded every frame.
      const bg = new THREE.Scene(); bg.environment = env; bg.environmentIntensity = 0.45; bg.background = new THREE.Color('#d8c9b8');
      this.lights(bg, true); bg.add(this.room, this.table);
      // The textured table is baked too; an invisible depth-only proxy keeps it occluding
      // his lap and the floor flood without paying for its shading every frame.
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.4, TABLE_TOP, 1.15), new THREE.MeshBasicMaterial({ colorWrite: false }));
      proxy.position.set(0, TABLE_TOP / 2, 0.2); proxy.renderOrder = -10; this.scene.add(proxy);
      this.lights(this.scene, false);
      this.bg = { scene: bg, rt: new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) };
    } else {
      this.scene.add(this.table);
      this.scene.environment = env; this.scene.environmentIntensity = 0.45;
      this.scene.background = new THREE.Color('#d8c9b8');
      this.lights(this.scene, true); this.scene.add(this.room);
    }
    // Close to the pan: his arms are short (a big-headed caricature).
    this.dayi.root.position.set(0, 0, Number(new URLSearchParams(location.search).get('dz') ?? -0.8));
    this.scene.add(this.dayi.root);
    this.slime = new Slime(TABLE_TOP, low); this.scene.add(this.slime.group);
    this.flood = new Flood(this.slime.material); this.scene.add(this.flood.mesh);
    this.fx = new Effects(low); this.scene.add(this.fx.group);
    this.freeFx = new Effects(low); this.scene.add(this.freeFx.group);
    // A deep dark pan, like the real slime streams: the slime is a thick mass in it, not a sheet on the table.
    // The inner profile matches panFloor() in slime.ts; the wall has thickness and a rolled lip.
    const inner = [0, 0.15, 0.3, 0.36, 0.42, 0.44, PAN_R].map(r => new THREE.Vector2(r, panFloor(Math.min(r, PAN_R - 0.0001)) - 0.004));
    const panProfile = [...inner, new THREE.Vector2(PAN_R + 0.012, PAN_RIM + 0.012), new THREE.Vector2(PAN_R + 0.026, PAN_RIM + 0.004),
      new THREE.Vector2(PAN_R + 0.018, PAN_RIM - 0.03), new THREE.Vector2(0.44, 0.05), new THREE.Vector2(0.32, 0.004), new THREE.Vector2(0, 0)];
    this.bowl = new THREE.Mesh(new THREE.LatheGeometry(panProfile, 64), new THREE.MeshStandardMaterial({ color: '#1e1e22', roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }));
    this.bowl.position.set(PAN_X, TABLE_TOP + 0.001, PAN_Z); this.bowl.castShadow = true; this.bowl.receiveShadow = true; this.scene.add(this.bowl);
    this.post = low ? null : new Post(this.renderer, this.scene, this.camera);
    this.disco = new Disco(low); this.disco.attach(this.scene);
    this.rain = new Rain(low); this.scene.add(this.rain.mesh);
    // Behind him: a real workshop photo, softly out of focus, which also lights him and shows in the slime.
    const params = new URLSearchParams(location.search), spin = THREE.MathUtils.degToRad(Number(params.get('envrot') ?? 300));
    loadWorkshop(this.renderer, (envMap, photo) => {
      const target = this.bg?.scene ?? this.scene;
      for (const sc of [target, this.scene]) { sc.environment = envMap; sc.environmentRotation.set(0, spin, 0); sc.environmentIntensity = 0.5; }
      target.background = photo; target.backgroundRotation.set(0, spin, 0);
      target.backgroundBlurriness = Number(params.get('blur') ?? 0.03); target.backgroundIntensity = Number(params.get('bgi') ?? 1.3);
      this.bake();
    });
    this.resize();
    addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.loop);
  }
  get fps(): number { return this.frames; }
  /** Rage slow motion on screen right now; a rage line keeps it on until it has been said. */
  get raging(): boolean { return performance.now() < this.rageUntil; }
  extendRage(ms: number): void { this.rageUntil = Math.max(this.rageUntil, performance.now() + ms); }
  private hiRatio(h = this.canvas.clientHeight || 640): number { return Math.min(3, Math.max(devicePixelRatio, 1920 / h)); }
  private lights(s: THREE.Scene, full: boolean): void { addLights(s, full, !this.low); }
  private bake(): void {
    if (!this.bg) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bg.rt.setSize(size.x, size.y);
    this.placeCamera(0);
    this.renderer.setRenderTarget(this.bg.rt); this.renderer.render(this.bg.scene, this.camera); this.renderer.setRenderTarget(null);
    this.scene.background = this.bg.rt.texture; this.scene.backgroundBlurriness = 0; this.scene.backgroundRotation.set(0, 0, 0);
    this.bakedDist = this.camDist;
  }
  private placeCamera(t: number): void {
    const sway = this.bg ? 0 : Math.sin(t * 0.3) * 0.04;
    this.camPos.set(sway, CAM_Y + (this.camDist - CAM_Z) * 0.3, this.camDist); this.camLook.set(0, LOOK_Y, 0);
    // The director only dollies along the same line of sight: the angle never changes (full quality only).
    if (!this.bg && Math.abs(this.dolly) > 0.001) {
      const dir = this.v3a.copy(this.camPos).sub(this.camLook).normalize();
      this.camPos.addScaledVector(dir, this.dolly);
    }
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
  }
  /** Picks the shot (a dolly distance on the same line of sight) from what is happening: each holds at least 3 s, a push-in at most 7 s. */
  private direct(now: number, dt: number, big: boolean, rage: boolean, party: boolean): void {
    const want: Shot = party ? 'out' : rage ? 'face' : big ? 'pan' : 'wide', held = now - this.shot.since;
    if (this.shot.name === 'wide') {
      // After a close-up the wide shot stays at least 8 s, so close-ups stay events.
      if (want !== 'wide' && held > (this.closeups ? 8000 : 3000)) { this.shot = { name: want, since: now }; this.closeups++; }
    } else if ((want !== this.shot.name && held > 3000) || held > 7000) {
      this.shot = { name: 'wide', since: now };
    }
    // Metres along the line of sight: in for a big pour or rage, out for a celebration. Eased over about 1.5 s.
    const to = this.shot.name === 'pan' ? -0.35 : this.shot.name === 'face' ? -0.5 : this.shot.name === 'out' ? 0.3 : 0;
    this.dolly += (to - this.dolly) * Math.min(1, dt * 1.3);
  }
  private buildRoom(): void {
    const s = this.room;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ map: wood('#b58a62', '#5a3a22'), roughness: 0.7 }));
    (floor.material as THREE.MeshStandardMaterial).map!.repeat.set(4, 3);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    // A bare bulb hangs behind him: the warm light source you can see, glowing through the bloom.
    const bulb = new THREE.Group(); bulb.position.set(-0.62, 2.42, -1.25);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc27a').multiplyScalar(9) }));
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.07, 16), new THREE.MeshStandardMaterial({ color: '#2a2420', roughness: 0.5, metalness: 0.6 })); socket.position.y = 0.075;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.6, 6), new THREE.MeshStandardMaterial({ color: '#151210', roughness: 0.8 })); cord.position.y = 0.9;
    const glow = new THREE.PointLight('#ffd2a6', 1.4, 4, 1.6); glow.castShadow = false;
    bulb.add(glass, socket, cord, glow); s.add(bulb);
    buildWorkshop(s, () => this.bake());
    // The table: worn wooden top, slime goes here. Dynamic: it hides his lap and holds the slime.
    const t2 = this.table;
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 1.15), new THREE.MeshStandardMaterial({ map: wood('#9a6a44', '#4a2c18'), roughness: 0.55 }));
    table.position.set(0, TABLE_TOP - 0.035, 0.2); table.receiveShadow = true; table.castShadow = true; t2.add(table);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 1.05), new THREE.MeshStandardMaterial({ color: '#5e3f28', roughness: 0.7 })); apron.position.set(0, TABLE_TOP - 0.14, 0.2); t2.add(apron);
    // A front panel down to the floor, so nothing under the table (his feet in a dance) shows.
    const front = new THREE.Mesh(new THREE.BoxGeometry(2.36, TABLE_TOP - 0.07, 0.03), new THREE.MeshStandardMaterial({ map: wood('#7a5236', '#3d2414'), roughness: 0.7 }));
    front.position.set(0, (TABLE_TOP - 0.07) / 2, 0.74); front.receiveShadow = true; t2.add(front);
    for (const [x, z] of [[-1.08, -0.27], [1.08, -0.27], [-1.08, 0.67], [1.08, 0.67]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, TABLE_TOP - 0.1, 0.08), new THREE.MeshStandardMaterial({ color: '#7a573b' })); leg.position.set(x, (TABLE_TOP - 0.1) / 2, z); t2.add(leg);
    }
    // A little tea glass on the table, because of course.
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.1, 16, 1, true), new THREE.MeshPhysicalMaterial({ color: '#b5431f', roughness: 0.05, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    tea.position.set(0.82, TABLE_TOP + 0.05, 0.3); t2.add(tea);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.008, 20), new THREE.MeshStandardMaterial({ color: '#f5f5f5' })); plate.position.set(0.82, TABLE_TOP + 0.004, 0.3); t2.add(plate);
  }
  private resize = (): void => {
    const w = this.canvas.clientWidth || 360, h = this.canvas.clientHeight || 640;
    if (!this.low) this.renderer.setPixelRatio(this.hiRatio(h));
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h, this.renderer.getPixelRatio());
    this.bake();
  };
  update(s: PublicSnapshot): void {
    const prev = this.snap; this.snap = s;
    const c = s.game.current;
    if (c && c.seq !== this.lastSeq) {
      this.lastSeq = c.seq;
      // He works through gifts one at a time, at his own pace; the game itself keeps the server's clock.
      // A long backlog drops the oldest, so a busy room never leaves him minutes behind.
      this.pending.push(c);
      if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    }
    if (s.game.gesture && s.game.gesture.seq !== this.gestureSeq) {
      const gesture = s.game.gesture, remaining = gesture.atMs === undefined ? 2600 : 2600 - (s.game.elapsedMs - gesture.atMs);
      if ((this.gestureSeq >= 0 || gesture.atMs !== undefined) && remaining > 0 && !s.game.paused) {
        this.gesture = { type: gesture.type, until: performance.now() + remaining };
        if (gesture.pour && !gesture.blocked) {
          this.freePour = { ing: gesture.pour, until: performance.now() + remaining };
          let prop = this.freeProps.get(gesture.pour);
          if (!prop) { prop = makeProp(gesture.pour); this.freeProps.set(gesture.pour, prop); }
          this.dayi.propLeft.clear(); this.dayi.propLeft.add(prop);
          this.slime.poke(0.3); this.sound.pour(Math.min(1.5, remaining / 1000));
        }
      }
      this.gestureSeq = s.game.gesture.seq;
    }
    // Instant reaction (no queue): every new gift pops a burst of its colour from the slime and a little squish.
    for (const a of s.activity) {
      if (a.id <= this.seenActivity) continue;
      if (this.seenActivity > 0 && a.ing in CATALOG) {
        this.fx.burst(this.slime.topWorld, CATALOG[a.ing as IngredientId].color, 18); this.slime.poke(0.25); this.sound.pop();
      }
    }
    this.seenActivity = Math.max(this.seenActivity, ...s.activity.map(a => a.id), this.seenActivity || 0.5);
    // A random fit of rage: black and white slow motion, before his slowed-tape line arrives in this same snapshot.
    if (s.show?.type === 'rage' && s.show.seq !== this.rageSeq) { this.rageSeq = s.show.seq; this.extendRage(6000); }
    const mi = s.derived.milestone.index;
    if (this.milestoneIdx >= 0 && mi > this.milestoneIdx) { this.celebrateUntil = performance.now() + 3500; this.sound.chime(); this.fx.burst(this.slime.topWorld, '#ffe36b', 70); }
    this.milestoneIdx = mi;
    if (this.recipesDone >= 0 && s.game.recipesDone > this.recipesDone) { this.celebrateUntil = performance.now() + 2500; this.sound.chime(); }
    this.recipesDone = s.game.recipesDone;
    if (!prev) this.size = this.targetSize(s);
  }
  private beginAction(a: CurrentAction, dur: number): void {
    this.action = { a, begin: performance.now(), dur, dropped: false, burst: false };
    const prop = this.dayi.prop; prop.clear();
    const model = makeProp(a.ing);
    prop.add(model);
    if (a.ing === 'kova') { model.position.set(0.22, -0.05, 0.1); }
    if (a.blocked) this.shockUntil = 0;
    if (a.ing === 'ketcap' || a.ing === 'yumurta' || a.ing === 'sirke') this.shockUntil = performance.now() + dur * 0.9;
    if (!a.blocked) this.sound.pour(Math.min(3, dur / 1000 * 0.5));
  }
  private readonly mouthAt = new THREE.Vector3(); private readonly gripAt = new THREE.Vector3(); private readonly landAt = new THREE.Vector2();
  /** The held prop's mouth in world space; the hand when it has none (an egg). */
  private spout(prop: THREE.Object3D, side: 'l' | 'r'): THREE.Vector3 {
    const m = prop.getObjectByName('mouth');
    return m ? m.getWorldPosition(new THREE.Vector3()) : this.dayi.handWorld(side, new THREE.Vector3());
  }
  /** Where a stream leaving the mouth along the bottle's axis lands on the slime, under the same gravity as the stream. */
  private landing(prop: THREE.Object3D): THREE.Vector2 | null {
    const m = prop.getObjectByName('mouth'); if (!m) return null;
    m.getWorldPosition(this.mouthAt); prop.getWorldPosition(this.gripAt);
    const v = this.mouthAt.clone().sub(this.gripAt).normalize().multiplyScalar(0.35), g = 3.2;
    const drop = Math.max(0.02, this.mouthAt.y - this.slime.topWorld.y), T = (v.y + Math.sqrt(v.y * v.y + 2 * g * drop)) / g;
    return this.landAt.set(this.mouthAt.x + v.x * T, this.mouthAt.z + v.z * T);
  }
  private targetSize(s: PublicSnapshot): number {
    const kgv = s.game.mass / 1000;
    return 0.12 + 0.17 * Math.log10(1 + kgv);
  }
  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update(); const realDt = Math.min(0.05, this.clock.getDelta()), now = performance.now();
    // Rage: when his anger crosses into fury (or he explodes) the picture goes black and white and everything runs at
    // 35 % speed for 4 s, his voice slowed down with it.
    {
      const sn = this.snap, ang = sn?.game.anger ?? 0, boom = !!sn && sn.game.elapsedMs < sn.game.explosionUntilMs;
      if ((ang >= 70 && this.prevAnger < 70) || (boom && now > this.rageUntil + 8000)) this.rageUntil = now + 4000;
      this.prevAnger = ang;
    }
    const raging = now < this.rageUntil;
    this.slowmo += ((raging ? 1 : 0) - this.slowmo) * Math.min(1, realDt * 6);
    this.canvas.style.filter = this.slowmo > 0.01 ? `grayscale(${this.slowmo.toFixed(2)}) contrast(${(1 + 0.15 * this.slowmo).toFixed(2)})` : '';
    const dt = realDt * (1 - 0.65 * this.slowmo);
    this.slowT += dt; const t = this.slowT;
    this.frames++;
    const s = this.snap;
    let pose: Pose = 'idle', pouring = false, style = pourStyle('tutkal'), color = '#ffffff';
    // A show takes the stage: the pour in hand stops, the next waits, and he does what he just announced.
    const show = s?.show && now - this.showSeenAt(s.show) < s.show.durationMs ? s.show : null;
    const stageShow = !!show && STAGE_SHOWS.has(show.type);
    if (stageShow && this.showCut !== show!.seq) {
      this.showCut = show!.seq; this.action = null; this.dayi.prop.clear(); this.dayi.propLeft.clear();
      this.fx.stop(); this.freeFx.stop();
    }
    if (!stageShow && !this.action && this.pending.length) { const next = this.pending.shift()!; this.beginAction(next, visualMs(next)); }
    if (this.action) {
      const { a, begin, dur } = this.action, p = (now - begin) / dur;
      style = pourStyle(a.ing); color = a.ing === 'boya' && s ? `hsl(${(s.game.hue + 360) % 360},70%,60%)` : CATALOG[a.ing].color;
      if (p >= 1) { this.action = null; this.dayi.prop.clear(); }
      else if (a.blocked) { pose = p < 0.35 ? 'pour' : 'stop'; if (p > 0.55) this.dayi.prop.visible = false; }
      else if (p < 0.78) {
        this.dayi.prop.visible = true;
        pose = a.ing === 'kova' ? 'pourBoth' : 'pour';
        pouring = p > 0.22 && p < 0.72 && style !== 'egg';
        if (style === 'egg' && p > 0.4 && !this.action.dropped) {
          this.action.dropped = true; this.dayi.prop.visible = false;
          this.fx.dropEgg(this.dayi.handWorld('r'), this.slime.topWorld); setTimeout(() => this.sound.pop(), 420);
        }
      } else {
        this.dayi.prop.visible = false; pose = 'knead';
        if (!this.action.burst) { this.action.burst = true; this.slime.poke(1); this.sound.squish(1); }
      }
    } else if (this.gesture && now < this.gesture.until) {
      pose = this.gesture.type === 'stretch' ? 'stretch' : this.gesture.type === 'wave' ? 'wave' : 'knead';
    } else {
      // Between gifts he keeps working the slime, with the odd look at the camera.
      pose = Math.sin(t * 0.45) > -0.35 ? 'knead' : 'idle';
    }
    // A show from the server: a dance break, a joke (he laughs), a power cut, golden slime.
    if (show && !this.action) {
      if (show.type === 'dance' || show.type === 'quietDance') { this.dayi.setDance(show.variant); pose = 'dance'; }
      else if (show.type === 'joke' || show.type === 'party') pose = 'cheer';
      else if (show.type === 'wave') pose = 'wave';
      if (show.type === 'party' && this.partyBurst !== show.seq) { this.partyBurst = show.seq; for (const c of ['#ff5fa2', '#40c4ff', '#ffd84a', '#7cf05a']) this.fx.burst(this.slime.topWorld, c, 25); this.sound.chime(); }
    }
    const dancing = show?.type === 'dance' || show?.type === 'quietDance';
    this.sound.boost(dancing);
    // Each dance plays its own track: the conga (variant 4) and Osman Tuş (5) have theirs; the mirror-ball dances play disco.
    this.sound.danceTrack(!dancing ? null : show!.variant === 4 ? 'kongo' : show!.variant === 5 ? 'osman' : show!.disco ? 'disco' : null);
    this.disco.update(dt, t, dancing && !!show?.disco);
    // Confetti: the glitter rain, and every party (a won room goal turns into one).
    this.rain.update(dt, t, show?.type === 'rain' || show?.type === 'party');
    // The power cut: the lights flicker and die, then come back.
    if (!this.bg) {
      const off = show?.type === 'blackout' ? now - this.showSeenAt(show) : -1;
      const dark = off < 0 ? 0 : off < 500 ? (Math.sin(off * 0.06) > 0 ? 0.9 : 0.1) : off < show!.durationMs - 300 ? 1 : 0.4;
      this.renderer.toneMappingExposure += ((1 - 0.92 * dark) - this.renderer.toneMappingExposure) * Math.min(1, dt * (dark > 0.5 ? 30 : 4));
    }
    this.golden = (s?.game.bonusMs ?? 0) > 0;
    if (now < this.celebrateUntil) pose = 'cheer';
    if (now < this.shockUntil && pose === 'knead') pose = 'shock';
    const anger = s?.game.anger ?? 0, explosion = !!s && s.game.elapsedMs < s.game.explosionUntilMs;
    if (explosion) pose = 'explosion';
    else if (!this.action && anger >= 45) pose = anger >= 70 ? 'angry' : 'begging';
    // Moods between gifts (idle, kneading, anger) hold a while before changing, so he never flickers.
    if (pose !== this.held.pose) {
      if (AMBIENT.has(pose) && AMBIENT.has(this.held.pose) && now - this.held.since < 2500) pose = this.held.pose;
      else this.held = { pose, since: now };
    }
    this.dayi.setPourStyle(style, this.action?.a.ing === 'su');
    this.dayi.setPose(pose);
    // A show empties his hands: no second bottle, no stream.
    if (stageShow) { this.freePour = null; this.gesture = null; }
    const free = this.freePour && now < this.freePour.until && !s?.game.paused ? this.freePour : null;
    this.dayi.propLeft.visible = !!free;
    this.dayi.setFreePour(!!free);
    const mood = this.expression(), angerFace = anger >= 70 ? 'angry' as const : anger >= 20 ? 'begging' as const : null;
    // A cheerful line does not wipe the anger off his face; only a rescue does.
    const cheerful = mood === 'happy' || mood === 'excited' || mood === 'calm';
    const face = mood && !(cheerful && angerFace && !s?.game.rescuer) ? mood : angerFace;
    this.dayi.setExpression(explosion ? 'explosion' : face === 'explosion' ? 'angry' : face ?? (now < this.shockUntil ? 'shock' : now < this.celebrateUntil ? 'excited' : 'happy'));
    this.dayi.setSlime(this.slime.topWorld); this.dayi.setLookAt(this.camera.position);
    this.dayi.update(dt, t, this.mouth());
    if (pose === 'knead' && Math.random() < dt * 2.2) this.sound.squish(0.5);
    // Slime look follows the server state.
    if (s) {
      const g = s.game;
      this.size += (this.targetSize(s) - this.size) * Math.min(1, dt * 1.5);
      const stage = s.derived.milestone.index;
      const wet = s.derived.degradation, leak = wet === 'soup' ? 1 : wet === 'flowing' ? 0.45 : 0;
      const tableSize = Math.min(1, this.size + leak * 0.28), drape = Math.max(leak, THREE.MathUtils.clamp((this.size - 0.75) * 2.5, 0, 1));
      this.dayi.handWorld('l', this.hands[0]); this.dayi.handWorld('r', this.hands[1]);
      this.slime.update(dt, t, { size: tableSize, consistency: g.consistency, fluff: g.fluff, sparkle: this.golden ? Math.max(70, g.sparkle) : g.sparkle, hue: this.golden ? 46 : g.hue, stains: g.stains, beads: g.beads ?? 0,
        hands: this.hands, knead: pose === 'knead' ? 1 : 0, stretch: pose === 'stretch' ? 1 : 0, drape, pouring: pouring || !!free, bowl: stage === 0,
        pourAt: pouring ? this.landing(this.dayi.prop) : free ? this.landing(this.dayi.propLeft) : null });
      this.bowl.visible = true;
      // From "Oda" on, the room itself fills up, looping each stage.
      this.color.setHSL(g.hue / 360, 0.92, 0.5);
      // The floor only fills once the slime has left the table for the room; before that it grows on the table.
      const flood = stage < 4 ? 0 : 0.04 + 0.45 * s.derived.milestone.progress;
      // The floor fills only from the room stages on; a soupy slime pours over the table edge instead.
      this.flood.update(t, flood, this.color);
      const dist = CAM_Z + Math.min(1.8, Math.max(0, stage - 1) * 0.3);
      if (this.bg) { if (Math.abs(dist - this.bakedDist) > 0.01) { this.camDist = dist; this.bake(); } }
      else this.camDist += (dist - this.camDist) * Math.min(1, dt);
    }
    if (this.action) {
      const from = this.spout(this.dayi.prop, 'r');
      this.fx.pour(from, this.slime.topWorld, style, color, pouring, dt);
    } else this.fx.pour(this.slime.topWorld, this.slime.topWorld, style, color, false, dt);
    this.fx.update(dt);
    const from = this.spout(this.dayi.propLeft, 'l');
    this.freeFx.pour(from, this.slime.topWorld, pourStyle(free?.ing ?? 'tutkal'), CATALOG[free?.ing ?? 'tutkal'].color, !!free, dt, 0.6);
    this.freeFx.update(dt);
    const bigPour = !!this.action && !this.action.a.blocked && (this.action.a.ing === 'kova' || this.action.a.n >= 5);
    // His face is the shot only for a moment: the explosion, or the instant his anger crosses into rage.
    this.direct(now, dt, bigPour, now < this.rageUntil, now < this.celebrateUntil || pose === 'dance');
    this.placeCamera(t);
    if (this.post) { this.post.focus(this.camera.position.distanceTo(this.camLook) - 0.05); this.post.render(); }
    else this.renderer.render(this.scene, this.camera);
  };
  destroy(): void { cancelAnimationFrame(this.raf); removeEventListener('resize', this.resize); this.renderer.dispose(); }
}
export type { IngredientId };
