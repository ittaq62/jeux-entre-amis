// Les bruits du billard, fabriqués à la volée et menés par la physique : chaque choc entre deux billes fait son « clac »
// sec (plus fort et plus aigu quand il est vif ; une casse, c'est des dizaines de chocs d'un coup), chaque bande son
// « toc » sourd de caoutchouc, chaque bille qui tombe son « tchonk » dans le cuir puis roule et cogne les autres au fond
// du filet ; la queue qui frappe, le grondement léger des billes qui roulent ; les applaudissements d'un beau coup ; et
// l'ambiance de la salle (le feu qui crépite, la pluie, le train, la mer…). Tout passe par le réglage du son du site.

import type { PhysEvent } from "../../shared/games/billard/physics.ts";
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

/** Pas plus de tant de chocs par vingtième de seconde (une casse en fait beaucoup) */
let windowAt = 0;
let windowCount = 0;

/** Le « clac » de deux billes : de la résine dure, un son bref, presque métallique, avec un peu de corps */
function clack(ctx: AudioContext, dest: AudioNode, t: number, v: number, vol: number) {
  const k = Math.min(1, Math.pow(v / 3.5, 0.7)) * vol;
  const pitch = 0.94 + Math.random() * 0.12 + Math.min(0.15, v * 0.02);
  burst(ctx, dest, t, "bandpass", 3600 * pitch, 3.5, 0.55 * k, 0.0008, 0.018);
  tone(ctx, dest, t, "sine", 2650 * pitch, 2500 * pitch, 0.32 * k, 0.0006, 0.045);
  tone(ctx, dest, t, "triangle", 1320 * pitch, 1240 * pitch, 0.16 * k, 0.0006, 0.03);
  burst(ctx, dest, t, "highpass", 6000, 0.7, 0.12 * k, 0.0005, 0.008);
}

/** Le « toc » d'une bande : du caoutchouc sous le feutre, et le bois du cadre qui résonne à peine */
function thud(ctx: AudioContext, dest: AudioNode, t: number, v: number, vol: number) {
  const k = Math.min(1, Math.pow(v / 3, 0.8)) * vol;
  tone(ctx, dest, t, "sine", 190, 120, 0.5 * k, 0.002, 0.09);
  burst(ctx, dest, t, "lowpass", 700, 0.8, 0.28 * k, 0.001, 0.05);
  tone(ctx, dest, t, "triangle", 420, 380, 0.06 * k, 0.001, 0.06);
}

/** Une bille qui tombe : le cuir de la poche, puis elle roule et cogne les autres au fond du filet */
function pocketDrop(ctx: AudioContext, dest: AudioNode, t: number, v: number, vol: number) {
  const k = Math.min(1, 0.45 + v / 4) * vol;
  tone(ctx, dest, t, "sine", 260, 150, 0.5 * k, 0.002, 0.12);
  burst(ctx, dest, t, "lowpass", 900, 0.9, 0.3 * k, 0.001, 0.08);
  // Elle roule dans le filet, et touche celles qui y sont déjà
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const tt = t + 0.18 + i * (0.07 + Math.random() * 0.05);
    const kk = k * (0.5 - i * 0.1);
    tone(ctx, dest, tt, "sine", 2200 + Math.random() * 500, 2100, 0.12 * kk, 0.0006, 0.03);
    burst(ctx, dest, tt, "bandpass", 3000, 3, 0.12 * kk, 0.0008, 0.015);
  }
  burst(ctx, dest, t + 0.12, "lowpass", 300, 1, 0.12 * k, 0.05, 0.35);
}

/** Un choc de la physique */
export function phys(e: PhysEvent, volume: number) {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const now = ctx.currentTime;
  if (now - windowAt > 0.05) {
    windowAt = now;
    windowCount = 0;
  }
  if (++windowCount > 10) return;
  const t = now + Math.random() * 0.004;
  if (e.k === "bille") {
    if (e.v < 0.03) return;
    clack(ctx, dest, t, e.v, volume);
  } else if (e.k === "bande") {
    if (e.v < 0.04) return;
    thud(ctx, dest, t, e.v, volume);
  } else if (e.k === "poche") pocketDrop(ctx, dest, t, e.v, volume);
  else tone(ctx, dest, t, "sine", 120, 60, 0.4 * volume, 0.002, 0.2);
}

/** La queue frappe la blanche : le procédé de cuir sur la résine, sec, plus fort quand on tape fort */
export function strike(power: number, mine: boolean) {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const t = ctx.currentTime;
  const k = (0.35 + power * 0.65) * (mine ? 1 : 0.7);
  tone(ctx, dest, t, "triangle", 980, 820, 0.35 * k, 0.0008, 0.04);
  burst(ctx, dest, t, "bandpass", 2200, 1.8, 0.4 * k, 0.0008, 0.02);
  if (power > 0.6) tone(ctx, dest, t, "sine", 320, 220, 0.25 * k, 0.001, 0.06);
}

/** Le grondement léger des billes qui roulent sur le feutre */
let roller: { src: AudioBufferSourceNode; f: BiquadFilterNode; g: GainNode } | null = null;

export function roll(speed: number) {
  const o = out();
  if (!o || speed < 0.05) {
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
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(dest);
    src.start();
    roller = { src, f, g };
  }
  const t = ctx.currentTime;
  const k = Math.min(1, speed / 4);
  roller.f.frequency.setTargetAtTime(140 + k * 260, t, 0.05);
  roller.g.gain.setTargetAtTime(0.14 * k, t, 0.08);
}

export function stopRoll() {
  if (!roller) return;
  const r = roller;
  roller = null;
  try {
    const t = r.src.context.currentTime;
    r.g.gain.setTargetAtTime(0, t, 0.08);
    r.src.stop(t + 0.5);
  } catch {
    // déjà arrêté
  }
}

/** Des applaudissements (un beau coup, la manche gagnée) */
export function applause(strength: number, seconds = 2) {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const n = Math.round(36 * seconds * strength);
  for (let i = 0; i < n; i++) {
    const t = ctx.currentTime + Math.random() * seconds * (0.6 + Math.random() * 0.4);
    burst(ctx, dest, t, "bandpass", 1500 + Math.random() * 1800, 1.2, 0.07 + Math.random() * 0.07, 0.001, 0.03);
  }
  burst(ctx, dest, ctx.currentTime + 0.05, "bandpass", 650, 0.9, 0.18 * strength, 0.15, 0.7);
}

/** Un « oh ! » de déception (une faute, la noire trop tôt) */
export function groan() {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 800;
  f.connect(dest);
  tone(ctx, f, ctx.currentTime + 0.05, "sawtooth", 260, 170, 0.08, 0.06, 0.6);
  burst(ctx, f, ctx.currentTime + 0.05, "bandpass", 500, 1, 0.1, 0.1, 0.5);
}

/** La petite sonnerie du tour qui arrive, et le tic des dernières secondes */
export function yourTurn() {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const t = ctx.currentTime;
  tone(ctx, dest, t, "sine", 880, 880, 0.12, 0.005, 0.18);
  tone(ctx, dest, t + 0.12, "sine", 1318.5, 1318.5, 0.12, 0.005, 0.3);
}

export function tick() {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  tone(ctx, dest, ctx.currentTime, "square", 1800, 1800, 0.03, 0.001, 0.03);
}

// ---------------------------------------------------------------------------
// L'ambiance des salles
// ---------------------------------------------------------------------------

/** L'ambiance d'une salle : un fond continu et, de temps en temps, un petit bruit qui la fait vivre */
export class Ambience {
  private nodes: AudioScheduledSourceNode[] = [];
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private kind: string) {}

  start() {
    const o = out(musicLevel());
    if (!o) return;
    const { ctx, dest } = o;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.55 * o.vol, ctx.currentTime + 2);
    g.connect(dest);
    this.gain = g;
    const bed = (type: BiquadFilterType, freq: number, q: number, level: number, lfoHz = 0, lfoAmt = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const amp = ctx.createGain();
      amp.gain.value = level;
      src.connect(f).connect(amp).connect(g);
      src.start();
      this.nodes.push(src);
      if (lfoHz > 0) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = lfoHz;
        const la = ctx.createGain();
        la.gain.value = lfoAmt;
        lfo.connect(la).connect(amp.gain);
        lfo.start();
        this.nodes.push(lfo);
      }
    };
    switch (this.kind) {
      case "feu":
        bed("lowpass", 320, 0.7, 0.05, 0.3, 0.02);
        break;
      case "pluie":
        bed("bandpass", 3800, 0.5, 0.05, 0.08, 0.015);
        bed("lowpass", 260, 0.7, 0.03);
        break;
      case "train":
        bed("lowpass", 140, 0.9, 0.12, 0.6, 0.03);
        break;
      case "mer":
        bed("lowpass", 520, 0.6, 0.06, 0.09, 0.05);
        break;
      case "ville":
        bed("lowpass", 380, 0.6, 0.05, 0.05, 0.02);
        break;
      case "bulles":
        bed("lowpass", 180, 1.2, 0.09, 0.12, 0.04);
        break;
      case "jardin":
        bed("bandpass", 2600, 0.4, 0.012, 0.2, 0.006);
        break;
      default:
        bed("bandpass", 480, 0.8, 0.03, 0.2, 0.012);
    }
    this.schedule();
  }

  /** Les petits bruits de la salle, de temps en temps */
  private schedule() {
    if (this.stopped) return;
    const gap: Record<string, [number, number]> = {
      feu: [400, 1600],
      pluie: [1200, 4000],
      train: [900, 900],
      mer: [4000, 7000],
      ville: [6000, 14000],
      bulles: [1500, 5000],
      jardin: [2000, 6000],
      horloge: [1000, 1000],
    };
    const [a, b] = gap[this.kind] ?? [6000, 12000];
    this.timer = setTimeout(
      () => {
        const o = out(musicLevel());
        if (o && this.gain) this.event(o.ctx, this.gain);
        this.schedule();
      },
      a + Math.random() * (b - a),
    );
  }

  private event(ctx: AudioContext, g: GainNode) {
    const t = ctx.currentTime;
    switch (this.kind) {
      case "feu": {
        // Une bûche qui craque
        const n = 1 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++)
          burst(ctx, g, t + i * 0.03 * Math.random(), "highpass", 1800 + Math.random() * 3000, 1, 0.08 + Math.random() * 0.1, 0.001, 0.015);
        break;
      }
      case "pluie":
        // Une goutte plus grosse sur la vitrine
        tone(ctx, g, t, "sine", 1700 + Math.random() * 900, 900, 0.04, 0.002, 0.05);
        break;
      case "train":
        // Le passage des roues sur un joint de rail : ta-dam, ta-dam
        for (const d of [0, 0.11, 0.42, 0.53]) {
          tone(ctx, g, t + d, "sine", 90, 60, 0.22, 0.002, 0.12);
          burst(ctx, g, t + d, "bandpass", 900, 2, 0.06, 0.001, 0.04);
        }
        break;
      case "mer":
        // Une vague qui roule et se retire
        burst(ctx, g, t, "lowpass", 900, 0.5, 0.12, 1.2, 2.2);
        break;
      case "ville":
        // Une voiture qui passe au loin
        burst(ctx, g, t, "bandpass", 300, 1, 0.08, 1.4, 1.8);
        break;
      case "bulles": {
        // Des bulles qui remontent
        const n = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < n; i++) {
          const f = 500 + Math.random() * 700;
          tone(ctx, g, t + i * 0.09, "sine", f, f * 1.8, 0.05, 0.005, 0.06);
        }
        break;
      }
      case "jardin": {
        // Un oiseau
        const n = 2 + Math.floor(Math.random() * 4);
        const f = 2600 + Math.random() * 1400;
        for (let i = 0; i < n; i++) tone(ctx, g, t + i * 0.12, "sine", f, f * (1.15 + Math.random() * 0.2), 0.05, 0.01, 0.07);
        break;
      }
      case "horloge":
        tone(ctx, g, t, "square", 2400, 2400, 0.02, 0.001, 0.02);
        break;
      default:
        burst(ctx, g, t, "bandpass", 600, 1, 0.05, 0.2, 0.6);
    }
  }

  update() {
    const o = out(musicLevel());
    if (this.gain && o) this.gain.gain.setTargetAtTime(0.55 * o.vol, o.ctx.currentTime, 0.2);
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
            n.stop();
          } catch {
            // déjà arrêté
          }
        }
        g.disconnect();
      }, 1200);
    }
  }
}
