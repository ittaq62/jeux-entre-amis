import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DEFAULT_CONFIG } from "../../shared/games/toque/net.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { Loading } from "../components/ui.tsx";
import { tableDraw } from "../game/RandomRules.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { LookPicker } from "./LookPicker.tsx";
import { ToqueGame } from "./ToqueGame.tsx";
import { ToqueLobby } from "./ToqueLobby.tsx";
import { useToqueRoom } from "./useToqueRoom.ts";
import "./toque.css";

const TEAM_NAMES = ["Brigade de gauche", "Brigade de droite"];

/** Une brigade de Toque ! : le salon (la carte de la route), puis le service. */
export function ToqueRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, fatal, send, serverOffset, me, listeners, stars } = useToqueRoom(code);
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

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Retour en cuisine…" : "Arrivée en cuisine…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  // L'annonce avant le service : en tournée, au salon de la table ; hors tournée, avant la revanche
  const announcing = !bridge && view.status === "finished" && Boolean(view.pickUntil);
  const showGame = view.toque !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen && !announcing;
  const cfg = applyDrawnRules("toque", { ...DEFAULT_CONFIG, ...view.settings.toque }, DEFAULT_CONFIG, tableDraw(view));
  const pick = (
    <TablePick
      game="toque"
      room={view}
      serverOffset={serverOffset}
      onReady={() => send({ t: "ready" })}
      drawn={tableDraw(view)}
      teamOf={(s) => view.teams[s.id]}
      teamName={cfg.mode === "duel" ? (t) => TEAM_NAMES[t] ?? "" : null}
    >
      <LookPicker room={view} send={send} />
    </TablePick>
  );

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
      {showGame ? (
        <ToqueGame
          room={view}
          send={send}
          listeners={listeners}
          onLeave={leave}
          onOpenChat={() => setChatOpen(true)}
          unread={unread}
          onShowLobby={() => !bridge && setLobbyOpen(true)}
          serverOffset={serverOffset}
          stars={stars}
        />
      ) : bridge ? (
        view.status === "lobby" ? (
          pick
        ) : (
          bridge.waiting
        )
      ) : announcing ? (
        pick
      ) : (
        <ToqueLobby
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
