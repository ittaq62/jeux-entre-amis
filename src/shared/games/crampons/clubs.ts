// Les dispositifs et les effectifs. Tous les clubs et tous les joueurs de Crampons sont inventés.

import type { Player, Role, Stats, Team } from "./model.ts";

/** Un poste : le rôle, `fx` de la défense (0) à l'attaque (1), `fz` de la gauche (-1) à la droite (1) */
type Slot = [Role, number, number];

export type FormationId = "433" | "442" | "352" | "4231" | "532";

export const FORMATION_NAMES: Record<FormationId, string> = {
  "433": "4-3-3",
  "442": "4-4-2",
  "352": "3-5-2",
  "4231": "4-2-3-1",
  "532": "5-3-2",
};

const FORMATIONS: Record<FormationId, Slot[]> = {
  "433": [
    ["GK", 0, 0],
    ["LB", 0.05, -0.85],
    ["CB", 0, -0.3],
    ["CB", 0, 0.3],
    ["RB", 0.05, 0.85],
    ["CM", 0.48, -0.42],
    ["DM", 0.36, 0],
    ["CM", 0.48, 0.42],
    ["LW", 0.92, -0.75],
    ["ST", 1, 0],
    ["RW", 0.92, 0.75],
  ],
  "442": [
    ["GK", 0, 0],
    ["LB", 0.05, -0.85],
    ["CB", 0, -0.3],
    ["CB", 0, 0.3],
    ["RB", 0.05, 0.85],
    ["LM", 0.55, -0.82],
    ["CM", 0.45, -0.25],
    ["CM", 0.45, 0.25],
    ["RM", 0.55, 0.82],
    ["ST", 0.98, -0.22],
    ["ST", 0.98, 0.22],
  ],
  "352": [
    ["GK", 0, 0],
    ["CB", 0, -0.45],
    ["CB", 0, 0],
    ["CB", 0, 0.45],
    ["LM", 0.5, -0.9],
    ["CM", 0.45, -0.32],
    ["DM", 0.32, 0],
    ["CM", 0.45, 0.32],
    ["RM", 0.5, 0.9],
    ["ST", 0.98, -0.22],
    ["ST", 0.98, 0.22],
  ],
  "4231": [
    ["GK", 0, 0],
    ["LB", 0.05, -0.85],
    ["CB", 0, -0.3],
    ["CB", 0, 0.3],
    ["RB", 0.05, 0.85],
    ["DM", 0.32, -0.25],
    ["DM", 0.32, 0.25],
    ["LW", 0.75, -0.75],
    ["AM", 0.7, 0],
    ["RW", 0.75, 0.75],
    ["ST", 1, 0],
  ],
  "532": [
    ["GK", 0, 0],
    ["LB", 0.1, -0.92],
    ["CB", 0, -0.42],
    ["CB", 0, 0],
    ["CB", 0, 0.42],
    ["RB", 0.1, 0.92],
    ["CM", 0.48, -0.42],
    ["DM", 0.36, 0],
    ["CM", 0.48, 0.42],
    ["ST", 0.98, -0.22],
    ["ST", 0.98, 0.22],
  ],
};

const SMALL: Record<number, Slot[]> = {
  5: [
    ["GK", 0, 0],
    ["CB", 0.1, -0.5],
    ["CB", 0.1, 0.5],
    ["CM", 0.6, 0],
    ["ST", 1, 0],
  ],
  7: [
    ["GK", 0, 0],
    ["CB", 0.05, -0.55],
    ["CB", 0.05, 0.55],
    ["LM", 0.55, -0.8],
    ["CM", 0.42, 0],
    ["RM", 0.55, 0.8],
    ["ST", 1, 0],
  ],
};

/** Ce à quoi ressemble chaque poste, à ajouter au niveau de l'équipe */
const ROLE_BIAS: Record<Role, Partial<Stats>> = {
  GK: { pac: -30, sho: -40, pas: -18, dri: -28, tac: -30, gk: 8 },
  CB: { pac: -8, sho: -22, pas: -8, dri: -14, tac: 8, phy: 8 },
  LB: { pac: 4, sho: -18, pas: -4, dri: -6, tac: 2 },
  RB: { pac: 4, sho: -18, pas: -4, dri: -6, tac: 2 },
  DM: { sho: -10, pas: 2, dri: -6, tac: 6, phy: 4 },
  CM: { sho: -3, pas: 6, dri: 2, tac: -2 },
  AM: { sho: 3, pas: 7, dri: 7, tac: -18 },
  LM: { pac: 5, sho: -4, pas: 3, dri: 5, tac: -12 },
  RM: { pac: 5, sho: -4, pas: 3, dri: 5, tac: -12 },
  LW: { pac: 9, sho: 2, pas: 0, dri: 8, tac: -22 },
  RW: { pac: 9, sho: 2, pas: 0, dri: 8, tac: -22 },
  ST: { pac: 5, sho: 8, pas: -6, dri: 3, tac: -28, phy: 2 },
};

export const SURNAMES = [
  "Pichon",
  "Vasseur",
  "Lemoine",
  "Barbier",
  "Chauvin",
  "Tessier",
  "Ragot",
  "Poulain",
  "Bouvier",
  "Gaillard",
  "Renaud",
  "Marchand",
  "Perrot",
  "Maillard",
  "Besson",
  "Hamon",
  "Prévost",
  "Collin",
  "Jacquet",
  "Delorme",
  "Charpentier",
  "Guillot",
  "Picard",
  "Dufour",
  "Morvan",
  "Tanguy",
  "Le Goff",
  "Ferrand",
  "Dumas",
  "Joly",
  "Rigaud",
  "Sauvage",
  "Cordier",
  "Blanchet",
  "Thibaud",
  "Roussel",
  "Lacombe",
  "Pasquier",
  "Lambert",
  "Noiret",
  "Grangier",
  "Fournel",
  "Sénéchal",
  "Berthier",
  "Courtin",
  "Aubry",
  "Mazet",
  "Vidal",
];

function mulberry(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TeamSetup {
  name: string;
  formation: FormationId;
  /** Le niveau d'ensemble, autour de 75 pour une bonne équipe */
  rating: number;
}

/**
 * Un effectif prêt à jouer, avec des noms et des notes tirés de la graine pour rester les mêmes à chaque match. `taken` :
 * les noms de l'adversaire, pour que le commentateur (et le joueur) ne confondent jamais deux joueurs.
 */
export function makeSquad(team: Team, setup: TeamSetup, side: number, seed: number, firstIndex: number, taken: string[] = []): Player[] {
  const rand = mulberry(seed);
  const slots = side === 11 ? FORMATIONS[setup.formation] : (SMALL[side] ?? SMALL[5]!);
  const pool = SURNAMES.filter((n) => !taken.includes(n));
  return slots.map(([role, fx, fz], n) => {
    const pick = Math.floor(rand() * pool.length);
    const name = pool.splice(pick, 1)[0]!;
    const bias = ROLE_BIAS[role];
    const stat = (key: keyof Stats, base = setup.rating) => {
      const v = base + (bias[key] ?? 0) + (rand() - 0.5) * 12;
      return Math.round(Math.max(15, Math.min(99, v)));
    };
    const stats: Stats = {
      pac: stat("pac"),
      sho: stat("sho"),
      pas: stat("pas"),
      dri: stat("dri"),
      tac: stat("tac"),
      phy: stat("phy"),
      gk: role === "GK" ? stat("gk") : 20,
    };
    return {
      i: firstIndex + n,
      team,
      shirt: n === 0 ? 1 : n + 1,
      name,
      role,
      fx,
      fz,
      stats,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      h: 0,
      stam: 1,
      act: "none",
      actT: 0,
      dirX: 0,
      dirZ: 0,
      order: null,
      lockedUntil: 0,
      burstUntil: 0,
      burstReady: 0,
      human: null,
      yellow: 0,
      off: false,
      tx: 0,
      tz: 0,
      sprint: false,
      thinkAt: 0,
      gotAt: 0,
      runUntil: 0,
      runX: 0,
      runZ: 0,
      goals: 0,
    };
  });
}

// -------------------------------------------------------------------------
// Les clubs
// -------------------------------------------------------------------------

export type KitPattern = "uni" | "rayures" | "cercles" | "echarpe" | "moitie";

export interface KitColors {
  shirt: string;
  sleeves: string;
  shorts: string;
  socks: string;
  /** Le motif du maillot, dans la couleur des manches */
  pattern?: KitPattern;
  accent?: string;
}

export interface Club {
  id: string;
  name: string;
  /** Trois lettres, pour le tableau d'affichage */
  short: string;
  rating: number;
  formation: FormationId;
  home: KitColors;
  away: KitColors;
}

const kit = (shirt: string, shorts: string, socks: string, sleeves = shirt, pattern: KitPattern = "uni", accent?: string): KitColors => ({
  shirt,
  sleeves,
  shorts,
  socks,
  pattern,
  accent,
});

/** Tous inventés, du meilleur au plus sympathique */
export const CLUBS: Club[] = [
  {
    id: "saint-ballon",
    name: "AS Saint-Ballon",
    short: "ASB",
    rating: 86,
    formation: "433",
    home: kit("#c8232c", "#ffffff", "#c8232c"),
    away: kit("#f4efe2", "#c8232c", "#f4efe2"),
  },
  {
    id: "haute-combe",
    name: "Olympique de Haute-Combe",
    short: "OHC",
    rating: 84,
    formation: "4231",
    home: kit("#1f4ea8", "#ffffff", "#1f4ea8", "#f2c230"),
    away: kit("#f2c230", "#1f4ea8", "#f2c230"),
  },
  {
    id: "les-forges",
    name: "Les Forges FC",
    short: "FOR",
    rating: 82,
    formation: "442",
    home: kit("#2b2b33", "#2b2b33", "#e8792b", "#e8792b"),
    away: kit("#e8792b", "#2b2b33", "#2b2b33"),
  },
  {
    id: "port-sale",
    name: "FC Port-Salé",
    short: "POR",
    rating: 80,
    formation: "433",
    home: kit("#14a0b8", "#f5f5ee", "#14a0b8"),
    away: kit("#f5f5ee", "#14a0b8", "#14a0b8"),
  },
  {
    id: "mont-bidule",
    name: "Racing Mont-Bidule",
    short: "RMB",
    rating: 78,
    formation: "352",
    home: kit("#2e8b4e", "#f5f5ee", "#2e8b4e"),
    away: kit("#f5f5ee", "#2e8b4e", "#f5f5ee"),
  },
  {
    id: "clairmarais",
    name: "Stade Clairmarais",
    short: "CLA",
    rating: 77,
    formation: "442",
    home: kit("#7d3fa8", "#ffffff", "#7d3fa8"),
    away: kit("#f0d6ff", "#7d3fa8", "#7d3fa8"),
  },
  {
    id: "trois-clochers",
    name: "US Trois-Clochers",
    short: "UTC",
    rating: 76,
    formation: "4231",
    home: kit("#f0c419", "#1f2a44", "#1f2a44"),
    away: kit("#1f2a44", "#f0c419", "#f0c419"),
  },
  {
    id: "vieux-moulin",
    name: "Entente Vieux-Moulin",
    short: "EVM",
    rating: 74,
    formation: "532",
    home: kit("#8c2f3a", "#d8c8a8", "#8c2f3a"),
    away: kit("#d8c8a8", "#8c2f3a", "#d8c8a8"),
  },
  {
    id: "belle-rive",
    name: "JS Belle-Rive",
    short: "JBR",
    rating: 73,
    formation: "433",
    home: kit("#66b8e8", "#ffffff", "#66b8e8"),
    away: kit("#1a3a5c", "#66b8e8", "#1a3a5c"),
  },
  {
    id: "grand-pre",
    name: "Union Grand-Pré",
    short: "UGP",
    rating: 72,
    formation: "442",
    home: kit("#56a832", "#20331a", "#56a832"),
    away: kit("#20331a", "#56a832", "#56a832"),
  },
  {
    id: "sainte-marmite",
    name: "AC Sainte-Marmite",
    short: "ASM",
    rating: 70,
    formation: "352",
    home: kit("#e0572f", "#f7e9d0", "#e0572f"),
    away: kit("#f7e9d0", "#e0572f", "#e0572f"),
  },
  {
    id: "roche-noire",
    name: "Roche-Noire AC",
    short: "RNA",
    rating: 68,
    formation: "532",
    home: kit("#3a3f4a", "#a8adb8", "#3a3f4a"),
    away: kit("#a8adb8", "#3a3f4a", "#a8adb8"),
  },
  {
    id: "val-joli",
    name: "CS Val-Joli",
    short: "CVJ",
    rating: 66,
    formation: "442",
    home: kit("#ef7fa6", "#ffffff", "#ef7fa6"),
    away: kit("#ffffff", "#ef7fa6", "#ef7fa6"),
  },
  {
    id: "moules-frites",
    name: "FC Moules-Frites",
    short: "FMF",
    rating: 62,
    formation: "442",
    home: kit("#f2d04e", "#26364f", "#f2d04e"),
    away: kit("#26364f", "#f2d04e", "#26364f"),
  },
  {
    id: "comptoir",
    name: "Amicale du Comptoir",
    short: "ADC",
    rating: 56,
    formation: "442",
    home: kit("#a8703a", "#f1e4c8", "#a8703a"),
    away: kit("#f1e4c8", "#a8703a", "#f1e4c8"),
  },
  {
    id: "veterans",
    name: "Vétérans du Dimanche",
    short: "VDD",
    rating: 50,
    formation: "532",
    home: kit("#6d8aa8", "#e9e4d6", "#6d8aa8"),
    away: kit("#e9e4d6", "#6d8aa8", "#e9e4d6"),
  },
];

/** Le motif du maillot à domicile : chaque club a le sien */
const HOME_PATTERNS: Record<string, [KitPattern, string]> = {
  "saint-ballon": ["echarpe", "#ffffff"],
  "haute-combe": ["rayures", "#f2c230"],
  "les-forges": ["cercles", "#e8792b"],
  "port-sale": ["cercles", "#f5f5ee"],
  "mont-bidule": ["moitie", "#f5f5ee"],
  clairmarais: ["rayures", "#ffffff"],
  "trois-clochers": ["echarpe", "#1f2a44"],
  "vieux-moulin": ["moitie", "#d8c8a8"],
  "belle-rive": ["rayures", "#ffffff"],
  "grand-pre": ["cercles", "#20331a"],
  "moules-frites": ["rayures", "#26364f"],
};
for (const c of CLUBS) {
  const p = HOME_PATTERNS[c.id];
  if (p) [c.home.pattern, c.home.accent] = p;
}

export const CLUB_BY_ID = new Map(CLUBS.map((c) => [c.id, c]));

/**
 * « de » suivi du nom d'un club, avec le bon article : de l'AS Saint-Ballon, des Forges FC, du FC Port-Salé,
 * de la JS Belle-Rive, de Roche-Noire AC
 */
export function deClub(name: string): string {
  if (/^les /i.test(name)) return `des ${name.slice(4)}`;
  if (/^le /i.test(name)) return `du ${name.slice(3)}`;
  if (/^la /i.test(name)) return `de la ${name.slice(3)}`;
  if (/^(FC|CS|Racing|Stade|Club|Sporting|Red Star)\b/.test(name)) return `du ${name}`;
  if (/^(JS|ES)\b/.test(name)) return `de la ${name}`;
  if (/^(AS|AC|US|Olympique|Entente|Union|Amicale|Athletic|Association)\b/i.test(name)) return `de l'${name}`;
  if (/^(Vétérans|Anciens|Amis)\b/.test(name)) return `des ${name}`;
  return `de ${name}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Les deux maillots doivent se distinguer d'un coup d'œil : si besoin, l'équipe qui reçoit moins prend sa tenue d'extérieur */
export function matchKits(a: Club, b: Club): [KitColors, KitColors] {
  const [r0, g0, b0] = hexToRgb(a.home.shirt);
  const [r1, g1, b1] = hexToRgb(b.home.shirt);
  const close = Math.hypot(r0 - r1, g0 - g1, b0 - b1) < 130;
  return [a.home, close ? b.away : b.home];
}

export const KEEPER_KITS: [KitColors, KitColors] = [
  { shirt: "#55c26c", sleeves: "#55c26c", shorts: "#143a24", socks: "#55c26c" },
  { shirt: "#f08a3c", sleeves: "#f08a3c", shorts: "#3a2412", socks: "#f08a3c" },
];
