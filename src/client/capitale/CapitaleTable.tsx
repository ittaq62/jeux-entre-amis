import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BUYABLE, JAIL_FINE, SQUARES, type DeckId } from "../../shared/games/capitale/board.ts";
import type { CapitaleAction, CapitaleEvent, Deed, Trade } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { CapitaleClientMessage, CapitaleRoomView, SeatView } from "../../shared/protocol.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { AwayNote } from "../game/AwayNote.tsx";
import { EmotePicker } from "../game/ChatPanel.tsx";
import { TimerRing } from "../game/Seat.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { formatClock, useCountdown } from "../lib/countdown.ts";
import { preloadSounds, startLoop, stopLoop } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { MusicToggle } from "../tour/TourParts.tsx";
import { Board3D } from "./Board3D.tsx";
import { colorOf, money } from "./boardUi.ts";
import { CapitaleGameOver } from "./CapitaleGameOver.tsx";
import { CAPITALE_SOUNDS, eventTimes, HOP_MS } from "./fx.ts";
import { breakdown, Note, Wallet } from "./Money.tsx";
import { CardReveal, DeedSheet, Offers, TitlesSheet, TradeModal, type TradeDraft } from "./Panels.tsx";
import type { EventBatch } from "./useCapitaleRoom.ts";

interface Props {
  room: CapitaleRoomView;
  batch: EventBatch;
  send: (msg: CapitaleClientMessage) => void;
  emotes: EmoteBubble[];
  serverOffset: number;
  unread: number;
  onOpenChat: () => void;
  onShowLobby: () => void;
  onLeave: () => void;
}

interface Bill {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  value: number;
}

/** Ce qui change les titres : on les montre changer à ce moment-là, pas avant */
const DEED_EVENTS = new Set<CapitaleEvent["type"]>([
  "buy",
  "auctionEnd",
  "build",
  "sell",
  "mortgage",
  "unmortgage",
  "special",
  "raze",
  "trade",
  "bankrupt",
]);

let billSeq = 0;

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/** Le centre d'un repère à l'écran : la liasse d'un joueur, la banque ou la cagnotte sur le plateau */
function anchorOf(account: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-cap-anchor="${CSS.escape(account)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Un nombre qui défile jusqu'à sa nouvelle valeur */
function Rolling({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{money(shown)}</>;
}

export function CapitaleTable({ room, batch, send, emotes, serverOffset, unread, onOpenChat, onShowLobby, onLeave }: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.capitale!;
  const me = g.you;
  const { w, h } = useViewport();
  const phone = w < 900;
  const sound = usePrefs((s) => s.sound);
  const music = usePrefs((s) => s.tourMusic);
  const reduced = usePrefs((s) => s.reducedEffects);
  const setPrefs = usePrefs((s) => s.set);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [titlesOpen, setTitlesOpen] = useState(false);
  const [deed, setDeed] = useState<number | null>(null);
  const [draft, setDraft] = useState<TradeDraft | null>(null);
  const seat = useCallback((id: string) => room.seats.find((s) => s.id === id), [room.seats]);
  const act = useCallback((action: CapitaleAction) => send({ t: "action", action }), [send]);

  useEffect(() => preloadSounds(CAPITALE_SOUNDS), []);
  useEffect(() => {
    if (sound && music && room.status === "playing") startLoop("tourMusic");
    else stopLoop("tourMusic");
  }, [sound, music, room.status]);
  useEffect(() => () => stopLoop("tourMusic"), []);
  useEffect(() => {
    if (g.step !== "over") setResultsHidden(false);
  }, [g.step]);

  // ---------------------------------------------------------------------------
  // Ce qu'on montre : en retard sur l'état, le temps des animations (pions, dés, billets, soldes)
  // ---------------------------------------------------------------------------
  const truth = useRef(g);
  truth.current = g;
  const [shown, setShown] = useState<Record<string, number>>(() => Object.fromEntries(g.players.map((p) => [p.id, p.position])));
  const [cash, setCash] = useState<Record<string, number>>(() => Object.fromEntries(g.players.map((p) => [p.id, p.cash])));
  const [dice, setDice] = useState<{ values: [number, number] | null; rollId: number }>({ values: g.dice, rollId: 0 });
  const [card, setCard] = useState<{ deck: DeckId; card: number; player: string } | null>(null);
  const [drawn, setDrawn] = useState<{ deck: DeckId; id: number } | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [deeds, setDeeds] = useState<(Deed | null)[]>(() => g.deeds);
  const [turn, setTurn] = useState<string | null>(() => g.players[g.turn]?.id ?? null);
  const deedsPending = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const lastBatch = useRef(0);

  useEffect(() => {
    if (batch.id === 0 || batch.id === lastBatch.current) return;
    lastBatch.current = batch.id;
    const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    const sync = () => {
      const now = truth.current;
      setShown(Object.fromEntries(now.players.map((p) => [p.id, p.position])));
      setCash(Object.fromEntries(now.players.map((p) => [p.id, p.cash])));
      setDeeds(now.deeds);
      setTurn(now.players[now.turn]?.id ?? null);
      deedsPending.current = false;
    };
    if (reduced || document.visibilityState !== "visible") {
      sync();
      const lastDice = batch.events.findLast((e) => e.type === "dice");
      if (lastDice?.type === "dice") setDice((d) => ({ values: lastDice.dice, rollId: d.rollId }));
      return;
    }
    const times = eventTimes(batch.events);
    // Les titres et le tour changent au moment de l'événement, pas à l'arrivée du lot
    const deedAt = batch.events.findIndex((e) => DEED_EVENTS.has(e.type) && (e.type !== "trade" || e.status === "accepted"));
    if (deedAt >= 0) {
      deedsPending.current = true;
      later(() => {
        deedsPending.current = false;
        setDeeds(truth.current.deeds);
      }, times[deedAt]!);
    } else setDeeds(truth.current.deeds);
    const turnAt = batch.events.findLastIndex((e) => e.type === "turn");
    if (turnAt >= 0) {
      const ev = batch.events[turnAt]!;
      if (ev.type === "turn") later(() => setTurn(ev.player), times[turnAt]!);
    } else setTurn(truth.current.players[truth.current.turn]?.id ?? null);
    batch.events.forEach((e: CapitaleEvent, i) => {
      const t = times[i]!;
      if (e.type === "dice") later(() => setDice((d) => ({ values: e.dice, rollId: d.rollId + 1 })), t);
      else if (e.type === "move") {
        if (e.jump || e.steps === 0) later(() => setShown((s) => ({ ...s, [e.player]: e.to })), t);
        else {
          const dir = Math.sign(e.steps);
          for (let k = 1; k <= Math.abs(e.steps); k++) {
            const sq = (((e.from + dir * k) % 40) + 40) % 40;
            later(() => setShown((s) => ({ ...s, [e.player]: sq })), t + k * HOP_MS);
          }
        }
      } else if (e.type === "money") {
        later(() => {
          setCash((c) => {
            const next = { ...c };
            if (e.from in next) next[e.from] = (next[e.from] ?? 0) - e.amount;
            if (e.to in next) next[e.to] = (next[e.to] ?? 0) + e.amount;
            return next;
          });
          const from = anchorOf(e.from);
          const to = anchorOf(e.to);
          if (from && to && e.amount > 0) {
            // De vrais billets, un par un : 350 ₣, ce sont trois billets de 100 et un de 50
            breakdown(e.amount, 8).forEach((value, k) => {
              later(() => {
                const id = ++billSeq;
                setBills((b) => [...b.slice(-16), { id, from, to, value }]);
                later(() => setBills((b) => b.filter((x) => x.id !== id)), 1000);
              }, k * 75);
            });
          }
        }, t);
      } else if (e.type === "card") {
        later(() => setDrawn({ deck: e.deck, id: batch.id * 100 + i }), t);
        later(() => setCard({ deck: e.deck, card: e.card, player: e.player }), t + 380);
        later(() => setCard((c) => (c && c.deck === e.deck && c.card === e.card ? null : c)), t + 3600);
      }
    });
    // À la fin du lot, on se cale sur l'état (au cas où un détail aurait échappé)
    later(sync, Math.max(0, ...times) + 1600);
  }, [batch, reduced]);

  // Une mise à jour sans événement (une reconnexion) : les titres suivent tout de suite
  useEffect(() => {
    if (!deedsPending.current) setDeeds(g.deeds);
  }, [g.deeds]);

  // ---------------------------------------------------------------------------
  // La situation
  // ---------------------------------------------------------------------------
  const mySeat = me ? seat(me) : undefined;
  const meP = me ? g.players.find((p) => p.id === me) : undefined;
  const myTurn = g.actor !== null && g.actor === me;
  const turnPlayer = g.players[g.turn];
  const name = (id: string | null | undefined) => (id ? (seat(id)?.name ?? "?") : "?");
  const timeLeft = useCountdown(room.endsAt, serverOffset);
  const auctionLeft = useCountdown(room.auctionDeadline, serverOffset);
  const highlight = g.auction ? g.auction.square : g.step === "buy" ? g.pendingBuy : null;
  const boardW = phone ? w - 12 : Math.max(420, w - 440);
  const boardH = phone ? Math.round((w - 12) * 0.95) : Math.max(420, h - 84);

  const startCounter = (t: Trade) => setDraft({ partner: t.from, give: t.get, get: t.give, replaces: t.id });

  return (
    <div className="table-root felt cap-root">
      <header className="table-top">
        <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <Icon name="menu" />
        </button>
        <div className="table-title">
          <span className="table-code">{room.code}</span>
          <span className="hint">
            Capitale,{" "}
            {g.step === "over"
              ? "partie terminée"
              : g.timeUp
                ? "dernier tour"
                : timeLeft !== null
                  ? `encore ${formatClock(timeLeft)}`
                  : "jusqu'à la faillite"}
          </span>
        </div>
        <div className="table-top-actions">
          <MusicToggle />
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

      <main className={`cap-stage ${phone ? "is-phone" : ""}`}>
        {phone && <Players g={g} room={room} seat={seat} cash={cash} serverOffset={serverOffset} compact />}
        <div className="cap-board-area" style={{ width: boardW, height: boardH }}>
          <Board3D
            g={g}
            shown={shown}
            deeds={deeds}
            turn={turn}
            dice={dice}
            card={drawn}
            highlight={highlight}
            phone={phone}
            reduced={reduced}
            onSquare={setDeed}
          />
          <p className="cap-board-info">
            Banque : {g.bankHouses} maison{g.bankHouses > 1 ? "s" : ""} · {g.bankHotels} hôtel{g.bankHotels > 1 ? "s" : ""}
            {g.settings.freeParking && g.pot > 0 && <> · cagnotte {money(g.pot)}</>}
          </p>
          <AnimatePresence>{card && <CardReveal card={card} who={card.player === me ? null : name(card.player)} />}</AnimatePresence>
        </div>
        <aside className="cap-side">
          {!phone && <Players g={g} room={room} seat={seat} cash={cash} serverOffset={serverOffset} />}
          {phone && meP && !meP.bankrupt && (
            <div className="cap-my-wallet panel" data-cap-anchor={me ?? undefined}>
              <span className="hint">Ton argent</span>
              <strong className="num">
                <Rolling value={cash[me!] ?? meP.cash} />
              </strong>
              <Wallet cash={cash[me!] ?? meP.cash} />
            </div>
          )}
          <Offers g={g} me={me} seat={seat} act={act} onCounter={startCounter} />
          <ActionBar
            g={g}
            room={room}
            me={me}
            myTurn={myTurn}
            meCash={meP?.cash ?? 0}
            name={name}
            auctionLeft={auctionLeft}
            serverOffset={serverOffset}
            act={act}
            onTitles={() => setTitlesOpen(true)}
            onTrade={() =>
              setDraft({ partner: null, give: { cash: 0, squares: [], jailCards: 0 }, get: { cash: 0, squares: [], jailCards: 0 } })
            }
            onTakeBack={mySeat?.autoplay ? () => send({ t: "takeBack" }) : undefined}
            turnName={name(turnPlayer?.id)}
          />
        </aside>
      </main>

      <div className="cap-bills" aria-hidden="true">
        <AnimatePresence>
          {bills.map((b) => (
            <motion.span
              key={b.id}
              className="cap-bill"
              initial={{ x: b.from.x, y: b.from.y, scale: 0.5, opacity: 0, rotate: -18 }}
              animate={{
                x: [b.from.x, (b.from.x + b.to.x) / 2 + ((b.id % 5) - 2) * 14, b.to.x],
                y: [b.from.y, Math.min(b.from.y, b.to.y) - 70 - (b.id % 3) * 16, b.to.y],
                scale: [0.5, 1.15, 0.75],
                opacity: [0, 1, 0.85],
                rotate: [-18, 8 + (b.id % 4) * 6, -4],
                scaleX: [1, 0.55, 1],
              }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            >
              <Note value={b.value} size="lg" />
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <div className="naval-emotes" aria-live="polite">
        <AnimatePresence>
          {emotes.map((e) => {
            const who = room.seats.find((s) => s.id === e.seatId || s.userId === e.userId);
            return (
              <motion.div
                key={e.id}
                className={`naval-emote ${e.emote.length <= 2 ? "is-emoji" : ""}`}
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {who && <Avatar avatar={who.avatar} userId={who.userId} photo={who.photo} size={26} />}
                <span>{e.emote}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {me && (
        <div className="naval-react cap-react">
          <button className="round-btn" onClick={() => setEmoteOpen(!emoteOpen)} aria-label="Réagir">
            <Icon name="smile" size={20} />
          </button>
          <EmotePicker
            open={emoteOpen}
            onClose={() => setEmoteOpen(false)}
            onPick={(emote) => {
              send({ t: "emote", emote });
              setEmoteOpen(false);
            }}
          />
        </div>
      )}

      <DeedSheet g={g} index={deed} me={me} seat={seat} act={act} onClose={() => setDeed(null)} />
      {me && <TitlesSheet g={g} me={me} open={titlesOpen} onClose={() => setTitlesOpen(false)} act={act} />}
      {me && <TradeModal g={g} me={me} seat={seat} draft={draft} onClose={() => setDraft(null)} act={act} />}

      {g.step === "over" && !resultsHidden && (
        <CapitaleGameOver
          room={room}
          onRematch={() => send(room.you.isHost ? { t: "start" } : { t: "rematch" })}
          onLobby={onShowLobby}
          onLeave={onLeave}
          onInspect={() => setResultsHidden(true)}
        />
      )}
      {g.step === "over" && resultsHidden && (
        <button className="btn btn-primary naval-results-back" onClick={() => setResultsHidden(false)}>
          Revoir le bilan
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les joueurs : argent, fortune, titres, et le chrono de celui qui décide
// ---------------------------------------------------------------------------

function Players({
  g,
  room,
  seat,
  cash,
  serverOffset,
  compact = false,
}: {
  g: CapitaleView;
  room: CapitaleRoomView;
  seat: (id: string) => SeatView | undefined;
  cash: Record<string, number>;
  serverOffset: number;
  compact?: boolean;
}) {
  return (
    <ul className={`cap-players ${compact ? "is-compact" : ""}`}>
      {g.players.map((p) => {
        const s = seat(p.id);
        const acting = g.actor === p.id;
        const titles = BUYABLE.filter((i) => g.deeds[i]!.owner === p.id);
        return (
          <li
            key={p.id}
            className={`cap-player ${acting ? "is-acting" : ""} ${g.players[g.turn]?.id === p.id ? "is-turn" : ""} ${p.bankrupt ? "is-out" : ""} ${p.id === g.you ? "is-me" : ""}`}
            style={{ ["--pawn" as string]: colorOf(g, p.id) }}
          >
            <span className="cap-player-avatar" data-cap-anchor={compact && p.id === g.you ? undefined : p.id}>
              {s && <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={compact ? 30 : 38} />}
              {acting && room.deadline && (
                <span className="cap-player-timer">
                  <TimerRing size={compact ? 38 : 46} deadline={room.deadline} total={g.settings.turnSeconds} offset={serverOffset} />
                </span>
              )}
            </span>
            <span className="cap-player-text">
              <strong>
                {s?.name}
                {s?.admin && !compact && <AdminBadge />}
              </strong>
              <span className="cap-player-cash num">{p.bankrupt ? "faillite" : <Rolling value={cash[p.id] ?? p.cash} />}</span>
              {!compact && (
                <span className="hint">
                  {p.bankrupt
                    ? "hors jeu"
                    : [
                        `fortune ${money(g.worth[p.id] ?? 0)}`,
                        p.inJail && "en prison",
                        p.jailCards.length > 0 && `${p.jailCards.length} carte${p.jailCards.length > 1 ? "s" : ""} sortie`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
              )}
              {!compact && !p.bankrupt && <Wallet cash={cash[p.id] ?? p.cash} />}
              {s && <AwayNote seat={s} serverOffset={serverOffset} compact />}
            </span>
            {!compact && (
              <span className="cap-player-deeds" aria-label={`${titles.length} titres`}>
                {titles.map((i) => (
                  <span
                    key={i}
                    className={`cap-mini ${g.deeds[i]!.mortgaged ? "is-mortgaged" : ""}`}
                    style={{ background: SQUARES[i]!.group ? `var(--g-${SQUARES[i]!.group})` : "#9fb4bb" }}
                  />
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// La barre d'action : ce qu'on peut faire, selon le moment
// ---------------------------------------------------------------------------

function ActionBar({
  g,
  room,
  me,
  myTurn,
  meCash,
  name,
  auctionLeft,
  serverOffset,
  act,
  onTitles,
  onTrade,
  onTakeBack,
  turnName,
}: {
  g: CapitaleView;
  room: CapitaleRoomView;
  me: string | null;
  myTurn: boolean;
  meCash: number;
  name: (id: string | null | undefined) => string;
  auctionLeft: number | null;
  serverOffset: number;
  act: (a: CapitaleAction) => void;
  onTitles: () => void;
  onTrade: () => void;
  onTakeBack?: () => void;
  turnName: string;
}) {
  const meP = me ? g.players.find((p) => p.id === me) : undefined;
  const playing = Boolean(meP && !meP.bankrupt) && g.step !== "over";
  const debt = g.debts[0];
  const a = g.auction;
  const canBid = a && me && g.bidders.includes(me) && a.high?.player !== me;
  const creditor = (c: string) => (c === "bank" ? "à la banque" : c === "pot" ? "à la cagnotte" : `à ${name(c)}`);

  let text: string;
  if (g.step === "over") text = "La partie est terminée.";
  else if (onTakeBack) text = "Un bot gère tes affaires en attendant.";
  else if (a) {
    const sq = SQUARES[a.square]!;
    text = `Enchère sur ${sq.name} (valeur ${money(sq.price!)}) : ${a.high ? `${money(a.high.amount)} par ${a.high.player === me ? "toi" : name(a.high.player)}` : "personne n'a encore misé"}`;
  } else if (debt) {
    text =
      debt.debtor === me
        ? `Tu dois ${money(debt.amount)} ${creditor(debt.creditor)} : vends ou hypothèque.`
        : `${name(debt.debtor)} doit trouver ${money(debt.amount)}.`;
  } else if (g.step === "buy" && g.pendingBuy !== null) {
    const sq = SQUARES[g.pendingBuy]!;
    text = myTurn ? `${sq.name} est libre : l'acheter ${money(sq.price!)} ?` : `${turnName} hésite devant ${sq.name}.`;
  } else if (g.step === "roll") {
    if (!myTurn) text = `Au tour de ${turnName}.`;
    else if (meP?.inJail) text = `Tu es en prison (${meP.jailTurns + 1}e tour) : tente un double, paie ${JAIL_FINE} ou utilise une carte.`;
    else text = g.rollAgain ? "Double ! Relance les dés." : "À toi de lancer les dés.";
  } else text = myTurn ? "Construis, échange, puis finis ton tour." : `${turnName} gère ses affaires.`;

  const bid = (inc: number) => (a?.high?.amount ?? 0) + inc;

  return (
    <div className={`cap-actions panel ${myTurn || canBid ? "is-mine" : ""}`}>
      <p className="cap-action-text">
        {myTurn && room.deadline && (
          <span className="cap-action-timer">
            <TimerRing size={26} deadline={room.deadline} total={g.settings.turnSeconds} offset={serverOffset} />
          </span>
        )}
        {text}
        {a && auctionLeft !== null && <span className="cap-auction-clock num">{auctionLeft} s</span>}
      </p>
      <div className="cap-action-buttons">
        {onTakeBack && (
          <button className="btn btn-primary" onClick={onTakeBack}>
            Reprendre la main
          </button>
        )}
        {!onTakeBack && myTurn && g.step === "roll" && (
          <>
            <button className="btn btn-primary btn-lg" onClick={() => act({ type: "roll" })}>
              Lancer les dés
            </button>
            {meP?.inJail && (
              <>
                <button className="btn" disabled={meCash < JAIL_FINE} onClick={() => act({ type: "payJail" })}>
                  Payer {JAIL_FINE}
                </button>
                {meP.jailCards.length > 0 && (
                  <button className="btn" onClick={() => act({ type: "useJailCard" })}>
                    Utiliser la carte
                  </button>
                )}
              </>
            )}
          </>
        )}
        {!onTakeBack && myTurn && g.step === "buy" && g.pendingBuy !== null && (
          <>
            <button
              className="btn btn-primary btn-lg"
              disabled={meCash < SQUARES[g.pendingBuy]!.price!}
              onClick={() => act({ type: "buy" })}
            >
              Acheter {money(SQUARES[g.pendingBuy]!.price!)}
            </button>
            <button className="btn" onClick={() => act({ type: "decline" })}>
              Aux enchères
            </button>
          </>
        )}
        {!onTakeBack && canBid && (
          <>
            {[10, 50, 100].map((inc) => (
              <button
                key={inc}
                className="btn btn-primary"
                disabled={bid(inc) > meCash}
                onClick={() => act({ type: "bid", amount: bid(inc) })}
              >
                {money(bid(inc))}
              </button>
            ))}
            <button className="btn btn-ghost" onClick={() => act({ type: "pass" })}>
              Passer
            </button>
          </>
        )}
        {!onTakeBack && a && me && a.high?.player === me && <span className="hint">Tu mènes l'enchère.</span>}
        {!onTakeBack && debt?.debtor === me && (
          <ConfirmButton className="btn btn-ghost" confirm="Tout abandonner ?" onConfirm={() => act({ type: "bankrupt" })}>
            Faire faillite
          </ConfirmButton>
        )}
        {!onTakeBack && myTurn && g.step === "manage" && (
          <button className="btn btn-primary btn-lg" onClick={() => act({ type: "endTurn" })}>
            Finir le tour
          </button>
        )}
        {playing && !onTakeBack && (
          <>
            <button className={`btn ${debt?.debtor === me ? "btn-primary" : ""}`} onClick={onTitles}>
              Mes titres
            </button>
            {!a && (
              <button className="btn" onClick={onTrade}>
                Échanger
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
