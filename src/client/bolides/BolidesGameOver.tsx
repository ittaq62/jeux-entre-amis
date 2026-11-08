import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect } from "react";
import { TRACKS } from "../../shared/games/bolides/track.ts";
import type { BolidesRoomView } from "../../shared/protocol.ts";
import { rankingPoints } from "../../shared/ranking.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { kartColor, raceTime } from "./BolidesRace.tsx";

interface Props {
  room: BolidesRoomView;
  onRematch: () => void;
  onLobby: () => void;
  onLeave: () => void;
  onInspect: () => void;
  /** Ce que cette course vient de débloquer (des noms de véhicules et de skins) */
  unlocks?: string[];
}

const SPEED_NAMES = { balade: "en balade", normal: "", bolide: "à grande vitesse" } as const;

const sheetIn = {
  initial: { y: 24, opacity: 0, rotate: -1.5 },
  animate: { y: 0, opacity: 1, rotate: -0.6 },
  transition: { duration: 0.35, ease: [0.2, 0.8, 0.3, 1] as const, delay: 1.2 },
};

/** L'arrivée : le podium, les temps et le meilleur tour de chacun */
export function BolidesGameOver({ room, onRematch, onLobby, onLeave, onInspect, unlocks = [] }: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.bolides!;
  const ranks = g.ranks ?? {};
  const ranking = g.ranking ?? [];
  const me = room.you.seatId;
  const won = me !== null && ranks[me] === 1;
  const reduced = usePrefs((s) => s.reducedEffects);
  const seatOf = (id: string) => room.seats.find((s) => s.id === id);
  const racerOf = (id: string) => g.racers.find((r) => r.id === id);
  const winner = ranking[0] ? seatOf(ranking[0]) : undefined;

  useEffect(() => {
    if (!won || reduced) return;
    const t = setTimeout(() => {
      const colors = ["#e2483d", "#f2c94c", "#2f80ed", "#ffffff"];
      void confetti({ particleCount: 120, spread: 80, startVelocity: 42, origin: { y: 0.35 }, colors, scalar: 0.9 });
    }, 1300);
    return () => clearTimeout(t);
  }, [won, reduced]);

  const placed = ranking.map((id) => ({ id, rank: ranks[id] ?? ranking.length, isBot: seatOf(id)?.kind !== "human" }));
  const mine = placed.find((p) => p.id === me && !p.isBot);
  const earned = mine ? rankingPoints(placed, mine) : null;
  const voted = room.rematch.includes(room.you.userId);
  const title = won ? "Victoire !" : `${winner?.name ?? "?"} remporte la course.`;
  const best = Math.min(...g.racers.map((r) => r.stats.bestLap || Infinity));
  const speed = SPEED_NAMES[g.settings.speed];
  const summary = `${TRACKS[g.track].name}, ${g.settings.laps} tours${speed ? ` ${speed}` : ""}${g.settings.items ? "" : ", sans objets"}`;

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
      <motion.div className="score-sheet paper gameover bolides-sheet" {...sheetIn}>
        {unlocks.length > 0 && <p className="bolides-unlocks">Nouveau dans ton garage : {unlocks.join(", ")} !</p>}
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
            const r = racerOf(id);
            return (
              <li key={id} className={`${ranks[id] === 1 ? "is-winner" : ""} ${id === me ? "is-me" : ""}`}>
                <span className="score-rank num">{ranks[id]}</span>
                <span className="bolides-sheet-color" style={{ background: kartColor(room, id) }} />
                {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={28} />}
                <span className="score-name">
                  {seat?.name}
                  {seat?.admin && <AdminBadge />}
                </span>
                <span className="bolides-sheet-stats">
                  <span className="num">{r?.finish != null ? raceTime(r.finish) : `${r?.laps ?? 0}/${g.settings.laps} tours`}</span>
                  {r && r.stats.bestLap > 0 && (
                    <span className={`hint num ${r.stats.bestLap === best ? "is-best" : ""}`} title="Meilleur tour">
                      {r.stats.bestLap === best ? "★ " : ""}
                      {raceTime(r.stats.bestLap)}
                    </span>
                  )}
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
            Voir le circuit
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
