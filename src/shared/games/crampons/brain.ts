// L'intelligence des équipes : tenir sa place, se démarquer, presser, couvrir, et décider quoi faire du ballon.

import { cloneBall, stepBall } from "./ball.ts";
import { offsideLine, openness, orderKick, pressureOn, runSpaceAhead } from "./kicks.ts";
import {
  assisted,
  attackDir,
  inKeeperHands,
  opponent,
  random,
  releaseFromHands,
  topSpeed,
  type Match,
  type Player,
  type Team,
} from "./model.ts";
import { BOX_L, clamp, GOAL_H, GOAL_HALF, HALF_L, HALF_W, inBox, lerp, onPitch } from "./pitch.ts";

/** Ce qui change d'un niveau à l'autre : le temps de réaction, l'œil pour la passe, le pressing */
const LEVELS = [
  { think: 0.5, press: 0.55, vision: 0.55, keeper: 0.3, tackle: 0.7, speed: 0.92, react: 0.5, read: 0.65, keeperErr: 1.6 },
  { think: 0.34, press: 0.75, vision: 0.75, keeper: 0.24, tackle: 0.95, speed: 0.97, react: 0.4, read: 0.8, keeperErr: 1.3 },
  { think: 0.22, press: 0.9, vision: 0.9, keeper: 0.18, tackle: 1.15, speed: 1, react: 0.32, read: 0.95, keeperErr: 1.0 },
  { think: 0.14, press: 1, vision: 1, keeper: 0.13, tackle: 1.4, speed: 1.03, react: 0.24, read: 1.1, keeperErr: 0.8 },
];

export const levelOf = (m: Match) => LEVELS[clamp(m.settings.level, 0, 3)]!;

/** Un humain sur cette équipe : l'ordinateur reste au niveau normal pour ses coéquipiers */
const isOurs = (m: Match, team: Team) => m.humans.some((h) => h.team === team);
const tuning = (m: Match, team: Team) => (isOurs(m, team) ? LEVELS[2]! : levelOf(m));

interface FlightPoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

/** Où sera le ballon libre dans les prochaines secondes */
function predictFlight(m: Match): FlightPoint[] {
  const sim = cloneBall(m.ball);
  const out: FlightPoint[] = [];
  for (let i = 1; i <= 30; i++) {
    stepBall(sim, 0.1);
    out.push({ t: i * 0.1, x: sim.x, y: sim.y, z: sim.z });
  }
  return out;
}

/** Le premier point de la trajectoire que ce joueur peut atteindre, et quand */
function intercept(p: Player, path: FlightPoint[], lag: number): FlightPoint | null {
  const v = topSpeed(p, true, false);
  for (const f of path) {
    if (f.y > 2.3) continue;
    const reach = Math.max(0, f.t - lag) * v + 0.8;
    if (Math.hypot(f.x - p.x, f.z - p.z) <= reach) return f;
  }
  return null;
}

const free = (p: Player) => !p.off && p.act !== "down";

function goalSide(m: Match, p: Player, x: number, z: number, gap: number): [number, number] {
  const own = -attackDir(m, p.team) * HALF_L;
  const dx = own - x;
  const dz = -z;
  const d = Math.hypot(dx, dz) || 1;
  return [x + (dx / d) * gap, z + (dz / d) * gap];
}

/** Sa place normale dans le bloc, qui suit le ballon, resserré sans le ballon et ouvert avec */
export function shapeSpot(m: Match, p: Player, inPossession: boolean): [number, number] {
  const dir = attackDir(m, p.team);
  const bx = m.ball.x * dir;
  // Le porteur a le temps de lever la tête : la défense recule pour ne rien laisser dans son dos (peu à peu, selon la
  // pression qu'il subit : un seuil ferait reculer et remonter toute la ligne d'un coup à chaque pas de l'adversaire)
  const owner = m.owner >= 0 ? m.players[m.owner]! : null;
  const time = !inPossession && owner !== null ? 1 - clamp((pressureOn(m, owner) - 0.2) / 0.3, 0, 1) : 0;
  const defLine = clamp(bx - (inPossession ? 27 : 19 + time * 8), -41, inPossession ? 16 : 8);
  const atkLine = clamp(bx + (inPossession ? 17 : 9), -12, 46);
  const x = lerp(defLine, atkLine, p.fx);
  const width = inPossession ? 0.92 : 0.62;
  const z = p.fz * HALF_W * width + m.ball.z * (inPossession ? 0.18 : 0.34);
  return onPitch(x * dir, z, 2);
}

/** Se démarquer : parmi quelques points autour du porteur, le plus libre et le plus utile */
function supportSpot(m: Match, p: Player, carrier: Player): [number, number] {
  const dir = attackDir(m, p.team);
  const line = offsideLine(m, p.team);
  let best: [number, number] = [p.x, p.z];
  let bestScore = -Infinity;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const r = 9 + (k % 3) * 5;
    let x = carrier.x + Math.cos(a) * r;
    const z = carrier.z + Math.sin(a) * r;
    if (x * dir > line - 0.5 && x * dir > carrier.x * dir) x = (line - 0.5) * dir;
    const [sx, sz] = onPitch(x, z, 3);
    const space = Math.min(openness(m, p.team, sx, sz), 11) / 11;
    const forward = ((sx - carrier.x) * dir) / 20;
    const near = Math.hypot(sx - p.x, sz - p.z) / 30;
    const crowd = m.players.some((q) => q.team === p.team && q.i !== p.i && Math.hypot(q.x - sx, q.z - sz) < 5) ? 0.5 : 0;
    const score = space * 1.1 + forward * 0.55 - near - crowd;
    if (score > bestScore) {
      bestScore = score;
      best = [sx, sz];
    }
  }
  return best;
}

function nearestOf(m: Match, team: Team, x: number, z: number, skip: (p: Player) => boolean): Player[] {
  return m.players
    .filter((p) => p.team === team && free(p) && !skip(p))
    .map((p) => ({ p, d: Math.hypot(p.x - x, p.z - z) }))
    .sort((a, b) => a.d - b.d)
    .map((e) => e.p);
}

/**
 * Une frappe qui vient vers son but : un instant après le départ, il la lit (pas au centimètre), s'y porte à petits pas
 * et plonge si elle s'écarte de lui. Appelé à chaque pas du match, pas seulement quand l'équipe réfléchit : sinon sa
 * réaction dépendrait du hasard du calendrier. Rend vrai s'il s'en occupe.
 */
export function keeperReadsShot(m: Match, p: Player): boolean {
  const own = -attackDir(m, p.team);
  const line = own * HALF_L;
  const b = m.ball;
  // Au penalty, il a déjà choisi son côté (voir spotKeeper)
  const sk = m.spotKick;
  if (sk && sk.gk === p.i && m.t - sk.at < 1.4) return true;
  if (m.owner < 0 && b.vx * own > 4) {
    const t = (line - b.x) / b.vx;
    if (t > 0 && t < 2) {
      const zAt = b.z + b.vz * t;
      const yAt = b.y + b.vy * t - 5.5 * t * t;
      if (Math.abs(zAt) < GOAL_HALF + 0.9 && yAt < GOAL_H + 0.8) {
        const react = tuning(m, p.team).keeper * (1.4 - p.stats.gk / 100);
        if (m.t - m.shotAt >= react) {
          // Il lit la frappe, mais pas au centimètre : plus elle est forte, plus elle vient de loin (elle flotte, plonge,
          // s'enroule) et plus lui est moyen, plus il se trompe
          if (m.keeperRead?.shotAt !== m.shotAt) {
            const speed = Math.hypot(b.vx, b.vz);
            const spread = (0.3 + speed * 0.03 + (m.shotDist ?? 15) * 0.025) * (1.25 - p.stats.gk / 100) * tuning(m, p.team).keeperErr;
            m.keeperRead = { shotAt: m.shotAt, err: (random(m) * 2 - 1) * spread };
          }
          const zSeen = zAt + m.keeperRead.err;
          const lateral = zSeen - p.z;
          // Il reste à sa hauteur (sorti pour fermer l'angle, il ne recule pas) et se décale
          p.tx = clamp(p.x, -HALF_L + 0.4, HALF_L - 0.4);
          p.tz = clamp(zSeen, -GOAL_HALF - 0.5, GOAL_HALF + 0.5);
          // Face à une frappe, il se décale à petits pas : on ne traverse pas son but au sprint
          p.sprint = false;
          if (p.act === "none" && Math.abs(lateral) > 0.75 && t < 0.62) {
            p.act = "dive";
            p.actT = 0.6;
            const s = Math.sign(lateral);
            p.dirX = 0;
            p.dirZ = s;
            // Juste assez loin pour que le ballon arrive dans ses bras : plonger trop loin, c'est le laisser passer derrière soi
            const T = Math.min(t, 0.6);
            const full = (9.17 * (0.36 - (0.6 - T) * (0.6 - T))) / 2 + 0.8 * T;
            p.diveK = clamp((Math.abs(lateral) - 0.35) / Math.max(full, 0.1), 0.3, 1);
          }
          return true;
        }
      }
    }
  }
  return false;
}

/** Le gardien : sur la ligne de tir, il avance selon le danger, plonge sur les frappes, sort sur les ballons qu'il atteindra le premier */
function thinkKeeper(m: Match, p: Player, path: FlightPoint[] | null) {
  const dir = attackDir(m, p.team);
  const own = -dir;
  const line = own * HALF_L;
  const b = m.ball;
  if (m.owner === p.i) return;
  p.sprint = false;
  // Le penalty : il a choisi son côté au moment de la frappe, il ne lit pas la trajectoire (le plongeon se décide à
  // chaque pas du match, voir spotKeeper)
  const sk = m.spotKick;
  if (sk && sk.gk === p.i && m.owner < 0 && m.t - sk.at < 1.4) {
    if (sk.guess !== 0) {
      p.tx = p.x;
      p.tz = p.z;
    }
    return;
  }
  if (keeperReadsShot(m, p)) return;
  // Une balle en profondeur qu'il atteint le premier
  if (m.owner < 0 && path && inBox(b.x + b.vx * 0.5, b.z + b.vz * 0.5, own)) {
    const mine = intercept(p, path, 0.1);
    if (mine && inBox(mine.x, mine.z, own)) {
      const foe = m.players
        .filter((q) => q.team !== p.team && free(q))
        .some((q) => {
          const f = intercept(q, path, 0);
          return f !== null && f.t < mine.t;
        });
      if (!foe) {
        p.tx = mine.x;
        p.tz = mine.z;
        p.sprint = true;
        return;
      }
    }
  }
  // Sa place : entre le ballon et le centre du but, plus avancé si le ballon est loin. Un attaquant arrive balle au
  // pied : il sort à sa rencontre pour lui fermer l'angle, de plus en plus à mesure qu'il approche, et reste un pas
  // devant lui (reculer sur sa ligne, c'est lui laisser tout le but et finir dans ses filets) ; de tout près, il se jette
  // dans ses pieds (voir keeperSmother)
  const dBall = Math.hypot(b.x - line, b.z);
  const carrier = m.owner >= 0 ? m.players[m.owner]! : null;
  const threat = carrier !== null && carrier.team !== p.team && dBall < 22;
  const out = threat ? clamp(Math.min(dBall - 1.6, 1.2 + (22 - dBall) * 0.28), 1.2, 6.5) : clamp(dBall * 0.18, 1.2, 7);
  const gx = line + (b.x - line) * (out / Math.max(dBall, 1));
  const gz = (b.z / Math.max(dBall, 1)) * out * (threat ? 1 : 1.25);
  p.tx = gx;
  p.tz = clamp(gz, -GOAL_HALF - (threat ? 3 : 1), GOAL_HALF + (threat ? 3 : 1));
  // Il se jette au-devant de l'attaquant : vite, sans traîner en chemin
  p.sprint = threat && Math.hypot(gx - p.x, p.tz - p.z) > 1.5;
}

/** Les décisions de toute une équipe : à chaque joueur son rôle et sa destination */
export function thinkTeam(m: Match, team: Team) {
  const tune = tuning(m, team);
  const dir = attackDir(m, team);
  const owner = m.owner >= 0 ? m.players[m.owner]! : null;
  const inPossession = owner ? owner.team === team : m.lastTouch >= 0 && m.players[m.lastTouch]?.team === team;
  const path = m.owner < 0 ? predictFlight(m) : null;
  // Le joueur d'un humain qui ne touche plus à rien en défense : l'ordinateur le fait défendre comme les autres
  const human = (p: Player) => p.human !== null && !assisted(m, p);
  // Le bloc ne se retourne qu'une fois le ballon gardé un instant : dans une mêlée, chaque contact ne renvoie pas toute
  // l'équipe en sens inverse (des joueurs qui courent dans un sens puis dans l'autre, pour rien)
  if (m.phase !== "play") m.shapeTeam = undefined;
  else if (owner && m.t - owner.gotAt >= 0.45) m.shapeTeam = owner.team;
  const shapeIn = m.phase === "play" && m.shapeTeam !== undefined ? m.shapeTeam === team : inPossession;
  // Les cibles d'avant, et ceux qui ont une tâche urgente (aller au ballon, au porteur) : voir la fin
  const before = new Map<number, [number, number, boolean]>();
  for (const p of m.players) if (p.team === team) before.set(p.i, [p.tx, p.tz, p.sprint]);
  const urgent = new Set<number>();

  // Sans le ballon, tout le monde prend sa place ; on affinera ensuite pour ceux qui ont une tâche
  for (const p of m.players) {
    if (p.team !== team || !free(p) || human(p) || p.i === m.owner) continue;
    if (p.role === "GK") continue;
    const [x, z] = shapeSpot(m, p, shapeIn);
    p.tx = x;
    p.tz = z;
    p.sprint = false;
  }
  for (const p of m.players) if (p.team === team && p.role === "GK" && free(p) && !human(p)) thinkKeeper(m, p, path);

  // Le ballon est libre : le plus rapide à y arriver y va
  if (path) {
    // Il faut un instant pour lire la passe de l'adversaire
    const lag = team !== m.kickTeam ? Math.max(0.05, tune.react - (m.t - m.kickAt)) : 0.05;
    const callers = m.players
      .filter((p) => p.team === team && free(p) && (p.role !== "GK" || inBox(path[8]!.x, path[8]!.z, -dir)) && m.t >= p.lockedUntil)
      .map((p) => ({ p, f: intercept(p, path, lag) }))
      .filter((e): e is { p: Player; f: FlightPoint } => e.f !== null)
      .sort((a, b) => a.f.t - b.f.t);
    const target = m.pass && m.pass.to >= 0 && m.players[m.pass.to]!.team === team ? m.players[m.pass.to]! : null;
    const chaser = target && target.role !== "GK" ? callers.find((e) => e.p.i === target.i) : callers[0];
    const first = chaser ?? callers[0];
    if (first && !human(first.p) && first.p.role !== "GK") {
      first.p.tx = first.f.x;
      first.p.tz = first.f.z;
      first.p.sprint = true;
      urgent.add(first.p.i);
    }
    // Un deuxième arrive en soutien, pour ramasser les miettes
    const second = callers.find((e) => e !== first && !human(e.p) && e.p.role !== "GK");
    if (second && first && !inPossession) {
      second.p.tx = second.f.x;
      second.p.tz = second.f.z;
      second.p.sprint = true;
      urgent.add(second.p.i);
    }
    // Sans ballon en vue, on retombe sur le ballon le plus proche : personne ne regarde un ballon arrêté
    if (callers.length === 0 && m.ball.y < 3) {
      const nearest = nearestOf(m, team, m.ball.x, m.ball.z, (p) => human(p) || p.role === "GK")[0];
      if (nearest) {
        nearest.tx = m.ball.x;
        nearest.tz = m.ball.z;
        nearest.sprint = true;
        urgent.add(nearest.i);
      }
    }
  }

  if (owner && inPossession) {
    // Attaque : les plus proches se proposent, les attaquants prennent la profondeur
    const mates = nearestOf(m, team, owner.x, owner.z, (p) => p.i === owner.i || p.role === "GK" || human(p));
    mates.slice(0, 3).forEach((p) => {
      const [x, z] = supportSpot(m, p, owner);
      p.tx = x;
      p.tz = z;
      p.sprint = Math.hypot(x - p.x, z - p.z) > 8;
    });
    const line = offsideLine(m, team);
    for (const p of mates) {
      if (p.fx < 0.8 || p.runUntil > m.t) continue;
      const [x, z] = [(line - 0.5) * dir, p.tz];
      if (runSpaceAhead(m, p) > 12) {
        p.tx = x;
        p.tz = z;
        p.sprint = owner.x * dir > -10;
      } else {
        // Jamais hors-jeu sans raison
        if (p.tx * dir > line - 0.4) p.tx = (line - 0.4) * dir;
      }
    }
    if (owner.x * dir > HALF_L - 26) {
      // Dans les trente derniers mètres, on occupe la surface
      const boxSpots: [number, number][] = [
        [HALF_L - 7, 2],
        [HALF_L - 9, -4],
        [HALF_L - 15, 0],
      ];
      mates
        .filter((p) => p.fx > 0.45)
        .slice(0, 3)
        .forEach((p, n) => {
          const [ax, az] = boxSpots[n]!;
          const x = Math.min(ax, Math.max(line - 0.2, 10));
          p.tx = x * dir;
          p.tz = az;
          p.sprint = true;
        });
    }
  } else if (owner && inKeeperHands(m, owner)) {
    // Le gardien adverse tient le ballon : personne ne va le chercher, on sort de sa surface en reprenant sa place
    const edge = HALF_L - BOX_L - 2;
    for (const p of m.players) {
      if (p.team !== team || !free(p) || human(p) || p.role === "GK") continue;
      if (p.tx * dir > edge) p.tx = edge * dir;
    }
  } else if (owner) {
    // Défense : un homme va au porteur, le deuxième ferme la route du but, les autres prennent chacun un adversaire
    const press = nearestOf(m, team, owner.x, owner.z, (p) => p.role === "GK");
    const first = press[0];
    if (first && !human(first)) {
      urgent.add(first.i);
      const danger = owner.x * -dir > HALF_L - 40;
      if (danger || random(m) < tune.press) {
        first.tx = owner.x + owner.vx * 0.35;
        first.tz = owner.z + owner.vz * 0.35;
        first.sprint = true;
      } else {
        const [gx, gz] = goalSide(m, first, owner.x, owner.z, 3);
        first.tx = gx;
        first.tz = gz;
        first.sprint = false;
      }
    }
    const second = press[1];
    if (second && !human(second)) {
      urgent.add(second.i);
      const [gx, gz] = goalSide(m, second, owner.x, owner.z, 7);
      second.tx = gx;
      second.tz = gz;
      second.sprint = true;
    }
    const taken = new Set<number>([owner.i]);
    for (const p of press.slice(2)) {
      if (human(p)) continue;
      // L'adversaire le plus proche de sa place, que personne ne surveille encore
      let foe: Player | null = null;
      let bd = 14;
      for (const q of m.players) {
        if (q.team === team || !free(q) || taken.has(q.i) || q.role === "GK") continue;
        const d = Math.hypot(q.x - p.tx, q.z - p.tz);
        if (d < bd) {
          bd = d;
          foe = q;
        }
      }
      if (foe) {
        taken.add(foe.i);
        const gap = clamp(Math.hypot(foe.x - m.ball.x, foe.z - m.ball.z) * 0.2, 2.2, 8);
        const [gx, gz] = goalSide(m, p, foe.x, foe.z, gap);
        p.tx = gx;
        p.tz = gz;
        p.sprint = Math.hypot(gx - p.x, gz - p.z) > 6;
      }
    }
  }
  noAboutTurn(m, team, before, urgent);
}

/** Le temps qu'un joueur court dans un sens avant de pouvoir repartir dans l'autre, si rien d'urgent ne l'appelle */
const TURN_COMMIT_S = 0.8;

/**
 * Pas de demi-tour pour rien. Une tâche qui hésite d'une réflexion à l'autre (marquer cet adversaire ou garder sa place,
 * se proposer ou non) renvoyait un joueur en sens inverse quelques dixièmes après son départ : il courait dans un sens,
 * puis dans l'autre, sans aller nulle part. Il finit sa course, sauf pour aller au ballon ou au porteur.
 */
function noAboutTurn(m: Match, team: Team, before: Map<number, [number, number, boolean]>, urgent: Set<number>) {
  for (const p of m.players) {
    if (p.team !== team || !free(p) || (p.human !== null && !assisted(m, p)) || p.role === "GK" || p.i === m.owner || p.runUntil > m.t)
      continue;
    const v = Math.hypot(p.vx, p.vz);
    if (v < 2 || urgent.has(p.i)) {
      // Il part d'arrêté, ou il va au ballon : c'est le début d'une course
      if (v < 2) p.turnAt = m.t;
      continue;
    }
    const nx = p.tx - p.x;
    const nz = p.tz - p.z;
    const nd = Math.hypot(nx, nz);
    if (nd < 1.5 || (p.vx * nx + p.vz * nz) / (v * nd) > -0.3) continue;
    const old = before.get(p.i);
    if (old && m.t - (p.turnAt ?? -9) < TURN_COMMIT_S) {
      [p.tx, p.tz, p.sprint] = old;
    } else p.turnAt = m.t;
  }
}

// -------------------------------------------------------------------------
// Le porteur du ballon
// -------------------------------------------------------------------------

/** Le danger qu'un adversaire coupe une passe vers ce point */
function laneRisk(m: Match, p: Player, x: number, z: number, speed: number): number {
  const dx = x - p.x;
  const dz = z - p.z;
  const len = Math.max(0.1, Math.hypot(dx, dz));
  const ux = dx / len;
  const uz = dz / len;
  let risk = 0;
  for (const q of m.players) {
    if (q.team === p.team || !free(q)) continue;
    const rx = q.x - p.x;
    const rz = q.z - p.z;
    const along = rx * ux + rz * uz;
    if (along < 0.5 || along > len + 1) continue;
    const side = Math.abs(rx * uz - rz * ux);
    const t = along / speed;
    const room = side - Math.max(0, t - 0.22) * 9 - 0.7;
    risk = Math.max(risk, room < 0 ? Math.min(1, 0.6 - room * 0.25) : room < 1.2 ? 0.25 * (1 - room / 1.2) : 0);
  }
  return risk;
}

/** Une passe dans le dos de la défense : seulement si l'attaquant arrive au point avant tous les défenseurs */
function throughSpot(m: Match, p: Player, q: Player): [number, number] | null {
  const dir = attackDir(m, p.team);
  const line = offsideLine(m, p.team);
  if (m.settings.offside && q.x * dir > line + 0.1) return null;
  for (const lead of [15, 11, 8]) {
    const [x, z] = onPitch(q.x + dir * lead, q.z * 0.86, 3);
    if (x * dir > HALF_L - 5) continue;
    const dq = Math.hypot(x - q.x, z - q.z);
    const tAtk = dq / 11;
    const tBall = Math.hypot(x - p.x, z - p.z) / 25;
    if (tBall > tAtk + 0.7) continue;
    let beaten = true;
    for (const o of m.players) {
      if (o.team === p.team || !free(o)) continue;
      const reach = Math.max(0, Math.hypot(x - o.x, z - o.z) - 1) / (o.role === "GK" ? 8.5 : 11) + 0.28;
      if (reach < tAtk + 0.15) {
        beaten = false;
        break;
      }
    }
    if (beaten && laneRisk(m, p, x, z, 26) < 0.55) return [x, z];
  }
  return null;
}

interface Option {
  score: number;
  run: () => void;
}

/** Peut-il frapper ? Une frappe vaut d'autant plus qu'il est près, bien placé, et que le chemin est libre */
function shotValue(m: Match, p: Player): number {
  const dir = attackDir(m, p.team);
  const gx = dir * HALF_L;
  const d = Math.hypot(gx - p.x, p.z);
  if (d > 34) return 0;
  const toA = Math.atan2(GOAL_HALF - p.z, gx - p.x);
  const toB = Math.atan2(-GOAL_HALF - p.z, gx - p.x);
  const angle = Math.abs(toA - toB);
  // On ose la frappe de loin quand la voie est libre : le gardien n'arrête pas tout
  let value = Math.pow(1 - d / 34, 0.9) * clamp(angle / 0.42, 0.1, 1.4) * 1.4;
  value *= 0.6 + (p.stats.sho / 100) * 0.5;
  value *= 1 - laneRisk(m, p, gx, 0, 32) * 0.8;
  return value;
}

/** Décide quoi faire du ballon : passer, frapper, centrer, dégager, ou continuer à conduire */
export function thinkCarrier(m: Match, p: Player) {
  const tune = tuning(m, p.team);
  const dir = attackDir(m, p.team);
  const held = m.t - p.gotAt;
  const pressure = pressureOn(m, p);
  const gx = dir * HALF_L;
  const options: Option[] = [];
  const line = offsideLine(m, p.team);

  if (p.role === "GK") {
    if (p.act === "hold" && held < 1.2) return;
    // Le gardien relance : un défenseur libre, sinon loin devant ; jamais une passe qu'un attaquant tout près couperait
    let best = -1;
    let bestScore = -Infinity;
    for (const q of m.players) {
      if (q.team !== p.team || q.i === p.i || q.off) continue;
      const score =
        Math.min(openness(m, p.team, q.x, q.z), 15) - Math.hypot(q.x - p.x, q.z - p.z) * 0.25 - laneRisk(m, p, q.x, q.z, 16) * 14;
      if (score > bestScore) {
        bestScore = score;
        best = q.i;
      }
    }
    if (best >= 0 && bestScore > 5) {
      releaseFromHands(m, p);
      orderKick(p, {
        kind: Math.hypot(m.players[best]!.x - p.x, m.players[best]!.z - p.z) > 32 ? "lob" : "pass",
        power: 0.6,
        ax: 0,
        az: 0,
        to: best,
      });
    } else {
      releaseFromHands(m, p);
      orderKick(p, { kind: "clear", power: 0.8, ax: dir, az: 0, to: -1 });
    }
    return;
  }

  // Frapper
  const shot = shotValue(m, p);
  if (shot > 0.42) {
    options.push({
      score: shot * 1.25 + (inBox(p.x, p.z, dir) ? 0.28 : 0),
      run: () => {
        const finesse = random(m) < 0.25 && Math.hypot(gx - p.x, p.z) < 24;
        orderKick(p, { kind: finesse ? "finesse" : "shot", power: 0.42 + random(m) * 0.26, ax: 0, az: 0, to: -1 });
      },
    });
  }

  // Passer
  for (const q of m.players) {
    if (q.team !== p.team || q.i === p.i || !free(q) || q.role === "GK") continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < 4 || d > 44) continue;
    const ahead = q.x * dir;
    if (m.settings.offside && ahead > line + 0.15 && ahead > p.x * dir) continue;
    const forward = ((q.x - p.x) * dir) / 40;
    const space = Math.min(openness(m, p.team, q.x, q.z), 8) / 8;
    const risk = laneRisk(m, p, q.x, q.z, 24);
    if (risk > 0.72) continue;
    const closer = shotValue(m, q);
    const value = forward * 0.9 + space * 0.42 + closer * 0.9 - risk * 1.2 - d * 0.005;
    const v = value * tune.vision + random(m) * 0.08;
    options.push({
      score: v,
      run: () => orderKick(p, { kind: d > 30 ? "lob" : "pass", power: clamp(d / 40 + 0.25, 0.2, 0.9), ax: 0, az: 0, to: q.i }),
    });
    // Une passe dans la profondeur, pour celui qui part seul
    if (q.fx > 0.45 && q.x * dir > p.x * dir - 4) {
      const spot = throughSpot(m, p, q);
      if (spot) {
        const [sx, sz] = spot;
        options.push({
          score: (((sx - p.x) * dir) / 40 + 0.45 + shotValue(m, { ...q, x: sx, z: sz }) * 1.2) * tune.vision + random(m) * 0.08,
          run: () => orderKick(p, { kind: "through", power: 0.5, ax: dir, az: 0, to: q.i, px: sx, pz: sz }),
        });
      }
    }
  }

  // Centrer, une fois sur le côté près de la surface
  if (p.x * dir > HALF_L - 26 && Math.abs(p.z) > 13) {
    const boxMate = m.players.find((q) => q.team === p.team && q.i !== p.i && inBox(q.x, q.z, dir) && !q.off);
    if (boxMate) {
      options.push({
        score: 0.75 + random(m) * 0.2,
        run: () => {
          const spot: [number, number] = [dir * (HALF_L - 6 - random(m) * 5), (-Math.sign(p.z) * random(m) * 7) | 0];
          orderKick(p, { kind: "cross", power: 0.7, ax: 0, az: 0, to: boxMate.i, px: spot[0], pz: spot[1] });
        },
      });
    }
  }

  // Dégager, sous pression près de son but
  if (p.x * dir < -HALF_L + 28 && pressure > 0.55) {
    options.push({
      score: 0.45 + pressure * 0.4,
      run: () => orderKick(p, { kind: "clear", power: 0.7 + random(m) * 0.2, ax: dir, az: -Math.sign(p.z || 1) * 0.2, to: -1 }),
    });
  }

  // Continuer balle au pied : vaut d'autant plus que devant lui, c'est libre
  const carryValue = 0.42 + (1 - pressure) * 0.35 + (held < 0.7 ? 0.4 : 0) - Math.max(0, held - 2.5) * 0.18;
  options.push({ score: carryValue, run: () => steerCarrier(m, p) });

  options.sort((a, b) => b.score - a.score);
  options[0]!.run();
  if (p.order === null) steerCarrier(m, p);
}

/** Conduire le ballon vers le but en contournant les adversaires, sans sortir du terrain */
export function steerCarrier(m: Match, p: Player) {
  const dir = attackDir(m, p.team);
  const gx = dir * HALF_L;
  let wx = gx - p.x;
  let wz = -p.z * 0.6;
  // Sur le côté près de la ligne, il rentre vers l'axe plutôt que de se faire enfermer
  if (Math.abs(p.z) > HALF_W - 5) wz = -Math.sign(p.z) * 20;
  const len = Math.hypot(wx, wz) || 1;
  wx /= len;
  wz /= len;
  for (const q of m.players) {
    if (q.team === p.team || !free(q)) continue;
    const rx = q.x - p.x;
    const rz = q.z - p.z;
    const d = Math.hypot(rx, rz);
    if (d > 9 || d < 0.01) continue;
    const push = (1 - d / 9) * (1 - d / 9) * 2.4;
    wx -= (rx / d) * push;
    wz -= (rz / d) * push;
  }
  const l = Math.hypot(wx, wz) || 1;
  const [tx, tz] = onPitch(p.x + (wx / l) * 6, p.z + (wz / l) * 6, 1.6);
  p.tx = tx;
  p.tz = tz;
  p.sprint = pressureOn(m, p) > 0.15 || openness(m, p.team, tx, tz) > 6;
}

export { opponent };
