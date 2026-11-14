import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { REPLACED_MESSAGE } from "../lib/socket.ts";
import { ChatPanel } from "./ChatPanel.tsx";

export function RoomError({ message }: { message: string }) {
  // Le même compte joue maintenant sur un autre appareil : on peut reprendre la place ici (l'autre sera prévenu à son tour)
  const elsewhere = message === REPLACED_MESSAGE;
  return (
    <div className="felt center-screen">
      <div className="panel panel-pad stack center-text" style={{ maxWidth: 420 }}>
        <h2>{elsewhere ? "Tu joues ailleurs" : "Oups"}</h2>
        <p className="hint">{message}</p>
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

/** Ce que les tables ont en commun autour du jeu : la discussion et le bandeau de reconnexion. */
export function RoomShell({
  children,
  chat,
  meId,
  chatOpen,
  onCloseChat,
  onSend,
  reconnecting,
}: {
  children: ReactNode;
  chat: Parameters<typeof ChatPanel>[0]["messages"];
  meId: string;
  chatOpen: boolean;
  onCloseChat: () => void;
  onSend: (text: string) => void;
  reconnecting: boolean;
}) {
  return (
    <>
      {children}
      <ChatPanel open={chatOpen} messages={chat} meId={meId} onSend={onSend} onClose={onCloseChat} />
      {reconnecting && <div className="conn-banner">Connexion perdue, on se reconnecte…</div>}
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
