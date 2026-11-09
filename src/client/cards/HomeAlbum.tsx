import { useState } from "react";
import { Link } from "wouter";
import { CARD_BY_ID, CARDS, PACK_PRICE, RARITIES, type PackResponse } from "../../shared/cards.ts";
import { Icon } from "../components/Icon.tsx";
import { ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useAlbum, useMyAlbum } from "../stores/album.ts";
import { PackOpening } from "./PackOpening.tsx";
import { CardBackFace, TradingCard } from "./TradingCard.tsx";

const FAN = [
  { x: -40, y: 5, r: -14 },
  { x: 0, y: -3, r: 0 },
  { x: 40, y: 5, r: 14 },
];

const FAN_W = 66;

/** La collection sur la page d'accueil : ses plus belles cartes, où on en est, et un paquet à ouvrir. */
export function HomeAlbum() {
  const { owned, balance } = useMyAlbum();
  const openPack = useAlbum((s) => s.openPack);
  const [pack, setPack] = useState<PackResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = Object.keys(owned);
  const best = ids.sort((a, b) => RARITIES.indexOf(CARD_BY_ID.get(b)!.rarity) - RARITIES.indexOf(CARD_BY_ID.get(a)!.rarity)).slice(0, 3);
  const short = PACK_PRICE - balance;

  async function open() {
    setBusy(true);
    try {
      setPack(await openPack());
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible d'ouvrir un paquet." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="home-album panel" aria-label="L'Album">
      <div className="album-fan" aria-hidden="true">
        {FAN.map((f, i) => {
          const card = best[[1, 0, 2][i]!];
          return (
            <div
              key={i}
              style={{ transform: `translate(calc(-50% + ${f.x}px), calc(-50% + ${f.y}px)) rotate(${f.r}deg)`, zIndex: i === 1 ? 2 : 1 }}
            >
              {card ? <TradingCard card={CARD_BY_ID.get(card)!} width={FAN_W} /> : <CardBackFace width={FAN_W} />}
            </div>
          );
        })}
      </div>
      <div className="album-text">
        <h2 className="album-title">L'Album</h2>
        <p className="hint">
          {short > 0
            ? `Encore ${short} point${short > 1 ? "s" : ""} pour un paquet de cartes.`
            : "Tes points t'ouvrent des paquets de cartes à collectionner."}
        </p>
        <div className="album-progress">
          <span className="album-bar">
            <i style={{ width: `${(ids.length / CARDS.length) * 100}%` }} />
          </span>
          <span className="num">
            {ids.length} / {CARDS.length}
          </span>
        </div>
      </div>
      <div className="album-buttons">
        <button className="btn btn-primary" onClick={() => void open()} disabled={busy || short > 0}>
          {busy ? <span className="spinner" /> : <Icon name="coin" size={18} />} Paquet ({PACK_PRICE})
        </button>
        <Link href="/album" className="btn">
          Voir l'album
        </Link>
      </div>
      {pack && <PackOpening pack={pack} onClose={() => setPack(null)} />}
    </section>
  );
}
