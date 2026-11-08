// Une course de Bolides, telle que la mène le serveur : la grille, le départ, les tours, les caisses et les objets,
// les coups reçus, l'arrivée et le classement. Chaque joueur conduit son kart chez lui et envoie où il en est ; le
// serveur conduit les bots, décide des objets et des coups, et dit à chacun ce qui lui arrive.
// Tout se décide ici, sans réseau : l'heure est passée en paramètre, le hasard vient de la course.

import { random } from "../../rng.ts";
import { VEHICLES, type SkinId, type VehicleId } from "./garage.ts";
import { BOT_STYLE, botDrive, newBotMemory, type BotLevel, type BotMemory } from "./bot.ts";
import {
  AIMANT_MS,
  AIMANT_RADIUS,
  AIMANT_STEAL,
  ARC_MS,
  ARC_RADIUS,
  ARC_SPEED,
  BOMBE_AHEAD,
  BOMBE_BACK,
  BOMBE_RADIUS,
  BOWLING_RADIUS,
  BOWLING_SPEED,
  GEANT_MS,
  GEANT_RADIUS,
  GEANT_SPEED,
  PIE_MS,
  RESSORT_VY,
  tarteDist,
  tarteTarget,
  BOX_RADIUS,
  BOX_RESPAWN_MS,
  fuseeDist,
  COIN_LOSS,
  COIN_MAX,
  COIN_RADIUS,
  COIN_RESPAWN_MS,
  COIN_SPEED,
  drawItem,
  hazardPos,
  ITEM_USES,
  KLAXON_RADIUS,
  OIL_AHEAD,
  OIL_RADIUS,
  OIL_SAFE_MS,
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
  draftStep,
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
import { getTrack, gridSlot, locate, mirrorOf, pointAt, solidGround, TRACK_IDS, wrapS, type Track, type TrackId } from "./track.ts";

export interface BolidesSettings {
  /** Le circuit, ou un tirage au sort à chaque course */
  track: TrackId | "hasard";
  laps: number;
  speed: SpeedClass;
  /** Les caisses d'objets (sinon, une course pure) */
  items: boolean;
  botLevel: BotLevel;
  /** Un Grand Prix : plusieurs courses à la suite, avec des points */
  cup: boolean;
  /** Les circuits à l'envers, gauche et droite échangées */
  mirror: boolean;
}

export const DEFAULT_SETTINGS: BolidesSettings = {
  track: "hasard",
  laps: 3,
  speed: "normal",
  items: true,
  botLevel: "moyen",
  cup: false,
  mirror: false,
};

/** Un Grand Prix : le nombre de courses, et les points de chaque place */
export const CUP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

/** Ce qu'on gagne à cette place (1 : le premier) */
export function cupPoints(rank: number): number {
  return CUP_POINTS[rank - 1] ?? 0;
}

/** Après un coup, on est intouchable un petit moment (le temps de repartir) */
export const SAFE_MS = 2400;
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
  /** L'heure (du serveur) où son kart était là : la fin de la simulation pour un bot, le moment de l'envoi pour un joueur */
  stateAt: number;
  item: ItemKind | null;
  uses: number;
  /** Le deuxième objet, qui attend que le premier soit utilisé */
  item2: ItemKind | null;
  uses2: number;
  shieldUntil: number;
  /** Touché il y a un instant : rien ne le retouche jusque-là */
  safeUntil: number;
  /** Le début du tour en cours, et les tours bouclés */
  lapStart: number;
  laps: number;
  /** Son temps de course à l'arrivée */
  finish: number | null;
  /** Les pièces ramassées (dix au plus) */
  coins: number;
  /** L'arc-en-ciel : jusqu'à quand */
  starUntil: number;
  /** La potion géante, l'aimant, la crème sur l'écran : jusqu'à quand */
  giantUntil: number;
  magnetUntil: number;
  pieUntil: number;
  /** Le dernier moment où l'aimant a volé une pièce */
  stoleAt: number;
  /** Son véhicule et son skin */
  vehicle: VehicleId;
  skin: SkinId;
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
  /** Chaque pièce : l'heure où elle revient (0 : elle est là) */
  coins: number[];
  hazards: Hazard[];
  seq: number;
  /** Le dernier orage (on en laisse passer un peu entre deux) */
  stormAt?: number;
  ranking: string[] | null;
  ranks: Record<string, number> | null;
  rng: number;
}

/** Ce qui peut faire partir un kart en tête-à-queue */
export type HitKind = "huile" | "petard" | "klaxon" | "fusee" | "arc" | "bowling" | "geant" | "orage" | "bombe";

export type BolidesEvent =
  | { type: "go" }
  /** Une caisse prise ; `slot` : la case où va l'objet (1 ou 2, 0 : les deux sont pleines) */
  | { type: "box"; id: string; box: number; item: ItemKind | null; slot: 0 | 1 | 2 }
  | { type: "use"; id: string; item: ItemKind }
  /** Personne à viser : l'objet reste */
  | { type: "noTarget"; id: string; item: ItemKind }
  | { type: "hazard"; hazard: Hazard }
  | { type: "gone"; hazard: number; why: "hit" | "time" | "klaxon" }
  | { type: "hit"; id: string; by: string | null; kind: HitKind }
  | { type: "shield"; id: string }
  /** Une tarte en pleine figure */
  | { type: "pie"; id: string; by: string | null }
  /** Une bombe qui saute, ici */
  | { type: "blast"; x: number; z: number; by: string }
  /** La foudre tombe sur ce pilote */
  | { type: "bolt"; id: string }
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
    coins: [],
    hazards: [],
    seq: 0,
    ranking: null,
    ranks: null,
    rng: seed,
  };
  const base = settings.track === "hasard" ? TRACK_IDS[Math.floor(random(race) * TRACK_IDS.length)]! : settings.track;
  race.track = settings.mirror ? mirrorOf(base) : base;
  const t = getTrack(race.track);
  race.boxes = t.boxes.map(() => 0);
  race.coins = t.coins.map(() => 0);
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
      stateAt: now,
      item: null,
      uses: 0,
      item2: null,
      uses2: 0,
      shieldUntil: 0,
      safeUntil: 0,
      lapStart: race.goAt,
      laps: 0,
      finish: null,
      coins: 0,
      starUntil: 0,
      giantUntil: 0,
      magnetUntil: 0,
      pieUntil: 0,
      stoleAt: 0,
      vehicle: "kart",
      skin: "usine",
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

/** Où on en est pour les objets : 0 en tête, 1 très loin derrière. La place compte, et l'écart avec le premier aussi */
export function itemRank(race: Race, id: string): number {
  const order = standings(race);
  const i = order.findIndex((r) => r.id === id);
  if (i <= 0) return 0;
  const place = i / Math.max(1, order.length - 1);
  const gap = Math.min(1, Math.max(0, order[0]!.kart.dist - order[i]!.kart.dist) / 180);
  return 0.55 * place + 0.45 * gap;
}

/** Tirer un objet, sans deux fusées à la fois ni deux orages coup sur coup */
function drawFor(race: Race, r: Racer, now: number): ItemKind {
  const rank = itemRank(race, r.id);
  for (let tries = 0; tries < 6; tries++) {
    const kind = drawItem(rank, () => random(race));
    if (
      kind === "fusee" &&
      (race.hazards.some((h) => h.kind === "fusee") || race.racers.some((o) => o.item === "fusee" || o.item2 === "fusee"))
    )
      continue;
    if (kind === "orage" && now - (race.stormAt ?? -1e9) < 25_000) continue;
    return kind;
  }
  return "turbo";
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
  if (race.phase !== "racing" || r.finish !== null) return;
  const t = trackOf(race);
  // Les pièces (même sans objets) : comptées ici, elles voyagent avec les positions, sans évènement
  race.coins ??= t.coins.map(() => 0);
  if (r.kart.air < 1.2) {
    const reach = (r.magnetUntil ?? 0) > now ? AIMANT_RADIUS : COIN_RADIUS + KART_RADIUS * 0.6;
    for (const coin of t.coins) {
      if (race.coins[coin.index]! > now) continue;
      if (!sweptHit(ax, az, r.kart.x, r.kart.z, coin.x, coin.z, reach)) continue;
      race.coins[coin.index] = now + COIN_RESPAWN_MS;
      r.coins = Math.min(COIN_MAX, (r.coins ?? 0) + 1);
    }
  }
  if (!race.settings.items) return;
  for (const box of t.boxes) {
    if (race.boxes[box.index]! > now) continue;
    if (!sweptHit(ax, az, r.kart.x, r.kart.z, box.x, box.z, BOX_RADIUS + KART_RADIUS * 0.6)) continue;
    race.boxes[box.index] = now + BOX_RESPAWN_MS;
    r.stats.boxes += 1;
    let item: ItemKind | null = null;
    let slot: 0 | 1 | 2 = 0;
    if (!r.item) {
      item = drawFor(race, r, now);
      r.item = item;
      r.uses = ITEM_USES[item];
      slot = 1;
    } else if (!r.item2) {
      item = drawFor(race, r, now);
      r.item2 = item;
      r.uses2 = ITEM_USES[item];
      slot = 2;
    }
    if (item === "orage") race.stormAt = now;
    events.push({ type: "box", id: r.id, box: box.index, item, slot });
  }
}

/**
 * Un joueur envoie où en est son kart : on le croit, dans la limite de ce qu'un kart peut parcourir. `counts` : ce
 * qu'il a compté chez lui depuis le départ (mini-turbos, chocs contre le mur), qui ne peut que monter, et pas trop vite.
 */
export function reportKart(
  race: Race,
  id: string,
  k: Kart,
  now: number,
  counts?: { turbos: number; walls: number },
  at?: number,
): BolidesEvent[] {
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
  // L'heure de cette position, telle que le joueur l'a notée (jamais dans le futur, ni trop loin dans le passé)
  r.stateAt = at !== undefined && Number.isFinite(at) ? Math.max(now - 400, Math.min(now, at)) : now;
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
    const karts = race.racers.map((o) => o.kart);
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
      const plan = botDrive(t, r.kart, r.item, rivals, race.hazards, race.settings.botLevel, mem, at, race, race.coins);
      const x0 = r.kart.x;
      const z0 = r.kart.z;
      const kev: KartEvent[] = [];
      // Arrivé, un bot lève le pied
      const star = (r.starUntil ?? 0) > at;
      const stats = VEHICLES[r.vehicle ?? "kart"].stats;
      draftStep(r.kart, karts, DT, kev);
      const top =
        (r.finish !== null ? botTop(race, r) * 0.6 : botTop(race, r)) *
        (1 + COIN_SPEED * (r.coins ?? 0)) *
        (star ? ARC_SPEED : 1) *
        ((r.giantUntil ?? 0) > at ? GEANT_SPEED : 1) *
        stats.top;
      step(r.kart, plan.input, t, { top, time: at / 1000, star, vehicle: stats }, kev);
      for (const e of kev) {
        if (e === "turbo1" || e === "turbo2" || e === "turbo3") r.stats.turbos += 1;
        else if (e === "wall") r.stats.walls += 1;
      }
      pickups(race, r, x0, z0, at, events);
      if (plan.use) events.push(...useItem(race, r.id, at, plan.flip));
      progress(race, r, at, events);
      r.stateAt = at;
    }
    // Les bots se bousculent entre eux et avec les joueurs (seuls les bots sont déplacés ici)
    for (let a = 0; a < race.racers.length; a++) {
      for (let b = a + 1; b < race.racers.length; b++) {
        const ra = race.racers[a]!;
        const rb = race.racers[b]!;
        if (ra.bot || rb.bot)
          bump(
            ra.kart,
            rb.kart,
            ra.bot,
            rb.bot,
            VEHICLES[ra.vehicle ?? "kart"].stats.weight * ((ra.giantUntil ?? 0) > race.simAt ? 4 : 1),
            VEHICLES[rb.vehicle ?? "kart"].stats.weight * ((rb.giantUntil ?? 0) > race.simAt ? 4 : 1),
          );
      }
    }
  }
  return events;
}

/** Un coup : le bouclier l'arrête, sinon le kart part en tête-à-queue (chez un joueur, c'est son navigateur qui l'applique) */
function hit(race: Race, victim: Racer, by: string | null, kind: HitKind, now: number, events: BolidesEvent[]) {
  if (victim.finish !== null || victim.kart.fall > 0) return;
  // Sous l'arc-en-ciel ou la potion géante, rien ne touche ; et on ne s'acharne pas sur celui qu'on vient de renverser
  if ((victim.starUntil ?? 0) > now || (victim.giantUntil ?? 0) > now || (victim.safeUntil ?? 0) > now) return;
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
  victim.safeUntil = now + SAFE_MS;
  victim.stats.hitsTaken += 1;
  victim.coins = Math.max(0, (victim.coins ?? 0) - COIN_LOSS);
  if (by && by !== victim.id) {
    const from = racerOf(race, by);
    if (from) from.stats.hitsGiven += 1;
  }
  events.push({ type: "hit", id: victim.id, by, kind });
}

/** Se servir de son objet ; `flip` : l'envoyer dans l'autre sens (derrière soi, ou devant pour une flaque) */
export function useItem(race: Race, id: string, now: number, flip = false): BolidesEvent[] {
  const r = racerOf(race, id);
  const events: BolidesEvent[] = [];
  if (!r || !r.item || race.phase !== "racing" || r.finish !== null || r.kart.spin > 0) return events;
  const kind = r.item;
  const t = trackOf(race);
  const k = r.kart;
  // Personne à viser : on ne gâche pas l'objet
  const pie =
    kind === "tarte"
      ? tarteTarget(
          race.racers.map((o) => ({ id: o.id, dist: o.kart.dist, done: o.finish !== null, racer: o })),
          id,
          k.dist,
          flip,
        )
      : null;
  const prey = kind === "fusee" ? standings(race).find((o) => o.finish === null && o.id !== id) : undefined;
  if ((kind === "tarte" && !pie) || (kind === "fusee" && !prey)) {
    events.push({ type: "noTarget", id, item: kind });
    return events;
  }
  r.uses -= 1;
  if (r.uses <= 0) {
    // L'objet en réserve prend sa place
    r.item = r.item2 ?? null;
    r.uses = r.uses2 ?? 0;
    r.item2 = null;
    r.uses2 = 0;
  }
  r.stats.itemsUsed += 1;
  events.push({ type: "use", id, item: kind });
  if (kind === "turbo" || kind === "turbo3") {
    // Chez un joueur, son navigateur l'a déjà appliqué en appuyant
    if (r.bot) k.boost = Math.max(k.boost, TURBO_TIME);
  } else if (kind === "huile") {
    let x = k.x - Math.sin(k.h) * 3.4;
    let z = k.z - Math.cos(k.h) * 3.4;
    if (flip) {
      // Lancée devant soi, au milieu de sa voie
      const p = pointAt(t, k.s + OIL_AHEAD, Math.max(-t.half + 1.5, Math.min(t.half - 1.5, k.d)));
      x = p.x;
      z = p.z;
    }
    let at = locate(t, x, z);
    // Pas de flaque dans le vide : au-dessus d'un trou, elle atterrit sur l'autre rive
    const solid = solidGround(t, at.s);
    if (solid !== at.s) {
      const p = pointAt(t, solid, at.d);
      x = p.x;
      z = p.z;
      at = locate(t, x, z);
    }
    const hazard: Hazard = { id: ++race.seq, kind: "huile", x, z, s: at.s, d: at.d, owner: id, at: now };
    race.hazards.push(hazard);
    events.push({ type: "hazard", hazard });
  } else if (kind === "petard") {
    const d = Math.max(-t.half + 1, Math.min(t.half - 1, k.d));
    const hazard: Hazard = {
      id: ++race.seq,
      kind: "petard",
      s0: k.s + (flip ? -3 : 3),
      d,
      speed: flip ? -PETARD_SPEED : Math.max(PETARD_SPEED, k.v + 14),
      owner: id,
      at: now,
    };
    race.hazards.push(hazard);
    events.push({ type: "hazard", hazard });
  } else if (kind === "fusee") {
    // Elle va chercher le premier (ou le deuxième, si c'est le lanceur qui mène)
    const hazard: Hazard = { id: ++race.seq, kind: "fusee", dist0: k.dist + 3, target: prey!.id, owner: id, at: now };
    race.hazards.push(hazard);
    events.push({ type: "hazard", hazard });
  } else if (kind === "arc") {
    r.starUntil = now + ARC_MS;
  } else if (kind === "bowling") {
    const hazard: Hazard = {
      id: ++race.seq,
      kind: "bowling",
      s0: k.s + (flip ? -4 : 4),
      d0: Math.max(-t.half + 1.3, Math.min(t.half - 1.3, k.d)),
      speed: flip ? -BOWLING_SPEED : Math.max(BOWLING_SPEED, k.v + 10),
      side: random(race) < 0.5 ? -1 : 1,
      owner: id,
      at: now,
      struck: [],
    };
    race.hazards.push(hazard);
    events.push({ type: "hazard", hazard });
  } else if (kind === "tarte") {
    const best = pie!.racer;
    const hazard: Hazard = {
      id: ++race.seq,
      kind: "tarte",
      dist0: k.dist,
      dir: best.kart.dist >= k.dist ? 1 : -1,
      target: best.id,
      owner: id,
      at: now,
    };
    race.hazards.push(hazard);
    events.push({ type: "hazard", hazard });
  } else if (kind === "ressort") {
    // Chez un joueur, son navigateur l'a déjà fait sauter
    if (r.bot) {
      k.vy = RESSORT_VY;
      k.air = Math.max(k.air, 0.05);
      k.trick = false;
    }
  } else if (kind === "geant") {
    r.giantUntil = now + GEANT_MS;
  } else if (kind === "orage") {
    // Tous ceux qui sont devant
    for (const o of race.racers) {
      if (o === r || o.finish !== null || o.kart.dist <= k.dist) continue;
      events.push({ type: "bolt", id: o.id });
      hit(race, o, id, "orage", now, events);
    }
  } else if (kind === "aimant") {
    r.magnetUntil = now + AIMANT_MS;
  } else if (kind === "bombe") {
    const landS = solidGround(t, wrapS(t, k.s + (flip ? -BOMBE_BACK : BOMBE_AHEAD)));
    const landD = Math.max(-t.half + 1.5, Math.min(t.half - 1.5, k.d));
    const hazard: Hazard = {
      id: ++race.seq,
      kind: "bombe",
      x0: k.x,
      z0: k.z,
      y0: k.y + k.air + 1.2,
      s: landS,
      d: landD,
      owner: id,
      at: now,
    };
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
  for (const r of race.racers) {
    if (r.finish !== null) continue;
    // Sous l'arc-en-ciel on renverse ceux qu'on touche, avec la potion géante on les écrase
    const star = (r.starUntil ?? 0) > now;
    const giant = (r.giantUntil ?? 0) > now;
    if (star || giant) {
      for (const o of race.racers) {
        if (o === r || o.finish !== null || o.kart.spin > 0) continue;
        if (Math.hypot(o.kart.x - r.kart.x, o.kart.z - r.kart.z) > (giant ? GEANT_RADIUS : ARC_RADIUS)) continue;
        hit(race, o, r.id, giant ? "geant" : "arc", now, events);
      }
    }
    // L'aimant vole une pièce à celui qu'on frôle, une fois par seconde
    if ((r.magnetUntil ?? 0) > now && now - (r.stoleAt ?? 0) > 1000) {
      for (const o of race.racers) {
        if (o === r || (o.coins ?? 0) <= 0 || Math.hypot(o.kart.x - r.kart.x, o.kart.z - r.kart.z) > AIMANT_STEAL) continue;
        o.coins -= 1;
        r.coins = Math.min(COIN_MAX, (r.coins ?? 0) + 1);
        r.stoleAt = now;
        break;
      }
    }
  }
  // Les pièges : chacun touche le premier kart qui passe dessus, puis disparaît
  race.hazards = race.hazards.filter((hz) => {
    const pos = hazardPos(t, hz, now);
    if (!pos) {
      // La bombe saute à la fin de sa mèche : tout ce qui est autour part en tête-à-queue
      if (hz.kind === "bombe") {
        const at = pointAt(t, hz.s, hz.d);
        events.push({ type: "blast", x: at.x, z: at.z, by: hz.owner });
        for (const r of race.racers) {
          if (r.finish === null && r.kart.air < 2 && Math.hypot(r.kart.x - at.x, r.kart.z - at.z) <= BOMBE_RADIUS)
            hit(race, r, hz.owner, "bombe", now, events);
        }
      }
      events.push({ type: "gone", hazard: hz.id, why: "time" });
      return false;
    }
    // La bombe attend de sauter (elle ne touche personne avant)
    if (hz.kind === "bombe") return true;
    if (hz.kind === "bowling") {
      // Elle ne s'arrête pas : chacun n'est renversé qu'une fois
      for (const r of race.racers) {
        if (r.finish !== null || r.kart.spin > 0 || r.kart.air > 1.4 || hz.struck.includes(r.id)) continue;
        if (r.id === hz.owner && now - hz.at < 1200) continue;
        if (Math.hypot(r.kart.x - pos.x, r.kart.z - pos.z) > BOWLING_RADIUS + KART_RADIUS) continue;
        hz.struck.push(r.id);
        hit(race, r, hz.owner, "bowling", now, events);
      }
      return true;
    }
    if (hz.kind === "tarte") {
      const target = racerOf(race, hz.target);
      if (!target || target.finish !== null) {
        events.push({ type: "gone", hazard: hz.id, why: "time" });
        return false;
      }
      if (hz.dir * (tarteDist(hz, now) - target.kart.dist) < 0) return true;
      if (target.shieldUntil > now) {
        target.shieldUntil = 0;
        events.push({ type: "shield", id: target.id });
      } else if ((target.starUntil ?? 0) <= now && (target.giantUntil ?? 0) <= now) {
        target.pieUntil = now + PIE_MS;
        target.kart.v *= 0.7;
        events.push({ type: "pie", id: target.id, by: hz.owner });
      }
      events.push({ type: "gone", hazard: hz.id, why: "hit" });
      return false;
    }
    if (hz.kind === "fusee") {
      // Elle rattrape celui qu'elle vise (ou il est arrivé : elle se perd)
      const target = racerOf(race, hz.target);
      if (!target || target.finish !== null) {
        events.push({ type: "gone", hazard: hz.id, why: "time" });
        return false;
      }
      if (fuseeDist(hz, now) < target.kart.dist) return true;
      hit(race, target, hz.owner, "fusee", now, events);
      events.push({ type: "gone", hazard: hz.id, why: "hit" });
      return false;
    }
    const prev = hz.kind === "petard" ? (hazardPos(t, hz, now - 60) ?? pos) : pos;
    for (const r of race.racers) {
      if (r.finish !== null || r.kart.spin > 0) continue;
      if (hz.kind === "petard" && r.id === hz.owner && now - hz.at < PETARD_SAFE_MS) continue;
      if (hz.kind === "huile" && r.id === hz.owner && now - hz.at < OIL_SAFE_MS) continue;
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
