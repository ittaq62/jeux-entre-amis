// Le déroulement d'un match : courir, toucher le ballon, tacler, siffler, reprendre le jeu, marquer, changer de côté.

import { BALL_R, makeBall, rollingAt, stepBall } from "./ball.ts";
import { levelOf, steerCarrier, thinkCarrier, thinkTeam } from "./brain.ts";
import { makeSquad, type TeamSetup } from "./clubs.ts";
import { openness, orderKick, pickReceiver, pressureOn, releaseKick } from "./kicks.ts";
import {
  attackDir,
  BURST_COOLDOWN,
  BURST_S,
  BURST_SPEED,
  faceTo,
  newTeamStats,
  opponent,
  random,
  spendEnergy,
  steer,
  topSpeed,
  type Human,
  type HumanAction,
  type KickKind,
  type Match,
  type MatchEvent,
  type MatchSettings,
  type Player,
  type RestartKind,
  type Team,
} from "./model.ts";
import { BOX_HALF, BOX_L, CIRCLE_R, clamp, DT, GOAL_H, GOAL_HALF, HALF_L, HALF_W, inBox, lerp, onPitch, SIX_L, SPOT_L } from "./pitch.ts";

const REACH = 0.95;
/** Celui à qui la passe est destinée la contrôle d'un peu plus loin : elle doit arriver dans ses pieds */
const RECEIVE_REACH = 1.45;
const HEADER_REACH = 1.05;
const SEPARATION = 0.85;
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
/** Le temps laissé à un humain pour tirer une remise en jeu : ensuite, l'ordinateur la tire pour lui */
const HUMAN_RESTART_WAIT = 3.5;

const KICK_KINDS: readonly string[] = ["pass", "through", "lob", "shot", "finesse", "chip", "clear", "cross"];
const isKick = (k: string): k is KickKind => KICK_KINDS.includes(k);

export function createMatch(
  settings: MatchSettings,
  teams: [TeamSetup, TeamSetup],
  humans: { id: string; team: Team }[],
  seed: number,
): Match {
  const side = settings.side;
  const players = [...makeSquad(0, teams[0], side, seed ^ 0x1234, 0), ...makeSquad(1, teams[1], side, seed ^ 0x9876, side)];
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

/** Donne à cet humain le joueur libre le plus proche du ballon (hors gardien), en évitant celui qu'il dirige déjà si demandé */
function pickActive(m: Match, h: Human, avoid = -1) {
  const taken = new Set(m.humans.filter((o) => o !== h).map((o) => o.active));
  let best = -1;
  let bd = Infinity;
  for (const p of m.players) {
    if (p.team !== h.team || p.off || p.role === "GK" || taken.has(p.i) || p.i === avoid) continue;
    const d = Math.hypot(p.x - m.ball.x, p.z - m.ball.z);
    if (d < bd) {
      bd = d;
      best = p.i;
    }
  }
  if (best >= 0) h.active = best;
  syncHumans(m);
}

/** Le ballon arrive à un coéquipier : si personne ne le dirige, l'humain le prend */
function followBall(m: Match, id: number) {
  const p = m.players[id]!;
  if (p.human !== null || p.role === "GK") return;
  const h = m.humans.find((o) => o.team === p.team);
  if (!h) return;
  // Avec plusieurs humains dans l'équipe, c'est celui qui est le plus près
  const best = m.humans
    .filter((o) => o.team === p.team)
    .map((o) => ({ o, d: Math.hypot(m.players[o.active]!.x - p.x, m.players[o.active]!.z - p.z) }))
    .sort((a, b) => a.d - b.d)[0];
  if (best) best.o.active = p.i;
  syncHumans(m);
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

/** L'adversaire vient de prendre le ballon : chaque humain reprend le joueur le mieux placé, s'il y en a un nettement plus près */
function defendSwitch(m: Match, owner: Player) {
  for (const h of m.humans) {
    if (h.team === owner.team) continue;
    const current = m.players[h.active];
    const here = current ? Math.hypot(current.x - owner.x, current.z - owner.z) : Infinity;
    const taken = new Set(m.humans.filter((o) => o !== h).map((o) => o.active));
    let best = -1;
    let bd = Infinity;
    for (const p of m.players) {
      if (p.team !== h.team || p.off || p.role === "GK" || taken.has(p.i)) continue;
      const d = Math.hypot(p.x - owner.x, p.z - owner.z);
      if (d < bd) {
        bd = d;
        best = p.i;
      }
    }
    if (best >= 0 && bd < here - 4) h.active = best;
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
}

export function pushAction(m: Match, id: string, k: HumanAction["k"], p: number, mx: number, mz: number, to = -1) {
  const h = m.humans.find((o) => o.id === id);
  if (!h || h.queue.length > 6) return;
  h.queue.push({ k, p: clamp(p, 0, 1), mx, mz, at: m.t, to: Number.isInteger(to) ? to : -1 });
}

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
        if (m.owner !== h.active) pickActive(m, h, h.active);
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
      if (m.owner === p.i && isKick(a.k)) {
        if (!p.order && p.act === "none") orderKick(p, { kind: a.k, power: a.p, ax: a.mx, az: a.mz, to: a.to });
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
    orderKick(p, { kind, power: a.p, ax: a.mx, az: a.mz, to: a.to });
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
  taker.h = Math.atan2(-r.z * 0.2, dir);
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
  } else if (r.kind === "penalty") {
    m.cuts++;
    const outside = dir * (HALF_L - BOX_L - 2);
    [...ours, ...theirs].forEach((p, n) => {
      const z = -14 + n * 1.45;
      // Hors de l'arc aussi : à 9 m 15 du point
      const x = outside - dir * (n % 3) * 1.6;
      const sx = dir * (HALF_L - SPOT_L);
      const d = Math.hypot(x - sx, z);
      const k = d < CIRCLE_R + 0.6 ? (CIRCLE_R + 0.6) / Math.max(d, 0.1) : 1;
      stand(p, sx + (x - sx) * k, z * k);
    });
    const gk = keeperOf(m, foes);
    if (gk) stand(gk, dir * (HALF_L - 0.1), 0);
    taker.h = dir > 0 ? 0 : Math.PI;
    stand(taker, r.x - dir * 1.3, r.z);
  } else if (r.kind === "goalkick") {
    m.cuts++;
    const own = -dir;
    theirs.forEach((p) => {
      if (inBox(p.x, p.z, own)) stand(p, own * (HALF_L - BOX_L - 2), clamp(p.z, -BOX_HALF, BOX_HALF));
    });
  } else if (r.kind === "free") {
    const dGoal = Math.hypot(dir * HALF_L - r.x, r.z);
    // Le mur, sur la ligne du but, à 9 m 15
    if (dGoal < 32 && Math.abs(r.z) < BOX_HALF + 8) {
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
    } else {
      // Loin du but : on s'écarte du ballon
      for (const p of theirs) {
        const d = Math.hypot(p.x - r.x, p.z - r.z);
        if (d < CIRCLE_R) {
          const ax = (p.x - r.x) / (d || 1);
          const az = (p.z - r.z) / (d || 1);
          [p.x, p.z] = onPitch(r.x + ax * CIRCLE_R, r.z + az * CIRCLE_R, 1);
        }
      }
    }
  } else if (r.kind === "throw") {
    // Rien à replacer : les autres continuent de se démarquer
  }
  keepDistance(m);
  syncRestartHuman(m);
}

/**
 * Pendant qu'une remise en jeu attend, chacun respecte les distances : 9 m 15 du ballon (2 m sur une touche),
 * hors de la surface au coup de pied de but et au penalty, chacun dans son camp à l'engagement. Humains compris.
 */
function keepDistance(m: Match) {
  const r = m.restart;
  if (!r || !r.ready || m.phase === "play") return;
  const foes = opponent(r.team);
  const pushOut = (p: Player, cx: number, cz: number, gap: number) => {
    const d = Math.hypot(p.x - cx, p.z - cz);
    if (d >= gap - 0.05) return;
    const ax = d > 0.01 ? (p.x - cx) / d : -attackDir(m, p.team);
    const az = d > 0.01 ? (p.z - cz) / d : 0;
    [p.x, p.z] = onPitch(cx + ax * gap, cz + az * gap, 1);
  };
  const outOfBox = (p: Player, end: number) => {
    if (inBox(p.x, p.z, end)) p.x = end * (HALF_L - BOX_L - 0.8);
  };
  for (const p of m.players) {
    if (p.off || p.i === r.taker) continue;
    if (r.kind === "penalty") {
      if (p.role === "GK") continue;
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
    orderKick(p, { kind: "shot", power: 0.6 + random(m) * 0.2, ax: 0, az: side * (0.55 + random(m) * 0.45), to: -1 });
  } else {
    const dGoal = Math.hypot(dir * HALF_L - r.x, r.z);
    if (dGoal < 29) orderKick(p, { kind: "finesse", power: 0.66 + random(m) * 0.16, ax: 0, az: random(m) < 0.5 ? -1 : 1, to: -1 });
    else {
      const to = pickReceiver(m, p, dir, 0);
      orderKick(p, { kind: "pass", power: 0.5, ax: dir, az: 0, to });
    }
  }
}

function beginKickoff(m: Match, team: Team, ev: MatchEvent[]) {
  freeze(m);
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
  void ev;
}

function endPeriod(m: Match, ev: MatchEvent[]) {
  ev.push({ k: "whistle", why: m.period === 1 || m.period === 3 ? "half" : "end" });
  freeze(m);
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
    if (p.off) continue;
    if (p.actT > 0) p.actT -= DT;

    // Les gestes qui commandent le corps
    if (p.act === "down") {
      steer(p, 0, 0, 0);
      if (p.actT <= 0) p.act = "none";
      continue;
    }
    if (p.act === "dive") {
      // Au penalty, il s'est jeté au jugé : plus ou moins loin
      const v = (9.5 * (p.actT / 0.6) + 1.5) * (m.spotKick?.gk === p.i ? m.spotKick.dive : 1);
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
      faceTo(p, attackDir(m, p.team) * HALF_L, 0);
      p.x = clamp(p.x, -HALF_L + 0.4, HALF_L - 0.4);
      continue;
    }

    // Aux tirs au but, une fois le ballon frappé, seul le gardien bouge : les autres regardent depuis le rond
    if (m.shootout && live && p.role !== "GK") {
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
          m.spotKick = { at: m.t, gk: keeperOf(m, opponent(r.team))?.i ?? -1, guess, dive: 0.45 + random(m) * 0.4, done: false };
          if (m.shootout) m.shotAt = m.t;
        }
        m.restart = null;
        // L'humain ne garde pas le gardien : il retrouve un joueur de champ
        if (p.role === "GK") for (const o of m.humans) if (o.active === p.i) pickActive(m, o);
      }
      continue;
    }

    if (p.act === "kick" && p.actT <= 0) {
      if (m.owner === p.i) releaseKick(m, p, ev);
      else p.order = null;
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
    } else if (h && m.phase !== "goal") {
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
        speed = topSpeed(p, sprinting, mine) * clamp(d / 2.5 + 0.2, 0, 1) * levelOf(m).speed;
      }
    }
    steer(p, wx, wz, speed * slowed);
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

/** Les joueurs ne se traversent pas ; le plus solide déplace l'autre */
function separate(m: Match) {
  const list = m.players;
  for (let a = 0; a < list.length; a++) {
    const p = list[a]!;
    if (p.off || p.act === "dive") continue;
    for (let b = a + 1; b < list.length; b++) {
      const q = list[b]!;
      if (q.off || q.act === "dive") continue;
      const dx = q.x - p.x;
      if (dx > SEPARATION || dx < -SEPARATION) continue;
      const dz = q.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d >= SEPARATION || d < 1e-4) continue;
      const push = SEPARATION - d;
      // Le gardien qui tient le ballon, et le tireur d'une remise en jeu, ne se laissent pas pousser
      const fixed = (o: typeof p) => o.act === "hold" || (m.restart?.ready === true && m.restart.taker === o.i && m.phase !== "play");
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
  beginRestart(m, "free", opponent(p.team), clamp(p.x, -HALF_L + 2, HALF_L - 2), clamp(p.z, -HALF_W + 1, HALF_W - 1), ev, 1);
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
  p.thinkAt = m.t + levelOf(m).think * (0.4 + random(m) * 0.8);
  ev.push({ k: "touch", p: p.i });
  followBall(m, p.i);
  defendSwitch(m, p);
  // Une frappe demandée juste avant : la reprise
  const h = p.human ? m.humans.find((o) => o.id === p.human) : null;
  if (h) {
    const a = h.queue.find((x) => isKick(x.k));
    if (a) {
      h.queue = h.queue.filter((x) => x !== a);
      orderKick(p, { kind: a.k as KickKind, power: a.p, ax: a.mx, az: a.mz, to: a.to });
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
  const reach = spot ? 1.0 : diving ? 2.7 : 1.8;
  if (Math.hypot(b.x - p.x, b.z - p.z) > reach || b.y > (diving ? 2.4 : 2.85)) return false;
  // Une passe de son coéquipier se joue au pied
  if (m.players[m.lastTouch]?.team === p.team && m.pass) return false;
  const speed = Math.hypot(b.vx, b.vy, b.vz);
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
    const to = own ? -1 : pickReceiver(m, p, dir, 0);
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
    if (p.role === "GK" && keeperTouch(m, p, ev)) return;
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
    const base = clamp(0.98 - (rel - 8) / 22 + (best.stats.tac - 70) / 150, 0.3, 0.98) * levelOf(m).read;
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
      if (owner && (owner.team === p.team || owner.burstUntil > m.t || owner.act === "hold")) continue;
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
      if (!owner || owner.team === p.team || owner.act === "hold") continue;
      const d = Math.hypot(owner.x - p.x, owner.z - p.z);
      if (d > 1.7) continue;
      // De face, c'est plus sûr ; de dos, on risque la faute
      const behind = Math.cos(owner.h) * (p.x - owner.x) + Math.sin(owner.h) * (p.z - owner.z) < -0.25;
      const tune = p.human ? 1.3 : levelOf(m).tackle * (owner.human !== null ? 0.8 : 1);
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
  m.stats[p.team].fouls++;
  ev.push({ k: "whistle", why: "foul" });
  ev.push({ k: "foul", p: p.i, on: victim.i, penalty });
  victim.act = "down";
  victim.actT = DOWN_S + 0.4;
  // Par derrière ou dernier défenseur : carton
  const behind = Math.cos(victim.h) * (p.x - victim.x) + Math.sin(victim.h) * (p.z - victim.z) < -0.4;
  const defenders = m.players.filter((q) => q.team === p.team && !q.off && q.x * dir > victim.x * dir).length;
  const lastMan = defenders <= 1 && victim.x * dir > 20 && Math.abs(victim.z) < 18;
  const yellowChance = (slide ? 0.18 : 0.06) + (behind ? 0.2 : 0);
  if (lastMan) card(m, p, true, ev);
  else if (random(m) < yellowChance) card(m, p, false, ev);
  if (penalty) beginRestart(m, "penalty", victim.team, dir * (HALF_L - SPOT_L), 0, ev, 1.4, true);
  else {
    const [x, z] = onPitch(victim.x, victim.z, 1);
    beginRestart(m, "free", victim.team, x, z, ev, 1, true);
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
  p.off = true;
  p.act = "none";
  p.order = null;
  p.x = 0;
  p.z = HALF_W + 6;
  if (m.owner === p.i) m.owner = -1;
  for (const h of m.humans) if (h.active === p.i) pickActive(m, h);
}

/** Le gardien remet en jeu ce qu'il a capté, ou l'ordinateur décide pour ceux qui ont le ballon */
function carriers(m: Match) {
  if (m.owner < 0 || m.phase !== "play") return;
  const p = m.players[m.owner]!;
  if (p.human !== null || p.order || p.act === "down") return;
  if (p.act === "hold" && m.t < p.thinkAt) return;
  if (m.t >= p.thinkAt) {
    p.thinkAt = m.t + levelOf(m).think * (0.7 + random(m) * 0.6);
    thinkCarrier(m, p);
  } else if (p.act === "none") steerCarrier(m, p);
}

/** Les joueurs de l'ordinateur tentent le tacle quand le porteur est à portée ; un humain qui presse le fait d'un seul bouton */
function defenders(m: Match) {
  if (m.owner < 0 || m.phase !== "play") return;
  const owner = m.players[m.owner]!;
  if (owner.act === "hold") return;
  for (const h of m.humans) {
    const p = m.players[h.active];
    if (!p || !h.press || p.team === owner.team || p.act !== "none" || m.t < p.lockedUntil) continue;
    if (Math.hypot(owner.x - p.x, owner.z - p.z) < 1.6) {
      startTackle(p, false, h, m);
      p.lockedUntil = m.t + 0.55;
    }
  }
  for (const p of m.players) {
    if (p.team === owner.team || p.off || p.human !== null || p.act !== "none" || p.role === "GK") continue;
    const d = Math.hypot(owner.x - p.x, owner.z - p.z);
    const behind = Math.cos(owner.h) * (p.x - owner.x) + Math.sin(owner.h) * (p.z - owner.z) < -0.25;
    const ownBox = inBox(owner.x, owner.z, -attackDir(m, p.team));
    if (ownBox && behind) continue;
    if (d < 1.55 && m.t > p.lockedUntil && random(m) < (owner.human !== null ? 0.05 : 0.09) * levelOf(m).tackle) {
      startTackle(p, false, null, m);
      p.lockedUntil = m.t + 0.6;
    } else if (d < 3.2 && d > 1.8 && random(m) < 0.008 * levelOf(m).tackle && !inBox(p.x, p.z, -attackDir(m, p.team))) {
      startTackle(p, true, null, m);
    }
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
  if (!scorer) return;
  scorer.tx = spotX;
  scorer.tz = spotZ;
  scorer.sprint = true;
  // En demi-cercle autour de lui, côté terrain
  joiners.forEach((p, k) => {
    const a = ((k + 0.5) / joiners.length) * Math.PI;
    const r = 1.7 + (k % 2) * 0.7;
    p.tx = spotX - dir * Math.sin(a) * r;
    p.tz = clamp(spotZ - side * Math.cos(a) * r * 0.9 - side * 0.6, -HALF_W + 1, HALF_W - 1);
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
      beginRestart(m, "goalkick", def, end * (HALF_L - SIX_L), Math.sign(b.z || 1) * 7, ev, 0.9);
    } else {
      m.stats[attacking].corners++;
      beginRestart(m, "corner", attacking, end * (HALF_L - 0.3), Math.sign(b.z || 1) * (HALF_W - 0.3), ev, 1.1);
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
    beginRestart(m, "throw", team, clamp(b.x, -HALF_L + 1, HALF_L - 1), Math.sign(b.z) * (HALF_W + 0.3), ev, 0.5);
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
export function stepMatch(m: Match): MatchEvent[] {
  const ev: MatchEvent[] = [];
  if (m.phase === "over") return ev;
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
    for (const h of m.humans) {
      if (h.queue.some((a) => a.k === "skip") && m.t > m.phaseUntil - GOAL_PAUSE + GOAL_SKIP_AFTER)
        m.phaseUntil = Math.min(m.phaseUntil, m.t + 0.1);
      h.queue = [];
    }
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
        // Le tireur est déjà au centre
        const taker = m.players[r.taker]!;
        stand(taker, 0, 0);
        taker.h = attackDir(m, r.team) > 0 ? 0 : Math.PI;
        m.owner = r.taker;
        m.lastTouch = r.taker;
        r.readyAt = m.t;
        r.deadline = m.t + HUMAN_RESTART_WAIT;
        syncRestartHuman(m);
        ev.push({ k: "whistle", why: "kickoff" });
      } else setUpRestart(m);
    }
    if (r.ready) {
      const taker = m.players[r.taker]!;
      const human = taker.human !== null;
      const delay = r.kind === "throw" ? 0.4 : r.kind === "kickoff" ? 0.3 : 0.8;
      const auto = human ? m.t >= r.deadline : m.t >= r.readyAt + delay;
      if (auto && !taker.order) autoRestart(m, taker);
      // Pendant une touche ou un dégagement, les autres se démarquent
      if (r.kind === "throw" || r.kind === "goalkick" || r.kind === "kickoff" || r.kind === "free") {
        if (m.t >= m.brainAt && r.kind !== "kickoff" && !(r.kind === "free" && Math.hypot(attackDir(m, r.team) * HALF_L - r.x, r.z) < 32)) {
          m.brainAt = m.t + 0.2;
          thinkTeam(m, 0);
          thinkTeam(m, 1);
        }
      }
    }
    stepPlayers(m, ev);
    separate(m);
    keepDistance(m);
    return ev;
  }

  if (m.t >= m.brainAt) {
    m.brainAt = m.t + 0.14;
    thinkTeam(m, 0);
    thinkTeam(m, 1);
  }
  carriers(m);
  defenders(m);
  spotKeeper(m);
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
