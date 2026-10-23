// Generateur pseudo-aleatoire deterministe (mulberry32).
// L'etat tient dans un entier : il se sauvegarde avec la partie et rend les tests reproductibles.

export interface RngHolder {
  rng: number;
}

export function random(holder: RngHolder): number {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(holder: RngHolder, maxExclusive: number): number {
  return Math.floor(random(holder) * maxExclusive);
}

export function shuffle<T>(holder: RngHolder, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(holder, i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

export function pick<T>(holder: RngHolder, items: readonly T[]): T {
  return items[randomInt(holder, items.length)]!;
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}
