// 1, 2, 3, Tournesol ! Le grand tournesol chante le dos tourné, puis se retourne et regarde : qui bouge encore à ce
// moment-là reçoit une giclée de peinture et sort. On court en gardant le doigt appuyé, on s'arrête en le lâchant ;
// mais on a de l'élan (il faut un peu moins d'une demi-seconde pour s'arrêter en pleine course). Qui n'a pas franchi
// la ligne au bout du chrono est repeint aussi.

import { random } from "../../../rng.ts";
import { between, byLevel, clamp, gauss, OUT, PLAYING, pressure, r2, SAFE, type EpCtx } from "./common.ts";

/** La longueur de la cour, de la ligne de départ à celle d'arrivée (mètres) */
export const SOLEIL_LEN = 44;
export const SOLEIL_VMAX = 3.7;
export const SOLEIL_ACC = 6.5;
export const SOLEIL_DEC = 9.5;
/** Au-dessus de cette vitesse, on bouge */
const STILL = 0.2;
/** Le tournesol finit de se retourner, puis laisse encore ce temps avant de voir (le temps de réagir) */
export const SOLEIL_GRACE = 0.28;
const TURN_S = 0.5;
const BACK_S = 0.45;
const READY_S = 3;
const LIMIT_S = 64;

export type Head = "dos" | "tourne" | "regarde" | "retourne";

export interface SoleilState {
  kind: "soleil";
  stage: "pret" | "jeu" | "fin";
  ids: string[];
  st: number[];
  /** La place de chacun dans la largeur (fixe), puis où il en est dans la longueur, et sa vitesse */
  x: number[];
  z: number[];
  v: number[];
  /** Le doigt appuyé */
  run: boolean[];
  /** Le moment où il a franchi la ligne (secondes depuis le départ), 0 sinon */
  fin: number[];
  head: Head;
  headAt: number;
  headUntil: number;
  /** Le nombre de chants depuis le départ */
  cycle: number;
  startAt: number;
  endsAt: number;
  /** Ce que prévoient les bots pour ce chant (ce qui reste au serveur) */
  bot: { go: number[]; stop: number[] };
}

export function soleilStart(ids: string[], now: number, ctx?: Pick<EpCtx, "eclair">): SoleilState {
  const n = ids.length;
  const perRow = n > 22 ? Math.ceil(n / 2) : n;
  const width = Math.min(30, perRow * 1.5);
  const x: number[] = [];
  const z: number[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, n - row * perRow);
    // Chacun au milieu de sa part de la ligne ; la deuxième rangée, décalée d'une demi-place, regarde entre deux têtes
    x.push(r2(-width / 2 + (width * (col + 0.5 + (row ? 0.25 : 0))) / inRow));
    z.push(-row * 1.6);
  }
  const zero = () => ids.map(() => 0);
  return {
    kind: "soleil",
    stage: "pret",
    ids,
    st: zero(),
    x: x.map((v) => clamp(v, -15.8, 15.8)),
    z,
    v: zero(),
    run: ids.map(() => false),
    fin: zero(),
    head: "regarde",
    headAt: now,
    headUntil: now + READY_S * 1000,
    cycle: 0,
    startAt: now + READY_S * 1000,
    endsAt: now + (READY_S + (ctx?.eclair ? LIMIT_S * 0.72 : LIMIT_S)) * 1000,
    bot: { go: zero(), stop: zero() },
  };
}

export function soleilInput(s: SoleilState, id: string, run: boolean) {
  const i = s.ids.indexOf(id);
  if (i < 0 || s.st[i] !== PLAYING) return;
  s.run[i] = run;
}

/** Il bouge, aux yeux du tournesol */
export const moving = (s: SoleilState, i: number) => s.v[i]! > STILL || s.run[i]!;

/** Le tournesol voit en ce moment */
export const watching = (s: SoleilState, now: number) => s.head === "regarde" && now >= s.headAt + SOLEIL_GRACE * 1000 && s.stage === "jeu";

/** La durée d'un chant : parfois tout lent, parfois expédié (secondes) */
function chantLength(s: SoleilState, ctx: EpCtx): number {
  return baseChant(s, ctx) * (ctx.eclair ? 0.78 : 1);
}

function baseChant(s: SoleilState, ctx: EpCtx): number {
  const r = random(ctx.rng);
  // Les premiers chants sont plus sages ; ensuite, des pièges : un très court, ou un très long
  if (s.cycle < 2) return between(ctx.rng, 2.6, 4.4);
  if (r < 0.18) return between(ctx.rng, 1.4, 2.0);
  if (r < 0.3) return between(ctx.rng, 4.8, 6.2);
  return between(ctx.rng, 2.2, 4.6);
}

function planBots(s: SoleilState, ctx: EpCtx) {
  const live = s.ids.map((_, i) => i).filter((i) => s.st[i] === PLAYING);
  const bots = live.filter((i) => ctx.auto(s.ids[i]!));
  const len = (s.headUntil - s.headAt) / 1000;
  // Combien de chants il reste, à peu près : la distance qui reste, au pas d'un bot moyen
  const left = live.reduce((a, i) => a + Math.max(0, SOLEIL_LEN - s.z[i]!), 0) / Math.max(1, live.length);
  const chances = Math.max(1, Math.ceil(left / 10));
  const p = Math.min(0.85, pressure(live.length, ctx.keep, bots.length, chances) * 1.35);
  for (const i of bots) {
    const lv = ctx.level(s.ids[i]!);
    const react = Math.max(0.05, byLevel(lv, [0.36, 0.22, 0.13]) + gauss(ctx.rng) * byLevel(lv, [0.14, 0.08, 0.05]));
    s.bot.go[i] = s.headAt + react * 1000;
    // Il anticipe la fin du chant, plus ou moins bien ; parfois il est trop gourmand (ce que veut le metteur en scène)
    let stop = len + byLevel(lv, [0.06, -0.04, -0.14]) + gauss(ctx.rng) * byLevel(lv, [0.16, 0.1, 0.06]);
    // Trop gourmand : il court encore quand le regard commence pour de bon (après le demi-tour et la grâce), et se fait
    // prendre quelle que soit la cadence du serveur (avant, il ne restait qu'une fenêtre de 90 ms pour le voir freiner)
    if (random(ctx.rng) < p) stop = len + TURN_S + SOLEIL_GRACE + between(ctx.rng, 0.06, 0.4);
    // Tout près de la ligne, il fonce (il passe s'il peut, sinon il s'arrête comme les autres)
    s.bot.stop[i] = s.headAt + stop * 1000;
  }
}

function setHead(s: SoleilState, head: Head, now: number, seconds: number) {
  s.head = head;
  s.headAt = now;
  s.headUntil = now + seconds * 1000;
}

export function soleilTick(s: SoleilState, ctx: EpCtx) {
  const now = ctx.now;
  const dt = ctx.dt;
  if (s.stage === "fin") return;
  if (s.stage === "pret") {
    if (now < s.startAt) return;
    s.stage = "jeu";
    setHead(s, "retourne", now, BACK_S);
    ctx.fx("retourne");
  }
  // Le tournesol
  if (now >= s.headUntil) {
    if (s.head === "retourne") {
      const len = chantLength(s, ctx);
      setHead(s, "dos", now, len);
      s.cycle++;
      ctx.fx("chant", { a: Math.round(len * 1000) });
      planBots(s, ctx);
    } else if (s.head === "dos") {
      setHead(s, "tourne", now, TURN_S);
      ctx.fx("tourne");
    } else if (s.head === "tourne") {
      setHead(s, "regarde", now, between(ctx.rng, 2.1, 3.8));
      ctx.fx("regarde");
    } else {
      setHead(s, "retourne", now, BACK_S);
      ctx.fx("retourne");
    }
  }
  const t = (now - s.startAt) / 1000;
  for (let i = 0; i < s.ids.length; i++) {
    if (s.st[i] !== PLAYING) continue;
    const id = s.ids[i]!;
    if (ctx.auto(id)) {
      // Le bot court entre son départ et son arrêt prévus, même si le tournesol s'est déjà retourné (le gourmand) ;
      // pendant que la tête revient (« retourne »), il attend le chant suivant
      s.run[i] = s.head !== "retourne" && now >= s.bot.go[i]! && now < s.bot.stop[i]!;
      if (s.head === "dos" && s.z[i]! > SOLEIL_LEN - 3) s.run[i] = now >= s.bot.go[i]!;
    }
    const v0 = s.v[i]!;
    const v = s.run[i] ? Math.min(SOLEIL_VMAX, v0 + SOLEIL_ACC * dt) : Math.max(0, v0 - SOLEIL_DEC * dt);
    s.v[i] = v;
    s.z[i] = s.z[i]! + ((v0 + v) / 2) * dt;
    if (s.z[i]! >= SOLEIL_LEN) {
      s.st[i] = SAFE;
      s.fin[i] = Math.round(t * 100) / 100;
      s.run[i] = false;
      ctx.fx("arrive", { id });
      continue;
    }
    if (watching(s, now) && moving(s, i)) {
      s.st[i] = OUT;
      s.run[i] = false;
      ctx.out(id, "peinture");
      ctx.fx("peinture", { id, a: r2(s.z[i]!) });
    }
  }
  // Fin : tout le monde est passé ou repeint, ou le chrono est fini
  const playing = s.st.some((v) => v === PLAYING);
  if (!playing || now >= s.endsAt) {
    if (playing) ctx.fx("fane");
    for (let i = 0; i < s.ids.length; i++) {
      if (s.st[i] !== PLAYING) continue;
      s.st[i] = OUT;
      ctx.out(s.ids[i]!, "temps");
    }
    s.stage = "fin";
  }
}

export const soleilOver = (s: SoleilState) => s.stage === "fin";

/** La performance : arrivé, plus c'est tôt mieux c'est ; sinon la distance parcourue */
export function soleilPerf(s: SoleilState, i: number): number {
  return s.fin[i]! > 0 ? 1000 - s.fin[i]! : clamp(s.z[i]!, 0, SOLEIL_LEN);
}

export function soleilView(s: SoleilState) {
  const { bot: _b, run, ...rest } = s;
  void _b;
  return { ...rest, z: s.z.map(r2), v: s.v.map(r2), run: run.map((r) => (r ? 1 : 0)) };
}
export type SoleilView = ReturnType<typeof soleilView>;
