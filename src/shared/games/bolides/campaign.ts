// Le championnat de Bolides, à jouer seul contre les bots : quatre coupes de plus en plus dures, chacune ouverte par
// un podium dans la précédente. Madame Pinson, l'organisatrice, présente chaque coupe ; Mistral, le champion en titre,
// attend le nouveau venu à chaque arrivée. Et le contre-la-montre : les fantômes de bronze, d'argent et d'or.

import type { BotLevel } from "./bot.ts";
import type { BaseTrackId } from "./track.ts";

export type CupId = "galet" | "lanterne" | "comete" | "miroir";
export const CUP_IDS: CupId[] = ["galet", "lanterne", "comete", "miroir"];

/** Qui parle dans les scènes */
export type Speaker = "pinson" | "mistral";
export const SPEAKERS: Record<Speaker, { name: string; role: string }> = {
  pinson: { name: "Madame Pinson", role: "l'organisatrice" },
  mistral: { name: "Mistral", role: "le champion en titre" },
};

export interface Line {
  who: Speaker;
  text: string;
}

export interface CampaignCup {
  id: CupId;
  name: string;
  /** Une phrase sous le nom */
  tagline: string;
  tracks: BaseTrackId[];
  mirror: boolean;
  laps: number;
  /** Le niveau des bots, et celui de Mistral (toujours un cran au-dessus, sauf tout en haut) */
  bots: BotLevel;
  rival: BotLevel;
  /** Le nombre de pilotes en tout, le joueur compris */
  grid: number;
  /** La coupe qu'il faut avoir finie sur le podium pour courir celle-ci */
  after: CupId | null;
  /** La présentation, avant la première course */
  intro: Line[];
  /** À la fin : sur le podium, ou pas */
  podium: Line[];
  missed: Line[];
}

export const CUPS: Record<CupId, CampaignCup> = {
  galet: {
    id: "galet",
    name: "Coupe Galet",
    tagline: "Les premiers tours de roue",
    tracks: ["port", "vignes", "potager"],
    mirror: false,
    laps: 3,
    bots: "facile",
    rival: "moyen",
    grid: 6,
    after: null,
    intro: [
      { who: "pinson", text: "Bienvenue au Championnat des Bolides ! Je suis Madame Pinson, et c'est moi qui donne les départs." },
      {
        who: "pinson",
        text: "On commence en douceur : le port, les vignes, puis le potager. Un podium, et la Coupe Lanterne t'ouvrira ses portes.",
      },
      { who: "mistral", text: "Un nouveau ? Profite bien de la vue sur mon pot d'échappement." },
    ],
    podium: [
      { who: "pinson", text: "Sur le podium dès ta première coupe ! La Coupe Lanterne t'attend, et elle se court de nuit." },
      { who: "mistral", text: "Pas mal, pour un débutant. Mais la nuit, je vois très bien." },
    ],
    missed: [
      { who: "pinson", text: "Le podium t'a échappé de peu. Reprends la coupe quand tu veux, les circuits ne bougent pas." },
      { who: "mistral", text: "Reviens quand tu sauras déraper." },
    ],
  },
  lanterne: {
    id: "lanterne",
    name: "Coupe Lanterne",
    tagline: "Les lumières de la nuit",
    tracks: ["ville", "foire", "dunes"],
    mirror: false,
    laps: 3,
    bots: "moyen",
    rival: "fort",
    grid: 8,
    after: "galet",
    intro: [
      { who: "pinson", text: "La Coupe Lanterne : la ville sous la pluie, la fête foraine, puis la traversée des dunes." },
      { who: "pinson", text: "Huit pilotes cette fois, et des bots qui savent viser. Garde un objet pour te défendre." },
      { who: "mistral", text: "Tu as eu de la chance au port. Ici, il n'y a pas de chance, que des virages." },
    ],
    podium: [
      { who: "pinson", text: "Magnifique ! La Coupe Comète est ouverte : quatre circuits, et les meilleurs bots du championnat." },
      { who: "mistral", text: "Bon. Je vais peut-être devoir freiner un peu plus tard." },
    ],
    missed: [
      { who: "pinson", text: "La nuit est traîtresse. Prends les raccourcis de la foire, et dérape plus longtemps dans les dunes." },
      { who: "mistral", text: "Les lanternes, c'est pour éclairer mon passage." },
    ],
  },
  comete: {
    id: "comete",
    name: "Coupe Comète",
    tagline: "Quatre circuits, aucun répit",
    tracks: ["lagon", "col", "foret", "volcan"],
    mirror: false,
    laps: 3,
    bots: "fort",
    rival: "fort",
    grid: 8,
    after: "lanterne",
    intro: [
      { who: "pinson", text: "La Coupe Comète ! Sous la mer du lagon, dans la neige du col, sous les séquoias, puis au bord du volcan." },
      { who: "mistral", text: "Ici, je ne te laisse plus rien. Ni la corde, ni l'aspiration, ni les caisses." },
      { who: "pinson", text: "Quatre courses : les points comptent jusqu'au bout. Ne lâche rien au volcan !" },
    ],
    podium: [
      { who: "pinson", text: "Incroyable ! Il ne reste qu'une coupe, la plus étrange : la Coupe Miroir." },
      { who: "mistral", text: "La Miroir… Tout y est à l'envers. Même moi, je m'y perds parfois. Je t'y attends." },
    ],
    missed: [
      { who: "pinson", text: "La Comète ne pardonne pas. Le contre-la-montre est un bon endroit pour apprendre ses trajectoires." },
      { who: "mistral", text: "Tu as vu ma fumée ? C'est déjà ça." },
    ],
  },
  miroir: {
    id: "miroir",
    name: "Coupe Miroir",
    tagline: "Tout à l'envers, gauche et droite échangées",
    tracks: ["port", "ville", "foret", "volcan"],
    mirror: true,
    laps: 3,
    bots: "fort",
    rival: "fort",
    grid: 8,
    after: "comete",
    intro: [
      { who: "pinson", text: "La Coupe Miroir : des circuits que tu connais, mais à l'envers. Tes réflexes vont te trahir." },
      { who: "mistral", text: "Le titre de champion, je le garde depuis trois saisons. Viens le chercher." },
    ],
    podium: [
      { who: "pinson", text: "Tu as dompté la Coupe Miroir ! Le Championnat des Bolides a un nouveau visage." },
      { who: "mistral", text: "Bien couru. La saison prochaine, je reviens… et je dérape plus longtemps." },
    ],
    missed: [
      {
        who: "pinson",
        text: "Le miroir trompe tout le monde la première fois. Recommence, les virages finiront par se remettre à l'endroit.",
      },
      { who: "mistral", text: "Le titre reste à la maison. Pour cette fois." },
    ],
  },
};

/** Les étoiles d'une coupe, d'après la place au classement général : 3 pour la victoire, 2 pour la deuxième, 1 pour la troisième */
export function cupStars(rank: number): 0 | 1 | 2 | 3 {
  return rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0;
}

/** Ce que le joueur a gagné jusque-là : les étoiles de chaque coupe et de chaque contre-la-montre, et ses meilleurs temps */
export interface BolidesProgress {
  /** « coupe:galet » ou « chrono:port-miroir » → 0 à 3 étoiles */
  stars: Record<string, number>;
  /** « chrono:port » → le meilleur temps, en ms */
  best: Record<string, number>;
}

export const EMPTY_PROGRESS: BolidesProgress = { stars: {}, best: {} };

export const cupKey = (id: CupId) => `coupe:${id}`;
export const chronoKey = (track: string) => `chrono:${track}`;

/** Une coupe est ouverte quand la précédente a été finie sur le podium */
export function cupOpen(p: BolidesProgress, id: CupId): boolean {
  const after = CUPS[id].after;
  return after === null || (p.stars[cupKey(after)] ?? 0) > 0;
}

/** Toutes les étoiles gagnées (coupes et contre-la-montre) */
export function totalStars(p: BolidesProgress): number {
  return Object.values(p.stars).reduce((sum, n) => sum + n, 0);
}

/** Le Mistral de chaque table : son nom et ses couleurs ne changent jamais */
export const RIVAL_NAME = "Mistral";

/** Ce qui vient d'être gagné en solo à cette table, pour la scène de fin */
export type SoloOutcome =
  | {
      kind: "coupe";
      cup: CupId;
      /** La place au classement général de la coupe */
      rank: number;
      stars: number;
      /** Les étoiles qu'il avait déjà sur cette coupe */
      before: number;
      /** La coupe que ce podium vient d'ouvrir */
      unlocked: CupId | null;
    }
  | {
      kind: "chrono";
      track: string;
      ms: number;
      stars: number;
      before: number;
      /** Son meilleur temps d'avant (null : premier chrono sur ce circuit) */
      previous: number | null;
      /** Un tour bien plus rapide que le fantôme d'or : le temps n'est pas retenu */
      refused?: boolean;
    };

/** Ce que voit le joueur d'une table en solo : sa progression, les fantômes du circuit choisi, ce qu'il vient de gagner */
export interface BolidesSoloView {
  /** Sa progression (null : pas encore lue) */
  progress: BolidesProgress | null;
  /** Contre-la-montre : les temps des fantômes de bronze, d'argent et d'or sur ce circuit */
  targets: { bronze: number; argent: number; or: number } | null;
  outcome: SoloOutcome | null;
}
