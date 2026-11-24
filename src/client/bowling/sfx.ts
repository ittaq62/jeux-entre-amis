// Les bruits du bowling, fabriqués à la volée et menés par la physique : chaque choc de la boule contre une quille, des
// quilles entre elles, contre le plateau ou les murs fait son propre « toc » (un strike, c'est des dizaines de chocs à la
// suite : le fracas vient tout seul) ; la boule qui tombe sur le bois puis qui gronde en roulant, de plus en plus fort en
// approchant ; la rigole ; la machine qui balaie ; la foule qui applaudit un strike, la petite fanfare, le « wouah-wouah »
// d'une boule dans la rigole ; et l'ambiance de la salle (le brouhaha, les quilles des pistes voisines). Tout passe par
// le réglage du son du site.

import type { PhysEvent } from "../../shared/games/bowling/physics.ts";
import type { ThrowRecord } from "../../shared/games/bowling/match.ts";
import { audioOut, effectsLevel, musicLevel } from "../lib/sound.ts";
import type { Moment } from "./runtime.ts";

let noiseBuffer: AudioBuffer | null = null;

/**
 * Les sons du bowling passent par un limiteur : quand la boule entre dans les quilles, des dizaines de chocs tombent
 * en même temps, et leur somme dépassait le plafond de la sortie (des crêtes jusqu'à 2,2 : le son grésillait).
 */
let bus: { ctx: AudioContext; node: GainNode } | null = null;

function busOf(ctx: AudioContext, master: GainNode): GainNode {
  if (bus?.ctx === ctx) return bus.node;
  const g = ctx.createGain();
  g.gain.value = 0.8;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -10;
  lim.knee.value = 6;
  lim.ratio.value = 16;
  lim.attack.value = 0.002;
  lim.release.value = 0.12;
  g.connect(lim);
  lim.connect(master);
  bus = { ctx, node: g };
  return g;
}

function out(level = effectsLevel()): { ctx: AudioContext; dest: GainNode; vol: number } | null {
  if (level <= 0) return null;
  const o = audioOut();
  if (!o) return null;
  if (o.ctx.state === "suspended") void o.ctx.resume();
  return { ctx: o.ctx, dest: busOf(o.ctx, o.out), vol: level };
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

/** Pas plus de tant de chocs par dixième de seconde (un strike en fait beaucoup) */
let windowAt = 0;
let windowCount = 0;

/** Le « toc » d'une quille : du bois laqué, creux, qui sonne un peu */
function pinTock(ctx: AudioContext, dest: AudioNode, t: number, v: number, pitch: number) {
  const k = Math.min(1, v / 5);
  burst(ctx, dest, t, "bandpass", 2400 * pitch, 2.2, 0.5 * k, 0.001, 0.035);
  tone(ctx, dest, t, "sine", 1180 * pitch, 980 * pitch, 0.22 * k, 0.001, 0.09);
  tone(ctx, dest, t, "triangle", 620 * pitch, 520 * pitch, 0.18 * k, 0.001, 0.12);
  burst(ctx, dest, t, "lowpass", 900, 0.7, 0.25 * k, 0.001, 0.06);
}

/** Un choc de la physique */
export function phys(e: PhysEvent, volume: number) {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const now = ctx.currentTime;
  if (now - windowAt > 0.1) {
    windowAt = now;
    windowCount = 0;
  }
  if (++windowCount > 14 && e.k !== "drop" && e.k !== "hit") return;
  const vol = volume;
  const t = now + 0.005;
  switch (e.k) {
    case "drop": {
      // La boule qui tombe sur le bois
      const k = Math.min(1, 0.4 + e.v * 0.5) * vol;
      tone(ctx, dest, t, "sine", 95, 48, 0.75 * k, 0.003, 0.28);
      burst(ctx, dest, t, "lowpass", 420, 0.8, 0.5 * k, 0.002, 0.12);
      break;
    }
    case "hit": {
      // La boule entre dans les quilles : un claquement sec et plein
      const k = Math.min(1, e.v / 6) * vol;
      burst(ctx, dest, t, "highpass", 1800, 0.6, 0.6 * k, 0.001, 0.07);
      burst(ctx, dest, t, "lowpass", 700, 0.7, 0.8 * k, 0.001, 0.16);
      tone(ctx, dest, t, "sine", 160, 70, 0.6 * k, 0.002, 0.2);
      pinTock(ctx, dest, t, e.v, 0.95 + Math.random() * 0.1);
      break;
    }
    case "clack":
      pinTock(ctx, dest, t, e.v * vol, 0.85 + Math.random() * 0.35);
      break;
    case "deck": {
      // Une quille qui tombe sur le plateau
      const k = Math.min(1, e.v / 4) * vol;
      burst(ctx, dest, t, "bandpass", 520 + Math.random() * 200, 1.4, 0.45 * k, 0.001, 0.09);
      tone(ctx, dest, t, "sine", 240 + Math.random() * 60, 150, 0.3 * k, 0.002, 0.1);
      break;
    }
    case "wall": {
      const k = Math.min(1, e.v / 4) * vol;
      burst(ctx, dest, t, "bandpass", 300, 1, 0.5 * k, 0.001, 0.12);
      tone(ctx, dest, t, "sine", 130, 90, 0.35 * k, 0.002, 0.18);
      break;
    }
    case "gutter": {
      // La boule tombe dans la rigole : un choc creux, métallique
      const k = Math.min(1, 0.5 + e.v * 0.4) * vol;
      tone(ctx, dest, t, "triangle", 210, 160, 0.4 * k, 0.002, 0.35);
      burst(ctx, dest, t, "bandpass", 1300, 3, 0.25 * k, 0.001, 0.2);
      break;
    }
    case "pit":
    case "cushion": {
      const k = Math.min(1, e.v / 5) * vol * 0.6;
      burst(ctx, dest, t, "lowpass", 260, 0.7, 0.5 * k, 0.003, 0.2);
      break;
    }
  }
}

/** Le grondement de la boule qui roule (une seule à la fois) */
let roller: { src: AudioBufferSourceNode; f: BiquadFilterNode; g: GainNode; hiss: GainNode } | null = null;

export function roll(speed: number, volume: number, gutter: boolean) {
  const o = out();
  if (!o || speed < 0.2) {
    stopRoll();
    return;
  }
  const { ctx, dest } = o;
  if (!roller) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    // Le sifflement du vernis, très léger, au-dessus du grondement
    const hiF = ctx.createBiquadFilter();
    hiF.type = "bandpass";
    hiF.frequency.value = 3200;
    hiF.Q.value = 0.8;
    const hiss = ctx.createGain();
    hiss.gain.value = 0;
    src.connect(f).connect(g).connect(dest);
    src.connect(hiF).connect(hiss).connect(dest);
    src.start();
    roller = { src, f, g, hiss };
  }
  const t = ctx.currentTime;
  const k = Math.min(1, speed / 9);
  roller.f.frequency.setTargetAtTime(gutter ? 420 + k * 300 : 90 + k * 150, t, 0.05);
  roller.g.gain.setTargetAtTime((gutter ? 0.5 : 0.85) * k * volume, t, 0.06);
  roller.hiss.gain.setTargetAtTime(gutter ? 0.05 * k * volume : 0.025 * k * volume, t, 0.06);
}

export function stopRoll() {
  if (!roller) return;
  const r = roller;
  roller = null;
  try {
    const t = r.src.context.currentTime;
    r.g.gain.setTargetAtTime(0, t, 0.05);
    r.hiss.gain.setTargetAtTime(0, t, 0.05);
    r.src.stop(t + 0.3);
  } catch {
    // déjà arrêté
  }
}

/** Des applaudissements : une foule de petits claquements */
export function applause(strength: number, seconds = 2) {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const n = Math.round(40 * seconds * strength);
  for (let i = 0; i < n; i++) {
    const t = ctx.currentTime + Math.random() * seconds * (0.6 + Math.random() * 0.4);
    burst(ctx, dest, t, "bandpass", 1500 + Math.random() * 1800, 1.2, 0.08 + Math.random() * 0.08, 0.001, 0.03);
  }
  // Un « ouais ! » de la foule, au début
  burst(ctx, dest, ctx.currentTime + 0.05, "bandpass", 700, 0.9, 0.25 * strength, 0.15, 0.7);
}

/** La petite fanfare du strike (ou un carillon plus court pour un spare) */
function fanfare(big: boolean) {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const notes = big ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
  notes.forEach((f, i) => {
    const t = ctx.currentTime + 0.05 + i * (big ? 0.09 : 0.11);
    tone(ctx, dest, t, "triangle", f, f, 0.22, 0.01, big && i === notes.length - 1 ? 0.6 : 0.22);
    tone(ctx, dest, t, "sine", f * 2, f * 2, 0.06, 0.01, 0.25);
  });
}

/** Le « wouah-wouah » d'une boule dans la rigole */
function wahwah() {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900;
  f.connect(dest);
  [0, 0.32, 0.64].forEach((d, i) => {
    const t = ctx.currentTime + 0.1 + d;
    const base = 330 - i * 30;
    tone(ctx, f, t, "sawtooth", base, base * (i === 2 ? 0.75 : 0.94), 0.12, 0.03, i === 2 ? 0.7 : 0.26);
  });
}

/** La machine qui balaie et repose les quilles */
function machine() {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const t = ctx.currentTime;
  burst(ctx, dest, t, "bandpass", 180, 2, 0.12, 0.2, 1.4);
  tone(ctx, dest, t, "sawtooth", 55, 62, 0.04, 0.3, 1.3);
  // Les quilles reposées : de petits chocs sourds
  for (let i = 0; i < 4; i++) burst(ctx, dest, t + 1.05 + i * 0.06, "bandpass", 700, 2, 0.05, 0.002, 0.05);
}

/** Un moment du lancer */
export function moment(m: Moment) {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  switch (m.k) {
    case "release": {
      // Le souffle du bras, et le pas qui glisse
      burst(ctx, dest, ctx.currentTime, "bandpass", 900, 0.7, m.mine ? 0.18 : 0.1, 0.05, 0.2);
      break;
    }
    case "result":
      verdict(m.rec);
      break;
    case "sweep":
      machine();
      break;
  }
}

function verdict(rec: ThrowRecord) {
  const cleared = rec.down.length === rec.rack.length;
  if (cleared && rec.rack.length === 10) {
    fanfare(true);
    applause(1, 2.4);
  } else if (cleared) {
    fanfare(false);
    applause(0.6, 1.6);
  } else if (rec.gutter || rec.down.length === 0) wahwah();
}

/** L'ambiance de la salle : le brouhaha, et de temps en temps les quilles d'une piste voisine */
export class Ambience {
  private nodes: AudioNode[] = [];
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  start() {
    const o = out(musicLevel());
    if (!o) return;
    const { ctx, dest } = o;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.5 * o.vol, ctx.currentTime + 1.5);
    g.connect(dest);
    this.gain = g;
    // Le brouhaha : du bruit filtré comme des voix lointaines, qui ondule lentement
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 520;
    f.Q.value = 0.8;
    const amp = ctx.createGain();
    amp.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.02;
    lfo.connect(lfoAmt).connect(amp.gain);
    src.connect(f).connect(amp).connect(g);
    src.start();
    lfo.start();
    this.nodes.push(src, lfo);
    this.schedule();
  }

  /** Les quilles d'une piste voisine, de loin */
  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(
      () => {
        const o = out(musicLevel());
        if (o && this.gain) {
          const { ctx } = o;
          const t = ctx.currentTime;
          tone(ctx, this.gain, t, "sine", 70, 45, 0.08, 0.01, 0.3);
          const n = 6 + Math.floor(Math.random() * 10);
          for (let i = 0; i < n; i++) {
            const tt = t + 0.02 + Math.random() * 0.5;
            burst(ctx, this.gain, tt, "bandpass", 1400 + Math.random() * 1400, 2, 0.04 + Math.random() * 0.04, 0.001, 0.05);
          }
        }
        this.schedule();
      },
      3500 + Math.random() * 7000,
    );
  }

  update() {
    const o = out(musicLevel());
    if (this.gain && o) this.gain.gain.setTargetAtTime(0.5 * o.vol, o.ctx.currentTime, 0.2);
    else if (this.gain) this.gain.gain.setTargetAtTime(0.0001, this.gain.context.currentTime, 0.2);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    const g = this.gain;
    if (g) {
      g.gain.setTargetAtTime(0.0001, g.context.currentTime, 0.3);
      setTimeout(() => {
        for (const n of this.nodes) {
          try {
            (n as AudioScheduledSourceNode).stop();
          } catch {
            // déjà arrêté
          }
        }
        g.disconnect();
      }, 1200);
    }
  }
}
