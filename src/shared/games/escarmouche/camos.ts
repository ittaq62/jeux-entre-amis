// Escarmouche à la boutique : les camouflages des armes. Chacun voit son arme dans le sien, et les autres le voient
// dans les mains de son soldat. Le premier est à tout le monde ; les autres s'achètent avec les points gagnés en jouant.

export type CamoId = "usine" | "foret" | "desert" | "urbain" | "neige" | "nuit" | "tigre" | "braise" | "or";

export interface CamoInfo {
  id: CamoId;
  name: string;
  blurb: string;
  price: number;
  /** Le fond, puis les taches */
  colors: string[];
  /** Taches arrondies, bandes de tigre, ou métal uni */
  pattern: "uni" | "taches" | "bandes" | "pixels";
}

export const CAMOS: CamoInfo[] = [
  {
    id: "usine",
    name: "D'usine",
    blurb: "Le métal bruni, comme à la sortie de l'armurerie.",
    price: 0,
    colors: ["#343639", "#45484d"],
    pattern: "uni",
  },
  {
    id: "foret",
    name: "Forêt",
    blurb: "Vert, brun et noir : pour se fondre dans les sous-bois.",
    price: 100,
    colors: ["#4b5a32", "#2f3a22", "#6b5a3a", "#1d211a"],
    pattern: "taches",
  },
  {
    id: "desert",
    name: "Désert",
    blurb: "Sable et ocre, sous un soleil de plomb.",
    price: 100,
    colors: ["#c8b07e", "#a88d5c", "#e0cfa2", "#8a6f45"],
    pattern: "taches",
  },
  {
    id: "urbain",
    name: "Urbain",
    blurb: "Des gris en petits carrés, pour la ville.",
    price: 200,
    colors: ["#8b9096", "#5d6268", "#b6bbc0", "#3d4146"],
    pattern: "pixels",
  },
  {
    id: "neige",
    name: "Neige",
    blurb: "Blanc cassé et gris clair, pour l'hiver.",
    price: 300,
    colors: ["#e9eef2", "#c3ccd4", "#9aa6b0"],
    pattern: "taches",
  },
  {
    id: "nuit",
    name: "Nuit",
    blurb: "Bleu marine et noir : invisible après le couvre-feu.",
    price: 400,
    colors: ["#1b2333", "#0e131c", "#2c3a52"],
    pattern: "pixels",
  },
  {
    id: "tigre",
    name: "Tigré",
    blurb: "Des bandes orange et noires, pour qui ne craint pas d'être vu.",
    price: 700,
    colors: ["#d9822b", "#1a1410"],
    pattern: "bandes",
  },
  {
    id: "braise",
    name: "Braise",
    blurb: "Noir de suie et rouge vif, comme des braises sous la cendre.",
    price: 1200,
    colors: ["#1c1414", "#c4321e", "#f07a2a"],
    pattern: "bandes",
  },
  {
    id: "or",
    name: "Or massif",
    blurb: "Tout en or, du canon à la crosse.",
    price: 2000,
    colors: ["#e8c25a", "#b58a24", "#fff0a8"],
    pattern: "uni",
  },
];

export const CAMO_BY_ID = new Map(CAMOS.map((c) => [c.id, c]));

export function isCamoId(v: unknown): v is CamoId {
  return typeof v === "string" && CAMO_BY_ID.has(v as CamoId);
}
