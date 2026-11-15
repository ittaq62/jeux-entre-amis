import { HABITUES, isTenueId, PALETTES } from "../../shared/games/culbute/fighters.ts";
import { isHabitueId } from "../../shared/games/culbute/model.ts";
import type { ShopItem } from "../../shared/shop.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { PropIcon } from "./FighterPicker.tsx";
import "./culbute.css";

/** Une tenue de Culbute à la boutique : l'Habitué, ses couleurs et son accessoire */
export function TenueLook({ item }: { item: ShopItem }) {
  const [who, tenue] = item.ref.split(":");
  if (!isHabitueId(who) || !isTenueId(tenue)) return null;
  const p = PALETTES[who][tenue];
  return (
    <span className="cb-tenue-look" style={{ background: `linear-gradient(160deg, ${p.top} 0 55%, ${p.bottom} 55% 100%)` }}>
      <AvatarDrawing avatar={HABITUES[who].avatar} size={40} />
      <span className="cb-tenue-prop" style={{ background: p.accent }}>
        <PropIcon style={who} size={20} />
      </span>
    </span>
  );
}
