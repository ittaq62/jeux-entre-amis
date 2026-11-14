// Les connexions d'une table : un seul appareil par compte. Quand un compte arrive par une nouvelle connexion, les plus
// anciennes de ce compte sont prévenues, ne comptent plus, puis sont fermées. Sans cela, un joueur resté connecté
// ailleurs (un téléphone dans la poche, un autre onglet) jouait deux fois la même place : à Bolides, les deux
// appareils envoyaient chacun la position du même kart, et le serveur ne savait plus où il était.

import { SOCKET_REPLACED } from "../shared/protocol.ts";

/** Ce qu'une table garde sur une connexion, en plus de qui elle est : un autre appareil l'a-t-il remplacée ? */
interface Marked {
  replaced?: boolean;
}

/** WebSocket.OPEN (écrit ici pour que ce fichier se teste aussi en dehors du serveur) */
const OPEN = 1;

/** Cette connexion a été remplacée par un autre appareil du même compte */
export function isReplaced(ws: WebSocket): boolean {
  return (ws.deserializeAttachment() as Marked | null)?.replaced === true;
}

/** Une connexion qui compte : ouverte, et pas remplacée par un autre appareil du même compte */
export function isLive(ws: WebSocket): boolean {
  return ws.readyState === OPEN && !isReplaced(ws);
}

/**
 * Le compte vient d'arriver par `fresh` : ses autres connexions (`mine`, celles qui portent son nom) sont marquées,
 * reçoivent « replaced », puis sont fermées (le navigateur ne cherche pas à revenir tout seul, il propose de jouer
 * ici). Renvoie combien ont été remplacées.
 */
export function replaceOlder(mine: Iterable<WebSocket>, fresh: WebSocket): number {
  let count = 0;
  for (const old of mine) {
    if (old === fresh || isReplaced(old)) continue;
    count += 1;
    try {
      old.serializeAttachment({ ...(old.deserializeAttachment() as object | null), replaced: true });
    } catch {
      // déjà fermée
    }
    try {
      old.send(JSON.stringify({ t: "replaced" }));
    } catch {
      // déjà fermée
    }
    try {
      old.close(SOCKET_REPLACED, "Ouvert ailleurs");
    } catch {
      // déjà fermée
    }
  }
  return count;
}
