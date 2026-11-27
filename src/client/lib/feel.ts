// Les sensations de jeu, communes à tous les jeux : le téléphone qui vibre (Android seulement, selon le réglage
// « Vibrations »), la caméra qui tremble, l'action figée un instant sur un gros choc, un chiffre qui saute quand il
// change. Tout reste sobre ; « Effets réduits » (ou le réglage du système) coupe les secousses, les arrêts et les sauts.
//
// Usage :
//   buzz("impact");                         // un choc léger sous le doigt (ses propres coups seulement)
//   const shake = new Shake(0.03);          // jusqu'à 3 cm, dans l'unité de la scène
//   shake.add(0.6);                         // un gros choc
//   if (shake.offset(t, off)) camera.position.add(off); render(); camera.position.sub(off);
//   const stop = new HitStop();  stop.hit(60);  if (stop.frozen()) { /* ne pas avancer le jeu cette image */ }
//   const ref = usePop<HTMLSpanElement>(points);   // <span ref={ref} style="display:inline-block">{points}</span>

import { useEffect, useRef } from "react";
import { usePrefs } from "../stores/prefs.ts";
import { vibrate } from "./sound.ts";

/** « Effets réduits » sur le site, ou réduire les animations dans le système */
export function reducedFeel(): boolean {
  if (usePrefs.getState().reducedEffects) return true;
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Les motifs de vibration (ms) : un choc léger, un choc fort, une réussite, un échec, un tic */
export const BUZZ = {
  impact: [14],
  fort: [32],
  reussite: [18, 70, 36],
  echec: [45, 50, 80],
  tic: [8],
} as const satisfies Record<string, readonly number[]>;

let lastBuzz = 0;

/** Fait vibrer le téléphone (pas plus d'une fois par 90 ms : une casse fait des dizaines de chocs) */
export function buzz(kind: keyof typeof BUZZ) {
  const t = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (t - lastBuzz < 90) return;
  lastBuzz = t;
  vibrate([...BUZZ[kind]]);
}

/**
 * Une secousse de caméra : un « traumatisme » qui monte d'un coup et retombe en une demi-seconde environ ; le décalage
 * suit son carré (les petits chocs tremblent à peine) et un bruit doux, pas un tremblement au hasard image par image
 */
export class Shake {
  private trauma = 0;
  private last = 0;
  constructor(
    /** Le plus grand décalage, dans l'unité de la scène */
    private amplitude: number,
    /** Combien de traumatisme s'en va par seconde */
    private decay = 1.8,
  ) {}

  /** Un choc, de 0 à 1 */
  add(k: number) {
    if (reducedFeel()) return;
    this.trauma = Math.min(1, this.trauma + Math.max(0, k));
  }

  /** Le décalage à ajouter à la caméra pour cette image (t en secondes) ; faux s'il n'y en a pas */
  offset(t: number, out: { x: number; y: number; z: number }): boolean {
    const dt = Math.max(0, Math.min(0.1, t - this.last));
    this.last = t;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
    if (this.trauma <= 0) return false;
    const s = this.trauma * this.trauma * this.amplitude;
    const w = (a: number, b: number) => Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.7) * 0.4;
    out.x = s * w(37.1, 53.3);
    out.y = s * w(41.7, 29.9) * 0.6;
    out.z = s * w(47.3, 61.1);
    return true;
  }
}

/** Un arrêt sur impact : l'action figée quelques images (au plus 120 ms), le temps que le choc se sente */
export class HitStop {
  private until = 0;

  hit(ms: number, nowMs = performance.now()) {
    if (reducedFeel()) return;
    this.until = Math.max(this.until, nowMs + Math.min(120, Math.max(0, ms)));
  }

  frozen(nowMs = performance.now()): boolean {
    return nowMs < this.until;
  }
}

/** Fait sauter un élément (un chiffre qui vient de changer) ; il doit être en bloc ou en `inline-block` */
export function pop(el: Element, strength = 1) {
  if (reducedFeel() || typeof (el as HTMLElement).animate !== "function") return;
  const s = 1 + 0.28 * Math.max(0, Math.min(1.5, strength));
  (el as HTMLElement).animate([{ transform: "scale(1)" }, { transform: `scale(${s})`, offset: 0.35 }, { transform: "scale(1)" }], {
    duration: 360,
    easing: "cubic-bezier(.2,.9,.3,1.2)",
  });
}

/** Un élément qui saute chaque fois que `value` change (pas au premier affichage) */
export function usePop<T extends HTMLElement>(value: unknown, strength = 1) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (ref.current) pop(ref.current, strength);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
