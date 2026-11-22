// Les tables du billard : la table à poches (pleines et rayées, la bille 9, le Killer) et la table de carambole (trois
// billes, sans poches). Tout est en mètres, vu de dessus : x le long de la table (la tête, d'où l'on casse, côté x < 0),
// y en travers. Le tapis va de −LX à LX et de −LY à LY jusqu'au nez des bandes.
//
// Les bandes sont des « capsules » : des segments à bord arrondi (un rayon de quelques millimètres), le long des bandes
// et dans les mâchoires des poches. Une bille entre dans une poche quand son centre a franchi la ligne de chute, un peu
// au-delà de l'embouchure ; avant, elle peut encore rebondir sur les mâchoires et ressortir.
//
// Les directions sont écrites en nombres (pas de sinus ni de cosinus) : le serveur et tous les écrans calculent exactement
// la même table.

export type TableKind = "poches" | "carambole";

export interface Capsule {
  /** Le segment du cœur de la bande (la bille la touche à R + r de ce segment) */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Le rayon du caoutchouc autour du segment */
  r: number;
  /** Quelle bande, pour le son et les règles : 0 à 5 les six bandes, 6 et plus les mâchoires et les pointes */
  rail: number;
}

export interface Pocket {
  /** Le centre du trou (pour le dessin et la chute) */
  x: number;
  y: number;
  /** La direction de la poche vers l'extérieur (unitaire) */
  nx: number;
  ny: number;
  /** La bille tombe quand (centre − embouchure)·direction dépasse ce seuil */
  ox: number;
  oy: number;
  depth: number;
  /** La largeur de l'embouchure (d'une pointe à l'autre) */
  mouth: number;
  /** Poche de coin ou du milieu */
  corner: boolean;
}

export interface Table {
  kind: TableKind;
  /** La moitié de la longueur et de la largeur du tapis */
  lx: number;
  ly: number;
  /** Le rayon des billes */
  R: number;
  cushions: Capsule[];
  pockets: Pocket[];
  /** La ligne de tête (on casse et on replace la blanche derrière, x ≤ head) */
  head: number;
  /** Le point de tête et le point de pied (où l'on pose le triangle) */
  headSpot: [number, number];
  footSpot: [number, number];
  /** La largeur des bandes en bois autour du tapis, la hauteur du nez de la bande (pour le dessin) */
  rail: number;
  cushionW: number;
}

const S = 0.7071067811865476;

/** Le rayon des pointes et des mâchoires (le caoutchouc arrondi) */
const CAP_R = 0.007;

function cap(ax: number, ay: number, bx: number, by: number, rail: number, r = CAP_R): Capsule {
  return { ax, ay, bx, by, r, rail };
}

/** La table à poches : 2,24 m sur 1,12 m (une table de huit pieds), billes de 57,15 mm ; `wide` : de grandes poches */
function pocketTable(wide: boolean): Table {
  const lx = 1.12,
    ly = 0.56,
    R = 0.028575;
  // Les embouchures (d'une pointe à l'autre), un peu généreuses : on joue entre amis
  const cornerMouth = wide ? 0.16 : 0.124,
    sideMouth = wide ? 0.17 : 0.136;
  // Le recul de chaque pointe le long des bandes, depuis le coin du tapis : cc·√2 = l'embouchure
  const cc = cornerMouth * S;
  const m = sideMouth / 2;
  const jaw = 0.075;
  const r = CAP_R;
  const cushions: Capsule[] = [];
  // Les six bandes : 0 haut-gauche, 1 haut-droite, 2 bout droit, 3 bas-droite, 4 bas-gauche, 5 bout gauche. Les cœurs
  // sont reculés du rayon de la capsule : le nez de la bande est exactement sur le bord du tapis.
  cushions.push(cap(-lx + cc, ly + r, -m, ly + r, 0));
  cushions.push(cap(m, ly + r, lx - cc, ly + r, 1));
  cushions.push(cap(lx + r, ly - cc, lx + r, -ly + cc, 2));
  cushions.push(cap(lx - cc, -ly - r, m, -ly - r, 3));
  cushions.push(cap(-m, -ly - r, -lx + cc, -ly - r, 4));
  cushions.push(cap(-lx - r, -ly + cc, -lx - r, ly - cc, 5));
  const pockets: Pocket[] = [];
  // Les quatre coins : deux mâchoires parallèles à la diagonale, chacune collée au bout de sa bande
  const corners: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  let jawRail = 6;
  for (const [sx, sy] of corners) {
    // La pointe sur la bande longue (y = ±ly) et celle sur le bout (x = ±lx)
    const ax = sx * (lx - cc),
      ay = sy * ly;
    const bx = sx * lx,
      by = sy * (ly - cc);
    const dx = sx * S,
      dy = sy * S;
    // Le cœur de chaque mâchoire, reculé de r vers l'extérieur de la gorge (la gorge est entre les deux mâchoires) ; il
    // commence un peu au-delà de la pointe, pour que son bout arrondi ne dépasse pas sur le tapis (il touche le bout
    // arrondi de la bande : pas de fente entre les deux)
    const u0 = (r * (1 - S)) / S + 0.0002;
    const pax = ax - sx * r * S + dx * u0,
      pay = ay + sy * r * S + dy * u0;
    const pbx = bx + sx * r * S + dx * u0,
      pby = by - sy * r * S + dy * u0;
    cushions.push(cap(pax, pay, pax + dx * jaw, pay + dy * jaw, jawRail));
    cushions.push(cap(pbx, pby, pbx + dx * jaw, pby + dy * jaw, jawRail + 1));
    jawRail += 2;
    // L'embouchure : le milieu des deux pointes ; la bille tombe un peu au-delà
    const ox = (ax + bx) / 2,
      oy = (ay + by) / 2;
    pockets.push({ x: ox + dx * 0.045, y: oy + dy * 0.045, nx: dx, ny: dy, ox, oy, depth: 0.032, mouth: cornerMouth, corner: true });
  }
  // Les deux poches du milieu : des mâchoires droites, perpendiculaires à la bande
  for (const sy of [1, -1]) {
    const y0 = sy * ly;
    // (le bout arrondi de la bande et le pied de la mâchoire se chevauchent : pas de fente entre les deux)
    cushions.push(cap(-m - r, y0 + sy * r, -m - r, y0 + sy * (r + jaw), jawRail));
    cushions.push(cap(m + r, y0 + sy * r, m + r, y0 + sy * (r + jaw), jawRail + 1));
    jawRail += 2;
    pockets.push({ x: 0, y: y0 + sy * 0.04, nx: 0, ny: sy, ox: 0, oy: y0, depth: 0.034, mouth: sideMouth, corner: false });
  }
  return {
    kind: "poches",
    lx,
    ly,
    R,
    cushions,
    pockets,
    head: -lx / 2,
    headSpot: [-lx / 2, 0],
    footSpot: [lx / 2, 0],
    rail: 0.13,
    cushionW: 0.05,
  };
}

/** La table de carambole : 2,54 m sur 1,27 m, billes de 61,5 mm, quatre bandes et pas de poches */
function caromTable(): Table {
  const lx = 1.27,
    ly = 0.635,
    R = 0.03075;
  const r = 0.01;
  const cushions = [
    cap(-lx, ly + r, lx, ly + r, 0, r),
    cap(lx + r, ly, lx + r, -ly, 2, r),
    cap(lx, -ly - r, -lx, -ly - r, 3, r),
    cap(-lx - r, -ly, -lx - r, ly, 5, r),
  ];
  return {
    kind: "carambole",
    lx,
    ly,
    R,
    cushions,
    pockets: [],
    head: -lx / 2,
    headSpot: [-lx / 2, 0],
    footSpot: [lx / 2, 0],
    rail: 0.14,
    cushionW: 0.05,
  };
}

const TABLES = { poches: pocketTable(false), larges: pocketTable(true), carambole: caromTable() };

/** La table de ce jeu ; `wide` : la table à poches aux grandes poches (une règle folle) */
export function tableOf(kind: TableKind, wide = false): Table {
  return kind === "carambole" ? TABLES.carambole : wide ? TABLES.larges : TABLES.poches;
}

/** Le nom d'une bande (0 à 5), pour les annonces */
export function isRail(rail: number): boolean {
  return rail >= 0 && rail <= 5;
}
