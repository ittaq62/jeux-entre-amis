import { create } from "zustand";
import type { NavalEvent, Weapon } from "../../shared/games/naval/engine.ts";
import { play, vibrate } from "../lib/sound.ts";

/** Durée de chute d'un obus avant l'impact */
export const FLIGHT_MS = 560;
/** Vitesse d'une torpille, par case traversée */
export const TORPEDO_CELL_MS = 70;

export type FxKind = "incoming" | "splash" | "explosion" | "sunk" | "torpedo" | "scan";

export interface FxItem {
  id: number;
  board: string;
  kind: FxKind;
  cell: number;
  /** Cases concernées (trajet de torpille, zone de radar) */
  cells?: number[];
  /** Le radar a trouvé quelque chose sur ces cases */
  found?: number[] | null;
  start: number;
  duration: number;
}

interface FxState {
  items: FxItem[];
  /** Cases dont le résultat attend l'arrivée de l'obus, par plateau */
  pending: Record<string, number[]>;
}

export const useNavalFx = create<FxState>(() => ({ items: [], pending: {} }));

let seq = 0;

function addFx(item: Omit<FxItem, "id" | "start">, delay = 0) {
  const fx: FxItem = { ...item, id: ++seq, start: performance.now() + delay };
  setTimeout(() => {
    useNavalFx.setState((s) => ({ items: [...s.items.slice(-40), fx] }));
    setTimeout(() => useNavalFx.setState((s) => ({ items: s.items.filter((x) => x.id !== fx.id) })), fx.duration);
  }, delay);
}

function hold(board: string, cell: number, ms: number) {
  useNavalFx.setState((s) => ({ pending: { ...s.pending, [board]: [...(s.pending[board] ?? []), cell] } }));
  setTimeout(() => {
    useNavalFx.setState((s) => {
      const list = [...(s.pending[board] ?? [])];
      const i = list.indexOf(cell);
      if (i >= 0) list.splice(i, 1);
      return { pending: { ...s.pending, [board]: list } };
    });
  }, ms);
}

export function resetNavalFx() {
  useNavalFx.setState({ items: [], pending: {} });
}

/**
 * Joue les événements d'une mise à jour : chaque tir arrive après sa chute, son résultat n'apparaît qu'à l'impact.
 * `me` est le joueur qui regarde, pour doser les sons et les vibrations.
 */
export function playNavalEvents(events: NavalEvent[], me: string | null, reduced: boolean) {
  let delay = 0;
  for (const e of events) {
    if (e.type === "shot") {
      const mine = e.by === me;
      const onMe = e.target === me;
      const weapon: Weapon | undefined = e.weapon;
      const flight = weapon === "torpedo" ? (e.path?.length ?? 1) * TORPEDO_CELL_MS + 120 : FLIGHT_MS;
      const start = delay;
      if (weapon === "torpedo") {
        play("torpedo", { delay: start, volume: mine || onMe ? 1 : 0.6 });
        addFx({ board: e.target, kind: "torpedo", cell: e.cell, cells: e.path ?? [e.cell], duration: flight + 200 }, start);
        for (const c of e.path ?? []) if (c !== e.cell) hold(e.target, c, start + flight);
      } else {
        play("cannon", { delay: start, volume: mine ? 0.9 : 0.55 });
        addFx({ board: e.target, kind: "incoming", cell: e.cell, duration: flight }, start);
      }
      hold(e.target, e.cell, start + flight);
      const impact = start + flight;
      if (e.result === "miss") {
        play("splash", { delay: impact, volume: mine || onMe ? 1 : 0.6 });
        addFx({ board: e.target, kind: "splash", cell: e.cell, duration: 900 }, impact);
      } else {
        play(e.result === "sunk" ? "sunk" : "explosion", { delay: impact, volume: mine || onMe ? 1 : 0.65 });
        addFx(
          { board: e.target, kind: e.result === "sunk" ? "sunk" : "explosion", cell: e.cell, duration: e.result === "sunk" ? 1400 : 900 },
          impact,
        );
        if (e.result === "sunk") play("bubbles", { delay: impact + 900, volume: 0.8 });
        if (onMe && !reduced) setTimeout(() => vibrate(e.result === "sunk" ? [60, 40, 120] : 50), impact);
      }
      // Les tirs d'un barrage partent les uns après les autres
      delay += weapon === "barrage" ? 140 : weapon === "torpedo" ? flight : 0;
    } else if (e.type === "scan") {
      play("sonar", { delay });
      addFx({ board: e.target, kind: "scan", cell: e.cells[4] ?? e.cells[0]!, cells: e.cells, found: e.found, duration: 1300 }, delay);
    }
  }
}
