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
      {item === "fusee" && (
        <g transform="rotate(40 24 24)">
          <path d="M20 34c-2 6 1 9 4 11 3-2 6-5 4-11z" fill="#ff9a2e" />
          <path d="M24 3c6 5 8 12 8 20v12H16V23c0-8 2-15 8-20z" fill="#f2f0ea" stroke="#5e1610" strokeWidth="2" />
          <path d="M24 3c6 5 8 12 8 15H16c0-3 2-10 8-15z" fill="#d8352a" />
          <circle cx="24" cy="22" r="3.4" fill="#7fc3ff" stroke="#5e1610" strokeWidth="1.5" />
          <path d="M16 26l-6 9h6zM32 26l6 9h-6z" fill="#d8352a" stroke="#5e1610" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      )}
      {item === "arc" && (
        <>
          {["#e23b3f", "#f2994a", "#f2c94c", "#27ae60", "#2f80ed", "#9b51e0"].map((c, i) => (
            <path
              key={c}
              d={`M${6 + i * 2.6} 38a${18 - i * 2.6} ${18 - i * 2.6} 0 0 1 ${36 - i * 5.2} 0`}
              stroke={c}
              strokeWidth="2.8"
              fill="none"
            />
          ))}
          <path d="M24 12l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5-3.7-3.4 5-.6z" fill="#fff6c8" stroke="#a87b16" strokeWidth="1" />
        </>
      )}
      {item === "bowling" && (
        <>
          <circle cx="24" cy="24" r="19" fill="#2a1a7a" stroke="#d9d2ff" strokeWidth="2" />
          <path d="M12 16c6-7 15-9 23-5" stroke="#6f5fd0" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="19" cy="26" r="3" fill="#0b0720" />
          <circle cx="28" cy="26" r="3" fill="#0b0720" />
          <circle cx="23.5" cy="34" r="3" fill="#0b0720" />
        </>
      )}
      {item === "tarte" && (
        <>
          <ellipse cx="24" cy="34" rx="20" ry="8" fill="#c88a42" stroke="#6e4516" strokeWidth="2" />
          <path d="M6 31c0-9 8-17 18-17s18 8 18 17c-5 4-31 4-36 0z" fill="#fff8ec" stroke="#d9c9ae" strokeWidth="2" />
          <path d="M14 24c3-3 5-1 7-3s6-3 9 0 4 3 6 3" stroke="#e6d8c2" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="24" cy="12" r="4.4" fill="#d3202e" stroke="#7a0f18" strokeWidth="1.5" />
        </>
      )}
      {item === "ressort" && (
        <>
          <rect x="13" y="38" width="22" height="5" rx="2" fill="#5a5f68" />
          <path
            d="M16 34h16M16 34c12-1 18-4 16-7s-14-2-16-5 4-6 16-7M32 15H16"
            stroke="#c9ced6"
            strokeWidth="3.4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="13" y="8" width="22" height="6" rx="2" fill="#d8352a" stroke="#6b1a13" strokeWidth="1.5" />
        </>
      )}
      {item === "geant" && (
        <>
          <path
            d="M19 5h10v9c7 4 11 10 11 17 0 8-7 13-16 13S8 39 8 31c0-7 4-13 11-17z"
            fill="#8c3fe0"
            stroke="#dcc6ff"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <rect x="17" y="3" width="14" height="6" rx="2" fill="#b98a4a" stroke="#5e3f17" strokeWidth="1.5" />
          <circle cx="18" cy="31" r="4" fill="#d6b4ff" />
          <circle cx="28" cy="26" r="2.6" fill="#d6b4ff" />
          <circle cx="30" cy="35" r="2" fill="#d6b4ff" />
        </>
      )}
      {item === "orage" && (
        <>
          <path
            d="M13 26a8 8 0 0 1-1-16 11 11 0 0 1 21-2 9 9 0 0 1 2 18z"
            fill="#59616e"
            stroke="#dbe2ea"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M25 18l-9 14h7l-3 12 12-16h-7l4-10z" fill="#ffe066" stroke="#8a6a00" strokeWidth="1.5" strokeLinejoin="round" />
        </>
      )}
      {item === "aimant" && (
        <>
          <path
            d="M9 8h10v16a5 5 0 0 0 10 0V8h10v16a15 15 0 0 1-30 0z"
            fill="#d8352a"
            stroke="#6b1a13"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M9 8h10v8H9zM29 8h10v8H29z" fill="#e8ecf1" stroke="#6b1a13" strokeWidth="2" />
          <circle cx="24" cy="44" r="3" fill="#ffd23a" stroke="#8a6a00" strokeWidth="1" />
        </>
      )}
      {item === "bombe" && (
        <>
          <circle cx="21" cy="29" r="15" fill="#1a1b20" stroke="#e8e2d6" strokeWidth="2" />
          <path d="M29 17l5-6" stroke="#9a8a5c" strokeWidth="3" strokeLinecap="round" />
          <circle cx="36" cy="9" r="5" fill="#ffb347" />
          <circle cx="36" cy="9" r="2.4" fill="#fff4c4" />
          <circle cx="15" cy="24" r="3.4" fill="#fff" opacity="0.28" />
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
