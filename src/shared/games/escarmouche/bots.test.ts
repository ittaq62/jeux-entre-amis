import { describe, expect, it } from "vitest";
import { botCommand, newBotMemory } from "./bot.ts";
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
