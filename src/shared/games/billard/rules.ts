// Les règles : ce que vaut un coup joué, d'après ce que la physique a fait (la première bille touchée par la blanche,
// les bandes, les billes tombées). Quatre jeux :
//
// - Pleines et rayées : on rentre sa famille (les pleines de 1 à 7 ou les rayées de 9 à 15), puis la noire, dans la
//   poche annoncée. La table est « ouverte » après la casse : la première bille rentrée sans faute donne sa famille.
//   Faute (la blanche tombe, rien de touché, la mauvaise bille d'abord, aucune bande après le contact) : l'adversaire a
//   la bille en main. La noire trop tôt, sur une faute ou dans une autre poche : la manche est perdue.
// - La bille 9 : on touche toujours d'abord la plus petite bille du tapis ; qui rentre la 9 sans faute gagne la manche
//   (même par ricochet, même à la casse). Faute : bille en main pour le suivant ; une 9 tombée sur une faute revient.
// - Le Killer : chacun a ses vies, un coup chacun son tour ; il faut rentrer une bille, sinon on perd une vie (pas à la
//   casse). Une faute coûte une vie. La noire rentrée sans faute rapporte une vie. Le dernier en vie gagne.
// - Trois billes (carambole) : chacun joue sa bille (la blanche ou la jaune) et marque un point quand elle touche les
//   deux autres ; on rejoue tant qu'on marque. En « une bande » ou « trois bandes », la bille doit avoir touché autant de
//   bandes avant la seconde bille.

import type { PhysEvent } from "./physics.ts";
import type { BallSpot } from "./shot.ts";

export type Variant = "huit" | "neuf" | "killer" | "carambole";
export type Group = "pleines" | "rayees";
export type Foul = "blanche" | "rien" | "mauvaise" | "bande" | "sortie";

export const FOUL_TEXT: Record<Foul, string> = {
  blanche: "La blanche est tombée",
  rien: "Aucune bille touchée",
  mauvaise: "Pas la bonne bille d'abord",
  bande: "Aucune bande après le contact",
  sortie: "Une bille a sauté de la table",
};

/** Les billes de carambole : la blanche, la jaune, la rouge */
export const CAROM_WHITE = 0;
export const CAROM_YELLOW = 1;
export const CAROM_RED = 2;

export const groupOf = (id: number): Group | null => (id >= 1 && id <= 7 ? "pleines" : id >= 9 && id <= 15 ? "rayees" : null);
export const otherGroup = (g: Group): Group => (g === "pleines" ? "rayees" : "pleines");

/** Ce qu'il s'est passé pendant le coup, lu dans les chocs */
export interface ShotFacts {
  /** La première bille touchée par la bille jouée (−1 : aucune) */
  first: number;
  firstStep: number;
  /** Les billes touchées par la bille jouée, dans l'ordre, chacune une fois */
  touched: number[];
  /** Les bandes touchées par la bille jouée avant de toucher sa deuxième bille (carambole) */
  railsBeforeSecond: number;
  /** Les bandes touchées par la bille jouée pendant tout le coup */
  cueRails: number;
  /** Une bille (n'importe laquelle) a touché une bande après le premier contact */
  railAfterContact: boolean;
  /** Les billes tombées (pas la bille jouée), dans l'ordre, et leur poche */
  potted: { id: number; pocket: number; s: number }[];
  cuePotted: boolean;
  /** Une bille est sortie de la table */
  off: boolean;
  /** Une bille rentrée après avoir touché une bande avant (une bande « directe » de la bille visée) */
  banked: number[];
}

export function factsOf(cue: number, events: readonly PhysEvent[]): ShotFacts {
  const f: ShotFacts = {
    first: -1,
    firstStep: -1,
    touched: [],
    railsBeforeSecond: 0,
    cueRails: 0,
    railAfterContact: false,
    potted: [],
    cuePotted: false,
    off: false,
    banked: [],
  };
  // Les billes visées qui ont touché une bande depuis leur premier choc (pour reconnaître une bille rentrée « par la bande »)
  const hitBy = new Map<number, number>();
  const railed = new Set<number>();
  for (const e of events) {
    if (e.k === "bille") {
      const other = e.a === cue ? e.b : e.b === cue ? e.a : -1;
      if (other >= 0) {
        if (f.first < 0) {
          f.first = other;
          f.firstStep = e.s;
        }
        if (!f.touched.includes(other)) f.touched.push(other);
      }
      for (const id of [e.a, e.b]) {
        if (id !== cue && !hitBy.has(id)) hitBy.set(id, e.s);
        // Un nouveau choc après la bande : ce n'est plus une bande directe
        if (id !== cue) railed.delete(id);
      }
    } else if (e.k === "bande") {
      if (f.first >= 0) f.railAfterContact = true;
      if (e.a === cue) {
        f.cueRails++;
        if (f.touched.length < 2) f.railsBeforeSecond++;
      } else if (hitBy.has(e.a) && e.b <= 5 && e.v > 0.2) railed.add(e.a);
    } else if (e.k === "poche" || e.k === "sortie") {
      if (e.k === "sortie") f.off = true;
      if (e.a === cue) f.cuePotted = true;
      else {
        f.potted.push({ id: e.a, pocket: e.k === "poche" ? e.b : -1, s: e.s });
        if (railed.has(e.a)) f.banked.push(e.a);
      }
    }
  }
  return f;
}

/** Ce que vaut un coup, et ce qui vient ensuite */
export interface Outcome {
  foul: Foul | null;
  /** La bille jouée continue (le même joueur rejoue) */
  keep: boolean;
  /** L'annonce, et son ton */
  text: string;
  sub?: string;
  tone: "great" | "good" | "info" | "bad";
  /** La manche est finie : gagnée ou perdue par le camp qui jouait */
  rack?: "won" | "lost";
  /** Pleines et rayées : la famille que prend le camp qui jouait */
  assign?: Group;
  /** Le prochain a la bille en main (derrière la ligne de tête, ou partout) */
  inHand: "tete" | "partout" | null;
  /** Les billes à remettre sur le tapis (la noire tombée à la casse, la 9 tombée sur une faute) */
  respot: number[];
  /** Killer : le changement de vies du joueur ; carambole : ses points */
  lives?: number;
  points?: number;
  /** Le nombre de billes rentrées qui comptent pour le joueur (pour les stats) */
  scored: number;
  /** Un beau coup, à revoir au ralenti : le pas du moment clé, et où sur la table */
  highlight?: { s: number; x: number; y: number; kind: "victoire" | "serie" | "bande" | "carambolage" | "noire" };
}

/** Ce qu'il faut savoir de la partie pour juger le coup */
export interface RulesState {
  variant: Variant;
  /** Le coup est une casse */
  breakShot: boolean;
  /** La bille jouée */
  cue: number;
  /** Les billes sur le tapis avant le coup */
  before: readonly BallSpot[];
  /** Pleines et rayées : la famille du camp qui joue (null : table ouverte) */
  group: Group | null;
  /** Pleines et rayées : la poche annoncée pour la noire */
  call: number | null;
  /** Carambole : les bandes qu'il faut (0, 1 ou 3) */
  bandes: number;
}

/** Le moment où une bille tombe, avec sa place (pour le ralenti) */
function potMoment(events: readonly PhysEvent[], id: number) {
  const e = events.find((x) => (x.k === "poche" || x.k === "sortie") && x.a === id);
  return e ? { s: e.s, x: e.x, y: e.y } : null;
}

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

export function judge(st: RulesState, events: readonly PhysEvent[]): Outcome {
  const f = factsOf(st.cue, events);
  if (st.variant === "huit") return judgeHuit(st, f, events);
  if (st.variant === "neuf") return judgeNeuf(st, f, events);
  if (st.variant === "killer") return judgeKiller(st, f, events);
  return judgeCarom(st, f, events);
}

/** Le coup a été « joli » : plusieurs billes, ou une par la bande */
function niceShot(f: ShotFacts, events: readonly PhysEvent[], breakShot: boolean): Outcome["highlight"] {
  if (breakShot) return undefined;
  if (f.potted.length >= 3) {
    const m = potMoment(events, f.potted[f.potted.length - 1]!.id)!;
    return { ...m, kind: "serie" };
  }
  if (f.banked.length > 0) {
    const m = potMoment(events, f.banked[0]!)!;
    return { ...m, kind: "bande" };
  }
  return undefined;
}

function judgeHuit(st: RulesState, f: ShotFacts, events: readonly PhysEvent[]): Outcome {
  const g = st.group;
  const onTable = (grp: Group) => st.before.filter((b) => groupOf(b.id) === grp).length;
  const ownLeft = g ? onTable(g) : 7;
  const potted = f.potted.map((p) => p.id);
  const eight = f.potted.find((p) => p.id === 8);
  let foul: Foul | null = null;
  if (f.cuePotted) foul = "blanche";
  else if (f.off) foul = "sortie";
  else if (f.first < 0) foul = "rien";
  else if (!st.breakShot) {
    const legalFirst = g === null ? f.first !== 8 : ownLeft > 0 ? groupOf(f.first) === g : f.first === 8;
    if (!legalFirst) foul = "mauvaise";
    else if (f.potted.length === 0 && !f.railAfterContact) foul = "bande";
  }
  const respot: number[] = [];
  const out = (o: Partial<Outcome> & Pick<Outcome, "text" | "tone">): Outcome => ({
    foul,
    keep: false,
    inHand: foul ? "partout" : null,
    respot,
    scored: 0,
    ...o,
  });

  if (eight) {
    if (st.breakShot) {
      // La noire à la casse : elle revient sur le point, et la partie continue
      respot.push(8);
    } else {
      const m = potMoment(events, 8)!;
      if (foul) return out({ text: "La noire et une faute", sub: "La manche est perdue", tone: "bad", rack: "lost" });
      if (g === null || ownLeft > 0) return out({ text: "La noire trop tôt !", sub: "La manche est perdue", tone: "bad", rack: "lost" });
      if (st.call !== null && eight.pocket !== st.call)
        return out({ text: "La noire dans la mauvaise poche", sub: "La manche est perdue", tone: "bad", rack: "lost" });
      return out({
        text: "La noire !",
        sub: "La manche est gagnée",
        tone: "great",
        rack: "won",
        scored: 1,
        highlight: { ...m, kind: "victoire" },
      });
    }
  }
  if (foul) return out({ text: FOUL_TEXT[foul], sub: "Bille en main pour l'adversaire", tone: "bad" });
  if (st.breakShot) {
    const n = potted.filter((id) => id !== 8).length;
    if (n === 0 && respot.length === 0) return out({ text: "La casse", sub: "Rien n'est tombé", tone: "info" });
    return out({
      text: n > 0 ? `${plural(n, "bille")} à la casse` : "La noire à la casse",
      sub: respot.length ? "La noire revient sur son point" : "La table reste ouverte",
      tone: "good",
      keep: true,
      scored: n,
    });
  }
  let mine = g;
  let assign: Group | undefined;
  if (g === null) {
    const firstPot = f.potted.find((p) => groupOf(p.id) !== null);
    if (firstPot) {
      assign = groupOf(firstPot.id)!;
      mine = assign;
    }
  }
  const own = mine ? potted.filter((id) => groupOf(id) === mine).length : 0;
  const hl = niceShot(f, events, false);
  if (own > 0) {
    const left = mine ? onTable(mine) - own : 7;
    return out({
      text: assign ? `Les ${assign === "pleines" ? "pleines" : "rayées"} !` : own > 1 ? `${own} billes !` : "Rentrée !",
      sub: left === 0 ? "Plus que la noire" : assign ? `${plural(left, "bille")} à rentrer` : undefined,
      tone: own > 1 || hl ? "great" : "good",
      keep: true,
      assign,
      scored: own,
      highlight: hl,
    });
  }
  if (potted.length > 0) return out({ text: "Une bille de l'adversaire", sub: "La main passe", tone: "info", assign });
  return out({ text: "Manqué", tone: "info" });
}

function judgeNeuf(st: RulesState, f: ShotFacts, events: readonly PhysEvent[]): Outcome {
  let lowest = 99;
  for (const b of st.before) if (b.id !== st.cue && b.id < lowest) lowest = b.id;
  let foul: Foul | null = null;
  if (f.cuePotted) foul = "blanche";
  else if (f.off) foul = "sortie";
  else if (f.first < 0) foul = "rien";
  else if (f.first !== lowest) foul = "mauvaise";
  else if (!st.breakShot && f.potted.length === 0 && !f.railAfterContact) foul = "bande";
  const respot: number[] = [];
  const nine = f.potted.find((p) => p.id === 9);
  const base = { foul, keep: false, inHand: foul ? ("partout" as const) : null, respot, scored: 0 };
  if (nine && !foul) {
    const m = potMoment(events, 9)!;
    return {
      ...base,
      text: st.breakShot ? "La 9 à la casse !" : "La 9 !",
      sub: "La manche est gagnée",
      tone: "great",
      rack: "won",
      scored: f.potted.length,
      highlight: { ...m, kind: "victoire" },
    };
  }
  if (nine) respot.push(9);
  if (foul)
    return {
      ...base,
      text: FOUL_TEXT[foul],
      sub: nine ? "La 9 revient · bille en main pour le suivant" : `Il fallait toucher la ${lowest} · bille en main`,
      tone: "bad",
    };
  const n = f.potted.length;
  if (n > 0)
    return {
      ...base,
      keep: true,
      text: st.breakShot ? `${plural(n, "bille")} à la casse` : n > 1 ? `${n} billes !` : "Rentrée !",
      tone: n > 1 ? "great" : "good",
      scored: n,
      highlight: niceShot(f, events, st.breakShot),
    };
  return { ...base, text: st.breakShot ? "La casse" : "Manqué", sub: st.breakShot ? "Rien n'est tombé" : undefined, tone: "info" };
}

function judgeKiller(st: RulesState, f: ShotFacts, events: readonly PhysEvent[]): Outcome {
  let foul: Foul | null = null;
  if (f.cuePotted) foul = "blanche";
  else if (f.off) foul = "sortie";
  else if (f.first < 0) foul = "rien";
  const n = f.potted.length;
  const black = f.potted.some((p) => p.id === 8);
  const base = { foul, keep: false, inHand: f.cuePotted ? ("partout" as const) : null, respot: [] as number[], scored: foul ? 0 : n };
  if (foul) return { ...base, text: FOUL_TEXT[foul], sub: "Une vie de moins", tone: "bad", lives: -1 };
  if (n === 0) {
    if (st.breakShot) return { ...base, text: "La casse", sub: "Rien n'est tombé", tone: "info", lives: 0 };
    return { ...base, text: "Manqué !", sub: "Une vie de moins", tone: "bad", lives: -1 };
  }
  const hl = black ? { ...potMoment(events, 8)!, kind: "noire" as const } : niceShot(f, events, st.breakShot);
  return {
    ...base,
    text: black ? "La noire !" : n > 1 ? `${n} billes !` : "Sauvé !",
    sub: black ? "Une vie de plus" : undefined,
    tone: black || n > 1 ? "great" : "good",
    lives: black ? 1 : 0,
    highlight: hl,
  };
}

function judgeCarom(st: RulesState, f: ShotFacts, events: readonly PhysEvent[]): Outcome {
  const others = st.before.filter((b) => b.id !== st.cue).map((b) => b.id);
  const both = others.every((id) => f.touched.includes(id));
  const base = { foul: null, keep: false, inHand: null, respot: [] as number[], scored: 0 };
  // À la casse, la bille jouée doit d'abord toucher la rouge
  if (st.breakShot && f.first >= 0 && f.first !== CAROM_RED)
    return { ...base, text: "Il fallait la rouge d'abord", tone: "bad", points: 0 };
  if (f.first < 0) return { ...base, text: "Aucune bille touchée", tone: "bad", points: 0 };
  if (!both) return { ...base, text: "Manqué", tone: "info", points: 0 };
  if (f.railsBeforeSecond < st.bandes)
    return {
      ...base,
      text: `${plural(f.railsBeforeSecond, "bande")} seulement`,
      sub: `Il en fallait ${st.bandes}`,
      tone: "info",
      points: 0,
    };
  // Le moment du point : la seconde bille touchée
  const second = f.touched[1]!;
  const e = events.find((x) => x.k === "bille" && (x.a === st.cue || x.b === st.cue) && (x.a === second || x.b === second));
  const great = f.railsBeforeSecond >= 3;
  return {
    ...base,
    keep: true,
    text: great ? (st.bandes >= 3 ? "Trois bandes !" : `${plural(f.railsBeforeSecond, "bande")} !`) : "Carambolage !",
    tone: great ? "great" : "good",
    points: 1,
    scored: 1,
    highlight: great && e ? { s: e.s, x: e.x, y: e.y, kind: "carambolage" } : undefined,
  };
}
