import { describe, expect, it } from "vitest";
import { buildClassicDeck, type Card, type CardKind, type Color } from "./cards.ts";
import { buildNoMercyDeck } from "./nomercy.ts";
import {
  applyAction,
  createGame,
  DEFAULT_SETTINGS,
  startNextRound,
  tick,
  timeoutActions,
  UNO_GRACE_MS,
  type UnoSettings,
  type UnoState,
} from "./engine.ts";
import { botTurn } from "./bot.ts";
import { viewFor } from "./view.ts";

let nextId = 1000;
function c(kind: CardKind, color: Color | null = null, value?: number): Card {
  return { id: nextId++, kind, color, ...(value !== undefined ? { value } : {}) };
}
const n = (color: Color, value: number) => c("number", color, value);

interface Rig {
  hands: Card[][];
  top: Card;
  color?: Color;
  turn?: number;
  drawPile?: Card[];
  settings?: Partial<UnoSettings>;
}

function rig(r: Rig): UnoState {
  const ids = r.hands.map((_, i) => `p${i}`);
  const { state } = createGame(ids, { ...DEFAULT_SETTINGS, stacking: false, ...r.settings }, 42);
  state.players.forEach((p, i) => (p.hand = r.hands[i]!.slice()));
  state.discard = [r.top];
  state.color = r.color ?? r.top.color ?? "red";
  state.turn = r.turn ?? 0;
  state.direction = 1;
  state.pendingDraw = 0;
  state.lastDrawValue = 0;
  state.challenge = null;
  state.drawPile = r.drawPile ?? Array.from({ length: 30 }, (_, i) => n("blue", i % 10));
  return state;
}

function act(s: UnoState, who: number, action: Parameters<typeof applyAction>[2], now = 0) {
  const res = applyAction(s, `p${who}`, action, now);
  if (!res.ok) throw new Error(res.error);
  return res.events;
}

function expectFail(s: UnoState, who: number, action: Parameters<typeof applyAction>[2]) {
  const res = applyAction(s, `p${who}`, action, 0);
  expect(res.ok).toBe(false);
}

describe("jeu de cartes", () => {
  it("contient les 108 cartes officielles", () => {
    const deck = buildClassicDeck();
    expect(deck).toHaveLength(108);
    expect(deck.filter((x) => x.kind === "number")).toHaveLength(76);
    expect(deck.filter((x) => x.kind === "number" && x.value === 0)).toHaveLength(4);
    for (const kind of ["skip", "reverse", "draw2"] as const) expect(deck.filter((x) => x.kind === kind)).toHaveLength(8);
    expect(deck.filter((x) => x.kind === "wild")).toHaveLength(4);
    expect(deck.filter((x) => x.kind === "wild4")).toHaveLength(4);
    expect(new Set(deck.map((x) => x.id)).size).toBe(108);
  });
});

describe("mise en place", () => {
  it("distribue 7 cartes et retourne une carte qui n'est pas un joker", () => {
    for (let seed = 1; seed < 60; seed++) {
      const { state } = createGame(["a", "b", "c"], DEFAULT_SETTINGS, seed);
      for (const p of state.players) expect(p.hand.length).toBeGreaterThanOrEqual(7);
      expect(state.discard[0]!.color).not.toBeNull();
      const total = state.players.reduce((sum, p) => sum + p.hand.length, 0) + state.drawPile.length + state.discard.length;
      expect(total).toBe(108);
    }
  });
});

describe("poser une carte", () => {
  it("accepte la meme couleur, le meme chiffre, le meme symbole et les jokers", () => {
    const s = rig({ hands: [[n("red", 3), n("blue", 5), c("skip", "green"), c("wild"), n("green", 9)], [n("red", 1)]], top: n("red", 5) });
    const v = viewFor(s, "p0");
    expect(v.playable).toContain(s.players[0]!.hand[0]!.id); // meme couleur
    expect(v.playable).toContain(s.players[0]!.hand[1]!.id); // meme chiffre
    expect(v.playable).toContain(s.players[0]!.hand[3]!.id); // joker
    expect(v.playable).not.toContain(s.players[0]!.hand[2]!.id);
    expect(v.playable).not.toContain(s.players[0]!.hand[4]!.id);
  });

  it("refuse une carte injouable et le jeu hors de son tour", () => {
    const bad = n("green", 9);
    const s = rig({ hands: [[bad, n("red", 2)], [n("red", 1), n("red", 4)]], top: n("red", 5) });
    expectFail(s, 0, { type: "play", cardId: bad.id });
    expectFail(s, 1, { type: "play", cardId: s.players[1]!.hand[0]!.id });
  });

  it("change de couleur avec un joker et exige un choix", () => {
    const wild = c("wild");
    const s = rig({ hands: [[wild, n("red", 2), n("red", 3)], [n("red", 1)]], top: n("red", 5) });
    expectFail(s, 0, { type: "play", cardId: wild.id });
    act(s, 0, { type: "play", cardId: wild.id, color: "blue" });
    expect(s.color).toBe("blue");
    expect(s.turn).toBe(1);
  });

  it("passe le joueur suivant avec « passe ton tour »", () => {
    const skip = c("skip", "red");
    const s = rig({ hands: [[skip, n("red", 2)], [n("red", 1)], [n("red", 4)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: skip.id });
    expect(s.turn).toBe(2);
  });

  it("inverse le sens a trois joueurs", () => {
    const rev = c("reverse", "red");
    const s = rig({ hands: [[rev, n("red", 2)], [n("red", 1)], [n("red", 4)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: rev.id });
    expect(s.direction).toBe(-1);
    expect(s.turn).toBe(2);
  });

  it("l'inversion a deux joueurs fait rejouer", () => {
    const rev = c("reverse", "red");
    const s = rig({ hands: [[rev, n("red", 2)], [n("red", 1)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: rev.id });
    expect(s.turn).toBe(0);
  });
});

describe("cartes +2 et +4", () => {
  it("sans cumul, le +2 fait piocher 2 et passer son tour", () => {
    const plus = c("draw2", "red");
    const s = rig({ hands: [[plus, n("red", 2)], [n("red", 1), c("draw2", "blue")], [n("red", 4)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: plus.id });
    expect(s.players[1]!.hand).toHaveLength(4);
    expect(s.turn).toBe(2);
  });

  it("avec cumul, on peut renvoyer un +2 et le suivant prend tout", () => {
    const a = c("draw2", "red");
    const b = c("draw2", "blue");
    const s = rig({
      hands: [[a, n("red", 2)], [b, n("yellow", 1)], [n("green", 4), n("green", 6)]],
      top: n("red", 5),
      settings: { stacking: true },
    });
    act(s, 0, { type: "play", cardId: a.id });
    expect(s.turn).toBe(1);
    expect(s.pendingDraw).toBe(2);
    expect(viewFor(s, "p1").canStack).toBe(true);
    act(s, 1, { type: "play", cardId: b.id });
    // Le joueur 2 n'a rien pour cumuler : il pioche 4 automatiquement
    expect(s.players[2]!.hand).toHaveLength(6);
    expect(s.pendingDraw).toBe(0);
    expect(s.turn).toBe(0);
  });

  it("avec cumul, on peut choisir d'encaisser au lieu de renvoyer", () => {
    const a = c("draw2", "red");
    const s = rig({ hands: [[a, n("red", 2)], [c("draw2", "blue"), n("yellow", 1)], [n("green", 4)]], top: n("red", 5), settings: { stacking: true } });
    act(s, 0, { type: "play", cardId: a.id });
    act(s, 1, { type: "draw" });
    expect(s.players[1]!.hand).toHaveLength(4);
    expect(s.turn).toBe(2);
  });

  it("contestation d'un +4 regulier : le contestataire pioche 6", () => {
    const w4 = c("wild4");
    const s = rig({ hands: [[w4, n("blue", 2)], [n("yellow", 1)], [n("green", 4)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: w4.id, color: "green" });
    expect(viewFor(s, "p1").canChallenge).toBe(true);
    act(s, 1, { type: "challenge" });
    expect(s.players[1]!.hand).toHaveLength(7);
    expect(s.turn).toBe(2);
  });

  it("contestation d'un +4 bluff : l'auteur pioche 4 et le contestataire joue", () => {
    const w4 = c("wild4");
    const s = rig({ hands: [[w4, n("red", 2)], [n("yellow", 1)], [n("green", 4)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: w4.id, color: "yellow" });
    act(s, 1, { type: "challenge" });
    expect(s.players[0]!.hand).toHaveLength(5);
    expect(s.players[1]!.hand).toHaveLength(1);
    expect(s.turn).toBe(1);
  });

  it("accepter le +4 sans contester fait piocher 4", () => {
    const w4 = c("wild4");
    const s = rig({ hands: [[w4, n("blue", 2)], [n("yellow", 1)], [n("green", 4)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: w4.id, color: "green" });
    act(s, 1, { type: "draw" });
    expect(s.players[1]!.hand).toHaveLength(5);
    expect(s.turn).toBe(2);
  });
});

describe("pioche", () => {
  it("une carte piochee jouable peut etre posee, et elle seule", () => {
    const drawn = n("red", 8);
    const other = n("red", 1);
    const s = rig({ hands: [[other, n("blue", 2)], [n("yellow", 1)]], top: n("red", 5), drawPile: [drawn] });
    act(s, 0, { type: "draw" });
    expect(s.drawnCardId).toBe(drawn.id);
    expectFail(s, 0, { type: "play", cardId: other.id });
    act(s, 0, { type: "play", cardId: drawn.id });
    expect(s.turn).toBe(1);
  });

  it("on peut garder la carte piochee et passer", () => {
    const s = rig({ hands: [[n("blue", 2)], [n("yellow", 1)]], top: n("red", 5), drawPile: [n("red", 8)] });
    act(s, 0, { type: "draw" });
    act(s, 0, { type: "pass" });
    expect(s.turn).toBe(1);
    expect(s.players[0]!.hand).toHaveLength(2);
  });

  it("une carte piochee injouable fait passer le tour", () => {
    const s = rig({ hands: [[n("blue", 2)], [n("yellow", 1)]], top: n("red", 5), drawPile: [n("green", 8)] });
    act(s, 0, { type: "draw" });
    expect(s.turn).toBe(1);
  });

  it("pioche jusqu'a pouvoir jouer quand la regle est active", () => {
    const s = rig({
      hands: [[n("blue", 2)], [n("yellow", 1)]],
      top: n("red", 5),
      drawPile: [n("red", 9), n("green", 1), n("green", 2), n("green", 3)],
      settings: { drawUntilPlayable: true },
    });
    act(s, 0, { type: "draw" });
    expect(s.players[0]!.hand).toHaveLength(5);
    expect(s.drawnCardId).not.toBeNull();
  });

  it("remelange la defausse quand la pioche est vide", () => {
    const s = rig({ hands: [[n("blue", 2)], [n("yellow", 1)]], top: n("red", 5), drawPile: [] });
    s.discard = [n("green", 1), n("green", 2), n("red", 5)];
    const events = act(s, 0, { type: "draw" });
    expect(events.some((e) => e.type === "reshuffle")).toBe(true);
    expect(s.discard).toHaveLength(1);
    expect(s.players[0]!.hand).toHaveLength(2);
  });
});

describe("UNO !", () => {
  it("oublier de crier UNO permet de se faire denoncer : +2", () => {
    const card = n("red", 2);
    const s = rig({ hands: [[card, n("blue", 3)], [n("yellow", 1), n("yellow", 2)], [n("green", 1)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: card.id }, 0);
    expect(viewFor(s, "p1").unoVulnerable).toBe("p0");
    act(s, 2, { type: "catch", target: "p0" }, 500);
    expect(s.players[0]!.hand).toHaveLength(3);
    expect(s.unoWindow).toBeNull();
  });

  it("crier UNO a temps protege", () => {
    const card = n("red", 2);
    const s = rig({ hands: [[card, n("blue", 3)], [n("yellow", 1), n("yellow", 2)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: card.id }, 0);
    act(s, 0, { type: "uno" }, 300);
    expectFail(s, 1, { type: "catch", target: "p0" });
  });

  it("annoncer UNO avant de poser l'avant-derniere carte evite la fenetre", () => {
    const card = n("red", 2);
    const s = rig({ hands: [[card, n("blue", 3)], [n("yellow", 1), n("yellow", 2)]], top: n("red", 5) });
    act(s, 0, { type: "uno" });
    act(s, 0, { type: "play", cardId: card.id });
    expect(s.unoWindow).toBeNull();
  });

  it("la fenetre se ferme quand le suivant a joue et que le delai est passe", () => {
    const card = n("red", 2);
    const s = rig({ hands: [[card, n("blue", 3)], [n("red", 1), n("yellow", 2), n("yellow", 3)], [n("green", 1)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: card.id }, 0);
    act(s, 1, { type: "play", cardId: s.players[1]!.hand[0]!.id }, 1000);
    // Toujours denoncable pendant le delai de grace
    expect(s.unoWindow).not.toBeNull();
    expect(tick(s, UNO_GRACE_MS + 1)).toBe(true);
    expectFail(s, 2, { type: "catch", target: "p0" });
  });
});

describe("regle du 7-0", () => {
  it("un 7 echange sa main avec le joueur choisi", () => {
    const seven = n("red", 7);
    const s = rig({
      hands: [[seven, n("blue", 1), n("blue", 2), n("blue", 3)], [n("yellow", 1)], [n("green", 1), n("green", 2)]],
      top: n("red", 5),
      settings: { sevenZero: true },
    });
    act(s, 0, { type: "play", cardId: seven.id, target: "p2" });
    expect(s.players[0]!.hand).toHaveLength(2);
    expect(s.players[2]!.hand).toHaveLength(3);
  });

  it("un 0 fait tourner toutes les mains dans le sens du jeu", () => {
    const zero = n("red", 0);
    const s = rig({
      hands: [[zero, n("blue", 1)], [n("yellow", 1), n("yellow", 2)], [n("green", 1), n("green", 2), n("green", 3)]],
      top: n("red", 5),
      settings: { sevenZero: true },
    });
    act(s, 0, { type: "play", cardId: zero.id });
    // p1 recoit la main de p0, p2 celle de p1, p0 celle de p2
    expect(s.players[1]!.hand.map((x) => x.color)).toEqual(["blue"]);
    expect(s.players[2]!.hand.map((x) => x.color)).toEqual(["yellow", "yellow"]);
    expect(s.players[0]!.hand).toHaveLength(3);
  });
});

describe("interception", () => {
  it("une carte identique peut etre jouee hors de son tour", () => {
    const top = n("red", 5);
    const twin = n("red", 5);
    const s = rig({ hands: [[n("red", 1), n("red", 2)], [n("yellow", 1)], [twin, n("green", 2)]], top, settings: { jumpIn: true } });
    act(s, 2, { type: "play", cardId: twin.id });
    expect(s.turn).toBe(0);
    expect(s.players[2]!.hand).toHaveLength(1);
  });

  it("refuse une carte seulement semblable", () => {
    const s = rig({ hands: [[n("red", 1)], [n("yellow", 1)], [n("blue", 5), n("green", 2)]], top: n("red", 5), settings: { jumpIn: true } });
    expectFail(s, 2, { type: "play", cardId: s.players[2]!.hand[0]!.id });
  });
});

describe("fin de manche", () => {
  it("le premier qui vide sa main gagne la partie", () => {
    const last = n("red", 2);
    const s = rig({ hands: [[last], [n("yellow", 1), c("wild")], [n("green", 9)]], top: n("red", 5) });
    act(s, 0, { type: "play", cardId: last.id });
    expect(s.phase).toBe("gameOver");
    expect(s.ranking).toEqual(["p0", "p2", "p1"]);
    expect(s.lastRound?.points).toBe(1 + 50 + 9);
  });

  it("en mode points, la manche suivante redistribue et les scores s'accumulent", () => {
    const last = n("red", 2);
    const s = rig({ hands: [[last], [n("yellow", 8)]], top: n("red", 5), settings: { endMode: "points", targetScore: 500 } });
    act(s, 0, { type: "play", cardId: last.id });
    expect(s.phase).toBe("roundOver");
    expect(s.players[0]!.score).toBe(8);
    startNextRound(s);
    expect(s.phase).toBe("playing");
    expect(s.round).toBe(2);
    expect(s.players[0]!.hand.length).toBeGreaterThanOrEqual(7);
  });

  it("finir sur un +2 fait quand meme piocher le suivant (points)", () => {
    const last = c("draw2", "red");
    const s = rig({ hands: [[last], [n("yellow", 8)]], top: n("red", 5), settings: { endMode: "points" }, drawPile: [n("blue", 9), n("blue", 9)] });
    act(s, 0, { type: "play", cardId: last.id });
    expect(s.lastRound?.points).toBe(8 + 18);
  });

  it("en mode classement, la partie continue jusqu'au dernier", () => {
    const s = rig({
      hands: [[n("red", 2)], [n("red", 3), n("blue", 4)], [n("red", 4), n("green", 1)]],
      top: n("red", 5),
      settings: { endMode: "ranking" },
    });
    act(s, 0, { type: "play", cardId: s.players[0]!.hand[0]!.id });
    expect(s.phase).toBe("playing");
    expect(s.players[0]!.out).toBe(true);
    expect(s.turn).toBe(1);
    act(s, 1, { type: "uno" });
    act(s, 1, { type: "play", cardId: s.players[1]!.hand[0]!.id });
    act(s, 2, { type: "draw" });
    if (s.turn === 2) act(s, 2, { type: "pass" });
    act(s, 1, { type: "draw" });
    if (s.turn === 1) act(s, 1, { type: "pass" });
    // Le tour ne revient jamais au joueur 0 qui a fini
    expect(s.turn).not.toBe(0);
  });
});

describe("vue d'un joueur", () => {
  it("ne devoile pas la main des autres", () => {
    const s = rig({ hands: [[n("red", 1), n("red", 2)], [n("blue", 1)]], top: n("red", 5) });
    const v = viewFor(s, "p1");
    expect(v.hand).toHaveLength(1);
    expect(v.players[0]!.count).toBe(2);
    expect(JSON.stringify(v)).not.toContain(`"id":${s.players[0]!.hand[0]!.id},`);
  });
});

describe("parties completes entre bots", () => {
  const variants: Partial<UnoSettings>[] = [
    {},
    { stacking: false },
    { drawUntilPlayable: true },
    { sevenZero: true, jumpIn: true },
    { endMode: "ranking" },
    { endMode: "points", targetScore: 200 },
    { variant: "nomercy" },
    { variant: "nomercy", endMode: "ranking" },
    { variant: "nomercy", endMode: "points", targetScore: 300 },
  ];

  for (const extra of variants) {
    it(`se terminent toujours sans erreur (${JSON.stringify(extra)})`, () => {
      for (let game = 0; game < 40; game++) {
        const count = 2 + (game % 7);
        const ids = Array.from({ length: count }, (_, i) => `b${i}`);
        const settings = { ...DEFAULT_SETTINGS, ...extra };
        const { state } = createGame(ids, settings, 1000 + game);
        const deckSize = state.players.reduce((sum, p) => sum + p.hand.length, 0) + state.drawPile.length + state.discard.length;
        const rng = { rng: 7 + game };
        let now = 0;
        let steps = 0;
        while (state.phase !== "gameOver" && steps < 20000) {
          steps++;
          now += 1500;
          tick(state, now);
          if (state.phase === "roundOver") {
            startNextRound(state);
            continue;
          }
          const current = state.players[state.turn]!;
          expect(current.out).toBe(false);
          // De temps en temps, un autre bot denonce un oubli de UNO
          if (state.unoWindow && steps % 3 === 0) {
            const vulnerable = state.players[state.unoWindow.player]!.id;
            const hunter = state.players.find((p) => p.id !== vulnerable && !p.out);
            if (hunter) applyAction(state, hunter.id, { type: "catch", target: vulnerable }, now);
            continue;
          }
          const actions = steps % 11 === 0 ? timeoutActions(state) : botTurn(state, current.id, rng);
          expect(actions.length).toBeGreaterThan(0);
          for (const action of actions) {
            const res = applyAction(state, current.id, action, now);
            if (!res.ok) throw new Error(`${res.error} ${JSON.stringify(action)}`);
          }
          const total = state.players.reduce((sum, p) => sum + p.hand.length, 0) + state.drawPile.length + state.discard.length;
          expect(total).toBe(deckSize);
        }
        expect(state.phase).toBe("gameOver");
        expect(state.ranking).toHaveLength(count);
        expect(new Set(state.ranking).size).toBe(count);
      }
    });
  }
});

describe("No Mercy", () => {
  const nm = { variant: "nomercy" as const };

  it("contient les 168 cartes du jeu officiel", () => {
    const deck = buildNoMercyDeck();
    expect(deck).toHaveLength(168);
    expect(deck.filter((x) => x.kind === "number")).toHaveLength(80);
    expect(deck.filter((x) => x.kind === "draw2")).toHaveLength(12);
    expect(deck.filter((x) => x.kind === "draw4")).toHaveLength(8);
    expect(deck.filter((x) => x.kind === "wild")).toHaveLength(0);
    expect(deck.filter((x) => x.color === null)).toHaveLength(24);
  });

  it("on ne cumule qu'avec une carte de valeur egale ou superieure", () => {
    const six = c("wild6");
    const s = rig({
      hands: [[six, n("red", 1)], [c("draw2", "red"), c("draw4", "blue"), n("red", 3)], [n("green", 1)]],
      top: n("red", 5),
      settings: nm,
    });
    act(s, 0, { type: "play", cardId: six.id, color: "red" });
    // Le +2 et le +4 sont trop faibles face au +6 : le joueur 1 encaisse automatiquement
    expect(s.players[1]!.hand).toHaveLength(9);
    expect(s.turn).toBe(2);
  });

  it("un +4 colore peut repondre a un +2", () => {
    const two = c("draw2", "red");
    const four = c("draw4", "blue");
    const s = rig({ hands: [[two, n("red", 1)], [four, n("yellow", 3)], [n("green", 1)]], top: n("red", 5), settings: nm });
    act(s, 0, { type: "play", cardId: two.id });
    act(s, 1, { type: "play", cardId: four.id });
    expect(s.players[2]!.hand).toHaveLength(7);
  });

  it("interdit de piocher quand on a une carte jouable, et oblige a poser la carte piochee", () => {
    const s = rig({ hands: [[n("red", 1), n("blue", 2)], [n("yellow", 1)]], top: n("red", 5), settings: nm, drawPile: [n("red", 9), n("green", 3)] });
    expectFail(s, 0, { type: "draw" });
    const t = rig({ hands: [[n("blue", 2)], [n("yellow", 1)]], top: n("red", 5), settings: nm, drawPile: [n("red", 9), n("green", 3)] });
    act(t, 0, { type: "draw" });
    expect(t.players[0]!.hand).toHaveLength(3);
    expectFail(t, 0, { type: "pass" });
    expect(timeoutActions(t)[0]).toMatchObject({ type: "play", cardId: t.drawnCardId });
  });

  it("elimine un joueur qui atteint 25 cartes et donne la manche au dernier survivant", () => {
    const ten = c("wild10");
    const big = Array.from({ length: 16 }, (_, i) => n("green", i % 10));
    const s = rig({ hands: [[ten, n("red", 1)], big], top: n("red", 5), settings: { ...nm, endMode: "points", targetScore: 5000 } });
    act(s, 0, { type: "play", cardId: ten.id, color: "red" });
    expect(s.players[1]!.eliminated).toBe(true);
    expect(s.phase).toBe("roundOver");
    expect(s.lastRound?.winner).toBe("p0");
    expect(s.lastRound?.points).toBe(250);
  });

  it("la roulette fait retourner des cartes jusqu'a la couleur choisie par la victime", () => {
    const roulette = c("wildRoulette");
    const s = rig({
      hands: [[roulette, n("red", 1)], [n("yellow", 1)], [n("green", 2)]],
      top: n("red", 5),
      settings: nm,
      drawPile: [n("blue", 4), c("wild6"), n("yellow", 7), n("green", 8)],
    });
    act(s, 0, { type: "play", cardId: roulette.id });
    expect(viewFor(s, "p1").rouletteVictim).toBe("p1");
    act(s, 1, { type: "roulette", color: "blue" });
    // vert 8, jaune 7, joker +6 (ne compte pas), bleu 4
    expect(s.players[1]!.hand).toHaveLength(5);
    expect(s.color).toBe("blue");
    expect(s.turn).toBe(2);
  });

  it("passe pour tous fait rejouer, defausse tout vide la couleur", () => {
    const skipAll = c("skipAll", "red");
    const discard = c("discardAll", "blue");
    const s = rig({
      hands: [[skipAll, discard, n("blue", 1), n("blue", 2), n("yellow", 3)], [n("yellow", 1)], [n("green", 2)]],
      top: n("red", 5),
      settings: nm,
    });
    act(s, 0, { type: "play", cardId: skipAll.id });
    expect(s.turn).toBe(0);
    s.color = "blue";
    act(s, 0, { type: "play", cardId: discard.id });
    expect(s.players[0]!.hand.map((x) => x.color)).toEqual(["yellow"]);
    expect(s.discard[s.discard.length - 1]!.id).toBe(discard.id);
  });

  it("le joker inversion +4 inverse puis fait piocher le joueur precedent", () => {
    const rev4 = c("wildReverse4");
    const s = rig({ hands: [[rev4, n("red", 1)], [n("yellow", 1)], [n("green", 2)]], top: n("red", 5), settings: nm });
    act(s, 0, { type: "play", cardId: rev4.id, color: "green" });
    expect(s.direction).toBe(-1);
    expect(s.players[2]!.hand).toHaveLength(5);
    expect(s.turn).toBe(1);
  });
});
