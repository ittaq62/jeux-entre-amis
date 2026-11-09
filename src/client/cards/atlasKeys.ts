import { CARDS } from "../../shared/cards.ts";

/** Les sujets en 3D, dans l'ordre de la planche d'images */
export const ATLAS_KEYS = CARDS.flatMap((c) => (c.art.kind === "atlas" ? [c.art.key] : []));
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = Math.ceil(ATLAS_KEYS.length / ATLAS_COLS);
export const ATLAS_CELL = 320;
