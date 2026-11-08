import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import { SKIN_IDS, skinUnlocked, SKINS, VEHICLE_IDS, vehicleUnlocked, VEHICLES } from "../../shared/games/bolides/garage.ts";
import { ITEM_NAMES, ITEM_TIPS } from "../../shared/games/bolides/items.ts";
import { getTrack, TRACKS } from "../../shared/games/bolides/track.ts";
import type { BolidesClientMessage, BolidesRoomView } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { BOLIDES_SOUNDS, preloadSounds, unlockAudio } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { BolidesGameOver } from "./BolidesGameOver.tsx";
import { BolidesLoading } from "./BolidesLoading.tsx";
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

const ITEM_ORDER = [
  "turbo",
  "tarte",
  "huile",
  "bowling",
  "petard",
  "bombe",
  "bouclier",
  "fusee",
  "klaxon",
  "ressort",
  "turbo3",
  "aimant",
  "arc",
  "geant",
  "orage",
] as const;

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

/** Au-delà, les pilotes dont la photo n'arrive pas gardent une étiquette sans visage */
const FACES_LIMIT_MS = 5000;
/** Tant que le serveur n'a pas noté qu'on est prêt, on le lui répète à ce rythme */
const LOADED_AGAIN_MS = 1500;

/** Ne pas attendre plus que ça : passé ce délai, on continue avec `fallback` */
function withLimit<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([work, new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms))]);
}

/** Le temps de la cérémonie, et celui du fondu qui nous y emmène */
const PODIUM_MS = 7000;
const PODIUM_FADE_MS = 650;

/** Ce qu'on annonce pendant la cérémonie */
function podiumTitle(room: BolidesRoomView): string {
  const g = room.bolides!;
  const me = room.you.seatId;
  const cup = room.cup?.over ? room.cup : null;
  const first = cup ? Object.entries(cup.points).sort((a, b) => b[1] - a[1])[0]?.[0] : g.ranking?.[0];
  const name = room.seats.find((s) => s.id === first)?.name ?? "?";
  if (first === me) return cup ? "Tu remportes le Grand Prix !" : "Victoire !";
  return `${name} ${cup ? "remporte le Grand Prix" : "gagne la course"} !`;
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
  // Les résultats attendent la fin de la cérémonie (sauf si on arrive alors que la course est déjà finie)
  const [sheetReady, setSheetReady] = useState(() => g.ranking != null);
  const canSkip = useRef(0);
  const [phone] = useState(() => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760);
  const sound = usePrefs((s) => s.sound);
  const engineOn = usePrefs((s) => s.bolidesEngine);
  const musicOn = usePrefs((s) => s.bolidesMusic);
  const autoItem = usePrefs((s) => s.bolidesAutoItem);
  const assist = usePrefs((s) => s.bolidesAssist);
  const setPrefs = usePrefs((s) => s.set);
  const reduced = usePrefs((s) => s.reducedEffects);
  const me = room.you.seatId && g.racers.some((r) => r.id === room.you.seatId) ? room.you.seatId : null;
  // Une nouvelle course (revanche) : on reconstruit tout
  const raceKey = `${g.track}-${g.createdAt}`;
  // Où en est le chargement de cette course-ci (une revanche repart de zéro)
  const [loadState, setLoadState] = useState({ key: raceKey, share: 0, done: false, failed: false });
  const load = loadState.key === raceKey ? loadState : { key: raceKey, share: 0, done: false, failed: false };
  // Ce que la table est devenue pendant le chargement
  const latest = useRef({ g, serverOffset });
  latest.current = { g, serverOffset };

  useEffect(() => preloadSounds(BOLIDES_SOUNDS), []);

  // Ce que cette course a débloqué : on compare à ce qu'on avait au départ
  const startProgress = useRef(room.garage?.progress ?? null);
  useEffect(() => {
    startProgress.current = room.garage?.progress ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceKey]);
  const progressNow = room.garage?.progress ?? null;
  const unlocks = useMemo(() => {
    const before = startProgress.current;
    if (!before || !progressNow) return [];
    return [
      ...VEHICLE_IDS.filter((id) => !vehicleUnlocked(id, before) && vehicleUnlocked(id, progressNow)).map((id) => VEHICLES[id].name),
      ...SKIN_IDS.filter((id) => !skinUnlocked(id, before) && skinUnlocked(id, progressNow)).map((id) => `le skin ${SKINS[id].name}`),
    ];
  }, [progressNow]);

  useEffect(() => {
    let cancelled = false;
    let built: RaceRuntime | null = null;
    const report = (share: number) => {
      if (!cancelled) setLoadState({ key: raceKey, share, done: false, failed: false });
    };
    setHud(null);
    report(0);
    const seats = g.racers.map((r) => room.seats.find((s) => s.id === r.id));
    // Pour chaque pilote : son visage pour l'étiquette, et la peau de sa tête en 3D (d'après son avatar)
    const avatars = g.racers.map((r, i) => seats[i]?.avatar ?? seededAvatar(r.id));
    const prepare = async () => {
      const [faces, heads] = await Promise.all([
        withLimit(Promise.all(seats.map((s) => (s ? faceCanvas(s, 96) : Promise.resolve(null)))), FACES_LIMIT_MS, []),
        Promise.all(avatars.map((a) => headCanvas(a).catch(() => null))),
      ]);
      if (cancelled || !box.current) return;
      report(0.06);
      const looks = g.racers.map((r, i) => ({
        color: kartColor(room, r.id),
        name: seats[i]?.name ?? "?",
        face: faces[i] ?? null,
        avatar: avatars[i]!,
        head: heads[i] ?? null,
        vehicle: r.vehicle ?? "kart",
        skin: r.skin ?? "usine",
        me: r.id === me,
      }));
      const rt = new RaceRuntime(box.current, g, looks, latest.current.serverOffset, { phone, reduced, me, send, onHud: setHud });
      built = rt;
      await rt.prepare((share) => report(0.06 + share * 0.94));
      if (cancelled) return;
      runtime.current = rt;
      if (import.meta.env.DEV) (window as unknown as { __bolides?: RaceRuntime }).__bolides = rt;
      rt.setView(latest.current.g, latest.current.serverOffset);
      listeners.current.onTick = (now, k, a, c) => rt.onTick(now, k, a, c);
      listeners.current.onEvents = (events) => rt.onEvents(events);
      setLoadState({ key: raceKey, share: 1, done: true, failed: false });
    };
    prepare().catch((err: unknown) => {
      if (cancelled) return;
      console.error("Course impossible à préparer", err);
      setLoadState({ key: raceKey, share: 1, done: true, failed: true });
    });
    return () => {
      cancelled = true;
      built?.dispose();
      runtime.current = null;
      listeners.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceKey]);

  useEffect(() => {
    runtime.current?.setView(g, serverOffset);
  }, [g, serverOffset]);

  // Le jeu est prêt : on le dit au serveur, qui allume les feux quand tout le monde l'est (et on le redit au cas où le
  // message se perdrait dans une coupure)
  const tellLoaded = g.phase === "loading" && load.done && me !== null && !g.loaded.includes(me);
  useEffect(() => {
    if (!tellLoaded) return;
    const tell = () => send({ t: "loaded", race: g.createdAt });
    tell();
    const again = window.setInterval(tell, LOADED_AGAIN_MS);
    return () => window.clearInterval(again);
  }, [tellLoaded, g.createdAt, send]);

  // Une seule fois par course : `g.ranking` change d'objet à chaque nouvelle de la table, pas ce booléen
  const finished = g.ranking != null;
  useEffect(() => {
    if (!g.ranking) {
      setResultsHidden(false);
      setSheetReady(false);
      return;
    }
    // Arrivé alors que tout était fini (page rechargée) : pas de cérémonie. Dans une tournée non plus, elle a la sienne
    if (sheetReady) return;
    if (inTour) {
      setSheetReady(true);
      return;
    }
    // La cérémonie du Grand Prix suit le classement général, celle d'une course l'arrivée
    const cupOver = room.cup?.over === true;
    const order = cupOver
      ? Object.entries(room.cup!.points)
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id)
      : g.ranking;
    canSkip.current = performance.now() + PODIUM_FADE_MS + 900;
    const start = window.setTimeout(() => runtime.current?.startPodium(order), PODIUM_FADE_MS);
    const sheet = window.setTimeout(() => setSheetReady(true), PODIUM_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(sheet);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // Passer la cérémonie : une touche ou un clic, mais pas ceux qu'on donnait encore en finissant la course
  const skipPodium = () => {
    if (performance.now() >= canSkip.current) setSheetReady(true);
  };
  useEffect(() => {
    if (!g.ranking || sheetReady) return;
    window.addEventListener("keydown", skipPodium);
    return () => window.removeEventListener("keydown", skipPodium);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.ranking, sheetReady]);

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
  /** Se servir de l'objet ; `flip` : dans l'autre sens */
  const fireItem = (flip: boolean) => {
    const rt = runtime.current;
    if (!rt) return;
    rt.controls.touch.item += 1;
    rt.controls.touch.flip = flip;
  };
  // Le bouton Objet : un appui s'en sert, glisser le doigt vers le bas l'envoie de l'autre côté
  const itemPress = useRef<{ id: number; y: number; done: boolean; timer: number } | null>(null);
  const itemDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    capture(e);
    const press = { id: e.pointerId, y: e.clientY, done: false, timer: 0 };
    press.timer = window.setTimeout(() => {
      if (press.done) return;
      press.done = true;
      fireItem(false);
    }, 170);
    itemPress.current = press;
  };
  const itemMove = (e: ReactPointerEvent) => {
    const p = itemPress.current;
    if (!p || p.done || p.id !== e.pointerId || e.clientY - p.y < 26) return;
    p.done = true;
    window.clearTimeout(p.timer);
    fireItem(true);
  };
  const itemUp = (e: ReactPointerEvent) => {
    const p = itemPress.current;
    if (!p || p.id !== e.pointerId) return;
    window.clearTimeout(p.timer);
    if (!p.done) fireItem(false);
    itemPress.current = null;
  };
  // Pendant un dérapage, le pouce est déjà sur le bouton : le glisser vers le haut sert l'objet sans lâcher le dérapage
  const driftPress = useRef<{ id: number; y: number; fired: boolean } | null>(null);
  const driftDown = (e: ReactPointerEvent) => {
    touch("drift", true)(e);
    capture(e);
    driftPress.current = { id: e.pointerId, y: e.clientY, fired: false };
  };
  const driftMove = (e: ReactPointerEvent) => {
    const p = driftPress.current;
    if (!p || p.id !== e.pointerId) return;
    const dy = e.clientY - p.y;
    if (p.fired) {
      if (Math.abs(dy) < 10) p.fired = false;
      return;
    }
    if (Math.abs(dy) < 30) return;
    p.fired = true;
    fireItem(dy > 0);
  };
  // Toucher le milieu de l'écran (ou cliquer sur la course, à la souris) sert aussi l'objet
  const stageDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!me || g.phase === "over" || !g.settings.items || e.button !== 0) return;
    if (phone) {
      const box = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width;
      if (x < 0.28 || x > 0.72) return;
    }
    fireItem(false);
  };

  const over = g.phase === "over";
  const loading = !over && (!load.done || load.failed || g.phase === "loading");
  const h = loading ? null : hud;
  const showItem = g.settings.items && me !== null;
  const rollingItem = h?.rolling ? ITEM_ORDER[Math.floor(performance.now() / 90) % ITEM_ORDER.length]! : null;

  return (
    <div className={`bolides-root ${phone ? "is-phone" : ""}`} onPointerDown={() => unlockAudio()}>
      <div ref={box} className="bolides-stage" onPointerDown={stageDown} />

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
                {/* Pas pendant le chargement : les feux attendraient quelqu'un parti regarder le salon */}
                {!inTour && !loading && (
                  <button className="menu-item" onClick={() => (setMenuOpen(false), onShowLobby())}>
                    <Icon name="users" size={18} /> Voir le salon et les règles
                  </button>
                )}
                <button className="menu-item" onClick={() => setPrefs({ bolidesAutoItem: !autoItem })}>
                  <Icon name={autoItem ? "check" : "close"} size={18} />{" "}
                  {autoItem ? "Objets automatiques : oui" : "Objets automatiques : non"}
                </button>
                <button className="menu-item" onClick={() => setPrefs({ bolidesAssist: !assist })}>
                  <Icon name={assist ? "check" : "close"} size={18} /> {assist ? "Conduite assistée : oui" : "Conduite assistée : non"}
                </button>
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

      <AnimatePresence>
        {loading && (
          <BolidesLoading
            key={raceKey}
            room={room}
            share={load.share}
            done={load.done}
            failed={load.failed}
            phone={phone}
            me={me}
            serverOffset={serverOffset}
            reduced={reduced}
            map={map}
            onLeave={onLeave}
          />
        )}
      </AnimatePresence>

      {g.ranking && !sheetReady && !inTour && (
        <>
          <div className="bolides-podium-fade" aria-hidden="true" />
          <button className="bolides-podium" onClick={skipPodium}>
            <span className="bolides-podium-title">{podiumTitle(room)}</span>
            <small>{phone ? "Touche l'écran pour voir les résultats" : "Clique pour voir les résultats"}</small>
          </button>
        </>
      )}
      {h && !reduced && <div className={`hud-speedlines ${h.boosting ? "is-on" : h.drafting ? "is-draft" : ""}`} aria-hidden="true" />}
      {h && <div className={`hud-pie ${h.pie ? "is-on" : ""}`} aria-hidden="true" />}
      {h && h.flash > 0 && !reduced && <div key={h.flash} className="hud-flash" aria-hidden="true" />}
      {h && !over && (
        <div className="bolides-hud" aria-live="polite">
          {me && (
            <div className="hud-place">
              {/* La place rebondit quand elle change (on double, ou on se fait doubler) */}
              <motion.strong
                key={h.place}
                className="num"
                initial={reduced ? false : { scale: 1.7 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 13 }}
                style={{ display: "inline-block", transformOrigin: "left bottom" }}
              >
                {h.place}
              </motion.strong>
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
          {h.feed.length > 0 && (
            <div className="hud-feed">
              {h.feed.map((l) => (
                <div key={l.key} className={`hud-feed-line ${l.mine ? "is-mine" : ""}`}>
                  {l.text}
                </div>
              ))}
            </div>
          )}
          <div className="hud-lap">
            <span className="hud-lap-label">
              Tour <strong className="num">{h.lap}</strong>/{h.laps}
            </span>
            <span className="hud-time num">{raceTime(h.raceMs)}</span>
          </div>
          {showItem && (
            <div className="hud-slots">
              {(h.item2 || (h.rolling && h.rollSlot === 2)) && (
                <div className={`hud-item2 ${h.rolling && h.rollSlot === 2 ? "is-rolling" : ""}`} title="En réserve">
                  {h.rolling && h.rollSlot === 2 && rollingItem ? (
                    <ItemIcon item={rollingItem} size={phone ? 24 : 30} />
                  ) : h.item2 ? (
                    <ItemIcon item={h.item2} size={phone ? 24 : 30} />
                  ) : null}
                </div>
              )}
              <button
                key={h.nudge}
                type="button"
                className={`hud-item ${h.item || (h.rolling && h.rollSlot === 1) ? "is-full" : ""} ${
                  h.rolling && h.rollSlot === 1 ? "is-rolling" : ""
                } ${h.nudge > 0 ? "is-nudged" : ""}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  unlockAudio();
                  fireItem(false);
                }}
                aria-label={h.item ? `Utiliser : ${ITEM_NAMES[h.item]}` : "Aucun objet"}
              >
                {h.rolling && h.rollSlot === 1 && rollingItem ? (
                  <ItemIcon item={rollingItem} size={phone ? 40 : 52} />
                ) : h.item ? (
                  <ItemIcon item={h.item} size={phone ? 40 : 52} />
                ) : null}
                {h.item && !(h.rolling && h.rollSlot === 1) && h.uses > 1 && <span className="hud-item-uses num">×{h.uses}</span>}
                {!phone && h.item && !(h.rolling && h.rollSlot === 1) && <kbd className="hud-item-key">E</kbd>}
              </button>
            </div>
          )}

          <AnimatePresence>
            {h.tip && (
              <motion.div
                key={h.tip.key}
                className="hud-tip"
                initial={reduced ? false : { y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                <ItemIcon item={h.tip.item} size={phone ? 26 : 34} />
                <span>
                  <strong>{ITEM_NAMES[h.tip.item]}</strong>
                  {h.tip.long && <small>{ITEM_TIPS[h.tip.item]}</small>}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {!phone && h.order.length > 1 && (
            <ol className="hud-order" aria-hidden="true">
              {h.order.map((o, i) => (
                <motion.li key={o.id} layout={reduced ? false : "position"} transition={{ duration: 0.2 }} className={o.me ? "is-me" : ""}>
                  <span className="num">{i + 1}</span>
                  <i style={{ background: o.color }} />
                  <span className="hud-order-name">{o.name}</span>
                </motion.li>
              ))}
            </ol>
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
                    <kbd>→</kbd> tourner · <kbd>Espace</kbd> déraper, figure en l'air · <kbd>E</kbd> ou un clic : objet (avec <kbd>↓</kbd> :
                    derrière toi) · <kbd>B</kbd> regarder derrière
                  </span>
                )}
                {phone && me && (
                  <span className="hud-keys">
                    Le kart accélère tout seul. L'objet : touche le gros bouton ou le milieu de l'écran, ou glisse le pouce vers le haut sur
                    Dérapage
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
          {me && h.countdown !== null && h.countdown > 0 && (
            <div className="hud-start-hint">
              {phone ? "Appuie sur Dérapage au dernier feu" : "Accélère au dernier feu"} pour un départ canon !
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
          {h.incoming && !h.wrongWay && (
            <div className="hud-warning is-rocket">
              {h.incoming === "fusee" ? "Une fusée arrive sur toi !" : "Une tarte arrive sur toi !"}
            </div>
          )}
          {h.stuck && !h.wrongWay && (
            <div className="hud-hint">
              {phone ? "Bloqué ? Le drone arrive, ou touche Repartir" : "Bloqué ? Le drone arrive, ou appuie sur R"}
            </div>
          )}
          {h.finished && !over && (
            <div className="hud-finished">
              Arrivé {placeLabel(h.finished.place)} en <span className="num">{raceTime(h.finished.ms)}</span>
              <small>On attend les autres…</small>
            </div>
          )}
        </div>
      )}

      {phone && me && !over && !loading && (
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
              <button
                className={`pad pad-item ${h?.item && !(h.rolling && h.rollSlot === 1) ? "is-full" : ""}`}
                onPointerDown={itemDown}
                onPointerMove={itemMove}
                onPointerUp={itemUp}
                onPointerCancel={itemUp}
                aria-label="Se servir de l'objet"
              >
                {h?.item && !(h.rolling && h.rollSlot === 1) ? <ItemIcon item={h.item} size={56} /> : <span>Objet</span>}
              </button>
            )}
            <button
              className="pad pad-drift"
              onPointerDown={driftDown}
              onPointerMove={driftMove}
              onPointerUp={touch("drift", false)}
              onPointerLeave={touch("drift", false)}
              onPointerCancel={touch("drift", false)}
            >
              <span className="pad-drift-label">
                Dérapage
                {h?.item && <small>↑ objet</small>}
              </span>
            </button>
          </div>
        </div>
      )}

      {g.ranking && sheetReady && !resultsHidden && (
        <BolidesGameOver
          room={room}
          onRematch={() => send(room.you.isHost ? { t: "start" } : { t: "rematch" })}
          onLobby={onShowLobby}
          onLeave={onLeave}
          onInspect={() => setResultsHidden(true)}
          unlocks={unlocks}
        />
      )}
      {g.ranking && sheetReady && resultsHidden && (
        <button className="btn btn-primary bolides-results-back" onClick={() => setResultsHidden(false)}>
          Revoir les résultats
        </button>
      )}
    </div>
  );
}

/** Garder le doigt sur ce bouton même s'il glisse (sans danger si le doigt vient de se lever) */
function capture(e: ReactPointerEvent) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // déjà levé
  }
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
