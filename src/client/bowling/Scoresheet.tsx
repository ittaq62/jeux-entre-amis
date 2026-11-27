// La feuille de score : une ligne par joueur, une case par frame (les marques de chaque boule en haut, X pour un strike,
// / pour un spare, – pour rien, le chiffre entouré quand la boule a laissé un split ; le total cumulé en dessous). En
// haut de l'écran pendant la partie ; en grand à la fin, avec le classement, les devins et la revanche.

import type { CSSProperties } from "react";
import { colorOf, type BowlingLook } from "../../shared/games/bowling/looks.ts";
import { totals } from "../../shared/games/bowling/match.ts";
import type { BowlingClientMessage, BowlingRoomView, BowlingView } from "../../shared/games/bowling/net.ts";
import { frameMarks, frameScores } from "../../shared/games/bowling/score.ts";
import { TOUR_TEAMS } from "../../shared/tour.ts";
import { ReportButton } from "../components/ReportButton.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TourNextNote } from "../tour/TourNextNote.tsx";
import { EveningLine } from "../components/EveningLine.tsx";

export interface SheetPlayer {
  id: string;
  name: string;
  look: BowlingLook;
}

/** Les marques d'une frame (avec les splits entourés) */
function Marks({ fr, last, splits }: { fr: number[]; last: boolean; splits: number[] }) {
  const marks = frameMarks(fr, last);
  const slots = last ? 3 : 2;
  const cells = Array.from({ length: slots }, (_, i) => marks[i] ?? "");
  // Un strike en début de frame normale se marque dans la case de droite
  if (!last && marks[0] === "X") {
    cells[0] = "";
    cells[1] = "X";
  }
  return (
    <span className="bw-marks">
      {cells.map((m, i) => {
        const split = splits.includes(i) && m !== "" && m !== "X" && !(last && marks[i] === "X");
        return (
          <span key={i} className={`bw-mark ${m === "X" ? "is-strike" : m === "/" ? "is-spare" : ""} ${split ? "is-split" : ""}`}>
            {m}
          </span>
        );
      })}
    </span>
  );
}

export function Sheet({
  v,
  players,
  me,
  compact = false,
  hideLast = false,
}: {
  v: BowlingView;
  players: SheetPlayer[];
  me: string | null;
  compact?: boolean;
  /** Le lancer en cours n'est pas encore montré : sa marque attend la fin de l'animation (elle n'est pas encore comptée) */
  hideLast?: boolean;
}) {
  void hideLast;
  const frames = v.cfg.frames;
  const tot = totals({ ...v, rng: 0 });
  const live = v.phase !== "over";
  const spares = v.cfg.mode === "spares";
  return (
    <div className={`bw-sheet ${compact ? "is-compact" : ""}`}>
      <table>
        <thead>
          <tr>
            <th className="bw-name-col">{spares ? "Manche" : "Frame"}</th>
            {Array.from({ length: frames }, (_, f) => (
              <th key={f} className={live && f === v.frame ? "is-current" : ""}>
                {f + 1}
              </th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {v.players.map((p, i) => {
            const info = players.find((x) => x.id === p.id);
            const scores = frameScores(p.rolls, frames);
            const turn = live && i === v.turn;
            return (
              <tr key={p.id} className={`${p.id === me ? "is-me" : ""} ${turn ? "is-turn" : ""}`}>
                <th className="bw-name-col">
                  <span className="bw-dot" style={{ "--c": colorOf(info?.look.color ?? "cerise").hex } as CSSProperties} />
                  <span className="bw-pname">{p.id === me ? "Toi" : (info?.name ?? "?")}</span>
                  {v.cfg.teams && <small> · {TOUR_TEAMS[p.team]}</small>}
                </th>
                {Array.from({ length: frames }, (_, f) => {
                  if (spares) {
                    const pts = p.points[f];
                    const rack = v.challenge?.[f]?.length ?? 0;
                    return (
                      <td key={f} className={`bw-frame ${live && f === v.frame ? "is-current" : ""}`}>
                        <span className={`bw-points num ${pts !== undefined && pts > rack ? "is-clear" : ""}`}>{pts ?? ""}</span>
                      </td>
                    );
                  }
                  const fr = p.rolls[f] ?? [];
                  const splits = p.splits.filter(([sf]) => sf === f).map(([, b]) => b);
                  return (
                    <td key={f} className={`bw-frame ${live && f === v.frame ? "is-current" : ""} ${f === frames - 1 ? "is-last" : ""}`}>
                      <Marks fr={fr} last={f === frames - 1} splits={splits} />
                      <span className="bw-cum num">{scores[f] ?? ""}</span>
                    </td>
                  );
                })}
                <td className="bw-total num">{tot[i]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Le classement des devins (ceux qui ont bien parié) */
function Seers({ v, players, room }: { v: BowlingView; players: SheetPlayer[]; room: BowlingRoomView }) {
  const list = Object.entries(v.seers)
    .filter(([, s]) => s.tries > 0)
    .sort((a, b) => b[1].points - a[1].points || b[1].right - a[1].right)
    .slice(0, 5);
  if (list.length === 0) return null;
  const nameOf = (who: string) =>
    who.startsWith("w:")
      ? (room.spectators.find((s) => s.userId === who.slice(2))?.name ?? "Un spectateur")
      : who === room.you.seatId
        ? "Toi"
        : (players.find((p) => p.id === who)?.name ?? "?");
  return (
    <div className="bw-seers">
      <h2>Les devins</h2>
      <ol>
        {list.map(([who, s], i) => (
          <li key={who} className={i === 0 ? "is-first" : ""}>
            <span>{nameOf(who)}</span>
            <span className="num">
              {s.points} pt{s.points > 1 ? "s" : ""}{" "}
              <small>
                ({s.right} sur {s.tries})
              </small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function FinalSheet({
  room,
  players,
  send,
  onLeave,
  onShowLobby,
}: {
  room: BowlingRoomView;
  players: SheetPlayer[];
  send: (m: BowlingClientMessage) => void;
  onLeave: () => void;
  onShowLobby: () => void;
}) {
  const inTour = Boolean(useTourBridge());
  const v = room.bowling!;
  const ranks = v.ranks ?? null;
  const tot = totals({ ...v, rng: 0 });
  const seated = room.you.seatId !== null;
  const asked = room.rematch.includes(room.you.userId);
  const winners = ranks ? v.players.map((_, i) => i).filter((i) => ranks[i] === 1) : [];
  const best = Math.max(0, ...tot);
  const title =
    winners.length === 0
      ? "Partie finie"
      : v.cfg.teams
        ? `Victoire des ${TOUR_TEAMS[v.players[winners[0]!]!.team]} !`
        : winners.length === 1
          ? v.players[winners[0]!]!.id === room.you.seatId
            ? "Tu gagnes !"
            : `${players.find((p) => p.id === v.players[winners[0]!]!.id)?.name ?? "?"} gagne !`
          : "Égalité !";
  const label = v.cfg.mode === "spares" ? `Défi des spares, ${v.cfg.frames} manches` : `${v.cfg.frames} frames`;
  return (
    <div className="bw-final">
      <div className="bw-final-card panel">
        <h1>{title}</h1>
        <p className="hint" style={{ margin: 0 }}>
          {label} · meilleur score : <strong className="num">{best}</strong>
          {v.cfg.mode === "classique" && v.cfg.frames === 10 && best === 300 ? " · la partie parfaite !" : ""}
        </p>
        <EloLine result={room.results?.[room.you.userId]} />
        <Sheet v={v} players={players} me={room.you.seatId} />
        {v.cfg.pronostics && <Seers v={v} players={players} room={room} />}
        <EveningLine game="bowling" />
        {inTour ? (
          <TourNextNote />
        ) : (
          !seated && (
            <p className="hint" style={{ margin: 0 }}>
              Tu regardes cette partie : reste pour jouer la suivante.
            </p>
          )
        )}
        <div className="bw-final-actions">
          {!inTour && seated && (
            <button className="btn btn-primary" disabled={asked} onClick={() => send({ t: "rematch" })}>
              {asked ? "En attente des autres" : "Revanche"}
            </button>
          )}
          {!inTour && (
            <button className="btn" onClick={onShowLobby}>
              {room.you.isHost ? "Changer les règles" : "Voir le salon"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            {inTour ? "Quitter la tournée" : "Quitter"}
          </button>
        </div>
        <ReportButton game="bowling" variant={`Bowling, ${label}`} code={room.code} role={seated ? "player" : "watcher"} />
      </div>
    </div>
  );
}
