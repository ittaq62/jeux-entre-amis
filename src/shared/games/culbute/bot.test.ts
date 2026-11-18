import { describe, expect, it } from "vitest";
import { ARENAS, type ArenaId } from "./arenas.ts";
import { botInput, newBotMemory, type BotLevel } from "./bot.ts";
import { createFight, DEFAULT_FIGHT_SETTINGS, stepFight } from "./engine.ts";
import { HABITUE_IDS, SPC, type Fight, type FightEvent, type Fighter, type HabitueId } from "./model.ts";

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

  it("narguent parfois après avoir sorti quelqu'un (et le combat va quand même au bout)", () => {
    let taunts = 0;
    for (const seed of [1, 2, 3]) {
      const { f, mem } = botFight(["ginette", "lucien"], "place", "aucun", seed);
      for (let k = 0; k < 8 * 60 * 60 + 400 && f.phase !== "over"; k++) {
        stepFight(
          f,
          f.fighters.map((_, i) => botInput(f, i, mem[i]!, "fort")),
        );
        taunts += f.fighters.filter((o) => o.state === "move" && o.move === "g:taunt" && o.mt === 1).length;
      }
      expect(f.phase, `graine ${seed}`).toBe("over");
    }
    expect(taunts).toBeGreaterThan(0);
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

  it("montent rejoindre celui qui attend en hauteur (le toit du kiosque, en passant par un banc)", () => {
    let up = 0;
    for (const style of HABITUE_IDS) {
      for (const lune of [false, true]) {
        const f = createFight(
          { ...DEFAULT_FIGHT_SETTINGS, items: "aucun", lune },
          "place",
          [
            { id: "bot", team: 0, style },
            { id: "idle", team: 1, style: "marcel" },
          ],
          4,
        );
        const mem = newBotMemory(7);
        while (f.phase === "intro") stepFight(f, []);
        const [me, idle] = f.fighters as [Fighter, Fighter];
        // L'un au sol, loin ; l'autre immobile sur le toit du kiosque (la plateforme 3 de la place)
        Object.assign(me, { x: -6, y: 0, ground: 0, state: "stand", vx: 0, vy: 0 });
        Object.assign(idle, { x: 0, y: 5.1, ground: 3, state: "stand", vx: 0, vy: 0 });
        let reached = false;
        for (let k = 0; k < 10 * 60 && !reached; k++) {
          stepFight(f, [botInput(f, 0, mem, "moyen"), { x: 0, y: 0, held: 0, pressed: 0 }]);
          reached = me.ground === 3;
        }
        if (reached) up++;
        else console.log("pas monté :", style, lune ? "(lune)" : "");
      }
    }
    expect(up).toBeGreaterThanOrEqual(HABITUE_IDS.length * 2 - 1);
  });

  it("au niveau moyen comme au niveau fort, ils attendent au bord celui qui revient (au niveau facile, jamais)", () => {
    const tries = (level: BotLevel) => {
      let guarded = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const f = createFight(
          { ...DEFAULT_FIGHT_SETTINGS, items: "aucun" },
          "place",
          [
            { id: "bot", team: 0, style: "raymond" },
            { id: "dehors", team: 1, style: "marcel" },
          ],
          seed,
        );
        while (f.phase === "intro") stepFight(f, []);
        const [me, out] = f.fighters as [Fighter, Fighter];
        const st = ARENAS.place.platforms[0]!;
        // Lui au bord de droite, arrêté, tourné vers le vide ; l'autre dehors, en l'air, qui revient
        Object.assign(me, { x: st.x1 * f.scale - 0.8, y: st.y, ground: 0, state: "stand", vx: 0, vy: 0, face: 1 });
        Object.assign(out, { x: st.x1 * f.scale + 3, y: st.y - 1, ground: -1, state: "air", vx: 0, vy: 0 });
        const mem = newBotMemory(seed);
        // Ce qu'il fait à sa première décision : le spécial neutre sur celui qui revient
        if (botInput(f, 0, mem, level).pressed & SPC) guarded++;
      }
      return guarded;
    };
    expect(tries("facile")).toBe(0);
    expect(tries("moyen")).toBeGreaterThan(5);
    expect(tries("fort")).toBeGreaterThan(5);
  });

  it("ne se jettent pas dans le vide tout seuls", () => {
    const { f, mem } = botFight(["simone", "lucien", "raymond", "huguette"], "clocher", "aucun", 5);
    const events = play(f, mem, "facile", 90 * 60);
    const selfDestructs = events.filter((e) => e.k === "ko" && e.by < 0).length;
    const kos = events.filter((e) => e.k === "ko").length;
    expect(selfDestructs).toBeLessThanOrEqual(Math.max(2, kos * 0.4));
  });
});
