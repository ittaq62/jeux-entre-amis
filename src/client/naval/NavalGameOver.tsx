import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect } from "react";
import type { NavalRoomView } from "../../shared/protocol.ts";
import { rankingPoints } from "../../shared/ranking.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { TEAM_NAMES } from "./NavalLobby.tsx";

interface Props {
  room: NavalRoomView;
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

/** Fin de bataille : le journal de bord, comme la feuille de marque du UNO. */
export function NavalGameOver({ room, onRematch, onLobby, onLeave, onInspect }: Props) {
  const g = room.naval!;
  const ranks = g.ranks ?? {};
  const ranking = g.ranking ?? [];
  const me = room.you.seatId;
  const won = me !== null && ranks[me] === 1;
  const reduced = usePrefs((s) => s.reducedEffects);
  const seatOf = (id: string) => room.seats.find((s) => s.id === id);
  const winners = ranking.filter((id) => ranks[id] === 1);
  const winnerTeam = g.mode === "teams" ? g.players.find((p) => p.id === winners[0])?.team : null;

  useEffect(() => {
    if (!won || reduced) return;
    const t = setTimeout(() => {
      const colors = ["#e2bd6e", "#f4ecda", "#2c7be5", "#e0463c"];
      confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.35 }, colors, scalar: 0.9 });
    }, 1200);
    return () => clearTimeout(t);
  }, [won, reduced]);

  const placed = ranking.map((id) => ({ id, rank: ranks[id] ?? ranking.length, isBot: seatOf(id)?.kind !== "human" }));
  const mine = placed.find((p) => p.id === me && !p.isBot);
  const earned = mine ? rankingPoints(placed, mine) : null;
  const names = winners.map((id) => seatOf(id)?.name ?? "?").join(" et ");
  const title =
    winnerTeam !== null && winnerTeam !== undefined
      ? won
        ? `Victoire de ${TEAM_NAMES[winnerTeam]} !`
        : `${TEAM_NAMES[winnerTeam]} remporte la bataille.`
      : won
        ? "Victoire, amiral !"
        : `${names} remporte la bataille.`;
  const voted = room.rematch.includes(room.you.userId);

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
      <motion.div className="score-sheet paper gameover naval-log" {...sheetIn}>
        <div className="gameover-head">
          {winners[0] && seatOf(winners[0]) && (
            <Avatar avatar={seatOf(winners[0])!.avatar} userId={seatOf(winners[0])!.userId} photo={seatOf(winners[0])!.photo} size={64} />
          )}
          <div>
            <h2>{title}</h2>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              Bataille navale, {g.mode === "duel" ? "en duel" : g.mode === "teams" ? "en équipes" : "en mêlée"}, grille {g.settings.grid}×
              {g.settings.grid}
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
            const board = g.boards.find((b) => b.owner === id)!;
            const accuracy = p.shots > 0 ? Math.round((p.hits / p.shots) * 100) : null;
            return (
              <li
                key={id}
                className={`${ranks[id] === 1 ? "is-winner" : ""} ${id === me ? "is-me" : ""} ${board.afloat === 0 ? "is-out" : ""}`}
              >
                <span className="score-rank num">{ranks[id]}</span>
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={28} />}
                <span className="score-name">
                  {seat?.name}
                  {seat?.admin && <AdminBadge />}
                </span>
                <span className="naval-log-stats">
                  <span>{board.afloat > 0 ? `${board.afloat} à flot` : "coulé"}</span>
                  <span className="hint">{accuracy === null ? "aucun tir" : `${accuracy} % au but`}</span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className="overlay-actions">
          {room.you.isHost ? (
            <button className="btn btn-primary btn-lg" onClick={onRematch}>
              Rejouer
            </button>
          ) : me ? (
            <button className="btn btn-primary btn-lg" onClick={onRematch} disabled={voted}>
              {voted ? "Revanche demandée" : "Demander la revanche"}
            </button>
          ) : null}
          <button className="btn" onClick={onInspect}>
            Voir les flottes
          </button>
          <button className="btn" onClick={onLobby}>
            {room.you.isHost ? "Changer les règles" : "Voir la table"}
          </button>
          <button className="btn btn-ghost" onClick={onLeave}>
            Quitter
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
