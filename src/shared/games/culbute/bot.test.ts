import { describe, expect, it } from "vitest";
import { ARENAS, type ArenaId } from "./arenas.ts";
import { botInput, newBotMemory, type BotLevel } from "./bot.ts";
import { createFight, DEFAULT_FIGHT_SETTINGS, stepFight } from "./engine.ts";
import { ATK, HABITUE_IDS, JMP, SPC, type Fight, type FightEvent, type Fighter, type HabitueId, type Input } from "./model.ts";

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

/** Le joueur qui reste planté et martèle les deux clics vers l'adversaire (visée au curseur), sans jamais bouger, à la
 * main (de 5 à 16 images entre deux clics) ; comme dans le jeu, le coup qui attend que son combattant puisse le donner
 * garde la visée jusque-là. Éjecté, il revient comme il peut (sauts, puis le spécial vers le haut) */
function camper(f: Fight, slot: number, c: { home: number; next: number; aim: number }, rnd: () => number): Input {
  const me = f.fighters[slot]!;
  const foe = f.fighters.find((o) => o.slot !== slot && o.state !== "dead" && o.state !== "out");
  if (!foe || f.phase !== "fight") return { x: 0, y: 0, held: 0, pressed: 0 };
  const st = ARENAS[f.arena as ArenaId].platforms[0]!;
  if (me.ground < 0 && (me.x < st.x0 || me.x > st.x1 || me.y < -0.3)) {
    c.aim = 0;
    const back = me.x < c.home ? 1 : -1;
    if (me.vy < 0 && me.jumps > 0) return { x: back, y: 1, held: JMP, pressed: JMP };
    if (me.vy < 0 && me.y < 1) return { x: back * 0.4, y: 0.9, held: SPC, pressed: SPC };
    return { x: back, y: 0, held: 0, pressed: 0 };
  }
  const dx = foe.x - me.x;
  const dy = foe.y - me.y;
  const len = Math.hypot(dx, dy);
  const [x, y] = len < 0.75 ? [0, 0] : [dx / len, dy / len];
  if (f.frame >= c.next) {
    c.next = f.frame + 5 + Math.floor(rnd() * 12);
    c.aim = 6;
    return { x, y, held: 0, pressed: rnd() < 0.5 ? ATK : SPC };
  }
  if (c.aim > 0) {
    const ready = me.state === "stand" || me.state === "air";
    c.aim = ready ? 0 : c.aim - 1;
    if (!ready) return { x, y, held: 0, pressed: 0 };
  }
  if (me.ground >= 0 && Math.abs(me.x - c.home) > 1.2) return { x: me.x < c.home ? 1 : -1, y: 0, held: 0, pressed: 0 };
  return { x: 0, y: 0, held: 0, pressed: 0 };
}

/** Le joueur planté contre un bot de ce niveau, un combat par style (le bot, deux styles plus loin) : ses victoires */
function camperWins(level: "moyen" | "fort", seed: number): number {
  let wins = 0;
  for (const [i, style] of HABITUE_IDS.entries()) {
    const foe = HABITUE_IDS[(i + 2) % HABITUE_IDS.length]!;
    const f = createFight(
      { ...DEFAULT_FIGHT_SETTINGS, items: "aucun", stocks: 3 },
      "place",
      [
        { id: "m", team: 0, style },
        { id: "b", team: 1, style: foe },
      ],
      seed + i,
    );
    while (f.phase === "intro") stepFight(f, []);
    const c = { home: f.fighters[0]!.x, next: 0, aim: 0 };
    const mem = newBotMemory(seed * 3 + 77 + i);
    let r = 7919 + seed + i * 13;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 6 * 60 * 60 && f.phase !== "over"; k++) stepFight(f, [camper(f, 0, c, rnd), botInput(f, 1, mem, level)]);
    if (f.fighters[0]!.rank === 1) wins++;
  }
  return wins;
}

describe("Culbute : marteler sans bouger ne suffit pas", () => {
  it("contre les bots moyens et forts, le joueur planté qui martèle perd nettement (douze combats chacun)", () => {
    const moyen = camperWins("moyen", 40) + camperWins("moyen", 140);
    const fort = camperWins("fort", 40) + camperWins("fort", 140);
    expect(moyen).toBeLessThanOrEqual(2);
    expect(fort).toBeLessThanOrEqual(2);
  });
});

describe("Culbute : les objets à aller chercher", () => {
  it("une baguette posée sur un banc : le bot y monte et la prend", () => {
    let got = 0;
    for (const style of ["ginette", "marcel", "simone"] as HabitueId[]) {
      const f = createFight(
        { ...DEFAULT_FIGHT_SETTINGS, items: "aucun", stocks: 3 },
        "place",
        [
          { id: "b", team: 0, style },
          { id: "x", team: 1, style: "lucien" },
        ],
        9,
      );
      while (f.phase === "intro") stepFight(f, []);
      // Le bot sous le banc de gauche, l'autre loin à droite, qui ne fait rien
      f.fighters[0]!.x = -1.5;
      f.fighters[1]!.x = 6.5;
      f.items.push({ id: 999, kind: "baguette", x: -3.8, y: 2.7, vx: 0, vy: 0, ground: true, life: 99999 });
      const mem = newBotMemory(5);
      const idle: Input = { x: 0, y: 0, held: 0, pressed: 0 };
      for (let k = 0; k < 8 * 60 && !f.fighters[0]!.item; k++) stepFight(f, [botInput(f, 0, mem, "moyen"), idle]);
      if (f.fighters[0]!.item === "baguette") got++;
    }
    expect(got).toBeGreaterThanOrEqual(2);
  });
});

describe("Culbute : revenir sur l'arène", () => {
  it("éjecté au loin, chaque style revient (bots forts) : le saut d'abord, la ruée seulement si elle laisse assez haut", () => {
    for (const style of HABITUE_IDS) {
      let back = 0;
      let tries = 0;
      for (const speed of [20, 26])
        for (const ang of [10, 30, 50])
          for (const side of [-1, 1]) {
            const f = createFight(
              { ...DEFAULT_FIGHT_SETTINGS, items: "aucun", events: false },
              "place",
              [
                { id: "a", team: 0, style },
                { id: "b", team: 1, style: "lucien" },
              ],
              speed + ang,
            );
            while (f.phase === "intro") stepFight(f, []);
            const me = f.fighters[0]!;
            f.fighters[1]!.x = 0;
            me.x = side * 7;
            me.y = 0.5;
            me.ground = -1;
            me.state = "hurt";
            me.stun = 20;
            me.kx = Math.cos((ang * Math.PI) / 180) * speed * side;
            me.ky = Math.sin((ang * Math.PI) / 180) * speed;
            const mem = newBotMemory(speed * ang);
            const idle: Input = { x: 0, y: 0, held: 0, pressed: 0 };
            let ok = false;
            for (let k = 0; k < 600 && !ok; k++) {
              const ev = stepFight(f, [botInput(f, 0, mem, "fort"), idle]);
              if (ev.some((e) => e.k === "ko")) break;
              ok = me.ground >= 0 || f.fighters[0]!.state === "ledge";
            }
            tries++;
            if (ok) back++;
          }
      expect(back, style).toBeGreaterThanOrEqual(tries - 1);
    }
  });
});
