// Ce que porte son chef à Toque ! : son tablier, sa toque, et son couteau (on le voit quand il coupe). Ce qui n'est pas
// offert s'achète à la boutique.

export interface ShopThing {
  id: string;
  name: string;
  price: number;
}

/** Le tablier : sa toile, ses rayures ou son motif */
export const APRONS: ShopThing[] = [
  { id: "blanc", name: "Blanc de cuisine", price: 0 },
  { id: "bistrot", name: "Rayé bistrot", price: 0 },
  { id: "vichy", name: "Vichy rouge", price: 150 },
  { id: "mariniere", name: "Marinière", price: 150 },
  { id: "jean", name: "Toile de jean", price: 200 },
  { id: "noir", name: "Noir de brasserie", price: 200 },
  { id: "fleuri", name: "Fleuri de grand-mère", price: 250 },
  { id: "provence", name: "Provençal", price: 250 },
  { id: "tricolore", name: "Tricolore", price: 300 },
  { id: "cuir", name: "Cuir de boucher", price: 350 },
  { id: "dore", name: "Fil d'or", price: 500 },
];

/** La toque : plus ou moins haute, plissée, ou bien autre chose sur la tête */
export const TOQUES: ShopThing[] = [
  { id: "classique", name: "Toque classique", price: 0 },
  { id: "courte", name: "Toque courte", price: 0 },
  { id: "haute", name: "Grande toque de chef", price: 150 },
  { id: "calot", name: "Calot de commis", price: 150 },
  { id: "bandana", name: "Bandana", price: 200 },
  { id: "beret", name: "Béret", price: 200 },
  { id: "rayee", name: "Toque rayée", price: 250 },
  { id: "noire", name: "Toque noire", price: 300 },
  { id: "pompon", name: "Bonnet à pompon", price: 300 },
  { id: "doree", name: "Toque dorée", price: 500 },
];

/** Le couteau (et la planche qui va avec) */
export const KNIVES: ShopThing[] = [
  { id: "office", name: "Couteau d'office", price: 0 },
  { id: "chef", name: "Couteau de chef", price: 150 },
  { id: "hachoir", name: "Hachoir", price: 200 },
  { id: "ceramique", name: "Lame en céramique", price: 250 },
  { id: "damas", name: "Acier de Damas", price: 350 },
  { id: "bois", name: "Manche en olivier", price: 250 },
  { id: "or", name: "Couteau en or", price: 500 },
];

/** La couleur de fond de chaque tablier (le dessin de son motif vient par-dessus) */
export const APRON_COLORS: Record<string, string> = {
  blanc: "#f4f1ea",
  bistrot: "#24344f",
  vichy: "#d23b3b",
  mariniere: "#2b4c8c",
  jean: "#3f5f8a",
  noir: "#1d1d22",
  fleuri: "#f0d9e4",
  provence: "#f2c84b",
  tricolore: "#f4f1ea",
  cuir: "#7a4a2a",
  dore: "#d8b04a",
};

export interface ToqueLook {
  apron: string;
  toque: string;
  knife: string;
}

export const DEFAULT_LOOK: ToqueLook = { apron: "blanc", toque: "classique", knife: "office" };

export const tqApronItem = (id: string) => `tqtablier:${id}`;
export const tqToqueItem = (id: string) => `tqtoque:${id}`;
export const tqKnifeItem = (id: string) => `tqcouteau:${id}`;

/** Chaque catalogue, le champ du skin qu'il remplit, et l'article de boutique de chacun de ses éléments */
export const LOOK_PARTS = [
  { key: "apron", list: APRONS, item: tqApronItem },
  { key: "toque", list: TOQUES, item: tqToqueItem },
  { key: "knife", list: KNIVES, item: tqKnifeItem },
] as const;

export function isToqueLook(v: unknown): v is ToqueLook {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return LOOK_PARTS.every((p) => p.list.some((x) => x.id === l[p.key]));
}

/** Ce que le joueur peut porter : ce qu'il n'a pas redevient ce qu'on a au départ */
export function usableLook(look: ToqueLook, has: (item: string) => boolean): ToqueLook {
  const out: ToqueLook = { ...DEFAULT_LOOK };
  for (const p of LOOK_PARTS) {
    const thing = p.list.find((x) => x.id === look[p.key]);
    if (thing && (thing.price === 0 || has(p.item(thing.id)))) out[p.key] = thing.id;
  }
  return out;
}

/** Le skin d'un commis : le tablier rayé ou le blanc, la toque courte */
export function botLook(seed: number): ToqueLook {
  return { apron: Math.abs(seed) % 2 === 0 ? "bistrot" : "blanc", toque: "courte", knife: "office" };
}
