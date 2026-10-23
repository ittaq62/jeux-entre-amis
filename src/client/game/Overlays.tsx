import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { RoomView, SeatView } from "../../shared/protocol.ts";
import { rankingPoints } from "../../shared/ranking.ts";
import { Avatar } from "../components/Avatar.tsx";
import { CardFace } from "../components/Card.tsx";
import { usePrefs } from "../stores/prefs.ts";

function seatOf(room: RoomView, id: string): SeatView | undefined {
  return room.seats.find((s) => s.id === id);
}

function useCountdown(target: number | null, offset: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [target]);
  return target ? Math.max(0, Math.ceil((target - (now + offset)) / 1000)) : null;
}

const sheetIn = {
  initial: { y: 24, opacity: 0, rotate: -1.5 },
  animate: { y: 0, opacity: 1, rotate: -0.6 },
  transition: { duration: 0.35, ease: [0.2, 0.8, 0.3, 1] as const },
};

/** Fin de manche (mode aux points) : la feuille de marque. */
export function RoundOver({ room, offset, onNext }: { room: RoomView; offset: number; onNext?: () => void }) {
  const g = room.uno!;
  const r = g.lastRound!;
  const winner = r.winner ? seatOf(room, r.winner) : undefined;
  const seconds = useCountdown(room.nextRoundAt, offset);
  const ranking = g.players.slice().sort((a, b) => b.score - a.score);
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="score-sheet paper" {...sheetIn}>
        <h2>Manche {r.round}</h2>
        <p className="score-lead">
          {winner ? (
            <>
              {winner.name} marque <strong className="num">{r.points}</strong> points.
            </>
          ) : (
            "Manche terminée."
          )}
        </p>
        <ol className="score-lines">
          {ranking.map((p, i) => {
            const seat = seatOf(room, p.id);
            return (
              <li key={p.id} className={p.id === r.winner ? "is-winner" : ""}>
                <span className="score-rank num">{i + 1}</span>
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={28} />}
                <span className="score-name">{seat?.name}</span>
                <span className="score-points num">{p.score}</span>
              </li>
            );
          })}
        </ol>
        <p className="hint score-goal">Premier à {g.settings.targetScore} points.</p>
        <div className="overlay-actions">
          {onNext && (
            <button className="btn btn-primary" onClick={onNext}>
              Manche suivante
            </button>
          )}
          {seconds !== null && <span className="hint">Distribution dans {seconds} s</span>}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Fin de partie : la feuille de marque finale. */
export function GameOver({
  room,
  onRematch,
  onLobby,
  onLeave,
}: {
  room: RoomView;
  onRematch: () => void;
  onLobby: () => void;
  onLeave: () => void;
}) {
  const g = room.uno!;
  const ranking = g.ranking ?? [];
  const me = room.you.seatId;
  const won = ranking[0] === me;
  const reduced = usePrefs((s) => s.reducedEffects);
  const r = g.lastRound;
  const winner = seatOf(room, ranking[0] ?? "");
  const placed = ranking.map((id, i) => ({ id, rank: i + 1, isBot: seatOf(room, id)?.kind !== "human" }));
  const mine = placed.find((p) => p.id === me && !p.isBot);
  const earned = mine ? rankingPoints(placed, mine) : null;

  useEffect(() => {
    if (!won || reduced) return;
    const colors = ["#b3261e", "#f3b62c", "#2fa864", "#2c7be5", "#f2ecdf"];
    confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.35 }, colors, scalar: 0.9 });
  }, [won, reduced]);

  const voted = room.rematch.includes(room.you.userId);
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="score-sheet paper gameover" {...sheetIn}>
        <div className="gameover-head">
          {winner && <Avatar avatar={winner.avatar} userId={winner.userId} photo={winner.photo} size={64} />}
          <div>
            <h2>{won ? "Tu remportes la partie." : `${winner?.name ?? "?"} remporte la partie.`}</h2>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              {g.settings.variant === "nomercy" ? "No Mercy" : "UNO classique"}
              {g.round > 1 ? `, en ${g.round} manches` : ""}
            </p>
            {earned !== null &&
              (earned > 0 ? (
                <p className="gameover-points">
                  <strong className="num">+{earned}</strong> points au classement
                </p>
              ) : (
                <p className="gameover-points">Pas de point au classement cette fois.</p>
              ))}
          </div>
        </div>

        <ol className="score-lines">
          {ranking.map((id, i) => {
            const seat = seatOf(room, id);
            const p = g.players.find((pl) => pl.id === id);
            const left = r?.hands[id] ?? [];
            return (
              <li key={id} className={`${i === 0 ? "is-winner" : ""} ${id === me ? "is-me" : ""} ${p?.eliminated ? "is-out" : ""}`}>
                <span className="score-rank num">{i + 1}</span>
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={28} />}
                <span className="score-name">{seat?.name}</span>
                {g.settings.endMode === "points" ? (
                  <span className="score-points num">{p?.score ?? 0}</span>
                ) : p?.eliminated ? (
                  <span className="hint">éliminé</span>
                ) : left.length > 0 ? (
                  <span className="final-hand" aria-label={`${left.length} cartes restantes`}>
                    {left.slice(0, 6).map((c) => (
                      <CardFace key={c.id} card={c} width={17} />
                    ))}
                    {left.length > 6 && <span className="hint">+{left.length - 6}</span>}
                  </span>
                ) : null}
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
          <button className="btn" onClick={onLobby}>
            {room.you.isHost ? "Changer les règles" : "Voir la table"}
          </button>
          <button className="btn btn-ghost" onClick={onLeave}>
            Quitter
          </button>
        </div>
        {room.rematch.length > 0 && (
          <p className="hint" style={{ margin: 0 }}>
            Revanche demandée par{" "}
            {room.rematch
              .map((uid) => room.seats.find((s) => s.userId === uid)?.name)
              .filter(Boolean)
              .join(", ")}
            .
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
