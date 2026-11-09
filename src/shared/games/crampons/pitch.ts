// Le terrain de Crampons, en mètres. x va d'un but à l'autre, z d'une touche à l'autre, y monte vers le ciel.

export const HALF_L = 52.5;
export const HALF_W = 34;
export const GOAL_HALF = 3.66;
export const GOAL_H = 2.44;
export const GOAL_DEPTH = 2.2;
export const BOX_L = 16.5;
export const BOX_HALF = 20.16;
export const SIX_L = 5.5;
export const SIX_HALF = 9.16;
export const SPOT_L = 11;
export const CIRCLE_R = 9.15;

/** Le pas du monde : le serveur et le téléphone calculent tous deux par trentièmes de seconde */
export const DT = 1 / 30;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const wrapAngle = (a: number) => {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
};

/** Cette position est-elle dans la surface de réparation du but situé du côté `end` (+1 ou -1) ? */
export const inBox = (x: number, z: number, end: number) => x * end > HALF_L - BOX_L && Math.abs(z) < BOX_HALF;

/** Ramène un point sur le terrain, à `margin` mètres des lignes */
export function onPitch(x: number, z: number, margin = 1): [number, number] {
  return [clamp(x, -HALF_L + margin, HALF_L - margin), clamp(z, -HALF_W + margin, HALF_W - margin)];
}
