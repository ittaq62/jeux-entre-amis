// Ce que les joueurs reçoivent de la course : l'état d'ensemble à chaque changement (objets, tours, arrivées),
// et, plusieurs fois par seconde, la position de tous les karts, serrée en petits tableaux de nombres.

import type { BotLevel } from "./bot.ts";
import type { SkinId, VehicleId } from "./garage.ts";
import type { Hazard, ItemKind } from "./items.ts";
import type { Kart } from "./physics.ts";
import type { BolidesSettings, Race, RacerStats } from "./race.ts";
import { standings } from "./race.ts";
import type { TrackId } from "./track.ts";

/**
 * Un kart en petit : x, z, cap, vitesse, glissement, hauteur, distance, dérapage, charge, turbo, tête-à-queue, saut,
 * écart, la hauteur en l'air, et une figure en cours (1)
 */
export type KartNet = number[];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function encodeKart(k: Kart): KartNet {
  return [
    r2(k.x),
    r2(k.z),
    r3(k.h),
    r2(k.v),
    r2(k.slip),
    r2(k.y),
    r2(k.dist),
    k.drift,
    r2(k.charge),
    r2(k.boost),
    r2(k.spin),
    r2(k.hop),
    r2(k.d),
    r2(k.air),
    k.trick ? 1 : 0,
  ];
}

/** Un kart reçu, complété de ce qui ne voyage pas (l'échantillon de route est recalculé) */
export function decodeKart(n: KartNet, base?: Kart): Kart | null {
  if (!Array.isArray(n) || n.length < 13 || n.some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  const at = (i: number, lo = -1e6, hi = 1e6) => Math.max(lo, Math.min(hi, n[i]!));
  const drift = at(7);
  return {
    x: at(0),
    z: at(1),
    h: at(2, -10, 10),
    v: at(3, -20, 60),
    slip: at(4, -30, 30),
    y: at(5, -100, 300),
    dist: at(6),
    drift: drift > 0 ? 1 : drift < 0 ? -1 : 0,
    charge: at(8, 0, 10),
    boost: at(9, 0, 3),
    spin: at(10, 0, 2),
    hop: at(11, 0, 1),
    d: at(12, -100, 100),
    i: base?.i ?? -1,
    s: base?.s ?? 0,
    offroad: base?.offroad ?? false,
    // La hauteur au-dessus de la route ; la vitesse verticale ne voyage pas (le serveur fait retomber un absent)
    air: n.length > 13 ? at(13, 0, 5) : 0,
    vy: 0,
    trick: n.length > 14 ? n[14]! > 0 : false,
    held: base?.held ?? false,
  };
}

export interface RacerView {
  id: string;
  /** Sa place dans le classement en cours */
  place: number;
  laps: number;
  item: ItemKind | null;
  uses: number;
  shieldUntil: number;
  /** L'arc-en-ciel, la potion géante, l'aimant, la crème sur l'écran : jusqu'à quand */
  starUntil: number;
  giantUntil: number;
  magnetUntil: number;
  pieUntil: number;
  lapStart: number;
  finish: number | null;
  /** Conduit par le serveur (un bot, ou le relais d'un absent) */
  bot: boolean;
  coins: number;
  vehicle: VehicleId;
  skin: SkinId;
  stats: RacerStats;
}

export interface BolidesView {
  settings: BolidesSettings & { botLevel: BotLevel };
  track: TrackId;
  phase: Race["phase"];
  goAt: number;
  endAt: number | null;
  racers: RacerView[];
  /** Les karts dans l'ordre de `racers` */
  karts: KartNet[];
  boxes: number[];
  hazards: Hazard[];
  ranking: string[] | null;
  ranks: Record<string, number> | null;
}

export function bolidesView(race: Race): BolidesView {
  const order = standings(race).map((r) => r.id);
  return {
    settings: race.settings,
    track: race.track,
    phase: race.phase,
    goAt: race.goAt,
    endAt: race.endAt,
    racers: race.racers.map((r) => ({
      id: r.id,
      place: order.indexOf(r.id) + 1,
      laps: r.laps,
      item: r.item,
      uses: r.uses,
      shieldUntil: r.shieldUntil,
      starUntil: r.starUntil ?? 0,
      giantUntil: r.giantUntil ?? 0,
      magnetUntil: r.magnetUntil ?? 0,
      pieUntil: r.pieUntil ?? 0,
      lapStart: r.lapStart,
      finish: r.finish,
      bot: r.bot,
      coins: r.coins ?? 0,
      vehicle: r.vehicle ?? "kart",
      skin: r.skin ?? "usine",
      stats: r.stats,
    })),
    karts: race.racers.map((r) => encodeKart(r.kart)),
    boxes: race.boxes,
    hazards: race.hazards,
    ranking: race.ranking,
    ranks: race.ranks,
  };
}
