import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { LONG_WORD, REFUSALS } from "../../shared/games/meche/engine.ts";
import type { MechePlayerView } from "../../shared/games/meche/view.ts";
import { normalizeWord } from "../../shared/games/meche/words.ts";
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
import { FuseRope } from "./FuseRope.tsx";
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

/** La taille visible de l'écran : sur téléphone, le clavier en prend la moitié et la table doit rester au-dessus */
function useVisibleArea() {
  const [area, setArea] = useState(() => ({ w: window.innerWidth, h: window.visualViewport?.height ?? window.innerHeight, top: 0 }));
  useEffect(() => {
    const v = window.visualViewport;
    const update = () => {
      setArea({ w: window.innerWidth, h: v?.height ?? window.innerHeight, top: v?.offsetTop ?? 0 });
      // Le navigateur fait défiler la page pour montrer le champ : ici tout tient déjà à l'écran
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    window.addEventListener("resize", update);
    v?.addEventListener("resize", update);
    v?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      v?.removeEventListener("resize", update);
      v?.removeEventListener("scroll", update);
    };
  }, []);
  return area;
}

/** La place de chaque joueur autour de la caisse : soi en bas, puis les autres dans le sens de la mèche */
function seatPlace(index: number, count: number): CSSProperties {
  const angle = Math.PI / 2 + (index / count) * Math.PI * 2;
  return { left: `${50 + 42 * Math.cos(angle)}%`, top: `${50 + 40.5 * Math.sin(angle)}%` };
}

let trailSeq = 0;

interface Trail {
  id: number;
  from: DOMRect;
  to: DOMRect;
}

interface SeatWord {
  key: number;
  word: string;
  long: boolean;
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
  const short = h < 480;
  const sound = usePrefs((s) => s.sound);
  const setPrefs = usePrefs((s) => s.set);
  const reduced = usePrefs((s) => s.reducedEffects);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [hot, setHot] = useState(false);
  const [boom, setBoom] = useState<{ key: number; id: string; out: boolean } | null>(null);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [words, setWords] = useState<Record<string, SeatWord | undefined>>({});
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const [rejected, setRejected] = useState<RefusedWord | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lastBatch = useRef(batch.id);
  const lastTyped = useRef({ at: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 });

  const meId = room.you.seatId;
  const me = g.players.find((p) => p.id === meId);
  const seat = useCallback((id: string) => room.seats.find((s) => s.id === id), [room.seats]);
  const lit = g.phase === "lit";
  const mine = lit && g.holder === meId;
  const canType = me?.alive === true && g.phase !== "over";
  const holderName = seat(g.holder)?.name ?? "";
  // Soi en bas de la table, puis les autres dans l'ordre où la mèche passe
  const myIndex = g.players.findIndex((p) => p.id === meId);
  const order = myIndex > 0 ? [...g.players.slice(myIndex), ...g.players.slice(0, myIndex)] : g.players;

  useEffect(() => preloadSounds(MECHE_SOUNDS), []);
  useEffect(() => () => stopLoop(), []);

  // La mèche grésille tant qu'elle brûle
  useEffect(() => {
    if (lit && sound) startLoop("mecheFuse");
    else stopLoop("mecheFuse");
  }, [lit, sound]);

  // Le tic-tac : de plus en plus serré à mesure que l'étincelle avance
  useEffect(() => {
    if (!lit) return;
    let timer: ReturnType<typeof setTimeout>;
    let flip = false;
    const span = Math.max(1, g.maxUntil - g.litAt);
    const beat = () => {
      const now = Date.now() + serverOffset;
      const p = Math.min(1, (now - g.litAt) / span);
      const inRed = now >= g.safeUntil;
      flip = !flip;
      play("mecheTick", { rate: flip ? 1 : 0.82, volume: inRed ? 1 : 0.45 + p * 0.4 });
      timer = setTimeout(beat, inRed ? Math.max(140, 300 - (p - 0.5) * 300) : 950 - p * 620);
    };
    timer = setTimeout(beat, 500);
    return () => clearTimeout(timer);
  }, [lit, g.litAt, g.maxUntil, g.safeUntil, serverOffset]);

  // Les événements de la partie : les sons, les mots qui s'affichent sur les joueurs, l'explosion
  useEffect(() => {
    if (batch.id === lastBatch.current) return;
    lastBatch.current = batch.id;
    for (const e of batch.events) {
      if (e.type === "lit") {
        play("mecheStrike");
        if (e.holder === meId) myTurn();
      } else if (e.type === "word") {
        play("mecheWord", { rate: e.long ? 0.86 : 1 });
        if (e.earned) play("tourTrophyMine", { delay: 90, volume: e.id === meId ? 1 : 0.5 });
        showWord(e.id, e.word, e.long);
        flyTo(e.id, e.next);
        if (e.next === meId) myTurn();
      } else if (e.type === "pass") {
        play("wild", { volume: 0.7 });
        flyTo(e.id, e.next);
        if (e.next === meId) myTurn();
      } else if (e.type === "boom") {
        explode(e.id, e.lives === 0);
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

  function showWord(id: string, word: string, long: boolean) {
    const key = ++trailSeq;
    setWords((prev) => ({ ...prev, [id]: { key, word, long } }));
    setTimeout(() => setWords((prev) => (prev[id]?.key === key ? { ...prev, [id]: undefined } : prev)), 2600);
  }

  function flyTo(from: string, to: string) {
    if (usePrefs.getState().reducedEffects) return;
    const a = document.querySelector(`[data-seat="${from}"]`)?.getBoundingClientRect();
    const b = document.querySelector(`[data-seat="${to}"]`)?.getBoundingClientRect();
    if (!a || !b) return;
    const id = ++trailSeq;
    setTrails((prev) => [...prev.slice(-4), { id, from: a, to: b }]);
    setTimeout(() => setTrails((prev) => prev.filter((t) => t.id !== id)), 420);
  }

  function explode(id: string, out: boolean) {
    stopLoop("mecheFuse");
    play("mecheBoom");
    if (out) play("capBankrupt", { delay: 500 });
    if (id === meId) vibrate([120, 50, 200]);
    const key = ++trailSeq;
    setBoom({ key, id, out });
    setTimeout(() => setBoom((b) => (b?.key === key ? null : b)), 1500);
    if (usePrefs.getState().reducedEffects) return;
    const at = document.querySelector(`[data-seat="${id}"]`)?.getBoundingClientRect();
    if (at) {
      void confetti({
        particleCount: 46,
        spread: 360,
        startVelocity: 26,
        gravity: 0.9,
        ticks: 90,
        scalar: 0.8,
        colors: ["#2a211a", "#ff9a3c", "#ffd36b", "#7a6a5c"],
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
      send({ t: "typing", text: normalizeWord(value), turn: g.turn });
    };
    const wait = 45 - (Date.now() - typed.at);
    if (wait <= 0) flush();
    else typed.timer = setTimeout(flush, wait);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!mine || !normalizeWord(text)) return;
    send({ t: "word", word: text, turn: g.turn });
  }

  function passNow() {
    if (mine && me && me.passes > 0) send({ t: "pass", turn: g.turn });
    input.current?.focus({ preventScroll: true });
  }

  const area = phone ? ({ position: "fixed", top, left: 0, right: 0, height: h } as CSSProperties) : undefined;

  return (
    <div
      className={`table-root felt meche-root ${phone ? "is-phone" : ""} ${short ? "is-short" : ""}`}
      style={area}
      onPointerDown={(e) => {
        // Toucher la table rend la main au clavier
        const el = e.target as HTMLElement;
        if (canType && !el.closest("button, a, input, textarea, .table-menu, .emote-picker")) {
          setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
        }
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

      <main className={`meche-stage ${boom && !reduced ? "is-shaking" : ""}`}>
        <div className="meche-seats">
          {order.map((p, i) => {
            const s = seat(p.id);
            if (!s) return null;
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
                style={phone ? undefined : seatPlace(i, order.length)}
                blown={boom?.id === p.id}
              />
            );
          })}
        </div>

        <section className={`meche-crate ${mine ? "is-mine" : ""} ${hot ? "is-hot" : ""}`} aria-label="La mèche">
          <FuseRope litAt={g.litAt} safeUntil={g.safeUntil} maxUntil={g.maxUntil} lit={lit} serverOffset={serverOffset} onHot={setHot} />
          <div className="meche-crate-inner">
            {lit ? (
              <>
                <p className={`meche-who ${mine ? "is-mine" : ""}`}>{mine ? "À toi !" : `À ${holderName}`}</p>
                <div className="meche-letters" aria-label={`Lettres à placer : ${g.letters}`}>
                  {g.letters.toUpperCase()}
                </div>
                <LiveWord mine={mine} myText={text} letters={g.letters} holder={g.holder} turn={g.turn} rejected={rejected} />
              </>
            ) : g.phase === "break" ? (
              <BreakNote fuse={g.fuse} name={holderName} mine={g.holder === meId} seated={me !== undefined} />
            ) : (
              <p className="meche-who">C'est fini !</p>
            )}
          </div>
          {canType && (
            <form className="meche-form" onSubmit={submit}>
              <input
                ref={input}
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
          {mine && me && me.passes > 0 && (
            <motion.button
              className="btn meche-pass"
              type="button"
              onClick={passNow}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              Passer{phone ? "" : " (Tab)"} <span className="meche-pass-count num">{me.passes}</span>
            </motion.button>
          )}
          {phone && canType && !focused && <p className="meche-tap">Touche ici pour écrire</p>}
          {g.settings.passes && mine && me && me.passes === 0 && !phone && g.fuse <= 2 && (
            <p className="meche-tip">{LONG_WORD} lettres ou plus : tu gagnes une passe</p>
          )}
        </section>

        {!phone && g.log.length > 0 && (
          <aside className="meche-log" aria-label="Les mots déjà joués">
            <h3>Déjà joués</h3>
            <ol>
              {[...g.log]
                .reverse()
                .slice(0, 7)
                .map((l) => (
                  <li key={l.word}>
                    <span className="meche-log-word">{l.word.toUpperCase()}</span>
                    <span className="meche-log-who">{seat(l.by)?.name}</span>
                  </li>
                ))}
            </ol>
          </aside>
        )}

        {me && (
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

      <AnimatePresence>
        {boom && (
          <motion.div
            key={boom.key}
            className="meche-boom"
            aria-live="polite"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {!reduced && <span className="meche-flash" />}
            <motion.div
              className="meche-burst"
              initial={{ scale: 0.3, rotate: -14 }}
              animate={{ scale: 1, rotate: -4 }}
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
          </motion.div>
        )}
      </AnimatePresence>

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

/** Le mot en train de s'écrire, les lettres imposées en couleur dès qu'elles y sont */
function LiveWord({
  mine,
  myText,
  letters,
  holder,
  turn,
  rejected,
}: {
  mine: boolean;
  myText: string;
  letters: string;
  holder: string;
  turn: number;
  rejected: RefusedWord | null;
}) {
  const typing = useTyping();
  const text = mine ? normalizeWord(myText) : typing.id === holder && typing.turn === turn ? typing.text : "";
  const last = useRef(text);

  // Les autres entendent les touches, tout doucement
  useEffect(() => {
    if (!mine && text.length > last.current.length) play("brickMove", { volume: 0.5 });
    last.current = text;
  }, [text, mine]);

  if (rejected && text.length === 0) {
    return (
      <div className="meche-word is-refused" key={rejected.key}>
        <span className="meche-word-text">{rejected.word.toUpperCase()}</span>
        <span className="meche-word-why">{REFUSALS[rejected.reason]}</span>
      </div>
    );
  }
  const at = text.indexOf(letters);
  return (
    <div className={`meche-word ${at >= 0 ? "has-letters" : ""}`}>
      <span className="meche-word-text">
        {text.length === 0 ? (
          mine ? (
            <span className="meche-word-hint">Écris un mot avec ces lettres</span>
          ) : (
            <span className="meche-word-dots">
              <i />
              <i />
              <i />
            </span>
          )
        ) : at >= 0 ? (
          <>
            {text.slice(0, at).toUpperCase()}
            <mark>{letters.toUpperCase()}</mark>
            {text.slice(at + letters.length).toUpperCase()}
          </>
        ) : (
          text.toUpperCase()
        )}
        {mine && <span className="meche-caret" />}
      </span>
    </div>
  );
}

/** Entre deux mèches : avant la première, la règle en deux lignes ; ensuite, qui s'y colle */
function BreakNote({ fuse, name, mine, seated }: { fuse: number; name: string; mine: boolean; seated: boolean }) {
  if (fuse === 0) {
    return (
      <div className="meche-intro">
        <p className="meche-who">Ça va s'allumer</p>
        <p className="meche-intro-rule">Écris un mot qui contient les lettres, puis Entrée : la mèche passe au suivant.</p>
        <p className="meche-intro-rule is-soft">
          Elle peut sauter dès que l'étincelle entre dans le rouge. Chez toi, c'est une allumette de moins.
        </p>
      </div>
    );
  }
  return (
    <div className="meche-intro">
      <p className="meche-who">{mine ? "Tu repars en premier" : seated ? `${name} repart en premier` : `${name} repart`}</p>
      <p className="meche-intro-rule is-soft">La mèche est un peu plus courte.</p>
    </div>
  );
}

function Match({ burnt }: { burnt: boolean }) {
  return (
    <svg className={`meche-match ${burnt ? "is-burnt" : ""}`} viewBox="0 0 10 30" width="10" height="30" aria-hidden="true">
      {burnt ? (
        <>
          <path d="M5 29V15c0-3 2-4 1.5-7S4 5 5 2" fill="none" stroke="#6d6158" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="5" cy="2.5" r="1.6" fill="#a8a095" />
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
  style,
  blown,
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
  style: CSSProperties | undefined;
  blown: boolean;
}) {
  return (
    <div
      className={`meche-seat ${holder ? "is-holder" : ""} ${hot ? "is-hot" : ""} ${player.alive ? "" : "is-out"} ${isMe ? "is-me" : ""} ${blown ? "is-blown" : ""}`}
      style={style}
      data-seat={player.id}
    >
      <div className="meche-seat-avatar">
        <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={64} title={seat.name} />
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
      </div>
      <div className="meche-seat-name">
        <span>{isMe ? "Toi" : seat.name}</span>
        {seat.admin && <AdminBadge />}
      </div>
      <div className="meche-matches" aria-label={`${player.lives} allumette${player.lives > 1 ? "s" : ""} sur ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <Match key={i} burnt={i >= player.lives} />
        ))}
        {player.passes > 0 && (
          <span className="meche-seat-passes num" title={`${player.passes} passe${player.passes > 1 ? "s" : ""}`}>
            {player.passes}
          </span>
        )}
      </div>
      <AwayNote seat={seat} serverOffset={serverOffset} compact />
      <AnimatePresence>
        {word && (
          <motion.span
            key={word.key}
            className={`meche-seat-word ${word.long ? "is-long" : ""}`}
            initial={{ y: 8, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 26 }}
          >
            {word.word.toUpperCase()}
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
  );
}
