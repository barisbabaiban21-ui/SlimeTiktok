import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Mouth } from '../lipsync.js';
import type { Expression, Pose } from './dayi.js';
import type { PourStyle } from './effects.js';

/**
 * The character: a Tripo-generated, rigged model (Mixamo-named skeleton). Every motion is a clip
 * (made with fal.ai Hunyuan Motion; Mixamo clips also work) retargeted by art/scripts/bake_character.py.
 *
 * Code never invents hand poses. It slides each working arm so the clip's average hand position sits
 * over the slime (two-bone IK on the wrist position; the wrist turn stays the clip's). A held prop is
 * fixed to the hand bone, through the fist, and the fingers take the fist from the cheer clip.
 */
/** The character (see docs/CHARACTER.md to make your own). */
const URL = '/assets/roach/roach.glb';
const params = new URLSearchParams(location.search);
/** Model metres -> stage metres (he is a big-headed caricature, so this sets the head size on screen). */
const SCALE = Number(params.get('dscale') ?? 2.46); // the cockroach, 20 % bigger than Dayı was
/** He stands on the floor behind the table; lifted so his chest clears the table top. */
const LIFT = Number(params.get('dlift') ?? 0.2); // keeps his head where Dayı's was (head bone at 0.594 model units)

type Clip = 'idle' | 'talk' | 'cheer' | 'wave' | 'stomp' | 'yell' | 'beg' | 'shock' | 'laugh' | 'stop' | 'point' | 'stretch'
  | 'knead' | 'knead2' | 'knead3' | 'pour_bottle' | 'water' | 'foam' | 'sprinkle' | 'egg' | 'bucket'
  | 'dance_twist' | 'dance_cabbage' | 'dance_chicken' | 'dance_runningman' | 'dance_kongo' | 'dance_osman';
/** Dance variants: 0 twist, 1 cabbage patch, 2 chicken, 3 running man, 4 conga, 5 Osman Tuş. */
const DANCES: Clip[] = ['dance_twist', 'dance_cabbage', 'dance_chicken', 'dance_runningman', 'dance_kongo', 'dance_osman'];
/** Clips that play once per action and hold their last frame. */
const ONCE = new Set<Clip>(['pour_bottle', 'water', 'egg', 'bucket', 'stop', 'point', 'shock']);
type Side = 'l' | 'r';
const B = (n: string) => `mixamorig${n}`;
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;
/** The clip and moment whose fingers make the grip (a tight fist pumping the air). */
const GRIP_FROM: [Clip, number] = ['cheer', 0.5];
/** Fine tuning of the prop in the fist, in hand-bone units: along the knuckle line, fingers, palm normal. */
const GRIP_NUDGE = (params.get('grip') ?? '0,-0.004,-0.025').split(',').map(Number) as [number, number, number];
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();
const m1 = new THREE.Matrix4();

/** Turns a bone in world space by `delta`, keeping its children attached. */
function turnWorld(bone: THREE.Object3D, delta: THREE.Quaternion): void {
  bone.getWorldQuaternion(q2);
  q3.copy(delta).multiply(q2);
  bone.parent!.getWorldQuaternion(q2).invert();
  bone.quaternion.copy(q2.multiply(q3));
  bone.updateMatrixWorld(true);
}
/** Turns `bone` so the direction from its head to `child` points along `want`. Minimal rotation: no twist is added. */
function aim(bone: THREE.Object3D, child: THREE.Object3D, want: THREE.Vector3): void {
  bone.getWorldPosition(v1); child.getWorldPosition(v2);
  const have = v2.sub(v1).normalize(), to = v3.copy(want).normalize();
  if (have.dot(to) < -0.999) return;
  q1.setFromUnitVectors(have, to);
  turnWorld(bone, q1);
}

class ArmChain {
  readonly arm: THREE.Bone; readonly fore: THREE.Bone; readonly hand: THREE.Bone; readonly tip: THREE.Bone;
  readonly index: THREE.Bone; readonly pinky: THREE.Bone;
  readonly fingers: THREE.Bone[];
  /** Fist pose per finger bone (local), and the prop's fixed place in the fist (hand-bone local). */
  readonly grip = new Map<THREE.Bone, THREE.Quaternion>();
  readonly socket = new THREE.Matrix4();
  /** Low-passed hand position from the clip: what gets moved onto the slime. */
  readonly mean = new THREE.Vector3(); seeded = false;
  constructor(bones: Map<string, THREE.Bone>, readonly side: 'Left' | 'Right') {
    const g = (n: string) => { const b = bones.get(B(side + n)); if (!b) throw new Error(`missing bone ${side}${n}`); return b; };
    this.arm = g('Arm'); this.fore = g('ForeArm'); this.hand = g('Hand'); this.tip = g('HandMiddle1');
    this.index = g('HandIndex1'); this.pinky = g('HandPinky1');
    this.fingers = FINGERS.flatMap(f => [1, 2, 3].map(i => g(`Hand${f}${i}`)));
  }
  /** Reads the fist from a clip and works out, in that fist, where a held bottle goes. */
  calibrate(clip: THREE.AnimationClip, at: number, nudge: [number, number, number]): void {
    const saved = this.fingers.map(b => b.quaternion.clone());
    for (const bone of this.fingers) {
      const track = clip.tracks.find(t => t.name === `${bone.name}.quaternion`); if (!track) continue;
      const times = track.times, i = Math.max(0, times.findIndex(x => x >= at * clip.duration)), v = track.values;
      const q = new THREE.Quaternion(v[i * 4]!, v[i * 4 + 1]!, v[i * 4 + 2]!, v[i * 4 + 3]!);
      this.grip.set(bone, q); bone.quaternion.copy(q);
    }
    // Ancestors too: getWorldPosition below refreshes the whole chain, so the inverse must match it.
    this.hand.updateWorldMatrix(true, true);
    // In hand-bone space: the hole of the fist is between the palm (knuckles) and the curled finger middles.
    const inv = this.hand.matrixWorld.clone().invert(), at3 = (b: THREE.Object3D) => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const g = (n: string) => this.fingers.find(b => b.name.endsWith(n))!;
    const knuckles = at3(g('Index1')).add(at3(g('Middle1'))).add(at3(g('Ring1'))).add(at3(g('Pinky1'))).multiplyScalar(0.25);
    const middles = at3(g('Index2')).add(at3(g('Middle2'))).add(at3(g('Ring2'))).add(at3(g('Pinky2'))).multiplyScalar(0.25);
    const wrist = new THREE.Vector3();
    const up = at3(g('Index1')).sub(at3(g('Pinky1'))).normalize(); // thumb side: the bottle's mouth
    const fwd = knuckles.clone().sub(wrist).normalize(); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const palmN = new THREE.Vector3().crossVectors(up, fwd); // completes the frame
    const centre = knuckles.clone().lerp(middles, 0.5)
      .addScaledVector(up, nudge[0]).addScaledVector(fwd, nudge[1]).addScaledVector(palmN, nudge[2]);
    this.socket.makeBasis(palmN, up, fwd).setPosition(centre);
    this.fingers.forEach((b, i) => b.quaternion.copy(saved[i]!));
  }
  /** Blends the fingers into the fist (0 = clip, 1 = fist). */
  hold(weight: number): void {
    if (weight <= 0.001) return;
    for (const [bone, q] of this.grip) bone.quaternion.slerp(q, weight);
    this.hand.updateMatrixWorld(true);
  }
  /** Analytic two-bone IK on the wrist position, elbow towards `pole`. The hand's own turn comes along unchanged. */
  reach(target: THREE.Vector3, pole: THREE.Vector3, weight: number): void {
    if (weight <= 0.001) return;
    const a = this.arm.getWorldPosition(new THREE.Vector3()), b = this.fore.getWorldPosition(new THREE.Vector3()), c = this.hand.getWorldPosition(new THREE.Vector3());
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    const t = new THREE.Vector3().lerpVectors(c, target, weight);
    const toT = t.clone().sub(a), d = THREE.MathUtils.clamp(toT.length(), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.995);
    toT.setLength(d);
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), along = toT.clone().normalize();
    const out = pole.clone().sub(a); out.addScaledVector(along, -out.dot(along)).normalize();
    const elbow = a.clone().addScaledVector(along, l1 * cosA).addScaledVector(out, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
    // Keep the hand's world orientation through the arm turn, so the clip's wrist is untouched.
    this.hand.getWorldQuaternion(q3); const keep = q3.clone();
    aim(this.arm, this.fore, elbow.clone().sub(a));
    aim(this.fore, this.hand, a.clone().add(toT).sub(this.fore.getWorldPosition(v4)));
    this.hand.parent!.getWorldQuaternion(q2).invert(); this.hand.quaternion.copy(q2.multiply(keep)); this.hand.updateMatrixWorld(true);
  }
  /** Centre of the palm. */
  palm(out: THREE.Vector3): THREE.Vector3 { this.hand.getWorldPosition(out); return out.lerp(this.tip.getWorldPosition(v4), 0.6); }
}

export class DayiRig {
  readonly root = new THREE.Group();
  readonly prop = new THREE.Group(); readonly propLeft = new THREE.Group();
  readonly ready: Promise<void>;
  private readonly body = new THREE.Group();
  /** Held props follow the palm frame every frame, outside the skeleton. */
  private readonly holders: Record<Side, THREE.Group> = { l: new THREE.Group(), r: new THREE.Group() };
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<Clip, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null; private currentName: Clip | null = null;
  private arms: Record<Side, ArmChain> | null = null;
  private head: THREE.Bone | null = null; private hips: THREE.Bone | null = null; private legs: [THREE.Bone, THREE.Bone] | null = null;
  private pose: Pose = 'idle'; private poseT = 0; private expression: Expression = 'happy';
  private freePour = false; private style: PourStyle = 'stream'; private water = false;
  private lastOpen = -9;
  private kneads = 0; private kneadAt = 0; private speaking = false;
  private readonly work = { l: 0, r: 0 }; private readonly gripW = { l: 0, r: 0 };
  private readonly fitted: Record<Side, THREE.Object3D | null> = { l: null, r: null };
  private readonly slime = new THREE.Vector3(0, 1.0, 0.25);
  private skin: THREE.MeshStandardMaterial | null = null;
  /** The cockroach's face: rigid pieces on the head bone, each with its origin at its hinge. */
  private face: { mandibles: THREE.Object3D[]; eyes: THREE.Object3D[]; antennae: THREE.Object3D[] } = { mandibles: [], eyes: [], antennae: [] };
  private readonly rest = new Map<THREE.Object3D, THREE.Quaternion>();
  /** The head's forward direction in its own space (from the bind pose), and where he looks: the camera. */
  private headFwd: THREE.Vector3 | null = null; private readonly lookAt = new THREE.Vector3(0, 1.6, 3);
  private jaw = 0; private blinkAt = 2; private lid = 0; private eyeBig = 0;
  private readonly tint = new THREE.Color(1, 1, 1); private readonly want = new THREE.Color();
  constructor(private readonly low = false) {
    this.root.add(this.body);
    this.body.scale.setScalar(SCALE); this.body.position.y = LIFT;
    // The model faces +x; the camera looks down -z.
    this.body.rotation.y = -Math.PI / 2;
    this.holders.r.add(this.prop); this.holders.l.add(this.propLeft);
    this.ready = this.load().catch(e => console.error('Character failed to load', e));
  }
  private async load(): Promise<void> {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(URL);
    const model = gltf.scene, bones = new Map<string, THREE.Bone>();
    model.traverse(o => {
      if ((o as THREE.Bone).isBone) bones.set(o.name.replace(':', ''), o as THREE.Bone);
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.62; mat.envMapIntensity = 0.9;
        if (mat.map) mat.map.anisotropy = this.low ? 1 : 8;
        this.skin = mat;
      }
    });
    this.body.add(model);
    // Face pieces come free in the file at their rest place; in the bind pose they are hung on the head bone,
    // keeping where they are (three's attach), so they follow every clip.
    model.updateMatrixWorld(true);
    const headBone = (() => { let h: THREE.Object3D | null = null; model.traverse(o => { if ((o as THREE.Bone).isBone && o.name.replace(':', '') === 'mixamorigHead') h = o; }); return h as THREE.Object3D | null; })();
    for (const name of ['mandibleL', 'mandibleR', 'eyeL', 'eyeR', 'antennaL', 'antennaR']) {
      const o = model.getObjectByName(name); if (!o) continue;
      if (headBone) headBone.attach(o);
      this.rest.set(o, o.quaternion.clone());
      (name.startsWith('mandible') ? this.face.mandibles : name.startsWith('eye') ? this.face.eyes : this.face.antennae).push(o);
    }
    this.arms = { l: new ArmChain(bones, 'Left'), r: new ArmChain(bones, 'Right') };
    this.head = bones.get(B('Head')) ?? null;
    if (this.head) { model.updateMatrixWorld(true); this.head.getWorldQuaternion(q3); this.headFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q3.invert()); } this.hips = bones.get(B('Hips')) ?? null;
    const lu = bones.get(B('LeftUpLeg')), ru = bones.get(B('RightUpLeg')); if (lu && ru) this.legs = [lu, ru];
    const gripClip = gltf.animations.find(c => c.name === GRIP_FROM[0]);
    for (const side of ['l', 'r'] as const) {
      const arm = this.arms[side], holder = this.holders[side];
      if (gripClip) arm.calibrate(gripClip, GRIP_FROM[1], GRIP_NUDGE);
      // The prop is built in stage metres; the hand bone carries the character's scale.
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(arm.socket).multiply(new THREE.Matrix4().makeScale(1 / SCALE, 1 / SCALE, 1 / SCALE));
      arm.hand.add(holder);
    }
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      // He works behind a table: no travel, no scale, the hips may only bob.
      clip.tracks = clip.tracks.filter(t => !(t.name.endsWith('.position') && !t.name.includes('Hips')) && !t.name.endsWith('.scale'));
      for (const t of clip.tracks) if (t.name.includes('Hips') && t.name.endsWith('.position')) {
        const v = t.values, x0 = v[0]!, z0 = v[2]!;
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } // no travel at all: steps forward would walk him through the table
      }
      const action = this.mixer.clipAction(clip);
      if (ONCE.has(clip.name as Clip)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
      this.actions.set(clip.name as Clip, action);
    }
    this.play('idle', 0);
  }
  /**
   * Speech opens the mandibles, he blinks every few seconds and widens his eyes in shock, and the antennae carry the
   * mood: a lazy sway when calm, quick twitches when excited, pointing forward in anger, drooping when he begs.
   */
  private animateFace(dt: number, t: number, mouth: Mouth): void {
    const ex = this.expression, f = this.face;
    this.jaw += (Math.min(1, mouth.open * 1.3) - this.jaw) * Math.min(1, dt * 25);
    for (const m of f.mandibles) {
      const side = m.name.endsWith('L') ? 1 : -1;
      // Model space: y up, the face looks along +x, left is -z (glTF). Opening swings each tip outward about y.
      q1.setFromAxisAngle(v1.set(0, 1, 0), side * this.jaw * 0.55);
      m.quaternion.copy(this.rest.get(m)!).multiply(q1);
    }
    if (t > this.blinkAt + 0.16) this.blinkAt = t + 2.2 + Math.random() * 3;
    const closed = t > this.blinkAt && t < this.blinkAt + 0.16;
    this.lid += ((closed ? 1 : 0) - this.lid) * Math.min(1, dt * 35);
    this.eyeBig += ((ex === 'shock' || ex === 'explosion' ? 1 : ex === 'excited' ? 0.4 : 0) - this.eyeBig) * Math.min(1, dt * 8);
    for (const e of f.eyes) { const s = 1 + 0.25 * this.eyeBig; e.scale.set(s, s * Math.max(0.08, 1 - this.lid), s); }
    const speed = ex === 'excited' || ex === 'explosion' ? 9 : ex === 'angry' ? 5 : 1.6, amp = ex === 'excited' ? 0.22 : ex === 'begging' ? 0.05 : 0.09;
    const lean = ex === 'angry' || ex === 'explosion' ? 0.5 : ex === 'begging' ? -0.6 : ex === 'shock' ? -0.25 : 0;
    for (const a of f.antennae) {
      const side = a.name.endsWith('L') ? 1 : -1, ph = t * speed + (side > 0 ? 0 : 1.3);
      // Forward lean is about the side axis (z), the sway about the forward axis (x).
      q1.setFromAxisAngle(v1.set(0, 0, 1), -lean + Math.sin(ph) * amp);
      q2.setFromAxisAngle(v2.set(1, 0, 0), side * Math.sin(ph * 0.7 + 0.5) * amp * 0.8);
      a.quaternion.copy(this.rest.get(a)!).multiply(q1).multiply(q2);
    }
  }
  private play(name: Clip, fade = 0.6): void {
    const next = this.actions.get(name); if (!next || name === this.currentName) return;
    // A clip still fading out picks up where it is (no jump to its first frame); a stopped one starts fresh.
    if (!next.isRunning() || next.getEffectiveWeight() < 0.01) next.reset();
    next.enabled = true; next.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next; this.currentName = name;
  }
  private clipFor(pose: Pose): Clip {
    switch (pose) {
      case 'dance': return DANCES[this.danceVariant % DANCES.length]!;
      case 'knead': return (['knead', 'knead2', 'knead3'] as const)[this.kneads % 3]!; // changes at most every 12 s
      case 'pour':
        if (this.water) return 'water';
        // Everything held in a fist (glue, foam, glitter, powder) pours the same way; only the egg is different.
        return this.style === 'egg' ? 'egg' : 'pour_bottle';
      case 'pourBoth': return 'bucket';
      case 'stretch': return 'stretch';
      case 'stop': return 'stop';
      case 'point': return 'point';
      case 'shock': return 'shock';
      case 'cheer': return this.expression === 'excited' ? 'laugh' : 'cheer';
      case 'wave': return 'wave';
      case 'begging': return 'beg';
      case 'angry': return 'stomp';
      case 'explosion': return 'yell';
      default: return this.speaking ? 'talk' : 'idle';
    }
  }
  setPose(p: Pose): void {
    if (p === this.pose) return;
    const now = performance.now();
    if (p === 'knead' && now - this.kneadAt > 12000) { this.kneads++; this.kneadAt = now; }
    this.pose = p; this.poseT = 0;
  }
  setExpression(e: Expression): void { this.expression = e; }
  private danceVariant = 0;
  /** Which of the four dances the next dance break plays. */
  setDance(variant: number): void { this.danceVariant = variant; }
  setFreePour(on: boolean): void { this.freePour = on; }
  /** What the current pour looks like, so the right clip plays (a bottle, a spray can, a pinch, a cup of water). */
  setPourStyle(style: PourStyle, water: boolean): void { this.style = style; this.water = water; }
  /** Where the slime's top is, so the hands work over it. */
  setSlime(p: THREE.Vector3): void { this.slime.copy(p); }
  /** Where the camera is, so he looks into it. */
  setLookAt(p: THREE.Vector3): void { this.lookAt.copy(p); }
  handWorld(side: Side, out = new THREE.Vector3()): THREE.Vector3 {
    return this.arms ? this.arms[side].palm(out) : this.root.getWorldPosition(out).add(v1.set(side === 'l' ? 0.3 : -0.3, 1.4, 0.4));
  }
  update(dt: number, t: number, mouth: Mouth): void {
    if (!this.mixer || !this.arms) return;
    this.poseT += dt;
    const pose = this.pose;
    // Talking holds for 0.8 s after the mouth last opened: the mouth closes between syllables, the body must not switch clips each time.
    if (mouth.open > 0.05) this.lastOpen = t;
    this.speaking = t - this.lastOpen < 0.8;
    this.play(this.clipFor(pose));
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    const k = 1 - Math.exp(-dt * 2.5);
    const pours = pose === 'pour' || pose === 'pourBoth';
    const workL = pose === 'knead' || pose === 'pourBoth' || pose === 'stretch' || this.freePour ? 1 : 0;
    const workR = pose === 'knead' || pours || pose === 'stretch' ? 1 : 0;
    this.work.l += (workL - this.work.l) * k; this.work.r += (workR - this.work.r) * k;
    const s = this.slime;
    for (const side of ['l', 'r'] as const) {
      const arm = this.arms[side], w = this.work[side], sx = side === 'l' ? 1 : -1;
      // The clip's hand, low-passed: its rhythm stays, its average gets moved onto the slime.
      const hand = arm.hand.getWorldPosition(new THREE.Vector3());
      if (!arm.seeded) { arm.mean.copy(hand); arm.seeded = true; }
      arm.mean.lerp(hand, Math.min(1, dt * 1.2));
      const holder = this.holders[side];
      holder.visible = (side === 'r' && pours) || (side === 'l' && (this.freePour || pose === 'pourBoth'));
      if (w > 0.001) {
        // Over the near half of the pan: his arms are short.
        const anchor = new THREE.Vector3(s.x + sx * 0.12, s.y + 0.06, s.z - 0.1);
        if (pours || (side === 'l' && this.freePour)) anchor.set(s.x + sx * (pose === 'pourBoth' ? 0.16 : 0.06), s.y + 0.42, s.z - 0.06);
        else if (pose === 'stretch') anchor.set(s.x + sx * 0.18, s.y + 0.2, s.z - 0.08);
        const target = hand.clone().add(anchor.sub(arm.mean));
        const pole = arm.arm.getWorldPosition(new THREE.Vector3()).add(v2.set(sx * 0.6, -0.5, -0.2));
        arm.reach(target, pole, w * 0.85);
      }
      // A fist is about 9 cm across: thicker props are scaled down to fit it, once per new prop.
      const prop = side === 'r' ? this.prop : this.propLeft, kid = prop.children[0];
      if (kid && kid !== this.fitted[side]) {
        this.fitted[side] = kid; prop.scale.setScalar(1);
        // Measured upright, on a parentless copy: the held one is turned, and a turned box lies about thickness.
        const size = new THREE.Box3().setFromObject(kid.clone()).getSize(new THREE.Vector3());
        prop.scale.setScalar(Math.min(1, 0.09 / Math.max(1e-3, Math.min(size.x, size.z))));
      }
      // Pouring tips the bottle mouth-down over the slime: the clip only half turns the wrist, so the rest is a roll
      // about the knuckle direction, towards whichever side brings the mouth lower. Eases in, holds, eases out.
      if (holder.visible && pose === 'pour' && side === 'r' && this.style !== 'egg') {
        const tip = THREE.MathUtils.smoothstep(this.poseT, 0.6, 1.6) * (this.water ? 1.25 : 1.9);
        const f = arm.tip.getWorldPosition(new THREE.Vector3()).sub(arm.hand.getWorldPosition(v1)).normalize();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(holder.getWorldQuaternion(q3));
        const lower = (a: number) => up.clone().applyAxisAngle(f, a).y;
        q1.setFromAxisAngle(f, lower(tip) < lower(-tip) ? tip : -tip);
        turnWorld(arm.hand, q1);
      }
      // A held prop closes the fingers around it.
      this.gripW[side] += ((holder.visible ? 1 : 0) - this.gripW[side]) * Math.min(1, dt * 10);
      arm.hold(this.gripW[side]);
    }
    // He looks straight into the camera: whatever the clip does with the head, most of it turns to face the viewer.
    if (this.head && this.headFwd) {
      this.head.getWorldQuaternion(q3);
      const fwd = v1.copy(this.headFwd).applyQuaternion(q3).normalize();
      const want = v2.copy(this.lookAt).sub(this.head.getWorldPosition(v3)).normalize();
      q1.setFromUnitVectors(fwd, want);
      q1.slerp(q2.identity(), 0.15); // keep a little of the clip's own head motion
      turnWorld(this.head, q1);
    }
    this.animateFace(dt, t, mouth);
    // Anger flushes his skin (the whole texture: no separate face yet).
    const ex = this.expression;
    this.tint.lerp(this.want.setRGB(1, ex === 'explosion' ? 0.6 : ex === 'angry' ? 0.86 : 1, ex === 'explosion' ? 0.55 : ex === 'angry' ? 0.84 : 1), k);
    if (this.skin) this.skin.color.setRGB(this.tint.r, this.tint.g, this.tint.b);
  }
}
