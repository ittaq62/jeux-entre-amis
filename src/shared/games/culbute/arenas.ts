// Les arènes de Culbute : un grand plateau plein (on ne passe pas à travers, on s'accroche à ses rebords), des
// plateformes fines qu'on traverse par en dessous, parfois mobiles ou rebondissantes, et les limites au-delà desquelles
// on sort. Quand on est plus de quatre, tout s'écarte en largeur.

export type ArenaId = "place" | "bal" | "marche" | "clocher";
export const ARENA_IDS: ArenaId[] = ["place", "bal", "marche", "clocher"];
export const isArenaId = (v: unknown): v is ArenaId => typeof v === "string" && (ARENA_IDS as string[]).includes(v);

export interface PlatformDef {
  x0: number;
  x1: number;
  y: number;
  /** Plein (le grand plateau : on ne le traverse pas), fin (on passe dessous), rebondissant (un auvent) */
  kind: "solid" | "pass" | "bouncy";
  /** Le bas du plateau plein */
  bottom?: number;
  /** Une plateforme qui bouge : amplitude en x et en y, période en images, décalage (en tours) */
  move?: { ax: number; ay: number; period: number; phase: number };
}

export interface ArenaDef {
  id: ArenaId;
  name: string;
  blurb: string;
  platforms: PlatformDef[];
  /** Les limites : au-delà, on sort */
  blast: { left: number; right: number; top: number; bottom: number };
  /** Où chacun commence (dans l'ordre des places) */
  spawns: number[];
}

export const ARENAS: Record<ArenaId, ArenaDef> = {
  place: {
    id: "place",
    name: "La place du village",
    blurb: "Un grand plateau pavé, deux bancs en hauteur et le toit du kiosque au-dessus.",
    platforms: [
      { x0: -7.5, x1: 7.5, y: 0, kind: "solid", bottom: -3.2 },
      { x0: -5.3, x1: -2.3, y: 2.7, kind: "pass" },
      { x0: 2.3, x1: 5.3, y: 2.7, kind: "pass" },
      { x0: -1.7, x1: 1.7, y: 5.1, kind: "pass" },
    ],
    blast: { left: -17, right: 17, top: 14, bottom: -9 },
    spawns: [-4.5, 4.5, -1.5, 1.5, -6, 6, -3, 3],
  },
  bal: {
    id: "bal",
    name: "Le bal du 14 juillet",
    blurb: "L'estrade des musiciens, et des planches qui montent et descendent au rythme de l'accordéon.",
    platforms: [
      { x0: -6.8, x1: 6.8, y: 0, kind: "solid", bottom: -2.6 },
      { x0: -5.6, x1: -2.6, y: 2.4, kind: "pass", move: { ax: 0, ay: 1.4, period: 420, phase: 0 } },
      { x0: 2.6, x1: 5.6, y: 2.4, kind: "pass", move: { ax: 0, ay: 1.4, period: 420, phase: 0.5 } },
      { x0: -1.3, x1: 1.3, y: 4.9, kind: "pass", move: { ax: 2.6, ay: 0, period: 600, phase: 0.25 } },
    ],
    blast: { left: -16, right: 16, top: 14, bottom: -9 },
    spawns: [-4, 4, -1.4, 1.4, -5.6, 5.6, -2.6, 2.6],
  },
  marche: {
    id: "marche",
    name: "Le marché",
    blurb: "Une grande place entre les étals : on rebondit sur les auvents, et on se bat sur le toit de la camionnette.",
    platforms: [
      { x0: -8.6, x1: 8.6, y: 0, kind: "solid", bottom: -3 },
      { x0: -7.6, x1: -4.6, y: 2.1, kind: "bouncy" },
      { x0: 4.6, x1: 7.6, y: 2.1, kind: "bouncy" },
      { x0: -1.8, x1: 1.8, y: 3.3, kind: "pass" },
    ],
    blast: { left: -18.5, right: 18.5, top: 15, bottom: -9 },
    spawns: [-5.5, 5.5, -2, 2, -7, 7, -3.6, 3.6],
  },
  clocher: {
    id: "clocher",
    name: "Le toit du clocher",
    blurb: "Tout petit, tout en haut, sans filet : on y sort vite.",
    platforms: [
      { x0: -5, x1: 5, y: 0, kind: "solid", bottom: -7 },
      { x0: -1.6, x1: 1.6, y: 3.1, kind: "pass" },
    ],
    blast: { left: -14, right: 14, top: 13, bottom: -8 },
    spawns: [-3, 3, -1, 1, -4, 4, -2, 2],
  },
};

/** L'écart en largeur selon le nombre de combattants : rien jusqu'à quatre, la moitié de plus à huit */
export function arenaScale(fighters: number): number {
  return 1 + Math.min(0.5, Math.max(0, fighters - 4) * 0.125);
}

/** Une plateforme telle qu'elle est à cette image : ses bords, sa hauteur, et comment elle bouge (m/image) */
export interface PlatformNow {
  x0: number;
  x1: number;
  y: number;
  kind: PlatformDef["kind"];
  bottom: number;
  dx: number;
  dy: number;
}

function offset(p: PlatformDef, frame: number): [number, number] {
  if (!p.move) return [0, 0];
  const a = ((frame / p.move.period + p.move.phase) % 1) * Math.PI * 2;
  return [p.move.ax * Math.sin(a), p.move.ay * Math.sin(a)];
}

/** Toutes les plateformes de l'arène à cette image */
export function platformsAt(arena: ArenaId, scale: number, frame: number): PlatformNow[] {
  return ARENAS[arena].platforms.map((p) => {
    const [ox, oy] = offset(p, frame);
    const [px, py] = offset(p, frame - 1);
    return {
      x0: p.x0 * scale + ox * scale,
      x1: p.x1 * scale + ox * scale,
      y: p.y + oy,
      kind: p.kind,
      bottom: p.bottom ?? p.y - 0.4,
      dx: (ox - px) * scale,
      dy: oy - py,
    };
  });
}

/** Les limites de l'arène, écartées comme elle */
export function blastOf(arena: ArenaId, scale: number) {
  const b = ARENAS[arena].blast;
  return { left: b.left * scale, right: b.right * scale, top: b.top + (scale - 1) * 3, bottom: b.bottom };
}

/** Les rebords auxquels on s'accroche : ceux du grand plateau, côté gauche (-1) puis droit (+1) */
export interface Ledge {
  x: number;
  y: number;
  /** -1 : le rebord gauche (on y pend tourné vers la droite) */
  side: -1 | 1;
}

export function ledgesOf(arena: ArenaId, scale: number): Ledge[] {
  const solid = ARENAS[arena].platforms.find((p) => p.kind === "solid")!;
  return [
    { x: solid.x0 * scale, y: solid.y, side: -1 },
    { x: solid.x1 * scale, y: solid.y, side: 1 },
  ];
}

/** Là où commence chaque place, et là où l'on revient après une sortie */
export function spawnOf(arena: ArenaId, scale: number, slot: number): { x: number; y: number } {
  const s = ARENAS[arena].spawns;
  return { x: (s[slot % s.length] ?? 0) * scale, y: 0 };
}

export function respawnPoint(arena: ArenaId, scale: number, slot: number): { x: number; y: number } {
  const b = ARENAS[arena].blast;
  // Au-dessus du plateau, chacun sa place pour ne pas revenir les uns sur les autres
  const spread = [-1.2, 1.2, -3.2, 3.2, 0, -2.2, 2.2, -4.2][slot % 8]!;
  return { x: spread * scale, y: Math.min(7.5, b.top * 0.5) };
}
