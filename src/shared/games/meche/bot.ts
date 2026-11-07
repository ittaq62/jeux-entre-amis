// Les bots de Mèche : ils ne connaissent que les mots courants, plus ou moins nombreux selon leur niveau,
// réfléchissent un moment puis tapent lettre par lettre, comme tout le monde.

import { random, type RngHolder } from "../../rng.ts";
import { HARD_TAILS, holderOf, LONG_WORD, type BotLevel, type MecheGame } from "./engine.ts";
import type { VocabWord, Vocabulary } from "./words.ts";

interface BotStyle {
  /** Combien de niveaux du vocabulaire il connaît */
  depth: number;
  think: [number, number];
  letter: [number, number];
  /** La chance d'avoir un trou de mémoire, et ce qu'il dure */
  blank: number;
  /** La chance de tenter un grand mot */
  long: number;
  /** Au Marabout, la chance de choisir un mot qui finit mal pour le voisin */
  nasty: number;
}

export const BOT_STYLE: Record<BotLevel, BotStyle> = {
  facile: { depth: 1, think: [2200, 5000], letter: [190, 320], blank: 0.28, long: 0, nasty: 0 },
  moyen: { depth: 2, think: [1400, 3400], letter: [130, 220], blank: 0.15, long: 0.08, nasty: 0.25 },
  fort: { depth: 3, think: [800, 2200], letter: [85, 150], blank: 0.06, long: 0.22, nasty: 0.6 },
};

const BLANK_MS: [number, number] = [3000, 8000];

export interface BotPlan {
  /** Le mot à taper, et son écriture accentuée ; null : il n'en trouve aucun */
  word: VocabWord | null;
  /** Le temps avant la première lettre (ou avant d'utiliser sa passe) */
  thinkMs: number;
  letterMs: number;
  /** Il se débarrasse de la mèche avec une passe */
  pass: boolean;
}

const between = (h: RngHolder, [a, b]: [number, number]) => a + random(h) * (b - a);

/** Ce que va faire le bot qui tient la mèche */
export function botPlan(g: MecheGame, level: BotLevel, vocab: Vocabulary, h: RngHolder): BotPlan {
  const style = BOT_STYLE[level];
  const me = holderOf(g);
  const used = new Set(g.used);
  const fine = (w: string) => w.length >= 4 && w.length > g.letters.length && !used.has(w);
  const rnd = () => random(h);
  const blank = random(h) < style.blank;
  let thinkMs = between(h, style.think);
  let word: VocabWord | null = null;
  if (g.settings.source === "marabout" && random(h) < style.nasty) {
    word = vocab.pick(g.letters, style.depth, rnd, (w) => fine(w) && HARD_TAILS.has(w.slice(-2)));
  }
  if (!word && random(h) < style.long) word = vocab.pick(g.letters, style.depth, rnd, (w) => fine(w) && w.length >= LONG_WORD);
  if (!word) word = vocab.pick(g.letters, style.depth, rnd, fine);
  const letterMs = between(h, style.letter);
  // Rien en tête, ou un trou de mémoire : autant passer si on peut
  if (me.passes > 0 && (!word || blank)) return { word: null, thinkMs: thinkMs * 1.3, letterMs, pass: true };
  if (blank) thinkMs += between(h, BLANK_MS);
  return { word, thinkMs, letterMs, pass: false };
}
