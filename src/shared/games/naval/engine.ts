// Moteur de la bataille navale : pur, deterministe (graine), sans notion de temps.
// La salle de jeu s'occupe des chronos et des bots ; ici on ne fait qu'appliquer les regles.

import { randomInt, type RngHolder } from "../../rng.ts";

export type GridSize = 8 | 10 | 12;
export type ShotRule = "single" | "replay" | "salvo";
export type BotLevel = "mousse" | "chasseur" | "amiral";
export type Weapon = "radar" | "torpedo" | "barrage";
export type Dir = "h" | "v";
export type NavalMode = "duel" | "melee" | "teams";

export interface NavalSettings {
  grid: GridSize;
  shots: ShotRule;
  /** Navires autorisés à se toucher */
  touching: boolean;
  /** Armes spéciales gagnées en coulant un navire */
  arsenal: boolean;
  /** 2 contre 2 (seulement à 4 joueurs) */
  teams: boolean;
  /** Temps par tir, 0 = illimité */
  turnSeconds: number;
  botLevel: BotLevel;
}

export const DEFAULT_SETTINGS: NavalSettings = {
  grid: 10,
  shots: "replay",
  touching: false,
  arsenal: false,
  teams: false,
  turnSeconds: 30,
  botLevel: "chasseur",
};

export const GRID_SIZES: GridSize[] = [8, 10, 12];
export const TURN_SECONDS = [15, 30, 60, 0] as const;

export type ShipKind = "porte-avions" | "cuirasse" | "croiseur" | "contre-torpilleur" | "sous-marin" | "torpilleur";

export const SHIP_LENGTH: Record<ShipKind, number> = {
  "porte-avions": 5,
  cuirasse: 4,
  croiseur: 4,
  "contre-torpilleur": 3,
  "sous-marin": 3,
  torpilleur: 2,
};

export const SHIP_NAME: Record<ShipKind, string> = {
  "porte-avions": "porte-avions",
  cuirasse: "cuirassé",
  croiseur: "croiseur",
  "contre-torpilleur": "contre-torpilleur",
  "sous-marin": "sous-marin",
  torpilleur: "torpilleur",
};

/** La flotte de chaque taille de grille, du plus grand au plus petit navire. */
export const FLEETS: Record<GridSize, ShipKind[]> = {
  8: ["croiseur", "contre-torpilleur", "sous-marin", "torpilleur"],
  10: ["porte-avions", "croiseur", "contre-torpilleur", "sous-marin", "torpilleur"],
  12: ["porte-avions", "cuirasse", "croiseur", "contre-torpilleur", "sous-marin", "torpilleur"],
};

export const WEAPON_CYCLE: Weapon[] = ["radar", "torpedo", "barrage"];
export const ARSENAL_MAX = 3;

export interface Placement {
  kind: ShipKind;
  x: number;
  y: number;
  dir: Dir;
}

export interface Ship extends Placement {
  id: number;
  /** Cases du navire déjà touchées */
  hits: number[];
  sunk: boolean;
}

export interface Board {
  size: GridSize;
  ships: Ship[];
  /** Cases déjà visées sur ce plateau, dans l'ordre des tirs */
  shots: number[];
}

/** Passage du radar : visible seulement par l'équipe du tireur */
export interface Scan {
  by: string;
  target: string;
  cells: number[];
  found: number[];
}

export interface NavalStats {
  shots: number;
  hits: number;
  sunk: number;
  lost: number;
  weapons: number;
  bestStreak: number;
  streak: number;
}

export interface NavalPlayer {
  id: string;
  /** Équipe 0 ou 1 en mode équipes, sinon null */
  team: number | null;
  board: Board;
  ready: boolean;
  /** Flotte entièrement coulée */
  out: boolean;
  arsenal: Weapon[];
  weaponsGained: number;
  stats: NavalStats;
}

export interface NavalState {
  settings: NavalSettings;
  players: NavalPlayer[];
  phase: "placement" | "battle" | "gameOver";
  turn: number;
  /** Change à chaque occasion de tirer : sert aux chronos */
  turnId: number;
  /** Tirs restants dans ce tour (salve), sinon 1 */
  shotsLeft: number;
  scans: Scan[];
  /** Ordre des éliminations (joueur ou, en équipes, chaque joueur de l'équipe) */
  eliminated: string[];
  /** Classement final, gagnant(s) d'abord */
  ranking: string[] | null;
  ranks: Record<string, number> | null;
  rng: number;
}

export type ShotResult = "miss" | "hit" | "sunk";

export type NavalEvent =
  | { type: "ready"; player: string }
  | { type: "battle"; first: string }
  | {
      type: "shot";
      by: string;
      target: string;
      cell: number;
      result: ShotResult;
      /** Navire révélé quand il coule */
      ship?: Placement;
      weapon?: Weapon;
      /** Trajet d'une torpille, case de départ comprise */
      path?: number[];
    }
  | { type: "scan"; by: string; target: string; cells: number[]; found: number[] | null }
  | { type: "weapon"; player: string; weapon: Weapon }
  | { type: "eliminated"; player: string }
  | { type: "turn"; player: string; shots: number }
  | { type: "gameOver"; ranking: string[] };

export type NavalAction =
  | { type: "place"; ships: Placement[] }
  | { type: "ready"; ships?: Placement[] }
  | { type: "fire"; target: string; cell: number }
  | { type: "weapon"; weapon: Weapon; target: string; cell: number; dir?: Dir };

export type ActionResult = { ok: true; events: NavalEvent[] } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

export const cellIndex = (size: number, x: number, y: number) => y * size + x;
export const cellX = (size: number, cell: number) => cell % size;
export const cellY = (size: number, cell: number) => Math.floor(cell / size);

/** Cases occupées par un navire, ou null s'il sort de la grille. */
export function shipCells(size: number, p: Placement): number[] | null {
  const len = SHIP_LENGTH[p.kind];
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0) return null;
  if (p.dir === "h" ? p.x + len > size || p.y >= size : p.y + len > size || p.x >= size) return null;
  return Array.from({ length: len }, (_, i) => (p.dir === "h" ? cellIndex(size, p.x + i, p.y) : cellIndex(size, p.x, p.y + i)));
}

/** Les 8 voisines d'une case (pour interdire les navires collés). */
export function neighbours(size: number, cell: number): number[] {
  const x = cellX(size, cell);
  const y = cellY(size, cell);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(cellIndex(size, nx, ny));
    }
  }
  return out;
}

/** Vérifie une flotte complète ; renvoie le problème, ou null si elle est valable. */
export function validateFleet(size: GridSize, placements: Placement[], touching: boolean): string | null {
  const expected = [...FLEETS[size]].sort();
  const given = placements.map((p) => p.kind).sort();
  if (expected.length !== given.length || expected.some((k, i) => k !== given[i])) return "La flotte n'est pas complète.";
  const owner = new Map<number, number>();
  for (const [i, p] of placements.entries()) {
    if (p.dir !== "h" && p.dir !== "v") return "Sens de navire invalide.";
    const cells = shipCells(size, p);
    if (!cells) return "Un navire dépasse de la grille.";
    for (const c of cells) {
      if (owner.has(c)) return "Deux navires se chevauchent.";
      owner.set(c, i);
    }
  }
  if (!touching) {
    for (const [c, i] of owner) {
      if (neighbours(size, c).some((n) => owner.has(n) && owner.get(n) !== i)) return "Les navires ne doivent pas se toucher.";
    }
  }
  return null;
}

/** Une flotte tirée au hasard, toujours valable. */
export function randomFleet(size: GridSize, touching: boolean, rng: RngHolder): Placement[] {
  for (let attempt = 0; attempt < 400; attempt++) {
    const placed: Placement[] = [];
    const taken = new Set<number>();
    const blocked = new Set<number>();
    let ok = true;
    for (const kind of FLEETS[size]) {
      let done = false;
      for (let tries = 0; tries < 200 && !done; tries++) {
        const dir: Dir = randomInt(rng, 2) === 0 ? "h" : "v";
        const p: Placement = { kind, dir, x: randomInt(rng, size), y: randomInt(rng, size) };
        const cells = shipCells(size, p);
        if (!cells || cells.some((c) => taken.has(c) || blocked.has(c))) continue;
        placed.push(p);
        for (const c of cells) {
          taken.add(c);
          if (!touching) for (const n of neighbours(size, c)) blocked.add(n);
        }
        done = true;
      }
      if (!done) {
        ok = false;
        break;
      }
    }
    if (ok) return placed;
  }
  throw new Error("Impossible de placer la flotte");
}

function toShips(placements: Placement[]): Ship[] {
  return placements.map((p, id) => ({ ...p, id, hits: [], sunk: false }));
}

function shipAt(board: Board, cell: number): Ship | undefined {
  return board.ships.find((s) => shipCells(board.size, s)!.includes(cell));
}

const afloat = (board: Board) => board.ships.filter((s) => !s.sunk).length;

// ---------------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------------

export function modeOf(s: Pick<NavalState, "settings" | "players">): NavalMode {
  if (s.settings.teams && s.players.length === 4) return "teams";
  return s.players.length === 2 ? "duel" : "melee";
}

export function createGame(playerIds: string[], settings: NavalSettings, seed: number): { state: NavalState; events: NavalEvent[] } {
  const holder = { rng: seed };
  const teams = settings.teams && playerIds.length === 4;
  const state: NavalState = {
    settings: { ...settings, teams },
    players: playerIds.map((id, i) => ({
      id,
      team: teams ? i % 2 : null,
      board: { size: settings.grid, ships: toShips(randomFleet(settings.grid, settings.touching, holder)), shots: [] },
      ready: false,
      out: false,
      arsenal: [],
      weaponsGained: 0,
      stats: { shots: 0, hits: 0, sunk: 0, lost: 0, weapons: 0, bestStreak: 0, streak: 0 },
    })),
    phase: "placement",
    turn: 0,
    turnId: 0,
    shotsLeft: 1,
    scans: [],
    eliminated: [],
    ranking: null,
    ranks: null,
    rng: holder.rng,
  };
  return { state, events: [] };
}

export function playerIndex(s: NavalState, id: string): number {
  return s.players.findIndex((p) => p.id === id);
}

export const allies = (a: NavalPlayer, b: NavalPlayer) => a.id === b.id || (a.team !== null && a.team === b.team);

/** Une équipe (ou un joueur seul) a-t-elle encore un navire à flot ? */
function sideAlive(s: NavalState, p: NavalPlayer): boolean {
  return s.players.some((q) => allies(p, q) && !q.out);
}

/** Plateaux qu'un joueur peut viser. */
export function targetsOf(s: NavalState, shooterId: string): NavalPlayer[] {
  const me = s.players[playerIndex(s, shooterId)];
  if (!me) return [];
  return s.players.filter((p) => !allies(me, p) && !p.out);
}

function shotsFor(s: NavalState, p: NavalPlayer): number {
  if (s.settings.shots !== "salvo") return 1;
  const side = s.players.filter((q) => allies(p, q));
  return Math.max(
    1,
    side.reduce((n, q) => n + afloat(q.board), 0),
  );
}

function startTurn(s: NavalState, index: number, events: NavalEvent[]) {
  s.turn = index;
  s.turnId += 1;
  const p = s.players[index]!;
  s.shotsLeft = shotsFor(s, p);
  events.push({ type: "turn", player: p.id, shots: s.shotsLeft });
}

function passTurn(s: NavalState, events: NavalEvent[]) {
  const n = s.players.length;
  for (let step = 1; step <= n; step++) {
    const i = (s.turn + step) % n;
    // Une flotte au fond ne tire plus, même en équipes : le coéquipier finit seul
    if (!s.players[i]!.out) return startTurn(s, i, events);
  }
}

function startBattle(s: NavalState, events: NavalEvent[]) {
  s.phase = "battle";
  const first = randomInt(s, s.players.length);
  events.push({ type: "battle", first: s.players[first]!.id });
  startTurn(s, first, events);
}

function checkOver(s: NavalState, events: NavalEvent[]): boolean {
  const alive = s.players.filter((p) => !p.out);
  const sides = new Set(alive.map((p) => (p.team !== null ? `t${p.team}` : p.id)));
  if (sides.size > 1) return false;
  s.phase = "gameOver";
  // En équipes, le coéquipier coulé gagne avec celui qui a tenu
  const winners = s.players.filter((p) => alive.some((a) => allies(a, p)));
  const losers = [...s.eliminated].reverse().filter((id) => !winners.some((w) => w.id === id));
  // Ceux qui n'ont pas encore été comptés (sécurité)
  for (const p of s.players) if (!winners.includes(p) && !losers.includes(p.id)) losers.push(p.id);
  s.ranking = [...winners.map((w) => w.id), ...losers];
  s.ranks = {};
  if (s.settings.teams) {
    for (const w of winners) s.ranks[w.id] = 1;
    for (const id of losers) s.ranks[id] = winners.length + 1;
  } else {
    s.ranking.forEach((id, i) => (s.ranks![id] = i + 1));
  }
  events.push({ type: "gameOver", ranking: s.ranking });
  return true;
}

/** Tire sur une case et applique toutes les conséquences, sauf le passage de tour. */
function resolveShot(
  s: NavalState,
  shooter: NavalPlayer,
  target: NavalPlayer,
  cell: number,
  events: NavalEvent[],
  weapon?: Weapon,
  path?: number[],
): ShotResult {
  const board = target.board;
  board.shots.push(cell);
  shooter.stats.shots += 1;
  const ship = shipAt(board, cell);
  let result: ShotResult = "miss";
  if (ship) {
    ship.hits.push(cell);
    shooter.stats.hits += 1;
    shooter.stats.streak += 1;
    shooter.stats.bestStreak = Math.max(shooter.stats.bestStreak, shooter.stats.streak);
    result = "hit";
    if (ship.hits.length >= SHIP_LENGTH[ship.kind]) {
      ship.sunk = true;
      result = "sunk";
      shooter.stats.sunk += 1;
      target.stats.lost += 1;
    }
  } else {
    shooter.stats.streak = 0;
  }
  events.push({
    type: "shot",
    by: shooter.id,
    target: target.id,
    cell,
    result,
    ...(result === "sunk" && ship ? { ship: { kind: ship.kind, x: ship.x, y: ship.y, dir: ship.dir } } : {}),
    ...(weapon ? { weapon } : {}),
    ...(path ? { path } : {}),
  });
  if (result === "sunk") {
    if (s.settings.arsenal && shooter.arsenal.length < ARSENAL_MAX) {
      const gained = WEAPON_CYCLE[shooter.weaponsGained % WEAPON_CYCLE.length]!;
      shooter.weaponsGained += 1;
      shooter.arsenal.push(gained);
      events.push({ type: "weapon", player: shooter.id, weapon: gained });
    }
    if (board.ships.every((sh) => sh.sunk)) {
      target.out = true;
      // En équipes, on note les deux joueurs quand l'équipe tombe
      if (target.team === null) {
        s.eliminated.push(target.id);
        events.push({ type: "eliminated", player: target.id });
      } else if (!sideAlive(s, target)) {
        for (const q of s.players) {
          if (q.team === target.team) {
            s.eliminated.push(q.id);
            events.push({ type: "eliminated", player: q.id });
          }
        }
      }
    }
  }
  return result;
}

function checkTarget(s: NavalState, shooter: NavalPlayer, targetId: string): NavalPlayer | string {
  const target = s.players[playerIndex(s, targetId)];
  if (!target) return "Cible introuvable.";
  if (allies(shooter, target)) return "On ne tire pas sur sa propre flotte.";
  if (target.out) return "Cette flotte est déjà au fond.";
  return target;
}

export function applyAction(s: NavalState, playerId: string, action: NavalAction): ActionResult {
  const i = playerIndex(s, playerId);
  if (i < 0) return { ok: false, error: "Tu ne joues pas cette partie." };
  const me = s.players[i]!;
  const events: NavalEvent[] = [];

  switch (action.type) {
    case "place":
    case "ready": {
      if (s.phase !== "placement") return { ok: false, error: "La bataille a déjà commencé." };
      if (me.ready) return { ok: false, error: "Ta flotte est déjà prête." };
      if (action.ships) {
        const problem = validateFleet(s.settings.grid, action.ships, s.settings.touching);
        if (problem) return { ok: false, error: problem };
        me.board.ships = toShips(action.ships.map((p) => ({ kind: p.kind, x: p.x, y: p.y, dir: p.dir })));
      }
      if (action.type === "ready") {
        me.ready = true;
        events.push({ type: "ready", player: me.id });
        if (s.players.every((p) => p.ready)) startBattle(s, events);
      }
      return { ok: true, events };
    }

    case "fire": {
      if (s.phase !== "battle") return { ok: false, error: "Pas encore l'heure de tirer." };
      if (s.turn !== i) return { ok: false, error: "Ce n'est pas ton tour." };
      const target = checkTarget(s, me, action.target);
      if (typeof target === "string") return { ok: false, error: target };
      const size = target.board.size;
      if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell >= size * size) return { ok: false, error: "Case invalide." };
      if (target.board.shots.includes(action.cell)) return { ok: false, error: "Cette case a déjà été visée." };
      const result = resolveShot(s, me, target, action.cell, events);
      if (checkOver(s, events)) return { ok: true, events };
      if (s.settings.shots === "salvo") {
        s.shotsLeft -= 1;
        if (s.shotsLeft > 0 && targetsOf(s, me.id).length > 0) {
          s.turnId += 1;
          events.push({ type: "turn", player: me.id, shots: s.shotsLeft });
          return { ok: true, events };
        }
      } else if (s.settings.shots === "replay" && result !== "miss") {
        s.turnId += 1;
        events.push({ type: "turn", player: me.id, shots: 1 });
        return { ok: true, events };
      }
      passTurn(s, events);
      return { ok: true, events };
    }

    case "weapon": {
      if (s.phase !== "battle") return { ok: false, error: "Pas encore l'heure de tirer." };
      if (s.turn !== i) return { ok: false, error: "Ce n'est pas ton tour." };
      const slot = me.arsenal.indexOf(action.weapon);
      if (slot < 0) return { ok: false, error: "Tu n'as pas cette arme." };
      const target = checkTarget(s, me, action.target);
      if (typeof target === "string") return { ok: false, error: target };
      const size = target.board.size;
      if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell >= size * size) return { ok: false, error: "Case invalide." };
      const x = cellX(size, action.cell);
      const y = cellY(size, action.cell);
      const shot = new Set(target.board.shots);

      if (action.weapon === "radar") {
        const cells: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < size && ny < size) cells.push(cellIndex(size, nx, ny));
          }
        }
        const found = cells.filter((c) => shipAt(target.board, c));
        s.scans.push({ by: me.id, target: target.id, cells, found });
        events.push({ type: "scan", by: me.id, target: target.id, cells, found });
      } else if (action.weapon === "barrage") {
        const cross = [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
          .map(([dx, dy]) => [x + dx!, y + dy!] as const)
          .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < size && ny < size)
          .map(([nx, ny]) => cellIndex(size, nx, ny))
          .filter((c) => !shot.has(c));
        if (cross.length === 0) return { ok: false, error: "Toute cette zone a déjà été visée." };
        for (const c of cross) {
          if (target.out) break;
          resolveShot(s, me, target, c, events, "barrage");
        }
      } else {
        // Torpille : part du bord gauche (ligne) ou du haut (colonne) et frappe la première case de navire intacte
        const dir = action.dir === "v" ? "v" : "h";
        const line = Array.from({ length: size }, (_, k) => (dir === "h" ? cellIndex(size, k, y) : cellIndex(size, x, k)));
        if (line.every((c) => shot.has(c))) return { ok: false, error: "Toute cette ligne a déjà été visée." };
        const path: number[] = [];
        let impact: number | null = null;
        for (const c of line) {
          path.push(c);
          const ship = shipAt(target.board, c);
          if (ship && !ship.hits.includes(c)) {
            impact = c;
            break;
          }
        }
        // L'eau traversée se révèle : chaque case libre du trajet compte comme un tir manqué
        for (const c of path) {
          if (c === impact || shot.has(c)) continue;
          target.board.shots.push(c);
        }
        if (impact !== null) resolveShot(s, me, target, impact, events, "torpedo", path);
        else {
          me.stats.shots += 1;
          me.stats.streak = 0;
          events.push({
            type: "shot",
            by: me.id,
            target: target.id,
            cell: path[path.length - 1]!,
            result: "miss",
            weapon: "torpedo",
            path,
          });
        }
      }
      me.arsenal.splice(slot, 1);
      me.stats.weapons += 1;
      if (checkOver(s, events)) return { ok: true, events };
      passTurn(s, events);
      return { ok: true, events };
    }
  }
  return { ok: false, error: "Action inconnue." };
}

/** Placement terminé d'office (chrono écoulé ou bot) : la flotte actuelle est validée. */
export function forceReady(s: NavalState, playerId: string): NavalEvent[] {
  const res = applyAction(s, playerId, { type: "ready" });
  return res.ok ? res.events : [];
}

export function currentPlayer(s: NavalState): NavalPlayer | null {
  return s.phase === "battle" ? (s.players[s.turn] ?? null) : null;
}

export function fleetAfloat(board: Board): number {
  return afloat(board);
}
