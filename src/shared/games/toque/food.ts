// Les aliments de Toque ! : ce qui sort des caisses, ce qu'ils deviennent une fois coupés, cuits à la poêle, frits,
// mijotés dans la marmite ou passés au four, et les plats que demandent les commandes. Tout est donné ici une fois pour
// toutes : le serveur, les bots et l'écran lisent les mêmes tables.

/** Ce qui sort des caisses (et la boulangerie : le pain, le sucre) */
export type RawFood =
  | "tomate"
  | "laitue"
  | "oignon"
  | "champi"
  | "patate"
  | "fromage"
  | "jambon"
  | "steak"
  | "saucisse"
  | "poisson"
  | "pateCrepe"
  | "patePizza"
  | "pateTarte"
  | "pain"
  | "sucre"
  | "moules"
  | "pomme";

/** Tout ce qui se tient à la main ou se pose sur une assiette, à chaque étape */
export type FoodId =
  | RawFood
  | "tomate_c"
  | "laitue_c"
  | "oignon_c"
  | "champi_c"
  | "patate_c"
  | "fromage_c"
  | "jambon_c"
  | "poisson_c"
  | "pomme_c"
  | "steak_k"
  | "saucisse_k"
  | "crepe"
  | "frites"
  | "poisson_f"
  | "charbon";

/** Ce que donne une marmite de trois fois la même chose, une fois cuite */
export type PotDish = "soupe_tomate" | "soupe_oignon" | "soupe_champi" | "puree" | "fondue" | "moules_k";

/** Les fonds qu'on garnit puis qu'on passe au four */
export type BaseKind = "pizza" | "croque" | "tarte";

/** Le nom de chaque chose, pour les écrans (« une tomate coupée ») */
export const FOOD_NAMES: Record<FoodId | PotDish | BaseKind, string> = {
  tomate: "tomate",
  laitue: "laitue",
  oignon: "oignon",
  champi: "champignon",
  patate: "pomme de terre",
  fromage: "fromage",
  jambon: "jambon",
  steak: "steak",
  saucisse: "saucisse",
  poisson: "poisson",
  pateCrepe: "pâte à crêpe",
  patePizza: "pâte à pizza",
  pateTarte: "pâte à tarte",
  pain: "pain",
  sucre: "sucre",
  moules: "moules",
  pomme: "pomme",
  tomate_c: "tomate coupée",
  laitue_c: "laitue coupée",
  oignon_c: "oignon émincé",
  champi_c: "champignons émincés",
  patate_c: "pommes de terre en bâtonnets",
  fromage_c: "fromage râpé",
  jambon_c: "jambon coupé",
  poisson_c: "filet de poisson",
  pomme_c: "pommes en lamelles",
  steak_k: "steak cuit",
  saucisse_k: "saucisse grillée",
  crepe: "crêpe",
  frites: "frites",
  poisson_f: "poisson frit",
  charbon: "quelque chose de brûlé",
  soupe_tomate: "soupe de tomates",
  soupe_oignon: "soupe à l'oignon",
  soupe_champi: "velouté de champignons",
  puree: "purée",
  fondue: "fondue",
  moules_k: "moules marinière",
  pizza: "pizza",
  croque: "croque",
  tarte: "tarte",
};

// ---------------------------------------------------------------------------
// Ce que fait chaque poste
// ---------------------------------------------------------------------------

/** La planche : ce qu'on coupe (ou qu'on étale), ce que ça devient, et combien de secondes de couteau */
export const CHOP: Partial<Record<FoodId, { to: FoodId | BaseKind; base?: true; s: number }>> = {
  tomate: { to: "tomate_c", s: 1.4 },
  laitue: { to: "laitue_c", s: 1.4 },
  oignon: { to: "oignon_c", s: 1.5 },
  champi: { to: "champi_c", s: 1.3 },
  patate: { to: "patate_c", s: 1.8 },
  fromage: { to: "fromage_c", s: 1.2 },
  jambon: { to: "jambon_c", s: 1.2 },
  poisson: { to: "poisson_c", s: 1.8 },
  pomme: { to: "pomme_c", s: 1.4 },
  patePizza: { to: "pizza", base: true, s: 2 },
  pateTarte: { to: "tarte", base: true, s: 2 },
};

/** La marmite : ce qu'elle accepte, et ce que donnent trois fois la même chose */
export const POT: Partial<Record<FoodId, PotDish>> = {
  tomate_c: "soupe_tomate",
  oignon_c: "soupe_oignon",
  champi_c: "soupe_champi",
  patate_c: "puree",
  fromage_c: "fondue",
  moules: "moules_k",
};
/** Il en faut trois dans la marmite */
export const POT_FULL = 3;
/** Secondes de cuisson par ingrédient dans la marmite, puis le temps qu'elle tient avant de brûler */
export const POT_S = 3.6;
export const POT_BURN_S = 9;

/** La poêle : un seul aliment à la fois */
export const PAN: Partial<Record<FoodId, { to: FoodId; s: number }>> = {
  steak: { to: "steak_k", s: 6 },
  saucisse: { to: "saucisse_k", s: 5.5 },
  pateCrepe: { to: "crepe", s: 4.5 },
};
export const PAN_BURN_S = 7;

/** La friteuse : un seul aliment à la fois */
export const FRY: Partial<Record<FoodId, { to: FoodId; s: number }>> = {
  patate_c: { to: "frites", s: 6 },
  poisson_c: { to: "poisson_f", s: 6 },
};
export const FRY_BURN_S = 7;

/** Le four : les fonds garnis, le temps de cuisson, puis le temps avant de brûler */
export const OVEN: Record<BaseKind, { s: number }> = {
  pizza: { s: 8 },
  croque: { s: 6 },
  tarte: { s: 9 },
};
export const OVEN_BURN_S = 8;

/** Ce qui se pose sur chaque fond, une fois chacun */
export const TOPPINGS: Record<BaseKind, FoodId[]> = {
  pizza: ["tomate_c", "fromage_c", "champi_c", "jambon_c"],
  croque: ["jambon_c", "fromage_c"],
  tarte: ["pomme_c", "sucre"],
};

/** Laver une assiette, en secondes */
export const WASH_S = 2;

/** On ne lance que ce qui tient dans la main : un ingrédient, cru ou coupé (pas ce qui est cuit, pas un plat) */
export function throwable(f: FoodId): boolean {
  return f !== "charbon" && !(f in PAN_RESULT) && !(f in FRY_RESULT);
}
const PAN_RESULT: Partial<Record<FoodId, true>> = Object.fromEntries(Object.values(PAN).map((v) => [v!.to, true]));
const FRY_RESULT: Partial<Record<FoodId, true>> = Object.fromEntries(Object.values(FRY).map((v) => [v!.to, true]));

// ---------------------------------------------------------------------------
// Les plats
// ---------------------------------------------------------------------------

/** Ce qui se pose sur une assiette : un aliment, un plat de la marmite, ou un fond cuit (« pizza:fromage_c+tomate_c ») */
export type Part = string;

/** Le nom d'un fond cuit avec sa garniture, toujours dans le même ordre */
export function bakedPart(base: BaseKind, toppings: readonly string[]): Part {
  return `${base}:${[...toppings].sort().join("+")}`;
}

/** Ce qu'il y a dans un morceau d'assiette : son fond et sa garniture, ou rien de tel */
export function splitBaked(part: Part): { base: BaseKind; toppings: FoodId[] } | null {
  const i = part.indexOf(":");
  if (i < 0) return null;
  const base = part.slice(0, i) as BaseKind;
  if (!(base in OVEN)) return null;
  const rest = part.slice(i + 1);
  return { base, toppings: rest ? (rest.split("+") as FoodId[]) : [] };
}

export type RecipeId =
  | "salade"
  | "soupeOignon"
  | "soupeTomate"
  | "veloute"
  | "crepeSucre"
  | "crepeComplete"
  | "pureeSaucisse"
  | "margherita"
  | "pizzaChampi"
  | "steakFrites"
  | "croque"
  | "fondue"
  | "poissonFrites"
  | "moulesFrites"
  | "tarte";

export interface Recipe {
  name: string;
  /** Ce qu'il faut sur l'assiette, dans n'importe quel ordre */
  parts: Part[];
  /** Ce que rapporte le plat servi (le pourboire en plus) */
  value: number;
  /** Le temps laissé pour servir la commande, en secondes */
  time: number;
}

export const RECIPES: Record<RecipeId, Recipe> = {
  salade: { name: "Salade", parts: ["laitue_c", "tomate_c"], value: 20, time: 75 },
  soupeOignon: { name: "Soupe à l'oignon", parts: ["soupe_oignon"], value: 30, time: 95 },
  soupeTomate: { name: "Soupe de tomates", parts: ["soupe_tomate"], value: 30, time: 95 },
  veloute: { name: "Velouté de champignons", parts: ["soupe_champi"], value: 30, time: 95 },
  crepeSucre: { name: "Crêpe au sucre", parts: ["crepe", "sucre"], value: 24, time: 75 },
  crepeComplete: { name: "Crêpe complète", parts: ["crepe", "jambon_c", "fromage_c"], value: 40, time: 95 },
  pureeSaucisse: { name: "Saucisse-purée", parts: ["puree", "saucisse_k"], value: 44, time: 110 },
  margherita: { name: "Pizza margherita", parts: [bakedPart("pizza", ["tomate_c", "fromage_c"])], value: 40, time: 105 },
  pizzaChampi: {
    name: "Pizza aux champignons",
    parts: [bakedPart("pizza", ["tomate_c", "fromage_c", "champi_c"])],
    value: 50,
    time: 115,
  },
  steakFrites: { name: "Steak-frites", parts: ["steak_k", "frites"], value: 40, time: 100 },
  croque: { name: "Croque-monsieur", parts: [bakedPart("croque", ["jambon_c", "fromage_c"])], value: 36, time: 95 },
  fondue: { name: "Fondue", parts: ["fondue", "pain"], value: 40, time: 105 },
  poissonFrites: { name: "Poisson-frites", parts: ["poisson_f", "frites"], value: 44, time: 105 },
  moulesFrites: { name: "Moules-frites", parts: ["moules_k", "frites"], value: 46, time: 110 },
  tarte: { name: "Tarte aux pommes", parts: [bakedPart("tarte", ["pomme_c", "sucre"])], value: 40, time: 110 },
};

export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];
export const isRecipeId = (v: unknown): v is RecipeId => typeof v === "string" && v in RECIPES;

/** Ce qui manque dans `have` pour arriver à `want` (des listes, chaque élément compté) ; null si `have` déborde */
export function missingParts(want: readonly Part[], have: readonly Part[]): Part[] | null {
  const left = [...want];
  for (const h of have) {
    const i = left.indexOf(h);
    if (i < 0) return null;
    left.splice(i, 1);
  }
  return left;
}

/** Ces morceaux font exactement ce plat */
export function sameParts(a: readonly Part[], b: readonly Part[]): boolean {
  const m = missingParts(a, b);
  return m !== null && m.length === 0;
}

/** Une assiette garnie ainsi reste en chemin vers au moins un plat du menu */
export function onTheWay(parts: readonly Part[], menu: readonly RecipeId[]): boolean {
  return menu.some((r) => missingParts(RECIPES[r].parts, parts) !== null);
}

/** Le plat que fait exactement cette assiette, parmi ceux du menu */
export function dishOf(parts: readonly Part[], menu: readonly RecipeId[]): RecipeId | null {
  return menu.find((r) => sameParts(RECIPES[r].parts, parts)) ?? null;
}

/** La marmite : trois fois la même chose donne ce plat (sinon rien qui se serve) */
export function potDish(contents: readonly string[]): PotDish | null {
  if (contents.length !== POT_FULL) return null;
  const first = contents[0] as FoodId;
  if (!contents.every((c) => c === first)) return null;
  return POT[first] ?? null;
}
