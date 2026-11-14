import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
// L'envoi d'emails ouvre une connexion réseau propre au serveur : inutile ici
vi.mock("worker-mailer", () => ({ WorkerMailer: class {} }));

const { readReport, readReportFilters, filterClause } = await import("./reports.ts");
const { sha256Hex } = await import("./util.ts");
const { default: worker } = await import("./index.ts");
const { REPORT_MAX, REPORTS_PER_HOUR } = await import("../shared/report.ts");

const DEVICE = { kind: "phone", os: "Android 14", browser: "Chrome 131", screen: { w: 412, h: 915 }, view: { w: 412, h: 800 } };
const VALID = {
  kind: "bug",
  message: "Le bouton Rejouer ne répond plus après une manche.",
  context: { game: "uno", variant: "UNO classique", code: "ABCD", tour: null, role: "player" },
  device: DEVICE,
  version: "152ff43 du 2026-11-14 18:05",
};

describe("lire un signalement", () => {
  it("garde ce qui est connu, nettoyé, et rien d'autre", () => {
    const res = readReport({ ...VALID, userId: "quelqu-un-d-autre", pseudo: "Usurpateur", ip: "1.2.3.4" });
    expect(res).toEqual({
      report: {
        kind: "bug",
        message: "Le bouton Rejouer ne répond plus après une manche.",
        context: { game: "uno", variant: "UNO classique", code: "ABCD", tour: null, role: "player" },
        device: DEVICE,
        version: "152ff43 du 2026-11-14 18:05",
      },
    });
  });

  it("refuse un type inconnu, un texte trop court ou trop long, un appareil absent", () => {
    expect(readReport({ ...VALID, kind: "plainte" })).toHaveProperty("error");
    expect(readReport({ ...VALID, kind: undefined })).toHaveProperty("error");
    // Les espaces autour ne comptent pas
    expect(readReport({ ...VALID, message: "   court    " })).toHaveProperty("error");
    expect(readReport({ ...VALID, message: 42 })).toHaveProperty("error");
    expect(readReport({ ...VALID, message: "x".repeat(REPORT_MAX + 1) })).toHaveProperty("error");
    expect(readReport({ ...VALID, message: "x".repeat(REPORT_MAX) })).toHaveProperty("report");
    expect(readReport({ ...VALID, device: { ...DEVICE, kind: "frigo" } })).toHaveProperty("error");
    expect(readReport({ ...VALID, device: undefined })).toHaveProperty("error");
    expect(readReport(null)).toHaveProperty("error");
    expect(readReport("bug")).toHaveProperty("error");
  });

  it("le texte garde ses retours à la ligne, pas les caractères de contrôle ni les inversions de sens", () => {
    const res = readReport({ ...VALID, message: "Ligne une\r\n\r\n\r\n\r\nLigne deux\u0007 et \u202eenvers\u202c  \nfin" });
    expect("report" in res && res.report.message).toBe("Ligne une\n\nLigne deux  et  envers\nfin");
  });

  it("un contexte douteux devient inconnu au lieu d'être refusé", () => {
    const res = readReport({
      ...VALID,
      context: { game: "poker", variant: `  ${"v".repeat(200)}\n`, code: "abcd", tour: "AB1", role: "admin" },
      device: { kind: "pc", os: "W".repeat(80), browser: "", screen: { w: -3, h: "800" }, view: { w: 1365.6, h: Number.NaN } },
      version: 12,
    });
    expect("report" in res && res.report).toMatchObject({
      context: { game: null, variant: "v".repeat(80), code: "ABCD", tour: null, role: null },
      device: { kind: "pc", os: "W".repeat(40), browser: "Navigateur inconnu", screen: { w: 0, h: 0 }, view: { w: 1366, h: 0 } },
      version: null,
    });
    // Sans contexte du tout : un signalement quand même
    expect(readReport({ kind: "idea", message: "Un mode nuit pour la table.", device: DEVICE })).toMatchObject({
      report: { context: { game: null, variant: null, code: null, tour: null, role: null }, version: null },
    });
  });

  it("les filtres de l'onglet admin, dans l'ordre", () => {
    expect(readReportFilters({ kind: "idea", game: "tour", device: "phone", status: "done" })).toEqual({
      kind: "idea",
      game: "tour",
      device: "phone",
      status: "done",
    });
    expect(readReportFilters({ kind: "tout", game: "constructor", device: "", status: undefined })).toEqual({});
    expect(filterClause({ status: "new", kind: "bug" })).toEqual({ where: " WHERE r.kind = ? AND r.status = ?", binds: ["bug", "new"] });
    expect(filterClause({})).toEqual({ where: "", binds: [] });
  });
});

// ---------------------------------------------------------------------------
// Les routes, avec une fausse base qui ne connaît que les requêtes de ce chemin
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface FakeUser {
  id: string;
  pseudo: string | null;
  is_admin: number;
}

class FakeDb {
  users = new Map<string, FakeUser>();
  sessions = new Map<string, string>();
  limits = new Map<string, number>();
  reports: Row[] = [];
  queries: string[] = [];

  prepare(sql: string) {
    const db = this;
    let binds: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        binds = values;
        return statement;
      },
      async first() {
        return db.run(sql, binds)[0] ?? null;
      },
      async all() {
        return { results: db.run(sql, binds) };
      },
      async run() {
        const before = db.reports.length;
        const rows = db.run(sql, binds);
        return { results: rows, meta: { changes: Math.abs(before - db.reports.length) || rows.length } };
      },
    };
    return statement;
  }

  private where(sql: string, binds: unknown[]): (r: Row) => boolean {
    const columns = [...(sql.split(" ORDER BY ")[0] ?? sql).matchAll(/r\.(\w+) = \?/g)].map((m) => m[1]!);
    return (r) => columns.every((col, i) => r[col] === binds[i]);
  }

  private withUser = (r: Row): Row => {
    const u = this.users.get(r.user_id as string)!;
    return { ...r, pseudo: u.pseudo, avatar: "{}", photo_version: 0, is_admin: u.is_admin };
  };

  run(sql: string, binds: unknown[]): Row[] {
    this.queries.push(sql);
    const now = Date.now();
    if (sql.includes("FROM sessions s JOIN users u")) {
      const user = [...this.users.values()].find((u) => this.sessions.get(binds[0] as string) === u.id);
      if (!user) return [];
      return [
        {
          ...user,
          email: `${user.id}@example.test`,
          avatar: "{}",
          photo_version: 0,
          created_at: now,
          last_seen_at: now,
          banned_at: null,
          ban_reason: null,
          session_expires: now + 25 * 86400_000,
        },
      ];
    }
    if (sql.startsWith("INSERT INTO rate_limits")) {
      const count = (this.limits.get(binds[0] as string) ?? 0) + 1;
      this.limits.set(binds[0] as string, count);
      return [{ count }];
    }
    if (sql.startsWith("INSERT INTO reports")) {
      const [, cols, vals] = sql.replace(/\s+/g, " ").match(/\(([^)]+)\) VALUES \(([^)]+)\)/)!;
      const row: Row = {};
      const values = vals!.split(",").map((v) => v.trim());
      cols!.split(",").forEach((col, i) => {
        const v = values[i]!;
        row[col.trim()] = v.startsWith("?") ? binds[Number(v.slice(1)) - 1] : v.replace(/'/g, "");
      });
      this.reports.push(row);
      return [];
    }
    if (sql.startsWith("SELECT r.*")) {
      const match = this.where(sql, binds);
      const limit = sql.includes("LIMIT ?") ? (binds.at(-1) as number) : Infinity;
      return this.reports
        .filter(match)
        .sort((a, b) => (b.created_at as number) - (a.created_at as number))
        .slice(0, limit)
        .map(this.withUser);
    }
    if (sql.startsWith("SELECT COUNT(*) AS n FROM reports r")) return [{ n: this.reports.filter(this.where(sql, binds)).length }];
    if (sql === "SELECT COUNT(*) AS n FROM reports WHERE status = 'new'")
      return [{ n: this.reports.filter((r) => r.status === "new").length }];
    if (sql.startsWith("UPDATE reports SET status")) {
      const r = this.reports.find((x) => x.id === binds[2]);
      if (!r) return [];
      r.status = binds[0];
      r.updated_at = binds[1];
      return [{ id: r.id }];
    }
    if (sql.startsWith("DELETE FROM reports WHERE id")) {
      this.reports = this.reports.filter((x) => x.id !== binds[0]);
      return [];
    }
    if (sql.startsWith("UPDATE users SET last_seen_at") || sql.startsWith("UPDATE sessions SET")) return [];
    throw new Error(`Requête inattendue : ${sql}`);
  }
}

let db: FakeDb;

async function signIn(id: string, pseudo: string | null, admin = false): Promise<string> {
  db.users.set(id, { id, pseudo, is_admin: admin ? 1 : 0 });
  const token = `jeton-${id}`;
  db.sessions.set(await sha256Hex(token), id);
  return token;
}

function call(method: string, path: string, opts: { token?: string; body?: unknown; raw?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.origin !== null) headers.Origin = opts.origin ?? "http://localhost";
  if (opts.token) headers.Cookie = `sid=${opts.token}`;
  const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  return worker.fetch(new Request(`http://localhost/api${path}`, { method, headers, body }), { DB: db, DEV_MODE: "1" } as unknown as Env);
}

beforeEach(() => {
  db = new FakeDb();
});

describe("envoyer un signalement", () => {
  it("exige d'être connecté, avec un pseudo, depuis le site lui-même", async () => {
    expect((await call("POST", "/reports", { body: VALID })).status).toBe(401);
    const pending = await signIn("u_pending", null);
    expect((await call("POST", "/reports", { token: pending, body: VALID })).status).toBe(403);
    const token = await signIn("u_joueur", "Joueur");
    expect((await call("POST", "/reports", { token, body: VALID, origin: null })).status).toBe(403);
    expect((await call("POST", "/reports", { token, body: VALID, origin: "https://ailleurs.example" })).status).toBe(403);
    expect(db.reports).toHaveLength(0);
  });

  it("l'auteur est le compte de la session, jamais celui écrit dans la requête", async () => {
    const token = await signIn("u_joueur", "Joueur");
    await signIn("u_autre", "Autre");
    const res = await call("POST", "/reports", {
      token,
      body: { ...VALID, userId: "u_autre", user_id: "u_autre", pseudo: "Autre", status: "done" },
    });
    expect(res.status).toBe(200);
    expect(db.reports).toHaveLength(1);
    expect(db.reports[0]).toMatchObject({
      user_id: "u_joueur",
      kind: "bug",
      game: "uno",
      variant: "UNO classique",
      room_code: "ABCD",
      tour_code: null,
      role: "player",
      device: "phone",
      os: "Android 14",
      browser: "Chrome 131",
      screen_w: 412,
      screen_h: 915,
      view_w: 412,
      view_h: 800,
      status: "new",
    });
    // Ni adresse IP ni rien d'autre : seulement les colonnes du signalement
    expect(Object.keys(db.reports[0]!).sort()).toEqual(
      [
        "id",
        "user_id",
        "kind",
        "message",
        "game",
        "variant",
        "room_code",
        "tour_code",
        "role",
        "device",
        "os",
        "browser",
        "screen_w",
        "screen_h",
        "view_w",
        "view_h",
        "version",
        "status",
        "created_at",
        "updated_at",
      ].sort(),
    );
  });

  it("refuse ce qui n'est pas valable, sans compter l'essai", async () => {
    const token = await signIn("u_joueur", "Joueur");
    const res = await call("POST", "/reports", { token, body: { ...VALID, message: "court" } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/caractères au moins/);
    expect((await call("POST", "/reports", { token, raw: "pas du json" })).status).toBe(400);
    expect((await call("POST", "/reports", { token, raw: JSON.stringify({ ...VALID, message: "x".repeat(9000) }) })).status).toBe(413);
    expect(db.reports).toHaveLength(0);
    expect(db.limits.get("report:u_joueur")).toBeUndefined();
  });

  it(`pas plus de ${REPORTS_PER_HOUR} par heure et par compte`, async () => {
    const token = await signIn("u_joueur", "Joueur");
    for (let i = 0; i < REPORTS_PER_HOUR; i++) expect((await call("POST", "/reports", { token, body: VALID })).status).toBe(200);
    const res = await call("POST", "/reports", { token, body: VALID });
    expect(res.status).toBe(429);
    expect(db.reports).toHaveLength(REPORTS_PER_HOUR);
    // Un autre compte n'est pas touché
    const other = await signIn("u_autre", "Autre");
    expect((await call("POST", "/reports", { token: other, body: VALID })).status).toBe(200);
  });
});

describe("l'onglet admin des signalements", () => {
  async function seed() {
    const player = await signIn("u_joueur", "Joueur");
    const tablet = { ...DEVICE, kind: "tablet" };
    const pc = { ...DEVICE, kind: "pc", os: "Windows", browser: "Edge 131" };
    const sent = [
      { ...VALID },
      { ...VALID, kind: "idea", context: { game: "tour", code: null, tour: "WXYZ" }, device: pc },
      { ...VALID, kind: "problem", context: { game: "naval", code: "QRST" }, device: tablet },
    ];
    for (const [i, body] of sent.entries()) {
      vi.setSystemTime(new Date(2026, 10, 14, 20, i));
      await call("POST", "/reports", { token: player, body });
    }
    vi.useRealTimers();
    return player;
  }

  it("un joueur qui n'est pas admin ne voit rien et ne change rien", async () => {
    const player = await seed();
    const id = db.reports[0]!.id as string;
    for (const [method, path, body] of [
      ["GET", "/admin/reports", undefined],
      ["GET", "/admin/reports?status=new", undefined],
      ["PATCH", `/admin/reports/${id}`, { status: "done" }],
      ["DELETE", `/admin/reports/${id}`, undefined],
    ] as const) {
      expect((await call(method, path, { token: player, body })).status).toBe(403);
      expect((await call(method, path, { body })).status).toBe(401);
    }
    expect(db.reports).toHaveLength(3);
    expect(db.reports.every((r) => r.status === "new")).toBe(true);
  });

  it("l'admin lit, filtre, change l'état et supprime", async () => {
    await seed();
    const admin = await signIn("u_admin", "Patron", true);

    const all = (await (await call("GET", "/admin/reports", { token: admin })).json()) as {
      reports: {
        id: string;
        kind: string;
        user: { pseudo: string };
        context: { game: string; tour: string | null };
        device: { kind: string };
      }[];
      total: number;
      fresh: number;
    };
    expect(all.total).toBe(3);
    expect(all.fresh).toBe(3);
    // Les plus récents d'abord, avec le pseudo de l'auteur, le contexte et l'appareil
    expect(all.reports.map((r) => r.kind)).toEqual(["problem", "idea", "bug"]);
    expect(all.reports[1]).toMatchObject({ user: { pseudo: "Joueur" }, context: { game: "tour", tour: "WXYZ" }, device: { kind: "pc" } });

    const phones = (await (await call("GET", "/admin/reports?device=phone", { token: admin })).json()) as typeof all;
    expect(phones.reports.map((r) => r.kind)).toEqual(["bug"]);
    const tours = (await (await call("GET", "/admin/reports?game=tour&kind=idea", { token: admin })).json()) as typeof all;
    expect(tours.total).toBe(1);

    const bug = all.reports[2]!.id;
    expect((await call("PATCH", `/admin/reports/${bug}`, { token: admin, body: { status: "fini" } })).status).toBe(400);
    expect((await call("PATCH", `/admin/reports/inconnu`, { token: admin, body: { status: "seen" } })).status).toBe(404);
    const seen = (await (await call("PATCH", `/admin/reports/${bug}`, { token: admin, body: { status: "seen" } })).json()) as {
      report: { status: string };
    };
    expect(seen.report.status).toBe("seen");
    const fresh = (await (await call("GET", "/admin/reports?status=new", { token: admin })).json()) as typeof all;
    expect(fresh.total).toBe(2);
    expect(fresh.fresh).toBe(2);

    expect((await call("DELETE", `/admin/reports/${bug}`, { token: admin })).status).toBe(200);
    expect((await call("DELETE", `/admin/reports/${bug}`, { token: admin })).status).toBe(404);
    expect(db.reports).toHaveLength(2);
  });
});
