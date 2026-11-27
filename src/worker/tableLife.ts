// La vie d'une table quand ses joueurs s'en vont, la même dans toutes les salles : qui tient la table après l'hôte, et
// combien de temps une table vide reste ouverte. Sans ça, une table quittée par l'hôte restait « active dans le vide » :
// ses bots jouaient seuls (et la partie s'enregistrait), elle restait listée et réveillait le serveur dix ou vingt minutes.

/** Plus personne de connecté (ni assis, ni spectateur), avant ou après la partie : le temps de recharger la page */
export const EMPTY_LOBBY_MS = 60_000;
/** Plus personne de connecté pendant la partie : le temps d'un appel ou d'un écran éteint, pas plus (les bots jouent) */
export const EMPTY_PLAYING_MS = 3 * 60_000;
/** Le dernier présent a quitté la table (« Quitter ») : elle ferme presque aussitôt */
export const LEFT_EMPTY_MS = 15_000;

/** Combien de temps une table sans personne reste ouverte, selon où elle en est */
export function emptyTableDelay(status: string): number {
  return status === "playing" || status === "intermission" ? EMPTY_PLAYING_MS : EMPTY_LOBBY_MS;
}

/** Ce que la règle de l'hôte lit d'une place : bot ou joueur (les places de Crampons sont toutes à des joueurs) */
export interface HostSeat {
  kind?: "human" | "bot";
  userId: string | null;
  name: string;
}

/**
 * Le nouvel hôte de la table, ou null s'il ne change pas. L'hôte garde la main tant qu'il a sa place (ou qu'il est là,
 * table vide), sauf s'il est `absent` : parti (« Quitter »), ou remplacé par un bot après une coupure en pleine partie.
 * La main passe alors à un joueur assis et connecté, sinon (hôte simplement sans place) à un joueur assis, sinon à
 * n'importe quel présent. Un hôte absent sans personne pour le remplacer garde la main.
 */
export function nextHost(
  seats: readonly HostSeat[],
  hostId: string,
  connected: ReadonlyMap<string, { pseudo: string }>,
  absent?: string,
): { id: string; name: string } | null {
  const gone = absent !== undefined && absent === hostId;
  if (!gone) {
    if (seats.some((s) => s.userId === hostId)) return null;
    if (seats.length === 0 && connected.has(hostId)) return null;
  }
  const human = (s: HostSeat) => s.kind !== "bot" && s.userId !== null && s.userId !== absent;
  const next = seats.find((s) => human(s) && connected.has(s.userId!)) ?? (gone ? undefined : seats.find(human));
  const id = next?.userId ?? [...connected.keys()].find((u) => u !== absent);
  if (!id || id === hostId) return null;
  return { id, name: next?.name ?? connected.get(id)?.pseudo ?? "Quelqu'un" };
}
