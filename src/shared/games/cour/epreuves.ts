// Les épreuves de La Cour des Grands : des jeux de cour de récréation, version grand jeu télévisé. Chacune a son nom,
// sa règle en une phrase (lue pendant sa révélation), la façon dont on y est éliminé (toujours bon enfant : peinture,
// mousse, piscine à balles…), et ce qu'il lui faut de candidats pour se jouer.

export type EpreuveId = "soleil" | "biscuit" | "corde" | "nenuphars" | "chaises" | "billes" | "marelle" | "epervier" | "polochons";

/** Les épreuves avant la finale (celle-ci est toujours la bataille de polochons) */
export const EPREUVES: readonly Exclude<EpreuveId, "polochons">[] = [
  "soleil",
  "biscuit",
  "corde",
  "nenuphars",
  "chaises",
  "billes",
  "marelle",
  "epervier",
];

export interface EpreuveInfo {
  id: EpreuveId;
  name: string;
  /** Le petit nom affiché sous le titre pendant la révélation */
  tagline: string;
  /** La règle, en deux ou trois phrases, telle que la cloche l'annonce */
  rules: string[];
  /** Comment on joue, au doigt et au clavier */
  controls: string;
  /** Ce qui arrive aux éliminés (pour les annonces) */
  out: string;
  /** Il faut au moins ce nombre de candidats */
  min: number;
  /**
   * L'épreuve se joue en manches jusqu'à ce qu'il ne reste que le nombre voulu : on peut la mettre en dernier avant la
   * finale (elle laisse alors exactement deux finalistes)
   */
  elastic: boolean;
  /** Ses couleurs (titres, écran de chargement, carte de l'album) */
  color: string;
  dark: string;
}

export const EPREUVE_INFO: Record<EpreuveId, EpreuveInfo> = {
  soleil: {
    id: "soleil",
    name: "1, 2, 3, Tournesol !",
    tagline: "Le grand tournesol a l'œil",
    rules: [
      "Le tournesol chante le dos tourné : avance !",
      "Quand il se retourne, plus un geste : qui bouge encore est repeint de la tête aux pieds.",
      "Franchis la ligne d'arrivée avant la fin du chrono.",
    ],
    controls: "Garde le doigt appuyé (ou la barre d'espace) pour courir, lâche pour t'arrêter. Attention à l'élan !",
    out: "repeint",
    min: 2,
    elastic: false,
    color: "#f2b632",
    dark: "#7a4a08",
  },
  biscuit: {
    id: "biscuit",
    name: "Le Sablé",
    tagline: "Découpe sans casser",
    rules: [
      "Choisis une boîte : dedans, un sablé et une forme gravée.",
      "Suis le trait avec l'aiguille pour détacher la forme, tout doux.",
      "Trop vite ou à côté du trait, le biscuit se fêle… et casse.",
    ],
    controls: "Fais glisser le doigt (ou la souris) le long du trait. Lentement !",
    out: "entarté",
    min: 2,
    elastic: false,
    color: "#e2a35a",
    dark: "#6b3a16",
  },
  corde: {
    id: "corde",
    name: "Le Tir à la corde",
    tagline: "Ho… hisse !",
    rules: [
      "Deux équipes, une corde, et le grand bassin de mousse entre les deux.",
      "Tire en rythme : chaque « hisse ! » pile au bon moment compte double.",
      "L'équipe tirée au bord du plongeoir finit dans la mousse.",
    ],
    controls: "Touche le bouton (ou la barre d'espace) pile sur le « hisse ! ».",
    out: "dans la mousse",
    min: 4,
    elastic: false,
    color: "#3fa6d9",
    dark: "#0f3d5c",
  },
  nenuphars: {
    id: "nenuphars",
    name: "Les Nénuphars",
    tagline: "Un sur deux tient bon",
    rules: [
      "Tire ton numéro de passage, puis traverse l'étang de nénuphar en nénuphar.",
      "À chaque rangée, un seul des deux te porte : l'autre plonge sous l'eau.",
      "Les libellules aiment se poser sur les bons… quand on les voit.",
    ],
    controls: "Quand c'est ton tour, touche le nénuphar de gauche ou de droite.",
    out: "à l'eau",
    min: 2,
    elastic: false,
    color: "#5cbf6a",
    dark: "#174d2a",
  },
  chaises: {
    id: "chaises",
    name: "Les Chaises musicales",
    tagline: "Il en manque toujours une",
    rules: [
      "Tout le monde tourne autour des chaises tant que la musique joue.",
      "Elle s'arrête : fonce t'asseoir ! Ceux qui restent debout tombent par la trappe.",
      "Pas de faux départ : qui s'élance en pleine musique se fait siffler.",
    ],
    controls: "Quand la musique s'arrête, appuie sur « Assis ! » (ou la barre d'espace) le plus vite possible.",
    out: "par la trappe",
    min: 2,
    elastic: true,
    color: "#d9476b",
    dark: "#5c1029",
  },
  billes: {
    id: "billes",
    name: "Les Billes",
    tagline: "Au plus près du pot",
    rules: [
      "En duel : trois billes chacun, lancées tour à tour vers le pot.",
      "La bille la plus proche gagne la manche, une bille dans le pot la gagne d'office.",
      "Deux manches gagnées pour rester ; le perdant prend le seau de gelée.",
    ],
    controls: "Tire vers l'arrière depuis ta bille pour viser et doser la force, puis lâche.",
    out: "gélifié",
    min: 2,
    elastic: false,
    color: "#7a6be0",
    dark: "#251c63",
  },
  marelle: {
    id: "marelle",
    name: "La Marelle",
    tagline: "Retiens, puis saute",
    rules: [
      "Les cases s'allument une à une : retiens l'ordre.",
      "Puis saute-les dans le même ordre, sans traîner. Chaque manche, une case de plus.",
      "Une erreur, et le canon à mousse s'occupe de toi.",
    ],
    controls: "Touche les cases dans l'ordre (ou les touches 1 à 9 et 0).",
    out: "sous la mousse",
    min: 2,
    elastic: true,
    color: "#ef7b3a",
    dark: "#6b2a08",
  },
  epervier: {
    id: "epervier",
    name: "L'Épervier",
    tagline: "Traverse sans te faire plumer",
    rules: [
      "Au coup de sifflet, traverse la cour d'un bout à l'autre.",
      "Les éperviers au milieu attrapent qui ils touchent… et qui est attrapé devient épervier.",
      "Qui n'est pas de l'autre côté à temps est attrapé aussi.",
    ],
    controls: "Le doigt sur la manette (ou les flèches) pour courir, le bouton (ou la barre d'espace) pour un bond.",
    out: "plumé",
    min: 3,
    elastic: true,
    color: "#a3753e",
    dark: "#3f2a12",
  },
  polochons: {
    id: "polochons",
    name: "La Finale des Polochons",
    tagline: "Le dernier sur la poutre",
    rules: [
      "Les deux finalistes, une poutre au-dessus du bassin, un polochon chacun.",
      "Pare du bon côté le coup qui vient, frappe quand l'autre se découvre.",
      "Le premier qui perd l'équilibre tombe dans la mousse : l'autre gagne la Cloche d'or.",
    ],
    controls: "Frapper en haut ou en bas, parer en haut ou en bas : quatre boutons (ou les flèches et Z, S).",
    out: "dans la mousse",
    min: 2,
    elastic: false,
    color: "#f2c94c",
    dark: "#5c4508",
  },
};

export const isEpreuve = (v: unknown): v is Exclude<EpreuveId, "polochons"> =>
  typeof v === "string" && (EPREUVES as readonly string[]).includes(v);
