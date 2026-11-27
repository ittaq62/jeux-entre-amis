// Les vignettes de la boutique pour La Cour des Grands : le maillot (son motif sur une silhouette de t-shirt) et l'éclat
// qui salue une épreuve passée (quelques confettis, bulles, pétales, paillettes ou étincelles autour d'une étoile).

import type { CSSProperties } from "react";
import { JerseySwatch } from "./LookPicker.tsx";
import "./cour.css";

const CHEER_COLORS: Record<string, string[]> = {
  confettis: ["#ff5d6c", "#ffd43b", "#4dabf7", "#69db7c"],
  bulles: ["#bfe8f5", "#e3f4ff", "#ffffff"],
  feuilles: ["#f78fb3", "#ffb3c6", "#ffd6e0"],
  paillettes: ["#ffd84a", "#fff1b8", "#e9b43b"],
  feu: ["#ff6b3a", "#ffd23f", "#ff3f86", "#4dabf7"],
};

export function CourShopLook({ kind, id, big = false }: { kind: string; id: string; big?: boolean }) {
  const size = big ? 120 : 52;
  if (kind === "courmaillot") return <JerseySwatch id={id} size={size} />;
  const colors = CHEER_COLORS[id] ?? CHEER_COLORS.confettis!;
  return (
    <span className="cg-cheer" style={{ width: size, height: size } as CSSProperties} aria-hidden="true">
      {Array.from({ length: big ? 18 : 10 }, (_, k) => {
        const a = (k / (big ? 18 : 10)) * Math.PI * 2;
        const r = 0.32 + (k % 3) * 0.06;
        const round = id === "bulles";
        return (
          <i
            key={k}
            style={{
              left: `${50 + Math.cos(a) * r * 100}%`,
              top: `${50 + Math.sin(a) * r * 100}%`,
              background: colors[k % colors.length],
              borderRadius: round ? "50%" : id === "feuilles" ? "50% 0" : "2px",
              transform: `rotate(${k * 37}deg)`,
              width: round ? "16%" : "11%",
              height: round ? "16%" : "6%",
            }}
          />
        );
      })}
      <b>★</b>
    </span>
  );
}
