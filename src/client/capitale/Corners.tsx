import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BUYABLE, MONOPOLY_GROUPS } from "../../shared/games/capitale/board.ts";
import type { MonopolyProgress } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { CapitaleRoomView, SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { AwayNote } from "../game/AwayNote.tsx";
import { TimerRing } from "../game/Seat.tsx";
import { colorOf, money } from "./boardUi.ts";
import { isMate, teamIn, TeamMark, TeamTag } from "./teamsUi.tsx";

// Les joueurs aux coins de l'écran, comme autour d'une vraie table : le nom sur un bandeau à sa couleur, l'argent en grand.
// Celui qui joue s'allume ; les sommes gagnées ou perdues montent de son portrait.

/** Un nombre qui défile jusqu'à sa nouvelle valeur */
export function Rolling({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{money(shown)}</>;
}

/** Les places autour de l'écran, dans l'ordre des joueurs : les quatre coins, puis les deux côtés */
const SPOTS = ["tl", "tr", "br", "bl", "ml", "mr"] as const;

export function Corners({
  g,
  room,
  seat,
  cash,
  deltas,
  serverOffset,
  turn,
  phone,
  dense = false,
  onPick,
  mono,
  onMonopoly,
  footer,
  onHeight,
}: {
  g: CapitaleView;
  room: CapitaleRoomView;
  seat: (id: string) => SeatView | undefined;
  cash: Record<string, number>;
  deltas: { id: number; player: string; amount: number }[];
  serverOffset: number;
  /** Le joueur dont c'est le tour, tel qu'on le montre */
  turn: string | null;
  phone: boolean;
  /** Téléphone couché à cinq ou six : les joueurs plus serrés, pour tenir en une colonne sur la hauteur de l'écran */
  dense?: boolean;
  /** Un clic sur un joueur : la caméra va voir son pion */
  onPick: (id: string) => void;
  /** Au Monopole : où en est le camp de chaque joueur (son équipe, ou lui) */
  mono: Record<string, MonopolyProgress> | null;
  /** Ouvrir le détail du Monopole */
  onMonopoly: () => void;
  /** Sous les joueurs, sur téléphone : les équipes */
  footer?: ReactNode;
  /** Sur téléphone, la hauteur des joueurs en haut (le plateau commence dessous) */
  onHeight?: (h: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!phone || !el || !onHeight) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [phone, onHeight]);
  return (
    <div className={`cap-corners ${phone ? "is-phone" : ""}${dense ? " is-dense" : ""}`} ref={box}>
      {g.players.map((p, k) => {
        const s = seat(p.id);
        const acting = g.actor === p.id;
        const titles = BUYABLE.filter((i) => g.deeds[i]!.owner === p.id).length;
        const color = colorOf(g, p.id);
        const team = teamIn(g, p.id);
        const mate = isMate(g, g.you, p.id);
        const progress = mono?.[p.id];
        return (
          <div
            key={p.id}
            className={`cap-corner at-${SPOTS[k % SPOTS.length]} ${turn === p.id ? "is-turn" : ""} ${p.bankrupt ? "is-out" : ""} ${p.id === g.you ? "is-me" : ""} ${mate ? "is-mate" : ""}`}
            style={{ ["--pawn" as string]: color }}
            role="button"
            tabIndex={0}
            title={p.bankrupt ? undefined : `Voir le pion de ${p.id === g.you ? "toi" : (s?.name ?? "ce joueur")} sur le plateau`}
            onClick={() => !p.bankrupt && onPick(p.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !p.bankrupt && onPick(p.id)}
          >
            <span className="cap-corner-avatar" data-cap-anchor={p.id}>
              {s && <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={dense ? 28 : phone ? 34 : 52} />}
              {team !== null && (
                <span className="cap-corner-team">
                  <TeamMark team={team} size={dense ? 13 : phone ? 15 : 20} />
                </span>
              )}
              {acting && room.deadline && (
                <span className="cap-corner-timer">
                  <TimerRing
                    size={dense ? 36 : phone ? 42 : 62}
                    deadline={room.deadline}
                    total={g.settings.turnSeconds}
                    offset={serverOffset}
                  />
                </span>
              )}
              <AnimatePresence>
                {deltas
                  .filter((d) => d.player === p.id)
                  .map((d) => (
                    <motion.span
                      key={d.id}
                      className={`cap-delta ${d.amount > 0 ? "is-plus" : "is-minus"}`}
                      initial={{ y: 6, opacity: 0, scale: 0.7 }}
                      animate={{ y: -30, opacity: 1, scale: 1.1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5 }}
                    >
                      {d.amount > 0 ? "+" : "−"}
                      {money(Math.abs(d.amount))}
                    </motion.span>
                  ))}
              </AnimatePresence>
            </span>
            <span className="cap-corner-body">
              <span className="cap-corner-name">
                {s?.name ?? "?"}
                {p.id === g.you && <em> (toi)</em>}
              </span>
              <span className="cap-corner-cash num">{p.bankrupt ? "faillite" : <Rolling value={cash[p.id] ?? p.cash} />}</span>
              {!phone && team !== null && (
                <span className="cap-corner-teamline">
                  <TeamTag team={team} />
                  {mate && <em className="cap-mate">avec toi</em>}
                </span>
              )}
              {phone && mate && <span className="cap-mate is-phone">avec toi</span>}
              {!phone && (
                <span className="cap-corner-meta">
                  {p.bankrupt
                    ? "hors jeu"
                    : [
                        `${titles} titre${titles > 1 ? "s" : ""}`,
                        p.inJail && "en prison",
                        p.jailCards.length > 0 && `${p.jailCards.length} carte${p.jailCards.length > 1 ? "s" : ""} sortie`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
              )}
              {!phone && progress && !p.bankrupt && <MonoChips progress={progress} onOpen={onMonopoly} />}
              {s && <AwayNote seat={s} serverOffset={serverOffset} compact />}
            </span>
            {turn === p.id && !p.bankrupt && <span className="cap-corner-arrow">{p.id === g.you ? "À toi !" : "joue"}</span>}
          </div>
        );
      })}
      {footer}
    </div>
  );
}

/** Au Monopole, où en est un camp : ses quartiers complets, son côté le plus avancé, ses gares ; en rouge à un titre */
export function MonoChips({ progress, onOpen }: { progress: MonopolyProgress; onOpen: () => void }) {
  const side = [...progress.sides].sort((a, b) => a.missing.length - b.missing.length || b.have - a.have)[0]!;
  const close = progress.winning.length > 0;
  return (
    <button
      type="button"
      className={`cap-mono-chips ${close ? "is-close" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title="Monopole : où en est chacun"
    >
      {close ? (
        <b>À un titre de gagner !</b>
      ) : (
        <>
          <span>
            Quartiers{" "}
            <b className="num">
              {Math.min(progress.groups.length, MONOPOLY_GROUPS)}/{MONOPOLY_GROUPS}
            </b>
          </span>
          <span>
            Côté{" "}
            <b className="num">
              {side.have}/{side.total}
            </b>
          </span>
          <span>
            Gares <b className="num">{progress.stations.have}/4</b>
          </span>
        </>
      )}
    </button>
  );
}
