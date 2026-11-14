// Capitale : le moteur de partie, partagé entre le serveur (qui fait foi) et les tests.
// Aucune notion de temps ici : les chronos (enchère, temps de décision, fin de partie) sont tenus par le salon.

import { oneTeamLeft, type Teams } from "../teams.ts";
import { randomInt, shuffle, type RngHolder } from "../../rng.ts";
import {
  BUYABLE,
  DECKS,
  FREE_LEVELS,
  GO_SALARY,
  GROUP_ORDER,
  GROUPS,
  groupOf,
  isSpecialKind,
  JAIL_FINE,
  JAIL_SQUARE,
  MAX_LEVEL,
  MONOPOLY_GROUPS,
  mortgageInterest,
  mortgageValue,
  SIDES,
  SPECIALS,
  specialPrice,
  SQUARES,
  STADIUM_TICKET,
  START_CASH,
  STATION_RENTS,
  STATIONS,
  unmortgageCost,
  upgradeCost,
  UTILITIES,
  type DeckId,
  type GroupId,
  type MonopolyKind,
  type SpecialKind,
} from "./board.ts";

export type BotLevel = "facile" | "moyen" | "fort";
export type EndMode = "bankrupt" | "timed";
/** En équipes : le loyer qu'un joueur paie chez un coéquipier (et le billet de son stade) */
export type TeamRent = "free" | "half" | "full";
export const GAME_MINUTES = [30, 45, 60] as const;
export const TURN_SECONDS = [30, 60, 0] as const;
/** À une table : chacun pour soi (0), ou deux ou trois équipes */
export const TEAM_COUNTS = [0, 2, 3] as const;
export type TeamCount = (typeof TEAM_COUNTS)[number];
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
  /** Bâtiments spéciaux : gratte-ciel, parc, stade, et des nuisances chez les autres */
  specials: boolean;
  /** Monopole : trois quartiers complets, un côté entier du plateau ou les quatre gares, et la partie s'arrête net */
  monopoly: boolean;
  botLevel: BotLevel;
  /** À une table : le nombre d'équipes (0, chacun pour soi). En tournée, ce sont les équipes de la tournée */
  teamCount: TeamCount;
  /** En équipes : le loyer entre coéquipiers, stade compris */
  teamRent: TeamRent;
  /** En équipes : on peut donner de l'argent, des titres ou une carte de prison à un coéquipier, à tout moment */
  teamGifts: boolean;
  /** En équipes : les titres d'un joueur en faillite passent à un coéquipier encore en jeu */
  teamHeir: boolean;
  /** En équipes : on gagne ensemble (fortunes additionnées, et les titres de l'équipe comptent ensemble au Monopole) */
  teamWin: boolean;
}

export const DEFAULT_SETTINGS: CapitaleSettings = {
  end: "timed",
  minutes: 45,
  turnSeconds: 30,
  freeParking: false,
  doubleGo: false,
  noRentInJail: false,
  quickStart: false,
  specials: true,
  monopoly: false,
  botLevel: "moyen",
  teamCount: 0,
  teamRent: "free",
  teamGifts: true,
  teamHeir: true,
  teamWin: true,
};

/**
 * Les règles d'équipe d'une partie. Une partie commencée avant leur arrivée n'a pas ces réglages : elle garde la règle
 * d'alors (loyer plein, pas de dons, pas d'héritage, chacun son classement).
 */
export function teamRules(s: { settings: Partial<CapitaleSettings> }) {
  return {
    rent: s.settings.teamRent ?? "full",
    gifts: s.settings.teamGifts ?? false,
    heir: s.settings.teamHeir ?? false,
    win: s.settings.teamWin ?? false,
  };
}

/** Le bâtiment spécial d'une rue, et qui l'a posé (le propriétaire, ou l'adversaire d'une nuisance) */
export interface Special {
  kind: SpecialKind;
  by: string;
}

export interface Deed {
  owner: string | null;
  mortgaged: boolean;
  /** Les terrains : leur niveau, de 0 (terrain nu) à 5 (le gratte-ciel) */
  level?: number;
  /** Les terrains : un bâtiment spécial au plus */
  special?: Special | null;
}

export interface CapitaleStats {
  rentEarned: number;
  rentPaid: number;
  bought: number;
  /** Niveaux ajoutés à ses rues */
  houses: number;
  /** Gratte-ciel atteints */
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
  | "bankrupt"
  | "special"
  | "ticket"
  | "gift";

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

/** Ce qu'un camp a réuni pour gagner au Monopole */
export interface MonopolyWin {
  kind: MonopolyKind;
  /** Les titres qui font la victoire (les quartiers complets, le côté, ou les gares) */
  squares: number[];
  /** Le côté du plateau (0 à 3), pour une victoire par un côté */
  side?: number;
}

/** Comment la partie s'est terminée, et qui l'emporte */
export interface Outcome {
  /** Monopole réuni, plus qu'un joueur (ou qu'une équipe) en jeu, l'heure, ou le garde-fou des tours */
  reason: "monopoly" | "bankrupt" | "time" | "rounds";
  /** Monopole : ce qui a été réuni, et par qui (le joueur dont le coup l'a fait) */
  monopoly?: MonopolyWin & { player: string };
  /** En équipes (victoire d'équipe) : l'équipe gagnante, ou null en cas d'égalité */
  team?: number | null;
  /** En équipes (victoire d'équipe) : la fortune de chaque équipe, faillis comptés à zéro */
  teamWorth?: Record<number, number>;
}

export interface CapitaleState {
  settings: CapitaleSettings;
  players: CapitalePlayer[];
  /**
   * Les équipes (tournée par équipes, ou table en équipes) : l'équipe de chacun. Quand il ne reste qu'une équipe en jeu,
   * la partie s'arrête ; les règles d'équipe (loyer, dons, héritage, victoire) s'y appliquent.
   */
  teams?: Teams;
  /** La fin de partie, une fois arrivée */
  outcome?: Outcome | null;
  /** Un titre par case achetable, null ailleurs */
  deeds: (Deed | null)[];
  /** Le tour en cours : les rues déjà améliorées (une fois chacune), et si le bâtiment spécial est posé */
  site: { turnId: number; upgraded: number[]; special: boolean };
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
  | { type: "upgrade"; player: string; square: number; level: number }
  /** Un niveau revendu à la banque */
  | { type: "sell"; player: string; square: number; level: number }
  | { type: "special"; player: string; square: number; kind: SpecialKind }
  /** Un bâtiment spécial enlevé : revendu par son propriétaire, une nuisance rasée à ses frais, ou d'office */
  | { type: "raze"; player: string; square: number; kind: SpecialKind; how: "sell" | "pay" | "auto" }
  | { type: "mortgage"; player: string; square: number }
  | { type: "unmortgage"; player: string; square: number }
  | { type: "card"; player: string; deck: DeckId; card: number }
  | { type: "jail"; player: string; reason: "square" | "card" | "doubles" }
  | { type: "leaveJail"; player: string; how: "pay" | "card" | "doubles" | "forced" }
  | { type: "debt"; player: string; amount: number; creditor: Account }
  | { type: "trade"; trade: Trade; status: "proposed" | "accepted" | "rejected" | "cancelled" | "expired" }
  /** Un don à un coéquipier : argent, titres, cartes de prison, sans contrepartie */
  | { type: "gift"; from: string; to: string; give: Offer }
  /** Arrêté chez un coéquipier : pas de loyer (la somme qu'aurait coûté la case) */
  | { type: "teamFree"; player: string; owner: string; square: number; amount: number }
  /** Faillite ; `to` reprend ses titres (le créancier, un coéquipier s'il hérite, ou la banque) */
  | { type: "bankrupt"; player: string; to: Account; heir?: boolean }
  /** Monopole réuni : la partie s'arrête net */
  | { type: "monopoly"; player: string; team: number | null; kind: MonopolyKind; squares: number[]; side?: number }
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
  | { type: "upgrade"; square: number }
  | { type: "sell"; square: number }
  | { type: "special"; square: number; kind: SpecialKind }
  | { type: "raze"; square: number }
  | { type: "mortgage"; square: number }
  | { type: "unmortgage"; square: number }
  | { type: "propose"; to: string; give: Offer; get: Offer; replaces?: number }
  | { type: "accept"; trade: number }
  | { type: "reject"; trade: number }
  | { type: "cancel"; trade: number }
  /** Donner à un coéquipier (règle des dons) */
  | { type: "gift"; to: string; give: Offer }
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

/** Le titre d'une case tel que la banque le vend : libre, et une parcelle vide pour les terrains */
function freshDeed(index: number): Deed | null {
  const sq = SQUARES[index]!;
  if (sq.price === undefined) return null;
  return sq.kind === "property" ? { owner: null, mortgaged: false, level: 0, special: null } : { owner: null, mortgaged: false };
}

export function createGame(
  playerIds: string[],
  settings: CapitaleSettings,
  seed: number,
  /** Les équipes de chacun, s'il y en a */
  teams: Teams = null,
): { state: CapitaleState; events: CapitaleEvent[] } {
  const holder: RngHolder = { rng: seed };
  const state: CapitaleState = {
    settings: { ...settings },
    teams: teams && playerIds.every((id) => teams[id] !== undefined) ? { ...teams } : null,
    outcome: null,
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
    deeds: SQUARES.map((s) => freshDeed(s.index)),
    site: { turnId: 0, upgraded: [], special: false },
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
    // Départ rapide : deux titres tirés au sort pour chacun, offerts par la banque. Au Monopole, jamais une partie gagnée
    // d'avance : on redistribue (une équipe de trois peut tirer les quatre gares)
    for (let attempt = 0; attempt < 30; attempt++) {
      for (const i of BUYABLE) state.deeds[i]!.owner = null;
      const pool = shuffle(state, [...BUYABLE]);
      for (const p of state.players) {
        for (let k = 0; k < 2; k++) {
          const sq = pool.pop();
          if (sq !== undefined) state.deeds[sq]!.owner = p.id;
        }
      }
      if (!settings.monopoly || state.players.every((p) => monopolyOf(state, p.id) === null)) break;
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

// ---------------------------------------------------------------------------
// Les équipes
// ---------------------------------------------------------------------------

/** L'équipe d'un joueur, ou null quand chacun joue pour soi */
export function teamOf(s: Pick<CapitaleState, "teams">, playerId: string | null | undefined): number | null {
  if (!playerId || !s.teams) return null;
  const t = s.teams[playerId];
  return t === undefined ? null : t;
}

/** La partie se joue-t-elle en équipes (au moins deux équipes, chacun dans la sienne) ? */
export function teamPlay(s: Pick<CapitaleState, "teams" | "players">): boolean {
  if (!s.teams) return false;
  const teams = s.players.map((p) => teamOf(s, p.id));
  return teams.every((t) => t !== null) && new Set(teams).size >= 2;
}

/** Deux joueurs du même camp : le même joueur, ou deux coéquipiers */
export function allies(s: Pick<CapitaleState, "teams" | "players">, a: string, b: string): boolean {
  if (a === b) return true;
  if (!teamPlay(s)) return false;
  const t = teamOf(s, a);
  return t !== null && t === teamOf(s, b);
}

/** Les coéquipiers d'un joueur (lui exclu), faillis compris */
export function teammates(s: CapitaleState, playerId: string): CapitalePlayer[] {
  return s.players.filter((p) => p.id !== playerId && allies(s, p.id, playerId));
}

/**
 * Le camp d'un joueur pour gagner : son équipe quand l'équipe gagne ensemble, sinon lui seul. Les titres d'un camp
 * comptent ensemble au Monopole.
 */
export function sideOf(s: CapitaleState, playerId: string): string {
  const t = teamOf(s, playerId);
  return t !== null && teamPlay(s) && teamRules(s).win ? `team:${t}` : playerId;
}

/** Le loyer d'un coéquipier : 0 (gratuit), la moitié ou tout ; 1 entre adversaires */
export function rentFactor(s: CapitaleState, payer: string, owner: string): number {
  if (payer === owner || !allies(s, payer, owner)) return 1;
  const rent = teamRules(s).rent;
  return rent === "free" ? 0 : rent === "half" ? 0.5 : 1;
}

/** Ce que paierait ce joueur en s'arrêtant sur cette case (0 chez soi, tarif d'équipe chez un coéquipier) */
export function rentDue(s: CapitaleState, index: number, payer: string, ctx: RentContext): number {
  const owner = s.deeds[index]?.owner;
  if (!owner || owner === payer) return 0;
  return Math.floor(rentFor(s, index, ctx) * rentFactor(s, payer, owner));
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

/** Le niveau d'une rue (0 ailleurs) */
export const levelOf = (s: CapitaleState, index: number) => s.deeds[index]?.level ?? 0;

/** Le bâtiment spécial du propriétaire sur sa propre rue (pas une nuisance subie) */
export function ownSpecial(s: CapitaleState, index: number): SpecialKind | null {
  const d = s.deeds[index];
  return d?.special && d.special.by === d.owner ? d.special.kind : null;
}

/** La nuisance posée sur une rue, s'il y en a une */
export function nuisanceOn(s: CapitaleState, index: number): SpecialKind | null {
  const k = s.deeds[index]?.special?.kind;
  return k && SPECIALS[k].nuisance ? k : null;
}

/** Les bâtiments spéciaux d'un quartier, rue par rue */
export function districtSpecials(s: CapitaleState, group: GroupId): (Special & { square: number })[] {
  return GROUPS[group].squares.flatMap((i) => {
    const sp = s.deeds[i]!.special;
    return sp ? [{ ...sp, square: i }] : [];
  });
}

/** Ce qu'ont coûté les niveaux et les bâtiments spéciaux d'un joueur sur ses rues */
function buildingsValue(s: CapitaleState, playerId: string): number {
  let total = 0;
  for (const i of ownedBy(s, playerId)) {
    total += levelOf(s, i) * upgradeCost(i);
    const own = ownSpecial(s, i);
    if (own) total += specialPrice(own, i);
  }
  return total;
}

/** La fortune : argent, titres (moitié s'ils sont hypothéqués) et bâtiments au prix coûtant */
export function netWorth(s: CapitaleState, playerId: string): number {
  const p = playerOf(s, playerId);
  if (!p || p.bankrupt) return 0;
  let total = p.cash + buildingsValue(s, playerId);
  for (const i of ownedBy(s, playerId)) total += s.deeds[i]!.mortgaged ? mortgageValue(i) : SQUARES[i]!.price!;
  return total;
}

/** Ce que rapporterait la vente de tout (bâtiments à moitié prix, hypothèques) : de quoi payer une dette */
export function liquidity(s: CapitaleState, playerId: string): number {
  const p = playerOf(s, playerId);
  if (!p) return 0;
  let total = p.cash + buildingsValue(s, playerId) / 2;
  for (const i of ownedBy(s, playerId)) if (!s.deeds[i]!.mortgaged) total += mortgageValue(i);
  return Math.floor(total);
}

// ---------------------------------------------------------------------------
// Monopole : trois quartiers complets, un côté entier ou les quatre gares
// ---------------------------------------------------------------------------

/** Ce qu'a réuni ce camp, ou null ; `extra` compte une case de plus comme à lui (pour savoir ce qui le ferait gagner) */
function monopolyHeld(s: CapitaleState, side: string, extra?: number): MonopolyWin | null {
  const held = (i: number) => {
    if (i === extra) return true;
    const owner = s.deeds[i]?.owner;
    return Boolean(owner && !playerOf(s, owner)?.bankrupt && sideOf(s, owner) === side);
  };
  const groups = GROUP_ORDER.filter((g) => GROUPS[g].squares.every(held));
  if (groups.length >= MONOPOLY_GROUPS) return { kind: "groups", squares: groups.flatMap((g) => GROUPS[g].squares) };
  const side4 = SIDES.findIndex((x) => x.squares.every(held));
  if (side4 >= 0) return { kind: "side", squares: [...SIDES[side4]!.squares], side: side4 };
  if (STATIONS.every(held)) return { kind: "stations", squares: [...STATIONS] };
  return null;
}

/** Ce qu'a réuni le camp de ce joueur (lui, ou son équipe quand elle gagne ensemble), ou null */
export function monopolyOf(s: CapitaleState, playerId: string): MonopolyWin | null {
  return monopolyHeld(s, sideOf(s, playerId));
}

export interface MonopolyProgress {
  /** Les quartiers complets du camp */
  groups: GroupId[];
  /** Pour chaque côté : les rues du camp et celles qui manquent */
  sides: { have: number; total: number; missing: number[] }[];
  /** Les gares du camp et celles qui manquent */
  stations: { have: number; missing: number[] };
  /** Les titres dont un seul suffirait à faire gagner ce camp tout de suite */
  winning: number[];
  /** Combien de titres lui manquent, au mieux, pour gagner */
  closest: number;
}

/** Où en est le camp de ce joueur des objectifs du Monopole */
export function monopolyProgress(s: CapitaleState, playerId: string): MonopolyProgress {
  const side = sideOf(s, playerId);
  const held = (i: number) => {
    const owner = s.deeds[i]?.owner;
    return Boolean(owner && !playerOf(s, owner)?.bankrupt && sideOf(s, owner) === side);
  };
  const groups = GROUP_ORDER.filter((g) => GROUPS[g].squares.every(held));
  const sides = SIDES.map((x) => ({
    have: x.squares.filter(held).length,
    total: x.squares.length,
    missing: x.squares.filter((i) => !held(i)),
  }));
  const stations = { have: STATIONS.filter(held).length, missing: STATIONS.filter((i) => !held(i)) };
  // Au mieux : les quartiers les plus proches d'être complets, le côté le plus avancé, ou les gares
  const gaps = GROUP_ORDER.map((g) => GROUPS[g].squares.filter((i) => !held(i)).length)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const groupsGap = gaps.slice(0, Math.max(0, MONOPOLY_GROUPS - groups.length)).reduce((n, k) => n + k, 0);
  const closest = Math.min(groupsGap, ...sides.map((x) => x.missing.length), stations.missing.length);
  const winning = closest === 1 ? BUYABLE.filter((i) => !held(i) && monopolyHeld(s, side, i) !== null) : [];
  return { groups, sides, stations, winning, closest };
}

/** Un camp vient-il de réunir son Monopole ? La partie s'arrête net (en commençant par le camp de celui qui a joué) */
function checkMonopoly(s: CapitaleState, events: CapitaleEvent[], actor?: string) {
  if (!s.settings.monopoly || s.step === "over") return;
  const order = [...s.players].sort((a, b) => Number(b.id === actor) - Number(a.id === actor));
  for (const p of order) {
    if (p.bankrupt) continue;
    const win = monopolyOf(s, p.id);
    if (!win) continue;
    const team = sideOf(s, p.id) === p.id ? null : teamOf(s, p.id);
    events.push({
      type: "monopoly",
      player: p.id,
      team,
      kind: win.kind,
      squares: win.squares,
      ...(win.side !== undefined ? { side: win.side } : {}),
    });
    finishGame(s, events, "monopoly", { ...win, player: p.id });
    return;
  }
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
    // Le niveau, sinon le terrain nu (doublé avec tout le quartier) ; une centrale ramène au terrain nu, une décharge
    // divise par deux, le monument du propriétaire double tout le quartier
    const full = ownsGroup(s, deed.owner, sq.group!);
    const nuisance = nuisanceOn(s, index);
    const level = nuisance === "centrale" ? 0 : levelOf(s, index);
    let rent = level > 0 ? sq.rents![level]! : sq.rents![0] * (full ? 2 : 1);
    if (nuisance === "decharge") rent = Math.floor(rent / 2);
    if (full && districtSpecials(s, sq.group!).some((b) => b.kind === "monument" && b.by === deed.owner)) rent *= 2;
    return rent;
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
  if (steps > 0 && s.settings.specials) payTickets(s, p, from, steps, events);
}

/** Les stades sur le chemin (case d'arrivée comprise) : un billet pour chacun, à son propriétaire */
function payTickets(s: CapitaleState, p: CapitalePlayer, from: number, steps: number, events: CapitaleEvent[]) {
  for (let k = 1; k <= steps; k++) {
    const i = (from + k) % 40;
    const d = s.deeds[i];
    if (!d?.owner || d.owner === p.id || d.mortgaged || ownSpecial(s, i) !== "stade") continue;
    const owner = playerOf(s, d.owner);
    if (!owner || owner.bankrupt || (s.settings.noRentInJail && owner.inJail)) continue;
    // Un coéquipier paie le tarif d'équipe (rien quand le loyer entre coéquipiers est gratuit)
    const ticket = Math.floor(STADIUM_TICKET * rentFactor(s, p.id, owner.id));
    if (ticket > 0) charge(s, p, owner.id, ticket, "ticket", events, i);
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
      const factor = rentFactor(s, p.id, deed.owner);
      // Chez un coéquipier : rien à payer (loyer gratuit), ou la moitié
      if (factor === 0) {
        if (rent > 0) events.push({ type: "teamFree", player: p.id, owner: deed.owner, square: sq.index, amount: rent });
        return;
      }
      charge(s, p, deed.owner, Math.floor(rent * factor), "rent", events, sq.index);
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
      // Comme la règle classique : un gratte-ciel compte comme un hôtel, les autres niveaux comme des maisons
      let levels = 0;
      let towers = 0;
      for (const i of ownedBy(s, p.id)) {
        const l = levelOf(s, i);
        if (l === MAX_LEVEL) towers += 1;
        else levels += l;
      }
      charge(s, p, taxAccount(s), levels * effect.level + towers * effect.tower, "card", events);
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
    finishGame(s, events, s.timeUp ? "time" : "rounds");
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
  if (s.round > MAX_ROUNDS) finishGame(s, events, "rounds");
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

/** Le bâtiment spécial du tour est-il déjà posé ? */
export function specialUsed(s: CapitaleState): boolean {
  return s.site.turnId === s.turnId && s.site.special;
}

/** Cette rue a-t-elle déjà été améliorée ce tour-ci ? */
export function upgradedThisTurn(s: CapitaleState, index: number): boolean {
  return s.site.turnId === s.turnId && s.site.upgraded.includes(index);
}

export function hasStadium(s: CapitaleState, playerId: string): boolean {
  return ownedBy(s, playerId).some((i) => ownSpecial(s, i) === "stade");
}

/** Peut-on améliorer cette rue d'un niveau ? Une fois par tour ; au-delà du niveau 3, il faut tout le quartier */
export function canUpgrade(s: CapitaleState, playerId: string, index: number): string | null {
  const sq = SQUARES[index];
  const deed = s.deeds[index];
  if (!sq || sq.kind !== "property" || !deed) return "On n'améliore que les rues.";
  if (deed.owner !== playerId) return "Cette rue n'est pas à toi.";
  if (deed.mortgaged) return "Cette rue est hypothéquée.";
  const level = deed.level ?? 0;
  if (level >= MAX_LEVEL) return "Le gratte-ciel est déjà là : c'est le plus haut niveau.";
  if (level >= FREE_LEVELS && !ownsGroup(s, playerId, sq.group!))
    return `Pour monter plus haut, il faut tout le quartier ${GROUPS[sq.group!].name.toLowerCase()}.`;
  if (upgradedThisTurn(s, index)) return "Une amélioration par rue et par tour.";
  if (playerOf(s, playerId)!.cash < upgradeCost(index)) return `Il faut ${upgradeCost(index)}.`;
  return null;
}

/** Peut-on revendre un niveau de cette rue ? À moitié prix */
export function canSell(s: CapitaleState, playerId: string, index: number): string | null {
  const deed = s.deeds[index];
  if (!deed || deed.owner !== playerId) return "Cette rue n'est pas à toi.";
  if (!deed.level) return "Il n'y a rien à revendre ici.";
  return null;
}

/** Peut-on poser ce bâtiment spécial sur cette rue ? Une nuisance chez un adversaire, le reste chez soi */
export function canPlaceSpecial(s: CapitaleState, playerId: string, index: number, kind: SpecialKind): string | null {
  if (!s.settings.specials) return "Les bâtiments spéciaux ne sont pas de la partie.";
  const sq = SQUARES[index];
  const deed = s.deeds[index];
  if (!isSpecialKind(kind) || !sq || sq.kind !== "property" || !deed) return "Les bâtiments spéciaux se posent sur une rue.";
  const info = SPECIALS[kind];
  if (specialUsed(s)) return "Un seul bâtiment spécial par tour.";
  if (deed.special) return "Cette rue a déjà son bâtiment spécial.";
  if (deed.mortgaged) return "Cette rue est hypothéquée.";
  const here = districtSpecials(s, sq.group!);
  if (info.nuisance) {
    if (!deed.owner || deed.owner === playerId) return "Une nuisance se pose chez un adversaire.";
    if (allies(s, playerId, deed.owner)) return "Pas de nuisance chez un coéquipier.";
    if (here.some((b) => b.kind === "parc")) return "Un parc protège ce quartier.";
  } else {
    if (deed.owner !== playerId) return "Cette rue n'est pas à toi.";
    if (kind === "monument" && !ownsGroup(s, playerId, sq.group!)) return "Il faut tout le quartier pour un monument.";
    if (kind === "monument" && here.some((b) => b.kind === "monument")) return "Le quartier a déjà son monument.";
    if (kind === "parc" && here.some((b) => b.kind === "parc")) return "Le quartier a déjà son parc.";
    if (kind === "parc" && here.some((b) => SPECIALS[b.kind].nuisance)) return "Fais d'abord raser la nuisance du quartier.";
    if (kind === "stade" && hasStadium(s, playerId)) return "Tu as déjà un stade.";
  }
  const price = specialPrice(kind, index);
  if (playerOf(s, playerId)!.cash < price) return `Il faut ${price}.`;
  return null;
}

/** Peut-on enlever le bâtiment spécial de sa rue ? Le sien se revend à moitié prix, une nuisance se fait raser à ses frais */
export function canRaze(s: CapitaleState, playerId: string, index: number): string | null {
  const deed = s.deeds[index];
  const sp = deed?.special;
  if (!deed || !sp) return "Il n'y a pas de bâtiment spécial ici.";
  if (deed.owner !== playerId) return "Cette rue n'est pas à toi.";
  const cost = specialPrice(sp.kind, index);
  if (SPECIALS[sp.kind].nuisance && playerOf(s, playerId)!.cash < cost) return `Il faut ${cost} pour faire raser ${SPECIALS[sp.kind].the}.`;
  return null;
}

export function canMortgage(s: CapitaleState, playerId: string, index: number): string | null {
  const deed = s.deeds[index];
  if (!deed || deed.owner !== playerId) return "Ce titre n'est pas à toi.";
  if (deed.mortgaged) return "Déjà hypothéqué.";
  if (deed.level) return "Revends d'abord les niveaux de la rue.";
  const own = ownSpecial(s, index);
  if (own) return `Revends d'abord ${SPECIALS[own].the}.`;
  return null;
}

function touchSite(s: CapitaleState) {
  if (s.site.turnId !== s.turnId) s.site = { turnId: s.turnId, upgraded: [], special: false };
}

function upgrade(s: CapitaleState, p: CapitalePlayer, index: number, events: CapitaleEvent[]) {
  const deed = s.deeds[index]!;
  pay(s, p.id, "bank", upgradeCost(index), "build", events, index);
  deed.level = (deed.level ?? 0) + 1;
  touchSite(s);
  s.site.upgraded.push(index);
  p.stats.houses += 1;
  if (deed.level === MAX_LEVEL) p.stats.hotels += 1;
  events.push({ type: "upgrade", player: p.id, square: index, level: deed.level });
}

function sellLevel(s: CapitaleState, p: CapitalePlayer, index: number, events: CapitaleEvent[]) {
  const deed = s.deeds[index]!;
  deed.level = Math.max(0, (deed.level ?? 0) - 1);
  pay(s, "bank", p.id, Math.floor(upgradeCost(index) / 2), "sell", events, index);
  events.push({ type: "sell", player: p.id, square: index, level: deed.level });
}

function placeSpecial(s: CapitaleState, p: CapitalePlayer, index: number, kind: SpecialKind, events: CapitaleEvent[]) {
  pay(s, p.id, "bank", specialPrice(kind, index), "special", events, index);
  s.deeds[index]!.special = { kind, by: p.id };
  touchSite(s);
  s.site.special = true;
  events.push({ type: "special", player: p.id, square: index, kind });
}

/** Enlever le bâtiment spécial d'une rue : revendu à moitié prix, une nuisance rasée aux frais du propriétaire, ou d'office */
function raze(s: CapitaleState, p: CapitalePlayer, index: number, how: "sell" | "pay" | "auto", events: CapitaleEvent[]) {
  const deed = s.deeds[index]!;
  const kind = deed.special!.kind;
  const price = specialPrice(kind, index);
  if (how === "pay") pay(s, p.id, "bank", price, "special", events, index);
  else if (how === "sell") pay(s, "bank", p.id, Math.floor(price / 2), "sell", events, index);
  deed.special = null;
  events.push({ type: "raze", player: p.id, square: index, kind, how });
}

/** La nuisance qu'un joueur (ou un coéquipier) avait posée sur une rue qui devient la sienne disparaît */
function dropOwnNuisance(s: CapitaleState, index: number, events: CapitaleEvent[]) {
  const d = s.deeds[index];
  if (d?.owner && d.special && SPECIALS[d.special.kind].nuisance && allies(s, d.special.by, d.owner))
    raze(s, playerOf(s, d.owner)!, index, "auto", events);
}

// ---------------------------------------------------------------------------
// Échanges
// ---------------------------------------------------------------------------

const sanitizeOffer = (o: Offer): Offer => ({
  cash: Math.max(0, Math.floor(Number(o?.cash) || 0)),
  squares: [...new Set((Array.isArray(o?.squares) ? o.squares : []).map(Number).filter((i) => Number.isInteger(i)))].slice(0, 28),
  jailCards: Math.max(0, Math.floor(Number(o?.jailCards) || 0)),
});

/** Ce qui empêche de céder un titre : ses propres bâtiments sur la rue, ou un gratte-ciel dans son quartier */
export function tradeProblem(s: CapitaleState, playerId: string, index: number): string | null {
  const deed = s.deeds[index];
  if (!deed || deed.owner !== playerId) return `${SQUARES[index]?.name ?? "Ce titre"} n'appartient pas à ce joueur.`;
  const name = SQUARES[index]!.name;
  if (levelOf(s, index) > 0) return `${name} est construite : il faut d'abord revendre ses niveaux.`;
  const own = ownSpecial(s, index);
  if (own) return `Il faut d'abord revendre ${SPECIALS[own].the} de ${name}.`;
  const g = groupOf(index);
  if (g && districtSpecials(s, g.id).some((b) => b.kind === "monument"))
    return `Il y a un monument dans le quartier de ${name} : il faut le revendre avant.`;
  return null;
}

export function offerProblem(s: CapitaleState, playerId: string, offer: Offer): string | null {
  const p = playerOf(s, playerId);
  if (!p || p.bankrupt) return "Ce joueur n'est plus dans la partie.";
  if (offer.cash > p.cash) return `${offer.cash} demandés, mais il n'y a que ${p.cash} en caisse.`;
  if (offer.jailCards > p.jailCards.length) return "Pas assez de cartes « sortie de prison ».";
  for (const i of offer.squares) {
    const problem = tradeProblem(s, playerId, i);
    if (problem) return problem;
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
  for (const i of [...t.give.squares, ...t.get.squares]) dropOwnNuisance(s, i, events);
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
// Les dons entre coéquipiers
// ---------------------------------------------------------------------------

/** Peut-on faire ce don ? À un coéquipier encore en jeu, hors enchère, sans dette à régler soi-même */
export function giftProblem(s: CapitaleState, from: string, to: string, give: Offer): string | null {
  if (!teamPlay(s) || !teamRules(s).gifts) return "Les dons entre coéquipiers ne sont pas de la partie.";
  if (s.step === "over") return "La partie est finie.";
  const other = playerOf(s, to);
  if (!other || other.bankrupt || to === from || !allies(s, from, to)) return "On ne donne qu'à un coéquipier encore en jeu.";
  if (s.step === "auction") return "Pas de don pendant une enchère.";
  if (s.debts.some((d) => d.debtor === from)) return "Règle d'abord ta dette.";
  if (isEmpty(give)) return "Le don est vide.";
  const problem = offerProblem(s, from, give);
  if (problem) return problem;
  if (interestOn(s, give.squares) > other.cash + give.cash)
    return "Ton coéquipier n'a pas de quoi payer les 10 % d'intérêts des titres hypothéqués.";
  return null;
}

function executeGift(s: CapitaleState, from: CapitalePlayer, to: CapitalePlayer, give: Offer, events: CapitaleEvent[]) {
  events.push({ type: "gift", from: from.id, to: to.id, give });
  if (give.cash > 0) pay(s, from.id, to.id, give.cash, "gift", events);
  for (const i of give.squares) s.deeds[i]!.owner = to.id;
  for (let k = 0; k < give.jailCards; k++) {
    const card = from.jailCards.shift();
    if (card) to.jailCards.push(card);
  }
  for (const i of give.squares) dropOwnNuisance(s, i, events);
  // Comme à un échange : un titre hypothéqué reçu coûte 10 % d'intérêts tout de suite
  const interest = interestOn(s, give.squares);
  if (interest > 0) pay(s, to.id, "bank", interest, "interest", events);
  to.stats.monopolies = Math.max(to.stats.monopolies, monopoliesOf(s, to.id));
}

// ---------------------------------------------------------------------------
// Faillite et fin
// ---------------------------------------------------------------------------

function goBankrupt(s: CapitaleState, p: CapitalePlayer, creditor: Account, events: CapitaleEvent[]) {
  const wasCurrent = currentPlayer(s) === p;
  // Ses niveaux et ses bâtiments spéciaux sont rachetés par la banque à moitié prix ; ses nuisances chez les autres disparaissent
  for (const i of ownedBy(s, p.id)) {
    while (levelOf(s, i) > 0) sellLevel(s, p, i, events);
    if (ownSpecial(s, i)) raze(s, p, i, "sell", events);
  }
  for (const i of BUYABLE) if (s.deeds[i]!.special?.by === p.id) raze(s, p, i, "auto", events);
  const found = creditor !== "bank" && creditor !== "pot" ? playerOf(s, creditor) : undefined;
  const live = found && !found.bankrupt ? found : undefined;
  // Héritage d'équipe : le plus riche des coéquipiers encore en jeu reprend ses titres ; un créancier adverse ne touche
  // que l'argent qui reste
  const ally =
    teamPlay(s) && teamRules(s).heir && !(live && allies(s, live.id, p.id))
      ? teammates(s, p.id)
          .filter((x) => !x.bankrupt)
          .sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id))[0]
      : undefined;
  const heir = ally ?? live;
  if (p.cash > 0) pay(s, p.id, live ? live.id : "bank", p.cash, "bankrupt", events);
  if (heir) {
    for (const i of ownedBy(s, p.id)) {
      s.deeds[i]!.owner = heir.id;
      dropOwnNuisance(s, i, events);
    }
    heir.jailCards.push(...p.jailCards);
    heir.stats.monopolies = Math.max(heir.stats.monopolies, monopoliesOf(s, heir.id));
  } else {
    // Les titres redeviennent libres
    for (const i of ownedBy(s, p.id)) s.deeds[i] = freshDeed(i);
    for (const deck of p.jailCards) s.decks[deck].push(JAIL_CARD_INDEX[deck]);
  }
  if (live) live.stats.bankrupted += 1;
  p.jailCards = [];
  p.cash = 0;
  p.bankrupt = true;
  p.inJail = false;
  s.eliminated.push(p.id);
  s.debts = s.debts.filter((d) => d.debtor !== p.id);
  s.trades = s.trades.filter((t) => t.from !== p.id && t.to !== p.id);
  if (s.auction && !s.auction.out.includes(p.id)) s.auction.out.push(p.id);
  events.push({ type: "bankrupt", player: p.id, to: heir ? heir.id : "bank", ...(ally ? { heir: true } : {}) });
  const alive = s.players.filter((x) => !x.bankrupt);
  if (
    alive.length <= 1 ||
    oneTeamLeft(
      s.teams,
      alive.map((x) => x.id),
    )
  ) {
    finishGame(s, events, "bankrupt");
    return;
  }
  if (wasCurrent) {
    s.pendingBuy = null;
    s.rollAgain = false;
    nextTurn(s, events);
  }
}

function finishGame(s: CapitaleState, events: CapitaleEvent[], reason: Outcome["reason"], monopoly?: MonopolyWin & { player: string }) {
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
  const outcome: Outcome = { reason, ...(monopoly ? { monopoly } : {}) };
  const ranks: Record<string, number> = {};
  let ranking: string[];
  const byWorth = (a: CapitalePlayer, b: CapitalePlayer) => b.stats.netWorth - a.stats.netWorth;
  if (teamPlay(s) && teamRules(s).win) {
    // Victoire d'équipe : les équipes se classent (le Monopole d'abord, puis celles encore en jeu par fortune, puis les
    // autres par ordre de sortie) et chacun prend le rang de la sienne
    const team = (p: CapitalePlayer) => teamOf(s, p.id)!;
    const ids = [...new Set(s.players.map(team))];
    const members = (t: number) => s.players.filter((p) => team(p) === t);
    const worth: Record<number, number> = Object.fromEntries(ids.map((t) => [t, members(t).reduce((n, p) => n + p.stats.netWorth, 0)]));
    const alive = (t: number) => members(t).some((p) => !p.bankrupt);
    const lastOut = (t: number) => Math.max(...members(t).map((p) => s.eliminated.indexOf(p.id)));
    const winner = monopoly ? teamOf(s, monopoly.player) : null;
    const order = [...ids].sort(
      (a, b) =>
        Number(b === winner) - Number(a === winner) ||
        Number(alive(b)) - Number(alive(a)) ||
        (alive(a) ? worth[b]! - worth[a]! : lastOut(b) - lastOut(a)),
    );
    const teamRank: Record<number, number> = {};
    let ahead = 0;
    order.forEach((t, k) => {
      const prev = order[k - 1];
      const tie = prev !== undefined && prev !== winner && alive(prev) && alive(t) && worth[prev] === worth[t];
      teamRank[t] = tie ? teamRank[prev]! : ahead + 1;
      ahead += members(t).length;
    });
    const out = (p: CapitalePlayer) => s.eliminated.indexOf(p.id);
    ranking = order.flatMap((t) =>
      members(t)
        .sort((a, b) => Number(a.bankrupt) - Number(b.bankrupt) || (a.bankrupt ? out(b) - out(a) : byWorth(a, b)))
        .map((p) => p.id),
    );
    for (const p of s.players) ranks[p.id] = teamRank[team(p)]!;
    const top = order.filter((t) => teamRank[t] === 1);
    outcome.team = top.length === 1 ? top[0]! : null;
    outcome.teamWorth = worth;
  } else {
    // Chacun pour soi : le Monopole d'abord, puis les joueurs encore en jeu par fortune, puis les faillis
    const winner = monopoly?.player ?? null;
    const alive = s.players.filter((p) => !p.bankrupt).sort((a, b) => Number(b.id === winner) - Number(a.id === winner) || byWorth(a, b));
    const out = [...s.eliminated].reverse();
    ranking = [...alive.map((p) => p.id), ...out];
    alive.forEach((p, i) => {
      const prev = alive[i - 1];
      ranks[p.id] = prev && prev.id !== winner && prev.stats.netWorth === p.stats.netWorth ? ranks[prev.id]! : i + 1;
    });
    out.forEach((id, i) => (ranks[id] = alive.length + i + 1));
  }
  s.ranking = ranking;
  s.ranks = ranks;
  s.outcome = outcome;
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
  const winner = s.auction.high?.player;
  closeAuctionInner(s, events);
  settleDebts(s, events);
  checkMonopoly(s, events, winner);
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
    case "upgrade": {
      if (manageRight(s, playerId) !== "full") return fail("Tu améliores tes rues pendant ton tour.");
      const problem = canUpgrade(s, playerId, action.square);
      if (problem) return fail(problem);
      upgrade(s, p, action.square, events);
      break;
    }
    case "sell": {
      if (!manageRight(s, playerId)) return fail("Tu revends pendant ton tour.");
      const problem = canSell(s, playerId, action.square);
      if (problem) return fail(problem);
      sellLevel(s, p, action.square, events);
      break;
    }
    case "special": {
      if (manageRight(s, playerId) !== "full") return fail("Tu poses un bâtiment spécial pendant ton tour.");
      const problem = canPlaceSpecial(s, playerId, action.square, action.kind);
      if (problem) return fail(problem);
      placeSpecial(s, p, action.square, action.kind, events);
      break;
    }
    case "raze": {
      if (!manageRight(s, playerId)) return fail("Tu t'occupes de tes bâtiments pendant ton tour.");
      const problem = canRaze(s, playerId, action.square);
      if (problem) return fail(problem);
      const nuisance = SPECIALS[s.deeds[action.square]!.special!.kind].nuisance;
      if (nuisance && manageRight(s, playerId) !== "full") return fail("Tu fais raser une nuisance pendant ton tour.");
      raze(s, p, action.square, nuisance ? "pay" : "sell", events);
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
    case "gift": {
      const give = sanitizeOffer(action.give);
      const problem = giftProblem(s, playerId, action.to, give);
      if (problem) return fail(problem);
      executeGift(s, p, playerOf(s, action.to)!, give, events);
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
  checkMonopoly(s, events, playerId);
  resume(s);
  return { ok: true, events };
}
