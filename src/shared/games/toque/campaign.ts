// La campagne de Toque ! : la route de la roulotte de Mémé Jeanne. Neuf étapes, chacune une cuisine en détresse ; on
// ouvre la suivante avec au moins une étoile à la précédente, et quelques étapes demandent en plus un total d'étoiles.
// Les histoires sont courtes : l'intro (Mémé confie sa roulotte), l'arrivée dans chaque cuisine, le grand final.

import { KITCHEN_IDS, type KitchenId } from "./kitchens.ts";

/** Les étoiles qu'il faut en tout pour ouvrir chaque étape (en plus d'une étoile à la précédente) */
export const GATES: Record<KitchenId, number> = {
  bistrot: 0,
  creperie: 0,
  cantine: 0,
  pizzeria: 5,
  brasserie: 0,
  chalet: 0,
  train: 12,
  guinguette: 0,
  banquet: 18,
};

/** Les étoiles de chaque cuisine (0 à 3) */
export type StarBook = Partial<Record<KitchenId, number>>;

export function totalStars(book: StarBook): number {
  return KITCHEN_IDS.reduce((n, k) => n + Math.max(0, Math.min(3, book[k] ?? 0)), 0);
}

/** Pourquoi une étape est encore fermée, ou null si elle est ouverte */
export function lockOf(kitchen: KitchenId, book: StarBook): { previous: KitchenId | null; need: number } | null {
  const i = KITCHEN_IDS.indexOf(kitchen);
  if (i <= 0) return null;
  const previous = KITCHEN_IDS[i - 1]!;
  const prevOk = (book[previous] ?? 0) >= 1;
  const need = GATES[kitchen];
  if (prevOk && totalStars(book) >= need) return null;
  return { previous: prevOk ? null : previous, need };
}

export const isOpen = (kitchen: KitchenId, book: StarBook) => lockOf(kitchen, book) === null;

/** La dernière étape ouverte (où la roulotte attend) */
export function frontier(book: StarBook): KitchenId {
  let last: KitchenId = "bistrot";
  for (const k of KITCHEN_IDS) if (isOpen(k, book)) last = k;
  return last;
}

/** Ce qu'il faut encore pour ouvrir l'étape, en mots (« Une étoile au bistrot, et 5 étoiles en tout ») */
export function lockText(kitchen: KitchenId, book: StarBook, names: Record<KitchenId, string>): string | null {
  const lock = lockOf(kitchen, book);
  if (!lock) return null;
  const parts: string[] = [];
  if (lock.previous) parts.push(`une étoile à « ${names[lock.previous]} »`);
  const have = totalStars(book);
  if (lock.need > have) parts.push(`${lock.need} étoiles en tout (tu en as ${have})`);
  if (parts.length === 0) return null;
  const s = parts.join(", et ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Les histoires
// ---------------------------------------------------------------------------

/** Qui parle : Mémé, le patron de la cuisine, ou toute la brigade */
export type Speaker = "meme" | "patron" | "brigade" | "voix";

export interface Line {
  who: Speaker;
  text: string;
}

/** Les gens de la route : leur nom, et à quoi ils ressemblent (leurs couleurs, leur chapeau) */
export interface Host {
  name: string;
  /** Une phrase de présentation sous le nom */
  role: string;
  /** Le portrait : teint, cheveux, couleur des cheveux, fond (les indices de l'avatar), chapeau, accessoire */
  look: { skin: number; hair: number; hairColor: number; bg: number; hat: number; extra: number; eyes: number; mouth: number };
}

export const MEME: Host = {
  name: "Mémé Jeanne",
  role: "Quarante ans de fourneaux, et toutes ses dents",
  look: { skin: 0, hair: 6, hairColor: 4, bg: 8, hat: 0, extra: 1, eyes: 2, mouth: 1 },
};

export const HOSTS: Record<KitchenId, Host> = {
  bistrot: MEME,
  creperie: {
    name: "Capitaine Yvon",
    role: "Crêpier et marin, dans cet ordre",
    look: { skin: 1, hair: 2, hairColor: 4, bg: 5, hat: 4, extra: 0, eyes: 1, mouth: 3 },
  },
  cantine: {
    name: "Madame Lucienne",
    role: "Dame de cantine, terreur des petits pois",
    look: { skin: 2, hair: 5, hairColor: 2, bg: 3, hat: 0, extra: 1, eyes: 4, mouth: 2 },
  },
  pizzeria: {
    name: "Gino",
    role: "Pizzaiolo, a peur du vide mais pas du vent",
    look: { skin: 2, hair: 3, hairColor: 0, bg: 0, hat: 0, extra: 3, eyes: 0, mouth: 4 },
  },
  brasserie: {
    name: "Paulette",
    role: "La patronne, une voix à couvrir le marché",
    look: { skin: 3, hair: 4, hairColor: 1, bg: 1, hat: 0, extra: 0, eyes: 3, mouth: 0 },
  },
  chalet: {
    name: "Firmin",
    role: "Gardien du refuge, quarante hivers là-haut",
    look: { skin: 0, hair: 1, hairColor: 4, bg: 11, hat: 6, extra: 2, eyes: 5, mouth: 5 },
  },
  train: {
    name: "Hector",
    role: "Chef de train, toujours à l'heure (presque)",
    look: { skin: 4, hair: 2, hairColor: 0, bg: 6, hat: 1, extra: 0, eyes: 6, mouth: 6 },
  },
  guinguette: {
    name: "Mado",
    role: "Elle danse, elle cuisine, elle rame",
    look: { skin: 1, hair: 7, hairColor: 3, bg: 4, hat: 0, extra: 4, eyes: 7, mouth: 7 },
  },
  banquet: MEME,
};

/** L'intro : Mémé confie la roulotte et son carnet */
export const INTRO: Line[] = [
  { who: "meme", text: "Ah, vous voilà enfin, mes petits ! Entrez, entrez, ça sent bon, hein ?" },
  { who: "meme", text: "Quarante ans que je tiens ce bistrot. Mes genoux me disent qu'il est temps de passer la main." },
  { who: "meme", text: "Alors voilà : ma vieille roulotte, et mon carnet de recettes. Tout est dedans, même les taches de sauce." },
  { who: "meme", text: "Partout sur la route, des cuisines sont dans le pétrin. Allez leur donner un coup de main." },
  { who: "meme", text: "Et à la fête du village, vous me ferez un banquet. Je goûterai. Je suis très exigeante." },
  { who: "brigade", text: "Oui, Mémé !" },
];

/** L'arrivée dans chaque cuisine : deux ou trois répliques du patron */
export const ARRIVALS: Record<KitchenId, Line[]> = {
  bistrot: [
    { who: "meme", text: "On commence ici, chez moi. Une salade, une soupe à l'oignon : les bases." },
    { who: "meme", text: "On coupe sur la planche, on dresse sur l'assiette, et on sert au passe. Et on ne traîne pas !" },
  ],
  creperie: [
    { who: "patron", text: "Bienvenue à bord, moussaillons ! Ici on fait des crêpes, et la mer fait le reste." },
    { who: "patron", text: "Quand le bateau penche, accrochez-vous à la pâte. Et lavez les assiettes, j'en ai que trois." },
  ],
  cantine: [
    { who: "patron", text: "Silence dans les rangs ! Deux cents enfants à nourrir avant la sonnerie." },
    { who: "patron", text: "Les tables glissent sur leurs rails, ne restez pas dans le passage. Purée-saucisse, et que ça saute !" },
  ],
  pizzeria: [
    { who: "patron", text: "Mamma mia, enfin de l'aide ! Mes fours sont sur ce toit, ma pâte sur l'autre." },
    { who: "patron", text: "Quand le drapeau claque, le vent arrive. Tenez bien vos pizzas en traversant la planche." },
  ],
  brasserie: [
    { who: "patron", text: "C'est samedi, c'est le marché, c'est la folie ! Steak-frites et croque pour tout le quartier." },
    { who: "patron", text: "Gare aux charrettes dans l'allée : elles ne freinent pour personne. Moi non plus d'ailleurs." },
  ],
  chalet: [
    { who: "patron", text: "Fermez la porte, il fait moins quinze ! Les randonneurs veulent de la fondue, et vite." },
    { who: "patron", text: "Le fromage est dehors, sur la terrasse. Attention, ça glisse : le verglas ne pardonne pas." },
  ],
  train: [
    { who: "patron", text: "En voiture ! La voiture-restaurant ouvre, et mon cuisinier est resté sur le quai." },
    { who: "patron", text: "Quand le train siffle, les wagons se décrochent un moment. Ne restez pas sur la passerelle !" },
  ],
  guinguette: [
    { who: "patron", text: "Bonjour les amis ! Dimanche, bal et friture au bord de l'eau." },
    { who: "patron", text: "Le radeau fait la navette entre les deux rives. Ou alors on lance les pommes de terre, c'est plus rapide." },
  ],
  banquet: [
    { who: "meme", text: "Le grand jour ! Tout le village est là, et tous ceux que vous avez aidés sur la route." },
    { who: "meme", text: "Salade, steak-frites et ma tarte aux pommes. Les tables bougent, les fourneaux chauffent. À vous !" },
  ],
};

/** Le grand final, après le banquet réussi */
export const FINALE: Line[] = [
  { who: "meme", text: "Hmm… Hmmmm…" },
  { who: "meme", text: "La tarte est meilleure que la mienne. Ne le répétez à personne." },
  { who: "voix", text: "Le capitaine Yvon, Lucienne, Gino, Paulette, Firmin, Hector et Mado lèvent leur verre." },
  { who: "meme", text: "La roulotte est à vous, mes petits. Et le carnet aussi. Ajoutez-y vos recettes." },
  { who: "brigade", text: "Merci, Mémé !" },
];
