import { describe, expect, it } from "vitest";
import { ARENA_IDS, ARENAS, blastOf, ledgesOf } from "./arenas.ts";
import {
  createFight,
  DEFAULT_FIGHT_SETTINGS,
  DI_MAX,
  INTRO_FRAMES,
  moveDef,
  predictHits,
  stepFight,
  stepSolo,
  type Entrant,
} from "./engine.ts";
import {
  ATK,
  GRB,
  HABITUE_IDS,
  JMP,
  NO_INPUT,
  SHD,
  SPC,
  type Fight,
  type FightEvent,
  type Fighter,
  type HabitueId,
  type Input,
} from "./model.ts";
import { CHARGE_DECIDE, MOVE_SLOTS } from "./moves.ts";
import { STYLES } from "./styles.ts";
import { packFull, unpackFull } from "./view.ts";

const duel = (a: HabitueId = "ginette", b: HabitueId = "marcel", settings = {}): Fight =>
  createFight({ ...DEFAULT_FIGHT_SETTINGS, items: "aucun", ...settings }, "place", entrants([a, b]), 42);

const entrants = (styles: HabitueId[]): Entrant[] => styles.map((style, i) => ({ id: `p${i}`, team: i % 2, style }));

/** Passe l'introduction */
function skipIntro(f: Fight) {
  while (f.phase === "intro") stepFight(f, []);
}

/** Avance de n pas, chacun avec sa commande (une fonction de l'image, ou rien) */
function run(f: Fight, n: number, inputs: ((k: number) => Input)[] = []): FightEvent[] {
  const events: FightEvent[] = [];
  for (let k = 0; k < n; k++)
    events.push(
      ...stepFight(
        f,
        f.fighters.map((_, i) => inputs[i]?.(k) ?? NO_INPUT),
      ),
    );
  return events;
}

const tap =
  (bits: number, x = 0, y = 0) =>
  (k: number): Input =>
    k === 0 ? { x, y, held: bits, pressed: bits } : { x, y, held: 0, pressed: 0 };
const hold =
  (bits: number, frames: number, x = 0, y = 0) =>
  (k: number): Input =>
    k < frames ? { x, y, held: bits, pressed: k === 0 ? bits : 0 } : { x: 0, y: 0, held: 0, pressed: 0 };
const stick =
  (x: number, y = 0) =>
  (): Input => ({ x, y, held: 0, pressed: 0 });

/** Place deux combattants face à face, à cette distance */
function faceToFace(f: Fight, gap: number) {
  const [a, b] = f.fighters;
  a!.x = -gap / 2;
  b!.x = gap / 2;
  a!.face = 1;
  b!.face = -1;
}

describe("Culbute : les données", () => {
  it("chaque style a ses quinze coups ; les attaques au sol partent vite, les chargées après la décision de charge", () => {
    for (const id of HABITUE_IDS) {
      const st = STYLES[id];
      for (const slot of MOVE_SLOTS) expect(st.moves[slot], `${id} ${slot}`).toBeDefined();
      for (const slot of ["s", "u", "d"] as const) {
        for (const hit of st.moves[slot].hits) expect(hit.from, `${id} ${slot}`).toBeLessThan(CHARGE_DECIDE);
      }
      for (const slot of ["cs", "cu", "cd"] as const) {
        const m = st.moves[slot];
        expect(m.charge, `${id} ${slot}`).toBeDefined();
        expect(m.charge!.at).toBeGreaterThanOrEqual(CHARGE_DECIDE);
        for (const hit of m.hits) expect(hit.from, `${id} ${slot}`).toBeGreaterThan(m.charge!.at);
      }
    }
  });

  it("chaque arène a un grand plateau en premier, des limites autour, et deux rebords", () => {
    for (const id of ARENA_IDS) {
      const a = ARENAS[id];
      expect(a.platforms[0]!.kind).toBe("solid");
      const b = blastOf(id, 1);
      expect(b.left).toBeLessThan(a.platforms[0]!.x0 - 5);
      expect(b.right).toBeGreaterThan(a.platforms[0]!.x1 + 5);
      expect(ledgesOf(id, 1)).toHaveLength(2);
      expect(a.spawns.length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("Culbute : le combat", () => {
  it("commence par trois secondes d'introduction, puis le top départ", () => {
    const f = duel();
    const events = run(f, INTRO_FRAMES + 2);
    expect(events.some((e) => e.k === "go")).toBe(true);
    expect(f.phase).toBe("fight");
  });

  it("un coup fait monter les pourcents et éjecte d'autant plus loin qu'ils sont hauts", () => {
    const launches: number[] = [];
    for (const before of [0, 60, 120]) {
      const f = duel();
      skipIntro(f);
      faceToFace(f, 1.6);
      f.fighters[1]!.dmg = before;
      run(f, 40, [hold(ATK, 4, 1, 0)]);
      const v = f.fighters[1]!;
      expect(v.dmg).toBeGreaterThan(before);
      launches.push(v.lastKb);
    }
    expect(launches[1]).toBeGreaterThan(launches[0]!);
    expect(launches[2]).toBeGreaterThan(launches[1]!);
  });

  it("l'influence : le stick tenu en travers à la fin de l'arrêt sur image infléchit la trajectoire (pas celui d'avant)", () => {
    /** Le même coup à 120 % ; le stick à l'opposé jusqu'à la dernière image de l'arrêt, puis (x, y) ; l'angle de l'élan */
    const launchAngle = (x: number, y: number) => {
      const f = duel();
      skipIntro(f);
      faceToFace(f, 1.6);
      const v = f.fighters[1]!;
      v.dmg = 120;
      const before = { x: -x, y: -y, held: 0, pressed: 0 };
      for (let k = 0; k < 40 && v.state !== "hurt"; k++) stepFight(f, [hold(ATK, 4, 1, 0)(k), before]);
      expect(v.hitstop).toBeGreaterThan(1);
      while (v.hitstop > 1) stepFight(f, [NO_INPUT, before]);
      stepFight(f, [NO_INPUT, { x, y, held: 0, pressed: 0 }]);
      expect(v.hitstop).toBe(0);
      return Math.atan2(v.ky, v.kx);
    };
    const base = launchAngle(0, 0);
    // Tout à fait en travers de l'élan : l'inflexion entière, d'un côté ou de l'autre
    const up = launchAngle(-Math.sin(base), Math.cos(base));
    const down = launchAngle(Math.sin(base), -Math.cos(base));
    expect(((up - base) * 180) / Math.PI).toBeCloseTo(DI_MAX, 3);
    expect(((base - down) * 180) / Math.PI).toBeCloseTo(DI_MAX, 3);
    // Dans le sens de l'élan : rien ne change
    expect(launchAngle(Math.cos(base), Math.sin(base))).toBeCloseTo(base, 6);
  });

  it("un appui bref reste une attaque normale (elle part dès qu'on relâche), un appui tenu devient l'attaque chargée", () => {
    const f = duel();
    skipIntro(f);
    run(f, 1, [tap(ATK, 1, 0)]);
    run(f, 5);
    expect(f.fighters[0]!.move).toBe("s");
    expect(f.fighters[0]!.mt).toBeGreaterThanOrEqual(5);
    // Tenu trois images de plus, le même coup attend, puis part au relâchement
    const r = duel();
    skipIntro(r);
    run(r, 7, [hold(ATK, 7, 1, 0)]);
    const late = r.fighters[0]!;
    expect(late.move).toBe("s");
    expect(late.mt).toBeLessThan(5);
    run(r, 3);
    expect(late.mt).toBeGreaterThanOrEqual(5);
    const g = duel();
    skipIntro(g);
    run(g, CHARGE_DECIDE + 12, [hold(ATK, CHARGE_DECIDE + 12, 1, 0)]);
    expect(g.fighters[0]!.move).toBe("cs");
    expect(g.fighters[0]!.charge).toBeGreaterThan(0);
  });

  it("l'attaque chargée à fond fait sortir un adversaire à 120 % depuis le bord", () => {
    const f = duel("ginette", "ginette");
    skipIntro(f);
    faceToFace(f, 1.8);
    f.fighters[0]!.x = 3.5;
    f.fighters[1]!.x = 5.2;
    f.fighters[1]!.dmg = 120;
    const events = run(f, 240, [hold(ATK, 75, 1, 0)]);
    expect(events.some((e) => e.k === "ko" && e.v === 1 && e.by === 0)).toBe(true);
  });

  it("à 0 %, le même coup ne sort personne", () => {
    const f = duel("ginette", "ginette");
    skipIntro(f);
    faceToFace(f, 1.8);
    const events = run(f, 240, [hold(ATK, 75, 1, 0)]);
    expect(events.some((e) => e.k === "ko")).toBe(false);
    expect(f.fighters[1]!.dmg).toBeGreaterThan(10);
  });

  it("la garde arrête le coup et s'use", () => {
    const f = duel();
    skipIntro(f);
    faceToFace(f, 1.6);
    // La garde levée bien avant (sinon c'est une parade)
    const guard = (): Input => ({ x: 0, y: 0, held: SHD, pressed: 0 });
    run(f, 10, [() => NO_INPUT, guard]);
    const events = run(f, 30, [hold(ATK, 4, 1, 0), guard]);
    expect(events.some((e) => e.k === "hit" && e.kind === "shield")).toBe(true);
    expect(f.fighters[1]!.dmg).toBe(0);
    expect(f.fighters[1]!.shield).toBeLessThan(45);
  });

  it("l'esquive en roulade rend intouchable un instant", () => {
    const f = duel();
    skipIntro(f);
    run(f, 1, [tap(SHD, 1, 0)]);
    expect(f.fighters[0]!.state).toBe("roll");
    const x0 = f.fighters[0]!.x;
    run(f, 30);
    expect(f.fighters[0]!.x).toBeGreaterThan(x0 + 1.5);
  });

  it("saute, ressaute en l'air, et retombe avec ses sauts rendus", () => {
    const f = duel("huguette");
    skipIntro(f);
    run(f, 20, [hold(JMP, 10)]);
    const ft = f.fighters[0]!;
    expect(ft.y).toBeGreaterThan(1.5);
    run(f, 1, [tap(JMP)]);
    expect(ft.jumps).toBe(STYLES.huguette.jumps - 1);
    run(f, 200);
    expect(ft.ground).toBeGreaterThanOrEqual(0);
    expect(ft.jumps).toBe(STYLES.huguette.jumps);
  });

  it("sur la lune, on saute plus haut et on retombe plus tard", () => {
    const peak = (lune: boolean) => {
      // Sur le toit du clocher : rien au-dessus de sa place de départ, il retombe là d'où il est parti
      const f = createFight({ ...DEFAULT_FIGHT_SETTINGS, items: "aucun", lune }, "clocher", entrants(["ginette", "marcel"]), 42);
      skipIntro(f);
      let best = 0;
      let landed = -1;
      for (let k = 0; k < 240; k++) {
        run(
          f,
          1,
          [hold(JMP, 10)].map((fn) => () => fn(k)),
        );
        best = Math.max(best, f.fighters[0]!.y);
        if (k > 10 && landed < 0 && f.fighters[0]!.ground >= 0) landed = k;
      }
      return { best, landed };
    };
    const earth = peak(false);
    const moon = peak(true);
    expect(moon.best).toBeGreaterThan(earth.best);
    expect(moon.landed).toBeGreaterThan(earth.landed);
  });

  it("sort par le bas : une vie de moins, puis on revient au-dessus de l'arène", () => {
    const f = duel();
    skipIntro(f);
    const ft = f.fighters[0]!;
    ft.x = 12;
    ft.y = 2;
    ft.ground = -1;
    ft.state = "air";
    ft.jumps = 0;
    const events = run(f, 200);
    expect(events.some((e) => e.k === "ko" && e.v === 0 && e.side === "bottom")).toBe(true);
    expect(ft.stocks).toBe(DEFAULT_FIGHT_SETTINGS.stocks - 1);
    expect(events.some((e) => e.k === "back" && e.v === 0)).toBe(true);
    expect(["respawn", "air", "stand", "land"]).toContain(ft.state);
  });

  it("s'accroche au rebord en revenant d'en dessous, puis remonte", () => {
    const f = duel();
    skipIntro(f);
    const ft = f.fighters[0]!;
    const right = ledgesOf("place", f.scale)[1]!;
    ft.x = right.x + 0.9;
    ft.y = right.y - 1.6;
    ft.ground = -1;
    ft.state = "air";
    ft.vy = 4;
    run(f, 20);
    expect(ft.state).toBe("ledge");
    run(f, 1, [stick(-1)]);
    run(f, 40);
    expect(ft.ground).toBe(0);
    expect(ft.x).toBeLessThan(right.x);
  });

  it("le spécial vers le haut remonte, puis laisse en chute libre", () => {
    for (const id of HABITUE_IDS) {
      const f = duel(id);
      skipIntro(f);
      const ft = f.fighters[0]!;
      ft.x = 0;
      ft.y = 3;
      ft.ground = -1;
      ft.state = "air";
      ft.vy = 0;
      const y0 = ft.y;
      let best = y0;
      run(f, 1, [tap(SPC, 0, 1)]);
      for (let k = 0; k < 40; k++) {
        run(f, 1);
        best = Math.max(best, ft.y);
      }
      expect(best - y0, id).toBeGreaterThan(1.2);
    }
  });

  it("aux vies, le dernier debout gagne ; les places suivent l'ordre des sorties", () => {
    const f = createFight(
      { ...DEFAULT_FIGHT_SETTINGS, stocks: 1, items: "aucun" },
      "clocher",
      entrants(["ginette", "marcel", "simone"]),
      7,
    );
    skipIntro(f);
    const drop = (i: number) => {
      const ft = f.fighters[i]!;
      ft.x = 0;
      ft.y = -20;
      ft.ground = -1;
      ft.state = "air";
    };
    drop(1);
    run(f, 2);
    drop(0);
    run(f, 2);
    expect(f.phase).toBe("over");
    expect(f.fighters.map((ft) => ft.rank)).toEqual([2, 3, 1]);
    expect(f.winners).toEqual([2]);
  });

  it("au temps, sortir quelqu'un rapporte un point et tomber en coûte un", () => {
    const f = createFight(
      { ...DEFAULT_FIGHT_SETTINGS, mode: "temps", minutes: 2, items: "aucun" },
      "place",
      entrants(["ginette", "raymond"]),
      3,
    );
    skipIntro(f);
    const v = f.fighters[1]!;
    v.lastBy = 0;
    v.lastAt = f.frame;
    v.x = 30;
    run(f, 2);
    expect(f.fighters[0]!.score).toBe(1);
    expect(v.score).toBe(-1);
    // Le temps écoulé, c'est fini
    run(f, 2 * 60 * 60 + 10);
    expect(f.phase).toBe("over");
    expect(f.fighters[0]!.rank).toBe(1);
  });

  it("en équipes avec une seule équipe à la table, on joue chacun pour soi", () => {
    const f = createFight(
      { ...DEFAULT_FIGHT_SETTINGS, teams: true },
      "place",
      [
        { id: "a", team: 0, style: "ginette" },
        { id: "b", team: 0, style: "marcel" },
      ],
      5,
    );
    expect(f.settings.teams).toBe(false);
    skipIntro(f);
    run(f, 10);
    expect(f.phase).toBe("fight");
  });

  it("en mort subite, tout le monde commence à 100 % avec une seule vie", () => {
    const f = createFight({ ...DEFAULT_FIGHT_SETTINGS, mode: "subite" }, "place", entrants(["ginette", "raymond"]), 3);
    expect(f.fighters.every((ft) => ft.dmg === 100 && ft.stocks === 1)).toBe(true);
  });

  it("en équipes, on ne se touche pas entre coéquipiers (sauf si l'hôte le permet)", () => {
    for (const ff of [false, true]) {
      const f = createFight(
        { ...DEFAULT_FIGHT_SETTINGS, teams: true, friendlyFire: ff, items: "aucun" },
        "place",
        [
          { id: "a", team: 0, style: "ginette" },
          { id: "b", team: 0, style: "marcel" },
          { id: "c", team: 1, style: "simone" },
        ],
        5,
      );
      skipIntro(f);
      faceToFace(f, 1.6);
      f.fighters[2]!.x = -6;
      run(f, 30, [hold(ATK, 4, 1, 0)]);
      expect(f.fighters[1]!.dmg > 0).toBe(ff);
    }
  });

  it("les projectiles partent et touchent (la note de Lucien, la boule de Raymond)", () => {
    for (const id of ["lucien", "raymond"] as HabitueId[]) {
      const f = duel(id, "marcel");
      skipIntro(f);
      faceToFace(f, 4);
      run(f, 90, [tap(SPC)]);
      expect(f.fighters[1]!.dmg, id).toBeGreaterThan(0);
    }
  });

  it("le même départ et les mêmes commandes donnent le même combat (le serveur et l'appareil calculent pareil)", () => {
    const script = (k: number): Input => {
      const phase = Math.floor(k / 37) % 5;
      const x = [1, -1, 0.5, 0, -0.6][phase]!;
      const bits = k % 23 === 0 ? ATK : k % 41 === 0 ? JMP : k % 59 === 0 ? SPC : 0;
      return { x, y: k % 97 < 10 ? 1 : 0, held: bits, pressed: bits };
    };
    const play = () => {
      const f = createFight({ ...DEFAULT_FIGHT_SETTINGS, items: "beaucoup" }, "bal", entrants(["ginette", "huguette", "lucien"]), 99);
      run(f, 1500, [script, (k) => script(k + 11), (k) => script(k + 29)]);
      return JSON.stringify(f);
    };
    expect(play()).toBe(play());
  });

  it("l'appareil anticipe son combattant comme le serveur le calcule (sans les autres)", () => {
    const f = duel();
    skipIntro(f);
    // Loin l'un de l'autre : personne ne se touche (et le premier reste sur le plateau)
    f.fighters[0]!.x = 4;
    f.fighters[1]!.x = -6;
    const solo: Fight = JSON.parse(JSON.stringify(f));
    const script = (k: number): Input => {
      const bits = k === 5 ? JMP : k === 30 ? ATK : k === 70 ? SPC : 0;
      return { x: k < 50 ? -0.8 : 0.3, y: 0, held: bits, pressed: bits };
    };
    for (let k = 0; k < 120; k++) {
      stepFight(f, [script(k), NO_INPUT]);
      stepSolo(solo, 0, script(k));
    }
    const a = f.fighters[0]!;
    const b = solo.fighters[0]!;
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(b.state).toBe(a.state);
  });

  it("l'appareil devine ses propres coups qui touchent, avec le même arrêt sur image que le serveur", () => {
    for (const before of [0, 150]) {
      const f = duel();
      skipIntro(f);
      faceToFace(f, 1.6);
      f.fighters[1]!.dmg = before;
      const solo: Fight = JSON.parse(JSON.stringify(f));
      let predicted: ReturnType<typeof predictHits> = [];
      let serverStop = 0;
      for (let k = 0; k < 20 && serverStop === 0; k++) {
        const inp = tap(ATK, 1, 0)(k);
        stepFight(f, [inp, NO_INPUT]);
        if (f.fighters[0]!.hitstop > 0) serverStop = f.fighters[0]!.hitstop;
        stepSolo(solo, 0, inp);
        if (predicted.length === 0) predicted = predictHits(solo, 0);
      }
      expect(predicted.length, `${before} %`).toBe(1);
      expect(predicted[0]!.v).toBe(1);
      expect(solo.fighters[0]!.hitstop).toBe(serverStop);
      // Déjà touché : le même coup ne se devine pas deux fois
      expect(predictHits(solo, 0)).toHaveLength(0);
    }
  });

  it("l'état renvoyé à l'appareil garde ceux que le coup a déjà touchés (il ne devine pas deux fois le même coup)", () => {
    const f = duel();
    skipIntro(f);
    faceToFace(f, 1.6);
    for (let k = 0; k < 20 && f.fighters[0]!.hitIds.length === 0; k++) stepFight(f, [tap(ATK, 1, 0)(k), NO_INPUT]);
    const a = f.fighters[0]!;
    expect(a.hitIds).toEqual([1]);
    // L'appareil rejoue la suite du coup (l'arrêt sur image fini), l'autre encore à portée
    const replay = (keepHits: boolean) => {
      const solo: Fight = JSON.parse(JSON.stringify(f));
      const me = solo.fighters[0]!;
      me.hitIds = [];
      me.hitAt = [];
      me.stale = [];
      if (keepHits) unpackFull(me, packFull(a));
      me.hitstop = 0;
      Object.assign(solo.fighters[1]!, { state: "stand", hitstop: 0, kx: 0, ky: 0 });
      return { me, hits: predictHits(solo, 0) };
    };
    expect(replay(false).hits).toHaveLength(1);
    const { me, hits } = replay(true);
    expect(me.hitIds).toEqual(a.hitIds);
    expect(me.hitAt).toEqual(a.hitAt);
    expect(me.stale).toEqual(a.stale);
    expect(hits).toHaveLength(0);
  });

  it("la saisie attrape même en garde ; une direction projette, et se débattre aide à se dégager", () => {
    const f = duel("ginette", "marcel");
    skipIntro(f);
    faceToFace(f, 1.3);
    const shielding = (): Input => ({ x: 0, y: 0, held: SHD, pressed: 0 });
    const events = run(f, 14, [tap(GRB), shielding]);
    const [a, v] = f.fighters as [Fighter, Fighter];
    expect(events.some((e) => e.k === "grab")).toBe(true);
    expect(a.state).toBe("holding");
    expect(v.state).toBe("held");
    expect(Math.abs(v.x - a.x)).toBeLessThan(1.2);
    // Projection vers l'avant : il part, avec des pourcents
    const before = v.dmg;
    run(f, 40, [stick(1)]);
    expect(v.dmg).toBeGreaterThan(before);
    expect(v.holder).toBe(-1);
    expect(a.holding).toBe(-1);
    // Se débattre écourte la prise
    const hold = (mash: boolean) => {
      const g = duel("ginette", "marcel");
      skipIntro(g);
      faceToFace(g, 1.3);
      run(g, 12, [tap(GRB)]);
      let n = 0;
      while (g.fighters[1]!.state === "held" && n < 400) {
        run(g, 1, [() => NO_INPUT, () => (mash && n % 4 === 0 ? { x: 0, y: 0, held: ATK, pressed: ATK } : NO_INPUT)]);
        n++;
      }
      return n;
    };
    expect(hold(true)).toBeLessThan(hold(false));
  });

  it("Saut et Frapper ensemble : un petit saut et une attaque en l'air", () => {
    const f = duel();
    skipIntro(f);
    const ft = f.fighters[0]!;
    let top = 0;
    let aerial = "";
    for (let k = 0; k < 40; k++) {
      run(f, 1, [
        () => (k === 0 ? { x: 0, y: 0, held: JMP | ATK, pressed: JMP | ATK } : k < 8 ? { x: 0, y: 0, held: JMP, pressed: 0 } : NO_INPUT),
      ]);
      top = Math.max(top, ft.y);
      if (ft.state === "move" && ft.move.startsWith("a")) aerial = ft.move;
    }
    expect(aerial).toBe("an");
    const st = STYLES[ft.style];
    expect(top).toBeLessThan(((st.jump * st.jump) / (2 * st.gravity)) * 0.7);
  });

  it("la parade : la garde levée juste avant le coup n'use rien, et l'attaquant reste figé", () => {
    const parried = (late: number) => {
      const f = duel("ginette", "marcel");
      skipIntro(f);
      faceToFace(f, 1.4);
      const [a, v] = f.fighters as [Fighter, Fighter];
      v.face = -1;
      const shieldAt = 5 - late;
      const events: FightEvent[] = [];
      for (let k = 0; k < 12; k++)
        events.push(
          ...stepFight(f, [
            k === 0 ? { x: 0, y: 0, held: ATK, pressed: ATK } : NO_INPUT,
            k >= shieldAt ? { x: 0, y: 0, held: SHD, pressed: k === shieldAt ? SHD : 0 } : NO_INPUT,
          ]),
        );
      return { events, a, v };
    };
    // La garde levée deux images avant la frappe : parée
    const p = parried(2);
    expect(p.events.some((e) => e.k === "hit" && e.kind === "parry")).toBe(true);
    expect(p.v.dmg).toBe(0);
    expect(p.v.shield).toBeGreaterThan(49);
    expect(p.a.hitstop).toBeGreaterThan(8);
    // Levée bien avant : une garde ordinaire, qui s'use
    const q = (() => {
      const f = duel("ginette", "marcel");
      skipIntro(f);
      faceToFace(f, 1.4);
      const guard = (): Input => ({ x: 0, y: 0, held: SHD, pressed: 0 });
      run(f, 10, [() => NO_INPUT, guard]);
      const events = run(f, 12, [tap(ATK), guard]);
      return { events, v: f.fighters[1]! };
    })();
    expect(q.events.some((e) => e.k === "hit" && e.kind === "shield")).toBe(true);
    expect(q.v.shield).toBeLessThan(50);
  });

  it("un coup répété s'use : il fait moins de dégâts que la première fois", () => {
    const f = duel("ginette", "marcel");
    skipIntro(f);
    const v = f.fighters[1]!;
    const dealt: number[] = [];
    for (let n = 0; n < 4; n++) {
      faceToFace(f, 1.4);
      v.state = "stand";
      v.kx = v.ky = v.vx = v.vy = 0;
      v.y = 0;
      v.ground = 0;
      const before = v.dmg;
      run(f, 30, [tap(ATK)]);
      dealt.push(Math.round((v.dmg - before) * 10) / 10);
      run(f, 60);
    }
    expect(dealt[0]).toBeGreaterThan(dealt[1]!);
    expect(dealt[1]).toBeGreaterThan(dealt[3]!);
  });

  it("une attaque en l'air qui touche le sol avant de frapper atterrit sans latence", () => {
    const f = duel("marcel", "ginette");
    skipIntro(f);
    const ft = f.fighters[0]!;
    ft.y = 0.25;
    ft.ground = -1;
    ft.state = "air";
    ft.vy = -6;
    run(f, 1, [tap(ATK, 1, 0)]);
    expect(ft.move).toBe("as");
    run(f, 4);
    expect(ft.state).toBe("land");
    expect(ft.wait).toBeLessThanOrEqual(4);
  });

  it("en garde, le spécial vers le haut part aussitôt", () => {
    const f = duel();
    skipIntro(f);
    run(f, 6, [() => ({ x: 0, y: 0, held: SHD, pressed: 0 })]);
    run(f, 1, [() => ({ x: 0, y: 1, held: SHD | SPC, pressed: SPC })]);
    expect(f.fighters[0]!.move).toBe("pu");
  });

  it("depuis la garde, Frapper saisit", () => {
    const f = duel();
    skipIntro(f);
    faceToFace(f, 1.3);
    run(f, 6, [() => ({ x: 0, y: 0, held: SHD, pressed: 0 })]);
    expect(f.fighters[0]!.state).toBe("shield");
    run(f, 1, [() => ({ x: 0, y: 0, held: SHD | ATK, pressed: ATK })]);
    expect(f.fighters[0]!.move).toBe("g:grab");
  });

  it("les objets tombent du ciel et se posent", () => {
    const f = createFight({ ...DEFAULT_FIGHT_SETTINGS, items: "beaucoup" }, "place", entrants(["ginette", "marcel"]), 11);
    skipIntro(f);
    const events = run(f, 900);
    expect(events.some((e) => e.k === "item")).toBe(true);
    expect(f.items.some((i) => i.ground)).toBe(true);
  });

  it("une tarte ramassée se lance et touche", () => {
    const f = duel("ginette", "marcel");
    skipIntro(f);
    faceToFace(f, 5);
    f.items.push({ id: 999, kind: "tarte", x: f.fighters[0]!.x + 0.4, y: 0, vx: 0, vy: 0, ground: true, life: 600 });
    const events = run(f, 80, [(k) => (k === 0 || k === 20 ? { x: 1, y: 0, held: ATK, pressed: ATK } : NO_INPUT)]);
    expect(events.some((e) => e.k === "pick" && e.kind === "tarte")).toBe(true);
    expect(events.some((e) => e.k === "throw" && e.kind === "tarte")).toBe(true);
    expect(f.fighters[1]!.dmg).toBeGreaterThan(0);
  });

  it("chaque coup de chaque style est jouable du début à la fin sans bloquer", () => {
    for (const id of HABITUE_IDS) {
      for (const slot of MOVE_SLOTS) {
        const f = duel(id, "marcel");
        skipIntro(f);
        const air = slot.startsWith("a");
        const ft = f.fighters[0]!;
        if (air) {
          ft.y = 4;
          ft.ground = -1;
          ft.state = "air";
        }
        ft.state = "move";
        ft.move = slot;
        ft.mt = 0;
        const def = moveDef(id, slot)!;
        run(f, def.frames + (def.charge?.max ?? 0) + 140);
        expect(ft.state, `${id} ${slot}`).not.toBe("move");
      }
    }
  });
});
