import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import { SKINS as KART_SKINS, VEHICLES, type SkinId as KartSkinId, type VehicleId } from "../../shared/games/bolides/garage.ts";
import type { TokenId } from "../../shared/games/capitale/tokens.ts";
import { FETE_BY_ID, type FeteId } from "../../shared/games/crampons/boutique.ts";
import { CAMO_BY_ID, type CamoId } from "../../shared/games/escarmouche/camos.ts";
import { UNIFORM_BY_ID, type UniformId } from "../../shared/games/escarmouche/uniforms.ts";
import { EXTRA_BY_ID, MUZZLE_BY_ID, WEAPONS, type ExtraId, type MuzzleId, type WeaponId } from "../../shared/games/escarmouche/weapons.ts";
import { AttachmentIcon, CamoSwatch, TenueSwatch, WeaponBars, WeaponIcon } from "../escarmouche/WeaponIcon.tsx";
import { CLUB_BY_ID, FORMATION_NAMES } from "../../shared/games/crampons/clubs.ts";
import { bombInfo, type BombId } from "../../shared/games/meche/bombs.ts";
import type { SkinId as NavalSkinId } from "../../shared/games/naval/skins.ts";
import type { BackId } from "../../shared/games/uno/backs.ts";
import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import { SHOP_ITEMS, type ShopItem, type ShopKind } from "../../shared/shop.ts";
import { VehiclePreview } from "../bolides/Garage.tsx";
import { AtlasArt } from "../cards/TradingCard.tsx";
import { KART_COLORS } from "../bolides/scene/kart.ts";
import { PAWN_COLORS } from "../capitale/boardUi.ts";
import { tokenThumbnails } from "../capitale/scene/tokens.ts";
import { Link } from "wouter";
import { AppHeader } from "../components/AppHeader.tsx";
import { CardBack } from "../components/Card.tsx";
import { Icon } from "../components/Icon.tsx";
import { CramponsLook, isCramponsKind } from "../crampons/CramponsLook.tsx";
import { TenueLook, TenueStage } from "../culbute/TenueLook.tsx";
import { BombArt } from "../meche/bombs/BombArt.tsx";
import { BombShow } from "../meche/bombs/BombShow.tsx";
import { BallSwatch, TrailSwatch } from "../minigolf/BallPicker.tsx";
import { BowlingShopLook } from "../bowling/ShopLooks.tsx";
import { BillardShopLook } from "../billard/ShopLooks.tsx";
import { CourShopLook } from "../cour/ShopLooks.tsx";
import { NavalSkinDefs, NavalSkinPreview } from "../naval/SkinPicker.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { PersoPreview, PersoShop } from "../shop/PersoShop.tsx";
import { useSession } from "../stores/session.ts";
import { useMyItems } from "../stores/shop.ts";
import "../shop/shop.css";

/** L'aperçu d'Escarmouche en trois dimensions, chargé seulement quand on ouvre un article */
const EscPreview3D = lazy(() => import("../escarmouche/EscPreview3D.tsx"));

/** Les points à la française : 1 500 et non 1500 */
const fr = (n: number) => n.toLocaleString("fr-FR");

const SECTIONS: { kind: ShopKind; game: GameId; note: string }[] = [
  { kind: "uno", game: "uno", note: "Le dos de tes cartes" },
  { kind: "naval", game: "naval", note: "Les thèmes de ta flotte" },
  { kind: "token", game: "capitale", note: "Tes pions" },
  { kind: "vehicle", game: "bolides", note: "Tes véhicules, chacun sa conduite" },
  { kind: "kart", game: "bolides", note: "Tes skins" },
  {
    kind: "club",
    game: "crampons",
    note: "Les clubs de légende, à choisir au salon : touche-en un pour voir son maillot",
  },
  { kind: "ballon", game: "crampons", note: "Ton ballon, que toi seul vois" },
  { kind: "fete", game: "crampons", note: "La célébration de tes buts : touche-en une pour la voir" },
  { kind: "bombe", game: "meche", note: "Ce qui saute au bout de ta mèche : touche-en une pour la voir jusqu'au bout" },
  { kind: "tenue", game: "culbute", note: "Les tenues des Habitués, à choisir au salon avant le combat" },
  {
    kind: "arme",
    game: "escarmouche",
    note: "Des armes de plus, chacune sa façon de se battre : à choisir au salon",
  },
  { kind: "uniforme", game: "escarmouche", note: "Les tenues de ton soldat : ta tête reste la tienne" },
  {
    kind: "accessoire",
    game: "escarmouche",
    note: "Les accessoires de ton arme principale : chacun a son prix à payer",
  },
  { kind: "camo", game: "escarmouche", note: "Le camouflage de tes armes, que les autres voient dans tes mains" },
  { kind: "golfmotif", game: "minigolf", note: "Le motif de ta balle (sa couleur, tu la choisis au salon)" },
  { kind: "golftrace", game: "minigolf", note: "La traînée que ta balle laisse derrière elle" },
  { kind: "bowlmotif", game: "bowling", note: "Le motif de ta boule (sa couleur, tu la choisis au salon)" },
  { kind: "bowltrace", game: "bowling", note: "La traînée que ta boule laisse sur la piste" },
  { kind: "bowlfx", game: "bowling", note: "Ce qui éclate à l'écran quand tu fais un strike" },
  { kind: "bowldanse", game: "bowling", note: "La danse de ton personnage après un strike ou un spare" },
  { kind: "bowlquilles", game: "bowling", note: "Les quilles que tu fais tomber, quand c'est toi qui lances" },
  { kind: "bilqueue", game: "billard", note: "Ta queue : les autres la voient quand c'est toi qui joues" },
  { kind: "biltapis", game: "billard", note: "Le tapis de la table que tu ouvres" },
  { kind: "bilbilles", game: "billard", note: "Le jeu de billes de la table que tu ouvres" },
  { kind: "bileffet", game: "billard", note: "Ce qui éclate à l'écran sur tes beaux coups" },
  { kind: "courmaillot", game: "cour", note: "Ton maillot de candidat dans La Cour des Grands" },
  { kind: "coursalut", game: "cour", note: "Ce qui éclate autour de toi quand tu passes une épreuve" },
];

/**
 * Une vignette ne se dessine qu'à l'approche de l'écran : celles du billard et du bowling se peignent en JavaScript,
 * et la boutique entière en compte plus de deux cents. La case garde sa taille en attendant (shop.css).
 */
function NearLook({ render }: { render: () => ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: "300px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return (
    <span ref={ref} className="shop-look is-lazy">
      {near ? render() : null}
    </span>
  );
}

/** Le pion de Capitale : il demande ses images (une scène 3D les photographie) au moment où il s'affiche */
function TokenThumb({ src, size, onNeed }: { src: string | undefined; size: number; onNeed: () => void }) {
  useEffect(() => {
    if (!src) onNeed();
  }, [src, onNeed]);
  return src ? <img src={src} alt="" width={size} height={size} draggable={false} /> : null;
}

/** Tout ce qui s'achète avec ses points, dans l'ordre qu'on veut */
export function ShopPage() {
  const user = useSession((s) => s.user);
  const games = useSession((s) => s.games);
  const { balance, has } = useMyItems();
  const [buying, setBuying] = useState<ShopItem | null>(null);
  // Un seul rayon à la fois si on veut : la boutique entière fait une dizaine d'écrans
  const [only, setOnly] = useState<"tout" | "perso" | GameId>("tout");
  const defs = `shop${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const hasCapitale = games.includes("capitale");
  // Les photos des pions coûtent une scène 3D : seulement quand un pion s'affiche
  const [wantThumbs, setWantThumbs] = useState(false);
  const needThumbs = useMemo(() => () => setWantThumbs(true), []);
  const thumbs = useMemo(() => (hasCapitale && wantThumbs ? tokenThumbnails(PAWN_COLORS[0]!) : null), [hasCapitale, wantThumbs]);
  // Les jeux qui ont un rayon, dans l'ordre de la boutique
  const shopGames = SECTIONS.map((s) => s.game).filter((g, i, all) => all.indexOf(g) === i && games.includes(g));

  const look = (item: ShopItem): ReactNode => {
    if (item.kind === "naval") return <NavalSkinPreview skin={item.ref as NavalSkinId} defs={defs} />;
    if (item.kind === "golfmotif") return <BallSwatch look={{ color: "bleue", pattern: item.ref, trail: "fil" }} size={52} />;
    if (item.kind === "golftrace") return <TrailSwatch trail={item.ref} size={46} />;
    if (item.kind.startsWith("bowl")) return <BowlingShopLook kind={item.kind} id={item.ref} />;
    if (item.kind.startsWith("bil")) return <BillardShopLook kind={item.kind} id={item.ref} />;
    if (item.kind.startsWith("cour")) return <CourShopLook kind={item.kind} id={item.ref} />;
    if (item.kind === "uno") return <CardBack width={46} skin={item.ref as BackId} />;
    if (item.kind === "token") return <TokenThumb src={thumbs?.[item.ref as TokenId]} size={64} onNeed={needThumbs} />;
    // Les véhicules : leur photo de l'album
    if (item.kind === "vehicle")
      return (
        <span className="shop-vehicle">
          <AtlasArt artKey={`vehicle:${item.ref}`} width={76} />
        </span>
      );
    if (item.kind === "kart") {
      const [a, b] = KART_SKINS[item.ref as KartSkinId].swatch;
      return <span className="shop-swatch" style={{ "--a": a, "--b": b } as CSSProperties} />;
    }
    if (isCramponsKind(item.kind)) return <CramponsLook item={item} />;
    if (item.kind === "bombe") return <BombArt id={item.ref as BombId} className="bomb-thumb" />;
    if (item.kind === "tenue") return <TenueLook item={item} />;
    if (item.kind === "camo") return <CamoSwatch camo={item.ref as CamoId} size={52} />;
    if (item.kind === "arme")
      return (
        <span style={{ display: "inline-flex", padding: "4px 8px", borderRadius: 8, background: "rgba(236, 231, 219, 0.92)" }}>
          <WeaponIcon weapon={item.ref as WeaponId} size={96} />
        </span>
      );
    if (item.kind === "uniforme") return <TenueSwatch tenue={item.ref as UniformId} size={56} />;
    if (item.kind === "accessoire") return <AttachmentIcon id={item.ref as MuzzleId} size={56} />;
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
    if (item.kind === "camo") return CAMO_BY_ID.get(item.ref as CamoId)?.blurb ?? null;
    if (item.kind === "arme") return WEAPONS[item.ref as WeaponId].blurb;
    if (item.kind === "uniforme") return UNIFORM_BY_ID.get(item.ref as UniformId)?.blurb ?? null;
    if (item.kind === "accessoire") return (MUZZLE_BY_ID.get(item.ref as MuzzleId) ?? EXTRA_BY_ID.get(item.ref as ExtraId))?.blurb ?? null;
    return null;
  };

  const bigPreview = (item: ShopItem): ReactNode => {
    if (item.kind === "perso") return <PersoPreview item={item} />;
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
    if (item.kind === "token") return <TokenThumb src={thumbs?.[item.ref as TokenId]} size={128} onNeed={needThumbs} />;
    if (item.kind === "golfmotif") return <BallSwatch look={{ color: "bleue", pattern: item.ref, trail: "fil" }} size={140} />;
    if (item.kind === "golftrace") return <TrailSwatch trail={item.ref} size={110} />;
    if (item.kind.startsWith("bowl")) return <BowlingShopLook kind={item.kind} id={item.ref} big />;
    if (item.kind.startsWith("bil")) return <BillardShopLook kind={item.kind} id={item.ref} big />;
    if (item.kind.startsWith("cour")) return <CourShopLook kind={item.kind} id={item.ref} big />;
    if (item.kind === "tenue") return <TenueStage item={item} />;
    if (isCramponsKind(item.kind)) return <CramponsLook item={item} big />;
    // La bombe sur une petite table, jusqu'à sa fin sur ton avatar (avec le son, ouverte d'un geste)
    if (item.kind === "bombe") return <BombShow bomb={item.ref as BombId} loud avatar={user?.avatar} />;
    if (item.kind === "camo")
      return (
        <Suspense fallback={<WeaponIcon weapon="fa" camo={item.ref as CamoId} size={260} />}>
          <EscPreview3D weapon="fa" camo={item.ref as CamoId} width={300} height={170} />
        </Suspense>
      );
    if (item.kind === "arme") {
      const id = item.ref as WeaponId;
      return (
        <span style={{ display: "grid", justifyItems: "center", gap: 8 }}>
          <Suspense fallback={<WeaponIcon weapon={id} size={260} />}>
            <EscPreview3D weapon={id} camo="usine" width={300} height={170} />
          </Suspense>
          <WeaponBars weapon={id} />
        </span>
      );
    }
    if (item.kind === "accessoire") {
      const isMuzzle = MUZZLE_BY_ID.has(item.ref as MuzzleId);
      const gear = {
        muzzle: isMuzzle ? (item.ref as MuzzleId) : ("aucun" as const),
        extra: isMuzzle ? ("aucun" as const) : (item.ref as ExtraId),
      };
      return (
        <Suspense fallback={<AttachmentIcon id={item.ref as MuzzleId} size={120} />}>
          <EscPreview3D weapon="fa" camo="usine" gear={gear} width={300} height={170} />
        </Suspense>
      );
    }
    if (item.kind === "uniforme")
      return (
        <Suspense fallback={<TenueSwatch tenue={item.ref as UniformId} size={180} />}>
          <EscPreview3D tenue={item.ref as UniformId} weapon="fa" camo="usine" width={240} height={300} />
        </Suspense>
      );
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
              <strong className="num">{fr(balance)}</strong> point{balance > 1 ? "s" : ""} à dépenser
            </p>
            <p className="hint">
              Chaque partie bien placée t'en rapporte. Prends ce que tu veux, dans l'ordre que tu veux : dépenser ne change rien à ton
              classement. Ils servent aussi à ouvrir des paquets de cartes : <Link href="/album">voir l'album</Link>.
            </p>
          </div>
        </section>

        <NavalSkinDefs id={defs} />

        {/* Un seul jeu ouvert : la page est courte, pas besoin de choisir */}
        {shopGames.length > 1 && (
          <div className="options shop-filter" role="radiogroup" aria-label="Rayons de la boutique">
            {(["tout", "perso", ...shopGames] as const).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={only === g} aria-pressed={only === g} onClick={() => setOnly(g)}>
                {g === "tout" ? "Tout" : g === "perso" ? "Ton personnage" : GAME_NAMES[g]}
              </button>
            ))}
          </div>
        )}

        {(only === "tout" || only === "perso") && <PersoShop balance={balance} has={has} onBuy={setBuying} />}

        {shopGames
          .filter((g) => only === "tout" || only === g)
          .map((game) => (
            <div key={game} className="shop-game">
              <h2 className="shop-game-title">{GAME_NAMES[game]}</h2>
              {SECTIONS.filter((s) => s.game === game).map((section) => {
                const items = SHOP_ITEMS.filter((i) => i.kind === section.kind && i.price > 0);
                const got = items.filter((i) => has(i.id)).length;
                return (
                  <section key={section.kind} className="shop-section">
                    <h3>
                      {section.note}{" "}
                      <small className={`shop-count num ${got === items.length ? "is-full" : ""}`}>
                        {got === items.length ? "tout est à toi" : `${got} / ${items.length} à toi`}
                      </small>
                    </h3>
                    <div className="shop-grid">
                      {items.map((item, i) => {
                        const mine = has(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`shop-item rise ${mine ? "is-mine" : ""} ${!mine && item.price > balance ? "is-dear" : ""}`}
                            style={{ "--i": i } as CSSProperties}
                            disabled={mine}
                            onClick={() => setBuying(item)}
                          >
                            <NearLook render={() => look(item)} />
                            <span className="shop-name">{item.name}</span>
                            {blurb(item) && <span className="shop-blurb">{blurb(item)}</span>}
                            {mine ? (
                              <span className="shop-mine">
                                <Icon name="check" size={14} /> À toi
                              </span>
                            ) : (
                              <span className="shop-price num">
                                <Icon name="coin" size={14} /> {fr(item.price)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ))}
      </main>
      <BuyModal item={buying} preview={buying ? bigPreview(buying) : undefined} onClose={() => setBuying(null)} />
    </div>
  );
}
