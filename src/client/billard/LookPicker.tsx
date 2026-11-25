// Le skin du billard, au salon : sa queue (on la voit quand c'est soi qui joue), l'effet de ses beaux coups, et pour la
// table qu'on ouvre, le tapis et le jeu de billes. Ce qui ne s'achète pas est à tout le monde ; le reste se débloque à la
// boutique. Le choix reste sur l'appareil, d'une table à l'autre.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BALL_SETS,
  bilClothItem,
  bilCueItem,
  bilFxItem,
  bilSetItem,
  CLOTH_COLORS,
  CLOTHS,
  CUES,
  DEFAULT_LOOK,
  isBillardLook,
  SHOT_FX,
  usableLook,
  type BillardLook,
  type ShopThing,
} from "../../shared/games/billard/looks.ts";
import type { BillardClientMessage, BillardRoomView } from "../../shared/games/billard/net.ts";
import { useMyItems } from "../stores/shop.ts";
import { cueCanvas, drawBall } from "./scene/textures.ts";

const STORE = "billard-skin";

export function savedLook(): BillardLook | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return isBillardLook(raw) ? raw : null;
  } catch {
    return null;
  }
}

function saveLook(l: BillardLook) {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    // Pas de stockage : le choix vaut pour cette table
  }
}

const cueCache = new Map<string, string>();
/**
 * La queue dessinée à plat, la pointe à droite. Son habit est dessiné directement à la taille de la vignette (24 × 512) :
 * la texture du jeu (128 × 2048, veinée pixel par pixel) coûtait près d'une seconde de processeur à la boutique au téléphone
 */
export function cueImage(style: string): string {
  const hit = cueCache.get(style);
  if (hit) return hit;
  const src = cueCanvas(style, 24, 512);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 24;
  const g = c.getContext("2d")!;
  // Le fût s'affine vers la pointe : on dessine l'habit couché, puis on taille la forme
  g.save();
  g.translate(512, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  g.restore();
  g.globalCompositeOperation = "destination-in";
  g.beginPath();
  g.moveTo(0, 2);
  g.lineTo(512, 8);
  g.lineTo(512, 16);
  g.lineTo(0, 22);
  g.closePath();
  g.fill();
  const url = c.toDataURL();
  cueCache.set(style, url);
  return url;
}

export function CueSwatch({ style, width = 160 }: { style: string; width?: number }) {
  const url = useMemo(() => cueImage(style), [style]);
  return <img className="bl-cue-swatch" src={url} width={width} height={Math.round((width * 24) / 512)} alt="" aria-hidden="true" />;
}

const ballUrls = new Map<string, string>();
/**
 * L'image d'une bille pour une vignette : dessinée directement à la taille où on la montre (2,6 fois, pour les écrans
 * fins) et encodée une seule fois ; la texture du jeu (512 × 256, veinée pixel par pixel pour le bois, le marbre et les
 * planètes) puis réduite coûtait plusieurs secondes de processeur à la boutique au téléphone
 */
function ballImage(id: number, set: string, carom: boolean, size: number): string {
  const h = Math.max(32, Math.min(128, Math.ceil(size * 2.6)));
  const key = `${id}|${set}|${carom ? 1 : 0}|${h}`;
  const hit = ballUrls.get(key);
  if (hit) return hit;
  const url = drawBall(id, set, carom, h * 2).toDataURL();
  ballUrls.set(key, url);
  return url;
}

/** Une bille dessinée (son image posée sur un disque ombré et verni) */
export function BallDot({ id, set, size = 22, carom = false }: { id: number; set: string; size?: number; carom?: boolean }) {
  const url = useMemo(() => ballImage(id, set, carom, size), [id, set, carom, size]);
  return (
    <span
      className="bl-ball-dot"
      style={
        {
          width: size,
          height: size,
          backgroundImage: `radial-gradient(circle at 34% 30%, rgba(255,255,255,0.6), rgba(255,255,255,0) 30%), url(${url})`,
          backgroundSize: "100% 100%, 200% 100%",
          backgroundPosition: "center, 25% 50%",
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}

export function ClothSwatch({ cloth, size = 22 }: { cloth: string; size?: number }) {
  const [c, d] = CLOTH_COLORS[cloth] ?? CLOTH_COLORS.vert!;
  return (
    <span
      className="bl-cloth-dot"
      style={{ width: size, height: size, background: `radial-gradient(circle at 40% 35%, ${c}, ${d})` }}
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
      <div className="bl-choices" role="radiogroup" aria-label={title}>
        {list.map((t) => {
          const ok = owns(item(t.id), t.price);
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={value === t.id}
              disabled={!ok}
              className={`btn btn-sm bl-choice ${value === t.id ? "btn-primary" : ""} ${ok ? "" : "is-locked"}`}
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

export function LookPicker({ room, send }: { room: BillardRoomView; send: (msg: BillardClientMessage) => void }) {
  const { has } = useMyItems();
  const seat = room.seats.find((s) => s.id === room.you.seatId);
  const [local, setLocal] = useState<BillardLook | null>(null);
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
  const choose = (patch: Partial<BillardLook>) => {
    const next = { ...current, ...patch };
    setLocal(next);
    saveLook(next);
    send({ t: "look", look: next });
  };
  const host = room.you.isHost;

  return (
    <section className="lobby-section panel bl-picker" aria-label="Ta queue">
      <div className="bl-picker-head">
        <CueSwatch style={current.cue} width={220} />
        <span className="bl-picker-balls">
          {[1, 9, 8, 3, 0].map((id) => (
            <BallDot key={id} id={id} set={current.set} size={26} />
          ))}
        </span>
      </div>
      <Row
        title="Ta queue"
        list={CUES}
        value={current.cue}
        item={bilCueItem}
        owns={owns}
        onPick={(cue) => choose({ cue })}
        render={(t) => <CueSwatch style={t.id} width={64} />}
      />
      <Row title="Sur tes beaux coups" list={SHOT_FX} value={current.fx} item={bilFxItem} owns={owns} onPick={(fx) => choose({ fx })} />
      <Row
        title={host ? "Le tapis de ta table" : "Ton tapis (quand c'est toi qui ouvres la table)"}
        list={CLOTHS}
        value={current.cloth}
        item={bilClothItem}
        owns={owns}
        onPick={(cloth) => choose({ cloth })}
        render={(t) => <ClothSwatch cloth={t.id} size={18} />}
      />
      <Row
        title={host ? "Les billes de ta table" : "Tes billes (quand c'est toi qui ouvres la table)"}
        list={BALL_SETS}
        value={current.set}
        item={bilSetItem}
        owns={owns}
        onPick={(set) => choose({ set })}
        render={(t) => <BallDot id={11} set={t.id} size={18} />}
      />
    </section>
  );
}
