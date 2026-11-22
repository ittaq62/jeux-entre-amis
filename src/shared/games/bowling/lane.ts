// La piste de bowling, à ses vraies mesures : la ligne de faute en z = 0, la boule roule vers les z négatifs (x à
// droite, y en haut, comme dans la 3D), la quille de tête à 18,29 m, les rigoles de chaque côté, le plateau des quilles,
// les murs de côté et la fosse au fond. Les dix quilles se posent en triangle, à 30,48 cm l'une de l'autre.

/** La demi-largeur de la piste (39 lattes, 1,054 m) */
export const LANE_HALF = 0.527;
/** Le bord extérieur des rigoles (et le pied des murs de côté) */
export const GUTTER_OUTER = 0.762;
/** Le creux d'une rigole : un arc de cercle de ce rayon, dont l'axe est à cette hauteur (profondeur 4,75 cm) */
export const GUTTER_R = 0.169;
export const GUTTER_YC = 0.12147;
/** L'axe de la rigole de droite (celle de gauche en est le miroir) */
export const GUTTER_XC = LANE_HALF + (GUTTER_OUTER - LANE_HALF) / 2;
/** De la ligne de faute à la quille de tête */
export const HEAD_PIN = 18.288;
/** Le bout du plateau des quilles, au bord de la fosse */
export const DECK_END = HEAD_PIN + 0.868;
/** Le fond de la fosse, et le rideau qui arrête tout */
export const PIT_DEPTH = 0.32;
export const CUSHION = DECK_END + 0.9;
/** Les murs de côté : bas le long de la piste, hauts autour du plateau (les quilles y rebondissent) */
export const WALL_LOW = 0.08;
export const WALL_HIGH = 0.62;
export const KICKBACK_FROM = HEAD_PIN - 0.75;
/** Le plafond de la machine, au-dessus du plateau */
export const CEILING = 0.82;
/** Fin de l'huile : au-delà, la piste est sèche et la boule mord */
export const OIL_END = 12.2;
/** L'élan derrière la ligne de faute */
export const APPROACH = 4.6;
/** Écart entre deux quilles voisines, et entre deux rangées */
export const PIN_SPACING = 0.3048;
export const ROW_SPACING = (PIN_SPACING * 0.8660254037844386) as number;
/** Hauteur d'une quille, son plus grand rayon, le rayon de sa base */
export const PIN_H = 0.381;
export const PIN_BELLY_R = 0.0605;

/** Une quille debout : son numéro (1 la quille de tête, 7 à 10 au fond) et où se pose sa base */
export interface PinSpot {
  n: number;
  x: number;
  z: number;
}

const ROWS: number[][] = [[1], [2, 3], [4, 5, 6], [7, 8, 9, 10]];

const tenth = (v: number) => Math.round(v * 10000) / 10000;

/** Les dix quilles à leur place (au dixième de millimètre, comme les quilles que la machine repose) */
export const RACK: readonly PinSpot[] = ROWS.flatMap((row, k) =>
  row.map((n, i) => ({ n, x: tenth((i - (row.length - 1) / 2) * PIN_SPACING), z: tenth(-(HEAD_PIN + k * ROW_SPACING)) })),
);

export const SPOT_OF = new Map(RACK.map((p) => [p.n, p]));

/** La rangée d'une quille (0 pour la quille de tête, 3 pour le fond) */
export function rowOf(n: number): number {
  return n === 1 ? 0 : n <= 3 ? 1 : n <= 6 ? 2 : 3;
}

/** Les quilles de ces numéros, à leur place */
export function rackOf(numbers: readonly number[]): PinSpot[] {
  return RACK.filter((p) => numbers.includes(p.n)).map((p) => ({ ...p }));
}

/** La distance parcourue sur la piste depuis la ligne de faute */
export const along = (z: number) => -z;
