// Le combat de Culbute, pas à pas (un soixantième de seconde) : le même calcul sur le serveur, qui fait autorité, et
// sur l'appareil du joueur pour anticiper son propre combattant. Rien de hasardeux ici qui ne passe par la graine
// du combat : deux calculs partis du même état avec les mêmes commandes donnent la même chose.
//
// Les pourcents montent à chaque coup reçu ; plus ils sont hauts, plus le coup suivant éjecte loin. On perd une vie
// en sortant des limites de l'arène. Pour revenir : les sauts en l'air, le spécial vers le haut, et les rebords du
// plateau auxquels on s'accroche.

import { random, type RngHolder } from "../../rng.ts";
import { blastOf, ledgesOf, platformsAt, respawnPoint, spawnOf, arenaScale, type ArenaId, type PlatformNow } from "./arenas.ts";
import {
  ATK,
  clamp,
  DT,
  GRB,
  ITEM_KINDS,
  FRT,
  JMP,
  NAR,
  SHD,
  sign,
  SPC,
  UPJ,
  type FieldItem,
  type Fight,
  type FightEvent,
  type Fighter,
  type FightSettings,
  type FState,
  type HabitueId,
  type Hazard,
  type HazardKind,
  type Input,
  type ItemKind,
  type Projectile,
  type Trap,
} from "./model.ts";
import { CHARGE_BONUS, GENERIC, type HitDef, type MoveDef, type MoveSlot } from "./moves.ts";
import { STYLES, type Style } from "./styles.ts";

// ---------------------------------------------------------------------------
// Les réglages du monde
// ---------------------------------------------------------------------------

/** L'éjection s'use de tant de m/s chaque seconde (deux fois plus vite en glissant au sol) */
export const KB_DECAY = 46;
/** L'étourdissement : un socle, puis tant d'images par m/s d'éjection (un petit coup laisse le temps d'enchaîner) */
export const HITSTUN_BASE = 6;
export const HITSTUN_K = 0.7;
/** Un coup qui a touché (pas sur la garde) s'annule tant d'images après sa dernière image de frappe */
export const HIT_CANCEL = 3;
/** Le petit coup, lui, s'annule dès l'image où il pourrait se relancer */
export const JAB_CANCEL = 1;
/** Une série de petits coups : trois au plus, le dernier repousse l'autre hors de portée (on ne martèle pas à l'infini) */
export const JAB_SERIES = 3;
/** Repoussé par ce dernier petit coup, on reprend ses esprits avant que l'autre puisse revenir frapper */
const FINISHER_STUN = 10;
/** Toutes les éjections un peu plus fortes : on sort plus tôt, les vies sont plus courtes et plus nerveuses */
const KB_SCALE = 1.1;

/** La vitesse d'éjection d'un coup : sa base, plus ce qu'elle gagne avec les pourcents, selon le poids et la charge */
function launchSpeed(kb: number, kbg: number, dmgAfter: number, weight: number, charge: number): number {
  return (kb + (kbg * dmgAfter) / 100) * (200 / (100 + weight)) * (1 + 0.15 * charge) * KB_SCALE;
}
/** Au-delà de cette éjection, on tombe à terre en touchant le sol (sauf à amortir avec la garde) */
const TUMBLE = 17;
export const SHIELD_MAX = 50;
const SHIELD_WEAR = 0.13;
const SHIELD_REGEN = 0.09;
const SHIELD_BREAK_STUN = 150;
export const JUMPSQUAT = 3;
/** Après l'élan, le saut lâché pendant tant d'images s'arrête plus bas : une touche tapée vite fait un petit saut */
const HOP_CUT = 6;
const LAND_LAG = 4;
const HELPLESS_LAG = 10;
const SHIELD_DROP = 6;
const ROLL_FRAMES = 24;
const DODGE_FRAMES = 20;
const AIRDODGE_FRAMES = 28;
const DOWN_FRAMES = 32;
const TECH_FRAMES = 20;
const LEDGE_MAX = 300;
const LEDGE_INTANG = 40;
const DEAD_FRAMES = 70;
const RESPAWN_WAIT = 200;
const RESPAWN_INTANG = 120;
/** Une sortie revient au dernier qui a touché dans les 6 dernières secondes */
const CREDIT_FRAMES = 360;
const BUFFER_FRAMES = 6;
/** Le début d'une attaque s'annule encore en garde (au doigt, Frapper + Spécial ensemble font la garde) */
const CANCEL_WINDOW = 4;
export const INTRO_FRAMES = 180;
export const OVER_FRAMES = 150;
const BOUNCE_VY = 17;
/** L'arrêt sur image du coup qui fait sortir */
export const KO_STOP = 30;
/** La parade : la garde levée moins de tant d'images avant le coup ; l'attaquant reste figé un peu plus */
export const PARRY_FRAMES = 5;
const PARRY_STUN = 14;
/** L'usure : chaque fois qu'un coup est dans la file des derniers coups qui ont touché, il perd un peu (le plus récent compte le plus) */
const STALE = [0.12, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03];
/** Un coup frais (absent de la file) frappe un peu plus fort */
const FRESH = 1.05;

/** Ce que vaut ce coup, selon combien de fois on vient de le placer */
export function staleFactor(ft: Fighter, key: string): number {
  if (!ft.stale.includes(key)) return FRESH;
  let k = 1;
  ft.stale.forEach((m, i) => {
    if (m === key) k -= STALE[i] ?? 0;
  });
  return k;
}

/** L'usure pèse aussi sur l'éjection : un coup répété sans cesse pousse moins loin (et sort moins bien) */
export function staleKnock(fresh: number): number {
  return 0.5 + 0.5 * Math.min(1, fresh);
}

function noteStale(ft: Fighter, key: string) {
  ft.stale.unshift(key);
  if (ft.stale.length > STALE.length) ft.stale.length = STALE.length;
}
/** La saisie : la main tendue (images actives), sa portée */
export const GRAB_FROM = 6;
/** Une saisie manquée : la main tendue dans le vide se paie */
const WHIFF_GRAB = 10;
const GRAB_TO = 8;
const GRAB_X = 0.75;
const GRAB_Y = 0.8;
const GRAB_R = 0.55;
/** Combien de temps on tient quelqu'un avant qu'il ne se dégage seul (plus il a de pourcents, plus c'est long) */
const HOLD_MIN = 75;
const HOLD_MAX = 210;
/** Chaque appui de celui qui est tenu l'aide à se dégager */
const MASH = 5;
/** Les projections : l'image où il part, et comment */
const THROWS: Record<string, { at: number; dmg: number; ang: number; kb: number; kbg: number; back?: boolean }> = {
  "g:tF": { at: 10, dmg: 8, ang: 35, kb: 8, kbg: 15 },
  "g:tB": { at: 13, dmg: 10, ang: 38, kb: 8.5, kbg: 17, back: true },
  "g:tU": { at: 11, dmg: 7, ang: 90, kb: 8.5, kbg: 12 },
  "g:tD": { at: 12, dmg: 6, ang: 72, kb: 6, kbg: 6 },
};
const TRAP_STUCK = 70;
const ITEM_LIFE = 1200;
const GATEAU_HEAL = 25;
const CAFE_FRAMES = 480;
/** Les vies et les sorties : au-delà de 8 minutes de combat aux vies, on arrête et on compte */
const VIES_LIMIT = 8 * 60 * 60;
const SUBITE_LIMIT = 3 * 60 * 60;

const deg = Math.PI / 180;

export const DEFAULT_FIGHT_SETTINGS: FightSettings = {
  mode: "vies",
  stocks: 3,
  minutes: 3,
  items: "peu",
  teams: false,
  friendlyFire: false,
  lune: false,
  events: true,
};

export interface Entrant {
  /** Le siège */
  id: string;
  team: number;
  style: HabitueId;
}

const styleOf = (ft: Fighter): Style => STYLES[ft.style];
/** Sur la lune : moins de pesanteur, des sauts un peu moins vifs (ils portent quand même plus haut) */
const LUNE_GRAVITY = 0.55;
const LUNE_JUMP = 0.8;
export const gravityOf = (f: Fight) => (f.settings.lune ? LUNE_GRAVITY : 1);
export const jumpOf = (f: Fight, ft: Fighter) => (f.settings.lune ? LUNE_JUMP : 1) * (ft.fastUntil > f.frame ? 1.1 : 1);

// ---------------------------------------------------------------------------
// La création du combat
// ---------------------------------------------------------------------------

function newFighter(slot: number, e: Entrant, settings: FightSettings, arena: ArenaId, scale: number): Fighter {
  const st = STYLES[e.style];
  const spawn = spawnOf(arena, scale, slot);
  return {
    slot,
    id: e.id,
    team: e.team,
    style: e.style,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    face: spawn.x > 0 ? -1 : 1,
    ground: 0,
    state: "stand",
    t: 0,
    move: "",
    mt: 0,
    charge: 0,
    hitIds: [],
    hitAt: [],
    jumps: st.jumps,
    airdodged: false,
    upJump: false,
    landed: false,
    sideUsed: false,
    fastfall: false,
    dropUntil: 0,
    dmg: settings.mode === "subite" ? 100 : 0,
    stocks: settings.mode === "vies" ? settings.stocks : settings.mode === "subite" ? 1 : 0,
    score: 0,
    shield: SHIELD_MAX,
    hitstop: 0,
    stun: 0,
    intangUntil: 0,
    lastBy: -1,
    lastAt: -9999,
    item: "",
    itemUses: 0,
    ledge: -1,
    ledgeLock: 0,
    ledgeFresh: true,
    buf: 0,
    bufT: 0,
    px: 0,
    py: 0,
    ph: 0,
    fastUntil: 0,
    creamUntil: 0,
    wait: 0,
    rank: 0,
    stats: { kos: 0, falls: 0, dealt: 0, taken: 0, items: 0, lowKo: 999, bestStreak: 0 },
    lastKb: 0,
    holding: -1,
    holder: -1,
    hopLeft: 0,
    jabs: 0,
    stale: [],
    puff: 0,
    walked: 0,
    elan: 0,
  };
}

export function createFight(settings: FightSettings, arena: ArenaId, entrants: Entrant[], seed: number): Fight {
  const scale = arenaScale(entrants.length);
  // Une seule équipe à la table : chacun pour soi (sinon le combat serait gagné avant d'avoir commencé)
  const teams = settings.teams && new Set(entrants.map((e) => e.team)).size >= 2;
  const f: Fight = {
    settings: { ...DEFAULT_FIGHT_SETTINGS, ...settings, teams },
    arena,
    scale,
    frame: 0,
    phase: "intro",
    clock: INTRO_FRAMES,
    limit: settings.mode === "temps" ? settings.minutes * 60 * 60 : settings.mode === "subite" ? SUBITE_LIMIT : VIES_LIMIT,
    fighters: entrants.map((e, i) => newFighter(i, e, settings, arena, scale)),
    projectiles: [],
    items: [],
    traps: [],
    nextId: 1,
    itemAt: 0,
    hazard: null,
    hazardAt: Infinity,
    rng: seed >>> 0,
    winners: [],
    outCount: 0,
  };
  f.itemAt = INTRO_FRAMES + firstItemDelay(f);
  if (f.settings.events !== false && ARENA_HAZARD[arena]) f.hazardAt = INTRO_FRAMES + HAZARD_FIRST + Math.floor(rand(f) * HAZARD_SPREAD);
  return f;
}

function rand(f: Fight): number {
  return random(f as unknown as RngHolder);
}

// ---------------------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------------------

/** La direction du stick : neutre, de côté, vers le haut, vers le bas */
export function dirOf(x: number, y: number): "n" | "s" | "u" | "d" {
  if (Math.hypot(x, y) < 0.4) return "n";
  if (y > 0.55 && y >= Math.abs(x)) return "u";
  if (y < -0.55 && -y >= Math.abs(x)) return "d";
  return Math.abs(x) >= 0.4 ? "s" : "n";
}

export function moveDef(style: HabitueId, key: string): MoveDef | null {
  if (!key) return null;
  if (key.startsWith("g:")) return GENERIC[key.slice(2)] ?? null;
  return STYLES[style].moves[key as MoveSlot] ?? null;
}

const isAirborne = (ft: Fighter) => ft.ground < 0;
const isAerialSlot = (key: string) => key === "an" || key === "as" || key === "au" || key === "ad" || key === "g:bagA";

/** Les coups qui s'enchaînent quand ils ont touché : le petit coup, les coups simples, les attaques en l'air, le coup en courant */
const CANCEL_SLOTS = new Set(["n", "s", "u", "d", "an", "as", "au", "ad", "g:dash", "g:bagS", "g:bagA"]);

/** Ce coup a touché, et sa frappe est passée depuis assez longtemps pour enchaîner */
export function hitCancelable(ft: Fighter): boolean {
  if (!CANCEL_SLOTS.has(ft.move) || ft.hitstop > 0) return false;
  // Le dernier petit coup d'une série repousse : il va jusqu'au bout
  if (ft.move === "n" && ft.jabs >= JAB_SERIES) return false;
  const def = moveDef(ft.style, ft.move);
  if (!def || def.hits.length === 0) return false;
  // Le petit coup s'annule aussi tôt qu'il se relance : il ouvre les enchaînements
  return ft.mt > Math.max(...def.hits.map((h) => h.to)) + (ft.move === "n" ? JAB_CANCEL : HIT_CANCEL);
}

/** Peut-il être touché ? */
export function vulnerable(f: Fight, ft: Fighter): boolean {
  if (ft.state === "dead" || ft.state === "out" || ft.state === "respawn") return false;
  if (ft.intangUntil > f.frame) return false;
  if (ft.state === "roll" && ft.t >= 3 && ft.t <= 16) return false;
  if (ft.state === "dodge" && ft.t >= 3 && ft.t <= 16) return false;
  if (ft.state === "airdodge" && ft.t >= 2 && ft.t <= 23) return false;
  if (ft.state === "tech") return false;
  if (ft.state === "move") {
    const def = moveDef(ft.style, ft.move);
    if (def?.intang && ft.mt >= def.intang[0] && ft.mt <= def.intang[1]) return false;
  }
  return true;
}

function circleHitsBox(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const nx = clamp(cx, x0, x1);
  const ny = clamp(cy, y0, y1);
  return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) <= r * r;
}

function hurtbox(ft: Fighter): [number, number, number, number] {
  const st = styleOf(ft);
  return [ft.x - st.w / 2, ft.y + 0.05, ft.x + st.w / 2, ft.y + st.hgt];
}

function setState(ft: Fighter, state: FState) {
  ft.state = state;
  ft.t = 0;
  if (state !== "move") {
    ft.move = "";
    ft.mt = 0;
    ft.charge = 0;
  }
}

/** L'élan : un coup parti en courant (l'attaque en courant comprise) ou en l'air en filant de côté frappe plus fort, et
 * pousse plus loin, que le même coup donné sans bouger (debout, ou en sautant sur place, ou en retombant d'un coup reçu).
 * Bouger paie ; rester planté, non */
const ELAN_DMG = 0.12;
const ELAN_KB = 0.08;
/** (un lourd lancé cogne plus qu'un léger : le bonus suit la lenteur du style, de +8 % pour Huguette à +18 % pour Marcel ;
 * sans cela les styles vifs, plus souvent lancés, prenaient le dessus) */
const ELAN_REF_RUN = 12.5;
export function elanBoost(ft: Fighter): { dmg: number; kb: number } {
  if (!ft.elan) return { dmg: 1, kb: 1 };
  const k = (ELAN_REF_RUN / styleOf(ft).run) ** 2;
  return { dmg: 1 + ELAN_DMG * k, kb: 1 + ELAN_KB * k };
}
function hasElan(ft: Fighter, key: string): boolean {
  if (key === "g:dash") return true;
  if (key.startsWith("g:")) return false;
  const st = styleOf(ft);
  return Math.abs(ft.vx) >= (isAirborne(ft) ? st.air * 0.6 : st.run * 0.7);
}

function startMove(ft: Fighter, key: string) {
  ft.elan = hasElan(ft, key) ? 1 : 0;
  ft.state = "move";
  ft.t = 0;
  ft.move = key;
  ft.mt = 0;
  ft.charge = 0;
  ft.hitIds = [];
  ft.hitAt = [];
  ft.landed = false;
  ft.jabs = key === "n" ? 1 : 0;
}

function consume(ft: Fighter, bit: number) {
  ft.buf &= ~bit;
}

function speedMul(f: Fight, ft: Fighter) {
  return ft.fastUntil > f.frame ? 1.25 : 1;
}

/** Sur une plateforme fine (on peut la traverser vers le bas) ? */
function onThin(plats: PlatformNow[], ft: Fighter) {
  const p = ft.ground >= 0 ? plats[ft.ground] : undefined;
  return p !== undefined && p.kind !== "solid";
}

// ---------------------------------------------------------------------------
// Ce que le joueur demande, selon ce qu'il est en train de faire
// ---------------------------------------------------------------------------

function groundAttack(ft: Fighter, x: number, y: number) {
  const dir = dirOf(x, y);
  if (dir === "s") ft.face = x < 0 ? -1 : 1;
  if (ft.item === "baguette" && (dir === "n" || dir === "s")) {
    startMove(ft, "g:bagS");
    return;
  }
  if (ft.item && ft.item !== "baguette") {
    startMove(ft, dir === "u" ? "g:throwU" : dir === "d" ? "g:throwD" : "g:throwF");
    return;
  }
  startMove(ft, dir);
}

/** Le coup fort : l'attaque chargée de sa direction, aussitôt (tenir le bouton la charge) ; sans direction, devant soi */
function strongAttack(ft: Fighter, x: number, y: number) {
  const dir = dirOf(x, y);
  if (dir === "s") ft.face = x < 0 ? -1 : 1;
  if (ft.item === "baguette") {
    startMove(ft, "g:bagC");
    return;
  }
  if (ft.item) {
    startMove(ft, dir === "u" ? "g:throwU" : dir === "d" ? "g:throwD" : "g:throwF");
    return;
  }
  startMove(ft, dir === "u" ? "cu" : dir === "d" ? "cd" : "cs");
}

/** Le coup vers le haut, au sol : le coup fort si c'est lui qu'on a enfoncé, sinon le coup simple */
function upAttack(ft: Fighter, x: number, press: number) {
  const strong = (press & FRT) !== 0;
  consume(ft, ATK | FRT);
  if (strong) strongAttack(ft, x, 1);
  else startMove(ft, ft.item ? "g:throwU" : "u");
}

/** En pleine course vers l'avant : le coup en courant (on garde son élan) */
function dashing(ft: Fighter, x: number, y: number, st: Style, sm: number): boolean {
  return !ft.item && dirOf(x, y) === "s" && Math.abs(ft.vx) >= st.run * 0.7 * sm && sign(x) === sign(ft.vx);
}

function airAttack(ft: Fighter, x: number, y: number) {
  const dir = dirOf(x, y);
  if (dir === "s") ft.face = x < 0 ? -1 : 1;
  if (ft.item === "baguette" && (dir === "n" || dir === "s")) {
    startMove(ft, "g:bagA");
    return;
  }
  if (ft.item && ft.item !== "baguette") {
    startMove(ft, dir === "u" ? "g:throwU" : dir === "d" ? "g:throwD" : "g:throwF");
    return;
  }
  startMove(ft, `a${dir}`);
}

/** L'objet à portée de main (par terre devant ses pieds, ou qui passe tout près en l'air), le plus proche */
function itemInReach(f: Fight, ft: Fighter, reach: number): FieldItem | undefined {
  let best: FieldItem | undefined;
  for (const i of f.items) {
    const d = Math.abs(i.x - ft.x);
    if (d > reach || Math.abs(i.y - ft.y - (i.ground ? 0 : 0.6)) > 0.9) continue;
    if (!best || d < Math.abs(best.x - ft.x)) best = i;
  }
  return best;
}

const throwKey = (x: number, y: number) => {
  const dir = dirOf(x, y);
  return dir === "u" ? "g:throwU" : dir === "d" ? "g:throwD" : "g:throwF";
};

/** Saisir, debout : l'objet par terre à ses pieds se ramasse ; un objet en main se lance (la baguette, elle, se pose
 * pas : on saisit) ; sinon, la main tendue vers l'adversaire */
function grabOrPick(f: Fight, ft: Fighter, x: number, y: number) {
  const it = ft.item ? undefined : itemInReach(f, ft, 0.95);
  if (it) {
    startMove(ft, "g:pickup");
    pickUp(f, ft, it);
    return;
  }
  if (ft.item && ft.item !== "baguette") {
    if (dirOf(x, y) === "s") ft.face = x < 0 ? -1 : 1;
    startMove(ft, throwKey(x, y));
    return;
  }
  startMove(ft, "g:grab");
}

/** Un spécial : celui de côté ne se fait qu'une fois par saut */
function special(f: Fight, ft: Fighter, x: number, y: number): boolean {
  const dir = dirOf(x, y);
  if (dir === "s") {
    if (isAirborne(ft) && ft.sideUsed) return false;
    ft.face = x < 0 ? -1 : 1;
    if (isAirborne(ft)) ft.sideUsed = true;
  }
  const key = `p${dir}`;
  const def = moveDef(ft.style, key)!;
  // Une seule chaise en vol, un seul piège posé
  if (def.oneShot === "chaise" && f.projectiles.some((p) => p.owner === ft.slot && p.kind === "chaise")) return false;
  startMove(ft, key);
  return true;
}

function startShield(ft: Fighter, x: number, y: number) {
  if (Math.abs(x) > 0.6 || y < -0.6) ft.puff = 0;
  if (Math.abs(x) > 0.6) {
    setState(ft, "roll");
    ft.wait = x < 0 ? -1 : 1;
  } else if (y < -0.6) setState(ft, "dodge");
  else setState(ft, "shield");
}

function jumpFromGround(ft: Fighter) {
  ft.puff = 0;
  setState(ft, "squat");
}

/** Le pas en cours est-il celui de l'appareil (son seul combattant) ? */
let soloStep = false;

function control(f: Fight, ft: Fighter, inp: Input, plats: PlatformNow[]) {
  const st = styleOf(ft);
  const press = ft.buf;
  const { x, y } = inp;
  const flickDown = y < -0.7 && ft.py > -0.35;
  const flickUp = y > 0.7 && ft.py < 0.35;
  const sm = speedMul(f, ft);

  switch (ft.state) {
    case "stand": {
      // (le temps de souffler : un instant sans frapper)
      if (ft.t >= PUFF_REST) ft.puff = 0;
      if (press & GRB) {
        consume(ft, GRB);
        grabOrPick(f, ft, x, y);
        return;
      }
      if (press & SHD || inp.held & SHD) {
        consume(ft, SHD);
        startShield(ft, x, y);
        return;
      }
      if (press & JMP) {
        // Haut et un coup ensemble : le coup vers le haut, pas un saut
        if (press & UPJ && press & (ATK | FRT)) {
          consume(ft, JMP | UPJ);
          upAttack(ft, x, press);
          return;
        }
        consume(ft, JMP | UPJ);
        jumpFromGround(ft);
        ft.upJump = (press & UPJ) !== 0;
        return;
      }
      if (press & FRT) {
        consume(ft, FRT | ATK);
        strongAttack(ft, x, y);
        return;
      }
      if (press & ATK) {
        consume(ft, ATK);
        if (dashing(ft, x, y, st, sm)) startMove(ft, "g:dash");
        else groundAttack(ft, x, y);
        return;
      }
      if (press & SPC) {
        consume(ft, SPC);
        special(f, ft, x, y);
        return;
      }
      if (press & NAR) {
        consume(ft, NAR);
        startMove(ft, "g:taunt");
        return;
      }
      if (flickDown && onThin(plats, ft)) {
        ft.ground = -1;
        ft.dropUntil = f.frame + 14;
        ft.vy = -2;
        setState(ft, "air");
        return;
      }
      groundMove(ft, x, st, sm);
      return;
    }
    case "squat": {
      ft.vx *= 0.9;
      // Le saut venait de la touche Haut, et un coup suit aussitôt : c'était un coup vers le haut
      if (ft.upJump && press & (ATK | FRT)) {
        setState(ft, "stand");
        upAttack(ft, x, press);
        return;
      }
      if (ft.t >= JUMPSQUAT) {
        // Saut et Frapper ensemble (ou Frapper pendant l'élan) : un petit saut, et l'attaque en l'air part aussitôt
        const quick = (ft.buf & ATK) !== 0;
        const full = !quick && ((inp.held & JMP) !== 0 || flickUp || y > 0.6);
        ft.vy = (full ? st.jump : st.short) * jumpOf(f, ft);
        ft.hopLeft = full ? HOP_CUT : 0;
        ft.vx = clamp(ft.vx + x * 1.5, -st.air * sm * 1.1, st.air * sm * 1.1);
        ft.ground = -1;
        setState(ft, "air");
      }
      return;
    }
    case "air": {
      if (press & JMP && ft.jumps > 0) {
        consume(ft, JMP);
        ft.jumps--;
        ft.hopLeft = 0;
        ft.vy = st.airJump * jumpOf(f, ft);
        ft.vx = x * st.air * sm;
        if (Math.abs(x) > 0.3) ft.face = x < 0 ? -1 : 1;
        ft.fastfall = false;
        ft.t = 0;
        return;
      }
      if (press & SHD && !ft.airdodged) {
        consume(ft, SHD);
        startAirdodge(ft, x, y);
        return;
      }
      if (press & (ATK | FRT)) {
        consume(ft, ATK | FRT);
        airAttack(ft, x, y);
        return;
      }
      if (press & GRB) {
        consume(ft, GRB);
        // En l'air, Saisir attrape l'objet à portée de main, ou lance celui qu'on tient
        const it = itemInReach(f, ft, 1.1);
        if (!ft.item && it) pickUp(f, ft, it);
        else if (ft.item && ft.item !== "baguette") startMove(ft, throwKey(x, y));
      }
      if (press & SPC) {
        consume(ft, SPC);
        if (special(f, ft, x, y)) return;
      }
      airDrift(ft, x, st, sm, 1);
      fastFall(ft, y);
      return;
    }
    case "helpless": {
      airDrift(ft, x, st, sm, 0.7);
      return;
    }
    case "land": {
      ft.vx *= 0.8;
      if (ft.t >= ft.wait) setState(ft, "stand");
      return;
    }
    case "shield": {
      ft.vx *= 0.7;
      ft.shield -= SHIELD_WEAR;
      if (ft.shield <= 0) {
        breakShield(ft);
        return;
      }
      // Frapper (ou Saisir) depuis la garde : une saisie
      if (press & (ATK | GRB)) {
        consume(ft, ATK | GRB);
        startMove(ft, "g:grab");
        return;
      }
      // Le spécial, en sortie de garde
      if (press & SPC) {
        consume(ft, SPC);
        if (special(f, ft, x, y)) return;
      }
      if (press & JMP) {
        consume(ft, JMP);
        jumpFromGround(ft);
        return;
      }
      if (Math.abs(x) > 0.7 && ft.t > 1) {
        setState(ft, "roll");
        ft.wait = x < 0 ? -1 : 1;
        return;
      }
      if (y < -0.7 && ft.t > 1) {
        setState(ft, "dodge");
        return;
      }
      if (!(inp.held & SHD)) {
        setState(ft, "land");
        ft.wait = SHIELD_DROP;
      }
      return;
    }
    case "shieldstun": {
      if (ft.t >= ft.wait) {
        if (inp.held & SHD) setState(ft, "shield");
        else setState(ft, "stand");
      }
      return;
    }
    case "dizzy": {
      ft.vx *= 0.85;
      // On secoue le stick pour s'en remettre plus vite
      if (Math.abs(x - ft.px) > 0.8 || inp.pressed) ft.t += 3;
      if (ft.t >= ft.wait) {
        ft.shield = SHIELD_MAX * 0.4;
        setState(ft, isAirborne(ft) ? "air" : "stand");
      }
      return;
    }
    case "roll": {
      const dir = ft.wait;
      ft.vx = ft.t >= 2 && ft.t <= 17 ? dir * 10 : 0;
      if (ft.t >= ROLL_FRAMES) setState(ft, "stand");
      return;
    }
    case "dodge": {
      ft.vx = 0;
      if (ft.t >= DODGE_FRAMES) setState(ft, "stand");
      return;
    }
    case "airdodge": {
      if (ft.t < 14) {
        ft.vx *= 0.92;
        ft.vy *= 0.92;
      } else airDrift(ft, x, st, sm, 0.5);
      if (ft.t >= AIRDODGE_FRAMES) setState(ft, "air");
      return;
    }
    case "hurt": {
      ft.stun--;
      // La garde enfoncée juste avant de toucher le sol amortit la chute (voir land())
      if (press & SHD) ft.wait = f.frame + 12;
      if (ft.stun <= 0) {
        if (isAirborne(ft)) setState(ft, "air");
        else setState(ft, "stand");
      }
      return;
    }
    case "down": {
      ft.vx *= 0.8;
      if (ft.t >= 6 && press & (ATK | FRT)) {
        consume(ft, ATK | FRT);
        startMove(ft, "g:getupAtk");
        return;
      }
      if (ft.t >= 6 && Math.abs(x) > 0.6) {
        setState(ft, "roll");
        ft.wait = x < 0 ? -1 : 1;
        return;
      }
      if (ft.t >= DOWN_FRAMES || (ft.t >= 10 && (press & (JMP | SHD) || y > 0.6))) {
        consume(ft, JMP | SHD);
        ft.intangUntil = f.frame + 10;
        setState(ft, "stand");
      }
      return;
    }
    case "tech": {
      ft.vx *= 0.8;
      if (ft.t >= TECH_FRAMES) setState(ft, "stand");
      return;
    }
    case "caught": {
      if (ft.t >= ft.wait) setState(ft, isAirborne(ft) ? "air" : "stand");
      return;
    }
    case "holding": {
      ft.vx = 0;
      const v = f.fighters[ft.holding];
      // Sur l'appareil, celui qu'on tient est vu en retard : on fait confiance au serveur
      if (!soloStep && (!v || v.state !== "held" || v.holder !== ft.slot)) {
        ft.holding = -1;
        setState(ft, "stand");
        return;
      }
      ft.wait--;
      if (ft.wait <= 0) {
        if (v) letGo(f, ft, v);
        else setState(ft, "stand");
        return;
      }
      if (ft.t >= 6) {
        const fwd = x * ft.face;
        const throwKey = fwd > 0.6 ? "g:tF" : fwd < -0.6 ? "g:tB" : y > 0.6 ? "g:tU" : y < -0.6 ? "g:tD" : null;
        if (throwKey) {
          consume(ft, ATK | GRB);
          startHeldMove(ft, throwKey);
          return;
        }
        if (press & (ATK | GRB)) {
          consume(ft, ATK | GRB);
          startHeldMove(ft, "g:pummel");
          return;
        }
      }
      return;
    }
    case "held": {
      ft.vx = 0;
      ft.vy = 0;
      ft.kx = 0;
      ft.ky = 0;
      const h = f.fighters[ft.holder];
      if (!soloStep && (!h || h.holding !== ft.slot)) {
        ft.holder = -1;
        setState(ft, isAirborne(ft) ? "air" : "stand");
        return;
      }
      // Il se débat : chaque appui, chaque coup de stick rapproche le moment où il se dégage
      if (h && (inp.pressed !== 0 || Math.abs(x - ft.px) > 0.7 || Math.abs(y - ft.py) > 0.7)) h.wait -= MASH;
      return;
    }
    case "ledge": {
      ledgeControl(f, ft, inp, press);
      return;
    }
    case "respawn": {
      if (ft.t > 20 && (Math.hypot(x, y) > 0.3 || inp.pressed !== 0 || ft.t >= RESPAWN_WAIT)) {
        ft.intangUntil = f.frame + RESPAWN_INTANG;
        ft.vy = 0;
        ft.jumps = st.jumps;
        setState(ft, "air");
      }
      return;
    }
    case "move": {
      // Le tout début d'une attaque s'annule encore en garde ou en esquive
      const key = ft.move;
      // Un coup qui a touché : passé sa frappe, un nouvel appui (coup, saut, spécial, garde, saisie) l'enchaîne aussitôt
      if (ft.landed && press & (ATK | FRT | SPC | JMP | SHD | GRB) && hitCancelable(ft)) {
        const series = key === "n" ? ft.jabs : 0;
        setState(ft, isAirborne(ft) ? "air" : "stand");
        control(f, ft, inp, plats);
        // Un petit coup relancé ainsi continue la série
        if (series > 0 && ft.state === "move" && ft.move === "n" && ft.mt === 0) ft.jabs = series + 1;
        return;
      }
      if (ft.mt <= CANCEL_WINDOW && press & SHD && key.length <= 2 && !key.startsWith("p") && !key.startsWith("c")) {
        consume(ft, SHD);
        if (isAirborne(ft)) {
          if (!ft.airdodged) startAirdodge(ft, x, y);
        } else startShield(ft, x, y);
        return;
      }
      const def = moveDef(ft.style, key);
      if (isAirborne(ft)) {
        airDrift(ft, x, st, sm, def?.drift ?? (isAerialSlot(key) ? 1 : 0.4));
        if (isAerialSlot(key)) fastFall(ft, y);
      } else if (key === "g:dash") ft.vx *= ft.mt < 12 ? 0.985 : 0.8;
      else ft.vx *= def?.push ? 1 : 0.86;
      return;
    }
    default:
      return;
  }
}

/** Au sol : la mise en vitesse, et le freinage quand on lâche le stick (un arrêt net, pas une glissade) */
export const GROUND_ACC = 220;
export const GROUND_STOP = 280;

function groundMove(ft: Fighter, x: number, st: Style, sm: number) {
  // Quelques pas suffisent à reprendre son souffle
  ft.walked += Math.abs(ft.vx) * DT;
  if (ft.walked >= PUFF_WALK) ft.puff = 0;
  if (Math.abs(x) > 0.2) {
    const run = Math.abs(x) >= 0.65;
    const target = (run ? st.run : st.walk) * sign(x) * sm;
    // Le départ en courant : un élan immédiat (ou un demi-tour sec), pas une lente mise en route
    if (run && (Math.abs(ft.vx) < st.run * 0.5 * sm || sign(ft.vx) !== sign(x))) ft.vx = target;
    const acc = GROUND_ACC * DT;
    ft.vx += clamp(target - ft.vx, -acc, acc);
    ft.face = x < 0 ? -1 : 1;
  } else {
    const fr = GROUND_STOP * DT;
    ft.vx = Math.abs(ft.vx) <= fr ? 0 : ft.vx - sign(ft.vx) * fr;
  }
}

function airDrift(ft: Fighter, x: number, st: Style, sm: number, k: number) {
  if (k <= 0) return;
  if (Math.abs(x) > 0.2) {
    const target = x * st.air * sm;
    const acc = st.airAcc * k * DT;
    // On ne freine pas un élan plus rapide que sa vitesse en l'air : on le garde s'il va dans le même sens
    if (Math.abs(ft.vx) > Math.abs(target) && sign(ft.vx) === sign(target)) return;
    ft.vx += clamp(target - ft.vx, -acc, acc);
  } else {
    ft.vx *= 1 - 1.5 * DT;
  }
}

function fastFall(ft: Fighter, y: number) {
  if (ft.vy <= 0.5 && y < -0.7) ft.fastfall = true;
}

function startAirdodge(ft: Fighter, x: number, y: number) {
  setState(ft, "airdodge");
  ft.airdodged = true;
  ft.fastfall = false;
  const m = Math.hypot(x, y);
  if (m > 0.4) {
    ft.vx = (x / m) * 12;
    ft.vy = (y / m) * 12;
  } else {
    ft.vx *= 0.3;
    ft.vy = 0;
  }
}

function breakShield(ft: Fighter) {
  setState(ft, "dizzy");
  ft.wait = SHIELD_BREAK_STUN;
  ft.shield = 0;
  ft.vy = 11;
  ft.ground = -1;
  pending.push({ k: "break", v: ft.slot });
}

// ---------------------------------------------------------------------------
// Le rebord
// ---------------------------------------------------------------------------

function hangSpot(f: Fight, ft: Fighter, li: number): { x: number; y: number } {
  const l = ledgesOf(f.arena as ArenaId, f.scale)[li]!;
  const st = styleOf(ft);
  return { x: l.x + l.side * (st.w / 2 + 0.05), y: l.y - st.hgt * 0.8 };
}

/** Le combattant posé sur le plateau, juste au bord du rebord qu'il tenait */
function climbTo(f: Fight, ft: Fighter) {
  const l = ledgesOf(f.arena as ArenaId, f.scale)[ft.ledge]!;
  const st = styleOf(ft);
  ft.x = l.x - l.side * (st.w / 2 + 0.15);
  ft.y = l.y;
  // Le grand plateau est toujours la première plateforme de l'arène
  ft.ground = 0;
  ft.vx = ft.vy = ft.kx = ft.ky = 0;
  ft.ledge = -1;
  ft.ledgeLock = f.frame + 20;
}

function ledgeControl(f: Fight, ft: Fighter, inp: Input, press: number) {
  const { x, y } = inp;
  const spot = hangSpot(f, ft, ft.ledge);
  ft.x = spot.x;
  ft.y = spot.y;
  ft.vx = ft.vy = ft.kx = ft.ky = 0;
  if (ft.t < 4) return;
  const toward = x * ft.face;
  const leave = (lock: number) => {
    ft.ledge = -1;
    ft.ledgeLock = f.frame + lock;
    ft.ground = -1;
  };
  if (press & JMP || y > 0.7) {
    consume(ft, JMP);
    leave(24);
    ft.vy = styleOf(ft).jump * 1.05 * jumpOf(f, ft);
    ft.vx = ft.face * 2;
    setState(ft, "air");
    return;
  }
  if (press & (ATK | FRT)) {
    consume(ft, ATK | FRT);
    climbTo(f, ft);
    startMove(ft, "g:ledgeAtk");
    return;
  }
  if (press & SHD) {
    consume(ft, SHD);
    const face = ft.face;
    climbTo(f, ft);
    setState(ft, "roll");
    ft.wait = face;
    ft.intangUntil = f.frame + 14;
    return;
  }
  if (toward > 0.6) {
    climbTo(f, ft);
    startMove(ft, "g:climb");
    return;
  }
  if (toward < -0.6 || y < -0.6 || ft.t >= LEDGE_MAX) {
    leave(30);
    ft.x -= ft.face * 0.2;
    ft.vy = -1;
    setState(ft, "air");
  }
}

function tryGrabLedge(f: Fight, ft: Fighter, solo: boolean): boolean {
  if (ft.ledgeLock > f.frame || ft.vy + ft.ky > 3) return false;
  const st = styleOf(ft);
  if (ft.state === "move") {
    const def = moveDef(ft.style, ft.move);
    if (!def?.grab || ft.mt < def.grab) return false;
  } else if (ft.state !== "air" && ft.state !== "helpless") return false;
  const ledges = ledgesOf(f.arena as ArenaId, f.scale);
  for (let i = 0; i < ledges.length; i++) {
    const l = ledges[i]!;
    // Les mains au niveau du rebord, le corps juste à côté du plateau
    const out = (ft.x - l.x) * l.side;
    if (out < -st.w * 0.6 || out > st.w / 2 + 1.1) continue;
    const top = ft.y + st.hgt;
    if (top < l.y - 0.2 || ft.y > l.y - 0.25) continue;
    if (!solo && f.fighters.some((o) => o !== ft && o.state === "ledge" && o.ledge === i)) continue;
    ft.ledge = i;
    ft.face = l.side === -1 ? 1 : -1;
    setState(ft, "ledge");
    ft.jumps = st.jumps;
    ft.airdodged = false;
    ft.sideUsed = false;
    ft.fastfall = false;
    if (ft.ledgeFresh) {
      ft.intangUntil = Math.max(ft.intangUntil, f.frame + LEDGE_INTANG);
      ft.ledgeFresh = false;
    }
    const spot = hangSpot(f, ft, i);
    ft.x = spot.x;
    ft.y = spot.y;
    ft.vx = ft.vy = ft.kx = ft.ky = 0;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Le corps : pesanteur, élan, plateformes
// ---------------------------------------------------------------------------

function land(f: Fight, ft: Fighter, pi: number, plats: PlatformNow[], fallSpeed: number) {
  const st = styleOf(ft);
  const p = plats[pi]!;
  ft.y = p.y;
  // L'auvent : on rebondit, sauf à tenir le stick vers le bas
  if (p.kind === "bouncy" && ft.state !== "hurt" && ft.py > -0.5) {
    ft.vy = Math.max(BOUNCE_VY, -fallSpeed * 0.8);
    ft.ky = 0;
    ft.jumps = st.jumps;
    ft.airdodged = false;
    ft.sideUsed = false;
    ft.fastfall = false;
    if (ft.state === "helpless") setState(ft, "air");
    pending.push({ k: "hit", a: -1, v: ft.slot, dmg: 0, x: ft.x, y: ft.y, power: 0.2, kind: "push" });
    return;
  }
  ft.ground = pi;
  ft.jumps = st.jumps;
  ft.airdodged = false;
  ft.sideUsed = false;
  ft.fastfall = false;
  ft.ledgeFresh = true;
  ft.vy = 0;
  switch (ft.state) {
    case "air":
      ft.ky = 0;
      setState(ft, "land");
      ft.wait = LAND_LAG;
      break;
    case "helpless":
      ft.ky = 0;
      setState(ft, "land");
      ft.wait = HELPLESS_LAG;
      break;
    case "airdodge":
      ft.ky = 0;
      setState(ft, "land");
      ft.wait = 10;
      break;
    case "move": {
      const def = moveDef(ft.style, ft.move);
      ft.ky = 0;
      if (def && isAerialSlot(ft.move)) {
        // Avant sa première frappe, ou bien après la dernière : on atterrit presque comme d'habitude
        const first = def.hits.length > 0 ? Math.min(...def.hits.map((hd) => hd.from)) : 0;
        const last = def.hits.length > 0 ? Math.max(...def.hits.map((hd) => hd.to)) : 0;
        const clean = ft.mt < first - 1 || ft.mt > last + 6;
        const lag = clean ? LAND_LAG : (def.landLag ?? LAND_LAG);
        setState(ft, "land");
        ft.wait = lag;
      } else if (def?.special === "stomp") {
        // Marcel retombe : l'onde de choc part du sol
        ft.mt = Math.max(ft.mt, 11);
      } else if (def?.helpless) {
        setState(ft, "land");
        ft.wait = HELPLESS_LAG;
      }
      break;
    }
    case "hurt": {
      const speed = Math.hypot(ft.kx, ft.ky);
      if (ft.wait > f.frame) {
        // Garde juste avant le sol : on amortit et on se relève aussitôt
        ft.kx = ft.ky = 0;
        setState(ft, "tech");
        ft.wait = 0;
      } else if (fallSpeed > 8 && (speed > TUMBLE * 0.5 || ft.lastKb > TUMBLE)) {
        ft.ky = 0;
        ft.kx *= 0.4;
        setState(ft, "down");
      } else ft.ky = 0;
      break;
    }
    default:
      ft.ky = 0;
  }
}

/** Le stick vient d'être poussé de ce côté (il n'y était pas à l'image d'avant) : on veut y aller */
function freshPush(ft: Fighter, x: number, side: number): boolean {
  return x * side > 0.5 && ft.px * side <= 0.3;
}

function physics(f: Fight, ft: Fighter, plats: PlatformNow[], solo: boolean, x: number) {
  const st = styleOf(ft);
  if (ft.state === "ledge" || ft.state === "dead" || ft.state === "out" || ft.state === "respawn" || ft.state === "held") return;
  const def = ft.state === "move" ? moveDef(ft.style, ft.move) : null;
  // Pesanteur
  if (isAirborne(ft)) {
    let g = st.gravity * gravityOf(f);
    if (def?.gravity !== undefined) g *= def.gravity;
    if (ft.state === "airdodge" && ft.t < 14) g = 0;
    if (ft.state === "move" && def?.special === "grapple" && ft.wait > 0) g = 0;
    if (ft.state === "move" && def?.special === "stomp" && ft.mt >= 6) g = 0;
    ft.vy -= g * DT;
    const cap = (ft.fastfall ? st.fastFall : st.fall) * (f.settings.lune ? 0.7 : 1);
    if (ft.vy < -cap && !(def?.special === "stomp")) ft.vy = -cap;
  }
  // L'éjection s'use
  const k = Math.hypot(ft.kx, ft.ky);
  if (k > 0) {
    const decay = (isAirborne(ft) ? KB_DECAY : KB_DECAY * 2.2) * DT;
    const nk = Math.max(0, k - decay);
    ft.kx *= nk / k;
    ft.ky *= nk / k;
  }
  const prevY = ft.y;
  // Porté par sa plateforme
  if (!isAirborne(ft)) {
    const p = plats[ft.ground];
    if (p) {
      ft.x += p.dx;
      ft.y = p.y;
    }
  }
  ft.x += (ft.vx + ft.kx) * DT;
  ft.y += (ft.vy + ft.ky) * DT;

  if (!isAirborne(ft)) {
    const p = plats[ft.ground];
    // On s'arrête au bord au lieu de tomber : debout, on ne descend qu'en poussant de nouveau le stick vers le vide une
    // fois arrivé au bord (courir jusqu'au bord ne suffit pas) ; pendant un coup au sol (sans élan), une garde, une
    // roulade ou un atterrissage, toujours
    const off = p ? (ft.x < p.x0 ? -1 : ft.x > p.x1 ? 1 : 0) : 0;
    const sticky =
      (ft.state === "stand" && off !== 0 && !freshPush(ft, x, off)) ||
      (ft.state === "move" && !def?.push) ||
      ft.state === "shield" ||
      ft.state === "shieldstun" ||
      ft.state === "land" ||
      ft.state === "squat" ||
      ft.state === "dodge" ||
      ft.state === "roll" ||
      ft.state === "tech" ||
      ft.state === "down" ||
      ft.state === "holding";
    if (p && sticky && ft.ky <= 0.5 && Math.abs(ft.kx) < 4 && (ft.x < p.x0 || ft.x > p.x1)) {
      ft.x = clamp(ft.x, p.x0, p.x1);
      ft.vx = 0;
    }
    if (ft.ky > 0.5) {
      ft.ground = -1;
    } else if (!p || ft.x < p.x0 - 0.05 || ft.x > p.x1 + 0.05) {
      // Il marche dans le vide
      ft.ground = -1;
      if (ft.state === "stand" || ft.state === "land" || ft.state === "roll" || ft.state === "dodge") setState(ft, "air");
      else if (ft.state === "shield" || ft.state === "shieldstun" || ft.state === "squat" || ft.state === "down" || ft.state === "tech")
        setState(ft, "air");
    } else {
      ft.y = p.y;
      if (ft.ky < -10 && ft.state === "hurt") {
        // Envoyé vers le sol : il rebondit
        ft.ky = -ft.ky * 0.6;
        ft.ground = -1;
      } else if (ft.ky < 0) ft.ky = 0;
    }
  } else {
    const fallSpeed = -(ft.vy + ft.ky);
    if (ft.vy + ft.ky <= 0) {
      for (let i = 0; i < plats.length; i++) {
        const p = plats[i]!;
        if (ft.x < p.x0 - 0.05 || ft.x > p.x1 + 0.05) continue;
        // On traverse une plateforme fine qu'on vient de quitter vers le bas
        if (p.kind !== "solid" && ft.dropUntil > f.frame) continue;
        // Il était au-dessus de la plateforme (là où elle était), il est maintenant dessous
        if (prevY >= p.y - p.dy - 0.02 && ft.y <= p.y) {
          land(f, ft, i, plats, fallSpeed);
          break;
        }
      }
    }
  }

  // Le grand plateau est plein : on ne passe ni à travers ses côtés ni par en dessous
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i]!;
    if (p.kind !== "solid" || ft.ground === i) continue;
    const half = st.w / 2;
    if (ft.x + half <= p.x0 || ft.x - half >= p.x1) continue;
    if (ft.y >= p.y - 0.01 || ft.y + st.hgt <= p.bottom) continue;
    // Par en dessous : on se cogne la tête
    if (prevY + st.hgt <= p.bottom + 0.05) {
      ft.y = p.bottom - st.hgt;
      if (ft.vy > 0) ft.vy = 0;
      if (ft.ky > 0) ft.ky = -ft.ky * 0.3;
      continue;
    }
    // Par le côté : repoussé dehors
    const left = ft.x - p.x0 < p.x1 - ft.x;
    ft.x = left ? p.x0 - half : p.x1 + half;
    if (ft.state === "hurt" && Math.abs(ft.kx) > 8) ft.kx = -ft.kx * 0.4;
    else ft.kx = 0;
    ft.vx = 0;
  }

  if (isAirborne(ft)) tryGrabLedge(f, ft, solo);
}

// ---------------------------------------------------------------------------
// Les attaques : leur déroulé
// ---------------------------------------------------------------------------

function advanceMove(f: Fight, ft: Fighter, inp: Input, solo: boolean) {
  if (ft.state !== "move") return;
  const def = moveDef(ft.style, ft.move);
  if (!def) {
    setState(ft, isAirborne(ft) ? "air" : "stand");
    return;
  }
  // Le petit coup qui a touché s'enchaîne : un nouvel appui juste après sa frappe le relance aussitôt, stick au neutre
  // (avec une direction, c'est le coup de cette direction qu'on veut : il part dès que le petit coup s'annule ou finit).
  // Dans le vide ou dans une garde, il va jusqu'au bout : marteler ne fait pas un mur de petits coups
  if (
    ft.move === "n" &&
    ft.landed &&
    ft.jabs < JAB_SERIES &&
    ft.buf & ATK &&
    dirOf(inp.x, inp.y) === "n" &&
    def.hits.length > 0 &&
    ft.mt > Math.max(...def.hits.map((hd) => hd.to)) + 1
  ) {
    consume(ft, ATK);
    const n = ft.jabs + 1;
    startMove(ft, "n");
    ft.jabs = n;
    return;
  }
  // Les coups simples partent dès l'appui, sans attendre qu'on relâche (le coup fort, lui, se charge en tenant sa touche)
  advanceCharged(f, ft, def, inp, solo);
}

function advanceCharged(f: Fight, ft: Fighter, def: MoveDef, inp: Input, solo: boolean) {
  // La charge : on reste à cette image tant que le bouton est tenu
  if (def.charge && ft.mt === def.charge.at && inp.held & (def.charge.button | FRT) && ft.charge < def.charge.max) {
    ft.charge++;
    if (!isAirborne(ft)) ft.vx *= 0.8;
    return;
  }
  for (const p of def.push ?? []) {
    if (ft.mt >= p.from && ft.mt <= p.to) {
      if (p.vx !== undefined) ft.vx = ft.face * p.vx;
      if (p.vy !== undefined) {
        ft.vy = p.vy;
        ft.ground = -1;
      }
    }
  }
  if (def.special === "stomp" && ft.mt === 6 && isAirborne(ft)) {
    ft.vy = -26;
    ft.vx *= 0.3;
  }
  if (def.special === "stomp" && ft.mt === 8 && isAirborne(ft)) {
    // Il tombe comme une pierre jusqu'au sol : l'attaque attend l'atterrissage
    return;
  }
  if (def.special === "grapple" && ft.mt === 8) grapple(f, ft, solo);
  if (def.special === "grapple" && ft.wait > 0) {
    // Tiré par sa laine jusqu'au rebord
    ft.wait--;
    const spot = hangSpot(f, ft, ft.ledge >= 0 ? ft.ledge : 0);
    const dx = spot.x - ft.x;
    const dy = spot.y - ft.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5 || ft.wait === 0) {
      ft.wait = 0;
      const li = ft.ledge;
      ft.ledge = -1;
      ft.ledgeLock = 0;
      setState(ft, "helpless");
      if (li >= 0 && !tryGrabLedgeAt(f, ft, li, solo)) ft.vy = 4;
      return;
    }
    ft.vx = (dx / d) * 20;
    ft.vy = (dy / d) * 20;
    ft.mt = 9;
    return;
  }
  if (def.special === "trap" && ft.mt === 12) layTrap(f, ft, solo);
  if (ft.move === "g:grab" && ft.mt >= GRAB_FROM && ft.mt <= GRAB_TO && !solo && tryGrab(f, ft)) return;
  if (ft.move === "g:pummel" && ft.mt === 5 && !solo) pummel(f, ft);
  const thr = THROWS[ft.move];
  if (thr && ft.mt === thr.at) {
    if (thr.back) ft.face = ft.face === 1 ? -1 : 1;
    if (!solo) throwHeld(f, ft, thr);
    else ft.holding = -1;
  }
  if (def.shoot && ft.mt === def.shoot.at && !solo) shoot(f, ft, def.shoot.kind, def);
  if (def.shoot && ft.mt === def.shoot.at && def.shoot.kind === "item") {
    // L'objet quitte la main (sur l'appareil aussi : on ne le voit plus dans la main)
    if (ft.item !== "baguette") {
      ft.item = "";
      ft.itemUses = 0;
    }
  }
  if ((ft.move === "g:bagS" || ft.move === "g:bagA" || ft.move === "g:bagC") && ft.mt === 1) {
    ft.itemUses--;
    if (ft.itemUses <= 0) {
      // La baguette casse après son dernier coup
      ft.item = "";
    }
  }
  ft.mt++;
  if (ft.mt >= def.frames) {
    // Après la petite tape, on le tient toujours
    if (ft.move === "g:pummel" && ft.holding >= 0) {
      const wait = ft.wait;
      setState(ft, "holding");
      ft.wait = wait;
      ft.t = 6;
      return;
    }
    if (ft.move === "g:climb" || ft.move === "g:ledgeAtk") ft.intangUntil = Math.max(ft.intangUntil, f.frame + 2);
    if (isAirborne(ft)) setState(ft, def.helpless ? "helpless" : "air");
    else {
      // Un coup au sol qui n'a touché personne (ni corps ni garde) : on reprend son équilibre un instant, de quoi se
      // faire punir. Frapper dans le vide encore et encore ne rapporte plus rien ; le coup qui touche, lui, reste vif
      const whiff = ft.hitIds.length === 0 && ft.holding < 0;
      let lag = whiff ? whiffLag(ft.move, def) : 0;
      // Et celui qui enchaîne les coups dans le vide (ou les tirs) sans bouger s'essouffle : sa reprise s'allonge à
      // chaque fois, jusqu'à ce qu'il bouge, souffle un instant ou touche quelqu'un
      if (whiff && (lag > 0 || def.shoot)) {
        ft.puff++;
        ft.walked = 0;
        lag += puffLag(ft.puff);
      } else if (!whiff) ft.puff = 0;
      if (lag > 0) {
        setState(ft, "land");
        ft.wait = lag;
      } else setState(ft, "stand");
    }
  }
}

/** L'essoufflement (voir Fighter.puff) : dès le deuxième coup dans le vide d'affilée, la reprise s'allonge (de 4 images,
 * puis 8, 12...) ; il passe après tant d'images sans frapper, ou tant de pas */
const PUFF_LAG = [0, 0, 4, 8, 12, 16, 20];
const PUFF_REST = 45;
const PUFF_WALK = 0.75;
export function puffLag(puff: number): number {
  return PUFF_LAG[Math.min(puff, PUFF_LAG.length - 1)]!;
}

/** Ce que coûte un coup manqué au sol, en images : un peu pour le petit coup, plus pour un coup fort ou un spécial */
function whiffLag(key: string, def: MoveDef): number {
  if (key === "g:grab") return WHIFF_GRAB;
  if (def.hits.length === 0) return 0;
  if (key === "n") return 5;
  if (key === "s" || key === "u" || key === "d") return 10;
  if (key === "g:dash") return 10;
  if (key.startsWith("c") || key.startsWith("p")) return 14;
  return 0;
}

/** Une projection ou une petite tape : le coup commence sans lâcher celui qu'on tient */
function startHeldMove(ft: Fighter, key: string) {
  const holding = ft.holding;
  const wait = ft.wait;
  startMove(ft, key);
  ft.holding = holding;
  ft.wait = wait;
}

/** La main tendue attrape-t-elle quelqu'un ? Seulement au sol (en garde aussi), le plus proche */
function tryGrab(f: Fight, a: Fighter): boolean {
  const cx = a.x + a.face * GRAB_X;
  const cy = a.y + GRAB_Y;
  let best: Fighter | null = null;
  for (const v of f.fighters) {
    if (!canHit(f, a, v) || isAirborne(v) || v.state === "held" || v.state === "holding" || v.state === "ledge") continue;
    if (!circleHitsBox(cx, cy, GRAB_R, ...hurtbox(v))) continue;
    if (!best || Math.abs(v.x - a.x) < Math.abs(best.x - a.x)) best = v;
  }
  if (!best) return false;
  const v = best;
  setState(a, "holding");
  a.holding = v.slot;
  a.wait = Math.round(clamp(HOLD_MIN + v.dmg * 0.7, HOLD_MIN, HOLD_MAX));
  a.vx = 0;
  // Celui qu'on tient lâche ce qu'il faisait (sa saisie, son coup, sa garde)
  if (v.holding >= 0) {
    const w = f.fighters[v.holding];
    if (w) letGo(f, v, w);
  }
  setState(v, "held");
  v.holder = a.slot;
  v.vx = v.vy = v.kx = v.ky = 0;
  v.hitstop = 0;
  v.face = a.face === 1 ? -1 : 1;
  pending.push({ k: "grab", a: a.slot, v: v.slot });
  return true;
}

/** Celui qu'on tient reste dans ses mains (calé après que tout le monde a bougé) */
function holdInPlace(f: Fight) {
  for (const v of f.fighters) {
    if (v.state !== "held") continue;
    const h = f.fighters[v.holder];
    if (!h) continue;
    v.x = h.x + h.face * 0.82;
    v.y = h.y + 0.12;
    v.ground = h.ground;
    v.face = h.face === 1 ? -1 : 1;
  }
}

/** Une petite tape : quelques pourcents, sans le lâcher */
function pummel(f: Fight, a: Fighter) {
  const v = f.fighters[a.holding];
  if (!v || v.state !== "held") return;
  const dmg = 1.6;
  v.dmg = Math.min(999, Math.round((v.dmg + dmg) * 10) / 10);
  v.stats.taken += dmg;
  a.stats.dealt += dmg;
  v.lastBy = a.slot;
  v.lastAt = f.frame;
  a.hitstop = 4;
  v.hitstop = 4;
  pending.push({ k: "hit", a: a.slot, v: v.slot, dmg, x: v.x, y: v.y + 0.9, power: 0.12, kind: "hit" });
}

/** La projection part : celui qu'on tenait est éjecté (il peut infléchir sa trajectoire, comme sous un coup) */
function throwHeld(f: Fight, a: Fighter, thr: (typeof THROWS)[string]) {
  const v = f.fighters[a.holding];
  a.holding = -1;
  if (!v || v.state !== "held") return;
  v.holder = -1;
  setState(v, "air");
  v.ground = -1;
  const dirX = a.face;
  launch(
    f,
    {
      attacker: a.slot,
      x: v.x,
      y: v.y + 0.8,
      dirX,
      dmg: thr.dmg,
      ang: thr.ang,
      kb: thr.kb,
      kbg: thr.kbg,
      pull: false,
      charge: 0,
      projectile: false,
    },
    v,
  );
}

/** On se dégage : chacun recule d'un pas */
function letGo(f: Fight, holder: Fighter, v: Fighter) {
  holder.holding = -1;
  v.holder = -1;
  setState(holder, "land");
  holder.wait = 10;
  holder.vx = -holder.face * 4;
  setState(v, isAirborne(v) ? "air" : "land");
  v.wait = 6;
  v.kx = holder.face * 7;
  void f;
}

function tryGrabLedgeAt(f: Fight, ft: Fighter, li: number, solo: boolean): boolean {
  if (!solo && f.fighters.some((o) => o !== ft && o.state === "ledge" && o.ledge === li)) return false;
  const st = styleOf(ft);
  ft.ledge = li;
  const l = ledgesOf(f.arena as ArenaId, f.scale)[li]!;
  ft.face = l.side === -1 ? 1 : -1;
  setState(ft, "ledge");
  ft.jumps = st.jumps;
  ft.airdodged = false;
  ft.sideUsed = false;
  if (ft.ledgeFresh) {
    ft.intangUntil = Math.max(ft.intangUntil, f.frame + LEDGE_INTANG);
    ft.ledgeFresh = false;
  }
  return true;
}

/** Huguette lance sa laine : un rebord à portée, et elle s'y hisse */
function grapple(f: Fight, ft: Fighter, solo: boolean) {
  const ledges = ledgesOf(f.arena as ArenaId, f.scale);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ledges.length; i++) {
    const l = ledges[i]!;
    const dx = l.x - ft.x;
    const dy = l.y - (ft.y + styleOf(ft).hgt);
    // Devant elle ou presque au-dessus, à moins de 5 mètres, et elle doit être hors du plateau
    if ((ft.x - l.x) * l.side < -0.3) continue;
    if (dx * ft.face < -0.8 || dy < -1.2 || dy > 5) continue;
    const d = Math.hypot(dx, dy);
    if (d > 5.2 || d >= bestD) continue;
    if (!solo && f.fighters.some((o) => o !== ft && o.state === "ledge" && o.ledge === i)) continue;
    best = i;
    bestD = d;
  }
  if (best >= 0) {
    ft.ledge = best;
    ft.wait = 18;
  } else {
    ft.vy = 17.5;
    ft.ground = -1;
  }
}

function layTrap(f: Fight, ft: Fighter, solo: boolean) {
  if (solo) return;
  f.traps = f.traps.filter((t) => t.owner !== ft.slot);
  f.projectiles = f.projectiles.filter((p) => !(p.owner === ft.slot && p.kind === "tricot"));
  if (!isAirborne(ft)) {
    f.traps.push({ id: f.nextId++, owner: ft.slot, team: ft.team, x: ft.x + ft.face * 0.7, y: ft.y, on: ft.ground, life: 8 * 60 });
  } else {
    f.projectiles.push(projectile(f, ft, "tricot", ft.x + ft.face * 0.3, ft.y + 0.4, 0));
  }
}

// ---------------------------------------------------------------------------
// Ce qu'on lance
// ---------------------------------------------------------------------------

interface ShotSpec {
  vx: number;
  vy: number;
  g: number;
  life: number;
  r: number;
  dmg: number;
  ang: number;
  kb: number;
  kbg: number;
  bounce?: number;
  pierce?: boolean;
  push?: number;
  rolls?: boolean;
  back?: number;
  pull?: boolean;
  trap?: boolean;
  boom?: boolean;
  /** La hauteur de départ (depuis les pieds) */
  at?: number;
}

export const SHOTS: Record<string, ShotSpec> = {
  cles: { vx: 17, vy: 1, g: 6, life: 50, r: 0.25, dmg: 6, ang: 30, kb: 5, kbg: 8 },
  poudrier: { vx: 10, vy: 7, g: 28, life: 90, r: 0.3, dmg: 9, ang: 45, kb: 6, kbg: 11 },
  bonbons: { vx: 12, vy: 4, g: 20, life: 80, r: 0.3, dmg: 7, ang: 50, kb: 5, kbg: 9, bounce: 2 },
  portemonnaie: { vx: 8, vy: 6, g: 32, life: 90, r: 0.36, dmg: 12, ang: 40, kb: 7, kbg: 13 },
  chaise: { vx: 13, vy: 0.5, g: 0, life: 75, r: 0.55, dmg: 11, ang: 40, kb: 7, kbg: 12, back: 24, pierce: true },
  pelote: { vx: 10, vy: 5, g: 30, life: 100, r: 0.32, dmg: 7, ang: 50, kb: 5, kbg: 9, bounce: 3 },
  lasso: { vx: 24, vy: 0, g: 0, life: 9, r: 0.38, dmg: 4, ang: 0, kb: 0, kbg: 0, pull: true },
  boule: { vx: 5, vy: 9, g: 30, life: 120, r: 0.3, dmg: 10, ang: 45, kb: 6, kbg: 12, bounce: 1, rolls: true },
  tir: { vx: 21, vy: 2.5, g: 9, life: 45, r: 0.3, dmg: 9, ang: 35, kb: 6, kbg: 10 },
  roulee: { vx: 8, vy: 0, g: 30, life: 150, r: 0.3, dmg: 8, ang: 50, kb: 6, kbg: 10, rolls: true, at: 0.3 },
  souffle: { vx: 9, vy: 0, g: 0, life: 40, r: 0.9, dmg: 0, ang: 0, kb: 0, kbg: 0, pierce: true, push: 11 },
  note: { vx: 12, vy: 0, g: 0, life: 34, r: 0.45, dmg: 5, ang: 40, kb: 5, kbg: 7, pierce: true },
  tricot: { vx: 2, vy: 0, g: 30, life: 120, r: 0.3, dmg: 0, ang: 0, kb: 0, kbg: 0, trap: true },
  tarte: { vx: 16, vy: 3, g: 18, life: 70, r: 0.34, dmg: 7, ang: 40, kb: 5, kbg: 8 },
  petard: { vx: 12, vy: 5, g: 28, life: 80, r: 0.26, dmg: 0, ang: 0, kb: 0, kbg: 0, boom: true, bounce: 2 },
  pot: { vx: 13, vy: 4, g: 26, life: 70, r: 0.36, dmg: 13, ang: 40, kb: 7, kbg: 15 },
};

/** Ce que Ginette trouve au fond de son sac */
const RUMMAGE = ["cles", "poudrier", "bonbons", "portemonnaie"];

function projectile(f: Fight, ft: Fighter, kind: string, x: number, y: number, charge: number): Projectile {
  const s = SHOTS[kind]!;
  let vx = s.vx;
  let vy = s.vy;
  if (kind === "boule") {
    vx = 5 + 8 * charge;
    vy = 9 + 3 * charge;
  }
  return {
    id: f.nextId++,
    kind,
    owner: ft.slot,
    team: ft.team,
    x,
    y,
    vx: vx * ft.face,
    vy,
    g: s.g,
    life: s.life,
    r: s.r,
    dmg: s.dmg,
    ang: s.ang,
    kb: s.kb,
    kbg: s.kbg,
    bounce: s.bounce ?? 0,
    pierce: s.pierce ?? false,
    push: s.push ?? 0,
    rolls: s.rolls ?? false,
    hits: [],
    back: s.back ?? 0,
    pull: s.pull ?? false,
    trap: s.trap ?? false,
    boom: s.boom ?? false,
    t: 0,
  };
}

function shoot(f: Fight, ft: Fighter, kind: string, def: MoveDef) {
  const st = styleOf(ft);
  let real = kind;
  if (kind === "rummage") real = RUMMAGE[Math.floor(rand(f) * RUMMAGE.length)]!;
  if (kind === "item") {
    if (!ft.item || ft.item === "baguette") return;
    real = ft.item;
  }
  const spec = SHOTS[real];
  if (!spec) return;
  const charge = def.charge ? ft.charge / def.charge.max : 0;
  const p = projectile(f, ft, real, ft.x + ft.face * (st.w / 2 + 0.25), ft.y + (spec.at ?? st.hgt * 0.6), charge);
  if (kind === "item") {
    // Lancé vers le haut, vers le bas, ou posé au sol
    if (ft.move === "g:throwU") {
      p.vx = ft.face * 2;
      p.vy = 17;
    } else if (ft.move === "g:throwD") {
      if (!isAirborne(ft)) {
        // Posé délicatement devant soi : il redevient un objet par terre
        f.items.push({
          id: f.nextId++,
          kind: real as ItemKind,
          x: ft.x + ft.face * 0.6,
          y: ft.y + 0.3,
          vx: 0,
          vy: 0,
          ground: false,
          life: ITEM_LIFE,
        });
        return;
      }
      p.vx = 0;
      p.vy = -18;
    }
  }
  f.projectiles.push(p);
  pending.push({ k: "throw", v: ft.slot, kind: real });
}

// ---------------------------------------------------------------------------
// La vie de l'arène : de temps en temps, un événement annoncé qui oblige à bouger
// ---------------------------------------------------------------------------

/** Celui de chaque arène */
export const ARENA_HAZARD: Record<ArenaId, HazardKind> = { place: "charrette", clocher: "cloche", bal: "petards", marche: "cagettes" };
/** Le premier, tant d'images après le départ (plus un peu de hasard), puis tant après la fin du précédent */
const HAZARD_FIRST = 20 * 60;
const HAZARD_SPREAD = 10 * 60;
const HAZARD_NEXT = 22 * 60;
/** Le temps de l'annonce, en images : on le voit, on l'entend venir */
export const HAZARD_WARN: Record<HazardKind, number> = { charrette: 100, cloche: 75, petards: 80, cagettes: 80 };
/** La charrette : sa vitesse (m/s), sa demi-longueur, sa hauteur ; elle part d'un peu en dehors du plateau */
export const CART_SPEED = 10;
export const CART_HALF = 0.95;
export const CART_H = 1.3;
const CART_OUT = 1.6;
/** La cloche : où elle pend (au-dessus du toit), et la poussée de son coup, au plus près */
export const BELL_AT = { x: 0, y: 2.2 };
const BELL_PUSH = 22;
/** Le rayon d'un pétard qui éclate, d'une cagette qui tombe */
export const BOOM_R = 1.15;
export const CRATE_R = 0.85;

/** Où est la charrette à cette image (son milieu), et sur quel plateau elle roule */
export function cartAt(h: Hazard, frame: number, plats: readonly PlatformNow[]): { x: number; y: number } {
  const main = plats[0]!;
  const start = h.dir > 0 ? main.x0 - CART_OUT : main.x1 + CART_OUT;
  return { x: start + (h.dir * CART_SPEED * Math.max(0, frame - h.at)) / 60, y: main.y };
}

/** Les points d'impact des pétards ou des cagettes, sur leurs plateformes telles qu'elles sont à cette image */
export function hazardSpots(h: Hazard, plats: readonly PlatformNow[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < h.spots.length; i += 2) {
    const p = plats[h.spots[i]!];
    if (p) out.push({ x: p.x0 + h.spots[i + 1]!, y: p.y });
  }
  return out;
}

function startHazard(f: Fight, kind: HazardKind, plats: PlatformNow[]): Hazard {
  const at = f.frame + HAZARD_WARN[kind];
  const h: Hazard = { kind, from: f.frame, at, to: at + 20, dir: rand(f) < 0.5 ? 1 : -1, spots: [], hit: [] };
  if (kind === "charrette") {
    const main = plats[0]!;
    h.to = at + Math.ceil(((main.x1 - main.x0 + 2 * CART_OUT) / CART_SPEED) * 60);
  } else if (kind === "petards" || kind === "cagettes") {
    // Des points éloignés les uns des autres : les pétards partout (sur les planches aussi), les cagettes sur le plancher
    const n = kind === "petards" ? 3 + (f.fighters.length > 2 ? 1 : 0) : 3 + (f.fighters.length > 3 ? 1 : 0);
    const where = kind === "petards" ? plats.map((_, i) => i) : [0];
    for (let tries = 0; tries < 40 && h.spots.length < n * 2; tries++) {
      const pi = where[Math.floor(rand(f) * where.length)]!;
      const p = plats[pi]!;
      const off = 0.6 + rand(f) * Math.max(0.1, p.x1 - p.x0 - 1.2);
      const x = p.x0 + off;
      if (hazardSpots(h, plats).some((s) => Math.abs(s.x - x) < 2.4 && Math.abs(s.y - p.y) < 1)) continue;
      h.spots.push(pi, Math.round(off * 100) / 100);
    }
  }
  return h;
}

/** Ce que l'arène lui jette : la garde n'y peut rien (il faut s'écarter), et personne n'est l'auteur du coup */
function hazardHit(f: Fight, v: Fighter, x: number, y: number, dirX: number, dmg: number, ang: number, kb: number, kbg: number) {
  if (!vulnerable(f, v)) return;
  if (v.state === "shield" || v.state === "shieldstun") setState(v, "stand");
  applyHit(f, { attacker: -1, x, y, dirX, dmg, ang, kb, kbg, pull: false, charge: 0, projectile: true }, v);
}

function updateHazard(f: Fight, plats: PlatformNow[]) {
  const kind = ARENA_HAZARD[f.arena as ArenaId];
  if (!kind || f.phase !== "fight") return;
  let h = f.hazard;
  if (!h) {
    if (f.frame < f.hazardAt) return;
    h = f.hazard = startHazard(f, kind, plats);
    pending.push({ k: "hazard", kind, go: false });
    return;
  }
  if (f.frame === h.at) pending.push({ k: "hazard", kind, go: true });
  if (f.frame >= h.at && f.frame <= h.to) {
    if (h.kind === "charrette") {
      // Elle renverse ceux qui sont sur le plancher sur son passage (pas ceux qui sautent par-dessus, ni ceux des bancs)
      const cart = cartAt(h, f.frame, plats);
      for (const v of f.fighters) {
        if (h.hit.includes(v.slot) || v.y > cart.y + CART_H || v.y < cart.y - 0.5) continue;
        if (Math.abs(v.x - cart.x) > CART_HALF + styleOf(v).w / 2) continue;
        if (!vulnerable(f, v)) continue;
        h.hit.push(v.slot);
        hazardHit(f, v, cart.x + h.dir * CART_HALF, cart.y + 0.7, h.dir, 9, 70, 7, 9);
      }
    } else if (f.frame === h.at) {
      if (h.kind === "cloche") {
        // Le coup de la cloche repousse tout le monde vers le bord, d'autant plus fort qu'on est près d'elle ; la garde tient
        for (const v of f.fighters) {
          if (!vulnerable(f, v) || v.state === "ledge") continue;
          const side = v.x < BELL_AT.x ? -1 : 1;
          const k = clamp(1 - Math.abs(v.x - BELL_AT.x) / 9, 0.35, 1);
          const guard = v.state === "shield" || v.state === "shieldstun" ? 0.35 : 1;
          v.kx += side * BELL_PUSH * k * guard;
          if (isAirborne(v)) v.ky = Math.max(v.ky, 2);
          pending.push({ k: "hit", a: -1, v: v.slot, dmg: 0, x: v.x, y: v.y + 1, power: 0.2 * k, kind: "push" });
        }
      } else {
        const boom = h.kind === "petards";
        for (const s of hazardSpots(h, plats)) {
          for (const v of f.fighters) {
            if (!circleHitsBox(s.x, s.y + 0.5, boom ? BOOM_R : CRATE_R, ...hurtbox(v))) continue;
            const dir = v.x < s.x ? -1 : 1;
            if (boom) hazardHit(f, v, s.x, s.y + 0.5, dir, 8, 80, 6, 9);
            else hazardHit(f, v, s.x, s.y + 0.6, dir, 10, 50, 7, 8);
          }
        }
      }
    }
  }
  if (f.frame >= h.to) {
    f.hazard = null;
    f.hazardAt = f.frame + HAZARD_NEXT + Math.floor(rand(f) * HAZARD_SPREAD);
  }
}

// ---------------------------------------------------------------------------
// Les objets de l'arène
// ---------------------------------------------------------------------------

/**
 * Les objets à aller chercher : ils tombent surtout en hauteur (les bancs, le toit du kiosque, les auvents, les planches du
 * bal), et les plus utiles (le gâteau qui soigne, la baguette, le pot, le café) seulement là-haut ; sur le grand plateau,
 * rien que des tartes et des pétards. Il faut monter, et s'y disputer la place.
 */
export const HIGH_ITEMS: readonly ItemKind[] = ["gateau", "baguette", "pot", "cafe"];
const HIGH_WEIGHTS: Record<ItemKind, number> = { tarte: 1, petard: 1, pot: 2, baguette: 3, gateau: 3, cafe: 2 };
const LOW_WEIGHTS: Record<ItemKind, number> = { tarte: 3, petard: 2, pot: 0, baguette: 0, gateau: 0, cafe: 0 };
/** La part des objets qui tombent en hauteur (quand l'arène a de quoi monter) */
const HIGH_SHARE = 0.7;

function firstItemDelay(f: Fight): number {
  if (f.settings.items === "aucun") return Infinity;
  return f.settings.items === "beaucoup" ? 240 + Math.floor(rand(f) * 120) : 360 + Math.floor(rand(f) * 180);
}

function nextItemDelay(f: Fight): number {
  return f.settings.items === "beaucoup" ? 240 + Math.floor(rand(f) * 180) : 480 + Math.floor(rand(f) * 240);
}

function spawnItem(f: Fight, plats: PlatformNow[]) {
  const max = f.settings.items === "beaucoup" ? 5 : 3;
  if (f.items.length >= max) return;
  // Où il tombe : le plus souvent sur une plateforme en hauteur
  const high = plats.filter((q) => q.kind !== "solid");
  const up = high.length > 0 && rand(f) < HIGH_SHARE;
  const among = up ? high : plats.filter((q) => q.kind === "solid");
  const p = among[Math.floor(rand(f) * among.length)] ?? plats[0]!;
  const weights = up || high.length === 0 ? HIGH_WEIGHTS : LOW_WEIGHTS;
  let total = 0;
  for (const k of ITEM_KINDS) total += weights[k];
  let r = rand(f) * total;
  let kind: ItemKind = "tarte";
  for (const k of ITEM_KINDS) {
    r -= weights[k];
    if (r < 0) {
      kind = k;
      break;
    }
  }
  // Il tombe du ciel, au-dessus de sa plateforme
  const x = p.x0 + 0.6 + rand(f) * Math.max(0.1, p.x1 - p.x0 - 1.2);
  const item: FieldItem = { id: f.nextId++, kind, x, y: p.y + 6, vx: 0, vy: 0, ground: false, life: ITEM_LIFE };
  f.items.push(item);
  pending.push({ k: "item", id: item.id, kind, x: item.x, y: item.y });
}

function pickUp(f: Fight, ft: Fighter, it: FieldItem) {
  f.items = f.items.filter((i) => i !== it);
  ft.stats.items++;
  pending.push({ k: "pick", v: ft.slot, kind: it.kind });
  if (it.kind === "gateau") {
    ft.dmg = Math.max(0, ft.dmg - GATEAU_HEAL);
    return;
  }
  if (it.kind === "cafe") {
    ft.fastUntil = f.frame + CAFE_FRAMES;
    return;
  }
  ft.item = it.kind;
  ft.itemUses = it.kind === "baguette" ? 8 : 1;
}

function updateItems(f: Fight, plats: PlatformNow[]) {
  for (const it of f.items) {
    it.life--;
    if (it.ground) {
      // Posé sur une plateforme qui bouge : il la suit, et tombe si elle s'en va
      const p = plats.find((q) => it.x >= q.x0 && it.x <= q.x1 && Math.abs(q.y - q.dy - it.y) < 0.05);
      if (p) {
        it.x += p.dx;
        it.y = p.y;
      } else it.ground = false;
      continue;
    }
    const prev = it.y;
    it.vy = Math.max(-16, it.vy - 30 * DT);
    it.x += it.vx * DT;
    it.y += it.vy * DT;
    for (const p of plats) {
      if (it.x < p.x0 || it.x > p.x1) continue;
      if (prev >= p.y - 0.02 && it.y <= p.y) {
        it.y = p.y;
        it.vy = 0;
        it.vx = 0;
        it.ground = true;
        break;
      }
    }
  }
  const b = blastOf(f.arena as ArenaId, f.scale);
  f.items = f.items.filter((it) => it.life > 0 && it.y > b.bottom);
}

// ---------------------------------------------------------------------------
// Les coups qui portent
// ---------------------------------------------------------------------------

/** Ce qui se passe pendant ce pas : rendu à la fin, et aussi par les fonctions appelées en chemin */
let pending: FightEvent[] = [];

interface HitSource {
  attacker: number;
  x: number;
  y: number;
  dirX: number;
  dmg: number;
  ang: number;
  kb: number;
  kbg: number;
  pull: boolean;
  /** La force de la charge (0 à 1) */
  charge: number;
  projectile: boolean;
  /** Le dernier petit coup d'une série : il repousse, mais l'autre reprend vite ses esprits (pas d'enchaînement derrière) */
  finisher?: boolean;
  /** L'usure du coup (1 : frais) */
  stale?: number;
  /** Donné avec de l'élan : il pousse plus loin d'autant (voir elanBoost) */
  elan?: number;
}

function canHit(f: Fight, a: { slot: number; team: number }, v: Fighter): boolean {
  if (v.slot === a.slot) return false;
  if (f.settings.teams && !f.settings.friendlyFire && v.team === a.team) return false;
  return vulnerable(f, v);
}

function hitboxActive(ft: Fighter, def: MoveDef): HitDef[] {
  if (def.special === "stomp" && isAirborne(ft) && ft.mt >= 6 && ft.mt <= 8) return [STOMP_AIR];
  return def.hits.filter((hd) => ft.mt >= hd.from && ft.mt <= hd.to);
}

const STOMP_AIR: HitDef = { from: 6, to: 8, x: 0, y: -0.05, r: 0.65, dmg: 12, ang: -80, kb: 8, kbg: 12 };

function applyHit(f: Fight, src: HitSource, v: Fighter) {
  const a = src.attacker >= 0 ? f.fighters[src.attacker] : undefined;
  const vdef = v.state === "move" ? moveDef(v.style, v.move) : null;
  // Simone pare et rend le coup (pas ce que l'arène lui jette)
  if (src.attacker >= 0 && vdef?.counter && v.mt >= vdef.counter[0] && v.mt <= vdef.counter[1]) {
    v.intangUntil = f.frame + 24;
    v.mt = Math.max(v.mt, vdef.counter[1] + 1);
    pending.push({ k: "hit", a: v.slot, v: src.attacker, dmg: 0, x: v.x, y: v.y + 0.9, power: 0.6, kind: "counter" });
    if (a && !src.projectile && Math.abs(a.x - v.x) < 3.5) {
      v.face = a.x < v.x ? -1 : 1;
      const back: HitSource = {
        attacker: v.slot,
        x: a.x,
        y: a.y + 0.8,
        dirX: v.face,
        dmg: Math.max(8, src.dmg * 1.3),
        ang: 40,
        kb: 9,
        kbg: 18,
        pull: false,
        charge: 0,
        projectile: false,
      };
      if (vulnerable(f, a)) launch(f, back, a);
    }
    return;
  }
  // La parade : la garde levée juste à temps ; rien ne s'use, et l'attaquant reste figé un instant
  if (v.state === "shield" && v.t <= PARRY_FRAMES && !src.pull) {
    v.hitstop = 6;
    v.t = PARRY_FRAMES + 1;
    if (a && !src.projectile) a.hitstop = 6 + PARRY_STUN;
    pending.push({ k: "hit", a: src.attacker, v: v.slot, dmg: 0, x: src.x, y: src.y, power: 0.7, kind: "parry" });
    return;
  }
  // La garde : elle s'use, et on recule un peu
  if ((v.state === "shield" || v.state === "shieldstun") && !src.pull) {
    v.shield -= src.dmg * (1 + src.charge * 0.5);
    setState(v, "shieldstun");
    // Assez court pour punir celui qui frappe dans la garde (le saisir en sortant de garde, par exemple)
    v.wait = Math.round(4 + src.dmg * 0.6);
    v.kx = src.dirX * (1.5 + src.dmg * 0.18);
    const stop = Math.round(clamp(3 + src.dmg * 0.3, 3, 10));
    v.hitstop = stop;
    if (a && !src.projectile) a.hitstop = stop;
    pending.push({
      k: "hit",
      a: src.attacker,
      v: v.slot,
      dmg: src.dmg,
      x: src.x,
      y: src.y,
      power: clamp(src.dmg / 20, 0, 1),
      kind: "shield",
    });
    if (v.shield <= 0) breakShield(v);
    return;
  }
  launch(f, src, v);
}

/** Les pourcents, puis l'éjection d'autant plus forte qu'ils sont hauts */
function launch(f: Fight, src: HitSource, v: Fighter) {
  // Encore étourdi par le coup d'avant du même attaquant : c'est un enchaînement (dit avant que le coup ne change rien)
  const chained = v.state === "hurt" && src.attacker >= 0 && v.lastBy === src.attacker;
  const a = src.attacker >= 0 ? f.fighters[src.attacker] : undefined;
  if (v.holding >= 0) {
    const w = f.fighters[v.holding];
    v.holding = -1;
    if (w && w.state === "held") {
      w.holder = -1;
      setState(w, isAirborne(w) ? "air" : "stand");
    }
  }
  if (v.state === "held" && src.attacker !== v.holder) {
    const h = f.fighters[v.holder];
    if (h && h.holding === v.slot) {
      h.holding = -1;
      setState(h, "stand");
    }
  }
  v.holder = -1;
  const st = styleOf(v);
  const dmg = Math.round(src.dmg * (1 + CHARGE_BONUS * src.charge) * 10) / 10;
  v.dmg = Math.min(999, Math.round((v.dmg + dmg) * 10) / 10);
  v.stats.taken += dmg;
  if (a) {
    a.stats.dealt += dmg;
    v.lastBy = a.slot;
    v.lastAt = f.frame;
  }
  const vdef = v.state === "move" ? moveDef(v.style, v.move) : null;
  const armored = vdef?.armor && v.mt >= vdef.armor[0] && v.mt <= vdef.armor[1];
  const stop = Math.round(clamp(4 + dmg * 0.5, 4, 16));
  if (a && !src.projectile) a.hitstop = stop;
  v.hitstop = stop;
  if (armored) {
    pending.push({ k: "hit", a: src.attacker, v: v.slot, dmg, x: src.x, y: src.y, power: 0.15, kind: "hit" });
    return;
  }
  if (src.pull && a) {
    // Le lasso : ramené aux pieds de Huguette
    setState(v, "caught");
    v.wait = 22;
    // Juste assez d'élan pour arriver à ses pieds
    const gap = Math.max(0, Math.abs(a.x - v.x) - 0.9);
    v.kx = sign(a.x - v.x) * Math.sqrt(2 * (isAirborne(v) ? KB_DECAY : KB_DECAY * 2.2) * gap);
    v.ky = isAirborne(v) ? 2 : 0;
    v.vx = v.vy = 0;
    v.face = a.x < v.x ? -1 : 1;
    pending.push({ k: "hit", a: src.attacker, v: v.slot, dmg, x: src.x, y: src.y, power: 0.2, kind: "hit" });
    return;
  }
  let speed = launchSpeed(src.kb, src.kbg, v.dmg, st.weight, src.charge) * staleKnock(src.stale ?? 1) * (src.elan ?? 1);
  let ang = src.ang;
  // Un coup vers le bas sur quelqu'un au sol le soulève
  if (ang < 0 && !isAirborne(v)) {
    ang = 40;
    speed *= 0.8;
  }
  const rad = ang * deg;
  v.kx = Math.cos(rad) * speed * src.dirX;
  v.ky = Math.sin(rad) * speed;
  v.vx = 0;
  v.vy = 0;
  v.lastKb = speed;
  if (v.ky > 1) v.ground = -1;
  if (v.state === "ledge") {
    v.ledge = -1;
    v.ground = -1;
  }
  setState(v, "hurt");
  v.stun = Math.round(HITSTUN_BASE + speed * HITSTUN_K);
  if (src.finisher) v.stun = Math.min(v.stun, FINISHER_STUN);
  // Le coup a porté : l'attaquant pourra enchaîner
  if (a && !src.projectile && a.state === "move") a.landed = true;
  v.wait = 0;
  v.fastfall = false;
  // Le coup qui va le sortir : un long arrêt sur image, le temps que l'écran s'approche (attaquant et victime figés)
  const ko = speed > 18 && willLeave(f, v);
  if (ko) {
    v.hitstop = KO_STOP;
    if (a && !src.projectile) a.hitstop = KO_STOP;
  }
  // Un gros coup fait lâcher ce qu'on tient
  if (speed > 25 && v.item) {
    f.items.push({ id: f.nextId++, kind: v.item, x: v.x, y: v.y + 0.6, vx: -src.dirX * 2, vy: 6, ground: false, life: ITEM_LIFE });
    v.item = "";
  }
  pending.push({
    k: "hit",
    a: src.attacker,
    v: v.slot,
    dmg,
    x: src.x,
    y: src.y,
    power: ko ? 1 : clamp(speed / 50, 0, 1),
    kind: "hit",
    ...(ko ? { ko: true } : {}),
    ...(chained ? { chain: true } : {}),
    ...((src.elan ?? 1) > 1 ? { elan: true } : {}),
  });
}

/** L'influence : jusqu'à tant de degrés de plus ou de moins, selon le stick tenu en travers de la trajectoire */
export const DI_MAX = 14;

/** Éjecté : on tourne un peu son élan vers le côté où l'on tient le stick (seulement pour un vrai coup) */
function influence(v: Fighter, inp: Input) {
  const speed = Math.hypot(v.kx, v.ky);
  if (speed <= 15) return;
  const lx = v.kx / speed;
  const ly = v.ky / speed;
  // La part du stick perpendiculaire à l'élan : positive, elle le tourne dans le sens inverse des aiguilles d'une montre
  const perp = clamp(inp.x * -ly + inp.y * lx, -1, 1);
  if (perp === 0) return;
  const a = perp * DI_MAX * deg;
  const c = Math.cos(a);
  const s = Math.sin(a);
  v.kx = speed * (lx * c - ly * s);
  v.ky = speed * (lx * s + ly * c);
  if (v.ky > 1) v.ground = -1;
}

/** Lancé ainsi, sortira-t-il de l'arène (par un côté ou par le haut) ? On suit sa course sans qu'il ne fasse rien */
function willLeave(f: Fight, v: Fighter): boolean {
  const b = blastOf(f.arena as ArenaId, f.scale);
  const st = styleOf(v);
  const g = st.gravity * gravityOf(f);
  const cap = st.fall * (f.settings.lune ? 0.7 : 1);
  let x = v.x;
  let y = v.y;
  let vy = 0;
  let kx = v.kx;
  let ky = v.ky;
  for (let i = 0; i < 240; i++) {
    vy = Math.max(-cap, vy - g * DT);
    const k = Math.hypot(kx, ky);
    if (k > 0) {
      const nk = Math.max(0, k - KB_DECAY * DT);
      kx *= nk / k;
      ky *= nk / k;
    }
    x += kx * DT;
    y += (vy + ky) * DT;
    if (x < b.left || x > b.right || y > b.top) return true;
    if (k < 1 && vy + ky < 0) return false;
  }
  return false;
}

function detectHits(f: Fight) {
  const found: { src: HitSource; v: Fighter }[] = [];
  const taken = new Set<string>();
  for (const a of f.fighters) {
    if (a.state !== "move" || a.hitstop > 0) continue;
    const def = moveDef(a.style, a.move);
    if (!def) continue;
    const active = hitboxActive(a, def);
    if (active.length === 0) continue;
    const charge = def.charge ? a.charge / def.charge.max : 0;
    for (const v of f.fighters) {
      if (!canHit(f, a, v)) continue;
      const idx = a.hitIds.indexOf(v.slot);
      let hit: HitDef | null = null;
      let hx = 0;
      let hy = 0;
      for (const hd of active) {
        // Les coups multiples retouchent au fil du coup (pas du temps : l'arrêt sur image ne compte pas)
        if (idx >= 0 && !(hd.rehit && a.mt - a.hitAt[idx]! >= hd.rehit)) continue;
        const box = hurtbox(v);
        for (const side of hd.both ? [1, -1] : [1]) {
          const cx = a.x + a.face * side * hd.x;
          const cy = a.y + hd.y;
          if (circleHitsBox(cx, cy, hd.r, ...box)) {
            hit = hd;
            hx = cx;
            hy = cy;
            break;
          }
        }
        if (hit) break;
      }
      if (!hit) continue;
      const key = `${a.slot}>${v.slot}`;
      if (taken.has(key)) continue;
      taken.add(key);
      if (idx >= 0) a.hitAt[idx] = a.mt;
      else {
        a.hitIds.push(v.slot);
        a.hitAt.push(a.mt);
      }
      const dirX = hit.both ? (v.x < a.x ? -1 : 1) : a.face;
      // Le dernier petit coup d'une série repousse l'autre hors de portée
      const finisher = a.move === "n" && a.jabs >= JAB_SERIES;
      // Un coup répété s'use (et compte dans la file une fois par coup, même s'il touche plusieurs fois)
      const fresh = staleFactor(a, a.move);
      if (idx < 0 && a.hitIds.length === 1) noteStale(a, a.move);
      found.push({
        src: {
          attacker: a.slot,
          x: hx,
          y: hy,
          dirX,
          dmg: Math.round(hit.dmg * fresh * elanBoost(a).dmg * 10) / 10,
          ang: finisher ? 38 : hit.ang,
          kb: finisher ? hit.kb * 3 + 6 : hit.kb,
          kbg: finisher ? hit.kbg * 1.5 : hit.kbg,
          pull: hit.pull ?? false,
          charge,
          projectile: false,
          finisher,
          stale: fresh,
          elan: elanBoost(a).kb,
        },
        v,
      });
    }
  }
  for (const { src, v } of found) applyHit(f, src, v);
}

function explode(f: Fight, p: Projectile) {
  const r = 1.7;
  pending.push({ k: "boom", x: p.x, y: p.y, r });
  for (const v of f.fighters) {
    if (!vulnerable(f, v)) continue;
    if (!circleHitsBox(p.x, p.y, r, ...hurtbox(v))) continue;
    if (f.settings.teams && !f.settings.friendlyFire && v.team === p.team && v.slot !== p.owner) continue;
    applyHit(
      f,
      {
        attacker: p.owner === v.slot ? -1 : p.owner,
        x: v.x,
        y: v.y + 0.8,
        dirX: v.x < p.x ? -1 : 1,
        dmg: 15,
        ang: 65,
        kb: 9,
        kbg: 19,
        pull: false,
        charge: 0,
        projectile: true,
      },
      v,
    );
  }
}

function updateProjectiles(f: Fight, plats: PlatformNow[]) {
  const b = blastOf(f.arena as ArenaId, f.scale);
  const keep: Projectile[] = [];
  for (const p of f.projectiles) {
    p.t++;
    p.life--;
    const owner = f.fighters[p.owner];
    // La chaise revient vers Marcel
    if (p.back > 0 && p.t >= p.back && owner) {
      const dx = owner.x - p.x;
      const dy = owner.y + 0.9 - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.8) continue;
      p.vx = (dx / d) * 15;
      p.vy = (dy / d) * 15;
    }
    const prevY = p.y;
    p.vy -= p.g * DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    let gone = false;
    if (p.g > 0) {
      for (let i = 0; i < plats.length; i++) {
        const q = plats[i]!;
        if (p.x < q.x0 || p.x > q.x1) continue;
        const top = q.y + p.r * (p.rolls ? 1 : 0.4);
        if (prevY >= top - 0.05 && p.y <= top && p.vy <= 0) {
          p.y = top;
          if (p.trap) {
            f.traps = f.traps.filter((t) => t.owner !== p.owner);
            f.traps.push({ id: f.nextId++, owner: p.owner, team: p.team, x: p.x, y: q.y, on: i, life: 8 * 60 });
            gone = true;
          } else if (p.bounce > 0) {
            p.bounce--;
            p.vy = -p.vy * 0.55;
          } else if (p.rolls) {
            p.vy = 0;
            p.vx *= 0.995;
            p.x += q.dx;
          } else if (p.boom) {
            explode(f, p);
            gone = true;
          } else gone = true;
          break;
        }
      }
    }
    // Contre le flanc du grand plateau, ça s'arrête
    for (const q of plats) {
      if (q.kind !== "solid") continue;
      if (p.x > q.x0 && p.x < q.x1 && p.y < q.y - 0.1 && p.y > q.bottom) {
        if (p.boom) explode(f, p);
        gone = true;
      }
    }
    if (gone) continue;
    if (p.life <= 0) {
      if (p.boom) explode(f, p);
      continue;
    }
    if (p.x < b.left || p.x > b.right || p.y < b.bottom || p.y > b.top + 4) continue;
    if (p.trap) {
      keep.push(p);
      continue;
    }
    // Touche-t-il quelqu'un ?
    let used = false;
    for (const v of f.fighters) {
      if (p.hits.includes(v.slot)) continue;
      if (!canHit(f, { slot: p.owner, team: p.team }, v)) continue;
      if (!circleHitsBox(p.x, p.y, p.r, ...hurtbox(v))) continue;
      p.hits.push(v.slot);
      if (p.boom) {
        explode(f, p);
        used = true;
        break;
      }
      if (p.push > 0) {
        if (v.state === "ledge") continue;
        v.kx += sign(p.vx) * p.push;
        if (isAirborne(v)) v.ky = Math.max(v.ky, 1.5);
        pending.push({ k: "hit", a: p.owner, v: v.slot, dmg: 0, x: p.x, y: p.y, power: 0.15, kind: "push" });
        continue;
      }
      const vdef = v.state === "move" ? moveDef(v.style, v.move) : null;
      const countered = vdef?.counter && v.mt >= vdef.counter[0] && v.mt <= vdef.counter[1];
      applyHit(
        f,
        {
          attacker: p.owner,
          x: p.x,
          y: p.y,
          dirX: sign(p.vx === 0 ? v.x - p.x : p.vx),
          dmg: p.dmg,
          ang: p.ang,
          kb: p.kb,
          kbg: p.kbg,
          pull: p.pull,
          charge: 0,
          projectile: true,
        },
        v,
      );
      if (p.kind === "tarte" && !countered && v.state === "hurt") v.creamUntil = f.frame + 180;
      if (!p.pierce || countered) {
        used = true;
        break;
      }
    }
    if (!used) keep.push(p);
  }
  f.projectiles = keep;
}

function updateTraps(f: Fight) {
  const keep: Trap[] = [];
  for (const t of f.traps) {
    t.life--;
    if (t.life <= 0) continue;
    let sprung = false;
    for (const v of f.fighters) {
      if (v.ground !== t.on || Math.abs(v.x - t.x) > 0.55) continue;
      if (!canHit(f, { slot: t.owner, team: t.team }, v)) continue;
      // Pris dans le tricot
      v.dmg = Math.min(999, v.dmg + 4);
      v.lastBy = t.owner;
      v.lastAt = f.frame;
      setState(v, "caught");
      v.wait = TRAP_STUCK;
      v.vx = 0;
      v.kx = 0;
      pending.push({ k: "trap", v: v.slot });
      sprung = true;
      break;
    }
    if (!sprung) keep.push(t);
  }
  f.traps = keep;
}

// ---------------------------------------------------------------------------
// Sorties, retours, fin
// ---------------------------------------------------------------------------

function checkBlast(f: Fight) {
  const b = blastOf(f.arena as ArenaId, f.scale);
  // Ceux qui sortent pour de bon sur cette même image : ils partagent la meilleure de leurs places (pas d'avantage au
  // numéro de siège)
  const outNow: Fighter[] = [];
  for (const ft of f.fighters) {
    if (ft.state === "dead" || ft.state === "out" || ft.state === "respawn") continue;
    const top = ft.y > b.top && ft.state === "hurt";
    const side = ft.x < b.left ? "left" : ft.x > b.right ? "right" : ft.y < b.bottom ? "bottom" : top ? "top" : null;
    if (!side) continue;
    const credited = ft.lastBy >= 0 && ft.lastBy !== ft.slot && f.frame - ft.lastAt <= CREDIT_FRAMES ? ft.lastBy : -1;
    pending.push({ k: "ko", v: ft.slot, by: credited, x: clamp(ft.x, b.left, b.right), y: clamp(ft.y, b.bottom, b.top), side });
    ft.stats.falls++;
    if (credited >= 0) {
      const by = f.fighters[credited]!;
      by.stats.kos++;
      by.stats.lowKo = Math.min(by.stats.lowKo, ft.dmg);
      if (f.settings.mode === "temps") by.score++;
    }
    if (f.settings.mode === "temps") ft.score--;
    else ft.stocks--;
    ft.item = "";
    ft.creamUntil = 0;
    ft.fastUntil = 0;
    ft.vx = ft.vy = ft.kx = ft.ky = 0;
    ft.ledge = -1;
    ft.ground = -1;
    setState(ft, "dead");
    ft.wait = DEAD_FRAMES;
    if (f.settings.mode !== "temps" && ft.stocks <= 0) {
      f.outCount++;
      outNow.push(ft);
      const rank = f.fighters.length - f.outCount + 1;
      for (const o of outNow) o.rank = rank;
      for (const e of pending) if (e.k === "out" && outNow.some((o) => o.slot === e.v)) e.rank = rank;
      setState(ft, "out");
      pending.push({ k: "out", v: ft.slot, rank });
    }
  }
}

function updateDead(f: Fight) {
  for (const ft of f.fighters) {
    if (ft.state !== "dead") continue;
    ft.wait--;
    if (ft.wait > 0) continue;
    const spot = respawnPoint(f.arena as ArenaId, f.scale, ft.slot);
    ft.x = spot.x;
    ft.y = spot.y;
    ft.dmg = 0;
    ft.shield = SHIELD_MAX;
    ft.face = spot.x > 0 ? -1 : 1;
    ft.intangUntil = f.frame + RESPAWN_WAIT + RESPAWN_INTANG;
    setState(ft, "respawn");
    pending.push({ k: "back", v: ft.slot });
  }
}

/** Ceux qui sont encore en jeu, par équipe (ou chacun pour soi) */
function sidesAlive(f: Fight): Set<number> {
  const out = new Set<number>();
  for (const ft of f.fighters) if (ft.state !== "out") out.add(f.settings.teams ? ft.team : ft.slot);
  return out;
}

/** Les places à la fin : les vies (ou les points), puis les pourcents ; en équipes, l'équipe entière partage sa place */
export function finalRanks(f: Fight): number[] {
  const n = f.fighters.length;
  const key = (ft: Fighter): [number, number] => {
    if (f.settings.mode === "temps") return [ft.score, 0];
    if (ft.state === "out") return [-1000 + (n - ft.rank), 0];
    return [ft.stocks, -ft.dmg];
  };
  const better = (a: [number, number], b: [number, number]) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  if (f.settings.teams) {
    const teams = [...new Set(f.fighters.map((ft) => ft.team))];
    const score = new Map<number, [number, number]>();
    for (const t of teams) {
      const members = f.fighters.filter((ft) => ft.team === t);
      if (f.settings.mode === "temps") score.set(t, [members.reduce((s, m) => s + m.score, 0), 0]);
      else {
        const alive = members.filter((m) => m.state !== "out");
        const lastOut = Math.min(...members.map((m) => (m.state === "out" ? m.rank : 0)).filter((r) => r > 0), n + 1);
        score.set(
          t,
          alive.length > 0 ? [alive.reduce((s, m) => s + m.stocks, 0), -alive.reduce((s, m) => s + m.dmg, 0)] : [-1000 + (n - lastOut), 0],
        );
      }
    }
    return f.fighters.map((ft) => 1 + teams.filter((t) => better(score.get(t)!, score.get(ft.team)!)).length);
  }
  return f.fighters.map((ft) => 1 + f.fighters.filter((o) => better(key(o), key(ft))).length);
}

function finish(f: Fight) {
  f.phase = "over";
  f.clock = OVER_FRAMES;
  const ranks = finalRanks(f);
  f.fighters.forEach((ft, i) => (ft.rank = ranks[i]!));
  f.winners = f.fighters.filter((ft) => ft.rank === 1).map((ft) => ft.slot);
  pending.push({ k: "end" });
}

// ---------------------------------------------------------------------------
// Un pas
// ---------------------------------------------------------------------------

/** Un combattant avance d'un pas : ce qu'il demande, son corps, son attaque. `solo` : sur l'appareil, sans les autres. */
export function updateFighter(f: Fight, ft: Fighter, inp: Input, plats: PlatformNow[], solo = false) {
  if (ft.state === "out") return;
  if (ft.hitstop > 0) {
    ft.hitstop--;
    // Le coup encaissé, à la fin de l'arrêt sur image : le stick tenu infléchit la trajectoire (on a le temps de réagir)
    if (ft.hitstop === 0 && ft.state === "hurt") influence(ft, inp);
    if (inp.pressed) {
      ft.buf |= inp.pressed;
      ft.bufT = BUFFER_FRAMES + ft.hitstop;
    }
    ft.px = inp.x;
    ft.py = inp.y;
    ft.ph = inp.held;
    return;
  }
  if (inp.pressed) {
    ft.buf |= inp.pressed;
    ft.bufT = BUFFER_FRAMES;
  }
  if (ft.state === "dead") {
    ft.px = inp.x;
    ft.py = inp.y;
    ft.ph = inp.held;
    return;
  }
  ft.t++;
  // Le saut lâché tout au début de la montée : il s'arrête à la hauteur d'un petit saut (même en lançant une attaque)
  if (ft.hopLeft > 0) {
    ft.hopLeft--;
    if ((inp.held & JMP) === 0 && inp.y <= 0.6 && ft.ground < 0 && ft.vy > 0) {
      ft.vy = Math.min(ft.vy, styleOf(ft).short * jumpOf(f, ft));
      ft.hopLeft = 0;
    }
  }
  if (ft.state !== "shield" && ft.shield < SHIELD_MAX && ft.state !== "dizzy") ft.shield = Math.min(SHIELD_MAX, ft.shield + SHIELD_REGEN);
  soloStep = solo;
  control(f, ft, inp, plats);
  physics(f, ft, plats, solo, inp.x);
  advanceMove(f, ft, inp, solo);
  ft.px = inp.x;
  ft.py = inp.y;
  ft.ph = inp.held;
  if (ft.bufT > 0) ft.bufT--;
  if (ft.bufT === 0) ft.buf = 0;
}

/** Deux corps au sol l'un dans l'autre s'écartent doucement (on ne se tient pas dans l'adversaire, où les coups passent
 * à côté) ; la roulade passe au travers, et la saisie garde ses deux combattants collés */
const BODY_PUSH = 0.02;
const PUSHED: ReadonlySet<FState> = new Set<FState>([
  "stand",
  "land",
  "squat",
  "move",
  "shield",
  "shieldstun",
  "dodge",
  "tech",
  "down",
  "dizzy",
  "hurt",
]);

function separate(f: Fight, plats: PlatformNow[]) {
  const fs = f.fighters;
  for (let i = 0; i < fs.length; i++) {
    const a = fs[i]!;
    if (!PUSHED.has(a.state) || isAirborne(a)) continue;
    for (let j = i + 1; j < fs.length; j++) {
      const b = fs[j]!;
      if (!PUSHED.has(b.state) || isAirborne(b) || b.ground !== a.ground) continue;
      const dx = b.x - a.x;
      const gap = (styleOf(a).w + styleOf(b).w) * 0.35 - Math.abs(dx);
      if (gap <= 0) continue;
      // (exactement l'un sur l'autre : le premier à gauche)
      const dir = dx < 0 ? -1 : 1;
      const push = Math.min(gap / 2, BODY_PUSH);
      const p = plats[a.ground];
      a.x -= dir * push;
      b.x += dir * push;
      if (p) {
        a.x = clamp(a.x, p.x0, p.x1);
        b.x = clamp(b.x, p.x0, p.x1);
      }
    }
  }
}

/** Les plateformes à l'image courante */
export function platformsNow(f: Fight): PlatformNow[] {
  return platformsAt(f.arena as ArenaId, f.scale, f.frame);
}

/** Un pas du combat entier, sur le serveur : les commandes de chacun (dans l'ordre des places) */
export function stepFight(f: Fight, inputs: Input[]): FightEvent[] {
  pending = [];
  if (f.phase === "over") {
    if (f.clock > 0) f.clock--;
    return [];
  }
  f.frame++;
  if (f.phase === "intro") {
    f.clock--;
    if (f.clock <= 0) {
      f.phase = "fight";
      f.clock = 0;
      pending.push({ k: "go" });
    }
    return pending;
  }
  const plats = platformsNow(f);
  for (const ft of f.fighters) updateFighter(f, ft, inputs[ft.slot] ?? { x: 0, y: 0, held: 0, pressed: 0 }, plats, false);
  separate(f, plats);
  holdInPlace(f);
  updateProjectiles(f, plats);
  detectHits(f);
  updateTraps(f);
  if (f.settings.items !== "aucun" && f.frame >= f.itemAt) {
    spawnItem(f, plats);
    f.itemAt = f.frame + nextItemDelay(f);
  }
  updateItems(f, plats);
  if (f.settings.events !== false) updateHazard(f, plats);
  checkBlast(f);
  updateDead(f);
  const fought = f.frame - INTRO_FRAMES;
  const alive = sidesAlive(f);
  if ((f.settings.mode !== "temps" && alive.size <= 1) || fought >= f.limit) finish(f);
  return pending;
}

/** L'appareil anticipe son propre combattant : un pas, sans les autres (le serveur dira qui touche qui) */
export function stepSolo(f: Fight, slot: number, inp: Input) {
  pending = [];
  f.frame++;
  if (f.phase !== "fight") return;
  const ft = f.fighters[slot];
  if (!ft) return;
  updateFighter(f, ft, inp, platformsNow(f), true);
  // Sorti de l'arène : c'est le serveur qui décide de la suite
  pending = [];
}

/**
 * Sur l'appareil d'un joueur : tout le combat avance d'une image, chacun avec sa commande (la sienne, et pour les
 * autres la dernière qu'on leur connaît), coups et saisies compris. Ni sortie, ni objet qui tombe, ni tir : c'est le
 * serveur qui en décide, et son état remplace celui-ci dès qu'il arrive. Rend les coups qui touchent (et les saisies).
 */
export function stepPredict(f: Fight, inputs: Input[]): FightEvent[] {
  pending = [];
  f.frame++;
  if (f.phase !== "fight") return [];
  const plats = platformsNow(f);
  for (const ft of f.fighters) updateFighter(f, ft, inputs[ft.slot] ?? { x: 0, y: 0, held: 0, pressed: 0 }, plats, false);
  separate(f, plats);
  holdInPlace(f);
  detectHits(f);
  // Les tirs et les pièges ne sont pas anticipés (le serveur les montre)
  f.projectiles.length = 0;
  f.traps.length = 0;
  const out = pending.filter((e) => e.k === "hit" || e.k === "grab");
  pending = [];
  return out;
}

/** Un coup de son propre combattant, deviné sur l'appareil */
export interface PredictedHit {
  v: number;
  x: number;
  y: number;
  dmg: number;
  power: number;
  shield: boolean;
  parry: boolean;
  ko: boolean;
}

/**
 * Sur l'appareil : les coups de son combattant qui touchent les autres, tels qu'on les voit (leurs positions sont
 * recopiées dans `f` avant l'appel). Seul l'attaquant change : son arrêt sur image commence tout de suite, comme il le
 * fera sur le serveur ; les autres ne bougent pas (le serveur dira ce qu'il leur arrive).
 */
export function predictHits(f: Fight, slot: number): PredictedHit[] {
  const a = f.fighters[slot];
  if (!a || a.state !== "move" || a.hitstop > 0 || f.phase !== "fight") return [];
  const def = moveDef(a.style, a.move);
  if (!def) return [];
  const active = hitboxActive(a, def);
  if (active.length === 0) return [];
  const charge = def.charge ? a.charge / def.charge.max : 0;
  const out: PredictedHit[] = [];
  for (const v of f.fighters) {
    if (!canHit(f, a, v) || a.hitIds.includes(v.slot)) continue;
    const box = hurtbox(v);
    let hit: HitDef | null = null;
    let hx = 0;
    let hy = 0;
    for (const hd of active) {
      if (hd.pull) continue;
      for (const side of hd.both ? [1, -1] : [1]) {
        const cx = a.x + a.face * side * hd.x;
        const cy = a.y + hd.y;
        if (circleHitsBox(cx, cy, hd.r, ...box)) {
          hit = hd;
          hx = cx;
          hy = cy;
          break;
        }
      }
      if (hit) break;
    }
    if (!hit) continue;
    const fresh = staleFactor(a, a.move);
    const baseDmg = Math.round(hit.dmg * fresh * elanBoost(a).dmg * 10) / 10;
    const dmg = Math.round(baseDmg * (1 + CHARGE_BONUS * charge) * 10) / 10;
    const parried = v.state === "shield" && v.t <= PARRY_FRAMES;
    const shielded = !parried && (v.state === "shield" || v.state === "shieldstun");
    let stop: number;
    let ko = false;
    let power: number;
    if (parried) {
      stop = 6 + PARRY_STUN;
      power = 0.7;
    } else if (shielded) {
      stop = Math.round(clamp(3 + baseDmg * 0.3, 3, 10));
      power = clamp(baseDmg / 20, 0, 1);
    } else {
      const speed = launchSpeed(hit.kb, hit.kbg, v.dmg + dmg, styleOf(v).weight, charge) * staleKnock(fresh) * elanBoost(a).kb;
      let ang = hit.ang;
      if (ang < 0 && !isAirborne(v)) ang = 40;
      const dirX = hit.both ? (v.x < a.x ? -1 : 1) : a.face;
      if (speed > 18) {
        const probe: Fighter = { ...v, kx: Math.cos(ang * deg) * speed * dirX, ky: Math.sin(ang * deg) * speed };
        ko = willLeave(f, probe);
      }
      stop = ko ? KO_STOP : Math.round(clamp(4 + dmg * 0.5, 4, 16));
      power = ko ? 1 : clamp(speed / 50, 0, 1);
    }
    a.hitstop = stop;
    if (a.hitIds.length === 0) noteStale(a, a.move);
    a.hitIds.push(v.slot);
    a.hitAt.push(a.mt);
    out.push({ v: v.slot, x: hx, y: hy, dmg, power, shield: shielded, parry: parried, ko });
  }
  return out;
}

/** Le temps de combat restant (au temps), en secondes */
export function timeLeft(f: Fight): number {
  if (f.phase === "intro") return f.limit / 60;
  return Math.max(0, (f.limit - (f.frame - INTRO_FRAMES)) / 60);
}

export type { Fight, Fighter, FightEvent, FightSettings, Input };
