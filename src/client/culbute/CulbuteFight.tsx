import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { AVATAR_BACKGROUNDS } from "../../shared/avatar.ts";
import { avatarPalette, HABITUES, PALETTES } from "../../shared/games/culbute/fighters.ts";
import type { FightEvent, HazardKind } from "../../shared/games/culbute/model.ts";
import type { CulbuteClientMessage, CulbuteRoomView } from "../../shared/games/culbute/net.ts";
import { MODE_NAMES, type CulbuteConfig, type CulbuteView } from "../../shared/games/culbute/view.ts";
import { TOUR_TEAM_COLORS } from "../../shared/tour.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { MenuSound, SoundToggle } from "../components/SoundSettings.tsx";
import { FirstSecondsPanel } from "../game/FirstSecondsPanel.tsx";
import { GameLoading, loadingShown, type LoadingTheme } from "../game/GameLoading.tsx";
import { buzz } from "../lib/feel.ts";
import { watchFirstSeconds } from "../lib/firstSeconds.ts";
import { useGateClock, useLoadedSignal } from "../lib/loadGate.ts";
import { nextFrame } from "../lib/prepare.ts";
import { play, preloadSounds, type SoundName } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { loadSettings, saveSettings, type CulbuteSettings } from "./bindings.ts";
import { CommandsPanel } from "./CommandsPanel.tsx";
import { CulbuteGameOver } from "./CulbuteGameOver.tsx";
import { HowToPlay } from "./CulbuteHelp.tsx";
import { FightRuntime, type HudState } from "./runtime.ts";
import { FightMusic } from "./music.ts";
import { Foley } from "./foley.ts";
import { SeriesBadge, SeriesBoard } from "./SeriesBoard.tsx";
import * as sfx from "./sfx.ts";
import type { FighterLook } from "./scene/CulbuteScene.ts";
import type { FightListeners } from "./useCulbuteRoom.ts";

/** La couleur de chaque place (en équipes : celle de son équipe) */
export const PLAYER_COLORS = ["#e2483d", "#3f7fd8", "#f2c94c", "#2f9e6a", "#8e44ad", "#f2994a", "#26b5c8", "#e86aa6"];

const SOUNDS: SoundName[] = [
  "bolidesClang",
  "tourChip",
  "wild",
  "bolidesFirework",
  "pop",
  "eliminated",
  "bolidesBox",
  "bolidesCoin",
  "click",
  "mecheBoom",
  "bolidesThrow",
  "capBankrupt",
  "capDiceHit",
  "brickGo",
  "brickCount",
  "tourApplause",
  "bolidesSpring",
];

/** Le dessin de chaque combattant, d'après les sièges de la table */
/** Les règles du combat, pour un signalement : « Culbute, aux vies (3) » */
function fightVariant(c: CulbuteConfig): string {
  const detail = c.mode === "vies" ? ` (${c.stocks})` : c.mode === "temps" ? ` (${c.minutes} min)` : "";
  return `Culbute, ${MODE_NAMES[c.mode].toLowerCase()}${detail}${c.teams ? ", en équipes" : ""}`;
}

export function looksFor(room: CulbuteRoomView, view: CulbuteView): FighterLook[] {
  return view.fighters.map((f) => {
    const seat = room.seats.find((s) => s.id === f.id);
    const pick = seat?.fighter ?? { who: f.style };
    const color = view.config.teams
      ? (TOUR_TEAM_COLORS[f.team as 0 | 1] ?? PLAYER_COLORS[f.slot]!)
      : PLAYER_COLORS[f.slot % PLAYER_COLORS.length]!;
    if (pick.who === "moi" && seat) {
      return {
        slot: f.slot,
        name: seat.name,
        avatar: seat.avatar,
        style: f.style,
        palette: avatarPalette(AVATAR_BACKGROUNDS[seat.avatar.bg] ?? "#3f7fd8", f.style),
        color,
        me: seat.id === room.you.seatId,
        outfit: "moi",
      };
    }
    const who = pick.who === "moi" ? f.style : pick.who;
    return {
      slot: f.slot,
      name: seat?.name ?? HABITUES[who].name,
      avatar: HABITUES[who].avatar,
      style: f.style,
      palette: PALETTES[who][(pick.who !== "moi" && pick.tenue) || "dimanche"],
      color,
      me: seat?.id === room.you.seatId,
      bot: seat?.kind === "bot",
      outfit: who,
    };
  });
}

function soundOf(e: FightEvent, mine: number): { name: SoundName; volume?: number } | null {
  switch (e.k) {
    case "hit":
      // Les coups et la garde : des bruits fabriqués (voir sfx.ts)
      if (e.kind === "hit" || e.kind === "shield" || e.kind === "parry") return null;
      if (e.kind === "counter") return { name: "tourChip" };
      return e.a < 0 ? { name: "bolidesSpring", volume: 0.5 } : { name: "wild", volume: 0.5 };
    case "ko":
      return { name: "bolidesFirework", volume: e.v === mine ? 0.55 : 0.4 };
    case "back":
      return { name: "pop", volume: 0.6 };
    case "out":
      return { name: "eliminated", volume: 0.7 };
    case "item":
      return { name: "bolidesBox", volume: 0.4 };
    case "pick":
      return e.kind === "gateau" || e.kind === "cafe" ? { name: "bolidesCoin", volume: 0.6 } : { name: "click", volume: 0.6 };
    case "boom":
      return { name: "mecheBoom", volume: 0.7 };
    case "throw":
      return { name: "bolidesThrow", volume: 0.5 };
    case "break":
      return { name: "capBankrupt", volume: 0.7 };
    case "trap":
      return { name: "capDiceHit", volume: 0.6 };
    case "grab":
      return null;
    case "hazard":
      return e.go && e.kind === "petards" ? { name: "mecheBoom", volume: 0.8 } : null;
    case "go":
      return { name: "brickGo" };
    case "end":
      return { name: "tourApplause", volume: 0.7 };
  }
}

/** La couleur des pourcents : blanc au début, puis jaune, orange, rouge */
function dmgColor(d: number): string {
  if (d < 35) return "#ffffff";
  if (d < 70) return "#ffe08a";
  if (d < 110) return "#ffb04a";
  if (d < 150) return "#ff6a3a";
  return "#e2283a";
}

/** Le stick du pouce gauche : il se pose là où le pouce touche */
function Stick({ runtime }: { runtime: MutableRefObject<FightRuntime | null> }) {
  const zone = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const R = 50;
    let finger: { id: number; x: number; y: number } | null = null;
    const apply = (x: number, y: number) => {
      if (!finger) return;
      const z = el.getBoundingClientRect();
      const dx = x - finger.x;
      const dy = y - finger.y;
      const l = Math.hypot(dx, dy);
      const k = l > R ? R / l : 1;
      const t = runtime.current?.controls.touch;
      if (t) {
        t.sx = (dx * k) / R;
        t.sy = -(dy * k) / R;
      }
      setLive({ ox: finger.x - z.left, oy: finger.y - z.top, kx: dx * k, ky: dy * k });
    };
    const release = (e: PointerEvent) => {
      if (!finger || e.pointerId !== finger.id) return;
      finger = null;
      setLive(null);
      const t = runtime.current?.controls.touch;
      if (t) {
        t.sx = 0;
        t.sy = 0;
      }
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      finger = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Le doigt est suivi de toute façon
      }
      apply(e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (finger && e.pointerId === finger.id) apply(e.clientX, e.clientY);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", release);
    };
  }, [runtime]);
  return (
    <div ref={zone} className="cb-stick-zone" aria-hidden="true">
      {live ? (
        <>
          <span className="cb-stick-base" style={{ left: live.ox, top: live.oy }} />
          <span className="cb-stick-knob" style={{ left: live.ox + live.kx, top: live.oy + live.ky }} />
        </>
      ) : (
        <span className="cb-stick-hint">Pose ton pouce ici pour bouger</span>
      )}
    </div>
  );
}

/** Un bouton d'action au doigt : il reste enfoncé tant que le doigt est dessus */
function TouchButton({
  runtime,
  which,
  label,
  className,
}: {
  runtime: MutableRefObject<FightRuntime | null>;
  which: "atk" | "spc" | "jmp" | "grb";
  label: string;
  className: string;
}) {
  const set = (down: boolean) => runtime.current?.controls.touchButton(which, down);
  return (
    <button
      type="button"
      className={`cb-touch-btn ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/** En développement : un chargement ralenti d'autant (voir l'effet qui prépare l'arène) */
const SLOW_LOAD = import.meta.env.DEV ? slowLoad() : 0;
function slowLoad(): number {
  try {
    return Math.max(0, Number(localStorage.getItem("cbSlowLoad")) || 0);
  } catch {
    return 0;
  }
}

/** L'événement de l'arène qui s'annonce : un mot en haut de l'écran */
const HAZARD_TEXT: Record<HazardKind, string> = {
  charrette: "Gare à la charrette !",
  cloche: "La cloche va sonner !",
  petards: "Feu d'artifice !",
  cagettes: "Gare aux cagettes !",
};

function hazardSound(kind: HazardKind, go: boolean) {
  if (kind === "charrette") {
    if (!go) sfx.cart();
  } else if (kind === "cloche") sfx.bell(go);
  else if (kind === "petards") {
    if (!go) sfx.fuse();
  } else sfx.crate(go);
}

/** L'écran de chargement aux couleurs de la place du village, à la tombée du jour */
const LOADING_THEME: LoadingTheme = { from: "#e9885a", to: "#3b2346", accent: "#ffd25a" };

export function CulbuteFight({
  room,
  send,
  listeners,
  onLeave,
  onOpenChat,
  unread,
  onShowLobby,
  serverOffset,
}: {
  room: CulbuteRoomView;
  send: (msg: CulbuteClientMessage) => void;
  listeners: MutableRefObject<FightListeners>;
  onLeave: () => void;
  onOpenChat: () => void;
  unread: number;
  onShowLobby: () => void;
  /** L'heure du serveur moins celle de l'appareil */
  serverOffset: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<FightRuntime | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [commands, setCommands] = useState(false);
  const [flash, setFlash] = useState(0);
  const [hazard, setHazard] = useState<{ key: number; text: string } | null>(null);
  useEffect(() => {
    if (!hazard) return;
    const t = window.setTimeout(() => setHazard(null), 1800);
    return () => window.clearTimeout(t);
  }, [hazard]);
  const music = useRef<FightMusic | null>(null);
  const [settings, setSettings] = useState<CulbuteSettings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [touch, setTouch] = useState(() => window.matchMedia?.("(pointer: coarse)").matches ?? false);
  // Au doigt, téléphone tenu droit : un mot pour conseiller de le tourner (on le ferme d'un toucher, pour de bon)
  const [rotateHint, setRotateHint] = useState(() => {
    try {
      return localStorage.getItem("cbRotateHint") !== "0";
    } catch {
      return true;
    }
  });
  const closeRotateHint = () => {
    setRotateHint(false);
    try {
      localStorage.setItem("cbRotateHint", "0");
    } catch {
      // le navigateur refuse : le mot reviendra à la prochaine partie
    }
  };
  const bridge = useTourBridge();
  const view = room.culbute!;
  const fightKey = `${view.arena}:${view.fighters.map((f) => `${f.id}-${f.style}`).join(",")}`;
  const looks = useMemo(() => looksFor(room, view), [room, view]);
  const looksKey = JSON.stringify(looks);
  const looksRef = useRef(looks);
  looksRef.current = looks;
  const mySlot = view.fighters.findIndex((f) => f.id === room.you.seatId);
  const lastCount = useRef<number | null>(null);
  // Le chargement de l'arène (voir shared/loadGate.ts) : on dit « chargé » au serveur ; le combat (et son compte à
  // rebours) part quand tout le monde l'a dit
  const [prep, setPrep] = useState({ share: 0, done: false });
  const gateClock = useGateClock(room.gate, serverOffset);
  useLoadedSignal(room.gate, room.you.seatId, prep.done, send);
  const live = prep.done && gateClock.passed && room.status === "playing";
  useEffect(() => {
    if (live) return watchFirstSeconds("Culbute");
  }, [live]);

  useEffect(() => {
    preloadSounds(SOUNDS);
  }, []);

  // Une boucle de combat par écran : elle survit aux mises à jour du salon, et repart à la revanche
  useEffect(() => {
    if (!host.current) return;
    const foley = new Foley(view.fighters.map((f) => f.style));
    const rt = new FightRuntime(host.current, view, {
      mySeat: room.you.seatId,
      looks: looksRef.current,
      send,
      onHud: setHud,
      onEvents: (events) => {
        // La cloche repousse tout le monde : son « dong » suffit (pas un ressort par combattant)
        const ringing = events.some((e) => e.k === "hazard" && e.go && e.kind === "cloche");
        for (const e of events) {
          if (e.k === "hazard") {
            hazardSound(e.kind, e.go);
            if (!e.go) setHazard({ key: Date.now(), text: HAZARD_TEXT[e.kind] });
          }
          if (ringing && e.k === "hit" && e.kind === "push") continue;
          if (e.k === "hit" && e.kind === "hit") sfx.impact(e.power, e.ko);
          else if (e.k === "hit" && e.kind === "shield") sfx.shieldHit(Math.min(1, e.dmg / 20));
          else if (e.k === "hit" && e.kind === "parry") sfx.parry();
          else if (e.k === "ko") sfx.koBlast();
          else if (e.k === "grab") sfx.grab();
          const s = soundOf(e, mySlot);
          if (s) play(s.name, { volume: s.volume ?? 0.8 });
          // Le téléphone vibre sous le doigt de celui qui joue, aux moments rares seulement : sa sortie, celle qu'il
          // provoque, un coup fort qu'il donne ou qu'il reçoit (jamais pour les coups des autres, ni pour un spectateur)
          if (mySlot >= 0) {
            if (e.k === "ko" && e.v === mySlot) buzz("echec");
            else if (e.k === "ko" && e.by === mySlot) buzz("fort");
            else if (e.k === "hit" && e.kind === "hit" && e.power > 0.6 && (e.a === mySlot || e.v === mySlot)) buzz("impact");
          }
          // Le coup qui fait sortir : un éclair blanc sur tout l'écran
          if (e.k === "hit" && e.ko) setFlash((n) => n + 1);
        }
      },
      onFrame: (frame) => foley.frame(frame),
    });
    rt.controls.setSettings(settingsRef.current);
    runtime.current = rt;
    listeners.current.onTick = (now, tick) => rt.onTick(now, tick);
    // L'arène se prépare derrière l'écran de chargement, une fois posée (deux images plus tard)
    let stopped = false;
    setPrep({ share: 0, done: false });
    void (async () => {
      await nextFrame();
      await nextFrame();
      if (stopped) return;
      await rt.prepare((share) => !stopped && setPrep({ share, done: false }));
      // En développement, un appareil lent pour voir les autres l'attendre (localStorage.cbSlowLoad = "8000", en ms)
      if (SLOW_LOAD > 0) await new Promise((r) => window.setTimeout(r, SLOW_LOAD));
    })()
      .catch((err: unknown) => console.error("Arène impossible à préparer", err))
      .then(() => !stopped && setPrep({ share: 1, done: true }));
    return () => {
      stopped = true;
      listeners.current.onTick = undefined;
      rt.dispose();
      runtime.current = null;
    };
    // La boucle ne se recrée que pour une autre arène ou d'autres combattants
  }, [fightKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runtime.current?.setView(view);
  }, [view]);

  // Une autre tenue, un autre nom : les combattants se redessinent (sans toucher au combat)
  useEffect(() => {
    runtime.current?.setLooks(looksRef.current);
  }, [looksKey]);

  useEffect(() => {
    runtime.current?.setPaused(menu || help || commands);
  }, [menu, help, commands]);

  useEffect(() => {
    runtime.current?.controls.setSettings(settings);
    music.current?.setEnabled(settings.music);
  }, [settings]);

  // La musique : du compte à rebours à la fin du combat (plus vite pour la dernière vie, plus bas à la fin)
  useEffect(() => {
    const m = new FightMusic();
    m.setEnabled(settingsRef.current.music);
    m.start();
    music.current = m;
    const prefs = usePrefs.subscribe(() => m.update());
    return () => {
      prefs();
      m.stop();
      music.current = null;
    };
  }, []);
  const lastStocks = hud ? hud.fighters.filter((f) => !f.out) : [];
  const decisive =
    room.status === "playing" && view.config.mode !== "temps" && lastStocks.length === 2 && lastStocks.every((f) => f.stocks <= 1);
  useEffect(() => music.current?.setFast(decisive), [decisive]);
  useEffect(() => music.current?.setQuiet(room.status === "finished"), [room.status]);

  // Au premier doigt posé, les commandes tactiles s'affichent
  useEffect(() => {
    const onTouch = (e: PointerEvent) => {
      if (e.pointerType === "touch") setTouch(true);
    };
    window.addEventListener("pointerdown", onTouch);
    return () => window.removeEventListener("pointerdown", onTouch);
  }, []);

  // Le compte à rebours, en sons
  useEffect(() => {
    const c = hud?.countdown ?? null;
    if (c !== null && c > 0 && c !== lastCount.current) play("brickCount", { volume: 0.6 });
    lastCount.current = c;
  }, [hud?.countdown]);

  const finished = room.status === "finished";
  const timed = view.config.mode === "temps";
  const seated = mySlot >= 0;

  return (
    <div className={`cb-fight ${touch && seated ? "is-touch" : ""}`}>
      <div ref={host} className="cb-stage" />
      {flash > 0 && <div className="cb-flash" key={flash} aria-hidden="true" />}
      {room.status === "playing" && loadingShown(prep.done, gateClock) && (
        <GameLoading
          title="Culbute"
          theme={LOADING_THEME}
          share={prep.share}
          done={prep.done}
          gate={room.gate}
          serverOffset={serverOffset}
          players={room.seats
            .filter((s) => s.kind === "human")
            .map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, userId: s.userId }))}
          me={room.you.seatId}
        />
      )}
      <FirstSecondsPanel />

      <header className="cb-top">
        <div className="cb-top-left">
          {room.series && !room.series.final && <SeriesBadge series={room.series} />}
          {timed && hud && (
            <span className="cb-clock num">
              {Math.floor(hud.time / 60)}:{String(hud.time % 60).padStart(2, "0")}
            </span>
          )}
        </div>
        <div className="cb-top-right">
          <button className="btn btn-sm btn-ghost cb-icon-btn" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" size={18} />
            {unread > 0 && <span className="cb-unread">{unread}</span>}
          </button>
          <button className="btn btn-sm btn-ghost cb-icon-btn" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>
            <Icon name="menu" size={18} />
          </button>
        </div>
      </header>

      {hud?.countdown !== null && hud?.countdown !== undefined && (
        <div className={`cb-countdown ${hud.countdown === 0 ? "is-go" : ""}`} key={hud.countdown} aria-live="polite">
          {hud.countdown === 0 ? "Culbute !" : hud.countdown}
        </div>
      )}
      {hazard && !finished && (
        <div className="cb-hazard" key={hazard.key} role="status" aria-live="polite">
          {hazard.text}
        </div>
      )}
      {hud?.phase === 2 && !finished && (
        <div className="cb-countdown is-end" aria-live="polite">
          Terminé !
        </div>
      )}

      {hud && (
        <footer className="cb-hud" aria-label="Les combattants">
          {hud.fighters.map((f) => {
            const look = looks[f.slot];
            if (!look) return null;
            return (
              <div
                key={f.slot}
                className={`cb-card-hud ${f.out ? "is-out" : ""} ${look.me ? "is-me" : ""}`}
                style={{ "--c": look.color } as CSSProperties}
              >
                <span className="cb-card-face">
                  <AvatarDrawing avatar={look.avatar} size={46} />
                </span>
                <div className="cb-card-text">
                  <span className="cb-card-name">{look.me ? "Toi" : look.name}</span>
                  {timed ? (
                    <span className="cb-card-sub num">{f.score > 0 ? `+${f.score}` : f.score} pts</span>
                  ) : (
                    <span className="cb-stocks" aria-label={`${f.stocks} vie${f.stocks > 1 ? "s" : ""}`}>
                      {f.stocks > 5 ? (
                        <span className="cb-card-sub num">× {f.stocks}</span>
                      ) : (
                        Array.from({ length: Math.max(0, f.stocks) }, (_, i) => <span key={i} className="cb-stock" />)
                      )}
                    </span>
                  )}
                </div>
                <span className="cb-dmg num" style={{ color: dmgColor(f.dmg) }} key={Math.floor(f.dmg)}>
                  {f.out ? (
                    "—"
                  ) : (
                    <>
                      {Math.floor(f.dmg)}
                      <small>%</small>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </footer>
      )}

      {seated && hud && hud.charge > 0 && (
        <div className="cb-charge" aria-hidden="true">
          <span style={{ width: `${Math.round(hud.charge * 100)}%` }} />
        </div>
      )}

      {seated && touch && rotateHint && !finished && (
        <button className="cb-rotate" onClick={closeRotateHint}>
          On voit mieux en largeur : tourne ton téléphone <span aria-hidden="true">×</span>
        </button>
      )}
      {seated && touch && !finished && (
        <div className="cb-touch">
          <Stick runtime={runtime} />
          <div className="cb-touch-buttons">
            <TouchButton runtime={runtime} which="atk" label="Frapper" className="is-atk" />
            <TouchButton runtime={runtime} which="spc" label="Spécial" className="is-spc" />
            {!settings.stickJump && <TouchButton runtime={runtime} which="jmp" label="Saut" className="is-jmp" />}
            <TouchButton runtime={runtime} which="grb" label="Saisir" className="is-grb" />
            <span className="cb-touch-tip">Frapper + Spécial : garde</span>
          </div>
        </div>
      )}

      {menu && (
        <div className="cb-menu panel" role="menu">
          {!bridge && room.status === "playing" && (
            <button className="menu-item" onClick={() => (onShowLobby(), setMenu(false))}>
              <Icon name="users" size={18} /> Voir le salon et les règles
            </button>
          )}
          <button className="menu-item" onClick={() => (setHelp(true), setMenu(false))}>
            <Icon name="info" size={18} /> Comment jouer
          </button>
          <button className="menu-item" onClick={() => (setCommands(true), setMenu(false))}>
            <Icon name="target" size={18} /> Commandes
          </button>
          {/* Le son commun à tous les jeux, et la musique propre au combat */}
          <MenuSound>
            <SoundToggle
              label="Musique du combat"
              checked={settings.music}
              onChange={(music) => {
                const next = { ...settings, music };
                saveSettings(next);
                setSettings(next);
              }}
            />
          </MenuSound>
          <ReportButton
            look="menu"
            game="culbute"
            variant={fightVariant(room.settings.culbute)}
            code={room.code}
            role={seated ? "player" : "watcher"}
            onOpen={() => setMenu(false)}
          />
          <span className="hint cb-menu-stats">{hud ? `${hud.fps} images/s · ${hud.ping} ms` : ""}</span>
          <button className="menu-item is-danger" onClick={onLeave}>
            <Icon name="door" size={18} /> {bridge ? "Quitter la tournée" : "Quitter la table"}
          </button>
        </div>
      )}

      {help && (
        <div className="cb-help-backdrop" onClick={() => setHelp(false)}>
          <div className="panel panel-pad cb-help" onClick={(e) => e.stopPropagation()}>
            <h2>Comment jouer</h2>
            <HowToPlay settings={settings} />
            <button className="btn btn-primary" onClick={() => setHelp(false)}>
              Compris
            </button>
          </div>
        </div>
      )}

      {commands && <CommandsPanel touch={touch} settings={settings} onChange={setSettings} onClose={() => setCommands(false)} />}

      {room.series?.nextAt && !finished && <SeriesBoard room={room} view={view} looks={looks} />}
      {finished && view.ranks && (
        <CulbuteGameOver room={room} view={view} looks={looks} send={send} onLeave={onLeave} onShowLobby={onShowLobby} />
      )}
    </div>
  );
}
