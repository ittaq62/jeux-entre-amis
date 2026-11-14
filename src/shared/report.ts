// Les signalements : un bug, un problème ou une idée, envoyés depuis la fin d'une partie ou d'une tournée, lus par
// l'admin dans son onglet « Signalements ». Le contexte part tout seul ; rien de personnel au-delà du compte.

import type { PublicUser, TableGame } from "./protocol.ts";

export type ReportKind = "bug" | "problem" | "idea";
export const REPORT_KINDS: readonly ReportKind[] = ["bug", "problem", "idea"];
export const REPORT_KIND_NAMES: Record<ReportKind, string> = { bug: "Bug", problem: "Problème", idea: "Idée d'amélioration" };

export type DeviceKind = "phone" | "tablet" | "pc";
export const DEVICE_KINDS: readonly DeviceKind[] = ["phone", "tablet", "pc"];
export const DEVICE_NAMES: Record<DeviceKind, string> = { phone: "Téléphone", tablet: "Tablette", pc: "PC" };

export type ReportStatus = "new" | "seen" | "done";
export const REPORT_STATUSES: readonly ReportStatus[] = ["new", "seen", "done"];
export const REPORT_STATUS_NAMES: Record<ReportStatus, string> = { new: "Nouveau", seen: "Vu", done: "Réglé" };

export type ReportRole = "player" | "watcher";

/** Longueur du texte, en caractères */
export const REPORT_MIN = 10;
export const REPORT_MAX = 1000;
/** Signalements par compte et par heure */
export const REPORTS_PER_HOUR = 5;
export const REPORT_VARIANT_MAX = 80;
export const REPORT_LABEL_MAX = 40;
export const REPORT_VERSION_MAX = 60;

/** Où l'on était : le jeu (ou la tournée), sa variante en clair, les codes, joueur ou spectateur */
export interface ReportContext {
  game: TableGame | null;
  variant: string | null;
  code: string | null;
  tour: string | null;
  role: ReportRole | null;
}

/** L'appareil, en clair. Les tailles sont en pixels CSS ; 0 quand on ne sait pas. */
export interface ReportDevice {
  kind: DeviceKind;
  os: string;
  browser: string;
  screen: { w: number; h: number };
  view: { w: number; h: number };
}

/** Ce que le navigateur envoie. L'identité vient de la session, jamais d'ici. */
export interface ReportInput {
  kind: ReportKind;
  message: string;
  context: ReportContext;
  device: ReportDevice;
  version: string | null;
}

export interface AdminReport extends ReportInput {
  id: string;
  user: PublicUser;
  status: ReportStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AdminReportFilters {
  kind?: ReportKind;
  game?: TableGame;
  device?: DeviceKind;
  status?: ReportStatus;
}

export interface AdminReportList {
  reports: AdminReport[];
  /** Combien correspondent aux filtres (la liste s'arrête aux plus récents) */
  total: number;
  /** Combien sont encore « nouveau », tous filtres confondus */
  fresh: number;
}

/** Ce que le navigateur dit de lui-même */
export interface DeviceClues {
  ua: string;
  /** navigator.maxTouchPoints */
  touchPoints: number;
  /** navigator.userAgentData.mobile, quand le navigateur le donne */
  mobile?: boolean;
}

const major = (ua: string, re: RegExp) => ua.match(re)?.slice(1).find(Boolean);
const withVersion = (name: string, version: string | undefined) => (version ? `${name} ${version}` : name);

/** Téléphone, tablette ou PC, le système et le navigateur, lus dans ce que le navigateur dit de lui-même. */
export function describeDevice({ ua, touchPoints, mobile }: DeviceClues): Pick<ReportDevice, "kind" | "os" | "browser"> {
  // Une tablette d'Apple se présente comme un Mac ; seul l'écran tactile la trahit
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const appleVersion = ua.match(/OS (\d+)[_.](\d+)/);
  const appleOs = appleVersion ? `${appleVersion[1]}.${appleVersion[2]}` : undefined;

  let os: string;
  if (/iPhone|iPod/.test(ua)) os = withVersion("iOS", appleOs);
  else if (ipad) os = withVersion("iPadOS", /iPad/.test(ua) ? appleOs : undefined);
  else if (/Android/.test(ua)) os = withVersion("Android", major(ua, /Android (\d+(?:\.\d+)?)/));
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  else os = "Système inconnu";

  let kind: DeviceKind;
  if (ipad || /Tablet|Silk|Kindle|PlayBook/.test(ua)) kind = "tablet";
  else if (/iPhone|iPod/.test(ua)) kind = "phone";
  else if (/Android/.test(ua)) kind = /Mobile/.test(ua) ? "phone" : "tablet";
  else if (mobile || /Mobi|Windows Phone/.test(ua)) kind = "phone";
  else kind = "pc";

  let browser: string;
  if (/SamsungBrowser/.test(ua)) browser = withVersion("Samsung Internet", major(ua, /SamsungBrowser\/(\d+)/));
  else if (/EdgA?\/|EdgiOS\//.test(ua)) browser = withVersion("Edge", major(ua, /Edg(?:A|iOS)?\/(\d+)/));
  else if (/OPR\/|OPT\//.test(ua)) browser = withVersion("Opera", major(ua, /OP[RT]\/(\d+)/));
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = withVersion("Firefox", major(ua, /(?:Firefox|FxiOS)\/(\d+)/));
  else if (/CriOS\//.test(ua)) browser = withVersion("Chrome", major(ua, /CriOS\/(\d+)/));
  else if (/Chrome\//.test(ua)) browser = withVersion("Chrome", major(ua, /Chrome\/(\d+)/));
  else if (/Safari\//.test(ua)) browser = withVersion("Safari", major(ua, /Version\/(\d+(?:\.\d+)?)/));
  else browser = "Navigateur inconnu";

  return { kind, os, browser };
}

/** « Téléphone, Android 14, Chrome 131, écran 412×915 » */
export function deviceLine(d: ReportDevice): string {
  const size = d.screen.w > 0 && d.screen.h > 0 ? `, écran ${d.screen.w}×${d.screen.h}` : "";
  return `${DEVICE_NAMES[d.kind]}, ${d.os}, ${d.browser}${size}`;
}
