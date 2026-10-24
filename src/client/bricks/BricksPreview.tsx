import { useEffect, useRef } from "react";
import { COLS, emptyGrid, ROWS, type Active } from "../../shared/games/bricks/engine.ts";
import { boardSize, drawBoard } from "./draw.ts";

// Une pile en cours, figée : un puits à droite qui attend sa barre
const ROWS_BOTTOM_UP = ["734411526.", "655243317.", "112266754.", "4455.3211.", ".3317.662.", "..2.....5."];
const PIECE: Active = { type: "I", rot: 1, x: 7, y: ROWS - 11 };

function sampleGrid() {
  const g = emptyGrid();
  ROWS_BOTTOM_UP.forEach((row, i) => {
    const y = ROWS - 1 - i;
    [...row].forEach((c, x) => (g[y * COLS + x] = c === "." ? 0 : Number(c)));
  });
  return g;
}

/** L'illustration de Briques sur l'accueil, dessinée avec le vrai moteur de rendu du jeu. */
export function BricksPreview({ cell }: { cell: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { width, height } = boardSize(cell);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawBoard(ctx, { grid: sampleGrid(), piece: PIECE, ghost: { ...PIECE, y: ROWS - 4 }, cell, dpr });
  }, [cell, dpr]);
  return (
    <div className="bricks-preview" style={{ ["--cell" as string]: `${cell}px` }}>
      <canvas ref={canvas} width={width * dpr} height={height * dpr} style={{ width, height }} />
    </div>
  );
}
