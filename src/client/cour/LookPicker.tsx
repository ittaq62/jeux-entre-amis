// Le maillot de candidat, au salon : le motif (le portrait est à tout le monde, les autres s'achètent à la boutique) et
// l'éclat qui salue chaque épreuve passée. Le choix reste sur l'appareil (et suit le compte), d'une table à l'autre.

import { useEffect, useState, type CSSProperties } from "react";
import {
  CHEERS,
  cheerItem,
  DEFAULT_LOOK,
  isCourLook,
  jerseyItem,
  JERSEYS,
  usableLook,
  type CourLook,
} from "../../shared/games/cour/looks.ts";
import type { CourClientMessage, CourRoomView } from "../../shared/games/cour/net.ts";
import { useMyItems } from "../stores/shop.ts";

const STORE = "cour-maillot";

export function savedLook(): CourLook | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return isCourLook(raw) ? raw : null;
  } catch {
    return null;
  }
}

function saveLook(l: CourLook) {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    // Pas de stockage : le choix vaut pour cette table
  }
}

/** Une vignette de maillot : le motif sur une silhouette de t-shirt */
export function JerseySwatch({ id, size = 44 }: { id: string; size?: number }) {
  const j = JERSEYS.find((x) => x.id === id);
  const [a, b] = j?.colors ?? ["#5b4bdb", "#ffffff"];
  return (
    <span className={`cg-jersey is-${id}`} style={{ "--a": a, "--b": b, width: size, height: size } as CSSProperties} aria-hidden="true" />
  );
}

export function LookPicker({ room, send }: { room: CourRoomView; send: (msg: CourClientMessage) => void }) {
  const { has } = useMyItems();
  const seat = room.seats.find((s) => s.id === room.you.seatId);
  const [local, setLocal] = useState<CourLook | null>(null);
  const current = local ?? seat?.look ?? DEFAULT_LOOK;

  useEffect(() => {
    const saved = savedLook();
    if (!saved || !seat || room.status === "playing") return;
    const usable = usableLook(saved, has);
    if (JSON.stringify(usable) !== JSON.stringify(seat.look)) send({ t: "look", look: usable });
    // Seulement à l'arrivée à la table
  }, [seat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!seat) return null;
  const choose = (patch: Partial<CourLook>) => {
    const next = { ...current, ...patch };
    setLocal(next);
    saveLook(next);
    send({ t: "look", look: next });
  };
  return (
    <div className="cg-looks">
      <span className="field-label">Ton maillot</span>
      <div className="cg-look-row">
        {JERSEYS.map((j) => {
          const owned = j.price === 0 || has(jerseyItem(j.id));
          return (
            <button
              key={j.id}
              className={`cg-look ${current.jersey === j.id ? "is-on" : ""}`}
              disabled={!owned}
              onClick={() => choose({ jersey: j.id })}
              title={owned ? j.name : `${j.name} (à la boutique)`}
            >
              <JerseySwatch id={j.id} />
              <small>{j.name}</small>
            </button>
          );
        })}
      </div>
      <span className="field-label">Quand tu passes une épreuve</span>
      <div className="cg-look-row">
        {CHEERS.map((c) => {
          const owned = c.price === 0 || has(cheerItem(c.id));
          return (
            <button
              key={c.id}
              className={`cg-look is-cheer ${current.cheer === c.id ? "is-on" : ""}`}
              disabled={!owned}
              onClick={() => choose({ cheer: c.id })}
              title={owned ? c.name : `${c.name} (à la boutique)`}
            >
              <small>{c.name}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
