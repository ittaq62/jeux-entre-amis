import { memo, type ReactNode } from "react";
import type { Card as CardData, Color } from "../../shared/games/uno/cards.ts";
import { usePrefs } from "../stores/prefs.ts";

export const CARD_RATIO = 1.4;

const FIELD: Record<Color | "wild", [string, string, string]> = {
  red: ["#f65a5c", "#e23b3f", "#a3172a"],
  yellow: ["#ffd567", "#f3b62c", "#c7860d"],
  green: ["#4fcf86", "#2fa864", "#14713f"],
  blue: ["#56a0ff", "#2c7be5", "#1b4fa6"],
  wild: ["#3a3a46", "#1d1d25", "#09090d"],
};

export const COLOR_HEX: Record<Color, string> = {
  red: "#e23b3f",
  yellow: "#f3b62c",
  green: "#2fa864",
  blue: "#2c7be5",
};

interface CardProps {
  card: CardData;
  width: number;
  className?: string;
}

/** Face d'une carte, dessinee en SVG (nette a toutes les tailles). */
export const CardFace = memo(function CardFace({ card, width, className }: CardProps) {
  const colorblind = usePrefs((s) => s.colorblind);
  const key = card.color ?? "wild";
  const dark = FIELD[key][2];
  const ink = card.color ? COLOR_HEX[card.color] : "#1d1d25";
  const corner = cornerLabel(card);
  return (
    <svg
      viewBox="0 0 100 140"
      width={width}
      height={width * CARD_RATIO}
      className={`card-svg ${className ?? ""}`}
      role="img"
      aria-label={ariaLabel(card)}
    >
      <rect x="0.6" y="0.6" width="98.8" height="138.8" rx="10" fill="#fbf5e6" stroke="rgba(40,25,10,0.35)" strokeWidth="1.2" />
      <rect x="5" y="5" width="90" height="130" rx="7" fill={`url(#card-f-${key})`} />
      <rect x="5" y="5" width="90" height="130" rx="7" fill="url(#card-lines)" />
      <rect x="5" y="5" width="90" height="130" rx="7" fill="url(#card-sheen)" />
      <rect x="8.5" y="8.5" width="83" height="123" rx="5" fill="none" stroke="#fff6df" strokeOpacity="0.4" strokeWidth="0.8" />

      {/* Medaillon central */}
      {card.color ? (
        <g>
          <circle cx="50" cy="70" r="31" fill="#fbf5e6" />
          <circle cx="50" cy="70" r="31" fill="none" stroke={dark} strokeOpacity="0.35" strokeWidth="1.5" />
          <circle cx="50" cy="70" r="27.5" fill="none" stroke="#c9a14b" strokeOpacity="0.55" strokeWidth="0.7" />
          <g transform="translate(50 70)">{centerSymbol(card, ink)}</g>
        </g>
      ) : (
        <g transform="translate(50 70)">{wildCenter(card)}</g>
      )}

      {/* Index dans les coins */}
      <g>
        {cornerIndex(corner, card, 13, 27)}
        {colorblind && card.color && <ColorMark color={card.color} x={13} y={40} />}
      </g>
      <g transform="rotate(180 50 70)">
        {cornerIndex(corner, card, 13, 27)}
        {colorblind && card.color && <ColorMark color={card.color} x={13} y={40} />}
      </g>
    </svg>
  );
});

/** Dos de carte : bordeaux et dorures art deco. */
export const CardBack = memo(function CardBack({ width, className }: { width: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 140" width={width} height={width * CARD_RATIO} className={`card-svg ${className ?? ""}`} aria-hidden="true">
      <rect x="0.6" y="0.6" width="98.8" height="138.8" rx="10" fill="#fbf5e6" stroke="rgba(40,25,10,0.35)" strokeWidth="1.2" />
      <rect x="5" y="5" width="90" height="130" rx="7" fill="url(#card-back-field)" />
      <rect x="5" y="5" width="90" height="130" rx="7" fill="url(#card-back-rays)" />
      <rect x="10" y="10" width="80" height="120" rx="4.5" fill="none" stroke="#e6c36f" strokeOpacity="0.75" strokeWidth="1" />
      <rect x="13" y="13" width="74" height="114" rx="3" fill="none" stroke="#e6c36f" strokeOpacity="0.35" strokeWidth="0.6" />
      <g transform="translate(50 70)">
        <path d="M0 -30 L22 0 L0 30 L-22 0 Z" fill="#3a0a17" stroke="#e6c36f" strokeWidth="1.3" />
        <path d="M0 -23 L16.5 0 L0 23 L-16.5 0 Z" fill="none" stroke="#e6c36f" strokeOpacity="0.5" strokeWidth="0.7" />
        <circle cx="0" cy="-9" r="4.2" fill={COLOR_HEX.red} />
        <circle cx="9" cy="0" r="4.2" fill={COLOR_HEX.yellow} />
        <circle cx="0" cy="9" r="4.2" fill={COLOR_HEX.green} />
        <circle cx="-9" cy="0" r="4.2" fill={COLOR_HEX.blue} />
        <circle cx="0" cy="0" r="1.6" fill="#e6c36f" />
      </g>
      {[-1, 1].map((s) => (
        <g key={s} transform={`translate(50 ${70 + s * 45})`} stroke="#e6c36f" strokeOpacity="0.6" strokeWidth="0.8" fill="none">
          <path d="M-18 0 H-5 M5 0 H18" />
          <path d="M0 -3 L3 0 L0 3 L-3 0 Z" fill="#e6c36f" fillOpacity="0.6" />
        </g>
      ))}
    </svg>
  );
});

function cornerLabel(card: CardData): string {
  switch (card.kind) {
    case "number":
      return String(card.value);
    case "draw2":
      return "+2";
    case "draw4":
    case "wild4":
    case "wildReverse4":
      return "+4";
    case "wild6":
      return "+6";
    case "wild10":
      return "+10";
    default:
      return "";
  }
}

function cornerIndex(label: string, card: CardData, x: number, y: number): ReactNode {
  const fill = "#fffaf0";
  const outline = FIELD[card.color ?? "wild"][2];
  if (label) {
    const size = label.length > 2 ? 17 : label.length > 1 ? 21 : 27;
    return (
      <text
        x={x + 2}
        y={y + 3}
        className="card-num"
        fontSize={size}
        fill={fill}
        textAnchor="middle"
        stroke={outline}
        strokeWidth="3"
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {label}
      </text>
    );
  }
  return (
    <g transform={`translate(${x + 2} ${y - 7}) scale(0.52)`}>
      <g stroke={outline} strokeWidth="5" opacity="0.6" fill="none">
        {symbolOnly(card, outline)}
      </g>
      {symbolOnly(card, fill)}
    </g>
  );
}

function symbolOnly(card: CardData, color: string): ReactNode {
  switch (card.kind) {
    case "skip":
      return <SkipIcon color={color} />;
    case "skipAll":
      return <SkipAllIcon color={color} />;
    case "reverse":
      return <ReverseIcon color={color} />;
    case "discardAll":
      return <DiscardAllIcon color={color} />;
    case "wild":
      return <Pinwheel r={16} />;
    case "wildRoulette":
      return <Roulette r={17} />;
    default:
      return null;
  }
}

function centerSymbol(card: CardData, ink: string): ReactNode {
  if (card.kind === "number") {
    const underline = card.value === 6 || card.value === 9;
    return (
      <g>
        {underline && <rect x="-8" y="20" width="16" height="2.6" rx="1.3" fill={ink} />}
        <text y="15.5" className="card-num card-num-big" fontSize="46" fill={ink} textAnchor="middle">
          {card.value}
        </text>
      </g>
    );
  }
  if (card.kind === "draw2" || card.kind === "draw4") {
    return (
      <text y="13" className="card-num card-num-big" fontSize="36" fill={ink} textAnchor="middle">
        {card.kind === "draw2" ? "+2" : "+4"}
      </text>
    );
  }
  return <g transform="scale(1.05)">{symbolOnly(card, ink)}</g>;
}

function wildCenter(card: CardData): ReactNode {
  const ring = (
    <g>
      <circle r="31" fill="#121218" stroke="#e6c36f" strokeOpacity="0.6" strokeWidth="1" />
    </g>
  );
  switch (card.kind) {
    case "wild":
      return (
        <g>
          {ring}
          <Pinwheel r={25} />
        </g>
      );
    case "wildRoulette":
      return (
        <g>
          {ring}
          <Roulette r={26} />
        </g>
      );
    case "wildReverse4":
      return (
        <g>
          {ring}
          <Pinwheel r={25} opacity={0.4} hub={false} />
          <g transform="translate(0 -6) scale(0.8)">
            <ReverseIcon color="#fffaf0" />
          </g>
          <text y="23" className="card-num" fontSize="18" fill="#fffaf0" textAnchor="middle" stroke="#000" strokeOpacity="0.8" strokeWidth="4" strokeLinejoin="round" paintOrder="stroke">
            +4
          </text>
        </g>
      );
    default: {
      const label = cornerLabel(card);
      return (
        <g>
          {ring}
          <Pinwheel r={25} opacity={card.kind === "wild4" ? 0.7 : 0.4} hub={false} />
          <text
            y={label.length > 2 ? 10 : 12}
            className="card-num card-num-big"
            fontSize={label.length > 2 ? 26 : 32}
            fill="#fffaf0"
            textAnchor="middle"
            stroke="#000"
            strokeOpacity="0.8"
            strokeWidth="5"
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {label}
          </text>
        </g>
      );
    }
  }
}

function Pinwheel({ r, opacity = 1, hub = true }: { r: number; opacity?: number; hub?: boolean }) {
  const q = (a0: number, color: string) => {
    const a1 = a0 + Math.PI / 2;
    const p0 = [Math.cos(a0) * r, Math.sin(a0) * r];
    const p1 = [Math.cos(a1) * r, Math.sin(a1) * r];
    return <path d={`M0 0 L${p0[0]} ${p0[1]} A${r} ${r} 0 0 1 ${p1[0]} ${p1[1]} Z`} fill={color} />;
  };
  return (
    <g opacity={opacity}>
      {q(-Math.PI, COLOR_HEX.red)}
      {q(-Math.PI / 2, COLOR_HEX.yellow)}
      {q(0, COLOR_HEX.green)}
      {q(Math.PI / 2, COLOR_HEX.blue)}
      <circle r={r} fill="none" stroke="#fffaf0" strokeOpacity="0.85" strokeWidth="1.4" />
      {hub && <circle r={r * 0.28} fill="#fffaf0" />}
    </g>
  );
}

function Roulette({ r }: { r: number }) {
  const colors = [COLOR_HEX.red, COLOR_HEX.yellow, COLOR_HEX.green, COLOR_HEX.blue];
  const segs = 8;
  return (
    <g>
      {Array.from({ length: segs }, (_, i) => {
        const a0 = (i / segs) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2 - Math.PI / 2;
        return (
          <path
            key={i}
            d={`M0 0 L${Math.cos(a0) * r} ${Math.sin(a0) * r} A${r} ${r} 0 0 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r} Z`}
            fill={colors[i % 4]}
          />
        );
      })}
      <circle r={r} fill="none" stroke="#fffaf0" strokeWidth="1.6" />
      <circle r={r * 0.3} fill="#121218" stroke="#e6c36f" strokeWidth="1.2" />
      <path d={`M0 ${-r - 6} L5 ${-r + 4} L-5 ${-r + 4} Z`} fill="#e6c36f" />
    </g>
  );
}

function SkipIcon({ color }: { color: string }) {
  return (
    <g fill="none" stroke={color} strokeWidth="6.5" strokeLinecap="round">
      <circle r="17" />
      <path d="M-11.5 11.5 L11.5 -11.5" />
    </g>
  );
}

function SkipAllIcon({ color }: { color: string }) {
  return (
    <g fill="none" stroke={color} strokeLinecap="round">
      <circle r="12.5" strokeWidth="5" />
      <path d="M-8.5 8.5 L8.5 -8.5" strokeWidth="5" />
      <circle r="21" strokeWidth="2.4" strokeDasharray="5 4.2" />
    </g>
  );
}

function ReverseIcon({ color }: { color: string }) {
  return (
    <g fill={color}>
      <path d="M-15 -3 C-15 -14 -5 -18 6 -15 L6 -21 L17 -11 L6 -1 L6 -7 C-1 -9 -7 -7 -7 -1 Z" />
      <path d="M15 3 C15 14 5 18 -6 15 L-6 21 L-17 11 L-6 1 L-6 7 C1 9 7 7 7 1 Z" />
    </g>
  );
}

function DiscardAllIcon({ color }: { color: string }) {
  return (
    <g>
      <rect x="-16" y="-15" width="17" height="24" rx="3" fill={color} opacity="0.45" transform="rotate(-14)" />
      <rect x="-8.5" y="-16" width="17" height="24" rx="3" fill={color} opacity="0.7" />
      <rect x="0" y="-15" width="17" height="24" rx="3" fill={color} transform="rotate(14)" />
      <path d="M0 11 L0 21 M-6 16 L0 22 L6 16" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );
}

function ColorMark({ color, x, y }: { color: Color; x: number; y: number }) {
  const fill = "#fffaf0";
  switch (color) {
    case "red":
      return <circle cx={x} cy={y} r="3.6" fill={fill} />;
    case "yellow":
      return <path d={`M${x} ${y - 4.2} L${x + 4.2} ${y + 3} L${x - 4.2} ${y + 3} Z`} fill={fill} />;
    case "green":
      return <rect x={x - 3.4} y={y - 3.4} width="6.8" height="6.8" fill={fill} />;
    case "blue":
      return <path d={`M${x} ${y - 4.5} L${x + 4} ${y} L${x} ${y + 4.5} L${x - 4} ${y} Z`} fill={fill} />;
  }
}

function ariaLabel(card: CardData): string {
  const color = card.color ? { red: "rouge", yellow: "jaune", green: "vert", blue: "bleu" }[card.color] : "";
  const names: Record<CardData["kind"], string> = {
    number: `${card.value}`,
    skip: "Passe ton tour",
    reverse: "Inversion",
    draw2: "+2",
    draw4: "+4",
    skipAll: "Passe pour tous",
    discardAll: "Défausse tout",
    wild: "Joker",
    wild4: "Joker +4",
    wildReverse4: "Joker inversion +4",
    wild6: "Joker +6",
    wild10: "Joker +10",
    wildRoulette: "Joker roulette",
  };
  return `${names[card.kind]} ${color}`.trim();
}

/** Definitions SVG partagees par toutes les cartes (a monter une seule fois). */
export function CardDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        {(Object.keys(FIELD) as (keyof typeof FIELD)[]).map((key) => (
          <linearGradient key={key} id={`card-f-${key}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={FIELD[key][0]} />
            <stop offset="0.45" stopColor={FIELD[key][1]} />
            <stop offset="1" stopColor={FIELD[key][2]} />
          </linearGradient>
        ))}
        <linearGradient id="card-sheen" x1="0" y1="0" x2="0.6" y2="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id="card-lines" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeOpacity="0.06" strokeWidth="2" />
        </pattern>
        <linearGradient id="card-back-field" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a1b30" />
          <stop offset="0.5" stopColor="#5a1124" />
          <stop offset="1" stopColor="#350815" />
        </linearGradient>
        <pattern id="card-back-rays" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 4 H8 M4 0 V8" stroke="#e6c36f" strokeOpacity="0.09" strokeWidth="0.8" />
        </pattern>
      </defs>
    </svg>
  );
}
