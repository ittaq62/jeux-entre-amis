import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { BolidesLobby } from "./BolidesLobby.tsx";
import { BolidesRace } from "./BolidesRace.tsx";
import { Garage } from "./Garage.tsx";
import { useBolidesRoom } from "./useBolidesRoom.ts";
import "./bolides.css";

/** Une table de Bolides : le salon, puis la course. */
export function BolidesRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, fatal, send, serverOffset, me, listeners } = useBolidesRoom(code);
  const [chatOpen, setChatOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const lastStatus = useRef(view?.status);
  // Table d'une tournée : le chat et la sortie sont ceux de la tournée
  const bridge = useTourBridge();
  const messages = bridge?.chat ?? chat;
  const unread = useUnread(messages, chatOpen, me?.id);

  useEffect(() => {
    if (view && lastStatus.current !== "playing" && view.status === "playing") setLobbyOpen(false);
    lastStatus.current = view?.status;
  }, [view]);

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion au salon…" : "Arrivée au circuit…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  const showRace = view.bolides !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen;

  return (
    <RoomShell
      chat={messages}
      meId={me?.id ?? ""}
      chatOpen={chatOpen}
      onCloseChat={() => setChatOpen(false)}
      onSend={(text) => (bridge ? bridge.sendChat(text) : send({ t: "chat", text }))}
      reconnecting={status === "reconnecting"}
    >
      {showRace ? (
        <BolidesRace
          room={view}
          send={send}
          listeners={listeners}
          serverOffset={serverOffset}
          unread={unread}
          onOpenChat={() => setChatOpen(true)}
          onShowLobby={() => !bridge && setLobbyOpen(true)}
          onLeave={leave}
        />
      ) : bridge ? (
        view.status === "lobby" ? (
          // Juste avant la course de tournée : son véhicule et son skin
          <TablePick game="bolides" room={view} serverOffset={serverOffset} onReady={() => send({ t: "ready" })}>
            <Garage room={view} send={send} />
          </TablePick>
        ) : (
          bridge.waiting
        )
      ) : (
        <BolidesLobby
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
