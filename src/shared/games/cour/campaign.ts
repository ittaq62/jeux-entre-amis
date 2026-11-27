// La campagne de La Cour des Grands : une saison du grand jeu, épreuve après épreuve, contre la foule des bots et un
// rival qui ne lâche rien (Gaspard le Magnifique). Chaque chapitre a sa petite histoire (la cloche Carillon la raconte
// avant l'épreuve), un score de 0 à 100 calculé par le serveur et trois étoiles à gagner. Un chapitre s'ouvre quand le
// précédent a au moins une étoile ; la finale se joue contre Gaspard, pour la Cloche d'or.

import type { AvatarConfig } from "../../avatar.ts";
import type { BotLevel } from "./config.ts";
import type { EpreuveId } from "./epreuves.ts";
import type { EpState } from "./match.ts";
import { clamp, SAFE } from "./ep/common.ts";
import { FIELD } from "./ep/epervier.ts";

export interface Chapter {
  id: string;
  ep: EpreuveId;
  /** Le titre du chapitre */
  title: string;
  /** Ce que raconte Carillon avant l'épreuve */
  story: string[];
  /** Ce qu'il dit quand on a réussi */
  win: string;
  /** Ce que dit Gaspard, le rival */
  rival: string;
  candidates: number;
  /** Combien de candidats l'épreuve garde à peu près */
  keep: number;
  level: BotLevel;
  /** Comment se gagnent les étoiles (affiché au menu) */
  goals: [string, string, string];
}

export const RIVAL_NAME = "Gaspard";
/** Le rival a toujours la même tête : moustache, haut-de-forme, l'air sûr de lui */
export const RIVAL_AVATAR: AvatarConfig = { bg: 7, skin: 1, hair: 3, hairColor: 0, eyes: 4, mouth: 6, hat: 2, extra: 3 };

export const CHAPTERS: readonly Chapter[] = [
  {
    id: "soleil",
    ep: "soleil",
    title: "L'arrivée sur l'île",
    story: [
      "Une enveloppe dorée, un ticket de bateau : te voilà candidat de La Cour des Grands !",
      "Sur l'île de Récré, le grand Tournesol t'attend. Il chante le dos tourné… et il a l'œil.",
    ],
    win: "Bravo ! Tu as franchi la ligne sans une goutte de peinture.",
    rival: "Gaspard : « Je suis arrivé premier l'an dernier. Et l'année d'avant. »",
    candidates: 24,
    keep: 15,
    level: "facile",
    goals: ["Franchir la ligne", "En moins de 38 secondes", "En moins de 30 secondes"],
  },
  {
    id: "biscuit",
    ep: "biscuit",
    title: "La pause goûter",
    story: [
      "L'heure du goûter ! Sur les grandes tables sous les parasols, des boîtes en fer attendent.",
      "Dedans, un sablé tout frais et une forme gravée. Détache-la sans casser le biscuit… doucement.",
    ],
    win: "Une forme entière, sans une miette de travers. Joli coup d'aiguille !",
    rival: "Gaspard : « Moi, je mange le biscuit d'abord. Ça règle le problème. »",
    candidates: 24,
    keep: 14,
    level: "facile",
    goals: ["Détacher la forme", "Presque sans fêlure", "Sans fêlure, et vite"],
  },
  {
    id: "corde",
    ep: "corde",
    title: "Le bassin de mousse",
    story: [
      "Deux plongeoirs, une corde, et entre les deux le grand bassin de mousse.",
      "Ton équipe compte sur toi : tire pile sur le « hisse ! », tous ensemble.",
    ],
    win: "Ho… hisse ! L'autre équipe a fini dans la mousse, pas la tienne.",
    rival: "Gaspard : « J'ai des bras en acier. Enfin, en acier mou. »",
    candidates: 16,
    keep: 8,
    level: "moyen",
    goals: ["Gagner la rencontre", "Bien en rythme", "Presque toujours pile"],
  },
  {
    id: "nenuphars",
    ep: "nenuphars",
    title: "L'étang aux libellules",
    story: [
      "Un étang, deux rangées de nénuphars. Un seul de chaque paire tient bon.",
      "Passer le premier, c'est deviner ; passer le dernier, c'est attendre. À toi de choisir ton numéro.",
    ],
    win: "Tu as touché l'autre berge les pieds au sec !",
    rival: "Gaspard : « Je prends le dernier numéro. Les héros, c'est surfait. »",
    candidates: 16,
    keep: 10,
    level: "moyen",
    goals: ["Traverser l'étang", "Deviner une rangée toi-même", "Deviner trois rangées"],
  },
  {
    id: "chaises",
    ep: "chaises",
    title: "Le bal des chaises",
    story: [
      "La fanfare joue, la foule tourne autour des chaises. Il en manque toujours une…",
      "Dès que la musique s'arrête : assis ! Les autres découvriront la piscine à balles.",
    ],
    win: "Toujours une chaise sous toi. Les fesses les plus rapides de l'île !",
    rival: "Gaspard : « La chaise, je la réserve avec mon chapeau. »",
    candidates: 20,
    keep: 6,
    level: "moyen",
    goals: ["Rester assis jusqu'au bout", "Réagir vite", "Réagir comme l'éclair"],
  },
  {
    id: "billes",
    ep: "billes",
    title: "Le carré de sable",
    story: [
      "Au fond du jardin, des carrés de sable et un petit pot creusé.",
      "Trois billes chacun, deux manches gagnantes. Le perdant prend le seau de gelée.",
    ],
    win: "Tes billes ont trouvé le chemin du pot. Ton adversaire, celui de la gelée.",
    rival: "Gaspard : « Mes billes sont en verre de Venise. Elles roulent mieux. »",
    candidates: 16,
    keep: 8,
    level: "moyen",
    goals: ["Gagner le duel", "Deux manches à zéro, ou une bille au pot", "Deux billes au pot"],
  },
  {
    id: "marelle",
    ep: "marelle",
    title: "La marelle des étoiles",
    story: [
      "Des marelles à la craie, une par candidat, jusqu'au Ciel.",
      "Les cases chantent dans un ordre : retiens-le, puis saute-le. Chaque manche, une de plus.",
    ],
    win: "Quelle mémoire ! Le canon à mousse est resté sans emploi.",
    rival: "Gaspard : « Je retiens tout. Comment tu t'appelles, déjà ? »",
    candidates: 20,
    keep: 3,
    level: "fort",
    goals: ["Tenir jusqu'au bout", "Réussir six cases", "Réussir huit cases"],
  },
  {
    id: "epervier",
    ep: "epervier",
    title: "La grande récré",
    story: [
      "Toute la cour d'un bout à l'autre, au coup de sifflet. Au milieu, les éperviers.",
      "Qui se fait attraper devient épervier… et ils sont de plus en plus nombreux.",
    ],
    win: "Insaisissable ! Les éperviers en ont perdu leurs plumes.",
    rival: "Gaspard : « Je suis trop rapide pour être vu. Ou trop petit, peut-être. »",
    candidates: 24,
    keep: 4,
    level: "fort",
    goals: ["Survivre aux traversées", "Trois traversées", "Quatre traversées"],
  },
  {
    id: "finale",
    ep: "polochons",
    title: "La Cloche d'or",
    story: [
      "La poutre au-dessus du grand bassin, la foule dans les gradins. Il ne reste que toi… et Gaspard.",
      "Un polochon chacun. Le premier qui tombe a perdu ; l'autre soulève la Cloche d'or.",
    ],
    win: "LA CLOCHE D'OR EST À TOI ! Tu es le grand gagnant de La Cour des Grands !",
    rival: "Gaspard : « Ce polochon, c'est mon cousin. Il est dans mon camp. »",
    candidates: 2,
    keep: 1,
    level: "fort",
    goals: ["Gagner la finale", "En gardant de l'équilibre", "Presque sans être touché"],
  },
];

export const CHAPTER_BY_ID = new Map(CHAPTERS.map((c) => [c.id, c]));

/** Le score d'un vrai joueur à la fin de l'épreuve d'un chapitre (0 : éliminé) */
export function chapterScore(s: EpState, id: string): number {
  const i = s.ids.indexOf(id);
  if (i < 0) return 0;
  const lin = (v: number, from: number, to: number) => clamp((v - from) / (to - from), 0, 1);
  switch (s.kind) {
    case "soleil":
      return s.st[i] === SAFE
        ? Math.round(40 + 25 * lin(s.fin[i]!, 52, 38) + 25 * lin(s.fin[i]!, 38, 30) + 10 * lin(s.fin[i]!, 30, 24))
        : 0;
    case "biscuit":
      if (s.st[i] !== SAFE) return 0;
      return Math.round(40 + 32 * lin(s.crack[i]!, 0.5, 0.12) + 18 * lin(s.fin[i]!, 50, 25) + 10 * lin(s.crack[i]!, 0.12, 0));
    case "corde": {
      if (s.st[i] !== SAFE) return 0;
      const avg = s.qn[i]! > 0 ? s.qs[i]! / s.qn[i]! : 0;
      return Math.round(40 + 60 * lin(avg, 0.35, 0.9));
    }
    case "nenuphars":
      return s.st[i] === SAFE ? Math.round(Math.min(100, 40 + (s.guess[i]! >= 1 ? 25 : 0) + Math.max(0, s.guess[i]! - 1) * 10)) : 0;
    case "chaises": {
      if (s.st[i] === 2) return 0;
      const react = s.rn[i]! > 0 ? s.rsum[i]! / s.rn[i]! : 1;
      return Math.round(40 + 60 * lin(react, 0.75, 0.3));
    }
    case "billes": {
      if (s.st[i] !== SAFE) return 0;
      const d = s.duels[s.duelOf[i]!];
      if (!d) return 40;
      const me = d.a === i ? 0 : 1;
      const sweep = d.wins[me === 0 ? 1 : 0] === 0;
      return Math.round(
        Math.min(100, 40 + (sweep || d.pots[me] >= 1 ? 25 : 0) + (d.pots[me] >= 2 ? 25 : 0) + (sweep && d.pots[me] >= 1 ? 10 : 0)),
      );
    }
    case "marelle":
      if (s.st[i] === 2) return 0;
      return Math.round(40 + 25 * lin(s.passed[i]! + 2, 5, 6) + 25 * lin(s.passed[i]! + 2, 6, 8) + 10 * lin(s.passed[i]! + 2, 8, 10));
    case "epervier": {
      if (s.st[i] === 2) return 0;
      const r = s.run.find((q) => q.id === id);
      const crossed = s.crossing - (r && Math.abs(r.x) < FIELD.safe ? 1 : 0);
      return Math.round(40 + 25 * lin(crossed, 2, 3) + 25 * lin(crossed, 3, 4) + 10 * lin(crossed, 4, 5));
    }
    case "polochons": {
      if (s.winner !== i) return 0;
      const f = s.f[i]!;
      return Math.round(40 + 30 * lin(f.bal, 10, 50) + 30 * lin(f.bal, 50, 85));
    }
  }
}

/** Les seuils des étoiles : survivre, bien, très bien (le score de chapterScore) */
export const CHAPTER_GOALS: [number, number, number] = [40, 65, 90];
