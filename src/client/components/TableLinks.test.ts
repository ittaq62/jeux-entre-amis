import { describe, expect, it } from "vitest";
import { presenceText } from "./TableLinks.tsx";

describe("presenceText", () => {
  it("dit où est un ami en ligne", () => {
    expect(presenceText(null)).toBe("en ligne");
    expect(presenceText({ code: "ABCD", game: "uno", status: "lobby" })).toBe("à une table");
    expect(presenceText({ code: "ABCD", game: "uno", status: "playing" })).toBe("en pleine partie");
  });

  it("dit « en tournée » au salon de la tournée comme à l'entracte", () => {
    expect(presenceText({ code: "WXYZ", game: "tour", status: "lobby" })).toBe("en tournée");
    expect(presenceText({ code: "WXYZ", game: "tour", status: "playing" })).toBe("en tournée");
  });

  it("donne le code quand on le demande", () => {
    expect(presenceText({ code: "ABCD", game: "naval", status: "lobby" }, true)).toBe("à la table ABCD");
    expect(presenceText({ code: "ABCD", game: "naval", status: "playing" }, true)).toBe("en pleine partie, table ABCD");
    expect(presenceText({ code: "WXYZ", game: "tour", status: "playing" }, true)).toBe("en tournée, WXYZ");
  });
});
