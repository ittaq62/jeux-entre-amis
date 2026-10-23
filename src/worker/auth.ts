import { EmailError, sendLoginCode } from "./email.ts";
import { parseCookies, randomCode, randomId, safeEqual, sha256Hex, base64url } from "./util.ts";

const CODE_TTL = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN = 45 * 1000;
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const SESSION_RENEW_BELOW = 15 * 24 * 3600 * 1000;
export const SESSION_COOKIE = "sid";

// Limites anti-abus : le Gmail gratuit envoie environ 500 emails par jour.
const LIMITS = {
  perEmailHour: 6,
  perIpHour: 15,
  globalDay: 450,
};

export interface UserRow {
  id: string;
  email: string;
  pseudo: string | null;
  avatar: string;
  photo_version: number;
  created_at: number;
  last_seen_at: number;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

/** Compteur a fenetre fixe dans D1. Renvoie false si la limite est depassee. */
export async function rateLimit(db: D1Database, key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN reset_at < ?3 THEN 1 ELSE count + 1 END,
         reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
       RETURNING count`,
    )
    .bind(key, now + windowMs, now)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}

function codeHash(env: Env, email: string, code: string) {
  return sha256Hex(`${env.SESSION_PEPPER}:${email}:${code}`);
}

export type RequestCodeResult = { ok: true; devCode?: string } | { ok: false; status: number; error: string };

export async function requestLoginCode(env: Env, rawEmail: unknown, ip: string, siteUrl: string): Promise<RequestCodeResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, status: 400, error: "Cette adresse email ne semble pas valide." };
  const now = Date.now();

  const existing = await env.DB.prepare("SELECT sent_at FROM login_codes WHERE email = ?").bind(email).first<{ sent_at: number }>();
  if (existing && now - existing.sent_at < RESEND_COOLDOWN) {
    const wait = Math.ceil((RESEND_COOLDOWN - (now - existing.sent_at)) / 1000);
    return { ok: false, status: 429, error: `Patiente encore ${wait} s avant de redemander un code.` };
  }
  if (!(await rateLimit(env.DB, `email:${email}`, LIMITS.perEmailHour, 3600_000))) {
    return { ok: false, status: 429, error: "Trop de codes demandés pour cette adresse. Réessaie dans une heure." };
  }
  if (!(await rateLimit(env.DB, `ip:${ip}`, LIMITS.perIpHour, 3600_000))) {
    return { ok: false, status: 429, error: "Trop de demandes depuis ta connexion. Réessaie dans une heure." };
  }
  if (!(await rateLimit(env.DB, "global:day", LIMITS.globalDay, 24 * 3600_000))) {
    return { ok: false, status: 503, error: "Le site a envoyé trop d'emails aujourd'hui. Réessaie demain." };
  }

  const code = randomCode();
  await env.DB.prepare(
    `INSERT INTO login_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?1, ?2, ?3, 0, ?4)
     ON CONFLICT(email) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0, sent_at = ?4`,
  )
    .bind(email, await codeHash(env, email, code), now + CODE_TTL, now)
    .run();

  try {
    await sendLoginCode(env, email, code, siteUrl);
  } catch (err) {
    console.error("Echec d'envoi du code", err);
    await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
    const message = err instanceof EmailError ? err.message : "L'email n'a pas pu partir. Réessaie dans un instant.";
    return { ok: false, status: 502, error: message };
  }
  return env.DEV_MODE === "1" ? { ok: true, devCode: code } : { ok: true };
}

export type VerifyResult = { ok: true; user: UserRow } | { ok: false; status: number; error: string };

export async function verifyLoginCode(env: Env, rawEmail: unknown, rawCode: unknown): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) return { ok: false, status: 400, error: "Le code fait 6 chiffres." };
  const now = Date.now();
  const row = await env.DB.prepare("SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?")
    .bind(email)
    .first<{ code_hash: string; expires_at: number; attempts: number }>();
  if (!row || row.expires_at < now) return { ok: false, status: 400, error: "Ce code a expiré. Demandes-en un nouveau." };
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "Trop d'essais. Demande un nouveau code." };
  }
  if (!safeEqual(row.code_hash, await codeHash(env, email, code))) {
    await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    const left = CODE_MAX_ATTEMPTS - row.attempts - 1;
    return {
      ok: false,
      status: 400,
      error: left > 0 ? `Code incorrect. Encore ${left} essai${left > 1 ? "s" : ""}.` : "Code incorrect. Demande un nouveau code.",
    };
  }
  await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();

  let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  if (!user) {
    user = await env.DB.prepare(
      "INSERT INTO users (id, email, pseudo, avatar, created_at, last_seen_at) VALUES (?, ?, NULL, '{}', ?, ?) RETURNING *",
    )
      .bind(randomId(9), email, now, now)
      .first<UserRow>();
  }
  return { ok: true, user: user! };
}

export async function createSession(env: Env, userId: string): Promise<{ token: string; expires: number }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = base64url(bytes);
  const now = Date.now();
  const expires = now + SESSION_TTL;
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, expires)
    .run();
  // Menage occasionnel des sessions et codes expires
  if (Math.random() < 0.05) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
      env.DB.prepare("DELETE FROM login_codes WHERE expires_at < ?").bind(now - 86400_000),
      env.DB.prepare("DELETE FROM rate_limits WHERE reset_at < ?").bind(now),
    ]);
  }
  return { token, expires };
}

export interface Session {
  user: UserRow;
  tokenHash: string;
  /** Nouvelle date d'expiration si la session vient d'etre prolongee */
  renewed: number | null;
  token: string;
}

export async function getSession(env: Env, request: Request): Promise<Session | null> {
  const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (!token || token.length > 100) return null;
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT s.expires_at AS session_expires, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<UserRow & { session_expires: number }>();
  if (!row || row.session_expires < now) return null;
  let renewed: number | null = null;
  if (row.session_expires - now < SESSION_RENEW_BELOW) {
    renewed = now + SESSION_TTL;
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(renewed, tokenHash).run();
  }
  if (now - row.last_seen_at > 5 * 60_000) {
    await env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, row.id).run();
  }
  const { session_expires: _ignored, ...user } = row;
  return { user, tokenHash, renewed, token };
}

export async function destroySession(env: Env, tokenHash: string) {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export function sessionCookie(request: Request, token: string, expires: number): string {
  const secure = new URL(request.url).protocol === "https:";
  const maxAge = Math.max(0, Math.floor((expires - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
