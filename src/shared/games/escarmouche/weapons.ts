// Les armes d'Escarmouche : une arme principale choisie à chaque retour au combat, le pistolet, une grenade et le
// couteau. Des armes génériques, sans marque ni modèle réel : chacune a son rôle, de la portée du fusil de précision
// au corps à corps du fusil à pompe.

export type WeaponId = "fa" | "pm" | "pompe" | "precision" | "pistolet";

export const PRIMARY_IDS = ["fa", "pm", "pompe", "precision"] as const satisfies readonly WeaponId[];
export type PrimaryId = (typeof PRIMARY_IDS)[number];
export const WEAPON_IDS: WeaponId[] = ["fa", "pm", "pompe", "precision", "pistolet"];

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Ce qu'on en dit au moment de la choisir */
  blurb: string;
  /** Tir continu tant qu'on tient la détente ; sinon un coup par appui */
  auto: boolean;
  /** Secondes entre deux coups */
  interval: number;
  /** Plombs par coup (le fusil à pompe en tire plusieurs) */
  pellets: number;
  /** Dégâts d'un plomb : de près, puis au-delà de la portée */
  dmg: [number, number];
  /** Les dégâts baissent entre ces deux distances (m) */
  range: [number, number];
  /** Multiplicateur à la tête, et aux jambes */
  head: number;
  legs: number;
  mag: number;
  reserve: number;
  /** Secondes de rechargement */
  reload: number;
  /** Dispersion (degrés) : à la hanche, en visant, et en plus en courant */
  hip: number;
  ads: number;
  moving: number;
  /** Dispersion ajoutée à chaque coup, son plafond, et sa décrue par seconde */
  bloom: number;
  bloomMax: number;
  bloomDecay: number;
  /** Vitesse de marche, et ce qu'il en reste en visant */
  move: number;
  adsMove: number;
  /** Champ de vision en visant (degrés) */
  adsFov: number;
  /** Le recul (degrés vers le haut) que ressent le tireur : seulement sa vue, le serveur prend la direction envoyée */
  kick: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fa: {
    id: "fa",
    name: "Fusil d'assaut",
    blurb: "Polyvalent : précis en visant, efficace à toutes les distances.",
    auto: true,
    interval: 0.092,
    pellets: 1,
    dmg: [27, 20],
    range: [22, 48],
    head: 1.9,
    legs: 0.8,
    mag: 30,
    reserve: 120,
    reload: 2.1,
    hip: 2.4,
    ads: 0.25,
    moving: 2,
    bloom: 0.32,
    bloomMax: 3,
    bloomDecay: 8,
    move: 0.95,
    adsMove: 0.55,
    adsFov: 50,
    kick: 0.8,
  },
  pm: {
    id: "pm",
    name: "Pistolet-mitrailleur",
    blurb: "Cadence folle et pas léger : imbattable de près, il faiblit vite au loin.",
    auto: true,
    interval: 0.068,
    pellets: 1,
    dmg: [22, 13],
    range: [10, 28],
    head: 1.6,
    legs: 0.8,
    mag: 32,
    reserve: 160,
    reload: 1.8,
    hip: 2.8,
    ads: 0.8,
    moving: 1.2,
    bloom: 0.25,
    bloomMax: 2.6,
    bloomDecay: 10,
    move: 1.05,
    adsMove: 0.65,
    adsFov: 62,
    kick: 0.55,
  },
  pompe: {
    id: "pompe",
    name: "Fusil à pompe",
    blurb: "Une gerbe de plombs : redoutable dans les maisons, inutile au-delà de vingt mètres.",
    auto: false,
    interval: 0.9,
    pellets: 8,
    dmg: [16, 3],
    range: [7, 20],
    head: 1.4,
    legs: 0.8,
    mag: 6,
    reserve: 24,
    reload: 2.6,
    hip: 5.5,
    ads: 4,
    moving: 0.8,
    bloom: 0,
    bloomMax: 0,
    bloomDecay: 0,
    move: 1,
    adsMove: 0.6,
    adsFov: 64,
    kick: 4,
  },
  precision: {
    id: "precision",
    name: "Fusil de précision",
    blurb: "Une balle à la tête suffit. Il faut viser à la lunette, et bien choisir son coin.",
    auto: false,
    interval: 1.3,
    pellets: 1,
    dmg: [96, 96],
    range: [0, 300],
    head: 2.5,
    legs: 0.75,
    mag: 5,
    reserve: 20,
    reload: 3,
    hip: 8,
    ads: 0,
    moving: 4,
    bloom: 0,
    bloomMax: 0,
    bloomDecay: 0,
    move: 0.9,
    adsMove: 0.45,
    adsFov: 20,
    kick: 3.5,
  },
  pistolet: {
    id: "pistolet",
    name: "Pistolet",
    blurb: "L'arme de secours : on le sort en un instant quand le chargeur est vide.",
    auto: false,
    interval: 0.13,
    pellets: 1,
    dmg: [32, 20],
    range: [12, 32],
    head: 1.8,
    legs: 0.8,
    mag: 12,
    reserve: 48,
    reload: 1.5,
    hip: 1.6,
    ads: 0.5,
    moving: 1,
    bloom: 0.5,
    bloomMax: 2.5,
    bloomDecay: 6,
    move: 1.05,
    adsMove: 0.7,
    adsFov: 62,
    kick: 1.6,
  },
};

export function isPrimaryId(v: unknown): v is PrimaryId {
  return typeof v === "string" && (PRIMARY_IDS as readonly string[]).includes(v);
}

/** Les dégâts d'un plomb à cette distance */
export function damageAt(w: WeaponDef, dist: number): number {
  const [r0, r1] = w.range;
  if (dist <= r0) return w.dmg[0];
  if (dist >= r1) return w.dmg[1];
  const k = (dist - r0) / (r1 - r0);
  return w.dmg[0] + (w.dmg[1] - w.dmg[0]) * k;
}

/** La grenade : lancée, elle rebondit puis éclate */
export const GRENADE = {
  /** Secondes entre le lancer et l'explosion */
  fuse: 2.6,
  speed: 15,
  /** Rayon de l'explosion, et dégâts en son centre */
  radius: 7,
  damage: 115,
  /** Le lanceur souffre moins de sa propre grenade */
  self: 0.5,
  /** Une par vie */
  count: 1,
  /** Le geste du lancer bloque l'arme ce temps-là */
  throwTime: 0.6,
};

/** Le couteau : un coup de près, plus fort dans le dos */
export const KNIFE = { reach: 1.9, damage: 60, back: 110, cone: 0.72, time: 0.65 };

/** Les dégâts d'une grenade à cette distance de son centre */
export function grenadeDamage(dist: number): number {
  if (dist >= GRENADE.radius) return 0;
  const k = 1 - dist / GRENADE.radius;
  return GRENADE.damage * (0.25 + 0.75 * k) * Math.min(1, k * 4);
}
