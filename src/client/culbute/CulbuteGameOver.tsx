import { ARENAS } from "../../shared/games/culbute/arenas.ts";
import type { CulbuteClientMessage, CulbuteRoomView } from "../../shared/games/culbute/net.ts";
import { MODE_NAMES, type CulbuteView } from "../../shared/games/culbute/view.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { FighterStageView } from "./FighterStageView.tsx";
import type { FighterLook } from "./scene/CulbuteScene.ts";

const place = (r: number) => (r === 1 ? "1er" : `${r}e`);

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
  const winners = order.filter((i) => ranks[i] === 1);
  const teamWin = view.config.teams && winners.length > 0;
  const title =
    winners.length === 0
      ? "Fin du combat"
      : teamWin
        ? `Victoire des ${view.fighters[winners[0]!]!.team === 0 ? "Rouges" : "Bleus"}`
        : winners.length === 1
          ? `${looks[winners[0]!]?.name ?? "?"} gagne !`
          : "Égalité en tête";
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
          {MODE_NAMES[view.config.mode]} · {ARENAS[view.arena].name}
        </p>
        <EloLine result={room.results?.[room.you.userId]} />
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
        {inTour ? (
          <p className="tour-next-note">
            <span className="spinner" /> La tournée continue : le classement arrive.
          </p>
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
