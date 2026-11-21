// Le Temple dans la jungle : des allées de mousse et de dalles gagnées par la forêt, un pont de lianes au-dessus de la
// rivière, des rochers qui roulent, les marches d'une pyramide, un gué où le courant emporte la balle vers la chute,
// des serpents de pierre qui tournent autour du trou, un puits sacré, des sables mouvants et le sanctuaire du masque
// d'or.

import { hole, ramp } from "../build.ts";
import type { HoleDef, Part } from "../course.ts";
import { box, circle, laneSides, smooth, type Pt } from "../geom.ts";

const UP = -Math.PI / 2;

/** Une allée de largeur 2·hw qui débouche sur un cercle (centre c, rayon r) par le côté des z croissants */
function laneIntoCircle(c: Pt, r: number, hw: number, top: number, n = 64): Pt[] {
  const t0 = Math.asin(hw / r);
  const pts: Pt[] = [[hw, top]];
  for (let k = 0; k <= n; k++) {
    const a = Math.PI / 2 - t0 - ((Math.PI * 2 - 2 * t0) * k) / n;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  pts.push([-hw, top]);
  return pts;
}

// 1. L'entrée du temple : l'allée de mousse, trois marches de pierre, et deux serpents dressés qui gardent le parvis
const entree = hole(
  "L'entrée du temple",
  2,
  (b) => {
    b.tile(box(-0.9, -5, 0.9, 0), 0, "green", { look: "mousse" });
    b.tile(box(-0.9, -6.2, 0.9, -5), ramp([0, -5], [0, -6.2], 0, 0.22, "s"), "stone", { look: "marche" });
    b.tile(box(-1.3, -9.6, 1.3, -6.2), 0.22, "stone", { look: "dalle" });
    b.post([-0.62, -6.75], 0.2, 0.9, { look: "serpent" });
    b.post([0.62, -6.75], 0.2, 0.9, { look: "serpent" });
    b.deco("porte", 0, -9.6);
    b.tee(0, -0.45, UP).cup(0.25, -8.6);
  },
  { hint: "Les marches demandent un peu d'élan ; les serpents gardent l'entrée du parvis." },
);

// 2. Le pont de lianes : il s'affaisse au-dessus de la rivière, et un tronc couché barre l'autre rive
const pont = hole(
  "Le pont de lianes",
  3,
  (b) => {
    b.tile(box(-0.9, -2.5, 0.9, 0), 0, "green", { look: "mousse" });
    b.strip(
      [
        [0, -2.5],
        [0, -8.5],
      ],
      0.8,
      [
        { len: 3, h0: 0, h1: -0.12, e: "s", mat: "wood", look: "pont" },
        { len: 99, h1: 0, e: "s", mat: "wood", look: "pont" },
      ],
    );
    b.tile(box(-1.6, -12, 1.6, -8.5), 0, "green", { look: "mousse" });
    b.wall(
      [
        [-0.95, -10.1],
        [0.65, -10.1],
      ],
      0.26,
      { look: "tronc", t: 0.13 },
    );
    b.deco("riviere", 0, -5.5);
    b.tee(0, -0.45, UP).cup(-0.2, -11.2);
  },
  { hint: "Le pont s'affaisse au milieu : assez fort pour remonter de l'autre côté." },
);

// 3. Le rocher qui roule : l'allée descend, deux rochers roulent en travers, chacun à son rythme
const rocher = hole(
  "Le rocher qui roule",
  3,
  (b) => {
    b.tile(box(-1.0, -11, 1.0, 0), ramp([0, 0], [0, -11], 0.3, 0), "stone", { look: "dalle" });
    const boulder = (x: number, z: number, r: number): Part[] => [{ k: "post", c: [x, z], r, y0: -1, y1: 0.75 }];
    b.mover({ motion: { k: "slide", d: [1.15, 0, 0], period: 3.4 }, parts: boulder(-0.6, -4.2, 0.34), look: "rocher", e: 0.45 });
    b.mover({ motion: { k: "slide", d: [-1.15, 0, 0], period: 2.8, a0: 0.4 }, parts: boulder(0.6, -7.4, 0.34), look: "rocher", e: 0.45 });
    b.tee(0, -0.45, UP).cup(-0.2, -10.1);
  },
  { hint: "Les rochers roulent d'un bord à l'autre : passe derrière eux." },
);

// 4. Les marches de la pyramide : on monte en zigzag, une marche à chaque palier, jusqu'au trou tout en haut
const pyramide = hole(
  "Les marches de la pyramide",
  3,
  (b) => {
    const path = smooth(
      [
        [0, 0],
        [0, -2.6],
        [1.8, -4.4],
        [1.8, -6.4],
        [0, -8.2],
        [0, -11.4],
      ],
      0.3,
    );
    b.strip(path, 1.5, [
      { len: 2.2, h0: 0, look: "mousse" },
      { len: 0.8, h1: 0.18, e: "s", mat: "stone", look: "marche" },
      { len: 2.4, mat: "stone", look: "dalle" },
      { len: 0.8, h1: 0.36, e: "s", mat: "stone", look: "marche" },
      { len: 2.4, mat: "stone", look: "dalle" },
      { len: 0.8, h1: 0.54, e: "s", mat: "stone", look: "marche" },
      { len: 99, mat: "stone", look: "dalle" },
    ]);
    b.deco("pyramide", 0.9, -6);
    b.tee(0, -0.45, UP).cup(0, -10.7);
  },
  { hint: "Une marche à chaque palier : vise le milieu des marches, assez fort." },
);

// 5. Le gué : la rivière traverse l'allée, son courant emporte la balle vers la chute ; sur l'autre rive, des racines
const gue = hole(
  "Le gué",
  4,
  (b) => {
    b.tile(box(-1.0, -3, 1.0, 0), 0, "green", { look: "mousse" });
    // Le gué : des galets sous une eau peu profonde qui coule vers la droite, jusqu'à la chute (sans bordure)
    b.tile(box(-2.6, -5, 2.6, -3), 0, "stone", { look: "gue", flow: { k: "belt", v: [1.1, 0] } });
    b.open(box(2.5, -5.1, 2.7, -2.9));
    b.tile(box(-1.2, -12, 1.2, -5), 0, "green", { look: "mousse" });
    b.wall(
      [
        [-1.2, -7.4],
        [0.3, -7.4],
      ],
      0.2,
      { look: "racine", t: 0.09 },
    );
    b.wall(
      [
        [-0.3, -9.4],
        [1.2, -9.4],
      ],
      0.2,
      { look: "racine", t: 0.09 },
    );
    b.deco("chute", 2.6, -4);
    b.tee(0, -0.45, UP).cup(0.4, -11);
  },
  { hint: "Le courant tire vers la chute : traverse le gué assez vite, en visant un peu à gauche." },
);

/** Les deux serpents de pierre qui tournent autour du trou */
function snakes(c: Pt): Part[] {
  return [
    { k: "wall", a: [c[0] + 0.42, c[1]], b: [c[0] + 1.3, c[1]], y0: -1, y1: 0.16, t: 0.07 },
    { k: "wall", a: [c[0] - 0.42, c[1]], b: [c[0] - 1.3, c[1]], y0: -1, y1: 0.16, t: 0.07 },
  ];
}

// 6. La salle des serpents : une salle ronde et sa couronne de piliers ; au milieu, deux serpents tournent autour du trou
const serpents = hole(
  "La salle des serpents",
  3,
  (b) => {
    const c: Pt = [0, -6.6];
    b.tile(laneIntoCircle(c, 2.5, 0.75, 0), 0, "stone", { look: "dalle" });
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 2 + Math.PI / 6 + (k * Math.PI) / 3;
      b.post([c[0] + Math.cos(a) * 1.85, c[1] + Math.sin(a) * 1.85], 0.17, 1.2, { look: "colonne" });
    }
    b.mover({ motion: { k: "spin", c, w: 1.2 }, parts: snakes(c), look: "serpents", e: 0.5 });
    b.tee(0, -0.45, UP).cup(c[0], c[1]);
  },
  { hint: "Entre les piliers, puis entre les serpents : ils tournent sans arrêt autour du trou." },
);

// 7. Le puits sacré : le départ en terrasse ; on peut descendre par le bord, ou viser le puits qui mène près du trou
const puits = hole(
  "Le puits sacré",
  3,
  (b) => {
    b.tile(box(-0.9, -5, 0.9, 0), 0.4, "stone", { look: "dalle" });
    const low = b.tile(box(-2.6, -11.5, 2.6, -5), 0, "green", { look: "mousse" });
    b.inset(low, circle(1.2, -7.6, 0.55, 28), 0, "sand", { look: "sable" });
    b.post([-1.3, -7.4], 0.2, 0.8, { look: "colonne-brisee" });
    b.post([0.2, -9.0], 0.2, 0.8, { look: "colonne-brisee" });
    b.post([1.6, -9.8], 0.2, 0.8, { look: "colonne-brisee" });
    b.portal([0.35, -3.9], [-1.55, -9.4], UP - 0.4, 0.2, "puits");
    b.tee(0, -0.45, UP).cup(-1.6, -10.4);
  },
  { hint: "Saute de la terrasse, ou vise le puits : il ressort près du trou." },
);

// 8. Les sables mouvants : une chaussée de pierre serpente au milieu ; à côté, le sable avale l'élan
const sables = hole(
  "Les sables mouvants",
  3,
  (b) => {
    const path = smooth(
      [
        [0, 0],
        [0, -2.4],
        [-0.75, -4],
        [0.75, -6.4],
        [-0.6, -8.6],
        [0, -10.5],
      ],
      0.25,
    );
    const { left, right } = laneSides(path, 0.62);
    // La chaussée part du bord, au départ, et s'arrête avant le fond : le sable l'entoure d'un seul tenant
    b.tile([...left, ...[...right].reverse()], 0, "stone", { look: "dalle" });
    b.tile([[-1.4, 0], ...left, ...[...right].reverse(), [1.4, 0], [1.4, -11.3], [-1.4, -11.3]], 0, "sand", { look: "sables" });
    b.tee(0, -0.45, UP).cup(0, -10.15);
  },
  { hint: "La chaussée serpente : un coup trop long finit dans le sable." },
);

// 9. Le sanctuaire : une bûche se balance à l'entrée ; au milieu, le disque de pierre qui tourne ; au fond, l'autel du
// masque d'or ; un trou caché derrière un pilier
const sanctuaire = hole(
  "Le sanctuaire",
  4,
  (b) => {
    b.tile(box(-0.9, -5, 0.9, 0), 0, "stone", { look: "dalle" });
    b.tile(box(-0.9, -5.8, 0.9, -5), ramp([0, -5], [0, -5.8], 0, 0.15, "s"), "stone", { look: "marche" });
    const hall = b.tile(box(-2.3, -12.4, 2.3, -5.8), 0.15, "stone", { look: "dalle" });
    // Le grand disque de pierre gravé, au milieu de la salle, qui tourne lentement et emporte la balle
    b.inset(hall, circle(0, -8.4, 1.25, 56), 0.15, "stone", { look: "disque", flow: { k: "spin", c: [0, -8.4], w: 0.8 } });
    // La bûche, pendue à deux lianes, qui balaie l'allée
    const log: Part[] = [{ k: "cap", a: [-0.95, 0.19, -3.2], b: [0.95, 0.19, -3.2], r: 0.15 }];
    b.mover({ motion: { k: "swing", c: [0, 1.7, -3.2], axis: [1, 0], amp: 0.75, w: 1.7 }, parts: log, look: "balancier", e: 0.4 });
    // L'autel du masque
    b.block(box(-0.55, -12.0, 0.55, -11.0), 0.45, { look: "autel" });
    b.deco("masque", 0, -11.5);
    for (const [x, z] of [
      [-1.5, -7.2],
      [1.5, -7.2],
      [-1.5, -9.6],
      [1.5, -9.6],
    ] as Pt[])
      b.post([x, z], 0.2, 1.3, { look: "colonne" });
    b.tee(0, -0.45, UP).cup(0, -10.3).cup(-1.85, -11.7);
  },
  { hint: "Passe sous la bûche quand elle remonte ; le disque emporte la balle. Deux trous : devant l'autel, ou dans le coin." },
);

export const JUNGLE: HoleDef[] = [entree, pont, rocher, pyramide, gue, serpents, puits, sables, sanctuaire];
