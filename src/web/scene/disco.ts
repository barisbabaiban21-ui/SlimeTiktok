import * as THREE from 'three';

/**
 * A mirror ball that drops in from above for dance breaks, spinning, with coloured lights sweeping the room.
 * Built from primitives: a dark core covered with small mirror tiles (instanced), hanging on a chain.
 */
export class Disco {
  readonly group = new THREE.Group();
  private readonly ball = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  private down = 0;
  /** Up out of frame, and where it hangs in the shot (above the cap, right of his head, inside the safe band). */
  private static readonly UP = 3.4; private static readonly HANG = 2.42;
  constructor(private readonly low: boolean) {
    const r = 0.13;
    const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.97, 24, 16), new THREE.MeshStandardMaterial({ color: '#202024', roughness: 0.6 }));
    // Tiles on latitude rings, each facing outwards.
    const rings = 14, mats: THREE.Matrix4[] = [];
    for (let i = 1; i < rings; i++) {
      const phi = (i / rings) * Math.PI, ringR = Math.sin(phi) * r, count = Math.max(6, Math.round(2 * Math.PI * ringR / 0.022));
      for (let j = 0; j < count; j++) {
        const th = (j / count) * Math.PI * 2 + (i % 2) * 0.1;
        const n = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), n, new THREE.Vector3(0, 1, 0)); m.setPosition(n.multiplyScalar(r));
        mats.push(m);
      }
    }
    const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.019, 0.019), new THREE.MeshStandardMaterial({ color: '#e8ecf2', metalness: 1, roughness: 0.08, envMapIntensity: 2.2, side: THREE.DoubleSide }), mats.length);
    mats.forEach((m, i) => tiles.setMatrixAt(i, m));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.03, 12), new THREE.MeshStandardMaterial({ color: '#b8a27a', metalness: 0.9, roughness: 0.3 }));
    cap.position.y = r + 0.012;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.6, 6), new THREE.MeshStandardMaterial({ color: '#8a8a90', metalness: 0.8, roughness: 0.4 }));
    chain.position.y = r + 0.8;
    this.ball.add(core, tiles, cap, chain);
    this.group.add(this.ball);
    this.group.position.set(0.38, Disco.UP, -0.5);
    this.group.visible = false;
    if (!low) for (const c of ['#ff4fb0', '#3fd2ff', '#ffe14a']) this.lights.push(new THREE.PointLight(c, 0, 4, 1.6));
  }
  /** Lights live in the scene (not on the ball), sweeping around him. */
  attach(scene: THREE.Scene): void { scene.add(this.group); for (const l of this.lights) scene.add(l); }
  update(dt: number, t: number, on: boolean): void {
    this.down += ((on ? 1 : 0) - this.down) * Math.min(1, dt * (on ? 1.4 : 1.8));
    this.group.visible = this.down > 0.01;
    // Eases down with a little swing, spins all the time it is out.
    const e = this.down * this.down * (3 - 2 * this.down);
    this.group.position.y = Disco.UP + (Disco.HANG - Disco.UP) * e;
    this.group.rotation.z = Math.sin(t * 1.3) * 0.04 * e;
    this.ball.rotation.y = t * 0.9;
    this.lights.forEach((l, i) => {
      const a = t * (0.7 + i * 0.23) + i * 2.1;
      l.position.set(Math.cos(a) * 0.9, 1.5 + Math.sin(a * 1.3) * 0.3, -0.2 + Math.sin(a) * 0.6);
      l.intensity = 2.2 * e;
    });
  }
}
