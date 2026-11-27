// Le Sablé : chacun choisit une boîte (sans savoir ce qu'elle cache), y trouve un sablé gravé d'une forme, et la détache
// en suivant le trait avec une aiguille. Le biscuit se fêle quand on va trop vite (surtout dans les angles) ou qu'on raye
// à côté du trait ; une fêlure de trop et il casse : la tarte à la crème part. La forme détachée en entier, on est sauf.
//
// Le geste est calculé de la même façon par l'écran du joueur (pour voir tout de suite le trait se creuser et les
// fêlures) et par le serveur, qui fait foi : l'écran envoie les points de l'aiguille, le serveur les rejoue.

import { random, shuffle } from "../../../rng.ts";
import { between, byLevel, clamp, OUT, PLAYING, pressure, r3, SAFE, type EpCtx } from "./common.ts";
import { nearest, OUTLINE_N, outline, SHAPE_RISK, SHAPES, type ShapeId } from "./shapes.ts";

/** L'aiguille creuse le trait à moins de cette distance (le biscuit a un rayon de 1) */
export const CARVE_TOL = 0.045;
/** Au-delà, elle raye le biscuit */
const SCRATCH = 0.09;
/** La vitesse sans risque (rayons par seconde), réduite de moitié dans les angles */
export const SAFE_SPEED = 0.42;
/** La forme est détachée quand presque tout le trait est creusé */
const DONE_SHARE = 0.985;
const CHOOSE_S = 9;
const REVEAL_S = 3;
const LIMIT_S = 62;

/** Le travail de l'aiguille sur un biscuit */
export interface Carve {
  shape: ShapeId;
  /** Chaque point du contour : creusé (1) ou non */
  bits: number[];
  crack: number;
  /** Les fêlures dessinées : où, et leur taille */
  marks: [number, number, number][];
  /** Le dernier point de l'aiguille et son heure (millisecondes de l'écran) */
  last: [number, number, number] | null;
  /** La fêlure accumulée depuis la dernière marque */
  pend: number;
}

export function newCarve(shape: ShapeId): Carve {
  return { shape, bits: new Array<number>(OUTLINE_N).fill(0), crack: 0, marks: [], last: null, pend: 0 };
}

export const carvedShare = (c: Carve) => c.bits.reduce((a, b) => a + b, 0) / OUTLINE_N;

/**
 * L'aiguille passe par ces points ([x, y, heure en ms]) : le trait se creuse, le biscuit se fêle. Les mêmes calculs
 * (+ − × ÷ et la racine) sur l'écran et au serveur. Rend vrai si le biscuit casse.
 */
export function carvePoints(c: Carve, points: readonly (readonly [number, number, number])[]): boolean {
  const o = outline(c.shape);
  for (const p of points) {
    const x = clamp(p[0], -1.2, 1.2);
    const y = clamp(p[1], -1.2, 1.2);
    const t = p[2];
    const prev = c.last;
    c.last = [x, y, t];
    // Un trou dans les points (le doigt levé, une pause) : on repart d'ici sans vitesse
    if (!prev || t - prev[2] > 140 || t < prev[2]) {
      markNear(c, o, x, y);
      continue;
    }
    const dt = Math.max(8, t - prev[2]) / 1000;
    const dist = Math.hypot(x - prev[0], y - prev[1]);
    const speed = dist / dt;
    // Le chemin entre les deux points, par petits pas
    const steps = Math.max(1, Math.ceil(dist / 0.012));
    let add = 0;
    for (let s = 1; s <= steps; s++) {
      const qx = prev[0] + ((x - prev[0]) * s) / steps;
      const qy = prev[1] + ((y - prev[1]) * s) / steps;
      const { k, d } = markNear(c, o, qx, qy);
      const onBiscuit = qx * qx + qy * qy < 0.9 * 0.9;
      const corner = o.corner[k]!;
      const limit = SAFE_SPEED * (1 - 0.5 * corner);
      const share = dt / steps;
      if (speed > limit) add += (speed - limit) * 0.6 * (1 + corner) * share;
      if (onBiscuit && d > SCRATCH) add += (0.05 + (d - SCRATCH) * 2.4) * share * (speed > 0.05 ? 1 : 0.3);
    }
    if (add > 0) {
      c.crack += add;
      c.pend += add;
      if (c.pend > 0.07 && c.marks.length < 28) {
        c.marks.push([r3(x), r3(y), r3(Math.min(0.4, c.pend))]);
        c.pend = 0;
      }
    }
    if (c.crack >= 1) return true;
  }
  return false;
}

function markNear(c: Carve, o: ReturnType<typeof outline>, x: number, y: number): { k: number; d: number } {
  const hit = nearest(o, x, y);
  if (hit.d < CARVE_TOL) {
    c.bits[hit.k] = 1;
    c.bits[(hit.k + 1) % OUTLINE_N] = 1;
    c.bits[(hit.k + OUTLINE_N - 1) % OUTLINE_N] = 1;
  }
  return hit;
}

export interface BiscuitState {
  kind: "biscuit";
  stage: "choix" | "revele" | "jeu" | "fin";
  stageAt: number;
  until: number;
  ids: string[];
  st: number[];
  /** La boîte choisie par chacun (-1 : pas encore) */
  box: number[];
  /** Ce que cache chaque boîte (secret pendant le choix) */
  shapes: ShapeId[];
  /** Où chacun en est : la part du trait creusée, la fêlure */
  prog: number[];
  crack: number[];
  /** Le moment où sa forme s'est détachée (secondes depuis le début), 0 sinon */
  fin: number[];
  /** Le travail des vrais joueurs (les bots n'ont qu'une part et une fêlure) */
  carve: Record<string, Carve>;
  /** Les bots : leur vitesse (part du trait par seconde), la part où leur biscuit cassera (0 : il tiendra), leur prochain geste */
  bot: { rate: number[]; breakAt: number[]; next: number[] };
}

export function biscuitStart(ids: string[], now: number, ctx: EpCtx): BiscuitState {
  const zero = () => ids.map(() => 0);
  return {
    kind: "biscuit",
    stage: "choix",
    stageAt: now,
    until: now + CHOOSE_S * 1000,
    ids,
    st: zero(),
    box: ids.map(() => -1),
    shapes: shuffle(ctx.rng, [...SHAPES]),
    prog: zero(),
    crack: zero(),
    fin: zero(),
    carve: {},
    bot: { rate: zero(), breakAt: zero(), next: zero() },
  };
}

export function biscuitChoose(s: BiscuitState, id: string, box: number) {
  const i = s.ids.indexOf(id);
  if (i < 0 || s.stage !== "choix" || !Number.isInteger(box) || box < 0 || box > 3) return;
  s.box[i] = box;
}

/** Les points de l'aiguille d'un vrai joueur ; l'écran les numérote avec sa propre horloge */
export function biscuitTrace(s: BiscuitState, id: string, points: unknown, ctx: EpCtx) {
  const i = s.ids.indexOf(id);
  if (i < 0 || s.stage !== "jeu" || s.st[i] !== PLAYING || !Array.isArray(points) || points.length > 120) return;
  const c = s.carve[id];
  if (!c) return;
  const clean: [number, number, number][] = [];
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every((v) => typeof v === "number" && Number.isFinite(v))) return;
    clean.push([p[0], p[1], p[2]]);
  }
  const broke = carvePoints(c, clean);
  settle(s, i, c, broke, ctx);
}

function settle(s: BiscuitState, i: number, c: Carve, broke: boolean, ctx: EpCtx) {
  const id = s.ids[i]!;
  s.prog[i] = r3(carvedShare(c));
  s.crack[i] = r3(Math.min(1, c.crack));
  if (broke) {
    s.st[i] = OUT;
    ctx.out(id, "tarte");
    ctx.fx("casse", { id });
  } else if (s.prog[i]! >= DONE_SHARE) {
    s.st[i] = SAFE;
    s.fin[i] = Math.round(((ctx.now - s.stageAt) / 1000) * 10) / 10;
    ctx.fx("detache", { id });
  }
}

export function biscuitTick(s: BiscuitState, ctx: EpCtx) {
  const now = ctx.now;
  if (s.stage === "fin") return;
  if (s.stage === "choix") {
    // Les bots choisissent au fil du temps ; à la fin, chacun a sa boîte (au hasard pour qui n'a rien choisi)
    for (let i = 0; i < s.ids.length; i++) {
      if (s.box[i]! >= 0) continue;
      const late = now >= s.until;
      if (late || (ctx.auto(s.ids[i]!) && random(ctx.rng) < 0.04)) s.box[i] = Math.floor(random(ctx.rng) * 4);
    }
    if (now < s.until) return;
    s.stage = "revele";
    s.stageAt = now;
    s.until = now + REVEAL_S * 1000;
    ctx.fx("ouvre");
    return;
  }
  if (s.stage === "revele") {
    if (now < s.until) return;
    s.stage = "jeu";
    s.stageAt = now;
    s.until = now + (ctx.eclair ? LIMIT_S * 0.72 : LIMIT_S) * 1000;
    // Le sort des bots est jeté au départ : leur vitesse, et s'ils casseront (plus souvent avec une forme difficile, ou
    // quand le metteur en scène veut plus d'éliminés)
    const autos = s.ids.filter((id) => ctx.auto(id)).length;
    const p = pressure(s.ids.length, ctx.keep, autos, 1);
    for (let i = 0; i < s.ids.length; i++) {
      const id = s.ids[i]!;
      const shape = s.shapes[s.box[i]!]!;
      if (!ctx.auto(id)) s.carve[id] = newCarve(shape);
      const lv = ctx.level(id);
      s.bot.rate[i] = Math.max(0.02, byLevel(lv, [0.032, 0.045, 0.06]) * between(ctx.rng, 0.7, 1.3));
      const risk = clamp(byLevel(lv, [0.3, 0.17, 0.07]) * SHAPE_RISK[shape] * 0.7 + p * 0.75, 0, 0.92);
      s.bot.breakAt[i] = random(ctx.rng) < risk ? between(ctx.rng, 0.15, 0.97) : 0;
      s.bot.next[i] = now + between(ctx.rng, 1200, 2600);
    }
    ctx.fx("aiguilles");
    return;
  }
  // Le jeu : les bots avancent par petits bouts, se fêlent à l'approche de leur cassure
  for (let i = 0; i < s.ids.length; i++) {
    const id = s.ids[i]!;
    if (s.st[i] !== PLAYING || !ctx.auto(id) || now < s.bot.next[i]!) continue;
    const step = between(ctx.rng, 0.3, 0.7);
    s.bot.next[i] = now + step * 1000;
    const c = s.carve[id];
    const prog = clamp((c ? carvedShare(c) : s.prog[i]!) + s.bot.rate[i]! * step, 0, 1);
    const fate = s.bot.breakAt[i]!;
    let crack = c ? c.crack : s.crack[i]!;
    if (fate > 0 && prog > fate - 0.25) crack = Math.max(crack, ((prog - (fate - 0.25)) / 0.25) * 1.02);
    else if (random(ctx.rng) < 0.05) crack = Math.min(0.55, crack + between(ctx.rng, 0.05, 0.15));
    if (c) {
      // Un vrai joueur parti en pleine découpe : l'ordinateur continue sur sa lancée
      for (let k = 0; k < OUTLINE_N * prog; k++) c.bits[k] = 1;
      c.crack = crack;
    }
    const was = s.crack[i]!;
    s.prog[i] = r3(prog);
    s.crack[i] = r3(Math.min(1, crack));
    if (crack >= 1) {
      s.st[i] = OUT;
      ctx.out(id, "tarte");
      ctx.fx("casse", { id });
    } else if (prog >= DONE_SHARE) {
      s.st[i] = SAFE;
      s.fin[i] = Math.round(((now - s.stageAt) / 1000) * 10) / 10;
      ctx.fx("detache", { id });
    } else if (crack - was > 0.04) ctx.fx("fele", { id });
  }
  if (now >= s.until || !s.st.some((v) => v === PLAYING)) {
    if (s.st.some((v) => v === PLAYING)) ctx.fx("gong");
    for (let i = 0; i < s.ids.length; i++) {
      if (s.st[i] !== PLAYING) continue;
      s.st[i] = OUT;
      ctx.out(s.ids[i]!, "tarte");
    }
    s.stage = "fin";
  }
}

export const biscuitOver = (s: BiscuitState) => s.stage === "fin";

export function biscuitPerf(s: BiscuitState, i: number): number {
  return s.fin[i]! > 0 ? 1000 - s.fin[i]! - s.crack[i]! * 10 : s.prog[i]! * 100 - s.crack[i]! * 20;
}

/** La forme d'un candidat (quand les boîtes sont ouvertes) */
export const shapeOf = (s: { box: number[]; shapes: ShapeId[] }, i: number): ShapeId | null =>
  s.box[i]! >= 0 ? (s.shapes[s.box[i]!] ?? null) : null;

const hex = (bits: number[]) => {
  let out = "";
  for (let k = 0; k < bits.length; k += 4) out += ((bits[k]! << 3) | (bits[k + 1]! << 2) | (bits[k + 2]! << 1) | bits[k + 3]!).toString(16);
  return out;
};
export const unhex = (h: string): number[] => {
  const bits: number[] = [];
  for (const ch of h) {
    const v = parseInt(ch, 16) || 0;
    bits.push((v >> 3) & 1, (v >> 2) & 1, (v >> 1) & 1, v & 1);
  }
  return bits.slice(0, OUTLINE_N);
};

export function biscuitView(s: BiscuitState) {
  const { bot: _b, carve, shapes, ...rest } = s;
  void _b;
  return {
    ...rest,
    // Les formes restent secrètes tant qu'on choisit
    shapes: s.stage === "choix" ? [] : shapes,
    carve: Object.fromEntries(Object.entries(carve).map(([id, c]) => [id, { bits: hex(c.bits), crack: r3(c.crack), marks: c.marks }])),
  };
}
export type BiscuitView = ReturnType<typeof biscuitView>;
