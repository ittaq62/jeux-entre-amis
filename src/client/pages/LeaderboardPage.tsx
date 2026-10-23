import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { PublicUser } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { api } from "../lib/api.ts";
import { useSession } from "../stores/session.ts";

interface Entry {
  rank: number;
  user: PublicUser;
  played: number;
  won: number;
  rating: number;
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
        <p className="hint" style={{ margin: 0, maxWidth: "60ch" }}>
          Battre quelqu'un de mieux classé que soi rapporte beaucoup de points ; perdre contre lui en coûte peu.
        </p>
        <section className="board paper">
          {entries === null ? (
            <p className="hint" style={{ padding: "18px 0" }}>
              Chargement…
            </p>
          ) : entries.length === 0 ? (
            <p className="empty" style={{ padding: "6px 0 14px" }}>
              Personne n'a encore terminé de partie. La première victoire ouvrira le tableau.
            </p>
          ) : (
            <ol className="rows" style={{ margin: 0 }}>
              {entries.map((e) => (
                <li key={e.user.id} className={`board-row ${e.user.id === me?.id ? "is-me" : ""} ${e.rank <= 3 ? "top" : ""}`}>
                  <span className="board-rank num">{e.rank}</span>
                  <Link href={`/joueur/${encodeURIComponent(e.user.pseudo)}`} className="board-who">
                    <Avatar avatar={e.user.avatar} userId={e.user.id} photo={e.user.photo} size={34} />
                    <strong>{e.user.pseudo}</strong>
                  </Link>
                  <span className="board-stat board-extra">
                    <strong>
                      {e.won} / {e.played}
                    </strong>
                    <span>victoires</span>
                  </span>
                  <span className="board-stat">
                    <strong>{e.rating}</strong>
                    <span>points</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
