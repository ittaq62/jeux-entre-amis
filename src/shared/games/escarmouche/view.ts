// Ce que les joueurs reçoivent d'une partie : l'état d'ensemble quand il change (phase, soldats, fin), et 20 fois par
// seconde la position de tout le monde, serrée en tableaux de nombres. Chacun reçoit en plus son propre soldat en
// entier, pour se recaler sur ce que le serveur a retenu de ses pas.

import type { MapId } from "./maps.ts";
import {
  isTeamMode,
  outOfReinforcements,
  REVIVE,
  SABOTAGE,
  TEAMSPAWN,
  waitingRescue,
  type EscEvent,
  type FighterStats,
  type Match,
} from "./match.ts";
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
  /** À la fin : ce qu'a fait chacun, et ses points */
  stats: (FighterStats & { points?: number })[] | null;
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
    stats: m.phase === "over" ? m.fighters.map((f) => ({ ...f.stats, zone: Math.round(f.stats.zone), points: f.points })) : null,
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
  /** Au combat (il a tiré ou été touché il y a peu) : on ne peut pas revenir auprès de lui */
  fight: 2048,
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
  /** Conquête : par drapeau, l'équipe qui le tient (-1 personne) et sa jauge (-100 rouges, 100 bleus) */
  cq?: number[];
  /** Sabotage : par dépôt, son état (0 debout, 1 piégé, 2 détruit) et, piégé, les dixièmes de seconde avant qu'il saute */
  sb?: number[];
  /** Les grenades en vol : id, x, y, z (cm) */
  g: number[];
  /** Les ennemis repérés : par trois, la cible, l'équipe à qui elle est montrée, celui qui l'a repérée */
  mk?: number[];
  /** Les repères : par cinq, l'équipe, celui qui l'a posé, x, y, z (cm) */
  pg?: number[];
  /** Les bidons qui ont sauté (leur boîte), en attendant d'être remplacés */
  bd?: number[];
  /** Les caisses cassées (leur boîte), en attendant d'être remplacées */
  cr?: number[];
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
  /** Auprès de qui il reviendra (-1 : à la base) */
  spawnOn: number;
  /** Le coéquipier qu'il relève, et où il en est (0 à 1) */
  reviving?: [number, number];
  /** Celui qui le relève, et où il en est */
  rescue?: [number, number];
  /** Sabotage : le dépôt où il pose (ou désamorce) une charge, et où il en est (0 à 1) */
  sab?: [number, number];
  /** Tombé, il attend qu'un coéquipier tout près le relève */
  waiting?: boolean;
  /** Sabotage : tombé, plus de renforts pour revenir */
  noReinforcements?: boolean;
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
    if (m.t - f.lastFight < TEAMSPAWN.calm) bits |= PF.fight;
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
  if (m.cq) tick.cq = m.cq.pts.flatMap((p) => [p.owner, Math.round(p.v * 100)]);
  if (m.sab) tick.sb = m.sab.deps.flatMap((d) => [d.state, d.state === 1 ? Math.max(0, Math.round((d.boomAt - m.t) * 10)) : 0]);
  if (m.marks.length > 0) tick.mk = m.marks.flatMap((k) => [k.target, k.team, k.by]);
  if (m.pings.length > 0) tick.pg = m.pings.flatMap((p) => [p.team, p.by, cm(p.x), cm(p.y), cm(p.z)]);
  const down = m.barrels.filter((b) => b.downUntil > 0).map((b) => b.box);
  if (down.length > 0) tick.bd = down;
  const broken = m.crates.filter((c) => c.downUntil > 0).map((c) => c.box);
  if (broken.length > 0) tick.cr = broken;
  return tick;
}

export function encodeMe(m: Match, i: number): EscMe {
  const f = m.fighters[i]!;
  const me: EscMe = {
    i,
    s: f.s,
    hp: Math.ceil(f.hp),
    back: f.s.alive || outOfReinforcements(m, i) ? 0 : Math.max(0, f.respawnAt - m.t),
    next: f.next,
    nextSecondary: f.nextSecondary,
    spawnOn: f.spawnOn,
  };
  if (f.reviving >= 0) me.reviving = [f.reviving, Math.min(1, f.reviveT / REVIVE.time)];
  if (f.sabOn >= 0) me.sab = [f.sabOn, Math.min(1, f.sabT / (f.team === 1 ? SABOTAGE.defuse : SABOTAGE.plant))];
  const r = m.fighters.findIndex((g) => g.reviving === i);
  if (r >= 0) me.rescue = [r, Math.min(1, m.fighters[r]!.reviveT / REVIVE.time)];
  if (!f.s.alive && m.t >= f.respawnAt && waitingRescue(m, i)) me.waiting = true;
  if (!f.s.alive && outOfReinforcements(m, i)) me.noReinforcements = true;
  return me;
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
