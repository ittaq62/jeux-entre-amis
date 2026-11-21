import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { strokeLimit } from "../../shared/games/minigolf/course.ts";
import { COURSES, holeDef } from "../../shared/games/minigolf/courses.ts";
import { colorOf, DEFAULT_LOOK } from "../../shared/games/minigolf/looks.ts";
import { SCORES_MS } from "../../shared/games/minigolf/match.ts";
import type { MinigolfClientMessage, MinigolfRoomView } from "../../shared/games/minigolf/net.ts";
import { Icon } from "../components/Icon.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { MenuSound, SoundButton } from "../components/SoundSettings.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { HowToPlay } from "./MinigolfHelp.tsx";
import { GolfRuntime, type HudState, type RuntimeEvent } from "./runtime.ts";
import { Scorecard, scoreName } from "./Scorecard.tsx";
import * as sfx from "./sfx.ts";
import type { GolfListeners } from "./useMinigolfRoom.ts";

/** Le bruit d'un choc, d'après ce qui a été touché */
function knockKind(kind: string, look?: string): string {
  if (kind === "bumper") return "bumper";
  if (look === "buis" || look === "haie") return "hedge";
  if (look === "grille" || look === "metal" || look === "fer") return "metal";
  if (look === "pierre" || look === "porte" || look === "statue" || kind === "cliff") return "stone";
  return "wood";
}

interface Banner {
  key: number;
  text: string;
  sub?: string;
  tone: "good" | "bad" | "info" | "great";
}

export function MinigolfGame({
  room,
  send,
  serverNow,
  listeners,
  onLeave,
  onOpenChat,
  unread,
  onShowLobby,
}: {
  room: MinigolfRoomView;
  send: (msg: MinigolfClientMessage) => void;
  serverNow: () => number;
  listeners: MutableRefObject<GolfListeners>;
  onLeave: () => void;
  onOpenChat: () => void;
  unread: number;
  onShowLobby: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<GolfRuntime | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [overview, setOverview] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [, setClock] = useState(0);
  const bridge = useTourBridge();
  const v = room.minigolf!;
  const mySeat = room.you.seatId;
  const me = v.players.find((p) => p.id === mySeat) ?? null;
  const ref = v.holes[v.hole]!;
  const def = holeDef(ref);
  const bannerKey = useRef(0);
  const shown = useRef(new Set<string>());

  const players = useMemo(
    () =>
      v.players.map((p) => {
        const seat = room.seats.find((s) => s.id === p.id);
        return { id: p.id, name: seat?.name ?? "?", look: seat?.look ?? DEFAULT_LOOK };
      }),
    [v.players, room.seats],
  );
  const playersKey = JSON.stringify(players.map((p) => [p.id, p.name, p.look]));

  const say = (text: string, tone: Banner["tone"], sub?: string) => setBanner({ key: ++bannerKey.current, text, sub, tone });

  // Une boucle par écran de partie
  useEffect(() => {
    if (!host.current) return;
    const rt = new GolfRuntime(host.current, {
      me: mySeat,
      serverNow,
      onShoot: (h, a, p, at) => send({ t: "shot", h, a, p, at }),
      onAim: (a, p) => send({ t: "aim", a, p }),
      onHud: setHud,
      onShot: (_id, mine, power) => sfx.putt(power, mine ? 1 : 0.35),
      onEvent: (e: RuntimeEvent) => {
        const vol = e.mine ? 1 : Math.max(0.15, 0.6 - e.dist * 0.04);
        const ev = e.e;
        switch (ev.k) {
          case "wall":
            sfx.knock(knockKind(ev.kind, ev.look), ev.v, vol);
            break;
          case "land":
            sfx.land(ev.mat, ev.v, vol);
            break;
          case "cup":
            sfx.cupDrop(vol);
            break;
          case "lip":
            sfx.lip(vol);
            break;
          case "lost":
            if (ev.why === "out") sfx.outOfBounds(vol);
            else sfx.splash(vol, ev.why === "lava");
            if (e.mine)
              say(
                ev.why === "out" ? "Hors limites !" : ev.why === "lava" ? "Dans la lave !" : "Dans l'eau !",
                "bad",
                "+1 coup, retour au départ du coup",
              );
            break;
          case "pad":
            sfx.boing(vol);
            break;
          case "portal":
            sfx.warp(vol);
            break;
          case "rail":
            if (!ev.out) sfx.tube(vol);
            break;
          case "item":
            sfx.sparkle(vol);
            break;
        }
      },
    });
    runtime.current = rt;
    listeners.current.onAim = () => {};
    return () => {
      listeners.current.onAim = undefined;
      rt.dispose();
      runtime.current = null;
    };
    // Une seule boucle pour toute la partie
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runtime.current?.setPlayers(players);
  }, [playersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runtime.current?.setView(v);
  }, [v]);

  useEffect(() => {
    runtime.current?.setPaused(menu || help);
  }, [menu, help]);

  // L'ambiance du parcours
  useEffect(() => {
    const amb = new sfx.Ambience(ref.c === "jardin" ? "jardin" : ref.c);
    amb.start();
    const unsub = usePrefs.subscribe(() => amb.update());
    return () => {
      unsub();
      amb.stop();
    };
  }, [ref.c]);

  // Le chrono à l'écran
  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Ce qui arrive à sa balle : dans le trou (et en combien), plus de coups
  useEffect(() => {
    if (!me) return;
    const key = `${v.hole}:${me.done}:${me.scores[v.hole]}`;
    if (!me.done || shown.current.has(key)) return;
    const wait = Math.max(0, ((me.doneAt - nowTickOf()) * 1000) / 240);
    const t = setTimeout(() => {
      shown.current.add(key);
      const s = me.scores[v.hole] ?? 0;
      if (me.shot?.out === "in") {
        const { text, tone } = scoreName(s, def.par);
        say(text, tone, s === 1 ? undefined : `${s} coups`);
        if (s === 1) sfx.applause(0.9);
      } else say("Trou terminé", "info", `${s} coups`);
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.hole, me?.done, me?.scores[v.hole]]);

  // Le trou qui commence
  useEffect(() => {
    if (v.phase === "intro") say(`Trou ${v.hole + 1}`, "info", `${def.name} · par ${def.par}`);
  }, [v.hole, v.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowTickOf = () => ((serverNow() - v.holeStart) * 240) / 1000;
  const now = serverNow();
  const left = Math.max(0, Math.ceil((v.deadline - now) / 1000));
  const seated = me !== null;
  const finished = room.status === "finished" || v.phase === "over";
  const limit = strokeLimit(def.par);

  return (
    <div className={`mg-game ${seated ? "" : "is-watching"}`}>
      <div ref={host} className="mg-stage" />

      <header className="mg-top">
        <div className="mg-hole-card">
          <span className="mg-hole-num num">{v.hole + 1}</span>
          <span className="mg-hole-text">
            <strong>{def.name}</strong>
            <small>
              Par {def.par} · {COURSES[ref.c].name}
              {ref.m ? " · à l'envers" : ""}
            </small>
          </span>
        </div>
        {v.phase === "play" && (
          <div className={`mg-clock num ${v.hurry ? "is-hurry" : ""} ${left <= 10 ? "is-late" : ""}`} aria-label="Temps restant">
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </div>
        )}
        <div className="mg-top-right">
          <button
            className={`btn btn-sm btn-ghost mg-icon-btn ${overview ? "is-on" : ""}`}
            onClick={() => (runtime.current?.toggleOverview(), setOverview((o) => !o))}
            title="Vue du trou (V)"
          >
            <Icon name="eye" size={18} />
            <span className="mg-btn-label">Vue du trou</span>
          </button>
          <SoundButton className="btn btn-sm btn-ghost mg-icon-btn" />
          <button className="btn btn-sm btn-ghost mg-icon-btn" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" size={18} />
            {unread > 0 && <span className="mg-unread">{unread}</span>}
          </button>
          <button className="btn btn-sm btn-ghost mg-icon-btn" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>
            <Icon name="menu" size={18} />
          </button>
        </div>
      </header>

      <aside className="mg-players" aria-label="Les joueurs">
        {v.players.map((p) => {
          const info = players.find((x) => x.id === p.id);
          const color = colorOf(info?.look.color ?? "blanche").hex;
          const tot = p.scores.reduce<number>((s, x, i) => s + (i < v.hole && x !== null ? x : 0), 0);
          return (
            <div
              key={p.id}
              className={`mg-player ${p.id === mySeat ? "is-me" : ""} ${p.done ? "is-done" : ""}`}
              style={{ "--c": color } as CSSProperties}
            >
              <span className="mg-dot" />
              <span className="mg-player-name">{p.id === mySeat ? "Toi" : info?.name}</span>
              <span className="mg-player-cur num">{p.done ? "✓" : p.cur}</span>
              <span className="mg-player-tot num">{tot}</span>
            </div>
          );
        })}
      </aside>

      {me && v.phase === "play" && !me.done && (
        <div className="mg-strokes" aria-live="polite">
          <span className="num">{me.cur}</span>
          <small>
            coup{me.cur > 1 ? "s" : ""} sur {limit}
          </small>
        </div>
      )}

      {hud?.power !== null && hud?.power !== undefined && (
        <div className="mg-power" aria-hidden="true">
          <span style={{ width: `${Math.round(hud.power * 100)}%` }} />
        </div>
      )}

      {seated && hud?.canShoot && hud.power === null && v.phase === "play" && me && me.cur === 0 && (
        <p className="mg-tip">Glisse en arrière pour viser, lâche pour frapper</p>
      )}

      {banner && (
        <div key={banner.key} className={`mg-banner is-${banner.tone}`} onAnimationEnd={() => setBanner(null)}>
          <strong>{banner.text}</strong>
          {banner.sub && <small>{banner.sub}</small>}
        </div>
      )}

      {(v.phase === "scores" || finished) && (
        <Scorecard
          room={room}
          players={players}
          final={finished}
          countdown={v.phase === "scores" ? Math.max(0, Math.ceil((v.phaseAt + SCORES_MS - now) / 1000)) : null}
          send={send}
          onLeave={onLeave}
          onShowLobby={onShowLobby}
        />
      )}

      {menu && (
        <div className="mg-menu panel" role="menu">
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
            game="minigolf"
            variant={`Minigolf, ${COURSES[ref.c].name}, trou ${ref.i + 1}${ref.m ? " à l'envers" : ""}`}
            code={room.code}
            role={seated ? "player" : "watcher"}
            onOpen={() => setMenu(false)}
          />
          <span className="hint mg-menu-stats">{hud ? `${hud.fps} images/s` : ""}</span>
          <button className="menu-item is-danger" onClick={onLeave}>
            <Icon name="door" size={18} /> {bridge ? "Quitter la tournée" : "Quitter la table"}
          </button>
        </div>
      )}

      {help && (
        <div className="mg-help-backdrop" onClick={() => setHelp(false)}>
          <div className="panel panel-pad mg-help" onClick={(e) => e.stopPropagation()}>
            <h2>Comment jouer</h2>
            <HowToPlay />
            <button className="btn btn-primary" onClick={() => setHelp(false)}>
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
