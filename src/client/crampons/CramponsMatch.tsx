import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { HUMAN_KEEPER_WAIT, HUMAN_RESTART_WAIT, type MatchEvent, type RestartKind } from "../../shared/games/crampons/model.ts";
import type { CramponsClientMessage, CramponsRoomView } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";
import { CRAMPONS_SOUNDS, play, preloadSounds } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { THROUGH_HOLD_MS, type GameButton } from "./controls.ts";
import { CramponsGameOver } from "./CramponsGameOver.tsx";
import { loadSettings, type CramponsSettings } from "./bindings.ts";
import { HowTo, KeyHints, mainKey, Radar } from "./CramponsHud.tsx";
import { SettingsPanel } from "./CramponsSettings.tsx";
import { Commentator } from "./commentary.ts";
import { MatchRuntime, type HudState } from "./runtime.ts";
import { StadiumSound } from "./stadiumSound.ts";
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

const RESTART_ACTION: Record<RestartKind, string> = {
  kickoff: "Donner le coup d'envoi",
  throw: "Faire la touche",
  corner: "Tirer le corner",
  goalkick: "Dégager",
  free: "Jouer le coup franc",
  penalty: "Tirer le penalty",
};

const PERIODS: Record<number, string> = { 1: "1re mi-temps", 2: "2e mi-temps", 3: "Prolong.", 4: "Prolong.", 5: "Tirs au but" };
const HOWTO_KEY = "crampons-howto-vu";

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Le stick suit le doigt jusque-là ; au-delà du grand cercle, le joueur sprinte */
const STICK_R = 52;
const STICK_SPRINT = STICK_R * 1.45;

/**
 * Le stick du pouce gauche : il se pose là où le pouce touche, n'importe où en bas à gauche de l'écran (pas besoin de
 * viser un rond). Poussé jusqu'au grand cercle, il fait sprinter : le pouce qui dirige n'a pas à aller chercher un bouton.
 */
function Stick({ runtime }: { runtime: MutableRefObject<MatchRuntime | null> }) {
  const [live, setLive] = useState<{ ox: number; oy: number; kx: number; ky: number; sprint: boolean } | null>(null);
  const zone = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    /** Le doigt suivi, et là où il s'est posé */
    let finger: { id: number; x: number; y: number } | null = null;
    const apply = (x: number, y: number) => {
      if (!finger) return;
      const z = el.getBoundingClientRect();
      const dx = x - finger.x;
      const dy = y - finger.y;
      const l = Math.hypot(dx, dy);
      const k = l > STICK_R ? STICK_R / l : 1;
      const sprint = l > STICK_SPRINT;
      const t = runtime.current?.pad.touch;
      if (t) {
        t.sx = (dx * k) / STICK_R;
        t.sy = (dy * k) / STICK_R;
        t.sprint = sprint;
      }
      // Le rond suit le doigt jusqu'au grand cercle, pour qu'on voie où commence le sprint
      const shown = l > 0 ? Math.min(l, STICK_SPRINT + 4) / l : 0;
      setLive({ ox: finger.x - z.left, oy: finger.y - z.top, kx: dx * shown, ky: dy * shown, sprint });
    };
    const release = () => {
      finger = null;
      setLive(null);
      const t = runtime.current?.pad.touch;
      if (t) {
        t.sx = 0;
        t.sy = 0;
        t.sprint = false;
      }
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      // Un nouveau pouce prend toujours la main : un doigt dont on n'aurait pas vu le départ ne bloque jamais le stick
      finger = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Le doigt est suivi sur toute la fenêtre de toute façon
      }
      apply(e.clientX, e.clientY);
    };
    // Suivi sur toute la fenêtre : le pouce qui sort de la zone (poussé à fond vers un coin) garde le stick
    const move = (e: PointerEvent) => {
      if (finger && e.pointerId === finger.id) apply(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (finger && e.pointerId === finger.id) release();
    };
    // Sur iPhone, un pouce immobile ou près du bord pouvait être pris pour un geste du téléphone (appui long, retour en
    // arrière) qui annulait le toucher : on garde ces gestes pour nous
    const keep = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("touchstart", keep, { passive: false });
    el.addEventListener("touchmove", keep, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("touchstart", keep);
      el.removeEventListener("touchmove", keep);
      release();
    };
  }, [runtime]);
  return (
    <div ref={zone} className="cr-stickzone">
      <div
        className={`cr-stick ${live ? "is-live" : ""} ${live?.sprint ? "is-sprint" : ""}`}
        style={live ? { left: live.ox, top: live.oy } : undefined}
      >
        <i className="cr-stick-ring" />
        <span className="cr-knob" style={live ? { transform: `translate(${live.kx}px, ${live.ky}px)` } : undefined} />
        {live?.sprint && <b className="cr-stick-sprint">Sprint</b>}
      </div>
    </div>
  );
}

/** Garde pour nous les gestes du doigt sur un bouton (appui long, double appui qui zoome) */
function useTouchKept(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const keep = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", keep, { passive: false });
    el.addEventListener("touchmove", keep, { passive: false });
    return () => {
      el.removeEventListener("touchstart", keep);
      el.removeEventListener("touchmove", keep);
    };
  }, [ref]);
}

function PadButton({
  runtime,
  button,
  label,
  holdLabel,
  tone,
}: {
  runtime: MutableRefObject<MatchRuntime | null>;
  button: GameButton;
  label: string;
  /** Ce que fait le bouton si on le tient (la passe en profondeur) : écrit dessus dès que c'est le cas */
  holdLabel?: string;
  tone: string;
}) {
  const [long, setLong] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  /** Le doigt qui tient le bouton : il le relâche où qu'il se lève, même ailleurs sur l'écran */
  const finger = useRef<number | null>(null);
  useTouchKept(ref);
  const set = (on: boolean) => {
    runtime.current?.pad.touchButton(button, on);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (on && holdLabel) timer.current = setTimeout(() => setLong(true), THROUGH_HOLD_MS);
    else setLong(false);
  };
  const setNow = useRef(set);
  setNow.current = set;
  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (finger.current !== e.pointerId) return;
      finger.current = null;
      setNow.current(false);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (timer.current) clearTimeout(timer.current);
      if (finger.current !== null) runtime.current?.pad.touchButton(button, false);
      finger.current = null;
    };
  }, [runtime, button]);
  return (
    <button
      ref={ref}
      className={`cr-btn is-${tone} ${long ? "is-long" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        finger.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Le lever du doigt est suivi sur toute la fenêtre
        }
        set(true);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {long && holdLabel ? holdLabel : label}
    </button>
  );
}

/** Changer de joueur, sans le ballon : d'un seul appui */
function SwapButton({ runtime }: { runtime: MutableRefObject<MatchRuntime | null> }) {
  const ref = useRef<HTMLButtonElement>(null);
  useTouchKept(ref);
  return (
    <button
      ref={ref}
      className="cr-btn is-swap"
      onPointerDown={(e) => {
        e.preventDefault();
        runtime.current?.pad.swapNow();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      Changer
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
  // L'état du match tel que l'image le montre : le score change quand le ballon entre, pas un instant avant
  const [shownView, setShown] = useState(view);
  const shown = shownView.teams[0].name === view.teams[0].name ? shownView : view;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const voice = useRef<Commentator | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<MatchRuntime | null>(null);
  const reduced = usePrefs((s) => s.reducedEffects);
  const inTour = Boolean(useTourBridge());
  const [hud, setHud] = useState<HudState>({
    clock: 0,
    active: -1,
    activeName: "",
    stamina: 1,
    charge: 0,
    hasBall: false,
    keeperHold: false,
    defending: false,
    scheme: "clavier",
    fps: 60,
    ping: 0,
    radar: [],
    ballX: 0,
    ballZ: 0,
  });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [camera, setCamera] = useState<"tele" | "large" | "pres">("tele");
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const seq = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const seatId = room.you.seatId;
  // Un autre format, d'autres clubs ou une autre ambiance : il faut reconstruire le stade et les joueurs
  const matchKey = `${view.teams[0].name}|${view.teams[1].name}|${view.players.length}|${view.config.ambience}|${view.teams[1].kit.shirt}`;
  const [mods, setMods] = useState({ finesse: false, chip: false });
  const [settings, setSettings] = useState<CramponsSettings>(() => loadSettings());
  const [panel, setPanel] = useState(false);
  const pausedRef = useRef(false);
  // La présentation est montrée dès la première image : l'affichage du match n'apparaît qu'après
  const [cinema, setCinema] = useState<"intro" | "scorer" | "replay" | null>(() =>
    view.phase === "kickoff" && view.period === 1 && view.score[0] + view.score[1] === 0 ? "intro" : null,
  );
  const [ready, setReady] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // L'aide s'ouvre d'elle-même au tout premier match
  const [help, setHelp] = useState(() => seatId !== null && !localStorage.getItem(HOWTO_KEY));
  pausedRef.current = panel || help;
  const closeHelp = () => {
    localStorage.setItem(HOWTO_KEY, "1");
    setHelp(false);
  };
  const radarColors = useMemo<[string, string]>(() => [view.teams[0].kit.shirt, view.teams[1].kit.shirt], [view.teams]);
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
    // Le stade : une vraie foule, qui suit le jeu ; et la voix du commentateur
    const stadium = new StadiumSound();
    void stadium.start();
    const commentator = new Commentator(() => {
      const v = viewRef.current;
      const s = shownRef.current;
      const rt = runtime.current;
      return {
        teams: [v.teams[0].name, v.teams[1].name],
        players: v.players.map((p) => ({ name: p.name, team: p.team, keeper: p.role === "GK" })),
        score: s.score,
        period: s.period,
        clock: rt?.clock ?? 0,
        weather: v.config.weather,
        ambience: v.config.ambience,
        spot: (i) => rt?.spotOf(i) ?? null,
        ball: () => rt?.ballSpot() ?? { x: 0, z: 0 },
        attack: (team) => rt?.attackSign(team) ?? (team === 0 ? 1 : -1),
      };
    }, settingsRef.current.commentary);
    voice.current = commentator;
    const v0 = viewRef.current;
    const welcome =
      v0.phase === "kickoff" && v0.period === 1 && v0.score[0] + v0.score[1] === 0 ? setTimeout(() => commentator.welcome(), 700) : null;
    const onEvents = (events: MatchEvent[]) => {
      for (const e of events) {
        commentator.event(e);
        if (e.k === "goal") stadium.goal();
        else if (e.k === "save") {
          stadium.ooh(e.caught ? 0.6 : 1);
          if (!e.caught) stadium.applaud(0.5);
        } else if (e.k === "woodwork") stadium.ooh(1);
        else if (e.k === "shot") stadium.rise(0.2 + e.power * 0.25);
        else if (e.k === "half" || e.k === "end") stadium.applaud(0.8);
        else if (e.k === "penalty") {
          if (e.scored) stadium.applaud(0.7);
          else stadium.ooh(1);
        }
        if (e.k === "kick" && runtime.current?.isLocalKick(e.p)) continue;
        if (e.k === "kick")
          play(e.kind === "shot" || e.kind === "finesse" || e.kind === "clear" ? "footShot" : "footKick", {
            rate: 0.94 + Math.random() * 0.14,
          });
        else if (e.k === "whistle") play(e.why === "end" || e.why === "half" ? "footWhistleEnd" : "footWhistle");
        else if (e.k === "woodwork") play("footPost");
        else if (e.k === "net") play("footNet");
        if (e.k === "shot") setMods({ finesse: false, chip: false });
        if (e.k === "kick" && (e.kind === "shot" || e.kind === "clear")) runtime.current?.dust(e.p, e.power);
        if (e.k === "shot" && e.power > 0.45) runtime.current?.punch(e.p, e.power);
        if (e.k === "skill") {
          runtime.current?.dust(e.p, 0.5);
          play("footKick", { rate: 1.5 });
        }
        if (e.k === "tackle") runtime.current?.dust(e.p, 0.9);
        if (e.k === "goal") {
          runtime.current?.goal(e.scorer, e.team);
          show({ tone: "goal", title: e.own ? "Contre son camp !" : "BUT !", sub: nameOf(e.scorer) }, 3400);
        } else if (e.k === "offside") show({ tone: "info", title: "Hors-jeu", sub: nameOf(e.p) }, 1600);
        else if (e.k === "foul") {
          runtime.current?.foul(e.on, e.p);
          show({ tone: "info", title: e.penalty ? "Penalty !" : "Faute", sub: nameOf(e.p) }, 1700);
        } else if (e.k === "card") {
          runtime.current?.card(e.p, e.red);
          show({ tone: "card", title: e.red ? "Carton rouge" : "Carton jaune", sub: nameOf(e.p) }, 2300);
        } else if (e.k === "save" && !e.caught) show({ tone: "info", title: "Quel arrêt !", sub: nameOf(e.p) }, 1300);
        else if (e.k === "woodwork") show({ tone: "info", title: e.bar ? "Sur la barre !" : "Sur le poteau !" }, 1300);
        else if (e.k === "half" && e.period === 1) show({ tone: "info", title: "Mi-temps" }, 2500);
        else if (e.k === "penalty") show({ tone: e.scored ? "goal" : "info", title: e.scored ? "Marqué !" : "Raté !" }, 1200);
      }
    };
    const rt = new MatchRuntime(
      canvas.current!,
      viewRef.current,
      {
        seatId,
        send: (x, z, s, p, c) => send({ t: "in", x, z, s, p, c }),
        act: (k, p, x, z, to) => send({ t: "act", k, p, x, z, to }),
        onReady: () => setReady(true),
        onHud: (h) => {
          setHud(h);
          setCinema(runtime.current?.inCinema ?? null);
        },
        onLocalKick: (kind) =>
          play(kind === "shot" || kind === "finesse" || kind === "chip" ? "footShot" : "footKick", { rate: 0.94 + Math.random() * 0.14 }),
        onEvents,
        onShownView: setShown,
        onCrowd: (dt, mood) => stadium.update(dt, mood),
      },
      reduced || window.matchMedia("(pointer: coarse)").matches,
      settingsRef.current,
    );
    runtime.current = rt;
    // Un match reconstruit garde la caméra choisie, et reste en pause si un panneau est ouvert
    rt.setCamera(cameraRef.current);
    rt.setPaused(pausedRef.current);
    listeners.current.onTick = (now, tick) => rt.onTick(now, tick);
    listeners.current.onEvents = onEvents;
    preloadSounds(CRAMPONS_SOUNDS);
    return () => {
      listeners.current.onTick = undefined;
      listeners.current.onEvents = undefined;
      stadium.stop();
      if (welcome) clearTimeout(welcome);
      commentator.dispose();
      voice.current = null;
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

  useEffect(() => {
    runtime.current?.setSettings(settings);
    voice.current?.setEnabled(settings.commentary);
  }, [settings]);

  // Pendant les réglages et l'aide, les touches ne font plus jouer
  useEffect(() => {
    runtime.current?.setPaused(panel || help);
  }, [panel, help]);

  const score = shown.score;
  const restart = view.restart;
  const taking = restart?.ready && view.phase !== "play" && hud.active >= 0 && restart.taker === hud.active;
  // À lui de jouer la remise en jeu : un compte à rebours, sinon l'ordinateur la joue à sa place
  // De même quand son gardien tient le ballon dans les mains : à lui de relancer
  const keeperHold = hud.keeperHold && view.phase === "play" && !cinema;
  // Le ballon est à lui (au pied, dans les mains de son gardien, ou pour une remise en jeu) : les boutons servent à le jouer
  const withBall = hud.hasBall || Boolean(taking);
  const [restartLeft, setRestartLeft] = useState<number | null>(null);
  const takingKey = taking ? `${restart?.kind}-${restart?.taker}` : keeperHold ? `gk-${hud.active}` : "";
  useEffect(() => {
    if (!takingKey) {
      setRestartLeft(null);
      return;
    }
    const wait = takingKey.startsWith("gk-") ? HUMAN_KEEPER_WAIT : HUMAN_RESTART_WAIT;
    const start = performance.now();
    setRestartLeft(wait);
    const id = setInterval(() => setRestartLeft(Math.max(0, Math.ceil(wait - (performance.now() - start) / 1000))), 200);
    return () => clearInterval(id);
  }, [takingKey]);
  const left = view.teams[0];
  const right = view.teams[1];
  const shootout = shown.shootout;
  const over = shown.phase === "over" && room.status === "finished";

  // Au doigt, on nomme le bouton de l'écran ; au clavier et à la manette, la touche
  // Sur un téléphone, avant même le premier appui (le coup d'envoi), c'est le bouton de l'écran : pas « Clic droit »
  const screenKeys = hud.scheme === "tactile" || (touch && hud.scheme !== "manette");
  const keyOf = (shot: boolean) => (screenKeys ? (shot ? "Tir" : "Passe") : mainKey(hud.scheme, settings.bindings, shot));
  const key = keyOf(restart?.kind === "penalty");
  return (
    <div className="cr-root">
      <canvas ref={canvas} className={`cr-canvas ${settings.aim === "curseur" && !touch ? "is-aim" : ""} ${ready ? "is-ready" : ""}`} />
      {/* Au doigt, pendant la présentation, le gros plan ou le ralenti : toucher l'écran n'importe où les passe */}
      {touch && cinema && seatId !== null && (
        <div
          className="cr-skip"
          onPointerDown={(e) => {
            e.preventDefault();
            const pad = runtime.current?.pad;
            pad?.touchButton("pass", true);
            pad?.touchButton("pass", false);
          }}
        />
      )}

      <div className={`cr-bug ${cinema === "intro" ? "is-hidden" : ""}`} role="status">
        <div className="cr-bug-teams">
          <div className="cr-bug-team">
            <i style={{ background: left.kit.shirt }} />
            <b>{left.short}</b>
            <strong className="num">{score[0]}</strong>
          </div>
          <div className="cr-bug-team">
            <i style={{ background: right.kit.shirt }} />
            <b>{right.short}</b>
            <strong className="num">{score[1]}</strong>
          </div>
        </div>
        <div className="cr-bug-clock num">
          {view.period === 5 ? "T.A.B." : formatClock(hud.clock)}
          <small>{PERIODS[view.period] ?? ""}</small>
        </div>
      </div>

      <div className={`cr-tools ${cinema === "intro" ? "is-hidden" : ""}`}>
        <button
          className="cr-mini"
          onClick={() => setCamera((c) => (c === "tele" ? "large" : c === "large" ? "pres" : "tele"))}
          aria-label="Changer de caméra"
          title="Changer de caméra"
        >
          <Icon name="eye" size={18} />
        </button>
        <button className="cr-mini" onClick={() => setPanel(true)} aria-label="Réglages" title="Réglages">
          <Icon name="settings" size={18} />
        </button>
        <button className="cr-mini" onClick={() => setHelp(true)} aria-label="Comment jouer" title="Comment jouer">
          ?
        </button>
        <button className="cr-mini" onClick={onOpenChat} aria-label="Discussion" title="Discussion">
          <Icon name="chat" size={18} />
          {unread > 0 && <span className="cr-badge">{unread}</span>}
        </button>
        <button
          className="cr-mini"
          onClick={onLeave}
          aria-label={inTour ? "Quitter la tournée" : "Quitter le match"}
          title={inTour ? "Quitter la tournée" : "Quitter le match"}
        >
          <Icon name="close" size={18} />
        </button>
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
        <div key={banner.id} className={`cr-banner is-${banner.tone} ${banner.title.length > 8 ? "is-long" : ""}`}>
          <strong>{banner.title}</strong>
          {banner.sub && <span>{banner.sub}</span>}
        </div>
      )}

      {!banner &&
        !cinema &&
        restart?.ready &&
        view.phase !== "play" &&
        (taking ? (
          <div className="cr-prompt">
            <b className="cr-prompt-me">À toi !</b>
            <kbd>{key}</kbd> {RESTART_ACTION[restart.kind]}
            {restartLeft !== null && restartLeft <= 5 && <span className="cr-prompt-count num">{restartLeft}</span>}
          </div>
        ) : (
          <div className="cr-prompt is-quiet">{RESTART_LABEL[restart.kind]}</div>
        ))}

      {!banner && keeperHold && seatId !== null && (
        <div className="cr-prompt">
          <b className="cr-prompt-me">À toi !</b>
          <kbd>{keyOf(false)}</kbd> Relancer
          <kbd>{keyOf(true)}</kbd> Dégager
          {restartLeft !== null && restartLeft <= 4 && <span className="cr-prompt-count num">{restartLeft}</span>}
        </div>
      )}

      {cinema && (
        <div className="cr-cinema" aria-hidden="true">
          <i />
          <i />
        </div>
      )}
      {cinema === "replay" && (
        <div className="cr-replay">
          <span /> Ralenti <small>{touch ? "Touche l'écran pour passer" : "Appuie sur une touche pour passer"}</small>
        </div>
      )}

      {settings.showFps && (
        <div className="cr-fps num">
          {hud.fps} i/s · {hud.ping} ms
        </div>
      )}
      {seatId !== null && !over && !touch && !cinema && (
        <KeyHints scheme={hud.scheme} defending={hud.defending} bindings={settings.bindings} />
      )}
      {!over && !cinema && <Radar data={hud.radar} ballX={hud.ballX} ballZ={hud.ballZ} colors={radarColors} />}

      {seatId !== null && hud.activeName && !over && !cinema && !(touch && shootout) && (
        <div className="cr-player">
          <span className="cr-pname">{hud.activeName}</span>
          <span className="cr-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(hud.stamina * 100)}%` }} className={hud.stamina < 0.3 ? "is-low" : ""} />
          </span>
        </div>
      )}

      {touch && seatId !== null && !over && (
        <div className={`cr-pad is-${settings.touchPad} ${cinema ? "is-cinema" : ""}`} data-ball={withBall ? "" : undefined}>
          <Stick runtime={runtime} />
          {settings.touchPad === "complet" && hud.hasBall && (
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
            <PadButton
              runtime={runtime}
              button="pass"
              tone="pass"
              label={hud.defending ? "Presser" : keeperHold ? "Relancer" : "Passe"}
              holdLabel={
                settings.touchPad === "simple" && withBall && !(taking && (restart?.kind === "penalty" || restart?.kind === "kickoff"))
                  ? taking && restart?.kind === "corner"
                    ? "Centre"
                    : "Profondeur"
                  : undefined
              }
            />
            <PadButton
              runtime={runtime}
              button="shoot"
              tone="shot"
              label={hud.defending ? "Tacle" : hud.hasBall && view.players[hud.active]?.role === "GK" ? "Dégager" : "Tir"}
            />
            {settings.touchPad === "complet" ? (
              <>
                <PadButton runtime={runtime} button="through" tone="through" label={hud.defending ? "Changer" : "Profond."} />
                {!hud.defending && <PadButton runtime={runtime} button="lob" tone="lob" label="Lob" />}
              </>
            ) : (
              !withBall && <SwapButton runtime={runtime} />
            )}
          </div>
        </div>
      )}

      {help && (
        <HowTo
          touch={touch}
          touchPad={settings.touchPad}
          bindings={settings.bindings}
          onClose={closeHelp}
          onSettings={() => {
            closeHelp();
            setPanel(true);
          }}
        />
      )}
      {panel && <SettingsPanel touch={touch} settings={settings} onChange={setSettings} onClose={() => setPanel(false)} />}

      {over && <CramponsGameOver room={room} send={send} onLeave={onLeave} onShowLobby={onShowLobby} />}
    </div>
  );
}
