import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CARD_BY_ID, FAMILIES, familyBonus, PACK_PRICE, RARITIES, type CardDef, type PackResponse } from "../../shared/cards.ts";
import { Icon } from "../components/Icon.tsx";
import { Logo } from "../components/ui.tsx";
import { ApiError } from "../lib/api.ts";
import { CARD_SOUNDS, play, preloadSounds, vibrate } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useViewport } from "../lib/viewport.ts";
import { useAlbum } from "../stores/album.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useShop } from "../stores/shop.ts";
import { AtlasArt, CardBackFace, TradingCard } from "./TradingCard.tsx";

const GAP = 10;
const RATIO = 1.4;
/** Le temps que le paquet tremble et se déchire avant que les cartes sortent */
const TEAR_MS = 620;

/** La taille des cartes pour que les cinq tiennent à l'écran, sans rien faire défiler */
function fit(w: number, h: number): { width: number; rows: number[][] } {
  const room = h - 120;
  const oneRow = Math.min((w - 24 - 4 * GAP) / 5, room / RATIO);
  const twoRows = Math.min((w - 24 - 2 * GAP) / 3, (room - GAP) / 2 / RATIO);
  // Sur un grand téléphone, trois rangées donnent de plus grandes cartes, et la plus belle arrive seule en bas
  const threeRows = Math.min((w - 24 - GAP) / 2, (h - 190 - 2 * GAP) / 3 / RATIO);
  if (threeRows > Math.max(oneRow, twoRows)) return { width: Math.floor(threeRows), rows: [[0, 1], [2, 3], [4]] };
  return oneRow >= twoRows
    ? { width: Math.floor(oneRow), rows: [[0, 1, 2, 3, 4]] }
    : {
        width: Math.floor(twoRows),
        rows: [
          [0, 1, 2],
          [3, 4],
        ],
      };
}

/** L'ouverture d'un paquet : on le déchire, les cartes en sortent, et plus elle est rare, plus sa révélation est grande. */
export function PackOpening({ pack, onClose }: { pack: PackResponse; onClose: () => void }) {
  const { w, h } = useViewport();
  const reduced = usePrefs((s) => s.reducedEffects);
  const openPack = useAlbum((s) => s.openPack);
  const balance = useShop((s) => s.balance);
  const [current, setCurrent] = useState(pack);
  const [opened, setOpened] = useState(false);
  const [tearing, setTearing] = useState(false);
  const [shown, setShown] = useState<ReadonlySet<number>>(new Set());
  const [spot, setSpot] = useState<number | null>(null);
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // La vérité sur ce qui est retourné, à jour même pour les retournements déjà programmés
  const revealed = useRef(new Set<number>());
  const { width, rows } = fit(w, h);
  const height = Math.round(width * RATIO);
  const done = shown.size === current.cards.length;
  const fresh = current.cards.filter((c) => c.isNew).length;

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => {
    preloadSounds(CARD_SOUNDS);
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!done) return;
    for (const family of current.completed) {
      const f = FAMILIES.find((x) => x.id === family)!;
      toast({ tone: "gold", title: `${f.name} : famille complète !`, body: `+${familyBonus(family)} points offerts`, duration: 8000 });
      play("achievement");
    }
  }, [done, current]);

  function tear() {
    if (opened || tearing) return;
    setTearing(true);
    play("tourShake", { volume: 0.6 });
    later(() => play("cardTear"), 300);
    later(() => vibrate(25), 300);
    later(
      () => {
        setOpened(true);
        setTearing(false);
        current.cards.forEach((_, i) => play("cardSlide", { delay: i * 70, volume: 0.9, rate: 0.95 + i * 0.05 }));
      },
      reduced ? 60 : TEAR_MS,
    );
  }

  function reveal(i: number) {
    if (revealed.current.has(i)) return;
    revealed.current.add(i);
    setShown(new Set(revealed.current));
    const rarity = CARD_BY_ID.get(current.cards[i]!.id)!.rarity;
    const rank = RARITIES.indexOf(rarity);
    play("tourFlip", { volume: 0.8, rate: 0.96 + rank * 0.05 });
    if (rarity === "rare") play("cardRare", { delay: 130 });
    if (rarity === "epique") {
      play("cardEpic", { delay: 130 });
      vibrate([20, 30, 50]);
    }
    if (rarity === "legendaire") {
      play("cardLegend", { delay: 110 });
      vibrate([40, 40, 90, 40, 140]);
      setSpot(i);
      later(() => setSpot(null), 1900);
      if (!reduced) {
        later(() => {
          const colors = ["#ffe28a", "#d9a21e", "#fff8d2", "#ffffff"];
          void confetti({ particleCount: 150, spread: 100, startVelocity: 44, origin: { y: 0.45 }, colors, scalar: 1, zIndex: 130 });
        }, 240);
      }
    }
  }

  // Les plus belles à la fin, avec un temps d'attente avant elles
  function revealAll() {
    const rank = (i: number) => RARITIES.indexOf(CARD_BY_ID.get(current.cards[i]!.id)!.rarity);
    const order = current.cards.map((_, i) => i).filter((i) => !revealed.current.has(i));
    order.sort((a, b) => rank(a) - rank(b));
    let at = 0;
    for (const i of order) {
      later(() => reveal(i), at);
      at += rank(i) >= 2 ? 620 : 240;
    }
  }

  async function again() {
    setBusy(true);
    try {
      const next = await openPack();
      timers.current.forEach(clearTimeout);
      timers.current.length = 0;
      revealed.current.clear();
      setCurrent(next);
      setShown(new Set());
      setOpened(false);
      setSpot(null);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible d'ouvrir un paquet." });
    } finally {
      setBusy(false);
    }
  }

  // D'où part chaque carte : du milieu, là où était le paquet
  const dealFrom = (rowIndex: number, slot: number, count: number) => ({
    x: -(slot - (count - 1) / 2) * (width + GAP),
    y: -(rowIndex - (rows.length - 1) / 2) * (height + GAP),
  });

  return (
    <div
      className={`pack-screen ${spot !== null ? "has-spot" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Ouverture d'un paquet de cartes"
    >
      {!opened ? (
        <>
          <button className={`pack ${tearing ? "is-torn" : ""}`} onClick={tear} aria-label="Déchirer le paquet">
            <span className="pack-crimp is-top" />
            <span className="pack-face">
              <span className="pack-collage" aria-hidden="true">
                <span>
                  <AtlasArt artKey="vehicle:soucoupe" />
                </span>
                <span>
                  <AtlasArt artKey="pilot:patronne" />
                </span>
                <span>
                  <AtlasArt artKey="token:couronne" />
                </span>
              </span>
              <strong>L'Album</strong>
              <small>
                <Logo size={14} withName={false} /> de La Tablée
              </small>
              <span className="pack-count">5 cartes</span>
              <span className="pack-sheen" aria-hidden="true" />
            </span>
            <span className="pack-crimp is-bottom" />
          </button>
          <p className="pack-hint" style={tearing ? { visibility: "hidden" } : undefined}>
            Touche le paquet pour le déchirer
          </p>
        </>
      ) : (
        <>
          <div className="pack-table" style={{ "--gap": `${GAP}px` } as CSSProperties}>
            {rows.map((row, rowIndex) => (
              <div key={row[0]} className="pack-row">
                {row.map((i, slot) => {
                  const entry = current.cards[i]!;
                  const def = CARD_BY_ID.get(entry.id)!;
                  const on = shown.has(i);
                  return (
                    <motion.button
                      key={`${current.packs}-${i}`}
                      className={`flip rar-${def.rarity} glow-${def.rarity} ${on ? "is-shown" : ""} ${spot === i ? "is-spot" : ""}`}
                      style={{ width, height }}
                      initial={reduced ? false : { ...dealFrom(rowIndex, slot, row.length), opacity: 0, scale: 0.5, rotate: (i - 2) * 7 }}
                      animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
                      transition={{ delay: i * 0.07, type: "spring", stiffness: 260, damping: 22 }}
                      onClick={() => (on ? setZoom(def) : reveal(i))}
                      aria-label={on ? `${def.name}, voir en grand` : `Retourner la carte ${i + 1}`}
                    >
                      <span className="flip-burst" aria-hidden="true" />
                      <span className="flip-in">
                        <span className="flip-face">
                          <CardBackFace width={width} />
                        </span>
                        <span className="flip-face is-front">
                          <TradingCard card={def} width={width} />
                        </span>
                      </span>
                      {on && (
                        <span className={`flip-tag ${entry.isNew ? "is-new" : "is-double"}`}>{entry.isNew ? "Nouvelle !" : "Double"}</span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            ))}
          </div>
          {done && (
            <p className="pack-hint">
              {fresh === 0 ? "Que des doubles, cette fois." : `${fresh} nouvelle${fresh > 1 ? "s" : ""} dans ton album.`} Touche une carte
              pour la voir en grand.
            </p>
          )}
          <div className="pack-actions">
            {!done ? (
              <button className="btn btn-primary" onClick={revealAll}>
                Tout retourner
              </button>
            ) : (
              <>
                <button className="btn btn-primary" disabled={busy || balance < PACK_PRICE} onClick={() => void again()}>
                  {busy ? <span className="spinner" /> : <Icon name="coin" size={18} />} Encore un paquet ({PACK_PRICE})
                </button>
                <button className="btn" onClick={onClose}>
                  Terminer
                </button>
              </>
            )}
          </div>
        </>
      )}
      {zoom && (
        <div className="zoom-screen" onClick={() => setZoom(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <TradingCard card={zoom} width={Math.min(w - 40, Math.round((h - 110) / RATIO), 340)} tilt />
          </div>
          <button className="btn btn-ghost" onClick={() => setZoom(null)}>
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
