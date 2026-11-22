// Le geste du lancer, à la souris ou au doigt : on garde appuyé sur la boule, on recule (le bras part en arrière), on
// pousse vers l'avant et on lâche. La vitesse du geste au moment de lâcher donne la force ; s'il part de travers, la
// boule dévie d'autant ; un coup de poignet sur le côté juste avant de lâcher donne l'effet (vers la gauche : la boule
// courbe vers la gauche). Tout se mesure en hauteurs d'écran, pour que le geste soit le même sur un téléphone et un
// grand écran.

import { DIR_MAX, SPEED_MAX, SPEED_MIN, SPIN_MAX } from "../../shared/games/bowling/throw.ts";

export interface Sample {
  /** L'heure (ms), et la position (px) */
  t: number;
  x: number;
  y: number;
}

/** Le bras pendant le geste : 0 pendu, négatif en arrière (jusqu'à −1,75), positif en avant (jusqu'à 2,2) */
export function armAngle(start: Sample, at: Sample, h: number): number {
  const dy = (at.y - start.y) / h;
  return Math.max(-1.75, Math.min(2.2, -dy * 5.5));
}

export interface Release {
  /** La vitesse de la boule (m/s) */
  v: number;
  /** L'écart de direction dû au geste de travers (ajouté à la visée) */
  dev: number;
  /** L'effet (rad/s), positif vers la gauche */
  s: number;
  /** Mesures du geste, pour l'afficher (hauteurs d'écran par seconde) */
  up: number;
  flick: number;
}

/** Pourquoi un geste ne lance pas */
export type Refusal = "back" | "slow";

const MIN_UP = 0.9;

/**
 * Le lancer que donne ce geste (tous les points depuis l'appui, le dernier au moment de lâcher), ou la raison pour
 * laquelle il ne part pas : le bras n'est jamais parti en arrière, ou la poussée vers l'avant est trop lente.
 */
export function release(samples: readonly Sample[], h: number): Release | Refusal {
  if (samples.length < 3) return "back";
  const first = samples[0]!;
  // Le point le plus bas du geste : le haut de l'élan, derrière
  let low = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i]!.y > samples[low]!.y) low = i;
  const back = (samples[low]!.y - first.y) / h;
  if (back < 0.04) return "back";
  const last = samples[samples.length - 1]!;
  // La vitesse à la fin : sur les 70 dernières millisecondes
  let i0 = samples.length - 1;
  while (i0 > low && last.t - samples[i0 - 1]!.t <= 70) i0--;
  if (i0 === samples.length - 1 && i0 > low) i0--;
  const a = samples[i0]!;
  const dt = Math.max(8, last.t - a.t) / 1000;
  const vy = (a.y - last.y) / h / dt;
  const vx = (last.x - a.x) / h / dt;
  if (vy < MIN_UP) return "slow";
  // Le geste vers l'avant, du point bas jusqu'au coup de poignet : s'il penche, la boule dévie
  const fwdY = (samples[low]!.y - a.y) / h;
  const fwdX = (a.x - samples[low]!.x) / h;
  const tilt = fwdY > 0.02 ? fwdX / fwdY : 0;
  // Le coup de poignet : ce que la fin du geste a de plus sur le côté que tout le reste
  const flick = vx / vy - tilt;
  const v = Math.max(SPEED_MIN, Math.min(SPEED_MAX, 3.2 + vy * 1.5));
  const dev = Math.max(-DIR_MAX, Math.min(DIR_MAX, tilt * 0.0085));
  // Un petit écart de la main ne compte pas : l'effet ne vient que d'un vrai coup de poignet
  const f = Math.abs(flick) < 0.06 ? 0 : flick - Math.sign(flick) * 0.06;
  const s = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, -f * 42));
  return { v, dev, s, up: vy, flick };
}

/** Le nom de l'effet, pour le montrer après le lancer */
export function spinName(s: number): string {
  const a = Math.abs(s);
  if (a < 3) return "sans effet";
  const side = s > 0 ? "à gauche" : "à droite";
  return a < 10 ? `un peu d'effet ${side}` : a < 20 ? `de l'effet ${side}` : `beaucoup d'effet ${side}`;
}

/** La vitesse en km/h, comme on la lit au-dessus des pistes */
export const kmh = (v: number) => Math.round(v * 3.6);
