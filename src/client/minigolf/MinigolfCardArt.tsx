import { useId } from "react";
import type { CardArt } from "../../shared/cards.ts";
import "./minigolfCard.css";

type Subject = Extract<CardArt, { kind: "minigolf" }>["subject"];

/** Une balle de minigolf : sa couleur, son reflet, ses alvéoles */
function Ball({ x, y, r, color = "#fbfaf4", stripe }: { x: number; y: number; r: number; color?: string; stripe?: string }) {
  const clip = useId();
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={color} />
      {stripe && (
        <>
          <clipPath id={clip}>
            <circle cx={x} cy={y} r={r} />
          </clipPath>
          <path
            d={`M${x - r * 1.1} ${y + r * 0.05}Q${x} ${y + r * 0.6} ${x + r * 1.1} ${y + r * 0.05}`}
            stroke={stripe}
            strokeWidth={r * 0.32}
            fill="none"
            clipPath={`url(#${clip})`}
          />
        </>
      )}
      <circle cx={x} cy={y} r={r} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={r * 0.12} />
      {[
        [-0.35, 0.25],
        [0.1, 0.4],
        [0.42, 0.05],
        [-0.05, -0.05],
        [-0.45, -0.2],
      ].map(([dx, dy], i) => (
        <circle key={i} cx={x + dx! * r} cy={y + dy! * r} r={r * 0.09} fill="rgba(0,0,0,.14)" />
      ))}
      <ellipse
        cx={x - r * 0.35}
        cy={y - r * 0.42}
        rx={r * 0.32}
        ry={r * 0.2}
        fill="#fff"
        opacity="0.85"
        transform={`rotate(-30 ${x - r * 0.35} ${y - r * 0.42})`}
      />
    </g>
  );
}

/** Une ombre posée au sol */
const Shadow = ({ y = 38, rx = 40 }: { y?: number; rx?: number }) => (
  <ellipse cx="0" cy={y} rx={rx} ry={rx * 0.16} fill="rgba(0,0,0,.28)" />
);

/** Les dessins des cartes de la famille « Le Minigolf » : le matériel, les obstacles des parcours, et le trou en un */
export function MinigolfCardArt({ subject }: { subject: Subject }) {
  const wood = "#b77b45";
  const woodDark = "#6e4422";
  const ink = "#24302a";
  return (
    <svg className="tc-svg" viewBox="-60 -60 120 120" aria-hidden="true">
      {subject === "putter" && (
        <g>
          <Shadow y={42} rx={44} />
          {/* Le manche, la poignée, la tête en laiton */}
          <path d="M26 -54L-14 34" stroke="#d9dde3" strokeWidth="5" strokeLinecap="round" />
          <path d="M26 -54L-14 34" stroke="#8b929c" strokeWidth="1.4" strokeLinecap="round" transform="translate(1.6 0.8)" opacity="0.6" />
          <path d="M27 -55L18 -34" stroke="#1d1f22" strokeWidth="9" strokeLinecap="round" />
          <path d="M25 -50L19 -37" stroke="#4a4f57" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M-44 31C-44 27 -40 25 -36 25H-8C-4 25 -2 28 -2 31V37C-2 40 -4 42 -8 42H-38C-42 42 -44 40 -44 37Z"
            fill="#d6a640"
            stroke="#6b4c12"
            strokeWidth="2.5"
          />
          <path d="M-38 29H-10" stroke="#fff1b8" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
          <Ball x={22} y={34} r={9} />
        </g>
      )}
      {subject === "balle" && (
        <g>
          <Shadow y={40} rx={34} />
          {[
            [-54, -6, -30],
            [-56, 8, -34],
            [-50, 22, -32],
          ].map(([x1, y, x2], i) => (
            <path key={i} d={`M${x1} ${y}H${x2}`} stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity={0.55 - i * 0.12} />
          ))}
          <Ball x={4} y={6} r={32} color="#f2994a" stripe="#fff3dc" />
        </g>
      )}
      {subject === "carte" && (
        <g>
          <Shadow y={44} rx={42} />
          <g transform="rotate(-8)">
            <rect x="-36" y="-46" width="72" height="88" rx="5" fill="#fbf5e6" stroke="#8d7a55" strokeWidth="2.5" />
            <rect x="-36" y="-46" width="72" height="14" rx="5" fill="#2f7d4a" />
            <text x="0" y="-35.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fbf5e6">
              SCORE
            </text>
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <path d={`M-30 ${-22 + i * 13}H30`} stroke="#d3c6a8" strokeWidth="1.2" />
                <text x="-24" y={-25 + i * 13} fontSize="8" fill="#6e6248">
                  {i + 1}
                </text>
                <text x="22" y={-25 + i * 13} fontSize="9" fontWeight="700" fill={i === 3 ? "#c8392d" : ink} textAnchor="middle">
                  {["2", "3", "2", "7", "?"][i]}
                </text>
              </g>
            ))}
            <path d="M8 -32V40" stroke="#d3c6a8" strokeWidth="1.2" />
          </g>
          {/* Le petit crayon, sans gomme */}
          <g transform="rotate(38 26 10)">
            <rect x="18" y="-26" width="8" height="52" fill="#f2c94c" stroke="#8a6a1c" strokeWidth="1.8" />
            <path d="M18 26L22 38L26 26Z" fill="#e8c9a0" stroke="#8a6a1c" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M21 34.5L22 38L23 34.5Z" fill={ink} />
          </g>
        </g>
      )}
      {subject === "tapis" && (
        <g>
          <Shadow y={40} rx={50} />
          <path d="M-44 36L-28 -26H28L44 36Z" fill="#2f8f4a" stroke="#1d5a2e" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M-36 30L-24 -20H24L36 30Z" fill="#3fae5c" />
          {[-14, -2, 10, 22].map((y, i) => (
            <path key={i} d={`M${-26 - i * 2.4} ${y}H${26 + i * 2.4}`} stroke="#57c272" strokeWidth="1.2" opacity="0.6" />
          ))}
          <ellipse cx="0" cy="16" rx="9" ry="3.4" fill="#fbf5e6" opacity="0.9" />
          <Ball x={0} y={8} r={9} color="#4f8ff7" />
          {/* Les deux bornes du départ */}
          {[-34, 34].map((x) => (
            <g key={x}>
              <path d={`M${x - 5} 34L${x} 18L${x + 5} 34Z`} fill="#e2483d" stroke="#7a1f18" strokeWidth="2" strokeLinejoin="round" />
            </g>
          ))}
        </g>
      )}
      {subject === "moulin" && (
        <g>
          <Shadow y={44} rx={42} />
          {/* La maisonnette, son toit, l'arche où passe la balle */}
          <path d="M-22 42V-2H22V42Z" fill="#f4efe2" stroke={woodDark} strokeWidth="2.5" />
          <path d="M-28 -2L0 -26L28 -2Z" fill="#c8392d" stroke="#6e1f18" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M-9 42V30C-9 24 9 24 9 30V42Z" fill="#1b1b18" />
          <rect x="-6" y="6" width="12" height="12" fill="#7fb6e0" stroke={woodDark} strokeWidth="2" />
          {/* Les quatre ailes */}
          <g transform="translate(0 -10) rotate(22)">
            {[0, 90, 180, 270].map((a) => (
              <g key={a} transform={`rotate(${a})`}>
                <path d="M0 0L-4 -46" stroke={woodDark} strokeWidth="3" />
                <path d="M-1 -12L-12 -14L-15 -44L-4 -46Z" fill="#fbf5e6" stroke={woodDark} strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M-6 -20L-13 -21M-7 -30L-14 -31M-8 -40L-14 -41" stroke="#c9b48c" strokeWidth="1" />
              </g>
            ))}
            <circle r="5" fill={wood} stroke={woodDark} strokeWidth="2" />
          </g>
          <Ball x={-30} y={38} r={6} />
        </g>
      )}
      {subject === "tremplin" && (
        <g>
          <Shadow y={42} rx={48} />
          <path d="M-50 40H8L8 22C-14 22 -34 32 -50 40Z" fill={wood} stroke={woodDark} strokeWidth="2.5" strokeLinejoin="round" />
          {[-34, -20, -6].map((x) => (
            <path key={x} d={`M${x} ${40 - (x + 50) * 0.32}V40`} stroke={woodDark} strokeWidth="1.4" opacity="0.6" />
          ))}
          {/* La balle s'envole : son trajet en pointillé */}
          <path
            d="M6 20C18 -22 38 -40 50 -30"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeDasharray="1 7"
            strokeLinecap="round"
            opacity="0.9"
          />
          <Ball x={28} y={-30} r={10} color="#e86aa6" />
          <path d="M44 -8L52 -4M40 -2L46 4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
        </g>
      )}
      {subject === "bassin" && (
        <g>
          <ellipse cx="0" cy="22" rx="52" ry="20" fill="#9b8a6a" />
          <ellipse cx="0" cy="20" rx="48" ry="17" fill="#2f78b8" />
          <ellipse cx="-4" cy="18" rx="22" ry="7" fill="none" stroke="#8fd0ff" strokeWidth="2" opacity="0.8" />
          <ellipse cx="-4" cy="18" rx="34" ry="11" fill="none" stroke="#8fd0ff" strokeWidth="1.5" opacity="0.45" />
          {/* Plouf */}
          {[
            [-10, -6, -16, -22],
            [-2, -10, -2, -30],
            [6, -6, 12, -24],
          ].map(([x1, y1, x2, y2], i) => (
            <path
              key={i}
              d={`M${x1} ${y1! + 22}Q${(x1! + x2!) / 2} ${y2! + 6} ${x2} ${y2! + 26}`}
              stroke="#cfeeff"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          ))}
          <circle cx="-16" cy="-8" r="3" fill="#cfeeff" />
          <circle cx="12" cy="-10" r="2.6" fill="#cfeeff" />
          <circle cx="-2" cy="-16" r="2.4" fill="#cfeeff" />
          {/* Le canard qui rigole */}
          <g transform="translate(30 10)">
            <ellipse cx="0" cy="4" rx="12" ry="7" fill="#f2c94c" stroke="#8a6a1c" strokeWidth="1.8" />
            <circle cx="8" cy="-6" r="6" fill="#f2c94c" stroke="#8a6a1c" strokeWidth="1.8" />
            <path d="M13 -6L20 -4L13 -2Z" fill="#f2994a" stroke="#a8541c" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M7 -8.5Q9 -10.5 11 -8.5" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
        </g>
      )}
      {subject === "drapeau" && (
        <g>
          <ellipse cx="-4" cy="38" rx="40" ry="10" fill="#3fae5c" />
          <ellipse cx="-4" cy="38" rx="11" ry="4.2" fill="#121510" />
          <path d="M-4 38V-50" stroke="#f4f4f0" strokeWidth="3.4" strokeLinecap="round" />
          <path
            d="M-4 -50C8 -54 18 -42 34 -46C26 -38 26 -30 34 -22C18 -18 8 -30 -4 -26Z"
            fill="#e2483d"
            stroke="#7a1f18"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <text x="13" y="-31" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fbf5e6">
            9
          </text>
          <Ball x={24} y={34} r={7} color="#a7e070" />
          <path d="M20 22L14 16M28 20L30 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
        </g>
      )}
      {subject === "coucou" && (
        <g>
          {/* La pendule, son toit à frise, la porte où sort l'oiseau */}
          <path d="M-26 34V-14H26V34Z" fill={wood} stroke={woodDark} strokeWidth="2.5" />
          <path d="M-34 -12L0 -44L34 -12Z" fill="#7a4a24" stroke={woodDark} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M-26 -12L0 -36L26 -12" fill="none" stroke="#e8c58e" strokeWidth="2" strokeDasharray="3 3" />
          <circle cx="0" cy="12" r="15" fill="#fbf5e6" stroke={woodDark} strokeWidth="2.2" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={Math.sin(a) * 11.5} cy={12 - Math.cos(a) * 11.5} r="1.1" fill={ink} />;
          })}
          <path d="M0 12V3M0 12L6 15" stroke={ink} strokeWidth="2" strokeLinecap="round" />
          <rect x="-7" y="-26" width="14" height="12" fill="#2a1a10" />
          <g transform="translate(0 -22)">
            <ellipse cx="2" cy="0" rx="7" ry="5" fill="#f2c94c" stroke="#8a6a1c" strokeWidth="1.5" />
            <path d="M8 -1L15 1L8 3Z" fill="#f2994a" />
            <circle cx="5" cy="-1.5" r="1.1" fill={ink} />
          </g>
          {/* Le balancier et les deux poids */}
          <path d="M0 34V50" stroke="#b08a3a" strokeWidth="2" />
          <circle cx="0" cy="52" r="5" fill="#d6a640" stroke="#6b4c12" strokeWidth="1.5" />
          {[-14, 14].map((x, i) => (
            <g key={x}>
              <path d={`M${x} 34V${42 + i * 6}`} stroke="#3a2f25" strokeWidth="1.2" />
              <ellipse cx={x} cy={48 + i * 6} rx="4" ry="7" fill="#6e4422" stroke="#3a2412" strokeWidth="1.2" />
            </g>
          ))}
        </g>
      )}
      {subject === "volcan" && (
        <g>
          <path d="M-56 44L-18 -22H18L56 44Z" fill="#4a3530" stroke="#22150f" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M-18 -22C-10 -16 -4 -26 2 -18C8 -26 12 -18 18 -22" fill="none" stroke="#22150f" strokeWidth="2.5" />
          <path d="M-12 -20C-8 -2 -14 14 -6 44M8 -20C4 0 14 18 10 44" stroke="#ff6a2a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path
            d="M-12 -20C-8 -2 -14 14 -6 44M8 -20C4 0 14 18 10 44"
            stroke="#ffd25a"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="0" cy="-22" rx="18" ry="5" fill="#ff8a3a" />
          <ellipse cx="0" cy="-22" rx="10" ry="2.6" fill="#ffe08a" />
          {/* Une balle qui s'envole du cratère, et le petit drapeau courageux */}
          <path d="M2 -26C4 -40 12 -48 22 -50" fill="none" stroke="#ffd9a0" strokeWidth="2.4" strokeDasharray="1 5" strokeLinecap="round" />
          <Ball x={26} y={-48} r={7} />
          <path d="M-30 18V-6" stroke="#f4f4f0" strokeWidth="2" />
          <path d="M-30 -6L-18 -2L-30 2Z" fill="#3fae5c" />
        </g>
      )}
      {subject === "trou-en-un" && (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <path
                key={i}
                d={`M${Math.cos(a) * 18} ${10 + Math.sin(a) * 18}L${Math.cos(a + 0.12) * 60} ${10 + Math.sin(a + 0.12) * 60}L${Math.cos(a - 0.12) * 60} ${10 + Math.sin(a - 0.12) * 60}Z`}
                fill="#fff3b0"
                opacity="0.28"
              />
            );
          })}
          <ellipse cx="0" cy="22" rx="46" ry="14" fill="#3fae5c" stroke="#1d5a2e" strokeWidth="2" />
          <ellipse cx="0" cy="22" rx="16" ry="6" fill="#d6a640" stroke="#6b4c12" strokeWidth="2" />
          <ellipse cx="0" cy="23" rx="12.5" ry="4.4" fill="#120f08" />
          <Ball x={0} y={12} r={10} color="#fff8dc" />
          <path d="M0 -6V-20M-8 -4L-16 -14M8 -4L16 -14" stroke="#fff3b0" strokeWidth="2.6" strokeLinecap="round" />
          <text x="0" y="-26" textAnchor="middle" fontSize="22" fontWeight="900" fill="#f2c94c" stroke="#6b4c12" strokeWidth="1.4">
            1
          </text>
          {[
            [-34, -30],
            [36, -24],
            [-42, 2],
            [40, 0],
          ].map(([x, y], i) => (
            <path
              key={i}
              d={`M${x} ${y! - 6}L${x! + 1.8} ${y! - 1.8}L${x! + 6} ${y}L${x! + 1.8} ${y! + 1.8}L${x} ${y! + 6}L${x! - 1.8} ${y! + 1.8}L${x! - 6} ${y}L${x! - 1.8} ${y! - 1.8}Z`}
              fill="#fff3b0"
            />
          ))}
        </g>
      )}
    </svg>
  );
}
