import { intentFrom, intentQuery, type ArrivalIntent } from "../../shared/lateJoin.ts";

/**
 * Ce que voulait celui qui arrive à un code (lu dans l'adresse : « ?regarder », « ?jouer ») : la salle le reçoit à la
 * première connexion, et l'écran ne repose pas la question à qui a déjà choisi.
 */
const arrivals = new Map<string, ArrivalIntent>();

export function noteArrival(code: string, search: string): ArrivalIntent {
  const intent = intentFrom(search);
  arrivals.set(code, intent);
  return intent;
}

export const arrivalIntent = (code: string): ArrivalIntent => arrivals.get(code) ?? null;

/** À ajouter à l'adresse de la première connexion à la salle */
export const arrivalQuery = (code: string): string => intentQuery(arrivalIntent(code));

/** Le lien d'une table, avec ce qu'on veut y faire */
export const tableHref = (code: string, intent: ArrivalIntent = null): string => `/salon/${code}${intentQuery(intent)}`;
