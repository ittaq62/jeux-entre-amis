import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DEFAULT_BOMB } from "../../shared/games/meche/bombs.ts";
import { bombItem } from "../../shared/shop.ts";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { BombArt } from "./bombs/BombArt.tsx";
import { BombPicker } from "./bombs/BombPicker.tsx";
import { MecheLobby } from "./MecheLobby.tsx";
import { MecheTable } from "./MecheTable.tsx";
import { useMecheRoom } from "./useMecheRoom.ts";
import "./meche.css";

/** Une table de Mèche : le salon, puis la partie. */
export function MecheRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, batch, refused, status, chat, emotes, fatal, send, serverOffset, me } = useMecheRoom(code);
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

  // La bombe choisie sur cet appareil : reprise à chaque table où l'on s'assoit, dès qu'on sait qu'elle est à soi
  // (avant que la boutique réponde, on ne touche à rien : la tournée a pu en poser une)
  const saved = usePrefs((p) => p.mecheBomb);
  const { has } = useMyItems();
  const want = saved && has(bombItem(saved)) ? saved : null;
  const mySeat = view?.seats.find((s) => s.id === view.you.seatId);
  const seatBomb = mySeat ? (mySeat.bomb ?? DEFAULT_BOMB) : null;
  useEffect(() => {
    if (seatBomb === null || want === null || seatBomb === want) return;
    send({ t: "bomb", bomb: want });
    // Le serveur ignore deux choix trop rapprochés : on redemande s'il n'a rien changé entre-temps
    const again = setTimeout(() => send({ t: "bomb", bomb: want }), 700);
    return () => clearTimeout(again);
  }, [seatBomb, want, send]);

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion au salon…" : "Arrivée à la table…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  const showTable = view.meche !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen;

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
        <MecheTable
          room={view}
          send={send}
          batch={batch}
          refused={refused}
          emotes={emotes}
          serverOffset={serverOffset}
          unread={unread}
          chatOpen={chatOpen}
          onOpenChat={() => setChatOpen(true)}
          onShowLobby={() => !bridge && setLobbyOpen(true)}
          onLeave={leave}
        />
      ) : bridge ? (
        view.status === "lobby" ? (
          // Juste avant la partie de tournée : sa bombe, et celle de chacun à côté de son nom
          <TablePick
            game="meche"
            room={view}
            serverOffset={serverOffset}
            onReady={() => send({ t: "ready" })}
            seatLook={(s) => <BombArt id={s.bomb ?? DEFAULT_BOMB} className="table-pick-bomb" />}
          >
            <BombPicker />
          </TablePick>
        ) : (
          bridge.waiting
        )
      ) : (
        <MecheLobby
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
