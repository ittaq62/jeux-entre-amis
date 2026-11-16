// Les bruits des coups de Culbute, fabriqués à la volée (rien à télécharger) : un coup sourd et un claquement dont la
// force suit celle du coup, un tintement sur la garde, une grosse détonation pour une sortie, un froissement pour une
// saisie ; et ceux du corps (le souffle d'un coup qui part, le saut, la réception, le rebord), et la ritournelle de
// celui qui nargue. Ils passent par la sortie générale du site (le réglage du son les coupe comme les autres).

import { audioOut } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

let noiseBuffer: AudioBuffer | null = null;
let lastAt = 0;

function out(): { ctx: AudioContext; dest: GainNode; vol: number } | null {
  const prefs = usePrefs.getState();
  if (!prefs.sound) return null;
  const o = audioOut();
  if (!o) return null;
  if (o.ctx.state === "suspended") void o.ctx.resume();
  return { ctx: o.ctx, dest: o.out, vol: prefs.volume };
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

/** Un coup sourd : une note grave qui tombe */
function thump(ctx: AudioContext, dest: AudioNode, t0: number, f0: number, f1: number, peak: number, decay: number) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + decay);
  const g = ctx.createGain();
  env(g, peak, 0.004, decay, t0);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + decay + 0.05);
}

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
  for (const [freq, k] of [
    [1180, 1],
    [1770, 0.6],
    [2620, 0.35],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * (0.97 + Math.random() * 0.06);
    const g = ctx.createGain();
    env(g, v * k * 0.5, 0.002, 0.22, t0);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  }
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
