import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { HUMAN_KEEPER_WAIT, HUMAN_RESTART_WAIT, type MatchEvent, type RestartKind } from "../../shared/games/crampons/model.ts";
import type { CramponsClientMessage, CramponsRoomView } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";
import { CRAMPONS_SOUNDS, play, preloadSounds } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import type { GameButton } from "./controls.ts";
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
  // L'état du match tel que l'image le montre : le score change quand le ballon entre, pas un instant avant
  const [shownView, setShown] = useState(view);
  const shown = shownView.teams[0].name === view.teams[0].name ? shownView : view;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const voice = useRef<Commentator | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<MatchRuntime | null>(null);
  const reduced = usePrefs((s) => s.reducedEffects);
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
        else if (e.k === "foul") show({ tone: "info", title: e.penalty ? "Penalty !" : "Faute", sub: nameOf(e.p) }, 1700);
        else if (e.k === "card") show({ tone: "card", title: e.red ? "Carton rouge" : "Carton jaune", sub: nameOf(e.p) }, 2300);
        else if (e.k === "save" && !e.caught) show({ tone: "info", title: "Quel arrêt !", sub: nameOf(e.p) }, 1300);
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
  const keyOf = (shot: boolean) => (hud.scheme === "tactile" ? (shot ? "Tir" : "Passe") : mainKey(hud.scheme, settings.bindings, shot));
  const key = keyOf(restart?.kind === "penalty");
  return (
    <div className="cr-root">
      <canvas ref={canvas} className={`cr-canvas ${settings.aim === "curseur" && !touch ? "is-aim" : ""} ${ready ? "is-ready" : ""}`} />

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
        <button className="cr-mini" onClick={onLeave} aria-label="Quitter le match" title="Quitter le match">
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
        <div key={banner.id} className={`cr-banner is-${banner.tone}`}>
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
          <span /> Ralenti <small>Appuie sur une touche pour passer</small>
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

      {seatId !== null && hud.activeName && !over && !cinema && (
        <div className="cr-player">
          <span className="cr-pname">{hud.activeName}</span>
          <span className="cr-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(hud.stamina * 100)}%` }} className={hud.stamina < 0.3 ? "is-low" : ""} />
          </span>
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
            <PadButton
              runtime={runtime}
              button="shoot"
              tone="shot"
              label={
                hud.defending ? "Glissé" : hud.hasBall && hud.active >= 0 && view.players[hud.active]?.role === "GK" ? "Dégager" : "Tir"
              }
            />
            <PadButton runtime={runtime} button="through" tone="through" label={hud.defending ? "Changer" : "Profond."} />
            <PadButton runtime={runtime} button="lob" tone="lob" label={hud.defending ? "Changer" : "Lob"} />
            <PadButton runtime={runtime} button="pass" tone="pass" label={hud.defending ? "Presser" : "Passe"} />
          </div>
        </div>
      )}

      {help && (
        <HowTo
          touch={touch}
          bindings={settings.bindings}
          onClose={closeHelp}
          onSettings={() => {
            closeHelp();
            setPanel(true);
          }}
        />
      )}
      {panel && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setPanel(false)} />}

      {over && <CramponsGameOver room={room} send={send} onLeave={onLeave} onShowLobby={onShowLobby} />}
    </div>
  );
}
