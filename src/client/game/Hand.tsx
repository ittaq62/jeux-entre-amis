import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { COLORS, type Card } from "../../shared/games/uno/cards.ts";
import { CardFace, CARD_RATIO } from "../components/Card.tsx";
import { anchor } from "./fx.ts";
import { usePileExtras } from "./pileExtras.ts";

const KIND_ORDER = [
  "number",
  "skip",
  "reverse",
  "draw2",
  "draw4",
  "skipAll",
  "discardAll",
  "wild",
  "wildRoulette",
  "wild4",
  "wildReverse4",
  "wild6",
  "wild10",
];

/** Main triee par couleur puis par valeur, jokers a la fin. */
export function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => {
    const ca = a.color ? COLORS.indexOf(a.color) : 9;
    const cb = b.color ? COLORS.indexOf(b.color) : 9;
    if (ca !== cb) return ca - cb;
    const ka = KIND_ORDER.indexOf(a.kind);
    const kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    return (a.value ?? 0) - (b.value ?? 0);
  });
}

interface HandProps {
  cards: Card[];
  playable: Set<number>;
  myTurn: boolean;
  cardWidth: number;
  onPlay: (card: Card) => void;
  highlight: number | null;
}

/**
 * Vrai survol à la souris ? Sur téléphone, le navigateur simule un survol à l'endroit du dernier appui,
 * et le rejoue quand les cartes bougent dessous : une carte restait levée par-dessus ses voisines
 * et prenait les appuis destinés à celles-ci.
 */
function useCanHover(): boolean {
  const [can, setCan] = useState(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCan(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return can;
}

export function Hand({ cards, playable, myTurn, cardWidth, onPlay, highlight }: HandProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const canHover = useCanHover();
  const hidden = usePileExtras((s) => s.hidden);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const visible = cards.filter((c) => !hidden.has(c.id));
  const n = visible.length;
  const height = cardWidth * CARD_RATIO;
  // Les cartes du bord de l'eventail sont inclinees : leur coin deborde d'autant sur les cotes
  const fanAngle = Math.min(4, 36 / Math.max(n, 1));
  const edgeTilt = (((n - 1) / 2) * fanAngle * Math.PI) / 180;
  const margin = 10 + Math.sin(edgeTilt) * height * 1.05;
  const usable = Math.max(cardWidth, width - 2 * margin);
  let step = n > 1 ? Math.min(cardWidth * 0.68, (usable - cardWidth) / (n - 1)) : 0;
  const scroll = n > 1 && step < cardWidth * 0.3;
  if (scroll) step = cardWidth * 0.34;
  const total = cardWidth + step * Math.max(0, n - 1);
  const start = scroll ? 12 : (width - total) / 2;
  const maxAngle = scroll ? 0 : fanAngle;
  const innerWidth = scroll ? total + 24 : width;
  // Une carte qui arrive part du centre de la main, là où se pose la carte piochée qui vole
  // depuis la pioche : elle glisse jusqu'à sa place au lieu de réapparaître en fondu.
  const arrival = { x: innerWidth / 2 - cardWidth / 2, y: 15, opacity: 1, rotate: 0 };

  return (
    <div className={`hand ${scroll ? "is-scroll" : ""} ${myTurn ? "is-my-turn" : ""}`} ref={ref} style={{ height: height + 34 }}>
      <div className="hand-inner" ref={anchor("hand")} style={{ width: scroll ? innerWidth : "100%", height: height + 30 }}>
        {visible.map((card, i) => {
          const offset = i - (n - 1) / 2;
          const angle = offset * maxAngle;
          const arc = scroll ? 0 : Math.abs(offset) ** 1.5 * (cardWidth / 90);
          const canPlay = myTurn && playable.has(card.id);
          const lifted = hover === card.id || highlight === card.id;
          const y = 12 + arc - (canPlay ? 10 : 0) - (lifted && canPlay ? 16 : lifted ? 6 : 0);
          return (
            <motion.button
              key={card.id}
              type="button"
              ref={anchor(`hand-card-${card.id}`)}
              className={`hand-card ${canPlay ? "is-playable" : ""} ${myTurn && !canPlay ? "is-dim" : ""} ${highlight === card.id ? "is-highlight" : ""}`}
              style={{ width: cardWidth, height, zIndex: lifted ? 100 : i }}
              initial={arrival}
              animate={{ x: start + i * step, y, opacity: 1, rotate: angle }}
              transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
              onPointerEnter={(e) => canHover && e.pointerType === "mouse" && setHover(card.id)}
              onPointerLeave={() => setHover((h) => (h === card.id ? null : h))}
              // Au clavier seulement : un appui du doigt donne aussi le focus à la carte
              onFocus={(e) => e.currentTarget.matches(":focus-visible") && setHover(card.id)}
              onBlur={() => setHover((h) => (h === card.id ? null : h))}
              onClick={() => onPlay(card)}
              aria-disabled={!canPlay}
            >
              <CardFace card={card} width={cardWidth} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
