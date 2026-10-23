import type { Card, Color } from "./cards.ts";
import {
  effectiveRules,
  hasStackableCard,
  playableCardIds,
  playerIndex,
  topCard,
  UNO_GRACE_MS,
  type RoundResult,
  type UnoSettings,
  type UnoState,
} from "./engine.ts";

export interface UnoPlayerView {
  id: string;
  count: number;
  out: boolean;
  eliminated: boolean;
  score: number;
  declaredUno: boolean;
  /** Rang de sortie en mode classement */
  rank: number | null;
}

/** Ce qu'un joueur a le droit de voir : sa main, et seulement le nombre de cartes des autres. */
export interface UnoView {
  settings: UnoSettings;
  you: string | null;
  hand: Card[];
  playable: number[];
  players: UnoPlayerView[];
  turn: string;
  direction: 1 | -1;
  color: Color;
  top: Card;
  /** Dernieres cartes de la defausse, pour l'effet de pile */
  pile: Card[];
  drawCount: number;
  pendingDraw: number;
  canChallenge: boolean;
  canStack: boolean;
  drawnCardId: number | null;
  hasDrawn: boolean;
  /** Joueur qui a oublie de crier UNO et peut etre denonce */
  unoVulnerable: string | null;
  unoWindowEndsAt: number | null;
  canUno: boolean;
  rouletteVictim: string | null;
  phase: UnoState["phase"];
  round: number;
  lastRound: RoundResult | null;
  ranking: string[] | null;
  turnId: number;
  mercyLimit: number | null;
}

export function viewFor(s: UnoState, viewerId: string | null): UnoView {
  const me = viewerId ? playerIndex(s, viewerId) : -1;
  const meP = me >= 0 ? s.players[me]! : null;
  const isMyTurn = me >= 0 && me === s.turn;
  const rank = (i: number) => {
    const k = s.finishOrder.indexOf(i);
    return k >= 0 ? k + 1 : null;
  };
  const w = s.unoWindow;
  return {
    settings: s.settings,
    you: meP?.id ?? null,
    hand: meP ? meP.hand.slice() : [],
    playable: me >= 0 ? playableCardIds(s, me) : [],
    players: s.players.map((p, i) => ({
      id: p.id,
      count: p.hand.length,
      out: p.out,
      eliminated: p.eliminated,
      score: p.score,
      declaredUno: p.declaredUno,
      rank: rank(i),
    })),
    turn: s.players[s.turn]!.id,
    direction: s.direction,
    color: s.color,
    top: topCard(s),
    pile: s.discard.slice(-8),
    drawCount: s.drawPile.length,
    pendingDraw: s.pendingDraw,
    canChallenge: isMyTurn && s.challenge !== null,
    canStack: isMyTurn && s.pendingDraw > 0 && hasStackableCard(s, me),
    drawnCardId: isMyTurn ? s.drawnCardId : null,
    hasDrawn: isMyTurn && s.hasDrawn,
    unoVulnerable: w ? s.players[w.player]!.id : null,
    unoWindowEndsAt: w ? w.since + UNO_GRACE_MS : null,
    canUno:
      meP !== null && !meP.out && s.phase === "playing" && (w?.player === me || (meP.hand.length === 2 && !meP.declaredUno && isMyTurn)),
    rouletteVictim: s.roulette ? s.players[s.turn]!.id : null,
    phase: s.phase,
    round: s.round,
    lastRound: s.lastRound,
    ranking: s.ranking,
    turnId: s.turnId,
    mercyLimit: effectiveRules(s.settings).noMercy ? 25 : null,
  };
}
