// UNO : la hauteur de la pioche et de la défausse sur le tapis. Elles partent du milieu et descendent juste assez pour
// ne toucher aucun siège, tant qu'il reste de la place en dessous (la couleur demandée s'affiche sous la défausse).

export interface CenterLayoutInput {
  /** Hauteur du tapis */
  areaH: number;
  /** Hauteur de départ du centre des piles */
  base: number;
  /** Abscisse du centre des piles */
  cx: number;
  /** Les piles côte à côte */
  block: { w: number; h: number };
  /** Ce qui dépasse sous les piles (l'étiquette de couleur) */
  below: number;
  /** Centre de chaque siège, et taille d'un siège */
  seats: { x: number; y: number }[];
  seat: { w: number; h: number };
  /** Écart à garder entre un siège et les piles */
  margin: number;
}

function overlap(o: CenterLayoutInput, y: number): number {
  const top = y - o.block.h / 2 - o.margin;
  const bottom = y + o.block.h / 2 + o.below + o.margin;
  const left = o.cx - o.block.w / 2 - o.margin;
  const right = o.cx + o.block.w / 2 + o.margin;
  let sum = 0;
  for (const s of o.seats) {
    const w = Math.min(right, s.x + o.seat.w / 2) - Math.max(left, s.x - o.seat.w / 2);
    const h = Math.min(bottom, s.y + o.seat.h / 2) - Math.max(top, s.y - o.seat.h / 2);
    if (w > 0 && h > 0) sum += w * h;
  }
  return sum;
}

/** Ordonnée du centre des piles */
export function placeCenter(o: CenterLayoutInput): number {
  // Les piles et l'étiquette de couleur restent sur le tapis : sur un tapis bas, elles remontent un peu
  const highest = o.block.h / 2 + 4;
  const lowest = o.areaH - o.block.h / 2 - o.below - 4;
  const start = Math.max(highest, Math.min(o.base, lowest));
  if (overlap(o, start) === 0) return start;
  let best = start;
  let bestOverlap = overlap(o, start);
  for (let y = start + 2; y <= lowest; y += 2) {
    const v = overlap(o, y);
    if (v === 0) return y;
    if (v < bestOverlap) {
      best = y;
      bestOverlap = v;
    }
  }
  return best;
}

/**
 * Écran bas (téléphone en paysage) : pas la hauteur pour un arc de sièges au-dessus des piles. Les sièges se rangent
 * alors sur une ligne, de part et d'autre des piles : à gauche d'abord (le suivant tout à gauche), puis à droite.
 */
export function rowSeats(n: number, areaW: number, y: number, blockW: number): { x: number; y: number }[] {
  const left = Math.ceil(n / 2);
  const right = n - left;
  // Chaque côté se partage en parts égales, un siège au milieu de chacune
  const band = blockW / 2 + 6;
  const leftW = Math.max(0, areaW / 2 - band);
  const rightStart = areaW / 2 + band;
  const rightW = Math.max(0, areaW - rightStart);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < left; i++) out.push({ x: ((i + 0.5) / left) * leftW, y });
  for (let i = 0; i < right; i++) out.push({ x: rightStart + ((i + 0.5) / right) * rightW, y });
  return out;
}

/** Les arcs essayés en portrait : de plus en plus ouverts et bas, tant que des sièges se touchent */
const PORTRAIT_ARCS = [
  { spread: 1.5, center: 0.62 },
  { spread: 1.6, center: 0.64 },
  { spread: 1.7, center: 0.66 },
  { spread: 1.8, center: 0.68 },
];

/** Recouvrement total des sièges entre eux, plus ce qui dépasse en bas du tapis */
function seatClash(seats: { x: number; y: number }[], seat: { w: number; h: number }, areaH: number): number {
  let sum = 0;
  for (let i = 0; i < seats.length; i++) {
    const a = seats[i]!;
    sum += Math.max(0, a.y + seat.h / 2 - areaH) * seat.w;
    for (let j = i + 1; j < seats.length; j++) {
      const b = seats[j]!;
      const w = seat.w - Math.abs(a.x - b.x);
      const h = seat.h - Math.abs(a.y - b.y);
      if (w > 0 && h > 0) sum += w * h;
    }
  }
  return sum;
}

/**
 * Les adversaires en arc au-dessus des piles, le suivant à gauche. En portrait, si deux sièges se touchent, l'arc
 * s'ouvre et descend un peu (le bas du tapis est libre), jusqu'à ce qu'aucun siège n'en touche un autre.
 */
export function arcSeats(
  n: number,
  area: { w: number; h: number },
  pad: { x: number; y: number },
  portrait: boolean,
  seat: { w: number; h: number },
): { x: number; y: number }[] {
  const rx = Math.max(40, area.w / 2 - pad.x);
  const place = (spread: number, center: number) => {
    const cy = area.h * center;
    const ry = Math.max(40, cy - pad.y);
    return Array.from({ length: n }, (_, k) => {
      const theta = (1 + (spread - 1) / 2) * Math.PI - ((k + 1) / (n + 1)) * spread * Math.PI;
      return { x: area.w / 2 + rx * Math.cos(theta), y: cy - ry * Math.sin(theta) };
    });
  };
  if (!portrait) return place(1.2, 0.5);
  let best = place(PORTRAIT_ARCS[0]!.spread, PORTRAIT_ARCS[0]!.center);
  let bestClash = seatClash(best, seat, area.h);
  for (const arc of PORTRAIT_ARCS.slice(1)) {
    if (bestClash === 0) break;
    const seats = place(arc.spread, arc.center);
    const clash = seatClash(seats, seat, area.h);
    if (clash < bestClash) {
      best = seats;
      bestClash = clash;
    }
  }
  return best;
}
