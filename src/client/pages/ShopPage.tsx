import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import { SKINS as KART_SKINS, VEHICLES, type SkinId as KartSkinId, type VehicleId } from "../../shared/games/bolides/garage.ts";
import type { TokenId } from "../../shared/games/capitale/tokens.ts";
import type { SkinId as NavalSkinId } from "../../shared/games/naval/skins.ts";
import type { GameId } from "../../shared/protocol.ts";
import { SHOP_ITEMS, type ShopItem, type ShopKind } from "../../shared/shop.ts";
import { VehiclePreview } from "../bolides/Garage.tsx";
import { KART_COLORS } from "../bolides/scene/kart.ts";
import { PAWN_COLORS } from "../capitale/boardUi.ts";
import { tokenThumbnails } from "../capitale/scene/tokens.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Icon } from "../components/Icon.tsx";
import { NavalSkinDefs, NavalSkinPreview } from "../naval/SkinPicker.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { useSession } from "../stores/session.ts";
import { useMyItems } from "../stores/shop.ts";

const SECTIONS: { kind: ShopKind; game: GameId; title: string; note: string }[] = [
  { kind: "naval", game: "naval", title: "Bataille navale", note: "Les thèmes de ta flotte" },
  { kind: "token", game: "capitale", title: "Capitale", note: "Tes pions" },
  { kind: "vehicle", game: "bolides", title: "Bolides", note: "Tes véhicules, chacun sa conduite" },
  { kind: "kart", game: "bolides", title: "Bolides", note: "Tes skins" },
];

/** Tout ce qui s'achète avec ses points, dans l'ordre qu'on veut */
export function ShopPage() {
  const user = useSession((s) => s.user);
  const games = useSession((s) => s.games);
  const { balance, has } = useMyItems();
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const defs = `shop${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const hasCapitale = games.includes("capitale");
  const thumbs = useMemo(() => (hasCapitale ? tokenThumbnails(PAWN_COLORS[0]!) : null), [hasCapitale]);

  const look = (item: ShopItem): ReactNode => {
    if (item.kind === "naval") return <NavalSkinPreview skin={item.ref as NavalSkinId} defs={defs} />;
    if (item.kind === "token") {
      const src = thumbs?.[item.ref as TokenId];
      return src ? <img src={src} alt="" width={64} height={64} draggable={false} /> : null;
    }
    if (item.kind === "kart") {
      const [a, b] = KART_SKINS[item.ref as KartSkinId].swatch;
      return <span className="shop-swatch" style={{ "--a": a, "--b": b } as CSSProperties} />;
    }
    return null;
  };

  const bigPreview = (item: ShopItem): ReactNode => {
    if (item.kind === "vehicle" || item.kind === "kart") {
      return (
        <VehiclePreview
          vehicle={item.kind === "vehicle" ? (item.ref as VehicleId) : "kart"}
          skin={item.kind === "kart" ? (item.ref as KartSkinId) : "usine"}
          color={KART_COLORS[0]!}
          avatar={user?.avatar ?? seededAvatar("boutique")}
          name={user?.pseudo ?? ""}
        />
      );
    }
    return look(item);
  };

  return (
    <div className="felt page">
      <AppHeader />
      <main className="narrow">
        <div className="page-heading">
          <h1>Boutique</h1>
        </div>

        <section className="shop-balance panel">
          <Icon name="coin" size={34} />
          <div>
            <p className="shop-balance-line">
              <strong className="num">{balance}</strong> point{balance > 1 ? "s" : ""} à dépenser
            </p>
            <p className="hint">
              Chaque partie bien placée t'en rapporte. Prends ce que tu veux, dans l'ordre que tu veux : dépenser ne change rien à ton
              classement.
            </p>
          </div>
        </section>

        <NavalSkinDefs id={defs} />

        {SECTIONS.filter((s) => games.includes(s.game)).map((section) => (
          <section key={section.kind} className="shop-section">
            <h2>
              {section.title} <small className="hint">{section.note}</small>
            </h2>
            <div className="shop-grid">
              {SHOP_ITEMS.filter((i) => i.kind === section.kind && i.price > 0).map((item) => {
                const mine = has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`shop-item ${mine ? "is-mine" : ""} ${!mine && item.price > balance ? "is-dear" : ""}`}
                    disabled={mine}
                    onClick={() => setBuying(item)}
                  >
                    {look(item) && <span className="shop-look">{look(item)}</span>}
                    <span className="shop-name">{item.name}</span>
                    {item.kind === "vehicle" && <span className="shop-blurb">{VEHICLES[item.ref as VehicleId].blurb}</span>}
                    {mine ? (
                      <span className="shop-mine">
                        <Icon name="check" size={14} /> À toi
                      </span>
                    ) : (
                      <span className="shop-price num">
                        <Icon name="coin" size={14} /> {item.price}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>
      <BuyModal item={buying} preview={buying ? bigPreview(buying) : undefined} onClose={() => setBuying(null)} />
    </div>
  );
}
