// Les cartes de la famille « La Récré » (La Cour des Grands) : le grand Tournesol, le sablé gravé, la corde au-dessus de
// la mousse, la bille de verre, le nénuphar, la chaise musicale, la marelle, Carillon, l'épervier, le polochon et la
// Cloche d'or. Des dessins simples et francs, au soleil d'été.

import type { CardArt } from "../../shared/cards.ts";
import "./courCard.css";

type Subject = Extract<CardArt, { kind: "cour" }>["subject"];

const Shadow = ({ y = 40, rx = 30 }: { y?: number; rx?: number }) => (
  <ellipse cx="0" cy={y} rx={rx} ry={rx * 0.18} fill="rgba(0,0,0,.22)" />
);

function Petals({ r = 26, n = 16, color = "#ffd23f", dark = "#f6b21a" }: { r?: number; n?: number; color?: string; dark?: string }) {
  return (
    <g>
      {Array.from({ length: n }, (_, k) => (
        <ellipse key={k} cx="0" cy={-r} rx={r * 0.22} ry={r * 0.5} fill={k % 2 ? color : dark} transform={`rotate(${(k * 360) / n})`} />
      ))}
    </g>
  );
}

export function CourCardArt({ subject }: { subject: Subject }) {
  return (
    <svg className="tc-svg" viewBox="-60 -60 120 120" aria-hidden="true">
      {subject === "tournesol" && (
        <g>
          <path d="M0 58C2 40 -3 26 0 8" stroke="#4f9a3a" strokeWidth="5" fill="none" />
          <path d="M1 36C12 28 24 30 28 38C18 42 9 41 1 36Z" fill="#5aa845" />
          <path d="M-1 26C-12 18 -24 20 -27 28C-17 32 -9 31 -1 26Z" fill="#5aa845" />
          <g transform="translate(0 -14)">
            <Petals r={28} n={18} />
            <circle r="19" fill="#5a3417" />
            {Array.from({ length: 40 }, (_, k) => {
              const a = k * 2.4;
              const d = Math.sqrt(k / 40) * 16;
              return <circle key={k} cx={Math.cos(a) * d} cy={Math.sin(a) * d} r="1.2" fill="#8a5a2b" />;
            })}
            <ellipse cx="-6" cy="-3" rx="4" ry="5" fill="#fffdf4" />
            <ellipse cx="6" cy="-3" rx="4" ry="5" fill="#fffdf4" />
            <circle cx="-5.5" cy="-2" r="2.2" fill="#1d140c" />
            <circle cx="6.5" cy="-2" r="2.2" fill="#1d140c" />
            <path d="M-6 6Q0 11 6 6" stroke="#1d140c" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </g>
        </g>
      )}
      {subject === "sable" && (
        <g>
          <Shadow y={30} rx={36} />
          <g transform="scale(1 0.62) translate(0 6)">
            {Array.from({ length: 24 }, (_, k) => (
              <circle key={k} cx={Math.cos((k / 24) * 6.283) * 38} cy={Math.sin((k / 24) * 6.283) * 38} r="6" fill="#c98a3e" />
            ))}
            <circle r="39" fill="#e2a35a" />
            <circle r="34" fill="#efbd76" />
            <path
              d="M0 -20C6 -12 18 -10 18 2C18 12 8 18 0 24C-8 18 -18 12 -18 2C-18 -10 -6 -12 0 -20Z"
              fill="none"
              stroke="#7a4214"
              strokeWidth="2.4"
            />
            <path d="M14 -24L30 -32" stroke="#d8dde2" strokeWidth="2" />
            <circle cx="30" cy="-32" r="2.6" fill="#d9344d" />
          </g>
        </g>
      )}
      {subject === "corde" && (
        <g>
          <rect x="-56" y="20" width="112" height="30" rx="4" fill="#3fa6d9" />
          {Array.from({ length: 20 }, (_, k) => (
            <circle key={k} cx={-50 + (k % 10) * 11} cy={24 + Math.floor(k / 10) * 6} r="6" fill="#fbfdff" />
          ))}
          <path d="M-60 -6Q0 4 60 -6" stroke="#d8b77a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M-60 -6Q0 4 60 -6" stroke="#b8945a" strokeWidth="1" strokeDasharray="3 3" fill="none" />
          <rect x="-3" y="-4" width="6" height="16" fill="#e0303e" />
        </g>
      )}
      {subject === "bille" && (
        <g>
          <Shadow y={34} rx={26} />
          <circle r="30" fill="#2f6fd1" opacity="0.85" />
          <path d="M-22 -8C-8 -22 10 -4 24 -14C18 6 -2 2 -20 14Z" fill="#ffd23f" opacity="0.9" />
          <circle r="30" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2" />
          <ellipse cx="-11" cy="-14" rx="9" ry="5" fill="#fff" opacity="0.8" transform="rotate(-30 -11 -14)" />
        </g>
      )}
      {subject === "nenuphar" && (
        <g>
          <rect x="-60" y="-60" width="120" height="120" fill="#1e5a52" opacity="0.35" />
          <path d="M0 0L40 -6A40 40 0 1 1 34 -22Z" fill="#3f8f3a" transform="translate(-4 8)" />
          <path d="M0 0L40 -6A40 40 0 1 1 34 -22Z" fill="none" stroke="#2c6a28" strokeWidth="1.5" transform="translate(-4 8)" />
          <g transform="translate(14 -24) rotate(-20)">
            <rect x="-2" y="-12" width="4" height="24" rx="2" fill="#2fa6d9" />
            <ellipse cx="-9" cy="-4" rx="9" ry="3" fill="#e8f8ff" opacity="0.8" />
            <ellipse cx="9" cy="-4" rx="9" ry="3" fill="#e8f8ff" opacity="0.8" />
          </g>
        </g>
      )}
      {subject === "chaise" && (
        <g>
          <Shadow y={46} rx={26} />
          <rect x="-18" y="-40" width="5" height="84" fill="#8a5a2e" />
          <rect x="13" y="-40" width="5" height="84" fill="#8a5a2e" />
          <rect x="-20" y="-42" width="40" height="12" rx="3" fill="#d9344d" />
          <path d="M-22 4H22L26 14H-26Z" fill="#d9344d" />
          <rect x="-24" y="14" width="5" height="32" fill="#8a5a2e" />
          <rect x="19" y="14" width="5" height="32" fill="#8a5a2e" />
          <text x="34" y="-20" fontSize="18" fill="#2f6fd1">
            ♪
          </text>
          <text x="-44" y="-4" fontSize="14" fill="#2f6fd1">
            ♫
          </text>
        </g>
      )}
      {subject === "marelle" && (
        <g transform="translate(0 4)">
          <rect x="-60" y="-60" width="120" height="120" fill="#5a5d66" />
          {[
            [0, 44, "1"],
            [0, 26, "2"],
            [0, 8, "3"],
            [-10, -10, "4"],
            [10, -10, "5"],
            [0, -28, "6"],
          ].map(([x, y, n]) => (
            <g key={String(n)}>
              <rect x={Number(x) - 9} y={Number(y) - 8} width="18" height="16" fill="none" stroke="#fff" strokeWidth="1.6" />
              <text x={Number(x)} y={Number(y) + 4} fontSize="10" textAnchor="middle" fill="#fff" fontWeight="800">
                {n}
              </text>
            </g>
          ))}
          <path d="M-12 -38A12 10 0 0 1 12 -38Z" fill="none" stroke="#fff" strokeWidth="1.6" />
          <rect x="1" y="-18" width="18" height="16" fill="#ffd43b" opacity="0.6" />
        </g>
      )}
      {subject === "carillon" && (
        <g>
          <path d="M-26 22C-26 -8 -18 -30 0 -30C18 -30 26 -8 26 22Z" fill="#e9b43b" />
          <path d="M-30 22H30" stroke="#7a5512" strokeWidth="4" strokeLinecap="round" />
          <circle cx="0" cy="28" r="5" fill="#7a5512" />
          <ellipse cx="-8" cy="-8" rx="5" ry="6.5" fill="#fffdf6" />
          <ellipse cx="8" cy="-8" rx="5" ry="6.5" fill="#fffdf6" />
          <circle cx="-7" cy="-7" r="2.6" fill="#16120c" />
          <circle cx="9" cy="-7" r="2.6" fill="#16120c" />
          <path d="M-6 4Q0 9 6 4" stroke="#16120c" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M-8 -32L0 -30L8 -32L0 -36Z" fill="#d9344d" />
          <path d="M0 -36V-44" stroke="#7a5512" strokeWidth="2" />
          <path d="M-18 -46H18" stroke="#d9344d" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {subject === "epervier" && (
        <g>
          <Shadow y={46} rx={24} />
          <ellipse cx="0" cy="10" rx="22" ry="26" fill="#8a5a2e" />
          <ellipse cx="0" cy="14" rx="14" ry="18" fill="#f4e7c8" />
          <circle cx="0" cy="-22" r="16" fill="#9c6a38" />
          <circle cx="-6" cy="-24" r="4.5" fill="#fff" />
          <circle cx="6" cy="-24" r="4.5" fill="#fff" />
          <circle cx="-5.5" cy="-23.5" r="2" fill="#16120c" />
          <circle cx="6.5" cy="-23.5" r="2" fill="#16120c" />
          <path d="M-4 -16L4 -16L0 -9Z" fill="#f2a23a" />
          <path d="M-20 4C-40 -6 -48 10 -44 18C-34 14 -26 14 -20 16Z" fill="#7a4b26" />
          <path d="M20 4C40 -6 48 10 44 18C34 14 26 14 20 16Z" fill="#7a4b26" />
          <path d="M-4 -38L0 -48L4 -38Z" fill="#d9344d" />
        </g>
      )}
      {subject === "polochon" && (
        <g>
          <rect x="-60" y="26" width="120" height="34" fill="#3fa6d9" />
          {Array.from({ length: 12 }, (_, k) => (
            <circle key={k} cx={-55 + k * 10} cy="30" r="6" fill="#fbfdff" />
          ))}
          <rect x="-58" y="14" width="116" height="7" fill="#b77b42" />
          <g transform="rotate(-24)">
            <rect x="-32" y="-14" width="64" height="24" rx="12" fill="#fff" />
            {[-20, -8, 4, 16].map((x) => (
              <rect key={x} x={x} y="-14" width="6" height="24" fill="#5aa0e0" />
            ))}
          </g>
        </g>
      )}
      {subject === "cloche" && (
        <g>
          {Array.from({ length: 12 }, (_, k) => (
            <path key={k} d="M0 -6L3 -54L-3 -54Z" fill="#fff1b8" opacity="0.35" transform={`rotate(${k * 30})`} />
          ))}
          <path d="M-24 20C-24 -10 -16 -28 0 -28C16 -28 24 -10 24 20Z" fill="#f2c94c" />
          <path d="M-16 16C-16 -6 -10 -20 -2 -22" stroke="#fff6cf" strokeWidth="3" fill="none" opacity="0.8" />
          <path d="M-28 20H28" stroke="#b8891a" strokeWidth="4" strokeLinecap="round" />
          <circle cx="0" cy="27" r="5" fill="#b8891a" />
          <circle cx="0" cy="-32" r="5" fill="none" stroke="#f2c94c" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}
