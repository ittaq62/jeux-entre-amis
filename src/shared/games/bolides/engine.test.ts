import { describe, expect, it } from "vitest";
import { bounceBetween, COIN_LOSS, COIN_MAX, drawItem, hazardPos, ITEM_KINDS, PETARD_MS, sweptHit, type ItemKind } from "./items.ts";
import { botDrive, newBotMemory, type BotLevel } from "./bot.ts";
import {
  assistSteer,
  beginRescue,
  rescueSpot,
  bump,
  draftStep,
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
import {
  cupPoints,
  COUNTDOWN_MS,
  DEFAULT_SETTINGS,
  driveBots,
  holdForLoading,
  INTRO_MS,
  LOAD_MAX_MS,
  loadingOver,
  markLoaded,
  releaseStart,
  itemRank,
  newRace,
  racerOf,
  reportKart,
  standings,
  useItem,
  worldTick,
  type Race,
} from "./race.ts";
import {
  crosserAt,
  deltaS,
  DROP_FALL,
  dropAt,
  getTrack,
  gridSlot,
  locate,
  pointAt,
  rollAt,
  TRACK_IDS,
  TRACKS,
  traceCorners,
  wrapAngle,
  wrapS,
  mirrorOf,
} from "./track.ts";
import { raceTitles } from "./titles.ts";
import { bolidesView, decodeKart, encodeKart } from "./view.ts";
import { botGarage, SKIN_IDS, SKINS as KART_SKINS, VEHICLE_IDS, VEHICLES } from "./garage.ts";

const GAS: Input = { steer: 0, gas: true, brake: false, drift: false };

/** Un kart posé sur la route, à la distance s du départ, décalé de d */
function kartAt(id: (typeof TRACK_IDS)[number], s: number, d = 0): Kart {
  const t = getTrack(id);
  const p = pointAt(t, s, d);
  return newKart(t, p.x, p.z, Math.atan2(p.tx, p.tz));
}

const t0Wall = (id: (typeof TRACK_IDS)[number]) => getTrack(id).wall;

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
      const short = t.gaps.find((g) => !g.glide);
      if (!short) continue;
      const lip = short.from;
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

  it("des pièces sur la route, à l'intérieur des virages et sur les lignes droites, loin des tremplins et des passages", () => {
    for (const id of TRACK_IDS) {
      const t = getTrack(id);
      expect(t.coins.length, id).toBeGreaterThanOrEqual(25);
      for (const c of t.coins) {
        expect(Math.abs(c.d), id).toBeLessThan(t.half);
        for (const j of t.jumps) expect(Math.abs(deltaS(t, j, c.s)), id).toBeGreaterThan(20);
        for (const x of t.crossers) expect(Math.abs(deltaS(t, x.s, c.s)), id).toBeGreaterThan(10);
      }
      expect(new Set(t.coins.map((c) => c.index)).size, id).toBe(t.coins.length);
    }
  });

  it("l'engin d'un passage va et vient d'un bas-côté à l'autre, et attend entre deux traversées", () => {
    for (const id of TRACK_IDS) {
      const t = getTrack(id);
      for (const c of t.crossers) {
        let lo = Infinity;
        let hi = -Infinity;
        for (let time = 0; time < c.period; time += 0.05) {
          const p = crosserAt(c, time);
          lo = Math.min(lo, p.d);
          hi = Math.max(hi, p.d);
          // Il recommence pareil une période plus tard
          expect(crosserAt(c, time + c.period * 3).d, id).toBeCloseTo(p.d, 6);
        }
        expect(lo, id).toBeCloseTo(-c.reach, 1);
        expect(hi, id).toBeCloseTo(c.reach, 1);
        // Il attend hors de la route, entre la route et le mur
        expect(c.reach, id).toBeGreaterThan(t.roadEdge);
        expect(c.reach + 2.4, id).toBeLessThan(t.wall);
        // Le passage est sur une ligne droite
        expect(Math.abs(t.bend[locate(t, pointAt(t, c.s, 0).x, pointAt(t, c.s, 0).z).i]!), id).toBeLessThan(0.006);
      }
    }
  });

  it("foncer dans l'engin qui traverse fait rebondir et tourner le kart ; passer quand il est garé de l'autre côté, non", () => {
    const t = getTrack("port");
    const c = t.crossers[0]!;
    // Un instant où l'engin est au milieu de la route (il traverse) : à 20 % de sa période
    const mid = ((0.2 - c.offset + 10) % 1) * c.period;
    expect(Math.abs(crosserAt(c, mid).d)).toBeLessThan(1.5);
    const k = kartAt("port", c.s - 25, crosserAt(c, mid).d);
    k.v = TOP_SPEED;
    const events: string[] = [];
    for (let i = 0; i < 70; i++) step(k, GAS, t, { top: 1, time: mid }, events as never);
    expect(events).toContain("crash");
    expect(deltaS(t, c.s, k.s)).toBeLessThan(0);
    // Garé sur le bas-côté droit (de 40 à 50 % de sa période) : on passe à gauche sans rien toucher
    const parked = ((0.45 - c.offset + 10) % 1) * c.period;
    expect(crosserAt(c, parked).d).toBeGreaterThan(t.roadEdge);
    const free = kartAt("port", c.s - 25, -3);
    free.v = TOP_SPEED;
    const ev2: string[] = [];
    for (let i = 0; i < 70; i++) step(free, GAS, t, { top: 1, time: parked }, ev2 as never);
    expect(ev2).not.toContain("crash");
    expect(ev2).not.toContain("bump");
    expect(deltaS(t, c.s, free.s)).toBeGreaterThan(3);
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

describe("le garage", () => {
  it("le kart et la moto sont offerts, les autres s'achètent", () => {
    expect(VEHICLES.kart.price).toBe(0);
    expect(VEHICLES.moto.price).toBe(0);
    expect(VEHICLES.buggy.price).toBeGreaterThan(0);
    expect(KART_SKINS.usine.price).toBe(0);
    expect(KART_SKINS.flammes.price).toBeGreaterThan(0);
    const prices = VEHICLE_IDS.map((id) => VEHICLES[id].price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it("chaque véhicule a ses forces : la moto démarre plus vite, le buggy tient l'herbe, le bolide va plus vite", () => {
    const t = getTrack("port");
    const launch = (id: keyof typeof VEHICLES, seconds: number) => {
      const k = kartAt("port", 10);
      const s = VEHICLES[id].stats;
      for (let i = 0; i < seconds * 60; i++) step(k, GAS, t, { top: s.top, vehicle: s });
      return k.v;
    };
    expect(launch("moto", 1.5)).toBeGreaterThan(launch("kart", 1.5));
    expect(launch("bolide", 1.5)).toBeLessThan(launch("kart", 1.5));
    expect(launch("bolide", 7)).toBeGreaterThan(launch("kart", 7));
    const grass = (id: keyof typeof VEHICLES) => {
      const k = kartAt("port", 20, t.half + 3);
      k.v = TOP_SPEED;
      const s = VEHICLES[id].stats;
      for (let i = 0; i < 180; i++) step(k, GAS, t, { top: s.top, vehicle: s });
      return k.v;
    };
    expect(grass("buggy")).toBeGreaterThan(grass("kart") * 1.3);
    expect(grass("tondeuse")).toBeGreaterThan(grass("buggy"));
  });

  it("aucun véhicule n'écrase les autres : les tours restent dans un mouchoir sur chaque circuit", () => {
    for (const id of TRACK_IDS) {
      const t = getTrack(id);
      const times = VEHICLE_IDS.map((v) => {
        const g = gridSlot(t, 0);
        const k = newKart(t, g.x, g.z, g.h);
        const mem = newBotMemory({ rng: 3 });
        const h = { rng: 8 };
        const s = VEHICLES[v].stats;
        let now = 0;
        while (k.dist < t.length * 2 && now < 300_000) {
          now += DT * 1000;
          step(k, botDrive(t, k, null, [], [], "fort", mem, now, h).input, t, { top: s.top, vehicle: s });
        }
        return now / 1000;
      });
      const best = Math.min(...times);
      const worst = Math.max(...times);
      expect(worst / best, `${id} : ${times.map((x) => x.toFixed(1)).join(" ")}`).toBeLessThan(1.09);
    }
  });

  it("dans un choc, le plus lourd bouge moins que le plus léger", () => {
    const a = kartAt("port", 30, 0);
    const b = kartAt("port", 31, 0.3);
    const ax = a.x;
    const az = a.z;
    const bx = b.x;
    const bz = b.z;
    bump(a, b, true, true, VEHICLES.monstre.stats.weight, VEHICLES.moto.stats.weight);
    expect(Math.hypot(b.x - bx, b.z - bz)).toBeGreaterThan(Math.hypot(a.x - ax, a.z - az) * 2);
  });

  it("les bots prennent des véhicules et des skins variés, toujours valides", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const g = botGarage(`Pilote ${i}-ABCD`);
      expect(VEHICLE_IDS).toContain(g.vehicle);
      expect(SKIN_IDS).toContain(g.skin);
      seen.add(g.vehicle);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
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
    expect(first.fusee ?? 0).toBe(0);
    expect(first.arc ?? 0).toBe(0);
    expect(last.fusee ?? 0).toBeGreaterThan(150);
    expect(last.arc ?? 0).toBeGreaterThan(150);
    expect(last.turbo3 ?? 0).toBeGreaterThan(400);
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

  it("celui qui pose une flaque d'huile en roulant vite ne glisse pas dessus", () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
    const t = getTrack("port");
    worldTick(race, race.goAt);
    const a = racerOf(race, "a")!;
    const at = (s: number) => {
      const p = pointAt(t, s, 0);
      Object.assign(a.kart, { x: p.x, z: p.z, s, d: 0, h: Math.atan2(p.tx, p.tz), v: 35 });
    };
    // Il file à 35 m/s : à chaque instant du serveur (50 ms), il avance de 1,75 m
    at(98.25);
    worldTick(race, race.goAt + 950);
    at(100);
    a.item = "huile";
    a.uses = 1;
    let now = race.goAt + 1000;
    useItem(race, "a", now);
    const hits: string[] = [];
    for (let k = 1; k <= 20; k++) {
      now += 50;
      at(100 + k * 1.75);
      for (const e of worldTick(race, now)) if (e.type === "hit") hits.push(e.id);
    }
    expect(hits).toEqual([]);
    expect(race.hazards.some((h) => h.kind === "huile")).toBe(true);
  });

  it("ramasse les pièces (dix au plus), en perd trois quand il est touché, et elles reviennent", () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "vignes", items: false }, 0, 1);
    const t = getTrack("vignes");
    worldTick(race, race.goAt);
    const a = racerOf(race, "a")!;
    let now = race.goAt + 100;
    // On le pose sur chaque pièce, l'une après l'autre
    for (const c of t.coins.slice(0, 14)) {
      now += 100;
      const k = { ...a.kart, x: c.x, z: c.z, s: c.s, d: c.d, dist: a.kart.dist };
      reportKart(race, "a", k, now);
    }
    expect(a.coins).toBe(COIN_MAX);
    expect(race.coins.filter((at) => at > now).length).toBeGreaterThanOrEqual(14);
    // Touché par un pétard : trois de moins
    a.item = null;
    const b = racerOf(race, "b")!;
    b.item = "klaxon";
    b.uses = 1;
    Object.assign(b.kart, { x: a.kart.x + 2, z: a.kart.z });
    useItem(race, "b", now);
    expect(a.coins).toBe(COIN_MAX - COIN_LOSS);
    // Plus tard, les pièces sont revenues
    worldTick(race, now + 9000);
    expect(race.coins.every((at) => at <= now + 9000)).toBe(true);
  });

  describe("les nouveaux bonus", () => {
    const setup = () => {
      const race = newRace(["a", "b", "c"], new Set(["b", "c"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
      worldTick(race, race.goAt);
      const t = getTrack("port");
      const put = (k: Kart, s: number, d = 0) => {
        const p = pointAt(t, s, d);
        Object.assign(k, { x: p.x, z: p.z, s, d, dist: s, h: Math.atan2(p.tx, p.tz), spin: 0 });
      };
      return { race, t, put, a: racerOf(race, "a")!, b: racerOf(race, "b")!, c: racerOf(race, "c")!, now: race.goAt + 1000 };
    };
    const run = (race: Race, from: number, ms: number) => {
      const out: string[] = [];
      for (let m = 50; m <= ms; m += 50) {
        for (const e of worldTick(race, from + m))
          out.push(e.type === "hit" ? `hit:${e.id}:${e.kind}` : e.type === "pie" ? `pie:${e.id}` : e.type);
      }
      return out;
    };

    it("la boule de bowling renverse tous ceux qu'elle croise, sans s'arrêter, et une seule fois chacun", () => {
      const { race, put, a, b, c, now } = setup();
      put(a.kart, 40);
      a.item = "bowling";
      a.uses = 1;
      useItem(race, "a", now);
      const hz = race.hazards.find((h) => h.kind === "bowling")!;
      // Là où passera la boule au moment où elle y sera
      const at = (ms: number) => hazardPos(getTrack("port"), hz, now + ms)!;
      for (const [r, ms] of [
        [b, 1000],
        [c, 2000],
      ] as const) {
        const p = at(ms);
        Object.assign(r.kart, { x: p.x, z: p.z, s: 0, dist: 500 });
      }
      const log = run(race, now, 3000);
      expect(log.filter((l) => l === "hit:b:bowling").length).toBe(1);
      expect(log.filter((l) => l === "hit:c:bowling").length).toBe(1);
      expect(race.hazards.length).toBe(1);
      expect(run(race, now + 3000, 2600)).toContain("gone");
      expect(race.hazards.length).toBe(0);
    });

    it("la boule rebondit d'un bord à l'autre sans jamais quitter la route", () => {
      for (let v = -50; v < 50; v += 0.37) expect(Math.abs(bounceBetween(v, 7.7))).toBeLessThanOrEqual(7.7 + 1e-9);
      expect(bounceBetween(0, 5)).toBeCloseTo(0, 6);
      expect(bounceBetween(5, 5)).toBeCloseTo(5, 6);
      expect(bounceBetween(7, 5)).toBeCloseTo(3, 6);
    });

    it("la tarte va au kart le plus proche devant, et lui met de la crème plein l'écran", () => {
      const { race, put, a, b, c, now } = setup();
      put(a.kart, 100);
      put(b.kart, 130);
      put(c.kart, 170);
      a.item = "tarte";
      a.uses = 1;
      useItem(race, "a", now);
      expect(race.hazards[0]!.kind === "tarte" && race.hazards[0]!.target).toBe("b");
      b.kart.v = 20;
      expect(run(race, now, 1500)).toContain("pie:b");
      expect(b.pieUntil).toBeGreaterThan(now);
      expect(b.kart.v).toBeLessThan(20);
      expect(c.pieUntil).toBe(0);
      expect(race.hazards.length).toBe(0);
    });

    it("sans personne devant, la tarte part vers celui de derrière", () => {
      const { race, put, a, b, c, now } = setup();
      put(a.kart, 300);
      put(b.kart, 260);
      put(c.kart, 100);
      a.item = "tarte";
      a.uses = 1;
      useItem(race, "a", now);
      expect(race.hazards[0]!.kind === "tarte" && race.hazards[0]!.target).toBe("b");
      expect(run(race, now, 1500)).toContain("pie:b");
    });

    it("le ressort fait décoller, et on repart du sol", () => {
      const t = getTrack("port");
      const k = kartAt("port", 100);
      k.v = 20;
      k.vy = 12;
      k.air = 0.05;
      const ev: string[] = [];
      let top = 0;
      for (let i = 0; i < 150; i++) {
        step(k, GAS, t, { top: 1 }, ev as never);
        top = Math.max(top, k.air);
      }
      expect(top).toBeGreaterThan(2.5);
      expect(ev).toContain("land");
      expect(k.air).toBe(0);
    });

    it("la potion géante écrase ceux qu'elle touche et rend intouchable", () => {
      const { race, put, a, b, c, now } = setup();
      put(a.kart, 200);
      put(b.kart, 202, 1);
      put(c.kart, 400);
      a.item = "geant";
      a.uses = 1;
      useItem(race, "a", now);
      expect(a.giantUntil).toBeGreaterThan(now);
      const log = run(race, now, 100);
      expect(log).toContain("hit:b:geant");
      expect(log).not.toContain("hit:c:geant");
      // Un klaxon de b ne lui fait rien
      Object.assign(b.kart, { spin: 0 });
      b.item = "klaxon";
      b.uses = 1;
      useItem(race, "b", now + 200);
      expect(a.kart.spin).toBe(0);
    });

    it("l'orage frappe tous ceux qui sont devant, pas ceux de derrière", () => {
      const { race, put, a, b, c, now } = setup();
      put(a.kart, 300);
      put(b.kart, 500);
      put(c.kart, 100);
      a.item = "orage";
      a.uses = 1;
      const log = useItem(race, "a", now).map((e) => (e.type === "hit" ? `hit:${e.id}` : e.type));
      expect(log).toContain("hit:b");
      expect(log).not.toContain("hit:c");
      expect(log).toContain("bolt");
      expect(b.kart.spin).toBeGreaterThan(0);
      expect(c.kart.spin).toBe(0);
    });

    it("l'aimant attire les pièces de loin et en vole à ceux qu'on frôle", () => {
      const { race, t, put, a, b, now } = setup();
      const coin = t.coins[0]!;
      put(a.kart, coin.s, coin.d + 6.5);
      a.item = "aimant";
      a.uses = 1;
      useItem(race, "a", now);
      expect(a.magnetUntil).toBeGreaterThan(now);
      reportKart(race, "a", { ...a.kart }, now + 50);
      expect(a.coins).toBeGreaterThanOrEqual(1);
      const before = a.coins;
      b.coins = 5;
      Object.assign(b.kart, { x: a.kart.x + 3, z: a.kart.z });
      run(race, now + 50, 1200);
      expect(b.coins).toBeLessThan(5);
      expect(a.coins).toBeGreaterThan(before);
    });

    it("la bombe retombe devant et explose : tout ce qui est autour part en tête-à-queue", () => {
      const { race, put, a, b, c, now } = setup();
      put(a.kart, 100);
      a.item = "bombe";
      a.uses = 1;
      useItem(race, "a", now);
      const hz = race.hazards.find((h) => h.kind === "bombe")!;
      expect(hz.kind === "bombe" && Math.abs(hz.s - 132)).toBeLessThan(1);
      put(b.kart, 134);
      put(c.kart, 200);
      const log = run(race, now, 2500);
      expect(log).toContain("blast");
      expect(log).toContain("hit:b:bombe");
      expect(log).not.toContain("hit:c:bombe");
      expect(race.hazards.length).toBe(0);
    });
  });

  it("la fusée file au-dessus de tout le monde et va frapper le premier ; le bouclier l'arrête", () => {
    const race = newRace(["a", "b", "c"], new Set(["b", "c"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
    worldTick(race, race.goAt);
    const t = getTrack("port");
    const a = racerOf(race, "a")!;
    const b = racerOf(race, "b")!;
    const c = racerOf(race, "c")!;
    const put = (k: Kart, s: number, d = 0) => {
      const p = pointAt(t, s, d);
      Object.assign(k, { x: p.x, z: p.z, s, d, dist: s, h: Math.atan2(p.tx, p.tz) });
    };
    // a derrière, c au milieu (sur la route de la fusée), b loin devant
    put(a.kart, 50);
    put(c.kart, 120);
    put(b.kart, 400);
    a.item = "fusee";
    a.uses = 1;
    const now = race.goAt + 1000;
    expect(useItem(race, "a", now).map((e) => e.type)).toEqual(["use", "hazard"]);
    const hz = race.hazards.find((h) => h.kind === "fusee")!;
    expect(hz.kind === "fusee" && hz.target).toBe("b");
    const hits: string[] = [];
    for (let ms = 50; ms < 9000; ms += 50) for (const e of worldTick(race, now + ms)) if (e.type === "hit") hits.push(`${e.id}:${e.kind}`);
    expect(hits).toEqual(["b:fusee"]);
    expect(b.kart.spin).toBeGreaterThan(0);
    expect(c.kart.spin).toBe(0);
    // Une deuxième, sur un premier protégé : rien
    b.kart.spin = 0;
    b.shieldUntil = now + 60_000;
    a.item = "fusee";
    a.uses = 1;
    useItem(race, "a", now + 10_000);
    const later: string[] = [];
    for (let ms = 50; ms < 9000; ms += 50) for (const e of worldTick(race, now + 10_000 + ms)) later.push(e.type);
    expect(later).toContain("shield");
    expect(b.kart.spin).toBe(0);
  });

  it("sous l'arc-en-ciel : intouchable, l'herbe ne freine pas, et ceux qu'on touche partent en tête-à-queue", () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
    worldTick(race, race.goAt);
    const a = racerOf(race, "a")!;
    const b = racerOf(race, "b")!;
    a.item = "arc";
    a.uses = 1;
    const now = race.goAt + 1000;
    useItem(race, "a", now);
    expect(a.starUntil).toBeGreaterThan(now);
    // Un klaxon de b à côté ne lui fait rien
    Object.assign(b.kart, { x: a.kart.x + 6, z: a.kart.z });
    b.item = "klaxon";
    b.uses = 1;
    useItem(race, "b", now + 100);
    expect(a.kart.spin).toBe(0);
    // Il fonce dans b : b part en tête-à-queue
    Object.assign(b.kart, { x: a.kart.x + 1.5, z: a.kart.z, spin: 0 });
    const ev = worldTick(race, now + 200);
    expect(ev.some((e) => e.type === "hit" && e.id === "b" && e.kind === "arc")).toBe(true);
    // Dans l'herbe, il garde sa vitesse
    const t = getTrack("port");
    const k = kartAt("port", 20, t.half + 3);
    k.v = TOP_SPEED;
    drive(k, GAS, 0.1);
    const grassy = { ...k };
    for (let i = 0; i < 60; i++) step(grassy, GAS, t, { top: 1 });
    for (let i = 0; i < 60; i++) step(k, GAS, t, { top: 1, star: true });
    expect(k.offroad).toBe(true);
    expect(k.v).toBeGreaterThan(TOP_SPEED * 0.95);
    expect(grassy.v).toBeLessThan(TOP_SPEED * 0.8);
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

describe("la vie du circuit", () => {
  const runFor = (k: Kart, t: ReturnType<typeof getTrack>, seconds: number, time: number, ev: string[] = [], input = GAS) => {
    for (let i = 0; i < seconds * 60; i++) step(k, input, t, { top: 1, time: time + i / 60 }, ev as never);
  };

  it.each(TRACK_IDS)("%s : le tremplin fait franchir le trou, même en arrivant doucement", (id) => {
    const t = getTrack(id);
    const gap = t.gaps[0]!;
    for (const speed of [8, 15, 27]) {
      const k = kartAt(id, gap.from - 14);
      k.v = speed;
      const ev: string[] = [];
      let seen = false;
      for (let i = 0; i < 480 && !seen; i++) {
        step(k, GAS, t, { top: 1 }, ev as never);
        seen = ev.includes("land");
      }
      expect(ev, `à ${speed} m/s`).toContain(gap.glide ? "glide" : "jump");
      expect(ev, `à ${speed} m/s`).toContain("land");
      expect(ev, `à ${speed} m/s`).not.toContain("fall");
      expect(deltaS(t, gap.to, k.s)).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(TRACK_IDS)("%s : à côté du tremplin, on tombe ; on repart de l'autre rive, sans tricher sur la distance", (id) => {
    const t = getTrack(id);
    const gap = t.gaps[0]!;
    const side = t.half + 3;
    const k = kartAt(id, gap.from - 2, side);
    k.v = 20;
    const before = k.dist;
    const ev: string[] = [];
    let i = 0;
    for (; i < 60 && !ev.includes("fall"); i++) step(k, GAS, t, { top: 1 }, ev as never);
    expect(ev).toContain("fall");
    expect(k.fall).toBeGreaterThan(0);
    // Plus de commandes pendant la chute, et on descend
    const x = k.x;
    for (let n = 0; n < 40; n++) step(k, { steer: 1, gas: true, brake: false, drift: true }, t, { top: 1 }, ev as never);
    expect(k.x).toBe(x);
    expect(k.air).toBeLessThan(-1);
    for (let n = 0; n < 160 && !ev.includes("respawn"); n++) step(k, GAS, t, { top: 1 }, ev as never);
    expect(ev).toContain("rescue");
    expect(ev).toContain("respawn");
    expect(k.fall).toBe(0);
    expect(Math.abs(k.d)).toBeLessThan(0.5);
    expect(deltaS(t, gap.to, k.s)).toBeGreaterThan(0);
    expect(k.dist - before).toBeGreaterThan(gap.to - gap.from);
    expect(k.dist - before).toBeLessThan(gap.to - gap.from + 16);
    // Reposé sur la route par le drone, il repart
    for (let n = 0; n < 60; n++) step(k, GAS, t, { top: 1 }, ev as never);
    expect(k.air).toBe(0);
    expect(k.rescue).toBe(0);
    expect(k.v).toBeGreaterThan(10);
    expect(k.fall).toBe(0);
  });

  it("une chute se voit chez les autres, et un kart qui tombe ne cogne personne", () => {
    const k = kartAt("port", 100);
    k.fall = 0.5;
    k.air = -3;
    const out = decodeKart(encodeKart(k))!;
    expect(out.air).toBeCloseTo(-3, 1);
    expect(out.fall).toBeGreaterThan(0);
    const other = { ...k, fall: 0, air: 0, x: k.x + 0.5 };
    expect(bump(k, other, true, true)).toBe(0);
  });

  const drop = (t: ReturnType<typeof getTrack>) =>
    t.movers.find((m) => m.kind === "drop") as Extract<(typeof t.movers)[number], { kind: "drop" }>;

  it("la grue prévient, lâche son conteneur, et il bloque vraiment la voie tant qu'il est là", () => {
    const t = getTrack("port");
    const m = drop(t);
    // On cherche un moment où il vient d'atterrir
    let land = 0;
    for (let time = 0; time < 40; time += 0.01) {
      if (dropAt(m, t.half, time).phase === "stay") {
        land = time;
        break;
      }
    }
    expect(dropAt(m, t.half, land - DROP_FALL - 0.2).phase).toBe("warn");
    expect(dropAt(m, t.half, land - DROP_FALL - 0.2).solid).toBe(false);
    expect(dropAt(m, t.half, land + 0.5).solid).toBe(true);
    const st = dropAt(m, t.half, land + 0.5);
    expect(Math.abs(st.d)).toBeLessThan(t.half);
    const k = kartAt("port", m.s - 22, st.d);
    k.v = 25;
    const ev: string[] = [];
    runFor(k, t, 1.6, land + 0.5, ev);
    expect(ev).toContain("crash");
    expect(deltaS(t, m.s, k.s)).toBeLessThan(0);
    // Dans la voie d'à côté, on passe
    const free = kartAt("port", m.s - 22, st.d + (st.d > 0 ? -6 : 6));
    free.v = 25;
    const ok: string[] = [];
    runFor(free, t, 1.6, land + 0.5, ok);
    expect(ok).not.toContain("crash");
    expect(deltaS(t, m.s, free.s)).toBeGreaterThan(5);
  });

  it("quand le conteneur n'est pas là, la route est libre, et le chariot change bien de voie", () => {
    const t = getTrack("port");
    const m = drop(t);
    const lanes = new Set<number>();
    let up = 0;
    for (let time = 0; time < 200; time += m.period) {
      lanes.add(Math.round(dropAt(m, t.half, time).d * 10));
    }
    expect(lanes.size).toBeGreaterThanOrEqual(2);
    for (let time = 0; time < 40 && !up; time += 0.05) if (dropAt(m, t.half, time).phase === "none") up = time;
    const k = kartAt("port", m.s - 8, dropAt(m, t.half, up).d);
    k.v = 25;
    const ev: string[] = [];
    runFor(k, t, 0.5, up, ev);
    expect(ev).not.toContain("crash");
    expect(ev).not.toContain("bump");
  });

  it.each(["vignes", "col"] as const)("%s : ce qui traverse renverse celui qui le croise, et passe au large sinon", (id) => {
    const t = getTrack(id);
    const m = t.movers.find((x) => x.kind === "roll") as Extract<(typeof t.movers)[number], { kind: "roll" }>;
    // Le moment où le premier objet est au milieu de la route
    let at = 0;
    for (let time = 0; time < 30; time += 0.01) {
      const d = rollAt(m, 0, time);
      if (d !== null && Math.abs(d) < 0.2) {
        at = time;
        break;
      }
    }
    const k = kartAt(id, m.s - 18, 0);
    k.v = 26;
    const ev: string[] = [];
    runFor(k, t, 1.3, at - 18 / 26, ev);
    expect(ev.includes("crash") || ev.includes("bump")).toBe(true);
    // Il n'est sur la route qu'une partie du temps
    let off = 0;
    for (let time = 0; time < m.period; time += 0.02) if (rollAt(m, 0, time) === null) off++;
    expect(off).toBeGreaterThan(0);
  });

  it("les moutons marchent en file et laissent passer entre eux", () => {
    const t = getTrack("vignes");
    const m = t.movers.find((x) => x.kind === "roll" && x.thing === "mouton") as Extract<(typeof t.movers)[number], { kind: "roll" }>;
    let at = 0;
    for (let time = 0; time < 40; time += 0.01) {
      const d = rollAt(m, 2, time);
      if (d !== null && Math.abs(d) < 0.2) {
        at = time;
        break;
      }
    }
    const ds = [0, 1, 2, 3, 4].map((i) => rollAt(m, i, at)).filter((d): d is number => d !== null);
    expect(ds.length).toBeGreaterThanOrEqual(3);
    ds.sort((a, b) => a - b);
    for (let i = 1; i < ds.length; i++) expect(ds[i]! - ds[i - 1]!).toBeGreaterThan(m.radius * 2);
  });

  it("le trampoline fait sauter, on peut y faire une figure, et il ne se déclenche qu'en passant dessus", () => {
    const t = getTrack("port");
    const sp = t.springs[0]!;
    const k = kartAt("port", sp.s - 6, sp.d);
    k.v = 25;
    const ev: string[] = [];
    let top = 0;
    for (let i = 0; i < 120; i++) {
      step(k, { ...GAS, drift: i > 30 && i < 36 }, t, { top: 1 }, ev as never);
      top = Math.max(top, k.air);
    }
    expect(ev).toContain("spring");
    expect(top).toBeGreaterThan(1.5);
    expect(ev).toContain("trick");
    expect(ev).toContain("land");
    const beside = kartAt("port", sp.s - 6, sp.d + 5);
    beside.v = 25;
    const none: string[] = [];
    for (let i = 0; i < 60; i++) step(beside, GAS, t, { top: 1 }, none as never);
    expect(none).not.toContain("spring");
  });

  it("la boue freine (sauf sous l'arc-en-ciel), le verglas fait glisser et charge plus vite", () => {
    const t = getTrack("vignes");
    const z = t.zones[0]!;
    const mid = (z.d1 + z.d2) / 2;
    const k = kartAt("vignes", z.s + 1, mid);
    k.v = 27;
    for (let i = 0; i < 50; i++) {
      step(k, GAS, t, { top: 1 }, undefined);
      k.d = mid;
    }
    expect(k.v).toBeLessThan(27 * 0.9);
    const free = kartAt("vignes", z.s + 1, mid);
    free.v = 27;
    for (let i = 0; i < 50; i++) step(free, GAS, t, { top: 1, star: true }, undefined);
    expect(free.v).toBeGreaterThan(26);

    const col = getTrack("col");
    const ice = col.zones[0]!;
    const steerRight: Input = { steer: 1, gas: true, brake: false, drift: false };
    const drive = (s: number) => {
      const c = kartAt("col", s, 0);
      c.v = 20;
      for (let i = 0; i < 20; i++) step(c, steerRight, col, { top: 1 }, undefined);
      return Math.abs(c.slip);
    };
    // Hors du verglas, l'adhérence ramène vite le glissement à sa valeur ; dessus, il part bien moins vite
    const onIce = drive(ice.s + ice.len / 2);
    const onRoad = drive(col.boxes[0]!.s);
    expect(onIce).toBeLessThan(onRoad);
  });

  it.each(TRACK_IDS)("%s : une flaque ou une bombe lâchée au-dessus du trou atterrit sur l'autre rive", (id) => {
    const t = getTrack(id);
    const gap = t.gaps[0]!;
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: id }, 0, 1);
    worldTick(race, race.goAt);
    const a = racerOf(race, "a")!;
    const inGap = (s: number) => {
      const along = deltaS(t, gap.from, s);
      return along >= 0 && along <= gap.to - gap.from;
    };
    const flying = (s: number) => {
      const p = pointAt(t, s, 0);
      Object.assign(a.kart, {
        x: p.x,
        z: p.z,
        s,
        d: 0,
        h: Math.atan2(p.tx, p.tz),
        air: 2,
        vy: 1,
        i: Math.round(s / (t.length / t.n)) % t.n,
      });
    };
    flying(gap.from + 8);
    a.item = "huile";
    a.uses = 1;
    useItem(race, "a", race.goAt + 100);
    const oil = race.hazards.find((h) => h.kind === "huile");
    expect(oil && "s" in oil && !inGap(oil.s)).toBe(true);
    flying(wrapS(t, gap.from - 26));
    a.item = "bombe";
    a.uses = 1;
    useItem(race, "a", race.goAt + 200);
    const bomb = race.hazards.find((h) => h.kind === "bombe");
    expect(bomb && "s" in bomb && !inGap(bomb.s)).toBe(true);
  });

  it.each(TRACK_IDS)("%s : les pièces ne sont ni dans le trou, ni sous la grue, ni sur un trampoline", (id) => {
    const t = getTrack(id);
    for (const c of t.coins) {
      for (const g of t.gaps) {
        const along = deltaS(t, g.from, c.s);
        expect(along < -6 || along > g.to - g.from + 6).toBe(true);
      }
      for (const m of t.movers) expect(Math.abs(deltaS(t, m.s, c.s))).toBeGreaterThanOrEqual(12);
      for (const p of t.springs) expect(Math.abs(deltaS(t, p.s, c.s))).toBeGreaterThanOrEqual(6);
    }
  });
});

describe("le vol et l'eau", () => {
  const flyFrom = (id: (typeof TRACK_IDS)[number], speed: number, input: Input = GAS) => {
    const t = getTrack(id);
    const g = t.gaps.find((x) => x.glide)!;
    const k = kartAt(id, g.from - 14);
    k.v = speed;
    const ev: string[] = [];
    let top = 0;
    for (let i = 0; i < 60 * 12 && !ev.includes("land"); i++) {
      step(k, input, t, { top: 1 }, ev as never);
      top = Math.max(top, k.air);
    }
    return { t, g, k, ev, top };
  };

  describe("le saut chargé", () => {
    const run = (input: (i: number) => Input, frames: number, id: (typeof TRACK_IDS)[number] = "port", s = 20) => {
      const t = getTrack(id);
      const k = kartAt(id, s);
      k.v = 25;
      const ev: string[] = [];
      let top = 0;
      for (let i = 0; i < frames; i++) {
        step(k, input(i), t, { top: 1 }, ev as never);
        top = Math.max(top, k.air);
      }
      return { k, ev, top };
    };

    it("tenir le bouton sans braquer, puis lâcher : le kart bondit assez haut pour passer un obstacle", () => {
      const { ev, top } = run((i) => ({ ...GAS, drift: i < 40 }), 90);
      expect(ev).toContain("bound");
      expect(ev).toContain("land");
      expect(top).toBeGreaterThan(1);
    });

    it("un appui trop court ne fait pas bondir", () => {
      const { ev } = run((i) => ({ ...GAS, drift: i < 12 }), 60);
      expect(ev).not.toContain("bound");
    });

    it("braquer pendant la charge : c'est un dérapage, pas un saut", () => {
      const { ev, k } = run((i) => ({ ...GAS, steer: i > 10 ? 0.8 : 0, drift: i < 50 }), 60);
      expect(ev).toContain("drift");
      expect(ev).not.toContain("bound");
      expect(k.jumpCharge).toBe(0);
    });

    it("pas de figure sur un saut chargé (sinon on aurait un turbo gratuit à l'infini)", () => {
      const { ev, k } = run((i) => ({ ...GAS, drift: i < 40 || i === 50 }), 110);
      expect(ev).toContain("bound");
      expect(ev).not.toContain("trick");
      expect(k.boost).toBe(0);
    });
  });

  it.each(["col", "dunes", "lagon", "volcan"] as const)(
    "%s : le deltaplane s'ouvre et franchit le vide, même en arrivant doucement",
    (id) => {
      for (const speed of [8, 16, 27]) {
        const { t, g, k, ev, top } = flyFrom(id, speed);
        expect(ev, `à ${speed} m/s`).toContain("glide");
        expect(ev, `à ${speed} m/s`).not.toContain("fall");
        expect(ev, `à ${speed} m/s`).toContain("land");
        expect(deltaS(t, g.to, k.s), `à ${speed} m/s`).toBeGreaterThan(0);
        expect(top).toBeGreaterThan(4);
        expect(k.glide).toBe(false);
      }
    },
  );

  it("le frein fait plonger : on se pose bien plus tôt", () => {
    const free = flyFrom("dunes", 27);
    const dive = flyFrom("dunes", 27, { ...GAS, brake: true });
    expect(deltaS(free.t, dive.k.s, free.k.s)).toBeGreaterThan(20);
  });

  it("on peut tourner en vol, nettement plus qu'en saut", () => {
    const t = getTrack("dunes");
    const g = t.gaps.find((x) => x.glide)!;
    const k = kartAt("dunes", g.from + 5, 0);
    Object.assign(k, { v: 27, air: 4, vy: 1, glide: true });
    const h0 = k.h;
    for (let i = 0; i < 30; i++) step(k, { ...GAS, steer: 1 }, t, { top: 1 });
    const glide = Math.abs(wrapAngle(k.h - h0));
    const j = kartAt("dunes", g.from + 5, 0);
    Object.assign(j, { v: 27, air: 4, vy: 1, glide: false });
    for (let i = 0; i < 30; i++) step(j, { ...GAS, steer: 1 }, t, { top: 1 });
    expect(glide).toBeGreaterThan(Math.abs(wrapAngle(j.h - h0)) * 2);
  });

  it.each(["col", "dunes", "lagon", "volcan"] as const)(
    "%s : les anneaux sont sur la trajectoire, et en traverser un donne un turbo",
    (id) => {
      const t = getTrack(id);
      expect(t.hoops.length).toBeGreaterThanOrEqual(3);
      for (const hoop of t.hoops) {
        expect(hoop.h).toBeGreaterThan(2.5);
        expect(Math.abs(hoop.d)).toBeLessThan(t.half);
      }
      const hoop = t.hoops[0]!;
      const k = kartAt(id, hoop.s - 3, hoop.d);
      Object.assign(k, { v: 27, air: hoop.h, vy: 0.5, glide: true });
      const ev: string[] = [];
      for (let i = 0; i < 20; i++) step(k, GAS, t, { top: 1 }, ev as never);
      expect(ev).toContain("hoop");
      expect(k.boost).toBeGreaterThan(0.4);
      // À côté, rien
      const off = kartAt(id, hoop.s - 3, hoop.d + 6);
      Object.assign(off, { v: 27, air: hoop.h, vy: 0.5, glide: true });
      const none: string[] = [];
      for (let i = 0; i < 20; i++) step(off, GAS, t, { top: 1 }, none as never);
      expect(none).not.toContain("hoop");
    },
  );

  it("le vol voyage avec le kart, et au-dessus de tout", () => {
    const k = kartAt("dunes", 40);
    Object.assign(k, { air: 9, vy: 1, glide: true });
    const out = decodeKart(encodeKart(k))!;
    expect(out.glide).toBe(true);
    expect(out.air).toBeCloseTo(9, 1);
  });

  it("une partie de la route du lagon passe vraiment sous la mer, et elle en ressort", () => {
    const t = getTrack("lagon");
    let below = 0;
    for (let i = 0; i < t.n; i++) if (t.y[i]! < t.water! - 0.3) below += t.length / t.n;
    expect(below).toBeGreaterThan(120);
    expect(below).toBeLessThan(t.length * 0.45);
    expect(t.y[0]!).toBeGreaterThan(t.water!);
    for (const g of t.gaps) expect(pointAt(t, g.from, 0).y).toBeGreaterThan(t.water! + 2);
  });

  it("sous l'eau : on va un peu moins vite, on tourne mieux, et on retombe doucement", () => {
    const t = getTrack("lagon");
    let deep = 0;
    let bestY = 0;
    for (let i = 0; i < t.n; i++) {
      if (t.y[i]! < bestY && Math.abs(t.bend[i]!) < 0.003) {
        bestY = t.y[i]!;
        deep = (i * t.length) / t.n;
      }
    }
    const land = t.boxes[0]!.s;
    const run = (s: number) => {
      const k = kartAt("lagon", s);
      k.v = 27;
      for (let i = 0; i < 40; i++) step(k, GAS, t, { top: 1 });
      return k.v;
    };
    expect(run(deep)).toBeLessThan(run(land));
    const fallFrom = (s: number) => {
      const k = kartAt("lagon", s);
      Object.assign(k, { air: 3, vy: 0.01, v: 10 });
      let n = 0;
      while (k.air > 0 && n < 600) {
        step(k, GAS, t, { top: 1 });
        n++;
      }
      return n;
    };
    expect(fallFrom(deep)).toBeGreaterThan(fallFrom(land) * 1.3);
  });

  it.each(TRACK_IDS)("%s : rien d'important ne tombe dans un vide", (id) => {
    const t = getTrack(id);
    const inside = (s: number) =>
      t.gaps.some((g) => {
        const along = deltaS(t, g.from, s);
        return along >= -8 && along <= g.to - g.from + 2;
      });
    for (const b of t.boxes) expect(inside(b.s), `caisse ${b.s}`).toBe(false);
    for (const p of t.boosts) expect(inside(p.s), `accélérateur ${p.s}`).toBe(false);
    for (const p of t.springs) expect(inside(p.s), `trampoline ${p.s}`).toBe(false);
    for (const m of t.movers) expect(inside(m.s), `obstacle ${m.s}`).toBe(false);
    for (const c of t.crossers) expect(inside(c.s), `passage ${c.s}`).toBe(false);
    for (const z of t.zones) expect(inside(z.s + z.len / 2), `sol ${z.s}`).toBe(false);
  });

  it.each(TRACK_IDS)("%s : caisses, obstacles et trampolines ne se marchent pas dessus", (id) => {
    const t = getTrack(id);
    const spots = [
      ...new Set(t.boxes.map((b) => b.s)),
      ...t.movers.map((m) => m.s),
      ...t.crossers.map((c) => c.s),
      ...t.springs.map((p) => p.s),
    ];
    for (let a = 0; a < spots.length; a++) {
      for (let b = a + 1; b < spots.length; b++) {
        expect(Math.abs(deltaS(t, spots[a]!, spots[b]!)), `${spots[a]} et ${spots[b]}`).toBeGreaterThan(10);
      }
    }
  });
});

describe("le drone de dépannage", () => {
  const setRoad = (id: (typeof TRACK_IDS)[number], s: number, d: number) => {
    const t = getTrack(id);
    const k = kartAt(id, s, d);
    k.goodS = k.s;
    return { t, k };
  };

  it("soulève le kart, le porte au milieu de la route, et le repose dans le bon sens", () => {
    const { t, k } = setRoad("port", 400, t0Wall("port") - 0.5);
    k.h += 2.5;
    const ev: string[] = [];
    beginRescue(t, k, ev as never);
    expect(ev).toContain("rescue");
    let top = 0;
    for (let i = 0; i < 200 && k.rescue > 0; i++) {
      step(k, { ...GAS, steer: 1, drift: true }, t, { top: 1 }, ev as never);
      top = Math.max(top, k.air);
    }
    expect(top).toBeGreaterThan(3);
    expect(ev).toContain("respawn");
    expect(k.rescue).toBe(0);
    expect(k.air).toBe(0);
    expect(Math.abs(k.d)).toBeLessThan(0.4);
    const p = pointAt(t, k.s, 0);
    expect(Math.abs(wrapAngle(k.h - Math.atan2(p.tx, p.tz)))).toBeLessThan(0.05);
    expect(k.v).toBeGreaterThan(10);
  });

  it("ramène au dernier endroit où l'on roulait, sans faire gagner de terrain", () => {
    const { t, k } = setRoad("port", 345, 0);
    k.goodS = 335;
    const before = k.dist;
    beginRescue(t, k);
    for (let i = 0; i < 200 && k.rescue > 0; i++) step(k, GAS, t, { top: 1 });
    expect(Math.abs(deltaS(t, 335, k.s))).toBeLessThan(2);
    expect(k.dist).toBeLessThanOrEqual(before);
  });

  it("même après un long passage dans l'herbe, on ne perd pas plus de quelques mètres, et on n'en gagne jamais", () => {
    const { t, k } = setRoad("port", 345, 0);
    k.goodS = 150;
    beginRescue(t, k);
    for (let i = 0; i < 200 && k.rescue > 0; i++) step(k, GAS, t, { top: 1 });
    expect(deltaS(t, k.s, 345)).toBeGreaterThanOrEqual(0);
    expect(deltaS(t, k.s, 345)).toBeLessThan(20);
    const ahead = setRoad("port", 345, 0);
    ahead.k.goodS = 420;
    beginRescue(ahead.t, ahead.k);
    for (let i = 0; i < 200 && ahead.k.rescue > 0; i++) step(ahead.k, GAS, ahead.t, { top: 1 });
    expect(deltaS(t, ahead.k.s, 345)).toBeGreaterThanOrEqual(-1);
  });

  it.each(TRACK_IDS)("%s : ne repose jamais sur un tremplin, dans un trou, ni sur un obstacle", (id) => {
    const t = getTrack(id);
    for (let s = 0; s < t.length; s += 3) {
      const spot = rescueSpot(t, s);
      for (const g of t.gaps) {
        const along = deltaS(t, g.from, spot);
        expect(along >= -RAMP_LEN - 2 && along <= g.to - g.from, `${s} -> ${spot}`).toBe(false);
      }
      for (const c of t.crossers) expect(Math.abs(deltaS(t, c.s, spot)), `passage ${s} -> ${spot}`).toBeGreaterThan(3);
      // Toujours tout près d'où l'on était (un drone ne fait pas gagner un demi-tour)
      expect(Math.abs(deltaS(t, s, spot)), `${s} -> ${spot}`).toBeLessThan(90);
    }
  });

  it("personne ne peut toucher un kart porté, et on ne peut pas le bousculer", () => {
    const race = newRace(["a", "b", "c"], new Set(["b", "c"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
    worldTick(race, race.goAt);
    const a = racerOf(race, "a")!;
    const b = racerOf(race, "b")!;
    const t = getTrack("port");
    beginRescue(t, b.kart);
    Object.assign(a.kart, { dist: 0 });
    Object.assign(b.kart, { dist: 900 });
    a.item = "orage";
    a.uses = 1;
    const out = useItem(race, "a", race.goAt + 2000);
    expect(out.some((e) => e.type === "hit" && e.id === "b")).toBe(false);
    const other = { ...b.kart, rescue: 0, x: b.kart.x + 0.4 };
    expect(bump(b.kart, other, true, true)).toBe(0);
  });

  it("un bot reposé repart tout droit : il ne recule pas, et le drone ne revient pas le chercher", () => {
    const t = getTrack("port");
    const k = kartAt("port", 300, 0);
    k.goodS = 300;
    const mem = newBotMemory({ rng: 3 });
    const h = { rng: 8 };
    beginRescue(t, k);
    let now = 10_000;
    let reversed = false;
    for (let i = 0; i < 60 * 4; i++) {
      now += DT * 1000;
      const plan = botDrive(t, k, null, [], [], "moyen", mem, now, h);
      if (k.rescue === 0 && plan.input.brake) reversed = true;
      step(k, plan.input, t, { top: 1 });
    }
    expect(reversed).toBe(false);
    expect(k.dist).toBeGreaterThan(300 + 25);
  });

  it("le drone se voit chez les autres, et un kart repris par le serveur en plein vol se repose sur place", () => {
    const { t, k } = setRoad("port", 300, 0);
    beginRescue(t, k);
    for (let i = 0; i < 30; i++) step(k, GAS, t, { top: 1 });
    const out = decodeKart(encodeKart(k))!;
    expect(out.rescue).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) step(out, GAS, t, { top: 1 });
    expect(out.rescue).toBe(0);
    expect(out.air).toBe(0);
    expect(Number.isFinite(out.x)).toBe(true);
  });

  it("un bot coincé contre un mur finit par être dépanné", () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 3);
    worldTick(race, race.goAt);
    const b = racerOf(race, "b")!;
    const a = racerOf(race, "a")!;
    a.kart.dist = 5000;
    const mem = new Map();
    let now = race.goAt;
    let done = false;
    for (let i = 0; i < 400 && !done; i++) {
      now += 50;
      // On l'empêche d'avancer, comme s'il était coincé
      const k = b.kart;
      if (k.rescue === 0) {
        k.v = 0;
        k.dist = 10;
      }
      driveBots(race, now, mem);
      done = b.kart.rescue > 0;
    }
    expect(done).toBe(true);
  });
});

describe("le chargement avant les feux", () => {
  const start = () => {
    const race = newRace(["a", "b", "bot"], new Set(["bot"]), { ...DEFAULT_SETTINGS, track: "port" }, 1000, 42);
    holdForLoading(race, 1000);
    return race;
  };

  it("n'allume pas les feux tant que tous les joueurs n'ont pas chargé", () => {
    const race = start();
    expect(race.phase).toBe("loading");
    expect(loadingOver(race, 2000)).toBe(false);
    expect(markLoaded(race, "a")).toBe(true);
    expect(loadingOver(race, 2000)).toBe(false);
    expect(markLoaded(race, "b")).toBe(true);
    expect(loadingOver(race, 2000)).toBe(true);
  });

  it("ne compte chacun qu'une fois, et seulement les pilotes de la course", () => {
    const race = start();
    expect(markLoaded(race, "a")).toBe(true);
    expect(markLoaded(race, "a")).toBe(false);
    expect(markLoaded(race, "inconnu")).toBe(false);
    expect(race.loaded).toEqual(["a"]);
  });

  it("n'attend pas un pilote passé aux mains d'un bot, ni personne au-delà de la limite", () => {
    const race = start();
    markLoaded(race, "a");
    expect(loadingOver(race, 2000)).toBe(false);
    racerOf(race, "b")!.bot = true;
    expect(loadingOver(race, 2000)).toBe(true);
    const late = start();
    expect(loadingOver(late, 1000 + LOAD_MAX_MS - 1)).toBe(false);
    expect(loadingOver(late, 1000 + LOAD_MAX_MS)).toBe(true);
  });

  it("donne tout le temps du survol et des feux une fois lancé, et personne n'a bougé avant", () => {
    const race = start();
    const mem = new Map();
    const grid = race.racers.map((r) => ({ x: r.kart.x, z: r.kart.z }));
    driveBots(race, 5000, mem);
    expect(worldTick(race, 5000)).toEqual([]);
    const moved = { ...racerOf(race, "a")!.kart, x: 999, dist: 500 };
    reportKart(race, "a", moved, 5000);
    expect(race.racers.map((r) => ({ x: r.kart.x, z: r.kart.z }))).toEqual(grid);
    releaseStart(race, 8000);
    expect(race.phase).toBe("start");
    expect(race.goAt).toBe(8000 + INTRO_MS + COUNTDOWN_MS);
    expect(race.racers.every((r) => r.lapStart === race.goAt)).toBe(true);
    expect(worldTick(race, race.goAt - 1)).toEqual([]);
    expect(worldTick(race, race.goAt).map((e) => e.type)).toContain("go");
  });

  it("garde le même numéro de course du chargement à l'arrivée", () => {
    const race = start();
    const id = race.createdAt;
    releaseStart(race, 8000);
    expect(race.createdAt).toBe(id);
    expect(bolidesView(race).createdAt).toBe(id);
  });
});

describe("le niveau des bots", () => {
  const raceOf = (botLevel: BotLevel, track: "port" | "volcan") => {
    const ids = ["a", "b", "c", "d"];
    const race = newRace(ids, new Set(ids), { ...DEFAULT_SETTINGS, track, botLevel }, 0, 5);
    const mem = new Map();
    const boxes: (ItemKind | null)[] = [];
    let now = 0;
    while (race.phase !== "over" && now < 400_000) {
      now += 50;
      for (const e of [...driveBots(race, now, mem), ...worldTick(race, now)]) if (e.type === "box") boxes.push(e.item);
    }
    return { best: Math.min(...race.racers.map((r) => r.finish ?? 1e9)), boxes };
  };

  it.each(["port", "volcan"] as const)("sur %s, les moyens sont nettement moins rapides que les forts", (track) => {
    const facile = raceOf("facile", track).best;
    const moyen = raceOf("moyen", track).best;
    const fort = raceOf("fort", track).best;
    expect(moyen).toBeGreaterThan(fort * 1.05);
    expect(facile).toBeGreaterThan(moyen);
  });

  it("les bots faciles n'ont jamais ni fusée ni orage", () => {
    const { boxes } = raceOf("facile", "port");
    expect(boxes.length).toBeGreaterThan(5);
    expect(boxes.filter((b) => b === "fusee" || b === "orage")).toEqual([]);
  });

  it("un bot moyen lève le pied quand il prend le large devant le joueur", () => {
    const run = (humanBehind: boolean) => {
      const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port", items: false }, 0, 3);
      worldTick(race, race.goAt);
      const mem = new Map();
      const a = racerOf(race, "a")!;
      const b = racerOf(race, "b")!;
      let now = race.goAt;
      for (let i = 0; i < 400; i++) {
        now += 50;
        a.kart.dist = humanBehind ? -500 : b.kart.dist + 5;
        driveBots(race, now, mem);
      }
      return b.kart.dist;
    };
    expect(run(true)).toBeLessThan(run(false) * 0.93);
  });
});

describe("les titres de fin de course", () => {
  const base = { boxes: 0, hitsGiven: 0, hitsTaken: 0, turbos: 0, walls: 0 };
  it("donne un titre à celui qui a le plus tiré, à partir d'un minimum", () => {
    const titles = raceTitles([
      { id: "a", human: true, stats: { ...base, hitsGiven: 5 } },
      { id: "b", human: true, stats: { ...base, hitsGiven: 1 } },
    ]);
    expect(titles).toEqual([{ id: "a", title: "Fine gâchette", detail: "5 touches" }]);
  });
  it("personne n'a rien fait : pas de titre", () => {
    expect(raceTitles([{ id: "a", human: true, stats: base }])).toEqual([]);
  });
  it("un seul titre par pilote, le suivant va au deuxième de la catégorie", () => {
    const titles = raceTitles([
      { id: "a", human: true, stats: { ...base, hitsGiven: 5, turbos: 20 } },
      { id: "b", human: true, stats: { ...base, turbos: 9 } },
    ]);
    expect(titles.map((t) => [t.id, t.title])).toEqual([
      ["a", "Fine gâchette"],
      ["b", "Roi du dérapage"],
    ]);
  });
  it("trois titres au plus, et les joueurs passent avant les bots", () => {
    const titles = raceTitles([
      { id: "bot1", human: false, stats: { ...base, hitsGiven: 9 } },
      { id: "bot2", human: false, stats: { ...base, turbos: 30 } },
      { id: "bot3", human: false, stats: { ...base, hitsTaken: 8 } },
      { id: "moi", human: true, stats: { ...base, walls: 7 } },
    ]);
    expect(titles).toHaveLength(3);
    expect(titles[0]).toEqual({ id: "moi", title: "Ami des murs", detail: "7 chocs" });
  });
  it("à égalité, un joueur plutôt qu'un bot, et le singulier quand il faut", () => {
    const titles = raceTitles(
      [
        { id: "bot", human: false, stats: { ...base, hitsTaken: 3 } },
        { id: "moi", human: true, stats: { ...base, hitsTaken: 3 } },
      ],
      1,
    );
    expect(titles[0]?.id).toBe("moi");
  });
});

describe("les bonus, faciles à vivre", () => {
  const setup = (track: "port" | "col" = "port") => {
    const race = newRace(["a", "b", "c"], new Set(["b", "c"]), { ...DEFAULT_SETTINGS, track }, 0, 1);
    worldTick(race, race.goAt);
    const t = getTrack(track);
    const put = (k: Kart, s: number, d = 0) => {
      const p = pointAt(t, s, d);
      Object.assign(k, { x: p.x, z: p.z, s, d, dist: s, h: Math.atan2(p.tx, p.tz), spin: 0, i: Math.round(s / (t.length / t.n)) % t.n });
    };
    return { race, t, put, a: racerOf(race, "a")!, b: racerOf(race, "b")!, c: racerOf(race, "c")!, now: race.goAt + 1000 };
  };

  it("on peut garder un deuxième objet : il prend la place du premier une fois utilisé", () => {
    const { race, t, a, now } = setup();
    const row = t.boxes.filter((b) => b.s === t.boxes[0]!.s);
    const report = (i: number, at: number) => {
      const box = row[i]!;
      Object.assign(a.kart, { x: box.x, z: box.z, s: box.s, d: box.d, dist: box.s });
      return reportKart(race, "a", { ...a.kart }, at);
    };
    const first = report(0, now).find((e) => e.type === "box");
    expect(first && first.type === "box" && first.slot).toBe(1);
    expect(a.item).not.toBeNull();
    a.px = a.kart.x;
    a.pz = a.kart.z;
    const second = report(4, now + 300).find((e) => e.type === "box");
    expect(second && second.type === "box" && second.slot).toBe(2);
    expect(a.item2).not.toBeNull();
    const reserve = a.item2;
    a.item = "bouclier";
    a.uses = 1;
    useItem(race, "a", now + 400);
    expect(a.item).toBe(reserve);
    expect(a.item2).toBeNull();
  });

  it("deux objets pleins : la caisse ne donne rien de plus", () => {
    const { race, t, a, now } = setup();
    a.item = "turbo";
    a.uses = 1;
    a.item2 = "huile";
    a.uses2 = 1;
    const box = t.boxes[0]!;
    Object.assign(a.kart, { x: box.x, z: box.z, s: box.s, d: box.d, dist: box.s });
    const e = reportKart(race, "a", { ...a.kart }, now).find((x) => x.type === "box");
    expect(e && e.type === "box" && e.slot).toBe(0);
    expect(a.item).toBe("turbo");
    expect(a.item2).toBe("huile");
  });

  it("on peut lancer derrière soi : le pétard, la boule, la bombe ; et une flaque devant soi", () => {
    const { race, t, put, a, now } = setup();
    put(a.kart, 300);
    for (const kind of ["petard", "bowling"] as const) {
      a.item = kind;
      a.uses = 1;
      useItem(race, "a", now, true);
      const hz = race.hazards.at(-1)!;
      const later = hazardPos(t, hz, now + 500)!;
      expect(deltaS(t, 300, locate(t, later.x, later.z).s)).toBeLessThan(-10);
    }
    a.item = "bombe";
    a.uses = 1;
    useItem(race, "a", now, true);
    const bomb = race.hazards.at(-1)!;
    expect(bomb.kind === "bombe" && deltaS(t, 300, bomb.s)).toBeLessThan(-10);
    a.item = "huile";
    a.uses = 1;
    useItem(race, "a", now, true);
    const oil = race.hazards.at(-1)!;
    expect(oil.kind === "huile" && deltaS(t, 300, oil.s)).toBeGreaterThan(15);
  });

  it("une tarte sans personne à portée n'est pas gâchée", () => {
    const { race, put, a, b, c, now } = setup();
    put(a.kart, 100);
    put(b.kart, 500);
    put(c.kart, 900);
    a.item = "tarte";
    a.uses = 1;
    const ev = useItem(race, "a", now);
    expect(ev.map((e) => e.type)).toEqual(["noTarget"]);
    expect(a.item).toBe("tarte");
    expect(race.hazards.length).toBe(0);
  });

  it("tarte lancée en arrière : elle vise derrière d'abord", () => {
    const { race, put, a, b, c, now } = setup();
    put(a.kart, 300);
    put(b.kart, 330);
    put(c.kart, 260);
    a.item = "tarte";
    a.uses = 1;
    useItem(race, "a", now, true);
    expect(race.hazards[0]!.kind === "tarte" && race.hazards[0]!.target).toBe("c");
  });

  it("celui qu'on vient de renverser est intouchable un moment, puis redevient vulnérable", () => {
    const { race, put, a, b, c, now } = setup();
    put(a.kart, 300);
    put(b.kart, 500);
    put(c.kart, 900);
    a.item = "orage";
    a.uses = 1;
    useItem(race, "a", now);
    expect(b.safeUntil).toBeGreaterThan(now + 2000);
    Object.assign(b.kart, { spin: 0 });
    a.item = "orage";
    a.uses = 1;
    const again = useItem(race, "a", now + 500);
    expect(again.some((e) => e.type === "hit" && e.id === "b")).toBe(false);
    Object.assign(b.kart, { spin: 0 });
    a.item = "orage";
    a.uses = 1;
    const late = useItem(race, "a", b.safeUntil + 10);
    expect(late.some((e) => e.type === "hit" && e.id === "b")).toBe(true);
  });

  it("les objets dépendent de l'écart avec le premier, pas seulement de la place", () => {
    const { race, put, a, b, c } = setup();
    put(a.kart, 500);
    put(b.kart, 490);
    put(c.kart, 480);
    const close = itemRank(race, "c");
    put(c.kart, 100);
    const far = itemRank(race, "c");
    expect(itemRank(race, "a")).toBe(0);
    expect(close).toBeLessThan(0.65);
    expect(far).toBeGreaterThan(0.9);
    expect(far).toBeGreaterThan(close);
  });

  it("jamais deux fusées à la fois", () => {
    const { race, t, put, a, b, c, now } = setup();
    put(c.kart, 2);
    put(a.kart, 900);
    put(b.kart, 880);
    race.hazards.push({ id: 99, kind: "fusee", dist0: 0, target: "a", owner: "b", at: now });
    for (let i = 0; i < 80; i++) {
      c.item = null;
      c.item2 = null;
      race.boxes = race.boxes.map(() => 0);
      const box = t.boxes[i % t.boxes.length]!;
      Object.assign(c.kart, { x: box.x, z: box.z, s: box.s, d: box.d });
      reportKart(race, "c", { ...c.kart, dist: c.kart.dist }, now + i * 50);
      expect(c.item).not.toBe("fusee");
      c.seen = now + i * 50;
    }
  });

  describe("l'aspiration", () => {
    const pair = (gap: number, side = 0) => {
      const t = getTrack("port");
      const me = kartAt("port", 40, 0);
      const front = kartAt("port", 40 + gap, side);
      me.v = 24;
      front.v = 24;
      return { t, me, front };
    };

    it("derrière un kart assez longtemps, on est lancé ; puis il faut attendre", () => {
      const { me, front } = pair(8);
      const ev: string[] = [];
      for (let i = 0; i < 90; i++) draftStep(me, [me, front], DT, ev as never);
      expect(ev).toEqual(["draft"]);
      expect(me.boost).toBeGreaterThan(0.5);
      expect(me.draft).toBeLessThan(0);
    });

    it("rien si on est à côté, trop loin, ou devant", () => {
      for (const [gap, side] of [
        [8, 5],
        [40, 0],
        [-8, 0],
      ] as const) {
        const { me, front } = pair(gap, side);
        const ev: string[] = [];
        for (let i = 0; i < 120; i++) draftStep(me, [front], DT, ev as never);
        expect(ev).toEqual([]);
        expect(me.boost).toBe(0);
      }
    });

    it("s'écarter fait perdre ce qu'on avait gagné", () => {
      const { me, front } = pair(8);
      for (let i = 0; i < 40; i++) draftStep(me, [front], DT);
      const got = me.draft;
      expect(got).toBeGreaterThan(0.4);
      for (let i = 0; i < 20; i++) draftStep(me, [], DT);
      expect(me.draft).toBeLessThan(got);
    });
  });

  it("la conduite assistée ramène vers la route, sans toucher au volant au milieu", () => {
    const t = getTrack("port");
    const k = kartAt("port", 40, t.half - 0.5);
    k.v = 24;
    // Il file vers la droite : le cap baisse quand on tourne à droite
    k.h -= 0.5;
    expect(assistSteer(t, k, 0)).toBeLessThan(0);
    const mid = kartAt("port", 40, 0);
    mid.v = 24;
    expect(assistSteer(t, mid, 0.4)).toBe(0.4);
  });

  it.each(TRACK_IDS)("%s en miroir : même longueur, virages inversés, sols et trampolines de l'autre côté", (id) => {
    const a = getTrack(id);
    const b = getTrack(mirrorOf(id));
    expect(b.length).toBeCloseTo(a.length, 3);
    expect(b.def.theme).toBe(a.def.theme);
    const i = a.bend.reduce((best, v, k, arr) => (Math.abs(v) > Math.abs(arr[best]!) ? k : best), 0);
    expect(Math.sign(b.bend[i]!)).toBe(-Math.sign(a.bend[i]!));
    a.springs.forEach((p, k) => expect(b.springs[k]!.d).toBeCloseTo(-p.d, 6));
    a.zones.forEach((z, k) => expect(b.zones[k]!.d1).toBeCloseTo(-z.d2, 6));
    // Les pièces suivent : l'intérieur des virages est du bon côté
    expect(b.coins.length).toBeGreaterThan(0);
  });

  it("un Grand Prix donne plus de points aux premiers", () => {
    expect(cupPoints(1)).toBeGreaterThan(cupPoints(2));
    expect(cupPoints(8)).toBeGreaterThan(0);
    expect(cupPoints(9)).toBe(0);
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

describe("les objets lancés par un joueur", () => {
  /** Un joueur contre un bot ; il roule jusqu'à s en envoyant sa position comme son navigateur (s ne voyage pas) */
  const setup = () => {
    const race = newRace(["a", "b"], new Set(["b"]), { ...DEFAULT_SETTINGS, track: "port" }, 0, 1);
    worldTick(race, race.goAt);
    const t = getTrack("port");
    const a = racerOf(race, "a")!;
    let now = race.goAt;
    const driveTo = (s: number, d = 2) => {
      for (let at = 5; at <= s; at += 5) {
        const p = pointAt(t, at, d);
        const k = newKart(t, p.x, p.z, Math.atan2(p.tx, p.tz));
        k.dist = at;
        k.v = 25;
        now += 200;
        reportKart(race, "a", decodeKart(encodeKart(k), a.kart)!, now);
      }
      return now;
    };
    return { race, t, a, driveTo };
  };

  it("le serveur sait où en est le kart d'un joueur le long de la route, même si cela ne voyage pas", () => {
    const { t, a, driveTo } = setup();
    driveTo(300);
    expect(Math.abs(deltaS(t, 300, a.kart.s))).toBeLessThan(1);
    expect(Math.abs(deltaS(t, 300, a.kart.goodS))).toBeLessThan(1);
  });

  it("pétard, boule, bombe et flaque lancée devant partent de son kart, pas de la ligne de départ", () => {
    const { race, t, a, driveTo } = setup();
    const now = driveTo(300);
    const throwIt = (kind: ItemKind, flip = false) => {
      a.item = kind;
      a.uses = 1;
      useItem(race, "a", now, flip);
      return race.hazards.at(-1)!;
    };
    // Le pétard et la boule partent juste devant lui, dans sa voie
    const petard = throwIt("petard");
    expect(petard.kind === "petard" && deltaS(t, 300, petard.s0)).toBeCloseTo(3, 0);
    expect(petard.kind === "petard" && petard.d).toBeCloseTo(2, 1);
    const start = hazardPos(t, petard, now)!;
    expect(Math.hypot(start.x - a.kart.x, start.z - a.kart.z)).toBeLessThan(4);
    const ball = throwIt("bowling");
    expect(ball.kind === "bowling" && deltaS(t, 300, ball.s0)).toBeCloseTo(4, 0);
    // La bombe retombe devant lui, la flaque lancée devant aussi
    const bomb = throwIt("bombe");
    expect(bomb.kind === "bombe" && deltaS(t, 300, bomb.s)).toBeCloseTo(32, 0);
    const oil = throwIt("huile", true);
    expect(oil.kind === "huile" && deltaS(t, 300, oil.s)).toBeCloseTo(22, 0);
  });

  it("un bot qui prend le volant d'un joueur parti repart de là où il était, sans bond", () => {
    const { race, a, driveTo } = setup();
    const now = driveTo(300);
    a.bot = true;
    driveBots(race, now + 600, new Map());
    // En un peu plus d'une demi-seconde, il avance de quelques mètres, pas de la moitié du circuit
    expect(a.kart.dist).toBeGreaterThan(300);
    expect(a.kart.dist).toBeLessThan(330);
  });
});
