import { SHIP_LENGTH, type Placement, type ShipKind } from "../../shared/games/naval/engine.ts";
import type { SkinId } from "../../shared/games/naval/skins.ts";

/** Une case du plateau mesure 10 unités dans les SVG. */
export const CELL = 10;

/** Place un navire dessiné à l'horizontale (proue à droite) sur sa case de départ, couché ou debout. */
export function shipTransform(p: Pick<Placement, "x" | "y" | "dir">): string {
  return p.dir === "h" ? `translate(${p.x * CELL} ${p.y * CELL})` : `translate(${(p.x + 1) * CELL} ${p.y * CELL}) rotate(90)`;
}

function hullPath(kind: ShipKind, w: number): string {
  if (kind === "sous-marin") {
    return `M 1.6 5 Q 1.6 2.5 5 2.5 L ${w - 5} 2.5 Q ${w - 1} 2.7 ${w - 1} 5 Q ${w - 1} 7.3 ${w - 5} 7.5 L 5 7.5 Q 1.6 7.5 1.6 5 Z`;
  }
  return `M 2.6 1.8 L ${w - 6.5} 1.8 Q ${w - 1.4} 2.4 ${w - 0.8} 5 Q ${w - 1.4} 7.6 ${w - 6.5} 8.2 L 2.6 8.2 Q 1 8.2 1 5 Q 1 1.8 2.6 1.8 Z`;
}

function Turret({ x, dir = 1 }: { x: number; dir?: 1 | -1 }) {
  return (
    <g className="ship-turret">
      <rect x={dir > 0 ? x : x - 4.2} y={4.55} width={4.2} height={0.9} rx={0.3} />
      <circle cx={x} cy={5} r={1.75} />
    </g>
  );
}

/** Les teintes et les motifs des coques de chaque thème ; leurs identifiants sont propres au plateau qui les porte */
export function SkinDefs({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}-jouet`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffe066" />
        <stop offset="100%" stopColor="#f2a600" />
      </linearGradient>
      <pattern id={`${id}-pirate`} width={6} height={2} patternUnits="userSpaceOnUse">
        <rect width={6} height={2} fill="#7a4b26" />
        <path d="M0 1.9 H6" stroke="#4e2e14" strokeWidth={0.25} />
        <path d="M3 0 V1.9" stroke="#5c3719" strokeWidth={0.2} />
      </pattern>
      <pattern id={`${id}-camo`} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <rect width={8} height={8} fill="#dfe3e6" />
        <rect width={8} height={2.6} fill="#1f2a33" />
        <rect y={4.3} width={8} height={1.3} fill="#5b7184" />
      </pattern>
      <linearGradient id={`${id}-glace`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f7fcff" />
        <stop offset="100%" stopColor="#a9d3ea" />
      </linearGradient>
      <linearGradient id={`${id}-royal`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2f55a3" />
        <stop offset="100%" stopColor="#13234b" />
      </linearGradient>
      <linearGradient id={`${id}-neon`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#262840" />
        <stop offset="100%" stopColor="#0b0c16" />
      </linearGradient>
      <pattern id={`${id}-lave`} width={10} height={10} patternUnits="userSpaceOnUse">
        <rect width={10} height={10} fill="#2a1d19" />
        <path d="M0 3 L3 4 L5 2 L8 5 L10 4 M2 10 L4 7 L7 8 L9 6" stroke="#ff7a1a" strokeWidth={0.5} fill="none" />
      </pattern>
    </>
  );
}

/** Le remplissage des coques d'un thème (la Marine garde le dégradé gris du plateau) */
export const hullFill = (defs: string, skin: SkinId, marine: string) => (skin === "marine" ? marine : `url(#${defs}-${skin})`);

/** Ce que chaque thème ajoute sur le pont : voiles et pavillon du pirate, liseré du jouet, neige de la banquise */
function SkinExtras({ kind, skin, w }: { kind: ShipKind; skin: SkinId; w: number }) {
  if (skin === "pirate" && kind !== "sous-marin") {
    const masts = SHIP_LENGTH[kind] >= 4 ? [0.3, 0.55, 0.8] : [0.35, 0.7];
    return (
      <g className="ship-extras">
        {masts.map((t) => (
          <g key={t}>
            <rect className="ship-sail" x={w * t - 0.9} y={0.4} width={1.8} height={9.2} rx={0.6} />
            <circle className="ship-mast" cx={w * t} cy={5} r={0.7} />
          </g>
        ))}
        <rect className="ship-flag" x={0.4} y={3.9} width={2.6} height={1.8} rx={0.2} />
        <circle className="ship-flag-skull" cx={1.7} cy={4.8} r={0.45} />
      </g>
    );
  }
  if (skin === "jouet") {
    return (
      <g className="ship-extras">
        <rect className="ship-stripe" x={2.6} y={4.35} width={w - 8} height={1.3} rx={0.65} />
        {[0.25, 0.5, 0.75].map((t) => (
          <circle key={t} className="ship-porthole" cx={w * t} cy={2.9} r={0.55} />
        ))}
      </g>
    );
  }
  if (skin === "glace") {
    return (
      <g className="ship-extras">
        {[0.18, 0.46, 0.7, 0.86].map((t, k) => (
          <circle key={t} className="ship-snow" cx={w * t} cy={k % 2 ? 6.6 : 3.3} r={k % 2 ? 0.7 : 0.95} />
        ))}
      </g>
    );
  }
  return null;
}

/** Le dessin d'un navire, vu du ciel, dans le thème de sa flotte. */
export function ShipShape({ kind, skin = "marine" }: { kind: ShipKind; skin?: SkinId }) {
  const len = SHIP_LENGTH[kind];
  const w = len * CELL;
  return (
    <g className={`ship ship-${kind} skin-${skin}`}>
      <path className="ship-shadow" d={hullPath(kind, w)} transform="translate(0.6 0.9)" />
      <path className="ship-hull" d={hullPath(kind, w)} />
      {kind === "porte-avions" ? (
        <g className="ship-deck">
          <rect x={4} y={2.6} width={w - 13} height={4.8} rx={0.6} />
          <path className="ship-runway" d={`M 6 5 L ${w - 11} 5`} />
          <path className="ship-runway" d={`M ${w * 0.25} 3.4 L ${w * 0.62} 6.6`} />
          <rect className="ship-island" x={w * 0.55} y={6.2} width={5} height={1.6} rx={0.4} />
        </g>
      ) : kind === "sous-marin" ? (
        <g className="ship-deck">
          <path className="ship-runway" d={`M 5 5 L ${w - 6} 5`} />
          <rect className="ship-island" x={w * 0.42} y={3.6} width={5.5} height={2.8} rx={1.4} />
        </g>
      ) : (
        <g className="ship-deck">
          <rect x={3.4} y={3} width={w - 11} height={4} rx={0.8} />
          {kind === "torpilleur" && (
            <>
              <rect className="ship-island" x={4.8} y={3.7} width={3.6} height={2.6} rx={0.5} />
              <Turret x={w - 7.5} />
            </>
          )}
          {kind === "contre-torpilleur" && (
            <>
              <Turret x={5.5} dir={-1} />
              <rect className="ship-island" x={w * 0.42} y={3.5} width={4.4} height={3} rx={0.5} />
              <circle className="ship-funnel" cx={w * 0.42 + 7} cy={5} r={1.3} />
              <Turret x={w - 8} />
            </>
          )}
          {(kind === "croiseur" || kind === "cuirasse") && (
            <>
              <Turret x={5.5} dir={-1} />
              {kind === "cuirasse" && <Turret x={10.5} dir={-1} />}
              <rect className="ship-island" x={w * 0.45} y={3.3} width={6} height={3.4} rx={0.6} />
              <circle className="ship-funnel" cx={w * 0.45 + 8.5} cy={5} r={1.5} />
              <Turret x={w - 13.5} />
              <Turret x={w - 8} />
            </>
          )}
        </g>
      )}
      <SkinExtras kind={kind} skin={skin} w={w} />
    </g>
  );
}

/** Contour seul, pour l'épave révélée sur le radar. */
export function ShipOutline({ kind, afloat = false }: { kind: ShipKind; afloat?: boolean }) {
  return <path className={afloat ? "wreck is-afloat" : "wreck"} d={hullPath(kind, SHIP_LENGTH[kind] * CELL)} />;
}
