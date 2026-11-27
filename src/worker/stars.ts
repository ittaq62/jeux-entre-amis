// Les étoiles côté serveur : une salle les accorde à la fin d'une partie, d'après le résultat qu'elle a elle-même validé
// (jamais d'après ce que l'écran d'un joueur annonce). On garde la meilleure à vie ; chaque nouvelle étoile rapporte des
// points une seule fois, et les succès d'étoiles tombent ici.

import { earnedStarAchievements } from "../shared/achievements.ts";
import { STAR_GAMES, starMap } from "../shared/starMaps.ts";
import {
  MAX_STARS,
  STAR_POINTS,
  starsFor,
  type GameStars,
  type StarAwardResult,
  type StarCount,
  type StarsResponse,
} from "../shared/stars.ts";

export interface StarAward {
  /** Un joueur avec un compte, encore à la table à la fin (pas un bot, pas un joueur parti) */
  userId: string;
  game: string;
  map: string;
  /**
   * Le résultat de la partie dans l'unité de la règle de la carte (temps en ms, coups, points) : le serveur en tire les
   * étoiles d'après starMaps.ts. C'est la façon normale de faire.
   */
  value?: number;
  /** Pour un jeu dont les étoiles ne se lisent pas sur un seul nombre : 0 à 3, décidé par la salle */
  stars?: number;
}

const clampStars = (n: number): StarCount => Math.max(0, Math.min(MAX_STARS, Math.floor(n))) as StarCount;

/**
 * Accorde les étoiles d'une partie. Renvoie ce qu'il faut annoncer au joueur, ou null si la carte n'a pas d'étoiles
 * (jeu ou carte absents de starMaps.ts et pas d'étoiles données) ou si l'enregistrement a échoué : la partie, elle,
 * reste enregistrée.
 */
export async function awardStars(db: D1Database, award: StarAward): Promise<StarAwardResult | null> {
  const map = starMap(award.game, award.map);
  if (!map) return null;
  const value = award.value !== undefined && Number.isFinite(award.value) ? award.value : null;
  const earned = clampStars(Math.max(value !== null ? starsFor(value, map.rule) : 0, award.stars ?? 0));
  const lower = map.rule.better === "lower";
  const now = Date.now();
  try {
    const before = await db
      .prepare("SELECT stars, best FROM user_stars WHERE user_id = ? AND game = ? AND map = ?")
      .bind(award.userId, award.game, award.map)
      .first<{ stars: number; best: number | null }>();
    const previous = clampStars(before?.stars ?? 0);
    // La meilleure à vie, et le meilleur résultat : on ne descend jamais
    const best =
      value === null
        ? (before?.best ?? null)
        : before?.best == null
          ? value
          : lower
            ? Math.min(before.best, value)
            : Math.max(before.best, value);
    const stars = Math.max(previous, earned) as StarCount;
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO user_stars (user_id, game, map, stars, best, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(user_id, game, map) DO UPDATE SET
             stars = MAX(stars, excluded.stars),
             best = CASE WHEN excluded.best IS NULL THEN best WHEN best IS NULL THEN excluded.best
                         ELSE ${lower ? "MIN" : "MAX"}(best, excluded.best) END,
             updated_at = excluded.updated_at`,
        )
        .bind(award.userId, award.game, award.map, earned, value, now),
    ];
    // Les points des étoiles nouvelles : une ligne par étoile et par carte, impossible à toucher deux fois
    for (let k = previous + 1; k <= stars; k++) {
      statements.push(
        db
          .prepare("INSERT OR IGNORE INTO point_ledger (user_id, reason, delta, at) VALUES (?, ?, ?, ?)")
          .bind(award.userId, `etoile:${award.game}:${award.map}:${k}`, STAR_POINTS, now),
      );
    }
    await db.batch(statements);
    const unlocked = stars > previous ? await rewardStarAchievements(db, award.userId, award.game, now) : [];
    return {
      game: award.game,
      map: award.map,
      stars,
      previous,
      earned,
      best,
      points: (stars - previous) * STAR_POINTS,
      unlocked,
    };
  } catch (err) {
    console.error("Étoiles non enregistrées", err);
    return null;
  }
}

/**
 * Plusieurs cartes d'un coup pour un même joueur (les neuf trous d'un parcours, par exemple) : les résultats de celles
 * qui ont des étoiles, dans l'ordre, et la liste de tous les succès débloqués.
 */
export async function awardStarsMany(
  db: D1Database,
  userId: string,
  game: string,
  items: readonly { map: string; value?: number; stars?: number }[],
): Promise<{ results: StarAwardResult[]; points: number; unlocked: string[] }> {
  const results: StarAwardResult[] = [];
  for (const item of items) {
    const r = await awardStars(db, { userId, game, ...item });
    if (r) results.push(r);
  }
  return {
    results,
    points: results.reduce((n, r) => n + r.points, 0),
    unlocked: results.flatMap((r) => r.unlocked),
  };
}

/** Les succès d'étoiles que ce joueur vient d'atteindre dans ce jeu */
async function rewardStarAchievements(db: D1Database, userId: string, game: string, now: number): Promise<string[]> {
  const [rows, owned] = await db.batch<{ map?: string; stars?: number; achievement?: string }>([
    db.prepare("SELECT map, stars FROM user_stars WHERE user_id = ? AND game = ?").bind(userId, game),
    // Tous ses succès : les exploits d'un jeu ont leur propre id, pas seulement « <jeu>-etoiles-… »
    db.prepare("SELECT achievement FROM achievements WHERE user_id = ?").bind(userId),
  ]);
  const maps: Record<string, number> = {};
  for (const r of rows!.results) maps[r.map!] = r.stars!;
  const had = new Set(owned!.results.map((r) => r.achievement!));
  const fresh = earnedStarAchievements(game, maps).filter((id) => !had.has(id));
  if (fresh.length > 0) {
    await db.batch(
      fresh.map((id) =>
        db.prepare("INSERT OR IGNORE INTO achievements (user_id, achievement, unlocked_at) VALUES (?, ?, ?)").bind(userId, id, now),
      ),
    );
  }
  return fresh;
}

/** Les étoiles d'un joueur, jeu par jeu (seulement les jeux qui en ont) */
export async function starsOf(db: D1Database, userId: string): Promise<StarsResponse> {
  const games: Record<string, GameStars> = {};
  for (const g of STAR_GAMES) games[g.game] = { maps: {}, total: 0, max: g.maps.length * MAX_STARS };
  if (STAR_GAMES.length === 0) return { games };
  try {
    const { results } = await db
      .prepare("SELECT game, map, stars, best FROM user_stars WHERE user_id = ?")
      .bind(userId)
      .all<{ game: string; map: string; stars: number; best: number | null }>();
    for (const r of results) {
      const g = games[r.game];
      // Une carte retirée de son jeu ne compte plus
      if (!g || !starMap(r.game, r.map)) continue;
      const stars = clampStars(r.stars);
      g.maps[r.map] = { stars, best: r.best };
      g.total += stars;
    }
  } catch (err) {
    // Sans la migration 0012, le reste du site marche : pas d'étoiles, c'est tout
    console.error("Étoiles illisibles", err);
  }
  return { games };
}
