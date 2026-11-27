import { describe, expect, it } from "vitest";
import { freshNews, isNewGame, NEWS, type NewsItem } from "./news.ts";

const at = (d: string) => Date.parse(d);

describe("isNewGame", () => {
  it("met « Nouveau » sur un jeu arrivé il y a moins de 30 jours", () => {
    expect(isNewGame("billard", at("2026-11-27"))).toBe(true);
    expect(isNewGame("billard", at("2026-12-30"))).toBe(false);
    expect(isNewGame("uno", at("2026-11-27"))).toBe(false);
  });
});

describe("freshNews", () => {
  const news: NewsItem[] = [
    { id: "c", date: "2026-11-27", text: "c" },
    { id: "b", date: "2026-11-26", text: "b", game: "billard" },
    { id: "a", date: "2026-11-25", text: "a" },
    { id: "z", date: "2026-11-01", text: "z" },
  ];

  it("montre les trois plus récentes, parmi les jeux qu'on voit", () => {
    expect(freshNews(["uno", "billard"], null, at("2026-11-28"), news).map((n) => n.id)).toEqual(["c", "b", "a"]);
    expect(freshNews(["uno"], null, at("2026-11-28"), news).map((n) => n.id)).toEqual(["c", "a"]);
  });

  it("se tait quand la plus récente a été vue, et revient avec une nouvelle", () => {
    expect(freshNews(["uno"], "c", at("2026-11-28"), news)).toEqual([]);
    expect(freshNews(["uno"], "a", at("2026-11-28"), news).map((n) => n.id)).toEqual(["c", "a"]);
  });

  it("oublie ce qui a plus de trois semaines", () => {
    expect(freshNews(["uno"], null, at("2026-12-25"), news)).toEqual([]);
  });

  it("les nouveautés du site sont rangées de la plus récente à la plus ancienne", () => {
    const dates = NEWS.map((n) => n.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(NEWS.map((n) => n.id)).size).toBe(NEWS.length);
  });
});
