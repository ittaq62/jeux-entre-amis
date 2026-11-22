// Les billes en place au début d'une manche : le triangle de quinze (pleines et rayées, le Killer), le losange de neuf (la
// bille 9), les trois billes de la carambole. Comme dans un vrai triangle, les billes se touchent presque, à un ou deux
// millimètres près, au hasard : posées toutes pile au contact, elles se passeraient le choc de la casse l'une à l'autre
// comme un pendule (seules celles du fond partiraient) ; ces petits jours entre elles font éclater le triangle.

import { random, shuffle, type RngHolder } from "../../rng.ts";
import type { BallSpot } from "./shot.ts";
import type { Table } from "./table.ts";

const SQRT3_2 = 0.8660254037844386;
const GAP = 0.0001;
/** Le jeu de chaque bille autour de sa place */
const JIT = 0.0015;

/** Les billes un peu bougées, puis écartées là où elles se chevaucheraient (quelques passes, toujours dans le même ordre) */
function loosen(spots: [number, number][], R: number, rng: RngHolder): [number, number][] {
  const out = spots.map(([x, y]) => [x + (random(rng) - 0.5) * JIT, y + (random(rng) - 0.5) * JIT] as [number, number]);
  const min = 2 * R + 0.00003;
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!,
          b = out[j]!;
        const dx = b[0] - a[0],
          dy = b[1] - a[1];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= min || d === 0) continue;
        const push = (min - d) / 2 / d;
        a[0] -= dx * push;
        a[1] -= dy * push;
        b[0] += dx * push;
        b[1] += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/** Les places du triangle (ligne par ligne, depuis la pointe tournée vers la tête de la table) */
function triangleSpots(t: Table, rows: number, rng: RngHolder): [number, number][] {
  const d = 2 * t.R + GAP;
  const out: [number, number][] = [];
  for (let k = 0; k < rows; k++) {
    for (let j = 0; j <= k; j++) out.push([t.footSpot[0] + k * d * SQRT3_2, (j - k / 2) * d]);
  }
  return loosen(out, t.R, rng);
}

/** Pleines et rayées : la noire au milieu de la troisième rangée, une pleine et une rayée aux deux coins du fond */
export function rack8(t: Table, rng: RngHolder): BallSpot[] {
  const spots = triangleSpots(t, 5, rng);
  // Les places : 0 la pointe, 4 le milieu de la troisième rangée, 10 et 14 les coins du fond
  const solids = shuffle(rng, [1, 2, 3, 4, 5, 6, 7]);
  const stripes = shuffle(rng, [9, 10, 11, 12, 13, 14, 15]);
  const ids = new Array<number>(15).fill(0);
  ids[4] = 8;
  const solidCorner = random(rng) < 0.5;
  ids[10] = solidCorner ? solids.pop()! : stripes.pop()!;
  ids[14] = solidCorner ? stripes.pop()! : solids.pop()!;
  const rest = shuffle(rng, [...solids, ...stripes]);
  for (let i = 0; i < 15; i++) if (ids[i] === 0) ids[i] = rest.pop()!;
  return spots.map(([x, y], i) => ({ id: ids[i]!, x, y }));
}

/** Le Killer : les quinze billes au hasard dans le triangle */
export function rackKiller(t: Table, rng: RngHolder): BallSpot[] {
  const ids = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  return triangleSpots(t, 5, rng).map(([x, y], i) => ({ id: ids[i]!, x, y }));
}

/** La bille 9 : un losange, la 1 en pointe, la 9 au centre, les autres au hasard */
export function rack9(t: Table, rng: RngHolder): BallSpot[] {
  const d = 2 * t.R + GAP;
  // Les rangées du losange : 1, 2, 3, 2, 1
  const rows = [1, 2, 3, 2, 1];
  const grid: [number, number][] = [];
  rows.forEach((n, k) => {
    for (let j = 0; j < n; j++) grid.push([t.footSpot[0] + k * d * SQRT3_2, (j - (n - 1) / 2) * d]);
  });
  const spots = loosen(grid, t.R, rng);
  // Places : 0 la pointe, 4 le centre
  const rest = shuffle(rng, [2, 3, 4, 5, 6, 7, 8]);
  return spots.map(([x, y], i) => ({ id: i === 0 ? 1 : i === 4 ? 9 : rest.pop()!, x, y }));
}

/** La carambole : la rouge au point du haut, la bille de l'adversaire au point de départ, celle du joueur à côté sur la même ligne */
export function rackCarom(t: Table, breaker: 0 | 1): BallSpot[] {
  const other = breaker === 0 ? 1 : 0;
  return [
    { id: breaker, x: t.headSpot[0], y: -0.1825 },
    { id: other, x: t.headSpot[0], y: 0 },
    { id: 2, x: t.footSpot[0], y: 0 },
  ];
}

/** Une bille à remettre sur le point du bas (la noire tombée à la casse, la 9 tombée sur une faute) : sur le point, ou derrière s'il est pris */
export function respot(t: Table, balls: readonly BallSpot[], id: number): BallSpot {
  const clear = (x: number, y: number) =>
    balls.every((b) => b.id === id || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) >= 4 * t.R * t.R * 1.0001);
  const step = t.R / 4;
  for (let k = 0; k < 400; k++) {
    const x = t.footSpot[0] + k * step;
    if (x > t.lx - t.R) break;
    if (clear(x, 0)) return { id, x, y: 0 };
  }
  for (let k = 1; k < 400; k++) {
    const x = t.footSpot[0] - k * step;
    if (clear(x, 0)) return { id, x, y: 0 };
  }
  return { id, x: t.footSpot[0], y: 0 };
}
