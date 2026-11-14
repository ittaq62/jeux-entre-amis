import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SQUARES, teamName, type DeckId } from "../../shared/games/capitale/board.ts";
import {
  canUpgrade,
  monopolyProgress,
  rentFor,
  teamRules,
  type CapitaleAction,
  type CapitaleEvent,
  type Deed,
  type MonopolyProgress,
  type Trade,
} from "../../shared/games/capitale/engine.ts";
import { batchMs, cardReadMs } from "../../shared/games/capitale/timing.ts";
import type { CapitaleClientMessage, CapitaleRoomView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { EmotePicker } from "../game/ChatPanel.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { formatClock, useCountdown } from "../lib/countdown.ts";
import { preloadSounds, startLoop, stopLoop } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { MusicToggle } from "../tour/TourParts.tsx";
import { Board3D } from "./Board3D.tsx";
import { asState, colorOf, money } from "./boardUi.ts";
import { CapitaleGameOver } from "./CapitaleGameOver.tsx";
import { CityPanel, MyCities } from "./CityPanel.tsx";
import { Corners, Rolling } from "./Corners.tsx";
import { CAPITALE_SOUNDS, eventTimes, HOP_MS } from "./fx.ts";
import { breakdown, Hand, Note } from "./Money.tsx";
import { describe, Journal, Narrator, pushLine, type Line } from "./Narration.tsx";
import { Offers, TradeModal, type TradeDraft } from "./Panels.tsx";
import { AuctionPrompt, BuyPrompt, CardShow, DebtPrompt, JailChoices } from "./Prompts.tsx";
import { squareFacts, SquareTip } from "./SquareInfo.tsx";
import type { EventBatch } from "./useCapitaleRoom.ts";
import { MonopolyPanel, TeamBar, TeamHelp } from "./TeamParts.tsx";
import { inTeams, sidesOf, teamIn } from "./teamsUi.tsx";
import { useViewport } from "../lib/viewport.ts";

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
  "upgrade",
  "sell",
  "special",
  "raze",
  "mortgage",
  "unmortgage",
  "trade",
  "bankrupt",
]);

let billSeq = 0;
let lineSeq = 0;

/** Le centre d'un repère à l'écran : le portrait d'un joueur, mes billets, la banque ou la cagnotte sur le plateau */
function anchorOf(account: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-cap-anchor="${CSS.escape(account)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function CapitaleTable({ room, batch, send, emotes, serverOffset, unread, onOpenChat, onShowLobby, onLeave }: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.capitale!;
  const me = g.you;
  const { w } = useViewport();
  const phone = w < 900;
  const sound = usePrefs((s) => s.sound);
  const music = usePrefs((s) => s.tourMusic);
  const reduced = usePrefs((s) => s.reducedEffects);
  const setPrefs = usePrefs((s) => s.set);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const [monoOpen, setMonoOpen] = useState(false);
  /** La fiche d'une case ouverte au milieu de l'écran */
  const [city, setCity] = useState<number | null>(null);
  const [draft, setDraft] = useState<TradeDraft | null>(null);
  const [tip, setTip] = useState<{ square: number; x: number; y: number } | null>(null);
  /** Le joueur dont on veut voir le pion (un clic sur son portrait) */
  const [look, setLook] = useState<{ id: string; n: number } | null>(null);
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
    // La partie finie, le bilan passe devant : le détail du Monopole se ferme
    else setMonoOpen(false);
  }, [g.step]);

  // ---------------------------------------------------------------------------
  // Ce qu'on montre : en retard sur l'état, le temps des animations (pions, dés, billets, soldes)
  // ---------------------------------------------------------------------------
  const truth = useRef(g);
  truth.current = g;
  const [shown, setShown] = useState<Record<string, number>>(() => Object.fromEntries(g.players.map((p) => [p.id, p.position])));
  const [cash, setCash] = useState<Record<string, number>>(() => Object.fromEntries(g.players.map((p) => [p.id, p.cash])));
  const [dice, setDice] = useState<{ values: [number, number] | null; rollId: number }>({ values: g.dice, rollId: 0 });
  /** La carte tirée, au milieu : le temps de la lire (read), puis elle s'en va quand elle agit */
  const [card, setCard] = useState<{ deck: DeckId; card: number; player: string; key: number; read: number } | null>(null);
  const [drawn, setDrawn] = useState<{ deck: DeckId; id: number } | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [deeds, setDeeds] = useState<(Deed | null)[]>(() => g.deeds);
  const [turn, setTurn] = useState<string | null>(() => g.players[g.turn]?.id ?? null);
  const [lines, setLines] = useState<Line[]>([]);
  const [deltas, setDeltas] = useState<{ id: number; player: string; amount: number }[]>([]);
  /** Le plateau montre encore un coup : les boutons attendent la fin */
  const [busy, setBusy] = useState(false);
  const [busyTick, setBusyTick] = useState(0);
  const busyUntil = useRef(0);
  const deedsPending = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const lastBatch = useRef(0);
  const nameRef = useRef<(id: string) => string>(() => "?");
  nameRef.current = (id: string) => (id === g.you ? "toi" : (room.seats.find((s) => s.id === id)?.name ?? "?"));

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
    const say = (ev: CapitaleEvent) => {
      const line = describe(ev, { g: truth.current, name: (id) => nameRef.current(id) });
      if (line) setLines((l) => pushLine(l, line, ++lineSeq));
    };
    // Tombé sur sa propre rue : la fiche s'ouvre d'elle-même, avec le bouton Améliorer
    const offerUpgrade = () => {
      const now = truth.current;
      const meNow = now.players.find((p) => p.id === now.you);
      if (!meNow || now.actor !== now.you || now.step !== "manage") return;
      const landed = batch.events.some((e) => e.type === "move" && e.player === now.you && e.to === meNow.position && !e.jump);
      if (landed && canUpgrade(asState(now), meNow.id, meNow.position) === null) setCity(meNow.position);
    };
    if (reduced || document.visibilityState !== "visible") {
      sync();
      batch.events.forEach(say);
      const lastDice = batch.events.findLast((e) => e.type === "dice");
      if (lastDice?.type === "dice") setDice((d) => ({ values: lastDice.dice, rollId: d.rollId }));
      offerUpgrade();
      return;
    }
    // Un lot qui arrive pendant qu'on montre le précédent attend son tour : jamais deux coups à la fois à l'écran
    const now = Date.now();
    const offset = Math.max(0, busyUntil.current - now);
    const end = now + offset + batchMs(batch.events) + 250;
    busyUntil.current = end;
    setBusy(true);
    setBusyTick((n) => n + 1);
    const times = eventTimes(batch.events).map((t) => t + offset);
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
      // La phrase arrive avec l'événement ; pour les dés, quand ils se sont posés
      later(() => say(e), e.type === "dice" ? t + 1250 : t);
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
          // + et − qui montent des portraits
          const pops = [
            ...(e.from !== "bank" && e.from !== "pot" ? [{ player: e.from, amount: -e.amount }] : []),
            ...(e.to !== "bank" && e.to !== "pot" ? [{ player: e.to, amount: e.amount }] : []),
          ].map((x) => ({ ...x, id: ++billSeq }));
          if (pops.length > 0) {
            setDeltas((d) => [...d.slice(-8), ...pops]);
            later(() => setDeltas((d) => d.filter((x) => !pops.includes(x))), 1800);
          }
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
        const key = batch.id * 100 + i;
        const read = cardReadMs(e.deck, e.card);
        later(() => setDrawn({ deck: e.deck, id: key }), t);
        later(() => setCard({ deck: e.deck, card: e.card, player: e.player, key, read }), t + 380);
        // Elle reste jusqu'à ce qu'elle agisse (le pion part, l'argent bouge), un peu plus pour voir l'effet
        later(() => setCard((c) => (c?.key === key ? null : c)), t + read + 700);
      }
    });
    // À la fin du lot, on se cale sur l'état (au cas où un détail aurait échappé)
    later(
      () => {
        sync();
        offerUpgrade();
      },
      end - now + 400,
    );
  }, [batch, reduced]);

  // La fin du coup à l'écran : les boutons reviennent (un nouveau lot repousse l'échéance)
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(
      () => (busyUntil.current <= Date.now() + 20 ? setBusy(false) : setBusyTick((n) => n + 1)),
      Math.max(0, busyUntil.current - Date.now()) + 30,
    );
    return () => clearTimeout(t);
  }, [busy, busyTick]);

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
  const name = (id: string | null | undefined) => (id ? (seat(id)?.name ?? "?") : "?");
  const timeLeft = useCountdown(room.endsAt, serverOffset);
  const auctionLeft = useCountdown(room.auctionDeadline, serverOffset);
  const highlight = g.auction ? g.auction.square : g.step === "buy" ? g.pendingBuy : null;
  const tokenKey = room.seats.map((s) => `${s.id}:${s.token ?? ""}`).join(",");
  const tokens = useMemo(() => Object.fromEntries(room.seats.map((s) => [s.id, s.token])), [tokenKey]);
  const debt = g.debts[0];
  const myDebt = debt && debt.debtor === me ? debt : null;
  const onTakeBack = mySeat?.autoplay ? () => send({ t: "takeBack" }) : undefined;
  const turnPlayer = g.players[g.turn];

  // L'étiquette de chaque case : son prix si elle est libre, sinon son loyer à la couleur du propriétaire
  const shownState = useMemo(() => asState({ ...g, deeds }), [g, deeds]);
  const teams = inTeams(g);
  const tagOf = (i: number) => {
    const d = deeds[i];
    const sq = SQUARES[i]!;
    if (!d?.owner) return { text: money(sq.price!), color: null, level: 0, muted: false, mark: null };
    const color = colorOf(g, d.owner);
    // En équipes, la forme de l'équipe du propriétaire, devant le loyer
    const mark = teamIn(g, d.owner);
    if (d.mortgaged) return { text: "hypothéquée", color, level: 0, muted: true, mark };
    if (sq.kind === "utility") return { text: "× dés", color, level: 0, muted: false, mark };
    return { text: money(rentFor(shownState, i, { diceTotal: 7 })), color, level: d.level ?? 0, muted: false, mark };
  };

  // Au Monopole : où en est le camp de chacun (calculé sur les titres tels qu'on les montre)
  const mono = useMemo(() => {
    if (!g.settings.monopoly) return null;
    const out: Record<string, MonopolyProgress> = {};
    for (const side of sidesOf(g)) {
      const p = monopolyProgress(shownState, side.rep);
      for (const id of side.members) out[id] = p;
    }
    return out;
  }, [g, shownState]);
  // Un camp n'est plus qu'à un titre de gagner : tout le monde est prévenu, une fois par menace
  const threats = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!g.settings.monopoly || g.step === "over") return;
    for (const side of sidesOf(g)) {
      const p = monopolyProgress(shownState, side.rep);
      const key = p.winning.join(",");
      const before = threats.current[side.key] ?? "";
      threats.current[side.key] = key;
      if (!key || key === before) continue;
      const names = p.winning.map((i) => SQUARES[i]!.name);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} ou ${names.at(-1)}` : names[0]!;
      const mine = Boolean(g.you && side.members.includes(g.you));
      const who = side.team !== null ? `aux ${teamName(side.team)}` : `à ${nameRef.current(side.rep)}`;
      const text = mine
        ? `Monopole : plus qu'un titre pour gagner, ${list} !`
        : `Attention : il ne manque plus que ${list} ${who} pour gagner !`;
      setLines((l) => pushLine(l, { text, tone: mine ? "good" : "bad", who: side.rep }, ++lineSeq));
    }
  }, [shownState, g]);

  const startCounter = (t: Trade) => setDraft({ partner: t.from, give: t.get, get: t.give, replaces: t.id });
  const openTrade = () =>
    setDraft({ partner: null, give: { cash: 0, squares: [], jailCards: 0 }, get: { cash: 0, squares: [], jailCards: 0 } });
  const creditor = (c: string) => (c === "bank" ? "à la banque" : c === "pot" ? "à la cagnotte" : `à ${name(c)}`);

  // Ce qu'on attend de moi, au milieu de l'écran (une chose à la fois)
  let prompt: React.ReactNode = null;
  if (g.step !== "over" && !onTakeBack && me) {
    if (g.auction) {
      prompt = <AuctionPrompt g={g} me={me} cash={meP?.cash ?? 0} left={auctionLeft} busy={busy} act={act} name={name} />;
    } else if (myDebt && !citiesOpen && city === null) {
      prompt = <DebtPrompt amount={myDebt.amount} to={creditor(myDebt.creditor)} onCities={() => setCitiesOpen(true)} act={act} />;
    } else if (myTurn && g.step === "buy" && g.pendingBuy !== null && !busy) {
      prompt = <BuyPrompt g={g} index={g.pendingBuy} cash={meP?.cash ?? 0} busy={busy} act={act} name={name} />;
    }
  }

  // Le grand bouton du bas : lancer les dés, ou finir son tour ; sinon, qui joue
  let main: React.ReactNode;
  if (g.step === "over") main = <span className="cap-wait">Partie terminée</span>;
  else if (onTakeBack)
    main = (
      <button className="cap-go" onClick={onTakeBack}>
        Reprendre la main
      </button>
    );
  else if (myTurn && g.step === "roll")
    main = (
      <button className="cap-go is-roll" disabled={busy} onClick={() => act({ type: "roll" })}>
        <Icon name="dice" size={26} /> {g.rollAgain ? "Relancer !" : "Lancer les dés"}
      </button>
    );
  else if (myTurn && g.step === "manage")
    main = (
      <button className="cap-go is-end" disabled={busy} onClick={() => act({ type: "endTurn" })}>
        <Icon name="check" size={24} /> Finir le tour
      </button>
    );
  else
    main = (
      <span className="cap-wait" style={{ ["--pawn" as string]: turnPlayer ? colorOf(g, turnPlayer.id) : "var(--gold)" }}>
        {g.auction ? "Enchère en cours…" : myTurn ? "À toi de choisir" : `Au tour de ${name(turnPlayer?.id)}…`}
      </span>
    );

  const playing = Boolean(meP && !meP.bankrupt) && g.step !== "over";
  const facts = tip ? squareFacts(g, tip.square, (id) => name(id)) : null;

  return (
    <div className={`table-root cap-root cap-bright ${phone ? "is-phone" : ""} ${teams || g.settings.monopoly ? "has-strip" : ""}`}>
      <header className="table-top">
        <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <Icon name="menu" />
        </button>
        <div className="table-title">
          <span className="table-code">{room.code}</span>
          <span className="hint">
            Capitale{teams && !phone ? " en équipes" : ""}
            {g.settings.monopoly && !phone ? " · Monopole" : ""},{" "}
            {g.step === "over"
              ? "partie terminée"
              : g.timeUp
                ? "dernier tour"
                : timeLeft !== null
                  ? `encore ${formatClock(timeLeft)}`
                  : "jusqu'à la faillite"}
          </span>
        </div>
        {teams && !phone && <TeamBar g={g} name={name} phone={false} />}
        <div className="table-top-actions">
          {g.settings.monopoly && !phone && (
            <button className="btn btn-ghost cap-mono-btn" onClick={() => setMonoOpen(true)} title="Monopole : où en est chacun">
              Monopole
            </button>
          )}
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setJournalOpen(true)}
            aria-label="Le journal de la partie"
            title="Journal"
          >
            <Icon name="list" />
          </button>
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

      <main className="cap-arena">
        <div className="cap-board-zone">
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
            onSquare={(i) => {
              setTip(null);
              setCity(i);
            }}
            onHover={(i, x, y) => setTip(i === null ? null : { square: i, x, y })}
            tagOf={tagOf}
            tokens={tokens}
            name={(id) => (id === me ? "toi" : name(id))}
            look={look}
          />
          <Narrator lines={lines} g={g} seat={seat} />
          {g.settings.freeParking && g.pot > 0 && <p className="cap-board-info">Cagnotte {money(g.pot)}</p>}
        </div>
        <Corners
          g={g}
          room={room}
          seat={seat}
          cash={cash}
          deltas={deltas}
          serverOffset={serverOffset}
          turn={turn}
          phone={phone}
          onPick={(id) => setLook((l) => ({ id, n: (l?.n ?? 0) + 1 }))}
          mono={mono}
          onMonopoly={() => setMonoOpen(true)}
          footer={
            phone && (teams || g.settings.monopoly) ? (
              <div className="cap-strip">
                {teams && <TeamBar g={g} name={name} phone />}
                {g.settings.monopoly && (
                  <button
                    className={`cap-strip-mono ${mono && Object.values(mono).some((p) => p.winning.length > 0) ? "is-close" : ""}`}
                    onClick={() => setMonoOpen(true)}
                  >
                    Monopole
                  </button>
                )}
              </div>
            ) : null
          }
        />

        <div className="cap-bar">
          {meP && !meP.bankrupt && (
            <Hand cash={cash[me!] ?? meP.cash} anchor={me!}>
              <span className="cap-hand-total num">
                <Rolling value={cash[me!] ?? meP.cash} />
              </span>
            </Hand>
          )}
          <div className="cap-bar-main">
            {myTurn && g.step === "roll" && meP?.inJail && !onTakeBack && (
              <JailChoices cash={meP.cash} cards={meP.jailCards.length} busy={busy} act={act} />
            )}
            {main}
            {playing && !onTakeBack && (
              <div className="cap-bar-more">
                <button className="cap-small" onClick={() => setCitiesOpen(true)}>
                  <Icon name="build" size={18} /> Mes villes
                </button>
                {!g.auction && (
                  <button className="cap-small" onClick={openTrade}>
                    <Icon name="swap" size={18} /> {teams && teamRules(g).gifts ? "Échanger, donner" : "Échanger"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <Offers g={g} me={me} seat={seat} act={act} onCounter={startCounter} name={name}>
          <TeamHelp g={g} me={me} seat={seat} act={act} />
        </Offers>
      </main>

      <AnimatePresence>{prompt}</AnimatePresence>
      <AnimatePresence>
        {city !== null && (
          <CityPanel key={city} g={g} index={city} me={me} act={act} name={(id) => name(id)} onClose={() => setCity(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {citiesOpen && me && (
          <MyCities
            g={g}
            me={me}
            act={act}
            onOpen={(i) => {
              setCitiesOpen(false);
              setCity(i);
            }}
            onClose={() => setCitiesOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {card && <CardShow key={card.key} card={card} seat={seat(card.player)} mine={card.player === me} onClose={() => setCard(null)} />}
      </AnimatePresence>
      {facts && tip && !phone && <SquareTip facts={facts} x={tip.x} y={tip.y} />}

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

      <Journal open={journalOpen} onClose={() => setJournalOpen(false)} lines={lines} />
      {g.settings.monopoly && <MonopolyPanel g={{ ...g, deeds }} open={monoOpen} onClose={() => setMonoOpen(false)} name={name} />}
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
