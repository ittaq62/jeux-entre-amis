// Bots de la bataille navale. Ils ne regardent que ce qu'un joueur humain verrait :
// les tirs, les épaves et les radars de leur camp, jamais la position des navires adverses.

import { random, randomInt, type RngHolder } from "../../rng.ts";
import {
  allies,
  cellIndex,
  cellX,
  cellY,
  FLEETS,
  neighbours,
  playerIndex,
  SHIP_LENGTH,
  shipCells,
  targetsOf,
  type BotLevel,
  type Dir,
  type NavalAction,
  type NavalPlayer,
  type NavalState,
  type Weapon,
} from "./engine.ts";

const UNKNOWN = 0;
const MISS = 1;
const HIT = 2; // touché, navire encore à flot
const SUNK = 3;
const EMPTY = 4; // le radar n'y a rien vu
const ECHO = 5; // le radar y a vu un navire

interface Knowledge {
  size: number;
  cells: Uint8Array;
  /** Longueurs des navires encore à flot */
  remaining: number[];
  touching: boolean;
}

function knowledge(s: NavalState, bot: NavalPlayer, target: NavalPlayer): Knowledge {
  const b = target.board;
  const size = b.size;
  const cells = new Uint8Array(size * size);
  const sunkCells = new Set<number>();
  for (const sh of b.ships) if (sh.sunk) for (const c of shipCells(size, sh)!) sunkCells.add(c);
  // Les tirs sont publics : on sait ce qui a touché, pas ce qu'il reste
  const hitCells = new Set(b.ships.flatMap((sh) => sh.hits));
  for (const c of b.shots) cells[c] = sunkCells.has(c) ? SUNK : hitCells.has(c) ? HIT : MISS;
  for (const sc of s.scans) {
    const scanner = s.players[playerIndex(s, sc.by)];
    if (sc.target !== target.id || !scanner || !allies(bot, scanner)) continue;
    for (const c of sc.cells) if (cells[c] === UNKNOWN) cells[c] = sc.found.includes(c) ? ECHO : EMPTY;
  }
  const sunkKinds = b.ships.filter((sh) => sh.sunk).map((sh) => sh.kind);
  const remaining = [...FLEETS[b.size]];
  for (const k of sunkKinds) remaining.splice(remaining.indexOf(k), 1);
  return { size, cells, remaining: remaining.map((k) => SHIP_LENGTH[k]), touching: s.settings.touching };
}

const open = (k: Knowledge, c: number) => k.cells[c] === UNKNOWN || k.cells[c] === ECHO;

function orthogonal(size: number, c: number): number[] {
  const x = cellX(size, c);
  const y = cellY(size, c);
  const out: number[] = [];
  if (x > 0) out.push(c - 1);
  if (x < size - 1) out.push(c + 1);
  if (y > 0) out.push(c - size);
  if (y < size - 1) out.push(c + size);
  return out;
}

/** Densité de probabilité : combien de positions possibles des navires restants couvrent chaque case. */
function density(k: Knowledge): Float64Array {
  const { size, cells } = k;
  const score = new Float64Array(size * size);
  const sunkNear = new Set<number>();
  if (!k.touching) for (let c = 0; c < cells.length; c++) if (cells[c] === SUNK) for (const n of neighbours(size, c)) sunkNear.add(n);
  for (const len of k.remaining) {
    for (const dir of ["h", "v"] as Dir[]) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const placed: number[] = [];
          let ok = true;
          let hits = 0;
          let echoes = 0;
          for (let i = 0; i < len; i++) {
            const cx = dir === "h" ? x + i : x;
            const cy = dir === "h" ? y : y + i;
            if (cx >= size || cy >= size) {
              ok = false;
              break;
            }
            const c = cellIndex(size, cx, cy);
            const st = cells[c];
            if (st === MISS || st === SUNK || st === EMPTY || sunkNear.has(c)) {
              ok = false;
              break;
            }
            if (st === HIT) hits++;
            if (st === ECHO) echoes++;
            placed.push(c);
          }
          if (!ok) continue;
          const weight = (1 + hits * 30) * (1 + echoes * 4);
          for (const c of placed) if (open(k, c)) score[c]! += weight;
        }
      }
    }
  }
  return score;
}

function bestCell(k: Knowledge, score: Float64Array, rng: RngHolder): number {
  let best = -1;
  let ties: number[] = [];
  for (let c = 0; c < score.length; c++) {
    if (!open(k, c)) continue;
    if (score[c]! > best) {
      best = score[c]!;
      ties = [c];
    } else if (score[c] === best) ties.push(c);
  }
  return ties.length > 0 ? ties[randomInt(rng, ties.length)]! : randomOpen(k, rng);
}

function randomOpen(k: Knowledge, rng: RngHolder): number {
  const cells = [...k.cells.keys()].filter((c) => open(k, c));
  return cells[randomInt(rng, cells.length)] ?? 0;
}

/** Cases à viser autour des touches pas encore coulées (poursuite). */
function huntAround(k: Knowledge): number[] {
  const { size, cells } = k;
  const hits = [...cells.keys()].filter((c) => cells[c] === HIT);
  if (hits.length === 0) return [];
  // Deux touches alignées : on prolonge la ligne
  for (const a of hits) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const bx = cellX(size, a) + dx;
      const by = cellY(size, a) + dy;
      if (bx >= size || by >= size || cells[cellIndex(size, bx, by)] !== HIT) continue;
      const line: number[] = [];
      for (const step of [-1, 1]) {
        let x = cellX(size, a);
        let y = cellY(size, a);
        while (x >= 0 && y >= 0 && x < size && y < size && cells[cellIndex(size, x, y)] === HIT) {
          x += dx * step;
          y += dy * step;
        }
        if (x >= 0 && y >= 0 && x < size && y < size && open(k, cellIndex(size, x, y))) line.push(cellIndex(size, x, y));
      }
      if (line.length > 0) return line;
    }
  }
  return hits.flatMap((c) => orthogonal(size, c)).filter((c) => open(k, c));
}

function chooseTarget(s: NavalState, bot: NavalPlayer, level: BotLevel): NavalPlayer | null {
  const targets = targetsOf(s, bot.id);
  if (targets.length === 0) return null;
  if (level === "mousse") return targets[randomInt(s, targets.length)]!;
  // On achève d'abord un navire touché, sinon on s'acharne sur la flotte la plus abîmée
  const wounded = targets.filter((t) => t.board.ships.some((sh) => !sh.sunk && sh.hits.length > 0));
  if (wounded.length > 0) return wounded[randomInt(s, wounded.length)]!;
  if (level === "amiral") {
    const fewest = Math.min(...targets.map((t) => t.board.ships.filter((sh) => !sh.sunk).length));
    const weakest = targets.filter((t) => t.board.ships.filter((sh) => !sh.sunk).length === fewest);
    return weakest[randomInt(s, weakest.length)]!;
  }
  return targets[randomInt(s, targets.length)]!;
}

/** Le meilleur centre pour une zone (radar 3×3 ou barrage en croix) selon la densité. */
function bestZone(k: Knowledge, score: Float64Array, shape: "square" | "cross"): { cell: number; value: number } {
  const { size } = k;
  let best = { cell: 0, value: -1 };
  for (let c = 0; c < size * size; c++) {
    const x = cellX(size, c);
    const y = cellY(size, c);
    let value = 0;
    let fresh = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (shape === "cross" && dx !== 0 && dy !== 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = cellIndex(size, nx, ny);
        if (k.cells[n] !== UNKNOWN) continue;
        value += score[n]!;
        fresh++;
      }
    }
    if (fresh > 0 && value > best.value) best = { cell: c, value };
  }
  return best;
}

function bestLine(k: Knowledge, score: Float64Array): { cell: number; dir: Dir } {
  const { size } = k;
  let best = { cell: 0, dir: "h" as Dir, value: -1 };
  for (let i = 0; i < size; i++) {
    for (const dir of ["h", "v"] as Dir[]) {
      let value = 0;
      let open_ = false;
      // La torpille s'arrête au premier navire : les premières cases comptent plus
      for (let j = 0; j < size; j++) {
        const c = dir === "h" ? cellIndex(size, j, i) : cellIndex(size, i, j);
        if (k.cells[c] === UNKNOWN || k.cells[c] === ECHO) open_ = true;
        value += score[c]! / (1 + j * 0.15);
      }
      if (open_ && value > best.value) best = { cell: dir === "h" ? cellIndex(size, 0, i) : cellIndex(size, i, 0), dir, value };
    }
  }
  return { cell: best.cell, dir: best.dir };
}

/** Le coup d'un bot (ou d'un joueur absent) pour son tour. */
export function botAction(s: NavalState, botId: string, level: BotLevel): NavalAction | null {
  const bot = s.players[playerIndex(s, botId)];
  if (!bot || s.phase !== "battle") return null;
  const target = chooseTarget(s, bot, level);
  if (!target) return null;
  const k = knowledge(s, bot, target);
  const hunting = huntAround(k);

  if (level === "mousse") {
    const cell = hunting.length > 0 && random(s) < 0.5 ? hunting[randomInt(s, hunting.length)]! : randomOpen(k, s);
    if (bot.arsenal.length > 0 && random(s) < 0.3) return useWeapon(bot, target.id, k, null, cell);
    return { type: "fire", target: target.id, cell };
  }

  if (level === "chasseur") {
    let cell: number;
    if (hunting.length > 0) cell = hunting[randomInt(s, hunting.length)]!;
    else {
      const echoes = [...k.cells.keys()].filter((c) => k.cells[c] === ECHO);
      const minLen = Math.min(...k.remaining);
      // Damier : un navire de longueur 2 ou plus touche forcément une case sur deux
      const parity = [...k.cells.keys()].filter((c) => open(k, c) && (cellX(k.size, c) + cellY(k.size, c)) % Math.max(2, minLen) === 0);
      const pool = echoes.length > 0 ? echoes : parity.length > 0 ? parity : [...k.cells.keys()].filter((c) => open(k, c));
      cell = pool[randomInt(s, pool.length)] ?? randomOpen(k, s);
    }
    if (bot.arsenal.length > 0 && random(s) < 0.4) return useWeapon(bot, target.id, k, null, cell);
    return { type: "fire", target: target.id, cell };
  }

  // Amiral : densité de probabilité, et les armes au meilleur endroit
  const score = density(k);
  if (bot.arsenal.length > 0) {
    const action = useWeapon(bot, target.id, k, score, null);
    if (action) return action;
  }
  return { type: "fire", target: target.id, cell: bestCell(k, score, s) };
}

function useWeapon(bot: NavalPlayer, target: string, k: Knowledge, score: Float64Array | null, cell: number | null): NavalAction | null {
  const scores = score ?? density(k);
  const hunting = huntAround(k).length > 0;
  const has = (w: Weapon) => bot.arsenal.includes(w);
  if (has("radar") && !hunting) return { type: "weapon", weapon: "radar", target, cell: bestZone(k, scores, "square").cell };
  if (has("barrage"))
    return {
      type: "weapon",
      weapon: "barrage",
      target,
      cell: score ? bestZone(k, scores, "cross").cell : (cell ?? bestZone(k, scores, "cross").cell),
    };
  if (has("torpedo") && !hunting) {
    const line = bestLine(k, scores);
    return { type: "weapon", weapon: "torpedo", target, cell: line.cell, dir: line.dir };
  }
  return cell === null ? null : { type: "fire", target, cell };
}

/** Un tir au hasard sur une case libre : pour le chrono écoulé. */
export function randomShot(s: NavalState, playerId: string): NavalAction | null {
  const me = s.players[playerIndex(s, playerId)];
  if (!me) return null;
  const targets = targetsOf(s, playerId);
  if (targets.length === 0) return null;
  const target = targets[randomInt(s, targets.length)]!;
  const shot = new Set(target.board.shots);
  const free = [...Array(target.board.size * target.board.size).keys()].filter((c) => !shot.has(c));
  return { type: "fire", target: target.id, cell: free[randomInt(s, free.length)]! };
}
