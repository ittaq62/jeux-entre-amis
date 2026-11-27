import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { BONUS_INFO } from "../../shared/games/minigolf/bonus.ts";
import { strokeLimit } from "../../shared/games/minigolf/course.ts";
import { COURSE_IDS, COURSES, holeDef } from "../../shared/games/minigolf/courses.ts";
import { colorOf, DEFAULT_LOOK } from "../../shared/games/minigolf/looks.ts";
import { INTRO_MS, SCORES_MS } from "../../shared/games/minigolf/match.ts";
import type { MinigolfClientMessage, MinigolfRoomView } from "../../shared/games/minigolf/net.ts";
import { challengeDone, challengeOf } from "../../shared/games/minigolf/stars.ts";
import { Icon } from "../components/Icon.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { MenuSound, SoundButton } from "../components/SoundSettings.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { FirstSecondsPanel } from "../game/FirstSecondsPanel.tsx";
import { GameLoading, loadingShown, type LoadingTheme } from "../game/GameLoading.tsx";
import { watchFirstSeconds } from "../lib/firstSeconds.ts";
import { useGateClock, useLoadedSignal } from "../lib/loadGate.ts";
import { nextFrame } from "../lib/prepare.ts";
import { HowToPlay } from "./MinigolfHelp.tsx";
import { GolfRuntime, MIN_PULL, type HudState, type RuntimeEvent } from "./runtime.ts";
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

/** L'écran de chargement aux couleurs du minigolf : un gazon du soir, le jaune du drapeau */
const LOADING_THEME: LoadingTheme = { from: "#2f6b3a", to: "#0e2214", accent: "#f2c94c" };

/** « de » devant un prénom, élidé devant une voyelle : au tour d'Odette, au tour de Gaston */
function deName(name: string) {
  return /^[aeiouyhàâäéèêëîïôöùûüœæ]/i.test(name) ? "d'" : "de ";
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
  // Le chargement du parcours (voir shared/loadGate.ts) : on dit « chargé » au serveur ; le survol du premier trou part
  // quand tout le monde l'a dit (ou au bout de l'attente)
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
    if (live) return watchFirstSeconds("Minigolf");
  }, [live]);

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
  // Chacun son tour : celui qui joue
  const turns = Boolean(v.cfg.turns);
  const active = turns && v.turn >= 0 ? (v.players[v.turn] ?? null) : null;
  const myTurn = active !== null && active.id === mySeat;
  const mySeatView = room.seats.find((s) => s.id === mySeat) ?? null;

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
          case "ball":
            sfx.clack(ev.v, vol);
            break;
        }
      },
    });
    runtime.current = rt;
    listeners.current.onAim = (id, a, p) => rt.setOtherAim(id, a, p);
    // En développement seulement : l'écran de jeu en console (`__mgGame`), pour essayer des coups à plusieurs onglets
    if (import.meta.env.DEV) (window as unknown as { __mgGame?: GolfRuntime }).__mgGame = rt;
    // Le parcours se prépare derrière l'écran de chargement, une fois les joueurs et le trou posés (deux images plus tard)
    let stopped = false;
    rt.holdIntro(!passedRef.current);
    void (async () => {
      await nextFrame();
      await nextFrame();
      if (stopped) return;
      await rt.prepare((share) => !stopped && setPrep({ share, done: false }));
    })()
      .catch((err: unknown) => console.error("Parcours impossible à préparer", err))
      .then(() => !stopped && setPrep({ share: 1, done: true }));
    return () => {
      stopped = true;
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

  // L'aventure : le défi du trou, et ce qu'il a fait sur ce trou une fois fini
  const challenge = v.cfg.adventure ? challengeOf(ref.c, ref.i) : null;
  const feat = me?.feats?.[v.hole];
  const myResult = me?.done
    ? { strokes: me.scores[v.hole] ?? strokeLimit(def.par) + 1, par: def.par, lost: feat?.lost ?? 0, bank: feat?.bank ?? false }
    : null;
  const challengeOk = Boolean(challenge && myResult && challengeDone(challenge, myResult));
  const later = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      // L'aventure : le défi du trou, juste après
      if (challenge && myResult && challengeDone(challenge, myResult))
        later.current = setTimeout(() => {
          say("Défi réussi !", "great", challenge.text);
          sfx.applause(0.6);
        }, 1700);
    }, wait);
    return () => {
      clearTimeout(t);
      clearTimeout(later.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.hole, me?.done, me?.scores[v.hole]]);

  // Une bulle bonus prise : son pouvoir est annoncé quand la balle s'arrête
  const gotKey = me?.shot?.got ? `${v.hole}:${me.shot.n}:${me.shot.at}` : "";
  useEffect(() => {
    if (!me?.shot?.got || shown.current.has(`got:${gotKey}`)) return;
    const info = BONUS_INFO[me.shot.got];
    const wait = Math.max(0, ((me.shot.end - nowTickOf()) * 1000) / 240);
    const t = setTimeout(() => {
      shown.current.add(`got:${gotKey}`);
      say(`Bulle : ${info.name}`, "good", info.blurb);
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotKey]);

  // L'aventure, en arrivant sur un parcours : son survol (le temps de plus que la salle donne au premier trou)
  const cineMs = v.phase === "intro" ? Math.max(0, v.holeStart - v.phaseAt - INTRO_MS) : 0;
  const cine = cineMs > 0 && gateClock.passed;
  // Le trou qui commence (le premier : au départ commun, une fois le chargement passé ; après le survol du parcours)
  useEffect(() => {
    if (v.phase !== "intro" || !gateClock.passed) return;
    const t = setTimeout(() => say(`Trou ${v.hole + 1}`, "info", `${def.name} · par ${def.par}`), cineMs);
    return () => clearTimeout(t);
  }, [v.hole, v.phase, gateClock.passed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chacun son tour : à lui de jouer (seul sur le parcours, on ne le lui répète pas ; un bot qui joue sa balle pendant
  // son absence, non plus : le panneau « Je reprends la main » le dit)
  const turnKey = active ? `${v.hole}:${active.id}:${active.cur}` : "";
  useEffect(() => {
    if (!myTurn || v.turnShot || v.players.length < 2 || mySeatView?.autoplayReason) return;
    sfx.yourTurn(0.9);
    say("À toi de jouer", "great", me && me.cur > 0 ? `Coup ${me.cur + 1}` : undefined);
  }, [turnKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un autre a poussé sa balle : dans le trou (elle compte), ou perdue (elle revient), dit quand elle s'arrête
  const pushed = v.players
    .filter((q) => q.id !== mySeat && q.shot?.hits?.some((h) => h.id === mySeat))
    .map((q) => ({ by: q.id, hit: q.shot!.hits!.find((h) => h.id === mySeat)!, key: `${v.hole}:${q.id}:${q.shot!.n}:${q.shot!.at}` }))
    .at(-1);
  useEffect(() => {
    if (!pushed || shown.current.has(`push:${pushed.key}`)) return;
    const name = players.find((x) => x.id === pushed.by)?.name ?? "?";
    const wait = Math.max(0, ((pushed.hit.end - nowTickOf()) * 1000) / 240);
    const t = setTimeout(() => {
      shown.current.add(`push:${pushed.key}`);
      if (pushed.hit.out === "in") say("Poussée dans le trou !", "great", `Merci ${name}`);
      else if (pushed.hit.out === "lost") say("Ta balle a été poussée dehors", "info", "Elle revient où elle était");
      else say(`${name} a poussé ta balle`, "info");
    }, wait);
    return () => clearTimeout(t);
  }, [pushed?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Son temps est passé sans qu'il tire : le coup compte quand même
  const skipKey = me?.shot?.skip ? `${v.hole}:${me.shot.n}` : "";
  useEffect(() => {
    if (skipKey && !shown.current.has(`skip:${skipKey}`)) {
      shown.current.add(`skip:${skipKey}`);
      say("Temps écoulé", "bad", "Le coup compte, la main passe");
    }
  }, [skipKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Les cinq dernières secondes de son tour, un petit tic
  const now0 = serverNow();
  const turnLeft = active && !v.turnShot && v.phase === "play" ? Math.max(0, Math.ceil((v.turnEnd - now0) / 1000)) : null;
  useEffect(() => {
    if (myTurn && turnLeft !== null && turnLeft > 0 && turnLeft <= 5) sfx.clockTick(0.8);
  }, [turnLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowTickOf = () => ((serverNow() - v.holeStart) * 240) / 1000;
  const now = serverNow();
  const left = Math.max(0, Math.ceil((v.deadline - now) / 1000));
  const seated = me !== null;
  const finished = room.status === "finished" || v.phase === "over";
  const limit = strokeLimit(def.par);

  return (
    <div className={`mg-game ${seated ? "" : "is-watching"}`}>
      <div ref={host} className="mg-stage" />
      {cine && (
        <div className="mg-cine" style={{ "--cine": `${cineMs}ms` } as CSSProperties} aria-live="polite">
          <span className="mg-cine-step">
            Parcours {COURSE_IDS.indexOf(ref.c) + 1} sur {COURSE_IDS.length}
          </span>
          <strong>{COURSES[ref.c].name}</strong>
          <p>{COURSES[ref.c].blurb}</p>
        </div>
      )}
      {room.status === "playing" && loadingShown(prep.done, gateClock) && (
        <GameLoading
          title="Minigolf"
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
        {v.phase === "play" && !turns && (
          <div className={`mg-clock num ${v.hurry ? "is-hurry" : ""} ${left <= 10 ? "is-late" : ""}`} aria-label="Temps restant">
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </div>
        )}
        {challenge && v.phase !== "scores" && v.phase !== "over" && (
          <div className={`mg-challenge ${challengeOk ? "is-done" : ""}`} aria-live="polite">
            <Icon name="trophy" size={16} />
            <span className="mg-challenge-text">
              <span className="mg-turn-pre">Défi : </span>
              {challenge.text}
            </span>
            {challengeOk && <Icon name="check" size={16} />}
          </div>
        )}
        {v.phase === "play" && active && !v.cfg.adventure && (
          <div
            className={`mg-turn ${myTurn ? "is-me" : ""} ${turnLeft !== null && turnLeft <= 5 ? "is-late" : ""}`}
            style={{ "--c": colorOf(players.find((x) => x.id === active.id)?.look.color ?? "blanche").hex } as CSSProperties}
            aria-live="polite"
          >
            <span className="mg-dot" />
            <span className="mg-turn-name">
              {myTurn ? (
                "À toi"
              ) : (
                <>
                  <span className="mg-turn-pre">Au tour {deName(players.find((x) => x.id === active.id)?.name ?? "")}</span>
                  {players.find((x) => x.id === active.id)?.name ?? "?"}
                </>
              )}
            </span>
            {turnLeft !== null && (
              <span className="mg-turn-clock num" aria-label="Temps pour ce coup">
                {turnLeft}
              </span>
            )}
          </div>
        )}
        <div className="mg-top-right">
          <button
            className={`btn btn-sm btn-ghost mg-icon-btn ${hud?.overview ? "is-on" : ""}`}
            onClick={() => runtime.current?.toggleOverview()}
            title="Vue du trou (V)"
          >
            <Icon name="eye" size={18} />
            <span className="mg-btn-label">Vue du trou</span>
          </button>
          <SoundButton className="btn btn-sm btn-ghost mg-icon-btn mg-sound-btn" />
          <button className="btn btn-sm btn-ghost mg-icon-btn" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" size={18} />
            {unread > 0 && <span className="mg-unread">{unread}</span>}
          </button>
          <button className="btn btn-sm btn-ghost mg-icon-btn" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>
            <Icon name="menu" size={18} />
          </button>
        </div>
      </header>

      <aside className="mg-players" aria-label={turns ? "Les joueurs, dans l'ordre de jeu" : "Les joueurs"}>
        {(turns && v.order?.length === v.players.length ? v.order.map((i) => v.players[i]!) : v.players).map((p) => {
          const info = players.find((x) => x.id === p.id);
          const color = colorOf(info?.look.color ?? "blanche").hex;
          const tot = p.scores.reduce<number>((s, x, i) => s + (i < v.hole && x !== null ? x : 0), 0);
          return (
            <div
              key={p.id}
              className={`mg-player ${p.id === mySeat ? "is-me" : ""} ${p.done ? "is-done" : ""} ${active?.id === p.id ? "is-turn" : ""}`}
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

      {me?.power && v.phase === "play" && !me.done && !hud?.rolling && (
        <div
          className="mg-bonus"
          style={{ "--bonus": `#${BONUS_INFO[me.power].color.toString(16).padStart(6, "0")}` } as React.CSSProperties}
        >
          <strong>{BONUS_INFO[me.power].name}</strong>
          <small>pour ce coup</small>
        </div>
      )}

      {hud?.power !== null && hud?.power !== undefined && <PowerGauge power={hud.power} last={hud.lastPower} />}

      {seated && hud?.canShoot && hud.power === null && v.phase === "play" && me && me.cur === 0 && !mySeatView?.autoplayReason && (
        <p className="mg-tip">Tourne la vue pour viser, puis attrape ta balle et tire-la vers toi</p>
      )}

      {mySeatView?.autoplayReason === "afk" && room.status === "playing" && v.phase !== "over" && (
        <div className="mg-relay panel">
          <span>Un bot joue ta balle pendant ton absence.</span>
          <button className="btn btn-sm btn-primary" onClick={() => send({ t: "takeBack" })}>
            Je reprends la main
          </button>
        </div>
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

/**
 * La force du coup qu'il prépare : une jauge haute et lisible sur le côté, ses quarts marqués, le pourcentage, et un
 * repère pour la force de son coup d'avant ; trop peu tirée, elle dit qu'en lâchant il annule
 */
export function PowerGauge({ power, last }: { power: number; last: number | null }) {
  const pct = Math.round(power * 100);
  const cancel = power < MIN_PULL;
  return (
    <div className={`mg-gauge ${cancel ? "is-cancel" : ""}`} aria-hidden="true">
      <strong className="num">{cancel ? "–" : `${pct} %`}</strong>
      <div className="mg-gauge-bar">
        <span className="mg-gauge-fill" style={{ height: `${pct}%` }} />
        {[25, 50, 75].map((q) => (
          <i key={q} style={{ bottom: `${q}%` }} />
        ))}
        {last !== null && <b className="mg-gauge-last" style={{ bottom: `${Math.round(last * 100)}%` }} title="Ton coup d'avant" />}
      </div>
      <small>{cancel ? "lâche : annulé" : "force"}</small>
    </div>
  );
}
