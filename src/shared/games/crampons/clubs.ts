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

const SURNAMES = [
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

/** Un effectif prêt à jouer, avec des noms et des notes tirés de la graine pour rester les mêmes à chaque match */
export function makeSquad(team: Team, setup: TeamSetup, side: number, seed: number, firstIndex: number): Player[] {
  const rand = mulberry(seed);
  const slots = side === 11 ? FORMATIONS[setup.formation] : (SMALL[side] ?? SMALL[5]!);
  const pool = SURNAMES.slice();
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
