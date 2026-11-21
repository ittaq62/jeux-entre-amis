// L'Atelier d'horloger : on joue dans le mécanisme d'une horloge géante, sur l'établi du maître. Le bois de l'établi,
// le laiton, l'acier, le cuir, l'émail du cadran ; des engrenages qui tournent (et qu'on peut chevaucher), des tapis
// roulants, des pendules, la porte du coucou, un sablier, un ressort, des pistons et les aiguilles du grand cadran.

import { hole, ramp } from "../build.ts";
import type { HoleDef, Part } from "../course.ts";
import { box, circle, ellipse, type Pt } from "../geom.ts";

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
    const t = b.tile(box(-0.9, -9.5, 0.9, 0), 0, "wood", { look: "etabli" });
    b.inset(t, ellipse(0.3, -3.2, 0.5, 0.85, 30), 0, "carpet", { look: "cuir" });
    b.post([-0.38, -4.6], 0.11, 0.22, { look: "vis" })
      .post([0.42, -6.1], 0.11, 0.22, { look: "vis" })
      .post([-0.25, -7.7], 0.11, 0.22, { look: "vis" });
    b.deco("loupe", 1.9, -6);
    b.tee(0, -0.45, UP).cup(0.1, -8.7);
  },
  { hint: "Le cuir freine la balle ; les vis la renvoient." },
);

// 2. Les engrenages : deux roues couchées tournent en sens contraire ; leurs dents balaient, leur plateau emporte
const engrenages = hole(
  "Les engrenages",
  3,
  (b) => {
    const floor = b.tile(box(-2.6, -11.2, 2.6, 0), 0, "metal", { look: "laiton" });
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

// 3. Les tapis roulants : un tapis qui aide, un qui emporte de côté, un qui ramène en arrière
const tapis = hole(
  "Les tapis roulants",
  4,
  (b) => {
    b.tile(box(-0.9, -3, 0.9, 0), 0, "wood", { look: "etabli" });
    b.tile(box(-0.9, -6.5, 0.9, -3), 0, "rubber", { look: "tapis", flow: { k: "belt", v: [0, -1.3] } });
    b.tile(box(-0.9, -8.3, 0.9, -6.5), 0, "wood", { look: "etabli" });
    b.tile(box(0.9, -8.3, 3.7, -6.5), 0, "rubber", { look: "tapis", flow: { k: "belt", v: [1.3, 0] } });
    b.tile(box(3.7, -8.3, 5.5, -6.5), 0, "wood", { look: "etabli" });
    b.tile(box(3.7, -11.3, 5.5, -8.3), 0, "rubber", { look: "tapis", flow: { k: "belt", v: [0, 0.9] } });
    b.tile(box(3.7, -13.1, 5.5, -11.3), 0, "wood", { look: "etabli" });
    b.tee(0, -0.45, UP).cup(4.6, -12.3);
  },
  { hint: "Le dernier tapis ramène la balle : il faut le remonter d'un bon coup." },
);

/** Un pendule : la lentille (un disque épais) au bout de sa tige, qui se balance en travers de l'allée */
function bob(z: number): Part[] {
  return [{ k: "cap", a: [0, 0.3, z - 0.12], b: [0, 0.3, z + 0.12], r: 0.3 }];
}

// 4. Les pendules : deux balanciers d'horloge traversent l'allée, chacun à son rythme
const pendules = hole(
  "Les pendules",
  3,
  (b) => {
    b.tile(box(-1.0, -11.2, 1.0, 0), 0, "wood", { look: "parquet" });
    b.mover({ motion: { k: "swing", c: [0, 3.1, -4.2], axis: [0, 1], amp: 0.5, w: 1.75 }, parts: bob(-4.2), look: "pendule", e: 0.6 });
    b.mover({
      motion: { k: "swing", c: [0, 3.1, -7.4], axis: [0, 1], amp: 0.5, w: 1.75, a0: 1.6 },
      parts: bob(-7.4),
      look: "pendule",
      e: 0.6,
    });
    b.tee(0, -0.45, UP).cup(0, -10.3);
  },
  { hint: "Passe quand la lentille est d'un côté : les deux pendules ne battent pas ensemble." },
);

// 5. Le coucou : la maison de l'horloge, sa porte qui se lève et retombe ; le trou est à l'intérieur
const coucou = hole(
  "Le coucou",
  3,
  (b) => {
    b.tile(box(-1.0, -7, 1.0, 0), 0, "wood", { look: "parquet" });
    b.tile(box(-1.7, -11.2, 1.7, -7), 0, "green", { look: "feutre" });
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
    const t = b.tile(box(-1.4, -11.2, 1.4, 0), 0, "wood", { look: "parquet" });
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
function piston(x: number, z: number, dir: number): Part[] {
  return [{ k: "wall", a: [x - dir * 1.0, z], b: [x, z], y0: -1, y1: 0.2, t: 0.12 }];
}

// 8. Les pistons : trois pistons sortent des deux bords, l'un après l'autre
const pistons = hole(
  "Les pistons",
  3,
  (b) => {
    b.tile(box(-1.0, -13, 1.0, 0), 0, "metal", { look: "acier" });
    for (const [z, side, a0] of [
      [-3.6, -1, 0],
      [-6.6, 1, 0.33],
      [-9.6, -1, 0.66],
    ] as const) {
      b.mover({
        motion: { k: "slide", d: [-side * 1.25, 0, 0], period: 3.2, a0, shape: "piston" },
        parts: piston(side * 1.0, z, -side),
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
    b.deco("cadran", c[0], c[1], { r: 3.0 });
    b.tee(0, -0.45, UP).cup(0, -8.8);
  },
  { hint: "Les aiguilles balaient tout le cadran : vise midi entre deux passages." },
);

export const HORLOGER: HoleDef[] = [etabli, engrenages, tapis, pendules, coucou, sablier, ressort, pistons, cadran];
