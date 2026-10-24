import { useEffect, useRef, useState } from "react";
import { cellX, cellY, randomFleet, shipCells, SHIP_LENGTH, validateFleet, type Placement } from "../../shared/games/naval/engine.ts";
import type { NavalView } from "../../shared/games/naval/view.ts";
import type { NavalClientMessage, NavalRoomView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { play } from "../lib/sound.ts";
import { Board, type BoardPointer } from "./Board.tsx";

interface Props {
  room: NavalRoomView;
  g: NavalView;
  me: string;
  send: (msg: NavalClientMessage) => void;
  px: number;
  serverOffset: number;
}

interface Ghost {
  index: number;
  p: Placement;
  ok: boolean;
}

interface Drag {
  index: number;
  start: number;
  origin: Placement;
  moved: boolean;
}

/** Placement de la flotte : on glisse un navire pour le déplacer, on le touche pour le tourner. */
export function PlacementBoard({ room, g, me, send, px, serverOffset }: Props) {
  const board = g.boards.find((b) => b.owner === me)!;
  const size = g.settings.grid;
  const touching = g.settings.touching;
  const [fleet, setFleet] = useState<Placement[]>(() => (board.ships ?? []).map(({ kind, x, y, dir }) => ({ kind, x, y, dir })));
  const [selected, setSelected] = useState<number | null>(null);
  const [ghost, setGhostState] = useState<Ghost | null>(null);
  // Copie immédiate du fantôme : le relâchement arrive souvent dans la même image que le dernier
  // mouvement, avant que React ait redessiné, et doit quand même voir la dernière position.
  const ghostRef = useRef<Ghost | null>(null);
  const setGhost = (g: Ghost | null) => {
    ghostRef.current = g;
    setGhostState(g);
  };
  const [shake, setShake] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const left = useCountdown(room.placementDeadline, serverOffset);

  const valid = (next: Placement[]) => validateFleet(size, next, touching) === null;
  const withShip = (i: number, p: Placement) => fleet.map((q, k) => (k === i ? p : q));
  const shown = ghost ? withShip(ghost.index, ghost.p) : fleet;

  function refuse(i: number) {
    setShake(i);
    play("buzzer", { volume: 0.25 });
    setTimeout(() => setShake(null), 380);
  }

  function rotate(i: number) {
    const ship = fleet[i]!;
    const len = SHIP_LENGTH[ship.kind];
    const dir = ship.dir === "h" ? "v" : "h";
    // On garde la proue dans la grille en reculant si besoin
    const turned: Placement = {
      ...ship,
      dir,
      x: dir === "h" ? Math.min(ship.x, size - len) : ship.x,
      y: dir === "v" ? Math.min(ship.y, size - len) : ship.y,
    };
    const next = withShip(i, turned);
    if (valid(next)) {
      setFleet(next);
      play("click", { volume: 0.6 });
    } else refuse(i);
  }

  function onPointer({ type, cell, event }: BoardPointer) {
    if (type === "down") {
      const hit = (event.target as Element).closest("[data-ship]");
      if (!hit || cell === null) {
        setSelected(null);
        return;
      }
      const index = Number(hit.getAttribute("data-ship"));
      setSelected(index);
      drag.current = { index, start: cell, origin: fleet[index]!, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (type === "move" && cell !== null) {
      const dx = cellX(size, cell) - cellX(size, d.start);
      const dy = cellY(size, cell) - cellY(size, d.start);
      if (dx === 0 && dy === 0 && !d.moved) return;
      d.moved = true;
      const p = { ...d.origin, x: d.origin.x + dx, y: d.origin.y + dy };
      setGhost({ index: d.index, p, ok: shipCells(size, p) !== null && valid(withShip(d.index, p)) });
    }
    if (type === "up" || type === "leave" || type === "cancel") {
      drag.current = null;
      const last = ghostRef.current;
      if (!d.moved) {
        // Un simple appui tourne le navire ; un geste interrompu par le navigateur ne fait rien
        if (type === "up") rotate(d.index);
      } else if (last && last.ok) {
        setFleet(withShip(last.index, last.p));
        play("click", { volume: 0.6 });
      } else if (last) refuse(d.index);
      setGhost(null);
    }
  }

  // Raccourci clavier : R pour tourner le navire choisi
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "r" || e.key === "R") && selected !== null) rotate(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const waiting = g.players.filter((p) => !p.ready && p.id !== me);

  return (
    <section className="naval-placement">
      <div className="placement-head">
        <h2>Place ta flotte</h2>
        {left !== null && <span className={`placement-clock num ${left <= 10 ? "is-urgent" : ""}`}>{formatClock(left)}</span>}
      </div>
      <p className="hint placement-help">Glisse un navire pour le déplacer, touche-le pour le tourner.</p>
      <div className={`placement-board ${shake !== null ? "is-shaking" : ""}`}>
        <Board
          board={{ ...board, ships: null, hits: [], misses: [], sunk: [], scans: [] }}
          mode="sea"
          px={px}
          label="Ta flotte, en cours de placement"
          fleet={shown}
          selectedShip={selected}
          preview={ghost ? { cells: shipCells(size, ghost.p) ?? [], ok: ghost.ok } : null}
          onPointer={onPointer}
          className="is-placing"
        />
      </div>
      <div className="placement-actions">
        <button className="btn" onClick={() => setFleet(randomFleet(size, touching, { rng: Math.floor(Math.random() * 2 ** 32) }))}>
          <Icon name="dice" size={18} /> Au hasard
        </button>
        <button className="btn" disabled={selected === null} onClick={() => selected !== null && rotate(selected)}>
          <Icon name="refresh" size={18} /> Tourner
        </button>
        <button
          className="btn btn-primary"
          disabled={!valid(fleet)}
          onClick={() => send({ t: "action", action: { type: "ready", ships: fleet } })}
        >
          Prêt au combat
        </button>
      </div>
      {waiting.length > 0 && (
        <ul className="placement-crew" aria-label="Joueurs qui placent encore leur flotte">
          {g.players
            .filter((p) => p.id !== me)
            .map((p) => {
              const seat = room.seats.find((s) => s.id === p.id);
              return (
                <li key={p.id} className={p.ready ? "is-ready" : ""}>
                  {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={26} />}
                  <span>{seat?.name}</span>
                  <span className="hint">{p.ready ? "prêt" : "place sa flotte"}</span>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}

export function useCountdown(target: number | null, offset: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [target]);
  return target ? Math.max(0, Math.ceil((target - (now + offset)) / 1000)) : null;
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
