// « Symboles de couleur », en équipes : chaque équipe a aussi sa forme, pour reconnaître les siens sans la couleur. Les
// Rouges ont le rond, les Bleus le carré : sur le repère au-dessus des combattants, leur bulle quand ils sortent du
// cadre, leur visage et leurs vies en bas de l'écran, et au salon devant le nom de l'équipe.

export type TeamMark = "rond" | "carre";

export const TEAM_MARKS = ["rond", "carre"] as const satisfies readonly TeamMark[];

/** Le signe d'une équipe dans un texte (« ● Rouges », « ■ Bleus ») */
export const TEAM_GLYPHS: Record<TeamMark, string> = { rond: "●", carre: "■" };

/** La forme d'une équipe (0 ou 1), ou rien */
export function teamMark(team: number | undefined): TeamMark | undefined {
  return team === 0 || team === 1 ? TEAM_MARKS[team] : undefined;
}

/**
 * Trace la forme d'une équipe sur un dessin, centrée en (x, y) ; `r` : le rayon du rond. Le carré, un peu plus petit
 * (0,9 r de demi-côté), pèse autant à l'œil. Reste à le remplir ou à le cercler.
 */
export function traceTeamMark(g: CanvasRenderingContext2D, mark: TeamMark, x: number, y: number, r: number) {
  g.beginPath();
  if (mark === "rond") {
    g.arc(x, y, r, 0, Math.PI * 2);
    return;
  }
  const k = r * 0.9;
  const c = Math.min(k * 0.25, 8);
  g.moveTo(x - k + c, y - k);
  g.arcTo(x + k, y - k, x + k, y + k, c);
  g.arcTo(x + k, y + k, x - k, y + k, c);
  g.arcTo(x - k, y + k, x - k, y - k, c);
  g.arcTo(x - k, y - k, x + k, y - k, c);
  g.closePath();
}
