import { useState } from "react";
import { BACKS, type BackId } from "../../shared/games/uno/backs.ts";
import { SHOP_BY_ID, unoItem } from "../../shared/shop.ts";
import { CardBack } from "../components/Card.tsx";
import { Icon } from "../components/Icon.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { useMyItems } from "../stores/shop.ts";

// Le dos de ses cartes au UNO : le classique pour tout le monde, les autres s'achètent avec ses points. Ses
// adversaires voient ce dos sur les cartes qu'il a en main.

export function BackPicker({ current, onPick }: { current: BackId; onPick: (back: BackId) => void }) {
  const { balance, has } = useMyItems();
  const [buying, setBuying] = useState<BackId | null>(null);
  return (
    <div className="field back-field">
      <span className="field-label">Dos de tes cartes</span>
      <div className="back-list" role="radiogroup" aria-label="Dos de tes cartes">
        {BACKS.map((b) => {
          const locked = !has(unoItem(b.id));
          return (
            <button
              key={b.id}
              type="button"
              className={`back-option ${current === b.id ? "is-on" : ""} ${locked ? "is-locked" : ""}`}
              aria-pressed={current === b.id}
              onClick={() => (locked ? setBuying(b.id) : onPick(b.id))}
              title={locked ? `${b.name} : ${b.price} points` : b.name}
            >
              <CardBack width={38} skin={b.id} />
              <span className="back-name">{b.name}</span>
              {locked && (
                <span className="back-lock">
                  <Icon name="coin" size={10} /> {b.price}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Tes adversaires le voient sur les cartes que tu as en main. Tu as {balance} point{balance > 1 ? "s" : ""} : touche un dos pour
        l'acheter.
      </p>
      <BuyModal
        item={buying ? SHOP_BY_ID.get(unoItem(buying))! : null}
        preview={buying ? <CardBack width={120} skin={buying} /> : undefined}
        onClose={() => setBuying(null)}
        onBought={() => buying && onPick(buying)}
      />
    </div>
  );
}
