import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { CARDS, cardNumber, RARITY, type CardArt, type CardDef, type CardFamily } from "../../shared/cards.ts";
import { SHIP_LENGTH } from "../../shared/games/naval/engine.ts";
import type { Card } from "../../shared/games/uno/cards.ts";
import { CulbuteCardArt } from "../culbute/CulbuteCardArt.tsx";
import { MinigolfCardArt } from "../minigolf/MinigolfCardArt.tsx";
import { BowlingCardArt } from "../bowling/BowlingCardArt.tsx";
import { BillardCardArt } from "../billard/BillardCardArt.tsx";
import { CourCardArt } from "../cour/CourCardArt.tsx";
import { CardFace } from "../components/Card.tsx";
import { Icon, type IconName } from "../components/Icon.tsx";
import { Logo } from "../components/ui.tsx";
import { CELL, hullFill, ShipShape, SkinDefs } from "../naval/ships.tsx";
import { ATLAS_COLS, ATLAS_KEYS, ATLAS_ROWS } from "./atlasKeys.ts";
import atlasUrl from "./cards-atlas.webp";
import smallAtlasUrl from "./cards-atlas-petit.webp";
import "./cards.css";
import { fr } from "../../shared/typo.ts";

const UNO_FACES: Record<Extract<CardArt, { kind: "uno" }>["face"], Card> = {
  zero: { id: 9001, kind: "number", color: "red", value: 0 },
  skip: { id: 9002, kind: "skip", color: "green" },
  reverse: { id: 9003, kind: "reverse", color: "blue" },
  draw2: { id: 9004, kind: "draw2", color: "yellow" },
  wild: { id: 9005, kind: "wild", color: null },
  wild4: { id: 9006, kind: "wild4", color: null },
};

/**
 * Une case de la planche des sujets en 3D. Une petite carte (l'accueil, les vignettes) prend la planche à demi-taille,
 * deux fois plus légère, quand elle suffit à la finesse de l'écran ; sinon, la planche entière.
 */
export function AtlasArt({ artKey, width }: { artKey: string; width?: number }) {
  const small = width !== undefined && width * (window.devicePixelRatio || 1) <= 200;
  const i = ATLAS_KEYS.indexOf(artKey);
  const x = (i % ATLAS_COLS) / (ATLAS_COLS - 1);
  const y = Math.floor(i / ATLAS_COLS) / (ATLAS_ROWS - 1);
  return (
    <span
      className="tc-atlas"
      style={{
        backgroundImage: `url(${small ? smallAtlasUrl : atlasUrl})`,
        backgroundSize: `${ATLAS_COLS * 100}% ${ATLAS_ROWS * 100}%`,
        backgroundPosition: `${x * 100}% ${y * 100}%`,
      }}
    />
  );
}

/**
 * Capitale Builder : le bâtiment est photographié en 3D à l'ouverture de l'album, sur son socle comme les autres
 * (la 3D se charge à part, seulement si une de ces cartes s'affiche)
 */
function BuilderArt({ subject }: { subject: Extract<CardArt, { kind: "builder" }>["subject"] }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    void import("../capitale/scene/thumbs.ts").then((m) => live && setSrc(m.albumThumb(subject)));
    return () => {
      live = false;
    };
  }, [subject]);
  return <span className="tc-atlas" style={src ? { backgroundImage: `url(${src})`, backgroundSize: "contain" } : undefined} />;
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

/** Les dessins de l'Escarmouche : l'équipement du soldat et les lieux du combat */
function EscarmoucheArt({ subject }: { subject: Extract<CardArt, { kind: "escarmouche" }>["subject"] }) {
  const olive = "#5f6648";
  const dark = "#2b2d25";
  const metal = "#3a3d42";
  return (
    <svg className="tc-svg" viewBox="-60 -60 120 120" aria-hidden="true">
      {subject === "casque" && (
        <g>
          <ellipse cx="0" cy="34" rx="44" ry="7" fill="rgba(0,0,0,.3)" />
          <path d="M-38 22C-38 -14 -20 -32 0 -32C20 -32 38 -14 38 22Z" fill={olive} stroke={dark} strokeWidth="2.5" />
          <path d="M-48 22H48L42 32H-42Z" fill="#4a5036" stroke={dark} strokeWidth="2.5" />
          <path d="M-32 8H32" stroke="#c8392d" strokeWidth="7" />
          <path d="M-20 -20C-12 -26 -4 -27 2 -27" stroke="#fbf5e6" strokeWidth="3" strokeLinecap="round" opacity="0.4" fill="none" />
        </g>
      )}
      {subject === "douille" && (
        <g transform="rotate(-28)">
          <rect x="-10" y="-30" width="20" height="56" rx="2" fill="#c99a3a" stroke="#7d5a1c" strokeWidth="2" />
          <rect x="-12" y="22" width="24" height="7" rx="1.5" fill="#b0832c" stroke="#7d5a1c" strokeWidth="2" />
          <path d="M-6 -24V18" stroke="#f3d48a" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
          <path d="M22 -40l8 -8M30 -30l10 -2M12 -44l2 -10" stroke="#ffe1a8" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      {subject === "sacs" && (
        <g>
          {[
            [-30, 22],
            [0, 22],
            [30, 22],
            [-15, 2],
            [15, 2],
            [0, -18],
          ].map(([x, y], i) => (
            <rect key={i} x={x! - 15} y={y! - 9} width="30" height="18" rx="8" fill="#a68a5c" stroke="#5e4a2c" strokeWidth="2" />
          ))}
          <path d="M-50 32H50" stroke="#5e4a2c" strokeWidth="2" />
        </g>
      )}
      {subject === "pistolet" && (
        // De profil, le canon à droite : la culasse et ses rainures, la carcasse, le pontet et la détente, la crosse
        // inclinée aux plaquettes de bois quadrillées, le talon du chargeur, le chien, la hausse et le guidon
        <g transform="translate(-2 -2)">
          <ellipse cx="-2" cy="50" rx="42" ry="4.5" fill="rgba(0,0,0,.25)" />
          <path
            d="M-43 -4H-14L-20 38Q-21 42 -25 42H-44Q-49 42 -48.5 37L-43 -4Z"
            fill="#6b4a2c"
            stroke="#16181b"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M-38 2H-19.5L-24 34H-42Z" fill="#4e3420" />
          {[6, 12, 18, 24, 30].map((y) => (
            <path key={y} d={`M${-41 + y * 0.12} ${y}L${-21 - y * 0.12} ${y - 5}`} stroke="#2d1d10" strokeWidth="1" opacity="0.7" />
          ))}
          <rect x="-48" y="40" width="26" height="5" rx="1.5" fill="#26292d" stroke="#16181b" strokeWidth="2" />
          <path d="M14 -5V5Q14 15 4 15H-5Q-12 15 -12.5 7" fill="none" stroke="#26292d" strokeWidth="4" strokeLinecap="round" />
          <path d="M1 -4Q-1 4 4 9" fill="none" stroke="#16181b" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M-44 -13H32V-6H14V-3H-44Z" fill="#2f3237" stroke="#16181b" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M-44 -29H37L45 -23V-12H-44Z" fill={metal} stroke="#16181b" strokeWidth="2.5" strokeLinejoin="round" />
          {[-38, -34, -30, -26].map((x) => (
            <path key={x} d={`M${x} -26V-15`} stroke="#16181b" strokeWidth="1.6" />
          ))}
          <rect x="0" y="-26" width="15" height="6" rx="1" fill="#15171a" />
          <path d="M-36 -27H33" stroke="#8a9098" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
          <rect x="-43" y="-33" width="6" height="4" fill="#26292d" />
          <rect x="33" y="-32" width="4" height="3" fill="#26292d" />
          <path d="M-44 -27L-50 -31L-49 -23Z" fill="#26292d" stroke="#16181b" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="45" cy="-17.5" r="2.2" fill="#0c0d0f" />
          {[-8, 0, 8].map((dy, i) => (
            <path key={i} d={`M50 ${-17.5 + dy * 0.3}l8 ${dy * 0.8}`} stroke="#ffd98a" strokeWidth="2" strokeLinecap="round" />
          ))}
        </g>
      )}
      {subject === "pompe" && (
        <g transform="rotate(-12)">
          <path d="M-54 6L-24 0L-18 -6H8V8H-14L-22 18H-50Z" fill="#6b4a2c" stroke={dark} strokeWidth="2" />
          <rect x="8" y="-8" width="48" height="7" fill={metal} stroke="#16181b" strokeWidth="1.5" />
          <rect x="12" y="1" width="26" height="9" rx="2" fill="#6b4a2c" stroke={dark} strokeWidth="2" />
          {[-8, 0, 8].map((dy, i) => (
            <path key={i} d={`M58 ${-4 + dy * 0.3}l14 ${dy}`} stroke="#ffd98a" strokeWidth="2" strokeLinecap="round" />
          ))}
        </g>
      )}
      {subject === "grenade" && (
        <g>
          <ellipse cx="0" cy="40" rx="26" ry="5" fill="rgba(0,0,0,.3)" />
          <rect x="-20" y="-16" width="40" height="52" rx="16" fill="#4d5a35" stroke={dark} strokeWidth="2.5" />
          {[-4, 8, 20].map((y) => (
            <path key={y} d={`M-19 ${y}H19`} stroke={dark} strokeWidth="1.5" opacity="0.6" />
          ))}
          <rect x="-8" y="-28" width="16" height="12" fill={metal} stroke="#16181b" strokeWidth="2" />
          <path d="M8 -26C24 -30 28 -10 18 -2" fill="none" stroke="#9aa0a6" strokeWidth="3" strokeLinecap="round" />
          <circle cx="-14" cy="-36" r="6" fill="none" stroke="#9aa0a6" strokeWidth="2.5" />
        </g>
      )}
      {subject === "couteau" && (
        <g transform="rotate(-35)">
          <path d="M-6 -50C4 -40 6 -18 6 4H-6Z" fill="#c4c9ce" stroke="#6e737a" strokeWidth="2" />
          <path d="M-2 -44V0" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
          <rect x="-14" y="4" width="28" height="6" rx="2" fill={metal} />
          <rect x="-7" y="10" width="14" height="38" rx="4" fill="#3b2a1c" stroke="#1d140c" strokeWidth="2" />
        </g>
      )}
      {subject === "lunette" && (
        <g>
          <circle r="44" fill="#1a2028" stroke="#0b0d10" strokeWidth="5" />
          <circle r="38" fill="#4d6a7a" opacity="0.55" />
          <path d="M-38 0H-6M6 0H38M0 -38V-6M0 6V38" stroke="#0b0d10" strokeWidth="1.6" />
          <circle r="2.5" fill="#d8402f" />
          <path d="M-20 18l8 -12 6 6 10 -16 16 22Z" fill="#2e2724" opacity="0.8" />
        </g>
      )}
      {subject === "drapeau" && (
        <g>
          <rect x="-26" y="-48" width="4" height="96" fill="#2f2f2f" />
          <path d="M-22 -46C0 -54 10 -36 36 -44V-6C10 2 0 -16 -22 -8Z" fill="#c8392d" stroke="#7d1f19" strokeWidth="2" />
          <ellipse cx="-24" cy="46" rx="18" ry="4" fill="#3f7fd8" />
        </g>
      )}
      {subject === "clocher" && (
        <g>
          <path d="M-40 50V10L-20 -6V50Z" fill="#7b7262" />
          <rect x="-18" y="-14" width="36" height="64" fill="#9a9080" stroke="#5c5548" strokeWidth="2" />
          <path d="M-22 -14L0 -56L22 -14Z" fill="#4a5058" stroke="#2c3036" strokeWidth="2" />
          <circle cx="0" cy="6" r="9" fill="#efe8d6" stroke="#5c5548" strokeWidth="2" />
          <path d="M0 6V0M0 6h5" stroke="#1d1d1d" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="-6" y="22" width="12" height="16" rx="6" fill="#2b2620" />
          <circle cx="2" cy="28" r="1.6" fill="#ffd28a" />
          <path d="M8 26l26 -10" stroke="#ffe1a8" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}
      {subject === "medaille" && (
        <g>
          <path d="M-18 -56H-2L6 -14H-10Z" fill="#c8392d" />
          <path d="M18 -56H2L-6 -14H10Z" fill="#3f7fd8" />
          <circle cx="0" cy="12" r="30" fill="#e8c25a" stroke="#9a7420" strokeWidth="3" />
          <circle cx="0" cy="12" r="22" fill="none" stroke="#b58a24" strokeWidth="2" />
          <path d="M0 -2L4 8H15L6 14L9 25L0 18L-9 25L-6 14L-15 8H-4Z" fill="#fff0a8" stroke="#9a7420" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}

function Art({ art, width }: { art: CardArt; width: number }) {
  if (art.kind === "atlas") return <AtlasArt artKey={art.key} width={width} />;
  if (art.kind === "ship") return <ShipArt art={art} />;
  if (art.kind === "brick") return <BrickArt piece={art.piece} />;
  if (art.kind === "meche") return <MecheArt subject={art.subject} />;
  if (art.kind === "culbute") return <CulbuteCardArt subject={art.subject} />;
  if (art.kind === "escarmouche") return <EscarmoucheArt subject={art.subject} />;
  if (art.kind === "minigolf") return <MinigolfCardArt subject={art.subject} />;
  if (art.kind === "bowling") return <BowlingCardArt subject={art.subject} />;
  if (art.kind === "billard") return <BillardCardArt subject={art.subject} />;
  if (art.kind === "cour") return <CourCardArt subject={art.subject} />;
  if (art.kind === "builder") return <BuilderArt subject={art.subject} />;
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

const FAMILY_ICON: Record<CardFamily, IconName> = {
  habitues: "users",
  flotte: "target",
  capitale: "build",
  circuit: "zap",
  tapis: "cards",
  briques: "layers",
  meche: "flame",
  crampons: "ball",
  culbute: "smile",
  escarmouche: "shield",
  minigolf: "flag",
  bowling: "target",
  billard: "target",
  cour: "smile",
};

/** Six couleurs de mur pour les Habitués, données dans l'ordre pour que deux voisins n'aient jamais la même */
const WALL = new Map(CARDS.filter((c) => c.family === "habitues").map((c, i) => [c.id, i % 6]));

/**
 * Une carte de l'album. `tilt` : elle suit le doigt ou la souris, et bouge doucement toute seule le reste du temps.
 * `still` : sans animation, pour les longues listes de cartes.
 */
export function TradingCard({
  card,
  width,
  missing = false,
  tilt = false,
  still = false,
}: {
  card: CardDef;
  width: number;
  missing?: boolean;
  tilt?: boolean;
  still?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const held = useRef(false);
  const info = RARITY[card.rarity];
  const small = width < 150;

  useEffect(() => {
    const el = ref.current;
    if (!el || !tilt || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (held.current) return;
      const t = (now - t0) / 1000;
      el.style.setProperty("--ry", `${Math.sin(t * 0.9) * 10}deg`);
      el.style.setProperty("--rx", `${Math.cos(t * 0.7) * 6}deg`);
      el.style.setProperty("--mx", `${50 + Math.sin(t * 0.9) * 38}%`);
      el.style.setProperty("--my", `${36 + Math.cos(t * 0.7) * 26}%`);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tilt]);

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !tilt) return;
    held.current = true;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(x - 0.5) * 24}deg`);
    el.style.setProperty("--rx", `${(0.5 - y) * 20}deg`);
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
  };
  const leave = () => {
    held.current = false;
  };
  // Chaque bateau a sa mer : au large, ils ne se ressemblent plus
  const backdrop = card.art.kind !== "ship" ? "" : card.art.skin === "marine" ? `sea-${card.art.ship}` : `sk-${card.art.skin}`;
  const tone = card.family === "habitues" ? `tone-${WALL.get(card.id)}` : "";
  return (
    <div
      ref={ref}
      className={`tc rar-${card.rarity} fam-${card.family} ${tone} ${missing ? "is-missing" : ""} ${small ? "is-small" : ""} ${tilt ? "is-tilt" : ""} ${still ? "is-still" : ""}`}
      style={em(width)}
      onPointerMove={move}
      onPointerLeave={leave}
      role="img"
      aria-label={`${card.name}, carte ${info.name.toLowerCase()}${missing ? ", pas encore dans ton album" : ""}`}
    >
      <div className="tc-inner">
        <div className="tc-head">
          <span className={`tc-name ${card.name.length > 16 ? "is-long" : ""}`}>{card.name}</span>
          {!small && (
            <span className="tc-corner">
              <Icon name={FAMILY_ICON[card.family]} size={Math.round(width * 0.075)} />
              <span className="tc-no num">{cardNumber(card.id)}</span>
            </span>
          )}
        </div>
        <div className={`tc-art ${backdrop}`}>
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
        {!small && <p className="tc-quote">{fr(card.quote)}</p>}
      </div>
    </div>
  );
}
