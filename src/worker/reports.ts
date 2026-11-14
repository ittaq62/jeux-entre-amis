// Les signalements côté serveur : lire ce que le navigateur envoie sans rien croire de l'identité, l'enregistrer,
// et le montrer à l'admin.

import { isRoomCode } from "../shared/app.ts";
import { TABLE_NAMES, type TableGame } from "../shared/protocol.ts";
import {
  DEVICE_KINDS,
  REPORT_KINDS,
  REPORT_LABEL_MAX,
  REPORT_MAX,
  REPORT_MIN,
  REPORT_STATUSES,
  REPORT_VARIANT_MAX,
  REPORT_VERSION_MAX,
  type AdminReport,
  type AdminReportFilters,
  type AdminReportList,
  type DeviceKind,
  type ReportInput,
  type ReportKind,
  type ReportRole,
  type ReportStatus,
} from "../shared/report.ts";
import { toPublic } from "./users.ts";
import { randomId } from "./util.ts";

/** Au-delà, la requête n'est même pas lue */
export const REPORT_BODY_MAX = 8 * 1024;
/** L'onglet admin montre les plus récents */
export const REPORT_LIST_MAX = 200;

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);
const isTableGame = (value: unknown): value is TableGame => typeof value === "string" && Object.hasOwn(TABLE_NAMES, value);

/** Une ligne de texte : sans caractères de contrôle, espaces resserrés, coupée à `max` ; null si vide */
function line(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

/** Le texte libre : les retours à la ligne restent (deux lignes vides au plus), le reste des caractères de contrôle part */
function paragraph(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Une taille d'écran en pixels CSS ; 0 quand elle manque ou n'a pas de sens */
function size(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 20000 ? Math.round(raw) : 0;
}

function code(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  return isRoomCode(upper) ? upper : null;
}

const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/**
 * Lit un signalement tel que le navigateur l'envoie. Seuls les champs connus sont gardés : un `userId` ou un
 * pseudo glissé dans la requête est ignoré, l'auteur est toujours le compte de la session.
 */
export function readReport(raw: unknown): { report: ReportInput } | { error: string } {
  const body = record(raw);
  if (!isOneOf(REPORT_KINDS, body.kind)) return { error: "Choisis ce que tu signales : un bug, un problème ou une idée." };
  const message = paragraph(body.message);
  if (message.length < REPORT_MIN) return { error: `Explique un peu plus : ${REPORT_MIN} caractères au moins.` };
  if (message.length > REPORT_MAX) return { error: `C'est trop long : ${REPORT_MAX} caractères au plus.` };

  const ctx = record(body.context);
  const dev = record(body.device);
  if (!isOneOf(DEVICE_KINDS, dev.kind)) return { error: "L'appareil n'a pas pu être reconnu." };
  const screen = record(dev.screen);
  const view = record(dev.view);
  return {
    report: {
      kind: body.kind,
      message,
      context: {
        game: isTableGame(ctx.game) ? ctx.game : null,
        variant: line(ctx.variant, REPORT_VARIANT_MAX),
        code: code(ctx.code),
        tour: code(ctx.tour),
        role: isOneOf<ReportRole>(["player", "watcher"], ctx.role) ? ctx.role : null,
      },
      device: {
        kind: dev.kind,
        os: line(dev.os, REPORT_LABEL_MAX) ?? "Système inconnu",
        browser: line(dev.browser, REPORT_LABEL_MAX) ?? "Navigateur inconnu",
        screen: { w: size(screen.w), h: size(screen.h) },
        view: { w: size(view.w), h: size(view.h) },
      },
      version: line(body.version, REPORT_VERSION_MAX),
    },
  };
}

/** Les filtres de l'onglet admin, lus dans l'adresse ; ce qui est inconnu est ignoré */
export function readReportFilters(query: Record<string, string | undefined>): AdminReportFilters {
  const filters: AdminReportFilters = {};
  if (isOneOf(REPORT_KINDS, query.kind)) filters.kind = query.kind;
  if (isTableGame(query.game)) filters.game = query.game;
  if (isOneOf(DEVICE_KINDS, query.device)) filters.device = query.device;
  if (isOneOf(REPORT_STATUSES, query.status)) filters.status = query.status;
  return filters;
}

export const isReportStatus = (value: unknown): value is ReportStatus => isOneOf(REPORT_STATUSES, value);

export async function addReport(db: D1Database, userId: string, r: ReportInput, now: number): Promise<string> {
  const id = randomId(9);
  await db
    .prepare(
      `INSERT INTO reports (id, user_id, kind, message, game, variant, room_code, tour_code, role,
         device, os, browser, screen_w, screen_h, view_w, view_h, version, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, 'new', ?18, ?18)`,
    )
    .bind(
      id,
      userId,
      r.kind,
      r.message,
      r.context.game,
      r.context.variant,
      r.context.code,
      r.context.tour,
      r.context.role,
      r.device.kind,
      r.device.os,
      r.device.browser,
      r.device.screen.w,
      r.device.screen.h,
      r.device.view.w,
      r.device.view.h,
      r.version,
      now,
    )
    .run();
  return id;
}

export interface ReportRow {
  id: string;
  user_id: string;
  kind: ReportKind;
  message: string;
  game: TableGame | null;
  variant: string | null;
  room_code: string | null;
  tour_code: string | null;
  role: ReportRole | null;
  device: DeviceKind;
  os: string;
  browser: string;
  screen_w: number;
  screen_h: number;
  view_w: number;
  view_h: number;
  version: string | null;
  status: ReportStatus;
  created_at: number;
  updated_at: number;
  // L'auteur, tel qu'il s'appelle aujourd'hui
  pseudo: string | null;
  avatar: string;
  photo_version: number;
  is_admin: number;
}

const REPORT_SELECT = `SELECT r.*, u.pseudo, u.avatar, u.photo_version, u.is_admin FROM reports r JOIN users u ON u.id = r.user_id`;

export function toAdminReport(r: ReportRow): AdminReport {
  return {
    id: r.id,
    user: toPublic({ id: r.user_id, pseudo: r.pseudo, avatar: r.avatar, photo_version: r.photo_version, is_admin: r.is_admin }),
    kind: r.kind,
    message: r.message,
    context: { game: r.game, variant: r.variant, code: r.room_code, tour: r.tour_code, role: r.role },
    device: { kind: r.device, os: r.os, browser: r.browser, screen: { w: r.screen_w, h: r.screen_h }, view: { w: r.view_w, h: r.view_h } },
    version: r.version,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Les conditions des filtres, dans l'ordre des valeurs à lier */
export function filterClause(filters: AdminReportFilters): { where: string; binds: string[] } {
  const parts: string[] = [];
  const binds: string[] = [];
  const add = (column: string, value: string | undefined) => {
    if (value === undefined) return;
    parts.push(`r.${column} = ?`);
    binds.push(value);
  };
  add("kind", filters.kind);
  add("game", filters.game);
  add("device", filters.device);
  add("status", filters.status);
  return { where: parts.length > 0 ? ` WHERE ${parts.join(" AND ")}` : "", binds };
}

export async function listReports(db: D1Database, filters: AdminReportFilters, limit = REPORT_LIST_MAX): Promise<AdminReportList> {
  const { where, binds } = filterClause(filters);
  const [rows, total, fresh] = await Promise.all([
    db
      .prepare(`${REPORT_SELECT}${where} ORDER BY r.created_at DESC LIMIT ?`)
      .bind(...binds, limit)
      .all<ReportRow>(),
    db
      .prepare(`SELECT COUNT(*) AS n FROM reports r${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    newReportCount(db),
  ]);
  return { reports: rows.results.map(toAdminReport), total: total?.n ?? 0, fresh };
}

export async function newReportCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'new'").first<{ n: number }>();
  return row?.n ?? 0;
}

export async function setReportStatus(db: D1Database, id: string, status: ReportStatus, now: number): Promise<AdminReport | null> {
  const updated = await db
    .prepare("UPDATE reports SET status = ?1, updated_at = ?2 WHERE id = ?3 RETURNING id")
    .bind(status, now, id)
    .first<{ id: string }>();
  if (!updated) return null;
  const row = await db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).bind(id).first<ReportRow>();
  return row ? toAdminReport(row) : null;
}

export async function deleteReport(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM reports WHERE id = ?").bind(id).run();
  return (res.meta.changes ?? 0) > 0;
}
