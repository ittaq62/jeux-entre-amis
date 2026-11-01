import type { DeckId } from "../../shared/games/capitale/board.ts";

// Le dessin au milieu de chaque carte Hasard ou Courrier : une image pour ce que raconte la carte.

export type CardArtKey =
  | "start"
  | "heart"
  | "pin"
  | "train"
  | "bulb"
  | "coins"
  | "key"
  | "police"
  | "tools"
  | "speed"
  | "mayor"
  | "chart"
  | "bank"
  | "tooth"
  | "bike"
  | "gift"
  | "umbrella"
  | "cross"
  | "gradcap"
  | "boules"
  | "chest"
  | "party";

/** Le dessin de chaque carte, dans l'ordre des paquets */
const ARTS: Record<DeckId, CardArtKey[]> = {
  hasard: [
    "start",
    "heart",
    "pin",
    "pin",
    "train",
    "train",
    "bulb",
    "coins",
    "key",
    "key",
    "police",
    "tools",
    "speed",
    "train",
    "mayor",
    "chart",
  ],
  courrier: [
    "start",
    "bank",
    "tooth",
    "bike",
    "key",
    "police",
    "coins",
    "gift",
    "umbrella",
    "cross",
    "gradcap",
    "coins",
    "tools",
    "boules",
    "chest",
    "party",
  ],
};

export const cardArt = (deck: DeckId, card: number): CardArtKey => ARTS[deck][card] ?? "coins";

const INK = "#22313a";
const GOLD = "#f2c14e";
const GOLD_DARK = "#c4952c";

const DRAWINGS: Record<CardArtKey, React.ReactNode> = {
  start: (
    <>
      <rect x={17} y={8} width={4} height={48} rx={2} fill="#6b4f3a" />
      <path d="M21 10c9-5 16 4 28-1v22c-12 5-19-4-28 1z" fill="#d6433a" />
      <path d="M27 16l9 4.5-9 4.5z" fill="#fff" />
      <ellipse cx={19} cy={56} rx={10} ry={3} fill="#c9bfae" />
    </>
  ),
  heart: (
    <>
      <path d="M32 54C14 41 7 31 11 21c4-9 15-10 21-2 6-8 17-7 21 2 4 10-3 20-21 33z" fill="#e5476b" />
      <path d="M19 22c1-4 5-6 8-5" stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.7} />
      <path d="M50 8l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill={GOLD} />
    </>
  ),
  pin: (
    <>
      <ellipse cx={32} cy={56} rx={12} ry={3.5} fill="#c9bfae" />
      <path d="M32 6c-10 0-17 7.6-17 17 0 12.5 17 31 17 31s17-18.5 17-31C49 13.6 42 6 32 6z" fill="#2f6fb8" />
      <circle cx={32} cy={23} r={7} fill="#fff" />
    </>
  ),
  train: (
    <>
      <path d="M4 50h56" stroke="#8a7d6b" strokeWidth={3} strokeLinecap="round" />
      <path d="M4 44V27c0-3 2-5 5-5h27c9 0 16 5 22 14l2 3c1 2 0 5-3 5z" fill="#f4f6f8" stroke="#9aa7b0" strokeWidth={1.5} />
      <path d="M4 36h55l1.5 3c.6 1.4-.2 3-1.8 3H4z" fill="#2f5bb8" />
      <path d="M44 25c5 2 9 6 12 10H44z" fill={INK} />
      {[9, 18, 27, 36].map((x) => (
        <rect key={x} x={x} y={26} width={6} height={6} rx={1.5} fill={INK} />
      ))}
      {[12, 22, 38, 48].map((x) => (
        <circle key={x} cx={x} cy={46} r={3} fill="#4a5a64" />
      ))}
    </>
  ),
  bulb: (
    <>
      <path d="M32 8a15 15 0 0 0-9 27c2 2 3 4 3 7h12c0-3 1-5 3-7a15 15 0 0 0-9-27z" fill="#d9dee2" />
      <rect x={25} y={44} width={14} height={4} rx={1.5} fill="#8d9aa3" />
      <rect x={26} y={49} width={12} height={4} rx={1.5} fill="#8d9aa3" />
      <path d="M46 6 38 22h7l-4 13 11-18h-7l4-11z" fill={GOLD} />
    </>
  ),
  coins: (
    <>
      <ellipse cx={30} cy={48} rx={16} ry={6} fill={GOLD_DARK} />
      <rect x={14} y={40} width={32} height={8} fill={GOLD_DARK} />
      <ellipse cx={30} cy={40} rx={16} ry={6} fill={GOLD} />
      <ellipse cx={34} cy={32} rx={16} ry={6} fill={GOLD_DARK} />
      <rect x={18} y={24} width={32} height={8} fill={GOLD_DARK} />
      <ellipse cx={34} cy={24} rx={16} ry={6} fill={GOLD} />
      <text x={34} y={28} textAnchor="middle" fontSize={11} fontWeight={800} fill={GOLD_DARK}>
        ₣
      </text>
      <path d="M52 8l1.3 3.4 3.4 1.3-3.4 1.3L52 17.4l-1.3-3.4-3.4-1.3 3.4-1.3z" fill={GOLD} />
    </>
  ),
  key: (
    <>
      <circle cx={20} cy={30} r={11} fill={GOLD} />
      <circle cx={20} cy={30} r={4.5} fill="#fffaf0" />
      <rect x={29} y={27} width={26} height={6} rx={3} fill={GOLD} />
      <rect x={45} y={32} width={4.5} height={8} rx={1} fill={GOLD} />
      <rect x={51} y={32} width={4} height={6} rx={1} fill={GOLD} />
      <path d="M14 23a8 8 0 0 1 6-3" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.7} />
    </>
  ),
  police: (
    <>
      <path d="M8 14l7 5M56 14l-7 5M32 4v8M4 30h8M52 30h8" stroke="#3b7cff" strokeWidth={3} strokeLinecap="round" />
      <path d="M18 40c0-10 6-18 14-18s14 8 14 18z" fill="#3b7cff" />
      <path d="M24 33c1-4 4-7 7-7" stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.75} />
      <rect x={12} y={40} width={40} height={9} rx={3} fill={INK} />
      <rect x={16} y={49} width={32} height={5} rx={2} fill="#4a5a64" />
    </>
  ),
  tools: (
    <>
      <path d="M17 50 40 23" stroke="#a8743f" strokeWidth={6} strokeLinecap="round" />
      <path d="M33 13l13-2 6 6-2 13-6-1-1-6-6-1z" fill="#6b7a85" />
      <path d="M47 50 24 27" stroke="#8d9aa3" strokeWidth={6} strokeLinecap="round" />
      <path d="M14 14a9 9 0 0 0 11 11l2-2-7-3-3-7z" fill="#8d9aa3" />
      <circle cx={47} cy={50} r={4.5} fill="#8d9aa3" />
    </>
  ),
  speed: (
    <>
      <path d="M8 44a24 24 0 0 1 48 0z" fill="#eef2f5" />
      <path d="M44 25a24 24 0 0 1 12 19h-7a17 17 0 0 0-8-13z" fill="#e0463c" />
      <path d="M14 42h4M18 30l3 2M32 23v4M46 30l-3 2" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M32 44 50 32" stroke="#d6433a" strokeWidth={3.5} strokeLinecap="round" />
      <circle cx={32} cy={44} r={4.5} fill={INK} />
      <rect x={8} y={47} width={48} height={5} rx={2.5} fill="#c9bfae" />
    </>
  ),
  mayor: (
    <>
      <path d="M12 8l14 26" stroke="#2f5bb8" strokeWidth={8} />
      <path d="M18 8l14 26" stroke="#f4f4f4" strokeWidth={6} />
      <path d="M24 8l14 26" stroke="#d6433a" strokeWidth={6} />
      <circle cx={36} cy={42} r={12} fill={GOLD} />
      <circle cx={36} cy={42} r={7.5} fill="none" stroke={GOLD_DARK} strokeWidth={2.5} />
      <path d="M36 36.5l1.7 3.6 3.8.4-2.9 2.6.9 3.8-3.5-2-3.5 2 .9-3.8-2.9-2.6 3.8-.4z" fill={GOLD_DARK} />
    </>
  ),
  chart: (
    <>
      <rect x={10} y={38} width={9} height={14} rx={2} fill="#7fcf9d" />
      <rect x={23} y={30} width={9} height={22} rx={2} fill="#4fb878" />
      <rect x={36} y={20} width={9} height={32} rx={2} fill="#2fa864" />
      <path d="M10 30 26 18l8 6 18-14" stroke={INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M44 8h9v9" stroke={INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x={8} y={52} width={46} height={3} rx={1.5} fill="#8a7d6b" />
    </>
  ),
  bank: (
    <>
      <path d="M32 6 8 20h48z" fill="#c9a96b" />
      <rect x={10} y={20} width={44} height={5} fill="#b8975a" />
      {[14, 24, 36, 46].map((x) => (
        <rect key={x} x={x} y={26} width={5} height={20} rx={1} fill="#e8dcc4" />
      ))}
      <rect x={8} y={46} width={48} height={5} fill="#b8975a" />
      <rect x={5} y={51} width={54} height={5} rx={1.5} fill="#c9a96b" />
      <circle cx={32} cy={15} r={3.5} fill={GOLD} />
    </>
  ),
  tooth: (
    <>
      <path
        d="M20 10c-7 0-11 6-9 14 2 7 4 10 5 18 1 7 2 12 6 12 4 0 4-9 6-14 1-3 2-4 4-4s3 1 4 4c2 5 2 14 6 14 4 0 5-5 6-12 1-8 3-11 5-18 2-8-2-14-9-14-5 0-8 3-12 3s-7-3-12-3z"
        fill="#fbfbf8"
        stroke="#c9cfd3"
        strokeWidth={2}
      />
      <path d="M18 18c1-3 3-4 6-4" stroke="#c9cfd3" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <path d="M50 30l1.3 3.4 3.4 1.3-3.4 1.3L50 39.4l-1.3-3.4-3.4-1.3 3.4-1.3z" fill="#7fc4ee" />
    </>
  ),
  bike: (
    <>
      <circle cx={16} cy={40} r={11} fill="none" stroke={INK} strokeWidth={3.5} />
      <circle cx={48} cy={40} r={11} fill="none" stroke={INK} strokeWidth={3.5} />
      <path d="M16 40l10-16h16l6 16M26 24l8 16 8-16M34 40h-2" stroke="#d6433a" strokeWidth={3.5} strokeLinejoin="round" fill="none" />
      <path d="M22 20h9" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <path d="M40 18h6l2 3" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  gift: (
    <>
      <rect x={12} y={28} width={40} height={26} rx={3} fill="#e5476b" />
      <rect x={9} y={20} width={46} height={10} rx={3} fill="#f06a88" />
      <rect x={29} y={20} width={6} height={34} fill={GOLD} />
      <path d="M32 20c-6-10-16-8-13-2 2 3 8 2 13 2zM32 20c6-10 16-8 13-2-2 3-8 2-13 2z" fill={GOLD} />
    </>
  ),
  umbrella: (
    <>
      <path
        d="M6 32a26 22 0 0 1 52 0c-3-3-6-3-8.7 0-2.6-3-5.6-3-8.6 0-2.7-3-5.7-3-8.7 0-2.7-3-5.7-3-8.7 0-2.6-3-5.6-3-8.6 0-2.7-3-6-3-8.7 0z"
        fill="#2f6fb8"
      />
      <path d="M32 10v-3" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d="M32 32v18a5 5 0 0 1-10 0" stroke={INK} strokeWidth={3.5} strokeLinecap="round" fill="none" />
      <path d="M20 18c3-4 7-6 11-6" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.6} />
    </>
  ),
  cross: (
    <>
      <rect x={10} y={10} width={44} height={44} rx={10} fill="#fbfbf8" stroke="#e3d9c7" strokeWidth={2} />
      <path d="M26 16h12v10h10v12H38v10H26V38H16V26h10z" fill="#d6433a" />
    </>
  ),
  gradcap: (
    <>
      <path d="M32 12 4 24l28 12 28-12z" fill={INK} />
      <path d="M16 30v12c0 4 7 8 16 8s16-4 16-8V30l-16 7z" fill="#3a4b55" />
      <path d="M54 26v16" stroke={GOLD} strokeWidth={2.5} />
      <path d="M50 42h8l-2 8h-4z" fill={GOLD} />
    </>
  ),
  boules: (
    <>
      <ellipse cx={32} cy={54} rx={24} ry={4} fill="#d8c8a8" />
      <circle cx={21} cy={38} r={12} fill="#9aa6ae" />
      <circle cx={43} cy={40} r={11} fill="#7d8a93" />
      <path d="M13 34c2-5 6-7 10-7M36 35c2-4 5-6 8-6" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.65} />
      <path d="M11 41h20M34 43h18" stroke="#6b7a85" strokeWidth={1.5} opacity={0.6} />
      <circle cx={33} cy={51} r={3.5} fill="#d6433a" />
    </>
  ),
  chest: (
    <>
      <path d="M10 28c0-9 10-14 22-14s22 5 22 14z" fill="#a8743f" />
      <rect x={10} y={28} width={44} height={24} rx={2} fill="#8c5d31" />
      <path d="M10 28h44" stroke="#6b4423" strokeWidth={3} />
      <rect x={18} y={14} width={4} height={38} fill={GOLD_DARK} opacity={0.8} />
      <rect x={42} y={14} width={4} height={38} fill={GOLD_DARK} opacity={0.8} />
      <rect x={27} y={24} width={10} height={12} rx={2} fill={GOLD} />
      <circle cx={32} cy={30} r={2} fill="#6b4423" />
      <circle cx={50} cy={12} r={4} fill={GOLD} />
      <circle cx={14} cy={10} r={3} fill={GOLD} />
    </>
  ),
  party: (
    <>
      <path d="M4 12c16 10 40 10 56 0" stroke="#8a7d6b" strokeWidth={2} fill="none" />
      {[
        [8, 15, "#d6433a"],
        [20, 19, "#f2c14e"],
        [32, 20, "#2f6fb8"],
        [44, 19, "#2fa864"],
        [56, 15, "#e5476b"],
      ].map(([x, y, c]) => (
        <path key={x as number} d={`M${(x as number) - 5} ${y}h10l-5 11z`} fill={c as string} />
      ))}
      {[
        [12, 44, "#f2c14e", 20],
        [24, 52, "#d6433a", -30],
        [40, 46, "#2f6fb8", 45],
        [52, 54, "#2fa864", 10],
        [30, 38, "#e5476b", -10],
      ].map(([x, y, c, r]) => (
        <rect
          key={`${x}-${y}`}
          x={x as number}
          y={y as number}
          width={6}
          height={3}
          rx={1}
          fill={c as string}
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
    </>
  ),
};

/** Le dessin d'une carte, dans un médaillon à la couleur du paquet */
export function CardArt({ deck, card }: { deck: DeckId; card: number }) {
  return (
    <svg className="cap-card-art-svg" viewBox="0 0 64 64" aria-hidden="true">
      {DRAWINGS[cardArt(deck, card)]}
    </svg>
  );
}
