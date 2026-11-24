import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { APP_NAME } from "../../shared/app.ts";
import type { FriendEntry, PublicUser } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { TableLinks } from "../components/TableLinks.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";

/** Ce que dit une erreur du serveur, ou un message par défaut */
function failure(err: unknown, fallback = "Impossible pour l'instant. Réessaie dans un instant.") {
  toast({ tone: "danger", title: err instanceof ApiError ? err.message : fallback });
}

export function FriendsPage() {
  const friends = useHub((s) => s.friends);
  const online = useHub((s) => s.online);
  const refresh = useHub((s) => s.refreshFriends);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  // La recherche à laquelle `results` répond : tant qu'elle n'a pas répondu, on ne dit pas « personne »
  const [searched, setSearched] = useState("");
  const [removing, setRemoving] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched("");
      return;
    }
    const t = setTimeout(() => {
      api
        .get<{ users: PublicUser[] }>(`/users/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.users))
        .catch(() => setResults([]))
        .finally(() => setSearched(q));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function add(pseudo: string) {
    setBusy(pseudo);
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
      failure(err);
    } finally {
      setBusy(null);
    }
  }

  async function accept(user: PublicUser) {
    setBusy(user.id);
    try {
      await api.post(`/friends/${user.id}/accept`);
      toast({ title: `${user.pseudo} et toi êtes amis !` });
    } catch (err) {
      failure(err);
    }
    await refresh();
    setBusy(null);
  }

  async function remove(user: PublicUser) {
    setBusy(user.id);
    try {
      await api.del(`/friends/${user.id}`);
    } catch (err) {
      failure(err);
    }
    await refresh();
    setBusy(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length >= 3) void add(query.trim());
  }

  const incoming = friends.filter((f) => f.status === "incoming");
  const outgoing = friends.filter((f) => f.status === "outgoing");
  const accepted = friends.filter((f) => f.status === "accepted").sort((a, b) => Number(b.user.id in online) - Number(a.user.id in online));
  const known = new Map<string, FriendEntry["status"]>(friends.map((f) => [f.user.id, f.status]));
  const q = query.trim();
  const nobody = q.length >= 2 && searched === q && results.length === 0;

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
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Le pseudo d'un ami…"
              aria-label="Pseudo à ajouter"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </form>
          {results.length > 0 && (
            <ul className="rows search-results">
              {results.map((u) => {
                const status = known.get(u.id);
                return (
                  <li key={u.id} className="row">
                    <Link href={`/joueur/${encodeURIComponent(u.pseudo)}`} className="row-who">
                      <Avatar avatar={u.avatar} userId={u.id} photo={u.photo} size={36} />
                      <strong>
                        <PlayerName name={u.pseudo} admin={u.admin} />
                      </strong>
                    </Link>
                    {status === "accepted" ? (
                      <span className="tag tag-strong">Ami</span>
                    ) : status === "outgoing" ? (
                      <span className="tag">Demande envoyée</span>
                    ) : status === "incoming" ? (
                      <button className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void accept(u)}>
                        Accepter sa demande
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void add(u.pseudo)}>
                        Ajouter
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {nobody && (
            <p className="empty" role="status">
              Personne ne s'appelle « {q} ». Vérifie l'orthographe, ou envoie-lui le lien du site plus bas.
            </p>
          )}
        </section>

        {incoming.length > 0 && (
          <section className="home-list">
            <h2>Demandes reçues</h2>
            <ul className="rows">
              {incoming.map((f) => (
                <li key={f.user.id} className="row">
                  <Link href={`/joueur/${encodeURIComponent(f.user.pseudo)}`} className="row-who">
                    <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={38} />
                    <strong>
                      <PlayerName name={f.user.pseudo} admin={f.user.admin} />
                    </strong>
                  </Link>
                  <span className="row-actions">
                    <button className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void accept(f.user)}>
                      Accepter
                    </button>
                    <button className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void remove(f.user)}>
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
            <p className="empty">
              {outgoing.length > 0
                ? "Ta demande attend sa réponse : dès qu'elle est acceptée, ton ami apparaît ici, avec sa table quand il joue."
                : "Tape le pseudo d'un ami ci-dessus : il recevra ta demande et devra l'accepter."}
            </p>
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
                      {room && <TableLinks code={room.code} game={room.game} status={room.status} lateJoin={room.lateJoin} />}
                      {/* Un peu à l'écart des boutons de la table, et une confirmation : on ne retire pas un ami par mégarde */}
                      <button
                        className="btn btn-sm btn-ghost btn-icon friend-remove"
                        disabled={busy !== null}
                        onClick={() => setRemoving(f.user)}
                        aria-label={`Retirer ${f.user.pseudo} de mes amis`}
                        title="Retirer de mes amis"
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
                  <Link href={`/joueur/${encodeURIComponent(f.user.pseudo)}`} className="row-who">
                    <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={34} />
                    <strong>
                      <PlayerName name={f.user.pseudo} admin={f.user.admin} />
                    </strong>
                  </Link>
                  <button className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void remove(f.user)}>
                    Annuler
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <InviteToSite />
      </main>

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Retirer ${removing.pseudo} de tes amis ?` : undefined}
      >
        {removing && (
          <div className="stack">
            <p>Vous ne verrez plus quand l'autre est en ligne ni à quelle table il joue. Tu pourras lui redemander plus tard.</p>
            <div className="row-actions">
              <button
                className="btn btn-danger"
                onClick={() => {
                  const user = removing;
                  setRemoving(null);
                  void remove(user);
                }}
              >
                Retirer
              </button>
              <button className="btn" onClick={() => setRemoving(null)} autoFocus>
                Garder
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Un ami qui n'a pas encore de compte : le lien du site, à envoyer (ou à copier sur un ordinateur) */
function InviteToSite() {
  const link = window.location.origin;
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: APP_NAME,
          text: `Viens jouer avec moi sur ${APP_NAME} : il suffit de ton adresse email.`,
          url: link,
        });
      } else {
        await navigator.clipboard.writeText(link);
        toast({ title: "Lien du site copié" });
      }
    } catch {
      // Partage annulé : rien à dire
    }
  }
  return (
    <section className="home-list invite-site">
      <h2>Faire venir un ami</h2>
      <p className="empty">
        Il n'a pas encore de compte ? Envoie-lui le lien du site : son adresse email suffit pour s'inscrire, puis tu le retrouves ici par
        son pseudo.
      </p>
      <div className="row-actions">
        <button className="btn btn-sm" onClick={() => void share()}>
          <Icon name="share" size={16} /> Envoyer le lien du site
        </button>
      </div>
    </section>
  );
}
