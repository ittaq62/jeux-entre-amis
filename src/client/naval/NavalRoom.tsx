import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { navalItem } from "../../shared/shop.ts";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { DEFAULT_SETTINGS } from "../../shared/games/naval/engine.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { tableDraw } from "../game/RandomRules.tsx";
import { NavalLobby, TEAM_NAMES } from "./NavalLobby.tsx";
import { NavalTable } from "./NavalTable.tsx";
import { SkinPicker } from "./SkinPicker.tsx";
import { useNavalRoom } from "./useNavalRoom.ts";
import "./naval.css";

/** Une table de bataille navale : le salon, puis la bataille. */
export function NavalRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, emotes, fatal, send, serverOffset, me } = useNavalRoom(code);
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

  // Le thème de flotte choisi en dernier sur cet appareil : repris à chaque table où l'on s'assoit (s'il est à soi)
  const navalSkin = usePrefs((p) => p.navalSkin);
  const setPrefs = usePrefs((p) => p.set);
  const { has } = useMyItems();
  const mySeatSkin = view?.seats.find((s) => s.id === view.you.seatId)?.skin ?? (view?.you.seatId ? "marine" : null);
  const owned = navalSkin !== null && has(navalItem(navalSkin));
  useEffect(() => {
    if (mySeatSkin !== null && navalSkin && owned && mySeatSkin !== navalSkin) send({ t: "skin", skin: navalSkin });
  }, [mySeatSkin, navalSkin, owned, send]);

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion au salon…" : "Arrivée à la table…"} />;

  const leave = () => {
    send({ t: "leave" });
    if (bridge) bridge.leave();
    else navigate("/");
  };
  // L'annonce avant la partie : en tournée, au salon de la table ; hors tournée, avant la revanche
  const announcing = !bridge && view.status === "finished" && Boolean(view.pickUntil);
  const showTable = view.naval !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen && !announcing;
  const rules = applyDrawnRules("naval", view.settings.naval, DEFAULT_SETTINGS, tableDraw(view));
  const teams = !view.tour && rules.teams && view.settings.maxPlayers === 4;
  const pick = (
    <TablePick
      game="naval"
      room={view}
      serverOffset={serverOffset}
      onReady={() => send({ t: "ready" })}
      drawn={tableDraw(view)}
      teamName={teams ? (t) => TEAM_NAMES[t as 0 | 1] ?? "" : undefined}
    >
      <SkinPicker
        current={mySeatSkin ?? "marine"}
        onPick={(skin) => {
          setPrefs({ navalSkin: skin });
          send({ t: "skin", skin });
        }}
      />
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
      {showTable ? (
        <NavalTable
          room={view}
          send={send}
          emotes={emotes}
          serverOffset={serverOffset}
          unread={unread}
          onOpenChat={() => setChatOpen(true)}
          onShowLobby={() => !bridge && setLobbyOpen(true)}
          onLeave={leave}
        />
      ) : bridge ? (
        // Juste avant la partie de tournée : l'annonce, et le thème de sa flotte
        view.status === "lobby" ? (
          pick
        ) : (
          bridge.waiting
        )
      ) : announcing ? (
        pick
      ) : (
        <NavalLobby
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
