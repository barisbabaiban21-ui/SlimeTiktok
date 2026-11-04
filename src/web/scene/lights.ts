import * as THREE from 'three';
/** One lighting rig for the stage and the character preview, so tuning carries over. */
export function addLights(s: THREE.Scene, full: boolean, shadows: boolean): void {
  s.add(new THREE.HemisphereLight(full ? '#f3f1ee' : '#ffffff', full ? '#4a4642' : '#b3a69b', full ? 0.4 : 1.35));
  // Key from the front right: barely warm, so skin and slime keep their own colours.
  const key = new THREE.DirectionalLight(full ? '#fff4ea' : '#fff0dc', full ? 2.0 : 2.1); key.position.set(1.6, 3.6, 2.6); key.castShadow = shadows;
  key.shadow.mapSize.set(shadows ? 4096 : 1024, shadows ? 4096 : 1024); key.shadow.radius = 3; key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 3; key.shadow.camera.bottom = -1; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  s.add(key);
  if (!full) {
    // Without an environment map the face needs a soft frontal fill, like the ring light.
    const fill = new THREE.DirectionalLight('#fff6ee', 1.5); fill.position.set(0, 2.2, 4); s.add(fill);
    return;
  }
  // Streamers' ring light: soft frontal fill that shows up as a glint in eyes and slime.
  const ring = new THREE.PointLight('#fff4e8', 1.6, 8, 1.6); ring.position.set(0, 1.9, 2.2); s.add(ring);
  // Two soft rims from behind cut his outline out of the blurred workshop.
  const rim = new THREE.DirectionalLight('#ffe9d6', 1.5); rim.position.set(-2.2, 2.8, -2.4); s.add(rim);
  const rim2 = new THREE.DirectionalLight('#eef2ff', 1.0); rim2.position.set(2.2, 2.4, -2.2); s.add(rim2);
}
