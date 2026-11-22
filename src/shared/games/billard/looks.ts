// Les skins du billard : la queue de chacun (on la voit quand c'est lui qui joue), l'effet qui éclate sur ses beaux coups,
// et, pour la table qu'il ouvre, la couleur du tapis et le jeu de billes. Ce qui n'est pas offert s'achète à la boutique.

export interface ShopThing {
  id: string;
  name: string;
  price: number;
}

/** La queue : le bois du fût, les filets, la poignée */
export const CUES: ShopThing[] = [
  { id: "erable", name: "Érable clair", price: 0 },
  { id: "noyer", name: "Noyer", price: 0 },
  { id: "ebene", name: "Ébène et ivoire", price: 150 },
  { id: "rouge", name: "Laquée rouge", price: 200 },
  { id: "nuit", name: "Bleu nuit", price: 200 },
  { id: "marqueterie", name: "Marqueterie", price: 250 },
  { id: "carbone", name: "Carbone", price: 300 },
  { id: "neon", name: "Néon", price: 350 },
  { id: "or", name: "Filets d'or", price: 450 },
  { id: "cristal", name: "Cristal", price: 500 },
];

/** Le tapis de la table qu'on ouvre */
export const CLOTHS: ShopThing[] = [
  { id: "vert", name: "Vert billard", price: 0 },
  { id: "bleu", name: "Bleu tournoi", price: 0 },
  { id: "bordeaux", name: "Bordeaux", price: 150 },
  { id: "gris", name: "Gris ardoise", price: 150 },
  { id: "violet", name: "Violet", price: 200 },
  { id: "camel", name: "Camel", price: 200 },
  { id: "noir", name: "Noir", price: 250 },
  { id: "rose", name: "Rose", price: 250 },
  { id: "turquoise", name: "Turquoise", price: 250 },
];

/** Le jeu de billes de la table qu'on ouvre */
export const BALL_SETS: ShopThing[] = [
  { id: "classiques", name: "Classiques", price: 0 },
  { id: "pastel", name: "Pastel", price: 200 },
  { id: "bois", name: "En bois", price: 250 },
  { id: "marbre", name: "Marbre", price: 300 },
  { id: "neon", name: "Néon", price: 350 },
  { id: "metal", name: "Métal", price: 400 },
  { id: "planetes", name: "Planètes", price: 500 },
];

/** Ce qui éclate sur un beau coup (la noire de la victoire, une série, un trois bandes) */
export const SHOT_FX: ShopThing[] = [
  { id: "confettis", name: "Confettis", price: 0 },
  { id: "etoiles", name: "Pluie d'étoiles", price: 200 },
  { id: "coeurs", name: "Cœurs", price: 250 },
  { id: "bulles", name: "Bulles", price: 200 },
  { id: "feu", name: "Feu d'artifice", price: 400 },
  { id: "eclairs", name: "Éclairs", price: 400 },
  { id: "pieces", name: "Pluie de pièces", price: 500 },
];

export interface BillardLook {
  cue: string;
  cloth: string;
  set: string;
  fx: string;
}

export const DEFAULT_LOOK: BillardLook = { cue: "erable", cloth: "vert", set: "classiques", fx: "confettis" };

export const bilCueItem = (id: string) => `bilqueue:${id}`;
export const bilClothItem = (id: string) => `biltapis:${id}`;
export const bilSetItem = (id: string) => `bilbilles:${id}`;
export const bilFxItem = (id: string) => `bileffet:${id}`;

/** Chaque catalogue, le champ du skin qu'il remplit, et l'article de boutique de chacun de ses éléments */
export const LOOK_PARTS = [
  { key: "cue", list: CUES, item: bilCueItem },
  { key: "cloth", list: CLOTHS, item: bilClothItem },
  { key: "set", list: BALL_SETS, item: bilSetItem },
  { key: "fx", list: SHOT_FX, item: bilFxItem },
] as const;

/** Les couleurs des tapis (le drap, puis son ombre) */
export const CLOTH_COLORS: Record<string, [string, string]> = {
  vert: ["#1f7a4c", "#0f4a2c"],
  bleu: ["#1f5f9e", "#103a66"],
  bordeaux: ["#7a1f33", "#4a0f1d"],
  gris: ["#5b6670", "#363e45"],
  violet: ["#5a2f8a", "#341a54"],
  camel: ["#b3874f", "#7a5a30"],
  noir: ["#26292d", "#121416"],
  rose: ["#c75b8c", "#82345a"],
  turquoise: ["#1f8f8a", "#0f5552"],
};

export function isBillardLook(v: unknown): v is BillardLook {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return LOOK_PARTS.every((p) => p.list.some((x) => x.id === l[p.key]));
}

/** Ce que le joueur peut porter : ce qu'il n'a pas redevient ce qu'on a au départ */
export function usableLook(look: BillardLook, has: (item: string) => boolean): BillardLook {
  const out: BillardLook = { ...DEFAULT_LOOK };
  for (const p of LOOK_PARTS) {
    const thing = p.list.find((x) => x.id === look[p.key]);
    if (thing && (thing.price === 0 || has(p.item(thing.id)))) out[p.key] = thing.id;
  }
  return out;
}

/** Le skin d'un bot : une des queues offertes */
export function botLook(seed: number): BillardLook {
  return { ...DEFAULT_LOOK, cue: Math.abs(seed) % 2 === 0 ? "erable" : "noyer" };
}
