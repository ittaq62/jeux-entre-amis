// Les bots du billard. Ils regardent chaque bille qu'ils ont le droit de viser et chaque poche : la bille fantôme (là où
// doit arriver la blanche), le chemin libre jusqu'à elle et jusqu'à la poche, l'angle de coupe, les distances. Ils
// gardent les meilleurs coups, les jouent pour de bon dans la physique (avec un peu de coulé, de rétro, plus ou moins
// fort) et choisissent celui qui rentre en laissant la blanche bien placée pour la suite. Sans coup jouable, ils jouent
// la sécurité : toucher la bonne bille sans faute, et laisser l'adversaire loin de tout. À la carambole, ils cherchent la
// bille à prendre en premier, l'épaisseur, l'effet et la force qui font toucher les deux autres.
//
// Puis ils jouent avec la maladresse de leur niveau : un léger écart de visée, de force, de point de frappe.

import { random, type RngHolder } from "../../rng.ts";
import { castAim, pathClear, pocketAim, pocketOpen } from "./aim.ts";
import { canPlace, cueOf, legalTargets, mustCall, rigFor, type BotLevel, type Match, type ShotInput } from "./match.ts";
import type { Table } from "./table.ts";
import { DT, World } from "./physics.ts";
import { judge, type Outcome } from "./rules.ts";
import { powerFor, rigOf, simulateShot, startShot, type BallSpot, type Rig, type ShotParams } from "./shot.ts";

interface Skill {
  /** Les meilleurs coups qu'il essaie pour de bon */
  tries: number;
  /** Il pense à la suite (la place de la blanche) */
  position: number;
  /** Sa maladresse : l'écart type de la direction (rad), de la force (part), du point de frappe */
  dirErr: number;
  powErr: number;
  tipErr: number;
  /** Il joue la sécurité quand rien n'est sûr */
  safety: boolean;
}

const SKILL: Record<BotLevel, Skill> = {
  fort: { tries: 10, position: 1, dirErr: 0.0012, powErr: 0.03, tipErr: 0.04, safety: true },
  moyen: { tries: 6, position: 0.5, dirErr: 0.0042, powErr: 0.08, tipErr: 0.08, safety: true },
  facile: { tries: 3, position: 0, dirErr: 0.0072, powErr: 0.13, tipErr: 0.15, safety: false },
};

/** Le temps qu'il prend avant de viser (il regarde la table) */
export function thinkTime(level: BotLevel, rng: RngHolder): number {
  const base = level === "fort" ? 1500 : level === "moyen" ? 1800 : 2100;
  return base + random(rng) * 1400;
}

function gauss(rng: RngHolder): number {
  // Box-Muller : seulement pour choisir le coup (la physique, elle, ne voit que les nombres qui en sortent)
  const u = Math.max(1e-9, random(rng)),
    v = random(rng);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Où viser cette poche pour cette bille, et combien elle est ouverte ; une bille qui pend déjà dans l'embouchure (arrêtée
 * au bord du trou) se pousse droit dedans.
 */
export function potAim(t: Table, i: number, x: number, y: number): { x: number; y: number; open: number; hanging: boolean } | null {
  const p = t.pockets[i]!;
  const along = (x - p.ox) * p.nx + (y - p.oy) * p.ny;
  const across = Math.abs(-(x - p.ox) * p.ny + (y - p.oy) * p.nx);
  if (along > -t.R * 0.6 && across < p.mouth / 2) return { x: x + p.nx * 0.08, y: y + p.ny * 0.08, open: 1, hanging: true };
  const open = pocketOpen(t, i, x, y);
  if (open <= 0) return null;
  const a = pocketAim(t, i);
  return { x: a.x, y: a.y, open, hanging: false };
}

interface Candidate {
  target: number;
  pocket: number;
  dx: number;
  dy: number;
  /** La vitesse qu'il faut à la blanche (m/s) */
  speed: number;
  score: number;
}

/** Les coups directs possibles depuis cette place de la blanche, du meilleur au moins bon */
export function potCandidates(
  rig: Rig,
  balls: readonly BallSpot[],
  cue: number,
  cx: number,
  cy: number,
  targets: readonly number[],
): Candidate[] {
  const t = rig.table;
  const R = t.R;
  const out: Candidate[] = [];
  const decel = rig.phys.roll * rig.phys.g;
  for (const id of targets) {
    const b = balls.find((q) => q.id === id);
    if (!b) continue;
    for (let i = 0; i < t.pockets.length; i++) {
      const a = potAim(t, i, b.x, b.y);
      if (!a) continue;
      const open = a.open;
      let ux = a.x - b.x,
        uy = a.y - b.y;
      const d2 = Math.sqrt(ux * ux + uy * uy);
      if (d2 < 1e-6) continue;
      ux /= d2;
      uy /= d2;
      const gx = b.x - ux * 2 * R,
        gy = b.y - uy * 2 * R;
      // La blanche ne doit pas sortir du tapis pour atteindre la fantôme (sauf dans l'embouchure, ouverte)
      if (!a.hanging && (Math.abs(gx) > t.lx - R || Math.abs(gy) > t.ly - R)) continue;
      let vx = gx - cx,
        vy = gy - cy;
      const d1 = Math.sqrt(vx * vx + vy * vy);
      if (d1 < 1e-6) continue;
      vx /= d1;
      vy /= d1;
      const cos = vx * ux + vy * uy;
      if (cos < 0.2) continue;
      if (!pathClear(t, balls, [cue, id], cx, cy, gx, gy, 0.002)) continue;
      if (!pathClear(t, balls, [cue, id], b.x, b.y, a.x, a.y, 0.001)) continue;
      // La blanche touche-t-elle d'abord cette bille-là, tout droit ?
      const hit = castAim(t, balls, cue, cx, cy, vx, vy);
      if (hit.ball !== id) continue;
      // La vitesse : la bille visée doit arriver encore vivante dans la poche
      const vObj = Math.sqrt(0.35 * 0.35 + 2 * decel * 1.3 * d2);
      const vCueAt = vObj / Math.max(0.25, cos * 0.97);
      const speed = Math.sqrt(vCueAt * vCueAt + 2 * decel * 1.6 * d1) * 1.08;
      const score = Math.pow(cos, 1.6) * open * (1 / (1 + 0.55 * d1 + 0.8 * d2)) * (cos > 0.97 ? 1.08 : 1);
      out.push({ target: id, pocket: i, dx: vx, dy: vy, speed, score });
    }
  }
  return out.sort((p, q) => q.score - p.score);
}

/** La meilleure note de coup facile depuis la blanche, pour juger la place qu'on laisse */
function leaveScore(rig: Rig, balls: readonly BallSpot[], cue: number, targets: readonly number[]): number {
  const c = balls.find((b) => b.id === cue);
  if (!c) return 0;
  const cand = potCandidates(rig, balls, cue, c.x, c.y, targets);
  return cand[0]?.score ?? 0;
}

/** Les billes qu'il visera ensuite (sa famille, mise à jour s'il vient de la prendre) */
function nextTargets(m: Match, balls: readonly BallSpot[], o: Outcome): number[] {
  const fake: Match = { ...m, balls: [...balls], breakShot: false, sides: m.sides.map((s) => ({ ...s })) };
  if (o.assign) fake.sides[m.turn]!.group = o.assign;
  return legalTargets(fake);
}

interface Tried {
  shot: ShotParams;
  call: number | null;
  value: number;
  ok: boolean;
}

function tryShot(m: Match, rig: Rig, start: BallSpot[], cue: number, shot: ShotParams, call: number | null, skill: Skill): Tried {
  const sim = simulateShot(rig, start, cue, shot);
  const side = m.sides[m.turn]!;
  const o = judge(
    { variant: m.cfg.variant, breakShot: m.breakShot, cue, before: start, group: side.group, call, bandes: m.cfg.bandes },
    sim.events,
  );
  const lost = o.rack === "lost";
  const won = o.rack === "won";
  const killer = m.cfg.variant === "killer";
  const ok = killer ? !o.foul && o.scored > 0 : !o.foul && !lost && (o.keep || won);
  let value = won ? 10 : ok ? 3 + (killer && (o.lives ?? 0) > 0 ? 2 : 0) : o.foul ? -2 : 0;
  if (lost) value = -20;
  if (ok && !won && skill.position > 0) {
    const leave = leaveScore(rig, sim.balls, cue, nextTargets(m, sim.balls, o));
    // Au Killer, le coup suivant est celui d'un autre : on lui laisse le moins possible
    value += skill.position * leave * (killer ? -3 : 6);
  }
  return { shot, call, value, ok };
}

/** Le coup du bot (ou du joueur qu'un bot remplace) */
export function planShot(m: Match, level: BotLevel, rng: RngHolder): ShotInput {
  const skill = SKILL[level];
  const rig = rigFor(m.cfg);
  const p = m.players.find((x) => x.id === m.shooter)!;
  const cue = cueOf(m, p);
  if (m.cfg.variant === "carambole") return noisy(planCarom(m, rig, cue, skill, rng), skill, rng);
  let balls = m.balls.map((b) => ({ ...b }));
  let place: { x: number; y: number } | null = null;
  const targets = legalTargets(m);
  if (m.breakShot) return noisy(planBreak(m, rig, rng, level), skill, rng);
  if (m.inHand) {
    place = choosePlace(m, rig, balls, cue, targets, level, rng);
    balls = balls.map((b) => (b.id === cue ? { id: cue, x: place!.x, y: place!.y } : b));
  }
  const c = balls.find((b) => b.id === cue)!;
  const cands = potCandidates(rig, balls, cue, c.x, c.y, targets).slice(0, skill.tries);
  const calling = mustCall(m);
  let best: Tried | null = null;
  for (const cd of cands) {
    const base = powerFor(rig.kind, cd.speed);
    // Le débutant tape un peu fort plutôt que trop doux (raté, la bille va quand même à la bande), et sait juste
    // retenir la blanche pour qu'elle ne suive pas dans le trou
    const variants: [number, number][] =
      level === "facile"
        ? [
            [1.3, 0],
            [1.15, -0.35],
          ]
        : [
            [1, 0],
            [1.15, 0.35],
            [1.2, -0.45],
            [1.6, 0],
          ];
    for (const [k, b] of variants) {
      const shot: ShotParams = { dx: cd.dx, dy: cd.dy, p: Math.min(1, base * k), a: 0, b };
      const tr = tryShot(m, rig, balls, cue, shot, calling ? cd.pocket : null, skill);
      if (!best || tr.value > best.value) best = tr;
    }
  }
  if ((!best || !best.ok) && skill.safety) {
    const safe = planSafety(m, rig, balls, cue, targets, rng);
    if (safe && (!best || safe.value > best.value)) best = safe;
  }
  if (!best) best = { shot: fallback(balls, cue, targets, rng), call: null, value: 0, ok: false };
  return noisy({ shot: best.shot, place, call: best.call }, skill, rng);
}

/** La casse : la blanche derrière la ligne de tête, plein dans la bille de tête du triangle, très fort */
function planBreak(m: Match, rig: Rig, rng: RngHolder, level: BotLevel): ShotInput {
  const t = rig.table;
  const y = (random(rng) - 0.5) * (level === "fort" ? 0.12 : 0.4);
  const x = t.head - 0.02 - random(rng) * 0.08;
  const apex = m.balls.filter((b) => b.id !== 0).reduce((a, b) => (b.x < a.x ? b : a));
  let dx = apex.x - x,
    dy = apex.y - y;
  const l = Math.sqrt(dx * dx + dy * dy);
  dx /= l;
  dy /= l;
  return { shot: { dx, dy, p: level === "facile" ? 0.85 + random(rng) * 0.15 : 1, a: 0, b: -0.15 }, place: { x, y }, call: null };
}

/** La bille en main : une place d'où un coup facile s'offre (en essayant une grille de places et les places « dans l'axe ») */
function choosePlace(m: Match, rig: Rig, balls: BallSpot[], cue: number, targets: readonly number[], level: BotLevel, rng: RngHolder) {
  const t = rig.table;
  const spots: [number, number][] = [];
  const xMax = m.inHand === "tete" ? t.head : t.lx - t.R - 0.01;
  for (let i = 0; i <= 10; i++)
    for (let j = 0; j <= 6; j++)
      spots.push([-t.lx + t.R + 0.01 + ((xMax - (-t.lx + t.R + 0.01)) * i) / 10, -t.ly + t.R + 0.01 + (2 * (t.ly - t.R - 0.01) * j) / 6]);
  // Dans l'axe de chaque bille et de chaque poche, à 25 et 45 cm derrière
  for (const id of targets) {
    const b = balls.find((q) => q.id === id);
    if (!b) continue;
    for (let i = 0; i < t.pockets.length; i++) {
      const a = potAim(t, i, b.x, b.y);
      if (!a) continue;
      let ux = a.x - b.x,
        uy = a.y - b.y;
      const l = Math.sqrt(ux * ux + uy * uy) || 1;
      ux /= l;
      uy /= l;
      for (const d of [0.25, 0.45]) spots.push([b.x - ux * d, b.y - uy * d]);
    }
  }
  let best: { x: number; y: number; s: number } | null = null;
  for (const [x, y] of spots) {
    if (!canPlace(m, x, y)) continue;
    const bs = balls.map((b) => (b.id === cue ? { id: cue, x, y } : b));
    const s = (potCandidates(rig, bs, cue, x, y, targets)[0]?.score ?? 0) * (level === "facile" ? 0.6 + random(rng) * 0.8 : 1);
    if (!best || s > best.s) best = { x, y, s };
  }
  if (best) return { x: best.x, y: best.y };
  const c = balls.find((b) => b.id === cue)!;
  return { x: c.x, y: c.y };
}

/** La sécurité : toucher une bonne bille sans faute, en laissant le moins possible à l'adversaire */
function planSafety(m: Match, rig: Rig, balls: BallSpot[], cue: number, targets: readonly number[], rng: RngHolder): Tried | null {
  const c = balls.find((b) => b.id === cue)!;
  const t = rig.table;
  let best: Tried | null = null;
  const others = m.cfg.variant === "huit" ? opponentTargets(m) : targets;
  for (const id of targets) {
    const b = balls.find((q) => q.id === id);
    if (!b) continue;
    let dx = b.x - c.x,
      dy = b.y - c.y;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l;
    dy /= l;
    for (const off of [-0.7, -0.3, 0, 0.3, 0.7]) {
      // Viser à côté du centre de la bille : une épaisseur
      const px = -dy,
        py = dx;
      let ax = b.x + px * off * 2 * t.R - c.x,
        ay = b.y + py * off * 2 * t.R - c.y;
      const al = Math.sqrt(ax * ax + ay * ay) || 1;
      ax /= al;
      ay /= al;
      for (const pw of [0.3, 0.42]) {
        const shot: ShotParams = { dx: ax, dy: ay, p: pw, a: 0, b: 0 };
        const sim = simulateShot(rig, balls, cue, shot);
        const side = m.sides[m.turn]!;
        const o = judge(
          { variant: m.cfg.variant, breakShot: false, cue, before: balls, group: side.group, call: null, bandes: m.cfg.bandes },
          sim.events,
        );
        if (o.foul || o.rack === "lost") continue;
        // Ce qu'il laisse à l'adversaire : son meilleur coup depuis là
        const cueEnd = sim.balls.find((q) => q.id === cue);
        const left = cueEnd ? (potCandidates(rig, sim.balls, cue, cueEnd.x, cueEnd.y, others)[0]?.score ?? 0) : 1;
        const value = (o.keep ? 3 : 0.5) - left * 4 + random(rng) * 0.05;
        if (!best || value > best.value) best = { shot, call: null, value, ok: o.keep };
      }
    }
  }
  if (best) return best;
  // Rien de direct (la bonne bille cachée derrière une autre) : par une bande, en visant son reflet derrière chaque
  // bande, comme le ferait un joueur
  const xl = t.lx - t.R,
    yl = t.ly - t.R;
  for (const id of targets) {
    const b = balls.find((q) => q.id === id);
    if (!b) continue;
    const mirrors: [number, number][] = [
      [b.x, 2 * yl - b.y],
      [b.x, -2 * yl - b.y],
      [2 * xl - b.x, b.y],
      [-2 * xl - b.x, b.y],
    ];
    for (const [mx, my] of mirrors) {
      let dx = mx - c.x,
        dy = my - c.y;
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= l;
      dy /= l;
      for (const off of [0, -0.35, 0.35]) {
        const ax = dx - dy * off * 0.04,
          ay = dy + dx * off * 0.04;
        for (const pw of [0.5, 0.65]) {
          const shot: ShotParams = { dx: ax, dy: ay, p: pw, a: 0, b: 0 };
          const sim = simulateShot(rig, balls, cue, shot);
          const side = m.sides[m.turn]!;
          const o = judge(
            { variant: m.cfg.variant, breakShot: false, cue, before: balls, group: side.group, call: null, bandes: m.cfg.bandes },
            sim.events,
          );
          if (o.foul || o.rack === "lost") continue;
          const value = (o.keep ? 2.5 : 0.3) + random(rng) * 0.05;
          if (!best || value > best.value) best = { shot, call: null, value, ok: o.keep };
        }
      }
    }
  }
  return best;
}

/** Les billes que l'adversaire visera (pleines et rayées) */
function opponentTargets(m: Match): number[] {
  const other = (m.turn + 1) % m.sides.length;
  return legalTargets({ ...m, turn: other, breakShot: false });
}

/** Rien de mieux : viser plein la première bonne bille */
function fallback(balls: BallSpot[], cue: number, targets: readonly number[], rng: RngHolder): ShotParams {
  const c = balls.find((b) => b.id === cue)!;
  const b = balls.find((q) => targets.includes(q.id)) ?? balls.find((q) => q.id !== cue);
  if (!b) return { dx: 1, dy: 0, p: 0.4, a: 0, b: 0 };
  const dx = b.x - c.x,
    dy = b.y - c.y;
  return { dx, dy, p: 0.35 + random(rng) * 0.2, a: 0, b: 0 };
}

/** La maladresse du niveau */
function noisy(input: ShotInput, skill: Skill, rng: RngHolder): ShotInput {
  const s = input.shot as ShotParams;
  const ang = gauss(rng) * skill.dirErr;
  const c = Math.cos(ang),
    sn = Math.sin(ang);
  const l = Math.sqrt(s.dx * s.dx + s.dy * s.dy) || 1;
  const dx = s.dx / l,
    dy = s.dy / l;
  return {
    ...input,
    shot: {
      dx: dx * c - dy * sn,
      dy: dx * sn + dy * c,
      p: Math.max(0.02, Math.min(1, s.p * (1 + gauss(rng) * skill.powErr))),
      a: s.a + gauss(rng) * skill.tipErr,
      b: s.b + gauss(rng) * skill.tipErr,
    },
  };
}

// ---------------------------------------------------------------------------
// La carambole
// ---------------------------------------------------------------------------

/** Joue le coup jusqu'à savoir s'il marque (ou jusqu'à ce que la blanche s'arrête) : vrai s'il marque */
function caromScores(
  rig: Rig,
  balls: readonly BallSpot[],
  cue: number,
  shot: ShotParams,
  bandes: number,
  breakShot: boolean,
): { ok: boolean; w: World } {
  const w = startShot(rig, balls, cue, shot);
  const others = balls.filter((b) => b.id !== cue).map((b) => b.id);
  const touched: number[] = [];
  let rails = 0;
  let seen = 0;
  const cueBall = w.ball(cue)!;
  while (w.step < 12 / DT) {
    w.advance();
    for (; seen < w.events.length; seen++) {
      const e = w.events[seen]!;
      if (e.k === "bille" && (e.a === cue || e.b === cue)) {
        const o = e.a === cue ? e.b : e.a;
        if (touched.length === 0 && breakShot && o !== 2) return { ok: false, w };
        if (!touched.includes(o)) touched.push(o);
        if (touched.length === others.length) return { ok: rails >= bandes, w };
      } else if (e.k === "bande" && e.a === cue && touched.length < 2) rails++;
    }
    if (!cueBall.moving) return { ok: false, w };
  }
  return { ok: false, w };
}

function planCarom(m: Match, rig: Rig, cue: number, skill: Skill, rng: RngHolder): ShotInput {
  const t = rig.table;
  const balls = m.balls.map((b) => ({ ...b }));
  const c = balls.find((b) => b.id === cue)!;
  const firsts = m.breakShot ? [2] : balls.filter((b) => b.id !== cue).map((b) => b.id);
  const fractions = [-0.85, -0.65, -0.45, -0.25, 0, 0.25, 0.45, 0.65, 0.85];
  const spins: [number, number][] =
    skill.position > 0.6
      ? [
          [0, 0],
          [0, 0.5],
          [0, -0.6],
          [0.6, 0.2],
          [-0.6, 0.2],
        ]
      : [
          [0, 0],
          [0, 0.5],
          [0, -0.6],
        ];
  const powers = m.cfg.bandes >= 3 ? [0.55, 0.7, 0.85] : m.cfg.bandes === 1 ? [0.45, 0.6] : [0.38, 0.5];
  const found: { shot: ShotParams; robust: number }[] = [];
  for (const id of firsts) {
    const b = balls.find((q) => q.id === id)!;
    let dx = b.x - c.x,
      dy = b.y - c.y;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l;
    dy /= l;
    for (const f of fractions) {
      let ax = b.x - dy * f * 2 * t.R - c.x,
        ay = b.y + dx * f * 2 * t.R - c.y;
      const al = Math.sqrt(ax * ax + ay * ay) || 1;
      ax /= al;
      ay /= al;
      for (const [sa, sb] of spins) {
        for (const pw of powers) {
          const shot: ShotParams = { dx: ax, dy: ay, p: pw, a: sa, b: sb };
          if (caromScores(rig, balls, cue, shot, m.cfg.bandes, m.breakShot).ok) found.push({ shot, robust: 0 });
        }
      }
    }
  }
  if (found.length === 0) {
    // Rien ne marque : toucher au moins une bille, sans y croire
    const b = balls.find((q) => q.id === firsts[0]) ?? balls.find((q) => q.id !== cue)!;
    return { shot: { dx: b.x - c.x, dy: b.y - c.y, p: 0.45, a: 0, b: 0 }, place: null, call: null };
  }
  // La solidité : le même coup un peu à gauche, un peu à droite, marque-t-il encore ?
  const tests = skill.position > 0 ? Math.min(found.length, 24) : 0;
  for (let i = 0; i < tests; i++) {
    const k = Math.floor((i * found.length) / Math.max(1, tests));
    const f = found[k]!;
    let r = 0;
    for (const d of [-0.004, 0.004, -0.008, 0.008]) {
      const cs = Math.cos(d),
        sn = Math.sin(d);
      const s = { ...f.shot, dx: f.shot.dx * cs - f.shot.dy * sn, dy: f.shot.dx * sn + f.shot.dy * cs };
      if (caromScores(rig, balls, cue, s, m.cfg.bandes, m.breakShot).ok) r++;
    }
    f.robust = r + random(rng) * 0.1;
  }
  found.sort((p, q) => q.robust - p.robust);
  const pickIdx = skill.position > 0 ? 0 : Math.floor(random(rng) * found.length);
  return { shot: found[pickIdx]!.shot, place: null, call: null };
}

export { rigOf };
