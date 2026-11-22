// Le compte des points, comme au vrai bowling : dix quilles par frame, deux boules pour les abattre ; un strike vaut
// 10 plus les deux boules suivantes, un spare 10 plus la boule suivante ; la dernière frame donne une ou deux boules de
// plus après un strike ou un spare. Une partie peut compter moins de dix frames (la dernière suit alors la règle de la
// dixième). Et les marques de la feuille : X, /, –, les splits entourés.

import { PIN_SPACING, ROW_SPACING, SPOT_OF } from "./lane.ts";

/** Les quilles abattues à chaque boule, frame par frame */
export type Rolls = number[][];

const sum = (a: readonly number[]) => a.reduce((s, x) => s + x, 0);

/** La frame est jouée jusqu'au bout */
export function frameDone(fr: readonly number[] | undefined, last: boolean): boolean {
  if (!fr || fr.length === 0) return false;
  if (!last) return fr[0] === 10 || fr.length >= 2;
  if (fr.length >= 3) return true;
  return fr.length === 2 && fr[0]! + fr[1]! < 10;
}

/** La boule suivante de cette frame part-elle d'un jeu complet (dix quilles) ? */
export function freshRack(fr: readonly number[], last: boolean): boolean {
  if (fr.length === 0) return true;
  if (!last) return false;
  if (fr.length === 1) return fr[0] === 10;
  // Troisième boule de la dernière frame : après deux strikes, ou après un spare
  const [a, b] = [fr[0]!, fr[1]!];
  return (a === 10 && b === 10) || (a < 10 && a + b === 10);
}

/** Le score cumulé à la fin de chaque frame (null tant qu'il attend des boules) */
export function frameScores(rolls: Rolls, frames: number): (number | null)[] {
  const flat: number[] = [];
  const starts: number[] = [];
  for (let f = 0; f < frames; f++) {
    starts.push(flat.length);
    flat.push(...(rolls[f] ?? []));
  }
  const out: (number | null)[] = [];
  let total = 0;
  let open = false;
  for (let f = 0; f < frames; f++) {
    const fr = rolls[f] ?? [];
    const last = f === frames - 1;
    if (open || !frameDone(fr, last)) {
      open = true;
      out.push(null);
      continue;
    }
    const i = starts[f]!;
    if (last) total += sum(fr);
    else if (fr[0] === 10) {
      if (flat.length < i + 3) open = true;
      else total += 10 + flat[i + 1]! + flat[i + 2]!;
    } else if (fr[0]! + fr[1]! === 10) {
      if (flat.length < i + 3) open = true;
      else total += 10 + flat[i + 2]!;
    } else total += fr[0]! + fr[1]!;
    out.push(open ? null : total);
  }
  return out;
}

/** Le score affiché : celui des frames déjà comptées */
export function currentScore(rolls: Rolls, frames: number): number {
  const s = frameScores(rolls, frames);
  let best = 0;
  for (const x of s) if (x !== null) best = x;
  return best;
}

/** Le meilleur score encore possible (tout le reste en strikes) */
export function maxPossible(rolls: Rolls, frames: number): number {
  const filled: Rolls = [];
  for (let f = 0; f < frames; f++) {
    const fr = [...(rolls[f] ?? [])];
    const last = f === frames - 1;
    while (!frameDone(fr, last)) fr.push(freshRack(fr, last) ? 10 : 10 - fr[fr.length - 1]!);
    filled.push(fr);
  }
  return frameScores(filled, frames)[frames - 1] ?? 0;
}

/** Les marques d'une frame sur la feuille : X, /, – ou le nombre de quilles */
export function frameMarks(fr: readonly number[], last: boolean): string[] {
  const out: string[] = [];
  for (let i = 0; i < fr.length; i++) {
    const n = fr[i]!;
    const prev = fr.slice(0, i);
    const fresh = freshRack(prev, last) || i === 0;
    if (fresh && n === 10) out.push("X");
    else if (!fresh && n + fr[i - 1]! === 10) out.push("/");
    else out.push(n === 0 ? "–" : String(n));
  }
  return out;
}

/** Deux quilles se touchent sur le triangle (voisines, ou l'une juste derrière l'autre) */
function linked(a: number, b: number): boolean {
  const p = SPOT_OF.get(a)!,
    q = SPOT_OF.get(b)!;
  const dx = Math.abs(p.x - q.x),
    dz = Math.abs(p.z - q.z);
  if (dx * dx + dz * dz <= PIN_SPACING * PIN_SPACING * 1.02) return true;
  return dx < 0.01 && dz <= 2 * ROW_SPACING + 0.01;
}

/**
 * Les quilles restantes forment un split : la quille de tête est tombée et il reste au moins deux quilles qui ne se
 * tiennent pas (un trou entre elles, comme le 7-10 ou le 4-6).
 */
export function isSplit(standing: readonly number[]): boolean {
  if (standing.length < 2 || standing.includes(1)) return false;
  const seen = new Set<number>([standing[0]!]);
  const todo = [standing[0]!];
  while (todo.length > 0) {
    const a = todo.pop()!;
    for (const b of standing) {
      if (!seen.has(b) && linked(a, b)) {
        seen.add(b);
        todo.push(b);
      }
    }
  }
  return seen.size < standing.length;
}

/** Le nom de ce qui reste, pour l'annoncer (« le 7-10 », « la quille 10 ») */
export function leaveName(standing: readonly number[]): string {
  if (standing.length === 0) return "";
  if (standing.length === 1) return `la quille ${standing[0]}`;
  return `le ${[...standing].sort((a, b) => a - b).join("-")}`;
}
