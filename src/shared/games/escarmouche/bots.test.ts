import { describe, expect, it } from "vitest";
import { botCommand, findPath, flagRole, navOf, nearestNode, newBotMemory } from "./bot.ts";
import { applyCmd, createMatch, worldStep, type EscEvent, type Match } from "./match.ts";
import { DEFAULT_SETTINGS, type BotLevel } from "./rules.ts";
import type { PrimaryId } from "./weapons.ts";

/** Un bot face à une cible immobile, dans l'avenue du Hameau : ce qu'il tire, ce qu'il touche, et quand */
function duel(level: BotLevel, primary: PrimaryId = "fa", target: { x: number; z: number } = { x: -14, z: 1 }, seconds = 12) {
  const m: Match = createMatch(
    { ...DEFAULT_SETTINGS, map: "hameau", mode: "solo", botLevel: level },
    [
      { id: "bot", team: 0, bot: true, primary },
      { id: "cible", team: 1, bot: false, primary: "fa" },
    ],
    5,
  );
  const ev0: EscEvent[] = [];
  while (m.phase === "countdown") worldStep(m, ev0);
  const [bot, dummy] = m.fighters;
  Object.assign(bot!.s, { x: -28, y: 0, z: 1, yaw: -Math.PI / 2, vx: 0, vz: 0 });
  Object.assign(dummy!.s, { x: target.x, y: 0, z: target.z, vx: 0, vz: 0 });
  const mem = newBotMemory(0, bot!.s.yaw);
  let shots = 0;
  let hits = 0;
  let firstHit = Infinity;
  const start = m.t;
  for (let k = 0; k < seconds * 60; k++) {
    const ev: EscEvent[] = [];
    dummy!.hp = 100000;
    dummy!.shieldUntil = 0;
    worldStep(m, ev);
    // La cible reste où elle est : on la remet à sa place si elle a été bousculée
    Object.assign(dummy!.s, { x: target.x, z: target.z, alive: true });
    applyCmd(m, 0, botCommand(m, 0, mem, level, k * 16), null, ev);
    for (const e of ev) {
      if (e.k === "shot" && e.i === 0) shots++;
      if (e.k === "hit" && e.a === 0 && e.v === 1) {
        hits++;
        firstHit = Math.min(firstHit, m.t - start);
      }
    }
  }
  return { shots, hits, firstHit, mem, rate: shots > 0 ? hits / shots : 0 };
}

describe("Escarmouche : les bots, bien moins forts (surtout en facile)", () => {
  const levels: BotLevel[] = ["facile", "moyen", "fort"];
  const results = Object.fromEntries(levels.map((l) => [l, duel(l)])) as Record<BotLevel, ReturnType<typeof duel>>;

  it("un bot facile met plus d'une seconde à toucher pour la première fois, et rate la plupart de ses balles", () => {
    const r = results.facile;
    expect(r.firstHit).toBeGreaterThan(1);
    expect(r.rate).toBeLessThan(0.45);
  });

  it("les trois niveaux restent bien distincts : plus fort, il touche plus vite et plus souvent", () => {
    expect(results.facile.firstHit).toBeGreaterThan(results.fort.firstHit);
    expect(results.facile.hits).toBeLessThan(results.moyen.hits);
    expect(results.moyen.hits).toBeLessThan(results.fort.hits);
    expect(results.facile.rate).toBeLessThan(results.fort.rate);
  });

  it("un bot facile ne fait pas mouche à chaque fois : en douze secondes, il touche moins qu'un fort", () => {
    expect(results.facile.hits * 1.5).toBeLessThan(results.fort.hits);
  });

  it("personne ne vise à travers un mur : une cible cachée dans une maison n'est jamais prise pour cible", () => {
    for (const level of levels) {
      // Dans la maison B (de x -22 à -12, de z -14 à -6), à l'abri du mur nord
      const r = duel(level, "fa", { x: -19, z: -11 }, 4);
      expect(r.shots, level).toBe(0);
      expect(r.mem.target, level).toBe(-1);
    }
  });
});

describe("Escarmouche : le chemin des bots", () => {
  // Des endroits où un bot collé contre un obstacle bas tombait sur une case posée dessus, isolée du reste : plus aucun
  // chemin, et il restait planté jusqu'à ce qu'on l'abatte
  it.each([
    ["hameau", -31.9, 6.9, 27, 16],
    ["hameau", -31.9, -9.6, 27, 16],
    ["port", -38, 2.7, 25, 0],
    ["col", -37.9, -2.9, 24, 4],
  ] as const)("%s : de (%d, %d), un chemin mène au milieu et de l'autre côté", (map, x, z, tx, tz) => {
    const nav = navOf(map);
    const from = nearestNode(nav, x, 0, z);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(findPath(nav, from, nearestNode(nav, 0, 0, 0)).length).toBeGreaterThan(0);
    expect(findPath(nav, from, nearestNode(nav, tx, 0, tz)).length).toBeGreaterThan(0);
  });
});

describe("Escarmouche : les bots à la capture du drapeau", () => {
  it("dans chaque équipe, des bots attaquent et d'autres défendent (les équipes se font déjà par la parité des places)", () => {
    const m = createMatch(
      { ...DEFAULT_SETTINGS, map: "gare", mode: "drapeau" },
      Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, team: i % 2, bot: true, primary: "fa" as const })),
      3,
    );
    for (const team of [0, 1]) {
      const roles = m.fighters.flatMap((f, i) => (f.team === team ? [flagRole(m, i)] : []));
      expect(roles).toContain("attaque");
      expect(roles).toContain("defense");
    }
    // Seul de son équipe, un bot attaque
    const duo = createMatch(
      { ...DEFAULT_SETTINGS, map: "gare", mode: "drapeau" },
      [
        { id: "a", team: 0, bot: true, primary: "fa" },
        { id: "b", team: 1, bot: true, primary: "fa" },
      ],
      3,
    );
    expect([flagRole(duo, 0), flagRole(duo, 1)]).toEqual(["attaque", "attaque"]);
  });
});
