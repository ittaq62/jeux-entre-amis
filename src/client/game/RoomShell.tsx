import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { CLOSED_TOUR, isClosedMessage } from "../../shared/lateJoin.ts";
import type { LobbyRoom } from "../../shared/protocol.ts";
import { REPLACED_MESSAGE } from "../lib/socket.ts";
import { ArrivalChoice } from "./ArrivalChoice.tsx";
import { ChatPanel } from "./ChatPanel.tsx";

export function RoomError({ message }: { message: string }) {
  // Le même compte joue maintenant sur un autre appareil : on peut reprendre la place ici (l'autre sera prévenu à son tour)
  const elsewhere = message === REPLACED_MESSAGE;
  // Partie lancée, porte fermée en cours de route : on dit pourquoi, et comment entrer la prochaine fois
  const closed = isClosedMessage(message);
  return (
    <div className="felt center-screen">
      <div className="panel panel-pad stack center-text" style={{ maxWidth: 420 }}>
        <h2>{elsewhere ? "Tu joues ailleurs" : closed ? (message === CLOSED_TOUR ? "Tournée fermée" : "Partie fermée") : "Oups"}</h2>
        <p className="hint">{message}</p>
        {closed && (
          <p className="hint">
            Pour entrer quand même, demande à un joueur de t'ajouter en ami, ou à l'hôte d'ouvrir{" "}
            {message === CLOSED_TOUR ? "la tournée" : "la table"} en cours de route.
          </p>
        )}
        {elsewhere && (
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Jouer ici
          </button>
        )}
        <Link href="/" className={elsewhere ? "btn btn-ghost" : "btn btn-primary"}>
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}

/**
 * Ce que les tables ont en commun autour du jeu : la discussion, le bandeau de reconnexion, et le choix de qui arrive
 * pendant la partie (`room` : la table ; pas à une table de tournée, c'est la tournée qui le propose).
 */
export function RoomShell({
  children,
  chat,
  meId,
  chatOpen,
  onCloseChat,
  onSend,
  reconnecting,
  room,
  onSit,
}: {
  children: ReactNode;
  chat: Parameters<typeof ChatPanel>[0]["messages"];
  meId: string;
  chatOpen: boolean;
  onCloseChat: () => void;
  onSend: (text: string) => void;
  reconnecting: boolean;
  room?: LobbyRoom & { tour?: string | null };
  onSit?: () => void;
}) {
  return (
    <>
      {children}
      <ChatPanel open={chatOpen} messages={chat} meId={meId} onSend={onSend} onClose={onCloseChat} />
      {reconnecting && <div className="conn-banner">Connexion perdue, on se reconnecte…</div>}
      {room && !room.tour && onSit && (
        <ArrivalChoice
          code={room.code}
          game={room.game}
          started={room.status === "playing"}
          seated={room.you.seatId !== null}
          lateJoin={Boolean(room.settings.lateJoin)}
          room={room.seats.length < room.settings.maxPlayers || room.seats.some((s) => s.kind === "bot")}
          onJoin={onSit}
        />
      )}
    </>
  );
}

/** Compte les messages pas encore lus quand la discussion est fermée. */
export function useUnread(chat: { system?: boolean; userId: string | null }[], chatOpen: boolean, meId: string | undefined) {
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (chatOpen) setSeen(chat.length);
  }, [chatOpen, chat.length]);
  return chatOpen ? 0 : chat.slice(seen).filter((m) => !m.system && m.userId !== meId).length;
}
