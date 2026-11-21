// En tournée, Culbute enchaîne plusieurs combats : le tableau des points entre deux manches (avec le compte à rebours
// de la suivante), le numéro de la manche pendant le combat, et les lignes du classement final aux points.

import { useEffect, useState } from "react";
import type { AvatarConfig } from "../../shared/avatar.ts";
import type { CulbuteRoomView } from "../../shared/games/culbute/net.ts";
import { roundPoints, seriesRanks, type CulbuteSeries } from "../../shared/games/culbute/series.ts";
import type { CulbuteView } from "../../shared/games/culbute/view.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import type { FighterLook } from "./scene/CulbuteScene.ts";

export const place = (r: number) => (r === 1 ? "1er" : `${r}e`);

export interface SeriesRow {
  id: string;
  rank: number;
  points: number;
  /** Sa place à chaque manche finie (0 : il n'y était plus) */
  places: number[];
  name: string;
  color: string | undefined;
  avatar: AvatarConfig | undefined;
  team: number;
  me: boolean;
}

/** Chaque siège de la série, du premier au dernier au total (provisoire entre deux manches, définitif à la fin) */
export function seriesRows(room: CulbuteRoomView, view: CulbuteView, looks: FighterLook[]): SeriesRow[] {
  const s = room.series!;
  const ranks = s.final ?? seriesRanks(s, view.config.teams);
  return Object.keys(s.seats)
    .map((id) => {
      const slot = view.fighters.find((f) => f.id === id)?.slot;
      const look = slot !== undefined ? looks[slot] : undefined;
      const seat = room.seats.find((x) => x.id === id);
      return {
        id,
        rank: ranks[id] ?? Object.keys(s.seats).length,
        points: s.points[id] ?? 0,
        places: s.places[id] ?? [],
        name: look?.name ?? seat?.name ?? s.seats[id]!.name,
        color: look?.color,
        avatar: look?.avatar ?? seat?.avatar,
        team: s.seats[id]!.team,
        me: id === room.you.seatId,
      };
    })
    .sort((a, b) => a.rank - b.rank || b.points - a.points);
}

/** Le titre du classement aux points : qui mène (entre deux manches) ou qui gagne (à la fin) */
export function seriesTitle(rows: SeriesRow[], teams: boolean, done: boolean): string {
  const first = rows.filter((r) => r.rank === 1);
  if (first.length === 0) return done ? "Fin des combats" : "Les scores";
  if (teams) {
    const sides = new Set(first.map((r) => r.team));
    if (sides.size > 1) return "Égalité";
    const side = first[0]!.team === 0 ? "Rouges" : "Bleus";
    return done ? `Victoire des ${side} aux points` : `Les ${side} mènent`;
  }
  if (first.length > 1) return "Égalité en tête";
  return done ? `${first[0]!.name} gagne aux points !` : `${first[0]!.name} mène !`;
}

/** Une ligne du classement aux points : la place, le total, ce que la dernière manche a rapporté, chaque manche */
export function SeriesLine({ row, last }: { row: SeriesRow; last: number }) {
  const gained = row.places[last] ?? 0;
  return (
    <li className={`${row.rank === 1 ? "is-first" : ""} ${row.me ? "is-me" : ""}`}>
      <span className="cb-rank num">{place(row.rank)}</span>
      {row.avatar ? <AvatarDrawing avatar={row.avatar} size={36} /> : <span />}
      <span className="cb-rank-name" style={{ color: row.color }}>
        {row.name}
      </span>
      <span className="cb-rank-stats">
        <span>
          <strong className="num">{row.points}</strong> pts
        </span>
        {gained > 0 && <span className="cb-series-gain num">+{roundPoints(gained)}</span>}
        <span className="cb-series-places">
          {row.places.map((p, i) => (
            <span key={i} className={`num ${p === 1 ? "is-win" : ""}`} title={`Manche ${i + 1}`}>
              {p > 0 ? place(p) : "—"}
            </span>
          ))}
        </span>
      </span>
    </li>
  );
}

/** Le compte à rebours jusqu'à une heure du serveur, en secondes */
function useCountdown(at: number | null, serverNow: number): number {
  const [skew] = useState(() => serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - (now + skew)) / 1000)) : 0;
}

/** Entre deux manches : les points de chacun, puis la manche suivante part toute seule */
export function SeriesBoard({ room, view, looks }: { room: CulbuteRoomView; view: CulbuteView; looks: FighterLook[] }) {
  const s = room.series!;
  const rows = seriesRows(room, view, looks);
  const left = useCountdown(s.nextAt, room.serverNow);
  return (
    <div className="cb-over cb-series">
      <div className="cb-over-card panel">
        <p className="cb-series-kicker">
          Manche {s.round} sur {s.rounds} terminée
        </p>
        <h1>{seriesTitle(rows, view.config.teams, false)}</h1>
        <ol className="cb-ranking">
          {rows.map((row) => (
            <SeriesLine key={row.id} row={row} last={s.round - 1} />
          ))}
        </ol>
        <p className="cb-series-next" aria-live="polite">
          {s.round + 1 === s.rounds ? "Dernière manche" : `Manche ${s.round + 1}`} dans <strong className="num">{left}</strong> s
        </p>
      </div>
    </div>
  );
}

/** Pendant le combat : quelle manche */
export function SeriesBadge({ series }: { series: CulbuteSeries }) {
  return (
    <span className="cb-series-badge">
      Manche <strong className="num">{series.round}</strong> / {series.rounds}
    </span>
  );
}
