import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { PublicUser } from "../../shared/protocol.ts";
import { RANKING_POINTS } from "../../shared/ranking.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { api } from "../lib/api.ts";
import { useSession } from "../stores/session.ts";

interface Entry {
  rank: number;
  user: PublicUser;
  played: number;
  won: number;
  points: number;
  bestStreak: number;
}

export function LeaderboardPage() {
  const me = useSession((s) => s.user);
  const [scope, setScope] = useState<"friends" | "all">("friends");
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    setEntries(null);
    api
      .get<{ entries: Entry[] }>(`/leaderboard?scope=${scope}`)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [scope]);

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
        <p className="hint" style={{ margin: 0, maxWidth: "62ch" }}>
          Chaque joueur que tu termines devant te rapporte {RANKING_POINTS.human} points ({RANKING_POINTS.bot} si c'est un bot), et la
          victoire en ajoute {RANKING_POINTS.win}. Les points ne baissent jamais.
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
                <span className="board-stat board-points">Points</span>
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
                    <span className="board-stat board-points" aria-label={`${e.points} points`}>
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
