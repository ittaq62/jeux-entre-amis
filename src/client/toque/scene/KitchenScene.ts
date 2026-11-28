// La scène 3D d'un service : le rendu (le halo des flammes et des lampes, l'étalonnage), la caméra qui cadre toute la
// cuisine (tournée d'un quart sur un téléphone tenu droit, pour que la cuisine remplisse l'écran), la lumière et ses
// ombres, la cuisine et son décor, les chefs, ce qui est posé, tenu, lancé ou tombé, les jauges de cuisson, le feu, la
// vapeur. La qualité s'allège d'elle-même sur un appareil qui peine (les effets, puis les pixels, puis les ombres).

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { buildKitchen, Cell, type Kitchen, type KitchenId } from "../../../shared/games/toque/kitchens.ts";
import { ACT_CHOP, ACT_SPRAY, ACT_WASH, offsetsAt, rackFor, type Item, type World } from "../../../shared/games/toque/sim.ts";
import { CHOP, type FoodId } from "../../../shared/games/toque/food.ts";
import { headCanvas } from "../../bolides/scene/faces.ts";
import { AutoQuality } from "../../lib/autoQuality.ts";
import { warmThree } from "../../lib/prepare.ts";
import { releaseRenderer } from "../../lib/releaseGl.ts";
import { ChefModel, CHEF_SCALE, type ChefLook } from "./chef.ts";
import { buildDecor, type Decor } from "./decor.ts";
import { Effects } from "./fx.ts";
import { FoodKit, visualKey } from "./food3d.ts";
import { buildKitchen3D, cellCenter, COUNTER_H, type Kitchen3D } from "./kitchen3d.ts";
import type { Keep } from "./textures.ts";
import { THEMES, type Theme } from "./themes.ts";

export const TOUCH = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);

/** Un chef tel qu'on le montre : sa place (anticipée pour le sien, glissée pour les autres) et ce qu'il fait */
export interface ChefView {
  slot: number;
  x: number;
  y: number;
  fx: number;
  fy: number;
  held: Item | null;
  act: number;
  out: number;
  dash: number;
  stun: number;
  speed: number;
}

export interface SceneFrame {
  world: World;
  chefs: ChefView[];
  /** Le chef du joueur (pour viser), ou −1 */
  me: number;
  /** La case qu'il vise, ou −1 */
  target: number;
  /** Le temps du service, en secondes (pour ce qui bouge) */
  t: number;
  /** Le bateau penche (de −1 à 1) */
  tilt: number;
}

export interface ChefDress extends ChefLook {
  name: string;
  /** Pas de nom au-dessus de soi */
  me: boolean;
}

interface ItemShown {
  key: string;
  obj: THREE.Group;
  seen: number;
}

interface Bar {
  bg: THREE.Sprite;
  fill: THREE.Sprite;
  icon: THREE.Sprite;
  used: boolean;
}

/** L'étalonnage : un peu plus chaud, un peu plus franc, les bords assombris */
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uWarm: { value: 0.04 }, uSat: { value: 1.08 }, uVignette: { value: 0.3 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uWarm; uniform float uSat; uniform float uVignette; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb = mix(vec3(l), c.rgb, uSat);
  c.rgb += vec3(uWarm, uWarm * 0.4, -uWarm * 0.6) * (0.3 + l);
  vec2 d = vUv - 0.5;
  c.rgb *= 1.0 - uVignette * dot(d, d) * 1.6;
  gl_FragColor = c;
}`,
};

export class KitchenScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 160);
  readonly kitchen: Kitchen;
  readonly theme: Theme;
  private disposables: { dispose: () => void }[] = [];
  private keep: Keep = (x) => (this.disposables.push(x), x);
  private kit = new FoodKit();
  private k3d: Kitchen3D;
  private decor: Decor;
  private fx: Effects;
  private chefs = new Map<number, ChefModel>();
  private rings = new Map<number, THREE.Mesh>();
  private tags = new Map<number, THREE.Sprite>();
  /** Le nom au-dessus de chaque chef et l'anneau à ses pieds (pas sur une affiche) */
  showNames = true;
  private items = new Map<number, ItemShown>();
  private stacks = new Map<number, { n: number; dirty: boolean; obj: THREE.Group }>();
  private bars: Bar[] = [];
  private highlight: THREE.Group;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private composer: EffectComposer | null = null;
  private effects = true;
  private quality = new AutoQuality({ levers: ["effets", "pixels", "pixels", "ombres"], apply: (on) => this.applyQuality(on) });
  private baseRatio = Math.min(window.devicePixelRatio || 1, TOUCH ? 2 : 2);
  private ro: ResizeObserver;
  private host: HTMLElement;
  private clock = 0;
  private frame = 0;
  /** La caméra tournée d'un quart (téléphone tenu droit) */
  portrait = false;
  /** La caméra : où elle regarde, son recul, et un cadrage imposé (cinématiques) */
  private look = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private override: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private shake = 0;
  private wasCooking = new Set<number>();
  private iconTex: Record<"ok" | "warn" | "fire", THREE.Texture>;

  constructor(
    host: HTMLElement,
    kitchenId: KitchenId,
    duel: boolean,
    private fixed = false,
  ) {
    this.host = host;
    this.kitchen = buildKitchen(kitchenId, duel);
    this.theme = THEMES[kitchenId];
    this.renderer = new THREE.WebGLRenderer({
      antialias: !TOUCH || this.baseRatio < 2,
      powerPreference: "high-performance",
      preserveDrawingBuffer: fixed,
    });
    this.renderer.setPixelRatio(this.baseRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "tq-canvas";
    this.renderer.info.autoReset = false;
    host.appendChild(this.renderer.domElement);

    const t = this.theme;
    this.scene.background = new THREE.Color(t.sky);
    if (t.fog) this.scene.fog = new THREE.Fog(t.fog[0], t.fog[1], t.fog[2]);
    this.hemi = new THREE.HemisphereLight(t.hemi[0], t.hemi[1], t.hemi[2]);
    this.sun = new THREE.DirectionalLight(t.sun[0], t.sun[1]);
    this.sun.position.set(...t.sun[2]);
    this.sun.castShadow = true;
    const k = this.kitchen;
    const half = Math.max(k.W, k.H) / 2 + 3;
    const sc = this.sun.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 0.5;
    sc.far = 40;
    this.sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.k3d = buildKitchen3D(k, t, this.kit, this.keep, TOUCH);
    this.k3d.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.castShadow) o.receiveShadow = true;
    });
    this.scene.add(this.k3d.root);
    this.decor = buildDecor(k, t, this.keep, TOUCH);
    this.scene.add(this.decor.root);
    this.fx = new Effects(this.keep, TOUCH);
    this.scene.add(this.fx.group);
    this.highlight = this.makeHighlight();
    this.scene.add(this.highlight);
    this.iconTex = { ok: this.iconTexture("ok"), warn: this.iconTexture("warn"), fire: this.iconTexture("fire") };

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
    this.renderer.setPixelRatio(this.baseRatio * (on[2] ? 0.62 : on[1] ? 0.8 : 1));
    this.renderer.shadowMap.enabled = !on[3];
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m)) m.needsUpdate = true;
    });
    this.resize();
  }

  private makeComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const ratio = this.renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * ratio, size.y * ratio, { type: THREE.HalfFloatType, samples: TOUCH ? 0 : 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const [s, r, th] = this.theme.bloom;
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), s, r, th));
    composer.addPass(new OutputPass());
    const grade = new ShaderPass(GRADE);
    grade.uniforms.uWarm!.value = this.theme.grade[0];
    grade.uniforms.uSat!.value = this.theme.grade[1];
    grade.uniforms.uVignette!.value = this.theme.grade[2];
    composer.addPass(grade);
    this.composer = composer;
  }

  /** Le cadre qui montre la case visée : quatre baguettes lumineuses sur ses bords */
  private makeHighlight(): THREE.Group {
    const g = new THREE.Group();
    const mat = this.keep(
      new THREE.MeshBasicMaterial({ color: "#fff4c2", transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }),
    );
    const long = this.keep(new THREE.BoxGeometry(1.02, 0.025, 0.04));
    for (const [x, z, r] of [
      [0, -0.5, 0],
      [0, 0.5, 0],
      [-0.5, 0, Math.PI / 2],
      [0.5, 0, Math.PI / 2],
    ] as const) {
      const m = new THREE.Mesh(long, mat);
      m.position.set(x, 0, z);
      m.rotation.y = r;
      m.renderOrder = 4;
      g.add(m);
    }
    g.visible = false;
    return g;
  }

  private iconTexture(kind: "ok" | "warn" | "fire"): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = kind === "ok" ? "#3aa55a" : kind === "warn" ? "#e0412f" : "#f08a24";
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = "#ffffff";
    g.font = "bold 40px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(kind === "ok" ? "✓" : "!", 32, 35);
    const t = this.keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Les chefs de la partie, dans l'ordre des chefs (leur tête se dessine ensuite, sans attendre) */
  setChefs(dresses: ChefDress[]) {
    for (const c of this.chefs.values()) {
      c.group.removeFromParent();
      c.dispose();
    }
    this.chefs.clear();
    for (const r of this.rings.values()) r.removeFromParent();
    this.rings.clear();
    for (const t of this.tags.values()) t.removeFromParent();
    this.tags.clear();
    dresses.forEach((d, slot) => {
      const chef = new ChefModel(d, TOUCH);
      this.chefs.set(slot, chef);
      this.scene.add(chef.group);
      void headCanvas(d.avatar).then((canvas) => {
        if (this.chefs.get(slot) === chef) chef.setHead(canvas);
      });
      // Un anneau à sa couleur sous ses pieds (plus franc pour le sien)
      const ring = new THREE.Mesh(
        this.keep(new THREE.RingGeometry(0.28, d.me ? 0.36 : 0.33, 28).rotateX(-Math.PI / 2)),
        this.keep(
          new THREE.MeshBasicMaterial({
            color: d.color,
            transparent: true,
            opacity: d.me ? 0.95 : 0.6,
            depthWrite: false,
            toneMapped: false,
          }),
        ),
      );
      ring.renderOrder = 3;
      this.scene.add(ring);
      this.rings.set(slot, ring);
      if (!d.me) {
        const tag = this.nameTag(d.name, d.color);
        this.scene.add(tag);
        this.tags.set(slot, tag);
      }
    });
  }

  private nameTag(name: string, color: string): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.font = "600 30px 'Libre Franklin Variable', sans-serif";
    const w = Math.min(240, g.measureText(name).width + 28);
    g.fillStyle = "rgba(20,16,14,0.62)";
    g.beginPath();
    g.roundRect(128 - w / 2, 10, w, 44, 22);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(128 - w / 2 + 18, 32, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(name, 128 + 8, 33, 200);
    const t = this.keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })));
    s.scale.set(1.1, 0.275, 1);
    s.renderOrder = 10;
    return s;
  }

  /** Cadrer toute la cuisine (au milieu de ce que laisse l'interface) */
  resize() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
    this.frameKitchen();
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
  }

  /** La place de la caméra qui fait tenir toute la cuisine à l'écran, sous les commandes affichées en haut */
  private frameKitchen() {
    const b = this.k3d.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    // La direction de la caméra : de face (et de biais vers le bas), ou de côté au téléphone tenu droit
    const pitch = 0.98;
    const dir = this.portrait
      ? new THREE.Vector3(Math.cos(pitch), Math.sin(pitch), 0)
      : new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const corners: THREE.Vector3[] = [];
    for (const x of [b.minX - 0.2, b.maxX + 0.2])
      for (const z of [b.minZ - 0.2, b.maxZ + 0.3]) for (const y of [0, 1.1]) corners.push(new THREE.Vector3(x, y, z));
    const target = new THREE.Vector3(cx, 0, cz);
    const fits = (dist: number, shift: number) => {
      const t = target.clone();
      if (this.portrait) t.x += shift;
      else t.z += shift;
      this.camera.position.copy(t).addScaledVector(dir, dist);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(t);
      this.camera.updateMatrixWorld();
      let minY = 1;
      let maxY = -1;
      let maxX = 0;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        maxX = Math.max(maxX, Math.abs(p.x));
      }
      return { minY, maxY, maxX, t };
    };
    // Le haut de l'écran est pris par les commandes, le bas par les boutons au doigt
    const top = this.portrait ? 0.62 : 0.7;
    const bottom = this.portrait ? -0.62 : -0.9;
    const want = (top + bottom) / 2;
    // Pour un recul donné, le décalage qui centre la cuisine entre le haut et le bas permis (méthode de Newton)
    const centred = (dist: number) => {
      let shift = 0;
      for (let it = 0; it < 6; it++) {
        const a = fits(dist, shift);
        const b2 = fits(dist, shift + 0.1);
        const slope = ((b2.maxY + b2.minY) / 2 - (a.maxY + a.minY) / 2) / 0.1;
        if (Math.abs(slope) < 1e-6) break;
        shift -= ((a.maxY + a.minY) / 2 - want) / slope;
        shift = Math.max(-10, Math.min(10, shift));
      }
      return shift;
    };
    let lo = 4;
    let hi = 80;
    for (let it = 0; it < 24; it++) {
      const mid = (lo + hi) / 2;
      const r = fits(mid, centred(mid));
      if (r.maxY <= top && r.minY >= bottom && r.maxX <= 0.95) hi = mid;
      else lo = mid;
    }
    const r = fits(hi, centred(hi));
    this.look.copy(r.t);
    this.camPos.copy(this.camera.position);
  }

  /** Une caméra imposée (les cinématiques), ou null pour revenir au cadrage de la cuisine */
  setCamera(pos: THREE.Vector3 | null, target?: THREE.Vector3) {
    this.override = pos && target ? { pos: pos.clone(), target: target.clone() } : null;
  }

  /** Le cadrage de jeu (pour partir de là dans une cinématique) */
  get gameCamera() {
    return { pos: this.camPos.clone(), target: this.look.clone() };
  }

  /** La direction du stick (à l'écran) dans le repère de la cuisine : x vers la droite du plan, y vers le bas du plan */
  screenToPlan(sx: number, sy: number): [number, number] {
    // Landscape : droite = +x, haut de l'écran = −y du plan. Portrait (caméra de côté, regardant vers −x) : droite de
    // l'écran = −z (le fond), haut de l'écran = −x
    if (!this.portrait) return [sx, -sy];
    return [-sy, -sx];
  }

  /** Un point de la cuisine (plan) à l'écran, en pixels CSS (pour les points qui s'envolent) */
  project(x: number, y: number, h = 1): { x: number; y: number } | null {
    const k = this.kitchen;
    const v = new THREE.Vector3(x - k.W / 2, h, y - k.H / 2).project(this.camera);
    if (v.z > 1) return null;
    const w = this.host.clientWidth;
    const hh = this.host.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * hh };
  }

  /** Une secousse (une charrette, un feu qui prend) */
  bump(k: number) {
    this.shake = Math.max(this.shake, k);
  }

  /** Les effets d'un événement du service (les sons sont ailleurs) */
  effect(kind: string, x: number, y: number, color?: string) {
    const k = this.kitchen;
    const wx = x - k.W / 2;
    const wz = y - k.H / 2;
    if (kind === "serve") this.fx.burst(wx, COUNTER_H + 0.3, wz);
    else if (kind === "splash") this.fx.splash(wx, 0, wz);
    else if (kind === "dust") this.fx.dust(wx, 0.05, wz, 6);
    else if (kind === "chop" && color) this.fx.chop(wx, COUNTER_H + 0.05, wz, color);
  }

  /** Tout préparer derrière l'écran de chargement (voir lib/prepare.ts) */
  prepare(onProgress?: (share: number) => void) {
    return warmThree(this.renderer, this.scene, this.camera, { onProgress, render: () => this.draw(0) });
  }

  // -------------------------------------------------------------------------
  // Chaque image
  // -------------------------------------------------------------------------

  render(dt: number, f: SceneFrame | null) {
    this.clock += dt;
    this.frame++;
    if (!this.fixed) this.quality.tick(performance.now());
    if (f) this.update(dt, f);
    this.decor.update(this.clock, dt, f?.t ?? 0);
    this.fx.update(dt);
    this.draw(dt);
  }

  private draw(dt: number) {
    this.renderer.info.reset();
    // La caméra : imposée, ou le cadrage de jeu (avec la secousse et la houle du bateau)
    if (this.override) {
      this.camera.position.copy(this.override.pos);
      this.camera.lookAt(this.override.target);
    } else {
      this.camera.position.copy(this.camPos);
      if (this.shake > 0.001) {
        const s = this.shake * this.shake * 0.12;
        this.camera.position.x += (Math.random() - 0.5) * s;
        this.camera.position.y += (Math.random() - 0.5) * s;
        this.shake *= Math.exp(-dt * 6);
      }
      this.camera.lookAt(this.look);
    }
    if (this.effects) {
      if (!this.composer) this.makeComposer();
      this.composer!.render(dt);
    } else this.renderer.render(this.scene, this.camera);
  }

  /** La place d'une case à ce moment (son morceau peut avoir bougé) et la hauteur où l'on y pose */
  private cellSpot(i: number, off: [number, number][]): [number, number, number] {
    const k = this.kitchen;
    const [x, z] = cellCenter(k, i);
    const o = off[k.section[i]!] ?? [0, 0];
    return [x + o[0], this.k3d.stations.get(i)?.seat ?? COUNTER_H, z + o[1]];
  }

  private update(dt: number, f: SceneFrame) {
    const k = this.kitchen;
    const w = f.world;
    const off = offsetsAt(k, f.t);
    this.k3d.sections.forEach((g, s) => {
      const o = off[s] ?? [0, 0];
      g.position.set(o[0], 0, o[1]);
    });
    // Le bateau qui penche : toute la cuisine bascule un peu
    this.k3d.root.rotation.z = -f.tilt * 0.05;
    this.decor.root.rotation.z = -f.tilt * 0.02;

    // Les chefs
    for (const c of f.chefs) {
      const model = this.chefs.get(c.slot);
      if (!model) continue;
      const wx = c.x - k.W / 2;
      const wz = c.y - k.H / 2;
      const fallen = c.out > 0;
      model.group.visible = !fallen || c.out > 70;
      // Tombé : il s'enfonce (dans l'eau ou le vide) avant de disparaître
      const sink = fallen ? Math.min(1, (90 - c.out) / 18) : 0;
      model.group.position.set(wx, -sink * 1.2, wz);
      const target = Math.atan2(c.fx, c.fy);
      let d = target - model.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      model.group.rotation.y += d * Math.min(1, dt * 18);
      model.animate(
        { speed: c.speed, carrying: Boolean(c.held), act: c.act, dash: c.dash > 0, stun: c.stun > 0, cheer: -1 },
        this.clock,
        dt,
      );
      const ring = this.rings.get(c.slot);
      if (ring) {
        ring.visible = !fallen && this.showNames;
        ring.position.set(wx, 0.012, wz);
      }
      const tag = this.tags.get(c.slot);
      if (tag) {
        tag.visible = !fallen && this.showNames;
        tag.position.set(wx, 1.55, wz);
      }
      if (c.act === ACT_SPRAY && !fallen) this.fx.spray(wx + c.fx * 0.35, 0.55, wz + c.fy * 0.35, c.fx, c.fy, dt);
      if (c.dash > 0 && this.frame % 2 === 0) this.fx.dust(wx, 0.05, wz, 1);
    }

    // Ce qui est posé, tenu, lancé, par terre : un objet 3D par objet du jeu, refait seulement quand il change d'allure
    const seen = this.frame;
    const show = (it: Item, place: (obj: THREE.Group) => void) => {
      const key = visualKey(it);
      let s = this.items.get(it.id);
      if (!s || s.key !== key) {
        if (s) s.obj.removeFromParent();
        const obj = this.kit.make(it);
        s = { key, obj, seen };
        this.items.set(it.id, s);
      }
      s.seen = seen;
      place(s.obj);
    };
    w.items.forEach((it, i) => {
      if (!it) return;
      const [x, y, z] = this.cellSpot(i, off);
      show(it, (obj) => {
        if (obj.parent !== this.scene) this.scene.add(obj);
        obj.scale.setScalar(1);
        obj.position.set(x, y, z);
        obj.rotation.set(0, (this.k3d.stations.get(i)?.face ?? 0) + (it.k === "pan" ? -Math.PI / 2 : 0), 0);
      });
    });
    for (const c of f.chefs) {
      const model = this.chefs.get(c.slot);
      if (!c.held || !model) continue;
      show(c.held, (obj) => {
        if (obj.parent !== model.hold) model.hold.add(obj);
        obj.scale.setScalar(1 / CHEF_SCALE);
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, c.held!.k === "pan" ? -Math.PI / 2 : 0, 0);
      });
    }
    for (const l of w.loose) {
      const o = off[l.sec] ?? [0, 0];
      show(l.item, (obj) => {
        if (obj.parent !== this.scene) this.scene.add(obj);
        obj.scale.setScalar(1);
        obj.position.set(l.x + o[0] - k.W / 2, 0.01, l.y + o[1] - k.H / 2);
        obj.rotation.set(0, l.item.id * 1.3, 0);
      });
    }
    for (const fl of w.flying) {
      show(fl.item, (obj) => {
        if (obj.parent !== this.scene) this.scene.add(obj);
        obj.scale.setScalar(1);
        // Un bel arc : il monte puis redescend vers la fin du vol
        const u = Math.min(1, fl.t / 17);
        obj.position.set(fl.x - k.W / 2, 0.75 + Math.sin(u * Math.PI) * 0.6 - u * 0.2, fl.y - k.H / 2);
        obj.rotation.set(fl.t * 0.4, fl.t * 0.3, 0);
      });
    }
    for (const [id, s] of this.items) {
      if (s.seen === seen) continue;
      s.obj.removeFromParent();
      this.items.delete(id);
    }

    // Les piles d'assiettes (égouttoir, retour, évier)
    this.updateStacks(w, off);

    // Les postes : flammes, braise, huile, eau, et les jauges
    for (const b of this.bars) b.used = false;
    for (const [i, st] of this.k3d.stations) {
      const it = w.items[i];
      const [x, y, z] = this.cellSpot(i, off);
      const burning = w.fire[i]! > 0;
      if (burning) this.fx.fire(x, y, z, w.fire[i]!, dt);
      const p = it?.p ?? 0;
      const cooking =
        !burning &&
        it !== null &&
        ((st.kind === Cell.Stove && (it.k === "pot" || it.k === "pan") && (it.c ?? []).length > 0 && it.c![0] !== "charbon") ||
          (st.kind === Cell.Fryer && it.k === "food" && it.f !== "charbon") ||
          (st.kind === Cell.Oven && it.k === "base"));
      if (st.flame) {
        st.flame.visible = cooking;
        if (cooking) {
          const flick = 0.9 + Math.sin(this.clock * 31 + i) * 0.06 + Math.random() * 0.06;
          st.flame.scale.set(flick, 1, flick);
        }
      }
      if (st.glow && st.kind === Cell.Oven)
        (st.glow.material as THREE.MeshBasicMaterial).opacity = cooking ? 0.75 + Math.sin(this.clock * 7) * 0.15 : 0.12;
      if (st.oil) st.oil.position.y = COUNTER_H + 0.02 + (cooking ? Math.sin(this.clock * 20) * 0.003 : 0);
      if (cooking) {
        if (p < 2 && st.kind !== Cell.Oven) this.fx.steam(x, y + 0.25, z, p >= 1 ? 1 : 0.6, dt);
        if (st.kind === Cell.Fryer) this.fx.bubbles(x, COUNTER_H + 0.03, z, dt);
        if (p > 1.35) this.fx.scorch(x, y + 0.3, z, (p - 1.35) * 2, dt);
        if (!this.wasCooking.has(i)) this.wasCooking.add(i);
      } else this.wasCooking.delete(i);
      // Les jauges : couper (sur la planche), cuire, laver
      if (it && st.kind === Cell.Board && it.k === "food" && it.f && CHOP[it.f] && p > 0) this.bar(x, y + 0.45, z, p, "#f2c24a", null);
      else if (cooking) {
        if (p < 1) this.bar(x, y + 0.55, z, p, "#5ac85a", null);
        else if (p < 2)
          this.bar(x, y + 0.55, z, 1, p > 1.4 ? "#e0412f" : "#5ac85a", p > 1.4 ? (Math.floor(this.clock * 6) % 2 ? "warn" : null) : "ok");
      } else if (st.kind === Cell.Sink && w.wash[i]! > 0) this.bar(x, y + 0.45, z, w.wash[i]!, "#5aa8e0", null);
      if (burning) this.bar(x, y + 0.9, z, 1, "#f08a24", "fire", true);
    }
    // Les jauges de trop se cachent ; les autres gardent ce que bar() a montré (une icône seule pour le feu, une jauge sans
    // icône pour la coupe : l'icône vide ne doit jamais se montrer, elle resterait au milieu de la cuisine)
    for (const b of this.bars) if (!b.used) b.bg.visible = b.fill.visible = b.icon.visible = false;
    // Les éclats de ce qu'on coupe, et les bulles de la vaisselle
    for (const c of f.chefs) {
      if (c.out > 0) continue;
      if (c.act === ACT_CHOP && this.frame % 5 === 0) {
        const cell = w.chefs[c.slot]?.cell ?? -1;
        const it = cell >= 0 ? w.items[cell] : null;
        if (cell >= 0) {
          const [x, , z] = this.cellSpot(cell, off);
          this.fx.chop(x, COUNTER_H + 0.05, z, foodColor(it?.f));
        }
      }
      if (c.act === ACT_WASH) {
        const cell = w.chefs[c.slot]?.cell ?? -1;
        if (cell >= 0) {
          const [x, , z] = this.cellSpot(cell, off);
          this.fx.bubbles(x, COUNTER_H + 0.05, z, dt);
        }
      }
    }

    // La case que vise son chef
    if (f.target >= 0 && f.me >= 0) {
      const [x, y, z] = this.cellSpot(f.target, off);
      this.highlight.visible = true;
      this.highlight.position.set(x, y + 0.01, z);
      const pulse = 0.65 + Math.sin(this.clock * 6) * 0.25;
      (this.highlight.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = pulse;
    } else this.highlight.visible = false;

    // La neige du chalet, sur la terrasse
    if (k.id === "chalet") this.fx.snow(k.W / 2 - 3, 0, 8, k.H + 2, dt);
  }

  private bar(x: number, y: number, z: number, k: number, color: string, icon: "ok" | "warn" | "fire" | null, iconOnly = false) {
    let b = this.bars.find((x) => !x.used);
    if (!b) {
      const mk = (c: string, center?: [number, number]) => {
        const s = new THREE.Sprite(
          this.keep(new THREE.SpriteMaterial({ color: c, depthTest: false, transparent: true, toneMapped: false })),
        );
        if (center) s.center.set(center[0], center[1]);
        s.renderOrder = 9;
        this.scene.add(s);
        return s;
      };
      b = { bg: mk("#1e1a18"), fill: mk("#5ac85a", [0, 0.5]), icon: mk("#ffffff"), used: false };
      b.bg.material.opacity = 0.75;
      this.bars.push(b);
    }
    b.used = true;
    const W = 0.62;
    b.bg.visible = !iconOnly;
    b.fill.visible = !iconOnly;
    b.bg.position.set(x, y, z);
    b.bg.scale.set(W + 0.06, 0.12, 1);
    b.fill.position.set(x - W / 2, y, z);
    b.fill.scale.set(Math.max(0.001, W * Math.min(1, k)), 0.075, 1);
    b.fill.material.color.set(color);
    b.icon.visible = icon !== null;
    if (icon) {
      b.icon.material.map = this.iconTex[icon];
      b.icon.material.needsUpdate = true;
      b.icon.position.set(x + (iconOnly ? 0 : W / 2 + 0.16), y, z);
      const s = icon === "fire" ? 0.42 : 0.3;
      b.icon.scale.set(s, s, 1);
    }
  }

  private updateStacks(w: World, off: [number, number][]) {
    const k = this.kitchen;
    const want = new Map<number, { n: number; dirty: boolean }>();
    w.stack.forEach((n, i) => {
      if (n <= 0) return;
      const kind = k.cells[i];
      const dirty = kind === Cell.Sink || (kind === Cell.Return && k.def.washing);
      want.set(i, { n, dirty });
    });
    for (const [i, s] of this.stacks) {
      const wnt = want.get(i);
      if (!wnt || wnt.n !== s.n || wnt.dirty !== s.dirty) {
        s.obj.removeFromParent();
        this.stacks.delete(i);
      }
    }
    for (const [i, wnt] of want) {
      let s = this.stacks.get(i);
      if (!s) {
        const kind = k.cells[i];
        const obj = new THREE.Group();
        if (kind === Cell.Rack) {
          // Debout dans l'égouttoir
          for (let n = 0; n < Math.min(6, wnt.n); n++) {
            const p = this.kit.make({ id: -1, k: "plate", c: [] });
            p.rotation.x = Math.PI / 2 - 0.15;
            p.position.set((n - 2.5) * 0.12, 0.2, 0);
            obj.add(p);
          }
        } else {
          const p = this.kit.make({ id: -1, k: "plate", c: [], dirty: wnt.dirty, n: Math.min(6, wnt.n) });
          obj.add(p);
        }
        this.scene.add(obj);
        s = { ...wnt, obj };
        this.stacks.set(i, s);
      }
      const [x, y, z] = this.cellSpot(i, off);
      s.obj.position.set(x, y, z);
      const face = this.k3d.stations.get(i)?.face ?? 0;
      s.obj.rotation.y = k.cells[i] === Cell.Rack ? face + Math.PI / 2 : face;
    }
    void rackFor;
  }

  dispose() {
    this.ro.disconnect();
    for (const c of this.chefs.values()) c.dispose();
    this.kit.dispose();
    this.decor.dispose();
    this.fx.dispose();
    this.composer?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    for (const d of this.disposables) d.dispose();
    this.renderer.domElement.remove();
    releaseRenderer(this.renderer);
  }
}

/** La couleur des éclats de ce qu'on coupe */
function foodColor(f: FoodId | undefined): string {
  switch (f) {
    case "tomate":
      return "#e0392b";
    case "laitue":
      return "#7ccc48";
    case "oignon":
      return "#f3ead4";
    case "champi":
      return "#e9e0cf";
    case "patate":
      return "#f2dca0";
    case "fromage":
      return "#f4d35e";
    case "jambon":
      return "#ec959a";
    case "poisson":
      return "#f2d8cc";
    case "pomme":
      return "#f4e6b8";
    default:
      return "#f2e2b8";
  }
}
