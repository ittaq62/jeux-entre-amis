// Tout ce que les objets font à l'écran : ce qui file sur la route (avec ses traînées), les ondes de choc, les boules de
// feu, les éclats, les quilles qui volent, et les onomatopées de bande dessinée. Tout est préparé au chargement et
// réutilisé : rien ne se crée au milieu de la course, pour ne jamais faire hoqueter l'image.

import * as THREE from "three";
import { BOMBE_FLY_MS, BOMBE_MS, BOMBE_RADIUS, hazardPos, type Hazard } from "../../../shared/games/bolides/items.ts";
import type { Kart } from "../../../shared/games/bolides/physics.ts";
import { pointAt, type Track } from "../../../shared/games/bolides/track.ts";
import { backOut, bombBlink, launchGap, launchLeft, type LaunchGap } from "./fxCurves.ts";
import { ItemModels, type ItemModel } from "./itemModels.ts";
import { oilSheenTexture, oilTexture, sparkTexture } from "./textures.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;
type HazardKind = Hazard["kind"];

export type PuffFn = (
  x: number,
  y: number,
  z: number,
  color: number,
  vx: number,
  vy: number,
  vz: number,
  life: number,
  grow: number,
  alpha?: number,
  heavy?: boolean,
  size?: number,
) => void;

export interface FxHost {
  scene: THREE.Scene;
  track: Track;
  keep: Keep;
  items: ItemModels;
  phone: boolean;
  reduced: boolean;
  puff: PuffFn;
}

/** Les onomatopées : ce qu'elles disent, leur couleur, celle de l'étoile derrière */
export const WORDS = {
  boum: ["BOUM !", "#fff1b8", "#ff5a1f"],
  paf: ["PAF !", "#ffffff", "#ff3b30"],
  pouet: ["POUET !", "#fff4c2", "#2f9bff"],
  strike: ["STRIKE !", "#ffffff", "#8a3ffc"],
  oups: ["OUPS !", "#f6e9ff", "#2b1f3d"],
  zap: ["ZZZAP !", "#fff87a", "#2a4bd8"],
  bam: ["BAM !", "#ffffff", "#ff2e93"],
  ecrase: ["ÉCRASÉ !", "#ffffff", "#9a34ff"],
  splaf: ["SPLAF !", "#d24a7a", "#fff6e6"],
  ting: ["TING !", "#ffffff", "#19b5ff"],
} as const;
export type Word = keyof typeof WORDS;

const WORD_LIFE = 0.62;
/** La taille à l'échelle du monde des objets lancés */
const SIZE: Record<HazardKind, number> = { huile: 1.3, petard: 2.0, bowling: 2.62, tarte: 1.75, bombe: 1.95, fusee: 2.5 };
const HAZARD_KINDS = Object.keys(SIZE) as HazardKind[];
const PIN_COUNT = 6;
const SHARD_COUNT = 56;

interface Prefab {
  root: THREE.Group;
  /** Ce qui tourne ou se penche, à l'intérieur */
  pivot: THREE.Group;
  model: ItemModel;
  blink?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  disc?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  ring?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  puddle?: THREE.Mesh;
  sheen?: THREE.Mesh;
}

interface Live extends Prefab {
  hz: Hazard;
  /** Le moment où on l'a vu apparaître */
  born: number;
  landed: boolean;
  landT: number;
  last: { x: number; y: number; z: number } | null;
  /** L'écart entre le nez du kart qui l'a lancé et sa course, au moment où on l'a vu (undefined : pas encore vu) */
  launch: LaunchGap | null | undefined;
}

interface Shock {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  max: number;
  radius: number;
  delay: number;
  alpha: number;
}

interface Flash {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  max: number;
  size: number;
}

interface Thrown {
  root: THREE.Group;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  az: number;
  life: number;
}

interface Pop {
  sprite: THREE.Sprite;
  life: number;
  x: number;
  y: number;
  z: number;
  tilt: number;
}

interface Shard {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  spin: number;
  life: number;
  max: number;
  size: number;
}

interface FlyingCoin {
  mesh: THREE.Mesh;
  kart: number;
  t: number;
  x: number;
  y: number;
  z: number;
}

interface Prop {
  root: THREE.Group;
  t: number;
  /** Le kart auquel elle reste accrochée */
  kart: number;
  kind: "spring" | "horn";
}

/** L'étoile de bande dessinée, et le mot dessus */
function wordTexture(key: Word): THREE.CanvasTexture {
  const [text, fill, back] = WORDS[key];
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 192;
  const g = c.getContext("2d")!;
  g.translate(192, 96);
  // L'étoile : des pointes irrégulières, cernées d'un trait sombre
  const spikes = 14;
  const path = new Path2D();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 + ((i * 37) % 11) * 0.022 : 0.68;
    const x = Math.cos(a) * 178 * r * 0.98;
    const y = Math.sin(a) * 84 * r * 0.98;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  g.lineJoin = "round";
  g.lineWidth = 10;
  g.strokeStyle = "#17121f";
  g.stroke(path);
  g.fillStyle = back;
  g.fill(path);
  g.font = `900 ${text.length > 7 ? 62 : 74}px 'Big Shoulders Display Variable', 'Arial Black', sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.rotate(-0.05);
  g.lineWidth = 12;
  g.strokeStyle = "#17121f";
  g.strokeText(text, 0, 6, 320);
  g.fillStyle = fill;
  g.fillText(text, 0, 6, 320);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Une couleur de l'arc-en-ciel, au hasard */
const RAINBOW = [0xf0343c, 0xff8a1f, 0xffd93a, 0x35c75a, 0x2b8cff, 0xc06bff];
const pick = (list: readonly number[]) => list[Math.floor(Math.random() * list.length)]!;

export class ItemFx {
  readonly group = new THREE.Group();
  private pools = new Map<HazardKind, Prefab[]>();
  private live = new Map<number, Live>();
  private oilGeo: THREE.BufferGeometry;
  private oilMat: THREE.MeshBasicMaterial;
  private sheenMat: THREE.MeshBasicMaterial;
  private shocks: Shock[] = [];
  private shockIdle: Shock[] = [];
  private flashes: Flash[] = [];
  private flashIdle: Flash[] = [];
  private pins: Thrown[] = [];
  private pinIdle: THREE.Group[] = [];
  private pops = new Map<Word, Pop>();
  private shards: Shard[] = [];
  private shardMesh: THREE.InstancedMesh;
  private flying: FlyingCoin[] = [];
  private coinIdle: THREE.Mesh[] = [];
  private props: Prop[] = [];
  private springIdle: THREE.Group[] = [];
  private hornIdle: THREE.Group[] = [];
  private scorches: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; life: number }[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private tmpC = new THREE.Color();
  private time = 0;
  /** Les pilotes, dans l'ordre des karts montrés (pour retrouver qui a lancé quoi) */
  private racers: readonly string[] = [];

  constructor(private h: FxHost) {
    const { keep, items } = h;
    h.scene.add(this.group);
    this.oilGeo = keep(new THREE.CircleGeometry(2.05, 28).rotateX(-Math.PI / 2));
    this.oilMat = keep(new THREE.MeshBasicMaterial({ map: keep(oilTexture()), transparent: true, depthWrite: false }));
    this.sheenMat = keep(
      new THREE.MeshBasicMaterial({
        map: keep(oilSheenTexture()),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const copies = h.phone ? 2 : 3;
    for (const kind of HAZARD_KINDS) {
      const list: Prefab[] = [];
      for (let i = 0; i < copies; i++) list.push(this.makePrefab(kind));
      this.pools.set(kind, list);
    }
    // Les ondes de choc
    const ringGeo = keep(new THREE.RingGeometry(0.8, 1, 56).rotateX(-Math.PI / 2));
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        keep(
          new THREE.MeshBasicMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            fog: false,
            toneMapped: false,
          }),
        ),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.shockIdle.push({ mesh, life: 0, max: 1, radius: 1, delay: 0, alpha: 1 });
    }
    // Les boules de feu et les éclairs de lumière
    const ball = keep(new THREE.SphereGeometry(1, 20, 14));
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        ball,
        keep(
          new THREE.MeshBasicMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false,
            toneMapped: false,
          }),
        ),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.flashIdle.push({ mesh, life: 0, max: 1, size: 1 });
    }
    // La brûlure laissée au sol par une explosion
    const burnTex = keep(sparkTexture());
    const burnGeo = keep(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(
        burnGeo,
        keep(new THREE.MeshBasicMaterial({ map: burnTex, color: 0x14100c, transparent: true, depthWrite: false })),
      );
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.scorches.push({ mesh, life: 0 });
    }
    // Les quilles, le ressort, la trompe
    for (let i = 0; i < PIN_COUNT; i++) {
      const root = items.makePin().root;
      root.scale.setScalar(1.5);
      root.visible = false;
      this.group.add(root);
      this.pinIdle.push(root);
    }
    for (let i = 0; i < 2; i++) {
      const spring = items.make("ressort").root;
      spring.visible = false;
      this.group.add(spring);
      this.springIdle.push(spring);
      const horn = items.make("klaxon").root;
      horn.visible = false;
      this.group.add(horn);
      this.hornIdle.push(horn);
    }
    // Les onomatopées
    for (const key of Object.keys(WORDS) as Word[]) {
      const sprite = new THREE.Sprite(
        keep(
          new THREE.SpriteMaterial({
            map: keep(wordTexture(key)),
            depthTest: false,
            depthWrite: false,
            transparent: true,
            fog: false,
            toneMapped: false,
          }),
        ),
      );
      sprite.renderOrder = 30;
      sprite.visible = false;
      this.group.add(sprite);
      this.pops.set(key, { sprite, life: 0, x: 0, y: 0, z: 0, tilt: 0 });
    }
    // Les éclats : des triangles, tous dans une seule forme
    const tri = keep(new THREE.BufferGeometry());
    tri.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.36, 0, 0.5, -0.36, 0, 0, 0.6, 0], 3));
    tri.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    this.shardMesh = new THREE.InstancedMesh(
      tri,
      keep(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false })),
      SHARD_COUNT,
    );
    this.shardMesh.frustumCulled = false;
    this.shardMesh.count = 1;
    this.shardMesh.setColorAt(0, new THREE.Color(0xffffff));
    this.shardMesh.setMatrixAt(0, this.tmpM.identity().scale(this.tmpS.setScalar(0.001)));
    this.shardMesh.visible = false;
    this.group.add(this.shardMesh);
    keep({ dispose: () => this.shardMesh.dispose() });
    // Les pièces attirées par l'aimant
    const coin = keep(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18).rotateX(Math.PI / 2));
    const gold = keep(new THREE.MeshStandardMaterial({ color: 0xffcf2e, metalness: 0.75, roughness: 0.25, emissive: 0x6b4a00 }));
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(coin, gold);
      mesh.visible = false;
      this.group.add(mesh);
      this.coinIdle.push(mesh);
    }
  }

  private makePrefab(kind: HazardKind): Prefab {
    const { keep, items } = this.h;
    const root = new THREE.Group();
    const pivot = new THREE.Group();
    const model = items.make(kind);
    pivot.add(model.root);
    root.add(pivot);
    root.visible = false;
    const out: Prefab = { root, pivot, model };
    const size = SIZE[kind];
    model.root.scale.setScalar(size);
    if (kind === "fusee") pivot.rotation.x = Math.PI / 2;
    if (kind === "huile") {
      // La burette renversée, dans sa flaque
      model.root.rotation.set(0.2, 0.7, 1.28);
      model.root.position.set(-0.3, 0.46, 0.2);
      const puddle = new THREE.Mesh(this.oilGeo, this.oilMat);
      const sheen = new THREE.Mesh(this.oilGeo, this.sheenMat);
      puddle.position.y = 0;
      sheen.position.y = 0.012;
      puddle.renderOrder = 2;
      sheen.renderOrder = 3;
      root.add(puddle, sheen);
      out.puddle = puddle;
      out.sheen = sheen;
    }
    if (kind === "bombe") {
      const blink = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.47 * size, 18, 14)),
        keep(new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, depthWrite: false, opacity: 0, toneMapped: false })),
      );
      blink.position.y = -0.08 * size;
      pivot.add(blink);
      out.blink = blink;
      // Au sol : le cercle du danger, et un disque qui le remplit à mesure que la mèche brûle
      const ring = new THREE.Mesh(
        keep(new THREE.RingGeometry(BOMBE_RADIUS - 0.5, BOMBE_RADIUS, 56).rotateX(-Math.PI / 2)),
        keep(new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })),
      );
      const disc = new THREE.Mesh(
        keep(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)),
        keep(
          new THREE.MeshBasicMaterial({
            color: 0xff5a2a,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            opacity: 0.3,
            fog: false,
          }),
        ),
      );
      ring.renderOrder = 3;
      disc.renderOrder = 2;
      root.add(ring, disc);
      out.ring = ring;
      out.disc = disc;
    }
    this.group.add(root);
    return out;
  }

  /** Ce qui est sur la route : on sort de la réserve les nouveaux, on y remet ceux qui ont disparu. `racers` : les pilotes, dans l'ordre des karts */
  setHazards(list: Hazard[], racers: readonly string[] = this.racers) {
    this.racers = racers;
    const ids = new Set(list.map((h) => h.id));
    for (const [id, item] of this.live) {
      if (ids.has(id)) continue;
      this.live.delete(id);
      item.root.visible = false;
      this.pools.get(item.hz.kind)!.push(item);
      this.vanish(item);
    }
    for (const hz of list) {
      if (this.live.has(hz.id)) continue;
      const pool = this.pools.get(hz.kind)!;
      const prefab = pool.pop() ?? this.makePrefab(hz.kind);
      this.live.set(hz.id, { ...prefab, hz, born: this.time, landed: false, landT: 0, last: null, launch: undefined });
      if (hz.kind === "huile") {
        const y = pointAt(this.h.track, hz.s, hz.d).y;
        prefab.root.position.set(hz.x, y + 0.1, hz.z);
        prefab.root.visible = true;
      }
    }
  }

  /** Un objet qui n'est plus là : un petit nuage à l'endroit où on l'a vu en dernier */
  private vanish(item: Live) {
    const at = item.last;
    if (!at || item.hz.kind === "bombe" || item.hz.kind === "huile" || this.h.reduced) return;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      this.h.puff(at.x, at.y, at.z, 0xe9e6e0, Math.cos(a) * 3, 1.5, Math.sin(a) * 3, 0.4, 2.2, 0.75, false);
    }
  }

  /** Une onde de choc, à plat, qui s'élargit */
  shock(x: number, y: number, z: number, radius: number, color: number, life = 0.45, delay = 0, alpha = 0.95) {
    const s = this.shockIdle.pop();
    if (!s) return;
    s.mesh.position.set(x, y, z);
    s.mesh.material.color.setHex(color);
    s.mesh.material.opacity = 0;
    s.mesh.scale.setScalar(0.5);
    s.mesh.visible = delay === 0;
    s.life = s.max = life;
    s.radius = radius;
    s.delay = delay;
    s.alpha = alpha;
    this.shocks.push(s);
  }

  /** Une boule de lumière qui gonfle et s'éteint */
  flash(x: number, y: number, z: number, size: number, color: number, life = 0.24) {
    const f = this.flashIdle.pop();
    if (!f) return;
    f.mesh.position.set(x, y, z);
    f.mesh.material.color.setHex(color);
    f.mesh.material.opacity = 1;
    f.mesh.scale.setScalar(0.2);
    f.mesh.visible = true;
    f.life = f.max = life;
    f.size = size;
    this.flashes.push(f);
  }

  /** Une explosion de bombe : la boule de feu, l'onde au sol, et la brûlure qui reste */
  blast(x: number, y: number, z: number, radius: number) {
    this.flash(x, y + 1.5, z, radius * 0.72, 0xfff0c0, 0.22);
    this.flash(x, y + 1.5, z, radius * 0.95, 0xff7a1a, 0.34);
    this.shock(x, y + 0.25, z, radius * 1.05, 0xffc069, 0.42);
    this.shock(x, y + 0.25, z, radius * 1.3, 0xffffff, 0.32, 0.05, 0.6);
    const burn = this.scorches.find((b) => b.life <= 0) ?? this.scorches[0]!;
    burn.life = 5;
    burn.mesh.visible = true;
    burn.mesh.position.set(x, y + 0.08, z);
    burn.mesh.scale.setScalar(radius * 0.9);
    this.shards_(x, y + 1.2, z, [0x2b2520, 0xff8a1f, 0xffd27a], this.h.reduced ? 6 : 16, 13, 0.7);
  }

  /** Un mot de bande dessinée qui claque au-dessus de ce qui vient d'arriver */
  word(key: Word, x: number, y: number, z: number) {
    const p = this.pops.get(key)!;
    p.life = WORD_LIFE;
    p.x = x;
    p.y = y;
    p.z = z;
    p.tilt = (Math.random() - 0.5) * 0.3;
    p.sprite.visible = true;
  }

  /** Des éclats qui volent */
  private shards_(x: number, y: number, z: number, colors: readonly number[], count: number, speed: number, life: number) {
    for (let i = 0; i < count && this.shards.length < SHARD_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.75);
      const up = 3 + Math.random() * speed * 0.8;
      this.tmpC.setHex(pick(colors));
      this.shardMesh.setColorAt(this.shards.length, this.tmpC);
      this.shards.push({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: up,
        vz: Math.sin(a) * s,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        spin: 6 + Math.random() * 12,
        life: life * (0.65 + Math.random() * 0.5),
        max: life,
        size: 0.32 + Math.random() * 0.34,
      });
    }
    if (this.shardMesh.instanceColor) this.shardMesh.instanceColor.needsUpdate = true;
  }

  /** Une caisse qui éclate : des éclats de toutes les couleurs */
  crateBurst(x: number, y: number, z: number) {
    this.shards_(x, y, z, RAINBOW, this.h.reduced ? 6 : 15, 9, 0.55);
    this.flash(x, y, z, 2.1, 0xffffff, 0.16);
  }

  /** Un bouclier qui casse : des éclats de verre bleu */
  glassBurst(x: number, y: number, z: number) {
    this.shards_(x, y, z, [0xbdefff, 0x62c8ff, 0xffffff], this.h.reduced ? 7 : 20, 11, 0.55);
    this.shock(x, y - 0.6, z, 6, 0x7fe3ff, 0.34);
  }

  /** Des gouttes qui jaillissent (de l'huile, de la crème) */
  drops(x: number, y: number, z: number, colors: readonly number[], count: number) {
    this.shards_(x, y, z, colors, this.h.reduced ? Math.ceil(count / 3) : count, 7, 0.6);
  }

  /** Les couleurs de l'arc-en-ciel */
  rainbowBurst(x: number, y: number, z: number) {
    this.shards_(x, y, z, RAINBOW, this.h.reduced ? 6 : 14, 10, 0.55);
  }

  /** Les quilles qui s'envolent autour d'un kart renversé */
  strike(k: Kart) {
    for (let i = 0; i < (this.h.reduced ? 2 : 4); i++) {
      const root = this.pinIdle.pop();
      if (!root) return;
      root.position.set(k.x, k.y + 1.1, k.z);
      root.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      root.visible = true;
      const a = (i / 4) * Math.PI * 2 + Math.random();
      this.pins.push({
        root,
        vx: Math.cos(a) * 8,
        vy: 9 + Math.random() * 4,
        vz: Math.sin(a) * 8,
        ax: 8 + Math.random() * 8,
        az: 6 + Math.random() * 8,
        life: 1.1,
      });
    }
  }

  /** Un coup de trompe : la trompe surgit au-dessus du kart, et trois ondes partent */
  horn(k: Kart, kart: number, radius: number) {
    this.shock(k.x, k.y + 0.8, k.z, radius * 0.72, 0xfff1a8, 0.36);
    this.shock(k.x, k.y + 0.8, k.z, radius * 0.96, 0xffd24a, 0.4, 0.09);
    this.shock(k.x, k.y + 0.8, k.z, radius * 1.2, 0xffffff, 0.44, 0.18, 0.7);
    const root = this.hornIdle.pop();
    if (root) {
      root.visible = true;
      this.props.push({ root, t: 0, kart, kind: "horn" });
    }
  }

  /** Le ressort qui se détend sous le kart */
  spring(kart: number) {
    const root = this.springIdle.pop();
    if (!root) return;
    root.visible = true;
    this.props.push({ root, t: 0, kart, kind: "spring" });
  }

  /** Une pièce attirée par l'aimant vers son kart */
  coinTo(kart: number, x: number, y: number, z: number) {
    const mesh = this.coinIdle.pop();
    if (!mesh) return false;
    mesh.position.set(x, y, z);
    mesh.visible = true;
    this.flying.push({ mesh, kart, t: 0, x, y, z });
    return true;
  }

  /** Une image */
  update(dt: number, serverNow: number, karts: readonly { kart: Kart }[], camera: THREE.Vector3) {
    this.time += dt;
    this.updateHazards(serverNow, dt, karts);
    this.updateEffects(dt, karts, camera);
  }

  private updateHazards(now: number, dt: number, karts: readonly { kart: Kart }[]) {
    const { track: t, puff, reduced } = this.h;
    const time = this.time;
    for (const item of this.live.values()) {
      const { hz, root, pivot } = item;
      const p = hazardPos(t, hz, now);
      if (hz.kind === "huile") {
        const grow = backOut((time - item.born) / 0.3, 1.2);
        item.puddle!.scale.setScalar(Math.max(0.01, grow));
        item.sheen!.scale.setScalar(Math.max(0.01, grow));
        item.sheen!.rotation.y = time * 0.7;
        continue;
      }
      root.visible = Boolean(p);
      if (!p) continue;
      // Il part du nez du kart qui l'a lancé, puis rejoint sa course en douceur
      if (item.launch === undefined) item.launch = launchGap(hz, p, now, karts[this.racers.indexOf(hz.owner)]?.kart);
      if (item.launch) {
        const left = launchLeft(time - item.born, item.launch.ease);
        p.x += item.launch.x * left;
        p.y += item.launch.y * left;
        p.z += item.launch.z * left;
        if (left <= 0) item.launch = null;
      }
      const pop = Math.max(0.02, backOut((time - item.born) / 0.16));
      const age = now - hz.at;
      const scale = SIZE[hz.kind];
      if (hz.kind === "petard") {
        // Il tourne sur lui-même en filant : on voit toujours sa silhouette, et ses étincelles
        root.position.set(p.x, p.y + 1.05, p.z);
        root.rotation.y = p.h;
        pivot.rotation.x = time * 15;
        pivot.scale.setScalar(pop);
        if (!reduced || Math.random() < 0.4) {
          puff(
            p.x,
            p.y + 1.05,
            p.z,
            Math.random() < 0.5 ? 0xffd27a : 0xff8a1f,
            (Math.random() - 0.5) * 3,
            1.2,
            (Math.random() - 0.5) * 3,
            0.4,
            0.9,
          );
          if (Math.random() < 0.6) puff(p.x, p.y + 0.9, p.z, 0xc9c3bc, 0, 0.7, 0, 0.55, 1.9, 0.7, false);
        }
      } else if (hz.kind === "bowling") {
        root.position.set(p.x, p.y + 1.17, p.z);
        root.rotation.y = p.h;
        pivot.rotation.x = age * 0.021;
        pivot.scale.setScalar(pop);
        if (!reduced && Math.random() < 0.5)
          puff(p.x, p.y + 0.2, p.z, 0xcfc4ad, (Math.random() - 0.5) * 3, 1.1, (Math.random() - 0.5) * 3, 0.5, 2.1, 0.7, false);
      } else if (hz.kind === "tarte") {
        root.position.set(p.x, p.y, p.z);
        pivot.rotation.set(Math.sin(time * 11) * 0.34, time * 9, 0);
        pivot.scale.setScalar(pop);
        if (!reduced && Math.random() < 0.55)
          puff(p.x, p.y - 0.2, p.z, 0xfffaf0, (Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2, 0.45, 0.5);
      } else if (hz.kind === "fusee") {
        root.position.set(p.x, p.y + Math.sin(time * 9) * 0.15, p.z);
        root.rotation.set(0, p.h, Math.sin(time * 12) * 0.14);
        item.model.root.rotation.y = time * 7;
        pivot.scale.setScalar(pop);
        const backX = p.x - Math.sin(p.h) * 1.8;
        const backZ = p.z - Math.cos(p.h) * 1.8;
        puff(
          backX,
          p.y,
          backZ,
          Math.random() < 0.35 ? 0xffb347 : 0xe6e1d8,
          (Math.random() - 0.5) * 0.7,
          0.45,
          (Math.random() - 0.5) * 0.7,
          1.1,
          3,
          0.85,
          false,
        );
        if (!reduced)
          puff(backX, p.y, backZ, 0xffd27a, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.3, 0.8);
      } else {
        // La bombe : elle vole en tournant, retombe en s'écrasant un peu, puis sa mèche brûle
        const land = pointAt(t, hz.s, hz.d);
        root.position.set(p.x, p.y + 0.35, p.z);
        const flying = age < BOMBE_FLY_MS;
        if (!flying && !item.landed) {
          item.landed = true;
          item.landT = time;
          if (!reduced)
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              puff(p.x, land.y + 0.25, p.z, 0xcfc4ad, Math.cos(a) * 4, 0.7, Math.sin(a) * 4, 0.45, 2.1, 0.75, false);
            }
        }
        const fuse = Math.max(0, Math.min(1, (age - BOMBE_FLY_MS) / (BOMBE_MS - BOMBE_FLY_MS)));
        pivot.rotation.x = flying ? age * 0.014 : 0;
        const settle = item.landed ? Math.min(1, (time - item.landT) / 0.2) : 1;
        const swell = 1 + fuse * fuse * fuse * 0.3 + (bombBlink(fuse) ? 0.05 * fuse : 0);
        pivot.scale.set(
          pop * swell * (1 + (1 - settle) * 0.3),
          pop * swell * (1 - (1 - settle) * 0.34),
          pop * swell * (1 + (1 - settle) * 0.3),
        );
        item.blink!.material.opacity = !flying && bombBlink(fuse) ? 0.52 : 0;
        const ring = item.ring!;
        const disc = item.disc!;
        ring.visible = disc.visible = age > 420;
        const groundY = land.y + 0.17 - root.position.y;
        ring.position.y = groundY;
        disc.position.y = groundY - 0.012;
        ring.material.opacity = 0.5 + 0.5 * (bombBlink(fuse) ? 1 : 0.2);
        disc.scale.setScalar(Math.max(0.01, fuse * (BOMBE_RADIUS - 0.5)));
        if (!flying && !reduced && Math.random() < 0.8) {
          const top = scale * 0.6;
          puff(
            p.x + 0.7,
            p.y + top + 0.5,
            p.z,
            Math.random() < 0.5 ? 0xffd27a : 0xff8a1f,
            (Math.random() - 0.5) * 2,
            2.2,
            (Math.random() - 0.5) * 2,
            0.32,
            0.5,
          );
        }
      }
      if (item.last) {
        item.last.x = p.x;
        item.last.y = p.y + 1;
        item.last.z = p.z;
      } else item.last = { x: p.x, y: p.y + 1, z: p.z };
    }
    void dt;
  }

  private updateEffects(dt: number, karts: readonly { kart: Kart }[], camera: THREE.Vector3) {
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i]!;
      if (s.delay > 0) {
        s.delay -= dt;
        if (s.delay > 0) continue;
        s.mesh.visible = true;
      }
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        this.shocks.splice(i, 1);
        this.shockIdle.push(s);
        continue;
      }
      const u = 1 - s.life / s.max;
      const eased = 1 - (1 - u) * (1 - u) * (1 - u);
      s.mesh.scale.setScalar(0.5 + eased * s.radius);
      s.mesh.material.opacity = s.alpha * (1 - u);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        this.flashes.splice(i, 1);
        this.flashIdle.push(f);
        continue;
      }
      const u = 1 - f.life / f.max;
      f.mesh.scale.setScalar(0.2 + (1 - (1 - u) * (1 - u)) * f.size);
      f.mesh.material.opacity = (1 - u) * (1 - u);
    }
    for (const b of this.scorches) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.mesh.material.opacity = Math.min(0.7, b.life * 0.5);
      if (b.life <= 0) b.mesh.visible = false;
    }
    for (let i = this.pins.length - 1; i >= 0; i--) {
      const p = this.pins[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.root.visible = false;
        this.pinIdle.push(p.root);
        this.pins.splice(i, 1);
        continue;
      }
      p.vy -= 26 * dt;
      p.root.position.x += p.vx * dt;
      p.root.position.y += p.vy * dt;
      p.root.position.z += p.vz * dt;
      p.root.rotation.x += p.ax * dt;
      p.root.rotation.z += p.az * dt;
    }
    for (const p of this.pops.values()) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const t = WORD_LIFE - p.life;
      const far = camera.distanceTo(this.tmpV.set(p.x, p.y, p.z));
      const base = Math.max(2.9, Math.min(8.5, far * 0.23));
      const grow = backOut(t / 0.13, 3.2);
      const out = p.life < 0.16 ? p.life / 0.16 : 1;
      p.sprite.position.set(p.x, p.y + t * 1.4, p.z);
      p.sprite.scale.set(base * grow, base * 0.5 * grow, 1);
      p.sprite.material.rotation = p.tilt;
      p.sprite.material.opacity = out;
    }
    this.updateShards(dt);
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const c = this.flying[i]!;
      c.t += dt / 0.24;
      const k = karts[c.kart]?.kart;
      if (c.t >= 1 || !k) {
        c.mesh.visible = false;
        this.coinIdle.push(c.mesh);
        this.flying.splice(i, 1);
        if (k) this.h.puff(k.x, k.y + k.air + 1, k.z, 0xffd84a, 0, 2.2, 0, 0.3, 0.8);
        continue;
      }
      const e = c.t * c.t;
      c.mesh.position.set(c.x + (k.x - c.x) * e, c.y + (k.y + k.air + 1 - c.y) * e + Math.sin(c.t * Math.PI) * 1.5, c.z + (k.z - c.z) * e);
      c.mesh.rotation.y = this.time * 16;
    }
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i]!;
      p.t += dt;
      const k = karts[p.kart]?.kart;
      const end = p.kind === "spring" ? 0.42 : 0.62;
      if (p.t >= end || !k) {
        p.root.visible = false;
        (p.kind === "spring" ? this.springIdle : this.hornIdle).push(p.root);
        this.props.splice(i, 1);
        continue;
      }
      if (p.kind === "spring") {
        // Écrasé puis détendu d'un coup : le kart décolle dessus, le ressort reste au sol et disparaît
        const u = p.t / end;
        const stretch = u < 0.18 ? 0.3 + (u / 0.18) * 1.5 : 1.8 - (u - 0.18) * 0.9;
        const shrink = u > 0.78 ? (1 - u) / 0.22 : 1;
        p.root.position.set(k.x, k.y + 0.75 * stretch, k.z);
        p.root.scale.set(1.7 * shrink, 1.4 * stretch * shrink, 1.7 * shrink);
      } else {
        const grow = backOut(p.t / 0.15, 3) * (p.t > end - 0.12 ? (end - p.t) / 0.12 : 1);
        const shake = 1 + Math.sin(p.t * 74) * 0.09;
        p.root.position.set(k.x, k.y + k.air + 2.9, k.z);
        // De profil pour qui suit le kart : la poire d'un côté, le pavillon de l'autre
        p.root.rotation.set(0, k.h + Math.PI, Math.sin(p.t * 48) * 0.16 + 0.24);
        p.root.scale.set(1.75 * grow * shake, (1.75 * grow) / shake, 1.75 * grow);
      }
    }
  }

  private updateShards(dt: number) {
    const m = this.shardMesh;
    if (this.shards.length === 0) {
      m.visible = false;
      return;
    }
    m.visible = true;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i]!;
      s.life -= dt;
      if (s.life <= 0) {
        // On met le dernier à sa place, avec sa couleur
        const last = this.shards.pop()!;
        if (i < this.shards.length) {
          this.shards[i] = last;
          m.getColorAt(this.shards.length, this.tmpC);
          m.setColorAt(i, this.tmpC);
        }
        continue;
      }
      s.vy -= 20 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.rx += s.spin * dt;
      s.ry += s.spin * 0.7 * dt;
    }
    this.shards.forEach((s, i) => {
      const a = Math.min(1, s.life / (s.max * 0.4));
      this.tmpQ.setFromEuler(this.tmpE.set(s.rx, s.ry, 0));
      this.tmpM.compose(this.tmpV.set(s.x, s.y, s.z), this.tmpQ, this.tmpS.setScalar(s.size * a));
      m.setMatrixAt(i, this.tmpM);
    });
    m.count = this.shards.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
