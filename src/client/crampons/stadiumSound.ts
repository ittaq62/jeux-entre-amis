// Le stade qui vit : une vraie foule enregistrée, jouée deux fois en décalé pour ne jamais se répéter, qui s'enflamme
// quand une action chauffe, pousse un « oooh » sur une occasion, applaudit un arrêt et exulte sur un but.

import { audioOut, soundBuffer } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

/** La rumeur de fond : un millier de personnes qui parlent (enregistrement du domaine public) */
const BED = "foot-stade.mp3";
/** Une foule en fête, qui monte quand ça chauffe (domaine public) */
const FETE = "foot-fete.mp3";
/** Applaudissements et cornes de brume, pour les buts (WebbFilmsUK, CC BY 4.0) */
const OVATION = "foot-ovation.mp3";
/** Des applaudissements, pour un bel arrêt ou la fin d'une période (WebbFilmsUK, CC BY 4.0) */
const APPLAUSE = "foot-applaudit.mp3";

export const STADIUM_FILES = [BED, FETE, OVATION, APPLAUSE];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class StadiumSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private feteGain: GainNode | null = null;
  private feteTone: BiquadFilterNode | null = null;
  private oohGain: GainNode | null = null;
  private oohTone: BiquadFilterNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private ovation: AudioBuffer | null = null;
  private applause: AudioBuffer | null = null;
  private stopped = false;
  /** L'envie du public, lissée : 0 la rumeur, 1 le stade debout */
  private hype = 0.15;
  /** Un surcroît passager (une frappe, un but) qui retombe de lui-même */
  private burst = 0;
  private sinceUpdate = 1;

  async start() {
    const io = audioOut();
    if (!io) return;
    const [bed, fete, ovation, applause] = await Promise.all([
      soundBuffer(BED),
      soundBuffer(FETE),
      soundBuffer(OVATION),
      soundBuffer(APPLAUSE),
    ]);
    if (this.stopped || !bed) return;
    const { ctx, out } = io;
    this.ctx = ctx;
    this.ovation = ovation;
    this.applause = applause;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.setTargetAtTime(this.level(), now, 0.8);
    master.connect(out);
    this.master = master;

    const loop = (buf: AudioBuffer, rate: number, offset: number, pan: number, dest: AudioNode) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      s.connect(p).connect(dest);
      s.start(now + 0.05, offset % buf.duration);
      this.sources.push(s);
      return p;
    };

    // La rumeur : deux lectures décalées et un peu désaccordées, l'une à gauche, l'autre à droite. Leur mélange ne se
    // répète qu'au bout de plusieurs minutes, et le léger écart de hauteur multiplie les voix.
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.5;
    const air = ctx.createBiquadFilter();
    air.type = "lowpass";
    air.frequency.value = 7000;
    air.Q.value = 0.5;
    bedGain.connect(air).connect(master);
    loop(bed, 1, 0, -0.35, bedGain);
    loop(bed, 0.962, bed.duration * 0.47, 0.35, bedGain);
    this.bedGain = bedGain;

    if (fete) {
      // La foule en fête : on ne l'entend presque pas tant que rien ne se passe, elle monte avec l'action
      const feteTone = ctx.createBiquadFilter();
      feteTone.type = "lowpass";
      feteTone.frequency.value = 2200;
      feteTone.Q.value = 0.4;
      const feteGain = ctx.createGain();
      feteGain.gain.value = 0;
      feteTone.connect(feteGain).connect(master);
      const a = loop(fete, 1, 0, -0.2, feteTone);
      const b = loop(fete, 1.045, fete.duration * 0.53, 0.2, feteTone);
      this.feteGain = feteGain;
      this.feteTone = feteTone;
      // Le « oooh » d'une occasion : la même foule, filtrée comme une voyelle qui glisse de « o » vers « ou »
      const oohTone = ctx.createBiquadFilter();
      oohTone.type = "bandpass";
      oohTone.frequency.value = 800;
      oohTone.Q.value = 1.6;
      const oohGain = ctx.createGain();
      oohGain.gain.value = 0;
      a.connect(oohTone);
      b.connect(oohTone);
      oohTone.connect(oohGain).connect(master);
      this.oohGain = oohGain;
      this.oohTone = oohTone;
    }
  }

  /** Le volume du stade, d'après les réglages du site : coupé si le son l'est */
  private level() {
    const p = usePrefs.getState();
    return p.sound ? p.volume * 0.7 : 0;
  }

  /** À chaque image : l'envie du public d'après ce qui se passe à l'écran (de 0 à 1) */
  update(dt: number, mood: number) {
    // Elle monte vite quand l'action chauffe, retombe lentement
    const rising = mood > this.hype;
    this.hype += (mood - this.hype) * (1 - Math.exp(-dt * (rising ? 2.2 : 0.45)));
    this.burst *= Math.exp(-dt * 0.32);
    this.sinceUpdate += dt;
    const ctx = this.ctx;
    if (!ctx || !this.master || this.sinceUpdate < 0.07) return;
    this.sinceUpdate = 0;
    const h = clamp(this.hype + this.burst, 0, 1.4);
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.level(), t, 0.25);
    this.bedGain?.gain.setTargetAtTime(0.5 + Math.min(h, 1) * 0.12, t, 0.3);
    this.feteGain?.gain.setTargetAtTime(Math.max(0, h - 0.12) * 0.85, t, 0.18);
    // Plus la foule s'enflamme, plus elle crie : le son s'ouvre vers les aigus
    this.feteTone?.frequency.setTargetAtTime(1500 + Math.min(h, 1.2) * 4200, t, 0.25);
  }

  /** Une grosse frappe, un face-à-face : le stade se lève un instant */
  rise(amount: number) {
    this.burst = Math.max(this.burst, amount);
  }

  /** L'occasion manquée de peu : « oooh » */
  ooh(strength = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.oohGain || !this.oohTone) return;
    const t = ctx.currentTime;
    const g = this.oohGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1.6 * strength, t + 0.18);
    g.setTargetAtTime(0, t + 0.7, 0.45);
    const f = this.oohTone.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(950, t);
    f.exponentialRampToValueAtTime(330, t + 1.3);
    this.burst = Math.max(this.burst, 0.35 * strength);
  }

  /** Des applaudissements : un arrêt, une belle action, la mi-temps */
  applaud(volume = 0.6) {
    this.oneShot(this.applause, volume);
  }

  /** Le but : la foule explose, applaudit, sonne les cornes */
  goal() {
    this.burst = 1;
    this.hype = Math.max(this.hype, 0.9);
    this.oneShot(this.ovation, 1);
  }

  private oneShot(buf: AudioBuffer | null, volume: number) {
    const ctx = this.ctx;
    if (!ctx || !buf || !this.master) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = 0.97 + Math.random() * 0.06;
    const g = ctx.createGain();
    g.gain.value = volume;
    s.connect(g).connect(this.master);
    s.start();
  }

  stop() {
    this.stopped = true;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 0.6);
    for (const s of this.sources) s.stop(t + 0.7);
    setTimeout(() => master.disconnect(), 900);
    this.sources = [];
    this.master = null;
  }
}
