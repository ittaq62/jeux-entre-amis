import { useEffect, useState } from "react";
import { Link } from "wouter";
import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import { endLabel, TITLE_LABELS, TOUR_TEAM_COLORS, TOUR_TEAMS, type TourGameResult, type TourSettings } from "../../shared/tour.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Loading } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { GameTicket } from "../tour/TourParts.tsx";

interface Sheet {
  id: string;
  code: string;
  startedAt: number;
  endedAt: number;
  settings: TourSettings;
  games: { game: GameId; results: TourGameResult[] }[];
  winnerTeam: 0 | 1 | null;
  players: {
    userId: string | null;
    name: string;
    rank: number;
    points: number;
    wins: number;
    team: 0 | 1 | null;
    titles: string[];
    bot?: boolean;
  }[];
}

/** La feuille d'une tournée passée : le classement final, les titres, et qui a gagné quoi, jeu par jeu. */
export function TourSheetPage({ id }: { id: string }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ tour: Sheet }>(`/tours/${encodeURIComponent(id)}`)
      .then((r) => setSheet(r.tour))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Tournée introuvable."));
  }, [id]);

  if (error)
    return (
      <div className="felt page">
        <AppHeader />
        <p className="empty center-text">{error}</p>
      </div>
    );
  if (!sheet) return <Loading />;

  const day = new Date(sheet.endedAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const minutes = Math.max(1, Math.round((sheet.endedAt - sheet.startedAt) / 60_000));
  const teams = Boolean(sheet.settings.teams);

  return (
    <div className="felt page">
      <AppHeader />
      <main className="narrow tour-sheet">
        <div className="page-heading">
          <h1>Feuille de tournée</h1>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Le {day}, {sheet.games.length} jeu{sheet.games.length > 1 ? "x" : ""} en {minutes} min
          {sheet.settings.end ? `, réglée sur ${endLabel(sheet.settings.end)}` : ""}.
          {teams && sheet.winnerTeam !== null && ` Victoire des ${TOUR_TEAMS[sheet.winnerTeam]}.`}
          {teams && sheet.winnerTeam === null && " Égalité entre les deux équipes."}
        </p>

        <section className="score-sheet paper tour-sheet-final">
          <h2>Classement final</h2>
          <ol className="score-lines">
            {sheet.players.map((p) => (
              <li key={p.name} className={p.rank === 1 ? "is-winner" : ""}>
                <span className="score-rank num">{p.rank}</span>
                {p.team !== null && (
                  <span className="tour-sheet-team" style={{ background: TOUR_TEAM_COLORS[p.team] }} title={TOUR_TEAMS[p.team]} />
                )}
                <span className="score-name">
                  {p.name}
                  {p.bot && <span className="hint"> (bot)</span>}
                  {p.titles.length > 0 && <span className="hint"> · {p.titles.map((t) => TITLE_LABELS[t] ?? t).join(", ")}</span>}
                </span>
                <span className="hint">
                  {p.wins} jeu{p.wins > 1 ? "x" : ""} gagné{p.wins > 1 ? "s" : ""}
                </span>
                <span className="score-points num">{p.points}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="tour-recap panel">
          <h2>Jeu par jeu</h2>
          <ol className="tour-recap-list">
            {sheet.games.map((g, i) => (
              <li key={i}>
                <GameTicket game={g.game} size="sm" />
                <span>
                  <strong>
                    {i + 1}. {GAME_NAMES[g.game]}
                  </strong>
                  <span className="hint">{g.results.map((r) => `${r.rank}. ${r.name} +${r.points}`).join(" · ")}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <p className="center-text">
          <Link href="/" className="btn">
            Retour à l'accueil
          </Link>
        </p>
      </main>
    </div>
  );
}
