import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { DEFAULT_CONFIG } from "../../shared/games/minigolf/match.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { TOUR_TEAMS } from "../../shared/tour.ts";
import { tableDraw } from "../game/RandomRules.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { BallPicker } from "./BallPicker.tsx";
import { MinigolfGame } from "./MinigolfGame.tsx";
import { MinigolfLobby } from "./MinigolfLobby.tsx";
import { useMinigolfRoom } from "./useMinigolfRoom.ts";
import "./minigolf.css";

/** Une table de minigolf : le salon, puis la partie. */
export function MinigolfRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, fatal, send, serverOffset, serverNow, me, listeners } = useMinigolfRoom(code);
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
  if (!view) return <Loading label={status === "reconnecting" ? "Retour au parcours…" : "Arrivée au départ…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  // L'annonce avant la partie : en tournée, au salon de la table ; hors tournée, avant la revanche
  const announcing = !bridge && view.status === "finished" && Boolean(view.pickUntil);
  const showGame = view.minigolf !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen && !announcing;
  const cfg = applyDrawnRules("minigolf", { ...DEFAULT_CONFIG, ...view.settings.minigolf }, DEFAULT_CONFIG, tableDraw(view));
  const pick = (
    <TablePick
      game="minigolf"
      room={view}
      serverOffset={serverOffset}
      onReady={() => send({ t: "ready" })}
      drawn={tableDraw(view)}
      teamOf={(s) => view.teams[s.id]}
      teamName={cfg.teams ? (t) => TOUR_TEAMS[t as 0 | 1] ?? "" : null}
    >
      <BallPicker room={view} send={send} />
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
        <MinigolfGame
          room={view}
          send={send}
          serverNow={serverNow}
          listeners={listeners}
          onLeave={leave}
          onOpenChat={() => setChatOpen(true)}
          unread={unread}
          onShowLobby={() => !bridge && setLobbyOpen(true)}
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
        <MinigolfLobby
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
