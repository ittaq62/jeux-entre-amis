// Les bruits des coups de Culbute, fabriqués à la volée (rien à télécharger) : un coup sourd et un claquement dont la
// force suit celle du coup, un tintement sur la garde, une grosse détonation pour une sortie, un froissement pour une
// saisie ; et ceux du corps (le souffle d'un coup qui part, la charge, le saut, la réception, le rebord), et la
// ritournelle de celui qui nargue. Ils passent par la sortie générale du site (le réglage du son les coupe comme les autres).

import { audioOut, effectsLevel } from "../lib/sound.ts";
import { limiterOut, roomOut, strike, type Body } from "../lib/sfxKit.ts";

let noiseBuffer: AudioBuffer | null = null;
let lastAt = 0;

/**
 * Où vont les bruits de Culbute : l'arène (une réverbération très courte, le combat est rapide), puis le limiteur commun,
 * dernier maillon avant la sortie générale (le volume des réglages y passe toujours). Le limiteur : à une sortie, le
 * coup qui éjecte et la détonation tombent ensemble, et leur somme dépassait le plafond (rendu hors ligne, au volume par
 * défaut : des crêtes à +6 dBFS, ça grésillait ; quatre coups forts à la suite aussi). Les coups légers et moyens gardent
 * leur niveau ; ce qui dépassait est ramené sous le plafond.
 */
function chain(ctx: AudioContext, master: GainNode): GainNode {
  return roomOut(ctx, limiterOut(ctx, master), { rt60: 0.3, wet: 0.1 }) as GainNode;
}

/**
 * À l'ouverture du combat : l'arène et le limiteur se créent tout de suite. Neuf, le compresseur de Chrome atténue d'une
 * dizaine de dB ses cent premières millisecondes : créé au premier coup, il en étouffait le son.
 */
export function prepareSfx() {
  const o = audioOut();
  if (o) chain(o.ctx, o.out);
}

function out(): { ctx: AudioContext; dest: GainNode; vol: number } | null {
  // Le réglage du son du site : général × effets (0 quand le son est coupé)
  const vol = effectsLevel();
  if (vol <= 0) return null;
  const o = audioOut();
  if (!o) return null;
  if (o.ctx.state === "suspended") void o.ctx.resume();
  return { ctx: o.ctx, dest: chain(o.ctx, o.out), vol };
}

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 1.2);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuffer = b;
  return b;
}

/** Une enveloppe courte : monte en `attack`, retombe en `decay` */
function env(gain: GainNode, peak: number, attack: number, decay: number, t0: number) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

/**
 * Un coup sourd : un corps qui encaisse (une peau amortie, plusieurs modes qui s'éteignent chacun à leur rythme, et le
 * bruit du choc), au lieu d'une seule note qui tombait. Même hauteur (entre f0 et f1), même durée, même force.
 */
function thump(ctx: AudioContext, dest: AudioNode, t0: number, f0: number, f1: number, peak: number, decay: number) {
  const body: Body = {
    ratios: [1, 1.52, 2.18, 2.95],
    decays: [decay / 7, decay / 10, decay / 14, decay / 18],
    amps: [1, 0.5, 0.3, 0.15],
  };
  // Calé sur la force de l'ancienne note (mesurée sur les 50 ms les plus fortes)
  strike(ctx, dest, t0, body, Math.sqrt(f0 * f1), { gain: peak * 0.85, velocity: 0.85, hardness: 1600, click: 0.35 });
}

/**
 * La garde qui pare : une petite lame de métal (les mêmes rapports que l'ancien tintement), claire et distincte. Elle
 * s'éteint aussi vite que l'ancien tintement (environ 140 ms) : plus longue, une rafale de coups sur la garde se
 * brouillait en un seul bourdonnement.
 */
const GUARD: Body = { ratios: [1, 1.5, 2.22], decays: [0.032, 0.025, 0.018], amps: [1, 0.6, 0.35] };

/** Un claquement : un souffle de bruit filtré */
function slap(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  freq: number,
  q: number,
  peak: number,
  decay: number,
  type: BiquadFilterType = "bandpass",
) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, peak, 0.002, decay, t0);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + decay + 0.05);
}

/** Pas deux bruits de coup dans le même instant (un coup multiple, plusieurs combattants) */
function throttle(ms: number): boolean {
  const now = performance.now();
  if (now - lastAt < ms) return false;
  lastAt = now;
  return true;
}

/** Un coup qui touche : plus il est fort (0 à 1), plus c'est grave, long et sec */
export function impact(power: number, ko = false) {
  const o = out();
  if (!o || !throttle(28)) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  const p = Math.max(0, Math.min(1, power));
  const v = vol * (0.55 + p * 0.45);
  const pitch = 0.92 + Math.random() * 0.16;
  thump(ctx, dest, t0, (150 - p * 60) * pitch, (55 - p * 15) * pitch, v * (0.7 + p * 0.5), 0.09 + p * 0.18);
  slap(ctx, dest, t0, (2400 - p * 900) * pitch, 0.9, v * (0.5 + p * 0.3), 0.04 + p * 0.06);
  if (p > 0.45 || ko) slap(ctx, dest, t0 + 0.01, 5200, 0.7, v * 0.35, 0.12 + p * 0.1, "highpass");
  if (ko) {
    // Le coup de grâce : une deuxième frappe plus grave, et un sifflement qui s'éloigne
    thump(ctx, dest, t0 + 0.02, 70, 28, vol * 1.1, 0.55);
    const w = ctx.createBufferSource();
    w.buffer = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 6;
    f.frequency.setValueAtTime(1800, t0 + 0.05);
    f.frequency.exponentialRampToValueAtTime(400, t0 + 0.75);
    const g = ctx.createGain();
    env(g, vol * 0.35, 0.06, 0.7, t0 + 0.05);
    w.connect(f).connect(g).connect(dest);
    w.start(t0 + 0.05);
    w.stop(t0 + 0.9);
  }
}

/** Un coup arrêté par la garde : un tintement */
export function shieldHit(power: number) {
  const o = out();
  if (!o || !throttle(28)) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  const v = vol * (0.35 + power * 0.3);
  // Un coup plus fort sonne un peu plus clair ; la force, elle, suit celle de l'ancien tintement à 0,4 dB près, coups
  // légers compris (rendu hors ligne ; ils étaient 3 à 4 dB plus bas)
  const vel = 0.8 + Math.max(0, Math.min(1, power)) * 0.2;
  strike(ctx, dest, t0, GUARD, 1180 * (0.97 + Math.random() * 0.06), {
    gain: (v * 0.5) / vel,
    velocity: vel,
    hardness: 7000,
    click: 0.3,
  });
  slap(ctx, dest, t0, 3200, 1.2, v * 0.4, 0.03);
}

/** Sorti de l'arène : une détonation, puis l'écho */
export function koBlast() {
  const o = out();
  if (!o) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  thump(ctx, dest, t0, 95, 32, vol * 1.2, 0.8);
  slap(ctx, dest, t0, 700, 0.5, vol * 0.8, 0.9, "lowpass");
  slap(ctx, dest, t0 + 0.01, 4200, 0.6, vol * 0.3, 0.35, "highpass");
}

/** Une saisie : un froissement de tissu */
export function grab() {
  const o = out();
  if (!o) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  slap(ctx, dest, t0, 1400, 1.5, vol * 0.4, 0.09);
  slap(ctx, dest, t0 + 0.05, 900, 1.5, vol * 0.3, 0.08);
  thump(ctx, dest, t0, 120, 80, vol * 0.3, 0.07);
}

/**
 * La cloche du clocher : à l'annonce, un tintement léger ; à son coup (`ring`), un grand « dong » qui résonne. (Le
 * paramètre ne s'appelle plus « strike » : il masquait la fonction de la boîte à sons du même nom.)
 */
export function bell(ring: boolean) {
  const o = out();
  if (!o) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  const base = ring ? 196 : 587;
  const partials: readonly (readonly [number, number, number])[] = ring
    ? [
        [0.5, 0.55, 3.4],
        [1, 1, 3],
        [2, 0.55, 2.2],
        [2.76, 0.45, 1.6],
        [5.4, 0.22, 0.8],
      ]
    : [
        [1, 1, 0.9],
        [2.76, 0.35, 0.45],
      ];
  for (const [r, k, d] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base * r, t0);
    const g = ctx.createGain();
    env(g, vol * (ring ? 0.32 : 0.1) * k, 0.004, d, t0);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + d + 0.05);
  }
  if (ring) thump(ctx, dest, t0, 80, 55, vol * 0.45, 0.5);
}

/** La charrette qui arrive : les roues qui grondent sur les pavés en enflant, et les cahots */
export function cart() {
  const o = out();
  if (!o) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 260;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + 1.6);
  g.gain.exponentialRampToValueAtTime(vol * 0.35, t0 + 2.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);
  src.connect(f).connect(g).connect(dest);
  src.start(t0);
  src.stop(t0 + 3.7);
  // Les cahots : le bois qui claque, de plus en plus fort, puis qui s'éloigne
  for (let i = 0; i < 22; i++) {
    const t = t0 + 0.2 + i * 0.15 + Math.random() * 0.04;
    const k = i < 11 ? (i + 1) / 11 : (22 - i) / 11;
    slap(ctx, dest, t, 700 + Math.random() * 300, 3, vol * 0.18 * k, 0.05);
  }
}

/** Les mèches des pétards qui grésillent avant d'éclater */
export function fuse() {
  const o = out();
  if (!o) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  for (let i = 0; i < 12; i++) slap(ctx, dest, t0 + i * 0.11, 4200 + Math.random() * 1500, 2, vol * 0.08, 0.09, "highpass");
}

/** Les cagettes qui craquent là-haut, puis s'écrasent sur le pavé */
export function crate(fall: boolean) {
  const o = out();
  if (!o) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  if (!fall) {
    for (let i = 0; i < 3; i++) slap(ctx, dest, t0 + i * 0.22, 520, 6, vol * 0.18, 0.12);
    return;
  }
  thump(ctx, dest, t0, 150, 55, vol * 0.7, 0.25);
  slap(ctx, dest, t0, 900, 1.2, vol * 0.5, 0.18);
  slap(ctx, dest, t0 + 0.03, 2600, 1.5, vol * 0.25, 0.12);
}

/** Une parade : un « ting » clair qui scintille */
export function parry() {
  const o = out();
  if (!o || !throttle(28)) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  for (const [freq, k, d] of [
    [2350, 1, 0.35],
    [3520, 0.55, 0.28],
    [4700, 0.3, 0.2],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.04, t0 + d);
    const g = ctx.createGain();
    env(g, vol * 0.32 * k, 0.002, d, t0);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + d + 0.05);
  }
  slap(ctx, dest, t0, 6000, 0.8, vol * 0.25, 0.06, "highpass");
}

/** Les bruits du corps ont chacun leur garde-fou (ils ne doivent pas étouffer ceux des coups) */
const lastBody = new Map<string, number>();
function bodyThrottle(kind: string, ms: number): boolean {
  const now = performance.now();
  if (now - (lastBody.get(kind) ?? 0) < ms) return false;
  lastBody.set(kind, now);
  return true;
}

/** Un souffle qui balaie : le bruit d'un coup qui part (plus il est fort, plus il est ample et grave) */
export function whoosh(power: number, gain = 1) {
  const o = out();
  if (!o || !bodyThrottle("whoosh", 35)) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.003;
  const p = Math.max(0, Math.min(1, power));
  const d = 0.1 + p * 0.1;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.4;
  const pitch = 0.9 + Math.random() * 0.2;
  f.frequency.setValueAtTime((700 - p * 250) * pitch, t0);
  f.frequency.exponentialRampToValueAtTime((2600 - p * 900) * pitch, t0 + d * 0.6);
  f.frequency.exponentialRampToValueAtTime((1200 - p * 400) * pitch, t0 + d);
  const g = ctx.createGain();
  env(g, vol * gain * (0.16 + p * 0.16), d * 0.45, d * 0.75, t0);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + d * 1.3 + 0.05);
}

/** Un saut : un petit « hop » qui monte */
export function hop(gain = 1) {
  const o = out();
  if (!o || !bodyThrottle("hop", 40)) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.003;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(320 * (0.95 + Math.random() * 0.1), t0);
  osc.frequency.exponentialRampToValueAtTime(640, t0 + 0.07);
  const g = ctx.createGain();
  env(g, vol * gain * 0.07, 0.006, 0.07, t0);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + 0.1);
  slap(ctx, dest, t0, 1600, 1.1, vol * gain * 0.07, 0.05);
}

/** Une réception : un pas sourd sur le sol */
export function land(gain = 1) {
  const o = out();
  if (!o || !bodyThrottle("land", 40)) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.003;
  thump(ctx, dest, t0, 120, 55, vol * gain * 0.22, 0.08);
  slap(ctx, dest, t0, 700, 0.8, vol * gain * 0.1, 0.05, "lowpass");
}

/** La main qui attrape le rebord : une petite claque sèche */
export function ledge(gain = 1) {
  const o = out();
  if (!o || !bodyThrottle("ledge", 60)) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.003;
  slap(ctx, dest, t0, 1900, 1.6, vol * gain * 0.2, 0.045);
  thump(ctx, dest, t0, 200, 120, vol * gain * 0.08, 0.04);
}

/** Narguer : trois petites notes moqueuses qui montent et redescendent (« na-na-nè-re ») */
export function taunt(gain = 1) {
  const o = out();
  if (!o || !bodyThrottle("taunt", 300)) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.01;
  const notes: [number, number, number][] = [
    [784, 0, 0.11],
    [659, 0.13, 0.11],
    [880, 0.26, 0.12],
    [659, 0.41, 0.2],
  ];
  for (const [freq, at, d] of notes) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    env(g, vol * gain * 0.13, 0.01, d, t0 + at);
    osc.connect(g).connect(dest);
    osc.start(t0 + at);
    osc.stop(t0 + at + d + 0.05);
  }
}

/** Un coup qu'on charge : un sifflement qui monte, le temps de la décision */
export function charge(gain = 1) {
  const o = out();
  if (!o || !bodyThrottle("charge", 120)) return;
  const { ctx, dest, vol } = o;
  const t0 = ctx.currentTime + 0.005;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, t0);
  osc.frequency.exponentialRampToValueAtTime(660, t0 + 0.45);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(900, t0);
  f.frequency.exponentialRampToValueAtTime(2600, t0 + 0.45);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol * gain * 0.06, t0 + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
  osc.connect(f).connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + 0.55);
}
