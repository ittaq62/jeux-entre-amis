import { motion } from "motion/react";
import type { EloResult } from "../../shared/protocol.ts";

/** Sur la feuille de fin : le nouvel Elo et ce que la partie a fait gagner ou perdre. Il arrive juste après la fin. */
export function EloLine({ result }: { result: EloResult | null | undefined }) {
  if (!result) return null;
  const tone = result.delta > 0 ? "is-up" : result.delta < 0 ? "is-down" : "";
  const sign = result.delta > 0 ? "+" : result.delta < 0 ? "−" : "±";
  return (
    <motion.p className="gameover-elo" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      Elo <strong className="num">{result.elo}</strong>
      <span className={`elo-delta num ${tone}`}>
        {sign}
        {Math.abs(result.delta)}
      </span>
    </motion.p>
  );
}
