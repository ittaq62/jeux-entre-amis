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
  | "party"
  | "sign"
  | "coffee"
  | "wine"
  | "mountain"
  | "car"
  | "ticket"
  | "vinyl"
  | "camera"
  | "tire"
  | "phone"
  | "glasses"
  | "house"
  | "scales"
  | "castle"
  | "quake"
  | "fire"
  | "storm"
  | "flood"
  | "danger"
  | "leak"
  | "cat"
  | "radiator"
  | "letter"
  | "noise"
  | "box"
  | "pumpkin"
  | "bug"
  | "tram"
  | "gavel";

/** Le dessin de chaque carte, dans l'ordre des paquets */
export const ARTS: Record<DeckId, CardArtKey[]> = {
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
    // Les nouvelles
    "sign",
    "coffee",
    "wine",
    "mountain",
    "coins",
    "car",
    "ticket",
    "vinyl",
    "camera",
    "tire",
    "speed",
    "phone",
    "glasses",
    "tools",
    "house",
    "scales",
    "castle",
    "quake",
    "fire",
    "storm",
    "flood",
    "danger",
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
    // Les nouvelles
    "leak",
    "umbrella",
    "cat",
    "car",
    "radiator",
    "letter",
    "noise",
    "letter",
    "party",
    "house",
    "gift",
    "box",
    "car",
    "party",
    "cross",
    "pumpkin",
    "tools",
    "bug",
    "tram",
    "gavel",
  ],
};

export const cardArt = (deck: DeckId, card: number): CardArtKey => ARTS[deck][card] ?? "coins";

const INK = "#22313a";
const GOLD = "#f2c14e";
const GOLD_DARK = "#c4952c";

export const DRAWINGS: Record<CardArtKey, React.ReactNode> = {
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
  sign: (
    <>
      <rect x={29} y={8} width={5} height={48} rx={2} fill="#8a6a48" />
      <path d="M12 12h30l8 6-8 6H12z" fill="#2fa864" />
      <path d="M52 28H22l-8 6 8 6h30z" fill="#e8b12f" />
      <path d="M18 18h18M26 34h20" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
      <ellipse cx={31} cy={56} rx={12} ry={3} fill="#c9bfae" />
    </>
  ),
  coffee: (
    <>
      <path
        d="M24 8c-3 4 3 6 0 10M32 6c-3 4 3 7 0 11M40 8c-3 4 3 6 0 10"
        stroke="#b9b2a6"
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M14 24h34v14a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14z" fill="#f4efe6" stroke="#c9bfae" strokeWidth={2} />
      <path d="M48 28h3a6 6 0 0 1 0 12h-4" stroke="#c9bfae" strokeWidth={3.5} fill="none" />
      <ellipse cx={31} cy={25} rx={15} ry={3} fill="#7a4a2a" />
      <ellipse cx={31} cy={56} rx={22} ry={3.5} fill="#d8c8a8" />
    </>
  ),
  wine: (
    <>
      <path d="M17 6h8v10c5 3 6 7 6 12v24a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V28c0-5 1-9 6-12z" fill="#5a1f34" />
      <rect x={12} y={32} width={18} height={12} rx={1.5} fill="#f4efe6" />
      <path d="M38 22h18c0 9-3 15-9 15s-9-6-9-15z" fill="#f4f6f8" stroke="#c9cfd3" strokeWidth={1.5} />
      <path d="M39 27h16c-1 6-3 9-8 9s-7-3-8-9z" fill="#9b2242" />
      <path d="M47 37v14M41 53h12" stroke="#c9cfd3" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={52} cy={12} r={3} fill="#7b3fa0" />
      <circle cx={47} cy={13} r={3} fill="#8f4fb5" />
      <circle cx={50} cy={17} r={3} fill="#7b3fa0" />
    </>
  ),
  mountain: (
    <>
      <circle cx={48} cy={14} r={7} fill={GOLD} />
      <path d="M2 54 22 20l14 22 8-12 18 24z" fill="#6b8f6f" />
      <path d="M22 20l-6 10 4-2 3 3 3-3 3 2z" fill="#fbfbf8" />
      <path d="M44 30l-4 6 3-1 2 2 2-2 2 1z" fill="#fbfbf8" />
      <path d="M2 54h60" stroke="#4f6f52" strokeWidth={3} />
    </>
  ),
  car: (
    <>
      <path d="M6 40v-8l6-2 8-10h22l10 10 6 2v8z" fill="#2fa864" />
      <path d="M22 22h8v9H14zM34 22h6l8 9H34z" fill="#bfe3f7" />
      <rect x={6} y={38} width={52} height={5} rx={2} fill="#23804a" />
      <circle cx={18} cy={44} r={6} fill={INK} />
      <circle cx={46} cy={44} r={6} fill={INK} />
      <circle cx={18} cy={44} r={2.5} fill="#c9cfd3" />
      <circle cx={46} cy={44} r={2.5} fill="#c9cfd3" />
      <path d="M4 52h56" stroke="#c9bfae" strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  ticket: (
    <g transform="rotate(-8 32 32)">
      <path d="M8 20h48v8a4 4 0 0 0 0 8v8H8v-8a4 4 0 0 0 0-8z" fill={GOLD} />
      <path d="M22 18v30" stroke={GOLD_DARK} strokeWidth={2} strokeDasharray="3 3" />
      <text x={38} y={37} textAnchor="middle" fontSize={11} fontWeight={800} fill="#8a5a1c">
        N°7
      </text>
    </g>
  ),
  vinyl: (
    <>
      <circle cx={32} cy={32} r={24} fill="#22262a" />
      <circle cx={32} cy={32} r={18} fill="none" stroke="#3a4046" strokeWidth={1.5} />
      <circle cx={32} cy={32} r={13} fill="none" stroke="#3a4046" strokeWidth={1.5} />
      <circle cx={32} cy={32} r={8} fill="#e5476b" />
      <circle cx={32} cy={32} r={2} fill="#22262a" />
      <path d="M18 18c3-3 7-5 11-5" stroke="#fff" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.35} />
    </>
  ),
  camera: (
    <>
      <path d="M8 22h12l4-6h16l4 6h12v28H8z" fill="#3a4b55" />
      <circle cx={32} cy={35} r={11} fill="#22313a" />
      <circle cx={32} cy={35} r={7} fill="#5b8fc2" />
      <circle cx={29} cy={32} r={2} fill="#fff" opacity={0.7} />
      <rect x={46} y={25} width={6} height={4} rx={1} fill={GOLD} />
      <path d="M10 8l3 3M54 8l-3 3M32 4v4" stroke={GOLD} strokeWidth={2.5} strokeLinecap="round" />
    </>
  ),
  tire: (
    <>
      <circle cx={30} cy={34} r={20} fill={INK} />
      <circle cx={30} cy={34} r={10} fill="#8d9aa3" />
      <circle cx={30} cy={34} r={4} fill="#5d6b74" />
      <path d="M44 18l8-8" stroke="#8d9aa3" strokeWidth={3} strokeLinecap="round" />
      <path d="M52 22c4 0 6 2 6 5M50 28c3 1 4 3 3 6" stroke="#b9c4ca" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <ellipse cx={30} cy={56} rx={18} ry={3} fill="#c9bfae" />
    </>
  ),
  phone: (
    <>
      <g transform="rotate(18 32 23)">
        <rect x={22} y={6} width={20} height={34} rx={4} fill={INK} />
        <rect x={24.5} y={10} width={15} height={24} rx={2} fill="#5b8fc2" />
      </g>
      <path d="M2 46c6-4 10-4 15 0s9 4 15 0 9-4 15 0 9 4 15 0v16H2z" fill="#3f8fc4" />
      <path d="M8 52c4-2 6-2 9 0M36 54c4-2 6-2 9 0" stroke="#bfe3f7" strokeWidth={2} strokeLinecap="round" fill="none" />
    </>
  ),
  glasses: (
    <>
      <circle cx={19} cy={34} r={11} fill="#bfe3f7" stroke={INK} strokeWidth={3.5} />
      <circle cx={45} cy={34} r={11} fill="#bfe3f7" stroke={INK} strokeWidth={3.5} />
      <path d="M30 32c1-2 3-2 4 0M8 30 3 22M56 30l5-8" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M40 25l4 7-3 3 5 7" stroke="#fff" strokeWidth={2} strokeLinejoin="round" fill="none" />
      <path d="M14 30c1-3 3-4 5-4" stroke="#fff" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.8} />
    </>
  ),
  house: (
    <>
      <path d="M6 28 28 10l22 18z" fill="#c5653b" />
      <rect x={11} y={28} width={34} height={24} fill="#f2e5cc" />
      <rect x={24} y={38} width={9} height={14} fill="#8a5a34" />
      <rect x={14} y={32} width={7} height={7} fill="#5b8fc2" />
      <circle cx={48} cy={42} r={11} fill={GOLD} stroke={GOLD_DARK} strokeWidth={2} />
      <text x={48} y={46.5} textAnchor="middle" fontSize={12} fontWeight={800} fill={GOLD_DARK}>
        ₣
      </text>
    </>
  ),
  scales: (
    <>
      <path d="M32 8v42M20 54h24" stroke="#8a6a48" strokeWidth={4} strokeLinecap="round" />
      <path d="M10 20 54 14" stroke="#8a6a48" strokeWidth={3.5} strokeLinecap="round" />
      <path d="M11 19 4 32h14zM53 15l-7 15h14z" stroke="#8a6a48" strokeWidth={1.5} fill="none" />
      <path d="M4 32a7 4 0 0 0 14 0z" fill={GOLD} />
      <path d="M46 30a7 4 0 0 0 14 0z" fill={GOLD} />
      <circle cx={11} cy={28} r={3} fill={GOLD_DARK} />
      <circle cx={8} cy={30} r={2.5} fill={GOLD_DARK} />
      <circle cx={14} cy={30} r={2.5} fill={GOLD_DARK} />
      <circle cx={32} cy={8} r={3.5} fill={GOLD} />
    </>
  ),
  castle: (
    <>
      <rect x={10} y={22} width={12} height={32} fill="#e7dcc4" />
      <rect x={42} y={22} width={12} height={32} fill="#e7dcc4" />
      <rect x={20} y={30} width={24} height={24} fill="#efe6d2" />
      <path d="M10 22l6-10 6 10zM42 22l6-10 6 10z" fill="#48525e" />
      <path d="M20 30h4v-4h4v4h4v-4h4v4h4v-4h4v4" fill="#efe6d2" stroke="#e7dcc4" />
      <path d="M28 54V44a4 4 0 0 1 8 0v10z" fill="#8a5a34" />
      <path d="M16 12V3" stroke="#6b4423" strokeWidth={1.5} />
      <path d="M16 3h8l-2 3 2 3h-8z" fill="#d6433a" />
    </>
  ),
  quake: (
    <>
      <path d="M2 44h20l4 6 6-10 5 8 4-4h21" stroke="#8a6a48" strokeWidth={3} fill="none" strokeLinejoin="round" />
      <g transform="rotate(-12 32 30)">
        <path d="M18 24 32 12l14 12z" fill="#c5653b" />
        <rect x={21} y={24} width={22} height={18} fill="#f2e5cc" />
        <path d="M30 24l3 6-4 4 3 8" stroke="#6b4423" strokeWidth={2} fill="none" />
      </g>
      <path d="M6 30l4-4M56 26l3-4M8 18l3 2" stroke="#d6433a" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M2 54h60" stroke="#c9bfae" strokeWidth={3} />
    </>
  ),
  fire: (
    <>
      <path d="M8 34 28 18l20 16z" fill="#5d4a3e" />
      <rect x={12} y={34} width={32} height={20} fill="#d9c9ae" />
      <path d="M38 6c6 6 14 10 14 22a12 12 0 0 1-24 0c0-6 4-8 6-13 0 5 3 7 5 7-1-6-2-11-1-16z" fill="#f07a22" />
      <path d="M40 22c3 3 6 6 6 10a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 2 3 3 3z" fill={GOLD} />
      <rect x={20} y={40} width={8} height={8} fill="#f2c14e" opacity={0.8} />
    </>
  ),
  storm: (
    <>
      <path d="M16 34a10 10 0 0 1 2-20 14 14 0 0 1 26-2 10 10 0 0 1 4 22z" fill="#6f7c86" />
      <path d="M33 30 26 44h7l-4 14 13-19h-8l5-9z" fill={GOLD} />
      <path d="M14 40l-3 7M20 42l-3 7M46 40l-3 7M52 38l-3 7" stroke="#5b8fc2" strokeWidth={2.5} strokeLinecap="round" />
    </>
  ),
  flood: (
    <>
      <path d="M14 22 30 8l16 14z" fill="#c5653b" />
      <rect x={17} y={22} width={26} height={22} fill="#f2e5cc" />
      <rect x={26} y={30} width={8} height={14} fill="#8a5a34" />
      <path d="M2 40c5-3 9-3 14 0s9 3 14 0 9-3 14 0 9 3 14 0 4-2 4-2v24H2z" fill="#3f8fc4" opacity={0.92} />
      <path d="M8 48c4-2 6-2 9 0M34 50c4-2 6-2 9 0M20 56c4-2 6-2 9 0" stroke="#bfe3f7" strokeWidth={2} strokeLinecap="round" fill="none" />
    </>
  ),
  danger: (
    <>
      <path d="M32 6 60 54H4z" fill="#f2c14e" stroke="#c4952c" strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M22 44V34l10-8 10 8v10z" fill="#f4efe6" stroke={INK} strokeWidth={2} />
      <path d="M31 27l3 7-4 4 3 6" stroke="#d6433a" strokeWidth={2.5} fill="none" />
    </>
  ),
  leak: (
    <>
      <path d="M4 16h30a8 8 0 0 1 8 8v8" stroke="#8d9aa3" strokeWidth={8} fill="none" />
      <rect x={36} y={30} width={12} height={6} rx={2} fill="#6b7a85" />
      <path d="M42 40c-4 6-6 9-6 12a6 6 0 0 0 12 0c0-3-2-6-6-12z" fill="#3f8fc4" />
      <path d="M22 22c-2 3-3 5-3 6a3 3 0 0 0 6 0c0-1-1-3-3-6z" fill="#7fc4ee" />
      <ellipse cx={42} cy={58} rx={14} ry={3} fill="#7fc4ee" opacity={0.6} />
    </>
  ),
  cat: (
    <>
      <ellipse cx={32} cy={38} rx={18} ry={15} fill="#f0b36f" />
      <path d="M16 14l8 14H14zM48 14l2 14H40z" fill="#e8a25a" />
      <ellipse cx={25} cy={36} rx={3} ry={4} fill={INK} />
      <ellipse cx={39} cy={36} rx={3} ry={4} fill={INK} />
      <path d="M30 43h4l-2 2z" fill="#e5476b" />
      <path d="M14 42l10 1M14 47l10-2M50 42l-10 1M50 47l-10-2" stroke="#8a5a34" strokeWidth={1.5} strokeLinecap="round" />
    </>
  ),
  radiator: (
    <>
      {[10, 18, 26, 34, 42].map((x) => (
        <rect key={x} x={x} y={18} width={7} height={34} rx={3} fill="#e4e8eb" stroke="#b9c4ca" strokeWidth={1.5} />
      ))}
      <rect x={6} y={50} width={46} height={4} rx={2} fill="#8d9aa3" />
      <path d="M54 8v14M47 11l14 8M47 19l14-8" stroke="#5b8fc2" strokeWidth={2.5} strokeLinecap="round" />
    </>
  ),
  letter: (
    <>
      <rect x={6} y={16} width={52} height={34} rx={3} fill="#f6f1e6" stroke="#c9bfae" strokeWidth={2} />
      <path d="M7 18l25 18 25-18" stroke="#c9bfae" strokeWidth={2} fill="none" />
      <g transform="rotate(-15 46 40)">
        <circle cx={46} cy={40} r={9} fill="none" stroke="#d6433a" strokeWidth={2.5} />
        <text x={46} y={44} textAnchor="middle" fontSize={10} fontWeight={800} fill="#d6433a">
          ₣
        </text>
      </g>
    </>
  ),
  noise: (
    <>
      <path d="M8 26h8l12-10v32L16 38H8z" fill={INK} />
      <path d="M34 22a12 12 0 0 1 0 20M40 16a20 20 0 0 1 0 32" stroke="#d6433a" strokeWidth={3} strokeLinecap="round" fill="none" />
      <circle cx={52} cy={20} r={3.5} fill="#2f6fb8" />
      <path d="M55.5 20V8l4 2" stroke="#2f6fb8" strokeWidth={2} fill="none" />
      <circle cx={50} cy={46} r={3} fill={GOLD_DARK} />
      <path d="M53 46V36" stroke={GOLD_DARK} strokeWidth={2} />
    </>
  ),
  box: (
    <>
      <path d="M8 26 32 18l24 8v24l-24 8-24-8z" fill="#c9965a" />
      <path d="M8 26l24 8 24-8M32 34v24" stroke="#a87a44" strokeWidth={2} fill="none" />
      <path d="M8 26l-4-8 24-6 4 6zM56 26l4-8-24-6-4 6z" fill="#dcad72" />
      <circle cx={24} cy={14} r={4} fill="#e5476b" />
      <rect x={34} y={6} width={5} height={12} rx={1} fill="#2f6fb8" transform="rotate(15 36 12)" />
    </>
  ),
  pumpkin: (
    <>
      <ellipse cx={32} cy={38} rx={24} ry={17} fill="#f07a22" />
      <path d="M32 21c-6 4-8 10-8 17s2 13 8 17c6-4 8-10 8-17s-2-13-8-17z" fill="#f59a3c" />
      <path d="M18 24c-6 6-6 22 0 28M46 24c6 6 6 22 0 28" stroke="#d65f12" strokeWidth={2} fill="none" />
      <path d="M32 22c0-6 2-10 6-12" stroke="#4f8a3d" strokeWidth={4} strokeLinecap="round" fill="none" />
      <path d="M50 8l1.3 3.4 3.4 1.3-3.4 1.3L50 17.4l-1.3-3.4-3.4-1.3 3.4-1.3z" fill={GOLD} />
    </>
  ),
  bug: (
    <>
      <rect x={4} y={40} width={56} height={14} rx={2} fill="#a8743f" />
      <path d="M10 46h12M30 44h10M44 49h10" stroke="#7a5230" strokeWidth={2} strokeLinecap="round" />
      <ellipse cx={32} cy={28} rx={8} ry={12} fill="#f2e5cc" stroke="#c9bfae" strokeWidth={1.5} />
      <circle cx={32} cy={14} r={5} fill="#c4952c" />
      <path
        d="M24 22l-8-4M24 30h-9M24 36l-8 4M40 22l8-4M40 30h9M40 36l8 4M29 10l-3-5M35 10l3-5"
        stroke={INK}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </>
  ),
  tram: (
    <>
      <path d="M32 4v8M24 4h16" stroke="#6b7a85" strokeWidth={2.5} strokeLinecap="round" />
      <rect x={14} y={12} width={36} height={38} rx={8} fill="#2fa864" />
      <rect x={18} y={17} width={28} height={16} rx={3} fill="#bfe3f7" />
      <rect x={14} y={38} width={36} height={4} fill="#f4f4f4" />
      <circle cx={21} cy={45} r={2.5} fill={GOLD} />
      <circle cx={43} cy={45} r={2.5} fill={GOLD} />
      <path d="M8 58h48M16 50l-4 8M48 50l4 8" stroke="#8a7d6b" strokeWidth={2.5} strokeLinecap="round" />
    </>
  ),
  gavel: (
    <>
      <g transform="rotate(-35 25 18)">
        <rect x={12} y={12} width={26} height={12} rx={3} fill="#8a5a34" />
        <rect x={14} y={8} width={6} height={20} rx={2} fill="#6b4423" />
        <rect x={30} y={8} width={6} height={20} rx={2} fill="#6b4423" />
      </g>
      <path d="M30 30l20 20" stroke="#a8743f" strokeWidth={5} strokeLinecap="round" />
      <rect x={6} y={48} width={30} height={8} rx={2} fill="#8a5a34" />
      <path d="M44 10l3 3M50 18l4 1M40 4l1 4" stroke={GOLD} strokeWidth={2.5} strokeLinecap="round" />
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
