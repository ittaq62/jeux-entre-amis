import { describe, expect, it } from "vitest";
import type { RoomSummary } from "./protocol.ts";
import { publicTable } from "./publicTable.ts";

const base: RoomSummary = {
  code: "ABCD",
  game: "uno",
  variant: "classique",
  status: "lobby",
  visibility: "private",
  hostName: "Lucie",
  humans: 2,
  bots: 1,
  maxPlayers: 6,
  names: ["Lucie", "Basile"],
  createdAt: 0,
  quick: false,
  lateJoin: false,
};

describe("publicTable : une table vue sans compte", () => {
  it("dit le jeu, l'hôte et les places : libres, et celles qu'un bot cède avant la partie", () => {
    const t = publicTable(base);
    expect(t).toMatchObject({ code: "ABCD", game: "uno", kind: "table", hostName: "Lucie", status: "lobby", freeSeats: 4 });
  });

  it("ne dit jamais les noms des joueurs ni les règles", () => {
    const t = publicTable(base) as unknown as Record<string, unknown>;
    expect(t.names).toBeUndefined();
    expect(t.variant).toBeUndefined();
    expect(t.visibility).toBeUndefined();
  });

  it("en pleine partie, un bot ne cède pas sa place : seules les places vides comptent", () => {
    expect(publicTable({ ...base, status: "playing" }).freeSeats).toBe(3);
    expect(publicTable({ ...base, status: "playing", humans: 4, bots: 2 }).freeSeats).toBe(0);
  });

  it("une tournée : un bot cède sa place même en cours", () => {
    const t = publicTable({ ...base, game: "tour", status: "playing", maxPlayers: 8, humans: 3, bots: 2 });
    expect(t).toMatchObject({ kind: "tour", freeSeats: 5 });
  });
});
