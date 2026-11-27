import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, starAchievementsEarned, starAchievementsOf } from "./achievements.ts";
import { STAR_GAMES } from "./starMaps.ts";
import { formatStarValue, groupStars, MAX_STARS, nextStar, starsFor, validRule, type StarGame, type StarRule } from "./stars.ts";

const chrono: StarRule = { better: "lower", goals: [90_000, 75_000, 65_000], unit: "time" };
const score: StarRule = { better: "higher", goals: [500, 900, 1200], unit: "points" };

describe("les étoiles d'un résultat", () => {
  it("un temps : plus il est court, plus il y a d'étoiles, et atteindre le seuil suffit", () => {
    expect(starsFor(95_000, chrono)).toBe(0);
    expect(starsFor(90_000, chrono)).toBe(1);
    expect(starsFor(80_000, chrono)).toBe(1);
    expect(starsFor(75_000, chrono)).toBe(2);
    expect(starsFor(64_999, chrono)).toBe(3);
  });

  it("un score : plus il est haut, plus il y a d'étoiles", () => {
    expect(starsFor(499, score)).toBe(0);
    expect(starsFor(500, score)).toBe(1);
    expect(starsFor(1199, score)).toBe(2);
    expect(starsFor(5000, score)).toBe(3);
  });

  it("un résultat absurde ne donne rien", () => {
    expect(starsFor(Number.NaN, chrono)).toBe(0);
    expect(starsFor(Number.POSITIVE_INFINITY, score)).toBe(0);
  });

  it("la prochaine étoile et son seuil, puis plus rien quand les trois sont là", () => {
    expect(nextStar(0, chrono)).toEqual({ stars: 1, goal: 90_000 });
    expect(nextStar(2, score)).toEqual({ stars: 3, goal: 1200 });
    expect(nextStar(3, chrono)).toBeNull();
  });

  it("des seuils dans le mauvais ordre sont refusés", () => {
    expect(validRule(chrono)).toBe(true);
    expect(validRule(score)).toBe(true);
    expect(validRule({ better: "lower", goals: [60, 70, 80], unit: "strokes" })).toBe(false);
    expect(validRule({ better: "higher", goals: [3, 3, 4], unit: "points" })).toBe(false);
  });

  it("les valeurs s'écrivent comme on les lit", () => {
    expect(formatStarValue(65_340, "time")).toBe("1:05,3");
    expect(formatStarValue(42_000, "time")).toBe("42,0 s");
    expect(formatStarValue(1, "strokes")).toBe("1 coup");
    expect(formatStarValue(23, "strokes")).toBe("23 coups");
    expect(formatStarValue(1200, "points").replace(/\s/g, " ")).toBe("1 200 points");
  });
});

describe("les cartes déclarées par les jeux (starMaps.ts)", () => {
  it("chaque jeu et chaque carte ont un identifiant unique, un nom et des seuils qui ont un sens", () => {
    const games = STAR_GAMES.map((g) => g.game);
    expect(new Set(games).size).toBe(games.length);
    for (const g of STAR_GAMES) {
      expect(g.maps.length, g.game).toBeGreaterThan(0);
      const ids = g.maps.map((m) => m.id);
      expect(new Set(ids).size, g.game).toBe(ids.length);
      for (const m of g.maps) {
        expect(m.name.length, `${g.game}/${m.id}`).toBeGreaterThan(0);
        expect(validRule(m.rule), `${g.game}/${m.id}`).toBe(true);
      }
    }
  });

  it("chaque jeu à étoiles a ses trois succès", () => {
    for (const g of STAR_GAMES)
      for (const suffix of ["3", "moitie", "toutes"]) expect(ACHIEVEMENTS.some((a) => a.id === `${g.game}-etoiles-${suffix}`)).toBe(true);
  });
});

describe("les succès d'étoiles", () => {
  const golf: StarGame = {
    game: "minigolf",
    name: "Minigolf",
    maps: [
      { id: "a", name: "A", rule: { better: "lower", goals: [30, 26, 23], unit: "strokes" } },
      { id: "b", name: "B", rule: { better: "lower", goals: [30, 26, 23], unit: "strokes" } },
    ],
  };

  it("trois succès par jeu, aux titres à son nom", () => {
    const defs = starAchievementsOf(golf);
    expect(defs.map((d) => d.id)).toEqual(["minigolf-etoiles-3", "minigolf-etoiles-moitie", "minigolf-etoiles-toutes"]);
    expect(defs.every((d) => d.title.startsWith("Minigolf"))).toBe(true);
    expect(defs[2]!.goal).toBe(2 * MAX_STARS);
  });

  it("tombent au bon moment", () => {
    expect(starAchievementsEarned(golf, { a: 2 })).toEqual([]);
    expect(starAchievementsEarned(golf, { a: 3 })).toEqual(["minigolf-etoiles-3", "minigolf-etoiles-moitie"]);
    expect(starAchievementsEarned(golf, { a: 2, b: 1 })).toEqual(["minigolf-etoiles-moitie"]);
    expect(starAchievementsEarned(golf, { a: 3, b: 3 })).toEqual([
      "minigolf-etoiles-3",
      "minigolf-etoiles-moitie",
      "minigolf-etoiles-toutes",
    ]);
  });

  it("une carte inconnue ou un nombre absurde ne comptent pas", () => {
    expect(starAchievementsEarned(golf, { z: 3, a: 9 })).toEqual(["minigolf-etoiles-3", "minigolf-etoiles-moitie"]);
  });
});

describe("les groupes de cartes et les paliers", () => {
  const rule: StarRule = { better: "lower", goals: [9, 3, 2], unit: "strokes" };
  const golf: StarGame = {
    game: "minigolf",
    name: "Minigolf",
    maps: ["v1", "v2", "j1"].map((id) => ({ id, name: id, rule })),
    groups: [
      { id: "volcan", name: "Le Volcan", maps: ["v1", "v2"] },
      { id: "jardin", name: "Le Jardin", maps: ["j1"] },
    ],
    milestones: [4, 9],
  };

  it("chaque groupe a son succès, chaque palier aussi (sauf celui qui vaut « toutes les étoiles »)", () => {
    const ids = starAchievementsOf(golf).map((d) => d.id);
    expect(ids).toContain("minigolf-etoiles-groupe-volcan");
    expect(ids).toContain("minigolf-etoiles-groupe-jardin");
    expect(ids).toContain("minigolf-etoiles-4");
    expect(ids).not.toContain("minigolf-etoiles-9");
    const titles = starAchievementsOf(golf).map((d) => d.title);
    expect(titles).toContain("Minigolf, le Volcan : toutes les étoiles");
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("le succès d'un groupe tombe quand toutes ses cartes ont trois étoiles", () => {
    expect(starAchievementsEarned(golf, { v1: 3, v2: 2 })).not.toContain("minigolf-etoiles-groupe-volcan");
    expect(starAchievementsEarned(golf, { v1: 3, v2: 3 })).toContain("minigolf-etoiles-groupe-volcan");
    expect(starAchievementsEarned(golf, { v1: 3, v2: 3 })).not.toContain("minigolf-etoiles-groupe-jardin");
  });

  it("un palier tombe au bon total", () => {
    expect(starAchievementsEarned(golf, { v1: 2, j1: 1 })).not.toContain("minigolf-etoiles-4");
    expect(starAchievementsEarned(golf, { v1: 2, j1: 2 })).toContain("minigolf-etoiles-4");
  });

  it("les étoiles d'un groupe, d'après celles des cartes", () => {
    expect(groupStars(golf.groups![0]!, { v1: { stars: 3 }, v2: 1 })).toEqual({ total: 4, max: 6 });
    expect(groupStars(golf.groups![1]!, {})).toEqual({ total: 0, max: 3 });
  });
});
