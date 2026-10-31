// Capitale : les bots. Facile achète un peu au hasard et garde peu de réserve ; Moyen est raisonnable ;
// Fort valorise les groupes complets, bloque ceux des autres, construit vite et négocie.
// Avec les bâtiments spéciaux : Facile pose des parcs et rase les nuisances, Moyen élève des tours et vise le joueur en tête,
// Fort met ses nuisances là où elles coûtent le plus, bâtit tôt un stade et se protège quand on peut l'attaquer.
// Aucune décision ne tire sur le hasard de la partie : le doute de Facile vient d'un calcul sur l'état.

import {
  BUYABLE,
  GROUP_ORDER,
  GROUPS,
  groupOf,
  HOTEL,
  mortgageInterest,
  mortgageValue,
  specialPrice,
  SPECIALS,
  SQUARES,
  STATIONS,
  unmortgageCost,
  type GroupId,
  type SpecialKind,
} from "./board.ts";
import {
  canBuild,
  canMortgage,
  canPlaceSpecial,
  canRaze,
  canSell,
  liquidity,
  netWorth,
  ownedBy,
  ownSpecial,
  ownsGroup,
  playerOf,
  rentFor,
  tradeProblem,
  type BotLevel,
  type CapitaleAction,
  type CapitaleState,
  type Offer,
  type Special,
  type Trade,
} from "./engine.ts";

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
    const h = s.deeds[i]!.houses;
    repairs += h === HOTEL ? 115 : h * 40;
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

export function botAction(
  s: CapitaleState,
  playerId: string,
  level: BotLevel,
  opts: { allowTrade?: boolean; allowAttack?: boolean } = {},
): CapitaleAction | null {
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
      return manage(s, playerId, level, opts.allowTrade ?? false, opts.allowAttack ?? false) ?? { type: "endTurn" };
    default:
      return null;
  }
}

/** Gestion de fin de tour : lever des hypothèques, construire, éventuellement proposer un échange */
function manage(s: CapitaleState, playerId: string, level: BotLevel, allowTrade: boolean, allowAttack: boolean): CapitaleAction | null {
  const p = playerOf(s, playerId)!;
  const keep = reserve(s, playerId, level);
  // Une nuisance chez soi qui coûte plus qu'elle ne vaut : on la fait raser
  const clean = s.settings.specials ? razeNuisance(s, playerId, level, keep) : null;
  if (clean) return clean;
  // D'abord les hypothèques des groupes complets : sans elles, pas de construction
  for (const i of ownedBy(s, playerId)) {
    const d = s.deeds[i]!;
    const g = groupOf(i);
    if (d.mortgaged && g && ownsGroup(s, playerId, g.id) && p.cash - unmortgageCost(i) >= keep) return { type: "unmortgage", square: i };
  }
  // Construire : Fort monte d'abord tout à 3 maisons (le palier qui rapporte le plus), les autres groupe par groupe
  const groups = GROUP_ORDER.filter((g) => ownsGroup(s, playerId, g));
  const tiers = level === "fort" ? [3, HOTEL] : [level === "facile" ? 2 : HOTEL];
  const minCash = level === "facile" ? 400 : 0;
  for (const cap of tiers) {
    for (const g of groups) {
      const squares = [...GROUPS[g].squares].sort((a, b) => s.deeds[a]!.houses - s.deeds[b]!.houses || b - a);
      for (const i of squares) {
        if (s.deeds[i]!.houses >= cap || canBuild(s, playerId, i) !== null) continue;
        if (p.cash - GROUPS[g].houseCost >= keep && p.cash >= minCash) return { type: "build", square: i };
        // Fort hypothèque ses titres isolés pour atteindre 3 maisons
        if (level === "fort" && cap === 3) {
          const m = looseToMortgage(s, playerId, level);
          if (m !== null) return { type: "mortgage", square: m };
        }
      }
    }
    // Les bâtiments spéciaux : pour Fort, entre les 3 maisons et les hôtels ; pour les autres, une fois tout bâti
    if (cap === tiers[0] && s.settings.specials) {
      const special = specialMove(s, playerId, level, keep, allowAttack);
      if (special) return special;
    }
  }
  // Riche et sans rien à construire : lever les autres hypothèques
  for (const i of ownedBy(s, playerId)) {
    if (s.deeds[i]!.mortgaged && p.cash - unmortgageCost(i) >= keep * 2) return { type: "unmortgage", square: i };
  }
  if (allowTrade && level !== "facile") return proposeTrade(s, playerId, level);
  return null;
}

// ---------------------------------------------------------------------------
// Les bâtiments spéciaux
// ---------------------------------------------------------------------------

/** L'état avec un autre bâtiment spécial (ou aucun) sur une case : pour comparer les loyers, sans toucher à la partie */
function withSpecial(s: CapitaleState, index: number, special: Special | undefined): CapitaleState {
  return { ...s, deeds: s.deeds.map((d, k) => (k === index && d ? { ...d, special } : d)) };
}

/** Ce que rapportent à un joueur ses terrains d'un quartier, à chaque passage d'un adversaire */
function districtIncome(s: CapitaleState, playerId: string, group: GroupId): number {
  return GROUPS[group].squares.filter((i) => s.deeds[i]!.owner === playerId).reduce((n, i) => n + rentFor(s, i, { diceTotal: 8 }), 0);
}

/** Une nuisance sur ses terrains : la faire raser si les loyers perdus valent plus que la démolition */
function razeNuisance(s: CapitaleState, playerId: string, level: BotLevel, keep: number): CapitaleAction | null {
  const p = playerOf(s, playerId)!;
  for (const i of ownedBy(s, playerId)) {
    const sp = s.deeds[i]!.special;
    if (!sp || !SPECIALS[sp.kind].nuisance || canRaze(s, playerId, i) !== null) continue;
    const cost = specialPrice(sp.kind, i);
    if (p.cash - cost < keep) continue;
    const group = groupOf(i)!.id;
    const lost = districtIncome(withSpecial(s, i, undefined), playerId, group) - districtIncome(s, playerId, group);
    const factor = level === "fort" ? 0.5 : level === "moyen" ? 0.8 : 0.3;
    if (lost > 0 && lost >= cost * factor) return { type: "raze", square: i };
  }
  return null;
}

/** Un terrain libre d'un quartier où poser son bâtiment, s'il y en a un */
function spotIn(s: CapitaleState, playerId: string, group: GroupId, kind: SpecialKind): number | null {
  return GROUPS[group].squares.find((i) => canPlaceSpecial(s, playerId, i, kind) === null) ?? null;
}

/** Un bâtiment spécial à poser : la tour, un parc, un stade, puis une nuisance chez un adversaire */
function specialMove(s: CapitaleState, playerId: string, level: BotLevel, keep: number, allowAttack: boolean): CapitaleAction | null {
  if (s.specialTurn === s.turnId) return null;
  const p = playerOf(s, playerId)!;
  const affords = (kind: SpecialKind, at: number, margin = 1) => p.cash - specialPrice(kind, at) >= keep * margin;
  const full = GROUP_ORDER.filter((g) => ownsGroup(s, playerId, g));
  const others = s.players.filter((x) => x.id !== playerId && !x.bankrupt);

  // La tour Capitale, sur le quartier où elle rapporte le plus
  if (level !== "facile") {
    let best: { at: number; gain: number } | null = null;
    for (const g of full) {
      const at = spotIn(s, playerId, g, "tour");
      if (at === null || !affords("tour", at)) continue;
      const gain = districtIncome(withSpecial(s, at, { kind: "tour", by: playerId }), playerId, g) - districtIncome(s, playerId, g);
      if (gain >= specialPrice("tour", at) * (level === "fort" ? 0.4 : 0.6) && (!best || gain > best.gain)) best = { at, gain };
    }
    if (best) return { type: "special", square: best.at, kind: "tour" };
  }

  // Le parc, sur le quartier qui a le plus à perdre ; Fort ne s'en soucie que si quelqu'un peut l'attaquer
  const threat = others.some((x) => x.cash >= specialPrice("decharge", 0) + 100);
  if (level !== "fort" || threat) {
    const minIncome = level === "facile" ? 1 : level === "moyen" ? 300 : 400;
    let best: { at: number; income: number } | null = null;
    for (const g of full) {
      const at = spotIn(s, playerId, g, "parc");
      const income = districtIncome(s, playerId, g);
      if (at === null || income < minIncome || !affords("parc", at)) continue;
      if (level === "facile" && p.cash < 500) continue;
      if (!best || income > best.income) best = { at, income };
    }
    if (best) return { type: "special", square: best.at, kind: "parc" };
  }

  // Fort bâtit tôt son stade, sur un terrain déjà lié à un groupe complet s'il peut (il bloque les échanges du terrain)
  if (level === "fort") {
    const spots = ownedBy(s, playerId)
      .filter((i) => canPlaceSpecial(s, playerId, i, "stade") === null && affords("stade", i))
      .sort((a, b) => Number(ownsGroup(s, playerId, groupOf(b)!.id)) - Number(ownsGroup(s, playerId, groupOf(a)!.id)) || a - b);
    if (spots[0] !== undefined) return { type: "special", square: spots[0], kind: "stade" };
  }

  // Les nuisances : Moyen vise le plus riche, Fort cherche le quartier où elle fait le plus de dégâts
  if (!allowAttack || level === "facile" || others.length === 0) return null;
  const leader = others.reduce((a, b) => (netWorth(s, b.id) > netWorth(s, a.id) ? b : a));
  let best: { at: number; kind: SpecialKind; score: number } | null = null;
  for (const victim of level === "fort" ? others : [leader]) {
    for (const g of GROUP_ORDER) {
      if (!GROUPS[g].squares.some((i) => s.deeds[i]!.owner === victim.id)) continue;
      for (const kind of ["centrale", "decharge"] as const) {
        const at = GROUPS[g].squares.find((i) => s.deeds[i]!.owner === victim.id && canPlaceSpecial(s, playerId, i, kind) === null);
        if (at === undefined || !affords(kind, at, level === "fort" ? 1 : 1.3)) continue;
        const after = withSpecial(s, at, { kind, by: playerId });
        // Les dégâts chez la victime, moins ce qu'on y perd soi-même si on a un terrain dans le quartier
        const damage =
          districtIncome(s, victim.id, g) - districtIncome(after, victim.id, g) - (districtIncome(s, playerId, g) - districtIncome(after, playerId, g));
        const price = specialPrice(kind, at);
        const score = (damage - price) * (victim === leader ? 1.3 : 1);
        if (damage >= price * 2 && (!best || score > best.score)) best = { at, kind, score };
      }
    }
  }
  return best ? { type: "special", square: best.at, kind: best.kind } : null;
}

/** Trouver de quoi payer : vendre des constructions, puis hypothéquer le moins utile, sinon la faillite */
function raiseMoney(s: CapitaleState, playerId: string, level: BotLevel): CapitaleAction {
  const owed = s.debts.filter((d) => d.debtor === playerId).reduce((n, d) => n + d.amount, 0);
  if (liquidity(s, playerId) < owed) return { type: "bankrupt" };
  const mine = ownedBy(s, playerId);
  // Hypothéquer d'abord ce qui ne fait pas partie d'un groupe complet, du moins cher au plus cher
  const loose = mine
    .filter((i) => canMortgage(s, playerId, i) === null)
    .sort((a, b) => {
      const ga = groupOf(a);
      const gb = groupOf(b);
      const fullA = ga && ownsGroup(s, playerId, ga.id) ? 1 : 0;
      const fullB = gb && ownsGroup(s, playerId, gb.id) ? 1 : 0;
      return fullA - fullB || valueFor(s, playerId, a, level) - valueFor(s, playerId, b, level);
    });
  const first = loose[0];
  if (first !== undefined) {
    const g = groupOf(first);
    // Avant d'hypothéquer un groupe complet, on vend ses maisons (le moteur l'exige)
    if (!(g && ownsGroup(s, playerId, g.id))) return { type: "mortgage", square: first };
  }
  // Ses bâtiments spéciaux se revendent à moitié prix : le parc et le stade d'abord, la tour après les maisons
  const specials = mine.filter((i) => ownSpecial(s, i) !== null);
  const light = specials.find((i) => ownSpecial(s, i) !== "tour");
  if (light !== undefined) return { type: "raze", square: light };
  const sellable = mine
    .filter((i) => canSell(s, playerId, i) === null)
    .sort((a, b) => (groupOf(a)?.houseCost ?? 0) - (groupOf(b)?.houseCost ?? 0));
  if (sellable.length > 0) return { type: "sell", square: sellable[0]! };
  if (specials[0] !== undefined) return { type: "raze", square: specials[0] };
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
