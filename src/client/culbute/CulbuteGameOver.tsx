import { ARENAS } from "../../shared/games/culbute/arenas.ts";
import type { CulbuteClientMessage, CulbuteRoomView } from "../../shared/games/culbute/net.ts";
import { MODE_NAMES, type CulbuteView } from "../../shared/games/culbute/view.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TourNextNote } from "../tour/TourNextNote.tsx";
import { EveningLine } from "../components/EveningLine.tsx";
import { FighterStageView } from "./FighterStageView.tsx";
import type { FighterLook } from "./scene/CulbuteScene.ts";
import { overTitle } from "./overTitle.ts";
import { place, SeriesLine, seriesRows, seriesTitle } from "./SeriesBoard.tsx";

/** La feuille de fin : les places, ce que chacun a fait, et la revanche (dans une tournée, le jeu suivant). */
export function CulbuteGameOver({
  room,
  view,
  looks,
  send,
  onLeave,
  onShowLobby,
}: {
  room: CulbuteRoomView;
  view: CulbuteView;
  looks: FighterLook[];
  send: (m: CulbuteClientMessage) => void;
  onLeave: () => void;
  onShowLobby: () => void;
}) {
  const inTour = Boolean(useTourBridge());
  const ranks = view.ranks ?? [];
  const order = view.fighters.map((f) => f.slot).sort((a, b) => (ranks[a] ?? 9) - (ranks[b] ?? 9));
  // En tournée, plusieurs manches : c'est le total des points qui classe
  const series = room.series?.final ? room.series : null;
  const rows = series ? seriesRows(room, view, looks) : [];
  const seriesWinner = rows.find((r) => r.rank === 1);
  const seriesWinnerSlot = view.fighters.find((f) => f.id === seriesWinner?.id)?.slot;
  const winners = series ? (seriesWinnerSlot !== undefined ? [seriesWinnerSlot] : []) : order.filter((i) => ranks[i] === 1);
  const title = series ? seriesTitle(rows, view.config.teams, true) : overTitle(view, (slot) => looks[slot]?.name);
  const seated = room.you.seatId !== null;
  const asked = room.rematch.includes(room.you.userId);
  const timed = view.config.mode === "temps";
  return (
    <div className="cb-over">
      <div className="cb-over-card panel">
        {winners.length > 0 && looks[winners[0]!] && (
          <FighterStageView look={looks[winners[0]!]!} mode="victory" ratio={16 / 7} className="cb-victory" label={title} />
        )}
        <h1>{title}</h1>
        <p className="hint" style={{ margin: 0 }}>
          {series
            ? `${series.round} manche${series.round > 1 ? "s" : ""}, ${MODE_NAMES[view.config.mode].toLowerCase()} · places de chaque manche`
            : `${MODE_NAMES[view.config.mode]} · ${ARENAS[view.arena].name}`}
        </p>
        <EloLine result={room.results?.[room.you.userId]} />
        {series && (
          <ol className="cb-ranking">
            {rows.map((row) => (
              <SeriesLine key={row.id} row={row} last={series.round - 1} />
            ))}
          </ol>
        )}
        {!series && (
          <ol className="cb-ranking">
            {order.map((slot) => {
              const look = looks[slot];
              const st = view.stats?.[slot];
              if (!look || !st) return null;
              return (
                <li key={slot} className={`${ranks[slot] === 1 ? "is-first" : ""} ${look.me ? "is-me" : ""}`}>
                  <span className="cb-rank num">{place(ranks[slot] ?? 0)}</span>
                  <AvatarDrawing avatar={look.avatar} size={36} />
                  <span className="cb-rank-name" style={{ color: look.color }}>
                    {look.name}
                  </span>
                  <span className="cb-rank-stats">
                    <span>
                      <strong className="num">{st.kos}</strong> sortie{st.kos > 1 ? "s" : ""}
                    </span>
                    <span>
                      <strong className="num">{st.falls}</strong> chute{st.falls > 1 ? "s" : ""}
                    </span>
                    <span>
                      <strong className="num">{Math.round(st.dealt)}</strong> % infligés
                    </span>
                    {timed && (
                      <span>
                        <strong className="num">{st.kos - st.falls}</strong> pts
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <EveningLine game="culbute" />
        {inTour ? (
          // La feuille reste jusqu'à l'entracte (15 s), ou jusqu'à ce que tous les joueurs aient continué
          <TourNextNote />
        ) : (
          !seated && (
            <p className="hint" style={{ margin: 0 }}>
              Tu regardes ce combat : reste pour voir le suivant.
            </p>
          )
        )}
        <div className="cb-over-actions">
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
        <ReportButton
          game="culbute"
          variant={`Culbute, ${MODE_NAMES[view.config.mode].toLowerCase()}, ${ARENAS[view.arena].name}`}
          code={room.code}
          role={room.you.seatId ? "player" : "watcher"}
        />
      </div>
    </div>
  );
}
