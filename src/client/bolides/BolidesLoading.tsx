import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { getTrack, TRACKS } from "../../shared/games/bolides/track.ts";
import type { BolidesRoomView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { MOODS } from "./scene/sky.ts";

interface Props {
  room: BolidesRoomView;
  /** Où en est son chargement, de 0 à 1 */
  share: number;
  done: boolean;
  failed: boolean;
  phone: boolean;
  /** Son id de pilote (null : on regarde la course) */
  me: string | null;
  serverOffset: number;
  reduced: boolean;
  /** Le tracé sur la carte, et comment y placer un point */
  map: { path: string; to: (x: number, z: number) => readonly [number, number] };
  onLeave: () => void;
}

/** À partir de combien de secondes restantes on prévient que les feux vont partir quand même */
const WARN_LEFT_S = 12;
const TIP_MS = 4500;

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

/** Ce qu'on a le temps de lire en attendant */
function tipsFor(phone: boolean, items: boolean): string[] {
  return [
    phone ? "Au 2e feu, touche Dérapage : départ canon !" : "Au 2e feu, accélère : départ canon !",
    "Dérape longtemps : à chaque changement de couleur des étincelles, le turbo devient plus fort.",
    phone
      ? "En l'air, touche Dérapage : une figure, et un turbo en retombant."
      : "En l'air, appuie sur Espace : une figure, et un turbo en retombant.",
    "Reste juste derrière un pilote : son aspiration te lance.",
    "Chaque pièce te donne un peu de vitesse, jusqu'à dix.",
    ...(items
      ? [
          phone
            ? "Pour lancer un objet derrière toi, glisse le doigt vers le bas sur Objet."
            : "Pour lancer un objet derrière toi, garde ↓ enfoncé.",
        ]
      : []),
    phone ? "Bloqué ? Le drone arrive tout seul, ou touche Repartir." : "Bloqué ? Le drone arrive tout seul, ou appuie sur R.",
  ];
}

/** L'écran de chargement : le circuit se dessine pendant que le jeu se prépare, et on voit qui est prêt. Les feux attendent tout le monde. */
export function BolidesLoading({ room, share, done, failed, phone, me, serverOffset, reduced, map, onLeave }: Props) {
  const g = room.bolides!;
  const track = getTrack(g.track);
  const mood = MOODS[track.def.theme];
  const holding = g.phase === "loading";
  const tips = useMemo(() => tipsFor(phone, g.settings.items), [phone, g.settings.items]);
  const [tip, setTip] = useState(0);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const next = window.setInterval(() => setTip((i) => (i + 1) % tips.length), TIP_MS);
    return () => window.clearInterval(next);
  }, [tips.length]);

  // Le temps qu'il reste avant de partir sans les retardataires
  useEffect(() => {
    if (!holding) return;
    const tick = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(tick);
  }, [holding]);

  const pilots = g.racers.flatMap((r) => {
    const seat = room.seats.find((s) => s.id === r.id);
    return seat?.kind === "human" ? [{ r, seat }] : [];
  });
  const bots = g.racers.length - pilots.length;
  const waiting = holding ? pilots.filter(({ r }) => r.id !== me && !r.bot && !g.loaded.includes(r.id)) : [];
  const left = Math.ceil((g.loadUntil - clock - serverOffset) / 1000);

  let status: string;
  if (failed) status = "Impossible d'afficher la course sur cet appareil.";
  else if (!done) status = holding ? "Préparation du circuit…" : "Retour en piste…";
  else if (waiting.length === 0) status = "C'est parti !";
  else if (waiting.length <= 2) status = `On attend ${waiting.map((w) => w.seat.name).join(" et ")}…`;
  else status = `On attend ${waiting.length} pilotes…`;

  const kicker = [
    room.cup ? `Grand Prix, course ${room.cup.index + 1} sur ${room.cup.tracks.length}` : null,
    `${g.settings.laps} tours`,
    g.settings.items ? null : "sans objets",
  ]
    .filter(Boolean)
    .join(" · ");
  const percent = Math.round(share * 100);
  const at = Math.min(track.n - 1, Math.floor(share * track.n));
  const [dotX, dotY] = map.to(track.x[at]!, track.z[at]!);

  return (
    <motion.div
      className={`bolides-loading ${reduced ? "is-still" : ""}`}
      style={
        {
          "--load-top": hex(mood.top),
          "--load-mid": hex(mood.mid),
          "--load-low": hex(mood.ground),
        } as React.CSSProperties
      }
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.45 }}
    >
      <div className="bolides-loading-inner" role="status" aria-live="polite">
        <svg className="bolides-loading-map" viewBox="-6 -6 112 112" aria-hidden="true">
          <path d={map.path} className="bolides-loading-road" />
          <path
            d={map.path}
            className="bolides-loading-drawn"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 * (1 - share)}
          />
          <circle cx={dotX} cy={dotY} r="3.8" className="bolides-loading-dot" />
        </svg>
        <div className="bolides-loading-text">
          <span className="bolides-loading-kicker">{kicker}</span>
          <h2 className="bolides-loading-title">{TRACKS[g.track].name}</h2>
          {!failed && (
            <div className="bolides-loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <i style={{ transform: `scaleX(${share})` }} />
            </div>
          )}
          <p className="bolides-loading-status">
            {status}
            {!done && !failed && <span className="num"> {percent} %</span>}
          </p>
          {failed && (
            <button className="btn btn-primary" onClick={onLeave}>
              Quitter
            </button>
          )}
          {done && waiting.length > 0 && left > 0 && left <= WARN_LEFT_S && (
            <small className="bolides-loading-limit num">Départ dans {left} s quoi qu'il arrive</small>
          )}
          {holding && pilots.length > 0 && (
            <ul className="bolides-loading-grid">
              {pilots.map(({ r, seat }) => {
                const ready = g.loaded.includes(r.id) || (r.id === me && done);
                return (
                  <li key={r.id} className={ready ? "is-ready" : r.bot ? "is-gone" : ""}>
                    <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={phone ? 24 : 32} />
                    <span className="bolides-loading-name">{r.id === me ? "Toi" : seat.name}</span>
                    {ready ? <Icon name="check" size={16} /> : !r.bot && <span className="bolides-loading-wait" aria-hidden="true" />}
                  </li>
                );
              })}
              {bots > 0 && (
                <li className="is-bots">
                  + {bots} bot{bots > 1 ? "s" : ""}
                </li>
              )}
            </ul>
          )}
          {!failed && (
            <p key={tip} className="bolides-loading-tip">
              {tips[tip]}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
