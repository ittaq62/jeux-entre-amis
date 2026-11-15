import { lazy, Suspense, useEffect } from "react";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";
import { useStreak } from "../stores/streak.ts";
import { Icon } from "./Icon.tsx";
import "../styles/streak.css";

// La fenêtre de la semaine n'est chargée que pour s'ouvrir
const StreakDialog = lazy(() => import("./StreakDialog.tsx").then((m) => ({ default: m.StreakDialog })));

/**
 * Sur l'accueil : sa série en un coup d'œil, qui ouvre la fenêtre de la semaine. Arriver sur l'accueil compte le jour
 * (le serveur décide) ; si ça vient de rapporter quelque chose, la fenêtre s'ouvre toute seule.
 */
export function StreakChip() {
  const userId = useSession((s) => s.user?.id ?? null);
  const status = useStreak((s) => (s.userId === userId ? s.status : null));
  const open = useStreak((s) => s.open && s.userId === userId);
  const claim = useStreak((s) => s.claim);
  const show = useStreak((s) => s.show);

  useEffect(() => {
    if (userId) void claim(userId);
  }, [userId, claim]);

  async function onClick() {
    if (!userId) return;
    if (!useStreak.getState().status) await claim(userId, true);
    if (useStreak.getState().status) show();
    else toast({ tone: "danger", title: "Ta série n'est pas disponible pour l'instant. Réessaie dans un moment." });
  }

  const days = status?.login.streak ?? 0;
  return (
    <>
      <button
        type="button"
        className={`streak-chip ${status ? "" : "is-waiting"}`}
        onClick={() => void onClick()}
        aria-label={status ? `Ta série : ${days} jour${days > 1 ? "s" : ""} d'affilée. Voir ta semaine` : "Voir ta série"}
      >
        <Icon name="flame" size={17} aria-hidden="true" />
        {status ? (
          <span>
            <strong className="num">{days}</strong> jour{days > 1 ? "s" : ""} d'affilée
          </span>
        ) : (
          <span>Ta série</span>
        )}
      </button>
      {open && (
        <Suspense fallback={null}>
          <StreakDialog />
        </Suspense>
      )}
    </>
  );
}
