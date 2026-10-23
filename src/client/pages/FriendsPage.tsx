import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import type { PublicUser } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
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
      toast({ icon: "👋", title: res.result === "accepted" ? `${pseudo} et toi êtes amis !` : res.result === "already" ? "Déjà fait !" : `Demande envoyée à ${pseudo}` });
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

        <section className="panel panel-pad">
          <form className="search-row" onSubmit={submit}>
            <Icon name="search" />
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un pseudo…" aria-label="Pseudo à ajouter" />
          </form>
          {results.length > 0 && (
            <ul className="friend-list search-results">
              {results.map((u) => (
                <li key={u.id} className="friend-row">
                  <Link href={`/joueur/${encodeURIComponent(u.pseudo)}`} className="friend-who">
                    <Avatar avatar={u.avatar} userId={u.id} photo={u.photo} size={36} />
                    <strong>{u.pseudo}</strong>
                  </Link>
                  {known.has(u.id) ? (
                    <span className="chip">déjà dans ta liste</span>
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
          <section className="panel panel-pad">
            <h3 className="section-title">Demandes reçues</h3>
            <ul className="friend-list">
              {incoming.map((f) => (
                <li key={f.user.id} className="friend-row">
                  <span className="friend-who">
                    <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={38} />
                    <strong>{f.user.pseudo}</strong>
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

        <section className="panel panel-pad">
          <h3 className="section-title">
            Mes amis <span className="hint">{accepted.length}</span>
          </h3>
          {accepted.length === 0 ? (
            <p className="empty">Cherche le pseudo de tes amis ci-dessus pour les ajouter. Ils devront accepter ta demande.</p>
          ) : (
            <ul className="friend-list">
              {accepted.map((f) => {
                const isOnline = f.user.id in online;
                const room = online[f.user.id];
                return (
                  <li key={f.user.id} className="friend-row">
                    <Link href={`/joueur/${encodeURIComponent(f.user.pseudo)}`} className="friend-who">
                      <span className="avatar-wrap">
                        <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={40} />
                        <span className={`dot presence-dot ${isOnline ? (room ? "dot-playing" : "dot-online") : ""}`} />
                      </span>
                      <span className="friend-text">
                        <strong>{f.user.pseudo}</strong>
                        <span className="hint">{!isOnline ? "Hors ligne" : room ? `Salon ${room.code}` : "En ligne"}</span>
                      </span>
                    </Link>
                    <span className="row-actions">
                      {room && (
                        <Link href={`/salon/${room.code}`} className="btn btn-sm">
                          Rejoindre
                        </Link>
                      )}
                      <button className="btn btn-sm btn-ghost" onClick={() => void remove(f.user.id)} aria-label={`Retirer ${f.user.pseudo}`}>
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
          <section className="panel panel-pad">
            <h3 className="section-title">Demandes envoyées</h3>
            <ul className="friend-list">
              {outgoing.map((f) => (
                <li key={f.user.id} className="friend-row">
                  <span className="friend-who">
                    <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={34} />
                    <strong>{f.user.pseudo}</strong>
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
