import { useId, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { cardNumber, RARITY, type CardArt, type CardDef } from "../../shared/cards.ts";
import { SHIP_LENGTH } from "../../shared/games/naval/engine.ts";
import type { Card } from "../../shared/games/uno/cards.ts";
import { CardFace } from "../components/Card.tsx";
import { Logo } from "../components/ui.tsx";
import { CELL, hullFill, ShipShape, SkinDefs } from "../naval/ships.tsx";
import { ATLAS_COLS, ATLAS_KEYS, ATLAS_ROWS } from "./atlasKeys.ts";
import atlasUrl from "./cards-atlas.webp";
import "./cards.css";

const UNO_FACES: Record<Extract<CardArt, { kind: "uno" }>["face"], Card> = {
  zero: { id: 9001, kind: "number", color: "red", value: 0 },
  skip: { id: 9002, kind: "skip", color: "green" },
  reverse: { id: 9003, kind: "reverse", color: "blue" },
  draw2: { id: 9004, kind: "draw2", color: "yellow" },
  wild: { id: 9005, kind: "wild", color: null },
  wild4: { id: 9006, kind: "wild4", color: null },
};

function AtlasArt({ artKey }: { artKey: string }) {
  const i = ATLAS_KEYS.indexOf(artKey);
  const x = (i % ATLAS_COLS) / (ATLAS_COLS - 1);
  const y = Math.floor(i / ATLAS_COLS) / (ATLAS_ROWS - 1);
  return (
    <span
      className="tc-atlas"
      style={{
        backgroundImage: `url(${atlasUrl})`,
        backgroundSize: `${ATLAS_COLS * 100}% ${ATLAS_ROWS * 100}%`,
        backgroundPosition: `${x * 100}% ${y * 100}%`,
      }}
    />
  );
}

function ShipArt({ art }: { art: Extract<CardArt, { kind: "ship" }> }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const w = SHIP_LENGTH[art.ship] * CELL;
  const box = Math.max(40, w * 0.9);
  return (
    <svg className="tc-svg" viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} aria-hidden="true">
      <defs>
        <linearGradient id={`hull${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c3ced2" />
          <stop offset="100%" stopColor="#6d7b80" />
        </linearGradient>
        <linearGradient id={`wake${uid}`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <SkinDefs id={`skin${uid}`} />
      </defs>
      <g
        transform={`rotate(-34) translate(${-w / 2} -5)`}
        style={{ ["--hull" as string]: hullFill(`skin${uid}`, art.skin, `url(#hull${uid})`) }}
      >
        {/* Le sillage et l'écume : le navire avance */}
        <path d="M 3 2.5 L -15 0.5 L -15 9.5 L 3 7.5 Z" fill={`url(#wake${uid})`} />
        <ellipse cx={w / 2} cy={5} rx={w / 2 + 2.4} ry={6.8} fill="rgba(255,255,255,0.13)" />
        <ShipShape kind={art.ship} skin={art.skin} />
      </g>
    </svg>
  );
}

const BRICK_SHAPES: Record<"O" | "T" | "S" | "L" | "I", [number, number][]> = {
  O: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  T: [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  L: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
};

const BRICK_COLORS = {
  O: ["#ffd77a", "#d39a2c", "#7c5310"],
  T: ["#b68aea", "#7d45b5", "#3f1d66"],
  S: ["#5fd3a2", "#228a63", "#0d4a33"],
  L: ["#ff9e78", "#d9643f", "#7f2e17"],
  I: ["#7aa6f0", "#2c5fb8", "#142d63"],
  gris: ["#7b8279", "#4d524c", "#272a26"],
};

function Brick({ x, y, tones }: { x: number; y: number; tones: string[] }) {
  return (
    <g transform={`translate(${x * 10} ${y * 10})`}>
      <rect x="0.3" y="0.3" width="9.4" height="9.4" rx="1.6" fill={tones[2]} />
      <rect x="0.3" y="0.3" width="9.4" height="8.4" rx="1.6" fill={tones[1]} />
      <rect x="1.5" y="1.3" width="7" height="2.4" rx="1.1" fill={tones[0]} opacity="0.85" />
    </g>
  );
}

function BrickArt({ piece }: { piece: Extract<CardArt, { kind: "brick" }>["piece"] }) {
  if (piece === "gris") {
    const holes = [7, 2, 5, 0, 8];
    return (
      <svg className="tc-svg" viewBox="-6 -8 112 66" aria-hidden="true">
        {holes.flatMap((gap, row) =>
          Array.from({ length: 10 }, (_, col) =>
            col === gap ? null : <Brick key={`${row}-${col}`} x={col} y={row} tones={BRICK_COLORS.gris} />,
          ),
        )}
      </svg>
    );
  }
  const cells = BRICK_SHAPES[piece];
  const w = Math.max(...cells.map(([x]) => x)) + 1;
  const h = Math.max(...cells.map(([, y]) => y)) + 1;
  const size = Math.max(w, h) + 1.1;
  return (
    <svg className="tc-svg" viewBox={`${w * 5 - size * 5} ${h * 5 - size * 5} ${size * 10} ${size * 10}`} aria-hidden="true">
      <g transform={`rotate(-12 ${w * 5} ${h * 5})`}>
        {cells.map(([x, y]) => (
          <Brick key={`${x}-${y}`} x={x} y={y} tones={BRICK_COLORS[piece]} />
        ))}
      </g>
    </svg>
  );
}

function Stick({ x, y, r = 0 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x="-13" y="-42" width="26" height="84" rx="9" fill="#c23a2f" />
      <rect x="-9" y="-40" width="6" height="80" rx="3" fill="#ec7a68" opacity="0.65" />
      <rect x="6" y="-40" width="5" height="80" rx="2.5" fill="#6e1b15" opacity="0.5" />
    </g>
  );
}

const Spark = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle r="15" fill="#ffd36b" opacity="0.4" />
    <path d="M0 -16 L4 -5 L15 -6 L6 2 L11 13 L0 6 L-11 13 L-6 2 L-15 -6 L-4 -5 Z" fill="#fff0a8" stroke="#ff9a3c" strokeWidth="1.4" />
  </g>
);

function MecheArt({ subject }: { subject: Extract<CardArt, { kind: "meche" }>["subject"] }) {
  return (
    <svg className="tc-svg" viewBox="-60 -60 120 120" aria-hidden="true">
      {subject === "allumette" && (
        <g transform="rotate(24)">
          <rect x="-4.5" y="-14" width="9" height="66" rx="3" fill="#ecd29d" stroke="#8d6a3e" strokeWidth="1" />
          <ellipse cx="0" cy="-19" rx="8" ry="11" fill="#d8402f" stroke="#7d1f19" strokeWidth="1" />
          <path d="M0 -58 C12 -44 13 -34 7 -25 C4 -21 -4 -21 -7 -25 C-13 -34 -8 -44 0 -58 Z" fill="#ffb347" />
          <path d="M0 -46 C6 -38 6 -32 3 -27 C1 -25 -2 -25 -3 -27 C-6 -32 -4 -38 0 -46 Z" fill="#fff0a8" />
        </g>
      )}
      {subject === "dynamite" && (
        <g transform="rotate(-14) translate(0 8)">
          <Stick x={-24} y={6} />
          <Stick x={24} y={6} />
          <Stick x={0} y={2} />
          <rect x="-40" y="-8" width="80" height="11" rx="2.5" fill="#3a2f28" />
          <path d="M0 -40 C-3 -52 12 -50 16 -58" fill="none" stroke="#6a5a48" strokeWidth="3.4" strokeLinecap="round" />
          <Spark x={18} y={-59} s={0.8} />
        </g>
      )}
      {subject === "meche" && (
        <g>
          <path
            d="M-52 40 C-20 56 -38 6 -4 14 S22 40 28 8 S34 -26 42 -36"
            fill="none"
            stroke="#5e4a36"
            strokeWidth="7.5"
            strokeLinecap="round"
          />
          <path
            d="M-52 40 C-20 56 -38 6 -4 14 S22 40 28 8 S34 -26 42 -36"
            fill="none"
            stroke="#c9ad80"
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeDasharray="4 5"
          />
          <Spark x={43} y={-38} />
        </g>
      )}
      {subject === "mot" && (
        <g>
          <circle r="42" fill="#f6e7c8" stroke="#a8884f" strokeWidth="3" />
          <circle r="35" fill="none" stroke="#a8884f" strokeWidth="1" strokeDasharray="3 3" />
          <text y="9" textAnchor="middle" fontFamily="var(--font-card)" fontWeight="800" fontSize="34" fill="#7d1f19">
            ?OU?
          </text>
        </g>
      )}
      {subject === "boum" && (
        <g>
          <path
            d="M0 -56 L12 -28 L40 -44 L28 -14 L56 -6 L30 8 L46 36 L14 26 L8 56 L-10 30 L-36 46 L-28 16 L-56 8 L-30 -6 L-44 -36 L-14 -26 Z"
            fill="#ffb347"
            stroke="#d8402f"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <text y="9" textAnchor="middle" fontFamily="var(--font-title)" fontSize="25" fill="#7d1f19" transform="rotate(-8)">
            BOUM !
          </text>
        </g>
      )}
    </svg>
  );
}

function Art({ art, width }: { art: CardArt; width: number }) {
  if (art.kind === "atlas") return <AtlasArt artKey={art.key} />;
  if (art.kind === "ship") return <ShipArt art={art} />;
  if (art.kind === "brick") return <BrickArt piece={art.piece} />;
  if (art.kind === "meche") return <MecheArt subject={art.subject} />;
  return (
    <span className="tc-uno">
      <CardFace card={UNO_FACES[art.face]} width={Math.round(width * 0.42)} />
    </span>
  );
}

const em = (width: number) => ({ fontSize: `${width / 20}px` }) as CSSProperties;

export function CardBackFace({ width }: { width: number }) {
  return (
    <div className="tc-back" style={em(width)}>
      <div className="tc-back-inner">
        <Logo size={Math.round(width * 0.16)} withName={false} />
        <span className="tc-back-title">La Tablée</span>
      </div>
    </div>
  );
}

/** Une carte de l'album. `tilt` : elle suit le doigt ou la souris, et ses reflets avec. */
export function TradingCard({
  card,
  width,
  missing = false,
  tilt = false,
}: {
  card: CardDef;
  width: number;
  missing?: boolean;
  tilt?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const info = RARITY[card.rarity];
  const small = width < 150;
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !tilt) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(x - 0.5) * 22}deg`);
    el.style.setProperty("--rx", `${(0.5 - y) * 18}deg`);
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  };
  return (
    <div
      ref={ref}
      className={`tc rar-${card.rarity} fam-${card.family} ${missing ? "is-missing" : ""} ${small ? "is-small" : ""} ${tilt ? "is-tilt" : ""}`}
      style={em(width)}
      onPointerMove={move}
      onPointerLeave={leave}
      role="img"
      aria-label={`${card.name}, carte ${info.name.toLowerCase()}${missing ? ", pas encore dans ton album" : ""}`}
    >
      <div className="tc-inner">
        <div className="tc-head">
          <span className="tc-name">{card.name}</span>
          {!small && <span className="tc-no num">{cardNumber(card.id)}</span>}
        </div>
        <div className="tc-art">
          {(card.rarity === "legendaire" || card.rarity === "epique") && !missing && <span className="tc-rays" />}
          <span className="tc-subject">
            <Art art={card.art} width={width} />
          </span>
          {!missing && <span className="tc-shine" aria-hidden="true" />}
        </div>
        <div className="tc-rarity">
          <span className="tc-gems" aria-hidden="true">
            {Array.from({ length: info.gems }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          {!small && <span className="tc-rname">{info.name}</span>}
        </div>
        {!small && <p className="tc-quote">{card.quote}</p>}
      </div>
    </div>
  );
}
