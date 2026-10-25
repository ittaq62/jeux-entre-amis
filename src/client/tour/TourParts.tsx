import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import { teamScores, TOUR_TEAM_COLORS, TOUR_TEAMS, type TourGameView, type TourMemberView, type TourView } from "../../shared/tour.ts";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";

/** L'affiche d'un jeu de la tournée : une illustration encadrée, entièrement dans son cadre, et le nom du jeu */
export function GameTicket({
  game,
  size = "md",
  lit = false,
  chosen = false,
  dim = false,
  off = false,
}: {
  game: GameId;
  size?: "sm" | "md" | "lg";
  lit?: boolean;
  chosen?: boolean;
  dim?: boolean;
  /** N'accueille pas tout le monde : le tirage l'écarte */
  off?: boolean;
}) {
  return (
    <span
      className={`game-ticket is-${game} size-${size} ${lit ? "is-lit" : ""} ${chosen ? "is-chosen" : ""} ${dim ? "is-dim" : ""} ${off ? "is-off" : ""}`}
      aria-label={GAME_NAMES[game]}
    >
      <span className="ticket-art" aria-hidden="true">
        <svg viewBox="0 0 100 72">{game === "uno" ? <UnoArt /> : game === "bricks" ? <BricksArt /> : <NavalArt />}</svg>
      </span>
      <span className="ticket-name">{GAME_NAMES[game]}</span>
    </span>
  );
}

/** Trois cartes en éventail, la rouge devant */
function UnoArt() {
  const card = (fill: string, angle: number, front = false) => (
    <g transform={`rotate(${angle} 50 70)`}>
      <rect x="38" y="16" width="24" height="36" rx="3.2" fill={fill} stroke="#fbf5e6" strokeWidth="2.2" />
      {front && <ellipse cx="50" cy="34" rx="7.2" ry="12" transform="rotate(28 50 34)" fill="#fbf5e6" />}
      {front && <ellipse cx="50" cy="34" rx="3.2" ry="6.4" transform="rotate(28 50 34)" fill={fill} />}
    </g>
  );
  return (
    <>
      <ellipse cx="50" cy="64" rx="30" ry="4" fill="rgba(0,0,0,0.22)" />
      {card("#2c7be5", -20)}
      {card("#2fa864", 20)}
      {card("#d43a2f", 0, true)}
    </>
  );
}

/** Une pile de briques laquées, et un T qui descend vers le trou qui l'attend */
const BRICK = 11;
const PITCH = 12.5;
const X0 = 13.25;
function Brick({ col, row, color, light }: { col: number; row: number; color: string; light: string }) {
  const x = X0 + col * PITCH;
  const y = 64 - (row + 1) * PITCH;
  return (
    <g>
      <rect x={x} y={y} width={BRICK} height={BRICK} rx="2.2" fill={color} />
      <rect x={x + 1.6} y={y + 1.4} width={BRICK - 3.2} height="2.6" rx="1.2" fill={light} opacity="0.55" />
    </g>
  );
}
function BricksArt() {
  const ruby = ["#b8323a", "#e86a6a"] as const;
  const ivory = ["#d9cfb4", "#fff8e6"] as const;
  const jade = ["#228a63", "#5fd3a2"] as const;
  const sapphire = ["#2c5fb8", "#7aa6f0"] as const;
  const gold = ["#d39a2c", "#ffd77a"] as const;
  const coral = ["#d9643f", "#ff9e78"] as const;
  const amethyst = ["#7d45b5", "#b68aea"] as const;
  // Le fond de pile, avec un trou en troisième colonne, et le haut de la pile sur les bords
  const stack: [number, number, readonly [string, string]][] = [
    [0, 0, ruby],
    [1, 0, gold],
    [3, 0, sapphire],
    [4, 0, ivory],
    [5, 0, amethyst],
    [0, 1, coral],
    [5, 1, sapphire],
  ];
  // Là où le T va se poser : son ombre en pointillés
  const ghost: [number, number][] = [
    [1, 1],
    [2, 1],
    [3, 1],
    [2, 0],
  ];
  const fall: [number, number][] = [
    [1, 3.3],
    [2, 3.3],
    [3, 3.3],
    [2, 2.3],
  ];
  return (
    <>
      {ghost.map(([c, r]) => (
        <rect
          key={`g${c}${r}`}
          x={X0 + c * PITCH + 0.6}
          y={64 - (r + 1) * PITCH + 0.6}
          width={BRICK - 1.2}
          height={BRICK - 1.2}
          rx="2"
          fill="none"
          stroke="rgba(95,211,162,0.55)"
          strokeWidth="1.1"
          strokeDasharray="2.2 1.6"
        />
      ))}
      {stack.map(([c, r, [color, light]]) => (
        <Brick key={`s${c}${r}`} col={c} row={r} color={color} light={light} />
      ))}
      {fall.map(([c, r]) => (
        <Brick key={`f${c}${r}`} col={c} row={r} color={jade[0]} light={jade[1]} />
      ))}
    </>
  );
}

/** Un navire sur la houle */
function NavalArt() {
  const wave = (y: number, opacity: number) => (
    <path
      d={`M-4 ${y} q 6.25 -4 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0`}
      fill="none"
      stroke={`rgba(200,238,255,${opacity})`}
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  );
  return (
    <>
      {/* Mât, cheminée et passerelle */}
      <line x1="44" y1="18" x2="44" y2="34" stroke="#e7ecee" strokeWidth="1.4" />
      <path d="M44 19 L52 21.5 L44 24 Z" fill="#d4453c" />
      <rect x="53" y="25" width="7" height="10" rx="1" fill="#d4453c" />
      <rect x="53" y="25" width="7" height="2.4" fill="#1d1b18" opacity="0.55" />
      <rect x="37" y="33" width="26" height="9" rx="1.6" fill="#e7ecee" />
      <rect x="40" y="36" width="3" height="2.6" rx="0.6" fill="#2f7aa0" />
      <rect x="45" y="36" width="3" height="2.6" rx="0.6" fill="#2f7aa0" />
      <rect x="50" y="36" width="3" height="2.6" rx="0.6" fill="#2f7aa0" />
      <rect x="55" y="36" width="3" height="2.6" rx="0.6" fill="#2f7aa0" />
      {/* La coque, la proue vers la droite */}
      <path d="M16 42 L86 42 L78 54 L22 54 Z" fill="#c9d3d6" />
      <path d="M19 49 L82.7 49 L78 54 L22 54 Z" fill="#7d8a8e" />
      {wave(55, 0.85)}
      {wave(62, 0.5)}
      {wave(68.5, 0.28)}
    </>
  );
}

/** Jeux joués jusqu'au bout */
export const playedGames = (view: TourView) => view.games.filter((g) => !g.aborted && g.results);

const playedLabel = (n: number) => (n === 1 ? "1 jeu joué" : `${n} jeux joués`);

/** Où en est la tournée, selon sa façon de finir */
export function progressLabel(view: TourView, now: number): string {
  const played = playedGames(view).length;
  const end = view.settings.end;
  const upcoming = view.status === "finished" ? played : played + (view.status === "playing" ? 0 : 1);
  switch (end.kind) {
    case "games":
      return view.status === "finished" ? playedLabel(played) : `Jeu ${Math.max(1, Math.min(upcoming, end.count))} sur ${end.count}`;
    case "score":
      return `Premier à ${end.target} points`;
    case "time": {
      if (view.status === "finished" || !view.endsAt) return `${end.minutes} minutes de jeu`;
      const left = Math.ceil((view.endsAt - now) / 60_000);
      return left > 0 ? `Encore ${left} min` : "Dernier jeu";
    }
    case "endless":
      return view.status === "finished" ? playedLabel(played) : `Jeu ${Math.max(1, upcoming)}, sans fin`;
  }
}

export interface Placed {
  member: TourMemberView;
  rank: number;
  /** Points gagnés au dernier jeu */
  gained: number | null;
}

/** Classement de la tournée : points, puis jeux gagnés ; à égalité, même place */
export function standingsOf(view: TourView, last: TourGameView | null): Placed[] {
  const playedIds = new Set(view.games.flatMap((g) => g.results?.map((r) => r.userId) ?? []));
  const list = view.members
    .filter((m) => playedIds.has(m.userId) || (m.role === "player" && !m.left))
    .sort((a, b) => b.points - a.points || b.wins - a.wins);
  let rank = 0;
  return list.map((member, i) => {
    const prev = list[i - 1];
    if (!prev || prev.points !== member.points || prev.wins !== member.wins) rank = i + 1;
    const gained = last?.results?.find((r) => r.userId === member.userId)?.points ?? null;
    return { member, rank, gained };
  });
}

export function Standings({ view, last, meId }: { view: TourView; last: TourGameView | null; meId: string }) {
  const rows = standingsOf(view, last);
  if (rows.length === 0) return <p className="hint">Personne n'a encore marqué.</p>;
  return (
    <ol className="tour-standings-list">
      {rows.map(({ member: m, rank, gained }) => (
        <li
          key={m.userId}
          className={`standing-row ${rank === 1 ? "is-first" : ""} ${m.userId === meId ? "is-me" : ""} ${m.left ? "is-left" : ""}`}
          style={m.team !== null ? { ["--team" as string]: TOUR_TEAM_COLORS[m.team] } : undefined}
        >
          <span className="standing-rank num">{rank}</span>
          <Avatar avatar={m.avatar} userId={m.userId} photo={m.photo} size={34} />
          <span className="standing-who">
            <strong>
              <PlayerName name={m.name} admin={m.admin} suffix={m.userId === meId ? " (toi)" : undefined} />
            </strong>
            <span className="hint">
              {[
                m.team !== null && TOUR_TEAMS[m.team],
                m.wins > 0 && `${m.wins} jeu${m.wins > 1 ? "x" : ""} gagné${m.wins > 1 ? "s" : ""}`,
                m.left ? "a quitté la tournée" : !m.connected && "absent",
                m.waiting && !m.left && "joue au prochain jeu",
              ]
                .filter(Boolean)
                .join(", ") || " "}
            </span>
          </span>
          {gained !== null && <span className="standing-gain num">+{gained}</span>}
          <span className="standing-points num">{m.points}</span>
        </li>
      ))}
    </ol>
  );
}

/** Les deux équipes et leur total */
export function TeamScore({ view }: { view: TourView }) {
  const [red, blue] = teamScores(view.members);
  const total = Math.max(1, red + blue);
  return (
    <div className="team-score" aria-label={`${TOUR_TEAMS[0]} ${red}, ${TOUR_TEAMS[1]} ${blue}`}>
      <div className="team-score-names">
        <span style={{ color: TOUR_TEAM_COLORS[0] }}>
          {TOUR_TEAMS[0]} <strong className="num">{red}</strong>
        </span>
        <span style={{ color: TOUR_TEAM_COLORS[1] }}>
          <strong className="num">{blue}</strong> {TOUR_TEAMS[1]}
        </span>
      </div>
      <div className="team-score-bar">
        <span style={{ width: `${(red / total) * 100}%`, background: TOUR_TEAM_COLORS[0] }} />
        <span style={{ width: `${(blue / total) * 100}%`, background: TOUR_TEAM_COLORS[1] }} />
      </div>
    </div>
  );
}

/** Le haut des écrans de la tournée : retour, nom, progression, chat */
export function TourTop({
  view,
  now,
  unread,
  onOpenChat,
  onLeave,
}: {
  view: TourView;
  now: number;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
}) {
  return (
    <header className="page-top tour-top">
      <button className="btn btn-ghost btn-icon" onClick={onLeave} aria-label="Quitter la tournée">
        <Icon name="back" />
      </button>
      <div className="tour-top-title">
        <h1 className="page-title">La Tournée</h1>
        <span className="hint">
          {progressLabel(view, now)} · code <strong className="num">{view.code}</strong>
        </span>
      </div>
      <div className="page-top-actions">
        <button className="btn btn-ghost btn-icon chat-toggle" onClick={onOpenChat} aria-label="Discussion">
          <Icon name="chat" />
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>
      </div>
    </header>
  );
}
