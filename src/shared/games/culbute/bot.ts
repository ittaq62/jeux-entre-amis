// Les bots de Culbute : ce qu'un joueur ferait avec un stick et quatre boutons. Ils reviennent sur l'arène quand on
// les éjecte, choisissent leur coup selon où est l'adversaire, se protègent quand ça chauffe, ramassent les objets.
// Le niveau règle la vitesse de réaction, l'envie d'attaquer, la garde et la justesse.

import { ARENAS, ledgesOf, platformsAt, type ArenaId, type PlatformNow } from "./arenas.ts";
import {
  BOOM_R,
  CART_H,
  CART_HALF,
  CART_SPEED,
  cartAt,
  CRATE_R,
  GRAB_FROM,
  gravityOf,
  hazardSpots,
  hitCancelable,
  jumpOf,
  JUMPSQUAT,
  moveDef,
  PARRY_FRAMES,
  SHOTS,
} from "./engine.ts";
import { ATK, FRT, GRB, JMP, NAR, SHD, SPC, type Fight, type Fighter, type HabitueId, type Input } from "./model.ts";
import { STYLES } from "./styles.ts";

export type BotLevel = "facile" | "moyen" | "fort";
export const BOT_LEVELS: BotLevel[] = ["facile", "moyen", "fort"];
export const isBotLevel = (v: unknown): v is BotLevel => v === "facile" || v === "moyen" || v === "fort";

interface LevelInfo {
  /** Il réfléchit toutes les n images */
  think: number;
  /** L'envie d'attaquer quand c'est possible */
  attack: number;
  /** Les chances de se protéger d'un coup qui arrive */
  guard: number;
  /** Les chances de charger une attaque sur un adversaire déjà bien entamé */
  charge: number;
  /** Il revient bien sur l'arène (sinon il lui arrive d'attendre trop) */
  recover: number;
  /** Il tient le stick vers l'arène quand on l'éjecte */
  influence: boolean;
  /** Les chances de saisir un adversaire en garde (un quart de ça s'il ne se protège pas) */
  grab: number;
  /** Tenu, ses chances d'appuyer à chaque image pour se dégager */
  mash: number;
  /** Ses chances de lever la garde à l'avance quand un adversaire arrive tout près */
  wary: number;
  /** Ses chances, à chaque décision, de garder au bord l'adversaire qui revient sur l'arène */
  edgeguard: number;
  /** Ses chances de narguer, une fois un adversaire sorti (si personne n'est tout près) */
  taunt: number;
  /** Ses chances d'enchaîner, quand son coup vient de toucher */
  combo: number;
  /** La part de ses attaques au contact qu'il lance d'un petit saut, en l'air */
  aerial: number;
  /** Ses chances de saisir, en sortant de sa garde, celui qui finit son coup trop près */
  punish: number;
  /** Ses chances de lever la garde à temps contre un coup qui arrive tout de suite (ce qui fait une parade) */
  reflex: number;
  /** Ses chances de foncer punir celui qui finit un coup manqué (s'il a le temps d'arriver) */
  whiff: number;
  /** Ses chances de rester hors de portée de celui qui frappe, plutôt que de lui rentrer dedans */
  space: number;
  /** Ses chances de se protéger d'un tir qui arrive (la garde, ou un saut par-dessus) */
  shots: number;
  /** Face à un marteleur (le même coup relancé encore et encore), combien il se met sur ses gardes (0 : jamais) */
  adapt: number;
}

const LEVELS: Record<BotLevel, LevelInfo> = {
  facile: {
    think: 16,
    attack: 0.35,
    guard: 0.05,
    charge: 0.15,
    recover: 0.75,
    influence: false,
    edgeguard: 0,
    grab: 0.15,
    mash: 0.08,
    wary: 0.04,
    taunt: 0.35,
    combo: 0.15,
    aerial: 0.08,
    punish: 0.15,
    reflex: 0.2,
    whiff: 0.25,
    space: 0.3,
    shots: 0.25,
    adapt: 0.3,
  },
  moyen: {
    think: 8,
    attack: 0.6,
    guard: 0.15,
    charge: 0.4,
    recover: 0.95,
    influence: true,
    // Comme le niveau fort : sans personne pour l'attendre au bord, le style qui revient mal sur l'arène (Marcel) ne
    // payait jamais ce défaut, et gagnait deux combats sur trois entre bots moyens (un peu plus de la moitié, avec)
    edgeguard: 0.5,
    grab: 0.5,
    mash: 0.2,
    wary: 0.14,
    taunt: 0.45,
    combo: 0.45,
    aerial: 0.18,
    punish: 0.7,
    reflex: 0.5,
    whiff: 0.9,
    space: 0.85,
    shots: 0.8,
    adapt: 0.8,
  },
  fort: {
    think: 5,
    attack: 0.85,
    guard: 0.4,
    charge: 0.6,
    recover: 1,
    influence: true,
    edgeguard: 0.5,
    grab: 0.85,
    mash: 0.4,
    wary: 0.12,
    taunt: 0.5,
    combo: 0.75,
    aerial: 0.22,
    punish: 0.85,
    reflex: 0.8,
    whiff: 0.95,
    space: 0.95,
    shots: 0.9,
    adapt: 1,
  },
};

/**
 * Le niveau, ajusté au style : un bot facile réagit lentement, et ce sont alors les coups lourds qui gagnent les échanges.
 * Les styles légers (Simone, Huguette) jouent donc un peu plus vite et plus souvent à ce niveau, les lourds un peu
 * moins : à niveau égal, chaque style garde ses chances.
 */
function levelFor(level: BotLevel, style: HabitueId): LevelInfo {
  const L = LEVELS[level];
  if (level !== "facile") return L;
  // Les légers réfléchissent un peu plus vite et attaquent plus ; Lucien aussi (ses coups partent de loin, mais plus
  // tard : au niveau facile, il se faisait devancer)
  const light = Math.min(0.6, (100 - STYLES[style].weight) / 20) + (style === "lucien" ? 1 : 0);
  return { ...L, think: Math.round(L.think * (1 - 0.12 * light)), attack: Math.min(0.9, L.attack * (1 + 0.2 * light)) };
}

/** Ce dont un bot se souvient d'un pas à l'autre (perdu si le serveur redémarre, sans gravité) */
export interface BotMemory {
  rng: number;
  next: number;
  /** Le stick qu'il tient, et ses boutons tenus jusqu'à cette image */
  x: number;
  y: number;
  held: number;
  holdUntil: number;
  /** Ce qu'il enfoncera au prochain pas */
  press: number;
  target: number;
  /** Il attend avant d'agir (au rebord, à son retour) */
  waitUntil: number;
  /** Le coup (son image de départ) dont il a déjà décidé l'enchaînement */
  comboFrom: number;
  /** Il tient le saut jusqu'à cette image (un grand saut, sans s'empêcher de frapper en montant) */
  jumpUntil: number;
  /** Il fonce punir la fin d'un coup manqué jusqu'à cette image */
  punishUntil: number;
  /** Les coups adverses (leur image de départ) pour lesquels il a déjà décidé : se mettre sur ses gardes, punir */
  alerted: number;
  punished: number;
  /** Les coups qu'on lance près de lui, ces dernières secondes (ça s'oublie vite) : celui qui frappe sans arrêt */
  heat: number;
  /** Il ne sautera pas par-dessus avant cette image */
  hopAt: number;
  /** Chaque adversaire (par place) : le chemin qu'il a fait de lui-même ces dernières secondes (marcher, courir, sauter ;
   * pas ses coups ni ses envols), les coups qu'il a lancés, et où il était à l'image d'avant. Celui qui ne bouge pas et
   * frappe sans arrêt reste planté à marteler */
  foeTravel: number[];
  foeAtk: number[];
  foeX: number[];
  /** Face à celui qui reste planté : patient (hors de portée) jusqu'à cette image */
  patient: boolean;
  patientUntil: number;
  /** Les coups adverses (leur image de départ) déjà jugés : leur fin, leur départ ; et le dernier tir vu */
  seenEnd: number;
  seenStart: number;
  seenShot: number;
  /** Le dernier tir (son numéro) contre lequel il a décidé de se protéger, ou pas ; le dernier lasso (l'image de départ
   * du coup) qu'il a décidé de sauter, ou pas */
  shotSeen: number;
  lassoSeen: number;
  /** Il va chercher l'objet qui l'attend en hauteur jusqu'à cette image */
  fetchUntil: number;
  /** L'événement de l'arène (son image de coup) qu'il a décidé d'esquiver, ou pas ; il s'écarte jusqu'à cette image */
  hazardSeen: number;
  hazardDodge: boolean;
  /** La sortie dont il a déjà profité pour narguer (l'image du coup) */
  taunted: number;
  /** Le même coup qu'on vient de lui relancer de près, encore et encore (ça s'oublie vite) : un marteleur se repère */
  mashed: number;
  /** Le dernier coup qu'on lui a lancé de près */
  seen: string;
}

export function newBotMemory(seed: number): BotMemory {
  return {
    rng: seed >>> 0 || 1,
    next: 0,
    x: 0,
    y: 0,
    held: 0,
    holdUntil: 0,
    press: 0,
    target: -1,
    waitUntil: 0,
    taunted: -1,
    comboFrom: -1,
    jumpUntil: 0,
    mashed: 0,
    punishUntil: 0,
    alerted: -1,
    punished: -1,
    heat: 0,
    hopAt: 0,
    foeTravel: [],
    foeAtk: [],
    foeX: [],
    patient: false,
    patientUntil: 0,
    seenEnd: -1,
    seenStart: -1,
    seenShot: -99,
    shotSeen: -1,
    lassoSeen: -1,
    fetchUntil: 0,
    hazardSeen: -1,
    hazardDodge: false,
    seen: "",
  };
}

function rnd(m: BotMemory): number {
  m.rng = (m.rng + 0x6d2b79f5) >>> 0;
  let t = m.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const alive = (ft: Fighter) => ft.state !== "out" && ft.state !== "dead" && ft.state !== "respawn";
const airborne = (ft: Fighter) => ft.ground < 0;

function enemies(f: Fight, me: Fighter): Fighter[] {
  return f.fighters.filter((o) => o !== me && alive(o) && !(f.settings.teams && o.team === me.team));
}

/** Le grand plateau, aux dimensions de l'arène */
function stage(f: Fight) {
  const p = ARENAS[f.arena as ArenaId].platforms[0]!;
  return { x0: p.x0 * f.scale, x1: p.x1 * f.scale, y: p.y };
}

/** Peut-il agir (sinon, inutile de décider quoi que ce soit) ? */
function actionable(ft: Fighter): boolean {
  return ft.state === "stand" || ft.state === "air" || ft.state === "shield" || ft.state === "ledge" || ft.state === "respawn";
}

/** La portée de ses coups au corps à corps, à peu près */
function reach(style: HabitueId): number {
  const s = STYLES[style].moves.s.hits.reduce((m, h) => Math.max(m, h.x + h.r), 0);
  return Math.max(1.2, s);
}

/** Se protéger du coup qui arrive : la garde s'il reste le temps de la lever pour de bon ; s'il arrive tout de suite,
 * une garde levée au dernier instant (une parade), qu'il ne réussit qu'avec ses réflexes (selon son niveau). Rend faux
 * s'il ne fait rien. */
function defend(f: Fight, o: Fighter, m: BotMemory, L: LevelInfo): boolean {
  const def = moveDef(o.style, o.move);
  const until = def && def.hits.length > 0 ? Math.min(...def.hits.map((h) => h.from)) - o.mt : 0;
  if (until <= PARRY_FRAMES && rnd(m) > L.reflex) return false;
  m.held = SHD;
  m.holdUntil = f.frame + 14;
  m.press = SHD;
  m.x = 0;
  return true;
}

/** Combien d'images avant que cet adversaire puisse agir : la fin d'un coup dont la frappe (ou le tir) est passée, un
 * atterrissage ; 0 s'il est libre ou s'il frappe encore */
function recoveryLeft(o: Fighter): number {
  if (o.state === "land") return Math.max(0, o.wait - o.t);
  if (o.state !== "move") return 0;
  const def = moveDef(o.style, o.move);
  if (!def) return 0;
  const last = def.hits.length > 0 ? Math.max(...def.hits.map((h) => h.to)) : (def.shoot?.at ?? def.frames);
  if (o.mt <= last) return 0;
  return def.frames - o.mt;
}

/** L'image où ce coup frappe pour la première fois */
function startOf(style: HabitueId, key: string): number {
  const def = moveDef(style, key);
  return def && def.hits.length > 0 ? Math.min(...def.hits.map((h) => h.from)) : 8;
}

/** Jusqu'où porte ce style au sol, en comptant l'élan de ses coups qui avancent (une ruée de côté va loin) */
const THREAT = new Map<HabitueId, number>();
function threatRange(style: HabitueId): number {
  let r = THREAT.get(style);
  if (r !== undefined) return r;
  r = 1;
  for (const key of ["n", "s", "d", "ps", "cs"]) {
    const def = moveDef(style, key);
    if (!def) continue;
    const reachOf = def.hits.reduce((mx, h) => Math.max(mx, h.x + h.r), 0);
    const run = (def.push ?? []).reduce((sum, p) => sum + ((p.vx ?? 0) * (p.to - p.from + 1)) / 60, 0);
    r = Math.max(r, reachOf + run);
  }
  THREAT.set(style, r);
  return r;
}

/** Un tir de l'adversaire qui vient sur lui, à hauteur, tout près */
function incomingShot(f: Fight, me: Fighter): boolean {
  return f.projectiles.some(
    (p) =>
      p.owner !== me.slot &&
      !(f.settings.teams && p.team === me.team) &&
      Math.abs(p.vx) > 1 &&
      Math.sign(p.vx) === Math.sign(me.x - p.x) &&
      Math.abs(p.x - me.x) < 3.5 &&
      Math.abs(p.y - (me.y + 0.8)) < 1.3,
  );
}

/** Ce que fait chaque adversaire de lui-même (voir BotMemory.foeTravel) */
function watchFoes(f: Fight, me: Fighter, m: BotMemory) {
  m.foeTravel ??= [];
  m.foeAtk ??= [];
  m.foeX ??= [];
  for (const o of f.fighters) {
    if (o === me || (f.settings.teams && o.team === me.team)) continue;
    const i = o.slot;
    const free = o.state === "stand" || o.state === "air" || o.state === "squat";
    const moved = free ? Math.min(0.5, Math.abs(o.x - (m.foeX[i] ?? o.x))) + (o.state === "air" ? 0.03 : 0) : 0;
    // (on le croit mobile tant qu'on ne l'a pas vu rester en place)
    m.foeTravel[i] = (m.foeTravel[i] ?? 3) * 0.99 + moved;
    m.foeAtk[i] = (m.foeAtk[i] ?? 0) * 0.99 + (o.state === "move" && o.mt === 1 ? 1 : 0);
    m.foeX[i] = o.x;
  }
}

/** Il reste planté à marteler : debout sur le sol, il ne bouge presque pas de lui-même, et il frappe sans arrêt */
function planted(m: BotMemory, o: Fighter): boolean {
  return o.ground >= 0 && (m.foeTravel?.[o.slot] ?? 3) < 1.2 && (m.foeAtk?.[o.slot] ?? 0) >= 2.5;
}

/** Le tir adverse qui va le toucher le plus tôt (il vient sur lui, et il arrivera à sa hauteur), et dans combien
 * d'images */
function shotComing(f: Fight, me: Fighter): { eta: number; id: number } | null {
  const st = STYLES[me.style];
  let best: { eta: number; id: number } | null = null;
  for (const p of f.projectiles) {
    // (le lasso passe la garde : on ne s'en protège pas ainsi, voir plus bas)
    if (p.owner === me.slot || (f.settings.teams && p.team === me.team) || p.dmg <= 0 || p.pull) continue;
    if (Math.abs(p.vx) < 1 || Math.sign(p.vx) !== Math.sign(me.x - p.x)) continue;
    const eta = (Math.max(0, Math.abs(me.x - p.x) - p.r - st.w / 2) / Math.abs(p.vx)) * 60;
    if (eta > 20) continue;
    const s = eta / 60;
    const y = p.y + p.vy * s - 0.5 * p.g * s * s;
    if (y < me.y - p.r || y > me.y + st.hgt + p.r) continue;
    if (!best || eta < best.eta) best = { eta, id: p.id };
  }
  return best;
}

/** Un tir va le toucher : au sol, la garde levée juste avant ; en l'air, l'esquive au dernier moment (une seule
 * décision par tir, réussie selon son niveau) */
function dodgeShot(f: Fight, me: Fighter, m: BotMemory, L: LevelInfo): Input | null {
  if (me.state !== "stand" && me.state !== "air") return null;
  // Le lasso attrape à travers la garde : on le saute, au moment où il part (vers celle qui le lance : elle met du
  // temps à s'en remettre)
  if (!airborne(me)) {
    for (const o of enemies(f, me)) {
      const def = o.state === "move" ? moveDef(o.style, o.move) : null;
      const spec = def?.shoot ? SHOTS[def.shoot.kind] : undefined;
      if (!def?.shoot || !spec?.pull || o.face !== (me.x > o.x ? 1 : -1) || Math.abs(o.y - me.y) > 1) continue;
      const left = def.shoot.at - o.mt;
      if (left < 0 || left > 4 || Math.abs(o.x - me.x) > (spec.vx * spec.life) / 60 + 1.2) continue;
      if (m.lassoSeen === f.frame - o.mt) continue;
      m.lassoSeen = f.frame - o.mt;
      if (rnd(m) >= L.shots) continue;
      m.jumpUntil = f.frame + JUMPSQUAT + 12;
      return { x: o.x < me.x ? -0.6 : 0.6, y: 0, held: JMP, pressed: JMP };
    }
  }
  const shot = shotComing(f, me);
  if (!shot || shot.eta > (airborne(me) ? 3 : 6) || m.shotSeen === shot.id) return null;
  m.shotSeen = shot.id;
  if (rnd(m) >= L.shots) return null;
  if (airborne(me)) return me.airdodged ? null : { x: 0, y: 0, held: SHD, pressed: SHD };
  m.held = SHD;
  m.holdUntil = f.frame + Math.ceil(shot.eta) + 8;
  m.press = 0;
  m.x = 0;
  m.y = 0;
  return { x: 0, y: 0, held: SHD, pressed: SHD };
}

/**
 * La vie de l'arène : il voit venir l'événement (selon son niveau, il y pense ou non) et s'en écarte. La charrette : il
 * saute quand elle arrive sur lui. La cloche : il s'éloigne du bord pendant qu'elle se balance, et lève la garde quand
 * elle sonne. Les pétards et les cagettes : il sort des marques au sol. Rien à faire : null.
 */
function dodgeHazard(f: Fight, me: Fighter, m: BotMemory, L: LevelInfo): Input | null {
  const h = f.hazard;
  if (!h || f.frame > h.to || (me.state !== "stand" && me.state !== "air" && me.state !== "shield")) return null;
  // (une seule décision par événement : il y pense, ou il l'oublie)
  if (m.hazardSeen !== h.at) {
    m.hazardSeen = h.at;
    m.hazardDodge = rnd(m) < 0.25 + 0.7 * L.space;
  }
  if (!m.hazardDodge) return null;
  const plats = platformsAt(f.arena as ArenaId, f.scale, f.frame);
  const st = stage(f);
  const center = me.x < (st.x0 + st.x1) / 2 ? 1 : -1;
  if (h.kind === "charrette") {
    if (airborne(me) || me.ground !== 0) return null;
    const cart = cartAt(h, f.frame, plats);
    // Le temps qu'elle arrive sur lui (elle ne roule qu'après l'annonce) ; il saute juste avant, assez haut
    const gap = (me.x - cart.x) * h.dir - CART_HALF - 0.5;
    const eta = Math.max(0, h.at - f.frame) + (gap / CART_SPEED) * 60;
    if (gap < -CART_HALF * 2 || eta > JUMPSQUAT + 12 || me.y > cart.y + CART_H) return null;
    m.jumpUntil = f.frame + JUMPSQUAT + 12;
    m.holdUntil = 0;
    return { x: 0, y: 0, held: JMP, pressed: JMP };
  }
  if (h.kind === "cloche") {
    if (airborne(me)) return null;
    // Au coup : la garde ; avant, il quitte les bords du toit
    if (f.frame >= h.at - 4 && f.frame <= h.at) {
      m.held = SHD;
      m.holdUntil = h.at + 6;
      return { x: 0, y: 0, held: SHD, pressed: me.state === "shield" ? 0 : SHD };
    }
    if (f.frame < h.at && (me.x < st.x0 + 2 || me.x > st.x1 - 2)) return { x: center, y: 0, held: 0, pressed: 0 };
    return null;
  }
  if (airborne(me) || f.frame >= h.at) return null;
  // Les pétards, les cagettes : hors de la marque, du côté le plus sûr
  const r = (h.kind === "petards" ? BOOM_R : CRATE_R) + 0.6;
  const s = hazardSpots(h, plats).find((q) => Math.abs(q.x - me.x) < r && Math.abs(q.y - me.y) < 1);
  if (!s) return null;
  let away = me.x < s.x ? -1 : 1;
  if (nearEdge(me, st, away)) away = -away;
  return { x: away, y: 0, held: 0, pressed: 0 };
}

/**
 * Le jeu de distance, debout sur le plateau : celui qui finit un coup manqué (ou retombe) se fait punir, s'il reste le
 * temps d'arriver ; un coup qui part vers lui, alors qu'il est dans sa portée, il s'en écarte (il tourne autour de
 * celui qui martèle au lieu de lui rentrer dedans) ; un tir qui arrive, il se protège. Rien à faire : null.
 */
function spacing(f: Fight, me: Fighter, m: BotMemory, L: LevelInfo): Input | null {
  if (me.state !== "stand" || airborne(me) || f.frame < m.holdUntil) return null;
  const t = nearest(me, enemies(f, me));
  if (!t || airborne(t) || Math.abs(t.y - me.y) > 1) return null;
  const st = STYLES[me.style];
  const dx = t.x - me.x;
  const adx = Math.abs(dx);
  const toward = dx < 0 ? -1 : 1;
  const r = reach(me.style);
  // (les coups portent jusqu'au bord de son corps, pas jusqu'à son milieu)
  const body = st.w / 2;
  const out = (inp: Input): Input => {
    m.next = f.frame + 1;
    return inp;
  };
  // En train de punir : on fonce, puis on frappe (ou on saisit celui qui retombe) dès qu'il est à portée
  if (f.frame < m.punishUntil) {
    if (recoveryLeft(t) === 0 && t.state !== "move") {
      m.punishUntil = 0;
      return null;
    }
    if (adx > r * 0.8) return out({ x: toward, y: 0, held: 0, pressed: 0 });
    // Le temps que le coup fort sorte : c'est lui qui part (il fait plus mal, et il sort celui qui est entamé) ; mais pas
    // lancé en pleine course, il glisserait sur son élan, à côté ou au travers : il freine d'abord (le sol arrête vite)
    const strong = recoveryLeft(t) > startOf(me.style, "cs") + 1;
    if (strong && Math.abs(me.vx) > st.walk && recoveryLeft(t) > startOf(me.style, "cs") + 3)
      return out({ x: 0, y: 0, held: 0, pressed: 0 });
    m.punishUntil = 0;
    if (strong && Math.abs(me.vx) <= st.walk) return out({ x: toward, y: 0, held: FRT, pressed: FRT });
    return out({ x: toward, y: 0, held: 0, pressed: adx < 1.1 && t.state === "land" ? GRB : ATK });
  }
  // Une fin de coup à punir : le temps d'arriver (en courant) et de frapper
  const left = recoveryLeft(t);
  if (left > 0 && adx < 5 && m.seenEnd !== f.frame - t.mt) {
    m.seenEnd = f.frame - t.mt;
    const travel = (Math.max(0, adx - r * 0.8) / st.run) * 60;
    // Le temps d'arriver, puis que son coup sorte (et une image de marge)
    const needed = travel + startOf(me.style, "s") + 1;
    if (left > needed && rnd(m) < L.whiff) {
      m.punishUntil = f.frame + left;
      return out({ x: toward, y: 0, held: 0, pressed: 0 });
    }
  }
  // Celui qui reste planté à marteler (des coups, encore et encore, sans bouger) : on reste juste hors de sa portée, on
  // attend qu'il manque (voir plus haut), et parfois on saute par-dessus pour frapper d'en haut
  // (le choix d'être patient tient trois quarts de seconde : tiré à chaque image, il lâcherait sans cesse)
  const camping = planted(m, t);
  if (camping && f.frame >= m.patientUntil) {
    m.patient = rnd(m) < L.space;
    m.patientUntil = f.frame + 45;
  }
  if (camping && m.patient) {
    const danger = threatRange(t.style) + body + 0.3;
    const room = !nearEdge(me, stage(f), -toward);
    if (adx < danger && room && left === 0) return out({ x: -toward, y: 0, held: 0, pressed: 0 });
    if (adx < danger + 1.2) {
      if (m.hopAt < f.frame && rnd(m) < L.aerial * 0.15 && !nearEdge(me, stage(f), toward)) {
        m.hopAt = f.frame + 40;
        m.jumpUntil = f.frame + JUMPSQUAT + 10;
        return out({ x: toward, y: 0, held: JMP, pressed: JMP });
      }
      // Il piétine au bord de la portée, prêt à fondre sur la première fin de coup
      return out({ x: (Math.floor(f.frame / 12) % 2 === 0 ? 0.4 : -0.4) * toward, y: 0, held: 0, pressed: 0 });
    }
  }
  // Un coup qui part vers lui, et il est dans sa portée : il recule hors de portée (une fois par coup)
  if (t.state === "move" && left === 0 && t.face === toward * -1 && m.seenStart !== f.frame - t.mt) {
    const def = moveDef(t.style, t.move);
    const first = def && def.hits.length > 0 ? Math.min(...def.hits.map((h) => h.from)) : 0;
    if (def && t.mt < first && adx < threatRange(t.style) + body + 0.4) {
      m.seenStart = f.frame - t.mt;
      if (rnd(m) < L.space && !nearEdge(me, stage(f), -toward)) {
        m.holdUntil = f.frame + Math.min(18, first - t.mt + 6);
        m.held = 0;
        m.x = -toward;
        m.y = 0;
        return out({ x: -toward, y: 0, held: 0, pressed: 0 });
      }
    }
  }
  // Un tir qui arrive : la garde, ou (au niveau fort, parfois) un saut par-dessus
  if (incomingShot(f, me) && m.seenShot < f.frame - 20 && rnd(m) < L.shots) {
    m.seenShot = f.frame;
    if (L.space > 0.8 && rnd(m) < 0.35) return out({ x: toward, y: 0, held: JMP, pressed: JMP });
    m.held = SHD;
    m.holdUntil = f.frame + 16;
    return out({ x: 0, y: 0, held: SHD, pressed: SHD });
  }
  return null;
}

/** Cet adversaire finit son coup (ou retombe) à portée de saisie, et il lui reste assez de temps avant de pouvoir agir
 * pour que la main tendue l'attrape : sa fin de coup se punit (sinon, la saisie manquée se ferait punir à son tour) */
function punishable(me: Fighter, o: Fighter): boolean {
  if (Math.abs(o.x - me.x) > 1.35 || Math.abs(o.y - me.y) > 0.6 || o.ground < 0) return false;
  if (o.state === "land") return o.wait - o.t > GRAB_FROM;
  if (o.state !== "move") return false;
  const def = moveDef(o.style, o.move);
  if (!def || def.hits.length === 0) return false;
  return o.mt > Math.max(...def.hits.map((h) => h.to)) && def.frames - o.mt > GRAB_FROM;
}

/** Un adversaire qui va frapper tout près, tourné vers lui */
function threat(me: Fighter, others: Fighter[]): Fighter | null {
  for (const o of others) {
    if (o.state !== "move") continue;
    const def = moveDef(o.style, o.move);
    if (!def || def.hits.length === 0) continue;
    const first = Math.min(...def.hits.map((h) => h.from));
    if (o.mt > first + 2) continue;
    const dx = me.x - o.x;
    if (Math.abs(dx) > 2.6 || Math.abs(me.y - o.y) > 2) continue;
    const both = def.hits.some((h) => h.both || h.x < 0.5);
    if (both || Math.sign(dx) === o.face) return o;
  }
  return null;
}

/** Le stick et les boutons de ce bot pour ce pas */
export function botInput(f: Fight, slot: number, m: BotMemory, level: BotLevel): Input {
  const inp = decide(f, slot, m, level);
  const me = f.fighters[slot]!;
  // Arrêté au bord d'une planche fine qu'il veut quitter : on ne descend qu'en poussant de nouveau le stick, il le
  // relâche donc un instant (du grand plateau, il ne descend jamais en marchant)
  if (me.state === "stand" && me.ground >= 0 && inp.x !== 0) {
    const p = platformsAt(f.arena as ArenaId, f.scale, f.frame)[me.ground];
    const side = Math.sign(inp.x);
    const atEdge = p && (side < 0 ? me.x <= p.x0 + 0.02 : me.x >= p.x1 - 0.02);
    if (p && atEdge && p.kind !== "solid" && me.px * side > 0.3) return { ...inp, x: 0 };
    // (un coup, un saut ou une garde vers le vide gardent leur direction : ils ne font pas descendre)
    if (p && atEdge && p.kind === "solid" && inp.pressed === 0) return { ...inp, x: 0 };
  }
  return inp;
}

function decide(f: Fight, slot: number, m: BotMemory, level: BotLevel): Input {
  const me = f.fighters[slot]!;
  const L = levelFor(level, me.style);
  const out = (): Input => {
    const pressed = m.press;
    m.press = 0;
    const held = (f.frame < m.holdUntil ? m.held : 0) | (f.frame < m.jumpUntil ? JMP : 0) | pressed;
    return { x: m.x, y: m.y, held, pressed };
  };
  if (f.phase !== "fight") return { x: 0, y: 0, held: 0, pressed: 0 };
  const st = stage(f);

  // Éjecté : le stick vers l'arène (et un peu vers le haut) pour aller moins loin
  if (me.state === "hurt") {
    m.holdUntil = 0;
    if (L.influence) {
      m.x = me.x < 0 ? 0.8 : -0.8;
      m.y = 0.6;
    } else {
      m.x = 0;
      m.y = 0;
    }
    return out();
  }

  // Tenu : il se débat (plus ou moins vite selon son niveau)
  if (me.state === "held") {
    m.holdUntil = 0;
    const mash = rnd(m) < L.mash;
    return { x: rnd(m) < 0.5 ? -1 : 1, y: 0, held: 0, pressed: mash ? ATK : 0 };
  }
  // À terre : il se relève (vite, selon ses réflexes) ; tout près de l'adversaire, parfois en frappant, ou il roule
  // à l'écart, ou il se relève sur place (un instant intouchable)
  if (me.state === "down") {
    m.holdUntil = 0;
    if (me.t < 10 + Math.round((1 - L.reflex) * 20)) return { x: 0, y: 0, held: 0, pressed: 0 };
    const o = nearest(me, enemies(f, me));
    const r = rnd(m);
    if (o && Math.abs(o.x - me.x) < 1.6 && r < 0.4) return { x: 0, y: 0, held: 0, pressed: ATK };
    const away = o ? (me.x < o.x ? -1 : 1) : 0;
    if (away !== 0 && r < 0.7 && !nearEdge(me, st, away)) return { x: away, y: 0, held: 0, pressed: 0 };
    return { x: 0, y: 0, held: JMP, pressed: JMP };
  }
  // Il en tient un : une petite tape ou deux, puis la projection qui l'arrange
  if (me.state === "holding") {
    m.holdUntil = 0;
    if (me.t < 8 || f.frame < m.next) return { x: 0, y: 0, held: 0, pressed: 0 };
    m.next = f.frame + L.think;
    const v = f.fighters[me.holding];
    if (!v) return { x: 0, y: 0, held: 0, pressed: 0 };
    if (v.dmg < 40 && rnd(m) < 0.35) return { x: 0, y: 0, held: 0, pressed: ATK };
    return throwToward(f, me, v);
  }

  // Son coup vient de toucher : il décide aussitôt s'il enchaîne (une seule fois par coup)
  if (me.state === "move" && me.landed && hitCancelable(me) && m.comboFrom !== f.frame - me.t) {
    m.comboFrom = f.frame - me.t;
    const next = followUp(f, me, enemies(f, me), m, L);
    if (next) {
      m.holdUntil = 0;
      m.next = f.frame + L.think;
      // À la poursuite de celui qui s'envole : un grand saut, le bouton tenu pendant la montée
      if (next.pressed & JMP) m.jumpUntil = f.frame + JUMPSQUAT + 8;
      return next;
    }
  }
  // On tient les boutons d'une charge ou d'une garde jusqu'au bout
  // Le même coup relancé de près, encore et encore : il le remarque (celui qui varie ses attaques, jamais) ; et les coups
  // qu'on lance près de lui, quels qu'ils soient
  m.mashed = (m.mashed ?? 0) * 0.985;
  m.heat = (m.heat ?? 0) * 0.985;
  for (const o of f.fighters) {
    if (o === me || o.team === me.team || o.state !== "move" || o.mt !== 1) continue;
    if (Math.abs(o.x - me.x) < 5 && Math.abs(o.y - me.y) < 1.5) m.heat += 1;
    if (Math.abs(o.x - me.x) > 3 || Math.abs(o.y - me.y) > 1.5) continue;
    if (o.move === m.seen) m.mashed += 1;
    m.seen = o.move;
  }
  watchFoes(f, me, m);
  // Sur ses gardes face à un marteleur : le coup qui arrive, il le voit tout de suite (sans attendre sa prochaine idée)
  if (m.mashed >= 3 && me.state === "stand" && f.frame >= m.holdUntil) {
    const danger = threat(me, enemies(f, me));
    // (une seule décision par coup adverse)
    if (danger && m.alerted !== f.frame - danger.mt) {
      m.alerted = f.frame - danger.mt;
      if (rnd(m) < Math.min(0.6, (m.mashed - 2) * 0.2) * L.adapt && defend(f, danger, m, L)) return out();
    }
  }
  // Le jeu de distance, regardé à chaque image (sans attendre sa prochaine idée) : punir une fin de coup, s'écarter
  // d'un coup qui arrive, se protéger d'un tir
  const dodge = dodgeShot(f, me, m, L) ?? dodgeHazard(f, me, m, L);
  if (dodge) return dodge;
  const neutral = spacing(f, me, m, L);
  if (neutral) return neutral;
  // Il vient d'arrêter un coup dans sa garde : il saisit celui qui finit son coup trop près (la garde punit le martelage)
  if (me.state === "shield" && me.t > 1) {
    const late = enemies(f, me).find((o) => punishable(me, o));
    // (une seule décision par fin de coup)
    const key = late ? f.frame - late.mt : -1;
    if (late && m.punished !== key && ((m.punished = key), rnd(m) < L.punish)) {
      m.holdUntil = 0;
      m.held = 0;
      m.x = 0;
      m.press = ATK;
      m.next = f.frame + L.think;
      return out();
    }
  }
  // On tient les boutons d'une charge ou d'une garde jusqu'au bout (la saisie en sortant de garde passe avant)
  if (f.frame < m.holdUntil) return out();
  if (f.frame < m.next && !(me.state === "air" && offstage(me, st))) return out();
  m.next = f.frame + L.think + Math.floor(rnd(m) * 4);
  m.x = 0;
  m.y = 0;
  const foes = enemies(f, me);
  if (!actionable(me)) return out();
  if (f.frame < m.waitUntil) return out();

  if (me.state === "respawn") {
    if (rnd(m) < 0.3) m.x = me.x > 0 ? -1 : 1;
    return out();
  }

  if (me.state === "ledge") return ledge(f, me, m, foes);
  if (airborne(me) && offstage(me, st)) return recover(f, me, m, L);

  // Un adversaire tout près, tourné vers lui : parfois, il lève la garde à l'avance (une garde ordinaire, qui s'use ; il
  // saisira en sortant de sa garde celui qui frappe dedans, voir plus haut)
  const close = foes.find((o) => Math.abs(o.x - me.x) < 1.9 && Math.abs(o.y - me.y) < 1 && o.face === (me.x > o.x ? 1 : -1));
  if (close && !airborne(me) && me.state === "stand" && rnd(m) < L.wary) {
    m.held = SHD;
    m.holdUntil = f.frame + 16 + Math.floor(rnd(m) * 14);
    m.press = SHD;
    return out();
  }

  // Un coup arrive : la garde, une roulade, ou un saut
  const danger = threat(me, foes);
  if (danger && rnd(m) < L.guard) {
    const r = rnd(m);
    if (me.style === "simone" && r < 0.35 && me.state !== "shield") {
      m.press = SPC;
      m.y = -1;
    } else if (!airborne(me) && r < 0.75) {
      if (me.state === "shield") m.held = SHD;
      else if (!defend(f, danger, m, L)) return out();
    } else if (!airborne(me)) {
      m.press = SHD;
      m.x = me.x < danger.x ? -1 : 1;
    } else {
      m.press = SHD;
    }
    return out();
  }
  if (me.state === "shield") return out();

  // Il vient d'en sortir un : il nargue parfois, si personne n'est tout près (une fois par sortie)
  const victim = f.fighters.find(
    (o) => o !== me && o.lastBy === me.slot && (o.state === "dead" || o.state === "respawn") && f.frame - o.lastAt < 240,
  );
  if (victim && me.state === "stand" && m.taunted !== victim.lastAt) {
    m.taunted = victim.lastAt;
    if (!foes.some((o) => Math.abs(o.x - me.x) < 4.5) && rnd(m) < L.taunt) {
      m.press = NAR;
      return out();
    }
  }

  // Un objet : s'en servir, ou aller le chercher
  if (me.item && me.item !== "baguette") {
    const t = nearest(me, foes);
    if (t && Math.abs(t.y - me.y) < 1.4 && Math.abs(t.x - me.x) < 9) {
      m.x = t.x < me.x ? -1 : 1;
      m.press = ATK;
      return out();
    }
  }
  // Un objet utile en hauteur (seuls les meilleurs tombent là-haut) : il y monte, si personne ne le serre de près (une
  // fois décidé, il s'y tient un moment, sans changer d'idée à chaque instant)
  if (!me.item) {
    const wanted = upItem(f, me, foes, f.frame < m.fetchUntil);
    if (wanted && f.frame >= m.fetchUntil && rnd(m) < L.attack) m.fetchUntil = f.frame + 180;
    if (wanted && f.frame < m.fetchUntil && climb(f, me, m, wanted)) return out();
  }
  if (!me.item && !airborne(me)) {
    const wantsCake = me.dmg > 40;
    const it = f.items
      .filter((i) => i.ground && Math.abs(i.y - me.y) < 0.6 && Math.abs(i.x - me.x) < 7)
      .sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))
      .find((i) => wantsCake || i.kind !== "gateau");
    const close = foes.some((o) => Math.abs(o.x - me.x) < 2.2 && Math.abs(o.y - me.y) < 1.5);
    // (celui qu'il est monté chercher, il le prend sans hésiter, et sans le dépasser : il se reprend toutes les deux images)
    const fetching = f.frame < m.fetchUntil;
    if (it && !close && (fetching || rnd(m) < 0.8)) {
      if (fetching) m.next = f.frame + 2;
      if (Math.abs(it.x - me.x) < 0.8) m.press = GRB;
      else m.x = it.x < me.x ? -1 : 1;
      return out();
    }
  }

  const t = nearest(me, foes);
  if (!t) return out();
  const dx = t.x - me.x;
  const dy = t.y - me.y;
  const adx = Math.abs(dx);
  const toward = dx < 0 ? -1 : 1;
  const r = reach(me.style);

  // L'adversaire est dehors : on l'attend au bord (les bons bots vont le chercher)
  if (offstage(t, st)) {
    const edge = t.x < 0 ? st.x0 + 0.8 : st.x1 - 0.8;
    if (L.edgeguard > 0 && airborne(t) && Math.abs(edge - me.x) < 1.2 && Math.abs(dy) < 4 && rnd(m) < L.edgeguard) {
      // Un projectile, ou le souffle de Simone, sur celui qui revient
      if (["raymond", "lucien", "simone", "ginette", "huguette"].includes(me.style)) {
        // Arrêté et tourné vers lui : le spécial neutre part ; sinon on freine, ou on se retourne d'abord
        if (Math.abs(me.vx) > 1) m.x = 0;
        else if (me.face === toward) m.press = SPC;
        else m.x = toward * 0.3;
        return out();
      }
    }
    if (Math.abs(edge - me.x) > 0.4) m.x = edge < me.x ? -1 : 1;
    return out();
  }

  // Il attend plus haut, posé sur une plateforme : on y monte (et, juste en dessous, on finit de monter)
  if ((dy > 1.4 || (dy > 0.3 && airborne(me) && me.jumps > 0)) && climb(f, me, m, t)) return out();

  // Trop loin : on approche (ou on tire de loin)
  if (adx > r + 0.2 || Math.abs(dy) > 2.2) {
    const ranged = me.style === "raymond" || me.style === "lucien" || me.style === "huguette" || me.style === "ginette";
    if (ranged && adx > 3 && adx < 9 && Math.abs(dy) < 1.5 && rnd(m) < L.attack * 0.35) {
      if (me.face !== toward) {
        m.x = toward;
        return out();
      }
      m.press = SPC;
      if (me.style === "raymond" && rnd(m) < 0.5) {
        m.held = SPC;
        m.holdUntil = f.frame + Math.min(40, Math.round(adx * 4));
      }
      return out();
    }
    // Celui qui frappe sans arrêt : on ne lui rentre pas dedans. Au bord de sa portée (élan de ses ruées compris), on
    // attend qu'il manque un coup (voir spacing), on avance sous la garde (il frappe dedans, on le saisit à la fin de
    // son coup), ou on saute par-dessus pour frapper d'en haut
    const danger = threatRange(t.style) + STYLES[me.style].w / 2 + 0.3;
    if (!airborne(me) && !airborne(t) && Math.abs(dy) < 1 && m.heat > 2 && adx < danger + 1 && rnd(m) < L.space) {
      const pick = rnd(m);
      if (pick < 0.4 && adx > danger - 0.6) {
        m.x = rnd(m) < 0.5 ? -toward * 0.5 : 0;
        return out();
      }
      if (pick < 0.7) {
        m.held = SHD;
        m.holdUntil = f.frame + 18 + Math.floor(rnd(m) * 12);
        m.press = SHD;
        return out();
      }
      if (t.x > st.x0 + 1 && t.x < st.x1 - 1 && !nearEdge(me, st, toward)) {
        m.x = toward;
        m.press = JMP;
        m.jumpUntil = f.frame + JUMPSQUAT + 10;
        return out();
      }
    }
    m.x = toward;
    // Il saute rejoindre celui qui est en hauteur
    if (dy > 1.4 && !airborne(me) && rnd(m) < 0.6) m.press = JMP;
    else if (dy > 1.4 && airborne(me) && me.jumps > 0 && me.vy < 0 && rnd(m) < 0.5) m.press = JMP;
    // De temps en temps, il arrive en sautant, pour frapper d'en haut (au-dessus du plateau seulement)
    else if (
      !airborne(me) &&
      Math.abs(dy) < 1 &&
      adx > 2 &&
      adx < 4.5 &&
      t.x > st.x0 + 1 &&
      t.x < st.x1 - 1 &&
      !nearEdge(me, st, toward) &&
      rnd(m) < L.aerial * (me.style === "lucien" ? 0.25 : 0.6)
    ) {
      m.press = JMP;
      m.jumpUntil = f.frame + JUMPSQUAT + 8;
    }
    // Ne pas se jeter dans le vide pour courir après quelqu'un
    if (!airborne(me) && nearEdge(me, st, toward)) m.x = 0;
    // Il court vers un bord : il y repensera vite (sinon il le passe avant d'avoir réfléchi)
    if (!airborne(me) && m.x !== 0 && (toward < 0 ? me.x - st.x0 : st.x1 - me.x) < 4.5) m.next = Math.min(m.next, f.frame + 2);
    // Lent à réfléchir (niveau facile), il sera à portée avant sa prochaine idée : il y repense en arrivant (sinon il passe
    // à côté, d'autant plus loin qu'il court vite)
    if (L.think > 10 && !airborne(me) && m.x !== 0) {
      const arrive = Math.floor((Math.max(0, adx - 1.2) / STYLES[me.style].run) * 60);
      m.next = Math.min(m.next, f.frame + Math.max(1, arrive));
    }
    return out();
  }

  // À portée d'un adversaire au sol : une saisie, surtout s'il se cache derrière sa garde
  const shielding = t.state === "shield" || t.state === "shieldstun";
  if (!airborne(me) && !airborne(t) && adx < 1.25 && Math.abs(dy) < 0.5 && rnd(m) < (shielding ? L.grab : L.grab * 0.25)) {
    if (me.face !== toward) m.x = toward * 0.3;
    else m.press = GRB;
    return out();
  }

  // À portée : on frappe
  if (rnd(m) > L.attack) {
    // Il hésite : un petit pas de côté, ou rien
    if (rnd(m) < 0.4) m.x = -toward * 0.5;
    return out();
  }
  if (airborne(me)) {
    const key = dy < -0.6 && adx < 1.2 ? "ad" : dy > 0.8 ? "au" : adx > 0.6 ? "as" : "an";
    // Au-dessus du vide (ou tout au bord) : le coup en l'air seulement s'il pourra encore revenir à la fin (un coup vers
    // le bas sur celui qui reste planté au bord l'emmenait sous le plateau)
    if ((me.x < st.x0 + 0.6 || me.x > st.x1 - 0.6) && !aerialSafe(f, me, key)) return out();
    if (key === "ad") m.y = -1;
    else if (key === "au") m.y = 1;
    else if (key === "as") m.x = toward;
    m.press = ATK;
    return out();
  }
  // Le coup fort chargé, seulement s'il a le temps de sortir : face à celui qui frappe sans arrêt, quand il se reprend
  const chargeOk = m.heat < 2 || recoveryLeft(t) > startOf(me.style, "cs") + 1;
  if (dy > 1.1) {
    m.y = 1;
    m.press = ATK;
    if (t.dmg > 90 && chargeOk && rnd(m) < L.charge) {
      // Le coup fort vers le haut, chargé un moment
      m.press = FRT;
      m.held = FRT;
      m.holdUntil = f.frame + 2 + Math.floor(rnd(m) * 25);
    }
    return out();
  }
  const killPercent = 95 + STYLES[t.style].weight * 0.3;
  if (t.dmg > killPercent * 0.75 && chargeOk && rnd(m) < L.charge && !airborne(t)) {
    // Le coup fort, chargé un moment
    m.x = toward;
    m.press = FRT;
    m.held = FRT;
    m.holdUntil = f.frame + 2 + Math.floor(rnd(m) * 30);
    return out();
  }
  const pick = rnd(m);
  if (pick < 0.12 && me.style !== "simone" && !rushesOff(me, toward, st)) {
    // Un spécial de côté pour surprendre (pas une ruée qui l'emporterait hors du plateau s'il manque)
    m.x = toward;
    m.press = SPC;
  } else if (adx < 1 && pick < 0.32) {
    m.press = ATK;
  } else if (pick < 0.44) {
    m.y = -1;
    m.press = ATK;
  } else if (pick < 0.44 + L.aerial * (me.style === "lucien" ? 0.4 : 1) && !airborne(t) && t.x > st.x0 + 1.2 && t.x < st.x1 - 1.2) {
    // Un petit saut avec une attaque en l'air vers lui (Saut et Frapper ensemble)
    m.x = toward;
    m.press = JMP | ATK;
  } else if (pick < 0.72 && me.style === "lucien") {
    m.y = -1;
    m.press = SPC;
  } else {
    m.x = toward;
    m.press = ATK;
  }
  return out();
}

/** L'enchaînement : vers celui qu'on vient de toucher, le coup qui le rattrape (en l'air s'il s'envole) */
function followUp(f: Fight, me: Fighter, foes: Fighter[], m: BotMemory, L: LevelInfo): Input | null {
  if (rnd(m) > L.combo) return null;
  const t = foes.find((o) => o.state === "hurt" && o.lastBy === me.slot);
  if (!t) return null;
  // Pas de poursuite au-dessus du vide : seulement au-dessus du plateau
  const st = stage(f);
  if (t.x < st.x0 + 0.8 || t.x > st.x1 - 0.8 || me.x < st.x0 + 0.5 || me.x > st.x1 - 0.5) return null;
  const dx = t.x - me.x;
  const dy = t.y - me.y;
  const toward = dx < 0 ? -1 : 1;
  const air = me.ground < 0;
  // Trop loin pour le rattraper : on n'insiste pas
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3.5) return null;
  // Envolé au-dessus : au sol on saute à sa poursuite, en l'air on frappe vers le haut
  if (dy > 1.2) return air ? { x: toward * 0.4, y: 1, held: 0, pressed: ATK } : { x: toward * 0.5, y: 0, held: JMP, pressed: JMP };
  // Tout près, à la même hauteur : un coup de côté vers lui (en l'air, l'attaque avant)
  if (Math.abs(dx) < 1.6) return { x: toward, y: 0, held: 0, pressed: ATK };
  return null;
}

function nearest(me: Fighter, foes: Fighter[]): Fighter | null {
  let best: Fighter | null = null;
  let d = Infinity;
  for (const o of foes) {
    const k = Math.hypot(o.x - me.x, (o.y - me.y) * 1.5) + (o.intangUntil > 0 && o.state === "respawn" ? 20 : 0);
    if (k < d) {
      d = k;
      best = o;
    }
  }
  return best;
}

/** Sa ruée de côté (son élan), lancée vers là : l'emporterait-elle au-delà du bord du plateau ? */
function rushesOff(me: Fighter, dir: number, st: { x0: number; x1: number }): boolean {
  const def = moveDef(me.style, "ps");
  const run = (def?.push ?? []).reduce((sum, p) => sum + ((p.vx ?? 0) * (p.to - p.from + 1)) / 60, 0);
  const end = me.x + dir * run;
  return end < st.x0 + 0.4 || end > st.x1 - 0.4;
}

/** Ce coup en l'air, lancé au-dessus du vide : à sa fin, sera-t-il encore assez haut pour revenir (avec son saut en
 * l'air, s'il lui en reste) ? */
function aerialSafe(f: Fight, me: Fighter, key: string): boolean {
  const st = STYLES[me.style];
  const g = st.gravity * gravityOf(f);
  let y = me.y;
  let vy = me.vy;
  for (let i = 0; i < (moveDef(me.style, key)?.frames ?? 30); i++) {
    vy = Math.max(vy - g / 60, -st.fall);
    y += vy / 60;
  }
  return y + (me.jumps > 0 ? jumpReach(f, me).air : 0) > stage(f).y + 0.5;
}

/** La hauteur que gagne un grand saut depuis le sol, et un saut en l'air pris au sommet (avec un peu de marge) */
function jumpReach(f: Fight, me: Fighter): { first: number; air: number } {
  const st = STYLES[me.style];
  const g = st.gravity * gravityOf(f);
  const k = jumpOf(f, me);
  const v1 = st.jump * k;
  const v2 = st.airJump * k;
  return { first: ((v1 * v1) / (2 * g)) * 0.9, air: ((v2 * v2) / (2 * g)) * 0.9 };
}

/**
 * L'adversaire attend sur une plateforme plus haute (le toit du kiosque, une poutre) : on le rejoint, d'un grand saut
 * puis d'un saut en l'air vers le sommet. Si c'est trop haut d'ici, on passe d'abord par une plateforme entre les deux
 * (un banc, un étal). Faux s'il n'y a pas de chemin : il fait alors comme avant (il tape par en dessous).
 */
function climb(f: Fight, me: Fighter, m: BotMemory, t: Fighter): boolean {
  if (airborne(t)) return false;
  const plats = platformsAt(f.arena as ArenaId, f.scale, f.frame);
  const top = plats[t.ground];
  if (!top || top.kind === "solid") return false;
  const st = STYLES[me.style];
  const { first, air } = jumpReach(f, me);
  const g = st.gravity * gravityOf(f);
  // Jusqu'où il peut monter d'ici : l'élan qui lui reste, plus ses sauts
  const rise = airborne(me) ? (Math.max(0, me.vy) ** 2 / (2 * g)) * 0.9 : first;
  const reach = me.y + rise + (me.jumps > 0 ? air : 0);
  let goal: PlatformNow | undefined = top;
  if (reach < top.y + 0.3) {
    // Une marche : une plateforme fine, plus haute que lui (en l'air : où il peut encore se poser) et à sa portée, la
    // plus proche de celle de l'adversaire
    const gap = (p: PlatformNow) => Math.max(0, p.x0 - top.x1, top.x0 - p.x1);
    const above = airborne(me) ? me.y - 2.5 : me.y + 0.5;
    goal = plats
      .filter((p) => p !== top && p.kind !== "solid" && p.y > above && p.y < top.y && p.y <= reach - 0.3)
      .sort((a, b) => gap(a) - gap(b) || b.y - a.y)[0];
    if (!goal) return false;
  }
  // Où se poser dessus : au plus près, sans frôler le bord
  const aim = Math.min(Math.max(goal === top ? t.x : me.x, goal.x0 + 0.5), goal.x1 - 0.5);
  const dx = aim - me.x;
  const dir = dx < 0 ? -1 : 1;
  if (!airborne(me)) {
    m.x = Math.abs(dx) > 0.3 ? dir : 0;
    // Trop loin pour sauter dès maintenant : il s'en approche en courant (mais saute avant le bord d'un banc)
    const on = plats[me.ground];
    const edge = on && on.kind !== "solid" ? (dir > 0 ? on.x1 - me.x : me.x - on.x0) : Infinity;
    if (Math.abs(dx) > 2.5 && edge > 1) {
      m.next = Math.min(m.next, f.frame + 3);
      return true;
    }
    // Un grand saut : le bouton tenu jusqu'au décollage, et encore un peu après (lâché trop tôt, le saut s'arrête bas)
    m.press = JMP;
    m.held = JMP;
    m.holdUntil = f.frame + JUMPSQUAT + 8;
    return true;
  }
  m.x = Math.abs(dx) > 0.25 ? dir : 0;
  // Pas encore au-dessus : le saut en l'air, au sommet du premier
  if (me.y < goal.y + 0.2 && me.jumps > 0 && me.vy < 1) m.press = JMP;
  // En l'air, il se reprend à chaque instant (le bon moment pour le second saut, l'endroit où se poser)
  m.next = f.frame + 1;
  return true;
}

/**
 * L'objet utile qui l'attend sur une plateforme plus haute, pas trop loin, et que personne ne garde : de quoi y monter
 * (une cible pour climb : la plateforme, l'endroit). Le gâteau seulement s'il a de quoi se soigner.
 */
function upItem(f: Fight, me: Fighter, foes: Fighter[], going: boolean): Fighter | null {
  if (foes.some((o) => Math.abs(o.x - me.x) < 2.2 && Math.abs(o.y - me.y) < 1.5)) return null;
  const plats = platformsAt(f.arena as ArenaId, f.scale, f.frame);
  let best: { it: { x: number; y: number }; ground: number } | null = null;
  for (const it of f.items) {
    // (en chemin, en l'air, il peut être passé au-dessus : il s'y pose)
    if (!it.ground || Math.abs(it.x - me.x) > 7 || (it.y < me.y + 0.6 && !(going && airborne(me)))) continue;
    if (it.kind === "gateau" ? me.dmg < 40 : it.kind === "tarte" || it.kind === "petard") continue;
    // Quelqu'un est déjà dessus
    if (foes.some((o) => Math.abs(o.x - it.x) < 1.5 && Math.abs(o.y - it.y) < 0.6)) continue;
    const ground = plats.findIndex((q) => it.x >= q.x0 && it.x <= q.x1 && Math.abs(q.y - it.y) < 0.1);
    if (ground < 0) continue;
    if (!best || Math.abs(it.x - me.x) < Math.abs(best.it.x - me.x)) best = { it, ground };
  }
  return best ? ({ x: best.it.x, y: best.it.y, ground: best.ground } as Fighter) : null;
}

/** La projection qui l'envoie vers le bord le plus proche (ou vers le haut, quand il a beaucoup de pourcents) */
function throwToward(f: Fight, me: Fighter, v: Fighter): Input {
  const st = stage(f);
  const edge = me.x < (st.x0 + st.x1) / 2 ? -1 : 1;
  if (v.dmg > 130 && Math.abs(me.x) < (st.x1 - st.x0) * 0.2) return { x: 0, y: 1, held: 0, pressed: 0 };
  if (v.dmg < 35) return { x: 0, y: -1, held: 0, pressed: 0 };
  // Vers le bord le plus proche : en avant s'il y fait face, sinon par-dessus l'épaule
  return { x: edge, y: 0, held: 0, pressed: 0 };
}

function offstage(ft: Fighter, st: { x0: number; x1: number; y: number }): boolean {
  return ft.x < st.x0 - 0.2 || ft.x > st.x1 + 0.2 || ft.y < st.y - 0.6;
}

/** Près du bord, dans ce sens : la marge grandit avec la vitesse (il faut le temps de freiner) */
function nearEdge(ft: Fighter, st: { x0: number; x1: number }, dir: number): boolean {
  const margin = 1.0 + Math.abs(ft.vx) * 0.14;
  return dir < 0 ? ft.x < st.x0 + margin : ft.x > st.x1 - margin;
}

/** Hors de l'arène : vers le rebord le plus proche, en sautant puis avec le spécial vers le haut */
function recover(f: Fight, me: Fighter, m: BotMemory, L: LevelInfo): Input {
  const ledges = ledgesOf(f.arena as ArenaId, f.scale);
  const l = me.x < 0 ? ledges[0]! : ledges[1]!;
  const towardX = l.x - l.side * 0.5 - me.x;
  const dir = towardX < 0 ? -1 : 1;
  m.x = dir;
  m.y = 0;
  m.next = f.frame + 2;
  if (me.state !== "air") return { x: m.x, y: m.y, held: 0, pressed: 0 };
  const below = me.y < l.y - 0.4;
  const falling = me.vy < 1;
  const far = Math.abs(towardX);
  if (below && falling && me.jumps > 0 && (me.y < l.y - 1.2 || far > 3)) {
    return press(m, JMP);
  }
  // Plus de saut : le spécial vers le haut (Huguette lance sa laine dès qu'un rebord est à portée)
  const grappleRange = me.style === "huguette" ? Math.hypot(far, l.y - me.y) < 4.8 : true;
  const useUp = falling && me.jumps === 0 && (below || far > 2.5) && grappleRange;
  if (useUp && rnd(m) < L.recover) {
    m.x = dir * 0.35;
    m.y = 1;
    return press(m, SPC);
  }
  // Loin du bord, encore haut : le spécial de côté rapproche
  if (falling && far > 4 && !me.sideUsed && me.y > l.y - 1 && rnd(m) < L.recover * 0.5 && me.style !== "huguette") {
    m.y = 0;
    return press(m, SPC);
  }
  return { x: m.x, y: m.y, held: 0, pressed: 0 };
}

function press(m: BotMemory, bits: number): Input {
  return { x: m.x, y: m.y, held: bits, pressed: bits };
}

/** Accroché au rebord : remonter, sauter, frapper ou rouler, après un petit temps */
function ledge(f: Fight, me: Fighter, m: BotMemory, foes: Fighter[]): Input {
  if (me.t < 8 + Math.floor(rnd(m) * 20)) return { x: 0, y: 0, held: 0, pressed: 0 };
  const near = foes.some((o) => Math.abs(o.x - me.x) < 2.2 && Math.abs(o.y - me.y) < 2.5);
  const r = rnd(m);
  m.next = f.frame + 30;
  if (near && r < 0.4) return { x: 0, y: 0, held: ATK, pressed: ATK };
  if (near && r < 0.7) return { x: 0, y: 0, held: SHD, pressed: SHD };
  if (r < 0.5) return { x: me.face, y: 0, held: 0, pressed: 0 };
  return { x: 0, y: 0, held: JMP, pressed: JMP };
}
