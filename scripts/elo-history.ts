// Recalcule l'Elo de chaque joueur en rejouant toutes les parties enregistrées, dans l'ordre,
// avec les règles de src/shared/elo.ts. À lancer une fois après la migration 0005, ou pour tout recalculer.
//
//   node --experimental-strip-types scripts/elo-history.ts --local
//   node --experimental-strip-types scripts/elo-history.ts --remote
//
// Une remise à zéro des stats par l'admin efface la ligne de user_stats mais garde l'historique :
// pour chacun, on ne compte que ses N dernières parties, N étant le nombre de parties de sa ligne actuelle.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { botElo, ELO_START, eloChanges, type EloEntry } from "../src/shared/elo.ts";

const where = process.argv.includes("--remote") ? "--remote" : "--local";
// Wrangler lancé directement par Node : pas de shell, donc pas de souci de guillemets dans le SQL
const wrangler = (args: string[], json: boolean) =>
  execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", where, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
  });

function query<T>(sql: string): T[] {
  return (JSON.parse(wrangler(["--json", "--command", sql], true)) as { results: T[] }[])[0]!.results;
}

interface GameRow {
  id: string;
  game: "uno" | "naval";
  variant: string;
  settings: string;
  ended_at: number;
}
interface PlayerRow {
  game_id: string;
  seat: number;
  user_id: string | null;
  rank: number;
}
interface StatRow {
  user_id: string;
  game: string;
  played: number;
}

const games = query<GameRow>("SELECT id, game, variant, settings, ended_at FROM games ORDER BY ended_at, id");
const players = query<PlayerRow>("SELECT game_id, seat, user_id, rank FROM game_players");
const stats = query<StatRow>("SELECT user_id, game, played FROM user_stats");

const byGame = new Map<string, PlayerRow[]>();
for (const p of players) byGame.set(p.game_id, [...(byGame.get(p.game_id) ?? []), p]);
const key = (user: string, game: string) => `${user}|${game}`;
const counted = new Map(stats.map((s) => [key(s.user_id, s.game), s.played]));

// Combien de parties chacun a dans l'historique, pour savoir lesquelles comptent encore
const total = new Map<string, number>();
for (const g of games)
  for (const p of byGame.get(g.id) ?? []) if (p.user_id) total.set(key(p.user_id, g.game), (total.get(key(p.user_id, g.game)) ?? 0) + 1);

const state = new Map<string, { elo: number; played: number; seen: number }>();
for (const g of games) {
  const settings = JSON.parse(g.settings) as { botLevel?: string };
  const table = byGame.get(g.id) ?? [];
  const entries: EloEntry[] = table.map((p) => {
    const team = g.variant === "teams" ? p.seat % 2 : null;
    if (!p.user_id) return { id: `bot-${p.seat}`, rating: botElo(g.game, settings.botLevel), rank: p.rank, team, isBot: true, played: 0 };
    const k = key(p.user_id, g.game);
    const s = state.get(k) ?? { elo: ELO_START, played: 0, seen: 0 };
    state.set(k, s);
    // Partie d'avant une remise à zéro : le joueur y figure à son niveau du moment, sans bouger
    const counts = s.seen >= (total.get(k) ?? 0) - (counted.get(k) ?? 0);
    s.seen += 1;
    return { id: p.user_id, rating: s.elo, rank: p.rank, team, isBot: !counts, played: s.played };
  });
  const deltas = eloChanges(entries);
  for (const [user, delta] of Object.entries(deltas)) {
    const s = state.get(key(user, g.game))!;
    s.elo += delta;
    s.played += 1;
  }
}

const updates = [...state.entries()]
  .filter(([k]) => counted.has(k))
  .map(([k, s]) => {
    const [user, game] = k.split("|");
    return `UPDATE user_stats SET elo = ${s.elo} WHERE user_id = '${user!.replace(/'/g, "''")}' AND game = '${game}';`;
  });
console.log(`${games.length} parties rejouées, ${updates.length} Elo mis à jour (${where.slice(2)})`);
if (updates.length > 0) {
  const file = join(mkdtempSync(join(tmpdir(), "elo-")), "elo.sql");
  writeFileSync(file, updates.join("\n"));
  wrangler(["--file", file], false);
}
