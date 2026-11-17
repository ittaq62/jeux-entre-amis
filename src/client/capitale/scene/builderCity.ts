import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GROUPS, SQUARES } from "../../../shared/games/capitale/board.ts";
import { BUILDS, footprint, type BuildKind, type Placed } from "../../../shared/games/capitale/builder.ts";
import {
  baseCells,
  CELLS,
  cellIndex,
  cellX,
  cellZ,
  LOTS,
  MAP,
  rectCells,
  sideOfSquare,
  TERRITORIES,
  type Lot,
  type Rect,
} from "../../../shared/games/capitale/builderMap.ts";
import type { Deed } from "../../../shared/games/capitale/engine.ts";
import * as B from "./buildings.ts";
import { CITY_HALF } from "./city.ts";
import * as LM from "./landmarks.ts";
import * as S from "./streets.ts";
import { makeCanvas, mix, signTexture } from "./textures.ts";

// Capitale Builder : la carte du centre du plateau en 3D. Le sol en cases (les territoires, le terrain vague, les rues,
// les jardins), les frontières de chaque ville à la couleur de son propriétaire, ses bâtiments posés là où il les a
// mis, et l'aperçu de ce qu'on s'apprête à poser (cases vertes ou rouges, zone d'une nuisance).
// Les bâtiments d'une ville sont fondus en quelques maillages (un par matière) ; celui qui vient d'être posé reste à
// part le temps de sortir de terre.

/** Le côté d'une case, dans le monde */
export const CELL = (2 * CITY_HALF) / MAP;

export interface WRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Le milieu d'une case, dans le monde */
export function cellCenter(cell: number): { x: number; z: number } {
  return { x: -CITY_HALF + (cellX(cell) + 0.5) * CELL, z: -CITY_HALF + (cellZ(cell) + 0.5) * CELL };
}

/** Un rectangle de cases, dans le monde */
export function rectWorld(r: Rect): WRect {
  return { x: -CITY_HALF + r.x * CELL, z: -CITY_HALF + r.z * CELL, w: r.w * CELL, d: r.d * CELL };
}

/** La case sous un point du monde, ou null hors de la carte */
export function cellAt(x: number, z: number): number | null {
  const cx = Math.floor((x + CITY_HALF) / CELL);
  const cz = Math.floor((z + CITY_HALF) / CELL);
  return cx >= 0 && cz >= 0 && cx < MAP && cz < MAP ? cellIndex(cx, cz) : null;
}

/** Le quart de tour qui tourne les façades d'une ville vers sa case du plateau (rot 0) */
const FACING: Record<ReturnType<typeof sideOfSquare>, number> = { bottom: 0, right: 1, top: 2, left: 3 };

/** Le livrée des trains de chaque gare */
const LIVERIES: Record<number, string> = { 5: "#2f5bb8", 15: "#e07a2c", 25: "#8b97a3", 35: "#c0392b" };

// ---------------------------------------------------------------------------
// Les modèles
// ---------------------------------------------------------------------------

/** Un commerce : une petite maison de la ville, sa vitrine et son store à rayures */
function shop(index: number, accent: string): THREE.Group {
  const g = new THREE.Group();
  g.add(S.cityHouse(index, accent, 1));
  const awning = B.mat(accent, { rough: 0.55 });
  const white = B.mat("#f6f1e6", { rough: 0.6 });
  for (let k = 0; k < 5; k++) {
    const strip = B.box(0.062, 0.012, 0.09, k % 2 ? white : awning, -0.124 + k * 0.062, 0.15, 0.17);
    strip.rotation.x = 0.35;
    g.add(strip);
  }
  g.add(B.box(0.25, 0.08, 0.012, B.mat("#9fc4d6", { rough: 0.2, metal: 0.3 }), 0, 0.03, 0.146));
  return B.bake(B.shadowed(g));
}

/** Un immeuble de deux cases : deux bâtiments de la ville l'un derrière l'autre, de hauteurs différentes */
function doubleBlock(index: number, accent: string, id: number): THREE.Group {
  const g = new THREE.Group();
  const front = S.cityBlock(index, accent, id % 2 ? 1 : 0);
  const back = S.cityBlock(index, accent, id % 2 ? 2 : 1);
  fitInto(front, 1, 1, 0.92);
  fitInto(back, 1, 1, 0.92);
  front.position.z += 0.5;
  back.position.z -= 0.5;
  back.rotation.y = Math.PI;
  g.add(front, back);
  return g;
}

/** Ce qui vit dans un bâtiment : le jet d'eau du parc, les mouettes de la décharge, la vapeur de la centrale */
export interface Living {
  kind: "jet" | "birds" | "steam";
  obj: THREE.Object3D;
}

/** Le modèle d'un bâtiment, à sa taille de jouet (repère : le sol au centre, la façade vers +z) */
export function buildModel(kind: BuildKind, index: number, color: string, id = 0): { obj: THREE.Object3D; living: Living | null } {
  switch (kind) {
    case "maison":
      return { obj: S.cityHouse(index, color, id % 2), living: null };
    case "commerce":
      return { obj: shop(index, color), living: null };
    case "immeuble":
      return { obj: doubleBlock(index, color, id), living: null };
    case "tour":
      return { obj: LM.skyscraper(color), living: null };
    case "monument":
      return { obj: LM.landmark(index, color), living: null };
    case "stade":
      return { obj: B.stade(color), living: null };
    case "parc": {
      const p = B.parc();
      return { obj: p.group, living: { kind: "jet", obj: p.jet } };
    }
    case "decharge": {
      const p = B.decharge();
      return { obj: p.group, living: { kind: "birds", obj: p.birds } };
    }
    case "centrale": {
      const p = B.centrale();
      return { obj: p.group, living: { kind: "steam", obj: p.steam } };
    }
  }
}

/** Le terrain vague, pour l'album : de la terre sèche, des touffes, deux piquets et une corde, un panneau « À annexer » */
export function vacantLot(): THREE.Group {
  const g = new THREE.Group();
  const earth = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.03, 40), B.mat("#c9b083", { rough: 1 }));
  earth.position.y = 0.006;
  g.add(earth);
  const tuft = B.mat("#7f9a4a", { flat: true, rough: 1 });
  const stone = B.mat("#a89a86", { flat: true, rough: 1 });
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4;
    const r = 0.08 + (k % 4) * 0.05;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(k % 3 ? 0.022 : 0.016, 0), k % 3 ? tuft : stone);
    m.position.set(Math.cos(a) * r, 0.026, Math.sin(a) * r);
    m.scale.y = k % 3 ? 1.4 : 0.7;
    g.add(m);
  }
  const wood = B.mat("#8a6236", { rough: 0.9 });
  for (const [x, z] of [
    [-0.2, 0.16],
    [0.2, 0.16],
    [0.2, -0.16],
  ] as const) {
    g.add(B.cyl(0.008, 0.009, 0.12, wood, 6, x, 0.02, z));
  }
  const rope = B.mat("#e8d9a6", { rough: 0.9 });
  g.add(B.box(0.4, 0.006, 0.006, rope, 0, 0.12, 0.16));
  g.add(B.box(0.006, 0.006, 0.32, rope, 0.2, 0.12, 0));
  // Le panneau
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.09, 0.008),
    new THREE.MeshStandardMaterial({
      map: signTexture("À ANNEXER", "#f6efe1", "#3a3226", 256, 116, '"Big Shoulders Display Variable", Impact, sans-serif', "#d9b24a"),
      roughness: 0.6,
    }),
  );
  sign.position.set(-0.04, 0.17, 0.02);
  sign.rotation.y = 0.25;
  g.add(sign, B.cyl(0.007, 0.007, 0.15, wood, 6, -0.04, 0.02, 0.012));
  return B.bake(B.shadowed(g));
}

/** Ajuste un modèle à une emprise de w × d (même unité que lui une fois mis à l'échelle), posé au sol, centré */
function fitInto(o: THREE.Object3D, w: number, d: number, margin = 0.88) {
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const s = Math.min((w * margin) / Math.max(1e-3, size.x), (d * margin) / Math.max(1e-3, size.z));
  const center = box.getCenter(new THREE.Vector3());
  o.scale.multiplyScalar(s);
  o.position.set(o.position.x - center.x * s, o.position.y - box.min.y * s, o.position.z - center.z * s);
}

/**
 * Un bâtiment posé, prêt à mettre dans la scène : son modèle ajusté à son emprise, tourné de son quart de tour, au
 * milieu de ses cases
 */
export function placedModel(b: Placed, index: number, color: string): { obj: THREE.Group; living: Living | null } {
  const info = BUILDS[b.kind];
  const { obj, living } = buildModel(b.kind, index, color, b.id);
  const quarter = (b.rot + FACING[sideOfSquare(index)]) & 3;
  // L'emprise dans le repère du modèle : un quart de tour (ou trois) échange largeur et profondeur
  const fp = footprint(b);
  const odd = (quarter & 1) === 1;
  const lw = (odd ? fp.d : fp.w) * CELL;
  const ld = (odd ? fp.w : fp.d) * CELL;
  const inner = new THREE.Group();
  if (b.kind === "immeuble") {
    // Le double immeuble est déjà en cases (1 × 2) : on le met à l'échelle d'une case, couché s'il le faut
    obj.scale.multiplyScalar(CELL);
    if (lw > ld) obj.rotation.y = Math.PI / 2;
    inner.add(obj);
  } else {
    inner.add(obj);
    fitInto(obj, lw, ld, info.w * info.d >= 4 ? 0.94 : 0.86);
  }
  const holder = new THREE.Group();
  holder.add(inner);
  holder.rotation.y = (quarter * Math.PI) / 2;
  const r = rectWorld(fp);
  holder.position.set(r.x + r.w / 2, 0, r.z + r.d / 2);
  holder.userData.square = index;
  return { obj: holder, living };
}

// ---------------------------------------------------------------------------
// Le sol
// ---------------------------------------------------------------------------

const GRASS = "#88ad5e";
const ASPHALT = "#7b7f84";
const SIDEWALK = "#d4ccbb";
const EARTH = "#cdb68a";
const PAVING = "#e7decb";

/** Un nombre entre 0 et 1, toujours le même pour une case et un sel */
const noise = (cell: number, salt: number) => {
  const v = Math.sin(cell * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

function drawGround(): HTMLCanvasElement {
  const size = 2048;
  const [canvas, ctx] = makeCanvas(size, size);
  const k = size / MAP;
  const at = (c: number) => ({ x: cellX(c) * k, y: cellZ(c) * k });
  const kindAt = (x: number, z: number) => (x >= 0 && z >= 0 && x < MAP && z < MAP ? CELLS[cellIndex(x, z)]!.kind : "garden");
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, size, size);
  CELLS.forEach((cell, c) => {
    const { x, y } = at(c);
    if (cell.kind === "street") {
      ctx.fillStyle = ASPHALT;
      ctx.fillRect(x, y, k, k);
      // Le trottoir, là où la rue s'arrête
      ctx.fillStyle = SIDEWALK;
      const cx = cellX(c);
      const cz = cellZ(c);
      const t = k * 0.14;
      if (kindAt(cx, cz - 1) !== "street") ctx.fillRect(x, y, k, t);
      if (kindAt(cx, cz + 1) !== "street") ctx.fillRect(x, y + k - t, k, t);
      if (kindAt(cx - 1, cz) !== "street") ctx.fillRect(x, y, t, k);
      if (kindAt(cx + 1, cz) !== "street") ctx.fillRect(x + k - t, y, t, k);
    } else if (cell.kind === "vague") {
      ctx.fillStyle = mix(EARTH, "#b49b6c", noise(c, 1) * 0.5);
      ctx.fillRect(x, y, k, k);
      // Quelques cailloux et touffes d'herbe sèche
      for (let n = 0; n < 4; n++) {
        ctx.fillStyle = n % 2 ? "rgba(120, 100, 60, 0.35)" : "rgba(110, 140, 70, 0.55)";
        const px = x + noise(c, 10 + n) * k * 0.8 + k * 0.1;
        const py = y + noise(c, 20 + n) * k * 0.8 + k * 0.1;
        ctx.beginPath();
        ctx.arc(px, py, k * (0.04 + noise(c, 30 + n) * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (cell.kind === "city") {
      const group = SQUARES[cell.square]!.group!;
      ctx.fillStyle = mix(GROUPS[group].color, PAVING, 0.8);
      ctx.fillRect(x, y, k, k);
    } else if (cell.kind === "lot") {
      ctx.fillStyle = cell.square < 0 ? PAVING : "#d3cab6";
      ctx.fillRect(x, y, k, k);
    } else {
      ctx.fillStyle = mix(GRASS, "#79a052", noise(c, 2));
      ctx.fillRect(x, y, k, k);
    }
  });
  // Le quadrillage, sur ce qui se bâtit ou s'annexe : on voit les cases
  ctx.lineWidth = Math.max(1, k * 0.03);
  CELLS.forEach((cell, c) => {
    if (cell.kind !== "city" && cell.kind !== "vague") return;
    const { x, y } = at(c);
    ctx.strokeStyle = cell.kind === "city" ? "rgba(90, 70, 40, 0.22)" : "rgba(90, 70, 40, 0.16)";
    ctx.strokeRect(x + 0.5, y + 0.5, k - 1, k - 1);
  });
  // La frontière de départ de chaque ville, à la couleur de son quartier
  ctx.lineWidth = k * 0.09;
  for (const [sq, r] of Object.entries(TERRITORIES)) {
    ctx.strokeStyle = mix(GROUPS[SQUARES[Number(sq)]!.group!].color, "#000000", 0.15);
    ctx.strokeRect(r.x * k + ctx.lineWidth / 2, r.z * k + ctx.lineWidth / 2, r.w * k - ctx.lineWidth, r.d * k - ctx.lineWidth);
  }
  // La place : un dallage en couronne autour du milieu
  const plaza = LOTS.find((l) => l.kind === "plaza")!;
  const pc = { x: (plaza.x + plaza.w / 2) * k, y: (plaza.z + plaza.d / 2) * k };
  ctx.strokeStyle = "rgba(150, 120, 80, 0.35)";
  ctx.lineWidth = k * 0.08;
  for (const r of [0.42, 0.3]) {
    ctx.beginPath();
    ctx.arc(pc.x, pc.y, plaza.w * k * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Les lignes blanches de la rocade intérieure
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = k * 0.05;
  ctx.setLineDash([k * 0.3, k * 0.3]);
  for (const [x0, y0, x1, y1] of [
    [7.5, 7.5, 27.5, 7.5],
    [7.5, 30.5, 27.5, 30.5],
    [7.5, 7.5, 7.5, 30.5],
    [27.5, 7.5, 27.5, 30.5],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0 * k, y0 * k);
    ctx.lineTo(x1 * k, y1 * k);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  return canvas;
}

// ---------------------------------------------------------------------------
// La ville
// ---------------------------------------------------------------------------

/** Ce que la scène prête à la carte : ses animations et ses sons */
export interface BuilderHooks {
  rise: (o: THREE.Object3D, dur: number, delay?: number, sound?: boolean) => void;
  popIn: (o: THREE.Object3D) => void;
  remove: (o: THREE.Object3D, animate: boolean) => void;
  dust: (parent: THREE.Object3D, x: number, z: number, size: number) => void;
  lookAt: (p: THREE.Vector3) => void;
  flag: (cloth: THREE.Object3D) => void;
  dirty: () => void;
  /** L'heure de la scène, en secondes */
  now: () => number;
}

/** L'aperçu de ce qu'on fait sur la carte : un bâtiment à poser, des cases à colorer, un bâtiment choisi */
export interface BuilderPreview {
  /** Les cases à colorer : où le bâtiment tiendrait (ok), où il déborde (bad), ce qu'on peut annexer, la zone d'une nuisance */
  cells: { cell: number; tone: "ok" | "bad" | "annex" | "reach" | "area" }[];
  /** Le bâtiment fantôme, à sa place */
  ghost: (Placed & { square: number; ok: boolean; color: string }) | null;
  /** Le bâtiment choisi (pour le déplacer, le tourner, le démolir) : un cadre autour */
  selected: Rect | null;
}

interface CityObj {
  square: number;
  /** Les bâtiments fondus ensemble, et ce qu'ils représentent */
  baked: THREE.Group | null;
  bakedKey: string;
  /** Les bâtiments posés à part : ceux qui vivent (parc, nuisances), ceux qui sortent de terre */
  loose: Map<number, { obj: THREE.Group; key: string; living: Living | null; until: number }>;
  /** Ce que la ville montre de son propriétaire : le voile de ses cases, sa frontière, son drapeau */
  owned: THREE.Group | null;
  ownedKey: string;
  sale: THREE.Object3D | null;
  fence: THREE.Object3D | null;
  shown: Placed[];
}

const TONES: Record<BuilderPreview["cells"][number]["tone"], [string, number]> = {
  ok: ["#43c463", 0.55],
  bad: ["#e5483d", 0.6],
  annex: ["#ffc23a", 0.5],
  reach: ["#ff7a1a", 0.42],
  area: ["#ffffff", 0.22],
};

/** Le dessin de la carte de Builder, et ce qui y est bâti */
export class BuilderCity {
  readonly root = new THREE.Group();
  /** Les objets qu'on peut viser (le sol de la carte) */
  readonly pickable: THREE.Mesh;
  /** Le décor qui ne bouge pas : la scène le fond avec le sien */
  readonly decor = new THREE.Group();
  readonly living: Living[] = [];
  /** Ce qui tourne (les éoliennes) et l'eau du barrage */
  readonly rotors: { obj: THREE.Object3D; speed: number }[] = [];
  water: THREE.Mesh | null = null;
  /** Les gares et les réseaux : un repère à leur place, pour le drapeau et la palissade de leur propriétaire */
  readonly lotRoots = new Map<number, THREE.Group>();
  private hooks: BuilderHooks;
  private cities = new Map<number, CityObj>();
  private overlay: THREE.Mesh | null = null;
  private ghost: { key: string; obj: THREE.Group } | null = null;
  private selectFrame: THREE.Mesh | null = null;
  private ghostMats = new Map<string, THREE.Material>();
  private stationFlags = new Map<number, { key: string; obj: THREE.Object3D | null; fence: THREE.Object3D | null }>();

  constructor(hooks: BuilderHooks) {
    this.hooks = hooks;
    const tex = new THREE.CanvasTexture(drawGround());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * CITY_HALF, 2 * CITY_HALF),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.004;
    ground.receiveShadow = true;
    ground.name = "builder-ground";
    this.pickable = ground;
    this.root.add(ground);
    this.addLots();
    this.addGardens();
    for (const sq of Object.keys(TERRITORIES).map(Number)) {
      const obj: CityObj = {
        square: sq,
        baked: null,
        bakedKey: "",
        loose: new Map(),
        owned: null,
        ownedKey: "",
        sale: null,
        fence: null,
        shown: [],
      };
      // Le panneau « à vendre », au milieu du territoire
      const r = rectWorld(TERRITORIES[sq]!);
      const sale = B.forSale();
      sale.scale.setScalar(0.62);
      sale.position.set(r.x + r.w / 2, 0, r.z + r.d / 2);
      this.root.add(sale);
      obj.sale = sale;
      this.cities.set(sq, obj);
    }
  }

  /** Les gares, les réseaux, les impôts, le péage, la banque et le kiosque, chacun sur son lot */
  private addLots() {
    for (const l of LOTS) {
      const r = rectWorld(l);
      const g = new THREE.Group();
      g.position.set(r.x + r.w / 2, 0, r.z + r.d / 2);
      const fit = (o: THREE.Object3D, margin = 0.9) => {
        const holder = new THREE.Group();
        holder.add(o);
        fitInto(o, r.w, r.d, margin);
        g.add(holder);
        return holder;
      };
      // Les gares et le péage regardent la rue la plus proche ; les autres, la place
      switch (l.kind) {
        case "station": {
          const s = B.station(LIVERIES[l.square] ?? "#2f5bb8");
          if (r.d > r.w) s.rotation.y = Math.PI / 2;
          fit(s);
          break;
        }
        case "utility":
          if (l.square === 12) {
            const dam = B.dam();
            dam.water.userData.keep = true;
            fit(dam.group);
            this.water = dam.water;
          } else {
            for (const [x, z, h] of [
              [-0.3, 0.25, 0.85],
              [0.28, -0.1, 1],
              [-0.05, -0.32, 0.75],
            ] as const) {
              const t = B.turbine(h);
              t.group.scale.setScalar(0.62);
              t.group.position.set(x * r.w, 0, z * r.d);
              g.add(t.group);
              this.rotors.push({ obj: t.rotor, speed: 1.4 + h * 0.6 });
            }
          }
          break;
        case "tax":
          fit(B.taxOffice());
          break;
        case "toll":
          fit(B.tollBooth(), 0.8);
          break;
        case "bank":
          fit(B.bank(), 0.95);
          break;
        case "kiosk": {
          const k = fit(B.kiosk(), 0.7);
          k.position.z = -r.d * 0.18;
          break;
        }
        case "plaza": {
          // Des réverbères et des arbres au bord de la place : le milieu reste aux dés
          const spots: { x: number; z: number; s: number; kind: number }[] = [];
          for (let n = 0; n < 8; n++) {
            const a = (n / 8) * Math.PI * 2 + Math.PI / 8;
            const x = Math.cos(a) * r.w * 0.44;
            const z = Math.sin(a) * r.d * 0.44;
            if (n % 2) spots.push({ x, z, s: 0.75, kind: 0 });
            else {
              const lamp = B.lamp();
              lamp.position.set(x, 0, z);
              g.add(lamp);
            }
          }
          g.add(B.trees(spots));
          break;
        }
      }
      if (l.kind === "station" || l.kind === "utility") {
        // Le drapeau et la palissade du propriétaire vont sur un repère à part : le décor, lui, est fondu
        const mark = new THREE.Group();
        mark.position.copy(g.position);
        mark.userData.square = l.square;
        this.root.add(mark);
        this.lotRoots.set(l.square, mark);
        g.userData.square = l.square;
      }
      // Le décor qui ne bouge pas est fondu ; ce qui tourne (les éoliennes) reste à part
      if (l.square === 28) this.root.add(g);
      else this.decor.add(g);
    }
  }

  /** Quelques arbres sur les jardins, jamais deux de suite */
  private addGardens() {
    const spots: { x: number; z: number; s: number; kind: number }[] = [];
    CELLS.forEach((cell, c) => {
      if (cell.kind !== "garden" || noise(c, 5) > 0.42) return;
      const p = cellCenter(c);
      spots.push({
        x: p.x + (noise(c, 6) - 0.5) * CELL * 0.4,
        z: p.z + (noise(c, 7) - 0.5) * CELL * 0.4,
        s: 0.55 + noise(c, 8) * 0.3,
        kind: noise(c, 9) > 0.7 ? 1 : 0,
      });
    });
    this.decor.add(B.trees(spots));
  }

  /** Où sont les cartes, la banque : pour la scène */
  lotCenter(kind: Lot["kind"]): THREE.Vector3 {
    const l = LOTS.find((x) => x.kind === kind)!;
    const r = rectWorld(l);
    return new THREE.Vector3(r.x + r.w / 2, 0, r.z + r.d / 2);
  }

  /** Le rectangle qui englobe le territoire d'une ville (avec ce qu'elle a annexé) */
  areaBox(square: number, deed: Deed | null | undefined): WRect {
    const cells = [...baseCells(square), ...(deed?.annexed ?? [])];
    const xs = cells.map(cellX);
    const zs = cells.map(cellZ);
    const x0 = Math.min(...xs);
    const z0 = Math.min(...zs);
    return rectWorld({ x: x0, z: z0, w: Math.max(...xs) - x0 + 1, d: Math.max(...zs) - z0 + 1 });
  }

  /** La frontière d'un ensemble de cases : des baguettes le long des bords qui ne touchent pas une autre case du lot */
  static border(cells: Set<number>, t: number, h: number): THREE.BufferGeometry | null {
    const geos: THREE.BufferGeometry[] = [];
    for (const c of cells) {
      const p = cellCenter(c);
      const x = cellX(c);
      const z = cellZ(c);
      const sides: [number, number, number, number][] = [
        [x, z - 1, 0, -1],
        [x, z + 1, 0, 1],
        [x - 1, z, -1, 0],
        [x + 1, z, 1, 0],
      ];
      for (const [nx, nz, dx, dz] of sides) {
        const inside = nx >= 0 && nz >= 0 && nx < MAP && nz < MAP && cells.has(cellIndex(nx, nz));
        if (inside) continue;
        const geo = new THREE.BoxGeometry(dx === 0 ? CELL + t : t, h, dz === 0 ? CELL + t : t);
        geo.translate(p.x + (dx * (CELL - t)) / 2, h / 2, p.z + (dz * (CELL - t)) / 2);
        geos.push(geo);
      }
    }
    if (geos.length === 0) return null;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }

  /** Un voile à plat sur des cases */
  static veil(cells: Iterable<number>, y: number): THREE.BufferGeometry | null {
    const geos: THREE.BufferGeometry[] = [];
    for (const c of cells) {
      const p = cellCenter(c);
      const geo = new THREE.PlaneGeometry(CELL, CELL);
      geo.rotateX(-Math.PI / 2);
      geo.translate(p.x, y, p.z);
      geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }

  // -------------------------------------------------------------------------
  // L'état
  // -------------------------------------------------------------------------

  sync(
    deeds: Record<number, { owner: string | null; mortgaged: boolean; lot?: Placed[]; annexed?: number[] }>,
    colorOf: (id: string | null) => string,
    animate: boolean,
  ) {
    for (const [sq, o] of this.cities) this.syncCity(o, deeds[sq] ?? null, colorOf, animate);
    for (const [sq, g] of this.lotRoots) {
      const d = deeds[sq];
      if (!d) continue;
      const key = `${d.owner}|${d.mortgaged}`;
      const prev = this.stationFlags.get(sq);
      if (prev?.key === key) continue;
      if (prev?.obj) this.hooks.remove(prev.obj, animate);
      if (prev?.fence) this.hooks.remove(prev.fence, animate);
      const entry = { key, obj: null as THREE.Object3D | null, fence: null as THREE.Object3D | null };
      const l = LOTS.find((x) => x.square === sq)!;
      const r = rectWorld(l);
      if (d.owner) {
        const flag = B.flag(colorOf(d.owner));
        flag.scale.setScalar(0.7);
        flag.position.set(r.w * 0.42, 0, -r.d * 0.42);
        g.add(flag);
        this.hooks.flag(flag.getObjectByName("cloth")!);
        if (animate) this.hooks.popIn(flag);
        entry.obj = flag;
      }
      if (d.mortgaged) {
        const fence = B.fence(r.w * 1.05, r.d * 1.05);
        g.add(fence);
        if (animate) this.hooks.popIn(fence);
        entry.fence = fence;
      }
      this.stationFlags.set(sq, entry);
    }
  }

  private syncCity(
    o: CityObj,
    d: { owner: string | null; mortgaged: boolean; lot?: Placed[]; annexed?: number[] } | null,
    colorOf: (id: string | null) => string,
    animate: boolean,
  ) {
    const owner = d?.owner ?? null;
    const color = colorOf(owner);
    const area = new Set([...baseCells(o.square), ...(d?.annexed ?? [])]);
    // Le propriétaire : ses cases voilées de sa couleur, sa frontière, son drapeau
    const ownedKey = owner ? `${owner}|${color}|${[...area].sort((a, b) => a - b).join(",")}` : "";
    if (ownedKey !== o.ownedKey) {
      const grew = owner !== null && o.ownedKey.startsWith(`${owner}|`) && area.size > o.ownedKey.split(",").length;
      o.ownedKey = ownedKey;
      if (o.owned) {
        // Par la scène : le drapeau quitte aussi la liste de ceux qu'elle anime (et les géométries sont libérées)
        const veil = o.owned.children.find((c) => c.userData.ownerVeil) as THREE.Mesh | undefined;
        (veil?.material as THREE.Material | undefined)?.dispose();
        this.hooks.remove(o.owned, false);
      }
      o.owned = null;
      if (owner) {
        const g = new THREE.Group();
        const veil = BuilderCity.veil(area, 0.006);
        if (veil) {
          const m = new THREE.Mesh(veil, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false }));
          m.renderOrder = 1;
          m.userData.ownerVeil = true;
          g.add(m);
        }
        const line = BuilderCity.border(area, 0.034, 0.018);
        if (line) {
          const m = new THREE.Mesh(line, B.mat(color, { rough: 0.5 }));
          m.receiveShadow = true;
          g.add(m);
        }
        // Le drapeau, au coin du territoire le plus proche du plateau
        const r = rectWorld(TERRITORIES[o.square]!);
        const side = sideOfSquare(o.square);
        const flag = B.flag(color);
        flag.scale.setScalar(0.62);
        const fx = side === "left" ? r.x + CELL * 0.35 : r.x + r.w - CELL * 0.35;
        const fz = side === "top" ? r.z + CELL * 0.35 : r.z + r.d - CELL * 0.35;
        flag.position.set(fx, 0, fz);
        g.add(flag);
        this.hooks.flag(flag.getObjectByName("cloth")!);
        this.root.add(g);
        o.owned = g;
        if (animate && !grew) {
          this.hooks.popIn(flag);
          this.hooks.lookAt(new THREE.Vector3(r.x + r.w / 2, 0, r.z + r.d / 2));
        }
      }
      if (o.sale) o.sale.visible = owner === null;
    }
    // Hypothèque : une palissade autour du territoire
    const mortgaged = Boolean(d?.mortgaged);
    if (mortgaged !== Boolean(o.fence)) {
      if (o.fence) this.hooks.remove(o.fence, animate);
      o.fence = null;
      if (mortgaged) {
        const r = this.areaBox(o.square, d as Deed);
        const fence = B.fence(r.w, r.d);
        fence.position.set(r.x + r.w / 2, 0, r.z + r.d / 2);
        this.root.add(fence);
        if (animate) this.hooks.popIn(fence);
        o.fence = fence;
      }
    }
    this.syncBuildings(o, owner ? (d?.lot ?? []) : [], color, animate);
  }

  private syncBuildings(o: CityObj, lot: Placed[], color: string, animate: boolean) {
    const keyOf = (b: Placed) => `${b.id}:${b.kind}:${b.x}:${b.z}:${b.rot & 3}`;
    const before = new Map(o.shown.map((b) => [b.id, keyOf(b)]));
    const now = new Map(lot.map((b) => [b.id, keyOf(b)]));
    const t = this.hooks.now();
    // Ce qui est parti : un nuage de poussière là où il était
    for (const b of o.shown) {
      if (now.get(b.id) === keyOf(b)) continue;
      const loose = o.loose.get(b.id);
      if (loose) {
        this.dropLiving(loose.living);
        this.hooks.remove(loose.obj, animate && !now.has(b.id));
        o.loose.delete(b.id);
      }
      if (animate && !now.has(b.id)) {
        const r = rectWorld(footprint(b));
        this.hooks.dust(this.root, r.x + r.w / 2, r.z + r.d / 2, Math.max(r.w, r.d) * 0.7);
      }
    }
    // Ce qui arrive : à part, le temps de sortir de terre ; ce qui vit (parc, nuisances) reste à part
    for (const b of lot) {
      if (before.get(b.id) === keyOf(b) && (o.loose.has(b.id) || o.bakedKey.includes(`|${keyOf(b)}|`))) continue;
      const fresh = !before.has(b.id);
      if (!animate && !BUILDS[b.kind].nuisance && b.kind !== "parc") continue;
      const { obj, living } = placedModel(b, o.square, color);
      this.root.add(obj);
      if (living) this.living.push(living);
      const stays = living !== null;
      o.loose.set(b.id, { obj, key: keyOf(b), living, until: stays ? Infinity : t + (fresh && animate ? 1.2 : 0) });
      if (animate && fresh) {
        this.hooks.rise(obj, b.kind === "monument" ? 1.1 : 0.55, 0, true);
        const r = rectWorld(footprint(b));
        this.hooks.dust(this.root, r.x + r.w / 2, r.z + r.d / 2, Math.max(r.w, r.d) * 0.7);
        this.hooks.lookAt(new THREE.Vector3(r.x + r.w / 2, 0, r.z + r.d / 2));
      } else if (animate) this.hooks.popIn(obj);
    }
    o.shown = lot.map((b) => ({ ...b }));
    // Les bâtiments fondus : refaits quand la ville change (sans ceux qui sont encore à part)
    if (o.shown.length !== before.size || [...now].some(([id, k]) => before.get(id) !== k) || o.bakedKey.split("|")[0] !== color) {
      this.rebake(o, color, false);
    }
  }

  /** Refond les bâtiments d'une ville : tous, sauf ceux qui vivent et ceux qui sortent encore de terre */
  private rebake(o: CityObj, color: string, settle: boolean) {
    const t = this.hooks.now();
    if (settle) {
      for (const [id, l] of o.loose) {
        if (l.until > t) continue;
        this.root.remove(l.obj);
        l.obj.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
        o.loose.delete(id);
      }
    }
    const still = new Set(o.loose.keys());
    const keyOf = (b: Placed) => `${b.id}:${b.kind}:${b.x}:${b.z}:${b.rot & 3}`;
    const bakedList = o.shown.filter((b) => !still.has(b.id));
    const key = `${color}|${bakedList.map(keyOf).join("|")}|`;
    if (key === o.bakedKey) return;
    o.bakedKey = key;
    if (o.baked) {
      this.root.remove(o.baked);
      o.baked.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    }
    o.baked = null;
    if (bakedList.length === 0) return;
    const group = new THREE.Group();
    for (const b of bakedList) group.add(placedModel(b, o.square, color).obj);
    o.baked = B.bake(group);
    o.baked.userData.square = o.square;
    this.root.add(o.baked);
    this.hooks.dirty();
  }

  private dropLiving(l: Living | null) {
    if (!l) return;
    const k = this.living.indexOf(l);
    if (k >= 0) this.living.splice(k, 1);
  }

  /** À chaque image : ce qui a fini de sortir de terre rejoint les bâtiments fondus de sa ville */
  update() {
    const t = this.hooks.now();
    for (const o of this.cities.values()) {
      let due = false;
      for (const l of o.loose.values()) if (l.until <= t) due = true;
      if (due) this.rebake(o, o.bakedKey.split("|")[0] || "#ffffff", true);
    }
  }

  /** Les bâtiments d'une ville tremblent (une catastrophe) */
  shake(square: number): THREE.Object3D[] {
    const o = this.cities.get(square);
    if (!o) return [];
    return [...(o.baked ? [o.baked] : []), ...[...o.loose.values()].map((l) => l.obj)];
  }

  /** Les objets d'une ville, pour le filtre des villes (les autres passent en maquette) */
  cityObjects(square: number): THREE.Object3D[] {
    const o = this.cities.get(square);
    if (!o) return [];
    return [...(o.baked ? [o.baked] : []), ...[...o.loose.values()].map((l) => l.obj), ...(o.owned ? [o.owned] : [])];
  }

  // -------------------------------------------------------------------------
  // L'aperçu
  // -------------------------------------------------------------------------

  setPreview(p: BuilderPreview | null) {
    this.hooks.dirty();
    if (this.overlay) {
      this.root.remove(this.overlay);
      this.overlay.geometry.dispose();
      (this.overlay.material as THREE.Material).dispose();
      this.overlay = null;
    }
    if (this.selectFrame) {
      this.root.remove(this.selectFrame);
      this.selectFrame.geometry.dispose();
      (this.selectFrame.material as THREE.Material).dispose();
      this.selectFrame = null;
    }
    if (p && p.cells.length > 0) {
      const geos: THREE.BufferGeometry[] = [];
      for (const { cell, tone } of p.cells) {
        const [hex, alpha] = TONES[tone];
        const c = new THREE.Color(hex);
        const pt = cellCenter(cell);
        const inset = tone === "reach" || tone === "area" ? 0 : CELL * 0.06;
        const geo = new THREE.PlaneGeometry(CELL - inset * 2, CELL - inset * 2);
        geo.rotateX(-Math.PI / 2);
        geo.translate(pt.x, tone === "reach" ? 0.009 : 0.012, pt.z);
        const n = geo.attributes.position!.count;
        const colors = new Float32Array(n * 4);
        for (let k = 0; k < n; k++) colors.set([c.r, c.g, c.b, alpha], k * 4);
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 4));
        geos.push(geo);
      }
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (merged) {
        this.overlay = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
        this.overlay.renderOrder = 3;
        this.root.add(this.overlay);
      }
    }
    if (p?.selected) {
      const cells = new Set(rectCells(p.selected));
      const geo = BuilderCity.border(cells, 0.04, 0.05);
      if (geo) {
        this.selectFrame = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#ffb000" }));
        this.root.add(this.selectFrame);
      }
    }
    const g = p?.ghost ?? null;
    const key = g ? `${g.kind}|${g.square}|${g.color}|${g.ok}|${g.rot & 3}|${g.x}|${g.z}` : "";
    if (this.ghost && this.ghost.key !== key) {
      // Un modèle neuf à chaque case visée : l'ancien est libéré (ses matières, des copies gardées, restent pour le suivant)
      this.root.remove(this.ghost.obj);
      this.ghost.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.ghost = null;
    }
    if (g && !this.ghost) {
      // Quelques modèles font une matière neuve à chaque fois (fanions, jets d'eau) : leurs copies fantômes ne
      // s'entassent pas sans fin (aucune n'est montrée à cet instant : l'ancien fantôme vient de partir)
      if (this.ghostMats.size >= 400) {
        for (const m of this.ghostMats.values()) m.dispose();
        this.ghostMats.clear();
      }
      const { obj } = placedModel({ ...g, id: 1 }, g.square, g.color);
      obj.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const ghosts = mats.map((mt) => this.ghostOf(mt, g.ok));
        mesh.material = Array.isArray(mesh.material) ? ghosts : ghosts[0]!;
      });
      obj.position.y = 0.02;
      this.root.add(obj);
      this.ghost = { key, obj };
    }
  }

  /** La matière d'un bâtiment fantôme : la même, à moitié transparente, teintée de rouge s'il ne tient pas */
  private ghostOf(m: THREE.Material, ok: boolean): THREE.Material {
    const key = `${m.uuid}|${ok}`;
    let g = this.ghostMats.get(key);
    if (!g) {
      const c = m.clone() as THREE.MeshStandardMaterial;
      c.transparent = true;
      c.opacity = ok ? 0.72 : 0.55;
      c.depthWrite = false;
      if (!ok && c.color) c.color.lerp(new THREE.Color("#ff3b30"), 0.65);
      g = c;
      this.ghostMats.set(key, g);
    }
    return g;
  }

  dispose() {
    for (const m of this.ghostMats.values()) m.dispose();
    this.ghostMats.clear();
  }
}
