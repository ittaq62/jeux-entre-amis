import { motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { isRoomCode, ROOM_CODE_LENGTH } from "../../shared/app.ts";
import type { Card } from "../../shared/games/uno/cards.ts";
import type { RoomSummary, Visibility } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { CardBack, CardFace } from "../components/Card.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";
import { useSession } from "../stores/session.ts";

const HERO_CARDS: Card[] = [
  { id: 1, kind: "number", color: "blue", value: 9 },
  { id: 2, kind: "skip", color: "green" },
  { id: 3, kind: "wild4", color: null },
  { id: 4, kind: "draw2", color: "red" },
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
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible de créer le salon." });
      setBusy(null);
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!isRoomCode(value)) return toast({ tone: "danger", title: "Un code de salon fait 4 lettres." });
    setBusy("join");
    try {
      await api.get(`/rooms/${value}`);
      navigate(`/salon/${value}`);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Salon introuvable." });
      setBusy(null);
    }
  }

  const accepted = friends.filter((f) => f.status === "accepted");
  const sortedFriends = accepted.slice().sort((a, b) => Number(b.user.id in online) - Number(a.user.id in online));

  return (
    <div className="felt page">
      <AppHeader />
      <main className="home">
        <section className="home-hero">
          <p className="eyebrow">
            {greeting()}, {user.pseudo}
          </p>
          <h1>On joue à quoi ce soir&nbsp;?</h1>
        </section>

        <section className="feature panel">
          <div className="feature-art" aria-hidden="true">
            <div className="feature-fan">
              {HERO_CARDS.map((card, i) => (
                <motion.div
                  key={card.id}
                  className="feature-card"
                  initial={{ rotate: 0, y: 30, opacity: 0 }}
                  animate={{ rotate: (i - 1.5) * 13, y: Math.abs(i - 1.5) * 9, opacity: 1 }}
                  transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 160, damping: 15 }}
                  whileHover={{ y: -14 }}
                >
                  <CardFace card={card} width={104} />
                </motion.div>
              ))}
            </div>
            <div className="feature-deck">
              <CardBack width={70} />
            </div>
          </div>
          <div className="feature-body">
            <p className="eyebrow">Jeu de cartes · 2 à 8 joueurs</p>
            <h2 className="feature-title">UNO</h2>
            <p className="feature-desc">Classique ou No Mercy, règles maison à la carte, bots pour compléter la table. Pense à crier UNO… ou dénonce les étourdis.</p>
            <div className="feature-actions">
              <button className="btn btn-primary btn-lg" onClick={() => void quickMatch()} disabled={busy !== null}>
                {busy === "quick" ? <span className="spinner" /> : <Icon name="zap" />} Partie rapide
              </button>
              <button className="btn btn-lg" onClick={() => setCreateOpen(true)} disabled={busy !== null}>
                <Icon name="plus" /> Créer un salon
              </button>
            </div>
            <form className="join-code" onSubmit={join}>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, ROOM_CODE_LENGTH))}
                placeholder="CODE"
                aria-label="Code du salon"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button className="btn" disabled={code.length !== ROOM_CODE_LENGTH || busy !== null}>
                Rejoindre
              </button>
            </form>
          </div>
        </section>

        <div className="home-grid">
          <section className="panel panel-pad">
            <div className="section-head">
              <h3>Salons publics</h3>
              <span className="chip">{lobby.length}</span>
            </div>
            {lobby.length === 0 ? (
              <p className="empty">Aucun salon public pour l'instant. Lance une partie rapide : les prochains arrivés te rejoindront.</p>
            ) : (
              <ul className="room-list">
                {lobby.map((room) => (
                  <RoomRow key={room.code} room={room} />
                ))}
              </ul>
            )}
          </section>

          <section className="panel panel-pad">
            <div className="section-head">
              <h3>Amis</h3>
              <Link href="/amis" className="btn btn-sm btn-ghost">
                Gérer
              </Link>
            </div>
            {sortedFriends.length === 0 ? (
              <p className="empty">
                Ajoute tes amis par leur pseudo pour les voir en ligne et les inviter. <Link href="/amis">Ajouter des amis</Link>
              </p>
            ) : (
              <ul className="friend-list">
                {sortedFriends.slice(0, 8).map((f) => {
                  const isOnline = f.user.id in online;
                  const room = online[f.user.id];
                  return (
                    <li key={f.user.id} className="friend-row">
                      <Link href={`/joueur/${encodeURIComponent(f.user.pseudo)}`} className="friend-who">
                        <span className="avatar-wrap">
                          <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={38} />
                          <span className={`dot presence-dot ${isOnline ? (room ? "dot-playing" : "dot-online") : ""}`} />
                        </span>
                        <span className="friend-text">
                          <strong>{f.user.pseudo}</strong>
                          <span className="hint">{!isOnline ? "Hors ligne" : room ? (room.status === "playing" ? "En pleine partie" : "Dans un salon") : "En ligne"}</span>
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

        <section className="coming-soon">
          <span className="coming-soon-icon">🗺️</span>
          <div>
            <strong>Bientôt sur la table</strong>
            <p className="hint">Un jeu de plateau de conquête, à jouer en plusieurs soirées.</p>
          </div>
        </section>
      </main>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau salon">
        <div className="create-options">
          <button className="create-option" onClick={() => void createRoom("private")} disabled={busy !== null}>
            <Icon name="lock" size={26} />
            <strong>Privé</strong>
            <span className="hint">Seuls ceux qui ont le code ou le lien peuvent entrer. Idéal entre amis.</span>
          </button>
          <button className="create-option" onClick={() => void createRoom("public")} disabled={busy !== null}>
            <Icon name="globe" size={26} />
            <strong>Public</strong>
            <span className="hint">Visible dans la liste des salons : n'importe quel joueur peut s'asseoir.</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}

function RoomRow({ room }: { room: RoomSummary }) {
  const seats = room.humans + room.bots;
  return (
    <li className="room-row">
      <div className="room-code-mini">{room.code}</div>
      <div className="room-info">
        <strong>{room.hostName ? `Table de ${room.hostName}` : "Table ouverte"}</strong>
        <span className="hint">
          {room.variant === "nomercy" ? "No Mercy" : "Classique"} · {seats}/{room.maxPlayers} joueurs
          {room.status === "playing" ? " · en cours" : ""}
        </span>
      </div>
      <Link href={`/salon/${room.code}`} className="btn btn-sm">
        {room.status === "playing" ? "Regarder" : "Rejoindre"}
      </Link>
    </li>
  );
}
