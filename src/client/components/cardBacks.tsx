// Les dos de cartes du UNO, dessinés en SVG (100 × 140). Les dégradés et motifs sont déclarés une seule fois pour tout
// le site (BackDefs, dans CardDefs) : une main de huit joueurs n'en recopie aucun.

import { createContext } from "react";
import type { BackId } from "../../shared/games/uno/backs.ts";

/** Le dos que voit ce joueur sur la pioche et les cartes qui volent : le sien */
export const CardBackSkin = createContext<BackId>("classique");

const RED = "#e23b3f";
const YELLOW = "#f3b62c";
const GREEN = "#2fa864";
const BLUE = "#2c7be5";

/** Les quatre couleurs du jeu, en losange : la signature de tous les dos */
function Dots({ r = 4.2, gap = 9, x = 50, y = 70 }: { r?: number; gap?: number; x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy={-gap} r={r} fill={RED} />
      <circle cx={gap} cy="0" r={r} fill={YELLOW} />
      <circle cx="0" cy={gap} r={r} fill={GREEN} />
      <circle cx={-gap} cy="0" r={r} fill={BLUE} />
    </g>
  );
}

const Edge = ({ fill = "#fbf5e6" }: { fill?: string }) => (
  <rect x="0.6" y="0.6" width="98.8" height="138.8" rx="10" fill={fill} stroke="rgba(40,25,10,0.35)" strokeWidth="1.2" />
);

const Field = ({ id }: { id: string }) => <rect x="5" y="5" width="90" height="130" rx="7" fill={`url(#${id})`} />;

/** Les étoiles de la nuit : toujours au même endroit, d'une carte à l'autre */
const STARS: [number, number, number][] = [
  [16, 18, 1.1],
  [31, 26, 0.7],
  [79, 16, 1],
  [68, 30, 0.6],
  [86, 44, 0.8],
  [14, 47, 0.7],
  [22, 64, 0.5],
  [83, 72, 1.1],
  [17, 92, 0.9],
  [30, 108, 0.6],
  [77, 98, 0.6],
  [86, 118, 0.9],
  [62, 122, 0.6],
  [20, 124, 1.1],
  [44, 18, 0.5],
  [57, 112, 0.8],
];

const Sparkle = ({ x, y, s }: { x: number; y: number; s: number }) => (
  <path
    d={`M${x} ${y - 3 * s}L${x + 0.8 * s} ${y - 0.8 * s}L${x + 3 * s} ${y}L${x + 0.8 * s} ${y + 0.8 * s}L${x} ${y + 3 * s}L${x - 0.8 * s} ${y + 0.8 * s}L${x - 3 * s} ${y}L${x - 0.8 * s} ${y - 0.8 * s}Z`}
    fill="#f4efff"
  />
);

/** Les quatre enseignes, en petits dessins (pas de caractères : ils changeraient d'une police à l'autre) */
const Heart = ({ x, y, fill }: { x: number; y: number; fill: string }) => (
  <path transform={`translate(${x} ${y})`} d="M0 5C-7 0-5.5-6.5 0-3.2C5.5-6.5 7 0 0 5Z" fill={fill} />
);
const Diamond = ({ x, y, fill }: { x: number; y: number; fill: string }) => (
  <path transform={`translate(${x} ${y})`} d="M0-6L4.6 0L0 6L-4.6 0Z" fill={fill} />
);
const Spade = ({ x, y, fill }: { x: number; y: number; fill: string }) => (
  <g transform={`translate(${x} ${y})`} fill={fill}>
    <path d="M0-6C7-0.5 5.5 5.5 0 2.4C-5.5 5.5-7-0.5 0-6Z" />
    <path d="M0 1.2L2.4 6.4H-2.4Z" />
  </g>
);
const Club = ({ x, y, fill }: { x: number; y: number; fill: string }) => (
  <g transform={`translate(${x} ${y})`} fill={fill}>
    <circle cx="0" cy="-3" r="2.8" />
    <circle cx="-3" cy="1.4" r="2.8" />
    <circle cx="3" cy="1.4" r="2.8" />
    <path d="M0 0.5L2.3 6.4H-2.3Z" />
  </g>
);

/** Le dessin d'un dos (à mettre dans un SVG de 100 × 140) */
export function BackArt({ skin }: { skin: BackId }) {
  switch (skin) {
    case "ocean":
      return (
        <>
          <Edge />
          <Field id="cb-ocean-field" />
          <rect x="5" y="5" width="90" height="130" rx="7" fill="url(#cb-ocean-waves)" />
          <rect x="10" y="10" width="80" height="120" rx="4.5" fill="none" stroke="#a9dcf2" strokeOpacity="0.7" strokeWidth="1" />
          <g transform="translate(50 70)">
            <circle r="21" fill="#0b3a5c" stroke="#f3e3b5" strokeWidth="1.3" />
            <circle r="16.5" fill="none" stroke="#f3e3b5" strokeOpacity="0.45" strokeWidth="0.6" strokeDasharray="1.2 2" />
            <path d="M0-19L3.2-3.2L0 0L-3.2-3.2Z M0 19L3.2 3.2L0 0L-3.2 3.2Z" fill="#f3e3b5" />
            <path d="M-19 0L-3.2-3.2L0 0L-3.2 3.2Z M19 0L3.2-3.2L0 0L3.2 3.2Z" fill="#cfb980" />
            <path d="M-9-9L-1.5-1.5M9-9L1.5-1.5M-9 9L-1.5 1.5M9 9L1.5 1.5" stroke="#a9dcf2" strokeWidth="1" />
            <circle r="2" fill={RED} />
          </g>
          <Dots r={2.6} gap={6} y={113} />
          <Dots r={2.6} gap={6} y={27} />
        </>
      );
    case "tapis":
      return (
        <>
          <Edge />
          <Field id="cb-tapis-field" />
          <rect x="5" y="5" width="90" height="130" rx="7" fill="url(#cb-tapis-weave)" />
          <rect x="10" y="10" width="80" height="120" rx="4.5" fill="none" stroke="#e6c36f" strokeOpacity="0.85" strokeWidth="1.1" />
          <rect x="13" y="13" width="74" height="114" rx="3" fill="none" stroke="#e6c36f" strokeOpacity="0.35" strokeWidth="0.6" />
          <path d="M50 42L72 70L50 98L28 70Z" fill="#164a30" stroke="#e6c36f" strokeWidth="1.2" />
          <Spade x={50} y={56} fill="#fbf5e6" />
          <Heart x={63} y={70} fill={RED} />
          <Club x={50} y={84} fill="#fbf5e6" />
          <Diamond x={37} y={70} fill={RED} />
          <circle cx="50" cy="70" r="1.6" fill="#e6c36f" />
        </>
      );
    case "nuit":
      return (
        <>
          <Edge />
          <Field id="cb-nuit-field" />
          {STARS.map(([x, y, s], i) =>
            i % 3 === 0 ? <Sparkle key={i} x={x} y={y} s={s} /> : <circle key={i} cx={x} cy={y} r={s * 0.8} fill="#e4ddff" />,
          )}
          <rect x="10" y="10" width="80" height="120" rx="4.5" fill="none" stroke="#c9c3ff" strokeOpacity="0.55" strokeWidth="0.9" />
          <circle cx="50" cy="70" r="24" fill="#f6e7a8" opacity="0.08" />
          <path d="M50 51A19 19 0 1 0 50 89A13.5 19 0 1 1 50 51Z" fill="#f6e7a8" />
          <Sparkle x={58} y={62} s={1.4} />
          <Dots r={2.4} gap={5.5} x={58} y={80} />
        </>
      );
    case "soleil":
      return (
        <>
          <Edge />
          <Field id="cb-soleil-field" />
          <g clipPath="url(#cb-clip)">
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d="M50 70L44 -40L56 -40Z" transform={`rotate(${i * 30} 50 70)`} fill="#ffc46b" opacity="0.28" />
            ))}
            <rect x="5" y="112" width="90" height="5" fill="#fbe3a6" opacity="0.85" />
            <rect x="5" y="119" width="90" height="5" fill="#f08a24" />
            <rect x="5" y="126" width="90" height="9" fill="#7a2a12" />
            <rect x="5" y="5" width="90" height="9" fill="#7a2a12" />
            <rect x="5" y="16" width="90" height="5" fill="#f08a24" />
            <rect x="5" y="23" width="90" height="5" fill="#fbe3a6" opacity="0.85" />
          </g>
          <circle cx="50" cy="70" r="19" fill="#fbe3a6" stroke="#7a2a12" strokeWidth="1.6" />
          <circle cx="50" cy="70" r="14.5" fill="none" stroke="#c4501c" strokeWidth="0.8" />
          <Dots r={3.3} gap={7.2} />
        </>
      );
    case "damier":
      return (
        <>
          <Edge />
          <Field id="cb-damier-checks" />
          <rect x="9" y="9" width="82" height="122" rx="5" fill="none" stroke={RED} strokeWidth="1.4" />
          <circle cx="50" cy="70" r="20" fill="#fbf5e6" />
          <circle cx="50" cy="70" r="17" fill={RED} />
          <circle cx="50" cy="70" r="13.5" fill="#1b1b1e" />
          <Dots r={3.4} gap={7} />
        </>
      );
    case "neon":
      return (
        <>
          <Edge fill="#1a1626" />
          <Field id="cb-neon-field" />
          <rect x="5" y="5" width="90" height="130" rx="7" fill="url(#cb-neon-grid)" />
          {/* La lumière : un trait large et pâle sous un trait fin et vif */}
          <rect x="10" y="10" width="80" height="120" rx="5" fill="none" stroke="#ff4fd8" strokeOpacity="0.28" strokeWidth="3.4" />
          <rect x="10" y="10" width="80" height="120" rx="5" fill="none" stroke="#ff9cec" strokeWidth="0.9" />
          <rect x="14.5" y="14.5" width="71" height="111" rx="3.5" fill="none" stroke="#3ff0ff" strokeOpacity="0.22" strokeWidth="3" />
          <rect x="14.5" y="14.5" width="71" height="111" rx="3.5" fill="none" stroke="#a8f9ff" strokeWidth="0.7" />
          <path
            d="M55 46L38 73H50L44 96L63 66H51Z"
            fill="none"
            stroke="#ffe94f"
            strokeOpacity="0.3"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path d="M55 46L38 73H50L44 96L63 66H51Z" fill="#fff6a8" stroke="#ffe94f" strokeWidth="1.2" strokeLinejoin="round" />
        </>
      );
    case "or":
      return (
        <>
          <Edge />
          <Field id="cb-or-field" />
          <rect x="5" y="5" width="90" height="130" rx="7" fill="url(#cb-or-lattice)" />
          <rect x="10" y="10" width="80" height="120" rx="4.5" fill="none" stroke="#7a5212" strokeOpacity="0.7" strokeWidth="1.2" />
          <rect x="12.5" y="12.5" width="75" height="115" rx="3.5" fill="none" stroke="#fff4c9" strokeOpacity="0.8" strokeWidth="0.7" />
          <ellipse cx="50" cy="72" rx="24" ry="22" fill="#a0731f" opacity="0.25" />
          {/* Une couronne sertie des quatre couleurs */}
          <g transform="translate(50 70)">
            <path d="M-18 10L-20-8L-9 1L0-14L9 1L20-8L18 10Z" fill="#fff1c1" stroke="#7a5212" strokeWidth="1.4" strokeLinejoin="round" />
            <rect x="-18.5" y="10" width="37" height="6" rx="1.5" fill="#fff1c1" stroke="#7a5212" strokeWidth="1.4" />
            <circle cx="-20" cy="-8" r="2.2" fill={BLUE} stroke="#7a5212" strokeWidth="0.8" />
            <circle cx="0" cy="-14" r="2.4" fill={RED} stroke="#7a5212" strokeWidth="0.8" />
            <circle cx="20" cy="-8" r="2.2" fill={GREEN} stroke="#7a5212" strokeWidth="0.8" />
            <path d="M0 2.5L3 6.5L0 10.5L-3 6.5Z" fill={YELLOW} stroke="#7a5212" strokeWidth="0.8" />
          </g>
        </>
      );
    default:
      // Le dos classique : bordeaux et dorures art déco
      return (
        <>
          <Edge />
          <Field id="card-back-field" />
          <rect x="5" y="5" width="90" height="130" rx="7" fill="url(#card-back-rays)" />
          <rect x="10" y="10" width="80" height="120" rx="4.5" fill="none" stroke="#e6c36f" strokeOpacity="0.75" strokeWidth="1" />
          <rect x="13" y="13" width="74" height="114" rx="3" fill="none" stroke="#e6c36f" strokeOpacity="0.35" strokeWidth="0.6" />
          <g transform="translate(50 70)">
            <path d="M0 -30 L22 0 L0 30 L-22 0 Z" fill="#3a0a17" stroke="#e6c36f" strokeWidth="1.3" />
            <path d="M0 -23 L16.5 0 L0 23 L-16.5 0 Z" fill="none" stroke="#e6c36f" strokeOpacity="0.5" strokeWidth="0.7" />
          </g>
          <Dots />
          <circle cx="50" cy="70" r="1.6" fill="#e6c36f" />
          {[-1, 1].map((s) => (
            <g key={s} transform={`translate(50 ${70 + s * 45})`} stroke="#e6c36f" strokeOpacity="0.6" strokeWidth="0.8" fill="none">
              <path d="M-18 0 H-5 M5 0 H18" />
              <path d="M0 -3 L3 0 L0 3 L-3 0 Z" fill="#e6c36f" fillOpacity="0.6" />
            </g>
          ))}
        </>
      );
  }
}

/** Les dégradés et motifs des dos (le classique garde les siens, déclarés avec les faces) */
export function BackDefs() {
  return (
    <>
      <clipPath id="cb-clip">
        <rect x="5" y="5" width="90" height="130" rx="7" />
      </clipPath>
      <linearGradient id="cb-ocean-field" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stopColor="#1f78ad" />
        <stop offset="0.55" stopColor="#0d4167" />
        <stop offset="1" stopColor="#062236" />
      </linearGradient>
      <pattern id="cb-ocean-waves" width="12" height="7" patternUnits="userSpaceOnUse">
        <path d="M0 4.5Q3 1.5 6 4.5T12 4.5" fill="none" stroke="#a9dcf2" strokeOpacity="0.2" strokeWidth="0.9" />
      </pattern>
      <linearGradient id="cb-tapis-field" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#338a56" />
        <stop offset="0.5" stopColor="#1f5c39" />
        <stop offset="1" stopColor="#0f3320" />
      </linearGradient>
      <pattern id="cb-tapis-weave" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 2.5H5" stroke="#fff" strokeOpacity="0.05" strokeWidth="1" />
      </pattern>
      <radialGradient id="cb-nuit-field" cx="0.5" cy="0.42" r="0.75">
        <stop offset="0" stopColor="#35307e" />
        <stop offset="0.6" stopColor="#1a1650" />
        <stop offset="1" stopColor="#0b0a24" />
      </radialGradient>
      <linearGradient id="cb-soleil-field" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f39a35" />
        <stop offset="0.55" stopColor="#d4602a" />
        <stop offset="1" stopColor="#8e3415" />
      </linearGradient>
      <pattern id="cb-damier-checks" width="10" height="10" patternUnits="userSpaceOnUse" x="5" y="5">
        <rect width="10" height="10" fill="#f2ede0" />
        <rect width="5" height="5" fill="#1b1b1e" />
        <rect x="5" y="5" width="5" height="5" fill="#1b1b1e" />
      </pattern>
      <linearGradient id="cb-neon-field" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1b1430" />
        <stop offset="1" stopColor="#0a0812" />
      </linearGradient>
      <pattern id="cb-neon-grid" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M8 0V8M0 8H8" fill="none" stroke="#8b5cf6" strokeOpacity="0.16" strokeWidth="0.6" />
      </pattern>
      <linearGradient id="cb-or-field" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f9e29a" />
        <stop offset="0.5" stopColor="#d8aa45" />
        <stop offset="1" stopColor="#9c6e1c" />
      </linearGradient>
      <pattern id="cb-or-lattice" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0.5H9M0.5 0V9" stroke="#fff4c9" strokeOpacity="0.35" strokeWidth="0.7" />
        <path d="M0 1.4H9M1.4 0V9" stroke="#7a5212" strokeOpacity="0.22" strokeWidth="0.7" />
      </pattern>
    </>
  );
}
