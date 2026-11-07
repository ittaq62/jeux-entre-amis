// Les objets de Bolides, tirés dans les caisses : de quoi filer (turbo), se défendre (bouclier), ou gêner les autres
// (flaque d'huile derrière soi, pétard qui file droit devant le long de la route, klaxon qui fait tourner les voisins).
// Plus on est loin dans la course, meilleurs sont les objets.

import { pointAt, type Track } from "./track.ts";

export type ItemKind = "turbo" | "turbo3" | "huile" | "petard" | "bouclier" | "klaxon";

export const ITEM_KINDS: ItemKind[] = ["turbo", "turbo3", "huile", "petard", "bouclier", "klaxon"];

export const ITEM_NAMES: Record<ItemKind, string> = {
  turbo: "Turbo",
  turbo3: "Triple turbo",
  huile: "Flaque d'huile",
  petard: "Pétard",
  bouclier: "Bouclier",
  klaxon: "Klaxon",
};

export const ITEM_HINTS: Record<ItemKind, string> = {
  turbo: "Un coup d'accélérateur",
  turbo3: "Trois coups d'accélérateur",
  huile: "Laissée derrière toi : celui qui roule dessus part en tête-à-queue",
  petard: "File droit devant le long de la route et fait tourner le premier qu'il touche",
  bouclier: "Te protège du prochain coup pendant quelques secondes",
  klaxon: "Fait tourner tous les karts autour de toi et balaie les pièges",
};

/** Le nombre d'utilisations d'un objet */
export const ITEM_USES: Record<ItemKind, number> = { turbo: 1, turbo3: 3, huile: 1, petard: 1, bouclier: 1, klaxon: 1 };

/** Le turbo d'un objet, en secondes */
export const TURBO_TIME = 1.3;
export const SHIELD_MS = 8000;
export const OIL_RADIUS = 1.7;
export const OIL_MS = 40_000;
/** Celui qui pose une flaque ne glisse pas dessus en la posant (au tour suivant, si) */
export const OIL_SAFE_MS = 1500;
/** Le pétard : sa vitesse le long de la route (plus vite que n'importe quel kart), sa durée, sa taille */
export const PETARD_SPEED = 44;
export const PETARD_MS = 3500;
export const PETARD_RADIUS = 1.3;
/** Son lanceur ne peut pas être touché tout de suite */
export const PETARD_SAFE_MS = 600;
export const KLAXON_RADIUS = 10;
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
  [0.25, { huile: 36, bouclier: 26, petard: 24, turbo: 14 }],
  [0.7, { petard: 30, turbo: 26, huile: 14, bouclier: 14, klaxon: 16 }],
  [1.01, { turbo3: 30, turbo: 18, petard: 26, klaxon: 26 }],
];

/** L'objet tiré dans une caisse ; `rank` : 0 en tête, 1 dernier */
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

/** Un piège sur la route : une flaque posée, ou un pétard qui file */
export type Hazard =
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
  const age = now - hz.at;
  if (age > PETARD_MS || age < 0) return age < 0 ? { ...posOf(t, hz.s0, hz.d) } : null;
  return posOf(t, hz.s0 + (hz.speed * age) / 1000, hz.d);
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
