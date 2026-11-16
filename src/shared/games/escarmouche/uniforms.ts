// Escarmouche à la boutique : les tenues du soldat. Par défaut, chacun se bat dans sa propre tenue, celle de son
// personnage de profil (la couleur de son portrait, sa tête, sa coiffure, son chapeau) ; les tenues militaires se
// débloquent avec les points. La tête reste toujours celle du personnage : on se reconnaît au combat.

export type UniformId = "perso" | "treillis" | "sable" | "ville" | "neige" | "nuit" | "feuillu" | "parade";

export interface UniformInfo {
  id: UniformId;
  name: string;
  blurb: string;
  price: number;
  /** La veste, le pantalon, le gilet, les bottes ; null : la couleur du personnage */
  coat: string | null;
  trousers: string;
  vest: string | null;
  boots: string;
  /** Le casque (null : la tête nue, avec la coiffure et le chapeau du personnage) */
  helmet: string | null;
  /** Le motif de la veste et du pantalon */
  pattern: "uni" | "taches" | "pixels" | "feuillu";
  /** Les taches du motif */
  spots: string[];
  /** Une touche de couleur (galons, boutons) */
  accent: string | null;
}

export const UNIFORMS: UniformInfo[] = [
  {
    id: "perso",
    name: "Ma tenue",
    blurb: "Les couleurs de ton personnage de profil, tête nue : tout le monde te reconnaît.",
    price: 0,
    coat: null,
    trousers: "#3b3f46",
    vest: null,
    boots: "#2a2420",
    helmet: null,
    pattern: "uni",
    spots: [],
    accent: null,
  },
  {
    id: "treillis",
    name: "Treillis",
    blurb: "Le treillis vert olive, le gilet et le casque : la tenue de base du terrain.",
    price: 0,
    coat: "#5d6343",
    trousers: "#535a3c",
    vest: "#3d4130",
    boots: "#2a2420",
    helmet: "#4f5537",
    pattern: "taches",
    spots: ["#454a32", "#6e6a4a", "#2f3326"],
    accent: null,
  },
  {
    id: "sable",
    name: "Sable",
    blurb: "Des tons de sable et d'ocre, pour les pierres chaudes du hameau.",
    price: 150,
    coat: "#b69a6a",
    trousers: "#a68b5c",
    vest: "#7d6844",
    boots: "#5a4630",
    helmet: "#a88f60",
    pattern: "taches",
    spots: ["#8f7449", "#cdb88a", "#6f5a3a"],
    accent: null,
  },
  {
    id: "ville",
    name: "Ville",
    blurb: "Des gris en petits carrés : le béton de la gare, les quais, les hangars.",
    price: 200,
    coat: "#7d8288",
    trousers: "#666b71",
    vest: "#3b3f45",
    boots: "#202226",
    helmet: "#5c6167",
    pattern: "pixels",
    spots: ["#55595e", "#a2a7ac", "#3d4146"],
    accent: null,
  },
  {
    id: "neige",
    name: "Neige",
    blurb: "Blanc cassé et gris clair : on ne se cache pas mieux sur un mur de chaux.",
    price: 250,
    coat: "#e2e6e8",
    trousers: "#c9cfd3",
    vest: "#9ea6ac",
    boots: "#4a4e52",
    helmet: "#d5dadd",
    pattern: "taches",
    spots: ["#b8c0c6", "#f4f6f7", "#9aa4ab"],
    accent: null,
  },
  {
    id: "nuit",
    name: "Commando de nuit",
    blurb: "Noir et bleu nuit, le visage dégagé : on l'entend avant de le voir. Et encore.",
    price: 400,
    coat: "#22262e",
    trousers: "#1a1d23",
    vest: "#111317",
    boots: "#0d0e10",
    helmet: null,
    pattern: "pixels",
    spots: ["#2c3340", "#181b20", "#343c4a"],
    accent: "#3d5a80",
  },
  {
    id: "feuillu",
    name: "Tenue feuillue",
    blurb: "Couverte de feuillage : un buisson qui marche, et qui tire.",
    price: 800,
    coat: "#4a5a30",
    trousers: "#3f4d28",
    vest: "#36421f",
    boots: "#2a2420",
    helmet: null,
    pattern: "feuillu",
    spots: ["#5f7238", "#2f3a1c", "#7a7a3a"],
    accent: null,
  },
  {
    id: "parade",
    name: "Grand uniforme",
    blurb: "La veste bleu nuit, les boutons dorés et les épaulettes : pour gagner avec élégance.",
    price: 1200,
    coat: "#1f2a4a",
    trousers: "#1a2238",
    vest: null,
    boots: "#0e0e10",
    helmet: null,
    pattern: "uni",
    spots: [],
    accent: "#e2b84a",
  },
];

export const UNIFORM_BY_ID = new Map(UNIFORMS.map((u) => [u.id, u]));

export function isUniformId(v: unknown): v is UniformId {
  return typeof v === "string" && UNIFORM_BY_ID.has(v as UniformId);
}
