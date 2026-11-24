import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { tableTeamName } from "../../shared/games/teams.ts";
import type { RoomView, SeatView } from "../../shared/protocol.ts";
import { rankingPoints } from "../../shared/ranking.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { CardFace } from "../components/Card.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { CrewMark } from "./Crews.tsx";
import { EloLine } from "./EloLine.tsx";
import { useSeatMemory } from "./seatMemory.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TourNextNote } from "../tour/TourNextNote.tsx";

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
                <span className="score-name">
                  {seat?.name}
                  {seat?.admin && <AdminBadge />}
                </span>
                <span className="score-points num">{p.score}</span>
              </li>
            );
          })}
        </ol>
        {g.teams && <TeamTotals room={room} />}
        <p className="hint score-goal">
          {g.teams ? "Première équipe" : "Premier"} à {g.settings.targetScore} points.
        </p>
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

/** En équipes aux points : le total de chaque équipe, celui qui compte pour l'objectif */
function TeamTotals({ room }: { room: RoomView }) {
  const g = room.uno!;
  const teams = g.teams!;
  const totals = new Map<number, number>();
  for (const p of g.players) {
    const t = teams[p.id];
    if (t !== undefined) totals.set(t, (totals.get(t) ?? 0) + p.score);
  }
  const mine = room.you.seatId !== null ? teams[room.you.seatId] : undefined;
  return (
    <ul className="team-totals">
      {[...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([team, total]) => (
          <li key={team} className={team === mine ? "is-mine" : ""}>
            <CrewMark team={team} size={13} /> {tableTeamName(team)}
            <span className="score-points num">{total}</span>
          </li>
        ))}
    </ul>
  );
}

/** Fin de partie : la feuille de marque finale. */
export function GameOver({
  room,
  onRematch,
  onLobby,
  onLeave,
  onInspect,
}: {
  room: RoomView;
  onRematch: () => void;
  onLobby: () => void;
  onLeave: () => void;
  /** Ranger la feuille pour revoir la table (et retrouver son menu) */
  onInspect: () => void;
}) {
  const g = room.uno!;
  const me = room.you.seatId;
  // Un joueur parti après la partie garde son nom sur la feuille
  const seatAt = useSeatMemory(room.seats);
  // En équipes à une table, on gagne ensemble : chacun a la place de son équipe, et la liste suit ces places
  // (le premier sorti peut être d'une équipe battue, « jusqu'au dernier » ou aux points)
  const teamRanks = g.teamRanks ?? null;
  const raw = g.ranking ?? [];
  const ranking = teamRanks ? raw.slice().sort((a, b) => (teamRanks[a] ?? 99) - (teamRanks[b] ?? 99)) : raw;
  const rankOf = (id: string, i: number) => teamRanks?.[id] ?? i + 1;
  const won = teamRanks ? me !== null && teamRanks[me] === 1 : ranking[0] === me;
  const reduced = usePrefs((s) => s.reducedEffects);
  const r = g.lastRound;
  const winner = seatAt(ranking[0] ?? "");
  const winTeam = teamRanks && g.teams ? g.teams[ranking[0] ?? ""] : undefined;
  const placed = ranking.map((id, i) => ({ id, rank: rankOf(id, i), isBot: seatAt(id)?.kind !== "human" }));
  const mine = placed.find((p) => p.id === me && !p.isBot);
  const earned = mine ? rankingPoints(placed, mine) : null;

  useEffect(() => {
    if (!won || reduced) return;
    const colors = ["#b3261e", "#f3b62c", "#2fa864", "#2c7be5", "#f2ecdf"];
    confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.35 }, colors, scalar: 0.9 });
  }, [won, reduced]);

  const voted = room.rematch.includes(room.you.userId);
  const inTour = useTourBridge() !== null;
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="score-sheet paper gameover" {...sheetIn}>
        <div className="gameover-head">
          {winner && <Avatar avatar={winner.avatar} userId={winner.userId} photo={winner.photo} size={64} />}
          <div>
            <h2>
              {winTeam !== undefined
                ? won
                  ? `Ton équipe remporte la partie : les ${tableTeamName(winTeam)}.`
                  : `Les ${tableTeamName(winTeam)} remportent la partie.`
                : won
                  ? "Tu remportes la partie."
                  : `${winner?.name ?? "?"} remporte la partie.`}
            </h2>
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
            <EloLine result={room.results?.[room.you.userId]} />
          </div>
        </div>

        <ol className="score-lines">
          {ranking.map((id, i) => {
            const seat = seatAt(id);
            const p = g.players.find((pl) => pl.id === id);
            const left = r?.hands[id] ?? [];
            return (
              <li
                key={id}
                className={`${rankOf(id, i) === 1 ? "is-winner" : ""} ${id === me ? "is-me" : ""} ${p?.eliminated ? "is-out" : ""}`}
              >
                <span className="score-rank num">{rankOf(id, i)}</span>
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={28} />}
                <span className="score-name">
                  {teamRanks && g.teams?.[id] !== undefined && <CrewMark team={g.teams[id]!} size={13} />} {seat?.name}
                  {seat?.admin && <AdminBadge />}
                </span>
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

        {g.teams && g.settings.endMode === "points" && <TeamTotals room={room} />}

        {inTour ? (
          <TourNextNote />
        ) : (
          !me && (
            <p className="hint" style={{ margin: 0 }}>
              Tu regardes cette table : reste pour voir la partie suivante.
            </p>
          )
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
        {!inTour && room.rematch.length > 0 && (
          <p className="hint" style={{ margin: 0 }}>
            Revanche demandée par{" "}
            {room.rematch
              .map((uid) => room.seats.find((s) => s.userId === uid)?.name)
              .filter(Boolean)
              .join(", ")}
            .
          </p>
        )}
        <ReportButton
          game="uno"
          variant={`${g.settings.variant === "nomercy" ? "UNO No Mercy" : "UNO classique"}${g.settings.endMode === "points" ? `, en ${g.settings.targetScore} points` : ""}`}
          code={room.code}
          role={me ? "player" : "watcher"}
        />
      </motion.div>
    </motion.div>
  );
}
