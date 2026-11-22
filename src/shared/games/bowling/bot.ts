// Les bots du bowling : ils choisissent où lâcher la boule, combien d'effet donner et où l'envoyer (la poche sur un jeu
// complet ; sur un spare, la quille la plus en avant, prise du côté des autres), cherchent la bonne direction en faisant
// rouler la boule seule sur la piste, puis lancent avec la maladresse de leur niveau.

import { HEAD_PIN, rowOf, type PinSpot } from "./lane.ts";
import { physOf, type BotLevel, type Match } from "./match.ts";
import { type PhysConfig } from "./physics.ts";
import { cleanThrow, DIR_MAX, MAX_STEPS, startThrow, X_MAX, type ThrowParams } from "./throw.ts";
import { random, type RngHolder } from "../../rng.ts";

interface Skill {
  /** L'effet qu'il donne sur un jeu complet (au hasard entre les deux) */
  spin: [number, number];
  speed: [number, number];
  /** Sa maladresse : l'écart type de la direction, de la vitesse, de l'effet, de sa place */
  dirErr: number;
  speedErr: number;
  spinErr: number;
  xErr: number;
}

const SKILL: Record<BotLevel, Skill> = {
  fort: { spin: [15, 22], speed: [7.9, 8.7], dirErr: 0.0015, speedErr: 0.25, spinErr: 1.5, xErr: 0.012 },
  moyen: { spin: [8, 15], speed: [7.2, 8.4], dirErr: 0.0058, speedErr: 0.6, spinErr: 3.5, xErr: 0.035 },
  facile: { spin: [0, 7], speed: [5.6, 8], dirErr: 0.0095, speedErr: 1, spinErr: 4, xErr: 0.05 },
};

/** Le temps qu'il prend avant de lancer (il se met en place, il vise) */
export function thinkTime(level: BotLevel, rng: RngHolder): number {
  const base = level === "fort" ? 2600 : level === "moyen" ? 3000 : 3400;
  return base + random(rng) * 2200;
}

function gauss(rng: RngHolder): number {
  // Box-Muller : seulement pour choisir le lancer (la physique, elle, ne voit que les nombres qui en sortent)
  const u = Math.max(1e-9, random(rng)),
    v = random(rng);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Où passe la boule seule à cette distance de la ligne de faute */
export function ballAt(t: ThrowParams, dist: number, cfg: PhysConfig): { x: number; ok: boolean } {
  const w = startThrow([], t, cfg);
  while (w.step < MAX_STEPS && -w.ball.pz < dist && !w.ball.gone) w.advance();
  return { x: w.ball.px, ok: !w.inGutter && !w.ball.gone };
}

/** La direction qui amène la boule en `tx` à la distance `dist` (quelques essais, chaque fois corrigés) */
export function aimDirection(x: number, v: number, s: number, tx: number, dist: number, cfg: PhysConfig): number {
  let d = (tx - x) / dist;
  for (let i = 0; i < 5; i++) {
    const at = ballAt({ x, d, v, s }, dist, cfg).x;
    const err = tx - at;
    if (Math.abs(err) < 0.002) break;
    d += err / (dist * 1.02);
    d = Math.max(-DIR_MAX, Math.min(DIR_MAX, d));
  }
  return d;
}

/** Où viser pour ces quilles : la quille de devant, prise du côté des autres */
export function spareTarget(rack: readonly PinSpot[]): { x: number; dist: number } {
  const front = Math.min(...rack.map((p) => rowOf(p.n)));
  const key = rack.filter((p) => rowOf(p.n) === front).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0]!;
  const cx = rack.reduce((s, p) => s + p.x, 0) / rack.length;
  const lean = Math.max(-0.07, Math.min(0.07, (cx - key.x) * 0.4));
  return { x: key.x + lean, dist: -key.z - 0.05 };
}

/** Le lancer d'un bot (gaucher : `left`) */
export function planThrow(m: Match, level: BotLevel, left: boolean, rng: RngHolder): ThrowParams {
  const sk = SKILL[level];
  const cfg = physOf(m.cfg);
  const hand = left ? -1 : 1;
  const full = m.rack.length === 10 && m.cfg.mode === "classique";
  const lerp = (r: [number, number]) => r[0] + (r[1] - r[0]) * random(rng);
  let s = lerp(sk.spin) * hand;
  let v = lerp(sk.speed);
  let x: number, tx: number, dist: number;
  if (m.cfg.glisse) s = 0;
  if (full) {
    // La poche : entre la quille de tête et la 3 (la 2 pour un gaucher)
    tx = 0.06 * hand;
    dist = HEAD_PIN;
    x = (0.1 + Math.abs(s) * 0.012) * hand;
  } else {
    // Un spare : peu d'effet, et on lance en travers de la piste vers la quille
    s = Math.sign(s) * Math.min(Math.abs(s), 4);
    v = Math.max(v, 7.6);
    const target = spareTarget(m.rack);
    tx = target.x;
    dist = target.dist;
    x = Math.abs(tx) < 0.1 ? 0.05 * hand : -Math.sign(tx) * 0.22;
  }
  x = Math.max(-X_MAX, Math.min(X_MAX, x));
  const d = aimDirection(x, v, s, tx, dist, cfg);
  const t = cleanThrow({
    x: x + gauss(rng) * sk.xErr,
    d: d + gauss(rng) * sk.dirErr,
    v: v + gauss(rng) * sk.speedErr,
    s: s + gauss(rng) * sk.spinErr * (m.cfg.glisse ? 0 : 1),
  });
  return t ?? { x: 0, d: 0, v: 8, s: 0 };
}
