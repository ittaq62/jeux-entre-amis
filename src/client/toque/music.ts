// La musique d'un service : une boucle composée pour Toque ! (scripts/toque-musique.py, rendue une fois pour toutes),
// une par famille de cuisines : la valse musette du bistrot et de la guinguette, la gigue du port, la marche de la
// cantine et du marché, la tarentelle des toits, le ländler du chalet, le swing du train de nuit, la polka du banquet.
// Elle démarre en douceur, se fait discrète à la fin, et suit les réglages du son du site.

import type { KitchenId } from "../../shared/games/toque/kitchens.ts";
import { audioOut, musicLevel, soundBuffer } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

type Track = "musette" | "port" | "marche" | "toits" | "chalet" | "train" | "banquet";

/** Le morceau de chaque cuisine */
export const TRACK_OF: Record<KitchenId, Track> = {
  bistrot: "musette",
  creperie: "port",
  cantine: "marche",
  pizzeria: "toits",
  brasserie: "marche",
  chalet: "chalet",
  train: "train",
  guinguette: "musette",
  banquet: "banquet",
};

/**
 * La longueur exacte de chaque boucle, en échantillons à 44,1 kHz (mesures × temps × 60 / tempo, comme le script) : le
 * fichier fait une seconde de la fin, la boucle, une seconde du début ; on boucle de 1 s à 1 s + la boucle
 */
const LOOP_SAMPLES: Record<Track, number> = {
  musette: 1443273,
  port: 1270080,
  marche: 1459862,
  toits: 1336926,
  chalet: 1443273,
  train: 1227130,
  banquet: 1282909,
};
const PAD_S = 1;

const LEVEL = 0.34;

export class ToqueMusic {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private stopped = false;
  private quiet = false;
  private unsub: (() => void) | null = null;

  constructor(private kitchen: KitchenId) {}

  start() {
    const audio = audioOut();
    if (!audio || !usePrefs.getState().sound) return;
    const track = TRACK_OF[this.kitchen];
    const file = `toque-${track}.mp3`;
    void soundBuffer(file).then((buffer) => {
      if (!buffer || this.stopped || this.source) return;
      const { ctx, out } = audio;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = PAD_S;
      source.loopEnd = Math.min(buffer.duration, PAD_S + LOOP_SAMPLES[track] / 44100);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      source.connect(gain).connect(out);
      source.start(ctx.currentTime, PAD_S);
      this.source = source;
      this.gain = gain;
      this.update();
    });
    this.unsub = usePrefs.subscribe(() => this.update());
  }

  private update() {
    const g = this.gain;
    if (!g) return;
    g.gain.setTargetAtTime(musicLevel() * LEVEL * (this.quiet ? 0.4 : 1), g.context.currentTime, 0.6);
  }

  setQuiet(quiet: boolean) {
    this.quiet = quiet;
    this.update();
  }

  stop() {
    this.stopped = true;
    this.unsub?.();
    const s = this.source;
    const g = this.gain;
    this.source = null;
    this.gain = null;
    if (s && g) {
      g.gain.setTargetAtTime(0, g.context.currentTime, 0.25);
      s.stop(g.context.currentTime + 1);
    }
  }
}
