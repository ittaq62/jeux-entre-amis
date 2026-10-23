import { motion } from "motion/react";
import { useState } from "react";
import { Link } from "wouter";
import QRCode from "qrcode";
import { effectiveRules, type EndMode, type UnoSettings } from "../../shared/games/uno/engine.ts";
import { MAX_PLAYERS, MIN_PLAYERS, type RoomClientMessage, type RoomView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal, Segmented, Switch } from "../components/ui.tsx";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";

interface LobbyProps {
  room: RoomView;
  send: (msg: RoomClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

const HOUSE_RULES: { key: "stacking" | "drawUntilPlayable" | "sevenZero" | "jumpIn"; label: string; desc: string }[] = [
  { key: "stacking", label: "Cumul des +2 / +4", desc: "On renvoie une carte « + » au suivant ; le dernier ramasse tout." },
  { key: "drawUntilPlayable", label: "Piocher jusqu'à pouvoir jouer", desc: "On pioche tant qu'aucune carte n'est jouable." },
  { key: "sevenZero", label: "Règle du 7-0", desc: "7 : échange ta main avec qui tu veux. 0 : toutes les mains tournent." },
  { key: "jumpIn", label: "Interception", desc: "Une carte strictement identique peut être jouée hors de son tour." },
];

export function RoomLobby({ room, send, unread, onOpenChat, onLeave, onBackToGame }: LobbyProps) {
  const s = room.settings.uno;
  const isHost = room.you.isHost;
  const rules = effectiveRules(s);
  const [inviteOpen, setInviteOpen] = useState(false);
  const link = `${location.origin}/salon/${room.code}`;
  const emptySeats = Math.max(0, room.settings.maxPlayers - room.seats.length);
  const update = (patch: Partial<UnoSettings>) => send({ t: "settings", settings: patch });
  const canStart = room.seats.length >= MIN_PLAYERS;
  const finished = room.status === "finished";
  const seated = room.you.seatId !== null;

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Viens jouer au UNO !", text: `Rejoins ma table, code ${room.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast({ icon: "🔗", title: "Lien copié !", body: "Colle-le sur Discord pour inviter tes amis." });
      }
    } catch {
      // partage annule
    }
  }

  return (
    <div className="felt page lobby">
      <header className="page-top">
        <button className="btn btn-ghost btn-icon" onClick={onLeave} aria-label="Quitter le salon">
          <Icon name="back" />
        </button>
        <h1 className="page-title">{finished ? "Fin de partie" : "Salon"}</h1>
        <div className="page-top-actions">
          <button className="btn btn-ghost btn-icon chat-toggle" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" />
            {unread > 0 && <span className="badge badge-red">{unread}</span>}
          </button>
        </div>
      </header>

      <main className="lobby-body">
        <section className="lobby-code panel panel-pad">
          <div>
            <p className="eyebrow">{room.settings.visibility === "public" ? "Salon public" : "Salon privé"}</p>
            <div className="code-tiles" aria-label={`Code du salon ${room.code}`}>
              {room.code.split("").map((ch, i) => (
                <motion.span key={i} className="code-tile" initial={{ rotateX: 90 }} animate={{ rotateX: 0 }} transition={{ delay: i * 0.08 }}>
                  {ch}
                </motion.span>
              ))}
            </div>
            <p className="hint">Donne ce code à tes amis, ou envoie-leur le lien.</p>
          </div>
          <div className="lobby-code-actions">
            <button className="btn btn-primary" onClick={() => void share()}>
              <Icon name="share" size={18} /> Inviter
            </button>
            <button className="btn" onClick={() => setInviteOpen(true)}>
              <Icon name="users" size={18} /> Amis & QR code
            </button>
          </div>
        </section>

        <div className="lobby-grid">
          <section className="panel panel-pad">
            <div className="section-head">
              <h3>À table</h3>
              <span className="chip">
                {room.seats.length}/{room.settings.maxPlayers}
              </span>
            </div>
            <ul className="seat-grid">
              {room.seats.map((seat) => (
                <motion.li key={seat.id} className="seat-card" layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={52} />
                  <div className="seat-card-text">
                    <strong>
                      {seat.name}
                      {seat.id === room.you.seatId && <span className="hint"> (toi)</span>}
                    </strong>
                    <span className="seat-card-tags">
                      {seat.isHost && (
                        <span className="chip chip-gold">
                          <Icon name="crown" size={12} /> Hôte
                        </span>
                      )}
                      {seat.kind === "bot" && (
                        <span className="chip">
                          <Icon name="bot" size={12} /> Bot
                        </span>
                      )}
                      {seat.kind === "human" && !seat.connected && <span className="chip">absent</span>}
                    </span>
                  </div>
                  {isHost && seat.id !== room.you.seatId && (
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      aria-label={`Retirer ${seat.name}`}
                      onClick={() => send(seat.kind === "bot" ? { t: "removeSeat", seatId: seat.id } : { t: "kick", userId: seat.userId! })}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </motion.li>
              ))}
              {Array.from({ length: emptySeats }, (_, i) => (
                <li key={`empty-${i}`} className="seat-card is-empty">
                  {isHost && i === 0 ? (
                    <button className="btn btn-sm btn-ghost" onClick={() => send({ t: "addBot" })}>
                      <Icon name="bot" size={16} /> Ajouter un bot
                    </button>
                  ) : (
                    <span className="hint">Place libre</span>
                  )}
                </li>
              ))}
            </ul>
            {!seated && room.seats.length < room.settings.maxPlayers && (
              <button className="btn btn-primary btn-block" onClick={() => send({ t: "sit" })}>
                Prendre une place
              </button>
            )}
            {room.spectators.length > 0 && <p className="hint">Spectateurs : {room.spectators.map((sp) => sp.name).join(", ")}</p>}
          </section>

          <section className="panel panel-pad lobby-rules">
            <div className="section-head">
              <h3>Règles</h3>
              {!isHost && <span className="hint">choisies par l'hôte</span>}
            </div>

            <div className="field">
              <span className="field-label">Version</span>
              <Segmented
                value={s.variant}
                disabled={!isHost}
                onChange={(variant) => update({ variant })}
                options={[
                  { value: "classic", label: "Classique" },
                  { value: "nomercy", label: "No Mercy 💀" },
                ]}
              />
              {s.variant === "nomercy" && (
                <p className="hint">168 cartes, +6, +10, roulette, défausse tout… Cumul obligatoire et éliminé à 25 cartes.</p>
              )}
            </div>

            <div className="rule-list">
              {HOUSE_RULES.map((r) => {
                const forced = rules.noMercy && r.key !== "jumpIn";
                return (
                  <label key={r.key} className={`rule-row ${forced ? "is-forced" : ""}`}>
                    <span>
                      <strong>{r.label}</strong>
                      <span className="hint">{forced ? "Toujours actif en No Mercy." : r.desc}</span>
                    </span>
                    <Switch label={r.label} checked={forced || s[r.key]} disabled={!isHost || forced} onChange={(v) => update({ [r.key]: v })} />
                  </label>
                );
              })}
            </div>

            <div className="field">
              <span className="field-label">Fin de partie</span>
              <Segmented<EndMode>
                value={s.endMode}
                disabled={!isHost}
                onChange={(endMode) => update({ endMode, ...(endMode === "points" ? { targetScore: rules.noMercy ? 1000 : 500 } : {}) })}
                options={[
                  { value: "first", label: "Premier qui finit" },
                  { value: "ranking", label: "Classement complet" },
                  { value: "points", label: "Aux points" },
                ]}
              />
              {s.endMode === "points" && (
                <Segmented
                  value={s.targetScore}
                  disabled={!isHost}
                  onChange={(targetScore) => update({ targetScore })}
                  options={[200, 300, 500, 1000].map((v) => ({ value: v, label: `${v} pts` }))}
                />
              )}
            </div>

            <div className="field">
              <span className="field-label">Temps par tour</span>
              <Segmented
                value={s.turnSeconds}
                disabled={!isHost}
                onChange={(turnSeconds) => update({ turnSeconds })}
                options={[
                  { value: 15, label: "15 s" },
                  { value: 30, label: "30 s" },
                  { value: 60, label: "60 s" },
                  { value: 0, label: "Sans" },
                ]}
              />
            </div>

            <div className="lobby-two">
              <div className="field">
                <span className="field-label">Joueurs max</span>
                <div className="stepper">
                  <button
                    className="btn btn-icon btn-sm"
                    disabled={!isHost || room.settings.maxPlayers <= Math.max(MIN_PLAYERS, room.seats.filter((x) => x.kind === "human").length)}
                    onClick={() => send({ t: "settings", settings: {}, maxPlayers: room.settings.maxPlayers - 1 })}
                    aria-label="Moins de joueurs"
                  >
                    −
                  </button>
                  <strong>{room.settings.maxPlayers}</strong>
                  <button
                    className="btn btn-icon btn-sm"
                    disabled={!isHost || room.settings.maxPlayers >= MAX_PLAYERS}
                    onClick={() => send({ t: "settings", settings: {}, maxPlayers: room.settings.maxPlayers + 1 })}
                    aria-label="Plus de joueurs"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="field">
                <span className="field-label">Visibilité</span>
                <Segmented
                  value={room.settings.visibility}
                  disabled={!isHost}
                  onChange={(visibility) => send({ t: "settings", settings: {}, visibility })}
                  options={[
                    { value: "private", label: "Privé" },
                    { value: "public", label: "Public" },
                  ]}
                />
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="lobby-footer">
        {onBackToGame && (
          <button className="btn btn-lg" onClick={onBackToGame}>
            Retour à la partie
          </button>
        )}
        {room.status !== "playing" &&
          (isHost ? (
            <div className="lobby-start">
              {!canStart && <span className="hint">Il faut au moins 2 joueurs : ajoute un bot pour jouer tout de suite.</span>}
              <motion.button className="btn btn-primary btn-lg" disabled={!canStart} onClick={() => send({ t: "start" })} whileTap={{ scale: 0.96 }}>
                <Icon name="play" size={18} /> {finished ? "Nouvelle partie" : "Lancer la partie"}
              </motion.button>
            </div>
          ) : (
            <p className="lobby-wait">
              <span className="spinner" /> En attente de l'hôte…
            </p>
          ))}
      </footer>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} code={room.code} link={link} />
    </div>
  );
}

function InviteModal({ open, onClose, code, link }: { open: boolean; onClose: () => void; code: string; link: string }) {
  const friends = useHub((s) => s.friends);
  const online = useHub((s) => s.online);
  const invite = useHub((s) => s.invite);
  const [qr, setQr] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  if (open && !qr) {
    void QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#0c1f18", light: "#fbf5e6" } }).then(setQr);
  }
  const available = friends.filter((f) => f.status === "accepted" && f.user.id in online && online[f.user.id]?.code !== code);
  return (
    <Modal open={open} onClose={onClose} title="Inviter des joueurs">
      <div className="invite-modal">
        {qr && <img src={qr} alt={`QR code du salon ${code}`} className="invite-qr" />}
        <button
          className="btn btn-block"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => toast({ icon: "🔗", title: "Lien copié !" }));
          }}
        >
          <Icon name="copy" size={18} /> Copier le lien
        </button>
        <hr className="divider" />
        <p className="field-label">Amis en ligne</p>
        {available.length === 0 ? (
          <p className="hint">
            Aucun ami disponible pour l'instant. <Link href="/amis">Ajouter des amis</Link>
          </p>
        ) : (
          <ul className="friend-list">
            {available.map((f) => (
              <li key={f.user.id} className="friend-row">
                <span className="friend-who">
                  <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={34} />
                  <strong>{f.user.pseudo}</strong>
                </span>
                <button
                  className="btn btn-sm"
                  disabled={sent.has(f.user.id)}
                  onClick={() => {
                    invite(f.user.id, code);
                    setSent(new Set(sent).add(f.user.id));
                  }}
                >
                  {sent.has(f.user.id) ? "Invité ✓" : "Inviter"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
