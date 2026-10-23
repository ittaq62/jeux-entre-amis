import {
  buildClassicDeck,
  cardPoints,
  COLORS,
  drawValue,
  isDrawCard,
  isWild,
  sameFace,
  type Card,
  type Color,
} from "./cards.ts";
import { buildNoMercyDeck, MERCY_BONUS, MERCY_LIMIT } from "./nomercy.ts";
import { randomInt, shuffle, type RngHolder } from "../../rng.ts";

// ---------------------------------------------------------------------------
// Reglages
// ---------------------------------------------------------------------------

export type UnoVariant = "classic" | "nomercy";
export type EndMode = "first" | "ranking" | "points";

export interface UnoSettings {
  variant: UnoVariant;
  /** Cumul des cartes « + » (toujours actif en No Mercy) */
  stacking: boolean;
  /** Piocher jusqu'a pouvoir jouer (toujours actif en No Mercy) */
  drawUntilPlayable: boolean;
  /** 7 = echange de main, 0 = les mains tournent (toujours actif en No Mercy) */
  sevenZero: boolean;
  /** Jouer une carte identique hors de son tour */
  jumpIn: boolean;
  endMode: EndMode;
  targetScore: number;
  /** Secondes par tour, 0 = sans chrono (gere par le salon) */
  turnSeconds: number;
}

export const DEFAULT_SETTINGS: UnoSettings = {
  variant: "classic",
  stacking: true,
  drawUntilPlayable: false,
  sevenZero: false,
  jumpIn: false,
  endMode: "first",
  targetScore: 500,
  turnSeconds: 30,
};

export const HAND_SIZE = 7;
/** Delai minimal pendant lequel on peut denoncer un oubli de UNO. */
export const UNO_GRACE_MS = 3000;
export const UNO_PENALTY = 2;

export function effectiveRules(settings: UnoSettings) {
  const noMercy = settings.variant === "nomercy";
  return {
    noMercy,
    stacking: noMercy || settings.stacking,
    drawUntilPlayable: noMercy || settings.drawUntilPlayable,
    sevenZero: noMercy || settings.sevenZero,
    jumpIn: settings.jumpIn,
    challenge: !noMercy,
    /** No Mercy : on ne pioche que si on ne peut pas jouer, et la carte piochee doit etre posee */
    mustPlay: noMercy,
  };
}

// ---------------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------------

export interface PlayerStats {
  played: number;
  drawn: number;
  penaltyCards: number;
  maxHand: number;
  plusGiven: number;
  unoCalls: number;
  caughtOthers: number;
  gotCaught: number;
  challengesWon: number;
  challengesLost: number;
  skipsGiven: number;
  wildsPlayed: number;
  jumpIns: number;
  swaps: number;
  biggestStackTaken: number;
}

function emptyStats(): PlayerStats {
  return {
    played: 0,
    drawn: 0,
    penaltyCards: 0,
    maxHand: 0,
    plusGiven: 0,
    unoCalls: 0,
    caughtOthers: 0,
    gotCaught: 0,
    challengesWon: 0,
    challengesLost: 0,
    skipsGiven: 0,
    wildsPlayed: 0,
    jumpIns: 0,
    swaps: 0,
    biggestStackTaken: 0,
  };
}

export interface UnoPlayer {
  id: string;
  hand: Card[];
  /** A fini sa main ou a ete elimine : ne joue plus cette manche */
  out: boolean;
  eliminated: boolean;
  score: number;
  declaredUno: boolean;
  stats: PlayerStats;
}

export interface RoundResult {
  round: number;
  winner: string | null;
  points: number;
  /** Mains restantes a la fin de la manche, devoilees a tous */
  hands: Record<string, Card[]>;
  scores: Record<string, number>;
}

export interface UnoState {
  settings: UnoSettings;
  players: UnoPlayer[];
  drawPile: Card[];
  discard: Card[];
  color: Color;
  direction: 1 | -1;
  turn: number;
  dealer: number;
  /** Cartes a piocher accumulees pour le joueur courant */
  pendingDraw: number;
  /** Valeur de la derniere carte « + » posee dans la pile en cours */
  lastDrawValue: number;
  /** +4 contestable par le joueur courant */
  challenge: { by: number; legal: boolean } | null;
  /** Carte piochee ce tour-ci et jouable (seule carte autorisee) */
  drawnCardId: number | null;
  hasDrawn: boolean;
  unoWindow: { player: number; since: number; nextActed: boolean } | null;
  /** Le joueur courant doit choisir une couleur pour la roulette */
  roulette: { by: number } | null;
  phase: "playing" | "roundOver" | "gameOver";
  round: number;
  /** Ordre de sortie (fin de main) pour le classement */
  finishOrder: number[];
  /** Ordre d'elimination (regle de pitie) */
  eliminationOrder: number[];
  lastRound: RoundResult | null;
  /** Classement final (ids), rempli en fin de partie */
  ranking: string[] | null;
  rng: number;
  /** Change a chaque fois qu'une nouvelle decision est attendue : sert aux chronos */
  turnId: number;
}

// ---------------------------------------------------------------------------
// Actions et evenements
// ---------------------------------------------------------------------------

export type UnoAction =
  | { type: "play"; cardId: number; color?: Color; target?: string }
  | { type: "draw" }
  | { type: "pass" }
  | { type: "uno" }
  | { type: "catch"; target: string }
  | { type: "challenge" }
  | { type: "roulette"; color: Color };

export type DrawReason = "voluntary" | "penalty" | "uno" | "challenge" | "roulette" | "finish";

export type UnoEvent =
  | { type: "deal"; round: number; first: string; top: Card }
  | { type: "play"; player: string; card: Card; jumpIn?: boolean }
  | { type: "draw"; player: string; count: number; reason: DrawReason }
  | { type: "color"; player: string; color: Color }
  | { type: "skip"; player: string }
  | { type: "skipAll"; player: string }
  | { type: "reverse"; direction: 1 | -1 }
  | { type: "stack"; total: number; victim: string }
  | { type: "challenge"; challenger: string; target: string; success: boolean }
  | { type: "uno"; player: string }
  | { type: "caught"; by: string; player: string }
  | { type: "swap"; a: string; b: string }
  | { type: "rotate"; direction: 1 | -1 }
  | { type: "discardAll"; player: string; color: Color; count: number }
  | { type: "roulette"; victim: string; color: Color; flipped: Card[] }
  | { type: "eliminated"; player: string }
  | { type: "finish"; player: string; rank: number }
  | { type: "reshuffle" }
  | { type: "pass"; player: string }
  | { type: "roundOver"; winner: string | null; points: number }
  | { type: "gameOver"; ranking: string[] };

export type ActionResult = { ok: true; events: UnoEvent[] } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Creation et distribution
// ---------------------------------------------------------------------------

export function createGame(playerIds: string[], settings: UnoSettings, seed: number): { state: UnoState; events: UnoEvent[] } {
  if (playerIds.length < 2) throw new Error("Il faut au moins 2 joueurs");
  const state: UnoState = {
    settings: { ...settings },
    players: playerIds.map((id) => ({
      id,
      hand: [],
      out: false,
      eliminated: false,
      score: 0,
      declaredUno: false,
      stats: emptyStats(),
    })),
    drawPile: [],
    discard: [],
    color: "red",
    direction: 1,
    turn: 0,
    dealer: randomInt({ rng: seed }, playerIds.length),
    pendingDraw: 0,
    lastDrawValue: 0,
    challenge: null,
    drawnCardId: null,
    hasDrawn: false,
    unoWindow: null,
    roulette: null,
    phase: "playing",
    round: 0,
    finishOrder: [],
    eliminationOrder: [],
    lastRound: null,
    ranking: null,
    rng: seed,
    turnId: 0,
  };
  const events: UnoEvent[] = [];
  dealRound(state, events);
  return { state, events };
}

function dealRound(s: UnoState, ev: UnoEvent[]) {
  const rules = effectiveRules(s.settings);
  s.round += 1;
  const deck = shuffle(s, rules.noMercy ? buildNoMercyDeck() : buildClassicDeck());
  for (const p of s.players) {
    p.hand = [];
    p.out = false;
    p.eliminated = false;
    p.declaredUno = false;
  }
  for (let k = 0; k < HAND_SIZE; k++) {
    for (const p of s.players) p.hand.push(deck.pop()!);
  }
  for (const p of s.players) p.stats.maxHand = Math.max(p.stats.maxHand, p.hand.length);

  // La premiere carte retournee ne peut pas etre un joker (ni une carte action en No Mercy) :
  // on la remet au hasard dans la pioche.
  let top = deck.pop()!;
  while (isWild(top) || (rules.noMercy && top.kind !== "number")) {
    deck.splice(randomInt(s, deck.length + 1), 0, top);
    top = deck.pop()!;
  }
  s.drawPile = deck;
  s.discard = [top];
  s.color = top.color!;
  s.direction = 1;
  s.pendingDraw = 0;
  s.lastDrawValue = 0;
  s.challenge = null;
  s.drawnCardId = null;
  s.hasDrawn = false;
  s.unoWindow = null;
  s.roulette = null;
  s.finishOrder = [];
  s.eliminationOrder = [];
  s.phase = "playing";
  const first = nextIndex(s, s.dealer, 1);
  s.turn = first;
  ev.push({ type: "deal", round: s.round, first: s.players[first]!.id, top });

  // Effet de la carte de depart
  switch (top.kind) {
    case "skip":
      ev.push({ type: "skip", player: s.players[first]!.id });
      s.turn = nextIndex(s, first, 1);
      break;
    case "skipAll":
      ev.push({ type: "skipAll", player: s.players[s.dealer]!.id });
      s.turn = s.dealer;
      break;
    case "reverse":
      ev.push({ type: "reverse", direction: -1 });
      if (activeCount(s) === 2) {
        s.turn = nextIndex(s, first, 1);
      } else {
        s.direction = -1;
        s.turn = s.dealer;
      }
      break;
    case "draw2":
    case "draw4":
      s.pendingDraw = drawValue(top);
      s.lastDrawValue = drawValue(top);
      resolvePending(s, ev);
      break;
    default:
      break;
  }
  s.turnId += 1;
}

export function startNextRound(s: UnoState): UnoEvent[] {
  if (s.phase !== "roundOver") return [];
  const ev: UnoEvent[] = [];
  s.dealer = (s.dealer + 1) % s.players.length;
  dealRound(s, ev);
  return ev;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

export function playerIndex(s: UnoState, id: string): number {
  return s.players.findIndex((p) => p.id === id);
}

export function topCard(s: UnoState): Card {
  return s.discard[s.discard.length - 1]!;
}

export function activeCount(s: UnoState): number {
  return s.players.reduce((n, p) => n + (p.out ? 0 : 1), 0);
}

/** Index du joueur actif situe `steps` places plus loin dans le sens du jeu. */
export function nextIndex(s: UnoState, from: number, steps: number, direction: 1 | -1 = s.direction): number {
  const n = s.players.length;
  if (activeCount(s) === 0) return from;
  let i = from;
  let moved = 0;
  while (moved < steps) {
    i = (((i + direction) % n) + n) % n;
    if (!s.players[i]!.out) moved++;
  }
  return i;
}

function setTurn(s: UnoState, index: number) {
  s.turn = index;
  s.hasDrawn = false;
  s.drawnCardId = null;
  s.turnId += 1;
}

function advance(s: UnoState, steps: number) {
  setTurn(s, nextIndex(s, s.turn, steps));
}

function reshuffle(s: UnoState, ev: UnoEvent[]): boolean {
  if (s.discard.length <= 1) return false;
  const top = s.discard.pop()!;
  const rest = s.discard;
  s.discard = [top];
  s.drawPile = shuffle(s, rest.concat(s.drawPile));
  ev.push({ type: "reshuffle" });
  return true;
}

function drawOne(s: UnoState, ev: UnoEvent[]): Card | null {
  if (s.drawPile.length === 0 && !reshuffle(s, ev)) return null;
  return s.drawPile.pop() ?? null;
}

/** Fait piocher `count` cartes (moins si la pioche est vide). Renvoie les cartes piochees. */
function drawCards(s: UnoState, p: number, count: number, reason: DrawReason, ev: UnoEvent[]): Card[] {
  const player = s.players[p]!;
  const drawn: Card[] = [];
  const noMercy = effectiveRules(s.settings).noMercy;
  for (let k = 0; k < count; k++) {
    // En No Mercy, on est elimine des la 25e carte : inutile de piocher la suite
    if (noMercy && player.hand.length >= MERCY_LIMIT) break;
    const card = drawOne(s, ev);
    if (!card) break;
    drawn.push(card);
    player.hand.push(card);
  }
  if (drawn.length > 0) {
    ev.push({ type: "draw", player: player.id, count: drawn.length, reason });
    player.stats.drawn += drawn.length;
    player.stats.maxHand = Math.max(player.stats.maxHand, player.hand.length);
    if (player.hand.length > 1) player.declaredUno = false;
    if (s.unoWindow?.player === p) s.unoWindow = null;
  }
  checkMercy(s, p, ev);
  return drawn;
}

/** Regle de pitie (No Mercy) : 25 cartes ou plus, le joueur est elimine. */
function checkMercy(s: UnoState, p: number, ev: UnoEvent[]) {
  if (!effectiveRules(s.settings).noMercy) return;
  const player = s.players[p]!;
  if (player.out || player.hand.length < MERCY_LIMIT) return;
  player.out = true;
  player.eliminated = true;
  s.eliminationOrder.push(p);
  // Ses cartes retournent sous la pioche
  s.drawPile = shuffle(s, player.hand.concat(s.drawPile));
  player.hand = [];
  ev.push({ type: "eliminated", player: player.id });
}

function checkMercyAll(s: UnoState, ev: UnoEvent[]): boolean {
  const before = s.eliminationOrder.length;
  for (let i = 0; i < s.players.length; i++) checkMercy(s, i, ev);
  return s.eliminationOrder.length > before;
}

function canStack(s: UnoState, card: Card, top: Card): boolean {
  const rules = effectiveRules(s.settings);
  if (!rules.stacking || !isDrawCard(card)) return false;
  if (rules.noMercy) {
    // On ne peut repondre que par une carte de valeur egale ou superieure
    return drawValue(card) >= s.lastDrawValue;
  }
  if (top.kind === "draw2") return card.kind === "draw2" || card.kind === "wild4";
  if (top.kind === "wild4") return card.kind === "wild4";
  return false;
}

export function hasStackableCard(s: UnoState, p: number): boolean {
  const top = topCard(s);
  return s.players[p]!.hand.some((c) => canStack(s, c, top));
}

/** La carte peut-elle etre posee par ce joueur maintenant (dans son tour) ? */
export function canPlayCard(s: UnoState, p: number, card: Card): boolean {
  if (s.phase !== "playing" || p !== s.turn || s.roulette) return false;
  if (s.drawnCardId !== null && card.id !== s.drawnCardId) return false;
  const top = topCard(s);
  if (s.pendingDraw > 0) return canStack(s, card, top);
  return matches(s, card, top);
}

function matches(s: UnoState, card: Card, top: Card): boolean {
  if (isWild(card)) return true;
  if (card.color === s.color) return true;
  if (card.kind === "number") return top.kind === "number" && top.value === card.value;
  return card.kind === top.kind;
}

/** Interception : carte strictement identique a celle du dessus, hors de son tour. */
export function canJumpIn(s: UnoState, p: number, card: Card): boolean {
  const rules = effectiveRules(s.settings);
  if (!rules.jumpIn || s.phase !== "playing" || p === s.turn) return false;
  if (s.players[p]!.out || s.pendingDraw > 0 || s.roulette || s.challenge) return false;
  const top = topCard(s);
  return !isWild(top) && sameFace(card, top);
}

export function playableCardIds(s: UnoState, p: number): number[] {
  const player = s.players[p];
  if (!player || player.out) return [];
  return player.hand.filter((c) => canPlayCard(s, p, c) || canJumpIn(s, p, c)).map((c) => c.id);
}

/** Apres une carte « + » : si la victime ne peut ni cumuler ni contester, elle pioche tout de suite. */
function resolvePending(s: UnoState, ev: UnoEvent[]) {
  if (s.pendingDraw <= 0) return;
  ev.push({ type: "stack", total: s.pendingDraw, victim: s.players[s.turn]!.id });
  if (s.challenge) return;
  if (hasStackableCard(s, s.turn)) return;
  takePenalty(s, s.turn, ev);
}

function takePenalty(s: UnoState, p: number, ev: UnoEvent[]) {
  const amount = s.pendingDraw;
  s.pendingDraw = 0;
  s.lastDrawValue = 0;
  s.challenge = null;
  const player = s.players[p]!;
  const drawn = drawCards(s, p, amount, "penalty", ev);
  player.stats.penaltyCards += drawn.length;
  player.stats.biggestStackTaken = Math.max(player.stats.biggestStackTaken, drawn.length);
  if (checkRoundEndByElimination(s, ev)) return;
  // La victime perd son tour
  if (player.out) setTurn(s, nextIndex(s, p, 1));
  else advance(s, 1);
}

/** Note qu'un joueur agit : referme la fenetre du contre-UNO une fois le delai de grace passe. */
function markActed(s: UnoState, p: number, now: number) {
  const w = s.unoWindow;
  if (!w || w.player === p) return;
  w.nextActed = true;
  if (now - w.since >= UNO_GRACE_MS) s.unoWindow = null;
}

/** A appeler periodiquement par le salon (ferme la fenetre UNO quand le delai est passe). */
export function tick(s: UnoState, now: number): boolean {
  const w = s.unoWindow;
  if (w && w.nextActed && now - w.since >= UNO_GRACE_MS) {
    s.unoWindow = null;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Application d'une action
// ---------------------------------------------------------------------------

export function applyAction(s: UnoState, playerId: string, action: UnoAction, now: number): ActionResult {
  const p = playerIndex(s, playerId);
  if (p < 0) return fail("Tu ne participes pas à cette partie.");
  if (s.phase !== "playing") return fail("La manche est terminée.");
  const player = s.players[p]!;
  if (player.out) return fail("Tu as déjà terminé cette manche.");
  const ev: UnoEvent[] = [];

  switch (action.type) {
    case "uno": {
      if (s.unoWindow?.player === p) {
        s.unoWindow = null;
        player.declaredUno = true;
        player.stats.unoCalls += 1;
        ev.push({ type: "uno", player: player.id });
        return ok(ev);
      }
      if (player.hand.length === 2 && !player.declaredUno) {
        player.declaredUno = true;
        player.stats.unoCalls += 1;
        ev.push({ type: "uno", player: player.id });
        return ok(ev);
      }
      // Trop tot ou trop tard (deja denonce) : on ignore sans message d'erreur
      return ok(ev);
    }

    case "catch": {
      const t = playerIndex(s, action.target);
      if (t < 0 || t === p || s.unoWindow?.player !== t) return fail("Trop tard !");
      s.unoWindow = null;
      const target = s.players[t]!;
      player.stats.caughtOthers += 1;
      target.stats.gotCaught += 1;
      ev.push({ type: "caught", by: player.id, player: target.id });
      drawCards(s, t, UNO_PENALTY, "uno", ev);
      if (target.out) {
        if (checkRoundEndByElimination(s, ev)) return ok(ev);
        if (s.turn === t) setTurn(s, nextIndex(s, t, 1));
      }
      return ok(ev);
    }

    case "play": {
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return fail("Cette carte n'est pas dans ta main.");
      const jumpIn = p !== s.turn;
      if (jumpIn ? !canJumpIn(s, p, card) : !canPlayCard(s, p, card)) {
        return fail(jumpIn ? "Ce n'est pas ton tour." : "Cette carte ne peut pas être posée.");
      }
      if (isWild(card) && card.kind !== "wildRoulette" && !action.color) return fail("Choisis une couleur.");
      if (action.color && !COLORS.includes(action.color)) return fail("Couleur inconnue.");
      let swapTarget = -1;
      if (card.kind === "number" && card.value === 7 && effectiveRules(s.settings).sevenZero) {
        swapTarget = action.target ? playerIndex(s, action.target) : -1;
        if (swapTarget === p || (swapTarget >= 0 && s.players[swapTarget]!.out)) return fail("Choisis un autre joueur.");
        if (swapTarget < 0) swapTarget = fewestCardsOpponent(s, p);
      }
      markActed(s, p, now);
      playCard(s, p, card, action.color ?? null, swapTarget, jumpIn, now, ev);
      return ok(ev);
    }

    case "draw": {
      if (p !== s.turn) return fail("Ce n'est pas ton tour.");
      if (s.roulette) return fail("Choisis d'abord une couleur pour la roulette.");
      markActed(s, p, now);
      if (s.pendingDraw > 0) {
        takePenalty(s, p, ev);
        return ok(ev);
      }
      if (s.hasDrawn) return fail("Tu as déjà pioché ce tour-ci.");
      if (effectiveRules(s.settings).mustPlay && player.hand.some((c) => canPlayCard(s, p, c))) {
        return fail("Sans pitié : tu as une carte jouable, tu dois la poser.");
      }
      voluntaryDraw(s, p, ev);
      return ok(ev);
    }

    case "pass": {
      if (p !== s.turn) return fail("Ce n'est pas ton tour.");
      if (!s.hasDrawn || s.drawnCardId === null) return fail("Pioche d'abord une carte.");
      if (effectiveRules(s.settings).mustPlay) return fail("Sans pitié : la carte piochée doit être posée.");
      markActed(s, p, now);
      ev.push({ type: "pass", player: player.id });
      advance(s, 1);
      return ok(ev);
    }

    case "challenge": {
      if (p !== s.turn || !s.challenge) return fail("Rien à contester.");
      markActed(s, p, now);
      const { by, legal } = s.challenge;
      s.challenge = null;
      const accused = s.players[by]!;
      if (!legal) {
        // Bluff demasque : l'auteur du +4 pioche a la place, le contestataire joue normalement.
        const amount = s.pendingDraw;
        s.pendingDraw = 0;
        s.lastDrawValue = 0;
        player.stats.challengesWon += 1;
        ev.push({ type: "challenge", challenger: player.id, target: accused.id, success: true });
        drawCards(s, by, amount, "challenge", ev);
        s.turnId += 1;
      } else {
        // +4 regulier : le contestataire pioche 6 et passe son tour.
        player.stats.challengesLost += 1;
        ev.push({ type: "challenge", challenger: player.id, target: accused.id, success: false });
        s.pendingDraw += 2;
        takePenalty(s, p, ev);
      }
      return ok(ev);
    }

    case "roulette": {
      if (p !== s.turn || !s.roulette) return fail("Pas de roulette en cours.");
      if (!COLORS.includes(action.color)) return fail("Couleur inconnue.");
      markActed(s, p, now);
      s.roulette = null;
      spinRoulette(s, p, action.color, ev);
      return ok(ev);
    }
  }
}

function ok(events: UnoEvent[]): ActionResult {
  return { ok: true, events };
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function fewestCardsOpponent(s: UnoState, p: number): number {
  let best = -1;
  for (let i = 0; i < s.players.length; i++) {
    const other = s.players[i]!;
    if (i === p || other.out) continue;
    if (best < 0 || other.hand.length < s.players[best]!.hand.length) best = i;
  }
  return best;
}

function voluntaryDraw(s: UnoState, p: number, ev: UnoEvent[]) {
  const rules = effectiveRules(s.settings);
  const player = s.players[p]!;
  s.hasDrawn = true;
  let last: Card | null = null;
  let total = 0;
  // On regroupe les pioches successives en un seul evenement
  const local: UnoEvent[] = [];
  do {
    const card = drawOne(s, local);
    if (!card) break;
    player.hand.push(card);
    total += 1;
    last = card;
    if (!rules.drawUntilPlayable || matches(s, card, topCard(s))) break;
  } while (player.hand.length < MERCY_LIMIT || !rules.noMercy);
  for (const e of local) ev.push(e);
  if (total > 0) {
    ev.push({ type: "draw", player: player.id, count: total, reason: "voluntary" });
    player.stats.drawn += total;
    player.stats.maxHand = Math.max(player.stats.maxHand, player.hand.length);
    player.declaredUno = false;
    if (s.unoWindow?.player === p) s.unoWindow = null;
  }
  checkMercy(s, p, ev);
  if (player.out) {
    if (checkRoundEndByElimination(s, ev)) return;
    setTurn(s, nextIndex(s, p, 1));
    return;
  }
  if (last && matches(s, last, topCard(s))) {
    s.drawnCardId = last.id;
    s.turnId += 1;
    return;
  }
  ev.push({ type: "pass", player: player.id });
  advance(s, 1);
}

function playCard(
  s: UnoState,
  p: number,
  card: Card,
  chosen: Color | null,
  swapTarget: number,
  jumpIn: boolean,
  now: number,
  ev: UnoEvent[],
) {
  const rules = effectiveRules(s.settings);
  const player = s.players[p]!;
  const colorBefore = s.color;
  const legalWild4 = card.kind === "wild4" ? !player.hand.some((c) => c.id !== card.id && c.color === colorBefore) : true;
  const stackBefore = s.pendingDraw;

  player.hand = player.hand.filter((c) => c.id !== card.id);
  s.discard.push(card);
  player.stats.played += 1;
  if (isWild(card)) player.stats.wildsPlayed += 1;
  if (isDrawCard(card)) player.stats.plusGiven += drawValue(card);
  if (jumpIn) {
    player.stats.jumpIns += 1;
    s.turn = p;
  }
  s.hasDrawn = false;
  s.drawnCardId = null;
  ev.push({ type: "play", player: player.id, card, ...(jumpIn ? { jumpIn: true } : {}) });

  if (card.color) {
    s.color = card.color;
  } else if (chosen) {
    s.color = chosen;
    ev.push({ type: "color", player: player.id, color: chosen });
  }

  // Defausse tout : toutes les cartes de la couleur partent avec elle
  if (card.kind === "discardAll" && card.color) {
    const same = player.hand.filter((c) => c.color === card.color);
    if (same.length > 0) {
      player.hand = player.hand.filter((c) => c.color !== card.color);
      // Elles passent sous la carte jouee pour que celle-ci reste visible
      s.discard.splice(s.discard.length - 1, 0, ...same);
      player.stats.played += same.length;
    }
    ev.push({ type: "discardAll", player: player.id, color: card.color, count: same.length });
  }

  // Fenetre du contre-UNO
  if (s.unoWindow?.player === p) s.unoWindow = null;
  if (player.hand.length === 1 && !player.declaredUno) {
    s.unoWindow = { player: p, since: now, nextActed: false };
  }

  const finished = player.hand.length === 0;

  // Effets
  switch (card.kind) {
    case "number": {
      if (rules.sevenZero && !finished && card.value === 7 && swapTarget >= 0) {
        swapHands(s, p, swapTarget, ev);
      } else if (rules.sevenZero && !finished && card.value === 0) {
        rotateHands(s, ev);
      }
      // Recevoir une grosse main peut faire depasser la limite de pitie
      if (checkMercyAll(s, ev) && checkRoundEndByElimination(s, ev)) return;
      advance(s, 1);
      break;
    }
    case "skip": {
      ev.push({ type: "skip", player: s.players[nextIndex(s, p, 1)]!.id });
      player.stats.skipsGiven += 1;
      advance(s, 2);
      break;
    }
    case "skipAll": {
      ev.push({ type: "skipAll", player: player.id });
      player.stats.skipsGiven += activeCount(s) - 1;
      setTurn(s, p);
      break;
    }
    case "reverse": {
      reverse(s, p, ev);
      break;
    }
    case "wildReverse4": {
      reverse(s, p, ev, false);
      startDraw(s, card, stackBefore, legalWild4, p, ev);
      break;
    }
    case "draw2":
    case "draw4":
    case "wild4":
    case "wild6":
    case "wild10": {
      advance(s, 1);
      startDraw(s, card, stackBefore, legalWild4, p, ev);
      break;
    }
    case "wildRoulette": {
      advance(s, 1);
      s.roulette = { by: p };
      break;
    }
    case "wild":
    case "discardAll": {
      advance(s, 1);
      break;
    }
  }

  if (finished) finishPlayer(s, p, ev);
}

function reverse(s: UnoState, p: number, ev: UnoEvent[], move = true) {
  if (activeCount(s) === 2 && move) {
    // A deux joueurs, l'inversion agit comme un « passe ton tour »
    ev.push({ type: "reverse", direction: (s.direction * -1) as 1 | -1 });
    s.direction = (s.direction * -1) as 1 | -1;
    const victim = nextIndex(s, p, 1);
    ev.push({ type: "skip", player: s.players[victim]!.id });
    setTurn(s, p);
    return;
  }
  s.direction = (s.direction * -1) as 1 | -1;
  ev.push({ type: "reverse", direction: s.direction });
  if (move) advance(s, 1);
  else setTurn(s, nextIndex(s, p, 1));
}

function startDraw(s: UnoState, card: Card, stackBefore: number, legalWild4: boolean, p: number, ev: UnoEvent[]) {
  const value = drawValue(card);
  s.pendingDraw = stackBefore + value;
  s.lastDrawValue = value;
  s.challenge = card.kind === "wild4" && stackBefore === 0 && effectiveRules(s.settings).challenge ? { by: p, legal: legalWild4 } : null;
  // Si la manche se termine sur cette carte, la penalite est tiree dans finishPlayer
  if (s.players[p]!.hand.length === 0 && s.settings.endMode !== "ranking") return;
  resolvePending(s, ev);
}

function swapHands(s: UnoState, a: number, b: number, ev: UnoEvent[]) {
  const pa = s.players[a]!;
  const pb = s.players[b]!;
  [pa.hand, pb.hand] = [pb.hand, pa.hand];
  pa.stats.swaps += 1;
  ev.push({ type: "swap", a: pa.id, b: pb.id });
  settleUnoAfterExchange(s);
}

function rotateHands(s: UnoState, ev: UnoEvent[]) {
  const active = s.players.map((_, i) => i).filter((i) => !s.players[i]!.out);
  const hands = active.map((i) => s.players[i]!.hand);
  // Chaque main passe au joueur suivant dans le sens du jeu
  active.forEach((i) => {
    const giver = nextIndex(s, i, 1, (s.direction * -1) as 1 | -1);
    s.players[i]!.hand = hands[active.indexOf(giver)]!;
  });
  ev.push({ type: "rotate", direction: s.direction });
  settleUnoAfterExchange(s);
}

/** Apres un echange de mains, celui qui se retrouve avec une carte est considere comme ayant annonce UNO. */
function settleUnoAfterExchange(s: UnoState) {
  s.unoWindow = null;
  for (const pl of s.players) pl.declaredUno = pl.hand.length === 1;
}

function spinRoulette(s: UnoState, p: number, color: Color, ev: UnoEvent[]) {
  const player = s.players[p]!;
  const flipped: Card[] = [];
  const local: UnoEvent[] = [];
  for (;;) {
    if (player.hand.length >= MERCY_LIMIT) break;
    const card = drawOne(s, local);
    if (!card) break;
    flipped.push(card);
    player.hand.push(card);
    // Les jokers ne comptent pas comme la couleur annoncee
    if (card.color === color) break;
  }
  s.color = color;
  for (const e of local) ev.push(e);
  ev.push({ type: "roulette", victim: player.id, color, flipped });
  player.stats.drawn += flipped.length;
  player.stats.penaltyCards += flipped.length;
  player.stats.maxHand = Math.max(player.stats.maxHand, player.hand.length);
  player.declaredUno = false;
  checkMercy(s, p, ev);
  if (checkRoundEndByElimination(s, ev)) return;
  // La victime de la roulette perd son tour
  setTurn(s, nextIndex(s, p, 1));
}

// ---------------------------------------------------------------------------
// Fin de main, de manche, de partie
// ---------------------------------------------------------------------------

function finishPlayer(s: UnoState, p: number, ev: UnoEvent[]) {
  const player = s.players[p]!;
  const mode = s.settings.endMode;
  if (s.unoWindow?.player === p) s.unoWindow = null;

  if (mode === "ranking") {
    player.out = true;
    s.finishOrder.push(p);
    ev.push({ type: "finish", player: player.id, rank: s.finishOrder.length });
    if (activeCount(s) <= 1) {
      endGameByRanking(s, ev);
      return;
    }
    if (s.turn === p) setTurn(s, nextIndex(s, p, 1));
    return;
  }

  // Si la derniere carte etait une carte « + », le suivant pioche quand meme (les points comptent)
  if (s.pendingDraw > 0) {
    const victim = s.turn === p ? nextIndex(s, p, 1) : s.turn;
    const amount = s.pendingDraw;
    s.pendingDraw = 0;
    s.lastDrawValue = 0;
    s.challenge = null;
    drawCards(s, victim, amount, "finish", ev);
  }
  endRound(s, p, ev);
}

/** No Mercy : s'il ne reste qu'un joueur apres des eliminations, il remporte la manche. */
function checkRoundEndByElimination(s: UnoState, ev: UnoEvent[]): boolean {
  if (s.phase !== "playing") return true;
  if (activeCount(s) > 1) return false;
  const last = s.players.findIndex((pl) => !pl.out);
  if (s.settings.endMode === "ranking") {
    endGameByRanking(s, ev);
  } else {
    endRound(s, last, ev);
  }
  return true;
}

function endRound(s: UnoState, winner: number, ev: UnoEvent[]) {
  const winnerPlayer = winner >= 0 ? s.players[winner]! : null;
  let points = 0;
  const hands: Record<string, Card[]> = {};
  for (const pl of s.players) {
    hands[pl.id] = pl.hand.slice();
    if (pl !== winnerPlayer) points += pl.hand.reduce((sum, c) => sum + cardPoints(c), 0);
  }
  if (effectiveRules(s.settings).noMercy) points += MERCY_BONUS * s.eliminationOrder.length;
  if (winnerPlayer) winnerPlayer.score += points;
  s.unoWindow = null;
  s.challenge = null;
  s.roulette = null;
  s.pendingDraw = 0;
  const scores: Record<string, number> = {};
  for (const pl of s.players) scores[pl.id] = pl.score;
  s.lastRound = { round: s.round, winner: winnerPlayer?.id ?? null, points, hands, scores };
  ev.push({ type: "roundOver", winner: winnerPlayer?.id ?? null, points });

  const reachedTarget = winnerPlayer !== null && winnerPlayer.score >= s.settings.targetScore;
  if (s.settings.endMode === "points" && !reachedTarget) {
    s.phase = "roundOver";
    s.turnId += 1;
    return;
  }
  s.phase = "gameOver";
  s.ranking = computeRanking(s, winner);
  s.turnId += 1;
  ev.push({ type: "gameOver", ranking: s.ranking });
}

function endGameByRanking(s: UnoState, ev: UnoEvent[]) {
  const last = s.players.findIndex((pl) => !pl.out);
  const lastRound: RoundResult = {
    round: s.round,
    winner: s.finishOrder.length > 0 ? s.players[s.finishOrder[0]!]!.id : last >= 0 ? s.players[last]!.id : null,
    points: 0,
    hands: Object.fromEntries(s.players.map((pl) => [pl.id, pl.hand.slice()])),
    scores: Object.fromEntries(s.players.map((pl) => [pl.id, pl.score])),
  };
  s.lastRound = lastRound;
  s.unoWindow = null;
  s.challenge = null;
  s.roulette = null;
  s.pendingDraw = 0;
  s.phase = "gameOver";
  s.ranking = computeRanking(s, -1);
  s.turnId += 1;
  ev.push({ type: "roundOver", winner: lastRound.winner, points: 0 });
  ev.push({ type: "gameOver", ranking: s.ranking });
}

function handPoints(pl: UnoPlayer): number {
  return pl.hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

function computeRanking(s: UnoState, winner: number): string[] {
  const mode = s.settings.endMode;
  const idx = s.players.map((_, i) => i);
  const eliminatedLast = (list: number[]) => {
    const alive = list.filter((i) => !s.players[i]!.eliminated);
    // Le premier elimine finit dernier
    const dead = s.eliminationOrder.slice().reverse().filter((i) => list.includes(i));
    return alive.concat(dead);
  };
  if (mode === "ranking") {
    const finished = s.finishOrder.slice();
    const rest = idx.filter((i) => !finished.includes(i)).sort((a, b) => handPoints(s.players[a]!) - handPoints(s.players[b]!));
    return eliminatedLast(finished.concat(rest)).map((i) => s.players[i]!.id);
  }
  if (mode === "points") {
    return eliminatedLast(idx.sort((a, b) => s.players[b]!.score - s.players[a]!.score)).map((i) => s.players[i]!.id);
  }
  const others = idx.filter((i) => i !== winner).sort((a, b) => handPoints(s.players[a]!) - handPoints(s.players[b]!));
  return eliminatedLast((winner >= 0 ? [winner] : []).concat(others)).map((i) => s.players[i]!.id);
}

// ---------------------------------------------------------------------------
// Chrono ecoule : l'action la plus neutre possible
// ---------------------------------------------------------------------------

export function timeoutActions(s: UnoState): UnoAction[] {
  if (s.phase !== "playing") return [];
  const p = s.turn;
  const player = s.players[p]!;
  if (s.roulette) return [{ type: "roulette", color: mostCommonColor(player.hand) }];
  if (s.pendingDraw > 0) return [{ type: "draw" }];
  const mustPlay = effectiveRules(s.settings).mustPlay;
  if (s.hasDrawn && s.drawnCardId !== null) {
    if (!mustPlay) return [{ type: "pass" }];
    const drawn = player.hand.find((c) => c.id === s.drawnCardId)!;
    return [autoPlay(player.hand, drawn)];
  }
  if (mustPlay) {
    const playable = player.hand.filter((c) => canPlayCard(s, p, c));
    if (playable.length > 0) return [autoPlay(player.hand, playable.find((c) => !isWild(c)) ?? playable[0]!)];
  }
  return [{ type: "draw" }];
}

function autoPlay(hand: Card[], card: Card): UnoAction {
  const action: UnoAction = { type: "play", cardId: card.id };
  if (isWild(card) && card.kind !== "wildRoulette") action.color = mostCommonColor(hand.filter((c) => c.id !== card.id));
  return action;
}

export function mostCommonColor(hand: Card[], fallback: RngHolder | null = null): Color {
  const counts: Record<Color, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.color) counts[c.color] += 1;
  let best: Color = fallback ? COLORS[randomInt(fallback, 4)]! : "red";
  for (const color of COLORS) if (counts[color] > counts[best]) best = color;
  return best;
}
