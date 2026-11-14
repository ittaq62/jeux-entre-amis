// UNO en équipe : où et comment poser la main de chaque coéquipier, face visible, en haut de l'écran.
//
// Les mains ont leur place à elles, hors du tapis, centrées sur l'axe de la table : sur une ligne juste sous la barre
// du haut, qui pousse la table vers le bas au lieu de passer par-dessus. Seul un écran bas (téléphone en paysage) les
// garde dans la barre du haut, au milieu, quand elles y tiennent sans toucher le titre ni les boutons.

/** Écart entre deux cartes, en part de la largeur d'une carte : le médaillon se voit presque en entier… */
export const PARTNER_STEP_MAX = 0.82;
/** …et jamais moins que ce qui laisse lire le chiffre du coin */
export const PARTNER_STEP_MIN = 0.36;
/** Une rangée de cartes recouvre la moitié de celle du dessus : les coins restent lisibles */
export const PARTNER_ROW_SHIFT = 0.5;
export const CARD_RATIO = 1.4;

export interface PartnerLayoutInput {
  /** Nombre de cartes de chaque coéquipier */
  counts: number[];
  /** Largeur d'une carte */
  card: number;
  /** Plus petite largeur de carte permise quand la place manque (par défaut, pas de réduction) */
  minCard?: number;
  /** Place libre au milieu de la barre du haut, autant de chaque côté de l'axe, entre le titre et les boutons */
  inlineRoom: number;
  /** Largeur d'une ligne entière sous la barre */
  rowRoom: number;
  /** Ce que prend chaque main en plus de ses cartes : le nom, le cadre */
  chrome: number;
  /** Écart entre deux mains */
  gap: number;
  /** Écran bas (téléphone en paysage) : les mains restent dans la barre du haut tant qu'elles y tiennent, même serrées */
  short: boolean;
  /** Écran en hauteur (téléphone tenu droit) : plutôt une main par ligne que des cartes serrées */
  tall?: boolean;
}

export interface PartnerHandLayout {
  /** Écart entre deux cartes d'une rangée */
  step: number;
  rows: number;
  perRow: number;
  /** Largeur des cartes posées */
  width: number;
  height: number;
}

export interface PartnerLayout {
  /** Dans la barre du haut (sinon sur une ligne à part, dessous) */
  inline: boolean;
  /** Une main par ligne (sinon côte à côte) */
  stacked: boolean;
  /** Largeur des cartes retenue : celle demandée, ou un peu moins pour que les mains tiennent côte à côte */
  card: number;
  hands: PartnerHandLayout[];
}

const handWidth = (n: number, card: number, step: number) => (n === 0 ? 0 : card + (n - 1) * step);

function single(n: number, card: number, step: number): PartnerHandLayout {
  return { step, rows: 1, perRow: Math.max(1, n), width: handWidth(n, card, step), height: n === 0 ? 0 : card * CARD_RATIO };
}

/** Largeur totale des mains côte à côte avec un même écart */
function total(counts: number[], card: number, step: number, chrome: number, gap: number): number {
  return counts.reduce((sum, n) => sum + chrome + handWidth(n, card, step), 0) + gap * Math.max(0, counts.length - 1);
}

/** L'écart commun qui remplit `room` au mieux, entre le minimum et le maximum */
function fitStep(counts: number[], card: number, room: number, chrome: number, gap: number): number {
  const gaps = counts.reduce((sum, n) => sum + Math.max(0, n - 1), 0);
  const max = card * PARTNER_STEP_MAX;
  if (gaps === 0) return max;
  const fixed = counts.reduce((sum, n) => sum + chrome + (n > 0 ? card : 0), 0) + gap * Math.max(0, counts.length - 1);
  return Math.max(card * PARTNER_STEP_MIN, Math.min(max, (room - fixed) / gaps));
}

/** Une main seule sur sa ligne : plusieurs rangées si elle est trop longue */
function alone(n: number, card: number, room: number): PartnerHandLayout {
  const space = Math.max(card, room);
  const min = card * PARTNER_STEP_MIN;
  if (handWidth(n, card, min) <= space) return single(n, card, Math.min(card * PARTNER_STEP_MAX, n > 1 ? (space - card) / (n - 1) : 0));
  const perRow = Math.max(1, Math.floor((space - card) / min) + 1);
  const rows = Math.ceil(n / perRow);
  const step = perRow > 1 ? Math.min(card * PARTNER_STEP_MAX, (space - card) / (perRow - 1)) : 0;
  return {
    step,
    rows,
    perRow,
    width: handWidth(Math.min(n, perRow), card, step),
    height: card * CARD_RATIO * (1 + (rows - 1) * PARTNER_ROW_SHIFT),
  };
}

/** La plus grande carte (jusqu'à `card`) qui laisse toutes les mains tenir côte à côte dans `room`, serrées au plus */
function shrinkToFit(counts: number[], card: number, room: number, chrome: number, gap: number): number {
  const units = counts.reduce((sum, n) => sum + (n > 0 ? 1 + (n - 1) * PARTNER_STEP_MIN : 0), 0);
  if (units === 0) return card;
  return Math.min(card, Math.floor((room - counts.length * chrome - gap * Math.max(0, counts.length - 1)) / units));
}

function sideBySide(counts: number[], card: number, room: number, chrome: number, gap: number, inline: boolean): PartnerLayout {
  const step = fitStep(counts, card, room, chrome, gap);
  return { inline, stacked: false, card, hands: counts.map((n) => single(n, card, step)) };
}

export function layoutPartners(o: PartnerLayoutInput): PartnerLayout {
  const { counts, card, chrome, gap } = o;
  const minCard = Math.min(card, o.minCard ?? card);
  const max = card * PARTNER_STEP_MAX;
  const min = card * PARTNER_STEP_MIN;
  // Écran bas : dans la barre du haut, au milieu, plutôt que de manger la hauteur de la table ; les cartes rapetissent
  // un peu s'il le faut
  if (o.short) {
    const c = shrinkToFit(counts, card, o.inlineRoom, chrome, gap);
    if (c >= minCard) return sideBySide(counts, c, o.inlineRoom, chrome, gap, true);
  }
  // Sur une ligne à elles, côte à côte (en hauteur, seulement si les cartes n'y sont pas serrées)
  if (total(counts, card, min, chrome, gap) <= o.rowRoom) {
    const step = fitStep(counts, card, o.rowRoom, chrome, gap);
    if (!o.tall || counts.length === 1 || step >= max * 0.9) return sideBySide(counts, card, o.rowRoom, chrome, gap, false);
  }
  // Sans la hauteur pour les empiler : des cartes un peu plus petites, toujours côte à côte
  if (!o.tall && counts.length > 1) {
    const c = shrinkToFit(counts, card, o.rowRoom, chrome, gap);
    if (c >= minCard) return sideBySide(counts, c, o.rowRoom, chrome, gap, false);
  }
  // Une ligne par coéquipier, et plusieurs rangées pour une très grosse main
  return { inline: false, stacked: true, card, hands: counts.map((n) => alone(n, card, o.rowRoom - chrome)) };
}

/** Place de la carte `i` dans une main déjà calculée */
export function partnerCardSpot(l: PartnerHandLayout, i: number, card: number): { x: number; y: number } {
  const row = Math.floor(i / l.perRow);
  return { x: (i % l.perRow) * l.step, y: row * card * CARD_RATIO * PARTNER_ROW_SHIFT };
}
