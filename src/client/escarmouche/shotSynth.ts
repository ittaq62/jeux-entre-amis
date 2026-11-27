// La détonation d'une arme, calculée échantillon par échantillon (sans navigateur : on peut la mesurer). Rien qui
// chante : une vraie détonation est du bruit. Le souffle de la bouche du canon (un bruit large, très bref), le corps
// (un grave sans note : du bruit filtré bas), le claquement de la balle qui passe le mur du son (une onde en N, pour
// les fusils), la culasse qui revient d'elle-même (quelques modes métalliques inharmoniques, très brefs), l'écho du
// décor (une queue de bruit qui s'éteint et deux échos sur les façades), et un léger écrêtage, comme un micro qui
// sature. Chaque variante tire un peu autrement (le hasard de ses réglages et de son bruit).

import type { WeaponId } from "../../shared/games/escarmouche/weapons.ts";

export interface ShotSpec {
  /** Le corps : un bruit filtré sous cette fréquence (Hz), qui s'éteint en `bodyDecay` (s) */
  body: number;
  bodyDecay: number;
  /** Le souffle : un bruit large coupé au-dessus de `cut` (Hz), qui s'éteint en `noiseDecay` (s) */
  noiseDecay: number;
  cut: number;
  /** La queue : l'écho du décor (s) */
  tail: number;
  /** Le claquement de la balle supersonique (de 0 à 1) */
  crack: number;
  /** La culasse qui revient d'elle-même, si l'arme le fait : quand (s) ; 0 sinon */
  mech: number;
  /** Le niveau de l'arme, les unes par rapport aux autres */
  gain: number;
}

export const SHOTS: Record<WeaponId, ShotSpec> = {
  fa: { body: 210, bodyDecay: 0.07, noiseDecay: 0.05, cut: 5200, tail: 0.45, crack: 0.5, mech: 0.028, gain: 0.9 },
  pm: { body: 280, bodyDecay: 0.05, noiseDecay: 0.035, cut: 6200, tail: 0.3, crack: 0, mech: 0.022, gain: 0.75 },
  pompe: { body: 140, bodyDecay: 0.13, noiseDecay: 0.1, cut: 3200, tail: 0.75, crack: 0, mech: 0, gain: 1 },
  precision: { body: 180, bodyDecay: 0.1, noiseDecay: 0.06, cut: 7000, tail: 1.1, crack: 0.9, mech: 0, gain: 1 },
  pistolet: { body: 320, bodyDecay: 0.05, noiseDecay: 0.04, cut: 5600, tail: 0.32, crack: 0, mech: 0.018, gain: 0.7 },
  carabine: { body: 190, bodyDecay: 0.09, noiseDecay: 0.055, cut: 6400, tail: 0.8, crack: 0.75, mech: 0.03, gain: 0.95 },
  fm: { body: 200, bodyDecay: 0.08, noiseDecay: 0.06, cut: 4600, tail: 0.5, crack: 0.45, mech: 0.03, gain: 0.95 },
  mitraillette: { body: 300, bodyDecay: 0.04, noiseDecay: 0.03, cut: 6800, tail: 0.25, crack: 0, mech: 0.02, gain: 0.7 },
  rafale: { body: 220, bodyDecay: 0.065, noiseDecay: 0.045, cut: 5600, tail: 0.42, crack: 0.55, mech: 0.026, gain: 0.85 },
  double: { body: 130, bodyDecay: 0.15, noiseDecay: 0.11, cut: 3000, tail: 0.85, crack: 0, mech: 0, gain: 1 },
  revolver: { body: 240, bodyDecay: 0.09, noiseDecay: 0.06, cut: 4800, tail: 0.6, crack: 0, mech: 0, gain: 0.9 },
  pa: { body: 340, bodyDecay: 0.04, noiseDecay: 0.03, cut: 6000, tail: 0.25, crack: 0, mech: 0.016, gain: 0.65 },
};

/** Combien de façons de tirer chaque arme a (on en prend une au hasard à chaque coup) */
export const SHOT_VARIANTS = 3;

function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

const lowK = (fc: number, sr: number) => 1 - Math.exp((-2 * Math.PI * fc) / sr);

/** L'écart type d'un bruit blanc uniforme passé dans `poles` filtres passe-bas d'un pôle de coefficient `k` (à peu près) */
const lowRms = (k: number, poles: number) => Math.sqrt(1 / 3) * Math.pow(k / (2 - k), poles * 0.5) * (poles > 1 ? 1.25 : 1);

/**
 * Les échantillons d'une détonation (non normalisés) : de près, ou de loin (`far` : le grave et l'écho, plus de
 * claquement ni de culasse). `variant` change le hasard.
 */
export function shotSamples(spec: ShotSpec, far: boolean, variant: number, sr: number): Float32Array {
  const len = spec.tail + (far ? 0.5 : 0.22);
  const out = new Float32Array(Math.max(1, Math.floor(len * sr)));
  const n = noise((far ? 77 : 13) + variant * 7919 + Math.round(spec.cut));
  const r = noise(4049 + variant * 131 + Math.round(spec.body));
  const jit = (x: number, p = 0.06) => x * (1 + r() * p);

  const cut = jit(far ? 1100 : spec.cut * 0.85);
  const kCut = lowK(cut, sr);
  const kLow = lowK(far ? 120 : 320, sr);
  const kBody = lowK(jit(spec.body, 0.08), sr);
  const kTail = lowK(far ? 650 : 1500, sr);
  const blastDecay = jit(spec.noiseDecay) * (far ? 1.6 : 1);
  const bodyDecay = jit(spec.bodyDecay) * (far ? 1.4 : 1);
  const tailDecay = jit(spec.tail * 0.35, 0.1);
  const bodyNorm = 1 / lowRms(kBody, 2);
  const blastNorm = 1 / Math.sqrt(Math.max(1e-6, lowRms(kCut, 1) ** 2 - lowRms(kLow, 1) ** 2));
  const tailNorm = 1 / lowRms(kTail, 2);
  const crack = far ? 0 : spec.crack * jit(1, 0.15);
  // La culasse : trois modes d'une pièce d'acier, un peu désaccordés à chaque variante
  const mechAt = far || spec.mech <= 0 ? -1 : jit(spec.mech, 0.12);
  const modes = [2300, 3650, 5300].map((f) => jit(f, 0.05));

  const direct = new Float32Array(out.length);
  let a = 0;
  let low = 0;
  let b1 = 0;
  let b2 = 0;
  let t1 = 0;
  let t2 = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const w = n();
    // Le souffle : bruit large (ce qui reste entre le grave et `cut`), attaque d'un tiers de milliseconde
    a += kCut * (w - a);
    low += kLow * (a - low);
    const blast = (a - low) * blastNorm * Math.min(1, t / 0.0003) * Math.exp(-t / blastDecay);
    // Le corps : le même bruit, filtré bas deux fois (aucune note), qui monte en une milliseconde
    b1 += kBody * (w - b1);
    b2 += kBody * (b1 - b2);
    const body = b2 * bodyNorm * Math.min(1, t / 0.001) * Math.exp(-t / bodyDecay);
    // Le claquement supersonique : une onde en N d'une milliseconde, juste avant le reste
    let n1 = 0;
    if (crack > 0 && t < 0.0011) n1 = (t < 0.00055 ? 1 : -1) * crack * 2.2 * Math.sin((Math.PI * t) / 0.0011);
    // La culasse qui revient : un choc d'acier, bref
    let mech = 0;
    if (mechAt > 0 && t >= mechAt) {
      const u = t - mechAt;
      if (u < 0.08) {
        for (let j = 0; j < modes.length; j++)
          mech += (Math.sin(2 * Math.PI * modes[j]! * u) * Math.exp(-u / (0.014 / (1 + j * 0.6)))) / (1 + j * 0.7);
        mech = mech * 0.14 + w * 0.12 * Math.exp(-u / 0.002);
      }
    }
    direct[i] = blast * (far ? 0.5 : 1.6) + body * (far ? 1.1 : 0.7) + n1 + mech;
    // La queue : le décor qui renvoie, sourd, qui monte en 15 ms et s'éteint
    t1 += kTail * (w - t1);
    t2 += kTail * (t1 - t2);
    out[i] = t2 * tailNorm * (far ? 0.4 : 0.22) * Math.min(1, t / 0.015) * Math.exp(-t / tailDecay);
  }
  // Deux échos sur les façades : le coup direct, plus tard, assourdi
  const echoes: [number, number][] = far
    ? [
        [jit(0.17, 0.2), 0.45],
        [jit(0.36, 0.2), 0.25],
      ]
    : [
        [jit(0.085, 0.25), 0.2],
        [jit(0.19, 0.25), 0.1],
      ];
  for (const [delay, level] of echoes) {
    const off = Math.floor(delay * sr);
    const k = lowK(far ? 500 : 1400, sr);
    let e = 0;
    for (let i = off; i < out.length; i++) {
      e += k * (direct[i - off]! - e);
      out[i]! += e * level;
    }
  }
  for (let i = 0; i < out.length; i++) out[i]! += direct[i]!;
  // Un léger écrêtage, comme un micro qui sature : le coup tient sa place sans pointe isolée
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]!));
  const drive = 1.8 / Math.max(1e-6, peak);
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]! * drive);
  return out;
}
