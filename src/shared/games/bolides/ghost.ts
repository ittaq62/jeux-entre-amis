// Les fantômes du contre-la-montre : un bot seul sur le circuit, sans objets ni adversaires, du feu vert à l'arrivée.
// La simulation est déterministe : la course (qui en tire les temps à battre) et le jeu (qui en rejoue le tracé en
// transparence) refont exactement la même. Bronze : un bot facile, argent : moyen, or : fort.

import { BOT_STYLE, botDrive, newBotMemory, type BotLevel } from "./bot.ts";
import { beginRescue, CLASS_SPEED, DT, newKart, step, type Kart } from "./physics.ts";
import { getTrack, gridSlot, type Track, type TrackId } from "./track.ts";

export type GhostMedal = "bronze" | "argent" | "or";
export const GHOST_MEDALS: GhostMedal[] = ["bronze", "argent", "or"];
export const GHOST_LEVEL: Record<GhostMedal, BotLevel> = { bronze: "facile", argent: "moyen", or: "fort" };
export const GHOST_NAMES: Record<GhostMedal, string> = { bronze: "Fantôme de bronze", argent: "Fantôme d'argent", or: "Fantôme d'or" };

/** Le tracé est noté toutes les 100 ms : position, cap, hauteur */
export const GHOST_EVERY_MS = 100;
/** Un bot qui n'avance plus appelle le drone, comme en course */
const STALL_MS = 3500;
/** Au-delà, la course du fantôme s'arrête (un circuit qu'il ne saurait pas finir) */
const MAX_MS = 10 * 60_000;

export interface GhostRun {
  medal: GhostMedal;
  /** Le temps de chaque tour, en ms */
  laps: number[];
  total: number;
  /** x, z, cap, hauteur, tous les GHOST_EVERY_MS depuis le feu vert */
  path: Float32Array;
}

const cache = new Map<string, GhostRun>();

/** La course du fantôme de cette médaille, sur ce circuit (calculée une fois, puis gardée) */
export function ghostRun(id: TrackId, medal: GhostMedal, laps = 3): GhostRun {
  const key = `${id}:${medal}:${laps}`;
  const known = cache.get(key);
  if (known) return known;
  const run = simulateGhost(getTrack(id), medal, laps);
  cache.set(key, run);
  return run;
}

/** Les trois temps à battre sur ce circuit, du bronze à l'or */
export function ghostTargets(id: TrackId, laps = 3): Record<GhostMedal, number> {
  return { bronze: ghostRun(id, "bronze", laps).total, argent: ghostRun(id, "argent", laps).total, or: ghostRun(id, "or", laps).total };
}

/** Les étoiles d'un temps : une par fantôme battu */
export function chronoStars(id: TrackId, ms: number, laps = 3): 0 | 1 | 2 | 3 {
  const targets = ghostTargets(id, laps);
  return GHOST_MEDALS.filter((m) => ms <= targets[m]).length as 0 | 1 | 2 | 3;
}

/** Où est le fantôme `ms` après le feu vert (null : arrivé) */
export function ghostAt(run: GhostRun, ms: number): { x: number; z: number; h: number; y: number } | null {
  if (ms < 0) ms = 0;
  const n = run.path.length / 4;
  const f = ms / GHOST_EVERY_MS;
  const i = Math.floor(f);
  if (i >= n - 1) return null;
  const a = i * 4;
  const b = a + 4;
  const u = f - i;
  const p = run.path;
  // Le cap passe par le plus court chemin
  let dh = p[b + 2]! - p[a + 2]!;
  if (dh > Math.PI) dh -= Math.PI * 2;
  else if (dh < -Math.PI) dh += Math.PI * 2;
  return {
    x: p[a]! + (p[b]! - p[a]!) * u,
    z: p[a + 1]! + (p[b + 1]! - p[a + 1]!) * u,
    h: p[a + 2]! + dh * u,
    y: p[a + 3]! + (p[b + 3]! - p[a + 3]!) * u,
  };
}

/** La course du fantôme, refaite à chaque appel (ghostRun la garde) */
export function simulateGhost(t: Track, medal: GhostMedal, laps: number): GhostRun {
  const level = GHOST_LEVEL[medal];
  const slot = gridSlot(t, 0);
  const k: Kart = newKart(t, slot.x, slot.z, slot.h);
  // La même graine partout : la même course, au serveur comme dans le jeu
  const h = { rng: 0x5eed + GHOST_MEDALS.indexOf(medal) };
  const mem = newBotMemory(h);
  const top = CLASS_SPEED.normal * BOT_STYLE[level].top;
  const samples: number[] = [];
  const lapTimes: number[] = [];
  let lapStart = 0;
  let stallAt = 0;
  let stallDist = k.dist;
  let ms = 0;
  let nextSample = 0;
  const dtMs = DT * 1000;
  while (ms < MAX_MS) {
    if (ms >= nextSample) {
      samples.push(k.x, k.z, k.h, k.y + k.air);
      nextSample += GHOST_EVERY_MS;
    }
    // Il n'avance plus : le drone vient le chercher
    if (k.rescue > 0 || k.fall > 0) {
      stallAt = ms;
      stallDist = k.dist;
    } else if (ms - stallAt >= STALL_MS) {
      if (k.spin === 0 && k.dist - stallDist < 6) beginRescue(t, k);
      stallAt = ms;
      stallDist = k.dist;
    }
    const plan = botDrive(t, k, null, [], [], level, mem, ms, h);
    step(k, plan.input, t, { top, time: ms / 1000 });
    ms += dtMs;
    const done = Math.floor((k.dist + 0.01) / t.length);
    while (done > lapTimes.length && lapTimes.length < laps) {
      lapTimes.push(Math.round(ms - lapStart));
      lapStart = ms;
    }
    if (lapTimes.length >= laps) break;
  }
  samples.push(k.x, k.z, k.h, k.y + k.air);
  return { medal, laps: lapTimes, total: Math.round(ms), path: Float32Array.from(samples) };
}
