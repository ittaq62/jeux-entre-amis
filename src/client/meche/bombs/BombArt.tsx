import { useId, type CSSProperties, type ReactNode } from "react";
import type { BombId } from "../../../shared/games/meche/bombs.ts";
import "./bombs.css";

// Ce qui saute au bout de la mèche, dessiné posé sur le rebord de la table (le sol est en bas du dessin). Quelques
// bombes suivent la mèche : `--p`, la part de corde brûlée (de 0 à 1), est posée par la corde sur un parent. Le ballon et
// la boule de neige grossissent, les bougies fondent, l'aiguille du réveil tourne, la jauge du gaz monte, les abeilles
// sortent une à une.

/** Toutes les bombes dans le même cadre : 100 de large, 70 de haut, posées sur la ligne 66 */
export const BOMB_VIEWBOX = "0 0 100 70";

export function BombArt({ id, className = "", style }: { id: BombId; className?: string; style?: CSSProperties }) {
  const uid = `b${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={`bomb-art bomb-${id} ${className}`} viewBox={BOMB_VIEWBOX} width="100" height="70" style={style} aria-hidden="true">
      {ART[id](uid)}
    </svg>
  );
}

const shadow = (rx: number) => <ellipse cx="50" cy="66.5" rx={rx} ry="3.4" fill="rgba(0,0,0,0.35)" />;

const ART: Record<BombId, (uid: string) => ReactNode> = {
  dynamite: () => (
    <g transform="translate(0 8)">
      <ellipse cx="50" cy="58" rx="44" ry="4" fill="rgba(0,0,0,0.35)" />
      {[6, 22, 38].map((y, i) => (
        <g key={y}>
          <rect x="7" y={y} width="86" height="17" rx="8.5" fill="#b8302a" />
          <rect x="11" y={y + 2.2} width="78" height="4" rx="2" fill="#e2624f" opacity={0.85} />
          <rect x="9" y={y + 12} width="82" height="3.5" rx="1.75" fill="#7d1f19" opacity={0.6} />
          <ellipse cx="9.5" cy={y + 8.5} rx="4" ry="8" fill={i === 1 ? "#d9554a" : "#c8463a"} stroke="#6e1a14" strokeWidth="1" />
        </g>
      ))}
      <rect x="24" y="3.5" width="9" height="53" rx="2" fill="#2b211b" />
      <rect x="67" y="3.5" width="9" height="53" rx="2" fill="#2b211b" />
      <rect x="35" y="21" width="30" height="20" rx="3" fill="#f3e4c4" stroke="#2b211b" strokeWidth="1.5" />
      <text
        x="50"
        y="35.5"
        textAnchor="middle"
        fontSize="12.5"
        fontWeight="800"
        fontFamily="var(--font-card)"
        fill="#b8302a"
        letterSpacing="0.6"
      >
        BOUM
      </text>
    </g>
  ),

  ballon: (uid) => (
    <>
      <defs>
        <radialGradient id={`${uid}-rubber`} cx="0.38" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#ff8fb0" />
          <stop offset="0.55" stopColor="#f0386a" />
          <stop offset="1" stopColor="#a8123f" />
        </radialGradient>
      </defs>
      {shadow(15)}
      {/* Le ruban, qui file jusqu'à la corde */}
      <path
        className="balloon-string"
        d="M50 52c-4 3 4 5 0 8s3 4 1 6"
        fill="none"
        stroke="#f1ece4"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <g className="balloon-body">
        <path d="M50 3C36 3 27 15 28 28c1 12 10 20 20 23h4c10-3 19-11 20-23C73 15 64 3 50 3Z" fill={`url(#${uid}-rubber)`} />
        <path d="M46 51h8l-1.8 3.4h-4.4Z" fill="#a8123f" />
        <ellipse cx="40" cy="15" rx="4.6" ry="8" transform="rotate(-24 40 15)" fill="#fff" opacity="0.55" />
        <ellipse cx="37.5" cy="25" rx="1.6" ry="2.4" transform="rotate(-24 37.5 25)" fill="#fff" opacity="0.4" />
        {/* La peau qui se tend : de plus en plus claire à mesure qu'il gonfle */}
        <path className="balloon-strain" d="M50 3C36 3 27 15 28 28c1 12 10 20 20 23h4c10-3 19-11 20-23C73 15 64 3 50 3Z" fill="#ffd2df" />
      </g>
    </>
  ),

  neige: (uid) => (
    <>
      <defs>
        <radialGradient id={`${uid}-snow`} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#eaf4fb" />
          <stop offset="1" stopColor="#a9c9de" />
        </radialGradient>
      </defs>
      {shadow(27)}
      <path d="M14 67c6-7 16-9 24-8 6-4 18-4 24 0 8-1 18 1 24 8Z" fill="#eef6fb" />
      <path d="M22 67c5-4 11-5 16-4M62 63c6-1 12 1 16 4" fill="none" stroke="#c4dbea" strokeWidth="1.2" strokeLinecap="round" />
      <g className="snow-ball">
        <circle cx="50" cy="38" r="25" fill={`url(#${uid}-snow)`} />
        <path d="M30 47c6 10 22 14 34 7" fill="none" stroke="#9fc0d6" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
        <circle cx="41" cy="27" r="5" fill="#fff" opacity="0.9" />
        {[
          [58, 30, 1.6],
          [63, 41, 1.3],
          [46, 46, 1.4],
          [36, 38, 1.1],
          [54, 52, 1.2],
        ].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#c2dbeb" />
        ))}
        <path d="M60 22l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4Z" fill="#fff" className="snow-glint" />
      </g>
      {[
        [20, 8, 0],
        [80, 4, 0.6],
        [88, 22, 1.2],
        [12, 26, 1.7],
      ].map(([x, y, d]) => (
        <circle key={`${x}-${y}`} className="snow-flake" cx={x} cy={y} r="1.8" fill="#fff" style={{ animationDelay: `${d}s` }} />
      ))}
    </>
  ),

  gateau: (uid) => (
    <>
      <defs>
        <linearGradient id={`${uid}-cake`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb3c9" />
          <stop offset="1" stopColor="#e7789a" />
        </linearGradient>
        <radialGradient id={`${uid}-flame`} cx="0.5" cy="0.7" r="0.6">
          <stop offset="0" stopColor="#fff7c2" />
          <stop offset="0.5" stopColor="#ffc93c" />
          <stop offset="1" stopColor="#ff7a2e" />
        </radialGradient>
      </defs>
      {shadow(40)}
      <ellipse cx="50" cy="63" rx="42" ry="5" fill="#f4efe6" stroke="#cfc6b8" strokeWidth="1" />
      <rect x="17" y="37" width="66" height="25" rx="5" fill={`url(#${uid}-cake)`} />
      <rect x="17" y="50" width="66" height="3.2" fill="#fff3e6" opacity="0.9" />
      {/* Le glaçage et ses coulures */}
      <path
        d="M17 40c0-5 15-8 33-8s33 3 33 8v3c-2 0-3 4-5 4s-2-5-5-5-3 7-6 7-3-6-6-6-3 4-6 4-3-6-6-6-3 8-6 8-3-7-6-7-3 5-6 5-3-6-6-6-2 3-5 3Z"
        fill="#fff6f8"
      />
      {[
        [26, 56, "#43c6ac"],
        [36, 58, "#ffd23f"],
        [47, 56, "#6a8dff"],
        [58, 58, "#43c6ac"],
        [69, 56, "#ffd23f"],
        [76, 59, "#6a8dff"],
      ].map(([x, y, c]) => (
        <rect
          key={`${x}`}
          x={x as number}
          y={y as number}
          width="3.4"
          height="1.6"
          rx="0.8"
          fill={c as string}
          transform={`rotate(${(x as number) % 50} ${x} ${y})`}
        />
      ))}
      {[
        [33, "#8ecdf0"],
        [50, "#ff9ec0"],
        [67, "#b9e48a"],
      ].map(([x, c], i) => (
        <g key={x} className="cake-candle-slot" style={{ "--i": i } as CSSProperties}>
          <g className="cake-candle">
            <rect x={(x as number) - 2.6} y="17" width="5.2" height="18" rx="1.4" fill={c as string} />
            <path
              d={`M${(x as number) - 2.6} 21l5.2-2.6M${(x as number) - 2.6} 27l5.2-2.6M${(x as number) - 2.6} 33l5.2-2.6`}
              stroke="#fff"
              strokeWidth="1.3"
              opacity="0.8"
            />
          </g>
          <g className="cake-flame-slot">
            <line x1={x as number} y1="17" x2={x as number} y2="14" stroke="#3a2a20" strokeWidth="1" />
            <ellipse className="cake-flame" cx={x as number} cy="10" rx="3.2" ry="5.4" fill={`url(#${uid}-flame)`} />
          </g>
        </g>
      ))}
    </>
  ),

  reveil: (uid) => (
    <>
      <defs>
        <radialGradient id={`${uid}-case`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ff6b5a" />
          <stop offset="1" stopColor="#a8231a" />
        </radialGradient>
        <linearGradient id={`${uid}-brass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe48a" />
          <stop offset="1" stopColor="#c08a1e" />
        </linearGradient>
      </defs>
      {shadow(22)}
      <path d="M36 58l-6 9M64 58l6 9" stroke="#3b2b22" strokeWidth="4" strokeLinecap="round" />
      <g className="clock-bells">
        <g transform="rotate(-30 32 17)">
          <path d="M20 21a12 12 0 0 1 24 0Z" fill={`url(#${uid}-brass)`} stroke="#7a5512" strokeWidth="1" />
          <rect x="30.5" y="7" width="3" height="3" rx="1" fill="#7a5512" />
        </g>
        <g transform="rotate(30 68 17)">
          <path d="M56 21a12 12 0 0 1 24 0Z" fill={`url(#${uid}-brass)`} stroke="#7a5512" strokeWidth="1" />
          <rect x="66.5" y="7" width="3" height="3" rx="1" fill="#7a5512" />
        </g>
      </g>
      <g className="clock-hammer">
        <rect x="48.8" y="9" width="2.4" height="9" fill="#5a4a3a" />
        <circle cx="50" cy="8.5" r="3" fill="#7a5512" />
      </g>
      <g className="clock-case">
        <circle cx="50" cy="40" r="24" fill={`url(#${uid}-case)`} stroke="#5e130d" strokeWidth="1.4" />
        <circle cx="50" cy="40" r="18.5" fill="#fffaf0" stroke="#d9c9a8" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, k) => (
          <rect
            key={k}
            x="49.3"
            y={k % 3 === 0 ? 23.5 : 24}
            width="1.4"
            height={k % 3 === 0 ? 4 : 2.6}
            rx="0.6"
            fill="#3b2b22"
            transform={`rotate(${k * 30} 50 40)`}
          />
        ))}
        <rect className="clock-hour" x="48.9" y="30" width="2.2" height="11" rx="1.1" fill="#2b211b" />
        <rect className="clock-minute" x="49.3" y="24.5" width="1.4" height="16" rx="0.7" fill="#c0392b" />
        <circle cx="50" cy="40" r="2.2" fill="#2b211b" />
        <ellipse cx="41" cy="27" rx="5" ry="2.6" transform="rotate(-35 41 27)" fill="#fff" opacity="0.45" />
      </g>
    </>
  ),

  ruche: (uid) => (
    <>
      <defs>
        <linearGradient id={`${uid}-straw`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b9821f" />
          <stop offset="0.45" stopColor="#f2c25a" />
          <stop offset="1" stopColor="#a8711a" />
        </linearGradient>
      </defs>
      {shadow(32)}
      <rect x="18" y="60" width="64" height="6.5" rx="2" fill="#7a5230" />
      <rect x="18" y="60" width="64" height="2" rx="1" fill="#9c6c42" />
      <g className="hive-body">
        <path d="M24 61C23 36 34 13 50 13s27 23 26 48Z" fill={`url(#${uid}-straw)`} />
        {[
          "M25.5 53c16 3 33 3 49 0",
          "M26.5 44c15 3 32 3 47 0",
          "M29 35c13 3 29 3 42 0",
          "M33 27c11 2.5 23 2.5 34 0",
          "M39 20c7 1.6 15 1.6 22 0",
        ].map((d) => (
          <path key={d} d={d} fill="none" stroke="#8c5c14" strokeWidth="1.8" strokeLinecap="round" />
        ))}
        <path d="M43 61a7 6.5 0 0 1 14 0Z" fill="#2a1808" />
        <path d="M70 41c2 0 3 3 2.4 6s-2.4 3-3 0 .6-6 .6-6Z" fill="#ffb31a" opacity="0.9" />
      </g>
      {/* Les abeilles sortent une à une à mesure que la mèche brûle */}
      {Array.from({ length: 6 }, (_, k) => (
        <g key={k} className="hive-orbit" style={{ "--k": k } as CSSProperties}>
          <g className="hive-bee">
            <ellipse cx="0" cy="-3" rx="2.6" ry="1.8" fill="#fff" opacity="0.85" className="bee-wing" />
            <ellipse cx="0" cy="0" rx="3.4" ry="2.4" fill="#ffcc33" />
            <path d="M-1 -2.3v4.6M1.4 -2.1v4.2" stroke="#1c1610" strokeWidth="1.1" />
            <circle cx="3.2" cy="-0.2" r="1.3" fill="#1c1610" />
          </g>
        </g>
      ))}
    </>
  ),

  fusee: (uid) => (
    <>
      <defs>
        <linearGradient id={`${uid}-tube`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8f1d2c" />
          <stop offset="0.4" stopColor="#e8475c" />
          <stop offset="1" stopColor="#8f1d2c" />
        </linearGradient>
      </defs>
      {shadow(20)}
      <path d="M32 67c4-7 11-10 18-10s14 3 18 10Z" fill="#8a6a44" />
      <path d="M38 63c3-2 7-3 12-3" fill="none" stroke="#a88a62" strokeWidth="1.2" strokeLinecap="round" />
      <g className="rocket">
        <rect x="48.6" y="40" width="2.8" height="22" rx="1" fill="#c49a62" />
        <path d="M40 40l-6 9 6-2.4ZM60 40l6 9-6-2.4Z" fill="#2f5ec9" />
        <rect x="40" y="15" width="20" height="30" rx="2.4" fill={`url(#${uid}-tube)`} />
        <rect x="40" y="21" width="20" height="3.6" fill="#fff4e0" />
        <rect x="40" y="35" width="20" height="3.6" fill="#fff4e0" />
        <path d="M50 26.6l1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4Z" fill="#ffd23f" />
        <path d="M39 15.5L50 1l11 14.5Z" fill="#ffd23f" stroke="#b9820f" strokeWidth="1" strokeLinejoin="round" />
        <rect x="45" y="45" width="10" height="3" rx="1" fill="#3a2a20" />
      </g>
      <g className="rocket-sparks">
        {[
          [44, 52, 0],
          [56, 53, 0.15],
          [50, 56, 0.3],
          [47, 50, 0.45],
        ].map(([x, y, d]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="#fff07a" style={{ animationDelay: `${d}s` }} />
        ))}
      </g>
    </>
  ),

  gaz: (uid) => (
    <>
      <defs>
        <linearGradient id={`${uid}-tank`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4c7a2a" />
          <stop offset="0.4" stopColor="#9ccf5a" />
          <stop offset="1" stopColor="#3f6a22" />
        </linearGradient>
        <pattern id={`${uid}-stripes`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="#ffd23f" />
          <rect width="3.5" height="7" fill="#1e1a14" />
        </pattern>
      </defs>
      {shadow(22)}
      {/* Le tuyau qui part de la bonbonne vers la jauge */}
      <path d="M53 12c6 0 9 2 12 6" fill="none" stroke="#5c646c" strokeWidth="2.6" strokeLinecap="round" />
      <g className="gas-tank">
        <rect x="29" y="15" width="38" height="51" rx="13" fill={`url(#${uid}-tank)`} stroke="#2f4f1a" strokeWidth="1.2" />
        <rect x="30" y="60" width="36" height="6" rx="2" fill="#2f4f1a" />
        <rect x="29.6" y="44" width="36.8" height="7.5" fill={`url(#${uid}-stripes)`} />
        <circle cx="48" cy="31" r="8.6" fill="#f6f2d0" stroke="#2f4f1a" strokeWidth="1.2" />
        {/* Le signe du danger : trois lobes autour d'un rond */}
        <g fill="#2f4f1a">
          <circle cx="48" cy="26.6" r="2.6" />
          <circle cx="44.2" cy="33.2" r="2.6" />
          <circle cx="51.8" cy="33.2" r="2.6" />
          <circle cx="48" cy="31" r="1.5" fill="#f6f2d0" />
        </g>
        <rect x="42" y="8" width="12" height="8" rx="2" fill="#8a939d" stroke="#4b5260" strokeWidth="1" />
        <ellipse cx="48" cy="7.4" rx="9" ry="2.8" fill="#c0392b" stroke="#7a1f16" strokeWidth="1" />
        <ellipse cx="34.5" cy="30" rx="2.4" ry="9" fill="#d8f2a8" opacity="0.4" />
      </g>
      <g className="gas-gauge" transform="translate(71 23)">
        <circle r="9.4" fill="#fbfaf2" stroke="#4b5260" strokeWidth="2" />
        <path d="M4.7 -5.6A7.2 7.2 0 0 1 6.4 4.1" fill="none" stroke="#d8402f" strokeWidth="2.6" />
        <g className="gas-needle">
          <rect x="-0.7" y="-7" width="1.4" height="7.6" rx="0.7" fill="#2b211b" />
        </g>
        <circle r="1.5" fill="#2b211b" />
      </g>
      {/* Le gaz qui fuit de la vanne */}
      {[0, 1, 2].map((k) => (
        <circle key={k} className="gas-puff" cx="56" cy="5" r="4" fill="#a8e65a" style={{ "--k": k } as CSSProperties} />
      ))}
    </>
  ),
};
