/**
 * Les sièges déjà vus sur cette page : un joueur qui quitte la table après la partie (son siège est retiré) garde son
 * nom et son portrait sur la feuille de fin, au lieu d'un « ? », même si la feuille se rouvre après son départ
 * (« Voir la table » puis « Revoir les résultats »). Les sièges actuels passent toujours avant.
 */
const seen = new Map<string, { id: string }>();

export function useSeatMemory<S extends { id: string }>(seats: readonly S[]): (id: string) => S | undefined {
  for (const s of seats) seen.set(s.id, s);
  return (id) => seats.find((s) => s.id === id) ?? (seen.get(id) as S | undefined);
}
