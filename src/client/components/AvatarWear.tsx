// Les dessins de la garde-robe du personnage (src/shared/wardrobe.ts), dans le même carré de 100 que l'avatar : la tête
// est un cercle de rayon 28 centré en (50, 55), les yeux à la hauteur 51, la bouche vers 64-70, les épaules partent de
// 76. Chaque dessin se lit d'abord par sa forme et sa couleur : il doit rester reconnaissable en pastille de 22 px.
// Ce module ne se charge que lorsqu'un avatar porte quelque chose (wearLoader.ts).

import type { CSSProperties, ReactNode } from "react";
import { usePrefs } from "../stores/prefs.ts";

const INK = "#2b1d14";
/** Les épaules de l'avatar de base : chaque tenue part de cette forme */
const SHOULDERS = "M14 104 C16 82 34 76 50 76 C66 76 84 82 86 104 Z";
const RAINBOW = ["#e94b4b", "#f39c33", "#f7d046", "#5cbf5a", "#3d8fd9", "#8b5cc4"];

/** Une étoile à `n` branches centrée en (cx, cy) */
function starPath(cx: number, cy: number, outer: number, inner: number, n = 5, turn = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((turn + (i * 180) / n) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** Une étincelle à quatre branches, fines */
const sparkPath = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} Q${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy} Q${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r} Q${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy} Q${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r} Z`;

/** Un cœur de largeur ~2r, pointe en bas */
const heartPath = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy + r * 0.95} C${cx - r * 1.3} ${cy + r * 0.1} ${cx - r * 1.05} ${cy - r * 1.05} ${cx} ${cy - r * 0.45} C${cx + r * 1.05} ${cy - r * 1.05} ${cx + r * 1.3} ${cy + r * 0.1} ${cx} ${cy + r * 0.95} Z`;

/** Des points le long d'une courbe de Bézier quadratique (colliers, guirlandes) */
function alongQuad(p0: [number, number], p1: [number, number], p2: [number, number], count: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}

const LEI = alongQuad([29, 84], [50, 104], [71, 84], 9);
const LEI_COLORS = ["#ff6f91", "#ffd166", "#ff9f43", "#fdfdfd"];

/** Les rayons du fond : un secteur sur deux, depuis le milieu de la tête */
const RAYS = (() => {
  const cx = 50;
  const cy = 56;
  const n = 14;
  let d = "";
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    d += `M${cx} ${cy} L${(cx + 90 * Math.cos(a0)).toFixed(1)} ${(cy + 90 * Math.sin(a0)).toFixed(1)} L${(cx + 90 * Math.cos(a1)).toFixed(1)} ${(cy + 90 * Math.sin(a1)).toFixed(1)} Z `;
  }
  return d.trim();
})();

/** Les feuilles de laurier, de part et d'autre, du bas vers le haut */
const LAURELS = (() => {
  const out: { x: number; y: number; rot: number; dark: boolean }[] = [];
  for (let k = 0; k < 7; k++) {
    const deg = 102 + k * 19;
    for (const side of [1, -1]) {
      const a = ((side === 1 ? deg : 180 - deg) * Math.PI) / 180;
      const x = 50 + 44 * Math.cos(a);
      const y = 50 + 44 * Math.sin(a);
      // La feuille suit le cercle, un peu penchée vers le haut
      const tangent = (Math.atan2(Math.cos(a), -Math.sin(a)) * 180) / Math.PI;
      out.push({ x, y, rot: tangent + (side === 1 ? 28 : -28) + (side === 1 ? 0 : 180), dark: k % 2 === 1 });
    }
  }
  return out;
})();

const FRAME_STARS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
  return starPath(50 + 46.5 * Math.cos(a), 50 + 46.5 * Math.sin(a), 2.9, 1.25);
});

// ---------------------------------------------------------------------------
// Fond
// ---------------------------------------------------------------------------

/** Le motif du fond, par-dessus sa couleur unie (les pois et les rayons la laissent voir) */
export function WearBackdrop({ id, uid }: { id: string; uid: string }): ReactNode {
  switch (id) {
    case "pois":
      return (
        <>
          <defs>
            <pattern id={`${uid}-pois`} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45 50 50)">
              <circle cx="4" cy="4" r="2.6" fill="#fff" fillOpacity="0.32" />
              <circle cx="12" cy="12" r="2.6" fill="#fff" fillOpacity="0.32" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill={`url(#${uid}-pois)`} />
        </>
      );
    case "rayons":
      return <path d={RAYS} fill="#fff" fillOpacity="0.2" />;
    case "nuages":
      return (
        <>
          <defs>
            <linearGradient id={`${uid}-ciel`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#62b6ec" />
              <stop offset="1" stopColor="#bfe6fb" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${uid}-ciel)`} />
          <g fill="#fff">
            <circle cx="12" cy="30" r="7" />
            <circle cx="21" cy="25" r="8.5" />
            <circle cx="29" cy="31" r="5.5" />
            <rect x="8" y="30" width="24" height="6.5" rx="3.2" />
            <circle cx="74" cy="15" r="6" />
            <circle cx="82" cy="11" r="7.5" />
            <circle cx="90" cy="16" r="5" />
            <rect x="70" y="15" width="24" height="5.8" rx="2.9" />
          </g>
          <g fill="#fff" fillOpacity="0.75">
            <circle cx="86" cy="44" r="4.5" />
            <circle cx="92" cy="41" r="5" />
          </g>
        </>
      );
    case "couchant":
      return (
        <>
          <defs>
            <linearGradient id={`${uid}-couchant`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffc56b" />
              <stop offset="0.5" stopColor="#ff7a5c" />
              <stop offset="1" stopColor="#7b3f98" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${uid}-couchant)`} />
          <circle cx="50" cy="58" r="34" fill="#ffe08a" fillOpacity="0.85" />
          <g fill="#ff7a5c" fillOpacity="0.55">
            <rect x="0" y="40" width="100" height="2.6" />
            <rect x="0" y="47" width="100" height="3.4" />
          </g>
        </>
      );
    case "nuit":
      return (
        <>
          <defs>
            <linearGradient id={`${uid}-nuit`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0f1636" />
              <stop offset="1" stopColor="#2e3f7c" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${uid}-nuit)`} />
          <path d="M84 12 A11 11 0 1 0 85 34 A8.5 8.5 0 1 1 84 12 Z" fill="#f7e6a3" />
          <g fill="#fff">
            <path d={sparkPath(18, 20, 3.4)} />
            <path d={sparkPath(34, 8, 2.4)} />
            <path d={sparkPath(64, 9, 2.2)} />
            <path d={sparkPath(12, 44, 2.4)} />
            <circle cx="27" cy="31" r="1.1" />
            <circle cx="90" cy="46" r="1.2" />
            <circle cx="74" cy="30" r="0.9" />
            <circle cx="46" cy="16" r="0.9" />
          </g>
        </>
      );
    case "arc-en-ciel":
      return (
        <>
          <rect width="100" height="100" fill="#a9dcf6" />
          <g fill="none" strokeWidth="5.6">
            {RAINBOW.map((c, i) => {
              const r = 52 - i * 5.5;
              return <path key={c} d={`M${50 - r} 82 A${r} ${r} 0 0 1 ${50 + r} 82`} stroke={c} />;
            })}
          </g>
        </>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Tenue
// ---------------------------------------------------------------------------

/** La tenue : `back` à la place des épaules (sous la tête), `front` par-dessus le menton (col, nœud, écharpe) */
export function WearOutfit({ id, layer, uid }: { id: string; layer: "back" | "front"; uid: string }): ReactNode {
  const back = layer === "back";
  switch (id) {
    case "tshirt":
      return back ? (
        <g>
          <path d={SHOULDERS} fill="#f4f1e8" />
          <path d="M40 80 C43 89 57 89 60 80" fill="none" stroke="#d3cbb8" strokeWidth="2.6" />
        </g>
      ) : null;
    case "chemise":
      return back ? (
        <g>
          <path d={SHOULDERS} fill="#b9d5ef" />
          <path d="M50 86 L50 104" stroke="#8fb0cf" strokeWidth="1.2" />
          <circle cx="50" cy="93" r="1.2" fill="#fff" />
          <circle cx="50" cy="100" r="1.2" fill="#fff" />
          <path d="M50 86 L39 78 L35 90 Z" fill="#eef5fb" stroke="#8fb0cf" strokeWidth="1" strokeLinejoin="round" />
          <path d="M50 86 L61 78 L65 90 Z" fill="#eef5fb" stroke="#8fb0cf" strokeWidth="1" strokeLinejoin="round" />
        </g>
      ) : null;
    case "mariniere":
      return back ? (
        <g>
          <defs>
            <clipPath id={`${uid}-epaules`}>
              <path d={SHOULDERS} />
            </clipPath>
          </defs>
          <path d={SHOULDERS} fill="#f7f5ef" />
          <g clipPath={`url(#${uid}-epaules)`} fill="#24407c">
            <rect x="0" y="84.5" width="100" height="3.6" />
            <rect x="0" y="91.5" width="100" height="3.6" />
            <rect x="0" y="98.5" width="100" height="3.6" />
          </g>
        </g>
      ) : null;
    case "echarpe":
      return back ? (
        <path d={SHOULDERS} fill="#4a5361" />
      ) : (
        <g>
          <path d="M57 87 L68 86 L67 106 L56 106 Z" fill="#c93636" />
          <path d="M27 80 C38 88 62 88 73 80 C75 83 76 86 74 89 C62 97 38 97 26 89 C24 86 25 83 27 80 Z" fill="#d94040" />
          <path d="M30 85 C41 92 59 92 70 85" fill="none" stroke="#f2c14e" strokeWidth="2.2" />
          <path d="M58 95 L67 94" stroke="#f2c14e" strokeWidth="2.2" />
        </g>
      );
    case "capuche":
      return back ? (
        <g>
          <path d="M15 76 C9 44 28 26 50 26 C72 26 91 44 85 76 C80 90 20 90 15 76 Z" fill="#cf6d24" />
          <path d={SHOULDERS} fill="#e9893a" />
          <path d="M21 66 C23 88 77 88 79 66" fill="none" stroke="#b85c1a" strokeWidth="3.2" />
        </g>
      ) : (
        <g stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
          <path d="M44 87 L42 99" />
          <path d="M56 87 L58 99" />
        </g>
      );
    case "collier-fleurs":
      return back ? (
        <path d={SHOULDERS} fill="#27a094" />
      ) : (
        <g>
          {LEI.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="4.3" fill={LEI_COLORS[i % LEI_COLORS.length]} />
              <circle cx={x} cy={y} r="1.4" fill="#e0794a" />
            </g>
          ))}
        </g>
      );
    case "smoking":
      return back ? (
        <g>
          <path d={SHOULDERS} fill="#1d1d25" />
          <path d="M40 79 L50 104 L60 79 Z" fill="#f6f6f2" />
          <path d="M39 79 L50 104 L43 104 L32 87 Z" fill="#33333f" />
          <path d="M61 79 L50 104 L57 104 L68 87 Z" fill="#33333f" />
        </g>
      ) : (
        <g fill="#121216">
          <path d="M50 87.5 L42 83 L42 92 Z" />
          <path d="M50 87.5 L58 83 L58 92 Z" />
          <rect x="47.8" y="85.3" width="4.4" height="4.4" rx="1.4" />
        </g>
      );
    case "armure":
      return back ? (
        <g>
          <path d={SHOULDERS} fill="#97a3b0" />
          <path d="M36 81 C42 88 58 88 64 81 L65 89 C58 96 42 96 35 89 Z" fill="#c3ccd6" stroke="#6f7b88" strokeWidth="1" />
          <path d="M50 94 L50 104" stroke="#6f7b88" strokeWidth="1.3" />
          <path d="M13 104 C13 88 21 80 33 80 C34 90 30 98 27 104 Z" fill="#b6c0cb" stroke="#6f7b88" strokeWidth="1" />
          <path d="M87 104 C87 88 79 80 67 80 C66 90 70 98 73 104 Z" fill="#b6c0cb" stroke="#6f7b88" strokeWidth="1" />
          <g fill="#5d6874">
            <circle cx="22" cy="90" r="1.2" />
            <circle cx="27" cy="85" r="1.2" />
            <circle cx="78" cy="90" r="1.2" />
            <circle cx="73" cy="85" r="1.2" />
          </g>
        </g>
      ) : null;
    case "cape":
      return back ? (
        <g>
          <path d={SHOULDERS} fill="#a3122c" />
          <path d="M50 92 L50 104" stroke="#7e0d22" strokeWidth="1.4" />
        </g>
      ) : (
        <g>
          <path d="M24 89 C32 80 68 80 76 89 L73.5 94 C66 86.5 34 86.5 26.5 94 Z" fill="#f8f5ec" />
          <g fill="#1b1b1b">
            <path d="M30.5 87.6 l1.1 2.9 l1.1 -2.9 z" />
            <path d="M40 84.6 l1.1 2.9 l1.1 -2.9 z" />
            <path d="M57.8 84.6 l1.1 2.9 l1.1 -2.9 z" />
            <path d="M67.3 87.6 l1.1 2.9 l1.1 -2.9 z" />
          </g>
          <circle cx="50" cy="90" r="2.6" fill="#f2c04d" stroke="#a87b16" strokeWidth="0.8" />
        </g>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Coiffures (dans la couleur de cheveux choisie)
// ---------------------------------------------------------------------------

export function WearHair({ id, layer, color }: { id: string; layer: "back" | "front"; color: string }): ReactNode {
  const back = layer === "back";
  switch (id) {
    case "epis":
      return back ? null : (
        <path
          d="M19 54 C17 42 21 33 28 28 L24 16 L35 23 L38 9 L46 20 L52 6 L57 20 L65 9 L67 23 L77 16 L73 29 C79 35 82 44 81 54 C78 44 71 38 63 38 C57 34 43 34 37 38 C29 38 22 44 19 54 Z"
          fill={color}
          strokeLinejoin="round"
        />
      );
    case "couettes":
      return back ? (
        <g fill={color}>
          <ellipse cx="14" cy="47" rx="9" ry="13" transform="rotate(-24 14 47)" />
          <ellipse cx="86" cy="47" rx="9" ry="13" transform="rotate(24 86 47)" />
        </g>
      ) : (
        <g>
          <path d="M19 54 C15 17 85 17 81 54 C79 42 66 36 50 37 C34 36 21 42 19 54 Z" fill={color} />
          <circle cx="22" cy="40" r="3.4" fill="#ef5a83" />
          <circle cx="78" cy="40" r="3.4" fill="#ef5a83" />
        </g>
      );
    case "banane":
      return back ? null : (
        <g>
          <path
            d="M19 54 C15 32 27 14 48 11 C66 8 82 14 82 24 C82 31 76 34 70 33 C77 39 82 46 81 54 C78 43 71 37 63 38 C57 33 43 33 37 38 C29 37 22 43 19 54 Z"
            fill={color}
          />
          <path d="M33 22 C43 15 60 13 72 18" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      );
    case "tresses":
      return back ? (
        <path d="M21 54 C19 30 81 30 79 54 L80 66 L20 66 Z" fill={color} />
      ) : (
        <g>
          <path d="M19 54 C15 17 85 17 81 54 C79 43 68 36 52 36 L50 31 L48 36 C32 36 21 43 19 54 Z" fill={color} />
          {[0, 1].map((side) => {
            const x = side === 0 ? 22 : 78;
            return (
              <g key={side} fill={color} stroke="rgba(0,0,0,0.22)" strokeWidth="0.8">
                {[64, 71, 78, 85, 92].map((y) => (
                  <ellipse key={y} cx={x} cy={y} rx="4.6" ry="4.3" />
                ))}
                <rect x={x - 2.4} y="96" width="4.8" height="3" rx="1" fill="#ef5a83" stroke="none" />
              </g>
            );
          })}
        </g>
      );
    case "afro":
      return back ? (
        <g fill={color}>
          <circle cx="50" cy="40" r="31" />
          {[150, 180, 210, 240, 270, 300, 330, 0, 30].map((deg) => {
            const a = (deg * Math.PI) / 180;
            return <circle key={deg} cx={50 + 30 * Math.cos(a)} cy={40 + 30 * Math.sin(a)} r="9" />;
          })}
        </g>
      ) : (
        <path d="M19 55 C15 26 85 26 81 55 C79 46 72 39 63 39 C57 35 43 35 37 39 C28 39 21 46 19 55 Z" fill={color} />
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Couvre-chefs
// ---------------------------------------------------------------------------

export function WearHat({ id }: { id: string }): ReactNode {
  switch (id) {
    case "melon":
      return (
        <g>
          <path d="M30 32 C30 11 70 11 70 32 Z" fill="#2a2522" />
          <rect x="30" y="26" width="40" height="5" fill="#6b4a2e" />
          <ellipse cx="50" cy="32" rx="27" ry="4.6" fill="#2a2522" />
          <path d="M37 18 C41 14 47 13 51 13" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case "chantier":
      return (
        <g>
          <path d="M23 37 C23 13 77 13 77 37 Z" fill="#f4b81c" />
          <path d="M45 14.5 C47 14 53 14 55 14.5 L55 37 L45 37 Z" fill="#e3a40c" />
          <path d="M18 37 L82 37 C82 40 80 41.5 77 41.5 L23 41.5 C20 41.5 18 40 18 37 Z" fill="#d8960a" />
          <path d="M30 24 C33 19 38 17 42 16.5" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case "toque":
      return (
        <g>
          <g fill="#fbfbf8" stroke="#d9d6cc" strokeWidth="1">
            <circle cx="37" cy="17" r="10" />
            <circle cx="63" cy="17" r="10" />
            <circle cx="50" cy="11" r="12" />
          </g>
          <rect x="31" y="19" width="38" height="15" rx="3" fill="#fbfbf8" stroke="#d9d6cc" strokeWidth="1" />
          <g stroke="#dedad0" strokeWidth="1.1">
            <path d="M40 21 L40 32" />
            <path d="M50 21 L50 32" />
            <path d="M60 21 L60 32" />
          </g>
        </g>
      );
    case "oreilles-chat":
      return (
        <g>
          <path d="M23 42 C27 22 73 22 77 42" fill="none" stroke="#33333d" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M24 33 L27 11 L43 25 Z" fill="#33333d" strokeLinejoin="round" />
          <path d="M76 33 L73 11 L57 25 Z" fill="#33333d" strokeLinejoin="round" />
          <path d="M28 28 L29.5 17 L38 25 Z" fill="#f4a3b8" />
          <path d="M72 28 L70.5 17 L62 25 Z" fill="#f4a3b8" />
        </g>
      );
    case "helice":
      return (
        <g>
          <path d="M25 36 C25 14 75 14 75 36 Z" fill="#e2483d" />
          <path d="M50 15 C42 15 36 22 36 36 L50 36 Z" fill="#f2c14e" />
          <path d="M50 15 C58 15 64 22 64 36 L50 36 Z" fill="#3d8fd9" />
          <path d="M73 33 C80 32 87 34 89 37 C82 38 74 38 70 37 Z" fill="#3a9a52" />
          <rect x="48.8" y="7" width="2.4" height="9" fill="#5a5a5a" />
          <ellipse cx="41" cy="7" rx="9" ry="2.6" fill="#3a9a52" />
          <ellipse cx="59" cy="7" rx="9" ry="2.6" fill="#e2483d" />
          <circle cx="50" cy="7" r="2" fill="#f2c14e" />
        </g>
      );
    case "couronne-fleurs":
      return (
        <g>
          <path d="M21 41 C29 28 71 28 79 41" fill="none" stroke="#4f8a3a" strokeWidth="3" strokeLinecap="round" />
          {(
            [
              [24, 38, "#f48fb1"],
              [34, 31.5, "#ffd54f"],
              [44.5, 28.5, "#ffffff"],
              [55.5, 28.5, "#f48fb1"],
              [66, 31.5, "#90c2f5"],
              [76, 38, "#ffd54f"],
            ] as const
          ).map(([x, y, c]) => (
            <g key={x}>
              <circle cx={x} cy={y} r="5" fill={c} />
              <circle cx={x} cy={y} r="1.8" fill={c === "#ffd54f" ? "#f08a24" : "#f6c443"} />
            </g>
          ))}
        </g>
      );
    case "casque-audio":
      return (
        <g>
          <path d="M20 52 C17 15 83 15 80 52" fill="none" stroke="#2d3142" strokeWidth="5" strokeLinecap="round" />
          <rect x="12" y="44" width="13" height="22" rx="6" fill="#e2483d" />
          <rect x="75" y="44" width="13" height="22" rx="6" fill="#e2483d" />
          <rect x="21" y="47" width="5" height="16" rx="2.5" fill="#2d3142" />
          <rect x="74" y="47" width="5" height="16" rx="2.5" fill="#2d3142" />
        </g>
      );
    case "tricorne":
      return (
        <g>
          <path d="M33 31 C33 12 67 12 67 31 Z" fill="#2a2730" />
          <path d="M11 20 C20 29 34 31 50 38 C66 31 80 29 89 20 C88 33 72 42 50 44 C28 42 12 33 11 20 Z" fill="#1d1b22" />
          <path
            d="M11 20 C20 29 34 31 50 38 C66 31 80 29 89 20"
            fill="none"
            stroke="#d4a63a"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="50" cy="35.5" r="2.8" fill="#d4a63a" />
        </g>
      );
    case "sorcier":
      return (
        <g>
          <path d="M30 34 L47 4 C49 0 56 0 57 4 L58 8 C58 10 60 12 62 14 L70 34 Z" fill="#5a3ea6" />
          <ellipse cx="50" cy="34" rx="29" ry="5.2" fill="#46308a" />
          <path d="M33 29 C44 31.5 56 31.5 67 29 L68.5 32 C56 35 44 35 31.5 32 Z" fill="#f2c04d" />
          <path d={starPath(47, 17, 3.6, 1.5)} fill="#f2c04d" />
          <path d={starPath(57, 24, 2.4, 1)} fill="#f2c04d" />
        </g>
      );
    case "viking":
      return (
        <g>
          <path d="M27 31 C17 27 11 17 12 6 C17 14 23 19 31 22 Z" fill="#efe6d2" stroke="#cdbf9f" strokeWidth="1" />
          <path d="M73 31 C83 27 89 17 88 6 C83 14 77 19 69 22 Z" fill="#efe6d2" stroke="#cdbf9f" strokeWidth="1" />
          <path d="M23 38 C23 15 77 15 77 38 Z" fill="#9aa4ae" />
          <rect x="22" y="33" width="56" height="7" rx="2" fill="#7a848e" />
          <path d="M48 16 L52 16 L52 33 L48 33 Z" fill="#7a848e" />
          <g fill="#d8dde2">
            <circle cx="30" cy="36.5" r="1.2" />
            <circle cx="40" cy="36.5" r="1.2" />
            <circle cx="60" cy="36.5" r="1.2" />
            <circle cx="70" cy="36.5" r="1.2" />
          </g>
        </g>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Yeux, bouche
// ---------------------------------------------------------------------------

export function WearEyes({ id }: { id: string }): ReactNode {
  switch (id) {
    case "yeux-chat":
      return (
        <g>
          {[40, 60].map((x) => (
            <g key={x}>
              <path
                d={`M${x - 7} 51 C${x - 4} 45.5 ${x + 4} 45.5 ${x + 7} 51 C${x + 4} 56.5 ${x - 4} 56.5 ${x - 7} 51 Z`}
                fill="#9ccc4a"
                stroke={INK}
                strokeWidth="1.5"
              />
              <ellipse cx={x} cy="51" rx="1.4" ry="4" fill={INK} />
            </g>
          ))}
        </g>
      );
    case "spirales":
      return (
        <g fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round">
          {[40, 60].map((x) => (
            <path key={x} d={`M${x} 51 a1 1 0 0 1 2 0 a2 2 0 0 1 -4 0 a3 3 0 0 1 6 0 a4 4 0 0 1 -8 0 a5 5 0 0 1 10 0`} />
          ))}
        </g>
      );
    case "yeux-coeur":
      return (
        <g fill="#e8384f" stroke="#a51f33" strokeWidth="0.9">
          <path d={heartPath(40, 51, 5.6)} />
          <path d={heartPath(60, 51, 5.6)} />
        </g>
      );
    default:
      return null;
  }
}

export function WearMouth({ id }: { id: string }): ReactNode {
  switch (id) {
    case "bisou":
      return (
        <g>
          <path
            d="M47 66 C47 62.5 51 62.5 51.5 64.5 C52 62.5 56 62.5 56 66 C56 69.5 51.5 70.5 51.5 70.5 C51.5 70.5 47 69.5 47 66 Z"
            fill="#e2577a"
          />
          <path d="M47.8 66.3 L55.2 66.3" stroke="#a83456" strokeWidth="1" />
          <path d={heartPath(64, 60, 3)} fill="#ef5a83" />
        </g>
      );
    case "dents":
      return (
        <g>
          <path d="M37 62 Q50 79 63 62 Z" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
          <g stroke={INK} strokeWidth="1.1">
            <path d="M38.5 64.6 L61.5 64.6" />
            <path d="M44 62.4 L44 68.6" />
            <path d="M50 62.4 L50 70.4" />
            <path d="M56 62.4 L56 68.6" />
          </g>
        </g>
      );
    case "crocs":
      return (
        <g>
          <path d="M39 63 Q50 73 61 63" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M43 65.6 L45 71 L47.2 67.2 Z" fill="#fff" stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
          <path d="M57 65.6 L55 71 L52.8 67.2 Z" fill="#fff" stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
        </g>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Visage (barbe sous les traits, le reste par-dessus)
// ---------------------------------------------------------------------------

export function WearFace({ id, layer, color }: { id: string; layer: "under" | "over"; color: string }): ReactNode {
  const under = layer === "under";
  switch (id) {
    case "barbe":
      return under ? (
        <path
          d="M22.5 55 C22 76 34 90 50 90 C66 90 78 76 77.5 55 C75 63 70 66 66 66 C64 72 58 76.5 50 76.5 C42 76.5 36 72 34 66 C30 66 25 63 22.5 55 Z"
          fill={color}
        />
      ) : null;
    case "bouc":
      return under ? <path d="M42 73.5 C42 80 46 87 50 87 C54 87 58 80 58 73.5 C55 75.5 45 75.5 42 73.5 Z" fill={color} /> : null;
    case "guidon":
      return under ? null : (
        <path
          d="M50 60.5 C45 56.5 38 57.5 35 61 C32 64 27.5 63 28 59 C26 64 30.5 68.5 36 66.5 C41 64.5 46 64 50 63 C54 64 59 64.5 64 66.5 C69.5 68.5 74 64 72 59 C72.5 63 68 64 65 61 C62 57.5 55 56.5 50 60.5 Z"
          fill={color}
        />
      );
    case "nez-rouge":
      return under ? null : (
        <g>
          <circle cx="50" cy="58" r="5.6" fill="#e53935" />
          <circle cx="48.3" cy="56.3" r="1.6" fill="#fff" fillOpacity="0.7" />
        </g>
      );
    case "moustaches-chat":
      return under ? null : (
        <g>
          <path d="M46.5 57 L53.5 57 L50 60.5 Z" fill="#e8789a" strokeLinejoin="round" />
          <g stroke={INK} strokeWidth="1.3" strokeLinecap="round">
            <path d="M36 60 L23 57" />
            <path d="M36 63 L23 64.5" />
            <path d="M64 60 L77 57" />
            <path d="M64 63 L77 64.5" />
          </g>
        </g>
      );
    case "bulle":
      return under ? null : (
        <g>
          <circle cx="54" cy="68" r="9.5" fill="#ff8fc2" stroke="#e0609c" strokeWidth="1.2" />
          <circle cx="50.5" cy="64.5" r="2.4" fill="#fff" fillOpacity="0.65" />
        </g>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Lunettes et masques (à la place de l'accessoire de base)
// ---------------------------------------------------------------------------

export function WearExtra({ id, uid }: { id: string; uid: string }): ReactNode {
  switch (id) {
    case "lunettes-3d":
      return (
        <g>
          <rect x="28.5" y="44" width="43" height="14" rx="2.5" fill="#f5f5f2" />
          <rect x="31" y="46.2" width="16" height="9.6" rx="1.5" fill="#e53935" fillOpacity="0.85" />
          <rect x="53" y="46.2" width="16" height="9.6" rx="1.5" fill="#29b6f6" fillOpacity="0.85" />
        </g>
      );
    case "aviateur":
      return (
        <g>
          <defs>
            <linearGradient id={`${uid}-aviateur`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3b2a1a" />
              <stop offset="1" stopColor="#c98a3a" />
            </linearGradient>
          </defs>
          <g fill={`url(#${uid}-aviateur)`} stroke="#c9a14b" strokeWidth="1.8">
            <path d="M30 46.5 C30 44 47 44 47 46.5 C47 55 43 59.5 38 59 C33 58.5 30 53 30 46.5 Z" />
            <path d="M70 46.5 C70 44 53 44 53 46.5 C53 55 57 59.5 62 59 C67 58.5 70 53 70 46.5 Z" />
          </g>
          <path d="M47 46 L53 46 M47 49 Q50 47.5 53 49" fill="none" stroke="#c9a14b" strokeWidth="1.4" />
        </g>
      );
    case "lunettes-etoile":
      return (
        <g>
          <g fill="#ffcf33" fillOpacity="0.85" stroke="#c48a00" strokeWidth="1.6" strokeLinejoin="round">
            <path d={starPath(39.5, 51.5, 10, 4.6)} />
            <path d={starPath(60.5, 51.5, 10, 4.6)} />
          </g>
          <path d="M47 50 Q50 48 53 50" fill="none" stroke="#c48a00" strokeWidth="1.6" />
        </g>
      );
    case "lunettes-coeur":
      return (
        <g>
          <g fill="#ff4f81" fillOpacity="0.85" stroke="#b81d55" strokeWidth="1.7" strokeLinejoin="round">
            <path d={heartPath(39.5, 51, 8.4)} />
            <path d={heartPath(60.5, 51, 8.4)} />
          </g>
          <path d="M47 49 Q50 47 53 49" fill="none" stroke="#b81d55" strokeWidth="1.6" />
        </g>
      );
    case "loup":
      return (
        <path
          d="M23 47.5 C29 39.5 44 41.5 50 46 C56 41.5 71 39.5 77 47.5 C77 56 68 60 60 58 C56 57 53 54.5 50 54.5 C47 54.5 44 57 40 58 C32 60 23 56 23 47.5 Z M34.5 50.5 C36 47 44 47 45.5 50.5 C44 53.5 36 53.5 34.5 50.5 Z M54.5 50.5 C56 47 64 47 65.5 50.5 C64 53.5 56 53.5 54.5 50.5 Z"
          fill="#6a2c91"
          fillRule="evenodd"
          stroke="#e2b84a"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      );
    case "visiere":
      return (
        <g>
          <defs>
            <linearGradient id={`${uid}-visiere`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2de2ff" />
              <stop offset="1" stopColor="#d34bff" />
            </linearGradient>
          </defs>
          <path
            d="M21 44.5 L79 44.5 C80.5 44.5 81 45.5 80.6 47 L78.4 56 C78 57.5 77 58 75.5 58 L24.5 58 C23 58 22 57.5 21.6 56 L19.4 47 C19 45.5 19.5 44.5 21 44.5 Z"
            fill={`url(#${uid}-visiere)`}
            fillOpacity="0.9"
          />
          <path d="M25 48 L75 48" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Cadres
// ---------------------------------------------------------------------------

export function WearFrame({ id, uid }: { id: string; uid: string }): ReactNode {
  switch (id) {
    case "lisere":
      return <circle cx="50" cy="50" r="48.2" fill="none" stroke="#fff" strokeOpacity="0.95" strokeWidth="3.6" />;
    case "cadre-or":
      return (
        <g fill="none">
          <defs>
            <linearGradient id={`${uid}-or`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff1b0" />
              <stop offset="0.35" stopColor="#e3b341" />
              <stop offset="0.7" stopColor="#a8761a" />
              <stop offset="1" stopColor="#f2cf6b" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="47" stroke={`url(#${uid}-or)`} strokeWidth="6.5" />
          <circle cx="50" cy="50" r="43.5" stroke="#7d5410" strokeOpacity="0.7" strokeWidth="1" />
        </g>
      );
    case "lauriers":
      return (
        <g>
          <circle cx="50" cy="50" r="48.4" fill="none" stroke="#d9a63a" strokeWidth="2.6" />
          {LAURELS.map((l, i) => (
            <ellipse
              key={i}
              cx={l.x.toFixed(2)}
              cy={l.y.toFixed(2)}
              rx="4.6"
              ry="2.1"
              transform={`rotate(${l.rot.toFixed(1)} ${l.x.toFixed(2)} ${l.y.toFixed(2)})`}
              fill={l.dark ? "#3d7f2f" : "#5aa845"}
            />
          ))}
        </g>
      );
    case "cadre-etoiles":
      return (
        <g>
          <circle cx="50" cy="50" r="46.5" fill="none" stroke="#24346b" strokeWidth="7" />
          <g fill="#ffd54a">
            {FRAME_STARS.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </g>
      );
    case "neon":
      return (
        <g fill="none">
          <circle cx="50" cy="50" r="47.2" stroke="#29f0ff" strokeOpacity="0.25" strokeWidth="9" />
          <circle cx="50" cy="50" r="47.2" stroke="#29f0ff" strokeWidth="3.2" />
          <circle cx="50" cy="50" r="47.2" stroke="#eaffff" strokeWidth="1" />
          <circle cx="50" cy="50" r="42" stroke="#ff4fd8" strokeOpacity="0.2" strokeWidth="5" />
          <circle cx="50" cy="50" r="42" stroke="#ff4fd8" strokeWidth="1.8" />
        </g>
      );
    case "cadre-arc-en-ciel": {
      const r = 46.8;
      const c = 2 * Math.PI * r;
      return (
        <g fill="none" strokeWidth="6.4" transform="rotate(-90 50 50)">
          {RAINBOW.map((col, i) => (
            <circle
              key={col}
              cx="50"
              cy="50"
              r={r}
              stroke={col}
              strokeDasharray={`${(c / 6 + 0.4).toFixed(2)} ${c.toFixed(2)}`}
              strokeDashoffset={(-i * c) / 6}
            />
          ))}
        </g>
      );
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Effets : immobiles en petit, avec « Effets réduits » ou si le système demande moins d'animations
// ---------------------------------------------------------------------------

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

function Note({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="3.4" ry="2.6" transform="rotate(-20)" />
      <rect x="2.2" y="-12" width="1.5" height="12" />
      <path d="M3.7 -12 C7 -10 8.5 -7.5 7.5 -4.5 C7 -7 5.5 -8.5 3.7 -9 Z" />
    </g>
  );
}

export function WearFx({ id, layer, big }: { id: string; layer: "back" | "front"; big: boolean }): ReactNode {
  const reduced = usePrefs((s) => s.reducedEffects);
  const anim = big && !reduced ? "av-fx is-moving" : "av-fx";
  const back = layer === "back";
  switch (id) {
    case "notes":
      return back ? null : (
        <g className={anim} fill="#2a1f4a" stroke="#fff" strokeWidth="0.7" paintOrder="stroke">
          <g className="av-float" style={delay(0)}>
            <Note x={14} y={36} s={1.3} />
          </g>
          <g className="av-float" style={delay(1.1)}>
            <Note x={80} y={27} s={1.15} />
          </g>
          <g className="av-float" style={delay(2.2)}>
            <Note x={84} y={60} s={1} />
          </g>
        </g>
      );
    case "coeurs":
      return back ? null : (
        <g className={anim} fill="#ff4d7d" stroke="#fff" strokeWidth="0.8">
          <path className="av-float" style={delay(0)} d={heartPath(15, 35, 6.6)} />
          <path className="av-float" style={delay(1)} d={heartPath(83, 24, 5.6)} />
          <path className="av-float" style={delay(2)} d={heartPath(85, 58, 4.8)} />
        </g>
      );
    case "etincelles":
      return back ? null : (
        <g className={anim} fill="#fff6c2" stroke="#f2b632" strokeWidth="0.6">
          <path className="av-twinkle" style={delay(0)} d={sparkPath(17, 25, 8)} />
          <path className="av-twinkle" style={delay(0.6)} d={sparkPath(83, 19, 6.6)} />
          <path className="av-twinkle" style={delay(1.2)} d={sparkPath(88, 52, 5.4)} />
          <path className="av-twinkle" style={delay(0.9)} d={sparkPath(12, 58, 4.6)} />
        </g>
      );
    case "aureole":
      return back ? null : (
        <g className={anim}>
          <g className="av-bob" fill="none">
            <ellipse cx="50" cy="9" rx="17" ry="4.6" stroke="#fff2a8" strokeOpacity="0.45" strokeWidth="7" />
            <ellipse cx="50" cy="9" rx="17" ry="4.6" stroke="#ffd54a" strokeWidth="3" />
          </g>
        </g>
      );
    case "flammes":
      return back ? (
        <g className={anim}>
          <g className="av-flicker">
            <path
              d="M11 84 C4 68 9 53 17 41 C17 51 21 55 24 55 C20 40 27 22 38 12 C36 24 40 30 44 32 C42 20 48 8 56 1 C56 14 60 22 64 26 C66 18 72 14 79 11 C75 22 79 33 81 40 C85 36 87 31 88 26 C95 43 96 66 89 84 C80 77 66 73 50 73 C34 73 20 77 11 84 Z"
              fill="#ff7a1a"
            />
            <path
              d="M20 80 C15 68 19 58 26 50 C27 58 30 61 32 61 C30 48 35 35 43 27 C42 37 45 42 48 44 C47 34 52 24 58 18 C58 29 61 35 64 38 C66 32 70 29 74 27 C72 36 75 45 76 51 C79 48 80 44 81 41 C86 54 86 70 80 80 C72 75 62 72 50 72 C38 72 28 75 20 80 Z"
              fill="#ffd23f"
            />
          </g>
        </g>
      ) : null;
    default:
      return null;
  }
}
