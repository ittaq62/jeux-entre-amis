import { useEffect, useState } from "react";
import { Link } from "wouter";
import { TABLE_NAMES, type PublicUser, type TableGame } from "../../shared/protocol.ts";
import { BOT_ELO, ELO_START } from "../../shared/elo.ts";
import { formatSprint } from "../lib/countdown.ts";
import { RANKING_POINTS } from "../../shared/ranking.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Options } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useSession } from "../stores/session.ts";

interface Entry {
  rank: number;
  user: PublicUser;
  played: number;
  won: number;
  points: number;
  elo: number;
  bestStreak: number;
  bestSprint: number | null;
}

type Sort = "points" | "elo" | "sprint";

export function LeaderboardPage() {
  const me = useSession((s) => s.user);
  const games = useSession((s) => s.games);
  const tourOn = useSession((s) => s.tour);
  const choices: TableGame[] = tourOn ? [...games, "tour"] : games;
  const [scope, setScope] = useState<"friends" | "all">("friends");
  const [game, setGame] = useState<TableGame>("uno");
  const tour = game === "tour";
  const [sort, setSort] = useState<Sort>("points");
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    setEntries(null);
    api
      .get<{ entries: Entry[] }>(`/leaderboard?scope=${scope}&game=${game}&sort=${sort}`)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [scope, game, sort]);

  // Les records du solo n'existent qu'à Briques
  useEffect(() => {
    if (sort === "sprint" && game !== "bricks") setSort("points");
  }, [game, sort]);

  const bots =
    game === "naval"
      ? `Les bots comptent pour ${BOT_ELO.naval.mousse} (Mousse), ${BOT_ELO.naval.chasseur} (Chasseur) ou ${BOT_ELO.naval.amiral} (Amiral).`
      : game === "bricks"
        ? `Les bots comptent pour ${BOT_ELO.bricks.apprenti} (Apprenti), ${BOT_ELO.bricks.confirme} (Confirmé) ou ${BOT_ELO.bricks.expert} (Expert).`
        : game === "capitale"
          ? `Les bots comptent pour ${BOT_ELO.capitale.facile} (Facile), ${BOT_ELO.capitale.moyen} (Moyen) ou ${BOT_ELO.capitale.fort} (Fort).`
          : `Les bots comptent pour ${BOT_ELO.uno}.`;

  return (
    <div className="felt page">
      <AppHeader />
      <main className="narrow">
        <div className="page-heading">
          <h1>Classement</h1>
          <div className="tabs" role="group" aria-label="Qui afficher">
            <button aria-pressed={scope === "friends"} onClick={() => setScope("friends")}>
              Entre amis
            </button>
            <button aria-pressed={scope === "all"} onClick={() => setScope("all")}>
              Tout le monde
            </button>
          </div>
        </div>
        <div className="board-filters">
          {choices.length > 1 && (
            <Options<TableGame>
              label="Jeu"
              value={game}
              onChange={setGame}
              options={choices.map((g) => ({ value: g, label: TABLE_NAMES[g] }))}
            />
          )}
          {!tour && (
            <Options<Sort>
              label="Classer par"
              value={sort}
              onChange={setSort}
              options={[
                { value: "points", label: "Points" },
                { value: "elo", label: "Elo" },
                ...(game === "bricks" ? [{ value: "sprint" as const, label: "Records 40 lignes" }] : []),
              ]}
            />
          )}
        </div>
        <p className="hint" style={{ margin: 0, maxWidth: "62ch" }}>
          {tour ? (
            <>
              Les tournées gagnées d'abord, puis le total des points marqués en tournée (10 pour une victoire de jeu, 7 pour la 2e place…).
            </>
          ) : sort === "sprint" ? (
            <>Le meilleur temps de chacun au solo 40 lignes, du plus rapide au plus lent.</>
          ) : sort === "points" ? (
            <>
              Chaque joueur que tu termines devant te rapporte {RANKING_POINTS.human} points ({RANKING_POINTS.bot} si c'est un bot), et la
              victoire en ajoute {RANKING_POINTS.win}. Les points ne baissent jamais.
            </>
          ) : (
            <>
              L'Elo mesure ton niveau : il monte quand tu termines devant plus fort que toi et baisse quand tu termines derrière. Tout le
              monde part de {ELO_START}. {bots}
            </>
          )}
        </p>
        <section className="board panel">
          {entries === null ? (
            <p className="hint board-note">Chargement…</p>
          ) : entries.length === 0 ? (
            <p className="empty board-note">
              {tour
                ? "Personne n'a encore terminé de tournée. Lance la première depuis l'accueil."
                : "Personne n'a encore terminé de partie. La première victoire ouvrira le tableau."}
            </p>
          ) : (
            <>
              <div className="board-head" aria-hidden="true">
                <span className="board-head-who">Joueur</span>
                {tour ? (
                  <>
                    <span className="board-stat board-extra">Tournées</span>
                    <span className="board-stat board-score is-main">Gagnées</span>
                    <span className="board-stat board-score">Points</span>
                  </>
                ) : sort === "sprint" ? (
                  <span className="board-stat board-score board-time is-main">Record</span>
                ) : (
                  <>
                    <span className="board-stat board-extra">Victoires</span>
                    <span className={`board-stat board-score ${sort === "elo" ? "is-main" : ""}`}>Elo</span>
                    <span className={`board-stat board-score ${sort === "points" ? "is-main" : ""}`}>Points</span>
                  </>
                )}
              </div>
              <ol className="rows" style={{ margin: 0 }}>
                {entries.map((e) => (
                  <li key={e.user.id} className={`board-row ${e.user.id === me?.id ? "is-me" : ""} ${e.rank <= 3 ? "top" : ""}`}>
                    <span className="board-rank num">{e.rank}</span>
                    <Link href={`/joueur/${encodeURIComponent(e.user.pseudo)}`} className="board-who">
                      <Avatar avatar={e.user.avatar} userId={e.user.id} photo={e.user.photo} size={34} />
                      <strong>
                        <PlayerName name={e.user.pseudo} admin={e.user.admin} />
                      </strong>
                    </Link>
                    {tour ? (
                      <>
                        <span className="board-stat board-extra" aria-label={`${e.played} tournées terminées`}>
                          <strong>{e.played}</strong>
                        </span>
                        <span className="board-stat board-score is-main" aria-label={`${e.won} tournées gagnées`}>
                          <strong>{e.won}</strong>
                        </span>
                        <span className="board-stat board-score" aria-label={`${e.points} points de tournée`}>
                          <strong>{e.points.toLocaleString("fr-FR")}</strong>
                        </span>
                      </>
                    ) : sort === "sprint" ? (
                      <span
                        className="board-stat board-score board-time is-main"
                        aria-label={`Record en ${formatSprint(e.bestSprint ?? 0)}`}
                      >
                        <strong>{formatSprint(e.bestSprint ?? 0)}</strong>
                      </span>
                    ) : (
                      <>
                        <span className="board-stat board-extra" aria-label={`${e.won} victoires sur ${e.played} parties`}>
                          <strong>
                            {e.won} / {e.played}
                          </strong>
                        </span>
                        <span className={`board-stat board-score ${sort === "elo" ? "is-main" : ""}`} aria-label={`Elo ${e.elo}`}>
                          <strong>{e.elo}</strong>
                        </span>
                        <span className={`board-stat board-score ${sort === "points" ? "is-main" : ""}`} aria-label={`${e.points} points`}>
                          <strong>{e.points.toLocaleString("fr-FR")}</strong>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
