// Le maillot d'un club en petit, dessiné à plat avec son motif : pour la boutique, où l'on découvre les clubs de légende.

import { useId } from "react";
import type { Club } from "../../shared/games/crampons/clubs.ts";

const BODY = "M14 6 L26 6 L30 9 L30 46 L10 46 L10 9 Z";
const LEFT_SLEEVE = "M14 6 L10 9 L2 18 L8 24 L10 21 Z";
const RIGHT_SLEEVE = "M26 6 L30 9 L38 18 L32 24 L30 21 Z";

export function KitShirt({ club, size = 56 }: { club: Club; size?: number }) {
  const clip = `kit${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { shirt, sleeves, pattern, accent } = club.home;
  const mark = accent ?? sleeves;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <path d={LEFT_SLEEVE} fill={sleeves} />
      <path d={RIGHT_SLEEVE} fill={sleeves} />
      <path d={BODY} fill={shirt} />
      <g clipPath={`url(#${clip})`} fill={mark}>
        {pattern === "rayures" && [12.5, 18.5, 24.5].map((x) => <rect key={x} x={x} y={0} width={3} height={46} />)}
        {pattern === "cercles" && [14, 24, 34].map((y) => <rect key={y} x={0} y={y} width={40} height={4.5} />)}
        {pattern === "echarpe" && <path d="M8 10 L14 6 L34 40 L28 44 Z" />}
        {pattern === "moitie" && <rect x={20} y={0} width={20} height={46} />}
      </g>
      <path d="M15.5 6 Q20 10.5 24.5 6" fill="none" stroke={mark} strokeWidth={1.6} />
      <path d={`${BODY} ${LEFT_SLEEVE} ${RIGHT_SLEEVE}`} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
      <text
        x={20}
        y={33}
        textAnchor="middle"
        fontSize={8.5}
        fontWeight={900}
        fill={pattern === "uni" ? mark : "#ffffff"}
        stroke="rgba(0,0,0,0.45)"
        strokeWidth={0.4}
      >
        {club.rating}
      </text>
    </svg>
  );
}
