// Une couleur par balle à la table : deux joueurs n'ont jamais la même, un bot cède la sienne.
import { describe, expect, it } from "vitest";
import { BALL_COLORS, claimColor, type ColorSeat } from "./looks.ts";

const seat = (id: string, kind: "human" | "bot", color: string): ColorSeat => ({
  id,
  kind,
  look: { color, pattern: "unie", trail: "fil" },
});
const colors = (seats: ColorSeat[]) => seats.map((s) => s.look.color);

describe("une couleur par balle", () => {
  it("une couleur libre : il l'a", () => {
    const seats = [seat("ana", "human", "blanche"), seat("bob", "human", "blanche")];
    claimColor(seats, "bob", "bleue");
    expect(colors(seats)).toEqual(["blanche", "bleue"]);
  });

  it("la couleur d'un autre joueur reste à lui : la suivante de libre, le motif et la traînée gardés", () => {
    const seats = [seat("ana", "human", "rouge"), seat("cid", "human", "orange"), seat("bob", "human", "blanche")];
    seats[2]!.look = { color: "blanche", pattern: "pois", trail: "flammes" };
    claimColor(seats, "bob", "rouge");
    expect(seats[2]!.look).toEqual({ color: "jaune", pattern: "pois", trail: "flammes" });
  });

  it("au bout de la liste, on repart du début", () => {
    const seats = [seat("ana", "human", "noire"), seat("bob", "human", "rouge")];
    claimColor(seats, "bob", "noire");
    expect(seats[1]!.look.color).toBe("blanche");
  });

  it("un bot cède sa couleur et en prend une libre", () => {
    const seats = [seat("ana", "human", "blanche"), seat("bot-1", "bot", "verte"), seat("bob", "human", "rouge")];
    claimColor(seats, "bob", "verte");
    expect(seats[2]!.look.color).toBe("verte");
    expect(new Set(colors(seats)).size).toBe(3);
  });

  it("huit à la table, chacun la même envie : huit couleurs différentes", () => {
    const seats = Array.from({ length: 8 }, (_, i) => seat(`p${i}`, i % 3 === 2 ? "bot" : "human", BALL_COLORS[i]!.id));
    for (const s of seats) if (s.kind === "human") claimColor(seats, s.id, "blanche");
    expect(new Set(colors(seats)).size).toBe(8);
  });
});
