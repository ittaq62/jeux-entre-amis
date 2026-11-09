// L'huile sur l'écran, quand on glisse dans une flaque : quelques grosses éclaboussures noires et brillantes, qui
// laissent voir le milieu de la route et coulent vers le bas.

import { useMemo } from "react";

/** Un petit hasard répétable : les taches ont toujours la même allure */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Le contour d'une éclaboussure : un rond bosselé, hérissé de quelques gouttes */
export function splatPath(cx: number, cy: number, r: number, seed: number): string {
  const rnd = random(seed);
  const count = 22;
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const spike = i % 4 === 1 ? 1.25 + rnd() * 0.5 : 0.78 + rnd() * 0.2;
    points.push([cx + Math.cos(a) * r * spike, cy + Math.sin(a) * r * spike * 0.92]);
  }
  const mid = (a: [number, number], b: [number, number]) => `${((a[0] + b[0]) / 2).toFixed(1)} ${((a[1] + b[1]) / 2).toFixed(1)}`;
  let d = `M${mid(points[count - 1]!, points[0]!)}`;
  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${mid(p, points[(i + 1) % count]!)}`;
  }
  return `${d}Z`;
}

/** Où tombent les taches : autour du milieu de l'écran, qu'on voie encore où on va ([x, y, rayon, longueur de la coulure]) */
const SPLATS = [
  [27, 22, 12, 17],
  [134, 19, 10, 13],
  [15, 66, 7, 9],
  [146, 62, 8, 11],
  [84, 7, 5, 7],
  [50, 73, 3.4, 5],
  [112, 76, 2.8, 4],
] as const;

export function OilSplats() {
  const shapes = useMemo(
    () =>
      SPLATS.map(([x, y, r, drip], i) => ({
        blob: splatPath(x, y, r, 91 + i * 37),
        drip: `M${(x + r * 0.2).toFixed(1)} ${y}h${(r * 0.32).toFixed(1)}v${drip}a${(r * 0.16).toFixed(1)} ${(r * 0.16).toFixed(1)} 0 0 1 ${(-r * 0.32).toFixed(1)} 0z`,
        x,
        y,
        r,
      })),
    [],
  );
  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {shapes.map((s, i) => (
        <g key={i}>
          <path d={s.drip} fill="#120d1a" />
          <path d={s.blob} fill="#120d1a" stroke="#6a35b8" strokeWidth="0.45" />
          <ellipse
            cx={s.x - s.r * 0.3}
            cy={s.y - s.r * 0.34}
            rx={s.r * 0.3}
            ry={s.r * 0.12}
            fill="#eaf2ff"
            opacity="0.62"
            transform={`rotate(-24 ${s.x} ${s.y})`}
          />
        </g>
      ))}
    </svg>
  );
}
