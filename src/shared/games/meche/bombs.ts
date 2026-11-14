// Mèche à la boutique : ce qui saute au bout de la mèche. Chaque bombe a son allure sur la table, sa mèche, sa fin
// chez celui qui la tient et ses sons. Toute la table voit la bombe de celui qui allume la mèche, le temps de cette
// mèche ; les bots allument la dynamite. Tout s'achète avec les points gagnés en jouant, dans l'ordre qu'on veut.

export type BombId = "dynamite" | "ballon" | "neige" | "gateau" | "reveil" | "ruche" | "fusee" | "gaz";

export interface BombInfo {
  id: BombId;
  name: string;
  /** Ce qui se passe, en quelques mots */
  blurb: string;
  /** Ce qu'on lit en grand au milieu de la table quand elle saute */
  word: string;
  /** Son prix en points (0 : offerte à tous) */
  price: number;
}

export const BOMBS: BombInfo[] = [
  { id: "dynamite", name: "Dynamite", blurb: "Trois bâtons ficelés : boum, et de la suie pour qui la tient.", word: "BOUM !", price: 0 },
  {
    id: "ballon",
    name: "Ballon de baudruche",
    blurb: "Il gonfle à mesure que la mèche brûle, et éclate au nez de qui le tient.",
    word: "POP !",
    price: 60,
  },
  {
    id: "neige",
    name: "Boule de neige",
    blurb: "Elle grossit, grossit… et enferme qui la tient dans un bloc de glace.",
    word: "BRRR !",
    price: 120,
  },
  {
    id: "gateau",
    name: "Gâteau d'anniversaire",
    blurb: "Les bougies fondent au son de la boîte à musique, puis le gâteau finit en pleine figure.",
    word: "SPLATCH !",
    price: 200,
  },
  {
    id: "reveil",
    name: "Réveil",
    blurb: "Ses aiguilles tournent avec la mèche, puis il sonne à tout rompre sur la tête de qui le tient.",
    word: "DRIIING !",
    price: 300,
  },
  {
    id: "ruche",
    name: "Ruche",
    blurb: "Les abeilles sortent une à une, puis tout l'essaim fond sur qui la tient.",
    word: "BZZZ !",
    price: 450,
  },
  {
    id: "fusee",
    name: "Feu d'artifice",
    blurb: "La fusée crépite, file droit sur qui la tient et éclate en gerbes de couleurs.",
    word: "BADABOUM !",
    price: 650,
  },
  {
    id: "gaz",
    name: "Gaz toxique",
    blurb: "La bonbonne fuit, la jauge monte, puis un nuage vert enfle et engloutit qui la tient.",
    word: "KOF KOF !",
    price: 900,
  },
];

export const DEFAULT_BOMB: BombId = "dynamite";
export const BOMB_BY_ID = new Map(BOMBS.map((b) => [b.id, b]));
export const isBombId = (v: unknown): v is BombId => typeof v === "string" && BOMB_BY_ID.has(v as BombId);
export const bombInfo = (id: BombId | null | undefined): BombInfo => BOMB_BY_ID.get(id ?? DEFAULT_BOMB) ?? BOMBS[0]!;
