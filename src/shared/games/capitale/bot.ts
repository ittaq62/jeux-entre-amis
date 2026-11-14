// Capitale : les bots. Facile achète un peu au hasard et garde peu de réserve ; Moyen est raisonnable ;
// Fort valorise les groupes complets, bloque ceux des autres, bâtit vite, pose ses nuisances chez le plus riche et négocie.
// En équipes, chacun joue pour son camp : pas de nuisance ni de surenchère chez un coéquipier, un titre donné quand il
// complète son quartier, de l'argent quand il est en dette. Au Monopole, tous visent les titres qui font gagner leur camp
// et bloquent ceux qui feraient gagner un adversaire.
// Aucune décision ne tire sur le hasard de la partie : le doute de Facile vient d'un calcul sur l'état.

import {
  BUYABLE,
  GROUP_ORDER,
  GROUPS,
  groupOf,
  MAX_LEVEL,
  mortgageInterest,
  mortgageValue,
  SPECIALS,
  specialPrice,
  SQUARES,
  STATIONS,
  unmortgageCost,
  upgradeCost,
  UTILITIES,
  type SpecialKind,
} from "./board.ts";
import {
  allies,
  canMortgage,
  canPlaceSpecial,
  canRaze,
  canSell,
  canUpgrade,
  districtSpecials,
  giftProblem,
  hasStadium,
  levelOf,
  liquidity,
  monopolyOf,
  monopolyProgress,
  ownedBy,
  ownSpecial,
  ownsGroup,
  playerOf,
  rentDue,
  rentFor,
  sideOf,
  specialUsed,
  teammates,
  teamPlay,
  teamRules,
  tradeProblem,
  type BotLevel,
  type CapitaleAction,
  type CapitaleState,
  type Offer,
  type Trade,
} from "./engine.ts";

/** Un nombre entre 0 et 1 propre à la situation, sans toucher au hasard de la partie */
function doubt(s: CapitaleState, salt: number): number {
  let h = (s.turnId * 2654435761 + s.decision * 40503 + salt * 97) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return (h % 1000) / 1000;
}

/** Le pire loyer qu'on risque sur le plateau (rien chez soi, le tarif d'équipe chez un coéquipier) : on garde de quoi le payer */
function danger(s: CapitaleState, playerId: string): number {
  let worst = 0;
  for (const i of BUYABLE) worst = Math.max(worst, rentDue(s, i, playerId, { diceTotal: 8 }));
  return worst;
}

/** Le propriétaire d'une case est-il de son camp (soi ou un coéquipier) ? */
const ours = (s: CapitaleState, playerId: string, i: number) => {
  const o = s.deeds[i]?.owner;
  return Boolean(o && allies(s, o, playerId));
};
/** … ou d'un camp adverse ? */
const theirs = (s: CapitaleState, playerId: string, i: number) => {
  const o = s.deeds[i]?.owner;
  return Boolean(o && !allies(s, o, playerId));
};

/** Les camps adverses encore en jeu, chacun représenté par un de ses joueurs */
function rivalSides(s: CapitaleState, playerId: string): string[] {
  const seen = new Map<string, string>();
  for (const p of s.players) {
    if (p.bankrupt || allies(s, p.id, playerId)) continue;
    const side = sideOf(s, p.id);
    if (!seen.has(side)) seen.set(side, p.id);
  }
  return [...seen.values()];
}

/** Ce titre ferait-il gagner tout de suite le camp de ce joueur, au Monopole ? */
function wins(s: CapitaleState, playerId: string, index: number): boolean {
  if (!s.settings.monopoly) return false;
  return monopolyProgress(s, playerId).winning.includes(index);
}

/** Ce titre ferait-il gagner un camp adverse ? (on le lui bloque) */
function rivalWins(s: CapitaleState, playerId: string, index: number): boolean {
  if (!s.settings.monopoly) return false;
  return rivalSides(s, playerId).some((id) => monopolyProgress(s, id).winning.includes(index));
}

/** Au Monopole : combien il manquerait de titres au camp de ce joueur s'il avait aussi celui-ci (essayé puis remis) */
function closestWith(s: CapitaleState, playerId: string, index: number): number {
  const d = s.deeds[index]!;
  const was = d.owner;
  d.owner = playerId;
  const n = monopolyProgress(s, playerId).closest;
  d.owner = was;
  return n;
}

function reserve(s: CapitaleState, playerId: string, level: BotLevel): number {
  const risk = danger(s, playerId);
  if (level === "facile") return 180;
  // Ce que coûterait la pire carte de travaux : sans cette marge, on revend à moitié prix puis on rebâtit
  let repairs = 0;
  for (const i of ownedBy(s, playerId)) {
    const l = levelOf(s, i);
    repairs += l === MAX_LEVEL ? 115 : l * 40;
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

/** N'importe quel titre qu'on peut hypothéquer, le moins utile d'abord (pour un titre vital au Monopole) */
function anyToMortgage(s: CapitaleState, playerId: string, except: number): number | null {
  const all = ownedBy(s, playerId)
    .filter((i) => i !== except && canMortgage(s, playerId, i) === null)
    .sort((a, b) => valueFor(s, playerId, a) - valueFor(s, playerId, b));
  return all[0] ?? null;
}

/**
 * Combien vaut une case pour ce joueur : le prix, plus s'il complète un groupe (le sien ou celui d'un coéquipier, à qui
 * il le donnera) ou en bloque un. Au Monopole : tout ce qu'on a pour le titre qui fait gagner son camp, très cher celui
 * qui ferait gagner un adversaire, et un peu plus pour ce qui rapproche du but.
 */
export function valueFor(s: CapitaleState, playerId: string, index: number, level: BotLevel = "moyen"): number {
  const sq = SQUARES[index]!;
  const price = sq.price ?? 0;
  let v = price;
  if (sq.kind === "property") {
    const g = GROUPS[sq.group!];
    const others = g.squares.filter((i) => i !== index);
    const mine = others.filter((i) => ours(s, playerId, i)).length;
    const rivals = new Set(others.filter((i) => theirs(s, playerId, i)).map((i) => sideOf(s, s.deeds[i]!.owner!)));
    if (mine === others.length) v *= level === "fort" ? 3 : level === "moyen" ? 2.2 : 1.5;
    else if (rivals.size === 1 && others.every((i) => theirs(s, playerId, i))) {
      // Un seul autre camp a tout le reste : prendre cette case lui bloque le groupe
      v *= level === "fort" ? 1.6 : 1.25;
    } else if (mine > 0) v *= 1.3;
  } else if (sq.kind === "station") {
    const mine = STATIONS.filter((i) => i !== index && ours(s, playerId, i)).length;
    v *= 1 + 0.3 * mine;
  } else if (sq.kind === "utility") {
    v *= 0.85;
  }
  if (s.settings.monopoly && sq.price !== undefined) {
    if (wins(s, playerId, index)) v = Math.max(v, 10_000);
    else if (rivalWins(s, playerId, index)) v = Math.max(v, price * (level === "fort" ? 5 : level === "moyen" ? 4 : 2) + 300);
    else {
      // Un pas de plus vers son Monopole
      const now = monopolyProgress(s, playerId).closest;
      const after = closestWith(s, playerId, index);
      if (after < now) v *= after <= 1 ? (level === "facile" ? 1.4 : 2) : after <= 2 ? 1.35 : 1.1;
    }
  }
  if (s.deeds[index]?.mortgaged) v -= mortgageValue(index) + mortgageInterest(index);
  return Math.max(0, Math.round(v));
}

/** Ce que coûte de céder une case : sa valeur pour soi, et plus si elle complète le groupe de celui qui la reçoit */
function costOfGiving(s: CapitaleState, from: string, to: string, index: number, level: BotLevel): number {
  let v = valueFor(s, from, index, level);
  if (allies(s, from, to)) return v;
  const g = groupOf(index);
  if (g) {
    const rest = g.squares.filter((i) => i !== index);
    if (rest.every((i) => ours(s, to, i))) v += (SQUARES[index]!.price ?? 0) * (level === "fort" ? 3 : level === "moyen" ? 2 : 0.8);
  }
  // Au Monopole, jamais le titre qui fait gagner l'adversaire
  if (wins(s, to, index)) v += 50_000;
  return v;
}

// ---------------------------------------------------------------------------
// Le coup à jouer quand c'est au bot de décider
// ---------------------------------------------------------------------------

export function botAction(
  s: CapitaleState,
  playerId: string,
  level: BotLevel,
  opts: { allowTrade?: boolean; allowGift?: boolean } = {},
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
      // Au Monopole : le titre qui fait gagner son camp, ou qui ferait gagner un adversaire, se prend coûte que coûte
      const vital = wins(s, playerId, index) || (level !== "facile" && rivalWins(s, playerId, index));
      if (p.cash < price) {
        // Fort hypothèque un titre isolé pour s'offrir celui qui complète (ou bloque) un groupe ; tous le font pour un titre vital
        if ((level === "fort" && keen) || vital) {
          const m = looseToMortgage(s, playerId, level, index) ?? (vital ? anyToMortgage(s, playerId, index) : null);
          if (m !== null) return { type: "mortgage", square: m };
        }
        return { type: "decline" };
      }
      if (vital) return { type: "buy" };
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
      return manage(s, playerId, level, opts.allowTrade ?? false, opts.allowGift ?? false) ?? { type: "endTurn" };
    default:
      return null;
  }
}

/**
 * Gestion de fin de tour : donner à un coéquipier le titre qui complète son quartier, lever des hypothèques, améliorer,
 * poser un bâtiment spécial, éventuellement proposer un échange
 */
function manage(s: CapitaleState, playerId: string, level: BotLevel, allowTrade: boolean, allowGift: boolean): CapitaleAction | null {
  const p = playerOf(s, playerId)!;
  if (allowGift) {
    const gift = giftMove(s, playerId);
    if (gift) return gift;
  }
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
    const up = bestUpgrade(s, playerId, level, keep);
    if (up) return up;
  }
  // Riche et sans rien à améliorer : lever les autres hypothèques
  for (const i of ownedBy(s, playerId)) {
    if (s.deeds[i]!.mortgaged && p.cash - unmortgageCost(i) >= keep * 2) return { type: "unmortgage", square: i };
  }
  if (allowTrade && level !== "facile") return proposeTrade(s, playerId, level);
  return null;
}

/** Le loyer qu'aurait la rue un niveau plus haut (essayé puis remis) */
function rentAt(s: CapitaleState, index: number, level: number): number {
  const d = s.deeds[index]!;
  const was = d.level;
  d.level = level;
  const rent = rentFor(s, index, { diceTotal: 8 });
  d.level = was;
  return rent;
}

/** La rue dont un niveau de plus rapporte le plus de loyer pour son prix ; Facile s'arrête à deux maisons */
function bestUpgrade(s: CapitaleState, playerId: string, level: BotLevel, keep: number): CapitaleAction | null {
  const p = playerOf(s, playerId)!;
  let best: { square: number; score: number } | null = null;
  for (const i of ownedBy(s, playerId)) {
    if (canUpgrade(s, playerId, i) !== null) continue;
    const now = levelOf(s, i);
    if (level === "facile" && now >= 2) continue;
    if (p.cash - upgradeCost(i) < keep) continue;
    const score = (rentAt(s, i, now + 1) - rentFor(s, i, { diceTotal: 8 })) / upgradeCost(i);
    if (score > 0 && (!best || score > best.score)) best = { square: i, score };
  }
  return best ? { type: "upgrade", square: best.square } : null;
}

/** Le bâtiment spécial du tour : raser une nuisance qui coûte cher, un monument, une nuisance chez le meilleur loyer adverse, un parc, un stade */
function specialMove(s: CapitaleState, playerId: string, level: BotLevel, keep: number): CapitaleAction | null {
  const p = playerOf(s, playerId)!;
  const affordable = (price: number, margin = 1) => p.cash - price >= keep * margin;
  const mine = ownedBy(s, playerId).filter((i) => SQUARES[i]!.kind === "property");
  // Une nuisance chez soi : on la fait raser si elle coûte plus que son prix en trois passages
  for (const i of mine) {
    const sp = s.deeds[i]!.special;
    if (!sp || !SPECIALS[sp.kind].nuisance || canRaze(s, playerId, i) !== null) continue;
    const price = specialPrice(sp.kind, i);
    const now = rentFor(s, i, { diceTotal: 8 });
    s.deeds[i]!.special = null;
    const clean = rentFor(s, i, { diceTotal: 8 });
    s.deeds[i]!.special = sp;
    if ((clean - now) * 3 >= price && affordable(price)) return { type: "raze", square: i };
  }
  if (level === "facile") return null;
  const place = (index: number, kind: SpecialKind): CapitaleAction | null =>
    canPlaceSpecial(s, playerId, index, kind) === null ? { type: "special", square: index, kind } : null;
  // Le monument, dès qu'un quartier complet le permet : sur la rue la plus chère
  for (const g of GROUP_ORDER) {
    if (!ownsGroup(s, playerId, g) || !affordable(specialPrice("monument", GROUPS[g].squares[0]!), 1.2)) continue;
    for (const i of [...GROUPS[g].squares].reverse()) {
      const a = place(i, "monument");
      if (a) return a;
    }
  }
  // Une nuisance sur la rue adverse qui rapporte le plus (jamais chez un coéquipier)
  const target = BUYABLE.filter((i) => {
    const d = s.deeds[i]!;
    return SQUARES[i]!.kind === "property" && d.owner && !allies(s, d.owner, playerId) && !d.mortgaged && !d.special;
  }).sort((a, b) => rentFor(s, b, { diceTotal: 8 }) - rentFor(s, a, { diceTotal: 8 }))[0];
  if (target !== undefined) {
    const rent = rentFor(s, target, { diceTotal: 8 });
    const kind: SpecialKind | null =
      levelOf(s, target) >= 2 && rent >= 300 ? "centrale" : rent >= (level === "fort" ? 100 : 160) ? "decharge" : null;
    if (kind && affordable(specialPrice(kind, target), level === "fort" ? 1 : 1.5)) {
      const a = place(target, kind);
      if (a) return a;
    }
  }
  // Un parc pour protéger un quartier où l'on a bâti
  for (const i of mine) {
    const g = groupOf(i)!;
    if (levelOf(s, i) < 2 || districtSpecials(s, g.id).some((b) => b.kind === "parc") || !affordable(specialPrice("parc", i), 1.5))
      continue;
    const a = place(i, "parc");
    if (a) return a;
  }
  // Un stade sur la rue la plus passante (celles qui suivent la prison)
  if (!hasStadium(s, playerId) && affordable(specialPrice("stade", 0), level === "fort" ? 1.3 : 2)) {
    for (const i of [...mine].sort((a, b) => Math.abs(a - 19) - Math.abs(b - 19))) {
      const a = place(i, "stade");
      if (a) return a;
    }
  }
  return null;
}

/** Trouver de quoi payer : hypothéquer ce qui est hors des groupes complets, revendre des niveaux, sinon la faillite */
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
  // Puis revendre : les bâtiments spéciaux, puis un niveau sur la rue la moins chère
  const special = mine.find((i) => ownSpecial(s, i) && canRaze(s, playerId, i) === null);
  if (special !== undefined) return { type: "raze", square: special };
  const sellable = mine.filter((i) => canSell(s, playerId, i) === null).sort((a, b) => upgradeCost(a) - upgradeCost(b));
  if (sellable.length > 0) return { type: "sell", square: sellable[0]! };
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
  // On ne surenchérit pas sur un coéquipier : l'argent irait à la banque
  if (a.high && allies(s, a.high.player, playerId)) return { type: "pass" };
  const price = SQUARES[a.square]!.price!;
  const value = valueFor(s, playerId, a.square, level);
  const factor = level === "facile" ? 0.5 + doubt(s, 3 + a.bids) * 0.3 : level === "moyen" ? 0.95 : 1.15;
  // Au Monopole : tout son argent pour le titre qui fait gagner son camp, presque tout pour bloquer un adversaire
  const vital = wins(s, playerId, a.square) || (level !== "facile" && rivalWins(s, playerId, a.square));
  const limit = vital ? p.cash : Math.min(p.cash - Math.min(reserve(s, playerId, level), p.cash * 0.5), value * factor);
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

/** Après cet échange, le camp de `other` aurait-il gagné au Monopole, ou serait-il à un seul titre de gagner ? */
function tradeHelpsRival(s: CapitaleState, me: string, other: string, trade: Trade): boolean {
  if (!s.settings.monopoly || allies(s, me, other)) return false;
  const before = monopolyProgress(s, other).closest;
  const moved = [...trade.give.squares.map((i) => [i, trade.to] as const), ...trade.get.squares.map((i) => [i, trade.from] as const)];
  const was = moved.map(([i]) => s.deeds[i]!.owner);
  moved.forEach(([i, to]) => (s.deeds[i]!.owner = to));
  const won = monopolyOf(s, other) !== null;
  const after = monopolyProgress(s, other).closest;
  moved.forEach(([i], k) => (s.deeds[i]!.owner = was[k]!));
  return won || (after <= 1 && after < before);
}

/**
 * Le bot reçoit une proposition : il accepte si ce qu'il gagne vaut ce qu'il cède, selon son niveau. Un coéquipier
 * obtient ce qu'il demande tant que le bot ne casse pas un de ses quartiers complets ; au Monopole, jamais de quoi
 * faire gagner un adversaire (ni le mettre à un titre de la victoire).
 */
export function botAnswer(s: CapitaleState, playerId: string, trade: Trade, level: BotLevel): CapitaleAction {
  const p = playerOf(s, playerId)!;
  const cashAfter = p.cash - trade.get.cash + trade.give.cash;
  const reject = { type: "reject", trade: trade.id } as const;
  if (cashAfter < 0) return reject;
  if (allies(s, playerId, trade.from)) {
    const breaks = trade.get.squares.some((i) => {
      const g = groupOf(i);
      return g !== null && ownsGroup(s, playerId, g.id);
    });
    return breaks ? reject : { type: "accept", trade: trade.id };
  }
  if (tradeHelpsRival(s, playerId, trade.from, trade)) return reject;
  const gain = offerValue(s, trade.from, playerId, trade.give, level, false);
  const loss = offerValue(s, playerId, trade.from, trade.get, level, true);
  const threshold = level === "fort" ? 1.2 : level === "moyen" ? 1.0 : 0.8;
  if (gain < loss * threshold) return reject;
  return { type: "accept", trade: trade.id };
}

/**
 * Une proposition pour compléter un groupe auquel il ne manque qu'une case, payée en argent (demandée pour rien à un
 * coéquipier quand les dons sont permis) ; au Monopole, d'abord le titre qui ferait gagner son camp
 */
function proposeTrade(s: CapitaleState, playerId: string, level: BotLevel): CapitaleAction | null {
  if (s.trades.some((t) => t.from === playerId)) return null;
  const p = playerOf(s, playerId)!;
  const gifts = teamPlay(s) && teamRules(s).gifts;
  const ask = (target: number, boost: number): CapitaleAction | null => {
    const owner = s.deeds[target]!.owner;
    if (!owner || owner === playerId || tradeProblem(s, owner, target) !== null) return null;
    const other = playerOf(s, owner);
    if (!other || other.bankrupt) return null;
    const get = { cash: 0, squares: [target], jailCards: 0 };
    if (allies(s, owner, playerId) && gifts) return { type: "propose", to: owner, give: { cash: 0, squares: [], jailCards: 0 }, get };
    // Assez pour que l'autre (s'il raisonne comme un bot moyen) y trouve son compte
    const want = costOfGiving(s, owner, playerId, target, "moyen");
    const offerCash = Math.round((want * (level === "fort" ? 1.1 : 1.2) * boost) / 10) * 10;
    if (p.cash - offerCash < reserve(s, playerId, level) / boost) return null;
    return { type: "propose", to: owner, give: { cash: Math.min(offerCash, p.cash), squares: [], jailCards: 0 }, get };
  };
  if (s.settings.monopoly) {
    // La victoire est à un titre : on le demande à son propriétaire (un adversaire humain peut ne pas voir le danger)
    for (const target of monopolyProgress(s, playerId).winning) {
      const owner = s.deeds[target]!.owner;
      if (!owner) continue;
      const price = SQUARES[target]!.price ?? 0;
      const offer = allies(s, owner, playerId) ? ask(target, 1) : proposeFor(s, playerId, owner, target, Math.max(price * 2, 300));
      if (offer) return offer;
    }
  }
  for (const g of GROUP_ORDER) {
    const squares = GROUPS[g].squares;
    const missing = squares.filter((i) => s.deeds[i]!.owner !== playerId);
    if (missing.length !== 1) continue;
    const offer = ask(missing[0]!, 1);
    if (offer) return offer;
  }
  return null;
}

/** Une offre d'argent pour un titre précis, à un adversaire, dans la limite de ce qu'on a */
function proposeFor(s: CapitaleState, playerId: string, owner: string, target: number, cash: number): CapitaleAction | null {
  const p = playerOf(s, playerId)!;
  if (tradeProblem(s, owner, target) !== null || playerOf(s, owner)?.bankrupt) return null;
  const amount = Math.min(p.cash, Math.round(cash / 10) * 10);
  if (amount <= 0) return null;
  return {
    type: "propose",
    to: owner,
    give: { cash: amount, squares: [], jailCards: 0 },
    get: { cash: 0, squares: [target], jailCards: 0 },
  };
}

// ---------------------------------------------------------------------------
// En équipes : les dons
// ---------------------------------------------------------------------------

/**
 * Le don du tour : le titre qui complète le quartier d'un coéquipier, ou une gare (un réseau) à celui qui en a déjà
 * plus, pour que ses loyers montent
 */
export function giftMove(s: CapitaleState, playerId: string): CapitaleAction | null {
  if (!teamPlay(s) || !teamRules(s).gifts) return null;
  const mates = teammates(s, playerId).filter((x) => !x.bankrupt);
  if (mates.length === 0) return null;
  const give = (to: string, square: number): CapitaleAction | null =>
    giftProblem(s, playerId, to, { cash: 0, squares: [square], jailCards: 0 }) === null
      ? { type: "gift", to, give: { cash: 0, squares: [square], jailCards: 0 } }
      : null;
  for (const i of ownedBy(s, playerId)) {
    const g = groupOf(i);
    if (!g) continue;
    const rest = g.squares.filter((x) => x !== i);
    for (const m of mates) {
      if (!rest.every((x) => s.deeds[x]!.owner === m.id)) continue;
      const a = give(m.id, i);
      if (a) return a;
    }
  }
  for (const list of [STATIONS, UTILITIES]) {
    const count = (id: string) => list.filter((x) => s.deeds[x]!.owner === id).length;
    const mine = count(playerId);
    if (mine === 0) continue;
    // Toujours vers celui qui en a le plus (à égalité, le premier dans l'ordre) : jamais d'aller-retour
    const best = [...mates].sort((a, b) => count(b.id) - count(a.id))[0]!;
    if (count(best.id) === 0 || count(best.id) < mine || (count(best.id) === mine && best.id > playerId)) continue;
    const square = list.find((x) => s.deeds[x]!.owner === playerId)!;
    const a = give(best.id, square);
    if (a) return a;
  }
  return null;
}

/**
 * Un coéquipier est en dette : le bot lui donne ce qui manque, s'il peut le faire en gardant de quoi voir venir, ou
 * coûte que coûte quand la dette l'enverrait à la faillite
 */
export function botRescue(s: CapitaleState, helperId: string, level: BotLevel): CapitaleAction | null {
  if (!teamPlay(s) || !teamRules(s).gifts || s.step !== "debt") return null;
  const debt = s.debts[0];
  const helper = playerOf(s, helperId);
  if (!debt || !helper || helper.bankrupt || debt.debtor === helperId || !allies(s, helperId, debt.debtor)) return null;
  const debtor = playerOf(s, debt.debtor)!;
  const owed = s.debts.filter((d) => d.debtor === debtor.id).reduce((n, d) => n + d.amount, 0);
  const short = owed - debtor.cash;
  if (short <= 0 || helper.cash < short) return null;
  const doomed = liquidity(s, debtor.id) < owed;
  const keep = level === "facile" ? 100 : reserve(s, helperId, level) * 0.5;
  if (!doomed && helper.cash - short < keep) return null;
  const give = { cash: short, squares: [], jailCards: 0 };
  return giftProblem(s, helperId, debtor.id, give) === null ? { type: "gift", to: debtor.id, give } : null;
}
