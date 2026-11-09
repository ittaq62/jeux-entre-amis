import { useEffect, useRef, useState, type ReactNode } from "react";
import { cellX, cellY, randomFleet, shipCells, SHIP_LENGTH, validateFleet, type Placement } from "../../shared/games/naval/engine.ts";
import type { NavalView } from "../../shared/games/naval/view.ts";
import type { NavalClientMessage, NavalRoomView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { formatClock, useCountdown } from "../lib/countdown.ts";
import { play } from "../lib/sound.ts";
import { useBoxSize } from "../lib/viewport.ts";
import { Board, type BoardPointer } from "./Board.tsx";
import { SIDE_MIN } from "./NavalTable.tsx";
import { SkinPicker } from "./SkinPicker.tsx";

interface Props {
  room: NavalRoomView;
  g: NavalView;
  me: string;
  send: (msg: NavalClientMessage) => void;
  serverOffset: number;
  w: number;
  h: number;
  phone: boolean;
  short: boolean;
  header: (center?: ReactNode) => ReactNode;
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
export function PlacementBoard({ room, g, me, send, serverOffset, w, h, phone, short, header }: Props) {
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
    if (type === "up" || type === "cancel") {
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

  // La grille prend ce qui reste une fois posé tout le reste : jamais rien à faire défiler
  const compact = phone || short;
  const [fitRef, box] = useBoxSize<HTMLDivElement>();
  const frame = compact ? 12 : 20;
  const widthForBoard = short ? w - SIDE_MIN - 36 : phone ? box.w : w - 260;
  const px = Math.max(0, Math.floor(Math.min(phone ? 520 : 560, box.h - frame, widthForBoard - frame)));
  // Sur un téléphone debout qui n'a pas la hauteur, les thèmes s'ouvrent à la demande pour laisser sa taille à la grille
  const skinsOnDemand = phone && !short && h < w + 266;
  const [skinsOpen, setSkinsOpen] = useState(false);

  const others = g.players.filter((p) => p.id !== me);
  const waiting = others.filter((p) => !p.ready);

  const title = (
    <div className="placement-head">
      <h2>Place ta flotte</h2>
      {left !== null && <span className={`placement-clock num ${left <= 10 ? "is-urgent" : ""}`}>{formatClock(left)}</span>}
    </div>
  );
  const help = (
    <p className="hint placement-help">
      {compact ? "Glisse pour déplacer, touche pour tourner." : "Glisse un navire pour le déplacer, touche-le pour le tourner."}
    </p>
  );
  const grid = (
    <div className={`placement-board ${shake !== null ? "is-shaking" : ""}`}>
      {px > 0 && (
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
          skin={room.seats.find((s) => s.id === me)?.skin}
        />
      )}
    </div>
  );
  const skins = (
    <SkinPicker
      current={room.seats.find((s) => s.id === me)?.skin ?? "marine"}
      onPick={(skin) => {
        send({ t: "skin", skin });
        setSkinsOpen(false);
      }}
      side
    />
  );
  const actions = (
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
  );
  // Sur petit écran, cette rangée existe toujours : c'est elle qui fait la place au bouton des réactions
  const crew = (compact || waiting.length > 0) && (
    <ul className="placement-crew" aria-label="Joueurs qui placent encore leur flotte">
      {compact && others.length > 0 && (
        <li className="placement-count hint">
          {others.length - waiting.length}/{others.length} prêts
        </li>
      )}
      {others.map((p) => {
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
  );

  // Écran bas : la grille d'un côté, tout le reste de l'autre
  if (short) {
    return (
      <main className="naval-stage is-compact">
        <section className="naval-placement is-compact is-short">
          <div className="naval-side">
            {header(title)}
            {help}
            {skins}
            {actions}
            {crew}
          </div>
          <div className="naval-fit" ref={fitRef} style={{ width: px + frame }}>
            {grid}
          </div>
        </section>
      </main>
    );
  }

  // Téléphone debout : de haut en bas, avec la grille sur tout ce qui reste
  if (phone) {
    return (
      <>
        {header(title)}
        <main className="naval-stage is-compact">
          <section className="naval-placement is-compact">
            <div className="placement-tools">
              {help}
              {skinsOnDemand && (
                <button className="btn btn-sm" aria-expanded={skinsOpen} onClick={() => setSkinsOpen(!skinsOpen)}>
                  Thème
                </button>
              )}
            </div>
            {!skinsOnDemand && skins}
            {skinsOnDemand && skinsOpen && (
              <>
                <div className="emote-catcher" onClick={() => setSkinsOpen(false)} />
                <div className="placement-skins panel">{skins}</div>
              </>
            )}
            <div className="naval-fit" ref={fitRef}>
              {grid}
            </div>
            {actions}
            {crew}
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      {header()}
      <main className="naval-stage">
        <section className="naval-placement">
          {title}
          {help}
          <div className="placement-main">
            <div className="naval-fit" ref={fitRef} style={{ width: px + frame }}>
              {grid}
            </div>
            {/* Les thèmes à côté de la flotte : on voit tout de suite le résultat */}
            {skins}
          </div>
          {actions}
          {crew}
        </section>
      </main>
    </>
  );
}
