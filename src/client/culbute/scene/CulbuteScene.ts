// La scène d'un combat : l'arène, les combattants, ce qui vole, les objets, les étincelles et les éjections, et une
// caméra de côté qui garde tout le monde à l'écran en s'approchant quand on se bat de près.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { blastOf, type ArenaId, type PlatformNow } from "../../../shared/games/culbute/arenas.ts";
import type { FightEvent, ItemKind } from "../../../shared/games/culbute/model.ts";
import { headCanvas } from "../../bolides/scene/faces.ts";
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

export class CulbuteScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 220);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6);
  private sun = new THREE.DirectionalLight(0xffffff, 2);
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
  private time = 0;
  private shake = 0;
  private camPos = new THREE.Vector3(0, 3, 26);
  private camLook = new THREE.Vector3(0, 2, 0);
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
  /** Une caméra posée à la main (la page de travail, les vitrines) : sinon elle suit le combat */
  fixedCam: { x: number; y: number; z: number; tx: number; ty: number; tz: number } | null = null;

  constructor(host: HTMLElement, arena: ArenaId, scale: number, looks: FighterLook[]) {
    this.keep = <T extends { dispose: () => void }>(x: T) => {
      this.keepList.push(x);
      return x;
    };
    this.renderer = new THREE.WebGLRenderer({ antialias: !TOUCH, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? 1.25 : 1.75));
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
    this.setLooks(looks);
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
  private respawnPad(): THREE.Object3D {
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
  }

  /** Rien encore à montrer : l'arène seule */
  renderIdle(dt: number) {
    this.time += dt;
    this.arena.update(this.time, []);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.arena.dome.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  render(dt: number, frame: RenderFrame) {
    this.time += dt;
    this.arena.update(this.time, frame.plats);
    frame.fighters.forEach((f, i) => {
      const m = this.fighters[i];
      if (!m) return;
      m.update(dt, f, this.time);
      this.placeBlob(i, f, frame.plats);
      this.dust(i, f, dt);
      const pad = this.pads[i]!;
      pad.visible = f.state === "respawn";
      if (pad.visible) pad.position.set(f.x, f.y + Math.sin(this.time * 2) * 0.03, 0);
      // Envoyé loin : une traînée de fumée derrière lui
      if (f.state === "hurt" && f.kb > 16) {
        const at = this.trailAt.get(i) ?? 0;
        if (this.time - at > 0.035) {
          this.trailAt.set(i, this.time);
          this.puff(f.x, f.y + 0.7, 0xf4f4f4, 0.35 + Math.min(0.4, f.kb / 80), 0.5);
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
    const seen = new Set<number>();
    let lasso: RenderFrame["shots"][number] | null = null;
    for (const s of frame.shots) {
      seen.add(s.id);
      let obj = this.shots.get(s.id);
      if (!obj) {
        obj = shotModel(s.kind, this.keep);
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
        const a = new THREE.Vector3(owner.x + owner.face * 0.4, owner.y + 1, 0);
        const b = new THREE.Vector3(lasso.x, lasso.y, 0);
        const d = b.clone().sub(a);
        this.lasso.position.copy(a);
        this.lasso.scale.set(1, d.length(), 1);
        this.lasso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      }
    }
  }

  private syncItems(frame: RenderFrame) {
    const seen = new Set<number>();
    for (const it of frame.items) {
      seen.add(it.id);
      let obj = this.items.get(it.id);
      if (!obj) {
        obj = itemModel(it.kind as ItemKind, this.keep);
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
    const seen = new Set<number>();
    for (const t of frame.traps) {
      seen.add(t.id);
      let obj = this.traps.get(t.id);
      if (!obj) {
        const g = new THREE.Group();
        const knit = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.5, 0.55, 0.06, 14)), this.keep(std(0x8e7cc3, 0.95)));
        g.add(knit);
        for (let k = 0; k < 3; k++) {
          const ring = new THREE.Mesh(this.keep(new THREE.TorusGeometry(0.15 + k * 0.12, 0.02, 5, 16)), this.keep(std(0xe86aa6, 0.95)));
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.04;
          g.add(ring);
        }
        obj = g;
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
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const f of frame.fighters) {
      if (f.state === "dead" || f.state === "out") continue;
      minX = Math.min(minX, f.x);
      maxX = Math.max(maxX, f.x);
      minY = Math.min(minY, f.y);
      maxY = Math.max(maxY, f.y + 1.6);
    }
    if (!Number.isFinite(minX)) {
      minX = -6;
      maxX = 6;
      minY = 0;
      maxY = 3;
    }
    // Le plateau reste un peu dans le cadre, même quand on se bat tout au bord
    minX = Math.min(minX - 2.4, -3 * this.scale);
    maxX = Math.max(maxX + 2.4, 3 * this.scale);
    minY = Math.min(minY - 1.4, -1.0);
    maxY = Math.max(maxY + 1.2, 3.2);
    const b = blastOf(this.arenaId, this.scale);
    minX = Math.max(minX, b.left + 2);
    maxX = Math.min(maxX, b.right - 2);
    minY = Math.max(minY, b.bottom + 1);
    maxY = Math.min(maxY, b.top);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const halfW = Math.max(5.8, (maxX - minX) / 2);
    const halfH = Math.max(3.4, (maxY - minY) / 2);
    const dist = Math.min(52, Math.max(halfH / tan, halfW / (tan * this.camera.aspect)));
    const want = new THREE.Vector3(cx, cy + dist * 0.09, dist);
    const k = Math.min(1, dt * 3.2);
    this.camPos.lerp(want, k);
    this.camLook.lerp(new THREE.Vector3(cx, cy, 0), k);
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
  private flare(x: number, y: number, size: number, color: number, life: number) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex(),
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Sprite(mat);
    m.position.set(x, y, 0.7);
    this.add(m, life, (k) => {
      m.scale.setScalar(size * (0.6 + k * 0.6));
      mat.opacity = (1 - k) ** 2;
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
    const size = 0.35 + power * 0.9;
    m.rotation.z = Math.random() * Math.PI;
    const spin = (Math.random() - 0.5) * 4;
    this.add(m, 0.22 + power * 0.15, (k, dt) => {
      m.scale.setScalar(size * (0.6 + k * 0.8));
      m.rotation.z += dt * spin;
      mat.opacity = 1 - k * k;
      if (k >= 1) mat.dispose();
    });
    this.flare(x, y, 1.2 + power * 2.2, color, 0.2 + power * 0.15);
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
        if (e.kind === "counter") {
          this.spark(e.x, e.y, 0.8, 0x6ab4ff);
          this.shake = Math.max(this.shake, 0.4);
          break;
        }
        this.fighters[e.v]?.hit(e.power);
        this.spark(e.x, e.y, e.power, e.power > 0.55 ? 0xffa53a : 0xfff2a8);
        if (e.power > 0.45) this.shake = Math.max(this.shake, 0.3 + e.power * 0.6);
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
    this.envMap?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
