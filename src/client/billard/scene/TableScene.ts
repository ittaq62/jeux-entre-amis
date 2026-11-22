// La scène 3D du billard : le rendu (le halo des lampes, l'étalonnage de l'image, les reflets de la salle dans le vernis
// des billes et du bois), la salle et sa table, les billes, la queue, les aides de visée ; la caméra, que le jeu pilote.
// La qualité s'allège d'elle-même sur un appareil qui peine (les effets d'abord, puis les pixels, puis les ombres).

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CLOTH_COLORS } from "../../../shared/games/billard/looks.ts";
import type { SalleId } from "../../../shared/games/billard/salles.ts";
import type { Table } from "../../../shared/games/billard/table.ts";
import { AutoQuality } from "../../lib/autoQuality.ts";
import { warmThree } from "../../lib/prepare.ts";
import { BallSet } from "./balls.ts";
import { CueStick } from "./cue.ts";
import { mergeStatic, type Salle } from "./salles/common.ts";
import { salleOf } from "./salles/index.ts";
import { buildTable, type TableMeshes } from "./tableMesh.ts";

export const TOUCH = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);

export class TableScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 1, 0.02, 200);
  balls: BallSet | null = null;
  readonly cue: CueStick;
  /** Ce qui sert à viser (lignes, bille fantôme), posé par le jeu */
  readonly overlay = new THREE.Group();
  table: TableMeshes | null = null;
  salle: Salle | null = null;
  private salleId: SalleId | null = null;
  private dressKey = "";
  private salleRoot = new THREE.Group();
  private hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
  private host: HTMLElement;
  private baseRatio = Math.min(window.devicePixelRatio || 1, 2);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private effects = true;
  private quality = new AutoQuality({ levers: ["effets", "pixels", "pixels", "ombres"], apply: (on) => this.applyQuality(on) });
  private ro: ResizeObserver;
  private clock = 0;
  private envMap: THREE.Texture | null = null;
  private ballEnv: THREE.Texture | null = null;
  private salleBin: { dispose: () => void }[] = [];
  private tableDef: Table | null = null;
  private ballIds: number[] = [];
  private ballSet = "classiques";

  /** `fixed` : la qualité ne s'allège jamais (une image à photographier) */
  constructor(
    host: HTMLElement,
    private fixed = false,
  ) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !TOUCH || this.baseRatio < 2,
      powerPreference: "high-performance",
      preserveDrawingBuffer: fixed,
    });
    this.renderer.setPixelRatio(this.baseRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "bl-canvas";
    this.renderer.info.autoReset = false;
    host.appendChild(this.renderer.domElement);
    this.cue = new CueStick(TOUCH);
    this.cue.visible = false;
    this.scene.add(this.hemi, this.salleRoot, this.cue.group, this.overlay);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  get fps() {
    return this.quality.fps;
  }

  get info() {
    return this.renderer.info;
  }

  private applyQuality(on: readonly boolean[]) {
    this.effects = !on[0];
    this.renderer.setPixelRatio(this.baseRatio * (on[2] ? 0.66 : on[1] ? 0.82 : 1));
    this.renderer.shadowMap.enabled = !on[3];
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
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
    if (this.bloom) [this.bloom.strength, this.bloom.radius, this.bloom.threshold] = s.bloom;
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
    // Une image en hauteur (téléphone debout) : on élargit le champ pour garder la table entière
    this.camera.fov = w < h ? 62 : 46;
    this.camera.updateProjectionMatrix();
  }

  /**
   * La salle, sa table (au tapis de l'hôte) et les billes de la partie. Rien ne change si tout est déjà en place.
   */
  setup(id: SalleId, table: Table, dress: { cloth: string; set: string }, ballIds: number[]) {
    const key = `${id}|${table.kind}|${table.pockets[0]?.mouth ?? 0}|${dress.cloth}|${dress.set}|${ballIds.join(",")}`;
    if (key === this.dressKey) return;
    this.dressKey = key;
    // La salle elle-même ne change qu'avec son nom
    if (this.salleId !== id) {
      this.salleId = id;
      for (const d of this.salleBin) d.dispose();
      this.salleBin = [];
      this.salle?.dispose();
      this.salleRoot.clear();
      const s = salleOf(id, TOUCH);
      this.salle = s;
      this.lampMeshes = null;
      mergeStatic(s.root, (x) => (this.salleBin.push(x), x));
      this.salleRoot.add(s.root);
      this.scene.background = s.background;
      this.scene.fog = s.fog;
      this.hemi.color.set(s.hemi[0]);
      this.hemi.groundColor.set(s.hemi[1]);
      this.hemi.intensity = s.hemi[2];
      this.scene.environmentIntensity = s.env;
      this.renderer.toneMappingExposure = s.exposure;
      this.applyGrade();
    }
    const s = this.salle!;
    // La table
    if (this.table) {
      this.scene.remove(this.table.group);
      this.table.dispose();
    }
    this.tableDef = table;
    this.table = buildTable(table, { ...s.table, cloth: CLOTH_COLORS[dress.cloth] ?? CLOTH_COLORS.vert! }, TOUCH);
    this.scene.add(this.table.group);
    // Les billes
    if (this.balls) {
      this.scene.remove(this.balls.group);
      this.balls.dispose();
    }
    this.ballIds = ballIds;
    this.ballSet = dress.set;
    this.balls = new BallSet(table.kind, table.R, ballIds, dress.set, TOUCH);
    this.scene.add(this.balls.group);
    this.makeEnv();
  }

  /** Les reflets dans le vernis : la salle elle-même, vue d'au-dessus de la table (sans les billes) */
  /**
   * Deux reflets : la salle vue du milieu de la pièce sans la table (pour le bois, les pieds, le décor : leur moitié basse
   * voit le sol, pas un grand tapis vert), et la table vue d'au-dessus du tapis (pour les billes et la queue, qui
   * reflètent le feutre sous elles et la lampe au-dessus).
   */
  private makeEnv() {
    const hidden: THREE.Object3D[] = [];
    const hide = (o: THREE.Object3D | null | undefined) => {
      if (o && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    };
    for (const o of [this.balls?.group, this.cue.group, this.overlay]) hide(o);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap?.dispose();
    this.ballEnv?.dispose();
    this.ballEnv = pmrem.fromScene(this.scene, 0.015, 0.05, 60, { position: new THREE.Vector3(0, 0.35, 0) }).texture;
    const table = this.table?.group;
    const tableWas = table?.visible ?? false;
    if (table) table.visible = false;
    this.envMap = pmrem.fromScene(this.scene, 0.02, 0.05, 60, { position: new THREE.Vector3(0, 0.55, 0) }).texture;
    if (table) table.visible = tableWas;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.balls?.setEnv(this.ballEnv);
    this.cue.setEnv(this.ballEnv);
    for (const o of hidden) o.visible = true;
  }

  /** Le style de la table et du jeu de billes en cours */
  get dress() {
    return { set: this.ballSet, ids: this.ballIds, table: this.tableDef };
  }

  /**
   * Tout préparer derrière l'écran de chargement (les textures, les shaders, quelques images avec les effets) : la salle
   * ne saute plus à son apparition. Voir lib/prepare.ts.
   */
  prepare(onProgress?: (share: number) => void) {
    const cueWas = this.cue.visible;
    this.cue.visible = true;
    return warmThree(this.renderer, this.scene, this.camera, { onProgress, render: () => this.render(0) }).finally(() => {
      this.cue.visible = cueWas;
    });
  }

  /** Les abat-jour de la lampe (on les efface quand la caméra passe au-dessus : vue de dessus) */
  private lampMeshes: THREE.Object3D[] | null = null;

  private lampVisibility() {
    if (!this.salle) return;
    if (!this.lampMeshes) {
      this.lampMeshes = [];
      this.salle.root.traverse((o) => {
        if (o.name === "lampe") o.traverse((c) => (c as THREE.Mesh).isMesh && this.lampMeshes!.push(c));
      });
    }
    const above = this.camera.position.y > 0.82;
    for (const m of this.lampMeshes) m.visible = !above;
  }

  render(dt: number) {
    this.renderer.info.reset();
    this.clock += dt;
    if (!this.fixed) this.quality.tick(performance.now());
    this.lampVisibility();
    this.salle?.update?.(this.clock, this.camera);
    if (this.effects) {
      if (!this.composer) this.makeComposer();
      this.composer!.render(dt);
    } else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ro.disconnect();
    this.table?.dispose();
    this.balls?.dispose();
    this.cue.dispose();
    this.salle?.dispose();
    for (const d of this.salleBin) d.dispose();
    this.composer?.dispose();
    this.envMap?.dispose();
    this.ballEnv?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
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
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c *= vec3(1.0 + uWarm, 1.0, 1.0 - uWarm);
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.25, 0.8, dot(d, d) * 2.2);
      gl_FragColor = vec4(c, 1.0);
    }`,
};
