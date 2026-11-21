// La Montagne enneigée : un matin d'hiver éclatant, des pistes de gazon tracées dans la neige et bordées de rondins,
// la glace qui fait filer la balle, la neige fraîche qui la freine, un tremplin, une piste de luge, le télésiège,
// les sapins, une grotte de glace et le sommet.

import { hole, ramp } from "../build.ts";
import type { HoleDef, Part } from "../course.ts";
import { arc, box, circle, ellipse, smooth, type Pt } from "../geom.ts";

const UP = -Math.PI / 2;

/**
 * Une allée de largeur 2·hw qui débouche sur une ellipse (centre c, demi-axes rx, rz) : un seul contour, l'allée
 * arrivant du côté des z croissants (du départ), jusqu'à z = top
 */
function laneIntoEllipse(c: Pt, rx: number, rz: number, hw: number, top: number, n = 64): Pt[] {
  const t0 = Math.acos(hw / rx);
  const zAt = c[1] + rz * Math.sin(t0);
  const pts: Pt[] = [[hw, top]];
  for (let k = 0; k <= n; k++) {
    const t = t0 - ((Math.PI * 2 - 2 * (Math.PI / 2 - t0) - 0) * k) / n;
    pts.push([c[0] + rx * Math.cos(t), c[1] + rz * Math.sin(t)]);
  }
  void zAt;
  pts.push([-hw, top]);
  return pts;
}

// 1. Le chalet : tout droit, une plaque de glace au milieu et un bonhomme de neige à contourner
const chalet = hole(
  "Le chalet",
  2,
  (b) => {
    const g = b.tile(box(-0.9, -9, 0.9, 0), 0, "green", { look: "rondin" });
    b.inset(g, ellipse(0.1, -4.6, 0.55, 1.1, 30), -0.004, "ice", { look: "glace" });
    b.post([-0.35, -6.4], 0.2, 0.7, { look: "bonhomme" });
    b.tee(0, -0.45, UP).cup(0.15, -8.2);
  },
  { hint: "Sur la glace, la balle file : moins fort que d'habitude." },
);

// 2. Le lac gelé : un grand lac de glace, quelques congères qui freinent, le trou sur l'autre rive
const lac = hole(
  "Le lac gelé",
  3,
  (b) => {
    b.tile(box(-0.8, -2, 0.8, 0), 0, "green", { look: "rondin" });
    // Le lac commence où l'allée finit : son contour part des deux coins de l'allée
    const shore = laneIntoEllipse([0, -6.2], 2.6, 4.2, 0.8, -2);
    const lake = b.tile(shore, 0, "ice", { look: "glace" });
    b.inset(lake, circle(-1.1, -5.4, 0.5, 26), 0.0, "snow", { look: "neige" });
    b.inset(lake, circle(1.2, -7.4, 0.55, 26), 0.0, "snow", { look: "neige" });
    b.inset(lake, ellipse(0, -9.2, 1.0, 0.55, 30), 0.0, "green", { look: "rondin" });
    b.tee(0, -0.45, UP).cup(0, -9.25);
  },
  { hint: "La glace ne freine presque pas : les congères, si." },
);

// 3. Le tremplin : sauter la crevasse, ou passer par l'étroit pont de glace
const tremplin = hole(
  "Le tremplin",
  3,
  (b) => {
    b.tile(box(-0.8, -4.6, 0.8, 0), ramp([0, 0], [0, -4.6], 0.25, 0, "s"), "green", { look: "rondin" });
    b.tile(box(-0.8, -6.0, 0.8, -4.6), ramp([0, -4.6], [0, -6.0], 0, 0.32, "in"), "snow", { look: "tremplin" });
    // Le pont de glace, à gauche, au-dessus de la crevasse
    b.tile(box(-2.2, -4.6, -0.8, -3.6), 0, "green", { look: "rondin" });
    b.tile(box(-2.2, -7.6, -1.75, -4.6), 0, "ice", { look: "pontglace", noRail: true });
    // L'autre bord, qui descend vers le trou
    b.tile(box(-2.2, -12.5, 1.2, -7.6), ramp([0, -7.6], [0, -12.5], 0, -0.35, "s"), "green", { look: "rondin" });
    b.open(box(-1.8, -7.8, 1.3, -7.4));
    b.open(box(-0.9, -6.2, 0.9, -5.8));
    b.link([0, -5.8], [0, -8.4]);
    b.tee(0, -0.45, UP).cup(-0.3, -11.6);
  },
  { hint: "Plein élan sur le tremplin ; le pont de glace, lui, ne pardonne pas un écart." },
);

// 4. La piste de luge : une descente en lacets toute en glace, et une congère au bout pour s'arrêter
const luge = hole(
  "La piste de luge",
  3,
  (b) => {
    const path = smooth(
      [
        [0, 0],
        [0, -2.5],
        [2.2, -5],
        [-0.5, -8.5],
        [1.6, -11.5],
        [1.6, -13.5],
      ],
      0.3,
    );
    b.strip(path, 1.25, [
      { len: 2.2, h0: 0.9, look: "rondin" },
      { len: 12.4, h1: 0.12, mat: "ice", look: "luge" },
      { len: 99, mat: "snow", look: "rondin" },
    ]);
    b.tee(0, -0.45, UP).cup(1.6, -13.0);
  },
  { hint: "Un petit coup suffit : la pente et la glace font le reste." },
);

/** Les sièges du télésiège : trois sièges qui défilent ensemble en travers de l'allée */
function chairs(z: number): Part[] {
  return [-3.2, 0, 3.2].map((x) => ({ k: "wall" as const, a: [x - 0.32, z] as Pt, b: [x + 0.32, z] as Pt, y0: 0.0, y1: 0.4, t: 0.12 }));
}

// 5. Le télésiège : les sièges passent au ras de la neige, en travers de l'allée
const telesiege = hole(
  "Le télésiège",
  3,
  (b) => {
    b.tile(box(-0.9, -11, 0.9, 0), ramp([0, 0], [0, -11], 0, 0.3), "green", { look: "rondin" });
    b.mover({ motion: { k: "slide", d: [3.2, 0, 0], period: 3.6 }, parts: chairs(-4.2), look: "telesiege", e: 0.4 });
    b.mover({ motion: { k: "slide", d: [-3.2, 0, 0], period: 4.4, a0: 0.3 }, parts: chairs(-7.4), look: "telesiege", e: 0.4 });
    b.tee(0, -0.45, UP).cup(0, -10.1);
  },
  { hint: "Les sièges ne s'arrêtent pas : glisse-toi entre eux." },
);

// 6. Les sapins : un slalom dans la forêt, des congères à éviter
const sapins = hole(
  "Les sapins",
  4,
  (b) => {
    const g = b.tile(
      [
        [-1, 0],
        [1, 0],
        [2.4, -3],
        [2.4, -9],
        [1.2, -12.5],
        [-1.2, -12.5],
        [-2.4, -9],
        [-2.4, -3],
      ] as Pt[],
      0,
      "green",
      { look: "rondin", bumps: [{ c: [0.6, -6.8], r: 1.0, a: 0.06 }] },
    );
    b.inset(g, circle(-1.4, -6.2, 0.55, 26), 0, "snow", { look: "neige" });
    b.inset(g, circle(1.5, -9.4, 0.5, 26), 0, "snow", { look: "neige" });
    const trees: Pt[] = [
      [-0.6, -2.6],
      [0.9, -3.6],
      [-1.4, -4.4],
      [0.2, -5.2],
      [1.6, -6.0],
      [-0.6, -7.4],
      [0.9, -8.4],
      [-1.5, -8.6],
      [0.1, -10.0],
    ];
    for (const t of trees) b.post(t, 0.2, 1.4, { look: "sapin", e: 0.4 });
    b.tee(0, -0.45, UP).cup(-0.6, -11.6);
  },
  { hint: "Trouve un chemin entre les sapins." },
);

// 7. La grotte de glace : un tube creusé dans la glace descend du plateau vers le trou
const grotte = hole(
  "La grotte de glace",
  3,
  (b) => {
    b.tile(box(-0.9, -4, 0.9, 0), ramp([0, 0], [0, -4], 0, 0.2), "green", { look: "rondin" });
    b.tile(box(-0.9, -5.5, 0.9, -4), 0.2, "green", { look: "rondin" });
    // Le trou, en contrebas sur la droite
    b.tile(box(2.4, -11, 5.2, -6.4), -0.4, "green", { look: "rondin" });
    // L'entrée du tube au bout du plateau, sa sortie près du trou
    const y = 0.2 + 0.055;
    b.rail(
      [
        [0, y, -5.25],
        [0, y - 0.05, -6.4],
        [0.8, y - 0.25, -7.6],
        [2.2, y - 0.5, -7.9],
        [3.2, -0.4 + 0.055, -7.7],
      ],
      "glace",
      0.3,
    );
    b.tee(0, -0.45, UP).cup(4.2, -9.6);
  },
  { hint: "Vise l'entrée de la grotte, au bout du plateau." },
);

/** Le bonhomme de neige et ses bras de bois qui tournent */
function arms(c: Pt): Part[] {
  return [
    { k: "wall", a: [c[0] - 1.05, c[1]], b: [c[0] + 1.05, c[1]], y0: -1, y1: 0.16, t: 0.04 },
    { k: "post", c, r: 0.32, y0: -1, y1: 0.6 },
  ];
}

// 8. Le bonhomme : planté au milieu, il fait tourner ses bras de bois à ras du sol
const bonhomme = hole(
  "Le bonhomme",
  3,
  (b) => {
    b.tile(laneIntoEllipse([0, -5.2], 2.6, 2.6, 0.7, 0.35), 0, "green", { look: "rondin" });
    b.mover({ motion: { k: "spin", c: [0, -5.2], w: 1.0 }, parts: arms([0, -5.2]), look: "bonhomme", e: 0.5 });
    b.tee(0, -0.2, UP).cup(0.3, -7.3);
  },
  { hint: "Les bras du bonhomme balaient tout le rond : choisis ton moment." },
);

// 9. Le sommet : deux terrasses à gravir, le trou tout en haut près de la croix ; un autre trou à mi-pente, bien caché
const sommet = hole(
  "Le sommet",
  4,
  (b) => {
    b.tile(box(-1.6, -4.5, 1.6, 0), 0, "green", { look: "rondin" });
    b.tile(box(-0.6, -6, 0.6, -4.5), ramp([0, -4.5], [0, -6], 0, 0.35, "s"), "green", { look: "rondin" });
    const mid = b.tile(box(-2.4, -9, 2.4, -6), 0.35, "green", { look: "rondin" });
    b.inset(mid, circle(1.4, -7.4, 0.45, 26), 0.35, "snow", { look: "neige" });
    b.tile(box(1.0, -10.5, 2.2, -9), ramp([0, -9], [0, -10.5], 0.35, 0.75, "s"), "green", { look: "rondin" });
    b.tile(box(-1.4, -13, 2.4, -10.5), 0.75, "green", { look: "rondin" });
    b.wall(
      [
        [-2.4, -7.8],
        [-1.2, -7.8],
      ],
      0.3,
      { look: "rondin" },
    );
    b.tee(0, -0.45, UP).cup(0.6, -12.1).cup(-1.9, -8.4);
  },
  { hint: "Tout en haut, ou le trou caché derrière les rondins, à mi-pente." },
);

void arc;

export const MONTAGNE: HoleDef[] = [chalet, lac, tremplin, luge, telesiege, sapins, grotte, bonhomme, sommet];
