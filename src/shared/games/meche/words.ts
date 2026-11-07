// Les mots de Mèche : comment on les écrit, comment on les vérifie.
// Les accents, les majuscules et les tirets ne comptent pas : « Été » et « ete » sont le même mot.

/** Un mot réduit à ses lettres, en minuscules et sans accents */
export function normalizeWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[^a-z]/g, "");
}

/**
 * La liste complète, triée, gardée telle quelle en mémoire : un mot par ligne, en octets.
 * On y cherche par dichotomie : pas besoin de bâtir un index de 400 000 entrées à chaque réveil de la salle.
 */
export class Dictionary {
  private bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  /** Le mot (déjà réduit à ses lettres) est-il dans la liste ? */
  has(word: string): boolean {
    if (word.length === 0 || word.length > 60) return false;
    const b = this.bytes;
    let lo = 0;
    let hi = b.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      // Le début de la ligne qui contient ce point
      let start = mid;
      while (start > lo && b[start - 1] !== 10) start--;
      let end = mid;
      while (end < b.length && b[end] !== 10) end++;
      const c = compare(b, start, end, word);
      if (c === 0) return true;
      if (c < 0) lo = end + 1;
      else hi = start;
    }
    return false;
  }
}

/** Compare une ligne de la liste au mot cherché : négatif si la ligne vient avant */
function compare(b: Uint8Array, start: number, end: number, word: string): number {
  const n = Math.min(end - start, word.length);
  for (let i = 0; i < n; i++) {
    const d = b[start + i]! - word.charCodeAt(i);
    if (d !== 0) return d;
  }
  return end - start - word.length;
}

/**
 * Les mots que connaissent les bots, du plus courant au moins courant, chaque niveau sous un repère « =N ».
 * Tout est gardé d'un seul tenant : chercher un groupe de lettres revient à un `indexOf`.
 */
export class Vocabulary {
  private levels: string[];

  constructor(text: string) {
    this.levels = text
      .split(/^=\d+\n/m)
      .slice(1)
      .map((part) => `\n${part}`);
  }

  /**
   * Un mot contenant ces lettres, au hasard, dans les `depth` premiers niveaux ;
   * `accept` écarte ceux qui ne conviennent pas (déjà joués, trop courts…).
   */
  pick(letters: string, depth: number, random: () => number, accept: (word: string) => boolean): string | null {
    const levels = this.levels.slice(0, depth);
    // Les plus courants d'abord, en commençant quelque part au hasard
    for (const text of levels) {
      const from = Math.floor(random() * text.length);
      for (const start of [from, 0]) {
        let at = text.indexOf(letters, start);
        let tries = 0;
        while (at >= 0 && (start === from || at < from) && tries < 40) {
          const begin = text.lastIndexOf("\n", at) + 1;
          const end = text.indexOf("\n", at);
          const word = text.slice(begin, end < 0 ? undefined : end);
          // Un groupe de lettres ne passe jamais d'une ligne à l'autre : il ne contient pas de retour à la ligne
          if (word && accept(word)) return word;
          at = text.indexOf(letters, end < 0 ? text.length : end);
          tries++;
        }
      }
    }
    return null;
  }

  /** Combien de mots du vocabulaire contiennent ces lettres (pour les tests et les statistiques) */
  count(letters: string): number {
    let n = 0;
    for (const text of this.levels) {
      let at = text.indexOf(letters);
      while (at >= 0) {
        n++;
        at = text.indexOf("\n", at);
        if (at < 0) break;
        at = text.indexOf(letters, at);
      }
    }
    return n;
  }
}
