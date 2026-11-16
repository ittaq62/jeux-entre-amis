import { useId } from "react";
import { CAMO_BY_ID, type CamoId } from "../../shared/games/escarmouche/camos.ts";
import { UNIFORM_BY_ID, type UniformId } from "../../shared/games/escarmouche/uniforms.ts";
import { WEAPONS, type WeaponId } from "../../shared/games/escarmouche/weapons.ts";

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
  carabine: {
    body: "M4 24 L28 21 L34 18 L74 18 L76 24 L48 26 L40 32 L12 34 L4 30 Z",
    metal: "M74 20 L112 20 L112 22.5 L74 22.5 Z M42 10 L64 10 L66 13 L40 13 Z M50 26 L56 26 L55 36 L50 36 Z",
  },
  fm: {
    body: "M6 22 L28 20 L32 16 L80 16 L82 22 L60 26 L56 30 L46 30 L48 26 L32 27 L26 32 L10 34 L6 30 Z",
    metal: "M82 19 L118 19 L118 22 L82 22 Z M100 22 L96 34 L99 34 L104 22 Z M50 30 C50 40 66 40 66 30 Z M40 11 L54 11 L54 16 L40 16 Z",
  },
  mitraillette: {
    body: "M30 20 L44 18 L46 15 L76 15 L78 24 L58 25 L56 32 L48 32 L50 25 L42 25 L36 28 L30 28 Z",
    metal: "M78 18 L90 18 L90 21 L78 21 Z M60 24 L65 24 L66 42 L61 42 Z",
  },
  rafale: {
    body: "M30 22 L48 20 L50 15 L92 15 L94 23 L72 25 L68 32 L60 32 L62 25 L52 25 L46 30 L32 31 Z",
    metal: "M94 18 L112 18 L112 21 L94 21 Z M56 10 L74 10 L74 15 L56 15 Z M40 25 L48 25 L47 38 L42 38 Z",
  },
  double: {
    body: "M4 26 L30 22 L36 19 L58 19 L58 27 L36 28 L28 34 L8 35 L4 31 Z",
    metal: "M58 18 L114 18 L114 21.5 L58 21.5 Z M58 22 L114 22 L114 25.5 L58 25.5 Z",
  },
  revolver: {
    body: "M40 18 L52 18 L54 15 L82 15 L82 21 L60 21 L58 26 L50 26 L48 40 L38 40 L42 26 Z",
    metal: "M82 16 L96 16 L96 20 L82 20 Z M52 20 C52 28 62 28 62 20 Z",
  },
  pa: {
    body: "M36 16 L82 16 L82 24 L60 24 L56 40 L44 40 L48 24 L36 24 Z",
    metal: "M82 17 L90 17 L90 22 L82 22 Z M56 24 L60 24 L60 46 L56 46 Z",
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

/** Une tenue en petit : la silhouette du soldat, à ses couleurs (la tenue du personnage prend sa couleur de profil) */
export function TenueSwatch({ tenue, size = 34, own = "#c0392b" }: { tenue: UniformId; size?: number; own?: string }) {
  const u = UNIFORM_BY_ID.get(tenue) ?? UNIFORM_BY_ID.get("perso")!;
  const coat = u.coat ?? own;
  return (
    <svg className="esc-camo-swatch" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="7" fill="#2b2f33" />
      <path d="M13 38 L14 26 L26 26 L27 38 Z" fill={u.trousers} />
      <path d="M11 27 C11 19 14 16 20 16 C26 16 29 19 29 27 Z" fill={coat} />
      {u.spots.slice(0, 3).map((c, i) => (
        <circle key={i} cx={14 + i * 6} cy={21 + (i % 2) * 3} r={2.2} fill={c} />
      ))}
      {u.vest && <rect x="15" y="18" width="10" height="8" rx="2" fill={u.vest} />}
      {u.accent && <circle cx="20" cy="21" r="1.4" fill={u.accent} />}
      <circle cx="20" cy="11" r="5" fill="#e0ac69" />
      {u.helmet && <path d="M14.5 10 C14.5 5 25.5 5 25.5 10 Z" fill={u.helmet} />}
      {u.pattern === "feuillu" && (
        <path d="M10 22 l3 -3 l2 3 l3 -4 l2 4 l3 -3 l2 3 l3 -3 l2 3" stroke="#5f7238" strokeWidth="2" fill="none" />
      )}
    </svg>
  );
}

/** Ce qui distingue une arme des autres, ramené à des barres (0 à 1) : dégâts, cadence, portée, mobilité */
export function weaponBars(id: WeaponId): [string, number][] {
  const w = WEAPONS[id];
  const perShot = w.dmg[0] * w.pellets;
  const rate = (w.burst ? w.burst / (w.interval + (w.burst - 1) * (w.burstGap ?? 0.07)) : 1 / w.interval) * 60;
  return [
    ["Dégâts", Math.min(1, perShot / 120)],
    ["Cadence", Math.min(1, rate / 1000)],
    ["Portée", Math.min(1, (w.range[0] + w.range[1]) / 90)],
    ["Mobilité", Math.min(1, Math.max(0, (w.move - 0.8) / 0.3))],
  ];
}

/** Les quatre barres d'une arme, en petit */
export function WeaponBars({ weapon }: { weapon: WeaponId }) {
  return (
    <span style={{ display: "grid", gap: 3, width: "100%", maxWidth: 220 }}>
      {weaponBars(weapon).map(([label, v]) => (
        <span key={label} style={{ display: "grid", gridTemplateColumns: "62px 1fr", alignItems: "center", gap: 6, fontSize: 11 }}>
          <small style={{ textAlign: "left", color: "var(--text-soft)" }}>{label}</small>
          <span style={{ height: 6, borderRadius: 3, background: "rgba(127, 127, 127, 0.25)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.round(v * 100)}%`, background: "#b5793a" }} />
          </span>
        </span>
      ))}
    </span>
  );
}
