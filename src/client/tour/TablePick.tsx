import type { CSSProperties, ReactNode } from "react";
import { GAME_NAMES, type GameId, type SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCountdown } from "../lib/countdown.ts";
import { play } from "../lib/sound.ts";
import { GameTicket } from "./TourParts.tsx";

// Dans une tournée, on ne passe pas par le salon de chaque jeu : juste avant la partie, la table ouvre une fenêtre où
// chacun choisit ses skins (son pion, son véhicule, le dos de ses cartes…). Le compte à rebours part quand tout le monde
// est arrivé ; la partie démarre plus tôt si tous sont prêts.

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
}) {
  const left = useCountdown(room.pickUntil ?? null, serverOffset);
  const mine = room.you.seatId ? room.seats.find((s) => s.id === room.you.seatId) : undefined;
  const ready = room.ready ?? [];
  const meReady = ready.includes(room.you.userId);
  return (
    <div className="felt center-screen table-pick-screen">
      <section className="panel table-pick" aria-label={`Avant la partie de ${GAME_NAMES[game]}`}>
        <header className="table-pick-head">
          <GameTicket game={game} size="sm" chosen />
          <div>
            <h2>{GAME_NAMES[game]}</h2>
            <p className="hint" aria-live="polite">
              {left !== null ? (
                <>
                  La partie commence dans <strong className="num">{left} s</strong>
                </>
              ) : (
                "On attend que tout le monde arrive…"
              )}
            </p>
          </div>
        </header>
        {mine && children && <div className="table-pick-body">{children}</div>}
        <footer className="table-pick-foot">
          <ul className="table-pick-seats" aria-label="Les joueurs">
            {room.seats.map((s, k) => {
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
                  {isReady && <Icon name="check" size={16} />}
                </li>
              );
            })}
          </ul>
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
