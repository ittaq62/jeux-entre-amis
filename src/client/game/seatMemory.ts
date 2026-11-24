import { useRef } from "react";

/**
 * Les sièges vus depuis l'ouverture d'une feuille de fin : un joueur qui quitte la table après la partie (son siège
 * est retiré) garde son nom et son portrait sur la feuille, au lieu d'un « ? ».
 */
export function useSeatMemory<S extends { id: string }>(seats: readonly S[]): (id: string) => S | undefined {
  const seen = useRef(new Map<string, S>());
  for (const s of seats) seen.current.set(s.id, s);
  return (id) => seats.find((s) => s.id === id) ?? seen.current.get(id);
}
