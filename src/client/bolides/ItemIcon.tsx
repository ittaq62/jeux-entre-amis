import type { ItemKind } from "../../shared/games/bolides/items.ts";

/** L'image de chaque objet, dans sa case */
export function ItemIcon({ item, size = 48 }: { item: ItemKind; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      {item === "turbo" && <Bottle x={24} />}
      {item === "turbo3" && (
        <>
          <Bottle x={13} small />
          <Bottle x={35} small />
          <Bottle x={24} />
        </>
      )}
      {item === "huile" && (
        <>
          <ellipse cx="24" cy="36" rx="18" ry="6" fill="#16161c" />
          <ellipse cx="20" cy="35" rx="8" ry="2.4" fill="#7fd9ff" opacity="0.45" />
          <path d="M24 6c6 9 10 14 10 19a10 10 0 0 1-20 0c0-5 4-10 10-19z" fill="#1d1d24" stroke="#e8e2d6" strokeWidth="2" />
          <path d="M19 24c0 3 2 6 5 6" stroke="#9fe6ff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      )}
      {item === "petard" && (
        <>
          <g transform="rotate(-35 24 26)">
            <rect x="17" y="12" width="14" height="26" rx="3" fill="#d8352a" stroke="#5e1610" strokeWidth="2" />
            <rect x="17" y="18" width="14" height="4" fill="#f4e7c8" />
            <rect x="17" y="28" width="14" height="4" fill="#f4e7c8" />
            <path d="M24 12c0-4 3-6 6-7" stroke="#3b2a1e" strokeWidth="2" fill="none" />
          </g>
          <circle cx="36" cy="6" r="4" fill="#ffd36b" />
          <circle cx="36" cy="6" r="2" fill="#fff6d6" />
        </>
      )}
      {item === "bouclier" && (
        <>
          <path d="M24 5l16 6v11c0 11-7 18-16 21C15 40 8 33 8 22V11z" fill="#2f80ed" stroke="#e8f2ff" strokeWidth="2.5" />
          <path d="M24 11l10 4v7c0 7-4 12-10 14z" fill="#7fc3ff" />
        </>
      )}
      {item === "klaxon" && (
        <>
          <path d="M8 20h7l14-9v26l-14-9H8z" fill="#f2c94c" stroke="#5c3d0a" strokeWidth="2" strokeLinejoin="round" />
          <path
            d="M34 17c3 2 4 4 4 7s-1 5-4 7M38 12c5 3 7 7 7 12s-2 9-7 12"
            stroke="#fff3c4"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/** Une bouteille de turbo, avec sa flamme */
function Bottle({ x, small = false }: { x: number; small?: boolean }) {
  const s = small ? 0.72 : 1;
  return (
    <g transform={`translate(${x} ${small ? 28 : 24}) scale(${s})`}>
      <path d="M-4 18c-3 6 0 10 4 12 4-2 7-6 4-12z" fill="#ff9a2e" />
      <path d="M-2 18c-1 4 0 6 2 8 2-2 3-4 2-8z" fill="#ffe08a" />
      <rect x="-7" y="-14" width="14" height="32" rx="5" fill="#38d6ff" stroke="#0b4a63" strokeWidth="2" />
      <rect x="-3" y="-20" width="6" height="7" rx="1.5" fill="#9aa1ab" stroke="#0b4a63" strokeWidth="1.5" />
      <rect x="-7" y="-2" width="14" height="6" fill="#0b4a63" opacity="0.35" />
    </g>
  );
}
