// La tenue de son chef, au salon : le tablier, la toque, le couteau. Ce qui ne s'achète pas est à tout le monde ; le reste
// se débloque à la boutique. Le choix reste sur l'appareil (et suit le compte), d'une table à l'autre.

import { useEffect, useState } from "react";
import {
  APRON_COLORS,
  APRONS,
  DEFAULT_LOOK,
  isToqueLook,
  KNIVES,
  TOQUES,
  tqApronItem,
  tqKnifeItem,
  tqToqueItem,
  usableLook,
  type ShopThing,
  type ToqueLook,
} from "../../shared/games/toque/looks.ts";
import type { ToqueClientMessage, ToqueRoomView } from "../../shared/games/toque/net.ts";
import { useMyItems } from "../stores/shop.ts";

const STORE = "toque-tenue";

export function savedLook(): ToqueLook | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return isToqueLook(raw) ? raw : null;
  } catch {
    return null;
  }
}

function saveLook(l: ToqueLook) {
  try {
    localStorage.setItem(STORE, JSON.stringify(l));
  } catch {
    // pas de stockage : le choix vaut pour cette table
  }
}

/** Un tablier dessiné (sa couleur, son motif en quelques traits) */
export function ApronSwatch({ id, size = 28 }: { id: string; size?: number }) {
  const c = APRON_COLORS[id] ?? "#f4f1ea";
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="tq-swatch">
      <path d="M10 3h12v8l5 3-2 15H7L5 14l5-3z" fill={c} stroke="rgba(0,0,0,0.25)" />
      {id === "bistrot" && [12, 16, 20].map((x) => <path key={x} d={`M${x} 12v16`} stroke="#e9e4d6" strokeWidth="1.2" />)}
      {id === "vichy" && <path d="M8 16h16M8 21h16M12 12v16M20 12v16" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />}
      {id === "mariniere" && [14, 18, 22, 26].map((y) => <path key={y} d={`M7 ${y}h18`} stroke="#f4f1ea" strokeWidth="1.6" />)}
      {id === "tricolore" && (
        <>
          <path d="M7 14h6v15H7z" fill="#2c4fa3" />
          <path d="M19 14h6l-1 15h-5z" fill="#d63a3a" />
        </>
      )}
      {id === "fleuri" && [10, 16, 22].map((x, i) => <circle key={x} cx={x} cy={16 + (i % 2) * 6} r="2" fill="#c94f7c" />)}
      {id === "provence" && [11, 17, 23].map((x) => <circle key={x} cx={x} cy="20" r="1.8" fill="#2f5fa8" />)}
      <path d="M12 3c0 3 8 3 8 0" stroke="rgba(0,0,0,0.3)" fill="none" />
    </svg>
  );
}

/** Une toque dessinée */
export function ToqueSwatch({ id, size = 28 }: { id: string; size?: number }) {
  const gold = id === "doree";
  const dark = id === "noire";
  const fill = gold ? "#e2b74a" : dark ? "#1f1f24" : "#f7f5ef";
  if (id === "beret")
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="tq-swatch">
        <ellipse cx="17" cy="18" rx="12" ry="6" fill="#24304a" />
        <rect x="16" y="9" width="2" height="5" fill="#24304a" />
      </svg>
    );
  if (id === "bandana")
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="tq-swatch">
        <path d="M5 22a11 11 0 0 1 22 0z" fill="#c9362f" />
        <path d="M25 20l5 4-4 2z" fill="#c9362f" />
      </svg>
    );
  if (id === "pompon")
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="tq-swatch">
        <path d="M5 24a11 12 0 0 1 22 0z" fill="#d8443a" />
        <rect x="5" y="22" width="22" height="4" fill="#f2eee2" />
        <circle cx="16" cy="9" r="4" fill="#f2eee2" />
      </svg>
    );
  if (id === "calot")
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="tq-swatch">
        <path d="M4 22l4-8h16l4 8z" fill="#f7f5ef" stroke="rgba(0,0,0,0.2)" />
      </svg>
    );
  const tall = id === "haute" ? 6 : id === "courte" ? 14 : 10;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="tq-swatch">
      <rect x="9" y="22" width="14" height="5" rx="1" fill={fill} stroke="rgba(0,0,0,0.25)" />
      <path d={`M9 22l-1-${22 - tall}h16l-1 ${22 - tall}z`} fill={fill} stroke="rgba(0,0,0,0.2)" />
      <ellipse cx="16" cy={tall} rx="10" ry="5" fill={fill} stroke="rgba(0,0,0,0.2)" />
      {id === "rayee" && [12, 16, 20].map((x) => <path key={x} d={`M${x} ${tall + 2}v19`} stroke="#3a62b8" strokeWidth="1.5" />)}
    </svg>
  );
}

/** Un couteau dessiné */
export function KnifeSwatch({ id, size = 28 }: { id: string; size?: number }) {
  const blade = id === "ceramique" ? "#f4f4f2" : id === "or" ? "#f0c65a" : id === "damas" ? "#a7adb5" : "#d9dde2";
  const handle = id === "bois" ? "#8a6a3a" : id === "or" ? "#e0b443" : "#1f1f24";
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="tq-swatch">
      {id === "hachoir" ? (
        <rect x="12" y="6" width="14" height="10" rx="1" fill={blade} stroke="#5a6068" />
      ) : (
        <path d="M8 24L26 6l-2 9-12 12z" fill={blade} stroke="#5a6068" />
      )}
      <rect x="3" y="23" width="9" height="4" rx="1.5" fill={handle} transform="rotate(-45 7 25)" />
    </svg>
  );
}

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
  render: (t: ShopThing) => React.ReactNode;
}) {
  return (
    <>
      <span className="field-label">{title}</span>
      <div className="tq-choices" role="radiogroup" aria-label={title}>
        {list.map((t) => {
          const ok = owns(item(t.id), t.price);
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={value === t.id}
              disabled={!ok}
              className={`btn btn-sm tq-choice ${value === t.id ? "btn-primary" : ""} ${ok ? "" : "is-locked"}`}
              onClick={() => ok && onPick(t.id)}
              title={ok ? t.name : `${t.name} : ${t.price} points à la boutique`}
            >
              {render(t)}
              <span>{t.name}</span>
              {!ok && <small className="num">{t.price} pts</small>}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function LookPicker({ room, send }: { room: ToqueRoomView; send: (msg: ToqueClientMessage) => void }) {
  const { has } = useMyItems();
  const seat = room.seats.find((s) => s.id === room.you.seatId);
  const [local, setLocal] = useState<ToqueLook | null>(null);
  const current = local ?? seat?.look ?? DEFAULT_LOOK;
  const owns = (item: string, price: number) => price === 0 || has(item);

  // La tenue choisie sur cet appareil, reprise en arrivant à la table
  useEffect(() => {
    const saved = savedLook();
    if (!saved || !seat || room.status === "playing") return;
    const usable = usableLook(saved, has);
    if (JSON.stringify(usable) !== JSON.stringify(seat.look)) send({ t: "look", look: usable });
  }, [seat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!seat) return null;
  const choose = (patch: Partial<ToqueLook>) => {
    const next = { ...current, ...patch };
    setLocal(next);
    saveLook(next);
    send({ t: "look", look: next });
  };
  return (
    <section className="lobby-section panel tq-picker" aria-label="Ta tenue">
      <div className="tq-picker-head">
        <ToqueSwatch id={current.toque} size={56} />
        <ApronSwatch id={current.apron} size={64} />
        <KnifeSwatch id={current.knife} size={48} />
      </div>
      <Row
        title="Ton tablier"
        list={APRONS}
        value={current.apron}
        item={tqApronItem}
        owns={owns}
        onPick={(apron) => choose({ apron })}
        render={(t) => <ApronSwatch id={t.id} size={22} />}
      />
      <Row
        title="Ta toque"
        list={TOQUES}
        value={current.toque}
        item={tqToqueItem}
        owns={owns}
        onPick={(toque) => choose({ toque })}
        render={(t) => <ToqueSwatch id={t.id} size={22} />}
      />
      <Row
        title="Ton couteau"
        list={KNIVES}
        value={current.knife}
        item={tqKnifeItem}
        owns={owns}
        onPick={(knife) => choose({ knife })}
        render={(t) => <KnifeSwatch id={t.id} size={22} />}
      />
    </section>
  );
}
