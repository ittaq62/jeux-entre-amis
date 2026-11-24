// Mèche : la mèche en équipes, le temps promis à la mèche à rallonge, ce qui n'est pas un mot, et des bots qui
// sèchent sur les lettres difficiles et n'écrivent pas de gros mots.
import { describe, expect, it } from "vitest";
import { botPlan } from "./bot.ts";
import {
  DEFAULT_SETTINGS,
  explode,
  holderOf,
  lightFuse,
  MIN_TURN_MS,
  newGame,
  playWord,
  START_MS,
  usePass,
  type MecheGame,
} from "./engine.ts";
import { isRude, NOT_WORDS } from "./exclus.ts";
import { LETTRES } from "./lettres.ts";
import { Vocabulary } from "./words.ts";

const NOW = 1_000_000;

function teamGame(ids: string[], teams: Record<string, number>): MecheGame {
  const g = newGame(ids, { ...DEFAULT_SETTINGS, lives: 2 }, NOW, 42);
  g.teams = teams;
  g.teamWin = true;
  g.holder = 0;
  lightFuse(g, NOW + START_MS);
  return g;
}

describe("Mèche en équipes", () => {
  it("la mèche va toujours à l'autre équipe, et chez elle à tour de rôle, même après une élimination", () => {
    // R1, B1, R2, B2 ; B1 est éliminé
    const g = teamGame(["r1", "b1", "r2", "b2"], { r1: 0, b1: 1, r2: 0, b2: 1 });
    g.players[1]!.lives = 0;
    const seen: string[] = [holderOf(g).id];
    let at = NOW + START_MS + 100;
    for (let k = 0; k < 6; k++) {
      g.players[g.holder]!.passes = 1;
      usePass(g, (at += 200));
      seen.push(holderOf(g).id);
    }
    expect(seen).toEqual(["r1", "b2", "r2", "b2", "r1", "b2", "r2"]);
  });

  it("sans équipes, rien ne change : le suivant encore en jeu", () => {
    const g = newGame(["a", "b", "c"], DEFAULT_SETTINGS, NOW, 42);
    g.holder = 0;
    lightFuse(g, NOW + START_MS);
    g.players[1]!.lives = 0;
    g.players[0]!.passes = 1;
    usePass(g, NOW + START_MS + 200);
    expect(holderOf(g).id).toBe("c");
  });

  it("après une explosion, la mèche repart aussi chez l'autre équipe", () => {
    const g = teamGame(["r1", "b1", "r2", "b2"], { r1: 0, b1: 1, r2: 0, b2: 1 });
    g.players[1]!.lives = 0;
    // La mèche saute chez r1 ; la suivante s'allume chez un bleu (b2), pas chez r2
    explode(g, g.boomAt);
    expect(holderOf(g).id).toBe("b2");
  });
});

describe("Mèche à rallonge, le temps promis", () => {
  it("à très grande vitesse, le suivant a encore au moins le temps promis, même au-delà de la longueur de la corde", () => {
    const g = newGame(["a", "b"], { ...DEFAULT_SETTINGS, mode: "rallonge", pace: "nerveux" }, NOW, 42);
    g.holder = 0;
    lightFuse(g, NOW + START_MS);
    const late = NOW + 240_000;
    g.rope = { ...g.rope!, at: late, left: 400, speed: 9 };
    g.players[0]!.passes = 1;
    usePass(g, late);
    expect(g.boomAt - late).toBeGreaterThanOrEqual(MIN_TURN_MS * 0.7 - 1);
    expect(g.rope!.left).toBeLessThanOrEqual(g.rope!.length);
  });
});

describe("Mèche, ce qui n'est pas un mot", () => {
  it("symboles d'unités, abréviations et formes élidées sont écartés ; les vrais mots courts restent", () => {
    for (const w of ["kmol", "dakat", "ycd", "etc", "janv", "lorsqu", "jusqu", "quelqu"]) expect(NOT_WORDS.has(w), w).toBe(true);
    for (const w of ["mat", "pat", "fat", "mars", "sept", "mol"]) expect(NOT_WORDS.has(w), w).toBe(false);
  });

  it("les gros mots que le premier filtre laissait passer", () => {
    for (const w of ["emmerder", "demerder", "salaud", "batard", "bitte", "chiottes", "garce", "foutu", "violee"])
      expect(isRude(w), w).toBe(true);
    for (const w of ["violet", "violon", "pedalier", "bateau", "salade", "drogue", "merle"]) expect(isRude(w), w).toBe(false);
  });
});

describe("Mèche, les bots", () => {
  it("n'écrivent ni gros mot ni symbole, même quand ce sont les seuls qu'ils connaissent", () => {
    const vocab = new Vocabulary("=1\nemmerder\nsalaud\nkmol\n=2\n=3\n");
    for (const letters of ["mer", "sal", "mol"]) {
      const g = newGame(["bot", "x"], DEFAULT_SETTINGS, NOW, 42);
      g.holder = 0;
      lightFuse(g, NOW + START_MS);
      g.letters = letters;
      const plan = botPlan(g, "fort", vocab, { rng: 7 });
      expect(plan.word, letters).toBeNull();
    }
  });

  it("cherchent plus longtemps des lettres difficiles, et le bot facile y sèche bien plus souvent", () => {
    const vocab = new Vocabulary("=1\nmaison\nchanson\n=2\n=3\n");
    const easy = LETTRES.facile.split(" ")[0]!;
    const hard = LETTRES.dur.split(" ")[0]!;
    const sample = (letters: string) => {
      let think = 0;
      let blanks = 0;
      for (let k = 0; k < 400; k++) {
        const g = newGame(["bot", "x"], DEFAULT_SETTINGS, NOW, 42);
        g.holder = 0;
        lightFuse(g, NOW + START_MS);
        g.letters = letters;
        const plan = botPlan(g, "facile", vocab, { rng: k * 7919 + 13 });
        think += plan.thinkMs;
        // Sans passe, un trou de mémoire se voit à son temps de réflexion allongé (au moins 3 s de plus)
        if (plan.thinkMs > 5000 * 1.75) blanks++;
      }
      return { think: think / 400, blanks };
    };
    const a = sample(easy);
    const b = sample(hard);
    expect(b.think).toBeGreaterThan(a.think * 1.5);
    expect(b.blanks).toBeGreaterThan(a.blanks);
  });
});

describe("Mèche, le jeu continue après ces changements", () => {
  it("un mot passe la mèche à l'adversaire en équipes", () => {
    const g = teamGame(["r1", "b1", "r2", "b2"], { r1: 0, b1: 1, r2: 0, b2: 1 });
    playWord(g, "maison", NOW + START_MS + 500);
    expect(holderOf(g).id).toBe("b1");
  });
});
