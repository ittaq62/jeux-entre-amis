// Ce que vit un joueur dans les premières secondes d'une partie : le temps de la première image après le départ, et les
// images lentes des dix premières secondes (plus de 50 ms : un à-coup qu'on voit). Pour comparer, sur un vrai
// téléphone comme sur ordinateur : un petit panneau s'affiche avec « ?perf » dans l'adresse (ou une fois ouvert ainsi,
// jusqu'à « ?perf=0 »).

import { useSyncExternalStore } from "react";

export interface FirstSeconds {
  game: string;
  /** Du départ à la première image dessinée */
  firstFrameMs: number | null;
  /** Les images de plus de 50 ms (des à-coups) */
  slow: number;
  /** La plus longue image */
  worst: number;
  frames: number;
  /** Fini (les dix secondes sont passées) */
  done: boolean;
}

const SLOW_MS = 50;
const KEY = "tablee:perf";
let current: FirstSeconds | null = null;
const listeners = new Set<() => void>();
/** Un nouvel instantané à chaque nouvelle (React compare les objets, pas leur contenu) */
const publish = (r: FirstSeconds) => {
  current = { ...r };
  listeners.forEach((l) => l());
};

/** Le panneau des premières secondes est-il voulu (« ?perf » dans l'adresse, retenu sur cet appareil) */
export function perfPanelOn(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("perf");
  try {
    if (q !== null) localStorage.setItem(KEY, q === "0" ? "0" : "1");
    return localStorage.getItem(KEY) === "1";
  } catch {
    return q !== null && q !== "0";
  }
}

/**
 * Le départ d'une partie, maintenant : on compte jusqu'à la première image, puis les à-coups des secondes qui suivent.
 * Renvoie de quoi arrêter (en quittant la partie avant la fin).
 */
export function watchFirstSeconds(game: string, seconds = 10): () => void {
  const t0 = performance.now();
  let last = 0;
  let raf = 0;
  const report: FirstSeconds = { game, firstFrameMs: null, slow: 0, worst: 0, frames: 0, done: false };
  publish(report);
  // L'heure prise à l'appel (celle que donne requestAnimationFrame peut précéder le départ)
  const step = () => {
    const t = performance.now();
    if (report.firstFrameMs === null) report.firstFrameMs = Math.round(t - t0);
    else {
      const dt = t - last;
      report.frames++;
      if (dt > SLOW_MS) report.slow++;
      report.worst = Math.max(report.worst, Math.round(dt));
    }
    last = t;
    if (t - t0 >= seconds * 1000) {
      report.done = true;
      if (import.meta.env.DEV) console.info(`[premières secondes] ${game}`, { ...report });
      publish(report);
      return;
    }
    if (report.frames % 15 === 0) publish(report);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Les chiffres de la dernière partie partie (et ceux qui arrivent) */
export function useFirstSeconds(): FirstSeconds | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
