import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { LONG_WORD, REFUSALS, type FuseMode } from "../../shared/games/meche/engine.ts";
import { fuseProgress, type MechePlayerView } from "../../shared/games/meche/view.ts";
import { cleanShown, normalizeWord, promptRange } from "../../shared/games/meche/words.ts";
import type { MecheClientMessage, MecheRoomView, SeatView } from "../../shared/protocol.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { AwayNote } from "../game/AwayNote.tsx";
import { EmotePicker } from "../game/ChatPanel.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { MECHE_SOUNDS, play, preloadSounds, startLoop, stopLoop, vibrate } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { Dynamite, FuseRope, ropeStart } from "./FuseRope.tsx";
import { MecheGameOver } from "./MecheGameOver.tsx";
import { useTyping, type EventBatch, type RefusedWord } from "./useMecheRoom.ts";

interface Props {
  room: MecheRoomView;
  send: (msg: MecheClientMessage) => void;
  batch: EventBatch;
  refused: RefusedWord | null;
  emotes: EmoteBubble[];
  serverOffset: number;
  unread: number;
  chatOpen: boolean;
  onOpenChat: () => void;
  onShowLobby: () => void;
  onLeave: () => void;
}

/** Ce que rappelle le médaillon pendant les premières mèches, selon le mode */
const MODE_TIPS: Record<FuseMode, string> = {
  commune: "Une mèche neuve à chaque tour",
  rallonge: "Chaque mot fait reculer la mèche",
  chacun: "Ta mèche ne brûle qu'à ton tour",
};

/** Ce qui se touche pour lui-même : toucher ailleurs rend la main au champ du mot */
const INTERACTIVE = "button, a, input, textarea, .table-menu, .emote-picker, .emote-catcher, .overlay";

/** Le tirage de celui qui commence : l'aiguille fait deux tours avant de s'arrêter */
const SPIN_MS = 2000;
/** L'allumette : elle part du joueur, arrive sur la corde et la gratte à ce moment-là */
const MATCH_MS = 1250;
const MATCH_STRIKE_MS = 950;

/**
 * La partie de l'écran que l'on voit vraiment : sur téléphone, le clavier en cache la moitié. Le clavier n'est ouvert
 * que si un champ a la main : sinon, on prend tout l'écran (certains iPhone gardent une vue réduite ou décalée une
 * fois le clavier refermé).
 */
function readVisibleArea() {
  const v = window.visualViewport;
  const field = document.activeElement;
  const typing = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement;
  const vh = v?.height ?? window.innerHeight;
  return {
    w: window.innerWidth,
    h: Math.round(typing ? vh : Math.max(vh, window.innerHeight)),
    // Le navigateur a pu décaler la vue pour montrer le champ : la table suit ce décalage
    top: Math.round(typing ? (v?.offsetTop ?? 0) : 0),
  };
}

/** La taille visible de l'écran : sur téléphone, la table doit rester tout entière au-dessus du clavier */
function useVisibleArea() {
  const [area, setArea] = useState(readVisibleArea);
  useEffect(() => {
    let frame = 0;
    let until = 0;
    const update = () => {
      const next = readVisibleArea();
      setArea((a) => (a.w === next.w && a.h === next.h && a.top === next.top ? a : next));
    };
    // Le clavier s'ouvre et se ferme en glissant, et tous les navigateurs ne préviennent pas quand il s'arrête :
    // on suit la vue image par image pendant un moment
    const follow = () => {
      until = performance.now() + 900;
      cancelAnimationFrame(frame);
      const step = () => {
        update();
        if (performance.now() < until) frame = requestAnimationFrame(step);
      };
      step();
    };
    const v = window.visualViewport;
    const targets: EventTarget[] = v ? [window, v] : [window];
    const kinds = ["resize", "scroll"];
    for (const t of targets) for (const k of kinds) t.addEventListener(k, follow);
    window.addEventListener("focusin", follow);
    window.addEventListener("focusout", follow);
    return () => {
      cancelAnimationFrame(frame);
      for (const t of targets) for (const k of kinds) t.removeEventListener(k, follow);
      window.removeEventListener("focusin", follow);
      window.removeEventListener("focusout", follow);
    };
  }, []);
  return area;
}

/** La taille de la scène, mesurée : tout le cercle se calcule dessus */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

interface Spot {
  x: number;
  y: number;
}

interface SeatSpot extends Spot {
  /** L'angle depuis le centre de la table, en degrés, dans le sens des aiguilles d'une montre (90 : en bas) */
  angle: number;
  /** Dans la moitié haute : son nom passe au-dessus de l'avatar, pour ne pas mordre sur la table */
  up: boolean;
}

interface Layout {
  cx: number;
  cy: number;
  tableR: number;
  avatar: number;
  seats: SeatSpot[];
  /** Le bas du cercle des joueurs : la place en dessous sert aux derniers mots, sur téléphone */
  bottom: number;
}

/**
 * Les joueurs en rond autour d'une table ronde, soi en bas puis les autres dans le sens où passe la mèche.
 * `ownFuse` : chacun a sa mèche, en petit sous ses allumettes, et il lui faut sa place.
 */
function tableLayout(w: number, h: number, count: number, phone: boolean, short: boolean, ownFuse: boolean): Layout {
  // Un écran d'ordinateur peu haut (portable) : des joueurs un peu plus petits, pour laisser de la place à la table
  const low = !phone && h < 640;
  const avatar = short ? 32 : phone ? 42 : low ? 52 : 64;
  // La place du nom et des allumettes (et de sa mèche), au-dessus ou au-dessous de l'avatar
  const info = (short ? 14 : phone ? 32 : low ? 44 : 50) + (ownFuse ? (short ? 9 : phone ? 11 : 15) : 0);
  const halfWidth = phone ? 34 : 64;
  const R = Math.max(70, Math.min(w / 2 - halfWidth - 4, h / 2 - avatar / 2 - info - 6, 420));
  const tableR = R - avatar / 2 - (phone ? 10 : 20);
  const cx = w / 2;
  // Sur un grand téléphone, le cercle et les derniers mots en dessous sont centrés ensemble dans la hauteur
  const ring = R + avatar / 2 + info;
  const cy = phone && !short ? Math.max(ring + 8, Math.min(h / 2, (h - 2 * ring - 70) / 2 + ring)) : h / 2;
  const seats = Array.from({ length: count }, (_, i) => {
    const angle = 90 + (i * 360) / count;
    const rad = (angle * Math.PI) / 180;
    return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad), angle, up: Math.sin(rad) < -0.35 };
  });
  return { cx, cy, tableR, avatar, seats, bottom: cy + R + avatar / 2 + info };
}

/**
 * L'aiguille tourne toujours dans le sens de la mèche, jamais à rebours. Au début d'une partie (`draw`), elle tire
 * au sort celui qui commence : deux tours complets avant de s'arrêter sur lui.
 */
function useNeedle(target: number | null, draw: boolean) {
  const [angle, setAngle] = useState(90);
  // La fin du tirage, en heure de l'appareil : un minuteur la fait tomber, recréé à chaque fois que l'effet repasse
  const [spinUntil, setSpinUntil] = useState(0);
  const [, wake] = useState(0);
  const drawn = useRef(false);
  useEffect(() => {
    if (target === null) return;
    const turn = (a: number) => a + ((((target - a) % 360) + 360) % 360);
    if (draw && !drawn.current) {
      drawn.current = true;
      setSpinUntil(Date.now() + SPIN_MS);
      // Deux images plus tard : l'aiguille est déjà dessinée à son point de départ, la rotation se voit
      requestAnimationFrame(() => requestAnimationFrame(() => setAngle((a) => turn(a) + 720)));
      return;
    }
    // La partie suivante tirera de nouveau au sort
    if (!draw) drawn.current = false;
    setAngle(turn);
  }, [target, draw]);
  useEffect(() => {
    const left = spinUntil - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => wake((n) => n + 1), left + 20);
    return () => clearTimeout(t);
  }, [spinUntil]);
  const spinning = spinUntil > Date.now();
  return { angle, spinning };
}

let fxSeq = 0;

interface Trail {
  id: number;
  from: DOMRect;
  to: DOMRect;
}

interface SeatWord {
  key: number;
  shown: string;
  long: boolean;
  earned: boolean;
}

interface Blast extends Spot {
  key: number;
  /** D'où part la bombe qui saute jusqu'à lui (le rebord de la table) */
  from: Spot;
}

export function MecheTable({
  room,
  send,
  batch,
  refused,
  emotes,
  serverOffset,
  unread,
  chatOpen,
  onOpenChat,
  onShowLobby,
  onLeave,
}: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.meche!;
  const { w, h, top } = useVisibleArea();
  const phone = w < 760;
  const short = phone && h < 520;
  const sound = usePrefs((s) => s.sound);
  const setPrefs = usePrefs((s) => s.set);
  const reduced = usePrefs((s) => s.reducedEffects);
  const [stageRef, stage] = useSize<HTMLElement>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [hot, setHot] = useState(false);
  const [boom, setBoom] = useState<{ key: number; id: string; out: boolean } | null>(null);
  const [blast, setBlast] = useState<Blast | null>(null);
  const [scorched, setScorched] = useState<{ id: string; match: number } | null>(null);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [words, setWords] = useState<Record<string, SeatWord | undefined>>({});
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const [rejected, setRejected] = useState<RefusedWord | null>(null);
  /** L'allumette qui rallume la mèche entre deux explosions (et au tout début, après le tirage) : décidée en entrant dans la pause */
  const [matchFor, setMatchFor] = useState<{ key: string; delay: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lastBatch = useRef(batch.id);
  const lastTyped = useRef({ at: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 });
  /** La mèche que l'allumette a déjà allumée à l'écran (pour ne pas rejouer le grattement au démarrage) */
  const struck = useRef(-1);

  const meId = room.you.seatId;
  const me = g.players.find((p) => p.id === meId);
  const seat = useCallback((id: string) => room.seats.find((s) => s.id === id), [room.seats]);
  const lit = g.phase === "lit";
  const mine = lit && g.holder === meId;
  const canType = me?.alive === true && g.phase !== "over";
  const holderName = seat(g.holder)?.name ?? "";
  const mode = g.settings.mode ?? "commune";
  // Soi en bas de la table, puis les autres dans l'ordre où la mèche passe
  const myIndex = g.players.findIndex((p) => p.id === meId);
  const order = myIndex > 0 ? [...g.players.slice(myIndex), ...g.players.slice(0, myIndex)] : g.players;
  const layout = tableLayout(stage.w, stage.h, order.length, phone, short, mode === "chacun");
  const spotOf = (id: string) => layout.seats[order.findIndex((p) => p.id === id)];
  // L'aiguille montre qui tient la mèche ; à la fin, le gagnant
  const pointed = g.phase === "over" ? (g.ranking?.[0] ?? g.holder) : g.holder;
  const pointedSpot = spotOf(pointed);
  // Rien avant que la table soit dessinée : le tirage doit se voir tourner
  const needle = useNeedle(stage.w > 0 && pointedSpot ? pointedSpot.angle : null, g.phase === "break" && g.fuse === 0);
  const medal = Math.round(layout.tableR * (phone ? 1.28 : 1.24));
  const mySpot = myIndex >= 0 ? layout.seats[0] : undefined;
  // Le rebord de la table où la corde commence, et celui où se pose la bombe, dans la scène
  const start = ropeStart(layout.tableR);
  const ropeHead = { x: layout.cx - layout.tableR + start.x, y: layout.cy - layout.tableR + start.y };
  const bombSpot = { x: layout.cx, y: layout.cy - layout.tableR + 14 };

  useEffect(() => preloadSounds(MECHE_SOUNDS), []);
  useEffect(() => () => stopLoop(), []);

  // La mèche grésille tant qu'elle brûle
  useEffect(() => {
    if (lit && sound) startLoop("mecheFuse");
    else stopLoop("mecheFuse");
  }, [lit, sound]);

  // Le tic-tac : de plus en plus serré à mesure que l'étincelle avance
  const burning = g.burning;
  useEffect(() => {
    if (!burning) return;
    let timer: ReturnType<typeof setTimeout>;
    let flip = false;
    const beat = () => {
      const p = fuseProgress(burning, Date.now() + serverOffset);
      const inRed = p >= burning.risk;
      flip = !flip;
      play("mecheTick", { rate: flip ? 1 : 0.82, volume: inRed ? 1 : 0.45 + p * 0.4 });
      timer = setTimeout(beat, inRed ? Math.max(140, 300 - (p - 0.5) * 300) : 950 - p * 620);
    };
    timer = setTimeout(beat, 500);
    return () => clearTimeout(timer);
  }, [burning, serverOffset]);

  // Le tirage au sort : l'aiguille cliquette en ralentissant
  useEffect(() => {
    if (!needle.spinning) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 0;
    for (let k = 0, gap = 45; k < 12; k++, gap *= 1.2) {
      at += gap;
      timers.push(setTimeout(() => play("mecheTick", { rate: 1.25, volume: 0.6 }), at));
    }
    return () => timers.forEach(clearTimeout);
  }, [needle.spinning]);

  // Les événements de la partie : les sons, les mots qui s'affichent sur les joueurs, l'explosion
  useEffect(() => {
    if (batch.id === lastBatch.current) return;
    lastBatch.current = batch.id;
    for (const e of batch.events) {
      if (e.type === "lit") {
        // L'allumette l'a déjà grattée à l'écran ; sinon (arrivé en cours, effets réduits), on l'entend ici
        if (struck.current !== e.fuse - 1) play("mecheStrike");
        if (e.holder === meId) myTurn();
      } else if (e.type === "word") {
        play("mecheWord", { rate: e.long ? 0.86 : 1 });
        if (e.earned) play("tourTrophyMine", { delay: 90, volume: e.id === meId ? 1 : 0.5 });
        showWord(e.id, e.shown ?? e.word, e.long, e.earned);
        flyTo(e.id, e.next);
        if (e.next === meId) myTurn();
      } else if (e.type === "pass") {
        play("wild", { volume: 0.7 });
        flyTo(e.id, e.next);
        if (e.next === meId) myTurn();
      } else if (e.type === "boom") {
        explode(e.id, e.lives);
      } else if (e.type === "over") {
        play(e.winner === meId ? "tourApplause" : "capLose", { delay: 1300 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch]);

  function myTurn() {
    play("capTurn", { volume: 0.8 });
    vibrate([25, 40, 25]);
  }

  function showWord(id: string, shown: string, long: boolean, earned: boolean) {
    const key = ++fxSeq;
    setWords((prev) => ({ ...prev, [id]: { key, shown, long, earned } }));
    setTimeout(() => setWords((prev) => (prev[id]?.key === key ? { ...prev, [id]: undefined } : prev)), 2600);
  }

  function flyTo(from: string, to: string) {
    if (usePrefs.getState().reducedEffects) return;
    const a = document.querySelector(`[data-seat="${from}"] .meche-seat-avatar`)?.getBoundingClientRect();
    const b = document.querySelector(`[data-seat="${to}"] .meche-seat-avatar`)?.getBoundingClientRect();
    if (!a || !b) return;
    const id = ++fxSeq;
    setTrails((prev) => [...prev.slice(-4), { id, from: a, to: b }]);
    setTimeout(() => setTrails((prev) => prev.filter((t) => t.id !== id)), 420);
  }

  function explode(id: string, lives: number) {
    const out = lives === 0;
    stopLoop("mecheFuse");
    play("mecheBoom");
    if (out) play("capBankrupt", { delay: 500 });
    if (id === meId) vibrate([120, 50, 200]);
    const key = ++fxSeq;
    setBoom({ key, id, out });
    setTimeout(() => setBoom((b) => (b?.key === key ? null : b)), 1500);
    // L'allumette perdue brûle, et le joueur reste noirci de suie un moment
    setScorched({ id, match: lives });
    setTimeout(() => setScorched((s) => (s?.id === id ? null : s)), 2600);
    if (usePrefs.getState().reducedEffects) return;
    const spot = spotOf(id);
    if (spot) {
      setBlast({ key, x: spot.x, y: spot.y, from: bombSpot });
      setTimeout(() => setBlast((b) => (b?.key === key ? null : b)), 1600);
    }
    const at = document.querySelector(`[data-seat="${id}"] .meche-seat-avatar`)?.getBoundingClientRect();
    if (at) {
      void confetti({
        particleCount: 54,
        spread: 360,
        startVelocity: 28,
        gravity: 0.9,
        ticks: 95,
        scalar: 0.85,
        colors: ["#2a211a", "#ff9a3c", "#ffd36b", "#7a6a5c", "#e5442c"],
        origin: { x: (at.left + at.width / 2) / window.innerWidth, y: (at.top + at.height / 2) / window.innerHeight },
      });
    }
  }

  // Une nouvelle main : le champ se vide, et il reprend la main si c'est à soi (le clavier du téléphone reste ouvert)
  useEffect(() => {
    setText("");
    setRejected(null);
    if (lastTyped.current.timer) clearTimeout(lastTyped.current.timer);
    if (canType && !chatOpen) input.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.turn, g.phase, canType]);

  // Le mot refusé : on le montre un instant avec sa raison, et le mien s'efface pour réessayer tout de suite
  useEffect(() => {
    if (!refused || refused.turn !== g.turn) return;
    setRejected(refused);
    if (refused.id === meId) {
      setText("");
      play("mecheRefused");
      vibrate(30);
    } else {
      play("mecheRefused", { volume: 0.5 });
    }
    const t = setTimeout(() => setRejected((r) => (r?.key === refused.key ? null : r)), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refused]);

  // Au clavier sur ordinateur : on tape où qu'on soit, le champ récupère la frappe
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (chatOpen || menuOpen || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      input.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen, menuOpen]);

  useEffect(() => {
    if (!g.ranking) setResultsHidden(false);
  }, [g.ranking]);

  // En entrant dans une pause : l'allumette partira pour arriver juste avant que la mèche s'allume (pas si on arrive trop tard)
  useEffect(() => {
    if (g.phase !== "break" || reduced) return setMatchFor(null);
    const delay = g.breakUntil - (Date.now() + serverOffset) - MATCH_MS - 100;
    setMatchFor(delay > 150 - MATCH_STRIKE_MS ? { key: `${g.fuse}-${g.breakUntil}`, delay: Math.max(0, delay) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.phase, g.breakUntil, g.fuse, reduced]);

  function onInput(raw: string) {
    if (!mine) {
      if (input.current) input.current.value = "";
      return;
    }
    const value = raw.slice(0, 44);
    setText(value);
    // Pas plus d'un envoi toutes les 45 ms, mais la dernière lettre part toujours
    const typed = lastTyped.current;
    if (typed.timer) clearTimeout(typed.timer);
    const flush = () => {
      typed.at = Date.now();
      typed.timer = 0;
      send({ t: "typing", text: cleanShown(value), turn: g.turn });
    };
    const wait = 45 - (Date.now() - typed.at);
    if (wait <= 0) flush();
    else typed.timer = setTimeout(flush, wait);
  }

  /** Envoie le mot écrit, s'il y en a un et que c'est à soi */
  function sendTyped() {
    if (mine && normalizeWord(text)) send({ t: "word", word: text, turn: g.turn });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    sendTyped();
  }

  function passNow() {
    if (mine && me && me.passes > 0) send({ t: "pass", turn: g.turn });
    input.current?.focus({ preventScroll: true });
  }

  /** Toucher la table : le mot écrit part (le réflexe de beaucoup), et le clavier reste ouvert */
  function tapTable() {
    sendTyped();
    input.current?.focus({ preventScroll: true });
  }

  // Sur téléphone, la table tient dans ce qu'on voit au-dessus du clavier (et rien ne l'oblige à prendre tout l'écran)
  const area = phone ? ({ position: "fixed", top, left: 0, right: 0, height: h, minHeight: 0 } as CSSProperties) : undefined;
  // Les rappels des premières mèches : ce qui fait le mode d'abord, puis les accents, puis les passes
  const tip =
    g.fuse <= 1
      ? MODE_TIPS[mode]
      : g.fuse === 2
        ? "Accents libres"
        : g.fuse === 3 && g.settings.passes && medal >= 300
          ? `${LONG_WORD} lettres ou plus : une passe`
          : null;
  const starterSpot = g.phase === "break" ? spotOf(g.holder) : undefined;

  return (
    <div
      className={`table-root felt meche-root ${phone ? "is-phone" : ""} ${short ? "is-short" : ""}`}
      style={area}
      onPointerDown={(e) => {
        // À la souris : cliquer à côté rend la main au clavier
        const el = e.target as HTMLElement;
        if (e.pointerType === "mouse" && canType && !el.closest(INTERACTIVE)) {
          setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
        }
      }}
      onTouchEnd={(e) => {
        // Au doigt : toucher la table ou un joueur ne ferme pas le clavier (et l'ouvre s'il était fermé). Le champ
        // reprend la main dans le geste même, sans quoi l'iPhone n'ouvrirait pas le clavier.
        const el = e.target as HTMLElement;
        if (!canType || el.closest(INTERACTIVE)) return;
        e.preventDefault();
        if (el.closest(".meche-table")) tapTable();
        else input.current?.focus({ preventScroll: true });
      }}
    >
      <header className="table-top">
        <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <Icon name="menu" />
        </button>
        <div className="table-title">
          <span className="table-code">{room.code}</span>
          <span className="hint">
            Mèche, {g.wordsPlayed} mot{g.wordsPlayed > 1 ? "s" : ""}
          </span>
        </div>
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

      <main ref={stageRef} className={`meche-stage ${boom && !reduced ? "is-shaking" : ""}`}>
        {stage.w > 0 && (
          <>
            <section
              className={`meche-table ${mine ? "is-mine" : ""} ${hot ? "is-hot" : ""}`}
              aria-label="La table"
              style={{
                left: layout.cx - layout.tableR,
                top: layout.cy - layout.tableR,
                width: layout.tableR * 2,
                height: layout.tableR * 2,
              }}
            >
              <FuseRope
                fuse={burning}
                glide={mode === "rallonge"}
                serverOffset={serverOffset}
                onHot={setHot}
                hot={hot}
                bombGone={(g.phase === "break" && g.fuse > 0) || g.phase === "over"}
              />
              <div
                className={`meche-needle ${needle.spinning ? "is-spinning" : ""}`}
                style={{ width: layout.tableR - 16, rotate: `${needle.angle}deg` }}
                aria-hidden="true"
              >
                <svg viewBox="0 0 100 24" preserveAspectRatio="none">
                  <path d="M0 8.5 L74 9.5 L74 2 L100 12 L74 22 L74 14.5 L0 15.5 Z" className="needle-body" />
                  <path d="M2 10.5 L74 11 L74 5 L94 12" className="needle-shine" />
                </svg>
              </div>
              <div className={`meche-medal ${mine ? "is-mine" : ""}`} style={{ "--m": `${medal}px` } as CSSProperties}>
                {lit ? (
                  <>
                    <p className={`meche-who ${mine ? "is-mine" : ""}`}>{mine ? "À toi !" : `À ${holderName}`}</p>
                    <div className="meche-letters" aria-label={`Lettres à placer : ${g.letters}`}>
                      {g.letters.toUpperCase()}
                    </div>
                    <LiveWord
                      mine={mine}
                      myText={text}
                      letters={g.letters}
                      holder={g.holder}
                      turn={g.turn}
                      rejected={rejected}
                      medal={medal}
                      hint={phone && canType && !focused ? "Touche la table pour écrire" : tip}
                      call={phone && canType && !focused}
                      sendHint={phone}
                    />
                  </>
                ) : g.phase === "break" ? (
                  <Starter seat={seat(g.holder)} isMe={g.holder === meId} drawing={needle.spinning} medal={medal} />
                ) : (
                  <p className="meche-who">C'est fini !</p>
                )}
              </div>
              {canType && (
                <form className="meche-form" onSubmit={submit}>
                  {/* Toute la table ouvre le clavier (et envoie le mot écrit) ; le champ lui-même, invisible, reste
                      petit et en haut : le téléphone n'a pas à faire défiler la page pour le montrer au-dessus du clavier */}
                  <label
                    className="meche-tap"
                    htmlFor="meche-mot"
                    aria-hidden="true"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      tapTable();
                    }}
                  />
                  <input
                    ref={input}
                    id="meche-mot"
                    className="meche-input"
                    value={mine ? text : ""}
                    onChange={(e) => onInput(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Tab" && mine && me && me.passes > 0) {
                        e.preventDefault();
                        passNow();
                      }
                    }}
                    type="text"
                    name="mot"
                    aria-label="Ton mot"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="send"
                    data-form-type="other"
                    data-lpignore="true"
                  />
                </form>
              )}
            </section>

            {order.map((p, i) => {
              const s = seat(p.id);
              const spot = layout.seats[i];
              if (!s || !spot) return null;
              return (
                <MecheSeat
                  key={p.id}
                  seat={s}
                  player={p}
                  total={g.settings.lives}
                  holder={g.holder === p.id && g.phase !== "over"}
                  hot={hot && g.holder === p.id}
                  isMe={p.id === meId}
                  word={words[p.id]}
                  emotes={emotes.filter((e) => e.seatId === p.id || e.userId === s.userId)}
                  serverOffset={serverOffset}
                  spot={spot}
                  avatar={layout.avatar}
                  blown={boom?.id === p.id}
                  scorched={scorched?.id === p.id ? scorched.match : null}
                  ownFuse={mode === "chacun" ? { burning: lit && g.holder === p.id, since: g.heldSince } : null}
                />
              );
            })}

            <AnimatePresence>
              {mine && me && me.passes > 0 && mySpot && (
                <motion.button
                  className="btn meche-pass"
                  type="button"
                  onClick={passNow}
                  // Le clavier reste ouvert : le champ garde la main pendant le geste
                  onMouseDown={(e) => e.preventDefault()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    passNow();
                  }}
                  style={{ left: mySpot.x + layout.avatar / 2 + (phone ? 40 : 66), top: mySpot.y }}
                  initial={{ x: -8, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Passer{phone ? "" : " (Tab)"} <span className="meche-pass-count num">{me.passes}</span>
                </motion.button>
              )}
            </AnimatePresence>

            {phone && !short && g.log.length > 0 && stage.h - layout.bottom > 56 && (
              <ol className="meche-recent" style={{ top: layout.bottom + 14 }} aria-label="Les derniers mots">
                {[...g.log]
                  .reverse()
                  .slice(0, 4)
                  .map((l) => (
                    <li key={l.word}>
                      <strong>{(l.shown ?? l.word).toUpperCase()}</strong>
                      <span>{seat(l.by)?.name}</span>
                    </li>
                  ))}
              </ol>
            )}

            {starterSpot && matchFor && (
              <MatchStrike
                key={matchFor.key}
                from={starterSpot}
                to={ropeHead}
                delay={matchFor.delay}
                onStrike={() => {
                  struck.current = g.fuse;
                  play("mecheStrike");
                }}
              />
            )}

            <AnimatePresence>{blast && <BlastFx key={blast.key} blast={blast} phone={phone} />}</AnimatePresence>

            <AnimatePresence>
              {boom && (
                <motion.div
                  key={boom.key}
                  className="meche-burst"
                  aria-live="polite"
                  style={{ left: layout.cx, top: layout.cy, width: Math.min(layout.tableR * 1.9, 430) }}
                  initial={{ scale: 0.3, rotate: -14 }}
                  animate={{ scale: 1, rotate: -4 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 520, damping: 16 }}
                >
                  <svg viewBox="0 0 200 200" aria-hidden="true">
                    <path
                      d="M100 4l15 41 34-29-8 44 44-11-29 35 40 15-41 12 28 34-44-8 8 44-34-29-15 42-13-42-36 29 9-44-44 8 29-34-41-12 40-15-29-35 44 11-8-44 34 29z"
                      fill="#f4a13a"
                      stroke="#2a1a0e"
                      strokeWidth="5"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M100 32l10 29 24-20-6 31 31-8-20 25 28 10-29 9 20 24-31-6 6 31-24-20-10 29-9-29-25 20 6-31-31 6 20-24-29-9 28-10-20-25 31 8-6-31 25 20z"
                      fill="#ffe08a"
                    />
                  </svg>
                  <strong>BOUM !</strong>
                  <span>
                    {boom.id === meId
                      ? boom.out
                        ? "Plus d'allumette pour toi"
                        : "Une allumette de moins"
                      : `${seat(boom.id)?.name} ${boom.out ? "n'a plus d'allumette" : "perd une allumette"}`}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {!phone && g.log.length > 0 && (
          <aside className="meche-log" aria-label="Les mots déjà joués">
            <h3>Déjà joués</h3>
            <ol>
              {[...g.log]
                .reverse()
                .slice(0, 7)
                .map((l) => (
                  <li key={l.word}>
                    <span className="meche-log-word">{(l.shown ?? l.word).toUpperCase()}</span>
                    <span className="meche-log-who">{seat(l.by)?.name}</span>
                  </li>
                ))}
            </ol>
          </aside>
        )}

        {me && !phone && (
          <div className="meche-react">
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
      </main>

      <div className="trail-layer" aria-hidden="true">
        {trails.map((t) => (
          <motion.span
            key={t.id}
            className="meche-trail"
            initial={{ x: t.from.left + t.from.width / 2, y: t.from.top + t.from.height / 2, scale: 0.7 }}
            animate={{ x: t.to.left + t.to.width / 2, y: t.to.top + t.to.height / 2, scale: [0.7, 1.15, 0.7] }}
            transition={{ duration: 0.34, ease: "easeInOut" }}
          />
        ))}
      </div>

      {boom && !reduced && <span key={boom.key} className="meche-flash" aria-hidden="true" />}

      {g.ranking && !resultsHidden && (
        <MecheGameOver
          room={room}
          onRematch={() => send(room.you.isHost ? { t: "start" } : { t: "rematch" })}
          onLobby={onShowLobby}
          onLeave={onLeave}
          onInspect={() => setResultsHidden(true)}
        />
      )}
      {g.ranking && resultsHidden && (
        <button className="btn btn-primary meche-results-back" onClick={() => setResultsHidden(false)}>
          Revoir les résultats
        </button>
      )}
    </div>
  );
}

/** Le mot en train de s'écrire, tel qu'il est tapé (accents compris), les lettres imposées en couleur dès qu'elles y sont */
function LiveWord({
  mine,
  myText,
  letters,
  holder,
  turn,
  rejected,
  medal,
  hint,
  call,
  sendHint,
}: {
  mine: boolean;
  myText: string;
  letters: string;
  holder: string;
  turn: number;
  rejected: RefusedWord | null;
  medal: number;
  hint: string | null;
  /** Le rappel invite à toucher la table : le clavier est fermé, il faut le voir */
  call: boolean;
  /** Sur téléphone : rappeler que toucher la table envoie le mot écrit */
  sendHint: boolean;
}) {
  const typing = useTyping();
  const text = mine ? cleanShown(myText) : typing.id === holder && typing.turn === turn ? typing.text : "";
  const last = useRef(text);

  // Les autres entendent les touches, tout doucement
  useEffect(() => {
    if (!mine && text.length > last.current.length) play("brickMove", { volume: 0.5 });
    last.current = text;
  }, [text, mine]);

  // Les longs mots rapetissent pour tenir dans le médaillon
  const fit = (chars: number) => ({ fontSize: Math.round(Math.min(medal * 0.13, (medal * 0.8) / Math.max(1, chars) / 0.52)) });

  if (rejected && text.length === 0) {
    return (
      <div className="meche-word is-refused" key={rejected.key}>
        <span className="meche-word-text" style={fit(rejected.word.length)}>
          {rejected.word.toUpperCase()}
        </span>
        <span className="meche-word-why">{REFUSALS[rejected.reason]}</span>
      </div>
    );
  }
  const range = promptRange(text, letters);
  const shown = text.toUpperCase();
  return (
    <div className={`meche-word ${range ? "has-letters" : ""}`}>
      {text.length === 0 ? (
        mine ? (
          <span className="meche-word-hint">
            {medal < 240 ? "Un mot avec ces lettres" : "Écris un mot avec ces lettres"}
            <span className="meche-caret" />
          </span>
        ) : (
          <span className="meche-word-dots">
            <i />
            <i />
            <i />
          </span>
        )
      ) : (
        <span className="meche-word-text" style={fit(text.length)}>
          {range ? (
            <>
              {shown.slice(0, range[0])}
              <mark>{shown.slice(range[0], range[1])}</mark>
              {shown.slice(range[1])}
            </>
          ) : (
            shown
          )}
          {mine && <span className="meche-caret" />}
        </span>
      )}
      {hint && text.length === 0 && <span className={`meche-word-tip ${call ? "is-call" : ""}`}>{hint}</span>}
      {sendHint && mine && text.length > 0 && <span className="meche-word-tip is-send">Touche la table pour envoyer</span>}
    </div>
  );
}

/** Entre deux mèches, au centre : celui qui va allumer la suivante. Au tout début, un point d'interrogation pendant le tirage. */
function Starter({ seat, isMe, drawing, medal }: { seat: SeatView | undefined; isMe: boolean; drawing: boolean; medal: number }) {
  return (
    <AnimatePresence mode="wait">
      {drawing || !seat ? (
        <motion.div key="tirage" className="meche-letters meche-draw" exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.18 }}>
          ?
        </motion.div>
      ) : (
        <motion.div
          key={seat.id}
          className="meche-starter"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 20 }}
        >
          <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={Math.round(medal * 0.36)} />
          <span className="meche-who is-mine">{isMe ? "Toi" : seat.name}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** L'allumette : elle part de celui qui commence, file vers le bout de la corde, la gratte et l'enflamme */
function MatchStrike({ from, to, delay, onStrike }: { from: Spot; to: Spot; delay: number; onStrike: () => void }) {
  const strike = useRef(onStrike);
  strike.current = onStrike;
  useEffect(() => {
    const t = setTimeout(() => strike.current(), delay + MATCH_STRIKE_MS);
    return () => clearTimeout(t);
  }, [delay]);
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 70 };
  const d = delay / 1000;
  const flameAt = `${(delay + MATCH_STRIKE_MS - 60) / 1000}s`;
  return (
    <>
      <motion.div
        className="meche-match-fly"
        initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.5, rotate: -60 }}
        animate={{
          x: [from.x, from.x, mid.x, to.x, to.x + 16],
          y: [from.y, from.y - 14, mid.y, to.y, to.y + 6],
          opacity: [0, 1, 1, 1, 0],
          scale: [0.5, 1, 1.1, 1, 0.9],
          rotate: [-60, -45, -15, 25, 40],
        }}
        transition={{ delay: d, duration: MATCH_MS / 1000, times: [0, 0.14, 0.5, 0.76, 1], ease: "easeInOut" }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 16 64" width="16" height="64">
          <rect x="6" y="14" width="4.4" height="48" rx="1.6" fill="#e6c78f" stroke="#8d6a3e" strokeWidth="0.8" />
          <ellipse cx="8.2" cy="10" rx="6" ry="8" fill="#d8402f" />
          <ellipse cx="6.6" cy="7.4" rx="2" ry="2.6" fill="#f08a78" />
        </svg>
        <span className="meche-match-flame" style={{ animationDelay: flameAt }} />
      </motion.div>
      <motion.span
        className="meche-strike-flare"
        style={{ left: to.x, top: to.y }}
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 1, 0.85], scale: [0.2, 1.5, 1] }}
        transition={{ delay: d + MATCH_STRIKE_MS / 1000, duration: 0.45 }}
        aria-hidden="true"
      />
    </>
  );
}

/** L'explosion chez celui qui tenait la mèche : la bombe lui saute dessus, une onde de choc, de la fumée */
function BlastFx({ blast, phone }: { blast: Blast; phone: boolean }) {
  const puffs = useRef(
    Array.from({ length: 8 }, (_, i) => ({
      dx: Math.cos((i / 8) * Math.PI * 2 + Math.random()) * (phone ? 34 : 60),
      dy: Math.sin((i / 8) * Math.PI * 2 + Math.random()) * (phone ? 26 : 44) - (phone ? 26 : 40),
      size: (phone ? 34 : 54) * (0.7 + Math.random() * 0.6),
      delay: 0.12 + Math.random() * 0.18,
    })),
  ).current;
  return (
    <motion.div
      className="meche-blast"
      style={{ left: blast.x, top: blast.y }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      aria-hidden="true"
    >
      <motion.div
        className="meche-blast-bomb"
        initial={{ x: blast.from.x - blast.x, y: blast.from.y - blast.y, scale: 0.8, opacity: 1 }}
        animate={{ x: 0, y: 0, scale: [0.8, 1, 1.5], opacity: [1, 1, 0] }}
        transition={{ duration: 0.32, times: [0, 0.6, 1], ease: "easeIn" }}
      >
        <Dynamite />
      </motion.div>
      <motion.span
        className="meche-shock"
        initial={{ scale: 0.15, opacity: 0.95 }}
        animate={{ scale: phone ? 2.2 : 3.2, opacity: 0 }}
        transition={{ delay: 0.12, duration: 0.7, ease: "easeOut" }}
      />
      <motion.span
        className="meche-shock is-inner"
        initial={{ scale: 0.1, opacity: 1 }}
        animate={{ scale: phone ? 1.4 : 2, opacity: 0 }}
        transition={{ delay: 0.16, duration: 0.5, ease: "easeOut" }}
      />
      {puffs.map((p, i) => (
        <motion.span
          key={i}
          className="meche-smoke"
          style={{ width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
          animate={{ x: p.dx, y: p.dy, scale: [0.3, 1, 1.5], opacity: [0, 0.85, 0] }}
          transition={{ delay: p.delay, duration: 1.3, ease: "easeOut" }}
        />
      ))}
    </motion.div>
  );
}

function Match({ burnt, burning }: { burnt: boolean; burning: boolean }) {
  return (
    <svg
      className={`meche-match ${burnt ? "is-burnt" : ""} ${burning ? "is-burning" : ""}`}
      viewBox="0 0 10 30"
      width="10"
      height="30"
      aria-hidden="true"
    >
      {burnt ? (
        <>
          <path d="M5 29V15c0-3 2-4 1.5-7S4 5 5 2" fill="none" stroke="#6d6158" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="5" cy="2.5" r="1.6" fill="#a8a095" />
          {burning && <ellipse className="meche-match-fire" cx="5" cy="3" rx="3.6" ry="5.6" />}
        </>
      ) : (
        <>
          <rect x="3.6" y="8" width="2.8" height="21" rx="1" fill="#e6c78f" />
          <ellipse cx="5" cy="6" rx="3.4" ry="4.6" fill="#d8402f" />
          <ellipse cx="4.1" cy="4.6" rx="1.1" ry="1.5" fill="#f08a78" />
        </>
      )}
    </svg>
  );
}

/** Chacun sa mèche : la sienne, en petit sous son nom, qui brûle pendant qu'il la tient, et les secondes qui lui restent */
function OwnFuse({
  bank,
  bankMax,
  burning,
  since,
  serverOffset,
}: {
  bank: number;
  bankMax: number;
  burning: boolean;
  since: number;
  serverOffset: number;
}) {
  const fill = useRef<HTMLSpanElement>(null);
  const secs = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const left = burning ? Math.max(0, bank - (Date.now() + serverOffset - since)) : bank;
      const p = Math.max(0, Math.min(1, left / Math.max(1, bankMax)));
      if (fill.current) {
        fill.current.style.width = `${p * 100}%`;
        fill.current.classList.toggle("is-low", p < 0.25);
      }
      const s = String(Math.ceil(left / 1000));
      if (secs.current && secs.current.textContent !== s) secs.current.textContent = s;
      if (burning) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [bank, bankMax, burning, since, serverOffset]);
  return (
    <span className={`meche-ownfuse ${burning ? "is-burning" : ""}`} title="Sa mèche : les secondes qui lui restent">
      <span className="meche-ownfuse-bar">
        <span ref={fill} />
      </span>
      <span ref={secs} className="meche-ownfuse-secs num" />
    </span>
  );
}

function MecheSeat({
  seat,
  player,
  total,
  holder,
  hot,
  isMe,
  word,
  emotes,
  serverOffset,
  spot,
  avatar,
  blown,
  scorched,
  ownFuse,
}: {
  seat: SeatView;
  player: MechePlayerView;
  total: number;
  holder: boolean;
  hot: boolean;
  isMe: boolean;
  word: SeatWord | undefined;
  emotes: EmoteBubble[];
  serverOffset: number;
  spot: SeatSpot;
  avatar: number;
  blown: boolean;
  /** L'allumette qui vient de brûler, quand la mèche lui a sauté au nez */
  scorched: number | null;
  ownFuse: { burning: boolean; since: number } | null;
}) {
  return (
    <div
      className={`meche-seat ${spot.up ? "is-up" : ""} ${holder ? "is-holder" : ""} ${hot ? "is-hot" : ""} ${player.alive ? "" : "is-out"} ${isMe ? "is-me" : ""} ${blown ? "is-blown" : ""} ${scorched !== null ? "is-sooty" : ""}`}
      style={{ left: spot.x, top: spot.y, "--a": `${avatar}px` } as CSSProperties}
      data-seat={player.id}
    >
      <div className="meche-seat-avatar">
        <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={avatar} title={seat.name} />
        {seat.kind === "bot" && (
          <span className="seat-tag" title="Bot">
            <Icon name="bot" size={12} />
          </span>
        )}
        {seat.autoplay && seat.kind === "human" && (
          <span className="seat-tag seat-tag-auto" title="Un bot joue à sa place">
            <Icon name="bot" size={12} />
          </span>
        )}
        {!seat.connected && (
          <span className="seat-tag seat-tag-off" title="Déconnecté">
            <Icon name="wifiOff" size={12} />
          </span>
        )}
        {player.place !== null && <span className="rank-badge num">{player.place}</span>}
        <AnimatePresence>
          {word && (
            <motion.span
              key={word.key}
              className={`meche-seat-word ${word.long ? "is-long" : ""}`}
              initial={{ y: spot.up ? -6 : 6, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 26 }}
            >
              {word.shown.toUpperCase()}
              {word.earned && <span className="meche-seat-earned">+1 passe</span>}
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {emotes.map((e) => (
            <motion.div
              key={e.id}
              className={`emote-bubble ${e.emote.length <= 2 ? "is-emoji" : ""}`}
              initial={{ y: 10, scale: 0.4, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
            >
              {e.emote}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="meche-seat-info">
        <div className="meche-seat-name">
          <span>{isMe ? "Toi" : seat.name}</span>
          {seat.admin && <AdminBadge />}
        </div>
        <div className="meche-matches" aria-label={`${player.lives} allumette${player.lives > 1 ? "s" : ""} sur ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <Match key={i} burnt={i >= player.lives} burning={scorched === i} />
          ))}
          {player.passes > 0 && (
            <span className="meche-seat-passes num" title={`${player.passes} passe${player.passes > 1 ? "s" : ""}`}>
              {player.passes}
            </span>
          )}
        </div>
        {ownFuse && player.alive && (
          <OwnFuse
            bank={player.bank}
            bankMax={player.bankMax}
            burning={ownFuse.burning}
            since={ownFuse.since}
            serverOffset={serverOffset}
          />
        )}
        <AwayNote seat={seat} serverOffset={serverOffset} compact />
      </div>
    </div>
  );
}
