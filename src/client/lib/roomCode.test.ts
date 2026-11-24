import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET } from "../../shared/app.ts";
import { readRoomCode, roomCodeProblem } from "./roomCode.ts";

describe("readRoomCode", () => {
  it("garde les lettres tapées, en majuscules, jusqu'à quatre", () => {
    expect(readRoomCode("a")).toBe("A");
    expect(readRoomCode("abc")).toBe("ABC");
    expect(readRoomCode("abcd")).toBe("ABCD");
    expect(readRoomCode("abcde")).toBe("ABCD");
    expect(readRoomCode("ab-cd")).toBe("ABCD");
    expect(readRoomCode("")).toBe("");
  });

  it("trouve le code dans un lien collé", () => {
    expect(readRoomCode("https://jouer.latablee.workers.dev/salon/WXYZ")).toBe("WXYZ");
    expect(readRoomCode("http://localhost:5173/salon/abcd?regarder")).toBe("ABCD");
    expect(readRoomCode("  https://jouer.latablee.workers.dev/salon/KLMN/  ")).toBe("KLMN");
  });

  it("trouve le code dans un message", () => {
    expect(readRoomCode("Rejoins ma table, code ABCD")).toBe("ABCD");
    expect(readRoomCode("Le code : wxyz !")).toBe("WXYZ");
    // « CODE » et « VITE » ne peuvent pas être des codes (O et I) : c'est bien le dernier mot possible qui est pris
    expect(readRoomCode("Viens vite, code PQRS")).toBe("PQRS");
  });

  it("ne prend pas un lien d'une autre page pour un code", () => {
    // Pas de /salon/ ni de mot de quatre lettres possible : les premières lettres, comme si on tapait
    expect(readRoomCode("https://exemple.fr")).toBe("HTTP");
  });
});

describe("roomCodeProblem", () => {
  it("accepte un code de quatre lettres de l'alphabet des codes", () => {
    expect(roomCodeProblem("ABCD")).toBeNull();
  });

  it("dit qu'il manque des lettres", () => {
    expect(roomCodeProblem("ABC")).toBe("Un code de table fait 4 lettres.");
  });

  it("explique pourquoi un code à I ou O n'existe pas", () => {
    expect(ROOM_CODE_ALPHABET).not.toContain("I");
    expect(ROOM_CODE_ALPHABET).not.toContain("O");
    expect(roomCodeProblem("ABIO")).toBe(
      "Les codes de table n'ont ni I ni O, pour ne pas les confondre avec 1 et 0 : vérifie les lettres I et O.",
    );
    expect(roomCodeProblem("ABCO")).toBe(
      "Les codes de table n'ont ni I ni O, pour ne pas les confondre avec 1 et 0 : vérifie la lettre O.",
    );
  });
});
