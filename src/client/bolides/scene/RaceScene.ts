// La scène 3D d'une course : le monde, les karts, les caisses, les pièges, les petits effets, et la caméra.
// Elle ne décide de rien : on lui dit où sont les karts et ce qui vient d'arriver, elle le dessine.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { hazardPos, type Hazard } from "../../../shared/games/bolides/items.ts";
import type { Kart } from "../../../shared/games/bolides/physics.ts";
import { pointAt, wrapAngle, type Track } from "../../../shared/games/bolides/track.ts";
import { KartModel, type KartExtras, type KartLook } from "./kart.ts";
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
  camera: "intro" | "chase" | "orbit";
  /** Où en est le survol d'avant la course, de 0 à 1 */
  introT: number;
  serverNow: number;
  /** Le temps réel écoulé depuis l'image précédente, en secondes */
  dt: number;
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
  private world: World | null = null;
  private track: Track | null = null;
  private karts: KartModel[] = [];
  private crates: THREE.Mesh[] = [];
  private crateShown: boolean[] = [];
  private crateMat: THREE.MeshLambertMaterial | null = null;
  private hazards = new Map<number, { hz: Hazard; mesh: THREE.Object3D }>();
  private oilMat: THREE.MeshBasicMaterial;
  private petardGeo: THREE.BufferGeometry;
  private petardMat: THREE.MeshLambertMaterial;
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
  private envTex: THREE.Texture;
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

    const hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6a3a, 1.35);
    this.scene.add(hemi);
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
    // Un reflet de pièce éclairée pour les karts (peinture, chromes), sans rien télécharger
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.55;

    this.oilMat = new THREE.MeshBasicMaterial({ map: TX.oilTexture(), transparent: true, depthWrite: false });
    this.petardGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10);
    this.petardGeo.rotateX(Math.PI / 2);
    this.petardMat = new THREE.MeshLambertMaterial({ color: 0xd8352a, emissive: 0x401008 });
    this.puffTex = TX.sparkTexture();

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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Le circuit et les karts (dans l'ordre des pilotes de la course) */
  build(track: Track, looks: KartLook[]) {
    this.track = track;
    this.world = buildWorld(track, { phone: this.opts.phone, shadows: this.shadows });
    this.scene.add(this.world.group, this.world.dome);
    this.scene.background = this.world.sky;
    this.scene.fog = this.world.fog;
    this.karts = looks.map((look) => {
      const m = new KartModel(look, this.shadows);
      this.scene.add(m.group);
      return m;
    });
    // Les caisses d'objets
    this.crateMat = new THREE.MeshLambertMaterial({ map: TX.crateTexture(), emissive: 0x2a1600 });
    const geo = new THREE.BoxGeometry(1.25, 1.25, 1.25);
    this.crates = track.boxes.map((b) => {
      const m = new THREE.Mesh(geo, this.crateMat!);
      m.position.set(b.x, pointAt(track, b.s, b.d).y + 1, b.z);
      m.castShadow = this.shadows;
      this.scene.add(m);
      return m;
    });
    this.crateShown = track.boxes.map(() => true);
  }

  /** Les caisses présentes ou prises (une caisse prise éclate) */
  setCrates(available: boolean[]) {
    available.forEach((on, i) => {
      const crate = this.crates[i];
      if (!crate) return;
      if (this.crateShown[i] && !on) this.burst(crate.position, 0xffd23a, 10);
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
      } else {
        mesh = new THREE.Mesh(this.petardGeo, this.petardMat);
      }
      this.scene.add(mesh);
      this.hazards.set(hz.id, { hz, mesh });
    }
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
    const color = theme === "col" ? 0xf4f7fa : 0x9b8a6a;
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

  /** Des étincelles contre un mur */
  wallSparks(k: Kart) {
    this.burst({ x: k.x, y: k.y + 0.5, z: k.z }, 0xffd27a, 9, 5);
  }

  /** La poussière (ou la neige) qui vole à l'atterrissage d'un saut */
  landDust(k: Kart) {
    if (this.opts.reduced) return;
    const color = this.track?.def.theme === "col" ? 0xf4f7fa : 0xcfc4ad;
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
    // La fumée des dérapages, une image sur deux, pour les karts pas trop loin
    this.smokeTick = (this.smokeTick + 1) % 2;
    if (this.smokeTick === 0) {
      for (const { kart } of f.karts) {
        if (kart.drift === 0 || kart.air > 0.2 || kart.spin > 0) continue;
        if (Math.hypot(kart.x - this.camPos.x, kart.z - this.camPos.z) < 70) this.driftSmoke(kart);
      }
    }
    // Les caisses tournent et flottent ; celles qui reviennent grossissent
    this.crates.forEach((c, i) => {
      c.rotation.y = this.time * 1.4 + i;
      c.rotation.x = Math.sin(this.time + i) * 0.2;
      const target = this.crateShown[i] ? 1 : 0;
      const s = c.scale.x + (target - c.scale.x) * Math.min(1, f.dt * (target ? 3 : 14));
      c.scale.setScalar(Math.max(0.001, s));
      c.visible = s > 0.02;
    });
    // Les pétards filent le long de la route
    for (const { hz, mesh } of this.hazards.values()) {
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
    this.moveCamera(f);
    this.world.update(this.time, this.camera.position);
    // Les étiquettes des autres : ni trop près ni trop loin ; un kart collé à la caméra s'efface pour ne pas boucher la vue
    f.karts.forEach((k, i) => {
      const d = this.camPos.distanceTo(this.tmp.set(k.kart.x, k.kart.y + 0.8, k.kart.z));
      this.karts[i]?.showTag(d > 10 && d < 90);
      this.karts[i]?.fade(i === f.follow || f.camera !== "chase" ? 1 : Math.max(0, Math.min(1, (d - 2.6) / 2.6)));
    });
    this.renderer.render(this.scene, this.camera);
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
    } else {
      // Derrière le kart, assez près et assez bas pour bien le voir : le cap de la caméra suit celui du kart en
      // douceur, sa hauteur aussi (les bosses, les sauts), mais elle ne prend pas de retard quand il file
      if (!this.chasing) {
        this.camYaw = target.h;
        this.camY = target.y;
      }
      this.camYaw += wrapAngle(target.h - this.camYaw) * (1 - Math.exp(-dt * 5));
      this.camY += (target.y + target.air * 0.85 - this.camY) * (1 - Math.exp(-dt * 6));
      // En l'air, elle prend un peu de recul et de hauteur pour bien montrer le saut
      const back = (portrait ? 7.4 : 6.3) + target.air * 0.6;
      const up = (portrait ? 3.1 : 2.55) + target.air * 0.5;
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      pos = this.tmpPos.set(target.x - fx * back, this.camY + up, target.z - fz * back);
      look = this.tmpLook.set(target.x + fx * 6, this.camY + 1.25, target.z + fz * 6);
      fov += Math.max(0, Math.min(12, (target.v - 20) * 0.6)) + (target.boost > 0 ? 6 : 0);
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
    this.sun.position.set(this.camLook.x + 50, this.camLook.y + 110, this.camLook.z + 30);
    this.sun.target.position.copy(this.camLook);
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
    this.crateMat?.dispose();
    this.oilMat.dispose();
    this.petardGeo.dispose();
    this.petardMat.dispose();
    this.puffTex.dispose();
    this.envTex.dispose();
    for (const p of this.puffs) p.sprite.material.dispose();
    for (const s of this.spare) s.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
