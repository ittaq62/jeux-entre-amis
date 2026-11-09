import type { TableGame } from "../../shared/protocol.ts";
import { GAME_SEATS, TOUR_MAX_PLAYERS, TOUR_MIN_PLAYERS } from "../../shared/tour.ts";

/** Ce qu'il faut savoir d'une chose pour la retrouver en la cherchant */
export interface Searchable {
  name: string;
  /** Les mots auxquels on pense en cherchant ça, même s'ils ne sont pas écrits sur la fiche */
  keywords: string;
  desc: string;
  players?: readonly [min: number, max: number];
}

export interface HomeGame extends Searchable {
  id: TableGame;
  players: readonly [min: number, max: number];
  quick: string;
  open: string;
  /** Le titre de la fenêtre qui ouvre une table */
  modal: string;
}

const seats = (game: keyof typeof GAME_SEATS) => [GAME_SEATS[game].min, GAME_SEATS[game].max] as const;

/** Les fiches de l'accueil, dans l'ordre où on les voit */
export const HOME_GAMES: HomeGame[] = [
  {
    id: "tour",
    name: "La Tournée",
    desc: "Plusieurs jeux à la suite pour la même bande. L'hôte coche les jeux, ils sortent au hasard, et chaque place rapporte des points jusqu'au podium.",
    keywords: "tournoi championnat enchaîner classement soirée",
    players: [TOUR_MIN_PLAYERS, TOUR_MAX_PLAYERS],
    quick: "Tournée rapide",
    open: "Lancer une tournée",
    modal: "Lancer une tournée",
  },
  {
    id: "uno",
    name: "UNO",
    desc: "Classique ou No Mercy, de 2 à 8 joueurs. S'il manque du monde, des bots complètent la table.",
    keywords: "cartes carte couleurs défausse",
    players: seats("uno"),
    quick: "Partie rapide",
    open: "Ouvrir une table",
    modal: "Ouvrir une table",
  },
  {
    id: "naval",
    name: "Bataille navale",
    desc: "En duel, en mêlée jusqu'à 6 ou en équipes 2 contre 2. Radar, torpille et barrage en option.",
    keywords: "bateau navire mer marine flotte sous-marin couler touché coulé guerre stratégie grille",
    players: seats("naval"),
    quick: "Partie rapide",
    open: "Ouvrir une table",
    modal: "Ouvrir une table de bataille navale",
  },
  {
    id: "bricks",
    name: "Briques",
    desc: "Empile, fais des lignes, et envoie-les en lignes grises chez les autres. En duel, en mêlée jusqu'à 6, en équipes ou seul contre la montre.",
    keywords: "blocs pièces tomber empiler puzzle réflexe rapidité solo",
    // Le solo contre la montre se joue sans table à remplir
    players: [1, GAME_SEATS.bricks.max],
    quick: "Partie rapide",
    open: "Ouvrir une table",
    modal: "Ouvrir une table de Briques",
  },
  {
    id: "capitale",
    name: "Capitale",
    desc: "Achète les villes de France, de Guéret à Paris, bâtis ta ville case par case jusqu'aux gratte-ciel, pose une décharge chez les autres et ruine-les à coups de loyers. En partie rapide ou jusqu'à la faillite, de 2 à 6.",
    keywords: "plateau immobilier argent dés construire stratégie",
    players: seats("capitale"),
    quick: "Partie rapide",
    open: "Ouvrir une table",
    modal: "Ouvrir une table de Capitale",
  },
  {
    id: "meche",
    name: "Mèche",
    desc: "La mèche brûle et passe de main en main : écris vite un mot avec les lettres imposées pour t'en débarrasser. Si elle saute chez toi, tu perds une allumette. Mèche classique, à rallonge ou chacun la sienne, de 2 à 8 joueurs.",
    keywords: "mots vocabulaire écrire taper clavier bombe rapidité français dictionnaire",
    players: seats("meche"),
    quick: "Partie rapide",
    open: "Ouvrir une table",
    modal: "Ouvrir une table de Mèche",
  },
  {
    id: "bolides",
    name: "Bolides",
    desc: "Des courses de karts en 3D, de 2 à 8 pilotes : dérape dans les virages pour charger un turbo, casse les caisses pour gagner des objets, vole en deltaplane et plonge sous la mer. Six circuits et des Grands Prix, au clavier, à la manette ou sur téléphone.",
    keywords: "voiture course conduite véhicule vitesse",
    players: seats("bolides"),
    quick: "Course rapide",
    open: "Ouvrir une table",
    modal: "Ouvrir une table de Bolides",
  },
];

/** Le bandeau de l'album reste affiché quand c'est lui qu'on cherche */
export const ALBUM_SEARCH: Searchable = {
  name: "L'Album",
  desc: "",
  keywords: "cartes collection collectionner paquet rareté",
};

/** Ces mots ne disent rien du jeu qu'on cherche : « un jeu de cartes à 4 » revient à « cartes 4 » */
const NOISE = new Set(
  "a ami amis au aux avec d de des du en entre et j jeu jeux jouer joueur joueurs l la le les ou par partie parties personne personnes pour sur un une".split(
    " ",
  ),
);

const words = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Le singulier suffit : « voitures » et « bateaux » trouvent « voiture » et « bateau » */
const singular = (word: string) => (word.length > 3 ? word.replace(/[sx]$/, "") : word);

/** Une lettre en trop, en moins, fausse, ou deux lettres inversées : on a compris quand même */
function isTypo(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return true;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

/** Les mots utiles d'une recherche. Aucun mot utile : on ne cherche rien de précis, tout reste affiché. */
export function searchWords(query: string): string[] {
  return words(query)
    .filter((w) => !NOISE.has(w))
    .map(singular);
}

/** Tous les mots cherchés doivent coller : le nom et les mots-clés d'abord, et le texte de la fiche à partir de trois lettres. */
export function matchesGame(game: Searchable, terms: readonly string[]): boolean {
  const title = words(`${game.name} ${game.keywords}`);
  const text = words(game.desc);
  return terms.every((term) => {
    if (/^\d+$/.test(term)) return game.players !== undefined && Number(term) >= game.players[0] && Number(term) <= game.players[1];
    if (title.some((w) => w.startsWith(term))) return true;
    if (term.length >= 3 && text.some((w) => w.startsWith(term))) return true;
    return term.length >= 5 && title.some((w) => w.length >= 5 && isTypo(term, singular(w)));
  });
}
