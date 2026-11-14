import { CAPITALE_TEAMS, teamName } from "../../shared/games/capitale/board.ts";
import { sideOf, teamOf, teamPlay, teamRules, type CapitaleSettings } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { asState, PAWN_COLORS } from "./boardUi.ts";

// Les équipes à l'écran : chacune a sa couleur, son nom et sa forme (un rond, un triangle, un carré), pour qu'on les
// distingue même sans voir les couleurs. Les pions d'une équipe prennent des teintes de sa couleur.

/** Les teintes des pions de chaque équipe : la couleur de l'équipe, puis deux voisines */
const TEAM_SHADES = [
  ["#e2453c", "#f08a2c", "#c2376f"],
  ["#3f7fd8", "#1fa7c6", "#6a52d4"],
  ["#2fa864", "#86b829", "#138877"],
];

export const MARK_NAMES = ["rond", "triangle", "carré"] as const;

export const teamColor = (team: number) => CAPITALE_TEAMS[team]?.color ?? "#888";

/**
 * La couleur du pion de chacun : hors équipes, dans l'ordre des joueurs ; en équipes, une teinte de son équipe, dans
 * l'ordre où ses coéquipiers apparaissent. Le salon, la fenêtre de la tournée et la partie donnent la même couleur.
 */
export function pawnColor(ids: readonly string[], teams: Record<string, number | undefined> | null | undefined, id: string): string {
  const team = teams?.[id];
  if (teams && team !== undefined) {
    const rank = ids.filter((x) => teams[x] === team).indexOf(id);
    const shades = TEAM_SHADES[team] ?? TEAM_SHADES[0]!;
    return shades[Math.max(0, rank) % shades.length]!;
  }
  const k = ids.indexOf(id);
  return k >= 0 ? PAWN_COLORS[k % PAWN_COLORS.length]! : "transparent";
}

/** Les équipes d'une liste de sièges, si chacun en a une (sinon rien) */
export function seatTeams(seats: readonly { id: string; team?: number }[]): Record<string, number> | null {
  if (seats.length === 0 || seats.some((s) => s.team === undefined)) return null;
  if (new Set(seats.map((s) => s.team)).size < 2) return null;
  return Object.fromEntries(seats.map((s) => [s.id, s.team!]));
}

/** La forme d'une équipe, à sa couleur, bordée de blanc */
export function TeamMark({ team, size = 14, title }: { team: number; size?: number; title?: string }) {
  const color = teamColor(team);
  const shape = team % 3;
  const label = title ?? `${teamName(team)} (${MARK_NAMES[shape]})`;
  return (
    <svg className="team-mark" width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={label}>
      <title>{label}</title>
      {shape === 0 && <circle cx="10" cy="10" r="7.6" fill={color} stroke="#fff" strokeWidth="2.4" />}
      {shape === 1 && <path d="M10 2.2 L18.2 17 L1.8 17 Z" fill={color} stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />}
      {shape === 2 && <rect x="2.6" y="2.6" width="14.8" height="14.8" rx="2" fill={color} stroke="#fff" strokeWidth="2.4" />}
    </svg>
  );
}

/** La forme et le nom d'une équipe, en une étiquette */
export function TeamTag({ team, mine = false }: { team: number; mine?: boolean }) {
  return (
    <span className="team-tag" style={{ ["--team" as string]: teamColor(team) }}>
      <TeamMark team={team} size={13} />
      {teamName(team)}
      {mine && <em> · ton équipe</em>}
    </span>
  );
}

/** Un camp pour gagner : une équipe (quand elle gagne ensemble) ou un joueur seul */
export interface Side {
  key: string;
  team: number | null;
  /** Ses joueurs, dans l'ordre de la partie */
  members: string[];
  /** Un de ses joueurs encore en jeu (pour lire sa progression) */
  rep: string;
}

/** Les camps de la partie, dans l'ordre de la partie ; ceux qui n'ont plus personne en jeu sont laissés de côté */
export function sidesOf(g: CapitaleView): Side[] {
  const s = asState(g);
  const out = new Map<string, Side>();
  for (const p of g.players) {
    const key = sideOf(s, p.id);
    const side = out.get(key) ?? { key, team: key === p.id ? null : teamOf(g, p.id), members: [], rep: "" };
    side.members.push(p.id);
    if (!p.bankrupt && !side.rep) side.rep = p.id;
    out.set(key, side);
  }
  return [...out.values()].filter((x) => x.rep);
}

/** La partie se joue-t-elle en équipes ? Et l'équipe de ce joueur (null sinon) */
export const inTeams = (g: CapitaleView) => teamPlay(g);
export const teamIn = (g: CapitaleView, id: string | null | undefined) => (teamPlay(g) ? teamOf(g, id) : null);
/** Ce joueur est-il un coéquipier (pas soi-même) de l'autre ? */
export const isMate = (g: CapitaleView, a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a !== b && teamPlay(g) && teamOf(g, a) !== null && teamOf(g, a) === teamOf(g, b));

/** Les règles d'équipe de la partie, en mots courts (pour les rappels) */
export function teamRulesText(g: { settings: Partial<CapitaleSettings> }): string[] {
  const r = teamRules(g);
  return [
    r.rent === "free"
      ? "pas de loyer entre coéquipiers"
      : r.rent === "half"
        ? "loyer à moitié entre coéquipiers"
        : "loyer plein entre coéquipiers",
    r.gifts ? "dons d'argent et de titres au coéquipier" : "pas de dons",
    r.heir ? "en faillite, l'équipe garde les titres" : "en faillite, le créancier prend tout",
    r.win ? "victoire d'équipe : fortunes additionnées" : "chacun son classement",
  ];
}
