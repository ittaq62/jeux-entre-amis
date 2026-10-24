import {
  allies,
  FLEETS,
  fleetAfloat,
  modeOf,
  playerIndex,
  shipCells,
  type GridSize,
  type NavalEvent,
  type NavalMode,
  type NavalSettings,
  type NavalState,
  type Placement,
  type Ship,
  type ShipKind,
  type Weapon,
} from "./engine.ts";

export interface NavalBoardView {
  owner: string;
  size: GridSize;
  /** Cases visées sans rien toucher */
  misses: number[];
  /** Cases touchées, navires coulés compris */
  hits: number[];
  /** Navires coulés, révélés à tous */
  sunk: Placement[];
  /** La flotte complète, seulement pour son propriétaire et son coéquipier */
  ships: Ship[] | null;
  /** Passages de radar de ton camp sur ce plateau */
  scans: { cells: number[]; found: number[] }[];
  afloat: number;
  out: boolean;
}

export interface NavalPlayerView {
  id: string;
  team: number | null;
  ready: boolean;
  out: boolean;
  /** Armes en réserve : le détail pour son camp, seulement le nombre pour les autres */
  arsenal: Weapon[] | null;
  arsenalCount: number;
}

/** Ce qu'un joueur a le droit de voir : ses navires, et des autres seulement les tirs et les épaves. */
export interface NavalView {
  settings: NavalSettings;
  mode: NavalMode;
  fleet: ShipKind[];
  you: string | null;
  phase: NavalState["phase"];
  turn: string | null;
  turnId: number;
  shotsLeft: number;
  players: NavalPlayerView[];
  boards: NavalBoardView[];
  ranking: string[] | null;
  ranks: Record<string, number> | null;
}

export function viewFor(s: NavalState, viewerId: string | null): NavalView {
  const viewer = viewerId ? (s.players[playerIndex(s, viewerId)] ?? null) : null;
  const sameSide = (id: string) => {
    if (!viewer) return false;
    const other = s.players[playerIndex(s, id)];
    return other ? allies(viewer, other) : false;
  };
  return {
    settings: s.settings,
    mode: modeOf(s),
    fleet: FLEETS[s.settings.grid],
    you: viewer?.id ?? null,
    phase: s.phase,
    turn: s.phase === "battle" ? s.players[s.turn]!.id : null,
    turnId: s.turnId,
    shotsLeft: s.shotsLeft,
    players: s.players.map((p) => ({
      id: p.id,
      team: p.team,
      ready: p.ready,
      out: p.out,
      arsenal: sameSide(p.id) ? [...p.arsenal] : null,
      arsenalCount: p.arsenal.length,
    })),
    boards: s.players.map((p) => {
      const b = p.board;
      const shipCellSet = new Set(b.ships.flatMap((sh) => shipCells(b.size, sh)!));
      const reveal = sameSide(p.id) || s.phase === "gameOver";
      return {
        owner: p.id,
        size: b.size,
        misses: b.shots.filter((c) => !shipCellSet.has(c)),
        hits: b.shots.filter((c) => shipCellSet.has(c)),
        sunk: b.ships.filter((sh) => sh.sunk).map(({ kind, x, y, dir }) => ({ kind, x, y, dir })),
        ships: reveal ? b.ships.map((sh) => ({ ...sh, hits: [...sh.hits] })) : null,
        scans: s.scans.filter((sc) => sc.target === p.id && sameSide(sc.by)).map((sc) => ({ cells: sc.cells, found: sc.found })),
        afloat: fleetAfloat(b),
        out: p.out,
      };
    }),
    ranking: s.ranking,
    ranks: s.ranks,
  };
}

/** Les événements tels qu'un joueur peut les voir : le résultat d'un radar reste dans le camp du tireur. */
export function eventsFor(s: NavalState, events: NavalEvent[], viewerId: string | null): NavalEvent[] {
  const viewer = viewerId ? s.players[playerIndex(s, viewerId)] : undefined;
  return events.map((e) => {
    if (e.type !== "scan") return e;
    const by = s.players[playerIndex(s, e.by)];
    const visible = viewer && by && allies(viewer, by);
    return visible ? e : { ...e, found: null };
  });
}
