// Les sons d'Escarmouche, fabriqués à la volée (aucun fichier) : chaque arme a sa détonation, qui claque de près et
// gronde de loin ; le rechargement, les pas, la grenade, les touches. Ils viennent de là où ça se passe : plus on est
// loin, plus ils s'assourdissent et plus l'écho des murs l'emporte. Une ambiance tourne derrière (le vent, les
// oiseaux du hameau, les tôles et les pigeons de la gare), et les balles qui frôlent sifflent.

import { audioOut, effectsLevel, musicLevel } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import type { WeaponId } from "../../shared/games/escarmouche/weapons.ts";

export type EscSoundName =
  | `shot-${WeaponId}`
  | "far"
  | "reload"
  | "mag-out"
  | "mag-in"
  | "bolt"
  | "pump"
  | "empty"
  | "swap"
  | "step"
  | "land"
  | "hit"
  | "head"
  | "hurt"
  | "kill"
  | "boom"
  | "bounce"
  | "throw"
  | "knife"
  | "flag-take"
  | "flag-score"
  | "flag-back"
  | "beep"
  | "go"
  | "zone"
  | "whiz"
  | "heart"
  | "slide"
  | "mantle"
  | "spot"
  | "shell"
  | "revive"
  | "shot-quiet"
  | "crate"
  | "beep";

interface ShotSpec {
  thump: number;
  thumpDecay: number;
  noiseDecay: number;
  cut: number;
  tail: number;
  crack: number;
  gain: number;
}

const SHOTS: Record<WeaponId, ShotSpec> = {
  fa: { thump: 85, thumpDecay: 0.07, noiseDecay: 0.05, cut: 5200, tail: 0.45, crack: 0.5, gain: 0.9 },
  pm: { thump: 120, thumpDecay: 0.05, noiseDecay: 0.035, cut: 6200, tail: 0.3, crack: 0.4, gain: 0.75 },
  pompe: { thump: 55, thumpDecay: 0.13, noiseDecay: 0.1, cut: 3200, tail: 0.75, crack: 0.3, gain: 1 },
  precision: { thump: 70, thumpDecay: 0.1, noiseDecay: 0.06, cut: 7000, tail: 1.1, crack: 0.9, gain: 1 },
  pistolet: { thump: 140, thumpDecay: 0.05, noiseDecay: 0.04, cut: 5600, tail: 0.32, crack: 0.45, gain: 0.7 },
  carabine: { thump: 75, thumpDecay: 0.09, noiseDecay: 0.055, cut: 6400, tail: 0.8, crack: 0.75, gain: 0.95 },
  fm: { thump: 80, thumpDecay: 0.08, noiseDecay: 0.06, cut: 4600, tail: 0.5, crack: 0.45, gain: 0.95 },
  mitraillette: { thump: 135, thumpDecay: 0.04, noiseDecay: 0.03, cut: 6800, tail: 0.25, crack: 0.35, gain: 0.7 },
  rafale: { thump: 90, thumpDecay: 0.065, noiseDecay: 0.045, cut: 5600, tail: 0.42, crack: 0.55, gain: 0.85 },
  double: { thump: 50, thumpDecay: 0.15, noiseDecay: 0.11, cut: 3000, tail: 0.85, crack: 0.3, gain: 1 },
  revolver: { thump: 95, thumpDecay: 0.09, noiseDecay: 0.06, cut: 4800, tail: 0.6, crack: 0.6, gain: 0.9 },
  pa: { thump: 150, thumpDecay: 0.04, noiseDecay: 0.03, cut: 6000, tail: 0.25, crack: 0.4, gain: 0.65 },
};

/** Ce que chaque son envoie dans l'écho (0 : rien, un clic d'interface par exemple) */
const WET: Partial<Record<string, number>> = {
  shot: 0.32,
  far: 0.6,
  boom: 0.55,
  pump: 0.12,
  reload: 0.08,
  "mag-out": 0.08,
  "mag-in": 0.08,
  bolt: 0.08,
  step: 0.06,
  land: 0.08,
  bounce: 0.15,
  knife: 0.1,
  whiz: 0.1,
};

/** Un petit bruit blanc toujours le même */
function noiseGen(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

function lowpassK(fc: number, sr: number) {
  return 1 - Math.exp((-2 * Math.PI * fc) / sr);
}

export class EscSound {
  private ctx: AudioContext | null;
  private out: GainNode | null;
  private buffers = new Map<EscSoundName, AudioBuffer>();
  private last = new Map<string, number>();
  /** L'écho : une réverbération faite d'un bruit qui s'éteint, où chaque son envoie un peu de lui-même */
  private verb: ConvolverNode | null = null;
  private verbIn: GainNode | null = null;
  private ear = { x: 0, y: 0, z: 0 };
  private ambience: { nodes: AudioNode[]; timer: number; unsubscribe: () => void } | null = null;

  constructor() {
    const a = audioOut();
    this.ctx = a?.ctx ?? null;
    this.out = a?.out ?? null;
    if (this.ctx) {
      this.build(this.ctx);
      this.buildVerb(this.ctx);
    }
  }

  private buildVerb(ctx: AudioContext) {
    const len = 2.2;
    const sr = ctx.sampleRate;
    const ir = ctx.createBuffer(2, Math.floor(len * sr), sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      const n = noiseGen(ch ? 991 : 313);
      let lp = 0;
      const k = lowpassK(2600, sr);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += k * (n() - lp);
        // Des premières réflexions sur les façades, puis la queue qui s'éteint
        const early = t < 0.09 && i % Math.floor(sr * (0.011 + ch * 0.003)) < 30 ? 0.6 : 0;
        d[i] = (lp * 1.6 + early * n()) * Math.exp(-t / 0.42) * Math.min(1, t / 0.008);
      }
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.55;
    this.verbIn.connect(this.verb).connect(this.out!);
  }

  /**
   * Un bruit qui boucle sans couture : on en fabrique un peu plus que la boucle, et ce surplus se fond dans son début
   * (à puissance égale), si bien qu'on n'entend ni déclic ni raccord.
   */
  private loopBuffer(seconds: number, fill: (d: Float32Array, sr: number) => void): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(seconds * sr);
    const fade = Math.floor(0.6 * sr);
    const raw = new Float32Array(len + fade);
    fill(raw, sr);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    d.set(raw.subarray(0, len));
    for (let i = 0; i < fade; i++) {
      const k = (i / fade) * (Math.PI / 2);
      d[i] = raw[len + i]! * Math.cos(k) + raw[i]! * Math.sin(k);
    }
    return buf;
  }

  /**
   * L'ambiance de la carte, sous le combat. Discrète, et jamais pareille : des nappes de longueurs différentes (on ne
   * repère pas leur boucle), un vent dont le souffle et le timbre dérivent au hasard, et de loin en loin un bruit de
   * vie (oiseaux, mouettes, corbeau, chouette, tôle, gouttes). Tout passe par le volume « Musique et ambiance », écho
   * compris, suivi en direct. `weather` : le temps de la carte (la bruine de la gare et la mer du port restent la nuit).
   */
  startAmbience(light: "soir" | "gris" | "aube" | "nuit" | "neige", weather: "soir" | "gris" | "aube" | "neige" = "soir") {
    const ctx = this.ctx;
    if (!ctx || !this.out || this.ambience) return;
    const bus = ctx.createGain();
    bus.gain.value = musicLevel();
    bus.connect(this.out);
    // L'écho des bruits de vie passe lui aussi par le réglage (avant, il sonnait quel que soit le volume choisi)
    const echo = ctx.createGain();
    echo.gain.value = musicLevel();
    if (this.verbIn) echo.connect(this.verbIn);
    const unsubscribe = usePrefs.subscribe(() => {
      bus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.2);
      echo.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.2);
    });
    const nodes: AudioNode[] = [bus, echo];
    const between = (a: number, b: number) => a + Math.random() * (b - a);
    /** Ce qui dérive : une valeur qui va vers une cible tirée au hasard, renouvelée à intervalles irréguliers */
    const drifts: { param: AudioParam; lo: number; hi: number; every: [number, number]; tau: [number, number]; next: number }[] = [];
    const drift = (param: AudioParam, lo: number, hi: number, every: [number, number], tau: [number, number]) =>
      drifts.push({ param, lo, hi, every, tau, next: 0 });
    /** Une nappe qui boucle, éventuellement filtrée, qui monte doucement à son volume */
    const layer = (buf: AudioBuffer, level: number, filter?: BiquadFilterNode) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      if (filter) src.connect(filter).connect(gain);
      else src.connect(gain);
      gain.connect(bus);
      // Chaque nappe part d'un endroit différent de sa boucle
      src.start(ctx.currentTime, Math.random() * buf.duration);
      gain.gain.setTargetAtTime(level, ctx.currentTime, 2);
      nodes.push(src, gain);
      if (filter) nodes.push(filter);
      return gain;
    };

    // Le vent : un souffle grave et un sifflement léger, de 17 et 24 secondes (leur ensemble ne se répète qu'après
    // plusieurs minutes), dont le volume et le timbre changent sans cesse
    const windLevel = { soir: 0.11, aube: 0.11, gris: 0.13, nuit: 0.09, neige: 0.17 }[light];
    const low = this.loopBuffer(17.3, (d, sr) => {
      const n = noiseGen(4711);
      let a = 0;
      let b = 0;
      for (let i = 0; i < d.length; i++) {
        a += lowpassK(380, sr) * (n() - a);
        b += lowpassK(120, sr) * (a - b);
        d[i] = a * 0.6 + b * 2.2;
      }
    });
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = "lowpass";
    lowFilter.frequency.value = 500;
    const lowGain = layer(low, windLevel, lowFilter);
    drift(lowGain.gain, windLevel * 0.45, windLevel * 1.05, [3, 8], [1.5, 3.5]);
    drift(lowFilter.frequency, 260, 900, [4, 11], [2, 4]);
    const airy = this.loopBuffer(23.9, (d, sr) => {
      const n = noiseGen(2718);
      let a = 0;
      let b = 0;
      for (let i = 0; i < d.length; i++) {
        a += lowpassK(1400, sr) * (n() - a);
        b += lowpassK(420, sr) * (a - b);
        d[i] = (a - b) * 0.9;
      }
    });
    const airyGain = layer(airy, windLevel * 0.3);
    drift(airyGain.gain, 0, windLevel * 0.55, [5, 13], [2, 5]);

    // La mer du port : un clapotis grave, des vagues irrégulières
    if (weather === "aube") {
      const sea = this.loopBuffer(13.7, (d, sr) => {
        const n = noiseGen(77);
        let a = 0;
        for (let i = 0; i < d.length; i++) {
          a += lowpassK(500, sr) * (n() - a);
          d[i] = a;
        }
      });
      const seaGain = layer(sea, 0.12);
      drift(seaGain.gain, 0.04, 0.17, [2.5, 6], [0.9, 2]);
    }
    // La bruine de la gare : un chuintement léger (et, plus bas, des gouttes de loin en loin)
    if (weather === "gris") {
      const rain = this.loopBuffer(11.1, (d, sr) => {
        const n = noiseGen(2024);
        let a = 0;
        let b = 0;
        for (let i = 0; i < d.length; i++) {
          a += lowpassK(6000, sr) * (n() - a);
          b += lowpassK(900, sr) * (a - b);
          d[i] = a - b;
        }
      });
      const rainGain = layer(rain, 0.06);
      drift(rainGain.gain, 0.04, 0.075, [4, 10], [2, 4]);
    }

    /** Une goutte, ou deux ou trois, qui tombent sur une tôle ou une gouttière, quelque part */
    const drip = () => {
      const t0 = ctx.currentTime + 0.02;
      const pan = ctx.createStereoPanner();
      pan.pan.value = between(-0.9, 0.9);
      pan.connect(bus);
      const drops = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < drops; k++) {
        const at = t0 + k * between(0.08, 0.35);
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(between(1800, 3400), at);
        o.frequency.exponentialRampToValueAtTime(between(700, 1200), at + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(between(0.006, 0.014), at + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
        o.connect(g).connect(pan);
        o.start(at);
        o.stop(at + 0.08);
      }
    };

    // Les bruits de vie, de loin en loin : des oiseaux le soir au hameau, des tôles et des pigeons à la gare
    const chirp = () => {
      const t0 = ctx.currentTime + 0.05;
      const pan = ctx.createStereoPanner();
      pan.pan.value = between(-0.8, 0.8);
      pan.connect(bus);
      if (light === "neige") {
        // Un corbeau au loin : deux ou trois croassements rauques
        const caws = 2 + Math.floor(Math.random() * 2);
        for (let k = 0; k < caws; k++) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          const at = t0 + k * between(0.36, 0.5);
          o.frequency.setValueAtTime(between(500, 600), at);
          o.frequency.exponentialRampToValueAtTime(380, at + 0.26);
          const f = ctx.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = 900;
          f.Q.value = 2.2;
          const og = ctx.createGain();
          og.gain.setValueAtTime(0, at);
          og.gain.linearRampToValueAtTime(0.026, at + 0.03);
          og.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
          o.connect(f).connect(og).connect(pan);
          og.connect(echo);
          o.start(at);
          o.stop(at + 0.32);
        }
      } else if (light === "nuit") {
        if (Math.random() < 0.35) {
          // Une chouette : un hou bref, puis un long hou-ou qui tremble
          for (const [k, len] of [
            [0, 0.28],
            [0.55, 0.9],
          ] as const) {
            const o = ctx.createOscillator();
            o.type = "sine";
            const at = t0 + k;
            o.frequency.setValueAtTime(380, at);
            o.frequency.linearRampToValueAtTime(330, at + len);
            const vib = ctx.createOscillator();
            vib.frequency.value = 7;
            const vg = ctx.createGain();
            vg.gain.value = 9;
            vib.connect(vg).connect(o.frequency);
            const og = ctx.createGain();
            og.gain.setValueAtTime(0, at);
            og.gain.linearRampToValueAtTime(0.032, at + 0.08);
            og.gain.exponentialRampToValueAtTime(0.0001, at + len);
            o.connect(og).connect(pan);
            og.connect(echo);
            o.start(at);
            vib.start(at);
            o.stop(at + len + 0.05);
            vib.stop(at + len + 0.05);
          }
        } else {
          // Des grillons, loin et bas : quelques trilles
          const bursts = 2 + Math.floor(Math.random() * 3);
          const f0 = between(3800, 4600);
          for (let k = 0; k < bursts; k++) {
            const at = t0 + k * between(0.18, 0.3);
            const o = ctx.createOscillator();
            o.frequency.value = f0;
            const am = ctx.createOscillator();
            am.frequency.value = 48;
            const ag = ctx.createGain();
            ag.gain.value = 0.5;
            const og = ctx.createGain();
            og.gain.setValueAtTime(0, at);
            og.gain.linearRampToValueAtTime(0.012, at + 0.02);
            og.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
            am.connect(ag).connect(og.gain);
            o.connect(og).connect(pan);
            o.start(at);
            am.start(at);
            o.stop(at + 0.16);
            am.stop(at + 0.16);
          }
        }
      } else if (light === "aube") {
        // Une mouette : deux ou trois cris qui glissent vers le grave
        const cries = 2 + Math.floor(Math.random() * 2);
        for (let k = 0; k < cries; k++) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          const at = t0 + k * between(0.26, 0.4);
          o.frequency.setValueAtTime(between(1400, 1850), at);
          o.frequency.exponentialRampToValueAtTime(900, at + 0.22);
          const f = ctx.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = 1400;
          f.Q.value = 3;
          const og = ctx.createGain();
          og.gain.setValueAtTime(0, at);
          og.gain.linearRampToValueAtTime(0.028, at + 0.03);
          og.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
          o.connect(f).connect(og).connect(pan);
          o.start(at);
          o.stop(at + 0.28);
        }
      } else if (light === "soir") {
        // Un oiseau : quelques notes qui montent
        const notes = 2 + Math.floor(Math.random() * 4);
        const base = between(2600, 4200);
        for (let k = 0; k < notes; k++) {
          const o = ctx.createOscillator();
          const at = t0 + k * between(0.09, 0.14);
          o.frequency.setValueAtTime(base * between(1, 1.2), at);
          o.frequency.exponentialRampToValueAtTime(base * 1.5, at + 0.06);
          const og = ctx.createGain();
          og.gain.setValueAtTime(0, at);
          og.gain.linearRampToValueAtTime(0.028, at + 0.01);
          og.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
          o.connect(og).connect(pan);
          o.start(at);
          o.stop(at + 0.1);
        }
      } else if (Math.random() < 0.5) {
        // Une tôle qui cogne au loin, avec son écho
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = between(180, 320);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.035, t0);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
        o.connect(og).connect(pan);
        og.connect(echo);
        o.start(t0);
        o.stop(t0 + 1);
      } else {
        // Un pigeon : deux roucoulements graves
        for (let k = 0; k < 2; k++) {
          const o = ctx.createOscillator();
          const at = t0 + k * between(0.4, 0.5);
          o.frequency.setValueAtTime(420, at);
          o.frequency.linearRampToValueAtTime(330, at + 0.3);
          const og = ctx.createGain();
          og.gain.setValueAtTime(0, at);
          og.gain.linearRampToValueAtTime(0.022, at + 0.06);
          og.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
          o.connect(og).connect(pan);
          o.start(at);
          o.stop(at + 0.36);
        }
      }
    };

    // Une fois par seconde : les dérives qui changent de cible, et le prochain bruit de vie s'il est dû (à des
    // intervalles irréguliers, de quelques secondes à une demi-minute)
    const gap: [number, number] = light === "neige" ? [14, 32] : light === "nuit" ? [7, 18] : [8, 22];
    let nextLife = ctx.currentTime + between(4, 10);
    let nextDrip = ctx.currentTime + between(2, 6);
    const timer = window.setInterval(() => {
      if (!this.ctx) return;
      const now = ctx.currentTime;
      for (const dr of drifts) {
        if (now < dr.next) continue;
        dr.param.setTargetAtTime(between(dr.lo, dr.hi), now, between(dr.tau[0], dr.tau[1]));
        dr.next = now + between(dr.every[0], dr.every[1]);
      }
      if (musicLevel() === 0) return;
      if (now >= nextLife) {
        chirp();
        nextLife = now + between(gap[0], gap[1]);
      }
      if (weather === "gris" && now >= nextDrip) {
        drip();
        nextDrip = now + between(1.5, 7);
      }
    }, 1000);
    this.ambience = { nodes, timer, unsubscribe };
  }

  dispose() {
    if (this.ambience) {
      window.clearInterval(this.ambience.timer);
      this.ambience.unsubscribe();
      for (const n of this.ambience.nodes) {
        if (n instanceof AudioBufferSourceNode) n.stop();
        n.disconnect();
      }
      this.ambience = null;
    }
    this.verbIn?.disconnect();
    this.verb?.disconnect();
  }

  private make(len: number, fill: (data: Float32Array, sr: number) => void): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(len * sr)), sr);
    fill(buf.getChannelData(0), sr);
    // On ramène le plus fort à 0,9 : tous les sons au même niveau de départ
    const d = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
    if (peak > 0) for (let i = 0; i < d.length; i++) d[i] = (d[i]! / peak) * 0.9;
    return buf;
  }

  private shot(spec: ShotSpec, far: boolean) {
    return this.make(spec.tail + 0.15, (d, sr) => {
      const n = noiseGen(far ? 77 : 13);
      const k = lowpassK(far ? 900 : spec.cut, sr);
      const kTail = lowpassK(far ? 500 : 1400, sr);
      let lp = 0;
      let lpTail = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const w = n();
        lp += k * (w - lp);
        lpTail += kTail * (w - lpTail);
        const body = lp * Math.exp(-t / spec.noiseDecay);
        const crack = far ? 0 : w * spec.crack * Math.exp(-t / 0.004);
        const f = spec.thump * (1 + 1.5 * Math.exp(-t / 0.02));
        const thump = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / spec.thumpDecay) * (far ? 0.6 : 1.1);
        // La queue : l'écho entre les murs, qui s'éteint
        const tail = lpTail * 0.35 * Math.exp(-t / (spec.tail * 0.35)) * Math.min(1, t / 0.02);
        d[i] = (body + crack + thump + tail) * spec.gain;
      }
    });
  }

  private click(len: number, freq: number, seed: number) {
    return this.make(len, (d, sr) => {
      const n = noiseGen(seed);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (n() * 0.6 + Math.sin(2 * Math.PI * freq * t) * 0.5) * Math.exp(-t / 0.008);
      }
    });
  }

  private tone(len: number, notes: [number, number][], kind: "sine" | "square" = "sine") {
    return this.make(len, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        let v = 0;
        for (const [f, at] of notes) {
          if (t < at) continue;
          const u = t - at;
          const s = Math.sin(2 * Math.PI * f * u);
          v += (kind === "square" ? Math.sign(s) * 0.4 : s) * Math.exp(-u / 0.12) * Math.min(1, u / 0.004);
        }
        d[i] = v;
      }
    });
  }

  private build(ctx: AudioContext) {
    void ctx;
    for (const [id, spec] of Object.entries(SHOTS) as [WeaponId, ShotSpec][]) this.buffers.set(`shot-${id}`, this.shot(spec, false));
    this.buffers.set("far", this.shot(SHOTS.fa, true));
    // Le rechargement : le chargeur qui sort, celui qui entre, la culasse
    this.buffers.set(
      "reload",
      this.make(0.9, (d, sr) => {
        const n = noiseGen(5);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let v = 0;
          for (const [at, f] of [
            [0.05, 1800],
            [0.42, 1300],
            [0.47, 2400],
            [0.75, 900],
          ] as const) {
            if (t >= at) v += (n() * 0.7 + Math.sin(2 * Math.PI * f * (t - at)) * 0.4) * Math.exp(-(t - at) / 0.012);
          }
          d[i] = v;
        }
      }),
    );
    // Les mêmes bruits un à un, pour les caler sur le geste de son arme en main (le rechargement dure de 1,5 à 4,4 s)
    const clicks = (len: number, at: [number, number][], seed: number) =>
      this.make(len, (d, sr) => {
        const n = noiseGen(seed);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let v = 0;
          for (const [a, f] of at) {
            if (t >= a) v += (n() * 0.7 + Math.sin(2 * Math.PI * f * (t - a)) * 0.4) * Math.exp(-(t - a) / 0.012);
          }
          d[i] = v;
        }
      });
    this.buffers.set("mag-out", clicks(0.12, [[0.005, 1800]], 5));
    this.buffers.set(
      "mag-in",
      clicks(
        0.16,
        [
          [0.005, 1300],
          [0.055, 2400],
        ],
        6,
      ),
    );
    this.buffers.set("bolt", clicks(0.14, [[0.005, 900]], 7));
    this.buffers.set(
      "pump",
      this.make(0.35, (d, sr) => {
        const n = noiseGen(9);
        let lp = 0;
        const k = lowpassK(2500, sr);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += k * (n() - lp);
          const a = Math.exp(-t / 0.02) + (t > 0.16 ? Math.exp(-(t - 0.16) / 0.02) : 0);
          d[i] = lp * a;
        }
      }),
    );
    this.buffers.set("empty", this.click(0.05, 3000, 3));
    this.buffers.set("swap", this.click(0.12, 900, 4));
    this.buffers.set(
      "step",
      this.make(0.12, (d, sr) => {
        const n = noiseGen(11);
        let lp = 0;
        const k = lowpassK(700, sr);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += k * (n() - lp);
          d[i] = lp * Math.exp(-t / 0.03) * Math.min(1, t / 0.005);
        }
      }),
    );
    this.buffers.set(
      "land",
      this.make(0.2, (d, sr) => {
        const n = noiseGen(12);
        let lp = 0;
        const k = lowpassK(400, sr);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += k * (n() - lp);
          d[i] = (lp + Math.sin(2 * Math.PI * 60 * t) * 0.3) * Math.exp(-t / 0.05);
        }
      }),
    );
    this.buffers.set("hit", this.tone(0.08, [[2200, 0]]));
    this.buffers.set(
      "head",
      this.tone(0.35, [
        [1760, 0],
        [2637, 0.005],
      ]),
    );
    this.buffers.set(
      "hurt",
      this.make(0.25, (d, sr) => {
        const n = noiseGen(21);
        let lp = 0;
        const k = lowpassK(300, sr);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += k * (n() - lp);
          d[i] = (lp * 0.8 + Math.sin(2 * Math.PI * 70 * t) * 0.6) * Math.exp(-t / 0.06);
        }
      }),
    );
    this.buffers.set(
      "kill",
      this.tone(0.4, [
        [880, 0],
        [1320, 0.07],
      ]),
    );
    this.buffers.set(
      "boom",
      this.make(2.2, (d, sr) => {
        const n = noiseGen(31);
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const k = lowpassK(2800 * Math.exp(-t / 0.25) + 120, sr);
          lp += k * (n() - lp);
          const rumble = Math.sin(2 * Math.PI * (38 + 30 * Math.exp(-t / 0.1)) * t) * Math.exp(-t / 0.5);
          d[i] = lp * Math.exp(-t / 0.55) * 1.4 + rumble * 0.9;
        }
      }),
    );
    this.buffers.set("bounce", this.click(0.06, 1500, 41));
    this.buffers.set(
      "throw",
      this.make(0.3, (d, sr) => {
        const n = noiseGen(51);
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const k = lowpassK(600 + 2400 * Math.sin(Math.min(1, t / 0.3) * Math.PI), sr);
          lp += k * (n() - lp);
          d[i] = lp * Math.sin(Math.min(1, t / 0.3) * Math.PI);
        }
      }),
    );
    this.buffers.set(
      "knife",
      this.make(0.22, (d, sr) => {
        const n = noiseGen(61);
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const k = lowpassK(1200 + 5000 * (t / 0.22), sr);
          lp += k * (n() - lp);
          d[i] = lp * Math.sin((t / 0.22) * Math.PI);
        }
      }),
    );
    this.buffers.set(
      "flag-take",
      this.tone(
        0.6,
        [
          [523, 0],
          [659, 0.1],
          [784, 0.2],
        ],
        "square",
      ),
    );
    this.buffers.set(
      "flag-score",
      this.tone(
        1,
        [
          [523, 0],
          [659, 0.12],
          [784, 0.24],
          [1046, 0.36],
        ],
        "square",
      ),
    );
    this.buffers.set(
      "flag-back",
      this.tone(
        0.5,
        [
          [784, 0],
          [523, 0.12],
        ],
        "square",
      ),
    );
    this.buffers.set("beep", this.tone(0.2, [[660, 0]], "square"));
    this.buffers.set("go", this.tone(0.5, [[990, 0]], "square"));
    this.buffers.set("zone", this.tone(0.15, [[1200, 0]]));
    // Le tir au silencieux : un claquement sourd et bref, le mécanisme qui cliquette
    this.buffers.set(
      "shot-quiet",
      this.make(0.22, (d, sr) => {
        const n = noiseGen(616);
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += lowpassK(1300, sr) * (n() - lp);
          const thump = Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t / 0.025);
          const click = n() * 0.35 * Math.exp(-Math.abs(t - 0.03) / 0.004);
          d[i] = (lp * Math.exp(-t / 0.04) + thump * 0.6 + click) * 0.8;
        }
      }),
    );
    // Le bip d'une charge posée : court et aigu
    this.buffers.set(
      "beep",
      this.make(0.09, (d, sr) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.05);
          d[i] = (Math.sign(Math.sin(2 * Math.PI * 1850 * t)) * 0.35 + Math.sin(2 * Math.PI * 3700 * t) * 0.15) * env;
        }
      }),
    );
    // Une caisse qui vole en éclats : le craquement sec des planches, puis des morceaux qui retombent
    this.buffers.set(
      "crate",
      this.make(0.9, (d, sr) => {
        const n = noiseGen(2024);
        let lp = 0;
        let lp2 = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const x = n();
          lp += lowpassK(2200, sr) * (x - lp);
          lp2 += lowpassK(600, sr) * (x - lp2);
          const crack = (x - lp) * Math.exp(-t / 0.03) * 1.2;
          const body = lp * Math.exp(-t / 0.12) * 1.4 + Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.06) * 0.5;
          // Les morceaux qui retombent : de petits chocs secs, de plus en plus rares
          let fall = 0;
          for (const at of [0.22, 0.31, 0.38, 0.52, 0.61, 0.74]) {
            const dt = t - at;
            if (dt > 0 && dt < 0.03) fall += (x - lp2) * Math.exp(-dt / 0.006) * 0.5 * (1 - at);
          }
          d[i] = (crack + body + fall) * 0.85;
        }
      }),
    );
    // Relevé : trois notes qui montent
    this.buffers.set(
      "revive",
      this.tone(0.5, [
        [660, 0],
        [880, 0.1],
        [1100, 0.2],
      ]),
    );
    // Repérer : deux notes brèves, comme un signal radio
    this.buffers.set(
      "spot",
      this.tone(0.3, [
        [1320, 0],
        [1760, 0.08],
      ]),
    );
    // L'obus de mortier : un sifflement qui descend, de plus en plus fort
    this.buffers.set(
      "shell",
      this.make(1.4, (d, sr) => {
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const f = 2400 - t * 1300;
          ph += (2 * Math.PI * f) / sr;
          d[i] = Math.sin(ph) * Math.min(1, t / 0.3) * (0.3 + t * 0.5);
        }
      }),
    );
    // La glissade : le gravier qui crisse sous le corps
    this.buffers.set(
      "slide",
      this.make(0.75, (d, sr) => {
        const n = noiseGen(808);
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += lowpassK(1800 - t * 1400, sr) * (n() - lp);
          const grit = n() * 0.25 * Math.exp(-t / 0.3);
          d[i] = (lp + grit) * Math.min(1, t / 0.02) * Math.exp(-t / 0.35);
        }
      }),
    );
    // Se hisser : le choc des mains et du corps, un froissement de toile
    this.buffers.set(
      "mantle",
      this.make(0.4, (d, sr) => {
        const n = noiseGen(919);
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += lowpassK(900, sr) * (n() - lp);
          const thud = Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t / 0.05);
          const cloth = lp * 0.8 * Math.exp(-Math.abs(t - 0.18) / 0.07);
          d[i] = thud + cloth;
        }
      }),
    );
    // Le cœur qui bat fort : deux coups sourds
    this.buffers.set(
      "heart",
      this.make(0.5, (d, sr) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let v = 0;
          for (const [at, k] of [
            [0, 1],
            [0.22, 0.7],
          ] as const) {
            if (t < at) continue;
            const u = t - at;
            v += Math.sin(2 * Math.PI * (52 - u * 40) * u) * Math.exp(-u / 0.06) * k;
          }
          d[i] = v;
        }
      }),
    );
    // Une balle qui frôle : un souffle aigu qui file et retombe
    this.buffers.set(
      "whiz",
      this.make(0.22, (d, sr) => {
        const n = noiseGen(5150);
        let bp = 0;
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const fc = 5200 - t * 14000;
          lp += lowpassK(Math.max(900, fc), sr) * (n() - lp);
          bp = lp - bp * 0.2;
          d[i] = bp * Math.sin(Math.min(1, t / 0.22) * Math.PI) ** 2;
        }
      }),
    );
  }

  /** L'oreille : là où est le joueur, et où il regarde */
  setListener(x: number, y: number, z: number, yaw: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    this.ear = { x, y, z };
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(x, t);
      l.positionY.setValueAtTime(y, t);
      l.positionZ.setValueAtTime(z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(0, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /** Un son, d'un endroit du monde (sinon dans la tête du joueur) */
  play(name: EscSoundName, opts: { at?: { x: number; y: number; z: number }; volume?: number; rate?: number; gap?: number } = {}) {
    // Le réglage du son du site : général × effets (0 quand le son est coupé)
    const vol = effectsLevel();
    const ctx = this.ctx;
    if (vol <= 0 || !ctx || !this.out) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    // Pas deux fois le même son en même temps (au même endroit)
    const key = `${name}:${opts.at ? `${Math.round(opts.at.x)},${Math.round(opts.at.z)}` : "me"}`;
    const now = performance.now();
    if (now - (this.last.get(key) ?? -1e9) < (opts.gap ?? 25)) return;
    this.last.set(key, now);
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08);
    const gain = ctx.createGain();
    gain.gain.value = vol * (opts.volume ?? 1) * 0.8;
    // Plus c'est loin, plus c'est sourd (les aigus se perdent) et plus l'écho domine
    const dist = opts.at ? Math.hypot(opts.at.x - this.ear.x, opts.at.y - this.ear.y, opts.at.z - this.ear.z) : 0;
    if (opts.at && dist > 6) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = Math.max(700, 16000 * Math.exp(-dist / 28));
      src.connect(lp).connect(gain);
    } else src.connect(gain);
    const wet = WET[name.startsWith("shot-") ? "shot" : name] ?? 0;
    if (wet > 0 && this.verbIn) {
      const send = ctx.createGain();
      send.gain.value = wet * (opts.at ? Math.min(2.2, 1 + dist / 30) : 1);
      gain.connect(send).connect(this.verbIn);
    }
    if (opts.at) {
      const p = ctx.createPanner();
      p.panningModel = "equalpower";
      p.distanceModel = "inverse";
      p.refDistance = 4;
      p.rolloffFactor = 1.1;
      p.maxDistance = 200;
      p.positionX.value = opts.at.x;
      p.positionY.value = opts.at.y;
      p.positionZ.value = opts.at.z;
      gain.connect(p).connect(this.out);
    } else gain.connect(this.out);
    src.start();
  }
}
