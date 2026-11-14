import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isWild, type Card, type Color } from "../../shared/games/uno/cards.ts";
import { effectiveRules, type UnoAction } from "../../shared/games/uno/engine.ts";
import type { RoomClientMessage, RoomView } from "../../shared/protocol.ts";
import { CardBackSkin } from "../components/cardBacks.tsx";
import { Chip } from "../components/Chip.tsx";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { useCountdown } from "../lib/countdown.ts";
import { play, unlockAudio } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { awayTurnNote } from "./AwayNote.tsx";
import { Center } from "./Center.tsx";
import { arcSeats, placeCenter, rowSeats } from "./centerLayout.ts";
import { EmotePicker } from "./ChatPanel.tsx";
import { useFx } from "./fx.ts";
import { FxLayer } from "./FxLayer.tsx";
import { Hand, sortHand } from "./Hand.tsx";
import { GameOver, RoundOver } from "./Overlays.tsx";
import { PartnerBar } from "./PartnerBar.tsx";
import { ColorPicker, TargetPicker } from "./Pickers.tsx";
import { Seat, TimerRing } from "./Seat.tsx";
import type { EmoteBubble } from "./useRoom.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { useViewport } from "../lib/viewport.ts";
import { TOUR_TEAM_COLORS, TOUR_TEAMS } from "../../shared/tour.ts";

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

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
/** Écran bas : la place de l'étiquette de couleur, à droite de la défausse */
const SHORT_LABEL_W = 62;
/** La place d'un siège d'adversaire (portrait, nom, éventail et nombre de cartes) */
const SEAT_BOX = { compact: { w: 76, h: 108 }, wide: { w: 100, h: 126 } } as const;

export function UnoTable({ room, send, emotes, serverOffset, unread, onOpenChat, onShowLobby, onLeave }: TableProps) {
  const inTour = useTourBridge() !== null;
  const g = room.uno!;
  const me = room.you.seatId;
  const mySeat = room.seats.find((s) => s.id === me) ?? null;
  const myIndex = me ? g.players.findIndex((p) => p.id === me) : -1;
  const myPlayer = myIndex >= 0 ? g.players[myIndex]! : null;
  const rules = effectiveRules(g.settings);
  const { w, h } = useViewport();
  const compact = w < 720 || h < 600;
  const portrait = h > w * 1.15;
  // En équipe, les mains des coéquipiers : sur leur ligne sous la barre du haut, ou dans la barre sur un écran bas
  const short = h < 500 && w > h;
  const partnerCard = compact ? (short ? 28 : 30) : clamp(h / 17, 36, 50);
  const headerRef = useRef<HTMLElement>(null);
  const [headerRoom, setHeaderRoom] = useState({ inline: 0, row: 0 });
  // Téléphone en paysage : la hauteur manque, les cartes se règlent sur elle pour laisser de la place à la table
  const handW = compact ? clamp(portrait ? w / 4.5 : w / 5.6, 58, short ? Math.max(58, h / 5.6) : 90) : clamp(h / 8.4, 78, 112);
  // Téléphone tenu droit mais bas : les piles se règlent aussi sur la hauteur, pour laisser passer les sièges de côté
  const pileW = compact
    ? clamp(portrait ? Math.min(w / 4.6, h / 9.6) : w / 5.2, 62, short ? Math.max(62, h / 6.2) : 88)
    : clamp(h / 7.8, 84, 116);
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

  // La place pour les mains des coéquipiers : une ligne entière, et au milieu de la barre du haut, autant de chaque côté
  // de l'axe de la table entre le titre (à gauche) et les boutons (à droite), avec une marge de chaque côté
  const hasPartners = g.partners.length > 0;
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el || !hasPartners) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const left = box.left + parseFloat(style.paddingLeft);
      const right = box.right - parseFloat(style.paddingRight);
      const mid = box.left + box.width / 2;
      let leftEnd = left;
      let rightStart = right;
      for (const c of el.children) {
        if (c.matches(".partner-bar, .table-menu, .emote-catcher")) continue;
        const r = c.getBoundingClientRect();
        if (r.right <= mid) leftEnd = Math.max(leftEnd, r.right);
        else if (r.left >= mid) rightStart = Math.min(rightStart, r.left);
        else leftEnd = rightStart = mid;
      }
      const inline = Math.max(0, 2 * Math.min(mid - leftEnd, rightStart - mid) - 2 * 14);
      const row = right - left;
      setHeaderRoom((prev) => (prev.inline === inline && prev.row === row ? prev : { inline, row }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasPartners]);

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
    // Écran bas : l'étiquette de couleur passe à droite de la défausse, les sièges s'en écartent d'autant
    if (short && myIndex >= 0) return rowSeats(n, area.w, area.h / 2, pileW * 2 + clamp(w * 0.05, 18, 40) + 2 * SHORT_LABEL_W);
    const padX = compact ? 46 : 82;
    // Le siège du haut tient tout entier sur le tapis : sous les mains des coéquipiers, il garde ses distances
    const padY = compact ? (hasPartners ? 62 : 52) : hasPartners ? 76 : 70;
    if (myIndex >= 0) return arcSeats(n, area, { x: padX, y: padY }, portrait, SEAT_BOX[compact ? "compact" : "wide"]);
    // Spectateur : tout le monde autour de la table
    const rx = Math.max(40, area.w / 2 - padX);
    const ry = Math.max(40, area.h / 2 - padY);
    return ordered.map((_, k) => {
      const theta = -Math.PI / 2 - ((k + 0.5) / n) * Math.PI * 2;
      return { x: area.w / 2 + rx * Math.cos(theta), y: area.h / 2 - ry * Math.sin(theta) };
    });
  }, [ordered, area, compact, myIndex, portrait, short, pileW, w, hasPartners]);

  // La pioche et la défausse : au milieu, ou un peu plus bas si un siège les touche
  const centerY = useMemo(
    () =>
      placeCenter({
        areaH: area.h,
        base: area.h * (portrait && ordered.length > 1 ? 0.57 : 0.5),
        cx: area.w / 2,
        block: { w: pileW * 2 + clamp(w * 0.05, 18, 40), h: pileW * 1.4 },
        below: short ? 0 : 30,
        seats: positions,
        seat: SEAT_BOX[compact ? "compact" : "wide"],
        margin: 4,
      }),
    [area, portrait, ordered.length, pileW, w, positions, compact],
  );

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
    if (card.kind === "number" && card.value === 7 && rules.sevenZero && ordered.filter((p) => !p.out).length > 1)
      return setTargetFor(card);
    act({
      type: "play",
      cardId: card.id,
      ...(card.kind === "number" && card.value === 7 && rules.sevenZero ? { target: ordered.find((p) => !p.out)?.id } : {}),
    });
  }

  const canDraw = myTurn && !g.rouletteVictim && !g.hasDrawn && !(rules.mustPlay && g.playable.length > 0 && g.pendingDraw === 0);

  // Tic-tac pendant les 5 dernieres secondes de mon tour
  useEffect(() => {
    if (!myTurn || !room.turnDeadline || g.settings.turnSeconds === 0) return;
    let last = -1;
    const timer = setInterval(() => {
      const left = Math.ceil((room.turnDeadline! - (Date.now() + serverOffset)) / 1000);
      if (left <= 5 && left > 0 && left !== last) {
        last = left;
        play("tick", { volume: left <= 2 ? 1.3 : 1 });
      }
    }, 200);
    return () => clearInterval(timer);
  }, [myTurn, room.turnDeadline, serverOffset, g.settings.turnSeconds]);

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
  const currentLeft = useCountdown(current?.awayAt ?? null, serverOffset);
  const currentAway = awayTurnNote(current, currentLeft);
  const vulnerable = g.unoVulnerable;

  let status: string;
  if (g.phase !== "playing") status = "";
  else if (!me) status = `Tu regardes la partie · au tour de ${current?.name ?? "…"}${currentAway}`;
  else if (mySeat?.autoplay) status = "Un bot joue à ta place";
  else if (!myTurn)
    status = g.rouletteVictim ? `${current?.name} fait tourner la roulette…` : `Au tour de ${current?.name ?? "…"}${currentAway}`;
  else if (isRouletteVictim) status = "Roulette ! Choisis la couleur à chercher";
  else if (g.canChallenge) status = `+${g.pendingDraw} sur toi ! Contester le bluff, cumuler ou encaisser ?`;
  else if (g.pendingDraw > 0)
    status = g.canStack ? `+${g.pendingDraw} ! Cumule une carte « + » ou encaisse` : `Tu encaisses +${g.pendingDraw}…`;
  else if (g.drawnCardId !== null) status = rules.mustPlay ? "Pose la carte piochée" : "Carte piochée jouable : la poser ou la garder ?";
  else if (g.playable.length === 0) status = "Aucune carte jouable : pioche !";
  else status = "À toi de jouer !";

  const timerTotal = g.settings.turnSeconds;

  const emoteSide = (
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
  );

  // Pas de UNO d'avance : avec deux cartes, le bouton reste éteint et dit quand il servira
  const unoLater = !rules.earlyUno && myTurn && g.hand.length === 2 && !myPlayer?.declaredUno && !g.canUno;
  const unoHelp = rules.earlyUno
    ? "Crier UNO"
    : "Crier UNO : pas de UNO d'avance, seulement une fois ta carte posée, avec ta dernière carte";
  const unoSide = (
    <div className="my-side my-side-right">
      <motion.button
        className={`uno-btn ${g.canUno ? "is-ready" : ""} ${vulnerable === me ? "is-urgent" : ""}`}
        disabled={!g.canUno}
        onClick={() => act({ type: "uno" })}
        whileTap={{ scale: 0.88 }}
        aria-label={unoHelp}
        title={rules.earlyUno ? undefined : "Pas de UNO d'avance : crie-le une fois ta carte posée"}
      >
        <Chip label="UNO" tone="red" size={compact ? 52 : 60} muted={!g.canUno} />
      </motion.button>
      <AnimatePresence>
        {unoLater && (
          <motion.span
            className="uno-later"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            aria-hidden="true"
          >
            après ta carte
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );

  // La pioche et les cartes qui volent : avec le dos de ce joueur
  return (
    <CardBackSkin.Provider value={mySeat?.back ?? "classique"}>
      <div className={`table-root felt ${short ? "is-short" : ""}`} ref={scope}>
        <header
          className={`table-top ${hasPartners ? "has-partners" : ""}`}
          ref={headerRef}
          style={hasPartners ? { ["--partner-h" as string]: `${Math.round(partnerCard * 1.4 + 10)}px` } : undefined}
        >
          <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <div className="table-title">
            <span className="table-code">{room.code}</span>
            <span className="hint">
              {g.settings.variant === "nomercy" ? "No Mercy" : "Classique"}
              {rules.earlyUno ? "" : " · sans UNO d'avance"}
              {g.settings.endMode === "points" ? ` · manche ${g.round} · objectif ${g.settings.targetScore}` : ""}
            </span>
          </div>
          {mySeat?.team !== undefined && (
            <p className="team-note" style={{ ["--team-color" as string]: TOUR_TEAM_COLORS[mySeat.team as 0 | 1] }}>
              Équipe {TOUR_TEAMS[mySeat.team as 0 | 1]}
            </p>
          )}
          {hasPartners && mySeat?.team !== undefined && headerRoom.row > 0 && (
            <PartnerBar
              partners={g.partners}
              seats={room.seats}
              players={g.players}
              turn={g.phase === "playing" ? g.turn : null}
              teamColor={TOUR_TEAM_COLORS[mySeat.team as 0 | 1]}
              compact={compact}
              short={short}
              tall={portrait && h >= 760}
              card={partnerCard}
              minCard={compact ? 24 : 32}
              inlineRoom={headerRoom.inline}
              rowRoom={headerRoom.row}
            />
          )}
          <div className="table-top-actions">
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setPrefs({ sound: !sound })}
              aria-label={sound ? "Couper le son" : "Activer le son"}
            >
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
                <motion.div
                  className="table-menu panel"
                  initial={{ y: -8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                >
                  {!inTour && (
                    <button className="menu-item" onClick={() => (setMenuOpen(false), onShowLobby())}>
                      <Icon name="users" size={18} /> Voir le salon et les règles
                    </button>
                  )}
                  <button className="menu-item" onClick={() => setPrefs({ colorblind: !usePrefs.getState().colorblind })}>
                    <Icon name="eye" size={18} /> Symboles de couleur
                  </button>
                  <button className="menu-item is-danger" onClick={onLeave}>
                    <Icon name="door" size={18} /> {inTour ? "Quitter la tournée" : "Quitter la table"}
                  </button>
                  {room.you.isAdmin && (
                    <ConfirmButton
                      className="menu-item is-danger"
                      confirm="Fermer la table pour tous ?"
                      onConfirm={() => send({ t: "close" })}
                    >
                      <Icon name="shield" size={18} /> Fermer la table (admin)
                    </ConfirmButton>
                  )}
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
            const partner = g.partners.some((x) => x.id === p.id);
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
                  vulnerable={vulnerable === p.id && me !== null && !myPlayer?.out && !partner}
                  onCatch={() => act({ type: "catch", target: p.id })}
                  mercyLimit={g.mercyLimit}
                  teamColor={seat.team !== undefined ? TOUR_TEAM_COLORS[seat.team as 0 | 1] : undefined}
                  partner={partner}
                />
              </div>
            );
          })}
          <div className="center-slot" style={{ top: centerY }}>
            <Center game={g} pileWidth={pileW} canDraw={canDraw} onDraw={() => act({ type: "draw" })} />
          </div>
        </div>

        {me && myPlayer && (
          <div className={`my-zone ${myTurn ? "is-turn" : ""}`}>
            <div className="my-bar">
              {compact && emoteSide}
              <div className="my-status">
                {myTurn && room.turnDeadline && timerTotal > 0 && (
                  <span className="my-timer">
                    <TimerRing size={30} deadline={room.turnDeadline} total={timerTotal} offset={serverOffset} />
                  </span>
                )}
                <AnimatePresence mode="wait">
                  <motion.span
                    key={status}
                    className="my-status-text"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                  >
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
              {compact && unoSide}
            </div>
            <div className="my-hand-row">
              {!compact && emoteSide}
              <Hand
                cards={hand}
                playable={playable}
                myTurn={myTurn}
                cardWidth={handW}
                onPlay={onCardClick}
                highlight={myTurn ? g.drawnCardId : null}
                maxRows={portrait ? 3 : h < 500 ? 1 : 2}
              />
              {!compact && unoSide}
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
        <ColorPicker
          open={isRouletteVictim}
          title="Roulette ! Quelle couleur chercher ?"
          onPick={(color) => act({ type: "roulette", color })}
        />
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

        {g.phase === "roundOver" && g.lastRound && (
          <RoundOver room={room} offset={serverOffset} onNext={room.you.isHost ? () => send({ t: "nextRound" }) : undefined} />
        )}
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
    </CardBackSkin.Provider>
  );
}
