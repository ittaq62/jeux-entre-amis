import type { CSSProperties, ReactNode } from "react";
import { ANNOUNCE_MS } from "../../shared/announce.ts";
import { tableTeamName } from "../../shared/games/teams.ts";
import { GAME_NAMES, type GameId, type SeatView } from "../../shared/protocol.ts";
import { drawnLines } from "../../shared/randomRules.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCountdown } from "../lib/countdown.ts";
import { play } from "../lib/sound.ts";
import { useTourBridge } from "./bridge.ts";
import { GameTicket } from "./TourParts.tsx";
import "./tablePick.css";

// L'annonce, juste avant la partie : dans une tournée (on ne passe pas par le salon de chaque jeu), et avant une revanche.
// Elle dit le jeu, les règles de la partie, les joueurs et leurs équipes ; chacun y choisit ses skins (son pion, son
// véhicule, le dos de ses cartes…). Le compte à rebours part quand tout le monde est arrivé ; la partie démarre plus tôt
// si tous sont prêts.

/** Ce que la fenêtre lit de la table, quel que soit le jeu */
export interface PickRoom {
  seats: SeatView[];
  you: { userId: string; seatId: string | null };
  pickUntil?: number | null;
  ready?: string[];
}

export function TablePick({
  game,
  room,
  serverOffset,
  onReady,
  children,
  seatLook,
  seatColor,
  drawn,
  teamName,
  teamOf = (s) => s.team,
}: {
  game: GameId;
  room: PickRoom;
  serverOffset: number;
  onReady: () => void;
  /** Le choix des skins de ce jeu (seulement pour un joueur assis) */
  children?: ReactNode;
  /** À côté de chaque joueur, ce qu'il a choisi (son pion…) */
  seatLook?: (seat: SeatView, index: number) => ReactNode;
  /** La couleur de chaque joueur à la table (celle de son pion…) */
  seatColor?: (seat: SeatView, index: number) => string;
  /** Hors tournée : les règles tirées au sort pour cette partie (rien quand l'hôte les a choisies) */
  drawn?: string | null;
  /**
   * La table joue en équipes : le nom de chacune. Sans rien, en tournée, les équipes de la tournée sont reconnues
   * seules ; `null` : pas d'équipes (le jeu range tout le monde dans une équipe même chacun pour soi).
   */
  teamName?: ((team: number) => string) | null;
  /** L'équipe de chaque joueur, quand le jeu ne la range pas dans la place (Crampons) */
  teamOf?: (seat: SeatView) => number | undefined;
}) {
  const bridge = useTourBridge();
  const left = useCountdown(room.pickUntil ?? null, serverOffset);
  const mine = room.you.seatId ? room.seats.find((s) => s.id === room.you.seatId) : undefined;
  const ready = room.ready ?? [];
  const meReady = ready.includes(room.you.userId);
  // Les règles de la partie, une par ligne : le format, puis chaque règle à part tirée ou votée
  const [rules, ...extras] = (bridge ? bridge.rules : drawnLines(game, drawn)) ?? [];
  // Les équipes : celles que donne le jeu, ou celles de la tournée quand les places en ont
  const names = teamName === null ? null : (teamName ?? (bridge && room.seats.some((s) => teamOf(s) !== undefined) ? tableTeamName : null));
  const teams = names
    ? [...new Set(room.seats.map((s) => teamOf(s)).filter((t): t is number => t !== undefined))].sort((a, b) => a - b)
    : [];
  const total = Math.round(ANNOUNCE_MS / 1000);

  const seatItem = (s: SeatView) => {
    const k = room.seats.indexOf(s);
    const isReady = s.kind === "bot" || (s.userId !== null && ready.includes(s.userId));
    return (
      <li
        key={s.id}
        className={`${isReady ? "is-ready" : ""} ${s.kind === "human" && !s.connected ? "is-away" : ""}`}
        style={seatColor ? ({ ["--seat" as string]: seatColor(s, k) } as CSSProperties) : undefined}
      >
        {seatLook?.(s, k)}
        <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={26} />
        <span>{s.name}</span>
        {isReady ? <Icon name="check" size={16} /> : <span className="table-pick-wait" aria-label="pas encore prêt" />}
      </li>
    );
  };

  return (
    <div className="felt center-screen table-pick-screen">
      <section className="panel table-pick" aria-label={`Avant la partie de ${GAME_NAMES[game]}`}>
        <header className="table-pick-head">
          <GameTicket game={game} size="sm" chosen />
          <div className="table-pick-title">
            <span className="table-pick-kicker">{bridge ? bridge.progress : "Revanche"}</span>
            <h2>{GAME_NAMES[game]}</h2>
          </div>
          <div
            className={`table-pick-count ${left !== null && left <= 3 ? "is-soon" : ""}`}
            role="timer"
            aria-label={left !== null ? `La partie commence dans ${left} secondes` : "On attend que tout le monde arrive"}
          >
            {left !== null ? (
              <>
                <strong className="num">{left}</strong>
                <span>s</span>
              </>
            ) : (
              <span className="spinner" />
            )}
          </div>
        </header>
        <div className="table-pick-time">
          <div className="table-pick-bar" aria-hidden>
            <i style={{ width: `${left !== null ? Math.min(100, (left / total) * 100) : 100}%` }} />
          </div>
          <p className="hint" aria-live="polite">
            {left !== null
              ? "La partie commence à la fin du compte, plus tôt si tout le monde est prêt."
              : "On attend que tout le monde arrive à la table…"}
          </p>
        </div>
        {rules && (
          <div className="table-pick-rules">
            <Icon name="dice" size={20} />
            <div>
              <strong>Règles : {rules.name}</strong>
              <p>{rules.blurb}</p>
              {extras.length > 0 && (
                <ul className="table-pick-rule-list">
                  {extras.map((r) => (
                    <li key={r.id} className={r.kind === "off" ? "is-off" : ""}>
                      <strong>{r.name}</strong> : {r.blurb}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {mine && children && <div className="table-pick-body">{children}</div>}
        <footer className="table-pick-foot">
          {names && teams.length > 1 ? (
            <div className="table-pick-teams" aria-label="Les équipes">
              {teams.map((t) => (
                <div key={t} className="table-pick-team">
                  <span className="table-pick-team-name">{names(t)}</span>
                  <ul className="table-pick-seats">{room.seats.filter((s) => teamOf(s) === t).map(seatItem)}</ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="table-pick-seats" aria-label="Les joueurs">
              {room.seats.map(seatItem)}
            </ul>
          )}
          {mine && (
            <button
              className="btn btn-primary btn-lg table-pick-ready"
              disabled={meReady}
              onClick={() => {
                play("click");
                onReady();
              }}
            >
              {meReady ? "Prêt : on attend les autres" : "Je suis prêt"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
