import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Props from Poly Haven (CC0), meshopt + WebP 512 px: they sit behind him, out of focus. */
const PROPS = ['bleach_bottle', 'multi_cleaner_bottle', 'spray_paint_bottles', 'jug_01', 'can_rusted', 'plastic_bottle_gallon', 'adjustable_wrench'] as const;
type Prop = typeof PROPS[number];
const SHELF_SCALE = 1.1;
/** Top faces of Shelf_01's boards, in its own metres; only the ones above the table show. */
const BOARDS = [0.92, 1.2, 1.48, 1.76, 2.06];
const JAR_COLORS = ['#ffcf2e', '#ff5fa2', '#40c4ff', '#7cf05a', '#b65cff', '#ff7a1f', '#25e0c8', '#ff3b3b', '#f2f2f2', '#ffe76b'];

function rand(seed: number): () => number { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

/**
 * Two old wooden shelves behind him, full of slime jars, cleaners, paint and cans: a workshop, not a living room.
 * Loads in the background; `ready` fires once everything is placed (the low-quality stage re-bakes then).
 */
export function buildWorkshop(group: THREE.Group, ready: () => void): void {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const load = (id: string) => loader.loadAsync(`/assets/props/${id}.glb`).then(g => g.scene);
  Promise.all([load('Shelf_01'), ...PROPS.map(load)]).then(([shelf, ...models]) => {
    const props = new Map<Prop, THREE.Object3D>(PROPS.map((id, i) => [id, models[i]!]));
    for (const m of [shelf!, ...models]) m.traverse(o => {
      const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
      mesh.castShadow = false; mesh.receiveShadow = true;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap]) if (t) t.anisotropy = 8;
      mat.envMapIntensity = 0.55;
    });
    // The pale shelf paint stole the light from his face: an old, warm, darker wood instead.
    shelf!.traverse(o => { const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mat?.color) mat.color.set('#7a5a3e'); });
    const rnd = rand(7);
    const jarSlots: THREE.Matrix4[] = [], jarColors: THREE.Color[] = [];
    for (const side of [-1, 1]) {
      const unit = new THREE.Group(); unit.position.set(side * 0.6, 0, -1.72); unit.scale.setScalar(SHELF_SCALE);
      unit.add(shelf!.clone()); group.add(unit);
      for (const board of BOARDS) {
        // Fill each board from the inner edge out, mostly jars with the odd bottle or can.
        let x = -0.46;
        while (x < 0.44) {
          const r = rnd(), z = 0.12 + rnd() * 0.04;
          if (r < 0.62) {
            const w = 0.09 + rnd() * 0.05, h = 0.1 + rnd() * 0.08;
            if (x + w > 0.47) break;
            const m = new THREE.Matrix4().compose(new THREE.Vector3(x + w / 2, board + 0.003, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w));
            unit.updateMatrix(); jarSlots.push(m.premultiply(unit.matrix));
            jarColors.push(new THREE.Color(JAR_COLORS[Math.floor(rnd() * JAR_COLORS.length)]!).multiplyScalar(0.7));
            x += w + 0.015;
          } else {
            const id = PROPS[Math.floor(rnd() * PROPS.length)]!, p = props.get(id)!.clone();
            const box = new THREE.Box3().setFromObject(p), size = box.getSize(new THREE.Vector3());
            // Keep props shorter than the gap between boards.
            const fit = Math.min(1, 0.24 / size.y, 0.2 / size.x);
            p.scale.setScalar(fit);
            if (id === 'adjustable_wrench') { p.rotation.z = Math.PI / 2; p.position.set(x + 0.1, board + 0.017, z); x += 0.24; }
            else { p.rotation.y = (rnd() - 0.5) * 1.2; p.position.set(x + size.x * fit / 2, board - box.min.y * fit, z); x += size.x * fit + 0.02; }
            unit.add(p);
          }
        }
      }
    }
    addJars(group, jarSlots, jarColors);
    ready();
  }).catch(e => { console.error('workshop', e); /* the blurred photo alone still reads as a workshop */ });
}

/** Glass jars of coloured slime, unit size (1 wide, 1 tall), drawn instanced: glass, slime fill and a metal lid. */
function addJars(group: THREE.Group, slots: THREE.Matrix4[], colors: THREE.Color[]): void {
  const n = slots.length;
  const fill = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.44, 0.44, 0.78, 20).translate(0, 0.4, 0),
    new THREE.MeshPhysicalMaterial({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.8 }), n);
  const glass = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.92, 24, 1, true).translate(0, 0.46, 0),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 2.5, side: THREE.DoubleSide, depthWrite: false }), n);
  const lid = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 20).translate(0, 0.97, 0),
    new THREE.MeshStandardMaterial({ color: '#b8a27a', roughness: 0.35, metalness: 0.85 }), n);
  slots.forEach((m, i) => { fill.setMatrixAt(i, m); glass.setMatrixAt(i, m); lid.setMatrixAt(i, m); fill.setColorAt(i, colors[i]!); });
  glass.renderOrder = 2;
  group.add(fill, glass, lid);
}
