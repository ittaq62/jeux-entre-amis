import { useState, type ReactNode } from "react";
import type { ShopItem } from "../../shared/shop.ts";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/ui.tsx";
import { ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useShop } from "../stores/shop.ts";

const points = (n: number) => `${n} point${n > 1 ? "s" : ""}`;

/** Acheter un article : ce qu'il coûte, ce qu'il reste, et une seule confirmation. */
export function BuyModal({
  item,
  preview,
  onClose,
  onBought,
}: {
  item: ShopItem | null;
  preview?: ReactNode;
  onClose: () => void;
  onBought?: (item: ShopItem) => void;
}) {
  const balance = useShop((s) => s.balance);
  const buy = useShop((s) => s.buy);
  const [busy, setBusy] = useState(false);
  const missing = item ? Math.max(0, item.price - balance) : 0;

  async function confirm() {
    if (!item || busy) return;
    setBusy(true);
    try {
      await buy(item.id);
      toast({ tone: "gold", title: `${item.name} est à toi !` });
      onBought?.(item);
      onClose();
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Achat impossible pour l'instant." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={item !== null} onClose={onClose} title={item?.name}>
      {item && (
        <div className="buy-sheet">
          {preview && <div className="buy-preview">{preview}</div>}
          <dl className="buy-lines">
            <div>
              <dt>Prix</dt>
              <dd className="num">{points(item.price)}</dd>
            </div>
            <div>
              <dt>Tu as</dt>
              <dd className="num">{points(balance)}</dd>
            </div>
          </dl>
          {missing > 0 && <p className="hint buy-missing">Il te manque {points(missing)} : chaque partie bien placée t'en rapporte.</p>}
          <button className="btn btn-primary btn-block" disabled={missing > 0 || busy} onClick={() => void confirm()}>
            <Icon name="coin" size={18} /> {missing > 0 ? "Pas assez de points" : `Acheter pour ${points(item.price)}`}
          </button>
        </div>
      )}
    </Modal>
  );
}
