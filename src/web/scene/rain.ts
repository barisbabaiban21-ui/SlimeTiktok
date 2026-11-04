import * as THREE from 'three';

/** Confetti and glitter falling over the whole frame: colourful little flakes that flutter and spin as they drop. */
export class Rain {
  readonly mesh: THREE.InstancedMesh;
  private readonly n: number;
  private readonly p: Float32Array; private readonly v: Float32Array; private readonly spin: Float32Array;
  private on = 0; private readonly m = new THREE.Matrix4(); private readonly q = new THREE.Quaternion(); private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3(); private readonly pos = new THREE.Vector3();
  constructor(low: boolean) {
    this.n = low ? 120 : 320;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.028, 0.018), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide, emissive: '#222' }), this.n);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.p = new Float32Array(this.n * 3); this.v = new Float32Array(this.n); this.spin = new Float32Array(this.n);
    const c = new THREE.Color(), palette = ['#ff5fa2', '#40c4ff', '#ffd84a', '#7cf05a', '#b65cff', '#ffffff', '#ff8a1f'];
    for (let i = 0; i < this.n; i++) { this.reset(i, true); this.mesh.setColorAt(i, c.set(palette[i % palette.length]!)); }
  }
  private reset(i: number, anywhere: boolean): void {
    this.p[i * 3] = (Math.random() - 0.5) * 1.8; this.p[i * 3 + 1] = anywhere ? 1 + Math.random() * 2.4 : 3.3 + Math.random() * 0.6; this.p[i * 3 + 2] = -0.6 + Math.random() * 1.6;
    this.v[i] = 0.35 + Math.random() * 0.35; this.spin[i] = Math.random() * 10;
  }
  update(dt: number, t: number, active: boolean): void {
    this.on += ((active ? 1 : 0) - this.on) * Math.min(1, dt * 2);
    this.mesh.visible = this.on > 0.02 || active;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      this.p[k + 1]! -= this.v[i]! * dt;
      if (this.p[k + 1]! < 0.9) { if (active) this.reset(i, false); else this.p[k + 1] = -5; }
      const sp = this.spin[i]! + t * 4;
      this.pos.set(this.p[k]! + Math.sin(sp * 0.7) * 0.03, this.p[k + 1]!, this.p[k + 2]!);
      this.q.setFromEuler(this.e.set(sp, sp * 0.6, sp * 0.3));
      this.s.setScalar(this.on);
      this.mesh.setMatrixAt(i, this.m.compose(this.pos, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
