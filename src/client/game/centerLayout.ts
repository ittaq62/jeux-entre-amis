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
  if (overlap(o, o.base) === 0) return o.base;
  const lowest = o.areaH - o.block.h / 2 - o.below - 4;
  let best = o.base;
  let bestOverlap = overlap(o, o.base);
  for (let y = o.base + 2; y <= lowest; y += 2) {
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
