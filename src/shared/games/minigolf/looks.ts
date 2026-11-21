// Les skins du minigolf : la couleur de sa balle, son motif et la traînée qu'elle laisse. Les couleurs sont à tout le
// monde ; certains motifs et traînées s'achètent à la boutique avec les points gagnés en jouant.

export interface BallColor {
  id: string;
  name: string;
  /** La couleur principale, puis celle du motif */
  hex: string;
  accent: string;
}

export const BALL_COLORS: BallColor[] = [
  { id: "blanche", name: "Blanche", hex: "#f5f2ea", accent: "#d93a3a" },
  { id: "rouge", name: "Rouge", hex: "#e2403a", accent: "#fff3dc" },
  { id: "orange", name: "Orange", hex: "#f28a24", accent: "#fff3dc" },
  { id: "jaune", name: "Jaune", hex: "#f5cf2e", accent: "#3a2a10" },
  { id: "verte", name: "Verte", hex: "#3fbf5a", accent: "#fff3dc" },
  { id: "bleue", name: "Bleue", hex: "#2f86e6", accent: "#fff3dc" },
  { id: "violette", name: "Violette", hex: "#8a55e0", accent: "#ffe46b" },
  { id: "rose", name: "Rose", hex: "#f07ab8", accent: "#ffffff" },
  { id: "turquoise", name: "Turquoise", hex: "#28c4c0", accent: "#ffffff" },
  { id: "noire", name: "Noire", hex: "#2a2a30", accent: "#f5cf2e" },
];

export interface BallPattern {
  id: string;
  name: string;
  price: number;
}

export const BALL_PATTERNS: BallPattern[] = [
  { id: "unie", name: "Unie", price: 0 },
  { id: "rayure", name: "À rayure", price: 0 },
  { id: "pois", name: "À pois", price: 150 },
  { id: "etoiles", name: "Étoilée", price: 200 },
  { id: "damier", name: "Damier", price: 200 },
  { id: "pasteque", name: "Pastèque", price: 300 },
  { id: "planete", name: "Planète", price: 350 },
  { id: "oeil", name: "Œil", price: 350 },
  { id: "disco", name: "Boule à facettes", price: 500 },
];

export interface Trail {
  id: string;
  name: string;
  price: number;
}

export const TRAILS: Trail[] = [
  { id: "aucune", name: "Aucune", price: 0 },
  { id: "fil", name: "Fil blanc", price: 0 },
  { id: "etincelles", name: "Étincelles", price: 200 },
  { id: "bulles", name: "Bulles", price: 200 },
  { id: "confettis", name: "Confettis", price: 300 },
  { id: "flammes", name: "Flammes", price: 400 },
  { id: "arcenciel", name: "Arc-en-ciel", price: 500 },
];

/** Le skin d'un joueur */
export interface BallLook {
  color: string;
  pattern: string;
  trail: string;
}

export const DEFAULT_LOOK: BallLook = { color: "blanche", pattern: "unie", trail: "fil" };

export const patternItem = (id: string) => `golfmotif:${id}`;
export const trailItem = (id: string) => `golftrace:${id}`;

export function colorOf(id: string): BallColor {
  return BALL_COLORS.find((c) => c.id === id) ?? BALL_COLORS[0]!;
}

export function isBallLook(v: unknown): v is BallLook {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return BALL_COLORS.some((c) => c.id === l.color) && BALL_PATTERNS.some((p) => p.id === l.pattern) && TRAILS.some((t) => t.id === l.trail);
}

/** Ce que le joueur peut porter : un motif ou une traînée qu'il n'a pas redevient celui de départ */
export function usableLook(look: BallLook, has: (item: string) => boolean): BallLook {
  const pattern = BALL_PATTERNS.find((p) => p.id === look.pattern);
  const trail = TRAILS.find((t) => t.id === look.trail);
  return {
    color: colorOf(look.color).id,
    pattern: pattern && (pattern.price === 0 || has(patternItem(pattern.id))) ? pattern.id : DEFAULT_LOOK.pattern,
    trail: trail && (trail.price === 0 || has(trailItem(trail.id))) ? trail.id : DEFAULT_LOOK.trail,
  };
}

/** Une couleur pour chaque bot, différente de celles déjà prises */
export function botLook(taken: string[], seed: number): BallLook {
  const free = BALL_COLORS.filter((c) => !taken.includes(c.id));
  const list = free.length > 0 ? free : BALL_COLORS;
  const color = list[Math.abs(seed) % list.length]!;
  const patterns = BALL_PATTERNS.filter((p) => p.price === 0);
  return { color: color.id, pattern: patterns[Math.abs(seed >> 3) % patterns.length]!.id, trail: "fil" };
}
