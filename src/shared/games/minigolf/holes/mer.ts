// Le Bord de mer : au coucher du soleil, des pistes de planches et de gazon entre la plage et la mer, des cabines
// rayées, des châteaux de sable, une jetée au-dessus de l'eau, le phare, des crabes qui traversent et la vague qui
// repousse la balle.

import { hole, ramp } from "../build.ts";
import type { HoleDef, Part } from "../course.ts";
import { arc, box, circle, ellipse, type Pt } from "../geom.ts";

const UP = -Math.PI / 2;

// 1. La promenade : des planches toutes droites, deux flaques de sable et un ballon de plage
const promenade = hole(
  "La promenade",
  2,
  (b) => {
    const deck = b.tile(box(-0.8, -9, 0.8, 0), 0, "wood", { look: "planche" });
    b.inset(deck, circle(-0.35, -3.7, 0.3, 26), -0.012, "sand", { look: "plage" });
    b.inset(deck, circle(0.38, -6.4, 0.28, 26), -0.012, "sand", { look: "plage" });
    b.post([0.22, -5.0], 0.17, 0.34, { look: "ballon", e: 0.85 });
    b.tee(0, -0.45, UP).cup(-0.1, -8.2);
  },
  { hint: "Les planches filent vite : dose bien." },
);

// 2. Le château de sable : par la porte du château, ou par les côtés ensablés
const chateauSable = hole(
  "Le château de sable",
  3,
  (b) => {
    const g = b.tile(box(-1.6, -10, 1.6, 0), 0, "green", { look: "planche", bumps: [{ c: [0.6, -2.6], r: 0.8, a: 0.05 }] });
    b.inset(g, box(1.02, -6.4, 1.5, -4.4), -0.012, "sand", { look: "plage" });
    b.inset(g, box(-1.5, -6.4, -1.02, -4.4), -0.012, "sand", { look: "plage" });
    const castle = { look: "chateau", t: 0.05 } as const;
    b.block(box(-0.98, -6.2, -0.23, -4.6), 0.42, castle).block(box(0.23, -6.2, 0.98, -4.6), 0.42, castle);
    b.deco("chateau-sable", 0, -5.4);
    b.tee(0, -0.45, UP).cup(0.2, -8.7);
  },
  { hint: "La porte du château est étroite ; le sable, lui, freine." },
);

// 3. La jetée : une longue passerelle sans garde-fou au-dessus de la mer, deux bittes d'amarrage
const jetee = hole(
  "La jetée",
  3,
  (b) => {
    b.tile(box(-0.9, -2, 0.9, 0), 0, "wood", { look: "planche" });
    b.tile(box(-0.55, -9, 0.55, -2), 0, "wood", { look: "jetee", noRail: true });
    b.tile([...arc(0, -10.4, 1.5, 0, -Math.PI, 16), [-1.5, -9], [1.5, -9]] as Pt[], 0, "wood", { look: "planche" });
    // La mer de part et d'autre
    b.tile(box(-9, -9, -0.55, -2), -0.28, "water", { look: "mer", noRail: true });
    b.tile(box(0.55, -9, 9, -2), -0.28, "water", { look: "mer", noRail: true });
    b.post([-0.38, -4.6], 0.08, 0.3, { look: "bitte" }).post([0.38, -6.9], 0.08, 0.3, { look: "bitte" });
    b.tee(0, -0.45, UP).cup(0.55, -10.9);
  },
  { hint: "Pas de garde-fou sur la jetée : tout droit, ou à la mer." },
);

// 4. Les rochers : une crique de gazon semée de rochers, une flaque de marée au milieu
const rochers = hole(
  "Les rochers",
  3,
  (b) => {
    const g = b.tile(ellipse(0, -5.2, 2.1, 5.2, 48), 0, "green", {
      look: "planche",
      bumps: [
        { c: [1.0, -3.2], r: 0.7, a: 0.05 },
        { c: [-1.1, -6.4], r: 0.8, a: -0.04 },
      ],
    });
    b.inset(g, circle(0.15, -6.1, 0.48, 30), -0.18, "water", { look: "flaque" });
    b.post([-0.75, -3.1], 0.36, 0.5, { look: "rocher" })
      .post([0.95, -5.0], 0.42, 0.6, { look: "rocher" })
      .post([-0.55, -8.0], 0.38, 0.5, { look: "rocher" })
      .post([0.75, -8.9], 0.24, 0.4, { look: "rocher" });
    b.tee(0, -0.55, UP).cup(-0.05, -9.6);
  },
  { hint: "Les rochers renvoient la balle : sers-t'en." },
);

// 5. La vague : une vague qui monte et repousse tout ce qu'elle trouve vers le départ
const vague = hole(
  "La vague",
  3,
  (b) => {
    const g = b.tile(box(-0.9, -11, 0.9, 0), 0, "green", { look: "planche" });
    b.inset(g, box(-0.6, -8.7, 0.6, -8.2), -0.012, "sand", { look: "plage" });
    // Retirée, la vague dort sous le gazon (on passe par-dessus) ; elle monte en déferlant vers le départ, puis redescend
    const wave: Part[] = [{ k: "wall", a: [-0.86, -7.2], b: [0.86, -7.2], y0: -1.2, y1: -0.22, t: 0.06 }];
    b.mover({ motion: { k: "slide", d: [0, 0.38, 2.6], period: 5, shape: "piston" }, parts: wave, look: "vague", e: 0.45 });
    b.tee(0, -0.45, UP).cup(0, -10.1);
  },
  { hint: "Passe quand la vague se retire." },
);

// 6. Le phare : une allée qui monte en tournant autour du phare, jusqu'à sa terrasse
const phare = hole(
  "Le phare",
  4,
  (b) => {
    const C: Pt = [0, -6];
    // L'arc, puis un petit bout droit : le bord d'arrivée est bien perpendiculaire, la terrasse s'y raccorde
    const path: Pt[] = [...arc(C[0], C[1], 2.2, Math.PI / 2, -Math.PI, 40), [-2.2, -5.75]];
    b.strip(path, 1.4, [
      { len: 1.2, h0: 0, look: "planche" },
      { len: 8.4, h1: 0.5, e: "s", look: "planche" },
      { len: 99, look: "planche" },
    ]);
    b.tile(box(-2.9, -5.75, -1.5, -4.0), 0.5, "green", { look: "planche" });
    b.deco("phare", C[0], C[1]);
    b.tee(0.35, -3.8, [2.5, -4.4]).cup(-2.2, -4.55);
  },
  { hint: "Fais le tour du phare en montant, sans retomber au départ." },
);

/** Un parasol qui tourne : une barre sous la toile, et son mât */
function parasol(c: Pt, len: number): Part[] {
  return [
    { k: "wall", a: [c[0] - len, c[1]], b: [c[0] + len, c[1]], y0: -1, y1: 0.14, t: 0.04 },
    { k: "post", c, r: 0.06, y0: -1, y1: 1.4 },
  ];
}

// 7. Les cabines : un zigzag entre les cabines de plage, un parasol qui tourne au milieu
const cabines = hole(
  "Les cabines",
  3,
  (b) => {
    // La piste, surélevée au-dessus du sable, ses coins arrondis
    const r = 0.5;
    b.tile(
      [
        ...arc(-1.8 + r, -r, r, Math.PI, Math.PI / 2, 6),
        ...arc(1.8 - r, -r, r, Math.PI / 2, 0, 6),
        ...arc(1.8 - r, -11 + r, r, 0, -Math.PI / 2, 6),
        ...arc(-1.8 + r, -11 + r, r, -Math.PI / 2, -Math.PI, 6),
      ],
      0,
      "green",
      { look: "planche" },
    );
    const hut = { look: "cabine", t: 0.05 } as const;
    b.block(box(-1.76, -3.3, 0.35, -2.5), 0.9, hut)
      .block(box(-0.35, -6.4, 1.76, -5.6), 0.9, hut)
      .block(box(-1.76, -9.0, 0.15, -8.2), 0.9, hut);
    b.mover({ motion: { k: "spin", c: [0.75, -4.4], w: 1.3 }, parts: parasol([0.75, -4.4], 0.62), look: "parasol" });
    b.tee(-0.9, -0.45, UP).cup(1.0, -10.2);
  },
  { hint: "Entre les cabines, et gare au parasol.", outY: -0.38 },
);

// 8. Le crabe : un tremplin au-dessus du chenal, ou le banc de sable à droite ; deux crabes sur la plage du trou
const crabe = hole(
  "Le crabe",
  4,
  (b) => {
    b.tile(box(-0.9, -5, 0.9, 0), 0, "green", { look: "planche" });
    b.tile(box(-0.9, -6.2, 0.9, -5), ramp([0, -5], [0, -6.2], 0, 0.28, "in"), "wood", { look: "tremplin" });
    // Le détour par le banc de sable
    b.tile(box(0.9, -5, 2.4, -3.8), 0, "green", { look: "planche" });
    b.tile(box(1.6, -6.2, 2.4, -5), 0, "green", { look: "planche" });
    b.tile(box(1.6, -7.8, 2.4, -6.2), -0.01, "sand", { look: "plage" });
    // Le chenal
    b.tile(box(-3, -7.8, 1.6, -6.2), -0.26, "water", { look: "mer", noRail: true });
    b.tile(box(2.4, -7.8, 3, -6.2), -0.26, "water", { look: "mer", noRail: true });
    // La plage du trou, et ses crabes
    b.tile(box(-1.8, -13, 2.4, -7.8), 0, "green", { look: "planche" });
    b.mover({
      motion: { k: "slide", d: [1.7, 0, 0], period: 3.2 },
      parts: [{ k: "post", c: [-1.1, -9.6], r: 0.17, y0: -1, y1: 0.18 }],
      look: "crabe",
    });
    b.mover({
      motion: { k: "slide", d: [-1.6, 0, 0], period: 3.8, a0: 0.5 },
      parts: [{ k: "post", c: [1.2, -11.1], r: 0.17, y0: -1, y1: 0.18 }],
      look: "crabe",
    });
    b.link([0, -6.0], [0, -8.6]);
    b.tee(0, -0.45, UP).cup(0.3, -12.2);
  },
  { hint: "Saute le chenal, ou fais le tour par le banc de sable ; les crabes, eux, ne s'arrêtent jamais." },
);

// 9. La baie : une grande crique, des bouées qui renvoient fort, une bouteille à la mer qui mène tout près du trou
const baie = hole(
  "La baie",
  4,
  (b) => {
    const outline: Pt[] = [
      [-1, 0],
      [1, 0],
      [1.6, -3],
      [3.2, -5.8],
      [3.1, -10],
      [1.3, -12.6],
      [-1.5, -12.6],
      [-2.8, -9],
      [-1.7, -5],
      [-1.1, -2],
    ];
    const g = b.tile(outline, 0, "green", { look: "planche", bumps: [{ c: [0.3, -8.2], r: 1.1, a: 0.07 }] });
    b.inset(g, ellipse(-1.4, -7.4, 0.55, 0.9, 30), -0.012, "sand", { look: "plage" });
    b.inset(g, circle(2.2, -7.4, 0.45, 28), -0.2, "water", { look: "flaque" });
    b.bumper([0.6, -4.2], 0.17, 2.6, "bouee").bumper([-0.7, -6.4], 0.17, 2.6, "bouee").bumper([1.5, -9.2], 0.17, 2.6, "bouee");
    b.post([1.9, -10.4], 0.32, 0.5, { look: "rocher" });
    b.portal([2.5, -4.6], [-0.6, -10.6], Math.PI * 0.62, 0.2, "bouteille");
    b.tee(0, -0.45, UP).cup(2.3, -9.9).cup(-0.9, -11.7);
  },
  { hint: "Deux trous ; la bouteille à la mer, au fond à droite, en emmène tout près." },
);

export const MER: HoleDef[] = [promenade, chateauSable, jetee, rochers, vague, phare, cabines, crabe, baie];
