import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import { ITEM_NAMES } from "../../shared/games/bolides/items.ts";
import { getTrack, TRACKS } from "../../shared/games/bolides/track.ts";
import type { BolidesClientMessage, BolidesRoomView } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { BOLIDES_SOUNDS, preloadSounds, unlockAudio } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { BolidesGameOver } from "./BolidesGameOver.tsx";
import { ItemIcon } from "./ItemIcon.tsx";
import { placeLabel, RaceRuntime, type Hud } from "./runtime.ts";
import { faceCanvas, headCanvas } from "./scene/faces.ts";
import { KART_COLORS } from "./scene/kart.ts";
import type { RaceListeners } from "./useBolidesRoom.ts";

interface Props {
  room: BolidesRoomView;
  send: (msg: BolidesClientMessage) => void;
  listeners: MutableRefObject<RaceListeners>;
  serverOffset: number;
  unread: number;
  onOpenChat: () => void;
  onShowLobby: () => void;
  onLeave: () => void;
}

const ITEM_ORDER = ["turbo", "huile", "petard", "bouclier", "fusee", "klaxon", "turbo3", "arc"] as const;

/** Un temps de course : 1:23.4 */
export function raceTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** La couleur de chaque pilote : celle de sa place à la table */
export function kartColor(room: BolidesRoomView, id: string): string {
  const i = room.seats.findIndex((s) => s.id === id);
  return KART_COLORS[(i < 0 ? 0 : i) % KART_COLORS.length]!;
}

/** La course : la scène 3D, l'affichage tête haute, les boutons sur téléphone, et les résultats à la fin. */
export function BolidesRace({ room, send, listeners, serverOffset, unread, onOpenChat, onShowLobby, onLeave }: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.bolides!;
  const box = useRef<HTMLDivElement>(null);
  const runtime = useRef<RaceRuntime | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [phone] = useState(() => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760);
  const sound = usePrefs((s) => s.sound);
  const engineOn = usePrefs((s) => s.bolidesEngine);
  const musicOn = usePrefs((s) => s.bolidesMusic);
  const setPrefs = usePrefs((s) => s.set);
  const reduced = usePrefs((s) => s.reducedEffects);
  const me = room.you.seatId && g.racers.some((r) => r.id === room.you.seatId) ? room.you.seatId : null;
  // Une nouvelle course (revanche) : on reconstruit tout
  const raceKey = `${g.track}-${g.goAt}`;

  useEffect(() => preloadSounds(BOLIDES_SOUNDS), []);

  useEffect(() => {
    let cancelled = false;
    const seats = g.racers.map((r) => room.seats.find((s) => s.id === r.id));
    // Pour chaque pilote : son visage pour l'étiquette, et la peau de sa tête en 3D (d'après son avatar)
    const avatars = g.racers.map((r, i) => seats[i]?.avatar ?? seededAvatar(r.id));
    void Promise.all([
      Promise.all(seats.map((s) => (s ? faceCanvas(s, 96) : Promise.resolve(null)))),
      Promise.all(avatars.map((a) => headCanvas(a).catch(() => null))),
    ]).then(([faces, heads]) => {
      if (cancelled || !box.current) return;
      const looks = g.racers.map((r, i) => ({
        color: kartColor(room, r.id),
        name: seats[i]?.name ?? "?",
        face: faces[i] ?? null,
        avatar: avatars[i]!,
        head: heads[i] ?? null,
        me: r.id === me,
      }));
      const rt = new RaceRuntime(box.current, g, looks, serverOffset, { phone, reduced, me, send, onHud: setHud });
      runtime.current = rt;
      if (import.meta.env.DEV) (window as unknown as { __bolides?: RaceRuntime }).__bolides = rt;
      listeners.current.onTick = (now, k, a, c) => rt.onTick(now, k, a, c);
      listeners.current.onEvents = (events) => rt.onEvents(events);
    });
    return () => {
      cancelled = true;
      runtime.current?.dispose();
      runtime.current = null;
      listeners.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceKey]);

  useEffect(() => {
    runtime.current?.setView(g, serverOffset);
  }, [g, serverOffset]);

  useEffect(() => {
    if (!g.ranking) setResultsHidden(false);
  }, [g.ranking]);

  // La petite carte : le tracé, ramené dans un carré
  const track = getTrack(g.track);
  const map = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < track.n; i++) {
      minX = Math.min(minX, track.x[i]!);
      maxX = Math.max(maxX, track.x[i]!);
      minZ = Math.min(minZ, track.z[i]!);
      maxZ = Math.max(maxZ, track.z[i]!);
    }
    const size = Math.max(maxX - minX, maxZ - minZ) + 30;
    const ox = (minX + maxX) / 2 - size / 2;
    const oz = (minZ + maxZ) / 2 - size / 2;
    const to = (x: number, z: number) => [((x - ox) / size) * 100, ((z - oz) / size) * 100] as const;
    const pts: string[] = [];
    for (let i = 0; i < track.n; i += 2) {
      const [x, z] = to(track.x[i]!, track.z[i]!);
      pts.push(`${x.toFixed(1)},${z.toFixed(1)}`);
    }
    return { path: `M${pts.join("L")}Z`, to, start: to(track.x[0]!, track.z[0]!) };
  }, [track]);

  const touch = (key: "left" | "right" | "drift" | "brake", on: boolean) => (e: ReactPointerEvent) => {
    e.preventDefault();
    unlockAudio();
    const rt = runtime.current;
    if (rt) rt.controls.touch[key] = on;
  };
  const useItem = (e: ReactPointerEvent) => {
    e.preventDefault();
    const rt = runtime.current;
    if (rt) rt.controls.touch.item += 1;
  };

  const over = g.phase === "over";
  const h = hud;
  const showItem = g.settings.items && me !== null;
  const rollingItem = h?.rolling ? ITEM_ORDER[Math.floor(performance.now() / 90) % ITEM_ORDER.length]! : null;

  return (
    <div className={`bolides-root ${phone ? "is-phone" : ""}`} onPointerDown={() => unlockAudio()}>
      <div ref={box} className="bolides-stage" />

      <header className="bolides-top">
        <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <Icon name="menu" />
        </button>
        <div className="bolides-top-actions">
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setPrefs({ sound: !sound })}
            aria-label={sound ? "Couper le son" : "Activer le son"}
          >
            <Icon name={sound ? "volume" : "mute"} />
          </button>
          <button className="btn btn-ghost btn-icon chat-toggle" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" />
            {unread > 0 && <span className="badge badge-red">{unread}</span>}
          </button>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="emote-catcher" onClick={() => setMenuOpen(false)} />
              <motion.div
                className="table-menu panel"
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
              >
                {!inTour && (
                  <button className="menu-item" onClick={() => (setMenuOpen(false), onShowLobby())}>
                    <Icon name="users" size={18} /> Voir le salon et les règles
                  </button>
                )}
                <button className="menu-item" onClick={() => setPrefs({ bolidesMusic: !musicOn })}>
                  <Icon name={musicOn ? "volume" : "mute"} size={18} /> {musicOn ? "Couper la musique" : "Remettre la musique"}
                </button>
                <button className="menu-item" onClick={() => setPrefs({ bolidesEngine: !engineOn })}>
                  <Icon name={engineOn ? "volume" : "mute"} size={18} />{" "}
                  {engineOn ? "Couper le bruit du moteur" : "Remettre le bruit du moteur"}
                </button>
                <button className="menu-item is-danger" onClick={onLeave}>
                  <Icon name="door" size={18} /> {inTour ? "Quitter la tournée" : "Quitter la course"}
                </button>
                {room.you.isAdmin && (
                  <ConfirmButton
                    className="menu-item is-danger"
                    confirm="Fermer la table pour tous ?"
                    onConfirm={() => send({ t: "close" })}
                  >
                    <Icon name="shield" size={18} /> Fermer la table (admin)
                  </ConfirmButton>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>

      {h && !reduced && <div className={`hud-speedlines ${h.boosting ? "is-on" : ""}`} aria-hidden="true" />}
      {h && (
        <div className="bolides-hud" aria-live="polite">
          {me && (
            <div className="hud-place">
              <strong className="num">{h.place === 1 ? "1" : h.place}</strong>
              <span>{h.place === 1 ? "er" : "e"}</span>
              <small className="num">/{h.total}</small>
            </div>
          )}
          {me && (
            <div className={`hud-coins ${h.coins >= 10 ? "is-full" : ""}`} aria-label={`${h.coins} pièces`}>
              <span className="hud-coin" aria-hidden="true" />
              <span className="num">{h.coins}</span>
            </div>
          )}
          <div className="hud-lap">
            <span className="hud-lap-label">
              Tour <strong className="num">{h.lap}</strong>/{h.laps}
            </span>
            <span className="hud-time num">{raceTime(h.raceMs)}</span>
          </div>
          {showItem && (
            <div className={`hud-item ${h.item || rollingItem ? "is-full" : ""} ${h.rolling ? "is-rolling" : ""}`}>
              {rollingItem ? (
                <ItemIcon item={rollingItem} size={phone ? 40 : 52} />
              ) : h.item ? (
                <ItemIcon item={h.item} size={phone ? 40 : 52} />
              ) : null}
              {h.item && !h.rolling && h.uses > 1 && <span className="hud-item-uses num">×{h.uses}</span>}
              {h.item && !h.rolling && !phone && <span className="hud-item-name">{ITEM_NAMES[h.item]}</span>}
            </div>
          )}

          <svg className="hud-map" viewBox="-6 -6 112 112" aria-hidden="true">
            <path d={map.path} className="hud-map-road" />
            <circle cx={map.start[0]} cy={map.start[1]} r="2.6" className="hud-map-start" />
            {h.map.map((k, i) => {
              const [x, y] = map.to(k.x, k.z);
              return <circle key={i} cx={x} cy={y} r={k.me ? 4.6 : 3.4} fill={k.color} className={k.me ? "is-me" : ""} />;
            })}
          </svg>
          {!phone && me && <div className="hud-speed num">{h.speed} km/h</div>}

          <AnimatePresence>
            {h.intro && (
              <motion.div className="hud-intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <span className="hud-intro-kicker">
                  {g.settings.laps} tours{g.settings.items ? "" : ", sans objets"}
                </span>
                <strong>{TRACKS[g.track].name}</strong>
                {!phone && me && (
                  <span className="hud-keys">
                    <kbd>↑</kbd> accélérer · <kbd>←</kbd>
                    <kbd>→</kbd> tourner · <kbd>Espace</kbd> déraper, figure en l'air · <kbd>E</kbd> objet
                  </span>
                )}
                {phone && me && (
                  <span className="hud-keys">
                    Le kart accélère tout seul : tourne, dérape (et fais une figure en l'air), touche l'objet pour t'en servir
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {h.countdown !== null && (
            <div className={`hud-lights ${h.countdown === 0 ? "is-go" : ""}`}>
              {[3, 2, 1].map((n) => (
                <span key={n} className={h.countdown !== null && h.countdown <= n ? "is-on" : ""} />
              ))}
              {h.countdown === 0 && <strong>Partez !</strong>}
            </div>
          )}

          <AnimatePresence>
            {h.banner && (
              <motion.div
                key={h.banner.key}
                className="hud-banner"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: [0.6, 1.1, 1], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 2.2, times: [0, 0.15, 0.25, 1] }}
              >
                {h.banner.text}
              </motion.div>
            )}
          </AnimatePresence>

          {h.wrongWay && <div className="hud-warning">Mauvais sens !</div>}
          {h.rocket && !h.wrongWay && <div className="hud-warning is-rocket">Une fusée arrive sur toi !</div>}
          {h.stuck && !h.wrongWay && (
            <div className="hud-hint">{phone ? "Coincé ? Touche Repartir" : "Coincé ? Appuie sur R pour repartir"}</div>
          )}
          {h.finished && !over && (
            <div className="hud-finished">
              Arrivé {placeLabel(h.finished.place)} en <span className="num">{raceTime(h.finished.ms)}</span>
              <small>On attend les autres…</small>
            </div>
          )}
        </div>
      )}

      {phone && me && !over && (
        <div className="bolides-pads">
          <div className="pads-steer">
            <button
              className="pad pad-left"
              onPointerDown={touch("left", true)}
              onPointerUp={touch("left", false)}
              onPointerLeave={touch("left", false)}
              onPointerCancel={touch("left", false)}
              aria-label="Tourner à gauche"
            >
              <Arrow dir={-1} />
            </button>
            <button
              className="pad pad-right"
              onPointerDown={touch("right", true)}
              onPointerUp={touch("right", false)}
              onPointerLeave={touch("right", false)}
              onPointerCancel={touch("right", false)}
              aria-label="Tourner à droite"
            >
              <Arrow dir={1} />
            </button>
          </div>
          <div className="pads-act">
            {h?.stuck ? (
              <button
                className="pad pad-small"
                onPointerDown={(e) => {
                  e.preventDefault();
                  runtime.current?.respawnNow();
                }}
              >
                Repartir
              </button>
            ) : (
              <button
                className="pad pad-small"
                onPointerDown={touch("brake", true)}
                onPointerUp={touch("brake", false)}
                onPointerLeave={touch("brake", false)}
                onPointerCancel={touch("brake", false)}
              >
                Frein
              </button>
            )}
            {g.settings.items && (
              <button className={`pad pad-item ${h?.item ? "is-full" : ""}`} onPointerDown={useItem} aria-label="Se servir de l'objet">
                {h?.item && !h.rolling ? <ItemIcon item={h.item} size={34} /> : <span>Objet</span>}
              </button>
            )}
            <button
              className="pad pad-drift"
              onPointerDown={touch("drift", true)}
              onPointerUp={touch("drift", false)}
              onPointerLeave={touch("drift", false)}
              onPointerCancel={touch("drift", false)}
            >
              Dérapage
            </button>
          </div>
        </div>
      )}

      {g.ranking && !resultsHidden && (
        <BolidesGameOver
          room={room}
          onRematch={() => send(room.you.isHost ? { t: "start" } : { t: "rematch" })}
          onLobby={onShowLobby}
          onLeave={onLeave}
          onInspect={() => setResultsHidden(true)}
        />
      )}
      {g.ranking && resultsHidden && (
        <button className="btn btn-primary bolides-results-back" onClick={() => setResultsHidden(false)}>
          Revoir les résultats
        </button>
      )}
    </div>
  );
}

/** La flèche d'un bouton pour tourner */
function Arrow({ dir }: { dir: -1 | 1 }) {
  return (
    <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true">
      <path
        d={dir < 0 ? "M27 7 11 20l16 13z" : "M13 7l16 13-16 13z"}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
