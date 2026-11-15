// UNO en équipes à une table : on gagne ensemble (la tournée, elle, garde la place de chacun)
import { describe, expect, it } from "vitest";
import type { Card, CardKind, Color } from "./cards.ts";
import { applyAction, createGame, DEFAULT_SETTINGS, sideScore, type UnoSettings, type UnoState } from "./engine.ts";
import { viewFor } from "./view.ts";

let nextId = 5000;
const c = (kind: CardKind, color: Color | null = null, value?: number): Card => ({
  id: nextId++,
  kind,
  color,
  ...(value !== undefined ? { value } : {}),
});
const n = (color: Color, value: number) => c("number", color, value);

/** Quatre joueurs, p0 et p2 contre p1 et p3 */
function table(hands: Card[][], settings: Partial<UnoSettings> = {}, teamWin = true): UnoState {
  const ids = hands.map((_, i) => `p${i}`);
  const { state } = createGame(ids, { ...DEFAULT_SETTINGS, stacking: false, ...settings }, 42);
  state.players.forEach((p, i) => (p.hand = hands[i]!.slice()));
  state.discard = [n("red", 9)];
  state.color = "red";
  state.turn = 0;
  state.direction = 1;
  state.pendingDraw = 0;
  state.drawPile = Array.from({ length: 30 }, (_, i) => n("blue", i % 10));
  state.teams = { p0: 0, p1: 1, p2: 0, p3: 1 };
  state.teamWin = teamWin;
  return state;
}

function play(s: UnoState, who: number, card: Card) {
  const res = applyAction(s, `p${who}`, { type: "play", cardId: card.id }, 0);
  if (!res.ok) throw new Error(res.error);
}

describe("UNO en équipes à une table", () => {
  it("premier à finir : la carte qui vide une main fait gagner toute son équipe", () => {
    const last = n("red", 3);
    const s = table([[n("red", 1), n("red", 2)], [n("blue", 1)], [last], [n("green", 4)]]);
    s.turn = 2;
    play(s, 2, last);
    expect(s.phase).toBe("gameOver");
    expect(s.teamRanks).toEqual({ p0: 1, p2: 1, p1: 3, p3: 3 });
    const v = viewFor(s, "p0", ["p2"]);
    expect(v.teams).toEqual({ p0: 0, p1: 1, p2: 0, p3: 1 });
    expect(v.teamRanks).toEqual(s.teamRanks);
  });

  it("jusqu'au dernier : gagne la première équipe qui a vidé toutes ses mains, pas celle du premier sorti", () => {
    const [a, b, d, e] = [n("red", 1), n("red", 2), n("red", 3), n("red", 7)];
    const s = table([[a], [b], [d], [e, n("blue", 5)]], { endMode: "ranking" });
    s.turn = 1;
    play(s, 1, b); // p1 (Bleus) sort le premier
    play(s, 2, d); // p2 (Rouges)
    play(s, 3, e);
    play(s, 0, a); // p0 : les Rouges ont tout posé, p3 reste seul en jeu
    expect(s.phase).toBe("gameOver");
    expect(s.ranking![0]).toBe("p1");
    expect(s.teamRanks).toEqual({ p0: 1, p2: 1, p1: 3, p3: 3 });
  });

  it("aux points : l'objectif se compte par équipe", () => {
    const last = n("red", 1);
    const hands = [[last], [c("wild")], [n("green", 2)], [n("yellow", 3)]];
    const s = table(hands, { endMode: "points", targetScore: 200 });
    s.players[2]!.score = 150;
    play(s, 0, last);
    expect(s.players[0]!.score).toBeLessThan(200);
    expect(sideScore(s, "p0")).toBeGreaterThanOrEqual(200);
    expect(s.phase).toBe("gameOver");
    expect(s.teamRanks).toEqual({ p0: 1, p2: 1, p1: 3, p3: 3 });
  });

  it("en tournée (sans victoire d'équipe), rien ne change : chacun ses points, chacun sa place", () => {
    const last = n("red", 1);
    const s = table([[last], [c("wild")], [n("green", 2)], [n("yellow", 3)]], { endMode: "points", targetScore: 200 }, false);
    s.players[2]!.score = 150;
    play(s, 0, last);
    expect(s.phase).toBe("roundOver");
    expect(sideScore(s, "p0")).toBe(s.players[0]!.score);
    expect(s.teamRanks ?? null).toBeNull();
    expect(viewFor(s, "p0").teams).toBeNull();
  });

  it("chacun pour soi : pas d'équipes, pas de places d'équipe", () => {
    const last = n("red", 1);
    const s = table([[last], [n("blue", 1)], [n("green", 2)], [n("yellow", 3)]]);
    s.teams = null;
    play(s, 0, last);
    expect(s.phase).toBe("gameOver");
    expect(s.teamRanks).toBeNull();
    expect(s.ranking![0]).toBe("p0");
  });
});
