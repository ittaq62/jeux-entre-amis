import { describe, expect, it } from "vitest";
import type { ArenaId } from "./arenas.ts";
import { botInput, newBotMemory, type BotLevel } from "./bot.ts";
import { createFight, DEFAULT_FIGHT_SETTINGS, stepFight } from "./engine.ts";
import { HABITUE_IDS, type Fight, type FightEvent, type HabitueId } from "./model.ts";

function botFight(styles: HabitueId[], arena: ArenaId = "place", items: "aucun" | "peu" | "beaucoup" = "peu", seed = 1) {
  const f = createFight(
    { ...DEFAULT_FIGHT_SETTINGS, items },
    arena,
    styles.map((style, i) => ({ id: `b${i}`, team: i % 2, style })),
    seed,
  );
  const mem = styles.map((_, i) => newBotMemory(seed * 31 + i));
  return { f, mem };
}

function play(f: Fight, mem: ReturnType<typeof newBotMemory>[], level: BotLevel, frames: number): FightEvent[] {
  const events: FightEvent[] = [];
  for (let k = 0; k < frames && f.phase !== "over"; k++)
    events.push(
      ...stepFight(
        f,
        f.fighters.map((_, i) => botInput(f, i, mem[i]!, level)),
      ),
    );
  return events;
}

describe("Culbute : les bots", () => {
  it("se battent pour de bon : des coups, des sorties, et un vainqueur", () => {
    const { f, mem } = botFight(["ginette", "marcel"]);
    const events = play(f, mem, "fort", 8 * 60 * 60 + 400);
    expect(events.filter((e) => e.k === "hit" && e.kind === "hit").length).toBeGreaterThan(20);
    expect(events.some((e) => e.k === "ko" && e.by >= 0)).toBe(true);
    expect(f.phase).toBe("over");
    expect(f.winners.length).toBeGreaterThan(0);
  });

  it("à huit, sur chaque arène, le combat avance sans bloquer", () => {
    for (const arena of ["place", "bal", "marche", "clocher"] as ArenaId[]) {
      const styles = [...HABITUE_IDS, "ginette", "simone"] as HabitueId[];
      const { f, mem } = botFight(styles, arena, "beaucoup", 3);
      const events = play(f, mem, "moyen", 60 * 60);
      expect(events.filter((e) => e.k === "hit").length, arena).toBeGreaterThan(30);
    }
  });

  it("reviennent sur l'arène quand on les éjecte (le plus souvent)", () => {
    let back = 0;
    let tries = 0;
    for (const style of HABITUE_IDS) {
      for (const side of [-1, 1]) {
        const { f, mem } = botFight([style, "marcel"], "place", "aucun", 9);
        while (f.phase === "intro") stepFight(f, []);
        const me = f.fighters[0]!;
        // Lancé loin du bord, en l'air, encore avec ses sauts
        me.x = side * 10.5;
        me.y = 1;
        me.ground = -1;
        me.state = "air";
        me.vy = 0;
        f.fighters[1]!.x = -side * 5;
        tries++;
        const events = play(f, mem, "fort", 360);
        if (!events.some((e) => e.k === "ko" && e.v === 0)) back++;
      }
    }
    expect(back / tries).toBeGreaterThanOrEqual(0.75);
  });

  it("ne se jettent pas dans le vide tout seuls", () => {
    const { f, mem } = botFight(["simone", "lucien", "raymond", "huguette"], "clocher", "aucun", 5);
    const events = play(f, mem, "facile", 90 * 60);
    const selfDestructs = events.filter((e) => e.k === "ko" && e.by < 0).length;
    const kos = events.filter((e) => e.k === "ko").length;
    expect(selfDestructs).toBeLessThanOrEqual(Math.max(2, kos * 0.4));
  });
});
