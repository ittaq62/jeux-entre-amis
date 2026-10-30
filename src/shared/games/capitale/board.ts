// Capitale : le plateau (40 cases sur les villes de France), les groupes de couleur et les cartes.
// La structure, les prix et les loyers sont ceux de la règle classique ; les noms et les textes sont à nous.

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
  /** Terrain : loyer nu, puis avec 1 à 4 maisons, puis avec l'hôtel */
  rents?: [number, number, number, number, number, number];
  /** Impôts et péage */
  tax?: number;
  deck?: DeckId;
}

export interface Group {
  id: GroupId;
  name: string;
  color: string;
  /** Prix d'une maison (et de l'hôtel) dans ce groupe */
  houseCost: number;
  squares: number[];
}

export const GO_SALARY = 200;
export const START_CASH = 1500;
export const JAIL_SQUARE = 10;
export const JAIL_FINE = 50;
export const BANK_HOUSES = 32;
export const BANK_HOTELS = 12;
/** 5 « maisons » sur un terrain : c'est l'hôtel */
export const HOTEL = 5;
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
// Les cartes : « Hasard » fait surtout bouger, « Courrier » surtout payer ou encaisser
// ---------------------------------------------------------------------------

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
  /** Réparations : tant par maison, tant par hôtel */
  | { kind: "repairs"; house: number; hotel: number }
  /** Chaque joueur vous donne (positif), ou vous donnez à chacun (négatif) */
  | { kind: "eachPlayer"; amount: number };

export interface Card {
  text: string;
  effect: CardEffect;
}

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
    {
      text: "Correspondance : prenez le TGV le plus proche. S'il a un propriétaire, payez-lui le double du loyer.",
      effect: { kind: "nearest", target: "station" },
    },
    {
      text: "Panne de courant : rendez-vous au réseau le plus proche. S'il a un propriétaire, payez-lui 10 fois les dés.",
      effect: { kind: "nearest", target: "utility" },
    },
    { text: "Votre banque vous verse un dividende de 50.", effect: { kind: "money", amount: 50 } },
    { text: "Libéré de prison ! Gardez cette carte jusqu'à ce que vous en ayez besoin.", effect: { kind: "jailFree" } },
    { text: "Vous avez oublié vos clés : reculez de 3 cases.", effect: { kind: "moveBy", steps: -3 } },
    { text: "Contrôle de police : allez en prison, sans passer par Départ.", effect: { kind: "jail" } },
    { text: "Travaux dans vos logements : 25 par maison et 100 par hôtel.", effect: { kind: "repairs", house: 25, hotel: 100 } },
    { text: "Excès de vitesse : amende de 15.", effect: { kind: "money", amount: -15 } },
    { text: "Prenez le TGV Atlantique. Si vous passez par Départ, touchez 200.", effect: { kind: "moveTo", square: 5 } },
    { text: "Vous voilà élu maire : offrez 50 à chaque joueur.", effect: { kind: "eachPlayer", amount: -50 } },
    { text: "Votre placement en bourse rapporte 150.", effect: { kind: "money", amount: 150 } },
  ],
  courrier: [
    { text: "Avancez jusqu'à la case Départ.", effect: { kind: "moveTo", square: 0 } },
    { text: "Erreur de la banque en votre faveur : recevez 200.", effect: { kind: "money", amount: 200 } },
    { text: "Visite chez le dentiste : payez 50.", effect: { kind: "money", amount: -50 } },
    { text: "Vous vendez votre vieux vélo en ligne : recevez 50.", effect: { kind: "money", amount: 50 } },
    { text: "Libéré de prison ! Gardez cette carte jusqu'à ce que vous en ayez besoin.", effect: { kind: "jailFree" } },
    { text: "Convocation au commissariat : allez en prison, sans passer par Départ.", effect: { kind: "jail" } },
    { text: "Remboursement d'impôts : recevez 20.", effect: { kind: "money", amount: 20 } },
    { text: "C'est votre anniversaire : chaque joueur vous donne 10.", effect: { kind: "eachPlayer", amount: 10 } },
    { text: "Votre assurance vie arrive à échéance : recevez 100.", effect: { kind: "money", amount: 100 } },
    { text: "Facture d'hôpital : payez 100.", effect: { kind: "money", amount: -100 } },
    { text: "Frais de scolarité : payez 50.", effect: { kind: "money", amount: -50 } },
    { text: "Vous conseillez un voisin pour sa déco : recevez 25.", effect: { kind: "money", amount: 25 } },
    { text: "Ravalement de façade : 40 par maison et 115 par hôtel.", effect: { kind: "repairs", house: 40, hotel: 115 } },
    { text: "Deuxième prix au concours de pétanque : recevez 10.", effect: { kind: "money", amount: 10 } },
    { text: "Héritage d'une tante éloignée : recevez 100.", effect: { kind: "money", amount: 100 } },
    { text: "La fête du village a bien marché : recevez 100.", effect: { kind: "money", amount: 100 } },
  ],
};

export const DECK_NAMES: Record<DeckId, string> = { hasard: "Hasard", courrier: "Courrier" };
