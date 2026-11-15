import { useId } from "react";
import { CAMO_BY_ID, type CamoId } from "../../shared/games/escarmouche/camos.ts";
import type { WeaponId } from "../../shared/games/escarmouche/weapons.ts";

/** Les taches d'un camouflage, toujours les mêmes (tirées d'un nombre) */
function blotches(seed: number, n: number, w: number, h: number) {
  const out: { x: number; y: number; rx: number; ry: number; c: number; a: number }[] = [];
  let s = seed;
  const r = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 8) / 16777216;
  };
  for (let i = 0; i < n; i++) out.push({ x: r() * w, y: r() * h, rx: 3 + r() * 7, ry: 2 + r() * 4, c: i, a: r() * 180 });
  return out;
}

/** Le motif d'un camouflage, pour remplir une arme dessinée */
function CamoPattern({ id, camo, size = 40 }: { id: string; camo: CamoId; size?: number }) {
  const c = CAMO_BY_ID.get(camo) ?? CAMO_BY_ID.get("usine")!;
  const [base, ...spots] = c.colors;
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size}>
      <rect width={size} height={size} fill={base} />
      {c.pattern === "taches" &&
        blotches(camo.length * 97 + 13, 14, size, size).map((b, i) => (
          <ellipse
            key={i}
            cx={b.x}
            cy={b.y}
            rx={b.rx}
            ry={b.ry}
            fill={spots[b.c % spots.length]}
            transform={`rotate(${b.a} ${b.x} ${b.y})`}
          />
        ))}
      {c.pattern === "pixels" &&
        blotches(camo.length * 31 + 7, 22, size, size).map((b, i) => (
          <rect
            key={i}
            x={Math.floor(b.x / 4) * 4}
            y={Math.floor(b.y / 4) * 4}
            width={4 + (i % 2) * 4}
            height={4}
            fill={spots[b.c % spots.length]}
          />
        ))}
      {c.pattern === "bandes" &&
        Array.from({ length: 6 }, (_, i) => (
          <path
            key={i}
            d={`M${i * 8 - 4} 0 Q ${i * 8 + 3} ${size / 2} ${i * 8 - 2} ${size}`}
            stroke={spots[i % spots.length]}
            strokeWidth={2.4}
            fill="none"
          />
        ))}
      {c.pattern === "uni" && <rect width={size} height={size / 3} fill={spots[0] ?? base} opacity={0.35} />}
    </pattern>
  );
}

/** Les silhouettes des armes : un corps (pris dans le camouflage) et les pièces de métal */
const SHAPES: Record<WeaponId, { body: string; metal: string }> = {
  fa: {
    body: "M8 22 L30 20 L34 16 L74 16 L76 20 L96 20 L96 25 L60 26 L56 34 L48 34 L50 27 L34 27 L28 32 L12 34 L8 30 Z",
    metal: "M96 21 L114 21 L114 23.5 L96 23.5 Z M44 12 L56 12 L56 16 L44 16 Z M52 27 L60 27 L58 40 L52 40 Z",
  },
  pm: {
    body: "M20 20 L36 18 L40 15 L78 15 L80 25 L58 26 L56 34 L48 34 L50 26 L38 26 L30 30 L18 30 Z",
    metal: "M80 19 L96 19 L96 22 L80 22 Z M60 25 L66 25 L66 44 L60 44 Z M46 11 L54 11 L54 15 L46 15 Z",
  },
  pompe: {
    body: "M6 24 L28 21 L34 18 L70 18 L70 26 L40 27 L30 33 L10 34 L6 30 Z M74 25 L96 25 L96 29 L74 29 Z",
    metal: "M70 19 L116 19 L116 23 L70 23 Z",
  },
  precision: {
    body: "M4 24 L30 21 L36 18 L72 18 L72 25 L44 26 L34 32 L10 34 L4 30 Z",
    metal: "M72 20 L118 20 L118 22.5 L72 22.5 Z M40 8 L70 8 L72 12 L38 12 Z M48 12 L52 18 L58 18 L62 12 Z",
  },
  pistolet: {
    body: "M36 16 L80 16 L80 24 L58 24 L54 40 L42 40 L46 24 L36 24 Z",
    metal: "M80 17 L88 17 L88 22 L80 22 Z",
  },
};

/** Une arme vue de côté, dans son camouflage */
export function WeaponIcon({ weapon, camo = "usine", size = 120 }: { weapon: WeaponId; camo?: CamoId; size?: number }) {
  const uid = useId().replace(/:/g, "");
  const shape = SHAPES[weapon];
  return (
    <svg className="esc-weapon-icon" viewBox="0 0 120 48" width={size} height={(size * 48) / 120} aria-hidden="true">
      <defs>
        <CamoPattern id={`camo-${uid}`} camo={camo} />
      </defs>
      <path d={shape.body} fill={`url(#camo-${uid})`} stroke="#121416" strokeWidth={1.2} strokeLinejoin="round" />
      <path d={shape.metal} fill="#22252a" stroke="#0c0d0f" strokeWidth={0.8} />
    </svg>
  );
}

/** Un carré de camouflage, pour le choisir */
export function CamoSwatch({ camo, size = 34 }: { camo: CamoId; size?: number }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg className="esc-camo-swatch" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <defs>
        <CamoPattern id={`sw-${uid}`} camo={camo} />
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="7" fill={`url(#sw-${uid})`} stroke="rgba(0,0,0,.35)" />
    </svg>
  );
}
