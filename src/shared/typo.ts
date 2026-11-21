// La typographie française à l'affichage : les espaces qui ne doivent jamais laisser un signe seul en début de ligne.

/** L'espace insécable */
export const NBSP = "\u00a0";

/**
 * Le texte tel qu'il s'affiche en français : une espace insécable avant « : ; ! ? », à l'intérieur des guillemets, et
 * entre un nombre et son unité (₣, %). Le navigateur ne peut plus rejeter « : » ou « ₣ » seul sur la ligne suivante.
 */
export function fr(text: string): string {
  return text
    .replace(/[ \t]+([:;!?»])/g, `${NBSP}$1`)
    .replace(/«[ \t]+/g, `«${NBSP}`)
    .replace(/(\d)[ \t]+(₣|%)/g, `$1${NBSP}$2`);
}
