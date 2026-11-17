// Les événements des autres attendent l'image où on les voit arriver. Onglet caché, plus d'image : ils s'entassaient,
// puis passaient tous d'un coup au retour (des milliers de traçantes et de sons, l'image gelait).

/** Au-delà, un événement est trop vieux pour être montré : on l'oublie (le joueur ne regardait pas) */
export const STALE_MS = 3000;
/** Au plus tant d'événements en attente */
export const QUEUE_CAP = 400;

/** Ajoute un événement à la file, sans qu'elle dépasse sa taille */
export function enqueue<T>(queue: { at: number; e: T }[], at: number, e: T) {
  queue.push({ at, e });
  if (queue.length > QUEUE_CAP) queue.splice(0, queue.length - QUEUE_CAP);
}

/** Les événements à montrer à cet instant, dans l'ordre ; ceux restés trop longtemps en file sont oubliés */
export function due<T>(queue: { at: number; e: T }[], renderAt: number): T[] {
  const out: T[] = [];
  while (queue.length > 0 && queue[0]!.at <= renderAt) {
    const { at, e } = queue.shift()!;
    if (renderAt - at <= STALE_MS) out.push(e);
  }
  return out;
}
