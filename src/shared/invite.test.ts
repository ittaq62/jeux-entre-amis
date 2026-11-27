import { describe, expect, it } from "vitest";
import type { PublicTable } from "./publicTable.ts";
import { invitedCode, inviteDetails, inviteTitle } from "./invite.ts";

const table = (over: Partial<PublicTable> = {}): PublicTable => ({
  code: "ABCD",
  game: "bowling",
  kind: "table",
  hostName: "Léa",
  status: "lobby",
  humans: 2,
  bots: 0,
  maxPlayers: 4,
  freeSeats: 2,
  lateJoin: true,
  ...over,
});

describe("invitedCode", () => {
  it("trouve le code de la table où mène la connexion", () => {
    expect(invitedCode("/salon/ABCD")).toBe("ABCD");
    expect(invitedCode("/salon/abcd?jouer")).toBe("ABCD");
    expect(invitedCode("/salon/WXYZ/")).toBe("WXYZ");
  });

  it("ne voit pas d'invitation ailleurs", () => {
    expect(invitedCode("/")).toBeNull();
    expect(invitedCode("/amis")).toBeNull();
    expect(invitedCode("/salon/ABCDE")).toBeNull();
    expect(invitedCode("https://exemple.fr/salon/ABCD")).toBeNull();
  });
});

describe("inviteTitle", () => {
  it("dit qui attend, et à quel jeu", () => {
    expect(inviteTitle(table())).toBe("Léa t'attend pour une partie de Bowling");
    expect(inviteTitle(table({ game: "naval" }))).toBe("Léa t'attend pour une partie de Bataille navale");
  });

  it("parle de la tournée", () => {
    expect(inviteTitle(table({ game: "tour", kind: "tour" }))).toBe("Léa t'invite à sa tournée");
  });

  it("sans hôte assis, la table attend quand même", () => {
    expect(inviteTitle(table({ hostName: "" }))).toBe("Une table de Bowling t'attend");
    expect(inviteTitle(table({ game: "tour", kind: "tour", hostName: " " }))).toBe("Une tournée t'attend");
  });
});

describe("inviteDetails", () => {
  it("compte les places libres", () => {
    expect(inviteDetails(table())).toBe("Table ABCD · 2 places libres");
    expect(inviteDetails(table({ freeSeats: 1 }))).toBe("Table ABCD · 1 place libre");
    expect(inviteDetails(table({ freeSeats: 0 }))).toBe("Table ABCD · complète pour l'instant");
  });

  it("dit si la partie a commencé, et si on peut encore y entrer", () => {
    expect(inviteDetails(table({ status: "playing" }))).toBe("Table ABCD · partie en cours, tu peux la rejoindre");
    expect(inviteDetails(table({ status: "playing", lateJoin: false }))).toBe("Table ABCD · partie en cours");
    expect(inviteDetails(table({ status: "playing", freeSeats: 0 }))).toBe("Table ABCD · partie en cours, complète pour l'instant");
    expect(inviteDetails(table({ status: "finished" }))).toBe("Table ABCD · partie terminée");
    expect(inviteDetails(table({ game: "tour", kind: "tour" }))).toBe("Tournée ABCD · 2 places libres");
  });
});
