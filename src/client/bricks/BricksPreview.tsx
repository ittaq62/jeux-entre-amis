import { useEffect, useRef } from "react";
import { COLS, emptyGrid, ROWS, type Active } from "../../shared/games/bricks/engine.ts";
import { boardSize, drawBoard } from "./draw.ts";

// Un duel, figé : à gauche, une ligne complète s'en va ; à droite, l'adversaire voit monter les lignes grises
const MINE_BOTTOM_UP = [
  "734411526.",
  "655243317.",
  "1122667541",
  "4455.32114",
  ".331..6625",
  "221....425",
  "27.....42.",
  "2......4..",
];
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
}: {
  rows: string[];
  piece: Active;
  ghost: Active | null;
  cell: number;
  flash?: number;
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
      <svg className="bricks-preview-attack" viewBox="0 0 56 40" aria-hidden="true">
        <defs>
          <linearGradient id="bricks-trail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffd98a" stopOpacity="0" />
            <stop offset="1" stopColor="#ffd98a" />
          </linearGradient>
        </defs>
        <path d="M0 20C14 13 30 13 44 17V23C30 27 14 27 0 20Z" fill="url(#bricks-trail)" />
        <rect x="36" y="12" width="16" height="16" rx="3" fill="#8b8e96" stroke="#fff1cf" strokeWidth="2" />
        <rect x="40" y="16" width="8" height="3.4" rx="1.4" fill="#fff" opacity="0.55" />
      </svg>
      <div className="bricks-preview-theirs">
        <Board rows={THEIRS_BOTTOM_UP} piece={THEIR_PIECE} ghost={null} cell={Math.round(cell * 0.68)} />
      </div>
    </div>
  );
}
