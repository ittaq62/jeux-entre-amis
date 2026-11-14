// Chaque célébration de la boutique en un petit bonhomme : on voit d'un coup d'œil le geste qu'on achète.

import type { FeteId } from "../../shared/games/crampons/boutique.ts";

/** Les bras de chaque geste (le corps, la tête et les jambes sont communs, sauf à genoux) */
const ARMS: Record<FeteId, string> = {
  maison: "M14 17 L9 7 M26 17 L31 7",
  "bras-croises": "M14 17 L13 24 L27 21 M26 17 L27 25 L13 22",
  oreille: "M14 17 L9 10 L15 8 M26 17 L28 29",
  salut: "M14 17 L8 8 L16 5 M26 17 L28 29",
  toupie: "M14 17 L3 17 M26 17 L37 17",
  genoux: "M14 17 L8 6 M26 17 L32 6",
};

export function FetePicto({ fete, size = 44 }: { fete: FeteId; size?: number }) {
  const kneel = fete === "genoux";
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 40 48" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d={kneel ? "M20 16 L20 31" : "M20 15 L20 30"} />
        <path d="M14 17 L26 17" />
        <path d={ARMS[fete]} />
        {/* À genoux : les cuisses à la verticale, les tibias posés vers l'arrière */}
        <path d={kneel ? "M20 31 L15 40 L10 41 M20 31 L25 40 L30 41" : "M20 30 L15 44 M20 30 L25 44"} />
        {fete === "toupie" && <path d="M10 46 Q20 50 30 46" strokeWidth={2} />}
        {fete === "toupie" && <path d="M27 43.5 L30.5 46 L27 48" strokeWidth={2} />}
      </g>
      <circle cx={20} cy={kneel ? 10 : 9} r={5} fill="currentColor" />
    </svg>
  );
}
