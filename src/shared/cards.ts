// L'album de La Tablée : des cartes à collectionner, achetées en paquets avec les points gagnés en jouant.
// Le catalogue, les raretés et le tirage des paquets ; le tirage lui-même se fait sur le serveur.

import type { ShipKind } from "./games/naval/engine.ts";
import type { SkinId as NavalSkinId } from "./games/naval/skins.ts";

export type Rarity = "commune" | "peu-commune" | "rare" | "epique" | "legendaire";

export const RARITIES: Rarity[] = ["commune", "peu-commune", "rare", "epique", "legendaire"];

export interface RarityInfo {
  name: string;
  /** Le nombre de joyaux sur la carte */
  gems: number;
  /** Ce que rapporte un double revendu */
  sell: number;
  /** Le prix pour acheter directement cette carte */
  craft: number;
}

export const RARITY: Record<Rarity, RarityInfo> = {
  commune: { name: "Commune", gems: 1, sell: 2, craft: 40 },
  "peu-commune": { name: "Peu commune", gems: 2, sell: 5, craft: 90 },
  rare: { name: "Rare", gems: 3, sell: 15, craft: 240 },
  epique: { name: "Épique", gems: 4, sell: 50, craft: 700 },
  legendaire: { name: "Légendaire", gems: 5, sell: 200, craft: 2500 },
};

export type CardFamily = "habitues" | "flotte" | "capitale" | "circuit" | "tapis" | "briques" | "meche" | "crampons";

export const FAMILIES: { id: CardFamily; name: string; note: string }[] = [
  { id: "habitues", name: "Les Habitués", note: "Ceux qui ne quittent jamais la table" },
  { id: "flotte", name: "La Flotte", note: "Tout ce qui flotte encore" },
  { id: "capitale", name: "La Capitale", note: "Pions, pierres et loyers" },
  { id: "circuit", name: "Le Circuit", note: "Véhicules et mauvais coups" },
  { id: "tapis", name: "Le Tapis vert", note: "Les cartes qui font mal" },
  { id: "briques", name: "Les Briques", note: "Celles qui tombent mal" },
  { id: "meche", name: "La Mèche", note: "Vite, un mot" },
  { id: "crampons", name: "Les Crampons", note: "Du gazon plein les chaussettes" },
];

export type CardArt =
  /** Un modèle 3D photographié, rangé sur la planche d'images */
  | { kind: "atlas"; key: string }
  | { kind: "ship"; ship: ShipKind; skin: NavalSkinId }
  | { kind: "uno"; face: "zero" | "skip" | "reverse" | "draw2" | "wild" | "wild4" }
  | { kind: "brick"; piece: "O" | "T" | "S" | "L" | "I" | "gris" }
  | { kind: "meche"; subject: "allumette" | "dynamite" | "meche" | "mot" | "boum" };

export interface CardDef {
  id: string;
  family: CardFamily;
  rarity: Rarity;
  name: string;
  quote: string;
  art: CardArt;
}

const atlas = (key: string): CardArt => ({ kind: "atlas", key });
const ship = (s: ShipKind, skin: NavalSkinId = "marine"): CardArt => ({ kind: "ship", ship: s, skin });

export const CARDS: CardDef[] = [
  // Les Habitués
  {
    id: "gaston",
    family: "habitues",
    rarity: "commune",
    name: "Gaston",
    quote: "Il perd toujours, il rejoue toujours.",
    art: atlas("pilot:gaston"),
  },
  {
    id: "marcel",
    family: "habitues",
    rarity: "commune",
    name: "Marcel",
    quote: "Sa chaise a fini par prendre sa forme.",
    art: atlas("pilot:marcel"),
  },
  {
    id: "raymond",
    family: "habitues",
    rarity: "commune",
    name: "Raymond",
    quote: "C'était mieux avant. Avant quoi ? Il ne sait plus.",
    art: atlas("pilot:raymond"),
  },
  {
    id: "lucien",
    family: "habitues",
    rarity: "commune",
    name: "Lucien",
    quote: "Il annonce UNO avec encore trois cartes en main.",
    art: atlas("pilot:lucien"),
  },
  {
    id: "jacqueline",
    family: "habitues",
    rarity: "commune",
    name: "Jacqueline",
    quote: "Championne du canton en 1987. Elle en parle encore.",
    art: atlas("pilot:jacqueline"),
  },
  {
    id: "fernand",
    family: "habitues",
    rarity: "commune",
    name: "Fernand",
    quote: "Il dort entre deux tours, jamais pendant le sien.",
    art: atlas("pilot:fernand"),
  },
  {
    id: "ginette",
    family: "habitues",
    rarity: "peu-commune",
    name: "Ginette",
    quote: "Elle garde toujours un +4 pour les grandes occasions.",
    art: atlas("pilot:ginette"),
  },
  {
    id: "josiane",
    family: "habitues",
    rarity: "peu-commune",
    name: "Josiane",
    quote: "Elle compte les cartes. Et les verres des autres.",
    art: atlas("pilot:josiane"),
  },
  {
    id: "odette",
    family: "habitues",
    rarity: "peu-commune",
    name: "Odette",
    quote: "Quand elle sourit en piochant, méfie-toi.",
    art: atlas("pilot:odette"),
  },
  {
    id: "paulette",
    family: "habitues",
    rarity: "peu-commune",
    name: "Paulette",
    quote: "Elle apporte le gâteau et repart avec la partie.",
    art: atlas("pilot:paulette"),
  },
  {
    id: "huguette",
    family: "habitues",
    rarity: "rare",
    name: "Huguette",
    quote: "Quatre-vingt-sept ans, zéro pitié.",
    art: atlas("pilot:huguette"),
  },
  {
    id: "germaine",
    family: "habitues",
    rarity: "rare",
    name: "Germaine",
    quote: "Doyenne de la table. Ses décisions sont sans appel.",
    art: atlas("pilot:germaine"),
  },
  {
    id: "simone",
    family: "habitues",
    rarity: "epique",
    name: "Simone",
    quote: "Elle ne parle pas. Elle gagne.",
    art: atlas("pilot:simone"),
  },
  {
    id: "patronne",
    family: "habitues",
    rarity: "legendaire",
    name: "La Patronne",
    quote: "Personne ne l'a jamais vue perdre. Personne ne l'a vue jouer non plus.",
    art: atlas("pilot:patronne"),
  },

  // La Flotte
  {
    id: "torpilleur",
    family: "flotte",
    rarity: "commune",
    name: "Le Torpilleur",
    quote: "Petit, nerveux, et toujours là où on ne tire pas.",
    art: ship("torpilleur"),
  },
  { id: "sous-marin", family: "flotte", rarity: "commune", name: "Le Sous-marin", quote: "On le cherche encore.", art: ship("sous-marin") },
  {
    id: "contre-torpilleur",
    family: "flotte",
    rarity: "peu-commune",
    name: "Le Contre-torpilleur",
    quote: "Trois cases de mauvaise foi.",
    art: ship("contre-torpilleur"),
  },
  {
    id: "croiseur",
    family: "flotte",
    rarity: "peu-commune",
    name: "Le Croiseur",
    quote: "Solide, fiable, coulé au quatrième tir.",
    art: ship("croiseur"),
  },
  {
    id: "jouet",
    family: "flotte",
    rarity: "peu-commune",
    name: "Le Jouet de bain",
    quote: "Il flotte mieux que tout le reste de ta flotte.",
    art: ship("croiseur", "jouet"),
  },
  {
    id: "cuirasse",
    family: "flotte",
    rarity: "rare",
    name: "Le Cuirassé",
    quote: "Il fait de l'ombre à la moitié de la grille.",
    art: ship("cuirasse"),
  },
  {
    id: "porte-avions",
    family: "flotte",
    rarity: "rare",
    name: "Le Porte-avions",
    quote: "Cinq cases : difficile de passer inaperçu.",
    art: ship("porte-avions"),
  },
  {
    id: "flibustier",
    family: "flotte",
    rarity: "rare",
    name: "Le Flibustier",
    quote: "Il n'a pas de pavillon, il a un crâne.",
    art: ship("croiseur", "pirate"),
  },
  {
    id: "neon",
    family: "flotte",
    rarity: "epique",
    name: "Le Néon",
    quote: "Visible de nuit. Malheureusement.",
    art: ship("porte-avions", "neon"),
  },
  {
    id: "lave",
    family: "flotte",
    rarity: "legendaire",
    name: "Le Vaisseau de lave",
    quote: "Il ne craint pas l'incendie : il en est un.",
    art: ship("cuirasse", "lave"),
  },

  // La Capitale
  {
    id: "pion",
    family: "capitale",
    rarity: "commune",
    name: "Le Pion",
    quote: "Modeste, mais il touche sa prime au départ comme les autres.",
    art: atlas("token:pion"),
  },
  {
    id: "voiture",
    family: "capitale",
    rarity: "commune",
    name: "La Voiture",
    quote: "Elle connaît toutes les rues, surtout celles qui coûtent cher.",
    art: atlas("token:voiture"),
  },
  {
    id: "beret",
    family: "capitale",
    rarity: "commune",
    name: "Le Béret",
    quote: "Indispensable pour négocier un loyer.",
    art: atlas("token:beret"),
  },
  {
    id: "bateau",
    family: "capitale",
    rarity: "commune",
    name: "Le Bateau",
    quote: "À Guéret, on l'attend toujours.",
    art: atlas("token:bateau"),
  },
  {
    id: "maison",
    family: "capitale",
    rarity: "commune",
    name: "La Maison",
    quote: "Un toit, quatre murs, un loyer ridicule.",
    art: atlas("build:maison"),
  },
  {
    id: "croissant",
    family: "capitale",
    rarity: "peu-commune",
    name: "Le Croissant",
    quote: "La seule valeur qui monte tous les matins.",
    art: atlas("token:croissant"),
  },
  {
    id: "immeuble",
    family: "capitale",
    rarity: "peu-commune",
    name: "L'Immeuble",
    quote: "Deux étages de plus, et le voisin pleure.",
    art: atlas("build:immeuble"),
  },
  {
    id: "parc",
    family: "capitale",
    rarity: "peu-commune",
    name: "Le Parc",
    quote: "Un peu de verdure pour faire passer la note.",
    art: atlas("build:parc"),
  },
  {
    id: "decharge",
    family: "capitale",
    rarity: "peu-commune",
    name: "La Décharge",
    quote: "Un cadeau à poser chez les amis.",
    art: atlas("build:decharge"),
  },
  {
    id: "fusee",
    family: "capitale",
    rarity: "rare",
    name: "La Fusée",
    quote: "Pour quitter le quartier quand les loyers grimpent.",
    art: atlas("token:fusee"),
  },
  {
    id: "montgolfiere",
    family: "capitale",
    rarity: "rare",
    name: "La Montgolfière",
    quote: "Elle survole les impôts.",
    art: atlas("token:montgolfiere"),
  },
  {
    id: "gare",
    family: "capitale",
    rarity: "rare",
    name: "La Gare",
    quote: "Quatre gares, et tout le monde vous paie le voyage.",
    art: atlas("build:gare"),
  },
  {
    id: "stade",
    family: "capitale",
    rarity: "rare",
    name: "Le Stade",
    quote: "Plein à chaque passage, et ça paie.",
    art: atlas("build:stade"),
  },
  {
    id: "tour",
    family: "capitale",
    rarity: "epique",
    name: "La Tour Eiffel",
    quote: "Trois cents mètres d'orgueil.",
    art: atlas("token:tour"),
  },
  {
    id: "gratte-ciel",
    family: "capitale",
    rarity: "epique",
    name: "Le Gratte-ciel",
    quote: "Le loyer se voit depuis Paris.",
    art: atlas("build:gratte-ciel"),
  },
  {
    id: "diamant",
    family: "capitale",
    rarity: "epique",
    name: "Le Diamant",
    quote: "À peine de quoi payer un loyer rue de la Paix.",
    art: atlas("token:diamant"),
  },
  {
    id: "couronne",
    family: "capitale",
    rarity: "legendaire",
    name: "La Couronne",
    quote: "Ruine tout le monde, puis range-la dans sa boîte.",
    art: atlas("token:couronne"),
  },

  // Le Circuit
  {
    id: "kart",
    family: "circuit",
    rarity: "commune",
    name: "Le Kart",
    quote: "Rien à lui reprocher, c'est bien ça le problème.",
    art: atlas("vehicle:kart"),
  },
  { id: "moto", family: "circuit", rarity: "commune", name: "La Moto", quote: "Nerveuse. Le pilote aussi.", art: atlas("vehicle:moto") },
  {
    id: "huile",
    family: "circuit",
    rarity: "commune",
    name: "La Flaque d'huile",
    quote: "Pour ceux qui te suivent de trop près.",
    art: atlas("item:huile"),
  },
  {
    id: "petard",
    family: "circuit",
    rarity: "commune",
    name: "Le Pétard",
    quote: "Petit bruit, grande vexation.",
    art: atlas("item:petard"),
  },
  {
    id: "buggy",
    family: "circuit",
    rarity: "peu-commune",
    name: "Le Buggy",
    quote: "Les raccourcis, c'est tout droit.",
    art: atlas("vehicle:buggy"),
  },
  {
    id: "tarte",
    family: "circuit",
    rarity: "peu-commune",
    name: "La Tarte",
    quote: "Spécialité maison, servie en pleine figure.",
    art: atlas("item:tarte"),
  },
  {
    id: "bowling",
    family: "circuit",
    rarity: "peu-commune",
    name: "La Boule de bowling",
    quote: "Strike au deuxième virage.",
    art: atlas("item:bowling"),
  },
  {
    id: "klaxon",
    family: "circuit",
    rarity: "peu-commune",
    name: "Le Klaxon",
    quote: "Il ne sert à rien. C'est pour ça qu'on l'adore.",
    art: atlas("item:klaxon"),
  },
  {
    id: "tondeuse",
    family: "circuit",
    rarity: "rare",
    name: "La Tondeuse",
    quote: "L'herbe, c'est son métier.",
    art: atlas("vehicle:tondeuse"),
  },
  { id: "bolide", family: "circuit", rarity: "rare", name: "Le Bolide", quote: "Très rapide. Tout droit.", art: atlas("vehicle:bolide") },
  { id: "bouclier", family: "circuit", rarity: "rare", name: "Le Bouclier", quote: "Désolé, tu disais ?", art: atlas("item:bouclier") },
  {
    id: "monstre",
    family: "circuit",
    rarity: "epique",
    name: "Le Monstre",
    quote: "Il ne double pas : il passe dessus.",
    art: atlas("vehicle:monstre"),
  },
  {
    id: "orage",
    family: "circuit",
    rarity: "epique",
    name: "L'Orage",
    quote: "Personne n'a vu qui l'a lancé. Tout le monde le sait.",
    art: atlas("item:orage"),
  },
  {
    id: "soucoupe",
    family: "circuit",
    rarity: "legendaire",
    name: "La Soucoupe",
    quote: "Arrivée première, et personne n'a compris comment.",
    art: atlas("vehicle:soucoupe"),
  },

  // Le Tapis vert
  {
    id: "zero",
    family: "tapis",
    rarity: "commune",
    name: "Le Zéro",
    quote: "Il ne vaut rien, et il te sauve.",
    art: { kind: "uno", face: "zero" },
  },
  {
    id: "passe",
    family: "tapis",
    rarity: "commune",
    name: "Passe ton tour",
    quote: "Désolé, c'est personnel.",
    art: { kind: "uno", face: "skip" },
  },
  {
    id: "inversion",
    family: "tapis",
    rarity: "commune",
    name: "L'Inversion",
    quote: "Elle change le sens de la partie, et de l'amitié.",
    art: { kind: "uno", face: "reverse" },
  },
  { id: "plus2", family: "tapis", rarity: "peu-commune", name: "Le +2", quote: "Un petit cadeau.", art: { kind: "uno", face: "draw2" } },
  {
    id: "joker",
    family: "tapis",
    rarity: "rare",
    name: "Le Joker",
    quote: "La couleur qu'il te fallait, comme par hasard.",
    art: { kind: "uno", face: "wild" },
  },
  {
    id: "plus4",
    family: "tapis",
    rarity: "epique",
    name: "Le +4",
    quote: "On a perdu des amis pour moins que ça.",
    art: { kind: "uno", face: "wild4" },
  },

  // Les Briques
  {
    id: "carre",
    family: "briques",
    rarity: "commune",
    name: "Le Carré",
    quote: "Il rentre partout, sauf là où il faudrait.",
    art: { kind: "brick", piece: "O" },
  },
  {
    id: "te",
    family: "briques",
    rarity: "commune",
    name: "Le Té",
    quote: "Il a plus d'un tour dans son sac.",
    art: { kind: "brick", piece: "T" },
  },
  {
    id: "zigzag",
    family: "briques",
    rarity: "peu-commune",
    name: "Le Zigzag",
    quote: "Personne ne l'a jamais voulu.",
    art: { kind: "brick", piece: "S" },
  },
  {
    id: "equerre",
    family: "briques",
    rarity: "peu-commune",
    name: "L'Équerre",
    quote: "Presque utile.",
    art: { kind: "brick", piece: "L" },
  },
  {
    id: "barre",
    family: "briques",
    rarity: "rare",
    name: "La Barre",
    quote: "Elle arrive toujours une ligne trop tard.",
    art: { kind: "brick", piece: "I" },
  },
  {
    id: "mur",
    family: "briques",
    rarity: "epique",
    name: "Le Mur gris",
    quote: "Un cadeau de tes adversaires. Tous en même temps.",
    art: { kind: "brick", piece: "gris" },
  },

  // La Mèche
  {
    id: "allumette",
    family: "meche",
    rarity: "commune",
    name: "L'Allumette",
    quote: "Il n'en reste plus beaucoup.",
    art: { kind: "meche", subject: "allumette" },
  },
  {
    id: "dynamite",
    family: "meche",
    rarity: "commune",
    name: "La Dynamite",
    quote: "Surtout, continue de réfléchir.",
    art: { kind: "meche", subject: "dynamite" },
  },
  {
    id: "meche",
    family: "meche",
    rarity: "peu-commune",
    name: "La Mèche",
    quote: "Elle raccourcit quand tu réfléchis.",
    art: { kind: "meche", subject: "meche" },
  },
  {
    id: "mot",
    family: "meche",
    rarity: "rare",
    name: "Le Mot qui manque",
    quote: "Il te reviendra dans la nuit.",
    art: { kind: "meche", subject: "mot" },
  },
  {
    id: "boum",
    family: "meche",
    rarity: "epique",
    name: "Le Grand Boum",
    quote: "Tu l'avais pourtant sur le bout de la langue.",
    art: { kind: "meche", subject: "boum" },
  },

  // Les Crampons (arrivés après les autres : à la fin, pour ne renuméroter aucune carte)
  {
    id: "ballon",
    family: "crampons",
    rarity: "commune",
    name: "Le Ballon",
    quote: "Tout rond, et il ne va jamais là où on veut.",
    art: atlas("foot:ballon"),
  },
  {
    id: "cages",
    family: "crampons",
    rarity: "commune",
    name: "Les Cages",
    quote: "Sept mètres de large, et il a trouvé le poteau.",
    art: atlas("foot:cages"),
  },
  {
    id: "remplacant",
    family: "crampons",
    rarity: "commune",
    name: "Le Remplaçant",
    quote: "Il s'échauffe depuis la douzième minute.",
    art: atlas("foot:remplacant"),
  },
  {
    id: "ailier",
    family: "crampons",
    rarity: "commune",
    name: "L'Ailier",
    quote: "Très rapide. Le ballon, lui, est resté derrière.",
    art: atlas("foot:ailier"),
  },
  {
    id: "gardien",
    family: "crampons",
    rarity: "peu-commune",
    name: "Le Gardien",
    quote: "Le seul qui a le droit de le prendre à la main. Et il le lâche.",
    art: atlas("foot:gardien"),
  },
  {
    id: "tacle",
    family: "crampons",
    rarity: "peu-commune",
    name: "Le Tacle glissé",
    quote: "Il a pris le ballon. Et tout le reste avec.",
    art: atlas("foot:tacle"),
  },
  {
    id: "touche",
    family: "crampons",
    rarity: "peu-commune",
    name: "La Touche",
    quote: "Les deux pieds par terre, sinon on recommence.",
    art: atlas("foot:touche"),
  },
  {
    id: "tete",
    family: "crampons",
    rarity: "rare",
    name: "La Tête plongeante",
    quote: "Il a fermé les yeux. Ça compte quand même.",
    art: atlas("foot:tete"),
  },
  {
    id: "frappe",
    family: "crampons",
    rarity: "rare",
    name: "La Frappe de mule",
    quote: "Le filet s'en souvient encore.",
    art: atlas("foot:frappe"),
  },
  {
    id: "plongeon",
    family: "crampons",
    rarity: "rare",
    name: "Le Plongeon",
    quote: "Du bon côté. Une seconde trop tard.",
    art: atlas("foot:plongeon"),
  },
  {
    id: "celebration",
    family: "crampons",
    rarity: "epique",
    name: "La Célébration",
    quote: "Il l'a répétée toute la semaine devant sa glace.",
    art: atlas("foot:celebration"),
  },
  {
    id: "gardien-buteur",
    family: "crampons",
    rarity: "epique",
    name: "Le Gardien buteur",
    quote: "Monté sur le dernier corner. Il n'est jamais redescendu.",
    art: atlas("foot:gardien-buteur"),
  },
  {
    id: "lucarne",
    family: "crampons",
    rarity: "legendaire",
    name: "La Lucarne",
    quote: "Là où les chouettes font leur nid.",
    art: atlas("foot:lucarne"),
  },
];

export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

/** Le numéro d'une carte dans l'album */
export const cardNumber = (id: string) => CARDS.findIndex((c) => c.id === id) + 1;

// Les paquets

/** Le prix d'un paquet : deux à trois victoires */
export const PACK_PRICE = 120;

type Odds = Partial<Record<Rarity, number>>;

const FILLER: Odds = { commune: 74, "peu-commune": 22, rare: 4 };

/** Les cinq cartes d'un paquet : trois ordinaires, une au moins peu commune, une au moins rare */
export const PACK_SLOTS: Odds[] = [
  FILLER,
  FILLER,
  FILLER,
  { "peu-commune": 72, rare: 24, epique: 4 },
  { rare: 78, epique: 18, legendaire: 4 },
];

/** Au plus tard à ce nombre de paquets, une carte de cette rareté, et une que le joueur n'a pas encore */
export const PITY_EPIC = 8;
export const PITY_LEGEND = 25;

export interface PackProgress {
  /** Les paquets ouverts depuis la dernière carte épique (ou mieux), et depuis la dernière légendaire */
  sinceEpic: number;
  sinceLegend: number;
}

export interface PackResult {
  cards: string[];
  next: PackProgress;
}

function pickRarity(odds: Odds, rand: () => number): Rarity {
  const entries = RARITIES.filter((r) => odds[r]).map((r) => [r, odds[r]!] as const);
  let x = rand() * entries.reduce((n, [, w]) => n + w, 0);
  for (const [r, w] of entries) {
    x -= w;
    if (x < 0) return r;
  }
  return entries[0]![0];
}

/** Tire un paquet. `owned` : les cartes que le joueur a déjà (les garanties lui donnent toujours du nouveau). */
export function drawPack(progress: PackProgress, owned: ReadonlySet<string>, rand: () => number): PackResult {
  const chosen: string[] = [];
  const sinceEpic = progress.sinceEpic + 1;
  const sinceLegend = progress.sinceLegend + 1;
  let gotEpic = false;
  let gotLegend = false;
  PACK_SLOTS.forEach((odds, slot) => {
    let rarity = pickRarity(odds, rand);
    let onlyNew = false;
    // La garantie joue sur la dernière carte, si le paquet ne l'a pas déjà donnée
    if (slot === PACK_SLOTS.length - 1) {
      if (sinceLegend >= PITY_LEGEND && !gotLegend) {
        rarity = "legendaire";
        onlyNew = true;
      } else if (sinceEpic >= PITY_EPIC && !gotEpic && rarity !== "legendaire") {
        rarity = "epique";
        onlyNew = true;
      }
    }
    const all = CARDS.filter((c) => c.rarity === rarity && !chosen.includes(c.id));
    const missing = all.filter((c) => !owned.has(c.id));
    const pool = onlyNew && missing.length > 0 ? missing : all;
    const card = pool[Math.floor(rand() * pool.length)]!;
    chosen.push(card.id);
    if (rarity === "epique" || rarity === "legendaire") gotEpic = true;
    if (rarity === "legendaire") gotLegend = true;
  });
  return { cards: chosen, next: { sinceEpic: gotEpic ? 0 : sinceEpic, sinceLegend: gotLegend ? 0 : sinceLegend } };
}

/** Les points offerts une fois, pour avoir complété une famille */
export const familyBonus = (family: CardFamily) => CARDS.filter((c) => c.family === family).length * 15;

// Ce qu'échangent le site et le serveur

export interface AlbumResponse {
  balance: number;
  /** Les cartes possédées et leur nombre d'exemplaires */
  owned: Record<string, number>;
  packs: number;
}

export interface PackResponse extends AlbumResponse {
  cards: { id: string; isNew: boolean }[];
  /** Les familles que ce paquet vient de compléter */
  completed: CardFamily[];
}
