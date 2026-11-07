import { describe, expect, it } from "vitest";
import { botPlan } from "./bot.ts";
import {
  checkWord,
  DEFAULT_SETTINGS,
  explode,
  fuseTimes,
  holderOf,
  lightFuse,
  MAX_PASSES,
  MIN_TURN_MS,
  newGame,
  playWord,
  START_MS,
  usePass,
  type MecheGame,
  type MecheSettings,
} from "./engine.ts";
import { LETTRES } from "./lettres.ts";
import { mecheView } from "./view.ts";
import { cleanShown, Dictionary, normalizeWord, promptRange, Vocabulary } from "./words.ts";

// Les vraies listes, lues sur le disque : le dossier src/shared ne connaît pas les types de Node, d'où l'import par une variable
const fsModule = "node:fs";
const { readFileSync } = (await import(fsModule)) as {
  readFileSync: { (path: string): Uint8Array; (path: string, encoding: "utf8"): string };
};
const dico = new Dictionary(new Uint8Array(readFileSync("public/meche/mots.txt")));
const vocab = new Vocabulary(readFileSync("public/meche/courants.txt", "utf8"));
const known = (w: string) => dico.has(w);

const NOW = 1_000_000;

function game(settings: Partial<MecheSettings> = {}, players = 3): MecheGame {
  const g = newGame(
    Array.from({ length: players }, (_, i) => `p${i}`),
    { ...DEFAULT_SETTINGS, ...settings },
    NOW,
    42,
  );
  g.holder = 0;
  return g;
}

function lit(settings: Partial<MecheSettings> = {}, players = 3): MecheGame {
  const g = game(settings, players);
  lightFuse(g, NOW + START_MS);
  return g;
}

describe("les mots", () => {
  it("oublie les accents, les majuscules, les tirets et les ligatures", () => {
    expect(normalizeWord("Été")).toBe("ete");
    expect(normalizeWord("Cœur")).toBe("coeur");
    expect(normalizeWord("EX-ÆQUO")).toBe("exaequo");
    expect(normalizeWord("porte-monnaie")).toBe("portemonnaie");
    expect(normalizeWord("aujourd’hui")).toBe("aujourdhui");
    expect(normalizeWord(" maïs 12 ")).toBe("mais");
  });

  it("garde les accents à l'écran, sans rien laisser passer d'autre", () => {
    expect(cleanShown("Nié")).toBe("nié");
    expect(cleanShown(" Cœur-de-lion ! 42")).toBe("cœur-de-lion");
    expect(cleanShown("maisonЖЖ<b>")).toBe("maisonb");
    expect(cleanShown(12)).toBe("");
    // Réduit à ses lettres, l'affichage redonne le mot vérifié
    expect(normalizeWord(cleanShown("Éléphant"))).toBe("elephant");
  });

  it("souligne les lettres imposées dans le mot écrit avec ses accents", () => {
    expect(promptRange("nié", "nie")).toEqual([0, 3]);
    expect(promptRange("élève", "lev")).toEqual([1, 4]);
    expect(promptRange("cœur", "oe")).toEqual([1, 2]);
    expect(promptRange("maison", "ou")).toBeNull();
  });

  it("trouve les mots du dictionnaire, conjugués ou au pluriel", () => {
    for (const w of ["maison", "ecole", "mangeons", "chevaux", "xylophone", "kayak", "oeuf", "aujourdhui", "portemonnaie", "zythums"]) {
      expect(dico.has(w), w).toBe(true);
    }
  });

  it("refuse le reste, sans se tromper aux extrémités de la liste", () => {
    for (const w of ["", "qsdfgh", "maisonn", "maiso", "paris2", "zzzzzz", "aaaaaa", "hlm", "#"]) expect(dico.has(w), w).toBe(false);
  });

  it("ne garde ni noms propres ni sigles, ni les injures visant quelqu'un", () => {
    for (const w of ["marseille", "cnrs", "socrate", "strasbourg", "bougnoule"]) expect(dico.has(w), w).toBe(false);
  });

  it("trouve un mot courant qui contient des lettres, et respecte ce qui est écarté", () => {
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const w = vocab.pick("ou", 1, rnd, () => true);
    expect(w?.word).toContain("ou");
    expect(normalizeWord(w!.shown)).toBe(w!.word);
    // Les bots écrivent avec les accents
    const accented = vocab.pick("ecol", 1, rnd, (x) => x === "ecole");
    expect(accented).toEqual({ word: "ecole", shown: "école" });
    expect(vocab.pick("ou", 1, rnd, () => false)).toBeNull();
    expect(vocab.pick("qqq", 3, rnd, () => true)).toBeNull();
  });

  it("n'impose que des lettres pour lesquelles il existe assez de mots", () => {
    for (const list of Object.values(LETTRES)) {
      for (const g of list.split(" ")) expect(vocab.count(g), g).toBeGreaterThanOrEqual(10);
    }
    expect(vocab.count("ou")).toBeGreaterThan(1000);
  });
});

describe("la mèche", () => {
  it("attend avant de s'allumer, puis tombe sur des lettres", () => {
    const g = game();
    expect(g.phase).toBe("break");
    expect(g.letters).toBe("");
    const ev = lightFuse(g, NOW + START_MS);
    expect(g.phase).toBe("lit");
    expect(g.letters.length).toBeGreaterThanOrEqual(2);
    expect(ev[0]).toMatchObject({ type: "lit", fuse: 1, holder: "p0" });
  });

  it("explose dans la zone rouge, jamais avant", () => {
    for (let seed = 1; seed < 200; seed++) {
      const g = newGame(["a", "b"], DEFAULT_SETTINGS, NOW, seed);
      lightFuse(g, NOW);
      expect(g.boomAt).toBeGreaterThanOrEqual(g.safeUntil);
      expect(g.boomAt).toBeLessThanOrEqual(g.maxUntil);
    }
  });

  it("raccourcit à chaque explosion, sans tomber sous un minimum, et suit le rythme choisi", () => {
    const first = fuseTimes("normal", 0);
    expect(fuseTimes("normal", 5).max).toBeLessThan(first.max);
    expect(fuseTimes("normal", 200)).toEqual({ safe: 7000, max: 13000 });
    expect(fuseTimes("pose", 0).max).toBeGreaterThan(first.max);
    expect(fuseTimes("nerveux", 0).max).toBeLessThan(first.max);
  });

  it("ne dévoile jamais l'heure de l'explosion aux joueurs", () => {
    const g = lit();
    expect(JSON.stringify(mecheView(g))).not.toContain("boomAt");
    expect(JSON.stringify(mecheView(g))).not.toContain(String(g.boomAt));
  });

  it("laisse au suivant le temps de lire, même au tout dernier moment", () => {
    const g = lit();
    g.letters = "ou";
    const late = g.boomAt - 100;
    playWord(g, "maison", late);
    expect(g.boomAt).toBeGreaterThanOrEqual(late + MIN_TURN_MS);
    expect(g.maxUntil).toBeGreaterThanOrEqual(g.boomAt);
  });

  it("accorde des sursis de plus en plus courts : même très rapides, les joueurs finissent par sauter", () => {
    const g = lit({}, 2);
    let now = g.boomAt - 100;
    const gaps: number[] = [];
    for (let i = 0; i < 12; i++) {
      g.letters = "ou";
      playWord(g, `mot${i}`, now);
      gaps.push(g.boomAt - now);
      now = g.boomAt - 100;
    }
    expect(gaps[0]).toBe(MIN_TURN_MS);
    expect(gaps[1]).toBeLessThan(gaps[0]!);
    expect(gaps.at(-1)).toBe(1000);
  });

  it("ne touche pas au temps quand il en reste assez", () => {
    const g = lit();
    const boomAt = g.boomAt;
    g.letters = "ou";
    playWord(g, "bouteille", g.litAt + 1000);
    expect(g.boomAt).toBe(boomAt);
  });
});

describe("les mots joués", () => {
  it("accepte un mot qui contient les lettres, attachées et dans l'ordre", () => {
    const g = lit();
    g.letters = "ai";
    expect(checkWord(g, "maison", known)).toBeNull();
    expect(checkWord(g, "ia", known)).toBe("lettres");
    expect(checkWord(g, "ami", known)).toBe("lettres");
  });

  it("accepte les lettres seules quand elles font un mot (« nié » pour NIE), pas en dessous de trois lettres", () => {
    const g = lit();
    g.letters = "nie";
    expect(checkWord(g, normalizeWord("nié"), known)).toBeNull();
    g.letters = "on";
    expect(checkWord(g, "on", known)).toBe("court");
  });

  it("refuse l'inconnu et le déjà joué", () => {
    const g = lit();
    g.letters = "eau";
    expect(checkWord(g, "ea", known)).toBe("lettres");
    expect(checkWord(g, "eauxqsd", known)).toBe("inconnu");
    expect(checkWord(g, "bateau", known)).toBeNull();
    playWord(g, "bateau", NOW + START_MS + 500);
    g.letters = "eau";
    expect(checkWord(g, "bateau", known)).toBe("grille");
    expect(checkWord(g, "eau", known)).toBeNull();
  });

  it("passe la mèche au suivant avec de nouvelles lettres, sur un autre tour", () => {
    const g = lit();
    const turn = g.turn;
    const ev = playWord(g, "maison", NOW + START_MS + 2000);
    expect(holderOf(g).id).toBe("p1");
    expect(g.turn).toBe(turn + 1);
    expect(g.letters.length).toBeGreaterThanOrEqual(2);
    expect(ev[0]).toMatchObject({ type: "word", id: "p0", word: "maison", shown: "maison", next: "p1", ms: 2000, long: false });
  });

  it("garde le souvenir du plus long mot, tel qu'il a été écrit, et du plus rapide", () => {
    const g = lit({}, 2);
    playWord(g, "eleve", NOW + START_MS + 2000, "élève");
    expect(g.log.at(-1)).toEqual({ word: "eleve", by: "p0", shown: "élève" });
    expect(g.players[0]!.best).toBe("élève");
    g.holder = 0;
    playWord(g, "maison", NOW + START_MS + 3000);
    playWord(g, "ami", NOW + START_MS + 4000);
    playWord(g, "cheval", NOW + START_MS + 4500);
    const p0 = g.players[0]!;
    expect(p0.best).toBe("maison");
    expect(p0.stats).toMatchObject({ words: 3, letters: 17, longest: 6, fastest: 500 });
  });
});

describe("les passes", () => {
  it("un grand mot en rapporte une, jusqu'à deux au plus", () => {
    const g = lit({}, 2);
    const long = ["bibliothecaire", "constitution", "photographie"];
    for (const w of long) {
      g.holder = 0;
      playWord(g, w, NOW + START_MS + 1000);
    }
    expect(g.players[0]!.passes).toBe(MAX_PASSES);
    expect(g.players[0]!.stats.passesEarned).toBe(MAX_PASSES);
  });

  it("un mot plus court, ou la règle désactivée, n'en rapporte pas", () => {
    const g = lit();
    playWord(g, "maison", NOW + START_MS + 1000);
    expect(g.players[0]!.passes).toBe(0);
    const off = lit({ passes: false });
    playWord(off, "bibliothecaire", NOW + START_MS + 1000);
    expect(off.players[0]!.passes).toBe(0);
  });

  it("envoie la mèche au suivant avec les mêmes lettres", () => {
    const g = lit();
    g.players[0]!.passes = 1;
    const letters = g.letters;
    const ev = usePass(g, NOW + START_MS + 1000);
    expect(ev[0]).toMatchObject({ type: "pass", id: "p0", next: "p1" });
    expect(g.letters).toBe(letters);
    expect(g.players[0]!.passes).toBe(0);
    expect(holderOf(g).id).toBe("p1");
  });

  it("ne marche pas sans passe en poche", () => {
    const g = lit();
    expect(usePass(g, NOW + START_MS + 1000)).toEqual([]);
    expect(holderOf(g).id).toBe("p0");
  });
});

describe("les explosions", () => {
  it("coûte une allumette, et le suivant repart sur une nouvelle mèche", () => {
    const g = lit();
    const ev = explode(g, g.boomAt);
    expect(ev[0]).toMatchObject({ type: "boom", id: "p0", lives: 2, place: null });
    expect(g.phase).toBe("break");
    expect(g.letters).toBe("");
    expect(holderOf(g).id).toBe("p1");
    lightFuse(g, g.breakUntil);
    expect(g.fuse).toBe(2);
  });

  it("élimine à la dernière allumette, et le suivant saute les éliminés", () => {
    const g = lit({ lives: 1 }, 3);
    const ev = explode(g, g.boomAt);
    expect(ev[0]).toMatchObject({ type: "boom", id: "p0", lives: 0, place: 3 });
    lightFuse(g, g.breakUntil);
    playWord(g, "maison", g.litAt + 100);
    expect(holderOf(g).id).toBe("p2");
    playWord(g, "cheval", g.litAt + 200);
    expect(holderOf(g).id).toBe("p1");
  });

  it("le dernier debout gagne, et tout le monde a sa place", () => {
    const g = lit({ lives: 1 }, 3);
    explode(g, g.boomAt);
    lightFuse(g, g.breakUntil);
    const ev = explode(g, g.boomAt);
    expect(ev[1]).toEqual({ type: "over", winner: "p2" });
    expect(g.phase).toBe("over");
    expect(g.ranks).toEqual({ p2: 1, p1: 2, p0: 3 });
    expect(g.ranking).toEqual(["p2", "p1", "p0"]);
    expect(g.players[2]!.stats.livesLeft).toBe(1);
    expect(explode(g, g.boomAt + 1)).toEqual([]);
  });
});

describe("le Marabout", () => {
  it("les lettres viennent de la fin du mot d'avant", () => {
    const g = lit({ source: "marabout" });
    playWord(g, "maison", NOW + START_MS + 500);
    expect(g.letters).toBe("on");
  });

  it("tire au sort quand la fin du mot laisse trop peu de choix, ou après une explosion", () => {
    const g = lit({ source: "marabout" });
    playWord(g, "ptyx", NOW + START_MS + 500);
    expect(g.letters).not.toBe("yx");
    explode(g, g.boomAt);
    expect(g.lastWord).toBeNull();
  });
});

describe("les bots", () => {
  /** Une partie entière entre bots : tous leurs mots doivent être bons, et elle doit finir */
  function simulate(settings: Partial<MecheSettings>, players: number, seed: number) {
    const g = newGame(
      Array.from({ length: players }, (_, i) => `b${i}`),
      { ...DEFAULT_SETTINGS, ...settings },
      NOW,
      seed,
    );
    const h = { rng: seed * 7 };
    let now = NOW;
    let words = 0;
    let guard = 0;
    while (g.phase !== "over" && guard++ < 20000) {
      if (g.phase === "break") {
        now = g.breakUntil;
        lightFuse(g, now);
        continue;
      }
      const plan = botPlan(g, settings.botLevel ?? "moyen", vocab, h);
      const at = now + plan.thinkMs + (plan.word?.shown.length ?? 0) * plan.letterMs;
      if (at >= g.boomAt) {
        now = g.boomAt;
        explode(g, now);
      } else if (plan.pass) {
        now = at;
        usePass(g, now);
      } else if (plan.word) {
        expect(checkWord(g, plan.word.word, known), `${plan.word.word} pour ${g.letters}`).toBeNull();
        expect(normalizeWord(plan.word.shown)).toBe(plan.word.word);
        now = at;
        playWord(g, plan.word.word, now, plan.word.shown);
        words++;
      } else {
        now = g.boomAt;
        explode(g, now);
      }
    }
    return { g, words, minutes: (now - NOW) / 60_000 };
  }

  it("jouent des mots valables jusqu'au bout de la partie", () => {
    for (const botLevel of ["facile", "moyen", "fort"] as const) {
      for (const seed of [3, 11, 29]) {
        const { g, words } = simulate({ botLevel }, 4, seed);
        expect(g.phase).toBe("over");
        expect(words).toBeGreaterThan(0);
        expect(new Set(Object.values(g.ranks!)).size).toBe(4);
      }
    }
  });

  it("tiennent aussi le Marabout, et une partie reste courte", () => {
    const { g, minutes } = simulate({ source: "marabout", botLevel: "fort" }, 4, 5);
    expect(g.phase).toBe("over");
    expect(minutes).toBeLessThan(15);
    const normal = simulate({ botLevel: "moyen" }, 4, 8);
    expect(normal.minutes).toBeGreaterThan(1);
    expect(normal.minutes).toBeLessThan(8);
  });

  it("n'ont pas de vocabulaire équivalent selon le niveau", () => {
    const counted = (level: "facile" | "fort") => {
      let found = 0;
      const h = { rng: 99 };
      const list = LETTRES.corse.split(" ");
      for (const letters of list.slice(0, 200)) {
        const g = lit({}, 2);
        g.letters = letters;
        if (botPlan(g, level, vocab, h).word) found++;
      }
      return found;
    };
    expect(counted("fort")).toBeGreaterThan(counted("facile"));
  });
});
