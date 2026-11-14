// Les courbes des animations d'objets : ce qui fait qu'un objet rebondit, qu'un kart grandit par à-coups ou qu'il
// s'aplatit comme une crêpe. Des fonctions simples, sans rien à dessiner.

import type { Hazard } from "../../../shared/games/bolides/items.ts";
import type { Kart } from "../../../shared/games/bolides/physics.ts";

/** De 0 à 1 en dépassant un peu l'arrivée, comme un ressort */
export function backOut(t: number, overshoot = 1.9): number {
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

/** La valeur d'une suite de points [temps, valeur], reliés par des droites */
export function keyframes(table: readonly (readonly [number, number])[], t: number): number {
  if (t <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [t1, v1] = table[i]!;
    if (t <= t1) {
      const [t0, v0] = table[i - 1]!;
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return table[table.length - 1]![1];
}

const GROW = [
  [0, 1],
  [0.09, 1.42],
  [0.19, 1.16],
  [0.31, 1.62],
  [0.41, 1.38],
  [0.55, 1.9],
  [0.66, 1.8],
] as const;

const SHRINK = [
  [0, 1.8],
  [0.09, 1.2],
  [0.18, 1.46],
  [0.28, 1.06],
  [0.36, 1.18],
  [0.45, 1],
] as const;

/** La taille d'un véhicule sous la potion géante : il grandit par à-coups, et rétrécit de même. `t` : depuis le dernier changement */
export function giantScale(on: boolean, t: number): number {
  return keyframes(on ? GROW : SHRINK, t);
}

const FLAT = [
  [0, 1],
  [0.05, 0.22],
  [0.42, 0.22],
  [0.54, 1.3],
  [0.64, 0.86],
  [0.74, 1],
] as const;

/** Écrasé par un géant : la hauteur du kart, plat comme une crêpe, qui se regonfle d'un coup */
export function flatScale(t: number): number {
  return keyframes(FLAT, t);
}

/** Le clignotement d'une bombe : de plus en plus rapide à mesure que la mèche brûle (`fuse` de 0 à 1) */
export function bombBlink(fuse: number): number {
  return Math.sin(fuse * fuse * 54 + fuse * 10) > 0 ? 1 : 0;
}

/**
 * Le départ d'un objet lancé : il part du nez du kart qui le lance, puis rejoint en douceur la course que le serveur
 * lui a donnée (le temps que le message fasse l'aller-retour, le kart a avancé, et l'objet serait apparu dedans ou
 * derrière lui). Seulement s'il vient d'être lancé, et si l'écart reste raisonnable ; ça ne change que l'affichage.
 */
const LAUNCH_FRESH_MS = 600;
const LAUNCH_NOSE = 1.6;
const LAUNCH_MAX = 30;

export interface LaunchGap {
  x: number;
  y: number;
  z: number;
  /** Le temps pris pour le rattraper, en secondes */
  ease: number;
}

/**
 * L'écart entre le nez du kart qui vient de lancer cet objet et l'endroit où l'objet est (`p`, au moment où on le
 * voit pour la première fois) ; null s'il n'y a rien à rattraper. `owner` : le kart du lanceur, tel qu'on le montre.
 */
export function launchGap(
  hz: Hazard,
  p: { x: number; y: number; z: number },
  now: number,
  owner: Pick<Kart, "x" | "y" | "z" | "air" | "h"> | undefined,
): LaunchGap | null {
  if (!owner || hz.kind === "huile" || now - hz.at > LAUNCH_FRESH_MS) return null;
  // Devant lui, ou derrière s'il l'a lancé de l'autre côté ; la bombe part d'au-dessus du kart
  const dir =
    hz.kind === "petard" || hz.kind === "bowling" ? (hz.speed < 0 ? -1 : 1) : hz.kind === "tarte" ? hz.dir : hz.kind === "fusee" ? 1 : 0;
  const lift = hz.kind === "tarte" ? 2.4 : hz.kind === "fusee" ? 3 : hz.kind === "bombe" ? 1.2 : 0;
  const x = owner.x + Math.sin(owner.h) * LAUNCH_NOSE * dir - p.x;
  const z = owner.z + Math.cos(owner.h) * LAUNCH_NOSE * dir - p.z;
  const far = Math.hypot(x, z);
  if (far < 0.3 || far > LAUNCH_MAX) return null;
  // Plus l'écart est grand, plus on prend le temps de le rattraper : l'objet ne doit jamais sembler reculer
  return { x, y: owner.y + Math.max(0, owner.air) + lift - p.y, z, ease: Math.max(0.25, Math.min(0.8, far * 0.2)) };
}

/** Ce qui reste de l'écart au départ, `t` secondes après qu'on a vu l'objet : 1 au départ, 0 une fois rattrapé */
export function launchLeft(t: number, ease: number): number {
  const u = Math.min(1, Math.max(0, t / ease));
  return 1 - u * u * (3 - 2 * u);
}
