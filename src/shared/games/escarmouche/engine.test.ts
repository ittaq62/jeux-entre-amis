import { describe, expect, it } from "vitest";
import { botCommand, buildNav, findPath, nearestNode, newBotMemory } from "./bot.ts";
import { getMap, MAP_IDS, type MapId } from "./maps.ts";
import { applyCmd, createMatch, finish, worldOf, worldStep, type EscEvent, type Match, type Pose } from "./match.ts";
import { DEFAULT_SETTINGS, type EscarmoucheSettings, type Mode } from "./rules.ts";
import { B, copySoldier, decodeCmd, DT, encodeCmd, eyeOf, newSoldier, quantizeCmd, RADIUS, stepSoldier, type Cmd } from "./soldier.ts";
import { encodeMe, encodeTick, readFighter } from "./view.ts";
import { WEAPONS } from "./weapons.ts";

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
      for (let step = 0; step < 60 * 120 && m.phase !== "over"; step++) {
        const ev: EscEvent[] = [];
        worldStep(m, ev);
        m.fighters.forEach((_, i) => applyCmd(m, i, botCommand(m, i, mems[i]!, "fort", step * 16), null, ev));
        for (const e of ev) {
          if (e.k === "shot") shots++;
          if (e.k === "kill") kills++;
        }
        if (step === 60 * 10) moved = m.fighters.filter((f, i) => Math.hypot(f.s.x - start[i]!.x, f.s.z - start[i]!.z) > 5).length;
      }
      expect(moved).toBeGreaterThanOrEqual(4);
      expect(shots).toBeGreaterThan(20);
      expect(kills).toBeGreaterThan(2);
      if (mode === "zone") expect(m.scores[0] + m.scores[1]).toBeGreaterThan(5);
      finish(m);
      expect(m.ranks).toHaveLength(6);
    });
  }
});
