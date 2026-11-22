import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import type { AvatarConfig } from "../../shared/avatar.ts";
import { RACK } from "../../shared/games/bowling/lane.ts";
import { colorOf, DEFAULT_LOOK } from "../../shared/games/bowling/looks.ts";
import { predChoices, type PredPick, type ThrowRecord } from "../../shared/games/bowling/match.ts";
import type { BowlingClientMessage, BowlingRoomView } from "../../shared/games/bowling/net.ts";
import { SALLES } from "../../shared/games/bowling/salles.ts";
import { isSplit, leaveName } from "../../shared/games/bowling/score.ts";
import { Icon } from "../components/Icon.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { MenuSound, SoundButton } from "../components/SoundSettings.tsx";
import { EmotePicker } from "../game/ChatPanel.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { HowToPlay } from "./BowlingHelp.tsx";
import { BallSwatch } from "./LookPicker.tsx";
import { kmh, spinName } from "./gesture.ts";
import { BowlingRuntime, type HudState, type Moment } from "./runtime.ts";
import { FinalSheet, Sheet, type SheetPlayer } from "./Scoresheet.tsx";
import * as sfx from "./sfx.ts";
import type { BowlingListeners } from "./useBowlingRoom.ts";

interface Banner {
  key: number;
  text: string;
  sub?: string;
  tone: "great" | "good" | "info" | "bad";
}

const PRED_LABEL: Record<PredPick, string> = {
  strike: "Strike !",
  reste: "Il en reste",
  cata: "La cata",
  spare: "Spare !",
  rate: "Raté",
};

/** Ce qu'on annonce après un lancer */
function verdict(rec: ThrowRecord, run: number, mine: boolean, name: string): Banner | null {
  const left = rec.standing.map((p) => p.n);
  const cleared = rec.down.length === rec.rack.length;
  const full = rec.rack.length === 10;
  const who = mine ? "" : `${name} · `;
  if (cleared && full) {
    const text = run >= 3 ? "Dinde !" : run === 2 ? "Double !" : "Strike !";
    return { key: 0, text, sub: run >= 3 ? `${who}${run} strikes de suite` : who ? name : undefined, tone: "great" };
  }
  if (cleared) {
    const split = isSplit(rec.rack.map((p) => p.n));
    return { key: 0, text: split ? "Split relevé !" : "Spare !", sub: who ? name : undefined, tone: split ? "great" : "good" };
  }
  if (rec.gutter && rec.down.length === 0) return { key: 0, text: "Dans la rigole !", sub: who ? name : undefined, tone: "bad" };
  if (full && isSplit(left)) return { key: 0, text: "Split !", sub: `${who}${leaveName(left)}`, tone: "info" };
  const n = rec.down.length;
  return { key: 0, text: n === 0 ? "Raté" : `${n} quille${n > 1 ? "s" : ""}`, sub: who ? name : undefined, tone: n >= 7 ? "good" : "info" };
}

export function BowlingGame({
  room,
  send,
  serverNow,
  listeners,
  onLeave,
  onOpenChat,
  unread,
  onShowLobby,
}: {
  room: BowlingRoomView;
  send: (msg: BowlingClientMessage) => void;
  serverNow: () => number;
  listeners: MutableRefObject<BowlingListeners>;
  onLeave: () => void;
  onOpenChat: () => void;
  unread: number;
  onShowLobby: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<BowlingRuntime | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [readout, setReadout] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [, setClock] = useState(0);
  const bridge = useTourBridge();
  const v = room.bowling!;
  const mySeat = room.you.seatId;
  const bannerKey = useRef(0);
  const shown = useRef(new Set<number>());
  const viewRef = useRef(v);
  viewRef.current = v;

  const players: (SheetPlayer & { avatar: AvatarConfig })[] = useMemo(
    () =>
      v.players.map((p) => {
        const seat = room.seats.find((s) => s.id === p.id);
        return { id: p.id, name: seat?.name ?? "?", look: seat?.look ?? DEFAULT_LOOK, avatar: seat?.avatar ?? room.seats[0]!.avatar };
      }),
    [v.players, room.seats],
  );
  const playersKey = JSON.stringify(players.map((p) => [p.id, p.name, p.look, p.avatar]));
  const nameOf = (id: string) => (id === mySeat ? "Toi" : (players.find((p) => p.id === id)?.name ?? "?"));
  const say = (b: Omit<Banner, "key">) => setBanner({ ...b, key: ++bannerKey.current });

  // Une boucle par écran de partie
  useEffect(() => {
    if (!host.current) return;
    const rt = new BowlingRuntime(host.current, {
      me: mySeat,
      serverNow,
      onThrow: (n, t) => send({ t: "throw", n, ...t }),
      onPose: (p) => send({ t: "pose", ...p }),
      onHud: setHud,
      onPhys: (e, vol) => sfx.phys(e, vol),
      onRoll: (sp, vol, g) => sfx.roll(sp, vol, g),
      onMoment: (m: Moment) => {
        sfx.moment(m);
        if (m.k === "result" && !shown.current.has(m.rec.n)) {
          shown.current.add(m.rec.n);
          const cur = viewRef.current;
          const p = cur.players.find((x) => x.id === m.rec.id);
          // La série de strikes, en comptant celui-ci (il n'est pas encore compté par le serveur)
          const strike = m.rec.down.length === 10 && m.rec.rack.length === 10;
          const run = strike ? (p?.stats.run ?? 0) + 1 : 0;
          const b = verdict(m.rec, run, m.rec.id === mySeat, nameOf(m.rec.id));
          if (b) say(b);
        }
      },
      onGesture: (g) => {
        if (typeof g === "string")
          setReadout(g === "back" ? "Recule d'abord : ton bras part en arrière." : "Pousse plus vite vers l'avant en lâchant !");
        else setReadout(`${kmh(g.v)} km/h · ${spinName(g.s)}`);
      },
    });
    runtime.current = rt;
    listeners.current.onPose = (id, p) => rt.pose(id, p);
    listeners.current.onEmote = (seatId, e) => rt.emote(seatId, e);
    return () => {
      listeners.current.onPose = undefined;
      listeners.current.onEmote = undefined;
      rt.dispose();
      runtime.current = null;
      sfx.stopRoll();
    };
    // Une seule boucle pour toute la partie
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runtime.current?.setPlayers(players.map(({ id, name, look, avatar }) => ({ id, name, look, avatar })));
  }, [playersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runtime.current?.setView(v);
  }, [v]);

  useEffect(() => {
    runtime.current?.setPaused(menu || help);
  }, [menu, help]);

  // L'ambiance de la salle
  useEffect(() => {
    const amb = new sfx.Ambience();
    amb.start();
    const unsub = usePrefs.subscribe(() => amb.update());
    return () => {
      unsub();
      amb.stop();
    };
  }, [v.salle]);

  // Le temps qui passe (le compte à rebours du lanceur)
  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Le tour qui change : qui lance
  const turnKey = `${v.phase}:${v.throws}:${v.turn}`;
  useEffect(() => {
    if (v.phase !== "aim") return;
    setReadout(null);
    const p = v.players[v.turn];
    if (!p || v.ball > 0) return;
    if (v.turn === 0 && v.frame > 0)
      say({
        text: `Frame ${v.frame + 1}`,
        sub: v.frame === v.cfg.frames - 1 && v.cfg.mode === "classique" ? "La dernière !" : undefined,
        tone: "info",
      });
    else if (p.id === mySeat && v.players.length > 1) say({ text: "À toi !", tone: "good" });
  }, [turnKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = serverNow();
  const thrower = v.players[v.turn] ?? null;
  const myTurn = v.phase === "aim" && thrower?.id === mySeat;
  const finished = room.status === "finished" || v.phase === "over";
  const left = Math.max(0, Math.ceil((v.deadline - now) / 1000));
  const watchingPred = v.cfg.pronostics && v.phase === "aim" && thrower !== null && thrower.id !== mySeat;
  const myPredKey = mySeat ?? `w:${room.you.userId}`;
  const myPred = v.preds[myPredKey];
  const lastPred = v.lastPreds[myPredKey];
  const standing = new Set(v.rack.map((p) => p.n));
  const throwerInfo = thrower ? players.find((p) => p.id === thrower.id) : null;
  const spares = v.cfg.mode === "spares";
  const myLook = players.find((p) => p.id === mySeat)?.look ?? DEFAULT_LOOK;

  return (
    <div className={`bw-game ${mySeat ? "" : "is-watching"}`}>
      <div ref={host} className="bw-stage" />

      <header className="bw-top">
        <div className="bw-frame-card">
          <span className="bw-frame-num num">{Math.min(v.frame + 1, v.cfg.frames)}</span>
          <span className="bw-frame-text">
            <strong>
              {spares ? "Manche" : "Frame"} {Math.min(v.frame + 1, v.cfg.frames)} / {v.cfg.frames}
            </strong>
            <small>
              {thrower && !finished ? (
                <>
                  <span className="bw-dot" style={{ "--c": colorOf(throwerInfo?.look.color ?? "cerise").hex } as CSSProperties} />
                  {nameOf(thrower.id)} · boule {v.ball + 1}
                </>
              ) : (
                SALLES[v.salle].name
              )}
            </small>
          </span>
          {v.phase === "aim" && !finished && (
            <span className={`bw-clock num ${left <= 8 ? "is-late" : ""}`} aria-label="Temps pour lancer">
              {left}
            </span>
          )}
        </div>
        <div className="bw-top-right">
          <button
            className={`btn btn-sm btn-ghost bw-icon-btn ${sheetOpen ? "is-on" : ""}`}
            onClick={() => setSheetOpen((o) => !o)}
            title="La feuille de score"
          >
            <Icon name="list" size={18} />
            <span className="bw-btn-label">Scores</span>
          </button>
          <SoundButton className="btn btn-sm btn-ghost bw-icon-btn" />
          <button className="btn btn-sm btn-ghost bw-icon-btn" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" size={18} />
            {unread > 0 && <span className="bw-unread">{unread}</span>}
          </button>
          <button className="btn btn-sm btn-ghost bw-icon-btn" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>
            <Icon name="menu" size={18} />
          </button>
        </div>
      </header>

      {sheetOpen && !finished && (
        <div className="bw-sheet-top">
          <Sheet v={v} players={players} me={mySeat} compact />
        </div>
      )}

      {/* Les quilles encore debout, en petit triangle */}
      {!finished && (
        <div className="bw-pins" aria-label={`${standing.size} quille${standing.size > 1 ? "s" : ""} debout`}>
          {[7, 8, 9, 10, 4, 5, 6, 2, 3, 1].map((n) => {
            const p = RACK.find((q) => q.n === n)!;
            return (
              <span
                key={n}
                className={`bw-pin ${standing.has(n) && v.phase !== "roll" ? "is-up" : ""}`}
                style={{ "--x": p.x / 0.1524, "--y": (-p.z - 18.288) / 0.264 } as CSSProperties}
              />
            );
          })}
        </div>
      )}

      {myTurn && hud?.canThrow && !hud.swinging && (
        <>
          <div className="bw-grip" aria-hidden="true">
            <span className="bw-grip-ring" />
            <BallSwatch look={myLook} size={70} />
          </div>
          <p className="bw-tip">
            {v.throws === 0 || readout === null
              ? "Appuie sur la boule, recule, pousse vers l'avant et lâche · glisse en bas pour te placer, en haut pour viser"
              : readout}
          </p>
        </>
      )}
      {myTurn && hud?.swinging && (
        <div className="bw-swing" aria-hidden="true">
          <span style={{ transform: `rotate(${Math.round((hud.arm / 2.2) * 90)}deg)` }} />
        </div>
      )}
      {!myTurn && readout && v.phase === "roll" && thrower?.id === mySeat && <p className="bw-tip is-readout">{readout}</p>}

      {watchingPred && (
        <div className="bw-pred panel">
          <span className="bw-pred-title">Ton pronostic {myPred ? "" : `pour ${nameOf(thrower!.id)}`}</span>
          <div className="bw-pred-btns">
            {predChoices({ ...v, rng: 0 }).map((c) => (
              <button key={c} className={`btn btn-sm ${myPred === c ? "btn-primary" : ""}`} onClick={() => send({ t: "predict", pick: c })}>
                {PRED_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
      )}
      {v.phase === "aim" && lastPred && watchingPred && !myPred && (
        <p className={`bw-pred-last ${lastPred.right ? "is-right" : ""}`}>
          {lastPred.right ? `Bien vu : +${lastPred.points}` : "Raté pour ton pronostic"}
        </p>
      )}

      <div className="bw-react">
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
        <div key={banner.key} className={`bw-banner is-${banner.tone}`} onAnimationEnd={() => setBanner(null)}>
          <strong>{banner.text}</strong>
          {banner.sub && <small>{banner.sub}</small>}
        </div>
      )}

      {v.phase === "intro" && (
        <div className="bw-intro">
          <strong>{SALLES[v.salle].name}</strong>
          <small>{spares ? `Défi des spares · ${v.cfg.frames} manches` : `${v.cfg.frames} frames`}</small>
        </div>
      )}

      {finished && <FinalSheet room={room} players={players} send={send} onLeave={onLeave} onShowLobby={onShowLobby} />}

      {menu && (
        <div className="bw-menu panel" role="menu">
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
            game="bowling"
            variant={`Bowling, ${SALLES[v.salle].name}, ${spares ? "défi des spares" : `${v.cfg.frames} frames`}`}
            code={room.code}
            role={mySeat ? "player" : "watcher"}
            onOpen={() => setMenu(false)}
          />
          <span className="hint bw-menu-stats">{hud ? `${hud.fps} images/s` : ""}</span>
          <button className="menu-item is-danger" onClick={onLeave}>
            <Icon name="door" size={18} /> {bridge ? "Quitter la tournée" : "Quitter la table"}
          </button>
        </div>
      )}

      {help && (
        <div className="bw-help-backdrop" onClick={() => setHelp(false)}>
          <div className="panel panel-pad bw-help" onClick={(e) => e.stopPropagation()}>
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
