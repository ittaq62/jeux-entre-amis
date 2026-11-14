// La garde-robe du personnage : ce qu'on lui ajoute par-dessus son portrait (coiffures, couvre-chefs, lunettes,
// tenues, fonds, cadres, effets). Chaque chose a sa place ; on porte au plus une chose à chaque place. Quelques-unes
// sont offertes, les autres s'achètent à la boutique avec les points gagnés en jouant.
//
// Un personnage qui ne porte rien reste exactement celui d'avant : la garde-robe est un champ en plus (`wear`) de
// l'avatar, absent tant qu'on n'a rien choisi. Ce qui n'est pas (ou plus) au catalogue est oublié sans bruit.

/**
 * Les places. Certaines remplacent une partie du portrait de base quand on y porte quelque chose (coiffure, couvre-chef,
 * yeux, bouche, accessoire) ; les autres s'ajoutent (visage, tenue, fond, cadre, effet).
 */
export type WearSlot = "hair" | "hat" | "eyes" | "mouth" | "extra" | "face" | "outfit" | "bg" | "frame" | "fx";

/** Ce que porte un personnage : à chaque place, l'identifiant d'une chose du catalogue */
export type AvatarWear = Partial<Record<WearSlot, string>>;

export interface WearInfo {
  id: string;
  slot: WearSlot;
  name: string;
  /** Son prix en points (0 : offert à tous) */
  price: number;
}

export const WEAR_SLOTS: WearSlot[] = ["hair", "hat", "eyes", "mouth", "extra", "face", "outfit", "bg", "frame", "fx"];

export const WEAR_SLOT_NAMES: Record<WearSlot, string> = {
  hair: "Coiffure",
  hat: "Couvre-chef",
  eyes: "Yeux",
  mouth: "Bouche",
  extra: "Lunettes et masques",
  face: "Visage",
  outfit: "Tenue",
  bg: "Fond",
  frame: "Cadre",
  fx: "Effet",
};

const w = (slot: WearSlot, id: string, name: string, price: number): WearInfo => ({ id, slot, name, price });

/** Le catalogue, place par place, du moins cher au plus cher */
export const WEAR: WearInfo[] = [
  w("hair", "epis", "Hérisson", 80),
  w("hair", "couettes", "Couettes", 100),
  w("hair", "banane", "Banane", 120),
  w("hair", "tresses", "Tresses", 150),
  w("hair", "afro", "Afro", 180),

  w("hat", "melon", "Chapeau melon", 60),
  w("hat", "chantier", "Casque de chantier", 80),
  w("hat", "toque", "Toque de chef", 100),
  w("hat", "oreilles-chat", "Oreilles de chat", 120),
  w("hat", "helice", "Casquette à hélice", 150),
  w("hat", "couronne-fleurs", "Couronne de fleurs", 180),
  w("hat", "casque-audio", "Casque audio", 200),
  w("hat", "tricorne", "Tricorne", 250),
  w("hat", "sorcier", "Chapeau de sorcier", 300),
  w("hat", "viking", "Casque à cornes", 350),

  w("eyes", "yeux-chat", "Yeux de chat", 80),
  w("eyes", "spirales", "Spirales", 100),
  w("eyes", "yeux-coeur", "Yeux en cœur", 150),

  w("mouth", "bisou", "Bisou", 60),
  w("mouth", "dents", "Toutes dents dehors", 80),
  w("mouth", "crocs", "Petits crocs", 120),

  w("extra", "lunettes-3d", "Lunettes 3D", 80),
  w("extra", "aviateur", "Lunettes d'aviateur", 120),
  w("extra", "lunettes-etoile", "Lunettes étoiles", 150),
  w("extra", "lunettes-coeur", "Lunettes cœur", 150),
  w("extra", "loup", "Loup de bal masqué", 200),
  w("extra", "visiere", "Visière du futur", 300),

  w("face", "nez-rouge", "Nez rouge", 50),
  w("face", "bouc", "Bouc", 60),
  w("face", "moustaches-chat", "Moustaches de chat", 80),
  w("face", "guidon", "Moustache en guidon", 100),
  w("face", "barbe", "Barbe", 120),
  w("face", "bulle", "Bulle de chewing-gum", 150),

  w("outfit", "tshirt", "T-shirt", 0),
  w("outfit", "chemise", "Chemise", 0),
  w("outfit", "mariniere", "Marinière", 100),
  w("outfit", "echarpe", "Grosse écharpe", 120),
  w("outfit", "capuche", "Sweat à capuche", 150),
  w("outfit", "collier-fleurs", "Collier de fleurs", 180),
  w("outfit", "smoking", "Smoking", 250),
  w("outfit", "armure", "Armure", 400),
  w("outfit", "cape", "Cape royale", 500),

  w("bg", "pois", "Pois", 0),
  w("bg", "rayons", "Rayons", 100),
  w("bg", "nuages", "Ciel et nuages", 150),
  w("bg", "couchant", "Coucher de soleil", 200),
  w("bg", "nuit", "Nuit étoilée", 300),
  w("bg", "arc-en-ciel", "Arc-en-ciel", 400),

  w("frame", "lisere", "Liseré blanc", 0),
  w("frame", "cadre-or", "Cadre doré", 250),
  w("frame", "lauriers", "Lauriers", 350),
  w("frame", "cadre-etoiles", "Cadre étoilé", 400),
  w("frame", "neon", "Néon", 600),
  w("frame", "cadre-arc-en-ciel", "Cadre arc-en-ciel", 800),

  w("fx", "notes", "Notes de musique", 300),
  w("fx", "coeurs", "Petits cœurs", 400),
  w("fx", "etincelles", "Étincelles", 500),
  w("fx", "aureole", "Auréole", 700),
  w("fx", "flammes", "Flammes", 900),
];

export const WEAR_BY_ID = new Map(WEAR.map((i) => [i.id, i]));

/** Les places où l'on peut porter quelque chose, avec ce qu'on y trouve */
export const wearOf = (slot: WearSlot): WearInfo[] => WEAR.filter((i) => i.slot === slot);

/**
 * Seulement des choses connues, chacune à sa place ; le reste est oublié sans bruit (une chose retirée du catalogue,
 * une faute de frappe, un vieux client). Rien à porter : `undefined`, pour qu'un personnage sans rien reste tel quel.
 */
export function cleanWear(raw: unknown): AvatarWear | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: AvatarWear = {};
  for (const slot of WEAR_SLOTS) {
    const id = o[slot];
    if (typeof id === "string" && WEAR_BY_ID.get(id)?.slot === slot) out[slot] = id;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Ce qu'il porte, une chose après l'autre */
export function wornItems(wear: AvatarWear | undefined): WearInfo[] {
  const out: WearInfo[] = [];
  for (const slot of WEAR_SLOTS) {
    const info = wear?.[slot] ? WEAR_BY_ID.get(wear[slot]!) : undefined;
    if (info) out.push(info);
  }
  return out;
}
