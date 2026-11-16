// Ce que les joueurs reçoivent d'un combat : les réglages et l'état d'ensemble à chaque changement, et, une trentaine
// de fois par seconde, tout ce qui bouge, serré en petits tableaux de nombres. Chacun reçoit en plus l'état complet de
// son propre combattant, qu'il recalcule de son côté avec ses dernières commandes.

import { ARENA_IDS, isArenaId, type ArenaId } from "./arenas.ts";
import { isBotLevel, type BotLevel } from "./bot.ts";
import { DEFAULT_FIGHT_SETTINGS, SHOTS, timeLeft } from "./engine.ts";
import {
  ITEM_KINDS,
  STATES,
  type Fight,
  type FightEvent,
  type Fighter,
  type FighterStats,
  type FightSettings,
  type HabitueId,
  type ItemKind,
} from "./model.ts";
import { GENERIC_KEYS, MOVE_SLOTS } from "./moves.ts";

/** Tout ce que l'hôte règle avant le combat */
export interface CulbuteConfig extends FightSettings {
  arena: ArenaId | "hasard";
  botLevel: BotLevel;
}

export const STOCK_CHOICES = [1, 2, 3, 4, 5] as const;
export const MINUTE_CHOICES = [2, 3, 5] as const;

export const DEFAULT_CONFIG: CulbuteConfig = { ...DEFAULT_FIGHT_SETTINGS, arena: "hasard", botLevel: "moyen" };

export const MODE_NAMES: Record<FightSettings["mode"], string> = { vies: "Aux vies", temps: "Au temps", subite: "Mort subite" };
export const ITEMS_NAMES: Record<FightSettings["items"], string> = { aucun: "Aucun", peu: "Un peu", beaucoup: "Beaucoup" };

/** Applique les réglages reçus, en refusant tout ce qui n'existe pas */
export function mergeConfig(current: CulbuteConfig, patch: Partial<CulbuteConfig>): CulbuteConfig {
  const next = { ...DEFAULT_CONFIG, ...current };
  if (patch.mode === "vies" || patch.mode === "temps" || patch.mode === "subite") next.mode = patch.mode;
  if ((STOCK_CHOICES as readonly number[]).includes(patch.stocks as number)) next.stocks = patch.stocks!;
  if ((MINUTE_CHOICES as readonly number[]).includes(patch.minutes as number)) next.minutes = patch.minutes!;
  if (patch.items === "aucun" || patch.items === "peu" || patch.items === "beaucoup") next.items = patch.items;
  if (typeof patch.teams === "boolean") next.teams = patch.teams;
  if (typeof patch.friendlyFire === "boolean") next.friendlyFire = patch.friendlyFire;
  if (typeof patch.lune === "boolean") next.lune = patch.lune;
  if (patch.arena === "hasard" || isArenaId(patch.arena)) next.arena = patch.arena;
  if (isBotLevel(patch.botLevel)) next.botLevel = patch.botLevel;
  return next;
}

/** L'arène du combat : celle de l'hôte, ou une au hasard */
export function pickArena(cfg: CulbuteConfig, random: () => number): ArenaId {
  return cfg.arena === "hasard" ? ARENA_IDS[Math.min(ARENA_IDS.length - 1, Math.floor(random() * ARENA_IDS.length))]! : cfg.arena;
}

// ---------------------------------------------------------------------------
// L'état d'ensemble : il change rarement
// ---------------------------------------------------------------------------

export interface CulbuteFighterInfo {
  slot: number;
  /** Le siège */
  id: string;
  team: number;
  style: HabitueId;
}

export interface CulbuteView {
  config: CulbuteConfig;
  arena: ArenaId;
  scale: number;
  fighters: CulbuteFighterInfo[];
  phase: Fight["phase"];
  /** Le combat dure au plus tant d'images après l'introduction */
  limit: number;
  /** Une fois fini : les places, et ce que chacun a fait */
  ranks: number[] | null;
  stats: FighterStats[] | null;
  winners: number[];
}

export function culbuteView(f: Fight, cfg: CulbuteConfig): CulbuteView {
  const over = f.phase === "over";
  return {
    config: { ...cfg, ...f.settings, arena: f.arena as ArenaId },
    arena: f.arena as ArenaId,
    scale: f.scale,
    fighters: f.fighters.map((ft) => ({ slot: ft.slot, id: ft.id, team: ft.team, style: ft.style })),
    phase: f.phase,
    limit: f.limit,
    ranks: over ? f.fighters.map((ft) => ft.rank) : null,
    stats: over ? f.fighters.map((ft) => ft.stats) : null,
    winners: f.winners,
  };
}

/** Ce qu'un combat laisse dans les statistiques d'un joueur */
export interface CulbuteRecordStats {
  /** Adversaires sortis, et ses propres chutes */
  kos: number;
  falls: number;
  /** Pourcents infligés et reçus */
  dealt: number;
  taken: number;
  items: number;
  /** Le plus petit pourcentage auquel il a sorti quelqu'un (0 : personne) */
  lowKo: number;
  stocksLeft: number;
  /** 1 s'il a perdu au moins une vie */
  lostStock: number;
  won: number;
}

/** Ce qui justifie d'envoyer à tous l'état d'ensemble */
export function stateKey(f: Fight): string {
  return [f.phase, f.winners.join(","), f.fighters.map((ft) => (ft.state === "out" ? "x" : "o")).join("")].join("|");
}

// ---------------------------------------------------------------------------
// Ce qui bouge, serré
// ---------------------------------------------------------------------------

/** Les attaques, dans un ordre fixe (0 : aucune) */
export const MOVE_KEYS: string[] = ["", ...MOVE_SLOTS, ...GENERIC_KEYS];
const MOVE_CODE = new Map(MOVE_KEYS.map((k, i) => [k, i]));
const STATE_CODE = new Map(STATES.map((s, i) => [s, i]));
export const HELD_ITEMS: (ItemKind | "")[] = ["", ...ITEM_KINDS];
const ITEM_CODE = new Map(HELD_ITEMS.map((k, i) => [k, i]));
export const SHOT_KINDS = Object.keys(SHOTS);
export const ITEM_STRIDE = 5;
export const SHOT_STRIDE = 8;
export const TRAP_STRIDE = 4;
const SHOT_CODE = new Map(SHOT_KINDS.map((k, i) => [k, i]));

/** Ce qu'on voit de chaque combattant */
export const FIGHTER_STRIDE = 15;

// Les petits drapeaux d'un combattant, en bits
export const F_INTANG = 1;
export const F_STOP = 2;
export const F_CREAM = 4;
export const F_FAST = 8;
export const F_FASTFALL = 16;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export interface CulbuteTick {
  /** L'image du combat : c'est elle qui date les positions */
  f: number;
  /** Pour chaque combattant humain : la dernière commande prise en compte (son numéro), et l'heure de son envoi */
  k: number[];
  c: number[];
  /** Chaque combattant : FIGHTER_STRIDE nombres (voir packFighter) */
  p: number[];
  /** Ce qui vole : id, sorte, x, y, vx, vy, lanceur, âge */
  j: number[];
  /** Les objets par terre ou qui tombent : id, sorte, x, y, posé (1) ou non */
  i: number[];
  /** Les pièges posés : id, x, y, poseur */
  r: number[];
  /** Le temps qui reste (au temps), en secondes */
  tl: number;
  /** La phase du combat : 0 introduction, 1 combat, 2 fini */
  ph: number;
  e: FightEvent[];
  /** Son propre combattant, en entier (envoyé à chacun le sien) */
  m?: number[];
}

export function packFighter(ft: Fighter, frame: number): number[] {
  const flags =
    (ft.intangUntil > frame ? F_INTANG : 0) |
    (ft.hitstop > 0 ? F_STOP : 0) |
    (ft.creamUntil > frame ? F_CREAM : 0) |
    (ft.fastUntil > frame ? F_FAST : 0) |
    (ft.fastfall ? F_FASTFALL : 0);
  return [
    r3(ft.x),
    r3(ft.y),
    ft.face,
    STATE_CODE.get(ft.state) ?? 0,
    MOVE_CODE.get(ft.move) ?? 0,
    ft.mt,
    Math.round(ft.dmg * 10) / 10,
    ft.stocks,
    ft.score,
    flags,
    Math.round(ft.shield),
    ITEM_CODE.get(ft.item) ?? 0,
    ft.charge,
    ft.t,
    Math.round(Math.hypot(ft.kx, ft.ky) * 10) / 10,
  ];
}

/** Ce qu'on voit d'un combattant, déballé */
export interface FighterNet {
  x: number;
  y: number;
  face: 1 | -1;
  state: Fighter["state"];
  move: string;
  mt: number;
  dmg: number;
  stocks: number;
  score: number;
  flags: number;
  shield: number;
  item: ItemKind | "";
  charge: number;
  t: number;
  /** La vitesse d'éjection (pour la pose de celui qui vole) */
  kb: number;
}

export function unpackFighter(p: number[], i: number): FighterNet {
  const o = i * FIGHTER_STRIDE;
  return {
    x: p[o]!,
    y: p[o + 1]!,
    face: p[o + 2]! < 0 ? -1 : 1,
    state: STATES[p[o + 3]!] ?? "stand",
    move: MOVE_KEYS[p[o + 4]!] ?? "",
    mt: p[o + 5]!,
    dmg: p[o + 6]!,
    stocks: p[o + 7]!,
    score: p[o + 8]!,
    flags: p[o + 9]!,
    shield: p[o + 10]!,
    item: HELD_ITEMS[p[o + 11]!] ?? "",
    charge: p[o + 12]!,
    t: p[o + 13]!,
    kb: p[o + 14]!,
  };
}

/**
 * Tout ce qu'il faut pour recalculer son combattant à l'identique : l'ordre des champs est fixe (FULL_FIELDS), les
 * textes deviennent des numéros
 */
const FULL_FIELDS = [
  "x",
  "y",
  "vx",
  "vy",
  "kx",
  "ky",
  "face",
  "ground",
  "t",
  "mt",
  "charge",
  "jumps",
  "dropUntil",
  "dmg",
  "shield",
  "hitstop",
  "stun",
  "intangUntil",
  "itemUses",
  "ledge",
  "ledgeLock",
  "buf",
  "bufT",
  "px",
  "py",
  "ph",
  "fastUntil",
  "creamUntil",
  "wait",
  "lastKb",
  "lastBy",
  "lastAt",
] as const satisfies readonly (keyof Fighter)[];

export function packFull(ft: Fighter): number[] {
  const out: number[] = FULL_FIELDS.map((k) => r4(ft[k] as number));
  out.push(
    STATE_CODE.get(ft.state) ?? 0,
    MOVE_CODE.get(ft.move) ?? 0,
    ITEM_CODE.get(ft.item) ?? 0,
    (ft.airdodged ? 1 : 0) | (ft.sideUsed ? 2 : 0) | (ft.fastfall ? 4 : 0) | (ft.ledgeFresh ? 8 : 0),
    // Ceux que le coup en cours a déjà touchés (et quand) : l'appareil ne les touche pas une deuxième fois
    ft.hitIds.length,
    ...ft.hitIds,
    ...ft.hitAt,
  );
  return out;
}

/** Remet dans `ft` l'état reçu (le reste, comme son identité, ne change pas) */
export function unpackFull(ft: Fighter, p: number[]) {
  FULL_FIELDS.forEach((k, i) => {
    (ft as unknown as Record<string, number>)[k] = p[i]!;
  });
  const n = FULL_FIELDS.length;
  ft.state = STATES[p[n]!] ?? "stand";
  ft.move = MOVE_KEYS[p[n + 1]!] ?? "";
  ft.item = HELD_ITEMS[p[n + 2]!] ?? "";
  const b = p[n + 3]!;
  ft.airdodged = (b & 1) !== 0;
  ft.sideUsed = (b & 2) !== 0;
  ft.fastfall = (b & 4) !== 0;
  ft.ledgeFresh = (b & 8) !== 0;
  const hits = p[n + 4] ?? 0;
  ft.hitIds = p.slice(n + 5, n + 5 + hits);
  ft.hitAt = p.slice(n + 5 + hits, n + 5 + 2 * hits);
  ft.face = ft.face < 0 ? -1 : 1;
  ft.hitIds = [];
  ft.hitAt = [];
}

/** Tout ce qui bouge, à cette image (sans le combattant complet de chacun, ajouté à part) */
export function encodeTick(f: Fight, events: FightEvent[], acks: number[], stamps: number[]): Omit<CulbuteTick, "m"> {
  const p: number[] = [];
  for (const ft of f.fighters) p.push(...packFighter(ft, f.frame));
  const j: number[] = [];
  for (const q of f.projectiles) j.push(q.id, SHOT_CODE.get(q.kind) ?? 0, r3(q.x), r3(q.y), r3(q.vx), r3(q.vy), q.owner, q.t);
  const i: number[] = [];
  for (const it of f.items) i.push(it.id, ITEM_CODE.get(it.kind) ?? 0, r3(it.x), r3(it.y), it.ground ? 1 : 0);
  const r: number[] = [];
  for (const t of f.traps) r.push(t.id, r3(t.x), r3(t.y), t.owner);
  const ph = f.phase === "intro" ? 0 : f.phase === "fight" ? 1 : 2;
  return { f: f.frame, k: acks, c: stamps, p, j, i, r, tl: Math.ceil(timeLeft(f)), ph, e: events };
}
