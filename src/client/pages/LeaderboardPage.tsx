import { useEffect, useState } from "react";
import { Link } from "wouter";
import { GAME_NAMES, type GameId, type PublicUser } from "../../shared/protocol.ts";
import { BOT_ELO, ELO_START } from "../../shared/elo.ts";
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
}

type Sort = "points" | "elo";

export function LeaderboardPage() {
  const me = useSession((s) => s.user);
  const games = useSession((s) => s.games);
  const [scope, setScope] = useState<"friends" | "all">("friends");
  const [game, setGame] = useState<GameId>("uno");
  const [sort, setSort] = useState<Sort>("points");
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    setEntries(null);
    api
      .get<{ entries: Entry[] }>(`/leaderboard?scope=${scope}&game=${game}&sort=${sort}`)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [scope, game, sort]);

  const bots =
    game === "naval"
      ? `Les bots comptent pour ${BOT_ELO.naval.mousse} (Mousse), ${BOT_ELO.naval.chasseur} (Chasseur) ou ${BOT_ELO.naval.amiral} (Amiral).`
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
          {games.length > 1 && (
            <Options<GameId> label="Jeu" value={game} onChange={setGame} options={games.map((g) => ({ value: g, label: GAME_NAMES[g] }))} />
          )}
          <Options<Sort>
            label="Classer par"
            value={sort}
            onChange={setSort}
            options={[
              { value: "points", label: "Points" },
              { value: "elo", label: "Elo" },
            ]}
          />
        </div>
        <p className="hint" style={{ margin: 0, maxWidth: "62ch" }}>
          {sort === "points" ? (
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
            <p className="empty board-note">Personne n'a encore terminé de partie. La première victoire ouvrira le tableau.</p>
          ) : (
            <>
              <div className="board-head" aria-hidden="true">
                <span className="board-head-who">Joueur</span>
                <span className="board-stat board-extra">Victoires</span>
                <span className={`board-stat board-score ${sort === "elo" ? "is-main" : ""}`}>Elo</span>
                <span className={`board-stat board-score ${sort === "points" ? "is-main" : ""}`}>Points</span>
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
