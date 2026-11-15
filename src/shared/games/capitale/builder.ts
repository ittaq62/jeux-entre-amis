// Capitale Builder : on pose ses bâtiments où l'on veut sur le territoire de ses villes, et le loyer d'une ville est
// la somme de ce qu'on y a bâti. Le reste de la partie (dés, achats, cartes, enchères, échanges, équipes, Monopole)
// est celui de la Capitale classique : le moteur (engine.ts) n'appelle ce module que lorsque la règle est jouée.
//
// Le loyer d'un bâtiment : ses points × l'échelle de la ville (le loyer du monument classique de la ville, réparti sur
// ses cases de départ), doublé avec le quartier complet. Un parc fait gagner 30 % aux habitations qui le touchent ;
// un commerce gagne un point par habitation qui le touche ; une nuisance (décharge, centrale) fait perdre 30 % à tous
// les bâtiments à deux cases ou moins, ceux de son propriétaire compris (jamais ceux d'un coéquipier).

import { GROUPS, SQUARES, groupOf, upgradeCost } from "./board.ts";
import {
  baseCells,
  baseSize,
  CELLS,
  isVague,
  MAP,
  maxAnnex,
  neighbors,
  rectCells,
  rectGap,
  rectsTouch,
  TERRITORIES,
  type Rect,
} from "./builderMap.ts";
import { allies, ownedBy, ownsGroup, playerOf, type CapitaleState, type Deed } from "./engine.ts";

export type BuildKind = "maison" | "commerce" | "immeuble" | "tour" | "parc" | "stade" | "monument" | "decharge" | "centrale";

export interface BuildInfo {
  name: string;
  /** Avec son article, pour les phrases : « une maison », « le stade » */
  one: string;
  the: string;
  /** La taille au sol, sans rotation : w cases en largeur, d en profondeur */
  w: number;
  d: number;
  /** Les points de loyer, avant les voisinages */
  pts: number;
  /** Le prix en points (comme le loyer : à l'échelle de la ville, payé deux loyers sans le quartier), ou un prix fixe */
  costPts?: number;
  price?: number;
  /** Une habitation : maison, immeuble, tour (le parc et les commerces les font gagner) */
  habitation?: boolean;
  /** Il faut tout le quartier pour le poser */
  district?: boolean;
  /** Un bâtiment spécial : il n'est de la partie qu'avec les bâtiments spéciaux */
  special?: boolean;
  /** Une nuisance : fait perdre à ses voisins */
  nuisance?: boolean;
  /** Un seul par ville (le monument), ou par joueur (le stade) */
  perCity?: boolean;
  perPlayer?: boolean;
  effect: string;
}

/** Ce que paie chaque adversaire qui passe sur la case d'une ville qui a un stade */
export const BUILDER_TICKET = 50;
/** Les voisinages : un parc +30 % (deux au plus), une nuisance −30 % (−60 % au plus), à deux cases ou moins */
export const PARC_BONUS = 0.3;
export const PARC_MAX = 2;
export const NUISANCE_MALUS = 0.3;
export const NUISANCE_MAX = 0.6;
export const NUISANCE_REACH = 2;
/** Un commerce : un point de plus par habitation qui le touche, quatre au plus */
export const COMMERCE_MAX = 4;

export const BUILDS: Record<BuildKind, BuildInfo> = {
  maison: {
    name: "Maison",
    one: "une maison",
    the: "la maison",
    w: 1,
    d: 1,
    pts: 2,
    costPts: 2.5,
    habitation: true,
    effect: "Un petit loyer, et une habitation pour les parcs et les commerces.",
  },
  commerce: {
    name: "Commerce",
    one: "un commerce",
    the: "le commerce",
    w: 1,
    d: 1,
    pts: 1,
    costPts: 3,
    effect: "Rapporte un point de plus par habitation qui le touche (quatre au plus).",
  },
  immeuble: {
    name: "Immeuble",
    one: "un immeuble",
    the: "l'immeuble",
    w: 1,
    d: 2,
    pts: 5,
    costPts: 5.5,
    habitation: true,
    effect: "Plus haut, plus de loyer sur deux cases.",
  },
  tour: {
    name: "Tour",
    one: "une tour",
    the: "la tour",
    w: 2,
    d: 2,
    pts: 13,
    costPts: 13,
    habitation: true,
    district: true,
    effect: "Le grand loyer d'habitation. Il faut tout le quartier.",
  },
  parc: {
    name: "Parc",
    one: "un parc",
    the: "le parc",
    w: 2,
    d: 2,
    pts: 0,
    price: 100,
    special: true,
    effect: "Les habitations qui le touchent rapportent 30 % de plus (deux parcs au plus).",
  },
  stade: {
    name: "Stade",
    one: "un stade",
    the: "le stade",
    w: 3,
    d: 3,
    pts: 4,
    price: 200,
    special: true,
    perPlayer: true,
    effect: `Chaque adversaire qui passe sur la case de la ville te paie ${BUILDER_TICKET} ₣. Un seul par joueur.`,
  },
  monument: {
    name: "Monument",
    one: "le monument",
    the: "le monument",
    w: 2,
    d: 2,
    pts: 24,
    costPts: 22,
    district: true,
    perCity: true,
    effect: "Le plus gros loyer, un par ville, et la ville ne se rachète plus. Il faut tout le quartier.",
  },
  decharge: {
    name: "Décharge",
    one: "une décharge",
    the: "la décharge",
    w: 2,
    d: 2,
    pts: 2,
    price: 100,
    special: true,
    nuisance: true,
    effect: "Fait perdre 30 % aux bâtiments à deux cases ou moins, les tiens compris (pas ceux d'un coéquipier).",
  },
  centrale: {
    name: "Centrale",
    one: "une centrale",
    the: "la centrale",
    w: 2,
    d: 2,
    pts: 5,
    price: 200,
    special: true,
    nuisance: true,
    effect: "Rapporte plus qu'une décharge, et fait perdre autant : 30 % à deux cases ou moins.",
  },
};

export const BUILD_ORDER: BuildKind[] = ["maison", "commerce", "immeuble", "tour", "parc", "stade", "monument", "decharge", "centrale"];
export const isBuildKind = (k: unknown): k is BuildKind => typeof k === "string" && Object.hasOwn(BUILDS, k);

/** Un bâtiment posé : sa sorte, la case de son coin en haut à gauche, et son quart de tour (0 à 3) */
export interface Placed {
  id: number;
  kind: BuildKind;
  x: number;
  z: number;
  rot: number;
}

/** La place qu'il prend : un quart de tour échange largeur et profondeur */
export function footprint(b: Pick<Placed, "kind" | "x" | "z" | "rot">): Rect {
  const info = BUILDS[b.kind];
  const turned = (b.rot & 1) === 1;
  return { x: b.x, z: b.z, w: turned ? info.d : info.w, d: turned ? info.w : info.d };
}

// ---------------------------------------------------------------------------
// Les prix
// ---------------------------------------------------------------------------

/** Ce que vaut un point de loyer dans cette ville : son loyer de monument classique, réparti sur ses cases de départ */
export function rentScale(index: number): number {
  const rents = SQUARES[index]?.rents;
  const size = baseSize(index);
  if (!rents || size === 0) return 0;
  return rents[5] / (5.5 * size);
}

const round5 = (n: number) => Math.max(10, Math.round(n / 5) * 5);

/** Le prix d'un bâtiment dans cette ville */
export function buildCost(kind: BuildKind, index: number): number {
  const info = BUILDS[kind];
  if (info.price !== undefined) return info.price;
  return round5((info.costPts ?? info.pts) * rentScale(index) * 2);
}

/** Ce que rend la banque d'un bâtiment démoli : la moitié de son prix */
export const refundOf = (kind: BuildKind, index: number) => Math.floor(buildCost(kind, index) / 2);

/** Le prix d'une case de terrain vague annexée : il suit le quartier */
export const annexCost = (index: number) => Math.max(30, Math.round(upgradeCost(index) / 2));

// ---------------------------------------------------------------------------
// Le territoire
// ---------------------------------------------------------------------------

export const lotOf = (deed: Deed | null | undefined): Placed[] => deed?.lot ?? [];
export const annexedOf = (deed: Deed | null | undefined): number[] => deed?.annexed ?? [];

/** Les cases de la ville : son territoire de départ et ce qu'elle a annexé */
export function areaOf(s: CapitaleState, index: number): Set<number> {
  return new Set([...baseCells(index), ...annexedOf(s.deeds[index])]);
}

/** La ville qui a annexé cette case de terrain vague, ou null */
export function annexedBy(s: CapitaleState, cell: number): number | null {
  for (const i of Object.keys(TERRITORIES).map(Number)) if (annexedOf(s.deeds[i]).includes(cell)) return i;
  return null;
}

/** Les cases occupées par les bâtiments d'une ville (sauf celui qu'on déplace) */
function occupied(s: CapitaleState, index: number, ignore: number | null): Set<number> {
  const out = new Set<number>();
  for (const b of lotOf(s.deeds[index])) if (b.id !== ignore) for (const c of rectCells(footprint(b))) out.add(c);
  return out;
}

/** Ce qui empêche de poser cette emprise dans la ville (hors frontières, place prise), ou null */
export function footprintProblem(s: CapitaleState, index: number, r: Rect, ignore: number | null = null): string | null {
  if (r.x < 0 || r.z < 0 || r.x + r.w > MAP || r.z + r.d > MAP) return "Hors de la carte.";
  const area = areaOf(s, index);
  const taken = occupied(s, index, ignore);
  for (const c of rectCells(r)) {
    if (!area.has(c)) return "Hors des frontières de la ville.";
    if (taken.has(c)) return "La place est déjà prise.";
  }
  return null;
}

/** Les cases libres d'une ville (dans ses frontières, sans bâtiment) */
export function freeCells(s: CapitaleState, index: number): number[] {
  const taken = occupied(s, index, null);
  return [...areaOf(s, index)].filter((c) => !taken.has(c));
}

// ---------------------------------------------------------------------------
// Le loyer
// ---------------------------------------------------------------------------

/** Les nuisances de la carte : leur emprise et leur propriétaire */
function nuisances(s: CapitaleState): { rect: Rect; owner: string; square: number; id: number }[] {
  const out: { rect: Rect; owner: string; square: number; id: number }[] = [];
  for (const i of Object.keys(TERRITORIES).map(Number)) {
    const d = s.deeds[i];
    if (!d?.owner || d.mortgaged) continue;
    for (const b of lotOf(d)) if (BUILDS[b.kind].nuisance) out.push({ rect: footprint(b), owner: d.owner, square: i, id: b.id });
  }
  return out;
}

/** Ce qui joue sur le loyer d'un bâtiment : les parcs et habitations qui le touchent, les nuisances à portée */
export interface BuildingRent {
  id: number;
  kind: BuildKind;
  rent: number;
  /** Les parcs qui le touchent (comptés), et le bonus qu'ils donnent */
  parcs: number;
  /** Les habitations qui touchent un commerce */
  neighbors: number;
  /** Les nuisances à portée (comptées) */
  nuisances: number;
}

/**
 * Le détail du loyer d'une ville : le terrain nu, puis chaque bâtiment. `extra` compte un bâtiment de plus (pour
 * l'aperçu d'un bâtiment qu'on s'apprête à poser) ; `skip` en retire un (celui qu'on déplace).
 */
export function cityRent(
  s: CapitaleState,
  index: number,
  opts: { extra?: Placed; skip?: number; extraNuisance?: { rect: Rect; owner: string } } = {},
): { bare: number; buildings: BuildingRent[]; total: number; full: boolean } {
  const deed = s.deeds[index];
  const sq = SQUARES[index];
  const empty = { bare: 0, buildings: [], total: 0, full: false };
  if (!deed?.owner || !sq?.rents) return empty;
  const owner = deed.owner;
  const full = ownsGroup(s, owner, sq.group!);
  const factor = full ? 2 : 1;
  const scale = rentScale(index);
  const lot = [...lotOf(deed).filter((b) => b.id !== opts.skip), ...(opts.extra ? [opts.extra] : [])];
  const rects = lot.map((b) => footprint(b));
  const near = nuisances(s).filter((n) => !(n.square === index && n.id === opts.skip));
  if (opts.extra && BUILDS[opts.extra.kind].nuisance) near.push({ rect: footprint(opts.extra), owner, square: index, id: opts.extra.id });
  if (opts.extraNuisance) near.push({ ...opts.extraNuisance, square: -1, id: -1 });
  const buildings = lot.map((b, k): BuildingRent => {
    const info = BUILDS[b.kind];
    const r = rects[k]!;
    let pts = info.pts;
    let parcs = 0;
    let hab = 0;
    lot.forEach((o, j) => {
      if (j === k || !rectsTouch(r, rects[j]!)) return;
      if (o.kind === "parc") parcs += 1;
      if (BUILDS[o.kind].habitation) hab += 1;
    });
    if (b.kind === "commerce") pts += Math.min(COMMERCE_MAX, hab);
    let mult = factor;
    if (info.habitation) mult *= 1 + PARC_BONUS * Math.min(PARC_MAX, parcs);
    let hurt = 0;
    if (!info.nuisance) {
      for (const n of near) {
        if (n.owner !== owner && allies(s, n.owner, owner)) continue;
        if (rectGap(n.rect, r) <= NUISANCE_REACH) hurt += 1;
      }
      mult *= 1 - Math.min(NUISANCE_MAX, NUISANCE_MALUS * hurt);
    }
    return {
      id: b.id,
      kind: b.kind,
      rent: pts * scale * mult,
      parcs: info.habitation ? Math.min(PARC_MAX, parcs) : 0,
      neighbors: b.kind === "commerce" ? Math.min(COMMERCE_MAX, hab) : 0,
      nuisances: hurt,
    };
  });
  const bare = sq.rents[0] * factor;
  const total = Math.round(bare + buildings.reduce((n, b) => n + b.rent, 0));
  return { bare, buildings: buildings.map((b) => ({ ...b, rent: Math.round(b.rent) })), total, full };
}

/** Le loyer d'une ville bâtie (sans tenir compte de l'hypothèque ni de la prison : c'est le moteur qui s'en charge) */
export const builderRent = (s: CapitaleState, index: number) => cityRent(s, index).total;

// ---------------------------------------------------------------------------
// Ce que valent les constructions
// ---------------------------------------------------------------------------

/** Ce qu'ont coûté les bâtiments d'une ville */
export const lotValue = (s: CapitaleState, index: number) => lotOf(s.deeds[index]).reduce((n, b) => n + buildCost(b.kind, index), 0);

/** Ce qu'a coûté le terrain annexé d'une ville */
export const landValue = (s: CapitaleState, index: number) => annexedOf(s.deeds[index]).length * annexCost(index);

/** Ce que rapporterait la démolition de tous les bâtiments d'une ville */
export const lotRefund = (s: CapitaleState, index: number) => lotOf(s.deeds[index]).reduce((n, b) => n + refundOf(b.kind, index), 0);

/** Les villes d'un joueur où il a bâti */
export const builtCities = (s: CapitaleState, playerId: string) => ownedBy(s, playerId).filter((i) => lotOf(s.deeds[i]).length > 0);

/** A-t-il déjà un stade ? */
export const builderHasStadium = (s: CapitaleState, playerId: string) =>
  ownedBy(s, playerId).some((i) => lotOf(s.deeds[i]).some((b) => b.kind === "stade"));

/** La ville a-t-elle son monument ? */
export const hasMonument = (s: CapitaleState, index: number) => lotOf(s.deeds[index]).some((b) => b.kind === "monument");

/** Un stade dans cette ville ? (les adversaires qui passent paient le billet) */
export const cityHasStadium = (s: CapitaleState, index: number) => lotOf(s.deeds[index]).some((b) => b.kind === "stade");

/**
 * Pour les cartes de travaux et de primes : les niveaux qu'équivalent les bâtiments d'une ville (ce qu'ils ont coûté,
 * en prix d'un niveau du quartier), et son monument compté comme celui de la Capitale classique
 */
export function levelEquivalent(s: CapitaleState, index: number): { levels: number; towers: number } {
  const lot = lotOf(s.deeds[index]);
  const spent = lot.filter((b) => b.kind !== "monument").reduce((n, b) => n + buildCost(b.kind, index), 0);
  return { levels: Math.floor(spent / upgradeCost(index)), towers: lot.some((b) => b.kind === "monument") ? 1 : 0 };
}

/** Le bâtiment qu'une catastrophe abat : le plus cher, jamais le monument (classé) ; au hasard pour un incendie */
export function knockable(s: CapitaleState, index: number): Placed[] {
  return lotOf(s.deeds[index])
    .filter((b) => b.kind !== "monument")
    .sort((a, b) => buildCost(b.kind, index) - buildCost(a.kind, index) || b.id - a.id);
}

// ---------------------------------------------------------------------------
// Ce qu'on a le droit de faire
// ---------------------------------------------------------------------------

/** Bâtir à tout moment, sauf pendant une enchère ; en dette, on ne peut que démolir */
export function builderRight(s: CapitaleState, playerId: string): "full" | "raise" | null {
  if (!s.settings.builder || s.step === "over" || s.step === "auction") return null;
  const p = playerOf(s, playerId);
  if (!p || p.bankrupt) return null;
  if (s.debts.some((d) => d.debtor === playerId)) return "raise";
  return "full";
}

function rightProblem(s: CapitaleState, playerId: string, raise = false): string | null {
  if (!s.settings.builder) return "On ne bâtit sur la carte qu'en Builder.";
  const right = builderRight(s, playerId);
  if (!right) return s.step === "auction" ? "Pas de travaux pendant une enchère." : "Pas de travaux pour l'instant.";
  if (right === "raise" && !raise) return "Règle d'abord ta dette : tu peux seulement démolir.";
  return null;
}

function cityProblem(s: CapitaleState, playerId: string, index: number): string | null {
  const deed = s.deeds[index];
  if (!TERRITORIES[index] || !deed) return "On ne bâtit que dans les villes.";
  if (deed.owner !== playerId) return "Cette ville n'est pas à toi.";
  if (deed.mortgaged) return "Cette ville est hypothéquée.";
  return null;
}

/**
 * Peut-on poser ce bâtiment dans cette ville, où que ce soit ? (le moment, la ville, le quartier, un seul monument, un
 * seul stade ; et l'argent, sauf `cash: false`)
 */
export function kindProblem(s: CapitaleState, playerId: string, index: number, kind: BuildKind, cash = true): string | null {
  const right = rightProblem(s, playerId);
  if (right) return right;
  if (!isBuildKind(kind)) return "Ce bâtiment n'existe pas.";
  const city = cityProblem(s, playerId, index);
  if (city) return city;
  const info = BUILDS[kind];
  if (info.special && !s.settings.specials) return "Les bâtiments spéciaux ne sont pas de la partie.";
  const g = groupOf(index)!;
  if (info.district && !ownsGroup(s, playerId, g.id))
    return `Il faut tout le quartier ${GROUPS[g.id].name.toLowerCase()} pour ${info.one}.`;
  if (info.perCity && lotOf(s.deeds[index]).some((b) => b.kind === kind)) return `La ville a déjà ${info.the}.`;
  if (info.perPlayer && kind === "stade" && builderHasStadium(s, playerId)) return "Tu as déjà un stade.";
  if (cash) {
    const price = buildCost(kind, index);
    if (playerOf(s, playerId)!.cash < price) return `Il faut ${price}.`;
  }
  return null;
}

/** Peut-on poser ce bâtiment là, dans cette ville ? */
export function placeProblem(
  s: CapitaleState,
  playerId: string,
  index: number,
  kind: BuildKind,
  x: number,
  z: number,
  rot: number,
): string | null {
  return (
    kindProblem(s, playerId, index, kind, false) ??
    footprintProblem(s, index, footprint({ kind, x, z, rot })) ??
    kindProblem(s, playerId, index, kind, true)
  );
}

/** Peut-on déplacer (ou tourner) ce bâtiment ? Gratuit, dans la même ville ; une nuisance ne se déplace pas */
export function relocateProblem(
  s: CapitaleState,
  playerId: string,
  index: number,
  id: number,
  x: number,
  z: number,
  rot: number,
): string | null {
  const right = rightProblem(s, playerId);
  if (right) return right;
  const city = cityProblem(s, playerId, index);
  if (city) return city;
  const b = lotOf(s.deeds[index]).find((o) => o.id === id);
  if (!b) return "Ce bâtiment n'est plus là.";
  if (BUILDS[b.kind].nuisance) return `${BUILDS[b.kind].name.replace(/^./, (c) => c.toUpperCase())} ne se déplace pas : démolis-la.`;
  if (b.x === x && b.z === z && (b.rot & 3) === (rot & 3)) return "Il est déjà là.";
  return footprintProblem(s, index, footprint({ kind: b.kind, x, z, rot }), id);
}

/** Peut-on démolir ce bâtiment ? À tout moment hors enchère, dette comprise : la banque en rend la moitié */
export function demolishProblem(s: CapitaleState, playerId: string, index: number, id: number): string | null {
  const right = rightProblem(s, playerId, true);
  if (right) return right;
  const deed = s.deeds[index];
  if (!TERRITORIES[index] || !deed) return "On ne bâtit que dans les villes.";
  if (deed.owner !== playerId) return "Cette ville n'est pas à toi.";
  if (!lotOf(deed).some((b) => b.id === id)) return "Ce bâtiment n'est plus là.";
  return null;
}

/** Peut-on annexer cette case de terrain vague à cette ville ? Elle doit toucher ses frontières */
export function annexProblem(s: CapitaleState, playerId: string, index: number, cell: number): string | null {
  const right = rightProblem(s, playerId);
  if (right) return right;
  const city = cityProblem(s, playerId, index);
  if (city) return city;
  if (!Number.isInteger(cell) || !isVague(cell)) return "On n'annexe que du terrain vague.";
  if (annexedBy(s, cell) !== null) return "Cette case est déjà annexée.";
  const area = areaOf(s, index);
  if (!neighbors(cell).some((n) => area.has(n))) return "La case doit toucher les frontières de la ville.";
  if (annexedOf(s.deeds[index]).length >= maxAnnex(index))
    return `La ville a atteint sa taille maximale (${baseSize(index) + maxAnnex(index)} cases).`;
  const price = annexCost(index);
  if (playerOf(s, playerId)!.cash < price) return `Il faut ${price}.`;
  return null;
}

/** Les cases de terrain vague que cette ville peut annexer maintenant (sans parler d'argent) */
export function annexable(s: CapitaleState, index: number): number[] {
  const deed = s.deeds[index];
  if (!deed || annexedOf(deed).length >= maxAnnex(index)) return [];
  const area = areaOf(s, index);
  const taken = new Set(Object.keys(TERRITORIES).flatMap((i) => annexedOf(s.deeds[Number(i)])));
  const out = new Set<number>();
  for (const c of area) for (const n of neighbors(c)) if (isVague(n) && !taken.has(n) && !area.has(n)) out.add(n);
  return [...out].sort((a, b) => a - b);
}

/** Toutes les cases de terrain vague de la carte */
export const vagueCells = () => CELLS.flatMap((c, i) => (c.kind === "vague" ? [i] : []));
