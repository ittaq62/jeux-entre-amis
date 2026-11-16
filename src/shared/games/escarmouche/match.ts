// Une partie d'Escarmouche, telle que le serveur la mène : les soldats, leurs balles (cherchées là où le tireur voyait
// ses cibles), les grenades, les éliminations et les retours au combat, la zone, les drapeaux, et la fin.

import { getMap, MAP_IDS, type MapId } from "./maps.ts";
import { goalOf, MODE_INFO, type EscarmoucheSettings, type Mode } from "./rules.ts";
import {
  defOf,
  DT,
  eyeOf,
  forward,
  heightOf,
  newSoldier,
  respawnSoldier,
  stepSoldier,
  type Cmd,
  type Soldier,
  type StepOut,
} from "./soldier.ts";
import {
  damageAt,
  GRENADE,
  isPrimaryId,
  isSecondaryId,
  KNIFE,
  type PrimaryId,
  type ExtraId,
  type MuzzleId,
  type SecondaryId,
  type WeaponId,
} from "./weapons.ts";
import { rayBox, World } from "./world.ts";
import { random, type RngHolder } from "../../rng.ts";

export const COUNTDOWN = 4;
export const RESPAWN = 4;
export const SHIELD = 1.5;
export const MAX_HP = 100;
const REGEN_DELAY = 4.5;
const REGEN_RATE = 30;
const ASSIST_WINDOW = 8;
const FLAG_REACH = 1.4;
const FLAG_RETURN = 20;
/** Les points de chacun au tableau */
export const POINTS = { kill: 10, assist: 4, capture: 30, take: 5, ret: 10, zone: 1, revive: 6, flag: 20, neutral: 10 };
/**
 * La conquête : un drapeau se prend en restant tout près (r, dy), d'autant plus vite qu'on y est nombreux (jusqu'à
 * `max`) ; laissé seul, il revient peu à peu à qui le tenait. L'équipe qui tient plus de drapeaux que l'autre lui fait
 * perdre un ticket toutes les `bleed` secondes par drapeau d'avance.
 */
export const CONQUEST = { r: 5, dy: 3, speed: 1 / 6, back: 1 / 12, bleed: 5, max: 3 };
export const POINT_NAMES = ["A", "B", "C"] as const;
/** Relever un coéquipier tombé : s'accroupir tout près de lui, un moment ; il repart avec un peu de vie */
export const REVIVE = { reach: 1.7, time: 1.4, hp: 60, near: 15, wait: 8 };
/** Revenir auprès d'un coéquipier : seulement s'il n'est pas au combat depuis quelques secondes */
export const TEAMSPAWN = { calm: 3, gap: 1.3 };
/** Une balle ne va pas plus loin */
const RANGE = 300;

export type KillWeapon = WeaponId | "grenade" | "couteau" | "chute" | "bidon" | "mortier";

/** Les bidons d'essence : ce qu'ils encaissent, leur souffle, le temps avant qu'un autre ne les remplace */
export const BARREL = { hp: 45, radius: 6, damage: 120, back: 40, chain: 0.18 };
/**
 * Les caisses en bois : elles volent en éclats sous une explosion (le souffle compte `blast` fois), ou à force de
 * balles (chacune compte `bullet` de ses dégâts) ; celles qui étaient posées dessus tombent avec. Une caisse neuve
 * revient au bout de `back` secondes, quand personne ne se tient à sa place.
 */
export const CRATE = { hp: 80, bullet: 0.35, blast: 2, back: 45 };
/** Les récompenses de série : à 3 éliminations d'affilée, les jumelles ; à 5, un tir de mortier */
export const REWARDS = { scout: 3, scoutTime: 10, mortar: 5, shells: 3, shellDelay: 2.6, shellGap: 0.55, radius: 7, damage: 140 };
/** Repérer : combien de temps le repère reste, l'angle autour du viseur, l'attente entre deux */
export const SPOT = { time: 7, cone: 0.07, range: 120, cooldown: 1.5 };

/** Une partie de corps touchée : 0 la tête, 1 le tronc, 2 les jambes */
export type Part = 0 | 1 | 2;

export type EscEvent =
  /** Une balle : d'où elle part (le tireur `i`), où elle s'arrête ; `n` la face du mur touché (1 à 6), 0 : rien ou un soldat */
  | { k: "shot"; i: number; w: WeaponId; x: number; y: number; z: number; n: number }
  | { k: "hit"; a: number; v: number; d: number; p: Part; x: number; y: number; z: number }
  | { k: "kill"; a: number; v: number; w: KillWeapon; h: boolean; as: number }
  | { k: "spawn"; i: number; on?: number; fl?: number }
  /** `i` a relevé son coéquipier `v` */
  | { k: "revive"; i: number; v: number }
  | { k: "throw"; i: number }
  | { k: "boom"; i: number; x: number; y: number; z: number; w?: "bidon" | "obus" }
  /** Un bidon saute (ou un nouveau le remplace) */
  | { k: "barrel"; b: number; up: boolean }
  /** Une caisse en bois (sa boîte) vole en éclats, ou revient */
  | { k: "crate"; b: number; up: boolean }
  /** Des ennemis viennent d'être repérés, par un soldat ou par les jumelles */
  | { k: "spot"; i: number; v: number[] }
  /** Une récompense de série */
  | { k: "reward"; i: number; r: "jumelles" | "mortier" }
  /** Un obus de mortier arrive ici dans `in` secondes */
  | { k: "shell"; x: number; z: number; in: number }
  | { k: "knife"; i: number; v: number }
  | { k: "reload"; i: number }
  | { k: "flag"; f: "take" | "drop" | "return" | "capture"; team: number; i: number }
  | { k: "zone"; owner: number; contested: boolean }
  /** Conquête : le drapeau `p` change de mains (`owner` -1 : neutralisé), il était à `was` */
  | { k: "cq"; p: number; owner: number; was: number }
  | { k: "streak"; i: number; n: number }
  | { k: "live" }
  | { k: "over" };

export interface FighterStats {
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damage: number;
  shots: number;
  hits: number;
  captures: number;
  returns: number;
  zone: number;
  best: number;
  knives: number;
  grenadeKills: number;
  revives: number;
}

export interface Fighter {
  id: string;
  /** L'équipe (0 ou 1) ; en chacun pour soi, son propre numéro */
  team: number;
  bot: boolean;
  s: Soldier;
  hp: number;
  respawnAt: number;
  shieldUntil: number;
  hurtAt: number;
  /** L'arme principale de sa prochaine vie */
  next: PrimaryId;
  /** L'arme de poing de sa prochaine vie */
  nextSecondary: SecondaryId;
  /** Les accessoires de sa prochaine vie */
  nextMuzzle: MuzzleId;
  nextExtra: ExtraId;
  /** Ceux qui l'ont touché depuis sa dernière mort (pour les passes décisives) */
  damagers: { i: number; at: number }[];
  /** Le drapeau qu'il porte (l'équipe à qui il est), -1 s'il n'en porte pas */
  carrying: number;
  points: number;
  streak: number;
  /** Quand il pourra repérer de nouveau */
  spotReady: number;
  /** Le coéquipier tombé qu'il relève (-1 aucun), et depuis combien de temps */
  reviving: number;
  reviveT: number;
  /** Auprès de qui il veut revenir au combat (-1 : à la base) */
  spawnOn: number;
  /** Tombé : quand, et s'il a choisi de revenir sans attendre qu'on le relève */
  diedAt: number;
  giveUp: boolean;
  /** Son dernier coup tiré ou reçu : il est « au combat » quelques secondes après */
  lastFight: number;
  stats: FighterStats;
}

/** Un bidon d'essence : sa boîte dans le monde, ce qu'il encaisse encore, et quand il sera remplacé s'il a sauté */
export interface Barrel {
  box: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  downUntil: number;
}

/** Une caisse en bois : sa boîte dans le monde, ce qu'elle encaisse encore, et quand elle reviendra si elle est cassée */
export interface Crate {
  box: number;
  hp: number;
  downUntil: number;
}

/** Une explosion à venir (un bidon qui s'enflamme, un obus qui tombe) */
export interface Blast {
  at: number;
  x: number;
  y: number;
  z: number;
  owner: number;
  kind: "bidon" | "obus";
  barrel: number;
}

/** Un ennemi repéré : pour l'équipe (ou, en chacun pour soi, pour celui qui l'a repéré) */
export interface Mark {
  target: number;
  team: number;
  by: number;
  until: number;
}

export interface Grenade {
  id: number;
  owner: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  boom: number;
}

export interface FlagState {
  at: "home" | "carried" | "dropped";
  carrier: number;
  x: number;
  y: number;
  z: number;
  since: number;
}

export interface Match extends RngHolder {
  map: MapId;
  mode: Mode;
  settings: EscarmoucheSettings;
  t: number;
  phase: "countdown" | "live" | "over";
  liveAt: number;
  endAt: number;
  goal: number;
  fighters: Fighter[];
  grenades: Grenade[];
  nextGrenade: number;
  /** Le score de chaque équipe (modes en équipes) */
  scores: [number, number];
  flags: [FlagState, FlagState] | null;
  zone: { owner: number; contested: boolean; acc: [number, number] } | null;
  /** Conquête : chaque drapeau (son équipe, -1 personne ; sa jauge de -1, aux rouges, à 1, aux bleus) */
  cq: { pts: CqPoint[]; bleed: [number, number] } | null;
  /** À la fin : l'équipe gagnante (ou le soldat, en chacun pour soi), null pour une égalité */
  winner: number | null;
  ranks: number[] | null;
  barrels: Barrel[];
  crates: Crate[];
  blasts: Blast[];
  marks: Mark[];
}

export interface CqPoint {
  owner: number;
  v: number;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  crouch: boolean;
  alive: boolean;
}

/** Où étaient les soldats au moment où le tireur les voyait (retour dans le temps) ; null : là où ils sont */
export type PoseAt = (vt: number) => ((i: number) => Pose | null) | null;

const worlds = new Map<MapId, World>();
export function worldOf(map: MapId): World {
  let w = worlds.get(map);
  if (!w) {
    w = new World(getMap(map).boxes);
    worlds.set(map, w);
  }
  return w;
}

export const isTeamMode = (mode: Mode) => MODE_INFO[mode].teams;

function newStats(): FighterStats {
  return {
    kills: 0,
    deaths: 0,
    assists: 0,
    headshots: 0,
    damage: 0,
    shots: 0,
    hits: 0,
    captures: 0,
    returns: 0,
    zone: 0,
    best: 0,
    knives: 0,
    grenadeKills: 0,
    revives: 0,
  };
}

/** L'arme permise par l'arsenal de la partie */
export function allowedPrimary(settings: EscarmoucheSettings, want: PrimaryId): WeaponId {
  if (settings.arsenal === "precision") return "precision";
  if (settings.arsenal === "pompe") return "pompe";
  if (settings.arsenal === "pistolet") return "pistolet";
  return want;
}

/** L'arme de poing permise par l'arsenal (en duel au pistolet, tout le monde a le même) */
export function allowedSecondary(settings: EscarmoucheSettings, want: SecondaryId): SecondaryId {
  return settings.arsenal === "pistolet" ? "pistolet" : want;
}

export interface FighterInit {
  id: string;
  team: number;
  bot: boolean;
  primary: PrimaryId;
  secondary?: SecondaryId;
  muzzle?: MuzzleId;
  extra?: ExtraId;
}

export function createMatch(settings: EscarmoucheSettings, players: FighterInit[], seed: number): Match {
  const holder: RngHolder = { rng: seed >>> 0 };
  const map = settings.map === "hasard" ? MAP_IDS[Math.floor(random(holder) * MAP_IDS.length)]! : settings.map;
  const teams = isTeamMode(settings.mode);
  const m: Match = {
    rng: holder.rng,
    map,
    mode: settings.mode,
    settings: { ...settings, map },
    t: 0,
    phase: "countdown",
    liveAt: COUNTDOWN,
    endAt: COUNTDOWN + settings.minutes * 60,
    goal: goalOf(settings),
    fighters: [],
    grenades: [],
    nextGrenade: 1,
    scores: [0, 0],
    flags: null,
    zone: null,
    cq: null,
    winner: null,
    ranks: null,
    barrels: [],
    crates: [],
    blasts: [],
    marks: [],
  };
  const gm = getMap(map);
  gm.boxes.forEach((b, box) => {
    if (b.m === "bidon") m.barrels.push({ box, x: (b.x0 + b.x1) / 2, y: b.y0 + 0.5, z: (b.z0 + b.z1) / 2, hp: BARREL.hp, downUntil: 0 });
    if (b.m === "caisse") m.crates.push({ box, hp: CRATE.hp, downUntil: 0 });
  });
  if (settings.mode === "drapeau") {
    m.flags = [0, 1].map((t) => ({ at: "home", carrier: -1, ...gm.flags[t]!, since: 0 })) as [FlagState, FlagState];
  }
  if (settings.mode === "zone") m.zone = { owner: -1, contested: false, acc: [0, 0] };
  if (settings.mode === "conquete") {
    // Chaque équipe tient déjà le drapeau de son côté ; celui du centre est à prendre. Les tickets partent du haut.
    m.cq = {
      pts: [
        { owner: 0, v: -1 },
        { owner: -1, v: 0 },
        { owner: 1, v: 1 },
      ],
      bleed: [0, 0],
    };
    m.scores = [m.goal, m.goal];
  }
  players.forEach((p, i) => {
    const team = teams ? (p.team === 1 ? 1 : 0) : i;
    const f: Fighter = {
      id: p.id,
      team,
      bot: p.bot,
      s: newSoldier(
        0,
        0,
        0,
        0,
        allowedPrimary(settings, p.primary),
        GRENADE.count,
        allowedSecondary(settings, p.secondary ?? "pistolet"),
        p.muzzle ?? "aucun",
        p.extra ?? "aucun",
      ),
      hp: MAX_HP,
      respawnAt: 0,
      shieldUntil: 0,
      hurtAt: -100,
      next: isPrimaryId(p.primary) ? p.primary : "fa",
      nextSecondary: isSecondaryId(p.secondary) ? p.secondary : "pistolet",
      nextMuzzle: p.muzzle ?? "aucun",
      nextExtra: p.extra ?? "aucun",
      damagers: [],
      carrying: -1,
      points: 0,
      streak: 0,
      spotReady: 0,
      reviving: -1,
      reviveT: 0,
      spawnOn: -1,
      diedAt: -100,
      giveUp: false,
      lastFight: -100,
      stats: newStats(),
    };
    m.fighters.push(f);
  });
  // Chacun part d'un point de sa base (ou d'un point au hasard en chacun pour soi), sans se marcher dessus
  const used = new Set<string>();
  m.fighters.forEach((f, i) => {
    const list = teams ? gm.spawns[f.team]! : gm.ffa;
    let sp = list[i % list.length]!;
    for (let k = 0; k < list.length && used.has(`${sp.x},${sp.z}`); k++) sp = list[(i + k + 1) % list.length]!;
    used.add(`${sp.x},${sp.z}`);
    placeAt(f, sp.x, sp.y, sp.z, sp.yaw, m);
    f.shieldUntil = 0;
  });
  return m;
}

function placeAt(f: Fighter, x: number, y: number, z: number, yaw: number, m: Match) {
  respawnSoldier(
    f.s,
    x,
    y,
    z,
    yaw,
    allowedPrimary(m.settings, f.next),
    allowedSecondary(m.settings, f.nextSecondary),
    f.nextMuzzle ?? "aucun",
    f.nextExtra ?? "aucun",
  );
  f.hp = MAX_HP;
  f.damagers = [];
  f.carrying = -1;
  f.shieldUntil = m.t + SHIELD;
  f.hurtAt = -100;
}

/**
 * Une partie relue après un redémarrage (une mise en ligne) a pu être créée par une version d'avant : on lui ajoute ce
 * qui lui manque (les bidons, les explosions à venir, les repères ; la glissade et l'escalade de chaque soldat)
 */
export function upgradeMatch(m: Match): Match {
  if (!Array.isArray(m.barrels)) {
    m.barrels = [];
    getMap(m.map).boxes.forEach((b, box) => {
      if (b.m === "bidon") m.barrels.push({ box, x: (b.x0 + b.x1) / 2, y: b.y0 + 0.5, z: (b.z0 + b.z1) / 2, hp: BARREL.hp, downUntil: 0 });
    });
  }
  if (!Array.isArray(m.blasts)) m.blasts = [];
  if (!Array.isArray(m.crates)) {
    m.crates = [];
    getMap(m.map).boxes.forEach((b, box) => {
      if (b.m === "caisse") m.crates.push({ box, hp: CRATE.hp, downUntil: 0 });
    });
  }
  if (!Array.isArray(m.marks)) m.marks = [];
  if (m.cq === undefined) m.cq = null;
  const fresh = newSoldier(0, 0, 0, 0, "fa");
  for (const f of m.fighters) {
    if (typeof f.spotReady !== "number") f.spotReady = 0;
    if (typeof f.reviving !== "number") f.reviving = -1;
    if (typeof f.reviveT !== "number") f.reviveT = 0;
    if (typeof f.spawnOn !== "number") f.spawnOn = -1;
    if (typeof f.lastFight !== "number") f.lastFight = -100;
    if (typeof f.diedAt !== "number") f.diedAt = -100;
    if (typeof f.giveUp !== "boolean") f.giveUp = false;
    if (!f.nextMuzzle) f.nextMuzzle = "aucun";
    if (!f.nextExtra) f.nextExtra = "aucun";
    if (typeof f.stats.revives !== "number") f.stats.revives = 0;
    for (const k of Object.keys(fresh) as (keyof Soldier)[]) {
      if (f.s[k] === undefined) (f.s as unknown as Record<string, unknown>)[k] = fresh[k];
    }
  }
  return m;
}

export function fighterIndex(m: Match, id: string): number {
  return m.fighters.findIndex((f) => f.id === id);
}

function enemies(m: Match, a: number, b: number): boolean {
  if (a === b) return false;
  if (!isTeamMode(m.mode)) return true;
  return m.fighters[a]!.team !== m.fighters[b]!.team;
}

/** La boîte d'une partie du corps : tête, tronc, jambes */
export function partBox(
  p: { x: number; y: number; z: number; crouch: boolean },
  part: Part,
): [number, number, number, number, number, number] {
  const h = heightOf(p);
  if (part === 0) return [p.x - 0.16, p.y + h - 0.3, p.z - 0.16, p.x + 0.16, p.y + h + 0.02, p.z + 0.16];
  if (part === 1) return [p.x - 0.27, p.y + h * 0.48, p.z - 0.27, p.x + 0.27, p.y + h - 0.3, p.z + 0.27];
  return [p.x - 0.22, p.y, p.z - 0.22, p.x + 0.22, p.y + h * 0.48, p.z + 0.22];
}

/** Un rayon contre un soldat : la partie touchée la plus proche, ou null */
export function rayFighter(
  ox: number,
  oy: number,
  oz: number,
  d: [number, number, number],
  pose: Pose,
  max: number,
): { t: number; part: Part } | null {
  let best: { t: number; part: Part } | null = null;
  for (const part of [0, 1, 2] as Part[]) {
    const b = partBox(pose, part);
    const hit = rayBox(ox, oy, oz, d[0], d[1], d[2], b[0], b[1], b[2], b[3], b[4], b[5], best ? best.t : max);
    if (hit && (!best || hit.t < best.t)) best = { t: hit.t, part };
  }
  return best;
}

function poseOf(f: Fighter): Pose {
  return { x: f.s.x, y: f.s.y, z: f.s.z, crouch: f.s.crouch, alive: f.s.alive };
}

/**
 * Le serveur joue une commande d'un soldat : son pas, puis ce que son arme a fait. Les balles cherchent leurs cibles là
 * où le tireur les voyait (`poseAt(cmd.vt)`), sans remonter plus loin que ce que la salle garde.
 */
export function applyCmd(m: Match, i: number, cmd: Cmd, poseAt: PoseAt | null, ev: EscEvent[]): StepOut {
  const f = m.fighters[i]!;
  const world = matchWorld(m);
  const out = stepSoldier(f.s, cmd, world, m.phase === "live");
  if (!f.s.alive) return out;
  const past = out.shots.length > 0 || out.melee ? (poseAt?.(cmd.vt) ?? null) : null;
  const pose = (j: number): Pose | null => {
    const g = m.fighters[j]!;
    if (!g.s.alive) return null;
    return past ? past(j) : poseOf(g);
  };
  if (out.shots.length > 0) f.shieldUntil = 0;
  for (const shot of out.shots) {
    f.stats.shots += 1;
    f.lastFight = m.t;
    const w = defOf(f.s, shot.weapon);
    let anyHit = false;
    shot.dirs.forEach((d, p) => {
      const wall = world.raycast(shot.ox, shot.oy, shot.oz, d[0], d[1], d[2], RANGE);
      let tMax = wall ? wall.t : RANGE;
      let target = -1;
      let part: Part = 1;
      for (let j = 0; j < m.fighters.length; j++) {
        if (!enemies(m, i, j)) continue;
        const pj = pose(j);
        if (!pj?.alive) continue;
        const hit = rayFighter(shot.ox, shot.oy, shot.oz, d, pj, tMax);
        if (hit && hit.t < tMax) {
          tMax = hit.t;
          target = j;
          part = hit.part;
        }
      }
      const x = shot.ox + d[0] * tMax;
      const y = shot.oy + d[1] * tMax;
      const z = shot.oz + d[2] * tMax;
      if (p < 4) {
        const n = target < 0 && wall && tMax === wall.t ? 1 + wall.axis * 2 + (wall.sign > 0 ? 1 : 0) : 0;
        ev.push({ k: "shot", i, w: shot.weapon, x: r2(x), y: r2(y), z: r2(z), n });
      }
      const struck = target < 0 && wall && tMax === wall.t ? world.boxes[wall.box] : undefined;
      if (struck?.m === "bidon") hitBarrel(m, wall!.box, damageAt(w, tMax), i);
      else if (struck?.m === "caisse") hitCrate(m, wall!.box, damageAt(w, tMax) * CRATE.bullet, ev);
      if (target >= 0) {
        anyHit = true;
        const base = damageAt(w, tMax);
        const mult = part === 0 ? w.head : part === 2 ? w.legs : 1;
        hurt(m, target, i, base * mult, part, shot.weapon, ev, x, y, z);
      }
    });
    if (anyHit) f.stats.hits += 1;
  }
  if (out.melee) {
    const [fx, , fz] = forward(f.s.yaw, 0);
    let best = -1;
    let bestD = KNIFE.reach;
    for (let j = 0; j < m.fighters.length; j++) {
      if (!enemies(m, i, j)) continue;
      const pj = pose(j);
      if (!pj?.alive) continue;
      const dx = pj.x - f.s.x;
      const dz = pj.z - f.s.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestD || Math.abs(pj.y - f.s.y) > 1.2) continue;
      if (dist > 0.01 && (dx * fx + dz * fz) / dist < KNIFE.cone) continue;
      best = j;
      bestD = dist;
    }
    ev.push({ k: "knife", i, v: best });
    if (best >= 0) {
      const v = m.fighters[best]!;
      const [vx, , vz] = forward(v.s.yaw, 0);
      const back = vx * fx + vz * fz > 0.5;
      const pj = pose(best)!;
      hurt(m, best, i, back ? KNIFE.back : KNIFE.damage, 1, "couteau", ev, pj.x, pj.y + 1.1, pj.z);
    }
  }
  if (out.grenade) {
    const g = out.grenade;
    m.grenades.push({ id: m.nextGrenade++, owner: i, ...g, boom: m.t + GRENADE.fuse });
    ev.push({ k: "throw", i });
  }
  if (out.reloaded) ev.push({ k: "reload", i });
  if (out.spot && m.phase === "live") spot(m, i, world, ev);
  return out;
}

/** Repérer : les ennemis visibles tout près du viseur sont marqués pour son équipe quelques secondes */
function spot(m: Match, i: number, world: World, ev: EscEvent[]) {
  const f = m.fighters[i]!;
  if (m.t < f.spotReady) return;
  f.spotReady = m.t + SPOT.cooldown;
  const s = f.s;
  const ex = s.x;
  const ey = eyeOf(s);
  const ez = s.z;
  const [dx, dy, dz] = forward(s.yaw, s.pitch);
  const seen: number[] = [];
  for (let j = 0; j < m.fighters.length; j++) {
    if (!enemies(m, i, j)) continue;
    const g = m.fighters[j]!;
    if (!g.s.alive) continue;
    const cy = g.s.y + heightOf(g.s) * 0.7;
    const vx = g.s.x - ex;
    const vy = cy - ey;
    const vz = g.s.z - ez;
    const dist = Math.hypot(vx, vy, vz);
    if (dist > SPOT.range || dist < 0.1) continue;
    const cos = (vx * dx + vy * dy + vz * dz) / dist;
    if (Math.acos(Math.min(1, cos)) > SPOT.cone + 0.6 / dist) continue;
    if (!world.clear(ex, ey, ez, g.s.x, cy, g.s.z)) continue;
    mark(m, j, i, SPOT.time);
    seen.push(j);
  }
  if (seen.length > 0) ev.push({ k: "spot", i, v: seen });
}

function mark(m: Match, target: number, by: number, time: number) {
  const team = m.fighters[by]!.team;
  const known = m.marks.find((k) => k.target === target && k.team === team && (isTeamMode(m.mode) || k.by === by));
  if (known) known.until = Math.max(known.until, m.t + time);
  else m.marks.push({ target, team, by, until: m.t + time });
}

/** Un bidon touché : il encaisse, puis s'enflamme et saute un instant après */
function hitBarrel(m: Match, box: number, dmg: number, by: number) {
  const b = m.barrels.find((k) => k.box === box);
  if (!b || b.downUntil > 0 || b.hp <= 0) return;
  b.hp -= dmg;
  if (b.hp <= 0) m.blasts.push({ at: m.t + BARREL.chain, x: b.x, y: b.y, z: b.z, owner: by, kind: "bidon", barrel: box });
}

/** Une caisse touchée : elle encaisse, puis vole en éclats */
function hitCrate(m: Match, box: number, dmg: number, ev: EscEvent[]) {
  const c = m.crates.find((k) => k.box === box);
  if (!c || c.downUntil > 0) return;
  c.hp -= dmg;
  if (c.hp <= 0) breakCrate(m, c, ev);
}

/** Une caisse vole en éclats ; celles qui étaient posées dessus tombent avec elle */
function breakCrate(m: Match, c: Crate, ev: EscEvent[]) {
  if (c.downUntil > 0) return;
  c.hp = 0;
  c.downUntil = m.t + CRATE.back;
  ev.push({ k: "crate", b: c.box, up: false });
  const boxes = getMap(m.map).boxes;
  const b = boxes[c.box]!;
  for (const o of m.crates) {
    const a = boxes[o.box]!;
    if (o.downUntil > 0 || Math.abs(a.y0 - b.y1) > 0.05) continue;
    if (a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0) breakCrate(m, o, ev);
  }
}

/** Les caisses cassées qui reviennent : quand leur temps est passé, que rien ne manque dessous et que la place est libre */
function stepCrates(m: Match, ev: EscEvent[]) {
  const boxes = getMap(m.map).boxes;
  for (const c of m.crates) {
    if (c.downUntil <= 0 || m.t < c.downUntil) continue;
    const b = boxes[c.box]!;
    const under = m.crates.some((o) => {
      const a = boxes[o.box]!;
      return o.downUntil > 0 && Math.abs(b.y0 - a.y1) < 0.05 && a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
    });
    const taken = m.fighters.some(
      (f) =>
        f.s.alive &&
        f.s.x + 0.4 > b.x0 &&
        f.s.x - 0.4 < b.x1 &&
        f.s.z + 0.4 > b.z0 &&
        f.s.z - 0.4 < b.z1 &&
        f.s.y < b.y1 &&
        f.s.y + 1.9 > b.y0,
    );
    if (under || taken) {
      c.downUntil = m.t + 1;
      continue;
    }
    c.downUntil = 0;
    c.hp = CRATE.hp;
    ev.push({ k: "crate", b: c.box, up: true });
  }
}

const holed = new Map<string, World>();
/**
 * Le monde d'une carte sans certaines boîtes (les caisses cassées) : les mêmes numéros de boîtes, celles qui manquent
 * enfouies loin sous le sol. Le serveur et l'écran (pour prévoir ses pas) s'en servent de la même façon.
 */
export function worldWithout(map: MapId, gone: readonly number[]): World {
  if (gone.length === 0) return worldOf(map);
  const key = `${map}:${[...gone].sort((a, b) => a - b).join(",")}`;
  let w = holed.get(key);
  if (!w) {
    const set = new Set(gone);
    w = new World(getMap(map).boxes.map((b, i) => (set.has(i) ? { ...b, y0: -80, y1: -79.9 } : b)));
    if (holed.size >= 32) holed.delete(holed.keys().next().value!);
    holed.set(key, w);
  }
  return w;
}

/** Le monde de cette partie : la carte, moins ses caisses cassées */
export function matchWorld(m: Match): World {
  if (!m.crates.some((c) => c.downUntil > 0)) return worldOf(m.map);
  return worldWithout(
    m.map,
    m.crates.filter((c) => c.downUntil > 0).map((c) => c.box),
  );
}

/** Le souffle d'une explosion : les soldats à portée (sauf derrière un mur), et les bidons voisins */
function blast(
  m: Match,
  world: World,
  x: number,
  y: number,
  z: number,
  owner: number,
  radius: number,
  damage: number,
  w: KillWeapon,
  self: number,
  ev: EscEvent[],
) {
  for (let j = 0; j < m.fighters.length; j++) {
    const f = m.fighters[j]!;
    if (!f.s.alive) continue;
    const cy = f.s.y + heightOf(f.s) * 0.6;
    const dist = Math.hypot(f.s.x - x, cy - y, f.s.z - z);
    if (dist >= radius) continue;
    // Un mur entre l'explosion et le soldat le protège (sa tête comme son buste)
    if (!world.clear(x, y, z, f.s.x, cy, f.s.z) && !world.clear(x, y + 0.1, z, f.s.x, eyeOf(f.s), f.s.z)) continue;
    const k = 1 - dist / radius;
    const dmg = damage * (0.25 + 0.75 * k) * Math.min(1, k * 4) * (j === owner ? self : 1);
    hurt(m, j, owner, dmg, 1, w, ev, f.s.x, cy, f.s.z);
  }
  for (const b of m.barrels) {
    if (b.downUntil > 0 || b.hp <= 0) continue;
    const dist = Math.hypot(b.x - x, b.y - y, b.z - z);
    if (dist < radius * 0.8) hitBarrel(m, b.box, damage * (1 - dist / radius), owner);
  }
  // Les caisses : le souffle compte depuis leur point le plus proche
  const boxes = getMap(m.map).boxes;
  for (const c of m.crates) {
    if (c.downUntil > 0) continue;
    const b = boxes[c.box]!;
    const dist = Math.hypot(
      x - Math.max(b.x0, Math.min(b.x1, x)),
      y - Math.max(b.y0, Math.min(b.y1, y)),
      z - Math.max(b.z0, Math.min(b.z1, z)),
    );
    if (dist < radius * 0.8) hitCrate(m, c.box, damage * CRATE.blast * (1 - dist / radius), ev);
  }
}

/** Les explosions dues : les bidons, les obus ; et les bidons qui reviennent */
function stepBlasts(m: Match, world: World, ev: EscEvent[]) {
  for (const b of m.barrels) {
    if (b.downUntil > 0 && m.t >= b.downUntil) {
      b.downUntil = 0;
      b.hp = BARREL.hp;
      ev.push({ k: "barrel", b: b.box, up: true });
    }
  }
  if (m.blasts.length === 0) return;
  const due = m.blasts.filter((k) => m.t >= k.at);
  if (due.length === 0) return;
  m.blasts = m.blasts.filter((k) => m.t < k.at);
  for (const k of due) {
    if (k.kind === "bidon") {
      const b = m.barrels.find((q) => q.box === k.barrel);
      if (b) b.downUntil = m.t + BARREL.back;
      ev.push({ k: "barrel", b: k.barrel, up: false });
    }
    ev.push({ k: "boom", i: k.owner, x: r2(k.x), y: r2(k.y), z: r2(k.z), w: k.kind });
    if (k.kind === "bidon") blast(m, world, k.x, k.y, k.z, k.owner, BARREL.radius, BARREL.damage, "bidon", 0.6, ev);
    else blast(m, world, k.x, k.y, k.z, k.owner, REWARDS.radius, REWARDS.damage, "mortier", 0.5, ev);
  }
}

/**
 * Relever : un soldat accroupi tout près d'un coéquipier tombé (pas encore revenu à sa base) le relève au bout d'un
 * moment ; tant qu'on le relève, son retour à la base attend
 */
function stepRevive(m: Match, ev: EscEvent[]) {
  for (let r = 0; r < m.fighters.length; r++) {
    const f = m.fighters[r]!;
    let best = -1;
    if (f.s.alive && f.s.crouch && f.s.ground && f.s.mantleEnd === 0) {
      let bestD: number = REVIVE.reach;
      for (let v = 0; v < m.fighters.length; v++) {
        const g = m.fighters[v]!;
        if (v === r || g.s.alive || g.team !== f.team || g.s.y < -5) continue;
        const d = Math.hypot(g.s.x - f.s.x, g.s.z - f.s.z);
        if (d <= bestD && Math.abs(g.s.y - f.s.y) < 1.2) {
          best = v;
          bestD = d;
        }
      }
    }
    if (best < 0) {
      f.reviving = -1;
      f.reviveT = 0;
      continue;
    }
    if (f.reviving !== best) {
      f.reviving = best;
      f.reviveT = 0;
    }
    f.reviveT += DT;
    const g = m.fighters[best]!;
    g.respawnAt = Math.max(g.respawnAt, m.t + 0.3);
    if (f.reviveT >= REVIVE.time) {
      f.reviving = -1;
      f.reviveT = 0;
      placeAt(g, g.s.x, g.s.y, g.s.z, g.s.yaw, m);
      g.hp = REVIVE.hp;
      g.hurtAt = m.t;
      g.shieldUntil = m.t + 1;
      f.points += POINTS.revive;
      f.stats.revives += 1;
      ev.push({ k: "revive", i: r, v: best });
    }
  }
}

/** En équipe, un tombé attend un moment qu'on le relève si un coéquipier est tout près (sauf s'il préfère revenir) */
export function waitingRescue(m: Match, i: number): boolean {
  const f = m.fighters[i]!;
  if (!isTeamMode(m.mode) || f.giveUp || f.s.alive || m.t - f.diedAt > REVIVE.wait || f.s.y < -5) return false;
  return m.fighters.some((g, j) => j !== i && g.team === f.team && g.s.alive && Math.hypot(g.s.x - f.s.x, g.s.z - f.s.z) < REVIVE.near);
}

/** Il préfère revenir tout de suite plutôt qu'attendre qu'on le relève */
export function giveUp(m: Match, i: number) {
  const f = m.fighters[i];
  if (f && !f.s.alive) f.giveUp = true;
}

/** Une place libre tout près d'un coéquipier calme (derrière lui, puis à côté), ou null : on revient à la base */
function besideTeammate(m: Match, i: number, world: World): { x: number; y: number; z: number; yaw: number } | null {
  const f = m.fighters[i]!;
  if (!isTeamMode(m.mode) || f.spawnOn < 0) return null;
  const g = m.fighters[f.spawnOn];
  if (!g || f.spawnOn === i || g.team !== f.team || !g.s.alive || !g.s.ground || m.t - g.lastFight < TEAMSPAWN.calm) return null;
  const [fx, , fz] = forward(g.s.yaw, 0);
  const tries: [number, number][] = [
    [-fx, -fz],
    [-fz, fx],
    [fz, -fx],
    [-fx - fz, -fz + fx],
    [-fx + fz, -fz - fx],
  ];
  for (const [dx, dz] of tries) {
    const l = Math.hypot(dx, dz) || 1;
    const x = g.s.x + (dx / l) * TEAMSPAWN.gap;
    const z = g.s.z + (dz / l) * TEAMSPAWN.gap;
    const y = g.s.y;
    if (world.overlaps(x - 0.3, y + 0.02, z - 0.3, x + 0.3, y + 1.78, z + 0.3)) continue;
    // Il faut un sol sous les pieds
    if (!world.overlaps(x - 0.2, y - 0.1, z - 0.2, x + 0.2, y + 0.01, z + 0.2)) continue;
    if (!world.clear(g.s.x, y + 1, g.s.z, x, y + 1, z)) continue;
    return { x, y, z, yaw: g.s.yaw };
  }
  return null;
}

/** Le choix du retour au combat : auprès de ce coéquipier, ou à la base (-1) */
export function chooseSpawn(m: Match, i: number, target: number) {
  const f = m.fighters[i];
  if (!f) return;
  // Conquête : -2 pour A, -3 pour B, -4 pour C (on y reviendra s'il est à son équipe et pas attaqué)
  if (target <= -2) {
    f.spawnOn = m.cq && -2 - target < m.cq.pts.length ? target : -1;
    return;
  }
  const g = target >= 0 ? m.fighters[target] : null;
  f.spawnOn = g && target !== i && g.team === f.team && isTeamMode(m.mode) ? target : -1;
}

/** Les récompenses de série */
function reward(m: Match, a: number, ev: EscEvent[]) {
  const fa = m.fighters[a]!;
  if (fa.streak === REWARDS.scout) {
    // Les jumelles : tous les ennemis repérés un moment
    const seen: number[] = [];
    for (let j = 0; j < m.fighters.length; j++) {
      if (!enemies(m, a, j)) continue;
      mark(m, j, a, REWARDS.scoutTime);
      seen.push(j);
    }
    ev.push({ k: "reward", i: a, r: "jumelles" });
    if (seen.length > 0) ev.push({ k: "spot", i: a, v: seen });
  } else if (fa.streak === REWARDS.mortar) {
    // Le mortier : quelques obus sur les ennemis, annoncés un peu avant de tomber
    const targets = m.fighters.map((f, j) => ({ f, j })).filter(({ f, j }) => enemies(m, a, j) && f.s.alive);
    ev.push({ k: "reward", i: a, r: "mortier" });
    for (let k = 0; k < REWARDS.shells && targets.length > 0; k++) {
      const { f } = targets[Math.floor(random(m) * targets.length)]!;
      const x = f.s.x + (random(m) - 0.5) * 5;
      const z = f.s.z + (random(m) - 0.5) * 5;
      const delay = REWARDS.shellDelay + k * REWARDS.shellGap;
      m.blasts.push({ at: m.t + delay, x, y: f.s.y + 0.2, z, owner: a, kind: "obus", barrel: -1 });
      ev.push({ k: "shell", x: r2(x), z: r2(z), in: delay });
    }
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Des dégâts : rien sur un soldat qui vient d'arriver, rien entre coéquipiers */
export function hurt(
  m: Match,
  v: number,
  a: number,
  amount: number,
  part: Part,
  w: KillWeapon,
  ev: EscEvent[],
  x: number,
  y: number,
  z: number,
) {
  const fv = m.fighters[v]!;
  if (!fv.s.alive || m.phase !== "live") return;
  if (fv.shieldUntil > m.t && a !== v) return;
  if (a >= 0 && a !== v && !enemies(m, a, v)) return;
  const dmg = Math.round(amount * (m.settings.hardcore ? 1.5 : 1));
  if (dmg <= 0) return;
  fv.hp -= dmg;
  fv.hurtAt = m.t;
  fv.lastFight = m.t;
  if (a >= 0 && a !== v) {
    const fa = m.fighters[a]!;
    fa.stats.damage += Math.min(dmg, dmg + Math.min(0, fv.hp));
    const known = fv.damagers.find((d) => d.i === a);
    if (known) known.at = m.t;
    else fv.damagers.push({ i: a, at: m.t });
  }
  ev.push({ k: "hit", a, v, d: dmg, p: part, x: r2(x), y: r2(y), z: r2(z) });
  if (fv.hp <= 0) kill(m, v, a, w, part === 0, ev);
}

function kill(m: Match, v: number, a: number, w: KillWeapon, head: boolean, ev: EscEvent[]) {
  const fv = m.fighters[v]!;
  fv.hp = 0;
  fv.s.alive = false;
  fv.s.vx = fv.s.vz = 0;
  fv.respawnAt = m.t + RESPAWN;
  fv.diedAt = m.t;
  fv.giveUp = false;
  fv.stats.deaths += 1;
  fv.streak = 0;
  dropFlag(m, v, ev);
  let assist = -1;
  if (a >= 0 && a !== v) {
    const fa = m.fighters[a]!;
    fa.stats.kills += 1;
    if (head) fa.stats.headshots += 1;
    if (w === "couteau") fa.stats.knives += 1;
    if (w === "grenade") fa.stats.grenadeKills += 1;
    fa.points += POINTS.kill;
    fa.streak += 1;
    fa.stats.best = Math.max(fa.stats.best, fa.streak);
    if (fa.streak >= 3 && fa.streak % 2 === 1) ev.push({ k: "streak", i: a, n: fa.streak });
    reward(m, a, ev);
    if (m.mode === "equipes") m.scores[fa.team === 1 ? 1 : 0] += 1;
    for (const d of fv.damagers) {
      if (d.i === a || d.i === v || m.t - d.at > ASSIST_WINDOW) continue;
      const fd = m.fighters[d.i]!;
      fd.stats.assists += 1;
      fd.points += POINTS.assist;
      if (assist < 0) assist = d.i;
    }
  }
  fv.damagers = [];
  ev.push({ k: "kill", a, v, w, h: head, as: assist });
}

function dropFlag(m: Match, v: number, ev: EscEvent[]) {
  const fv = m.fighters[v]!;
  if (!m.flags || fv.carrying < 0) return;
  const flag = m.flags[fv.carrying]!;
  const world = matchWorld(m);
  // Le drapeau tombe au sol, sous le porteur
  const down = world.raycast(fv.s.x, fv.s.y + 0.5, fv.s.z, 0, -1, 0, 40);
  flag.at = "dropped";
  flag.carrier = -1;
  flag.x = fv.s.x;
  flag.y = down ? fv.s.y + 0.5 - down.t : fv.s.y;
  flag.z = fv.s.z;
  flag.since = m.t;
  ev.push({ k: "flag", f: "drop", team: fv.carrying, i: v });
  fv.carrying = -1;
}

/** Le meilleur point pour revenir au combat : loin des adversaires, sans tomber sur quelqu'un */
function spawnPoint(m: Match, i: number) {
  const gm = getMap(m.map);
  const f = m.fighters[i]!;
  const list = isTeamMode(m.mode) ? gm.spawns[f.team]! : gm.ffa;
  let best = list[0]!;
  let bestScore = -Infinity;
  for (const sp of list) {
    let near = 60;
    let blocked = false;
    for (let j = 0; j < m.fighters.length; j++) {
      const g = m.fighters[j]!;
      if (j === i || !g.s.alive) continue;
      const d = Math.hypot(g.s.x - sp.x, g.s.z - sp.z);
      if (d < 1.2) blocked = true;
      if (enemies(m, i, j)) near = Math.min(near, d);
    }
    const score = (blocked ? -100 : 0) + near + random(m) * 6;
    if (score > bestScore) {
      bestScore = score;
      best = sp;
    }
  }
  return best;
}

/** Un pas du monde : les grenades, les retours au combat, la santé qui revient, la zone, les drapeaux, la fin */
export function worldStep(m: Match, ev: EscEvent[]) {
  if (m.phase === "over") return;
  m.t += DT;
  if (m.phase === "countdown" && m.t >= m.liveAt) {
    m.phase = "live";
    ev.push({ k: "live" });
  }
  const world = matchWorld(m);
  stepGrenades(m, world, ev);
  stepBlasts(m, world, ev);
  stepCrates(m, ev);
  if (m.marks.length > 0) m.marks = m.marks.filter((k) => k.until > m.t && m.fighters[k.target]?.s.alive);
  for (let i = 0; i < m.fighters.length; i++) {
    const f = m.fighters[i]!;
    if (!f.s.alive) {
      if (m.phase === "live" && m.t >= f.respawnAt && !waitingRescue(m, i)) {
        if (m.cq && f.bot) f.spawnOn = botFlagSpawn(m, i);
        const onFlag = m.cq && f.spawnOn <= -2 ? flagSpawn(m, i, world) : null;
        const near = onFlag ? null : besideTeammate(m, i, world);
        const sp = onFlag ?? near ?? spawnPoint(m, i);
        placeAt(f, sp.x, sp.y, sp.z, sp.yaw, m);
        // Conquête : chaque retour au combat coûte un ticket à son équipe (un coéquipier relevé n'en coûte pas)
        if (m.cq) m.scores[f.team === 1 ? 1 : 0] = Math.max(0, m.scores[f.team === 1 ? 1 : 0] - 1);
        ev.push(onFlag ? { k: "spawn", i, fl: -2 - f.spawnOn } : near ? { k: "spawn", i, on: f.spawnOn } : { k: "spawn", i });
      }
      continue;
    }
    if (f.s.y < -10) {
      hurt(m, i, -1, 999, 1, "chute", ev, f.s.x, f.s.y, f.s.z);
      continue;
    }
    if (!m.settings.hardcore && f.hp < MAX_HP && m.t - f.hurtAt > REGEN_DELAY) f.hp = Math.min(MAX_HP, f.hp + REGEN_RATE * DT);
  }
  if (m.phase !== "live") return;
  if (isTeamMode(m.mode)) stepRevive(m, ev);
  if (m.zone) stepZone(m, ev);
  if (m.cq) stepConquest(m, ev);
  if (m.flags) stepFlags(m, ev);
  checkEnd(m, ev);
}

function stepGrenades(m: Match, world: World, ev: EscEvent[]) {
  for (const g of m.grenades) {
    g.vy -= 17 * DT;
    const p = { x: g.x, y: g.y - 0.07, z: g.z };
    const v = [g.vx, g.vy, g.vz];
    for (const axis of [0, 1, 2] as const) {
      const d = v[axis]! * DT;
      const moved = world.moveAxis(p, 0.07, 0.14, axis, d);
      if (Math.abs(moved - d) > 1e-6) {
        v[axis] = -v[axis]! * 0.35;
        for (const o of [0, 1, 2]) if (o !== axis) v[o] = v[o]! * 0.7;
      }
    }
    g.x = p.x;
    g.y = p.y + 0.07;
    g.z = p.z;
    [g.vx, g.vy, g.vz] = v as [number, number, number];
  }
  const due = m.grenades.filter((g) => m.t >= g.boom);
  if (due.length === 0) return;
  m.grenades = m.grenades.filter((g) => m.t < g.boom);
  for (const g of due) {
    ev.push({ k: "boom", i: g.owner, x: r2(g.x), y: r2(g.y), z: r2(g.z) });
    blast(m, world, g.x, g.y, g.z, g.owner, GRENADE.radius, GRENADE.damage, "grenade", GRENADE.self, ev);
  }
}

function stepZone(m: Match, ev: EscEvent[]) {
  const z = m.zone!;
  const c = getMap(m.map).zone;
  const present: [boolean, boolean] = [false, false];
  const inside: number[] = [];
  m.fighters.forEach((f, i) => {
    if (!f.s.alive || f.s.y > 3) return;
    if ((f.s.x - c.x) ** 2 + (f.s.z - c.z) ** 2 > c.r * c.r) return;
    present[f.team === 1 ? 1 : 0] = true;
    inside.push(i);
    f.stats.zone += DT;
  });
  const contested = present[0] && present[1];
  const owner = contested ? z.owner : present[0] ? 0 : present[1] ? 1 : z.owner;
  if (owner !== z.owner || contested !== z.contested) {
    z.owner = owner;
    z.contested = contested;
    ev.push({ k: "zone", owner, contested });
  }
  if (contested || (!present[0] && !present[1])) return;
  const holder: 0 | 1 = present[0] ? 0 : 1;
  z.acc[holder] += DT;
  while (z.acc[holder]! >= 1) {
    z.acc[holder] -= 1;
    m.scores[holder] += 1;
    for (const i of inside) m.fighters[i]!.points += POINTS.zone;
  }
}

/**
 * La conquête : chaque drapeau penche vers l'équipe la plus nombreuse tout près de lui. Il faut d'abord le neutraliser
 * (ramener sa jauge à zéro), puis le prendre. Les tickets de l'équipe qui en tient le moins fondent.
 */
function stepConquest(m: Match, ev: EscEvent[]) {
  const cq = m.cq!;
  const at = getMap(m.map).points;
  const held: [number, number] = [0, 0];
  cq.pts.forEach((p, k) => {
    const c = at[k]!;
    const n: [number, number] = [0, 0];
    const inside: number[] = [];
    m.fighters.forEach((f, i) => {
      if (!f.s.alive || Math.abs(f.s.y - c.y) > CONQUEST.dy) return;
      if ((f.s.x - c.x) ** 2 + (f.s.z - c.z) ** 2 > CONQUEST.r ** 2) return;
      n[f.team === 1 ? 1 : 0] += 1;
      inside.push(i);
      f.stats.zone += DT;
    });
    const diff = Math.max(-CONQUEST.max, Math.min(CONQUEST.max, n[1] - n[0]));
    if (diff !== 0) p.v += diff * CONQUEST.speed * DT;
    else if (n[0] + n[1] === 0) {
      // Laissé seul, il revient à qui le tenait (ou au neutre)
      const home = p.owner === 0 ? -1 : p.owner === 1 ? 1 : 0;
      const step = CONQUEST.back * DT;
      p.v = p.v < home ? Math.min(home, p.v + step) : Math.max(home, p.v - step);
    }
    p.v = Math.max(-1, Math.min(1, p.v));
    const was = p.owner;
    if ((p.owner === 0 && p.v > 0) || (p.owner === 1 && p.v < 0)) p.owner = -1;
    else if (p.owner !== 0 && p.v <= -1) p.owner = 0;
    else if (p.owner !== 1 && p.v >= 1) p.owner = 1;
    if (p.owner !== was) {
      const by = p.owner >= 0 ? p.owner : was === 0 ? 1 : 0;
      for (const i of inside) {
        const f = m.fighters[i]!;
        if ((f.team === 1 ? 1 : 0) !== by) continue;
        f.points += p.owner >= 0 ? POINTS.flag : POINTS.neutral;
        if (p.owner >= 0) f.stats.captures += 1;
      }
      ev.push({ k: "cq", p: k, owner: p.owner, was });
    }
    if (p.owner === 0) held[0] += 1;
    if (p.owner === 1) held[1] += 1;
  });
  for (const t of [0, 1] as const) {
    const lead = held[t === 0 ? 1 : 0] - held[t];
    if (lead <= 0) {
      cq.bleed[t] = 0;
      continue;
    }
    cq.bleed[t] += (lead / CONQUEST.bleed) * DT;
    while (cq.bleed[t] >= 1) {
      cq.bleed[t] -= 1;
      m.scores[t] = Math.max(0, m.scores[t] - 1);
    }
  }
}

/** Conquête : une place libre près du drapeau choisi, s'il est à son équipe et qu'aucun adversaire n'y rôde */
function flagSpawn(m: Match, i: number, world: World): { x: number; y: number; z: number; yaw: number } | null {
  const f = m.fighters[i]!;
  const k = -2 - f.spawnOn;
  const p = m.cq?.pts[k];
  const c = getMap(m.map).points[k];
  if (!p || !c || p.owner !== f.team) return null;
  for (let j = 0; j < m.fighters.length; j++) {
    const g = m.fighters[j]!;
    if (g.s.alive && enemies(m, i, j) && Math.hypot(g.s.x - c.x, g.s.z - c.z) < CONQUEST.r + 4) return null;
  }
  // Le regard vers le camp d'en face
  const yaw = f.team === 1 ? Math.PI / 2 : -Math.PI / 2;
  const a0 = random(m) * Math.PI * 2;
  for (let ring = 0; ring < 2; ring++) {
    for (let a = 0; a < 8; a++) {
      const ang = a0 + (a / 8) * Math.PI * 2 + ring * 0.4;
      const r = 2 + ring * 1.6;
      const x = c.x + Math.cos(ang) * r;
      const z = c.z + Math.sin(ang) * r;
      const y = c.y;
      if (world.overlaps(x - 0.3, y + 0.02, z - 0.3, x + 0.3, y + 1.78, z + 0.3)) continue;
      if (!world.overlaps(x - 0.2, y - 0.1, z - 0.2, x + 0.2, y + 0.01, z + 0.2)) continue;
      if (!world.clear(c.x, y + 1, c.z, x, y + 1, z)) continue;
      if (m.fighters.some((g, j) => j !== i && g.s.alive && Math.hypot(g.s.x - x, g.s.z - z) < 0.8)) continue;
      return { x, y, z, yaw };
    }
  }
  return null;
}

/** Conquête : où revient un bot (le drapeau de son équipe le plus proche d'un drapeau à prendre, parfois la base) */
function botFlagSpawn(m: Match, i: number): number {
  const f = m.fighters[i]!;
  const pts = m.cq!.pts;
  const at = getMap(m.map).points;
  const owned = pts.map((_, k) => k).filter((k) => pts[k]!.owner === f.team);
  const want = pts.map((_, k) => k).filter((k) => pts[k]!.owner !== f.team);
  if (owned.length === 0 || random(m) < 0.25) return -1;
  if (want.length === 0) return -2 - owned[Math.floor(random(m) * owned.length)]!;
  let best = owned[0]!;
  let bestD = Infinity;
  for (const o of owned) {
    for (const w of want) {
      const d = Math.hypot(at[o]!.x - at[w]!.x, at[o]!.z - at[w]!.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
  }
  return -2 - best;
}

function stepFlags(m: Match, ev: EscEvent[]) {
  const gm = getMap(m.map);
  const flags = m.flags!;
  for (let ft = 0; ft < 2; ft++) {
    const F = flags[ft]!;
    if (F.at === "carried") {
      const c = m.fighters[F.carrier];
      if (!c || !c.s.alive || c.carrying !== ft) {
        F.at = "dropped";
        F.carrier = -1;
        F.since = m.t;
        continue;
      }
      F.x = c.s.x;
      F.y = c.s.y;
      F.z = c.s.z;
      const home = gm.flags[c.team === 1 ? 1 : 0]!;
      const own = flags[c.team === 1 ? 1 : 0]!;
      if (own.at === "home" && Math.hypot(c.s.x - home.x, c.s.z - home.z) < FLAG_REACH + 0.3 && Math.abs(c.s.y - home.y) < 2) {
        m.scores[c.team === 1 ? 1 : 0] += 1;
        c.stats.captures += 1;
        c.points += POINTS.capture;
        c.carrying = -1;
        ev.push({ k: "flag", f: "capture", team: ft, i: F.carrier });
        Object.assign(F, { at: "home", carrier: -1, ...gm.flags[ft]!, since: m.t });
      }
      continue;
    }
    if (F.at === "dropped" && m.t - F.since > FLAG_RETURN) {
      Object.assign(F, { at: "home", carrier: -1, ...gm.flags[ft]!, since: m.t });
      ev.push({ k: "flag", f: "return", team: ft, i: -1 });
      continue;
    }
    for (let i = 0; i < m.fighters.length; i++) {
      const f = m.fighters[i]!;
      if (!f.s.alive) continue;
      if (Math.hypot(f.s.x - F.x, f.s.z - F.z) > FLAG_REACH || Math.abs(f.s.y - F.y) > 2.2) continue;
      if (f.team !== ft && f.carrying < 0) {
        F.at = "carried";
        F.carrier = i;
        f.carrying = ft;
        f.points += POINTS.take;
        ev.push({ k: "flag", f: "take", team: ft, i });
        break;
      }
      if (f.team === ft && F.at === "dropped") {
        Object.assign(F, { at: "home", carrier: -1, ...gm.flags[ft]!, since: m.t });
        f.stats.returns += 1;
        f.points += POINTS.ret;
        ev.push({ k: "flag", f: "return", team: ft, i });
        break;
      }
    }
  }
}

function checkEnd(m: Match, ev: EscEvent[]) {
  const teams = isTeamMode(m.mode);
  const reached = m.cq
    ? m.scores.some((s) => s <= 0)
    : teams
      ? m.scores.some((s) => s >= m.goal)
      : m.fighters.some((f) => f.stats.kills >= m.goal);
  if (!reached && m.t < m.endAt) return;
  finish(m);
  ev.push({ k: "over" });
}

/** La fin : le classement de chacun (à égalité, la même place) */
export function finish(m: Match) {
  m.phase = "over";
  m.grenades = [];
  const n = m.fighters.length;
  if (isTeamMode(m.mode)) {
    const [a, b] = m.scores;
    m.winner = a === b ? null : a > b ? 0 : 1;
    m.ranks = m.fighters.map((f) => (m.winner === null || f.team === m.winner ? 1 : 2));
    return;
  }
  const key = (f: Fighter) => f.stats.kills * 1000 - f.stats.deaths;
  const order = [...m.fighters.keys()].sort((p, q) => key(m.fighters[q]!) - key(m.fighters[p]!));
  const ranks = new Array<number>(n).fill(n);
  order.forEach((idx, k) => {
    const prev = order[k - 1];
    ranks[idx] = prev !== undefined && key(m.fighters[prev]!) === key(m.fighters[idx]!) ? ranks[prev]! : k + 1;
  });
  m.ranks = ranks;
  const first = order.filter((idx) => ranks[idx] === 1);
  m.winner = first.length === 1 ? first[0]! : null;
}

/**
 * Un soldat de plus en pleine partie (quelqu'un qui rejoint en cours de route) : il arrive aussitôt à un point
 * d'apparition de son équipe. Renvoie son numéro.
 */
export function addFighter(m: Match, p: FighterInit): number {
  const i = m.fighters.length;
  const team = isTeamMode(m.mode) ? (p.team === 1 ? 1 : 0) : Math.max(i, ...m.fighters.map((f) => f.team + 1));
  m.fighters.push({
    id: p.id,
    team,
    bot: p.bot,
    s: newSoldier(
      0,
      0,
      0,
      0,
      allowedPrimary(m.settings, p.primary),
      GRENADE.count,
      allowedSecondary(m.settings, p.secondary ?? "pistolet"),
      p.muzzle ?? "aucun",
      p.extra ?? "aucun",
    ),
    hp: MAX_HP,
    respawnAt: 0,
    shieldUntil: 0,
    hurtAt: -100,
    next: isPrimaryId(p.primary) ? p.primary : "fa",
    nextSecondary: isSecondaryId(p.secondary) ? p.secondary : "pistolet",
    nextMuzzle: p.muzzle ?? "aucun",
    nextExtra: p.extra ?? "aucun",
    damagers: [],
    carrying: -1,
    points: 0,
    streak: 0,
    spotReady: 0,
    reviving: -1,
    reviveT: 0,
    spawnOn: -1,
    diedAt: -100,
    giveUp: false,
    lastFight: -100,
    stats: newStats(),
  });
  const sp = spawnPoint(m, i);
  placeAt(m.fighters[i]!, sp.x, sp.y, sp.z, sp.yaw, m);
  return i;
}

/** Le choix des armes pour la prochaine vie */
export function chooseNext(
  m: Match,
  i: number,
  pick: { primary?: PrimaryId; secondary?: SecondaryId; muzzle?: MuzzleId; extra?: ExtraId },
) {
  const f = m.fighters[i];
  if (!f) return;
  if (pick.primary) f.next = pick.primary;
  if (pick.secondary) f.nextSecondary = pick.secondary;
  if (pick.muzzle) f.nextMuzzle = pick.muzzle;
  if (pick.extra) f.nextExtra = pick.extra;
}

/** Un soldat qu'on garde de côté (le retour dans le temps n'a besoin que de la pose) */
export function snapshotPose(m: Match): Pose[] {
  return m.fighters.map(poseOf);
}
