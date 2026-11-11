// Ce qu'est un match de Crampons : les joueurs, le ballon, les humains aux commandes, ce qui se passe et ce qui s'est passé.

import type { Ball } from "./ball.ts";
import { clamp, DT, HALF_L, wrapAngle } from "./pitch.ts";

export type Team = 0 | 1;
export type Role = "GK" | "CB" | "LB" | "RB" | "DM" | "CM" | "AM" | "LM" | "RM" | "LW" | "RW" | "ST";

/** De 0 à 100 */
export interface Stats {
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  tac: number;
  phy: number;
  gk: number;
}

export type Act = "none" | "kick" | "tackle" | "slide" | "down" | "dive" | "header" | "hold" | "throw";

export type KickKind = "pass" | "through" | "lob" | "shot" | "finesse" | "chip" | "clear" | "cross";

export interface KickOrder {
  kind: KickKind;
  /** La force, de 0 à 1 */
  power: number;
  /** La direction voulue par le joueur (peut être nulle) */
  ax: number;
  az: number;
  /** Un coéquipier désigné d'avance, ou -1 */
  to: number;
  /** Un point visé d'avance */
  px?: number;
  pz?: number;
}

export interface Player {
  i: number;
  team: Team;
  shirt: number;
  name: string;
  role: Role;
  /** Sa place dans le dispositif : `fx` de 0 (ligne de défense) à 1 (ligne d'attaque), `fz` de -1 à 1 sur la largeur */
  fx: number;
  fz: number;
  stats: Stats;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Là où il regarde (radians, 0 vers +x) */
  h: number;
  /** Son énergie, de 0 à 1 */
  stam: number;
  act: Act;
  actT: number;
  /** La direction d'un tacle glissé ou d'un plongeon */
  dirX: number;
  dirZ: number;
  /** Le coup de pied en préparation */
  order: KickOrder | null;
  /** Il ne peut pas retoucher le ballon avant cet instant (il vient de le frapper ou de le perdre) */
  lockedUntil: number;
  /** Le gardien relance de la main jusqu'à cet instant : comme quand il tient le ballon, personne ne le charge */
  handsUntil?: number;
  /** L'identifiant de l'humain qui le dirige, ou null */
  human: string | null;
  yellow: number;
  off: boolean;
  /** Ce que le cerveau a décidé : où aller, et à quelle allure */
  tx: number;
  tz: number;
  sprint: boolean;
  /** Quand le cerveau réfléchira de nouveau, s'il a le ballon */
  thinkAt: number;
  /** Depuis quand il a le ballon */
  gotAt: number;
  /** Un appel de balle : il court vers ce point jusqu'à cet instant */
  runUntil: number;
  runX: number;
  runZ: number;
  goals: number;
  /** Le crochet : jusqu'à cet instant il file et échappe aux tacles ; le suivant n'est pas possible avant `burstReady` */
  burstUntil: number;
  burstReady: number;
  /** La vitesse à laquelle il s'est réellement déplacé au dernier pas (lissée) : c'est elle que montrent ses jambes */
  seen?: number;
  /** La force d'un plongeon (de 0,3 à 1) : il se jette juste assez loin pour mettre le ballon dans ses bras */
  diveK?: number;
}

export interface Human {
  id: string;
  team: Team;
  active: number;
  mx: number;
  mz: number;
  sprint: boolean;
  /** Il demande à son équipe de presser le porteur */
  press: boolean;
  queue: HumanAction[];
  /** Ses buts à lui, quel que soit le joueur qu'il dirigeait (absent des matchs commencés avant) */
  goals?: number;
  /** Le dernier changement de joueur, qu'il l'ait demandé ou non */
  switchAt?: number;
  /**
   * Le dernier changement fait sans lui (un coéquipier a ramassé le ballon, un autre défenseur est mieux placé), et le
   * joueur qu'il dirigeait avant : un clic parti avant qu'il ait pu le voir était pour celui-là
   */
  autoAt?: number;
  autoFrom?: number;
  /** La direction qu'il tenait à ce moment-là : tant qu'il ne la change pas, elle ne vaut pas pour le nouveau joueur */
  autoMx?: number;
  autoMz?: number;
}

/**
 * Juste après un changement de joueur fait sans lui, la touche encore enfoncée était pour l'autre : le nouveau joueur
 * continue sa course jusqu'à ce que la direction change, ou au plus ce temps-là
 */
export const AUTO_SWITCH_HOLD = 0.5;

export type HumanActionKind = KickKind | "skill" | "tackle" | "slide" | "switch" | "rush" | "skip";

/** Le temps qu'a un humain pour jouer sa remise en jeu avant que l'ordinateur ne la joue pour lui (affiché à l'écran) */
export const HUMAN_RESTART_WAIT = 8;
/** Son gardien a le ballon dans les mains : c'est à lui de relancer ; sans geste de sa part, l'ordinateur le fait après ça */
export const HUMAN_KEEPER_WAIT = 6;

/** Le ballon que le gardien tient, ou qu'il est en train de relancer de la main, ne se dispute pas */
export const inKeeperHands = (m: Match, p: Player) => p.act === "hold" || (p.handsUntil ?? -1) > m.t;

/** Le gardien lâche le ballon qu'il tenait pour le relancer : il reste intouchable le temps du geste */
export function releaseFromHands(m: Match, p: Player) {
  if (p.act === "hold") p.handsUntil = m.t + 0.8;
  p.act = "none";
}

/** Le crochet : la durée, le temps de recharge, et le gain de vitesse */
export const BURST_S = 0.34;
export const BURST_COOLDOWN = 1.6;
export const BURST_SPEED = 1.42;

export interface HumanAction {
  k: HumanActionKind;
  p: number;
  mx: number;
  mz: number;
  /** Quand l'humain a appuyé : l'action reste valable un court instant, pour une reprise de volée */
  at: number;
  /** Le coéquipier qu'il voyait désigné à l'écran au moment d'appuyer, ou -1 */
  to: number;
  /**
   * Le joueur qu'il dirigeait en appuyant : une reprise ne vaut que pour lui. Un coéquipier qui ramasse le ballon
   * juste après ne rejoue pas ce geste à sa place (absent des matchs commencés avant).
   */
  by?: number;
}

export type Phase = "kickoff" | "play" | "restart" | "goal" | "halftime" | "over";
export type RestartKind = "kickoff" | "throw" | "corner" | "goalkick" | "free" | "penalty";

export interface Restart {
  kind: RestartKind;
  team: Team;
  x: number;
  z: number;
  taker: number;
  /** Les joueurs sont en place, le tireur peut y aller */
  ready: boolean;
  readyAt: number;
  /** Au-delà, l'ordinateur tire à la place de l'humain qui tarde */
  deadline: number;
  /** Un coup franc peut viser le but directement */
  direct: boolean;
}

export interface MatchSettings {
  /** Durée d'une mi-temps, en minutes réelles */
  halfMinutes: number;
  /** Nombre de joueurs par équipe */
  side: number;
  /** Niveau de l'ordinateur, de 0 (Débutant) à 3 (Légende) */
  level: number;
  offside: boolean;
  fouls: boolean;
  /** Après un match nul : rien, tirs au but, ou prolongations puis tirs au but */
  draw: "none" | "penalties" | "extra";
}

export interface GoalRecord {
  team: Team;
  scorer: string;
  assist: string | null;
  minute: number;
  own: boolean;
}

export interface TeamStats {
  shots: number;
  onTarget: number;
  passes: number;
  passesOk: number;
  fouls: number;
  yellow: number;
  red: number;
  corners: number;
  offsides: number;
  /** En secondes de ballon au pied */
  possession: number;
}

export const newTeamStats = (): TeamStats => ({
  shots: 0,
  onTarget: 0,
  passes: 0,
  passesOk: 0,
  fouls: 0,
  yellow: 0,
  red: 0,
  corners: 0,
  offsides: 0,
  possession: 0,
});

export type WhistleReason = "goal" | "out" | "foul" | "offside" | "half" | "end" | "kickoff";

/** Ce qui vient d'arriver : le téléphone en fait des sons, des images et des messages */
export type MatchEvent =
  | { k: "kick"; p: number; power: number; kind: KickKind }
  | { k: "shot"; p: number; power: number }
  | { k: "touch"; p: number }
  | { k: "skill"; p: number }
  | { k: "tackle"; p: number; won: boolean }
  | { k: "save"; p: number; caught: boolean }
  | { k: "woodwork"; bar: boolean }
  | { k: "net" }
  | { k: "goal"; team: Team; scorer: number; assist: number; own: boolean }
  | { k: "whistle"; why: WhistleReason }
  | { k: "foul"; p: number; on: number; penalty: boolean }
  | { k: "card"; p: number; red: boolean }
  | { k: "offside"; p: number }
  | { k: "restart"; kind: RestartKind; team: Team }
  | { k: "half"; period: number }
  | { k: "penalty"; team: Team; scored: boolean }
  | { k: "end"; winner: Team | null };

export interface Shootout {
  /** Les tirs de chaque équipe : marqué ou raté */
  kicks: [boolean[], boolean[]];
  /** Quelle équipe tire maintenant */
  turn: Team;
  /** Le prochain tireur de chaque équipe, dans l'ordre de ses joueurs */
  next: [number, number];
}

export interface Match {
  settings: MatchSettings;
  seed: number;
  /** Le temps écoulé depuis le coup d'envoi, en secondes réelles de simulation */
  t: number;
  /** Le chronomètre affiché, en secondes de match */
  clock: number;
  /** 1 et 2 : les mi-temps ; 3 et 4 : les prolongations ; 5 : les tirs au but */
  period: number;
  phase: Phase;
  phaseUntil: number;
  /** Les équipes ont changé de côté */
  flipped: boolean;
  score: [number, number];
  ball: Ball;
  owner: number;
  /** Le dernier à avoir touché le ballon, et l'avant-dernier de la même équipe (pour la passe décisive) */
  lastTouch: number;
  assistBy: number;
  /** Un coup d'envoi est donné : la surface n'a plus d'importance */
  players: Player[];
  humans: Human[];
  restart: Restart | null;
  /** Les joueurs signalés hors-jeu au dernier départ de passe */
  offside: number[];
  /** La passe en cours : à qui, où elle arrive, et quand on la saura ratée */
  pass: { from: number; to: number; x: number; z: number; until: number; at: number } | null;
  stats: [TeamStats, TeamStats];
  goals: GoalRecord[];
  shootout: Shootout | null;
  /** Compte les changements de plan franc (une remise en jeu replace tout le monde d'un coup) */
  cuts: number;
  /** La dernière frappe : le gardien réagit un instant plus tard */
  shotAt: number;
  /** Son auteur : un but après un arrêt ou une déviation lui revient */
  shotBy: number;
  /**
   * Le penalty qui vient d'être frappé : son gardien a choisi son côté (-1, 1) ou reste au centre (0) ; il plonge une
   * fois, plus ou moins loin (`dive`, de 0 à 1)
   */
  spotKick?: { at: number; gk: number; guess: number; dive: number; done: boolean } | null;
  /** Les têtes de suite sans que le ballon retombe : au-delà de deux, on le laisse descendre */
  headChain?: number;
  /** Comment le gardien a lu la dernière frappe : de combien il se trompe sur l'endroit où elle arrive (en mètres) */
  keeperRead?: { shotAt: number; err: number } | null;
  /** D'où est partie la dernière frappe (sa distance au but) : de près, le gardien se fait grand */
  shotDist?: number;
  /** Pendant la fête d'un but, les humains qui ont demandé à passer le ralenti */
  skipBy?: string[];
  /** Le dernier coup de pied, et l'équipe qui l'a donné : l'adversaire met un instant à réagir */
  kickAt: number;
  kickTeam: Team;
  winner: Team | null;
  /** Le cerveau de chaque équipe ne recalcule pas à chaque pas */
  brainAt: number;
}

/** Vers quelle extrémité du terrain cette équipe attaque-t-elle (+1 ou -1) ? */
export const attackDir = (m: Match, team: Team): number => ((team === 0) !== m.flipped ? 1 : -1);

export const goalX = (m: Match, team: Team) => attackDir(m, team) * HALF_L;

export const opponent = (team: Team): Team => (team === 0 ? 1 : 0);

/** Un petit générateur de hasard rangé dans le match : un match se rejoue à l'identique à partir de sa graine */
export function random(m: Match): number {
  m.seed = (m.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(m.seed ^ (m.seed >>> 15), 1 | m.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// -------------------------------------------------------------------------
// Courir
// -------------------------------------------------------------------------

const ACCEL = 25;
const BRAKE = 44;
const TURN_RATE = 15;

/** Sa vitesse de pointe, selon qu'il sprinte, qu'il a le ballon, et l'énergie qui lui reste */
export function topSpeed(p: Player, sprint: boolean, withBall: boolean): number {
  const pace = p.stats.pac / 100;
  let v = sprint ? 8.9 + 2.9 * pace : 6.4 + 1.5 * pace;
  if (withBall) v *= sprint ? 0.88 + 0.12 * (p.stats.dri / 100) : 0.97;
  if (p.stam < 0.35) v *= 0.8 + 0.2 * (p.stam / 0.35);
  return v;
}

/**
 * Fait courir un joueur dans la direction voulue (longueur au plus 1, 0 pour s'arrêter). Il démarre vite, et un changement
 * de direction se fait avec toute la force du freinage : c'est ce qui donne un joueur vif plutôt qu'un paquebot.
 */
export function steer(p: Player, wx: number, wz: number, speed: number, dt = DT) {
  const tvx = wx * speed;
  const tvz = wz * speed;
  let dvx = tvx - p.vx;
  let dvz = tvz - p.vz;
  const dv = Math.hypot(dvx, dvz);
  // On accélère dans le sens de la course, on freine dans les autres
  const along = p.vx * tvx + p.vz * tvz;
  const current = Math.hypot(p.vx, p.vz);
  const turning = current > 1 && along < 0.9 * current * speed;
  const max = (turning || speed < current ? BRAKE : ACCEL) * dt;
  if (dv > max) {
    dvx *= max / dv;
    dvz *= max / dv;
  }
  p.vx += dvx;
  p.vz += dvz;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const v = Math.hypot(p.vx, p.vz);
  if (v > 0.4) {
    const want = Math.atan2(p.vz, p.vx);
    const rate = TURN_RATE * (1 - clamp(v / 12, 0, 0.5));
    const d = wrapAngle(want - p.h);
    p.h = wrapAngle(p.h + clamp(d, -rate * dt, rate * dt));
  }
}

/** Il se tourne vers un point, sans bouger */
export function faceTo(p: Player, x: number, z: number, dt = DT) {
  const d = wrapAngle(Math.atan2(z - p.z, x - p.x) - p.h);
  p.h = wrapAngle(p.h + clamp(d, -TURN_RATE * dt, TURN_RATE * dt));
}

/** Ce sprint lui coûte de l'énergie, le trot lui en rend ; le coût s'adapte à la durée du match */
export function spendEnergy(p: Player, sprinting: boolean, halfMinutes: number, dt = DT) {
  const v = Math.hypot(p.vx, p.vz);
  const scale = 5 / clamp(halfMinutes, 2, 15);
  const rate = sprinting && v > 7 ? -0.035 * (1.5 - p.stats.phy / 100) * scale : 0.012 * scale;
  p.stam = clamp(p.stam + rate * dt, 0, 1);
}
