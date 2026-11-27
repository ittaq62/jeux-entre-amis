// « Symboles de couleur » (réglage du compte) : chaque équipe a sa forme, pour se lire sans la couleur. Un rond pour
// l'équipe à domicile, un triangle pour l'autre : sur le maillot (dans le dos et à la place de l'écusson), au tableau du
// match, à côté des cartons et sur le radar.

/** Le nom de la forme de chaque équipe, pour les lecteurs d'écran */
export const TEAM_SHAPE_NAMES = ["rond", "triangle"] as const;

/** Trace la forme de l'équipe sur une toile, centrée en (x, y), de rayon r (il reste à la remplir ou la border) */
export function traceTeamShape(g: CanvasRenderingContext2D, team: number, x: number, y: number, r: number) {
  g.beginPath();
  if (team === 0) {
    g.arc(x, y, r, 0, Math.PI * 2);
  } else {
    g.moveTo(x, y - r * 1.12);
    g.lineTo(x + r * 1.08, y + r * 0.78);
    g.lineTo(x - r * 1.08, y + r * 0.78);
    g.closePath();
  }
}

/** L'encre qui se lit sur cette couleur de maillot : foncée sur un maillot clair, blanche sur un foncé */
export function inkOn(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return "#ffffff";
  const light = (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255 > 0.45;
  return light ? "#16202c" : "#ffffff";
}

/** La forme de l'équipe, en petit, dans l'interface (couleur du texte autour) */
export function TeamMark({ team, size = 10, className }: { team: number; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="-1 -1 2 2" aria-hidden="true" fill="currentColor">
      {team === 0 ? <circle r="0.82" /> : <polygon points="0,-0.95 0.92,0.72 -0.92,0.72" />}
    </svg>
  );
}
