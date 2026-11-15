// Les six styles de combat, un par Habitué : comment chacun court, saute et tombe, et ses quinze coups. Les coups
// appartiennent au style, pas au dessin : un avatar qui emprunte le style de Ginette se bat avec son sac à main.

import { ATK, SPC, type HabitueId } from "./model.ts";
import { CHARGE_DECIDE, h, type MoveDef, type MoveSlot } from "./moves.ts";

export interface Style {
  id: HabitueId;
  /** « le sac à main » : ce qu'on lit à côté du nom */
  prop: string;
  /** En deux mots, pour le choix du combattant */
  kind: string;
  blurb: string;
  /** Plus il est lourd, moins il vole loin (100 : la moyenne) */
  weight: number;
  walk: number;
  run: number;
  /** La vitesse en l'air, et comment il l'atteint */
  air: number;
  airAcc: number;
  gravity: number;
  fall: number;
  fastFall: number;
  jump: number;
  short: number;
  airJump: number;
  /** Les sauts en l'air */
  jumps: number;
  /** Sa silhouette : largeur et hauteur */
  w: number;
  hgt: number;
  moves: Record<MoveSlot, MoveDef>;
}

const C = CHARGE_DECIDE;

/** Ce que chaque style a en commun pour ses attaques chargées : la charge commence juste après la décision */
const charged = (at = C + 2) => ({ at, max: 60, button: ATK });

const GINETTE: Style = {
  id: "ginette",
  prop: "le sac à main",
  kind: "Équilibrée",
  blurb: "Un coup de sac pour chaque occasion, et ce qu'elle trouve au fond de son sac.",
  weight: 100,
  walk: 3.5,
  run: 7.2,
  air: 5.2,
  airAcc: 32,
  gravity: 50,
  fall: 15.5,
  fastFall: 23,
  jump: 16.5,
  short: 11,
  airJump: 15,
  jumps: 1,
  w: 0.8,
  hgt: 1.55,
  moves: {
    n: { name: "Petit coup de sac", frames: 18, pose: "jab", hits: [h(5, 6, 0.85, 0.85, 0.5, 3.5, 45, 3.5, 4)] },
    s: { name: "Coup de sac", frames: 28, pose: "side", hits: [h(C, C + 2, 1.15, 0.9, 0.55, 9, 38, 6, 18)] },
    u: { name: "Sac au ciel", frames: 27, pose: "up", hits: [h(C, C + 4, 0.35, 1.75, 0.6, 8, 92, 6, 14)] },
    d: { name: "Balayette", frames: 22, pose: "low", hits: [h(C, C + 1, 0.95, 0.25, 0.45, 6.5, 22, 5, 11)] },
    an: { name: "Tourniquet", frames: 30, pose: "spin", landLag: 8, hits: [h(6, 16, 0, 0.85, 0.85, 7, 45, 5, 10)] },
    as: { name: "Sac en avant", frames: 36, pose: "airFwd", landLag: 12, hits: [h(10, 13, 1.0, 0.8, 0.6, 11, 40, 7, 16)] },
    au: { name: "Sac par-dessus", frames: 30, pose: "airUp", landLag: 8, hits: [h(8, 12, 0.2, 1.8, 0.6, 9, 86, 6, 13)] },
    ad: { name: "Sac plongeant", frames: 40, pose: "airDown", landLag: 16, hits: [h(12, 15, 0.1, -0.1, 0.55, 12, -75, 7, 11)] },
    cs: { name: "Le grand revers", frames: 48, pose: "smashSide", charge: charged(), hits: [h(15, 17, 1.25, 0.9, 0.7, 16, 38, 9, 30)] },
    cu: { name: "Sac en l'air", frames: 46, pose: "smashUp", charge: charged(), hits: [h(14, 19, 0, 2.0, 0.75, 15, 90, 9, 28)] },
    cd: {
      name: "Moulinet",
      frames: 46,
      pose: "smashDown",
      charge: charged(),
      hits: [h(14, 15, 1.0, 0.3, 0.55, 14, 28, 9, 25, { both: true })],
    },
    pn: { name: "Fouille dans le sac", frames: 32, pose: "throw", hits: [], special: "rummage", shoot: { at: 14, kind: "rummage" } },
    ps: {
      name: "Sac tournoyant",
      frames: 36,
      pose: "lunge",
      drift: 0,
      gravity: 0.4,
      push: [{ from: 6, to: 18, vx: 9 }],
      hits: [h(8, 16, 0.9, 0.9, 0.65, 2.5, 60, 3, 2, { rehit: 4 }), h(18, 19, 1.0, 0.9, 0.7, 6, 40, 7, 13)],
    },
    pu: {
      name: "Hélice de sac",
      frames: 40,
      pose: "rise",
      helpless: true,
      grab: 14,
      drift: 0.8,
      push: [{ from: 5, to: 22, vy: 12.5 }],
      hits: [h(5, 22, 0, 1.3, 0.8, 2, 85, 3, 2, { rehit: 4 }), h(23, 24, 0, 1.6, 0.85, 5, 80, 7, 10)],
    },
    pd: { name: "Le grand coup de sac", frames: 56, pose: "slam", hits: [h(26, 28, 1.05, 0.6, 0.85, 20, 42, 10, 30)] },
  },
};

const MARCEL: Style = {
  id: "marcel",
  prop: "la chaise pliante",
  kind: "Lourd",
  blurb: "Lent, mais chaque coup de chaise compte. Et il ne s'envole pas facilement.",
  weight: 125,
  walk: 2.8,
  run: 5.7,
  air: 4.4,
  airAcc: 24,
  gravity: 56,
  fall: 17,
  fastFall: 25,
  jump: 15.5,
  short: 10,
  airJump: 13.5,
  jumps: 1,
  w: 0.95,
  hgt: 1.6,
  moves: {
    n: { name: "Pied de chaise", frames: 22, pose: "jab", hits: [h(6, 7, 0.95, 0.8, 0.5, 5, 50, 4, 5)] },
    s: { name: "Chaise en avant", frames: 32, pose: "side", hits: [h(C + 2, C + 4, 1.3, 0.8, 0.65, 12, 35, 7, 18)] },
    u: { name: "Le dossier", frames: 32, pose: "up", hits: [h(C + 2, C + 6, 0.3, 1.9, 0.7, 11, 88, 7, 14)] },
    d: { name: "Raclée de pieds", frames: 26, pose: "low", hits: [h(C + 2, C + 3, 1.1, 0.25, 0.55, 9, 22, 6, 11)] },
    an: { name: "Chaise dépliée", frames: 36, pose: "spin", landLag: 12, hits: [h(8, 14, 0, 0.8, 0.95, 11, 45, 6, 12)] },
    as: { name: "Chaise lancée en avant", frames: 42, pose: "airFwd", landLag: 16, hits: [h(12, 15, 1.1, 0.6, 0.7, 14, 35, 8, 16)] },
    au: { name: "Chaise au plafond", frames: 36, pose: "airUp", landLag: 12, hits: [h(10, 14, 0, 1.9, 0.75, 12, 85, 7, 14)] },
    ad: { name: "Assis !", frames: 46, pose: "airDown", landLag: 20, hits: [h(14, 18, 0, -0.1, 0.65, 15, -80, 8, 12)] },
    cs: {
      name: "Le coup de chaise",
      frames: 56,
      pose: "smashSide",
      charge: charged(C + 3),
      hits: [h(19, 21, 1.4, 0.9, 0.8, 21, 36, 10, 31)],
      armor: [C + 3, 18],
    },
    cu: {
      name: "La chaise en l'air",
      frames: 54,
      pose: "smashUp",
      charge: charged(C + 3),
      hits: [h(18, 22, 0, 2.1, 0.85, 19, 90, 10, 29)],
    },
    cd: {
      name: "Chaise au sol",
      frames: 54,
      pose: "smashDown",
      charge: charged(C + 3),
      hits: [h(18, 19, 1.3, 0.25, 0.65, 18, 30, 10, 26, { both: true })],
    },
    pn: { name: "Le lancer de chaise", frames: 40, pose: "throw", hits: [], shoot: { at: 15, kind: "chaise" }, oneShot: "chaise" },
    ps: {
      name: "La charge du dimanche",
      frames: 44,
      pose: "lunge",
      drift: 0,
      gravity: 0.5,
      armor: [10, 24],
      push: [{ from: 10, to: 24, vx: 10.5 }],
      hits: [h(10, 24, 0.9, 0.8, 0.65, 13, 40, 8, 15)],
    },
    pu: {
      name: "Le tremplin",
      frames: 40,
      pose: "rise",
      helpless: true,
      grab: 16,
      drift: 0.7,
      push: [{ from: 10, to: 11, vy: 19.5 }],
      hits: [h(10, 14, 0, 1.2, 0.7, 8, 85, 6, 9)],
    },
    pd: {
      name: "Assis ! (au sol)",
      frames: 44,
      pose: "stomp",
      special: "stomp",
      hits: [h(12, 14, 1.1, 0.3, 0.7, 13, 70, 8, 13, { both: true })],
    },
  },
};

const HUGUETTE: Style = {
  id: "huguette",
  prop: "le tricot",
  kind: "Légère et vive",
  blurb: "Quatre-vingt-sept ans, trois sauts, des aiguilles qui piquent et de la laine pour tout attraper.",
  weight: 78,
  walk: 4,
  run: 8.6,
  air: 6,
  airAcc: 40,
  gravity: 46,
  fall: 14,
  fastFall: 21,
  jump: 17,
  short: 11.5,
  airJump: 15.5,
  jumps: 2,
  w: 0.7,
  hgt: 1.4,
  moves: {
    n: { name: "Pique d'aiguille", frames: 14, pose: "jab", hits: [h(4, 5, 0.85, 0.75, 0.42, 3, 40, 3, 3)] },
    s: { name: "Double aiguille", frames: 24, pose: "side", hits: [h(C, C + 2, 1.1, 0.75, 0.45, 7, 35, 5, 15)] },
    u: { name: "Aiguilles au ciel", frames: 22, pose: "up", hits: [h(C, C + 3, 0.2, 1.6, 0.5, 6, 95, 5, 12)] },
    d: { name: "Croche-pied", frames: 18, pose: "low", hits: [h(C, C + 1, 0.9, 0.2, 0.42, 5, 15, 4, 10)] },
    an: { name: "Pelote tournante", frames: 26, pose: "spin", landLag: 6, hits: [h(5, 14, 0, 0.75, 0.75, 6, 50, 4, 10)] },
    as: { name: "Aiguille en avant", frames: 28, pose: "airFwd", landLag: 8, hits: [h(7, 10, 0.95, 0.7, 0.5, 8, 40, 6, 14)] },
    au: { name: "Aiguilles en l'air", frames: 24, pose: "airUp", landLag: 6, hits: [h(6, 9, 0, 1.6, 0.55, 7, 85, 5, 12)] },
    ad: { name: "Aiguilles plantées", frames: 34, pose: "airDown", landLag: 12, hits: [h(10, 14, 0, -0.1, 0.45, 9, -70, 5, 10)] },
    cs: { name: "Le coup du rang", frames: 40, pose: "smashSide", charge: charged(), hits: [h(13, 15, 1.25, 0.75, 0.55, 13, 38, 8, 27)] },
    cu: { name: "Le tricot volant", frames: 40, pose: "smashUp", charge: charged(), hits: [h(12, 16, 0, 1.8, 0.6, 12, 90, 8, 26)] },
    cd: {
      name: "Maille à l'endroit",
      frames: 40,
      pose: "smashDown",
      charge: charged(),
      hits: [h(12, 13, 0.95, 0.2, 0.5, 11, 25, 8, 23, { both: true })],
    },
    pn: { name: "La pelote", frames: 30, pose: "throw", hits: [], shoot: { at: 12, kind: "pelote" } },
    ps: { name: "Le lasso de laine", frames: 40, pose: "cast", hits: [], drift: 0.3, gravity: 0.5, shoot: { at: 10, kind: "lasso" } },
    pu: {
      name: "Le fil d'Ariane",
      frames: 36,
      pose: "cast",
      hits: [h(8, 10, 1.2, 2.2, 0.5, 4, 80, 5, 4)],
      helpless: true,
      special: "grapple",
    },
    pd: { name: "Le piège en tricot", frames: 30, pose: "pickup", hits: [], special: "trap", oneShot: "trap" },
  },
};

const RAYMOND: Style = {
  id: "raymond",
  prop: "les boules de pétanque",
  kind: "À distance",
  blurb: "Il pointe, il tire, il ne rate jamais le carreau : de loin, Raymond fait mal.",
  weight: 108,
  walk: 3,
  run: 6.2,
  air: 4.8,
  airAcc: 28,
  gravity: 52,
  fall: 16,
  fastFall: 24,
  jump: 16,
  short: 10.5,
  airJump: 14.5,
  jumps: 1,
  w: 0.85,
  hgt: 1.55,
  moves: {
    n: { name: "Coup de coude", frames: 20, pose: "jab", hits: [h(6, 7, 0.8, 0.95, 0.45, 4, 45, 4, 4)] },
    s: { name: "Boule en main", frames: 28, pose: "side", hits: [h(C + 1, C + 3, 1.1, 0.8, 0.55, 10, 38, 6, 17)] },
    u: { name: "Boule levée", frames: 28, pose: "up", hits: [h(C + 1, C + 5, 0.2, 1.8, 0.55, 9, 90, 6, 13)] },
    d: { name: "Pied de pointeur", frames: 26, pose: "low", hits: [h(C + 1, C + 2, 1.1, 0.2, 0.5, 8, 20, 5, 11)] },
    an: { name: "Toupie", frames: 32, pose: "spin", landLag: 10, hits: [h(7, 14, 0, 0.8, 0.8, 9, 45, 5, 11)] },
    as: { name: "Boule en avant", frames: 38, pose: "airFwd", landLag: 14, hits: [h(10, 13, 1.0, 0.7, 0.6, 12, 38, 7, 16)] },
    au: { name: "Boule au ciel", frames: 32, pose: "airUp", landLag: 10, hits: [h(9, 12, 0, 1.8, 0.6, 10, 85, 6, 13)] },
    ad: { name: "Le carreau", frames: 42, pose: "airDown", landLag: 18, hits: [h(13, 16, 0, -0.15, 0.55, 13, -80, 7, 11)] },
    cs: { name: "Le tir au fer", frames: 50, pose: "smashSide", charge: charged(), hits: [h(16, 18, 1.3, 0.85, 0.7, 18, 37, 10, 29)] },
    cu: { name: "Boule en chandelle", frames: 48, pose: "smashUp", charge: charged(), hits: [h(15, 19, 0, 2.0, 0.75, 16, 90, 9, 27)] },
    cd: {
      name: "La boule écrasée",
      frames: 48,
      pose: "smashDown",
      charge: charged(),
      hits: [h(15, 16, 1.1, 0.25, 0.6, 15, 28, 9, 25, { both: true })],
    },
    pn: { name: "Pointer", frames: 34, pose: "lob", hits: [], charge: { at: 8, max: 45, button: SPC }, shoot: { at: 14, kind: "boule" } },
    ps: { name: "Tirer", frames: 36, pose: "throw", hits: [], drift: 0.4, shoot: { at: 12, kind: "tir" } },
    pu: {
      name: "Le saut du champion",
      frames: 38,
      pose: "rise",
      helpless: true,
      grab: 12,
      drift: 0.8,
      push: [{ from: 6, to: 7, vy: 18.5 }],
      hits: [h(6, 12, 0.3, 1.5, 0.6, 10, 80, 7, 10)],
    },
    pd: { name: "La boule roulée", frames: 32, pose: "lob", hits: [], shoot: { at: 13, kind: "roulee" } },
  },
};

const SIMONE: Style = {
  id: "simone",
  prop: "l'éventail",
  kind: "Acrobate",
  blurb: "Elle ne parle pas. Elle danse, elle souffle, elle pare, et trois sauts la ramènent toujours.",
  weight: 84,
  walk: 3.8,
  run: 7.8,
  air: 5.8,
  airAcc: 38,
  gravity: 44,
  fall: 13.5,
  fastFall: 20,
  jump: 16.5,
  short: 11,
  airJump: 15,
  jumps: 2,
  w: 0.72,
  hgt: 1.5,
  moves: {
    n: { name: "Coup d'éventail", frames: 16, pose: "jab", hits: [h(5, 6, 0.85, 0.9, 0.45, 3, 50, 3, 4)] },
    s: { name: "Éventail tranchant", frames: 24, pose: "side", hits: [h(C, C + 2, 1.15, 0.85, 0.5, 8, 40, 6, 16)] },
    u: { name: "Bourrasque", frames: 24, pose: "up", hits: [h(C, C + 4, 0, 1.7, 0.65, 7, 95, 6, 12)] },
    d: { name: "Révérence", frames: 20, pose: "low", hits: [h(C, C + 1, 1.0, 0.2, 0.45, 6, 25, 5, 10)] },
    an: { name: "Pirouette", frames: 28, pose: "spin", landLag: 6, hits: [h(5, 15, 0, 0.85, 0.8, 6, 50, 5, 10)] },
    as: { name: "Éventail en avant", frames: 30, pose: "airFwd", landLag: 8, hits: [h(8, 11, 1.0, 0.85, 0.55, 9, 40, 6, 15)] },
    au: { name: "Éventail au ciel", frames: 26, pose: "airUp", landLag: 6, hits: [h(7, 10, 0, 1.7, 0.6, 8, 88, 5, 13)] },
    ad: { name: "Plongeon", frames: 34, pose: "airDown", landLag: 12, hits: [h(10, 14, 0, -0.1, 0.5, 10, -70, 6, 10)] },
    cs: { name: "Grand éventail", frames: 42, pose: "smashSide", charge: charged(), hits: [h(13, 15, 1.3, 0.85, 0.6, 14, 40, 8, 28)] },
    cu: { name: "Tornade", frames: 42, pose: "smashUp", charge: charged(), hits: [h(12, 17, 0, 1.9, 0.7, 13, 90, 8, 27)] },
    cd: {
      name: "Éventail rasant",
      frames: 42,
      pose: "smashDown",
      charge: charged(),
      hits: [h(12, 13, 1.0, 0.25, 0.5, 12, 25, 8, 24, { both: true })],
    },
    pn: { name: "Coup de vent", frames: 34, pose: "blow", hits: [], shoot: { at: 12, kind: "souffle" } },
    ps: {
      name: "Pas de danse",
      frames: 32,
      pose: "lunge",
      drift: 0,
      gravity: 0.2,
      intang: [6, 12],
      push: [{ from: 6, to: 13, vx: 17 }],
      hits: [h(6, 14, 0.6, 0.9, 0.6, 8, 45, 6, 12)],
    },
    pu: {
      name: "Tourbillon",
      frames: 40,
      pose: "rise",
      helpless: true,
      grab: 12,
      drift: 0.9,
      push: [{ from: 5, to: 20, vy: 13 }],
      hits: [h(5, 18, 0, 1.0, 0.75, 2, 85, 3, 2, { rehit: 4 }), h(19, 20, 0, 1.4, 0.8, 5, 80, 7, 10)],
    },
    pd: { name: "Sans un mot", frames: 40, pose: "counter", hits: [], counter: [5, 25] },
  },
};

const LUCIEN: Style = {
  id: "lucien",
  prop: "l'accordéon",
  kind: "Grande allonge",
  blurb: "Son accordéon se déplie jusqu'à l'autre bout de l'estrade, et un coup de soufflet le remonte au ciel.",
  weight: 96,
  walk: 3.3,
  run: 6.8,
  air: 5,
  airAcc: 30,
  gravity: 49,
  fall: 15,
  fastFall: 22.5,
  jump: 16,
  short: 10.5,
  airJump: 14.5,
  jumps: 1,
  w: 0.82,
  hgt: 1.55,
  moves: {
    n: { name: "Couac", frames: 18, pose: "jab", hits: [h(5, 6, 0.85, 0.9, 0.5, 3.5, 45, 3.5, 4)] },
    s: {
      name: "Soufflet tendu",
      frames: 30,
      pose: "side",
      hits: [h(C + 2, C + 4, 1.0, 0.9, 0.45, 9, 35, 6, 16), h(C + 2, C + 4, 1.8, 0.9, 0.45, 9, 35, 6, 16)],
    },
    u: { name: "Accord en l'air", frames: 26, pose: "up", hits: [h(C + 1, C + 5, 0.1, 1.8, 0.6, 8, 90, 6, 13)] },
    d: { name: "Note basse", frames: 24, pose: "low", hits: [h(C + 1, C + 2, 1.2, 0.25, 0.45, 7, 20, 5, 10)] },
    an: { name: "La valse", frames: 30, pose: "spin", landLag: 8, hits: [h(6, 16, 0, 0.85, 0.8, 7, 45, 5, 10)] },
    as: {
      name: "Soufflet en avant",
      frames: 34,
      pose: "airFwd",
      landLag: 12,
      hits: [h(10, 13, 1.0, 0.85, 0.45, 10, 40, 7, 14), h(10, 13, 1.7, 0.85, 0.45, 10, 40, 7, 14)],
    },
    au: { name: "Accordéon au ciel", frames: 30, pose: "airUp", landLag: 8, hits: [h(8, 12, 0, 1.8, 0.6, 9, 86, 6, 13)] },
    ad: { name: "Accordéon plongeant", frames: 38, pose: "airDown", landLag: 14, hits: [h(12, 15, 0, -0.15, 0.55, 11, -75, 6, 11)] },
    cs: {
      name: "Le grand accord",
      frames: 48,
      pose: "smashSide",
      charge: charged(),
      hits: [h(16, 18, 1.1, 0.9, 0.55, 16, 37, 9, 29), h(16, 18, 2.0, 0.9, 0.55, 16, 37, 9, 29)],
    },
    cu: { name: "Fanfare", frames: 46, pose: "smashUp", charge: charged(), hits: [h(15, 19, 0, 2.0, 0.75, 15, 90, 9, 27)] },
    cd: {
      name: "Les deux soufflets",
      frames: 46,
      pose: "smashDown",
      charge: charged(),
      hits: [h(15, 16, 1.1, 0.25, 0.55, 14, 28, 9, 25, { both: true })],
    },
    pn: { name: "La note", frames: 32, pose: "blow", hits: [], shoot: { at: 12, kind: "note" } },
    ps: {
      name: "Le soufflet",
      frames: 40,
      pose: "side",
      drift: 0.3,
      gravity: 0.6,
      hits: [h(12, 14, 1.6, 0.9, 0.42, 7, 40, 6, 10), h(12, 14, 2.6, 0.9, 0.55, 11, 40, 7, 14)],
    },
    pu: {
      name: "Coup de soufflet",
      frames: 40,
      pose: "rise",
      helpless: true,
      grab: 14,
      drift: 0.7,
      push: [{ from: 10, to: 11, vy: 21 }],
      hits: [h(10, 13, 0, -0.3, 0.8, 4, -90, 5, 5)],
    },
    pd: { name: "La fausse note", frames: 44, pose: "slam", hits: [h(14, 17, 0, 0.8, 1.3, 6, 80, 7, 7)] },
  },
};

export const STYLES: Record<HabitueId, Style> = {
  ginette: GINETTE,
  marcel: MARCEL,
  huguette: HUGUETTE,
  raymond: RAYMOND,
  simone: SIMONE,
  lucien: LUCIEN,
};
