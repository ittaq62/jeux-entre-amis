import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { tableDraw } from "../game/RandomRules.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { CourGame } from "./CourGame.tsx";
import { takeCampaignChapter } from "./campaignStart.ts";
import { CourLobby } from "./CourLobby.tsx";
import { LookPicker } from "./LookPicker.tsx";
import { useCourRoom } from "./useCourRoom.ts";
import "./cour.css";

/** Une table de La Cour des Grands : le salon, puis le grand jeu. Une table de campagne part tout de suite. */
export function CourRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, fatal, send, serverOffset, serverNow, me, listeners, stars } = useCourRoom(code);
  const [chatOpen, setChatOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const lastStatus = useRef(view?.status);
  const asked = useRef(false);
  // Le chapitre demandé par la page de la campagne, repris une fois en arrivant ; on attend son départ (6 s au plus)
  const [chapter, setChapter] = useState(() => takeCampaignChapter(code));
  const bridge = useTourBridge();
  const messages = bridge?.chat ?? chat;
  const unread = useUnread(messages, chatOpen, me?.id);

  useEffect(() => {
    if (view && lastStatus.current !== "playing" && view.status === "playing") setLobbyOpen(false);
    lastStatus.current = view?.status;
  }, [view]);

  // Un chapitre de la campagne, demandé par la page de la campagne : on le lance dès qu'on est assis à sa table
  useEffect(() => {
    if (!chapter || !view || asked.current || view.status !== "lobby" || !view.you.isHost || !view.you.seatId) return;
    asked.current = true;
    send({ t: "campagne", chapter });
    // Si la salle refuse (quelqu'un d'autre s'est assis), le salon revient au lieu d'une attente sans fin
    setTimeout(() => setChapter(null), 6000);
  }, [view, send, chapter]);

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Retour dans la cour…" : "Arrivée sur l'île de Récré…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate(view.campaign ? "/cour/campagne" : "/");
  };
  const announcing = !bridge && view.status === "finished" && Boolean(view.pickUntil);
  const showGame = view.match !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen && !announcing;
  const pick = (
    <TablePick game="cour" room={view} serverOffset={serverOffset} onReady={() => send({ t: "ready" })} drawn={tableDraw(view)}>
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
        <CourGame
          room={view}
          send={send}
          serverNow={serverNow}
          listeners={listeners}
          stars={stars}
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
      ) : chapter && view.status === "lobby" ? (
        <Loading label="La cloche sonne, l'épreuve commence…" />
      ) : (
        <CourLobby
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
