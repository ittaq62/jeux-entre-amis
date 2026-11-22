// La Base lunaire : la pesanteur y est trois fois plus faible, la balle saute loin et retombe lentement. Des passerelles
// de métal, le régolithe gris, un grand cratère, un tremplin au-dessus d'une crevasse, des téléporteurs, une antenne
// parabolique, le sas et ses deux portes, les dunes, le pas de tir et la base.

import { hole, radial, ramp, wave, type HoleBuilder } from "../build.ts";
import type { HoleDef, Part } from "../course.ts";
import { arc, box, circle, type Pt } from "../geom.ts";

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

// 1. Le module d'arrivée : la passerelle de métal qui descend du module (du palier à sa porte, par une rampe) jusqu'au
// dôme, entre les caisses
const module_ = hole(
  "Le module d'arrivée",
  2,
  (b) => {
    // Le palier à la porte du module, la rampe qui descend, la passerelle jusqu'au dôme (arrondie au bout)
    b.tile(box(-0.9, -1.0, 0.9, 0), 0.34, "metal", { look: "grille" });
    b.tile(box(-0.9, -3.0, 0.9, -1.0), ramp([0, -1.0], [0, -3.0], 0.34, 0, "s"), "metal", { look: "grille" });
    b.tile([[-0.9, -3.0], [0.9, -3.0], ...arc(0, -8.5, 0.9, 0, -Math.PI, 16)], 0, "metal", { look: "grille" });
    b.boxWall(-0.9, -4.7, -0.28, -4.05, 0.42, { look: "caisse" });
    b.boxWall(0.3, -6.9, 0.9, -6.25, 0.42, { look: "caisse" });
    b.deco("module", -3.4, -1.6);
    b.deco("dome", 0, -11.6, { s: 1.6 });
    b.tee(0, -0.45, UP).cup(0.05, -8.5);
  },
  { hint: "Sur la Lune, la balle est légère : elle va loin, et s'arrête lentement." },
);

// 2. Le cratère : un grand cirque où la balle descend et remonte ; le trou sur l'autre rive
const cratere = hole(
  "Le cratère",
  3,
  (b) => {
    const c: Pt = [0, -6.9];
    b.tile(laneIntoCircle(c, 3.4, 0.8, 0), radial(c, 0.5, 2.7, -0.6, 0, "s"), "moon", {
      look: "regolithe",
      bumps: [
        { c: [-2.1, -6.0], r: 0.45, a: -0.06 },
        { c: [1.9, -8.6], r: 0.4, a: -0.05 },
      ],
    });
    b.post([-0.9, -6.2], 0.22, 0.4, { look: "rocher" });
    b.post([1.1, -7.6], 0.18, 0.35, { look: "rocher" });
    b.tee(0, -0.45, UP).cup(0, -9.85);
  },
  { hint: "Le cratère ralentit la montée : vise l'autre rive, assez fort pour remonter." },
);

// 3. Le tremplin : au bout de la passerelle, un tremplin saute la crevasse ; une passerelle sans garde-fou la longe
const tremplin = hole(
  "Le tremplin",
  3,
  (b) => {
    b.tile(box(-0.9, -4, 0.9, 0), 0, "metal", { look: "grille" });
    b.tile(box(-0.9, -5.2, 0.9, -4), ramp([0, -4], [0, -5.2], 0, 0.35, "in"), "metal", { look: "tremplin" });
    b.tile(box(0.9, -8.6, 1.4, -1.0), 0, "metal", { look: "passerelle", noRail: true });
    b.tile(box(-1.8, -14, 1.8, -8.6), 0, "moon", { look: "regolithe" });
    b.open(box(-1.0, -5.4, 0.92, -5.0));
    b.open(box(-1.9, -8.8, 0.88, -8.4));
    b.link([0, -5.0], [0, -9.6]);
    b.deco("crevasse", 0, -6.9, { s: 3.4 });
    b.tee(0, -0.45, UP).cup(0.5, -12.6);
  },
  { hint: "Plein élan sur le tremplin : la Lune porte loin. La passerelle à droite n'a pas de garde-fou." },
);

// 4. Les téléporteurs : des plateformes isolées, reliées seulement par des téléporteurs
const teleporteurs = hole(
  "Les téléporteurs",
  3,
  (b) => {
    b.tile(box(-1.3, -3.4, 1.3, 0), 0, "metal", { look: "grille" });
    b.tile(box(-3.4, -8, -1.0, -5.4), 0.2, "metal", { look: "grille" });
    b.tile(box(1.0, -8, 3.4, -5.4), 0.2, "metal", { look: "grille" });
    b.tile(box(-1.1, -12.6, 1.1, -10.0), 0.4, "metal", { look: "grille" });
    b.portal([-0.65, -2.7], [-2.2, -5.9], UP, 0.2, "tele");
    b.portal([0.65, -2.7], [2.2, -5.9], UP, 0.2, "tele");
    b.portal([-2.2, -7.4], [-0.5, -10.4], UP + 0.25, 0.2, "tele");
    b.portal([2.2, -7.4], [0.5, -10.4], UP - 0.25, 0.2, "tele");
    // Les caisses qui gardent les téléporteurs des plateformes
    b.boxWall(-2.6, -6.75, -1.8, -6.5, 0.35, { look: "caisse" });
    b.boxWall(1.8, -6.75, 2.6, -6.5, 0.35, { look: "caisse" });
    b.tee(0, -0.45, UP).cup(0, -11.7);
  },
  { hint: "Rien ne relie les plateformes : un téléporteur, puis un autre, mène au trou." },
);

/** Les trois pieds de la parabole, qui tournent autour du trou */
function tripod(c: Pt, r: number): Part[] {
  const parts: Part[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    parts.push({ k: "post", c: [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r], r: 0.11, y0: -1, y1: 1.2 });
  }
  return parts;
}

// 5. La parabole : le sol est une grande antenne creuse ; le trou au fond, ses trois pieds tournent autour
const parabole = hole(
  "La parabole",
  3,
  (b) => {
    const c: Pt = [0, -6.6];
    b.tile(laneIntoCircle(c, 2.8, 0.8, 0), radial(c, 0.3, 2.6, -0.42, 0, "out"), "metal", { look: "parabole" });
    b.mover({ motion: { k: "spin", c, w: 0.7 }, parts: tripod(c, 1.05), look: "trepied", e: 0.6 });
    b.deco("antenne", c[0], c[1], { s: 2.8 });
    b.tee(0, -0.45, UP).cup(c[0], c[1]);
  },
  { hint: "Tout descend vers le trou ; ses trois pieds tournent autour." },
);

// 6. Le sas : deux portes qui se lèvent l'une après l'autre ; on attend dans la chambre entre les deux
const sas = hole(
  "Le sas",
  3,
  (b) => {
    b.tile(box(-0.9, -12.2, 0.9, 0), 0, "metal", { look: "grille" });
    const door = (z: number): Part[] => [{ k: "wall", a: [-0.9, z], b: [0.9, z], y0: 0, y1: 0.55, t: 0.07 }];
    b.mover({ motion: { k: "slide", d: [0, 0.5, 0], period: 5.2, shape: "piston" }, parts: door(-4.4), look: "porte-sas", e: 0.4 });
    b.mover({
      motion: { k: "slide", d: [0, 0.5, 0], period: 5.2, a0: 0.5, shape: "piston" },
      parts: door(-8.4),
      look: "porte-sas",
      e: 0.4,
    });
    b.deco("sas", 0, -6.4);
    b.tee(0, -0.45, UP).cup(0.1, -11.2);
  },
  { hint: "Une porte s'ouvre quand l'autre se ferme : attends dans le sas." },
);

// 7. Les dunes : le régolithe ondule en travers ; lancée trop vite, la balle s'envole d'une crête à l'autre
const dunes = hole(
  "Les dunes",
  3,
  (b) => {
    const dir: Pt = [0.3, -0.954];
    const len = 2.4;
    // Le départ dans un creux : là, le sol est plat
    const at: Pt = [0 - dir[0] * 0.75 * len, -0.45 - dir[1] * 0.75 * len];
    b.tile(box(-1.6, -13, 1.6, 0), wave(at, dir, len, 0.11), "moon", { look: "regolithe" });
    b.post([-0.7, -4.4], 0.2, 0.35, { look: "rocher" });
    b.post([0.8, -7.3], 0.24, 0.4, { look: "rocher" });
    b.post([-0.5, -10.0], 0.18, 0.3, { look: "rocher" });
    // Le trou au fond d'un creux, comme le départ
    b.tee(0, -0.45, UP).cup(0.4, -10.4);
  },
  { hint: "Les dunes font sauter la balle : moins fort qu'on ne croit." },
);

// 8. Le pas de tir : le trou est sur la plateforme de lancement ; un propulseur y envoie la balle, la rampe y monte
const pasDeTir = hole(
  "Le pas de tir",
  3,
  (b) => {
    b.tile(box(-0.9, -5, 0.9, 0), 0, "metal", { look: "grille" });
    b.tile(box(0.9, -6.6, 1.6, -0.6), ramp([0, -0.6], [0, -6.6], 0, 0.8), "metal", { look: "grille" });
    b.tile(box(-1.6, -12.6, 1.6, -6.6), 0.8, "metal", { look: "pas-de-tir" });
    b.pad([0, -4.2], 0.25, 3.3, { push: [0, -1.0], look: "propulseur" });
    b.open(box(-1.7, -6.7, 0.88, -6.5));
    b.link([0, -4.2], [0, -7.6]);
    b.deco("fusee", -1.9, -9.2);
    b.tee(0, -0.45, UP).cup(0.3, -9.6);
  },
  { hint: "Le propulseur lance la balle très haut : sur la Lune, elle retombe lentement sur la plateforme." },
);

/** Les dômes de la base : un mur rond (le dôme lui-même est dessiné par le thème) */
function dome(b: HoleBuilder, c: Pt, r: number) {
  b.block(circle(c[0], c[1], r, 32), 0.6, { look: "dome" });
}

// 9. La base : les dômes, l'antenne radar qui balaie, et un téléporteur qui ramène près du trou
const base = hole(
  "La base",
  4,
  (b) => {
    b.tile(box(-3.0, -13.2, 3.0, 0), 0, "metal", { look: "dalle-base" });
    dome(b, [-1.7, -4.6], 0.85);
    dome(b, [1.6, -7.4], 1.0);
    dome(b, [-1.4, -10.4], 0.8);
    const rc: Pt = [0.8, -3.0];
    const radar: Part[] = [
      { k: "wall", a: [rc[0], rc[1]], b: [rc[0] + 1.4, rc[1]], y0: -1, y1: 0.16, t: 0.06 },
      { k: "post", c: rc, r: 0.18, y0: -1, y1: 0.9 },
    ];
    b.mover({ motion: { k: "spin", c: rc, w: -0.9 }, parts: radar, look: "radar", e: 0.5 });
    b.portal([-2.4, -1.3], [2.1, -10.6], UP - 0.3, 0.2, "tele");
    b.tee(0.6, -0.45, UP).cup(1.0, -12.0);
  },
  { hint: "Contourne les dômes, ou prends le téléporteur à gauche du départ." },
);

export const LUNE: HoleDef[] = [module_, cratere, tremplin, teleporteurs, parabole, sas, dunes, pasDeTir, base];
