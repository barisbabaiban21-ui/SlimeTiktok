import * as THREE from 'three';
import { CATALOG } from '../../shared/ingredients.js';
import type { IngredientId } from '../../shared/types.js';

const m = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, ...extra });
function labelTexture(text: string, bg: string, fg = '#ffffff'): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d')!; g.fillStyle = bg; g.fillRect(0, 0, 128, 64);
  g.fillStyle = fg; g.font = 'bold 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function bottle(body: string, cap: string, label: string, labelBg: string, r = 0.06, h = 0.22, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 18), m(body, opts)); b.position.y = h / 2;
  const l = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.45, 18, 1, true), new THREE.MeshStandardMaterial({ map: labelTexture(label, labelBg), roughness: 0.6 }));
  l.position.y = h * 0.45; l.rotation.y = Math.PI;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r, h * 0.18, 14), m(body, opts)); neck.position.y = h + h * 0.09;
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.42, h * 0.16, 12), m(cap)); c.position.y = h + h * 0.24;
  // Where liquid leaves the bottle: the stream starts here.
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; mouth.position.y = h + h * 0.33;
  g.add(b, l, neck, c, mouth);
  return g;
}
/** Held props, one per ingredient. All original, built from primitives. The origin is the grip: the hand closes
 * around the middle of the bottle, and pouring tilts it about that point. */
export function makeProp(ing: IngredientId): THREE.Group {
  const g = shape(ing), grip = new THREE.Group();
  const box = new THREE.Box3().setFromObject(g);
  if (ing !== 'kova') g.position.y = -(box.min.y + (box.max.y - box.min.y) * 0.42);
  grip.add(g);
  return grip;
}
function shape(ing: IngredientId): THREE.Group {
  let g: THREE.Group;
  switch (ing) {
    case 'su': g = bottle('#bfe6ff', '#2f7de1', 'SU', '#2f7de1', 0.055, 0.25, { transparent: true, opacity: 0.6 }); break;
    case 'tiras_kopugu': g = bottle('#2f6fd0', '#e8e8e8', 'KÖPÜK', '#1f4f9c', 0.05, 0.22); break;
    case 'sim': g = bottle('#ffd84a', '#f2f2f2', 'SİM', '#c79a00', 0.04, 0.1, { metalness: 0.6, roughness: 0.25 }); break;
    case 'pudra': g = bottle('#ffe4ef', '#ff8fb8', 'PUDRA', '#ff6fa3', 0.05, 0.17); break;
    case 'tutkal': g = bottle('#f7f7f2', '#e53935', 'TUTKAL', '#e53935', 0.07, 0.3); break;
    case 'sampuan': g = bottle('#5fd3a6', '#ffffff', 'ŞAMPUAN', '#2f9f77', 0.055, 0.24); break;
    case 'ketcap': g = bottle('#d8261c', '#ffffff', 'KETÇAP', '#9e140c', 0.055, 0.24); break;
    case 'sirke': g = bottle('#f3e7a1', '#7a5b2e', 'SİRKE', '#7a5b2e', 0.05, 0.25, { transparent: true, opacity: 0.75 }); break;
    case 'boya': g = bottle('#ff5fa2', '#222222', 'BOYA', '#ffffff', 0.06, 0.22); break;
    case 'boraks': {
      g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.08), [m('#e9f4ff'), m('#e9f4ff'), m('#5b8bd6'), m('#e9f4ff'), new THREE.MeshStandardMaterial({ map: labelTexture('BORAKS', '#5b8bd6') }), m('#e9f4ff')]);
      box.position.y = 0.09; g.add(box); break;
    }
    case 'yumurta': {
      g = new THREE.Group();
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), m('#fff4de', { roughness: 0.5 })); egg.scale.set(1, 1.3, 1); egg.position.y = 0.06; g.add(egg); break;
    }
    case 'kova': {
      g = new THREE.Group();
      const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 22, 1, true), m('#dfe7ee', { side: THREE.DoubleSide }));
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.16, 22), m('#c5d0d8')); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.15;
      const glue = new THREE.Mesh(new THREE.CircleGeometry(0.19, 22), m('#fafafa', { roughness: 0.1 })); glue.rotation.x = -Math.PI / 2; glue.position.y = 0.1;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.01, 6, 24, Math.PI), m('#7b8b98')); handle.position.y = 0.15;
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.17, 0.12, 22, 1, true), new THREE.MeshStandardMaterial({ map: labelTexture('DEV TUTKAL', '#e53935'), side: THREE.DoubleSide }));
      label.rotation.y = Math.PI;
      const rim = new THREE.Object3D(); rim.name = 'mouth'; rim.position.set(0, 0.15, 0.2);
      pail.add(bottom, glue, handle, label, rim); pail.position.y = 0.15; g.add(pail); g.scale.setScalar(1.2); break;
    }
    default: g = bottle(CATALOG[ing].color, '#ffffff', CATALOG[ing].name.toLocaleUpperCase('tr'), '#444', 0.055, 0.22);
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}
export type PourStyle = 'stream' | 'thick' | 'sprinkle' | 'powder' | 'foam' | 'egg' | 'bubbles';
export function pourStyle(ing: IngredientId): PourStyle {
  if (ing === 'sim' || ing === 'boncuk') return 'sprinkle';
  if (ing === 'pudra' || ing === 'boraks') return 'powder';
  if (ing === 'tiras_kopugu') return 'foam';
  if (ing === 'yumurta') return 'egg';
  if (ing === 'sirke') return 'bubbles';
  if (ing === 'tutkal' || ing === 'kova' || ing === 'ketcap') return 'thick';
  return 'stream';
}

const GRAVITY = 3.2, STREAM_RINGS = 24, STREAM_SIDES = 10;
interface Particle { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; size: number }
/** Liquid stream from the prop to the slime plus a small particle pool. */
export class Effects {
  readonly group = new THREE.Group();
  private readonly stream: THREE.Mesh; private readonly streamPos: Float32Array;
  private readonly streamMat: THREE.MeshStandardMaterial;
  private readonly particles: Particle[] = [];
  private readonly puffs: THREE.InstancedMesh;
  private readonly puffMat: THREE.MeshStandardMaterial;
  private readonly egg: THREE.Group;
  private eggT = -1; private readonly eggFrom = new THREE.Vector3(); private readonly eggTo = new THREE.Vector3();
  private readonly dummy = new THREE.Object3D();
  constructor(low: boolean) {
    this.streamMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, transparent: true, opacity: 0.85 });
    // A tube rebuilt every frame along the falling arc: RINGS × SIDES vertices, thinning as it speeds up.
    const sg = new THREE.BufferGeometry(), idx: number[] = [];
    this.streamPos = new Float32Array(STREAM_RINGS * STREAM_SIDES * 3);
    for (let r = 0; r < STREAM_RINGS - 1; r++) for (let s = 0; s < STREAM_SIDES; s++) {
      const a = r * STREAM_SIDES + s, b = r * STREAM_SIDES + (s + 1) % STREAM_SIDES, c = a + STREAM_SIDES, d = b + STREAM_SIDES;
      idx.push(a, c, b, b, c, d);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(this.streamPos, 3).setUsage(THREE.DynamicDrawUsage)); sg.setIndex(idx);
    this.stream = new THREE.Mesh(sg, this.streamMat); this.stream.visible = false; this.stream.frustumCulled = false;
    this.puffMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, transparent: true, opacity: 0.9 });
    this.puffs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.puffMat, low ? 60 : 140);
    this.puffs.count = 0; this.puffs.frustumCulled = false;
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: '#fff4de' })); egg.scale.set(1, 1.3, 1);
    const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffb300', roughness: 0.2 })); yolk.visible = false; yolk.name = 'yolk';
    this.egg = new THREE.Group(); this.egg.add(egg, yolk); this.egg.visible = false;
    this.group.add(this.stream, this.puffs, this.egg);
  }
  /**
   * Liquid leaves the mouth slowly and falls under gravity to where it lands: positions along that arc, with the
   * radius shrinking as the stream speeds up (continuity) and a small wobble that grows toward the bottom.
   */
  private arc(from: THREE.Vector3, to: THREE.Vector3, w: number, t: number): void {
    const drop = Math.max(0.02, from.y - to.y), T = Math.sqrt(2 * drop / GRAVITY);
    const vx = (to.x - from.x) / T, vz = (to.z - from.z) / T, pos = this.streamPos;
    for (let r = 0; r < STREAM_RINGS; r++) {
      const f = r / (STREAM_RINGS - 1), tt = f * T;
      const cx = from.x + vx * tt + Math.sin(f * 9 - t * 11) * 0.006 * f, cy = from.y - 0.5 * GRAVITY * tt * tt, cz = from.z + vz * tt + Math.cos(f * 7 - t * 9) * 0.004 * f;
      // Faster below, so thinner: radius ∝ 1/√speed, never less than a third.
      const speed = Math.hypot(vx, GRAVITY * tt, vz) + 0.3, rad = w * Math.max(0.35, Math.sqrt(0.6 / speed)) * (1 + 0.12 * Math.sin(f * 23 - t * 17));
      for (let s = 0; s < STREAM_SIDES; s++) {
        const a = (s / STREAM_SIDES) * Math.PI * 2, v = (r * STREAM_SIDES + s) * 3;
        pos[v] = cx + Math.cos(a) * rad; pos[v + 1] = cy; pos[v + 2] = cz + Math.sin(a) * rad;
      }
    }
    const g = this.stream.geometry; g.attributes.position!.needsUpdate = true; g.computeVertexNormals();
  }
  /** Draw a stream between two world points. */
  /** Cuts the stream and clears the droplets at once (a show takes the stage). */
  stop(): void { this.stream.visible = false; this.particles.length = 0; }
  pour(from: THREE.Vector3, to: THREE.Vector3, style: PourStyle, color: string, on: boolean, dt: number, scale = 1): void {
    const liquid = on && (style === 'stream' || style === 'thick');
    this.stream.visible = liquid;
    if (liquid) {
      this.arc(from, to, (style === 'thick' ? 0.026 : 0.012) * scale, performance.now() / 1000);
      this.streamMat.color.set(color); this.streamMat.opacity = color === '#7cc7ff' ? 0.55 : 0.92;
      // Where it lands, a few droplets splash up.
      for (let i = 0; i < Math.ceil(14 * dt); i++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5);
        this.particles.push({ p: to.clone(), v, life: 0, max: 0.35, size: 0.006 * scale });
        if (this.particles.length > this.puffs.instanceMatrix.count) this.particles.shift();
      }
      this.puffMat.color.set(color); this.puffMat.emissive.set('#000000');
    }
    if (on && (style === 'sprinkle' || style === 'powder' || style === 'foam' || style === 'bubbles')) {
      const rate = style === 'foam' ? 30 : 60;
      for (let i = 0; i < Math.ceil(rate * dt); i++) {
        const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08);
        // Ballistic launch that lands on the slime after T seconds under the same gravity as update().
        const T = 0.42 + Math.random() * 0.12, target = to.clone().add(jitter);
        const v = new THREE.Vector3().subVectors(target, from).divideScalar(T); v.y += 0.5 * GRAVITY * T;
        const size = style === 'foam' ? 0.035 + Math.random() * 0.03 : style === 'bubbles' ? 0.012 + Math.random() * 0.012 : style === 'powder' ? 0.02 : 0.008;
        this.particles.push({ p: from.clone(), v, life: 0, max: style === 'bubbles' ? 1.1 : T + 0.15, size: size * scale });
        if (this.particles.length > this.puffs.instanceMatrix.count) this.particles.shift();
      }
      this.puffMat.color.set(style === 'sprinkle' ? '#ffe36b' : style === 'bubbles' ? '#f7f2cf' : '#ffffff');
      this.puffMat.emissive.set(style === 'sprinkle' ? '#806000' : '#000000');
    }
  }
  dropEgg(from: THREE.Vector3, to: THREE.Vector3): void { this.eggT = 0; this.eggFrom.copy(from); this.eggTo.copy(to); this.egg.visible = true; this.egg.getObjectByName('yolk')!.visible = false; }
  burst(at: THREE.Vector3, color: string, n = 40): void {
    this.puffMat.color.set(color);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5);
      this.particles.push({ p: at.clone(), v, life: 0, max: 1.4, size: 0.015 + Math.random() * 0.02 });
    }
    while (this.particles.length > this.puffs.instanceMatrix.count) this.particles.shift();
  }
  update(dt: number): void {
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i]!; q.life += dt;
      if (q.life > q.max) { this.particles.splice(i, 1); continue; }
      q.v.y -= GRAVITY * dt; q.p.addScaledVector(q.v, dt);
      this.dummy.position.copy(q.p); this.dummy.scale.setScalar(q.size * (1 - (q.life / q.max) * 0.5)); this.dummy.updateMatrix();
      this.puffs.setMatrixAt(n++, this.dummy.matrix);
    }
    this.puffs.count = n; this.puffs.instanceMatrix.needsUpdate = true;
    if (this.eggT >= 0) {
      this.eggT += dt;
      const f = Math.min(1, this.eggT / 0.45);
      this.egg.position.lerpVectors(this.eggFrom, this.eggTo, f); this.egg.position.y += Math.sin(f * Math.PI) * 0.1;
      if (f >= 1) { this.egg.getObjectByName('yolk')!.visible = true; this.egg.children[0]!.visible = false; }
      if (this.eggT > 1.6) { this.eggT = -1; this.egg.visible = false; this.egg.children[0]!.visible = true; }
    }
  }
}
