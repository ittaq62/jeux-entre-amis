// Capitale : les bots. Facile achète un peu au hasard et garde peu de réserve ; Moyen est raisonnable ;
// Fort valorise les groupes complets, bloque ceux des autres, bâtit vite, pose ses nuisances chez le plus riche et négocie.
// Aucune décision ne tire sur le hasard de la partie : le doute de Facile vient d'un calcul sur l'état.

import {
  BUILDINGS,
  buildingPrice,
  BUYABLE,
  GROUP_ORDER,
  GROUPS,
  groupOf,
  mortgageInterest,
  mortgageValue,
  SQUARES,
  STATIONS,
  unmortgageCost,
  type BuildingKind,
} from "./board.ts";
import {
  buildCost,
  canBuild,
  canMortgage,
  canRaze,
  districtBuildings,
  floorsLeft,
  floorsOf,
  hasStadium,
  liquidity,
  nuisanceOn,
  ownBuildings,
  ownedBy,
  ownsGroup,
  playerOf,
  rentFor,
  specialUsed,
  tradeProblem,
  type BotLevel,
  type CapitaleAction,
  type CapitaleState,
  type Offer,
  type Trade,
} from "./engine.ts";

/** L'ordre des cases où les bots posent : les maisons devant, les grands bâtiments au fond */
const FRONT_FIRST = [0, 1, 2, 3];
const BACK_FIRST = [2, 3, 0, 1];

/** Un nombre entre 0 et 1 propre à la situation, sans toucher au hasard de la partie */
function doubt(s: CapitaleState, salt: number): number {
  let h = (s.turnId * 2654435761 + s.decision * 40503 + salt * 97) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return (h % 1000) / 1000;
}

/** Le pire loyer qu'on risque sur le plateau : on garde de quoi le payer */
function danger(s: CapitaleState, playerId: string): number {
  let worst = 0;
  for (const i of BUYABLE) {
    const d = s.deeds[i]!;
    if (!d.owner || d.owner === playerId) continue;
    worst = Math.max(worst, rentFor(s, i, { diceTotal: 8 }));
  }
  return worst;
}

function reserve(s: CapitaleState, playerId: string, level: BotLevel): number {
  const risk = danger(s, playerId);
  if (level === "facile") return 180;
  // Ce que coûterait la pire carte de travaux : sans cette marge, on revend à moitié prix puis on rebâtit
  let repairs = 0;
  for (const i of ownedBy(s, playerId)) {
    for (const b of ownBuildings(s, i)) repairs += b.kind === "gratte" ? 115 : BUILDINGS[b.kind].floors * 20;
  }
  if (level === "moyen") return Math.min(400, 80 + risk * 0.4) + repairs * 0.5;
  return Math.min(500, 40 + risk * 0.6) + repairs * 0.6;
}

/** Un titre hors des groupes complets, le moins utile d'abord : ce qu'on hypothèque pour financer mieux */
function looseToMortgage(s: CapitaleState, playerId: string, level: BotLevel, except?: number): number | null {
  const loose = ownedBy(s, playerId)
    .filter((i) => i !== except && canMortgage(s, playerId, i) === null)
    .filter((i) => {
      const g = groupOf(i);
      return !(g && ownsGroup(s, playerId, g.id));
    })
    .sort((a, b) => valueFor(s, playerId, a, level) - valueFor(s, playerId, b, level));
  return loose[0] ?? null;
}

/** Combien vaut une case pour ce joueur : le prix, plus s'il complète un groupe ou en bloque un */
export function valueFor(s: CapitaleState, playerId: string, index: number, level: BotLevel = "moyen"): number {
  const sq = SQUARES[index]!;
  let v = sq.price ?? 0;
  if (sq.kind === "property") {
    const g = GROUPS[sq.group!];
    const others = g.squares.filter((i) => i !== index);
    const mine = others.filter((i) => s.deeds[i]!.owner === playerId).length;
    const owners = new Set(others.map((i) => s.deeds[i]!.owner).filter((o): o is string => Boolean(o) && o !== playerId));
    if (mine === others.length) v *= level === "fort" ? 3 : level === "moyen" ? 2.2 : 1.5;
    else if (owners.size === 1 && others.every((i) => s.deeds[i]!.owner && s.deeds[i]!.owner !== playerId)) {
      // Un seul autre joueur a tout le reste : prendre cette case lui bloque le groupe
      v *= level === "fort" ? 1.6 : 1.25;
    } else if (mine > 0) v *= 1.3;
  } else if (sq.kind === "station") {
    const mine = STATIONS.filter((i) => i !== index && s.deeds[i]!.owner === playerId).length;
    v *= 1 + 0.3 * mine;
  } else if (sq.kind === "utility") {
    v *= 0.85;
  }
  if (s.deeds[index]?.mortgaged) v -= mortgageValue(index) + mortgageInterest(index);
  return Math.max(0, Math.round(v));
}

/** Ce que coûte de céder une case : sa valeur pour soi, et plus si elle complète le groupe de celui qui la reçoit */
function costOfGiving(s: CapitaleState, from: string, to: string, index: number, level: BotLevel): number {
  let v = valueFor(s, from, index, level);
  const g = groupOf(index);
  if (g) {
    const rest = g.squares.filter((i) => i !== index);
    if (rest.every((i) => s.deeds[i]!.owner === to))
      v += (SQUARES[index]!.price ?? 0) * (level === "fort" ? 3 : level === "moyen" ? 2 : 0.8);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Le coup à jouer quand c'est au bot de décider
// ---------------------------------------------------------------------------

export function botAction(s: CapitaleState, playerId: string, level: BotLevel, opts: { allowTrade?: boolean } = {}): CapitaleAction | null {
  const p = playerOf(s, playerId);
  if (!p || p.bankrupt) return null;
  if (s.step === "debt") return s.debts[0]?.debtor === playerId ? raiseMoney(s, playerId, level) : null;
  if (s.players[s.turn]!.id !== playerId) return null;
  switch (s.step) {
    case "roll": {
      if (p.inJail) {
        const free = BUYABLE.filter((i) => !s.deeds[i]!.owner).length;
        const leave =
          level === "fort" ? free > 8 && danger(s, playerId) < 400 : level === "moyen" ? free > 4 && p.cash > 400 : doubt(s, 1) < 0.3;
        if (leave && p.jailCards.length > 0) return { type: "useJailCard" };
        if (leave && p.cash > 200) return { type: "payJail" };
      }
      return { type: "roll" };
    }
    case "buy": {
      const index = s.pendingBuy!;
      const price = SQUARES[index]!.price!;
      const value = valueFor(s, playerId, index, level);
      const keen = value > price * 1.4;
      if (p.cash < price) {
        // Fort hypothèque un titre isolé pour s'offrir celui qui complète (ou bloque) un groupe
        if (level === "fort" && keen) {
          const m = looseToMortgage(s, playerId, level, index);
          if (m !== null) return { type: "mortgage", square: m };
        }
        return { type: "decline" };
      }
      const left = p.cash - price;
      const buy =
        level === "facile"
          ? left >= reserve(s, playerId, level) && doubt(s, 2) < 0.7
          : level === "moyen"
            ? left >= reserve(s, playerId, level) || (keen && left >= 50)
            : left >= reserve(s, playerId, level) || keen;
      return buy ? { type: "buy" } : { type: "decline" };
    }
    case "manage":
      return manage(s, playerId, level, opts.allowTrade ?? false) ?? { type: "endTurn" };
    default:
      return null;
  }
}

/** Gestion de fin de tour : lever des hypothèques, bâtir, poser un bâtiment spécial, éventuellement proposer un échange */
function manage(s: CapitaleState, playerId: string, level: BotLevel, allowTrade: boolean): CapitaleAction | null {
  const p = playerOf(s, playerId)!;
  const keep = reserve(s, playerId, level);
  // D'abord les hypothèques des groupes complets : un quartier complet rapporte le double
  for (const i of ownedBy(s, playerId)) {
    const d = s.deeds[i]!;
    const g = groupOf(i);
    if (d.mortgaged && g && ownsGroup(s, playerId, g.id) && p.cash - unmortgageCost(i) >= keep) return { type: "unmortgage", square: i };
  }
  if (level !== "facile" || p.cash >= 400) {
    const special = s.settings.specials && !specialUsed(s) ? specialMove(s, playerId, level, keep) : null;
    if (special) return special;
    const floor = bestFloor(s, playerId, level, keep);
    if (floor) return floor;
  }
  // Riche et sans rien à bâtir : lever les autres hypothèques
  for (const i of ownedBy(s, playerId)) {
    if (s.deeds[i]!.mortgaged && p.cash - unmortgageCost(i) >= keep * 2) return { type: "unmortgage", square: i };
  }
  if (allowTrade && level !== "facile") return proposeTrade(s, playerId, level);
  return null;
}

/** Le loyer qu'aurait la rue avec ce bâtiment en plus (essayé puis retiré) */
function rentWith(s: CapitaleState, index: number, cell: number, kind: BuildingKind, by: string): number {
  const lots = s.deeds[index]!.lots!;
  const was = lots[cell] ?? null;
  lots[cell] = { kind, by };
  const rent = rentFor(s, index, { diceTotal: 8 });
  lots[cell] = was;
  return rent;
}

/** L'étage qui rapporte le plus de loyer pour son prix, sur ses rues ; Fort remplit d'abord les cases libres (une case libre attire les nuisances) */
function bestFloor(s: CapitaleState, playerId: string, level: BotLevel, keep: number): CapitaleAction | null {
  if (floorsLeft(s) <= 0) return null;
  const p = playerOf(s, playerId)!;
  let best: { action: CapitaleAction; score: number } | null = null;
  for (const i of ownedBy(s, playerId)) {
    const d = s.deeds[i]!;
    if (!d.lots || d.mortgaged || nuisanceOn(s, i)?.kind === "centrale") continue;
    const free = FRONT_FIRST.find((c) => !d.lots![c]);
    const house = BACK_FIRST.find((c) => d.lots![c]?.kind === "maison");
    const options: { cell: number; kind: BuildingKind }[] = [];
    if (free !== undefined) options.push({ cell: free, kind: "maison" });
    if (house !== undefined && level !== "facile") options.push({ cell: house, kind: "immeuble" });
    const before = rentFor(s, i, { diceTotal: 8 });
    for (const o of options) {
      if (canBuild(s, playerId, i, o.cell, o.kind) !== null) continue;
      const cost = buildCost(s, i, o.cell, o.kind);
      if (p.cash - cost < keep) continue;
      let score = (rentWith(s, i, o.cell, o.kind, playerId) - before) / cost;
      if (level === "fort" && o.kind === "maison") score *= 1.2;
      if (score > 0 && (!best || score > best.score)) best = { action: { type: "build", square: i, cell: o.cell, kind: o.kind }, score };
    }
  }
  return best?.action ?? null;
}

/** Une case libre d'une rue, du fond vers l'avant */
const freeCell = (s: CapitaleState, index: number) => BACK_FIRST.find((c) => s.deeds[index]!.lots && !s.deeds[index]!.lots![c]);

/** Le bâtiment spécial du tour : raser une nuisance qui coûte cher, un gratte-ciel, une nuisance chez le meilleur loyer adverse, un parc, un stade */
function specialMove(s: CapitaleState, playerId: string, level: BotLevel, keep: number): CapitaleAction | null {
  const p = playerOf(s, playerId)!;
  const affordable = (price: number, margin = 1) => p.cash - price >= keep * margin;
  const mine = ownedBy(s, playerId).filter((i) => s.deeds[i]!.lots);
  // Une nuisance chez soi : on la fait raser si elle coûte plus que son prix en trois passages
  for (const i of mine) {
    const lots = s.deeds[i]!.lots!;
    const cell = lots.findIndex((b) => b !== null && BUILDINGS[b.kind].nuisance);
    if (cell < 0 || canRaze(s, playerId, i, cell) !== null) continue;
    const nuisance = lots[cell]!;
    const price = buildingPrice(nuisance.kind, i);
    const now = rentFor(s, i, { diceTotal: 8 });
    lots[cell] = null;
    const clean = rentFor(s, i, { diceTotal: 8 });
    lots[cell] = nuisance;
    if ((clean - now) * 3 >= price && affordable(price)) return { type: "raze", square: i, cell };
  }
  if (level === "facile") return null;
  const tryBuild = (index: number, kind: BuildingKind): CapitaleAction | null => {
    const cell = freeCell(s, index);
    if (cell === undefined || canBuild(s, playerId, index, cell, kind) !== null) return null;
    return { type: "build", square: index, cell, kind };
  };
  // Le gratte-ciel, dès qu'un quartier complet le permet : sur la rue la plus chère
  for (const g of GROUP_ORDER) {
    if (!ownsGroup(s, playerId, g) || !affordable(buildingPrice("gratte", GROUPS[g].squares[0]!), 1.2)) continue;
    for (const i of [...GROUPS[g].squares].reverse()) {
      const a = tryBuild(i, "gratte");
      if (a) return a;
    }
  }
  // Une nuisance sur la rue adverse qui rapporte le plus
  const targets = BUYABLE.filter((i) => {
    const d = s.deeds[i]!;
    return d.lots && d.owner && d.owner !== playerId && !d.mortgaged;
  }).sort((a, b) => rentFor(s, b, { diceTotal: 8 }) - rentFor(s, a, { diceTotal: 8 }));
  const target = targets[0];
  if (target !== undefined) {
    const rent = rentFor(s, target, { diceTotal: 8 });
    const kind: BuildingKind | null =
      floorsOf(s, target) >= 3 && rent >= 300 ? "centrale" : rent >= (level === "fort" ? 100 : 160) ? "decharge" : null;
    if (kind && affordable(buildingPrice(kind, target), level === "fort" ? 1 : 1.5)) {
      const a = tryBuild(target, kind);
      if (a) return a;
    }
  }
  // Un parc pour protéger un quartier où l'on a bâti
  for (const i of mine) {
    const g = groupOf(i);
    if (!g || floorsOf(s, i) < 3 || districtBuildings(s, g.id).some((b) => b.kind === "parc")) continue;
    if (!affordable(buildingPrice("parc", i), 1.5)) continue;
    const a = tryBuild(i, "parc");
    if (a) return a;
  }
  // Un stade sur la rue la plus passante (celles qui suivent la prison)
  if (!hasStadium(s, playerId) && affordable(buildingPrice("stade", 0), level === "fort" ? 1.3 : 2)) {
    const busy = [...mine].sort((a, b) => Math.abs(a - 19) - Math.abs(b - 19));
    for (const i of busy) {
      const a = tryBuild(i, "stade");
      if (a) return a;
    }
  }
  return null;
}

/** Trouver de quoi payer : hypothéquer ce qui est hors des groupes complets, vendre des bâtiments, sinon la faillite */
function raiseMoney(s: CapitaleState, playerId: string, level: BotLevel): CapitaleAction {
  const owed = s.debts.filter((d) => d.debtor === playerId).reduce((n, d) => n + d.amount, 0);
  if (liquidity(s, playerId) < owed) return { type: "bankrupt" };
  const mine = ownedBy(s, playerId);
  const full = (i: number) => {
    const g = groupOf(i);
    return g && ownsGroup(s, playerId, g.id) ? 1 : 0;
  };
  // Hypothéquer d'abord ce qui ne fait pas partie d'un groupe complet, du moins utile au plus utile
  const loose = mine
    .filter((i) => canMortgage(s, playerId, i) === null)
    .sort((a, b) => full(a) - full(b) || valueFor(s, playerId, a, level) - valueFor(s, playerId, b, level));
  const first = loose[0];
  if (first !== undefined && !full(first)) return { type: "mortgage", square: first };
  // Puis revendre des bâtiments, les moins chers d'abord
  const sales = mine
    .flatMap((i) => ownBuildings(s, i).map((b) => ({ square: i, cell: b.cell, price: buildingPrice(b.kind, i) })))
    .sort((a, b) => a.price - b.price);
  if (sales.length > 0) return { type: "sell", square: sales[0]!.square, cell: sales[0]!.cell };
  if (first !== undefined) return { type: "mortgage", square: first };
  return { type: "bankrupt" };
}

// ---------------------------------------------------------------------------
// Enchères
// ---------------------------------------------------------------------------

export function botBid(s: CapitaleState, playerId: string, level: BotLevel): CapitaleAction | null {
  const a = s.auction;
  const p = playerOf(s, playerId);
  if (!a || !p || p.bankrupt || a.out.includes(playerId)) return null;
  if (a.high?.player === playerId) return null;
  const price = SQUARES[a.square]!.price!;
  const value = valueFor(s, playerId, a.square, level);
  const factor = level === "facile" ? 0.5 + doubt(s, 3 + a.bids) * 0.3 : level === "moyen" ? 0.95 : 1.15;
  const limit = Math.min(p.cash - Math.min(reserve(s, playerId, level), p.cash * 0.5), value * factor);
  const step = price >= 200 ? 20 : 10;
  const next = (a.high?.amount ?? 0) + (a.high ? step : Math.max(10, Math.round((price * 0.3) / 10) * 10));
  if (next > limit || next > p.cash) return { type: "pass" };
  return { type: "bid", amount: next };
}

// ---------------------------------------------------------------------------
// Échanges
// ---------------------------------------------------------------------------

function offerValue(s: CapitaleState, owner: string, receiver: string, offer: Offer, level: BotLevel, giving: boolean): number {
  let v = offer.cash + offer.jailCards * 40;
  for (const i of offer.squares) v += giving ? costOfGiving(s, owner, receiver, i, level) : valueFor(s, receiver, i, level);
  return v;
}

/** Le bot reçoit une proposition : il accepte si ce qu'il gagne vaut ce qu'il cède, selon son niveau */
export function botAnswer(s: CapitaleState, playerId: string, trade: Trade, level: BotLevel): CapitaleAction {
  const gain = offerValue(s, trade.from, playerId, trade.give, level, false);
  const loss = offerValue(s, playerId, trade.from, trade.get, level, true);
  const p = playerOf(s, playerId)!;
  const cashAfter = p.cash - trade.get.cash + trade.give.cash;
  const threshold = level === "fort" ? 1.2 : level === "moyen" ? 1.0 : 0.8;
  if (cashAfter < 0 || gain < loss * threshold) return { type: "reject", trade: trade.id };
  return { type: "accept", trade: trade.id };
}

/** Une proposition pour compléter un groupe auquel il ne manque qu'une case, payée en argent */
function proposeTrade(s: CapitaleState, playerId: string, level: BotLevel): CapitaleAction | null {
  if (s.trades.some((t) => t.from === playerId)) return null;
  const p = playerOf(s, playerId)!;
  for (const g of GROUP_ORDER) {
    const squares = GROUPS[g].squares;
    const missing = squares.filter((i) => s.deeds[i]!.owner !== playerId);
    if (missing.length !== 1) continue;
    const target = missing[0]!;
    const owner = s.deeds[target]!.owner;
    if (!owner || tradeProblem(s, owner, target) !== null) continue;
    const other = playerOf(s, owner);
    if (!other || other.bankrupt) continue;
    // Assez pour que l'autre (s'il raisonne comme un bot moyen) y trouve son compte
    const ask = costOfGiving(s, owner, playerId, target, "moyen");
    const offerCash = Math.round((ask * (level === "fort" ? 1.1 : 1.2)) / 10) * 10;
    if (p.cash - offerCash < reserve(s, playerId, level)) continue;
    return {
      type: "propose",
      to: owner,
      give: { cash: offerCash, squares: [], jailCards: 0 },
      get: { cash: 0, squares: [target], jailCards: 0 },
    };
  }
  return null;
}
