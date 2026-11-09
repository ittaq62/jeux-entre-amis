import { useState, type CSSProperties } from "react";
import {
  CARDS,
  FAMILIES,
  familyBonus,
  PACK_PRICE,
  RARITIES,
  RARITY,
  type CardDef,
  type CardFamily,
  type PackResponse,
} from "../../shared/cards.ts";
import { PackOpening } from "../cards/PackOpening.tsx";
import { TradingCard } from "../cards/TradingCard.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
import { Icon } from "../components/Icon.tsx";
import { ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useViewport } from "../lib/viewport.ts";
import { useAlbum, useMyAlbum } from "../stores/album.ts";

const GAP = 8;
const MAX_WIDTH = 1060;

const points = (n: number) => `${n} point${n > 1 ? "s" : ""}`;

export function AlbumPage() {
  const { owned, balance } = useMyAlbum();
  const openPack = useAlbum((s) => s.openPack);
  const sell = useAlbum((s) => s.sell);
  const craft = useAlbum((s) => s.craft);
  const { w, h } = useViewport();
  const [family, setFamily] = useState<CardFamily | "toutes">("toutes");
  const [view, setView] = useState<"toutes" | "manquantes" | "doubles">("toutes");
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [pack, setPack] = useState<PackResponse | null>(null);
  const [busy, setBusy] = useState(false);

  // Les petites cartes occupent toute la largeur : trois de front sur téléphone, plus sur grand écran
  const room = Math.min(MAX_WIDTH, w) - 40;
  const cols = w < 480 ? 3 : w < 760 ? 4 : 6;
  const cardW = Math.floor((room - (cols - 1) * GAP) / cols);
  const zoomW = Math.min(w - 40, Math.round((h - 190) / 1.4), 340);

  const have = CARDS.filter((c) => owned[c.id]).length;
  const doubles = CARDS.reduce((n, c) => n + Math.max(0, (owned[c.id] ?? 0) - 1) * RARITY[c.rarity].sell, 0);
  const shown = FAMILIES.filter((f) => family === "toutes" || f.id === family);
  const keep = (c: CardDef) => view === "toutes" || (view === "manquantes" ? !owned[c.id] : (owned[c.id] ?? 0) > 1);
  const nothing = !shown.some((f) => CARDS.some((c) => c.family === f.id && keep(c)));

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible pour l'instant." });
    } finally {
      setBusy(false);
    }
  }

  const zoomOwned = zoom ? (owned[zoom.id] ?? 0) : 0;
  const zoomPrice = zoom ? RARITY[zoom.rarity].craft : 0;

  return (
    <div className="felt page">
      <AppHeader />
      <main className="narrow" style={{ maxWidth: MAX_WIDTH }}>
        <div className="page-heading">
          <h1>L'Album</h1>
        </div>

        <section className="album-head panel">
          <div className="album-progress" style={{ marginBottom: 0 }}>
            <span className="album-bar">
              <i style={{ width: `${(have / CARDS.length) * 100}%` }} />
            </span>
            <span className="num">
              {have} / {CARDS.length}
            </span>
          </div>
          <div className="album-head-row">
            <button
              className="btn btn-primary"
              disabled={busy || balance < PACK_PRICE}
              onClick={() => void run(async () => setPack(await openPack()))}
            >
              <Icon name="coin" size={18} /> Ouvrir un paquet ({PACK_PRICE})
            </button>
            {doubles > 0 && (
              <button className="btn" disabled={busy} onClick={() => void run(() => sell(null))}>
                Revendre mes doubles (+{doubles})
              </button>
            )}
            <span className="hint">Tu as {points(balance)}.</span>
          </div>
          <div className="album-rarities">
            {RARITIES.map((r) => (
              <span key={r} className={`album-rarity is-${r}`} title={RARITY[r].name}>
                <i aria-hidden="true" />
                <span className="num">
                  {CARDS.filter((c) => c.rarity === r && owned[c.id]).length}/{CARDS.filter((c) => c.rarity === r).length}
                </span>
                <span className="album-rarity-name">{RARITY[r].name}</span>
              </span>
            ))}
          </div>
          <div className="album-families options" role="radiogroup" aria-label="Famille">
            <button type="button" aria-pressed={family === "toutes"} onClick={() => setFamily("toutes")}>
              Toutes
            </button>
            {FAMILIES.map((f) => (
              <button key={f.id} type="button" aria-pressed={family === f.id} onClick={() => setFamily(f.id)}>
                {f.name}
              </button>
            ))}
          </div>
          <div className="album-families options" role="radiogroup" aria-label="Quelles cartes montrer">
            <button type="button" aria-pressed={view === "toutes"} onClick={() => setView("toutes")}>
              Tout l'album
            </button>
            <button type="button" aria-pressed={view === "manquantes"} onClick={() => setView("manquantes")}>
              Il me manque
            </button>
            <button type="button" aria-pressed={view === "doubles"} onClick={() => setView("doubles")}>
              Mes doubles
            </button>
          </div>
        </section>

        {nothing && <p className="hint">{view === "doubles" ? "Aucun double ici." : "Rien ne manque ici : bravo !"}</p>}

        {shown.map((f) => {
          const cards = CARDS.filter((c) => c.family === f.id);
          const got = cards.filter((c) => owned[c.id]).length;
          if (!cards.some(keep)) return null;
          return (
            <section key={f.id} className="album-family">
              <h2>
                {f.name}{" "}
                <small className="hint num">
                  {got} / {cards.length}
                  {got === cards.length ? ", complète !" : `, +${familyBonus(f.id)} points à la clé`}
                </small>
              </h2>
              <div className="album-grid" style={{ "--gap": `${GAP}px` } as CSSProperties}>
                {cards.filter(keep).map((c) => (
                  <button key={c.id} className="album-cell" onClick={() => setZoom(c)} aria-label={c.name}>
                    <TradingCard card={c} width={cardW} missing={!owned[c.id]} still />
                    {(owned[c.id] ?? 0) > 1 && <span className="album-count num">×{owned[c.id]}</span>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {zoom && (
        <div className="zoom-screen" role="dialog" aria-modal="true" aria-label={zoom.name} onClick={() => setZoom(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <TradingCard card={zoom} width={zoomW} tilt />
          </div>
          <div className="zoom-actions" onClick={(e) => e.stopPropagation()}>
            {zoomOwned === 0 ? (
              <button
                className="btn btn-primary"
                disabled={busy || balance < zoomPrice}
                onClick={() =>
                  void run(async () => {
                    const completed = await craft(zoom.id);
                    toast({ tone: "gold", title: `${zoom.name} rejoint ton album !` });
                    for (const f of completed)
                      toast({ tone: "gold", title: "Famille complète !", body: `+${familyBonus(f)} points offerts` });
                  })
                }
              >
                <Icon name="coin" size={18} /> {balance < zoomPrice ? `Coûte ${points(zoomPrice)}` : `Acheter pour ${points(zoomPrice)}`}
              </button>
            ) : (
              zoomOwned > 1 && (
                <button className="btn" disabled={busy} onClick={() => void run(() => sell(zoom.id))}>
                  Revendre un double (+{RARITY[zoom.rarity].sell})
                </button>
              )
            )}
            <button className="btn btn-ghost" onClick={() => setZoom(null)}>
              Fermer
            </button>
          </div>
          <p className="zoom-info hint">
            {zoomOwned === 0 ? "Pas encore dans ton album." : `${zoomOwned} exemplaire${zoomOwned > 1 ? "s" : ""}.`}
          </p>
        </div>
      )}

      {pack && <PackOpening pack={pack} onClose={() => setPack(null)} />}
    </div>
  );
}
