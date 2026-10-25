import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import { GAME_END_HOLD_MS, type TourView } from "../../shared/tour.ts";
import { Loading } from "../components/ui.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { GameRoom } from "../pages/RoomPage.tsx";
import { TourBridgeContext, type TourBridge } from "./bridge.ts";
import { TourFinale } from "./TourFinale.tsx";
import { TourIntermission } from "./TourIntermission.tsx";
import { TourLobby } from "./TourLobby.tsx";
import { GameTicket, progressLabel } from "./TourParts.tsx";
import { useTourRoom } from "./useTourRoom.ts";
import "./tour.css";

/**
 * Une tournée : le salon, puis chaque jeu dans sa propre table, affichée ici même. La connexion à la tournée
 * reste ouverte pendant les jeux : le chat suit, et l'entracte arrive dès que la table a rendu son résultat.
 */
export function TourRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const { view, status, chat, fatal, send, serverOffset, me } = useTourRoom(code);
  const [chatOpen, setChatOpen] = useState(false);
  const unread = useUnread(chat, chatOpen, me?.id);
  const shown = useShownGame(view);

  const leave = useCallback(() => {
    send({ t: "leave" });
    navigate("/");
  }, [send, navigate]);
  const sendChat = useCallback((text: string) => send({ t: "chat", text }), [send]);

  const bridge = useMemo<TourBridge | null>(
    () =>
      view && shown
        ? { code, chat, sendChat, leave, waiting: <TourWaiting view={view} game={shown.game} serverOffset={serverOffset} /> }
        : null,
    [code, chat, sendChat, leave, view, shown, serverOffset],
  );

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion à la tournée…" : "Arrivée à la tournée…"} />;

  // Le jeu en cours, dans sa table : c'est elle qui affiche son chat, celui de la tournée
  if (shown && bridge) {
    return (
      <TourBridgeContext.Provider value={bridge}>
        <GameRoom key={shown.code} game={shown.game} code={shown.code} />
      </TourBridgeContext.Provider>
    );
  }

  const screenProps = { view, send, unread, onOpenChat: () => setChatOpen(true), onLeave: leave };
  return (
    <RoomShell
      chat={chat}
      meId={me?.id ?? ""}
      chatOpen={chatOpen}
      onCloseChat={() => setChatOpen(false)}
      onSend={sendChat}
      reconnecting={status === "reconnecting"}
    >
      {view.status === "lobby" ? (
        <TourLobby {...screenProps} />
      ) : view.status === "finished" ? (
        <TourFinale {...screenProps} serverOffset={serverOffset} />
      ) : (
        <TourIntermission {...screenProps} serverOffset={serverOffset} />
      )}
    </RoomShell>
  );
}

/** Le jeu à afficher : celui en cours, et encore quelques secondes après sa fin, le temps de sa feuille de fin */
function useShownGame(view: TourView | null): { game: GameId; code: string } | null {
  const [held, setHeld] = useState<{ game: GameId; code: string } | null>(null);
  const current = view?.current ?? null;
  const aborted = held ? (view?.games.find((g) => g.code === held.code)?.aborted ?? false) : false;
  useEffect(() => {
    if (current) {
      setHeld((h) => (h?.code === current.code ? h : { game: current.game, code: current.code }));
      return;
    }
    if (!held) return;
    // Une table qui n'a pas pu commencer s'efface tout de suite
    if (aborted) {
      setHeld(null);
      return;
    }
    const t = setTimeout(() => setHeld(null), GAME_END_HOLD_MS);
    return () => clearTimeout(t);
  }, [current?.code, current?.game, held?.code, aborted]); // eslint-disable-line react-hooks/exhaustive-deps
  return held;
}

/** Pendant que chacun arrive à la table du jeu tiré */
function TourWaiting({ view, game, serverOffset }: { view: TourView; game: GameId; serverOffset: number }) {
  const players = view.current ? (view.games.find((g) => g.code === view.current!.code)?.players ?? []) : [];
  const names = players.map((id) => view.members.find((m) => m.userId === id)?.name).filter(Boolean);
  return (
    <div className="felt center-screen tour-waiting">
      <div className="tour-waiting-card">
        <GameTicket game={game} size="lg" chosen />
        <div>
          <p className="hint" style={{ margin: 0 }}>
            {progressLabel(view, Date.now() + serverOffset)}
          </p>
          <h2>{GAME_NAMES[game]}</h2>
          <p className="lobby-wait">
            <span className="spinner" /> Tout le monde s'installe à la table…
          </p>
          {names.length > 0 && <p className="hint">{names.join(", ")}</p>}
        </div>
      </div>
    </div>
  );
}
