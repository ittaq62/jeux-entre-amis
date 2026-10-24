import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import type { PublicUser } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";

export function FriendsPage() {
  const friends = useHub((s) => s.friends);
  const online = useHub((s) => s.online);
  const refresh = useHub((s) => s.refreshFriends);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setResults([]);
    const t = setTimeout(() => {
      api
        .get<{ users: PublicUser[] }>(`/users/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.users))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function add(pseudo: string) {
    try {
      const res = await api.post<{ result: string }>("/friends", { pseudo });
      toast({
        title:
          res.result === "accepted"
            ? `${pseudo} et toi êtes amis !`
            : res.result === "already"
              ? "Déjà fait !"
              : `Demande envoyée à ${pseudo}`,
      });
      setQuery("");
      await refresh();
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible pour l'instant." });
    }
  }

  async function accept(id: string) {
    await api.post(`/friends/${id}/accept`).catch(() => {});
    await refresh();
  }

  async function remove(id: string) {
    await api.del(`/friends/${id}`).catch(() => {});
    await refresh();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length >= 3) void add(query.trim());
  }

  const incoming = friends.filter((f) => f.status === "incoming");
  const outgoing = friends.filter((f) => f.status === "outgoing");
  const accepted = friends.filter((f) => f.status === "accepted").sort((a, b) => Number(b.user.id in online) - Number(a.user.id in online));
  const known = new Set(friends.map((f) => f.user.id));

  return (
    <div className="felt page">
      <AppHeader />
      <main className="narrow">
        <div className="page-heading">
          <h1>Amis</h1>
        </div>

        <section>
          <form className="search-row" onSubmit={submit}>
            <Icon name="search" />
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Le pseudo d'un ami…"
              aria-label="Pseudo à ajouter"
            />
          </form>
          {results.length > 0 && (
            <ul className="rows search-results">
              {results.map((u) => (
                <li key={u.id} className="row">
                  <Link href={`/joueur/${encodeURIComponent(u.pseudo)}`} className="row-who">
                    <Avatar avatar={u.avatar} userId={u.id} photo={u.photo} size={36} />
                    <strong>
                      <PlayerName name={u.pseudo} admin={u.admin} />
                    </strong>
                  </Link>
                  {known.has(u.id) ? (
                    <span className="tag">déjà dans ta liste</span>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => void add(u.pseudo)}>
                      Ajouter
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {incoming.length > 0 && (
          <section className="home-list">
            <h2>Demandes reçues</h2>
            <ul className="rows">
              {incoming.map((f) => (
                <li key={f.user.id} className="row">
                  <span className="row-who">
                    <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={38} />
                    <strong>
                      <PlayerName name={f.user.pseudo} admin={f.user.admin} />
                    </strong>
                  </span>
                  <span className="row-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => void accept(f.user.id)}>
                      Accepter
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => void remove(f.user.id)}>
                      Refuser
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="home-list">
          <h2>
            Mes amis <span className="hint num">{accepted.length}</span>
          </h2>
          {accepted.length === 0 ? (
            <p className="empty">Tape le pseudo d'un ami ci-dessus : il recevra ta demande et devra l'accepter.</p>
          ) : (
            <ul className="rows">
              {accepted.map((f) => {
                const isOnline = f.user.id in online;
                const room = online[f.user.id];
                return (
                  <li key={f.user.id} className="row">
                    <Link href={`/joueur/${encodeURIComponent(f.user.pseudo)}`} className="row-who">
                      <span className="avatar-wrap">
                        <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={40} />
                        <span className={`dot presence-dot ${isOnline ? (room ? "dot-playing" : "dot-online") : ""}`} />
                      </span>
                      <span className="row-text">
                        <strong>
                          <PlayerName name={f.user.pseudo} admin={f.user.admin} />
                        </strong>
                        <span className="hint">{!isOnline ? "hors ligne" : room ? `à la table ${room.code}` : "en ligne"}</span>
                      </span>
                    </Link>
                    <span className="row-actions">
                      {room && (
                        <Link href={`/salon/${room.code}`} className="btn btn-sm">
                          Rejoindre
                        </Link>
                      )}
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => void remove(f.user.id)}
                        aria-label={`Retirer ${f.user.pseudo}`}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {outgoing.length > 0 && (
          <section className="home-list">
            <h2>Demandes envoyées</h2>
            <ul className="rows">
              {outgoing.map((f) => (
                <li key={f.user.id} className="row">
                  <span className="row-who">
                    <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={34} />
                    <strong>
                      <PlayerName name={f.user.pseudo} admin={f.user.admin} />
                    </strong>
                  </span>
                  <button className="btn btn-sm btn-ghost" onClick={() => void remove(f.user.id)}>
                    Annuler
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
