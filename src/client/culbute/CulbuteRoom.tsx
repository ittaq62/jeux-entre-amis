import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { DEFAULT_CONFIG } from "../../shared/games/culbute/view.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { TOUR_TEAMS } from "../../shared/tour.ts";
import { tableDraw } from "../game/RandomRules.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { CulbuteFight } from "./CulbuteFight.tsx";
import { CulbuteLobby } from "./CulbuteLobby.tsx";
import { FighterPicker } from "./FighterPicker.tsx";
import { useCulbuteRoom } from "./useCulbuteRoom.ts";
import "./culbute.css";

/** Une table de Culbute : le salon, puis le combat. */
export function CulbuteRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, fatal, send, serverOffset, me, listeners } = useCulbuteRoom(code);
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
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion à l'arène…" : "Arrivée à l'arène…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  // L'annonce avant le combat : en tournée, au salon de la table ; hors tournée, avant la revanche
  const announcing = !bridge && view.status === "finished" && Boolean(view.pickUntil);
  const showFight = view.culbute !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen && !announcing;
  const cfg = applyDrawnRules("culbute", { ...DEFAULT_CONFIG, ...view.settings.culbute }, DEFAULT_CONFIG, tableDraw(view));
  // Son combattant ; en équipes, les joueurs rangés par équipe
  const pick = (
    <TablePick
      game="culbute"
      room={view}
      serverOffset={serverOffset}
      onReady={() => send({ t: "ready" })}
      drawn={tableDraw(view)}
      teamOf={(s) => view.teams[s.id]}
      teamName={cfg.teams ? (t) => TOUR_TEAMS[t as 0 | 1] ?? "" : null}
    >
      <FighterPicker room={view} send={send} />
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
      {showFight ? (
        <CulbuteFight
          room={view}
          send={send}
          listeners={listeners}
          onLeave={leave}
          onOpenChat={() => setChatOpen(true)}
          unread={unread}
          onShowLobby={() => !bridge && setLobbyOpen(true)}
        />
      ) : bridge ? (
        // Juste avant le combat de la tournée : l'annonce
        view.status === "lobby" ? (
          pick
        ) : (
          bridge.waiting
        )
      ) : announcing ? (
        pick
      ) : (
        <CulbuteLobby
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
