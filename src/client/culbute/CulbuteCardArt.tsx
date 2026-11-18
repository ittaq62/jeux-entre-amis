import { HABITUES } from "../../shared/games/culbute/fighters.ts";
import { isHabitueId } from "../../shared/games/culbute/model.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { PropIcon } from "./PropIcon.tsx";
import "./culbuteCard.css";

/** Les dessins des cartes de la famille « La Culbute » : les Habitués et leur accessoire, les objets, les arènes */
export function CulbuteCardArt({ subject }: { subject: string }) {
  if (isHabitueId(subject)) {
    return (
      <span className="tc-culbute-fighter">
        <AvatarDrawing avatar={HABITUES[subject].avatar} size={96} />
        <span className="tc-culbute-prop">
          <PropIcon style={subject} size={44} />
        </span>
      </span>
    );
  }
  return (
    <svg className="tc-svg" viewBox="-60 -60 120 120" aria-hidden="true">
      {subject === "tarte" && (
        <g>
          <ellipse cx="0" cy="16" rx="42" ry="14" fill="#b87a3a" />
          <ellipse cx="0" cy="10" rx="40" ry="12" fill="#d59a4a" />
          <path d="M-34 8 C-30 -24 30 -24 34 8 Z" fill="#fffaf0" stroke="#e8ddc8" strokeWidth="2" />
          <circle cx="0" cy="-16" r="6" fill="#d62b3a" />
        </g>
      )}
      {subject === "petard" && (
        <g transform="rotate(-18)">
          <rect x="-12" y="-30" width="24" height="64" rx="4" fill="#d6413a" />
          <rect x="-12" y="-16" width="24" height="8" fill="#f2c94c" />
          <path d="M0 -30 C-4 -42 8 -44 10 -54" fill="none" stroke="#3a2f25" strokeWidth="3" strokeLinecap="round" />
          <path d="M10 -62 L13 -55 L20 -56 L14 -51 L17 -44 L10 -48 L4 -43 L6 -50 L0 -55 L7 -55 Z" fill="#ffd25a" stroke="#ff9a3a" />
        </g>
      )}
      {subject === "baguette" && (
        <g transform="rotate(-35)">
          <rect x="-52" y="-10" width="104" height="20" rx="10" fill="#d8a55a" stroke="#a8743a" strokeWidth="2" />
          {[-32, -12, 8, 28].map((x) => (
            <path key={x} d={`M${x} -6 L${x + 12} 6`} stroke="#f3d9a4" strokeWidth="4" strokeLinecap="round" />
          ))}
        </g>
      )}
      {subject === "gateau" && (
        <g>
          <path d="M-40 24 L40 24 L0 -36 Z" fill="#f3d9a4" stroke="#c99a5a" strokeWidth="2" />
          <path d="M-40 24 L0 -36 L-6 -40 L-46 20 Z" fill="#e86aa6" />
          <path d="M-22 -2 L22 -2" stroke="#e86aa6" strokeWidth="5" />
          <circle cx="-4" cy="-38" r="6" fill="#d62b3a" />
        </g>
      )}
      {subject === "kiosque" && (
        <g>
          <path d="M-46 -10 L0 -46 L46 -10 Z" fill="#3d7a5a" />
          <rect x="-48" y="-12" width="96" height="6" fill="#e8e0cc" />
          {[-38, -14, 14, 38].map((x) => (
            <rect key={x} x={x - 2} y="-6" width="4" height="42" fill="#2f4a3a" />
          ))}
          <rect x="-50" y="36" width="100" height="8" fill="#9c9384" />
          <circle cx="0" cy="-50" r="4" fill="#f2c94c" />
        </g>
      )}
      {subject === "clocher" && (
        <g>
          <path d="M-14 -58 L14 -58 L22 -30 L-22 -30 Z" fill="#4f5662" />
          <rect x="-22" y="-30" width="44" height="80" fill="#cfc3a8" />
          <circle cx="0" cy="-6" r="13" fill="#f4efe2" stroke="#4f5662" strokeWidth="2" />
          <path d="M0 -6 L0 -15 M0 -6 L7 -2" stroke="#1c1c22" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="-50" y="44" width="100" height="8" fill="#5e6674" />
        </g>
      )}
      {subject === "vol" && (
        <g>
          <path
            d="M-28 6 L-18 -16 L-36 -32 L-12 -30 L-2 -54 L6 -30 L30 -34 L12 -16 L22 6 L0 -6 Z"
            fill="#ffd25a"
            stroke="#ff9a3a"
            strokeWidth="2.5"
          />
          <g transform="translate(26 -10) rotate(40)">
            <circle cx="0" cy="-12" r="11" fill="#ffdbb4" />
            <rect x="-9" y="0" width="18" height="22" rx="6" fill="#8a5a3b" />
            <path d="M-8 6 L-20 -2 M8 6 L20 -4 M-5 22 L-10 34 M5 22 L12 32" stroke="#ffdbb4" strokeWidth="4" strokeLinecap="round" />
          </g>
          <path d="M-52 34 L-12 12 M-48 46 L-6 22 M-38 54 L0 30" stroke="#fbf5e6" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
          <text x="-6" y="56" textAnchor="middle" fontFamily="var(--font-card)" fontWeight="800" fontSize="20" fill="#e2283a">
            150 %
          </text>
        </g>
      )}
    </svg>
  );
}
