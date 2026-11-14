import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { RoomSummary, TableGame } from "../../shared/protocol.ts";
import { BackPicker } from "../game/BackPicker.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { RoomLobby } from "../game/RoomLobby.tsx";
import { UnoTable } from "../game/UnoTable.tsx";
import { useRoom } from "../game/useRoom.ts";
import { Loading } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { preloadSounds, UNO_SOUNDS } from "../lib/sound.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { unoItem } from "../../shared/shop.ts";

// La bataille navale, Briques, Capitale et Mèche ne sont chargées que pour leurs tables
const NavalRoom = lazy(() => import("../naval/NavalRoom.tsx").then((m) => ({ default: m.NavalRoom })));
const BricksRoom = lazy(() => import("../bricks/BricksRoom.tsx").then((m) => ({ default: m.BricksRoom })));
const CapitaleRoom = lazy(() => import("../capitale/CapitaleRoom.tsx").then((m) => ({ default: m.CapitaleRoom })));
const MecheRoom = lazy(() => import("../meche/MecheRoom.tsx").then((m) => ({ default: m.MecheRoom })));
const BolidesRoom = lazy(() => import("../bolides/BolidesRoom.tsx").then((m) => ({ default: m.BolidesRoom })));
const CramponsRoom = lazy(() => import("../crampons/CramponsRoom.tsx").then((m) => ({ default: m.CramponsRoom })));
const TourRoom = lazy(() => import("../tour/TourRoom.tsx").then((m) => ({ default: m.TourRoom })));

/** Une table : on demande d'abord à quel jeu elle appartient, puis on ouvre le bon jeu. */
export function RoomPage({ code }: { code: string }) {
  const upper = code.toUpperCase();
  const [game, setGame] = useState<TableGame | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ room: RoomSummary }>(`/rooms/${upper}`)
      .then((r) => !cancelled && setGame(r.room.game))
      .catch((err) => !cancelled && setFatal(err instanceof ApiError ? err.message : "Salon introuvable."));
    return () => {
      cancelled = true;
    };
  }, [upper]);

  if (fatal) return <RoomError message={fatal} />;
  if (!game) return <Loading label="Arrivée à la table…" />;
  if (game === "tour") {
    return (
      <Suspense fallback={<Loading label="Arrivée à la tournée…" />}>
        <TourRoom code={upper} />
      </Suspense>
    );
  }
  return <GameRoom game={game} code={upper} />;
}

/** La table d'un jeu, sous son code : aussi celle qu'une tournée affiche pour le jeu en cours */
export function GameRoom({ game, code }: { game: TableGame; code: string }) {
  if (game === "naval" || game === "bricks" || game === "capitale" || game === "meche" || game === "bolides" || game === "crampons") {
    return (
      <Suspense fallback={<Loading label="Arrivée à la table…" />}>
        {game === "naval" ? (
          <NavalRoom code={code} />
        ) : game === "bricks" ? (
          <BricksRoom code={code} />
        ) : game === "capitale" ? (
          <CapitaleRoom code={code} />
        ) : game === "meche" ? (
          <MecheRoom code={code} />
        ) : game === "crampons" ? (
          <CramponsRoom code={code} />
        ) : (
          <BolidesRoom code={code} />
        )}
      </Suspense>
    );
  }
  return <UnoRoom code={code} />;
}

function UnoRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, emotes, fatal, send, serverOffset, me } = useRoom(code);
  const [chatOpen, setChatOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const lastStatus = useRef(view?.status);
  // Table d'une tournée : le chat et la sortie sont ceux de la tournée
  const bridge = useTourBridge();
  const messages = bridge?.chat ?? chat;
  const unread = useUnread(messages, chatOpen, me?.id);

  useEffect(() => preloadSounds(UNO_SOUNDS), []);

  // Le dos de cartes choisi en dernier sur cet appareil : repris à chaque table où l'on s'assoit (s'il est à soi)
  const unoBack = usePrefs((p) => p.unoBack);
  const setPrefs = usePrefs((p) => p.set);
  const { has } = useMyItems();
  const mySeatBack = view?.seats.find((s) => s.id === view.you.seatId)?.back ?? (view?.you.seatId ? "classique" : null);
  const owned = unoBack !== null && has(unoItem(unoBack));
  useEffect(() => {
    if (mySeatBack !== null && unoBack && owned && mySeatBack !== unoBack) send({ t: "back", back: unoBack });
  }, [mySeatBack, unoBack, owned, send]);

  // Quand une partie demarre, on bascule sur la table
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

  const showTable = view.uno !== null && (view.status === "playing" || view.status === "finished") && !lobbyOpen;

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
        <UnoTable
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
        view.status === "lobby" ? (
          // Juste avant la partie de tournée : le dos de ses cartes
          <TablePick game="uno" room={view} serverOffset={serverOffset} onReady={() => send({ t: "ready" })}>
            <BackPicker
              current={mySeatBack ?? "classique"}
              onPick={(back) => {
                setPrefs({ unoBack: back });
                send({ t: "back", back });
              }}
            />
          </TablePick>
        ) : (
          bridge.waiting
        )
      ) : (
        <RoomLobby
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
