import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isWild, type Card, type Color } from "../../shared/games/uno/cards.ts";
import { effectiveRules, type UnoAction } from "../../shared/games/uno/engine.ts";
import type { RoomClientMessage, RoomView } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";
import { play, unlockAudio } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { Center } from "./Center.tsx";
import { EmotePicker } from "./ChatPanel.tsx";
import { useFx } from "./fx.ts";
import { FxLayer } from "./FxLayer.tsx";
import { Hand, sortHand } from "./Hand.tsx";
import { GameOver, RoundOver } from "./Overlays.tsx";
import { ColorPicker, TargetPicker } from "./Pickers.tsx";
import { Seat, TimerRing } from "./Seat.tsx";
import type { EmoteBubble } from "./useRoom.ts";

interface TableProps {
  room: RoomView;
  send: (msg: RoomClientMessage) => void;
  emotes: EmoteBubble[];
  serverOffset: number;
  unread: number;
  onOpenChat: () => void;
  onShowLobby: () => void;
  onLeave: () => void;
}

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function UnoTable({ room, send, emotes, serverOffset, unread, onOpenChat, onShowLobby, onLeave }: TableProps) {
  const g = room.uno!;
  const me = room.you.seatId;
  const mySeat = room.seats.find((s) => s.id === me) ?? null;
  const myIndex = me ? g.players.findIndex((p) => p.id === me) : -1;
  const myPlayer = myIndex >= 0 ? g.players[myIndex]! : null;
  const rules = effectiveRules(g.settings);
  const { w, h } = useViewport();
  const compact = w < 720 || h < 600;
  const handW = compact ? clamp(w / 5.6, 58, 82) : clamp(h / 8.4, 78, 112);
  const pileW = compact ? clamp(w / 5.2, 62, 84) : clamp(h / 7.8, 84, 116);
  const sound = usePrefs((s) => s.sound);
  const setPrefs = usePrefs((s) => s.set);
  const [colorFor, setColorFor] = useState<Card | null>(null);
  const [targetFor, setTargetFor] = useState<Card | null>(null);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 600, h: 400 });
  const [scope, animateRoot] = useAnimate();
  const shakeCount = useFx((s) => s.shake);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (shakeCount === 0 || !scope.current) return;
    void animateRoot(scope.current, { x: [0, -9, 8, -6, 5, -2, 0], y: [0, 4, -3, 2, -1, 0] }, { duration: 0.45 });
  }, [shakeCount, animateRoot, scope]);

  useEffect(() => {
    if (g.phase !== "gameOver") setResultsHidden(false);
  }, [g.phase]);

  const myTurn = g.phase === "playing" && me !== null && g.turn === me && !mySeat?.autoplay;
  const playable = useMemo(() => new Set(g.playable), [g.playable]);
  const hand = useMemo(() => sortHand(g.hand), [g.hand]);
  const isRouletteVictim = myTurn && g.rouletteVictim === me;

  // Ordre des adversaires : le suivant (sens horaire) a gauche, puis en remontant par le haut
  const ordered = useMemo(() => {
    const n = g.players.length;
    if (myIndex < 0) return g.players.slice();
    return Array.from({ length: n - 1 }, (_, k) => g.players[(myIndex + 1 + k) % n]!);
  }, [g.players, myIndex]);

  const positions = useMemo(() => {
    const n = ordered.length;
    const padX = compact ? 50 : 82;
    const padY = compact ? 52 : 70;
    const rx = Math.max(40, area.w / 2 - padX);
    const ry = Math.max(40, area.h / 2 - padY);
    return ordered.map((_, k) => {
      let theta: number;
      if (myIndex < 0) theta = -Math.PI / 2 - ((k + 0.5) / n) * Math.PI * 2;
      else theta = 1.1 * Math.PI - ((k + 1) / (n + 1)) * 1.2 * Math.PI;
      return { x: area.w / 2 + rx * Math.cos(theta), y: area.h / 2 - ry * Math.sin(theta) * (myIndex < 0 ? 1 : 1) };
    });
  }, [ordered, area, compact, myIndex]);

  function act(action: UnoAction) {
    unlockAudio();
    send({ t: "action", action });
  }

  function onCardClick(card: Card) {
    unlockAudio();
    if (!myTurn) return;
    if (!playable.has(card.id)) {
      play("click", { volume: 0.4 });
      return;
    }
    if (isWild(card) && card.kind !== "wildRoulette") return setColorFor(card);
    if (card.kind === "number" && card.value === 7 && rules.sevenZero && ordered.filter((p) => !p.out).length > 1) return setTargetFor(card);
    act({ type: "play", cardId: card.id, ...(card.kind === "number" && card.value === 7 && rules.sevenZero ? { target: ordered.find((p) => !p.out)?.id } : {}) });
  }

  const canDraw = myTurn && !g.rouletteVictim && !g.hasDrawn && !(rules.mustPlay && g.playable.length > 0 && g.pendingDraw === 0);

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "u" || e.key === "U") {
        if (g.canUno) act({ type: "uno" });
      } else if ((e.key === "d" || e.key === "D" || e.key === " ") && canDraw) {
        e.preventDefault();
        act({ type: "draw" });
      } else if ((e.key === "p" || e.key === "P") && myTurn && g.drawnCardId !== null && !rules.mustPlay) {
        act({ type: "pass" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const current = room.seats.find((s) => s.id === g.turn);
  const vulnerable = g.unoVulnerable;

  let status: string;
  if (g.phase !== "playing") status = "";
  else if (!me) status = `Tu regardes la partie · au tour de ${current?.name ?? "…"}`;
  else if (mySeat?.autoplay) status = "Un bot joue à ta place";
  else if (!myTurn) status = g.rouletteVictim ? `${current?.name} fait tourner la roulette…` : `Au tour de ${current?.name ?? "…"}`;
  else if (isRouletteVictim) status = "Roulette ! Choisis la couleur à chercher";
  else if (g.canChallenge) status = `+${g.pendingDraw} sur toi ! Contester le bluff, cumuler ou encaisser ?`;
  else if (g.pendingDraw > 0) status = g.canStack ? `+${g.pendingDraw} ! Cumule une carte « + » ou encaisse` : `Tu encaisses +${g.pendingDraw}…`;
  else if (g.drawnCardId !== null) status = rules.mustPlay ? "Pose la carte piochée" : "Carte piochée jouable : la poser ou la garder ?";
  else if (g.playable.length === 0) status = "Aucune carte jouable : pioche !";
  else status = "À toi de jouer !";

  const timerTotal = g.settings.turnSeconds;

  return (
    <div className="table-root felt" ref={scope}>
      <header className="table-top">
        <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <Icon name="menu" />
        </button>
        <div className="table-title">
          <span className="table-code">{room.code}</span>
          <span className="hint">
            {g.settings.variant === "nomercy" ? "No Mercy" : "Classique"}
            {g.settings.endMode === "points" ? ` · manche ${g.round} · objectif ${g.settings.targetScore}` : ""}
          </span>
        </div>
        <div className="table-top-actions">
          <button className="btn btn-ghost btn-icon" onClick={() => setPrefs({ sound: !sound })} aria-label={sound ? "Couper le son" : "Activer le son"}>
            <Icon name={sound ? "volume" : "mute"} />
          </button>
          <button className="btn btn-ghost btn-icon chat-toggle" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" />
            {unread > 0 && <span className="badge badge-red">{unread}</span>}
          </button>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="emote-catcher" onClick={() => setMenuOpen(false)} />
              <motion.div className="table-menu panel" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }}>
                <button className="menu-item" onClick={() => (setMenuOpen(false), onShowLobby())}>
                  <Icon name="users" size={18} /> Voir le salon et les règles
                </button>
                <button className="menu-item" onClick={() => setPrefs({ colorblind: !usePrefs.getState().colorblind })}>
                  <Icon name="eye" size={18} /> Symboles de couleur
                </button>
                <button className="menu-item is-danger" onClick={onLeave}>
                  <Icon name="door" size={18} /> Quitter la table
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>

      <div className="table-area" ref={areaRef}>
        <div className="table-oval" aria-hidden="true" />
        {ordered.map((p, k) => {
          const seat = room.seats.find((s) => s.id === p.id);
          if (!seat) return null;
          const pos = positions[k]!;
          return (
            <div key={p.id} className="seat-slot" style={{ left: pos.x, top: pos.y }}>
              <Seat
                seat={seat}
                player={p}
                isTurn={g.phase === "playing" && g.turn === p.id}
                deadline={room.turnDeadline}
                turnSeconds={timerTotal}
                serverOffset={serverOffset}
                showScore={g.settings.endMode === "points"}
                emotes={emotes.filter((e) => e.seatId === p.id)}
                compact={compact}
                vulnerable={vulnerable === p.id && me !== null && !myPlayer?.out}
                onCatch={() => act({ type: "catch", target: p.id })}
                mercyLimit={g.mercyLimit}
              />
            </div>
          );
        })}
        <div className="center-slot">
          <Center game={g} pileWidth={pileW} canDraw={canDraw} onDraw={() => act({ type: "draw" })} />
        </div>
      </div>

      {me && myPlayer && (
        <div className={`my-zone ${myTurn ? "is-turn" : ""}`}>
          <div className="my-bar">
            <div className="my-status">
              {myTurn && room.turnDeadline && timerTotal > 0 && (
                <span className="my-timer">
                  <TimerRing size={30} deadline={room.turnDeadline} total={timerTotal} offset={serverOffset} />
                </span>
              )}
              <AnimatePresence mode="wait">
                <motion.span key={status} className="my-status-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  {status}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="my-actions">
              {mySeat?.autoplay && (
                <button className="btn btn-primary btn-sm" onClick={() => send({ t: "takeBack" })}>
                  Reprendre la main
                </button>
              )}
              {myTurn && g.canChallenge && (
                <button className="btn btn-danger btn-sm" onClick={() => act({ type: "challenge" })}>
                  Contester
                </button>
              )}
              {myTurn && g.pendingDraw > 0 && (g.canStack || g.canChallenge) && (
                <button className="btn btn-sm" onClick={() => act({ type: "draw" })}>
                  Encaisser +{g.pendingDraw}
                </button>
              )}
              {myTurn && g.drawnCardId !== null && !rules.mustPlay && (
                <button className="btn btn-sm" onClick={() => act({ type: "pass" })}>
                  Garder
                </button>
              )}
              {canDraw && g.pendingDraw === 0 && (
                <button className={`btn btn-sm ${g.playable.length === 0 ? "btn-primary" : ""}`} onClick={() => act({ type: "draw" })}>
                  Piocher
                </button>
              )}
            </div>
          </div>
          <div className="my-hand-row">
            <div className="my-side my-side-left">
              <button className="round-btn" onClick={() => setEmoteOpen(!emoteOpen)} aria-label="Réactions">
                <Icon name="smile" />
              </button>
              <EmotePicker
                open={emoteOpen}
                onClose={() => setEmoteOpen(false)}
                onPick={(emote) => {
                  send({ t: "emote", emote });
                  setEmoteOpen(false);
                }}
              />
              <AnimatePresence>
                {emotes
                  .filter((e) => e.seatId === me)
                  .map((e) => (
                    <motion.div
                      key={e.id}
                      className={`emote-bubble is-mine ${e.emote.length <= 2 ? "is-emoji" : ""}`}
                      initial={{ y: 10, scale: 0.4, opacity: 0 }}
                      animate={{ y: 0, scale: 1, opacity: 1 }}
                      exit={{ y: -16, opacity: 0 }}
                    >
                      {e.emote}
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
            <Hand cards={hand} playable={playable} myTurn={myTurn} cardWidth={handW} onPlay={onCardClick} highlight={myTurn ? g.drawnCardId : null} />
            <div className="my-side my-side-right">
              <motion.button
                className={`uno-btn ${g.canUno ? "is-ready" : ""} ${vulnerable === me ? "is-urgent" : ""}`}
                disabled={!g.canUno}
                onClick={() => act({ type: "uno" })}
                whileTap={{ scale: 0.88 }}
                aria-label="Crier UNO"
              >
                UNO
              </motion.button>
            </div>
          </div>
        </div>
      )}

      <FxLayer />

      <ColorPicker
        open={colorFor !== null}
        title="Choisis une couleur"
        onCancel={() => setColorFor(null)}
        onPick={(color: Color) => {
          if (colorFor) act({ type: "play", cardId: colorFor.id, color });
          setColorFor(null);
        }}
      />
      <ColorPicker open={isRouletteVictim} title="Roulette ! Quelle couleur chercher ?" onPick={(color) => act({ type: "roulette", color })} />
      <TargetPicker
        open={targetFor !== null}
        seats={room.seats}
        players={g.players}
        me={me}
        onCancel={() => setTargetFor(null)}
        onPick={(id) => {
          if (targetFor) act({ type: "play", cardId: targetFor.id, target: id });
          setTargetFor(null);
        }}
      />

      {g.phase === "roundOver" && g.lastRound && <RoundOver room={room} offset={serverOffset} onNext={room.you.isHost ? () => send({ t: "nextRound" }) : undefined} />}
      {g.phase === "gameOver" && !resultsHidden && (
        <GameOver
          room={room}
          onRematch={() => send(room.you.isHost ? { t: "start" } : { t: "rematch" })}
          onLobby={() => {
            setResultsHidden(true);
            onShowLobby();
          }}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
