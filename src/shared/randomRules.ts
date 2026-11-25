// Les règles au hasard d'une table : les mêmes variantes que la tournée (`tour.ts`), tirées par le serveur. Le tirage
// se voit au salon avant la partie, s'applique au lancement, et un nouveau tirage est fait à la fin de chaque partie
// pour la suivante. Les réglages de la table qui ne sont pas des règles (chrono, bots, places, équipes…) restent ceux de
// l'hôte. Au UNO, « pas de UNO d'avance » est une règle : au hasard, il est tiré à part (comme à la tournée), sinon
// l'hôte le coche.

import type { GameId } from "./protocol.ts";
import { drawVariant, findVariant, ruleLines, variantKeys, variantSettings, type RuleLine, type TourVariant } from "./tour.ts";

/**
 * Les règles que le tirage décide en plus de celles que touchent les variantes : celles que leurs descriptions
 * annoncent (« les +2 et les +4 se cumulent », « trois allumettes »…). Elles repartent de leur valeur habituelle.
 */
const ALSO_DRAWN: Partial<Record<GameId, string[]>> = {
  uno: ["stacking"],
  capitale: ["specials"],
  meche: ["lives", "passes"],
};

/** Les descriptions propres aux tables, quand celle de la tournée parle de la tournée */
const TABLE_BLURBS: Partial<Record<GameId, Record<string, string>>> = {
  // La durée d'une partie de Capitale, à une table, est celle de l'hôte (la tournée joue 20 minutes)
  capitale: { classique: "Le plateau des villes et ses bâtiments spéciaux : le plus riche gagne." },
  // Une table de Culbute joue un seul combat (la tournée en enchaîne trois)
  culbute: { classique: "Trois vies chacun." },
  // Une table de minigolf joue neuf trous (la tournée en joue trois)
  minigolf: { classique: "Neuf trous d'un parcours tiré au sort.", six: "Six trous d'un parcours tiré au sort." },
  // Une table de bowling joue dix frames (la tournée en joue trois)
  bowling: { classique: "Dix frames : strikes et spares comptés comme au vrai bowling." },
  // Une table de billard joue les manches, vies et points de l'hôte (la tournée les raccourcit)
  billard: {
    huit: "Sa famille, puis la noire dans la poche annoncée.",
    neuf: "Toujours la plus petite bille d'abord : qui rentre la 9 gagne la manche.",
    killer: "Chacun ses vies : à chaque passage, il faut rentrer une bille.",
    carambole: "La carambole : sa bille doit toucher les deux autres.",
  },
};

/** Les réglages que fixe le tirage : ceux-là ne se choisissent plus à la main tant que les règles sont au hasard */
export function drawnKeys(game: GameId): string[] {
  return [...new Set([...variantKeys(game), ...(ALSO_DRAWN[game] ?? [])])];
}

/**
 * Une explication qui suit « Nom de la règle : » dans la même phrase : sans majuscule, comme on l'écrit après un
 * deux-points. Un sigle (« UNO d'avance… ») garde ses capitales.
 */
export function afterColon(text: string): string {
  const [first, second] = text;
  if (!first || (second && second !== second.toLowerCase())) return text;
  return first.toLowerCase() + text.slice(1);
}

/**
 * Les règles tirées pour une table, une par ligne (le format, puis chaque règle à part), avec les mots d'une table ;
 * vide si l'id est inconnu
 */
export function drawnLines(game: GameId, id: string | null | undefined): RuleLine[] {
  return ruleLines(game, id).map((line) => {
    const own = line.kind === "base" ? TABLE_BLURBS[game]?.[line.id] : undefined;
    return own ? { ...line, blurb: own } : line;
  });
}

/** Les règles tirées, nommées et décrites en une phrase pour une table (null si l'id est inconnu) */
export function drawnRules(game: GameId, id: string | null | undefined): TourVariant | null {
  const v = findVariant(game, id);
  if (!v) return null;
  const lines = drawnLines(game, id).filter((l) => l.kind !== "off");
  return { ...v, blurb: lines.map((l) => l.blurb).join(" ") };
}

/** En une ligne courte (en-tête d'une table) : le format, et combien de règles à part s'y ajoutent */
export function drawnShort(game: GameId, id: string | null | undefined): string | null {
  const [base, ...rest] = drawnLines(game, id).filter((l) => l.kind !== "off");
  if (!base) return null;
  return rest.length === 0 ? base.name : `${base.name} + ${rest.length} règle${rest.length > 1 ? "s" : ""}`;
}

/** Un tirage pour la partie suivante : autre chose que le tirage d'avant quand c'est possible */
export function drawRules(game: GameId, random: () => number, previous?: string | null): string {
  let id = drawVariant(game, random);
  for (let k = 0; k < 8 && id === previous; k++) id = drawVariant(game, random);
  return id;
}

/**
 * Les réglages d'une partie aux règles tirées : ceux de l'hôte, les règles tirées remises à leur valeur habituelle,
 * puis la variante. Sans tirage (ou s'il est inconnu), les réglages ne changent pas.
 */
export function applyDrawnRules<S extends object>(game: GameId, settings: S, defaults: S, id: string | null | undefined): S {
  if (!id || !findVariant(game, id)) return settings;
  const reset = Object.fromEntries(
    drawnKeys(game)
      .filter((k) => k in defaults)
      .map((k) => [k, defaults[k as keyof S]]),
  );
  return { ...settings, ...reset, ...(variantSettings(game as "uno", id) as Partial<S>) };
}

/** Pendant un tirage, l'hôte ne règle plus à la main ce que le tirage décide : on retire ces clés de sa demande */
export function withoutDrawnKeys<P extends object>(game: GameId, patch: P): P {
  const keys = new Set(drawnKeys(game));
  return Object.fromEntries(Object.entries(patch).filter(([k]) => !keys.has(k))) as P;
}

/**
 * Ce que fait la demande de l'hôte sur le tirage : `true` tire (ou retire) au sort, `false` revient aux règles
 * choisies, en gardant celles qui étaient tirées pour qu'elles restent affichées. Rien si la demande n'en parle pas.
 */
export function hostDraw<S extends object>(
  game: GameId,
  current: string | null | undefined,
  settings: S,
  defaults: S,
  on: unknown,
  random: () => number,
): { draw: string | null; settings: S; notice: string } | null {
  if (typeof on !== "boolean") return null;
  if (!on && !current) return null;
  const draw = on ? drawRules(game, random, current) : null;
  return { draw, settings: on ? settings : applyDrawnRules(game, settings, defaults, current), notice: drawNotice(game, draw, "now") };
}

/** La demande de l'hôte, sans ce que décide le tirage s'il y en a un */
export function hostPatch<P extends object>(game: GameId, draw: string | null | undefined, patch: P | undefined): P {
  return draw ? withoutDrawnKeys(game, patch ?? ({} as P)) : (patch ?? ({} as P));
}

/** Le tirage gardé dans les réglages d'une table, vérifié (une valeur inconnue revient aux règles au choix) */
export function cleanDraw(game: GameId, raw: unknown): string | null {
  return typeof raw === "string" && findVariant(game, raw) ? raw : null;
}

/** Le message de la discussion qui annonce un tirage (ou la fin des règles au hasard) */
export function drawNotice(game: GameId, id: string | null, when: "now" | "start" | "next"): string {
  const v = drawnRules(game, id);
  if (!v) return "Les règles ne sont plus tirées au sort : l'hôte les choisit.";
  const head =
    when === "start"
      ? "Règles tirées au sort pour cette partie"
      : when === "next"
        ? "Pour la prochaine partie, règles tirées au sort"
        : "Règles tirées au sort";
  return `${head} : ${v.name}. ${v.blurb}`;
}
