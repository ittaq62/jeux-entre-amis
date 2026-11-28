import { describe, expect, it } from "vitest";
import { atGame, eveningLine, streak, type EveningInput } from "./evening.ts";

const base: EveningInput = { gameName: "UNO", rank: 2, winsInGame: 4, winsTonight: 0, rivals: [] };

describe("le sel d'une soirée : une ligne tirée des chiffres", () => {
  it("compte une série depuis la partie la plus récente, et s'arrête au premier changement ou à l'égalité", () => {
    expect(
      streak([
        { mine: 2, theirs: 1 },
        { mine: 3, theirs: 1 },
        { mine: 2, theirs: 1 },
        { mine: 1, theirs: 2 },
      ]),
    ).toEqual({ count: 3, mine: false });
    expect(streak([{ mine: 1, theirs: 1 }])).toEqual({ count: 0, mine: false });
    expect(streak([])).toEqual({ count: 0, mine: false });
  });

  it("dit la plus longue série contre un ami, dans les deux sens", () => {
    const lose = [1, 2, 3].map(() => ({ mine: 2, theirs: 1 }));
    expect(eveningLine({ ...base, rivals: [{ name: "Basile", duels: lose }] })).toBe("Basile te bat pour la 3e fois d'affilée au UNO.");
    const win = [1, 2, 3, 4].map(() => ({ mine: 1, theirs: 2 }));
    expect(
      eveningLine({
        ...base,
        rank: 1,
        rivals: [
          { name: "Basile", duels: lose },
          { name: "Chloé", duels: win },
        ],
      }),
    ).toBe("Tu bats Chloé pour la 4e fois d'affilée au UNO.");
  });

  it("deux de suite ne suffisent pas ; à défaut, la première victoire à ce jeu, puis les victoires de la soirée", () => {
    const two = [1, 2].map(() => ({ mine: 2, theirs: 1 }));
    expect(eveningLine({ ...base, rivals: [{ name: "Basile", duels: two }] })).toBeNull();
    expect(eveningLine({ ...base, gameName: "Billard", rank: 1, winsInGame: 1, winsTonight: 1 })).toBe(
      "Ta toute première victoire au Billard !",
    );
    expect(eveningLine({ ...base, rank: 1, winsTonight: 3 })).toBe("Ta 3e victoire de la soirée.");
    expect(eveningLine({ ...base, rank: 1, winsTonight: 1 })).toBeNull();
  });

  it("met la bonne préposition devant le jeu", () => {
    expect(atGame("Briques")).toBe("aux Briques");
    expect(atGame("Bataille navale")).toBe("à la bataille navale");
    expect(atGame("Mèche")).toBe("à Mèche");
    expect(atGame("Culbute")).toBe("à Culbute");
    expect(atGame("Toque !")).toBe("à Toque !");
    // Un nom qui finit par « ! » ne prend ni point ni second « ! »
    expect(eveningLine({ ...base, gameName: "Toque !", rank: 1, winsInGame: 1 })).toBe("Ta toute première victoire à Toque !");
    const lose = [1, 2, 3].map(() => ({ mine: 2, theirs: 1 }));
    expect(eveningLine({ ...base, gameName: "Toque !", rivals: [{ name: "Basile", duels: lose }] })).toBe(
      "Basile te bat pour la 3e fois d'affilée à Toque !",
    );
    expect(atGame("Bowling")).toBe("au Bowling");
    expect(atGame("La Cour des Grands")).toBe("à La Cour des Grands");
    expect(atGame("La Tournée")).toBe("à la tournée");
  });
});
