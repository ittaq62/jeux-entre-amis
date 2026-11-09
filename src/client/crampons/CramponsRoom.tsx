import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { CramponsLobby } from "./CramponsLobby.tsx";
import { CramponsMatch } from "./CramponsMatch.tsx";
import { useCramponsRoom } from "./useCramponsRoom.ts";
import "./crampons.css";

/** Une table de Crampons : le salon, puis le match. */
export function CramponsRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, fatal, send, me, listeners } = useCramponsRoom(code);
  const [chatOpen, setChatOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const lastStatus = useRef(view?.status);
  const unread = useUnread(chat, chatOpen, me?.id);

  useEffect(() => {
    if (view && lastStatus.current !== "playing" && view.status === "playing") setLobbyOpen(false);
    lastStatus.current = view?.status;
  }, [view]);

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion au stade…" : "Arrivée au stade…"} />;

  const leave = () => {
    send({ t: "leave" });
    navigate("/");
  };
  const showMatch = view.crampons !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen;

  return (
    <RoomShell
      chat={chat}
      meId={me?.id ?? ""}
      chatOpen={chatOpen}
      onCloseChat={() => setChatOpen(false)}
      onSend={(text) => send({ t: "chat", text })}
      reconnecting={status === "reconnecting"}
    >
      {showMatch ? (
        <CramponsMatch
          room={view}
          send={send}
          listeners={listeners}
          onLeave={leave}
          onOpenChat={() => setChatOpen(true)}
          unread={unread}
          onShowLobby={() => setLobbyOpen(true)}
        />
      ) : (
        <CramponsLobby
          room={view}
          send={send}
          unread={unread}
          onOpenChat={() => setChatOpen(true)}
          onLeave={leave}
          onBackToGame={view.status === "playing" ? () => setLobbyOpen(false) : undefined}
        />
      )}
    </RoomShell>
  );
}
