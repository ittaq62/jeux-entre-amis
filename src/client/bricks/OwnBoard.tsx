import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject } from "react";
import { locked, stackHeight, type Active, type Spin } from "../../shared/games/bricks/engine.ts";
import type { BricksFx, BricksPlayerView, BricksSnapshot } from "../../shared/games/bricks/view.ts";
import type { BricksClientMessage, BricksRoomView } from "../../shared/protocol.ts";
import { play, setLoopRate, unlockAudio, vibrate } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { actionFor, useControls } from "./controls.ts";
import { boardSize, drawBoard, drawPiece, Effects, SKY_ROWS } from "./draw.ts";
import { LocalGame, type InputAction, type LocalEvent } from "./local.ts";
import type { BricksListeners } from "./useBricksRoom.ts";

export interface OwnBoardHandle {
  /** Le serveur a diffusé notre plateau (vérification) ou des effets qui nous concernent */
  onServerBoard: (p: BricksPlayerView, fx: BricksFx[]) => void;
}

interface Props {
  room: BricksRoomView;
  me: BricksPlayerView;
  cell: number;
  phone: boolean;
  serverOffset: number;
  send: (msg: BricksClientMessage) => void;
  listeners: MutableRefObject<BricksListeners>;
  lastSnapshot: MutableRefObject<BricksSnapshot | null>;
  /** Mis en relais par un bot : on n'agit plus jusqu'à reprendre la main */
  relayed: boolean;
}

interface Popup {
  id: number;
  text: string;
  sub?: string;
  tone: "gold" | "white" | "red" | "jade";
  big?: boolean;
}

let popupSeq = 0;

function clearLabel(lines: number, spin: Spin): string | null {
  if (spin === "full") return `T-spin ${["", "simple", "double", "triple", "triple"][lines]}`.trim();
  if (spin === "mini") return lines > 0 ? "T-spin mini" : null;
  return [null, null, "Double", "Triple", "Quatre lignes !"][lines] ?? null;
}

/** Son plateau : la partie tourne ici, au clavier, au doigt ou avec les boutons. */
export const OwnBoard = forwardRef<OwnBoardHandle, Props>(function OwnBoard(
  { room, me, cell, phone, serverOffset, send, listeners, lastSnapshot, relayed },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holdCanvas = useRef<HTMLCanvasElement>(null);
  const nextCanvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const meter = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const game = useRef<LocalGame | null>(null);
  const effects = useRef(new Effects());
  const roomRef = useRef(room);
  const offset = useRef(serverOffset);
  const relayedRef = useRef(relayed);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [koUntil, setKoUntil] = useState(0);
  const das = useControls((s) => s.das);
  const arr = useControls((s) => s.arr);
  const keys = useControls((s) => s.keys);
  const reduced = usePrefs((s) => s.reducedEffects);
  const g = room.bricks!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { width, height } = boardSize(cell);
  const previews = g.settings.previews;
  const side = phone ? Math.round(cell * 2.1) : Math.round(cell * 3.4);

  roomRef.current = room;
  offset.current = serverOffset;
  relayedRef.current = relayed;
  const serverNow = () => Date.now() + offset.current;

  function popup(p: Omit<Popup, "id">) {
    const id = ++popupSeq;
    setPopups((prev) => [...prev.slice(-3), { ...p, id }]);
    setTimeout(() => setPopups((prev) => prev.filter((x) => x.id !== id)), p.big ? 1400 : 1000);
  }

  // Ce que l'écran fait tout de suite à chaque geste : sons, éclats, messages
  function onLocal(e: LocalEvent) {
    const fx = effects.current;
    switch (e.type) {
      case "move":
        play("tick", { volume: 0.25 });
        break;
      case "rotate":
        play("click", { volume: 0.3, rate: 1.15 });
        break;
      case "hold":
        play("brickHold", { volume: 0.6 });
        break;
      case "drop":
        fx.dropStreak(e.from, e.to);
        break;
      case "lock": {
        const r = e.result;
        if (r.lines > 0) {
          const big = r.lines === 4 || r.spin !== "none" || r.perfect;
          fx.burst(r.rows, locked(e.before, e.piece), cell, big, reduced);
          play(big ? "brickQuad" : "brickClear", { volume: big ? 0.85 : 0.65 });
          if (r.combo >= 1) play("brickCombo", { rate: 1 + Math.min(r.combo, 10) * 0.07, volume: 0.55, delay: 60 });
          if (big) vibrate(40);
          const label = clearLabel(r.lines, r.spin);
          if (r.perfect) popup({ text: "Plateau vidé !", sub: `+${r.attack}`, tone: "gold", big: true });
          else if (label || r.combo >= 1 || r.sent > 0) {
            popup({
              text: label ?? `Combo ×${r.combo}`,
              sub: [r.b2b ? "enchaîné" : null, label && r.combo >= 1 ? `combo ×${r.combo}` : null, r.sent > 0 ? `+${r.sent}` : null]
                .filter(Boolean)
                .join(" · "),
              tone: r.spin !== "none" ? "jade" : r.lines === 4 ? "gold" : "white",
              big: r.lines === 4 || r.spin === "full",
            });
          }
        } else {
          play("brickLock", { volume: 0.5 });
        }
        if (r.spin !== "none") play("brickSpin", { volume: 0.6 });
        if (r.garbageIn > 0) {
          fx.rise = Math.min(4, r.garbageIn);
          fx.shake = Math.max(fx.shake, 0.6);
          play("brickGarbage", { volume: 0.7 });
          vibrate(30);
        }
        break;
      }
      case "blocked":
        break;
    }
  }

  function makeGame(s: BricksSnapshot) {
    const cur = roomRef.current.bricks!;
    game.current = new LocalGame(s, cur.settings, cur.round.startAt, send, onLocal, { das, arr });
  }

  // Le serveur parle de notre plateau
  useEffect(() => {
    const onSelf = (s: BricksSnapshot) => {
      if (!game.current || game.current.round !== s.round) makeGame(s);
      else game.current.reset(s);
      const gm = game.current!;
      gm.startAt = roomRef.current.bricks?.round.startAt ?? gm.startAt;
      if (s.koUntil && s.koUntil > serverNow()) setKoUntil(s.koUntil);
    };
    listeners.current.self = onSelf;
    listeners.current.garbage = (c) => {
      game.current?.addGarbage(c);
      play("brickWarn", { volume: 0.45 });
    };
    if (lastSnapshot.current) onSelf(lastSnapshot.current);
    return () => {
      listeners.current.self = undefined;
      listeners.current.garbage = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (game.current) game.current.handling = { das, arr };
  }, [das, arr]);

  useImperativeHandle(ref, () => ({
    onServerBoard: (p, fx) => {
      game.current?.verify(p.seq, p.grid);
      for (const f of fx) {
        if (f.type === "ko" && f.id === p.id && roomRef.current.bricks?.settings.win === "ko") {
          play("brickKo", { volume: 0.8 });
          vibrate([80, 40, 120]);
        }
      }
    },
  }));

  // Boucle de jeu : 60 images par seconde
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastLive = 0;
    let liveKey = "";
    let holdKey = "";
    let nextKey = "";
    let danger = false;
    const ctx = canvas.current?.getContext("2d");
    const tick = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      const now = serverNow();
      const gm = game.current;
      const cur = roomRef.current.bricks;
      const playing = cur?.round.phase === "playing" || (cur?.round.phase === "countdown" && now >= cur.round.startAt);
      if (gm && playing && !relayedRef.current) gm.tick(dt, now);
      effects.current.step(dt, cell);
      if (ctx && gm) {
        drawBoard(ctx, {
          grid: gm.board.grid,
          piece: gm.piece,
          ghost: useControls.getState().ghost ? gm.ghost : null,
          cell,
          dpr,
          effects: effects.current,
          dim: !playing || now < gm.pausedUntil || relayedRef.current,
        });
        // Réserve et aperçus, redessinés seulement quand ils changent
        const hk = `${gm.shownHold}:${gm.held}`;
        if (hk !== holdKey && holdCanvas.current) {
          holdKey = hk;
          drawPiece(holdCanvas.current.getContext("2d")!, gm.shownHold, side, dpr, gm.held);
        }
        const nk = gm.queue.slice(0, previews).join("");
        if (nk !== nextKey) {
          nextKey = nk;
          gm.queue.slice(0, previews).forEach((type, i) => {
            const c = nextCanvases.current[i];
            if (c) drawPiece(c.getContext("2d")!, type, i === 0 ? side : Math.round(side * 0.82), dpr);
          });
        }
        if (meter.current) meter.current.style.height = `${Math.min(100, (gm.pending / 20) * 100)}%`;
        const high = stackHeight(gm.board.grid) >= 15;
        if (high !== danger) {
          danger = high;
          frame.current?.classList.toggle("is-danger", high);
          setLoopRate(high ? 1.12 : 1);
        }
        // Montrer sa pièce aux autres, une dizaine de fois par seconde au plus
        const live: Active | null = playing ? gm.live : null;
        const key = live ? `${live.type}${live.x},${live.y},${live.rot}` : "-";
        if (key !== liveKey && t - lastLive > 100) {
          liveKey = key;
          lastLive = t;
          send({ t: "live", piece: live });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell, dpr, side, previews]);

  // Clavier
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const action = actionFor(e.code, keys);
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      unlockAudio();
      if (!relayedRef.current) game.current?.press(action, serverNow());
    };
    const up = (e: KeyboardEvent) => {
      const action = actionFor(e.code, keys);
      if (action) game.current?.release(action);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  // Gestes au doigt sur le plateau : glisser pour déplacer, toucher pour tourner,
  // balayer vers le bas pour lâcher, glisser lentement vers le bas pour descendre, vers le haut pour la réserve
  const touch = useRef<{ x: number; y: number; t: number; lastX: number; moved: boolean; soft: boolean; id: number } | null>(null);
  function act(action: InputAction) {
    if (relayedRef.current) return;
    game.current?.press(action, serverNow());
    if (action !== "soft") game.current?.release(action);
  }
  const gestures = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      unlockAudio();
      e.currentTarget.setPointerCapture(e.pointerId);
      touch.current = { x: e.clientX, y: e.clientY, t: performance.now(), lastX: e.clientX, moved: false, soft: false, id: e.pointerId };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const tc = touch.current;
      if (!tc || tc.id !== e.pointerId) return;
      const step = cell * 0.85;
      let dx = e.clientX - tc.lastX;
      while (Math.abs(dx) >= step) {
        act(dx < 0 ? "left" : "right");
        tc.lastX += Math.sign(dx) * step;
        dx = e.clientX - tc.lastX;
        tc.moved = true;
      }
      const dy = e.clientY - tc.y;
      const fast = dy / Math.max(1, performance.now() - tc.t);
      if (!tc.soft && dy > cell * 1.4 && fast < 0.9 && Math.abs(e.clientX - tc.x) < cell * 1.5) {
        tc.soft = true;
        tc.moved = true;
        if (!relayedRef.current) game.current?.press("soft", serverNow());
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const tc = touch.current;
      if (!tc || tc.id !== e.pointerId) return;
      touch.current = null;
      if (tc.soft) game.current?.release("soft");
      const dt = performance.now() - tc.t;
      const dy = e.clientY - tc.y;
      const dx = e.clientX - tc.x;
      if (dy > cell * 2.2 && dy / dt > 0.7 && Math.abs(dx) < Math.abs(dy)) act("hard");
      else if (dy < -cell * 2 && -dy / dt > 0.5 && Math.abs(dx) < Math.abs(dy)) act("hold");
      else if (!tc.moved && Math.abs(dy) < cell * 0.7 && Math.abs(dx) < cell * 0.7 && dt < 320) act("cw");
    },
    onPointerCancel: () => {
      if (touch.current?.soft) game.current?.release("soft");
      touch.current = null;
    },
  };

  const now = serverNow();
  const counting = g.round.phase !== "over" && now < g.round.startAt;
  const koActive = koUntil > now;

  return (
    <div
      className={`own-board ${phone ? "is-phone" : ""}`}
      style={{ ["--cell" as string]: `${cell}px`, ["--sky" as string]: `${SKY_ROWS * cell}px` }}
    >
      <div className="own-side own-side-left">
        <div className="piece-box">
          <span className="piece-box-label">Réserve</span>
          <canvas
            ref={holdCanvas}
            width={side * dpr}
            height={Math.round(side * 0.62) * dpr}
            style={{ width: side, height: Math.round(side * 0.62) }}
            aria-label="Pièce en réserve"
          />
        </div>
        {!phone && <OwnStats me={me} mode={g.mode} />}
      </div>

      <div className="own-frame-wrap">
        <div className="own-frame" ref={frame} data-board={me.id} style={{ width, height }} {...gestures}>
          <div className="garbage-meter" aria-hidden="true">
            <div className="garbage-fill" ref={meter} />
          </div>
          <canvas ref={canvas} width={width * dpr} height={height * dpr} style={{ width, height }} aria-label="Ton plateau" />
          <AnimatePresence>
            {popups.map((p) => (
              <motion.div
                key={p.id}
                className={`brick-popup tone-${p.tone} ${p.big ? "is-big" : ""}`}
                initial={{ y: 10, opacity: 0, scale: 0.8 }}
                animate={{ y: -6, opacity: 1, scale: 1 }}
                exit={{ y: -26, opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                <strong>{p.text}</strong>
                {p.sub && <span>{p.sub}</span>}
              </motion.div>
            ))}
          </AnimatePresence>
          {koActive && (
            <motion.div className="board-stamp is-ko" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              K.O. !
            </motion.div>
          )}
          {!me.alive && g.mode !== "sprint" && <div className="board-stamp">{me.place ? `${me.place}e` : "Éliminé"}</div>}
          {counting && <Countdown startAt={g.round.startAt} serverOffset={serverOffset} />}
          {relayed && (
            <div className="board-stamp is-soft">
              <span>Un bot joue pour toi</span>
              <button className="btn btn-primary btn-sm" onClick={() => send({ t: "takeBack" })}>
                Reprendre la main
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="own-side own-side-right">
        <div className="piece-box">
          <span className="piece-box-label">Suivantes</span>
          {Array.from({ length: previews }, (_, i) => {
            const s = i === 0 ? side : Math.round(side * 0.82);
            return (
              <canvas
                key={i}
                ref={(el) => {
                  nextCanvases.current[i] = el;
                }}
                width={s * dpr}
                height={Math.round(s * 0.62) * dpr}
                style={{ width: s, height: Math.round(s * 0.62) }}
                aria-hidden="true"
              />
            );
          })}
        </div>
        {phone && <OwnStats me={me} mode={g.mode} />}
      </div>

      {phone && (
        <TouchControls onPress={(a) => !relayed && game.current?.press(a, serverNow())} onRelease={(a) => game.current?.release(a)} />
      )}
    </div>
  );
});

function OwnStats({ me, mode }: { me: BricksPlayerView; mode: string }) {
  return (
    <dl className="own-stats">
      <div>
        <dt>Lignes</dt>
        <dd className="num">{me.lines}</dd>
      </div>
      {mode !== "sprint" && (
        <>
          <div>
            <dt>Envoyées</dt>
            <dd className="num">{me.sent}</dd>
          </div>
          <div>
            <dt>K.O.</dt>
            <dd className="num">{me.kos}</dd>
          </div>
        </>
      )}
    </dl>
  );
}

/** 3, 2, 1… partez ! */
function Countdown({ startAt, serverOffset }: { startAt: number; serverOffset: number }) {
  const [left, setLeft] = useState(() => Math.ceil((startAt - (Date.now() + serverOffset)) / 1000));
  useEffect(() => {
    let lastBeep = -1;
    const t = setInterval(() => {
      const ms = startAt - (Date.now() + serverOffset);
      const n = Math.ceil(ms / 1000);
      setLeft(n);
      if (n !== lastBeep && n >= 0 && n <= 3) {
        lastBeep = n;
        play(n === 0 ? "brickGo" : "brickCount", { volume: 0.6 });
      }
    }, 50);
    return () => clearInterval(t);
  }, [startAt, serverOffset]);
  const label = left > 3 ? "Prêts ?" : left > 0 ? String(left) : "Partez !";
  return (
    <div className="board-countdown" aria-live="assertive">
      <AnimatePresence mode="popLayout">
        <motion.span key={label} initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

const PAD: { action: InputAction; label: string; aria: string; wide?: boolean }[] = [
  { action: "ccw", label: "↺", aria: "Tourner à gauche" },
  { action: "hold", label: "Réserve", aria: "Réserve", wide: true },
  { action: "cw", label: "↻", aria: "Tourner à droite" },
  { action: "left", label: "←", aria: "Gauche" },
  { action: "soft", label: "↓", aria: "Descendre" },
  { action: "right", label: "→", aria: "Droite" },
  { action: "hard", label: "Lâcher", aria: "Lâcher la pièce", wide: true },
];

/** Gros boutons pour le téléphone, en plus des gestes sur le plateau. */
function TouchControls({ onPress, onRelease }: { onPress: (a: InputAction) => void; onRelease: (a: InputAction) => void }) {
  return (
    <div className="touch-pad" onContextMenu={(e) => e.preventDefault()}>
      {PAD.map((b) => (
        <button
          key={b.action}
          type="button"
          className={`pad-btn pad-${b.action} ${b.wide ? "is-wide" : ""}`}
          aria-label={b.aria}
          onPointerDown={(e) => {
            e.preventDefault();
            unlockAudio();
            e.currentTarget.setPointerCapture(e.pointerId);
            onPress(b.action);
            vibrate(8);
          }}
          onPointerUp={() => onRelease(b.action)}
          onPointerCancel={() => onRelease(b.action)}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
