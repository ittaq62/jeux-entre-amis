import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { PSEUDO_MAX } from "../../shared/app.ts";
import {
  ANNOUNCE_MAX,
  BAN_REASON_MAX,
  type AdminGame,
  type AdminOverview,
  type AdminRoom,
  type AdminUser,
  type AdminUserAction,
} from "../../shared/protocol.ts";
import { AdminBadge, PlayerName } from "../components/AdminBadge.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { ConfirmButton, Loading, Modal, timeAgo } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";

const failed = (err: unknown) => toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Ça n'a pas marché." });

export function AdminPage() {
  const me = useSession((s) => s.user)!;
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);

  const loadOverview = useCallback(() => {
    api.get<AdminOverview>("/admin/overview").then(setOverview).catch(failed);
  }, []);

  useEffect(() => {
    if (!me.admin) return;
    loadOverview();
    const t = setInterval(loadOverview, 15_000);
    return () => clearInterval(t);
  }, [me.admin, loadOverview]);

  useEffect(() => {
    if (!me.admin) return;
    const t = setTimeout(() => {
      api
        .get<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(query)}`)
        .then((r) => setUsers(r.users))
        .catch(failed);
    }, 250);
    return () => clearTimeout(t);
  }, [me.admin, query]);

  if (!me.admin)
    return (
      <div className="felt page">
        <AppHeader />
        <p className="empty center-text" style={{ margin: "60px auto" }}>
          Cette page est réservée à l'administrateur du site.
        </p>
      </div>
    );
  if (!overview) return <Loading />;

  const replaceUser = (u: AdminUser) => {
    setUsers((list) => list?.map((x) => (x.user.id === u.user.id ? u : x)) ?? null);
    setSelected(u);
  };
  const removeUser = (id: string) => {
    setUsers((list) => list?.filter((x) => x.user.id !== id) ?? null);
    setSelected(null);
    loadOverview();
  };

  return (
    <div className="felt page">
      <AppHeader />
      <main className="admin">
        <div className="page-heading">
          <h1>Administration</h1>
          <span className="hint">Visible par les admins seulement. Mise à jour toutes les 15 secondes.</span>
        </div>

        <div className="admin-grid">
          <div className="admin-col">
            <section className="panel admin-section">
              <h2 className="panel-title">En ce moment</h2>
              <dl className="ledger">
                <LedgerRow label="Joueurs en ligne" value={overview.online} strong />
                <LedgerRow label="Tables ouvertes" value={overview.rooms.filter((r) => r.status !== "finished").length} />
                <LedgerRow label="Comptes" value={overview.accounts} detail={`${overview.newThisWeek} cette semaine`} />
                <LedgerRow label="Parties jouées" value={overview.games} detail={`${overview.gamesToday} en 24 h`} />
                <LedgerRow label="Comptes suspendus" value={overview.banned} />
              </dl>
            </section>

            <AnnounceSection overview={overview} onChange={loadOverview} />

            <section className="panel admin-section">
              <h2 className="panel-title">
                Tables <span className="hint num">{overview.rooms.length}</span>
              </h2>
              {overview.rooms.length === 0 ? (
                <p className="empty">Aucune table ouverte en ce moment.</p>
              ) : (
                <ul className="rows">
                  {overview.rooms.map((room) => (
                    <RoomLine key={room.code} room={room} onClosed={loadOverview} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="admin-col">
            <section className="panel admin-section">
              <h2 className="panel-title">Joueurs</h2>
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pseudo ou email…"
                aria-label="Chercher un joueur"
              />
              {users === null ? (
                <p className="hint">Chargement…</p>
              ) : users.length === 0 ? (
                <p className="empty">Personne ne correspond.</p>
              ) : (
                <ul className="rows">
                  {users.map((u) => (
                    <li key={u.user.id} className="row">
                      <span className="avatar-wrap">
                        <Avatar avatar={u.user.avatar} userId={u.user.id} photo={u.user.photo} size={36} />
                        <span className={`dot presence-dot ${u.online ? "dot-online" : ""}`} />
                      </span>
                      <span className="row-text">
                        <strong>
                          <PlayerName name={u.pending ? "Sans pseudo" : u.user.pseudo} admin={u.user.admin} />
                        </strong>
                        <span className="hint admin-user-meta">
                          {u.banned && <span className="admin-banned">suspendu</span>}
                          {u.email}, vu {timeAgo(u.lastSeenAt)}
                        </span>
                      </span>
                      <button className="btn btn-sm" onClick={() => setSelected(u)}>
                        Gérer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel admin-section">
              <h2 className="panel-title">Dernières parties</h2>
              {overview.recentGames.length === 0 ? (
                <p className="empty">Aucune partie terminée pour l'instant.</p>
              ) : (
                <ul className="rows">
                  {overview.recentGames.map((g) => (
                    <GameLine key={g.id} game={g} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>

      <Modal open={selected !== null} onClose={() => setSelected(null)} title="Gérer le compte" wide>
        {selected && <UserSheet user={selected} meId={me.id} onUpdated={replaceUser} onDeleted={removeUser} />}
      </Modal>
    </div>
  );
}

function LedgerRow({ label, value, detail, strong }: { label: string; value: number; detail?: string; strong?: boolean }) {
  return (
    <div className={`ledger-row ${strong ? "is-key" : ""}`}>
      <dt>
        {label}
        {detail && <span className="ledger-detail">{detail}</span>}
      </dt>
      <dd className="num">{value.toLocaleString("fr-FR")}</dd>
    </div>
  );
}

function AnnounceSection({ overview, onChange }: { overview: AdminOverview; onChange: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const current = overview.announcement;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post("/admin/announce", { text });
      setText("");
      toast({ title: "Annonce envoyée à tout le site" });
      onChange();
    } catch (err) {
      failed(err);
    }
    setBusy(false);
  }

  async function clear() {
    try {
      await api.del("/admin/announce");
      onChange();
    } catch (err) {
      failed(err);
    }
  }

  return (
    <section className="panel admin-section">
      <h2 className="panel-title">Annonce à tout le site</h2>
      <p className="hint admin-lead">
        Elle s'affiche chez tous les joueurs connectés, et chez ceux qui arrivent dans les trois heures. Pratique pour lancer un tournoi ou
        prévenir d'une coupure.
      </p>
      {current && (
        <div className="admin-announce">
          <p>{current.text}</p>
          <span className="hint">
            Envoyée {timeAgo(current.at)}, visible encore {Math.max(1, Math.round((current.until - Date.now()) / 60_000))} min
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => void clear()}>
            Retirer
          </button>
        </div>
      )}
      <form className="stack-sm admin-announce-form" onSubmit={send}>
        <textarea
          className="input admin-textarea"
          value={text}
          maxLength={ANNOUNCE_MAX}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tournoi de UNO ce soir à 21 h, venez nombreux !"
          aria-label="Texte de l'annonce"
        />
        <div className="admin-form-foot">
          <span className="hint num">
            {text.length} / {ANNOUNCE_MAX}
          </span>
          <button className="btn btn-primary" disabled={busy || !text.trim()}>
            {busy ? <span className="spinner" /> : "Envoyer à tout le monde"}
          </button>
        </div>
      </form>
    </section>
  );
}

function RoomLine({ room, onClosed }: { room: AdminRoom; onClosed: () => void }) {
  const status = room.status === "playing" ? "en partie" : room.status === "lobby" ? "en attente" : "terminée";
  async function close() {
    try {
      await api.del(`/admin/rooms/${room.code}`);
      toast({ title: `Table ${room.code} fermée` });
      onClosed();
    } catch (err) {
      failed(err);
    }
  }
  return (
    <li className="row admin-room">
      <span className="room-code">{room.code}</span>
      <span className="row-text">
        <strong>{room.hostName ? `Table de ${room.hostName}` : "Table sans hôte"}</strong>
        <span className="hint">
          {room.variant === "nomercy" ? "No Mercy" : "classique"}, {room.humans} joueur{room.humans > 1 ? "s" : ""}
          {room.bots > 0 ? ` et ${room.bots} bot${room.bots > 1 ? "s" : ""}` : ""}, {status},{" "}
          {room.visibility === "public" ? "ouverte à tous" : "privée"}
          {room.names.length > 0 && <> : {room.names.join(", ")}</>}
        </span>
      </span>
      <span className="row-actions">
        <Link href={`/salon/${room.code}`} className="btn btn-sm">
          Regarder
        </Link>
        <ConfirmButton className="btn btn-sm btn-danger" confirm="Sûr ?" onConfirm={() => void close()}>
          Fermer
        </ConfirmButton>
      </span>
    </li>
  );
}

function GameLine({ game }: { game: AdminGame }) {
  const [winner, ...others] = game.players;
  return (
    <li className="row">
      <span className="row-text">
        <strong>
          {winner ? `${winner.name}${winner.bot ? " (bot)" : ""} gagne` : "Partie"}, {game.variant === "nomercy" ? "No Mercy" : "classique"}
          {game.rounds > 1 ? `, ${game.rounds} manches` : ""}
        </strong>
        <span className="hint">contre {others.map((p) => `${p.name}${p.bot ? " (bot)" : ""}`).join(", ") || "personne"}</span>
      </span>
      <span className="hint">{timeAgo(game.endedAt)}</span>
    </li>
  );
}

function UserSheet({
  user,
  meId,
  onUpdated,
  onDeleted,
}: {
  user: AdminUser;
  meId: string;
  onUpdated: (u: AdminUser) => void;
  onDeleted: (id: string) => void;
}) {
  const [pseudo, setPseudo] = useState(user.pending ? "" : user.user.pseudo);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const self = user.user.id === meId;
  const isAdmin = Boolean(user.user.admin);

  useEffect(() => {
    setPseudo(user.pending ? "" : user.user.pseudo);
    setReason("");
  }, [user.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action: AdminUserAction, done: string) {
    setBusy(true);
    try {
      const res = await api.post<{ user: AdminUser }>(`/admin/users/${user.user.id}`, action);
      onUpdated(res.user);
      toast({ title: done });
    } catch (err) {
      failed(err);
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/admin/users/${user.user.id}`);
      toast({ title: "Compte supprimé" });
      onDeleted(user.user.id);
    } catch (err) {
      failed(err);
      setBusy(false);
    }
  }

  const since = new Date(user.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="admin-sheet">
      <div className="admin-sheet-head">
        <Avatar avatar={user.user.avatar} userId={user.user.id} photo={user.user.photo} size={64} />
        <div>
          <h3>
            {user.pending ? "Sans pseudo" : user.user.pseudo} {isAdmin && <AdminBadge />}
          </h3>
          <p className="hint">{user.email}</p>
          <p className="hint">
            Inscrit le {since}, vu {timeAgo(user.lastSeenAt)}
            {user.online ? ", en ligne" : ""}. {user.played} partie{user.played > 1 ? "s" : ""}, {user.won} gagnée
            {user.won > 1 ? "s" : ""}, {user.points.toLocaleString("fr-FR")} points.
          </p>
          {!user.pending && (
            <Link href={`/joueur/${encodeURIComponent(user.user.pseudo)}`} className="admin-profile-link">
              Voir son profil
            </Link>
          )}
        </div>
      </div>

      {user.banned && (
        <p className="admin-ban-note">
          Suspendu {timeAgo(user.banned.at)}
          {user.banned.reason ? ` : ${user.banned.reason}` : "."}
        </p>
      )}

      <form
        className="admin-action"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: "rename", pseudo }, "Pseudo changé");
        }}
      >
        <label className="field">
          <span className="field-label">Pseudo</span>
          <span className="join-row">
            <input className="input" value={pseudo} maxLength={PSEUDO_MAX} onChange={(e) => setPseudo(e.target.value)} />
            <button className="btn" disabled={busy || !pseudo.trim() || pseudo === user.user.pseudo}>
              Renommer
            </button>
          </span>
        </label>
      </form>

      <div className="admin-action">
        <span className="field-label">Profil</span>
        <div className="row-actions">
          {user.user.photo > 0 && (
            <ConfirmButton className="btn btn-sm" onConfirm={() => void act({ action: "removePhoto" }, "Photo retirée")} disabled={busy}>
              Retirer la photo
            </ConfirmButton>
          )}
          <ConfirmButton
            className="btn btn-sm"
            onConfirm={() => void act({ action: "resetStats" }, "Statistiques remises à zéro")}
            disabled={busy}
          >
            Remettre stats et points à zéro
          </ConfirmButton>
          {!self && (
            <ConfirmButton
              className="btn btn-sm"
              onConfirm={() => void act({ action: "setAdmin", on: !isAdmin }, isAdmin ? "Rôle d'admin retiré" : "Nommé admin")}
              disabled={busy}
            >
              {isAdmin ? "Retirer le rôle d'admin" : "Nommer admin"}
            </ConfirmButton>
          )}
        </div>
      </div>

      {!self && (
        <div className="admin-action">
          <span className="field-label">Sanctions</span>
          {user.banned ? (
            <div className="row-actions">
              <button className="btn btn-sm" disabled={busy} onClick={() => void act({ action: "unban" }, "Compte réactivé")}>
                Réactiver le compte
              </button>
            </div>
          ) : isAdmin ? (
            <p className="hint">Un admin ne peut pas être suspendu : retire-lui d'abord le rôle.</p>
          ) : (
            <div className="stack-sm">
              <input
                className="input"
                value={reason}
                maxLength={BAN_REASON_MAX}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Raison, gardée pour toi (facultatif)"
                aria-label="Raison de la suspension"
              />
              <p className="hint">Le joueur est déconnecté tout de suite et ne peut plus se reconnecter.</p>
              <div className="row-actions">
                <ConfirmButton
                  className="btn btn-sm btn-danger"
                  confirm="Suspendre ?"
                  onConfirm={() => void act({ action: "ban", reason }, "Compte suspendu")}
                  disabled={busy}
                >
                  Suspendre le compte
                </ConfirmButton>
              </div>
            </div>
          )}
          <div className="row-actions admin-delete">
            <ConfirmButton
              className="btn btn-sm btn-danger"
              confirm="Supprimer pour de bon ?"
              onConfirm={() => void remove()}
              disabled={busy}
            >
              Supprimer le compte
            </ConfirmButton>
            <span className="hint">Efface le compte, ses amis, ses stats et sa photo.</span>
          </div>
        </div>
      )}
    </div>
  );
}
