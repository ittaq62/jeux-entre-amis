import { describe, expect, it } from "vitest";
import { botCommand, buildNav, findPath, nearestNode, newBotMemory } from "./bot.ts";
import { getMap, MAP_IDS, type MapId } from "./maps.ts";
import {
  applyCmd,
  chooseNext,
  chooseSpawn,
  CONQUEST,
  createMatch,
  finish,
  giveUp,
  hurt,
  REVIVE,
  upgradeMatch,
  waitingRescue,
  worldOf,
  worldStep,
  type EscEvent,
  type Match,
  type Pose,
} from "./match.ts";
import { DEFAULT_SETTINGS, type EscarmoucheSettings, type Mode } from "./rules.ts";
import { B, copySoldier, decodeCmd, DT, encodeCmd, eyeOf, newSoldier, quantizeCmd, RADIUS, stepSoldier, type Cmd } from "./soldier.ts";
import { encodeMe, encodeTick, readFighter } from "./view.ts";
import { damageAt, WEAPONS, withAttachments } from "./weapons.ts";
import { World } from "./world.ts";

const idle = (s: number, over: Partial<Cmd> = {}): Cmd => ({ s, mx: 0, mz: 0, yaw: 0, pitch: 0, b: 0, vt: 0, ...over });

function settings(over: Partial<EscarmoucheSettings> = {}): EscarmoucheSettings {
  return { ...DEFAULT_SETTINGS, map: "hameau", ...over };
}

function live(m: Match) {
  const ev: EscEvent[] = [];
  while (m.phase === "countdown") worldStep(m, ev);
  return ev;
}

describe("Escarmouche : les cartes", () => {
  for (const id of MAP_IDS) {
    it(`${id} : chaque point d'apparition est libre et posé au sol`, () => {
      const gm = getMap(id);
      const w = worldOf(id);
      for (const sp of [...gm.spawns[0], ...gm.spawns[1], ...gm.ffa]) {
        expect(w.overlaps(sp.x - RADIUS, sp.y + 0.01, sp.z - RADIUS, sp.x + RADIUS, sp.y + 1.78, sp.z + RADIUS), `${sp.x},${sp.z}`).toBe(
          false,
        );
        expect(sp.x).toBeGreaterThan(gm.bounds.x0);
        expect(sp.x).toBeLessThan(gm.bounds.x1);
      }
    });

    it(`${id} : les trois drapeaux de la conquête sont posés au sol, dégagés, et symétriques`, () => {
      const gm = getMap(id);
      const w = worldOf(id);
      const [a, , c] = gm.points;
      expect(a.x).toBe(-c.x);
      expect(a.z).toBe(-c.z);
      expect(Math.abs(gm.points[1].x) + Math.abs(gm.points[1].z)).toBe(0);
      for (const p of gm.points) {
        expect(w.overlaps(p.x - 0.5, p.y + 0.02, p.z - 0.5, p.x + 0.5, p.y + 1.78, p.z + 0.5), `${p.x},${p.z}`).toBe(false);
        expect(w.overlaps(p.x - 0.2, p.y - 0.1, p.z - 0.2, p.x + 0.2, p.y + 0.01, p.z + 0.2), `${p.x},${p.z}`).toBe(true);
      }
    });

    it(`${id} : symétrique par un demi-tour (même nombre de boîtes de chaque côté, drapeaux opposés)`, () => {
      const gm = getMap(id);
      expect(gm.flags[0].x).toBe(-gm.flags[1].x);
      expect(gm.spawns[0].length).toBe(gm.spawns[1].length);
      const key = (b: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }) =>
        [b.x0, b.z0, b.x1, b.z1, b.y0, b.y1].map((v) => Math.round(v * 100)).join(",");
      const keys = new Set(gm.boxes.map(key));
      const missing = gm.boxes.filter((b) => !keys.has(key({ x0: -b.x1, x1: -b.x0, z0: -b.z1, z1: -b.z0, y0: b.y0, y1: b.y1 })));
      expect(missing).toEqual([]);
    });

    it(`${id} : les bots trouvent un chemin d'une base à l'autre, et jusqu'à la zone`, () => {
      const gm = getMap(id);
      const nav = buildNav(id);
      const a = gm.spawns[0][0]!;
      const b = gm.spawns[1][0]!;
      const from = nearestNode(nav, a.x, a.y, a.z);
      const to = nearestNode(nav, b.x, b.y, b.z);
      expect(findPath(nav, from, to, 20000).length).toBeGreaterThan(10);
      expect(findPath(nav, from, nearestNode(nav, gm.zone.x, 0, gm.zone.z), 20000).length).toBeGreaterThan(5);
      for (const sp of gm.ffa)
        expect(findPath(nav, from, nearestNode(nav, sp.x, sp.y, sp.z), 20000).length, `${sp.x},${sp.z}`).toBeGreaterThan(0);
    });
  }

  it("on monte à l'étage d'une maison du Hameau par l'escalier", () => {
    const nav = buildNav("hameau");
    // L'étage de la maison A (plancher à 3,2 m)
    const up = nearestNode(nav, -23, 3.2, 10);
    expect(nav.py[up]).toBeCloseTo(3.2, 1);
    const path = findPath(nav, nearestNode(nav, -43, 0, 0), up, 20000);
    expect(path.length).toBeGreaterThan(5);
  });
});

describe("Escarmouche : le soldat", () => {
  const world = worldOf("hameau");

  it("marche, s'arrête contre un mur, saute et retombe", () => {
    const s = newSoldier(-40, 0, 0, Math.PI / 2, "fa");
    // Il regarde vers -x (yaw +90°) : la grange et le bord de la carte sont par là
    for (let k = 1; k <= 600; k++) stepSoldier(s, idle(k, { mz: 1, yaw: Math.PI / 2 }), world);
    expect(s.x).toBeGreaterThan(-46);
    expect(s.x).toBeLessThan(-44);
    expect(s.ground).toBe(true);
    stepSoldier(s, idle(601, { b: B.jump }), world);
    let top = s.y;
    for (let k = 602; k < 700; k++) {
      stepSoldier(s, idle(k), world);
      top = Math.max(top, s.y);
    }
    expect(top).toBeGreaterThan(0.7);
    expect(s.y).toBeCloseTo(0, 3);
    expect(s.ground).toBe(true);
  });

  it("monte l'escalier de la maison A jusqu'à l'étage", () => {
    // Au pied de l'escalier (x -27.1, de z 9.6 à 13.1), face à la montée (+z : yaw 180°)
    const s = newSoldier(-27.1, 0, 8.6, Math.PI, "fa");
    for (let k = 1; k <= 200; k++) stepSoldier(s, idle(k, { mz: 1, yaw: Math.PI }), world);
    expect(s.y).toBeGreaterThan(3.1);
  });

  it("le même pas donne exactement le même résultat (le téléphone et le serveur s'accordent)", () => {
    const a = newSoldier(-40, 0, 0, 0, "fa");
    const b = copySoldier(a);
    const cmds: Cmd[] = [];
    for (let k = 1; k <= 300; k++) {
      cmds.push(quantizeCmd(idle(k, { mx: Math.sin(k / 20), mz: 0.8, yaw: k / 90, pitch: 0.1, b: k % 40 < 20 ? B.fire : B.sprint })));
    }
    for (const c of cmds) stepSoldier(a, c, world);
    for (const c of cmds) stepSoldier(b, decodeCmd(encodeCmd(c))!, world);
    expect(b).toEqual(a);
  });

  it("le fusil d'assaut vide son chargeur au rythme prévu, puis recharge tout seul", () => {
    const s = newSoldier(-40, 0, 0, 0, "fa");
    let shots = 0;
    let k = 0;
    while (s.mag[0] > 0 && k < 2000) {
      const out = stepSoldier(s, idle(++k, { b: B.fire }), world);
      shots += out.shots.length;
    }
    expect(shots).toBe(30);
    // 30 coups à 0,092 s : environ 2,7 s
    expect(k * DT).toBeGreaterThan(2.5);
    expect(k * DT).toBeLessThan(3);
    for (let q = 0; q < 200; q++) stepSoldier(s, idle(++k, { b: B.fire }), world);
    expect(s.res[0]).toBeLessThan(WEAPONS.fa.reserve);
  });

  it("le fusil à pompe tire huit plombs par coup, un coup par appui", () => {
    const s = newSoldier(-40, 0, 0, 0, "pompe");
    let k = 0;
    const first = stepSoldier(s, idle(++k, { b: B.fire }), world);
    expect(first.shots[0]!.dirs).toHaveLength(8);
    let more = 0;
    for (let q = 0; q < 120; q++) more += stepSoldier(s, idle(++k, { b: B.fire }), world).shots.length;
    expect(more).toBe(0);
  });
});

function duelMatch(mode: Mode = "solo", map: MapId = "hameau") {
  const m = createMatch(
    settings({ mode, map }),
    [
      { id: "a", team: 0, bot: false, primary: "fa" },
      { id: "b", team: 1, bot: false, primary: "fa" },
    ],
    7,
  );
  live(m);
  return m;
}

/** Place deux soldats face à face dans l'avenue du Hameau */
function face(m: Match, gap = 8) {
  const [a, b] = m.fighters;
  Object.assign(a!.s, { x: -24, y: 0, z: 3, yaw: -Math.PI / 2 });
  Object.assign(b!.s, { x: -24 + gap, y: 0, z: 3, yaw: Math.PI / 2 });
  for (const f of m.fighters) f.shieldUntil = 0;
}

describe("Escarmouche : la partie", () => {
  it("une rafale au tronc élimine en quatre balles, le tireur marque, la victime revient au combat", () => {
    const m = duelMatch();
    face(m);
    const ev: EscEvent[] = [];
    let k = 0;
    // Le tireur vise le tronc de b, en visant (dispersion faible)
    const b = m.fighters[1]!;
    const pitch = Math.atan2(b.s.y + 1.2 - eyeOf(m.fighters[0]!.s), 8);
    while (b.s.alive && k < 120) applyCmd(m, 0, idle(++k, { yaw: -Math.PI / 2, pitch, b: B.fire | B.ads }), null, ev);
    expect(b.s.alive).toBe(false);
    expect(ev.filter((e) => e.k === "hit" && e.v === 1)).toHaveLength(4);
    expect(m.fighters[0]!.stats.kills).toBe(1);
    expect(ev.some((e) => e.k === "kill" && e.a === 0 && e.v === 1)).toBe(true);
    for (let q = 0; q < 60 * 4.5; q++) worldStep(m, ev);
    expect(b.s.alive).toBe(true);
    expect(b.hp).toBe(100);
    expect(ev.some((e) => e.k === "spawn" && e.i === 1)).toBe(true);
  });

  it("les balles cherchent la cible là où le tireur la voyait (retour dans le temps)", () => {
    const m = duelMatch();
    face(m);
    const b = m.fighters[1]!;
    // Pour le serveur, b s'est écarté de trois mètres ; le tireur le voyait encore en face
    b.s.z = 6;
    const past = (): ((i: number) => Pose | null) => (i) => (i === 1 ? { x: -16, y: 0, z: 3, crouch: false, alive: true } : null);
    const ev: EscEvent[] = [];
    const pitch = Math.atan2(1.2 - eyeOf(m.fighters[0]!.s), 8);
    applyCmd(m, 0, idle(1, { yaw: -Math.PI / 2, pitch, b: B.fire | B.ads }), () => past(), ev);
    expect(ev.some((e) => e.k === "hit" && e.v === 1)).toBe(true);
    const ev2: EscEvent[] = [];
    for (let k = 2; k < 30; k++) applyCmd(m, 0, idle(k, { yaw: -Math.PI / 2, pitch, b: k % 2 ? B.fire | B.ads : B.ads }), null, ev2);
    expect(ev2.some((e) => e.k === "hit")).toBe(false);
  });

  it("une balle à la tête du fusil de précision élimine d'un coup", () => {
    const m = createMatch(
      settings(),
      [
        { id: "a", team: 0, bot: false, primary: "precision" },
        { id: "b", team: 1, bot: false, primary: "fa" },
      ],
      3,
    );
    live(m);
    face(m, 14);
    const a = m.fighters[0]!;
    const b = m.fighters[1]!;
    const pitch = Math.atan2(eyeOf(b.s) + 0.05 - eyeOf(a.s), 14);
    const ev: EscEvent[] = [];
    applyCmd(m, 0, idle(1, { yaw: -Math.PI / 2, pitch, b: B.ads }), null, ev);
    applyCmd(m, 0, idle(2, { yaw: -Math.PI / 2, pitch, b: B.ads | B.fire }), null, ev);
    expect(b.s.alive).toBe(false);
    expect(ev.some((e) => e.k === "kill" && e.h)).toBe(true);
  });

  it("pas de dégâts entre coéquipiers, ni sur qui vient d'arriver", () => {
    const m = createMatch(
      settings({ mode: "equipes" }),
      [
        { id: "a", team: 0, bot: false, primary: "fa" },
        { id: "b", team: 0, bot: false, primary: "fa" },
      ],
      3,
    );
    live(m);
    face(m);
    const pitch = Math.atan2(1.2 - eyeOf(m.fighters[0]!.s), 8);
    const ev: EscEvent[] = [];
    for (let k = 1; k < 60; k++) applyCmd(m, 0, idle(k, { yaw: -Math.PI / 2, pitch, b: B.fire | B.ads }), null, ev);
    expect(m.fighters[1]!.hp).toBe(100);
  });

  it("la grenade éclate et blesse autour d'elle, pas derrière un mur", () => {
    const m = duelMatch();
    face(m, 3);
    const ev: EscEvent[] = [];
    applyCmd(m, 0, idle(1, { yaw: -Math.PI / 2, pitch: -0.5, b: B.grenade }), null, ev);
    expect(m.grenades).toHaveLength(1);
    for (let q = 0; q < 60 * 3; q++) worldStep(m, ev);
    expect(ev.some((e) => e.k === "boom")).toBe(true);
    expect(m.fighters[1]!.hp).toBeLessThan(100);
  });

  it("le chacun pour soi s'arrête au score à atteindre, avec un classement", () => {
    const m = duelMatch();
    m.fighters[0]!.stats.kills = m.goal;
    const ev: EscEvent[] = [];
    worldStep(m, ev);
    expect(m.phase).toBe("over");
    expect(m.ranks).toEqual([1, 2]);
    expect(m.winner).toBe(0);
  });

  it("la zone rapporte un point par seconde à l'équipe qui la tient seule", () => {
    const m = duelMatch("zone");
    const [a, b] = m.fighters;
    Object.assign(a!.s, { x: 0, z: 0 });
    Object.assign(b!.s, { x: 30, z: 0 });
    const ev: EscEvent[] = [];
    for (let q = 0; q < 60 * 3 + 2; q++) worldStep(m, ev);
    expect(m.scores).toEqual([3, 0]);
    Object.assign(b!.s, { x: 1, z: 1 });
    for (let q = 0; q < 60 * 2; q++) worldStep(m, ev);
    expect(m.scores[0]).toBe(3);
    expect(m.zone!.contested).toBe(true);
  });

  it("le drapeau : pris, rapporté chez soi, la capture compte ; tombé, il revient chez lui", () => {
    const m = duelMatch("drapeau");
    const gm = getMap(m.map);
    const [a, b] = m.fighters;
    Object.assign(b!.s, { x: 0, z: -10 });
    Object.assign(a!.s, { x: gm.flags[1].x, z: gm.flags[1].z });
    const ev: EscEvent[] = [];
    worldStep(m, ev);
    expect(m.flags![1].at).toBe("carried");
    expect(a!.carrying).toBe(1);
    Object.assign(a!.s, { x: gm.flags[0].x, z: gm.flags[0].z });
    worldStep(m, ev);
    expect(m.scores[0]).toBe(1);
    expect(m.flags![1].at).toBe("home");
    // b le prend, puis meurt : le drapeau tombe, et revient seul au bout de vingt secondes
    Object.assign(b!.s, { x: gm.flags[0].x, z: gm.flags[0].z });
    Object.assign(a!.s, { x: 0, z: 10 });
    worldStep(m, ev);
    expect(m.flags![0].at).toBe("carried");
    b!.shieldUntil = 0;
    Object.assign(b!.s, { x: -20, z: 3 });
    for (let k = 0; k < 10 && b!.s.alive; k++) {
      const hit: EscEvent[] = [];
      worldStep(m, hit);
      m.fighters[1]!.hp = 1;
    }
    // On élimine b à la main : une balle au tronc
    face(m);
    Object.assign(b!.s, { z: 3 });
    const pitch = Math.atan2(1.2 - eyeOf(a!.s), 8);
    for (let k = 1; k < 40 && b!.s.alive; k++)
      applyCmd(m, 0, idle(k, { yaw: -Math.PI / 2, pitch, b: k % 2 ? B.fire | B.ads : B.ads }), null, ev);
    expect(b!.s.alive).toBe(false);
    expect(m.flags![0].at).toBe("dropped");
    a!.s.x = 30;
    for (let q = 0; q < 60 * 21; q++) worldStep(m, ev);
    expect(m.flags![0].at).toBe("home");
  });

  it("le tableau envoyé se relit : positions, arme, santé, son propre soldat en entier", () => {
    const m = duelMatch();
    const tick = encodeTick(m, []);
    const a = readFighter(tick.p, 0);
    expect(a.x).toBeCloseTo(m.fighters[0]!.s.x, 2);
    expect(a.weapon).toBe("fa");
    expect(a.hp).toBe(100);
    const me = encodeMe(m, 1);
    expect(me.s).toEqual(m.fighters[1]!.s);
    expect(JSON.parse(JSON.stringify(me)).s).toEqual(m.fighters[1]!.s);
  });
});

describe("Escarmouche : les bots", () => {
  for (const [mode, map] of [
    ["solo", "hameau"],
    ["equipes", "gare"],
    ["zone", "hameau"],
    ["drapeau", "gare"],
    ["conquete", "port"],
  ] as [Mode, MapId][]) {
    it(`${mode} sur ${map} : six bots jouent deux minutes, se déplacent, tirent et s'éliminent`, () => {
      const m = createMatch(
        settings({ mode, map, minutes: 5 }),
        Array.from({ length: 6 }, (_, i) => ({
          id: `bot-${i}`,
          team: i % 2,
          bot: true,
          primary: (["fa", "pm", "pompe", "precision"] as const)[i % 4],
        })),
        11,
      );
      const mems = m.fighters.map((f, i) => newBotMemory(i, f.s.yaw));
      const start = m.fighters.map((f) => ({ x: f.s.x, z: f.s.z }));
      let shots = 0;
      let kills = 0;
      let moved = 0;
      let cqTaken = 0;
      for (let step = 0; step < 60 * 120 && m.phase !== "over"; step++) {
        const ev: EscEvent[] = [];
        worldStep(m, ev);
        m.fighters.forEach((_, i) => applyCmd(m, i, botCommand(m, i, mems[i]!, "fort", step * 16), null, ev));
        for (const e of ev) {
          if (e.k === "shot") shots++;
          if (e.k === "kill") kills++;
          if (e.k === "cq" && e.owner >= 0) cqTaken++;
        }
        if (step === 60 * 10) moved = m.fighters.filter((f, i) => Math.hypot(f.s.x - start[i]!.x, f.s.z - start[i]!.z) > 5).length;
      }
      expect(moved).toBeGreaterThanOrEqual(4);
      expect(shots).toBeGreaterThan(20);
      expect(kills).toBeGreaterThan(2);
      if (mode === "zone") expect(m.scores[0] + m.scores[1]).toBeGreaterThan(5);
      // Conquête : des drapeaux ont changé de mains, et des tickets se sont perdus
      if (mode === "conquete") {
        expect(cqTaken).toBeGreaterThan(0);
        expect(m.scores[0] + m.scores[1]).toBeLessThan(2 * m.goal - 5);
      }
      finish(m);
      expect(m.ranks).toHaveLength(6);
    });
  }
});

describe("Escarmouche : glisser et se hisser", () => {
  const floor = { x0: -20, y0: -1, z0: -20, x1: 20, y1: 0, z1: 20, m: "sol" as const };
  /** Joue des pas avec la même commande ; renvoie le soldat */
  function run(world: World, s: ReturnType<typeof newSoldier>, steps: number, over: Partial<Cmd>, from = 1) {
    for (let k = 0; k < steps; k++) stepSoldier(s, idle(from + k, over), world);
    return s;
  }

  it("en pleine course, s'accroupir lance une glissade : plus vite un instant, puis on freine et on reste accroupi", () => {
    const world = new World([floor]);
    const s = newSoldier(0, 0, 15, 0, "fa");
    run(world, s, 60, { mz: 1, b: B.sprint });
    const running = Math.hypot(s.vx, s.vz);
    expect(s.sprint).toBe(true);
    run(world, s, 1, { mz: 1, b: B.sprint | B.crouch }, 100);
    expect(s.slideEnd).toBeGreaterThan(s.clock);
    expect(Math.hypot(s.vx, s.vz)).toBeGreaterThan(running * 1.1);
    expect(s.crouch).toBe(true);
    run(world, s, 70, { mz: 1, b: B.sprint | B.crouch }, 101);
    expect(s.slideEnd).toBeLessThanOrEqual(s.clock);
    expect(Math.hypot(s.vx, s.vz)).toBeLessThan(3);
    expect(s.crouch).toBe(true);
  });

  it("en marchant, s'accroupir ne fait pas glisser ; et on ne peut pas glisser deux fois de suite", () => {
    const world = new World([floor]);
    const s = newSoldier(0, 0, 15, 0, "fa");
    run(world, s, 40, { mz: 1 });
    run(world, s, 30, { mz: 1, b: B.crouch }, 100);
    expect(s.slideEnd).toBe(0);
    expect(Math.hypot(s.vx, s.vz)).toBeLessThan(3);
    // Une glissade, se relever, recourir : trop tôt pour glisser encore
    const t = newSoldier(0, 0, 15, 0, "fa");
    run(world, t, 60, { mz: 1, b: B.sprint });
    run(world, t, 1, { mz: 1, b: B.sprint | B.crouch }, 200);
    const first = t.slideEnd;
    run(world, t, 20, { mz: 1, b: B.sprint }, 201);
    run(world, t, 1, { mz: 1, b: B.sprint | B.crouch }, 300);
    expect(t.slideEnd).toBeLessThanOrEqual(first);
  });

  it("devant une caisse à hauteur de poitrine, sauter en avançant fait monter dessus", () => {
    const crate = { x0: -1, y0: 0, z0: -3, x1: 1, y1: 1.1, z1: -0.6, m: "caisse" as const };
    const world = new World([floor, crate]);
    const s = newSoldier(0, 0, -0.1, 0, "fa");
    run(world, s, 1, { mz: 1, b: B.jump });
    expect(s.mantleEnd).toBeGreaterThan(0);
    run(world, s, 60, { mz: 0 }, 2);
    expect(s.mantleEnd).toBe(0);
    expect(s.y).toBeCloseTo(1.1, 2);
    expect(s.z).toBeLessThan(-0.6);
    expect(s.ground).toBe(true);
  });

  it("un mur trop haut, ou un dessus sans place pour se tenir : on saute, sans se hisser", () => {
    const wall = { x0: -1, y0: 0, z0: -3, x1: 1, y1: 2.6, z1: -0.6, m: "pierre" as const };
    const s = newSoldier(0, 0, -0.1, 0, "fa");
    const w1 = new World([floor, wall]);
    run(w1, s, 1, { mz: 1, b: B.jump });
    expect(s.mantleEnd).toBe(0);
    run(w1, s, 90, { mz: 1 }, 2);
    expect(s.y).toBeLessThan(0.05);
    // Une caisse sous un plafond bas
    const crate = { x0: -1, y0: 0, z0: -3, x1: 1, y1: 1.1, z1: -0.6, m: "caisse" as const };
    const slab = { x0: -1, y0: 2.2, z0: -3, x1: 1, y1: 2.4, z1: -0.6, m: "beton" as const };
    const w2 = new World([floor, crate, slab]);
    const t = newSoldier(0, 0, -0.1, 0, "fa");
    run(w2, t, 1, { mz: 1, b: B.jump });
    expect(t.mantleEnd).toBe(0);
  });

  it("sans avancer, sauter devant une caisse reste un simple saut", () => {
    const crate = { x0: -1, y0: 0, z0: -3, x1: 1, y1: 1.1, z1: -0.6, m: "caisse" as const };
    const world = new World([floor, crate]);
    const s = newSoldier(0, 0, -0.1, 0, "fa");
    run(world, s, 1, { b: B.jump });
    expect(s.mantleEnd).toBe(0);
    expect(s.vy).toBeGreaterThan(0);
  });
});

describe("Escarmouche : bidons, repérage, récompenses de série", () => {
  function duo(over: Partial<EscarmoucheSettings> = {}) {
    const m = createMatch(
      settings({ mode: "solo", ...over }),
      [
        { id: "a", team: 0, bot: false, primary: "fa" },
        { id: "b", team: 1, bot: false, primary: "fa" },
      ],
      3,
    );
    live(m);
    for (const f of m.fighters) f.shieldUntil = 0;
    return m;
  }

  for (const id of MAP_IDS) {
    it(`${id} : les bidons sont posés au sol, loin des points d'apparition, sans rien chevaucher`, () => {
      const gm = getMap(id);
      const barrels = gm.boxes.filter((b) => b.m === "bidon");
      expect(barrels.length).toBeGreaterThanOrEqual(4);
      for (const b of barrels) {
        const others = gm.boxes.filter(
          (o) => o !== b && o.m !== "invisible" && o.y1 > 0.01 && o.x0 < b.x1 && o.x1 > b.x0 && o.z0 < b.z1 && o.z1 > b.z0 && o.y0 < b.y1,
        );
        expect(others, `${b.x0},${b.z0}`).toEqual([]);
        for (const sp of [...gm.spawns[0], ...gm.spawns[1], ...gm.ffa])
          expect(Math.hypot(sp.x - (b.x0 + b.x1) / 2, sp.z - (b.z0 + b.z1) / 2)).toBeGreaterThan(4);
      }
    });
  }

  it("un bidon touché explose un instant après : l'ennemi à côté est blessé, le bidon revient plus tard", () => {
    const m = duo();
    const [a, b] = m.fighters;
    const barrel = m.barrels.find((k) => Math.abs(k.x + 19.6) < 0.01 && Math.abs(k.z + 5.4) < 0.01)!;
    expect(barrel).toBeTruthy();
    Object.assign(a!.s, { x: -17, y: 0, z: -5.4, vx: 0, vz: 0 });
    Object.assign(b!.s, { x: -22.2, y: 0, z: -5.2, vx: 0, vz: 0 });
    const yaw = Math.PI / 2;
    const pitch = Math.atan2(barrel.y - eyeOf(a!.s), 2.6);
    const world = worldOf("hameau");
    const probe = world.raycast(a!.s.x, eyeOf(a!.s), a!.s.z, -Math.cos(pitch), Math.sin(pitch), 0, 10);
    expect(world.boxes[probe!.box]!.m).toBe("bidon");
    const ev: EscEvent[] = [];
    for (let k = 0; k < 40; k++) {
      worldStep(m, ev);
      applyCmd(m, 0, idle(k + 1, { yaw, pitch, b: k % 2 ? 0 : B.fire }), null, ev);
      applyCmd(m, 1, idle(k + 1), null, ev);
    }
    const boom = ev.find((e) => e.k === "boom" && e.w === "bidon");
    expect(boom).toBeTruthy();
    expect(ev.some((e) => e.k === "barrel" && !e.up)).toBe(true);
    expect(ev.some((e) => e.k === "hit" && e.v === 1 && e.a === 0)).toBe(true);
    expect(barrel.downUntil).toBeGreaterThan(m.t);
    // Plus tard, un nouveau bidon le remplace
    const back: EscEvent[] = [];
    while (m.t < barrel.downUntil + 0.1) worldStep(m, back);
    expect(back.some((e) => e.k === "barrel" && e.up)).toBe(true);
    expect(barrel.hp).toBeGreaterThan(0);
  });

  it("repérer marque l'ennemi visé, pas celui qu'un mur cache", () => {
    const m = duo({ mode: "equipes" });
    const [a, b] = m.fighters;
    Object.assign(a!.s, { x: -40, y: 0, z: 1.5 });
    Object.assign(b!.s, { x: -30, y: 0, z: 1.5 });
    const ev: EscEvent[] = [];
    applyCmd(m, 0, idle(1, { yaw: -Math.PI / 2, b: B.spot }), null, ev);
    expect(m.marks.some((k) => k.target === 1 && k.team === a!.team)).toBe(true);
    expect(ev.some((e) => e.k === "spot")).toBe(true);
    // Derrière le mur de la maison B
    const m2 = duo({ mode: "equipes" });
    Object.assign(m2.fighters[0]!.s, { x: -30, y: 0, z: 1.5 });
    Object.assign(m2.fighters[1]!.s, { x: -19, y: 0, z: -11 });
    const yaw = Math.atan2(-(-19 - -30), -(-11 - 1.5));
    applyCmd(m2, 0, idle(1, { yaw, b: B.spot }), null, []);
    expect(m2.marks).toEqual([]);
  });

  it("trois éliminations d'affilée : les jumelles repèrent tous les ennemis ; cinq : un tir de mortier tombe", () => {
    const m = createMatch(
      settings({ mode: "equipes" }),
      Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, team: i === 0 ? 0 : 1, bot: false, primary: "fa" as const })),
      5,
    );
    live(m);
    const ev: EscEvent[] = [];
    const killOnce = () => {
      for (let j = 1; j < 4; j++) {
        const f = m.fighters[j]!;
        if (f.s.alive) {
          f.shieldUntil = 0;
          hurtFor(m, j, 0, ev);
          return;
        }
      }
    };
    const hurtFor = (mm: Match, v: number, a: number, out: EscEvent[]) => {
      // Une balle à bout portant, jusqu'à ce qu'il tombe
      while (mm.fighters[v]!.s.alive) hurt(mm, v, a, 60, 1, "fa", out, 0, 1, 0);
    };
    killOnce();
    killOnce();
    killOnce();
    expect(ev.some((e) => e.k === "reward" && e.r === "jumelles")).toBe(true);
    expect(new Set(m.marks.map((k) => k.target))).toEqual(new Set([1, 2, 3]));
    // Les morts reviennent, et on continue
    while (m.fighters.some((f) => !f.s.alive)) worldStep(m, ev);
    killOnce();
    killOnce();
    expect(ev.some((e) => e.k === "reward" && e.r === "mortier")).toBe(true);
    const shells = ev.filter((e) => e.k === "shell");
    expect(shells.length).toBeGreaterThan(0);
    const later: EscEvent[] = [];
    for (let k = 0; k < 60 * 5; k++) worldStep(m, later);
    expect(later.filter((e) => e.k === "boom" && e.w === "obus").length).toBe(shells.length);
  });
});

describe("Escarmouche : une partie relue après une mise en ligne", () => {
  it("une partie d'une version d'avant (sans bidons, ni repères, ni glissade) reprend et se joue sans planter", () => {
    const m = createMatch(
      settings({ mode: "equipes" }),
      [
        { id: "a", team: 0, bot: false, primary: "fa" },
        { id: "b", team: 1, bot: true, primary: "fa" },
      ],
      9,
    );
    live(m);
    // Ce que l'ancienne version n'avait pas
    const old = JSON.parse(JSON.stringify(m)) as Record<string, unknown> & Match;
    delete (old as Partial<Match>).barrels;
    delete (old as Partial<Match>).blasts;
    delete (old as Partial<Match>).marks;
    for (const f of old.fighters) {
      delete (f as Partial<typeof f>).spotReady;
      for (const k of ["slideEnd", "slideReady", "mantleStart", "mantleEnd"]) delete (f.s as unknown as Record<string, unknown>)[k];
    }
    const up = upgradeMatch(old);
    expect(up.barrels.length).toBeGreaterThan(0);
    const ev: EscEvent[] = [];
    for (let k = 0; k < 120; k++) {
      worldStep(up, ev);
      applyCmd(up, 0, idle(k + 1, { mz: 1, b: k === 30 ? B.spot | B.jump : B.sprint }), null, ev);
    }
    expect(up.fighters[0]!.s.slideEnd).toBeTypeOf("number");
    expect(Number.isFinite(up.fighters[0]!.s.x)).toBe(true);
  });
});

describe("Escarmouche : relever un coéquipier, revenir auprès de lui", () => {
  function squad() {
    const m = createMatch(
      settings({ mode: "equipes", map: "hameau" }),
      [
        { id: "a", team: 0, bot: false, primary: "fa" },
        { id: "b", team: 0, bot: false, primary: "fa" },
        { id: "c", team: 1, bot: false, primary: "fa" },
      ],
      4,
    );
    live(m);
    for (const f of m.fighters) f.shieldUntil = 0;
    // Les deux coéquipiers au milieu de l'avenue, l'ennemi loin
    Object.assign(m.fighters[0]!.s, { x: -30, y: 0, z: 1.5, vx: 0, vz: 0 });
    Object.assign(m.fighters[1]!.s, { x: -29, y: 0, z: 1.5, vx: 0, vz: 0 });
    Object.assign(m.fighters[2]!.s, { x: 40, y: 0, z: 0, vx: 0, vz: 0 });
    return m;
  }
  const down = (m: Match, v: number, ev: EscEvent[]) => {
    while (m.fighters[v]!.s.alive) hurt(m, v, 2, 50, 1, "fa", ev, 0, 1, 0);
  };

  it("accroupi près d'un coéquipier tombé, on le relève : il repart là où il est tombé, avec un peu de vie", () => {
    const m = squad();
    const ev: EscEvent[] = [];
    down(m, 1, ev);
    for (let k = 0; k < 100; k++) {
      worldStep(m, ev);
      applyCmd(m, 0, idle(k + 1, { b: B.crouch }), null, ev);
    }
    const b = m.fighters[1]!;
    expect(b.s.alive).toBe(true);
    expect(b.hp).toBe(REVIVE.hp);
    expect(Math.hypot(b.s.x + 29, b.s.z - 1.5)).toBeLessThan(0.01);
    expect(ev.some((e) => e.k === "revive" && e.i === 0 && e.v === 1)).toBe(true);
    expect(m.fighters[0]!.stats.revives).toBe(1);
  });

  it("debout à côté, rien : il attend un moment qu'on le relève, puis revient à sa base ; ou tout de suite s'il le demande", () => {
    const m = squad();
    const ev: EscEvent[] = [];
    down(m, 1, ev);
    for (let k = 0; k < 60 * 5; k++) {
      worldStep(m, ev);
      applyCmd(m, 0, idle(k + 1), null, ev);
    }
    expect(m.fighters[1]!.s.alive).toBe(false);
    expect(waitingRescue(m, 1)).toBe(true);
    for (let k = 0; k < 60 * 4; k++) {
      worldStep(m, ev);
      applyCmd(m, 0, idle(400 + k), null, ev);
    }
    const b = m.fighters[1]!;
    expect(b.s.alive).toBe(true);
    expect(b.s.x).toBeLessThan(-34);
    expect(ev.some((e) => e.k === "revive")).toBe(false);
    // Il préfère revenir sans attendre
    const m2 = squad();
    down(m2, 1, []);
    giveUp(m2, 1);
    for (let k = 0; k < 60 * 4.2; k++) worldStep(m2, []);
    expect(m2.fighters[1]!.s.alive).toBe(true);
  });

  it("revenir auprès d'un coéquipier calme ; s'il est au combat, à la base", () => {
    const m = squad();
    chooseSpawn(m, 1, 0);
    const ev: EscEvent[] = [];
    down(m, 1, ev);
    giveUp(m, 1);
    m.fighters[0]!.lastFight = -100;
    for (let k = 0; k < 60 * 5; k++) worldStep(m, ev);
    const b = m.fighters[1]!;
    expect(b.s.alive).toBe(true);
    expect(Math.hypot(b.s.x - m.fighters[0]!.s.x, b.s.z - m.fighters[0]!.s.z)).toBeLessThan(2);
    expect(ev.some((e) => e.k === "spawn" && e.i === 1 && e.on === 0)).toBe(true);
    // Au combat : il tire, et son coéquipier revient à la base
    const m2 = squad();
    chooseSpawn(m2, 1, 0);
    const ev2: EscEvent[] = [];
    down(m2, 1, ev2);
    giveUp(m2, 1);
    for (let k = 0; k < 60 * 5; k++) {
      worldStep(m2, ev2);
      m2.fighters[0]!.lastFight = m2.t;
    }
    expect(m2.fighters[1]!.s.alive).toBe(true);
    expect(Math.hypot(m2.fighters[1]!.s.x - m2.fighters[0]!.s.x, m2.fighters[1]!.s.z - m2.fighters[0]!.s.z)).toBeGreaterThan(4);
  });

  it("en chacun pour soi, ni relève ni retour auprès d'un autre", () => {
    const m = createMatch(
      settings({ mode: "solo" }),
      [
        { id: "a", team: 0, bot: false, primary: "fa" },
        { id: "b", team: 1, bot: false, primary: "fa" },
      ],
      4,
    );
    live(m);
    chooseSpawn(m, 1, 0);
    expect(m.fighters[1]!.spawnOn).toBe(-1);
  });
});

describe("Escarmouche : les accessoires", () => {
  it("chaque accessoire change l'arme, dans un sens et dans l'autre", () => {
    const fa = WEAPONS.fa;
    expect(withAttachments(fa, "aucun", "aucun")).toBe(fa);
    const longMag = withAttachments(fa, "aucun", "chargeur");
    expect(longMag.mag).toBe(45);
    expect(longMag.reload).toBeGreaterThan(fa.reload);
    expect(longMag.move).toBeLessThan(fa.move);
    const quiet = withAttachments(fa, "silencieux", "aucun");
    expect(damageAt(quiet, 35)).toBeLessThan(damageAt(fa, 35));
    const comp = withAttachments(fa, "compensateur", "aucun");
    expect(comp.kick).toBeLessThan(fa.kick);
    expect(comp.hip).toBeGreaterThan(fa.hip);
    const grip = withAttachments(fa, "aucun", "poignee");
    expect(grip.ads).toBeLessThan(fa.ads);
    expect(grip.move).toBeLessThan(fa.move);
  });

  it("un soldat au chargeur long tire 45 balles avant de recharger ; l'arme de poing n'en a pas", () => {
    const world = new World([{ x0: -20, y0: -1, z0: -20, x1: 20, y1: 0, z1: 20, m: "sol" }]);
    const s = newSoldier(0, 0, 0, 0, "fa", 1, "pistolet", "aucun", "chargeur");
    expect(s.mag[0]).toBe(45);
    expect(s.mag[1]).toBe(WEAPONS.pistolet.mag);
    let shots = 0;
    for (let k = 0; k < 60 * 6; k++) shots += stepSoldier(s, idle(k + 1, { b: B.fire }), world).shots.length;
    expect(shots).toBeGreaterThanOrEqual(45);
  });

  it("au serveur, un silencieux fait moins mal au loin ; changer d'accessoire vaut pour la vie suivante", () => {
    const shootAt = (muzzle: "aucun" | "silencieux") => {
      const m = createMatch(
        settings({ mode: "solo", map: "hameau" }),
        [
          { id: "a", team: 0, bot: false, primary: "fa", muzzle },
          { id: "b", team: 1, bot: false, primary: "fa" },
        ],
        2,
      );
      live(m);
      for (const f of m.fighters) f.shieldUntil = 0;
      Object.assign(m.fighters[0]!.s, { x: -40, y: 0, z: 1.5 });
      Object.assign(m.fighters[1]!.s, { x: -5, y: 0, z: 1.5 });
      const ev: EscEvent[] = [];
      applyCmd(m, 0, idle(1, { yaw: -Math.PI / 2, pitch: -0.012, b: B.fire | B.ads, mz: 0 }), null, ev);
      return ev.filter((e) => e.k === "hit").reduce((a, e) => a + (e.k === "hit" ? e.d : 0), 0);
    };
    const loud = shootAt("aucun");
    const quiet = shootAt("silencieux");
    expect(loud).toBeGreaterThan(0);
    expect(quiet).toBeLessThan(loud);
    const m = createMatch(
      settings({ mode: "solo" }),
      [
        { id: "a", team: 0, bot: false, primary: "fa" },
        { id: "b", team: 1, bot: false, primary: "fa" },
      ],
      2,
    );
    live(m);
    chooseNext(m, 0, { extra: "chargeur" });
    expect(m.fighters[0]!.s.mag[0]).toBe(30);
    m.fighters[0]!.shieldUntil = 0;
    while (m.fighters[0]!.s.alive) hurt(m, 0, 1, 60, 1, "fa", [], 0, 1, 0);
    for (let k = 0; k < 60 * 5; k++) worldStep(m, []);
    expect(m.fighters[0]!.s.mag[0]).toBe(45);
  });
});

describe("Escarmouche : la conquête", () => {
  function conquest() {
    const m = createMatch(
      settings({ mode: "conquete", map: "port" }),
      [
        { id: "a", team: 0, bot: false, primary: "fa" },
        { id: "b", team: 0, bot: false, primary: "fa" },
        { id: "c", team: 1, bot: false, primary: "fa" },
      ],
      5,
    );
    live(m);
    for (const f of m.fighters) f.shieldUntil = 0;
    // Tout le monde loin des drapeaux, sur le quai
    Object.assign(m.fighters[0]!.s, { x: -12, y: 0, z: 24, vx: 0, vz: 0 });
    Object.assign(m.fighters[1]!.s, { x: -10, y: 0, z: 24, vx: 0, vz: 0 });
    Object.assign(m.fighters[2]!.s, { x: 12, y: 0, z: -24, vx: 0, vz: 0 });
    return m;
  }
  const run = (m: Match, seconds: number, ev: EscEvent[] = []) => {
    for (let k = 0; k < Math.round(seconds / DT); k++) worldStep(m, ev);
    return ev;
  };
  const put = (m: Match, i: number, k: number) => {
    const c = getMap(m.map).points[k]!;
    Object.assign(m.fighters[i]!.s, { x: c.x + 0.5 * i, y: c.y, z: c.z + 1, vx: 0, vz: 0 });
  };
  const down = (m: Match, v: number, by: number, ev: EscEvent[]) => {
    while (m.fighters[v]!.s.alive) hurt(m, v, by, 50, 1, "fa", ev, 0, 1, 0);
  };

  it("au départ : chaque équipe tient son drapeau, celui du centre est libre, les tickets sont pleins", () => {
    const m = conquest();
    expect(m.cq!.pts.map((p) => p.owner)).toEqual([0, -1, 1]);
    expect(m.goal).toBe(100);
    expect(m.scores).toEqual([m.goal, m.goal]);
  });

  it("seul près du drapeau libre, on le prend en quelques secondes ; à deux, deux fois plus vite", () => {
    const m = conquest();
    put(m, 0, 1);
    const ev = run(m, 1 / CONQUEST.speed - 0.5);
    expect(m.cq!.pts[1]!.owner).toBe(-1);
    run(m, 0.7, ev);
    expect(m.cq!.pts[1]!.owner).toBe(0);
    expect(ev.some((e) => e.k === "cq" && e.p === 1 && e.owner === 0 && e.was === -1)).toBe(true);
    expect(m.fighters[0]!.stats.captures).toBe(1);

    const m2 = conquest();
    put(m2, 0, 1);
    put(m2, 1, 1);
    run(m2, 1 / CONQUEST.speed / 2 + 0.2);
    expect(m2.cq!.pts[1]!.owner).toBe(0);
  });

  it("le drapeau adverse : il faut d'abord le neutraliser, puis le prendre ; laissé seul, il revient à qui le tenait", () => {
    const m = conquest();
    put(m, 0, 2);
    const ev = run(m, 1 / CONQUEST.speed + 0.2);
    expect(m.cq!.pts[2]!.owner).toBe(-1);
    expect(ev.some((e) => e.k === "cq" && e.p === 2 && e.owner === -1 && e.was === 1)).toBe(true);
    run(m, 1 / CONQUEST.speed + 0.2, ev);
    expect(m.cq!.pts[2]!.owner).toBe(0);

    // A, à moitié attaqué puis laissé : il revient aux rouges
    const m2 = conquest();
    put(m2, 2, 0);
    run(m2, 2);
    expect(m2.cq!.pts[0]!.v).toBeGreaterThan(-0.8);
    Object.assign(m2.fighters[2]!.s, { x: 12, y: 0, z: -24 });
    run(m2, 6);
    expect(m2.cq!.pts[0]!.v).toBe(-1);
    expect(m2.cq!.pts[0]!.owner).toBe(0);
  });

  it("à nombre égal, le drapeau ne bouge pas", () => {
    const m = conquest();
    put(m, 0, 1);
    put(m, 2, 1);
    run(m, 5);
    expect(m.cq!.pts[1]!.v).toBe(0);
    expect(m.cq!.pts[1]!.owner).toBe(-1);
  });

  it("l'équipe qui tient plus de drapeaux fait fondre les tickets de l'autre", () => {
    const m = conquest();
    m.cq!.pts[1] = { owner: 0, v: -1 };
    run(m, CONQUEST.bleed * 4 + 0.1);
    expect(m.scores[1]).toBe(m.goal - 4);
    expect(m.scores[0]).toBe(m.goal);
    // Trois contre zéro : trois fois plus vite
    m.cq!.pts[2] = { owner: 0, v: -1 };
    const before = m.scores[1];
    run(m, CONQUEST.bleed * 2 + 0.1);
    expect(before - m.scores[1]).toBe(6);
  });

  it("chaque retour au combat coûte un ticket ; un coéquipier relevé n'en coûte pas", () => {
    const m = conquest();
    const ev: EscEvent[] = [];
    down(m, 2, 0, ev);
    run(m, 6, ev);
    expect(m.fighters[2]!.s.alive).toBe(true);
    expect(m.scores[1]).toBe(m.goal - 1);

    // Relevé par son coéquipier : pas de ticket perdu
    Object.assign(m.fighters[2]!.s, { x: 12, y: 0, z: -24 });
    Object.assign(m.fighters[1]!.s, { x: -11, y: 0, z: 24 });
    down(m, 1, 2, ev);
    for (let k = 0; k < 100; k++) {
      worldStep(m, ev);
      applyCmd(m, 0, idle(k + 1, { b: B.crouch }), null, ev);
    }
    expect(m.fighters[1]!.s.alive).toBe(true);
    expect(m.scores[0]).toBe(m.goal);
  });

  it("revenir sur un drapeau de son équipe ; s'il est attaqué, retour à la base", () => {
    const m = conquest();
    const ev: EscEvent[] = [];
    chooseSpawn(m, 0, -2);
    expect(m.fighters[0]!.spawnOn).toBe(-2);
    Object.assign(m.fighters[1]!.s, { x: 40, y: 0, z: -24 });
    down(m, 0, 2, ev);
    giveUp(m, 0);
    run(m, 6, ev);
    const a = getMap("port").points[0]!;
    const f = m.fighters[0]!;
    expect(f.s.alive).toBe(true);
    expect(Math.hypot(f.s.x - a.x, f.s.z - a.z)).toBeLessThan(CONQUEST.r);
    expect(ev.some((e) => e.k === "spawn" && e.i === 0 && e.fl === 0)).toBe(true);

    // Un ennemi sur A : on revient à la base
    put(m, 2, 0);
    down(m, 0, 2, ev);
    giveUp(m, 0);
    run(m, 6, ev);
    expect(f.s.alive).toBe(true);
    expect(f.s.x).toBeLessThan(-38);

    // Un drapeau qui n'existe pas : la base
    chooseSpawn(m, 2, -9);
    expect(m.fighters[2]!.spawnOn).toBe(-1);
  });

  it("plus de tickets : la partie s'arrête, l'autre équipe gagne", () => {
    const m = conquest();
    m.scores[1] = 1;
    m.cq!.pts[1] = { owner: 0, v: -1 };
    const ev = run(m, CONQUEST.bleed + 0.2);
    expect(m.phase).toBe("over");
    expect(m.winner).toBe(0);
    expect(ev.some((e) => e.k === "over")).toBe(true);
  });

  it("ce qui voyage : les drapeaux et leur jauge ; une partie relue sans conquête reçoit cq = null", () => {
    const m = conquest();
    put(m, 0, 1);
    run(m, 1);
    const t = encodeTick(m, []);
    expect(t.cq).toHaveLength(6);
    expect(t.cq![0]).toBe(0);
    expect(t.cq![2]).toBe(-1);
    expect(t.cq![3]).toBeLessThan(0);
    const old = duelMatch("equipes") as unknown as Record<string, unknown>;
    delete old.cq;
    expect(upgradeMatch(old as unknown as Match).cq).toBeNull();
  });
});
