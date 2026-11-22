import { useId } from "react";
import type { CardArt } from "../../shared/cards.ts";
import "./bowlingCard.css";

type Subject = Extract<CardArt, { kind: "bowling" }>["subject"];

/** Une quille : sa silhouette laquée, ses deux bandes rouges ; posée sur sa base en (x, y) */
function Pin({ x, y, s = 1, r = 0, gold = false }: { x: number; y: number; s?: number; r?: number; gold?: boolean }) {
  const body = gold ? "#f2c94c" : "#fbf8f0";
  const edge = gold ? "#8a6414" : "#b7ad98";
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path
        d="M0 -38C5 -38 6.5 -33 5.2 -27.5C4 -23 11 -17 11 -6C11 4 7 9 5.2 14H-5.2C-7 9 -11 4 -11 -6C-11 -17 -4 -23 -5.2 -27.5C-6.5 -33 -5 -38 0 -38Z"
        fill={body}
        stroke={edge}
        strokeWidth="1.2"
      />
      <path d="M-4.8 -26.5H4.8M-5.4 -23.5H5.4" stroke={gold ? "#7d1414" : "#d42a2a"} strokeWidth="1.8" />
      <path
        d="M-3.5 -34C-4.2 -30 -3 -27 -3.2 -25M-7 -10C-7.5 -4 -6 2 -4.5 8"
        stroke="#fff"
        strokeWidth="1.6"
        opacity="0.75"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

/** Une boule : sa couleur, des volutes, ses trois trous, son reflet */
function Ball({ x, y, r, color = "#1d3c8f", swirl = "#7fd3ff" }: { x: number; y: number; r: number; color?: string; swirl?: string }) {
  const clip = useId();
  return (
    <g>
      <clipPath id={clip}>
        <circle cx={x} cy={y} r={r} />
      </clipPath>
      <circle cx={x} cy={y} r={r} fill={color} />
      <g clipPath={`url(#${clip})`} opacity="0.55" fill="none" stroke={swirl} strokeLinecap="round">
        <path
          d={`M${x - r} ${y - r * 0.2}C${x - r * 0.3} ${y - r * 0.8} ${x + r * 0.2} ${y + r * 0.4} ${x + r} ${y - r * 0.3}`}
          strokeWidth={r * 0.12}
        />
        <path
          d={`M${x - r} ${y + r * 0.45}C${x - r * 0.2} ${y + r * 0.1} ${x + r * 0.3} ${y + r * 0.9} ${x + r} ${y + r * 0.35}`}
          strokeWidth={r * 0.08}
        />
      </g>
      <circle cx={x} cy={y} r={r} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={r * 0.07} />
      <circle cx={x + r * 0.28} cy={y - r * 0.05} r={r * 0.12} fill="#0b0b10" />
      <circle cx={x + r * 0.5} cy={y - r * 0.32} r={r * 0.09} fill="#0b0b10" />
      <circle cx={x + r * 0.12} cy={y - r * 0.38} r={r * 0.09} fill="#0b0b10" />
      <ellipse
        cx={x - r * 0.38}
        cy={y - r * 0.45}
        rx={r * 0.3}
        ry={r * 0.17}
        fill="#fff"
        opacity="0.8"
        transform={`rotate(-35 ${x - r * 0.38} ${y - r * 0.45})`}
      />
    </g>
  );
}

/** Le bois de la piste, en perspective, sous le dessin */
const Lane = ({ y = 20 }: { y?: number }) => (
  <g>
    <path d={`M-60 60L-22 ${y}H22L60 60Z`} fill="#d9a865" />
    {[-15, -7, 0, 7, 15].map((x) => (
      <path key={x} d={`M${x * 2.6} 60L${x} ${y}`} stroke="#b07a3e" strokeWidth="0.7" opacity="0.6" />
    ))}
  </g>
);

const Shadow = ({ y = 38, rx = 30 }: { y?: number; rx?: number }) => <ellipse cx="0" cy={y} rx={rx} ry={rx * 0.18} fill="rgba(0,0,0,.3)" />;

/** Les dessins des cartes de la famille « La Piste » : la quille, la boule, la salle, et les grands moments */
export function BowlingCardArt({ subject }: { subject: Subject }) {
  return (
    <svg className="tc-svg" viewBox="-60 -60 120 120" aria-hidden="true">
      {subject === "quille" && (
        <g>
          <Lane y={22} />
          <Shadow y={38} rx={22} />
          <Pin x={0} y={36} s={1.75} />
        </g>
      )}
      {subject === "boule" && (
        <g>
          <Lane y={26} />
          <Shadow y={40} rx={34} />
          <Ball x={0} y={2} r={36} color="#c8263a" swirl="#ffd9c2" />
        </g>
      )}
      {subject === "chaussures" && (
        <g>
          <Shadow y={34} rx={46} />
          {[-1, 1].map((k) => (
            <g key={k} transform={`translate(${k * 18 - 4} ${k * 6}) scale(${k < 0 ? 0.9 : 1})`}>
              {/* La semelle claire, le dessus bicolore, les lacets */}
              <path
                d="M-30 22C-32 16 -30 6 -22 4L-6 0C2 -2 8 -10 14 -10C22 -10 30 2 32 14C33 20 30 24 24 24H-24C-28 24 -30 24 -30 22Z"
                fill="#b3242f"
                stroke="#5a0f16"
                strokeWidth="1.6"
              />
              <path d="M-8 1C0 -2 6 -9 13 -9C20 -9 27 2 29 12L-4 13Z" fill="#f2ece0" />
              <path d="M-31 21H31" stroke="#f2ece0" strokeWidth="5" strokeLinecap="round" />
              {[0, 5, 10].map((d) => (
                <path
                  key={d}
                  d={`M${2 + d} ${-2 - d * 0.6}L${8 + d} ${3 - d * 0.4}`}
                  stroke="#2b2d3a"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              ))}
            </g>
          ))}
          <g transform="translate(-30 -30) rotate(-12)">
            <rect x="-11" y="-7" width="22" height="14" rx="3" fill="#ffd166" stroke="#7a5a10" strokeWidth="1.2" />
            <text x="0" y="4" textAnchor="middle" fontSize="10" fontWeight="800" fill="#3a2a08">
              43
            </text>
          </g>
        </g>
      )}
      {subject === "rigole" && (
        <g>
          <path d="M-60 60L-18 -6H6L-10 60Z" fill="#d9a865" />
          <path d="M-10 60L6 -6H18L22 60Z" fill="#26282e" />
          <path d="M-6 60L8 -6M18 60L14 -6" stroke="#4a4d56" strokeWidth="1.2" />
          <path d="M22 60L18 -6H24L60 60Z" fill="#e9dcc0" />
          <Ball x={8} y={30} r={14} color="#6b3cc9" swirl="#ffb8f2" />
          <path d="M-46 -40L-30 -30M-38 -48L-26 -34" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <text x="-28" y="-14" fontSize="13" fontWeight="800" fill="#fff" opacity="0.9" transform="rotate(-10 -28 -14)">
            –
          </text>
        </g>
      )}
      {subject === "feuille" && (
        <g>
          <g transform="rotate(-6)">
            <rect x="-46" y="-34" width="92" height="66" rx="4" fill="#fbf6e8" stroke="#a6966f" strokeWidth="1.5" />
            {[0, 1, 2, 3].map((f) => (
              <g key={f}>
                <rect x={-42 + f * 21} y={-26} width="21" height="26" fill="none" stroke="#7a6a48" strokeWidth="1" />
                <rect x={-31 + f * 21} y={-26} width="10" height="10" fill="none" stroke="#7a6a48" strokeWidth="1" />
              </g>
            ))}
            <text x="-26" y="-18" fontSize="8" fontWeight="800" fill="#c8263a">
              X
            </text>
            <text x="-15" y="-18" fontSize="8" fontWeight="800" fill="#2a2a2a">
              7
            </text>
            <text x="-5" y="-18" fontSize="8" fontWeight="800" fill="#1d3c8f">
              /
            </text>
            <text x="6" y="-18" fontSize="8" fontWeight="800" fill="#2a2a2a">
              9
            </text>
            <text x="16" y="-18" fontSize="8" fontWeight="800" fill="#2a2a2a">
              –
            </text>
            <text x="-38" y="-4" fontSize="7" fill="#2a2a2a">
              20
            </text>
            <text x="-17" y="-4" fontSize="7" fill="#2a2a2a">
              39
            </text>
            <text x="4" y="-4" fontSize="7" fill="#2a2a2a">
              48
            </text>
            <path d="M-40 14H40M-40 22H24" stroke="#c9bb98" strokeWidth="1.2" />
          </g>
          {/* Le crayon */}
          <g transform="translate(18 24) rotate(-38)">
            <rect x="-30" y="-3.5" width="48" height="7" rx="1" fill="#f2c12e" stroke="#8a6414" strokeWidth="1" />
            <path d="M18 -3.5L28 0L18 3.5Z" fill="#e8cfa0" />
            <path d="M25 -1L28 0L25 1Z" fill="#2a2a2a" />
            <rect x="-34" y="-3.5" width="5" height="7" fill="#e0707a" />
          </g>
        </g>
      )}
      {subject === "retour" && (
        <g>
          <Shadow y={42} rx={50} />
          <path d="M-50 40V8C-50 -8 -38 -14 -22 -14H22C38 -14 50 -8 50 8V40Z" fill="#8a1f2c" stroke="#4a0d14" strokeWidth="2" />
          <path d="M-52 -6H52" stroke="#d8dde3" strokeWidth="4" strokeLinecap="round" />
          <path d="M-44 6C-40 -2 -30 -6 -20 -6H20C30 -6 40 -2 44 6" stroke="#c0485a" strokeWidth="2" fill="none" opacity="0.7" />
          <Ball x={-26} y={-20} r={12} color="#ee7a1e" swirl="#fff0c8" />
          <Ball x={0} y={-22} r={12} color="#1fb5b0" swirl="#fff6d6" />
          <Ball x={26} y={-20} r={12} color="#6b3cc9" swirl="#ffb8f2" />
        </g>
      )}
      {subject === "jukebox" && (
        <g>
          <Shadow y={46} rx={34} />
          <path d="M-30 44V-10C-30 -34 -16 -48 0 -48C16 -48 30 -34 30 -10V44Z" fill="#6b3a1e" stroke="#2e170a" strokeWidth="2" />
          <path
            d="M-24 -10C-24 -30 -12 -42 0 -42C12 -42 24 -30 24 -10"
            stroke="#ffb347"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M-24 -10C-24 -30 -12 -42 0 -42C12 -42 24 -30 24 -10"
            stroke="#fff3c8"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          {["#ff4fa3", "#37e0d0", "#ffd166"].map((c, i) => (
            <rect key={c} x={-16 + i * 12} y="-6" width="6" height="40" rx="3" fill={c} opacity="0.95" />
          ))}
          <rect x="-20" y="-28" width="40" height="16" rx="3" fill="#3a1a10" />
          <circle cx="0" cy="-20" r="6" fill="#1b1b1b" stroke="#c49a5a" strokeWidth="1.2" />
          <circle cx="0" cy="-20" r="1.5" fill="#c49a5a" />
          {[
            [-44, -26],
            [42, -14],
            [-40, 14],
          ].map(([x, y], i) => (
            <text key={i} x={x} y={y} fontSize="12" fill="#ffd166" opacity="0.85">
              ♪
            </text>
          ))}
        </g>
      )}
      {subject === "split" && (
        <g>
          <Lane y={-4} />
          <Shadow y={30} rx={10} />
          <Pin x={-36} y={28} s={1.05} />
          <Pin x={36} y={28} s={1.05} />
          <path d="M-26 20H26" stroke="#fff" strokeWidth="1.4" strokeDasharray="3 4" opacity="0.75" />
          <text x="0" y="-26" textAnchor="middle" fontSize="18" fontWeight="900" fill="#ff6f9c" stroke="#2a0815" strokeWidth="0.8">
            7 – 10
          </text>
          <Ball x={0} y={48} r={10} color="#1f7a4a" swirl="#d8ff9c" />
        </g>
      )}
      {subject === "machine" && (
        <g>
          <rect x="-56" y="-56" width="112" height="30" fill="#14151a" />
          <rect x="-52" y="-30" width="104" height="6" fill="#2c2d33" />
          {[-30, -10, 10, 30].map((x, i) => (
            <g key={x}>
              <path d={`M${x} -24V${-8 + (i % 2) * 6}`} stroke="#555a63" strokeWidth="1.2" />
              <Pin x={x} y={14 + (i % 2) * 6} s={0.6} />
            </g>
          ))}
          <Lane y={24} />
          <rect x="-54" y="30" width="108" height="5" rx="2" fill="#2c2d33" />
          <path d="M-54 30L-50 44H50L54 30" fill="#1b1c20" opacity="0.85" />
          <path d="M-40 52H40" stroke="#ffd166" strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
        </g>
      )}
      {subject === "dinde" && (
        <g>
          <Shadow y={46} rx={30} />
          {/* La queue en éventail : cinq quilles */}
          {[-56, -28, 0, 28, 56].map((a) => (
            <g key={a} transform={`rotate(${a} 0 10)`}>
              <Pin x={0} y={-8} s={0.9} />
            </g>
          ))}
          {/* Le corps rond, la tête, le bec, la caroncule */}
          <ellipse cx="0" cy="22" rx="22" ry="20" fill="#8a5a2b" stroke="#4a2c10" strokeWidth="1.8" />
          <ellipse cx="0" cy="26" rx="14" ry="12" fill="#a8743c" />
          <circle cx="0" cy="2" r="9" fill="#9a6532" stroke="#4a2c10" strokeWidth="1.5" />
          <circle cx="-3" cy="0" r="1.6" fill="#111" />
          <circle cx="3" cy="0" r="1.6" fill="#111" />
          <path d="M-2.5 4L2.5 4L0 8Z" fill="#f2b630" />
          <path d="M1 6C3 9 2 12 0 13" stroke="#d9262c" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <text x="0" y="56" textAnchor="middle" fontSize="12" fontWeight="900" fill="#ffd166" stroke="#3a1a08" strokeWidth="0.6">
            X X X
          </text>
        </g>
      )}
      {subject === "parfaite" && (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
            return (
              <text
                key={i}
                x={Math.cos(a) * 44}
                y={Math.sin(a) * 44 + 4}
                textAnchor="middle"
                fontSize="10"
                fontWeight="900"
                fill="#ffd166"
                stroke="#5a3a08"
                strokeWidth="0.5"
              >
                X
              </text>
            );
          })}
          <circle cx="0" cy="0" r="30" fill="#2a1430" stroke="#f2c94c" strokeWidth="2.5" />
          <text x="0" y="12" textAnchor="middle" fontSize="30" fontWeight="900" fill="#f2c94c" stroke="#6b4a0a" strokeWidth="0.8">
            300
          </text>
          <Pin x={-16} y={-8} s={0.42} r={-18} gold />
          <Pin x={16} y={-8} s={0.42} r={18} gold />
          {[
            [-50, -48],
            [48, -40],
            [-46, 48],
            [50, 46],
          ].map(([x, y], i) => (
            <path
              key={i}
              d={`M${x} ${y! - 5}L${x! + 1.5} ${y! - 1.5}L${x! + 5} ${y}L${x! + 1.5} ${y! + 1.5}L${x} ${y! + 5}L${x! - 1.5} ${y! + 1.5}L${x! - 5} ${y}L${x! - 1.5} ${y! - 1.5}Z`}
              fill="#fff6c8"
            />
          ))}
        </g>
      )}
    </svg>
  );
}
