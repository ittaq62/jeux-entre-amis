// Ce que les salles ont en commun quand quelqu'un arrive : l'amitié avec un joueur (porte fermée en cours de
// route), et le refus poli d'une connexion. La décision elle-même est dans shared/lateJoin.ts.

import { arrival, needsFriendCheck, type Arrival, type ArrivalCase } from "../shared/lateJoin.ts";
import { acceptedFriendIds } from "./users.ts";

/** Les joueurs (humains) d'une table, dont l'amitié ouvre la porte quand elle est fermée */
export type TablePlayers = Iterable<{ kind: "human" | "bot"; userId: string | null }>;

/** Ami d'au moins un de ces joueurs ? Une erreur de la base vaut un non : on ne laisse pas entrer par erreur */
export async function isFriendOfAny(db: D1Database, userId: string, players: TablePlayers): Promise<boolean> {
  const ids = new Set<string>();
  for (const p of players) if (p.kind === "human" && p.userId && p.userId !== userId) ids.add(p.userId);
  if (ids.size === 0) return false;
  try {
    return (await acceptedFriendIds(db, userId)).some((id) => ids.has(id));
  } catch (err) {
    console.error("Amis introuvables", err);
    return false;
  }
}

/**
 * L'amitié de celui qui arrive, seulement si elle compte (porte fermée, ni assis ni déjà spectateur). L'administrateur
 * du site passe toujours, pour regarder (il peut fermer une table qui pose problème).
 */
export async function friendForArrival(
  db: D1Database,
  user: { id: string; admin?: boolean },
  c: ArrivalCase,
  players: TablePlayers,
): Promise<boolean> {
  if (!needsFriendCheck(c)) return false;
  return Boolean(user.admin) || (await isFriendOfAny(db, user.id, players));
}

/** La décision, une fois l'amitié connue */
export function decide(c: ArrivalCase, friend: boolean): Arrival {
  return arrival({ ...c, friend });
}

/**
 * Refuse l'entrée par la connexion même : le navigateur reçoit la raison (« closed ») puis une fermeture qu'il ne
 * cherche pas à rattraper. La salle ne la compte jamais : elle n'est pas confiée à la salle.
 */
export function refuseSocket(reason: string): Response {
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.send(JSON.stringify({ t: "closed", reason }));
  server.close(4004, "Table fermee");
  return new Response(null, { status: 101, webSocket: client });
}
