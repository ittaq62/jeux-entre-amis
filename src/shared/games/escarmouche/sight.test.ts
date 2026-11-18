import { describe, expect, it } from "vitest";
import { random } from "../../rng.ts";
import { getMap, MAP_IDS } from "./maps.ts";
import { createMatch, matchWorld, worldOf, worldStep, type EscEvent, type Match } from "./match.ts";
import { DEFAULT_SETTINGS, type Mode } from "./rules.ts";
import { Sight, SIGHT, tickFor } from "./sight.ts";
import { eyeOf } from "./soldier.ts";
import { encodeTick, PF, P_STRIDE, readFighter } from "./view.ts";
import { rayBox } from "./world.ts";

/** Trois soldats au Hameau, la partie lancée : 0 regarde, 1 est son adversaire, 2 son coéquipier (ou un autre) */
function setup(mode: Mode = "equipes") {
  const m: Match = createMatch(
    { ...DEFAULT_SETTINGS, map: "hameau", mode },
    [
      { id: "moi", team: 0, bot: false, primary: "fa" },
      { id: "lui", team: 1, bot: false, primary: "fa" },
      { id: "ami", team: 0, bot: false, primary: "fa" },
    ],
    7,
  );
  const ev: EscEvent[] = [];
  while (m.phase === "countdown") worldStep(m, ev);
  for (const f of m.fighters) Object.assign(f.s, { vx: 0, vz: 0, crouch: false, ground: true, alive: true });
  return m;
}

const place = (m: Match, i: number, x: number, z: number, more: Partial<Match["fighters"][number]["s"]> = {}) =>
  Object.assign(m.fighters[i]!.s, { x, y: 0, z, vx: 0, vz: 0, ...more });

/** Le temps passe (sans que le monde bouge) : la vue est recalculée à chaque envoi, vingt fois par seconde */
function run(m: Match, sight: Sight, seconds: number, each?: (k: number) => void, viewer = 0): number[] {
  const seen: number[] = [];
  for (let k = 0; k < Math.round(seconds * 20); k++) {
    each?.(k);
    m.t += 0.05;
    sight.hear(m, [], () => false);
    seen.push(sight.mask(m, viewer)[1]!);
  }
  return seen;
}

// Au Hameau, la maison B occupe x -22 à -12, z -14 à -6 : un adversaire derrière, au sud-est, est caché à qui est dans
// l'avenue, au nord, tant qu'il ne passe pas le coin (-12, -6)
describe("Escarmouche : ce que chacun reçoit des autres soldats", () => {
  it("un adversaire caché derrière une maison n'est pas envoyé ; à découvert, si", () => {
    const m = setup();
    const sight = new Sight();
    place(m, 0, -28, -3);
    place(m, 1, -17, -11);
    place(m, 2, -40, 10);
    expect(run(m, sight, 3).every((v) => v === 0)).toBe(true);
    const tick = tickFor(m, encodeTick(m, []), 0, sight.mask(m, 0));
    const hidden = readFighter(tick.p, 1);
    expect(hidden.bits).toBe(PF.hidden);
    expect(tick.p.slice(P_STRIDE, P_STRIDE * 2).filter((v, q) => q !== 5 && v !== 0)).toEqual([]);
    // Son coéquipier, lui, est toujours envoyé, où qu'il soit
    expect(readFighter(tick.p, 2).x).toBe(-40);
    // Dans l'avenue, à découvert : il est envoyé
    place(m, 1, -14, 1);
    expect(run(m, sight, 0.2).at(-1)).toBe(1);
  });

  it("un tir s'entend de partout ; au silencieux, seulement de près", () => {
    const m = setup("solo");
    const sight = new Sight();
    place(m, 0, -28, -3);
    place(m, 1, -17, -11);
    place(m, 2, 30, 10);
    const shot: EscEvent = { k: "shot", i: 1, w: "fa", x: -17, y: 1, z: -20, n: 1 };
    m.t += 0.05;
    sight.hear(m, [shot], () => false);
    expect(sight.mask(m, 0)[1]).toBe(1);
    expect(sight.mask(m, 2)[1]).toBe(1);
    // Il se tait : on l'oublie un peu après
    expect(run(m, sight, SIGHT.loud + SIGHT.hold + 0.2).at(-1)).toBe(0);
    // Au silencieux : celui qui est à 14 m l'entend, celui qui est à 50 m non
    m.t += 0.05;
    sight.hear(m, [shot], () => true);
    expect(sight.mask(m, 0)[1]).toBe(1);
    expect(sight.mask(m, 2)[1]).toBe(0);
  });

  it("des pas de course tout près s'entendent ; accroupi, il passe sans bruit", () => {
    const m = setup();
    const sight = new Sight();
    place(m, 0, -28, -3);
    place(m, 1, -17, -11, { vx: 5, vz: 0 });
    expect(run(m, sight, 0.1).at(-1)).toBe(1);
    const quiet = new Sight();
    place(m, 1, -17, -11, { vx: 2, vz: 0, crouch: true });
    expect(run(m, quiet, 1).every((v) => v === 0)).toBe(true);
  });

  it("repéré par son équipe, porteur d'un drapeau, ou celui qui vient de le toucher : il est envoyé", () => {
    const m = setup();
    const sight = new Sight();
    place(m, 0, -28, -3);
    place(m, 1, -17, -11);
    m.marks.push({ target: 1, team: 0, by: 2, until: m.t + 5 });
    expect(run(m, sight, 0.1).at(-1)).toBe(1);
    m.marks = [];
    expect(run(m, sight, SIGHT.hold + 0.2).at(-1)).toBe(0);
    // Le tireur qui le touche : sa victime le voit venir
    m.t += 0.05;
    sight.hear(m, [{ k: "hit", a: 1, v: 0, d: 20, p: 1, x: -28, y: 1, z: -3 }], () => false);
    expect(sight.mask(m, 0)[1]).toBe(1);
    expect(sight.mask(m, 2)[1]).toBe(0);

    const ctf = setup("drapeau");
    const s2 = new Sight();
    place(ctf, 0, -28, -3);
    place(ctf, 1, -17, -11);
    ctf.fighters[1]!.carrying = 0;
    expect(run(ctf, s2, 0.1).at(-1)).toBe(1);
  });

  it("au coin d'un mur, il ne clignote pas : il reste envoyé tant qu'il va et vient au bord du champ", () => {
    const m = setup();
    const sight = new Sight();
    const world = matchWorld(m);
    // Accroupi et à pas de loup, il va et vient au sud-est de la maison, au bord de ce que voit le joueur
    place(m, 0, -16, -3);
    const raw: boolean[] = [];
    const seen = run(m, sight, 8, (k) => {
      const x = -7.6 + Math.sin(k * 0.05 * 2.6) * 1.6;
      const vx = Math.cos(k * 0.05 * 2.6) * 1.6 * 2.6;
      place(m, 1, x, -10, { crouch: true, vx });
      const me = m.fighters[0]!.s;
      raw.push(world.sees(me.x, eyeOf(me), me.z, x, 0.75, -10));
    });
    const flips = (list: (number | boolean)[]) => list.filter((v, k) => k > 0 && Boolean(v) !== Boolean(list[k - 1])).length;
    // Le simple trait entre les yeux et le buste passe et repasse le coin ; ce qui est envoyé, non
    expect(flips(raw)).toBeGreaterThanOrEqual(4);
    expect(flips(seen.slice(seen.indexOf(1)))).toBe(0);
  });

  it("qui arrive au coin d'un mur voit l'adversaire un peu avant d'y être : il ne surgit pas d'un coup", () => {
    const m = setup();
    const sight = new Sight();
    const world = matchWorld(m);
    place(m, 1, -8, -12);
    let first = -1;
    let sees = -1;
    const speed = 4.6;
    run(m, sight, 4, (k) => {
      const x = -26 + k * 0.05 * speed;
      place(m, 0, x, -3, { vx: speed });
      if (sees < 0 && world.sees(x, 1.62, -3, -8, 1.1, -12)) sees = k;
    }).forEach((v, k) => {
      if (v && first < 0) first = k;
    });
    expect(sees).toBeGreaterThan(0);
    // Envoyé au moins 0,2 s avant que la ligne de vue toute simple existe ; mais pas de loin (pas avant 1,5 s)
    expect(first).toBeGreaterThan(0);
    expect((sees - first) * 0.05).toBeGreaterThanOrEqual(0.2);
    expect((sees - first) * 0.05).toBeLessThan(1.5);
  });

  it("ce qui dirait où est un soldat caché ne part pas : le coup qu'il prend, la balle qui s'arrête sur lui, ses munitions", () => {
    const m = setup();
    const sight = new Sight();
    place(m, 0, -28, -3);
    place(m, 1, -15.3, -11);
    place(m, 2, -15.3, -3);
    run(m, sight, 0.2);
    // Le coéquipier (2) tire sur l'adversaire caché (1) par la porte nord de la maison
    const events: EscEvent[] = [
      { k: "shot", i: 2, w: "fa", x: -15.3, y: 1.2, z: -10.8, n: 0 },
      { k: "hit", a: 2, v: 1, d: 20, p: 1, x: -15.3, y: 1.2, z: -10.8 },
      { k: "ammo", i: 1, n: 30, g: 0, from: 2 },
      { k: "ping", i: 1, x: -20, y: 0, z: -20 },
      { k: "spawn", i: 1 },
      { k: "kill", a: 2, v: 1, w: "fa", h: false, as: -1 },
    ];
    const mask = sight.mask(m, 0);
    expect(mask[1]).toBe(0);
    const out = tickFor(m, { ...encodeTick(m, []), e: events }, 0, mask);
    expect(out.e.map((e) => e.k)).toEqual(["shot", "kill"]);
    // La balle file jusqu'au mur d'après, comme s'il n'était pas là
    const shot = out.e[0] as Extract<EscEvent, { k: "shot" }>;
    expect(shot.z).toBeLessThan(-10.8 - 1);
    // Ses coéquipiers à lui reçoivent tout
    const his = tickFor(m, { ...encodeTick(m, []), e: events }, 1, sight.mask(m, 1));
    expect(his.e.map((e) => e.k)).toEqual(["shot", "hit", "ammo", "ping", "spawn", "kill"]);
  });

  it("ceux qui reviennent au combat repartent de zéro : on ne garde pas sur eux ce qu'on voyait de leur corps", () => {
    const m = setup();
    const sight = new Sight();
    place(m, 0, -28, -3);
    place(m, 1, -14, 1);
    expect(run(m, sight, 0.2).at(-1)).toBe(1);
    place(m, 1, -17, -11);
    m.t += 0.05;
    sight.hear(m, [{ k: "spawn", i: 1 }], () => false);
    expect(sight.mask(m, 0)[1]).toBe(0);
  });
});

describe("Escarmouche : la ligne de vue de case en case", () => {
  it.each(MAP_IDS)("%s : elle dit la même chose que le calcul complet sur toutes les boîtes", (map) => {
    const world = worldOf(map);
    const { x0, z0, x1, z1 } = getMap(map).bounds;
    const holder = { rng: 12345 };
    const pick = () => [x0 + random(holder) * (x1 - x0), random(holder) * 9, z0 + random(holder) * (z1 - z0)] as const;
    let differ = 0;
    let blocked = 0;
    for (let k = 0; k < 3000; k++) {
      const [ax, ay, az] = pick();
      const [bx, by, bz] = pick();
      const l = Math.hypot(bx - ax, by - ay, bz - az);
      const [dx, dy, dz] = [(bx - ax) / l, (by - ay) / l, (bz - az) / l];
      // Le calcul complet : chaque boîte visible, une à une
      const full = !world.boxes.some(
        (b) => b.m !== "invisible" && rayBox(ax, ay, az, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, l - 0.02) !== null,
      );
      if (world.sees(ax, ay, az, bx, by, bz) !== full) differ++;
      if (!full) blocked++;
    }
    expect(differ).toBe(0);
    // Les essais ne sont pas tous du même côté
    expect(blocked).toBeGreaterThan(300);
    expect(blocked).toBeLessThan(2700);
  });
});
