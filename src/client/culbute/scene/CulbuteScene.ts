// La scène d'un combat : l'arène, les combattants, ce qui vole, les objets, les étincelles et les éjections, et une
// caméra de côté qui garde tout le monde à l'écran en s'approchant quand on se bat de près.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ARENAS, blastOf, type ArenaId, type PlatformNow } from "../../../shared/games/culbute/arenas.ts";
import { INTRO_FRAMES } from "../../../shared/games/culbute/engine.ts";
import type { FightEvent, ItemKind } from "../../../shared/games/culbute/model.ts";
import { headCanvas } from "../../bolides/scene/faces.ts";
import { AutoQuality } from "../../lib/autoQuality.ts";
import { AIM_CENTER } from "../controls.ts";
import type { RenderFrame } from "../runtime.ts";
import { buildArena, type ArenaScene } from "./arenas3d.ts";
import { FighterModel, type FighterLook } from "./fighter.ts";
import { itemModel, shotModel, std, type Keep } from "./props.ts";

export type { FighterLook } from "./fighter.ts";

interface Effect {
  obj: THREE.Object3D;
  age: number;
  life: number;
  tick: (k: number, dt: number) => void;
}

const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(0xffffff);

/** La bulle d'un combattant hors du cadre : un rond à sa couleur, cerclé de blanc, avec une pointe vers le haut */
function bubbleTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(64, 4);
  g.lineTo(84, 34);
  g.lineTo(44, 34);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(64, 70, 46, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 70, 39, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.beginPath();
  g.arc(52, 56, 14, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CulbuteScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 220);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6);
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  /** La finesse de l'image, et les ombres : allégées d'elles-mêmes si l'appareil peine (voir AutoQuality) */
  private baseRatio = Math.min(window.devicePixelRatio || 1, TOUCH ? 1.25 : 1.75);
  private quality = new AutoQuality({ levers: ["pixels", "pixels", "ombres"], apply: (on) => this.applyQuality(on) });
  private arena!: ArenaScene;
  private arenaKeep: { dispose: () => void }[] = [];
  private arenaId: ArenaId;
  private scale: number;
  private fighters: FighterModel[] = [];
  private looks: FighterLook[] = [];
  private shots = new Map<number, THREE.Object3D>();
  private items = new Map<number, THREE.Object3D>();
  private traps = new Map<number, THREE.Object3D>();
  private pads: THREE.Object3D[] = [];
  private lasso: THREE.Mesh;
  private effects: Effect[] = [];
  private keepList: { dispose: () => void }[] = [];
  private keep: Keep;
  /** Un modèle de chaque sorte d'objet (tir, objet à ramasser, piège, estrade), copié à chaque apparition : les copies
   * partagent ses géométries et ses matières, qui ne s'entassent donc pas au fil des combats */
  private protos = new Map<string, THREE.Object3D>();
  private time = 0;
  private shake = 0;
  private camPos = new THREE.Vector3(0, 3, 26);
  private camLook = new THREE.Vector3(0, 2, 0);
  /** De quoi calculer à chaque image sans rien créer (le ramasse-miettes n'a rien à balayer derrière) */
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private picker = new THREE.Raycaster();
  /** La visée à la souris : le repère autour de son combattant (la flèche du coup qui partira, ou un rond sur lui) */
  private aimMark = new THREE.Group();
  private aimArrow: THREE.Mesh;
  private aimDot: THREE.Mesh;
  private aim: { slot: number; v: [number, number] } | null = null;
  private tmpColor = new THREE.Color();
  private seen = new Set<number>();
  private trailAt = new Map<number, number>();
  /** Sous chaque combattant, une ombre ronde sur la plateforme où il retombera */
  private blobs: THREE.Mesh[] = [];
  private blobMat: THREE.MeshBasicMaterial;
  private envMap: THREE.Texture | null = null;
  private blobGeo: THREE.BufferGeometry | null = null;
  private starGeo: THREE.ShapeGeometry | null = null;
  private ringGeo: THREE.RingGeometry | null = null;
  private rayGeo: THREE.PlaneGeometry | null = null;
  private smokeTex: THREE.CanvasTexture | null = null;
  private haloTex: THREE.CanvasTexture | null = null;
  private grounded: boolean[] = [];
  private lastXs: number[] = [];
  private dustAt: number[] = [];
  /** La charge de chacun : la dernière étincelle aspirée, et s'il a déjà jeté l'éclair de la charge pleine */
  private chargeAt: number[] = [];
  private chargeFull: boolean[] = [];
  /** Les enchaînements : qui a touché chacun en dernier, combien de fois d'affilée, et jusqu'à quand ça compte (en ms) */
  private combo: { by: number; n: number; until: number }[] = [];
  /** Le compte affiché au-dessus de chacun (le suivant le remplace) */
  private comboShown: THREE.Sprite[] = [];
  /** Le coup qui fait sortir : la caméra plonge sur l'impact le temps de l'arrêt sur image */
  private koCam: { x: number; y: number; age: number } | null = null;
  /** Par-dessus l'image : les bulles des combattants sortis du cadre, au bord de l'écran, tournées vers eux */
  private overlay = new THREE.Scene();
  private overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private bubbles: THREE.Sprite[] = [];
  /** Les combattants déjà arrivés pendant l'introduction */
  private landed = new Set<number>();
  /** Une caméra posée à la main (la page de travail, les vitrines) : sinon elle suit le combat */
  fixedCam: { x: number; y: number; z: number; tx: number; ty: number; tz: number } | null = null;

  constructor(host: HTMLElement, arena: ArenaId, scale: number, looks: FighterLook[]) {
    this.keep = <T extends { dispose: () => void }>(x: T) => {
      this.keepList.push(x);
      return x;
    };
    this.renderer = new THREE.WebGLRenderer({ antialias: !TOUCH, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.baseRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "culbute-canvas";
    host.appendChild(this.renderer.domElement);
    this.sun.position.set(6, 14, 10);
    this.sun.castShadow = true;
    const size = TOUCH ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const cam = this.sun.shadow.camera;
    cam.left = -22;
    cam.right = 22;
    cam.top = 16;
    cam.bottom = -12;
    cam.near = 1;
    cam.far = 50;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    // Un éclairage d'ambiance venu de partout : les volumes des combattants se lisent mieux
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      this.scene.environment = this.envMap;
    } catch {
      // Sans carte d'environnement, la lumière du soleil et du ciel suffit
    }
    const blobTex = new THREE.CanvasTexture(
      (() => {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const g = c.getContext("2d")!;
        const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, "rgba(0,0,0,0.55)");
        grd.addColorStop(0.6, "rgba(0,0,0,0.3)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
        return c;
      })(),
    );
    this.blobMat = this.keep(new THREE.MeshBasicMaterial({ map: this.keep(blobTex), transparent: true, depthWrite: false }));
    this.arenaId = arena;
    this.scale = scale;
    this.buildArena();
    this.lasso = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.025, 0.025, 1, 5)), this.keep(std(0xe86aa6, 0.9)));
    this.lasso.geometry.translate(0, 0.5, 0);
    this.lasso.visible = false;
    this.scene.add(this.lasso);
    // Une flèche jaune bordée de sombre (lisible sur le ciel comme sur les murs clairs), un rond sur lui
    const aimMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xffcf3a, transparent: true, opacity: 0.92, depthTest: false }));
    const aimEdge = this.keep(new THREE.MeshBasicMaterial({ color: 0x2a1d0e, transparent: true, opacity: 0.7, depthTest: false }));
    const tri = new THREE.Shape();
    tri.moveTo(0.24, 0);
    tri.lineTo(-0.09, 0.19);
    tri.lineTo(-0.09, -0.19);
    tri.closePath();
    const triGeo = this.keep(new THREE.ShapeGeometry(tri));
    this.aimArrow = new THREE.Mesh(triGeo, aimMat);
    const arrowEdge = new THREE.Mesh(triGeo, aimEdge);
    arrowEdge.scale.setScalar(1.4);
    arrowEdge.position.x = -0.03;
    arrowEdge.renderOrder = 9;
    this.aimArrow.add(arrowEdge);
    this.aimDot = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.44, 0.53, 32)), aimMat);
    const dotEdge = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.4, 0.57, 32)), aimEdge);
    dotEdge.renderOrder = 9;
    this.aimDot.add(dotEdge);
    this.aimMark.add(this.aimArrow, this.aimDot);
    this.aimArrow.renderOrder = 10;
    this.aimDot.renderOrder = 10;
    this.aimMark.visible = false;
    this.scene.add(this.aimMark);
    this.setLooks(looks);
  }

  /** Le point du plan des combattants sous ce point de la fenêtre (en mètres), null si l'écran n'est pas là */
  worldAt(clientX: number, clientY: number): [number, number] | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    this.picker.setFromCamera(
      new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1),
      this.camera,
    );
    const o = this.picker.ray.origin;
    const d = this.picker.ray.direction;
    if (Math.abs(d.z) < 1e-6) return null;
    const t = -o.z / d.z;
    return [o.x + d.x * t, o.y + d.y * t];
  }

  /** La visée de ce combattant : vers où partira son coup ([0, 0] : sur lui, le coup sans direction ; null : on ne vise pas) */
  setAim(slot: number, v: [number, number] | null) {
    this.aim = v ? { slot, v } : null;
    this.renderer.domElement.style.cursor = v ? "crosshair" : "";
  }

  /** Le repère de visée autour du combattant : la flèche dans la direction du coup (haut, bas, côté), un rond sur lui */
  private placeAim(f: RenderFrame["fighters"][number]) {
    const v = this.aim!.v;
    const alive = f.state !== "dead" && f.state !== "out" && f.state !== "respawn";
    this.aimMark.visible = alive;
    if (!alive) return;
    this.aimMark.position.set(f.x, f.y + AIM_CENTER, 0.6);
    const neutral = v[0] === 0 && v[1] === 0;
    this.aimDot.visible = neutral;
    this.aimArrow.visible = !neutral;
    if (neutral) return;
    // La direction du coup qui partira, comme le combat la lit : vers le haut, vers le bas, ou de côté
    const ang =
      v[1] > 0.55 && v[1] >= Math.abs(v[0]) ? Math.PI / 2 : v[1] < -0.55 && -v[1] >= Math.abs(v[0]) ? -Math.PI / 2 : v[0] < 0 ? Math.PI : 0;
    // (vers le haut, au-dessus de l'étiquette « Toi »)
    const rad = ang > 1 ? 1.78 : 1.12;
    this.aimArrow.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, 0);
    this.aimArrow.rotation.z = ang;
  }

  private buildArena() {
    if (this.arena) {
      this.scene.remove(this.arena.group, this.arena.dome);
      for (const d of this.arenaKeep) d.dispose();
      this.arenaKeep = [];
    }
    const keep: Keep = <T extends { dispose: () => void }>(x: T) => {
      this.arenaKeep.push(x);
      return x;
    };
    this.arena = buildArena(this.arenaId, this.scale, keep);
    this.scene.add(this.arena.group, this.arena.dome);
    this.scene.background = this.arena.fog;
    this.scene.fog = new THREE.Fog(this.arena.fog, 42, 120);
    const l = this.arena.light;
    this.hemi.color.setHex(l.sky);
    this.hemi.groundColor.setHex(l.ground);
    this.hemi.intensity = l.ambient * 0.95;
    this.sun.color.setHex(l.sunColor);
    this.sun.intensity = l.sun;
    this.scene.environmentIntensity = l.env;
  }

  setArena(id: ArenaId, scale: number) {
    if (id === this.arenaId && scale === this.scale) return;
    this.arenaId = id;
    this.scale = scale;
    this.buildArena();
  }

  setLooks(looks: FighterLook[]) {
    for (const f of this.fighters) {
      this.scene.remove(f.group, f.trail);
      f.dispose();
    }
    for (const p of this.pads) this.scene.remove(p);
    for (const b of this.blobs) this.scene.remove(b);
    for (const b of this.bubbles) {
      this.overlay.remove(b);
      b.material.map?.dispose();
      b.material.dispose();
    }
    this.bubbles = looks.map((l) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(l.color), transparent: true, depthTest: false }));
      sprite.visible = false;
      this.overlay.add(sprite);
      return sprite;
    });
    this.looks = looks;
    this.fighters = looks.map((l) => new FighterModel(l));
    this.pads = looks.map(() => this.respawnPad());
    if (!this.blobGeo) this.blobGeo = this.keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    this.blobs = looks.map(() => new THREE.Mesh(this.blobGeo!, this.blobMat));
    for (const f of this.fighters) this.scene.add(f.group, f.trail);
    for (const p of this.pads) this.scene.add(p);
    for (const b of this.blobs) this.scene.add(b);
    // Les visages arrivent un peu après (dessinés à part)
    looks.forEach((l, i) => {
      void headCanvas(l.avatar).then((c) => {
        if (this.looks === looks) this.fighters[i]?.setHead(c);
      });
    });
  }

  /** L'estrade volante où l'on revient après une sortie : une planche et deux ballons */
  /** Une copie du modèle de cette sorte, fait la première fois */
  private copyOf(key: string, make: () => THREE.Object3D): THREE.Object3D {
    let proto = this.protos.get(key);
    if (!proto) {
      proto = make();
      this.protos.set(key, proto);
    }
    return proto.clone();
  }

  private respawnPad(): THREE.Object3D {
    return this.copyOf("estrade", () => this.padModel());
  }

  private padModel(): THREE.Object3D {
    const g = new THREE.Group();
    const keep = this.keep;
    const board = new THREE.Mesh(keep(new THREE.BoxGeometry(1.3, 0.14, 0.9)), keep(std(0xb07a4f, 0.8)));
    board.position.y = -0.07;
    g.add(board);
    const colors = [0xe2483d, 0x3f7fd8];
    for (const side of [-1, 1]) {
      const string = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.008, 0.008, 2.2, 3)), keep(std(0xffffff, 0.9)));
      string.position.set(side * 0.55, 1.1, -0.35);
      g.add(string);
      const balloon = new THREE.Mesh(keep(new THREE.SphereGeometry(0.32, 14, 10)), keep(std(colors[side < 0 ? 0 : 1]!, 0.35)));
      balloon.scale.y = 1.2;
      balloon.position.set(side * 0.55, 2.4, -0.35);
      g.add(balloon);
    }
    g.visible = false;
    return g;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.overlayCam.left = -this.camera.aspect;
    this.overlayCam.right = this.camera.aspect;
    this.overlayCam.updateProjectionMatrix();
  }

  /** Un peu moins de pixels, puis encore moins, puis plus d'ombres portées (les ombres rondes restent sous les pieds) */
  private applyQuality(on: readonly boolean[]) {
    this.renderer.setPixelRatio(this.baseRatio * (on[1] ? 0.68 : on[0] ? 0.82 : 1));
    this.renderer.shadowMap.enabled = !on[2];
    this.sun.castShadow = !on[2];
  }

  /** Rien encore à montrer : l'arène seule */
  renderIdle(dt: number) {
    this.quality.tick(performance.now());
    this.time += dt;
    this.arena.update(this.time, []);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.arena.dome.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  render(dt: number, frame: RenderFrame) {
    this.quality.tick(performance.now());
    this.time += dt;
    this.arena.update(this.time, frame.plats);
    this.aimMark.visible = false;
    frame.fighters.forEach((raw, i) => {
      const m = this.fighters[i];
      if (!m) return;
      const f = this.entrance(raw, i, frame.frame);
      m.teeter = teeterSide(f, frame.plats);
      m.update(dt, f, this.time);
      if (this.aim?.slot === i) this.placeAim(f);
      this.placeBlob(i, f, frame.plats);
      this.dust(i, f, dt);
      this.charging(i, f);
      const pad = this.pads[i]!;
      pad.visible = f.state === "respawn";
      if (pad.visible) pad.position.set(f.x, f.y + Math.sin(this.time * 2) * 0.03, 0);
      // Envoyé loin : une traînée de fumée derrière lui
      if (f.state === "hurt" && f.kb > 16) {
        const at = this.trailAt.get(i) ?? 0;
        if (this.time - at > 0.035) {
          this.trailAt.set(i, this.time);
          // Teintée à sa couleur : on voit tout de suite qui s'envole
          const tint = this.tmpColor
            .set(this.looks[i]?.color ?? "#ffffff")
            .lerp(WHITE, 0.55)
            .getHex();
          this.puff(f.x, f.y + 0.7, tint, 0.3 + Math.min(0.4, f.kb / 80), 0.55);
        }
      }
    });
    this.syncShots(frame, dt);
    this.syncItems(frame);
    this.syncTraps(frame);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      e.age += dt;
      const k = Math.min(1, e.age / e.life);
      e.tick(k, dt);
      if (k >= 1) {
        this.scene.remove(e.obj);
        this.effects.splice(i, 1);
      }
    }
    this.updateCamera(dt, frame);
    this.arena.dome.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    if (this.placeBubbles(frame)) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.overlay, this.overlayCam);
      this.renderer.autoClear = true;
    }
  }

  /** Les combattants hors du cadre : une bulle au bord, la pointe vers eux, d'autant plus petite qu'ils sont loin */
  private placeBubbles(frame: RenderFrame): boolean {
    let any = false;
    const aspect = this.camera.aspect;
    const p = this.tmpA;
    frame.fighters.forEach((f, i) => {
      const b = this.bubbles[i];
      if (!b) return;
      b.visible = false;
      if (f.state === "dead" || f.state === "out") return;
      p.set(f.x, f.y + 0.8, 0).project(this.camera);
      if (Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1) return;
      const over = Math.max(Math.abs(p.x), Math.abs(p.y));
      const cx = Math.max(-0.88, Math.min(0.88, p.x)) * aspect;
      const cy = Math.max(-0.82, Math.min(0.82, p.y));
      b.position.set(cx, cy, 0);
      b.material.rotation = Math.atan2(p.y - cy, p.x * aspect - cx) - Math.PI / 2;
      const size = Math.max(0.13, 0.22 - (over - 1) * 0.05);
      b.scale.set(size, size, 1);
      b.visible = true;
      any = true;
    });
    return any;
  }

  /**
   * L'entrée en scène, pendant le compte à rebours : chacun tombe du ciel à son tour, et atterrit dans la poussière
   * (seulement à l'affichage : le combat, lui, les a déjà posés)
   */
  private entrance(f: RenderFrame["fighters"][number], i: number, frame: number): RenderFrame["fighters"][number] {
    if (frame >= INTRO_FRAMES || f.state === "dead" || f.state === "out") return f;
    const start = 12 + i * 9;
    const k = (frame - start) / 26;
    if (k >= 1) {
      if (!this.landed.has(i)) {
        this.landed.add(i);
        this.puff(f.x - 0.4, f.y + 0.15, 0xe6dccb, 0.3, 0.6);
        this.puff(f.x + 0.4, f.y + 0.15, 0xe6dccb, 0.3, 0.6);
      }
      return f;
    }
    this.landed.delete(i);
    const drop = k < 0 ? 40 : (1 - k) * (1 - k) * 11;
    return { ...f, y: f.y + drop, state: "air" };
  }

  /** L'ombre ronde : sur la plateforme juste sous ses pieds, plus petite et plus pâle quand il est haut */
  private placeBlob(i: number, f: RenderFrame["fighters"][number], plats: PlatformNow[]) {
    const b = this.blobs[i];
    if (!b) return;
    let floor = -Infinity;
    for (const p of plats) if (f.x >= p.x0 - 0.1 && f.x <= p.x1 + 0.1 && p.y <= f.y + 0.05 && p.y > floor) floor = p.y;
    const visible = f.state !== "dead" && f.state !== "out" && Number.isFinite(floor);
    b.visible = visible;
    if (!visible) return;
    const h = f.y - floor;
    const k = Math.max(0.25, 1 - h / 7);
    b.position.set(f.x, floor + 0.015, 0);
    b.scale.set(1.15 * k, 1, 0.7 * k);
  }

  private syncShots(frame: RenderFrame, dt: number) {
    const seen = this.seen;
    seen.clear();
    let lasso: RenderFrame["shots"][number] | null = null;
    for (const s of frame.shots) {
      seen.add(s.id);
      let obj = this.shots.get(s.id);
      if (!obj) {
        obj = this.copyOf(`tir:${s.kind}`, () => shotModel(s.kind, this.keep));
        this.shots.set(s.id, obj);
        this.scene.add(obj);
      }
      obj.position.set(s.x, s.y, 0);
      switch (s.kind) {
        case "chaise":
          obj.rotation.z += dt * 14;
          break;
        case "pelote":
        case "boule":
        case "roulee":
        case "tir":
          obj.rotation.z -= (s.vx * dt) / 0.3;
          break;
        case "souffle":
          obj.rotation.x += dt * 8;
          obj.scale.setScalar(0.8 + Math.min(1, s.t / 20) * 0.6);
          break;
        case "note":
          obj.position.y += Math.sin(s.t * 0.5) * 0.15;
          obj.rotation.z = Math.sin(s.t * 0.3) * 0.3;
          break;
        case "lasso":
          lasso = s;
          break;
        case "tarte":
        case "petard":
        case "pot":
          obj.rotation.z -= dt * 9 * Math.sign(s.vx || 1);
          break;
      }
    }
    for (const [id, obj] of this.shots) {
      if (seen.has(id)) continue;
      this.scene.remove(obj);
      this.shots.delete(id);
    }
    // Le fil du lasso, de la main de Huguette à la boucle
    this.lasso.visible = lasso !== null;
    if (lasso) {
      const owner = frame.fighters[lasso.owner];
      if (owner) {
        const a = this.tmpA.set(owner.x + owner.face * 0.4, owner.y + 1, 0);
        const d = this.tmpB.set(lasso.x, lasso.y, 0).sub(a);
        this.lasso.position.copy(a);
        this.lasso.scale.set(1, d.length(), 1);
        this.lasso.quaternion.setFromUnitVectors(UP, d.normalize());
      }
    }
  }

  private syncItems(frame: RenderFrame) {
    const seen = this.seen;
    seen.clear();
    for (const it of frame.items) {
      seen.add(it.id);
      let obj = this.items.get(it.id);
      if (!obj) {
        obj = this.copyOf(`objet:${it.kind}`, () => itemModel(it.kind as ItemKind, this.keep));
        this.items.set(it.id, obj);
        this.scene.add(obj);
      }
      obj.position.set(it.x, it.y + (it.ground ? Math.abs(Math.sin(this.time * 3 + it.id)) * 0.08 : 0), 0);
      obj.rotation.y = this.time * 1.6 + it.id;
    }
    for (const [id, obj] of this.items) {
      if (seen.has(id)) continue;
      this.scene.remove(obj);
      this.items.delete(id);
    }
  }

  private syncTraps(frame: RenderFrame) {
    const seen = this.seen;
    seen.clear();
    for (const t of frame.traps) {
      seen.add(t.id);
      let obj = this.traps.get(t.id);
      if (!obj) {
        obj = this.copyOf("piege", () => {
          const g = new THREE.Group();
          const knit = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.5, 0.55, 0.06, 14)), this.keep(std(0x8e7cc3, 0.95)));
          g.add(knit);
          for (let k = 0; k < 3; k++) {
            const ring = new THREE.Mesh(this.keep(new THREE.TorusGeometry(0.15 + k * 0.12, 0.02, 5, 16)), this.keep(std(0xe86aa6, 0.95)));
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.04;
            g.add(ring);
          }
          return g;
        });
        this.traps.set(t.id, obj);
        this.scene.add(obj);
      }
      obj.position.set(t.x, t.y + 0.03, 0.2);
    }
    for (const [id, obj] of this.traps) {
      if (seen.has(id)) continue;
      this.scene.remove(obj);
      this.traps.delete(id);
    }
  }

  /** Garder tout le monde à l'écran, d'assez près */
  private updateCamera(dt: number, frame: RenderFrame) {
    if (this.fixedCam) {
      const c = this.fixedCam;
      this.camera.position.set(c.x, c.y, c.z);
      this.camera.lookAt(c.tx, c.ty, c.tz);
      const d = this.arena.light.dir;
      this.sun.position.set(c.tx + d.x, c.ty + d.y, d.z);
      this.sun.target.position.set(c.tx, c.ty, 0);
      return;
    }
    // Toujours tout le grand plateau, ses bords et un peu de vide autour (on voit venir le bord), ses plateformes et
    // un peu de ciel au-dessus ; le cadre ne s'élargit que pour garder à l'écran celui qui sort ou monte haut
    const stage = ARENAS[this.arenaId].platforms;
    const solid = stage.find((p) => p.kind === "solid")!;
    const top = Math.max(...stage.map((p) => p.y + (p.move?.ay ?? 0)));
    const sx0 = solid.x0 * this.scale - STAGE_MARGIN;
    const sx1 = solid.x1 * this.scale + STAGE_MARGIN;
    let minX = sx0;
    let maxX = sx1;
    let minY = solid.y - 2.2;
    let maxY = top + 2.8;
    let fx = 0;
    let fy = 0;
    let n = 0;
    for (const f of frame.fighters) {
      if (f.state === "dead" || f.state === "out") continue;
      minX = Math.min(minX, f.x - 2);
      maxX = Math.max(maxX, f.x + 2);
      minY = Math.min(minY, f.y - 1.4);
      maxY = Math.max(maxY, f.y + 2.8);
      fx += f.x;
      fy += f.y;
      n++;
    }
    const b = blastOf(this.arenaId, this.scale);
    minX = Math.max(minX, b.left + 1);
    maxX = Math.min(maxX, b.right - 1);
    minY = Math.max(minY, b.bottom + 1);
    maxY = Math.min(maxY, b.top);
    let cx = (minX + maxX) / 2;
    let cy = (minY + maxY) / 2;
    // Le cadre glisse un peu vers les combattants (sans perdre les bords du plateau de vue)
    if (n > 0) {
      const room = Math.max(0, STAGE_MARGIN - 1.4);
      cx += clampN((fx / n - cx) * 0.22, -room, room);
      cy += clampN((fy / n + 0.8 - cy) * 0.12, -0.8, 0.8);
    }
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const halfW = (maxX - minX) / 2;
    const halfH = (maxY - minY) / 2;
    const dist = Math.min(60, Math.max(halfH / tan, halfW / (tan * this.camera.aspect)));
    const want = this.tmpA.set(cx, cy + dist * 0.06, dist);
    // On recule vite (personne ne sort du cadre), on revient doucement
    let k = Math.min(1, dt * (dist > this.camPos.z ? 4 : 1.6));
    if (this.koCam) {
      this.koCam.age += dt;
      if (this.koCam.age < 0.5) {
        cx = this.koCam.x;
        cy = this.koCam.y;
        want.set(cx + 0.4, cy + 0.5, 11);
        k = Math.min(1, dt * 12);
      } else this.koCam = null;
    }
    this.camPos.lerp(want, k);
    this.camLook.lerp(this.tmpB.set(cx, cy, 0), k);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.5;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, this.camPos.z);
    this.camera.lookAt(this.camLook);
    const d = this.arena.light.dir;
    this.sun.position.set(this.camLook.x + d.x, this.camLook.y + d.y, d.z);
    this.sun.target.position.set(this.camLook.x, this.camLook.y, 0);
  }

  // -------------------------------------------------------------------------
  // Les effets
  // -------------------------------------------------------------------------

  private add(obj: THREE.Object3D, life: number, tick: Effect["tick"]) {
    this.scene.add(obj);
    this.effects.push({ obj, age: 0, life, tick });
  }

  /** Un petit nuage doux qui s'étire et s'efface */
  puff(x: number, y: number, color: number, size: number, life: number) {
    const mat = new THREE.SpriteMaterial({ map: this.smoke(), color, transparent: true, opacity: 0.85, depthWrite: false });
    mat.rotation = Math.random() * Math.PI * 2;
    const m = new THREE.Sprite(mat);
    m.position.set(x, y, 0.25);
    m.scale.setScalar(size * 2);
    const drift = (Math.random() - 0.5) * 0.6;
    this.add(m, life, (k, dt) => {
      m.scale.setScalar(size * 2 * (1 + k * 1.3));
      m.position.y += dt * 0.5;
      m.position.x += dt * drift;
      mat.opacity = 0.85 * (1 - k) ** 1.4;
      if (k >= 1) mat.dispose();
    });
  }

  /** La fumée : une tache ronde aux bords bosselés */
  private smoke(): THREE.Texture {
    if (!this.smokeTex) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      for (const [x, y, r] of [
        [32, 34, 22],
        [22, 28, 14],
        [42, 26, 15],
        [30, 22, 13],
        [40, 38, 13],
      ] as const) {
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, "rgba(255,255,255,0.9)");
        grd.addColorStop(0.6, "rgba(255,255,255,0.45)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      this.smokeTex = this.keep(new THREE.CanvasTexture(c));
      this.smokeTex.colorSpace = THREE.SRGBColorSpace;
    }
    return this.smokeTex;
  }

  private glowTex(): THREE.Texture {
    if (!this.haloTex) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(0.25, "rgba(255,255,255,0.6)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      this.haloTex = this.keep(new THREE.CanvasTexture(c));
    }
    return this.haloTex;
  }

  private star() {
    if (!this.starGeo) {
      const s = new THREE.Shape();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 === 0 ? 1 : 0.42;
        if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      this.starGeo = this.keep(new THREE.ShapeGeometry(s));
    }
    return this.starGeo;
  }

  private ring() {
    if (!this.ringGeo) this.ringGeo = this.keep(new THREE.RingGeometry(0.82, 1, 40));
    return this.ringGeo;
  }

  private ray() {
    if (!this.rayGeo) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.translate(0.5, 0, 0);
      this.rayGeo = this.keep(g);
    }
    return this.rayGeo;
  }

  /** Un éclat de lumière qui gonfle et s'éteint */
  private flare(x: number, y: number, size: number, color: number, life: number, z = 0.7) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex(),
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Sprite(mat);
    m.position.set(x, y, z);
    this.add(m, life, (k) => {
      m.scale.setScalar(size * (0.6 + k * 0.6));
      mat.opacity = (1 - k) ** 2;
      if (k >= 1) mat.dispose();
    });
  }

  /**
   * Un coup qu'on charge : des étincelles aspirées vers lui, de plus en plus vite et dorées, une lueur qui enfle ; chargé
   * à fond, un éclair et un anneau
   */
  private charging(i: number, f: RenderFrame["fighters"][number]) {
    const on = f.state === "move" && f.charge > 0;
    if (!on) {
      this.chargeFull[i] = false;
      return;
    }
    const k = Math.min(1, f.charge / 60);
    const cx = f.x;
    const cy = f.y + 0.9;
    const every = 0.09 - k * 0.05;
    if (this.time - (this.chargeAt[i] ?? 0) > every) {
      this.chargeAt[i] = this.time;
      this.gather(cx, cy, k > 0.66 ? 0xfff0c0 : k > 0.33 ? 0xffd25a : 0xffa040, 0.9 + k * 0.6);
      // Un halo qui bat derrière lui (pas devant : on doit encore le voir)
      this.flare(cx, cy, 1.1 + k * 1.1, 0xff9a30, 0.12, -0.6);
    }
    if (k >= 1 && !this.chargeFull[i]) {
      this.chargeFull[i] = true;
      this.flare(cx, cy, 2.6, 0xffe08a, 0.25, -0.6);
      this.wave(cx, cy, 2.4, 0xffe08a, 0.35);
    }
  }

  /**
   * Un enchaînement : touché de nouveau par le même avant d'avoir repris ses esprits (le temps de l'étourdissement, à
   * peu près), le compte monte, et « 2 coups ! », « 3 coups ! »… saute au-dessus de lui, à la couleur de l'attaquant
   */
  private countCombo(a: number, v: number, chained: boolean, frame: RenderFrame) {
    if (a < 0 || a === v) return;
    const target = frame.fighters[v];
    if (!target) return;
    // Un vrai enchaînement : le combat dit qu'il était encore étourdi par le coup d'avant du même attaquant (et pas
    // depuis plus d'une seconde et demie, en temps réel : un onglet au ralenti ne fait pas grimper le compte)
    const now = performance.now();
    const c = this.combo[v];
    const n = chained && c && c.by === a && now < c.until ? c.n + 1 : 1;
    this.combo[v] = { by: a, n, until: now + 1500 };
    if (n < 2) return;
    const color = this.looks[a]?.color ?? "#ffd25a";
    const c2 = document.createElement("canvas");
    c2.width = 256;
    c2.height = 96;
    const g = c2.getContext("2d")!;
    g.font = "italic 900 52px 'Libre Franklin Variable', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 10;
    g.strokeStyle = "rgba(20, 16, 24, 0.9)";
    const text = `${n} coups !`;
    g.strokeText(text, 128, 50);
    g.fillStyle = color;
    g.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(c2);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const m = new THREE.Sprite(mat);
    m.renderOrder = 12;
    const old = this.comboShown[v];
    if (old) old.visible = false;
    this.comboShown[v] = m;
    const x = target.x + (Math.random() - 0.5) * 0.3;
    const y = target.y + 2.3;
    const size = Math.min(1.6, 1 + n * 0.08);
    this.add(m, 0.7, (k) => {
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : 1.15 - Math.min(0.15, (k - 0.15) * 0.6);
      m.position.set(x, y + k * 0.5, 0.9);
      m.scale.set(1.9 * size * pop, 0.71 * size * pop, 1);
      mat.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (k >= 1) {
        tex.dispose();
        mat.dispose();
      }
    });
  }

  /** Une étincelle qui part d'un peu plus loin et file vers le centre en s'effaçant */
  private gather(x: number, y: number, color: number, radius: number) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex(),
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Sprite(mat);
    const a = Math.random() * Math.PI * 2;
    const r = radius * (0.8 + Math.random() * 0.4);
    this.add(m, 0.22, (k) => {
      const d = r * (1 - k) ** 1.6;
      m.position.set(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.75);
      m.scale.setScalar(0.32 * (1 - k * 0.5));
      mat.opacity = Math.min(1, k * 4) * (1 - k * 0.3);
      if (k >= 1) mat.dispose();
    });
  }

  /** Une onde : un anneau qui s'élargit en s'amincissant */
  private wave(x: number, y: number, size: number, color: number, life: number) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(this.ring(), mat);
    m.position.set(x, y, 0.65);
    this.add(m, life, (k) => {
      m.scale.setScalar(size * (0.25 + k * 1.1));
      mat.opacity = (1 - k) ** 1.5;
      if (k >= 1) mat.dispose();
    });
  }

  /** Des traits qui partent du point d'impact */
  private rays(x: number, y: number, n: number, len: number, color: number, life: number, width = 0.07) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(this.ray(), mat);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      m.position.set(x, y, 0.62);
      m.rotation.z = a;
      const l = len * (0.7 + Math.random() * 0.6);
      this.add(m, life, (k) => {
        // Le trait jaillit, puis se détache du centre
        m.scale.set(l * Math.min(1, k * 3), width * (1 - k), 1);
        m.position.set(x + Math.cos(a) * l * k * 0.6, y + Math.sin(a) * l * k * 0.6, 0.62);
        mat.opacity = 1 - k;
        if (k >= 1) mat.dispose();
      });
    }
  }

  /** L'étincelle d'un coup : plus il est fort, plus elle est grande, chaude et accompagnée */
  private spark(x: number, y: number, power: number, color: number) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.star(), mat);
    m.position.set(x, y, 0.6);
    const size = 0.35 + power * 0.65;
    m.rotation.z = Math.random() * Math.PI;
    const spin = (Math.random() - 0.5) * 4;
    this.add(m, 0.22 + power * 0.15, (k, dt) => {
      m.scale.setScalar(size * (0.6 + k * 0.8));
      m.rotation.z += dt * spin;
      mat.opacity = 1 - k * k;
      if (k >= 1) mat.dispose();
    });
    // La lueur passe derrière les combattants : on voit toujours qui frappe et qui encaisse
    this.flare(x, y, 1.2 + power * 1.6, color, 0.2 + power * 0.15, -0.5);
    if (power > 0.25) this.wave(x, y, 0.8 + power * 1.6, 0xffffff, 0.25 + power * 0.15);
    if (power > 0.4) this.rays(x, y, 5 + Math.round(power * 4), 0.6 + power * 1.1, 0xffffff, 0.22 + power * 0.1);
  }

  effect(e: FightEvent, frame: RenderFrame) {
    switch (e.k) {
      case "hit": {
        if (e.kind === "push") {
          this.puff(e.x, e.y, 0xe8f4ff, 0.3, 0.35);
          break;
        }
        if (e.kind === "shield") {
          this.spark(e.x, e.y, 0.3, 0x8fe3ff);
          break;
        }
        if (e.kind === "parry") {
          // La parade : un éclat bleuté, une onde nette, et le défenseur qui brille un instant
          this.flare(e.x, e.y, 3.2, 0xbfe8ff, 0.35);
          this.wave(e.x, e.y, 2.2, 0x9fdcff, 0.35);
          this.rays(e.x, e.y, 8, 1.4, 0xe8f6ff, 0.28, 0.06);
          this.fighters[e.v]?.hit(0.3);
          break;
        }
        if (e.kind === "counter") {
          this.spark(e.x, e.y, 0.8, 0x6ab4ff);
          this.shake = Math.max(this.shake, 0.4);
          break;
        }
        this.fighters[e.v]?.hit(e.power);
        this.spark(e.x, e.y, e.power, e.power > 0.55 ? 0xffa53a : 0xfff2a8);
        this.countCombo(e.a, e.v, Boolean(e.chain), frame);
        if (e.power > 0.45) this.shake = Math.max(this.shake, 0.3 + e.power * 0.6);
        if (e.ko) {
          // Le coup de grâce : la caméra plonge (seulement si ça ne détourne pas le regard de quelqu'un qui se bat
          // ailleurs : on est l'un des deux, ils ne sont plus que deux, ou on regarde sans jouer), un grand éclair, une onde
          const mine = this.looks.findIndex((l) => l.me);
          const alive = frame.fighters.filter((f) => f.state !== "dead" && f.state !== "out").length;
          if (mine < 0 || e.a === mine || e.v === mine || alive <= 2) this.koCam = { x: e.x, y: e.y, age: 0 };
          // (à la mesure de l'écran rapproché : derrière les combattants, qu'on voie encore le coup)
          this.flare(e.x, e.y, 2.8, 0xffe9b0, 0.45, -0.6);
          this.wave(e.x, e.y, 2.4, 0xffe08a, 0.5);
          this.rays(e.x, e.y, 12, 2.1, 0xffffff, 0.45, 0.06);
          this.shake = 0.5;
        }
        break;
      }
      case "ko": {
        // La sortie : un grand faisceau du bord vers le milieu, une explosion à la couleur de celui qui sort
        const color = new THREE.Color(this.looks[e.v]?.color ?? "#ffd25a").getHex();
        const mat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55) }, uFade: { value: 1 } },
          vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `uniform vec3 uColor; uniform float uFade; varying vec2 vUv;
void main() { float a = pow(vUv.y, 1.6) * (0.35 + 0.65 * pow(sin(vUv.x * 3.14159), 0.5)) * uFade; gl_FragColor = vec4(uColor, a * 0.85); }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
        const ray = new THREE.Mesh(new THREE.ConeGeometry(1.5, 16, 24, 1, true), mat);
        const dir = new THREE.Vector3(-e.x, 3 - e.y, 0).normalize();
        ray.position.set(e.x + dir.x * 8, e.y + dir.y * 8, 0.5);
        ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
        this.add(ray, 0.75, (k) => {
          mat.uniforms.uFade!.value = (1 - k) ** 1.5;
          ray.scale.set(1 - k * 0.6, 1, 1 - k * 0.6);
          if (k >= 1) {
            mat.dispose();
            ray.geometry.dispose();
          }
        });
        this.flare(e.x, e.y, 9, color, 0.6);
        this.flare(e.x, e.y, 5, 0xffffff, 0.35);
        this.wave(e.x, e.y, 5, color, 0.6);
        this.wave(e.x, e.y, 3, 0xffffff, 0.4);
        this.rays(e.x, e.y, 14, 4.5, color, 0.55, 0.16);
        this.spark(e.x, e.y, 1.6, 0xffd25a);
        this.shake = 1.1;
        break;
      }
      case "boom": {
        this.flare(e.x, e.y, e.r * 3.2, 0xff9a3a, 0.5);
        this.wave(e.x, e.y, e.r * 1.6, 0xffd25a, 0.4);
        this.rays(e.x, e.y, 10, e.r * 1.2, 0xffd25a, 0.35, 0.12);
        for (let i = 0; i < 8; i++)
          this.puff(
            e.x + (Math.random() - 0.5) * e.r,
            e.y + Math.random() * e.r * 0.8,
            0x6a6460,
            0.45 + Math.random() * 0.3,
            0.9 + Math.random() * 0.4,
          );
        this.shake = Math.max(this.shake, 0.8);
        break;
      }
      case "item":
        this.flare(e.x, e.y, 1.6, 0xffffff, 0.35);
        this.wave(e.x, e.y, 1, 0xffffff, 0.3);
        break;
      case "pick": {
        const f = frame.fighters[e.v];
        if (f && (e.kind === "gateau" || e.kind === "cafe"))
          for (let i = 0; i < 4; i++) this.puff(f.x, f.y + 0.6 + i * 0.3, e.kind === "gateau" ? 0xff9ad0 : 0xc79a6a, 0.18, 0.7);
        break;
      }
      case "break": {
        const f = frame.fighters[e.v];
        if (f) {
          this.spark(f.x, f.y + 0.8, 1.2, 0x8fe3ff);
          this.shake = Math.max(this.shake, 0.6);
        }
        break;
      }
      case "trap": {
        const f = frame.fighters[e.v];
        if (f) this.spark(f.x, f.y + 0.5, 0.5, 0xe86aa6);
        break;
      }
      case "back": {
        const f = frame.fighters[e.v];
        if (f) {
          this.puff(f.x, f.y + 0.6, 0xffffff, 0.6, 0.6);
          this.flare(f.x, f.y + 0.8, 3, new THREE.Color(this.looks[e.v]?.color ?? "#ffffff").getHex(), 0.5);
        }
        break;
      }
      default:
        break;
    }
  }

  /** La poussière : à l'atterrissage, et de temps en temps sous les pieds de celui qui court */
  private dust(i: number, f: RenderFrame["fighters"][number], dt: number) {
    const was = this.grounded[i] ?? true;
    const on =
      f.state === "stand" || f.state === "land" || f.state === "squat" || f.state === "shield" || f.state === "dodge" || f.state === "roll";
    const lastX = this.lastXs[i] ?? f.x;
    const vx = dt > 0 ? (f.x - lastX) / dt : 0;
    this.lastXs[i] = f.x;
    this.grounded[i] = on;
    const color = this.arenaId === "bal" ? 0x9a8f9c : 0xe6dccb;
    if (on && !was && f.state === "land") {
      this.puff(f.x - 0.35, f.y + 0.1, color, 0.22, 0.5);
      this.puff(f.x + 0.35, f.y + 0.1, color, 0.22, 0.5);
    }
    if (on && Math.abs(vx) > 5.5 && Math.abs(vx) < 30) {
      const at = this.dustAt[i] ?? 0;
      if (this.time - at > 0.16) {
        this.dustAt[i] = this.time;
        this.puff(f.x - Math.sign(vx) * 0.25, f.y + 0.08, color, 0.14, 0.4);
      }
    }
  }

  dispose() {
    for (const f of this.fighters) f.dispose();
    for (const d of this.keepList) d.dispose();
    for (const d of this.arenaKeep) d.dispose();
    for (const e of this.effects) this.scene.remove(e.obj);
    for (const b of this.bubbles) {
      b.material.map?.dispose();
      b.material.dispose();
    }
    this.envMap?.dispose();
    this.renderer.dispose();
    // La carte graphique rendue tout de suite (une revanche ou un retour au salon en rouvre une autre aussitôt)
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

/** Debout tout au bord d'une plateforme, le vide devant ou derrière : de quel côté (0 : pas au bord) */
function teeterSide(f: RenderFrame["fighters"][number], plats: PlatformNow[]): number {
  if (f.state !== "stand") return 0;
  for (const p of plats) {
    if (Math.abs(f.y - p.y) > 0.05) continue;
    if (Math.abs(f.x - p.x0) < 0.06) return -1;
    if (Math.abs(f.x - p.x1) < 0.06) return 1;
  }
  return 0;
}

/** Le vide qu'on voit de chaque côté du grand plateau */
const STAGE_MARGIN = 3.2;

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
