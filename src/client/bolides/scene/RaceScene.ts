// La scène 3D d'une course : le monde, les karts, les caisses, les pièges, les petits effets, et la caméra.
// Elle ne décide de rien : on lui dit où sont les karts et ce qui vient d'arriver, elle le dessine.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BOMBE_RADIUS, hazardPos, type Hazard } from "../../../shared/games/bolides/items.ts";
import type { Kart } from "../../../shared/games/bolides/physics.ts";
import { pointAt, wrapAngle, type Track } from "../../../shared/games/bolides/track.ts";
import { CoinField, Crossers } from "./features.ts";
import { KartModel, type KartExtras, type KartLook } from "./kart.ts";
import { AimGuide, type Aim } from "./aim.ts";
import { TrackLife, WATER_DEPTH, type LifeEvent } from "./life.ts";
import { Podium, type PodiumSpot } from "./podium.ts";
import { DriftMarks, TurboTrails } from "./trails.ts";
import type { Mood } from "./sky.ts";
import * as TX from "./textures.ts";
import { buildWorld, type World } from "./world.ts";

export interface SceneOptions {
  phone: boolean;
  reduced: boolean;
}

/** Ce qu'il faut dessiner à cette image */
export interface Frame {
  karts: ({ kart: Kart } & KartExtras)[];
  /** Le kart suivi par la caméra (-1 : aucun, la caméra survole la ligne de départ) */
  follow: number;
  camera: "intro" | "chase" | "orbit" | "podium";
  /** Où en est le survol d'avant la course, de 0 à 1 */
  introT: number;
  /** Les feux de départ sur l'arche (0 : éteints, 1 à 3 rouges, 4 : verts) */
  lights: number;
  serverNow: number;
  /** Le temps réel écoulé depuis l'image précédente, en secondes */
  dt: number;
  /** Des feux d'artifice dans le ciel (le dernier tour, l'arrivée) */
  fireworks?: boolean;
  /** La visée de l'objet qu'on tient */
  aim?: Aim | null;
  /** L'aspiration en cours, de 0 à 1 */
  draft?: number;
  /** Regarder derrière soi */
  lookBack?: boolean;
}

interface Puff {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  grow: number;
  /** Elle retombe (étincelles) ou monte doucement (fumée) */
  heavy: boolean;
  /** Son opacité au départ */
  alpha: number;
}

/** Les couleurs des mini-turbos, du plus petit au plus gros */
const TURBO_COLORS = [0x45c8ff, 0xff9a2e, 0xc77dff];
const MAX_PUFFS = 220;

export class RaceScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1400);
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  /** La lumière du jour (1), plus faible dans un tunnel */
  private daylight = 1;
  private lightsShown = -1;
  private world: World | null = null;
  private track: Track | null = null;
  private karts: KartModel[] = [];
  /** Les caisses-mystère : une seule forme répétée ; leur place, et leur taille (elles rétrécissent quand on les prend) */
  private crates: THREE.InstancedMesh | null = null;
  private cratePos: THREE.Vector3[] = [];
  private crateScale: number[] = [];
  private crateM = new THREE.Matrix4();
  private crateQ = new THREE.Quaternion();
  private crateE = new THREE.Euler();
  private crateS = new THREE.Vector3();
  private coins: CoinField | null = null;
  private crossers: Crossers | null = null;
  private life: TrackLife | null = null;
  private aim: AimGuide | null = null;
  private marks: DriftMarks | null = null;
  private trails: TurboTrails | null = null;
  /** L'image finale : le flou de vitesse (sur ordinateur) */
  private finish: ShaderPass | null = null;
  private speedBlur = 0;
  private smokeTex: THREE.Texture;
  private lookingBack = false;
  /** Les karts déjà sous l'eau (pour ne faire qu'un seul plouf) */
  private drowned: boolean[] = [];
  /** Le son de ce qui se passe sur la route, plus ou moins fort selon la distance */
  onLife: ((sound: "clang" | "baa" | "firework" | "dive", volume: number) => void) | null = null;
  /** Chaque kart : au-dessus de la mer ou non (pour le plouf quand il la traverse), et la caméra sous l'eau ou non */
  private aboveSea: boolean[] = [];
  private cameraUnder = false;
  private bubbleTick = 0;
  private fireworkIn = 0;
  /** La cérémonie : le podium, depuis combien de temps il est là, et quand tombe la prochaine pluie de confettis */
  private podium: Podium | null = null;
  private podiumT = 0;
  private confettiIn = 0;
  private featureKeep: { dispose: () => void }[] = [];
  private crateShown: boolean[] = [];
  private crateMat: THREE.MeshStandardMaterial | null = null;
  private crateGeo: THREE.BufferGeometry | null = null;
  private hazards = new Map<number, { hz: Hazard; mesh: THREE.Object3D }>();
  private oilMat: THREE.MeshBasicMaterial;
  private petardGeo: THREE.BufferGeometry;
  private petardMat: THREE.MeshLambertMaterial;
  private rocketParts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  /** Les formes des objets lancés (libérées à la fin), et les ondes d'explosion et éclairs en cours */
  private thrownParts: { dispose: () => void }[] = [];
  private pulses: { mesh: THREE.Mesh; life: number; max: number; radius: number }[] = [];
  private puffs: Puff[] = [];
  private spare: THREE.Sprite[] = [];
  private puffTex: THREE.Texture;
  /** La secousse de la caméra et le coup de zoom, qui s'amortissent */
  private shakeAmp = 0;
  private fovKick = 0;
  private smokeTick = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  /** Des vecteurs de travail, réutilisés d'une image à l'autre */
  private tmpPos = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private camReady = false;
  /** La caméra de poursuite : son cap et sa hauteur, lissés (la position suit le kart sans retard) */
  private camYaw = 0;
  private camY = 0;
  private chasing = false;
  /** Depuis combien de temps elle poursuit (elle arrive du survol en douceur) */
  private chaseT = 0;
  private time = 0;
  private resize: ResizeObserver;
  private shadows: boolean;
  private envTex: THREE.Texture | null = null;
  /** Le halo autour de ce qui brille (sur ordinateur seulement, et il s'efface si l'appareil peine) */
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private vignette: HTMLDivElement;
  /** La finesse de l'image : elle baisse un peu si l'appareil peine (moins de 45 images par seconde), et remonte */
  private ratio: number;
  private maxRatio: number;
  private frameAvg = 1 / 60;
  private resTimer = 0;
  private goodFor = 0;

  constructor(
    private container: HTMLElement,
    private opts: SceneOptions,
  ) {
    this.shadows = !opts.phone;
    this.renderer = new THREE.WebGLRenderer({ antialias: !opts.phone, powerPreference: "high-performance" });
    this.maxRatio = Math.min(window.devicePixelRatio || 1, opts.phone ? 1.5 : 2);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Des couleurs franches, sans blancs brûlés au soleil
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = "bolides-canvas";

    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6a3a, 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
    this.sun.position.set(60, 120, 40);
    this.sun.castShadow = this.shadows;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 10;
    sc.far = 300;
    this.scene.add(this.sun, this.sun.target);
    this.scene.environmentIntensity = 0.75;
    // Un voile léger sur les bords de l'image (rien à calculer : c'est un simple dégradé par-dessus)
    this.vignette = document.createElement("div");
    this.vignette.className = "bolides-vignette";
    container.appendChild(this.vignette);

    this.oilMat = new THREE.MeshBasicMaterial({ map: TX.oilTexture(), transparent: true, depthWrite: false });
    this.petardGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10);
    this.petardGeo.rotateX(Math.PI / 2);
    this.petardMat = new THREE.MeshLambertMaterial({ color: 0xd8352a, emissive: 0x401008 });
    this.puffTex = TX.sparkTexture();
    this.smokeTex = TX.smokeTexture();

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
  }

  private adaptResolution(dt: number) {
    if (dt <= 0) return;
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    this.resTimer += dt;
    this.goodFor = this.frameAvg < 1 / 56 ? this.goodFor + dt : 0;
    if (this.resTimer < 2) return;
    this.resTimer = 0;
    const min = this.opts.phone ? 0.7 : 1;
    let next = this.ratio;
    if (this.frameAvg > 1 / 45 && this.composer) {
      // D'abord le halo : ça se voit moins que perdre en finesse
      this.composer.dispose();
      this.composer = null;
      this.bloom?.dispose();
      this.bloom = null;
      this.finish = null;
      return;
    }
    if (this.frameAvg > 1 / 45) next = Math.max(min, this.ratio * 0.85);
    else if (this.goodFor > 8) next = Math.min(this.maxRatio, this.ratio * 1.1);
    if (Math.abs(next - this.ratio) < 0.01) return;
    this.ratio = next;
    this.goodFor = 0;
    this.renderer.setPixelRatio(next);
    this.fit();
  }

  private fit() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.ratio);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Le circuit et les karts (dans l'ordre des pilotes de la course) */
  build(track: Track, looks: KartLook[]) {
    this.track = track;
    this.world = buildWorld(track, {
      phone: this.opts.phone,
      shadows: this.shadows,
      anisotropy: Math.min(this.opts.phone ? 4 : 16, this.renderer.capabilities.getMaxAnisotropy()),
    });
    const mood = this.world.mood;
    this.hemi.color.setHex(mood.hemiSky);
    this.hemi.groundColor.setHex(mood.hemiGround);
    this.sun.color.setHex(mood.sun);
    this.makeEnvironment(mood);
    if (!this.opts.phone && !this.opts.reduced) this.makeBloom();
    this.scene.add(this.world.group, this.world.dome);
    this.scene.background = this.world.sky;
    this.scene.fog = this.world.fog;
    this.karts = looks.map((look) => {
      const m = new KartModel({ ...look, night: Boolean(mood.stars) }, this.shadows);
      this.scene.add(m.group);
      return m;
    });
    // Les caisses-mystère : un cube de verre aux couleurs qui changent, un point d'interrogation sur chaque face
    this.crateMat = new THREE.MeshStandardMaterial({
      map: TX.mysteryTexture(),
      transparent: true,
      opacity: 0.88,
      roughness: 0.15,
      metalness: 0.1,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
    });
    this.crateGeo = new RoundedBoxGeometry(1.4, 1.4, 1.4, 2, 0.14);
    this.crates = new THREE.InstancedMesh(this.crateGeo, this.crateMat, Math.max(1, track.boxes.length));
    this.crates.count = track.boxes.length;
    this.crates.frustumCulled = false;
    this.scene.add(this.crates);
    this.cratePos = track.boxes.map((b) => new THREE.Vector3(b.x, pointAt(track, b.s, b.d).y + 1.1, b.z));
    this.crateScale = track.boxes.map(() => 1);
    this.crateShown = track.boxes.map(() => true);
    // Les pièces et les engins qui traversent
    const keep = <T extends { dispose: () => void }>(x: T): T => {
      this.featureKeep.push(x);
      return x;
    };
    this.coins = new CoinField(track, keep);
    this.scene.add(this.coins.mesh);
    this.crossers = new Crossers(track, track.def.theme, keep, this.shadows, this.world.heightAt);
    this.scene.add(this.crossers.group);
    this.life = new TrackLife({ t: track, keep, heightAt: this.world.heightAt, shadows: this.shadows, phone: this.opts.phone });
    this.scene.add(this.life.group);
    this.aim = new AimGuide(track, keep);
    this.scene.add(this.aim.group);
    this.marks = new DriftMarks(keep, this.opts.phone ? 260 : 620);
    this.trails = new TurboTrails(keep, looks.length);
    this.scene.add(this.marks.mesh, this.trails.mesh);
    this.warmUp();
  }

  /**
   * Préparer tout de suite ce qui n'apparaît qu'en course (l'aile, la visée, l'hélice…) : sinon la carte graphique
   * le découvre au pire moment, et l'image saute une fraction de seconde.
   */
  private warmUp() {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (o.visible) return;
      hidden.push(o);
      o.visible = true;
    });
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      // Tant pis : ça se préparera à la première image
    }
    for (const o of hidden) o.visible = false;
  }

  /** La caméra passe sous la surface : tout devient bleu, on ne voit plus loin, et le ciel disparaît */
  private setUnderwater(under: boolean) {
    if (under === this.cameraUnder || !this.world) return;
    this.cameraUnder = under;
    const fog = this.world.fog;
    const mood = this.world.mood;
    if (under) {
      fog.color.setHex(0x1d8fb0);
      fog.near = 12;
      fog.far = 135;
      this.scene.background = fog.color;
      this.world.dome.visible = false;
      this.hemi.color.setHex(0xbdf0ff);
      this.hemi.groundColor.setHex(0x2a7a90);
    } else {
      fog.color.setHex(mood.horizon);
      fog.near = mood.fog[0];
      fog.far = mood.fog[1];
      this.scene.background = this.world.sky;
      this.world.dome.visible = true;
      this.hemi.color.setHex(mood.hemiSky);
      this.hemi.groundColor.setHex(mood.hemiGround);
    }
    this.vignette.classList.toggle("is-under", under);
  }

  /** Ce que reflètent les carrosseries : le ciel de ce circuit, son sol, son soleil */
  private makeEnvironment(mood: Mood) {
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const top = new THREE.Color(mood.top);
    const mid = new THREE.Color(mood.mid);
    const hor = new THREE.Color(mood.horizon);
    const ground = new THREE.Color(mood.ground);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 10;
      if (y > 0)
        c.copy(hor)
          .lerp(mid, Math.min(1, y / 0.25))
          .lerp(top, Math.max(0, (y - 0.2) / 0.8));
      else c.copy(hor).lerp(ground, Math.min(1, -y * 7));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
    env.add(dome);
    const sunGeo = new THREE.SphereGeometry(1, 12, 8);
    const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(mood.sun).multiplyScalar(30) });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.copy(mood.dir).multiplyScalar(8);
    env.add(sunMesh);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(env, 0.03).texture;
    pmrem.dispose();
    geo.dispose();
    sunGeo.dispose();
    sunMat.dispose();
    (dome.material as THREE.Material).dispose();
    this.scene.environment = this.envTex;
  }

  private makeBloom() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // Seul ce qui dépasse le blanc diffuse : les turbos, les pièces, les flammes, le soleil, pas la neige en plein jour
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.55, 1.3);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    // La touche finale : des couleurs un peu plus franches, et l'image qui file sur les bords à grande vitesse
    const finish = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uBlur;
        varying vec2 vUv;
        void main() {
          vec2 d = vUv - vec2(0.5, 0.52);
          float amount = uBlur * smoothstep(0.14, 0.66, length(d));
          vec3 color = vec3(0.0);
          for (int i = 0; i < 8; i++) color += texture2D(tDiffuse, vUv - d * amount * (float(i) / 7.0)).rgb;
          color /= 8.0;
          float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color = mix(vec3(grey), color, 1.09);
          color = (color - 0.5) * 1.05 + 0.5;
          gl_FragColor = vec4(color, 1.0);
        }`,
    });
    composer.addPass(finish);
    this.finish = finish;
    composer.setPixelRatio(this.ratio);
    composer.setSize(size.x, size.y);
    this.composer = composer;
    this.bloom = bloom;
  }

  /** Ce qui vient de se passer sur la route */
  private lifeEvent(e: LifeEvent) {
    const far = (range: number) => Math.max(0, 1 - Math.hypot(e.x - this.camPos.x, e.z - this.camPos.z) / range);
    if (e.kind === "clang") {
      const near = far(110);
      if (near > 0) this.onLife?.("clang", 0.25 + 0.75 * near);
      this.shakeNear(e.x, e.z, 45, 0.7);
      const n = this.opts.reduced ? 6 : 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.puff(
          e.x + Math.cos(a) * 2.5,
          e.y + 0.4,
          e.z + Math.sin(a) * 3.6,
          0xbdb5a4,
          Math.cos(a) * 7,
          1.2,
          Math.sin(a) * 7,
          0.8,
          3.4,
          0.75,
          false,
        );
      }
    } else if (e.kind === "trail") {
      if (this.opts.reduced) return;
      const color = e.thing === "boule" ? 0xf4f8fc : 0xb5a487;
      this.puff(e.x + (Math.random() - 0.5) * 1.6, e.y + 0.3, e.z + (Math.random() - 0.5) * 1.6, color, 0, 1, 0, 0.5, 1.6, 0.7, false);
    } else {
      const near = far(70);
      if (near > 0) this.onLife?.("baa", 0.15 + 0.75 * near);
    }
  }

  /** Un kart touche l'eau : une gerbe, et une onde */
  private splash(k: Kart) {
    const y = (this.track?.water ?? k.y - WATER_DEPTH) + 0.2;
    const theme = this.track?.def.theme;
    const color = theme === "volcan" ? 0xff7a2a : theme === "col" ? 0xdff4ff : theme === "vignes" ? 0xcdeed5 : 0xc6e6ff;
    for (let i = 0; i < (this.opts.reduced ? 8 : 26); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      this.puff(k.x, y, k.z, i % 3 === 0 ? 0xffffff : color, Math.cos(a) * s, 6 + Math.random() * 7, Math.sin(a) * s, 0.8, 0.55);
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(k.x, y, k.z);
    this.scene.add(ring);
    this.pulses.push({ mesh: ring, life: 0.6, max: 0.6, radius: 6 });
  }

  /** Reposé sur la route, après une chute */
  respawnSparkle(k: Kart) {
    for (let i = 0; i < (this.opts.reduced ? 6 : 16); i++) {
      const a = (i / 16) * Math.PI * 2;
      this.puff(k.x, k.y + k.air + 0.6, k.z, i % 2 ? 0xffffff : 0x7fd9ff, Math.cos(a) * 5, 2.2, Math.sin(a) * 5, 0.55, 0.6);
    }
  }

  /** Les pièces présentes (les autres sont ramassées) */
  setCoins(available: (i: number) => boolean) {
    this.coins?.set(available);
  }

  /** Une pièce ramassée : une petite gerbe dorée */
  coinSparkle(x: number, y: number, z: number) {
    this.burst({ x, y, z }, 0xffd84a, 6, 3);
  }

  /** Les caisses présentes ou prises (une caisse prise éclate) */
  setCrates(available: boolean[]) {
    available.forEach((on, i) => {
      const at = this.cratePos[i];
      if (!at) return;
      if (this.crateShown[i] && !on) {
        this.burst(at, 0xffd23a, 8);
        this.burst(at, 0x7fd9ff, 6);
      }
      this.crateShown[i] = on;
    });
  }

  /** Une caisse prise à l'instant par le joueur (avant même que le serveur le dise) */
  takeCrate(i: number) {
    if (this.crateShown[i]) this.setCrates(this.crateShown.map((on, k) => (k === i ? false : on)));
  }

  /** Les pièges sur la route : on ajoute les nouveaux, on retire ceux qui ne sont plus là */
  setHazards(list: Hazard[]) {
    const ids = new Set(list.map((h) => h.id));
    for (const [id, item] of this.hazards) {
      if (ids.has(id)) continue;
      this.scene.remove(item.mesh);
      this.hazards.delete(id);
    }
    for (const hz of list) {
      if (this.hazards.has(hz.id)) continue;
      let mesh: THREE.Object3D;
      if (hz.kind === "huile") {
        mesh = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20), this.oilMat);
        mesh.rotation.x = -Math.PI / 2;
        const y = this.track ? pointAt(this.track, hz.s, hz.d).y : 0;
        mesh.position.set(hz.x, y + 0.1, hz.z);
      } else if (hz.kind === "fusee") {
        mesh = this.rocket();
      } else if (hz.kind === "bowling" || hz.kind === "tarte" || hz.kind === "bombe") {
        mesh = this.thrown(hz.kind);
      } else {
        mesh = new THREE.Mesh(this.petardGeo, this.petardMat);
      }
      this.scene.add(mesh);
      this.hazards.set(hz.id, { hz, mesh });
    }
  }

  /** Une fusée : rouge et blanche, son nez, ses ailerons, sa flamme (les formes servent à toutes les fusées) */
  private rocket(): THREE.Group {
    if (this.rocketParts.length === 0) {
      const body = new THREE.CylinderGeometry(0.32, 0.32, 1.6, 12);
      body.rotateX(Math.PI / 2);
      const nose = new THREE.ConeGeometry(0.32, 0.6, 12);
      nose.rotateX(Math.PI / 2);
      nose.translate(0, 0, 1.1);
      const fins = new THREE.BoxGeometry(1.2, 0.08, 0.5);
      fins.translate(0, 0, -0.65);
      const fins2 = fins.clone().rotateZ(Math.PI / 2);
      const flame = new THREE.ConeGeometry(0.28, 1.0, 10);
      flame.rotateX(-Math.PI / 2);
      flame.translate(0, 0, -1.3);
      this.rocketParts = [
        { geo: body, mat: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.4 }) },
        { geo: nose, mat: new THREE.MeshStandardMaterial({ color: 0xd8352a, roughness: 0.4 }) },
        { geo: fins, mat: new THREE.MeshStandardMaterial({ color: 0xd8352a, roughness: 0.4 }) },
        { geo: fins2, mat: new THREE.MeshStandardMaterial({ color: 0xd8352a, roughness: 0.4 }) },
        { geo: flame, mat: new THREE.MeshBasicMaterial({ color: 0xffb347 }) },
      ];
    }
    const g = new THREE.Group();
    for (const p of this.rocketParts) g.add(new THREE.Mesh(p.geo, p.mat));
    g.scale.setScalar(1.3);
    return g;
  }

  /** Ce qu'on lance : une boule de bowling, une tarte à la crème, une bombe et sa mèche */
  private thrown(kind: "bowling" | "tarte" | "bombe"): THREE.Group {
    const g = new THREE.Group();
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      this.thrownParts.push(geo, mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = this.shadows;
      g.add(m);
      return m;
    };
    if (kind === "bowling") {
      make(
        new THREE.SphereGeometry(1.15, 24, 18),
        new THREE.MeshStandardMaterial({ color: 0x2a1a7a, roughness: 0.12, metalness: 0.35, emissive: 0x120a40 }),
      );
      const hole = new THREE.MeshStandardMaterial({ color: 0x07060f, roughness: 0.9 });
      for (const [x, y] of [
        [-0.26, 0.5],
        [0.26, 0.5],
        [0, 0.08],
      ] as const)
        make(new THREE.SphereGeometry(0.16, 10, 8), hole, x, y, 1.02);
    } else if (kind === "tarte") {
      make(new THREE.CylinderGeometry(0.72, 0.52, 0.24, 20), new THREE.MeshStandardMaterial({ color: 0xd9a35c, roughness: 0.8 }));
      const cream = make(
        new THREE.SphereGeometry(0.66, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.5 }),
        0,
        0.18,
        0,
      );
      cream.scale.y = 0.55;
      make(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc8202c, roughness: 0.3 }), 0, 0.56, 0);
    } else {
      make(new THREE.SphereGeometry(0.72, 18, 14), new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.3, metalness: 0.4 }));
      make(
        new THREE.CylinderGeometry(0.2, 0.26, 0.24, 12),
        new THREE.MeshStandardMaterial({ color: 0x4a4d55, roughness: 0.5 }),
        0,
        0.76,
        0,
      );
      make(
        new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0xc9b98a, roughness: 0.9 }),
        0.12,
        1.08,
        0,
      ).rotation.z = -0.5;
      make(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd36b }), 0.26, 1.34, 0);
      // Le cercle du danger, au sol, là où elle va sauter
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(BOMBE_RADIUS - 0.35, BOMBE_RADIUS, 40),
        new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
      );
      this.thrownParts.push(ring.geometry, ring.material as THREE.Material);
      ring.rotation.x = -Math.PI / 2;
      ring.name = "danger";
      g.add(ring);
    }
    return g;
  }

  /** Une explosion : une boule de feu, une onde qui s'étend au sol, de la fumée */
  explosion(x: number, y: number, z: number, radius: number) {
    this.boom(x, y, z, true);
    this.burst({ x, y: y + 1.5, z }, 0xffd27a, this.opts.reduced ? 8 : 26, 13);
    // La boule de feu : de grosses bouffées qui gonflent vite
    for (let i = 0; i < (this.opts.reduced ? 3 : 9); i++) {
      const a = Math.random() * Math.PI * 2;
      this.puff(
        x + Math.cos(a) * 2,
        y + 1 + Math.random() * 2,
        z + Math.sin(a) * 2,
        i % 2 ? 0xffe9a0 : 0xff8a2a,
        Math.cos(a) * 3,
        2.5,
        Math.sin(a) * 3,
        0.5,
        11,
        1,
        false,
      );
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffb347,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.2, z);
    this.scene.add(ring);
    this.pulses.push({ mesh: ring, life: 0.5, max: 0.5, radius });
    this.shakeNear(x, z, 26, 0.8);
  }

  /** La foudre : un éclair qui tombe du ciel sur ce point */
  bolt(x: number, y: number, z: number) {
    const pos: number[] = [];
    const index: number[] = [];
    let px = x;
    let pz = z;
    const steps = 12;
    const top = y + 46;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const py = top + (y + 0.6 - top) * f;
      const w = 0.75 * (1 - f * 0.6);
      // Deux rubans croisés : l'éclair se voit sous tous les angles
      pos.push(px - w, py, pz, px + w, py, pz, px, py, pz - w, px, py, pz + w);
      if (i < steps) {
        const a = i * 4;
        index.push(a, a + 1, a + 4, a + 1, a + 5, a + 4, a + 2, a + 3, a + 6, a + 3, a + 7, a + 6);
      }
      const jag = i === steps - 1 ? 0 : 3.2;
      px = i === steps - 1 ? x : x + (Math.random() - 0.5) * jag;
      pz = i === steps - 1 ? z : z + (Math.random() - 0.5) * jag;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xffffd8,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      }),
    );
    mesh.rotation.y = 0;
    this.scene.add(mesh);
    this.pulses.push({ mesh, life: 0.28, max: 0.28, radius: 0 });
    this.burst({ x, y: y + 1, z }, 0xbfe2ff, this.opts.reduced ? 5 : 16, 8);
  }

  /** Le ciel s'illumine devant la caméra, une gerbe de temps en temps */
  private launchFireworks(dt: number) {
    this.fireworkIn -= dt;
    if (this.fireworkIn > 0 || !this.camReady) return;
    this.fireworkIn = 0.8 + Math.random() * 0.9;
    const yaw = Math.atan2(this.camLook.x - this.camPos.x, this.camLook.z - this.camPos.z) + (Math.random() - 0.5) * 1;
    const far = 95 + Math.random() * 90;
    const x = this.camPos.x + Math.sin(yaw) * far;
    const z = this.camPos.z + Math.cos(yaw) * far;
    const y = this.camPos.y + 36 + Math.random() * 34;
    const palette = [0xff5a4f, 0xffd23a, 0x5ad1ff, 0x8affa0, 0xff8ae2, 0xc59bff, 0xffffff];
    const main = palette[Math.floor(Math.random() * palette.length)]!;
    const other = palette[Math.floor(Math.random() * palette.length)]!;
    const n = this.opts.reduced ? 12 : this.opts.phone ? 22 : 42;
    for (let i = 0; i < n; i++) {
      // Sur une sphère, à peu près régulièrement
      const u = (i + 0.5) / n;
      const up = 1 - 2 * u;
      const round = Math.sqrt(Math.max(0, 1 - up * up));
      const a = i * 2.39996;
      const s = 17 + Math.random() * 7;
      this.puff(x, y, z, i % 3 === 0 ? other : main, Math.cos(a) * round * s, up * s, Math.sin(a) * round * s, 1.05, 4.2, 1, true);
    }
    this.onLife?.("firework", 0.14 + Math.random() * 0.14);
  }

  /** Une secousse plus forte si ça se passe près de la caméra */
  private shakeNear(x: number, z: number, range: number, amount: number) {
    const d = Math.hypot(x - this.camPos.x, z - this.camPos.z);
    if (d < range) this.shake(amount * (1 - d / range));
  }

  /** Une gerbe de particules (une caisse qui éclate, une explosion) */
  burst(at: THREE.Vector3 | { x: number; y: number; z: number }, color: number, count: number, speed = 6) {
    if (this.opts.reduced) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.puff(at.x, at.y, at.z, color, Math.cos(a) * s, 2 + Math.random() * speed, Math.sin(a) * s, 0.7, 0.6);
    }
  }

  /** Une explosion de pétard ou un coup de klaxon */
  boom(x: number, y: number, z: number, big = true) {
    this.burst({ x, y: y + 1, z }, 0xffb347, big ? 18 : 8, big ? 9 : 5);
    for (let i = 0; i < (big ? 8 : 3); i++)
      this.puff(x, y + 1, z, 0x6b6460, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 1.4, 2.4);
  }

  /** Une onde de klaxon autour d'un kart */
  ring(x: number, y: number, z: number) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.puff(x, y + 0.8, z, 0xfff1a8, Math.cos(a) * 14, 0.5, Math.sin(a) * 14, 0.6, 1.2);
    }
  }

  /** Un nuage de poussière ou de neige derrière un kart dans l'herbe */
  dust(k: Kart) {
    if (this.opts.reduced || Math.random() > 0.5) return;
    const theme = this.track?.def.theme;
    const color = theme === "col" ? 0xf4f7fa : theme === "dunes" || theme === "lagon" ? 0xd9bf88 : theme === "volcan" ? 0x4a4040 : 0x9b8a6a;
    this.puff(
      k.x - Math.sin(k.h) * 1.2,
      k.y + 0.3,
      k.z - Math.cos(k.h) * 1.2,
      color,
      (Math.random() - 0.5) * 2,
      1 + Math.random(),
      (Math.random() - 0.5) * 2,
      0.8,
      1.8,
    );
  }

  private puff(
    x: number,
    y: number,
    z: number,
    color: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    grow: number,
    alpha = 1,
    heavy = grow < 1,
  ) {
    if (this.puffs.length >= MAX_PUFFS) return;
    let sprite = this.spare.pop();
    if (!sprite) {
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false }));
      this.scene.add(sprite);
    }
    // Les étincelles restent nettes ; la fumée et la poussière sont des volutes
    sprite.material.map = heavy ? this.puffTex : this.smokeTex;
    sprite.material.color.setHex(color);
    sprite.material.opacity = alpha;
    sprite.visible = true;
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(0.5);
    this.puffs.push({ sprite, vx, vy, vz, life, max: life, grow, heavy, alpha });
  }

  /** La fumée des pneus pendant un dérapage (pour tous les karts proches de la caméra) */
  private driftSmoke(k: Kart) {
    if (this.opts.reduced) return;
    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    for (const side of [-1, 1]) {
      const x = k.x - fx * 1.1 - fz * side * 0.85;
      const z = k.z - fz * 1.1 + fx * side * 0.85;
      this.puff(
        x,
        k.y + 0.25,
        z,
        0xe9e6e0,
        (Math.random() - 0.5) * 1.2,
        0.6 + Math.random() * 0.6,
        (Math.random() - 0.5) * 1.2,
        0.55,
        2.2,
        0.5,
        false,
      );
    }
  }

  /** Un mini-turbo lâché : une gerbe à sa couleur derrière le kart */
  turboBurst(k: Kart, level: 1 | 2 | 3) {
    const color = TURBO_COLORS[level - 1]!;
    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    const n = this.opts.reduced ? 5 : 8 + level * 5;
    for (let i = 0; i < n; i++) {
      const s = 3 + Math.random() * 4;
      this.puff(
        k.x - fx * 1.6,
        k.y + 0.7,
        k.z - fz * 1.6,
        i % 3 === 0 ? 0xffffff : color,
        -fx * s + (Math.random() - 0.5) * 3,
        1 + Math.random() * 2.5,
        -fz * s + (Math.random() - 0.5) * 3,
        0.45,
        0.9,
      );
    }
  }

  /** Un palier de mini-turbo atteint : un éclat d'étincelles à sa couleur sous les roues arrière */
  sparkFlash(k: Kart, level: 1 | 2 | 3) {
    const color = TURBO_COLORS[level - 1]!;
    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    for (const side of [-1, 1]) {
      const x = k.x - fx * 1.1 - fz * side * 0.85;
      const z = k.z - fz * 1.1 + fx * side * 0.85;
      for (let i = 0; i < (this.opts.reduced ? 2 : 5); i++) {
        this.puff(
          x,
          k.y + 0.3,
          z,
          i % 2 ? 0xffffff : color,
          (Math.random() - 0.5) * 5,
          2 + Math.random() * 3,
          (Math.random() - 0.5) * 5,
          0.35,
          0.5,
        );
      }
    }
  }

  /** Des confettis de toutes les couleurs, qui retombent doucement (une arrivée) */
  confetti(x: number, y: number, z: number) {
    const colors = [0xd8352a, 0x2f80ed, 0x27ae60, 0xf2c94c, 0x9b51e0, 0xf2994a, 0xffffff, 0xeb5ea8];
    for (let i = 0; i < (this.opts.reduced ? 12 : 40); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      this.puff(x, y + 5, z, colors[i % colors.length]!, Math.cos(a) * s, 3 + Math.random() * 4, Math.sin(a) * s, 2.2, 0.15, 1, false);
    }
  }

  /** Des étincelles contre un mur */
  wallSparks(k: Kart) {
    this.burst({ x: k.x, y: k.y + 0.5, z: k.z }, 0xffd27a, 9, 5);
  }

  /** La poussière (ou la neige) qui vole à l'atterrissage d'un saut */
  landDust(k: Kart) {
    if (this.opts.reduced) return;
    const landTheme = this.track?.def.theme;
    const color = landTheme === "col" ? 0xf4f7fa : landTheme === "volcan" ? 0x5a4a44 : landTheme === "dunes" ? 0xe0c896 : 0xcfc4ad;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.puff(
        k.x + Math.cos(a) * 1.2,
        k.y + 0.2,
        k.z + Math.sin(a) * 1.2,
        color,
        Math.cos(a) * 4,
        0.8,
        Math.sin(a) * 4,
        0.6,
        2.4,
        0.8,
        false,
      );
    }
  }

  /** Une figure réussie : une couronne d'étoiles autour du kart */
  trickSparkle(k: Kart) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.puff(k.x, k.y + k.air + 1, k.z, i % 2 ? 0xffe066 : 0xffffff, Math.cos(a) * 6, 1.5, Math.sin(a) * 6, 0.5, 0.7);
    }
  }

  /** Une secousse de la caméra (un choc), et un petit coup de zoom (un turbo) */
  shake(amount: number) {
    if (this.opts.reduced) return;
    this.shakeAmp = Math.min(1, this.shakeAmp + amount);
  }

  punch(fov: number) {
    this.fovKick = Math.min(14, this.fovKick + fov);
  }

  /** Une image */
  render(f: Frame) {
    const t = this.track;
    if (!t || !this.world) return;
    this.time += f.dt;
    this.adaptResolution(f.dt);
    f.karts.forEach((k, i) => this.karts[i]?.update(k.kart, f.dt, k, this.time));
    this.coins?.update(this.time, f.dt);
    this.crossers?.update(f.serverNow / 1000);
    if (this.life) for (const e of this.life.update(f.serverNow / 1000, this.camPos)) this.lifeEvent(e);
    f.karts.forEach((k, i) => {
      const under = k.kart.air < (t.water !== null ? Math.min(-0.5, t.water - k.kart.y) : -WATER_DEPTH);
      if (under && !this.drowned[i]) this.splash(k.kart);
      this.drowned[i] = under;
      // La route qui plonge sous la mer : une gerbe quand on entre, et une autre quand on ressort
      if (t.water !== null) {
        const above = k.kart.y + k.kart.air >= t.water;
        if (this.aboveSea[i] !== undefined && above !== this.aboveSea[i]) {
          const near = Math.max(0, 1 - Math.hypot(k.kart.x - this.camPos.x, k.kart.z - this.camPos.z) / 70);
          if (near > 0) {
            this.splash(k.kart);
            this.onLife?.("dive", 0.25 + 0.7 * near);
          }
        }
        this.aboveSea[i] = above;
      }
    });
    // La fumée des dérapages, une image sur deux, pour les karts pas trop loin
    this.smokeTick = (this.smokeTick + 1) % 2;
    if (this.smokeTick === 0) {
      for (const { kart } of f.karts) {
        if (kart.drift === 0 || kart.air > 0.2 || kart.spin > 0) continue;
        if (Math.hypot(kart.x - this.camPos.x, kart.z - this.camPos.z) < 70) this.driftSmoke(kart);
      }
    }
    // Les caisses tournent et flottent ; celles qui reviennent grossissent ; leur lueur passe par toutes les couleurs
    if (this.crates && this.crateMat) {
      this.crateMat.emissive.setHSL((this.time * 0.25) % 1, 0.9, 0.5);
      this.cratePos.forEach((p, i) => {
        const target = this.crateShown[i] ? 1 : 0;
        const s = this.crateScale[i]! + (target - this.crateScale[i]!) * Math.min(1, f.dt * (target ? 3 : 14));
        this.crateScale[i] = s;
        this.crateQ.setFromEuler(this.crateE.set(Math.sin(this.time + i) * 0.25, this.time * 1.4 + i, 0.3));
        this.crateS.setScalar(Math.max(0.001, s));
        this.tmp.set(p.x, p.y + Math.sin(this.time * 2 + i) * 0.15, p.z);
        this.crates!.setMatrixAt(i, this.crateM.compose(this.tmp, this.crateQ, this.crateS));
      });
      this.crates.instanceMatrix.needsUpdate = true;
    }
    // Les pétards filent le long de la route ; les fusées volent au-dessus, en fumant
    for (const { hz, mesh } of this.hazards.values()) {
      if (hz.kind === "bowling" || hz.kind === "tarte" || hz.kind === "bombe") {
        const p = hazardPos(t, hz, f.serverNow);
        mesh.visible = Boolean(p);
        if (!p) continue;
        if (hz.kind === "bowling") {
          mesh.position.set(p.x, p.y + 1.25, p.z);
          mesh.rotation.set((f.serverNow - hz.at) * 0.018, p.h, 0, "YXZ");
        } else if (hz.kind === "tarte") {
          mesh.position.set(p.x, p.y, p.z);
          mesh.rotation.set(Math.sin(this.time * 11) * 0.4, this.time * 8, 0);
        } else {
          mesh.position.set(p.x, p.y, p.z);
          const age = f.serverNow - hz.at;
          const ring = mesh.getObjectByName("danger");
          if (ring) {
            ring.visible = age > 500;
            ring.position.y = 0.2 - (p.y - (pointAt(t, hz.s, hz.d).y + 0.55));
            const mat = (ring as THREE.Mesh).material as THREE.MeshBasicMaterial;
            mat.opacity = 0.35 + 0.35 * Math.abs(Math.sin(age * 0.012));
          }
        }
        continue;
      }
      if (hz.kind === "fusee") {
        const p = hazardPos(t, hz, f.serverNow);
        mesh.visible = Boolean(p);
        if (!p) continue;
        mesh.position.set(p.x, p.y + Math.sin(this.time * 9) * 0.15, p.z);
        mesh.rotation.set(0, p.h, Math.sin(this.time * 14) * 0.3);
        this.puff(
          p.x,
          p.y,
          p.z,
          Math.random() < 0.3 ? 0xffc46b : 0xd9d4cc,
          (Math.random() - 0.5) * 0.6,
          0.4,
          (Math.random() - 0.5) * 0.6,
          0.9,
          2.2,
          0.7,
          false,
        );
        continue;
      }
      if (hz.kind !== "petard") continue;
      const p = hazardPos(t, hz, f.serverNow);
      if (!p) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(p.x, p.y + 0.7, p.z);
      mesh.rotation.y = p.h;
      if (Math.random() < 0.7) this.puff(p.x, p.y + 0.7, p.z, Math.random() < 0.5 ? 0xffd27a : 0xb0aaa4, 0, 0.6, 0, 0.5, 1.6);
    }
    // Les ondes d'explosion s'étendent ; les éclairs s'éteignent
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i]!;
      p.life -= f.dt;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        mat.dispose();
        this.pulses.splice(i, 1);
        continue;
      }
      const age = 1 - p.life / p.max;
      if (p.radius > 0) p.mesh.scale.setScalar(1 + age * p.radius);
      mat.opacity = 1 - age;
    }
    // Les particules : elles bougent, grossissent, pâlissent, puis retournent dans la réserve
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.life -= f.dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        this.spare.push(p.sprite);
        this.puffs.splice(i, 1);
        continue;
      }
      p.vy -= 6 * f.dt * (p.heavy ? 1 : 0.1);
      const drag = p.heavy ? 1 : Math.exp(-f.dt * 2.5);
      p.vx *= drag;
      p.vz *= drag;
      p.sprite.position.x += p.vx * f.dt;
      p.sprite.position.y += p.vy * f.dt;
      p.sprite.position.z += p.vz * f.dt;
      const age = 1 - p.life / p.max;
      p.sprite.scale.setScalar(0.5 + age * p.grow);
      p.sprite.material.opacity = p.alpha * (1 - age);
    }
    if (f.fireworks) this.launchFireworks(f.dt);
    if (f.camera === "podium" && this.podium) {
      this.podiumT += f.dt;
      this.podium.update(this.time);
      this.confettiIn -= f.dt;
      if (this.confettiIn <= 0) {
        this.confettiIn = 0.55;
        const p = this.podium;
        const across = (Math.random() - 0.5) * 11;
        this.confetti(p.x + p.sx * across, p.y + 2.2, p.z + p.sz * across);
      }
    }
    // Des bulles derrière ceux qui roulent sous l'eau
    if (t.water !== null && !this.opts.reduced) {
      this.bubbleTick = (this.bubbleTick + 1) % 3;
      if (this.bubbleTick === 0) {
        for (const { kart } of f.karts) {
          if (kart.y + kart.air >= t.water - 0.3 || Math.hypot(kart.x - this.camPos.x, kart.z - this.camPos.z) > 50) continue;
          this.puff(
            kart.x - Math.sin(kart.h) * 1.5,
            kart.y + 0.7,
            kart.z - Math.cos(kart.h) * 1.5,
            0xffffff,
            (Math.random() - 0.5) * 1.2,
            2.6,
            (Math.random() - 0.5) * 1.2,
            0.7,
            0.16,
            0.7,
            false,
          );
        }
      }
    }
    this.aim?.update(f.aim ?? null, this.time, this.camPos);
    // L'aspiration : l'air qui file autour du kart suivi
    if ((f.draft ?? 0) > 0.15 && f.follow >= 0 && !this.opts.reduced) {
      const k = f.karts[f.follow]?.kart;
      if (k) {
        const fx = Math.sin(k.h);
        const fz = Math.cos(k.h);
        const side = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.1);
        const ahead = 2 + Math.random() * 7;
        this.puff(
          k.x + fx * ahead + fz * side,
          k.y + 0.5 + Math.random() * 1.3,
          k.z + fz * ahead - fx * side,
          0xffffff,
          0,
          0,
          0,
          0.22,
          0.9,
          0.55,
          false,
        );
      }
    }
    this.moveCamera(f);
    this.world.update(this.time, this.camera.position, this.daylight);
    if (f.lights !== this.lightsShown) {
      this.lightsShown = f.lights;
      this.world.setLights(f.lights);
    }
    // Dans un tunnel, le jour baisse (les lampes, elles, brillent toujours)
    const followed = f.follow >= 0 ? f.karts[f.follow]?.kart : undefined;
    const inside =
      f.camera === "chase" && followed !== undefined && this.world.tunnels.some(([a, b]) => followed.s > a + 4 && followed.s < b - 2);
    this.daylight += ((inside ? 0.38 : 1) - this.daylight) * Math.min(1, f.dt * 4);
    const { hemiPower, sunPower } = this.world.mood;
    this.hemi.intensity = hemiPower * this.daylight;
    this.sun.intensity = sunPower * this.daylight;
    this.scene.environmentIntensity = 0.75 * (0.45 + 0.55 * this.daylight);
    // Les étiquettes des autres : ni trop près ni trop loin ; un kart collé à la caméra s'efface pour ne pas boucher la vue
    f.karts.forEach((k, i) => {
      const d = this.camPos.distanceTo(this.tmp.set(k.kart.x, k.kart.y + 0.8, k.kart.z));
      this.karts[i]?.showTag(d > 10 && d < 90);
      // Celui qui vient d'être touché clignote : on voit qu'il est intouchable un moment
      const blink = k.safe && Math.sin(this.time * 24) > 0 ? 0.35 : 1;
      this.karts[i]?.fade(blink * (i === f.follow || f.camera !== "chase" ? 1 : Math.max(0, Math.min(1, (d - 2.6) / 2.6))));
    });
    this.setUnderwater(t.water !== null && this.camera.position.y < t.water);
    this.marks?.update(f.karts, this.time, this.camPos);
    this.trails?.update(f.karts, this.time, this.camPos);
    if (this.finish) {
      const k = f.follow >= 0 ? f.karts[f.follow]?.kart : undefined;
      const want = !k || f.camera !== "chase" ? 0 : (k.boost > 0 ? 0.075 : 0) + Math.max(0, k.v - 24) * 0.0016 + (k.glide ? 0.02 : 0);
      this.speedBlur += (want - this.speedBlur) * Math.min(1, f.dt * 7);
      this.finish.uniforms.uBlur!.value = this.speedBlur;
    }
    if (this.composer) this.composer.render(f.dt);
    else this.renderer.render(this.scene, this.camera);
  }

  private moveCamera(f: Frame) {
    const t = this.track!;
    const dt = f.dt;
    const portrait = this.camera.aspect < 0.9;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let fov = portrait ? 74 : 62;
    const target = f.follow >= 0 ? f.karts[f.follow]?.kart : undefined;
    if (f.camera === "intro" || !target) {
      // Le survol : on arrive de loin, haut au-dessus de la route, vers la grille, et on finit derrière elle
      const u = Math.max(0, Math.min(1, f.introT));
      const e = u * u * (3 - 2 * u);
      const s = 150 - e * 205;
      const side = 16 * (1 - e);
      const p = pointAt(t, s, side);
      const grid = pointAt(t, -16, 0);
      pos = this.tmpPos.set(p.x, p.y + 30 - e * 23, p.z);
      look = this.tmpLook.set(grid.x, grid.y + 1, grid.z);
    } else if (f.camera === "orbit") {
      const a = this.time * 0.3;
      pos = this.tmpPos.set(target.x + Math.cos(a) * 9, target.y + 4, target.z + Math.sin(a) * 9);
      look = this.tmpLook.set(target.x, target.y + 1, target.z);
    } else if (f.camera === "podium" && this.podium) {
      // Face au podium : on s'approche en glissant de côté, puis on continue de bouger un peu
      const p = this.podium;
      const u = Math.min(1, this.podiumT / 6);
      const e = u * u * (3 - 2 * u);
      const a = -0.6 + e * 0.92 + Math.sin(Math.max(0, this.podiumT - 6) * 0.28) * 0.16;
      const r = (portrait ? 27 : 20) - e * (portrait ? 4 : 3);
      const out = Math.cos(a) * r;
      const across = Math.sin(a) * r;
      pos = this.tmpPos.set(p.x + p.fx * out + p.sx * across, p.y + 3.7 - e * 1.1, p.z + p.fz * out + p.sz * across);
      look = this.tmpLook.set(p.x, p.y + 2.4, p.z);
      fov = portrait ? 58 : 40;
    } else {
      // Derrière le kart, assez près et assez bas pour bien le voir : le cap de la caméra suit celui du kart en
      // douceur, sa hauteur aussi (les bosses, les sauts), mais elle ne prend pas de retard quand il file
      if (!this.chasing) {
        this.camYaw = target.h;
        this.camY = target.y;
      }
      this.camYaw += wrapAngle(target.h - this.camYaw) * (1 - Math.exp(-dt * 5));
      // Elle ne descend pas dans un trou : elle reste au bord, et regarde le kart tomber
      const air = Math.max(0, target.air);
      const sink = Math.min(0, target.air);
      // En deltaplane, on prend de la hauteur sans trop s'éloigner
      const lift = Math.min(target.glide ? 2.6 : 8, air);
      this.camY += (target.y + air * 0.85 - this.camY) * (1 - Math.exp(-dt * 6));
      // En l'air, elle prend un peu de recul et de hauteur pour bien montrer le saut
      const back = (portrait ? 7.4 : 6.3) + lift * 0.6;
      // Plus haut sous un deltaplane : on voit l'aile par-dessus, et le vide en dessous
      const up = (portrait ? 3.1 : 2.55) + lift * 0.5 + (target.glide ? 1.5 : 0);
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      // Regarder derrière soi : la caméra passe devant le kart
      const way = f.lookBack ? -1 : 1;
      pos = this.tmpPos.set(target.x - fx * back * way, this.camY + up, target.z - fz * back * way);
      look = this.tmpLook.set(target.x + fx * 6 * way, this.camY + 1.25 + sink * 0.9, target.z + fz * 6 * way);
      if (Boolean(f.lookBack) !== this.lookingBack) {
        this.lookingBack = Boolean(f.lookBack);
        this.camPos.copy(pos);
        this.camLook.copy(look);
      }
      fov += Math.max(0, Math.min(12, (target.v - 20) * 0.6)) + (target.boost > 0 ? 6 : 0) + (target.glide ? 5 : 0);
    }
    const chase = f.camera === "chase" && Boolean(target);
    if (!this.camReady) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.camReady = true;
    }
    // En poursuite, la caméra colle à sa place (un léger lissage seulement) ; sinon elle glisse doucement
    this.chaseT = chase ? this.chaseT + dt : 0;
    const k = 1 - Math.exp(-dt * (chase ? 3 + 21 * Math.min(1, this.chaseT / 1.2) ** 2 : 2.5));
    this.chasing = chase;
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, Math.min(1, k * 1.6));
    if (f.camera === "podium") {
      this.camPos.copy(pos);
      this.camLook.copy(look);
    }
    // Jamais sous le terrain
    const ground = this.world!.heightAt(this.camPos.x, this.camPos.z);
    if (this.camPos.y < ground + 1.2) this.camPos.y = ground + 1.2;
    this.camera.position.copy(this.camPos);
    this.shakeAmp *= Math.exp(-dt * 7);
    this.fovKick *= Math.exp(-dt * 3);
    if (this.shakeAmp > 0.01) {
      const a = this.shakeAmp * 0.32;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.position.z += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.camLook);
    fov += this.fovKick;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
    // L'ombre suit la caméra
    const sunAt = this.world!.mood.dir;
    this.sun.position.set(this.camLook.x + sunAt.x * 130, this.camLook.y + sunAt.y * 130, this.camLook.z + sunAt.z * 130);
    this.sun.target.position.copy(this.camLook);
  }

  /** La cérémonie commence : le podium apparaît, la route se vide. Rend la place de chacun, du premier au dernier */
  startPodium(count: number): PodiumSpot[] {
    const t = this.track;
    if (!t) return [];
    if (!this.podium) {
      this.podium = new Podium(
        t,
        <T extends { dispose: () => void }>(x: T): T => {
          this.featureKeep.push(x);
          return x;
        },
        this.shadows,
      );
      this.scene.add(this.podium.group);
    }
    this.podiumT = 0;
    this.confettiIn = 0;
    if (this.crates) this.crates.visible = false;
    if (this.coins) this.coins.mesh.visible = false;
    return this.podium.spots(count);
  }

  /** Où est un point de la scène à l'écran (en pixels du conteneur), ou null s'il est derrière la caméra */
  project(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.container.clientWidth, y: ((1 - v.y) / 2) * this.container.clientHeight };
  }

  dispose() {
    this.resize.disconnect();
    for (const k of this.karts) k.dispose();
    this.world?.dispose();
    this.crateMat?.map?.dispose();
    this.crateMat?.dispose();
    this.crateGeo?.dispose();
    this.oilMat.dispose();
    this.petardGeo.dispose();
    this.petardMat.dispose();
    for (const p of this.rocketParts) {
      p.geo.dispose();
      p.mat.dispose();
    }
    for (const d of this.thrownParts) d.dispose();
    this.puffTex.dispose();
    this.smokeTex.dispose();
    this.envTex?.dispose();
    this.composer?.dispose();
    this.bloom?.dispose();
    this.vignette.remove();
    for (const d of this.featureKeep) d.dispose();
    for (const p of this.puffs) p.sprite.material.dispose();
    for (const s of this.spare) s.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
