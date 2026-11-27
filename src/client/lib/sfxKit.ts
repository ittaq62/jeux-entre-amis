// Une boîte à outils commune pour les sons fabriqués à la volée (Web Audio), pour qu'ils sonnent comme de vrais objets et
// pas comme des « bips » : un objet frappé vibre sur plusieurs fréquences inharmoniques qui s'éteignent chacune à leur
// rythme (au lieu d'un seul sinus qui glisse), le choc lui-même s'entend (une rafale de bruit filtré), et tout sonne
// dans une petite pièce (une réverbération courte, partagée par toute la page). Chaque coup varie un peu.
//
// Usage :
//   const out = roomOut(ctx, master);                 // la sortie « dans la pièce » (à la place de master)
//   strike(ctx, out, t, WOOD, 420, { gain: 0.5 });     // un bloc de bois frappé
//   strike(ctx, out, t, METAL_BAR, 300, { gain: 0.4, hardness: 7000 });

/** Un corps qui vibre : ses modes (rapport à la fondamentale), leur durée d'extinction (s) et leur niveau */
export interface Body {
  ratios: readonly number[];
  decays: readonly number[];
  amps: readonly number[];
}

/** Des corps courants (mesurés ou tirés de la physique des lames, poutres et membranes) */
export const WOOD: Body = { ratios: [1, 1.58, 2.71, 3.96], decays: [0.06, 0.035, 0.02, 0.012], amps: [1, 0.6, 0.3, 0.15] };
export const PLASTIC: Body = {
  ratios: [1, 1.47, 2.09, 2.83, 3.7],
  decays: [0.03, 0.02, 0.014, 0.01, 0.007],
  amps: [1, 0.7, 0.5, 0.3, 0.2],
};
export const MARIMBA: Body = { ratios: [1, 3.93, 9.2], decays: [0.45, 0.09, 0.03], amps: [1, 0.32, 0.12] };
export const METAL_BAR: Body = { ratios: [1, 2.756, 5.404, 8.933], decays: [1.2, 0.7, 0.35, 0.18], amps: [1, 0.55, 0.3, 0.15] };
export const BELL: Body = { ratios: [1, 2.0, 2.41, 3.01, 4.17], decays: [1.6, 1.1, 0.7, 0.5, 0.3], amps: [1, 0.45, 0.35, 0.25, 0.15] };
export const DRUM: Body = { ratios: [1, 1.59, 2.14, 2.3, 2.65], decays: [0.22, 0.12, 0.08, 0.07, 0.05], amps: [1, 0.6, 0.4, 0.35, 0.25] };
/** Une boule dure (billard, bowling) : peu de modes, très aigus, très brefs */
export const HARD_BALL: Body = { ratios: [1, 1.62, 2.4], decays: [0.018, 0.012, 0.008], amps: [1, 0.5, 0.25] };

/** Un nombre au hasard autour de `x` (± `pct` en fraction) */
export const vary = (x: number, pct = 0.06) => x * (1 + (Math.random() * 2 - 1) * pct);

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Une seconde de bruit blanc, faite une fois par contexte */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noises.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(ctx, b);
  }
  return b;
}

/**
 * La réponse d'une petite pièce : quelques premières réflexions, puis une queue de bruit qui s'éteint et s'assourdit
 * (`rt60` : le temps pour perdre 60 dB). Pure fonction de ses paramètres et du hasard (pour les tests : `rand`).
 */
export function roomImpulse(sampleRate: number, rt60 = 0.35, rand: () => number = Math.random): Float32Array[] {
  const n = Math.floor(sampleRate * (rt60 * 1.2 + 0.03));
  const out = [new Float32Array(n), new Float32Array(n)];
  for (const ch of out) {
    // Les premières réflexions (les murs proches), différentes à gauche et à droite
    for (let k = 0; k < 6; k++) {
      const i = Math.floor(sampleRate * (0.004 + rand() * 0.024));
      ch[i] = (ch[i] ?? 0) + (0.15 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1);
    }
    // La queue : du bruit qui s'éteint en `rt60`, de plus en plus sourd (un filtre passe-bas qui se ferme)
    const start = Math.floor(sampleRate * 0.012);
    let lp = 0;
    for (let i = start; i < n; i++) {
      const t = (i - start) / sampleRate;
      const a = 0.15 + 0.6 * Math.exp(-t / (rt60 * 0.5));
      lp += a * (rand() * 2 - 1 - lp);
      ch[i] = (ch[i] ?? 0) + lp * 0.35 * Math.exp((-6.9 * t) / rt60);
    }
  }
  return out;
}

const rooms = new WeakMap<AudioNode, Map<string, AudioNode>>();

/**
 * La sortie « dans une petite pièce » : le son direct, plus un peu de réverbération (`wet`), vers `dest`. Une seule par
 * sortie et par réglage (la même pièce pour tous les sons d'un jeu, un seul convolueur à calculer ; deux jeux qui
 * sortent au même endroit avec des salles différentes gardent chacun la leur).
 */
export function roomOut(ctx: BaseAudioContext, dest: AudioNode, opts: { rt60?: number; wet?: number } = {}): AudioNode {
  const rt60 = opts.rt60 ?? 0.35;
  const key = `${rt60}|${opts.wet ?? 0.18}`;
  let byKey = rooms.get(dest);
  if (!byKey) rooms.set(dest, (byKey = new Map()));
  const known = byKey.get(key);
  if (known) return known;
  const input = ctx.createGain();
  const conv = ctx.createConvolver();
  const ir = roomImpulse(ctx.sampleRate, rt60);
  const buf = ctx.createBuffer(2, ir[0]!.length, ctx.sampleRate);
  buf.copyToChannel(ir[0]! as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(ir[1]! as Float32Array<ArrayBuffer>, 1);
  conv.buffer = buf;
  const wet = ctx.createGain();
  wet.gain.value = opts.wet ?? 0.18;
  input.connect(dest);
  input.connect(conv).connect(wet).connect(dest);
  byKey.set(key, input);
  return input;
}

const limiters = new WeakMap<AudioNode, AudioNode>();

/**
 * Un limiteur devant `dest` : quand des dizaines de chocs tombent ensemble (un strike, quatre combattants), leur somme
 * ne dépasse plus le plafond de la sortie (sinon le son grésille). `input` baisse l'entrée d'autant que le compresseur
 * remonte de lui-même les sons faibles. À créer tôt (au chargement du jeu) : Chrome atténue d'une dizaine de dB les
 * cent premières millisecondes d'un compresseur neuf, et le premier son du jeu sortirait plus bas.
 */
export function limiterOut(ctx: BaseAudioContext, dest: AudioNode, opts: { input?: number } = {}): AudioNode {
  const known = limiters.get(dest);
  if (known) return known;
  const g = ctx.createGain();
  g.gain.value = opts.input ?? 0.6;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -10;
  lim.knee.value = 6;
  lim.ratio.value = 16;
  lim.attack.value = 0.002;
  lim.release.value = 0.12;
  g.connect(lim).connect(dest);
  limiters.set(dest, g);
  return g;
}

/** Le bruit du choc : une rafale très brève de bruit, filtrée selon la dureté (Hz : plus c'est dur, plus c'est aigu) */
export function contact(ctx: BaseAudioContext, dest: AudioNode, t: number, gain: number, hardness = 4000, dur = 0.006) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = hardness;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.9);
  src.stop(t + dur + 0.01);
}

/**
 * Un objet frappé : chacun de ses modes (un peu désaccordé, au hasard), qui s'éteint à son rythme, et le bruit du choc.
 * `velocity` (0 à 1) : un coup plus fort est plus brillant (ses modes aigus montent plus que le grave).
 */
export function strike(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  body: Body,
  f0: number,
  opts: { gain?: number; velocity?: number; hardness?: number; detune?: number; click?: number } = {},
) {
  const gain = opts.gain ?? 0.5;
  const v = opts.velocity ?? 0.8;
  const detune = opts.detune ?? 0.006;
  body.ratios.forEach((r, i) => {
    const f = f0 * r * (1 + (Math.random() * 2 - 1) * detune);
    if (f > ctx.sampleRate / 2 - 500) return;
    const decay = body.decays[i] ?? 0.05;
    const amp = (body.amps[i] ?? 0.1) * v ** (1 + i * 0.6) * gain;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.004, t);
    // Le corps se pose : sa hauteur se stabilise dans les premières millisecondes
    o.frequency.exponentialRampToValueAtTime(f, t + 0.02);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.0008);
    g.gain.setTargetAtTime(0.0001, t + 0.0008, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.0008 + decay * 7);
  });
  contact(ctx, dest, t, gain * (opts.click ?? 0.3) * v, (opts.hardness ?? 4000) * (0.6 + 0.6 * v));
}
