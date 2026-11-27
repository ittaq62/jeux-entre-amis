import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig, type CourConfig } from "./config.ts";
import { EPREUVES, EPREUVE_INFO, type EpreuveId } from "./epreuves.ts";
import { buildProgram, createMatch, keepPlan, matchView, tickMatch, type Hooks, type Match } from "./match.ts";

const botsOnly: Hooks = { auto: () => true, live: () => false };

function crowd(n: number, humans = 0) {
  // humans < 0 : tout le monde compte comme vrai joueur (joué par l'ordinateur), pour mesurer une partie sans accéléré
  return Array.from({ length: n }, (_, k) => ({
    id: k < humans ? `h${k}` : `c${k}`,
    human: humans < 0 || k < humans,
    level: "moyen" as const,
  }));
}

/** Une partie jusqu'au bout, à 20 pas par seconde ; rend la partie et sa durée (secondes) */
function play(cfg: CourConfig, n: number, seed: number, program?: EpreuveId[], hooks = botsOnly, humans = 0) {
  let now = 1_000_000;
  const m = createMatch(cfg, crowd(n, humans), seed, now, program ? { program } : {});
  let steps = 0;
  while (m.phase !== "over" && steps < 20 * 60 * 40) {
    now += 50;
    tickMatch(m, now, 0.05, hooks, []);
    steps++;
  }
  return { m, seconds: (now - 1_000_000) / 1000 };
}

describe("La Cour des Grands : le grand jeu", () => {
  it("le programme finit par la finale, avec une épreuve en manches juste avant", () => {
    for (let seed = 1; seed < 40; seed++) {
      const p = buildProgram(DEFAULT_CONFIG, { rng: seed });
      expect(p.length).toBe(6);
      expect(p[p.length - 1]).toBe("polochons");
      expect(EPREUVE_INFO[p[p.length - 2]!].elastic).toBe(true);
      expect(new Set(p).size).toBe(p.length);
    }
  });

  it("les survivants voulus vont de la foule à deux finalistes", () => {
    expect(keepPlan(32, 5)).toEqual([18, 11, 6, 3, 2]);
    expect(keepPlan(16, 3)[2]).toBe(2);
  });

  it("une partie entre bots va au bout : un gagnant, deux finalistes, un classement complet", () => {
    for (const seed of [3, 17, 99]) {
      // Un vrai joueur, joué par l'ordinateur : la partie ne passe pas en accéléré tant qu'il est en lice
      const { m, seconds } = play(DEFAULT_CONFIG, 32, seed, undefined, botsOnly, -1);
      expect(m.phase).toBe("over");
      expect(m.winner).toBeTruthy();
      const final = m.history[m.history.length - 1]!;
      expect(final.ep).toBe("polochons");
      expect(final.count).toBe(2);
      expect(Object.keys(m.ranks!).length).toBe(32);
      expect(m.ranks![m.winner!]).toBe(1);
      // Cinq épreuves et la finale, cinématiques comprises : de trois minutes et demie (entre bots) à vingt-cinq
      expect(seconds).toBeGreaterThan(3.5 * 60);
      expect(seconds).toBeLessThan(25 * 60);
      expect(JSON.stringify(matchView(m, 0)).length).toBeLessThan(60_000);
    }
  });

  it("chaque épreuve se joue seule jusqu'au bout, entre bots, sans tout le monde éliminer", () => {
    for (const ep of [...EPREUVES, "polochons"] as EpreuveId[]) {
      for (const seed of [5, 6]) {
        const n = ep === "polochons" ? 2 : 24;
        const cfg = mergeConfig(DEFAULT_CONFIG, { only: ep });
        const { m, seconds } = play(cfg, n, seed, [ep]);
        expect(m.phase, ep).toBe("over");
        const rec = m.history[0]!;
        expect(rec.ep).toBe(ep);
        expect(rec.out.length, `${ep} : éliminés`).toBeGreaterThan(0);
        expect(rec.out.length, `${ep} : éliminés`).toBeLessThan(n);
        expect(seconds, `${ep} : durée`).toBeLessThan(6 * 60);
      }
    }
  });

  it("sans vrai joueur en lice, la suite se joue en accéléré, mais la finale se regarde", () => {
    // Un vrai joueur qui ne fait rien : éliminé dès le tournesol (il ne court pas), puis la suite en accéléré
    const idle: Hooks = { auto: (id) => !id.startsWith("h"), live: () => true };
    const { m } = play(mergeConfig(DEFAULT_CONFIG, { duree: "longue" }), 24, 11, undefined, idle, 1);
    expect(m.phase).toBe("over");
    expect(m.history.some((h) => h.fast)).toBe(true);
    expect(m.history[m.history.length - 1]!.fast).toBeFalsy();
  });
});

export type { Match };
