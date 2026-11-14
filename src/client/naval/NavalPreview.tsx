import type { CSSProperties } from "react";
import { cellX, cellY } from "../../shared/games/naval/engine.ts";
import type { NavalBoardView } from "../../shared/games/naval/view.ts";
import { Board, MARGIN } from "./Board.tsx";
import { CELL } from "./ships.tsx";
import "./naval.css";

// Une partie en cours : deux navires touchés qui brûlent, des gerbes à l'eau
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

// Et l'adversaire tire encore, toutes les 2,5 s, sur des cases déjà marquées : l'image reste juste à chaque reprise
// de la boucle (7,5 s). Les effets sont ceux du jeu : l'obus et son ombre, puis la gerbe ou l'explosion.
const SHOTS: { cell: number; hit: boolean; at: number }[] = [
  { cell: 27, hit: false, at: 0.6 },
  { cell: 20, hit: true, at: 3.1 },
  { cell: 45, hit: false, at: 5.6 },
];

/** Une gouttelette ou une étincelle qui part dans la direction `angle` (degrés) */
function burst(angle: number, distance: number): CSSProperties {
  const rad = (angle * Math.PI) / 180;
  return {
    ["--dx" as string]: `${(Math.cos(rad) * distance).toFixed(2)}px`,
    ["--dy" as string]: `${(Math.sin(rad) * distance).toFixed(2)}px`,
  };
}

/** L'illustration de la bataille navale sur l'accueil : une vraie mer de jeu, en petit, sous le feu. */
export function NavalPreview({ px }: { px: number }) {
  const span = SAMPLE.size * CELL;
  const viewBox = `${-MARGIN} ${-MARGIN} ${span + MARGIN + 1} ${span + MARGIN + 1}`;
  return (
    <div className="naval-preview">
      <Board board={SAMPLE} mode="sea" px={px} label="Aperçu de la bataille navale" />
      <svg className="naval-preview-fx" viewBox={viewBox} width={px} height={px} aria-hidden="true">
        {SHOTS.map(({ cell, hit, at }) => (
          <g
            key={cell}
            className="np-shot"
            transform={`translate(${(cellX(SAMPLE.size, cell) + 0.5) * CELL} ${(cellY(SAMPLE.size, cell) + 0.5) * CELL})`}
            style={{ "--d": `${at}s` } as CSSProperties}
          >
            <circle className="np-shadow" r={2.6} />
            {hit ? (
              <>
                <circle className="np-core" r={3} />
                <circle className="np-ring is-fire" r={3} />
                {[0, 60, 120, 180, 240, 300].map((a) => (
                  <circle key={a} className="np-spark" r={0.8} style={burst(a + 15, 6.5)} />
                ))}
              </>
            ) : (
              <>
                <circle className="np-ring" r={2} />
                <circle className="np-ring is-late" r={2} />
                {[0, 72, 144, 216, 288].map((a) => (
                  <circle key={a} className="np-drop" r={0.7} style={burst(a - 90, 5.5)} />
                ))}
              </>
            )}
            <circle className="np-shell" r={1.6} />
          </g>
        ))}
      </svg>
    </div>
  );
}
