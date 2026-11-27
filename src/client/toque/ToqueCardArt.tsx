// Les cartes de la famille « La Brigade » (Toque !) : la marmite qui fume, la planche et sa tomate, la pile d'assiettes,
// le bon de commande, la poêle et son steak, l'extincteur, la crêpe qui saute, la roulotte de Mémé, le passe et sa
// clochette, Mémé Jeanne elle-même et la Toque dorée. Des dessins simples et francs, à la lumière chaude des fourneaux.

import type { CardArt } from "../../shared/cards.ts";
import "./toqueCard.css";

type Subject = Extract<CardArt, { kind: "toque" }>["subject"];

const Shadow = ({ y = 40, rx = 30 }: { y?: number; rx?: number }) => (
  <ellipse cx="0" cy={y} rx={rx} ry={rx * 0.18} fill="rgba(0,0,0,.25)" />
);

/** Trois volutes de vapeur */
function Steam({ x = 0, y = -30, s = 1 }: { x?: number; y?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke="#fffaf0" strokeWidth="3.2" fill="none" strokeLinecap="round" opacity="0.85">
      <path d="M-10 0c-5-6 5-9 0-16s4-10 0-15" />
      <path d="M0 2c-5-6 5-9 0-17s4-11 0-16" />
      <path d="M10 0c-5-6 5-9 0-16s4-10 0-15" />
    </g>
  );
}

/** Une flamme de gazinière */
const Flame = ({ x = 0, y = 0, s = 1 }: { x?: number; y?: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 0c-6 0-8-6-5-11 1 4 3 4 3 1 0-5 4-8 4-12 3 5 7 9 7 14 0 5-4 8-9 8z" fill="#ff8a2a" />
    <path d="M1 0c-3 0-4-3-3-6 1 2 2 2 2 0 0-3 2-4 2-6 2 3 4 5 4 8 0 3-2 4-5 4z" fill="#ffd35a" />
  </g>
);

/** Une toque de chef, plissée */
function ChefHat({ fill = "#fbfaf5", line = "#b9b2a2" }: { fill?: string; line?: string }) {
  return (
    <g>
      <rect x="-14" y="-2" width="28" height="11" rx="2" fill={fill} stroke={line} strokeWidth="1.4" />
      <path d="M-14 0c-10-1-12-17-1-18 0-10 12-12 15-5 3-7 15-5 15 5 11 1 9 17-1 18z" fill={fill} stroke={line} strokeWidth="1.4" />
      <path d="M-6 -2v-10M0 -2v-13M6 -2v-10" stroke={line} strokeWidth="1.1" />
    </g>
  );
}

export function ToqueCardArt({ subject }: { subject: Subject }) {
  return (
    <svg className="tc-svg" viewBox="-60 -60 120 120" aria-hidden="true">
      {subject === "marmite" && (
        <g>
          <Shadow y={42} rx={38} />
          <Flame x={-14} y={40} s={1.1} />
          <Flame x={0} y={41} s={1.25} />
          <Flame x={14} y={40} s={1.1} />
          <path d="M-32 -6h64l-5 36c-1 6-5 9-11 9h-32c-6 0-10-3-11-9z" fill="#9aa3ad" stroke="#4a525c" strokeWidth="2" />
          <path d="M-30 6h60" stroke="#c4cbd3" strokeWidth="3" opacity="0.6" />
          <rect x="-36" y="-12" width="72" height="9" rx="4.5" fill="#c4cbd3" stroke="#4a525c" strokeWidth="2" />
          <path d="M-44 -2h9M35 -2h9" stroke="#4a525c" strokeWidth="5" strokeLinecap="round" />
          <ellipse cx="0" cy="-10" rx="30" ry="4" fill="#c8892f" />
          <circle cx="-10" cy="-11" r="3" fill="#f1d38b" />
          <circle cx="8" cy="-10" r="2.4" fill="#f1d38b" />
          <Steam y={-18} s={1.1} />
        </g>
      )}
      {subject === "planche" && (
        <g>
          <Shadow y={36} rx={44} />
          <g transform="rotate(-8)">
            <rect x="-44" y="-4" width="80" height="38" rx="6" fill="#c8924e" stroke="#7a4f24" strokeWidth="2" />
            <path d="M-38 6h66M-38 18h66" stroke="#a8743a" strokeWidth="1.4" opacity="0.6" />
            <circle cx="40" cy="15" r="4" fill="#7a4f24" />
          </g>
          {/* la tomate coupée en rondelles */}
          <circle cx="-14" cy="6" r="15" fill="#e2412f" stroke="#9a2216" strokeWidth="1.8" />
          <path d="M-18 -8c2-4 6-4 8 0" stroke="#3f8a3a" strokeWidth="3" fill="none" strokeLinecap="round" />
          {[8, 18, 28].map((x, i) => (
            <g key={x} transform={`translate(${x} ${12 - i * 2})`}>
              <ellipse rx="7" ry="11" fill="#f0573f" stroke="#9a2216" strokeWidth="1.4" />
              <ellipse rx="4.4" ry="8" fill="#f78d6e" />
              <circle cy="-3" r="1.1" fill="#f7e8a0" />
              <circle cy="3" r="1.1" fill="#f7e8a0" />
            </g>
          ))}
          {/* le couteau qui vient de couper */}
          <g transform="translate(-6 -22) rotate(28)">
            <path d="M0 0h40l-4 7H0z" fill="#e4e8ec" stroke="#6a727c" strokeWidth="1.4" />
            <rect x="-20" y="0" width="20" height="7" rx="2.5" fill="#2a2a30" />
          </g>
        </g>
      )}
      {subject === "assiettes" && (
        <g>
          <Shadow y={42} rx={36} />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <g key={k} transform={`translate(${(k % 2) * 2 - 1} ${36 - k * 9})`}>
              <ellipse rx="34" ry="9" fill="#e6e0d2" stroke="#9a9282" strokeWidth="1.4" />
              <ellipse cy="-2" rx="34" ry="8" fill="#fbfaf6" stroke="#b9b2a2" strokeWidth="1.2" />
            </g>
          ))}
          <ellipse cx="0" cy="-17" rx="22" ry="5" fill="none" stroke="#ded6c4" strokeWidth="1.4" />
          {/* les bulles de l'évier */}
          {[
            [-30, -30, 6],
            [-20, -40, 4],
            [26, -34, 5],
            [34, -24, 3.5],
            [18, -46, 3],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={r} fill="rgba(220,240,255,.35)" stroke="#e8f6ff" strokeWidth="1.2" />
              <circle cx={x! - r! * 0.35} cy={y! - r! * 0.35} r={r! * 0.25} fill="#fff" />
            </g>
          ))}
        </g>
      )}
      {subject === "bon" && (
        <g>
          <g transform="rotate(-6)">
            <path d="M-26 -44h52v80l-6-4-6 4-7-4-7 4-6-4-7 4-6-4-7 4z" fill="#fbf5e6" stroke="#b9ab8c" strokeWidth="1.6" />
            <rect x="-12" y="-50" width="24" height="9" rx="3" fill="#a9afb8" stroke="#5a6068" strokeWidth="1.4" />
            <text x="0" y="-27" textAnchor="middle" fontSize="9" fontWeight="700" fill="#2a1e14">
              TABLE 4
            </text>
            <path d="M-18 -20h36" stroke="#d8ccb4" strokeWidth="1.2" />
            {/* la soupe à l'oignon dessinée sur le bon */}
            <ellipse cx="0" cy="0" rx="16" ry="6" fill="#fff" stroke="#b9b2a2" strokeWidth="1.2" />
            <path d="M-12 -2h24l-3 10h-18z" fill="#e7e2d6" stroke="#9a9282" strokeWidth="1.2" />
            <ellipse cx="0" cy="-2" rx="12" ry="3" fill="#c8892f" />
            <path d="M-18 16h36M-18 22h24" stroke="#d8ccb4" strokeWidth="1.2" />
            {/* le temps qui file */}
            <rect x="-18" y="27" width="36" height="5" rx="2.5" fill="#e8dcc4" />
            <rect x="-18" y="27" width="9" height="5" rx="2.5" fill="#e0412f" />
          </g>
          <path d="M30 -30l6-6M34 -20h9M30 -10l7 5" stroke="#e0412f" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {subject === "poele" && (
        <g>
          <Shadow y={34} rx={40} />
          <Flame x={-10} y={34} />
          <Flame x={6} y={35} s={1.15} />
          <g transform="rotate(-10)">
            <path d="M24 6h34" stroke="#3a2a1e" strokeWidth="7" strokeLinecap="round" />
            <ellipse cx="-6" cy="8" rx="34" ry="12" fill="#2b2d33" />
            <ellipse cx="-6" cy="4" rx="31" ry="10" fill="#3d4049" />
            {/* le steak qui grésille */}
            <path d="M-26 2c2-8 14-10 22-8 10 2 14 6 12 12-2 5-12 7-22 5-8-1-13-4-12-9z" fill="#8a3a24" />
            <path d="M-20 0l14 2M-18 5l16 2M-12 -4l12 2" stroke="#5a2414" strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* le grésillement */}
          {[-26, -12, 4, 16].map((x, i) => (
            <circle key={x} cx={x} cy={-14 - (i % 2) * 6} r="1.8" fill="#fff4c2" />
          ))}
          <Steam y={-20} s={0.8} x={-6} />
        </g>
      )}
      {subject === "extincteur" && (
        <g>
          <Shadow y={46} rx={24} />
          <rect x="-14" y="-24" width="28" height="70" rx="12" fill="#d62a22" stroke="#7a1410" strokeWidth="2" />
          <rect x="-14" y="4" width="28" height="14" fill="#f4f1ea" />
          <text x="0" y="15" textAnchor="middle" fontSize="7" fontWeight="800" fill="#7a1410">
            FEU
          </text>
          <path d="M-6 -32h12v8h-12z" fill="#2a2a30" />
          <path d="M-4 -34h18l4 -4" stroke="#2a2a30" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M6 -24c10 4 18 10 22 22" stroke="#2a2a30" strokeWidth="4" fill="none" strokeLinecap="round" />
          {/* le nuage de neige carbonique */}
          {[
            [32, 2, 10],
            [42, -6, 8],
            [44, 8, 9],
            [52, 0, 6],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#f2f6fa" opacity="0.92" />
          ))}
          <Flame x={-36} y={42} s={1.4} />
        </g>
      )}
      {subject === "crepe" && (
        <g>
          <Shadow y={44} rx={34} />
          <g transform="translate(0 30) rotate(6)">
            <path d="M28 2h28" stroke="#3a2a1e" strokeWidth="6" strokeLinecap="round" />
            <ellipse rx="32" ry="8" fill="#2b2d33" />
            <ellipse cy="-2" rx="29" ry="6.5" fill="#3d4049" />
          </g>
          {/* la crêpe en l'air, qui se retourne */}
          <g transform="translate(-4 -18) rotate(-24)">
            <ellipse rx="26" ry="10" fill="#e8b25e" stroke="#b47a2e" strokeWidth="1.6" />
            {[
              [-10, -2, 4],
              [6, 2, 3],
              [12, -3, 2.4],
              [-2, 3, 2],
            ].map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} fill="#c98a3e" opacity="0.7" />
            ))}
          </g>
          <path d="M-30 6c4-10 8-14 14-16M24 -4c-2-10-6-14-12-16" stroke="#fff4c2" strokeWidth="2" fill="none" strokeDasharray="3 4" />
          {/* le sucre qui retombe */}
          {[-18, -8, 2, 12, 20].map((x, i) => (
            <rect key={x} x={x} y={-44 + (i % 3) * 5} width="2" height="2" fill="#fff" transform={`rotate(${i * 20} ${x} ${-44})`} />
          ))}
        </g>
      )}
      {subject === "roulotte" && (
        <g>
          <Shadow y={40} rx={46} />
          <path d="M-40 12h76v18h-76z" fill="#c8402e" stroke="#5a2a1a" strokeWidth="2" />
          <path d="M-44 12c4-30 20-40 44-40s40 10 44 40z" fill="#f2c24a" stroke="#5a2a1a" strokeWidth="2" />
          <path d="M-30 12c3-20 14-28 30-28s27 8 30 28" fill="none" stroke="#c8402e" strokeWidth="3" />
          <rect x="-20" y="-8" width="18" height="16" rx="2" fill="#fff4c2" stroke="#5a2a1a" strokeWidth="1.6" />
          <path d="M-11 -8v16M-20 0h18" stroke="#5a2a1a" strokeWidth="1.2" />
          <rect x="6" y="-4" width="14" height="34" rx="2" fill="#8a3a24" stroke="#5a2a1a" strokeWidth="1.6" />
          <circle cx="17" cy="14" r="1.4" fill="#f2c24a" />
          {/* la cheminée et sa fumée */}
          <rect x="22" y="-36" width="7" height="14" fill="#3a2a1e" />
          <path d="M26 -38c-6-6 4-8 0-14s6-8 2-12" stroke="#e8e0d4" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
          {[-26, 24].map((x) => (
            <g key={x} transform={`translate(${x} 32)`}>
              <circle r="10" fill="#3a2a1e" />
              <circle r="7" fill="#c8a060" />
              {[0, 45, 90, 135].map((a) => (
                <path key={a} d="M-7 0h14" stroke="#3a2a1e" strokeWidth="1.4" transform={`rotate(${a})`} />
              ))}
              <circle r="2" fill="#3a2a1e" />
            </g>
          ))}
          <path d="M-40 26h-14" stroke="#5a2a1a" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {subject === "passe" && (
        <g>
          <path d="M-56 18h112v8h-112z" fill="#b9bec6" stroke="#5a6068" strokeWidth="1.6" />
          <path d="M-56 26h112v26h-112z" fill="#8a6a4a" />
          {/* l'assiette servie, et la clochette */}
          <ellipse cx="-14" cy="16" rx="26" ry="6" fill="#fbfaf6" stroke="#b9b2a2" strokeWidth="1.4" />
          <path d="M-30 14c4-10 26-10 32 0z" fill="#e8b25e" />
          <ellipse cx="-16" cy="8" rx="6" ry="3" fill="#7a3a24" />
          <circle cx="-8" cy="11" r="2.2" fill="#4f9a3a" />
          <g transform="translate(30 14)">
            <ellipse rx="12" ry="3" fill="#c49a3a" />
            <path d="M-10 0c0-12 20-12 20 0z" fill="#e2b74a" stroke="#8a6420" strokeWidth="1.4" />
            <circle cy="-12" r="3" fill="#8a6420" />
          </g>
          <path d="M40 -10l6-6M30 -16v-8M20 -10l-6-6" stroke="#f2c24a" strokeWidth="2.6" strokeLinecap="round" />
          <Steam x={-14} y={0} s={0.7} />
        </g>
      )}
      {subject === "meme" && (
        <g>
          <circle r="44" cy="-2" fill="#f4e4c8" opacity="0.6" />
          {/* le béret, le chignon, les lunettes, le sourire */}
          <path d="M-30 40c2-22 14-30 30-30s28 8 30 30z" fill="#c94f7c" />
          <path d="M-20 40c2-14 10-20 20-20s18 6 20 20z" fill="#f0d9e4" />
          {[-12, 0, 12].map((x) => (
            <circle key={x} cx={x} cy={30} r="2.4" fill="#c94f7c" />
          ))}
          <ellipse cx="0" cy="-8" rx="22" ry="24" fill="#f2c9a0" />
          <path d="M-22 -10c0-18 10-26 22-26s22 8 22 26c-4-8-10-12-22-12s-18 4-22 12z" fill="#e8e6e2" />
          <circle cx="0" cy="-36" r="9" fill="#e8e6e2" />
          <ellipse cx="2" cy="-38" rx="20" ry="7" fill="#24304a" transform="rotate(-8)" />
          <rect x="1" y="-50" width="2" height="6" fill="#24304a" />
          <g fill="none" stroke="#5a3a26" strokeWidth="1.8">
            <circle cx="-8" cy="-8" r="6" />
            <circle cx="8" cy="-8" r="6" />
            <path d="M-2 -8h4" />
          </g>
          <circle cx="-8" cy="-8" r="1.8" fill="#2a1e14" />
          <circle cx="8" cy="-8" r="1.8" fill="#2a1e14" />
          <path d="M-8 6q8 7 16 0" stroke="#8a3a24" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="-14" cy="2" r="4" fill="#f09a8a" opacity="0.55" />
          <circle cx="14" cy="2" r="4" fill="#f09a8a" opacity="0.55" />
          {/* le carnet de recettes */}
          <g transform="translate(30 22) rotate(12)">
            <rect x="-10" y="-13" width="20" height="26" rx="2" fill="#8a3a24" stroke="#5a2a1a" strokeWidth="1.4" />
            <path d="M-6 -6h12M-6 -1h12M-6 4h8" stroke="#f2c24a" strokeWidth="1.4" />
          </g>
        </g>
      )}
      {subject === "toque" && (
        <g>
          {Array.from({ length: 12 }, (_, k) => (
            <path key={k} d="M0 -10L4 -52L-4 -52Z" fill="#fff2b8" opacity={k % 2 ? 0.35 : 0.55} transform={`rotate(${k * 30})`} />
          ))}
          <g transform="translate(0 14) scale(1.9)">
            <ChefHat fill="#f2c24a" line="#9a6a18" />
          </g>
          {[-34, 0, 34].map((x, i) => (
            <text
              key={x}
              x={x}
              y={i === 1 ? -36 : -26}
              textAnchor="middle"
              fontSize={i === 1 ? 20 : 15}
              fill="#fff4c2"
              stroke="#9a6a18"
              strokeWidth="0.8"
            >
              ★
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
