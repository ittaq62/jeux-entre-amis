import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cellIndex, cellX, cellY, shipCells, type Placement } from "../../shared/games/naval/engine.ts";
import type { NavalBoardView } from "../../shared/games/naval/view.ts";
import { useNavalFx, type FxItem } from "./fx.ts";
import { CELL, ShipOutline, ShipShape, shipTransform } from "./ships.tsx";

const LETTERS = "ABCDEFGHIJKL";
const MARGIN = 7;

export type BoardMode = "sea" | "radar";

export interface BoardPointer {
  type: "down" | "move" | "up" | "cancel";
  cell: number | null;
  event: ReactPointerEvent<SVGSVGElement> | PointerEvent;
}

interface BoardProps {
  board: NavalBoardView;
  mode: BoardMode;
  px: number;
  label: string;
  /** Flotte à dessiner à la place de celle du plateau (placement en cours) */
  fleet?: Placement[] | null;
  selectedShip?: number | null;
  /** Cases mises en valeur : zone d'une arme, navire déplacé */
  preview?: { cells: number[]; ok: boolean } | null;
  /** Le viseur suit la souris */
  aiming?: boolean;
  onCell?: (cell: number) => void;
  onHover?: (cell: number | null) => void;
  onPointer?: (p: BoardPointer) => void;
  className?: string;
}

/** Cases d'un plateau : la flotte sur la mer, ou le radar sur une flotte adverse. */
export function Board({ board, mode, px, label, fleet, selectedShip, preview, aiming, onCell, onHover, onPointer, className }: BoardProps) {
  const n = board.size;
  const span = n * CELL;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const pendingList = useNavalFx((s) => s.pending[board.owner]);
  const items = useNavalFx((s) => s.items);
  const fx = useMemo(() => items.filter((f) => f.board === board.owner), [items, board.owner]);
  const pending = useMemo(() => new Set(pendingList ?? []), [pendingList]);

  // Plateau qu'on manipule au doigt (placement) : le navigateur ne doit lancer aucun geste à lui,
  // ni défilement, ni loupe, ni menu d'appui long, sinon il annule le glissement en cours.
  // React écoute touchstart en mode passif : il faut un écouteur natif pour pouvoir l'empêcher.
  const draggable = Boolean(onPointer);
  useEffect(() => {
    const el = svg.current;
    if (!el || !draggable) return;
    const block = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchstart", block, { passive: false });
    return () => el.removeEventListener("touchstart", block);
  }, [draggable]);

  const ships = fleet ?? board.ships;
  const hits = board.hits.filter((c) => !pending.has(c));
  const misses = board.misses.filter((c) => !pending.has(c));
  const hitSet = new Set(hits);
  // Une épave n'apparaît qu'une fois l'obus arrivé
  const sunk = board.sunk.filter((p) => !(shipCells(n, p) ?? []).some((c) => pending.has(c)));
  const sunkCells = new Set(sunk.flatMap((p) => shipCells(n, p) ?? []));

  function cellAt(clientX: number, clientY: number): number | null {
    const el = svg.current;
    if (!el) return null;
    const pt = el.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = el.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    const x = Math.floor(p.x / CELL);
    const y = Math.floor(p.y / CELL);
    return x >= 0 && y >= 0 && x < n && y < n ? cellIndex(n, x, y) : null;
  }

  function hoverAt(cell: number | null) {
    if (cell !== hover) {
      setHover(cell);
      onHover?.(cell);
    }
  }

  // Un doigt ou une souris qui appuie sur le plateau est suivi sur toute la page jusqu'à ce qu'il se lève.
  // On ne détourne pas le pointeur vers le plateau (setPointerCapture) : ce changement de cible envoie
  // des « sorties » que certains navigateurs de téléphone font remonter jusqu'au plateau, et le glissement
  // s'arrêtait avant d'avoir commencé.
  const onPointerRef = useRef(onPointer);
  onPointerRef.current = onPointer;
  const tracking = useRef<(() => void) | null>(null);
  useEffect(() => () => tracking.current?.(), []);
  function track(pointerId: number) {
    tracking.current?.();
    const move = (e: PointerEvent) => {
      if (e.pointerId === pointerId) onPointerRef.current?.({ type: "move", cell: cellAt(e.clientX, e.clientY), event: e });
    };
    const end = (type: "up" | "cancel") => (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      stop();
      onPointerRef.current?.({ type, cell: type === "up" ? cellAt(e.clientX, e.clientY) : null, event: e });
    };
    const up = end("up");
    const cancel = end("cancel");
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      tracking.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    tracking.current = stop;
  }

  const center = (c: number) => ({ x: cellX(n, c) * CELL + CELL / 2, y: cellY(n, c) * CELL + CELL / 2 });

  return (
    <svg
      ref={svg}
      className={`naval-board mode-${mode} ${aiming ? "is-aiming" : ""} ${className ?? ""}`}
      viewBox={`${-MARGIN} ${-MARGIN} ${span + MARGIN + 1} ${span + MARGIN + 1}`}
      width={px}
      height={px}
      role="grid"
      aria-label={label}
      onPointerDown={(e) => {
        if (!onPointer) return;
        onPointer({ type: "down", cell: cellAt(e.clientX, e.clientY), event: e });
        track(e.pointerId);
      }}
      onPointerMove={(e) => hoverAt(cellAt(e.clientX, e.clientY))}
      onPointerLeave={() => hoverAt(null)}
      onPointerCancel={() => hoverAt(null)}
      // Un appui long sur téléphone ouvrirait le menu du navigateur au lieu d'attraper le navire
      onContextMenu={onPointer ? (e) => e.preventDefault() : undefined}
      onClick={(e) => {
        const cell = cellAt(e.clientX, e.clientY);
        if (cell !== null) onCell?.(cell);
      }}
    >
      <defs>
        <clipPath id={`clip${uid}`}>
          <rect x={0} y={0} width={span} height={span} rx={1.5} />
        </clipPath>
        {mode === "sea" ? (
          <>
            <radialGradient id={`water${uid}`} cx="50%" cy="38%" r="75%">
              <stop offset="0%" stopColor="#1f6c86" />
              <stop offset="60%" stopColor="#134e66" />
              <stop offset="100%" stopColor="#0b3447" />
            </radialGradient>
            <pattern id={`waveA${uid}`} width={40} height={14} patternUnits="userSpaceOnUse">
              <path d="M0 7 Q 5 4 10 7 T 20 7 T 30 7 T 40 7" fill="none" stroke="rgba(190,236,255,0.13)" strokeWidth={0.7} />
              <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="40 6" dur="9s" repeatCount="indefinite" />
            </pattern>
            <pattern id={`waveB${uid}`} width={26} height={10} patternUnits="userSpaceOnUse">
              <path d="M0 5 Q 3.25 3 6.5 5 T 13 5 T 19.5 5 T 26 5" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} />
              <animateTransform
                attributeName="patternTransform"
                type="translate"
                from="0 0"
                to="-26 -4"
                dur="6s"
                repeatCount="indefinite"
              />
            </pattern>
            <linearGradient id={`hull${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9aa8ad" />
              <stop offset="100%" stopColor="#5b686d" />
            </linearGradient>
          </>
        ) : (
          <>
            <radialGradient id={`scope${uid}`} cx="50%" cy="50%" r="72%">
              <stop offset="0%" stopColor="#0f3a2a" />
              <stop offset="100%" stopColor="#051a12" />
            </radialGradient>
            <linearGradient id={`sweep${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(120,255,190,0)" />
              <stop offset="100%" stopColor="rgba(120,255,190,0.28)" />
            </linearGradient>
          </>
        )}
      </defs>

      <g className="board-labels" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <g key={i}>
            <text x={i * CELL + CELL / 2} y={-2.3} textAnchor="middle">
              {LETTERS[i]}
            </text>
            <text x={-2.6} y={i * CELL + CELL / 2 + 1.5} textAnchor="end">
              {i + 1}
            </text>
          </g>
        ))}
      </g>

      <g clipPath={`url(#clip${uid})`}>
        {mode === "sea" ? (
          <>
            <rect width={span} height={span} fill={`url(#water${uid})`} />
            <rect width={span} height={span} fill={`url(#waveA${uid})`} />
            <rect width={span} height={span} fill={`url(#waveB${uid})`} />
          </>
        ) : (
          <>
            <rect width={span} height={span} fill={`url(#scope${uid})`} />
            {[0.18, 0.34, 0.5].map((r) => (
              <circle key={r} className="radar-ring" cx={span / 2} cy={span / 2} r={span * r} />
            ))}
            <g className="radar-sweep">
              <path
                d={`M ${span / 2} ${span / 2} L ${span * 1.2} ${span / 2} A ${span * 0.7} ${span * 0.7} 0 0 0 ${span * 1.05} ${span * 0.05} Z`}
                fill={`url(#sweep${uid})`}
              />
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`0 ${span / 2} ${span / 2}`}
                to={`360 ${span / 2} ${span / 2}`}
                dur="5s"
                repeatCount="indefinite"
              />
            </g>
          </>
        )}

        <g className="board-grid">
          {Array.from({ length: n + 1 }, (_, i) => (
            <g key={i}>
              <line x1={i * CELL} y1={0} x2={i * CELL} y2={span} />
              <line x1={0} y1={i * CELL} x2={span} y2={i * CELL} />
            </g>
          ))}
        </g>

        {preview && (
          <g className={`board-preview ${preview.ok ? "is-ok" : "is-bad"}`}>
            {preview.cells.map((c) => (
              <rect key={c} x={cellX(n, c) * CELL + 0.5} y={cellY(n, c) * CELL + 0.5} width={CELL - 1} height={CELL - 1} rx={1.2} />
            ))}
          </g>
        )}

        {mode === "sea" && ships && (
          <g className="board-ships">
            {ships.map((p, i) => {
              const cells = shipCells(n, p) ?? [];
              const isSunk = cells.length > 0 && cells.every((c) => hitSet.has(c));
              return (
                <g
                  key={`${p.kind}-${i}`}
                  className={`ship-wrap ${isSunk ? "is-sunk" : ""} ${selectedShip === i ? "is-selected" : ""}`}
                  data-ship={i}
                  transform={shipTransform(p)}
                  style={{ ["--hull" as string]: `url(#hull${uid})` }}
                >
                  <ShipShape kind={p.kind} />
                </g>
              );
            })}
          </g>
        )}

        {mode === "radar" && (
          <g className="board-wrecks">
            {/* En fin de partie, les navires restés à flot apparaissent en clair */}
            {ships
              ?.filter((p) => !sunk.some((q) => q.x === p.x && q.y === p.y && q.dir === p.dir))
              .map((p) => (
                <g key={`afloat-${p.kind}-${p.x}-${p.y}`} transform={shipTransform(p)}>
                  <ShipOutline kind={p.kind} afloat />
                </g>
              ))}
            {sunk.map((p) => (
              <g key={`${p.kind}-${p.x}-${p.y}`} transform={shipTransform(p)}>
                <ShipOutline kind={p.kind} />
              </g>
            ))}
          </g>
        )}

        <g className="board-scans">
          {board.scans.flatMap((sc, si) =>
            sc.cells
              .filter((c) => !hitSet.has(c) && !misses.includes(c))
              .map((c) => {
                const { x, y } = center(c);
                return sc.found.includes(c) ? (
                  <circle key={`${si}-${c}`} className="scan-echo" cx={x} cy={y} r={1.8} />
                ) : (
                  <rect key={`${si}-${c}`} className="scan-empty" x={x - 3.5} y={y - 3.5} width={7} height={7} rx={1} />
                );
              }),
          )}
        </g>

        <g className="board-marks">
          {misses.map((c) => {
            const { x, y } = center(c);
            return mode === "sea" ? (
              <g key={c} className="mark-miss">
                <circle cx={x} cy={y} r={2.2} />
                <circle cx={x} cy={y} r={0.9} />
              </g>
            ) : (
              <circle key={c} className="mark-miss" cx={x} cy={y} r={1.5} />
            );
          })}
          {hits.map((c) => {
            const { x, y } = center(c);
            const wreck = sunkCells.has(c);
            return (
              <g key={c} className={`mark-hit ${wreck ? "is-wreck" : ""}`} transform={`translate(${x} ${y})`}>
                {mode === "radar" ? (
                  <>
                    <path className="hit-cross" d="M -2.6 -2.6 L 2.6 2.6 M 2.6 -2.6 L -2.6 2.6" />
                    {!wreck && <circle className="hit-glow" r={3.6} />}
                  </>
                ) : (
                  <Flames still={wreck} />
                )}
              </g>
            );
          })}
        </g>

        {aiming && hover !== null && !preview && (
          <g className="board-reticle" aria-hidden="true">
            <line x1={0} y1={center(hover).y} x2={span} y2={center(hover).y} />
            <line x1={center(hover).x} y1={0} x2={center(hover).x} y2={span} />
            <circle cx={center(hover).x} cy={center(hover).y} r={3.6} />
          </g>
        )}

        <g className="board-fx">
          {fx.map((f) => (
            <Fx key={f.id} item={f} n={n} />
          ))}
        </g>
      </g>

      <rect className="board-frame" x={-0.5} y={-0.5} width={span + 1} height={span + 1} rx={2} />
    </svg>
  );
}

/** Flammes et fumée sur une case touchée de sa propre flotte. */
function Flames({ still }: { still: boolean }) {
  return (
    <g className={`flames ${still ? "is-out" : ""}`}>
      <circle className="smoke" r={3.4} />
      <circle className="flame flame-1" r={2.4} />
      <circle className="flame flame-2" cx={0.8} cy={-0.6} r={1.5} />
      <circle className="flame flame-3" cx={-0.7} cy={0.5} r={1.1} />
    </g>
  );
}

/** Direction d'une gouttelette ou d'une étincelle projetée depuis l'impact. */
function burst(angle: number, distance: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    ["--dx" as string]: `${(Math.cos(rad) * distance).toFixed(2)}px`,
    ["--dy" as string]: `${(Math.sin(rad) * distance).toFixed(2)}px`,
  };
}

function Fx({ item, n }: { item: FxItem; n: number }) {
  const x = cellX(n, item.cell) * CELL + CELL / 2;
  const y = cellY(n, item.cell) * CELL + CELL / 2;
  const style = { animationDuration: `${item.duration}ms` };
  switch (item.kind) {
    case "incoming":
      return (
        <g className="fx-incoming" transform={`translate(${x} ${y})`} style={style}>
          <circle className="fx-shadow" r={2.6} style={style} />
          <circle className="fx-shell" r={1.6} style={style} />
        </g>
      );
    case "splash":
      return (
        <g className="fx-splash" transform={`translate(${x} ${y})`}>
          <circle className="ring ring-1" r={2} style={style} />
          <circle className="ring ring-2" r={2} style={style} />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <circle key={a} className="drop" r={0.7} style={{ ...style, ...burst(a, 5.5) }} />
          ))}
        </g>
      );
    case "explosion":
    case "sunk":
      return (
        <g className={`fx-blast ${item.kind === "sunk" ? "is-big" : ""}`} transform={`translate(${x} ${y})`}>
          <circle className="blast-core" r={3} style={style} />
          <circle className="blast-ring" r={3} style={style} />
          {[20, 80, 140, 200, 260, 320].map((a) => (
            <circle key={a} className="spark" r={0.8} style={{ ...style, ...burst(a, item.kind === "sunk" ? 9 : 6.5) }} />
          ))}
        </g>
      );
    case "torpedo": {
      const path = item.cells ?? [item.cell];
      const from = path[0]!;
      const fx0 = cellX(n, from) * CELL + CELL / 2;
      const fy0 = cellY(n, from) * CELL + CELL / 2;
      const horizontal = cellY(n, from) === cellY(n, item.cell);
      const x0 = horizontal ? -2 : fx0;
      const y0 = horizontal ? fy0 : -2;
      return <line className="fx-torpedo" x1={x0} y1={y0} x2={x} y2={y} style={style} pathLength={1} />;
    }
    case "scan": {
      const cells = item.cells ?? [];
      const xs = cells.map((c) => cellX(n, c));
      const ys = cells.map((c) => cellY(n, c));
      const x0 = Math.min(...xs) * CELL;
      const y0 = Math.min(...ys) * CELL;
      const w = (Math.max(...xs) - Math.min(...xs) + 1) * CELL;
      const h = (Math.max(...ys) - Math.min(...ys) + 1) * CELL;
      return <rect className="fx-scan" x={x0} y={y0} width={w} height={h} rx={2} style={style} />;
    }
  }
}
