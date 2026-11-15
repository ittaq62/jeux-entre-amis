// Les bots de Culbute : ce qu'un joueur ferait avec un stick et quatre boutons. Ils reviennent sur l'arène quand on
// les éjecte, choisissent leur coup selon où est l'adversaire, se protègent quand ça chauffe, ramassent les objets.
// Le niveau règle la vitesse de réaction, l'envie d'attaquer, la garde et la justesse.

import { ARENAS, ledgesOf, platformsAt, type ArenaId, type PlatformNow } from "./arenas.ts";
import { gravityOf, jumpOf, JUMPSQUAT, moveDef } from "./engine.ts";
import { ATK, JMP, SHD, SPC, type Fight, type Fighter, type HabitueId, type Input } from "./model.ts";
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
  /** Il garde l'adversaire hors de l'arène */
  edgeguard: boolean;
}

const LEVELS: Record<BotLevel, LevelInfo> = {
  facile: { think: 20, attack: 0.35, guard: 0.08, charge: 0.15, recover: 0.75, influence: false, edgeguard: false },
  moyen: { think: 11, attack: 0.6, guard: 0.3, charge: 0.4, recover: 0.95, influence: true, edgeguard: false },
  fort: { think: 5, attack: 0.85, guard: 0.55, charge: 0.6, recover: 1, influence: true, edgeguard: true },
};

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
}

export function newBotMemory(seed: number): BotMemory {
  return { rng: seed >>> 0 || 1, next: 0, x: 0, y: 0, held: 0, holdUntil: 0, press: 0, target: -1, waitUntil: 0 };
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
  const me = f.fighters[slot]!;
  const L = LEVELS[level];
  const out = (): Input => {
    const pressed = m.press;
    m.press = 0;
    const held = (f.frame < m.holdUntil ? m.held : 0) | pressed;
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

  // On tient les boutons d'une charge ou d'une garde jusqu'au bout
  if (f.frame < m.holdUntil) return out();
  if (f.frame < m.next && !(me.state === "air" && offstage(me, st))) return out();
  m.next = f.frame + L.think + Math.floor(rnd(m) * 4);
  m.x = 0;
  m.y = 0;
  if (!actionable(me)) return out();
  if (f.frame < m.waitUntil) return out();

  const foes = enemies(f, me);
  if (me.state === "respawn") {
    if (rnd(m) < 0.3) m.x = me.x > 0 ? -1 : 1;
    return out();
  }

  if (me.state === "ledge") return ledge(f, me, m, foes);
  if (airborne(me) && offstage(me, st)) return recover(f, me, m, L);

  // Un coup arrive : la garde, une roulade, ou un saut
  const danger = threat(me, foes);
  if (danger && rnd(m) < L.guard) {
    const r = rnd(m);
    if (me.style === "simone" && r < 0.35 && me.state !== "shield") {
      m.press = SPC;
      m.y = -1;
    } else if (!airborne(me) && r < 0.75) {
      m.held = SHD;
      m.holdUntil = f.frame + 14;
      m.press = me.state === "shield" ? 0 : SHD;
    } else if (!airborne(me)) {
      m.press = SHD;
      m.x = me.x < danger.x ? -1 : 1;
    } else {
      m.press = SHD;
    }
    return out();
  }
  if (me.state === "shield") return out();

  // Un objet : s'en servir, ou aller le chercher
  if (me.item && me.item !== "baguette") {
    const t = nearest(me, foes);
    if (t && Math.abs(t.y - me.y) < 1.4 && Math.abs(t.x - me.x) < 9) {
      m.x = t.x < me.x ? -1 : 1;
      m.press = ATK;
      return out();
    }
  }
  if (!me.item && !airborne(me)) {
    const wantsCake = me.dmg > 40;
    const it = f.items
      .filter((i) => i.ground && Math.abs(i.y - me.y) < 0.6 && Math.abs(i.x - me.x) < 7)
      .sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))
      .find((i) => wantsCake || i.kind !== "gateau");
    const close = foes.some((o) => Math.abs(o.x - me.x) < 2.2 && Math.abs(o.y - me.y) < 1.5);
    if (it && !close && rnd(m) < 0.8) {
      if (Math.abs(it.x - me.x) < 0.8) m.press = ATK;
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
    if (L.edgeguard && airborne(t) && Math.abs(edge - me.x) < 1.2 && Math.abs(dy) < 4 && rnd(m) < 0.5) {
      // Un projectile, ou le souffle de Simone, sur celui qui revient
      if (["raymond", "lucien", "simone", "ginette", "huguette"].includes(me.style)) {
        // Tourné vers lui : le spécial neutre part ; sinon on se retourne d'abord
        if (me.face === toward) m.press = SPC;
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
    m.x = toward;
    // Il saute rejoindre celui qui est en hauteur
    if (dy > 1.4 && !airborne(me) && rnd(m) < 0.6) m.press = JMP;
    else if (dy > 1.4 && airborne(me) && me.jumps > 0 && me.vy < 0 && rnd(m) < 0.5) m.press = JMP;
    // Ne pas se jeter dans le vide pour courir après quelqu'un
    if (!airborne(me) && nearEdge(me, st, toward)) m.x = 0;
    return out();
  }

  // À portée : on frappe
  if (rnd(m) > L.attack) {
    // Il hésite : un petit pas de côté, ou rien
    if (rnd(m) < 0.4) m.x = -toward * 0.5;
    return out();
  }
  if (airborne(me)) {
    if (dy < -0.6 && adx < 1.2) {
      m.y = -1;
      m.press = ATK;
    } else if (dy > 0.8) {
      m.y = 1;
      m.press = ATK;
    } else if (adx > 0.6) {
      m.x = toward;
      m.press = ATK;
    } else m.press = ATK;
    return out();
  }
  if (dy > 1.1) {
    m.y = 1;
    m.press = ATK;
    if (t.dmg > 90 && rnd(m) < L.charge) {
      m.held = ATK;
      m.holdUntil = f.frame + 14 + Math.floor(rnd(m) * 25);
    }
    return out();
  }
  const killPercent = 95 + STYLES[t.style].weight * 0.3;
  if (t.dmg > killPercent * 0.75 && rnd(m) < L.charge && !airborne(t)) {
    // L'attaque chargée, tenue un moment
    m.x = toward;
    m.press = ATK;
    m.held = ATK;
    m.holdUntil = f.frame + 12 + Math.floor(rnd(m) * 30);
    return out();
  }
  const pick = rnd(m);
  if (pick < 0.12 && me.style !== "simone") {
    // Un spécial de côté pour surprendre
    m.x = toward;
    m.press = SPC;
  } else if (adx < 1 && pick < 0.45) {
    m.press = ATK;
  } else if (pick < 0.62) {
    m.y = -1;
    m.press = ATK;
  } else if (pick < 0.72 && me.style === "lucien") {
    m.y = -1;
    m.press = SPC;
  } else {
    m.x = toward;
    m.press = ATK;
  }
  return out();
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
    // Un grand saut : le bouton tenu jusqu'au décollage
    m.press = JMP;
    m.held = JMP;
    m.holdUntil = f.frame + JUMPSQUAT + 3;
    return true;
  }
  m.x = Math.abs(dx) > 0.25 ? dir : 0;
  // Pas encore au-dessus : le saut en l'air, au sommet du premier
  if (me.y < goal.y + 0.2 && me.jumps > 0 && me.vy < 1) m.press = JMP;
  // En l'air, il se reprend à chaque instant (le bon moment pour le second saut, l'endroit où se poser)
  m.next = f.frame + 1;
  return true;
}

function offstage(ft: Fighter, st: { x0: number; x1: number; y: number }): boolean {
  return ft.x < st.x0 - 0.2 || ft.x > st.x1 + 0.2 || ft.y < st.y - 0.6;
}

function nearEdge(ft: Fighter, st: { x0: number; x1: number }, dir: number): boolean {
  return dir < 0 ? ft.x < st.x0 + 1.2 : ft.x > st.x1 - 1.2;
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
