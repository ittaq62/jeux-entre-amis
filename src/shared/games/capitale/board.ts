// Capitale : le plateau (40 cases sur les villes de France), les groupes de couleur, les bâtiments et les cartes.
// La structure, les prix et les loyers de base sont ceux de la règle classique ; la ville, les noms et les textes sont à nous.

import { TABLE_TEAMS } from "../teams.ts";

export type GroupId = "brun" | "ciel" | "rose" | "orange" | "rouge" | "jaune" | "vert" | "bleu";
export type DeckId = "hasard" | "courrier";

export type SquareKind = "go" | "property" | "station" | "utility" | "tax" | "card" | "jail" | "rest" | "toJail";

export interface Square {
  index: number;
  kind: SquareKind;
  name: string;
  /** Prix d'achat (terrains, gares, réseaux) */
  price?: number;
  group?: GroupId;
  /** Terrain : loyer nu, puis aux niveaux 1 à 5 (de la maison au monument de la ville) */
  rents?: [number, number, number, number, number, number];
  /** Impôts et péage */
  tax?: number;
  deck?: DeckId;
}

export interface Group {
  id: GroupId;
  name: string;
  color: string;
  /** Le prix d'un niveau dans ce quartier */
  houseCost: number;
  squares: number[];
}

export const GO_SALARY = 200;
export const START_CASH = 1500;
export const JAIL_SQUARE = 10;
export const JAIL_FINE = 50;
export const STATION_RENTS = [25, 50, 100, 200] as const;

const prop = (
  index: number,
  name: string,
  group: GroupId,
  price: number,
  rents: [number, number, number, number, number, number],
): Square => ({ index, kind: "property", name, group, price, rents });

export const SQUARES: Square[] = [
  { index: 0, kind: "go", name: "Départ" },
  prop(1, "Guéret", "brun", 60, [2, 10, 30, 90, 160, 250]),
  { index: 2, kind: "card", name: "Courrier", deck: "courrier" },
  prop(3, "Aurillac", "brun", 60, [4, 20, 60, 180, 320, 450]),
  { index: 4, kind: "tax", name: "Impôts", tax: 200 },
  { index: 5, kind: "station", name: "TGV Atlantique", price: 200 },
  prop(6, "Mende", "ciel", 100, [6, 30, 90, 270, 400, 550]),
  { index: 7, kind: "card", name: "Hasard", deck: "hasard" },
  prop(8, "Vesoul", "ciel", 100, [6, 30, 90, 270, 400, 550]),
  prop(9, "Foix", "ciel", 120, [8, 40, 100, 300, 450, 600]),
  { index: 10, kind: "jail", name: "Prison" },
  prop(11, "Périgueux", "rose", 140, [10, 50, 150, 450, 625, 750]),
  { index: 12, kind: "utility", name: "Barrage", price: 150 },
  prop(13, "Auxerre", "rose", 140, [10, 50, 150, 450, 625, 750]),
  prop(14, "Chartres", "rose", 160, [12, 60, 180, 500, 700, 900]),
  { index: 15, kind: "station", name: "TGV Sud-Est", price: 200 },
  prop(16, "Limoges", "orange", 180, [14, 70, 200, 550, 750, 950]),
  { index: 17, kind: "card", name: "Courrier", deck: "courrier" },
  prop(18, "Brest", "orange", 180, [14, 70, 200, 550, 750, 950]),
  prop(19, "Poitiers", "orange", 200, [16, 80, 220, 600, 800, 1000]),
  { index: 20, kind: "rest", name: "Aire de repos" },
  prop(21, "Clermont-Ferrand", "rouge", 220, [18, 90, 250, 700, 875, 1050]),
  { index: 22, kind: "card", name: "Hasard", deck: "hasard" },
  prop(23, "Dijon", "rouge", 220, [18, 90, 250, 700, 875, 1050]),
  prop(24, "Rennes", "rouge", 240, [20, 100, 300, 750, 925, 1100]),
  { index: 25, kind: "station", name: "TGV Est", price: 200 },
  prop(26, "Montpellier", "jaune", 260, [22, 110, 330, 800, 975, 1150]),
  prop(27, "Strasbourg", "jaune", 260, [22, 110, 330, 800, 975, 1150]),
  { index: 28, kind: "utility", name: "Parc éolien", price: 150 },
  prop(29, "Toulouse", "jaune", 280, [24, 120, 360, 850, 1025, 1200]),
  { index: 30, kind: "toJail", name: "Allez en prison" },
  prop(31, "Nantes", "vert", 300, [26, 130, 390, 900, 1100, 1275]),
  prop(32, "Lille", "vert", 300, [26, 130, 390, 900, 1100, 1275]),
  { index: 33, kind: "card", name: "Courrier", deck: "courrier" },
  prop(34, "Bordeaux", "vert", 320, [28, 150, 450, 1000, 1200, 1400]),
  { index: 35, kind: "station", name: "TGV Nord", price: 200 },
  { index: 36, kind: "card", name: "Hasard", deck: "hasard" },
  prop(37, "Lyon", "bleu", 350, [35, 175, 500, 1100, 1300, 1500]),
  { index: 38, kind: "tax", name: "Péage", tax: 100 },
  prop(39, "Paris", "bleu", 400, [50, 200, 600, 1400, 1700, 2000]),
];

export const GROUPS: Record<GroupId, Group> = {
  brun: { id: "brun", name: "Brun", color: "#8a5a3b", houseCost: 50, squares: [1, 3] },
  ciel: { id: "ciel", name: "Ciel", color: "#7fc6e8", houseCost: 50, squares: [6, 8, 9] },
  rose: { id: "rose", name: "Rose", color: "#d4558f", houseCost: 100, squares: [11, 13, 14] },
  orange: { id: "orange", name: "Orange", color: "#ec8a2f", houseCost: 100, squares: [16, 18, 19] },
  rouge: { id: "rouge", name: "Rouge", color: "#d6433a", houseCost: 150, squares: [21, 23, 24] },
  jaune: { id: "jaune", name: "Jaune", color: "#f0c93b", houseCost: 150, squares: [26, 27, 29] },
  vert: { id: "vert", name: "Vert", color: "#2e9d59", houseCost: 200, squares: [31, 32, 34] },
  bleu: { id: "bleu", name: "Bleu", color: "#2f5bb8", houseCost: 200, squares: [37, 39] },
};

export const GROUP_ORDER: GroupId[] = ["brun", "ciel", "rose", "orange", "rouge", "jaune", "vert", "bleu"];
export const STATIONS = [5, 15, 25, 35];
export const UTILITIES = [12, 28];
/** Tout ce qui s'achète : terrains, gares, réseaux */
export const BUYABLE = SQUARES.filter((s) => s.price !== undefined).map((s) => s.index);

/** Les quatre côtés du plateau, chacun avec ses rues : deux quartiers par côté, de Départ à la Prison et ainsi de suite */
export const SIDES: { groups: GroupId[]; squares: number[] }[] = [0, 1, 2, 3].map((k) => {
  const squares = SQUARES.filter((s) => s.kind === "property" && s.index > k * 10 && s.index < k * 10 + 10).map((s) => s.index);
  return { groups: [...new Set(squares.map((i) => SQUARES[i]!.group!))], squares };
});

/** Les équipes : les deux premières sont celles de la tournée (mêmes noms, mêmes couleurs) ; une troisième aux tables */
export const CAPITALE_TEAMS = TABLE_TEAMS;
export const teamName = (team: number) => CAPITALE_TEAMS[team]?.name ?? `Équipe ${team + 1}`;

/** Le nom d'un côté du plateau, par ses deux quartiers : « le côté rose et orange » */
export const sideName = (side: number) => `le côté ${(SIDES[side]?.groups ?? []).map((g) => GROUPS[g].name.toLowerCase()).join(" et ")}`;

/** Monopole : la partie s'arrête net pour qui réunit trois quartiers complets, toutes les rues d'un côté, ou les quatre gares */
export const MONOPOLY_GROUPS = 3;
export type MonopolyKind = "groups" | "side" | "stations";

export const square = (index: number): Square => SQUARES[index]!;
export const isBuyable = (index: number) => SQUARES[index]?.price !== undefined;
export const groupOf = (index: number): Group | null => {
  const g = SQUARES[index]?.group;
  return g ? GROUPS[g] : null;
};
export const mortgageValue = (index: number) => Math.floor((SQUARES[index]!.price ?? 0) / 2);
/** Lever une hypothèque : sa valeur plus 10 % d'intérêts */
export const unmortgageCost = (index: number) => Math.ceil(mortgageValue(index) * 1.1);
export const mortgageInterest = (index: number) => unmortgageCost(index) - mortgageValue(index);

// ---------------------------------------------------------------------------
// Améliorer une rue : un bouton, un niveau de plus, de la maison au monument de la ville
// ---------------------------------------------------------------------------

/** Le plus haut niveau : le monument de la ville (le loyer de l'hôtel de la règle classique) */
export const MAX_LEVEL = 5;
/** Jusqu'à ce niveau, une rue seule suffit ; au-delà, il faut tout le quartier (l'ancienne règle, sans construction équilibrée) */
export const FREE_LEVELS = 3;
/** Construction équilibrée : une rue seule ne dépasse pas deux maisons */
export const FREE_LEVELS_EVEN = 2;
/** Ce qu'on voit pousser sur la rue, niveau par niveau */
export const LEVEL_NAMES = ["Terrain nu", "Une maison", "Deux maisons", "Un immeuble", "Deux immeubles", "Le monument"] as const;

/** Le monument de chaque ville, son dernier niveau : un vrai monument de la ville, à sa place sur la parcelle */
export const LANDMARKS: Record<number, string> = {
  1: "l'hôtel des Moneyroux",
  3: "le château Saint-Étienne",
  6: "la cathédrale de Mende",
  8: "la Motte et sa Vierge",
  9: "le château de Foix",
  11: "la cathédrale Saint-Front",
  13: "la tour de l'Horloge",
  14: "la cathédrale de Chartres",
  16: "la gare des Bénédictins",
  18: "le pont de Recouvrance",
  19: "Notre-Dame-la-Grande",
  21: "la cathédrale de Clermont",
  23: "le palais des Ducs",
  24: "le parlement de Bretagne",
  26: "l'arc du Peyrou",
  27: "la cathédrale de Strasbourg",
  29: "la basilique Saint-Sernin",
  31: "le château des Ducs de Bretagne",
  32: "le beffroi de Lille",
  34: "la Grosse Cloche",
  37: "la basilique de Fourvière",
  39: "la tour Eiffel",
};

/** Le nom du niveau d'une rue : « Deux maisons », ou le monument de la ville (« La tour Eiffel ») */
export function levelName(index: number, level: number): string {
  if (level >= MAX_LEVEL) {
    const name = LANDMARKS[index];
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : LEVEL_NAMES[MAX_LEVEL];
  }
  return LEVEL_NAMES[Math.max(0, level)] ?? LEVEL_NAMES[0];
}

/** Un niveau de plus coûte le prix de référence du quartier */
export const upgradeCost = (index: number) => groupOf(index)?.houseCost ?? 50;

/**
 * Racheter la ville d'un adversaire : sa valeur (le titre, ses niveaux et le bâtiment spécial de son propriétaire, au
 * prix coûtant) majorée de moitié, payée à son propriétaire
 */
export const BUYOUT_RATE = 1.5;

/** Ce que paie chaque adversaire qui passe sur la case d'un stade */
export const STADIUM_TICKET = 50;

export type SpecialKind = "monument" | "parc" | "stade" | "decharge" | "centrale";

export interface SpecialInfo {
  name: string;
  /** Le nom avec son article, pour les phrases : « une décharge », « le parc » */
  one: string;
  the: string;
  /** Une nuisance se pose chez un adversaire ; les autres, chez soi */
  nuisance: boolean;
  /** Où il se pose, puis ce qu'il fait, chacun en une phrase courte */
  where: string;
  effect: string;
}

export const SPECIALS: Record<SpecialKind, SpecialInfo> = {
  // L'obélisque (son identifiant reste « monument » : les parties en cours le gardent). Le monument, c'est désormais le
  // dernier niveau de chaque ville
  monument: {
    name: "Obélisque",
    one: "un obélisque",
    the: "l'obélisque",
    nuisance: false,
    where: "Sur une rue d'un quartier complet à toi.",
    effect: "Double tous les loyers du quartier.",
  },
  parc: {
    name: "Parc",
    one: "un parc",
    the: "le parc",
    nuisance: false,
    where: "Sur une de tes rues.",
    effect: "Protège tout le quartier des nuisances.",
  },
  stade: {
    name: "Stade",
    one: "un stade",
    the: "le stade",
    nuisance: false,
    where: "Sur une de tes rues, un seul par joueur.",
    effect: `Chaque adversaire qui passe sur la case te paie ${STADIUM_TICKET} ₣.`,
  },
  decharge: {
    name: "Décharge",
    one: "une décharge",
    the: "la décharge",
    nuisance: true,
    where: "Chez un adversaire.",
    effect: "Divise par deux le loyer de la rue.",
  },
  centrale: {
    name: "Centrale",
    one: "une centrale",
    the: "la centrale",
    nuisance: true,
    where: "Chez un adversaire.",
    effect: "Ramène le loyer de la rue à celui du terrain nu.",
  },
};

export const SPECIAL_ORDER: SpecialKind[] = ["monument", "parc", "stade", "decharge", "centrale"];
export const isSpecialKind = (k: unknown): k is SpecialKind => typeof k === "string" && Object.hasOwn(SPECIALS, k);

/** Le prix d'un bâtiment spécial ; l'obélisque vaut quatre niveaux du quartier */
export function specialPrice(kind: SpecialKind, index: number): number {
  switch (kind) {
    case "monument":
      return 4 * upgradeCost(index);
    case "parc":
      return 100;
    case "stade":
      return 200;
    case "decharge":
      return 100;
    case "centrale":
      return 200;
  }
}

// ---------------------------------------------------------------------------
// Les cartes : « Hasard » fait surtout bouger et porte les grandes catastrophes, « Courrier » surtout payer ou encaisser
// ---------------------------------------------------------------------------

/**
 * Les catastrophes. Elles n'abattent que des niveaux (jamais un bâtiment spécial), ou font changer un titre de mains :
 * - séisme : la ville la plus haute de celui qui tire perd un niveau ;
 * - incendie : une de ses villes construites, au hasard, perd un niveau ;
 * - tempête : la ville la plus haute de chaque joueur perd un niveau ;
 * - crue : toutes les villes construites d'un quartier tiré au sort perdent un niveau, quel que soit leur propriétaire ;
 * - péril : la ville adverse au plus gros loyer perd un niveau (un monument, niveau 5, est classé : il n'est pas visé) ;
 * - expropriation : la banque reprend son titre le moins cher, sans construction, et le paie à son prix ;
 * - cession : son titre le moins cher, sans construction, passe au joueur adverse le plus pauvre.
 */
export type DisasterKind = "seisme" | "incendie" | "tempete" | "crue" | "peril" | "expropriation" | "cession";

export const DISASTERS: Record<DisasterKind, { name: string; who: string }> = {
  seisme: { name: "Séisme", who: "Ta ville la plus haute" },
  incendie: { name: "Incendie", who: "Une de tes villes, au hasard" },
  tempete: { name: "Tempête", who: "La ville la plus haute de chaque joueur" },
  crue: { name: "Crue", who: "Toutes les villes d'un quartier tiré au sort" },
  peril: { name: "Arrêté de péril", who: "La ville adverse au plus gros loyer" },
  expropriation: { name: "Expropriation", who: "Ton titre le moins cher, sans construction" },
  cession: { name: "Cession forcée", who: "Ton titre le moins cher, sans construction" },
};

export type CardEffect =
  /** Gagner (positif) ou payer (négatif) à la banque */
  | { kind: "money"; amount: number }
  /** Avancer jusqu'à une case, en touchant le salaire si on passe par Départ */
  | { kind: "moveTo"; square: number }
  | { kind: "moveBy"; steps: number }
  /** Avancer jusqu'à la gare ou au réseau le plus proche : loyer double, ou 10 fois les dés */
  | { kind: "nearest"; target: "station" | "utility" }
  | { kind: "jail" }
  | { kind: "jailFree" }
  /** Travaux : tant par niveau, tant par monument (niveau 5) */
  | { kind: "repairs"; level: number; tower: number }
  /** Une prime : tant par niveau, tant par monument (niveau 5) */
  | { kind: "grant"; level: number; tower: number }
  /** Chaque joueur vous donne (positif), ou vous donnez à chacun (négatif) */
  | { kind: "eachPlayer"; amount: number }
  /** Tant par titre possédé : reçu (positif) ou payé (négatif) */
  | { kind: "perTitle"; amount: number }
  /** Le joueur le plus riche donne cette somme au plus pauvre (celui qui tire peut être l'un ou l'autre, ou aucun) */
  | { kind: "richToPoor"; amount: number }
  /** La banque verse le loyer de sa ville qui rapporte le plus, dans la limite de max */
  | { kind: "bestRent"; max: number }
  | { kind: "disaster"; disaster: DisasterKind };

export interface Card {
  text: string;
  /** En Builder, où il n'y a pas de niveaux : le même effet, dit avec les bâtiments de la carte */
  builder?: string;
  effect: CardEffect;
}

/** Une catastrophe : la carte ne compte que si la règle des catastrophes est jouée */
export const isDisaster = (c: Card) => c.effect.kind === "disaster";

// Les seize premières cartes de chaque paquet gardent leur place et leur effet : une partie commencée avant l'arrivée
// des nouvelles cartes continue avec son paquet d'alors.
export const DECKS: Record<DeckId, Card[]> = {
  hasard: [
    { text: "Avancez jusqu'à la case Départ.", effect: { kind: "moveTo", square: 0 } },
    { text: "Week-end en amoureux : rendez-vous à Paris.", effect: { kind: "moveTo", square: 39 } },
    { text: "Séminaire à Rennes. Si vous passez par Départ, touchez 200.", effect: { kind: "moveTo", square: 24 } },
    { text: "Foire au foie gras à Périgueux. Si vous passez par Départ, touchez 200.", effect: { kind: "moveTo", square: 11 } },
    {
      text: "Prenez le TGV le plus proche. S'il a un propriétaire, payez-lui le double du loyer.",
      effect: { kind: "nearest", target: "station" },
    },
    { text: "Escapade en Alsace : prenez le TGV Est. Si vous passez par Départ, touchez 200.", effect: { kind: "moveTo", square: 25 } },
    {
      text: "Panne de courant : rendez-vous au réseau le plus proche. S'il a un propriétaire, payez-lui 10 fois les dés.",
      effect: { kind: "nearest", target: "utility" },
    },
    { text: "Votre banque vous verse un dividende de 50.", effect: { kind: "money", amount: 50 } },
    { text: "Libéré de prison ! Gardez cette carte jusqu'à ce que vous en ayez besoin.", effect: { kind: "jailFree" } },
    { text: "Vous avez oublié vos clés : reculez de 3 cases.", effect: { kind: "moveBy", steps: -3 } },
    { text: "Contrôle de police : allez en prison, sans passer par Départ.", effect: { kind: "jail" } },
    {
      text: "Travaux dans vos logements : 25 par niveau et 100 par monument.",
      builder: "Travaux dans vos villes : 25 par tranche bâtie et 100 par monument.",
      effect: { kind: "repairs", level: 25, tower: 100 },
    },
    { text: "Excès de vitesse : amende de 15.", effect: { kind: "money", amount: -15 } },
    { text: "Prenez le TGV Atlantique. Si vous passez par Départ, touchez 200.", effect: { kind: "moveTo", square: 5 } },
    { text: "Vous voilà élu maire : offrez 50 à chaque joueur.", effect: { kind: "eachPlayer", amount: -50 } },
    { text: "Votre placement en bourse rapporte 150.", effect: { kind: "money", amount: 150 } },
    // Les nouvelles
    { text: "Raccourci par les petites routes : avancez de 3 cases.", effect: { kind: "moveBy", steps: 3 } },
    { text: "Pause café : rendez-vous à l'Aire de repos.", effect: { kind: "moveTo", square: 20 } },
    {
      text: "Dégustation dans les chais : rendez-vous à Bordeaux. Si vous passez par Départ, touchez 200.",
      effect: { kind: "moveTo", square: 34 },
    },
    {
      text: "Randonnée dans les Pyrénées : rendez-vous à Foix. Si vous passez par Départ, touchez 200.",
      effect: { kind: "moveTo", square: 9 },
    },
    { text: "Vous trouvez un billet sur le trottoir : gardez 20.", effect: { kind: "money", amount: 20 } },
    { text: "Prime de covoiturage : recevez 40.", effect: { kind: "money", amount: 40 } },
    { text: "Gros lot à la tombola de la kermesse : recevez 120.", effect: { kind: "money", amount: 120 } },
    { text: "Vous revendez vos vieux vinyles : recevez 60.", effect: { kind: "money", amount: 60 } },
    { text: "Votre photo gagne le concours de la mairie : recevez 50.", effect: { kind: "money", amount: 50 } },
    { text: "Pneu crevé sur l'autoroute : payez 40.", effect: { kind: "money", amount: -40 } },
    { text: "Stationnement gênant : amende de 30.", effect: { kind: "money", amount: -30 } },
    { text: "Votre téléphone tombe dans le canal : payez 80.", effect: { kind: "money", amount: -80 } },
    { text: "Vous vous asseyez sur vos lunettes : payez 50.", effect: { kind: "money", amount: -50 } },
    { text: "Contrôle technique raté : payez 70.", effect: { kind: "money", amount: -70 } },
    { text: "Taxe foncière : payez 15 par titre que vous possédez.", effect: { kind: "perTitle", amount: -15 } },
    { text: "Esprit de solidarité : le joueur le plus riche donne 100 au plus pauvre.", effect: { kind: "richToPoor", amount: 100 } },
    {
      text: "Journées du patrimoine : la banque vous verse le loyer de votre ville la plus rentable (300 au plus).",
      effect: { kind: "bestRent", max: 300 },
    },
    {
      text: "Séisme ! Votre ville la plus haute perd un niveau.",
      builder: "Séisme ! Dans votre ville au plus gros loyer, le bâtiment le plus cher s'effondre.",
      effect: { kind: "disaster", disaster: "seisme" },
    },
    {
      text: "Incendie ! Un niveau de l'une de vos villes, au hasard, part en fumée.",
      builder: "Incendie ! Un bâtiment de l'une de vos villes, au hasard, part en fumée.",
      effect: { kind: "disaster", disaster: "incendie" },
    },
    {
      text: "Tempête sur le pays : la ville la plus haute de chaque joueur perd un niveau.",
      builder: "Tempête sur le pays : dans la ville au plus gros loyer de chaque joueur, le bâtiment le plus cher tombe.",
      effect: { kind: "disaster", disaster: "tempete" },
    },
    {
      text: "La rivière déborde : toutes les villes d'un quartier tiré au sort perdent un niveau.",
      builder: "La rivière déborde : dans chaque ville bâtie d'un quartier tiré au sort, le bâtiment le plus cher est emporté.",
      effect: { kind: "disaster", disaster: "crue" },
    },
    {
      text: "Arrêté de péril : la ville adverse au plus gros loyer perd un niveau (un monument, classé, est épargné).",
      builder: "Arrêté de péril : dans la ville adverse au plus gros loyer, le bâtiment le plus cher est abattu (le monument est classé).",
      effect: { kind: "disaster", disaster: "peril" },
    },
  ],
  courrier: [
    { text: "Un billet de train vous attend : avancez jusqu'à la case Départ.", effect: { kind: "moveTo", square: 0 } },
    { text: "Erreur de la banque en votre faveur : recevez 200.", effect: { kind: "money", amount: 200 } },
    { text: "Visite chez le dentiste : payez 50.", effect: { kind: "money", amount: -50 } },
    { text: "Vous vendez votre vieux vélo en ligne : recevez 50.", effect: { kind: "money", amount: 50 } },
    { text: "Lettre de grâce : vous sortirez de prison quand vous voudrez. Gardez cette carte.", effect: { kind: "jailFree" } },
    { text: "Convocation au commissariat : allez en prison, sans passer par Départ.", effect: { kind: "jail" } },
    { text: "Remboursement d'impôts : recevez 20.", effect: { kind: "money", amount: 20 } },
    { text: "C'est votre anniversaire : chaque joueur vous donne 10.", effect: { kind: "eachPlayer", amount: 10 } },
    { text: "Votre assurance vie arrive à échéance : recevez 100.", effect: { kind: "money", amount: 100 } },
    { text: "Facture d'hôpital : payez 100.", effect: { kind: "money", amount: -100 } },
    { text: "Frais de scolarité : payez 50.", effect: { kind: "money", amount: -50 } },
    { text: "Vous conseillez un voisin pour sa déco : recevez 25.", effect: { kind: "money", amount: 25 } },
    {
      text: "Ravalement de façade : 40 par niveau et 115 par monument.",
      builder: "Ravalement de façade : 40 par tranche bâtie et 115 par monument.",
      effect: { kind: "repairs", level: 40, tower: 115 },
    },
    { text: "Deuxième prix au concours de pétanque : recevez 10.", effect: { kind: "money", amount: 10 } },
    { text: "Héritage d'une tante éloignée : recevez 100.", effect: { kind: "money", amount: 100 } },
    { text: "La fête du village a bien marché : recevez 100.", effect: { kind: "money", amount: 100 } },
    // Les nouvelles
    { text: "Fuite d'eau dans la cuisine : le plombier vous coûte 80.", effect: { kind: "money", amount: -80 } },
    { text: "Échéance de l'assurance habitation : payez 60.", effect: { kind: "money", amount: -60 } },
    { text: "Le chat chez le vétérinaire : payez 40.", effect: { kind: "money", amount: -40 } },
    { text: "Votre voiture est à la fourrière : payez 70.", effect: { kind: "money", amount: -70 } },
    { text: "Chaudière en panne en plein hiver : payez 90.", effect: { kind: "money", amount: -90 } },
    { text: "Redressement fiscal : payez 120.", effect: { kind: "money", amount: -120 } },
    { text: "Tapage nocturne : amende de 35.", effect: { kind: "money", amount: -35 } },
    { text: "Abonnement oublié, prélevé quand même : payez 25.", effect: { kind: "money", amount: -25 } },
    { text: "Pot de départ d'un collègue : donnez 15 à chaque joueur.", effect: { kind: "eachPlayer", amount: -15 } },
    { text: "Impôt sur vos biens : payez 20 par titre que vous possédez.", effect: { kind: "perTitle", amount: -20 } },
    { text: "Prime de fin d'année : recevez 75.", effect: { kind: "money", amount: 75 } },
    { text: "Vide-grenier réussi : recevez 30.", effect: { kind: "money", amount: 30 } },
    { text: "Vous louez votre garage : recevez 60.", effect: { kind: "money", amount: 60 } },
    { text: "Pendaison de crémaillère : chaque joueur vous offre 20.", effect: { kind: "eachPlayer", amount: 20 } },
    { text: "Remboursement de la mutuelle : recevez 40.", effect: { kind: "money", amount: 40 } },
    { text: "Votre potiron fait sensation au comice agricole : recevez 15.", effect: { kind: "money", amount: 15 } },
    {
      text: "Prime à la rénovation : 20 par niveau et 50 par monument.",
      builder: "Prime à la rénovation : 20 par tranche bâtie et 50 par monument.",
      effect: { kind: "grant", level: 20, tower: 50 },
    },
    {
      text: "Des termites dans la charpente : un niveau de l'une de vos villes, au hasard, s'effondre.",
      builder: "Des termites dans la charpente : un bâtiment de l'une de vos villes, au hasard, s'effondre.",
      effect: { kind: "disaster", disaster: "incendie" },
    },
    {
      text: "Expropriation pour le tramway : la banque reprend votre titre le moins cher et vous le paie.",
      effect: { kind: "disaster", disaster: "expropriation" },
    },
    {
      text: "Procès perdu : votre titre le moins cher revient au joueur adverse le plus pauvre.",
      effect: { kind: "disaster", disaster: "cession" },
    },
  ],
};

export const DECK_NAMES: Record<DeckId, string> = { hasard: "Hasard", courrier: "Courrier" };

/** Ce qu'annonce une carte : un coup de chance, un coup dur, une catastrophe, ou un voyage */
export type CardTone = "chance" | "malchance" | "catastrophe" | "voyage";

export function cardTone(effect: CardEffect): CardTone {
  switch (effect.kind) {
    case "money":
    case "eachPlayer":
    case "perTitle":
      return effect.amount >= 0 ? "chance" : "malchance";
    case "jailFree":
    case "grant":
    case "bestRent":
    case "richToPoor":
      return "chance";
    case "jail":
    case "repairs":
      return "malchance";
    case "disaster":
      return "catastrophe";
    default:
      return effect.kind === "moveTo" && effect.square === 0 ? "chance" : "voyage";
  }
}

export const CARD_TONE_NAMES: Record<CardTone, string> = {
  chance: "Coup de chance",
  malchance: "Coup dur",
  catastrophe: "Catastrophe",
  voyage: "En route",
};
