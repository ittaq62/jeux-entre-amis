import { useId, useState } from "react";
import { SKINS, type SkinId } from "../../shared/games/naval/skins.ts";
import { navalItem, SHOP_BY_ID } from "../../shared/shop.ts";
import { Icon } from "../components/Icon.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { useMyItems } from "../stores/shop.ts";
import { CELL, hullFill, ShipShape, SkinDefs } from "./ships.tsx";

// Le choix du thème de sa flotte : la Marine pour tout le monde, les autres s'achètent avec ses points, dans l'ordre qu'on veut.

/** Les motifs des thèmes, une fois pour toute une liste d'aperçus */
export function NavalSkinDefs({ id }: { id: string }) {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <SkinDefs id={id} />
      </defs>
    </svg>
  );
}

/** Un croiseur sur l'eau, dans un thème */
export function NavalSkinPreview({ skin, defs }: { skin: SkinId; defs: string }) {
  const w = 4 * CELL;
  return (
    <svg className="skin-preview" viewBox={`-2 -2 ${w + 4} ${CELL + 4}`} aria-hidden="true">
      <rect x={-2} y={-2} width={w + 4} height={CELL + 4} rx={2} fill="#134e66" />
      <g style={{ ["--hull" as string]: hullFill(defs, skin, "#7c898e") }}>
        <ShipShape kind="croiseur" skin={skin} />
      </g>
    </svg>
  );
}

export function SkinPicker({
  current,
  onPick,
  side = false,
}: {
  current: SkinId;
  onPick: (skin: SkinId) => void;
  /** Au placement : une colonne à côté de la flotte, une bande au-dessus sur téléphone */
  side?: boolean;
}) {
  const defs = `skins${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { balance, has } = useMyItems();
  const [buying, setBuying] = useState<SkinId | null>(null);
  return (
    <div className={`field skin-field ${side ? "is-side" : ""}`}>
      <span className="field-label">Thème de ta flotte</span>
      <NavalSkinDefs id={defs} />
      <div className="skin-list" role="radiogroup" aria-label="Thème de ta flotte">
        {SKINS.map((s) => {
          const locked = !has(navalItem(s.id));
          return (
            <button
              key={s.id}
              type="button"
              className={`skin-option ${current === s.id ? "is-on" : ""} ${locked ? "is-locked" : ""}`}
              aria-pressed={current === s.id}
              onClick={() => (locked ? setBuying(s.id) : onPick(s.id))}
              title={locked ? `${s.name} : ${s.price} points` : s.name}
            >
              <NavalSkinPreview skin={s.id} defs={defs} />
              <span className="skin-name">{s.name}</span>
              {locked && (
                <span className="skin-lock">
                  <Icon name="coin" size={11} /> {s.price}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!side && (
        <p className="hint" style={{ margin: 0 }}>
          Tu as {balance} point{balance > 1 ? "s" : ""}. Touche un thème pour l'acheter, dans l'ordre que tu veux.
        </p>
      )}
      <BuyModal
        item={buying ? SHOP_BY_ID.get(navalItem(buying))! : null}
        preview={buying ? <NavalSkinPreview skin={buying} defs={defs} /> : undefined}
        onClose={() => setBuying(null)}
        onBought={() => buying && onPick(buying)}
      />
    </div>
  );
}
