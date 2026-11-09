import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";
import { CARD_BY_ID, familyBonus, FAMILIES, PACK_PRICE, type PackResponse } from "../../shared/cards.ts";
import { Icon } from "../components/Icon.tsx";
import { Logo } from "../components/ui.tsx";
import { ApiError } from "../lib/api.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useViewport } from "../lib/viewport.ts";
import { useAlbum } from "../stores/album.ts";
import { useShop } from "../stores/shop.ts";
import { usePrefs } from "../stores/prefs.ts";
import { CardBackFace, TradingCard } from "./TradingCard.tsx";

const GAP = 10;
const RATIO = 1.4;

/** La taille des cartes pour que les cinq tiennent à l'écran, sans rien faire défiler */
function fit(w: number, h: number): { width: number; rows: number[][] } {
  const room = h - 120;
  const oneRow = Math.min((w - 24 - 4 * GAP) / 5, room / RATIO);
  const twoRows = Math.min((w - 24 - 2 * GAP) / 3, (room - GAP) / 2 / RATIO);
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

/** L'ouverture d'un paquet : on le déchire, on retourne les cartes une à une, le dos annonce les plus belles. */
export function PackOpening({ pack, onClose }: { pack: PackResponse; onClose: () => void }) {
  const { w, h } = useViewport();
  const reduced = usePrefs((s) => s.reducedEffects);
  const openPack = useAlbum((s) => s.openPack);
  const balance = useShop((s) => s.balance);
  const [current, setCurrent] = useState(pack);
  const [opened, setOpened] = useState(false);
  const [tearing, setTearing] = useState(false);
  const [shown, setShown] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const { width, rows } = fit(w, h);
  const done = shown.size === current.cards.length;

  useEffect(() => {
    if (!done) return;
    for (const family of current.completed) {
      const f = FAMILIES.find((x) => x.id === family)!;
      toast({ tone: "gold", title: `${f.name} : famille complète !`, body: `+${familyBonus(family)} points offerts`, duration: 8000 });
      play("achievement");
    }
  }, [done, current]);

  // Le paquet tremble, sa languette s'arrache, et les cartes en sortent
  function tear() {
    if (opened || tearing) return;
    setTearing(true);
    play("tourShake", { volume: 0.7 });
    setTimeout(() => play("tourReveal", { volume: 0.7 }), 420);
    setTimeout(
      () => {
        setOpened(true);
        setTearing(false);
      },
      reduced ? 80 : 620,
    );
  }

  function reveal(i: number) {
    if (shown.has(i)) return;
    setShown((s) => new Set(s).add(i));
    const rarity = CARD_BY_ID.get(current.cards[i]!.id)!.rarity;
    play("tourFlip", { volume: 0.8 });
    if (rarity === "epique") play("achievement", { delay: 180 });
    if (rarity === "legendaire") {
      play("tourFanfare", { delay: 180 });
      if (!reduced) {
        setTimeout(() => {
          void confetti({
            particleCount: 140,
            spread: 95,
            startVelocity: 42,
            origin: { y: 0.45 },
            colors: ["#ffe28a", "#d9a21e", "#fff8d2", "#ffffff"],
            scalar: 1,
            zIndex: 130,
          });
        }, 220);
      }
    }
  }

  function revealAll() {
    current.cards.forEach((_, i) => setTimeout(() => reveal(i), i * 170));
  }

  async function again() {
    setBusy(true);
    try {
      const next = await openPack();
      setCurrent(next);
      setShown(new Set());
      setOpened(false);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible d'ouvrir un paquet." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pack-screen" role="dialog" aria-modal="true" aria-label="Ouverture d'un paquet de cartes">
      {!opened ? (
        <>
          <button className={`pack ${tearing ? "is-torn" : ""}`} onClick={tear} aria-label="Déchirer le paquet">
            <span className="pack-part is-top" />
            <span className="pack-part is-body">
              <Logo size={46} withName={false} />
              <strong>L'Album de La Tablée</strong>
              <span>5 cartes</span>
            </span>
          </button>
          <p className="pack-hint">Touche le paquet pour le déchirer</p>
        </>
      ) : (
        <>
          <div className="pack-table" style={{ "--gap": `${GAP}px` } as CSSProperties}>
            {rows.map((row) => (
              <div key={row[0]} className="pack-row">
                {row.map((i) => {
                  const entry = current.cards[i]!;
                  const def = CARD_BY_ID.get(entry.id)!;
                  const on = shown.has(i);
                  return (
                    <motion.button
                      key={`${current.packs}-${i}`}
                      className={`flip glow-${def.rarity} ${on ? "is-shown" : ""}`}
                      style={{ width, height: Math.round(width * RATIO) }}
                      initial={reduced ? false : { y: 60, opacity: 0, scale: 0.7 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.07, type: "spring", stiffness: 300, damping: 24 }}
                      onClick={() => reveal(i)}
                      aria-label={on ? def.name : `Retourner la carte ${i + 1}`}
                    >
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
    </div>
  );
}
