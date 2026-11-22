// L'Atelier d'horloger : on joue dans le mécanisme d'une horloge géante, sur l'établi du maître. Le bois de l'établi,
// le laiton, l'acier, le cuir, l'émail du cadran ; des engrenages qui tournent (et qu'on peut chevaucher), des tapis
// roulants, des pendules, la porte du coucou, un sablier, un ressort, des pistons et les aiguilles du grand cadran.

import { hole, ramp } from "../build.ts";
import type { HoleDef, Part } from "../course.ts";
import { arc, box, circle, ellipse, lanePath, laneSides, roundRect, smooth, type Pt } from "../geom.ts";

const UP = -Math.PI / 2;

/** Une allée de largeur 2·hw qui débouche sur un cercle (centre c, rayon r) par le côté des z croissants */
function laneIntoCircle(c: Pt, r: number, hw: number, top: number, n = 72): Pt[] {
  const t0 = Math.asin(hw / r);
  const pts: Pt[] = [[hw, top]];
  for (let k = 0; k <= n; k++) {
    const a = Math.PI / 2 - t0 - ((Math.PI * 2 - 2 * t0) * k) / n;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  pts.push([-hw, top]);
  return pts;
}

/** Les dents d'un engrenage couché : des murets qui rayonnent entre r0 et r1, et le moyeu au centre */
function gearTeeth(c: Pt, r0: number, r1: number, n: number): Part[] {
  const parts: Part[] = [{ k: "post", c, r: 0.16, y0: -1, y1: 0.32 }];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    parts.push({
      k: "wall",
      a: [c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0],
      b: [c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1],
      y0: -1,
      y1: 0.13,
      t: 0.06,
    });
  }
  return parts;
}

// 1. L'établi : tout droit sur le chêne, trois vis plantées, un sous-main de cuir qui freine
const etabli = hole(
  "L'établi",
  2,
  (b) => {
    const t = b.tile(roundRect(-0.9, -9.5, 0.9, 0, 0.5, 0.9), ramp([0, -0.9], [0, -2.1], 0.12, 0, "s"), "wood", { look: "etabli" });
    b.inset(t, ellipse(0.3, -3.2, 0.5, 0.85, 30), 0, "carpet", { look: "cuir" });
    b.post([-0.38, -4.6], 0.11, 0.22, { look: "vis" })
      .post([0.42, -6.1], 0.11, 0.22, { look: "vis" })
      .post([-0.25, -7.7], 0.11, 0.22, { look: "vis" });
    b.deco("loupe", 1.9, -6);
    b.tee(0, -0.45, UP).cup(0.1, -8.7);
  },
  { hint: "Le cuir freine la balle ; les vis la renvoient." },
);

// 2. Les engrenages : sur la platine d'un mouvement d'horloge, perlée et arrondie aux deux bouts, deux roues couchées
// tournent en sens contraire ; leurs dents balaient, leur plateau emporte ; le départ sur un petit gradin
const engrenages = hole(
  "Les engrenages",
  3,
  (b) => {
    const floor = b.tile(roundRect(-2.6, -11.2, 2.6, 0, 2.6, 2.6), ramp([0, -0.9], [0, -2.4], 0.12, 0, "s"), "metal", { look: "platine" });
    const ga: Pt = [-1.15, -4.3];
    const gb: Pt = [1.15, -7.5];
    b.inset(floor, circle(ga[0], ga[1], 0.9, 48), 0, "metal", { look: "engrenage", flow: { k: "spin", c: ga, w: 0.9 } });
    b.inset(floor, circle(gb[0], gb[1], 0.9, 48), 0, "metal", { look: "engrenage", flow: { k: "spin", c: gb, w: -0.9 } });
    b.mover({ motion: { k: "spin", c: ga, w: 0.9 }, parts: gearTeeth(ga, 0.92, 1.18, 12), look: "dents", e: 0.5 });
    b.mover({ motion: { k: "spin", c: gb, w: -0.9, a0: 0.26 }, parts: gearTeeth(gb, 0.92, 1.18, 12), look: "dents", e: 0.5 });
    b.tee(0, -0.45, UP).cup(-0.9, -10.2);
  },
  { hint: "Entre les deux roues, ou à cheval dessus : leur plateau tourne, leurs dents frappent." },
);

// 3. Les tapis roulants : du haut de l'estrade, une rampe mène au premier tapis (il aide) ; au coin arrondi, un tapis
// emporte de côté ; au second coin, le dernier ramène en arrière ; le trou attend au fond de l'arrondi
const tapis = hole(
  "Les tapis roulants",
  4,
  (b) => {
    b.tile(
      [...arc(-0.4, -0.5, 0.5, Math.PI, Math.PI / 2, 6), ...arc(0.4, -0.5, 0.5, Math.PI / 2, 0, 6), [0.9, -3], [-0.9, -3]],
      ramp([0, -1.0], [0, -2.6], 0.22, 0, "s"),
      "wood",
      { look: "etabli" },
    );
    b.tile(box(-0.9, -6.5, 0.9, -3), 0, "rubber", { look: "tapis", flow: { k: "belt", v: [0, -1.3] } });
    b.tile([[-0.9, -6.5], [0.9, -6.5], [0.9, -8.3], ...arc(-0.4, -7.8, 0.5, -Math.PI / 2, -Math.PI, 6)], 0, "wood", { look: "etabli" });
    b.tile(box(0.9, -8.3, 3.7, -6.5), 0, "rubber", { look: "tapis", flow: { k: "belt", v: [1.3, 0] } });
    b.tile([[3.7, -6.5], ...arc(5.0, -7.0, 0.5, Math.PI / 2, 0, 6), [5.5, -8.3], [3.7, -8.3]], 0, "wood", { look: "etabli" });
    b.tile(box(3.7, -11.3, 5.5, -8.3), 0, "rubber", { look: "tapis", flow: { k: "belt", v: [0, 0.9] } });
    b.tile([[3.7, -11.3], [5.5, -11.3], ...arc(4.6, -12.2, 0.9, 0, -Math.PI, 16)], 0, "wood", { look: "etabli" });
    b.tee(0, -0.45, UP).cup(4.6, -12.3);
  },
  { hint: "Le dernier tapis ramène la balle : il faut le remonter d'un bon coup." },
);

/** Un pendule : la lentille (un disque épais) au bout de sa tige, qui se balance en travers de l'allée */
function bob(z: number, x = 0, y = 0): Part[] {
  return [{ k: "cap", a: [x, 0.3 + y, z - 0.12], b: [x, 0.3 + y, z + 0.12], r: 0.3 }];
}

// 4. Les pendules : une passerelle de parquet part d'une estrade, descend palier après palier et dessine un S ; sur
// chaque palier, un balancier d'horloge la traverse à son rythme ; au bout, la coupelle ronde où attend le trou
const pendules = hole(
  "Les pendules",
  3,
  (b) => {
    const W = 2.0;
    const hw = W / 2;
    const C: Pt = [0.2, -10.35];
    const R = 1.12;
    const zIn = C[1] + Math.sqrt(R * R - hw * hw);
    const line = smooth(
      [
        [0, 0],
        [0, -0.8],
        [0, -3.0],
        [0, -4.8],
        [0.85, -6.6],
        [0.85, -8.2],
        [0.22, -9.3],
        [0.2, -9.6],
        [0.2, zIn],
      ],
      0.25,
    );
    const { left, right } = laneSides(line, W);
    const run = [0];
    for (let i = 1; i < line.length; i++) run.push(run[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]));
    const total = run[run.length - 1]!;
    // L'estrade du départ, deux paliers (un balancier sur chacun), la coupelle ; des pentes douces entre eux
    const keys: [number, number][] = [
      [0, 0.3],
      [0.08, 0.3],
      [0.22, 0.17],
      [0.47, 0.17],
      [0.58, 0.06],
      [0.82, 0.06],
      [0.92, 0],
      [1, 0],
    ];
    const hAt = (u: number) => {
      let k = 1;
      while (k < keys.length - 1 && keys[k]![0] < u) k++;
      const [u0, h0] = keys[k - 1]!;
      const [u1, h1] = keys[k]!;
      const t = Math.min(1, Math.max(0, (u - u0) / (u1 - u0 || 1)));
      return h0 + (h1 - h0) * t * t * (3 - 2 * t);
    };
    const aL = Math.atan2(zIn - C[1], -hw);
    const aR = Math.atan2(zIn - C[1], hw) + Math.PI * 2;
    const dish = arc(C[0], C[1], R, aL, aR, 40).slice(1, -1);
    b.tile(
      [...left, ...dish, ...[...right].reverse()],
      { k: "path", pts: [...line, C], hs: [...run.map((r) => hAt(r / total)), 0] },
      "wood",
      {
        look: "parquet",
      },
    );
    // Un balancier là où la passerelle file tout droit, sur son palier
    const pendulum = (z: number, a0: number) => {
      let i = 0;
      while (i < line.length - 1 && line[i]![1] > z) i++;
      const x = line[i]![0];
      const y = hAt(run[i]! / total);
      b.mover({
        motion: { k: "swing", c: [x, 3.1 + y, z], axis: [0, 1], amp: 0.5, w: 1.75, a0 },
        parts: bob(z, x, y),
        look: "pendule",
        e: 0.6,
      });
    };
    pendulum(-3.9, 0);
    pendulum(-7.4, 1.6);
    b.tee(0, -0.45, UP).cup(0.2, -10.45);
  },
  { hint: "Passe quand la lentille est d'un côté : les deux pendules ne battent pas ensemble." },
);

// 5. Le coucou : l'allée de parquet mène à la maison de l'horloge ; sa porte se lève et retombe ; le trou est à
// l'intérieur, dans la salle aux coins arrondis
const coucou = hole(
  "Le coucou",
  3,
  (b) => {
    b.tile(
      [...arc(-0.5, -0.5, 0.5, Math.PI, Math.PI / 2, 6), ...arc(0.5, -0.5, 0.5, Math.PI / 2, 0, 6), [1.0, -7], [-1.0, -7]],
      0,
      "wood",
      { look: "parquet" },
    );
    b.tile(
      [[-1.7, -7], [1.7, -7], ...arc(0.9, -10.4, 0.8, 0, -Math.PI / 2, 8), ...arc(-0.9, -10.4, 0.8, -Math.PI / 2, -Math.PI, 8)],
      0,
      "green",
      { look: "feutre" },
    );
    // La façade et sa porte, au milieu
    b.wall(
      [
        [-1.7, -7],
        [-0.45, -7],
      ],
      0.5,
      { look: "facade", t: 0.08 },
    );
    b.wall(
      [
        [0.45, -7],
        [1.7, -7],
      ],
      0.5,
      { look: "facade", t: 0.08 },
    );
    // La porte se lève, reste ouverte un moment, puis retombe
    const door: Part[] = [{ k: "wall", a: [-0.45, -7], b: [0.45, -7], y0: 0, y1: 0.5, t: 0.05 }];
    b.mover({ motion: { k: "slide", d: [0, 0.42, 0], period: 4.4, shape: "piston" }, parts: door, look: "porte", e: 0.4 });
    b.deco("coucou", 0, -7);
    b.tee(0, -0.45, UP).cup(0.7, -10.1);
  },
  { hint: "La porte se lève, le coucou chante : c'est le moment de passer." },
);

// 6. Le sablier : du sable en forme de sablier au milieu ; on le contourne par les côtés, ou on le traverse au col
const sablier = hole(
  "Le sablier",
  3,
  (b) => {
    const t = b.tile(roundRect(-1.4, -11.2, 1.4, 0, 0.7, 1.0), 0, "wood", { look: "parquet" });
    b.inset(
      t,
      [
        [-1.15, -2.2],
        [1.15, -2.2],
        [0.14, -5.6],
        [1.15, -9],
        [-1.15, -9],
        [-0.14, -5.6],
      ],
      0,
      "sand",
      { look: "sablier" },
    );
    b.deco("sablier", 0, -5.6);
    b.tee(0, -0.45, UP).cup(0, -10.2);
  },
  { hint: "Le sable avale l'élan : passe par les côtés, ou vise le col étroit au milieu." },
);

// 7. Le ressort : un ressort lance la balle par-dessus le vide jusqu'à l'étagère ; la rampe, à droite, est plus sûre
const ressort = hole(
  "Le ressort",
  3,
  (b) => {
    b.tile(box(-0.9, -4, 0.9, 0), 0, "wood", { look: "etabli" });
    b.tile(box(0.9, -5.2, 1.6, -1.5), ramp([0, -1.5], [0, -5.2], 0, 0.35), "wood", { look: "etabli" });
    b.tile(box(-1.6, -11.2, 1.6, -5.2), 0.35, "green", { look: "feutre" });
    b.pad([0, -3.3], 0.24, 4.0, { push: [0, -2.0], look: "ressort" });
    // Le bord de l'étagère, au-dessus du vide, n'a pas de bordure : la balle y atterrit
    b.open(box(-1.7, -5.3, 0.86, -5.1));
    b.post([0.7, -8.4], 0.2, 0.5, { look: "poids" });
    b.post([-0.8, -7.0], 0.2, 0.5, { look: "poids" });
    b.link([0, -3.3], [0, -6.2]);
    b.tee(0, -0.45, UP).cup(-0.5, -10.2);
  },
  { hint: "Le ressort saute le vide ; la rampe à droite monte doucement jusqu'à l'étagère." },
);

/** Un piston : une tige épaisse qui sort du bord de l'allée, et rentre */
function piston(x: number, z: number, dir: number, y = 0): Part[] {
  return [{ k: "wall", a: [x - dir * 1.0, z], b: [x, z], y0: -1, y1: y + 0.2, t: 0.12 }];
}

// 8. Les pistons : l'allée d'acier descend palier après palier ; sur chacun, un piston sort d'un bord, l'un après
// l'autre ; le trou au fond de l'arrondi
const pistons = hole(
  "Les pistons",
  3,
  (b) => {
    const lane = lanePath(
      [
        [0, 0],
        [0, -6],
        [0, -12],
      ],
      2.0,
      [
        [0, 0.36],
        [4.6, 0.36],
        [5.6, 0.24],
        [7.6, 0.24],
        [8.6, 0.12],
        [10.6, 0.12],
        [11.4, 0],
      ],
      { c: [0, -12], r: 1.0 },
    );
    b.tile(lane.ring, lane.h, "metal", { look: "acier" });
    for (const [z, side, a0] of [
      [-3.6, -1, 0],
      [-6.6, 1, 0.33],
      [-9.6, -1, 0.66],
    ] as const) {
      b.mover({
        motion: { k: "slide", d: [-side * 1.25, 0, 0], period: 3.2, a0, shape: "piston" },
        parts: piston(side * 1.0, z, -side, lane.hAt(-z)),
        look: "piston",
        e: 0.5,
      });
    }
    b.tee(0, -0.45, UP).cup(0, -12.2);
  },
  { hint: "Les pistons sortent l'un après l'autre : guette le moment où ton côté est libre." },
);

// 9. Le grand cadran : l'horloge couchée, ses deux aiguilles qui balaient l'émail ; le trou est à midi
const cadran = hole(
  "Le grand cadran",
  3,
  (b) => {
    const c: Pt = [0, -6.6];
    b.tile(laneIntoCircle(c, 3.0, 0.8, 0), 0, "stone", { look: "cadran" });
    const hand = (len: number, tail: number, t: number): Part[] => [
      { k: "wall", a: [c[0] - tail, c[1]], b: [c[0] + len, c[1]], y0: -1, y1: 0.13, t },
    ];
    b.mover({
      motion: { k: "spin", c, w: 0.55 },
      parts: [...hand(2.55, 0.45, 0.06), { k: "post", c, r: 0.16, y0: -1, y1: 0.36 }],
      look: "grande-aiguille",
      e: 0.5,
    });
    b.mover({ motion: { k: "spin", c, w: 0.16, a0: 2.2 }, parts: hand(1.7, 0.3, 0.08), look: "petite-aiguille", e: 0.5 });
    b.deco("cadran", c[0], c[1], { s: 3.0 });
    b.tee(0, -0.45, UP).cup(0, -8.8);
  },
  { hint: "Les aiguilles balaient tout le cadran : vise midi entre deux passages." },
);

export const HORLOGER: HoleDef[] = [etabli, engrenages, tapis, pendules, coucou, sablier, ressort, pistons, cadran];
