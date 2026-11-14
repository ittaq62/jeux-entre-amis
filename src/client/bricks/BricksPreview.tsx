import { useEffect, useRef } from "react";
import { COLS, emptyGrid, ROWS, type Active } from "../../shared/games/bricks/engine.ts";
import { boardSize, drawBoard } from "./draw.ts";

// Un duel : à gauche, une ligne complète brille puis part chez l'adversaire, à droite, qui la reçoit par le bas en ligne
// grise (l'animation est en CSS, dans banners.css ; ses positions supposent cell = 17)
const MINE_BOTTOM_UP = ["734411526.", "655243317.", "1122667541", "4455.32114", ".331..6625", "221....425", "27.....42.", "2......4.."];
const THEIRS_BOTTOM_UP = [
  "88888.8888",
  "8888888.88",
  "8.88888888",
  "88888.8888",
  "888.888888",
  "33445.6611",
  "334.5.661.",
  "27...55.1.",
  "2.....5...",
];
const MY_PIECE: Active = { type: "T", rot: 2, x: 3, y: ROWS - 15 };
const MY_GHOST: Active = { ...MY_PIECE, y: ROWS - 7 };
const THEIR_PIECE: Active = { type: "S", rot: 0, x: 3, y: ROWS - 18 };
/** La rangée complète, comptée depuis le bas */
const FULL_ROW = 2;

function gridOf(rows: string[]) {
  const g = emptyGrid();
  rows.forEach((row, i) => {
    const y = ROWS - 1 - i;
    [...row].forEach((c, x) => (g[y * COLS + x] = c === "." ? 0 : Number(c)));
  });
  return g;
}

function Board({
  rows,
  piece,
  ghost,
  cell,
  flash,
  impact,
}: {
  rows: string[];
  piece: Active;
  ghost: Active | null;
  cell: number;
  flash?: number;
  impact?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { width, height } = boardSize(cell);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawBoard(ctx, { grid: gridOf(rows), piece, ghost, cell, dpr });
  }, [rows, piece, ghost, cell, dpr]);
  return (
    <div className="bricks-preview-board" style={{ width, height }}>
      <canvas ref={canvas} width={width * dpr} height={height * dpr} style={{ width, height }} />
      {flash !== undefined && <span className="bricks-preview-flash" style={{ bottom: flash * cell, height: cell }} />}
      {impact && <span className="bricks-preview-impact" style={{ height: cell }} />}
    </div>
  );
}

/** L'illustration de Briques sur l'accueil, dessinée avec le vrai moteur de rendu du jeu. */
export function BricksPreview({ cell }: { cell: number }) {
  return (
    <div className="bricks-preview">
      <div className="bricks-preview-mine">
        <Board rows={MINE_BOTTOM_UP} piece={MY_PIECE} ghost={MY_GHOST} cell={cell} flash={FULL_ROW} />
      </div>
      <div className="bricks-preview-theirs">
        <Board rows={THEIRS_BOTTOM_UP} piece={THEIR_PIECE} ghost={null} cell={Math.round(cell * 0.68)} impact />
      </div>
      {/* La ligne envoyée, de son plateau à celui d'en face : dorée au départ, grise (avec son trou) à l'arrivée */}
      <span className="bricks-preview-line" aria-hidden="true">
        <i className="is-gold" />
        <i className="is-grey" />
      </span>
    </div>
  );
}
