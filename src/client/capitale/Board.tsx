import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GROUP_ORDER, GROUPS, HOTEL, SQUARES, STATIONS, UTILITIES } from "../../shared/games/capitale/board.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { colorOf, INNER, JAIL_SPOTS, money, shortName, squareCenter, squareRect, tinyName } from "./boardUi.ts";

interface Props {
  g: CapitaleView;
  /** Où chaque pion est affiché (il avance case par case, en retard sur l'état) */
  shown: Record<string, number>;
  dice: { values: [number, number] | null; rollId: number };
  tilted: boolean;
  compact: boolean;
  seat: (id: string) => SeatView | undefined;
  /** Une case à mettre en avant : celle qu'on peut acheter, celle de l'enchère */
  highlight: number | null;
  onSquare: (index: number) => void;
}

/** Le plateau : les 40 cases autour, les parcelles au centre, les pions et les dés. */
export function Board({ g, shown, dice, tilted, compact, seat, highlight, onSquare }: Props) {
  return (
    <div className={`cap-board-wrap ${tilted ? "is-tilted" : ""} ${compact ? "is-compact" : ""}`}>
      <div className="cap-board">
        {SQUARES.map((sq) => {
          const r = squareRect(sq.index);
          const deed = g.deeds[sq.index];
          const owner = deed?.owner ?? null;
          return (
            <button
              key={sq.index}
              type="button"
              className={`cap-sq side-${r.side} kind-${sq.kind} ${owner ? "is-owned" : ""} ${deed?.mortgaged ? "is-mortgaged" : ""} ${highlight === sq.index ? "is-highlight" : ""}`}
              style={{
                left: `${r.x}%`,
                top: `${r.y}%`,
                width: `${r.w}%`,
                height: `${r.h}%`,
                ["--owner" as string]: owner ? colorOf(g, owner) : "transparent",
              }}
              onClick={() => onSquare(sq.index)}
              aria-label={`${sq.name}${sq.price ? `, ${sq.price}` : ""}${owner ? `, à ${seat(owner)?.name ?? "?"}` : ""}`}
            >
              {sq.group && <span className="cap-band" style={{ background: GROUPS[sq.group].color }} />}
              <SquareFace index={sq.index} pot={g.settings.freeParking ? g.pot : null} compact={compact} />
            </button>
          );
        })}

        <div className="cap-center" style={{ left: `${INNER.x}%`, top: `${INNER.y}%`, width: `${INNER.size}%`, height: `${INNER.size}%` }}>
          <div className="cap-logo" aria-hidden="true">
            Capitale
          </div>
          <div className="cap-plots">
            {GROUP_ORDER.map((gid) => (
              <div key={gid} className="cap-block" style={{ ["--group" as string]: GROUPS[gid].color }}>
                {GROUPS[gid].squares.map((i) => (
                  <Plot key={i} g={g} index={i} compact={compact} onClick={() => onSquare(i)} />
                ))}
              </div>
            ))}
          </div>
          <div className="cap-nets">
            {[...STATIONS, ...UTILITIES].map((i) => {
              const d = g.deeds[i]!;
              return (
                <button
                  key={i}
                  type="button"
                  className={`cap-net ${d.owner ? "is-owned" : ""} ${d.mortgaged ? "is-mortgaged" : ""}`}
                  style={{ ["--owner" as string]: d.owner ? colorOf(g, d.owner) : "transparent" }}
                  onClick={() => onSquare(i)}
                  title={SQUARES[i]!.name}
                >
                  <NetIcon index={i} />
                </button>
              );
            })}
          </div>
          <div className="cap-bank" data-cap-anchor="bank">
            <span>
              {g.bankHouses} maison{g.bankHouses > 1 ? "s" : ""} · {g.bankHotels} hôtel{g.bankHotels > 1 ? "s" : ""}
            </span>
            {g.settings.freeParking && g.pot > 0 && <span className="cap-pot">Cagnotte {money(g.pot)}</span>}
          </div>
          <Dice values={dice.values} rollId={dice.rollId} />
        </div>

        <div className="cap-pawns" aria-hidden="true">
          {g.players.map((p, k) => {
            if (p.bankrupt) return null;
            const at = shown[p.id] ?? p.position;
            const here = g.players.filter((x) => !x.bankrupt && (shown[x.id] ?? x.position) === at);
            const slot = here.findIndex((x) => x.id === p.id);
            // À la prison, chacun à sa place : derrière les barreaux, ou en simple visite sur les bords
            let pos: { x: number; y: number };
            if (at === 10) {
              const group = here.filter((x) => x.inJail === p.inJail);
              const spot = group.findIndex((x) => x.id === p.id);
              pos = (p.inJail ? JAIL_SPOTS.inside : JAIL_SPOTS.visiting)[Math.max(0, spot) % 6]!;
            } else {
              const c = squareCenter(at);
              const dx = (slot % 2 ? 1 : -1) * (here.length > 1 ? 1.5 : 0);
              const dy = (slot >= 2 ? 1 : -1) * (here.length > 2 ? 1.5 : here.length > 1 ? 0.8 : 0);
              pos = { x: c.x + dx, y: c.y + dy };
            }
            const s = seat(p.id);
            return (
              <motion.div
                key={p.id}
                className={`cap-pawn ${g.players[g.turn]?.id === p.id ? "is-turn" : ""}`}
                style={{ ["--pawn" as string]: colorOf(g, p.id), zIndex: 10 + k }}
                initial={false}
                animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
              >
                <span className="cap-pawn-body">
                  {s && <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={compact ? 16 : 24} />}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SquareFace({ index, pot, compact }: { index: number; pot: number | null; compact: boolean }) {
  const sq = SQUARES[index]!;
  switch (sq.kind) {
    case "go":
      return (
        <span className="cap-corner">
          <strong>Départ</strong>
          <span className="cap-go-arrow" aria-hidden="true">
            ←
          </span>
          {!compact && <span className="cap-sq-price">+200</span>}
        </span>
      );
    case "jail":
      return (
        <span className="cap-corner cap-jail">
          <span className="cap-cell">
            <span className="cap-bars" aria-hidden="true" />
            <strong>Prison</strong>
          </span>
          {!compact && <span className="cap-visit">simple visite</span>}
        </span>
      );
    case "rest":
      return (
        <span className="cap-corner">
          <strong>Aire de repos</strong>
          {pot !== null && pot > 0 && <span className="cap-sq-price">{money(pot)}</span>}
        </span>
      );
    case "toJail":
      return (
        <span className="cap-corner">
          <strong>Allez en prison</strong>
        </span>
      );
    case "card":
      return (
        <span className="cap-sq-face">
          <span className={`cap-deck-mark deck-${sq.deck}`} aria-hidden="true">
            {sq.deck === "hasard" ? "?" : "✉"}
          </span>
          {!compact && <span className="cap-sq-name">{sq.name}</span>}
        </span>
      );
    case "tax":
      return (
        <span className="cap-sq-face">
          <span className="cap-sq-name">{sq.name}</span>
          <span className="cap-sq-price">{sq.tax}</span>
        </span>
      );
    case "station":
    case "utility":
      return (
        <span className="cap-sq-face">
          <NetIcon index={index} />
          {!compact && <span className="cap-sq-name">{shortName(index)}</span>}
          {!compact && <span className="cap-sq-price">{sq.price}</span>}
        </span>
      );
    default:
      return (
        <span className="cap-sq-face">
          <span className="cap-sq-name">{compact ? tinyName(index) : shortName(index)}</span>
          {!compact && <span className="cap-sq-price">{sq.price}</span>}
        </span>
      );
  }
}

/** Une parcelle du centre : la ville, son propriétaire, ses maisons ou son hôtel */
function Plot({ g, index, compact, onClick }: { g: CapitaleView; index: number; compact: boolean; onClick: () => void }) {
  const d = g.deeds[index]!;
  const color = d.owner ? colorOf(g, d.owner) : null;
  return (
    <button
      type="button"
      className={`cap-plot ${d.owner ? "is-owned" : ""} ${d.mortgaged ? "is-mortgaged" : ""}`}
      style={{ ["--owner" as string]: color ?? "transparent" }}
      onClick={onClick}
      title={SQUARES[index]!.name}
    >
      {!compact && <span className="cap-plot-name">{shortName(index)}</span>}
      <span className="cap-plot-build">
        {d.houses === HOTEL ? (
          <HotelIcon />
        ) : (
          Array.from({ length: d.houses }, (_, k) => (
            <motion.span
              key={k}
              initial={{ scale: 0, y: -6 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
            >
              <HouseIcon />
            </motion.span>
          ))
        )}
      </span>
    </button>
  );
}

function HouseIcon() {
  return (
    <svg className="cap-house" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1.5 6 L6 2 L10.5 6 V10.5 H1.5 Z" />
    </svg>
  );
}

function HotelIcon() {
  return (
    <motion.svg
      className="cap-hotel"
      viewBox="0 0 24 14"
      aria-hidden="true"
      initial={{ scale: 0.3, y: -8 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 16 }}
    >
      <path d="M2 13 V4 L12 1 L22 4 V13 Z" />
      <path className="cap-hotel-windows" d="M6 6h2v2H6zM11 6h2v2h-2zM16 6h2v2h-2zM6 9.5h2v2H6zM16 9.5h2v2h-2z" />
    </motion.svg>
  );
}

function NetIcon({ index }: { index: number }) {
  const sq = SQUARES[index]!;
  if (sq.kind === "station") {
    return (
      <svg className="cap-net-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 15 C4 9 8 6 14 6 H20 V15 Z" />
        <path className="cap-net-cut" d="M6 12 H11 V9 H8 Z M13 9 H18 V12 H13 Z" />
        <path d="M3 18 H21" strokeWidth="1.6" stroke="currentColor" fill="none" />
      </svg>
    );
  }
  if (index === 12) {
    // Le barrage : une goutte d'eau
    return (
      <svg className="cap-net-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 C12 3 5 11 5 15 A7 7 0 0 0 19 15 C19 11 12 3 12 3 Z" />
      </svg>
    );
  }
  // Le parc éolien : une éolienne
  return (
    <svg className="cap-net-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.2 10 L12.8 10 L13.4 22 H10.6 Z" />
      <path d="M12 10 L12.6 2.5 L13.3 9.6 Z M12 10 L18.6 13.8 L12.4 11.6 Z M12 10 L5.4 13.8 L11.6 11.6 Z" />
      <circle cx="12" cy="10" r="1.3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Les dés
// ---------------------------------------------------------------------------

/** Pour montrer une face, le dé tourne ainsi (face 1 devant, 6 derrière, 2 dessus, 5 dessous, 3 à droite, 4 à gauche) */
const FACE: Record<number, [number, number]> = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [26, 26],
    [50, 50],
    [74, 74],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};

function Dice({ values, rollId }: { values: [number, number] | null; rollId: number }) {
  if (!values) return null;
  return (
    <div className={`cap-dice ${values[0] === values[1] ? "is-double" : ""}`} aria-label={`Dés : ${values[0]} et ${values[1]}`}>
      <Die value={values[0]} rollId={rollId} spin={1} />
      <Die value={values[1]} rollId={rollId} spin={-1} />
    </div>
  );
}

function Die({ value, rollId, spin }: { value: number; rollId: number; spin: number }) {
  const [x, y] = FACE[value] ?? [0, 0];
  // Chaque lancer ajoute des tours complets : le dé roule avant de s'arrêter sur sa face
  const [turns, setTurns] = useState(0);
  useEffect(() => {
    if (rollId > 0) setTurns((t) => t + 1);
  }, [rollId]);
  return (
    <motion.div
      className="cap-die"
      initial={false}
      animate={{ rotateX: x + turns * 720 * spin, rotateY: y + turns * 540, y: [0, -26, 0, -8, 0] }}
      transition={{ duration: 0.8, ease: [0.2, 0.7, 0.3, 1], y: { duration: 0.8, times: [0, 0.35, 0.65, 0.82, 1] } }}
    >
      {[1, 2, 3, 4, 5, 6].map((f) => (
        <span key={f} className={`cap-die-face face-${f}`}>
          {PIPS[f]!.map(([px, py], k) => (
            <i key={k} style={{ left: `${px}%`, top: `${py}%` }} />
          ))}
        </span>
      ))}
    </motion.div>
  );
}
