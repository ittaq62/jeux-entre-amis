// Les aperçus des articles du bowling à la boutique : la boule et son motif, la traînée qu'elle laisse, ce qui éclate sur
// un strike, la danse de son personnage, et ses quilles.

import type { CSSProperties } from "react";
import { BallSwatch } from "./LookPicker.tsx";

const FX_GLYPHS: Record<string, string[]> = {
  confettis: ["🎊", "🎉"],
  etoiles: ["✨", "⭐"],
  bulles: ["🫧", "🫧"],
  coeurs: ["💖", "💕"],
  feu: ["🎆", "🎇"],
  eclairs: ["⚡", "⚡"],
  pieces: ["🪙", "💰"],
};

const DANCE_GLYPHS: Record<string, string> = {
  poing: "✊",
  bras: "🙌",
  reverence: "🎩",
  pirouette: "🌀",
  danse: "💃",
  robot: "🤖",
  poulet: "🐔",
  genoux: "🧎",
  guitare: "🎸",
};

/** Les couleurs d'une traînée (du bout de la queue jusqu'à la boule) */
export const TRAIL_COLORS: Record<string, string[]> = {
  aucune: [],
  reflet: ["rgba(255,236,200,0)", "rgba(255,236,200,0.7)"],
  etincelles: ["#ffd75a", "#fff6c8"],
  bulles: ["#bfeaff", "#e8fbff"],
  notes: ["#ff8fbf", "#ffd166"],
  comete: ["rgba(120,200,255,0)", "#9fe0ff"],
  flammes: ["#ff5a1f", "#ffd166"],
  arcenciel: ["#ff4f4f", "#ffb347", "#ffe66b", "#5fd06a", "#4fa3ff", "#a06bff"],
};

function TrailSwatch({ trail, size }: { trail: string; size: number }) {
  const w = size * 1.8,
    h = size,
    y = h * 0.55,
    r = h * 0.2,
    bx = w - r * 1.6;
  const cols = TRAIL_COLORS[trail] ?? [];
  const along = (n: number) => Array.from({ length: n }, (_, i) => i / (n - 1));
  const xAt = (u: number) => w * 0.06 + (bx - r - w * 0.06) * u;
  let fx: React.ReactNode = null;
  if (trail === "arcenciel")
    fx = cols.map((c, i) => (
      <path
        key={c}
        d={`M${xAt(0)} ${y - r * 0.8 + i * r * 0.3}L${xAt(1)} ${y - r * 0.8 + i * r * 0.3}`}
        stroke={c}
        strokeWidth={r * 0.3}
        opacity={0.85}
      />
    ));
  else if (trail === "reflet" || trail === "comete")
    fx = (
      <path
        d={`M${xAt(0)} ${y}L${xAt(1)} ${y}`}
        stroke={cols[1]}
        strokeWidth={trail === "comete" ? r * 1.4 : r * 0.5}
        strokeLinecap="round"
        opacity={0.75}
      />
    );
  else if (trail === "notes")
    fx = along(4).map((u, i) => (
      <text key={i} x={xAt(u)} y={y + Math.sin(i * 2) * r} fontSize={r * 1.4} fill={cols[i % 2]} opacity={0.4 + u * 0.6}>
        ♪
      </text>
    ));
  else if (trail !== "aucune")
    fx = along(10).map((u, i) => (
      <circle
        key={i}
        cx={xAt(u) + Math.sin(i * 7) * 3}
        cy={y + Math.cos(i * 5) * r * 0.7}
        r={r * (trail === "bulles" ? 0.3 : 0.12 + u * 0.18)}
        fill={trail === "bulles" ? "rgba(190,235,255,0.25)" : cols[i % 2]}
        stroke={trail === "bulles" ? cols[0] : "none"}
        opacity={0.35 + u * 0.65}
      />
    ));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {fx}
      <circle cx={bx} cy={y} r={r} fill="#1d3c8f" />
      <circle cx={bx - r * 0.35} cy={y - r * 0.35} r={r * 0.25} fill="#fff" opacity="0.6" />
    </svg>
  );
}

/** Une quille de ce motif */
function PinSwatch({ skin, size }: { skin: string; size: number }) {
  const body: Record<string, [string, string]> = {
    classiques: ["#fbf9f4", "#d42a2a"],
    bois: ["#c98f55", "#7a2a16"],
    pois: ["#fbf7ee", "#2e7fe0"],
    rayees: ["#fbf7ee", "#d9262c"],
    neon: ["#1a1824", "#39ff88"],
    cristal: ["#dff4ff", "#3fb6ff"],
    dorees: ["#f2c94c", "#7d1414"],
  };
  const [fill, band] = body[skin] ?? body.classiques!;
  return (
    <svg width={size * 0.6} height={size} viewBox="-14 -40 28 56" aria-hidden="true">
      <path
        d="M0 -38C5 -38 6.5 -33 5.2 -27.5C4 -23 11 -17 11 -6C11 4 7 9 5.2 14H-5.2C-7 9 -11 4 -11 -6C-11 -17 -4 -23 -5.2 -27.5C-6.5 -33 -5 -38 0 -38Z"
        fill={fill}
        stroke="rgba(0,0,0,.35)"
        strokeWidth="1"
        opacity={skin === "cristal" ? 0.75 : 1}
      />
      {skin === "pois" && [-6, 0, 6].map((x) => <circle key={x} cx={x} cy={-6 + Math.abs(x)} r="2" fill="#f2b630" />)}
      {skin === "rayees" && <path d="M-11 0L11 -12M-11 8L11 -4" stroke={band} strokeWidth="3" />}
      <path
        d="M-4.8 -26.5H4.8M-5.4 -23.5H5.4"
        stroke={band}
        strokeWidth="1.8"
        style={skin === "neon" ? { filter: "drop-shadow(0 0 2px #39ff88)" } : undefined}
      />
      <path d="M-3.5 -34C-4.2 -30 -3 -27 -3.2 -25" stroke="#fff" strokeWidth="1.4" opacity="0.7" fill="none" />
    </svg>
  );
}

/** L'aperçu d'un article du bowling (petit dans la liste, grand dans la fenêtre d'achat) */
export function BowlingShopLook({ kind, id, big = false }: { kind: string; id: string; big?: boolean }) {
  const s = big ? 2.4 : 1;
  if (kind === "bowlmotif") return <BallSwatch look={{ color: "nuit", pattern: id }} size={52 * s} />;
  if (kind === "bowltrace") return <TrailSwatch trail={id} size={44 * s} />;
  if (kind === "bowlquilles") return <PinSwatch skin={id} size={60 * s} />;
  const glyphs = kind === "bowlfx" ? (FX_GLYPHS[id] ?? ["✨"]) : [DANCE_GLYPHS[id] ?? "🎳"];
  return (
    <span
      className="bw-shop-glyph"
      style={{ fontSize: 30 * s, lineHeight: 1, display: "inline-flex", gap: 2 } as CSSProperties}
      aria-hidden="true"
    >
      {glyphs.map((g, i) => (
        <span key={i} style={{ transform: i ? "translateY(-30%) scale(0.7)" : undefined }}>
          {g}
        </span>
      ))}
    </span>
  );
}
