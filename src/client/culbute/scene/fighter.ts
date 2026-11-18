// Un combattant de Culbute en 3D : un petit personnage à grosse tête (celle de l'avatar, ses cheveux et son chapeau),
// habillé selon qui il est (la robe à pois de Ginette, le gilet tricoté de Marcel, le châle de Huguette…), des bras et
// des jambes qui se plient vers des points visés, et l'accessoire de son style dans la main. Chaque coup a sa posture :
// il arme, frappe, puis revient, et l'accessoire laisse une traînée ; le serveur dit où il en est, le dessin fait le reste.

import * as THREE from "three";
import { AVATAR_HAIR_COLORS, AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import type { Palette } from "../../../shared/games/culbute/fighters.ts";
import { moveDef } from "../../../shared/games/culbute/engine.ts";
import type { HabitueId, ItemKind } from "../../../shared/games/culbute/model.ts";
import type { PoseId } from "../../../shared/games/culbute/moves.ts";
import { STYLES } from "../../../shared/games/culbute/styles.ts";
import { F_CREAM, F_FAST, F_INTANG, F_STOP } from "../../../shared/games/culbute/view.ts";
import { hairGeometry, hatGroup } from "../../bolides/scene/pilot.ts";
import type { RenderFighter } from "../runtime.ts";
import { cloth, dotsTexture, knitTexture, limb, loft, merge, mitten, shoe } from "./body.ts";
import { accordionModel, itemModel, propModel, type Accordion, type Keep } from "./props.ts";

export interface FighterLook {
  slot: number;
  name: string;
  avatar: AvatarConfig;
  style: HabitueId;
  palette: Palette;
  /** La couleur du joueur (son repère, sa garde) */
  color: string;
  me: boolean;
  /** Un bot : au-dessus de sa tête, seulement un repère à sa couleur (son nom est en bas de l'écran) */
  bot?: boolean;
  /** Ses habits : ceux d'un Habitué, ou un haut et un pantalon pour son propre personnage */
  outfit: HabitueId | "moi";
  /** La peau de sa tête, avec les traits de l'avatar (dessinée à part, elle arrive un peu après) */
  head?: HTMLCanvasElement | null;
}

type V3 = [number, number, number];

interface Pose {
  crouch: number;
  lean: number;
  twist: number;
  spinX: number;
  spinY: number;
  liftY: number;
  /** La main de l'accessoire (à droite), puis l'autre */
  hands: [V3, V3];
  feet: [V3, V3];
  headTilt: number;
}

const HEIGHT = 1.55;
const PIVOT = 0.72;
const HEAD_R = 0.34;
const HIPS_Y = 0.5;
const SHOULDER_Y = 0.92;
const SHOULDER_X = 0.25;
const UPPER = 0.26;
const FORE = 0.25;
const THIGH = 0.235;
const SHIN = 0.215;

const REST: Pose = {
  crouch: 0,
  lean: 0.05,
  twist: 0,
  spinX: 0,
  spinY: 0,
  liftY: 0,
  hands: [
    [-0.3, 0.55, 0.14],
    [0.3, 0.55, 0.14],
  ],
  feet: [
    [-0.12, 0, 0.05],
    [0.12, 0, -0.05],
  ],
  headTilt: 0,
};

const AIR: Pose = {
  ...REST,
  hands: [
    [-0.36, 0.88, 0.1],
    [0.36, 0.88, 0.1],
  ],
  feet: [
    [-0.12, 0.2, 0.14],
    [0.12, 0.08, -0.1],
  ],
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lv = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const ease = (k: number) => k * k * (3 - 2 * k);

function blend(a: Pose, b: Pose, k: number): Pose {
  return {
    crouch: lerp(a.crouch, b.crouch, k),
    lean: lerp(a.lean, b.lean, k),
    twist: lerp(a.twist, b.twist, k),
    spinX: lerp(a.spinX, b.spinX, k),
    spinY: lerp(a.spinY, b.spinY, k),
    liftY: lerp(a.liftY, b.liftY, k),
    hands: [lv(a.hands[0], b.hands[0], k), lv(a.hands[1], b.hands[1], k)],
    feet: [lv(a.feet[0], b.feet[0], k), lv(a.feet[1], b.feet[1], k)],
    headTilt: lerp(a.headTilt, b.headTilt, k),
  };
}

const with_ = (base: Pose, p: Partial<Pose>): Pose => ({ ...base, ...p });

/** Pour chaque posture d'attaque : bras armé, puis coup porté */
function keyPoses(pose: PoseId, base: Pose): [Pose, Pose] {
  const R = (x: number, y: number, z: number): V3 => [x, y, z];
  const L = base.hands[1];
  switch (pose) {
    case "jab":
      return [
        with_(base, { hands: [R(-0.25, 0.85, -0.05), L], twist: 0.3 }),
        with_(base, { hands: [R(-0.12, 0.85, 0.74), L], twist: -0.25, lean: 0.12 }),
      ];
    case "side":
      return [
        with_(base, { hands: [R(-0.35, 1.05, -0.35), L], twist: 0.6 }),
        with_(base, { hands: [R(-0.08, 0.8, 0.95), R(0.3, 0.6, -0.2)], twist: -0.5, lean: 0.25, feet: [R(-0.12, 0, 0.3), base.feet[1]] }),
      ];
    case "up":
      return [
        with_(base, { hands: [R(-0.3, 0.45, -0.15), L], crouch: 0.08 }),
        with_(base, { hands: [R(-0.05, 1.78, 0.12), R(0.3, 1.0, 0.1)], lean: -0.2 }),
      ];
    case "low":
      return [
        with_(base, { hands: [R(-0.3, 0.35, -0.25), L], crouch: 0.15 }),
        with_(base, { hands: [R(-0.15, 0.15, 0.9), L], crouch: 0.22, lean: 0.45, feet: [R(-0.12, 0, 0.35), R(0.12, 0, -0.3)] }),
      ];
    case "spin": {
      const out = with_(base, { hands: [R(-0.68, 0.78, 0), R(0.68, 0.78, 0)] });
      return [out, out];
    }
    case "airFwd":
      return [
        with_(base, { hands: [R(-0.3, 1.1, -0.3), L], twist: 0.5 }),
        with_(base, { hands: [R(-0.05, 0.75, 0.95), L], twist: -0.4, lean: 0.3 }),
      ];
    case "airUp":
      return [with_(base, { hands: [R(-0.2, 0.5, -0.3), L] }), with_(base, { hands: [R(0, 1.82, 0.02), R(0.25, 1.4, 0)], lean: -0.35 })];
    case "airDown":
      return [
        with_(base, { hands: [R(-0.2, 1.5, 0.1), L], lean: -0.1 }),
        with_(base, { hands: [R(-0.05, -0.25, 0.25), L], lean: 0.4, feet: [R(-0.12, 0.35, -0.1), R(0.12, 0.3, -0.15)] }),
      ];
    case "smashSide":
      return [
        with_(base, { hands: [R(-0.4, 1.05, -0.6), L], twist: 0.9, lean: -0.15, crouch: 0.08 }),
        with_(base, { hands: [R(-0.05, 0.85, 1.15), R(0.3, 0.6, -0.3)], twist: -0.6, lean: 0.35, feet: [R(-0.12, 0, 0.42), base.feet[1]] }),
      ];
    case "smashUp":
      return [
        with_(base, { hands: [R(-0.25, 0.25, 0.1), R(0.25, 0.25, 0.1)], crouch: 0.25 }),
        with_(base, { hands: [R(-0.05, 1.98, 0.1), R(0.15, 1.75, 0.1)], lean: -0.15, crouch: -0.08 }),
      ];
    case "smashDown":
      return [
        with_(base, { hands: [R(-0.2, 1.4, 0.2), L], crouch: 0.05 }),
        with_(base, { hands: [R(-0.1, 0.15, 0.95), L], crouch: 0.25, lean: 0.35, spinY: Math.PI }),
      ];
    case "throw":
      return [
        with_(base, { hands: [R(-0.3, 1.15, -0.4), L], twist: 0.5 }),
        with_(base, { hands: [R(-0.15, 1.0, 0.8), L], twist: -0.3, lean: 0.15 }),
      ];
    case "lob":
      return [with_(base, { hands: [R(-0.3, 0.3, -0.45), L], crouch: 0.12 }), with_(base, { hands: [R(-0.2, 0.9, 0.75), L], lean: 0.05 })];
    case "lunge":
      return [
        with_(base, { hands: [R(-0.3, 0.9, -0.1), L], crouch: 0.1 }),
        with_(base, { hands: [R(-0.08, 0.85, 0.95), R(0.3, 0.7, -0.3)], lean: 0.55 }),
      ];
    case "rise": {
      const up = with_(base, {
        hands: [R(-0.3, 1.72, 0.1), R(0.3, 1.72, 0.1)],
        feet: [R(-0.08, 0, 0), R(0.08, 0, 0)],
      });
      return [with_(base, { crouch: 0.15 }), up];
    }
    case "slam":
      return [
        with_(base, { hands: [R(-0.15, 1.82, -0.1), R(0.15, 1.82, -0.1)], lean: -0.2 }),
        with_(base, { hands: [R(-0.1, 0.35, 0.85), R(0.1, 0.35, 0.85)], crouch: 0.2, lean: 0.5 }),
      ];
    case "counter": {
      const guard = with_(base, { hands: [R(-0.1, 1.0, 0.45), R(0.25, 0.8, 0.3)], lean: -0.15, crouch: 0.08 });
      return [guard, guard];
    }
    case "sit":
    case "stomp":
      return [
        with_(base, { crouch: -0.1, feet: [R(-0.12, 0.35, 0.1), R(0.12, 0.35, 0.1)], hands: [R(-0.3, 1.2, 0), R(0.3, 1.2, 0)] }),
        with_(base, { crouch: 0.28, lean: 0.2 }),
      ];
    case "cast":
      return [with_(base, { hands: [R(-0.3, 1.0, -0.2), L] }), with_(base, { hands: [R(-0.1, 1.3, 0.85), L], lean: 0.1 })];
    case "blow":
      return [
        with_(base, { hands: [R(-0.35, 0.9, 0.1), R(0.35, 0.9, 0.1)] }),
        with_(base, { hands: [R(-0.12, 0.9, 0.55), R(0.12, 0.9, 0.55)], lean: 0.15 }),
      ];
    case "climb":
      return [with_(base, { hands: [R(-0.2, 0.1, 0.4), R(0.2, 0.1, 0.4)], crouch: 0.2 }), base];
    case "pickup":
      return [with_(base, { crouch: 0.15 }), with_(base, { hands: [R(-0.15, 0.1, 0.45), L], crouch: 0.3, lean: 0.6 })];
    case "taunt":
      // Animée à part, image par image (voir la pose d'un coup)
      return [base, base];
    case "grab":
      // Les deux mains tendues devant, pour attraper
      return [
        with_(base, { hands: [R(-0.28, 0.75, -0.1), R(0.28, 0.75, -0.1)], crouch: 0.06, twist: 0.15 }),
        with_(base, { hands: [R(-0.14, 0.85, 0.78), R(0.14, 0.85, 0.78)], lean: 0.3, feet: [R(-0.12, 0, 0.25), base.feet[1]] }),
      ];
  }
}

/** Le déroulé d'un coup : quand il arme, quand il frappe, quand il revient */
function timeline(style: HabitueId, move: string): { first: number; last: number; frames: number; charge: number } | null {
  const def = moveDef(style, move);
  if (!def) return null;
  let first =
    def.hits.length > 0 ? Math.min(...def.hits.map((h) => h.from)) : (def.shoot?.at ?? def.push?.[0]?.from ?? Math.round(def.frames * 0.3));
  let last = def.hits.length > 0 ? Math.max(...def.hits.map((h) => h.to)) : first + 3;
  if (def.counter) {
    first = def.counter[0];
    last = def.counter[1];
  }
  return { first: Math.max(1, first), last, frames: def.frames, charge: def.charge?.at ?? -1 };
}

/** Les coups de Lucien où l'accordéon se déplie loin devant */
const STRETCH: Record<string, number> = { s: 0.9, as: 0.8, cs: 1.1, ps: 1.9 };

/** Ce que porte chacun : robe ou pantalon, manches, gilet tricoté, collier, nœud papillon, châle… */
interface Outfit {
  /** 0 : un pantalon ; 1 : une jupe aux genoux ; 2 : une jupe longue */
  skirt: 0 | 1 | 2;
  short: boolean;
  /** Les manches de la couleur de la touche (la chemise de Lucien sous son gilet) */
  accentSleeves: boolean;
  belly: number;
  knit: boolean;
  collar: string | null;
  necklace: string | null;
  bowtie: boolean;
  shawl: boolean;
  buttons: boolean;
  pattern: "dots" | "flowers" | null;
  shoe: number;
}

const OUTFITS: Record<HabitueId | "moi", Outfit> = {
  ginette: {
    skirt: 1,
    short: false,
    accentSleeves: false,
    belly: 0.25,
    knit: false,
    collar: "#f6f1e6",
    necklace: "#f6f1e6",
    bowtie: false,
    shawl: false,
    buttons: false,
    pattern: "dots",
    shoe: 0x4a2a24,
  },
  marcel: {
    skirt: 0,
    short: false,
    accentSleeves: false,
    belly: 1,
    knit: true,
    collar: "#e8e2d4",
    necklace: null,
    bowtie: false,
    shawl: false,
    buttons: true,
    pattern: null,
    shoe: 0x3a2a20,
  },
  huguette: {
    skirt: 2,
    short: false,
    accentSleeves: false,
    belly: 0.1,
    knit: false,
    collar: null,
    necklace: null,
    bowtie: false,
    shawl: true,
    buttons: false,
    pattern: "flowers",
    shoe: 0x2a2228,
  },
  raymond: {
    skirt: 0,
    short: true,
    accentSleeves: false,
    belly: 0.45,
    knit: false,
    collar: null,
    necklace: null,
    bowtie: false,
    shawl: false,
    buttons: false,
    pattern: null,
    shoe: 0xe8e2d4,
  },
  simone: {
    skirt: 2,
    short: false,
    accentSleeves: false,
    belly: 0,
    knit: false,
    collar: null,
    necklace: "#f2c94c",
    bowtie: false,
    shawl: false,
    buttons: false,
    pattern: null,
    shoe: 0x1c1a20,
  },
  lucien: {
    skirt: 0,
    short: false,
    accentSleeves: true,
    belly: 0.3,
    knit: false,
    collar: null,
    necklace: null,
    bowtie: true,
    shawl: false,
    buttons: true,
    pattern: null,
    shoe: 0x2a1e18,
  },
  moi: {
    skirt: 0,
    short: true,
    accentSleeves: false,
    belly: 0,
    knit: false,
    collar: null,
    necklace: null,
    bowtie: false,
    shawl: false,
    buttons: false,
    pattern: null,
    shoe: 0xf4efe2,
  },
};

interface Arm {
  upper: THREE.Mesh;
  fore: THREE.Mesh;
  hand: THREE.Mesh;
}

interface Leg {
  thigh: THREE.Mesh;
  shin: THREE.Mesh;
  shoe: THREE.Mesh;
}

/** Le bout d'un accessoire qui frappe laisse une traînée claire : on garde ses dernières positions */
const TRAIL = 9;

/** Le contour des combattants (pas au doigt : trop de dessins pour un téléphone) */
const OUTLINE = typeof window !== "undefined" && !(window.matchMedia?.("(pointer: coarse)").matches ?? false);

/** Une matière de contour : la forme gonflée le long de ses normales, vue de dos, sombre */
function outlineMaterial(width: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x1d1720, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
transformed += normalize(normal) * ${width.toFixed(4)};`,
    );
  };
  m.customProgramCacheKey = () => `culbute-contour-${width}`;
  return m;
}

export class FighterModel {
  readonly group = new THREE.Group();
  private root = new THREE.Group();
  /** Le pivot des tours sur soi-même (roulade, culbute), au milieu du corps */
  private spinner = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private skirt: THREE.Mesh | null = null;
  private arms: Arm[] = [];
  private legs: Leg[] = [];
  private prop: THREE.Group;
  private accordion: Accordion | null = null;
  private skull: THREE.Mesh;
  private mats: THREE.MeshStandardMaterial[] = [];
  private shieldBubble: THREE.Mesh;
  private shieldMat: THREE.ShaderMaterial;
  private cream: THREE.Mesh;
  private stars = new THREE.Group();
  private yarn: THREE.Mesh;
  private marker: THREE.Group;
  /** Ce qu'il lance en narguant, dans une bulle au-dessus de sa tête (sa taille ordinaire) */
  private quip: THREE.Sprite;
  private quipSize = 1;
  private held: { kind: ItemKind | ""; model: THREE.Object3D | null } = { kind: "", model: null };
  private keep: Keep;
  private flash = 0;
  private yaw = 0;
  private runPhase = 0;
  private lastX = 0;
  private lastY = 0;
  private vx = 0;
  private vy = 0;
  private landing = 0;
  private wasAir = false;
  private scale = 1;
  private disposables: { dispose: () => void }[] = [];
  /** La traînée du coup : un ruban entre la main et le bout de l'accessoire, sur les dernières images */
  readonly trail: THREE.Mesh;
  private trailPts: { a: THREE.Vector3; b: THREE.Vector3; age: number }[] = [];
  private trailColor = new THREE.Color();
  readonly look: FighterLook;

  constructor(look: FighterLook) {
    this.look = look;
    this.keep = <T extends { dispose: () => void }>(x: T) => {
      this.disposables.push(x);
      return x;
    };
    const keep = this.keep;
    const st = STYLES[look.style];
    const fit = OUTFITS[look.outfit];
    this.scale = st.hgt / HEIGHT;
    const mat = (c: THREE.ColorRepresentation, r = 0.82, rim = 0.32, map?: THREE.Texture) => {
      const m = keep(cloth(c, r, rim, map));
      this.mats.push(m);
      return m;
    };
    const geo = <T extends THREE.BufferGeometry>(g: T) => keep(g);
    const skinHex = AVATAR_SKINS[look.avatar.skin] ?? AVATAR_SKINS[0]!;
    const p = look.palette;
    const topMat = mat(p.top, 0.85, 0.32, fit.knit ? keep(knitTexture(p.top, shade(p.top, -0.35))) : undefined);
    const bottomMat = mat(p.bottom, 0.8);
    const accentMat = mat(p.accent, 0.7);
    const skinMat = mat(skinHex, 0.62, 0.22);
    const shoeMat = mat(fit.shoe, 0.45, 0.25);
    // Sous une jupe : des bas, un peu plus foncés que la peau
    const legMat = fit.skirt > 0 ? mat(shade(skinHex, -0.18), 0.55, 0.28) : bottomMat;
    const sleeveMat = fit.accentSleeves ? accentMat : topMat;

    this.group.add(this.root);
    this.root.add(this.spinner);
    this.spinner.add(this.body);
    this.body.position.y = -PIVOT;
    this.body.add(this.torso);
    this.torso.position.y = HIPS_Y;

    // Le buste : un tronc galbé, un peu de ventre pour certains
    const b = fit.belly;
    const chest = new THREE.Mesh(
      geo(
        loft([
          [-0.12, 0.17, 0.14],
          [-0.04, 0.215, 0.17, b * 0.01],
          [0.06, 0.238 + b * 0.025, 0.19 + b * 0.055, b * 0.045],
          [0.16, 0.245 + b * 0.02, 0.195 + b * 0.045, b * 0.035],
          [0.26, 0.25, 0.185, b * 0.01],
          [0.34, 0.245, 0.17],
          [0.41, 0.205, 0.145],
          [0.46, 0.12, 0.095],
        ]),
      ),
      topMat,
    );
    chest.castShadow = true;
    this.torso.add(chest);
    // Le devant du buste à cette hauteur (pour y poser des boutons)
    const front = (y: number) => (y < 0.26 ? 0.19 : 0.19 - (y - 0.26) * 0.25) + b * 0.1 * Math.exp(-(((y - 0.08) / 0.14) ** 2));

    if (fit.skirt === 0) {
      // Le pantalon : le bassin, et une ceinture
      const hips = new THREE.Mesh(
        geo(
          loft([
            [-0.2, 0.15, 0.12],
            [-0.14, 0.2, 0.155],
            [-0.04, 0.218, 0.172, b * 0.01],
            [0.04, 0.222, 0.176, b * 0.02],
          ]),
        ),
        bottomMat,
      );
      hips.castShadow = true;
      this.torso.add(hips);
      const belt = new THREE.Mesh(geo(new THREE.TorusGeometry(1, 0.11, 6, 26)), mat(0x2a2228, 0.5, 0.2));
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(0.224, 0.18 + b * 0.02, 0.21);
      belt.position.set(0, 0.035, b * 0.015);
      this.torso.add(belt);
    } else {
      // La jupe, évasée, avec ses motifs
      const long = fit.skirt === 2;
      const hem = long ? -0.42 : -0.3;
      const skirtTex = fit.pattern ? keep(dotsTexture(p.bottom, shade(p.bottom, 0.45), fit.pattern === "flowers")) : undefined;
      const skirtMat = mat(p.bottom, 0.8, 0.3, skirtTex);
      skirtMat.side = THREE.DoubleSide;
      this.skirt = new THREE.Mesh(
        geo(
          loft(
            [
              [hem, long ? 0.36 : 0.34, long ? 0.3 : 0.29, 0.02],
              [hem * 0.55, long ? 0.3 : 0.29, long ? 0.25 : 0.24, 0.015],
              [-0.06, 0.245, 0.195, 0.01],
              [0.04, 0.225, 0.18, b * 0.02],
              [0.1, 0.215, 0.175, b * 0.03],
            ],
            24,
            true,
          ),
        ),
        skirtMat,
      );
      this.skirt.castShadow = true;
      this.torso.add(this.skirt);
      // Un ourlet clair
      const trim = new THREE.Mesh(geo(new THREE.TorusGeometry(1, 0.06, 5, 30)), accentMat);
      trim.rotation.x = Math.PI / 2;
      trim.scale.set(long ? 0.36 : 0.34, long ? 0.3 : 0.29, 0.25);
      trim.position.set(0, hem + 0.01, 0.02);
      this.skirt.add(trim);
    }

    // Le col, le collier, les boutons, le nœud papillon, le châle
    if (fit.collar) {
      const collar = new THREE.Mesh(geo(new THREE.TorusGeometry(1, 0.32, 6, 22)), mat(fit.collar, 0.75));
      collar.rotation.x = Math.PI / 2 - 0.25;
      collar.scale.set(0.13, 0.11, 0.1);
      collar.position.set(0, 0.42, 0.02);
      this.torso.add(collar);
    }
    if (fit.necklace) {
      const pearl = mat(fit.necklace, 0.25, 0.45);
      pearl.metalness = fit.necklace === "#f2c94c" ? 0.7 : 0.1;
      const beads = merge(
        Array.from({ length: 13 }, (_, i) => {
          const a = Math.PI * 0.18 + (i / 12) * Math.PI * 0.64;
          const s = new THREE.SphereGeometry(0.024, 8, 6);
          s.translate(Math.cos(a) * 0.15, 0.4 - Math.sin(a) * 0.075, Math.sin(a) * 0.15 + 0.005);
          return s;
        }),
      );
      this.torso.add(new THREE.Mesh(geo(beads), pearl));
    }
    if (fit.buttons) {
      const btn = merge(
        [0.1, 0.2, 0.3].map((y) => {
          const s = new THREE.SphereGeometry(0.022, 8, 6);
          s.scale(1, 1, 0.5);
          s.translate(0, y, front(y) + 0.004);
          return s;
        }),
      );
      this.torso.add(new THREE.Mesh(geo(btn), mat(fit.accentSleeves ? p.bottom : p.accent, 0.4, 0.2)));
    }
    if (fit.bowtie) {
      const bow = merge(
        [-1, 1].map((side) => {
          const c = new THREE.ConeGeometry(0.05, 0.09, 8);
          c.rotateZ((side * Math.PI) / 2);
          c.translate(side * 0.045, 0.43, 0.13);
          return c;
        }),
      );
      this.torso.add(new THREE.Mesh(geo(bow), mat(p.bottom, 0.5)));
    }
    if (fit.shawl) {
      const shawlMat = mat(p.accent, 0.95, 0.3, keep(knitTexture(p.accent, shade(p.accent, -0.3))));
      shawlMat.side = THREE.DoubleSide;
      const shawl = new THREE.Mesh(
        geo(
          loft(
            [
              [0.14, 0.27, 0.21, -0.01],
              [0.24, 0.28, 0.215],
              [0.34, 0.27, 0.2],
              [0.42, 0.22, 0.165],
              [0.47, 0.14, 0.11],
            ],
            24,
            true,
          ),
        ),
        shawlMat,
      );
      shawl.castShadow = true;
      this.torso.add(shawl);
    }

    // La tête : la peau de l'avatar (posée plus tard), les oreilles, les cheveux, le chapeau
    this.head.position.set(0, 0.74, 0.02);
    this.torso.add(this.head);
    this.skull = new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R, 36, 24)), skinMat);
    this.skull.castShadow = true;
    this.head.add(this.skull);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R * 0.24, 12, 8)), skinMat);
      ear.position.set(side * HEAD_R * 0.97, -HEAD_R * 0.05, -HEAD_R * 0.05);
      ear.scale.set(0.55, 1, 0.85);
      this.head.add(ear);
    }
    const hatCoversTop = [1, 2, 4, 5, 7].includes(look.avatar.hat);
    const hairGeo = hairGeometry(look.avatar.hair, hatCoversTop);
    if (hairGeo) {
      const hairMat = keep(cloth(AVATAR_HAIR_COLORS[look.avatar.hairColor] ?? AVATAR_HAIR_COLORS[0]!, 0.75, 0.35));
      hairMat.side = THREE.DoubleSide;
      this.mats.push(hairMat);
      const hair = new THREE.Mesh(keep(hairGeo), hairMat);
      hair.castShadow = true;
      this.head.add(hair);
    }
    const hat = hatGroup(look.avatar.hat, keep, true);
    if (hat) this.head.add(hat);
    // La tarte en pleine figure
    this.cream = new THREE.Mesh(geo(new THREE.SphereGeometry(HEAD_R * 0.75, 16, 12)), keep(cloth(0xfffaf0, 0.5, 0.2)));
    this.cream.position.set(0, -0.02, HEAD_R * 0.62);
    this.cream.scale.set(1.1, 0.9, 0.5);
    this.cream.visible = false;
    this.head.add(this.cream);
    // Les étoiles de la tête qui tourne
    const starMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd84a, side: THREE.DoubleSide }));
    for (let i = 0; i < 3; i++) this.stars.add(new THREE.Mesh(geo(starShape(0.09)), starMat));
    this.stars.position.y = HEAD_R + 0.18;
    this.stars.visible = false;
    this.head.add(this.stars);

    // Les bras : manche, avant-bras (la peau sous une manche courte), main en moufle
    for (let side = 0; side < 2; side++) {
      const upperMat = fit.short ? skinMat : sleeveMat;
      const upper = new THREE.Mesh(geo(limb((u) => 0.088 - u * 0.012, UPPER)), upperMat);
      const fore = new THREE.Mesh(geo(limb((u) => 0.074 - u * 0.012, FORE)), fit.short ? skinMat : sleeveMat);
      upper.userData.len = UPPER;
      fore.userData.len = FORE;
      if (fit.short) {
        // La manche courte, qui couvre le haut du bras
        const sleeve = new THREE.Mesh(
          geo(
            loft(
              [
                [-0.05, 0.11, 0.11],
                [0.06, 0.112, 0.112],
                [0.13, 0.105, 0.105],
              ],
              16,
              true,
            ),
          ),
          sleeveMat,
        );
        sleeve.material.side = THREE.DoubleSide;
        upper.add(sleeve);
      } else {
        // Le poignet de la manche
        const cuff = new THREE.Mesh(geo(new THREE.TorusGeometry(0.066, 0.018, 6, 16)), fit.knit ? topMat : accentMat);
        cuff.rotation.x = Math.PI / 2;
        cuff.position.y = FORE - 0.01;
        fore.add(cuff);
      }
      const hand = new THREE.Mesh(geo(mitten(0.11)), skinMat);
      for (const m of [upper, fore, hand]) m.castShadow = true;
      this.body.add(upper, fore, hand);
      this.arms.push({ upper, fore, hand });
      const thigh = new THREE.Mesh(geo(limb((u) => 0.105 - u * 0.018, THIGH)), legMat);
      const shin = new THREE.Mesh(geo(limb((u) => 0.085 - u * 0.02, SHIN)), legMat);
      thigh.userData.len = THIGH;
      shin.userData.len = SHIN;
      const foot = new THREE.Mesh(geo(shoe(0.3, 0.19)), shoeMat);
      for (const m of [thigh, shin, foot]) m.castShadow = true;
      this.body.add(thigh, shin, foot);
      this.legs.push({ thigh, shin, shoe: foot });
    }

    // L'accessoire de son style
    this.prop = propModel(look.style, look.palette.prop, look.palette.accent, keep);
    this.body.add(this.prop);
    if (look.style === "lucien") {
      this.accordion = accordionModel(look.palette.prop, look.palette.accent, keep);
      this.body.add(this.accordion.group);
    }

    // La pelote qui le ligote (pris au lasso ou dans le tricot)
    this.yarn = new THREE.Mesh(geo(new THREE.TorusGeometry(0.34, 0.05, 6, 18)), keep(cloth(0xe86aa6, 0.95)));
    this.yarn.rotation.x = Math.PI / 2;
    this.yarn.position.y = 0.75;
    this.yarn.visible = false;
    this.body.add(this.yarn);

    // La garde : une bulle à la couleur du joueur, plus vive sur les bords
    this.shieldMat = keep(
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(look.color) }, uPower: { value: 1 } },
        vertexShader: `varying vec3 vN; varying vec3 vV;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uPower; varying vec3 vN; varying vec3 vV;
void main() { float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(mix(uColor, vec3(1.0), f * 0.5), (0.16 + f * 0.7) * uPower); }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.shieldBubble = new THREE.Mesh(geo(new THREE.SphereGeometry(0.85, 32, 20)), this.shieldMat);
    this.shieldBubble.position.y = 0.78;
    this.shieldBubble.visible = false;
    this.group.add(this.shieldBubble);

    // La traînée des coups
    const trailGeo = geo(new THREE.BufferGeometry());
    trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
    trailGeo.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(TRAIL * 2), 1));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    trailGeo.setIndex(idx);
    this.trail = new THREE.Mesh(
      trailGeo,
      keep(
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: this.trailColor } },
          vertexShader: `attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `uniform vec3 uColor; varying float vA; void main() { gl_FragColor = vec4(uColor, vA); }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.trailColor.set(look.color).lerp(new THREE.Color(0xffffff), 0.55);

    // Son nom au-dessus de la tête, et un petit repère à sa couleur
    this.marker = nameTag(look.me ? "Toi" : look.bot ? "" : look.name, look.color, keep);
    this.marker.position.y = HEIGHT + 0.5;
    this.group.add(this.marker);
    this.quip = quipBubble(QUIPS[look.style], keep);
    this.quip.position.set(0.35, HEIGHT + 1.15, 0);
    this.quip.visible = false;
    this.group.add(this.quip);

    // Le contour sombre, sur les volumes fermés (pas sur les cheveux, la jupe ou le châle, ouverts)
    if (OUTLINE) {
      const line = keep(outlineMaterial(0.016));
      const targets: THREE.Mesh[] = [];
      this.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o === this.cream || o === this.yarn || this.stars.children.includes(o)) return;
        const mat = o.material as THREE.Material;
        if (mat.side === THREE.DoubleSide || mat.transparent || !(mat instanceof THREE.MeshStandardMaterial)) return;
        targets.push(o);
      });
      for (const o of targets) {
        const shell = new THREE.Mesh(o.geometry, line);
        shell.raycast = () => {};
        o.add(shell);
      }
    }
    this.root.scale.setScalar(this.scale);
    if (look.style === "marcel") this.root.scale.set(this.scale * 1.12, this.scale, this.scale * 1.08);
    if (look.head) this.setHead(look.head);
  }

  /** La peau de la tête avec les traits de l'avatar */
  setHead(canvas: HTMLCanvasElement) {
    const tex = this.keep(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = this.keep(cloth(0xffffff, 0.6, 0.22, tex));
    this.mats.push(mat);
    this.skull.material = mat;
  }

  hit(power: number) {
    this.flash = 0.12 + power * 0.12;
  }

  private pose(f: RenderFighter, time: number): { pose: Pose; strike: number; charging: boolean } {
    const air = this.vy !== 0 && f.state !== "stand" && f.state !== "land" && f.state !== "shield" && f.state !== "shieldstun";
    const base = air && f.state !== "move" ? AIR : REST;
    let strike = 0;
    let charging = false;
    switch (f.state) {
      case "stand":
      case "respawn": {
        const speed = Math.abs(this.vx);
        if (speed < 0.6 || f.state === "respawn") {
          const breathe = Math.sin(time * 2.4) * 0.015;
          return { pose: with_(REST, { crouch: breathe + this.landing * 0.12 }), strike, charging };
        }
        const run = Math.min(1, speed / 7);
        const s = Math.sin(this.runPhase);
        const c = Math.cos(this.runPhase);
        return {
          pose: with_(REST, {
            lean: 0.08 + run * 0.18,
            crouch: Math.abs(c) * 0.04 * run,
            feet: [
              [-0.12, Math.max(0, c) * 0.18 * run, s * 0.34 * run],
              [0.12, Math.max(0, -c) * 0.18 * run, -s * 0.34 * run],
            ],
            hands: [
              [-0.3, 0.6, -s * 0.28 * run + 0.05],
              [0.3, 0.6, s * 0.28 * run + 0.05],
            ],
          }),
          strike,
          charging,
        };
      }
      case "squat":
        return { pose: with_(REST, { crouch: 0.16 }), strike, charging };
      case "land":
        return { pose: with_(REST, { crouch: 0.12 + this.landing * 0.06 }), strike, charging };
      case "air": {
        const rising = this.vy > 1;
        return {
          pose: rising
            ? with_(AIR, {
                feet: [
                  [-0.12, 0.32, 0.18],
                  [0.12, 0.12, -0.05],
                ],
              })
            : AIR,
          strike,
          charging,
        };
      }
      case "shield":
      case "shieldstun":
        return {
          pose: with_(REST, {
            crouch: 0.1,
            hands: [
              [0.05, 0.85, 0.32],
              [-0.05, 0.78, 0.3],
            ],
          }),
          strike,
          charging,
        };
      case "roll":
      case "tech":
        return {
          pose: with_(REST, { crouch: 0.32, spinX: ((f.t / (f.state === "roll" ? 26 : 20)) * Math.PI * 2) % (Math.PI * 2) }),
          strike,
          charging,
        };
      case "dodge":
        return { pose: with_(REST, { lean: -0.35, crouch: 0.05 }), strike, charging };
      case "airdodge":
        return { pose: with_(AIR, { spinY: (Math.min(1, f.t / 24) * Math.PI * 2) % (Math.PI * 2) }), strike, charging };
      case "hurt": {
        if (f.kb > 14)
          return {
            pose: with_(AIR, {
              spinX: time * 11,
              hands: [
                [-0.45, 1.1, -0.1],
                [0.45, 1.0, 0.1],
              ],
            }),
            strike,
            charging,
          };
        return {
          pose: with_(base, {
            lean: -0.4,
            hands: [
              [-0.42, 1.15, -0.1],
              [0.42, 1.1, -0.15],
            ],
            headTilt: -0.3,
          }),
          strike,
          charging,
        };
      }
      case "down":
        return { pose: with_(REST, { spinX: -Math.PI / 2, liftY: -0.5 }), strike, charging };
      case "helpless":
        return {
          pose: with_(AIR, {
            lean: -0.2,
            spinY: Math.sin(time * 3) * 0.3,
            hands: [
              [-0.4, 1.3, 0],
              [0.4, 1.3, 0],
            ],
          }),
          strike,
          charging,
        };
      case "dizzy":
        return {
          pose: with_(REST, { lean: Math.sin(time * 5) * 0.2, headTilt: Math.sin(time * 6) * 0.35, crouch: 0.05 }),
          strike,
          charging,
        };
      case "holding":
        // Il le tient à bout de bras, un peu penché en arrière
        return {
          pose: with_(REST, {
            lean: -0.08,
            crouch: 0.05,
            hands: [
              [-0.16, 0.9, 0.6],
              [0.16, 0.9, 0.6],
            ],
          }),
          strike,
          charging,
        };
      case "held":
        // Soulevé, il gigote
        return {
          pose: with_(REST, {
            liftY: 0.12,
            lean: -0.15 + Math.sin(time * 16) * 0.06,
            headTilt: Math.sin(time * 11) * 0.2,
            hands: [
              [-0.42, 1.0 + Math.sin(time * 18) * 0.12, 0.1],
              [0.42, 1.0 - Math.sin(time * 18) * 0.12, 0.1],
            ],
            feet: [
              [-0.14, 0.12 + Math.max(0, Math.sin(time * 14)) * 0.15, 0.05],
              [0.14, 0.12 + Math.max(0, -Math.sin(time * 14)) * 0.15, -0.05],
            ],
          }),
          strike,
          charging,
        };
      case "caught":
        return {
          pose: with_(REST, {
            lean: Math.sin(time * 14) * 0.08,
            hands: [
              [-0.22, 0.6, 0],
              [0.22, 0.6, 0],
            ],
          }),
          strike,
          charging,
        };
      case "ledge":
        return {
          pose: with_(AIR, {
            hands: [
              [-0.18, 1.3, 0.32],
              [0.18, 1.3, 0.32],
            ],
            feet: [
              [-0.12, 0, 0.1],
              [0.12, -0.05, 0.05],
            ],
            lean: 0.1,
          }),
          strike,
          charging,
        };
      case "move": {
        const def = moveDef(this.look.style, f.move);
        const tl = timeline(this.look.style, f.move);
        if (!def || !tl) return { pose: base, strike, charging };
        const moveBase = def.pose.startsWith("air") || def.pose === "rise" || def.pose === "stomp" ? AIR : REST;
        const [W, S] = keyPoses(def.pose, moveBase);
        let pose: Pose;
        const mt = f.mt;
        if (tl.charge >= 0 && Math.abs(mt - tl.charge) < 0.5 && f.charge > 0) {
          // La charge : l'arme loin en arrière, ramassé sur lui-même, il tremble de plus en plus
          charging = true;
          const ck = Math.min(1, f.charge / 60);
          const shake = Math.sin(time * 60) * (0.015 + ck * 0.025);
          pose = with_(W, { twist: W.twist * (1 + ck * 0.35) + shake * 4, crouch: W.crouch + 0.05 + ck * 0.08, lean: W.lean - ck * 0.12 });
        } else if (mt < tl.first) pose = blend(moveBase, W, ease(Math.min(1, mt / tl.first)));
        else if (mt <= tl.last + 1) {
          strike = Math.min(1, (mt - tl.first + 1) / Math.max(1.5, (tl.last - tl.first + 1) * 0.5));
          pose = blend(W, S, ease(strike));
        } else pose = blend(S, moveBase, ease(Math.min(1, (mt - tl.last - 1) / Math.max(1, tl.frames - tl.last - 1))));
        if (def.pose === "spin" && mt >= tl.first - 2)
          pose = with_(pose, { spinY: ((mt - tl.first + 2) / (tl.last - tl.first + 4)) * Math.PI * 2 });
        if (def.pose === "rise" && mt >= tl.first) pose = with_(pose, { spinY: (mt - tl.first) * 0.55 });
        if (def.pose === "climb") pose = with_(pose, { liftY: -(1 - Math.min(1, mt / (tl.frames * 0.6))) * 1.1 });
        if (def.pose === "taunt") return { pose: taunting(moveBase, mt, def.frames), strike: 0, charging };
        return { pose, strike: mt >= tl.first && mt <= tl.last + 6 ? Math.max(strike, 0.6) : strike, charging };
      }
      default:
        return { pose: base, strike, charging };
    }
  }

  update(dt: number, f: RenderFighter, time: number) {
    const visible = f.state !== "dead" && f.state !== "out";
    this.group.visible = visible;
    if (!visible) {
      this.lastX = f.x;
      this.lastY = f.y;
      this.trailPts.length = 0;
      this.trail.visible = false;
      return;
    }
    // Sa vitesse, d'après ses positions successives (lissée)
    if (dt > 0) {
      const vx = (f.x - this.lastX) / dt;
      const vy = (f.y - this.lastY) / dt;
      if (Math.abs(vx) < 40) this.vx += (vx - this.vx) * Math.min(1, dt * 14);
      if (Math.abs(vy) < 40) this.vy += (vy - this.vy) * Math.min(1, dt * 14);
    }
    this.lastX = f.x;
    this.lastY = f.y;
    const grounded = f.state === "stand" || f.state === "land" || f.state === "shield" || f.state === "squat";
    if (grounded) this.vy = 0;
    if (grounded && this.wasAir) this.landing = 1;
    this.wasAir = !grounded;
    this.landing = Math.max(0, this.landing - dt * 5);
    this.runPhase += Math.abs(this.vx) * dt * 2.3;

    const { pose, strike, charging } = this.pose(f, time);
    this.group.position.set(f.x, f.y, 0);
    // Figé par un coup reçu : il tremble, d'autant plus que le coup est fort
    if (f.state === "hurt" && (f.flags & F_STOP) !== 0) {
      const amp = Math.min(0.09, 0.025 + this.flash * 0.25);
      this.group.position.x += Math.sin(time * 95) * amp;
      this.group.position.y += Math.cos(time * 71) * amp * 0.4;
    }
    // Tourné vers où il regarde, un peu de trois quarts vers nous
    const wanted = f.face * (Math.PI / 2 - 0.42);
    this.yaw += (wanted - this.yaw) * Math.min(1, dt * 18);
    this.root.rotation.set(0, this.yaw, 0);
    // Les tours sur soi-même : autour du milieu du corps
    this.spinner.position.y = PIVOT + pose.liftY;
    this.spinner.rotation.set(pose.spinX, pose.spinY, 0);
    // Un peu d'écrasement à l'atterrissage, un peu d'étirement en montant
    const squash = this.landing * 0.09 - Math.min(0.08, Math.max(0, this.vy) * 0.006);
    this.body.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    this.torso.position.y = HIPS_Y - pose.crouch;
    this.torso.rotation.set(pose.lean, pose.twist, 0);
    this.head.rotation.set(-0.06 - pose.lean * 0.4, -f.face * 0.32, pose.headTilt);
    // La jupe suit le mouvement : elle traîne un peu derrière
    if (this.skirt) {
      const sway = Math.max(-0.35, Math.min(0.35, -Math.abs(this.vx) * 0.03 + this.vy * 0.012));
      this.skirt.rotation.x = sway - pose.lean * 0.5;
      this.skirt.scale.y = 1 + Math.max(-0.12, Math.min(0.1, -this.vy * 0.006));
    }

    // Les bras : de l'épaule à la main visée, le coude vers l'extérieur et en arrière
    this.torso.updateMatrix();
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i]!;
      const side = i === 0 ? -1 : 1;
      const shoulder = V.a.set(side * SHOULDER_X, SHOULDER_Y - HIPS_Y, 0).applyMatrix4(this.torso.matrix);
      const target = V.b.fromArray(pose.hands[i]!);
      target.y -= pose.crouch * 0.5;
      const elbow = ik(shoulder, target, UPPER, FORE, V.c.set(side * 0.8, -0.4, -0.5), V.d);
      stretch(arm.upper, shoulder, elbow);
      stretch(arm.fore, elbow, target);
      // La main dans le prolongement de l'avant-bras, le pouce vers le haut
      arm.hand.position.copy(target);
      arm.hand.quaternion.setFromUnitVectors(DOWN, V.e.subVectors(target, elbow).normalize());
    }
    // Les jambes : de la hanche à la cheville, le genou vers l'avant ; la chaussure à plat (ou dans l'axe du tibia en l'air)
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i]!;
      const side = i === 0 ? -1 : 1;
      const hip = V.a.set(side * 0.1, HIPS_Y - pose.crouch - 0.03, 0);
      const foot = pose.feet[i]!;
      const ankle = V.b.set(foot[0], foot[1] + 0.06, foot[2] - 0.02);
      const knee = ik(hip, ankle, THIGH, SHIN, V.c.set(0, 0.1, 1), V.d);
      stretch(leg.thigh, hip, knee);
      stretch(leg.shin, knee, ankle);
      const shinUp = V.e.subVectors(knee, ankle).normalize();
      const lift = Math.min(1, Math.max(0, foot[1] * 4));
      const up = V.f.set(0, 1, 0).lerp(shinUp, lift).normalize();
      leg.shoe.quaternion.setFromUnitVectors(UP, up);
      leg.shoe.position.copy(ankle).add(V.g.set(0, -0.06, -0.05).applyQuaternion(leg.shoe.quaternion));
    }

    // L'accessoire dans la main droite, le long de l'avant-bras ; un objet tenu le remplace
    const hand = this.arms[0]!.hand.position;
    const along = V.along.subVectors(hand, this.arms[0]!.fore.position).normalize();
    const grip = V.grip.copy(hand).addScaledVector(along, 0.07);
    const holding = f.item !== "";
    this.setHeld(f.item);
    const shown = this.held.model ?? this.prop;
    // Pendant une saisie ou une projection, les mains sont prises : l'accessoire disparaît le temps du geste
    const grappling = f.state === "holding" || f.state === "held" || (f.state === "move" && /^g:(grab|pummel|t[FBUD])$/.test(f.move));
    this.prop.visible = !holding && !this.accordion && !grappling;
    if (this.held.model) this.held.model.visible = holding;
    shown.position.copy(grip);
    shown.quaternion.setFromUnitVectors(UP, along);
    if (this.look.style === "ginette" && !holding) {
      // Le sac pend à son anse, sauf quand il frappe
      if (strike < 0.3) shown.quaternion.slerp(HANG, 0.85 - strike * 2);
    }
    if (this.accordion) {
      const a = this.accordion;
      a.group.visible = !holding && !grappling;
      const left = V.a.copy(this.arms[1]!.hand.position);
      const right = V.b.copy(hand);
      const ext = (STRETCH[f.move] ?? 0) * (f.state === "move" ? strike : 0);
      const dir = V.c.subVectors(right, left);
      if (dir.lengthSq() < 0.01) dir.set(-1, 0, 0);
      dir.normalize();
      right.addScaledVector(dir, ext);
      a.left.position.copy(left);
      a.right.position.copy(right);
      a.bellows.position.copy(left).add(right).multiplyScalar(0.5);
      a.bellows.quaternion.setFromUnitVectors(RIGHT, dir);
      a.left.quaternion.copy(a.bellows.quaternion);
      a.right.quaternion.copy(a.bellows.quaternion);
      a.bellows.scale.x = Math.max(0.08, left.distanceTo(right) - 0.1);
    }

    // La traînée du coup : de la main au bout de l'accessoire, tant qu'il frappe
    this.updateTrail(dt, f.state === "move" && strike > 0.05 && strike < 1, grip, along);

    // La garde, la tarte, les étoiles, la laine
    const shielding = f.state === "shield" || f.state === "shieldstun";
    this.shieldBubble.visible = shielding;
    if (shielding) {
      const k = Math.max(0, f.shield) / 50;
      this.shieldBubble.scale.setScalar(0.45 + 0.55 * k);
      this.shieldMat.uniforms.uPower!.value = 0.75 + 0.25 * Math.sin(time * 9) * (k < 0.3 ? 1 : 0.2);
    }
    this.cream.visible = (f.flags & F_CREAM) !== 0;
    // La bulle de celui qui nargue : elle surgit, puis disparaît avant la fin de la pose
    const quip = f.state === "move" && f.move === "g:taunt" && f.mt >= 5 && f.mt < 52;
    this.quip.visible = quip;
    if (quip) {
      const pop = Math.min(1, (f.mt - 5) / 5);
      const s = (0.55 + 0.45 * ease(pop) + Math.sin(pop * Math.PI) * 0.12) * this.quipSize;
      this.quip.scale.set(1.6 * s, 0.56 * s, 1);
    }
    this.stars.visible = f.state === "dizzy";
    if (this.stars.visible)
      this.stars.children.forEach((s, i) => {
        const a = time * 5 + (i * Math.PI * 2) / 3;
        s.position.set(Math.cos(a) * 0.32, Math.sin(time * 7 + i) * 0.03, Math.sin(a) * 0.32);
        s.rotation.set(0, -a, time * 4);
      });
    this.yarn.visible = f.state === "caught";
    if (this.yarn.visible) this.yarn.rotation.z = time * 3;

    // L'éclair d'un coup reçu, la charge qui monte, le café qui donne des ailes
    this.flash = Math.max(0, this.flash - dt);
    // La charge : une lueur dorée qui enfle et bat de plus en plus vite
    const ck = Math.min(1, f.charge / 60);
    const glow =
      this.flash > 0
        ? 0.9
        : charging
          ? 0.16 + ck * 0.22 + (0.06 + ck * 0.06) * Math.sin(time * (18 + ck * 22))
          : (f.flags & F_FAST) !== 0
            ? 0.12
            : 0;
    const glowColor = this.flash > 0 ? 0xffffff : charging ? (ck > 0.85 ? 0xffc860 : 0xff9a30) : 0x8fd3ff;
    for (const m of this.mats) {
      m.emissive.setHex(glowColor);
      m.emissiveIntensity = glow;
    }
    // Intouchable après son retour : il clignote
    const blink = (f.flags & F_INTANG) !== 0 && (f.state === "respawn" || f.state === "air" || f.state === "stand" || f.state === "land");
    this.root.visible = !blink || Math.floor(time * 12) % 2 === 0;
  }

  /** Le ruban de la traînée, en coordonnées du monde (il reste en place quand le combattant avance) */
  private updateTrail(dt: number, active: boolean, grip: THREE.Vector3, along: THREE.Vector3) {
    for (const p of this.trailPts) p.age += dt;
    while (this.trailPts.length > 0 && this.trailPts[0]!.age > 0.14) this.trailPts.shift();
    if (active) {
      this.body.updateWorldMatrix(true, false);
      const reach = this.look.style === "raymond" ? 0.18 : this.look.style === "lucien" ? 0.35 : 0.55;
      const a = this.body.localToWorld(grip.clone());
      const b = this.body.localToWorld(grip.clone().addScaledVector(along, reach));
      this.trailPts.push({ a, b, age: 0 });
      if (this.trailPts.length > TRAIL) this.trailPts.shift();
    }
    const n = this.trailPts.length;
    this.trail.visible = n >= 2;
    if (n < 2) return;
    const pos = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    const alpha = this.trail.geometry.getAttribute("alpha") as THREE.BufferAttribute;
    for (let i = 0; i < TRAIL; i++) {
      const p = this.trailPts[Math.min(n - 1, Math.max(0, i - (TRAIL - n)))]!;
      pos.setXYZ(i * 2, p.a.x, p.a.y, p.a.z + 0.05);
      pos.setXYZ(i * 2 + 1, p.b.x, p.b.y, p.b.z + 0.05);
      const k = i < TRAIL - n ? 0 : Math.max(0, 1 - p.age / 0.14) * ((i - (TRAIL - n) + 1) / n);
      alpha.setX(i * 2, k * 0.25);
      alpha.setX(i * 2 + 1, k * 0.75);
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
  }

  private setHeld(kind: ItemKind | "") {
    if (kind === this.held.kind) return;
    if (this.held.model) this.body.remove(this.held.model);
    this.held = { kind, model: kind ? itemModel(kind, this.keep) : null };
    if (this.held.model) {
      this.held.model.scale.setScalar(kind === "baguette" ? 1 : 0.8);
      this.body.add(this.held.model);
    }
  }

  /** Où se place la bulle de la provocation (la vitrine, cadrée serré, la met à côté de la tête) */
  placeQuip(x: number, y: number, size: number) {
    this.quip.position.set(x, y, 0);
    this.quipSize = size;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
/** Le sac de Ginette pendu à son anse */
const HANG = new THREE.Quaternion().setFromUnitVectors(UP, DOWN);
/**
 * Des vecteurs de travail, réutilisés à chaque image par tous les combattants (rien de gardé d'une image à l'autre) :
 * sans eux, chaque combattant en créait une cinquantaine par image, que le ramasse-miettes devait ensuite balayer
 */
const V = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
  e: new THREE.Vector3(),
  f: new THREE.Vector3(),
  g: new THREE.Vector3(),
  along: new THREE.Vector3(),
  grip: new THREE.Vector3(),
  stretch: new THREE.Vector3(),
  ikAlong: new THREE.Vector3(),
  ikPerp: new THREE.Vector3(),
};

/** Un membre entre deux articulations : construit à sa longueur, il ne s'étire presque jamais */
function stretch(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = V.stretch.subVectors(b, a);
  const len = dir.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
  m.scale.set(1, len / ((m.userData.len as number | undefined) ?? 1), 1);
}

/** Une couleur un peu plus claire (k > 0) ou plus foncée (k < 0) */
function shade(c: THREE.ColorRepresentation, k: number): string {
  const col = new THREE.Color(c);
  if (k > 0) col.lerp(new THREE.Color(0xffffff), k);
  else col.multiplyScalar(1 + k);
  return `#${col.getHexString()}`;
}

/** L'articulation du milieu (coude, genou), écrite dans `out` : deux os de longueurs données, plié du côté de `pole` */
function ik(a: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const along = V.ikAlong.subVectors(target, a);
  let d = along.length();
  // Trop loin : le membre se tend (la main ne va pas plus loin que le bras)
  if (d > l1 + l2 - 0.005) {
    along.multiplyScalar((l1 + l2 - 0.005) / d);
    target.copy(a).add(along);
    d = l1 + l2 - 0.005;
  }
  along.normalize();
  const perp = V.ikPerp.copy(pole).addScaledVector(along, -pole.dot(along));
  if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
  perp.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * Math.max(d, 1e-3));
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  return out.copy(a).addScaledVector(along, x).addScaledVector(perp, h);
}

function starShape(r: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ShapeGeometry(s);
}

/** Le nom du combattant sur une petite étiquette à sa couleur, ou rien qu'un repère (un bot), toujours tournés vers nous */
function nameTag(text: string, color: string, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 72;
  const ctx = c.getContext("2d")!;
  // Le repère : une petite flèche à la couleur du joueur, cerclée de blanc
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(114, 50);
  ctx.lineTo(142, 50);
  ctx.lineTo(128, 68);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  if (text) {
    ctx.font = "800 34px 'Libre Franklin Variable', system-ui, sans-serif";
    const label = text.length > 12 ? `${text.slice(0, 11)}…` : text;
    const w = Math.min(240, ctx.measureText(label).width + 30);
    ctx.fillStyle = "rgba(18, 16, 22, 0.78)";
    roundRect(ctx, (256 - w) / 2, 6, w, 40, 20);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    roundRect(ctx, (256 - w) / 2, 6, w, 40, 20);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 27);
  }
  const tex = keep(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })));
  sprite.scale.set(1.05, 0.295, 1);
  sprite.renderOrder = 10;
  g.add(sprite);
  return g;
}

/** Ce que chacun lance en narguant (à son caractère) */
const QUIPS: Record<HabitueId, string> = {
  ginette: "Et toc !",
  marcel: "Assis !",
  huguette: "Au suivant !",
  raymond: "De mon temps…",
  simone: "…",
  lucien: "Gagné !",
};

/** La danse de celui qui nargue : bras levés qui balancent, hanches qui ondulent, deux petits sauts */
function taunting(base: Pose, mt: number, frames: number): Pose {
  const into = Math.min(1, mt / 6);
  const out = Math.min(1, Math.max(0, (frames - mt) / 8));
  const k = ease(Math.min(into, out));
  const sway = Math.sin(mt * 0.42);
  const up: Pose = with_(base, {
    hands: [
      [-0.42 + sway * 0.12, 1.72 + Math.sin(mt * 0.84) * 0.08, 0.12],
      [0.42 + sway * 0.12, 1.72 - Math.sin(mt * 0.84) * 0.08, 0.12],
    ],
    twist: sway * 0.45,
    headTilt: Math.sin(mt * 0.42 + 1) * 0.28,
    liftY: Math.max(0, Math.sin((mt / frames) * Math.PI * 4)) * 0.22,
    crouch: -0.02,
  });
  return blend(base, up, k);
}

/** La bulle de la provocation : du texte noir sur un nuage blanc, avec sa pointe vers la tête */
function quipBubble(text: string, keep: Keep): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 112;
  const ctx = c.getContext("2d")!;
  ctx.font = "italic 800 40px 'Libre Franklin Variable', system-ui, sans-serif";
  const w = Math.min(300, ctx.measureText(text).width + 44);
  const x = (320 - w) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(20, 18, 26, 0.85)";
  ctx.lineWidth = 5;
  roundRect(ctx, x, 6, w, 70, 32);
  ctx.fill();
  ctx.stroke();
  // La pointe, vers le bas à gauche (la tête)
  ctx.beginPath();
  ctx.moveTo(x + 40, 72);
  ctx.lineTo(x + 22, 104);
  ctx.lineTo(x + 70, 74);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(x + 36, 66, 36, 10);
  ctx.fillStyle = "#1c1a22";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 160, 42);
  const tex = keep(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })));
  sprite.scale.set(1.6, 0.56, 1);
  sprite.renderOrder = 11;
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
