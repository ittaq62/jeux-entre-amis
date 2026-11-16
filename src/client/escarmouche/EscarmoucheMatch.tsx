import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { MAP_NAMES } from "../../shared/games/escarmouche/maps.ts";
import { isTeamMode, type KillWeapon } from "../../shared/games/escarmouche/match.ts";
import { MODE_INFO } from "../../shared/games/escarmouche/rules.ts";
import { B } from "../../shared/games/escarmouche/soldier.ts";
import { PRIMARY_IDS, SECONDARY_IDS, WEAPONS, type PrimaryId, type SecondaryId } from "../../shared/games/escarmouche/weapons.ts";
import { weaponItem } from "../../shared/shop.ts";
import type { EscarmoucheClientMessage, EscarmoucheRoomView } from "../../shared/protocol.ts";
import { ReportButton } from "../components/ReportButton.tsx";
import { unlockAudio } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { QUALITY_NAMES, type QualityPref } from "./scene/quality.ts";
import { useMyItems } from "../stores/shop.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TEAM_NAMES } from "./EscarmoucheLobby.tsx";
import { BattleRuntime, type HudState } from "./runtime.ts";
import { TEAM_HEX } from "./scene/EscScene.ts";
import type { BattleListeners } from "./useEscarmoucheRoom.ts";
import { WeaponIcon } from "./WeaponIcon.tsx";

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
        {inTour ? (
          <p className="tour-next-note">
            <span className="spinner" /> La tournée continue : le classement arrive.
          </p>
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
              {asked ? "En attente des autres" : "Revanche"}
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
      <label>
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={p.volume}
          onChange={(e) => p.set({ volume: Number(e.target.value), sound: true })}
        />
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
export function EscarmoucheMatch({ room, send, listeners, unread, onOpenChat, onShowLobby, onLeave }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rt = useRef<BattleRuntime | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [board, setBoard] = useState(false);
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const { has } = useMyItems();
  const v = room.escarmouche!;
  const over = room.status === "finished" || v.phase === "over";
  const mapKey = `${v.map}:${room.escarmouche?.liveAt}:${room.code}`;
  // Changer la qualité refait l'image tout de suite (la partie, elle, continue)
  const quality = usePrefs((p) => p.escQuality);
  const roomRef = useRef(room);
  roomRef.current = room;

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
    return () => {
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
            <div className="esc-goal hint">
              {MODE_INFO[v.mode].short} · objectif {v.goal} {MODE_INFO[v.mode].unit}
              {h.zone &&
                (h.zone.contested
                  ? " · zone disputée"
                  : h.zone.owner >= 0
                    ? ` · zone aux ${TEAM_NAMES[h.zone.owner as 0 | 1]}`
                    : " · zone libre")}
            </div>
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
          {h.aimed && h.alive && <div className="esc-aimed">{h.aimed}</div>}
          {h.scoped && <div className="esc-scope" />}
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
              </div>
              <div className="esc-ammo">
                <span className="esc-ammo-name">{WEAPONS[h.weapon].name}</span>
                <span className="num esc-ammo-mag">
                  {h.mag}
                  <small> / {h.res}</small>
                </span>
                <span className="esc-ammo-nade">{h.grenades > 0 ? "● grenade" : "○ grenade"}</span>
                {h.reloading >= 0 && (
                  <span className="esc-reload">
                    <span style={{ width: `${Math.round(h.reloading * 100)}%` }} />
                  </span>
                )}
                {h.mag === 0 && h.reloading < 0 && (
                  <span className="esc-warn">
                    {h.res > 0 ? (touch ? "Recharge !" : "R pour recharger") : "Plus de munitions : change d'arme"}
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
              <p className="hint">Retour au combat dans {Math.ceil(h.back)} s</p>
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

          {!touch && !h.locked && !menu && h.seated && (
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
      {touch && portrait && !over && <div className="esc-rotate">Tourne ton téléphone pour jouer couché</div>}

      {menu && !over && (
        <div className="esc-menu">
          <div className="esc-menu-card panel">
            <h2>Pause</h2>
            <p className="hint">La partie continue pendant ce temps : ton soldat reste là où il est.</p>
            {settings ? (
              <Settings touch={touch} onClose={() => setSettings(false)} />
            ) : (
              <div className="esc-menu-actions">
                <button className="btn btn-primary" onClick={resume}>
                  Reprendre le combat
                </button>
                <button className="btn" onClick={() => setSettings(true)}>
                  Réglages
                </button>
                <button className="btn" onClick={onOpenChat}>
                  Discussion{unread > 0 ? ` (${unread})` : ""}
                </button>
                <button className="btn" onClick={onShowLobby}>
                  Voir le salon
                </button>
                <button className="btn btn-ghost" onClick={onLeave}>
                  Quitter la partie
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
