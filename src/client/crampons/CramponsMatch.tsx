import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import type { MatchEvent, RestartKind } from "../../shared/games/crampons/model.ts";
import type { CramponsClientMessage, CramponsRoomView } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";
import { CRAMPONS_SOUNDS, play, preloadSounds, startLoop, stopLoop } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import type { GameButton } from "./controls.ts";
import { CramponsGameOver } from "./CramponsGameOver.tsx";
import { MatchRuntime, type HudState } from "./runtime.ts";
import type { MatchListeners } from "./useCramponsRoom.ts";

interface Banner {
  id: number;
  title: string;
  sub?: string;
  tone: "goal" | "info" | "card";
}

const RESTART_LABEL: Record<RestartKind, string> = {
  kickoff: "Coup d'envoi",
  throw: "Touche",
  corner: "Corner",
  goalkick: "Six mètres",
  free: "Coup franc",
  penalty: "Penalty",
};

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Le stick du pouce gauche */
function Joystick({ runtime }: { runtime: MutableRefObject<MatchRuntime | null> }) {
  const [knob, setKnob] = useState<[number, number] | null>(null);
  const origin = useRef<[number, number]>([0, 0]);
  const R = 56;
  const move = (e: ReactPointerEvent) => {
    const dx = e.clientX - origin.current[0];
    const dy = e.clientY - origin.current[1];
    const l = Math.hypot(dx, dy);
    const k = l > R ? R / l : 1;
    setKnob([dx * k, dy * k]);
    const t = runtime.current?.pad.touch;
    if (t) {
      t.sx = (dx * k) / R;
      t.sy = (dy * k) / R;
    }
  };
  const end = () => {
    setKnob(null);
    const t = runtime.current?.pad.touch;
    if (t) {
      t.sx = 0;
      t.sy = 0;
    }
  };
  return (
    <div
      className="cr-stick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = [r.left + r.width / 2, r.top + r.height / 2];
        move(e);
      }}
      onPointerMove={(e) => knob && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="cr-knob" style={knob ? { transform: `translate(${knob[0]}px, ${knob[1]}px)` } : undefined} />
    </div>
  );
}

function PadButton({
  runtime,
  button,
  label,
  tone,
}: {
  runtime: MutableRefObject<MatchRuntime | null>;
  button: GameButton;
  label: string;
  tone: string;
}) {
  const set = (on: boolean) => runtime.current?.pad.touchButton(button, on);
  return (
    <button
      className={`cr-btn is-${tone}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
    >
      {label}
    </button>
  );
}

export function CramponsMatch({
  room,
  send,
  listeners,
  onLeave,
  onOpenChat,
  unread,
  onShowLobby,
}: {
  room: CramponsRoomView;
  send: (m: CramponsClientMessage) => void;
  listeners: MutableRefObject<MatchListeners>;
  onLeave: () => void;
  onOpenChat: () => void;
  unread: number;
  onShowLobby: () => void;
}) {
  const view = room.crampons!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<MatchRuntime | null>(null);
  const reduced = usePrefs((s) => s.reducedEffects);
  const [hud, setHud] = useState<HudState>({
    clock: 0,
    activeName: "",
    stamina: 1,
    charge: 0,
    hasBall: false,
    defending: false,
    scheme: "fleches",
    radar: [],
    ballX: 0,
    ballZ: 0,
  });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [camera, setCamera] = useState<"tele" | "large" | "pres">("tele");
  const seq = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const seatId = room.you.seatId;
  // Un autre format, d'autres clubs ou une autre ambiance : il faut reconstruire le stade et les joueurs
  const matchKey = `${view.teams[0].name}|${view.teams[1].name}|${view.players.length}|${view.config.ambience}|${view.teams[1].kit.shirt}`;
  const [mods, setMods] = useState({ finesse: false, chip: false });
  const setMod = (key: "finesse" | "chip") => {
    const pad = runtime.current?.pad.touch;
    if (!pad) return;
    const on = !pad[key];
    pad.finesse = false;
    pad.chip = false;
    pad[key] = on;
    setMods({ finesse: pad.finesse, chip: pad.chip });
  };

  useEffect(() => {
    const show = (b: Omit<Banner, "id">, ms: number) => {
      const id = ++seq.current;
      setBanner({ ...b, id });
      setTimeout(() => setBanner((cur) => (cur?.id === id ? null : cur)), ms);
    };
    const nameOf = (i: number) => viewRef.current.players[i]?.name ?? "";
    const rt = new MatchRuntime(
      canvas.current!,
      viewRef.current,
      {
        seatId,
        send: (x, z, s, p, c) => send({ t: "in", x, z, s, p, c }),
        act: (k, p, x, z) => send({ t: "act", k, p, x, z }),
        onHud: setHud,
        onLocalKick: (kind) =>
          play(kind === "shot" || kind === "finesse" || kind === "chip" ? "footShot" : "footKick", { rate: 0.94 + Math.random() * 0.14 }),
      },
      reduced,
    );
    runtime.current = rt;
    listeners.current.onTick = (now, tick) => rt.onTick(now, tick);
    preloadSounds(CRAMPONS_SOUNDS);
    startLoop("footCrowd");
    listeners.current.onEvents = (events: MatchEvent[]) => {
      for (const e of events) {
        if (e.k === "kick" && rt.isLocalKick(e.p)) continue;
        if (e.k === "kick")
          play(e.kind === "shot" || e.kind === "finesse" || e.kind === "clear" ? "footShot" : "footKick", {
            rate: 0.94 + Math.random() * 0.14,
          });
        else if (e.k === "whistle") play(e.why === "end" || e.why === "half" ? "footWhistleEnd" : "footWhistle");
        else if (e.k === "woodwork") {
          play("footPost");
          play("footOoh", { delay: 120 });
        } else if (e.k === "net") play("footNet");
        else if (e.k === "save" && !e.caught) play("footOoh");
        if (e.k === "shot") setMods({ finesse: false, chip: false });
        if (e.k === "goal") {
          play("footCheer");
          show({ tone: "goal", title: e.own ? "Contre son camp !" : "BUT !", sub: nameOf(e.scorer) }, 3400);
        } else if (e.k === "offside") show({ tone: "info", title: "Hors-jeu", sub: nameOf(e.p) }, 1600);
        else if (e.k === "foul") show({ tone: "info", title: e.penalty ? "Penalty !" : "Faute", sub: nameOf(e.p) }, 1700);
        else if (e.k === "card") show({ tone: "card", title: e.red ? "Carton rouge" : "Carton jaune", sub: nameOf(e.p) }, 2300);
        else if (e.k === "save" && !e.caught) show({ tone: "info", title: "Quel arrêt !", sub: nameOf(e.p) }, 1300);
        else if (e.k === "woodwork") show({ tone: "info", title: e.bar ? "Sur la barre !" : "Sur le poteau !" }, 1300);
        else if (e.k === "half" && e.period === 1) show({ tone: "info", title: "Mi-temps" }, 2500);
        else if (e.k === "penalty") show({ tone: e.scored ? "goal" : "info", title: e.scored ? "Marqué !" : "Raté !" }, 1200);
      }
    };
    return () => {
      listeners.current.onTick = undefined;
      listeners.current.onEvents = undefined;
      stopLoop("footCrowd");
      rt.dispose();
      runtime.current = null;
    };
    // Le match se crée une fois : ses données changent ensuite par setView
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey, seatId]);

  useEffect(() => {
    runtime.current?.setView(view);
  }, [view]);

  useEffect(() => {
    runtime.current?.setCamera(camera);
  }, [camera]);

  const score = view.score;
  const restart = view.restart;
  const taking = restart?.ready && view.phase !== "play" && hud.activeName !== "" && view.players[restart.taker]?.name === hud.activeName;
  const left = view.teams[0];
  const right = view.teams[1];
  const shootout = view.shootout;
  const over = view.phase === "over" && room.status === "finished";

  return (
    <div className="cr-root">
      <canvas ref={canvas} className="cr-canvas" />

      <div className="cr-top">
        <button className="cr-mini" onClick={onLeave} aria-label="Quitter le match">
          <Icon name="back" size={18} />
        </button>
        <div className="cr-score" role="status">
          <span className="cr-kit" style={{ background: left.kit.shirt }} />
          <span className="cr-short">{left.short}</span>
          <strong className="num">
            {score[0]} - {score[1]}
          </strong>
          <span className="cr-short">{right.short}</span>
          <span className="cr-kit" style={{ background: right.kit.shirt }} />
          <span className="cr-clock num">{view.period === 5 ? "T.A.B." : formatClock(hud.clock)}</span>
        </div>
        <div className="cr-top-right">
          <button
            className="cr-mini"
            onClick={() => setCamera((c) => (c === "tele" ? "large" : c === "large" ? "pres" : "tele"))}
            aria-label="Changer de caméra"
          >
            <Icon name="eye" size={18} />
          </button>
          <button className="cr-mini" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" size={18} />
            {unread > 0 && <span className="cr-badge">{unread}</span>}
          </button>
        </div>
      </div>

      {shootout && (
        <div className="cr-shootout">
          {[0, 1].map((t) => (
            <div key={t} className="cr-kicks">
              {shootout.kicks[t as 0 | 1].map((k, i) => (
                <i key={i} className={k ? "is-in" : "is-out"} />
              ))}
            </div>
          ))}
        </div>
      )}

      {banner && (
        <div key={banner.id} className={`cr-banner is-${banner.tone}`}>
          <strong>{banner.title}</strong>
          {banner.sub && <span>{banner.sub}</span>}
        </div>
      )}

      {!banner && restart?.ready && view.phase !== "play" && (
        <div className="cr-restart">
          {RESTART_LABEL[restart.kind]}
          {taking ? " : à toi de jouer" : ""}
        </div>
      )}

      {seatId !== null && hud.activeName && !over && (
        <div className="cr-player">
          <span className="cr-pname">{hud.activeName}</span>
          <span className="cr-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(hud.stamina * 100)}%` }} className={hud.stamina < 0.3 ? "is-low" : ""} />
          </span>
          {hud.charge > 0.04 && (
            <span className="cr-bar is-power" aria-hidden="true">
              <i style={{ width: `${Math.round(hud.charge * 100)}%` }} className={hud.charge > 0.86 ? "is-over" : ""} />
            </span>
          )}
        </div>
      )}

      {touch && seatId !== null && !over && (
        <div className="cr-pad">
          <Joystick runtime={runtime} />
          <button
            className="cr-sprint"
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              if (runtime.current) runtime.current.pad.touch.sprint = true;
            }}
            onPointerUp={() => {
              if (runtime.current) runtime.current.pad.touch.sprint = false;
            }}
            onPointerCancel={() => {
              if (runtime.current) runtime.current.pad.touch.sprint = false;
            }}
          >
            Sprint
          </button>
          {hud.hasBall && (
            <div className="cr-mods">
              <button className={mods.finesse ? "is-on" : ""} onClick={() => setMod("finesse")} aria-pressed={mods.finesse}>
                Effet
              </button>
              <button className={mods.chip ? "is-on" : ""} onClick={() => setMod("chip")} aria-pressed={mods.chip}>
                Piqué
              </button>
            </div>
          )}
          <div className="cr-buttons">
            <PadButton runtime={runtime} button="shoot" tone="shot" label={hud.defending ? "Glissé" : "Tir"} />
            <PadButton runtime={runtime} button="through" tone="through" label={hud.defending ? "Changer" : "Profond."} />
            <PadButton runtime={runtime} button="lob" tone="lob" label={hud.defending ? "Changer" : "Lob"} />
            <PadButton runtime={runtime} button="pass" tone="pass" label={hud.defending ? "Presser" : "Passe"} />
          </div>
        </div>
      )}

      {over && <CramponsGameOver room={room} send={send} onLeave={onLeave} onShowLobby={onShowLobby} />}
    </div>
  );
}
