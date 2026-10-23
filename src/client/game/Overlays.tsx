import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { RoomView, SeatView } from "../../shared/protocol.ts";
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

export function RoundOver({ room, offset, onNext }: { room: RoomView; offset: number; onNext?: () => void }) {
  const g = room.uno!;
  const r = g.lastRound!;
  const winner = r.winner ? seatOf(room, r.winner) : undefined;
  const seconds = useCountdown(room.nextRoundAt, offset);
  const ranking = g.players.slice().sort((a, b) => b.score - a.score);
  const max = Math.max(g.settings.targetScore, ...ranking.map((p) => p.score));
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="overlay-card panel" initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }}>
        <p className="eyebrow">Manche {r.round} terminée</p>
        <h2>{winner ? `${winner.name} remporte la manche` : "Fin de la manche"}</h2>
        <p className="round-points">+{r.points} points</p>
        <ul className="score-list">
          {ranking.map((p) => {
            const seat = seatOf(room, p.id);
            return (
              <li key={p.id} className={p.id === r.winner ? "is-winner" : ""}>
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={30} />}
                <span className="score-name">{seat?.name}</span>
                <span className="score-bar">
                  <motion.span initial={{ width: 0 }} animate={{ width: `${(p.score / max) * 100}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
                </span>
                <strong>{p.score}</strong>
              </li>
            );
          })}
        </ul>
        <p className="hint">Objectif : {g.settings.targetScore} points</p>
        <div className="overlay-actions">
          {onNext && (
            <button className="btn btn-primary" onClick={onNext}>
              Manche suivante
            </button>
          )}
          {seconds !== null && <span className="hint">Reprise dans {seconds} s</span>}
        </div>
      </motion.div>
    </motion.div>
  );
}

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

  useEffect(() => {
    if (!won || reduced) return;
    const colors = ["#e23b3f", "#f3b62c", "#2fa864", "#2c7be5", "#e6c36f"];
    const end = Date.now() + 1600;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [won, reduced]);

  const podium = [ranking[1], ranking[0], ranking[2]];
  const voted = room.rematch.includes(room.you.userId);
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="overlay-card panel gameover" initial={{ y: 40, scale: 0.94 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
        <p className="eyebrow">{won ? "Victoire !" : me ? "Partie terminée" : "Fin de partie"}</p>
        <h2>{won ? "Tu as gagné la partie 🎉" : `${seatOf(room, ranking[0] ?? "")?.name ?? "?"} gagne la partie`}</h2>

        <div className="podium">
          {podium.map((id, i) => {
            if (!id) return <div key={i} className="podium-slot is-empty" />;
            const seat = seatOf(room, id);
            const place = i === 1 ? 1 : i === 0 ? 2 : 3;
            return (
              <motion.div
                key={id}
                className={`podium-slot place-${place}`}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25 + (3 - place) * 0.15, type: "spring", stiffness: 220, damping: 18 }}
              >
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={place === 1 ? 70 : 54} />}
                <strong>{seat?.name}</strong>
                <div className="podium-step">{place}</div>
              </motion.div>
            );
          })}
        </div>

        <ul className="final-list">
          {ranking.map((id, i) => {
            const seat = seatOf(room, id);
            const p = g.players.find((pl) => pl.id === id);
            const left = r?.hands[id] ?? [];
            return (
              <li key={id} className={id === me ? "is-me" : ""}>
                <span className="final-rank">{i + 1}</span>
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={28} />}
                <span className="final-name">{seat?.name}</span>
                {g.settings.endMode === "points" ? (
                  <span className="chip chip-gold">{p?.score ?? 0} pts</span>
                ) : p?.eliminated ? (
                  <span className="chip">éliminé</span>
                ) : (
                  <span className="final-hand">
                    {left.slice(0, 7).map((c) => (
                      <CardFace key={c.id} card={c} width={18} />
                    ))}
                    {left.length > 7 && <span className="hint">+{left.length - 7}</span>}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="overlay-actions">
          {room.you.isHost ? (
            <button className="btn btn-primary btn-lg" onClick={onRematch}>
              Rejouer
            </button>
          ) : me ? (
            <button className="btn btn-primary btn-lg" onClick={onRematch} disabled={voted}>
              {voted ? "Revanche demandée…" : "Revanche !"}
            </button>
          ) : null}
          <button className="btn" onClick={onLobby}>
            {room.you.isHost ? "Changer les règles" : "Voir le salon"}
          </button>
          <button className="btn btn-ghost" onClick={onLeave}>
            Quitter
          </button>
        </div>
        {room.rematch.length > 0 && (
          <p className="hint">
            Revanche demandée par {room.rematch.map((uid) => room.seats.find((s) => s.userId === uid)?.name).filter(Boolean).join(", ")}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
