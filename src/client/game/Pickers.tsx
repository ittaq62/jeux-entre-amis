import { AnimatePresence, motion } from "motion/react";
import { COLORS, COLOR_LABELS, type Color } from "../../shared/games/uno/cards.ts";
import type { UnoPlayerView } from "../../shared/games/uno/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { COLOR_HEX } from "../components/Card.tsx";

/** Choix de couleur : quatre quartiers d'une roue. */
export function ColorPicker({
  open,
  title,
  onPick,
  onCancel,
}: {
  open: boolean;
  title: string;
  onPick: (c: Color) => void;
  onCancel?: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
          <motion.div
            className="color-picker"
            initial={{ scale: 0.5, rotate: -45, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="picker-title">{title}</p>
            <div className="color-wheel">
              {COLORS.map((color, i) => (
                <motion.button
                  key={color}
                  className={`color-quarter q${i}`}
                  style={{ background: COLOR_HEX[color] }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onPick(color)}
                  aria-label={COLOR_LABELS[color]}
                >
                  <span>{COLOR_LABELS[color]}</span>
                </motion.button>
              ))}
              <span className="color-hub" />
            </div>
            {onCancel && (
              <button className="btn btn-ghost btn-sm" onClick={onCancel}>
                Annuler
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Choix du joueur avec qui echanger sa main (regle du 7). */
export function TargetPicker({
  open,
  seats,
  players,
  me,
  onPick,
  onCancel,
}: {
  open: boolean;
  seats: SeatView[];
  players: UnoPlayerView[];
  me: string | null;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const options = players.filter((p) => p.id !== me && !p.out);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
          <motion.div
            className="target-picker panel"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="picker-title">Échanger ta main avec…</p>
            <div className="target-list">
              {options.map((p) => {
                const seat = seats.find((s) => s.id === p.id);
                if (!seat) return null;
                return (
                  <button key={p.id} className="target-option" onClick={() => onPick(p.id)}>
                    <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={44} />
                    <strong>{seat.name}</strong>
                    <span className="hint num">
                      {p.count} carte{p.count > 1 ? "s" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onCancel}>
              Annuler
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
