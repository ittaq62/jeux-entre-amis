// Le bruit de fond d'un circuit, fabriqué à la volée (aucun fichier à charger) : la pluie qui tombe sur la ville,
// plus sourde sous la halle. Il démarre avec le moteur, et se tait avec le son.

import type { Theme } from "../../shared/games/bolides/track.ts";
import { audioOut } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

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

export class Ambience {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private level = 0;

  constructor(private theme: Theme) {}

  start() {
    if (this.source || this.theme !== "ville" || !usePrefs.getState().sound) return;
    const audio = audioOut();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = rainBuffer(ctx);
    source.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 400;
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

  /** `sheltered` : de 0 (dehors) à 1 (sous un toit) ; la pluie s'assourdit et baisse sous la halle */
  update(sheltered: number) {
    // Le son remis en route en pleine course : la pluie reprend aussi
    if (!this.source) this.start();
    if (!this.gain || !this.filter) return;
    const target = usePrefs.getState().sound ? 0.16 * (1 - sheltered * 0.6) : 0;
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
