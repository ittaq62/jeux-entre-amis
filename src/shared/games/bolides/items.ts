// Les objets de Bolides, tirés dans les caisses : de quoi filer (turbo), se défendre (bouclier), ou gêner les autres
// (flaque d'huile derrière soi, pétard qui file droit devant le long de la route, klaxon qui fait tourner les voisins,
// fusée qui va chercher le premier, arc-en-ciel qui rend intouchable et renverse tout sur son passage).
// Plus on est loin dans la course, meilleurs sont les objets.

import { pointAt, type Track } from "./track.ts";

export type ItemKind =
  | "turbo"
  | "turbo3"
  | "huile"
  | "petard"
  | "bouclier"
  | "klaxon"
  | "fusee"
  | "arc"
  | "bowling"
  | "tarte"
  | "ressort"
  | "geant"
  | "orage"
  | "aimant"
  | "bombe";

export const ITEM_KINDS: ItemKind[] = [
  "turbo",
  "turbo3",
  "huile",
  "petard",
  "bouclier",
  "klaxon",
  "fusee",
  "arc",
  "bowling",
  "tarte",
  "ressort",
  "geant",
  "orage",
  "aimant",
  "bombe",
];

export const ITEM_NAMES: Record<ItemKind, string> = {
  turbo: "Turbo",
  turbo3: "Triple turbo",
  huile: "Flaque d'huile",
  petard: "Pétard",
  bouclier: "Bouclier",
  klaxon: "Klaxon",
  fusee: "Fusée",
  arc: "Arc-en-ciel",
  bowling: "Boule de bowling",
  tarte: "Tarte à la crème",
  ressort: "Ressort",
  geant: "Potion géante",
  orage: "Orage",
  aimant: "Aimant",
  bombe: "Bombe",
};

export const ITEM_HINTS: Record<ItemKind, string> = {
  turbo: "Un coup d'accélérateur",
  turbo3: "Trois coups d'accélérateur",
  huile: "Laissée derrière toi : celui qui roule dessus part en tête-à-queue",
  petard: "File droit devant le long de la route et fait tourner le premier qu'il touche",
  bouclier: "Te protège du prochain coup pendant quelques secondes",
  klaxon: "Fait tourner tous les karts autour de toi et balaie les pièges",
  fusee: "File le long de la route, au-dessus de tout le monde, et va frapper le premier",
  arc: "Quelques secondes plus vite, sans craindre l'herbe ni les coups ; ceux que tu touches partent en tête-à-queue",
  bowling: "Roule devant toi en zigzag et renverse tout le monde sur son passage",
  tarte: "Vole vers le kart le plus proche et lui couvre l'écran de crème",
  ressort: "Un grand saut quand tu veux, par-dessus les pièges (et une figure en l'air !)",
  geant: "Te rend énorme quelques secondes : tu écrases tout ce que tu touches",
  orage: "La foudre frappe tous ceux qui sont devant toi",
  aimant: "Attire les pièces autour de toi et en vole à ceux que tu frôles",
  bombe: "Se lance devant toi et explose peu après : gare à qui se trouve autour",
};

/** Ce qu'on affiche en recevant l'objet : une seule phrase, qui dit quoi en faire */
export const ITEM_TIPS: Record<ItemKind, string> = {
  turbo: "Accélère d'un coup : garde-le pour une ligne droite",
  turbo3: "Trois accélérations : appuie trois fois",
  huile: "Se pose derrière toi, pour ceux qui te suivent",
  petard: "Part tout droit : aligne-toi avec un kart",
  bouclier: "Bloque le prochain coup : garde-le pour te protéger",
  klaxon: "Renverse tous ceux qui sont autour de toi",
  fusee: "Part toute seule frapper le premier",
  arc: "Intouchable et très rapide : fonce dans les autres",
  bowling: "Roule en zigzag devant toi et renverse tout",
  tarte: "Vole vers le kart le plus proche",
  ressort: "Un grand saut, par-dessus les pièges",
  geant: "Tu deviens énorme et tu écrases ceux que tu touches",
  orage: "Foudroie tous ceux qui sont devant toi",
  aimant: "Attire les pièces, et en vole à ceux que tu frôles",
  bombe: "Retombe loin devant et explose",
};

/** Le sens où part un objet qu'on lance (null : il ne se lance pas) ; on peut toujours l'envoyer de l'autre côté */
export const ITEM_AIM: Record<ItemKind, "front" | "back" | null> = {
  turbo: null,
  turbo3: null,
  huile: "back",
  petard: "front",
  bouclier: null,
  klaxon: null,
  fusee: null,
  arc: null,
  bowling: "front",
  tarte: "front",
  ressort: null,
  geant: null,
  orage: null,
  aimant: null,
  bombe: "front",
};

/** Le nombre d'utilisations d'un objet */
export const ITEM_USES: Record<ItemKind, number> = {
  turbo: 1,
  turbo3: 3,
  huile: 1,
  petard: 1,
  bouclier: 1,
  klaxon: 1,
  fusee: 1,
  arc: 1,
  bowling: 1,
  tarte: 1,
  ressort: 1,
  geant: 1,
  orage: 1,
  aimant: 1,
  bombe: 1,
};

/** Le turbo d'un objet, en secondes */
export const TURBO_TIME = 1.3;
export const SHIELD_MS = 8000;
export const OIL_RADIUS = 1.7;
export const OIL_MS = 40_000;
/** Celui qui pose une flaque ne glisse pas dessus en la posant (au tour suivant, si) */
export const OIL_SAFE_MS = 1500;
/** Une flaque lancée devant soi retombe à cette distance */
export const OIL_AHEAD = 22;
/** Le pétard : sa vitesse le long de la route (plus vite que n'importe quel kart), sa durée, sa taille */
export const PETARD_SPEED = 44;
export const PETARD_MS = 3500;
export const PETARD_RADIUS = 1.3;
/** Son lanceur ne peut pas être touché tout de suite */
export const PETARD_SAFE_MS = 600;
export const KLAXON_RADIUS = 10;
/** La fusée : sa vitesse le long de la course, le temps qu'elle a pour rattraper le premier */
export const FUSEE_SPEED = 62;
export const FUSEE_MS = 22_000;
/** L'arc-en-ciel : sa durée, la vitesse de pointe en plus, et la distance à laquelle on renverse les autres */
export const ARC_MS = 6000;
export const ARC_SPEED = 1.18;
export const ARC_RADIUS = 2.4;
/** La boule de bowling : sa vitesse le long de la route, de côté (elle rebondit d'un bord à l'autre), sa durée, sa taille */
export const BOWLING_SPEED = 38;
export const BOWLING_SIDE = 7;
export const BOWLING_MS = 5000;
export const BOWLING_RADIUS = 1.5;
/** La tarte : sa vitesse, sa portée (en mètres de course), et ce qu'elle dure sur l'écran de celui qu'elle touche */
export const TARTE_SPEED = 62;
export const TARTE_RANGE = 110;
export const TARTE_MS = 4500;
export const PIE_MS = 4000;
/** La vitesse de décollage du ressort */
export const RESSORT_VY = 12;
/** La potion géante : sa durée, la vitesse en plus, la distance à laquelle elle écrase */
export const GEANT_MS = 7000;
export const GEANT_SPEED = 1.08;
export const GEANT_RADIUS = 3.4;
/** L'aimant : sa durée, le rayon où il attire les pièces, et la distance à laquelle il en vole */
export const AIMANT_MS = 8000;
export const AIMANT_RADIUS = 9;
export const AIMANT_STEAL = 6;
/** La bombe : où elle retombe devant le kart, le temps en l'air, le moment où elle saute, et le rayon de l'explosion */
export const BOMBE_AHEAD = 32;
/** Lancée derrière soi, elle retombe moins loin */
export const BOMBE_BACK = 20;
export const BOMBE_FLY_MS = 800;
export const BOMBE_MS = 2000;
export const BOMBE_RADIUS = 8.5;
/** Une caisse prise revient au bout de ce temps */
export const BOX_RESPAWN_MS = 3000;
/** Les pièces : dix au plus, chacune donne un peu de vitesse de pointe ; on en perd trois quand on est touché */
export const COIN_MAX = 10;
export const COIN_SPEED = 0.008;
export const COIN_LOSS = 3;
export const COIN_RADIUS = 0.9;
export const COIN_RESPAWN_MS = 8000;
export const BOX_RADIUS = 1.5;

// Les chances de chaque objet, selon qu'on est en tête, au milieu ou derrière
const TABLES: [number, Partial<Record<ItemKind, number>>][] = [
  // En tête : de quoi se défendre
  [0.12, { huile: 26, bouclier: 18, petard: 16, tarte: 14, bombe: 10, aimant: 10, turbo: 6 }],
  // Dans le groupe de tête
  [0.35, { petard: 18, huile: 12, tarte: 14, bouclier: 12, turbo: 12, bowling: 10, bombe: 10, aimant: 8, klaxon: 4 }],
  // Au milieu
  [
    0.6,
    {
      petard: 12,
      turbo: 16,
      tarte: 10,
      bowling: 12,
      klaxon: 10,
      bombe: 8,
      ressort: 6,
      bouclier: 6,
      turbo3: 8,
      aimant: 6,
      arc: 3,
      fusee: 3,
    },
  ],
  // À la traîne
  [0.85, { turbo3: 20, turbo: 12, bowling: 12, klaxon: 8, arc: 10, geant: 10, fusee: 10, ressort: 6, petard: 6, orage: 6 }],
  // Loin derrière : de quoi revenir
  [1.01, { turbo3: 26, arc: 18, geant: 16, fusee: 14, orage: 10, turbo: 8, klaxon: 8 }],
];

/** L'objet tiré dans une caisse ; `rank` : 0 en tête, 1 très loin derrière */
export function drawItem(rank: number, rand: () => number): ItemKind {
  const table = TABLES.find(([upTo]) => rank < upTo)![1];
  const entries = Object.entries(table) as [ItemKind, number][];
  let roll = rand() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [kind, w] of entries) {
    roll -= w;
    if (roll < 0) return kind;
  }
  return entries[0]![0];
}

/** Les images qui défilent dans la roue des objets : au hasard, jamais deux fois la même d'affilée, et on s'arrête sur `final` */
export function rouletteStrip(final: ItemKind, rand: () => number, length = 12): ItemKind[] {
  const strip: ItemKind[] = [final];
  while (strip.length < length) {
    const others = ITEM_KINDS.filter((k) => k !== strip[0]);
    strip.unshift(others[Math.floor(rand() * others.length)]!);
  }
  return strip;
}

/** Qui la tarte va viser : le plus proche devant (ou derrière si on la lance en arrière), sinon de l'autre côté, à portée */
export function tarteTarget<T extends { id: string; dist: number; done: boolean }>(
  list: T[],
  me: string,
  myDist: number,
  flip = false,
): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const o of list) {
    if (o.id === me || o.done) continue;
    const gap = (o.dist - myDist) * (flip ? -1 : 1);
    if (Math.abs(gap) > TARTE_RANGE) continue;
    const score = gap > 0 ? gap : -gap + 60;
    if (score < bestScore) {
      best = o;
      bestScore = score;
    }
  }
  return best;
}

/** Un piège sur la route : une flaque posée, un pétard qui file, une fusée lancée vers le premier, une boule qui roule, une tarte qui vole, une bombe */
export type Hazard =
  | {
      id: number;
      kind: "bowling";
      s0: number;
      d0: number;
      /** Sa vitesse le long de la route, et de quel côté elle part */
      speed: number;
      side: number;
      owner: string;
      at: number;
      /** Ceux qu'elle a déjà renversés (elle ne s'arrête pas pour autant) */
      struck: string[];
    }
  | {
      id: number;
      kind: "tarte";
      dist0: number;
      /** Vers l'avant (1) ou l'arrière (-1) de la course */
      dir: number;
      target: string;
      owner: string;
      at: number;
    }
  | {
      id: number;
      kind: "bombe";
      /** D'où elle part, et où elle retombe */
      x0: number;
      z0: number;
      y0: number;
      s: number;
      d: number;
      owner: string;
      at: number;
    }
  | {
      id: number;
      kind: "fusee";
      /** D'où elle part, en distance de course (comme celle des karts), et le pilote qu'elle va chercher */
      dist0: number;
      target: string;
      owner: string;
      at: number;
    }
  /** Une flaque : où elle est, et où ça tombe le long de la route */
  | { id: number; kind: "huile"; x: number; z: number; s: number; d: number; owner: string; at: number }
  | {
      id: number;
      kind: "petard";
      /** Là d'où il part le long de la route, son écart au milieu, sa vitesse */
      s0: number;
      d: number;
      speed: number;
      owner: string;
      at: number;
    };

/** Où est un piège à cet instant (null : il a fini sa course) */
export function hazardPos(t: Track, hz: Hazard, now: number): { x: number; z: number; y: number; h: number } | null {
  if (hz.kind === "huile") return now - hz.at > OIL_MS ? null : { x: hz.x, z: hz.z, y: 0, h: 0 };
  if (hz.kind === "bowling") {
    const age = Math.max(0, now - hz.at);
    if (age > BOWLING_MS) return null;
    return posOf(t, hz.s0 + (hz.speed * age) / 1000, bounceBetween(hz.d0 + (hz.side * BOWLING_SIDE * age) / 1000, t.half - 1.3));
  }
  if (hz.kind === "tarte") {
    const age = Math.max(0, now - hz.at);
    if (age > TARTE_MS) return null;
    const p = posOf(t, tarteDist(hz, now), 0);
    return { ...p, y: p.y + 2.4 };
  }
  if (hz.kind === "bombe") {
    const age = Math.max(0, now - hz.at);
    if (age > BOMBE_MS) return null;
    const land = pointAt(t, hz.s, hz.d);
    if (age >= BOMBE_FLY_MS) return { x: land.x, z: land.z, y: land.y + 0.55, h: 0 };
    const f = age / BOMBE_FLY_MS;
    return {
      x: hz.x0 + (land.x - hz.x0) * f,
      z: hz.z0 + (land.z - hz.z0) * f,
      y: hz.y0 + (land.y + 0.55 - hz.y0) * f + Math.sin(f * Math.PI) * 7,
      h: f * 9,
    };
  }
  if (hz.kind === "fusee") {
    const age = Math.max(0, now - hz.at);
    if (age > FUSEE_MS) return null;
    const p = posOf(t, fuseeDist(hz, now), 0);
    // Elle vole au-dessus des karts
    return { ...p, y: p.y + 3 };
  }
  const age = now - hz.at;
  if (age > PETARD_MS || age < 0) return age < 0 ? { ...posOf(t, hz.s0, hz.d) } : null;
  return posOf(t, hz.s0 + (hz.speed * age) / 1000, hz.d);
}

/** Une valeur qui rebondit entre -edge et +edge (la boule de bowling d'un bord à l'autre de la route) */
export function bounceBetween(v: number, edge: number): number {
  const span = edge * 4;
  const u = (((v + edge) % span) + span) % span;
  return u <= 2 * edge ? u - edge : 3 * edge - u;
}

/** Où en est une tarte, en distance de course */
export function tarteDist(hz: Extract<Hazard, { kind: "tarte" }>, now: number): number {
  return hz.dist0 + (hz.dir * TARTE_SPEED * Math.max(0, now - hz.at)) / 1000;
}

/** Où en est une fusée, en distance de course */
export function fuseeDist(hz: Extract<Hazard, { kind: "fusee" }>, now: number): number {
  return hz.dist0 + (FUSEE_SPEED * Math.max(0, now - hz.at)) / 1000;
}

function posOf(t: Track, s: number, d: number) {
  const p = pointAt(t, s, d);
  return { x: p.x, z: p.z, y: p.y, h: Math.atan2(p.tx, p.tz) };
}

/** Le segment parcouru par un kart (de a à b) passe-t-il à moins de r du point c ? */
export function sweptHit(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  const f = len > 1e-9 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / len)) : 0;
  const px = ax + dx * f - cx;
  const pz = az + dz * f - cz;
  return px * px + pz * pz <= r * r;
}
