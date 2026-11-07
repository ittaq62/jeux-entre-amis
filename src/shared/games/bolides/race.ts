// Une course de Bolides, telle que la mène le serveur : la grille, le départ, les tours, les caisses et les objets,
// les coups reçus, l'arrivée et le classement. Chaque joueur conduit son kart chez lui et envoie où il en est ; le
// serveur conduit les bots, décide des objets et des coups, et dit à chacun ce qui lui arrive.
// Tout se décide ici, sans réseau : l'heure est passée en paramètre, le hasard vient de la course.

import { random } from "../../rng.ts";
import { BOT_STYLE, botDrive, newBotMemory, type BotLevel, type BotMemory } from "./bot.ts";
import {
  BOX_RADIUS,
  BOX_RESPAWN_MS,
  drawItem,
  hazardPos,
  ITEM_USES,
  KLAXON_RADIUS,
  OIL_RADIUS,
  PETARD_RADIUS,
  PETARD_SAFE_MS,
  PETARD_SPEED,
  SHIELD_MS,
  sweptHit,
  TURBO_TIME,
  type Hazard,
  type ItemKind,
} from "./items.ts";
import {
  bump,
  CLASS_SPEED,
  DT,
  KART_RADIUS,
  newKart,
  SPIN_TIME,
  step,
  TOP_SPEED,
  type Kart,
  type KartEvent,
  type SpeedClass,
} from "./physics.ts";
import { getTrack, gridSlot, locate, TRACK_IDS, type Track, type TrackId } from "./track.ts";

export interface BolidesSettings {
  /** Le circuit, ou un tirage au sort à chaque course */
  track: TrackId | "hasard";
  laps: number;
  speed: SpeedClass;
  /** Les caisses d'objets (sinon, une course pure) */
  items: boolean;
  botLevel: BotLevel;
}

export const DEFAULT_SETTINGS: BolidesSettings = { track: "hasard", laps: 3, speed: "normal", items: true, botLevel: "moyen" };
export const LAP_CHOICES = [2, 3, 5] as const;

/** Le survol du circuit avant les feux, puis les trois feux */
export const INTRO_MS = 3500;
export const COUNTDOWN_MS = 3000;
/** Après le premier arrivé, les autres ont encore ce temps pour finir */
export const FINISH_GRACE_MS = 30_000;
/** Une fois tous les joueurs arrivés, les bots qui roulent encore sont classés au bout de ce temps */
export const BOTS_GRACE_MS = 3500;
/** Au-delà, la course s'arrête quoi qu'il arrive (par tour) */
const LAP_LIMIT_MS = 150_000;

export interface RacerStats {
  boxes: number;
  itemsUsed: number;
  hitsGiven: number;
  hitsTaken: number;
  /** Mini-turbos gagnés en dérapant */
  turbos: number;
  walls: number;
  /** Le meilleur tour, en ms (0 : aucun tour bouclé) */
  bestLap: number;
}

export function emptyStats(): RacerStats {
  return { boxes: 0, itemsUsed: 0, hitsGiven: 0, hitsTaken: 0, turbos: 0, walls: 0, bestLap: 0 };
}

export interface Racer {
  id: string;
  /** Conduit par le serveur (un bot, ou le relais d'un joueur absent) */
  bot: boolean;
  /** Où en est son kart : simulé pour un bot, le dernier envoi pour un joueur */
  kart: Kart;
  /** La position au tic précédent (pour savoir ce qu'il a touché entre deux) */
  px: number;
  pz: number;
  /** Le dernier envoi d'un joueur */
  seen: number;
  item: ItemKind | null;
  uses: number;
  shieldUntil: number;
  /** Le début du tour en cours, et les tours bouclés */
  lapStart: number;
  laps: number;
  /** Son temps de course à l'arrivée */
  finish: number | null;
  stats: RacerStats;
}

export interface Race {
  settings: BolidesSettings;
  track: TrackId;
  phase: "start" | "racing" | "over";
  /** Le feu vert */
  goAt: number;
  /** Jusqu'où les bots ont été conduits */
  simAt: number;
  /** Après le premier arrivé, la fin de la course */
  endAt: number | null;
  allHumansAt: number | null;
  racers: Racer[];
  /** Chaque caisse : l'heure où elle revient (0 : elle est là) */
  boxes: number[];
  hazards: Hazard[];
  seq: number;
  ranking: string[] | null;
  ranks: Record<string, number> | null;
  rng: number;
}

export type BolidesEvent =
  | { type: "go" }
  | { type: "box"; id: string; box: number; item: ItemKind | null }
  | { type: "use"; id: string; item: ItemKind }
  | { type: "hazard"; hazard: Hazard }
  | { type: "gone"; hazard: number; why: "hit" | "time" | "klaxon" }
  | { type: "hit"; id: string; by: string | null; kind: "huile" | "petard" | "klaxon" }
  | { type: "shield"; id: string }
  | { type: "lap"; id: string; lap: number; ms: number }
  | { type: "finish"; id: string; place: number; ms: number }
  | { type: "over" };

export function trackOf(r: Race): Track {
  return getTrack(r.track);
}

export function newRace(ids: string[], bots: Set<string>, settings: BolidesSettings, now: number, seed: number): Race {
  const race: Race = {
    settings: { ...settings },
    track: "port",
    phase: "start",
    goAt: now + INTRO_MS + COUNTDOWN_MS,
    simAt: now,
    endAt: null,
    allHumansAt: null,
    racers: [],
    boxes: [],
    hazards: [],
    seq: 0,
    ranking: null,
    ranks: null,
    rng: seed,
  };
  race.track = settings.track === "hasard" ? TRACK_IDS[Math.floor(random(race) * TRACK_IDS.length)]! : settings.track;
  const t = getTrack(race.track);
  race.boxes = t.boxes.map(() => 0);
  // L'ordre sur la grille est tiré au sort
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random(race) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  race.racers = order.map((id, place) => {
    const slot = gridSlot(t, place);
    const kart = newKart(t, slot.x, slot.z, slot.h);
    return {
      id,
      bot: bots.has(id),
      kart,
      px: kart.x,
      pz: kart.z,
      seen: now,
      item: null,
      uses: 0,
      shieldUntil: 0,
      lapStart: race.goAt,
      laps: 0,
      finish: null,
      stats: emptyStats(),
    };
  });
  return race;
}

export const racerOf = (race: Race, id: string): Racer | undefined => race.racers.find((r) => r.id === id);

/** Le classement en cours : les arrivés par temps, puis les autres par distance parcourue */
export function standings(race: Race): Racer[] {
  return [...race.racers].sort((a, b) => {
    if (a.finish !== null && b.finish !== null) return a.finish - b.finish;
    if (a.finish !== null) return -1;
    if (b.finish !== null) return 1;
    return b.kart.dist - a.kart.dist;
  });
}

/** 0 en tête, 1 dernier */
function rankShare(race: Race, id: string): number {
  const order = standings(race);
  return order.findIndex((r) => r.id === id) / Math.max(1, order.length - 1);
}

/** Les tours bouclés et l'arrivée */
function progress(race: Race, r: Racer, now: number, events: BolidesEvent[]) {
  if (race.phase !== "racing" || r.finish !== null) return;
  const t = trackOf(race);
  const done = Math.max(0, Math.floor((r.kart.dist + 0.01) / t.length));
  while (done > r.laps && r.laps < race.settings.laps) {
    const ms = now - r.lapStart;
    r.laps += 1;
    r.lapStart = now;
    if (r.stats.bestLap === 0 || ms < r.stats.bestLap) r.stats.bestLap = ms;
    events.push({ type: "lap", id: r.id, lap: r.laps, ms });
  }
  if (r.laps >= race.settings.laps) {
    r.finish = now - race.goAt;
    const place = race.racers.filter((o) => o.finish !== null).length;
    events.push({ type: "finish", id: r.id, place, ms: r.finish });
    race.endAt ??= now + FINISH_GRACE_MS;
    r.item = null;
    r.uses = 0;
  }
}

/** Les caisses traversées entre (ax, az) et la position actuelle du kart */
function pickups(race: Race, r: Racer, ax: number, az: number, now: number, events: BolidesEvent[]) {
  if (!race.settings.items || race.phase !== "racing" || r.finish !== null) return;
  const t = trackOf(race);
  for (const box of t.boxes) {
    if (race.boxes[box.index]! > now) continue;
    if (!sweptHit(ax, az, r.kart.x, r.kart.z, box.x, box.z, BOX_RADIUS + KART_RADIUS * 0.6)) continue;
    race.boxes[box.index] = now + BOX_RESPAWN_MS;
    r.stats.boxes += 1;
    let item: ItemKind | null = null;
    if (!r.item) {
      item = drawItem(rankShare(race, r.id), () => random(race));
      r.item = item;
      r.uses = ITEM_USES[item];
    }
    events.push({ type: "box", id: r.id, box: box.index, item });
  }
}

/**
 * Un joueur envoie où en est son kart : on le croit, dans la limite de ce qu'un kart peut parcourir. `counts` : ce
 * qu'il a compté chez lui depuis le départ (mini-turbos, chocs contre le mur), qui ne peut que monter, et pas trop vite.
 */
export function reportKart(race: Race, id: string, k: Kart, now: number, counts?: { turbos: number; walls: number }): BolidesEvent[] {
  const r = racerOf(race, id);
  const events: BolidesEvent[] = [];
  if (!r || r.bot || race.phase === "over") return events;
  if (race.phase === "start") {
    r.seen = now;
    return events;
  }
  const elapsed = Math.max(0.05, (now - r.seen) / 1000);
  const reach = TOP_SPEED * CLASS_SPEED[race.settings.speed] * 1.6 * elapsed + 4;
  const before = r.kart;
  const dist = Math.max(before.dist - reach, Math.min(before.dist + reach, k.dist));
  r.kart = { ...k, dist };
  r.seen = now;
  if (counts && r.finish === null) {
    r.stats.turbos = Math.max(r.stats.turbos, Math.min(r.stats.turbos + 2, Math.floor(counts.turbos)));
    r.stats.walls = Math.max(r.stats.walls, Math.min(r.stats.walls + 2, Math.floor(counts.walls)));
  }
  pickups(race, r, before.x, before.z, now, events);
  progress(race, r, now, events);
  return events;
}

/** La vitesse d'un bot, un peu retenue s'il caracole devant les joueurs, un peu poussée s'il traîne derrière */
function botTop(race: Race, r: Racer): number {
  const level = BOT_STYLE[race.settings.botLevel];
  let top = CLASS_SPEED[race.settings.speed] * level.top;
  const humans = race.racers.filter((o) => !o.bot && o.finish === null);
  if (humans.length > 0) {
    const best = Math.max(...humans.map((o) => o.kart.dist));
    const worst = Math.min(...humans.map((o) => o.kart.dist));
    if (r.kart.dist > best + 60) top *= 0.95;
    else if (r.kart.dist < worst - 60) top *= 1.05;
  }
  return top;
}

/** Les bots conduisent jusqu'à `now`, par pas fixes */
export function driveBots(race: Race, now: number, memory: Map<string, BotMemory>): BolidesEvent[] {
  const events: BolidesEvent[] = [];
  if (race.phase === "over") return events;
  const t = trackOf(race);
  const ms = DT * 1000;
  // Après une longue absence (le serveur s'est endormi), on ne rattrape pas tout
  if (now - race.simAt > 1000) race.simAt = now - 1000;
  while (race.simAt + ms <= now) {
    race.simAt += ms;
    const at = race.simAt;
    const racing = race.phase === "racing" && at >= race.goAt;
    for (const r of race.racers) {
      if (!r.bot) continue;
      let mem = memory.get(r.id);
      if (!mem) {
        mem = newBotMemory(race);
        memory.set(r.id, mem);
      }
      if (!racing) {
        // Sur la grille : il attend le feu vert (et ne se croit pas coincé pour autant)
        mem.slowSince = 0;
        mem.reverseUntil = 0;
        continue;
      }
      const rivals = race.racers.filter((o) => o !== r);
      const plan = botDrive(t, r.kart, r.item, rivals, race.hazards, race.settings.botLevel, mem, at, race);
      const x0 = r.kart.x;
      const z0 = r.kart.z;
      const kev: KartEvent[] = [];
      // Arrivé, un bot lève le pied
      const top = r.finish !== null ? botTop(race, r) * 0.6 : botTop(race, r);
      step(r.kart, plan.input, t, { top }, kev);
      for (const e of kev) {
        if (e === "turbo1" || e === "turbo2" || e === "turbo3") r.stats.turbos += 1;
        else if (e === "wall") r.stats.walls += 1;
      }
      pickups(race, r, x0, z0, at, events);
      if (plan.use) events.push(...useItem(race, r.id, at));
      progress(race, r, at, events);
    }
    // Les bots se bousculent entre eux et avec les joueurs (seuls les bots sont déplacés ici)
    for (let a = 0; a < race.racers.length; a++) {
      for (let b = a + 1; b < race.racers.length; b++) {
        const ra = race.racers[a]!;
        const rb = race.racers[b]!;
        if (ra.bot || rb.bot) bump(ra.kart, rb.kart, ra.bot, rb.bot);
      }
    }
  }
  return events;
}

/** Un coup : le bouclier l'arrête, sinon le kart part en tête-à-queue (chez un joueur, c'est son navigateur qui l'applique) */
function hit(race: Race, victim: Racer, by: string | null, kind: "huile" | "petard" | "klaxon", now: number, events: BolidesEvent[]) {
  if (victim.finish !== null) return;
  if (victim.shieldUntil > now) {
    victim.shieldUntil = 0;
    events.push({ type: "shield", id: victim.id });
    return;
  }
  if (victim.bot) {
    victim.kart.spin = SPIN_TIME;
    victim.kart.v *= 0.6;
    victim.kart.boost = 0;
    victim.kart.drift = 0;
    victim.kart.charge = 0;
  }
  victim.stats.hitsTaken += 1;
  if (by && by !== victim.id) {
    const from = racerOf(race, by);
    if (from) from.stats.hitsGiven += 1;
  }
  events.push({ type: "hit", id: victim.id, by, kind });
}

/** Se servir de son objet */
export function useItem(race: Race, id: string, now: number): BolidesEvent[] {
  const r = racerOf(race, id);
  const events: BolidesEvent[] = [];
  if (!r || !r.item || race.phase !== "racing" || r.finish !== null || r.kart.spin > 0) return events;
  const kind = r.item;
  const t = trackOf(race);
  r.uses -= 1;
  if (r.uses <= 0) {
    r.item = null;
    r.uses = 0;
  }
  r.stats.itemsUsed += 1;
  const k = r.kart;
  events.push({ type: "use", id, item: kind });
  if (kind === "turbo" || kind === "turbo3") {
    // Chez un joueur, son navigateur l'a déjà appliqué en appuyant
    if (r.bot) k.boost = Math.max(k.boost, TURBO_TIME);
  } else if (kind === "huile") {
    const x = k.x - Math.sin(k.h) * 2.8;
    const z = k.z - Math.cos(k.h) * 2.8;
    const at = locate(t, x, z, k.i);
    const hazard: Hazard = { id: ++race.seq, kind: "huile", x, z, s: at.s, d: at.d, owner: id, at: now };
    race.hazards.push(hazard);
    events.push({ type: "hazard", hazard });
  } else if (kind === "petard") {
    const d = Math.max(-t.half + 1, Math.min(t.half - 1, k.d));
    const hazard: Hazard = { id: ++race.seq, kind: "petard", s0: k.s + 3, d, speed: Math.max(PETARD_SPEED, k.v + 14), owner: id, at: now };
    race.hazards.push(hazard);
    events.push({ type: "hazard", hazard });
  } else if (kind === "bouclier") {
    r.shieldUntil = now + SHIELD_MS;
  } else if (kind === "klaxon") {
    for (const o of race.racers) {
      if (o === r || Math.hypot(o.kart.x - k.x, o.kart.z - k.z) > KLAXON_RADIUS) continue;
      hit(race, o, id, "klaxon", now, events);
    }
    race.hazards = race.hazards.filter((hz) => {
      const p = hazardPos(t, hz, now);
      if (!p || Math.hypot(p.x - k.x, p.z - k.z) > KLAXON_RADIUS) return true;
      events.push({ type: "gone", hazard: hz.id, why: "klaxon" });
      return false;
    });
  }
  return events;
}

/** Le monde avance : le feu vert, les pièges qui touchent ou s'éteignent, la fin de la course */
export function worldTick(race: Race, now: number): BolidesEvent[] {
  const events: BolidesEvent[] = [];
  if (race.phase === "start") {
    if (now < race.goAt) return events;
    race.phase = "racing";
    race.simAt = Math.max(race.simAt, race.goAt);
    for (const r of race.racers) {
      r.lapStart = race.goAt;
      // Ce qu'un joueur peut avoir parcouru se compte à partir du feu vert
      r.seen = race.goAt;
    }
    events.push({ type: "go" });
  }
  if (race.phase !== "racing") return events;
  const t = trackOf(race);
  // Les pièges : chacun touche le premier kart qui passe dessus, puis disparaît
  race.hazards = race.hazards.filter((hz) => {
    const pos = hazardPos(t, hz, now);
    if (!pos) {
      events.push({ type: "gone", hazard: hz.id, why: "time" });
      return false;
    }
    const prev = hz.kind === "petard" ? (hazardPos(t, hz, now - 60) ?? pos) : pos;
    for (const r of race.racers) {
      if (r.finish !== null || r.kart.spin > 0) continue;
      if (hz.kind === "petard" && r.id === hz.owner && now - hz.at < PETARD_SAFE_MS) continue;
      // On passe par-dessus une flaque en sautant d'un tremplin
      if (hz.kind === "huile" && r.kart.air > 0.8) continue;
      const touched =
        hz.kind === "huile"
          ? sweptHit(r.px, r.pz, r.kart.x, r.kart.z, hz.x, hz.z, OIL_RADIUS + KART_RADIUS * 0.5)
          : sweptHit(prev.x, prev.z, pos.x, pos.z, r.kart.x, r.kart.z, PETARD_RADIUS + KART_RADIUS);
      if (!touched) continue;
      hit(race, r, hz.owner, hz.kind, now, events);
      events.push({ type: "gone", hazard: hz.id, why: "hit" });
      return false;
    }
    return true;
  });
  for (const r of race.racers) {
    r.px = r.kart.x;
    r.pz = r.kart.z;
  }
  // La fin : tout le monde est arrivé, ou les joueurs le sont et les bots ont eu un peu de temps, ou le temps est écoulé
  const humans = race.racers.filter((r) => !r.bot);
  const allIn = race.racers.every((r) => r.finish !== null);
  if (humans.length > 0 && humans.every((r) => r.finish !== null)) race.allHumansAt ??= now;
  const late = now > race.goAt + LAP_LIMIT_MS * race.settings.laps;
  if (
    allIn ||
    late ||
    (race.allHumansAt !== null && now - race.allHumansAt > BOTS_GRACE_MS) ||
    (race.endAt !== null && now >= race.endAt)
  ) {
    finish(race);
    events.push({ type: "over" });
  }
  return events;
}

/** Le classement final : les arrivés par temps, puis les autres selon ce qu'ils ont parcouru */
function finish(race: Race) {
  race.phase = "over";
  const order = standings(race);
  race.ranking = order.map((r) => r.id);
  race.ranks = Object.fromEntries(order.map((r, i) => [r.id, i + 1]));
  race.hazards = [];
}
