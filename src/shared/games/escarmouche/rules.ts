// Les règles d'une partie d'Escarmouche : le mode, la carte, la durée, le score à atteindre, les bots, les armes.

import { isMapId, type MapId } from "./maps.ts";

export type Mode = "solo" | "equipes" | "conquete" | "sabotage" | "zone" | "drapeau";
export const MODES: Mode[] = ["solo", "equipes", "conquete", "sabotage", "zone", "drapeau"];

export type BotLevel = "facile" | "moyen" | "fort";
export const BOT_LEVELS: BotLevel[] = ["facile", "moyen", "fort"];

/** Les armes permises : toutes, ou une seule pour tout le monde (variantes) */
export type Arsenal = "libre" | "precision" | "pompe" | "pistolet";

export const MODE_INFO: Record<
  Mode,
  { name: string; short: string; blurb: string; teams: boolean; goals: [number, number, number]; unit: string }
> = {
  solo: {
    name: "Chacun pour soi",
    short: "Chacun pour soi",
    blurb: "Tout le monde contre tout le monde : le premier au score l'emporte.",
    teams: false,
    goals: [15, 25, 40],
    unit: "éliminations",
  },
  equipes: {
    name: "Équipes",
    short: "Équipes",
    blurb: "Deux équipes : chaque adversaire éliminé rapporte un point à la sienne.",
    teams: true,
    goals: [30, 50, 75],
    unit: "éliminations",
  },
  conquete: {
    name: "Conquête",
    short: "Conquête",
    blurb:
      "Trois drapeaux à prendre et à tenir. Chaque retour au combat coûte un ticket à son équipe, et celle qui tient le plus de drapeaux fait fondre les tickets de l'autre.",
    teams: true,
    goals: [60, 100, 150],
    unit: "tickets",
  },
  sabotage: {
    name: "Sabotage",
    short: "Sabotage",
    blurb:
      "Les rouges attaquent, les bleus défendent deux dépôts de munitions. Accroupi contre un dépôt, on pose une charge qui saute 25 s plus tard, sauf si un défenseur la désamorce. Les renforts des attaquants sont comptés.",
    teams: true,
    goals: [40, 60, 90],
    unit: "renforts",
  },
  zone: {
    name: "Zone à tenir",
    short: "Zone",
    blurb: "La zone du centre rapporte un point par seconde à l'équipe qui l'occupe seule.",
    teams: true,
    goals: [100, 150, 250],
    unit: "points",
  },
  drapeau: {
    name: "Capture du drapeau",
    short: "Drapeau",
    blurb: "Prendre le drapeau adverse et le ramener chez soi, pendant que le sien est à sa place.",
    teams: true,
    goals: [2, 3, 5],
    unit: "drapeaux",
  },
};

export const MINUTE_CHOICES = [5, 8, 12] as const;

export interface EscarmoucheSettings {
  mode: Mode;
  map: MapId | "hasard";
  minutes: number;
  /** Le score à atteindre : 0 court, 1 normal, 2 long (voir MODE_INFO) */
  goal: number;
  botLevel: BotLevel;
  arsenal: Arsenal;
  /** Sans filet : pas de réticule, pas de regain de santé, des dégâts plus lourds */
  hardcore: boolean;
  /** De nuit : la lune et les lampadaires pour seule lumière ; les bots voient moins loin */
  night: boolean;
}

export const DEFAULT_SETTINGS: EscarmoucheSettings = {
  mode: "solo",
  map: "hasard",
  minutes: 8,
  goal: 1,
  botLevel: "facile",
  arsenal: "libre",
  hardcore: false,
  night: false,
};

export const ARSENAL_NAMES: Record<Arsenal, string> = {
  libre: "Toutes les armes",
  precision: "Fusils de précision",
  pompe: "Fusils à pompe",
  pistolet: "Pistolets",
};

/** Applique les réglages reçus, en refusant tout ce qui n'existe pas */
export function mergeSettings(current: EscarmoucheSettings, patch: Partial<EscarmoucheSettings>): EscarmoucheSettings {
  const next = { ...DEFAULT_SETTINGS, ...current };
  if ((MODES as unknown[]).includes(patch.mode)) next.mode = patch.mode!;
  if (patch.map === "hasard" || isMapId(patch.map)) next.map = patch.map;
  if ((MINUTE_CHOICES as readonly unknown[]).includes(patch.minutes)) next.minutes = patch.minutes!;
  if (patch.goal === 0 || patch.goal === 1 || patch.goal === 2) next.goal = patch.goal;
  if ((BOT_LEVELS as unknown[]).includes(patch.botLevel)) next.botLevel = patch.botLevel!;
  if (patch.arsenal === "libre" || patch.arsenal === "precision" || patch.arsenal === "pompe" || patch.arsenal === "pistolet") {
    next.arsenal = patch.arsenal;
  }
  if (typeof patch.hardcore === "boolean") next.hardcore = patch.hardcore;
  if (typeof patch.night === "boolean") next.night = patch.night;
  return next;
}

export function goalOf(s: EscarmoucheSettings): number {
  return MODE_INFO[s.mode].goals[s.goal] ?? MODE_INFO[s.mode].goals[1];
}
