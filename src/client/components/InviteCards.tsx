import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { TABLE_NAMES } from "../../shared/protocol.ts";
import { INVITE_TTL_MS, useHub } from "../stores/hub.ts";
import { GameTicket } from "../tour/TourParts.tsx";
import { Avatar } from "./Avatar.tsx";
import { Icon } from "./Icon.tsx";

/** Les invitations reçues : elles attendent une réponse en haut de l'écran, où qu'on soit sur le site. */
export function InviteCards() {
  const invites = useHub((s) => s.invites);
  const answer = useHub((s) => s.answerInvite);

  // Dans un autre onglet, le titre de la page la signale
  useEffect(() => {
    if (invites.length === 0) return;
    const base = document.title;
    const flagged = `(${invites.length}) Invitation · ${base}`;
    document.title = flagged;
    return () => {
      if (document.title === flagged) document.title = base;
    };
  }, [invites.length]);

  return (
    <AnimatePresence initial={false}>
      {invites.map((inv) => (
        <motion.div
          key={`${inv.from.id}-${inv.at}`}
          layout
          className="invite-card"
          role="group"
          aria-label={`Invitation de ${inv.from.pseudo}`}
          initial={{ opacity: 0, y: -18, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          <div className="invite-card-top">
            <Avatar avatar={inv.from.avatar} userId={inv.from.id} photo={inv.from.photo} size={48} />
            <span className="invite-card-text">
              <strong>{inv.from.pseudo} t'invite</strong>
              <span>{inv.game === "tour" ? "à sa tournée" : `pour une partie de ${TABLE_NAMES[inv.game]}`}</span>
            </span>
            {inv.game === "tour" ? (
              <span className="invite-card-tour">
                <Icon name="trophy" size={22} />
              </span>
            ) : (
              <GameTicket game={inv.game} size="sm" />
            )}
          </div>
          <div className="invite-card-actions">
            <button className="btn btn-primary btn-sm" onClick={() => answer(inv, true)}>
              Rejoindre
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => answer(inv, false)}>
              Pas maintenant
            </button>
          </div>
          {/* Le temps qu'il reste avant que l'invitation s'efface */}
          <span
            className="invite-card-time"
            aria-hidden="true"
            style={{ animationDuration: `${INVITE_TTL_MS}ms`, animationDelay: `-${Date.now() - inv.at}ms` }}
          />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
