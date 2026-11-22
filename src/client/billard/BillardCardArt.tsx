import { useId } from "react";
import type { CardArt } from "../../shared/cards.ts";
import "./billardCard.css";

type Subject = Extract<CardArt, { kind: "billard" }>["subject"];

const COLORS: Record<number, string> = {
  1: "#f2c21b",
  2: "#1f4fbf",
  3: "#d42a24",
  4: "#5b2a8c",
  5: "#f07a1a",
  6: "#1b8a4a",
  7: "#7a2418",
  8: "#141414",
};

/** Une bille : sa couleur (ou blanche à bandeau pour les rayées), son numéro dans un rond, son reflet */
function Ball({ x, y, r, n }: { x: number; y: number; r: number; n: number }) {
  const clip = useId();
  const stripe = n > 8;
  const color = n === 0 ? "#f6f2e6" : (COLORS[stripe ? n - 8 : n] ?? "#888");
  return (
    <g>
      <clipPath id={clip}>
        <circle cx={x} cy={y} r={r} />
      </clipPath>
      <circle cx={x} cy={y} r={r} fill={stripe ? "#f6f2e6" : color} />
      {stripe && <rect x={x - r} y={y - r * 0.48} width={r * 2} height={r * 0.96} fill={color} clipPath={`url(#${clip})`} />}
      {n > 0 && (
        <>
          <circle cx={x + r * 0.08} cy={y + r * 0.05} r={r * 0.42} fill="#f6f2e6" />
          <text x={x + r * 0.08} y={y + r * 0.2} textAnchor="middle" fontSize={r * (n > 9 ? 0.46 : 0.55)} fontWeight="800" fill="#16161a">
            {n}
          </text>
        </>
      )}
      {n === 0 && <circle cx={x - r * 0.25} cy={y + r * 0.2} r={r * 0.09} fill="#c8262a" />}
      {/* L'ombre propre et le reflet de la lampe */}
      <circle cx={x} cy={y} r={r} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth={r * 0.14} clipPath={`url(#${clip})`} />
      <ellipse
        cx={x - r * 0.35}
        cy={y - r * 0.45}
        rx={r * 0.3}
        ry={r * 0.16}
        fill="#fff"
        opacity="0.85"
        transform={`rotate(-30 ${x - r * 0.35} ${y - r * 0.45})`}
      />
    </g>
  );
}

/** Le feutre vert en perspective, et la bande de bois au fond */
const Felt = ({ y = 6 }: { y?: number }) => (
  <g>
    <path d={`M-60 60L-40 ${y}H40L60 60Z`} fill="#1f7a4c" />
    <path d={`M-42 ${y - 5}H42L40 ${y}H-40Z`} fill="#6a2a14" />
    <path d={`M-40 ${y}H40`} stroke="#0f4a2c" strokeWidth="1.5" />
  </g>
);

const Shadow = ({ x = 0, y = 38, rx = 30 }: { x?: number; y?: number; rx?: number }) => (
  <ellipse cx={x} cy={y} rx={rx} ry={rx * 0.22} fill="rgba(0,0,0,.35)" />
);

/** Les dessins des cartes de la famille « La Bande » : la queue, la craie, les billes, et les grands coups */
export function BillardCardArt({ subject }: { subject: Subject }) {
  return (
    <svg className="tc-svg" viewBox="-60 -60 120 120" aria-hidden="true">
      {subject === "queue" && (
        <g transform="rotate(-38)">
          {/* La butée, la poignée, l'avant-talon et ses pointes, le joint, le fût, la virole, le procédé */}
          <rect x="-58" y="-4.6" width="6" height="9.2" rx="2" fill="#111" />
          <rect x="-52" y="-4.4" width="26" height="8.8" fill="#2c2c30" />
          {[-50, -45, -40, -35, -30].map((x) => (
            <path key={x} d={`M${x} -4.4V4.4`} stroke="#45454c" strokeWidth="1.4" />
          ))}
          <path d="M-26 -4.2H4V4.2H-26Z" fill="#7a4a26" />
          <path d="M-24 -4.2L-6 0L-24 4.2Z" fill="#2a1a10" />
          <path d="M4 -3.6H6V3.6H4Z" fill="#e8dcc0" />
          <path d="M6 -3.4L52 -2.2V2.2L6 3.4Z" fill="#e8cc9a" />
          <path d="M52 -2.2H56V2.2H52Z" fill="#f4f0e6" />
          <path d="M56 -2.1H59V2.1H56Z" fill="#3a6fb8" />
          <path d="M8 -2.8L50 -1.8" stroke="#fff" strokeWidth="0.9" opacity="0.6" />
        </g>
      )}
      {subject === "craie" && (
        <g>
          <Shadow y={34} rx={30} />
          {/* Le cube de craie bleue, creusé sur le dessus */}
          <path d="M-22 -4L4 -14L26 -4L0 6Z" fill="#5a8ad8" />
          <path d="M-22 -4L0 6V32L-22 22Z" fill="#2f5aa8" />
          <path d="M0 6L26 -4V22L0 32Z" fill="#3e6cc0" />
          <ellipse cx="2" cy="-4" rx="11" ry="5" fill="#1e3a78" />
          <ellipse cx="2" cy="-5" rx="8" ry="3.4" fill="#2a4a90" />
          {/* La pointe de la queue qui vient s'y frotter, la poussière */}
          <g transform="rotate(-62 2 -8)">
            <path d="M2 -10H60V-2H2Z" fill="#e8cc9a" />
            <path d="M-2 -10H2V-2H-2Z" fill="#3a6fb8" />
          </g>
          {[
            [-14, -24, 2.4],
            [-22, -14, 1.6],
            [20, -22, 2],
            [28, -12, 1.4],
            [10, -30, 1.6],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#8ab0f0" opacity="0.7" />
          ))}
        </g>
      )}
      {subject === "triangle" && (
        <g>
          <Felt y={-28} />
          <path d="M0 -40L44 38H-44Z" fill="none" stroke="#5a2a10" strokeWidth="7" strokeLinejoin="round" />
          <path d="M0 -40L44 38H-44Z" fill="none" stroke="#b8742e" strokeWidth="3" strokeLinejoin="round" />
          {[[1], [9, 2], [3, 8, 10], [11, 4, 14, 5], [6, 15, 7, 12, 13]].map((row, k) =>
            row.map((n, j) => <Ball key={n} x={(j - (row.length - 1) / 2) * 15} y={-24 + k * 13} r={7.2} n={n} />),
          )}
        </g>
      )}
      {subject === "blanche" && (
        <g>
          <Felt y={-6} />
          <Shadow y={42} rx={30} />
          <Ball x={0} y={10} r={32} n={0} />
        </g>
      )}
      {subject === "poche" && (
        <g>
          <path d="M-60 60L-60 -10L10 -60H60V60Z" fill="#1f7a4c" />
          {/* Le coin de bois, le cuir de la poche, le trou */}
          <path d="M-60 -10L10 -60H60V-36L-2 -14L-60 22Z" fill="#6a2a14" />
          <circle cx="22" cy="-22" r="22" fill="#2a140c" />
          <circle cx="22" cy="-22" r="16" fill="#050505" />
          <path d="M0 -22A22 22 0 0 1 44 -22" fill="none" stroke="#b8913c" strokeWidth="3" />
          <Ball x={14} y={-12} r={11} n={3} />
          <path d="M-22 26L-4 6M-30 18L-12 -2" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
        </g>
      )}
      {subject === "lampe" && (
        <g>
          <path d="M-36 -44V-50M36 -44V-50" stroke="#b8913c" strokeWidth="2" />
          <rect x="-48" y="-46" width="96" height="4" rx="2" fill="#b8913c" />
          {[-34, 0, 34].map((x) => (
            <g key={x}>
              <path d={`M${x - 15} -24Q${x} -48 ${x + 15} -24Z`} fill="#0f5a32" />
              <path d={`M${x - 15} -24H${x + 15}`} stroke="#ffe6b0" strokeWidth="2" />
              <path d={`M${x - 15} -24L${x - 26} 44H${x + 26}L${x + 15} -24Z`} fill="#fff2c8" opacity="0.13" />
            </g>
          ))}
          <path d="M-60 60L-48 30H48L60 60Z" fill="#1f7a4c" />
          <Ball x={-14} y={40} r={6} n={8} />
          <Ball x={10} y={44} r={6} n={0} />
        </g>
      )}
      {subject === "rateau" && (
        <g>
          <Felt y={-12} />
          {/* Le râteau : une tête de laiton à encoches sur un long manche */}
          <path d="M-58 52L8 -6" stroke="#7a4a26" strokeWidth="5" strokeLinecap="round" />
          <path d="M-6 -14L18 6L22 -4L14 -10L18 -20L10 -22L4 -16L-2 -24Z" fill="#c8a040" stroke="#6a4a10" strokeWidth="1.2" />
          <g transform="rotate(-12)">
            <path d="M-40 -8L40 -14" stroke="#e8cc9a" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M40 -14L44 -14.3" stroke="#3a6fb8" strokeWidth="3.4" strokeLinecap="round" />
          </g>
          <Ball x={36} y={12} r={9} n={0} />
        </g>
      )}
      {subject === "noire" && (
        <g>
          <Felt y={-6} />
          <Shadow y={42} rx={32} />
          <Ball x={0} y={8} r={34} n={8} />
        </g>
      )}
      {subject === "neuf" && (
        <g>
          <Felt y={-6} />
          <Shadow y={42} rx={32} />
          <Ball x={0} y={8} r={34} n={9} />
        </g>
      )}
      {subject === "bandes" && (
        <g>
          {/* Une table vue de dessus : la blanche touche trois bandes avant la rouge */}
          <rect x="-54" y="-36" width="108" height="72" rx="6" fill="#6a2a14" />
          <rect x="-46" y="-28" width="92" height="56" fill="#1f5f9e" />
          <path d="M-30 18L46 -6L22 -28L-46 6L10 20" fill="none" stroke="#fff" strokeWidth="1.6" strokeDasharray="3 3" />
          <circle cx="-30" cy="18" r="5" fill="#f6f2e6" />
          <circle cx="-8" cy="-14" r="5" fill="#f3c534" />
          <circle cx="15" cy="21" r="5" fill="#c8262a" />
          {[
            [46, -6],
            [22, -28],
            [-46, 6],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="4" fill="none" stroke="#ffd166" strokeWidth="1.6" />
              <text x={x} y={y! + (y! < 0 ? -7 : 12)} textAnchor="middle" fontSize="8" fontWeight="900" fill="#ffd166">
                {i + 1}
              </text>
            </g>
          ))}
        </g>
      )}
      {subject === "casse" && (
        <g>
          <Felt y={-30} />
          {/* La casse : les billes jaillissent du triangle dans toutes les directions */}
          {[
            [-36, -6, 1],
            [30, -12, 12],
            [-14, 24, 5],
            [40, 22, 3],
            [-42, 36, 14],
            [10, 44, 6],
            [-2, -20, 9],
            [24, 8, 2],
            [-26, 8, 11],
          ].map(([x, y, n]) => (
            <g key={n}>
              <path
                d={`M${x! * 0.25} ${y! * 0.25 - 6}L${x! * 0.85} ${y! * 0.85}`}
                stroke="#fff"
                strokeWidth="1.4"
                opacity="0.4"
                strokeLinecap="round"
              />
              <Ball x={x!} y={y!} r={7} n={n!} />
            </g>
          ))}
          <Ball x={0} y={2} r={8} n={8} />
          {[
            [-50, -48],
            [48, -44],
            [-48, 50],
            [50, 48],
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
