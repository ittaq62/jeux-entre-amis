// Ce qu'est un combat de Culbute : les combattants, ce qu'ils lancent, les objets tombés dans l'arène, ce qui se passe.
// Le monde est un plan vu de côté : x vers la droite, y vers le haut, en mètres. Le sol de l'arène est à y = 0.

/** Le pas du monde : le serveur et le téléphone calculent tous deux par soixantièmes de seconde */
export const FPS = 60;
export const DT = 1 / FPS;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const sign = (v: number) => (v < 0 ? -1 : 1);

/** Les six Habitués, qui sont aussi les six styles de combat (un avatar emprunte le style de l'un d'eux) */
export type HabitueId = "ginette" | "marcel" | "huguette" | "raymond" | "simone" | "lucien";
export const HABITUE_IDS: HabitueId[] = ["ginette", "marcel", "huguette", "raymond", "simone", "lucien"];
export const isHabitueId = (v: unknown): v is HabitueId => typeof v === "string" && (HABITUE_IDS as string[]).includes(v);

// Les boutons, en bits : ce qui est tenu, et ce qui vient d'être enfoncé
export const ATK = 1;
export const SPC = 2;
export const JMP = 4;
export const SHD = 8;
/** Saisir (une touche à part, ou la garde avec Frapper) */
export const GRB = 16;
/** Narguer : pour rire, sans effet sur le combat (on reste à découvert le temps de la pose) */
export const NAR = 32;
/** Le coup fort : l'attaque chargée de sa direction, tout de suite (tenir pour charger) ; en l'air, une attaque en l'air */
export const FRT = 64;
/**
 * Ce saut vient de la touche Haut (ou du stick poussé vers le haut), pas du bouton Saut : Haut et un coup enfoncés
 * ensemble font le coup vers le haut, au sol, au lieu de sauter
 */
export const UPJ = 128;

/** Ce que le joueur demande pendant un pas : le stick (de -1 à 1, y vers le haut) et ses boutons */
export interface Input {
  x: number;
  y: number;
  held: number;
  pressed: number;
}

export const NO_INPUT: Input = { x: 0, y: 0, held: 0, pressed: 0 };

export type FState =
  | "stand"
  | "squat"
  | "air"
  | "land"
  | "move"
  | "shield"
  | "shieldstun"
  | "dizzy"
  | "roll"
  | "dodge"
  | "airdodge"
  | "hurt"
  | "down"
  | "tech"
  | "helpless"
  | "ledge"
  | "caught"
  | "dead"
  | "respawn"
  | "out"
  /** Il en tient un autre (saisi) */
  | "holding"
  /** Il est tenu */
  | "held";

export const STATES: FState[] = [
  "stand",
  "squat",
  "air",
  "land",
  "move",
  "shield",
  "shieldstun",
  "dizzy",
  "roll",
  "dodge",
  "airdodge",
  "hurt",
  "down",
  "tech",
  "helpless",
  "ledge",
  "caught",
  "dead",
  "respawn",
  "out",
  "holding",
  "held",
];

/** Les objets qui tombent dans l'arène */
export type ItemKind = "tarte" | "petard" | "pot" | "baguette" | "gateau" | "cafe";
export const ITEM_KINDS: ItemKind[] = ["tarte", "petard", "pot", "baguette", "gateau", "cafe"];

export interface Fighter {
  slot: number;
  /** Le siège à la table */
  id: string;
  team: number;
  style: HabitueId;
  x: number;
  y: number;
  /** Sa propre vitesse (marche, saut, chute) */
  vx: number;
  vy: number;
  /** La vitesse que lui a donnée un coup : elle s'use toute seule */
  kx: number;
  ky: number;
  face: 1 | -1;
  /** La plateforme sous ses pieds, ou -1 en l'air */
  ground: number;
  state: FState;
  /** Les images passées dans cet état */
  t: number;
  /** L'attaque en cours (sa clé, voir moves.ts) et où on en est */
  move: string;
  mt: number;
  /** Les images de charge accumulées pour l'attaque en cours */
  charge: number;
  /** Les adversaires déjà touchés par l'attaque en cours, et à quelle image du coup (pour ceux qui touchent plusieurs fois) */
  hitIds: number[];
  hitAt: number[];
  /** Sauts en l'air restants ; esquive aérienne et spécial de côté déjà pris pendant ce saut */
  jumps: number;
  airdodged: boolean;
  /** Son saut en cours d'élan vient de la touche Haut (un coup pendant l'élan devient le coup vers le haut, au sol) */
  upJump: boolean;
  /** Son coup en cours a touché pour de bon (pas sur une garde) : sa fin s'annule dans le coup suivant */
  landed: boolean;
  sideUsed: boolean;
  fastfall: boolean;
  /** Il traverse les plateformes fines jusqu'à cette image (il descend exprès) */
  dropUntil: number;
  /** Les pourcents */
  dmg: number;
  stocks: number;
  /** Au temps : ses points (sorties infligées moins chutes) */
  score: number;
  shield: number;
  /** Arrêt sur image après un coup donné ou reçu */
  hitstop: number;
  /** Encore étourdi pendant tant d'images (après un coup) */
  stun: number;
  /** Intouchable jusqu'à cette image */
  intangUntil: number;
  /** Le dernier qui l'a touché, et quand : c'est à lui que revient la sortie */
  lastBy: number;
  lastAt: number;
  /** L'objet tenu, ou "" ; ses coups restants (la baguette) */
  item: ItemKind | "";
  itemUses: number;
  /** Le rebord qu'il tient (son index), ou -1 ; et l'image jusqu'à laquelle il ne peut pas en reprendre */
  ledge: number;
  ledgeLock: number;
  /** Il a touché le sol depuis sa dernière prise de rebord (sinon, pas d'invincibilité) */
  ledgeFresh: boolean;
  /** Ce qu'il a enfoncé récemment, gardé quelques images s'il ne pouvait pas encore agir */
  buf: number;
  bufT: number;
  /** Le stick à l'image d'avant (pour les coups de stick rapides) */
  px: number;
  py: number;
  /** Les boutons tenus à l'image d'avant */
  ph: number;
  /** Le café : plus vif jusqu'à cette image */
  fastUntil: number;
  /** La tarte en pleine figure : jusqu'à cette image */
  creamUntil: number;
  /** Combien d'images avant de revenir (sorti), ou avant de quitter son estrade (revenu) */
  wait: number;
  /** Éliminé : sa place finale */
  rank: number;
  /** Ce qu'il fait pendant le combat */
  stats: FighterStats;
  /** Le dernier coup reçu, en vitesse d'éjection (pour l'affichage) */
  lastKb: number;
  /** Celui qu'il tient (sa place), ou -1 ; celui qui le tient, ou -1 */
  holding: number;
  holder: number;
  /** Le saut vient de partir : tant d'images encore où le lâcher le raccourcit (0 : plus possible) */
  hopLeft: number;
  /** Le petit coup en cours est le combientième d'une série (le troisième repousse, et la série s'arrête là) */
  jabs: number;
  /** Ses derniers coups qui ont touché, du plus récent au plus ancien : un coup répété s'use */
  stale: string[];
  /** L'essoufflement : ses coups au sol d'affilée qui n'ont touché personne (et ses tirs), sans bouger entre deux ;
   * marcher, sauter, rouler, souffler un instant ou toucher quelqu'un le remet à zéro. Le chemin fait à pied depuis */
  puff: number;
  walked: number;
  /** Le coup en cours est parti avec de l'élan (en courant, en l'air) : il frappe plus fort et pousse plus loin que le
   * même coup donné sans bouger */
  elan: number;
}

export interface FighterStats {
  kos: number;
  falls: number;
  /** Les pourcents infligés, et reçus */
  dealt: number;
  taken: number;
  items: number;
  /** Le plus petit pourcentage auquel il a sorti quelqu'un (999 : jamais) */
  lowKo: number;
  /** Ses sorties « propres » sans perdre de vie depuis le début */
  bestStreak: number;
}

export interface Projectile {
  id: number;
  kind: string;
  owner: number;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** La pesanteur qui le tire vers le bas (m/s²) */
  g: number;
  /** Les images qu'il lui reste */
  life: number;
  r: number;
  dmg: number;
  ang: number;
  kb: number;
  kbg: number;
  /** Rebonds qu'il lui reste (sol) */
  bounce: number;
  /** Il traverse ceux qu'il touche */
  pierce: boolean;
  /** Il ne touche rien (souffle : il pousse seulement) */
  push: number;
  /** Il roule sur le sol */
  rolls: boolean;
  /** Ceux qu'il a déjà touchés */
  hits: number[];
  /** Il revient vers celui qui l'a lancé (la chaise) à partir de cette image de vie */
  back: number;
  /** Il ramène celui qu'il touche vers son lanceur (le lasso) */
  pull: boolean;
  /** Au sol, il devient un piège (le tricot) */
  trap: boolean;
  /** Il explose à la fin, ou dès qu'il touche (le pétard) */
  boom: boolean;
  t: number;
}

export interface FieldItem {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ground: boolean;
  /** Les images avant qu'il disparaisse */
  life: number;
}

/** Un piège posé au sol (le tricot de Huguette) */
export interface Trap {
  id: number;
  owner: number;
  team: number;
  x: number;
  y: number;
  /** La plateforme qui le porte */
  on: number;
  life: number;
}

export type FightPhase = "intro" | "fight" | "over";

export type FightEvent =
  | {
      k: "hit";
      a: number;
      v: number;
      dmg: number;
      x: number;
      y: number;
      power: number;
      kind: "hit" | "shield" | "counter" | "push" | "parry";
      /** Ce coup va le faire sortir de l'arène (l'écran s'en approche) */
      ko?: boolean;
      /** Il était encore étourdi par le coup d'avant du même attaquant : un enchaînement */
      chain?: boolean;
      /** Un coup donné avec de l'élan (en courant, en l'air) : il frappe plus fort */
      elan?: boolean;
    }
  | { k: "ko"; v: number; by: number; x: number; y: number; side: "left" | "right" | "top" | "bottom" }
  | { k: "back"; v: number }
  | { k: "out"; v: number; rank: number }
  | { k: "item"; id: number; kind: ItemKind; x: number; y: number }
  | { k: "pick"; v: number; kind: ItemKind }
  | { k: "boom"; x: number; y: number; r: number }
  | { k: "throw"; v: number; kind: string }
  | { k: "break"; v: number }
  | { k: "trap"; v: number }
  | { k: "grab"; a: number; v: number }
  | { k: "go" }
  | { k: "end" };

export interface FightSettings {
  mode: "vies" | "temps" | "subite";
  stocks: number;
  minutes: number;
  items: "aucun" | "peu" | "beaucoup";
  teams: boolean;
  friendlyFire: boolean;
  /** Sur la lune : la pesanteur fond, on saute plus haut et on retombe lentement */
  lune: boolean;
}

export interface Fight {
  settings: FightSettings;
  arena: string;
  /** L'arène est agrandie quand on est nombreux */
  scale: number;
  frame: number;
  phase: FightPhase;
  /** Images avant le top départ (intro), ou avant la fin (over) */
  clock: number;
  /** La durée maximale du combat, en images (au temps : la durée choisie) */
  limit: number;
  fighters: Fighter[];
  projectiles: Projectile[];
  items: FieldItem[];
  traps: Trap[];
  nextId: number;
  /** Le prochain objet tombera à cette image */
  itemAt: number;
  rng: number;
  /** Ceux qui ont gagné (leurs places), une fois le combat fini */
  winners: number[];
  /** Places déjà données (vies) */
  outCount: number;
}
