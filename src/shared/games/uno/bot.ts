import { COLORS, drawValue, isDrawCard, isWild, type Card, type Color } from "./cards.ts";
import {
  activeCount,
  canPlayCard,
  effectiveRules,
  mostCommonColor,
  nextIndex,
  playerIndex,
  type UnoAction,
  type UnoState,
} from "./engine.ts";
import { random, type RngHolder } from "../../rng.ts";

/**
 * Choisit les actions d'un bot pour son tour (ou pour un joueur absent).
 * Le bot ne voit que sa main et le nombre de cartes des autres, comme un humain.
 */
export function botTurn(s: UnoState, playerId: string, rng: RngHolder): UnoAction[] {
  const p = playerIndex(s, playerId);
  if (p < 0 || s.phase !== "playing" || s.turn !== p) return [];
  const me = s.players[p]!;

  if (s.roulette) return [{ type: "roulette", color: leastLikelyColor(me.hand, rng) }];

  if (s.challenge) {
    const accused = s.players[s.challenge.by]!;
    // Plus l'accuse a de cartes, plus il est probable qu'il avait la couleur
    const suspicion = accused.hand.length >= 6 ? 0.45 : accused.hand.length >= 3 ? 0.25 : 0.1;
    const stack = me.hand.filter((c) => canPlayCard(s, p, c));
    if (stack.length > 0) return withUno(s, p, playAction(s, p, stack[0]!, rng), rng);
    return random(rng) < suspicion ? [{ type: "challenge" }] : [{ type: "draw" }];
  }

  const playable = me.hand.filter((c) => canPlayCard(s, p, c));

  if (s.pendingDraw > 0) {
    if (playable.length === 0) return [{ type: "draw" }];
    // Repondre avec la plus petite carte « + » possible, garder les grosses
    const best = playable.slice().sort((a, b) => drawValue(a) - drawValue(b))[0]!;
    return withUno(s, p, playAction(s, p, best, rng), rng);
  }

  if (s.hasDrawn && s.drawnCardId !== null) {
    const drawn = me.hand.find((c) => c.id === s.drawnCardId);
    if (drawn && canPlayCard(s, p, drawn)) return withUno(s, p, playAction(s, p, drawn, rng), rng);
    return [{ type: "pass" }];
  }

  if (playable.length === 0) return [{ type: "draw" }];

  const choice = pickCard(s, p, playable, rng);
  return withUno(s, p, playAction(s, p, choice, rng), rng);
}

/** Avant de poser son avant-derniere carte, le bot crie UNO… la plupart du temps. */
function withUno(s: UnoState, p: number, actions: UnoAction[], rng: RngHolder): UnoAction[] {
  const me = s.players[p]!;
  const willHaveOne = me.hand.length === 2;
  if (willHaveOne && !me.declaredUno && random(rng) < 0.88) return [{ type: "uno" }, ...actions];
  return actions;
}

function playAction(s: UnoState, p: number, card: Card, rng: RngHolder): UnoAction[] {
  const me = s.players[p]!;
  const action: UnoAction = { type: "play", cardId: card.id };
  if (isWild(card) && card.kind !== "wildRoulette") {
    const rest = me.hand.filter((c) => c.id !== card.id);
    action.color = rest.length > 0 ? mostCommonColor(rest, rng) : COLORS[Math.floor(random(rng) * 4)]!;
  }
  if (card.kind === "number" && card.value === 7 && effectiveRules(s.settings).sevenZero) {
    // On echange avec la main la plus petite
    let target = -1;
    for (let i = 0; i < s.players.length; i++) {
      if (i === p || s.players[i]!.out) continue;
      if (target < 0 || s.players[i]!.hand.length < s.players[target]!.hand.length) target = i;
    }
    if (target >= 0) action.target = s.players[target]!.id;
  }
  return [action];
}

function pickCard(s: UnoState, p: number, playable: Card[], rng: RngHolder): Card {
  const me = s.players[p]!;
  const next = s.players[nextIndex(s, p, 1)]!;
  const danger = next.hand.length <= 2;
  const colorCounts = new Map<string, number>();
  for (const c of me.hand) if (c.color) colorCounts.set(c.color, (colorCounts.get(c.color) ?? 0) + 1);

  let best = playable[0]!;
  let bestScore = -Infinity;
  for (const card of playable) {
    let score = 0;
    const wild = isWild(card);
    if (card.kind === "number") score += 10 + (card.value ?? 0) * 0.6;
    if (card.color) score += (colorCounts.get(card.color) ?? 0) * 2.2;
    if (wild) score -= me.hand.length > 3 ? 16 : 2; // garder les jokers pour la fin
    if (card.kind === "wild4") {
      const hasColor = me.hand.some((c) => c.id !== card.id && c.color === s.color);
      if (hasColor) score -= 30; // bluff rare
    }
    if (isDrawCard(card) || card.kind === "skip" || card.kind === "skipAll") {
      score += danger ? 25 : 4;
    }
    if (card.kind === "reverse") score += danger && activeCount(s) > 2 ? 14 : 3;
    if (card.kind === "discardAll" && card.color) score += (colorCounts.get(card.color) ?? 0) * 4;
    if (card.kind === "number" && card.value === 7 && effectiveRules(s.settings).sevenZero) {
      const smallest = Math.min(...s.players.filter((pl, i) => i !== p && !pl.out).map((pl) => pl.hand.length));
      score += smallest < me.hand.length - 1 ? 18 : -8;
    }
    score += random(rng) * 3;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best;
}

/** Pour la roulette, on choisit la couleur la plus rare dans sa main… en esperant qu'elle sorte vite. */
function leastLikelyColor(hand: Card[], rng: RngHolder): Color {
  const counts: Record<Color, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.color) counts[c.color] += 1;
  // Toutes les couleurs ont la meme frequence dans la pioche : n'importe laquelle se vaut,
  // on varie pour que le bot ne soit pas previsible.
  return COLORS.slice().sort((a, b) => counts[b] - counts[a] + (random(rng) - 0.5))[0]!;
}

/** Un bot qui voit un joueur oublier son UNO le denonce-t-il, et apres combien de temps ? */
export function botCatchDelay(rng: RngHolder): number | null {
  if (random(rng) > 0.7) return null;
  return 1100 + Math.floor(random(rng) * 1700);
}

/** Delai de reflexion d'un bot, pour un rythme naturel. */
export function botThinkDelay(s: UnoState, rng: RngHolder): number {
  const base = s.pendingDraw > 0 ? 900 : 1100;
  return base + Math.floor(random(rng) * 900);
}
