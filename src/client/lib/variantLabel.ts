import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";

// Les noms des variantes, tels que les tables ouvertes de l'accueil et l'historique du profil les montrent. Les circuits
// de Bolides et les parcours du minigolf sont recopiés ici pour garder l'accueil léger (leurs fichiers tirent toute la
// géométrie) : variantLabel.test.ts vérifie qu'ils suivent ceux des jeux.

export const TRACK_NAMES: Record<string, string> = {
  port: "Le Port",
  vignes: "Les Vignes",
  col: "Le Col",
  dunes: "Les Dunes",
  lagon: "Le Lagon",
  volcan: "Le Volcan",
  ville: "La Ville",
  foire: "La Fête foraine",
  potager: "Le Potager",
  foret: "La Forêt",
};

export const COURSE_NAMES: Record<string, string> = {
  jardin: "Jardin du château",
  mer: "Bord de mer",
  montagne: "Montagne enneigée",
  cuisine: "Cuisine géante",
  jungle: "Temple dans la jungle",
  horloger: "Atelier d'horloger",
  lune: "Base lunaire",
  volcan: "Volcan",
};

export const BILLARD_NAMES: Record<string, string> = {
  huit: "pleines et rayées",
  neuf: "la bille 9",
  killer: "le Killer",
  carambole: "trois billes",
};

export const ESCARMOUCHE_NAMES: Record<string, string> = {
  solo: "chacun pour soi",
  equipes: "en équipes",
  conquete: "conquête",
  sabotage: "sabotage",
  zone: "zone à tenir",
  drapeau: "capture du drapeau",
};

const SIDES: Record<string, string> = { duel: "en duel", melee: "en mêlée", teams: "en équipes" };

function trackName(id: string): string | null {
  if (id === "hasard") return "circuit au hasard";
  const mirror = id.endsWith("-miroir");
  const name = TRACK_NAMES[mirror ? id.slice(0, -"-miroir".length) : id];
  return name ? (mirror ? `${name} (miroir)` : name) : null;
}

/** La variante seule (« classique », « en duel », « Le Volcan »…), ou null si elle n'a pas de nom à montrer */
export function variantName(game: GameId, variant: string): string | null {
  switch (game) {
    case "uno":
      return variant === "nomercy" ? "No Mercy" : "classique";
    case "naval":
      return SIDES[variant] ?? null;
    case "bricks":
      return variant === "sprint" ? "solo 40 lignes" : (SIDES[variant] ?? null);
    case "capitale":
      return variant === "bankrupt" ? "jusqu'à la faillite" : variant === "timed" ? "en partie rapide" : null;
    case "meche":
      return variant === "rallonge"
        ? "à rallonge"
        : variant === "chacun"
          ? "chacun sa mèche"
          : variant === "hasard"
            ? "mode au hasard"
            : variant === "commune"
              ? "classique"
              : null;
    case "bolides":
      return trackName(variant);
    case "crampons":
      return /^\d+$/.test(variant) ? `${variant} contre ${variant}` : null;
    case "culbute":
      return variant === "vies" ? "aux vies" : variant === "temps" ? "au temps" : variant === "subite" ? "en mort subite" : null;
    case "escarmouche":
      return ESCARMOUCHE_NAMES[variant] ?? null;
    case "minigolf":
      return COURSE_NAMES[variant] ?? null;
    case "bowling":
      return variant === "spares" ? "défi des spares" : null;
    case "billard":
      return BILLARD_NAMES[variant] ?? null;
  }
}

// Les variantes qui se lisent à la suite du nom du jeu (« UNO classique », « Capitale jusqu'à la faillite ») ; les autres
// viennent après une virgule (« Bolides, Le Volcan »)
const FLOWING: GameId[] = ["uno", "naval", "bricks", "capitale", "meche", "culbute"];

/** Le jeu et sa variante : « UNO classique », « Bataille navale en duel », « Bolides, Le Volcan », « Bowling » */
export function tableLabel(game: GameId, variant: string): string {
  const name = GAME_NAMES[game] ?? game;
  const v = variantName(game, variant);
  if (!v) return name;
  const flows = FLOWING.includes(game) && !(game === "meche" && (variant === "chacun" || variant === "hasard"));
  return flows ? `${name} ${v}` : `${name}, ${v}`;
}
