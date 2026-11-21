// Le bruit de fond d'un circuit, fabriqué à la volée (aucun fichier à charger) : la pluie qui tombe sur la ville, plus
// sourde sous la halle ; à la fête foraine, la rumeur de la foule et un orgue de manège au loin, étouffés sous le
// chapiteau ; au potager, le vent dans les feuilles, les oiseaux et une abeille ; en forêt, les grillons et la
// chouette, plus sourds dans le tronc creux. Il démarre avec le moteur, suit le réglage « Musique et ambiance », et se
// tait avec le son.

import type { Theme } from "../../shared/games/bolides/track.ts";
import { audioOut, musicLevel } from "../lib/sound.ts";

/** Quatre secondes de pluie : un souffle doux, et des gouttes qui claquent çà et là (la boucle ne se remarque pas) */
function rainBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 4;
  const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      // Un bruit adouci : plus de grave que le bruit blanc, comme une averse au loin
      low += (Math.random() * 2 - 1 - low) * 0.18;
      data[i] = low * 0.9;
    }
    // Les gouttes : de petits claquements qui s'éteignent vite, plus ou moins forts
    const drops = 900;
    for (let k = 0; k < drops; k++) {
      const at = Math.floor(Math.random() * data.length);
      const len = Math.floor(ctx.sampleRate * (0.004 + Math.random() * 0.01));
      const amp = 0.15 + Math.random() * 0.5;
      for (let i = 0; i < len && at + i < data.length; i++) data[at + i] += (Math.random() * 2 - 1) * amp * Math.exp((-6 * i) / len);
    }
  }
  return buf;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * La fête : une valse d'orgue de manège (huit mesures à trois temps, un air à nous : la basse sur le premier temps, les
 * accords sur les deux autres, la mélodie au-dessus), et la rumeur de la foule par-dessus, qui monte et descend
 */
function fairBuffer(ctx: AudioContext): AudioBuffer {
  const beat = 0.4;
  const seconds = beat * 24;
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(2, Math.round(rate * seconds), rate);
  const left = buf.getChannelData(0);
  const right = buf.getChannelData(1);
  // Les accords (fondamentale de la basse, puis les trois notes), une mesure chacun
  const bars: [number, number[]][] = [
    [48, [60, 64, 67]],
    [43, [59, 62, 67]],
    [43, [59, 62, 65]],
    [48, [60, 64, 67]],
    [41, [60, 65, 69]],
    [48, [60, 64, 67]],
    [43, [59, 62, 65]],
    [48, [60, 64, 67]],
  ];
  const tune = [76, 79, 76, 74, 71, 74, 77, 74, 71, 72, 76, 79, 81, 77, 81, 79, 76, 72, 74, 77, 71, 72, 0, 0];
  /** Une note d'orgue : un son flûté (le fondamental, un peu d'octave et de quinte), un léger vibrato */
  const note = (freq: number, start: number, len: number, amp: number, pan: number) => {
    const s0 = Math.floor(start * rate);
    const n = Math.floor(len * rate);
    for (let i = 0; i < n && s0 + i < left.length; i++) {
      const tt = i / rate;
      const env = Math.min(1, tt / 0.012) * Math.exp(-tt * 2.2) * Math.min(1, (len - tt) / 0.03);
      const vib = 1 + 0.004 * Math.sin(tt * 2 * Math.PI * 5.5);
      const ph = 2 * Math.PI * freq * vib * tt;
      const v = (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.18 * Math.sin(3 * ph)) * env * amp;
      left[s0 + i]! += v * (1 - pan * 0.5);
      right[s0 + i]! += v * (1 + pan * 0.5);
    }
  };
  bars.forEach(([bass, chord], b) => {
    const t0 = b * 3 * beat;
    note(midi(bass), t0, beat * 0.9, 0.22, -0.3);
    for (const k of [1, 2]) for (const c of chord) note(midi(c), t0 + k * beat, beat * 0.55, 0.06, 0.2);
  });
  tune.forEach((m, k) => {
    if (m > 0) note(midi(m), k * beat, beat * (tune[k + 1] === 0 ? 2.6 : 0.95), 0.12, 0);
  });
  // La foule : un brouhaha (un bruit adouci qui enfle et retombe), des rires et des cris de joie çà et là
  for (const [data, seed] of [
    [left, 0.3],
    [right, 1.7],
  ] as const) {
    let low = 0;
    let band = 0;
    for (let i = 0; i < data.length; i++) {
      const tt = i / rate;
      low += (Math.random() * 2 - 1 - low) * 0.12;
      band += (low - band) * 0.35;
      const swell = 0.55 + 0.25 * Math.sin(tt * 0.9 + seed) + 0.2 * Math.sin(tt * 2.3 + seed * 2);
      // Les deux bouts de la boucle se rejoignent sans à-coup
      const edge = Math.min(1, tt / 0.3, (seconds - tt) / 0.3);
      data[i]! += (low - band) * 1.6 * swell * (0.6 + 0.4 * edge);
    }
    for (let k = 0; k < 14; k++) {
      const at = Math.floor(Math.random() * (data.length - rate));
      const len = Math.floor(rate * (0.15 + Math.random() * 0.3));
      const f0 = 500 + Math.random() * 500;
      for (let i = 0; i < len; i++) {
        const tt = i / rate;
        const env = Math.sin((Math.PI * i) / len) * 0.05;
        data[at + i]! += Math.sin(2 * Math.PI * f0 * (1 + 0.3 * Math.sin(tt * 30)) * tt) * env * (0.5 + Math.random());
      }
    }
  }
  return buf;
}

/** Le potager au matin : un souffle de vent dans les feuilles, des oiseaux qui chantent çà et là, une abeille qui passe */
function gardenBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 8;
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(2, Math.round(rate * seconds), rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const tt = i / rate;
      low += (Math.random() * 2 - 1 - low) * 0.02;
      const edge = Math.min(1, tt / 0.3, (seconds - tt) / 0.3);
      data[i] = low * 0.9 * (0.6 + 0.4 * Math.sin(tt * 0.8 + ch)) * (0.7 + 0.3 * edge);
    }
    // Les oiseaux : de courtes phrases de petits cris qui montent et descendent
    for (let k = 0; k < 9; k++) {
      let at = Math.random() * (seconds - 1.5);
      const base = 2200 + Math.random() * 2200;
      const notes = 2 + Math.floor(Math.random() * 5);
      for (let n = 0; n < notes; n++) {
        const len = 0.05 + Math.random() * 0.1;
        const s0 = Math.floor(at * rate);
        const f0 = base * (0.85 + Math.random() * 0.3);
        const sweep = (Math.random() - 0.4) * 1800;
        let ph = 0;
        for (let i = 0; i < len * rate && s0 + i < data.length; i++) {
          const u = i / (len * rate);
          ph += (2 * Math.PI * (f0 + sweep * u)) / rate;
          data[s0 + i]! += Math.sin(ph) * Math.sin(Math.PI * u) * 0.12 * (ch === k % 2 ? 1 : 0.55);
        }
        at += len + 0.03 + Math.random() * 0.08;
      }
    }
    // Une abeille qui passe : un bourdonnement qui enfle puis s'éloigne
    const b0 = Math.floor((2 + ch * 2.5) * rate);
    const blen = Math.floor(2.4 * rate);
    let ph = 0;
    for (let i = 0; i < blen && b0 + i < data.length; i++) {
      const u = i / blen;
      ph += (2 * Math.PI * (210 + 18 * Math.sin(u * 30))) / rate;
      const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1;
      data[b0 + i]! += saw * Math.sin(Math.PI * u) ** 2 * 0.05;
    }
  }
  return buf;
}

/** La forêt au crépuscule : un souffle de vent dans les cimes, les grillons, une chouette qui hulule au loin */
function forestBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 9;
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(2, Math.round(rate * seconds), rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const tt = i / rate;
      low += (Math.random() * 2 - 1 - low) * 0.015;
      const edge = Math.min(1, tt / 0.3, (seconds - tt) / 0.3);
      data[i] = low * 1.1 * (0.55 + 0.45 * Math.sin(tt * 0.5 + ch * 2)) * (0.7 + 0.3 * edge);
    }
    // Les grillons : des trains de petits cris aigus, réguliers, chacun sa note
    for (let k = 0; k < 3; k++) {
      const f = 4200 + k * 650 + ch * 120;
      const period = 0.42 + k * 0.11;
      for (let at = (k * 0.13 + ch * 0.07) % period; at < seconds - 0.1; at += period) {
        const s0 = Math.floor(at * rate);
        for (let pulse = 0; pulse < 3; pulse++) {
          const p0 = s0 + Math.floor(pulse * 0.025 * rate);
          const len = Math.floor(0.016 * rate);
          for (let i = 0; i < len && p0 + i < data.length; i++)
            data[p0 + i]! += Math.sin((2 * Math.PI * f * i) / rate) * Math.sin((Math.PI * i) / len) * 0.035;
        }
      }
    }
    // La chouette : deux « hou » graves, le second plus long
    const owl = Math.floor((3.2 + ch * 0.05) * rate);
    for (const [start, len] of [
      [0, 0.32],
      [0.55, 0.7],
    ] as const) {
      const s0 = owl + Math.floor(start * rate);
      const n = Math.floor(len * rate);
      for (let i = 0; i < n && s0 + i < data.length; i++) {
        const u = i / n;
        const f = 420 - u * 40;
        data[s0 + i]! += Math.sin((2 * Math.PI * f * i) / rate) * Math.sin(Math.PI * u) * 0.09;
      }
    }
  }
  return buf;
}

export class Ambience {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private level = 0;

  constructor(private theme: Theme) {}

  /** Seuls la ville, la fête, le potager et la forêt ont un bruit de fond */
  private get loud(): number {
    return this.theme === "ville"
      ? 0.16
      : this.theme === "foire"
        ? 0.2
        : this.theme === "potager"
          ? 0.2
          : this.theme === "foret"
            ? 0.22
            : 0;
  }

  start() {
    if (this.source || this.loud === 0 || musicLevel() <= 0) return;
    const audio = audioOut();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer =
      this.theme === "foire"
        ? fairBuffer(ctx)
        : this.theme === "potager"
          ? gardenBuffer(ctx)
          : this.theme === "foret"
            ? forestBuffer(ctx)
            : rainBuffer(ctx);
    source.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = this.theme === "ville" ? 400 : 90;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    source.connect(high).connect(filter).connect(gain).connect(out);
    source.start(t, Math.random() * 3);
    this.source = source;
    this.gain = gain;
    this.filter = filter;
  }

  /** `sheltered` : de 0 (dehors) à 1 (sous un toit) ; le bruit s'assourdit et baisse sous la halle ou le chapiteau */
  update(sheltered: number) {
    // Le son remis en route en pleine course : le bruit de fond reprend aussi
    if (!this.source) this.start();
    if (!this.gain || !this.filter) return;
    const target = this.loud * musicLevel() * (1 - sheltered * 0.6);
    this.level += (target - this.level) * 0.05;
    const t = this.gain.context.currentTime;
    this.gain.gain.setTargetAtTime(this.level, t, 0.1);
    this.filter.frequency.setTargetAtTime(7000 - sheltered * 5600, t, 0.2);
  }

  stop() {
    if (!this.source || !this.gain) return;
    const t = this.gain.context.currentTime;
    this.gain.gain.setTargetAtTime(0, t, 0.15);
    this.source.stop(t + 0.6);
    this.source = null;
    this.gain = null;
    this.filter = null;
  }
}
