import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BALL_COLORS,
  BALL_PATTERNS,
  DEFAULT_LOOK,
  isBallLook,
  patternItem,
  trailItem,
  TRAILS,
  usableLook,
  type BallLook,
} from "../../shared/games/minigolf/looks.ts";
import type { MinigolfClientMessage, MinigolfRoomView } from "../../shared/games/minigolf/net.ts";
import { useMyItems } from "../stores/shop.ts";
import { patternTex } from "./scene/ball.ts";

const STORE = "minigolf-balle";

/** Le skin choisi sur cet appareil (repris à chaque table) */
export function savedLook(): BallLook | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return isBallLook(raw) ? raw : null;
  } catch {
    return null;
  }
}

function saveLook(l: BallLook) {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    // Pas de stockage : le choix vaut pour cette table
  }
}

/** Une balle dessinée (sa carte de couleur posée sur un disque ombré) */
export function BallSwatch({ look, size = 56 }: { look: BallLook; size?: number }) {
  const url = useMemo(() => {
    const img = patternTex(look).image as HTMLCanvasElement;
    return img.toDataURL();
  }, [look]);
  return (
    <span className="mg-swatch" style={{ "--size": `${size}px`, backgroundImage: `url(${url})` } as CSSProperties} aria-hidden="true" />
  );
}

/** L'onglet « Skin » : la couleur de sa balle, son motif et sa traînée */
export function BallPicker({ room, send }: { room: MinigolfRoomView; send: (msg: MinigolfClientMessage) => void }) {
  const { has } = useMyItems();
  const seat = room.seats.find((s) => s.id === room.you.seatId);
  const [local, setLocal] = useState<BallLook | null>(null);
  const current = local ?? seat?.look ?? DEFAULT_LOOK;
  const owns = (item: string, price: number) => price === 0 || has(item);

  // Le skin choisi sur cet appareil, repris en arrivant à la table
  useEffect(() => {
    const saved = savedLook();
    if (!saved || !seat || room.status === "playing") return;
    const usable = usableLook(saved, has);
    if (JSON.stringify(usable) !== JSON.stringify(seat.look)) send({ t: "look", look: usable });
    // Seulement à l'arrivée à la table
  }, [seat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!seat) return null;
  const choose = (patch: Partial<BallLook>) => {
    const next = { ...current, ...patch };
    setLocal(next);
    saveLook(next);
    send({ t: "look", look: next });
  };

  return (
    <section className="lobby-section panel mg-picker" aria-label="Ta balle">
      <div className="mg-picker-head">
        <BallSwatch look={current} size={84} />
        <div>
          <span className="field-label">Ta balle</span>
          <p className="hint" style={{ margin: 0 }}>
            Les balles des autres sont un peu transparentes : la tienne se voit toujours.
          </p>
        </div>
      </div>
      <span className="field-label">Couleur</span>
      <div className="mg-colors" role="radiogroup" aria-label="Couleur">
        {BALL_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={current.color === c.id}
            aria-label={c.name}
            title={c.name}
            className={`mg-color ${current.color === c.id ? "is-on" : ""}`}
            style={{ "--c": c.hex } as CSSProperties}
            onClick={() => choose({ color: c.id })}
          />
        ))}
      </div>
      <span className="field-label">Motif</span>
      <div className="mg-patterns" role="radiogroup" aria-label="Motif">
        {BALL_PATTERNS.map((p) => {
          const ok = owns(patternItem(p.id), p.price);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={current.pattern === p.id}
              disabled={!ok}
              className={`mg-pattern ${current.pattern === p.id ? "is-on" : ""} ${ok ? "" : "is-locked"}`}
              onClick={() => ok && choose({ pattern: p.id })}
              title={ok ? p.name : `${p.name} : ${p.price} points à la boutique`}
            >
              <BallSwatch look={{ ...current, pattern: p.id }} size={38} />
              <span>{p.name}</span>
              {!ok && <small className="num">{p.price} pts</small>}
            </button>
          );
        })}
      </div>
      <span className="field-label">Traînée</span>
      <div className="mg-trails" role="radiogroup" aria-label="Traînée">
        {TRAILS.map((t) => {
          const ok = owns(trailItem(t.id), t.price);
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={current.trail === t.id}
              disabled={!ok}
              className={`btn btn-sm ${current.trail === t.id ? "btn-primary" : ""}`}
              onClick={() => ok && choose({ trail: t.id })}
              title={ok ? t.name : `${t.name} : ${t.price} points à la boutique`}
            >
              {t.name}
              {!ok && <small className="num"> · {t.price} pts</small>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
