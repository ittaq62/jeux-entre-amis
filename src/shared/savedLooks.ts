// Les apparences choisies, gardées sur le compte plutôt que sur l'appareil : le kart choisi sur l'ordinateur se retrouve
// sur le téléphone. Une petite liste de clés connues, des valeurs courtes ; la propriété des articles, elle, est vérifiée
// par chaque table au moment de s'en servir (rien ne s'utilise sans être acheté, même enregistré ici).
//
// « p:<champ> » : un choix des préférences de l'appareil (src/client/stores/prefs.ts), un identifiant d'article.
// « s:<clé> »   : le choix qu'un jeu garde lui-même dans le navigateur (localStorage), un petit objet JSON.
// « f:<nom> »   : un drapeau qu'on lève une fois pour toutes (« coach-bowling » : l'aide du bowling a été vue), "1".

/** Les choix d'apparence des préférences de l'appareil */
export const PREF_LOOK_KEYS = [
  "unoBack",
  "navalSkin",
  "capitaleToken",
  "bolidesVehicle",
  "bolidesSkin",
  "cramponsBall",
  "cramponsFete",
  "mecheBomb",
  "escarmoucheCamo",
  "escarmouchePrimary",
  "escarmoucheSecondary",
  "escarmoucheMuzzle",
  "escarmoucheExtra",
  "escarmoucheTenue",
] as const;

export type PrefLookKey = (typeof PREF_LOOK_KEYS)[number];

/** Les choix que les jeux gardent eux-mêmes dans le navigateur, sous ces clés */
export const STORE_LOOK_KEYS = ["billard-skin", "bowling-skin", "minigolf-balle", "culbute-combattant", "cour-maillot"] as const;

export type StoreLookKey = (typeof STORE_LOOK_KEYS)[number];

export type SavedLooks = Record<string, string | Record<string, unknown>>;

/** La taille d'un petit objet d'un jeu, et de tout l'ensemble, une fois écrits */
export const STORE_LOOK_MAX = 1024;
export const SAVED_LOOKS_MAX = 4096;

const ID = /^[a-z0-9][a-z0-9_:-]{0,47}$/i;

/** Le nom d'un drapeau : court, en minuscules */
export const FLAG = /^[a-z0-9][a-z0-9-]{0,39}$/;

const isFlagKey = (key: string) => key.startsWith("f:") && FLAG.test(key.slice(2));

const prefKeys = new Set<string>(PREF_LOOK_KEYS.map((k) => `p:${k}`));
const storeKeys = new Set<string>(STORE_LOOK_KEYS.map((k) => `s:${k}`));

/** Une valeur acceptable pour cette clé, ou undefined */
function cleanValue(key: string, value: unknown): string | Record<string, unknown> | undefined {
  if (prefKeys.has(key)) return typeof value === "string" && ID.test(value) ? value : undefined;
  if (isFlagKey(key)) return value === true ? "1" : value === "1" ? "1" : undefined;
  if (storeKeys.has(key)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    try {
      return JSON.stringify(value).length <= STORE_LOOK_MAX ? (value as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Seulement des clés connues aux valeurs acceptables, et pas plus de SAVED_LOOKS_MAX en tout */
export function cleanSavedLooks(raw: unknown): SavedLooks {
  const o = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: SavedLooks = {};
  for (const [key, value] of Object.entries(o)) {
    const clean = cleanValue(key, value);
    if (clean !== undefined) out[key] = clean;
  }
  return JSON.stringify(out).length <= SAVED_LOOKS_MAX ? out : {};
}

/**
 * Applique une modification : une valeur remplace, null efface ; une clé inconnue ou une valeur refusée est ignorée.
 * Renvoie null si le résultat dépasserait la taille permise (rien n'est changé).
 */
export function patchSavedLooks(base: SavedLooks, patch: unknown): SavedLooks | null {
  const p = patch !== null && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  const out: SavedLooks = { ...base };
  for (const [key, value] of Object.entries(p)) {
    if (!prefKeys.has(key) && !storeKeys.has(key) && !isFlagKey(key)) continue;
    if (value === null) {
      // Un drapeau levé ne se baisse jamais : un appareil qui ne le connaît pas encore ne peut pas l'effacer
      if (!isFlagKey(key)) delete out[key];
      continue;
    }
    const clean = cleanValue(key, value);
    if (clean !== undefined) out[key] = clean;
  }
  return JSON.stringify(out).length <= SAVED_LOOKS_MAX ? out : null;
}

export interface SavedLooksResponse {
  looks: SavedLooks;
}
