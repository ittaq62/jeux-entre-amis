// Le traitement de l'image, en qualité haute : la scène, puis son arme en main par-dessus, un léger halo autour de ce
// qui brille (le soleil, les lampes, les flammes), un étalonnage (contraste, couleurs, un voile chaud ou froid selon la
// carte), un vignetage doux et un grain très fin. L'image est lissée par un multi-échantillonnage.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** L'arme en main, dessinée dans la même image, par-dessus la scène (la profondeur effacée) */
class ViewmodelPass extends Pass {
  constructor(
    private vmScene: THREE.Scene,
    private vmCam: THREE.Camera,
  ) {
    super();
    this.needsSwap = false;
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    renderer.clearDepth();
    renderer.render(this.vmScene, this.vmCam);
    renderer.autoClear = auto;
  }
}

const GRADE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tint: { value: new THREE.Color(1, 1, 1) },
    contrast: { value: 1.08 },
    saturation: { value: 1.0 },
    vignette: { value: 0.22 },
    grain: { value: 0.025 },
    time: { value: 0 },
    hurt: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 tint;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    uniform float grain;
    uniform float time;
    uniform float hurt;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * tint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation - hurt * 0.6);
      // Le contraste autour d'un gris moyen (en lumière linéaire)
      col = max(vec3(0.0), (col - 0.18) * contrast + 0.18);
      vec2 q = vUv - 0.5;
      float v = 1.0 - dot(q, q) * vignette * 2.2;
      col *= mix(1.0, v, 1.0);
      col = mix(col, col * vec3(1.25, 0.55, 0.5), hurt * smoothstep(0.15, 0.7, length(q)));
      col += (rand(vUv * 731.0) - 0.5) * grain * (0.3 + l);
      gl_FragColor = vec4(col, c.a);
    }
  `,
};

export class Post {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private ao: GTAOPass;
  private t = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    vmScene: THREE.Scene,
    vmCam: THREE.Camera,
    look: { tint: string; saturation: number; contrast: number; bloom: number },
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    // L'ombre dans les recoins : au pied des murs, sous les avant-toits, entre les caisses
    const ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.blendIntensity = 0.8;
    ao.updateGtaoMaterial({ radius: 0.85, distanceExponent: 1.6, thickness: 1.4, scale: 1.1, samples: 12 });
    this.composer.addPass(ao);
    this.ao = ao;
    this.composer.addPass(new ViewmodelPass(vmScene, vmCam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), look.bloom, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE);
    (this.grade.uniforms.tint!.value as THREE.Color).set(look.tint);
    this.grade.uniforms.saturation!.value = look.saturation;
    this.grade.uniforms.contrast!.value = look.contrast;
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set((w * pixelRatio) / 2, (h * pixelRatio) / 2);
  }

  /** La douleur : l'image se vide de ses couleurs et rougit sur les bords */
  setHurt(k: number) {
    this.grade.uniforms.hurt!.value = k;
  }

  render(dt: number) {
    this.t += dt;
    this.grade.uniforms.time!.value = this.t % 100;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.dispose();
    this.ao.dispose();
    this.grade.material.dispose();
  }
}
