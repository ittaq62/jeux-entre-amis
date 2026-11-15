import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
// L'envoi d'emails ouvre une connexion réseau propre au serveur : inutile ici
vi.mock("worker-mailer", () => ({ WorkerMailer: class {} }));

const { claimStreak, recordPlayDays, streakStatus } = await import("./streak.ts");
const { sha256Hex } = await import("./util.ts");
const { default: worker } = await import("./index.ts");
const { LOGIN_LADDER, MIN_GAME_MS } = await import("../shared/streak.ts");
import type { StreakClaimResponse } from "../shared/streak.ts";

type Row = Record<string, unknown>;

interface StreakRow {
  login_day: string | null;
  login_streak: number;
  login_best: number;
  jokers: number;
  play_day: string | null;
  play_streak: number;
  play_best: number;
}

const emptyRow = (): StreakRow => ({
  login_day: null,
  login_streak: 0,
  login_best: 0,
  jokers: 0,
  play_day: null,
  play_streak: 0,
  play_best: 0,
});

/** Une fausse D1, juste ce qu'il faut pour la série : un lot de requêtes passe d'un bloc, comme dans D1 */
class FakeDb {
  users = new Map<string, { id: string; pseudo: string | null; is_admin: number }>();
  sessions = new Map<string, string>();
  limits = new Map<string, number>();
  open = new Set<string>();
  streaks = new Map<string, StreakRow>();
  playDays = new Set<string>();
  ledger = new Map<string, { delta: number; at: number }>();

  prepare(sql: string) {
    const db = this;
    const text = sql.replace(/\s+/g, " ").trim();
    let binds: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        binds = values;
        return statement;
      },
      exec: () => db.exec(text, binds),
      async first() {
        await Promise.resolve();
        return db.exec(text, binds).results[0] ?? null;
      },
      async all() {
        await Promise.resolve();
        return { results: db.exec(text, binds).results };
      },
      async run() {
        await Promise.resolve();
        const r = db.exec(text, binds);
        return { results: r.results, meta: { changes: r.changes } };
      },
    };
    return statement;
  }

  async batch(statements: { exec: () => { results: Row[]; changes: number } }[]) {
    await Promise.resolve();
    // Tout d'un bloc, sans laisser passer une autre requête au milieu
    return statements.map((s) => {
      const r = s.exec();
      return { results: r.results, meta: { changes: r.changes } };
    });
  }

  ledgerOf(userId: string) {
    return [...this.ledger.entries()].filter(([k]) => k.startsWith(`${userId}|`)).map(([k, v]) => ({ reason: k.split("|")[1]!, ...v }));
  }

  exec(sql: string, b: unknown[]): { results: Row[]; changes: number } {
    const none = { results: [], changes: 0 };
    const now = Date.now();
    if (sql.includes("FROM sessions s JOIN users u")) {
      const user = this.users.get(this.sessions.get(b[0] as string) ?? "");
      if (!user) return none;
      const row = {
        ...user,
        email: `${user.id}@example.test`,
        avatar: "{}",
        photo_version: 0,
        created_at: now,
        last_seen_at: now,
        banned_at: null,
        ban_reason: null,
        session_expires: now + 25 * 86400_000,
      };
      return { results: [row], changes: 0 };
    }
    if (sql.startsWith("UPDATE users SET last_seen_at") || sql.startsWith("UPDATE sessions SET")) return none;
    if (sql.startsWith("INSERT INTO rate_limits")) {
      const count = (this.limits.get(b[0] as string) ?? 0) + 1;
      this.limits.set(b[0] as string, count);
      return { results: [{ count }], changes: 1 };
    }
    if (sql.startsWith("SELECT key FROM site_settings"))
      return { results: [...this.open].map((g) => ({ key: `${g}_public` })), changes: 0 };
    if (sql.startsWith("SELECT login_day, login_streak")) {
      const row = this.streaks.get(b[0] as string);
      return { results: row ? [{ ...row }] : [], changes: 0 };
    }
    if (sql.startsWith("SELECT day, game FROM play_days")) {
      const results = [...this.playDays]
        .map((k) => k.split("|"))
        .filter(([u, day]) => u === b[0] && day! >= (b[1] as string))
        .map(([, day, game]) => ({ day, game }));
      return { results, changes: 0 };
    }
    if (sql.startsWith("SELECT reason FROM point_ledger")) {
      const results = (b.slice(1) as string[]).filter((r) => this.ledger.has(`${b[0]}|${r}`)).map((reason) => ({ reason }));
      return { results, changes: 0 };
    }
    if (sql.includes("AS balance")) {
      const balance = this.ledgerOf(b[0] as string).reduce((sum, l) => sum + l.delta, 0);
      return { results: [{ balance }], changes: 0 };
    }
    if (sql.startsWith("INSERT INTO user_streaks (user_id, login_day")) {
      const [id, day, streak, best, jokers, prev] = b as [string, string, number, number, number, string | null];
      const row = this.streaks.get(id);
      if (!row) {
        this.streaks.set(id, { ...emptyRow(), login_day: day, login_streak: streak, login_best: best, jokers });
        return { results: [], changes: 1 };
      }
      if (row.login_day !== prev) return none;
      Object.assign(row, { login_day: day, login_streak: streak, login_best: best, jokers });
      return { results: [], changes: 1 };
    }
    if (sql.startsWith("INSERT OR IGNORE INTO point_ledger (user_id, reason, delta, at) SELECT")) {
      const [id, reason, delta, at, day, streak] = b as [string, string, number, number, string, number];
      const row = this.streaks.get(id);
      if (!row || row.login_day !== day || row.login_streak !== streak || this.ledger.has(`${id}|${reason}`)) return none;
      this.ledger.set(`${id}|${reason}`, { delta, at });
      return { results: [], changes: 1 };
    }
    if (sql.startsWith("INSERT OR IGNORE INTO point_ledger (user_id, reason, delta, at) VALUES")) {
      const [id, reason, delta, at] = b as [string, string, number, number];
      if (this.ledger.has(`${id}|${reason}`)) return none;
      this.ledger.set(`${id}|${reason}`, { delta, at });
      return { results: [], changes: 1 };
    }
    if (sql.startsWith("DELETE FROM play_days WHERE user_id = ? AND day < ?")) {
      let changes = 0;
      for (const k of this.playDays) {
        const [u, day] = k.split("|");
        if (u === b[0] && day! < (b[1] as string)) {
          this.playDays.delete(k);
          changes++;
        }
      }
      return { results: [], changes };
    }
    if (sql.startsWith("SELECT user_id, play_day, play_streak, play_best FROM user_streaks WHERE user_id IN")) {
      const results = (b as string[]).filter((id) => this.streaks.has(id)).map((id) => ({ user_id: id, ...this.streaks.get(id)! }));
      return { results, changes: 0 };
    }
    if (sql.startsWith("INSERT OR IGNORE INTO play_days")) {
      const key = (b as string[]).join("|");
      if (this.playDays.has(key)) return none;
      this.playDays.add(key);
      return { results: [], changes: 1 };
    }
    if (sql.startsWith("INSERT INTO user_streaks (user_id, play_day")) {
      const [id, day, streak, best, prev] = b as [string, string, number, number, string | null];
      const row = this.streaks.get(id);
      if (!row) {
        this.streaks.set(id, { ...emptyRow(), play_day: day, play_streak: streak, play_best: best });
        return { results: [], changes: 1 };
      }
      if (row.play_day !== prev) return none;
      Object.assign(row, { play_day: day, play_streak: streak, play_best: best });
      return { results: [], changes: 1 };
    }
    throw new Error(`Requête inattendue : ${sql}`);
  }
}

const ALL = ["uno", "naval", "bricks", "capitale", "meche", "bolides", "crampons", "escarmouche"] as const;

let db: FakeDb;
const d1 = () => db as unknown as D1Database;

/** Midi à Paris (en hiver, UTC+1) ce jour-là */
const noon = (day: string) => Date.parse(`${day}T11:00:00Z`);
const setNow = (ts: number) => vi.setSystemTime(ts);

async function signIn(id: string, pseudo: string | null, admin = false): Promise<string> {
  db.users.set(id, { id, pseudo, is_admin: admin ? 1 : 0 });
  const token = `jeton-${id}`;
  db.sessions.set(await sha256Hex(token), id);
  return token;
}

function call(path: string, opts: { token?: string; body?: unknown; origin?: string | null; method?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.origin !== null) headers.Origin = opts.origin ?? "http://localhost";
  if (opts.token) headers.Cookie = `sid=${opts.token}`;
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return worker.fetch(new Request(`http://localhost/api${path}`, { method: opts.method ?? "POST", headers, body }), {
    DB: db,
    DEV_MODE: "1",
  } as unknown as Env);
}

const claim = async (token: string, body?: unknown) => (await (await call("/streak/claim", { token, body })).json()) as StreakClaimResponse;

/** Une partie terminée à ce moment-là, qui a duré 5 minutes */
const played = (userId: string, game: string, endedAt: number, extra: { isBot?: boolean; absent?: boolean; ms?: number } = {}) =>
  recordPlayDays(d1(), {
    game: game as (typeof ALL)[number],
    startedAt: endedAt - (extra.ms ?? 5 * 60_000),
    endedAt,
    players: [{ userId, isBot: extra.isBot ?? false, absent: extra.absent }],
  });

beforeEach(() => {
  db = new FakeDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow(noon("2026-11-12"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ouvrir l'accueil", () => {
  it("rien pour un invité, un compte sans pseudo, ni une autre origine", async () => {
    expect((await call("/streak/claim")).status).toBe(401);
    const pending = await signIn("u_attente", null);
    expect((await call("/streak/claim", { token: pending })).status).toBe(403);
    const token = await signIn("u_joueur", "Joueur");
    expect((await call("/streak/claim", { token, origin: null })).status).toBe(403);
    expect((await call("/streak/claim", { token, origin: "https://ailleurs.example" })).status).toBe(403);
    // Une simple lecture ne paie rien non plus
    expect((await call("/streak/claim", { token, method: "GET" })).status).toBe(404);
    expect(db.ledger.size).toBe(0);
    expect(db.streaks.size).toBe(0);
  });

  it("un nouveau compte : jour 1, 5 points, une seule fois dans la journée", async () => {
    const token = await signIn("u_neuf", "Neuf");
    const first = await claim(token);
    expect(first.gained.day).toMatchObject({ reward: 5, cycleDay: 1, jokerUsed: false, jokerEarned: false, lost: 0 });
    expect(first.balance).toBe(5);
    expect(first.status.login).toEqual({ streak: 1, best: 1, jokers: 0, claimedToday: true, cycleDay: 1 });
    expect(first.status.today).toBe("2026-11-12");
    // Le soir, puis juste avant minuit : rien de plus
    setNow(Date.parse("2026-11-12T22:59:59Z"));
    const again = await claim(token);
    expect(again.gained).toEqual({ day: null, weeks: [] });
    expect(again.balance).toBe(5);
    expect(db.ledgerOf("u_neuf")).toEqual([{ reason: "serie:2026-11-12", delta: 5, at: noon("2026-11-12") }]);
  });

  it("ni date ni montant venus du site : le serveur ne lit rien dans la requête", async () => {
    const token = await signIn("u_malin", "Malin");
    const res = await claim(token, { day: "2026-11-19", today: "2030-01-01", reward: 9999, delta: 500, cycleDay: 7, now: 0 });
    expect(res.gained.day).toMatchObject({ reward: 5, cycleDay: 1 });
    expect(res.status.today).toBe("2026-11-12");
    expect(db.ledgerOf("u_malin")).toEqual([{ reason: "serie:2026-11-12", delta: 5, at: noon("2026-11-12") }]);
  });

  it("deux onglets en même temps : un seul paiement", async () => {
    const token = await signIn("u_onglets", "Onglets");
    const both = await Promise.all([claim(token), claim(token), claim(token)]);
    expect(both.filter((r) => r.gained.day !== null)).toHaveLength(1);
    expect(db.ledgerOf("u_onglets")).toHaveLength(1);
    for (const r of both) {
      expect(r.balance).toBe(5);
      expect(r.status.login.claimedToday).toBe(true);
    }
  });

  it("deux requêtes qui lisent le même état avant d'écrire : un seul paiement", async () => {
    await signIn("u_course", "Course");
    db.streaks.set("u_course", { ...emptyRow(), login_day: "2026-11-11", login_streak: 3, login_best: 3 });
    const res = await Promise.all([claimStreak(d1(), "u_course", Date.now(), ALL), claimStreak(d1(), "u_course", Date.now(), ALL)]);
    expect(res.filter((r) => r.gained.day)).toHaveLength(1);
    expect(db.ledgerOf("u_course")).toEqual([{ reason: "serie:2026-11-12", delta: LOGIN_LADDER[3], at: Date.now() }]);
    expect(db.streaks.get("u_course")).toMatchObject({ login_day: "2026-11-12", login_streak: 4 });
  });

  it("la requête d'avant minuit et celle d'après se croisent : chaque jour payé selon le bon état", async () => {
    await signIn("u_minuit", "Minuit");
    db.streaks.set("u_minuit", { ...emptyRow(), login_day: "2026-11-11", login_streak: 2, login_best: 2 });
    // Les deux lisent l'état d'hier ; celle de 0 h 00 écrit en second et ne doit pas payer sur un état qu'elle n'a pas posé
    const [late, early] = await Promise.all([
      claimStreak(d1(), "u_minuit", Date.parse("2026-11-12T22:59:59Z"), ALL),
      claimStreak(d1(), "u_minuit", Date.parse("2026-11-12T23:00:01Z"), ALL),
    ]);
    expect(late.gained.day).toMatchObject({ cycleDay: 3, reward: LOGIN_LADDER[2] });
    expect(early.gained.day).toBeNull();
    expect(db.ledgerOf("u_minuit").map((l) => l.reason)).toEqual(["serie:2026-11-12"]);
    // Rouvert après minuit : le 13 est payé normalement, comme 4e jour
    const next = await claimStreak(d1(), "u_minuit", Date.parse("2026-11-12T23:05:00Z"), ALL);
    expect(next.gained.day).toMatchObject({ cycleDay: 4, reward: LOGIN_LADDER[3] });
    expect(next.status.today).toBe("2026-11-13");
  });

  it("une semaine jour après jour : 80 points, un joker ; puis un jour raté sauvé par le joker", async () => {
    const token = await signIn("u_semaine", "Semaine");
    const rewards: number[] = [];
    for (let i = 0; i < 7; i++) {
      setNow(noon(`2026-11-${String(9 + i).padStart(2, "0")}`));
      rewards.push((await claim(token)).gained.day!.reward);
    }
    expect(rewards).toEqual([...LOGIN_LADDER]);
    const last = await claim(token);
    expect(last.balance).toBe(80);
    expect(last.status.login).toMatchObject({ streak: 7, jokers: 1, cycleDay: 7 });
    // Le lundi 16 sans venir, le mardi 17 : la série continue (8e jour, 1er du cycle suivant)
    setNow(noon("2026-11-17"));
    const saved = await claim(token);
    expect(saved.gained.day).toMatchObject({ jokerUsed: true, cycleDay: 1, reward: 5, lost: 0 });
    expect(saved.status.login).toMatchObject({ streak: 8, best: 8, jokers: 0 });
    // Puis deux jours sans venir : elle repart à 1
    setNow(noon("2026-11-20"));
    const lost = await claim(token);
    expect(lost.gained.day).toMatchObject({ lost: 8, cycleDay: 1, reward: 5 });
    expect(lost.status.login).toMatchObject({ streak: 1, best: 8 });
  });

  it("au changement d'heure : les deux soirs autour de la nuit de 23 heures se suivent", async () => {
    const token = await signIn("u_heure", "Heure");
    setNow(Date.parse("2026-03-28T22:30:00Z")); // samedi 23 h 30 à Paris
    expect((await claim(token)).status.today).toBe("2026-03-28");
    setNow(Date.parse("2026-03-29T21:30:00Z")); // dimanche 23 h 30 à Paris (heure d'été)
    const sunday = await claim(token);
    expect(sunday.status.today).toBe("2026-03-29");
    expect(sunday.gained.day).toMatchObject({ cycleDay: 2 });
    setNow(Date.parse("2026-03-29T22:10:00Z")); // lundi 0 h 10 à Paris
    expect((await claim(token)).gained.day).toMatchObject({ cycleDay: 3 });
  });

  it("la limite par heure est respectée", async () => {
    const token = await signIn("u_boucle", "Boucle");
    db.limits.set("streak:u_boucle", 120);
    const res = await call("/streak/claim", { token });
    expect(res.status).toBe(429);
    expect(db.ledger.size).toBe(0);
  });
});

describe("les jours de jeu et le défi de la semaine", () => {
  it("ni bot, ni joueur parti en cours de route, ni partie abandonnée tout de suite", async () => {
    await signIn("u_jeu", "Jeu");
    const end = noon("2026-11-12");
    await played("u_jeu", "uno", end, { isBot: true });
    await played("u_jeu", "uno", end, { absent: true });
    await played("u_jeu", "uno", end, { ms: MIN_GAME_MS - 1 });
    expect(db.playDays.size).toBe(0);
    expect(db.streaks.size).toBe(0);
    await played("u_jeu", "uno", end, { ms: MIN_GAME_MS });
    await played("u_jeu", "uno", end + 3600_000);
    await played("u_jeu", "naval", end + 7200_000);
    expect([...db.playDays].sort()).toEqual(["u_jeu|2026-11-12|naval", "u_jeu|2026-11-12|uno"]);
    expect(db.streaks.get("u_jeu")).toMatchObject({ play_day: "2026-11-12", play_streak: 1, play_best: 1 });
  });

  it("le jour d'une partie est celui de sa fin, à Paris", async () => {
    await signIn("u_tard", "Tard");
    await played("u_tard", "uno", Date.parse("2026-11-12T22:59:00Z"));
    await played("u_tard", "naval", Date.parse("2026-11-12T23:01:00Z"));
    expect([...db.playDays].sort()).toEqual(["u_tard|2026-11-12|uno", "u_tard|2026-11-13|naval"]);
    expect(db.streaks.get("u_tard")).toMatchObject({ play_day: "2026-11-13", play_streak: 2 });
    // Un jour sans partie : la série de jeu repart
    await played("u_tard", "uno", noon("2026-11-15"));
    expect(db.streaks.get("u_tard")).toMatchObject({ play_streak: 1, play_best: 2 });
  });

  it("chacun des jeux joué dans la semaine : 80 points, une seule fois", async () => {
    const token = await signIn("u_tous", "Tous", true);
    for (const [i, game] of ALL.slice(0, 7).entries()) await played("u_tous", game, noon("2026-11-09") + i * 3600_000);
    setNow(noon("2026-11-10"));
    const early = await claim(token);
    expect(early.gained.weeks).toEqual([]);
    expect(early.status.week).toEqual({
      start: "2026-11-09",
      games: [...ALL],
      played: ALL.slice(0, 7),
      bonus: 80,
      paid: false,
    });
    // Le dernier jeu, et retour à l'accueil le même jour : le défi est versé tout de suite, sans attendre demain
    await played("u_tous", "escarmouche", noon("2026-11-10") + 3600_000);
    setNow(noon("2026-11-10") + 2 * 3600_000);
    const done = await Promise.all([claim(token), claim(token)]);
    expect(done.flatMap((r) => r.gained.weeks)).toEqual([{ start: "2026-11-09", bonus: 80, current: true }]);
    expect(done[0]!.status.week.paid).toBe(true);
    expect(db.ledgerOf("u_tous").find((l) => l.reason === "tous-les-jeux:2026-11-09")?.delta).toBe(80);
    // Rejouer à tout dans la même semaine ne repaie pas
    for (const game of ALL) await played("u_tous", game, noon("2026-11-12"));
    setNow(noon("2026-11-12"));
    expect((await claim(token)).gained.weeks).toEqual([]);
  });

  it("réussi le dimanche soir, versé le lundi : celui de la semaine d'avant", async () => {
    const token = await signIn("u_dimanche", "Dimanche", true);
    for (const game of ALL) await played("u_dimanche", game, Date.parse("2026-11-15T21:00:00Z"));
    setNow(noon("2026-11-16"));
    const monday = await claim(token);
    expect(monday.gained.weeks).toEqual([{ start: "2026-11-09", bonus: 80, current: false }]);
    expect(monday.status.week).toMatchObject({ start: "2026-11-16", played: [], paid: false });
    // Plus tard, rien de plus pour cette semaine-là
    setNow(noon("2026-11-24"));
    expect((await claim(token)).gained.weeks).toEqual([]);
  });

  it("pour un compte qui ne voit qu'UNO : pas de défi", async () => {
    const token = await signIn("u_uno", "Uno");
    await played("u_uno", "uno", noon("2026-11-12") - 3600_000);
    const res = await claim(token);
    expect(res.status.week).toMatchObject({ games: ["uno"], played: ["uno"], bonus: 0 });
    expect(res.gained.weeks).toEqual([]);
    // Les jeux ouverts à tous par l'admin entrent dans son défi
    db.open = new Set(["naval", "meche"]);
    const opened = await claim(token);
    expect(opened.status.week).toMatchObject({ games: ["uno", "naval", "meche"], played: ["uno"], bonus: 30 });
  });

  it("les vieux jours de jeu s'effacent au premier passage du jour", async () => {
    const token = await signIn("u_vieux", "Vieux");
    db.playDays.add("u_vieux|2026-08-01|uno");
    db.playDays.add("u_vieux|2026-11-01|uno");
    await claim(token);
    expect([...db.playDays]).toEqual(["u_vieux|2026-11-01|uno"]);
  });
});

describe("la série sur le profil", () => {
  it("se lit sans rien écrire, et s'éteint quand on ne vient plus", async () => {
    await signIn("u_profil", "Profil");
    db.streaks.set("u_profil", {
      ...emptyRow(),
      login_day: "2026-11-10",
      login_streak: 6,
      login_best: 9,
      play_day: "2026-11-11",
      play_streak: 2,
      play_best: 4,
    });
    db.playDays.add("u_profil|2026-11-11|uno");
    const status = await streakStatus(d1(), "u_profil", noon("2026-11-12"), ["uno", "naval"]);
    expect(status.login).toEqual({ streak: 0, best: 9, jokers: 0, claimedToday: false, cycleDay: 1 });
    expect(status.play).toEqual({ streak: 2, best: 4, today: false });
    expect(status.week).toMatchObject({ played: ["uno"], bonus: 20, paid: false });
    expect(db.ledger.size).toBe(0);
    // Venu hier : la série tient encore, et ouvrir l'accueil aujourd'hui en ferait le 7e jour
    db.streaks.get("u_profil")!.login_day = "2026-11-11";
    expect((await streakStatus(d1(), "u_profil", noon("2026-11-12"), ["uno"])).login).toMatchObject({ streak: 6, cycleDay: 7 });
  });
});
