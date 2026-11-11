import { deClub } from "../../shared/games/crampons/clubs.ts";
import type { TeamStats } from "../../shared/games/crampons/model.ts";
import type { CramponsClientMessage, CramponsRoomView } from "../../shared/protocol.ts";

const ROWS: [string, (s: TeamStats, total: TeamStats) => string][] = [
  ["Tirs", (s) => String(s.shots)],
  ["Cadrés", (s) => String(s.onTarget)],
  ["Passes réussies", (s) => (s.passes > 0 ? `${Math.round((s.passesOk / s.passes) * 100)} %` : "–")],
  [
    "Possession",
    (s, t) => (s.possession + t.possession > 0 ? `${Math.round((s.possession / (s.possession + t.possession)) * 100)} %` : "–"),
  ],
  ["Corners", (s) => String(s.corners)],
  ["Fautes", (s) => String(s.fouls)],
  ["Hors-jeu", (s) => String(s.offsides)],
  ["Cartons", (s) => String(s.yellow + s.red)],
];

/** Le tableau de fin : le score, les buteurs, les statistiques, et la revanche. */
export function CramponsGameOver({
  room,
  send,
  onLeave,
  onShowLobby,
}: {
  room: CramponsRoomView;
  send: (m: CramponsClientMessage) => void;
  onLeave: () => void;
  onShowLobby: () => void;
}) {
  const v = room.crampons!;
  const [a, b] = v.stats;
  const title = v.winner === null ? "Match nul" : `Victoire ${deClub(v.teams[v.winner].name)}`;
  const asked = room.rematch.includes(room.you.userId);
  const sa = v.shootout?.kicks[0].filter(Boolean).length;
  const sb = v.shootout?.kicks[1].filter(Boolean).length;
  const myResult = room.results?.[room.you.userId];
  return (
    <div className="cr-over">
      <div className="cr-over-card panel">
        <h1>{title}</h1>
        <p className="cr-over-score num">
          <span>{v.teams[0].short}</span> {v.score[0]} - {v.score[1]} <span>{v.teams[1].short}</span>
        </p>
        {v.shootout && (
          <p className="hint">
            Tirs au but : {sa} - {sb}
          </p>
        )}
        {myResult && (
          <p className="hint">
            Elo : {myResult.elo} ({myResult.delta >= 0 ? "+" : ""}
            {myResult.delta})
          </p>
        )}
        {v.goals.length > 0 && (
          <ul className="cr-scorers">
            {v.goals.map((g, i) => (
              <li key={i} className={g.team === 1 ? "is-right" : ""}>
                <span className="num">{g.minute}'</span> {g.scorer}
                {g.own ? " (c.s.c.)" : ""}
              </li>
            ))}
          </ul>
        )}
        <table className="cr-stats">
          <tbody>
            {ROWS.map(([label, read]) => (
              <tr key={label}>
                <td className="num">{read(a, b)}</td>
                <th scope="row">{label}</th>
                <td className="num">{read(b, a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="cr-over-actions">
          <button className="btn btn-primary" disabled={asked} onClick={() => send({ t: "rematch" })}>
            {asked ? "En attente des autres" : "Revanche"}
          </button>
          {room.you.isHost && (
            <button className="btn" onClick={onShowLobby}>
              Changer les règles
            </button>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            Quitter
          </button>
        </div>
      </div>
    </div>
  );
}
