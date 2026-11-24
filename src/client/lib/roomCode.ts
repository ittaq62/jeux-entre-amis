import { isRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../shared/app.ts";

/**
 * Ce qu'on garde de ce qui est tapé ou collé dans « Un ami t'a donné un code ? ». Un lien collé (« https://…/salon/ABCD »)
 * ou un message entier (« Rejoins ma table, code ABCD ») donnent le code ; sinon on garde les lettres, en majuscules,
 * jusqu'à quatre, comme quand on tape.
 */
export function readRoomCode(text: string): string {
  const upper = text.toUpperCase();
  const link = new RegExp(`/SALON/([A-Z]{${ROOM_CODE_LENGTH}})(?![A-Z])`).exec(upper);
  if (link && isRoomCode(link[1]!)) return link[1]!;
  // Un message : le dernier mot de quatre lettres qui peut être un code (« CODE » ou « VITE » ont un O ou un I)
  const words = upper.split(/[^A-Z]+/).filter((w) => isRoomCode(w));
  if (words.length > 0) return words[words.length - 1]!;
  return upper.replace(/[^A-Z]/g, "").slice(0, ROOM_CODE_LENGTH);
}

/** Pourquoi ce code ne peut pas être celui d'une table, ou null s'il peut l'être */
export function roomCodeProblem(code: string): string | null {
  if (isRoomCode(code)) return null;
  if (code.length !== ROOM_CODE_LENGTH) return `Un code de table fait ${ROOM_CODE_LENGTH} lettres.`;
  const odd = [...new Set([...code].filter((c) => !ROOM_CODE_ALPHABET.includes(c)))];
  if (odd.length > 0)
    return `Les codes de table n'ont ni I ni O, pour ne pas les confondre avec 1 et 0 : vérifie ${odd.length > 1 ? "les lettres" : "la lettre"} ${odd.join(" et ")}.`;
  return `Un code de table fait ${ROOM_CODE_LENGTH} lettres.`;
}
