import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';

/** The workshop photo (Poly Haven, CC0): lights the scene, shows in the slime and stands behind him, blurred. */
export const WORKSHOP_HDR = '/assets/env/carpentry_shop_02_2k.hdr';
export function loadWorkshop(renderer: THREE.WebGLRenderer, done: (env: THREE.Texture, photo: THREE.Texture) => void): void {
  new HDRLoader().setDataType(THREE.HalfFloatType).load(WORKSHOP_HDR, photo => {
    photo.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(photo).texture; pmrem.dispose();
    done(env, photo);
  }, undefined, () => { /* keep the RoomEnvironment fallback */ });
}

/** Film look for the full-quality stage: depth of field on his face, a soft glow on the bulb and highlights, vignette. */
export class Post {
  readonly composer: EffectComposer;
  private readonly bokeh: BokehPass;
  private readonly bloom: UnrealBloomPass;
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bokeh = new BokehPass(scene, camera, { focus: 3.4, aperture: 0.009, maxblur: 0.009 });
    this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.18, 0.4, 3.0);
    this.composer.addPass(this.bloom);
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms['offset']!.value = 1.05; vignette.uniforms['darkness']!.value = 1.15;
    this.composer.addPass(vignette);
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number, ratio: number): void { this.composer.setPixelRatio(ratio); this.composer.setSize(w, h); }
  /** Keep his face sharp as the camera pulls back. */
  focus(distance: number): void { (this.bokeh.uniforms as Record<string, THREE.IUniform>)['focus']!.value = distance; }
  render(): void { this.composer.render(); }
}
