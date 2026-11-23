import { describe, expect, it } from "vitest";
import { ARENA_IDS, ARENAS, blastOf, ledgesOf } from "./arenas.ts";
import {
  createFight,
  DEFAULT_FIGHT_SETTINGS,
  DI_MAX,
  HIGH_ITEMS,
  hitCancelable,
  INTRO_FRAMES,
  moveDef,
  predictHits,
  stepFight,
  stepPredict,
  stepSolo,
  type Entrant,
} from "./engine.ts";
import {
  ATK,
  GRB,
  HABITUE_IDS,
  FRT,
  JMP,
  NAR,
  NO_INPUT,
  SHD,
  SPC,
  UPJ,
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
        expect(m.charge!.at).toBeGreaterThanOrEqual(8);
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

  it("les coups simples partent dès l'appui : tenir Frapper ne les retarde pas et n'en fait pas un coup fort", () => {
    // Le même coup, appui bref ou appui tenu : il frappe à la même image
    const firstHit = (frames: number) => {
      const f = duel();
      skipIntro(f);
      const a = f.fighters[0]!;
      for (let k = 0; k < 30; k++) {
        stepFight(f, [hold(ATK, frames, 1, 0)(k), NO_INPUT]);
        const def = moveDef(a.style, a.move);
        if (a.move === "s" && def && a.mt >= Math.min(...def.hits.map((h) => h.from))) return k;
      }
      return -1;
    };
    expect(firstHit(1)).toBeGreaterThan(0);
    expect(firstHit(20)).toBe(firstHit(1));
    const g = duel();
    skipIntro(g);
    run(g, CHARGE_DECIDE + 12, [hold(ATK, CHARGE_DECIDE + 12)]);
    expect(g.fighters[0]!.move).not.toBe("cs");
  });

  it("Haut et un coup ensemble : le coup vers le haut, au sol ; Haut seul : un saut", () => {
    const up =
      (bits: number) =>
      (k: number): Input =>
        k === 0 ? { x: 0, y: 1, held: bits, pressed: bits } : NO_INPUT;
    const a = duel();
    skipIntro(a);
    run(a, 1, [up(JMP | UPJ | ATK)]);
    expect(a.fighters[0]!.move).toBe("u");
    expect(a.fighters[0]!.ground).toBeGreaterThanOrEqual(0);
    // Le coup un instant après la touche Haut (pendant l'élan du saut) : encore le coup vers le haut
    const b = duel();
    skipIntro(b);
    run(b, 1, [up(JMP | UPJ)]);
    expect(b.fighters[0]!.state).toBe("squat");
    run(b, 1, [() => ({ x: 0, y: 1, held: FRT, pressed: FRT })]);
    expect(b.fighters[0]!.move).toBe("cu");
    // Haut seul : il saute ; le bouton Saut et un coup : le petit saut avec l'attaque en l'air
    const c = duel();
    skipIntro(c);
    run(c, 8, [up(JMP | UPJ)]);
    expect(c.fighters[0]!.state).toBe("air");
    const d = duel();
    skipIntro(d);
    run(d, 7, [(k) => (k === 0 ? { x: 0, y: 1, held: JMP | ATK, pressed: JMP | ATK } : stick(0, 1)())]);
    expect(d.fighters[0]!.move).toBe("au");
  });

  it("le coup fort part tout de suite dans la direction tenue, et se charge tant qu'on tient le bouton", () => {
    for (const [y, key] of [
      [0, "cs"],
      [1, "cu"],
      [-1, "cd"],
    ] as const) {
      const f = duel();
      skipIntro(f);
      run(f, 1, [tap(FRT, 0, y)]);
      expect(f.fighters[0]!.move, key).toBe(key);
    }
    const f = duel();
    skipIntro(f);
    run(f, 40, [hold(FRT, 40, -1, 0)]);
    const a = f.fighters[0]!;
    expect(a.move).toBe("cs");
    expect(a.face).toBe(-1);
    expect(a.charge).toBeGreaterThan(20);
    // En l'air, c'est une attaque en l'air
    const air = duel();
    skipIntro(air);
    run(air, 8, [tap(JMP)]);
    run(air, 1, [tap(FRT, 0, 1)]);
    expect(air.fighters[0]!.move).toBe("au");
  });

  it("au bord du plateau : la course s'y arrête ; on ne descend qu'en poussant de nouveau vers le vide", () => {
    const f = duel();
    skipIntro(f);
    const a = f.fighters[0]!;
    a.x = 4;
    f.fighters[1]!.x = -6;
    // Toute une seconde de course vers la droite : arrêté au bord, toujours au sol
    run(f, 60, [stick(1)]);
    expect(a.ground).toBe(0);
    expect(a.x).toBeCloseTo(7.5, 1);
    // Lâché puis poussé de nouveau : il descend
    run(f, 2);
    run(f, 6, [stick(1)]);
    expect(a.ground).toBe(-1);
    expect(a.x).toBeGreaterThan(7.5);
  });

  it("deux combattants l'un dans l'autre au sol s'écartent doucement ; la roulade passe au travers", () => {
    const f = duel();
    skipIntro(f);
    const [a, b] = f.fighters;
    a!.x = 0;
    b!.x = 0.05;
    run(f, 30);
    expect(b!.x - a!.x).toBeGreaterThan(0.55);
    // Une roulade vers l'autre le traverse
    faceToFace(f, 0.7);
    run(f, 2);
    run(f, 1, [() => ({ x: 1, y: 0, held: SHD, pressed: SHD })]);
    run(f, 24, [() => ({ x: 1, y: 0, held: SHD, pressed: 0 })]);
    expect(a!.x).toBeGreaterThan(b!.x);
  });

  it("lâcher le stick en pleine course : un arrêt net, pas une glissade dans le vide", () => {
    const f = duel();
    skipIntro(f);
    const a = f.fighters[0]!;
    a.x = 5.5;
    f.fighters[1]!.x = -6;
    run(f, 6, [(k) => (k < 3 ? { x: 1, y: 0, held: 0, pressed: 0 } : NO_INPUT)]);
    expect(a.vx).toBe(0);
    expect(a.ground).toBe(0);
    expect(a.x).toBeLessThanOrEqual(7.5);
  });

  it("en pleine course, Frapper vers l'avant : le coup en courant, qui garde son élan", () => {
    const f = duel();
    skipIntro(f);
    f.fighters[0]!.x = -6;
    run(f, 14, [stick(1)]);
    const a = f.fighters[0]!;
    const x0 = a.x;
    run(f, 1, [tap(ATK, 1, 0)]);
    expect(a.move).toBe("g:dash");
    run(f, 8, [stick(1)]);
    expect(a.x - x0).toBeGreaterThan(1.2);
  });

  it("un coup qui a touché s'enchaîne : passé sa frappe, un nouvel appui part aussitôt ; raté, il va jusqu'au bout", () => {
    // Touché : le coup de côté, puis un appui juste après sa frappe lance déjà le coup vers le haut
    const f = duel();
    skipIntro(f);
    faceToFace(f, 1.6);
    const a = f.fighters[0]!;
    run(f, 1, [tap(ATK, 1, 0)]);
    for (let k = 0; k < 40 && !a.landed; k++) run(f, 1);
    expect(a.landed).toBe(true);
    while (a.hitstop > 0) run(f, 1);
    run(f, 6);
    expect(a.move).toBe("s");
    run(f, 1, [tap(ATK, 0, 1)]);
    expect(a.move).toBe("u");
    // Raté (personne à portée) : le même appui attend la fin du coup
    const g = duel();
    skipIntro(g);
    faceToFace(g, 6);
    const b = g.fighters[0]!;
    run(g, 1, [tap(ATK, 1, 0)]);
    run(g, 10);
    expect(b.landed).toBe(false);
    run(g, 1, [tap(ATK, 0, 1)]);
    expect(b.move).toBe("s");
  });

  it("à bas pourcentage, l'étourdissement laisse le temps d'enchaîner un petit coup", () => {
    const f = duel();
    skipIntro(f);
    faceToFace(f, 1.6);
    const a = f.fighters[0]!;
    const v = f.fighters[1]!;
    run(f, 1, [tap(ATK, 1, 0)]);
    for (let k = 0; k < 40 && v.state !== "hurt"; k++) run(f, 1);
    while (a.hitstop > 0) run(f, 1);
    // L'attaquant enchaîne dès que possible avec le même coup (l'autre a reculé d'un pas) : il touche encore avant que
    // l'autre ait repris ses esprits
    let k = 0;
    while (!hitCancelable(a) && k++ < 30) run(f, 1);
    const before = v.dmg;
    let comboHit = false;
    let chain = false;
    run(f, 1, [tap(ATK, 1, 0)]);
    for (let i = 0; i < 12; i++) {
      const wasHurt = v.state === "hurt";
      const ev = run(f, 1);
      if (v.dmg > before) {
        comboHit = wasHurt;
        chain = ev.some((e) => e.k === "hit" && e.chain === true);
        break;
      }
    }
    expect(comboHit).toBe(true);
    // Le combat le dit : c'est un enchaînement (le compteur « 2 coups ! » s'y fie)
    expect(chain).toBe(true);
  });

  it("le petit coup qui touche s'enchaîne : un nouvel appui juste après sa frappe le relance aussitôt", () => {
    const f = duel();
    skipIntro(f);
    faceToFace(f, 1.2);
    const a = f.fighters[0]!;
    run(f, 1, [tap(ATK)]);
    for (let k = 0; k < 20 && !a.landed; k++) run(f, 1);
    expect(a.landed).toBe(true);
    let restarted = false;
    for (let k = 0; k < 12 && !restarted; k++) {
      const before = a.mt;
      run(f, 1, [tap(ATK)]);
      restarted = a.move === "n" && a.mt < before;
    }
    expect(restarted).toBe(true);
  });

  it("une série de petits coups : trois au plus, le troisième repousse l'autre hors de portée", () => {
    for (const style of HABITUE_IDS) {
      const f = duel(style, "marcel");
      skipIntro(f);
      faceToFace(f, 1.0);
      const v = f.fighters[1]!;
      // Frapper à chaque image pendant deux secondes, sans direction
      let series = 0;
      let longest = 0;
      for (let k = 0; k < 120; k++) {
        const ev = run(f, 1, [tap(ATK)]);
        for (const e of ev) {
          if (e.k !== "hit" || e.kind !== "hit" || e.a !== 0) continue;
          series = e.chain ? series + 1 : 1;
          longest = Math.max(longest, series);
        }
      }
      expect(longest, style).toBeLessThanOrEqual(3);
      expect(v.dmg, style).toBeLessThan(25);
    }
  });

  it("un coup manqué au sol se paie : on reprend son équilibre un instant ; un coup qui touche, non", () => {
    const f = duel();
    skipIntro(f);
    const a = f.fighters[0]!;
    // Personne à portée : le coup de côté va jusqu'au bout, puis il se rattrape
    run(f, 1, [tap(ATK, 1, 0)]);
    const def = moveDef("ginette", "s")!;
    run(f, def.frames);
    expect(a.state).toBe("land");
    run(f, 10);
    expect(a.state).toBe("stand");
    // Le même coup qui touche : debout dès la fin du coup
    const g = duel();
    skipIntro(g);
    faceToFace(g, 1.4);
    const b = g.fighters[0]!;
    run(g, 1, [tap(ATK, 1, 0)]);
    run(g, def.frames + 8);
    expect(b.hitIds.length > 0 || b.state === "stand").toBe(true);
    expect(b.state).not.toBe("land");
  });

  it("frapper dans le vide encore et encore sans bouger essouffle : la reprise s'allonge ; souffler ou faire quelques pas, et c'est passé", () => {
    const f = duel();
    skipIntro(f);
    const a = f.fighters[0]!;
    const def = moveDef("ginette", "s")!;
    /** Le coup de côté dans le vide, dès qu'il peut : combien de temps il lui faut pour se reprendre */
    const whiff = () => {
      while (a.state !== "stand") run(f, 1);
      run(f, 1, [tap(ATK, 1, 0)]);
      run(f, def.frames);
      expect(a.state).toBe("land");
      return a.wait;
    };
    const lags = [whiff(), whiff(), whiff(), whiff(), whiff()];
    expect(lags[0]).toBe(10);
    expect(lags[1]).toBeGreaterThan(lags[0]!);
    expect(lags[2]).toBeGreaterThan(lags[1]!);
    expect(lags[3]).toBeGreaterThan(lags[2]!);
    expect(lags[4]).toBeGreaterThan(lags[3]!);
    // Un instant sans frapper : le souffle revient
    while (a.state !== "stand") run(f, 1);
    run(f, 50);
    expect(whiff()).toBe(lags[0]);
    whiff();
    whiff();
    // Quelques pas : aussi
    while (a.state !== "stand") run(f, 1);
    run(f, 12, [stick(-1)]);
    run(f, 4);
    expect(whiff()).toBe(lags[0]);
  });

  it("la vie de l'arène : la charrette renverse celui qui reste sur le plancher, pas celui qui est sur un banc", () => {
    const f = duel();
    skipIntro(f);
    f.hazardAt = f.frame + 1;
    run(f, 1);
    const h = f.hazard!;
    expect(h.kind).toBe("charrette");
    const [a, b] = f.fighters;
    a!.x = 1;
    b!.x = -3.8;
    b!.y = 3;
    b!.ground = -1;
    b!.state = "air";
    run(f, 30);
    expect(b!.ground).toBe(1);
    const events = run(f, h.to - f.frame + 1);
    expect(events.some((e) => e.k === "hazard" && e.go)).toBe(true);
    expect(a!.dmg).toBeGreaterThan(0);
    expect(b!.dmg).toBe(0);
    expect(f.hazard).toBeNull();
    expect(f.hazardAt).toBeGreaterThan(f.frame + 20 * 60);
  });

  it("la vie de l'arène : les pétards du bal n'éclatent que sur leurs marques, annoncées à l'avance", () => {
    const f = createFight({ ...DEFAULT_FIGHT_SETTINGS, items: "aucun" }, "bal", entrants(["ginette", "marcel"]), 42);
    skipIntro(f);
    f.hazardAt = f.frame + 1;
    run(f, 1);
    const h = f.hazard!;
    expect(h.kind).toBe("petards");
    expect(h.at - f.frame).toBeGreaterThan(60);
    const [a, b] = f.fighters;
    const spot = { x: 0, y: 0 };
    // Le premier sur une marque du plancher, l'autre loin de toutes
    const onFloor: number[] = [];
    for (let i = 0; i + 1 < h.spots.length; i += 2) if (h.spots[i] === 0) onFloor.push(h.spots[i + 1]!);
    expect(onFloor.length).toBeGreaterThan(0);
    spot.x = -6.8 + onFloor[0]!;
    const free = [-6, -3, 0, 3, 6].find((x) => onFloor.every((o) => Math.abs(-6.8 + o - x) > 2.2))!;
    a!.x = spot.x;
    b!.x = free;
    run(f, h.at - f.frame);
    expect(a!.state).toBe("hurt");
    expect(b!.dmg).toBe(0);
  });

  it("la vie de l'arène : la cloche repousse vers le bord, moins fort celui qui est en garde ; sans la règle, rien", () => {
    const f = createFight({ ...DEFAULT_FIGHT_SETTINGS, items: "aucun" }, "clocher", entrants(["ginette", "ginette"]), 42);
    skipIntro(f);
    f.hazardAt = f.frame + 1;
    run(f, 1);
    const h = f.hazard!;
    expect(h.kind).toBe("cloche");
    const [a, b] = f.fighters;
    a!.x = 1.5;
    b!.x = -1.5;
    run(f, h.at - f.frame - 8);
    run(f, 8, [() => NO_INPUT, hold(SHD, 60)]);
    run(f, 40, [() => NO_INPUT, () => ({ x: 0, y: 0, held: SHD, pressed: 0 })]);
    expect(a!.x).toBeGreaterThan(2.5);
    expect(-b!.x).toBeLessThan(a!.x - 0.5);
    const quiet = createFight(
      { ...DEFAULT_FIGHT_SETTINGS, items: "aucun", events: false },
      "clocher",
      entrants(["ginette", "ginette"]),
      42,
    );
    skipIntro(quiet);
    expect(run(quiet, 3 * 60 * 60).some((e) => e.k === "hazard")).toBe(false);
  });

  it("les objets à aller chercher : ils tombent surtout en hauteur, et les plus utiles seulement là-haut", () => {
    const f = duel("ginette", "marcel", { items: "beaucoup" });
    skipIntro(f);
    const drops = run(f, 4 * 60 * 60).filter((e) => e.k === "item");
    expect(drops.length).toBeGreaterThan(20);
    // Au-dessus d'un banc ou du kiosque, ils partent de plus haut que 6 m au-dessus du grand plateau
    const up = drops.filter((e) => e.k === "item" && e.y > 6.5);
    expect(up.length / drops.length).toBeGreaterThan(0.5);
    for (const e of drops) if (e.k === "item" && HIGH_ITEMS.includes(e.kind)) expect(e.y).toBeGreaterThan(6.5);
  });

  it("l'élan paie : le même coup fort, lancé en courant, frappe plus fort que debout sans bouger", () => {
    const hitWith = (running: boolean) => {
      const f = duel();
      skipIntro(f);
      faceToFace(f, running ? 2.4 : 1.8);
      const [a, v] = f.fighters;
      if (running) a!.vx = STYLES.ginette.run;
      const events = run(f, 40, [tap(FRT, 1, 0)]);
      const hit = events.find((e) => e.k === "hit" && e.kind === "hit" && e.a === 0);
      return { dmg: v!.dmg, elan: hit?.k === "hit" ? Boolean(hit.elan) : null };
    };
    const still = hitWith(false);
    const moving = hitWith(true);
    expect(still.elan).toBe(false);
    expect(moving.elan).toBe(true);
    expect(moving.dmg).toBeGreaterThan(still.dmg * 1.08);
  });

  it("dans le vide, le petit coup va jusqu'au bout : marteler ne fait pas un mur de petits coups", () => {
    const f = duel();
    skipIntro(f);
    const a = f.fighters[0]!;
    // Frapper à chaque image, personne à portée : un petit coup entier avant le suivant
    const starts: number[] = [];
    for (let k = 0; k < 45; k++) {
      const before = a.state === "move" ? a.mt : -1;
      run(f, 1, [tap(ATK)]);
      if (a.state === "move" && a.mt < before) starts.push(k);
      if (before === -1 && a.state === "move") starts.push(k);
    }
    const def = moveDef("ginette", "n")!;
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(def.frames);
  });

  it("après un petit coup qui touche, une direction avec Frapper donne le coup de côté, pas un nouveau petit coup", () => {
    const f = duel();
    skipIntro(f);
    faceToFace(f, 1.2);
    const a = f.fighters[0]!;
    const v = f.fighters[1]!;
    run(f, 1, [tap(ATK)]);
    for (let k = 0; k < 20 && !a.landed; k++) run(f, 1);
    expect(a.landed).toBe(true);
    // Frapper vers l'avant à chaque image : le petit coup ne se relance pas, le coup de côté part dès qu'il s'annule
    for (let k = 0; k < 20 && a.move === "n"; k++) run(f, 1, [tap(ATK, 1, 0)]);
    expect(a.move).toBe("s");
    expect(v.state).toBe("hurt");
    // Et il touche l'autre encore étourdi, même à 0 % : le petit coup ouvre un vrai enchaînement
    const before = v.dmg;
    let stillHurt = false;
    for (let k = 0; k < 20 && v.dmg === before; k++) {
      stillHurt = v.state === "hurt";
      run(f, 1);
    }
    expect(v.dmg).toBeGreaterThan(before);
    expect(stillHurt).toBe(true);
  });

  it("l'attaque chargée à fond fait sortir un adversaire à 120 % depuis le bord", () => {
    const f = duel("ginette", "ginette");
    skipIntro(f);
    faceToFace(f, 1.8);
    f.fighters[0]!.x = 3.5;
    f.fighters[1]!.x = 5.2;
    f.fighters[1]!.dmg = 120;
    const events = run(f, 240, [hold(FRT, 75, 1, 0)]);
    expect(events.some((e) => e.k === "ko" && e.v === 1 && e.by === 0)).toBe(true);
  });

  it("à 0 %, le même coup ne sort personne", () => {
    const f = duel("ginette", "ginette");
    skipIntro(f);
    faceToFace(f, 1.8);
    const events = run(f, 240, [hold(FRT, 75, 1, 0)]);
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

  it("la hauteur du saut suit l'appui : tapé, un petit saut ; tenu, le grand ; entre les deux, entre les deux", () => {
    const heights = [1, 5, 8, 20].map((n) => {
      const f = duel();
      skipIntro(f);
      const a = f.fighters[0]!;
      let best = a.y;
      for (let k = 0; k < 70; k++) {
        run(f, 1, [() => (k < n ? { x: 0, y: 0, held: JMP, pressed: k === 0 ? JMP : 0 } : NO_INPUT)]);
        best = Math.max(best, a.y);
      }
      return best;
    });
    expect(heights[1]!).toBeGreaterThan(heights[0]! + 0.2);
    expect(heights[2]!).toBeGreaterThan(heights[1]! + 0.2);
    expect(heights[3]!).toBeGreaterThan(heights[2]! + 0.2);
    // Tenu tout du long : la hauteur du grand saut, comme avant
    const st = STYLES.ginette;
    expect(heights[3]!).toBeCloseTo((st.jump * st.jump) / (2 * st.gravity), 0);
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

  it("aux vies, deux sorties sur la même image : la même place pour les deux, quel que soit l'ordre des sièges", () => {
    for (const order of [
      ["ginette", "marcel", "simone"],
      ["marcel", "ginette", "simone"],
    ] as HabitueId[][]) {
      const f = createFight({ ...DEFAULT_FIGHT_SETTINGS, stocks: 1, items: "aucun" }, "clocher", entrants(order), 7);
      skipIntro(f);
      const drop = (i: number) => {
        const ft = f.fighters[i]!;
        ft.x = 0;
        ft.y = -20;
        ft.ground = -1;
        ft.state = "air";
      };
      // Le troisième sort d'abord ; puis les deux derniers ensemble
      drop(2);
      run(f, 2);
      drop(0);
      drop(1);
      run(f, 2);
      expect(f.phase).toBe("over");
      expect(f.fighters.map((ft) => ft.rank)).toEqual([1, 1, 3]);
      expect(f.winners).toEqual([0, 1]);
    }
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
    // Éjecté loin dehors (en l'air : debout, le bord le retiendrait)
    Object.assign(v, { x: 30, y: 3, ground: -1, state: "air" });
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

  it("l'appareil anticipe tout le combat comme le serveur le calcule, coups compris, quand il connaît les commandes", () => {
    const f = duel("ginette", "marcel");
    skipIntro(f);
    faceToFace(f, 2.4);
    const world: Fight = JSON.parse(JSON.stringify(f));
    const mine = (k: number): Input => {
      const bits = k === 3 ? ATK : k === 40 ? JMP : k === 55 ? FRT : 0;
      return { x: k < 20 ? 1 : -0.5, y: 0, held: k >= 55 && k < 70 ? FRT : bits, pressed: bits };
    };
    const theirs = (k: number): Input => ({ x: k < 30 ? -1 : 0.4, y: 0, held: k % 37 === 0 ? ATK : 0, pressed: k % 37 === 0 ? ATK : 0 });
    let serverHits = 0;
    let guessedHits = 0;
    for (let k = 0; k < 150; k++) {
      serverHits += stepFight(f, [mine(k), theirs(k)]).filter((e) => e.k === "hit").length;
      guessedHits += stepPredict(world, [mine(k), theirs(k)]).filter((e) => e.k === "hit").length;
    }
    expect(serverHits).toBeGreaterThan(0);
    expect(guessedHits).toBe(serverHits);
    for (const i of [0, 1]) {
      expect(world.fighters[i]!.x).toBeCloseTo(f.fighters[i]!.x, 6);
      expect(world.fighters[i]!.y).toBeCloseTo(f.fighters[i]!.y, 6);
      expect(world.fighters[i]!.dmg).toBe(f.fighters[i]!.dmg);
      expect(world.fighters[i]!.state).toBe(f.fighters[i]!.state);
    }
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

  it("narguer : debout, une petite danse d'une seconde, sans toucher personne", () => {
    const f = duel();
    skipIntro(f);
    faceToFace(f, 1.2);
    run(f, 1, [tap(NAR)]);
    const a = f.fighters[0]!;
    expect(a.state).toBe("move");
    expect(a.move).toBe("g:taunt");
    run(f, 70);
    expect(a.state).toBe("stand");
    expect(f.fighters[1]!.dmg).toBe(0);
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

  it("une tarte se ramasse avec Saisir, puis se lance (Frapper ou Saisir) et touche", () => {
    for (const thrown of [ATK, GRB]) {
      const f = duel("ginette", "marcel");
      skipIntro(f);
      faceToFace(f, 5);
      f.items.push({ id: 999, kind: "tarte", x: f.fighters[0]!.x + 0.4, y: 0, vx: 0, vy: 0, ground: true, life: 600 });
      const events = run(f, 80, [
        (k) => (k === 0 ? { x: 0, y: 0, held: GRB, pressed: GRB } : k === 20 ? { x: 1, y: 0, held: thrown, pressed: thrown } : NO_INPUT),
      ]);
      expect(events.some((e) => e.k === "pick" && e.kind === "tarte")).toBe(true);
      expect(events.some((e) => e.k === "throw" && e.kind === "tarte")).toBe(true);
      expect(f.fighters[1]!.dmg).toBeGreaterThan(0);
    }
  });

  it("Frapper à côté d'un objet frappe, sans le ramasser ; loin de tout objet, Saisir tend la main", () => {
    const f = duel("ginette", "marcel");
    skipIntro(f);
    faceToFace(f, 5);
    const a = f.fighters[0]!;
    f.items.push({ id: 999, kind: "tarte", x: a.x + 0.4, y: 0, vx: 0, vy: 0, ground: true, life: 600 });
    const events = run(f, 1, [tap(ATK)]);
    expect(events.some((e) => e.k === "pick")).toBe(false);
    expect(a.move).toBe("n");
    expect(a.item).toBeFalsy();
    const g = duel("ginette", "marcel");
    skipIntro(g);
    faceToFace(g, 5);
    run(g, 1, [tap(GRB)]);
    expect(g.fighters[0]!.move).toBe("g:grab");
  });

  it("en l'air, Saisir attrape l'objet qui passe à portée de main", () => {
    const f = duel("ginette", "marcel");
    skipIntro(f);
    faceToFace(f, 5);
    const a = f.fighters[0]!;
    run(f, 10, [tap(JMP)]);
    expect(a.ground).toBe(-1);
    f.items.push({ id: 999, kind: "tarte", x: a.x + 0.3, y: a.y + 0.6, vx: 0, vy: 0, ground: false, life: 600 });
    const events = run(f, 1, [tap(GRB)]);
    expect(events.some((e) => e.k === "pick" && e.kind === "tarte")).toBe(true);
    expect(a.item).toBe("tarte");
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
