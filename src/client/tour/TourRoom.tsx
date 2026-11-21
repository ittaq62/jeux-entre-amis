import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import { findVariant, type TourView } from "../../shared/tour.ts";
import { Loading } from "../components/ui.tsx";
import { ArrivalChoice } from "../game/ArrivalChoice.tsx";
import { RoomError, RoomShell, useUnread } from "../game/RoomShell.tsx";
import { preloadSounds, startLoop, stopLoop, TOUR_SOUNDS } from "../lib/sound.ts";
import { GameRoom } from "../pages/RoomPage.tsx";
import { deviceLooks, usePrefs } from "../stores/prefs.ts";
import { TourBridgeContext, type TourBridge } from "./bridge.ts";
import { TourFinale } from "./TourFinale.tsx";
import { TourIntermission } from "./TourIntermission.tsx";
import { TourLobby } from "./TourLobby.tsx";
import { GameTicket, progressLabel, rulesName } from "./TourParts.tsx";
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
  const shown = useShownGame(view, serverOffset);

  // La musique d'entracte : au salon et entre deux jeux, coupée dès qu'un jeu s'affiche (il a ses propres sons)
  const musicOn = usePrefs((s) => s.sound && s.tourMusic);
  const breakTime = view !== null && (view.status === "lobby" || view.status === "intermission") && shown === null;
  useEffect(() => preloadSounds(TOUR_SOUNDS), []);
  useEffect(() => {
    if (musicOn && breakTime) startLoop("tourMusic");
    else stopLoop("tourMusic");
  }, [musicOn, breakTime]);
  useEffect(() => () => stopLoop("tourMusic"), []);

  // Les skins choisis sur cet appareil partent à la tournée, qui les confie à chaque table : à l'arrivée, après chaque
  // coupure de connexion, et dès qu'on en change (un court délai regroupe les changements rapprochés)
  const looks = usePrefs((p) => JSON.stringify(deviceLooks(p)));
  const member = view?.you.member ?? false;
  useEffect(() => {
    if (status !== "open" || !member) return;
    const t = setTimeout(() => send({ t: "looks", looks: JSON.parse(looks) }), 300);
    return () => clearTimeout(t);
  }, [status, member, looks, send]);

  const leave = useCallback(() => {
    send({ t: "leave" });
    navigate("/");
  }, [send, navigate]);
  const sendChat = useCallback((text: string) => send({ t: "chat", text }), [send]);

  const onContinue = useCallback(() => send({ t: "continue" }), [send]);
  const bridge = useMemo<TourBridge | null>(() => {
    if (!view || !shown) return null;
    // La feuille de fin de ce jeu : ceux qui peuvent « continuer » sont les vrais joueurs du jeu, encore là
    const hold = view.endHold?.code === shown.code ? view.endHold : null;
    const game = view.games.find((g) => g.code === shown.code);
    const played = game?.players ?? [];
    const rules = game && view.settings.rules !== "base" ? findVariant(game.game, game.variant) : null;
    const humans = view.members
      .filter((m) => m.kind === "human" && !m.left && m.connected && played.includes(m.userId))
      .map((m) => m.userId);
    return {
      code,
      chat,
      sendChat,
      leave,
      waiting: <TourWaiting view={view} game={shown.game} serverOffset={serverOffset} />,
      endHold: hold ? { until: hold.until, done: hold.done, players: humans, last: view.status === "finished" } : null,
      youId: view.you.userId,
      serverOffset,
      onContinue,
      progress: progressLabel(view, Date.now() + serverOffset),
      rules: rules ? { name: rules.name, blurb: rules.blurb } : null,
    };
  }, [code, chat, sendChat, leave, view, shown, serverOffset, onContinue]);

  if (fatal) return <RoomError message={fatal} />;
  if (!view) return <Loading label={status === "reconnecting" ? "Reconnexion à la tournée…" : "Arrivée à la tournée…"} />;

  // Arrivé pendant la tournée : la jouer ou la regarder (toujours au même endroit, qu'un jeu s'affiche ou non)
  const seated = view.members.filter((m) => m.role === "player" && !m.left);
  const arrival = (
    <ArrivalChoice
      code={code}
      game="tour"
      started={view.status === "intermission" || view.status === "playing"}
      seated={view.you.role === "player" || !view.you.member}
      lateJoin={Boolean(view.settings.lateJoin)}
      room={seated.length < view.settings.maxPlayers || seated.some((m) => m.kind === "bot")}
      onJoin={() => send({ t: "sit" })}
    />
  );

  // Le jeu en cours, dans sa table : c'est elle qui affiche son chat, celui de la tournée
  if (shown && bridge) {
    return (
      <>
        <TourBridgeContext.Provider value={bridge}>
          <GameRoom key={shown.code} game={shown.game} code={shown.code} />
        </TourBridgeContext.Provider>
        {arrival}
      </>
    );
  }

  const screenProps = { view, send, unread, onOpenChat: () => setChatOpen(true), onLeave: leave };
  return (
    <>
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
      {arrival}
    </>
  );
}

/**
 * Le jeu à afficher : celui en cours, puis encore le temps de sa feuille de fin, que la tournée garde jusqu'à une heure
 * donnée (quinze secondes, moins si tous les joueurs ont appuyé sur « Continuer »)
 */
function useShownGame(view: TourView | null, serverOffset: number): { game: GameId; code: string } | null {
  const [held, setHeld] = useState<{ game: GameId; code: string } | null>(null);
  const current = view?.current ?? null;
  const aborted = held ? (view?.games.find((g) => g.code === held.code)?.aborted ?? false) : false;
  // L'heure de fin de la feuille, si la tournée en garde une pour ce jeu
  const holdUntil = held && view?.endHold?.code === held.code ? view.endHold.until : null;
  // La table vient de finir mais la tournée n'a pas encore donné son délai : on attend sa prochaine vue
  const finishedHere = held ? Boolean(view?.games.find((g) => g.code === held.code)?.endedAt) : false;
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
    if (holdUntil === null) {
      // Sans feuille de fin gardée (un jeu fini sans résultat) : l'entracte tout de suite
      if (finishedHere) setHeld(null);
      return;
    }
    const left = holdUntil - (Date.now() + serverOffset);
    if (left <= 0) {
      setHeld(null);
      return;
    }
    const t = setTimeout(() => setHeld(null), left);
    return () => clearTimeout(t);
  }, [current?.code, current?.game, held?.code, aborted, holdUntil, finishedHere, serverOffset]); // eslint-disable-line react-hooks/exhaustive-deps
  return held;
}

/** Pendant que chacun arrive à la table du jeu tiré */
function TourWaiting({ view, game, serverOffset }: { view: TourView; game: GameId; serverOffset: number }) {
  const current = view.current ? view.games.find((g) => g.code === view.current!.code) : undefined;
  const players = current?.players ?? [];
  const names = players.map((id) => view.members.find((m) => m.userId === id)?.name).filter(Boolean);
  const rules = current && view.settings.rules !== "base" ? rulesName(current.game, current.variant) : null;
  return (
    <div className="felt center-screen tour-waiting">
      <div className="tour-waiting-card">
        <GameTicket game={game} size="lg" chosen />
        <div>
          <p className="hint" style={{ margin: 0 }}>
            {progressLabel(view, Date.now() + serverOffset)}
          </p>
          <h2>{GAME_NAMES[game]}</h2>
          {rules && <p className="tour-waiting-rules">Règles « {rules} »</p>}
          <p className="lobby-wait">
            <span className="spinner" /> Tout le monde s'installe à la table…
          </p>
          {names.length > 0 && <p className="hint">{names.join(", ")}</p>}
        </div>
      </div>
    </div>
  );
}
