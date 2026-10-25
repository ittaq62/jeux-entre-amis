import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { BricksRoomView } from "../../shared/protocol.ts";
import { rankingPoints } from "../../shared/ranking.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { api } from "../lib/api.ts";
import { formatSprint } from "../lib/countdown.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useSession } from "../stores/session.ts";
import { BRICK_TEAMS } from "./BricksLobby.tsx";
import { useTourBridge } from "../tour/bridge.ts";

interface Props {
  room: BricksRoomView;
  onRematch: () => void;
  onLobby: () => void;
  onLeave: () => void;
  onInspect: () => void;
}

const sheetIn = {
  initial: { y: 24, opacity: 0, rotate: -1.5 },
  animate: { y: 0, opacity: 1, rotate: -0.6 },
  transition: { duration: 0.35, ease: [0.2, 0.8, 0.3, 1] as const, delay: 0.8 },
};

/** Fin de partie : le classement et les briques de chacun. */
export function BricksGameOver({ room, onRematch, onLobby, onLeave, onInspect }: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.bricks!;
  const ranks = g.ranks ?? {};
  const ranking = g.ranking ?? [];
  const me = room.you.seatId;
  const won = me !== null && ranks[me] === 1 && g.mode !== "sprint";
  const reduced = usePrefs((s) => s.reducedEffects);
  const seatOf = (id: string) => room.seats.find((s) => s.id === id);
  const voted = room.rematch.includes(room.you.userId);
  const sprint = g.mode === "sprint" ? g.players[0] : undefined;
  const [best, setBest] = useState<number | null>(null);
  const pseudo = useSession((s) => s.user?.pseudo);

  useEffect(() => {
    if ((!won && !(sprint?.sprintTime ?? null)) || reduced) return;
    const t = setTimeout(() => {
      const colors = ["#e2bd6e", "#f4ecda", "#b8323a", "#2c5fb8", "#228a63"];
      confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.35 }, colors, scalar: 0.9 });
    }, 900);
    return () => clearTimeout(t);
  }, [won, sprint?.sprintTime, reduced]);

  // Solo : le record personnel, une fois la partie enregistrée
  useEffect(() => {
    if (!sprint || !pseudo) return;
    const t = setTimeout(() => {
      api
        .get<{ bricks?: { totals: Record<string, number> } }>(`/profile/${encodeURIComponent(pseudo)}`)
        .then((p) => setBest(p.bricks?.totals.bestSprint ?? null))
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [sprint, pseudo]);

  const actions = inTour ? (
    <>
      <p className="tour-next-note">
        <span className="spinner" /> La tournée continue : le classement arrive.
      </p>
      <div className="overlay-actions">
        <button className="btn" onClick={onInspect}>
          Voir les plateaux
        </button>
      </div>
    </>
  ) : (
    <div className="overlay-actions">
      {room.you.isHost ? (
        <button className="btn btn-primary btn-lg" onClick={onRematch}>
          {sprint ? "Recommencer" : "Rejouer"}
        </button>
      ) : me ? (
        <button className="btn btn-primary btn-lg" onClick={onRematch} disabled={voted}>
          {voted ? "Revanche demandée" : "Demander la revanche"}
        </button>
      ) : null}
      <button className="btn" onClick={onInspect}>
        Voir les plateaux
      </button>
      <button className="btn" onClick={onLobby}>
        {room.you.isHost ? "Changer les règles" : "Voir la table"}
      </button>
      <button className="btn btn-ghost" onClick={onLeave}>
        Quitter
      </button>
    </div>
  );

  if (sprint) {
    const st = g.stats[sprint.id];
    const time = sprint.sprintTime;
    const record = time !== null && best !== null && best === time;
    return (
      <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        <motion.div className="score-sheet paper gameover bricks-log" {...sheetIn}>
          <div className="gameover-head">
            <div>
              <h2>{time !== null ? `40 lignes en ${formatSprint(time)}` : "La pile a débordé"}</h2>
              <p className="hint" style={{ margin: "4px 0 0" }}>
                {time !== null
                  ? record
                    ? "Nouveau record personnel !"
                    : best !== null
                      ? `Ton record : ${formatSprint(best)}`
                      : "Solo 40 lignes"
                  : `${sprint.lines} lignes sur 40 avant le débordement.`}
              </p>
            </div>
          </div>
          {st && (
            <dl className="bricks-sheet-stats">
              <div>
                <dt>Pièces</dt>
                <dd className="num">{st.pieces}</dd>
              </div>
              <div>
                <dt>Pièces par seconde</dt>
                <dd className="num">{time ? (st.pieces / (time / 1000)).toFixed(2).replace(".", ",") : "–"}</dd>
              </div>
              <div>
                <dt>Quatre lignes</dt>
                <dd className="num">{st.tetrises}</dd>
              </div>
              <div>
                <dt>T-spins</dt>
                <dd className="num">{st.tspins}</dd>
              </div>
            </dl>
          )}
          {actions}
        </motion.div>
      </motion.div>
    );
  }

  const placed = ranking.map((id) => ({ id, rank: ranks[id] ?? ranking.length, isBot: seatOf(id)?.kind !== "human" }));
  const mine = placed.find((p) => p.id === me && !p.isBot);
  const earned = mine ? rankingPoints(placed, mine) : null;
  const winners = ranking.filter((id) => ranks[id] === 1);
  const winnerTeam = g.mode === "teams" ? g.players.find((p) => p.id === winners[0])?.team : null;
  const names = winners.map((id) => seatOf(id)?.name ?? "?").join(" et ");
  const title =
    winnerTeam !== null && winnerTeam !== undefined
      ? won
        ? `Victoire de l'équipe ${BRICK_TEAMS[winnerTeam]} !`
        : `L'équipe ${BRICK_TEAMS[winnerTeam]} l'emporte.`
      : won
        ? "Tu remportes la partie."
        : `${names} remporte la partie.`;
  const top = winners[0] ? seatOf(winners[0]) : undefined;

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
      <motion.div className="score-sheet paper gameover bricks-log" {...sheetIn}>
        <div className="gameover-head">
          {top && <Avatar avatar={top.avatar} userId={top.userId} photo={top.photo} size={64} />}
          <div>
            <h2>{title}</h2>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              Briques, {g.mode === "duel" ? "en duel" : g.mode === "teams" ? "en équipes" : "en mêlée"}
              {g.settings.series > 1 ? `, en ${g.settings.series} manches gagnantes` : ""}
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
            const st = g.stats[id];
            return (
              <li key={id} className={`${ranks[id] === 1 ? "is-winner" : ""} ${id === me ? "is-me" : ""}`}>
                <span className="score-rank num">{ranks[id]}</span>
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={28} />}
                <span className="score-name">
                  {seat?.name}
                  {seat?.admin && <AdminBadge />}
                </span>
                <span className="bricks-log-stats">
                  <span>
                    {g.settings.series > 1 ? `${p.roundWins} manche${p.roundWins > 1 ? "s" : ""}, ` : ""}
                    {st?.kos ?? 0} K.O.
                  </span>
                  <span className="hint">
                    {st?.sent ?? 0} envoyées, {st?.lines ?? 0} lignes
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        {actions}
      </motion.div>
    </motion.div>
  );
}
