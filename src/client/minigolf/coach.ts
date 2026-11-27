// Le geste du minigolf, tel que la main fantôme du coach (lib/coach.tsx) le mime sur la vraie commande : attraper sa
// balle (aux deux tiers de la hauteur, au milieu : là où la caméra la pose quand on vise), la tirer vers soi et lâcher ;
// puis, pour qui attend encore, glisser ailleurs pour tourner la vue.

import type { CoachStep } from "../lib/coach.tsx";

const BALL = { x: 0.5, y: 0.67 };

export const MINIGOLF_COACH: readonly CoachStep[] = [
  {
    say: "Attrape ta balle et tire-la vers toi, puis lâche pour frapper",
    path: [
      { x: BALL.x, y: BALL.y, t: 0 },
      { x: BALL.x, y: BALL.y, t: 450, down: true },
      { x: BALL.x + 0.02, y: BALL.y + 0.17, t: 1250, down: true },
      { x: BALL.x + 0.02, y: BALL.y + 0.17, t: 1550, down: true },
      { x: BALL.x + 0.02, y: BALL.y + 0.17, t: 1700 },
    ],
  },
  {
    say: "Glisse ailleurs sur l'écran pour tourner la vue et viser",
    path: [
      { x: 0.35, y: 0.4, t: 0 },
      { x: 0.35, y: 0.4, t: 350, down: true },
      { x: 0.62, y: 0.4, t: 1100, down: true },
      { x: 0.45, y: 0.4, t: 1800, down: true },
      { x: 0.45, y: 0.4, t: 2000 },
    ],
  },
];
