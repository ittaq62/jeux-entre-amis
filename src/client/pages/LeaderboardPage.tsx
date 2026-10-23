import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { PublicUser } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Segmented } from "../components/ui.tsx";
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
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "friends", label: "Entre amis" },
              { value: "all", label: "Tout le monde" },
            ]}
          />
        </div>
        <p className="hint">
          Les points de classement montent quand tu bats des joueurs mieux classés que toi, et baissent dans le cas contraire.
        </p>
        <section className="panel leaderboard">
          {entries === null ? (
            <div className="center-text" style={{ padding: 32 }}>
              <span className="spinner" style={{ display: "inline-block" }} />
            </div>
          ) : entries.length === 0 ? (
            <p className="empty">Personne n'a encore joué. Lance une partie pour ouvrir le bal !</p>
          ) : (
            <ol className="lb-list">
              {entries.map((e) => (
                <li key={e.user.id} className={`lb-row ${e.user.id === me?.id ? "is-me" : ""} ${e.rank <= 3 ? `top-${e.rank}` : ""}`}>
                  <span className="lb-rank">{e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : e.rank}</span>
                  <Link href={`/joueur/${encodeURIComponent(e.user.pseudo)}`} className="lb-who">
                    <Avatar avatar={e.user.avatar} userId={e.user.id} photo={e.user.photo} size={36} />
                    <strong>{e.user.pseudo}</strong>
                  </Link>
                  <span className="lb-stat">
                    <strong>{e.rating}</strong>
                    <span className="hint">pts</span>
                  </span>
                  <span className="lb-stat lb-extra">
                    <strong>{e.won}</strong>
                    <span className="hint">/{e.played} gagnées</span>
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
