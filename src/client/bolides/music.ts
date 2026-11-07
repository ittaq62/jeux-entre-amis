// La musique de course : une boucle sans couture (le fichier porte une seconde de recouvrement à chaque bout, on
// boucle entre les deux, quel que soit le décalage du décodeur). Elle démarre au compte à rebours, accélère au
// dernier tour, se fait plus discrète une fois arrivé, et se coupe à part (préférence « bolidesMusic »).

import { audioOut, soundBuffer } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

/** 16 mesures à 140 battements par minute */
const LOOP_S = (16 * 4 * 60) / 140;
const PAD_S = 1;
const LEVEL = 0.32;

export class RaceMusic {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private starting = false;
  private stopped = false;
  private fast = false;
  private quiet = false;

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
      source.playbackRate.value = this.fast ? 1.07 : 1;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      source.connect(gain).connect(out);
      source.start(t, PAD_S);
      this.source = source;
      this.gain = gain;
      this.update();
    });
  }

  /** À chaque image : le volume suit les préférences (son coupé, musique coupée), en douceur */
  update() {
    const g = this.gain;
    if (!g) return;
    const prefs = usePrefs.getState();
    const on = prefs.sound && prefs.bolidesMusic;
    g.gain.setTargetAtTime(on ? prefs.volume * LEVEL * (this.quiet ? 0.55 : 1) : 0, g.context.currentTime, 0.4);
  }

  /** Le dernier tour : un peu plus vite (et un peu plus aigu) */
  setFast(fast: boolean) {
    if (this.fast === fast) return;
    this.fast = fast;
    this.source?.playbackRate.setTargetAtTime(fast ? 1.07 : 1, this.source.context.currentTime, 0.6);
  }

  /** Arrivé : la musique se fait plus discrète */
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
