import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { RECIPES } from "../../shared/games/toque/food.ts";
import { CART_WARN, GUST_WARN, cart, gust, tangage } from "../../shared/games/toque/hazards.ts";
import { buildKitchen, Cell, KITCHENS, type KitchenId } from "../../shared/games/toque/kitchens.ts";
import { MODE_NAMES, type ToqueClientMessage, type ToqueRoomView } from "../../shared/games/toque/net.ts";
import { FPS, serviceTime, type ToqueEvent, type World } from "../../shared/games/toque/sim.ts";
import { TOUR_TEAM_COLORS } from "../../shared/tour.ts";
import type { StarAwardResult } from "../../shared/stars.ts";
import { Icon } from "../components/Icon.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { MenuSound } from "../components/SoundSettings.tsx";
import { FirstSecondsPanel } from "../game/FirstSecondsPanel.tsx";
import { GameLoading, loadingShown } from "../game/GameLoading.tsx";
import { buzz } from "../lib/feel.ts";
import { watchFirstSeconds } from "../lib/firstSeconds.ts";
import { useGateClock, useLoadedSignal } from "../lib/loadGate.ts";
import { nextFrame } from "../lib/prepare.ts";
import { unlockAudio } from "../lib/sound.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { Cinematic, arrivalSeen, markArrivalSeen } from "./Cinematic.tsx";
import { DishIcon } from "./FoodIcon.tsx";
import { ToqueMusic } from "./music.ts";
import { ToqueRuntime, type HudState } from "./runtime.ts";
import type { ChefDress } from "./scene/KitchenScene.ts";
import { KitchenSound } from "./sfx.ts";
import { ToqueGameOver } from "./ToqueGameOver.tsx";
import { HowToPlay } from "./ToqueHelp.tsx";
import type { ToqueListeners } from "./useToqueRoom.ts";

/** La couleur de chaque place (en duel : celle de son équipe) */
export const PLAYER_COLORS = ["#e2483d", "#3f7fd8", "#f2c94c", "#2f9e6a"];

/** Le dessin de chaque chef, d'après les places de la table (un joueur seul à deux chefs : deux fois lui) */
export function dressesFor(room: ToqueRoomView): ChefDress[] {
  const view = room.toque!;
  const out: ChefDress[] = [];
  view.owners.forEach((o, i) => {
    const seat = room.seats.find((s) => s.id === o.seat);
    const color = view.duel ? (TOUR_TEAM_COLORS[o.team as 0 | 1] ?? PLAYER_COLORS[i]!) : PLAYER_COLORS[i % PLAYER_COLORS.length]!;
    for (let j = 0; j < o.chefs; j++) {
      out.push({
        avatar: seat?.avatar ?? { bg: 0, skin: 0, hair: 1, hairColor: 0, eyes: 0, mouth: 0, hat: 0, extra: 0 },
        look: seat?.look ?? { apron: "blanc", toque: "classique", knife: "office" },
        color: j === 0 ? color : "#b88adf",
        name: seat ? (seat.kind === "bot" ? `${seat.name} (commis)` : seat.name) : "?",
        me: Boolean(seat && seat.id === room.you.seatId),
      });
    }
  });
  return out;
}

/** Le stick du pouce gauche : il se pose là où le pouce touche */
function Stick({ runtime }: { runtime: MutableRefObject<ToqueRuntime | null> }) {
  const zone = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const R = 52;
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
        // Une petite zone morte, puis tout de suite la pleine vitesse (on court dans une cuisine)
        const m = Math.min(1, l / R);
        const g = m < 0.12 ? 0 : Math.min(1, (m - 0.12) / 0.55);
        t.sx = l > 0 ? (dx / l) * g : 0;
        t.sy = l > 0 ? -(dy / l) * g : 0;
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
      unlockAudio();
      finger = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // le doigt est suivi de toute façon
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
    <div ref={zone} className="tq-stick-zone" aria-hidden="true">
      {live ? (
        <>
          <span className="tq-stick-base" style={{ left: live.ox, top: live.oy }} />
          <span className="tq-stick-knob" style={{ left: live.ox + live.kx, top: live.oy + live.ky }} />
        </>
      ) : (
        <span className="tq-stick-hint">Pose ton pouce ici pour courir</span>
      )}
    </div>
  );
}

function TouchButton({
  runtime,
  which,
  label,
  className,
}: {
  runtime: MutableRefObject<ToqueRuntime | null>;
  which: "grab" | "use" | "dash" | "swap";
  label: string;
  className: string;
}) {
  const set = (down: boolean) => runtime.current?.controls.touchButton(which, down);
  return (
    <button
      type="button"
      className={`tq-touch-btn ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        unlockAudio();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        set(true);
        buzz("tic");
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/** Un bon de commande : le plat, son nom, et le temps qui file (vert, puis jaune, puis rouge qui clignote) */
function Ticket({ recipe, left, oldest }: { recipe: keyof typeof RECIPES; left: number; oldest: boolean }) {
  const r = RECIPES[recipe];
  const k = Math.max(0, Math.min(1, left));
  const color = k > 0.5 ? "#5ac85a" : k > 0.25 ? "#f2c24a" : "#e0412f";
  return (
    <li className={`tq-ticket ${k <= 0.25 ? "is-late" : ""} ${oldest ? "is-oldest" : ""}`}>
      <DishIcon recipe={recipe} size={46} />
      <span className="tq-ticket-name">{r.name}</span>
      <span className="tq-ticket-time">
        <span style={{ width: `${k * 100}%`, background: color }} />
      </span>
    </li>
  );
}

/** Les points d'un plat servi qui montent au-dessus du passe */
interface Floating {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: "gain" | "loss";
}

const HAZARD_TEXT = {
  tangage: "Vague !",
  vent: "Rafale !",
  charrettes: "Gare à la charrette !",
  wagons: "Le train siffle : les wagons se séparent !",
  radeau: "",
  tables: "Les tables glissent !",
  verglas: "",
  banquet: "Les tables glissent !",
} as const;

/** Une annonce de ce qui arrive (la vague, la rafale, la charrette, le sifflet), juste avant que ça arrive */
function hazardAnnounce(w: World): string | null {
  const k = buildKitchen(w.kitchen, w.duel);
  const t = serviceTime(w);
  if (w.phase !== 1) return null;
  switch (k.def.hazard) {
    case "tangage": {
      const now = tangage(t).wave;
      const soon = tangage(t + 1.2).wave;
      return soon > now ? HAZARD_TEXT.tangage : null;
    }
    case "vent": {
      const g = gust(t);
      if (!g.warn) return null;
      const arrow = g.dy > 0 ? "↓" : g.dy < 0 ? "↑" : g.dx > 0 ? "→" : "←";
      return `${HAZARD_TEXT.vent} ${arrow}`;
    }
    case "charrettes":
      return cart(t, k.duel ? (k.W - 1) / 2 : k.W).warn ? HAZARD_TEXT.charrettes : null;
    case "wagons":
    case "tables":
    case "banquet": {
      for (let s = 1; s < k.moving.length; s++) {
        const m = k.motions[s];
        if (!m) continue;
        const u = t % m.period;
        if (m.moves.some((mv) => u > mv.at - 2 && u < mv.at)) return HAZARD_TEXT[k.def.hazard];
      }
      return null;
    }
    default:
      return null;
  }
  void CART_WARN;
  void GUST_WARN;
}

export function ToqueGame({
  room,
  send,
  listeners,
  onLeave,
  onOpenChat,
  unread,
  onShowLobby,
  serverOffset,
  stars,
}: {
  room: ToqueRoomView;
  send: (msg: ToqueClientMessage) => void;
  listeners: MutableRefObject<ToqueListeners>;
  onLeave: () => void;
  onOpenChat: () => void;
  unread: number;
  onShowLobby: () => void;
  serverOffset: number;
  stars: StarAwardResult | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<ToqueRuntime | null>(null);
  const sound = useRef<KitchenSound | null>(null);
  const music = useRef<ToqueMusic | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [floats, setFloats] = useState<Floating[]>([]);
  const [touch, setTouch] = useState(() => window.matchMedia?.("(pointer: coarse)").matches ?? false);
  const bridge = useTourBridge();
  const view = room.toque!;
  const kitchen = view.kitchen as KitchenId;
  const def = KITCHENS[kitchen];
  const myOwner = room.you.seatId ? view.owners.findIndex((o) => o.seat === room.you.seatId) : -1;
  const seated = myOwner >= 0;
  const twoChefs = seated && view.owners[myOwner]!.chefs === 2;
  const dresses = useMemo(() => dressesFor(room), [room]);
  const dressKey = JSON.stringify(dresses);
  const dressRef = useRef(dresses);
  dressRef.current = dresses;
  const matchKey = `${view.seed}:${view.kitchen}:${view.duel}`;
  // Le chargement (voir shared/loadGate.ts), et la cinématique d'arrivée dans une nouvelle cuisine (la première fois)
  const [prep, setPrep] = useState({ share: 0, done: false });
  const campaign = view.config.mode === "service" && !room.tour;
  // (seulement pour ceux qui cuisinent : un spectateur arrive directement sur le service)
  const [story, setStory] = useState(() => campaign && seated && !arrivalSeen(kitchen));
  const gateClock = useGateClock(room.gate, serverOffset);
  useLoadedSignal(room.gate, room.you.seatId, prep.done && !story, send);
  const live = prep.done && gateClock.passed && room.status === "playing";
  useEffect(() => {
    if (live) return watchFirstSeconds("Toque !");
  }, [live]);

  // Une boucle de service par écran : elle survit aux mises à jour du salon, et repart à la revanche
  useEffect(() => {
    if (!host.current) return;
    const snd = new KitchenSound();
    snd.start();
    sound.current = snd;
    let nextFloat = 1;
    const rt = new ToqueRuntime(host.current, view, {
      mySeat: room.you.seatId,
      dresses: dressRef.current,
      send,
      onHud: (h) => {
        setHud(h);
        snd.update(h.world, h.me);
      },
      onEvents: (events, w, mine) => {
        const k = buildKitchen(w.kitchen, w.duel);
        for (const e of events) {
          snd.event(e, w, mine);
          onEffect(e, w, mine);
        }
        function onEffect(e: ToqueEvent, w2: World, me: number) {
          const sc = rt.scene;
          if (e.k === "serve") {
            const team = e.team;
            const pass = k.cells.findIndex((c, i) => c === Cell.Pass && k.team[i] === team);
            const px = (pass % k.W) + 0.5;
            const py = Math.floor(pass / k.W) + 0.5;
            sc.effect("serve", px, py);
            const at = sc.project(px, py, 1.2);
            if (at) {
              const id = nextFloat++;
              const mine = me >= 0 && w2.chefs[me]?.team === team;
              if (mine || !view.duel) {
                setFloats((f) => [...f, { id, x: at.x, y: at.y, text: `+${e.points}${e.mult > 1 ? ` ×${e.mult}` : ""}`, tone: "gain" }]);
                window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1600);
              }
            }
            if (e.c === me) buzz("reussite");
          } else if (e.k === "fail") {
            buzz("echec");
          } else if (e.k === "splash") sc.effect("splash", e.x, e.y);
          else if (e.k === "hit" || e.k === "bump") {
            const c = w2.chefs[e.c];
            if (c) sc.effect("dust", c.x, c.y);
            if (e.c === me) {
              sc.bump(0.6);
              buzz("fort");
            }
          } else if (e.k === "fire") sc.bump(0.35);
          else if ((e.k === "take" || e.k === "put") && e.c === me) buzz("impact");
        }
      },
    });
    runtime.current = rt;
    listeners.current.onTick = (now, tick) => rt.onTick(now, tick);
    let stopped = false;
    setPrep({ share: 0, done: false });
    void (async () => {
      await nextFrame();
      await nextFrame();
      if (stopped) return;
      await rt.prepare((share) => !stopped && setPrep({ share, done: false }));
    })()
      .catch((err: unknown) => console.error("Cuisine impossible à préparer", err))
      .then(() => !stopped && setPrep({ share: 1, done: true }));
    return () => {
      stopped = true;
      listeners.current.onTick = undefined;
      rt.dispose();
      snd.stop();
      runtime.current = null;
      sound.current = null;
    };
    // La boucle ne se recrée que pour une autre cuisine ou un autre service
  }, [matchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runtime.current?.setView(view);
  }, [view]);

  useEffect(() => {
    runtime.current?.setDresses(dressRef.current);
  }, [dressKey]);

  useEffect(() => {
    runtime.current?.setPaused(menu || help || story);
  }, [menu, help, story]);

  // La musique de la cuisine, du départ à la fin du service
  useEffect(() => {
    const m = new ToqueMusic(kitchen);
    m.start();
    music.current = m;
    return () => {
      m.stop();
      music.current = null;
    };
  }, [kitchen]);
  useEffect(() => music.current?.setQuiet(room.status === "finished"), [room.status]);

  // Au premier doigt posé, les commandes tactiles s'affichent
  useEffect(() => {
    const onTouch = (e: PointerEvent) => {
      if (e.pointerType === "touch") setTouch(true);
    };
    window.addEventListener("pointerdown", onTouch);
    return () => window.removeEventListener("pointerdown", onTouch);
  }, []);

  const w = hud?.world ?? null;
  const team = seated ? view.owners[myOwner]!.team : 0;
  const t = w?.teams[team] ?? null;
  const other = view.duel && w ? w.teams[1 - team] : null;
  const timeLeft = w ? Math.max(0, Math.ceil((w.end - Math.max(w.frame, w.service)) / FPS)) : def.duration;
  const intro = w ? w.phase === 0 : true;
  const introLeft = w ? (w.service - w.frame) / FPS : 4;
  const finished = room.status === "finished";
  const announce = w ? hazardAnnounce(w) : null;
  const goals = view.goals[team] ?? [0, 0, 0];
  const starsNow = t ? (t.score >= goals[2] ? 3 : t.score >= goals[1] ? 2 : t.score >= goals[0] ? 1 : 0) : 0;
  const mult = t ? Math.max(1, Math.min(4, t.streak)) : 1;
  const oldest = t && t.orders.length > 0 ? Math.min(...t.orders.map((o) => o.at)) : -1;
  const theme = def.theme;

  return (
    <div className={`tq-game ${touch && seated ? "is-touch" : ""}`} style={{ "--tq-accent": theme.accent } as CSSProperties}>
      <div ref={host} className="tq-stage" onPointerDown={() => unlockAudio()} />
      {room.status === "playing" && (loadingShown(prep.done, gateClock) || story) && (
        <GameLoading
          title="Toque !"
          theme={theme}
          share={prep.share}
          done={prep.done && !story}
          gate={room.gate}
          serverOffset={serverOffset}
          players={room.seats
            .filter((s) => s.kind === "human")
            .map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, userId: s.userId }))}
          me={room.you.seatId}
        >
          <p className="tq-loading-kitchen">
            <strong>{def.name}</strong>
            <span>{def.place}</span>
          </p>
        </GameLoading>
      )}
      {story && room.status === "playing" && (
        <Cinematic
          kind="arrival"
          kitchen={kitchen}
          onDone={() => {
            markArrivalSeen(kitchen);
            setStory(false);
          }}
        />
      )}
      <FirstSecondsPanel />

      <header className="tq-top">
        <ol className="tq-orders" aria-label="Les commandes">
          {t?.orders.map((o) => (
            <Ticket
              key={o.id}
              recipe={o.r}
              left={(o.until - (w?.frame ?? 0)) / Math.max(1, o.until - o.at)}
              oldest={o.at === oldest && t.orders.length > 1}
            />
          ))}
        </ol>
        <div className="tq-top-right">
          <div className="tq-clock num" aria-label="Temps restant">
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
          </div>
          <div className="tq-score">
            <span className="tq-coin" aria-hidden="true" />
            <strong className="num">{t?.score ?? 0}</strong>
            {mult > 1 && <span className="tq-mult">×{mult}</span>}
            {other && <span className="tq-versus num">contre {other.score}</span>}
          </div>
          {!view.duel && (
            <div className="tq-goal" aria-label={`${starsNow} étoile${starsNow > 1 ? "s" : ""} pour l'instant`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < starsNow ? "is-on" : ""}>
                  ★
                </span>
              ))}
              <small className="num">{starsNow < 3 ? `${goals[Math.min(2, starsNow) as 0 | 1 | 2]}` : "Bravo !"}</small>
            </div>
          )}
          <div className="tq-buttons">
            <button className="btn btn-sm btn-ghost tq-icon-btn" onClick={onOpenChat} aria-label="Discussion">
              <Icon name="chat" size={18} />
              {unread > 0 && <span className="tq-unread">{unread}</span>}
            </button>
            <button className="btn btn-sm btn-ghost tq-icon-btn" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>
              <Icon name="menu" size={18} />
            </button>
          </div>
        </div>
      </header>

      {live && intro && introLeft > 0 && (
        <div className="tq-banner is-intro" key={Math.ceil(introLeft)} aria-live="polite">
          {introLeft > 2.2 ? def.name : introLeft > 0.9 ? "Prêts ?" : "En cuisine !"}
        </div>
      )}
      {w?.phase === 2 && !finished && (
        <div className="tq-banner is-end" aria-live="polite">
          C'est l'heure !
        </div>
      )}
      {announce && !finished && (
        <div className="tq-hazard" role="status" aria-live="polite">
          {announce}
        </div>
      )}
      {floats.map((f) => (
        <span key={f.id} className={`tq-float is-${f.tone}`} style={{ left: f.x, top: f.y }}>
          {f.text}
        </span>
      ))}

      {seated && touch && !finished && (
        <div className="tq-touch">
          <Stick runtime={runtime} />
          <div className="tq-touch-buttons">
            <TouchButton runtime={runtime} which="grab" label="Prendre / poser" className="is-grab" />
            <TouchButton runtime={runtime} which="use" label="Utiliser" className="is-use" />
            <TouchButton runtime={runtime} which="dash" label="Élan" className="is-dash" />
            {twoChefs && <TouchButton runtime={runtime} which="swap" label="Changer" className="is-swap" />}
          </div>
        </div>
      )}

      {menu && (
        <div className="tq-menu panel" role="menu">
          {!bridge && room.status === "playing" && (
            <button className="menu-item" onClick={() => (onShowLobby(), setMenu(false))}>
              <Icon name="users" size={18} /> Voir le salon
            </button>
          )}
          <button className="menu-item" onClick={() => (setHelp(true), setMenu(false))}>
            <Icon name="info" size={18} /> Comment jouer
          </button>
          <MenuSound />
          <ReportButton
            look="menu"
            game="toque"
            variant={`Toque !, ${def.name}, ${MODE_NAMES[view.config.mode].toLowerCase()}`}
            code={room.code}
            role={seated ? "player" : "watcher"}
            onOpen={() => setMenu(false)}
          />
          <span className="hint tq-menu-stats">{hud ? `${hud.fps} images/s · ${hud.ping} ms` : ""}</span>
          <button className="menu-item is-danger" onClick={onLeave}>
            <Icon name="door" size={18} /> {bridge ? "Quitter la tournée" : "Quitter la cuisine"}
          </button>
        </div>
      )}

      {help && (
        <div className="tq-help-backdrop" onClick={() => setHelp(false)}>
          <div className="panel panel-pad tq-help" onClick={(e) => e.stopPropagation()}>
            <h2>Comment jouer</h2>
            <HowToPlay kitchen={kitchen} twoChefs={twoChefs} />
            <button className="btn btn-primary" onClick={() => setHelp(false)}>
              Compris
            </button>
          </div>
        </div>
      )}

      {finished && view.result && <ToqueGameOver room={room} send={send} onLeave={onLeave} onShowLobby={onShowLobby} stars={stars} />}
    </div>
  );
}
