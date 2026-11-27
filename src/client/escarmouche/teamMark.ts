// « Symboles de couleur » : une forme par équipe en plus de sa couleur, pour qui ne distingue pas bien le rouge du bleu.
// Un rond chez les Rouges, un triangle chez les Bleus : dans le texte (tableau des scores, drapeaux de la conquête), sur
// la mini-carte, sur le brassard et le foulard des soldats, sur l'étoffe des drapeaux.

import * as THREE from "three";

/** La forme de chaque équipe, en caractère (pour le texte) */
export const TEAM_MARK = ["●", "▲"] as const;

/** Le texte précédé de la forme de son équipe quand le réglage est actif (rien pour qui n'a pas d'équipe) */
export function marked(text: string, team: number | null | undefined, on: boolean): string {
  return on && (team === 0 || team === 1) ? `${TEAM_MARK[team]} ${text}` : text;
}

/** Trace la forme d'une équipe (sans la remplir), centrée en (x, y), de rayon r */
export function markPath(g: CanvasRenderingContext2D, team: number, x: number, y: number, r: number) {
  g.beginPath();
  if (team === 1) {
    g.moveTo(x, y - r);
    g.lineTo(x + r * 0.95, y + r * 0.72);
    g.lineTo(x - r * 0.95, y + r * 0.72);
    g.closePath();
  } else g.arc(x, y, r * 0.82, 0, Math.PI * 2);
}

const textures = new Map<string, THREE.CanvasTexture>();

/**
 * Une étoffe aux couleurs de l'équipe, semée de sa forme en clair (`count` formes sur la largeur) : pour le brassard,
 * le foulard, l'étoffe d'un drapeau. Faite une fois par équipe et par réglage, partagée.
 */
export function markTexture(team: number, color: string, count = 1): THREE.CanvasTexture {
  const key = `${team}:${color}:${count}`;
  const known = textures.get(key);
  if (known) return known;
  const c = document.createElement("canvas");
  c.width = 64 * count;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  for (let k = 0; k < count; k++) {
    markPath(g, team, 32 + k * 64, 33, 19);
    g.fillStyle = "#f6f2e6";
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  textures.set(key, t);
  return t;
}
