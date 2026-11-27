// Le tableau des scores : en haut de l'écran pendant la partie (les camps, leur famille et les billes qui leur restent,
// les manches, les vies, les points), et en grand à la fin, avec le classement, quelques chiffres et la revanche.

import { VARIANT_NAMES, groupLeft, totals, type BillardPlayer } from "../../shared/games/billard/match.ts";
import type { BillardClientMessage, BillardRoomView, BillardView } from "../../shared/games/billard/net.ts";
import { groupOf } from "../../shared/games/billard/rules.ts";
import { TOUR_TEAMS } from "../../shared/tour.ts";
import type { ReactNode } from "react";
import { ReportButton } from "../components/ReportButton.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { usePop } from "../lib/feel.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TourNextNote } from "../tour/TourNextNote.tsx";
import { EveningLine } from "../components/EveningLine.tsx";
import { formatLabel } from "./BillardLobby.tsx";
import { BallDot } from "./LookPicker.tsx";

export interface BoardPlayer {
  id: string;
  name: string;
}

const nameOf = (players: BoardPlayer[], me: string | null, id: string) =>
  id === me ? "Toi" : (players.find((p) => p.id === id)?.name ?? "?");

/** Le nom d'un camp : le joueur, ou l'équipe */
export function sideName(v: BillardView, players: BoardPlayer[], me: string | null, side: number): string {
  const s = v.sides[side];
  if (!s) return "?";
  if (v.cfg.teams) return TOUR_TEAMS[(v.players.find((p) => p.side === side)?.team ?? 0) as 0 | 1] ?? "?";
  return nameOf(players, me, s.ids[0]!);
}

/** Un chiffre du tableau qui saute quand il change (une manche, un point, une vie) */
function Pop({ value, className = "", children }: { value: unknown; className?: string; children: ReactNode }) {
  const ref = usePop<HTMLSpanElement>(value);
  return (
    <span ref={ref} className={`bl-pop ${className}`}>
      {children}
    </span>
  );
}

function Hearts({ n, max }: { n: number; max: number }) {
  return (
    <span className="bl-hearts" aria-label={`${n} vie${n > 1 ? "s" : ""}`}>
      {Array.from({ length: Math.max(n, max) }, (_, i) => (
        <span key={i} className={i < n ? "is-on" : ""}>
          ♥
        </span>
      ))}
    </span>
  );
}

/** Le bandeau du haut : un cartouche par camp (ou par joueur) */
export function Board({ v, players, me }: { v: BillardView; players: BoardPlayer[]; me: string | null }) {
  const set = v.dress.set;
  const variant = v.cfg.variant;
  if (
    variant === "killer" ||
    (variant === "carambole" && !v.cfg.teams && v.players.length > 2) ||
    (variant === "neuf" && v.sides.length > 2)
  ) {
    // Chacun pour soi, à plusieurs : une puce par joueur
    return (
      <div className="bl-board is-many">
        {v.players.map((p) => (
          <div key={p.id} className={`bl-chip ${p.id === v.shooter ? "is-turn" : ""} ${p.out ? "is-out" : ""}`}>
            <span className="bl-chip-name">{nameOf(players, me, p.id)}</span>
            {variant === "killer" ? (
              <Pop value={p.lives}>
                <Hearts n={Math.max(0, p.lives)} max={v.cfg.lives} />
              </Pop>
            ) : variant === "carambole" ? (
              <span className="num">
                <BallDot id={p.ball === 1 ? 1 : 0} set="classiques" carom size={12} /> <Pop value={p.points}>{p.points}</Pop>
              </span>
            ) : (
              <Pop value={v.sides[p.side]?.racks ?? 0} className="num">
                {v.sides[p.side]?.racks ?? 0}
              </Pop>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="bl-board">
      {v.sides.map((s, i) => {
        const g = s.group;
        const left = g ? groupLeft(v, g) : 0;
        const team = v.players.filter((p) => p.side === i);
        const carom = variant === "carambole";
        return (
          <div key={i} className={`bl-side ${v.turn === i && v.phase !== "over" ? "is-turn" : ""}`}>
            <div className="bl-side-head">
              <strong>{sideName(v, players, me, i)}</strong>
              {v.cfg.races > 1 && !carom && (
                <span className="bl-racks num" aria-label={`${s.racks} manche${s.racks > 1 ? "s" : ""}`}>
                  <Pop value={s.racks}>{s.racks}</Pop>
                </span>
              )}
              {carom && (
                <span className="bl-points num">
                  <Pop value={team.reduce((a, p) => a + p.points, 0)}>{team.reduce((a, p) => a + p.points, 0)}</Pop>
                  <small>/{v.cfg.points}</small>
                </span>
              )}
            </div>
            <div className="bl-side-sub">
              {variant === "huit" &&
                (g ? (
                  <span className="bl-group">
                    {left === 0 ? (
                      <>
                        <BallDot id={8} set={set} size={16} /> la noire
                      </>
                    ) : (
                      v.balls
                        .filter((b) => groupOf(b.id) === g)
                        .sort((a, b) => a.id - b.id)
                        .map((b) => <BallDot key={b.id} id={b.id} set={set} size={14} />)
                    )}
                  </span>
                ) : (
                  <span className="hint">{v.breakShot ? "à la casse" : "table ouverte"}</span>
                ))}
              {variant === "neuf" && (
                <span className="hint">{team.length > 1 ? team.map((p) => nameOf(players, me, p.id)).join(", ") : ""}</span>
              )}
              {carom && (
                <span className="hint">
                  <BallDot id={i % 2 === 1 ? 1 : 0} set="classiques" carom size={12} /> {i % 2 === 1 ? "la jaune" : "la blanche"}
                </span>
              )}
              {v.cfg.teams && variant !== "neuf" && (
                <span className="hint bl-team-names">{team.map((p) => nameOf(players, me, p.id)).join(", ")}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function statLine(p: BillardPlayer, variant: string) {
  const s = p.stats;
  const parts = [
    variant === "carambole" ? `${s.pots} point${s.pots > 1 ? "s" : ""}` : `${s.pots} bille${s.pots > 1 ? "s" : ""}`,
    `${s.shots} coup${s.shots > 1 ? "s" : ""}`,
    s.fouls ? `${s.fouls} faute${s.fouls > 1 ? "s" : ""}` : null,
    s.bestRun > 1 ? `série de ${s.bestRun}` : null,
    s.banks ? `${s.banks} par la bande` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function FinalSheet({
  room,
  players,
  send,
  onLeave,
  onShowLobby,
}: {
  room: BillardRoomView;
  players: BoardPlayer[];
  send: (m: BillardClientMessage) => void;
  onLeave: () => void;
  onShowLobby: () => void;
}) {
  const inTour = Boolean(useTourBridge());
  const v = room.billard!;
  const me = room.you.seatId;
  const ranks = v.ranks ?? null;
  const tot = totals({ ...v, rng: 0 });
  const seated = me !== null;
  const asked = room.rematch.includes(room.you.userId);
  const winners = ranks ? v.players.map((_, i) => i).filter((i) => ranks[i] === 1) : [];
  const title =
    winners.length === 0
      ? "Partie finie"
      : v.cfg.teams
        ? `Victoire des ${TOUR_TEAMS[v.players[winners[0]!]!.team]} !`
        : winners.length === 1
          ? v.players[winners[0]!]!.id === me
            ? "Tu gagnes !"
            : `${nameOf(players, me, v.players[winners[0]!]!.id)} gagne !`
          : "Égalité !";
  const label = `${VARIANT_NAMES[v.cfg.variant]}, ${formatLabel(v.cfg)}`;
  const order = v.players.map((p, i) => ({ p, i })).sort((a, b) => (ranks?.[a.i] ?? 9) - (ranks?.[b.i] ?? 9));
  return (
    <div className="bl-final">
      <div className="bl-final-card panel">
        <h1>{title}</h1>
        <p className="hint" style={{ margin: 0 }}>
          {label}
          {v.cfg.variant !== "killer" && v.cfg.variant !== "carambole" && v.cfg.races > 1
            ? ` · ${v.sides.map((s) => s.racks).join(" à ")}`
            : ""}
        </p>
        <EloLine result={room.results?.[room.you.userId]} />
        <ol className="bl-ranking">
          {order.map(({ p, i }) => (
            <li key={p.id} className={`${ranks?.[i] === 1 ? "is-first" : ""} ${p.id === me ? "is-me" : ""}`}>
              <span className="bl-rank num">{ranks?.[i] ?? "–"}</span>
              <span className="bl-rank-name">
                <strong>{nameOf(players, me, p.id)}</strong>
                <small>{statLine(p, v.cfg.variant)}</small>
              </span>
              <span className="bl-rank-score num">
                {v.cfg.variant === "killer" ? (
                  p.out ? (
                    "éliminé"
                  ) : (
                    <Hearts n={p.lives} max={0} />
                  )
                ) : v.cfg.variant === "carambole" ? (
                  `${tot[i]} pts`
                ) : (
                  ""
                )}
              </span>
            </li>
          ))}
        </ol>
        <EveningLine game="billard" />
        {inTour ? (
          <TourNextNote />
        ) : (
          !seated && (
            <p className="hint" style={{ margin: 0 }}>
              Tu regardes cette partie : reste pour jouer la suivante.
            </p>
          )
        )}
        <div className="bl-final-actions">
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
        <ReportButton game="billard" variant={`Billard, ${label}`} code={room.code} role={seated ? "player" : "watcher"} />
      </div>
    </div>
  );
}
