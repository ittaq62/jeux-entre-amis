// Le geste du bowling, tel que la main fantôme du coach le mime sur la vraie commande (runtime.ts : la boule à saisir
// à GRIP_Y, se placer en bas sur les côtés, viser en haut). D'abord le lancer, l'essentiel ; puis, pour qui attend
// encore, se placer et viser.

import type { CoachStep } from "../lib/coach.tsx";
import { buzz } from "../lib/feel.ts";
import type { Moment } from "./runtime.ts";

const GRIP = { x: 0.5, y: 0.6 };

export const BOWLING_COACH: readonly CoachStep[] = [
  {
    say: "Appuie sur la boule, recule, puis pousse d'un coup vers le haut et lâche",
    path: [
      { x: GRIP.x, y: GRIP.y, t: 0 },
      { x: GRIP.x, y: GRIP.y, t: 450, down: true },
      { x: GRIP.x, y: GRIP.y + 0.24, t: 1150, down: true },
      { x: GRIP.x, y: GRIP.y + 0.24, t: 1400, down: true },
      { x: GRIP.x, y: GRIP.y - 0.3, t: 1640, down: true },
      { x: GRIP.x, y: GRIP.y - 0.36, t: 1850 },
    ],
  },
  {
    say: "Glisse en bas, sur le côté, pour te placer",
    path: [
      { x: 0.2, y: 0.82, t: 0 },
      { x: 0.2, y: 0.82, t: 350, down: true },
      { x: 0.28, y: 0.82, t: 950, down: true },
      { x: 0.14, y: 0.82, t: 1700, down: true },
      { x: 0.2, y: 0.82, t: 2200, down: true },
      { x: 0.2, y: 0.8, t: 2400 },
    ],
  },
  {
    say: "Glisse en haut pour viser",
    path: [
      { x: 0.5, y: 0.24, t: 0 },
      { x: 0.5, y: 0.24, t: 350, down: true },
      { x: 0.58, y: 0.24, t: 950, down: true },
      { x: 0.43, y: 0.24, t: 1700, down: true },
      { x: 0.5, y: 0.24, t: 2200, down: true },
      { x: 0.5, y: 0.22, t: 2400 },
    ],
  },
];

/**
 * De courtes vibrations sur son propre lancer (Android, réglage « Vibrations », avec la boîte commune lib/feel.ts) : la
 * boule qui entre dans les quilles (plus fort sur un strike), puis une petite réussite pour le strike, un échec pour la
 * rigole
 */
export function bowlingHaptics(m: Moment, me: string | null) {
  if (!me) return;
  if (m.k === "impact" && m.id === me) buzz(m.strike ? "fort" : "impact");
  else if (m.k === "result" && m.rec.id === me) {
    if (m.rec.rack.length === 10 && m.rec.down.length === 10) buzz("reussite");
    else if (m.rec.gutter && m.rec.down.length === 0) buzz("echec");
  }
}
