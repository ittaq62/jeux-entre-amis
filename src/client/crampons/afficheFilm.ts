// Le film de l'accueil, joué par le vrai moteur de Crampons (sans rien d'autre que lui : il tourne aussi sous Node, pour
// chercher la bonne action). Le numéro 9 file vers la surface le ballon au pied et frappe en lucarne ; tous les autres
// sont des bots du jeu : le gardien se place et plonge, les défenseurs reviennent et tentent le tacle, le coéquipier suit,
// puis le moteur mène la fête du but. DevAffiche (&film) le filme.

import { createMatch, pushAction, setInput, stepMatch } from "../../shared/games/crampons/match.ts";
import { attackDir, type Match, type MatchEvent, type Player } from "../../shared/games/crampons/model.ts";
import { HALF_L } from "../../shared/games/crampons/pitch.ts";

export interface FilmPlan {
  seed: number;
  /** La force de la frappe (de 0 à 1) : elle règle aussi sa hauteur */
  power: number;
  /** Où il vise, sur la largeur du but (-1 : le poteau de gauche vu du buteur, celui de l'affiche) */
  aim: number;
  /** Quand il frappe, en secondes après le début du film */
  shotAt: number;
}

/** Les maillots de l'affiche : les rouges attaquent, les adversaires en blanc et bleu */
export const FILM_TEAMS = [
  { name: "Rouges", formation: "433", rating: 80 },
  { name: "Bleus", formation: "442", rating: 74 },
] as const;

export interface FilmSetup {
  m: Match;
  /** Le buteur (le numéro 9 de l'affiche), le gardien adverse, le coéquipier qui suit */
  striker: Player;
  keeper: Player;
  mate: Player;
}

function place(p: Player, x: number, z: number, vx = 0, vz = 0) {
  p.x = x;
  p.z = z;
  p.vx = vx;
  p.vz = vz;
  p.h = Math.hypot(vx, vz) > 0.1 ? Math.atan2(vz, vx) : p.team === 0 ? 0 : Math.PI;
  p.act = "none";
  p.actT = 0;
  p.order = null;
}

/** Le match, arrêté au moment où le buteur s'élance : chacun à sa place, le ballon dans ses pieds */
export function setupFilm(plan: FilmPlan): FilmSetup {
  const m = createMatch(
    { halfMinutes: 45, side: 11, level: 3, offside: false, fouls: false, draw: "none" },
    [{ ...FILM_TEAMS[0] }, { ...FILM_TEAMS[1] }],
    [{ id: "moi", team: 0 }],
    plan.seed,
  );
  for (let i = 0; i < 600 && m.phase !== "play"; i++) stepMatch(m);
  const dir = attackDir(m, 0);
  if (dir !== 1) throw new Error("les rouges devraient attaquer vers +x");
  const striker = m.players[m.humans[0]!.active]!;
  const reds = m.players.filter((p) => p.team === 0 && p !== striker && p.role !== "GK");
  const blues = m.players.filter((p) => p.team === 1 && p.role !== "GK");
  const keeper = m.players.find((p) => p.team === 1 && p.role === "GK")!;
  const ownKeeper = m.players.find((p) => p.team === 0 && p.role === "GK")!;
  const byRole = (list: Player[], roles: string[]) => list.filter((p) => roles.includes(p.role));
  const [cb1, cb2] = byRole(blues, ["CB"]);
  const back = byRole(blues, ["RB", "LB"]);
  const mate = byRole(reds, ["ST", "LW", "RW"])[0] ?? reds[0]!;

  // Le buteur arrive lancé de l'arrière gauche de l'image, vers le but
  place(striker, 33.4, 7.4, 6.2, -2.6);
  // Les défenseurs : l'un sort sur lui, l'autre couvre ; un latéral revient de loin ; le gardien est dans son but
  place(cb1!, 41.8, 2.6, -2.5, 0.8);
  place(cb2!, 45.6, -3.2, -1, 0.5);
  if (back[0]) place(back[0], 44.6, 9.5, -2.5, -1.5);
  place(keeper, HALF_L - 1.4, 0.6);
  // Le coéquipier fait l'appel de l'autre côté
  place(mate, 39.5, -9.5, 6.5, 2.2);
  // Les autres sont plus loin, hors de l'image (derrière la caméra ou sur la gauche)
  const rest = m.players.filter((p) => ![striker, cb1, cb2, back[0], keeper, mate, ownKeeper].includes(p));
  rest.forEach((p, k) => place(p, 8 + (k % 6) * 3.2, -24 + (k % 7) * 7.5, p.team === 0 ? 3 : 2.5, 0));
  place(ownKeeper, -HALF_L + 4, 0);
  m.ball.x = striker.x + 0.6;
  m.ball.z = striker.z - 0.25;
  m.ball.y = 0.11;
  m.ball.vx = striker.vx;
  m.ball.vz = striker.vz;
  m.ball.vy = 0;
  m.owner = striker.i;
  m.lastTouch = striker.i;
  striker.gotAt = m.t;
  return { m, striker, keeper, mate };
}

/** Ce que fait le buteur à l'instant `t` du film (en secondes) : il pousse le ballon vers le but, puis frappe */
export function steerStriker(m: Match, plan: FilmPlan, t: number, dt: number) {
  if (t < plan.shotAt) {
    // Il pique vers l'axe à mesure qu'il approche de la surface
    const bend = Math.min(1, t / plan.shotAt);
    setInput(m, "moi", 0.92, -0.38 - bend * 0.12, true, false);
  } else setInput(m, "moi", 0, 0, false, false);
  if (t < plan.shotAt && t + dt >= plan.shotAt) pushAction(m, "moi", "shot", plan.power, 0, plan.aim);
}

/** Joue le film jusqu'au but (ou jusqu'à `limit` secondes) : ce qu'il faut pour choisir la bonne action */
export function rehearse(plan: FilmPlan, limit = 4) {
  const { m, keeper, striker } = setupFilm(plan);
  const dt = 1 / 30;
  const events: { t: number; e: MatchEvent }[] = [];
  let dived = false;
  let diveZ = 0;
  let crossing: { y: number; z: number } | null = null;
  let kickX = 0;
  let kickZ = 0;
  for (let t = 0; t < limit; t += dt) {
    steerStriker(m, plan, t, dt);
    const before = { x: m.ball.x, y: m.ball.y, z: m.ball.z };
    for (const e of stepMatch(m)) {
      events.push({ t, e });
      if (e.k === "kick" && e.p === striker.i) {
        kickX = striker.x;
        kickZ = striker.z;
      }
    }
    if (keeper.act === "dive") {
      dived = true;
      diveZ = keeper.dirZ;
    }
    if (!crossing && before.x < HALF_L && m.ball.x >= HALF_L) {
      const k = (HALF_L - before.x) / (m.ball.x - before.x);
      crossing = { y: before.y + (m.ball.y - before.y) * k, z: before.z + (m.ball.z - before.z) * k };
    }
    if (events.some((x) => x.e.k === "goal") && t > (events.find((x) => x.e.k === "goal")?.t ?? 0) + 0.2) break;
  }
  const goal = events.find((x) => x.e.k === "goal");
  const shot = events.find((x) => x.e.k === "shot");
  return {
    goal: Boolean(goal && goal.e.k === "goal" && goal.e.scorer === striker.i),
    goalAt: goal?.t ?? null,
    shotAt: shot?.t ?? null,
    dived,
    /** Le côté du plongeon (le signe de z) */
    diveZ,
    crossing,
    kick: { x: kickX, z: kickZ },
    saves: events.filter((x) => x.e.k === "save").length,
    tackles: events.filter((x) => x.e.k === "tackle").length,
    lostBall: m.owner !== striker.i && !shot,
  };
}
