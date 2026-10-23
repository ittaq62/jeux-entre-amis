import { AnimatePresence, motion } from "motion/react";
import { CardBack, CardFace, CARD_RATIO } from "../components/Card.tsx";
import { useFx, type Flight } from "./fx.ts";

/** Calque au-dessus de la table : cartes en vol, bandeaux, tampons, ondes de couleur. */
export function FxLayer() {
  const flights = useFx((s) => s.flights);
  const effects = useFx((s) => s.effects);
  return (
    <div className="fx-layer" aria-hidden="true">
      {flights.map((f) => (
        <FlyingCard key={f.id} flight={f} />
      ))}
      <AnimatePresence>
        {effects.map((e) => {
          if (e.kind === "ripple") {
            return (
              <motion.div
                key={e.id}
                className="fx-ripple"
                style={{ left: e.x, top: e.y, borderColor: e.color, boxShadow: `0 0 40px ${e.color}, inset 0 0 30px ${e.color}` }}
                initial={{ scale: 0.3, opacity: 0.9 }}
                animate={{ scale: 3.2, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            );
          }
          if (e.kind === "stamp") {
            return (
              <motion.div
                key={e.id}
                className={`fx-stamp tone-${e.tone ?? "red"}`}
                style={{ left: e.x, top: e.y }}
                initial={{ scale: 2.4, opacity: 0, rotate: -18 }}
                animate={{ scale: 1, opacity: 1, rotate: -9 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 520, damping: 22 }}
              >
                {e.text}
              </motion.div>
            );
          }
          if (e.kind === "float") {
            return (
              <motion.div
                key={e.id}
                className={`fx-float tone-${e.tone ?? "white"}`}
                style={{ left: e.x, top: e.y }}
                initial={{ y: 0, opacity: 0, scale: 0.6 }}
                animate={{ y: -46, opacity: [0, 1, 1, 0], scale: 1 }}
                transition={{ duration: e.duration / 1000, ease: "easeOut" }}
              >
                {e.text}
              </motion.div>
            );
          }
          return (
            <motion.div
              key={e.id}
              className={`fx-banner tone-${e.tone ?? "gold"} ${e.big ? "is-big" : ""}`}
              style={{ left: e.x, top: e.y }}
              initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
              animate={{ scale: 1, opacity: 1, rotate: -3 }}
              exit={{ scale: 1.25, opacity: 0, transition: { duration: 0.25 } }}
              transition={{ type: "spring", stiffness: 420, damping: 16 }}
            >
              <span className="fx-banner-text">{e.text}</span>
              {e.sub && <span className="fx-banner-sub">{e.sub}</span>}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function FlyingCard({ flight }: { flight: Flight }) {
  const { from, to, width } = flight;
  const fromScale = (flight.fromWidth ?? from.width) / width;
  const toScale = (flight.toWidth ?? to.width) / width;
  const height = width * CARD_RATIO;
  const fx = from.left + from.width / 2 - width / 2;
  const fy = from.top + from.height / 2 - height / 2;
  const tx = to.left + to.width / 2 - width / 2;
  const ty = to.top + to.height / 2 - height / 2;
  const showFace = flight.card !== null;
  return (
    <motion.div
      className="flying-card"
      style={{ width, height }}
      initial={{ x: fx, y: fy, scale: fromScale, rotate: flight.fromRotate }}
      animate={{
        x: tx,
        y: [fy, (fy + ty) / 2 - Math.min(60, Math.abs(ty - fy) * 0.25 + 18), ty],
        scale: [fromScale, Math.max(fromScale, toScale) * 1.12, toScale],
        rotate: flight.toRotate,
      }}
      transition={{ duration: flight.duration / 1000, delay: flight.delay / 1000, ease: [0.3, 0.7, 0.3, 1] }}
      onAnimationComplete={flight.done}
    >
      {flight.flip && showFace ? (
        <motion.div
          className="flip-inner"
          initial={{ rotateY: 180 }}
          animate={{ rotateY: 0 }}
          transition={{ duration: (flight.duration / 1000) * 0.7, delay: flight.delay / 1000 + (flight.duration / 1000) * 0.15 }}
        >
          <div className="flip-face">
            <CardFace card={flight.card!} width={width} />
          </div>
          <div className="flip-back">
            <CardBack width={width} />
          </div>
        </motion.div>
      ) : showFace ? (
        <CardFace card={flight.card!} width={width} />
      ) : (
        <CardBack width={width} />
      )}
    </motion.div>
  );
}
