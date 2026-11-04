import * as THREE from 'three';
import type { Mouth } from '../lipsync.js';
import type { Speech } from '../../shared/types.js';

/**
 * Cıvık Dayı at runtime. The sculpted surfaces are baked at build time
 * (src/shared/character, scripts/bake-character.mjs); this class loads them,
 * rigs head, brows, eyes and arms, and drives the jaw in the vertex shader.
 */
export type Pose = 'dance' | 'idle' | 'knead' | 'pour' | 'pourBoth' | 'stretch' | 'shock' | 'cheer' | 'wave' | 'stop' | 'point' | 'begging' | 'angry' | 'explosion';
type ArmAngles = { sx: number; sz: number; sy: number; ex: number; wx: number };
type PoseDef = { l: ArmAngles; r: ArmAngles; lean: number; head: number };
const P = (sx: number, sz: number, ex: number, sy = 0, wx = 0): ArmAngles => ({ sx, sz, sy, ex, wx });
const POSES: Record<Pose, PoseDef> = {
  dance:    { l: P(-0.8, 0.1, -0.8, -0.3, -0.2), r: P(-0.8, -0.1, -0.8, 0.3, -0.2), lean: 0, head: 0 },
  // sy > 0 turns the left arm outward, so inward reach is negative on the left and positive on the right.
  idle:     { l: P(-0.8, 0.1, -0.8, -0.3, -0.2), r: P(-0.8, -0.1, -0.8, 0.3, -0.2), lean: 0.05, head: 0 },
  knead:    { l: P(-1.0, 0.05, -0.6, -0.45, -0.5), r: P(-1.0, -0.05, -0.6, 0.45, -0.5), lean: 0.12, head: 0.04 },
  pour:     { l: P(-0.8, 0.1, -0.8, -0.3, -0.2), r: P(-1.3, 0.32, -0.3, 0.15, 0.1), lean: 0.08, head: 0.06 },
  pourBoth: { l: P(-1.6, -0.25, -0.5, -0.1), r: P(-1.6, 0.25, -0.5, 0.1), lean: 0.05, head: 0.14 },
  stretch:  { l: P(-1.25, 0.7, -0.25, 0.15, -0.3), r: P(-1.25, -0.7, -0.25, -0.15, -0.3), lean: -0.05, head: -0.05 },
  shock:    { l: P(-0.55, 0.3, -2.35, -0.5, 0.3), r: P(-0.55, -0.3, -2.35, 0.5, 0.3), lean: -0.12, head: -0.12 },
  cheer:    { l: P(-2.75, 0.35, -0.3, 0, 0.2), r: P(-2.75, -0.35, -0.3, 0, 0.2), lean: -0.08, head: -0.18 },
  wave:     { l: P(-0.8, 0.1, -0.8, -0.3, -0.2), r: P(-2.5, -0.55, -0.9, 0, 0.3), lean: 0, head: -0.05 },
  stop:     { l: P(-0.8, 0.1, -0.8, -0.3, -0.2), r: P(-1.45, 0.05, -0.35, 0.1, 1.2), lean: -0.1, head: 0.05 },
  point:    { l: P(-0.8, 0.1, -0.8, -0.3, -0.2), r: P(-1.25, 0.1, -0.2, 0.2, 0.4), lean: 0.05, head: 0 },
  begging:  { l: P(-0.8, -0.3, -1.5, -0.95, 0.4), r: P(-0.8, 0.3, -1.5, 0.95, 0.4), lean: 0.06, head: -0.13 },
  angry:    { l: P(-0.9, 0.1, -0.7), r: P(-1.5, -0.3, -1.3, 0, 0.5), lean: 0.16, head: 0.12 },
  explosion:{ l: P(-0.5, -0.15, -2.5, -0.45), r: P(-0.5, 0.15, -2.5, 0.45), lean: 0.22, head: 0.2 }
};
export type Expression = Speech['mood'];

interface PartRef { name: string; position: [number, number]; normal: [number, number]; color: [number, number]; uv: [number, number]; index: [number, number] }
interface Manifest { parts: PartRef[]; buttons: [number, number, number][]; mouth: { y: number; z: number; halfWidth: number; pivot: [number, number, number] }; eye: { x: number; y: number; z: number; r: number }; headPos: [number, number, number]; brow: [number, number, number] }

let TEX_ANISO = 4;
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = TEX_ANISO; return t;
}
const stripes = () => canvasTex(128, 16, g => {
  g.fillStyle = '#bfcfe0'; g.fillRect(0, 0, 128, 16);
  g.fillStyle = '#5a84b3'; g.fillRect(0, 0, 20, 16); g.fillStyle = '#9fb8d3'; g.fillRect(58, 0, 7, 16);
}, [34, 1]);
const knit = () => canvasTex(64, 64, g => {
  g.fillStyle = '#6a4630'; g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 8) for (let y = 0; y < 64; y += 8) {
    g.fillStyle = (x + y) % 16 ? '#77503a' : '#5f3f2b'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 8); g.lineTo(x + 8, y); g.closePath(); g.fill();
    g.strokeStyle = '#4c3020'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + 4, y + 8); g.stroke();
  }
}, [44, 26]);
function irisTexture(): THREE.CanvasTexture {
  // Equirect sphere texture: the iris looks down +z, which sits at u = 0.25, v = 0.5.
  return canvasTex(512, 256, g => {
    g.fillStyle = '#f7f3ec'; g.fillRect(0, 0, 512, 256);
    const cx = 128, cy = 128;
    const ring = g.createRadialGradient(cx, cy, 6, cx, cy, 52);
    ring.addColorStop(0, '#2a1a10'); ring.addColorStop(0.35, '#6b4423'); ring.addColorStop(0.8, '#8a5a2e'); ring.addColorStop(1, '#3a2414');
    g.fillStyle = ring; g.beginPath(); g.ellipse(cx, cy, 52, 52, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#a77845'; g.globalAlpha = 0.35;
    for (let a = 0; a < Math.PI * 2; a += 0.18) { g.beginPath(); g.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); g.lineTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = '#0d0806'; g.beginPath(); g.ellipse(cx, cy, 21, 21, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(cx - 14, cy - 15, 9, 8, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.7; g.beginPath(); g.ellipse(cx + 12, cy + 12, 4, 3.5, 0, 0, Math.PI * 2); g.fill();
  }, [1, 1]);
}

const f4 = (v: number) => v.toFixed(4);
const JAW_GLSL = (m: Manifest['mouth']) => `
uniform float uOpen; uniform float uWide; uniform float uSmile;
vec3 dayiMouth(vec3 p, inout vec3 n) {
  float my = ${f4(m.y)}; float hw = ${f4(m.halfWidth)};
  float below = smoothstep(my + 0.001, my - 0.004, p.y);
  float nearLip = 1.0 - smoothstep(0.0, 0.035, abs(p.y - my));
  float lat = mix(1.0 - smoothstep(0.09, 0.2, abs(p.x)), 1.0 - smoothstep(0.03, hw + 0.006, abs(p.x)), nearLip);
  float w = below * lat * smoothstep(-0.14, 0.04, p.z) * (1.0 - smoothstep(-0.25, -0.34, p.y));
  float a = uOpen * 0.24 * w, c = cos(a), s = sin(a);
  vec3 pv = vec3(${m.pivot.map(f4).join(',')});
  vec3 q = p - pv; q = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c); p = q + pv;
  n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
  float front = smoothstep(0.14, 0.2, p.z);
  float corner = exp(-pow((abs(p.x) - hw) / 0.028, 2.0) - pow((p.y - my) / 0.032, 2.0)) * front;
  p.y += uSmile * 0.011 * corner; p.z -= uSmile * 0.004 * corner;
  float zone = exp(-pow(p.x / 0.085, 2.0) - pow((p.y - my) / 0.04, 2.0)) * front;
  p.x *= 1.0 + (uWide - 1.0) * 0.32 * zone;
  return p;
}
`;

class Arm {
  readonly shoulder = new THREE.Group(); readonly elbow = new THREE.Group(); readonly wrist = new THREE.Group(); readonly hand = new THREE.Group();
  readonly angles: ArmAngles;
  constructor(side: 1 | -1) {
    this.angles = { ...POSES.idle[side === 1 ? 'l' : 'r'] };
    this.elbow.position.y = -0.42; this.wrist.position.y = -0.42;
    this.hand.position.set(0, -0.12, -0.04);
    this.wrist.add(this.hand); this.elbow.add(this.wrist); this.shoulder.add(this.elbow);
  }
  apply(a: ArmAngles): void {
    this.shoulder.rotation.set(a.sx, a.sy, a.sz, 'YXZ');
    this.elbow.rotation.set(a.ex, 0, 0); this.wrist.rotation.set(a.wx, 0, 0);
  }
}

export class Dayi {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly left = new Arm(1); private readonly right = new Arm(-1);
  private readonly browL = new THREE.Group(); private readonly browR = new THREE.Group();
  private readonly mustache = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = []; private readonly lids: THREE.Mesh[] = []; private readonly lowerLids: THREE.Mesh[] = [];
  private readonly lowerTeeth = new THREE.Group();
  private readonly steam = new THREE.Group();
  private readonly faceMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly fists: THREE.Mesh[] = [];
  private readonly blush = new THREE.Color();
  readonly prop = new THREE.Group(); readonly propLeft = new THREE.Group();
  private uniforms = { uOpen: { value: 0 }, uWide: { value: 1 }, uSmile: { value: 0.4 } };
  private manifest: Manifest | null = null;
  private pose: Pose = 'idle'; private poseT = 0; private expression: Expression = 'happy';
  private freePour = false;
  private blinkAt = 1; private lean = 0; private headTilt = 0; private browLift = 0; private smile = 0.4; private lidOpen = 1;
  private mouthNow: Mouth = { open: 0, wide: 1 };
  private readonly look = new THREE.Vector2();
  readonly ready: Promise<void>;
  constructor(private readonly low = false, base = '/models/') {
    this.body.add(this.head, this.left.shoulder, this.right.shoulder);
    this.left.shoulder.position.set(0.47, 1.66, 0.0); this.right.shoulder.position.set(-0.47, 1.66, 0.0);
    this.right.hand.add(this.prop); this.prop.position.set(0, -0.02, -0.05); this.prop.scale.setScalar(0.8);
    this.left.hand.add(this.propLeft); this.propLeft.position.set(0, -0.02, -0.05);
    this.root.add(this.body);
    const puff = new THREE.SphereGeometry(0.03, low ? 6 : 10, 6);
    for (let i = 0; i < 6; i++) this.steam.add(new THREE.Mesh(puff, new THREE.MeshBasicMaterial({ color: '#f7eee2', transparent: true, opacity: 0.7, depthWrite: false })));
    this.head.add(this.steam); this.steam.visible = false;
    if (low) TEX_ANISO = 1;
    this.ready = this.load(base).catch(e => console.error('Character failed to load', e));
  }
  private material(kind: 'skin' | 'face' | 'hair' | 'cap' | 'shirt' | 'vest' | 'collar'): THREE.Material {
    const Std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
    // CPU rasterizers pay per textured fragment: cloth goes Lambert without anisotropy.
    const Cloth = (p: THREE.MeshStandardMaterialParameters) => this.low ? new THREE.MeshLambertMaterial({ vertexColors: p.vertexColors ?? false, map: p.map ?? null }) : Std(p);
    switch (kind) {
      case 'face': case 'skin': {
        const m = this.low ? Std({ vertexColors: true, roughness: 0.55 })
          : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, sheen: 0.35, sheenColor: new THREE.Color('#ff9a7a'), sheenRoughness: 0.6 });
        if (kind === 'face') m.onBeforeCompile = shader => {
          Object.assign(shader.uniforms, this.uniforms);
          shader.vertexShader = JAW_GLSL(this.manifest!.mouth) + shader.vertexShader
            .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal ); vec3 dayiP = dayiMouth(position, objectNormal);')
            .replace('#include <begin_vertex>', 'vec3 transformed = dayiP;');
        };
        if (kind === 'face') this.faceMaterials.push(m);
        return m;
      }
      case 'hair': return Std({ vertexColors: true, roughness: 0.88 });
      case 'cap': return Std({ vertexColors: true, roughness: 0.95 });
      case 'shirt': return Cloth({ vertexColors: true, map: stripes(), roughness: 0.8 });
      case 'vest': return Cloth({ vertexColors: true, map: knit(), roughness: 0.95 });
      case 'collar': return Std({ vertexColors: true, roughness: 0.75 });
    }
  }
  private async load(base: string): Promise<void> {
    const lod = this.low ? 'dayi-low' : 'dayi';
    const [manifest, bin] = await Promise.all([fetch(`${base}${lod}.json`).then(r => r.json() as Promise<Manifest>), fetch(`${base}${lod}.bin`).then(r => r.arrayBuffer())]);
    this.manifest = manifest;
    const geo = (p: PartRef) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, p.position[0], p.position[1]), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(bin, p.normal[0], p.normal[1]), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bin, p.color[0], p.color[1]), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, p.uv[0], p.uv[1]), 2));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, p.index[0], p.index[1]), 1));
      g.computeBoundingSphere(); return g;
    };
    const parts = new Map(manifest.parts.map(p => [p.name, p]));
    const mk = (name: string, mat: THREE.Material) => { const m = new THREE.Mesh(geo(parts.get(name)!), mat); m.castShadow = true; m.receiveShadow = true; return m; };
    const face = this.material('face'), skin = this.material('skin'), hair = this.material('hair'), shirt = this.material('shirt');
    this.head.position.set(...manifest.headPos);
    this.head.add(mk('head', face), mk('hair', hair), mk('cap', this.material('cap')));
    this.mustache.add(mk('mustache', hair)); this.head.add(this.mustache);
    const b = manifest.brow;
    for (const [grp, name, sx] of [[this.browL, 'browL', 1], [this.browR, 'browR', -1]] as const) {
      const m = mk(name, hair); m.position.set(-b[0] * sx, -b[1], -b[2]); grp.position.set(b[0] * sx, b[1], b[2]); grp.add(m); this.head.add(grp);
    }
    // Eyes: glossy balls with a painted iris, skin lids that blink.
    const e = manifest.eye, iris = irisTexture();
    const eyeMat = this.low ? new THREE.MeshStandardMaterial({ map: iris, roughness: 0.15 }) : new THREE.MeshPhysicalMaterial({ map: iris, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
    const lidMat = new THREE.MeshStandardMaterial({ color: '#e3a07c', roughness: 0.55 });
    const lashMat = new THREE.MeshStandardMaterial({ color: '#2b2420', roughness: 0.8 });
    for (const sx of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(e.r, 40, 28), eyeMat); eye.position.set(e.x * sx, e.y, e.z); this.head.add(eye); this.eyes.push(eye);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(e.r + 0.0032, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
      const lash = new THREE.Mesh(new THREE.TorusGeometry(e.r + 0.0033, 0.0022, 6, 40, Math.PI), lashMat); lash.rotation.x = Math.PI / 2; lash.rotation.z = Math.PI; lid.add(lash);
      lid.position.copy(eye.position); this.head.add(lid); this.lids.push(lid);
      const lower = new THREE.Mesh(new THREE.SphereGeometry(e.r + 0.0028, 36, 10, 0, Math.PI * 2, Math.PI * 0.64, Math.PI * 0.36), lidMat);
      lower.position.copy(eye.position); this.head.add(lower); this.lowerLids.push(lower);
    }
    // Teeth: an upper row behind the lip and a lower row that rides the jaw.
    const toothMat = new THREE.MeshStandardMaterial({ color: '#fbf7ee', roughness: 0.3 });
    const m = manifest.mouth;
    const row = () => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.008, 8, 28, Math.PI * 0.62), toothMat); t.rotation.set(Math.PI / 2, 0, Math.PI * 0.19); t.scale.set(1, 1.2, 0.75); return t; };
    const upper = row(); upper.position.set(0, m.y + 0.004, m.z - 0.06); this.head.add(upper);
    const lower = row(); lower.position.set(0, m.y - 0.012 - m.pivot[1], m.z - 0.066 - m.pivot[2]);
    this.lowerTeeth.position.set(...m.pivot); this.lowerTeeth.add(lower); this.head.add(this.lowerTeeth);
    // Torso, vest, collar, buttons.
    // Outer layers first so early depth rejection skips the shirt hidden under the vest.
    const vest = mk('vest', this.material('vest')), torso = mk('shirt', shirt); vest.renderOrder = -2; torso.renderOrder = -1;
    this.body.add(torso, vest, mk('collar', this.material('collar')));
    const btn = new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.3 });
    for (const p of manifest.buttons) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 16), btn); c.rotation.x = Math.PI / 2; c.position.set(...p); this.body.add(c); }
    // Arms.
    // Hands are sculpted palm-forward; turned half a turn so palms face the slime.
    // That also swaps the thumb side, so each arm takes the opposite sculpt.
    for (const [arm, hand] of [[this.left, 'handR'], [this.right, 'handL']] as const) {
      arm.shoulder.add(mk('sleeve', shirt)); arm.elbow.add(mk('forearm', skin));
      const h = mk(hand, skin); h.rotation.y = Math.PI; arm.wrist.add(h); this.fists.push(h);
    }
  }
  setPose(p: Pose): void { if (p !== this.pose) { this.pose = p; this.poseT = 0; } }
  setExpression(e: Expression): void { this.expression = e; }
  setFreePour(on: boolean): void { this.freePour = on; }
  /** World position of a hand, for slime interaction. */
  handWorld(side: 'l' | 'r', out = new THREE.Vector3()): THREE.Vector3 { return (side === 'l' ? this.left : this.right).hand.getWorldPosition(out); }
  update(dt: number, t: number, mouth: Mouth): void {
    this.poseT += dt;
    const target = POSES[this.pose], k = 1 - Math.exp(-dt * 7);
    const wob = (side: number): ArmAngles => {
      if (this.freePour && side === 1) return P(-1.3, -0.32, -0.3, -0.15, 0.1);
      const base = target[side === 1 ? 'l' : 'r'];
      if (this.pose === 'knead' || this.pose === 'idle') {
        const amp = this.pose === 'knead' ? 0.22 : 0.05, ph = t * (this.pose === 'knead' ? 5.2 : 1.4) + (side === 1 ? 0 : Math.PI);
        return { ...base, sx: base.sx + Math.sin(ph) * amp, ex: base.ex + Math.cos(ph) * amp * 0.9, wx: base.wx + Math.sin(ph + 1) * amp };
      }
      if (this.pose === 'wave' && side === -1) return { ...base, sz: base.sz + Math.sin(t * 10) * 0.35 };
      if (this.pose === 'stretch') { const s = (Math.sin(t * 2.4) + 1) * 0.5; return { ...base, sz: base.sz * (0.55 + 0.45 * s) }; }
      if (this.pose === 'cheer') return { ...base, sz: base.sz + Math.sin(t * 9 + side) * 0.12 };
      if (this.pose === 'stop' && side === -1) return { ...base, sy: base.sy + Math.sin(t * 14) * 0.25 };
      if (this.pose === 'begging') return { ...base, ex: base.ex + Math.sin(t * 5) * 0.08 };
      if (this.pose === 'angry' && side === -1) return { ...base, sx: base.sx + Math.sin(t * 13) * 0.3 };
      if (this.pose === 'explosion' && this.poseT < 1) return { ...POSES.knead[side === 1 ? 'l' : 'r'], sx: -1.1 + Math.sin(this.poseT * 14) * 0.65 };
      return base;
    };
    for (const [arm, side] of [[this.left, 1], [this.right, -1]] as const) {
      const w = wob(side);
      for (const key of ['sx', 'sz', 'sy', 'ex', 'wx'] as const) arm.angles[key] += (w[key] - arm.angles[key]) * k;
      arm.apply(arm.angles);
    }
    const tilt = this.pose === 'pour' || this.pose === 'pourBoth' ? Math.min(1, this.poseT * 1.5) : 0;
    this.prop.rotation.x += ((tilt ? -2.2 : 0) - this.prop.rotation.x) * k;
    this.propLeft.rotation.x += ((this.freePour ? -2.2 : 0) - this.propLeft.rotation.x) * k;
    this.lean += (target.lean - this.lean) * k; this.body.rotation.x = this.lean;
    const ex = this.expression;
    this.blush.setRGB(1, ex === 'explosion' ? 0.25 : ex === 'angry' ? 0.58 : 1, ex === 'explosion' ? 0.16 : ex === 'angry' ? 0.48 : 1);
    for (const m of this.faceMaterials) m.color.lerp(this.blush, k);
    for (const hand of this.fists) hand.scale.y += ((ex === 'angry' || ex === 'explosion' ? 0.58 : 1) - hand.scale.y) * k;
    this.steam.visible = ex === 'explosion';
    for (const [i, puff] of this.steam.children.entries()) {
      const f = (t * 1.5 + i / 3) % 1;
      puff.position.set((i % 2 ? -1 : 1) * (0.22 + f * 0.12), 0.08 + f * 0.45, 0.03);
      puff.scale.setScalar(0.6 + f * 2.3); (puff as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>).material.opacity = (1 - f) * 0.75;
    }
    const shockShake = ex === 'shock' ? Math.sin(t * 30) * 0.03 : 0;
    this.headTilt += (target.head - this.headTilt) * k;
    this.head.rotation.set(this.headTilt + Math.sin(t * 1.1) * 0.03, Math.sin(t * 0.7) * 0.12 + shockShake, Math.sin(t * 0.9) * 0.04);
    this.body.position.y = Math.sin(t * 1.6) * 0.006;
    // Brows and smile carry the mood.
    const browT = ex === 'begging' ? 0.024 : ex === 'angry' || ex === 'explosion' ? -0.012 : ex === 'shock' ? 0.02 : ex === 'excited' ? 0.012 : 0;
    this.browLift += (browT - this.browLift) * k;
    if (this.manifest) { this.browL.position.y = this.manifest.brow[1] + this.browLift; this.browR.position.y = this.browL.position.y; }
    // Negative z on the left brow lifts its inner end: warm when happy, wide open in shock.
    const browRot = ex === 'begging' ? -0.35 : ex === 'angry' || ex === 'explosion' ? 0.4 : ex === 'shock' ? -0.16 : ex === 'excited' ? -0.1 : ex === 'calm' ? 0 : -0.07;
    this.browL.rotation.z += (browRot - this.browL.rotation.z) * k; this.browR.rotation.z = -this.browL.rotation.z;
    const smileT = ex === 'begging' || ex === 'angry' || ex === 'explosion' ? -1 : ex === 'shock' ? -0.2 : ex === 'excited' ? 1 : ex === 'happy' ? 0.7 : 0.35;
    this.smile += (smileT - this.smile) * k;
    // Blink every few seconds; eyes widen in shock.
    if (t > this.blinkAt + 0.16) this.blinkAt = t + 2.2 + Math.random() * 3;
    const blinking = t > this.blinkAt && t < this.blinkAt + 0.16;
    const lidT = blinking ? 0 : ex === 'shock' ? 1.25 : ex === 'calm' ? 0.85 : 1;
    this.lidOpen += (lidT - this.lidOpen) * Math.min(1, dt * (blinking ? 40 : 10));
    for (const lid of this.lids) lid.rotation.x = 1.45 - this.lidOpen * 1.88;
    // Lower lids rise when he smiles, so the eyes smile too.
    const lowT = ex === 'shock' ? 0.05 : ex === 'excited' ? -0.42 : ex === 'happy' ? -0.32 : -0.15;
    for (const lid of this.lowerLids) lid.rotation.x += (lowT - lid.rotation.x) * k;
    // Eyes glance around, mostly at the camera, and down at the slime while working.
    if (Math.random() < dt * 0.6) this.look.set((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.15);
    const gaze = this.pose === 'knead' || this.pose === 'pour' ? new THREE.Vector2(0, 0.35) : this.look;
    for (const eye of this.eyes) { eye.rotation.y += (gaze.x - eye.rotation.y) * k; eye.rotation.x += (gaze.y - eye.rotation.x) * k; }
    // Jaw follows the voice; shock holds an O.
    const target2 = ex === 'shock' && mouth.open < 0.1 ? { open: 0.55, wide: 0.7 } : mouth;
    const sm = 1 - Math.exp(-dt * 24);
    this.mouthNow = { open: this.mouthNow.open + (target2.open - this.mouthNow.open) * sm, wide: this.mouthNow.wide + (target2.wide - this.mouthNow.wide) * sm };
    this.uniforms.uOpen.value = this.mouthNow.open; this.uniforms.uWide.value = this.mouthNow.wide;
    this.uniforms.uSmile.value = this.smile * (1 - this.mouthNow.open * 0.5);
    this.lowerTeeth.rotation.x = this.mouthNow.open * 0.24;
    this.mustache.position.y = this.mouthNow.open * 0.006 + this.smile * 0.002;
  }
}
