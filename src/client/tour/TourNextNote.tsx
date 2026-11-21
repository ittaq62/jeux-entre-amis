import { useCountdown } from "../lib/countdown.ts";
import { useTourBridge } from "./bridge.ts";

/**
 * À la feuille de fin d'un jeu de tournée : combien de temps avant l'entracte (ou la fin de la tournée), et « Continuer »
 * pour y passer plus tôt quand tout le monde a fini de lire. Rien hors d'une tournée.
 */
export function TourNextNote() {
  const bridge = useTourBridge();
  const hold = bridge?.endHold ?? null;
  const left = useCountdown(hold?.until ?? null, bridge?.serverOffset ?? 0);
  if (!bridge) return null;
  if (!hold || left === null) {
    // Le résultat n'est pas encore arrivé à la tournée : un instant
    return (
      <p className="tour-next-note">
        <span className="spinner" /> La tournée continue : le classement arrive.
      </p>
    );
  }
  const player = hold.players.includes(bridge.youId);
  const done = hold.done.includes(bridge.youId);
  const waiting = hold.players.filter((id) => !hold.done.includes(id)).length;
  return (
    <div className="tour-next-note" aria-live="polite">
      <span className="tour-next-time">
        {hold.last ? "Fin de la tournée" : "L'entracte"} dans <strong className="num">{left} s</strong>
      </span>
      {player && (
        <button type="button" className="btn btn-primary btn-sm" disabled={done} onClick={bridge.onContinue}>
          {done ? (waiting > 0 ? "On attend les autres…" : "C'est parti") : "Continuer"}
        </button>
      )}
    </div>
  );
}
