import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import { teamScores, TOUR_TEAM_COLORS, TOUR_TEAMS, type TourGameView, type TourMemberView, type TourView } from "../../shared/tour.ts";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";

/** L'affiche d'un jeu de la tournée : un bandeau à sa couleur et un petit motif qui le rappelle */
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
      <span className="ticket-band" />
      <span className="ticket-motif" aria-hidden="true">
        {game === "uno" && (
          <>
            <i className="m-card c-red" />
            <i className="m-card c-yellow" />
            <i className="m-card c-blue" />
          </>
        )}
        {game === "bricks" && (
          <>
            <i className="m-brick b1" />
            <i className="m-brick b2" />
            <i className="m-brick b3" />
            <i className="m-brick b4" />
          </>
        )}
        {game === "naval" && (
          <>
            <i className="m-wave" />
            <i className="m-hull" />
          </>
        )}
      </span>
      <span className="ticket-name">{GAME_NAMES[game]}</span>
    </span>
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
