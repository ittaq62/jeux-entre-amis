import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect } from "react";
import { BUYABLE } from "../../shared/games/capitale/board.ts";
import type { CapitaleRoomView } from "../../shared/protocol.ts";
import { rankingPoints } from "../../shared/ranking.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { money } from "./boardUi.ts";

interface Props {
  room: CapitaleRoomView;
  onRematch: () => void;
  onLobby: () => void;
  onLeave: () => void;
  onInspect: () => void;
}

const sheetIn = {
  initial: { y: 24, opacity: 0, rotate: -1.5 },
  animate: { y: 0, opacity: 1, rotate: -0.6 },
  transition: { duration: 0.35, ease: [0.2, 0.8, 0.3, 1] as const, delay: 1.1 },
};

/** Fin de partie : le bilan des fortunes, comme la feuille de marque du UNO. */
export function CapitaleGameOver({ room, onRematch, onLobby, onLeave, onInspect }: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.capitale!;
  const ranks = g.ranks ?? {};
  const ranking = g.ranking ?? [];
  const me = room.you.seatId;
  const won = me !== null && ranks[me] === 1;
  const reduced = usePrefs((s) => s.reducedEffects);
  const seatOf = (id: string) => room.seats.find((s) => s.id === id);
  const winners = ranking.filter((id) => ranks[id] === 1);

  useEffect(() => {
    if (!won || reduced) return;
    const t = setTimeout(() => {
      const colors = ["#e2bd6e", "#f4ecda", "#2fa864", "#e0463c"];
      confetti({ particleCount: 110, spread: 80, startVelocity: 40, origin: { y: 0.35 }, colors, scalar: 0.9 });
    }, 1200);
    return () => clearTimeout(t);
  }, [won, reduced]);

  const placed = ranking.map((id) => ({ id, rank: ranks[id] ?? ranking.length, isBot: seatOf(id)?.kind !== "human" }));
  const mine = placed.find((p) => p.id === me && !p.isBot);
  const earned = mine ? rankingPoints(placed, mine) : null;
  const names = winners.map((id) => seatOf(id)?.name ?? "?").join(" et ");
  const title = won ? "Fortune faite !" : `${names} ${winners.length > 1 ? "remportent" : "remporte"} la partie.`;
  const voted = room.rematch.includes(room.you.userId);

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
      <motion.div className="score-sheet paper gameover cap-log" {...sheetIn}>
        <div className="gameover-head">
          {winners[0] && seatOf(winners[0]) && (
            <Avatar avatar={seatOf(winners[0])!.avatar} userId={seatOf(winners[0])!.userId} photo={seatOf(winners[0])!.photo} size={64} />
          )}
          <div>
            <h2>{title}</h2>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              Capitale, {g.settings.end === "timed" ? `partie de ${g.settings.minutes} minutes` : "jusqu'à la faillite"}, {g.round} tour
              {g.round > 1 ? "s" : ""}
            </p>
            {earned !== null &&
              (earned > 0 ? (
                <p className="gameover-points">
                  <strong className="num">+{earned}</strong> points au classement
                </p>
              ) : (
                <p className="gameover-points">Pas de point au classement cette fois.</p>
              ))}
            <EloLine result={room.results?.[room.you.userId]} />
          </div>
        </div>

        <ol className="score-lines">
          {ranking.map((id) => {
            const seat = seatOf(id);
            const p = g.players.find((x) => x.id === id)!;
            const titles = BUYABLE.filter((i) => g.deeds[i]!.owner === id).length;
            return (
              <li key={id} className={`${ranks[id] === 1 ? "is-winner" : ""} ${id === me ? "is-me" : ""} ${p.bankrupt ? "is-out" : ""}`}>
                <span className="score-rank num">{ranks[id]}</span>
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={28} />}
                <span className="score-name">
                  {seat?.name}
                  {seat?.admin && <AdminBadge />}
                </span>
                <span className="cap-log-stats">
                  <span className="num">{p.bankrupt ? "faillite" : money(p.stats.netWorth)}</span>
                  <span className="hint">
                    {money(p.stats.rentEarned)} de loyers · {titles} titre{titles > 1 ? "s" : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {inTour && (
          <p className="tour-next-note">
            <span className="spinner" /> La tournée continue : le classement arrive.
          </p>
        )}
        <div className="overlay-actions">
          {inTour ? null : room.you.isHost ? (
            <button className="btn btn-primary btn-lg" onClick={onRematch}>
              Rejouer
            </button>
          ) : me ? (
            <button className="btn btn-primary btn-lg" onClick={onRematch} disabled={voted}>
              {voted ? "Revanche demandée" : "Demander la revanche"}
            </button>
          ) : null}
          <button className="btn" onClick={onInspect}>
            Voir le plateau
          </button>
          {!inTour && (
            <button className="btn" onClick={onLobby}>
              {room.you.isHost ? "Changer les règles" : "Voir la table"}
            </button>
          )}
          {!inTour && (
            <button className="btn btn-ghost" onClick={onLeave}>
              Quitter
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
