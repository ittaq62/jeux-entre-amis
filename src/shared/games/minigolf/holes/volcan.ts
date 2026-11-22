// Le Volcan : des allées de basalte noir au-dessus de la lave, qui avale la balle comme l'eau. La cendre qui freine,
// l'obsidienne qui glisse, des ponts de pierre, des geysers, des fumerolles qui soufflent, le marteau de la forge, un
// tunnel de lave, et le sommet, autour du lac de feu.

import { hole, ramp } from "../build.ts";
import type { HoleDef, Part } from "../course.ts";
import { box, circle, ellipse, laneSides, smooth, type Pt } from "../geom.ts";

const UP = -Math.PI / 2;
/** La lave, un peu plus bas que la roche : la balle y tombe */
const LAVA = -0.14;

/** Une allée de largeur 2·hw qui débouche sur un cercle (centre c, rayon r) par le côté des z croissants */
function laneIntoCircle(c: Pt, r: number, hw: number, top: number, n = 72): Pt[] {
  const t0 = Math.asin(hw / r);
  const pts: Pt[] = [[c[0] + hw, top]];
  for (let k = 0; k <= n; k++) {
    const a = Math.PI / 2 - t0 - ((Math.PI * 2 - 2 * t0) * k) / n;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  pts.push([c[0] - hw, top]);
  return pts;
}

// 1. Le sentier de cendre : le basalte, deux mares de lave à éviter, des plaques de cendre qui freinent
const sentier = hole(
  "Le sentier de cendre",
  2,
  (b) => {
    const t = b.tile(box(-1.0, -9.6, 1.0, 0), 0, "stone", { look: "basalte" });
    b.inset(t, ellipse(-0.52, -3.7, 0.34, 0.8, 30), LAVA, "lava", { look: "lave" });
    b.inset(t, ellipse(0.5, -6.5, 0.36, 0.85, 30), LAVA, "lava", { look: "lave" });
    b.inset(t, ellipse(0.35, -2.0, 0.4, 0.5, 24), 0, "dirt", { look: "cendre" });
    b.post([-0.45, -8.0], 0.19, 0.35, { look: "roche" });
    b.tee(0, -0.45, UP).cup(0.05, -8.7);
  },
  { hint: "La lave avale la balle : un coup de pénalité, et l'on rejoue d'où l'on était parti." },
);

// 2. La coulée : un fleuve de lave en travers ; un pont étroit tout droit, ou un pont plus large sur le côté
const coulee = hole(
  "La coulée",
  3,
  (b) => {
    b.tile(box(-1.4, -3.5, 1.4, 0), 0, "stone", { look: "basalte" });
    b.tile(box(-1.4, -7.5, -0.2, -3.5), LAVA, "lava", { look: "lave" });
    b.tile(box(-0.2, -7.5, 0.2, -3.5), 0, "stone", { look: "pont" });
    b.tile(box(0.2, -7.5, 0.6, -3.5), LAVA, "lava", { look: "lave" });
    b.tile(box(0.6, -7.5, 1.4, -3.5), 0, "stone", { look: "pont" });
    b.tile(box(-1.4, -12, 1.4, -7.5), 0, "stone", { look: "basalte" });
    b.post([0.5, -9.4], 0.22, 0.4, { look: "roche" });
    b.tee(0, -0.45, UP).cup(-0.6, -11);
  },
  { hint: "Le pont du milieu est étroit ; celui de droite, plus large, fait faire un détour." },
);

// 3. Les geysers : un geyser lance la balle par-dessus la lave jusqu'à l'île ; à gauche, une passerelle de pierre
const geysers = hole(
  "Les geysers",
  3,
  (b) => {
    b.tile(box(-1.2, -4.5, 1.2, 0), 0, "stone", { look: "basalte" });
    b.tile(box(-1.2, -6.5, -0.6, -4.5), 0, "stone", { look: "pont" });
    b.tile(box(-0.6, -6.5, 1.2, -4.5), LAVA, "lava", { look: "lave" });
    b.tile(box(-1.2, -11.2, 1.2, -6.5), 0, "stone", { look: "basalte" });
    b.pad([0.1, -3.7], 0.26, 3.6, { push: [0, -2.6], period: 3.2, on: 0.45, look: "geyser" });
    b.pad([-0.5, -8.4], 0.22, 2.4, { period: 2.6, on: 0.3, a0: 0.4, look: "geyser" });
    b.pad([0.6, -7.5], 0.22, 2.4, { period: 2.2, on: 0.3, a0: 0.7, look: "geyser" });
    b.link([0.1, -3.7], [0.1, -7.2]);
    b.tee(0, -0.45, UP).cup(0.3, -10.2);
  },
  { hint: "Le geyser jaillit par moments : passe dessus quand il souffle, il saute la lave. Sinon, la passerelle." },
);

// 4. Le lac de lave : un cirque de basalte autour d'un lac de feu ; le trou de l'autre côté
const lac = hole(
  "Le lac de lave",
  3,
  (b) => {
    const c: Pt = [0, -7.0];
    const ring = b.tile(laneIntoCircle(c, 3.2, 0.8, 0), 0, "stone", { look: "basalte" });
    b.inset(ring, circle(c[0], c[1], 1.35, 48), LAVA, "lava", { look: "lave" });
    b.post([-2.3, -7.4], 0.22, 0.4, { look: "roche" });
    b.post([2.2, -6.2], 0.2, 0.35, { look: "roche" });
    b.tee(0, -0.45, UP).cup(0, -9.6);
  },
  { hint: "Contourne le lac par la gauche ou par la droite ; une bande sur le bord peut aider." },
);

// 5. Les fumerolles : un sentier étroit qui serpente sur la lave ; des bouffées de vapeur poussent de côté
const fumerolles = hole(
  "Les fumerolles",
  4,
  (b) => {
    const path = smooth(
      [
        [0, 0],
        [0, -2.4],
        [0.8, -4.8],
        [-0.7, -7.8],
        [0, -10.6],
      ],
      0.25,
    );
    const { left, right } = laneSides(path, 1.4);
    b.tile([...left, ...[...right].reverse()], 0, "stone", { look: "basalte" });
    b.tile([[-2.2, 0], ...left, ...[...right].reverse(), [2.2, 0], [2.2, -11.6], [-2.2, -11.6]], LAVA, "lava", { look: "lave" });
    b.wind(box(-2.2, -4.4, 2.2, -3.4), [1.5, 0], { period: 3.0, on: 0.3, look: "vapeur" });
    b.wind(box(-2.2, -8.6, 2.2, -7.6), [-1.5, 0], { period: 3.4, on: 0.3, look: "vapeur" });
    b.tee(0, -0.45, UP).cup(0, -10.1);
  },
  { hint: "La vapeur pousse de côté par bouffées : passe entre deux, ou vise un peu contre." },
);

// 6. L'obsidienne : une dalle de verre noir qui descend et fait glisser la balle ; la cendre l'arrête en bas
const obsidienne = hole(
  "L'obsidienne",
  3,
  (b) => {
    b.tile(box(-1.0, -3, 1.0, 0), 0, "stone", { look: "basalte" });
    const slab = b.tile(box(-1.0, -8.5, 1.0, -3), ramp([0, -3], [0, -8.5], 0, -0.3), "glass", { look: "obsidienne" });
    b.inset(slab, circle(-0.42, -5.0, 0.3, 28), -0.42, "lava", { look: "lave" });
    b.inset(slab, circle(0.45, -7.0, 0.32, 28), -0.48, "lava", { look: "lave" });
    b.tile(box(-1.6, -12.2, 1.6, -8.5), -0.3, "dirt", { look: "cendre" });
    b.tee(0, -0.45, UP).cup(0.5, -10.9);
  },
  { hint: "L'obsidienne glisse et descend : un petit coup suffit, la cendre arrête la balle en bas." },
);

// 7. La forge : le marteau tombe en travers de l'allée ; derrière, l'enclume et la rigole de lave
const forge = hole(
  "La forge",
  3,
  (b) => {
    const t = b.tile(box(-1.0, -11.2, 1.0, 0), 0, "stone", { look: "dalle-forge" });
    const head: Part[] = [{ k: "cap", a: [-0.45, 0.24, -4.8], b: [0.45, 0.24, -4.8], r: 0.24 }];
    b.mover({ motion: { k: "swing", c: [0, 2.3, -4.8], axis: [1, 0], amp: 0.85, w: 1.4 }, parts: head, look: "marteau", e: 0.4 });
    b.boxWall(-0.38, -7.7, 0.38, -7.1, 0.45, { look: "enclume" });
    b.inset(t, box(-0.9, -9.8, -0.55, -8.0), LAVA, "lava", { look: "lave" });
    b.tee(0, -0.45, UP).cup(0.3, -10.2);
  },
  { hint: "Passe sous le marteau quand il remonte ; puis contourne l'enclume par la droite." },
);

// 8. Le tunnel de lave : du haut de la corniche, un tube de lave refroidie descend près du trou ; la rampe fait le tour
const tunnel = hole(
  "Le tunnel de lave",
  3,
  (b) => {
    b.tile(box(-1.0, -4.5, 1.0, 0), 0.5, "stone", { look: "basalte" });
    b.tile(box(1.0, -6.2, 1.8, -0.4), ramp([0, -0.4], [0, -6.2], 0.5, 0), "stone", { look: "basalte" });
    const cave = b.tile(box(-2.6, -12.2, 2.6, -6.2), 0, "dirt", { look: "cendre" });
    b.inset(cave, circle(0.5, -9.0, 0.7, 36), LAVA, "lava", { look: "lave" });
    const y = 0.5 + 0.055;
    b.rail(
      [
        [-0.5, y, -4.2],
        [-0.6, y - 0.05, -5.2],
        [-1.2, y - 0.25, -6.6],
        [-1.8, y - 0.45, -8.2],
        [-1.7, 0.055, -9.6],
      ],
      "tube-lave",
      0.25,
    );
    b.tee(0, -0.45, UP).cup(1.5, -11.2);
  },
  { hint: "Vise l'entrée du tunnel au bout de la corniche : il ressort tout près du trou. La rampe à droite fait le tour." },
);

// 9. Le sommet : on monte en lacets jusqu'au bord du cratère ; deux trous sur la crête, autour du lac de feu
const sommet = hole(
  "Le sommet",
  4,
  (b) => {
    const c: Pt = [0.2, -10.5];
    b.strip(
      [
        [0, 0],
        [0, -2.4],
        [1.8, -4.0],
        [1.8, -5.6],
        [0.2, -7.2],
        [0.2, -7.7],
      ],
      1.5,
      [
        { len: 1.6, h0: 0, look: "basalte", mat: "stone" },
        { len: 99, h1: 0.7, e: "s", look: "basalte", mat: "stone" },
      ],
    );
    const rim = b.tile(laneIntoCircle(c, 2.5, 0.75, -7.7), 0.7, "stone", { look: "basalte" });
    b.inset(rim, circle(c[0], c[1], 0.95, 44), 0.7 + LAVA, "lava", { look: "lave" });
    b.tee(0, -0.45, UP)
      .cup(c[0], c[1] - 1.75)
      .cup(c[0] - 1.65, c[1] - 0.2);
  },
  { hint: "La montée en lacets demande de l'élan. En haut, deux trous sur la crête, de part et d'autre du lac." },
);

export const VOLCAN: HoleDef[] = [sentier, coulee, geysers, lac, fumerolles, obsidienne, forge, tunnel, sommet];
