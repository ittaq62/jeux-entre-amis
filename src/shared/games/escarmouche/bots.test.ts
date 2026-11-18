import { describe, expect, it } from "vitest";
import { botCommand, botHurt, findPath, flagJob, flagRole, navOf, nearestNode, newBotMemory, type BotMemory, type FlagJob } from "./bot.ts";
import type { MapId } from "./maps.ts";
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

describe("Escarmouche : ce que fait chaque bot à la capture du drapeau", () => {
  /** Huit bots au Hameau (équipe 0 à l'ouest, drapeau en -41 ; équipe 1 à l'est, en 41), la partie lancée */
  function ctf() {
    const m = createMatch(
      { ...DEFAULT_SETTINGS, map: "hameau", mode: "drapeau" },
      Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, team: i % 2, bot: true, primary: "fa" as const })),
      3,
    );
    const ev: EscEvent[] = [];
    while (m.phase === "countdown") worldStep(m, ev);
    return m;
  }
  const at = (m: Match, i: number, x: number, z: number) => Object.assign(m.fighters[i]!.s, { x, y: 0, z });

  it("sur quatre bots, trois attaquent et un défend", () => {
    const m = ctf();
    for (const team of [0, 1]) {
      const roles = m.fighters.flatMap((f, i) => (f.team === team ? [flagRole(m, i)] : []));
      expect(roles.filter((r) => r === "defense")).toHaveLength(1);
    }
  });

  it("le porteur file chez lui, ses coéquipiers l'escortent ; en face, on court après son drapeau", () => {
    const m = ctf();
    // Équipe 0 : 0, 2, 4, 6 (le défenseur est 2) ; équipe 1 : 1, 3, 5, 7 (le défenseur est 3)
    expect(m.fighters.map((_, i) => flagRole(m, i))).toEqual([
      "attaque",
      "attaque",
      "defense",
      "defense",
      "attaque",
      "attaque",
      "attaque",
      "attaque",
    ]);
    // 0 a pris le drapeau des bleus, il est au milieu
    at(m, 0, 5, 0);
    m.fighters[0]!.carrying = 1;
    Object.assign(m.flags![1], { at: "carried", carrier: 0 });
    at(m, 2, -38, 2);
    at(m, 4, 20, 10);
    at(m, 1, 20, 0);
    at(m, 5, -30, 0);
    const jobs = m.fighters.map((_, i) => flagJob(m, i));
    expect(jobs[0]).toBe<FlagJob>("porteur");
    // Ses attaquants l'escortent ; son défenseur, loin de lui, garde le drapeau
    expect(jobs[4]).toBe<FlagJob>("escorte");
    expect(jobs[2]).toBe<FlagJob>("defense");
    // Chez les bleus, le défenseur reprend le drapeau, comme l'attaquant qui en est tout près ; celui qui est loin attaque
    expect(jobs[3]).toBe<FlagJob>("reprise");
    expect(jobs[1]).toBe<FlagJob>("reprise");
    expect(jobs[5]).toBe<FlagJob>("attaque");
    // Le porteur revient chez lui, le défenseur passe tout près : il l'escorte aussi
    at(m, 0, -30, 0);
    expect(flagJob(m, 2)).toBe<FlagJob>("escorte");
  });
});

/** Une partie de capture du drapeau entre bots (quatre contre quatre), et ce qu'ils y ont fait */
function ctfGame(map: MapId, level: BotLevel, seed: number, minutes = 8) {
  const m = createMatch(
    { ...DEFAULT_SETTINGS, map, mode: "drapeau", botLevel: level, minutes },
    Array.from({ length: 8 }, (_, i) => ({
      id: `b${i}`,
      team: i % 2,
      bot: true,
      primary: (["fa", "pm", "pompe", "precision"] as const)[(i >> 1) % 4]!,
    })),
    seed,
  );
  const mems: BotMemory[] = m.fighters.map((f, i) => newBotMemory(i, f.s.yaw));
  const out = { takes: 0, returns: 0, jobs: {} as Partial<Record<FlagJob, number>> };
  let step = 0;
  while (m.phase !== "over") {
    const ev: EscEvent[] = [];
    worldStep(m, ev);
    m.fighters.forEach((_, i) => applyCmd(m, i, botCommand(m, i, mems[i]!, level, step * 16), null, ev));
    step++;
    for (const e of ev) {
      // Comme sur le serveur : un bot touché se retourne vers le tireur
      if (e.k === "hit" && e.a >= 0) botHurt(mems[e.v]!, e.a, m.t, m.fighters[e.a]!.s.x, m.fighters[e.a]!.s.z);
      if (e.k === "flag" && e.f === "take") out.takes++;
      if (e.k === "flag" && e.f === "return" && e.i >= 0) out.returns++;
    }
    m.fighters.forEach((f, i) => {
      const job = mems[i]!.job;
      if (f.s.alive && job) out.jobs[job] = (out.jobs[job] ?? 0) + 1 / 60;
    });
  }
  return out;
}

// Mesuré avant (24 parties de 8 minutes, quatre cartes, trois niveaux) : une seule prise en tout. Les deux attaquants de
// chaque équipe prenaient la même avenue, s'entretuaient au milieu et ne dépassaient jamais la moitié de la carte.
describe("Escarmouche : entre bots, la capture du drapeau se joue vraiment, à chaque niveau", () => {
  it.each(["facile", "moyen", "fort"] as BotLevel[])(
    "%s : ils prennent le drapeau, le portent, l'escortent, défendent et reprennent le leur",
    (level) => {
      const games = [ctfGame("hameau", level, 1), ctfGame("port", level, 2)];
      const sum = (k: "takes" | "returns") => games.reduce((a, g) => a + g[k], 0);
      const time = (j: FlagJob) => games.reduce((a, g) => a + (g.jobs[j] ?? 0), 0);
      expect(sum("takes")).toBeGreaterThanOrEqual(2);
      expect(sum("returns")).toBeGreaterThanOrEqual(1);
      for (const j of ["attaque", "defense", "porteur", "escorte", "reprise"] as FlagJob[]) expect(time(j), j).toBeGreaterThan(0);
    },
  );
});
