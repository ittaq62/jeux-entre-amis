// Les sons de La Cour des Grands, fabriqués à la volée et menés par ce qui se passe : la cloche de Carillon, le chant
// du Tournesol (un petit air de xylophone dont le tempo suit la longueur du chant), sa tête qui pivote, la boule de
// peinture crachée et son « splatch », l'aiguille qui gratte le sablé, la fêlure, la corde, le plouf dans l'étang, la
// trappe et la piscine à balles, les billes de verre, les notes de la marelle, le canon à mousse, les plumes, les coups
// de polochon, la foule. Les corps frappés viennent de la boîte commune (lib/sfxKit.ts) ; tout passe par une petite
// salle, puis le limiteur commun, puis le réglage du son du site. La musique (des morceaux enregistrés) s'enchaîne en
// fondu selon l'étape : le thème à l'arrivée et au podium, un air pour les épreuves, un autre pour la finale, et la
// fanfare des chaises musicales, qui s'arrête net.

import { audioOut, effectsLevel, musicLevel, soundBuffer, unlockAudio } from "../lib/sound.ts";
import { BELL, DRUM, HARD_BALL, limiterOut, MARIMBA, METAL_BAR, PLASTIC, roomOut, strike, vary, WOOD, noiseBuffer } from "../lib/sfxKit.ts";
import { usePrefs } from "../stores/prefs.ts";

export function unlock() {
  unlockAudio();
}

function chain(ctx: AudioContext, master: GainNode): AudioNode {
  return roomOut(ctx, limiterOut(ctx, master, { input: 0.6 }), { rt60: 0.9, wet: 0.12 });
}

function out(): { ctx: AudioContext; dest: AudioNode; vol: number } | null {
  const vol = effectsLevel();
  if (vol <= 0) return null;
  const o = audioOut();
  if (!o) return null;
  if (o.ctx.state === "suspended") void o.ctx.resume();
  return { ctx: o.ctx, dest: chain(o.ctx, o.out), vol };
}

/** Du bruit filtré qui monte puis s'éteint : un souffle, une éclaboussure, un frottement */
function noise(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  o: { gain: number; dur: number; type?: BiquadFilterType; freq: number; to?: number; q?: number; attack?: number },
) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.8);
  src.stop(t + o.dur + 0.05);
}

/** Une note qui glisse (un sifflet, un « wouah », un plouf) */
function glide(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  o: { from: number; to: number; dur: number; gain: number; type?: OscillatorType; vibrato?: number },
) {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + 0.015);
  g.gain.setTargetAtTime(0.0001, t + o.dur * 0.6, o.dur * 0.25);
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibrato;
    const depth = ctx.createGain();
    depth.gain.value = o.from * 0.03;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.2);
  }
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + 0.3);
}

const NOTE = (n: number) => 440 * 2 ** (n / 12);
/** La gamme de la marelle : une gamme pentatonique de do, du grave à l'aigu (dix cases) */
const MARELLE_SCALE = [-9, -7, -5, -2, 0, 3, 5, 7, 10, 12];

/** La cloche de Carillon : une vraie cloche, deux fois (ding-dong) */
export function bell() {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime;
  strike(o.ctx, o.dest, t, BELL, 784, { gain: 0.35 * o.vol, velocity: 0.9, hardness: 6000 });
  strike(o.ctx, o.dest, t + 0.38, BELL, 659, { gain: 0.3 * o.vol, velocity: 0.8, hardness: 5000 });
}

export function ding() {
  const o = out();
  if (!o) return;
  strike(o.ctx, o.dest, o.ctx.currentTime, BELL, 1318, { gain: 0.18 * o.vol, velocity: 0.7, hardness: 8000 });
}

/** La révélation d'une épreuve : un arpège de xylophone qui monte, un coup de timbale, la cloche */
export function reveal() {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime;
  [0, 4, 7, 12, 16].forEach((n, k) => strike(o.ctx, o.dest, t + k * 0.075, MARIMBA, NOTE(n - 9), { gain: 0.3 * o.vol, velocity: 0.75 }));
  strike(o.ctx, o.dest, t + 0.42, DRUM, 70, { gain: 0.5 * o.vol, velocity: 0.9, hardness: 900 });
  noise(o.ctx, o.dest, t + 0.42, { gain: 0.12 * o.vol, dur: 1.6, type: "highpass", freq: 5000, attack: 0.01 });
}

/** Le roulement de tambour avant le bilan des éliminés */
export function drumroll() {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime;
  for (let k = 0; k < 34; k++) {
    const at = t + k * 0.034 + Math.random() * 0.006;
    noise(o.ctx, o.dest, at, { gain: (0.05 + (k / 34) * 0.08) * o.vol, dur: 0.06, freq: 2600, q: 0.7, attack: 0.002 });
  }
  strike(o.ctx, o.dest, t + 1.18, DRUM, 62, { gain: 0.5 * o.vol, velocity: 1, hardness: 800 });
  noise(o.ctx, o.dest, t + 1.18, { gain: 0.16 * o.vol, dur: 2.2, type: "highpass", freq: 4500, attack: 0.005 });
}

/** La petite fanfare du podium : trois accords de cuivres et la cymbale */
export function fanfare() {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime;
  const chords = [
    [0, 4, 7],
    [2, 5, 9],
    [4, 7, 12],
  ];
  chords.forEach((c, k) => c.forEach((n) => brass(o.ctx, o.dest, t + k * 0.32, NOTE(n - 5), k === 2 ? 1.4 : 0.26, 0.09 * o.vol)));
  noise(o.ctx, o.dest, t + 0.64, { gain: 0.18 * o.vol, dur: 2.4, type: "highpass", freq: 4000, attack: 0.004 });
}

/** Un cuivre : une scie filtrée qui s'ouvre puis se referme, un rien de vibrato */
function brass(ctx: AudioContext, dest: AudioNode, t: number, f: number, dur: number, gain: number) {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = vary(f, 0.003);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
  lp.frequency.exponentialRampToValueAtTime(1200, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
  osc.connect(lp).connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.5);
}

/** Moi, éliminé : le trombone qui descend (« wouah wouah ») */
export function eliminatedMe() {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime;
  [0, -1, -2, -3.5].forEach((n, k) => {
    const f = NOTE(n - 14);
    const at = t + k * 0.36;
    const osc = o.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f, at);
    if (k === 3) osc.frequency.exponentialRampToValueAtTime(f * 0.86, at + 0.9);
    const lp = o.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, at);
    lp.frequency.linearRampToValueAtTime(1500, at + 0.12);
    lp.frequency.linearRampToValueAtTime(600, at + 0.32);
    const g = o.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.12 * o.vol, at + 0.03);
    g.gain.setTargetAtTime(0.0001, at + (k === 3 ? 0.9 : 0.3), 0.06);
    osc.connect(lp).connect(g).connect(o.dest);
    osc.start(at);
    osc.stop(at + 1.4);
  });
}

/** La foule : des vagues de cris et d'applaudissements (du bruit découpé en mains qui claquent) */
function crowd(ctx: AudioContext, dest: AudioNode, t: number, gain: number, dur = 1.8) {
  for (let k = 0; k < 60; k++) {
    const at = t + Math.random() * dur;
    noise(ctx, dest, at, { gain: gain * (0.4 + Math.random() * 0.6), dur: 0.03, freq: 1200 + Math.random() * 2500, q: 1.2, attack: 0.001 });
  }
  noise(ctx, dest, t, { gain: gain * 0.6, dur: dur, freq: 700, q: 0.6, attack: 0.25 });
}

/** Un son d'épreuve, par son nom ; `rate` porte parfois une valeur (la longueur du chant, la case de la marelle) */
export function stageSound(name: string, opts: { gain?: number; at?: number; x?: number; z?: number; rate?: number }) {
  const o = out();
  if (!o) return;
  const { ctx, dest } = o;
  const t = ctx.currentTime + (opts.at ?? 0);
  const g = (opts.gain ?? 1) * o.vol;
  switch (name) {
    case "chant": {
      // « Un, deux, trois, Tour-ne-sol ! » au xylophone, la dernière note en cloche
      const len = Math.max(1.2, (opts.rate ?? 3000) / 1000);
      const notes = [7, 4, 7, 4, 0, 7];
      const at = [0, 0.2, 0.4, 0.62, 0.78, 0.92];
      notes.forEach((n, k) =>
        strike(ctx, dest, t + at[k]! * len, k === 5 ? BELL : MARIMBA, NOTE(n), { gain: (k === 5 ? 0.3 : 0.32) * g, velocity: 0.8 }),
      );
      break;
    }
    case "turn":
      noise(ctx, dest, t, { gain: 0.12 * g, dur: 0.5, freq: 300, to: 1200, q: 2 });
      strike(ctx, dest, t, WOOD, 160, { gain: 0.25 * g, velocity: 0.6, hardness: 1200 });
      break;
    case "look":
      strike(ctx, dest, t, DRUM, 55, { gain: 0.5 * g, velocity: 1, hardness: 700 });
      [0, 1, 6].forEach((n) =>
        glide(ctx, dest, t, { from: NOTE(n - 21), to: NOTE(n - 21), dur: 1.2, gain: 0.04 * g, type: "triangle", vibrato: 6 }),
      );
      break;
    case "spit":
      noise(ctx, dest, t, { gain: 0.25 * g, dur: 0.12, freq: 1800, to: 600, q: 1.5 });
      glide(ctx, dest, t, { from: 420, to: 180, dur: 0.12, gain: 0.12 * g });
      break;
    case "splat":
    case "pie":
      noise(ctx, dest, t, { gain: 0.4 * g, dur: 0.32, type: "lowpass", freq: 2400, to: 500, attack: 0.003 });
      strike(ctx, dest, t, DRUM, 90, { gain: 0.25 * g, velocity: 0.6, hardness: 500 });
      for (let k = 0; k < 6; k++)
        noise(ctx, dest, t + 0.05 + Math.random() * 0.25, { gain: 0.06 * g, dur: 0.04, freq: 1500 + Math.random() * 2000, q: 3 });
      break;
    case "ding":
      strike(ctx, dest, t, BELL, 1318, { gain: 0.18 * g, velocity: 0.7, hardness: 8000 });
      break;
    case "wah":
      eliminatedMe();
      break;
    case "tin":
      strike(ctx, dest, t, METAL_BAR, 1200, { gain: 0.12 * g, velocity: 0.6, hardness: 9000 });
      break;
    case "tinOpen":
      for (let k = 0; k < 4; k++)
        strike(ctx, dest, t + k * 0.05, METAL_BAR, vary(900, 0.2), { gain: 0.08 * g, velocity: 0.5, hardness: 8000 });
      break;
    case "scratch":
      noise(ctx, dest, t, { gain: 0.05 * g, dur: 0.07, type: "highpass", freq: 3500, attack: 0.004 });
      break;
    case "crack":
      strike(ctx, dest, t, WOOD, vary(1400, 0.2), { gain: 0.25 * g, velocity: 0.9, hardness: 9000, click: 0.8 });
      break;
    case "break":
      strike(ctx, dest, t, WOOD, 900, { gain: 0.45 * g, velocity: 1, hardness: 9000, click: 1 });
      for (let k = 0; k < 10; k++)
        strike(ctx, dest, t + 0.03 + Math.random() * 0.25, WOOD, vary(2200, 0.4), { gain: 0.06 * g, velocity: 0.4, hardness: 8000 });
      break;
    case "gong":
      strike(ctx, dest, t, METAL_BAR, 98, { gain: 0.45 * g, velocity: 1, hardness: 2500 });
      break;
    case "heave":
      strike(ctx, dest, t, DRUM, 80, { gain: 0.3 * g, velocity: 0.8, hardness: 900 });
      noise(ctx, dest, t, { gain: 0.05 * g, dur: 0.25, freq: 400, q: 4 });
      break;
    case "splashFoam":
      noise(ctx, dest, t, { gain: 0.35 * g, dur: 0.9, type: "lowpass", freq: 1500, to: 300, attack: 0.02 });
      crowd(ctx, dest, t + 0.2, 0.08 * g);
      break;
    case "whistle":
      glide(ctx, dest, t, { from: 2500, to: 2350, dur: 0.22, gain: 0.12 * g, vibrato: 32 });
      glide(ctx, dest, t + 0.28, { from: 2600, to: 2450, dur: 0.45, gain: 0.14 * g, vibrato: 32 });
      noise(ctx, dest, t, { gain: 0.03 * g, dur: 0.7, type: "highpass", freq: 6000 });
      break;
    case "tick":
      strike(ctx, dest, t, WOOD, 1800, { gain: 0.15 * g, velocity: 0.7, hardness: 7000 });
      break;
    case "slip":
      glide(ctx, dest, t, { from: 600, to: 200, dur: 0.25, gain: 0.08 * g, type: "triangle" });
      break;
    case "plouf":
      glide(ctx, dest, t, { from: 520, to: 110, dur: 0.22, gain: 0.3 * g });
      noise(ctx, dest, t + 0.03, { gain: 0.3 * g, dur: 0.6, type: "lowpass", freq: 1800, to: 400 });
      for (let k = 0; k < 8; k++)
        glide(ctx, dest, t + 0.1 + Math.random() * 0.5, { from: vary(1200, 0.4), to: vary(1800, 0.3), dur: 0.05, gain: 0.04 * g });
      break;
    case "pad":
      strike(ctx, dest, t, DRUM, 140, { gain: 0.2 * g, velocity: 0.5, hardness: 600 });
      noise(ctx, dest, t, { gain: 0.05 * g, dur: 0.12, type: "lowpass", freq: 900 });
      break;
    case "cheer":
      crowd(ctx, dest, t, 0.1 * g, 2.4);
      break;
    case "chairsMusic":
      chairsMusic(true);
      break;
    case "chairsStop":
      chairsMusic(false);
      noise(ctx, dest, t, { gain: 0.15 * g, dur: 0.35, freq: 2000, to: 200, q: 3 });
      break;
    case "sit":
      strike(ctx, dest, t, WOOD, 220, { gain: 0.3 * g, velocity: 0.8, hardness: 2500 });
      break;
    case "trapdoor":
      strike(ctx, dest, t, WOOD, 180, { gain: 0.4 * g, velocity: 1, hardness: 3000 });
      noise(ctx, dest, t + 0.05, { gain: 0.15 * g, dur: 0.4, freq: 800, to: 200, q: 1 });
      for (let k = 0; k < 24; k++)
        strike(ctx, dest, t + 0.35 + Math.random() * 0.5, PLASTIC, vary(700, 0.3), { gain: 0.08 * g, velocity: 0.5, hardness: 5000 });
      break;
    case "flick":
      strike(ctx, dest, t, HARD_BALL, 2600, { gain: 0.25 * g, velocity: 0.8, hardness: 9000 });
      break;
    case "clack":
      strike(ctx, dest, t, HARD_BALL, vary(3200, 0.08), { gain: 0.3 * g, velocity: 0.9, hardness: 10000 });
      break;
    case "pot":
      strike(ctx, dest, t, WOOD, 320, { gain: 0.3 * g, velocity: 0.7, hardness: 1800 });
      strike(ctx, dest, t + 0.09, HARD_BALL, 2200, { gain: 0.12 * g, velocity: 0.5 });
      break;
    case "slime": {
      noise(ctx, dest, t, { gain: 0.35 * g, dur: 0.6, type: "lowpass", freq: 900, to: 250, attack: 0.01 });
      glide(ctx, dest, t, { from: 240, to: 90, dur: 0.5, gain: 0.12 * g, type: "triangle", vibrato: 14 });
      break;
    }
    case "note": {
      const c = Math.max(0, Math.min(9, Math.round(opts.rate ?? 0)));
      strike(ctx, dest, t, MARIMBA, NOTE(MARELLE_SCALE[c]!), { gain: 0.32 * g, velocity: 0.85 });
      break;
    }
    case "cannon":
      strike(ctx, dest, t, DRUM, 60, { gain: 0.4 * g, velocity: 1, hardness: 600 });
      noise(ctx, dest, t, { gain: 0.3 * g, dur: 1.0, type: "lowpass", freq: 3000, to: 600, attack: 0.01 });
      break;
    case "hop":
      strike(ctx, dest, t, DRUM, 120, { gain: 0.15 * g, velocity: 0.4, hardness: 500 });
      break;
    case "feathers":
      for (let k = 0; k < 10; k++) noise(ctx, dest, t + k * 0.03, { gain: 0.08 * g, dur: 0.06, freq: 2500 + Math.random() * 2000, q: 1 });
      glide(ctx, dest, t, { from: 900, to: 1400, dur: 0.18, gain: 0.05 * g, type: "square" });
      break;
    case "whoosh":
    case "swing":
      noise(ctx, dest, t, { gain: 0.18 * g, dur: 0.28, freq: 600, to: 2400, q: 1.5, attack: 0.05 });
      break;
    case "thump":
      strike(ctx, dest, t, DRUM, 95, { gain: 0.45 * g, velocity: 0.9, hardness: 500 });
      noise(ctx, dest, t, { gain: 0.2 * g, dur: 0.2, type: "lowpass", freq: 1200 });
      crowd(ctx, dest, t + 0.05, 0.05 * g, 0.8);
      break;
    case "parry":
      strike(ctx, dest, t, DRUM, 160, { gain: 0.3 * g, velocity: 0.9, hardness: 1500 });
      noise(ctx, dest, t, { gain: 0.12 * g, dur: 0.12, freq: 1800, q: 1 });
      break;
    case "creak":
      glide(ctx, dest, t, { from: 120, to: 90, dur: 0.8, gain: 0.08 * g, type: "sawtooth", vibrato: 22 });
      break;
  }
}

// ---------------------------------------------------------------------------
// La musique
// ---------------------------------------------------------------------------

/** Les morceaux, et leur boucle (secondes) : chacun a une seconde de recouvrement au début */
const TRACKS: Record<string, { file: string; level: number }> = {
  theme: { file: "cour-theme.mp3", level: 0.32 },
  jeu: { file: "cour-jeu.mp3", level: 0.24 },
  finale: { file: "cour-finale.mp3", level: 0.28 },
  chaises: { file: "cour-chaises.mp3", level: 0.36 },
};

let current: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let wanted: string | null = null;
let unsub: (() => void) | null = null;

function play(name: string | null) {
  wanted = name;
  const o = audioOut();
  if (!o) return;
  if (current && current.name === name) return;
  // Le morceau d'avant s'éteint en fondu
  if (current) {
    const old = current;
    old.gain.gain.setTargetAtTime(0, o.ctx.currentTime, name === null || name === "chaises-stop" ? 0.03 : 0.5);
    old.src.stop(o.ctx.currentTime + 2);
    current = null;
  }
  if (!name || !TRACKS[name]) return;
  const track = TRACKS[name]!;
  void soundBuffer(track.file).then((buf) => {
    if (!buf || wanted !== name || (current && current.name === name)) return;
    const { ctx, out: master } = o;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 1;
    src.loopEnd = buf.duration;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setTargetAtTime(musicLevel() * track.level, ctx.currentTime, 0.6);
    src.connect(gain).connect(master);
    src.start(ctx.currentTime, name === "chaises" ? Math.random() * 6 : 0);
    current = { name, src, gain };
  });
  unsub ??= usePrefs.subscribe(() => {
    const c = current;
    if (c) c.gain.gain.setTargetAtTime(musicLevel() * (TRACKS[c.name]?.level ?? 0.3), c.src.context.currentTime, 0.3);
  });
}

/** Les chaises : la fanfare part avec la manche, et s'arrête net (le signal de l'épreuve) */
function chairsMusic(on: boolean) {
  play(on ? "chaises" : null);
}

/** La musique qui va avec l'étape de la partie */
export function musicFor(phase: string, ep: string | null) {
  if (phase === "intro" || phase === "podium" || phase === "over" || phase === "ff") return play("theme");
  if (ep === "chaises" && phase === "play") return;
  if (ep === "polochons") return play("finale");
  if (phase === "reveal" || phase === "play" || phase === "results") return play("jeu");
}

export function stopMusic() {
  play(null);
  unsub?.();
  unsub = null;
}
