// Les pilotes bots de Bolides : ils visent un point un peu devant eux sur la route, dans leur couloir, en coupant
// à l'intérieur des virages, évitent les flaques, dérapent pour charger un turbo quand ils savent le faire, et se
// servent de leurs objets à bon escient. Leur niveau joue sur la vitesse, la précision et la malice.

import { random, type RngHolder } from "../../rng.ts";
import type { Hazard, ItemKind } from "./items.ts";
import { driftLevel, KART_RADIUS, type Input, type Kart } from "./physics.ts";
import {
  bendAhead,
  CROSSER_HALF,
  CROSSER_RADIUS,
  crosserAt,
  deltaS,
  DROP_RADIUS,
  dropAt,
  pointAt,
  rollAt,
  wrapAngle,
  type Track,
} from "./track.ts";

export type BotLevel = "facile" | "moyen" | "fort";

interface BotStyle {
  /** La vitesse de pointe, en part de celle des joueurs */
  top: number;
  /** À quel point il coupe les virages (0 à 1) */
  line: number;
  /** Le tremblement du volant */
  wobble: number;
  /**
   * Le plus gros mini-turbo qu'il charge en dérapant (0 : il ne dérape pas). Il lâche le dérapage à ce niveau, ou
   * avant si le virage finit.
   */
  drift: 0 | 1 | 2 | 3;
  /** Le temps qu'il garde un objet avant de s'en servir, au plus, et la chance qu'il vise juste */
  hold: [number, number];
  aim: number;
}

export const BOT_STYLE: Record<BotLevel, BotStyle> = {
  facile: { top: 0.86, line: 0.3, wobble: 0.3, drift: 0, hold: [3000, 9000], aim: 0.3 },
  moyen: { top: 0.94, line: 0.7, wobble: 0.12, drift: 1, hold: [1500, 6000], aim: 0.65 },
  fort: { top: 1, line: 1, wobble: 0.04, drift: 3, hold: [600, 3500], aim: 0.95 },
};

/** Ce dont un bot se souvient d'un instant à l'autre (jamais enregistré) */
export interface BotMemory {
  lane: number;
  laneTarget: number;
  laneUntil: number;
  wobble: number;
  /** L'objet qu'il avait la dernière fois, et à partir de quand il se permet de s'en servir sans raison */
  had: ItemKind | null;
  holdUntil: number;
  /** Coincé : depuis quand il n'avance plus, et jusqu'à quand il recule */
  slowSince: number;
  reverseUntil: number;
  /** La ligne de pièces qu'il a décidé d'aller chercher (ou de laisser), jusqu'à quel endroit du tour */
  coinLane: number | null;
  coinUntil: number;
}

export function newBotMemory(h: RngHolder): BotMemory {
  return {
    lane: 0,
    laneTarget: (random(h) * 2 - 1) * 3,
    laneUntil: 0,
    wobble: random(h) * 10,
    had: null,
    holdUntil: 0,
    slowSince: 0,
    reverseUntil: 0,
    coinLane: null,
    coinUntil: -1,
  };
}

/** Ce que voit un bot des autres : où ils sont et où ils en sont de la course */
export interface Rival {
  id: string;
  kart: Kart;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Ce que fait le bot à cet instant : son volant, ses pédales, et s'il se sert de son objet */
export function botDrive(
  t: Track,
  k: Kart,
  item: ItemKind | null,
  rivals: Rival[],
  hazards: Hazard[],
  level: BotLevel,
  mem: BotMemory,
  now: number,
  h: RngHolder,
  /** Chaque pièce : l'heure où elle revient (0 : elle est là) */
  coins?: number[],
): { input: Input; use: boolean } {
  const style = BOT_STYLE[level];
  const half = t.half;
  // Son couloir change de temps en temps
  if (now > mem.laneUntil) {
    mem.laneTarget = (random(h) * 2 - 1) * 0.45 * half;
    mem.laneUntil = now + 2500 + random(h) * 4500;
  }
  mem.lane += (mem.laneTarget - mem.lane) * 0.03;
  // À l'intérieur du virage qui vient (la courbure positive tourne à gauche, et la gauche est du côté négatif)
  const bend = bendAhead(t, k.s + 6, 24);
  let lane = mem.lane - Math.sign(bend) * Math.min(1, Math.abs(bend) * 30) * half * 0.4 * style.line;
  // Une ligne de pièces devant : il décide une fois s'il va la chercher (selon son niveau), puis s'y tient
  if (coins && style.drift > 0) {
    // La ligne dépassée : on oublie la décision
    if (mem.coinUntil >= 0 && deltaS(t, k.s, mem.coinUntil) < 0) {
      mem.coinUntil = -1;
      mem.coinLane = null;
    }
    if (mem.coinUntil < 0) {
      for (const c of t.coins) {
        const ahead = deltaS(t, k.s, c.s);
        if (ahead < 15 || ahead > 40 || (coins[c.index] ?? 0) > now) continue;
        mem.coinLane = random(h) < style.aim ? c.d : null;
        mem.coinUntil = c.s + 12;
        break;
      }
    }
    if (mem.coinLane !== null) lane = mem.coinLane;
  }
  // Une flaque sur sa route : il s'en écarte
  for (const hz of hazards) {
    if (hz.kind !== "huile") continue;
    const at = hazardSpot(hz);
    const ahead = deltaS(t, k.s, at.s);
    if (ahead > 2 && ahead < 32 && Math.abs(at.d - lane) < 3.2) lane = at.d + (at.d > lane ? -3.6 : 3.6);
  }
  // Un engin qui traverse devant : il vise le côté où l'engin ne sera pas quand il passera
  for (const c of t.crossers) {
    const ahead = deltaS(t, k.s, c.s);
    if (ahead < 1 || ahead > 50) continue;
    const pos = crosserAt(c, now / 1000 + ahead / Math.max(8, k.v));
    const margin = CROSSER_HALF + CROSSER_RADIUS + KART_RADIUS + 0.9;
    const lo = pos.d - margin;
    const hi = pos.d + margin;
    if (lane > lo && lane < hi) {
      // Le côté le plus proche, s'il reste de la route ; sinon l'autre
      const left = lo > -half + 1.6;
      const right = hi < half - 1.6;
      lane = left && (!right || lane - lo < hi - lane) ? lo : right ? hi : lane;
    }
  }
  // Ce qui tombe ou dévale devant lui : même prudence
  for (const m of t.movers) {
    const ahead = deltaS(t, k.s, m.s);
    if (ahead < 1 || ahead > 50) continue;
    const when = now / 1000 + ahead / Math.max(8, k.v);
    const dodge = (d: number, r: number) => {
      const margin = r + KART_RADIUS + 0.9;
      if (lane > d - margin && lane < d + margin) {
        const left = d - margin > -half + 1.6;
        const right = d + margin < half - 1.6;
        lane = left && (!right || lane - (d - margin) < d + margin - lane) ? d - margin : right ? d + margin : lane;
      }
    };
    if (m.kind === "drop") {
      const st = dropAt(m, t.half, when);
      if (st.phase !== "none") dodge(st.d, DROP_RADIUS);
    } else {
      for (let i = 0; i < m.count; i++) {
        const d = rollAt(m, i, when);
        if (d !== null) dodge(d, m.radius);
      }
    }
  }
  // La boue : il passe à côté
  for (const z of t.zones) {
    if (z.kind !== "boue") continue;
    const ahead = deltaS(t, k.s, z.s);
    const inside = deltaS(t, z.s, k.s);
    if (!(ahead >= 0 && ahead < 34) && !(inside >= 0 && inside <= z.len)) continue;
    const left = z.d1 - 1.3;
    const right = z.d2 + 1.3;
    if (lane > left && lane < right) lane = right < half - 1.6 ? right : left;
  }
  // Pas trop près du bord : en coupant vers le point visé, il passerait sur le vibreur et dans l'herbe
  lane = clamp(lane, -half + 2.6, half - 2.6);
  const look = 8 + Math.max(0, k.v) * 0.48;
  const p = pointAt(t, k.s + look, lane);
  const err = wrapAngle(Math.atan2(p.x - k.x, p.z - k.z) - k.h);
  mem.wobble += 0.05 + random(h) * 0.02;
  // Tourner à droite fait baisser le cap : un point à droite (err < 0) demande un volant positif
  let steer = clamp(-err * 2.6 + Math.sin(mem.wobble) * style.wobble, -1, 1);

  // Coincé contre un mur : il recule un moment en braquant dans l'autre sens, puis retente d'avancer
  const reverse = { input: { steer: -steer, gas: false, brake: true, drift: false }, use: false };
  if (now < mem.reverseUntil) return reverse;
  if (k.v < 2 && k.spin === 0) {
    if (mem.slowSince === 0) mem.slowSince = now;
    else if (now - mem.slowSince > 1500) {
      mem.reverseUntil = now + 900;
      mem.slowSince = 0;
      return reverse;
    }
  } else mem.slowSince = 0;

  // Dérapage dans les longs virages, jusqu'au niveau de turbo qu'il sait atteindre
  const curve = bendAhead(t, k.s, 30);
  let drift = false;
  if (style.drift > 0 && k.v > 14 && !k.offroad) {
    if (k.drift !== 0) drift = Math.abs(curve) > 0.008 && driftLevel(k.charge) < style.drift;
    // Seulement du côté où tourne le virage (une courbure positive tourne à gauche, le volant à gauche est négatif) :
    // en contre-braquant au moment de relâcher, il partirait sinon dans l'autre sens
    else drift = Math.abs(curve) > 0.015 && Math.abs(steer) > 0.3 && steer * curve < 0;
  }
  if (k.drift !== 0 && drift) steer = clamp(steer + k.drift * 0.3, -1, 1);
  // En l'air après un tremplin : une figure (le bouton enfoncé), pour le turbo à l'atterrissage
  if (k.vy !== 0 && !k.trick && style.drift > 0) drift = !k.held;
  // Un virage trop serré pris trop vite : le bot facile freine un peu
  const brake = level === "facile" && Math.abs(err) > 0.85 && k.v > 13;
  const input: Input = { steer, gas: !brake, brake, drift };

  // Son objet
  if (item !== mem.had) {
    mem.had = item;
    mem.holdUntil = now + style.hold[0] * 0.3 + random(h) * style.hold[1];
  }
  let use = false;
  if (item && k.spin === 0) {
    const aim = random(h) < style.aim;
    const straight = Math.abs(bendAhead(t, k.s, 40)) < 0.012;
    const behind = rivals.some((r) => {
      const gap = r.kart.dist - k.dist;
      return gap < -3 && gap > -30;
    });
    const ahead = rivals.some((r) => {
      const gap = r.kart.dist - k.dist;
      return gap > 5 && gap < 45 && Math.abs(r.kart.d - k.d) < 4;
    });
    const near = rivals.some((r) => Math.hypot(r.kart.x - k.x, r.kart.z - k.z) < 8);
    const patience = now > mem.holdUntil;
    if (item === "turbo" || item === "turbo3") use = straight && !k.offroad && (patience || aim);
    else if (item === "huile") use = (behind && aim) || patience;
    else if (item === "petard") use = (ahead && aim) || patience;
    else if (item === "klaxon") use = (near && aim) || patience;
    // La fusée : tout de suite (elle va seule chercher le premier) ; l'arc-en-ciel : quand il y a du monde devant ou à côté
    else if (item === "fusee" || item === "orage") use = true;
    else if (item === "bowling" || item === "bombe") use = (ahead && aim) || patience;
    else if (item === "tarte") use = rivals.some((r) => Math.abs(r.kart.dist - k.dist) < 70) || patience;
    else if (item === "geant") use = ((ahead || near) && aim) || patience;
    // Le ressort : pour sauter par-dessus une flaque devant lui, ou quand il en a assez de le garder
    else if (item === "ressort")
      use = hazards.some((hz) => hz.kind === "huile" && deltaS(t, k.s, hz.s) > 6 && deltaS(t, k.s, hz.s) < 26) || patience;
    else if (item === "arc") use = ((ahead || near) && aim) || patience;
    else use = patience;
    // Pas deux objets dans la même seconde
    if (use) mem.holdUntil = now + 1000;
  }
  return { input, use };
}

/** Où est une flaque le long de la route (calculé à sa pose) */
export function hazardSpot(hz: Extract<Hazard, { kind: "huile" }>): { s: number; d: number } {
  return { s: hz.s, d: hz.d };
}
