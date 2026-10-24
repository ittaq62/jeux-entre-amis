import type { RoomStatus, SeatView } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";
import { useCountdown } from "../lib/countdown.ts";
import { toast } from "../lib/toast.ts";

/**
 * Sous le nom d'un joueur parti en pleine partie : le compte à rebours avant qu'un bot prenne sa place,
 * puis le bot qui joue pour lui jusqu'à son retour.
 */
export function AwayNote({ seat, serverOffset, compact = false }: { seat: SeatView; serverOffset: number; compact?: boolean }) {
  const left = useCountdown(seat.awayAt ?? null, serverOffset);
  if (seat.kind !== "human") return null;
  if (seat.autoplay) {
    return (
      <span className="away-note is-relay" title="Un bot joue à sa place jusqu'à son retour">
        <Icon name="bot" size={12} />
        {compact ? "bot en relais" : "un bot prend le relais"}
      </span>
    );
  }
  if (left === null) return null;
  return (
    <span className="away-note is-waiting" role="status" title="Déconnecté : sans retour d'ici là, un bot jouera à sa place">
      <Icon name="wifiOff" size={12} />
      {compact ? `bot dans ${left} s` : `déconnecté, bot dans ${left} s`}
    </span>
  );
}

/** Ce qu'on lit sur la ligne du tour quand c'est à un joueur parti. */
export function awayTurnNote(seat: SeatView | undefined, left: number | null): string {
  if (!seat || seat.kind !== "human") return "";
  if (seat.autoplay) return " : un bot prend le relais";
  if (left !== null) return `, déconnecté : un bot prend le relais dans ${left} s`;
  return "";
}

interface SeatsState {
  status: RoomStatus;
  seats: SeatView[];
}

/** Prévient toute la table quand un bot remplace un joueur, et quand celui-ci revient. */
export function announceSeatChanges(prev: SeatsState | null, next: SeatsState, me: string | null) {
  if (!prev || prev.status !== "playing" || next.status !== "playing") return;
  for (const seat of next.seats) {
    const before = prev.seats.find((s) => s.id === seat.id);
    if (!before || seat.kind !== "human" || seat.userId === me) continue;
    if (!before.autoplay && seat.autoplay) {
      toast({
        title: `Un bot prend le relais de ${seat.name}`,
        body: seat.autoplayReason === "afk" ? "Pas de réponse pendant ses tours." : "Déconnecté : sa place lui est gardée.",
      });
    } else if (before.autoplay && !seat.autoplay && seat.connected) {
      toast({ title: `${seat.name} est de retour`, body: "Le bot lui rend sa place." });
    }
  }
}
