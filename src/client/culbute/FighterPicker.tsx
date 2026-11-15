import { useEffect, useState } from "react";
import { HABITUES, isFighterPick, PALETTES, TENUES, type FighterPick, type TenueId } from "../../shared/games/culbute/fighters.ts";
import { HABITUE_IDS, type HabitueId } from "../../shared/games/culbute/model.ts";
import type { CulbuteClientMessage, CulbuteRoomView } from "../../shared/games/culbute/net.ts";
import { STYLES } from "../../shared/games/culbute/styles.ts";
import { SHOP_BY_ID, tenueItem, type ShopItem } from "../../shared/shop.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { useSession } from "../stores/session.ts";
import { useMyItems } from "../stores/shop.ts";

const STORE = "culbute-combattant";

/** Le combattant choisi sur cet appareil (repris à chaque table) */
export function savedPick(): FighterPick | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return isFighterPick(raw) ? raw : null;
  } catch {
    return null;
  }
}

function savePick(p: FighterPick) {
  try {
    localStorage.setItem(STORE, JSON.stringify(p));
  } catch {
    // Pas de stockage : le choix vaut pour cette table
  }
}

/** L'accessoire de chaque style, en petit dessin */
export function PropIcon({ style, size = 28 }: { style: HabitueId; size?: number }) {
  const c = PALETTES[style].dimanche;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="cb-prop-icon">
      {style === "ginette" && (
        <>
          <path d="M11 12 a5 5 0 0 1 10 0" fill="none" stroke="#2a2a30" strokeWidth="2" />
          <rect x="6" y="12" width="20" height="14" rx="4" fill={c.prop} />
          <rect x="6" y="12" width="20" height="4" fill={c.accent} />
          <circle cx="16" cy="16" r="1.6" fill="#f2c94c" />
        </>
      )}
      {style === "marcel" && (
        <g stroke="#2a2a30" strokeWidth="2" fill="none">
          <path d="M9 4 L9 28 M23 4 L23 28" />
          <rect x="9" y="5" width="14" height="7" fill={c.prop} />
          <path d="M8 18 L24 18" stroke={c.prop} strokeWidth="4" />
        </g>
      )}
      {style === "huguette" && (
        <>
          <circle cx="20" cy="21" r="7" fill={c.prop} />
          <path d="M15 19 q5 -4 10 0 M14 23 q6 -3 12 1" stroke="#c2185b" strokeWidth="1.2" fill="none" />
          <path d="M5 5 L18 22 M9 3 L16 23" stroke="#cfcac0" strokeWidth="1.6" />
        </>
      )}
      {style === "raymond" && (
        <>
          <circle cx="12" cy="18" r="8" fill="#a9b2bc" stroke="#6d7680" />
          <path d="M6 15 q6 3 12 0" stroke="#6d7680" fill="none" />
          <circle cx="24" cy="24" r="3" fill="#e2c26a" />
        </>
      )}
      {style === "simone" && (
        <>
          <path d="M16 27 L4 10 A14 14 0 0 1 28 10 Z" fill={c.prop} />
          <path d="M16 27 L8 7 M16 27 L16 5 M16 27 L24 7" stroke={c.accent} strokeWidth="1.2" />
        </>
      )}
      {style === "lucien" && (
        <>
          <rect x="3" y="9" width="6" height="15" rx="1.5" fill={c.prop} />
          <rect x="23" y="9" width="6" height="15" rx="1.5" fill={c.prop} />
          <path d="M9 10 L11 23 L13 10 L15 23 L17 10 L19 23 L21 10 L23 23" stroke="#2b2b33" fill={c.accent} strokeWidth="1" />
        </>
      )}
    </svg>
  );
}

/** Le nom de ce qu'a choisi un siège (sous son nom au salon) */
export function pickLabel(p: FighterPick): string {
  return p.who === "moi" ? `Son perso, style ${HABITUES[p.style].name}` : HABITUES[p.who].name;
}

/** Le choix de son combattant : un Habitué (et sa tenue), ou son propre personnage avec le style d'un Habitué */
export function FighterPicker({ room, send }: { room: CulbuteRoomView; send: (msg: CulbuteClientMessage) => void }) {
  const me = useSession((s) => s.user);
  const { has } = useMyItems();
  const seat = room.seats.find((s) => s.id === room.you.seatId);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const current = seat?.fighter ?? null;

  // Le choix fait sur cet appareil, repris en arrivant à la table
  useEffect(() => {
    const saved = savedPick();
    if (!saved || !current || room.status === "playing") return;
    if (saved.who !== "moi" && saved.tenue && !has(tenueItem(saved.who, saved.tenue))) return;
    if (JSON.stringify(saved) !== JSON.stringify(current)) send({ t: "pick", fighter: saved });
    // Seulement à l'arrivée à la table
  }, [seat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!seat || !current) return null;
  const choose = (p: FighterPick) => {
    savePick(p);
    send({ t: "pick", fighter: p });
  };
  const style = current.who === "moi" ? current.style : current.who;
  const tenue: TenueId = current.who !== "moi" ? (current.tenue ?? "dimanche") : "dimanche";
  const st = STYLES[style];

  return (
    <section className="lobby-section panel cb-picker" aria-label="Ton combattant">
      <span className="field-label">Ton combattant</span>
      <div className="cb-roster" role="radiogroup" aria-label="Combattant">
        {HABITUE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current.who === id}
            className={`cb-card ${current.who === id ? "is-on" : ""}`}
            onClick={() => choose({ who: id })}
          >
            <AvatarDrawing avatar={HABITUES[id].avatar} size={46} />
            <strong>{HABITUES[id].name}</strong>
            <span className="cb-card-prop">
              <PropIcon style={id} size={18} />
            </span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={current.who === "moi"}
          className={`cb-card is-me ${current.who === "moi" ? "is-on" : ""}`}
          onClick={() => choose({ who: "moi", style })}
        >
          {me ? <AvatarDrawing avatar={me.avatar} size={46} /> : null}
          <strong>Toi</strong>
          <span className="cb-card-prop">avatar</span>
        </button>
      </div>

      {current.who === "moi" ? (
        <div className="field">
          <span className="field-label">Avec le style de…</span>
          <div className="cb-styles">
            {HABITUE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={style === id}
                className={`cb-style ${style === id ? "is-on" : ""}`}
                onClick={() => choose({ who: "moi", style: id })}
              >
                <PropIcon style={id} size={22} />
                <span>{HABITUES[id].name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="field">
          <span className="field-label">Tenue</span>
          <div className="cb-tenues">
            {TENUES.map((t) => {
              const item = tenueItem(current.who as HabitueId, t.id);
              const owned = has(item);
              const p = PALETTES[current.who as HabitueId][t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tenue === t.id}
                  className={`cb-tenue ${tenue === t.id ? "is-on" : ""} ${owned ? "" : "is-locked"}`}
                  title={owned ? t.name : `${t.name} : ${t.price} points à la boutique`}
                  onClick={() => {
                    if (!owned) setBuying(SHOP_BY_ID.get(item) ?? null);
                    else choose(t.id === "dimanche" ? { who: current.who as HabitueId } : { who: current.who as HabitueId, tenue: t.id });
                  }}
                >
                  <span className="cb-swatch" style={{ background: `linear-gradient(135deg, ${p.top} 50%, ${p.prop} 50%)` }} />
                  <span>{t.name}</span>
                  {!owned && <small>{t.price} pts</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="cb-style-blurb">
        <PropIcon style={style} size={24} />
        <span>
          <strong>
            {st.kind}, {st.prop}.
          </strong>{" "}
          {st.blurb}
        </span>
      </p>
      <BuyModal
        item={buying}
        onClose={() => setBuying(null)}
        onBought={(item) => {
          const [, who, t] = item.id.split(":") as [string, HabitueId, TenueId];
          choose({ who, tenue: t });
        }}
      />
    </section>
  );
}
