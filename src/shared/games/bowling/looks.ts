// Les skins du bowling : la couleur de sa boule (à tout le monde), son motif, la traînée qu'elle laisse, ce qui éclate
// quand on fait un strike, la danse de son personnage, le motif des quilles quand c'est soi qui lance, et la main avec
// laquelle on lance. Les motifs, traînées, effets, danses et quilles qui ne sont pas offerts s'achètent à la boutique.

export interface BallColor {
  id: string;
  name: string;
  /** La couleur de la boule, puis celle de son motif */
  hex: string;
  accent: string;
}

export const BALL_COLORS: BallColor[] = [
  { id: "cerise", name: "Cerise", hex: "#c8263a", accent: "#ffd9c2" },
  { id: "nuit", name: "Bleu nuit", hex: "#1d3c8f", accent: "#7fd3ff" },
  { id: "sapin", name: "Vert sapin", hex: "#1f7a4a", accent: "#d8ff9c" },
  { id: "orange", name: "Orange", hex: "#ee7a1e", accent: "#fff0c8" },
  { id: "violette", name: "Violette", hex: "#6b3cc9", accent: "#ffb8f2" },
  { id: "rose", name: "Rose bonbon", hex: "#ee6aa8", accent: "#ffffff" },
  { id: "noire", name: "Noire", hex: "#1c1c22", accent: "#d9a531" },
  { id: "nacre", name: "Nacrée", hex: "#ece6dc", accent: "#8fb8e8" },
  { id: "soleil", name: "Jaune soleil", hex: "#f2c12e", accent: "#a2341c" },
  { id: "turquoise", name: "Turquoise", hex: "#1fb5b0", accent: "#fff6d6" },
  { id: "bordeaux", name: "Bordeaux", hex: "#6e1630", accent: "#f2b766" },
  { id: "acier", name: "Acier", hex: "#7b8794", accent: "#e8eef4" },
];

export interface ShopThing {
  id: string;
  name: string;
  price: number;
}

/** Le motif de la boule */
export const BALL_PATTERNS: ShopThing[] = [
  { id: "marbre", name: "Marbrée", price: 0 },
  { id: "unie", name: "Unie", price: 0 },
  { id: "nacre", name: "Nacrée", price: 150 },
  { id: "damier", name: "Damier", price: 200 },
  { id: "zebre", name: "Zébrée", price: 250 },
  { id: "billard", name: "Bille de billard", price: 250 },
  { id: "galaxie", name: "Galaxie", price: 300 },
  { id: "flammes", name: "Flammes", price: 300 },
  { id: "pasteque", name: "Pastèque", price: 300 },
  { id: "planete", name: "Planète bleue", price: 350 },
  { id: "cristal", name: "Cristal", price: 450 },
  { id: "disco", name: "Boule à facettes", price: 500 },
  { id: "or", name: "Or massif", price: 600 },
];

/** La traînée de la boule sur la piste */
export const TRAILS: ShopThing[] = [
  { id: "aucune", name: "Aucune", price: 0 },
  { id: "reflet", name: "Reflet", price: 0 },
  { id: "etincelles", name: "Étincelles", price: 200 },
  { id: "bulles", name: "Bulles", price: 200 },
  { id: "notes", name: "Notes de musique", price: 300 },
  { id: "comete", name: "Comète", price: 350 },
  { id: "flammes", name: "Flammes", price: 400 },
  { id: "arcenciel", name: "Arc-en-ciel", price: 500 },
];

/** Ce qui éclate quand on fait un strike */
export const STRIKE_FX: ShopThing[] = [
  { id: "confettis", name: "Confettis", price: 0 },
  { id: "etoiles", name: "Pluie d'étoiles", price: 200 },
  { id: "bulles", name: "Bulles", price: 200 },
  { id: "coeurs", name: "Cœurs", price: 250 },
  { id: "feu", name: "Feu d'artifice", price: 400 },
  { id: "eclairs", name: "Éclairs", price: 400 },
  { id: "pieces", name: "Pluie de pièces", price: 500 },
];

/** La danse de son personnage après un strike ou un spare */
export const DANCES: ShopThing[] = [
  { id: "poing", name: "Le poing serré", price: 0 },
  { id: "bras", name: "Les bras au ciel", price: 0 },
  { id: "reverence", name: "La révérence", price: 200 },
  { id: "pirouette", name: "La pirouette", price: 250 },
  { id: "danse", name: "La petite danse", price: 250 },
  { id: "robot", name: "Le robot", price: 300 },
  { id: "poulet", name: "La danse du poulet", price: 300 },
  { id: "genoux", name: "La glissade à genoux", price: 350 },
  { id: "guitare", name: "La guitare imaginaire", price: 400 },
];

/** Le motif des quilles quand c'est lui qui lance */
export const PIN_SKINS: ShopThing[] = [
  { id: "classiques", name: "Classiques", price: 0 },
  { id: "bois", name: "Bois naturel", price: 200 },
  { id: "pois", name: "À pois", price: 200 },
  { id: "rayees", name: "Sucre d'orge", price: 250 },
  { id: "neon", name: "Néon", price: 350 },
  { id: "cristal", name: "Cristal", price: 450 },
  { id: "dorees", name: "Dorées", price: 500 },
];

/** Le skin d'un joueur */
export interface BowlingLook {
  color: string;
  pattern: string;
  trail: string;
  fx: string;
  dance: string;
  pins: string;
  /** Il lance de la main gauche */
  left: boolean;
}

export const DEFAULT_LOOK: BowlingLook = {
  color: "cerise",
  pattern: "marbre",
  trail: "reflet",
  fx: "confettis",
  dance: "poing",
  pins: "classiques",
  left: false,
};

export const bowlPatternItem = (id: string) => `bowlmotif:${id}`;
export const bowlTrailItem = (id: string) => `bowltrace:${id}`;
export const bowlFxItem = (id: string) => `bowlfx:${id}`;
export const bowlDanceItem = (id: string) => `bowldanse:${id}`;
export const bowlPinsItem = (id: string) => `bowlquilles:${id}`;

/** Chaque catalogue, le champ du skin qu'il remplit, et l'article de boutique de chacun de ses éléments */
export const LOOK_PARTS = [
  { key: "pattern", list: BALL_PATTERNS, item: bowlPatternItem },
  { key: "trail", list: TRAILS, item: bowlTrailItem },
  { key: "fx", list: STRIKE_FX, item: bowlFxItem },
  { key: "dance", list: DANCES, item: bowlDanceItem },
  { key: "pins", list: PIN_SKINS, item: bowlPinsItem },
] as const;

export function colorOf(id: string): BallColor {
  return BALL_COLORS.find((c) => c.id === id) ?? BALL_COLORS[0]!;
}

export function isBowlingLook(v: unknown): v is BowlingLook {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  if (!BALL_COLORS.some((c) => c.id === l.color) || typeof l.left !== "boolean") return false;
  return LOOK_PARTS.every((p) => p.list.some((x) => x.id === l[p.key]));
}

/** Ce que le joueur peut porter : ce qu'il n'a pas redevient ce qu'on a au départ */
export function usableLook(look: BowlingLook, has: (item: string) => boolean): BowlingLook {
  const out: BowlingLook = { ...DEFAULT_LOOK, color: colorOf(look.color).id, left: Boolean(look.left) };
  for (const p of LOOK_PARTS) {
    const thing = p.list.find((x) => x.id === look[p.key]);
    if (thing && (thing.price === 0 || has(p.item(thing.id)))) out[p.key] = thing.id;
  }
  return out;
}

/** Le skin d'un bot : une couleur que personne n'a, un motif offert, une danse ; un sur six est gaucher */
/**
 * La boule de départ d'un joueur qui n'a encore rien choisi : la première couleur libre à la table (tout le monde
 * partait en cerise, et à une table d'amis toutes les boules et toutes les pastilles de la feuille se ressemblaient)
 */
export function freeColor(taken: readonly string[]): string {
  return BALL_COLORS.find((c) => !taken.includes(c.id))?.id ?? DEFAULT_LOOK.color;
}

export function botLook(taken: string[], seed: number): BowlingLook {
  const free = BALL_COLORS.filter((c) => !taken.includes(c.id));
  const list = free.length > 0 ? free : BALL_COLORS;
  const s = Math.abs(seed);
  return {
    ...DEFAULT_LOOK,
    color: list[s % list.length]!.id,
    pattern: s % 3 === 0 ? "unie" : "marbre",
    dance: s % 2 === 0 ? "poing" : "bras",
    left: s % 6 === 5,
  };
}
