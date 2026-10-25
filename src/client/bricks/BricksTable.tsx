import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { TargetStrategy } from "../../shared/games/bricks/engine.ts";
import type { BricksFx, BricksPlayerView, BricksSnapshot } from "../../shared/games/bricks/view.ts";
import type { BricksClientMessage, BricksRoomView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton, Options } from "../components/ui.tsx";
import { EmotePicker } from "../game/ChatPanel.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { formatClock } from "../lib/countdown.ts";
import { BRICKS_SOUNDS, play, preloadSounds, startLoop, stopLoop } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { BricksGameOver } from "./BricksGameOver.tsx";
import { useControls } from "./controls.ts";
import { KeysModal } from "./KeysModal.tsx";
import { MiniBoard, miniEffects } from "./MiniBoard.tsx";
import { OwnBoard, type OwnBoardHandle } from "./OwnBoard.tsx";
import { BRICK_TEAMS } from "./BricksLobby.tsx";
import { SHOWN_ROWS } from "./draw.ts";
import { useBoards, type BricksListeners } from "./useBricksRoom.ts";
import { useTourBridge } from "../tour/bridge.ts";

interface Props {
  room: BricksRoomView;
  send: (msg: BricksClientMessage) => void;
  emotes: EmoteBubble[];
  serverOffset: number;
  unread: number;
  onOpenChat: () => void;
  onShowLobby: () => void;
  onLeave: () => void;
  listeners: MutableRefObject<BricksListeners>;
  lastSnapshot: MutableRefObject<BricksSnapshot | null>;
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const STRATEGIES: { value: TargetStrategy; label: string }[] = [
  { value: "random", label: "Au hasard" },
  { value: "attackers", label: "Riposte" },
  { value: "danger", label: "Le plus en danger" },
  { value: "manual", label: "À la main" },
];

interface Trail {
  id: number;
  from: DOMRect;
  to: DOMRect;
  lines: number;
}

let trailSeq = 0;

export function BricksTable({
  room,
  send,
  emotes,
  serverOffset,
  unread,
  onOpenChat,
  onShowLobby,
  onLeave,
  listeners,
  lastSnapshot,
}: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.bricks!;
  const { w, h } = useViewport();
  const phone = w < 760;
  const sound = usePrefs((s) => s.sound);
  const setPrefs = usePrefs((s) => s.set);
  const music = useControls((s) => s.music);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [trails, setTrails] = useState<Trail[]>([]);
  const own = useRef<OwnBoardHandle>(null);
  const meId = room.you.seatId;
  const me = g.players.find((p) => p.id === meId);
  const mySeat = room.seats.find((s) => s.id === meId);
  const seat = (id: string) => room.seats.find((s) => s.id === id);
  const rivals = g.players.filter((p) => p.id !== meId);
  const enemies = rivals.filter((p) => !(me && me.team !== null && p.team === me.team));

  useEffect(() => preloadSounds(BRICKS_SOUNDS), []);
  useEffect(() => {
    if (sound && music && room.status === "playing") startLoop("brickMusic");
    else stopLoop();
  }, [sound, music, room.status]);
  useEffect(() => () => stopLoop(), []);
  useEffect(() => {
    if (!g.matchOver) setResultsHidden(false);
  }, [g.matchOver]);

  // Les plateaux des autres et les attaques, en direct
  useEffect(() => {
    listeners.current.board = (p: BricksPlayerView, fx: BricksFx[]) => {
      if (p.id === meId) own.current?.onServerBoard(p, fx);
      for (const f of fx) {
        if (f.type === "clear" && f.id !== meId) {
          miniEffects.get(f.id)?.burst(f.rows, [], 6, f.lines === 4 || f.spin !== "none", true);
        } else if (f.type === "attack") {
          const from = document.querySelector(`[data-board="${f.from}"]`)?.getBoundingClientRect();
          const to = document.querySelector(`[data-board="${f.to}"]`)?.getBoundingClientRect();
          if (from && to && !usePrefs.getState().reducedEffects) {
            const id = ++trailSeq;
            setTrails((prev) => [...prev.slice(-6), { id, from, to, lines: f.lines }]);
            setTimeout(() => setTrails((prev) => prev.filter((t) => t.id !== id)), 700);
          }
        } else if (f.type === "ko" && f.id !== meId) {
          play("brickKo", { volume: 0.5 });
          const fxm = miniEffects.get(f.id);
          if (fxm) fxm.shake = 1;
        }
      }
    };
    return () => {
      listeners.current.board = undefined;
    };
  }, [listeners, meId]);

  // Tailles : son plateau aussi grand que possible, les autres autour.
  // Téléphone, de haut en bas : en-tête, plateaux des autres, le sien, puis les boutons.
  const melee = enemies.length > 1;
  const phoneRival = clamp(Math.floor((w - 24 - (rivals.length - 1) * 8) / Math.max(1, rivals.length) / 10), 3, 5);
  const phoneRivalsH = rivals.length > 0 ? phoneRival * SHOWN_ROWS + 20 + (melee ? 36 : 0) : 0;
  const cell = phone
    ? clamp(Math.floor(Math.min((h - 58 - phoneRivalsH - 128 - 30) / SHOWN_ROWS, (w - 36) / 15.4)), 12, 30)
    : clamp(Math.floor((h - 150) / SHOWN_ROWS), 18, 34);
  const rivalCell = phone
    ? phoneRival
    : rivals.length === 1
      ? Math.round(cell * 0.72)
      : clamp(Math.floor((h - 190) / (Math.ceil(rivals.length / 2) * (SHOWN_ROWS + 3))), 8, 18);
  const spectatorCell = clamp(Math.floor((h - 200) / (Math.ceil(g.players.length / 3) * (SHOWN_ROWS + 3))), 8, 20);
  const modeLabel = g.mode === "sprint" ? "solo 40 lignes" : g.mode === "duel" ? "duel" : g.mode === "teams" ? "2 contre 2" : "mêlée";
  const relayed = Boolean(mySeat?.autoplay);

  return (
    <div className="table-root felt bricks-root">
      <header className="table-top">
        <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <Icon name="menu" />
        </button>
        <div className="table-title">
          <span className="table-code">{room.code}</span>
          <span className="hint">Briques, {modeLabel}</span>
        </div>
        <RoundHud room={room} serverOffset={serverOffset} meId={meId} />
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
                <button className="menu-item" onClick={() => (setMenuOpen(false), setKeysOpen(true))}>
                  <Icon name="settings" size={18} /> Touches et réglages
                </button>
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

      <main className={`bricks-stage ${phone ? "is-phone" : ""} ${me ? "" : "is-spectating"} rivals-${rivals.length}`}>
        {me ? (
          <>
            {rivals.length > 0 && (
              <section className="bricks-rivals" aria-label="Adversaires">
                <div className="rivals-grid">
                  {rivals.map((p) => (
                    <MiniBoard
                      key={p.id}
                      initial={p}
                      meId={me.id}
                      seat={seat(p.id)}
                      cell={rivalCell}
                      serverOffset={serverOffset}
                      pickable={enemies.includes(p) && enemies.length > 1}
                      teamLabel={p.team !== null ? (p.team === me.team ? "équipier" : BRICK_TEAMS[p.team]) : undefined}
                      compact={phone}
                      onPick={() => send({ t: "strategy", strategy: "manual", target: p.id })}
                    />
                  ))}
                </div>
                {enemies.length > 1 && <StrategyPick meId={me.id} phone={phone} send={send} />}
              </section>
            )}
            <section className="bricks-me" aria-label="Ton plateau">
              <OwnBoard
                ref={own}
                room={room}
                meId={me.id}
                cell={cell}
                phone={phone}
                serverOffset={serverOffset}
                send={send}
                listeners={listeners}
                lastSnapshot={lastSnapshot}
                relayed={relayed}
              />
            </section>
          </>
        ) : (
          <section className="bricks-watch" aria-label="Les plateaux">
            {g.players.map((p) => (
              <MiniBoard
                key={p.id}
                initial={p}
                meId={null}
                seat={seat(p.id)}
                cell={spectatorCell}
                serverOffset={serverOffset}
                pickable={false}
              />
            ))}
          </section>
        )}
      </main>

      {/* Traînées d'attaque d'un plateau à l'autre */}
      <div className="trail-layer" aria-hidden="true">
        {trails.map((t) => (
          <motion.span
            key={t.id}
            className="attack-trail"
            style={{ width: 10 + t.lines * 3, height: 10 + t.lines * 3 }}
            initial={{ x: t.from.left + t.from.width / 2, y: t.from.top + t.from.height * 0.3, opacity: 1, scale: 0.6 }}
            animate={{
              x: [
                t.from.left + t.from.width / 2,
                (t.from.left + t.to.left) / 2 + (t.to.width - t.from.width) / 4,
                t.to.left + t.to.width / 2,
              ],
              y: [t.from.top + t.from.height * 0.3, Math.min(t.from.top, t.to.top) - 30, t.to.top + t.to.height * 0.8],
              scale: [0.6, 1.2, 0.8],
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          />
        ))}
      </div>

      <RoundBreak room={room} serverOffset={serverOffset} />

      <div className="bricks-emotes" aria-live="polite">
        <AnimatePresence>
          {emotes.map((e) => {
            const who = room.seats.find((s) => s.id === e.seatId || s.userId === e.userId);
            return (
              <motion.div
                key={e.id}
                className={`bricks-emote ${e.emote.length <= 2 ? "is-emoji" : ""}`}
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

      {me && !phone && (
        <div className="bricks-react">
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

      {g.matchOver && !resultsHidden && (
        <BricksGameOver
          room={room}
          onRematch={() => send(room.you.isHost ? { t: "start" } : { t: "rematch" })}
          onLobby={onShowLobby}
          onLeave={onLeave}
          onInspect={() => setResultsHidden(true)}
        />
      )}
      {g.matchOver && resultsHidden && (
        <button className="btn btn-primary bricks-results-back" onClick={() => setResultsHidden(false)}>
          Revoir les résultats
        </button>
      )}

      <KeysModal open={keysOpen} onClose={() => setKeysOpen(false)} />
    </div>
  );
}

/** Le choix de la cible des attaques, en mêlée */
function StrategyPick({ meId, phone, send }: { meId: string; phone: boolean; send: (msg: BricksClientMessage) => void }) {
  const strategy = useBoards((s) => s.players[meId]?.strategy ?? "random");
  const alive = useBoards((s) => s.players[meId]?.alive ?? true);
  if (!alive) return null;
  return (
    <div className="strategy-pick">
      {!phone && <span className="field-label">Tes attaques vont</span>}
      <Options<TargetStrategy>
        label="Cible des attaques"
        value={strategy}
        onChange={(next) => send({ t: "strategy", strategy: next })}
        options={STRATEGIES}
      />
    </div>
  );
}

/** Chrono de la manche, marée montante, score de la série */
function RoundHud({ room, serverOffset, meId }: { room: BricksRoomView; serverOffset: number; meId: string | null }) {
  const g = room.bricks!;
  const me = useBoards((s) => (meId ? s.players[meId] : undefined));
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + serverOffset), 200);
    return () => clearInterval(t);
  }, [serverOffset]);
  const r = g.round;
  let clock: string;
  let urgent = false;
  if (g.mode === "sprint") {
    const ms = me?.sprintTime ?? (r.phase === "playing" ? Math.max(0, now - r.startAt) : 0);
    clock = `${(ms / 1000).toFixed(1)} s · ${Math.min(40, me?.lines ?? 0)}/40`;
  } else if (r.endAt) {
    // Manche finie : le chrono affiche 0:00 tout de suite, sans attendre son prochain battement
    const left = r.phase === "over" ? 0 : Math.max(0, Math.ceil((r.endAt - Math.max(now, r.startAt)) / 1000));
    clock = formatClock(left);
    urgent = left <= 15 && r.phase === "playing";
  } else if (r.tideAt) {
    const left = Math.ceil((r.tideAt - now) / 1000);
    clock = left > 0 ? `marée dans ${formatClock(Math.min(left, Math.ceil((r.tideAt - r.startAt) / 1000)))}` : "marée montante !";
    urgent = left <= 0;
  } else clock = "";
  const series = g.settings.series > 1 && g.mode !== "sprint";
  return (
    <div className="round-hud">
      <span className={`round-clock num ${urgent ? "is-urgent" : ""}`}>{clock}</span>
      {series && (
        <span className="round-series">
          manche {r.index}, en {g.settings.series} gagnantes
        </span>
      )}
    </div>
  );
}

/** Entre deux manches : qui l'a emportée, le score, et la suite dans quelques secondes */
function RoundBreak({ room, serverOffset }: { room: BricksRoomView; serverOffset: number }) {
  const g = room.bricks!;
  const r = g.round;
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  useEffect(() => {
    if (r.phase !== "over" || g.matchOver) return;
    const t = setInterval(() => setNow(Date.now() + serverOffset), 250);
    return () => clearInterval(t);
  }, [r.phase, g.matchOver, serverOffset]);
  if (r.phase !== "over" || g.matchOver) return null;
  const names = (r.winners ?? []).map((id) => room.seats.find((s) => s.id === id)?.name ?? "?");
  const left = r.nextAt ? Math.max(0, Math.ceil((r.nextAt - now) / 1000)) : 0;
  return (
    <motion.div className="round-break" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <span className="round-break-label">Manche {r.index}</span>
      <strong>{names.length > 0 ? `${names.join(" et ")} l'emporte${names.length > 1 ? "nt" : ""}` : "Égalité"}</strong>
      <ul className="round-score">
        {g.players.map((p) => (
          <li key={p.id}>
            <span>{room.seats.find((s) => s.id === p.id)?.name}</span>
            <span className="pips">
              {Array.from({ length: g.settings.series }, (_, i) => (
                <span key={i} className={i < p.roundWins ? "is-won" : ""} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      <span className="hint">Manche suivante dans {left} s</span>
    </motion.div>
  );
}
