import { SHIP_LENGTH, type Placement, type ShipKind } from "../../shared/games/naval/engine.ts";

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

/** Le dessin d'un navire, vu du ciel. */
export function ShipShape({ kind }: { kind: ShipKind }) {
  const len = SHIP_LENGTH[kind];
  const w = len * CELL;
  return (
    <g className={`ship ship-${kind}`}>
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
    </g>
  );
}

/** Contour seul, pour l'épave révélée sur le radar. */
export function ShipOutline({ kind, afloat = false }: { kind: ShipKind; afloat?: boolean }) {
  return <path className={afloat ? "wreck is-afloat" : "wreck"} d={hullPath(kind, SHIP_LENGTH[kind] * CELL)} />;
}
