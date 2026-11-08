// Les circuits de Bolides : une route fermée qui passe par des points de contrôle, lissée en courbe, puis
// découpée en échantillons réguliers. Tout le reste (physique, bots, objets, dessin) s'appuie sur ces échantillons :
// où est-on sur la route, de combien s'en écarte-t-on, à quelle distance du départ.
//
// Repère : x et z au sol, y vers le haut, en mètres. Un cap h regarde vers (sin h, cos h) ; la droite du pilote
// est (-cos h, sin h). Tourner à droite fait donc baisser le cap.

/** Les circuits de base, et leur version en miroir */
export type BaseTrackId = "port" | "vignes" | "col" | "dunes" | "lagon" | "volcan";
export type TrackId = BaseTrackId | `${BaseTrackId}-miroir`;
export type Theme = "port" | "vignes" | "col" | "dunes" | "lagon" | "volcan";

export interface TrackDef {
  id: TrackId;
  name: string;
  /** Ce qu'on en dit dans le salon */
  blurb: string;
  theme: Theme;
  /**
   * Les coins du circuit, dans le sens de la course : x, z, et le rayon du virage qui l'arrondit. Entre deux coins,
   * une ligne droite.
   */
  corners: [number, number, number][];
  /**
   * Où est la ligne d'arrivée sur le tracé, en mètres depuis la sortie du premier coin : au milieu de la ligne droite
   * qui suit, pour que toute la grille de départ y tienne
   */
  start: number;
  /** Le relief : la hauteur de la route à différents endroits du tour (part du tour, hauteur en mètres) */
  hills: [number, number][];
  /** La largeur de la route */
  width: number;
  /** Les rangées de caisses, en part du tour (0 : la ligne d'arrivée) */
  boxes: number[];
  /** Les accélérateurs au sol : part du tour, et décalage depuis le milieu en part de la demi-largeur (+ : à droite) */
  boosts: [number, number][];
  /** Les tremplins, en part du tour : toute la largeur de la route */
  jumps: number[];
  /**
   * Les passages : un engin (chariot élévateur, tracteur, chasse-neige) traverse la route à cet endroit (part du
   * tour), aller et retour, toutes les `period` secondes ; `offset` décale son horaire
   */
  crossers: { frac: number; period: number; offset: number }[];
  /** Ce qui bouge sur la route : des conteneurs lâchés par une grue, des tonneaux ou des boules de neige qui dévalent */
  movers: MoverDef[];
  /** Les trampolines : part du tour, et décalage depuis le milieu en part de la demi-largeur */
  springs: [number, number][];
  /** Les sols spéciaux : du début à la fin (parts du tour), d'un bord à l'autre (parts de la demi-largeur) */
  zones: { from: number; to: number; d1: number; d2: number; kind: ZoneKind }[];
  /**
   * Les grands vols : un tremplin (part du tour), un vide de `len` mètres qu'on franchit en deltaplane, et des anneaux
   * à traverser en vol (à combien de mètres du tremplin, sur quelle voie)
   */
  glides?: { frac: number; len: number; hoops?: [number, number][] }[];
  /** Le niveau de la mer : là où la route passe dessous, on roule sous l'eau */
  water?: number;
}

export type ZoneKind = "boue" | "glace" | "sable" | "algues" | "cendre";

export type MoverDef =
  | { kind: "drop"; frac: number; lanes: number[]; period: number; offset: number }
  | {
      kind: "roll";
      frac: number;
      thing: RollThing;
      count: number;
      gap: number;
      period: number;
      speed: number;
      radius: number;
      offset: number;
    };

/** Ce qui traverse la route : ça roule, ou ça marche */
export type RollThing = "tonneau" | "boule" | "mouton" | "virevoltant" | "crabe" | "meduse";

export const TRACK_IDS: BaseTrackId[] = ["port", "vignes", "col", "dunes", "lagon", "volcan"];

// Des routes larges et de grands virages réguliers : de quoi glisser trois ou quatre secondes et charger un turbo
const BASE_TRACKS: Record<BaseTrackId, TrackDef> = {
  port: {
    id: "port",
    name: "Le Port",
    blurb: "Le long des quais, entre les grues et les bateaux : une grande courbe à glisser, une épingle, un tremplin et une chicane.",
    theme: "port",
    width: 18,
    start: 60,
    corners: [
      [-170, 0, 45],
      [190, 0, 60],
      [250, 160, 40],
      [130, 230, 30],
      [70, 120, 30],
      [-30, 170, 50],
      [-150, 250, 45],
      [-260, 150, 55],
    ],
    hills: [[0, 0]],
    boxes: [0.13, 0.46, 0.76, 0.85],
    boosts: [
      [0.245, -0.3],
      [0.55, 0.3],
      [0.97, -0.25],
    ],
    jumps: [0.636],
    crossers: [{ frac: 0.879, period: 9, offset: 0 }],
    movers: [
      { kind: "drop", frac: 0.5744, lanes: [-0.55, 0, 0.55], period: 10, offset: 0.1 },
      { kind: "drop", frac: 0.293, lanes: [-0.55, 0.55], period: 9, offset: 0.62 },
    ],
    springs: [
      [0.2544, 0.5],
      [0.771, -0.5],
    ],
    zones: [],
  },
  vignes: {
    id: "vignes",
    name: "Les Vignes",
    blurb: "De longs lacets entre les rangs de vigne, une montée en courbe vers le château, un tremplin et une descente à glisser.",
    theme: "vignes",
    width: 17,
    start: 60,
    corners: [
      [-140, 0, 50],
      [150, 0, 55],
      [220, -110, 40],
      [130, -200, 45],
      [20, -150, 35],
      [-40, -260, 32],
      [-170, -230, 45],
      [-230, -110, 50],
    ],
    hills: [
      [0, 0],
      [0.2, 2],
      [0.42, 10],
      [0.55, 11],
      [0.8, 1],
    ],
    boxes: [0.12, 0.43, 0.735, 0.95],
    boosts: [
      [0.24, 0.3],
      [0.52, -0.3],
      [0.842, 0.3],
    ],
    jumps: [0.645],
    crossers: [{ frac: 0.336, period: 10, offset: 0.3 }],
    movers: [
      { kind: "roll", frac: 0.875, thing: "tonneau", count: 3, gap: 0.85, period: 8, speed: 13, radius: 1.05, offset: 0.2 },
      { kind: "roll", frac: 0.749, thing: "mouton", count: 5, gap: 0.6, period: 15, speed: 6, radius: 1, offset: 0 },
    ],
    springs: [
      [0.218, -0.5],
      [0.449, 0.5],
      [0.767, 0.5],
    ],
    zones: [
      { from: 0.472, to: 0.5, d1: 0.15, d2: 1, kind: "boue" },
      { from: 0.57, to: 0.6, d1: -1, d2: -0.15, kind: "boue" },
      { from: 0.79, to: 0.815, d1: -1, d2: -0.15, kind: "boue" },
    ],
  },
  col: {
    id: "col",
    name: "Le Col",
    blurb: "Une route de montagne enneigée qui grimpe en larges épingles entre les sapins, saute une crête et plonge vers le village.",
    theme: "col",
    width: 16,
    start: 60,
    corners: [
      [-110, 0, 45],
      [130, 0, 50],
      [175, 85, 38],
      [-20, 85, 32],
      [-20, 155, 32],
      [165, 155, 32],
      [165, 225, 32],
      [-60, 225, 50],
      [-175, 115, 55],
    ],
    hills: [
      [0, 0],
      [0.12, 1],
      [0.5, 16],
      [0.6, 16],
      [0.9, 1],
    ],
    boxes: [0.11, 0.43, 0.59, 0.745],
    boosts: [
      [0.212, -0.3],
      [0.39, 0.3],
      [0.872, -0.3],
    ],
    jumps: [],
    glides: [
      {
        frac: 0.615,
        len: 45,
        hoops: [
          [20, -0.4],
          [42, 0.35],
          [66, -0.1],
        ],
      },
    ],
    crossers: [{ frac: 0.263, period: 9.5, offset: 0.6 }],
    movers: [
      { kind: "roll", frac: 0.673, thing: "boule", count: 2, gap: 1.3, period: 7.5, speed: 11, radius: 1.7, offset: 0.5 },
      { kind: "roll", frac: 0.41, thing: "boule", count: 1, gap: 0, period: 8.5, speed: 8.5, radius: 2.6, offset: 0.15 },
    ],
    springs: [
      [0.458, 0.5],
      [0.892, -0.5],
    ],
    zones: [
      { from: 0.3, to: 0.375, d1: -1, d2: 1, kind: "glace" },
      { from: 0.81, to: 0.86, d1: -1, d2: 1, kind: "glace" },
    ],
  },
  dunes: {
    id: "dunes",
    name: "Les Dunes",
    blurb: "Une piste brûlante entre les dunes et les mesas : du sable mouvant dans les virages, et un canyon à traverser en deltaplane.",
    theme: "dunes",
    width: 18,
    start: 60,
    corners: [
      [-185, 0, 52],
      [185, 0, 52],
      [250, 135, 42],
      [130, 205, 32],
      [20, 130, 30],
      [-15, 285, 38],
      [-215, 285, 46],
      [-270, 145, 50],
    ],
    hills: [
      [0, 0],
      [0.3, 3],
      [0.48, 9],
      [0.62, 12],
      [0.72, 12],
      [0.85, 4],
      [1, 0],
    ],
    boxes: [0.13, 0.346, 0.53, 0.764],
    boosts: [
      [0.2307, -0.3],
      [0.4326, 0.3],
      [0.872, -0.3],
    ],
    jumps: [],
    glides: [
      {
        frac: 0.6244,
        len: 46,
        hoops: [
          [20, 0.4],
          [42, -0.35],
          [66, 0.1],
        ],
      },
    ],
    crossers: [{ frac: 0.7787, period: 9, offset: 0.2 }],
    movers: [
      { kind: "roll", frac: 0.263, thing: "virevoltant", count: 3, gap: 1.1, period: 9, speed: 12, radius: 1.15, offset: 0.4 },
      { kind: "roll", frac: 0.894, thing: "virevoltant", count: 2, gap: 1.4, period: 7.5, speed: 13, radius: 1.15, offset: 0.1 },
    ],
    springs: [
      [0.52, 0.5],
      [0.858, -0.5],
    ],
    zones: [
      { from: 0.284, to: 0.314, d1: 0.15, d2: 1, kind: "sable" },
      { from: 0.4585, to: 0.49, d1: -1, d2: -0.15, kind: "sable" },
      { from: 0.806, to: 0.832, d1: 0.15, d2: 1, kind: "sable" },
    ],
  },
  lagon: {
    id: "lagon",
    name: "Le Lagon",
    blurb:
      "Des bancs de sable entre les paillotes, puis la route plonge sous la mer, parmi les coraux et les méduses, avant un grand vol au-dessus de la baie.",
    theme: "lagon",
    width: 18,
    start: 60,
    corners: [
      [-165, 0, 48],
      [160, 0, 50],
      [240, -115, 42],
      [150, -225, 40],
      [25, -180, 34],
      [-55, -275, 34],
      [-220, -250, 44],
      [-280, -105, 48],
    ],
    hills: [
      [0, 2],
      [0.24, 3],
      [0.36, 3],
      [0.45, -10],
      [0.55, -11],
      [0.64, 6],
      [0.72, 6],
      [0.82, 3],
      [1, 2],
    ],
    boxes: [0.12, 0.35, 0.55, 0.83],
    boosts: [
      [0.225, -0.3],
      [0.45, 0.3],
      [0.9, -0.3],
    ],
    jumps: [],
    glides: [
      {
        frac: 0.6274,
        len: 44,
        hoops: [
          [20, -0.35],
          [42, 0.4],
          [64, 0],
        ],
      },
    ],
    crossers: [{ frac: 0.4427, period: 11, offset: 0.1 }],
    movers: [
      { kind: "roll", frac: 0.539, thing: "meduse", count: 3, gap: 1.1, period: 12, speed: 4.5, radius: 1.15, offset: 0.3 },
      { kind: "roll", frac: 0.77, thing: "crabe", count: 4, gap: 0.7, period: 11, speed: 5.5, radius: 0.85, offset: 0.6 },
    ],
    springs: [
      [0.335, 0.5],
      [0.87, -0.5],
    ],
    zones: [
      { from: 0.378, to: 0.41, d1: -1, d2: -0.15, kind: "algues" },
      { from: 0.477, to: 0.505, d1: 0.15, d2: 1, kind: "algues" },
    ],
    water: 0,
  },
  volcan: {
    id: "volcan",
    name: "Le Volcan",
    blurb:
      "De nuit, sur la roche noire, entre les coulées de lave : les bombes du cratère pleuvent, et il faut voler au-dessus de la caldeira.",
    theme: "volcan",
    width: 17,
    start: 60,
    corners: [
      [-145, 0, 44],
      [135, 0, 48],
      [220, 100, 38],
      [115, 175, 30],
      [170, 275, 34],
      [-40, 310, 42],
      [-65, 175, 30],
      [-225, 210, 44],
      [-255, 75, 44],
    ],
    hills: [
      [0, 0],
      [0.2, 4],
      [0.48, 8],
      [0.56, 8],
      [0.78, 2],
      [1, 0],
    ],
    boxes: [0.12, 0.33, 0.605, 0.7],
    boosts: [
      [0.195, -0.3],
      [0.66, 0.3],
      [0.975, 0.25],
    ],
    jumps: [0.899],
    glides: [
      {
        frac: 0.459,
        len: 42,
        hoops: [
          [20, 0.4],
          [40, -0.35],
          [62, 0.05],
        ],
      },
    ],
    crossers: [{ frac: 0.8, period: 9.5, offset: 0.4 }],
    movers: [
      { kind: "drop", frac: 0.2, lanes: [-0.55, 0, 0.55], period: 7, offset: 0.25 },
      { kind: "drop", frac: 0.593, lanes: [-0.55, 0.55], period: 8, offset: 0.7 },
    ],
    springs: [
      [0.21, 0.5],
      [0.935, -0.5],
    ],
    zones: [
      { from: 0.228, to: 0.262, d1: 0.15, d2: 1, kind: "cendre" },
      { from: 0.52, to: 0.55, d1: 0.15, d2: 1, kind: "cendre" },
      { from: 0.73, to: 0.76, d1: 0.15, d2: 1, kind: "cendre" },
    ],
  },
};

/** Le même circuit, gauche et droite échangées */
function mirrored(def: TrackDef): TrackDef {
  return {
    ...def,
    id: `${def.id}-miroir` as TrackId,
    name: `${def.name} (miroir)`,
    corners: def.corners.map(([x, z, r]) => [-x, z, r]),
    boosts: def.boosts.map(([f, d]) => [f, -d]),
    springs: def.springs.map(([f, d]) => [f, -d]),
    zones: def.zones.map((z) => ({ ...z, d1: -z.d2, d2: -z.d1 })),
    glides: def.glides?.map((g) => ({ ...g, hoops: g.hoops?.map(([along, lane]) => [along, -lane] as [number, number]) })),
  };
}

export const TRACKS: Record<TrackId, TrackDef> = {
  ...BASE_TRACKS,
  "port-miroir": mirrored(BASE_TRACKS.port),
  "vignes-miroir": mirrored(BASE_TRACKS.vignes),
  "col-miroir": mirrored(BASE_TRACKS.col),
  "dunes-miroir": mirrored(BASE_TRACKS.dunes),
  "lagon-miroir": mirrored(BASE_TRACKS.lagon),
  "volcan-miroir": mirrored(BASE_TRACKS.volcan),
};

/** La version en miroir d'un circuit (lui-même s'il l'est déjà) */
export function mirrorOf(id: TrackId): TrackId {
  return id.endsWith("-miroir") ? id : (`${id}-miroir` as TrackId);
}

/** L'écart entre deux échantillons de la route, en mètres */
export const STEP = 2;
/** La largeur du vibreur, de part et d'autre de la route */
export const CURB = 1.2;
/** L'herbe entre la route et le mur */
export const VERGE = 6;

export interface Track {
  def: TrackDef;
  /** La longueur d'un tour */
  length: number;
  n: number;
  /** Le milieu de la route, sa hauteur, sa direction (unitaire) */
  x: Float64Array;
  z: Float64Array;
  y: Float64Array;
  tx: Float64Array;
  tz: Float64Array;
  /** La courbure (radians par mètre, + : la route tourne à gauche) */
  bend: Float64Array;
  half: number;
  /** Au-delà, l'herbe ; au-delà encore, le mur */
  roadEdge: number;
  wall: number;
  boxes: BoxSpot[];
  boosts: BoostPad[];
  /** Le bord de chaque tremplin, en distance depuis la ligne */
  jumps: number[];
  /** Les pièces : des lignes à l'intérieur des virages et le long des lignes droites */
  coins: CoinSpot[];
  /** Les passages : où l'engin traverse (distance depuis la ligne), son horaire, et jusqu'où il va de chaque côté */
  crossers: Crosser[];
  /** Après chaque tremplin, un trou à franchir : du bord du tremplin jusqu'à l'autre rive ; `glide` : en deltaplane */
  gaps: { from: number; to: number; glide: boolean }[];
  /** Les anneaux à traverser en vol : où ils sont, et à quelle hauteur au-dessus de la route */
  hoops: { s: number; d: number; h: number }[];
  /** Le niveau de la mer (null : il n'y en a pas) */
  water: number | null;
  /** Ce qui bouge sur la route */
  movers: Mover[];
  springs: { s: number; d: number }[];
  zones: { s: number; len: number; d1: number; d2: number; kind: ZoneKind }[];
}

export type Mover =
  | { kind: "drop"; s: number; lanes: number[]; period: number; offset: number }
  | {
      kind: "roll";
      s: number;
      thing: RollThing;
      count: number;
      gap: number;
      period: number;
      speed: number;
      radius: number;
      offset: number;
      reach: number;
    };

/** Un endroit où poser quelque chose : si c'est au-dessus d'un trou, juste après l'autre rive */
export function solidGround(t: Track, s: number): number {
  for (const g of t.gaps) {
    const along = deltaS(t, g.from, s);
    if (along >= -2 && along <= g.to - g.from + 2) return wrapS(t, g.to + 3);
  }
  return s;
}

/** La hauteur d'un vol en deltaplane, `along` mètres après le tremplin, pour un kart lancé à pleine vitesse */
export function glideHeight(along: number): number {
  const v = 27;
  const t = Math.max(0, along) / v;
  const sinkAt = (GLIDE_VY + GLIDE_SINK) / GLIDE_G;
  const rise = (u: number) => RAMP_TOP + GLIDE_VY * u - 0.5 * GLIDE_G * u * u;
  return t <= sinkAt ? rise(t) : Math.max(0, rise(sinkAt) - GLIDE_SINK * (t - sinkAt));
}

/** Le deltaplane : la montée au décollage, la pesanteur douce, et la descente la plus rapide (sans plonger) */
export const GLIDE_VY = 6.5;
export const GLIDE_G = 4.2;
export const GLIDE_SINK = 3.2;
const RAMP_TOP = 1;

/** La longueur du trou après un tremplin */
export const GAP_LEN = 13;
/** Un trampoline : son rayon */
export const SPRING_RADIUS = 2.2;

/** Un conteneur : les temps de l'alerte, de la chute, de sa présence sur la route, de sa remontée (en secondes) */
/** La hauteur où il attend, sous le portique */
export const DROP_H = 11;
export const DROP_WARN = 1.7;
export const DROP_FALL = 0.45;
export const DROP_STAY = 4.6;
export const DROP_LIFT = 1;
/** Sa moitié de longueur le long de la route, sa demi-largeur */
export const DROP_HALF = 2.4;
export const DROP_RADIUS = 1.45;

/** Où en est un conteneur à l'heure `time` : sa voie, sa hauteur au-dessus de la route, et s'il est dangereux */
export function dropAt(
  m: Extract<Mover, { kind: "drop" }>,
  half: number,
  time: number,
): { d: number; height: number; phase: "warn" | "fall" | "stay" | "lift" | "none"; solid: boolean; u: number } {
  const total = time / m.period + m.offset;
  const cycle = Math.floor(total);
  const u = (total - cycle) * m.period;
  const hash = Math.abs(Math.imul(cycle * 2654435 + 1, 40503)) % m.lanes.length;
  const d = m.lanes[hash]! * half;
  if (u < DROP_WARN) return { d, height: DROP_H, phase: "warn", solid: false, u };
  if (u < DROP_WARN + DROP_FALL) {
    const f = (u - DROP_WARN) / DROP_FALL;
    return { d, height: DROP_H * (1 - f * f), phase: "fall", solid: f > 0.9, u };
  }
  if (u < DROP_WARN + DROP_FALL + DROP_STAY) return { d, height: 0, phase: "stay", solid: true, u };
  if (u < DROP_WARN + DROP_FALL + DROP_STAY + DROP_LIFT) {
    const f = (u - DROP_WARN - DROP_FALL - DROP_STAY) / DROP_LIFT;
    return { d, height: f * f * DROP_H, phase: "lift", solid: f < 0.08, u };
  }
  return { d, height: DROP_H, phase: "none", solid: false, u };
}

/** Chaque objet qui dévale : son écart au milieu de la route à l'heure `time` (null : il n'est pas sur la route en ce moment) */
export function rollAt(m: Extract<Mover, { kind: "roll" }>, index: number, time: number): number | null {
  const total = time / m.period + m.offset;
  const u = (total - Math.floor(total)) * m.period - index * m.gap;
  const span = (2 * m.reach) / m.speed;
  if (u < 0 || u > span) return null;
  return -m.reach + u * m.speed;
}

export interface CoinSpot {
  index: number;
  x: number;
  z: number;
  s: number;
  d: number;
}

export interface Crosser {
  s: number;
  period: number;
  offset: number;
  /** Il va et vient entre -reach et +reach (il attend sur le bas-côté, de chaque côté) */
  reach: number;
}

/** La taille d'un engin qui traverse, pour les chocs : deux cercles, devant et derrière, dans le sens où il roule */
export const CROSSER_RADIUS = 1.3;
export const CROSSER_HALF = 1.1;

/**
 * Où est l'engin d'un passage à l'heure `time` (en secondes) : son écart au milieu de la route, et sa vitesse de
 * côté. Il traverse en 40 % de la période, attend 10 % sur le bas-côté, revient, attend encore.
 */
export function crosserAt(c: Crosser, time: number): { d: number; vd: number } {
  const u = (((time / c.period + c.offset) % 1) + 1) % 1;
  const span = 2 * c.reach;
  const speed = span / (0.4 * c.period);
  if (u < 0.4) return { d: -c.reach + (u / 0.4) * span, vd: speed };
  if (u < 0.5) return { d: c.reach, vd: 0 };
  if (u < 0.9) return { d: c.reach - ((u - 0.5) / 0.4) * span, vd: -speed };
  return { d: -c.reach, vd: 0 };
}

/** Les virages du circuit : les suites d'échantillons qui tournent assez, du même côté (1 : à gauche) */
export function trackBends(t: Track, minCurve = 1 / 80): { from: number; to: number; side: 1 | -1; turn: number }[] {
  const out: { from: number; to: number; side: 1 | -1; turn: number }[] = [];
  const step = t.length / t.n;
  let start = 0;
  while (start < t.n && Math.abs(t.bend[start]!) >= minCurve) start++;
  let cur: { from: number; to: number; side: 1 | -1; turn: number } | null = null;
  for (let k = 0; k <= t.n; k++) {
    const i = (start + k) % t.n;
    const b = t.bend[i]!;
    const side = b > 0 ? 1 : -1;
    const turning = Math.abs(b) >= minCurve && k < t.n;
    if (turning && cur && cur.side === side) {
      cur.to = i;
      cur.turn += Math.abs(b) * step;
    } else {
      if (cur && cur.turn > 0.6) out.push(cur);
      cur = turning ? { from: i, to: i, side, turn: Math.abs(b) * step } : null;
    }
  }
  return out;
}

/**
 * Les pièces : une ligne de cinq à l'intérieur de chaque virage (la bonne trajectoire paie), et une ligne de quatre
 * sur un côté de chaque longue ligne droite, loin des caisses, des tremplins et des passages
 */
function placeCoins(t: Track): CoinSpot[] {
  const out: CoinSpot[] = [];
  const step = t.length / t.n;
  const near = (s: number, list: number[], gap: number) => list.some((x) => Math.abs(deltaS(t, x, s)) < gap);
  const busy = (s: number) =>
    near(s, t.jumps, 26) ||
    t.gaps.some((g) => {
      const along = deltaS(t, g.from, s);
      return along > -26 && along < g.to - g.from + 12;
    }) ||
    near(
      s,
      t.boxes.map((b) => b.s),
      9,
    ) ||
    near(
      s,
      t.crossers.map((c) => c.s),
      14,
    ) ||
    near(
      s,
      t.movers.map((m) => m.s),
      12,
    ) ||
    near(
      s,
      t.springs.map((p) => p.s),
      6,
    ) ||
    Math.abs(deltaS(t, 0, s)) < 30;
  const line = (s0: number, d: number, count: number) => {
    for (let k = 0; k < count; k++) {
      const s = wrapS(t, s0 + (k - (count - 1) / 2) * 3.6);
      if (busy(s)) continue;
      const p = pointAt(t, s, d);
      out.push({ index: out.length, x: p.x, z: p.z, s, d });
    }
  };
  const bends = trackBends(t);
  for (const b of bends) {
    const len = (((b.to - b.from + t.n) % t.n) + 1) * step;
    // L'intérieur d'un virage à gauche est à gauche (d < 0)
    line(b.from * step + len / 2, -b.side * t.half * 0.55, 5);
  }
  // Les lignes droites : entre deux virages, assez longues
  let side = 1;
  for (let k = 0; k < bends.length; k++) {
    const a = bends[k]!;
    const b = bends[(k + 1) % bends.length]!;
    const from = (a.to + 1) * step;
    const gap = deltaS(t, from, b.from * step);
    if (gap < 70) continue;
    line(from + gap * 0.4, side * t.half * 0.6, 4);
    side = -side;
  }
  return out;
}

export interface BoxSpot {
  /** Le numéro de la caisse sur le circuit */
  index: number;
  x: number;
  z: number;
  s: number;
  d: number;
}

export interface BoostPad {
  s: number;
  d: number;
  /** Sa longueur le long de la route et sa demi-largeur */
  length: number;
  halfWidth: number;
}

type P3 = [number, number, number];

/** La courbe de Catmull-Rom centripète entre p1 et p2 (t de 0 à 1) */
function catmull(p0: P3, p1: P3, p2: P3, p3: P3, t: number): P3 {
  const knot = (a: P3, b: P3, ti: number) => ti + Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) + 1e-6;
  const t0 = 0;
  const t1 = knot(p0, p1, t0);
  const t2 = knot(p1, p2, t1);
  const t3 = knot(p2, p3, t2);
  const u = t1 + (t2 - t1) * t;
  const mix = (a: P3, b: P3, ta: number, tb: number): P3 => {
    const wa = (tb - u) / (tb - ta);
    const wb = (u - ta) / (tb - ta);
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

const built = new Map<TrackId, Track>();

/** Le circuit prêt à servir (calculé une fois) */
export function getTrack(id: TrackId): Track {
  let t = built.get(id);
  if (!t) {
    t = buildTrack(TRACKS[id]);
    built.set(id, t);
  }
  return t;
}

/** La hauteur de la route à cette part du tour : on passe en douceur d'un repère du relief au suivant */
export function hillAt(def: TrackDef, frac: number): number {
  const keys = [...def.hills].sort((a, b) => a[0] - b[0]);
  if (keys.length === 1) return keys[0]![1];
  const f = ((frac % 1) + 1) % 1;
  for (let k = 0; k < keys.length; k++) {
    const [fa, ya] = keys[k]!;
    const [fb0, yb] = keys[(k + 1) % keys.length]!;
    const fb = k + 1 < keys.length ? fb0 : fb0 + 1;
    const ff = f < fa ? f + 1 : f;
    if (ff >= fa && ff <= fb) {
      const u = (ff - fa) / Math.max(1e-9, fb - fa);
      return ya + (yb - ya) * u * u * (3 - 2 * u);
    }
  }
  return keys[0]![1];
}

/** Un coin du tracé, arrondi : son sommet, son rayon, et où commence et finit l'arc */
interface Fillet {
  r: number;
  /** Le centre de l'arc, l'angle de départ et l'angle parcouru (signé) */
  cx: number;
  cz: number;
  a0: number;
  sweep: number;
  /** Le début et la fin de l'arc */
  start: [number, number];
  end: [number, number];
}

/**
 * Le tracé : des lignes droites d'un coin au suivant, chaque coin arrondi par un arc de son rayon. Il se referme
 * forcément. Un rayon trop grand pour la place qu'il a est réduit : `fit` dit de combien au pire (1 : tout tient).
 */
export function traceCorners(def: TrackDef): { points: [number, number, number][]; fit: number; turn: number } {
  const c = def.corners;
  const n = c.length;
  let fit = 1;
  let turn = 0;
  const fillets: Fillet[] = c.map(([px, pz, r0], i) => {
    const [ax, az] = c[(i - 1 + n) % n]!;
    const [bx, bz] = c[(i + 1) % n]!;
    const lin = Math.hypot(px - ax, pz - az);
    const lout = Math.hypot(bx - px, bz - pz);
    const din: [number, number] = [(px - ax) / lin, (pz - az) / lin];
    const dout: [number, number] = [(bx - px) / lout, (bz - pz) / lout];
    const cross = din[0] * dout[1] - din[1] * dout[0];
    const theta = Math.acos(Math.max(-1, Math.min(1, din[0] * dout[0] + din[1] * dout[1])));
    turn += Math.sign(cross) * theta;
    const want = r0 * Math.tan(theta / 2);
    const room = Math.min(lin, lout) / 2;
    let r = r0;
    if (want > room) {
      fit = Math.min(fit, room / want);
      r = room / Math.tan(theta / 2);
    }
    const t = r * Math.tan(theta / 2);
    const start: [number, number] = [px - din[0] * t, pz - din[1] * t];
    const end: [number, number] = [px + dout[0] * t, pz + dout[1] * t];
    // Le centre est du côté où l'on tourne
    const side = cross >= 0 ? 1 : -1;
    const cx = start[0] - din[1] * r * side;
    const cz = start[1] + din[0] * r * side;
    return { r, cx, cz, a0: Math.atan2(start[1] - cz, start[0] - cx), sweep: side * theta, start, end };
  });
  // De la fin du premier coin : la ligne droite vers le suivant, son arc, et ainsi de suite jusqu'au premier coin
  const flat: [number, number][] = [];
  const line = (from: [number, number], to: [number, number]) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const k = Math.max(1, Math.round(len / 3));
    for (let j = 0; j < k; j++) flat.push([from[0] + ((to[0] - from[0]) * j) / k, from[1] + ((to[1] - from[1]) * j) / k]);
  };
  const arc = (f: Fillet) => {
    const k = Math.max(2, Math.round((Math.abs(f.sweep) * f.r) / 3));
    for (let j = 0; j < k; j++) {
      const a = f.a0 + (f.sweep * j) / k;
      flat.push([f.cx + Math.cos(a) * f.r, f.cz + Math.sin(a) * f.r]);
    }
  };
  for (let i = 0; i < n; i++) {
    const next = fillets[(i + 1) % n]!;
    line(fillets[i]!.end, next.start);
    arc(next);
  }
  const cum = [0];
  for (let i = 1; i < flat.length; i++) cum.push(cum[i - 1]! + Math.hypot(flat[i]![0] - flat[i - 1]![0], flat[i]![1] - flat[i - 1]![1]));
  const total = cum[cum.length - 1]! + Math.hypot(flat[0]![0] - flat[flat.length - 1]![0], flat[0]![1] - flat[flat.length - 1]![1]);
  const points = flat.map(([px, pz], i): [number, number, number] => [px, pz, hillAt(def, cum[i]! / total)]);
  return { points, fit, turn: (turn * 180) / Math.PI };
}

export function buildTrack(def: TrackDef): Track {
  // Les points sont donnés en (x, z, y) : on lisse en (x, y, z)
  const pts: P3[] = traceCorners(def).points.map(([x, z, y]) => [x, y, z]);
  const m = pts.length;
  const dense: P3[] = [];
  const SUB = 6;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % m]!;
    const p3 = pts[(i + 2) % m]!;
    for (let k = 0; k < SUB; k++) dense.push(catmull(p0, p1, p2, p3, k / SUB));
  }
  // La longueur au sol, puis des échantillons tous les STEP mètres
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1]!;
    const b = dense[i % dense.length]!;
    cum.push(cum[i - 1]! + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const total = cum[dense.length]!;
  const n = Math.round(total / STEP);
  const step = total / n;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    while (cum[j + 1]! < s) j++;
    const a = dense[j]!;
    const b = dense[(j + 1) % dense.length]!;
    const f = (s - cum[j]!) / Math.max(1e-9, cum[j + 1]! - cum[j]!);
    x[i] = a[0] + (b[0] - a[0]) * f;
    y[i] = a[1] + (b[1] - a[1]) * f;
    z[i] = a[2] + (b[2] - a[2]) * f;
  }
  // La ligne d'arrivée devient le premier échantillon
  const shift = ((Math.round(def.start / step) % n) + n) % n;
  for (const arr of [x, y, z]) {
    const copy = arr.slice();
    for (let i = 0; i < n; i++) arr[i] = copy[(i + shift) % n]!;
  }
  const tx = new Float64Array(n);
  const tz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const dx = x[b]! - x[a]!;
    const dz = z[b]! - z[a]!;
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
  }
  const bend = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const h1 = Math.atan2(tx[a]!, tz[a]!);
    const h2 = Math.atan2(tx[b]!, tz[b]!);
    bend[i] = wrapAngle(h2 - h1) / (2 * step);
  }
  const half = def.width / 2;
  const track: Track = {
    def,
    length: total,
    n,
    x,
    z,
    y,
    tx,
    tz,
    bend,
    half,
    roadEdge: half + CURB,
    wall: half + CURB + VERGE,
    boxes: [],
    boosts: [],
    jumps: [...def.jumps, ...(def.glides ?? []).map((g) => g.frac)].map((f) => f * total),
    coins: [],
    crossers: def.crossers.map((c) => ({ s: c.frac * total, period: c.period, offset: c.offset, reach: half + CURB + 3 })),
    gaps: [
      ...def.jumps.map((f) => ({ from: f * total, to: f * total + GAP_LEN, glide: false })),
      ...(def.glides ?? []).map((g) => ({ from: g.frac * total, to: g.frac * total + g.len, glide: true })),
    ],
    hoops: (def.glides ?? []).flatMap((g) =>
      (g.hoops ?? []).map(([along, lane]) => ({ s: g.frac * total + along, d: lane * half, h: glideHeight(along) })),
    ),
    water: def.water ?? null,
    movers: def.movers.map((m) =>
      m.kind === "drop"
        ? { kind: "drop" as const, s: m.frac * total, lanes: m.lanes, period: m.period, offset: m.offset }
        : { ...m, s: m.frac * total, reach: half + CURB + 5 },
    ),
    springs: def.springs.map(([f, lane]) => ({ s: f * total, d: lane * half })),
    zones: def.zones.map((z) => ({ s: z.from * total, len: (z.to - z.from) * total, d1: z.d1 * half, d2: z.d2 * half, kind: z.kind })),
  };
  // Les caisses : cinq par rangée, en travers de la route
  let index = 0;
  for (const frac of def.boxes) {
    for (const lane of [-0.64, -0.32, 0, 0.32, 0.64]) {
      const s = frac * total;
      const p = pointAt(track, s, lane * half);
      track.boxes.push({ index: index++, x: p.x, z: p.z, s, d: lane * half });
    }
  }
  track.boosts = def.boosts.map(([frac, lane]) => ({ s: frac * total, d: lane * half, length: 7, halfWidth: 1.9 }));
  track.coins = placeCoins(track);
  return track;
}

/** Un angle ramené entre -π et π */
export function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

/** Une distance le long du tour ramenée entre 0 et la longueur du tour */
export function wrapS(t: Track, s: number): number {
  return ((s % t.length) + t.length) % t.length;
}

/** L'écart (signé, le plus court) de s1 à s2 le long du tour */
export function deltaS(t: Track, s1: number, s2: number): number {
  const d = wrapS(t, s2 - s1);
  return d > t.length / 2 ? d - t.length : d;
}

/** Le point de la route à la distance s du départ, décalé de d vers la droite, et la direction de la route */
export function pointAt(t: Track, s: number, d = 0): { x: number; z: number; y: number; tx: number; tz: number } {
  const u = wrapS(t, s) / (t.length / t.n);
  const i = Math.floor(u) % t.n;
  const k = (i + 1) % t.n;
  const f = u - Math.floor(u);
  const tx = t.tx[i]! + (t.tx[k]! - t.tx[i]!) * f;
  const tz = t.tz[i]! + (t.tz[k]! - t.tz[i]!) * f;
  const l = Math.hypot(tx, tz) || 1;
  const ux = tx / l;
  const uz = tz / l;
  // La droite de la route : (-tz, tx)
  return {
    x: t.x[i]! + (t.x[k]! - t.x[i]!) * f - uz * d,
    z: t.z[i]! + (t.z[k]! - t.z[i]!) * f + ux * d,
    y: t.y[i]! + (t.y[k]! - t.y[i]!) * f,
    tx: ux,
    tz: uz,
  };
}

export interface Located {
  /** L'échantillon le plus proche (à redonner comme indice la fois suivante) */
  i: number;
  /** La distance depuis la ligne d'arrivée, le long de la route */
  s: number;
  /** L'écart au milieu de la route, + à droite */
  d: number;
  /** La hauteur de la route à cet endroit */
  y: number;
}

/**
 * Où est ce point sur la route. `hint` : l'échantillon trouvé la dernière fois, pour ne chercher qu'autour
 * (sinon, tout le circuit est parcouru).
 */
export function locate(t: Track, px: number, pz: number, hint = -1): Located {
  let best = -1;
  let bestD = Infinity;
  const scan = (from: number, to: number) => {
    for (let k = from; k <= to; k++) {
      const i = ((k % t.n) + t.n) % t.n;
      const dx = px - t.x[i]!;
      const dz = pz - t.z[i]!;
      const dd = dx * dx + dz * dz;
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
  };
  if (hint >= 0) scan(hint - 14, hint + 14);
  // Trop loin de l'indice (ou pas d'indice) : on cherche partout
  if (best < 0 || bestD > (t.wall + 6) ** 2) scan(0, t.n - 1);
  // Projeté sur le morceau de route le plus proche, de part ou d'autre de l'échantillon
  const i = best;
  const step = t.length / t.n;
  const along = (px - t.x[i]!) * t.tx[i]! + (pz - t.z[i]!) * t.tz[i]!;
  const d = -(px - t.x[i]!) * t.tz[i]! + (pz - t.z[i]!) * t.tx[i]!;
  const s = wrapS(t, i * step + along);
  const j = along >= 0 ? (i + 1) % t.n : (i - 1 + t.n) % t.n;
  const f = Math.min(1, Math.abs(along) / step);
  return { i, s, d, y: t.y[i]! + (t.y[j]! - t.y[i]!) * f };
}

/** La courbure moyenne de la route sur `ahead` mètres à partir de s (+ : vers la gauche) */
export function bendAhead(t: Track, s: number, ahead: number): number {
  const step = t.length / t.n;
  const from = Math.floor(wrapS(t, s) / step);
  const count = Math.max(1, Math.round(ahead / step));
  let sum = 0;
  for (let k = 0; k < count; k++) sum += t.bend[(from + k) % t.n]!;
  return sum / count;
}

/** Les places sur la grille de départ, derrière la ligne : deux par rangée, en quinconce */
export function gridSlot(t: Track, place: number): { x: number; z: number; h: number; s: number } {
  const row = Math.floor(place / 2);
  const side = place % 2 === 0 ? -1 : 1;
  const s = wrapS(t, -8 - row * 6 - (side > 0 ? 3 : 0));
  const p = pointAt(t, s, side * t.half * 0.42);
  return { x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), s };
}
