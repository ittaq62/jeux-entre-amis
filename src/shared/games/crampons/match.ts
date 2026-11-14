// Le déroulement d'un match : courir, toucher le ballon, tacler, siffler, reprendre le jeu, marquer, changer de côté.

import { BALL_R, GRAVITY, makeBall, rollingAt, stepBall } from "./ball.ts";
import { keeperReadsShot, shapeSpot, steerCarrier, thinkCarrier, thinkTeam, tuning } from "./brain.ts";
import { makeSquad, type TeamSetup } from "./clubs.ts";
import { openness, orderKick, pickReceiver, pressureOn, releaseKick } from "./kicks.ts";
import {
  attackDir,
  BURST_COOLDOWN,
  BURST_S,
  BURST_SPEED,
  AUTO_SWITCH_HOLD,
  HUMAN_KEEPER_WAIT,
  HUMAN_RESTART_WAIT,
  faceTo,
  inKeeperHands,
  releaseFromHands,
  newTeamStats,
  opponent,
  random,
  spendEnergy,
  steer,
  topSpeed,
  type Human,
  type HumanAction,
  type KickKind,
  type KickOrder,
  type Match,
  type MatchEvent,
  type MatchSettings,
  type Player,
  type RestartKind,
  type Team,
  type FoulKind,
  assisted,
  AUTO_SWITCH_BLIND,
} from "./model.ts";
import { BOX_HALF, BOX_L, CIRCLE_R, clamp, DT, GOAL_H, GOAL_HALF, HALF_L, HALF_W, inBox, lerp, onPitch, SIX_L, SPOT_L } from "./pitch.ts";

const REACH = 0.95;
/** La vitesse d'un gardien qui se décale face à une frappe */
const KEEPER_SHUFFLE = 3.3;
/** Le gardien qui se replace : au petit trot quand le jeu est loin, à pas mesurés quand il approche */
const KEEPER_JOG = 3;
const KEEPER_STEP = 5.4;
/** Celui à qui la passe est destinée la contrôle d'un peu plus loin : elle doit arriver dans ses pieds */
const RECEIVE_REACH = 1.45;
const HEADER_REACH = 1.05;
/** Deux joueurs ne se marchent pas dessus : leurs corps (épaules et bras) se touchent à peine */
const SEPARATION = 1.0;
/** La marche de ceux qui viennent d'encaisser un but */
const CONCEDED_WALK = 1.5;
/** Pendant la fête d'un but, chacun garde cette place autour de lui */
const ROOM = 1.25;
/** Et l'écart forcé, s'il en faut un, reste petit : un joueur poussé glisse à l'image sans bouger les jambes */
const GOAL_PUSH = 0.03;
const FIRST_TIME_WINDOW = 0.45;
const KEEPER_HOLD_S = 2.2;
const TACKLE_S = 0.36;
const TACKLE_HIT_AT = 0.14;
const SLIDE_S = 0.6;
const DOWN_S = 0.6;
/** La célébration, puis le ralenti : on peut passer dès qu'on a vu son but */
const GOAL_PAUSE = 7.6;
const GOAL_SKIP_AFTER = 2;
/** Le receveur d'un humain court seul vers le ballon, mais pas plus longtemps que ça : ensuite, les touches reprennent la main */
const RECEIVE_AUTO_S = 2.2;
const HALFTIME_PAUSE = 2.5;
/** Le gardien qui tient le ballon ne le relâche pas au moindre clic qui traînait : il le garde au moins ça */
const KEEPER_MIN_HOLD = 0.45;
/** Après une faute, le jeu s'arrête vraiment : le joueur au sol, l'arbitre, le carton, avant que chacun se replace */
const FOUL_PAUSE = 2.3;
const CARD_PAUSE = 1.5;
/** Le joueur au sol après une faute y reste un moment */
const FOULED_DOWN_S = 1.9;
/** Le tireur d'une touche, d'un six mètres ou d'un coup franc va chercher le ballon à pied : au-delà, on change de plan */
const WALK_MAX = 5;
/** Arrivé à moins de ça du ballon, il y est */
const WALK_ARRIVED = 0.4;
/** Un exclu met au plus ce temps à sortir du terrain */
const LEAVE_S = 9;

const KICK_KINDS: readonly string[] = ["pass", "through", "lob", "shot", "finesse", "chip", "clear", "cross"];
const isKick = (k: string): k is KickKind => KICK_KINDS.includes(k);

export function createMatch(
  settings: MatchSettings,
  teams: [TeamSetup, TeamSetup],
  humans: { id: string; team: Team }[],
  seed: number,
): Match {
  const side = settings.side;
  const home = makeSquad(0, teams[0], side, seed ^ 0x1234, 0);
  const players = [
    ...home,
    ...makeSquad(
      1,
      teams[1],
      side,
      seed ^ 0x9876,
      side,
      home.map((p) => p.name),
    ),
  ];
  const m: Match = {
    settings,
    seed,
    t: 0,
    clock: 0,
    period: 1,
    phase: "kickoff",
    phaseUntil: 0,
    flipped: false,
    score: [0, 0],
    ball: makeBall(),
    owner: -1,
    lastTouch: -1,
    assistBy: -1,
    players,
    humans: humans.map((h) => ({ id: h.id, team: h.team, active: -1, mx: 0, mz: 0, sprint: false, press: false, queue: [] })),
    restart: null,
    offside: [],
    pass: null,
    stats: [newTeamStats(), newTeamStats()],
    goals: [],
    shootout: null,
    cuts: 0,
    shotAt: -10,
    shotBy: -1,
    kickAt: -10,
    kickTeam: 0,
    winner: null,
    brainAt: 0,
  };
  beginKickoff(m, 0, []);
  for (const h of m.humans) pickActive(m, h);
  return m;
}

// -------------------------------------------------------------------------
// Les humains
// -------------------------------------------------------------------------

function syncHumans(m: Match) {
  for (const p of m.players) p.human = null;
  for (const h of m.humans) if (h.active >= 0) m.players[h.active]!.human = h.id;
}

/**
 * Donne à cet humain le joueur libre le plus proche du ballon (hors gardien), ou de l'endroit indiqué (là où retombera
 * un dégagement), en évitant celui qu'il dirige déjà si demandé
 */
function pickActive(m: Match, h: Human, avoid = -1, at?: readonly [number, number]) {
  const taken = new Set(m.humans.filter((o) => o !== h).map((o) => o.active));
  const [ax, az] = at ?? [m.ball.x, m.ball.z];
  let best = -1;
  let bd = Infinity;
  for (const p of m.players) {
    if (p.team !== h.team || p.off || p.role === "GK" || taken.has(p.i) || p.i === avoid) continue;
    const d = Math.hypot(p.x - ax, p.z - az);
    if (d < bd) {
      bd = d;
      best = p.i;
    }
  }
  if (best >= 0) h.active = best;
  syncHumans(m);
}

/**
 * Le ballon arrive à un coéquipier : si personne ne le dirige, l'humain le prend. Son gardien aussi, dans le jeu : c'est
 * lui qui choisit la relance (pas aux tirs au but, où le gardien n'est à personne).
 */
function followBall(m: Match, id: number) {
  const p = m.players[id]!;
  if (p.human !== null || (p.role === "GK" && (m.shootout || m.phase !== "play"))) return;
  const h = m.humans.find((o) => o.team === p.team);
  if (!h) return;
  // Avec plusieurs humains dans l'équipe, c'est celui qui est le plus près
  const best = m.humans
    .filter((o) => o.team === p.team)
    .map((o) => ({ o, d: Math.hypot(m.players[o.active]!.x - p.x, m.players[o.active]!.z - p.z) }))
    .sort((a, b) => a.d - b.d)[0];
  if (best) {
    autoSwitch(m, best.o, p.i);
    // Un clic donné pour le joueur d'avant ne fait pas relancer le gardien
    if (p.role === "GK") best.o.queue = [];
  }
  syncHumans(m);
}

/** Change de joueur sans que l'humain l'ait demandé, en gardant trace de celui qu'il dirigeait */
function autoSwitch(m: Match, h: Human, to: number) {
  if (h.active === to) return;
  h.autoFrom = h.active;
  h.active = to;
  h.autoAt = m.t;
  h.switchAt = m.t;
  h.autoMx = h.mx;
  h.autoMz = h.mz;
}

/** La touche qu'il tient encore était pour son joueur d'avant : le nouveau n'en tient pas compte tant qu'elle ne change pas */
function stickFromBefore(m: Match, h: Human): boolean {
  if (h.autoAt === undefined || m.t - h.autoAt >= AUTO_SWITCH_HOLD) return false;
  return Math.hypot(h.mx - (h.autoMx ?? 0), h.mz - (h.autoMz ?? 0)) < 0.35;
}

/** Là où le ballon qui vient de partir retombera, à peu près : on y donne la main au coéquipier le mieux placé */
function landingSpot(m: Match): [number, number] {
  const b = m.ball;
  const t = b.vy > 0 ? (2 * b.vy) / GRAVITY : 0.6;
  return onPitch(b.x + b.vx * t, b.z + b.vz * t, 2);
}

/** Son gardien quitte le ballon : l'humain retrouve un joueur de champ, près de l'endroit où va le ballon */
function leaveKeeper(m: Match, p: Player) {
  if (p.role !== "GK") return;
  for (const o of m.humans) if (o.active === p.i) pickActive(m, o, -1, landingSpot(m));
}

/**
 * Ce que fait le geste d'un humain. Son gardien ne tire pas au but depuis son camp : sa frappe est un dégagement, et
 * toujours vers l'avant (une touche encore enfoncée vers son propre but ne l'y enverra pas). Seul le penalty se tire.
 */
function humanOrder(m: Match, p: Player, a: HumanAction): KickOrder {
  const kind = a.k as KickKind;
  const shot = kind === "shot" || kind === "finesse" || kind === "chip";
  if (p.role !== "GK" || !shot || (m.restart?.kind === "penalty" && m.restart.taker === p.i)) {
    return { kind, power: a.p, ax: a.mx, az: a.mz, to: a.to };
  }
  const dir = attackDir(m, p.team);
  const l = Math.hypot(a.mx, a.mz);
  let ax = l > 0.2 ? a.mx / l : dir;
  let az = l > 0.2 ? a.mz / l : 0;
  if (ax * dir < 0.5) {
    ax = dir * 0.8;
    az = (Math.sign(az) || 1) * 0.6;
  }
  return { kind: "clear", power: a.p, ax, az, to: -1 };
}

/** Un humain revient : il reprend un joueur de son équipe */
export function addHuman(m: Match, id: string, team: Team) {
  if (m.humans.some((h) => h.id === id)) return;
  const h: Human = { id, team, active: -1, mx: 0, mz: 0, sprint: false, press: false, queue: [] };
  m.humans.push(h);
  pickActive(m, h);
}

/** Un humain s'en va : l'ordinateur reprend son joueur */
export function dropHuman(m: Match, id: string) {
  m.humans = m.humans.filter((h) => h.id !== id);
  syncHumans(m);
}

/**
 * L'adversaire vient de prendre le ballon : l'humain reprend un défenseur mieux placé, mais seulement si le sien est
 * loin ou déjà dépassé, et pas plus d'une fois par seconde. Changer sans cesse de joueur, c'est le perdre de vue, et
 * courir n'importe où avec la touche qu'on tenait pour l'autre.
 */
function defendSwitch(m: Match, owner: Player) {
  for (const h of m.humans) {
    if (h.team === owner.team || m.t - (h.switchAt ?? -9) < 1) continue;
    const current = m.players[h.active];
    const gx = -attackDir(m, h.team) * HALF_L;
    const toGoal = (q: { x: number; z: number }) => Math.hypot(gx - q.x, q.z);
    const here = current ? Math.hypot(current.x - owner.x, current.z - owner.z) : Infinity;
    const beaten = !current || toGoal(current) > toGoal(owner) + 2;
    if (here < 9 && !beaten) continue;
    const taken = new Set(m.humans.filter((o) => o !== h).map((o) => o.active));
    let best = -1;
    let bd = Infinity;
    let bScore = Infinity;
    for (const p of m.players) {
      if (p.team !== h.team || p.off || p.role === "GK" || taken.has(p.i)) continue;
      const d = Math.hypot(p.x - owner.x, p.z - owner.z);
      // Entre deux défenseurs aussi proches, celui qui est entre le porteur et le but
      const score = d + (toGoal(p) < toGoal(owner) ? 0 : 4);
      if (score < bScore) {
        bScore = score;
        bd = d;
        best = p.i;
      }
    }
    if (best >= 0 && bd < here - 4) autoSwitch(m, h, best);
  }
  syncHumans(m);
}

export function setInput(m: Match, id: string, mx: number, mz: number, sprint: boolean, press: boolean) {
  const h = m.humans.find((o) => o.id === id);
  if (!h) return;
  const l = Math.hypot(mx, mz);
  h.mx = l > 1 ? mx / l : mx;
  h.mz = l > 1 ? mz / l : mz;
  h.sprint = sprint;
  h.press = press;
  if (l > 0.15 || sprint || press) h.inputAt = m.t;
}

export function pushAction(m: Match, id: string, k: HumanAction["k"], p: number, mx: number, mz: number, to = -1) {
  const h = m.humans.find((o) => o.id === id);
  if (!h || h.queue.length > 6) return;
  h.inputAt = m.t;
  const blind = h.autoAt !== undefined && h.autoFrom !== undefined && m.t - h.autoAt < AUTO_SWITCH_BLIND;
  h.queue.push({ k, p: clamp(p, 0, 1), mx, mz, at: m.t, to: Number.isInteger(to) ? to : -1, by: blind ? h.autoFrom : h.active });
}

/** Ce geste a-t-il été demandé pour ce joueur-là ? (pas pour celui qu'il dirigeait juste avant) */
const meantFor = (a: HumanAction, p: Player) => a.by === undefined || a.by === p.i;

function startTackle(p: Player, slide: boolean, h: Human | null, m: Match) {
  if (p.act !== "none") return;
  if (slide) {
    const l = Math.hypot(h?.mx ?? 0, h?.mz ?? 0);
    p.act = "slide";
    p.actT = SLIDE_S;
    if (l > 0.1 && h) {
      p.dirX = h.mx / l;
      p.dirZ = h.mz / l;
    } else {
      const bx = m.ball.x - p.x;
      const bz = m.ball.z - p.z;
      const b = Math.hypot(bx, bz) || 1;
      p.dirX = bx / b;
      p.dirZ = bz / b;
    }
  } else {
    p.act = "tackle";
    p.actT = TACKLE_S;
    const bx = m.ball.x - p.x;
    const bz = m.ball.z - p.z;
    const b = Math.hypot(bx, bz) || 1;
    p.dirX = bx / b;
    p.dirZ = bz / b;
  }
}

/** Applique les boutons pressés. Une frappe demandée juste avant d'avoir le ballon reste en attente : c'est la reprise. */
function runHumanActions(m: Match, ev: MatchEvent[]) {
  for (const h of m.humans) {
    const keep: HumanAction[] = [];
    for (const a of h.queue) {
      const p = m.players[h.active];
      if (!p) continue;
      if (a.k === "switch") {
        // On ne quitte pas un joueur qui a le ballon : on le perdrait aussitôt
        if (m.owner !== h.active) {
          pickActive(m, h, h.active);
          h.switchAt = m.t;
        }
        continue;
      }
      if (m.phase === "restart") {
        const r = m.restart;
        if (r && r.ready && r.taker === p.i && isKick(a.k) && !p.order) {
          orderRestartKick(m, p, a);
        }
        continue;
      }
      if (m.phase !== "play" && m.phase !== "kickoff") continue;
      if (a.k === "skill") {
        // Le crochet : un coup d'accélération balle au pied, le temps d'échapper au tacle
        if (m.phase === "play" && m.owner === p.i && p.act === "none" && m.t >= p.burstReady) {
          p.burstUntil = m.t + BURST_S;
          p.burstReady = m.t + BURST_COOLDOWN;
          ev.push({ k: "skill", p: p.i });
        }
        continue;
      }
      if (m.phase === "kickoff") {
        const r = m.restart;
        if (r && r.ready && r.taker === p.i && isKick(a.k) && !p.order) orderRestartKick(m, p, a);
        continue;
      }
      // Un geste demandé pour un autre joueur (on dirigeait quelqu'un d'autre en appuyant) ne se rejoue pas sur celui-ci
      if (isKick(a.k) && !meantFor(a, p)) continue;
      if (m.owner === p.i && isKick(a.k)) {
        // Son gardien relâche le ballon qu'il tient pour le relancer ; tout juste capté, le geste attend un instant
        const holding = p.act === "hold";
        if (holding && m.t - p.gotAt < KEEPER_MIN_HOLD) keep.push(a);
        else if (!p.order && (p.act === "none" || holding)) {
          releaseFromHands(m, p);
          orderKick(p, humanOrder(m, p, a));
        }
        continue;
      }
      if (isKick(a.k)) {
        if (m.t - a.at < FIRST_TIME_WINDOW) keep.push(a);
        continue;
      }
      if (a.k === "tackle") startTackle(p, false, h, m);
      else if (a.k === "slide") startTackle(p, true, h, m);
    }
    h.queue = keep;
  }
}

function orderRestartKick(m: Match, p: Player, a: HumanAction) {
  const r = m.restart!;
  const stick = Math.hypot(a.mx, a.mz);
  if (r.kind === "throw") {
    const to = a.to >= 0 && m.players[a.to]?.team === p.team ? a.to : pickReceiver(m, p, a.mx, a.mz);
    const q = to >= 0 ? m.players[to]! : null;
    const near = q && Math.hypot(q.x - p.x, q.z - p.z) < 26;
    const dist = 8 + a.p * 12;
    const [px, pz] = onPitch(
      near ? q!.x : p.x + (stick > 0.2 ? a.mx / stick : Math.cos(p.h)) * dist,
      near ? q!.z : p.z + (stick > 0.2 ? a.mz / stick : -Math.sign(p.z)) * dist,
      2,
    );
    orderKick(p, { kind: "lob", power: a.p, ax: 0, az: 0, to: near ? to : -1, px, pz });
  } else {
    // Au penalty, on tire : une passe ou un lob depuis le point serait aussitôt compté manqué
    const kind = r.kind === "penalty" && a.k !== "finesse" && a.k !== "chip" ? "shot" : (a.k as KickKind);
    orderKick(p, humanOrder(m, p, { ...a, k: kind }));
  }
}

// -------------------------------------------------------------------------
// Les remises en jeu
// -------------------------------------------------------------------------

function freeze(m: Match) {
  m.pass = null;
  m.offside = [];
  m.spotKick = null;
  for (const p of m.players) {
    p.order = null;
    if (p.act === "kick" || p.act === "hold" || p.act === "tackle") p.act = "none";
    // Celui qui courait après un ballon sorti s'arrête au bord du terrain
    [p.tx, p.tz] = onPitch(p.tx, p.tz, -1);
  }
}

function placeBall(m: Match, x: number, z: number, y = BALL_R) {
  const b = m.ball;
  b.x = x;
  b.y = y;
  b.z = z;
  b.vx = b.vy = b.vz = b.curl = 0;
}

/** Les joueurs de champ (hors tireur) dans une liste, du plus offensif au moins offensif */
const fieldPlayers = (m: Match, team: Team, except: number) =>
  m.players.filter((p) => p.team === team && !p.off && p.role !== "GK" && p.i !== except).sort((a, b) => b.fx - a.fx);

const keeperOf = (m: Match, team: Team) => m.players.find((p) => p.team === team && p.role === "GK" && !p.off);

function stand(p: Player, x: number, z: number) {
  p.x = x;
  p.z = z;
  p.vx = 0;
  p.vz = 0;
  p.tx = x;
  p.tz = z;
  p.sprint = false;
  p.act = "none";
  p.actT = 0;
}

function pickTaker(m: Match, kind: RestartKind, team: Team, x: number, z: number): number {
  const field = m.players.filter((p) => p.team === team && !p.off && p.role !== "GK");
  const by = (f: (p: Player) => number) => field.slice().sort((a, b) => f(b) - f(a))[0]!.i;
  if (kind === "goalkick") return keeperOf(m, team)?.i ?? field[0]!.i;
  if (kind === "penalty") return by((p) => p.stats.sho);
  if (kind === "corner") return by((p) => p.stats.pas + (p.fx > 0.3 ? 5 : 0));
  if (kind === "free") {
    const end = attackDir(m, team);
    if (Math.hypot(end * HALF_L - x, z) < 32) return by((p) => p.stats.sho + p.stats.pas * 0.3);
  }
  if (kind === "kickoff") return by((p) => p.fx - Math.abs(p.fz) * 0.1);
  return by((p) => -Math.hypot(p.x - x, p.z - z));
}

function beginRestart(m: Match, kind: RestartKind, team: Team, x: number, z: number, ev: MatchEvent[], delay: number, direct = false) {
  freeze(m);
  m.owner = -1;
  // Le jeu est arrêté : le ballon ne bouge plus (la caméra ne regarde plus devant lui)
  m.ball.vx = m.ball.vy = m.ball.vz = m.ball.curl = 0;
  m.phase = "restart";
  m.restart = { kind, team, x, z, taker: pickTaker(m, kind, team, x, z), ready: false, readyAt: m.t + delay, deadline: 0, direct };
  ev.push({ k: "restart", kind, team });
  if (walksIn(m)) walkIn(m);
}

/** Un coup franc assez près du but pour qu'on monte un mur */
function wallFree(m: Match): boolean {
  const r = m.restart!;
  if (r.kind !== "free") return false;
  const dir = attackDir(m, r.team);
  return Math.hypot(dir * HALF_L - r.x, r.z) < 32 && Math.abs(r.z) < BOX_HALF + 8;
}

/**
 * Les remises en jeu qui se préparent sous les yeux du public (touche, six mètres, coup franc loin du but) : personne ne
 * se téléporte, le tireur va chercher le ballon. Les autres (corner, penalty, coup franc avec mur) se montent hors champ,
 * le temps d'un changement de plan.
 */
function walksIn(m: Match): boolean {
  const r = m.restart;
  return !!r && (r.kind === "throw" || r.kind === "goalkick" || (r.kind === "free" && !wallFree(m)));
}

/** Là où se tient le tireur au moment de jouer */
function takerSpot(m: Match): [number, number] {
  const r = m.restart!;
  return [r.x, r.z];
}

/**
 * Le jeu vient de s'arrêter : le ballon est posé là où il repartira, le tireur va le chercher, chacun se rapproche de sa
 * place au petit trot, et les adversaires trop près reculent
 */
function walkIn(m: Match) {
  const r = m.restart!;
  const foes = opponent(r.team);
  // Le ballon d'une touche attend derrière la ligne ; les autres, à leur place
  if (r.kind === "throw") placeBall(m, r.x, Math.sign(r.z) * (HALF_W + 0.6));
  else placeBall(m, r.x, r.z);
  const [sx, sz] = takerSpot(m);
  for (const p of m.players) {
    if (p.off || p.act === "down") continue;
    if (p.i === r.taker) {
      p.tx = sx;
      p.tz = sz;
      p.sprint = Math.hypot(sx - p.x, sz - p.z) > 14;
      continue;
    }
    if (p.role !== "GK") {
      const [x, z] = shapeSpot(m, p, p.team === r.team);
      // Pas de grand détour pour un arrêt de jeu : on se rapproche de sa place, sans forcément l'atteindre
      p.tx = lerp(p.x, x, 0.6);
      p.tz = lerp(p.z, z, 0.6);
      p.sprint = false;
    }
    if (p.team !== foes) continue;
    const gap = r.kind === "throw" ? 2.5 : CIRCLE_R;
    const d = Math.hypot(p.tx - r.x, p.tz - r.z);
    if (d < gap + 0.5) {
      const ax = d > 0.01 ? (p.tx - r.x) / d : -attackDir(m, p.team);
      const az = d > 0.01 ? (p.tz - r.z) / d : 0;
      [p.tx, p.tz] = onPitch(r.x + ax * (gap + 0.8), r.z + az * (gap + 0.8), 1);
    }
    if (r.kind === "goalkick") {
      const end = -attackDir(m, r.team);
      if (inBox(p.tx, p.tz, end)) p.tx = end * (HALF_L - BOX_L - 1.5);
    }
  }
  syncRestartHuman(m);
}

/** La remise en jeu commence : chacun à sa place, le tireur prend le ballon */
function setUpRestart(m: Match) {
  const r = m.restart!;
  const taker = m.players[r.taker]!;
  const dir = attackDir(m, r.team);
  const foes = opponent(r.team);
  const ours = fieldPlayers(m, r.team, r.taker);
  const theirs = fieldPlayers(m, foes, -1);
  r.ready = true;
  r.readyAt = m.t;
  r.deadline = m.t + HUMAN_RESTART_WAIT;
  stand(taker, r.x, r.z);
  taker.h = r.kind === "throw" ? Math.atan2(-Math.sign(r.z), 0) : Math.atan2(-r.z * 0.2, dir);
  m.owner = r.taker;
  m.lastTouch = r.taker;
  // Une touche se joue depuis la ligne : le ballon est déjà rentré sur le terrain, sinon il ressortirait aussitôt
  placeBall(m, r.x, r.kind === "throw" ? Math.sign(r.z) * (HALF_W - 0.2) : r.z, r.kind === "throw" ? 1.9 : BALL_R);

  if (r.kind === "corner") {
    m.cuts++;
    const inBoxX = dir * (HALF_L - 9);
    ours.forEach((p, n) => {
      if (n < 4) stand(p, inBoxX + dir * (random(m) * 7 - 3), -6 + n * 4 + random(m) * 2);
      else if (n < 6) stand(p, dir * (HALF_L - 19), -8 + (n - 4) * 16);
      else stand(p, dir * 4, -12 + (n - 6) * 8);
    });
    theirs.forEach((p, n) => {
      if (n < 7) stand(p, inBoxX + dir * (random(m) * 5 - 2), -9 + n * 3);
      else stand(p, dir * (HALF_L - 28), -6 + (n - 7) * 12);
    });
    const gk = keeperOf(m, foes);
    if (gk) stand(gk, dir * (HALF_L - 0.8), Math.sign(r.z) * 1.1);
  } else if (r.kind === "penalty" && m.shootout) {
    // Aux tirs au but, les joueurs attendent dans le rond central, une équipe de chaque côté de la ligne ; le gardien
    // de l'équipe qui tire patiente au coin de la surface, sur la ligne de but
    m.cuts++;
    for (const [team, list] of [
      [r.team, ours],
      [foes, theirs],
    ] as const) {
      list.forEach((p, n) => {
        stand(p, (team === r.team ? -1 : 1) * 1.1 - dir * 0.4 * (n % 2), -6.5 + (13 * n) / Math.max(1, list.length - 1));
        p.h = dir > 0 ? 0 : Math.PI;
      });
    }
    const gk = keeperOf(m, foes);
    if (gk) stand(gk, dir * (HALF_L - 0.1), 0);
    const mine = keeperOf(m, r.team);
    if (mine) {
      stand(mine, dir * (HALF_L - 0.4), BOX_HALF + 1);
      mine.h = -Math.PI / 2;
    }
    taker.h = dir > 0 ? 0 : Math.PI;
    stand(taker, r.x - dir * 1.3, r.z);
  } else if (r.kind === "penalty") {
    m.cuts++;
    placeForPenalty(ours, theirs, dir);
    const gk = keeperOf(m, foes);
    if (gk) stand(gk, dir * (HALF_L - 0.1), 0);
    taker.h = dir > 0 ? 0 : Math.PI;
    stand(taker, r.x - dir * 1.3, r.z);
  } else if (r.kind === "goalkick") {
    // Les attaquants sortent de la surface en marchant (voir walkIn et keepDistance)
  } else if (r.kind === "free") {
    const dGoal = Math.hypot(dir * HALF_L - r.x, r.z);
    // Le mur, sur la ligne du but, à 9 m 15
    if (wallFree(m)) {
      m.cuts++;
      const ux = (dir * HALF_L - r.x) / dGoal;
      const uz = -r.z / dGoal;
      const wall = Math.min(4, theirs.length);
      for (let n = 0; n < wall; n++) {
        const off = (n - (wall - 1) / 2) * 0.72;
        stand(theirs[theirs.length - 1 - n]!, r.x + ux * CIRCLE_R - uz * off, r.z + uz * CIRCLE_R + ux * off);
      }
      const gk = keeperOf(m, foes);
      if (gk) stand(gk, dir * (HALF_L - 0.8), clamp(-r.z * 0.1 + Math.sign(-r.z || 1) * 1.2, -2.6, 2.6));
      // Les attaquants à hauteur de l'avant-dernier défenseur : derrière le mur, ils seraient hors-jeu
      const depths = m.players.filter((q) => q.team === foes && !q.off).map((q) => q.x * dir);
      depths.sort((a, b) => b - a);
      const line = Math.min(depths[1] ?? HALF_L - 12, HALF_L - 12);
      const wallZ = r.z + uz * CIRCLE_R;
      const lanes = [-8, 8, wallZ > 0 ? -13 : 13];
      ours.slice(0, 3).forEach((p, n) => stand(p, dir * (line - 0.7 - n * 0.6), clamp(wallZ + lanes[n]!, -BOX_HALF + 1, BOX_HALF - 1)));
    }
    // Loin du but : les adversaires trop près reculent à pied (voir keepDistance)
  } else if (r.kind === "throw") {
    // Rien à replacer : les autres continuent de se démarquer
  }
  keepDistance(m);
  syncRestartHuman(m);
}

/**
 * Un penalty, comme dans un vrai match : au bord de la surface, de part et d'autre de l'arc, les attaquants les plus
 * avancés mêlés aux défenseurs, prêts à suivre la frappe ; un défenseur en haut de l'arc pour dégager ; les défenseurs
 * de l'équipe qui tire restent en arrière, et les avants de l'autre attendent la contre-attaque vers le milieu.
 * Tout le monde hors de la surface, hors de l'arc, et tourné vers le but.
 */
function placeForPenalty(ours: Player[], theirs: Player[], dir: number) {
  // Les plus près du but adverse d'abord : ce sont eux qui suivent la frappe (ou qui la défendent)
  const byDepth = (list: Player[]) => [...list].sort((a, b) => b.x * dir - a.x * dir);
  const attackers = byDepth(ours);
  const defenders = byDepth(theirs);
  const edge = dir * (HALF_L - BOX_L - 0.9);
  const spotX = dir * (HALF_L - SPOT_L);
  // Au bord de la surface, de chaque côté de l'arc, en s'écartant : un défenseur, un attaquant, un défenseur...
  const rush = Math.min(4, attackers.length);
  const block = Math.min(4, defenders.length);
  const slot = (k: number, first: number): [number, number] => {
    const side = k % 2 === 0 ? 1 : -1;
    const rank = Math.floor(k / 2) * 2 + first;
    return [edge - dir * (rank % 2) * 0.5, side * (7.8 + rank * 1.75)];
  };
  for (let k = 0; k < block; k++) stand(defenders[k]!, ...slot(k, 0));
  for (let k = 0; k < rush; k++) stand(attackers[k]!, ...slot(k, 1));
  // Un défenseur en haut de l'arc, pour le dégagement, et un attaquant un peu derrière, pour la deuxième balle
  const top = dir * (HALF_L - SPOT_L - CIRCLE_R - 0.8);
  if (defenders[block]) stand(defenders[block]!, top, 0.6);
  if (attackers[rush]) stand(attackers[rush]!, top - dir * 4, -3.5);
  // Le reste de l'équipe qui tire garde l'arrière ; les avants de l'autre attendent la contre-attaque vers le milieu
  const backs = attackers.slice(rush + 1);
  backs.forEach((p, n) => stand(p, dir * (14 - (n % 2) * 5), (n - (backs.length - 1) / 2) * 11));
  const outs = defenders.slice(block + 1);
  outs.forEach((p, n) => stand(p, dir * (3 + (n % 2) * 4), (n - (outs.length - 1) / 2) * 13));
  for (const p of [...ours, ...theirs]) p.h = Math.atan2(-p.z, spotX - p.x);
}

/**
 * Pendant qu'une remise en jeu attend, chacun respecte les distances : 9 m 15 du ballon (2 m sur une touche),
 * hors de la surface au coup de pied de but et au penalty, chacun dans son camp à l'engagement. Humains compris.
 */
function keepDistance(m: Match) {
  const r = m.restart;
  if (!r || !r.ready || m.phase === "play") return;
  const foes = opponent(r.team);
  // Ce qui se monte hors champ (corner, penalty, mur, engagement) se règle d'un coup ; le reste se fait à pied : celui
  // qui est trop près repart de lui-même, un humain recule doucement
  const snap = !walksIn(m);
  const pushOut = (p: Player, cx: number, cz: number, gap: number) => {
    const d = Math.hypot(p.x - cx, p.z - cz);
    if (d >= gap - 0.05) return;
    const ax = d > 0.01 ? (p.x - cx) / d : -attackDir(m, p.team);
    const az = d > 0.01 ? (p.z - cz) / d : 0;
    if (snap) {
      // D'un seul coup (au changement de plan) ; près d'une ligne, on fait le tour du ballon pour trouver une place à la
      // bonne distance sur le terrain, plutôt que de le repousser contre la ligne un peu plus à chaque image
      [p.x, p.z] = awayFrom(cx, cz, ax, az, gap);
      if (p.human === null) {
        p.tx = p.x;
        p.tz = p.z;
      }
    } else if (p.human === null) {
      [p.tx, p.tz] = awayFrom(cx, cz, ax, az, gap + 0.8);
      p.sprint = false;
    } else {
      // Un humain recule doucement, sans être ramené d'un coup sur le terrain
      const step = Math.min(0.1, gap - d);
      p.x = clamp(p.x + ax * step, -HALF_L - 3, HALF_L + 3);
      p.z = clamp(p.z + az * step, -HALF_W - 3, HALF_W + 3);
    }
  };
  const outOfBox = (p: Player, end: number) => {
    if (!inBox(p.x, p.z, end)) return;
    if (snap) p.x = end * (HALF_L - BOX_L - 0.8);
    else if (p.human === null) {
      p.tx = end * (HALF_L - BOX_L - 1.5);
      p.sprint = false;
    } else p.x -= end * 0.1;
  };
  for (const p of m.players) {
    if (p.off || p.i === r.taker) continue;
    if (r.kind === "penalty") {
      if (p.role === "GK" || m.shootout) continue;
      const end = attackDir(m, r.team);
      outOfBox(p, end);
      if (p.x * end > HALF_L - BOX_L - 2.5) pushOut(p, end * (HALF_L - SPOT_L), 0, CIRCLE_R);
      continue;
    }
    if (r.kind === "kickoff") {
      const dir = attackDir(m, p.team);
      if (p.x * dir > -0.3) p.x = -dir * 0.3;
      if (p.team === foes) pushOut(p, 0, 0, CIRCLE_R + 0.3);
      continue;
    }
    if (p.team !== foes) continue;
    if (r.kind === "goalkick") outOfBox(p, -attackDir(m, r.team));
    pushOut(p, r.x, r.z, r.kind === "throw" ? 2.5 : CIRCLE_R);
  }
}

/**
 * Un point à `gap` mètres de (cx, cz), dans la direction (ax, az) si c'est sur le terrain ; sinon le plus proche de cette
 * direction en tournant autour du ballon (près d'une ligne, la place est de l'autre côté)
 */
function awayFrom(cx: number, cz: number, ax: number, az: number, gap: number): [number, number] {
  const base = Math.atan2(az, ax);
  for (let k = 0; k <= 12; k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const a = base + sign * k * 0.26;
      const x = cx + Math.cos(a) * gap;
      const z = cz + Math.sin(a) * gap;
      if (Math.abs(x) <= HALF_L - 1 && Math.abs(z) <= HALF_W - 1) return [x, z];
    }
  }
  return onPitch(cx + ax * gap, cz + az * gap, 1);
}

/** L'humain de l'équipe qui tire prend le tireur (s'il y en a un) */
function syncRestartHuman(m: Match) {
  const r = m.restart;
  if (!r) return;
  const h = m.humans.find((o) => o.team === r.team);
  if (h) {
    // Un coéquipier humain qui dirigeait déjà le tireur en prend un autre
    for (const o of m.humans) if (o !== h && o.active === r.taker) pickActive(m, o, r.taker);
    h.active = r.taker;
    h.queue = [];
  }
  syncHumans(m);
}

/** L'ordinateur tire */
function autoRestart(m: Match, p: Player) {
  const r = m.restart!;
  const dir = attackDir(m, r.team);
  if (r.kind === "kickoff") {
    const mate = fieldPlayers(m, r.team, r.taker).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    orderKick(p, { kind: "pass", power: 0.3, ax: 0, az: 0, to: mate?.i ?? -1 });
  } else if (r.kind === "throw") {
    const mates = fieldPlayers(m, r.team, r.taker)
      .filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 24)
      .sort((a, b) => openness(m, r.team, b.x, b.z) - openness(m, r.team, a.x, a.z));
    const q = mates[0];
    if (q) orderKick(p, { kind: "lob", power: 0.5, ax: 0, az: 0, to: q.i, px: q.x, pz: q.z });
    else {
      const [px, pz] = onPitch(p.x + dir * 12, p.z - Math.sign(p.z) * 8, 3);
      orderKick(p, { kind: "lob", power: 0.5, ax: 0, az: 0, to: -1, px, pz });
    }
  } else if (r.kind === "corner") {
    const spot: [number, number] = [dir * (HALF_L - 5 - random(m) * 8), (random(m) * 2 - 1) * 7];
    orderKick(p, { kind: "cross", power: 0.75, ax: 0, az: 0, to: -1, px: spot[0], pz: spot[1] });
  } else if (r.kind === "goalkick") {
    const mates = m.players.filter((q) => q.team === r.team && !q.off && q.i !== p.i);
    const safe = mates.filter((q) => openness(m, r.team, q.x, q.z) > 9).sort((a, b) => a.x * dir - b.x * dir)[0];
    if (safe && random(m) < 0.55) orderKick(p, { kind: "pass", power: 0.6, ax: 0, az: 0, to: safe.i });
    else orderKick(p, { kind: "clear", power: 0.75, ax: dir, az: (random(m) - 0.5) * 0.8, to: -1 });
  } else if (r.kind === "penalty") {
    // Un côté, plus ou moins près du poteau : plus c'est près, plus c'est imparable, mais plus ça risque de sortir
    const side = random(m) < 0.5 ? -1 : 1;
    orderKick(p, { kind: "shot", power: 0.6 + random(m) * 0.2, ax: 0, az: side * (0.5 + random(m) * 0.5), to: -1 });
  } else {
    const dGoal = Math.hypot(dir * HALF_L - r.x, r.z);
    if (dGoal < 29) orderKick(p, { kind: "finesse", power: 0.66 + random(m) * 0.16, ax: 0, az: random(m) < 0.5 ? -1 : 1, to: -1 });
    else {
      const to = pickReceiver(m, p, dir, 0, false, 0.45);
      orderKick(p, { kind: "pass", power: 0.5, ax: dir, az: 0, to });
    }
  }
}

function beginKickoff(m: Match, team: Team, ev: MatchEvent[]) {
  freeze(m);
  m.skipBy = [];
  m.cuts++;
  m.phase = "kickoff";
  m.owner = -1;
  placeBall(m, 0, 0);
  for (const p of m.players) {
    if (p.off) continue;
    const dir = attackDir(m, p.team);
    if (p.role === "GK") stand(p, -dir * (HALF_L - 2), 0);
    else {
      let x = dir * lerp(-37, -4.5, p.fx);
      let z = p.fz * HALF_W * 0.72;
      // L'équipe qui n'engage pas attend hors du rond central
      const d = Math.hypot(x, z);
      if (p.team !== team && d < CIRCLE_R + 0.6) {
        const k = (CIRCLE_R + 0.6) / Math.max(d, 0.1);
        x *= k;
        z *= k;
      }
      stand(p, x, z);
    }
    p.h = dir > 0 ? 0 : Math.PI;
  }
  m.restart = {
    kind: "kickoff",
    team,
    x: 0,
    z: 0,
    taker: pickTaker(m, "kickoff", team, 0, 0),
    ready: false,
    readyAt: m.t + 1,
    deadline: 0,
    direct: false,
  };
  const mate = fieldPlayers(m, team, m.restart.taker)[0];
  if (mate) stand(mate, attackDir(m, team) * -2.6, 1.4);
  // Le tireur est au ballon dès le changement de plan : il ne s'y téléporte pas une seconde plus tard
  const taker = m.players[m.restart.taker]!;
  stand(taker, 0, 0);
  taker.h = attackDir(m, team) > 0 ? 0 : Math.PI;
  void ev;
}

/** Le jeu s'arrête pour de bon (la pause, la fin) : tout le monde s'immobilise, personne ne reste figé en pleine course */
function standStill(m: Match) {
  for (const p of m.players) {
    p.vx = 0;
    p.vz = 0;
    p.seen = 0;
    p.sprint = false;
    p.tx = p.x;
    p.tz = p.z;
  }
}

function endPeriod(m: Match, ev: MatchEvent[]) {
  ev.push({ k: "whistle", why: m.period === 1 || m.period === 3 ? "half" : "end" });
  freeze(m);
  standStill(m);
  m.owner = -1;
  m.restart = null;
  const level = m.score[0] === m.score[1];
  if (m.period === 1 || m.period === 3) {
    m.phase = "halftime";
    m.phaseUntil = m.t + HALFTIME_PAUSE;
    ev.push({ k: "half", period: m.period });
    return;
  }
  if (m.period === 2 && level && m.settings.draw === "extra") {
    m.period = 3;
    m.phase = "halftime";
    m.phaseUntil = m.t + HALFTIME_PAUSE;
    m.clock = 90 * 60;
    ev.push({ k: "half", period: 2 });
    return;
  }
  if ((m.period === 2 && level && m.settings.draw === "penalties") || (m.period === 4 && level)) {
    startShootout(m, ev);
    return;
  }
  finish(m, ev);
}

function finish(m: Match, ev: MatchEvent[]) {
  m.phase = "over";
  standStill(m);
  m.owner = -1;
  m.restart = null;
  let winner: Team | null = m.score[0] > m.score[1] ? 0 : m.score[1] > m.score[0] ? 1 : null;
  if (m.shootout) {
    const [a, b] = m.shootout.kicks;
    const sa = a.filter(Boolean).length;
    const sb = b.filter(Boolean).length;
    winner = sa > sb ? 0 : sb > sa ? 1 : winner;
  }
  m.winner = winner;
  ev.push({ k: "end", winner });
}

// -------------------------------------------------------------------------
// Les tirs au but
// -------------------------------------------------------------------------

function startShootout(m: Match, ev: MatchEvent[]) {
  m.period = 5;
  m.shootout = { kicks: [[], []], turn: 0, next: [0, 0] };
  m.flipped = false;
  nextPenalty(m, ev);
}

function shootoutWinner(m: Match): Team | null {
  const s = m.shootout!;
  const [a, b] = s.kicks;
  const sa = a.filter(Boolean).length;
  const sb = b.filter(Boolean).length;
  const left = (k: boolean[]) => Math.max(0, 5 - k.length);
  // Pendant les cinq premiers tirs, une équipe qui ne peut plus être rattrapée a gagné ; ensuite, il faut la réponse
  if (a.length <= 5 && b.length <= 5) {
    if (sa > sb + left(b)) return 0;
    if (sb > sa + left(a)) return 1;
  }
  if (a.length >= 5 && a.length === b.length && sa !== sb) return sa > sb ? 0 : 1;
  return null;
}

function nextPenalty(m: Match, ev: MatchEvent[]) {
  const s = m.shootout!;
  const team = s.turn;
  // Un seul but pour toute la séance
  m.flipped = team === 1;
  const end = attackDir(m, team);
  const takers = m.players.filter((p) => p.team === team && !p.off && p.role !== "GK").sort((a, b) => b.stats.sho - a.stats.sho);
  const taker = takers[s.next[team] % takers.length]!;
  s.next[team]++;
  beginRestart(m, "penalty", team, end * (HALF_L - SPOT_L), 0, ev, 1.2);
  m.restart!.taker = taker.i;
}

function shootoutResult(m: Match, scored: boolean, ev: MatchEvent[]) {
  const s = m.shootout!;
  s.kicks[s.turn].push(scored);
  ev.push({ k: "penalty", team: s.turn, scored });
  s.turn = opponent(s.turn);
  const w = shootoutWinner(m);
  if (w !== null) {
    finish(m, ev);
    return;
  }
  nextPenalty(m, ev);
}

// -------------------------------------------------------------------------
// Le jeu
// -------------------------------------------------------------------------

function stepPlayers(m: Match, ev: MatchEvent[]) {
  const live = m.phase === "play";
  const r = m.restart;
  for (const p of m.players) {
    if (p.off) {
      if ((p.leaveUntil ?? 0) > m.t) leaveField(m, p);
      continue;
    }
    if (p.actT > 0) p.actT -= DT;

    // Les gestes qui commandent le corps
    if (p.act === "down") {
      steer(p, 0, 0, 0);
      if (p.actT <= 0) p.act = "none";
      continue;
    }
    if (p.act === "dive") {
      // Au penalty, il s'est jeté au jugé, plus ou moins loin ; dans le jeu, un plongeon couvre deux mètres et demi
      const v = m.spotKick?.gk === p.i ? (9.5 * (p.actT / 0.6) + 1.5) * m.spotKick.dive : (5.5 * (p.actT / 0.6) + 0.8) * (p.diveK ?? 1);
      p.x = clamp(p.x + p.dirX * v * DT, -HALF_L - 3, HALF_L + 3);
      p.z = clamp(p.z + p.dirZ * v * DT, -HALF_W - 3, HALF_W + 3);
      if (p.actT <= 0) {
        p.act = "down";
        p.actT = 0.45;
      }
      continue;
    }
    if (p.act === "slide") {
      const v = Math.max(2, 13.5 * (p.actT / SLIDE_S));
      p.vx = p.dirX * v;
      p.vz = p.dirZ * v;
      // Une glissade peut finir au-delà de la ligne, pas dans les tribunes
      p.x = clamp(p.x + p.vx * DT, -HALF_L - 3, HALF_L + 3);
      p.z = clamp(p.z + p.vz * DT, -HALF_W - 3, HALF_W + 3);
      p.h = Math.atan2(p.dirZ, p.dirX);
      if (p.actT <= 0) {
        p.act = "down";
        p.actT = 0.3;
      }
      continue;
    }
    if (p.act === "tackle") {
      const v = p.actT > TACKLE_S - TACKLE_HIT_AT ? 10.5 : 2;
      steer(p, p.dirX, p.dirZ, v);
      if (p.actT <= 0) p.act = "none";
      continue;
    }
    if (p.act === "header") {
      steer(p, 0, 0, 0);
      if (p.actT <= 0) p.act = "none";
      continue;
    }
    if (p.act === "hold") {
      steer(p, 0, 0, 0);
      // Son gardien se tourne vers où on veut relancer, jamais vers son propre but
      const h = p.human ? m.humans.find((o) => o.id === p.human) : null;
      const dir = attackDir(m, p.team);
      if (h && Math.hypot(h.mx, h.mz) > 0.3 && h.mx * dir > -0.1) p.h = Math.atan2(h.mz, h.mx);
      else faceTo(p, dir * HALF_L, 0);
      p.x = clamp(p.x, -HALF_L + 0.4, HALF_L - 0.4);
      continue;
    }

    // Aux tirs au but, seuls le tireur et le gardien qui lui fait face jouent : les autres attendent à leur place
    // (le rond central, le coin de la surface), humains compris
    if (m.shootout && p.i !== m.spotKick?.gk && !(r && r.taker === p.i && m.phase !== "play")) {
      steer(p, 0, 0, 0);
      continue;
    }

    // Le tireur attend le coup de sifflet, le ballon au pied
    if (r && r.ready && r.taker === p.i && m.phase !== "play") {
      p.vx = 0;
      p.vz = 0;
      const h = p.human ? m.humans.find((o) => o.id === p.human) : null;
      if (h && Math.hypot(h.mx, h.mz) > 0.2) p.h = Math.atan2(h.mz, h.mx);
      if (p.act === "kick" && p.actT <= 0) {
        // Une touche se joue à la main, le ballon part d'au-dessus de la tête
        releaseKick(m, p, ev, true);
        p.act = "none";
        m.phase = "play";
        if (r.kind === "penalty") {
          const guess = random(m) < 0.14 ? 0 : random(m) < 0.5 ? -1 : 1;
          m.spotKick = { at: m.t, gk: keeperOf(m, opponent(r.team))?.i ?? -1, guess, dive: 0.5 + random(m) * 0.5, done: false };
          if (m.shootout) m.shotAt = m.t;
        }
        m.restart = null;
        // L'humain ne garde pas le gardien : il retrouve un joueur de champ
        leaveKeeper(m, p);
      }
      continue;
    }

    if (p.act === "kick" && p.actT <= 0) {
      if (m.owner === p.i) {
        releaseKick(m, p, ev);
        leaveKeeper(m, p);
      } else p.order = null;
      p.act = "none";
    }

    const mine = m.owner === p.i;
    const h = p.human ? (m.humans.find((o) => o.id === p.human) ?? null) : null;
    let wx = 0;
    let wz = 0;
    let speed = 0;
    let sprinting = false;
    const slowed = p.act === "kick" ? 0.55 : 1;

    if (live && !mine && m.pass?.to === p.i && (h === null || m.t - m.pass.at < RECEIVE_AUTO_S)) {
      // Celui à qui la passe est destinée, humain ou non, va à la rencontre du ballon
      [wx, wz, speed] = receiveRun(m, p);
      sprinting = true;
    } else if (h && m.phase !== "goal" && !stickFromBefore(m, h) && !(r && !r.ready && r.taker === p.i && walksIn(m)) && !assisted(m, p)) {
      wx = h.mx;
      wz = h.mz;
      sprinting = h.sprint;
      speed = topSpeed(p, sprinting, mine) * Math.min(1, Math.hypot(wx, wz) * 1.25) * (p.burstUntil > m.t ? BURST_SPEED : 1);
      const l = Math.hypot(wx, wz);
      // Sans direction, le presseur va au porteur
      if (l < 0.1 && live) {
        const owner = m.owner >= 0 ? m.players[m.owner]! : null;
        const goTo = h.press && owner && owner.team !== p.team ? ([owner.x, owner.z] as const) : null;
        if (goTo) {
          const dx = goTo[0] - p.x;
          const dz = goTo[1] - p.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.6) {
            wx = dx / d;
            wz = dz / d;
            speed = topSpeed(p, h.press, false);
            sprinting = h.press;
          }
        }
      } else if (l > 0) {
        wx /= Math.max(l, 1e-6);
        wz /= Math.max(l, 1e-6);
      }
    } else {
      if (p.runUntil > m.t && !mine) {
        p.tx = p.runX;
        p.tz = p.runZ;
        p.sprint = true;
      }
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.35) {
        wx = dx / d;
        wz = dz / d;
        sprinting = p.sprint;
        // Se recaler de deux mètres dans le bloc se fait au trot, pas au sprint : sinon, chaque mouvement du ballon le
        // ferait partir à fond dans un sens puis dans l'autre. Aller au ballon, presser, porter le ballon : à fond.
        const calm = !sprinting && !mine && p.role !== "GK";
        speed = topSpeed(p, sprinting, mine) * clamp(calm ? d / 5 + 0.15 : d / 2.5 + 0.2, 0, 1) * tuning(m, p.team).speed;
        // Face à une frappe qui vient vers lui, le gardien se décale à petits pas
        if (p.role === "GK" && m.owner < 0 && m.t - m.shotAt < 1.2 && m.ball.vx * attackDir(m, p.team) < -4)
          speed = Math.min(speed, KEEPER_SHUFFLE);
        // Le gardien qui se replace sans urgence va au petit trot si le jeu est loin, à pas mesurés sinon : il ne
        // court pas à fond pour deux mètres, ni d'un bout à l'autre de sa surface quand le ballon change de côté
        if (p.role === "GK" && !sprinting && m.phase === "play") {
          const far = Math.abs(m.ball.x + attackDir(m, p.team) * HALF_L) > 35;
          speed = Math.min(speed, far ? KEEPER_JOG : KEEPER_STEP);
        }
      }
      if (m.phase === "goal" && p.i !== m.celebrant) {
        [wx, wz, speed] = makeRoom(m, p, wx, wz, speed);
        // Après un but encaissé, on rentre en marchant (et on s'écarte de la fête au pas, sans courir)
        if (p.team !== m.goals.at(-1)?.team) speed = Math.min(speed, CONCEDED_WALK);
      }
    }
    // Le gardien qui se replace garde les yeux sur le ballon : il recule ou se décale face au jeu, au lieu de lui tourner
    // le dos pour courir vers son but
    const watching = p.role === "GK" && !sprinting && m.phase === "play" && p.act === "none" && m.owner !== p.i;
    const facing = p.h;
    steer(p, wx, wz, speed * slowed);
    if (watching) {
      p.h = facing;
      faceTo(p, m.ball.x, m.ball.z);
    }
    spendEnergy(p, sprinting, m.settings.halfMinutes);
    // Arrêté, on regarde le ballon ; pendant la fête d'un but, on se tourne vers le public de la caméra
    if (speed < 0.5) {
      if (m.phase === "goal") faceTo(p, p.x, p.z + 30);
      else faceTo(p, m.ball.x, m.ball.z);
    }
  }
  // Tenu dans le stade, à deux pas des lignes, quel que soit son geste (une glissade, un plongeon finissent au bord)
  for (const p of m.players) {
    if (p.off) continue;
    p.x = clamp(p.x, -HALF_L - 3, HALF_L + 3);
    p.z = clamp(p.z, -HALF_W - 3, HALF_W + 3);
  }
}

/** La course du receveur : vers le premier point du trajet du ballon qu'il peut atteindre, sans le dépasser */
function receiveRun(m: Match, p: Player): [number, number, number] {
  const b = m.ball;
  const top = topSpeed(p, true, false);
  let tx = m.pass!.x;
  let tz = m.pass!.z;
  if (b.y < 1.2 && Math.hypot(b.vx, b.vz) > 0.3) {
    for (let t = 0; t <= 3; t += 0.1) {
      const [bx, bz] = rollingAt(b, t);
      if (Math.hypot(bx - p.x, bz - p.z) <= 0.2 + top * t) {
        tx = bx;
        tz = bz;
        break;
      }
    }
  } else if (b.y < 1.2) {
    tx = b.x;
    tz = b.z;
  }
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25) return [0, 0, 0];
  return [dx / d, dz / d, top * clamp(d / 1.6 + 0.15, 0, 1)];
}

/**
 * Pendant la fête d'un but, chacun se fait de la place en marchant, plutôt que d'être poussé par ceux qui arrivent : à
 * l'image, un joueur poussé glisse sans bouger les jambes. Le buteur, lui, ne s'écarte pour personne.
 */
function makeRoom(m: Match, p: Player, wx: number, wz: number, speed: number): [number, number, number] {
  let rx = 0;
  let rz = 0;
  for (const q of m.players) {
    if (q === p || q.off) continue;
    const dx = p.x - q.x;
    const dz = p.z - q.z;
    const d = Math.hypot(dx, dz);
    if (d >= ROOM || d < 1e-4) continue;
    const k = (ROOM - d) / ROOM;
    rx += (dx / d) * k;
    rz += (dz / d) * k;
  }
  const r = Math.hypot(rx, rz);
  if (r < 0.12) return [wx, wz, speed];
  const away = 1.6 * Math.min(1, r * 1.5);
  const vx = wx * speed + (rx / r) * away;
  const vz = wz * speed + (rz / r) * away;
  const v = Math.hypot(vx, vz);
  if (v < 1e-3) return [wx, wz, speed];
  // Au moins le pas : on le voit marcher
  return [vx / v, vz / v, Math.max(v, 0.9)];
}

/** Les joueurs ne se traversent pas ; le plus solide déplace l'autre */
function separate(m: Match) {
  const list = m.players;
  for (let a = 0; a < list.length; a++) {
    const p = list[a]!;
    // Un plongeon, une glissade passent dans les jambes : on ne les écarte pas
    if (p.off || p.act === "dive" || p.act === "slide") continue;
    for (let b = a + 1; b < list.length; b++) {
      const q = list[b]!;
      if (q.off || q.act === "dive" || q.act === "slide") continue;
      const dx = q.x - p.x;
      if (dx > SEPARATION || dx < -SEPARATION) continue;
      const dz = q.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d >= SEPARATION || d < 1e-4) continue;
      const push = m.phase === "goal" ? Math.min(SEPARATION - d, GOAL_PUSH) : SEPARATION - d;
      // Le gardien qui tient le ballon, et le tireur d'une remise en jeu, ne se laissent pas pousser ; le buteur qui
      // fête son but non plus
      const fixed = (o: typeof p) =>
        o.act === "hold" ||
        (m.restart?.ready === true && m.restart.taker === o.i && m.phase !== "play") ||
        (m.phase === "goal" && o.i === m.celebrant);
      const share = fixed(p) ? 0 : fixed(q) ? 1 : 0.5 + (q.stats.phy - p.stats.phy) / 300;
      const nx = dx / d;
      const nz = dz / d;
      p.x -= nx * push * share;
      p.z -= nz * push * share;
      q.x += nx * push * (1 - share);
      q.z += nz * push * (1 - share);
    }
  }
  for (const p of list) {
    p.x = clamp(p.x, -HALF_L - 3, HALF_L + 3);
    p.z = clamp(p.z, -HALF_W - 3, HALF_W + 3);
  }
}

/** Le ballon colle au pied de son porteur, un peu plus loin devant lui quand il sprinte */
function carryBall(m: Match) {
  if (m.owner < 0) return;
  const p = m.players[m.owner]!;
  const b = m.ball;
  if (p.act === "hold") {
    // Dans les mains, toujours devant la ligne : un ballon tenu n'entre jamais dans le but
    b.x = clamp(p.x + Math.cos(p.h) * 0.35, -HALF_L + 0.3, HALF_L - 0.3);
    b.z = p.z + Math.sin(p.h) * 0.35;
    b.y = 1.1;
    b.vx = b.vy = b.vz = 0;
    return;
  }
  if (m.restart?.ready && m.restart.taker === p.i) return;
  const v = Math.hypot(p.vx, p.vz);
  const reach = 0.55 + clamp(v / 11, 0, 1) * 0.55;
  b.x = p.x + Math.cos(p.h) * reach;
  b.z = p.z + Math.sin(p.h) * reach;
  b.y = BALL_R;
  b.vx = p.vx;
  b.vy = 0;
  b.vz = p.vz;
  b.curl = 0;
}

/** Un hors-jeu est sifflé quand le joueur signalé touche le ballon, du pied ou de la tête */
function whistleOffside(m: Match, p: Player, ev: MatchEvent[]): boolean {
  if (!m.offside.includes(p.i)) return false;
  ev.push({ k: "whistle", why: "offside" });
  ev.push({ k: "offside", p: p.i });
  m.stats[p.team].offsides++;
  // Le drapeau, le coup de sifflet : un instant avant que le défenseur aille poser le ballon
  beginRestart(m, "free", opponent(p.team), clamp(p.x, -HALF_L + 2, HALF_L - 2), clamp(p.z, -HALF_W + 1, HALF_W - 1), ev, 1.6);
  return true;
}

function takeBall(m: Match, p: Player, ev: MatchEvent[]) {
  const previous = m.lastTouch;
  if (whistleOffside(m, p, ev)) return;
  m.offside = [];
  m.spotKick = null;
  if (m.pass && m.players[m.pass.from]?.team === p.team && m.pass.from !== p.i) m.stats[p.team].passesOk++;
  m.pass = null;
  if (previous >= 0 && m.players[previous]?.team === p.team && previous !== p.i) m.assistBy = previous;
  else if (previous >= 0 && m.players[previous]?.team !== p.team) m.assistBy = -1;
  m.owner = p.i;
  m.lastTouch = p.i;
  p.gotAt = m.t;
  p.thinkAt = m.t + tuning(m, p.team).think * (0.4 + random(m) * 0.8);
  ev.push({ k: "touch", p: p.i });
  followBall(m, p.i);
  defendSwitch(m, p);
  // Une frappe demandée juste avant : la reprise
  const h = p.human ? m.humans.find((o) => o.id === p.human) : null;
  if (h) {
    const a = h.queue.find((x) => isKick(x.k) && meantFor(x, p));
    if (a) {
      h.queue = h.queue.filter((x) => x !== a);
      orderKick(p, humanOrder(m, p, a));
    }
  }
}

/** Un contrôle raté : le ballon rebondit sur le joueur */
function deflect(m: Match, p: Player, keep: number, ev: MatchEvent[]) {
  const b = m.ball;
  const a = (random(m) - 0.5) * 1.6;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const vx = b.vx * keep;
  const vz = b.vz * keep;
  b.vx = vx * c - vz * s;
  b.vz = vx * s + vz * c;
  b.vy = Math.abs(b.vy) * 0.4 + 0.8;
  p.lockedUntil = m.t + 0.3;
  m.lastTouch = p.i;
  // La passe est ratée : son receveur n'a plus à courir après
  m.pass = null;
  m.spotKick = null;
  ev.push({ k: "touch", p: p.i });
}

/** Le gardien dans sa surface : il capte ce qu'il peut, repousse le reste */
function keeperTouch(m: Match, p: Player, ev: MatchEvent[]): boolean {
  const b = m.ball;
  const own = -attackDir(m, p.team);
  if (!inBox(p.x, p.z, own)) return false;
  // Le ballon a déjà franchi la ligne : trop tard, c'est but (ou sortie)
  if (Math.abs(b.x) > HALF_L + BALL_R) return false;
  const diving = p.act === "dive";
  // Au penalty, il a choisi son côté : il n'attrape que ce qui passe à sa portée
  const spot = !!m.spotKick && m.t - m.spotKick.at < 1.4;
  // De près, il se fait grand (bras et jambes écartés) : il couvre davantage
  const spread = clamp((14 - (m.shotDist ?? 20)) * 0.1, 0, 0.75);
  const reach = spot ? 1.0 : (diving ? 1.2 : 0.95) + spread;
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  let d: number;
  if (speed > 8 && Math.abs(b.vx) > 3) {
    // Une frappe se juge quand elle passe à sa hauteur, sur l'écart de côté (le bras tendu) : avant, elle est encore
    // devant lui, hors d'atteinte, et un essai raté là-bas la laisserait ensuite lui traverser le corps
    const px = b.x - b.vx * DT;
    if ((px - p.x) * (b.x - p.x) > 0 && Math.abs(b.x - p.x) > 0.3) return false;
    const f = Math.abs(b.x - px) > 1e-6 ? clamp((p.x - px) / (b.x - px), 0, 1) : 1;
    d = Math.abs(b.z - b.vz * DT * (1 - f) - p.z);
  } else d = Math.hypot(b.x - p.x, b.z - p.z);
  // En pleine extension, il atteint moins loin ce qui monte vers la lucarne
  const high = diving ? clamp((b.y - 1.5) * 0.45, 0, 0.45) : 0;
  if (d > reach * (1 - high) || b.y > (diving ? 2.4 : 2.7)) return false;
  // Une passe de son coéquipier se joue au pied
  if (m.players[m.lastTouch]?.team === p.team && m.pass) return false;
  // Sur lui, il l'arrête ; au bout des doigts, il ne la touche pas toujours, encore moins si elle va vite : la frappe
  // placée passe, la frappe sur le gardien non
  const edge = clamp((d - reach * 0.55) / (reach * 0.45), 0, 1);
  const touch = 1 - Math.pow(edge, 1.2) * clamp(0.5 + speed / 70, 0.55, 0.95);
  if (!spot && random(m) > touch) {
    p.lockedUntil = m.t + 0.35;
    return false;
  }
  const skill = p.stats.gk / 100;
  const chance = clamp(1.25 - speed / (20 + skill * 16), 0.12, 0.98);
  const shot = m.t - m.shotAt < 1.6;
  m.spotKick = null;
  if (random(m) < chance) {
    m.owner = p.i;
    m.lastTouch = p.i;
    m.pass = null;
    m.offside = [];
    p.gotAt = m.t;
    p.act = "hold";
    p.actT = 0;
    p.thinkAt = m.t + KEEPER_HOLD_S * (0.5 + random(m) * 0.5);
    followBall(m, p.i);
    if (shot) ev.push({ k: "save", p: p.i, caught: true });
    return true;
  }
  // Repoussé : vers le côté, loin du but, ou parfois derrière sa ligne
  const side = Math.sign(b.z - p.z) || (random(m) < 0.5 ? -1 : 1);
  b.vx = -own * (3 + random(m) * 6);
  b.vy = 2.5 + random(m) * 4;
  b.vz = side * (5 + random(m) * 6);
  // Parfois en corner : seulement s'il sort bien à côté du poteau, sinon il le pousserait dans son propre but
  const toLine = own * HALF_L - b.x;
  const push = own * (3 + random(m) * 2);
  if (random(m) < 0.3 && Math.abs(b.z + (b.vz * toLine) / push) > GOAL_HALF + 0.6) b.vx = push;
  m.lastTouch = p.i;
  m.pass = null;
  p.lockedUntil = m.t + 0.5;
  if (shot) ev.push({ k: "save", p: p.i, caught: false });
  return true;
}

/** Une tête : vers le but si on est bien placé, sinon vers un coéquipier, sinon loin de sa surface */
function header(m: Match, p: Player, ev: MatchEvent[]) {
  const b = m.ball;
  const dir = attackDir(m, p.team);
  const gx = dir * HALF_L;
  const d = Math.hypot(gx - b.x, b.z);
  const h = p.human ? m.humans.find((o) => o.id === p.human) : null;
  const wantShot = h ? h.queue.some((a) => a.k === "shot") : d < 16;
  if (whistleOffside(m, p, ev)) return;
  m.spotKick = null;
  p.act = "header";
  p.actT = 0.3;
  m.owner = -1;
  m.offside = [];
  if (m.players[m.lastTouch]?.team === p.team) m.assistBy = m.lastTouch;
  m.lastTouch = p.i;
  p.lockedUntil = m.t + 0.4;
  if (h) h.queue = h.queue.filter((a) => !isKick(a.k));
  if (wantShot) {
    const err = (1.05 - p.stats.sho / 100) * 0.22;
    const aim = (random(m) * 2 - 1) * GOAL_HALF * 0.85;
    const a = Math.atan2(aim - b.z, gx - b.x) + (random(m) * 2 - 1) * err;
    const speed = 11 + (p.stats.sho / 100) * 8 + (p.stats.phy / 100) * 3;
    b.vx = Math.cos(a) * speed;
    b.vz = Math.sin(a) * speed;
    b.vy = -1 + random(m) * 2.5;
    m.stats[p.team].shots++;
    m.shotAt = m.t;
    m.shotBy = p.i;
    ev.push({ k: "shot", p: p.i, power: 0.6 });
  } else {
    // Dans sa moitié, on dégage ; dans l'autre, on remet à un coéquipier
    const own = b.x * dir < -5;
    const to = own ? -1 : pickReceiver(m, p, dir, 0, false, 0.45);
    if (to >= 0) {
      const q = m.players[to]!;
      const a = Math.atan2(q.z - b.z, q.x - b.x);
      const dist = Math.hypot(q.x - b.x, q.z - b.z);
      const speed = clamp(dist * 1.2, 7, 16);
      b.vx = Math.cos(a) * speed;
      b.vz = Math.sin(a) * speed;
      // Une remise de la tête se rabat vers le sol : elle ne reste pas à hauteur d'homme pour un autre coup de tête
      b.vy = dist > 14 ? 0.8 : -1.2;
      m.pass = { from: p.i, to, x: q.x, z: q.z, until: m.t + 2, at: m.t };
      m.stats[p.team].passes++;
    } else {
      // Personne à qui la remettre : devant soi, en revenant vers l'axe. Près de la ligne de but, vers le point de penalty.
      const nearLine = b.x * dir > HALF_L - 16;
      const aimX = nearLine ? dir * (HALF_L - 11) : b.x + dir * 13;
      const aimZ = nearLine ? 0 : b.z * 0.6;
      const t = 1;
      b.vx = (aimX - b.x) / t;
      b.vz = (aimZ - b.z) / t;
      b.vy = 5.5 + random(m) * 1.5;
    }
  }
  ev.push({ k: "kick", p: p.i, power: 0.5, kind: "pass" });
}

function toBallPath(p: Player, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const u = l2 > 0 ? clamp(((p.x - ax) * dx + (p.z - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(p.x - ax - dx * u, p.z - az - dz * u);
}

/** Qui touche le ballon libre ? Le plus proche à portée, gardien d'abord */
function ballContacts(m: Match, ev: MatchEvent[]) {
  if (m.owner >= 0 || m.phase !== "play") return;
  const b = m.ball;
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of m.players) {
    if (p.off || p.act === "down" || p.act === "slide" || p.act === "header" || m.t < p.lockedUntil) continue;
    if (p.role === "GK" && p.act === "dive") {
      if (keeperTouch(m, p, ev)) return;
      continue;
    }
    // Dans sa surface, le gardien joue avec les mains, et rien d'autre : une frappe qui arrive sur lui n'est pas un
    // contrôle raté de joueur de champ (qui le bloquerait un instant et laisserait le ballon lui passer à travers)
    if (p.role === "GK" && inBox(p.x, p.z, -attackDir(m, p.team))) {
      if (keeperTouch(m, p, ev)) return;
      continue;
    }
    if (b.y > 2.7) continue;
    const reach = b.y > 1.25 ? HEADER_REACH : m.pass?.to === p.i && p.human !== null ? RECEIVE_REACH : REACH;
    // Le chemin parcouru depuis le dernier pas compte : un ballon rapide ne passe pas à travers un joueur
    const d = toBallPath(p, b.x - b.vx * DT, b.z - b.vz * DT, b.x, b.z);
    if (d <= reach && d < bd) {
      bd = d;
      best = p;
    }
  }
  if (b.y < 0.8) m.headChain = 0;
  if (!best) return;
  if (b.y > 1.25) {
    // Deux têtes de suite sans que le ballon retombe : le suivant le laisse descendre (pas de tennis-ballon sans fin)
    if ((m.headChain ?? 0) >= 2) return;
    m.headChain = (m.headChain ?? 0) + 1;
    header(m, best, ev);
    return;
  }
  const rel = Math.hypot(b.vx - best.vx, b.vz - best.vz);
  // Couper une passe adverse n'est pas gagné d'avance : plus elle va vite, plus elle file sous le pied
  if (m.pass?.to !== best.i && m.players[m.lastTouch]?.team !== best.team && rel > 8) {
    const base = clamp(0.98 - (rel - 8) / 22 + (best.stats.tac - 70) / 150, 0.3, 0.98) * tuning(m, best.team).read;
    if (random(m) > (best.human ? Math.min(1, base + 0.25) : base)) {
      best.lockedUntil = m.t + 0.25;
      return;
    }
  }
  const maxTrap = 22 + (best.stats.dri / 100) * 16;
  if (m.pass?.to !== best.i && rel > maxTrap) {
    // Trop fort pour être contrôlé : il le dévie
    deflect(m, best, 0.42, ev);
    return;
  }
  takeBall(m, best, ev);
}

/** Tacles : le ballon d'abord, sinon c'est faute */
function tackles(m: Match, ev: MatchEvent[]) {
  if (m.phase !== "play") return;
  const b = m.ball;
  const owner = m.owner >= 0 ? m.players[m.owner]! : null;
  for (const p of m.players) {
    if (p.off) continue;
    if (p.act === "slide") {
      if (m.t < p.lockedUntil) continue;
      const dBall = Math.hypot(b.x - p.x, b.z - p.z);
      if (owner && (owner.team === p.team || owner.burstUntil > m.t || inKeeperHands(m, owner))) continue;
      if (dBall < 1.2 && b.y < 1) {
        // Le ballon est touché
        if (owner) {
          owner.lockedUntil = m.t + 0.5;
          owner.act = random(m) < 0.25 ? "down" : owner.act;
          if (owner.act === "down") owner.actT = DOWN_S;
        }
        m.owner = -1;
        m.pass = null;
        m.lastTouch = p.i;
        b.vx = p.dirX * (6 + random(m) * 5);
        b.vz = p.dirZ * (6 + random(m) * 5) + (random(m) - 0.5) * 4;
        b.vy = 1.6;
        p.lockedUntil = m.t + 0.8;
        ev.push({ k: "tackle", p: p.i, won: true });
      } else if (owner && owner.team !== p.team && Math.hypot(owner.x - p.x, owner.z - p.z) < 0.95 && m.settings.fouls) {
        commitFoul(m, p, owner, true, ev);
        return;
      }
    } else if (p.act === "tackle" && p.actT <= TACKLE_S - TACKLE_HIT_AT && p.actT > TACKLE_S - TACKLE_HIT_AT - DT * 1.5) {
      // Le ballon dans les mains du gardien ne se dispute pas
      if (!owner || owner.team === p.team || inKeeperHands(m, owner)) continue;
      const d = Math.hypot(owner.x - p.x, owner.z - p.z);
      if (d > 1.7) continue;
      // De face, c'est plus sûr ; de dos, on risque la faute
      const behind = Math.cos(owner.h) * (p.x - owner.x) + Math.sin(owner.h) * (p.z - owner.z) < -0.25;
      const tune = p.human ? 1.3 : tuning(m, p.team).tackle * (owner.human !== null ? 0.8 : 1);
      const dodge = owner.burstUntil > m.t ? 0.15 : 1;
      const chance = clamp(0.5 + (p.stats.tac - owner.stats.dri) / 130, 0.15, 0.85) * tune * (behind ? 0.7 : 1) * dodge;
      if (random(m) < chance) {
        owner.lockedUntil = m.t + 0.55;
        m.owner = -1;
        m.pass = null;
        m.lastTouch = p.i;
        b.vx = (p.x - owner.x) * 1.2 + p.vx * 0.4;
        b.vz = (p.z - owner.z) * 1.2 + p.vz * 0.4;
        ev.push({ k: "tackle", p: p.i, won: true });
      } else {
        ev.push({ k: "tackle", p: p.i, won: false });
        if (behind && m.settings.fouls && random(m) < (inBox(owner.x, owner.z, attackDir(m, owner.team)) ? 0.16 : 0.3)) {
          commitFoul(m, p, owner, false, ev);
          return;
        }
      }
    }
  }
}

function commitFoul(m: Match, p: Player, victim: Player, slide: boolean, ev: MatchEvent[]) {
  const dir = attackDir(m, victim.team);
  const penalty = inBox(victim.x, victim.z, dir);
  // Par derrière ou dernier défenseur : carton
  const behind = Math.cos(victim.h) * (p.x - victim.x) + Math.sin(victim.h) * (p.z - victim.z) < -0.4;
  const defenders = m.players.filter((q) => q.team === p.team && !q.off && q.x * dir > victim.x * dir).length;
  const lastMan = defenders <= 1 && victim.x * dir > 20 && Math.abs(victim.z) < 18;
  const how: FoulKind = lastMan ? "dernier" : !slide ? "charge" : behind ? "derriere" : "glisse";
  m.stats[p.team].fouls++;
  ev.push({ k: "whistle", why: "foul" });
  ev.push({ k: "foul", p: p.i, on: victim.i, penalty, how });
  victim.act = "down";
  victim.actT = FOULED_DOWN_S;
  const cards = m.stats[p.team].yellow + m.stats[p.team].red;
  const yellowChance = (slide ? 0.18 : 0.06) + (behind ? 0.2 : 0);
  if (lastMan) card(m, p, true, ev);
  else if (random(m) < yellowChance) card(m, p, false, ev);
  // Le temps de voir l'action, le joueur au sol et, s'il y en a un, le carton
  const pause = FOUL_PAUSE + (m.stats[p.team].yellow + m.stats[p.team].red > cards ? CARD_PAUSE : 0);
  if (penalty) beginRestart(m, "penalty", victim.team, dir * (HALF_L - SPOT_L), 0, ev, pause + 0.4, true);
  else {
    const [x, z] = onPitch(victim.x, victim.z, 1);
    beginRestart(m, "free", victim.team, x, z, ev, pause, true);
  }
}

/** Le moins de joueurs qu'une équipe garde sur le terrain (7 sur 11, comme le veut la règle) : au-delà, pas d'exclusion */
const minOnPitch = (m: Match) => Math.ceil(m.settings.side * 0.6);

function card(m: Match, p: Player, red: boolean, ev: MatchEvent[]) {
  p.yellow += red ? 2 : 1;
  // Une équipe déjà réduite au minimum ne perd plus personne : le carton reste jaune
  const onPitch = m.players.filter((q) => q.team === p.team && !q.off).length;
  if (p.yellow >= 2 && onPitch <= minOnPitch(m)) p.yellow = 1;
  const out = p.yellow >= 2;
  if (out) m.stats[p.team].red++;
  else m.stats[p.team].yellow++;
  ev.push({ k: "card", p: p.i, red: out });
  if (!out) return;
  // Exclu : il ne joue plus, mais on le voit quitter le terrain à pied, tête basse
  p.off = true;
  p.act = "none";
  p.order = null;
  p.leaveUntil = m.t + LEAVE_S;
  if (m.owner === p.i) m.owner = -1;
  for (const h of m.humans) if (h.active === p.i) pickActive(m, h);
}

/** L'exclu marche jusqu'à la touche la plus proche, puis disparaît du terrain */
function leaveField(m: Match, p: Player) {
  const side = p.z >= 0 ? 1 : -1;
  const tx = clamp(p.x, -HALF_L + 6, HALF_L - 6);
  const tz = side * (HALF_W + 2.6);
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.4 || m.t >= (p.leaveUntil ?? 0) - DT) {
    p.leaveUntil = 0;
    p.vx = p.vz = 0;
    p.x = 0;
    p.z = HALF_W + 6;
    return;
  }
  steer(p, dx / d, dz / d, 2.4);
}

/** Le gardien remet en jeu ce qu'il a capté, ou l'ordinateur décide pour ceux qui ont le ballon */
function carriers(m: Match) {
  if (m.owner < 0 || m.phase !== "play") return;
  const p = m.players[m.owner]!;
  // Son gardien garde le ballon dans les mains sans que rien ne vienne : l'ordinateur relance à sa place. De même pour
  // un joueur balle au pied que l'humain laisse planté (il ne touche plus à rien) : il le perdrait au premier tacle
  const idleKeeper = p.human !== null && p.act === "hold" && m.t - p.gotAt > HUMAN_KEEPER_WAIT;
  if ((p.human !== null && !idleKeeper && !assisted(m, p)) || p.order || p.act === "down") return;
  if (p.act === "hold" && m.t < p.thinkAt) return;
  if (m.t >= p.thinkAt) {
    p.thinkAt = m.t + tuning(m, p.team).think * (0.7 + random(m) * 0.6);
    thinkCarrier(m, p);
  } else if (p.act === "none") steerCarrier(m, p);
}

/** Les joueurs de l'ordinateur tentent le tacle quand le porteur est à portée ; un humain qui presse le fait d'un seul bouton */
function defenders(m: Match) {
  if (m.owner < 0 || m.phase !== "play") return;
  const owner = m.players[m.owner]!;
  if (inKeeperHands(m, owner)) return;
  for (const h of m.humans) {
    const p = m.players[h.active];
    if (!p || !h.press || p.team === owner.team || p.act !== "none" || m.t < p.lockedUntil) continue;
    if (Math.hypot(owner.x - p.x, owner.z - p.z) < 1.6) {
      startTackle(p, false, h, m);
      p.lockedUntil = m.t + 0.55;
    }
  }
  for (const p of m.players) {
    if (p.team === owner.team || p.off || (p.human !== null && !assisted(m, p)) || p.act !== "none" || p.role === "GK") continue;
    const d = Math.hypot(owner.x - p.x, owner.z - p.z);
    const behind = Math.cos(owner.h) * (p.x - owner.x) + Math.sin(owner.h) * (p.z - owner.z) < -0.25;
    const ownBox = inBox(owner.x, owner.z, -attackDir(m, p.team));
    if (ownBox && behind) continue;
    if (d < 1.55 && m.t > p.lockedUntil && random(m) < (owner.human !== null ? 0.05 : 0.09) * tuning(m, p.team).tackle) {
      startTackle(p, false, null, m);
      p.lockedUntil = m.t + 0.6;
    } else if (d < 3.2 && d > 1.8 && random(m) < 0.008 * tuning(m, p.team).tackle && !inBox(p.x, p.z, -attackDir(m, p.team))) {
      startTackle(p, true, null, m);
    }
  }
}

/**
 * Un attaquant arrive tout près du gardien, balle au pied, dans la surface : le gardien se jette dans ses pieds. Il
 * arrive parfois sur le ballon (le porteur le perd, le gardien le ramasse) ; sinon l'attaquant l'a passé, et le but est vide.
 */
function keeperSmother(m: Match) {
  if (m.owner < 0 || m.phase !== "play") return;
  const owner = m.players[m.owner]!;
  if (inKeeperHands(m, owner)) return;
  const gk = keeperOf(m, opponent(owner.team));
  if (!gk || gk.human !== null || gk.act !== "none" || m.t < gk.lockedUntil) return;
  const own = -attackDir(m, gk.team);
  if (!inBox(owner.x, owner.z, own) || !inBox(gk.x, gk.z, own)) return;
  const b = m.ball;
  const dx = b.x - gk.x;
  const dz = b.z - gk.z;
  const d = Math.hypot(dx, dz);
  // Assez près pour l'atteindre d'un plongeon, et l'attaquant tourné vers le but (pas en train de ressortir)
  if (d > 1.9 || d < 0.2 || Math.cos(owner.h) * own < -0.2) return;
  gk.act = "dive";
  gk.actT = 0.6;
  gk.dirX = dx / d;
  gk.dirZ = dz / d;
  gk.diveK = clamp(d / 2.6, 0.35, 0.85);
  const chance =
    clamp(0.4 + (gk.stats.gk - owner.stats.dri) / 110, 0.2, 0.72) * (owner.burstUntil > m.t ? 0.45 : 1) * (owner.human !== null ? 0.85 : 1);
  if (random(m) < chance) {
    // Il arrive sur le ballon : le porteur le perd, le ballon reste là où le gardien glisse
    owner.lockedUntil = m.t + 0.8;
    if (random(m) < 0.35) {
      owner.act = "down";
      owner.actT = DOWN_S;
    }
    m.owner = -1;
    m.pass = null;
    m.lastTouch = gk.i;
    b.vx = -dx * 1.2;
    b.vz = -dz * 1.2;
    b.vy = 0;
  } else {
    // Il l'a passé : le crochet de l'attaquant, le gardien plonge à côté
    owner.burstUntil = m.t + BURST_S;
    gk.dirX = (dx + (random(m) < 0.5 ? -1 : 1) * dz * 0.5) / d;
    gk.lockedUntil = m.t + 0.7;
  }
}

/** Le gardien face au penalty : un instant après la frappe, il se jette du côté choisi, ou couvre le centre */
function spotKeeper(m: Match) {
  const sk = m.spotKick;
  if (!sk || sk.done || m.owner >= 0 || m.t - sk.at > 1.4) return;
  const p = m.players[sk.gk];
  if (!p || p.off || p.act !== "none") return;
  if (m.t - sk.at < 0.08 + (1 - p.stats.gk / 100) * 0.3) return;
  if (sk.guess !== 0) {
    sk.done = true;
    p.act = "dive";
    p.actT = 0.6;
    p.dirX = 0;
    p.dirZ = sk.guess;
    return;
  }
  const b = m.ball;
  const line = -attackDir(m, p.team) * HALF_L;
  if (Math.abs(b.vx) < 1) return;
  const t = Math.max(0, (line - b.x) / b.vx);
  p.tx = p.x;
  p.tz = clamp(b.z + b.vz * t, -1.1, 1.1);
  p.sprint = true;
}

function concludeGoal(m: Match, team: Team, ev: MatchEvent[]) {
  // Une frappe repoussée ou déviée dans le but reste le but du tireur : le contre-son-camp, c'est autre chose
  const shot = m.players[m.shotBy];
  const fromShot = m.t - m.shotAt < 2.5 && shot?.team === team;
  const scorer = fromShot && m.players[m.lastTouch]?.team !== team ? m.shotBy : m.lastTouch;
  const scorerP = m.players[scorer];
  const own = scorerP ? scorerP.team !== team : false;
  ev.push({ k: "whistle", why: "goal" });
  const assist = !own && m.assistBy >= 0 && m.players[m.assistBy]?.team === team && m.assistBy !== scorer ? m.assistBy : -1;
  if (m.shootout) {
    shootoutResult(m, true, ev);
    return;
  }
  m.score[team]++;
  if (scorerP) scorerP.goals += own ? 0 : 1;
  const author = !own && scorerP?.human ? m.humans.find((o) => o.id === scorerP.human) : undefined;
  if (author) author.goals = (author.goals ?? 0) + 1;
  m.goals.push({
    team,
    scorer: scorerP?.name ?? "?",
    assist: assist >= 0 ? (m.players[assist]?.name ?? null) : null,
    minute: Math.min(Math.ceil(m.clock / 60), m.period >= 3 ? 120 : 90),
    own,
  });
  ev.push({ k: "goal", team, scorer, assist, own });
  m.phase = "goal";
  m.phaseUntil = m.t + GOAL_PAUSE;
  m.owner = -1;
  m.pass = null;
  m.offside = [];
  celebrate(m, scorerP && !own ? scorerP : null, team);
  // Le prochain coup d'envoi revient à l'équipe qui a encaissé
  m.restart = { kind: "kickoff", team: opponent(team), x: 0, z: 0, taker: -1, ready: false, readyAt: 0, deadline: 0, direct: false };
}

/**
 * Le buteur file vers le coin, du côté de la caméra de télévision (ou de l'autre si c'est bien plus près), et ses
 * coéquipiers proches viennent l'entourer ; les autres s'arrêtent. Tout le monde se tourne ensuite vers le public.
 */
function celebrate(m: Match, scorer: Player | null, team: Team) {
  m.celebrant = scorer ? scorer.i : -1;
  const dir = attackDir(m, team);
  const side = scorer && scorer.z < -12 ? -1 : 1;
  const spotX = dir * (HALF_L - 8);
  const spotZ = side * (HALF_W - 5);
  const joiners = scorer
    ? m.players.filter(
        (p) => p.team === team && p !== scorer && p.role !== "GK" && !p.off && Math.hypot(p.x - scorer.x, p.z - scorer.z) < 45,
      )
    : [];
  for (const p of m.players) {
    p.order = null;
    if (p.act === "kick" || p.act === "tackle") p.act = "none";
    p.runUntil = 0;
    p.sprint = false;
    p.tx = p.x;
    p.tz = p.z;
  }
  // L'équipe qui encaisse repart vers le rond central en marchant, tête basse : elle laisse la fête aux autres, et ne
  // passe pas devant la caméra du buteur
  for (const p of m.players) {
    if (p.team === team || p.off || p.role === "GK") continue;
    p.tx = p.x * 0.55;
    p.tz = p.z * 0.75;
  }
  if (!scorer) return;
  scorer.tx = spotX;
  scorer.tz = spotZ;
  scorer.sprint = true;
  // En arc de cercle derrière lui, du côté opposé à la caméra (qui filme depuis la grande tribune, côté z positif) : le
  // buteur au premier rang, ses coéquipiers qui arrivent derrière et sur les côtés, personne entre lui et l'objectif
  joiners.forEach((p, k) => {
    // Deux rangs, assez espacés pour que chacun ait sa place sans bousculer le voisin
    const a = ((k + 0.5) / joiners.length) * Math.PI;
    const r = 2.2 + (k % 2) * 1.2;
    p.tx = spotX - Math.cos(a) * r * 1.2;
    p.tz = clamp(spotZ - Math.sin(a) * r - 0.4, -HALF_W + 1, HALF_W - 1);
    p.sprint = true;
  });
}

/** Le ballon est-il sorti, ou entré ? */
function checkBounds(m: Match, ev: MatchEvent[]) {
  if (m.phase !== "play" || m.owner >= 0) {
    // Un ballon dans les mains du gardien ne sort pas et n'entre pas
    if (m.owner >= 0 && m.players[m.owner]!.act === "hold") return;
    if (m.phase === "play" && m.owner >= 0) {
      // Le porteur peut sortir le ballon
      const b = m.ball;
      if (Math.abs(b.z) <= HALF_W && Math.abs(b.x) <= HALF_L) return;
    } else return;
  }
  const b = m.ball;
  const r = BALL_R;
  if (Math.abs(b.x) > HALF_L + r) {
    const end = b.x > 0 ? 1 : -1;
    if (Math.abs(b.z) < GOAL_HALF - r * 0.5 && b.y < GOAL_H - r * 0.5) {
      const attacker: Team = attackDir(m, 0) === end ? 0 : 1;
      concludeGoal(m, attacker, ev);
      return;
    }
    // Sortie de but
    ev.push({ k: "whistle", why: "out" });
    if (m.shootout) {
      shootoutResult(m, false, ev);
      return;
    }
    const last = m.players[m.lastTouch];
    const attacking: Team = attackDir(m, 0) === end ? 0 : 1;
    if (last && last.team === attacking) {
      const def = opponent(attacking);
      beginRestart(m, "goalkick", def, end * (HALF_L - SIX_L), Math.sign(b.z || 1) * 7, ev, 1.3);
    } else {
      m.stats[attacking].corners++;
      beginRestart(m, "corner", attacking, end * (HALF_L - 0.3), Math.sign(b.z || 1) * (HALF_W - 0.3), ev, 1.6);
    }
    return;
  }
  if (Math.abs(b.z) > HALF_W + r) {
    ev.push({ k: "whistle", why: "out" });
    if (m.shootout) {
      shootoutResult(m, false, ev);
      return;
    }
    const last = m.players[m.lastTouch];
    const team: Team = last ? opponent(last.team) : 0;
    beginRestart(m, "throw", team, clamp(b.x, -HALF_L + 1, HALF_L - 1), Math.sign(b.z) * (HALF_W + 0.3), ev, 0.8);
  }
}

function tickClock(m: Match, ev: MatchEvent[]) {
  const half = m.settings.halfMinutes * 60;
  const extra = m.period >= 3;
  const rate = extra ? (15 * 60) / (half / 2) : (45 * 60) / half;
  m.clock += rate * DT;
  const limit = m.period === 1 ? 45 * 60 : m.period === 2 ? 90 * 60 : m.period === 3 ? 105 * 60 : 120 * 60;
  if (m.clock < limit) return;
  // On laisse finir une action qui approche du but
  const b = m.ball;
  const hot = Math.abs(b.x) > HALF_L - 30 && m.clock < limit + 180;
  if (!hot) endPeriod(m, ev);
}

/** Avance le match d'un pas ; rend ce qui s'est passé */
/**
 * Avance le match d'un pas, et note la vitesse à laquelle chacun s'est réellement déplacé : un joueur qui pousse contre un
 * autre, ou contre la distance d'une remise en jeu, ne doit pas être montré en train de courir sur place.
 */
export function stepMatch(m: Match): MatchEvent[] {
  if (m.phase === "over") return [];
  const before = m.players.map((p) => [p.x, p.z] as const);
  const ev = stepInner(m);
  for (let i = 0; i < m.players.length; i++) {
    const p = m.players[i]!;
    const [x0, z0] = before[i]!;
    const moved = Math.hypot(p.x - x0, p.z - z0) / DT;
    // Une remise en place d'un coup n'est pas une course
    const v = moved > 14 ? 0 : moved;
    p.seen = (p.seen ?? v) * 0.45 + v * 0.55;
  }
  return ev;
}

function stepInner(m: Match): MatchEvent[] {
  const ev: MatchEvent[] = [];
  m.t += DT;

  if (m.phase === "halftime") {
    if (m.t >= m.phaseUntil) {
      if (m.period === 1) {
        m.period = 2;
        m.clock = 45 * 60;
        m.flipped = !m.flipped;
        beginKickoff(m, 1, ev);
      } else if (m.period === 2) {
        // Prolongations décidées à la fin du temps réglementaire
        m.period = 3;
        beginKickoff(m, 0, ev);
      } else if (m.period === 3 && m.clock >= 105 * 60) {
        m.period = 4;
        m.clock = 105 * 60;
        m.flipped = !m.flipped;
        beginKickoff(m, 1, ev);
      } else {
        beginKickoff(m, 0, ev);
      }
    }
    return ev;
  }

  if (m.phase === "goal") {
    // Le ralenti se passe quand tous les humains l'ont demandé : celui qui veut le revoir le voit en entier
    const skip = (m.skipBy ??= []);
    for (const h of m.humans) {
      if (h.queue.some((a) => a.k === "skip") && !skip.includes(h.id)) skip.push(h.id);
      h.queue = [];
    }
    if (m.humans.length > 0 && m.humans.every((h) => skip.includes(h.id)) && m.t > m.phaseUntil - GOAL_PAUSE + GOAL_SKIP_AFTER)
      m.phaseUntil = Math.min(m.phaseUntil, m.t + 0.1);
    const hits = stepBall(m.ball, DT);
    if (hits.includes("net")) ev.push({ k: "net" });
    stepPlayers(m, ev);
    separate(m);
    if (m.t >= m.phaseUntil) beginKickoff(m, m.restart?.team ?? 0, ev);
    return ev;
  }

  runHumanActions(m, ev);

  if (m.phase === "kickoff" || m.phase === "restart") {
    const r = m.restart!;
    if (!r.ready && m.t >= r.readyAt) {
      r.ready = true;
      if (r.kind === "kickoff") {
        // Le tireur est déjà au centre (voir beginKickoff)
        const taker = m.players[r.taker]!;
        if (Math.hypot(taker.x, taker.z) > 0.3) stand(taker, 0, 0);
        taker.h = attackDir(m, r.team) > 0 ? 0 : Math.PI;
        m.owner = r.taker;
        m.lastTouch = r.taker;
        r.readyAt = m.t;
        r.deadline = m.t + HUMAN_RESTART_WAIT;
        syncRestartHuman(m);
        ev.push({ k: "whistle", why: "kickoff" });
      } else if (!walksIn(m)) setUpRestart(m);
      else {
        // Le tireur va chercher le ballon : on joue quand il y est (ou, s'il traîne, on change de plan et il y est)
        const taker = m.players[r.taker]!;
        const [sx, sz] = takerSpot(m);
        const d = Math.hypot(taker.x - sx, taker.z - sz);
        if (taker.off) r.taker = pickTaker(m, r.kind, r.team, r.x, r.z);
        else if (d < WALK_ARRIVED) setUpRestart(m);
        else if (m.t >= r.readyAt + WALK_MAX) {
          m.cuts++;
          setUpRestart(m);
        } else if (taker.act === "none") {
          taker.tx = sx;
          taker.tz = sz;
          taker.sprint = d > 14;
        }
      }
    }
    if (r.ready) {
      const taker = m.players[r.taker]!;
      const human = taker.human !== null;
      // Un instant pour souffler : le mur est en place, le tireur lève la tête
      const delay = r.kind === "throw" ? 0.5 : r.kind === "kickoff" ? 0.3 : r.kind === "free" ? 1.3 : r.kind === "penalty" ? 1.2 : 0.9;
      const auto = human ? m.t >= r.deadline : m.t >= r.readyAt + delay;
      if (auto && !taker.order) autoRestart(m, taker);
      // Pendant une touche ou un dégagement, les autres se démarquent
      if (r.kind === "throw" || r.kind === "goalkick" || r.kind === "kickoff" || r.kind === "free") {
        if (m.t >= m.brainAt && r.kind !== "kickoff" && !wallFree(m)) {
          m.brainAt = m.t + 0.2;
          thinkTeam(m, 0);
          thinkTeam(m, 1);
        }
      }
    }
    keepDistance(m);
    stepPlayers(m, ev);
    separate(m);
    return ev;
  }

  if (m.t >= m.brainAt) {
    m.brainAt = m.t + 0.14;
    thinkTeam(m, 0);
    thinkTeam(m, 1);
  }
  carriers(m);
  defenders(m);
  keeperSmother(m);
  spotKeeper(m);
  for (const p of m.players) if (p.role === "GK" && !p.off && p.human === null && p.act !== "down") keeperReadsShot(m, p);
  stepPlayers(m, ev);
  if (m.phase !== "play") return ev;
  separate(m);
  tackles(m, ev);
  if (m.phase !== "play") return ev;

  if (m.owner >= 0) {
    carryBall(m);
    m.stats[m.players[m.owner]!.team].possession += DT;
  } else {
    const hits = stepBall(m.ball, DT);
    for (const hit of hits) {
      if (hit === "post") ev.push({ k: "woodwork", bar: false });
      else if (hit === "bar") ev.push({ k: "woodwork", bar: true });
    }
    // Une passe qui n'arrive plus : le receveur désigné n'est plus attendu
    if (m.pass && m.t > m.pass.until) m.pass = null;
    ballContacts(m, ev);
  }
  if (m.phase === "play") checkBounds(m, ev);
  if (m.phase === "play") {
    // La séance de tirs au but : un tir arrêté, ou un ballon qui ne va plus nulle part, c'est manqué
    if (m.shootout && (m.t - m.shotAt > 3.2 || m.owner >= 0)) {
      if (m.owner >= 0) m.owner = -1;
      shootoutResult(m, false, ev);
      return ev;
    }
    if (!m.shootout) tickClock(m, ev);
  }
  return ev;
}

export { pressureOn };
