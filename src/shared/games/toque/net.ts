// Ce que se disent la cuisine de Toque ! et les navigateurs : le salon, le service, les commandes des joueurs, et une
// quinzaine de fois par seconde l'état complet de la cuisine, serré (les nombres arrondis, les cases vides omises).
// Chaque joueur repart de cet état pour montrer son chef au présent (voir le client).

import type { LoadGate } from "../../loadGate.ts";
import type { AchievementUnlock, ChatMessage, EloResult, RoomStatus, SeatView, SpectatorView, Visibility } from "../../protocol.ts";
import type { StarAwardResult } from "../../stars.ts";
import { isBotLevel, type BotLevel } from "./bot.ts";
import { buildKitchen, isKitchenId, type KitchenId } from "./kitchens.ts";
import type { ToqueLook } from "./looks.ts";
import type { Chef, ChefStats, Input, Item, ToqueEvent, World } from "./sim.ts";

export const TOQUE_MAX_PLAYERS = 4;

export type ToqueMode = "service" | "duel";

/** Ce que l'hôte règle avant le service */
export interface ToqueConfig {
  mode: ToqueMode;
  kitchen: KitchenId;
  /** Seul à la table : un commis l'aide, ou il passe d'un chef à l'autre */
  solo: "commis" | "deux";
  botLevel: BotLevel;
  /** Coup de feu : les commandes tombent plus vite et attendent moins */
  rush: boolean;
}

export const DEFAULT_CONFIG: ToqueConfig = { mode: "service", kitchen: "bistrot", solo: "commis", botLevel: "moyen", rush: false };

export const MODE_NAMES: Record<ToqueMode, string> = { service: "En brigade", duel: "L'un contre l'autre" };

/** Applique les réglages reçus, en refusant tout ce qui n'existe pas */
export function mergeConfig(current: ToqueConfig, patch: Partial<ToqueConfig>): ToqueConfig {
  const next = { ...DEFAULT_CONFIG, ...current };
  if (patch.mode === "service" || patch.mode === "duel") next.mode = patch.mode;
  if (isKitchenId(patch.kitchen)) next.kitchen = patch.kitchen;
  if (patch.solo === "commis" || patch.solo === "deux") next.solo = patch.solo;
  if (isBotLevel(patch.botLevel)) next.botLevel = patch.botLevel;
  if (typeof patch.rush === "boolean") next.rush = patch.rush;
  return next;
}

export interface ToqueRoomSettings {
  visibility: Visibility;
  maxPlayers: number;
  /** Rejoindre en cours de route (Toque ! : on regarde, et on joue le service suivant) */
  lateJoin?: boolean;
  randomRules?: string | null;
  toque: ToqueConfig;
}

export interface ToqueSeatView extends SeatView {
  look: ToqueLook;
}

/** Qui commande quels chefs : chaque siège, son équipe, un ou deux chefs */
export interface ToqueOwner {
  seat: string;
  team: number;
  chefs: 1 | 2;
  bot: boolean;
}

/** Le bilan d'une équipe à la fin du service */
export interface TeamResult {
  score: number;
  served: number;
  failed: number;
  tips: number;
  best: number;
  stars: number;
}

export interface ToqueResult {
  teams: TeamResult[];
  /** En duel, l'équipe gagnante (null : égalité) */
  winner: number | null;
  /** Ce qu'a fait chaque chef (dans l'ordre des chefs) */
  chefs: (ChefStats & { owner: number })[];
}

/** Le service tel que le décrit la table : ce qui ne change pas d'un pas à l'autre */
export interface ToqueView {
  config: ToqueConfig;
  kitchen: KitchenId;
  duel: boolean;
  owners: ToqueOwner[];
  seed: number;
  /** Les seuils des étoiles de chaque équipe (selon son nombre de chefs) */
  goals: [number, number, number][];
  result: ToqueResult | null;
}

export interface ToqueRoomView {
  code: string;
  game: "toque";
  status: RoomStatus;
  settings: ToqueRoomSettings;
  seats: ToqueSeatView[];
  spectators: SpectatorView[];
  hostId: string;
  you: { userId: string; seatId: string | null; isHost: boolean; isAdmin: boolean };
  teams: Record<string, 0 | 1>;
  toque: ToqueView | null;
  gate?: LoadGate | null;
  serverNow: number;
  rematch: string[];
  results?: Record<string, EloResult> | null;
  quick: boolean;
  tour?: string | null;
  pickUntil?: number | null;
  ready?: string[];
}

export type ToqueClientMessage =
  | {
      t: "settings";
      settings: Partial<ToqueConfig>;
      visibility?: Visibility;
      maxPlayers?: number;
      lateJoin?: boolean;
      randomRules?: boolean;
    }
  /** Ses commandes : `s` le numéro de la première, puis par commande x, y, boutons tenus, boutons enfoncés ; `c` l'heure d'envoi */
  | { t: "in"; s: number; d: number[]; c: number }
  | { t: "look"; look: ToqueLook }
  | { t: "team"; team: 0 | 1 }
  | { t: "addBot" }
  | { t: "removeSeat"; seatId: string }
  | { t: "kick"; userId: string }
  | { t: "start" }
  | { t: "chat"; text: string }
  | { t: "emote"; emote: string }
  | { t: "rematch" }
  | { t: "sit" }
  | { t: "leave" }
  | { t: "ready" }
  | { t: "loaded"; gate: number }
  | { t: "close" };

/** Un état de la cuisine, et ce que le serveur sait des commandes de chacun */
export interface ToqueTick {
  /** L'état du monde (serré) */
  w: PackedWorld;
  /** La dernière commande prise en compte de chaque joueur (dans l'ordre des joueurs) */
  k: number[];
  /** L'heure d'envoi de sa dernière commande, renvoyée (pour mesurer l'aller-retour) */
  c: number[];
  /** La dernière commande de chacun (les autres sont anticipés avec) */
  u: number[];
  /** Ce qui s'est passé depuis le dernier envoi */
  e: ToqueEvent[];
}

export type ToqueServerMessage =
  | { t: "room"; room: ToqueRoomView }
  | ({ t: "tick"; now: number } & ToqueTick)
  | { t: "stars"; result: StarAwardResult }
  | { t: "chat"; messages: ChatMessage[]; reset?: boolean }
  | { t: "emote"; seatId: string | null; userId: string; emote: string }
  | { t: "achievements"; unlocks: AchievementUnlock[] }
  | { t: "error"; message: string }
  | { t: "kicked" }
  | { t: "closed"; reason: string }
  | { t: "replaced" };

/** Une commande par pas : le serveur les rejoue une à une, dans l'ordre */
export const SAMPLE_STRIDE = 4;

/** Les stats d'un service pour un joueur, gardées avec ses résultats */
export interface ToqueRecordStats {
  score: number;
  stars: number;
  served: number;
  failed: number;
  tips: number;
  best: number;
  chopped: number;
  washed: number;
  fires: number;
  thrown: number;
  caught: number;
  falls: number;
  /** Ce qu'il a servi lui-même */
  plated: number;
  /** Une partie en duel gagnée, un service sans aucune commande ratée */
  duelWon: number;
  perfect: number;
  /** Les cuisines où il a eu trois étoiles (cette partie : 0 ou 1) */
  three: number;
  /** La cuisine (pour la tournée et les succès) */
  kitchen: KitchenId;
}

// ---------------------------------------------------------------------------
// L'état serré
// ---------------------------------------------------------------------------

/** Un objet, sans ce qui ne sert pas : les nombres arrondis */
export type PackedItem = Item;

export interface PackedWorld {
  f: number;
  ph: number;
  /** Par chef : x, y, vx, vy, fx, fy, act, case, élan, recharge, sonné, tombé, ce qu'il tient */
  c: [number, number, number, number, number, number, number, number, number, number, number, number, PackedItem | null][];
  a: number[];
  /** Les cases occupées : [case, objet] */
  i: [number, PackedItem][];
  /** Les piles d'assiettes, la vaisselle en cours, le feu : [case, valeur(s)] */
  st: [number, number][];
  wa: [number, number][];
  fi: [number, number, number][];
  lo: [PackedItem, number, number, number][];
  fl: [PackedItem, number, number, number, number, number, number][];
  rt: [number, number][];
  tm: World["teams"];
  n: number;
  r: number;
  h: number[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function packItem(it: Item): PackedItem {
  const o: Item = { id: it.id, k: it.k };
  if (it.f !== undefined) o.f = it.f;
  if (it.b !== undefined) o.b = it.b;
  if (it.c !== undefined && (it.c.length > 0 || it.k !== "food")) o.c = it.c;
  if (it.p !== undefined && it.p !== 0) o.p = r4(it.p);
  if (it.n !== undefined && it.n !== 1) o.n = it.n;
  if (it.dirty) o.dirty = true;
  if (it.home !== undefined) o.home = it.home;
  return o;
}

const copyItem = (it: Item): Item => ({ ...it, ...(it.c ? { c: [...it.c] } : {}) });

export function packWorld(w: World): PackedWorld {
  const items: [number, PackedItem][] = [];
  w.items.forEach((it, i) => it && items.push([i, packItem(it)]));
  const sparse = (arr: number[]) => {
    const out: [number, number][] = [];
    arr.forEach((v, i) => v !== 0 && out.push([i, r4(v)]));
    return out;
  };
  const fire: [number, number, number][] = [];
  w.fire.forEach((v, i) => v > 0 && fire.push([i, r4(v), w.fireT[i]!]));
  return {
    f: w.frame,
    ph: w.phase,
    c: w.chefs.map((c) => [
      r3(c.x),
      r3(c.y),
      r3(c.vx),
      r3(c.vy),
      r4(c.fx),
      r4(c.fy),
      c.act,
      c.cell,
      c.dash,
      c.cd,
      c.stun,
      c.out,
      c.held ? packItem(c.held) : null,
    ]),
    a: [...w.active],
    i: items,
    st: sparse(w.stack),
    wa: sparse(w.wash),
    fi: fire,
    lo: w.loose.map((l) => [packItem(l.item), r3(l.x), r3(l.y), l.sec]),
    fl: w.flying.map((f) => [packItem(f.item), r3(f.x), r3(f.y), r3(f.vx), r3(f.vy), f.t, f.by]),
    rt: w.returns.map((r) => [r.at, r.team]),
    tm: w.teams.map((t) => ({ ...t, orders: t.orders.map((o) => ({ ...o })) })),
    n: w.nextId,
    r: w.rng,
    h: [...w.hits],
  };
}

/**
 * L'état reçu, remis dans un monde (celui du client, gardé d'une fois sur l'autre pour ses chefs et leurs stats :
 * seules les positions, les gestes et la cuisine changent)
 */
export function unpackWorld(base: World, p: PackedWorld): World {
  const k = buildKitchen(base.kitchen, base.duel);
  const n = k.W * k.H;
  const w = base;
  w.frame = p.f;
  w.phase = p.ph;
  p.c.forEach((c, i) => {
    const chef: Chef | undefined = w.chefs[i];
    if (!chef) return;
    chef.x = c[0];
    chef.y = c[1];
    chef.vx = c[2];
    chef.vy = c[3];
    chef.fx = c[4];
    chef.fy = c[5];
    chef.act = c[6];
    chef.cell = c[7];
    chef.dash = c[8];
    chef.cd = c[9];
    chef.stun = c[10];
    chef.out = c[11];
    chef.held = c[12] ? copyItem(c[12]) : null;
  });
  w.active = [...p.a];
  w.items = new Array(n).fill(null);
  for (const [i, it] of p.i) w.items[i] = copyItem(it);
  w.stack = new Array(n).fill(0);
  for (const [i, v] of p.st) w.stack[i] = v;
  w.wash = new Array(n).fill(0);
  for (const [i, v] of p.wa) w.wash[i] = v;
  w.fire = new Array(n).fill(0);
  w.fireT = new Array(n).fill(0);
  for (const [i, v, t] of p.fi) {
    w.fire[i] = v;
    w.fireT[i] = t;
  }
  w.loose = p.lo.map(([item, x, y, sec]) => ({ item: copyItem(item), x, y, sec }));
  w.flying = p.fl.map(([item, x, y, vx, vy, t, by]) => ({ item: copyItem(item), x, y, vx, vy, t, by }));
  w.returns = p.rt.map(([at, team]) => ({ at, team }));
  w.teams = p.tm.map((t) => ({ ...t, orders: t.orders.map((o) => ({ ...o })) }));
  w.nextId = p.n;
  w.rng = p.r;
  w.hits = [...p.h];
  return w;
}

/** Les commandes de chacun, serrées : x, y, tenus (sans les appuis : on ne rejoue pas les gestes des autres) */
export function packInputs(inputs: readonly Input[]): number[] {
  const out: number[] = [];
  for (const i of inputs) out.push(Math.round(i.x * 100) / 100, Math.round(i.y * 100) / 100, i.held);
  return out;
}

export function unpackInputs(d: readonly number[], count: number): Input[] {
  const out: Input[] = [];
  for (let i = 0; i < count; i++) out.push({ x: d[i * 3] ?? 0, y: d[i * 3 + 1] ?? 0, held: d[i * 3 + 2] ?? 0, pressed: 0 });
  return out;
}
