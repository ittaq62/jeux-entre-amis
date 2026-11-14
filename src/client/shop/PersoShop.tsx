// Le rayon du personnage à la boutique : chaque article se montre sur son propre personnage. Ce qu'on a déjà se porte
// en un geste (l'éditeur s'ouvre avec, prêt à enregistrer) ; le reste s'achète par la fiche habituelle.

import { useState } from "react";
import { Link } from "wouter";
import { seededAvatar, wearing, type AvatarConfig } from "../../shared/avatar.ts";
import { SHOP_BY_ID, wearItem, type ShopItem } from "../../shared/shop.ts";
import { WEAR_BY_ID, WEAR_SLOT_NAMES, wearOf, type WearInfo, type WearSlot } from "../../shared/wardrobe.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { useSession } from "../stores/session.ts";

/** L'ordre des rayons : ce qui se voit le plus d'abord */
const SLOTS: WearSlot[] = ["hat", "outfit", "hair", "extra", "face", "eyes", "mouth", "bg", "frame", "fx"];

/** Son personnage avec cet article (sans chapeau pour bien voir une coiffure) */
export function wearingItem(me: AvatarConfig, info: WearInfo): AvatarConfig {
  const a = wearing(me, info.slot, info.id);
  return info.slot === "hair" ? { ...wearing(a, "hat", null), hat: 0 } : a;
}

export function useMyAvatar(): AvatarConfig {
  return useSession((s) => s.user?.avatar) ?? seededAvatar("boutique");
}

export function PersoShop({ balance, has, onBuy }: { balance: number; has: (item: string) => boolean; onBuy: (item: ShopItem) => void }) {
  const me = useMyAvatar();
  const [slot, setSlot] = useState<WearSlot>("hat");
  return (
    <section className="shop-section">
      <h2>
        Ton personnage <small className="hint">Ce qu'il porte, partout où on le voit : touche un article pour le voir sur toi</small>
      </h2>
      <div className="perso-tabs" role="tablist" aria-label="Rayons du personnage">
        {SLOTS.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={s === slot} onClick={() => setSlot(s)}>
            {WEAR_SLOT_NAMES[s]}
          </button>
        ))}
      </div>
      <div className="shop-grid">
        {wearOf(slot)
          .filter((i) => i.price > 0)
          .map((info) => {
            const id = wearItem(info.id);
            const mine = has(id);
            const worn = me.wear?.[info.slot] === info.id;
            const look = <AvatarDrawing avatar={wearingItem(me, info)} size={64} />;
            if (mine) {
              return (
                <Link
                  key={info.id}
                  href={`/personnage?essai=${info.id}&retour=/boutique`}
                  className={`shop-item is-mine-perso ${worn ? "is-worn" : ""}`}
                >
                  <span className="shop-look">{look}</span>
                  <span className="shop-name">{info.name}</span>
                  <span className="shop-mine">
                    <Icon name="check" size={14} /> {worn ? "Tu le portes" : "À toi : le porter"}
                  </span>
                </Link>
              );
            }
            return (
              <button
                key={info.id}
                type="button"
                className={`shop-item ${info.price > balance ? "is-dear" : ""}`}
                onClick={() => onBuy(SHOP_BY_ID.get(id)!)}
              >
                <span className="shop-look">{look}</span>
                <span className="shop-name">{info.name}</span>
                <span className="shop-price num">
                  <Icon name="coin" size={14} /> {info.price}
                </span>
              </button>
            );
          })}
      </div>
    </section>
  );
}

/** Dans la fiche d'achat : l'article sur son personnage, et de quoi l'essayer avec tout le reste */
export function PersoPreview({ item }: { item: ShopItem }) {
  const me = useMyAvatar();
  const info = WEAR_BY_ID.get(item.ref);
  if (!info) return null;
  return (
    <div className="perso-buy">
      <AvatarDrawing avatar={wearingItem(me, info)} size={150} />
      <Link href={`/personnage?essai=${info.id}&retour=/boutique`}>L'essayer avec le reste de ton personnage</Link>
    </div>
  );
}
