// Ce que les joueurs reçoivent d'une partie : l'état d'ensemble quand il change (phase, soldats, fin), et 20 fois par
// seconde la position de tout le monde, serrée en tableaux de nombres. Chacun reçoit en plus son propre soldat en
// entier, pour se recaler sur ce que le serveur a retenu de ses pas.

import type { MapId } from "./maps.ts";
import { isTeamMode, type EscEvent, type FighterStats, type Match } from "./match.ts";
import type { EscarmoucheSettings, Mode } from "./rules.ts";
import type { Soldier } from "./soldier.ts";
import { WEAPON_IDS, type PrimaryId, type SecondaryId, type WeaponId } from "./weapons.ts";

/** L'état d'ensemble : il change rarement */
export interface EscarmoucheView {
  map: MapId;
  mode: Mode;
  settings: EscarmoucheSettings;
  phase: Match["phase"];
  liveAt: number;
  endAt: number;
  goal: number;
  fighters: { id: string; team: number; bot: boolean }[];
  winner: number | null;
  ranks: number[] | null;
  /** À la fin : ce qu'a fait chacun */
  stats: FighterStats[] | null;
}

export function escarmoucheView(m: Match): EscarmoucheView {
  return {
    map: m.map,
    mode: m.mode,
    settings: m.settings,
    phase: m.phase,
    liveAt: m.liveAt,
    endAt: m.endAt,
    goal: m.goal,
    fighters: m.fighters.map((f) => ({ id: f.id, team: f.team, bot: f.bot })),
    winner: m.winner,
    ranks: m.ranks,
    stats: m.phase === "over" ? m.fighters.map((f) => ({ ...f.stats, zone: Math.round(f.stats.zone) })) : null,
  };
}

/** Ce qui justifie d'envoyer à tous l'état d'ensemble */
export function stateKey(m: Match): string {
  return [m.phase, m.fighters.map((f) => `${f.id}:${f.team}:${f.bot ? 1 : 0}`).join(","), m.ranks?.join(",") ?? ""].join("|");
}

/** Les drapeaux d'un soldat, dans `p` */
export const PF = {
  alive: 1,
  crouch: 2,
  ads: 4,
  sprint: 8,
  ground: 16,
  shield: 32,
  reload: 64,
  busy: 128,
  carry: 256,
  slide: 512,
  mantle: 1024,
} as const;

/** Par soldat dans `p` : x, y, z (cm), yaw, pitch (millièmes), drapeaux, arme en main, santé, drapeau porté + 1, coups tirés */
export const P_STRIDE = 10;
/** Par soldat dans `sc` : éliminations, morts, points, passes décisives */
export const SC_STRIDE = 4;

export interface EscTick {
  /** L'heure de la partie (s) */
  s: number;
  p: number[];
  /** Le dernier pas joué de chaque soldat (les humains y retrouvent le leur) */
  k: number[];
  sc: number[];
  /** Le score des deux équipes */
  ts: [number, number];
  /** Les drapeaux : pour chacun, où il est (0 chez lui, 1 porté, 2 tombé), son porteur, x, y, z (cm) */
  f?: number[];
  /** La zone : l'équipe qui la tient (-1 personne), disputée (1) ou non */
  z?: [number, number];
  /** Les grenades en vol : id, x, y, z (cm) */
  g: number[];
  e: EscEvent[];
}

/** Son propre soldat, en entier, avec sa santé et son prochain retour au combat */
export interface EscMe {
  i: number;
  s: Soldier;
  hp: number;
  /** Secondes de partie avant son retour, s'il est hors combat */
  back: number;
  next: PrimaryId;
  nextSecondary: SecondaryId;
}

const cm = (v: number) => Math.round(v * 100);

export function encodeTick(m: Match, events: EscEvent[]): EscTick {
  const p: number[] = [];
  const sc: number[] = [];
  for (const f of m.fighters) {
    const s = f.s;
    let bits = 0;
    if (s.alive) bits |= PF.alive;
    if (s.crouch) bits |= PF.crouch;
    if (s.ads) bits |= PF.ads;
    if (s.sprint) bits |= PF.sprint;
    if (s.ground) bits |= PF.ground;
    if (f.shieldUntil > m.t) bits |= PF.shield;
    if (s.reloadEnd > 0) bits |= PF.reload;
    if (s.throwEnd > s.clock || s.meleeEnd > s.clock || s.switchEnd > s.clock) bits |= PF.busy;
    if (f.carrying >= 0) bits |= PF.carry;
    if (s.slideEnd > s.clock) bits |= PF.slide;
    if (s.mantleEnd > 0) bits |= PF.mantle;
    const weapon: WeaponId = s.slot === 0 ? s.primary : s.secondary;
    p.push(
      cm(s.x),
      cm(s.y),
      cm(s.z),
      Math.round(s.yaw * 1000),
      Math.round(s.pitch * 1000),
      bits,
      WEAPON_IDS.indexOf(weapon),
      Math.ceil(f.hp),
      f.carrying + 1,
      s.shots,
    );
    sc.push(f.stats.kills, f.stats.deaths, f.points, f.stats.assists);
  }
  const tick: EscTick = {
    s: Math.round(m.t * 1000) / 1000,
    p,
    k: m.fighters.map((f) => f.s.seq),
    sc,
    ts: [m.scores[0], m.scores[1]],
    g: m.grenades.flatMap((g) => [g.id, cm(g.x), cm(g.y), cm(g.z)]),
    e: events,
  };
  if (m.flags) tick.f = m.flags.flatMap((F) => [F.at === "home" ? 0 : F.at === "carried" ? 1 : 2, F.carrier, cm(F.x), cm(F.y), cm(F.z)]);
  if (m.zone) tick.z = [m.zone.owner, m.zone.contested ? 1 : 0];
  return tick;
}

export function encodeMe(m: Match, i: number): EscMe {
  const f = m.fighters[i]!;
  return {
    i,
    s: f.s,
    hp: Math.ceil(f.hp),
    back: f.s.alive ? 0 : Math.max(0, f.respawnAt - m.t),
    next: f.next,
    nextSecondary: f.nextSecondary,
  };
}

/** Un soldat lu dans `p` */
export interface FighterNet {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  bits: number;
  weapon: WeaponId;
  hp: number;
  /** Le drapeau porté (l'équipe à qui il est), -1 sinon */
  carrying: number;
  shots: number;
}

export function readFighter(p: readonly number[], i: number): FighterNet {
  const k = i * P_STRIDE;
  return {
    x: p[k]! / 100,
    y: p[k + 1]! / 100,
    z: p[k + 2]! / 100,
    yaw: p[k + 3]! / 1000,
    pitch: p[k + 4]! / 1000,
    bits: p[k + 5]!,
    weapon: WEAPON_IDS[p[k + 6]!] ?? "fa",
    hp: p[k + 7]!,
    carrying: p[k + 8]! - 1,
    shots: p[k + 9]!,
  };
}

/** Le nom de l'équipe d'un soldat, ou null en chacun pour soi */
export function teamOf(view: EscarmoucheView, i: number): number | null {
  return isTeamMode(view.mode) ? (view.fighters[i]?.team ?? null) : null;
}
