import type { DeckId } from "./board.ts";
import { actorOf, auctionBidders, netWorth, type CapitaleState } from "./engine.ts";

/** Tout est public à Capitale, sauf l'ordre des cartes et le générateur de hasard. */
export type CapitaleView = Omit<CapitaleState, "decks" | "rng" | "decisionKey" | "rigged"> & {
  /** Cartes restant dans chaque paquet */
  deckCounts: Record<DeckId, number>;
  /** Celui dont on attend la décision (personne pendant une enchère) */
  actor: string | null;
  /** Encore en lice dans l'enchère en cours */
  bidders: string[];
  /** Fortune de chacun : argent, titres et constructions */
  worth: Record<string, number>;
  you: string | null;
};

export function viewFor(s: CapitaleState, viewerId: string | null): CapitaleView {
  const { decks, rng: _rng, decisionKey: _key, rigged: _rigged, ...rest } = s;
  return {
    ...rest,
    deeds: s.deeds.map((d) => (d ? { ...d } : null)),
    players: s.players.map((p) => ({ ...p, jailCards: [...p.jailCards], stats: { ...p.stats } })),
    deckCounts: { hasard: decks.hasard.length, courrier: decks.courrier.length },
    actor: actorOf(s),
    bidders: auctionBidders(s),
    worth: Object.fromEntries(s.players.map((p) => [p.id, netWorth(s, p.id)])),
    you: viewerId && s.players.some((p) => p.id === viewerId) ? viewerId : null,
  };
}
