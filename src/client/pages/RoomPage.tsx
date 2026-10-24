import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChatPanel } from "../game/ChatPanel.tsx";
import { RoomLobby } from "../game/RoomLobby.tsx";
import { UnoTable } from "../game/UnoTable.tsx";
import { useRoom } from "../game/useRoom.ts";
import { Loading } from "../components/ui.tsx";
import { preloadSounds } from "../lib/sound.ts";

export function RoomPage({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const upper = code.toUpperCase();
  const { view, status, chat, emotes, fatal, send, serverOffset, me } = useRoom(upper);
  const [chatOpen, setChatOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const lastStatus = useRef(view?.status);

  useEffect(() => preloadSounds(), []);

  // Quand une partie demarre, on bascule sur la table
  useEffect(() => {
    if (view && lastStatus.current !== "playing" && view.status === "playing") setLobbyOpen(false);
    lastStatus.current = view?.status;
  }, [view]);

  useEffect(() => {
    if (chatOpen) setSeen(chat.length);
  }, [chatOpen, chat.length]);

  const unread = chatOpen ? 0 : chat.slice(seen).filter((m) => !m.system && m.userId !== me?.id).length;

  if (fatal) {
    return (
      <div className="felt center-screen">
        <div className="panel panel-pad stack center-text" style={{ maxWidth: 420 }}>
          <h2>Oups</h2>
          <p className="hint">{fatal}</p>
          <Link href="/" className="btn btn-primary">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion au salon…" : "Arrivée à la table…"} />;

  const leave = () => {
    send({ t: "leave" });
    navigate("/");
  };

  const showTable = view.uno !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen;

  return (
    <>
      {showTable ? (
        <UnoTable
          room={view}
          send={send}
          emotes={emotes}
          serverOffset={serverOffset}
          unread={unread}
          onOpenChat={() => setChatOpen(true)}
          onShowLobby={() => setLobbyOpen(true)}
          onLeave={leave}
        />
      ) : (
        <RoomLobby
          room={view}
          send={send}
          unread={unread}
          onOpenChat={() => setChatOpen(true)}
          onLeave={leave}
          onBackToGame={view.status === "playing" ? () => setLobbyOpen(false) : undefined}
        />
      )}
      <ChatPanel
        open={chatOpen}
        messages={chat}
        meId={me?.id ?? ""}
        onSend={(text) => send({ t: "chat", text })}
        onClose={() => setChatOpen(false)}
      />
      {status === "reconnecting" && <div className="conn-banner">Connexion perdue, on se reconnecte…</div>}
    </>
  );
}
