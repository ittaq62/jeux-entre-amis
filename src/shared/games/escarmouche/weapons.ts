// Les armes d'Escarmouche : une arme principale et une arme de poing choisies à chaque retour au combat, une grenade
// et le couteau. Des armes génériques, sans marque ni modèle réel : chacune a son rôle, de la portée du fusil de
// précision au corps à corps du fusil à pompe. Quatre armes principales et le pistolet sont à tout le monde ; les
// autres se débloquent à la boutique avec les points. Elles ne sont pas plus fortes : seulement différentes (ce
// qu'elles gagnent d'un côté, elles le perdent de l'autre).

export type WeaponId =
  | "fa"
  | "pm"
  | "pompe"
  | "precision"
  | "pistolet"
  | "carabine"
  | "fm"
  | "mitraillette"
  | "rafale"
  | "double"
  | "revolver"
  | "pa";

export const PRIMARY_IDS = ["fa", "pm", "pompe", "precision", "carabine", "fm", "mitraillette", "rafale", "double"] as const satisfies readonly WeaponId[];
export type PrimaryId = (typeof PRIMARY_IDS)[number];
export const SECONDARY_IDS = ["pistolet", "revolver", "pa"] as const satisfies readonly WeaponId[];
export type SecondaryId = (typeof SECONDARY_IDS)[number];
/** L'ordre compte : c'est le numéro de l'arme dans ce qui voyage (les nouvelles s'ajoutent à la fin) */
export const WEAPON_IDS: WeaponId[] = ["fa", "pm", "pompe", "precision", "pistolet", "carabine", "fm", "mitraillette", "rafale", "double", "revolver", "pa"];

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
  /** Tir par rafales : balles par pression, et le temps entre deux balles d'une rafale */
  burst?: number;
  burstGap?: number;
  /** Son prix à la boutique (0 : à tout le monde) */
  price: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fa: {
    id: "fa",
    price: 0,
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
    price: 0,
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
    price: 0,
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
    price: 0,
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
    price: 0,
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
  carabine: {
    id: "carabine",
    price: 300,
    name: "Carabine de tireur",
    blurb: "Semi-automatique, avec une lunette légère : trois balles au buste. Pour tenir une rue de loin, pas pour les maisons.",
    auto: false,
    interval: 0.22,
    pellets: 1,
    dmg: [45, 38],
    range: [30, 70],
    head: 1.8,
    legs: 0.8,
    mag: 15,
    reserve: 60,
    reload: 2.5,
    hip: 3.2,
    ads: 0.12,
    moving: 2.4,
    bloom: 0.6,
    bloomMax: 2.5,
    bloomDecay: 6,
    move: 0.92,
    adsMove: 0.5,
    adsFov: 36,
    kick: 1.6,
  },
  fm: {
    id: "fm",
    price: 500,
    name: "Fusil-mitrailleur",
    blurb: "Soixante-quinze balles d'affilée pour tenir une position. Lourd : on marche moins vite, et le rechargement dure.",
    auto: true,
    interval: 0.085,
    pellets: 1,
    dmg: [24, 19],
    range: [24, 50],
    head: 1.7,
    legs: 0.8,
    mag: 75,
    reserve: 150,
    reload: 4.4,
    hip: 3.4,
    ads: 0.45,
    moving: 2.6,
    bloom: 0.22,
    bloomMax: 3.4,
    bloomDecay: 6,
    move: 0.84,
    adsMove: 0.42,
    adsFov: 52,
    kick: 0.7,
  },
  mitraillette: {
    id: "mitraillette",
    price: 250,
    name: "Mitraillette",
    blurb: "Courte et vive : la plus rapide pour entrer dans une maison, perdue au-delà de quinze mètres.",
    auto: true,
    interval: 0.058,
    pellets: 1,
    dmg: [18, 9],
    range: [7, 18],
    head: 1.5,
    legs: 0.8,
    mag: 28,
    reserve: 168,
    reload: 1.6,
    hip: 2.2,
    ads: 1.1,
    moving: 0.8,
    bloom: 0.3,
    bloomMax: 3.2,
    bloomDecay: 11,
    move: 1.08,
    adsMove: 0.72,
    adsFov: 66,
    kick: 0.45,
  },
  rafale: {
    id: "rafale",
    price: 400,
    name: "Fusil à rafales",
    blurb: "Trois balles à chaque pression : précis par à-coups, mais il faut rester calme entre deux rafales.",
    auto: false,
    burst: 3,
    burstGap: 0.065,
    interval: 0.34,
    pellets: 1,
    dmg: [31, 24],
    range: [26, 55],
    head: 1.8,
    legs: 0.8,
    mag: 24,
    reserve: 96,
    reload: 2.3,
    hip: 2.6,
    ads: 0.2,
    moving: 2,
    bloom: 0.25,
    bloomMax: 2,
    bloomDecay: 7,
    move: 0.95,
    adsMove: 0.55,
    adsFov: 48,
    kick: 0.9,
  },
  double: {
    id: "double",
    price: 350,
    name: "Fusil à deux coups",
    blurb: "Deux cartouches tirées coup sur coup, une gerbe large : terrible au coin d'une porte, puis il faut recharger.",
    auto: false,
    interval: 0.26,
    pellets: 9,
    dmg: [15, 3],
    range: [6, 16],
    head: 1.3,
    legs: 0.8,
    mag: 2,
    reserve: 24,
    reload: 2.2,
    hip: 6.5,
    ads: 5,
    moving: 0.6,
    bloom: 0,
    bloomMax: 0,
    bloomDecay: 0,
    move: 1.02,
    adsMove: 0.65,
    adsFov: 66,
    kick: 5,
  },
  revolver: {
    id: "revolver",
    price: 250,
    name: "Revolver",
    blurb: "Six balles, lent mais lourd : deux suffisent au buste. Le rechargement, lui, prend son temps.",
    auto: false,
    interval: 0.42,
    pellets: 1,
    dmg: [55, 38],
    range: [15, 35],
    head: 1.7,
    legs: 0.8,
    mag: 6,
    reserve: 30,
    reload: 2.4,
    hip: 1.8,
    ads: 0.35,
    moving: 1.2,
    bloom: 1.2,
    bloomMax: 3,
    bloomDecay: 4,
    move: 1.04,
    adsMove: 0.7,
    adsFov: 58,
    kick: 4,
  },
  pa: {
    id: "pa",
    price: 300,
    name: "Pistolet automatique",
    blurb: "Il vide son chargeur en une seconde et demie : redoutable de près, inutile au loin.",
    auto: true,
    interval: 0.075,
    pellets: 1,
    dmg: [16, 9],
    range: [8, 20],
    head: 1.5,
    legs: 0.8,
    mag: 18,
    reserve: 72,
    reload: 1.7,
    hip: 3,
    ads: 1.4,
    moving: 1,
    bloom: 0.4,
    bloomMax: 3.6,
    bloomDecay: 8,
    move: 1.05,
    adsMove: 0.72,
    adsFov: 64,
    kick: 0.8,
  },
};

export function isPrimaryId(v: unknown): v is PrimaryId {
  return typeof v === "string" && (PRIMARY_IDS as readonly string[]).includes(v);
}

export function isSecondaryId(v: unknown): v is SecondaryId {
  return typeof v === "string" && (SECONDARY_IDS as readonly string[]).includes(v);
}

/** Les armes à tout le monde (celles des bots) */
export const FREE_PRIMARIES = PRIMARY_IDS.filter((id) => WEAPONS[id].price === 0);

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
