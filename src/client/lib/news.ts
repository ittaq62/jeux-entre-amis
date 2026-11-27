import type { TableGame } from "../../shared/protocol.ts";

/** Une nouveauté du site, pour l'encart « Quoi de neuf » de l'accueil (la plus récente d'abord) */
export interface NewsItem {
  id: string;
  /** AAAA-MM-JJ */
  date: string;
  text: string;
  /** Le jeu dont elle parle : montrée seulement à qui voit ce jeu */
  game?: TableGame;
}

export const NEWS: NewsItem[] = [
  {
    id: "2026-11-27-partage",
    date: "2026-11-27",
    text: "Un lien de table envoyé dans une messagerie montre le jeu, qui t'attend et les places libres.",
  },
  {
    id: "2026-11-27-tournee-image",
    date: "2026-11-27",
    text: "Fin de tournée : « Partager le résultat » en fait une image.",
    game: "tour",
  },
  {
    id: "2026-11-27-fantome",
    date: "2026-11-27",
    text: "Bolides, contre-la-montre : ton record devient un fantôme à battre.",
    game: "bolides",
  },
  { id: "2026-11-27-apparences", date: "2026-11-27", text: "Tes skins choisis te suivent d'un appareil à l'autre." },
  {
    id: "2026-11-25-menu",
    date: "2026-11-25",
    text: "Ton portrait, en haut à droite, ouvre ton compte : profil, album, réglages, signaler un problème.",
  },
  { id: "2026-11-23-billard", date: "2026-11-23", text: "Le billard : quatre jeux, huit salles, de 2 à 8 joueurs.", game: "billard" },
  { id: "2026-11-22-bowling", date: "2026-11-22", text: "Le bowling, de 1 à 8 joueurs, et son défi des spares.", game: "bowling" },
  { id: "2026-11-21-minigolf", date: "2026-11-21", text: "Le minigolf : huit parcours de neuf trous.", game: "minigolf" },
];

/** Les jeux arrivés depuis peu, et le jour de leur arrivée : une pastille « Nouveau » sur leur fiche */
export const NEW_GAMES: Partial<Record<TableGame, string>> = {
  minigolf: "2026-11-21",
  bowling: "2026-11-22",
  billard: "2026-11-23",
};

const DAY = 86_400_000;

/** La pastille « Nouveau » d'un jeu, pendant 30 jours après son arrivée */
export function isNewGame(game: TableGame, now = Date.now()): boolean {
  const since = NEW_GAMES[game];
  return since !== undefined && now - Date.parse(since) < 30 * DAY;
}

/**
 * Ce que montre « Quoi de neuf » : les trois nouveautés les plus récentes des trois dernières semaines, parmi celles
 * qui parlent d'un jeu qu'on voit ; rien si la plus récente a déjà été marquée « vu ».
 */
export function freshNews(visible: readonly TableGame[], seenId: string | null, now = Date.now(), news = NEWS): NewsItem[] {
  const shown = news.filter((n) => (!n.game || visible.includes(n.game)) && now - Date.parse(n.date) < 21 * DAY);
  if (shown.length === 0 || shown[0]!.id === seenId) return [];
  return shown.slice(0, 3);
}
