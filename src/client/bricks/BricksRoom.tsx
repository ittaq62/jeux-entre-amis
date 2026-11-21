import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { DEFAULT_SETTINGS } from "../../shared/games/bricks/engine.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { tableDraw } from "../game/RandomRules.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { BRICK_TEAMS, BricksLobby } from "./BricksLobby.tsx";
import { BricksTable } from "./BricksTable.tsx";
import { useBricksRoom } from "./useBricksRoom.ts";
import "./bricks.css";

/** Une table de Briques : le salon, puis les manches. */
export function BricksRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, emotes, fatal, send, serverOffset, me, listeners, lastSnapshot } = useBricksRoom(code);
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
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion au salon…" : "Arrivée à la table…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  // L'annonce avant la partie : en tournée, au salon de la table ; hors tournée, avant la revanche
  const announcing = !bridge && view.status === "finished" && Boolean(view.pickUntil);
  const showTable = view.bricks !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen && !announcing;
  const rules = applyDrawnRules("bricks", view.settings.bricks, DEFAULT_SETTINGS, tableDraw(view));
  const teams = !view.tour && !rules.sprint && rules.teams && view.settings.maxPlayers === 4;
  const pick = (
    <TablePick
      game="bricks"
      room={view}
      serverOffset={serverOffset}
      onReady={() => send({ t: "ready" })}
      drawn={tableDraw(view)}
      teamName={teams ? (t) => BRICK_TEAMS[t as 0 | 1] ?? "" : undefined}
    />
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
      {showTable ? (
        <BricksTable
          room={view}
          send={send}
          emotes={emotes}
          serverOffset={serverOffset}
          unread={unread}
          onOpenChat={() => setChatOpen(true)}
          onShowLobby={() => !bridge && setLobbyOpen(true)}
          onLeave={leave}
          listeners={listeners}
          lastSnapshot={lastSnapshot}
        />
      ) : bridge ? (
        // Juste avant la partie de tournée : l'annonce
        view.status === "lobby" ? (
          pick
        ) : (
          bridge.waiting
        )
      ) : announcing ? (
        pick
      ) : (
        <BricksLobby
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
