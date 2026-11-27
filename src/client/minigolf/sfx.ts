// Les bruits du minigolf, fabriqués à la volée (rien à télécharger) : le « toc » du putter selon la force, la balle
// qui cogne une bordure de bois, de buis, de pierre ou de fer, qui retombe, qui tombe au fond du trou (et y tourne),
// qui frôle le bord, qui plonge dans l'eau ; les tremplins, les téléporteurs, les tubes ; et l'ambiance de chaque
// parcours (les oiseaux et le vent du jardin…). Tout passe par le réglage du son du site.

import { audioOut, effectsLevel, musicLevel } from "../lib/sound.ts";
import { roomOut, strike } from "../lib/sfxKit.ts";

let noiseBuffer: AudioBuffer | null = null;

function out(level = effectsLevel()): { ctx: AudioContext; dest: GainNode; vol: number } | null {
  if (level <= 0) return null;
  const o = audioOut();
  if (!o) return null;
  if (o.ctx.state === "suspended") void o.ctx.resume();
  // En plein air : presque pas de réverbération, juste ce qu'il faut pour que les chocs ne sonnent pas « dans le vide »
  return { ctx: o.ctx, dest: roomOut(o.ctx, o.out, { rt60: 0.25, wet: 0.06 }) as GainNode, vol: level };
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

const last = new Map<string, number>();
/** Pas plus d'un même bruit tous les `gap` millisecondes */
function spaced(key: string, gap: number): boolean {
  const now = performance.now();
  if (now - (last.get(key) ?? 0) < gap) return false;
  last.set(key, now);
  return true;
}

/** Les modes de quelques matières (rapports à la fondamentale) */
const BALL = [1, 1.62, 2.4];
const WOOD = [1, 1.58, 2.71];
const PLASTIC = [1, 1.47, 2.09];
const METAL = [1, 2.76, 5.4];
const MARIMBA = [1, 3.93, 9.2];
const GLOCK = [1, 2.71, 5.15];

/**
 * Un choc d'objet, à la place d'une note qui glissait : ses modes (`ratios`) s'éteignent dans le même temps (`decay`)
 * et à la même force (`peak`) que l'ancienne note, avec le bruit du contact (plus aigu si `hardness` est grand)
 */
function hit(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  f: number,
  peak: number,
  decay: number,
  ratios: readonly number[],
  hardness = 5000,
) {
  strike(ctx, dest, t, { ratios, decays: [decay / 7, decay / 10, decay / 14], amps: [1, 0.5, 0.3] }, f * (0.97 + Math.random() * 0.06), {
    gain: peak * 0.85,
    velocity: 0.85,
    hardness,
    click: 0.3,
  });
}

/** Le coup de putter : un « toc » net, plus sec et plus fort quand on frappe fort */
export function putt(power: number, vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.005;
  const v = o.vol * vol * (0.35 + power * 0.65);
  // La balle qui claque, et la tête de métal du putter qui sonne un peu
  hit(o.ctx, o.dest, t, 1500 + power * 600, v * 0.5, 0.05, BALL, 9000);
  hit(o.ctx, o.dest, t, 260 + power * 120, v * 0.55, 0.11, METAL, 4000);
  burst(o.ctx, o.dest, t, "bandpass", 3200, 1.2, v * 0.35, 0.001, 0.03);
}

/** La balle contre un obstacle : le bois sonne creux, le buis étouffe, la pierre claque, le fer tinte */
export function knock(kind: string, speed: number, vol = 1) {
  if (!spaced(`k:${kind}`, 45)) return;
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  const v = o.vol * vol * Math.min(1, 0.15 + speed / 4);
  switch (kind) {
    case "hedge":
      burst(o.ctx, o.dest, t, "lowpass", 900, 0.7, v * 0.7, 0.002, 0.09);
      hit(o.ctx, o.dest, t, 150, v * 0.4, 0.08, WOOD, 1500);
      break;
    case "stone":
      hit(o.ctx, o.dest, t, 1300, v * 0.45, 0.05, BALL, 8000);
      burst(o.ctx, o.dest, t, "highpass", 2500, 0.8, v * 0.4, 0.001, 0.04);
      break;
    case "metal":
      hit(o.ctx, o.dest, t, 2250, v * 0.35, 0.4, [1, 1.52], 9000);
      break;
    case "bumper":
      tone(o.ctx, o.dest, t, "square", 520, 880, v * 0.25, 0.002, 0.12);
      tone(o.ctx, o.dest, t, "sine", 260, 440, v * 0.4, 0.002, 0.16);
      break;
    default:
      // Le bois des bordures
      hit(o.ctx, o.dest, t, 510, v * 0.55, 0.08, WOOD, 3000);
      burst(o.ctx, o.dest, t, "bandpass", 1400, 2, v * 0.4, 0.001, 0.05);
  }
}

/** Elle retombe sur le sol */
export function land(mat: string, speed: number, vol = 1) {
  if (!spaced("land", 60) || speed < 0.6) return;
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  const v = o.vol * vol * Math.min(1, speed / 5);
  if (mat === "sand" || mat === "snow") burst(o.ctx, o.dest, t, "lowpass", 700, 0.5, v * 0.8, 0.003, 0.22);
  else if (mat === "wood" || mat === "metal" || mat === "stone") {
    hit(o.ctx, o.dest, t, 245, v * 0.6, 0.1, WOOD, 2500);
    burst(o.ctx, o.dest, t, "bandpass", 1200, 1.5, v * 0.35, 0.001, 0.06);
  } else {
    hit(o.ctx, o.dest, t, 112, v * 0.7, 0.12, WOOD, 1500);
    burst(o.ctx, o.dest, t, "lowpass", 600, 0.6, v * 0.3, 0.002, 0.08);
  }
}

/** Au fond du trou : le choc sur le fond, puis la balle qui tourne et s'arrête */
export function cupDrop(vol = 1, cheer = false) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.01;
  const v = o.vol * vol;
  // Le gobelet : le fond de plastique qui encaisse, le bord de métal qui tinte
  hit(o.ctx, o.dest, t, 216, v * 0.75, 0.14, PLASTIC, 3000);
  hit(o.ctx, o.dest, t, 1050, v * 0.3, 0.1, METAL, 8000);
  for (let k = 0; k < 6; k++) {
    const tk = t + 0.12 + k * (0.07 - k * 0.006);
    hit(o.ctx, o.dest, tk, 800 - k * 40, v * (0.28 - k * 0.04), 0.04, BALL, 8000);
  }
  if (cheer) applause(0.9);
}

/** La balle frôle le bord du trou et ressort */
export function lip(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  hit(o.ctx, o.dest, t, 1600, o.vol * vol * 0.35, 0.12, METAL, 9000);
  hit(o.ctx, o.dest, t + 0.05, 1350, o.vol * vol * 0.2, 0.1, METAL, 9000);
}

/** Le plouf, et les bulles */
export function splash(vol = 1, lava = false) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.005;
  const v = o.vol * vol;
  burst(o.ctx, o.dest, t, "lowpass", lava ? 500 : 1800, 0.8, v * 0.9, 0.004, 0.35);
  burst(o.ctx, o.dest, t + 0.02, "bandpass", lava ? 300 : 900, 2, v * 0.5, 0.01, 0.4);
  for (let k = 0; k < 5; k++) tone(o.ctx, o.dest, t + 0.15 + k * 0.08, "sine", 500 + k * 120, 900 + k * 150, v * 0.12, 0.005, 0.05);
}

/** Hors du parcours : un petit bruit mou dans l'herbe */
export function outOfBounds(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.005;
  burst(o.ctx, o.dest, t, "lowpass", 500, 0.6, o.vol * vol * 0.6, 0.004, 0.18);
  tone(o.ctx, o.dest, t + 0.1, "sine", 420, 300, o.vol * vol * 0.2, 0.01, 0.25);
}

export function boing(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  tone(o.ctx, o.dest, t, "sine", 180, 620, o.vol * vol * 0.5, 0.005, 0.28);
}

export function warp(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  tone(o.ctx, o.dest, t, "sawtooth", 200, 1800, o.vol * vol * 0.12, 0.02, 0.3);
  tone(o.ctx, o.dest, t + 0.05, "sine", 1600, 400, o.vol * vol * 0.3, 0.01, 0.35);
}

export function tube(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  burst(o.ctx, o.dest, t, "bandpass", 500, 3, o.vol * vol * 0.4, 0.05, 0.5);
}

export function sparkle(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  for (let k = 0; k < 4; k++) hit(o.ctx, o.dest, t + k * 0.06, 1650 + k * 410, o.vol * vol * 0.2, 0.15, GLOCK, 9000);
}

/** Deux balles qui se heurtent : un « clac » sec, plus fort quand le choc est fort */
export function clack(speed: number, vol = 1) {
  const o = out();
  if (!o || !spaced("clack", 40)) return;
  const t = o.ctx.currentTime + 0.003;
  const v = o.vol * vol * Math.min(1, 0.25 + speed * 0.3);
  hit(o.ctx, o.dest, t, 2350, v * 0.42, 0.05, BALL, 10000);
  burst(o.ctx, o.dest, t, "bandpass", 3200, 2.5, v * 0.3, 0.001, 0.03);
}

/** À lui de jouer : deux notes claires, comme un carillon de bois */
export function yourTurn(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.01;
  const v = o.vol * vol;
  hit(o.ctx, o.dest, t, 660, v * 0.32, 0.32, MARIMBA, 4000);
  tone(o.ctx, o.dest, t + 0.13, "triangle", 990, 980, v * 0.3, 0.004, 0.45);
  tone(o.ctx, o.dest, t + 0.13, "sine", 1980, 1970, v * 0.08, 0.004, 0.3);
}

/** Les dernières secondes de son tour : un petit tic */
export function clockTick(vol = 1) {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + 0.003;
  tone(o.ctx, o.dest, t, "square", 1500, 1400, o.vol * vol * 0.05, 0.001, 0.03);
}

/** Des applaudissements (un trou en un) */
export function applause(vol = 1) {
  const o = out();
  if (!o) return;
  const t0 = o.ctx.currentTime + 0.05;
  for (let k = 0; k < 90; k++) {
    const t = t0 + Math.random() * 2.2 * (k / 90 + 0.3);
    burst(o.ctx, o.dest, t, "bandpass", 1200 + Math.random() * 1600, 1.5, o.vol * vol * (0.1 + Math.random() * 0.12), 0.002, 0.03);
  }
}

// ---------------------------------------------------------------------------
// L'ambiance : un souffle de vent doux, et des oiseaux de temps en temps
// ---------------------------------------------------------------------------

/** Le bruit de fond de chaque parcours : jusqu'où on laisse passer les aigus (Hz) */
const ROOM_TONE: Record<string, number> = {
  jardin: 420,
  mer: 650,
  montagne: 520,
  cuisine: 240,
  jungle: 900,
  horloger: 200,
  lune: 120,
  volcan: 160,
};

export class Ambience {
  private wind: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private lfo: OscillatorNode | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  private insects: { src: AudioBufferSourceNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(private kind: string) {}

  start() {
    const o = out(musicLevel());
    if (!o) {
      // Le son coupé : on réessaie un peu plus tard (on ne sait pas quand il sera remis)
      this.timer = setTimeout(() => !this.stopped && this.start(), 3000);
      return;
    }
    const src = o.ctx.createBufferSource();
    src.buffer = noise(o.ctx);
    src.loop = true;
    const f = o.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = ROOM_TONE[this.kind] ?? 300;
    const gain = o.ctx.createGain();
    gain.gain.value = 0.035 * o.vol;
    src.connect(f).connect(gain).connect(o.dest);
    // Au bord de la mer : le ressac, une vague toutes les sept secondes environ ; au volcan, le grondement
    if (this.kind === "mer" || this.kind === "montagne" || this.kind === "volcan") {
      // En montagne : des rafales, plus lentes et plus fortes
      const lfo = o.ctx.createOscillator();
      lfo.frequency.value = this.kind === "mer" ? 0.14 : this.kind === "volcan" ? 0.05 : 0.07;
      const depth = o.ctx.createGain();
      depth.gain.value = (this.kind === "mer" ? 0.03 : 0.035) * o.vol;
      lfo.connect(depth).connect(gain.gain);
      lfo.start();
      this.lfo = lfo;
    }
    // Dans la jungle : le chant des insectes, aigu, qui enfle et retombe
    if (this.kind === "jungle") {
      const bug = o.ctx.createBufferSource();
      bug.buffer = noise(o.ctx);
      bug.loop = true;
      const band = o.ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 5200;
      band.Q.value = 6;
      const bg = o.ctx.createGain();
      bg.gain.value = 0.012 * o.vol;
      const pulse = o.ctx.createOscillator();
      pulse.frequency.value = 0.09;
      const depth = o.ctx.createGain();
      depth.gain.value = 0.01 * o.vol;
      pulse.connect(depth).connect(bg.gain);
      bug.connect(band).connect(bg).connect(o.dest);
      bug.start();
      pulse.start();
      this.insects = { src: bug, lfo: pulse, gain: bg };
    }
    // Dans la cuisine : le ronron du réfrigérateur, tout bas
    if (this.kind === "cuisine") {
      const osc = o.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 98;
      const hg = o.ctx.createGain();
      hg.gain.value = 0.006 * o.vol;
      osc.connect(hg).connect(o.dest);
      osc.start();
      this.hum = { osc, gain: hg };
    }
    // Dans l'atelier : le tic-tac des horloges, deux fois par seconde, « tic » puis « tac »
    if (this.kind === "horloger") {
      let tick = 0;
      this.ticker = setInterval(() => {
        const q = out(musicLevel());
        if (!q || this.stopped) return;
        const t = q.ctx.currentTime + 0.01;
        const f = tick++ % 2 ? 1650 : 2100;
        tone(q.ctx, q.dest, t, "square", f, f * 0.9, q.vol * 0.012, 0.001, 0.025);
        tone(q.ctx, q.dest, t, "sine", f * 0.5, f * 0.45, q.vol * 0.02, 0.001, 0.04);
      }, 500);
    }
    src.start();
    this.wind = { src, gain };
    this.birds();
  }

  /** Le réglage du son a changé */
  update() {
    if (this.wind) this.wind.gain.gain.value = 0.035 * musicLevel();
    if (this.hum) this.hum.gain.gain.value = 0.006 * musicLevel();
    if (this.insects) this.insects.gain.gain.value = 0.012 * musicLevel();
  }

  private birds() {
    if (this.stopped) return;
    const o = out(musicLevel());
    if (o && this.kind === "mer") {
      // Une mouette : deux ou trois cris qui descendent
      const t = o.ctx.currentTime + 0.02;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const tk = t + k * 0.32;
        tone(o.ctx, o.dest, tk, "sawtooth", 1500 + Math.random() * 200, 900, o.vol * 0.025, 0.02, 0.22);
        tone(o.ctx, o.dest, tk, "sine", 1700, 1100, o.vol * 0.04, 0.02, 0.2);
      }
    }
    if (o && this.kind === "jardin") {
      const t = o.ctx.currentTime + 0.02;
      const base = 2400 + Math.random() * 1800;
      const n = 2 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n; k++) {
        const tk = t + k * (0.09 + Math.random() * 0.06);
        tone(o.ctx, o.dest, tk, "sine", base * (0.9 + Math.random() * 0.3), base * (1.15 + Math.random() * 0.3), o.vol * 0.07, 0.01, 0.06);
      }
    }
    if (o && this.kind === "cuisine") {
      const t = o.ctx.currentTime + 0.02;
      const r = Math.random();
      if (r < 0.4) {
        // Un oiseau dehors, derrière la fenêtre
        const base = 2600 + Math.random() * 1400;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++)
          tone(o.ctx, o.dest, t + k * (0.1 + Math.random() * 0.05), "sine", base, base * 1.25, o.vol * 0.03, 0.01, 0.06);
      } else if (r < 0.75) {
        // La casserole qui frémit : quelques bulles
        const n = 3 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++)
          tone(
            o.ctx,
            o.dest,
            t + k * (0.07 + Math.random() * 0.12),
            "sine",
            260 + Math.random() * 120,
            520 + Math.random() * 200,
            o.vol * 0.035,
            0.005,
            0.05,
          );
      } else {
        // Une cuillère contre une tasse
        tone(o.ctx, o.dest, t, "triangle", 2900, 2880, o.vol * 0.03, 0.003, 0.3);
        tone(o.ctx, o.dest, t, "sine", 4150, 4120, o.vol * 0.015, 0.003, 0.22);
      }
    }
    if (o && this.kind === "jungle") {
      const t = o.ctx.currentTime + 0.02;
      const r = Math.random();
      if (r < 0.35) {
        // Un oiseau qui siffle deux notes, la seconde plus haute, avec un trille
        const f = 1400 + Math.random() * 900;
        tone(o.ctx, o.dest, t, "sine", f, f * 1.02, o.vol * 0.05, 0.02, 0.22);
        tone(o.ctx, o.dest, t + 0.3, "sine", f * 1.5, f * 1.45, o.vol * 0.05, 0.02, 0.3);
      } else if (r < 0.6) {
        // Un trille rapide
        const f = 2800 + Math.random() * 1200;
        for (let k = 0; k < 7; k++) tone(o.ctx, o.dest, t + k * 0.055, "sine", f, f * 0.9, o.vol * 0.035, 0.005, 0.04);
      } else if (r < 0.8) {
        // Un perroquet, au loin : un cri rauque
        tone(o.ctx, o.dest, t, "sawtooth", 900, 700, o.vol * 0.018, 0.01, 0.18);
        tone(o.ctx, o.dest, t + 0.22, "sawtooth", 1000, 760, o.vol * 0.015, 0.01, 0.15);
      } else {
        // Un singe qui appelle : des « hou » qui montent
        for (let k = 0; k < 4; k++) tone(o.ctx, o.dest, t + k * 0.28, "sine", 320 + k * 60, 420 + k * 70, o.vol * 0.05, 0.04, 0.2);
      }
    }
    if (o && this.kind === "lune") {
      // La base : un bip de radio, deux notes, de temps en temps une petite mélodie de télémétrie
      const t = o.ctx.currentTime + 0.02;
      if (Math.random() < 0.6) {
        tone(o.ctx, o.dest, t, "sine", 1320, 1320, o.vol * 0.025, 0.003, 0.08);
        tone(o.ctx, o.dest, t + 0.14, "sine", 990, 990, o.vol * 0.025, 0.003, 0.1);
      } else
        for (let k = 0; k < 5; k++) {
          const f = [880, 1175, 988, 1319, 1047][k]!;
          tone(o.ctx, o.dest, t + k * 0.09, "square", f, f, o.vol * 0.006, 0.002, 0.06);
        }
    }
    if (o && this.kind === "volcan") {
      const t = o.ctx.currentTime + 0.02;
      const r = Math.random();
      if (r < 0.55) {
        // La lave qui bouillonne : quelques « bloups » graves
        const n = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++)
          tone(
            o.ctx,
            o.dest,
            t + k * (0.15 + Math.random() * 0.2),
            "sine",
            90 + Math.random() * 50,
            180 + Math.random() * 80,
            o.vol * 0.06,
            0.01,
            0.12,
          );
      } else if (r < 0.8) {
        // Un sifflement de vapeur
        burst(o.ctx, o.dest, t, "bandpass", 2600, 0.8, o.vol * 0.04, 0.05, 0.9);
      } else {
        // Une explosion sourde, au loin
        tone(o.ctx, o.dest, t, "sine", 60, 32, o.vol * 0.12, 0.02, 1.2);
        burst(o.ctx, o.dest, t, "lowpass", 220, 0.7, o.vol * 0.08, 0.02, 1.0);
      }
    }
    if (o && this.kind === "horloger" && Math.random() < 0.3) {
      // Une horloge qui sonne, au loin : trois ou quatre notes de carillon
      const t = o.ctx.currentTime + 0.02;
      const notes = [659, 523, 587, 392];
      const n = 3 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        const f = notes[(k + Math.floor(Math.random() * 2)) % notes.length]!;
        tone(o.ctx, o.dest, t + k * 0.55, "sine", f, f, o.vol * 0.04, 0.005, 1.6);
        tone(o.ctx, o.dest, t + k * 0.55, "sine", f * 2.76, f * 2.76, o.vol * 0.012, 0.005, 0.8);
      }
    }
    this.timer = setTimeout(() => this.birds(), 1800 + Math.random() * 4200);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.ticker) clearInterval(this.ticker);
    try {
      this.wind?.src.stop();
      this.lfo?.stop();
      this.hum?.osc.stop();
      this.insects?.src.stop();
      this.insects?.lfo.stop();
    } catch {
      // déjà arrêté
    }
    this.wind = null;
  }
}
