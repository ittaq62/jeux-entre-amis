import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { MIN_PLAYERS, type LobbyClientMessage, type LobbyRoom, type SeatView } from "../../shared/protocol.ts";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton, Modal, Options } from "../components/ui.tsx";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";

export interface TableLobbyProps {
  room: LobbyRoom;
  send: (msg: LobbyClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
  /** Le bloc des règles, propre à chaque jeu */
  rules: ReactNode;
  /** Titre du partage, par exemple « Viens jouer au UNO » */
  shareTitle: string;
  startLabel: string;
  /** Ce qu'on lit en attendant l'hôte, par exemple « va distribuer les cartes » */
  hostWillStart: string;
  canStart?: boolean;
  startHint?: string;
  /** Précision sous le nom d'un joueur (équipe…) */
  seatNote?: (seat: SeatView, index: number) => string | null;
}

/** Le salon d'attente, commun à tous les jeux : ticket du code, places autour de la table, invitations, départ. */
export function TableLobby({
  room,
  send,
  unread,
  onOpenChat,
  onLeave,
  onBackToGame,
  rules,
  shareTitle,
  startLabel,
  hostWillStart,
  canStart = room.seats.length >= MIN_PLAYERS,
  startHint = "Il faut au moins deux joueurs : ajoute un bot pour commencer tout de suite.",
  seatNote,
}: TableLobbyProps) {
  const isHost = room.you.isHost;
  const [inviteOpen, setInviteOpen] = useState(false);
  const link = `${location.origin}/salon/${room.code}`;
  const emptySeats = Math.max(0, room.settings.maxPlayers - room.seats.length);
  const finished = room.status === "finished";
  const seated = room.you.seatId !== null;
  const host = room.seats.find((x) => x.isHost);

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: shareTitle, text: `Rejoins ma table, code ${room.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast({ title: "Lien copié", body: "Colle-le sur Discord pour inviter tes amis." });
      }
    } catch {
      // partage annule
    }
  }

  return (
    <div className="felt page lobby">
      <header className="page-top">
        <button className="btn btn-ghost btn-icon" onClick={onLeave} aria-label="Quitter la table">
          <Icon name="back" />
        </button>
        <h1 className="page-title">{finished ? "Fin de partie" : host && !isHost ? `Table de ${host.name}` : "Ta table"}</h1>
        <div className="page-top-actions">
          {room.you.isAdmin && (
            <ConfirmButton className="btn btn-sm btn-danger" confirm="Fermer pour tous ?" onConfirm={() => send({ t: "close" })}>
              Fermer la table
            </ConfirmButton>
          )}
          <button className="btn btn-ghost btn-icon chat-toggle" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" />
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
        </div>
      </header>

      <main className="lobby-body">
        <div className="lobby-left">
          <section aria-label="Code de la table">
            <div className="ticket-wrap">
              <div className="ticket">
                <span className="ticket-label">
                  <strong>Table</strong>
                  {room.settings.visibility === "public" ? "ouverte à tous" : "entre amis"}
                </span>
                <span className="ticket-code" aria-label={`Code ${room.code.split("").join(" ")}`}>
                  {room.code}
                </span>
              </div>
            </div>
            <div className="lobby-invite">
              <button className="btn btn-primary" onClick={() => void share()}>
                Envoyer le lien
              </button>
              <button className="btn" onClick={() => setInviteOpen(true)}>
                Inviter un ami
              </button>
            </div>
          </section>

          <section className="lobby-section panel">
            <h2>
              Autour de la table
              <span className="hint num">
                {room.seats.length} sur {room.settings.maxPlayers}
              </span>
            </h2>
            <ul className="seat-list">
              {room.seats.map((seat, i) => {
                const note = seatNote?.(seat, i);
                return (
                  <li key={seat.id} className="seat-row">
                    <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={44} />
                    <span className="row-text">
                      <strong>
                        <PlayerName name={seat.name} admin={seat.admin} suffix={seat.id === room.you.seatId ? " (toi)" : undefined} />
                      </strong>
                      <span className="hint">
                        {[note, seat.isHost && "hôte", seat.kind === "bot" && "bot", seat.kind === "human" && !seat.connected && "absent"]
                          .filter(Boolean)
                          .join(", ") || " "}
                      </span>
                    </span>
                    {(isHost || room.you.isAdmin) && seat.id !== room.you.seatId && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          send(seat.kind === "bot" ? { t: "removeSeat", seatId: seat.id } : { t: "kick", userId: seat.userId! })
                        }
                      >
                        {seat.kind === "bot" ? "Retirer" : "Exclure"}
                      </button>
                    )}
                  </li>
                );
              })}
              {Array.from({ length: emptySeats }, (_, i) => (
                <li key={`empty-${i}`} className="seat-row is-empty">
                  <span className="seat-empty-mark" />
                  <span className="row-text">Place libre</span>
                  {isHost && i === 0 && (
                    <button className="btn btn-sm" onClick={() => send({ t: "addBot" })}>
                      Ajouter un bot
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!seated && room.seats.length < room.settings.maxPlayers && (
              <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => send({ t: "sit" })}>
                Prendre une place
              </button>
            )}
            {room.spectators.length > 0 && (
              <p className="hint" style={{ marginTop: 12 }}>
                Regardent la partie : {room.spectators.map((sp) => sp.name).join(", ")}
              </p>
            )}
          </section>
        </div>

        {rules}
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
              {!canStart && <span className="hint">{startHint}</span>}
              <button className="btn btn-primary btn-lg" disabled={!canStart} onClick={() => send({ t: "start" })}>
                {finished ? "Rejouer" : startLabel}
              </button>
            </div>
          ) : (
            <p className="lobby-wait">
              <span className="spinner" /> {host ? `${host.name} ${hostWillStart}…` : "On attend l'hôte…"}
            </p>
          ))}
      </footer>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} code={room.code} link={link} />
    </div>
  );
}

/** En-tête du bloc des règles : qui les a choisies. */
export function RulesHeading({ room }: { room: LobbyRoom }) {
  const host = room.seats.find((x) => x.isHost);
  return (
    <div>
      <h2>Règles de la table</h2>
      {!room.you.isHost && (
        <p className="hint" style={{ margin: "4px 0 0" }}>
          Choisies par {host?.name ?? "l'hôte"}.
        </p>
      )}
    </div>
  );
}

/** Nombre de places et ouverture de la table : les mêmes pour tous les jeux. */
export function TableSize({ room, send, max }: { room: LobbyRoom; send: (msg: LobbyClientMessage) => void; max: number }) {
  const isHost = room.you.isHost;
  return (
    <div className="rules-two">
      <div className="field">
        <span className="field-label">Joueurs au plus</span>
        <div className="stepper">
          <button
            className="btn btn-icon btn-sm"
            disabled={!isHost || room.settings.maxPlayers <= Math.max(MIN_PLAYERS, room.seats.filter((x) => x.kind === "human").length)}
            onClick={() => send({ t: "settings", settings: {}, maxPlayers: room.settings.maxPlayers - 1 })}
            aria-label="Une place de moins"
          >
            −
          </button>
          <strong className="num">{room.settings.maxPlayers}</strong>
          <button
            className="btn btn-icon btn-sm"
            disabled={!isHost || room.settings.maxPlayers >= max}
            onClick={() => send({ t: "settings", settings: {}, maxPlayers: room.settings.maxPlayers + 1 })}
            aria-label="Une place de plus"
          >
            +
          </button>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Qui peut venir</span>
        <Options
          label="Qui peut venir"
          value={room.settings.visibility}
          disabled={!isHost}
          onChange={(visibility) => send({ t: "settings", settings: {}, visibility })}
          options={[
            { value: "private", label: "Mes invités" },
            { value: "public", label: "Tout le monde" },
          ]}
        />
      </div>
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
    void import("qrcode").then((QRCode) =>
      QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#1d1b18", light: "#f2ecdf" } }).then(setQr),
    );
  }
  const available = friends.filter((f) => f.status === "accepted" && f.user.id in online && online[f.user.id]?.code !== code);
  return (
    <Modal open={open} onClose={onClose} title="Inviter à la table">
      <div className="invite-modal">
        {qr && <img src={qr} alt={`QR code de la table ${code}`} className="invite-qr" />}
        <p className="hint center-text" style={{ margin: 0 }}>
          À scanner avec le téléphone, ou :
        </p>
        <button
          className="btn btn-block"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => toast({ title: "Lien copié" }));
          }}
        >
          Copier le lien
        </button>
        <hr className="divider" />
        <p className="field-label" style={{ margin: 0 }}>
          Amis en ligne
        </p>
        {available.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            Aucun ami disponible pour l'instant. <Link href="/amis">Ajouter des amis</Link>
          </p>
        ) : (
          <ul className="rows">
            {available.map((f) => (
              <li key={f.user.id} className="row">
                <span className="row-who">
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
                  {sent.has(f.user.id) ? "Invité" : "Inviter"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
