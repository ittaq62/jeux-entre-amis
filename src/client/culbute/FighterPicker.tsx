import { useEffect, useState } from "react";
import { TenueStage } from "./TenueLook.tsx";
import { HABITUES, isFighterPick, PALETTES, TENUES, type FighterPick, type TenueId } from "../../shared/games/culbute/fighters.ts";
import { HABITUE_IDS, type HabitueId } from "../../shared/games/culbute/model.ts";
import type { CulbuteClientMessage, CulbuteRoomView } from "../../shared/games/culbute/net.ts";
import { STYLES } from "../../shared/games/culbute/styles.ts";
import { SHOP_BY_ID, tenueItem, type ShopItem } from "../../shared/shop.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { useSession } from "../stores/session.ts";
import { useMyItems } from "../stores/shop.ts";
import { FighterStageView, lookOfPick } from "./FighterStageView.tsx";
import { PropIcon } from "./PropIcon.tsx";

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
  /** La tenue survolée : la vitrine la montre avant qu'on la choisisse (ou qu'on l'achète) */
  const [trying, setTrying] = useState<TenueId | null>(null);
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
  const meLook = me ? { name: me.pseudo, avatar: me.avatar } : null;
  const shown = lookOfPick(current, meLook, current.who !== "moi" ? (trying ?? tenue) : undefined);

  return (
    <section className="lobby-section panel cb-picker" aria-label="Ton combattant">
      <span className="field-label">Ton combattant</span>
      <FighterStageView
        look={shown}
        ratio={16 / 9}
        className="cb-stage-view"
        label={`${shown.name}${current.who !== "moi" ? `, tenue ${TENUES.find((t) => t.id === (trying ?? tenue))?.name ?? ""}` : ""}`}
      />
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
                  onMouseEnter={() => setTrying(t.id)}
                  onMouseLeave={() => setTrying(null)}
                  onFocus={() => setTrying(t.id)}
                  onBlur={() => setTrying(null)}
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
        preview={buying ? <TenueStage item={buying} /> : undefined}
        onClose={() => setBuying(null)}
        onBought={(item) => {
          const [, who, t] = item.id.split(":") as [string, HabitueId, TenueId];
          choose({ who, tenue: t });
        }}
      />
    </section>
  );
}
