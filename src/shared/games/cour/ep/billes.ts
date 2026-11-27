// Les Billes : en duel, chacun dans son carré de sable, avec un pot creusé au fond. Trois billes chacun, lancées tour à
// tour ; la bille la plus proche du pot gagne la manche, une bille qui tombe dans le pot la gagne d'office. Deux
// manches gagnées pour rester ; le perdant reçoit le seau de gelée. Un nombre impair : un candidat tiré au sort passe
// sans jouer.
//
// La physique des billes (le sable qui freine, les chocs entre billes, le cadre de bois, le pot) ne fait que + − × ÷ et
// des racines : le serveur la calcule, les écrans la rejouent à l'identique pour montrer le lancer.

import { random, shuffle } from "../../../rng.ts";
import { between, byLevel, clamp, gauss, OUT, PLAYING, r3, SAFE, type EpCtx } from "./common.ts";

export const MARBLE_R = 0.018;
export const POT = { x: 0, y: 2.4, r: 0.075 };
/** Le carré de sable : la largeur de part et d'autre, du bas au fond */
export const PIT = { w: 1.15, y0: -0.3, y1: 3.4 };
const FRICTION = 0.95;
const STEP = 1 / 240;
const THROWS = 3;
const WIN_MANCHES = 2;
const TURN_S = 12;
const MANCHE_PAUSE_MS = 2200;

export interface Marble {
  o: 0 | 1;
  x: number;
  y: number;
  /** Tombée dans le pot (et dans quel ordre) */
  pot: number;
}

/** Un lancer : la vitesse de départ, depuis la ligne */
export interface Shot {
  o: 0 | 1;
  vx: number;
  vy: number;
}

/** Le chemin d'un lancer, pour les écrans : où sont les billes, image par image (tous les 1/60 s) */
export interface Roll {
  marbles: Marble[];
  /** Le temps que tout s'arrête (secondes) */
  time: number;
  /** Les chocs (pour le son) : l'instant, la force */
  hits: [number, number][];
  /** Le moment où une bille tombe dans le pot (-1 : aucune) */
  potAt: number;
}

/** Où part une bille : au milieu de la ligne de lancer, un peu décalée selon qui lance */
export const startX = (o: 0 | 1) => (o === 0 ? -0.12 : 0.12);

/**
 * Le lancer, jusqu'à ce que tout s'arrête. Rend les billes à la fin. `frames` reçoit les positions de toutes les billes
 * tous les quatre pas (pour l'animation).
 */
export function simulate(before: readonly Marble[], shot: Shot, frames?: (pos: Float64Array) => void): Roll {
  const ms: Marble[] = before.map((m) => ({ ...m }));
  ms.push({ o: shot.o, x: startX(shot.o), y: 0, pot: 0 });
  const n = ms.length;
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  vx[n - 1] = shot.vx;
  vy[n - 1] = shot.vy;
  const hits: [number, number][] = [];
  let potAt = -1;
  let potCount = ms.reduce((a, m) => Math.max(a, m.pot), 0);
  let t = 0;
  const pos = new Float64Array(n * 2);
  for (let step = 0; step < 240 * 12; step++) {
    let moving = false;
    for (let k = 0; k < n; k++) {
      const m = ms[k]!;
      if (m.pot) continue;
      const sp2 = vx[k]! * vx[k]! + vy[k]! * vy[k]!;
      if (sp2 <= 0) continue;
      const sp = Math.sqrt(sp2);
      const nsp = sp - FRICTION * STEP;
      if (nsp <= 0.004) {
        vx[k] = 0;
        vy[k] = 0;
        continue;
      }
      moving = true;
      vx[k] = (vx[k]! * nsp) / sp;
      vy[k] = (vy[k]! * nsp) / sp;
      m.x += vx[k]! * STEP;
      m.y += vy[k]! * STEP;
      // Le cadre de bois
      if (m.x < -PIT.w + MARBLE_R) {
        m.x = -PIT.w + MARBLE_R;
        vx[k] = -vx[k]! * 0.4;
        hits.push([t, sp * 0.4]);
      } else if (m.x > PIT.w - MARBLE_R) {
        m.x = PIT.w - MARBLE_R;
        vx[k] = -vx[k]! * 0.4;
        hits.push([t, sp * 0.4]);
      }
      if (m.y > PIT.y1 - MARBLE_R) {
        m.y = PIT.y1 - MARBLE_R;
        vy[k] = -vy[k]! * 0.4;
        hits.push([t, sp * 0.4]);
      } else if (m.y < PIT.y0 + MARBLE_R) {
        m.y = PIT.y0 + MARBLE_R;
        vy[k] = -vy[k]! * 0.4;
      }
      // Le pot : lente, elle y tombe ; trop vite, elle saute par-dessus en perdant de sa vitesse
      const dx = m.x - POT.x;
      const dy = m.y - POT.y;
      if (dx * dx + dy * dy < (POT.r - MARBLE_R * 0.4) * (POT.r - MARBLE_R * 0.4)) {
        if (nsp < 1.25) {
          m.pot = ++potCount;
          m.x = POT.x + dx * 0.4;
          m.y = POT.y + dy * 0.4;
          vx[k] = 0;
          vy[k] = 0;
          if (potAt < 0) potAt = t;
        } else {
          vx[k] = vx[k]! * 0.985;
          vy[k] = vy[k]! * 0.985;
        }
      }
    }
    // Les chocs entre billes (élastiques, à masses égales, un peu amortis)
    for (let a = 0; a < n; a++) {
      const A = ms[a]!;
      if (A.pot) continue;
      for (let b = a + 1; b < n; b++) {
        const B = ms[b]!;
        if (B.pot) continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d2 = dx * dx + dy * dy;
        const min = MARBLE_R * 2;
        if (d2 >= min * min || d2 <= 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const rel = (vx[a]! - vx[b]!) * nx + (vy[a]! - vy[b]!) * ny;
        // On les sépare, puis on échange la vitesse le long de la ligne des centres
        const push = (min - d) / 2;
        A.x -= nx * push;
        A.y -= ny * push;
        B.x += nx * push;
        B.y += ny * push;
        if (rel <= 0) continue;
        const j = rel * 0.92;
        vx[a] = vx[a]! - j * nx;
        vy[a] = vy[a]! - j * ny;
        vx[b] = vx[b]! + j * nx;
        vy[b] = vy[b]! + j * ny;
        hits.push([t, rel]);
        moving = true;
      }
    }
    t += STEP;
    if (frames && step % 4 === 0) {
      for (let k = 0; k < n; k++) {
        pos[k * 2] = ms[k]!.x;
        pos[k * 2 + 1] = ms[k]!.y;
      }
      frames(pos);
    }
    if (!moving && step > 2) break;
  }
  return { marbles: ms, time: t, hits, potAt };
}

/** La vitesse qu'il faut pour qu'une bille s'arrête à cette distance */
export const speedFor = (dist: number) => Math.sqrt(2 * FRICTION * Math.max(0.05, dist));
/** De la force (0 à 1) à la vitesse */
export const powerSpeed = (p: number) => 0.4 + 3.1 * clamp(p, 0, 1);

export interface Duel {
  a: number;
  b: number;
  wins: [number, number];
  manche: number;
  /** Qui lance (0 : a, 1 : b), combien de billes lancées dans cette manche */
  turn: 0 | 1;
  thrown: number;
  marbles: Marble[];
  /** Le dernier lancer : les billes d'avant, le lancer, quand il part, quand tout est arrêté */
  last: { before: Marble[]; shot: Shot; at: number; time: number } | null;
  /** Le lanceur doit avoir lancé à cette heure ; on ne lance pas avant `ready` */
  deadline: number;
  ready: number;
  /** Le gagnant de chaque manche (0 ou 1) */
  results: number[];
  winner: number;
  botAt: number;
  /** Les billes mises au pot par chacun des deux */
  pots: [number, number];
}

export interface BillesState {
  kind: "billes";
  stage: "paires" | "jeu" | "fin";
  stageAt: number;
  until: number;
  ids: string[];
  st: number[];
  duels: Duel[];
  /** Le duel de chacun (-1 : exempté) */
  duelOf: number[];
}

export function billesStart(ids: string[], now: number, ctx: EpCtx): BillesState {
  const order = shuffle(
    ctx.rng,
    ids.map((_, i) => i),
  );
  const duels: Duel[] = [];
  const duelOf = ids.map(() => -1);
  for (let k = 0; k + 1 < order.length; k += 2) {
    duelOf[order[k]!] = duels.length;
    duelOf[order[k + 1]!] = duels.length;
    duels.push({
      a: order[k]!,
      b: order[k + 1]!,
      wins: [0, 0],
      manche: 1,
      turn: random(ctx.rng) < 0.5 ? 0 : 1,
      thrown: 0,
      marbles: [],
      last: null,
      deadline: 0,
      ready: 0,
      results: [],
      winner: -1,
      botAt: 0,
      pots: [0, 0],
    });
  }
  const st = ids.map(() => 0);
  // L'exempté (nombre impair) passe sans jouer
  if (order.length % 2 === 1) st[order[order.length - 1]!] = SAFE;
  return { kind: "billes", stage: "paires", stageAt: now, until: now + 6000, ids, st, duels, duelOf };
}

/** Le lanceur dont c'est le tour dans ce duel (indice de candidat) */
export const thrower = (d: Duel) => (d.turn === 0 ? d.a : d.b);

/** Un vrai joueur lance : un angle (radians, 0 tout droit, positif vers la droite) et une force (0 à 1) */
export function billesThrow(s: BillesState, id: string, angle: number, power: number, ctx: EpCtx) {
  const i = s.ids.indexOf(id);
  if (i < 0 || s.stage !== "jeu") return;
  const d = s.duels[s.duelOf[i]!];
  if (!d || d.winner >= 0 || thrower(d) !== i || ctx.now < d.ready) return;
  if (!Number.isFinite(angle) || !Number.isFinite(power)) return;
  // La main tremble un peu
  throwMarble(d, clamp(angle, -0.6, 0.6) + gauss(ctx.rng) * 0.012, clamp(power, 0, 1) * (1 + gauss(ctx.rng) * 0.025), ctx);
}

function throwMarble(d: Duel, angle: number, power: number, ctx: EpCtx) {
  const sp = powerSpeed(power);
  const shot: Shot = { o: d.turn, vx: r3(Math.sin(angle) * sp), vy: r3(Math.cos(angle) * sp) };
  const before = d.marbles.map((m) => ({ ...m }));
  const roll = simulate(before, shot);
  const potted = (ms: readonly Marble[], o: 0 | 1) => ms.filter((m) => m.pot > 0 && m.o === o).length;
  for (const o of [0, 1] as const) d.pots[o] += potted(roll.marbles, o) - potted(before, o);
  d.marbles = roll.marbles.map((m) => ({ ...m, x: r3(m.x), y: r3(m.y) }));
  d.last = { before, shot, at: ctx.now, time: roll.time };
  d.thrown++;
  d.turn = d.turn === 0 ? 1 : 0;
  d.ready = ctx.now + roll.time * 1000 + 550;
  d.deadline = d.ready + (ctx.eclair ? TURN_S * 0.6 : TURN_S) * 1000;
  d.botAt = 0;
  ctx.fx("lance", { a: d.a, b: Math.round(roll.time * 1000), c: roll.potAt >= 0 ? 1 : 0 });
}

/** Qui gagne la manche : la première bille au pot, sinon la plus proche */
export function mancheWinner(ms: readonly Marble[]): 0 | 1 | -1 {
  const inPot = ms.filter((m) => m.pot > 0).sort((a, b) => a.pot - b.pot);
  if (inPot.length) return inPot[0]!.o;
  let best = Infinity;
  let who: 0 | 1 | -1 = -1;
  for (const m of ms) {
    const dx = m.x - POT.x;
    const dy = m.y - POT.y;
    const d = dx * dx + dy * dy;
    if (d < best - 1e-9) {
      best = d;
      who = m.o;
    } else if (Math.abs(d - best) <= 1e-9 && who !== m.o) who = -1;
  }
  return who;
}

function botShot(d: Duel, lv: ReturnType<EpCtx["level"]>, ctx: EpCtx): [number, number] {
  const o = d.turn;
  // Viser le pot ; le fort chasse parfois la bille adverse la plus proche du pot si elle mène
  let tx = POT.x;
  let ty = POT.y;
  const theirs = d.marbles.filter((m) => m.o !== o && !m.pot);
  const lead = mancheWinner(d.marbles);
  if (lv === "fort" && lead !== o && lead !== -1 && theirs.length && random(ctx.rng) < 0.45) {
    const near = theirs.sort((a, b) => (a.x - POT.x) ** 2 + (a.y - POT.y) ** 2 - ((b.x - POT.x) ** 2 + (b.y - POT.y) ** 2))[0]!;
    tx = near.x;
    ty = near.y;
  }
  const sx = startX(o);
  const dist = Math.sqrt((tx - sx) ** 2 + ty ** 2);
  const angle = Math.atan2(tx - sx, ty) + gauss(ctx.rng) * byLevel(lv, [0.07, 0.04, 0.022]);
  const want = (speedFor(dist) + (tx !== POT.x ? 0.5 : 0) - 0.4) / 3.1;
  return [angle, want * (1 + gauss(ctx.rng) * byLevel(lv, [0.1, 0.06, 0.035]))];
}

export function billesTick(s: BillesState, ctx: EpCtx) {
  const now = ctx.now;
  if (s.stage === "fin") return;
  if (s.stage === "paires") {
    if (now < s.until) return;
    s.stage = "jeu";
    s.stageAt = now;
    for (const d of s.duels) {
      d.ready = now + 600;
      d.deadline = d.ready + TURN_S * 1000;
    }
    ctx.fx("billes");
    return;
  }
  for (const d of s.duels) {
    if (d.winner >= 0 || now < d.ready) continue;
    if (d.thrown >= THROWS * 2) {
      // La manche est jouée
      const w = mancheWinner(d.marbles);
      const winner = w === -1 ? (random(ctx.rng) < 0.5 ? 0 : 1) : w;
      d.wins[winner]++;
      d.results.push(winner);
      ctx.fx("manche", { a: winner === 0 ? d.a : d.b, b: d.manche });
      if (d.wins[winner] >= WIN_MANCHES) {
        d.winner = winner;
        const lose = winner === 0 ? d.b : d.a;
        s.st[winner === 0 ? d.a : d.b] = SAFE;
        s.st[lose] = OUT;
        ctx.out(s.ids[lose]!, "gelee");
        ctx.fx("seau", { id: s.ids[lose] });
        continue;
      }
      d.manche++;
      d.marbles = [];
      d.last = null;
      d.thrown = 0;
      // Le perdant de la manche ouvre la suivante
      d.turn = winner === 0 ? 1 : 0;
      d.ready = now + MANCHE_PAUSE_MS;
      d.deadline = d.ready + TURN_S * 1000;
      continue;
    }
    const i = thrower(d);
    const id = s.ids[i]!;
    const auto = ctx.auto(id) || s.st[i] !== PLAYING;
    if (auto && !d.botAt) d.botAt = now + between(ctx.rng, 800, 2000);
    if ((auto && now >= d.botAt) || now >= d.deadline) {
      const [angle, power] = botShot(d, ctx.level(id), ctx);
      throwMarble(d, angle, power, ctx);
    }
  }
  if (s.duels.every((d) => d.winner >= 0)) {
    s.stage = "fin";
    s.stageAt = now;
  }
}

export const billesOver = (s: BillesState) => s.stage === "fin";

export function billesPerf(s: BillesState, i: number): number {
  const d = s.duels[s.duelOf[i]!];
  if (!d) return 100;
  const me = d.a === i ? 0 : 1;
  return d.wins[me] * 10 + (d.winner === me ? 50 : 0);
}

export function billesView(s: BillesState) {
  return s;
}
export type BillesView = ReturnType<typeof billesView>;

/** Pour les essais : le pot est-il atteignable tout droit ? */
export const straightPower = () => (speedFor(POT.y) - 0.4) / 3.1;
