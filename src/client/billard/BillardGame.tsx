import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent } from "react";
import type { AvatarConfig } from "../../shared/avatar.ts";
import { VARIANT_NAMES, legalTargets, type ShotRecord } from "../../shared/games/billard/match.ts";
import type { BillardClientMessage, BillardRoomView } from "../../shared/games/billard/net.ts";
import { SALLES } from "../../shared/games/billard/salles.ts";
import { Icon } from "../components/Icon.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { MenuSound, SoundButton } from "../components/SoundSettings.tsx";
import { EmotePicker } from "../game/ChatPanel.tsx";
import { FirstSecondsPanel } from "../game/FirstSecondsPanel.tsx";
import { GameLoading, loadingShown, type LoadingTheme } from "../game/GameLoading.tsx";
import { watchFirstSeconds } from "../lib/firstSeconds.ts";
import { useGateClock, useLoadedSignal } from "../lib/loadGate.ts";
import { nextFrame } from "../lib/prepare.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { HowToPlay } from "./BillardHelp.tsx";
import { formatLabel } from "./BillardLobby.tsx";
import { BallDot } from "./LookPicker.tsx";
import { CUE_STYLES } from "./scene/textures.ts";
import { BillardRuntime, type HudState, type Moment } from "./runtime.ts";
import { Board, FinalSheet, sideName, type BoardPlayer } from "./Scoreboard.tsx";
import { shotBurst } from "./shotFx.ts";
import * as sfx from "./sfx.ts";
import type { BillardListeners } from "./useBillardRoom.ts";

interface Banner {
  key: number;
  text: string;
  sub?: string;
  tone: "great" | "good" | "info" | "bad";
}

/** L'écran de chargement aux couleurs du feutre */
const LOADING_THEME: LoadingTheme = { from: "#1f5a3c", to: "#0b1a12", accent: "#f2c75a" };

/** Le nom d'une poche, vue depuis la tête de la table (d'où l'on casse) */
export function pocketName(i: number): string {
  return (
    [
      "coin du fond, à gauche",
      "coin du fond, à droite",
      "coin de la tête, à droite",
      "coin de la tête, à gauche",
      "milieu, à gauche",
      "milieu, à droite",
    ][i] ?? ""
  );
}

export function BillardGame({
  room,
  send,
  serverNow,
  listeners,
  onLeave,
  onOpenChat,
  unread,
  onShowLobby,
}: {
  room: BillardRoomView;
  send: (msg: BillardClientMessage) => void;
  serverNow: () => number;
  listeners: MutableRefObject<BillardListeners>;
  onLeave: () => void;
  onOpenChat: () => void;
  unread: number;
  onShowLobby: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<BillardRuntime | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [slow, setSlow] = useState(false);
  const [, setClock] = useState(0);
  const bridge = useTourBridge();
  const v = room.billard!;
  const mySeat = room.you.seatId;
  const bannerKey = useRef(0);
  const shown = useRef(new Set<number>());
  const viewRef = useRef(v);
  viewRef.current = v;
  const [prep, setPrep] = useState({ share: 0, done: false });
  const serverOffset = serverNow() - Date.now();
  const gateClock = useGateClock(room.gate, serverOffset);
  const passedRef = useRef(gateClock.passed);
  passedRef.current = gateClock.passed;
  useLoadedSignal(room.gate, mySeat, prep.done, send);
  const live = prep.done && gateClock.passed && room.status === "playing";
  useEffect(() => {
    runtime.current?.holdIntro(!gateClock.passed);
  }, [gateClock.passed]);
  useEffect(() => {
    if (live) return watchFirstSeconds("Billard");
  }, [live]);

  const players: (BoardPlayer & { cue: string; fx: string; avatar?: AvatarConfig; accent?: string })[] = useMemo(
    () =>
      v.players.map((p) => {
        const seat = room.seats.find((s) => s.id === p.id);
        const cue = seat?.look.cue ?? "erable";
        return {
          id: p.id,
          name: seat?.name ?? "?",
          cue,
          fx: seat?.look.fx ?? "confettis",
          avatar: seat?.avatar,
          // Le nœud papillon, de la couleur de la poignée de sa queue
          accent: (CUE_STYLES[cue] ?? CUE_STYLES.erable!).wrap,
        };
      }),
    [v.players, room.seats],
  );
  const playersRef = useRef(players);
  playersRef.current = players;
  const playersKey = JSON.stringify(players);
  const nameOf = (id: string) => (id === mySeat ? "Toi" : (players.find((p) => p.id === id)?.name ?? "?"));
  const say = (b: Omit<Banner, "key">) => setBanner({ ...b, key: ++bannerKey.current });

  // Une boucle par écran de partie
  useEffect(() => {
    if (!host.current) return;
    const rt = new BillardRuntime(host.current, {
      me: mySeat,
      serverNow,
      onShot: (n, s, place, call) =>
        send({ t: "shot", n, dx: s.dx, dy: s.dy, p: s.p, a: s.a, b: s.b, ...(place ? { px: place.x, py: place.y } : {}), call }),
      onAim: (a) => send({ t: "aim", ...a }),
      onHud: setHud,
      onPhys: (e, vol) => sfx.phys(e, vol),
      onRoll: (sp) => sfx.roll(sp),
      onMoment: (m: Moment) => {
        if (m.k === "strike") sfx.strike(m.p, m.mine);
        else if (m.k === "slow") setSlow(m.on);
        else if (m.k === "result") onResult(m.rec);
      },
    });
    runtime.current = rt;
    listeners.current.onAim = (id, a) => rt.remoteAim(id, a);
    let stopped = false;
    rt.holdIntro(!passedRef.current);
    void (async () => {
      await nextFrame();
      await nextFrame();
      if (stopped) return;
      await rt.prepare((share) => !stopped && setPrep({ share, done: false }));
    })()
      .catch((err: unknown) => console.error("Salle impossible à préparer", err))
      .then(() => !stopped && setPrep({ share: 1, done: true }));
    return () => {
      stopped = true;
      listeners.current.onAim = undefined;
      rt.dispose();
      runtime.current = null;
      sfx.stopRoll();
    };
    // Une seule boucle pour toute la partie
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Le coup est joué : on l'annonce (une fois), avec son effet s'il est beau */
  function onResult(rec: ShotRecord) {
    if (shown.current.has(rec.n) || !rec.outcome.text) return;
    shown.current.add(rec.n);
    const o = rec.outcome;
    const mine = rec.id === mySeat;
    say({ text: o.text, sub: o.sub ?? (mine ? undefined : nameOf(rec.id)), tone: o.tone });
    if (o.tone === "great") {
      sfx.applause(o.rack === "won" ? 1 : 0.6, o.rack === "won" ? 2.4 : 1.6);
      shotBurst(playersRef.current.find((p) => p.id === rec.id)?.fx ?? "confettis", mine);
    } else if (o.tone === "bad" && (o.foul || o.rack === "lost")) sfx.groan();
  }

  useEffect(() => {
    runtime.current?.setPlayers(players);
  }, [playersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runtime.current?.setView(v);
  }, [v]);

  useEffect(() => {
    runtime.current?.setPaused(menu || help);
  }, [menu, help]);

  // L'ambiance de la salle
  const ambience = {
    club: "feu",
    bibliotheque: "horloge",
    bar: "pluie",
    loft: "ville",
    wagon: "train",
    sousmarin: "bulles",
    serre: "jardin",
    terrasse: "mer",
  }[v.salle];
  useEffect(() => {
    const amb = new sfx.Ambience(ambience);
    amb.start();
    const unsub = usePrefs.subscribe(() => amb.update());
    return () => {
      unsub();
      amb.stop();
    };
  }, [ambience]);

  // Le temps qui passe (le compte à rebours du tour)
  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Le tour qui change : à qui de jouer
  const turnKey = `${v.phase}:${v.shooter}:${v.rackNo}`;
  const lastTurn = useRef("");
  useEffect(() => {
    if (v.phase !== "aim" || lastTurn.current === turnKey) return;
    const prevShooter = lastTurn.current.split(":")[1];
    lastTurn.current = turnKey;
    if (v.shooter === mySeat && prevShooter !== mySeat) {
      sfx.yourTurn();
      say({ text: "À toi !", sub: v.inHand ? "Bille en main" : undefined, tone: "good" });
    }
  }, [turnKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // La manche gagnée
  const rackKey = v.phase === "rack" ? `rack:${v.rackNo}` : "";
  useEffect(() => {
    if (!rackKey || !v.rackWon) return;
    const winner = sideName(v, players, mySeat, v.rackWon.side);
    setTimeout(() => say({ text: `Manche pour ${winner}`, sub: v.sides.map((s) => s.racks).join(" à "), tone: "great" }), 600);
  }, [rackKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = serverNow();
  const myTurn = v.phase === "aim" && v.shooter === mySeat;
  const finished = room.status === "finished" || v.phase === "over";
  const left = Math.max(0, Math.ceil((v.deadline - now) / 1000));
  const lastTick = useRef(-1);
  useEffect(() => {
    if (myTurn && left <= 5 && left > 0 && left !== lastTick.current) {
      lastTick.current = left;
      sfx.tick();
    }
  });
  const shooterName = v.phase === "aim" || v.phase === "intro" ? nameOf(v.shooter) : null;
  const target = (() => {
    if (v.phase !== "aim") return null;
    const t = legalTargets({ ...v, rng: 0 });
    if (v.cfg.variant === "neuf" && t.length === 1) return `la ${t[0]}`;
    return null;
  })();

  return (
    <div className={`bl-game ${mySeat ? "" : "is-watching"}`}>
      <div ref={host} className="bl-stage" />
      {room.status === "playing" && loadingShown(prep.done, gateClock) && (
        <GameLoading
          title="Billard"
          theme={LOADING_THEME}
          share={prep.share}
          done={prep.done}
          gate={room.gate}
          serverOffset={serverOffset}
          players={room.seats
            .filter((s) => s.kind === "human")
            .map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, userId: s.userId }))}
          me={mySeat}
        />
      )}
      <FirstSecondsPanel />

      <header className="bl-top">
        <Board v={v} players={players} me={mySeat} />
        <div className="bl-top-right">
          <button
            className={`btn btn-sm btn-ghost bl-icon-btn ${hud?.mode === "dessus" ? "is-on" : ""}`}
            onClick={() => runtime.current?.toggleView()}
            title="Changer de vue"
          >
            <Icon name="eye" size={18} />
            <span className="bl-btn-label">{hud?.mode === "dessus" ? "Dessus" : "Queue"}</span>
          </button>
          <SoundButton className="btn btn-sm btn-ghost bl-icon-btn" />
          <button className="btn btn-sm btn-ghost bl-icon-btn" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" size={18} />
            {unread > 0 && <span className="bl-unread">{unread}</span>}
          </button>
          <button className="btn btn-sm btn-ghost bl-icon-btn" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>
            <Icon name="menu" size={18} />
          </button>
        </div>
      </header>

      {!finished && v.phase === "aim" && (
        <div className={`bl-turn ${myTurn ? "is-mine" : ""}`}>
          <span>{myTurn ? "À toi de jouer" : `${shooterName} joue`}</span>
          {target && (
            <small>
              <BallDot id={Number(target.slice(3))} set={v.dress.set} size={14} /> {target}
            </small>
          )}
          {v.cfg.variant === "carambole" && (
            <small>
              Reprise {Math.min(v.innings + 1, v.cfg.innings)} / {v.cfg.innings}
            </small>
          )}
          <span className={`bl-clock num ${left <= 8 ? "is-late" : ""}`} aria-label="Temps pour jouer">
            {left}
          </span>
        </div>
      )}

      {myTurn && hud?.canShoot && (
        <>
          <PowerBar pull={hud.pull} onPull={(k) => runtime.current?.setPull(k)} onRelease={() => runtime.current?.release()} />
          <TipPicker a={hud.tip.a} b={hud.tip.b} onChange={(a, b) => runtime.current?.setTip(a, b)} />
          <p className="bl-tip">
            {hud.inHand
              ? "Bille en main : fais glisser la blanche, puis vise"
              : hud.mustCall
                ? hud.call !== null
                  ? `Noire annoncée : ${pocketName(hud.call)} · touche une poche pour changer`
                  : "Annonce la poche de la noire : touche-la sur la table"
                : v.shots === 0 || v.breakShot
                  ? "Glisse pour viser, tire la queue vers toi à droite, lâche pour frapper"
                  : "Glisse pour viser · tire la queue à droite, lâche pour frapper"}
          </p>
        </>
      )}

      {slow && <div className="bl-slow">Ralenti</div>}

      <div className="bl-react">
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

      {banner && (
        <div key={banner.key} className={`bl-banner is-${banner.tone}`} onAnimationEnd={() => setBanner(null)}>
          <strong>{banner.text}</strong>
          {banner.sub && <small>{banner.sub}</small>}
        </div>
      )}

      {v.phase === "intro" && (
        <div className="bl-intro">
          <strong>{SALLES[v.salle].name}</strong>
          <small>
            {VARIANT_NAMES[v.cfg.variant]} · {formatLabel(v.cfg)}
            {v.rackNo > 0 ? ` · manche ${v.rackNo + 1}` : ""}
          </small>
          {v.shooter && <small>{v.shooter === mySeat ? "Tu casses" : `${nameOf(v.shooter)} casse`}</small>}
        </div>
      )}

      {finished && <FinalSheet room={room} players={players} send={send} onLeave={onLeave} onShowLobby={onShowLobby} />}

      {menu && (
        <div className="bl-menu panel" role="menu">
          {!bridge && room.status === "playing" && (
            <button className="menu-item" onClick={() => (onShowLobby(), setMenu(false))}>
              <Icon name="users" size={18} /> Voir le salon et les règles
            </button>
          )}
          <button className="menu-item" onClick={() => (setHelp(true), setMenu(false))}>
            <Icon name="info" size={18} /> Comment jouer
          </button>
          <MenuSound />
          <ReportButton
            look="menu"
            game="billard"
            variant={`Billard, ${SALLES[v.salle].name}, ${VARIANT_NAMES[v.cfg.variant]}`}
            code={room.code}
            role={mySeat ? "player" : "watcher"}
            onOpen={() => setMenu(false)}
          />
          <span className="hint bl-menu-stats">{hud ? `${hud.fps} images/s` : ""}</span>
          <button className="menu-item is-danger" onClick={onLeave}>
            <Icon name="door" size={18} /> {bridge ? "Quitter la tournée" : "Quitter la table"}
          </button>
        </div>
      )}

      {help && (
        <div className="bl-help-backdrop" onClick={() => setHelp(false)}>
          <div className="panel panel-pad bl-help" onClick={(e) => e.stopPropagation()}>
            <h2>Comment jouer</h2>
            <HowToPlay variant={v.cfg.variant} />
            <button className="btn btn-primary" onClick={() => setHelp(false)}>
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** La réglette de force : on tire la poignée vers le bas (la queue recule), on lâche pour frapper */
export function PowerBar({ pull, onPull, onRelease }: { pull: number; onPull: (k: number) => void; onRelease: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y0: number } | null>(null);
  const [k, setK] = useState(0);
  const value = drag.current ? k : pull;
  const at = (clientY: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientY - drag.current!.y0) / (r.height * 0.92)));
  };
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, y0: e.clientY };
    setK(0);
    onPull(0);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const kk = at(e.clientY);
    setK(kk);
    onPull(kk);
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    onRelease();
    setK(0);
  };
  return (
    <div
      className="bl-power"
      ref={track}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      aria-label="Force du coup"
    >
      <div className="bl-power-fill" style={{ height: `${Math.round(value * 100)}%` }} />
      {[0.25, 0.5, 0.75].map((q) => (
        <span key={q} className="bl-power-mark" style={{ top: `${q * 100}%` }} />
      ))}
      <div className="bl-power-grip" style={{ top: `${value * 92}%` }}>
        <span />
      </div>
      <span className="bl-power-label num">{value > 0.01 ? `${Math.round(value * 100)}` : "Force"}</span>
    </div>
  );
}

/** Le point de frappe : on touche la petite bille là où la queue doit la frapper */
export function TipPicker({ a, b, onChange }: { a: number; b: number; onChange: (a: number, b: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    let x = ((clientX - r.left) / r.width) * 2 - 1,
      y = -(((clientY - r.top) / r.height) * 2 - 1);
    const l = Math.hypot(x, y);
    if (l > 0.82) {
      x *= 0.82 / l;
      y *= 0.82 / l;
    }
    // Près du centre, on revient pile au centre
    if (Math.hypot(x, y) < 0.08) x = y = 0;
    onChange(x / 0.82, y / 0.82);
  };
  const dragging = useRef(false);
  return (
    <div
      className="bl-tip-picker"
      ref={ref}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        dragging.current = true;
        set(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => dragging.current && set(e.clientX, e.clientY)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onDoubleClick={() => onChange(0, 0)}
      aria-label="Point de frappe"
    >
      <span className="bl-tip-cross" />
      <span className="bl-tip-dot" style={{ left: `${50 + a * 41}%`, top: `${50 - b * 41}%` }} />
      <small>{b < -0.25 ? "rétro" : b > 0.25 ? "coulé" : Math.abs(a) > 0.25 ? "effet" : "centre"}</small>
    </div>
  );
}
