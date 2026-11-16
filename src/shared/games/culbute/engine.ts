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
  JMP,
  SHD,
  sign,
  SPC,
  type FieldItem,
  type Fight,
  type FightEvent,
  type Fighter,
  type FightSettings,
  type FState,
  type HabitueId,
  type Input,
  type ItemKind,
  type Projectile,
  type Trap,
} from "./model.ts";
import { CHARGE_BONUS, CHARGE_DECIDE, CHARGED_OF, GENERIC, type HitDef, type MoveDef, type MoveSlot } from "./moves.ts";
import { STYLES, type Style } from "./styles.ts";

// ---------------------------------------------------------------------------
// Les réglages du monde
// ---------------------------------------------------------------------------

/** L'éjection s'use de tant de m/s chaque seconde (deux fois plus vite en glissant au sol) */
export const KB_DECAY = 46;
/** Images d'étourdissement par m/s d'éjection */
export const HITSTUN_K = 0.8;
/** Au-delà de cette éjection, on tombe à terre en touchant le sol (sauf à amortir avec la garde) */
const TUMBLE = 17;
export const SHIELD_MAX = 50;
const SHIELD_WEAR = 0.13;
const SHIELD_REGEN = 0.09;
const SHIELD_BREAK_STUN = 150;
export const JUMPSQUAT = 3;
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
const STALE = [0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015];
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

function noteStale(ft: Fighter, key: string) {
  ft.stale.unshift(key);
  if (ft.stale.length > STALE.length) ft.stale.length = STALE.length;
}
/** La saisie : la main tendue (images actives), sa portée */
const GRAB_FROM = 6;
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
    stale: [],
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
    rng: seed >>> 0,
    winners: [],
    outCount: 0,
  };
  f.itemAt = INTRO_FRAMES + firstItemDelay(f);
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

function startMove(ft: Fighter, key: string) {
  ft.state = "move";
  ft.t = 0;
  ft.move = key;
  ft.mt = 0;
  ft.charge = 0;
  ft.hitIds = [];
  ft.hitAt = [];
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

function groundAttack(f: Fight, ft: Fighter, x: number, y: number) {
  const dir = dirOf(x, y);
  if (dir === "s") ft.face = x < 0 ? -1 : 1;
  // Un objet par terre, juste devant : on le ramasse plutôt que de frapper dans le vide
  if (!ft.item && (dir === "n" || dir === "s")) {
    const it = f.items.find((i) => i.ground && Math.abs(i.x - ft.x) < 0.95 && Math.abs(i.y - ft.y) < 0.8);
    if (it) {
      startMove(ft, "g:pickup");
      pickUp(f, ft, it);
      return;
    }
  }
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
  if (Math.abs(x) > 0.6) {
    setState(ft, "roll");
    ft.wait = x < 0 ? -1 : 1;
  } else if (y < -0.6) setState(ft, "dodge");
  else setState(ft, "shield");
}

function jumpFromGround(ft: Fighter) {
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
      if (press & GRB) {
        consume(ft, GRB);
        startMove(ft, "g:grab");
        return;
      }
      if (press & SHD || inp.held & SHD) {
        consume(ft, SHD);
        startShield(ft, x, y);
        return;
      }
      if (press & JMP) {
        consume(ft, JMP);
        jumpFromGround(ft);
        return;
      }
      if (press & ATK) {
        consume(ft, ATK);
        groundAttack(f, ft, x, y);
        return;
      }
      if (press & SPC) {
        consume(ft, SPC);
        special(f, ft, x, y);
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
      if (ft.t >= JUMPSQUAT) {
        // Saut et Frapper ensemble (ou Frapper pendant l'élan) : un petit saut, et l'attaque en l'air part aussitôt
        const quick = (ft.buf & ATK) !== 0;
        const full = !quick && ((inp.held & JMP) !== 0 || flickUp || y > 0.6);
        ft.vy = (full ? st.jump : st.short) * jumpOf(f, ft);
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
      if (press & ATK) {
        consume(ft, ATK);
        airAttack(ft, x, y);
        return;
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
      if (ft.t >= 6 && press & ATK) {
        consume(ft, ATK);
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
      } else ft.vx *= def?.push ? 1 : 0.86;
      return;
    }
    default:
      return;
  }
}

function groundMove(ft: Fighter, x: number, st: Style, sm: number) {
  if (Math.abs(x) > 0.2) {
    const run = Math.abs(x) >= 0.65;
    const target = (run ? st.run : st.walk) * sign(x) * sm;
    // Le départ en courant : un élan immédiat (ou un demi-tour sec), pas une lente mise en route
    if (run && (Math.abs(ft.vx) < st.run * 0.5 * sm || sign(ft.vx) !== sign(x))) ft.vx = target * 0.85;
    const acc = 120 * DT;
    ft.vx += clamp(target - ft.vx, -acc, acc);
    ft.face = x < 0 ? -1 : 1;
  } else {
    const fr = 85 * DT;
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
  if (press & ATK) {
    consume(ft, ATK);
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

function physics(f: Fight, ft: Fighter, plats: PlatformNow[], solo: boolean) {
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
    // Pendant un coup au sol (sans élan), une garde, une roulade ou un atterrissage, on s'arrête au bord au lieu de glisser
    // dans le vide (on ne tombe d'un bord qu'en y allant exprès)
    const sticky =
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
  // Une attaque au sol qui peut se charger : tant que le bouton est tenu, elle attend juste avant de frapper ; relâché,
  // elle part aussitôt ; tenu assez longtemps, elle devient l'attaque chargée de sa direction
  const charged = ft.move === "g:bagS" ? "g:bagC" : CHARGED_OF[ft.move as MoveSlot];
  if (charged && !isAirborne(ft) && inp.held & ATK) {
    if (ft.t >= CHARGE_DECIDE - 1) {
      ft.move = charged;
      advanceCharged(f, ft, moveDef(ft.style, charged)!, inp, solo);
      return;
    }
    const first = def.hits.length > 0 ? Math.min(...def.hits.map((hd) => hd.from)) : def.frames;
    if (ft.mt >= first - 1) {
      ft.vx *= 0.86;
      return;
    }
  }
  advanceCharged(f, ft, def, inp, solo);
}

function advanceCharged(f: Fight, ft: Fighter, def: MoveDef, inp: Input, solo: boolean) {
  // La charge : on reste à cette image tant que le bouton est tenu
  if (def.charge && ft.mt === def.charge.at && inp.held & def.charge.button && ft.charge < def.charge.max) {
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
    else setState(ft, "stand");
  }
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

/** La projection part : celui qu'on tenait est éjecté (sans influence possible) */
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
    [],
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
// Les objets de l'arène
// ---------------------------------------------------------------------------

const ITEM_WEIGHTS: Record<ItemKind, number> = { tarte: 3, petard: 2, pot: 2, baguette: 2, gateau: 2, cafe: 2 };

function firstItemDelay(f: Fight): number {
  if (f.settings.items === "aucun") return Infinity;
  return f.settings.items === "beaucoup" ? 240 + Math.floor(rand(f) * 120) : 600 + Math.floor(rand(f) * 300);
}

function nextItemDelay(f: Fight): number {
  return f.settings.items === "beaucoup" ? 300 + Math.floor(rand(f) * 240) : 660 + Math.floor(rand(f) * 420);
}

function spawnItem(f: Fight, plats: PlatformNow[]) {
  const max = f.settings.items === "beaucoup" ? 5 : 2;
  if (f.items.length >= max) return;
  let total = 0;
  for (const k of ITEM_KINDS) total += ITEM_WEIGHTS[k];
  let r = rand(f) * total;
  let kind: ItemKind = "tarte";
  for (const k of ITEM_KINDS) {
    r -= ITEM_WEIGHTS[k];
    if (r < 0) {
      kind = k;
      break;
    }
  }
  // Il tombe du ciel, au-dessus d'une plateforme
  const p = plats[Math.floor(rand(f) * plats.length)]!;
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

function applyHit(f: Fight, src: HitSource, v: Fighter, inputs: Input[]) {
  const a = src.attacker >= 0 ? f.fighters[src.attacker] : undefined;
  const vdef = v.state === "move" ? moveDef(v.style, v.move) : null;
  // Simone pare et rend le coup
  if (vdef?.counter && v.mt >= vdef.counter[0] && v.mt <= vdef.counter[1]) {
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
      if (vulnerable(f, a)) launch(f, back, a, inputs);
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
  launch(f, src, v, inputs);
}

/** Les pourcents, puis l'éjection d'autant plus forte qu'ils sont hauts */
function launch(f: Fight, src: HitSource, v: Fighter, inputs: Input[]) {
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
  const weight = 200 / (100 + st.weight);
  let speed = (src.kb + (src.kbg * v.dmg) / 100) * weight * (1 + 0.15 * src.charge);
  let ang = src.ang;
  // Un coup vers le bas sur quelqu'un au sol le soulève
  if (ang < 0 && !isAirborne(v)) {
    ang = 40;
    speed *= 0.8;
  }
  let rad = ang * deg;
  // L'influence : le stick tenu au moment du coup infléchit un peu la trajectoire
  const inp = inputs[v.slot];
  if (inp && speed > 15) {
    const lx = Math.cos(rad) * src.dirX;
    const ly = Math.sin(rad);
    const perp = inp.x * -ly + inp.y * lx;
    rad += clamp(perp, -1, 1) * 10 * deg * (src.dirX < 0 ? -1 : 1);
  }
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
  v.stun = Math.max(6, Math.round(speed * HITSTUN_K));
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
  });
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

function detectHits(f: Fight, inputs: Input[]) {
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
      // Un coup répété s'use (et compte dans la file une fois par coup, même s'il touche plusieurs fois)
      const fresh = staleFactor(a, a.move);
      if (idx < 0 && a.hitIds.length === 1) noteStale(a, a.move);
      found.push({
        src: {
          attacker: a.slot,
          x: hx,
          y: hy,
          dirX,
          dmg: Math.round(hit.dmg * fresh * 10) / 10,
          ang: hit.ang,
          kb: hit.kb,
          kbg: hit.kbg,
          pull: hit.pull ?? false,
          charge,
          projectile: false,
        },
        v,
      });
    }
  }
  for (const { src, v } of found) applyHit(f, src, v, inputs);
}

function explode(f: Fight, p: Projectile, inputs: Input[]) {
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
      inputs,
    );
  }
}

function updateProjectiles(f: Fight, plats: PlatformNow[], inputs: Input[]) {
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
            explode(f, p, inputs);
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
        if (p.boom) explode(f, p, inputs);
        gone = true;
      }
    }
    if (gone) continue;
    if (p.life <= 0) {
      if (p.boom) explode(f, p, inputs);
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
        explode(f, p, inputs);
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
        inputs,
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
      ft.rank = f.fighters.length - f.outCount + 1;
      setState(ft, "out");
      pending.push({ k: "out", v: ft.slot, rank: ft.rank });
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
  if (ft.state !== "shield" && ft.shield < SHIELD_MAX && ft.state !== "dizzy") ft.shield = Math.min(SHIELD_MAX, ft.shield + SHIELD_REGEN);
  soloStep = solo;
  control(f, ft, inp, plats);
  physics(f, ft, plats, solo);
  advanceMove(f, ft, inp, solo);
  ft.px = inp.x;
  ft.py = inp.y;
  ft.ph = inp.held;
  if (ft.bufT > 0) ft.bufT--;
  if (ft.bufT === 0) ft.buf = 0;
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
  holdInPlace(f);
  updateProjectiles(f, plats, inputs);
  detectHits(f, inputs);
  updateTraps(f);
  if (f.settings.items !== "aucun" && f.frame >= f.itemAt) {
    spawnItem(f, plats);
    f.itemAt = f.frame + nextItemDelay(f);
  }
  updateItems(f, plats);
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
    const baseDmg = Math.round(hit.dmg * fresh * 10) / 10;
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
      const speed = (hit.kb + (hit.kbg * (v.dmg + dmg)) / 100) * (200 / (100 + styleOf(v).weight)) * (1 + 0.15 * charge);
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
