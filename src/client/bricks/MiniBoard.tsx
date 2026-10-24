import { useEffect, useRef } from "react";
import { gridFromString } from "../../shared/games/bricks/engine.ts";
import type { BricksPlayerView } from "../../shared/games/bricks/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { AwayNote } from "../game/AwayNote.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { boardSize, drawBoard, Effects } from "./draw.ts";
import { useLive } from "./useBricksRoom.ts";

/** Effets des petits plateaux, pour que la table y fasse éclater les lignes des autres */
export const miniEffects = new Map<string, Effects>();

interface Props {
  player: BricksPlayerView;
  seat: SeatView | undefined;
  cell: number;
  serverOffset: number;
  /** Je l'attaque en ce moment */
  targeted: boolean;
  /** Il m'attaque en ce moment (sa cible, c'est moi) */
  threat: boolean;
  teamLabel?: string;
  onPick?: () => void;
  compact?: boolean;
}

/** Le plateau d'un adversaire, en petit : sa pile, sa pièce en vol, ses lignes grises en attente. */
export function MiniBoard({ player, seat, cell, serverOffset, targeted, threat, teamLabel, onPick, compact }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useLive((s) => s.pieces[player.id] ?? null);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { width, height } = boardSize(cell);
  const fx = useRef<Effects>(miniEffects.get(player.id) ?? new Effects());
  miniEffects.set(player.id, fx.current);

  useEffect(() => () => void miniEffects.delete(player.id), [player.id]);

  // Redessiné à chaque changement, et en continu tant qu'un effet est en cours
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const grid = gridFromString(player.grid);
    const now = Date.now() + serverOffset;
    const dim = !player.alive || (player.koUntil !== null && player.koUntil > now);
    let raf = 0;
    let last = performance.now();
    const draw = (t: number) => {
      fx.current.step(Math.min(50, t - last), cell);
      last = t;
      drawBoard(ctx, { grid, piece: dim ? null : live, ghost: null, cell, dpr, effects: fx.current, dim, pieceAlpha: 0.85 });
      if (fx.current.busy) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [player.grid, player.alive, player.koUntil, live, cell, dpr, serverOffset]);

  const koActive = player.koUntil !== null && player.koUntil > Date.now() + serverOffset;
  return (
    <div
      className={`mini-board ${targeted ? "is-targeted" : ""} ${threat ? "is-threat" : ""} ${!player.alive ? "is-out" : ""} ${compact ? "is-compact" : ""}`}
      style={{ ["--cell" as string]: `${cell}px` }}
      onClick={onPick}
      role={onPick ? "button" : undefined}
      aria-label={onPick ? `Viser ${seat?.name ?? "ce joueur"}` : undefined}
    >
      <div className="mini-head">
        {seat && !compact && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={22} />}
        <span className="mini-name">{seat?.name ?? "?"}</span>
        {teamLabel && !compact && <span className="hint">{teamLabel}</span>}
        <span className="mini-kos num" title="K.O. dans la manche">
          {player.kos > 0 ? `${player.kos} K.O.` : ""}
        </span>
      </div>
      <div className="mini-frame" data-board={player.id} style={{ width, height, ["--cell" as string]: `${cell}px` }}>
        <div className="garbage-meter is-mini" aria-hidden="true">
          <div className="garbage-fill" style={{ height: `${Math.min(100, (player.pending / 20) * 100)}%` }} />
        </div>
        <canvas
          ref={canvas}
          width={width * dpr}
          height={height * dpr}
          style={{ width, height }}
          aria-label={`Plateau de ${seat?.name ?? "?"}`}
        />
        {koActive && <div className="board-stamp is-ko is-small">K.O.</div>}
        {!player.alive && <div className="board-stamp is-small">{player.place ? `${player.place}e` : "Éliminé"}</div>}
      </div>
      {seat && !compact && <AwayNote seat={seat} serverOffset={serverOffset} compact />}
    </div>
  );
}
