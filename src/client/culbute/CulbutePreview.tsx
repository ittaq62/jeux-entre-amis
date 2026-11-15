// L'illustration de Culbute sur l'accueil : la place du village, le kiosque, et Ginette qui envoie Marcel valser d'un
// coup de sac. En SVG : légère, et rien de la 3D ne se charge avant d'être à table.

import { HABITUES } from "../../shared/games/culbute/fighters.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import "./culbute.css";

export function CulbutePreview() {
  return (
    <svg className="cb-preview" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="cb-pv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc3ec" />
          <stop offset="1" stopColor="#d8eef8" />
        </linearGradient>
      </defs>
      <rect width="1200" height="600" fill="url(#cb-pv-sky)" />
      {/* Les maisons de la place */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i} transform={`translate(${i * 210 - 20} ${150 + (i % 2) * 30})`}>
          <rect width="190" height="260" fill={["#e8d8b8", "#d9b38c", "#f0e2c8"][i % 3]} />
          <path d="M-10 0 L95 -70 L200 0 Z" fill="#b5523b" />
          {[0, 1].map((r) =>
            [0, 1, 2].map((c) => (
              <rect key={`${r}-${c}`} x={22 + c * 56} y={40 + r * 90} width="34" height="48" fill="#3f7fd8" opacity="0.8" />
            )),
          )}
        </g>
      ))}
      {/* Les platanes */}
      {[90, 420, 760, 1100].map((x) => (
        <g key={x}>
          <rect x={x - 8} y="300" width="16" height="120" fill="#6b4a32" />
          <ellipse cx={x} cy="280" rx="80" ry="60" fill="#5f9a46" />
        </g>
      ))}
      {/* Le kiosque */}
      <rect x="560" y="210" width="8" height="200" fill="#2f4a3a" />
      <rect x="732" y="210" width="8" height="200" fill="#2f4a3a" />
      <path d="M520 214 L650 130 L780 214 Z" fill="#3d7a5a" />
      <rect x="530" y="212" width="240" height="14" fill="#e8e0cc" />
      {/* Le grand plateau pavé, qui flotte */}
      <path d="M120 420 L1080 420 L1050 470 L150 470 Z" fill="#9c9384" />
      <path d="M150 470 L1050 470 L700 590 L500 590 Z" fill="#6b5a45" />
      {Array.from({ length: 16 }, (_, i) => (
        <rect key={i} x={140 + i * 58} y="424" width="48" height="16" rx="5" fill="#b7ad9b" />
      ))}
      {/* Ginette et son sac */}
      <g transform="translate(470 300)">
        <path d="M-34 40 L34 40 L46 118 L-46 118 Z" fill="#c2185b" />
        <rect x="-24" y="118" width="16" height="44" fill="#4a3a5e" />
        <rect x="8" y="118" width="16" height="44" fill="#4a3a5e" />
        <path d="M30 60 L120 30" stroke="#ffdbb4" strokeWidth="14" strokeLinecap="round" />
        <g transform="translate(140 22) rotate(-20)">
          <path d="M-14 -10 a14 14 0 0 1 28 0" fill="none" stroke="#2a2a30" strokeWidth="5" />
          <rect x="-30" y="-10" width="60" height="44" rx="10" fill="#7a3b2e" />
          <rect x="-30" y="-10" width="60" height="10" fill="#f2c94c" />
        </g>
        <foreignObject x="-48" y="-56" width="96" height="96">
          <AvatarDrawing avatar={HABITUES.ginette.avatar} size={96} />
        </foreignObject>
      </g>
      {/* Le coup : une étoile */}
      <g className="cb-pv-hit">
        <path
          d="M652 250 L668 286 L708 278 L680 306 L704 340 L664 326 L650 366 L640 326 L600 336 L626 306 L600 276 L640 286 Z"
          fill="#ffd25a"
          stroke="#ff9a3a"
          strokeWidth="5"
        />
      </g>
      {/* Marcel qui s'envole, sa chaise avec lui */}
      <g className="cb-pv-flyer">
        <g transform="translate(800 250) rotate(24)">
          <rect x="-38" y="40" width="76" height="80" rx="18" fill="#8a5a3b" />
          <rect x="-30" y="118" width="18" height="46" fill="#36404d" transform="rotate(-20 -21 118)" />
          <rect x="12" y="118" width="18" height="46" fill="#36404d" transform="rotate(30 21 118)" />
          <path d="M-36 60 L-90 20 M36 60 L90 30" stroke="#f1c27d" strokeWidth="14" strokeLinecap="round" />
          <foreignObject x="-48" y="-54" width="96" height="96">
            <AvatarDrawing avatar={HABITUES.marcel.avatar} size={96} />
          </foreignObject>
        </g>
        <path d="M900 330 L960 250 M916 334 L976 254" stroke="#2a2a30" strokeWidth="6" />
        <rect x="910" y="262" width="56" height="30" fill="#3f7fd8" transform="rotate(-36 938 277)" />
        <path
          d="M740 300 L690 300 M745 330 L700 340 M748 270 L705 260"
          stroke="#ffffff"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.9"
        />
      </g>
      <text
        x="1080"
        y="120"
        textAnchor="end"
        fontFamily="var(--font-card)"
        fontWeight="800"
        fontSize="80"
        fill="#ffffff"
        stroke="#b3261e"
        strokeWidth="6"
        paintOrder="stroke"
      >
        124%
      </text>
    </svg>
  );
}
