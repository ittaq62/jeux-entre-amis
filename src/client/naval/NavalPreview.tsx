import type { NavalBoardView } from "../../shared/games/naval/view.ts";
import { Board } from "./Board.tsx";
import "./naval.css";

// Une partie en cours, figée : deux navires touchés qui brûlent, des gerbes à l'eau
const SAMPLE: NavalBoardView = {
  owner: "apercu",
  size: 8,
  misses: [3, 12, 27, 45, 50],
  hits: [19, 20, 42],
  sunk: [],
  ships: [
    { kind: "croiseur", x: 1, y: 2, dir: "h", id: 0, hits: [19, 20], sunk: false },
    { kind: "contre-torpilleur", x: 6, y: 3, dir: "v", id: 1, hits: [], sunk: false },
    { kind: "sous-marin", x: 0, y: 5, dir: "h", id: 2, hits: [42], sunk: false },
    { kind: "torpilleur", x: 4, y: 7, dir: "h", id: 3, hits: [], sunk: false },
  ],
  scans: [],
  afloat: 4,
  out: false,
};

/** L'illustration de la bataille navale sur l'accueil : une vraie mer de jeu, en petit. */
export function NavalPreview({ px }: { px: number }) {
  return (
    <div className="naval-preview">
      <Board board={SAMPLE} mode="sea" px={px} label="Aperçu de la bataille navale" />
    </div>
  );
}
