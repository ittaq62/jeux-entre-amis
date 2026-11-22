// Le chargement de tous avant le départ, commun à tous les jeux. Quand une partie part (au lancer, à la revanche, dans
// une tournée), la salle crée la partie (chacun sait quoi charger : la carte, le circuit, les joueurs) mais la retient :
// chaque joueur prépare tout chez lui (modèles, textures, sons, polices, shaders, quelques images de chauffe) puis dit
// « chargé ». Quand tous l'ont dit, ou au bout de LOAD_MAX_MS (un joueur lent ou parti ne bloque pas les autres), un
// court compte à rebours, et la partie part pour tout le monde au même instant, sans à-coup dans les premières secondes.
// Les spectateurs et ceux qui arrivent en cours de route chargent de leur côté, sans retenir personne.

/** Au plus, on attend les retardataires ce temps-là */
export const LOAD_MAX_MS = 20_000;
/** Le compte à rebours, une fois tout le monde prêt */
export const LOAD_COUNTDOWN_MS = 3_000;

export interface LoadGate {
  /** Le numéro de ce départ : chaque départ (lancer, revanche) a le sien, un « chargé » d'un départ passé ne compte pas */
  id: number;
  /** Ceux qu'on attend : les joueurs présents au départ (pas les bots, pas les spectateurs) */
  waiting: string[];
  /** Ceux dont le jeu est prêt */
  loaded: string[];
  /** Au-delà, on part sans les retardataires */
  until: number;
  /** La fin du compte à rebours : le départ (null tant qu'on attend) */
  goAt: number | null;
  /**
   * La durée du compte à rebours (LOAD_COUNTDOWN_MS si absente). 0 pour un jeu qui a déjà sa propre introduction ou son
   * propre décompte (Culbute, Escarmouche, le Bowling) : elle part au départ commun et en tient lieu, sans deux décomptes
   * de suite.
   */
  countdown?: number;
}

/** Ce que les joueurs voient du chargement (dans la vue de la salle) */
export type LoadGateView = LoadGate;

/** Un départ : on attend ces joueurs-là (un nouveau numéro, différent du départ précédent) */
export function openGate(
  players: readonly string[],
  now: number,
  previous?: LoadGate | null,
  options: { countdown?: number } = {},
): LoadGate {
  const id = Math.max(now, (previous?.id ?? 0) + 1);
  const gate: LoadGate = { id, waiting: [...new Set(players)], loaded: [], until: now + LOAD_MAX_MS, goAt: null };
  if (options.countdown !== undefined) gate.countdown = options.countdown;
  settleGate(gate, now);
  return gate;
}

/** Le jeu de ce joueur est prêt (pour ce départ-là) ; vrai si c'est nouveau */
export function markLoaded(gate: LoadGate | null | undefined, player: string, id: unknown): boolean {
  if (!gate || id !== gate.id || gate.loaded.includes(player)) return false;
  gate.loaded.push(player);
  return true;
}

/** Ce joueur est parti ou déconnecté : on ne l'attend plus ; vrai si on l'attendait */
export function forgetPlayer(gate: LoadGate | null | undefined, player: string): boolean {
  if (!gate || gate.goAt !== null || !gate.waiting.includes(player)) return false;
  gate.waiting = gate.waiting.filter((p) => p !== player);
  return true;
}

/** Ceux qu'on attend encore */
export function stillLoading(gate: LoadGate | null | undefined): string[] {
  if (!gate || gate.goAt !== null) return [];
  return gate.waiting.filter((p) => !gate.loaded.includes(p));
}

/**
 * Tout le monde est prêt, ou on a assez attendu : le compte à rebours part (une seule fois). Vrai si quelque chose a
 * changé (à envoyer aux joueurs).
 */
export function settleGate(gate: LoadGate | null | undefined, now: number): boolean {
  if (!gate || gate.goAt !== null) return false;
  if (stillLoading(gate).length > 0 && now < gate.until) return false;
  gate.goAt = now + (gate.countdown ?? LOAD_COUNTDOWN_MS);
  return true;
}

/** La partie peut tourner : le compte à rebours est fini (pas de chargement en cours : rien à attendre) */
export function gatePassed(gate: LoadGate | null | undefined, now: number): boolean {
  return !gate || (gate.goAt !== null && now >= gate.goAt);
}

/** Quand la salle doit se réveiller pour ce chargement (la fin de l'attente, ou le départ), ou null */
export function gateWakeAt(gate: LoadGate | null | undefined, now: number): number | null {
  if (!gate) return null;
  if (gate.goAt === null) return gate.until;
  return gate.goAt > now ? gate.goAt : null;
}
