// Le skin du bowling, au salon : la main avec laquelle on lance, la couleur et le motif de sa boule, sa traînée, ce qui
// éclate quand on fait un strike, sa danse, et ses quilles. Ce qui ne s'achète pas est à tout le monde ; le reste se
// débloque à la boutique. Le choix reste sur l'appareil, d'une table à l'autre.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BALL_COLORS,
  BALL_PATTERNS,
  bowlDanceItem,
  bowlFxItem,
  bowlPatternItem,
  bowlPinsItem,
  bowlTrailItem,
  DANCES,
  DEFAULT_LOOK,
  isBowlingLook,
  PIN_SKINS,
  STRIKE_FX,
  TRAILS,
  usableLook,
  type BowlingLook,
  type ShopThing,
} from "../../shared/games/bowling/looks.ts";
import type { BowlingClientMessage, BowlingRoomView } from "../../shared/games/bowling/net.ts";
import { Options } from "../components/ui.tsx";
import { useMyItems } from "../stores/shop.ts";
import { ballCanvas } from "./scene/textures.ts";

const STORE = "bowling-skin";

export function savedLook(): BowlingLook | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return isBowlingLook(raw) ? raw : null;
  } catch {
    return null;
  }
}

function saveLook(l: BowlingLook) {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    // Pas de stockage : le choix vaut pour cette table
  }
}

/**
 * Les vignettes déjà dessinées, par couleur, motif et finesse : la boutique et le salon en montrent des dizaines, et
 * chacune demande sinon tout le motif de la boule, pixel par pixel, puis son image (au téléphone, plusieurs secondes)
 */
const swatches = new Map<string, string>();

function swatchUrl(look: Pick<BowlingLook, "color" | "pattern">, size: number): string {
  // La vignette montre la moitié du motif sur `size` points : assez de pixels pour l'écran (au-delà de deux pixels par
  // point, sur une si petite boule, l'œil ne voit plus la différence), sans dépasser la boule en jeu
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const width = Math.min(512, Math.max(64, Math.ceil((2 * size * dpr) / 64) * 64));
  const key = `${look.color}|${look.pattern}|${width}`;
  let url = swatches.get(key);
  if (!url) {
    url = ballCanvas(look, width).toDataURL();
    swatches.set(key, url);
  }
  return url;
}

/** Une boule dessinée (son motif posé sur un disque ombré et verni) */
export function BallSwatch({ look, size = 56 }: { look: Pick<BowlingLook, "color" | "pattern">; size?: number }) {
  const url = useMemo(() => swatchUrl(look, size), [look.color, look.pattern, size]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span
      className="bw-swatch"
      style={
        {
          display: "inline-block",
          flex: "none",
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundImage: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 32%), url(${url})`,
          backgroundSize: "100% 100%, 200% 100%",
          backgroundPosition: "center, 25% 50%",
          boxShadow: "inset -7px -9px 16px rgba(0,0,0,0.45), inset 3px 4px 8px rgba(255,255,255,0.25), 0 3px 6px rgba(0,0,0,0.25)",
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}

/** Une ligne de choix : les éléments d'un catalogue, verrouillés s'ils ne sont pas à lui */
function Row({
  title,
  list,
  value,
  item,
  owns,
  onPick,
  render,
}: {
  title: string;
  list: ShopThing[];
  value: string;
  item: (id: string) => string;
  owns: (item: string, price: number) => boolean;
  onPick: (id: string) => void;
  render?: (t: ShopThing) => React.ReactNode;
}) {
  return (
    <>
      <span className="field-label">{title}</span>
      <div className="bw-choices" role="radiogroup" aria-label={title}>
        {list.map((t) => {
          const ok = owns(item(t.id), t.price);
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={value === t.id}
              disabled={!ok}
              className={`btn btn-sm bw-choice ${value === t.id ? "btn-primary" : ""} ${ok ? "" : "is-locked"}`}
              onClick={() => ok && onPick(t.id)}
              title={ok ? t.name : `${t.name} : ${t.price} points à la boutique`}
            >
              {render?.(t)}
              <span>{t.name}</span>
              {!ok && <small className="num">{t.price} pts</small>}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function LookPicker({ room, send }: { room: BowlingRoomView; send: (msg: BowlingClientMessage) => void }) {
  const { has } = useMyItems();
  const seat = room.seats.find((s) => s.id === room.you.seatId);
  const [local, setLocal] = useState<BowlingLook | null>(null);
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
  const choose = (patch: Partial<BowlingLook>) => {
    const next = { ...current, ...patch };
    setLocal(next);
    saveLook(next);
    send({ t: "look", look: next });
  };

  return (
    <section className="lobby-section panel bw-picker" aria-label="Ta boule">
      <div className="bw-picker-head">
        <BallSwatch look={current} size={84} />
        <div>
          <span className="field-label">Ta boule</span>
          <Options<"droite" | "gauche">
            label="Ta main"
            value={current.left ? "gauche" : "droite"}
            onChange={(v) => choose({ left: v === "gauche" })}
            options={[
              { value: "droite", label: "Droitier" },
              { value: "gauche", label: "Gaucher" },
            ]}
          />
        </div>
      </div>
      <span className="field-label">Couleur</span>
      <div className="bw-colors" role="radiogroup" aria-label="Couleur">
        {BALL_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={current.color === c.id}
            aria-label={c.name}
            title={c.name}
            className={`bw-color ${current.color === c.id ? "is-on" : ""}`}
            style={{ "--c": c.hex, "--a": c.accent } as CSSProperties}
            onClick={() => choose({ color: c.id })}
          />
        ))}
      </div>
      <Row
        title="Motif"
        list={BALL_PATTERNS}
        value={current.pattern}
        item={bowlPatternItem}
        owns={owns}
        onPick={(pattern) => choose({ pattern })}
        render={(t) => <BallSwatch look={{ color: current.color, pattern: t.id }} size={34} />}
      />
      <Row title="Traînée" list={TRAILS} value={current.trail} item={bowlTrailItem} owns={owns} onPick={(trail) => choose({ trail })} />
      <Row
        title="Quand tu fais un strike"
        list={STRIKE_FX}
        value={current.fx}
        item={bowlFxItem}
        owns={owns}
        onPick={(fx) => choose({ fx })}
      />
      <Row
        title="Ta danse de victoire"
        list={DANCES}
        value={current.dance}
        item={bowlDanceItem}
        owns={owns}
        onPick={(dance) => choose({ dance })}
      />
      <Row title="Tes quilles" list={PIN_SKINS} value={current.pins} item={bowlPinsItem} owns={owns} onPick={(pins) => choose({ pins })} />
    </section>
  );
}
