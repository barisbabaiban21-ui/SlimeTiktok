import * as THREE from 'three';

export interface SlimeLook {
  /** 0..1+ visual size from log mass. */
  size: number; consistency: number; fluff: number; sparkle: number; hue: number;
  stains: { ketcap: number; yumurta: number; sirke: number };
  /** Coloured beads, 0..100. */
  beads: number;
  hands: THREE.Vector3[]; knead: number; stretch: number; drape: number;
  /** A stream is landing on the slime right now. */
  pouring: boolean;
  /** First milestone (kept for the stage; the pan is the container throughout). */
  bowl: boolean;
  /** Where the stream lands (x, z); new slime piles up there. */
  pourAt: THREE.Vector2 | null;
}
/** The pan in front of Dayı. The slime lives in it, never outside it. */
export const PAN_X = 0, PAN_Z = 0.2, PAN_R = 0.46, PAN_RIM = 0.15;
/** Height above the table of the pan's inner floor at radius r (the pan mesh in stage.ts uses the same profile). */
export function panFloor(r: number): number {
  if (r < 0.3) return 0.008 + r / 0.3 * 0.01;
  if (r < 0.42) return 0.018 + (r - 0.3) / 0.12 * 0.06;
  if (r < PAN_R) return 0.078 + (r - 0.42) / (PAN_R - 0.42) * (PAN_RIM - 0.078);
  return PAN_RIM + 0.004;
}
/** The simulation grid: a square just around the pan. */
const X0 = PAN_X - PAN_R, X1 = PAN_X + PAN_R, Z0 = PAN_Z - PAN_R, Z1 = PAN_Z + PAN_R;
const smooth = (a: number, b: number, x: number) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Slime in a pan. Simulated as a Bingham (yield-stress) thin film on a square grid inside the pan: flux grows with
 * thickness cubed, a layer moves only where thickness × slope beats its yield, and a little surface tension rounds
 * peaks. Drawn on a round mesh that matches the pan, with the pan's floor evaluated exactly at every vertex, so the
 * edge is where the surface meets the curved pan wall: a smooth line, with no grid steps and nothing outside the pan.
 */
export class Slime {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial;
  private readonly nx: number; private readonly d: number;
  private readonly h: Float32Array; private readonly next: Float32Array; private readonly view: Float32Array;
  private readonly give: Float32Array; private readonly floor: Float32Array; private readonly open: Uint8Array; private readonly level: Float32Array;
  private readonly rings: number; private readonly segs: number;
  private readonly geo = new THREE.BufferGeometry(); private readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array; private readonly col: Float32Array; private readonly depth: Float32Array; private readonly radii: Float32Array;
  private readonly strand: THREE.Mesh;
  private readonly beads: THREE.InstancedMesh;
  private readonly glitter: THREE.Points; private readonly glitterPos: Float32Array;
  private readonly base = new THREE.Color(); private readonly tmp = new THREE.Color(); private readonly mix = new THREE.Color();
  private readonly white = new THREE.Color('#ffffff'); private readonly red = new THREE.Color('#c81d12');
  private readonly yolk = new THREE.Color('#ffbf1f'); private readonly vinegar = new THREE.Color('#efe6b0');
  private readonly m4 = new THREE.Matrix4();
  private started = false; private capacity = 0;
  /** Rings spreading out from where a stream hits: (x, z, start time, height). */
  private readonly ripples: { x: number; z: number; t0: number; amp: number }[] = [];
  private wasPouring = false; private nextRipple = 0;
  /** Per hand: how deep it presses now (eased), where it last touched, and its strand once it lifts off. */
  private readonly touch = [0, 1].map(() => ({ w: 0, x: 0, z: 0, y: 0, depth: 0, strand: null as null | { x: number; y: number; z: number; age: number } }));
  private readonly strands: THREE.Mesh[] = [];
  private now = 0;
  private squash = 0;
  /** Where pours land: the stream aims here and Dayı's effects burst from here. */
  topWorld = new THREE.Vector3();
  constructor(readonly tableTop: number, low: boolean) {
    this.material = low
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0, envMapIntensity: 1.6 })
      : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.12, sheen: 0.15, envMapIntensity: 0.8 });
    this.nx = low ? 72 : 110; this.d = (X1 - X0) / (this.nx - 1);
    const n = this.nx * this.nx;
    this.h = new Float32Array(n); this.next = new Float32Array(n); this.view = new Float32Array(n);
    this.give = new Float32Array(n); this.floor = new Float32Array(n); this.open = new Uint8Array(n); this.level = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const r = Math.hypot(X0 + (k % this.nx) * this.d - PAN_X, Z0 + Math.floor(k / this.nx) * this.d - PAN_Z);
      this.open[k] = r < PAN_R - 0.004 ? 1 : 0; this.floor[k] = panFloor(r);
      if (this.open[k]) this.capacity += Math.max(0, PAN_RIM - 0.02 - this.floor[k]!);
    }
    this.capacity *= this.d * this.d;
    // Round mesh: rings from the centre to the wall, denser toward the wall where the edge is.
    [this.rings, this.segs] = low ? [32, 80] : [52, 128];
    const verts = this.rings * this.segs;
    this.pos = new Float32Array(verts * 3); this.col = new Float32Array(verts * 3); this.depth = new Float32Array(verts); this.radii = new Float32Array(this.rings);
    for (let i = 0; i < this.rings; i++) this.radii[i] = (PAN_R - 0.002) * (1 - (1 - i / (this.rings - 1)) ** 1.4);
    const idx: number[] = [];
    for (let i = 0; i < this.rings - 1; i++) for (let j = 0; j < this.segs; j++) {
      const a = i * this.segs + j, b = i * this.segs + (j + 1) % this.segs, c = a + this.segs, e = b + this.segs;
      idx.push(a, b, c, b, e, c); // counter-clockwise seen from above, so the top is the front face
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('depth', new THREE.BufferAttribute(this.depth, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    // Dry parts of the mesh are dropped per pixel, so the slime ends exactly where it meets the pan.
    const surface = this.material.clone();
    surface.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float depth;\nvarying float vDepth;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = depth;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDepth;')
        .replace('void main() {', 'void main() {\n  if (vDepth < 0.0006) discard;');
    };
    this.mesh = new THREE.Mesh(this.geo, surface);
    const shadow = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    shadow.onBeforeCompile = surface.onBeforeCompile;
    this.mesh.customDepthMaterial = shadow; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.strand = new THREE.Mesh(new THREE.BufferGeometry(), this.material); this.strand.visible = false; this.group.add(this.strand);
    for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(new THREE.BufferGeometry(), this.material); m.visible = false; m.castShadow = true; this.strands.push(m); this.group.add(m); }
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.25 }), 14);
    this.beads.count = 0; this.group.add(this.beads);
    const count = low ? 120 : 260;
    this.glitterPos = new Float32Array(count * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.glitterPos, 3));
    this.glitter = new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff6c2', size: low ? 0.014 : 0.01, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.group.add(this.glitter);
  }
  poke(amount = 1): void { this.squash = Math.min(1.5, this.squash + amount); }
  private cell(x: number, z: number): number {
    const i = Math.round((x - X0) / this.d), j = Math.round((z - Z0) / this.d);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nx ? -1 : j * this.nx + i;
  }
  private surface(x: number, z: number): number { const k = this.cell(x, z); return k < 0 || !this.open[k] ? this.tableTop + panFloor(PAN_R) : this.tableTop + this.floor[k]! + this.h[k]!; }
  private volume(): number { let v = 0; for (let k = 0; k < this.h.length; k++) v += this.h[k]!; return v * this.d * this.d; }
  /** Fills the pan to volume v as a level pool, the way it looks after it has settled. */
  private fill(v: number): void {
    let lo = 0, hi = PAN_RIM;
    for (let it = 0; it < 30; it++) {
      const L = (lo + hi) / 2; let vol = 0;
      for (let k = 0; k < this.h.length; k++) if (this.open[k]) vol += Math.max(0, L - this.floor[k]!);
      if (vol * this.d * this.d < v) lo = L; else hi = L;
    }
    for (let k = 0; k < this.h.length; k++) this.h[k] = this.open[k] ? Math.max(0, lo - this.floor[k]!) : 0;
  }
  /** Adds volume v (m³) as a Gaussian at (x, z): a pour piles up where it lands. */
  private add(x: number, z: number, v: number, sigma: number): void {
    const r = sigma * 2.5, ks: number[] = [], ws: number[] = [];
    let sum = 0;
    for (let j = Math.max(0, Math.floor((z - r - Z0) / this.d)); j <= Math.min(this.nx - 1, Math.ceil((z + r - Z0) / this.d)); j++)
      for (let i = Math.max(0, Math.floor((x - r - X0) / this.d)); i <= Math.min(this.nx - 1, Math.ceil((x + r - X0) / this.d)); i++) {
        const k = j * this.nx + i; if (!this.open[k]) continue;
        const w = Math.exp(-((X0 + i * this.d - x) ** 2 + (Z0 + j * this.d - z) ** 2) / (2 * sigma * sigma));
        ks.push(k); ws.push(w); sum += w;
      }
    if (!sum) return;
    const per = v / (this.d * this.d * sum);
    for (let n = 0; n < ks.length; n++) this.h[ks[n]!]! += per * ws[n]!;
  }
  /** Moves a fraction of every cell's slime one cell toward (x, z): a spread sheet slowly draws together. */
  private gather(x: number, z: number, rate: number): void {
    const { nx, h, next, open } = this;
    next.set(h);
    for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!open[k] || h[k]! < 1e-5) continue;
      const di = Math.sign(Math.round((x - X0) / this.d) - i), dj = Math.sign(Math.round((z - Z0) / this.d) - j);
      const t = k + di + dj * nx; if ((!di && !dj) || !open[t]) continue;
      const m = h[k]! * rate; next[k]! -= m; next[t]! += m;
    }
    h.set(next);
  }
  /**
   * One explicit step of Bingham thin-film flow: a layer moves only where gravity beats its yield (thickness × slope
   * above `yieldH`), with flux ∝ thickness³; a little surface tension rounds peaks. Slope is measured isotropically.
   */
  private flow(dt: number, fluidity: number, yieldH: number, tension: number): void {
    const { nx, h, next, floor, open, give } = this, c = fluidity * dt / (this.d * this.d), ct = tension * dt / (this.d * this.d);
    const H = (k: number) => floor[k]! + h[k]!;
    for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!open[k] || h[k]! <= 0) { give[k] = 0; continue; }
      const l = i > 0 && open[k - 1] ? k - 1 : k, r = i < nx - 1 && open[k + 1] ? k + 1 : k, b = j > 0 && open[k - nx] ? k - nx : k, f = j < nx - 1 && open[k + nx] ? k + nx : k;
      const gx = (H(r) - H(l)) / (this.d * Math.max(1, r - l)), gz = (H(f) - H(b)) / (this.d * Math.max(1, (f - b) / nx)), g = Math.hypot(gx, gz);
      const hold = yieldH / Math.max(h[k]!, 0.002);
      give[k] = g > hold ? 1 - hold / g : 0;
    }
    next.set(h);
    for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!open[k]) continue;
      for (const [o, ok] of [[1, i + 1 < nx], [nx, j + 1 < nx]] as const) {
        if (!ok || !open[k + o]) continue;
        const hm = (h[k]! + h[k + o]!) / 2, yieldF = (give[k]! + give[k + o]!) / 2;
        const q0 = (Math.min(0.24, c * hm * hm * hm) * yieldF + (hm > 0.003 ? Math.min(0.1, ct) : 0)) * (H(k) - H(k + o));
        const q = q0 > 0 ? Math.min(q0, h[k]! / 4) : Math.max(q0, -h[k + o]! / 4);
        next[k]! -= q; next[k + o]! += q;
      }
    }
    h.set(next);
  }
  update(dt: number, t: number, look: SlimeLook): void {
    this.squash = Math.max(0, this.squash - dt * 2.5);
    const runny = THREE.MathUtils.clamp(-look.consistency / 100, 0, 1);
    // Broad, soft highlights (no pin-point glints that bloom into light leaks); runnier slime is a bit glossier.
    this.material.roughness = 0.18 - runny * 0.07;
    const size = THREE.MathUtils.clamp(look.size, 0.05, 1.2);
    // Consistency sets the yield (how much it holds a shape) and fluidity (how fast it moves): heavy like pudding.
    const firm = THREE.MathUtils.clamp((look.consistency + 100) / 200, 0, 1);
    const yieldH = 0.0002 + 0.002 * firm * firm, fluidity = 1.2 + 3.5 * runny, tension = 0.00012;
    // Volume follows the server's mass so growth shows: under half the pan at 1 kg, three quarters at 100 kg,
    // near the rim by a tonne (size is log mass: 0.17 at 1 kg, 0.46 at 100 kg, 0.63 at 1000 kg), never over it.
    const target = this.capacity * THREE.MathUtils.clamp(0.45 + 0.9 * (size - 0.12), 0.45, 0.95);
    // A pour lands well inside the pan: piling against the wall would climb it like a fence.
    let px = look.pourAt?.x ?? PAN_X, pz = look.pourAt?.y ?? PAN_Z;
    const off = Math.hypot(px - PAN_X, pz - PAN_Z), maxOff = PAN_R * 0.5;
    if (off > maxOff) { px = PAN_X + (px - PAN_X) * maxOff / off; pz = PAN_Z + (pz - PAN_Z) * maxOff / off; }
    if (!this.started) { this.started = true; this.fill(target); }
    const missing = target - this.volume();
    if (missing > 0) this.add(px, pz, Math.min(missing, (look.pouring ? 0.004 + missing * 1.2 : missing * 0.3) * dt), look.pouring ? 0.05 : 0.08);
    // Every pour piles up where it lands, like a real stream: volume is lifted from the whole pan to that spot.
    if (look.pouring) {
      const v = this.volume(), move = Math.min(v * 0.5, 0.006 * dt);
      if (v > 0) { const keep = 1 - move / v; for (let k = 0; k < this.h.length; k++) this.h[k]! *= keep; this.add(px, pz, move, 0.045); }
    }
    const steps = Math.min(6, Math.max(1, Math.ceil(dt / 0.006)));
    for (let s = 0; s < steps; s++) this.flow(dt / steps, fluidity, yieldH, tension);
    // Once borax firms it up, his kneading gathers a spread-out slime back together.
    if (firm > 0.45) this.gather(PAN_X, PAN_Z, Math.min(0.3, (firm - 0.45) * 0.8) * dt);
    this.now = t;
    // A stream hitting the slime sends rings out: a big one when it starts, small ones while it keeps falling.
    if (look.pouring && look.pourAt) {
      if (!this.wasPouring) { this.ripples.push({ x: px, z: pz, t0: t, amp: 0.011 }); this.nextRipple = t + 0.35; }
      else if (t > this.nextRipple) { this.ripples.push({ x: px, z: pz, t0: t, amp: 0.004 }); this.nextRipple = t + 0.3; }
    }
    this.wasPouring = look.pouring;
    while (this.ripples.length && t - this.ripples[0]!.t0 > 2.2) this.ripples.shift();
    if (this.ripples.length > 8) this.ripples.splice(0, this.ripples.length - 8);
    // Hands: a palm on the slime presses a dent; lifting off pulls a strand that thins and snaps.
    look.hands.forEach((p, i) => {
      const c = this.touch[i]; if (!c) return;
      const k = this.cell(p.x, p.z), inPan = k >= 0 && this.open[k] && this.h[k]! > 0.003;
      const surf = inPan ? this.surface(p.x, p.z) : -9, below = surf - p.y;
      const on = inPan && below > -0.012 && below < 0.09;
      c.w += ((on ? 1 : 0) - c.w) * Math.min(1, dt * (on ? 10 : 6));
      if (on) {
        c.x = p.x; c.z = p.z; c.y = surf; c.depth = THREE.MathUtils.clamp(0.012 + below * 0.45, 0.008, 0.032);
        c.strand = null;
        // Pressing also shoves a little slime out from under the palm, so the mass slowly changes shape.
        let taken = 0;
        for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
          const q = k + dj * this.nx + di; if (q < 0 || q >= this.h.length || !this.open[q] || di * di + dj * dj > 9) continue;
          const take = this.h[q]! * Math.min(0.08, (0.3 + look.knead) * dt * 0.8); this.h[q]! -= take; taken += take;
        }
        if (taken > 0) this.add(p.x, p.z + 0.03, taken * this.d * this.d, 0.07);
      } else if (c.w > 0.3 && !c.strand) {
        c.strand = { x: c.x, y: c.y - c.depth * 0.5, z: c.z, age: 0 };
      }
      if (c.strand) {
        c.strand.age += dt;
        const len = Math.hypot(p.x - c.strand.x, p.y - c.strand.y, p.z - c.strand.z), maxLen = 0.1 + 0.12 * firm;
        if (len > maxLen || c.strand.age > 1.1) c.strand = null;
      }
    });
    this.render(t, look, size, px, pz);
  }
  /** Surface height (floor + slime) at any point, bilinear between grid cells; cells outside the pan copy their neighbours. */
  private sample(x: number, z: number): number {
    const fx = THREE.MathUtils.clamp((x - X0) / this.d, 0, this.nx - 1.001), fz = THREE.MathUtils.clamp((z - Z0) / this.d, 0, this.nx - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * this.nx + i, L = this.level;
    return (L[k]! * (1 - u) + L[k + 1]! * u) * (1 - v) + (L[k + this.nx]! * (1 - u) + L[k + this.nx + 1]! * u) * v;
  }
  private render(t: number, look: SlimeLook, size: number, px: number, pz: number): void {
    const { nx, open, view, level, h: src } = this, lift = 1 - this.squash * 0.15;
    // A twice-blurred copy between wet cells only, so the surface shades smoothly and nothing bleeds onto the wall.
    for (let pass = 0; pass < 2; pass++) {
      const from = pass ? this.next : src, to = pass ? view : this.next;
      for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!open[k] || src[k]! < 0.0005) { to[k] = 0; continue; }
        let sum = from[k]! * 4, w = 4;
        for (const o of [i > 0 ? -1 : 0, i < nx - 1 ? 1 : 0, j > 0 ? -nx : 0, j < nx - 1 ? nx : 0]) if (o && open[k + o] && src[k + o]! >= 0.0005) { sum += from[k + o]!; w++; }
        to[k] = sum / w;
      }
    }
    // Surface level per cell. Outside the pan (and in dry cells) the level of the nearest wet neighbour carries on, so
    // sampling near the wall stays flat and the edge is decided by the exact pan floor at each vertex.
    for (let k = 0; k < level.length; k++) level[k] = open[k] && view[k]! > 0.0005 ? this.floor[k]! + view[k]! : -1;
    for (let pass = 0; pass < 3; pass++) for (let k = 0; k < level.length; k++) {
      if (level[k]! >= 0) continue;
      let best = -1;
      for (const o of [-1, 1, -nx, nx]) { const q = k + o; if (q >= 0 && q < level.length && level[q]! >= 0) best = Math.max(best, level[q]!); }
      if (best >= 0) level[k] = best;
    }
    for (let k = 0; k < level.length; k++) if (level[k]! < 0) level[k] = 0;
    this.base.setHSL(look.hue / 360, 0.8, 0.52 + look.fluff * 0.002);
    const foam = look.fluff / 100, spread = 0.12 + 0.3 * size;
    const stains: [number, THREE.Color, number][] = [[look.stains.ketcap, this.red, 0.7], [look.stains.yumurta, this.yolk, 2.9], [look.stains.sirke, this.vinegar, 4.4]];
    const { pos, col, depth } = this;
    for (let i = 0; i < this.rings; i++) for (let s = 0; s < this.segs; s++) {
      const a = (s / this.segs) * Math.PI * 2, r = this.radii[i]!, x = PAN_X + Math.cos(a) * r, z = PAN_Z + Math.sin(a) * r, v = i * this.segs + s;
      const fl = panFloor(r), hp = Math.max(0, this.sample(x, z) - fl), d = Math.hypot(x - PAN_X, (z - PAN_Z) * 1.2);
      const bump = foam * 0.025 * smooth(spread * 0.6, 0, d) * smooth(0.004, 0.02, hp);
      let shape = 0;
      if (hp > 0.002) {
        // Palm dents with a soft raised rim around them.
        for (const c of this.touch) if (c.w > 0.01) {
          const dd = Math.hypot(x - c.x, z - c.z);
          shape += c.w * (-c.depth * Math.exp(-(dd * dd) / (2 * 0.028 * 0.028)) + c.depth * 0.35 * Math.exp(-((dd - 0.06) ** 2) / (2 * 0.018 * 0.018)));
        }
        // Rings from a pour: a travelling wave that fades with time and distance.
        for (const rp of this.ripples) {
          const age = this.now - rp.t0, dd = Math.hypot(x - rp.x, z - rp.z), front = age * 0.28;
          if (dd > front + 0.05) continue;
          shape += rp.amp * Math.exp(-age * 1.8) * Math.cos((dd - front) * 70) * Math.exp(-((dd - front) ** 2) / 0.0012) * (dd < 0.02 && age < 0.25 ? -1.5 : 1);
        }
        // Soupy slime never sits still: slow waves roll across it.
        shape += THREE.MathUtils.clamp(-look.consistency / 100, 0, 1) * 0.0045 * Math.sin(x * 18 + this.now * 2.1) * Math.sin(z * 15 - this.now * 1.7) * smooth(0.002, 0.02, hp);
      }
      // Sunk 3 mm so the pan wall covers the exact contact line.
      pos[v * 3] = x; pos[v * 3 + 1] = this.tableTop + fl + Math.max(0, hp * lift + shape) + bump - 0.003; pos[v * 3 + 2] = z; depth[v] = hp;
      // One rich colour with a soft, slow marble; foam whitens the middle, stains sit in patches.
      const swirl = Math.sin(x * 6 + Math.sin(z * 5 + t * 0.12) * 1.6) * Math.cos(z * 7 - t * 0.08);
      this.tmp.setHSL(((look.hue + swirl * 6) % 360 + 360) % 360 / 360, 1, 0.36 + swirl * 0.02 + look.fluff * 0.004);
      // Foam lightens the colour and makes it pastel, but the slime stays its colour (it used to go cream).
      this.tmp.lerp(this.white, foam * 0.4 * smooth(spread * 0.55, 0, d));
      for (const [amount, c, seed] of stains) {
        if (amount <= 1) continue;
        const sx = PAN_X + Math.cos(seed) * spread * 0.45, sz = PAN_Z + Math.sin(seed) * spread * 0.3, rr = 0.03 + 0.07 * Math.min(1, amount / 60);
        this.tmp.lerp(c, smooth(rr, rr * 0.4, Math.hypot(x - sx, z - sz)) * 0.85);
      }
      col[v * 3] = this.tmp.r; col[v * 3 + 1] = this.tmp.g; col[v * 3 + 2] = this.tmp.b;
    }
    for (const a of ['position', 'color', 'depth'] as const) this.geo.attributes[a]!.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.renderStrand(look);
    this.renderStrings(look);
    this.topWorld.set(px, this.surface(px, pz), pz);
    // Beads pressed into the top surface, glitter riding on it.
    const beads = Math.min(14, Math.round(look.beads / 7));
    for (let i = 0; i < beads; i++) {
      const a = i * 2.39996 + 1.1, rr = spread * 0.7 * Math.sqrt((i + 0.5) / beads), x = PAN_X + Math.cos(a) * rr, z = PAN_Z + Math.sin(a) * rr * 0.7;
      this.m4.makeTranslation(x, this.surface(x, z), z); this.beads.setMatrixAt(i, this.m4);
      this.beads.setColorAt(i, this.mix.setHSL((i * 0.17) % 1, 0.85, 0.55));
    }
    this.beads.count = beads; this.beads.instanceMatrix.needsUpdate = true; if (this.beads.instanceColor) this.beads.instanceColor.needsUpdate = true;
    const visible = Math.round((this.glitterPos.length / 3) * Math.min(1, look.sparkle / 60));
    for (let i = 0; i < this.glitterPos.length / 3; i++) {
      const a = i * 2.39996 + t * 0.05, rr = Math.min(PAN_R - 0.05, spread * Math.sqrt((i + 0.5) / Math.max(1, visible))), x = PAN_X + Math.cos(a) * rr, z = PAN_Z + Math.sin(a) * rr * 0.7;
      const k = this.cell(x, z), on = i < visible && k >= 0 && this.h[k]! > 0.004;
      this.glitterPos[i * 3] = x; this.glitterPos[i * 3 + 1] = on ? this.surface(x, z) + 0.004 : -10; this.glitterPos[i * 3 + 2] = z;
    }
    (this.glitter.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.glitter.material as THREE.PointsMaterial).size = 0.009 + 0.004 * Math.sin(t * 6 + 1);
  }
  /** Strings from the slime to a lifting hand: thick at the slime, thin at the fingers, sagging, then gone. */
  private renderStrings(look: SlimeLook): void {
    this.touch.forEach((c, i) => {
      const m = this.strands[i]!, p = look.hands[i]; m.visible = !!(c.strand && p);
      if (!c.strand || !p) return;
      const a = new THREE.Vector3(c.strand.x, c.strand.y, c.strand.z), b = p.clone(), len = a.distanceTo(b);
      const mid = a.clone().lerp(b, 0.5); mid.y -= 0.02 + len * 0.15;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b), base = Math.max(0.002, 0.012 * (1 - len / 0.22));
      const geo = new THREE.TubeGeometry(curve, 14, 1, 6, false), pos = geo.attributes.position as THREE.BufferAttribute;
      // Taper: radius from `base` at the slime to a third of it at the hand, thinnest in the middle as it stretches.
      const pts = curve.getSpacedPoints(14);
      for (let v = 0; v < pos.count; v++) {
        const seg = Math.floor(v / 7), u = seg / 14, centre = pts[seg]!;
        const r = base * (1 - 0.65 * u) * (1 - 0.5 * Math.sin(Math.PI * u) * Math.min(1, len / 0.12));
        const off = new THREE.Vector3().fromBufferAttribute(pos, v).sub(centre).multiplyScalar(r);
        pos.setXYZ(v, centre.x + off.x, centre.y + off.y, centre.z + off.z);
      }
      geo.computeVertexNormals();
      const col = new Float32Array(pos.count * 3);
      for (let v = 0; v < col.length; v += 3) { col[v] = this.base.r; col[v + 1] = this.base.g; col[v + 2] = this.base.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      m.geometry.dispose(); m.geometry = geo;
    });
  }
  /** Stretch: a sagging strand between the hands. */
  private renderStrand(look: SlimeLook): void {
    const on = look.stretch > 0.05 && look.hands.length === 2;
    this.strand.visible = on;
    if (!on) return;
    const a = look.hands[0]!, b = look.hands[1]!, mid = a.clone().lerp(b, 0.5); mid.y -= 0.06 * look.stretch;
    this.strand.geometry.dispose();
    this.strand.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone()), 16, 0.014 * look.stretch + 0.004, 6, false);
    const c = new Float32Array(this.strand.geometry.attributes.position!.count * 3);
    for (let i = 0; i < c.length; i += 3) { c[i] = this.base.r; c[i + 1] = this.base.g; c[i + 2] = this.base.b; }
    this.strand.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
}

/** Slime that has escaped the table: a wobbling floor flood that rises with each milestone. */
export class Flood {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.PlaneGeometry;
  private readonly base: Float32Array;
  level = 0;
  constructor(material: THREE.Material) {
    this.geo = new THREE.PlaneGeometry(9, 6, 54, 36); this.geo.rotateX(-Math.PI / 2);
    this.base = (this.geo.attributes.position!.array as Float32Array).slice();
    this.mesh = new THREE.Mesh(this.geo, material); this.mesh.receiveShadow = true; this.mesh.visible = false;
  }
  update(t: number, level: number, color: THREE.Color): void {
    this.level += (level - this.level) * 0.05;
    this.mesh.visible = this.level > 0.01;
    if (!this.mesh.visible) return;
    const pos = this.geo.attributes.position!.array as Float32Array, colors = this.geo.attributes.color;
    for (let i = 0; i < pos.length; i += 3) {
      const x = this.base[i]!, z = this.base[i + 2]!;
      // Lumpy, slowly heaving surface so the key light picks out wet highlights.
      pos[i + 1] = this.level + Math.sin(x * 2.1 + t * 0.9) * 0.05 + Math.cos(z * 2.7 + t * 0.7) * 0.04 + Math.sin((x + z) * 6.3 + t * 1.3) * 0.018;
    }
    this.geo.attributes.position!.needsUpdate = true; this.geo.computeVertexNormals();
    if (!colors) { const c = new Float32Array(pos.length); this.geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    const col = this.geo.attributes.color!.array as Float32Array;
    for (let i = 0; i < col.length; i += 3) { col[i] = color.r; col[i + 1] = color.g; col[i + 2] = color.b; }
    this.geo.attributes.color!.needsUpdate = true;
  }
}
