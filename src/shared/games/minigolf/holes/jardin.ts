// Le Jardin du château : des allées de gazon bordées de buis taillés, des fontaines, des grilles qui pivotent, des
// terrasses et le moulin de l'orangerie, sous la lumière dorée de la fin d'après-midi.

import { hole, ramp } from "../build.ts";
import type { HoleDef, Part } from "../course.ts";
import { arc, box, circle, type Pt } from "../geom.ts";

const UP = -Math.PI / 2;

/** Les points d'un arc sans le dernier (pour enchaîner plusieurs arcs en un anneau) */
function arcOpen(c: Pt, r: number, a0: number, a1: number): Pt[] {
  return arc(c[0], c[1], r, a0, a1).slice(0, -1);
}

// 1. L'allée d'honneur : le départ sur la terrasse, une rampe douce qui descend vers la pelouse ; elle s'élargit en
// ovale autour de deux ifs taillés en cône, et le trou attend au bout de l'arrondi
const allee = hole(
  "L'allée d'honneur",
  2,
  (b) => {
    const TOP = 0.26;
    b.tile(box(-0.9, -1.9, 0.9, 0), TOP, "green", { look: "buis" });
    b.tile(box(-0.9, -3.5, 0.9, -1.9), ramp([0, -1.9], [0, -3.5], TOP, 0, "s"), "green", { look: "buis" });
    // La pelouse : ses bords s'écartent en douceur puis se resserrent vers l'arrondi du fond
    const side = (k: number) => {
      const u = k / 10;
      return [0.9 + 0.42 * Math.sin(Math.PI * u), -3.5 - 4.6 * u] as Pt;
    };
    const right = Array.from({ length: 10 }, (_, k) => side(k + 1));
    const left = right.map(([x, z]) => [-x, z] as Pt).reverse();
    b.tile(
      [[-0.9, -3.5], [0.9, -3.5], ...right.slice(0, -1), ...arc(0, -8.1, 0.9, 0, -Math.PI, 12).slice(0, -1), ...left.slice(1)] as Pt[],
      0,
      "green",
      { look: "buis", bumps: [{ c: [0.45, -5.9], r: 0.65, a: 0.04 }] },
    );
    b.post([0.42, -4.7], 0.15, 0.55, { look: "if" }).post([-0.48, -6.5], 0.15, 0.55, { look: "if" });
    b.tee(0, -0.45, UP).cup(0, -8.25);
  },
  { hint: "Pour se mettre en jambes : descends la rampe et évite les ifs." },
);

// 2. Le parterre : un coude autour d'un massif de fleurs, une fosse de gravier dans le virage
const parterre = hole(
  "Le parterre",
  3,
  (b) => {
    b.tile(box(-0.8, -6, 0.8, 0), 0, "green", { look: "buis" });
    const bend = b.tile(box(-0.8, -7.6, 6, -6), 0, "green", {
      look: "buis",
      bumps: [{ c: [3.8, -6.8], r: 0.8, a: 0.045 }],
    });
    b.inset(bend, circle(2.4, -7.05, 0.42, 28), -0.04, "sand", { look: "gravier" });
    b.tee(0, -0.45, UP).cup(5.2, -6.8);
  },
  { hint: "La bande du fond renvoie vers le trou ; gare au gravier." },
);

// 3. La fontaine : un grand bassin rond au milieu, un étroit pont de bois tout droit vers le trou
const fontaine = hole(
  "La fontaine",
  3,
  (b) => {
    const C: Pt = [0, -6.5];
    const R = 3.2;
    const W = 1.3;
    // Le contour : l'allée d'entrée puis le grand rond
    const zc = Math.sqrt(R * R - 0.8 * 0.8);
    const a0 = Math.atan2(zc, 0.8);
    const a1 = Math.atan2(zc, -0.8) - Math.PI * 2;
    const outer: Pt[] = [[-0.8, 0], [0.8, 0], ...arc(C[0], C[1], R, a0, a1, 64)];
    // Le bassin, coupé en deux par le pont (x de -0,2 à 0,2)
    const t = Math.acos(0.2 / W);
    const aR = arcOpen(C, W, -t, t);
    const aB = arcOpen(C, W, t, Math.PI - t);
    const aL = arcOpen(C, W, Math.PI - t, Math.PI + t);
    const aT = arcOpen(C, W, Math.PI + t, Math.PI * 2 - t);
    const end = (a: number): Pt => [C[0] + Math.cos(a) * W, C[1] + Math.sin(a) * W];
    const basin = [...aR, ...aB, ...aL, ...aT];
    b.tile([outer, basin], 0, "green", { look: "buis" });
    b.tile([...aR, end(t)], -0.14, "water", { noRail: true, look: "bassin" });
    b.tile([...aL, end(Math.PI + t)], -0.14, "water", { noRail: true, look: "bassin" });
    b.tile([...aB, end(Math.PI - t), ...aT, end(Math.PI * 2 - t)], 0.0, "wood", { look: "pont" });
    b.deco("jets", C[0], C[1], { s: W });
    b.tee(0, -0.45, UP).cup(0, -9.1);
  },
  { hint: "Tout droit par le pont, ou le grand tour du bassin." },
);

/** Une grille qui pivote autour de son milieu */
function gate(c: Pt, len: number): Part[] {
  return [
    { k: "wall", a: [c[0] - len / 2, c[1]], b: [c[0] + len / 2, c[1]], y0: -1, y1: 0.62, t: 0.028 },
    { k: "post", c, r: 0.06, y0: -1, y1: 0.75 },
  ];
}

// 4. Les grilles : deux grilles de fer forgé qui tournent en travers de l'allée, en pente douce vers le trou
const grilles = hole(
  "Les grilles",
  3,
  (b) => {
    b.tile(box(-0.9, -11, 0.9, 0), ramp([0, 0], [0, -11], 0.22, 0), "green", { look: "buis" });
    b.mover({ motion: { k: "spin", c: [0, -3.6], w: 0.95 }, parts: gate([0, -3.6], 1.5), look: "grille" });
    b.mover({ motion: { k: "spin", c: [0, -7.1], w: -0.8, a0: 0.9 }, parts: gate([0, -7.1], 1.5), look: "grille" });
    b.tee(0, -0.45, UP).cup(0, -10.2);
  },
  { hint: "Attends que la grille s'ouvre." },
);

// 5. L'escalier : trois terrasses reliées par des rampes, deux bacs d'orangers sur le palier
const escalier = hole(
  "L'escalier",
  3,
  (b) => {
    b.strip(
      [
        [0, 0],
        [0, -12.5],
      ],
      1.7,
      [
        { len: 3.2, h0: 0, look: "pierre" },
        { len: 1.6, h1: 0.36, e: "s", look: "pierre" },
        { len: 2.8, look: "pierre" },
        { len: 1.6, h1: 0.72, e: "s", look: "pierre" },
        { len: 99, look: "pierre" },
      ],
    );
    b.post([-0.45, -6.2], 0.2, 0.5, { look: "oranger" }).post([0.45, -6.2], 0.2, 0.5, { look: "oranger" });
    b.tee(0, -0.45, UP).cup(0.25, -11.6);
  },
  { hint: "Assez fort pour monter les deux rampes, pas trop pour ne pas taper le fond." },
);

// 6. Le labyrinthe : des haies en zigzag ; trois brèches alignées pour les plus adroits
const labyrinthe = hole(
  "Le labyrinthe",
  4,
  (b) => {
    b.tile(box(-2.5, -6.6, 2.5, 0), 0, "green", { look: "buis" });
    const hedge = { look: "haie", t: 0.07 } as const;
    // Chaque haie a une brèche étroite en x = 0 (la balle y passe tout juste) et un grand passage d'un côté
    b.wall(
      [
        [-2.5, -1.7],
        [-0.15, -1.7],
      ],
      0.42,
      hedge,
    ).wall(
      [
        [0.15, -1.7],
        [1.35, -1.7],
      ],
      0.42,
      hedge,
    );
    b.wall(
      [
        [-1.35, -3.4],
        [-0.15, -3.4],
      ],
      0.42,
      hedge,
    ).wall(
      [
        [0.15, -3.4],
        [2.5, -3.4],
      ],
      0.42,
      hedge,
    );
    b.wall(
      [
        [-2.5, -5.1],
        [-0.15, -5.1],
      ],
      0.42,
      hedge,
    ).wall(
      [
        [0.15, -5.1],
        [1.35, -5.1],
      ],
      0.42,
      hedge,
    );
    b.tee(0, -0.45, UP).cup(0, -6.0);
  },
  { hint: "Le long chemin en zigzag, ou les trois brèches d'un seul coup." },
);

/** Les ailes du moulin : quatre bras, chacun avec sa toile, qui tournent face à l'allée */
function sails(hub: Pt, y: number): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Le bras, puis la toile décalée sur le côté
    parts.push({ k: "cap", a: [hub[0] + c * 0.12, y + s * 0.12, hub[1]], b: [hub[0] + c * 1.0, y + s * 1.0, hub[1]], r: 0.05 });
    const ox = -s * 0.11;
    const oy = c * 0.11;
    parts.push({
      k: "cap",
      a: [hub[0] + c * 0.38 + ox, y + s * 0.38 + oy, hub[1]],
      b: [hub[0] + c * 0.98 + ox, y + s * 0.98 + oy, hub[1]],
      r: 0.06,
    });
  }
  return parts;
}

// 7. Le moulin de l'orangerie : passer sous les ailes, par la porte du moulin, puis redescendre vers le trou
const moulin = hole(
  "Le moulin",
  3,
  (b) => {
    b.tile(box(-0.8, -7, 0.8, 0), 0, "green", { look: "buis" });
    b.tile(box(-0.25, -8.6, 0.25, -7), 0, "stone", { look: "porte" });
    b.tile(box(-1.4, -12, 1.4, -8.6), ramp([0, -8.6], [0, -9.7], 0, -0.25, "s"), "green", { look: "buis" });
    b.mover({ motion: { k: "wheel", c: [0, 1.05, -6.9], axis: [0, 1], w: 1.15 }, parts: sails([0, -6.9], 1.05), look: "moulin" });
    b.deco("moulin", 0, -7);
    b.tee(0, -0.45, UP).cup(0.55, -11.2);
  },
  { hint: "Les ailes passent devant la porte : vise le bon moment." },
);

// 8. Le canal : sauter par-dessus l'eau depuis le tremplin, ou faire le tour par le petit pont de bois
const canal = hole(
  "Le canal",
  4,
  (b) => {
    b.tile(box(-0.8, -5, 0.8, 0), 0, "green", { look: "buis" });
    b.tile(box(-0.8, -6.4, 0.8, -5), ramp([0, -5], [0, -6.4], 0, 0.3, "in"), "wood", { look: "tremplin" });
    // Le détour à gauche
    b.tile(box(-2.8, -5, -0.8, -3.6), 0, "green", { look: "buis" });
    b.tile(box(-2.8, -6.4, -2.2, -5), 0, "green", { look: "buis" });
    b.tile(box(-2.8, -8, -2.2, -6.4), 0.01, "wood", { look: "pont" });
    b.tile(box(-2.8, -9.5, -2.2, -8), 0, "green", { look: "buis" });
    b.tile(box(-2.8, -10.5, -1.2, -9.5), 0, "green", { look: "buis" });
    // Le canal, de part et d'autre du pont
    b.tile(box(-3.4, -8, -2.8, -6.4), -0.16, "water", { noRail: true, look: "canal" });
    b.tile(box(-2.2, -8, 3.4, -6.4), -0.16, "water", { noRail: true, look: "canal" });
    // L'île du trou
    b.tile(box(-1.2, -13, 1.2, -8), 0, "green", { look: "buis", bumps: [{ c: [0.5, -10.2], r: 0.7, a: 0.04 }] });
    b.link([0, -6.2], [0, -9.2]);
    b.tee(0, -0.45, UP).cup(0, -12);
  },
  { hint: "Le tremplin, plein élan : ou le pont, plus sûr et plus long." },
);

// 9. Le château : des bosses sur le grand gazon, une rampe vers la terrasse ; deux trous, l'un ou l'autre
const chateau = hole(
  "Le château",
  3,
  (b) => {
    b.tile(box(-2.5, -6, 2.5, 0), 0, "green", {
      look: "buis",
      bumps: [
        { c: [-1, -2.4], r: 0.75, a: 0.07 },
        { c: [1.1, -3.1], r: 0.8, a: 0.08 },
        { c: [-0.2, -4.6], r: 0.7, a: 0.06 },
      ],
    });
    b.tile(box(-0.7, -8, 0.7, -6), ramp([0, -6], [0, -8], 0, 0.42, "s"), "stone", { look: "pierre" });
    b.tile(box(-2.5, -11, 2.5, -8), 0.42, "green", { look: "buis" });
    // Le trou d'en bas, caché derrière une haie
    b.wall(
      [
        [-2.5, -4.2],
        [-1.25, -4.2],
        [-1.25, -5.45],
      ],
      0.42,
      { look: "haie", t: 0.07 },
    );
    b.post([0, -9.7], 0.36, 1.4, { look: "statue" });
    b.tee(0, -0.45, UP).cup(1.7, -10.3).cup(-2.0, -4.85);
  },
  { hint: "Deux trous : celui d'en bas, derrière la haie, ou celui de la terrasse." },
);

export const JARDIN: HoleDef[] = [allee, parterre, fontaine, grilles, escalier, labyrinthe, moulin, canal, chateau];
