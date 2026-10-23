export type Color = "red" | "yellow" | "green" | "blue";
export const COLORS: readonly Color[] = ["red", "yellow", "green", "blue"];

export const COLOR_LABELS: Record<Color, string> = {
  red: "Rouge",
  yellow: "Jaune",
  green: "Vert",
  blue: "Bleu",
};

export type CardKind =
  // Classique
  | "number"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4"
  // No Mercy
  | "draw4"
  | "skipAll"
  | "discardAll"
  | "wildReverse4"
  | "wild6"
  | "wild10"
  | "wildRoulette";

export interface Card {
  id: number;
  kind: CardKind;
  /** null pour les jokers */
  color: Color | null;
  /** 0 a 9 pour les cartes chiffre */
  value?: number;
}

export function isWild(card: Card): boolean {
  return card.color === null;
}

/** Nombre de cartes que la carte fait piocher (0 si ce n'est pas une carte « + »). */
export function drawValue(card: Card): number {
  switch (card.kind) {
    case "draw2":
      return 2;
    case "wild4":
    case "draw4":
    case "wildReverse4":
      return 4;
    case "wild6":
      return 6;
    case "wild10":
      return 10;
    default:
      return 0;
  }
}

export function isDrawCard(card: Card): boolean {
  return drawValue(card) > 0;
}

/** Valeur en points d'une carte restee en main a la fin d'une manche. */
export function cardPoints(card: Card): number {
  switch (card.kind) {
    case "number":
      return card.value ?? 0;
    case "skip":
    case "reverse":
    case "draw2":
    case "draw4":
    case "skipAll":
    case "discardAll":
      return 20;
    case "wild":
    case "wild4":
    case "wildReverse4":
    case "wild6":
    case "wild10":
    case "wildRoulette":
      return 50;
  }
}

/** Deux cartes identiques au sens de l'interception (meme couleur, meme type, meme chiffre). */
export function sameFace(a: Card, b: Card): boolean {
  return a.kind === b.kind && a.color === b.color && a.value === b.value;
}

export function cardLabel(card: Card): string {
  const color = card.color ? ` ${COLOR_LABELS[card.color].toLowerCase()}` : "";
  switch (card.kind) {
    case "number":
      return `${card.value}${color}`;
    case "skip":
      return `Passe ton tour${color}`;
    case "reverse":
      return `Inversion${color}`;
    case "draw2":
      return `+2${color}`;
    case "draw4":
      return `+4${color}`;
    case "skipAll":
      return `Passe pour tous${color}`;
    case "discardAll":
      return `Défausse tout${color}`;
    case "wild":
      return "Joker";
    case "wild4":
      return "Joker +4";
    case "wildReverse4":
      return "Joker inversion +4";
    case "wild6":
      return "Joker +6";
    case "wild10":
      return "Joker +10";
    case "wildRoulette":
      return "Joker roulette";
  }
}

/** Jeu classique de 108 cartes. */
export function buildClassicDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const color of COLORS) {
    cards.push({ id: id++, kind: "number", color, value: 0 });
    for (let value = 1; value <= 9; value++) {
      cards.push({ id: id++, kind: "number", color, value });
      cards.push({ id: id++, kind: "number", color, value });
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      cards.push({ id: id++, kind, color });
      cards.push({ id: id++, kind, color });
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push({ id: id++, kind: "wild", color: null });
    cards.push({ id: id++, kind: "wild4", color: null });
  }
  return cards;
}
