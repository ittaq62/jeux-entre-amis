import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BUYABLE } from "../../shared/games/capitale/board.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { CapitaleRoomView, SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { AwayNote } from "../game/AwayNote.tsx";
import { TimerRing } from "../game/Seat.tsx";
import { colorOf, money } from "./boardUi.ts";

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
  onPick,
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
  /** Un clic sur un joueur : la caméra va voir son pion */
  onPick: (id: string) => void;
}) {
  return (
    <div className={`cap-corners ${phone ? "is-phone" : ""}`}>
      {g.players.map((p, k) => {
        const s = seat(p.id);
        const acting = g.actor === p.id;
        const titles = BUYABLE.filter((i) => g.deeds[i]!.owner === p.id).length;
        const color = colorOf(g, p.id);
        return (
          <div
            key={p.id}
            className={`cap-corner at-${SPOTS[k % SPOTS.length]} ${turn === p.id ? "is-turn" : ""} ${p.bankrupt ? "is-out" : ""} ${p.id === g.you ? "is-me" : ""}`}
            style={{ ["--pawn" as string]: color }}
            role="button"
            tabIndex={0}
            title={p.bankrupt ? undefined : `Voir le pion de ${p.id === g.you ? "toi" : (s?.name ?? "ce joueur")} sur le plateau`}
            onClick={() => !p.bankrupt && onPick(p.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !p.bankrupt && onPick(p.id)}
          >
            <span className="cap-corner-avatar" data-cap-anchor={p.id}>
              {s && <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={phone ? 34 : 52} />}
              {acting && room.deadline && (
                <span className="cap-corner-timer">
                  <TimerRing size={phone ? 42 : 62} deadline={room.deadline} total={g.settings.turnSeconds} offset={serverOffset} />
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
              {s && <AwayNote seat={s} serverOffset={serverOffset} compact />}
            </span>
            {turn === p.id && !p.bankrupt && <span className="cap-corner-arrow">{p.id === g.you ? "À toi !" : "joue"}</span>}
          </div>
        );
      })}
    </div>
  );
}
