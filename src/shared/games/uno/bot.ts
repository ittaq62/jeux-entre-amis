import { COLORS, drawValue, isDrawCard, isWild, type Card, type Color } from "./cards.ts";
import {
  activeCount,
  canPlayCard,
  effectiveRules,
  mostCommonColor,
  nextIndex,
  playerIndex,
  type UnoAction,
  type UnoBotLevel,
  type UnoState,
} from "./engine.ts";
import { random, type RngHolder } from "../../rng.ts";

/** Ce qui distingue les niveaux : l'attention (UNO, dénonciation), le flair (contestation) et le calcul */
interface UnoBotStyle {
  /** La chance de poser une carte qui va, au hasard, sans réfléchir */
  careless: number;
  /** La chance de crier UNO avant de poser son avant-dernière carte (UNO d'avance permis) */
  unoEarly: number;
  /** Sans UNO d'avance, la chance de le crier une fois la carte posée */
  unoAfter: number;
  /** Avec UNO d'avance, la chance de se rattraper après un oubli */
  unoAfterLate: number;
  /** La chance de dénoncer un oubli, et dans quel délai */
  catchChance: number;
  catchDelay: [number, number];
  /** Le flair pour contester un +4 */
  suspicion: number;
  /** Le suivant est en danger à partir de ce nombre de cartes */
  dangerAt: number;
  /** Garde ses cartes « + » et « passe » pour se défendre, tant que personne n'est près de finir */
  keepsDefence: boolean;
}

export const UNO_BOT_STYLE: Record<UnoBotLevel, UnoBotStyle> = {
  facile: {
    careless: 0.6,
    unoEarly: 0.7,
    unoAfter: 0.72,
    unoAfterLate: 0.35,
    catchChance: 0.35,
    catchDelay: [1800, 3600],
    suspicion: 0.6,
    dangerAt: 1,
    keepsDefence: false,
  },
  moyen: {
    careless: 0,
    unoEarly: 0.88,
    unoAfter: 0.88,
    unoAfterLate: 0.5,
    catchChance: 0.7,
    catchDelay: [1100, 2800],
    suspicion: 1,
    dangerAt: 2,
    keepsDefence: false,
  },
  fort: {
    careless: 0,
    unoEarly: 0.98,
    unoAfter: 0.97,
    unoAfterLate: 0.8,
    catchChance: 0.92,
    catchDelay: [750, 1900],
    suspicion: 1.3,
    dangerAt: 3,
    keepsDefence: true,
  },
};

const styleOf = (level: UnoBotLevel | undefined): UnoBotStyle => UNO_BOT_STYLE[level ?? "moyen"] ?? UNO_BOT_STYLE.moyen;

/**
 * Choisit les actions d'un bot pour son tour (ou pour un joueur absent).
 * Le bot ne voit que sa main et le nombre de cartes des autres, comme un humain. En équipe (`partners` : les
 * ids de ses coéquipiers), il évite de frapper son partenaire et ne lui prend pas sa main.
 */
export function botTurn(
  s: UnoState,
  playerId: string,
  rng: RngHolder,
  partners: ReadonlySet<string> = new Set(),
  level: UnoBotLevel = "moyen",
): UnoAction[] {
  const p = playerIndex(s, playerId);
  if (p < 0 || s.phase !== "playing" || s.turn !== p) return [];
  const me = s.players[p]!;
  const style = styleOf(level);
  const withUno = (s: UnoState, p: number, actions: UnoAction[], rng: RngHolder) => withUnoCall(s, p, actions, rng, style);

  if (s.roulette) return [{ type: "roulette", color: leastLikelyColor(me.hand, rng) }];

  if (s.challenge) {
    const accused = s.players[s.challenge.by]!;
    // Plus l'accuse a de cartes, plus il est probable qu'il avait la couleur
    const suspicion = (accused.hand.length >= 6 ? 0.45 : accused.hand.length >= 3 ? 0.25 : 0.1) * style.suspicion;
    const stack = me.hand.filter((c) => canPlayCard(s, p, c));
    if (stack.length > 0) return withUno(s, p, playAction(s, p, stack[0]!, rng, partners), rng);
    return random(rng) < suspicion ? [{ type: "challenge" }] : [{ type: "draw" }];
  }

  const playable = me.hand.filter((c) => canPlayCard(s, p, c));

  if (s.pendingDraw > 0) {
    if (playable.length === 0) return [{ type: "draw" }];
    // Repondre avec la plus petite carte « + » possible, garder les grosses
    const best = playable.slice().sort((a, b) => drawValue(a) - drawValue(b))[0]!;
    return withUno(s, p, playAction(s, p, best, rng, partners), rng);
  }

  if (s.hasDrawn && s.drawnCardId !== null) {
    const drawn = me.hand.find((c) => c.id === s.drawnCardId);
    if (drawn && canPlayCard(s, p, drawn)) return withUno(s, p, playAction(s, p, drawn, rng, partners), rng);
    return [{ type: "pass" }];
  }

  if (playable.length === 0) return [{ type: "draw" }];

  // 7-0 : un 0 donne sa main au suivant et prend celle d'avant. Avec une main plus petite que celle qu'on recevrait,
  // mieux vaut piocher (quand on en a le droit) que de faire cadeau de ses dernières cartes.
  const rules = effectiveRules(s.settings);
  const badZero = (c: Card) => rules.sevenZero && c.kind === "number" && c.value === 0 && me.hand.length > 1 && zeroLoss(s, p) > 0;
  if (!rules.mustPlay && playable.every(badZero)) return [{ type: "draw" }];
  const sensible = playable.filter((c) => !badZero(c));

  const pool = sensible.length > 0 ? sensible : playable;
  // Le bot facile pose souvent la première carte qui va, sans calcul
  const choice = random(rng) < style.careless ? pool[Math.floor(random(rng) * pool.length)]! : pickCard(s, p, pool, rng, partners, style);
  return withUno(s, p, playAction(s, p, choice, rng, partners), rng);
}

/**
 * Avant de poser son avant-derniere carte, le bot crie UNO… la plupart du temps. Sans UNO d'avance, il attend d'avoir
 * posé sa carte : c'est la salle qui le fait crier un peu après (voir `botUnoDelay`).
 */
function withUnoCall(s: UnoState, p: number, actions: UnoAction[], rng: RngHolder, style: UnoBotStyle): UnoAction[] {
  if (!effectiveRules(s.settings).earlyUno) return actions;
  const me = s.players[p]!;
  const willHaveOne = me.hand.length === 2;
  if (willHaveOne && !me.declaredUno && random(rng) < style.unoEarly) return [{ type: "uno" }, ...actions];
  return actions;
}

function playAction(s: UnoState, p: number, card: Card, rng: RngHolder, partners: ReadonlySet<string>): UnoAction[] {
  const me = s.players[p]!;
  const action: UnoAction = { type: "play", cardId: card.id };
  if (isWild(card) && card.kind !== "wildRoulette") {
    const rest = me.hand.filter((c) => c.id !== card.id);
    action.color = rest.length > 0 ? mostCommonColor(rest, rng) : COLORS[Math.floor(random(rng) * 4)]!;
  }
  if (card.kind === "number" && card.value === 7 && effectiveRules(s.settings).sevenZero) {
    // On echange avec la main la plus petite, jamais avec son partenaire
    let target = -1;
    for (let i = 0; i < s.players.length; i++) {
      if (i === p || s.players[i]!.out) continue;
      if (partners.has(s.players[i]!.id) && s.players.some((o, k) => k !== p && !o.out && !partners.has(o.id))) continue;
      if (target < 0 || s.players[i]!.hand.length < s.players[target]!.hand.length) target = i;
    }
    if (target >= 0) action.target = s.players[target]!.id;
  }
  return [action];
}

/** Ce qu'un 0 coûte : les cartes reçues (la main de celui qui joue avant) moins celles qu'on garderait */
function zeroLoss(s: UnoState, p: number): number {
  const giver = s.players[nextIndex(s, p, 1, (s.direction * -1) as 1 | -1)]!;
  return giver.hand.length - (s.players[p]!.hand.length - 1);
}

function pickCard(s: UnoState, p: number, playable: Card[], rng: RngHolder, partners: ReadonlySet<string>, style: UnoBotStyle): Card {
  const me = s.players[p]!;
  const next = s.players[nextIndex(s, p, 1)]!;
  // Le suivant est son partenaire : on ne lui fait ni piocher ni passer son tour
  const friend = partners.has(next.id);
  const danger = !friend && next.hand.length <= style.dangerAt;
  // Personne n'est près de finir : le bot fort garde ses cartes « + » et « passe » pour répondre plus tard
  const calm = !s.players.some((pl, i) => i !== p && !pl.out && !partners.has(pl.id) && pl.hand.length <= style.dangerAt);
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
    if (isDrawCard(card) || card.kind === "skip") {
      score += friend ? -28 : danger ? 25 : style.keepsDefence && calm && me.hand.length > 3 ? -9 : 4;
    } else if (card.kind === "skipAll") {
      score += danger ? 25 : 4;
    }
    if (card.kind === "reverse") score += danger && activeCount(s) > 2 ? 14 : 3;
    if (card.kind === "discardAll" && card.color) score += (colorCounts.get(card.color) ?? 0) * 4;
    if (card.kind === "number" && card.value === 7 && effectiveRules(s.settings).sevenZero) {
      const smallest = Math.min(...s.players.filter((pl, i) => i !== p && !pl.out && !partners.has(pl.id)).map((pl) => pl.hand.length));
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

/**
 * Pour la roulette, on annonce la couleur la plus rare dans sa main : c'est celle qui reste le plus dans la pioche,
 * donc celle qui sort le plus vite. À égalité, on varie pour que le bot ne soit pas prévisible.
 */
function leastLikelyColor(hand: Card[], rng: RngHolder): Color {
  const counts: Record<Color, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.color) counts[c.color] += 1;
  return COLORS.slice().sort((a, b) => counts[a] - counts[b] + (random(rng) - 0.5))[0]!;
}

/** Un bot qui voit un joueur oublier son UNO le denonce-t-il, et apres combien de temps ? */
export function botCatchDelay(rng: RngHolder, level?: UnoBotLevel): number | null {
  const { catchChance, catchDelay } = styleOf(level);
  if (random(rng) > catchChance) return null;
  return catchDelay[0] + Math.floor(random(rng) * (catchDelay[1] - catchDelay[0]));
}

/**
 * Un bot qui vient de poser son avant-dernière carte sans avoir crié UNO : le crie-t-il, et après combien de temps ?
 * Sans UNO d'avance, c'est le moment normal de le crier : presque toujours, assez vite, mais un humain rapide peut le
 * prendre de vitesse. Sinon, c'est un oubli : il se rattrape une fois sur deux, plus tard.
 */
export function botUnoDelay(s: UnoState, rng: RngHolder, level?: UnoBotLevel): number | null {
  const style = styleOf(level);
  if (!effectiveRules(s.settings).earlyUno) return random(rng) < style.unoAfter ? 600 + Math.floor(random(rng) * 1000) : null;
  return random(rng) < style.unoAfterLate ? 900 + Math.floor(random(rng) * 1600) : null;
}

/** Delai de reflexion d'un bot, pour un rythme naturel. */
export function botThinkDelay(s: UnoState, rng: RngHolder): number {
  const base = s.pendingDraw > 0 ? 900 : 1100;
  return base + Math.floor(random(rng) * 900);
}
