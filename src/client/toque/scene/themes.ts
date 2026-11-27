// Le style de chaque cuisine : le sol, les murs, les plans de travail, la lumière, ce qu'il y a autour (la mer, le ciel,
// la neige), le halo. Le décor propre à chacune (les fenêtres, les lampions, le mât…) est dans decor.ts.

import type { KitchenId } from "../../../shared/games/toque/kitchens.ts";
import type { FloorStyle, TopStyle, WallStyle } from "./textures.ts";

export interface Theme {
  floor: FloorStyle;
  wall: WallStyle | null;
  top: TopStyle;
  /** La couleur du corps des plans de travail */
  body: string;
  /** Le fond, et le brouillard (couleur, début, fin) */
  sky: string;
  fog: [string, number, number] | null;
  /** La lumière du ciel (haut, bas, force) et celle qui fait les ombres (couleur, force, direction) */
  hemi: [string, string, number];
  sun: [string, number, [number, number, number]];
  /** Ce qu'il y a dans le vide et autour : l'eau, le vide des toits, rien (des murs partout) */
  around: "eau" | "toits" | "neige" | "nuit" | "murs";
  /** Le halo : force, rayon, seuil */
  bloom: [number, number, number];
  /** L'étalonnage : chaleur, saturation, vignette */
  grade: [number, number, number];
}

export const THEMES: Record<KitchenId, Theme> = {
  bistrot: {
    floor: "damier",
    wall: "faience",
    top: "zinc",
    body: "#7a4a2c",
    sky: "#2a1a14",
    fog: null,
    hemi: ["#fff1d8", "#5a3a2a", 0.9],
    sun: ["#ffe2b8", 2.2, [-3, 9, 5]],
    around: "murs",
    bloom: [0.45, 0.4, 0.92],
    grade: [0.05, 1.08, 0.32],
  },
  creperie: {
    floor: "pont",
    wall: null,
    top: "bois",
    body: "#2f5a7a",
    sky: "#8fc8e8",
    fog: ["#a8d4ec", 22, 70],
    hemi: ["#e8f6ff", "#6a5a48", 1.15],
    sun: ["#fff4dc", 2.6, [-5, 10, 6]],
    around: "eau",
    bloom: [0.3, 0.4, 0.95],
    grade: [0.02, 1.1, 0.25],
  },
  cantine: {
    floor: "lino",
    wall: "cantine",
    top: "inox",
    body: "#6f9a6a",
    sky: "#cfe6f2",
    fog: null,
    hemi: ["#fffbea", "#7a7058", 1.1],
    sun: ["#fff6e0", 2.3, [4, 10, 5]],
    around: "murs",
    bloom: [0.3, 0.4, 0.95],
    grade: [0.03, 1.06, 0.28],
  },
  pizzeria: {
    floor: "tuiles",
    wall: null,
    top: "marbre",
    body: "#c86a3a",
    sky: "#f2a874",
    fog: ["#f0b48a", 26, 80],
    hemi: ["#ffe6c8", "#6a3a2a", 1.05],
    sun: ["#ffd29a", 2.7, [-7, 8, 4]],
    around: "toits",
    bloom: [0.5, 0.45, 0.9],
    grade: [0.07, 1.12, 0.3],
  },
  brasserie: {
    floor: "pave",
    wall: "pierre",
    top: "bois",
    body: "#5a3a2a",
    sky: "#a8c4d8",
    fog: null,
    hemi: ["#fff0dc", "#5a4a3a", 1.0],
    sun: ["#fff0d0", 2.4, [-4, 10, 5]],
    around: "murs",
    bloom: [0.35, 0.4, 0.93],
    grade: [0.04, 1.08, 0.3],
  },
  chalet: {
    floor: "planches",
    wall: "rondins",
    top: "bois",
    body: "#6a4426",
    sky: "#6a86b0",
    fog: ["#b8cce4", 18, 60],
    hemi: ["#dfeaff", "#5a4a40", 0.95],
    sun: ["#ffe8c8", 2.2, [5, 9, 6]],
    around: "neige",
    bloom: [0.55, 0.45, 0.9],
    grade: [0.0, 1.05, 0.32],
  },
  train: {
    floor: "moquette",
    wall: "wagon",
    top: "marbre",
    body: "#4a2418",
    sky: "#0d1428",
    fog: ["#141c34", 20, 60],
    hemi: ["#ffe6c0", "#2a2030", 0.8],
    sun: ["#ffd8a0", 2.0, [-2, 10, 5]],
    around: "nuit",
    bloom: [0.6, 0.45, 0.85],
    grade: [0.06, 1.1, 0.38],
  },
  guinguette: {
    floor: "ponton",
    wall: null,
    top: "bois",
    body: "#3a6a5a",
    sky: "#f6c88a",
    fog: ["#f2d0a0", 24, 75],
    hemi: ["#fff0d8", "#4a5a48", 1.05],
    sun: ["#ffd8a0", 2.5, [-6, 7, 5]],
    around: "eau",
    bloom: [0.55, 0.45, 0.88],
    grade: [0.06, 1.12, 0.3],
  },
  banquet: {
    floor: "parquet",
    wall: "salle",
    top: "bois",
    body: "#8a3a3a",
    sky: "#2a1a24",
    fog: null,
    hemi: ["#fff0dc", "#5a3a3a", 0.95],
    sun: ["#ffe0b0", 2.3, [-3, 10, 5]],
    around: "murs",
    bloom: [0.55, 0.45, 0.88],
    grade: [0.06, 1.1, 0.32],
  },
};
