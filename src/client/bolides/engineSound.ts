// Le bruit du kart : un vrai son de moteur enregistré en boucle (fabriqué pour le jeu), joué plus ou moins vite
// selon le régime, plus ouvert quand on accélère, avec de petites irrégularités pour ne jamais sonner pareil ;
// le crissement des pneus pendant les dérapages, et un souffle pendant les turbos. Le klaxon aussi.
// Le moteur peut se couper à part (préférence « bolidesEngine »).

import { audioOut, soundBuffer } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

interface Nodes {
  engine: AudioBufferSourceNode;
  engineFilter: BiquadFilterNode;
  engineGain: GainNode;
  skid: AudioBufferSourceNode;
  skidGain: GainNode;
  rush: AudioBufferSourceNode;
  rushGain: GainNode;
}

export class EngineSound {
  private nodes: Nodes | null = null;
  private starting = false;
  private stopped = false;
  private t0 = performance.now();

  start() {
    if (this.nodes || this.starting || !usePrefs.getState().sound) return;
    const audio = audioOut();
    if (!audio) return;
    this.starting = true;
    this.stopped = false;
    void Promise.all([soundBuffer("bolides-engine.wav"), soundBuffer("bolides-skid.wav")]).then(([engineBuf, skidBuf]) => {
      this.starting = false;
      if (this.stopped || this.nodes || !engineBuf || !skidBuf) return;
      const { ctx, out } = audio;
      const t = ctx.currentTime;
      // Le moteur : la boucle, un filtre doux (pas de résonance qui siffle), un volume qui monte en douceur
      const engine = ctx.createBufferSource();
      engine.buffer = engineBuf;
      engine.loop = true;
      engine.playbackRate.value = 0.6;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 700;
      engineFilter.Q.value = 0.5;
      const engineGain = ctx.createGain();
      engineGain.gain.setValueAtTime(0, t);
      engine.connect(engineFilter).connect(engineGain).connect(out);
      // Les pneus
      const skid = ctx.createBufferSource();
      skid.buffer = skidBuf;
      skid.loop = true;
      const skidFilter = ctx.createBiquadFilter();
      skidFilter.type = "lowpass";
      skidFilter.frequency.value = 3200;
      const skidGain = ctx.createGain();
      skidGain.gain.value = 0;
      skid.connect(skidFilter).connect(skidGain).connect(out);
      // Le souffle du turbo : du bruit grave
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const rush = ctx.createBufferSource();
      rush.buffer = noise;
      rush.loop = true;
      const rushFilter = ctx.createBiquadFilter();
      rushFilter.type = "lowpass";
      rushFilter.frequency.value = 800;
      const rushGain = ctx.createGain();
      rushGain.gain.value = 0;
      rush.connect(rushFilter).connect(rushGain).connect(out);
      engine.start(t, Math.random() * 1.5);
      skid.start(t, Math.random() * 0.8);
      rush.start(t);
      this.nodes = { engine, engineFilter, engineGain, skid, skidGain, rush, rushGain };
    });
  }

  /** `speed` : la vitesse en part de la vitesse de pointe ; le reste dit ce que fait le kart */
  update(speed: number, gas: boolean, drifting: boolean, boosting: boolean) {
    // Le son remis en route en pleine course : le moteur démarre à ce moment-là
    if (!this.nodes && usePrefs.getState().sound) this.start();
    const n = this.nodes;
    if (!n) return;
    const prefs = usePrefs.getState();
    const t = n.engine.context.currentTime;
    const volume = prefs.sound ? prefs.volume : 0;
    const v = Math.max(0, Math.min(1.5, speed));
    // Le régime monte par paliers, comme s'il passait les vitesses, avec un léger tremblement
    const gear = v < 0.35 ? v / 0.35 : v < 0.7 ? 0.55 + ((v - 0.35) / 0.35) * 0.45 : 0.75 + ((v - 0.7) / 0.8) * 0.6;
    const s = (performance.now() - this.t0) / 1000;
    const jitter = 1 + 0.006 * Math.sin(s * 7.3) + 0.004 * Math.sin(s * 13.9 + 1);
    const rate = (0.55 + gear * 0.82 + (boosting ? 0.1 : 0) + (gas ? 0.03 : 0)) * jitter;
    n.engine.playbackRate.setTargetAtTime(rate, t, 0.09);
    n.engineFilter.frequency.setTargetAtTime(420 + gear * 1500 + (gas ? 450 : 0) + (boosting ? 500 : 0), t, 0.12);
    const engineOn = prefs.bolidesEngine ? 1 : 0;
    n.engineGain.gain.setTargetAtTime(volume * engineOn * (0.07 + (gas ? 0.06 : 0.025) + v * 0.035), t, 0.15);
    n.skidGain.gain.setTargetAtTime(volume * (drifting && v > 0.3 ? 0.06 : 0), t, drifting ? 0.05 : 0.12);
    n.skid.playbackRate.setTargetAtTime(0.9 + v * 0.2, t, 0.2);
    n.rushGain.gain.setTargetAtTime(volume * (boosting ? 0.07 : 0), t, 0.1);
  }

  stop() {
    this.stopped = true;
    const n = this.nodes;
    if (!n) return;
    this.nodes = null;
    const t = n.engine.context.currentTime;
    for (const g of [n.engineGain, n.skidGain, n.rushGain]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, 0.08);
    }
    for (const node of [n.engine, n.skid, n.rush]) node.stop(t + 0.5);
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
