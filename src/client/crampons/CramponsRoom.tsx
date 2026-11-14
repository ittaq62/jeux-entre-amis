import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { feteItem } from "../../shared/shop.ts";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { CramponsLobby, TourLocker } from "./CramponsLobby.tsx";
import { CramponsMatch } from "./CramponsMatch.tsx";
import { useCramponsRoom } from "./useCramponsRoom.ts";
import "./crampons.css";

/** Une table de Crampons : le salon, puis le match. */
export function CramponsRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, fatal, send, serverOffset, me, listeners } = useCramponsRoom(code);
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

  // La célébration choisie sur cet appareil : reprise à chaque table où l'on joue (si elle est à soi)
  const fete = usePrefs((p) => p.cramponsFete);
  const { has } = useMyItems();
  const mySeat = view?.seats.find((s) => s.id === view.you.seatId);
  const seatFete = mySeat ? (mySeat.fete ?? "maison") : null;
  const owned = fete !== null && has(feteItem(fete));
  useEffect(() => {
    if (seatFete !== null && fete && owned && seatFete !== fete) send({ t: "fete", fete });
  }, [seatFete, fete, owned, send]);

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion au stade…" : "Arrivée au stade…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  const showMatch = view.crampons !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen;

  return (
    <RoomShell
      chat={messages}
      meId={me?.id ?? ""}
      chatOpen={chatOpen}
      onCloseChat={() => setChatOpen(false)}
      onSend={(text) => (bridge ? bridge.sendChat(text) : send({ t: "chat", text }))}
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
          onShowLobby={() => !bridge && setLobbyOpen(true)}
        />
      ) : bridge ? (
        view.status === "lobby" ? (
          // Juste avant le match de tournée : son ballon et sa célébration
          <TablePick game="crampons" room={view} serverOffset={serverOffset} onReady={() => send({ t: "ready" })}>
            <TourLocker room={view} />
          </TablePick>
        ) : (
          bridge.waiting
        )
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
