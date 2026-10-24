import { motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { isRoomCode, ROOM_CODE_LENGTH } from "../../shared/app.ts";
import type { Card } from "../../shared/games/uno/cards.ts";
import type { RoomSummary, Visibility } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { CardBack, CardFace } from "../components/Card.tsx";
import { Modal } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";
import { useSession } from "../stores/session.ts";

// Quelques cartes posees sur le feutre, a cote de la fiche du jeu
const TABLE_CARDS: { card: Card; x: number; y: number; r: number }[] = [
  { card: { id: 1, kind: "number", color: "blue", value: 9 }, x: 0, y: 26, r: -14 },
  { card: { id: 2, kind: "skip", color: "green" }, x: 62, y: 4, r: -4 },
  { card: { id: 3, kind: "wild4", color: null }, x: 128, y: 18, r: 7 },
  { card: { id: 4, kind: "draw2", color: "red" }, x: 70, y: 112, r: 19 },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Encore debout";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
}

export function HomePage() {
  const user = useSession((s) => s.user)!;
  const [, navigate] = useLocation();
  const lobby = useHub((s) => s.lobby);
  const watchLobby = useHub((s) => s.watchLobby);
  const friends = useHub((s) => s.friends);
  const online = useHub((s) => s.online);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    watchLobby(true);
    return () => watchLobby(false);
  }, [watchLobby]);

  async function quickMatch() {
    setBusy("quick");
    try {
      const res = await api.post<{ code: string; created: boolean }>("/rooms/quick");
      navigate(`/salon/${res.code}`);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible de trouver une partie." });
      setBusy(null);
    }
  }

  async function createRoom(visibility: Visibility) {
    setBusy(visibility);
    try {
      const res = await api.post<{ code: string }>("/rooms", { visibility });
      navigate(`/salon/${res.code}`);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible d'ouvrir la table." });
      setBusy(null);
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!isRoomCode(value)) return toast({ tone: "danger", title: "Un code de table fait 4 lettres." });
    setBusy("join");
    try {
      await api.get(`/rooms/${value}`);
      navigate(`/salon/${value}`);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Table introuvable." });
      setBusy(null);
    }
  }

  const accepted = friends.filter((f) => f.status === "accepted");
  const sortedFriends = accepted.slice().sort((a, b) => Number(b.user.id in online) - Number(a.user.id in online));

  return (
    <div className="felt page">
      <AppHeader />
      <main className="home">
        <h1 className="home-greeting">
          {greeting()}, {user.pseudo}.
        </h1>

        <section className="home-game panel" aria-label="UNO">
          <div className="game-stage" aria-hidden="true">
            <div className="table-scatter">
              {TABLE_CARDS.map(({ card, x, y, r }, i) => (
                <motion.div
                  key={card.id}
                  className="scatter-card"
                  style={{ left: x, top: y }}
                  initial={{ opacity: 0, y: -18, rotate: r - 10 }}
                  animate={{ opacity: 1, y: 0, rotate: r }}
                  transition={{ delay: 0.08 * i, duration: 0.45, ease: [0.2, 0.8, 0.3, 1] }}
                >
                  <CardFace card={card} width={96} />
                </motion.div>
              ))}
              <motion.div
                className="scatter-card scatter-deck"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, duration: 0.45, ease: [0.2, 0.8, 0.3, 1] }}
              >
                <CardBack width={80} />
              </motion.div>
            </div>
          </div>

          <div className="game-sheet">
            <h2 className="game-name">UNO</h2>
            <p className="game-desc">Classique ou No Mercy, de 2 à 8 joueurs. S'il manque du monde, des bots complètent la table.</p>
            <div className="game-actions">
              <button className="btn btn-primary btn-lg" onClick={() => void quickMatch()} disabled={busy !== null}>
                {busy === "quick" && <span className="spinner" />} Partie rapide
              </button>
              <button className="btn btn-lg" onClick={() => setCreateOpen(true)} disabled={busy !== null}>
                Ouvrir une table
              </button>
            </div>
            <form className="join-code" onSubmit={join}>
              <label className="join-label" htmlFor="join-code">
                Un ami t'a donné un code ?
              </label>
              <div className="join-row">
                <input
                  id="join-code"
                  className="input join-input"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z]/g, "")
                        .slice(0, ROOM_CODE_LENGTH),
                    )
                  }
                  placeholder="ABCD"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="btn" disabled={code.length !== ROOM_CODE_LENGTH || busy !== null}>
                  Rejoindre
                </button>
              </div>
            </form>
          </div>
        </section>

        <div className="home-columns">
          <section className="home-list panel">
            <h2>Tables ouvertes</h2>
            {lobby.length === 0 ? (
              <p className="empty">
                Personne n'attend pour l'instant. Lance une partie rapide : les prochains arrivés s'assoiront avec toi.
              </p>
            ) : (
              <ul className="rows">
                {lobby.map((room) => (
                  <RoomRow key={room.code} room={room} />
                ))}
              </ul>
            )}
          </section>

          <section className="home-list panel">
            <h2>
              Tes amis{" "}
              <Link href="/amis" className="heading-link">
                gérer
              </Link>
            </h2>
            {sortedFriends.length === 0 ? (
              <p className="empty">
                Pas encore d'amis ici. <Link href="/amis">Cherche leur pseudo</Link> pour les voir en ligne et les inviter.
              </p>
            ) : (
              <ul className="rows">
                {sortedFriends.slice(0, 8).map((f) => {
                  const isOnline = f.user.id in online;
                  const room = online[f.user.id];
                  return (
                    <li key={f.user.id} className="row">
                      <Link href={`/joueur/${encodeURIComponent(f.user.pseudo)}`} className="row-who">
                        <span className="avatar-wrap">
                          <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={36} />
                          <span className={`dot presence-dot ${isOnline ? (room ? "dot-playing" : "dot-online") : ""}`} />
                        </span>
                        <span className="row-text">
                          <strong>
                            <PlayerName name={f.user.pseudo} admin={f.user.admin} />
                          </strong>
                          <span className="hint">
                            {!isOnline
                              ? "hors ligne"
                              : room
                                ? room.status === "playing"
                                  ? "en pleine partie"
                                  : "à une table"
                                : "en ligne"}
                          </span>
                        </span>
                      </Link>
                      {room && (
                        <Link href={`/salon/${room.code}`} className="btn btn-sm">
                          {room.status === "playing" ? "Regarder" : "Rejoindre"}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Ouvrir une table">
        <div className="create-options">
          <button className="create-option" onClick={() => void createRoom("private")} disabled={busy !== null}>
            <strong>Entre amis</strong>
            <span>Seuls ceux qui ont le code ou le lien peuvent s'asseoir.</span>
          </button>
          <button className="create-option" onClick={() => void createRoom("public")} disabled={busy !== null}>
            <strong>Ouverte à tous</strong>
            <span>La table apparaît dans la liste : n'importe quel joueur peut venir.</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}

function RoomRow({ room }: { room: RoomSummary }) {
  const seats = room.humans + room.bots;
  return (
    <li className="row">
      <span className="room-code">{room.code}</span>
      <span className="row-text">
        <strong>{room.hostName ? `Table de ${room.hostName}` : "Table ouverte"}</strong>
        <span className="hint">
          {room.variant === "nomercy" ? "No Mercy" : "classique"}, {seats} sur {room.maxPlayers}
          {room.status === "playing" ? ", partie en cours" : ""}
        </span>
      </span>
      <Link href={`/salon/${room.code}`} className="btn btn-sm">
        {room.status === "playing" ? "Regarder" : "S'asseoir"}
      </Link>
    </li>
  );
}
