import { describe, expect, it } from "vitest";
import { drawItem, hazardPos, ITEM_KINDS, PETARD_MS, sweptHit, type ItemKind } from "./items.ts";
import { botDrive, newBotMemory } from "./bot.ts";
import {
  bump,
  DRIFT_LEVELS,
  DT,
  driftLevel,
  newKart,
  NO_INPUT,
  RAMP_LEN,
  SPIN_TIME,
  step,
  TOP_SPEED,
  type Input,
  type Kart,
} from "./physics.ts";
import { DEFAULT_SETTINGS, driveBots, newRace, racerOf, reportKart, standings, useItem, worldTick, type Race } from "./race.ts";
import { deltaS, getTrack, gridSlot, locate, pointAt, TRACK_IDS, TRACKS, traceCorners, wrapS } from "./track.ts";
import { bolidesView, decodeKart, encodeKart } from "./view.ts";

const GAS: Input = { steer: 0, gas: true, brake: false, drift: false };

/** Un kart posé sur la route, à la distance s du départ, décalé de d */
function kartAt(id: (typeof TRACK_IDS)[number], s: number, d = 0): Kart {
  const t = getTrack(id);
  const p = pointAt(t, s, d);
  return newKart(t, p.x, p.z, Math.atan2(p.tx, p.tz));
}

function drive(k: Kart, input: Input, seconds: number, id: (typeof TRACK_IDS)[number] = "port", top = 1) {
  const t = getTrack(id);
  const events: string[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) step(k, input, t, { top }, events as never);
  return events;
}

describe("les circuits", () => {
  it("se referment, en faisant un tour complet, avec des virages presque tous au rayon voulu", () => {
    for (const id of TRACK_IDS) {
      const tr = traceCorners(TRACKS[id]);
      expect(Math.abs(Math.abs(tr.turn) - 360), id).toBeLessThan(0.01);
      expect(tr.fit, id).toBeGreaterThan(0.7);
      // D'un point du tracé au suivant, jamais de trou (le dernier rejoint le premier)
      const pts = tr.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        expect(Math.hypot(b[0] - a[0], b[1] - a[1]), `${id} ${i}`).toBeLessThan(4.5);
      }
    }
  });

  it("ne passent jamais assez près d'eux-mêmes pour que deux murs se mêlent, et n'ont pas de virage trop serré", () => {
    for (const id of TRACK_IDS) {
      const t = getTrack(id);
      const far = Math.round(80 / (t.length / t.n));
      for (let i = 0; i < t.n; i += 2) {
        for (let j = i + far; j < t.n; j += 2) {
          if (t.n - (j - i) < far) continue;
          expect(Math.hypot(t.x[i]! - t.x[j]!, t.z[i]! - t.z[j]!), `${id} ${i} ${j}`).toBeGreaterThan(2 * t.wall + 2);
        }
      }
      let tight = 0;
      for (let i = 0; i < t.n; i++) tight = Math.max(tight, Math.abs(t.bend[i]!));
      // Des virages assez larges pour y tenir un dérapage, une route assez large pour s'y croiser
      expect(1 / tight, id).toBeGreaterThan(25);
      expect(t.half * 2, id).toBeGreaterThanOrEqual(16);
      expect(t.length, id).toBeGreaterThan(900);
      expect(t.length, id).toBeLessThan(1400);
    }
  });

  it("mettent toute la grille de départ sur une ligne droite, derrière la ligne", () => {
    for (const id of TRACK_IDS) {
      const t = getTrack(id);
      for (let place = 0; place < 8; place++) {
        const g = gridSlot(t, place);
        const at = locate(t, g.x, g.z);
        expect(deltaS(t, at.s, 0), `${id} ${place}`).toBeGreaterThan(0);
        expect(Math.abs(at.d), `${id} ${place}`).toBeLessThan(t.half - 1);
        expect(Math.abs(t.bend[at.i]!), `${id} ${place}`).toBeLessThan(0.005);
      }
    }
  });

  it("retrouvent où l'on est : distance depuis la ligne, écart au milieu", () => {
    const t = getTrack("vignes");
    for (const s of [3, 120.5, 300, t.length - 4]) {
      for (const d of [-5, 0, 4.5]) {
        const p = pointAt(t, s, d);
        const at = locate(t, p.x, p.z);
        expect(Math.abs(deltaS(t, at.s, s)), `${s} ${d}`).toBeLessThan(0.3);
        expect(at.d, `${s} ${d}`).toBeCloseTo(d, 0);
      }
    }
    expect(wrapS(t, -1)).toBeCloseTo(t.length - 1, 6);
  });

  it("posent cinq caisses par rangée sur la route, et un tremplin sur une ligne droite", () => {
    for (const id of TRACK_IDS) {
      const t = getTrack(id);
      expect(t.boxes.length, id).toBe(TRACKS[id].boxes.length * 5);
      for (const b of t.boxes) expect(Math.abs(b.d), id).toBeLessThan(t.half);
      expect(t.jumps.length, id).toBeGreaterThan(0);
      for (const lip of t.jumps) {
        // De l'élan avant la rampe jusqu'à l'atterrissage : tout droit
        for (let s = lip - 35; s < lip + 32; s += 2) {
          const at = locate(t, pointAt(t, s, 0).x, pointAt(t, s, 0).z);
          expect(Math.abs(t.bend[at.i]!), `${id} ${s}`).toBeLessThan(0.006);
        }
      }
    }
  });
});

describe("la conduite", () => {
  it("accélère jusqu'à la vitesse de pointe, et la cylindrée change cette vitesse", () => {
    const k = kartAt("port", 10);
    drive(k, GAS, 6);
    expect(k.v).toBeGreaterThan(TOP_SPEED * 0.97);
    expect(k.v).toBeLessThanOrEqual(TOP_SPEED + 1e-6);
    const fast = kartAt("port", 10);
    drive(fast, GAS, 6, "port", 1.16);
    expect(fast.v).toBeGreaterThan(k.v);
  });

  it("freine, recule, et compte la distance parcourue le long de la route", () => {
    const k = kartAt("port", 10);
    drive(k, GAS, 2);
    const dist = k.dist;
    expect(dist).toBeGreaterThan(10);
    drive(k, { ...NO_INPUT, brake: true }, 3);
    expect(k.v).toBeLessThan(0);
    expect(k.dist).toBeLessThan(dist + 25);
  });

  it("ralentit dans l'herbe, et ne passe jamais le mur", () => {
    const t = getTrack("port");
    const k = kartAt("port", 20, t.half + 3);
    drive(k, GAS, 4);
    expect(k.offroad).toBe(true);
    expect(k.v).toBeLessThan(TOP_SPEED * 0.6);
    // Droit vers le mur, à fond : il reste en deçà
    const w = kartAt("port", 20, 0);
    w.h -= Math.PI / 2;
    drive(w, GAS, 4);
    expect(Math.abs(w.d)).toBeLessThanOrEqual(t.wall + 0.05);
  });

  it("dérape en braquant avec le bouton tenu, et lâche un mini-turbo selon le temps tenu", () => {
    const k = kartAt("port", 10, 4);
    drive(k, GAS, 3);
    const events = drive(k, { steer: -0.6, gas: true, brake: false, drift: true }, (DRIFT_LEVELS[0] + 0.15) / 1.05);
    expect(events).toContain("drift");
    expect(k.drift).toBe(-1);
    expect(driftLevel(k.charge)).toBe(1);
    expect(drive(k, GAS, 0.1)).toContain("turbo1");
    expect(k.boost).toBeGreaterThan(0);
    // Tenu jusqu'au bout : le plus gros mini-turbo
    const long = kartAt("port", 10);
    drive(long, GAS, 3);
    Object.assign(long, { drift: 1, charge: DRIFT_LEVELS[2] + 0.1 });
    expect(drive(long, GAS, 0.1)).toContain("turbo3");
    expect(long.boost).toBeGreaterThan(1.2);
    expect(driftLevel(DRIFT_LEVELS[1])).toBe(2);
  });

  it("un dérapage se lance même en braquant peu, et charge plus vite en serrant le virage", () => {
    const soft = kartAt("vignes", 10);
    drive(soft, GAS, 2, "vignes");
    expect(drive(soft, { steer: 0.2, gas: true, brake: false, drift: true }, 0.2, "vignes")).toContain("drift");
    const tight = kartAt("vignes", 10);
    drive(tight, GAS, 2, "vignes");
    drive(tight, { steer: 1, gas: true, brake: false, drift: true }, 0.5, "vignes");
    const wide = kartAt("vignes", 10);
    drive(wide, GAS, 2, "vignes");
    drive(wide, { steer: 0.2, gas: true, brake: false, drift: true }, 0.5, "vignes");
    expect(tight.charge).toBeGreaterThan(wide.charge);
    // Le premier mini-turbo vient en moins d'une seconde, même sans serrer
    expect(DRIFT_LEVELS[0] / 0.9).toBeLessThan(1);
  });

  it("un tremplin fait décoller le kart, et une figure en l'air donne un turbo à l'atterrissage", () => {
    for (const id of TRACK_IDS) {
      const t = getTrack(id);
      const lip = t.jumps[0]!;
      const jump = (trick: boolean) => {
        const k = kartAt(id, lip - 30, 0);
        k.v = TOP_SPEED;
        const events: string[] = [];
        let top = 0;
        let flying = 0;
        let pressedAt = -1;
        for (let i = 0; i < 60 * 4 && !events.includes("land"); i++) {
          const press = trick && k.vy !== 0 && k.air > 0.6 && pressedAt < 0;
          if (press) pressedAt = i;
          step(k, { ...GAS, drift: press }, t, { top: 1 }, events as never);
          top = Math.max(top, k.air);
          if (k.vy !== 0) flying++;
        }
        return { k, events, top, flying: flying * DT };
      };
      const plain = jump(false);
      expect(plain.events, id).toContain("jump");
      expect(plain.events, id).toContain("land");
      expect(plain.events, id).not.toContain("trick");
      expect(plain.top, id).toBeGreaterThan(1.8);
      expect(plain.flying, id).toBeGreaterThan(0.5);
      expect(plain.flying, id).toBeLessThan(1.4);
      expect(plain.k.air, id).toBe(0);
      expect(plain.k.boost, id).toBe(0);
      const trick = jump(true);
      expect(trick.events, id).toContain("trick");
      expect(trick.k.boost, id).toBeGreaterThan(0.5);
    }
  });

  it("à côté de la rampe, on ne décolle pas ; et à reculons on en redescend", () => {
    const t = getTrack("port");
    const lip = t.jumps[0]!;
    const k = kartAt("port", lip - 50, t.half + 1.5);
    const events = drive(k, GAS, 3);
    expect(events).not.toContain("jump");
    expect(k.air).toBe(0);
    // Arrêté au milieu de la rampe, puis en marche arrière : il reste au sol
    const back = kartAt("port", lip - RAMP_LEN / 2, 0);
    drive(back, { ...NO_INPUT, brake: true }, 0.05);
    expect(back.air).toBeGreaterThan(0.3);
    drive(back, { ...NO_INPUT, brake: true }, 3);
    expect(back.air).toBe(0);
    expect(back.vy).toBe(0);
  });

  it("un accélérateur au sol donne un coup de turbo", () => {
    const t = getTrack("port");
    const pad = t.boosts[0]!;
    // Lancé juste avant (l'accélérateur est à la sortie d'un virage)
    const k = kartAt("port", pad.s - 10, pad.d);
    k.v = 22;
    let events: string[] = [];
    for (let i = 0; i < 40 && !events.includes("pad"); i++) events = drive(k, GAS, 0.1);
    expect(events).toContain("pad");
    drive(k, GAS, 0.6);
    expect(k.v).toBeGreaterThan(TOP_SPEED);
  });

  it("un tête-à-queue coupe les commandes et la vitesse", () => {
    const k = kartAt("port", 10);
    drive(k, GAS, 4);
    k.spin = SPIN_TIME;
    drive(k, GAS, 0.8);
    expect(k.v).toBeLessThan(TOP_SPEED * 0.3);
    drive(k, GAS, 2);
    expect(k.spin).toBe(0);
    expect(k.v).toBeGreaterThan(TOP_SPEED * 0.5);
  });

  it("deux karts qui se touchent s'écartent, et l'un des deux peut rester immobile", () => {
    const a = kartAt("port", 30, 0);
    const b = kartAt("port", 31, 0.3);
    const bx = b.x;
    bump(a, b, true, false);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(2.29);
    expect(b.x).toBe(bx);
  });
});

describe("les objets", () => {
  it("donnent de meilleurs objets à ceux qui sont derrière", () => {
    let rng = 1;
    const rand = () => ((rng = (rng * 16807) % 2147483647) - 1) / 2147483646;
    const count = (rank: number) => {
      const c: Partial<Record<ItemKind, number>> = {};
      for (let i = 0; i < 3000; i++) {
        const k = drawItem(rank, rand);
        c[k] = (c[k] ?? 0) + 1;
      }
      return c;
    };
    const first = count(0);
    const last = count(1);
    expect(first.turbo3 ?? 0).toBe(0);
    expect(last.turbo3 ?? 0).toBeGreaterThan(600);
    expect(last.huile ?? 0).toBe(0);
    for (const k of Object.keys({ ...first, ...last })) expect(ITEM_KINDS).toContain(k);
  });

  it("le pétard file le long de la route puis s'éteint", () => {
    const t = getTrack("col");
    const hz = { id: 1, kind: "petard" as const, s0: 100, d: 2, speed: 44, owner: "a", at: 0 };
    const p = hazardPos(t, hz, 1000)!;
    const at = locate(t, p.x, p.z);
    expect(deltaS(t, 100, at.s)).toBeCloseTo(44, 0);
    expect(at.d).toBeCloseTo(2, 0);
    expect(hazardPos(t, hz, PETARD_MS + 10)).toBeNull();
  });

  it("voit qu'un kart rapide est passé sur un objet entre deux instants", () => {
    expect(sweptHit(0, 0, 10, 0, 5, 1, 1.5)).toBe(true);
    expect(sweptHit(0, 0, 10, 0, 5, 3, 1.5)).toBe(false);
  });
});

/** Une course de bots seuls jusqu'au bout */
function botRace(settings: Partial<typeof DEFAULT_SETTINGS>, n = 6, seed = 3): { race: Race; events: string[]; now: number } {
  const ids = Array.from({ length: n }, (_, i) => `b${i}`);
  const race = newRace(ids, new Set(ids), { ...DEFAULT_SETTINGS, ...settings }, 0, seed);
  const mem = new Map();
  const events: string[] = [];
  let now = 0;
  while (race.phase !== "over" && now < 600_000) {
    now += 50;
    for (const e of [...driveBots(race, now, mem), ...worldTick(race, now)]) events.push(e.type);
  }
  return { race, events, now };
}

describe("la course", () => {
  it("part de la grille au feu vert, pas avant", () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
    const mem = new Map();
    const start = { ...racerOf(race, "b")!.kart };
    driveBots(race, race.goAt - 100, mem);
    worldTick(race, race.goAt - 100);
    expect(racerOf(race, "b")!.kart.x).toBe(start.x);
    expect(worldTick(race, race.goAt).map((e) => e.type)).toContain("go");
    for (let ms = 50; ms <= 2000; ms += 50) driveBots(race, race.goAt + ms, mem);
    expect(racerOf(race, "b")!.kart.dist).toBeGreaterThan(start.dist + 10);
  });

  it("entre bots, tout le monde finit les tours demandés, avec des objets, et le classement suit les temps", () => {
    for (const track of TRACK_IDS) {
      const { race, events } = botRace({ track, laps: 2 });
      expect(race.phase, track).toBe("over");
      expect(
        race.racers.every((r) => r.finish !== null && r.laps === 2),
        track,
      ).toBe(true);
      expect(events.filter((e) => e === "lap").length, track).toBe(12);
      expect(events, track).toContain("box");
      expect(events, track).toContain("use");
      const times = race.ranking!.map((id) => racerOf(race, id)!.finish!);
      expect(
        [...times].sort((a, b) => a - b),
        track,
      ).toEqual(times);
      expect(race.ranks![race.ranking![0]!], track).toBe(1);
      // Deux tours en moins de deux minutes et demie, plus de 40 secondes
      expect(times.at(-1)!, track).toBeLessThan(150_000);
      expect(times[0]!, track).toBeGreaterThan(40_000);
    }
  });

  it("sans objets, aucune caisse ne sert", () => {
    const { events } = botRace({ track: "vignes", laps: 1, items: false }, 4);
    expect(events).not.toContain("box");
    expect(events).not.toContain("use");
  });

  it("un bot planté face au mur recule, puis repart dans le bon sens", () => {
    const t = getTrack("col");
    const k = kartAt("col", 300, t.wall - 0.3);
    // Face au mur, à l'arrêt
    k.h += k.d > 0 ? -Math.PI / 2 : Math.PI / 2;
    const mem = newBotMemory({ rng: 5 });
    const h = { rng: 9 };
    const start = k.dist;
    let now = 0;
    for (let i = 0; i < 60 * 12; i++) {
      now += DT * 1000;
      step(k, botDrive(t, k, null, [], [], "fort", mem, now, h).input, t, { top: 1 });
    }
    expect(k.dist).toBeGreaterThan(start + 60);
    expect(Math.abs(k.d)).toBeLessThan(t.roadEdge);
  });

  it("garde ce qu'un joueur a compté chez lui (mini-turbos, murs), sans le laisser grimper d'un coup", () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
    worldTick(race, race.goAt);
    const me = racerOf(race, "a")!;
    reportKart(race, "a", { ...me.kart }, race.goAt + 100, { turbos: 1, walls: 0 });
    reportKart(race, "a", { ...me.kart }, race.goAt + 200, { turbos: 50, walls: 30 });
    expect(me.stats.turbos).toBe(3);
    expect(me.stats.walls).toBe(2);
    reportKart(race, "a", { ...me.kart }, race.goAt + 300, { turbos: 0, walls: 0 });
    expect(me.stats.turbos).toBe(3);
  });

  it("croit un joueur sur sa position, mais pas sur un bond impossible", () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
    worldTick(race, race.goAt);
    const me = racerOf(race, "a")!;
    const k = { ...me.kart, dist: me.kart.dist + 500 };
    reportKart(race, "a", k, race.goAt + 100);
    expect(me.kart.dist).toBeLessThan(10);
  });

  it("compte les tours d'un joueur et note son arrivée", () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port", laps: 2 }, 0, 1);
    const t = getTrack("port");
    worldTick(race, race.goAt);
    const me = racerOf(race, "a")!;
    let now = race.goAt;
    const events: string[] = [];
    // Il avance de 20 m tous les dixièmes de seconde le long de la route
    while (me.finish === null && now < race.goAt + 200_000) {
      now += 800;
      const s = wrapS(t, me.kart.s + 20);
      const p = pointAt(t, s, 0);
      const k = { ...me.kart, x: p.x, z: p.z, s, dist: me.kart.dist + 20 };
      for (const e of reportKart(race, "a", k, now)) events.push(e.type);
    }
    expect(events.filter((e) => e === "lap").length).toBe(2);
    expect(events).toContain("finish");
    expect(me.finish).toBe(now - race.goAt);
  });

  it("le pétard d'un joueur touche le kart de devant, le bouclier arrête un coup", () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
    worldTick(race, race.goAt);
    const a = racerOf(race, "a")!;
    const b = racerOf(race, "b")!;
    const t = getTrack("port");
    const place = (k: Kart, s: number) => {
      const p = pointAt(t, s, 0);
      Object.assign(k, { x: p.x, z: p.z, s, d: 0, h: Math.atan2(p.tx, p.tz), i: Math.round(s / (t.length / t.n)) % t.n });
    };
    place(a.kart, 20);
    place(b.kart, 50);
    a.item = "petard";
    a.uses = 1;
    const now = race.goAt + 1000;
    expect(useItem(race, "a", now).map((e) => e.type)).toEqual(["use", "hazard"]);
    let hit = false;
    for (let ms = 50; ms < 2000 && !hit; ms += 50) hit = worldTick(race, now + ms).some((e) => e.type === "hit" && e.id === "b");
    expect(hit).toBe(true);
    expect(b.kart.spin).toBeGreaterThan(0);
    expect(a.stats.hitsGiven).toBe(1);
    // Avec un bouclier, le coup suivant est arrêté
    b.kart.spin = 0;
    b.shieldUntil = now + 10_000;
    a.item = "klaxon";
    a.uses = 1;
    place(b.kart, 24);
    const ev = useItem(race, "a", now + 3000).map((e) => e.type);
    expect(ev).toContain("shield");
    expect(b.kart.spin).toBe(0);
  });
});

describe("ce que voient les joueurs", () => {
  it("un kart passe le réseau sans rien perdre d'utile", () => {
    const k = kartAt("port", 40, 1.5);
    drive(k, { steer: 0.3, gas: true, brake: false, drift: false }, 1.5);
    const back = decodeKart(encodeKart(k))!;
    expect(back.x).toBeCloseTo(k.x, 1);
    expect(back.h).toBeCloseTo(k.h, 2);
    expect(back.dist).toBeCloseTo(k.dist, 1);
    expect(decodeKart([1, 2, "x"] as never)).toBeNull();
    // La hauteur en l'air voyage aussi ; un ancien message sans elle reste lisible
    expect(decodeKart(encodeKart({ ...k, air: 2.345 }))!.air).toBeCloseTo(2.35, 2);
    expect(decodeKart(encodeKart(k).slice(0, 13))!.air).toBe(0);
  });

  it("la vue donne le classement en cours et tous les karts", () => {
    const { race } = botRace({ track: "port", laps: 1 }, 3);
    const view = bolidesView(race);
    expect(view.karts.length).toBe(3);
    expect(view.racers.map((r) => r.place).sort()).toEqual([1, 2, 3]);
    expect(standings(race)[0]!.id).toBe(race.ranking![0]);
  });
});
