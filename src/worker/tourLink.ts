// Ce qu'une table de jeu fait de plus quand elle appartient à une tournée : la tournée l'a créée avec
// tout le monde déjà assis, la partie démarre dès que chacun est arrivé, et le résultat lui revient.

import type { GameId } from "../shared/protocol.ts";
import type { TableReport } from "../shared/tour.ts";

/** Temps laissé aux joueurs pour arriver à la table avant de commencer sans les absents */
export const TOUR_JOIN_MS = 15_000;
/** Une table de tournée finie s'efface vite : tout le monde est déjà passé au jeu suivant */
export const TOUR_TABLE_LINGER_MS = 3 * 60_000;

/** À une table de tournée, c'est la tournée qui décide des règles, des places et des revanches */
export const TOUR_LOCKED = new Set(["settings", "addBot", "removeSeat", "start", "rematch", "sit", "team", "kick"]);

export function tourStub(env: Env, code: string) {
  return env.TOURS.get(env.TOURS.idFromName(code));
}

/** La salle d'un jeu pour un code */
export function gameStub(env: Env, game: GameId, code: string) {
  if (game === "naval") return env.NAVAL.get(env.NAVAL.idFromName(code));
  if (game === "bricks") return env.BRICKS.get(env.BRICKS.idFromName(code));
  if (game === "capitale") return env.CAPITALE.get(env.CAPITALE.idFromName(code));
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

/** Prévient la tournée de la fin de la partie, sans jamais bloquer la table si elle ne répond pas */
export function reportToTour(env: Env, tourCode: string, report: TableReport) {
  return tourStub(env, tourCode)
    .tableFinished(report)
    .catch((err: unknown) => console.error("Tournée injoignable", err));
}

/** Les messages de la table (un bot qui prend la place d'un absent, le vainqueur…) vont aussi au chat de la tournée */
export function tourChat(env: Env, tourCode: string, tableCode: string, text: string) {
  void tourStub(env, tourCode)
    .tableChat(tableCode, text)
    .catch(() => {});
}

/** Pas assez de joueurs arrivés à la table : la tournée reprend la main */
export function abortToTour(env: Env, tourCode: string, tableCode: string) {
  return tourStub(env, tourCode)
    .tableAborted(tableCode)
    .catch((err: unknown) => console.error("Tournée injoignable", err));
}
