import { memo } from "react";

export type ChipTone = "red" | "blue" | "green" | "black" | "ivory";

const TONES: Record<ChipTone, { base: string; edge: string; ink: string }> = {
  red: { base: "#a3202d", edge: "#f4ead2", ink: "#7a1420" },
  blue: { base: "#1f4f8f", edge: "#f4ead2", ink: "#173c6e" },
  green: { base: "#1d6b45", edge: "#f4ead2", ink: "#14502f" },
  black: { base: "#1c1a18", edge: "#d9b45a", ink: "#1c1a18" },
  ivory: { base: "#e9dfc6", edge: "#8c1d2c", ink: "#5b1420" },
};

/** Jeton de casino : bord a encoches, centre ivoire grave d'un chiffre ou d'un mot court. */
export const Chip = memo(function Chip({
  label,
  tone = "red",
  size = 48,
  muted = false,
  title,
}: {
  label: string;
  tone?: ChipTone;
  size?: number;
  muted?: boolean;
  title?: string;
}) {
  const t = TONES[tone];
  const notches = Array.from({ length: 8 }, (_, i) => i * 45);
  const fontSize = label.length >= 4 ? 13 : label.length === 3 ? 16 : 20;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`chip-token ${muted ? "is-muted" : ""}`}
      role="img"
      aria-label={title ?? label}
    >
      <circle cx="32" cy="33.5" r="30" fill="rgba(0,0,0,0.35)" />
      <circle cx="32" cy="32" r="30" fill={t.base} />
      {notches.map((a) => (
        <rect key={a} x="28" y="2" width="8" height="9" rx="1.2" fill={t.edge} transform={`rotate(${a} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="21.5" fill="none" stroke={t.edge} strokeWidth="1" strokeDasharray="2.2 2.6" opacity="0.8" />
      <circle cx="32" cy="32" r="18" fill="#f6efdc" />
      <circle cx="32" cy="32" r="18" fill="none" stroke={t.base} strokeWidth="1.2" />
      <text x="32" y={32 + fontSize * 0.35} textAnchor="middle" fontSize={fontSize} fill={t.ink} className="chip-token-label">
        {label}
      </text>
    </svg>
  );
});
