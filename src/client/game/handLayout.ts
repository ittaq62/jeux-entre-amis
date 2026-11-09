// Où poser chaque carte de la main. Peu de cartes : un éventail. Plus : une ligne droite, puis plusieurs rangées,
// pour que toutes les cartes restent visibles et touchables sans rien faire défiler. Le défilement ne sert plus que
// de dernier recours, pour une main vraiment démesurée.

export interface CardSpot {
  x: number;
  y: number;
  angle: number;
}

export interface HandLayout {
  spots: CardSpot[];
  rows: number;
  /** Il y a trop de cartes même sur toutes les rangées : la main défile */
  scroll: boolean;
  innerWidth: number;
  /** La hauteur à ajouter pour les rangées en plus */
  extraHeight: number;
}

/** Le pas le plus large entre deux cartes voisines (en part de la largeur d'une carte) */
const WIDEST_STEP = 0.68;
/** Le plus serré qu'on s'autorise : assez pour lire le coin de la carte et la toucher du doigt */
const TIGHTEST_STEP = 0.3;
const TIGHTEST_STEP_PX = 22;
/** Ce qu'une rangée laisse voir de la précédente : le haut des cartes, avec leur valeur */
const ROW_GAP = 0.44;
const EDGE = 10;
const TOP = 12;

/** L'éventail, s'il tient : ses cartes de bord sont inclinées, leur coin déborde d'autant sur les côtés */
function fan(n: number, width: number, cardWidth: number, cardHeight: number): HandLayout | null {
  const fanAngle = Math.min(4, 36 / n);
  const edgeTilt = (((n - 1) / 2) * fanAngle * Math.PI) / 180;
  const margin = EDGE + Math.sin(edgeTilt) * cardHeight * 1.05;
  const usable = Math.max(cardWidth, width - 2 * margin);
  const step = n > 1 ? Math.min(cardWidth * WIDEST_STEP, (usable - cardWidth) / (n - 1)) : 0;
  if (n > 1 && step < cardWidth * TIGHTEST_STEP) return null;
  const start = (width - (cardWidth + step * (n - 1))) / 2;
  return {
    spots: Array.from({ length: n }, (_, i) => {
      const offset = i - (n - 1) / 2;
      return { x: start + i * step, y: TOP + Math.abs(offset) ** 1.5 * (cardWidth / 90), angle: offset * fanAngle };
    }),
    rows: 1,
    scroll: false,
    innerWidth: width,
    extraHeight: 0,
  };
}

/** Des rangées droites : les premières prennent une carte de plus si le compte ne tombe pas juste */
function inRows(n: number, rows: number, step: number, cardWidth: number, cardHeight: number, leftOf: (total: number) => number) {
  const gap = cardHeight * ROW_GAP;
  const spots: CardSpot[] = [];
  for (let row = 0; row < rows; row++) {
    const count = Math.floor((n + rows - 1 - row) / rows);
    const start = leftOf(cardWidth + step * (count - 1));
    for (let col = 0; col < count; col++) spots.push({ x: start + col * step, y: TOP + row * gap, angle: 0 });
  }
  return { spots, extraHeight: (rows - 1) * gap };
}

export function layoutHand(n: number, width: number, cardWidth: number, cardHeight: number, maxRows: number): HandLayout {
  if (n === 0) return { spots: [], rows: 1, scroll: false, innerWidth: width, extraHeight: 0 };
  const fanned = fan(n, width, cardWidth, cardHeight);
  if (fanned) return fanned;
  const room = Math.max(cardWidth, width - 2 * EDGE);
  const tightest = Math.max(TIGHTEST_STEP_PX, cardWidth * TIGHTEST_STEP);
  for (let rows = 1; rows <= maxRows; rows++) {
    const cols = Math.ceil(n / rows);
    const step = cols > 1 ? (room - cardWidth) / (cols - 1) : 0;
    if (cols === 1 || step >= tightest) {
      const placed = inRows(n, rows, Math.min(cardWidth * WIDEST_STEP, step), cardWidth, cardHeight, (total) => (width - total) / 2);
      return { ...placed, rows, scroll: false, innerWidth: width };
    }
  }
  const cols = Math.ceil(n / maxRows);
  const placed = inRows(n, maxRows, tightest, cardWidth, cardHeight, () => EDGE + 2);
  return { ...placed, rows: maxRows, scroll: true, innerWidth: cardWidth + tightest * (cols - 1) + 2 * (EDGE + 2) };
}
