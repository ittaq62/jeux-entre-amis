// Capitale Builder : les bots bâtissent leurs villes. À chaque coup, ils essaient chaque bâtiment à chaque place libre
// de chacune de leurs villes et gardent celui qui rapporte le plus de loyer pour son prix (le monument d'abord quand
// le quartier le permet). Fort pose aussi ses nuisances là où elles coûtent le plus aux adversaires, et annexe le
// la réserve du quartier avant les voisins. Peu de coups par tour, pour que la partie avance.

import { SQUARES } from "./board.ts";
import {
  annexable,
  annexCost,
  annexedOf,
  areaOf,
  buildCost,
  BUILD_ORDER,
  BUILDER_TICKET,
  BUILDS,
  cityRent,
  footprint,
  freeCells,
  lotOf,
  NUISANCE_REACH,
  placeProblem,
  refundOf,
  rentScale,
  type BuildKind,
  type Placed,
} from "./builder.ts";
import { MAP, MAP_CITIES, maxAnnex, neighbors, rectGap } from "./builderMap.ts";
import { allies, ownedBy, ownsGroup, playerOf, type BotLevel, type CapitaleAction, type CapitaleState } from "./engine.ts";

/** Combien de constructions un bot fait dans son tour, au plus */
const PER_TURN: Record<BotLevel, number> = { facile: 2, moyen: 3, fort: 4 };

/** Ce que chaque niveau sait poser */
const KINDS: Record<BotLevel, BuildKind[]> = {
  facile: ["maison", "commerce", "immeuble", "tour", "monument"],
  moyen: ["maison", "commerce", "immeuble", "tour", "parc", "stade", "monument", "decharge"],
  fort: BUILD_ORDER,
};

/** Les constructions déjà faites par le joueur dont c'est le tour */
export const buildsThisTurn = (s: CapitaleState) => (s.site.turnId === s.turnId ? s.site.upgraded.length : 0);

/** Ce que rapporterait de plus la ville avec ce bâtiment (sa propre ville), en loyer */
function ownGain(s: CapitaleState, index: number, b: Placed): number {
  return cityRent(s, index, { extra: b }).total - cityRent(s, index).total;
}

/** Une nuisance posée là : ce qu'elle fait perdre aux villes d'à côté (adverses en positif, les siennes en négatif) */
function nuisanceEffect(s: CapitaleState, playerId: string, index: number, b: Placed): { rivals: number; mine: number } {
  const rect = footprint(b);
  let rivals = 0;
  let mine = 0;
  for (const i of MAP_CITIES) {
    if (i === index) continue;
    const d = s.deeds[i];
    if (!d?.owner || d.mortgaged || lotOf(d).length === 0) continue;
    if (!lotOf(d).some((o) => rectGap(footprint(o), rect) <= NUISANCE_REACH)) continue;
    const loss = cityRent(s, i).total - cityRent(s, i, { extraNuisance: { rect, owner: playerId } }).total;
    if (d.owner === playerId) mine += loss;
    else if (!allies(s, d.owner, playerId)) rivals += loss;
  }
  return { rivals, mine };
}

/** Le meilleur bâtiment à poser maintenant, ou null : le plus de loyer pour son prix, en gardant sa réserve */
function bestBuild(s: CapitaleState, playerId: string, level: BotLevel, keep: number, allowAttack: boolean): CapitaleAction | null {
  const p = playerOf(s, playerId)!;
  const rivals = s.players.filter((x) => !x.bankrupt && !allies(s, x.id, playerId)).length;
  let best: { action: CapitaleAction; score: number } | null = null;
  for (const index of ownedBy(s, playerId)) {
    if (SQUARES[index]!.kind !== "property" || s.deeds[index]!.mortgaged) continue;
    const free = new Set(freeCells(s, index));
    if (free.size === 0) continue;
    const full = ownsGroup(s, playerId, SQUARES[index]!.group!);
    const scale = rentScale(index);
    for (const kind of KINDS[level]) {
      const info = BUILDS[kind];
      if (info.nuisance && !allowAttack) continue;
      if (info.district && !full) continue;
      const cost = buildCost(kind, index);
      // Le monument passe avant tout : on y met un peu plus de sa réserve
      const margin = kind === "monument" ? 0.8 : 1;
      if (p.cash - cost < keep * margin) continue;
      const rots = info.w === info.d ? [0] : [0, 1];
      let kindBest: { action: CapitaleAction; score: number } | null = null;
      for (const cell of free) {
        const x = cell % MAP;
        const z = Math.floor(cell / MAP);
        for (const rot of rots) {
          if (placeProblem(s, playerId, index, kind, x, z, rot) !== null) continue;
          const b: Placed = { id: -1, kind, x, z, rot };
          let gain = ownGain(s, index, b);
          if (kind === "stade") gain += BUILDER_TICKET * rivals * 0.6;
          if (info.nuisance) {
            const e = nuisanceEffect(s, playerId, index, b);
            // Une nuisance ne vaut que par ce qu'elle coûte aux adversaires
            if (e.rivals <= 0) continue;
            gain += e.rivals * (level === "fort" ? 0.8 : 0.5) - e.mine;
          }
          // Le loyer pour son prix, et pour la place qu'il prend (une ville se remplit : la place compte autant que l'argent)
          const cells = info.w * info.d;
          let score = gain / cost + gain / (cells * scale * 5);
          if (kind === "monument") score += 1;
          if (!kindBest || score > kindBest.score) kindBest = { action: { type: "build", square: index, kind, x, z, rot }, score };
        }
      }
      if (kindBest && (!best || kindBest.score > best.score)) best = kindBest;
    }
  }
  // Facile ne pose que ce qui rapporte franchement ; les autres, tout ce qui rapporte
  const floor = level === "facile" ? 0.7 : 0.3;
  return best && best.score >= floor ? best.action : null;
}

/** Une case de la réserve à annexer : quand une ville manque de place, la case qui garde la ville la plus ramassée */
function bestAnnex(s: CapitaleState, playerId: string, level: BotLevel, keep: number): CapitaleAction | null {
  if (level === "facile") return null;
  const p = playerOf(s, playerId)!;
  let best: { action: CapitaleAction; score: number } | null = null;
  for (const index of ownedBy(s, playerId)) {
    if (SQUARES[index]!.kind !== "property" || s.deeds[index]!.mortgaged) continue;
    if (annexedOf(s.deeds[index]).length >= maxAnnex(index)) continue;
    const price = annexCost(index);
    if (p.cash - price < keep * (level === "fort" ? 1.2 : 1.8)) continue;
    // Une ville encore vide n'en a pas besoin ; Fort prend les cases disputées avant ses voisins
    const free = freeCells(s, index).length;
    if (free > (level === "fort" ? 3 : 1)) continue;
    const area = areaOf(s, index);
    for (const cell of annexable(s, index)) {
      const hugs = neighbors(cell).filter((n) => area.has(n)).length;
      const score = hugs + (SQUARES[index]!.rents![5] / 2000) * 2;
      if (!best || score > best.score) best = { action: { type: "annex", square: index, cell }, score };
    }
  }
  return best?.action ?? null;
}

/** Le coup de Builder du bot dans son tour : bâtir, ou annexer quand ses villes sont pleines ; null quand il a fini */
export function builderMove(
  s: CapitaleState,
  playerId: string,
  level: BotLevel,
  keep: number,
  allowAttack: boolean,
): CapitaleAction | null {
  if (buildsThisTurn(s) >= PER_TURN[level]) return null;
  return bestBuild(s, playerId, level, keep, allowAttack) ?? bestAnnex(s, playerId, level, keep);
}

/** Pour payer une dette : le bâtiment dont la démolition coûte le moins de loyer pour ce qu'elle rapporte */
export function cheapestDemolition(s: CapitaleState, playerId: string): CapitaleAction | null {
  let best: { action: CapitaleAction; score: number } | null = null;
  for (const index of ownedBy(s, playerId)) {
    const lot = lotOf(s.deeds[index]);
    if (lot.length === 0) continue;
    const now = cityRent(s, index).total;
    for (const b of lot) {
      const loss = now - cityRent(s, index, { skip: b.id }).total;
      const score = loss / Math.max(1, refundOf(b.kind, index));
      if (!best || score < best.score) best = { action: { type: "demolish", square: index, id: b.id }, score };
    }
  }
  return best?.action ?? null;
}
