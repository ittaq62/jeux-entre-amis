// Le bruit du moteur, fabriqué à la volée : deux ondes qui montent avec la vitesse, plus fortes quand on accélère,
// un sifflement de pneus pendant les dérapages, et un souffle pendant les turbos. Le klaxon aussi.

import { audioOut } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

export class EngineSound {
  private nodes: {
    low: OscillatorNode;
    high: OscillatorNode;
    filter: BiquadFilterNode;
    gain: GainNode;
    skid: AudioBufferSourceNode;
    skidGain: GainNode;
    skidFilter: BiquadFilterNode;
    rush: GainNode;
  } | null = null;

  start() {
    if (this.nodes || !usePrefs.getState().sound) return;
    const audio = audioOut();
    if (!audio) return;
    const { ctx, out } = audio;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 3;
    const low = ctx.createOscillator();
    low.type = "sawtooth";
    low.frequency.value = 50;
    const high = ctx.createOscillator();
    high.type = "square";
    high.frequency.value = 100;
    const highGain = ctx.createGain();
    highGain.gain.value = 0.25;
    low.connect(filter);
    high.connect(highGain).connect(filter);
    filter.connect(gain).connect(out);
    // Un bruit blanc filtré : les pneus qui crissent, et le souffle du turbo
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const skid = ctx.createBufferSource();
    skid.buffer = buffer;
    skid.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = "bandpass";
    skidFilter.frequency.value = 2400;
    skidFilter.Q.value = 6;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skid.connect(skidFilter).connect(skidGain).connect(out);
    const rushFilter = ctx.createBiquadFilter();
    rushFilter.type = "lowpass";
    rushFilter.frequency.value = 900;
    const rush = ctx.createGain();
    rush.gain.value = 0;
    skid.connect(rushFilter).connect(rush).connect(out);
    low.start();
    high.start();
    skid.start();
    this.nodes = { low, high, filter, gain, skid, skidGain, skidFilter, rush };
  }

  /** `speed` : la vitesse en part de la vitesse de pointe ; le reste dit ce que fait le kart */
  update(speed: number, gas: boolean, drifting: boolean, boosting: boolean) {
    const n = this.nodes;
    if (!n) return;
    const prefs = usePrefs.getState();
    const t = n.low.context.currentTime;
    const volume = prefs.sound ? prefs.volume : 0;
    const v = Math.max(0, Math.min(1.5, speed));
    // Le moteur monte par paliers, comme s'il passait les vitesses
    const gear = v < 0.35 ? v / 0.35 : v < 0.7 ? 0.55 + ((v - 0.35) / 0.35) * 0.45 : 0.75 + ((v - 0.7) / 0.8) * 0.6;
    const base = 46 + gear * 70 + (boosting ? 18 : 0);
    n.low.frequency.setTargetAtTime(base, t, 0.06);
    n.high.frequency.setTargetAtTime(base * 2.01, t, 0.06);
    n.filter.frequency.setTargetAtTime(500 + gear * 900 + (gas ? 300 : 0), t, 0.08);
    n.gain.gain.setTargetAtTime(volume * (0.05 + (gas ? 0.05 : 0.02) + v * 0.03), t, 0.1);
    n.skidGain.gain.setTargetAtTime(volume * (drifting ? 0.05 : 0), t, 0.05);
    n.skidFilter.frequency.setTargetAtTime(2000 + v * 900, t, 0.1);
    n.rush.gain.setTargetAtTime(volume * (boosting ? 0.09 : 0), t, 0.08);
  }

  stop() {
    const n = this.nodes;
    if (!n) return;
    this.nodes = null;
    const t = n.low.context.currentTime;
    for (const g of [n.gain, n.skidGain, n.rush]) g.gain.setTargetAtTime(0, t, 0.08);
    for (const node of [n.low, n.high, n.skid]) node.stop(t + 0.4);
  }
}

/** Le klaxon : deux notes un peu fausses ensemble, deux coups */
export function honk() {
  const prefs = usePrefs.getState();
  const audio = audioOut();
  if (!audio || !prefs.sound) return;
  const { ctx, out } = audio;
  const t = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  gain.connect(filter).connect(out);
  for (const f of [392, 494]) {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = f;
    o.connect(gain);
    o.start(t);
    o.stop(t + 0.62);
  }
  const v = prefs.volume * 0.16;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v, t + 0.02);
  gain.gain.setValueAtTime(v, t + 0.2);
  gain.gain.linearRampToValueAtTime(0, t + 0.24);
  gain.gain.linearRampToValueAtTime(v, t + 0.3);
  gain.gain.setValueAtTime(v, t + 0.56);
  gain.gain.linearRampToValueAtTime(0, t + 0.62);
}
