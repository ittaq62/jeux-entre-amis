import { describe, expect, it } from "vitest";
import { SIDES, STATIONS } from "./board.ts";
import {
  applyAction,
  closeAuction,
  createGame,
  DEFAULT_SETTINGS,
  monopolyOf,
  monopolyProgress,
  type CapitaleAction,
  type CapitaleSettings,
  type CapitaleState,
} from "./engine.ts";

// Monopole : trois quartiers complets, toutes les rues d'un côté, ou les quatre gares, et la partie s'arrête net.

function game(n = 3, settings: Partial<CapitaleSettings> = {}, teams: Record<string, number> | null = null): CapitaleState {
  const ids = ["a", "b", "c", "d", "e", "f"].slice(0, n);
  const { state } = createGame(ids, { ...DEFAULT_SETTINGS, end: "timed", monopoly: true, ...settings }, 11, teams);
  state.turn = 0;
  return state;
}
function act(s: CapitaleState, id: string, action: CapitaleAction) {
  const r = applyAction(s, id, action);
  if (!r.ok) throw new Error(r.error);
  return r.events;
}
const rollAs = (s: CapitaleState, id: string, dice: [number, number]) => {
  s.turn = s.players.findIndex((p) => p.id === id);
  s.step = "roll";
  s.dice = null;
  s.rigged = [dice];
  return act(s, id, { type: "roll" });
};
const own = (s: CapitaleState, id: string, ...squares: number[]) => squares.forEach((i) => (s.deeds[i]!.owner = id));
const P = (s: CapitaleState, id: string) => s.players.find((p) => p.id === id)!;

describe("Monopole", () => {
  it("les quatre côtés du plateau ont chacun deux quartiers", () => {
    expect(SIDES.map((x) => x.groups)).toEqual([
      ["brun", "ciel"],
      ["rose", "orange"],
      ["rouge", "jaune"],
      ["vert", "bleu"],
    ]);
    expect(SIDES.map((x) => x.squares.length)).toEqual([5, 6, 6, 5]);
  });

  it("trois quartiers complets : victoire immédiate à l'achat du dernier titre", () => {
    const s = game();
    own(s, "a", 1, 3, 37, 39, 11, 13);
    P(s, "a").position = 10;
    rollAs(s, "a", [1, 3]);
    const events = act(s, "a", { type: "buy" });
    expect(events).toContainEqual({ type: "monopoly", player: "a", team: null, kind: "groups", squares: [1, 3, 11, 13, 14, 37, 39] });
    expect(events.at(-1)).toMatchObject({ type: "gameOver" });
    expect(s.step).toBe("over");
    expect(s.outcome).toMatchObject({ reason: "monopoly", monopoly: { kind: "groups", player: "a" } });
    expect(s.ranking![0]).toBe("a");
    expect(s.ranks!.a).toBe(1);
  });

  it("toutes les rues d'un côté, même avec moins d'argent que les autres", () => {
    const s = game();
    own(s, "a", 11, 13, 14, 16, 18);
    P(s, "b").cash = 9000;
    P(s, "a").position = 10;
    rollAs(s, "a", [4, 5]);
    const events = act(s, "a", { type: "buy" });
    expect(events).toContainEqual({ type: "monopoly", player: "a", team: null, kind: "side", side: 1, squares: [11, 13, 14, 16, 18, 19] });
    expect(s.ranks).toMatchObject({ a: 1, b: 2 });
  });

  it("les quatre gares, remportées aux enchères", () => {
    const s = game();
    own(s, "a", 5, 15, 25);
    P(s, "b").position = 32;
    rollAs(s, "b", [1, 2]);
    act(s, "b", { type: "decline" });
    act(s, "a", { type: "bid", amount: 10 });
    const events = closeAuction(s);
    expect(events).toContainEqual({ type: "monopoly", player: "a", team: null, kind: "stations", squares: STATIONS });
    expect(s.step).toBe("over");
  });

  it("par un échange accepté, les titres hypothéqués comptant comme les autres", () => {
    const s = game();
    own(s, "a", 5, 15, 25);
    s.deeds[5]!.mortgaged = true;
    own(s, "c", 35);
    act(s, "a", {
      type: "propose",
      to: "c",
      give: { cash: 500, squares: [], jailCards: 0 },
      get: { cash: 0, squares: [35], jailCards: 0 },
    });
    const events = act(s, "c", { type: "accept", trade: s.trades[0]!.id });
    expect(events.some((e) => e.type === "monopoly" && e.player === "a")).toBe(true);
  });

  it("en équipe, les titres des coéquipiers comptent ensemble et toute l'équipe gagne", () => {
    const s = game(4, {}, { a: 0, b: 0, c: 1, d: 1 });
    own(s, "a", 5, 15);
    own(s, "b", 25);
    P(s, "a").position = 32;
    rollAs(s, "a", [1, 2]);
    const events = act(s, "a", { type: "buy" });
    expect(events).toContainEqual({ type: "monopoly", player: "a", team: 0, kind: "stations", squares: STATIONS });
    expect(s.ranks).toEqual({ a: 1, b: 1, c: 3, d: 3 });
    expect(s.outcome?.team).toBe(0);
  });

  it("sans victoire d'équipe, chacun ses titres", () => {
    const s = game(4, { teamWin: false }, { a: 0, b: 0, c: 1, d: 1 });
    own(s, "a", 5, 15);
    own(s, "b", 25);
    P(s, "a").position = 32;
    rollAs(s, "a", [1, 2]);
    act(s, "a", { type: "buy" });
    expect(s.step).not.toBe("over");
  });

  it("rien ne s'arrête quand le mode n'est pas choisi", () => {
    const s = game(3, { monopoly: false });
    own(s, "a", 5, 15, 25);
    P(s, "a").position = 32;
    rollAs(s, "a", [1, 2]);
    act(s, "a", { type: "buy" });
    expect(s.step).toBe("manage");
    expect(monopolyOf(s, "a")?.kind).toBe("stations");
  });

  it("chacun voit où il en est, et les titres qui feraient gagner un camp", () => {
    const s = game();
    own(s, "a", 5, 15, 25, 1, 3, 6, 8, 9, 37);
    own(s, "b", 35);
    const p = monopolyProgress(s, "a");
    expect(p.groups).toEqual(["brun", "ciel"]);
    expect(p.stations).toEqual({ have: 3, missing: [35] });
    expect(p.sides[0]).toEqual({ have: 5, total: 5, missing: [] });
    // Tout le côté brun et ciel : c'est déjà gagné
    expect(monopolyOf(s, "a")?.kind).toBe("side");
    s.deeds[9]!.owner = "c";
    const q = monopolyProgress(s, "a");
    expect(q.closest).toBe(1);
    // Foix rendrait le côté, TGV Nord les quatre gares ; Paris compléterait le bleu, mais ça ne ferait que deux quartiers
    expect(q.winning.sort((x, y) => x - y)).toEqual([9, 35]);
  });

  it("le départ rapide ne donne jamais une partie gagnée d'avance", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ids = ["a", "b", "c", "d", "e", "f"];
      const teams = { a: 0, b: 0, c: 1, d: 1, e: 2, f: 2 };
      const { state } = createGame(ids, { ...DEFAULT_SETTINGS, quickStart: true, monopoly: true }, seed, teams);
      for (const id of ids) expect(monopolyOf(state, id)).toBeNull();
      expect(ids.every((id) => state.deeds.filter((d) => d?.owner === id).length === 2)).toBe(true);
    }
  });
});
