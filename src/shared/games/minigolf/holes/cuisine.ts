// La Cuisine géante : la balle n'est pas plus grosse qu'un petit pois sur un plan de travail immense. On joue sur la
// nappe à carreaux, les planches à découper et le marbre ; tomates cerises, farine renversée, l'évier, le batteur
// électrique, le grille-pain qui fait sauter la balle, les livres de recettes, le petit train et le rouleau à pâtisserie.

import { hole, radial, ramp } from "../build.ts";
import type { HoleDef, Part } from "../course.ts";
import { arc, box, circle, ellipse, roundRect, type Pt } from "../geom.ts";

const UP = -Math.PI / 2;

// 1. La planche à découper : tout droit sur le bois, des tomates cerises et un peu de farine renversée
const planche = hole(
  "La planche à découper",
  2,
  (b) => {
    const g = b.tile(roundRect(-0.9, -9, 0.9, 0, 0.6, 0.6), 0, "wood", { look: "planche-cuisine" });
    b.inset(g, ellipse(0.25, -5.2, 0.45, 0.7, 28), -0.004, "sand", { look: "farine" });
    b.post([-0.4, -3.4], 0.16, 0.3, { look: "tomate" })
      .post([0.45, -3.9], 0.16, 0.3, { look: "tomate" })
      .post([-0.2, -6.9], 0.16, 0.3, { look: "tomate" });
    b.tee(0, -0.45, UP).cup(0.1, -8.2);
  },
  { hint: "Les tomates cerises renvoient la balle ; la farine la freine.", outY: -0.28 },
);

// 2. Le plan de travail : un coude de marbre autour d'une corbeille de fruits
const plan = hole(
  "Le plan de travail",
  3,
  (b) => {
    b.tile(roundRect(-0.9, -5, 0.9, 0, 0.5, 0), 0, "green", { look: "nappe" });
    const corner = b.tile(
      [
        [-0.9, -5],
        [0.9, -5],
        ...arc(4.0, -5.6, 0.6, Math.PI / 2, 0, 8),
        [4.6, -9],
        [2.6, -9],
        ...arc(-0.3, -8.4, 0.6, -Math.PI / 2, -Math.PI, 8),
      ],
      0,
      "stone",
      { look: "marbre" },
    );
    b.inset(corner, circle(2.1, -7.2, 0.5, 28), -0.004, "sand", { look: "farine" });
    b.tile(roundRect(2.6, -12, 4.6, -9, 0, 1.0), 0, "green", { look: "nappe" });
    b.block(circle(-0.05, -7.1, 0.6, 24), 0.5, { look: "corbeille" });
    b.tee(0, -0.45, UP).cup(3.6, -11.2);
  },
  { hint: "Contourne la corbeille de fruits ; le marbre est rapide." },
);

// 3. L'évier : le bac plein d'eau au milieu, l'égouttoir en travers comme un pont
const evier = hole(
  "L'évier",
  3,
  (b) => {
    b.tile([box(-2.2, -11, 2.2, 0), box(-1.6, -7.6, 1.6, -3.4)], 0, "metal", { look: "inox" });
    // Le bac plein d'eau, coupé en deux par l'égouttoir posé en travers
    b.tile(box(-1.6, -7.6, -0.2, -3.4), -0.25, "water", { look: "eau-evier" });
    b.tile(box(0.2, -7.6, 1.6, -3.4), -0.25, "water", { look: "eau-evier" });
    b.tile(box(-0.2, -7.6, 0.2, -3.4), 0, "wood", { look: "egouttoir" });
    b.tee(0, -0.45, UP).cup(0, -10.1);
  },
  { hint: "L'égouttoir passe au-dessus de l'eau : tout droit, ou par les bords de l'évier." },
);

/** Les deux fouets du batteur : chacun, une barre qui tourne et son axe */
function whisk(c: Pt, len: number): Part[] {
  return [
    { k: "wall", a: [c[0] - len, c[1]], b: [c[0] + len, c[1]], y0: -1, y1: 0.14, t: 0.035 },
    { k: "post", c, r: 0.05, y0: -1, y1: 1.2 },
  ];
}

// 4. Le batteur : la nappe s'élargit en rond autour du bol, creusé, où tournent les deux fouets en sens contraire ;
// ses plis ondulent sous la balle
const batteur = hole(
  "Le batteur",
  3,
  (b) => {
    const C: Pt = [0, -5.5];
    const R = 1.65;
    const hw = 1.0;
    const a = Math.atan2(Math.sqrt(R * R - hw * hw), hw);
    b.tile(
      [
        [-hw, 0],
        [hw, 0],
        ...arc(C[0], C[1], R, a, -a, 24),
        ...arc(0, -10.0, hw, 0, -Math.PI, 16),
        ...arc(C[0], C[1], R, Math.PI + a, Math.PI - a, 24),
      ],
      {
        k: "sum",
        of: [
          { k: "radial", c: C, r0: 0.95, r1: 1.6, h0: -0.1, h1: 0, e: "s" },
          { k: "wave", at: [0, 0], dir: [0, 1], len: 1.9, amp: 0.012, h: 0 },
        ],
      },
      "green",
      { look: "nappe" },
    );
    b.mover({ motion: { k: "spin", c: [-0.55, -5.5], w: 2.1 }, parts: whisk([-0.55, -5.5], 0.5), look: "fouet" });
    b.mover({ motion: { k: "spin", c: [0.55, -5.5], w: -2.1, a0: 0.8 }, parts: whisk([0.55, -5.5], 0.5), look: "fouet" });
    b.deco("batteur", 0, -5.5);
    b.tee(0, -0.45, UP).cup(0, -10.1);
  },
  { hint: "Les fouets se croisent au milieu du bol : passe sur les côtés, ou au bon moment." },
);

// 5. Le grille-pain : la planche à découper, posée sur la nappe, finit en biseau ; le grille-pain fait sauter la
// balle par-dessus le mur de boîtes, jusqu'à la nappe plissée du trou
const grillePain = hole(
  "Le grille-pain",
  3,
  (b) => {
    const BOARD = 0.1;
    b.tile([...arc(0, -0.9, 1.2, Math.PI, 0, 16), [1.2, -5.6], [-1.2, -5.6]], BOARD, "wood", { look: "planche-cuisine" });
    b.tile(box(-1.2, -6, 1.2, -5.6), ramp([0, -5.6], [0, -6], BOARD, 0, "s"), "wood", { look: "planche-cuisine" });
    // Le mur de boîtes de conserve, avec un passage étroit à droite
    b.wall(
      [
        [-1.2, -6],
        [0.55, -6],
      ],
      0.7,
      { look: "conserves", t: 0.1 },
    );
    b.tile(
      [[-1.2, -6], [1.2, -6], [1.2, -10.8], ...arc(0, -10.8, 1.2, 0, -Math.PI, 16)],
      { k: "wave", at: [0, -6], dir: [0, 1], len: 1.7, amp: 0.012, h: 0 },
      "green",
      {
        look: "nappe",
      },
    );
    b.pad([-0.4, -4.6], 0.24, 4.3, { push: [0, -1.5], look: "grille-pain" });
    b.deco("grille-pain", -0.4, -4.6);
    b.tee(0, -0.45, UP).cup(-0.5, -10.4);
  },
  { hint: "Le grille-pain fait sauter la balle par-dessus les conserves ; à droite, un passage étroit." },
);

// 6. Les livres de recettes : trois gros livres empilés en escalier, le trou tout en haut
const livres = hole(
  "Les livres de recettes",
  3,
  (b) => {
    b.strip(
      [
        [0, 0],
        [0, -12],
      ],
      1.6,
      [
        { len: 3, h0: 0, look: "nappe" },
        { len: 1.2, h1: 0.22, e: "s", mat: "wood", look: "livre-rouge" },
        { len: 2.4, mat: "carpet", look: "livre-rouge" },
        { len: 1.2, h1: 0.44, e: "s", mat: "wood", look: "livre-vert" },
        { len: 2.0, mat: "carpet", look: "livre-vert" },
        { len: 1.2, h1: 0.66, e: "s", mat: "wood", look: "livre-bleu" },
        { len: 99, mat: "carpet", look: "livre-bleu" },
      ],
    );
    b.tee(0, -0.45, UP).cup(0.2, -11.4);
  },
  { hint: "Assez fort pour gravir les trois livres." },
);

// 7. Le petit train : la voie passe sur un petit remblai en travers de la nappe ; la locomotive va et vient, un tunnel
// de carton passe dessous ; la nappe ondule après le passage à niveau
const train = hole(
  "Le petit train",
  3,
  (b) => {
    const RAIL = 0.05;
    // La voie traverse la nappe : la bordure s'ouvre des deux côtés, juste assez pour laisser passer le train
    b.tile(
      [...arc(-0.8, -0.6, 0.6, Math.PI, Math.PI / 2, 6), ...arc(0.8, -0.6, 0.6, Math.PI / 2, 0, 6), [1.4, -5.75], [-1.4, -5.75]],
      ramp([0, -4.9], [0, -5.75], 0, RAIL, "s"),
      "green",
      { look: "nappe" },
    );
    b.tile(box(-1.4, -6.25, 1.4, -5.75), RAIL, "green", { look: "nappe" });
    b.tile(
      [[-1.4, -6.25], [1.4, -6.25], [1.4, -10.6], ...arc(0, -10.6, 1.4, 0, -Math.PI, 18)],
      {
        k: "max",
        of: [ramp([0, -6.25], [0, -7.1], RAIL, 0, "s"), { k: "wave", at: [0, -7.1], dir: [0, 1], len: 1.8, amp: 0.012, h: 0 }],
      },
      "green",
      { look: "nappe" },
    );
    b.open(box(-1.6, -6.2, -1.2, -5.8));
    b.open(box(1.2, -6.2, 1.6, -5.8));
    const loco: Part[] = [
      { k: "wall", a: [-0.6, -6], b: [0.6, -6], y0: -1, y1: 0.4 + RAIL, t: 0.18 },
      { k: "wall", a: [-1.95, -6], b: [-0.8, -6], y0: -1, y1: 0.35 + RAIL, t: 0.16 },
    ];
    b.mover({ motion: { k: "slide", d: [2.7, 0, 0], period: 4.6 }, parts: loco, look: "train" });
    b.portal([-1.0, -3.0], [0.9, -8.6], -Math.PI / 2 - 0.2, 0.2, "tunnel");
    b.tee(0, -0.45, UP).cup(-0.4, -11.1);
  },
  { hint: "Attends que le train passe, ou prends le tunnel de carton à gauche." },
);

// 8. Le rouleau à pâtisserie : il roule d'avant en arrière sur la pâte, et renvoie la balle d'où elle vient
const rouleau = hole(
  "Le rouleau à pâtisserie",
  3,
  (b) => {
    const g = b.tile(roundRect(-1.0, -11, 1.0, 0, 0.55, 1.0), 0, "green", { look: "nappe" });
    b.inset(g, box(-0.85, -8.4, 0.85, -3.2), 0.0, "dirt", { look: "pate" });
    const pin: Part[] = [{ k: "cap", a: [-1.1, 0.12, -4.0], b: [1.1, 0.12, -4.0], r: 0.12 }];
    // Il se soulève en s'éloignant (la balle passe dessous), et redescend en revenant
    b.mover({ motion: { k: "slide", d: [0, 0.34, -3.6], period: 5 }, parts: pin, look: "rouleau", e: 0.4 });
    b.tee(0, -0.45, UP).cup(0, -10.1);
  },
  { hint: "Le rouleau écrase tout sur son passage : suis-le quand il s'éloigne." },
);

// 9. La table du goûter : des assiettes en plateaux, des biscuits qui renvoient, deux trous dont un dans une tasse
const gouter = hole(
  "La table du goûter",
  3,
  (b) => {
    const t = b.tile(box(-2.6, -13, 2.6, 0), 0, "green", { look: "nappe" });
    // Une assiette : un fond plat, un rebord qui monte puis redescend jusqu'à la nappe
    const plate = (c: Pt, r: number) =>
      b.inset(
        t,
        circle(c[0], c[1], r, 40),
        { k: "sum", of: [radial(c, r * 0.55, r * 0.82, 0, 0.04, "s"), radial(c, r * 0.82, r, 0, -0.04, "s")] },
        "stone",
        {
          look: "assiette",
        },
      );
    plate([-1.2, -4.6], 0.9);
    plate([1.3, -7.6], 1.0);
    plate([-1.1, -10.6], 0.95);
    b.bumper([0.6, -3.4], 0.2, 2.4, "biscuit").bumper([-0.2, -6.4], 0.2, 2.4, "biscuit").bumper([0.4, -9.6], 0.2, 2.4, "biscuit");
    b.tee(0, -0.45, UP).cup(1.3, -7.6).cup(-1.6, -12.1);
  },
  { hint: "Deux trous : au centre d'une assiette, ou tout au fond de la table." },
);

export const CUISINE: HoleDef[] = [planche, plan, evier, batteur, grillePain, livres, train, rouleau, gouter];
