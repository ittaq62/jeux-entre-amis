// Les courbes des animations d'objets : ce qui fait qu'un objet rebondit, qu'un kart grandit par à-coups ou qu'il
// s'aplatit comme une crêpe. Des fonctions simples, sans rien à dessiner.

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
