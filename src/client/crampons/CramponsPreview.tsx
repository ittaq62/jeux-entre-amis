// L'illustration de Crampons sur l'accueil : une image du jeu lui-même, composée avec son moteur (DevAffiche) — un soir de
// match, la frappe du numéro 9 file en lucarne, le gardien s'envole. La 3D ne se charge qu'à table. Par-dessus, en SVG aux
// coordonnées de l'image (1200 × 900), ce qui vit : la foule qui saute, les flashs, le ballon qui tourne et l'air qu'il fend.

import type { CSSProperties } from "react";
import "./crampons.css";

const IMAGE = "/crampons-apercu.webp";
/** Le ballon sur l'image */
const BALL = { x: 635.5, y: 403, r: 18.5 };
/** D'où il vient (vers le buteur), et la perpendiculaire */
const BACK = { x: -0.49, y: 0.87 };
const SIDE = { x: 0.87, y: 0.49 };

// Des photographes dans les tribunes : chacun déclenche à son rythme, jamais sur les joueurs ni sur les banderoles
const FLASHES: [x: number, y: number, period: number, delay: number][] = [
  [62, 172, 4.1, -0.4],
  [150, 292, 5.3, -2.2],
  [236, 204, 3.7, -1.1],
  [302, 330, 4.9, -3.6],
  [346, 152, 5.9, -4.8],
  [548, 300, 4.4, -0.9],
  [612, 142, 3.3, -2.5],
  [690, 330, 5.1, -1.7],
  [736, 212, 4.6, -3.9],
  [822, 124, 3.9, -0.2],
  [862, 292, 5.6, -2.9],
  [946, 204, 4.2, -1.4],
  [1012, 334, 3.5, -2.0],
  [1082, 112, 5.0, -4.1],
  [1142, 252, 4.0, -3.2],
];

// La foule qui saute : les tribunes de l'affiche découpées en cases, chacune une copie de l'image qui sursaute de quelques
// pixels. Les cases voisines sautent presque ensemble (une onde qui traverse le stade) : pas de déchirure entre elles.
/** Le bas des banderoles, de gauche à droite : la foule commence dessous (les banderoles ne sautent pas) */
const BANNERS: [x: number, y: number][] = [
  [0, 137],
  [150, 127],
  [235, 118],
  [325, 112],
  [420, 100],
  [520, 92],
  [630, 78],
  [750, 57],
  [850, 48],
  [1000, 35],
  [1200, 25],
];
const bannerAt = (x: number) => {
  const i = Math.max(
    1,
    BANNERS.findIndex(([bx]) => bx >= x),
  );
  const [x0, y0] = BANNERS[i - 1]!;
  const [x1, y1] = BANNERS[i] ?? BANNERS.at(-1)!;
  return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
};
/**
 * Le bas de la foule, au moins un bond au-dessus de ce qui ne saute pas : la tête du 9 (y = 330), la barre du but
 * (y = 370), la tête du défenseur de gauche (y = 400). Sinon la case, en sautant, en ferait monter un morceau
 */
const crowdBottom = (x0: number, x1: number) => {
  const over = (a: number, b: number) => x1 > a && x0 < b;
  if (over(370, 510)) return 318;
  if (x1 > 585) return 358;
  if (over(280, 345)) return 390;
  return 400;
};
const HOP = 0.6;
const CROWD = Array.from({ length: 20 }, (_, c) => {
  const x = c * 60;
  const top = Math.ceil(Math.max(bannerAt(x), bannerAt(x + 60))) + 4;
  const bottom = crowdBottom(x, x + 60);
  const tiers = Math.ceil((bottom - top) / 80);
  return Array.from({ length: tiers }, (_, k) => {
    const y = top + ((bottom - top) * k) / tiers;
    const h = (bottom - top) / tiers;
    // Une onde qui traverse le stade de gauche à droite, un peu en biais ; la hauteur du saut varie doucement
    const cycles = ((x + 30) / 1200) * 0.9 + ((y + h / 2) / 400) * 0.25;
    return {
      x,
      y: Math.round(y),
      w: 60,
      h: Math.round(h),
      lift: (8 + Math.sin(x * 0.011) * 1.5).toFixed(1),
      delay: (-cycles * HOP).toFixed(3),
    };
  });
}).flat();

/** Les traits d'air derrière le ballon : décalés de `side` sur son flanc, longs de `length` */
const STREAKS = [
  { side: -10, length: 22, delay: -0.15 },
  { side: 0, length: 34, delay: 0 },
  { side: 10, length: 22, delay: -0.32 },
];

export function CramponsPreview() {
  return (
    <div className="crampons-preview">
      <div className="crampons-preview-frame">
        <img src={IMAGE} width={1200} height={900} alt="" loading="lazy" decoding="async" />
        <div className="cr-pv-crowd" aria-hidden="true">
          {CROWD.map(({ x, y, w, h, lift, delay }) => (
            <div
              key={`${x},${y}`}
              className="cr-pv-fans"
              style={{ "--x": x, "--y": y, "--w": w, "--h": h, "--lift": lift } as CSSProperties}
            >
              <i style={{ animationDelay: `${delay}s` }} />
            </div>
          ))}
        </div>
        <svg className="crampons-preview-life" viewBox="0 0 1200 900" aria-hidden="true">
          <defs>
            <radialGradient id="cr-pv-flash">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.35" stopColor="#f4f8ff" stopOpacity="0.8" />
              <stop offset="1" stopColor="#dfeaff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="cr-pv-ball-light" cx="0.36" cy="0.3" r="0.75">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="1" stopColor="#0b1020" stopOpacity="0.3" />
            </radialGradient>
            <clipPath id="cr-pv-ball">
              <circle cx={BALL.x} cy={BALL.y} r={BALL.r} />
            </clipPath>
          </defs>

          {FLASHES.map(([x, y, period, delay]) => (
            <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
              <g className="cr-pv-flash" style={{ animationDuration: `${period}s`, animationDelay: `${delay}s` }}>
                <circle r={24} fill="url(#cr-pv-flash)" />
                <path d="M-22 0H22M0-22V22" className="cr-pv-flash-star" />
                <circle r={4.6} fill="#ffffff" />
              </g>
            </g>
          ))}

          {STREAKS.map(({ side, length, delay }) => {
            const x1 = BALL.x + BACK.x * (BALL.r + 3) + SIDE.x * side;
            const y1 = BALL.y + BACK.y * (BALL.r + 3) + SIDE.y * side;
            return (
              <line
                key={side}
                className="cr-pv-streak"
                x1={x1}
                y1={y1}
                x2={x1 + BACK.x * length}
                y2={y1 + BACK.y * length}
                style={
                  {
                    animationDelay: `${delay}s`,
                    "--bx": `${(BACK.x * 12).toFixed(1)}px`,
                    "--by": `${(BACK.y * 12).toFixed(1)}px`,
                  } as CSSProperties
                }
              />
            );
          })}

          {/* Le ballon tourne sur lui-même ; la lumière, elle, reste où elle est */}
          <g clipPath="url(#cr-pv-ball)">
            <image className="cr-pv-spin" href={IMAGE} width={1200} height={900} style={{ transformOrigin: `${BALL.x}px ${BALL.y}px` }} />
            <circle cx={BALL.x} cy={BALL.y} r={BALL.r} fill="url(#cr-pv-ball-light)" />
          </g>
        </svg>
      </div>
    </div>
  );
}
