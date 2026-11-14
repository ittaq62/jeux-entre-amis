import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect } from "react";
import type { MecheRoomView } from "../../shared/protocol.ts";
import { rankingPoints } from "../../shared/ranking.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";

interface Props {
  room: MecheRoomView;
  onRematch: () => void;
  onLobby: () => void;
  onLeave: () => void;
  onInspect: () => void;
  /** Le temps de voir la dernière bombe sauter jusqu'au bout, en secondes (le nuage du gaz dure plus que le boum) */
  wait?: number;
}

const sheetIn = (wait: number) => ({
  initial: { y: 24, opacity: 0, rotate: -1.5 },
  animate: { y: 0, opacity: 1, rotate: -0.6 },
  transition: { duration: 0.35, ease: [0.2, 0.8, 0.3, 1] as const, delay: wait + 0.1 },
});

/** Fin de partie : qui a tenu le plus longtemps, et le plus beau mot de chacun. */
export function MecheGameOver({ room, onRematch, onLobby, onLeave, onInspect, wait = 1.4 }: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.meche!;
  const ranks = g.ranks ?? {};
  const ranking = g.ranking ?? [];
  const me = room.you.seatId;
  const won = me !== null && ranks[me] === 1;
  const reduced = usePrefs((s) => s.reducedEffects);
  const seatOf = (id: string) => room.seats.find((s) => s.id === id);
  const winner = ranking[0] ? seatOf(ranking[0]) : undefined;

  useEffect(() => {
    if (!won || reduced) return;
    const t = setTimeout(
      () => {
        const colors = ["#ff9a3c", "#ffd36b", "#f4ecda", "#e0463c"];
        void confetti({ particleCount: 110, spread: 80, startVelocity: 40, origin: { y: 0.35 }, colors, scalar: 0.9 });
      },
      (wait + 0.2) * 1000,
    );
    return () => clearTimeout(t);
  }, [won, reduced, wait]);

  const placed = ranking.map((id) => ({ id, rank: ranks[id] ?? ranking.length, isBot: seatOf(id)?.kind !== "human" }));
  const mine = placed.find((p) => p.id === me && !p.isBot);
  const earned = mine ? rankingPoints(placed, mine) : null;
  const voted = room.rematch.includes(room.you.userId);
  const title = won ? "Dernier debout !" : `${winner?.name ?? "?"} remporte la partie.`;
  const modeName = g.settings.mode === "rallonge" ? "Mèche à rallonge" : g.settings.mode === "chacun" ? "Chacun sa mèche" : "Mèche";
  const summary = `${modeName}, ${g.fuse} explosion${g.fuse > 1 ? "s" : ""} et ${g.wordsPlayed} mot${g.wordsPlayed > 1 ? "s" : ""}${
    g.settings.source === "marabout" ? ", au Marabout" : ""
  }`;

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: wait }}>
      <motion.div className="score-sheet paper gameover meche-sheet" {...sheetIn(wait)}>
        <div className="gameover-head">
          {winner && <Avatar avatar={winner.avatar} userId={winner.userId} photo={winner.photo} size={64} />}
          <div>
            <h2>{title}</h2>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              {summary}
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
            return (
              <li key={id} className={`${ranks[id] === 1 ? "is-winner" : ""} ${id === me ? "is-me" : ""}`}>
                <span className="score-rank num">{ranks[id]}</span>
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={28} />}
                <span className="score-name">
                  {seat?.name}
                  {seat?.admin && <AdminBadge />}
                </span>
                <span className="meche-sheet-stats">
                  <span className="num">
                    {p.stats.words} mot{p.stats.words > 1 ? "s" : ""}
                  </span>
                  {p.best && <span className="hint meche-sheet-best">{p.best.toUpperCase()}</span>}
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
            Voir la table
          </button>
          {!inTour && (
            <button className="btn" onClick={onLobby}>
              {room.you.isHost ? "Changer les règles" : "Voir le salon"}
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
