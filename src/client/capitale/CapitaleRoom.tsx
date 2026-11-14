import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { tokenItem } from "../../shared/shop.ts";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { CapitaleLobby } from "./CapitaleLobby.tsx";
import { CapitaleTable } from "./CapitaleTable.tsx";
import { TourPick } from "./TourPick.tsx";
import { useCapitaleRoom } from "./useCapitaleRoom.ts";
import "./capitale.css";

/** Une table de Capitale : le salon, puis la partie. */
export function CapitaleRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, batch, status, chat, emotes, fatal, send, serverOffset, me } = useCapitaleRoom(code);
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

  // Le pion choisi en dernier sur cet appareil : repris à chaque table où l'on s'assoit (s'il est à soi), tant que la
  // partie n'a pas commencé (le serveur ne change plus les pions en cours de partie)
  const capitaleToken = usePrefs((p) => p.capitaleToken);
  const { has } = useMyItems();
  const mySeat = view?.seats.find((s) => s.id === view.you.seatId);
  const mySeatToken = mySeat && view?.status !== "playing" ? (mySeat.token ?? "pion") : null;
  const owned = capitaleToken !== null && has(tokenItem(capitaleToken));
  useEffect(() => {
    if (mySeatToken !== null && capitaleToken && owned && mySeatToken !== capitaleToken) send({ t: "token", token: capitaleToken });
  }, [mySeatToken, capitaleToken, owned, send]);

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion au salon…" : "Arrivée à la table…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  const showTable = view.capitale !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen;

  return (
    <RoomShell
      chat={messages}
      meId={me?.id ?? ""}
      chatOpen={chatOpen}
      onCloseChat={() => setChatOpen(false)}
      onSend={(text) => (bridge ? bridge.sendChat(text) : send({ t: "chat", text }))}
      reconnecting={status === "reconnecting"}
    >
      {showTable ? (
        <CapitaleTable
          room={view}
          batch={batch}
          send={send}
          emotes={emotes}
          serverOffset={serverOffset}
          unread={unread}
          onOpenChat={() => setChatOpen(true)}
          onShowLobby={() => !bridge && setLobbyOpen(true)}
          onLeave={leave}
        />
      ) : bridge ? (
        view.status === "lobby" ? (
          <TourPick room={view} send={send} serverOffset={serverOffset} />
        ) : (
          bridge.waiting
        )
      ) : (
        <CapitaleLobby
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
