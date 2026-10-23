import { AnimatePresence, motion } from "motion/react";
import type { Card } from "../../shared/games/uno/cards.ts";
import type { UnoView } from "../../shared/games/uno/view.ts";
import { CardBack, CardFace, COLOR_HEX } from "../components/Card.tsx";
import { pileRotation } from "./animate.ts";
import { anchor } from "./fx.ts";
import { usePileExtras } from "./pileExtras.ts";

interface CenterProps {
  game: UnoView;
  pileWidth: number;
  canDraw: boolean;
  onDraw: () => void;
}

export function Center({ game, pileWidth, canDraw, onDraw }: CenterProps) {
  const extras = usePileExtras((s) => s.cards);
  const pile: Card[] = [...game.pile, ...extras].slice(-5);
  const color = COLOR_HEX[game.color];
  const stackDepth = Math.min(4, Math.ceil(game.drawCount / 25));
  return (
    <div className="center">
      <div className={`direction-ring ${game.direction === 1 ? "is-cw" : "is-ccw"}`} aria-hidden="true">
        <svg viewBox="0 0 200 200">
          <defs>
            <marker id="dir-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {[0, 120, 240].map((a) => (
            <path
              key={a}
              d="M100 8 A92 92 0 0 1 179.7 54"
              transform={`rotate(${a} 100 100)`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              markerEnd={game.direction === 1 ? "url(#dir-arrow)" : undefined}
              markerStart={game.direction === -1 ? "url(#dir-arrow)" : undefined}
            />
          ))}
        </svg>
      </div>

      <button
        type="button"
        className={`deck ${canDraw ? "is-active" : ""}`}
        ref={anchor("deck")}
        onClick={onDraw}
        disabled={!canDraw}
        aria-label={`Piocher (${game.drawCount} cartes restantes)`}
        style={{ width: pileWidth, height: pileWidth * 1.4 }}
      >
        {Array.from({ length: stackDepth }, (_, i) => (
          <span key={i} className="deck-layer" style={{ transform: `translate(${-i * 1.6}px, ${-i * 1.8}px)` }}>
            <CardBack width={pileWidth} />
          </span>
        ))}
        <span className="deck-count">{game.drawCount}</span>
      </button>

      <div className="pile-wrap">
        <motion.div
          className="pile-halo"
          animate={{ backgroundColor: color, boxShadow: `0 0 46px 10px ${color}` }}
          transition={{ duration: 0.5 }}
          style={{ width: pileWidth * 1.55, height: pileWidth * 1.55 }}
        />
        <div className="pile" ref={anchor("pile")} style={{ width: pileWidth, height: pileWidth * 1.4 }}>
          {pile.map((card, i) => (
            <div key={card.id} className="pile-card" style={{ transform: `rotate(${pileRotation(card.id)}deg)`, zIndex: i }}>
              <CardFace card={card} width={pileWidth} />
            </div>
          ))}
        </div>
        <div className="pile-color" style={{ background: color }}>
          {{ red: "Rouge", yellow: "Jaune", green: "Vert", blue: "Bleu" }[game.color]}
        </div>
        <AnimatePresence>
          {game.pendingDraw > 0 && (
            <motion.div
              key="pending"
              className="pending-badge"
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: -8 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
            >
              +{game.pendingDraw}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
