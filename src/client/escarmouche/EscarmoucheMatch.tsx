import { lazy, Suspense, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { MAP_NAMES } from "../../shared/games/escarmouche/maps.ts";
import { DEPOT_NAMES, isTeamMode, POINT_NAMES, type KillWeapon } from "../../shared/games/escarmouche/match.ts";
import { MODE_INFO } from "../../shared/games/escarmouche/rules.ts";
import { B } from "../../shared/games/escarmouche/soldier.ts";
import { PRIMARY_IDS, SECONDARY_IDS, WEAPONS, type PrimaryId, type SecondaryId } from "../../shared/games/escarmouche/weapons.ts";
import { weaponItem } from "../../shared/shop.ts";
import type { EscarmoucheClientMessage, EscarmoucheRoomView } from "../../shared/protocol.ts";
import { ReportButton } from "../components/ReportButton.tsx";
import { SoundSettings } from "../components/SoundSettings.tsx";
import { unlockAudio } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { QUALITY_NAMES, type QualityPref } from "./scene/quality.ts";
import { useMyItems } from "../stores/shop.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TourNextNote } from "../tour/TourNextNote.tsx";
import { EveningLine } from "../components/EveningLine.tsx";
import { TEAM_NAMES } from "./EscarmoucheLobby.tsx";
import { BattleRuntime, type HudState } from "./runtime.ts";
import { TEAM_HEX } from "./scene/EscScene.ts";
import type { BattleListeners } from "./useEscarmoucheRoom.ts";
import { WeaponIcon } from "./WeaponIcon.tsx";
import { ffaKit } from "./scene/soldiers.ts";
import { seededAvatar } from "../../shared/avatar.ts";
import { runtimeKey } from "./runtimeKey.ts";
import { watchFirstSeconds } from "../lib/firstSeconds.ts";
import { useGateClock, useLoadedSignal } from "../lib/loadGate.ts";
import { nextFrame } from "../lib/prepare.ts";
import { FirstSecondsPanel } from "../game/FirstSecondsPanel.tsx";
import { GameLoading, loadingShown, type LoadingTheme } from "../game/GameLoading.tsx";

/** L'écran de chargement aux couleurs du front */
const LOADING_THEME: LoadingTheme = { from: "#4b5a38", to: "#12160d", accent: "#e8b84a" };

const EscPreview3D = lazy(() => import("./EscPreview3D.tsx"));

const KILL_WEAPON: Record<KillWeapon, string> = {
  fa: "fusil d'assaut",
  pm: "pistolet-mitrailleur",
  pompe: "fusil à pompe",
  precision: "fusil de précision",
  pistolet: "pistolet",
  carabine: "carabine",
  fm: "fusil-mitrailleur",
  mitraillette: "mitraillette",
  rafale: "fusil à rafales",
  double: "fusil à deux coups",
  revolver: "revolver",
  pa: "pistolet automatique",
  grenade: "grenade",
  couteau: "couteau",
  chute: "chute",
  bidon: "bidon d'essence",
  mortier: "tir de mortier",
  charge: "charge explosive",
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Props {
  room: EscarmoucheRoomView;
  send: (msg: EscarmoucheClientMessage) => void;
  listeners: MutableRefObject<BattleListeners>;
  serverOffset: number;
  unread: number;
  onOpenChat: () => void;
  onShowLobby: () => void;
  onLeave: () => void;
}

/** Le stick du pouce gauche : il se pose là où le pouce touche ; poussé loin, on court */
function TouchStick({ rt }: { rt: MutableRefObject<BattleRuntime | null> }) {
  const [knob, setKnob] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);
  const finger = useRef<{ id: number; x: number; y: number } | null>(null);
  const R = 56;
  const move = (e: ReactPointerEvent) => {
    const f = finger.current;
    if (!f || e.pointerId !== f.id) return;
    const dx = e.clientX - f.x;
    const dy = e.clientY - f.y;
    const l = Math.hypot(dx, dy);
    const k = l > R ? R / l : 1;
    const t = rt.current?.controls.touch;
    if (t) {
      t.sx = (dx * k) / R;
      t.sy = (dy * k) / R;
      t.run = l > R * 1.35 && dy < 0;
    }
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setKnob({ ox: f.x - box.left, oy: f.y - box.top, kx: dx * k, ky: dy * k });
  };
  const end = (e: ReactPointerEvent) => {
    if (finger.current?.id !== e.pointerId) return;
    finger.current = null;
    const t = rt.current?.controls.touch;
    if (t) {
      t.sx = t.sy = 0;
      t.run = false;
    }
    setKnob(null);
  };
  return (
    <div
      className="esc-stick-zone"
      onPointerDown={(e) => {
        if (finger.current) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        finger.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        unlockAudio();
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {knob && (
        <div className="esc-stick" style={{ left: knob.ox, top: knob.oy }}>
          <div className="esc-stick-knob" style={{ transform: `translate(${knob.kx}px, ${knob.ky}px)` }} />
        </div>
      )}
    </div>
  );
}

/** La vue qui glisse sous le pouce droit (et le bouton de tir, qui vise aussi) */
function useLook(rt: MutableRefObject<BattleRuntime | null>) {
  const last = useRef(new Map<number, { x: number; y: number }>());
  return {
    down: (e: ReactPointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      last.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      unlockAudio();
    },
    move: (e: ReactPointerEvent) => {
      const p = last.current.get(e.pointerId);
      const t = rt.current?.controls.touch;
      if (!p || !t) return;
      t.lookX += e.clientX - p.x;
      t.lookY += e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
    },
    up: (e: ReactPointerEvent) => {
      last.current.delete(e.pointerId);
    },
  };
}

function TouchPad({ rt, hud }: { rt: MutableRefObject<BattleRuntime | null>; hud: HudState }) {
  const look = useLook(rt);
  const [ads, setAds] = useState(false);
  const [crouch, setCrouch] = useState(false);
  const t = () => rt.current?.controls.touch;
  const tap = (bit: number) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    rt.current?.controls.touchTap(bit);
  };
  useEffect(() => {
    const tt = t();
    if (tt) tt.ads = ads;
  });
  return (
    <div className="esc-pad">
      <TouchStick rt={rt} />
      <div className="esc-look-zone" onPointerDown={look.down} onPointerMove={look.move} onPointerUp={look.up} onPointerCancel={look.up} />
      <div className="esc-buttons">
        <button
          className="esc-btn esc-fire"
          onPointerDown={(e) => {
            look.down(e);
            const tt = t();
            if (tt) tt.fire = true;
          }}
          onPointerMove={look.move}
          onPointerUp={(e) => {
            look.up(e);
            const tt = t();
            if (tt) tt.fire = false;
          }}
          onPointerCancel={(e) => {
            look.up(e);
            const tt = t();
            if (tt) tt.fire = false;
          }}
          aria-label="Tirer"
        >
          <span className="esc-fire-dot" />
        </button>
        <button
          className={`esc-btn esc-ads ${ads ? "is-on" : ""}`}
          onPointerDown={(e) => (e.stopPropagation(), setAds(!ads))}
          aria-label="Viser"
        >
          {hud.weapon === "precision" ? "Lunette" : "Viser"}
        </button>
        <button className="esc-btn esc-jump" onPointerDown={tap(B.jump)} aria-label="Sauter">
          Saut
        </button>
        <button
          className={`esc-btn esc-crouch ${crouch ? "is-on" : ""}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            const next = !crouch;
            setCrouch(next);
            const tt = t();
            if (tt) tt.crouch = next;
          }}
          aria-label="S'accroupir"
        >
          Accroupi
        </button>
        <button className="esc-btn esc-reloadbtn" onPointerDown={tap(B.reload)} aria-label="Recharger">
          Recharger
        </button>
        <button className="esc-btn esc-swap" onPointerDown={tap(B.swap)} aria-label="Changer d'arme">
          Arme
        </button>
        <button className="esc-btn esc-nade" onPointerDown={tap(B.grenade)} disabled={hud.grenades === 0} aria-label="Lancer une grenade">
          Grenade
        </button>
        <button className="esc-btn esc-knife" onPointerDown={tap(B.melee)} aria-label="Couteau">
          Couteau
        </button>
        <button className="esc-btn esc-spot" onPointerDown={tap(B.spot)} aria-label="Repérer l'ennemi visé">
          Repérer
        </button>
      </div>
    </div>
  );
}

function Board({ room, hud }: { room: EscarmoucheRoomView; hud: HudState }) {
  const v = room.escarmouche!;
  const teams = isTeamMode(v.mode);
  const groups = teams ? [0, 1].map((t) => hud.board.filter((r) => r.team === t)) : [hud.board];
  return (
    <div className="esc-board panel">
      <h2>
        {MODE_INFO[v.mode].name} · {MAP_NAMES[v.map].name}
      </h2>
      {groups.map((rows, g) => (
        <table key={g} className={teams ? `is-team-${g}` : ""}>
          {teams && (
            <caption style={{ color: TEAM_HEX[g as 0 | 1] }}>
              {TEAM_NAMES[g as 0 | 1]} · {hud.teamScores[g]}
            </caption>
          )}
          <thead>
            <tr>
              <th>Soldat</th>
              <th>Élim.</th>
              <th>Morts</th>
              <th>Passes</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => b.points - a.points || b.kills - a.kills)
              .map((r) => (
                <tr key={r.i} className={r.me ? "is-me" : ""}>
                  <td>
                    {r.name}
                    {r.bot && <span className="hint"> · bot</span>}
                  </td>
                  <td className="num">{r.kills}</td>
                  <td className="num">{r.deaths}</td>
                  <td className="num">{r.assists}</td>
                  <td className="num">{r.points}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

/**
 * Le podium : les trois meilleurs soldats de la partie, en trois dimensions dans leur tenue et avec leur arme, sur
 * leurs marches ; puis les distinctions (le plus d'éliminations, le plus précis, les relèves, les drapeaux…)
 */
function Podium({ room, order }: { room: EscarmoucheRoomView; order: number[] }) {
  const v = room.escarmouche!;
  const teams = isTeamMode(v.mode);
  const stats = v.stats;
  if (!stats || order.length === 0) return null;
  const score = (i: number) => (teams ? (stats[i]?.points ?? 0) : (stats[i]?.kills ?? 0));
  // En équipes, aux points ; chacun pour soi, au classement
  const best = teams ? [...order].sort((a, b) => score(b) - score(a)) : order;
  const top = best.slice(0, 3);
  const seatOf = (i: number) => room.seats.find((s) => s.id === v.fighters[i]?.id);
  const name = (i: number) => seatOf(i)?.name ?? "?";
  const small = typeof window !== "undefined" && window.innerHeight < 560;
  const size = small ? { width: 86, height: 104 } : { width: 132, height: 168 };
  // Les marches : le deuxième à gauche, le premier au milieu, le troisième à droite
  const steps = [top[1], top[0], top[2]];
  const awards: { title: string; who: number; what: string }[] = [];
  const most = (key: (i: number) => number, min: number) => {
    let who = -1;
    let n = min - 1;
    stats.forEach((_, i) => {
      if (key(i) > n) {
        n = key(i);
        who = i;
      }
    });
    return who >= 0 ? { who, n } : null;
  };
  const kills = most((i) => stats[i]!.kills, 1);
  if (kills) awards.push({ title: "Le plus d'éliminations", who: kills.who, what: `${kills.n}` });
  const aim = most((i) => (stats[i]!.shots >= 15 ? stats[i]!.hits / stats[i]!.shots : -1), 0);
  if (aim) awards.push({ title: "Tireur d'élite", who: aim.who, what: `${Math.round(aim.n * 100)} %` });
  const heads = most((i) => stats[i]!.headshots, 2);
  if (heads) awards.push({ title: "Tirs à la tête", who: heads.who, what: `${heads.n}` });
  const revives = most((i) => stats[i]!.revives ?? 0, 1);
  if (revives) awards.push({ title: "Secouriste", who: revives.who, what: `${revives.n} relevé${revives.n > 1 ? "s" : ""}` });
  const caps = most((i) => stats[i]!.captures, 1);
  if (caps) awards.push({ title: "Preneur de drapeaux", who: caps.who, what: `${caps.n}` });
  const nades = most((i) => stats[i]!.grenadeKills, 1);
  if (nades) awards.push({ title: "Grenadier", who: nades.who, what: `${nades.n}` });
  const streak = most((i) => stats[i]!.best, 3);
  if (streak) awards.push({ title: "Meilleure série", who: streak.who, what: `${streak.n} d'affilée` });
  return (
    <div className="esc-podium-wrap">
      <div className="esc-podium">
        {steps.map((i, k) => {
          if (i === undefined) return <div key={k} className="esc-podium-col is-empty" />;
          const f = v.fighters[i]!;
          const seat = seatOf(i);
          const gear = room.arsenal[f.id];
          const rank = k === 1 ? 1 : k === 0 ? 2 : 3;
          return (
            <div key={k} className={`esc-podium-col is-${rank}`}>
              <Suspense fallback={<div style={{ ...size }} />}>
                <EscPreview3D
                  tenue={gear?.tenue ?? "treillis"}
                  weapon={gear?.primary ?? "fa"}
                  camo={gear?.camo ?? "usine"}
                  gear={gear ? { muzzle: gear.muzzle, extra: gear.extra } : undefined}
                  avatar={seat?.avatar ?? seededAvatar(f.id)}
                  band={teams ? TEAM_HEX[f.team === 1 ? 1 : 0] : ffaKit(i).band}
                  {...size}
                />
              </Suspense>
              <span className="esc-podium-name" style={teams ? { color: TEAM_HEX[f.team === 1 ? 1 : 0] } : undefined}>
                {name(i)}
              </span>
              <span className="esc-podium-step">
                <b>{rank}</b>
                <small>{teams ? `${score(i)} pts` : `${score(i)} élim.`}</small>
              </span>
            </div>
          );
        })}
      </div>
      {awards.length > 0 && (
        <div className="esc-awards-end">
          {awards.slice(0, 5).map((a) => (
            <span key={a.title} className="esc-award-chip">
              <small>{a.title}</small>
              <b>{name(a.who)}</b>
              <em>{a.what}</em>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GameOver({
  room,
  send,
  onLeave,
  onShowLobby,
}: {
  room: EscarmoucheRoomView;
  send: Props["send"];
  onLeave: () => void;
  onShowLobby: () => void;
}) {
  const v = room.escarmouche!;
  const teams = isTeamMode(v.mode);
  const inTour = Boolean(useTourBridge());
  const seated = room.you.seatId !== null;
  const asked = room.rematch.includes(room.you.userId);
  // Assis après le combat : on ne demande pas la revanche d'un combat qu'on n'a pas joué, on demande à jouer le suivant
  const fought = v.fighters.some((f) => f.id === room.you.seatId);
  const myResult = room.results?.[room.you.userId];
  const name = (i: number) => room.seats.find((s) => s.id === v.fighters[i]?.id)?.name ?? "?";
  const title = teams
    ? v.winner === null
      ? "Égalité"
      : `Victoire des ${TEAM_NAMES[v.winner as 0 | 1]}`
    : v.winner === null
      ? "Égalité en tête"
      : `${name(v.winner)} l'emporte`;
  const order = v.fighters
    .map((_, i) => i)
    .sort((a, b) => (v.ranks?.[a] ?? 9) - (v.ranks?.[b] ?? 9) || (v.stats?.[b]?.kills ?? 0) - (v.stats?.[a]?.kills ?? 0));
  return (
    <div className="esc-over">
      <div className="esc-over-card panel">
        <h1>{title}</h1>
        <p className="hint">
          {MODE_INFO[v.mode].name} · {MAP_NAMES[v.map].name}
        </p>
        {myResult && (
          <p className="hint">
            Elo : {myResult.elo} ({myResult.delta >= 0 ? "+" : ""}
            {myResult.delta})
          </p>
        )}
        <Podium room={room} order={order} />
        <table className="esc-over-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Soldat</th>
              <th>Élim.</th>
              <th>Morts</th>
              <th>Têtes</th>
              <th>Précision</th>
            </tr>
          </thead>
          <tbody>
            {order.map((i) => {
              const s = v.stats?.[i];
              const team = v.fighters[i]!.team;
              return (
                <tr key={i} className={v.fighters[i]!.id === room.you.seatId ? "is-me" : ""}>
                  <td className="num">{v.ranks?.[i] ?? "–"}</td>
                  <td style={teams ? { color: TEAM_HEX[team === 1 ? 1 : 0] } : undefined}>{name(i)}</td>
                  <td className="num">{s?.kills ?? 0}</td>
                  <td className="num">{s?.deaths ?? 0}</td>
                  <td className="num">{s?.headshots ?? 0}</td>
                  <td className="num">{s && s.shots > 0 ? `${Math.round((s.hits / s.shots) * 100)} %` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <EveningLine game="escarmouche" />
        {inTour ? (
          // La feuille reste jusqu'à l'entracte (15 s), ou jusqu'à ce que tous les joueurs aient continué
          <TourNextNote />
        ) : (
          !seated && (
            <p className="hint" style={{ margin: 0 }}>
              Tu regardes ce combat : reste pour voir le suivant.
            </p>
          )
        )}
        <div className="esc-over-actions">
          {!inTour && seated && (
            <button className="btn btn-primary" disabled={asked} onClick={() => send({ t: "rematch" })}>
              {asked ? "En attente des autres" : fought ? "Revanche" : "Jouer le suivant"}
            </button>
          )}
          {!inTour && (
            <button className="btn" onClick={onShowLobby}>
              {room.you.isHost ? "Changer les règles" : "Voir le salon"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            {inTour ? "Quitter la tournée" : "Quitter"}
          </button>
        </div>
        <ReportButton
          game="escarmouche"
          variant={`Escarmouche, ${MODE_INFO[v.mode].name}, ${MAP_NAMES[v.map].name}`}
          code={room.code}
          role={room.you.seatId ? "player" : "watcher"}
        />
      </div>
    </div>
  );
}

function Settings({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  const p = usePrefs();
  return (
    <div className="esc-settings">
      <label>
        <span>Sensibilité {touch ? "du doigt" : "de la souris"}</span>
        <input
          type="range"
          min={0.3}
          max={2.5}
          step={0.05}
          value={touch ? p.escTouch : p.escMouse}
          onChange={(e) => p.set(touch ? { escTouch: Number(e.target.value) } : { escMouse: Number(e.target.value) })}
        />
      </label>
      <label>
        <span>Champ de vision : {p.escFov}°</span>
        <input type="range" min={65} max={100} step={1} value={p.escFov} onChange={(e) => p.set({ escFov: Number(e.target.value) })} />
      </label>
      <label>
        <span>Qualité de l'image</span>
        <select value={p.escQuality} onChange={(e) => p.set({ escQuality: e.target.value as QualityPref })}>
          {(Object.keys(QUALITY_NAMES) as QualityPref[]).map((q) => (
            <option key={q} value={q}>
              {QUALITY_NAMES[q]}
            </option>
          ))}
        </select>
      </label>
      <label className="esc-check">
        <input type="checkbox" checked={p.escInvert} onChange={(e) => p.set({ escInvert: e.target.checked })} />
        <span>Inverser l'axe vertical</span>
      </label>
      {touch && (
        <label className="esc-check">
          <input type="checkbox" checked={p.escAssist} onChange={(e) => p.set({ escAssist: e.target.checked })} />
          <span>Aide à la visée</span>
        </label>
      )}
      <button className="btn btn-sm" onClick={onClose}>
        Fermer les réglages
      </button>
    </div>
  );
}

/** Le combat : la vue à la première personne, ce qu'il faut savoir autour, et les commandes au doigt. */
export function EscarmoucheMatch({ room, send, listeners, serverOffset, unread, onOpenChat, onShowLobby, onLeave }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rt = useRef<BattleRuntime | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sound, setSound] = useState(false);
  const inTour = Boolean(useTourBridge());
  const [board, setBoard] = useState(false);
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const { has } = useMyItems();
  const v = room.escarmouche!;
  const over = room.status === "finished" || v.phase === "over";
  const mapKey = runtimeKey(room);
  // Changer la qualité refait l'image tout de suite (la partie, elle, continue)
  const quality = usePrefs((p) => p.escQuality);
  const roomRef = useRef(room);
  roomRef.current = room;
  // Le chargement de la carte (voir shared/loadGate.ts) : on dit « chargé » au serveur ; le compte à rebours du combat
  // part quand tout le monde l'a dit
  const [prep, setPrep] = useState({ key: "", share: 0, done: false });
  const prepKey = `${mapKey}|${quality}`;
  const prepared = prep.key === prepKey && prep.done;
  const gateClock = useGateClock(room.gate, serverOffset);
  useLoadedSignal(room.gate, room.you.seatId, prepared, send);
  const live = prepared && gateClock.passed && room.status === "playing";
  useEffect(() => {
    if (live) return watchFirstSeconds("Escarmouche");
  }, [live, prepKey]);

  // Le moteur du combat : créé une fois par partie (la revanche en refait un)
  useEffect(() => {
    if (!canvas.current) return;
    const r = new BattleRuntime({ canvas: canvas.current, room: roomRef.current, send, touch, onHud: setHud });
    rt.current = r;
    r.controls.onLockChange = (locked) => {
      if (!locked && !touch) setMenu(true);
      if (locked) setMenu(false);
    };
    listeners.current = { onTick: (now, tick, me) => r.onTick(now, tick, me), onEvents: (events) => r.onEvents(events) };
    r.start();
    // La carte se prépare derrière l'écran de chargement, une fois la première image posée (deux images plus tard)
    const key = `${mapKey}|${quality}`;
    let stopped = false;
    setPrep({ key, share: 0, done: false });
    void (async () => {
      await nextFrame();
      await nextFrame();
      if (stopped) return;
      await r.prepare((share) => !stopped && setPrep({ key, share, done: false }));
    })()
      .catch((err: unknown) => console.error("Carte impossible à préparer", err))
      .then(() => !stopped && setPrep({ key, share: 1, done: true }));
    return () => {
      stopped = true;
      listeners.current = {};
      r.dispose();
      rt.current = null;
    };
  }, [mapKey, send, listeners, touch, quality]);

  useEffect(() => {
    rt.current?.setRoom(room);
  }, [room]);

  // Les réglages changent : la sensibilité suit tout de suite
  useEffect(() => usePrefs.subscribe(() => rt.current?.applyPrefs()), []);

  useEffect(() => {
    const r = rt.current;
    if (r) r.controls.paused = menu || over;
    if (over) r?.controls.unlock();
  }, [menu, over]);

  useEffect(() => {
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("esc-playing");
    return () => document.documentElement.classList.remove("esc-playing");
  }, []);

  const pickNext = (primary: PrimaryId) => {
    usePrefs.getState().set({ escarmouchePrimary: primary });
    send({ t: "arsenal", primary });
  };
  const pickNextSecondary = (secondary: SecondaryId) => {
    usePrefs.getState().set({ escarmoucheSecondary: secondary });
    send({ t: "arsenal", secondary });
  };

  const resume = () => {
    setMenu(false);
    setSettings(false);
    setSound(false);
    unlockAudio();
    if (!touch) rt.current?.controls.lock();
  };

  const h = hud;
  const teams = isTeamMode(v.mode);
  const hitFresh = h ? performance.now() - h.hitAt < 220 : false;
  const hurt = h ? Math.max(0, 1 - (performance.now() - h.hurtAt) / 600) : 0;
  const low = h && h.alive ? Math.max(0, (45 - h.hp) / 45) : 0;
  const forced = v.settings.arsenal !== "libre";
  const myCamo = room.arsenal[room.you.seatId ?? ""]?.camo ?? "usine";

  return (
    <div className={`esc-root ${touch ? "is-touch" : ""}`}>
      {room.status === "playing" && loadingShown(prepared, gateClock) && (
        <GameLoading
          title="Escarmouche"
          theme={LOADING_THEME}
          share={prep.key === prepKey ? prep.share : 0}
          done={prepared}
          gate={room.gate}
          serverOffset={serverOffset}
          players={room.seats
            .filter((s) => s.kind === "human")
            .map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, userId: s.userId }))}
          me={room.you.seatId}
        />
      )}
      <FirstSecondsPanel />
      <canvas
        ref={canvas}
        className="esc-canvas"
        onClick={() => {
          unlockAudio();
          if (!touch && !menu && !over) rt.current?.controls.lock();
        }}
      />
      {h && !over && (
        <div className="esc-hud">
          {/* En haut : le score et le temps */}
          <div className="esc-top">
            {teams ? (
              <div className="esc-teams">
                <span className={`esc-tscore is-a ${h.myTeam === 0 ? "is-mine" : ""}`}>{h.teamScores[0]}</span>
                <span className="esc-clock num">{clock(h.timeLeft)}</span>
                <span className={`esc-tscore is-b ${h.myTeam === 1 ? "is-mine" : ""}`}>{h.teamScores[1]}</span>
              </div>
            ) : (
              <div className="esc-teams">
                <span className="esc-solo">
                  {h.mine.kills}
                  <small>/{v.goal}</small>
                </span>
                <span className="esc-clock num">{clock(h.timeLeft)}</span>
                <span className="esc-solo is-lead">{h.leader ? `${h.leader.name} · ${h.leader.kills}` : ""}</span>
              </div>
            )}
            {h.cq && (
              <div className="esc-cq" title={`Conquête · ${v.goal} tickets au départ`}>
                {h.cq.pts.map((p, k) => (
                  <span
                    key={k}
                    className={`esc-cq-pt ${h.cq!.inside === k ? "is-here" : ""} ${p.owner >= 0 && Math.abs(p.v) < 0.98 ? "is-shaky" : ""}`}
                    style={{ borderColor: p.owner >= 0 ? TEAM_HEX[p.owner as 0 | 1] : "rgba(242,239,230,.7)" }}
                  >
                    <b style={{ color: p.owner >= 0 ? TEAM_HEX[p.owner as 0 | 1] : "#f2efe6" }}>{POINT_NAMES[k]}</b>
                    <i style={{ width: `${Math.round(Math.abs(p.v) * 100)}%`, background: p.v < 0 ? TEAM_HEX[0] : TEAM_HEX[1] }} />
                  </span>
                ))}
              </div>
            )}
            {h.sab && (
              <div className="esc-cq" title={`Sabotage · ${h.teamScores[0]} renforts pour les attaquants`}>
                {h.sab.deps.map((d, k) => (
                  <span
                    key={k}
                    className={`esc-cq-pt ${d.state === 1 ? "is-shaky" : ""} ${d.state === 2 ? "is-down" : ""}`}
                    style={{ borderColor: d.state === 1 ? "#ffb020" : d.state === 2 ? "rgba(160,160,160,.6)" : TEAM_HEX[1] }}
                  >
                    <b style={{ color: d.state === 1 ? "#ffb020" : d.state === 2 ? "#999" : TEAM_HEX[1] }}>{DEPOT_NAMES[k]}</b>
                    {d.state === 1 && <i style={{ width: `${Math.round((d.left / 25) * 100)}%`, background: "#ffb020" }} />}
                  </span>
                ))}
              </div>
            )}
            {!h.cq && !h.sab && (
              <div className="esc-goal hint">
                {MODE_INFO[v.mode].short} · objectif {v.goal} {MODE_INFO[v.mode].unit}
                {h.zone &&
                  (h.zone.contested
                    ? " · zone disputée"
                    : h.zone.owner >= 0
                      ? ` · zone aux ${TEAM_NAMES[h.zone.owner as 0 | 1]}`
                      : " · zone libre")}
              </div>
            )}
            {h.flags && (
              <div className="esc-flags">
                {h.flags.map((f, t) => (
                  <span
                    key={t}
                    className={`esc-flag is-${f.at === 0 ? "home" : f.at === 1 ? "taken" : "down"}`}
                    style={{ color: TEAM_HEX[t as 0 | 1] }}
                  >
                    ⚑ {f.at === 0 ? "chez lui" : f.at === 1 ? "pris" : "tombé"}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* La boussole, sous le score ; le radar, dans un coin */}
          <canvas className="esc-compass" ref={(el) => rt.current?.setCompassCanvas(el)} />
          {h.seated && <canvas className="esc-radar" ref={(el) => rt.current?.setRadarCanvas(el)} />}

          {/* Le fil des éliminations */}
          <ul className="esc-feed">
            {h.feed.map((f) => (
              <li key={f.id}>
                {f.killer && <b style={{ color: f.killerColor }}>{f.killer}</b>}
                <span className="esc-feed-w">
                  {KILL_WEAPON[f.weapon]}
                  {f.head ? " ⊕" : ""}
                </span>
                <b style={{ color: f.victimColor }}>{f.victim}</b>
              </li>
            ))}
          </ul>

          {h.banner && (
            <div key={h.banner.id} className={`esc-banner is-${h.banner.tone}`}>
              {h.banner.text}
            </div>
          )}

          {h.phase === "countdown" && h.countdown > 0 && <div className="esc-countdown num">{Math.ceil(h.countdown)}</div>}

          {/* Le réticule (sauf « sans filet » et à la lunette), le repère quand on touche */}
          {h.alive && !h.scoped && !v.settings.hardcore && (
            <div className="esc-cross" style={{ ["--gap" as string]: `${h.ads ? Math.min(h.spread, 6) : h.spread}px` }}>
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
          {hitFresh && <div className={`esc-hit is-${h.hitKind}`} />}
          {h.pops.length > 0 && (
            <div className="esc-pops">
              {h.pops.map((q, k) => (
                <span
                  key={q.id}
                  className={`esc-pop ${q.kill ? "is-kill" : q.head ? "is-head" : ""}`}
                  style={{ ["--k" as string]: String(h.pops.length - 1 - k) }}
                >
                  {q.value}
                </span>
              ))}
            </div>
          )}
          {h.aimed && h.alive && <div className="esc-aimed">{h.aimed}</div>}
          {h.scoped && <div className="esc-scope" />}
          {h.alive && h.sab?.act && (
            <div className="esc-reviving">
              <span className="esc-gauge">
                <i style={{ width: `${Math.round(h.sab.act.k * 100)}%`, background: "#ffb020" }} />
              </span>
              <small>{h.sab.act.label}</small>
            </div>
          )}
          {h.alive && !h.sab?.act && h.sab?.hint && (
            <div className="esc-reviving">
              <small>{h.sab.hint}</small>
            </div>
          )}
          {h.alive && h.team?.reviving && (
            <div className="esc-reviving">
              <span className="esc-gauge">
                <i style={{ width: `${Math.round(h.team.reviving.k * 100)}%` }} />
              </span>
              <small>Tu relèves {h.team.reviving.name}</small>
            </div>
          )}
          {h.alive && !h.team?.reviving && h.team?.hint && (
            <div className="esc-reviving">
              <small>
                {touch ? "Accroupi" : "Ctrl ou C"} : relever {h.team.hint}
              </small>
            </div>
          )}
          {h.breath && (
            <div className={`esc-breath ${h.breath.holding ? "is-holding" : ""} ${h.breath.winded ? "is-winded" : ""}`}>
              <span style={{ width: `${Math.round(h.breath.left * 100)}%` }} />
              <small>{h.breath.winded ? "Essoufflé…" : touch ? "Course : retenir son souffle" : "Maj : retenir son souffle"}</small>
            </div>
          )}
          <div className="esc-suppress" style={{ opacity: Math.min(0.85, h.suppress * 0.9) }} />
          {h.awards.length > 0 && (
            <ul className="esc-awards">
              {h.awards.map((a) => (
                <li key={a.id} className={a.pts > 0 ? "is-points" : ""}>
                  {a.pts > 0 && <b className="num">+{a.pts}</b>}
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          )}
          {h.damage.map((d) => (
            <div key={d.id} className="esc-dmg" style={{ transform: `translate(-50%, -50%) rotate(${(-d.angle * 180) / Math.PI}deg)` }} />
          ))}
          <div className="esc-hurt" style={{ opacity: Math.min(1, hurt * 0.7 + low * 0.6) }} />

          {/* En bas : la santé, l'arme et les munitions */}
          {h.seated && h.alive && (
            <>
              <div className="esc-health">
                <div className="esc-health-bar">
                  <span style={{ width: `${h.hp}%` }} className={h.hp < 35 ? "is-low" : ""} />
                </div>
                <span className="num">{Math.ceil(h.hp)}</span>
                {h.carrying >= 0 && <span className="esc-carry">⚑ Tu portes le drapeau !</span>}
                {h.zone?.inside && <span className="esc-carry">Dans la zone</span>}
                {h.cq && h.cq.inside >= 0 && <span className="esc-carry">{cqLabel(h.cq, h.myTeam)}</span>}
              </div>
              <div className="esc-ammo">
                <span className="esc-ammo-name">{WEAPONS[h.weapon].name}</span>
                <span className={`num esc-ammo-mag ${h.mag === 0 ? "is-empty" : h.mag <= h.magCap / 4 ? "is-low" : ""}`}>
                  {h.mag}
                  <small> / {h.res}</small>
                </span>
                <span className="esc-ammo-nade">{h.grenades > 0 ? "● grenade" : "○ grenade"}</span>
                {h.streak > 0 && (
                  <span className="esc-streak">
                    Série {h.streak}
                    {h.streak < 3 ? ` · jumelles à 3` : h.streak < 5 ? ` · mortier à 5` : ""}
                  </span>
                )}
                {h.reloading >= 0 && (
                  <span className="esc-reload">
                    <span style={{ width: `${Math.round(h.reloading * 100)}%` }} />
                  </span>
                )}
                {h.mag === 0 && h.reloading < 0 && (
                  <span className="esc-warn">
                    {h.res > 0
                      ? touch
                        ? "Recharge !"
                        : "R pour recharger"
                      : "Plus de munitions : change d'arme, ravitaille-toi à ta base ou sur un soldat tombé"}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Hors de combat : qui, et avec quelle arme revenir */}
          {h.seated && !h.alive && h.phase !== "countdown" && (
            <div className="esc-dead panel">
              <h2>Éliminé</h2>
              {h.killer && (
                <p>
                  par <b>{h.killer.name}</b> au {KILL_WEAPON[h.killer.weapon]}
                  {h.killer.head ? ", d'une balle à la tête" : ""}
                </p>
              )}
              {h.killer?.hp != null && h.killer.hp > 0 && (
                <p className="hint">
                  Il lui restait {h.killer.hp} de vie{h.killer.hp < 30 ? " : il s'en est fallu de peu." : "."}
                </p>
              )}
              {h.team?.rescue ? (
                <div className="esc-rescue">
                  <p>
                    <b>{h.team.rescue.name}</b> te relève…
                  </p>
                  <span className="esc-gauge">
                    <i style={{ width: `${Math.round(h.team.rescue.k * 100)}%` }} />
                  </span>
                </div>
              ) : h.team?.waiting ? (
                <div className="esc-rescue">
                  <p className="hint">Un coéquipier est tout près : il peut te relever.</p>
                  <button className="btn btn-sm" onClick={() => send({ t: "respawnNow" })}>
                    Revenir maintenant
                  </button>
                </div>
              ) : h.noReinforcements ? (
                <p className="hint">Plus de renforts : tu ne reviens plus avant la fin de la partie.</p>
              ) : (
                <p className="hint">Retour au combat dans {Math.ceil(h.back)} s</p>
              )}
              {h.team && (h.team.mates.length > 0 || h.cq) && (
                <div className="esc-spawnon">
                  <span className="hint">Revenir :</span>
                  <button
                    className={`btn btn-sm ${h.team.spawnOn === -1 ? "is-on" : ""}`}
                    onClick={() => send({ t: "spawnOn", target: -1 })}
                  >
                    À la base
                  </button>
                  {h.cq?.pts.map((p, k) => (
                    <button
                      key={`cq-${k}`}
                      className={`btn btn-sm ${h.team!.spawnOn === -2 - k ? "is-on" : ""}`}
                      disabled={p.owner !== h.myTeam}
                      title={p.owner !== h.myTeam ? "Ce drapeau n'est pas à ton équipe" : "Si personne ne l'attaque à ton retour"}
                      onClick={() => send({ t: "spawnOn", target: -2 - k })}
                    >
                      Sur {POINT_NAMES[k]}
                    </button>
                  ))}
                  {h.team.mates.map((mate) => (
                    <button
                      key={mate.i}
                      className={`btn btn-sm ${h.team!.spawnOn === mate.i ? "is-on" : ""}`}
                      disabled={!mate.alive}
                      title={mate.fight ? "Au combat : tu reviendras à la base tant qu'il se bat" : undefined}
                      onClick={() => send({ t: "spawnOn", target: mate.i })}
                    >
                      Auprès de {mate.name}
                      {mate.fight && mate.alive ? " · au combat" : ""}
                    </button>
                  ))}
                </div>
              )}
              {!forced && (
                <div className="esc-next">
                  {PRIMARY_IDS.filter((id) => has(weaponItem(id))).map((id) => (
                    <button key={id} className={`esc-next-btn ${h.next === id ? "is-on" : ""}`} onClick={() => pickNext(id)}>
                      <WeaponIcon weapon={id} size={84} camo={myCamo} />
                      <span>{WEAPONS[id].name}</span>
                    </button>
                  ))}
                </div>
              )}
              {v.settings.arsenal !== "pistolet" && SECONDARY_IDS.some((id) => id !== "pistolet" && has(weaponItem(id))) && (
                <div className="esc-next is-small">
                  {SECONDARY_IDS.filter((id) => has(weaponItem(id))).map((id) => (
                    <button
                      key={id}
                      className={`esc-next-btn ${h.nextSecondary === id ? "is-on" : ""}`}
                      onClick={() => pickNextSecondary(id)}
                    >
                      <WeaponIcon weapon={id} size={56} camo={myCamo} />
                      <span>{WEAPONS[id].name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {h.spectating && (
            <div className="esc-spec">
              Tu regardes {h.spectating} · {touch ? "touche" : "clique"} pour changer
            </div>
          )}

          {!touch && !h.locked && !menu && h.seated && h.alive && (
            <button className="esc-click" onClick={resume}>
              Clique pour prendre la souris et combattre
            </button>
          )}
          {h.board.length > 0 && <Board room={room} hud={h} />}
        </div>
      )}

      {touch && h && h.seated && h.alive && !over && !menu && <TouchPad rt={rt} hud={h} />}
      {touch && !over && (
        <div className="esc-touch-top">
          <button
            className="esc-mini"
            onClick={() => {
              const next = !board;
              setBoard(next);
              if (rt.current) rt.current.forceBoard = next;
            }}
            aria-label="Tableau des scores"
          >
            Scores
          </button>
          <button className="esc-mini" onClick={() => setMenu(true)} aria-label="Menu">
            Menu
          </button>
        </div>
      )}
      {!touch && !over && !menu && (
        // Au PC, le menu se voit aussi : un bouton (et Échap, qui rend la souris)
        <div className="esc-touch-top">
          <button
            className="esc-mini"
            onClick={() => {
              document.exitPointerLock?.();
              setMenu(true);
            }}
            aria-label="Menu (Échap)"
          >
            Menu <kbd>Échap</kbd>
          </button>
        </div>
      )}
      {touch && portrait && !over && <div className="esc-rotate">Tourne ton téléphone pour jouer couché</div>}

      {menu && !over && (
        <div className="esc-menu">
          <div className="esc-menu-card panel">
            <h2>Pause</h2>
            <p className="hint">La partie continue pendant ce temps : ton soldat reste là où il est.</p>
            {settings ? (
              <Settings touch={touch} onClose={() => setSettings(false)} />
            ) : sound ? (
              // Le son commun à tous les jeux (général, effets, musique et ambiance)
              <div className="esc-sound">
                <SoundSettings />
                <button className="btn btn-sm" onClick={() => setSound(false)}>
                  Fermer le réglage du son
                </button>
              </div>
            ) : (
              <div className="esc-menu-actions">
                <button className="btn btn-primary" onClick={resume}>
                  Reprendre le combat
                </button>
                <button className="btn" onClick={() => setSettings(true)}>
                  Réglages
                </button>
                <button className="btn" onClick={() => setSound(true)}>
                  Son
                </button>
                <button className="btn" onClick={onOpenChat}>
                  Discussion{unread > 0 ? ` (${unread})` : ""}
                </button>
                {!inTour && (
                  <button className="btn" onClick={onShowLobby}>
                    Voir le salon
                  </button>
                )}
                <ReportButton
                  look="button"
                  game="escarmouche"
                  variant={`Escarmouche, ${MODE_INFO[v.mode].name}, ${MAP_NAMES[v.map].name}`}
                  code={room.code}
                  role={room.you.seatId ? "player" : "watcher"}
                  onOpen={() => setMenu(false)}
                />
                <button className="btn btn-ghost" onClick={onLeave}>
                  {inTour ? "Quitter la tournée" : "Quitter la partie"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {over && <GameOver room={room} send={send} onLeave={onLeave} onShowLobby={onShowLobby} />}
    </div>
  );
}

/** Conquête : ce qui se passe au drapeau où l'on se tient */
function cqLabel(cq: NonNullable<HudState["cq"]>, team: number): string {
  const p = cq.pts[cq.inside];
  const name = POINT_NAMES[cq.inside] ?? "?";
  if (!p) return "";
  const side = team === 1 ? 1 : -1;
  if (p.owner === team && Math.abs(p.v - side) < 0.02) return `${name} est à vous`;
  const pct = Math.round(Math.abs(p.v) * 100);
  if (p.owner >= 0 && p.owner !== team) return `Neutralisation de ${name} · ${100 - pct} %`;
  if (p.owner === team) return `On vous prend ${name} : tenez bon !`;
  return Math.sign(p.v) === side ? `Prise de ${name} · ${pct} %` : `Neutralisation de ${name} · ${100 - pct} %`;
}
