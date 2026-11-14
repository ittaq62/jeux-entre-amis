import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import { SKINS as KART_SKINS, VEHICLES, type SkinId as KartSkinId, type VehicleId } from "../../shared/games/bolides/garage.ts";
import type { TokenId } from "../../shared/games/capitale/tokens.ts";
import { FETE_BY_ID, type FeteId } from "../../shared/games/crampons/boutique.ts";
import { CLUB_BY_ID, FORMATION_NAMES } from "../../shared/games/crampons/clubs.ts";
import { bombInfo, type BombId } from "../../shared/games/meche/bombs.ts";
import type { SkinId as NavalSkinId } from "../../shared/games/naval/skins.ts";
import type { BackId } from "../../shared/games/uno/backs.ts";
import type { GameId } from "../../shared/protocol.ts";
import { SHOP_ITEMS, type ShopItem, type ShopKind } from "../../shared/shop.ts";
import { VehiclePreview } from "../bolides/Garage.tsx";
import { KART_COLORS } from "../bolides/scene/kart.ts";
import { PAWN_COLORS } from "../capitale/boardUi.ts";
import { tokenThumbnails } from "../capitale/scene/tokens.ts";
import { Link } from "wouter";
import { AppHeader } from "../components/AppHeader.tsx";
import { CardBack } from "../components/Card.tsx";
import { Icon } from "../components/Icon.tsx";
import { CramponsLook, isCramponsKind } from "../crampons/CramponsLook.tsx";
import { BombArt } from "../meche/bombs/BombArt.tsx";
import { BombShow } from "../meche/bombs/BombShow.tsx";
import { NavalSkinDefs, NavalSkinPreview } from "../naval/SkinPicker.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { useSession } from "../stores/session.ts";
import { useMyItems } from "../stores/shop.ts";

const SECTIONS: { kind: ShopKind; game: GameId; title: string; note: string }[] = [
  { kind: "uno", game: "uno", title: "UNO", note: "Le dos de tes cartes" },
  { kind: "naval", game: "naval", title: "Bataille navale", note: "Les thèmes de ta flotte" },
  { kind: "token", game: "capitale", title: "Capitale", note: "Tes pions" },
  { kind: "vehicle", game: "bolides", title: "Bolides", note: "Tes véhicules, chacun sa conduite" },
  { kind: "kart", game: "bolides", title: "Bolides", note: "Tes skins" },
  {
    kind: "club",
    game: "crampons",
    title: "Crampons",
    note: "Les clubs de légende, à choisir au salon : touche-en un pour voir son maillot",
  },
  { kind: "ballon", game: "crampons", title: "Crampons", note: "Ton ballon, que toi seul vois" },
  { kind: "fete", game: "crampons", title: "Crampons", note: "La célébration de tes buts : touche-en une pour la voir" },
  { kind: "bombe", game: "meche", title: "Mèche", note: "Ce qui saute au bout de ta mèche : touche-en une pour la voir jusqu'au bout" },
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
    if (item.kind === "uno") return <CardBack width={46} skin={item.ref as BackId} />;
    if (item.kind === "token") {
      const src = thumbs?.[item.ref as TokenId];
      return src ? <img src={src} alt="" width={64} height={64} draggable={false} /> : null;
    }
    if (item.kind === "kart") {
      const [a, b] = KART_SKINS[item.ref as KartSkinId].swatch;
      return <span className="shop-swatch" style={{ "--a": a, "--b": b } as CSSProperties} />;
    }
    if (isCramponsKind(item.kind)) return <CramponsLook item={item} />;
    if (item.kind === "bombe") return <BombArt id={item.ref as BombId} className="bomb-thumb" />;
    return null;
  };

  /** Quelques mots sous le nom : ce que fait le véhicule, le jeu du club, le geste de la célébration */
  const blurb = (item: ShopItem): string | null => {
    if (item.kind === "vehicle") return VEHICLES[item.ref as VehicleId].blurb;
    if (item.kind === "club") {
      const club = CLUB_BY_ID.get(item.ref);
      return club ? `Note ${club.rating}, en ${FORMATION_NAMES[club.formation]}` : null;
    }
    if (item.kind === "fete") return FETE_BY_ID.get(item.ref as FeteId)?.blurb ?? null;
    if (item.kind === "bombe") return bombInfo(item.ref as BombId).blurb;
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
    if (item.kind === "uno") return <CardBack width={120} skin={item.ref as BackId} />;
    if (isCramponsKind(item.kind)) return <CramponsLook item={item} big />;
    // La bombe sur une petite table, jusqu'à sa fin sur ton avatar (avec le son, ouverte d'un geste)
    if (item.kind === "bombe") return <BombShow bomb={item.ref as BombId} loud avatar={user?.avatar} />;
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
              classement. Ils servent aussi à ouvrir des paquets de cartes : <Link href="/album">voir l'album</Link>.
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
                    {blurb(item) && <span className="shop-blurb">{blurb(item)}</span>}
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
