import { useEffect, useState, type CSSProperties } from "react";
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
import { Modal } from "../components/ui.tsx";
import { ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useBoxSize, useViewport } from "../lib/viewport.ts";
import { useAlbum, useMyAlbum } from "../stores/album.ts";

const GAP = 8;
const MAX_WIDTH = 1060;

const points = (n: number) => `${n.toLocaleString("fr-FR")} point${n > 1 ? "s" : ""}`;
const inPacks = (n: number) => (n <= 1 ? "dès le prochain paquet" : `d'ici ${n} paquets`);

export function AlbumPage() {
  const { owned, balance, loaded } = useMyAlbum();
  const openPack = useAlbum((s) => s.openPack);
  const sell = useAlbum((s) => s.sell);
  const craft = useAlbum((s) => s.craft);
  const pity = useAlbum((s) => s.pity);
  const { w, h } = useViewport();
  const [family, setFamily] = useState<CardFamily | "toutes">("toutes");
  const [view, setView] = useState<"toutes" | "manquantes" | "doubles">("toutes");
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [pack, setPack] = useState<PackResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [selling, setSelling] = useState(false);
  // La place vraiment laissée aux cartes : sans la barre de défilement, qui en prend une partie sur ordinateur
  const [boxRef, box] = useBoxSize<HTMLDivElement>();

  // Les petites cartes occupent toute la largeur : trois de front sur téléphone, plus sur grand écran
  const room = box.w > 0 ? box.w : Math.min(MAX_WIDTH, w) - 40;
  const cols = room < 440 ? 3 : room < 720 ? 4 : 6;
  const cardW = Math.floor((room - (cols - 1) * GAP) / cols);
  const zoomW = Math.min(w - 40, Math.round((h - 190) / 1.4), 340);

  const have = CARDS.filter((c) => owned[c.id]).length;
  const doubles = CARDS.reduce((n, c) => n + Math.max(0, (owned[c.id] ?? 0) - 1) * RARITY[c.rarity].sell, 0);
  // Les doubles, rareté par rareté : ce qu'on montre avant de tout revendre
  const spares = RARITIES.map((r) => ({
    rarity: r,
    count: CARDS.filter((c) => c.rarity === r).reduce((n, c) => n + Math.max(0, (owned[c.id] ?? 0) - 1), 0),
  })).filter((x) => x.count > 0);
  const spareCount = spares.reduce((n, x) => n + x.count, 0);
  const short = PACK_PRICE - balance;
  const shown = FAMILIES.filter((f) => family === "toutes" || f.id === family);
  const keep = (c: CardDef) => view === "toutes" || (view === "manquantes" ? !owned[c.id] : (owned[c.id] ?? 0) > 1);
  const nothing = !shown.some((f) => CARDS.some((c) => c.family === f.id && keep(c)));

  // Échap referme la carte en grand
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

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
            <span className="num">{loaded ? `${have} / ${CARDS.length}` : `… / ${CARDS.length}`}</span>
          </div>
          <div className="album-head-row">
            <button
              className="btn btn-primary"
              disabled={busy || !loaded || short > 0}
              onClick={() => void run(async () => setPack(await openPack()))}
            >
              <Icon name="coin" size={18} /> Ouvrir un paquet ({PACK_PRICE})
            </button>
            {doubles > 0 && (
              <button className="btn" disabled={busy} onClick={() => setSelling(true)}>
                Revendre mes doubles (+{doubles.toLocaleString("fr-FR")})
              </button>
            )}
            <span className="hint">
              {loaded && short > 0
                ? `Tu as ${points(balance)} : il t'en manque ${short} pour un paquet. Chaque partie bien placée t'en rapporte.`
                : `Tu as ${points(balance)}.`}
            </span>
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
          {pity && (
            <p className="hint album-pity">
              Au plus tard, une carte épique (ou mieux) {inPacks(pity.epic)} et une légendaire {inPacks(pity.legend)} : une que tu n'as pas
              encore, s'il t'en manque.
            </p>
          )}
          <div className="album-families album-strip options" role="radiogroup" aria-label="Famille">
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

        <div ref={boxRef} className="album-families-list">
          {loaded && nothing && <p className="hint">{view === "doubles" ? "Aucun double ici." : "Rien ne manque ici : bravo !"}</p>}

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
        </div>
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
            {zoomOwned === 0
              ? balance < zoomPrice
                ? `Pas encore dans ton album. Il te manque ${points(zoomPrice - balance)} pour l'acheter.`
                : "Pas encore dans ton album."
              : `${zoomOwned} exemplaire${zoomOwned > 1 ? "s" : ""}.`}
          </p>
        </div>
      )}

      <Modal open={selling} onClose={() => setSelling(false)} title="Revendre tes doubles">
        <div className="sell-sheet">
          <p>
            Tu gardes un exemplaire de chaque carte et tu revends les {spareCount} autre{spareCount > 1 ? "s" : ""}, pour{" "}
            <strong className="num">{points(doubles)}</strong>.
          </p>
          <ul className="sell-lines">
            {spares.map((x) => (
              <li key={x.rarity} className={`album-rarity is-${x.rarity}`}>
                <i aria-hidden="true" />
                <span className="sell-what">
                  {x.count} {RARITY[x.rarity].name.toLowerCase()}
                  {x.count > 1 ? "s" : ""}
                </span>
                <span className="num">+{(x.count * RARITY[x.rarity].sell).toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
          <button
            className="btn btn-primary btn-block"
            disabled={busy || doubles === 0}
            onClick={() =>
              void run(async () => {
                const gain = doubles;
                await sell(null);
                setSelling(false);
                toast({ tone: "gold", title: `Doubles revendus : +${points(gain)}` });
              })
            }
          >
            <Icon name="coin" size={18} /> Tout revendre pour {points(doubles)}
          </button>
        </div>
      </Modal>

      {pack && <PackOpening pack={pack} onClose={() => setPack(null)} />}
    </div>
  );
}
