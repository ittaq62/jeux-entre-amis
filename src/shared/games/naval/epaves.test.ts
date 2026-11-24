// Bataille navale : les bots qui savent qu'autour d'une épave il n'y a que de l'eau, et l'arme gagnée qui reste
// dans son camp.
import { describe, expect, it } from "vitest";
import { botAction } from "./bot.ts";
import { applyAction, cellIndex, createGame, DEFAULT_SETTINGS, neighbours, shipCells, type NavalState, type Placement } from "./engine.ts";
import { eventsFor } from "./view.ts";

const ROWS: Placement[] = [
  { kind: "porte-avions", x: 0, y: 0, dir: "h" },
  { kind: "croiseur", x: 0, y: 2, dir: "h" },
  { kind: "contre-torpilleur", x: 0, y: 4, dir: "h" },
  { kind: "sous-marin", x: 0, y: 6, dir: "h" },
  { kind: "torpilleur", x: 0, y: 8, dir: "h" },
];

function battle(patch: Partial<typeof DEFAULT_SETTINGS> = {}, seed = 42): NavalState {
  const { state } = createGame(["a", "b"], { ...DEFAULT_SETTINGS, ...patch }, seed);
  for (const id of ["a", "b"]) expect(applyAction(state, id, { type: "ready", ships: ROWS }).ok).toBe(true);
  state.turn = 0;
  state.shotsLeft = 1;
  return state;
}

/** Coule le torpilleur de b (deux cases en bas à gauche), tirs à la main de a */
function sinkTorpilleur(s: NavalState) {
  const target = s.players[1]!;
  for (const c of shipCells(10, ROWS[4]!)!) {
    target.board.shots.push(c);
    target.board.ships.find((sh) => sh.kind === "torpilleur")!.hits.push(c);
  }
  target.board.ships.find((sh) => sh.kind === "torpilleur")!.sunk = true;
}

describe("Bataille navale, les épaves", () => {
  it("sans navires collés, le chasseur et l'amiral ne tirent jamais dans l'eau qui borde une épave", () => {
    const wreck = new Set(shipCells(10, ROWS[4]!)!);
    const around = new Set([...wreck].flatMap((c) => neighbours(10, c)).filter((c) => !wreck.has(c)));
    for (const level of ["chasseur", "amiral"] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const s = battle({ touching: false }, seed);
        sinkTorpilleur(s);
        // Tout le reste du plateau a déjà été visé, sauf l'eau autour de l'épave et une case du porte-avions
        const free = cellIndex(10, 4, 0);
        for (let c = 0; c < 100; c++) if (!wreck.has(c) && !around.has(c) && c !== free) s.players[1]!.board.shots.push(c);
        const action = botAction(s, "a", level)!;
        expect(action.type === "fire" ? action.cell : -1).toBe(free);
      }
    }
  });

  it("avec navires collés, l'eau autour d'une épave reste possible", () => {
    const s = battle({ touching: true });
    sinkTorpilleur(s);
    const wreck = new Set(shipCells(10, ROWS[4]!)!);
    const around = [...wreck].flatMap((c) => neighbours(10, c)).filter((c) => !wreck.has(c));
    for (let c = 0; c < 100; c++) if (!wreck.has(c) && !around.includes(c)) s.players[1]!.board.shots.push(c);
    const action = botAction(s, "a", "chasseur")!;
    expect(around).toContain(action.type === "fire" ? action.cell : -1);
  });
});

describe("Bataille navale, l'arsenal", () => {
  it("l'arme gagnée n'est montrée qu'à son camp", () => {
    const s = battle({ arsenal: true });
    const events = [{ type: "weapon" as const, player: "a", weapon: "radar" as const }];
    expect(eventsFor(s, events, "a")).toEqual(events);
    expect(eventsFor(s, events, "b")).toEqual([]);
    expect(eventsFor(s, events, null)).toEqual([]);
  });
});
