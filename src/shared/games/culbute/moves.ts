// Les coups de Culbute, décrits comme des données : combien d'images ils durent, où et quand ils frappent, avec
// quelle force, ce qu'ils font du corps (un élan, une montée, une charge). Chaque style a les siens (styles.ts) ; ceux
// d'ici sont communs à tout le monde : se hisser au rebord, lancer un objet, frapper avec la baguette.

/** La posture que montre l'écran pendant un coup (le dessin s'en charge, l'accessoire suit) */
export type PoseId =
  | "jab"
  | "side"
  | "up"
  | "low"
  | "spin"
  | "airFwd"
  | "airUp"
  | "airDown"
  | "smashSide"
  | "smashUp"
  | "smashDown"
  | "throw"
  | "lob"
  | "lunge"
  | "rise"
  | "slam"
  | "counter"
  | "sit"
  | "stomp"
  | "cast"
  | "blow"
  | "climb"
  | "pickup"
  | "grab"
  | "taunt";

export interface HitDef {
  /** Les images où le coup frappe (comptées depuis le début du coup, bornes comprises) */
  from: number;
  to: number;
  /** Le centre de la zone de frappe, depuis les pieds, x vers l'avant ; son rayon */
  x: number;
  y: number;
  r: number;
  /** Les pourcents infligés */
  dmg: number;
  /** L'angle d'éjection en degrés : 0 droit devant, 90 vers le haut, négatif vers le bas */
  ang: number;
  /** L'éjection de base (m/s), et ce qu'elle gagne pour 100 % de dégâts chez celui qui la reçoit */
  kb: number;
  kbg: number;
  /** Retouche toutes les n images (coups qui frappent plusieurs fois) */
  rehit?: number;
  /** Ramène vers soi au lieu d'éjecter (le lasso) */
  pull?: boolean;
  /** Frappe des deux côtés (x vers l'avant et vers l'arrière) */
  both?: boolean;
}

export interface MoveDef {
  name: string;
  frames: number;
  hits: HitDef[];
  pose: PoseId;
  /** Coup en l'air : s'il touche le sol avant la fin, il récupère pendant autant d'images */
  landLag?: number;
  /** À cette image, il attend tant que le bouton est tenu, au plus `max` images */
  charge?: { at: number; max: number; button: number };
  /** Élan donné : de l'image `from` à `to`, sa vitesse devient vx (vers l'avant) et/ou vy */
  push?: { from: number; to: number; vx?: number; vy?: number }[];
  /** Ce qu'il garde du contrôle en l'air pendant le coup (1 : comme d'habitude) */
  drift?: number;
  /** La pesanteur pendant le coup (1 : comme d'habitude) */
  gravity?: number;
  /** En chute libre ensuite, jusqu'au sol ou au rebord (les coups qui font remonter) */
  helpless?: boolean;
  /** Peut attraper le rebord à partir de cette image */
  grab?: number;
  /** Encaisse sans être éjecté pendant ces images */
  armor?: [number, number];
  /** Pare et rend le coup pendant ces images */
  counter?: [number, number];
  /** Intouchable pendant ces images */
  intang?: [number, number];
  /** Ce qu'il lance, à quelle image */
  shoot?: { at: number; kind: string };
  /** Un comportement propre (voir engine.ts) */
  special?: "stomp" | "grapple" | "rummage" | "trap";
  /** Un seul à la fois de ce qu'il lance */
  oneShot?: string;
}

export const h = (
  from: number,
  to: number,
  x: number,
  y: number,
  r: number,
  dmg: number,
  ang: number,
  kb: number,
  kbg: number,
  more: Partial<HitDef> = {},
): HitDef => ({ from, to, x, y, r, dmg, ang, kb, kbg, ...more });

/** Les coups de chaque style, par direction : au sol, en l'air, spéciaux, chargés */
export type MoveSlot = "n" | "s" | "u" | "d" | "an" | "as" | "au" | "ad" | "pn" | "ps" | "pu" | "pd" | "cs" | "cu" | "cd";
export const MOVE_SLOTS: MoveSlot[] = ["n", "s", "u", "d", "an", "as", "au", "ad", "pn", "ps", "pu", "pd", "cs", "cu", "cd"];

/**
 * Une attaque au sol tenue jusqu'à cette image devient l'attaque chargée de sa direction : les attaques au sol de côté,
 * vers le haut et vers le bas ne frappent jamais avant (un simple appui reste une attaque normale).
 */
export const CHARGE_DECIDE = 8;
export const CHARGED_OF: Partial<Record<MoveSlot, MoveSlot>> = { s: "cs", u: "cu", d: "cd" };

/** La charge rend l'attaque jusqu'à 40 % plus forte */
export const CHARGE_BONUS = 0.4;

// Les coups communs à tout le monde
export const GENERIC: Record<string, MoveDef> = {
  /** Saisir celui qui est devant soi (même en garde) ; raté, on reste un instant les bras tendus */
  grab: { name: "Saisie", frames: 26, pose: "grab", hits: [] },
  /** Une petite tape à celui qu'on tient */
  pummel: { name: "Petite tape", frames: 14, pose: "jab", hits: [] },
  /** Les projections : il part à l'image `at` de la projection (voir THROWS dans engine.ts) */
  tF: { name: "Projection en avant", frames: 24, pose: "throw", hits: [] },
  tB: { name: "Projection en arrière", frames: 28, pose: "spin", hits: [] },
  tU: { name: "Projection en l'air", frames: 26, pose: "smashUp", hits: [] },
  tD: { name: "Projection au sol", frames: 26, pose: "slam", hits: [] },
  /** Se hisser sur le plateau en frappant */
  ledgeAtk: { name: "Remontée en frappant", frames: 32, pose: "climb", hits: [h(18, 21, 0.9, 0.5, 0.65, 7, 35, 8, 4)], intang: [0, 16] },
  /** Se hisser, tout simplement */
  climb: { name: "Remontée", frames: 22, pose: "climb", hits: [], intang: [0, 14] },
  /** Se relever en frappant des deux côtés (au sol, après une chute) */
  getupAtk: { name: "Relevée", frames: 30, pose: "spin", hits: [h(14, 17, 0.8, 0.4, 0.6, 6, 30, 7, 4, { both: true })], intang: [0, 13] },
  pickup: { name: "Ramasser", frames: 8, pose: "pickup", hits: [] },
  /** Lancer l'objet tenu */
  throwF: { name: "Lancer", frames: 22, pose: "throw", hits: [], shoot: { at: 7, kind: "item" } },
  throwU: { name: "Lancer en l'air", frames: 22, pose: "airUp", hits: [], shoot: { at: 7, kind: "item" } },
  throwD: { name: "Lancer vers le bas", frames: 22, pose: "airDown", hits: [], shoot: { at: 7, kind: "item" } },
  /** La baguette : une grande allonge */
  bagS: { name: "Coup de baguette", frames: 28, pose: "side", hits: [h(9, 12, 1.45, 0.85, 0.6, 11, 38, 7, 17)] },
  bagA: { name: "Baguette en l'air", frames: 30, pose: "airFwd", hits: [h(8, 11, 1.35, 0.75, 0.6, 10, 40, 7, 15)], landLag: 10 },
  bagC: {
    name: "Grand coup de baguette",
    frames: 48,
    pose: "smashSide",
    charge: { at: 10, max: 60, button: 1 },
    hits: [h(14, 16, 1.6, 0.9, 0.7, 17, 37, 9, 30)],
  },
  /** Narguer : une petite danse bras levés, une bulle au-dessus de la tête (et on reste à découvert) */
  taunt: { name: "Narguer", frames: 60, pose: "taunt", hits: [] },
};

export const GENERIC_KEYS = Object.keys(GENERIC).map((k) => `g:${k}`);
