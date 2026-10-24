import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject } from "react";
import { gridFromString, locked, stackHeight, type Active, type Spin } from "../../shared/games/bricks/engine.ts";
import type { BricksFx, BricksPlayerView, BricksSnapshot } from "../../shared/games/bricks/view.ts";
import type { BricksClientMessage, BricksRoomView } from "../../shared/protocol.ts";
import { play, unlockAudio, vibrate } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { actionFor, useControls } from "./controls.ts";
import { BoardRenderer, boardSize, drawPiece, Effects, SKY_ROWS } from "./draw.ts";
import { LocalGame, type InputAction, type LocalEvent } from "./local.ts";
import { useBoards, type BricksListeners } from "./useBricksRoom.ts";

export interface OwnBoardHandle {
  /** Le serveur a diffusé notre plateau (vérification) ou des effets qui nous concernent */
  onServerBoard: (p: BricksPlayerView, fx: BricksFx[]) => void;
}

interface Props {
  room: BricksRoomView;
  meId: string;
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
  { room, meId, cell, phone, serverOffset, send, listeners, lastSnapshot, relayed },
  ref,
) {
  // Ses chiffres (lignes, envoyées, K.O., place) arrivent pose après pose dans useBoards
  const me = useBoards((s) => s.players[meId]) ?? room.bricks!.players.find((p) => p.id === meId)!;
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
  const [koBy, setKoBy] = useState<string | null>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const das = useControls((s) => s.das);
  const arr = useControls((s) => s.arr);
  const keys = useControls((s) => s.keys);
  const reduced = usePrefs((s) => s.reducedEffects);
  const g = room.bricks!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { width, height } = boardSize(cell);
  const previews = g.settings.previews;
  const side = phone ? Math.round(cell * 2.1) : Math.round(cell * 3.4);

  // En développement seulement : les tests lisent l'état de la partie et comptent les rendus
  if (import.meta.env.DEV) {
    const w = window as unknown as { __bricks?: unknown; __bricksRenders?: number };
    w.__bricks = game;
    w.__bricksRenders = (w.__bricksRenders ?? 0) + 1;
  }
  roomRef.current = room;
  offset.current = serverOffset;
  relayedRef.current = relayed;
  const serverNow = () => Date.now() + offset.current;

  function popup(p: Omit<Popup, "id">) {
    const id = ++popupSeq;
    setPopups((prev) => [...prev.slice(-3), { ...p, id }]);
    setTimeout(() => setPopups((prev) => prev.filter((x) => x.id !== id)), p.big ? 1400 : 1000);
  }

  // Ce que l'écran fait tout de suite à chaque geste : sons, éclats, messages.
  // Tout part d'ici, au moment même du geste : rien n'attend la réponse du serveur.
  const hardDrop = useRef(false);
  function onLocal(e: LocalEvent) {
    const fx = effects.current;
    switch (e.type) {
      case "move":
        play("brickMove");
        break;
      case "rotate":
        play("brickRotate");
        break;
      case "hold":
        play("brickHold");
        break;
      case "drop":
        fx.dropStreak(e.from, e.to);
        hardDrop.current = true;
        break;
      case "lock": {
        const r = e.result;
        const dropped = hardDrop.current;
        hardDrop.current = false;
        if (r.lines > 0) {
          const big = r.lines === 4 || r.spin !== "none" || r.perfect;
          fx.burst(r.rows, locked(e.before, e.piece), cell, big, reduced);
          // Un carillon de verre, un peu plus aigu à chaque ligne de plus
          if (big) play("brickQuad");
          else play("brickClear", { rate: [1, 1, 1.12, 1.26][r.lines] });
          if (r.combo >= 1) play("brickCombo", { rate: 1 + Math.min(r.combo, 10) * 0.06 });
          if (r.sent > 0) play("brickAttack");
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
          play(dropped ? "brickDrop" : "brickLock");
        }
        if (r.spin !== "none") play("brickSpin");
        if (r.garbageIn > 0) {
          fx.rise = Math.min(4, r.garbageIn);
          fx.shake = Math.max(fx.shake, 0.6);
          play("brickGarbage");
          vibrate(30);
        }
        if (r.topOut) {
          play("brickKo");
          vibrate([80, 40, 120]);
        }
        break;
      }
      case "blocked":
        // La réserve ou la pièce suivante ne peut plus apparaître : on le dit au serveur, qui vérifie
        send({ t: "blocked" });
        play("brickKo");
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
      else setKoBy(null);
    };
    listeners.current.self = onSelf;
    listeners.current.garbage = (c) => {
      game.current?.addGarbage(c);
      play("brickWarn");
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
      // Qui nous a mis K.O., pour le dire sur le plateau (le son, lui, est déjà parti)
      for (const f of fx) if (f.type === "ko" && f.id === p.id) setKoBy(f.by);
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
    let meterValue = -1;
    let lastFrame = "";
    const ctx = canvas.current?.getContext("2d");
    const renderer = ctx ? new BoardRenderer(ctx, cell, dpr) : null;
    let relayGrid: { key: string; grid: ReturnType<typeof gridFromString> } | null = null;
    let drawnGrid: unknown = null;
    const tick = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      const now = serverNow();
      const gm = game.current;
      const cur = roomRef.current.bricks;
      const playing = cur?.round.phase === "playing" || (cur?.round.phase === "countdown" && now >= cur.round.startAt);
      const relayedNow = relayedRef.current;
      if (gm && playing && !relayedNow) gm.tick(dt, now);
      effects.current.step(dt, cell);
      if (renderer && gm) {
        const over = cur?.round.phase === "over";
        const paused = now < gm.pausedUntil;
        // Pendant un K.O., en fin de manche ou quand un bot joue pour nous, aucune pièce ne tombe à l'écran
        const piece = over || paused || relayedNow ? null : gm.piece;
        const ghost = piece && useControls.getState().ghost ? gm.ghost : null;
        // Un bot joue pour nous : on montre le plateau tel que le serveur le voit
        let grid = gm.board.grid;
        if (relayedNow) {
          const key = meRef.current.grid;
          if (relayGrid?.key !== key) relayGrid = { key, grid: gridFromString(key) };
          grid = relayGrid.grid;
        }
        const fall = piece ? Math.round(gm.fall * 24) / 24 : 0;
        // Éliminé : sa pile reste visible mais s'efface, la manche continue sans nous
        const dim = !playing || paused || relayedNow || !meRef.current.alive;
        const frameKey = `${piece ? `${piece.type}${piece.x},${piece.y},${piece.rot},${fall}` : "-"}|${ghost ? ghost.y : "-"}|${dim}`;
        // Rien n'a bougé et aucun effet en cours : on ne redessine pas
        if (frameKey !== lastFrame || grid !== drawnGrid || effects.current.busy) {
          renderer.render({ grid, piece, ghost, cell, dpr, effects: effects.current, dim, fall });
          lastFrame = frameKey;
          drawnGrid = grid;
        }
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
        const pending = Math.min(100, (gm.pending / 20) * 100);
        if (pending !== meterValue && meter.current) {
          meterValue = pending;
          meter.current.style.height = `${pending}%`;
        }
        const high = !over && stackHeight(grid) >= 15;
        if (high !== danger) {
          danger = high;
          frame.current?.classList.toggle("is-danger", high);
        }
        // Montrer sa pièce aux autres, une dizaine de fois par seconde au plus
        const live: Active | null = playing && !paused ? gm.live : null;
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
  const touch = useRef<{
    x: number;
    y: number;
    t: number;
    lastX: number;
    moved: boolean;
    soft: boolean;
    id: number;
    trail: { y: number; t: number }[];
  } | null>(null);
  // Vitesse du doigt vers le bas sur les 80 dernières ms : un geste qui part lentement devient une descente.
  // La moyenne depuis le début du toucher mélangeait tout (l'hésitation au départ ralentit le calcul).
  function speedDown(tc: NonNullable<typeof touch.current>, y: number, t: number) {
    tc.trail.push({ y, t });
    while (tc.trail.length > 2 && t - tc.trail[0]!.t > 80) tc.trail.shift();
    const first = tc.trail[0]!;
    return (y - first.y) / Math.max(1, t - first.t);
  }
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
      const t = performance.now();
      touch.current = {
        x: e.clientX,
        y: e.clientY,
        t,
        lastX: e.clientX,
        moved: false,
        soft: false,
        id: e.pointerId,
        trail: [{ y: e.clientY, t }],
      };
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
      const now = performance.now();
      const speed = speedDown(tc, e.clientY, now);
      // Un coup de doigt est fini en moins de 140 ms : passé ce temps, un geste lent est une descente
      if (!tc.soft && now - tc.t >= 140 && dy > cell * 1.4 && speed < 0.45 && Math.abs(e.clientX - tc.x) < cell * 1.5) {
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
      // Une descente commencée doucement ne lâche jamais la pièce ; tout autre balayage net vers le bas la lâche
      if (!tc.soft && dy > cell * 2.2 && Math.abs(dx) < Math.abs(dy)) act("hard");
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
  const koByName = koBy ? room.seats.find((x) => x.id === koBy)?.name : null;

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
            <motion.div className="board-stamp is-ko is-explained" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <strong>K.O. !</strong>
              <span>
                Ta pile repart à zéro
                {koByName ? `, un point pour ${koByName}` : ""}
              </span>
            </motion.div>
          )}
          {g.round.phase === "over" && !g.matchOver && g.settings.win === "ko" && <div className="board-stamp">Temps écoulé !</div>}
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
