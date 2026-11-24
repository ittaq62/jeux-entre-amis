// La scène 3D du bowling : le rendu (le halo des lumières, l'étalonnage de l'image, le reflet dans le vernis), la salle et
// ses pistes, les dix quilles, la boule, les personnages ; la caméra, que le jeu pilote. La qualité s'allège d'elle-même
// sur un appareil qui peine (les effets d'abord, puis le reflet, les pixels, les ombres).

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RACK, type PinSpot } from "../../../shared/games/bowling/lane.ts";
import { PIN_COM } from "../../../shared/games/bowling/physics.ts";
import type { SalleId } from "../../../shared/games/bowling/salles.ts";
import { AutoQuality } from "../../lib/autoQuality.ts";
import { warmThree } from "../../lib/prepare.ts";
import { releaseRenderer } from "../../lib/releaseGl.ts";
import { buildLane, LANE_PITCH, type LaneMeshes } from "./laneMesh.ts";
import { pinMesh, pinMaterial } from "./pins.ts";
import { mergeStatic, type BenchSpot, type Salle } from "./salles/common.ts";
import { salleOf } from "./salles/index.ts";

export const TOUCH = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);

/** Ce qu'il faut pour poser un corps de la physique : sa position et son orientation */
export interface BodyPose {
  px: number;
  py: number;
  pz: number;
  qw: number;
  qx: number;
  qy: number;
  qz: number;
  gone?: boolean;
}

export class LaneScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.03, 260);
  /** Les quilles, par numéro (1 à 10) */
  readonly pins = new Map<number, THREE.Mesh>();
  private pinSkin = "classiques";
  private salle: Salle | null = null;
  private salleId: SalleId | null = null;
  private salleRoot = new THREE.Group();
  private lanes: LaneMeshes[] = [];
  private hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
  private host: HTMLElement;
  private baseRatio = Math.min(window.devicePixelRatio || 1, 2);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private effects = true;
  private reflections = true;
  private quality = new AutoQuality({ levers: ["effets", "reflets", "pixels", "pixels", "ombres"], apply: (on) => this.applyQuality(on) });
  private ro: ResizeObserver;
  private clock = 0;
  private envMap: THREE.Texture | null = null;
  /** Ce que la fusion des pistes voisines a créé (à libérer avec la salle) */
  private mergedBin: { dispose: () => void }[] = [];

  /** `fixed` : la qualité ne s'allège jamais (une image à photographier) */
  constructor(
    host: HTMLElement,
    private fixed = false,
  ) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: !TOUCH || this.baseRatio < 2, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.baseRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "bw-canvas";
    this.renderer.info.autoReset = false;
    host.appendChild(this.renderer.domElement);
    this.camera.layers.enable(1);
    this.scene.add(this.hemi, this.salleRoot);
    for (const p of RACK) {
      const m = pinMesh(this.pinSkin);
      m.name = `quille-${p.n}`;
      this.pins.set(p.n, m);
      this.scene.add(m);
    }
    this.placeRack(RACK);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  get fps() {
    return this.quality.fps;
  }

  private applyQuality(on: readonly boolean[]) {
    this.effects = !on[0];
    this.reflections = !on[1];
    this.renderer.setPixelRatio(this.baseRatio * (on[3] ? 0.66 : on[2] ? 0.82 : 1));
    this.renderer.shadowMap.enabled = !on[4];
    this.resize();
  }

  private makeComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: TOUCH ? 0 : 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const s = this.salle;
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x / 2, size.y / 2),
      s?.bloom[0] ?? 0.5,
      s?.bloom[1] ?? 0.5,
      s?.bloom[2] ?? 0.9,
    );
    composer.addPass(bloom);
    this.bloom = bloom;
    composer.addPass(new OutputPass());
    const grade = new ShaderPass(GRADE);
    composer.addPass(grade);
    this.grade = grade;
    this.applyGrade();
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    this.composer = composer;
  }

  private applyGrade() {
    const s = this.salle;
    if (!s) return;
    if (this.bloom) {
      [this.bloom.strength, this.bloom.radius, this.bloom.threshold] = s.bloom;
    }
    if (this.grade) {
      this.grade.uniforms.uWarm!.value = s.grade.warm;
      this.grade.uniforms.uSat!.value = s.grade.sat;
      this.grade.uniforms.uVignette!.value = s.grade.vignette;
    }
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** La salle (et ses pistes) */
  setSalle(id: SalleId) {
    if (this.salleId === id) return;
    this.salleId = id;
    for (const l of this.lanes) {
      this.salleRoot.remove(l.group);
      l.dispose();
    }
    this.lanes = [];
    for (const d of this.mergedBin) d.dispose();
    this.mergedBin = [];
    this.salle?.dispose();
    this.salleRoot.clear();
    const s = salleOf(id);
    this.salle = s;
    const main = buildLane(s.style, 0, true, TOUCH ? 384 : 640);
    this.lanes.push(main);
    this.salleRoot.add(main.group);
    // Les pistes voisines : fondues en quelques formes (elles ne bougent pas)
    const others = new THREE.Group();
    for (let i = 1; i <= s.neighbors; i++) {
      for (const side of [-1, 1]) {
        const l = buildLane(s.style, side * i * LANE_PITCH, false);
        this.lanes.push(l);
        others.add(l.group);
        s.neighborPins?.(l.group, side * i * LANE_PITCH);
      }
    }
    mergeStatic(others, (x) => (this.mergedBin.push(x), x));
    this.salleRoot.add(others);
    this.salleRoot.add(s.root);
    this.scene.background = s.background;
    this.scene.fog = s.fog;
    this.hemi.color.set(s.hemi[0]);
    this.hemi.groundColor.set(s.hemi[1]);
    this.hemi.intensity = s.hemi[2];
    this.scene.environmentIntensity = s.env;
    this.renderer.toneMappingExposure = s.exposure;
    this.applyGrade();
    // Les reflets sur le vernis des boules et des quilles : la salle elle-même, vue depuis l'élan
    const pins = [...this.pins.values()];
    for (const m of pins) m.visible = false;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap?.dispose();
    this.envMap = pmrem.fromScene(this.scene, 0.02, 0.1, 80, { position: new THREE.Vector3(0, 1.3, 1.5) }).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.placeRack(RACK);
    // Le reflet dans le vernis ne montre que ce qui compte (les quilles, la boule, les personnages, les lampes) :
    // le reste du décor passe sur une autre couche, que la caméra voit et que le miroir ignore
    for (const child of this.salleRoot.children) {
      if (child === main.group) continue;
      child.traverse((o) => {
        if (!o.userData.reflect) o.layers.set(1);
      });
    }
  }

  /** Où s'assoient ceux qui attendent leur tour */
  benchSpots(): readonly BenchSpot[] {
    return this.salle?.bench ?? [];
  }

  get lane(): LaneMeshes | null {
    return this.lanes[0] ?? null;
  }

  /** Les quilles du lanceur (leur habit) */
  setPinSkin(skin: string) {
    if (skin === this.pinSkin) return;
    this.pinSkin = skin;
    const mat = pinMaterial(skin);
    for (const m of this.pins.values()) m.material = mat;
  }

  /** Les quilles debout, à leur place ; les autres sont cachées */
  placeRack(rack: readonly PinSpot[]) {
    for (const [n, m] of this.pins) {
      const p = rack.find((q) => q.n === n);
      m.visible = Boolean(p);
      if (p) {
        m.position.set(p.x, PIN_COM, p.z);
        m.quaternion.identity();
      }
    }
  }

  /** Une quille posée comme la physique la voit */
  placePin(n: number, b: BodyPose) {
    const m = this.pins.get(n);
    if (!m) return;
    m.visible = !b.gone;
    m.position.set(b.px, b.py, b.pz);
    m.quaternion.set(b.qx, b.qy, b.qz, b.qw);
  }

  /**
   * Tout préparer derrière l'écran de chargement (les textures, les shaders, quelques images avec les effets) : la salle
   * ne saute plus à son apparition. Voir lib/prepare.ts.
   */
  prepare(onProgress?: (share: number) => void) {
    return warmThree(this.renderer, this.scene, this.camera, { onProgress, render: () => this.render(0) });
  }

  render(dt: number) {
    this.renderer.info.reset();
    this.clock += dt;
    if (!this.fixed) this.quality.tick(performance.now());
    this.salle?.update?.(this.clock, this.camera);
    const refl = this.lanes[0]?.reflector;
    if (refl) {
      refl.visible = this.reflections;
      (refl as unknown as { getReflectionCamera?: (c: THREE.Camera) => THREE.Camera }).getReflectionCamera?.(this.camera).layers.set(0);
    }
    if (this.effects) {
      if (!this.composer) this.makeComposer();
      this.composer!.render(dt);
    } else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ro.disconnect();
    for (const l of this.lanes) l.dispose();
    this.salle?.dispose();
    this.composer?.dispose();
    this.envMap?.dispose();
    // La toile retirée, son contexte est rendu tout de suite (sans attendre le ramasse-miettes)
    this.renderer.domElement.remove();
    releaseRenderer(this.renderer);
  }
}

/** L'étalonnage : un peu plus chaud, un peu plus franc, les bords assombris */
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uWarm: { value: 0.04 }, uSat: { value: 1.08 }, uVignette: { value: 0.3 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uWarm;
    uniform float uSat;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(grey), c, uSat);
      c += vec3(uWarm, uWarm * 0.35, -uWarm * 0.6) * (1.0 - grey);
      c = (c - 0.5) * 1.04 + 0.5;
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.32, 0.85, length(d * vec2(1.15, 1.0)));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
