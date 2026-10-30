// Capitale : le moteur de partie, partagé entre le serveur (qui fait foi) et les tests.
// Aucune notion de temps ici : les chronos (enchère, temps de décision, fin de partie) sont tenus par le salon.

import { randomInt, shuffle, type RngHolder } from "../../rng.ts";
import {
  BANK_HOTELS,
  BANK_HOUSES,
  BUYABLE,
  DECKS,
  GO_SALARY,
  GROUP_ORDER,
  GROUPS,
  groupOf,
  HOTEL,
  JAIL_FINE,
  JAIL_SQUARE,
  mortgageInterest,
  mortgageValue,
  SQUARES,
  START_CASH,
  STATION_RENTS,
  STATIONS,
  unmortgageCost,
  UTILITIES,
  type DeckId,
  type GroupId,
} from "./board.ts";

export type BotLevel = "facile" | "moyen" | "fort";
export type EndMode = "bankrupt" | "timed";
export const GAME_MINUTES = [30, 45, 60] as const;
export const TURN_SECONDS = [30, 60, 0] as const;
/** Garde-fou : au-delà, la partie s'arrête et le plus riche gagne */
export const MAX_ROUNDS = 150;

export interface CapitaleSettings {
  /** Jusqu'à la faillite de tous les autres, ou à durée fixe (le plus riche gagne) */
  end: EndMode;
  minutes: number;
  /** Temps laissé à chaque décision, 0 = illimité (géré par le salon) */
  turnSeconds: number;
  /** Règles maison */
  freeParking: boolean;
  doubleGo: boolean;
  noRentInJail: boolean;
  quickStart: boolean;
  botLevel: BotLevel;
}

export const DEFAULT_SETTINGS: CapitaleSettings = {
  end: "timed",
  minutes: 45,
  turnSeconds: 30,
  freeParking: false,
  doubleGo: false,
  noRentInJail: false,
  quickStart: false,
  botLevel: "moyen",
};

export interface Deed {
  owner: string | null;
  /** 0 à 4 maisons, 5 = l'hôtel */
  houses: number;
  mortgaged: boolean;
}

export interface CapitaleStats {
  rentEarned: number;
  rentPaid: number;
  bought: number;
  houses: number;
  hotels: number;
  trades: number;
  jail: number;
  doubles: number;
  passGo: number;
  auctionsWon: number;
  /** Joueurs mis en faillite par ses loyers */
  bankrupted: number;
  /** Groupes de couleur complets, au plus fort de la partie */
  monopolies: number;
  netWorth: number;
}

export interface CapitalePlayer {
  id: string;
  cash: number;
  position: number;
  inJail: boolean;
  /** Tours déjà passés en prison */
  jailTurns: number;
  /** Cartes « sortie de prison » gardées, avec leur paquet d'origine */
  jailCards: DeckId[];
  bankrupt: boolean;
  stats: CapitaleStats;
}

export type Account = string | "bank" | "pot";

export type MoneyReason =
  | "rent"
  | "tax"
  | "card"
  | "buy"
  | "auction"
  | "build"
  | "sell"
  | "mortgage"
  | "unmortgage"
  | "interest"
  | "jail"
  | "go"
  | "pot"
  | "trade"
  | "bankrupt";

export interface Offer {
  cash: number;
  squares: number[];
  jailCards: number;
}

export interface Trade {
  id: number;
  from: string;
  to: string;
  /** Ce que propose celui qui fait l'offre */
  give: Offer;
  /** Ce qu'il demande en échange */
  get: Offer;
}

export interface Debt {
  debtor: string;
  creditor: Account;
  amount: number;
  reason: MoneyReason;
  square?: number;
}

export interface Auction {
  square: number;
  high: { player: string; amount: number } | null;
  /** Ceux qui ont passé : ils ne peuvent plus enchérir */
  out: string[];
  bids: number;
}

export type Step = "roll" | "buy" | "auction" | "debt" | "manage" | "over";

export interface CapitaleState {
  settings: CapitaleSettings;
  players: CapitalePlayer[];
  /** Un titre par case achetable, null ailleurs */
  deeds: (Deed | null)[];
  bankHouses: number;
  bankHotels: number;
  /** Cagnotte de l'Aire de repos (règle maison) */
  pot: number;
  decks: Record<DeckId, number[]>;
  turn: number;
  turnId: number;
  step: Step;
  /** Change à chaque nouvelle décision attendue (le salon y accroche ses chronos) */
  decision: number;
  decisionKey: string;
  dice: [number, number] | null;
  doublesInRow: number;
  rollAgain: boolean;
  pendingBuy: number | null;
  auction: Auction | null;
  debts: Debt[];
  trades: Trade[];
  tradeSeq: number;
  lastCard: { deck: DeckId; card: number; player: string } | null;
  round: number;
  timeUp: boolean;
  eliminated: string[];
  ranking: string[] | null;
  ranks: Record<string, number> | null;
  rng: number;
  /** Dés imposés, pour les tests seulement : le salon ne s'en sert jamais */
  rigged?: [number, number][];
}

export type CapitaleEvent =
  | { type: "turn"; player: string }
  | { type: "dice"; player: string; dice: [number, number]; doubles: boolean }
  | { type: "move"; player: string; from: number; to: number; steps: number; passGo: boolean; jump: boolean }
  | { type: "money"; from: Account; to: Account; amount: number; reason: MoneyReason; square?: number }
  | { type: "buy"; player: string; square: number; price: number }
  | { type: "auction"; square: number }
  | { type: "bid"; player: string; amount: number }
  | { type: "pass"; player: string }
  | { type: "auctionEnd"; square: number; winner: string | null; amount: number }
  | { type: "build"; player: string; square: number; houses: number }
  | { type: "sell"; player: string; square: number; houses: number }
  | { type: "mortgage"; player: string; square: number }
  | { type: "unmortgage"; player: string; square: number }
  | { type: "card"; player: string; deck: DeckId; card: number }
  | { type: "jail"; player: string; reason: "square" | "card" | "doubles" }
  | { type: "leaveJail"; player: string; how: "pay" | "card" | "doubles" | "forced" }
  | { type: "debt"; player: string; amount: number; creditor: Account }
  | { type: "trade"; trade: Trade; status: "proposed" | "accepted" | "rejected" | "cancelled" | "expired" }
  | { type: "bankrupt"; player: string; to: Account }
  | { type: "timeUp" }
  | { type: "gameOver"; ranking: string[] };

export type CapitaleAction =
  | { type: "roll" }
  | { type: "payJail" }
  | { type: "useJailCard" }
  | { type: "buy" }
  | { type: "decline" }
  | { type: "bid"; amount: number }
  | { type: "pass" }
  | { type: "build"; square: number }
  | { type: "sell"; square: number }
  | { type: "mortgage"; square: number }
  | { type: "unmortgage"; square: number }
  | { type: "propose"; to: string; give: Offer; get: Offer; replaces?: number }
  | { type: "accept"; trade: number }
  | { type: "reject"; trade: number }
  | { type: "cancel"; trade: number }
  | { type: "bankrupt" }
  | { type: "endTurn" };

export type ActionResult = { ok: true; events: CapitaleEvent[] } | { ok: false; error: string };

const emptyStats = (): CapitaleStats => ({
  rentEarned: 0,
  rentPaid: 0,
  bought: 0,
  houses: 0,
  hotels: 0,
  trades: 0,
  jail: 0,
  doubles: 0,
  passGo: 0,
  auctionsWon: 0,
  bankrupted: 0,
  monopolies: 0,
  netWorth: 0,
});

const JAIL_CARD_INDEX: Record<DeckId, number> = {
  hasard: DECKS.hasard.findIndex((c) => c.effect.kind === "jailFree"),
  courrier: DECKS.courrier.findIndex((c) => c.effect.kind === "jailFree"),
};

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export function createGame(
  playerIds: string[],
  settings: CapitaleSettings,
  seed: number,
): { state: CapitaleState; events: CapitaleEvent[] } {
  const holder: RngHolder = { rng: seed };
  const state: CapitaleState = {
    settings: { ...settings },
    players: playerIds.map((id) => ({
      id,
      cash: START_CASH,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: [],
      bankrupt: false,
      stats: emptyStats(),
    })),
    deeds: SQUARES.map((s) => (s.price !== undefined ? { owner: null, houses: 0, mortgaged: false } : null)),
    bankHouses: BANK_HOUSES,
    bankHotels: BANK_HOTELS,
    pot: 0,
    decks: {
      hasard: shuffle(
        holder,
        DECKS.hasard.map((_, i) => i),
      ),
      courrier: shuffle(
        holder,
        DECKS.courrier.map((_, i) => i),
      ),
    },
    turn: randomInt(holder, playerIds.length),
    turnId: 1,
    step: "roll",
    decision: 1,
    decisionKey: "",
    dice: null,
    doublesInRow: 0,
    rollAgain: false,
    pendingBuy: null,
    auction: null,
    debts: [],
    trades: [],
    tradeSeq: 0,
    lastCard: null,
    round: 1,
    timeUp: false,
    eliminated: [],
    ranking: null,
    ranks: null,
    rng: holder.rng,
  };
  if (settings.quickStart) {
    // Départ rapide : deux titres tirés au sort pour chacun, offerts par la banque
    const pool = shuffle(state, [...BUYABLE]);
    for (const p of state.players) {
      for (let k = 0; k < 2; k++) {
        const sq = pool.pop();
        if (sq !== undefined) state.deeds[sq]!.owner = p.id;
      }
    }
    for (const p of state.players) p.stats.monopolies = monopoliesOf(state, p.id);
  }
  const events: CapitaleEvent[] = [{ type: "turn", player: state.players[state.turn]!.id }];
  resume(state);
  return { state, events };
}

// ---------------------------------------------------------------------------
// Lecture de l'état
// ---------------------------------------------------------------------------

export function playerOf(s: CapitaleState, id: string): CapitalePlayer | undefined {
  return s.players.find((p) => p.id === id);
}

export function currentPlayer(s: CapitaleState): CapitalePlayer {
  return s.players[s.turn]!;
}

/** Celui dont on attend la décision : le premier endetté, sinon le joueur dont c'est le tour ; personne pendant une enchère */
export function actorOf(s: CapitaleState): string | null {
  if (s.step === "over" || s.step === "auction") return null;
  if (s.debts.length > 0) return s.debts[0]!.debtor;
  return currentPlayer(s).id;
}

export function ownsGroup(s: CapitaleState, playerId: string, group: GroupId): boolean {
  return GROUPS[group].squares.every((i) => s.deeds[i]!.owner === playerId);
}

export function monopoliesOf(s: CapitaleState, playerId: string): number {
  return GROUP_ORDER.filter((g) => ownsGroup(s, playerId, g)).length;
}

export function ownedBy(s: CapitaleState, playerId: string): number[] {
  return BUYABLE.filter((i) => s.deeds[i]!.owner === playerId);
}

/** La fortune : argent, titres (moitié s'ils sont hypothéqués) et constructions au prix coûtant */
export function netWorth(s: CapitaleState, playerId: string): number {
  const p = playerOf(s, playerId);
  if (!p || p.bankrupt) return 0;
  let total = p.cash;
  for (const i of ownedBy(s, playerId)) {
    const d = s.deeds[i]!;
    total += d.mortgaged ? mortgageValue(i) : SQUARES[i]!.price!;
    const g = groupOf(i);
    if (g) total += d.houses * g.houseCost;
  }
  return total;
}

/** Ce que rapporterait la vente de tout (constructions à moitié prix, hypothèques) : de quoi payer une dette */
export function liquidity(s: CapitaleState, playerId: string): number {
  const p = playerOf(s, playerId);
  if (!p) return 0;
  let total = p.cash;
  for (const i of ownedBy(s, playerId)) {
    const d = s.deeds[i]!;
    const g = groupOf(i);
    if (g) total += (d.houses * g.houseCost) / 2;
    if (!d.mortgaged) total += mortgageValue(i);
  }
  return Math.floor(total);
}

export interface RentContext {
  diceTotal: number;
  /** Carte « TGV le plus proche » : loyer double */
  stationTimes?: number;
  /** Carte « réseau le plus proche » : 10 fois les dés */
  utilityTimes?: number;
}

export function rentFor(s: CapitaleState, index: number, ctx: RentContext): number {
  const deed = s.deeds[index];
  const sq = SQUARES[index]!;
  if (!deed || !deed.owner || deed.mortgaged) return 0;
  const owner = playerOf(s, deed.owner);
  if (!owner || owner.bankrupt) return 0;
  if (s.settings.noRentInJail && owner.inJail) return 0;
  if (sq.kind === "property") {
    if (deed.houses > 0) return sq.rents![deed.houses]!;
    return sq.rents![0] * (ownsGroup(s, deed.owner, sq.group!) ? 2 : 1);
  }
  if (sq.kind === "station") {
    const n = STATIONS.filter((i) => s.deeds[i]!.owner === deed.owner).length;
    return STATION_RENTS[n - 1]! * (ctx.stationTimes ?? 1);
  }
  if (sq.kind === "utility") {
    const n = UTILITIES.filter((i) => s.deeds[i]!.owner === deed.owner).length;
    return ctx.diceTotal * (ctx.utilityTimes ?? (n === 2 ? 10 : 4));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Argent
// ---------------------------------------------------------------------------

function credit(s: CapitaleState, account: Account, amount: number) {
  if (account === "bank") return;
  if (account === "pot") {
    s.pot += amount;
    return;
  }
  const p = playerOf(s, account);
  if (p && !p.bankrupt) p.cash += amount;
}

/** Paiement immédiat (le payeur a de quoi) */
function pay(s: CapitaleState, from: Account, to: Account, amount: number, reason: MoneyReason, events: CapitaleEvent[], square?: number) {
  if (amount <= 0) return;
  if (from !== "bank" && from !== "pot") {
    const p = playerOf(s, from)!;
    p.cash -= amount;
    if (reason === "rent") p.stats.rentPaid += amount;
  } else if (from === "pot") s.pot -= amount;
  // Un créancier en faillite ne touche plus rien : l'argent va à la banque
  const dest = to !== "bank" && to !== "pot" && playerOf(s, to)?.bankrupt ? "bank" : to;
  credit(s, dest, amount);
  if (reason === "rent" && dest !== "bank" && dest !== "pot") playerOf(s, dest)!.stats.rentEarned += amount;
  events.push({ type: "money", from, to: dest, amount, reason, ...(square !== undefined ? { square } : {}) });
}

/** Ce qu'un joueur doit : payé tout de suite s'il a l'argent (et pas de dette plus ancienne), sinon mis en dette */
function charge(
  s: CapitaleState,
  debtor: CapitalePlayer,
  creditor: Account,
  amount: number,
  reason: MoneyReason,
  events: CapitaleEvent[],
  square?: number,
) {
  if (amount <= 0 || debtor.bankrupt) return;
  const waiting = s.debts.some((d) => d.debtor === debtor.id);
  if (!waiting && debtor.cash >= amount) {
    pay(s, debtor.id, creditor, amount, reason, events, square);
    return;
  }
  s.debts.push({ debtor: debtor.id, creditor, amount, reason, ...(square !== undefined ? { square } : {}) });
  events.push({ type: "debt", player: debtor.id, amount, creditor });
}

/** Les dettes se paient dans l'ordre, dès que l'argent est là */
function settleDebts(s: CapitaleState, events: CapitaleEvent[]) {
  while (s.debts.length > 0) {
    const d = s.debts[0]!;
    const p = playerOf(s, d.debtor);
    if (!p || p.bankrupt) {
      s.debts.shift();
      continue;
    }
    if (p.cash < d.amount) break;
    s.debts.shift();
    pay(s, p.id, d.creditor, d.amount, d.reason, events, d.square);
  }
}

const taxAccount = (s: CapitaleState): Account => (s.settings.freeParking ? "pot" : "bank");

// ---------------------------------------------------------------------------
// Déplacements et cases
// ---------------------------------------------------------------------------

function moveBy(s: CapitaleState, p: CapitalePlayer, steps: number, events: CapitaleEvent[], jump = false) {
  const from = p.position;
  const to = (((from + steps) % 40) + 40) % 40;
  const passGo = steps > 0 && from + steps >= 40;
  p.position = to;
  events.push({ type: "move", player: p.id, from, to, steps, passGo, jump });
  if (passGo) {
    pay(s, "bank", p.id, GO_SALARY, "go", events);
    p.stats.passGo += 1;
  }
}

function moveTo(s: CapitaleState, p: CapitalePlayer, target: number, events: CapitaleEvent[]) {
  const steps = (target - p.position + 40) % 40 || 40;
  moveBy(s, p, steps, events);
}

function sendToJail(s: CapitaleState, p: CapitalePlayer, reason: "square" | "card" | "doubles", events: CapitaleEvent[]) {
  const from = p.position;
  p.position = JAIL_SQUARE;
  p.inJail = true;
  p.jailTurns = 0;
  p.stats.jail += 1;
  s.rollAgain = false;
  s.doublesInRow = 0;
  events.push({ type: "move", player: p.id, from, to: JAIL_SQUARE, steps: 0, passGo: false, jump: true });
  events.push({ type: "jail", player: p.id, reason });
}

interface LandContext extends Partial<RentContext> {
  depth: number;
  /** Arrivé sur la case par les dés (et non par une carte) */
  byDice: boolean;
}

function land(s: CapitaleState, p: CapitalePlayer, events: CapitaleEvent[], ctx: LandContext) {
  const sq = SQUARES[p.position]!;
  const diceTotal = s.dice ? s.dice[0] + s.dice[1] : 7;
  switch (sq.kind) {
    case "go":
      // Règle maison : tomber pile sur Départ double le salaire
      if (s.settings.doubleGo && ctx.byDice) pay(s, "bank", p.id, GO_SALARY, "go", events);
      return;
    case "property":
    case "station":
    case "utility": {
      const deed = s.deeds[sq.index]!;
      if (!deed.owner) {
        s.pendingBuy = sq.index;
        return;
      }
      if (deed.owner === p.id) return;
      const rent = rentFor(s, sq.index, { diceTotal, stationTimes: ctx.stationTimes, utilityTimes: ctx.utilityTimes });
      charge(s, p, deed.owner, rent, "rent", events, sq.index);
      return;
    }
    case "tax":
      charge(s, p, taxAccount(s), sq.tax!, "tax", events, sq.index);
      return;
    case "card":
      if (ctx.depth < 3) drawCard(s, p, sq.deck!, events, ctx.depth);
      return;
    case "toJail":
      sendToJail(s, p, "square", events);
      return;
    case "rest":
      if (s.settings.freeParking && s.pot > 0) pay(s, "pot", p.id, s.pot, "pot", events);
      return;
    case "jail":
      return;
  }
}

function drawCard(s: CapitaleState, p: CapitalePlayer, deck: DeckId, events: CapitaleEvent[], depth: number) {
  const pile = s.decks[deck];
  const card = pile.shift();
  if (card === undefined) return;
  const { effect } = DECKS[deck][card]!;
  if (effect.kind === "jailFree") p.jailCards.push(deck);
  else pile.push(card);
  s.lastCard = { deck, card, player: p.id };
  events.push({ type: "card", player: p.id, deck, card });
  const next: LandContext = { depth: depth + 1, byDice: false };
  switch (effect.kind) {
    case "money":
      if (effect.amount > 0) pay(s, "bank", p.id, effect.amount, "card", events);
      else charge(s, p, taxAccount(s), -effect.amount, "card", events);
      return;
    case "moveTo":
      moveTo(s, p, effect.square, events);
      land(s, p, events, next);
      return;
    case "moveBy":
      moveBy(s, p, effect.steps, events);
      land(s, p, events, next);
      return;
    case "nearest": {
      const list = effect.target === "station" ? STATIONS : UTILITIES;
      const target = list.find((i) => i > p.position) ?? list[0]!;
      moveTo(s, p, target, events);
      land(s, p, events, effect.target === "station" ? { ...next, stationTimes: 2 } : { ...next, utilityTimes: 10 });
      return;
    }
    case "jail":
      sendToJail(s, p, "card", events);
      return;
    case "jailFree":
      return;
    case "repairs": {
      let houses = 0;
      let hotels = 0;
      for (const i of ownedBy(s, p.id)) {
        const h = s.deeds[i]!.houses;
        if (h === HOTEL) hotels += 1;
        else houses += h;
      }
      charge(s, p, taxAccount(s), houses * effect.house + hotels * effect.hotel, "card", events);
      return;
    }
    case "eachPlayer":
      for (const other of s.players) {
        if (other === p || other.bankrupt) continue;
        if (effect.amount > 0) charge(s, other, p.id, effect.amount, "card", events);
        else charge(s, p, other.id, -effect.amount, "card", events);
      }
      return;
  }
}

// ---------------------------------------------------------------------------
// Enchaînement du tour
// ---------------------------------------------------------------------------

/** L'étape suivante, selon ce qui reste à régler : enchère, dettes, achat, nouveau lancer, puis gestion */
function resume(s: CapitaleState) {
  if (s.step === "over") return;
  if (s.auction) s.step = "auction";
  else if (s.debts.length > 0) s.step = "debt";
  else if (s.pendingBuy !== null) s.step = "buy";
  else if (s.rollAgain) s.step = "roll";
  else if (s.step !== "roll" || s.dice !== null) s.step = "manage";
  const key = `${s.turnId}|${s.step}|${actorOf(s)}`;
  if (key !== s.decisionKey) {
    s.decisionKey = key;
    s.decision += 1;
  }
}

function nextTurn(s: CapitaleState, events: CapitaleEvent[]) {
  if (s.timeUp || s.round > MAX_ROUNDS) {
    finishGame(s, events);
    return;
  }
  let i = s.turn;
  for (let k = 0; k < s.players.length; k++) {
    i = (i + 1) % s.players.length;
    if (!s.players[i]!.bankrupt) break;
  }
  if (i <= s.turn) s.round += 1;
  s.turn = i;
  s.turnId += 1;
  s.step = "roll";
  s.dice = null;
  s.doublesInRow = 0;
  s.rollAgain = false;
  s.pendingBuy = null;
  events.push({ type: "turn", player: s.players[i]!.id });
  if (s.round > MAX_ROUNDS) finishGame(s, events);
}

function roll(s: CapitaleState, p: CapitalePlayer, events: CapitaleEvent[]) {
  const dice: [number, number] = s.rigged?.shift() ?? [1 + randomInt(s, 6), 1 + randomInt(s, 6)];
  const doubles = dice[0] === dice[1];
  const total = dice[0] + dice[1];
  s.dice = dice;
  events.push({ type: "dice", player: p.id, dice, doubles });
  if (doubles) p.stats.doubles += 1;
  if (p.inJail) {
    s.rollAgain = false;
    if (doubles) {
      p.inJail = false;
      p.jailTurns = 0;
      events.push({ type: "leaveJail", player: p.id, how: "doubles" });
    } else {
      p.jailTurns += 1;
      if (p.jailTurns < 3) return;
      // Troisième essai manqué : on paie et on sort
      p.inJail = false;
      p.jailTurns = 0;
      events.push({ type: "leaveJail", player: p.id, how: "forced" });
      charge(s, p, taxAccount(s), JAIL_FINE, "jail", events);
    }
    moveBy(s, p, total, events);
    land(s, p, events, { depth: 0, byDice: true });
    return;
  }
  if (doubles) {
    s.doublesInRow += 1;
    if (s.doublesInRow >= 3) {
      sendToJail(s, p, "doubles", events);
      return;
    }
  } else s.doublesInRow = 0;
  s.rollAgain = doubles;
  moveBy(s, p, total, events);
  land(s, p, events, { depth: 0, byDice: true });
}

function closeAuctionInner(s: CapitaleState, events: CapitaleEvent[]) {
  const a = s.auction;
  if (!a) return;
  s.auction = null;
  const winner = a.high ? playerOf(s, a.high.player) : undefined;
  if (winner && !winner.bankrupt && winner.cash >= a.high!.amount) {
    pay(s, winner.id, "bank", a.high!.amount, "auction", events, a.square);
    s.deeds[a.square]!.owner = winner.id;
    winner.stats.auctionsWon += 1;
    winner.stats.bought += 1;
    winner.stats.monopolies = Math.max(winner.stats.monopolies, monopoliesOf(s, winner.id));
    events.push({ type: "auctionEnd", square: a.square, winner: winner.id, amount: a.high!.amount });
  } else {
    events.push({ type: "auctionEnd", square: a.square, winner: null, amount: 0 });
  }
}

/** Les enchérisseurs encore en lice */
export function auctionBidders(s: CapitaleState): string[] {
  const a = s.auction;
  if (!a) return [];
  return s.players.filter((p) => !p.bankrupt && !a.out.includes(p.id)).map((p) => p.id);
}

function maybeCloseAuction(s: CapitaleState, events: CapitaleEvent[]) {
  const a = s.auction;
  if (!a) return;
  const active = auctionBidders(s);
  if ((a.high && active.every((id) => id === a.high!.player)) || (!a.high && active.length === 0)) closeAuctionInner(s, events);
}

// ---------------------------------------------------------------------------
// Constructions et hypothèques
// ---------------------------------------------------------------------------

/** Peut-on gérer ses titres maintenant ? Pendant son tour, ou pendant sa dette (vendre et hypothéquer seulement) */
function manageRight(s: CapitaleState, playerId: string): "full" | "raise" | null {
  if (s.step === "over" || s.step === "auction") return null;
  if (s.debts.length > 0) return s.debts[0]!.debtor === playerId ? "raise" : null;
  if (currentPlayer(s).id !== playerId) return null;
  return s.step === "roll" || s.step === "buy" || s.step === "manage" ? "full" : null;
}

export function canBuild(s: CapitaleState, playerId: string, index: number): string | null {
  const sq = SQUARES[index];
  const deed = s.deeds[index];
  if (!sq || sq.kind !== "property" || !deed) return "On ne construit que sur un terrain.";
  if (deed.owner !== playerId) return "Ce terrain n'est pas à toi.";
  const g = GROUPS[sq.group!];
  if (!ownsGroup(s, playerId, g.id)) return "Il faut tout le groupe de couleur pour construire.";
  if (g.squares.some((i) => s.deeds[i]!.mortgaged)) return "Un terrain du groupe est hypothéqué.";
  if (deed.houses >= HOTEL) return "Il y a déjà un hôtel.";
  const min = Math.min(...g.squares.map((i) => s.deeds[i]!.houses));
  if (deed.houses > min) return "On construit de façon égale : d'abord sur les autres terrains du groupe.";
  if (deed.houses === 4 ? s.bankHotels < 1 : s.bankHouses < 1)
    return deed.houses === 4 ? "La banque n'a plus d'hôtel." : "La banque n'a plus de maison.";
  if (playerOf(s, playerId)!.cash < g.houseCost) return "Pas assez d'argent.";
  return null;
}

export function canSell(s: CapitaleState, playerId: string, index: number): string | null {
  const sq = SQUARES[index];
  const deed = s.deeds[index];
  if (!sq || !deed || deed.owner !== playerId) return "Ce terrain n'est pas à toi.";
  if (deed.houses === 0) return "Rien à vendre ici.";
  const g = GROUPS[sq.group!];
  const max = Math.max(...g.squares.map((i) => s.deeds[i]!.houses));
  if (deed.houses < max) return "On vend de façon égale : d'abord sur les autres terrains du groupe.";
  return null;
}

export function canMortgage(s: CapitaleState, playerId: string, index: number): string | null {
  const deed = s.deeds[index];
  if (!deed || deed.owner !== playerId) return "Ce titre n'est pas à toi.";
  if (deed.mortgaged) return "Déjà hypothéqué.";
  const g = groupOf(index);
  if (g && g.squares.some((i) => s.deeds[i]!.houses > 0)) return "Vends d'abord les constructions du groupe.";
  return null;
}

function build(s: CapitaleState, p: CapitalePlayer, index: number, events: CapitaleEvent[]) {
  const deed = s.deeds[index]!;
  const g = groupOf(index)!;
  pay(s, p.id, "bank", g.houseCost, "build", events, index);
  if (deed.houses === 4) {
    s.bankHotels -= 1;
    s.bankHouses += 4;
    p.stats.hotels += 1;
  } else {
    s.bankHouses -= 1;
    p.stats.houses += 1;
  }
  deed.houses += 1;
  events.push({ type: "build", player: p.id, square: index, houses: deed.houses });
}

function sellOne(s: CapitaleState, p: CapitalePlayer, index: number, events: CapitaleEvent[]) {
  const deed = s.deeds[index]!;
  const g = groupOf(index)!;
  const half = Math.floor(g.houseCost / 2);
  if (deed.houses === HOTEL) {
    // L'hôtel redevient quatre maisons, si la banque en a encore
    const back = Math.min(4, s.bankHouses);
    s.bankHouses -= back;
    s.bankHotels += 1;
    pay(s, "bank", p.id, half * (HOTEL - back), "sell", events, index);
    deed.houses = back;
  } else {
    s.bankHouses += 1;
    pay(s, "bank", p.id, half, "sell", events, index);
    deed.houses -= 1;
  }
  events.push({ type: "sell", player: p.id, square: index, houses: deed.houses });
}

// ---------------------------------------------------------------------------
// Échanges
// ---------------------------------------------------------------------------

const sanitizeOffer = (o: Offer): Offer => ({
  cash: Math.max(0, Math.floor(Number(o?.cash) || 0)),
  squares: [...new Set((Array.isArray(o?.squares) ? o.squares : []).map(Number).filter((i) => Number.isInteger(i)))].slice(0, 28),
  jailCards: Math.max(0, Math.floor(Number(o?.jailCards) || 0)),
});

export function offerProblem(s: CapitaleState, playerId: string, offer: Offer): string | null {
  const p = playerOf(s, playerId);
  if (!p || p.bankrupt) return "Ce joueur n'est plus dans la partie.";
  if (offer.cash > p.cash) return `${offer.cash} demandés, mais il n'y a que ${p.cash} en caisse.`;
  if (offer.jailCards > p.jailCards.length) return "Pas assez de cartes « sortie de prison ».";
  for (const i of offer.squares) {
    const deed = s.deeds[i];
    if (!deed || deed.owner !== playerId) return `${SQUARES[i]?.name ?? "Ce titre"} n'appartient pas à ce joueur.`;
    const g = groupOf(i);
    if (g && g.squares.some((x) => s.deeds[x]!.houses > 0))
      return `Il y a des constructions dans le groupe de ${SQUARES[i]!.name} : il faut les vendre avant.`;
  }
  return null;
}

const isEmpty = (o: Offer) => o.cash === 0 && o.squares.length === 0 && o.jailCards === 0;

function interestOn(s: CapitaleState, squares: number[]): number {
  return squares.filter((i) => s.deeds[i]!.mortgaged).reduce((n, i) => n + mortgageInterest(i), 0);
}

function executeTrade(s: CapitaleState, t: Trade, events: CapitaleEvent[]) {
  const a = playerOf(s, t.from)!;
  const b = playerOf(s, t.to)!;
  const move = (from: CapitalePlayer, to: CapitalePlayer, offer: Offer) => {
    if (offer.cash > 0) pay(s, from.id, to.id, offer.cash, "trade", events);
    for (const i of offer.squares) s.deeds[i]!.owner = to.id;
    for (let k = 0; k < offer.jailCards; k++) {
      const card = from.jailCards.shift();
      if (card) to.jailCards.push(card);
    }
  };
  move(a, b, t.give);
  move(b, a, t.get);
  // Un titre hypothéqué reçu : 10 % d'intérêts tout de suite
  const toA = interestOn(s, t.get.squares);
  const toB = interestOn(s, t.give.squares);
  if (toA > 0) pay(s, a.id, "bank", toA, "interest", events);
  if (toB > 0) pay(s, b.id, "bank", toB, "interest", events);
  a.stats.trades += 1;
  b.stats.trades += 1;
  for (const p of [a, b]) p.stats.monopolies = Math.max(p.stats.monopolies, monopoliesOf(s, p.id));
}

// ---------------------------------------------------------------------------
// Faillite et fin
// ---------------------------------------------------------------------------

function goBankrupt(s: CapitaleState, p: CapitalePlayer, creditor: Account, events: CapitaleEvent[]) {
  const wasCurrent = currentPlayer(s) === p;
  // Les constructions sont rachetées par la banque à moitié prix
  for (const i of ownedBy(s, p.id)) {
    const d = s.deeds[i]!;
    if (d.houses === 0) continue;
    const g = groupOf(i)!;
    const refund = Math.floor(g.houseCost / 2) * d.houses;
    if (d.houses === HOTEL) s.bankHotels += 1;
    else s.bankHouses += d.houses;
    d.houses = 0;
    pay(s, "bank", p.id, refund, "sell", events, i);
  }
  const heir = creditor !== "bank" && creditor !== "pot" ? playerOf(s, creditor) : undefined;
  if (heir && !heir.bankrupt) {
    if (p.cash > 0) pay(s, p.id, heir.id, p.cash, "bankrupt", events);
    for (const i of ownedBy(s, p.id)) s.deeds[i]!.owner = heir.id;
    heir.jailCards.push(...p.jailCards);
    heir.stats.bankrupted += 1;
    heir.stats.monopolies = Math.max(heir.stats.monopolies, monopoliesOf(s, heir.id));
  } else {
    if (p.cash > 0) pay(s, p.id, "bank", p.cash, "bankrupt", events);
    // Les titres redeviennent libres
    for (const i of ownedBy(s, p.id)) s.deeds[i] = { owner: null, houses: 0, mortgaged: false };
    for (const deck of p.jailCards) s.decks[deck].push(JAIL_CARD_INDEX[deck]);
  }
  p.jailCards = [];
  p.cash = 0;
  p.bankrupt = true;
  p.inJail = false;
  s.eliminated.push(p.id);
  s.debts = s.debts.filter((d) => d.debtor !== p.id);
  s.trades = s.trades.filter((t) => t.from !== p.id && t.to !== p.id);
  if (s.auction && !s.auction.out.includes(p.id)) s.auction.out.push(p.id);
  events.push({ type: "bankrupt", player: p.id, to: heir && !heir.bankrupt ? heir.id : "bank" });
  const alive = s.players.filter((x) => !x.bankrupt);
  if (alive.length <= 1) {
    finishGame(s, events);
    return;
  }
  if (wasCurrent) {
    s.pendingBuy = null;
    s.rollAgain = false;
    nextTurn(s, events);
  }
}

function finishGame(s: CapitaleState, events: CapitaleEvent[]) {
  if (s.step === "over") return;
  s.step = "over";
  s.auction = null;
  s.debts = [];
  s.trades = [];
  s.pendingBuy = null;
  for (const p of s.players) {
    p.stats.netWorth = netWorth(s, p.id);
    p.stats.monopolies = Math.max(p.stats.monopolies, p.bankrupt ? 0 : monopoliesOf(s, p.id));
  }
  const alive = s.players.filter((p) => !p.bankrupt).sort((a, b) => b.stats.netWorth - a.stats.netWorth);
  const out = [...s.eliminated].reverse();
  const ranking = [...alive.map((p) => p.id), ...out];
  const ranks: Record<string, number> = {};
  alive.forEach((p, i) => {
    const prev = alive[i - 1];
    ranks[p.id] = prev && prev.stats.netWorth === p.stats.netWorth ? ranks[prev.id]! : i + 1;
  });
  out.forEach((id, i) => (ranks[id] = alive.length + i + 1));
  s.ranking = ranking;
  s.ranks = ranks;
  events.push({ type: "gameOver", ranking });
}

/** L'heure est passée (partie à durée fixe) : le tour en cours est le dernier */
export function timeUp(s: CapitaleState): CapitaleEvent[] {
  if (s.step === "over" || s.timeUp) return [];
  s.timeUp = true;
  return [{ type: "timeUp" }];
}

/** Le chrono de l'enchère est écoulé : le plus offrant l'emporte */
export function closeAuction(s: CapitaleState): CapitaleEvent[] {
  if (!s.auction) return [];
  const events: CapitaleEvent[] = [];
  closeAuctionInner(s, events);
  settleDebts(s, events);
  resume(s);
  return events;
}

/** Une proposition restée sans réponse */
export function expireTrade(s: CapitaleState, id: number): CapitaleEvent[] {
  const t = s.trades.find((x) => x.id === id);
  if (!t) return [];
  s.trades = s.trades.filter((x) => x !== t);
  return [{ type: "trade", trade: t, status: "expired" }];
}

// ---------------------------------------------------------------------------
// Les actions des joueurs
// ---------------------------------------------------------------------------

export function applyAction(s: CapitaleState, playerId: string, action: CapitaleAction): ActionResult {
  const p = playerOf(s, playerId);
  if (!p) return { ok: false, error: "Tu ne joues pas à cette partie." };
  if (s.step === "over") return { ok: false, error: "La partie est finie." };
  if (p.bankrupt) return { ok: false, error: "Tu as fait faillite : tu regardes la fin de la partie." };
  const events: CapitaleEvent[] = [];
  const isTurn = currentPlayer(s).id === playerId;
  const fail = (error: string): ActionResult => ({ ok: false, error });

  switch (action.type) {
    case "roll": {
      if (!isTurn || s.step !== "roll") return fail("Ce n'est pas le moment de lancer les dés.");
      roll(s, p, events);
      break;
    }
    case "payJail": {
      if (!isTurn || s.step !== "roll" || !p.inJail) return fail("Tu n'es pas en prison.");
      if (p.cash < JAIL_FINE) return fail(`Il faut ${JAIL_FINE} pour sortir.`);
      pay(s, p.id, taxAccount(s), JAIL_FINE, "jail", events);
      p.inJail = false;
      p.jailTurns = 0;
      events.push({ type: "leaveJail", player: p.id, how: "pay" });
      break;
    }
    case "useJailCard": {
      if (!isTurn || s.step !== "roll" || !p.inJail) return fail("Tu n'es pas en prison.");
      const deck = p.jailCards.shift();
      if (!deck) return fail("Tu n'as pas de carte « sortie de prison ».");
      s.decks[deck].push(JAIL_CARD_INDEX[deck]);
      p.inJail = false;
      p.jailTurns = 0;
      events.push({ type: "leaveJail", player: p.id, how: "card" });
      break;
    }
    case "buy": {
      if (!isTurn || s.step !== "buy" || s.pendingBuy === null) return fail("Rien à acheter pour l'instant.");
      const index = s.pendingBuy;
      const price = SQUARES[index]!.price!;
      if (p.cash < price) return fail(`Il faut ${price} : hypothèque ou vends d'abord, ou mets-le aux enchères.`);
      pay(s, p.id, "bank", price, "buy", events, index);
      s.deeds[index]!.owner = p.id;
      s.pendingBuy = null;
      p.stats.bought += 1;
      p.stats.monopolies = Math.max(p.stats.monopolies, monopoliesOf(s, p.id));
      events.push({ type: "buy", player: p.id, square: index, price });
      break;
    }
    case "decline": {
      if (!isTurn || s.step !== "buy" || s.pendingBuy === null) return fail("Rien à acheter pour l'instant.");
      s.auction = { square: s.pendingBuy, high: null, out: [], bids: 0 };
      s.pendingBuy = null;
      events.push({ type: "auction", square: s.auction.square });
      break;
    }
    case "bid": {
      const a = s.auction;
      if (!a) return fail("Aucune enchère en cours.");
      if (a.out.includes(p.id)) return fail("Tu as passé : tu ne peux plus enchérir.");
      const amount = Math.floor(Number(action.amount));
      const floor = (a.high?.amount ?? 0) + 1;
      if (!Number.isFinite(amount) || amount < floor) return fail(`Il faut offrir au moins ${floor}.`);
      if (amount > p.cash) return fail(`Tu n'as que ${p.cash}.`);
      if (a.high?.player === p.id) return fail("Tu es déjà le plus offrant.");
      a.high = { player: p.id, amount };
      a.bids += 1;
      events.push({ type: "bid", player: p.id, amount });
      maybeCloseAuction(s, events);
      break;
    }
    case "pass": {
      const a = s.auction;
      if (!a) return fail("Aucune enchère en cours.");
      if (a.out.includes(p.id)) return { ok: true, events: [] };
      if (a.high?.player === p.id) return fail("Tu es le plus offrant : attends la fin de l'enchère.");
      a.out.push(p.id);
      events.push({ type: "pass", player: p.id });
      maybeCloseAuction(s, events);
      break;
    }
    case "build": {
      if (manageRight(s, playerId) !== "full") return fail("Tu construis pendant ton tour.");
      const problem = canBuild(s, playerId, action.square);
      if (problem) return fail(problem);
      build(s, p, action.square, events);
      break;
    }
    case "sell": {
      if (!manageRight(s, playerId)) return fail("Tu vends tes constructions pendant ton tour.");
      const problem = canSell(s, playerId, action.square);
      if (problem) return fail(problem);
      sellOne(s, p, action.square, events);
      break;
    }
    case "mortgage": {
      if (!manageRight(s, playerId)) return fail("Tu hypothèques pendant ton tour.");
      const problem = canMortgage(s, playerId, action.square);
      if (problem) return fail(problem);
      s.deeds[action.square]!.mortgaged = true;
      pay(s, "bank", p.id, mortgageValue(action.square), "mortgage", events, action.square);
      events.push({ type: "mortgage", player: p.id, square: action.square });
      break;
    }
    case "unmortgage": {
      if (manageRight(s, playerId) !== "full") return fail("Tu lèves une hypothèque pendant ton tour.");
      const deed = s.deeds[action.square];
      if (!deed || deed.owner !== playerId || !deed.mortgaged) return fail("Ce titre n'est pas hypothéqué.");
      const cost = unmortgageCost(action.square);
      if (p.cash < cost) return fail(`Il faut ${cost} pour lever l'hypothèque.`);
      pay(s, p.id, "bank", cost, "unmortgage", events, action.square);
      deed.mortgaged = false;
      events.push({ type: "unmortgage", player: p.id, square: action.square });
      break;
    }
    case "propose": {
      if (s.step === "auction") return fail("Pas d'échange pendant une enchère.");
      const other = playerOf(s, action.to);
      if (!other || other.bankrupt || other.id === playerId) return fail("Choisis un autre joueur.");
      const give = sanitizeOffer(action.give);
      const get = sanitizeOffer(action.get);
      if (isEmpty(give) && isEmpty(get)) return fail("La proposition est vide.");
      const problem = offerProblem(s, playerId, give) ?? offerProblem(s, other.id, get);
      if (problem) return fail(problem);
      if (action.replaces !== undefined) {
        const old = s.trades.find((t) => t.id === action.replaces && t.to === playerId && t.from === other.id);
        if (old) {
          s.trades = s.trades.filter((t) => t !== old);
          events.push({ type: "trade", trade: old, status: "rejected" });
        }
      }
      // Une seule proposition à la fois par joueur : la nouvelle remplace l'ancienne
      for (const old of s.trades.filter((t) => t.from === playerId)) events.push({ type: "trade", trade: old, status: "cancelled" });
      s.trades = s.trades.filter((t) => t.from !== playerId);
      const trade: Trade = { id: ++s.tradeSeq, from: playerId, to: other.id, give, get };
      s.trades.push(trade);
      events.push({ type: "trade", trade, status: "proposed" });
      break;
    }
    case "accept": {
      if (s.step === "auction") return fail("Pas d'échange pendant une enchère.");
      const t = s.trades.find((x) => x.id === action.trade);
      if (!t || t.to !== playerId) return fail("Cette proposition n'existe plus.");
      const problem = offerProblem(s, t.from, t.give) ?? offerProblem(s, t.to, t.get);
      if (problem) {
        s.trades = s.trades.filter((x) => x !== t);
        events.push({ type: "trade", trade: t, status: "expired" });
        return { ok: true, events };
      }
      const a = playerOf(s, t.from)!;
      const b = playerOf(s, t.to)!;
      const aAfter = a.cash - t.give.cash + t.get.cash - interestOn(s, t.get.squares);
      const bAfter = b.cash - t.get.cash + t.give.cash - interestOn(s, t.give.squares);
      if (bAfter < 0) return fail("Pas assez d'argent pour les intérêts des titres hypothéqués.");
      if (aAfter < 0) return fail("L'autre joueur n'a plus de quoi payer les intérêts des titres hypothéqués.");
      s.trades = s.trades.filter((x) => x !== t);
      executeTrade(s, t, events);
      events.push({ type: "trade", trade: t, status: "accepted" });
      break;
    }
    case "reject": {
      const t = s.trades.find((x) => x.id === action.trade);
      if (!t || t.to !== playerId) return { ok: true, events: [] };
      s.trades = s.trades.filter((x) => x !== t);
      events.push({ type: "trade", trade: t, status: "rejected" });
      break;
    }
    case "cancel": {
      const t = s.trades.find((x) => x.id === action.trade);
      if (!t || t.from !== playerId) return { ok: true, events: [] };
      s.trades = s.trades.filter((x) => x !== t);
      events.push({ type: "trade", trade: t, status: "cancelled" });
      break;
    }
    case "bankrupt": {
      const debt = s.debts[0];
      if (s.step !== "debt" || !debt || debt.debtor !== playerId) return fail("Tu n'as pas de dette à régler.");
      goBankrupt(s, p, debt.creditor, events);
      break;
    }
    case "endTurn": {
      if (!isTurn || s.step !== "manage") return fail("Tu ne peux pas finir ton tour maintenant.");
      nextTurn(s, events);
      break;
    }
    default:
      return fail("Action inconnue.");
  }
  settleDebts(s, events);
  resume(s);
  return { ok: true, events };
}
