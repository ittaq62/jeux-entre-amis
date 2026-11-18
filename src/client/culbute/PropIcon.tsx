import { PALETTES } from "../../shared/games/culbute/fighters.ts";
import type { HabitueId } from "../../shared/games/culbute/model.ts";

/** L'accessoire de chaque style, en petit dessin */
export function PropIcon({ style, size = 28 }: { style: HabitueId; size?: number }) {
  const c = PALETTES[style].dimanche;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="cb-prop-icon">
      {style === "ginette" && (
        <>
          <path d="M11 12 a5 5 0 0 1 10 0" fill="none" stroke="#2a2a30" strokeWidth="2" />
          <rect x="6" y="12" width="20" height="14" rx="4" fill={c.prop} />
          <rect x="6" y="12" width="20" height="4" fill={c.accent} />
          <circle cx="16" cy="16" r="1.6" fill="#f2c94c" />
        </>
      )}
      {style === "marcel" && (
        <g stroke="#2a2a30" strokeWidth="2" fill="none">
          <path d="M9 4 L9 28 M23 4 L23 28" />
          <rect x="9" y="5" width="14" height="7" fill={c.prop} />
          <path d="M8 18 L24 18" stroke={c.prop} strokeWidth="4" />
        </g>
      )}
      {style === "huguette" && (
        <>
          <circle cx="20" cy="21" r="7" fill={c.prop} />
          <path d="M15 19 q5 -4 10 0 M14 23 q6 -3 12 1" stroke="#c2185b" strokeWidth="1.2" fill="none" />
          <path d="M5 5 L18 22 M9 3 L16 23" stroke="#cfcac0" strokeWidth="1.6" />
        </>
      )}
      {style === "raymond" && (
        <>
          <circle cx="12" cy="18" r="8" fill="#a9b2bc" stroke="#6d7680" />
          <path d="M6 15 q6 3 12 0" stroke="#6d7680" fill="none" />
          <circle cx="24" cy="24" r="3" fill="#e2c26a" />
        </>
      )}
      {style === "simone" && (
        <>
          <path d="M16 27 L4 10 A14 14 0 0 1 28 10 Z" fill={c.prop} />
          <path d="M16 27 L8 7 M16 27 L16 5 M16 27 L24 7" stroke={c.accent} strokeWidth="1.2" />
        </>
      )}
      {style === "lucien" && (
        <>
          <rect x="3" y="9" width="6" height="15" rx="1.5" fill={c.prop} />
          <rect x="23" y="9" width="6" height="15" rx="1.5" fill={c.prop} />
          <path d="M9 10 L11 23 L13 10 L15 23 L17 10 L19 23 L21 10 L23 23" stroke="#2b2b33" fill={c.accent} strokeWidth="1" />
        </>
      )}
    </svg>
  );
}
