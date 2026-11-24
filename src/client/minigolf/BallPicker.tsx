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
    // Son style tient tout seul : l'aperçu sert aussi à la boutique, où la feuille du minigolf n'est pas chargée
    <span
      className="mg-swatch"
      style={
        {
          "--size": `${size}px`,
          display: "inline-block",
          flex: "none",
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundImage: `url(${url})`,
          backgroundSize: "200% 100%",
          backgroundPosition: "25% 50%",
          boxShadow: "inset -6px -8px 14px rgba(0,0,0,0.35), inset 4px 5px 10px rgba(255,255,255,0.55), 0 3px 6px rgba(0,0,0,0.2)",
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}

/** L'aperçu d'une traînée : une balle qui file vers la droite, et ce qu'elle laisse derrière elle */
export function TrailSwatch({ trail, size = 56 }: { trail: string; size?: number }) {
  const w = size * 1.8;
  const h = size;
  const y = h * 0.55;
  const bx = w - h * 0.32;
  const r = h * 0.2;
  // Des points le long du chemin, de la queue (0) jusqu'à la balle (1)
  const along = (n: number) => Array.from({ length: n }, (_, i) => i / (n - 1));
  const wave = (u: number) => y + Math.sin(u * Math.PI * 2.2) * h * 0.06;
  const xAt = (u: number) => w * 0.06 + (bx - r - w * 0.06) * u;
  let fx: React.ReactNode = null;
  if (trail === "fil")
    fx = (
      <path
        d={`M ${xAt(0)} ${wave(0)} ${along(12)
          .map((u) => `L ${xAt(u)} ${wave(u)}`)
          .join(" ")}`}
        stroke="url(#fil)"
        strokeWidth={h * 0.04}
        fill="none"
        strokeLinecap="round"
      />
    );
  else if (trail === "arcenciel")
    fx = (
      <path
        d={`M ${xAt(0)} ${wave(0)} ${along(12)
          .map((u) => `L ${xAt(u)} ${wave(u)}`)
          .join(" ")}`}
        stroke="url(#arc)"
        strokeWidth={h * 0.13}
        fill="none"
        strokeLinecap="round"
        opacity={0.9}
      />
    );
  else if (trail === "etincelles")
    fx = along(14).map((u, i) => (
      <circle
        key={i}
        cx={xAt(u) + Math.sin(i * 7) * 3}
        cy={wave(u) + Math.cos(i * 5) * h * 0.12}
        r={h * (0.015 + u * 0.03)}
        fill={i % 3 ? "#ffd75a" : "#fff6c8"}
        opacity={0.3 + u * 0.7}
      />
    ));
  else if (trail === "bulles")
    fx = along(8).map((u, i) => (
      <circle
        key={i}
        cx={xAt(u)}
        cy={wave(u) - (1 - u) * h * 0.22 + Math.sin(i * 3) * 3}
        r={h * (0.04 + (i % 3) * 0.02)}
        fill="rgba(190,235,255,0.25)"
        stroke="#bfeaff"
        strokeWidth={1.2}
        opacity={0.4 + u * 0.6}
      />
    ));
  else if (trail === "confettis")
    fx = along(14).map((u, i) => (
      <rect
        key={i}
        x={xAt(u)}
        y={wave(u) + Math.sin(i * 9) * h * 0.2}
        width={h * 0.06}
        height={h * 0.06}
        fill={`hsl(${(i * 67) % 360} 85% 55%)`}
        transform={`rotate(${i * 37} ${xAt(u)} ${wave(u)})`}
        opacity={0.5 + u * 0.5}
      />
    ));
  else if (trail === "flammes")
    fx = along(10).map((u, i) => (
      <ellipse
        key={i}
        cx={xAt(0.3 + u * 0.7)}
        cy={y - u * 2}
        rx={h * (0.05 + u * 0.1)}
        ry={h * (0.04 + u * 0.07)}
        fill={u > 0.6 ? "#ffd75a" : u > 0.3 ? "#ff8a2a" : "#e2401a"}
        opacity={0.25 + u * 0.6}
      />
    ));
  return (
    <svg className="mg-trail-swatch" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id="fil" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="arc" x1="0" x2="1">
          <stop offset="0" stopColor="#ff4a4a" stopOpacity="0.1" />
          <stop offset="0.25" stopColor="#ffb23a" />
          <stop offset="0.5" stopColor="#f5e64a" />
          <stop offset="0.7" stopColor="#4ad06a" />
          <stop offset="0.85" stopColor="#3a8aff" />
          <stop offset="1" stopColor="#a05aff" />
        </linearGradient>
        <radialGradient id="balle" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9c4b8" />
        </radialGradient>
      </defs>
      <rect width={w} height={h} rx={h * 0.18} fill="#1d3a2a" />
      {fx}
      <circle cx={bx} cy={y} r={r} fill="url(#balle)" />
    </svg>
  );
}

/** L'onglet « Skin » : la couleur de sa balle, son motif et sa traînée */
export function BallPicker({ room, send }: { room: MinigolfRoomView; send: (msg: MinigolfClientMessage) => void }) {
  const { has } = useMyItems();
  const seat = room.seats.find((s) => s.id === room.you.seatId);
  const [local, setLocal] = useState<BallLook | null>(null);
  const current = local ?? seat?.look ?? DEFAULT_LOOK;
  const owns = (item: string, price: number) => price === 0 || has(item);
  // Ce que la table a retenu fait foi (une couleur déjà prise devient la suivante de libre)
  const kept = seat ? JSON.stringify(seat.look) : "";
  useEffect(() => setLocal(null), [kept]);
  // Une couleur par balle : celles des autres joueurs (un bot, lui, cède la sienne)
  const takenBy = new Map(room.seats.filter((s) => s.kind === "human" && s.id !== seat?.id).map((s) => [s.look.color, s.name]));

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
        {BALL_COLORS.map((c) => {
          const owner = takenBy.get(c.id);
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={current.color === c.id}
              aria-label={owner ? `${c.name}, la balle de ${owner}` : c.name}
              title={owner ? `${c.name} : la balle de ${owner}` : c.name}
              className={`mg-color ${current.color === c.id ? "is-on" : ""} ${owner ? "is-taken" : ""}`}
              style={{ "--c": c.hex } as CSSProperties}
              disabled={Boolean(owner)}
              onClick={() => choose({ color: c.id })}
            />
          );
        })}
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
              {t.id !== "aucune" && <TrailSwatch trail={t.id} size={18} />}
              {t.name}
              {!ok && <small className="num"> · {t.price} pts</small>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
