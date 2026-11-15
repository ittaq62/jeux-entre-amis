import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { camoItem } from "../../shared/shop.ts";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { ArsenalPanel, EscarmoucheLobby } from "./EscarmoucheLobby.tsx";
import { EscarmoucheMatch } from "./EscarmoucheMatch.tsx";
import { useEscarmoucheRoom } from "./useEscarmoucheRoom.ts";
import "./escarmouche.css";

/** Une table d'Escarmouche : le salon, puis le combat. */
export function EscarmoucheRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, fatal, send, serverOffset, me, listeners } = useEscarmoucheRoom(code);
  const [chatOpen, setChatOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const lastStatus = useRef(view?.status);
  const bridge = useTourBridge();
  const messages = bridge?.chat ?? chat;
  const unread = useUnread(messages, chatOpen, me?.id);

  useEffect(() => {
    if (view && lastStatus.current !== "playing" && view.status === "playing") setLobbyOpen(false);
    lastStatus.current = view?.status;
  }, [view]);

  // L'arme et le camouflage choisis sur cet appareil : repris à chaque table où l'on s'assoit (si on les a)
  const camo = usePrefs((p) => p.escarmoucheCamo);
  const primary = usePrefs((p) => p.escarmouchePrimary);
  const { has } = useMyItems();
  const mine = view?.you.seatId ? view.arsenal[view.you.seatId] : undefined;
  const owned = camo !== null && has(camoItem(camo));
  useEffect(() => {
    if (!mine) return;
    const patch: { primary?: typeof primary & {}; camo?: typeof camo & {} } = {};
    if (primary && primary !== mine.primary) patch.primary = primary;
    if (camo && owned && camo !== mine.camo) patch.camo = camo;
    if (patch.primary || patch.camo) send({ t: "arsenal", ...patch });
  }, [mine?.primary, mine?.camo, primary, camo, owned, send, mine]);

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion au salon…" : "Arrivée au front…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  const showMatch = view.escarmouche !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen;

  return (
    <RoomShell
      room={view}
      onSit={() => send({ t: "sit" })}
      chat={messages}
      meId={me?.id ?? ""}
      chatOpen={chatOpen}
      onCloseChat={() => setChatOpen(false)}
      onSend={(text) => (bridge ? bridge.sendChat(text) : send({ t: "chat", text }))}
      reconnecting={status === "reconnecting"}
    >
      {showMatch ? (
        <EscarmoucheMatch
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
          <TablePick game="escarmouche" room={view} serverOffset={serverOffset} onReady={() => send({ t: "ready" })}>
            <ArsenalPanel room={view} send={send} />
          </TablePick>
        ) : (
          bridge.waiting
        )
      ) : (
        <EscarmoucheLobby
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
