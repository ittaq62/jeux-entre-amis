// La musique d'un combat : une boucle sans couture (celle des courses du site), qui démarre au compte à rebours,
// accélère un peu quand il ne reste qu'une vie à départager, se fait discrète à la fin, et se coupe à part (réglage
// « musique » de Culbute, gardé sur l'appareil).

import { audioOut, musicLevel, soundBuffer } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

/** 16 mesures à 140 battements par minute, une seconde de recouvrement à chaque bout du fichier */
const LOOP_S = (16 * 4 * 60) / 140;
const PAD_S = 1;
const LEVEL = 0.26;

export class FightMusic {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private starting = false;
  private stopped = false;
  private fast = false;
  private quiet = false;
  private enabled = true;

  start() {
    if (this.source || this.starting) return;
    const audio = audioOut();
    if (!audio || !usePrefs.getState().sound) return;
    this.starting = true;
    this.stopped = false;
    void soundBuffer("bolides-music.mp3").then((buffer) => {
      this.starting = false;
      if (!buffer || this.stopped || this.source) return;
      const { ctx, out } = audio;
      const t = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = PAD_S;
      source.loopEnd = Math.min(buffer.duration, PAD_S + LOOP_S);
      source.playbackRate.value = this.fast ? 1.06 : 1;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      source.connect(gain).connect(out);
      source.start(t, PAD_S);
      this.source = source;
      this.gain = gain;
      this.update();
    });
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.update();
  }

  /** Le volume suit le réglage du son du site (général × musique, son coupé) et celui de Culbute, en douceur */
  update() {
    const g = this.gain;
    if (!g) return;
    const level = this.enabled ? musicLevel() : 0;
    g.gain.setTargetAtTime(level * LEVEL * (this.quiet ? 0.45 : 1), g.context.currentTime, 0.4);
  }

  /** La dernière vie à départager : un peu plus vite */
  setFast(fast: boolean) {
    if (this.fast === fast) return;
    this.fast = fast;
    this.source?.playbackRate.setTargetAtTime(fast ? 1.06 : 1, this.source.context.currentTime, 0.6);
  }

  /** Le combat est fini : plus discrète */
  setQuiet(quiet: boolean) {
    if (this.quiet === quiet) return;
    this.quiet = quiet;
    this.update();
  }

  stop() {
    this.stopped = true;
    const s = this.source;
    const g = this.gain;
    this.source = null;
    this.gain = null;
    if (!s || !g) return;
    const t = s.context.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.3);
    s.stop(t + 1.5);
  }
}
