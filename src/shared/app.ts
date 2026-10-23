/** Nom du site : a changer ici uniquement. */
export const APP_NAME = "La Tablée";
export const APP_TAGLINE = "Les jeux du soir, entre amis.";

export const PSEUDO_MIN = 3;
export const PSEUDO_MAX = 16;
export const PSEUDO_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.-]*[\p{L}\p{N}]$/u;

export function validatePseudo(raw: string): string | null {
  const pseudo = raw.trim().replace(/\s+/g, " ");
  if (pseudo.length < PSEUDO_MIN) return `Au moins ${PSEUDO_MIN} caractères.`;
  if (pseudo.length > PSEUDO_MAX) return `${PSEUDO_MAX} caractères maximum.`;
  if (!PSEUDO_PATTERN.test(pseudo)) return "Lettres, chiffres, espaces, points, tirets et _ uniquement.";
  return null;
}

export function normalizePseudo(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;

export function isRoomCode(code: string): boolean {
  return new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(code);
}
