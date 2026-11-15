import * as THREE from "three";
import { SQUARES } from "../../../shared/games/capitale/board.ts";
import { bake, box, cyl, facadeBox, gableRoof, hipRoof, mansardRoof, mat, shadowed } from "./buildings.ts";
import { mix, type FacadeLook } from "./textures.ts";

// Les maisons et les immeubles de chaque ville, du niveau 1 au niveau 4 : la pierre, le toit, les fenêtres de la ville.
// Repère local : le sol au centre de l'emprise, la façade vers +z. Une maison tient dans 0,34 × 0,28 ; un immeuble dans
// 0,42 × 0,36 (avant la mise à l'échelle de la parcelle).

const STOREY = 0.17;

/**
 * Le toit : à deux pans (faîtage le long de la rue), très pentu, à quatre pans, mansardé, en terrasse ; pignon sur rue
 * (le faîtage perpendiculaire à la rue) ou pignon à gradins des Flandres
 */
type Roof = "gable" | "steep" | "hip" | "mansard" | "flat" | "front" | "stepped";

interface CityLook {
  /** La façade des maisons */
  look: FacadeLook;
  roof: string;
  roofKind: Roof;
  /** Les immeubles, s'ils diffèrent des maisons */
  tall?: FacadeLook;
  tallRoof?: Roof;
  tallRoofColor?: string;
  /** Des lucarnes dans le toit, des cheminées */
  dormers?: boolean;
  chimneys?: boolean;
  /** Le rez-de-chaussée des immeubles : des arcades (Toulouse, Montpellier) ou des boutiques (les grandes villes) */
  arcades?: boolean;
  shops?: boolean;
}

const SLATE = "#4f5862";
const DARK_SLATE = "#3b424a";
const ZINC = "#8a96a2";
const TILE = "#b5583a";
const ROUND_TILE = "#c8683f";
const BROWN_TILE = "#8a4a31";
const LAUZE = "#5d6066";

export const CITY_LOOKS: Record<number, CityLook> = {
  // Guéret : granit gris-beige, ardoise
  1: {
    look: { wall: "#cfc5b2", shutters: "#5a6e5a", narrow: true, ashlar: true },
    roof: SLATE,
    roofKind: "steep",
    chimneys: true,
  },
  // Aurillac : la pierre volcanique, les lauzes
  3: {
    look: { wall: "#9c9890", shutters: "#7b2f2a", narrow: true, ashlar: true, frame: "#e9e4da" },
    roof: LAUZE,
    roofKind: "steep",
    chimneys: true,
    dormers: true,
  },
  // Mende : pierre claire de Lozère, lauzes
  6: {
    look: { wall: "#d8cfbd", shutters: "#3f5f78", narrow: true, ashlar: true },
    roof: LAUZE,
    roofKind: "hip",
    chimneys: true,
  },
  // Vesoul : enduit ocre clair et tuiles brunes de Haute-Saône
  8: {
    look: { wall: "#ecd9b4", shutters: "#7a3b2a", frame: "#fbf5e8" },
    roof: BROWN_TILE,
    roofKind: "hip",
    chimneys: true,
  },
  // Foix : la pierre des Pyrénées, l'ardoise
  9: {
    look: { wall: "#bdb4a3", shutters: "#4e6a4a", narrow: true, ashlar: true },
    roof: DARK_SLATE,
    roofKind: "steep",
    chimneys: true,
  },
  // Périgueux : la pierre blonde du Périgord, les toits très pentus de tuiles brunes
  11: {
    look: { wall: "#e7cf9c", shutters: "#7a8a6a", narrow: true, ashlar: true, frame: "#f7eedb" },
    roof: BROWN_TILE,
    roofKind: "steep",
    chimneys: true,
    dormers: true,
  },
  // Auxerre : les maisons à pans de bois, enduits pastel
  13: {
    look: { wall: "#f1dfc1", timber: "#7a4a2e", frame: "#f6efe1" },
    roof: BROWN_TILE,
    roofKind: "front",
    tall: { wall: "#e9cfc4", timber: "#6a3f2a", frame: "#f6efe1" },
  },
  // Chartres : la pierre de Beauce, l'ardoise, les lucarnes
  14: {
    look: { wall: "#e6dcc6", shutters: "#3e5f7a", ashlar: true },
    roof: SLATE,
    roofKind: "steep",
    dormers: true,
    chimneys: true,
  },
  // Limoges : les pans de bois sombres, l'ardoise
  16: {
    shops: true,
    look: { wall: "#efe2cc", timber: "#5a3424", frame: "#f6efe1" },
    roof: DARK_SLATE,
    roofKind: "front",
    tall: { wall: "#e9e3d8", shutters: "#7a2f34", ashlar: true },
    tallRoof: "steep",
  },
  // Brest : le granit gris, l'ardoise, les volets bleus de la mer
  18: {
    shops: true,
    look: { wall: "#b9b6ae", shutters: "#2f5f9a", frame: "#f1eee8", ashlar: true },
    roof: DARK_SLATE,
    roofKind: "gable",
    chimneys: true,
    tall: { wall: "#c4c1ba", frame: "#f1eee8", balcony: true },
    tallRoof: "flat",
  },
  // Poitiers : le calcaire pâle, les tuiles du Poitou
  19: {
    shops: true,
    look: { wall: "#ece4d2", shutters: "#5f7d8c", ashlar: true },
    roof: TILE,
    roofKind: "hip",
    tall: { wall: "#e8e0cc", shutters: "#5f7d8c", ashlar: true },
    tallRoof: "steep",
    tallRoofColor: SLATE,
  },
  // Clermont-Ferrand : la pierre de lave noire, les tuiles rouges
  21: {
    shops: true,
    look: { wall: "#5d5c5a", frame: "#ece6dc", shutters: "#b8a27a", narrow: true },
    roof: TILE,
    roofKind: "hip",
    chimneys: true,
    tall: { wall: "#6a6866", frame: "#ece6dc", balcony: true },
  },
  // Dijon : la pierre claire de Bourgogne, les tuiles brunes (et vernissées sur le palais)
  23: {
    shops: true,
    look: { wall: "#efe5cf", shutters: "#6b4a35", ashlar: true },
    roof: BROWN_TILE,
    roofKind: "steep",
    dormers: true,
    tall: { wall: "#f0e3cf", timber: "#6b4a35", frame: "#f6efe1" },
    tallRoof: "front",
  },
  // Rennes : les pans de bois de couleur, l'ardoise
  24: {
    shops: true,
    look: { wall: "#f0e6d0", timber: "#2f6a8a", frame: "#f6efe1" },
    roof: SLATE,
    roofKind: "front",
    tall: { wall: "#f2e4c8", timber: "#a8452f", frame: "#f6efe1" },
  },
  // Montpellier : la pierre claire du Languedoc, tuiles rondes, volets gris-bleu, des arcades
  26: {
    look: { wall: "#efe0c2", shutters: "#6e8a96", frame: "#faf3e4" },
    roof: ROUND_TILE,
    roofKind: "hip",
    tall: { wall: "#ead6b2", shutters: "#6e8a96", balcony: true, frame: "#faf3e4" },
    arcades: true,
  },
  // Strasbourg : les colombages alsaciens, les grands toits pentus de tuiles
  27: {
    shops: true,
    look: { wall: "#f3dfb5", timber: "#6a3a26", frame: "#fbf3e4" },
    roof: "#a64a32",
    roofKind: "front",
    tall: { wall: "#e9c9c0", timber: "#5a3424", frame: "#fbf3e4" },
    dormers: true,
  },
  // Toulouse : la brique rose, les fenêtres en plein cintre, la tuile canal
  29: {
    look: { wall: "#cf7a5e", brick: true, frame: "#f2e2cf", arched: true },
    roof: ROUND_TILE,
    roofKind: "hip",
    arcades: true,
  },
  // Nantes : le tuffeau blanc, l'ardoise, les balcons de l'île Feydeau
  31: {
    shops: true,
    look: { wall: "#f2ede0", shutters: "#7f8e96", ashlar: true },
    roof: SLATE,
    roofKind: "steep",
    dormers: true,
    tall: { wall: "#f1ebdc", balcony: true, ashlar: true, frame: "#fbf8f0" },
    tallRoof: "mansard",
  },
  // Lille : la brique rouge, les pignons à gradins des Flandres
  32: {
    shops: true,
    look: { wall: "#a8513c", brick: true, frame: "#f2ece0" },
    roof: DARK_SLATE,
    roofKind: "stepped",
    tall: { wall: "#9f4a37", brick: true, frame: "#f2ece0" },
  },
  // Bordeaux : la pierre blonde, les balcons de fer forgé, l'ardoise
  34: {
    shops: true,
    look: { wall: "#ecdcb5", frame: "#fbf5e4", balcony: true, ashlar: true },
    roof: SLATE,
    roofKind: "mansard",
    dormers: true,
    arcades: false,
  },
  // Lyon : les façades pastel des pentes, les tuiles canal
  37: {
    shops: true,
    look: { wall: "#efc79a", shutters: "#5b7a6a", frame: "#fbf2e2" },
    roof: ROUND_TILE,
    roofKind: "hip",
    tall: { wall: "#e7b39a", shutters: "#4f6b7a", frame: "#fbf2e2" },
  },
  // Paris : la pierre de taille haussmannienne, les balcons filants, le zinc et ses lucarnes
  39: {
    shops: true,
    look: { wall: "#efe6cf", frame: "#fbf8ee", balcony: true, ashlar: true },
    roof: ZINC,
    roofKind: "mansard",
    dormers: true,
    chimneys: true,
  },
};

const lookOf = (index: number): CityLook => CITY_LOOKS[index] ?? CITY_LOOKS[1]!;

/** Un toit à deux pans, le faîtage perpendiculaire à la rue (pignon sur rue) */
function frontGable(w: number, d: number, h: number, color: string): THREE.Mesh {
  const roof = gableRoof(d, w, h, color, 0.025);
  roof.rotation.y = Math.PI / 2;
  return roof;
}

/** Le pignon d'une façade, en mur plein : un triangle (ou des gradins) au-dessus de la façade, sur rue */
function gableWall(w: number, h: number, wall: string, stepped: boolean): THREE.Mesh {
  const s = new THREE.Shape();
  const half = w / 2;
  s.moveTo(-half, 0);
  if (stepped) {
    const steps = 4;
    for (let k = 0; k < steps; k++) {
      const x = -half + (k * half) / steps;
      const y = (k * h) / steps;
      s.lineTo(x, y + h / steps);
      s.lineTo(x + half / steps, y + h / steps);
    }
    s.lineTo(0, h * 1.08);
    for (let k = steps - 1; k >= 0; k--) {
      const x = half - (k * half) / steps;
      const y = (k * h) / steps;
      s.lineTo(x - half / steps, y + h / steps);
      s.lineTo(x, y + h / steps);
    }
    s.lineTo(half, 0);
  } else {
    s.lineTo(0, h);
    s.lineTo(half, 0);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
  return new THREE.Mesh(geo, mat(wall, { rough: 0.85 }));
}

/** Une lucarne : un petit volume vitré et son toit, posé sur le pan avant */
function dormer(x: number, y: number, z: number, roof: string, frame: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.06, 0.07, 0.07, mat(frame, { rough: 0.6 }), 0, 0, 0));
  g.add(box(0.036, 0.04, 0.004, mat("#3e5568", { rough: 0.2, metal: 0.3 }), 0, 0.014, 0.036));
  const top = gableRoof(0.07, 0.08, 0.035, roof, 0.008);
  top.position.y = 0.07;
  g.add(top);
  g.position.set(x, y, z);
  return g;
}

/** Le toit d'un volume w × d posé en y = h */
function roofFor(kind: Roof, w: number, d: number, h: number, roofH: number, c: CityLook, color: string, g: THREE.Group) {
  const wall = (c.look.wall as string) ?? "#e0d6c0";
  switch (kind) {
    case "gable":
    case "steep": {
      const r = gableRoof(w, d, roofH * (kind === "steep" ? 1.45 : 1), color);
      r.position.y = h;
      g.add(r);
      return;
    }
    case "hip": {
      const r = hipRoof(w, d, roofH * 0.85, color);
      r.position.y = h;
      g.add(r);
      return;
    }
    case "mansard": {
      const r = mansardRoof(w, d, roofH * 0.95, color);
      r.position.y = h;
      g.add(r);
      // Le brisis s'arrête sous un petit toit plat de zinc
      g.add(box(w * 0.62, 0.012, d * 0.62, mat(mix(color, "#000000", 0.15), { rough: 0.5, metal: 0.3 }), 0, h + roofH * 0.95, 0));
      return;
    }
    case "flat": {
      g.add(box(w + 0.01, 0.025, d + 0.01, mat(mix(wall, "#000000", 0.18), { rough: 0.7 }), 0, h, 0));
      g.add(box(w * 0.28, 0.05, d * 0.22, mat("#b9c1c8", { rough: 0.5, metal: 0.4 }), -w * 0.18, h + 0.025, -d * 0.1));
      return;
    }
    case "front":
    case "stepped": {
      const rh = roofH * (kind === "stepped" ? 1.2 : 1.6);
      const r = frontGable(w, d, rh, color);
      r.position.y = h;
      g.add(r);
      // Le pignon de façade, dans la matière du mur (à gradins pour les Flandres)
      const front = gableWall(
        w + (kind === "stepped" ? 0.02 : 0),
        rh,
        kind === "stepped" ? mix(wall, "#000000", 0.05) : wall,
        kind === "stepped",
      );
      front.position.set(0, h, d / 2 - 0.012);
      g.add(front);
      // Une petite fenêtre dans le pignon
      g.add(box(0.04, 0.05, 0.006, mat("#3e5568", { rough: 0.2, metal: 0.3 }), 0, h + rh * 0.25, d / 2 + 0.01));
      return;
    }
  }
}

/** Un bâtiment d'une ville : le volume, son soubassement, sa porte (à la couleur du propriétaire), son toit */
function building(index: number, accent: string, w: number, d: number, storeys: number, tall: boolean): THREE.Group {
  const c = lookOf(index);
  const look = tall ? (c.tall ?? c.look) : c.look;
  const kind = tall ? (c.tallRoof ?? c.roofKind) : c.roofKind;
  const roofColor = tall ? (c.tallRoofColor ?? c.roof) : c.roof;
  const h = storeys * STOREY;
  const g = new THREE.Group();
  const top = mat(roofColor, { rough: 0.8 });
  g.add(facadeBox(w, h, d, look, top));
  // Le soubassement, plus sombre
  g.add(box(w + 0.008, 0.035, d + 0.008, mat(mix(look.wall, "#000000", 0.28))));
  if (tall) {
    // Le rez-de-chaussée : des arcades, ou une boutique à la couleur du propriétaire (son store)
    if (c.arcades) {
      const n = Math.max(2, Math.round(w / 0.1));
      for (let k = 0; k < n; k++) {
        const x = -w / 2 + ((k + 0.5) * w) / n;
        g.add(box((w / n) * 0.62, STOREY * 0.7, 0.008, mat(mix(look.wall, "#000000", 0.55), { rough: 0.9 }), x, 0.02, d / 2 + 0.002));
      }
      g.add(box(w + 0.01, 0.018, 0.03, mat(accent, { rough: 0.5 }), 0, STOREY * 0.78, d / 2 + 0.012));
    } else if (c.shops) {
      // Deux vitrines claires de part et d'autre de la porte, sous un store à la couleur du propriétaire
      const glass = mat("#7fa3bb", { rough: 0.15, metal: 0.2 });
      const frame = mat(mix(look.wall, "#000000", 0.45), { rough: 0.6 });
      for (const side of [-1, 1]) {
        g.add(box(w * 0.34, STOREY * 0.56, 0.01, frame, side * w * 0.25, 0.035, d / 2 + 0.002));
        g.add(box(w * 0.3, STOREY * 0.48, 0.006, glass, side * w * 0.25, 0.045, d / 2 + 0.008));
      }
      g.add(box(0.06, 0.1, 0.012, mat(accent, { rough: 0.5 }), 0, 0.035, d / 2 + 0.004));
      const awning = box(w * 0.92, 0.01, 0.05, mat(accent, { rough: 0.55 }), 0, STOREY * 0.7, d / 2 + 0.026);
      awning.rotation.x = 0.35;
      g.add(awning);
    } else {
      // Une petite ville : la porte d'entrée, à la couleur du propriétaire, sous une marquise
      g.add(box(0.07, 0.11, 0.012, mat(accent, { rough: 0.5 }), 0, 0.035, d / 2 + 0.004));
      g.add(box(0.12, 0.012, 0.045, mat(accent, { rough: 0.5 }), 0, 0.15, d / 2 + 0.022));
    }
    // La corniche sous le toit
    g.add(box(w + 0.02, 0.016, d + 0.02, mat(mix(look.wall, "#ffffff", 0.25), { rough: 0.7 }), 0, h - 0.016, 0));
  } else {
    // La porte et son auvent, à la couleur du propriétaire
    g.add(box(0.07, 0.11, 0.012, mat(accent, { rough: 0.5 }), 0, 0, d / 2 + 0.004));
    g.add(box(0.11, 0.012, 0.04, mat(accent, { rough: 0.5 }), 0, 0.12, d / 2 + 0.02));
  }
  const roofH = tall ? 0.14 : 0.13;
  roofFor(kind, w, d, h, roofH, c, roofColor, g);
  // Lucarnes et cheminées
  if (c.dormers && kind !== "flat" && kind !== "front" && kind !== "stepped") {
    const n = w > 0.36 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + ((k + 0.5) * w) / n;
      g.add(dormer(x, h + 0.005, d / 2 - 0.03, roofColor, look.frame ?? "#f6efe1"));
    }
  }
  if (c.chimneys && kind !== "flat") {
    const brick = mat(kind === "mansard" ? "#c9b49a" : mix(look.wall, "#000000", 0.2));
    g.add(box(0.045, 0.14, 0.05, brick, w * 0.3, h + 0.02, -d * 0.12));
    if (tall || kind === "mansard") g.add(box(0.045, 0.14, 0.05, brick, -w * 0.3, h + 0.02, -d * 0.12));
  }
  return g;
}

/** La maison de la ville (niveaux 1 et 2) ; la variante 1 est plus étroite, d'une autre hauteur */
export function cityHouse(index: number, accent: string, variant = 0): THREE.Group {
  const w = variant ? 0.29 : 0.34;
  const storeys = variant ? (lookOf(index).roofKind === "front" ? 3 : 2) : 2;
  const g = building(index, accent, w, 0.28, storeys, false);
  // Le jardinet devant : une bande de pelouse et, parfois, un petit arbre
  g.add(box(w + 0.04, 0.03, 0.03, mat("#6f9a4c", { rough: 1 }), 0, 0, 0.19));
  return bake(shadowed(g));
}

/**
 * L'immeuble de la ville : l'immeuble seul du niveau 3 (variante 0), puis les deux du niveau 4, l'un plus étroit et plus
 * haut (variante 1), l'autre plus bas (variante 2)
 */
export function cityBlock(index: number, accent: string, variant = 0): THREE.Group {
  const w = variant === 1 ? 0.31 : variant === 2 ? 0.37 : 0.42;
  const storeys = variant === 1 ? 4 : 3;
  return bake(shadowed(building(index, accent, w, 0.34, storeys, true)));
}

/** Les villes, dans l'ordre du plateau : pour la planche de contrôle */
export const CITY_SQUARES = SQUARES.filter((s) => s.kind === "property").map((s) => s.index);

/** Un petit arbre rond, pour les cours et les jardins */
export function smallTree(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.012, 0.016, 0.08 * scale, mat("#7a5a3c"), 6));
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06 * scale, 0), mat("#5f9a45", { flat: true, rough: 0.9 }));
  crown.position.y = 0.11 * scale;
  g.add(crown);
  return g;
}
