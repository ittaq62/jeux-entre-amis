// Les bruits du minigolf, fabriqués à la volée (rien à télécharger) : le « toc » du putter selon la force, la balle
// qui cogne une bordure de bois, de buis, de pierre ou de fer, qui retombe, qui tombe au fond du trou (et y tourne),
// qui frôle le bord, qui plonge dans l'eau ; les tremplins, les téléporteurs, les tubes ; et l'ambiance de chaque
// parcours (les oiseaux et le vent du jardin…). Tout passe par le réglage du son du site.

import { audioOut, effectsLevel, musicLevel } from "../lib/sound.ts";

let noiseBuffer: AudioBuffer | null = null;

function out(level = effectsLevel()): { ctx: AudioContext; dest: GainNode; vol: number } | null {
  if (level <= 0) return null;
  const o = audioOut();
  if (!o) return null;
  if (o.ctx.state === "suspended") void o.ctx.resume();
  return { ctx: o.ctx, dest: o.out, vol: level };
}

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 2);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuffer = b;
  return b;
}

function env(g: GainNode, peak: number, attack: number, decay: number, t0: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  type: OscillatorType,
  f0: number,
  f1: number,
  peak: number,
  attack: number,
  decay: number,
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + attack + decay);
  const g = ctx.createGain();
  env(g, peak, attack, decay, t0);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + attack + decay + 0.05);
}

function burst(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  filter: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  attack: number,
  decay: number,
) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, peak, attack, decay, t0);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + attack + decay + 0.05);
}

const last = new Map<string, number>();
/** Pas plus d'un même bruit tous les `gap` millisecondes */
function spaced(key: string, gap: number): boolean {
  const now = performance.now();
  if (now - (last.get(key) ?? 0) < gap) return false;
  last.set(key, now);
  return true;
}

/** Le coup de putter : un « toc » net, plus sec et plus fort quand on frappe fort */
export function putt(power: number, vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.005;
  const v = o.vol * vol * (0.35 + power * 0.65);
  tone(o.ctx, o.dest, t, "sine", 1900 + power * 900, 900, v * 0.5, 0.001, 0.05);
  tone(o.ctx, o.dest, t, "triangle", 420 + power * 180, 160, v * 0.55, 0.002, 0.11);
  burst(o.ctx, o.dest, t, "bandpass", 3200, 1.2, v * 0.35, 0.001, 0.03);
}

/** La balle contre un obstacle : le bois sonne creux, le buis étouffe, la pierre claque, le fer tinte */
export function knock(kind: string, speed: number, vol = 1) {
  if (!spaced(`k:${kind}`, 45)) return;
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  const v = o.vol * vol * Math.min(1, 0.15 + speed / 4);
  switch (kind) {
    case "hedge":
      burst(o.ctx, o.dest, t, "lowpass", 900, 0.7, v * 0.7, 0.002, 0.09);
      tone(o.ctx, o.dest, t, "sine", 180, 120, v * 0.4, 0.002, 0.08);
      break;
    case "stone":
      tone(o.ctx, o.dest, t, "triangle", 1500, 1100, v * 0.45, 0.001, 0.05);
      burst(o.ctx, o.dest, t, "highpass", 2500, 0.8, v * 0.4, 0.001, 0.04);
      break;
    case "metal":
      tone(o.ctx, o.dest, t, "sine", 2300, 2200, v * 0.35, 0.001, 0.4);
      tone(o.ctx, o.dest, t, "sine", 3450, 3400, v * 0.18, 0.001, 0.28);
      break;
    case "bumper":
      tone(o.ctx, o.dest, t, "square", 520, 880, v * 0.25, 0.002, 0.12);
      tone(o.ctx, o.dest, t, "sine", 260, 440, v * 0.4, 0.002, 0.16);
      break;
    default:
      // Le bois des bordures
      tone(o.ctx, o.dest, t, "triangle", 620, 420, v * 0.55, 0.001, 0.08);
      burst(o.ctx, o.dest, t, "bandpass", 1400, 2, v * 0.4, 0.001, 0.05);
  }
}

/** Elle retombe sur le sol */
export function land(mat: string, speed: number, vol = 1) {
  if (!spaced("land", 60) || speed < 0.6) return;
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  const v = o.vol * vol * Math.min(1, speed / 5);
  if (mat === "sand" || mat === "snow") burst(o.ctx, o.dest, t, "lowpass", 700, 0.5, v * 0.8, 0.003, 0.22);
  else if (mat === "wood" || mat === "metal" || mat === "stone") {
    tone(o.ctx, o.dest, t, "triangle", 300, 200, v * 0.6, 0.002, 0.1);
    burst(o.ctx, o.dest, t, "bandpass", 1200, 1.5, v * 0.35, 0.001, 0.06);
  } else {
    tone(o.ctx, o.dest, t, "sine", 140, 90, v * 0.7, 0.003, 0.12);
    burst(o.ctx, o.dest, t, "lowpass", 600, 0.6, v * 0.3, 0.002, 0.08);
  }
}

/** Au fond du trou : le choc sur le fond, puis la balle qui tourne et s'arrête */
export function cupDrop(vol = 1, cheer = false) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.01;
  const v = o.vol * vol;
  tone(o.ctx, o.dest, t, "triangle", 260, 180, v * 0.75, 0.002, 0.14);
  tone(o.ctx, o.dest, t, "sine", 1100, 1000, v * 0.3, 0.001, 0.1);
  for (let k = 0; k < 6; k++) {
    const tk = t + 0.12 + k * (0.07 - k * 0.006);
    tone(o.ctx, o.dest, tk, "triangle", 900 - k * 40, 700, v * (0.28 - k * 0.04), 0.001, 0.04);
  }
  if (cheer) applause(0.9);
}

/** La balle frôle le bord du trou et ressort */
export function lip(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  tone(o.ctx, o.dest, t, "sine", 1700, 1500, o.vol * vol * 0.35, 0.001, 0.12);
  tone(o.ctx, o.dest, t + 0.05, "sine", 1400, 1300, o.vol * vol * 0.2, 0.001, 0.1);
}

/** Le plouf, et les bulles */
export function splash(vol = 1, lava = false) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.005;
  const v = o.vol * vol;
  burst(o.ctx, o.dest, t, "lowpass", lava ? 500 : 1800, 0.8, v * 0.9, 0.004, 0.35);
  burst(o.ctx, o.dest, t + 0.02, "bandpass", lava ? 300 : 900, 2, v * 0.5, 0.01, 0.4);
  for (let k = 0; k < 5; k++) tone(o.ctx, o.dest, t + 0.15 + k * 0.08, "sine", 500 + k * 120, 900 + k * 150, v * 0.12, 0.005, 0.05);
}

/** Hors du parcours : un petit bruit mou dans l'herbe */
export function outOfBounds(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.005;
  burst(o.ctx, o.dest, t, "lowpass", 500, 0.6, o.vol * vol * 0.6, 0.004, 0.18);
  tone(o.ctx, o.dest, t + 0.1, "sine", 420, 300, o.vol * vol * 0.2, 0.01, 0.25);
}

export function boing(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  tone(o.ctx, o.dest, t, "sine", 180, 620, o.vol * vol * 0.5, 0.005, 0.28);
}

export function warp(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  tone(o.ctx, o.dest, t, "sawtooth", 200, 1800, o.vol * vol * 0.12, 0.02, 0.3);
  tone(o.ctx, o.dest, t + 0.05, "sine", 1600, 400, o.vol * vol * 0.3, 0.01, 0.35);
}

export function tube(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  burst(o.ctx, o.dest, t, "bandpass", 500, 3, o.vol * vol * 0.4, 0.05, 0.5);
}

export function sparkle(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  for (let k = 0; k < 4; k++) tone(o.ctx, o.dest, t + k * 0.06, "sine", 1600 + k * 400, 1700 + k * 420, o.vol * vol * 0.2, 0.002, 0.15);
}

/** Des applaudissements (un trou en un) */
export function applause(vol = 1) {
  const o = out();
  if (!o) return;
  const t0 = o.ctx.currentTime + 0.05;
  for (let k = 0; k < 90; k++) {
    const t = t0 + Math.random() * 2.2 * (k / 90 + 0.3);
    burst(o.ctx, o.dest, t, "bandpass", 1200 + Math.random() * 1600, 1.5, o.vol * vol * (0.1 + Math.random() * 0.12), 0.002, 0.03);
  }
}

// ---------------------------------------------------------------------------
// L'ambiance : un souffle de vent doux, et des oiseaux de temps en temps
// ---------------------------------------------------------------------------

export class Ambience {
  private wind: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private lfo: OscillatorNode | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;

  constructor(private kind: string) {}

  start() {
    const o = out(musicLevel());
    if (!o) {
      // Le son coupé : on réessaie un peu plus tard (on ne sait pas quand il sera remis)
      this.timer = setTimeout(() => !this.stopped && this.start(), 3000);
      return;
    }
    const src = o.ctx.createBufferSource();
    src.buffer = noise(o.ctx);
    src.loop = true;
    const f = o.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value =
      this.kind === "jardin" ? 420 : this.kind === "mer" ? 650 : this.kind === "montagne" ? 520 : this.kind === "cuisine" ? 240 : 300;
    const gain = o.ctx.createGain();
    gain.gain.value = 0.035 * o.vol;
    src.connect(f).connect(gain).connect(o.dest);
    // Au bord de la mer : le ressac, une vague toutes les sept secondes environ
    if (this.kind === "mer" || this.kind === "montagne") {
      // En montagne : des rafales, plus lentes et plus fortes
      const lfo = o.ctx.createOscillator();
      lfo.frequency.value = this.kind === "mer" ? 0.14 : 0.07;
      const depth = o.ctx.createGain();
      depth.gain.value = (this.kind === "mer" ? 0.03 : 0.035) * o.vol;
      lfo.connect(depth).connect(gain.gain);
      lfo.start();
      this.lfo = lfo;
    }
    // Dans la cuisine : le ronron du réfrigérateur, tout bas
    if (this.kind === "cuisine") {
      const osc = o.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 98;
      const hg = o.ctx.createGain();
      hg.gain.value = 0.006 * o.vol;
      osc.connect(hg).connect(o.dest);
      osc.start();
      this.hum = { osc, gain: hg };
    }
    src.start();
    this.wind = { src, gain };
    this.birds();
  }

  /** Le réglage du son a changé */
  update() {
    if (this.wind) this.wind.gain.gain.value = 0.035 * musicLevel();
    if (this.hum) this.hum.gain.gain.value = 0.006 * musicLevel();
  }

  private birds() {
    if (this.stopped) return;
    const o = out(musicLevel());
    if (o && this.kind === "mer") {
      // Une mouette : deux ou trois cris qui descendent
      const t = o.ctx.currentTime + 0.02;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const tk = t + k * 0.32;
        tone(o.ctx, o.dest, tk, "sawtooth", 1500 + Math.random() * 200, 900, o.vol * 0.025, 0.02, 0.22);
        tone(o.ctx, o.dest, tk, "sine", 1700, 1100, o.vol * 0.04, 0.02, 0.2);
      }
    }
    if (o && this.kind === "jardin") {
      const t = o.ctx.currentTime + 0.02;
      const base = 2400 + Math.random() * 1800;
      const n = 2 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n; k++) {
        const tk = t + k * (0.09 + Math.random() * 0.06);
        tone(o.ctx, o.dest, tk, "sine", base * (0.9 + Math.random() * 0.3), base * (1.15 + Math.random() * 0.3), o.vol * 0.07, 0.01, 0.06);
      }
    }
    if (o && this.kind === "cuisine") {
      const t = o.ctx.currentTime + 0.02;
      const r = Math.random();
      if (r < 0.4) {
        // Un oiseau dehors, derrière la fenêtre
        const base = 2600 + Math.random() * 1400;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++)
          tone(o.ctx, o.dest, t + k * (0.1 + Math.random() * 0.05), "sine", base, base * 1.25, o.vol * 0.03, 0.01, 0.06);
      } else if (r < 0.75) {
        // La casserole qui frémit : quelques bulles
        const n = 3 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++)
          tone(
            o.ctx,
            o.dest,
            t + k * (0.07 + Math.random() * 0.12),
            "sine",
            260 + Math.random() * 120,
            520 + Math.random() * 200,
            o.vol * 0.035,
            0.005,
            0.05,
          );
      } else {
        // Une cuillère contre une tasse
        tone(o.ctx, o.dest, t, "triangle", 2900, 2880, o.vol * 0.03, 0.003, 0.3);
        tone(o.ctx, o.dest, t, "sine", 4150, 4120, o.vol * 0.015, 0.003, 0.22);
      }
    }
    this.timer = setTimeout(() => this.birds(), 1800 + Math.random() * 4200);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    try {
      this.wind?.src.stop();
      this.lfo?.stop();
      this.hum?.osc.stop();
    } catch {
      // déjà arrêté
    }
    this.wind = null;
  }
}
