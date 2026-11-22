// Les bulles bonus (une règle à choisir au salon) : trois bulles par trou, posées le long du chemin vers le trou. La balle
// qui en traverse une gagne son pouvoir pour le coup suivant. Chaque joueur a ses propres bulles : celle qu'un autre
// a prise reste là pour soi.

import { pathToCup } from "./bot.ts";
import { segClosest, type Pt } from "./geom.ts";
import { tileAt, type Course } from "./course.ts";
import { courseOf, type HoleRef } from "./courses.ts";
import type { ShotMods } from "./physics.ts";

export const BONUS_KINDS = ["power", "magnet", "ghost", "ice", "bouncy"] as const;
export type BonusKind = (typeof BONUS_KINDS)[number];

export const BONUS_INFO: Record<BonusKind, { name: string; blurb: string; color: number }> = {
  power: { name: "Force", blurb: "Le prochain coup part bien plus fort.", color: 0xff4a3a },
  magnet: { name: "Aimant", blurb: "Au prochain coup, le trou attire la balle quand elle passe près.", color: 0x3a8aff },
  ghost: { name: "Fantôme", blurb: "Au prochain coup, la balle traverse les murs et les obstacles (pas les bordures).", color: 0xb06aff },
  ice: { name: "Glisse", blurb: "Au prochain coup, le sol glisse comme de la glace.", color: 0x5ae0ff },
  bouncy: { name: "Rebond", blurb: "Au prochain coup, la balle rebondit beaucoup sur tout ce qu'elle touche.", color: 0xffc83a },
};

export function isBonusKind(v: unknown): v is BonusKind {
  return typeof v === "string" && (BONUS_KINDS as readonly string[]).includes(v);
}

/** Ce que le pouvoir change au coup */
export function bonusMods(kind: BonusKind | null | undefined): ShotMods | undefined {
  return kind ? { [kind]: true } : undefined;
}

export interface BonusSpot {
  at: Pt;
  kind: BonusKind;
}

const spots = new Map<string, BonusSpot[]>();
const courses = new Map<string, Course>();

const keyOf = (ref: HoleRef) => `${ref.c}:${ref.i}:${ref.m ? 1 : 0}`;

/** Une place libre pour une bulle : sur une piste, loin du départ, des trous, des murs et des poteaux */
function freeSpot(c: Course, x: number, z: number): boolean {
  const t = tileAt(c, x, z);
  if (t < 0 || c.tiles[t]!.phys.hazard) return false;
  if (Math.hypot(x - c.tee.x, z - c.tee.z) < 1.2) return false;
  if (c.cups.some((k) => Math.hypot(x - k.x, z - k.z) < 0.9)) return false;
  if (c.posts.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.3)) return false;
  for (const w of c.walls) if (segClosest(x, z, w.ax, w.az, w.bx, w.bz).d2 < (w.t + 0.28) ** 2) return false;
  return true;
}

/** Les bulles d'un trou (toujours les mêmes pour un trou) */
export function bonusSpots(ref: HoleRef): BonusSpot[] {
  const key = keyOf(ref);
  const hit = spots.get(key);
  if (hit) return hit;
  const c = courseOf(ref);
  const path: Pt[] = [[c.tee.x, c.tee.z], ...pathToCup(c, c.tee.x, c.tee.z)];
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  const out: BonusSpot[] = [];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if (total > 3) {
    [0.32, 0.56, 0.8].forEach((f, k) => {
      const s = total * f;
      let i = 1;
      while (i < path.length - 1 && cum[i]! < s) i++;
      const a = path[i - 1]!;
      const b = path[i]!;
      const seg = cum[i]! - cum[i - 1]! || 1;
      const u = Math.max(0, Math.min(1, (s - cum[i - 1]!) / seg));
      const x = a[0] + (b[0] - a[0]) * u;
      const z = a[1] + (b[1] - a[1]) * u;
      // Un peu à côté du chemin le plus court (d'un côté puis de l'autre), sinon dessus
      const dx = (b[0] - a[0]) / seg;
      const dz = (b[1] - a[1]) / seg;
      const side = (k + h) % 2 ? 1 : -1;
      for (const off of [0.38, 0.2, 0, -0.2]) {
        const px = x - dz * off * side;
        const pz = z + dx * off * side;
        if (!freeSpot(c, px, pz)) continue;
        if (out.some((o) => Math.hypot(o.at[0] - px, o.at[1] - pz) < 1.2)) continue;
        out.push({ at: [px, pz], kind: BONUS_KINDS[(h + k * 2) % BONUS_KINDS.length]! });
        break;
      }
    });
  }
  spots.set(key, out);
  return out;
}

/** Le trou avec ses bulles (pour savoir lesquelles la balle traverse ; elles ne changent rien à sa course) */
export function bonusCourse(ref: HoleRef): Course {
  const key = keyOf(ref);
  const hit = courses.get(key);
  if (hit) return hit;
  const c = courseOf(ref);
  const withItems: Course = { ...c, def: { ...c.def, items: bonusSpots(ref).map((s) => s.at) } };
  courses.set(key, withItems);
  return withItems;
}

/** Le plus haut numéro de bulle dans un masque (la dernière du chemin) */
export function lastBubble(mask: number): number {
  return mask > 0 ? 31 - Math.clz32(mask) : -1;
}
