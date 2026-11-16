// L'illustration de Culbute sur l'accueil : une image du jeu lui-même, mise en scène avec son moteur et sa 3D (la page de
// travail /dev/culbute) — sur la place du village, sous le kiosque, Ginette envoie Marcel valser d'un revers de sac ; Huguette
// saute du banc, aiguilles en avant, Raymond vise depuis l'autre banc. Lumière de fin d'après-midi, le village au loin un peu
// flou. Deux cadrages : large pour la bande des tablettes et des téléphones, haut pour l'ordinateur (le navigateur ne charge
// que le sien, et seulement près de l'écran). La 3D ne se charge qu'à table.
//
// Par-dessus, en SVG au repère de chaque image (calé comme object-fit: cover), ce qui vit : l'éclat du coup qui palpite, son
// onde, les traits de vitesse derrière Marcel ; et la caméra s'approche lentement de l'action (culbutePreview.css).

import "./culbute.css";
import "./culbutePreview.css";

interface Poster {
  src: string;
  w: number;
  h: number;
  /** Le coup et Marcel en vol, sur l'image */
  hit: [number, number];
  fly: [number, number];
  /** Un mètre de l'arène, en pixels de l'image */
  unit: number;
}

const WIDE: Poster = {
  src: "/culbute-affiche-large.webp",
  w: 1600,
  h: 800,
  hit: [826, 512],
  fly: [952, 312],
  unit: 142.5,
};
const TALL: Poster = { src: "/culbute-affiche-haute.webp", w: 1000, h: 1075, hit: [532, 765], fly: [660, 548], unit: 161.5 };
/** À partir de cette largeur, la fiche a deux colonnes et le décor est haut (app.css) */
const TALL_FROM = "(min-width: 821px)";

/** Une étoile à `n` branches */
function star(cx: number, cy: number, outer: number, inner: number, n: number, turn = 0): string {
  return (
    Array.from({ length: n * 2 }, (_, i) => {
      const a = turn + (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? outer : inner;
      return `${i === 0 ? "M" : "L"}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
    }).join("") + "Z"
  );
}

function Life({ p, className }: { p: Poster; className: string }) {
  const [hx, hy] = p.hit;
  const [fx, fy] = p.fly;
  const u = p.unit;
  // Le sens du vol de Marcel, et la perpendiculaire, pour les traits de vitesse
  const dx = fx - hx;
  const dy = fy - hy;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const streaks = [-0.32, -0.1, 0.14, 0.34].map((side, i) => {
    const sx = fx - ux * u * (0.55 + (i % 2) * 0.12) - uy * side * u;
    const sy = fy - uy * u * (0.55 + (i % 2) * 0.12) + ux * side * u;
    const l = u * (0.75 + ((i * 37) % 5) * 0.1);
    return { x1: sx, y1: sy, x2: sx - ux * l, y2: sy - uy * l, d: -i * 0.17 };
  });
  return (
    <svg className={`cb-pv-life ${className}`} viewBox={`0 0 ${p.w} ${p.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`cb-pv-glow-${className}`}>
          <stop offset="0" stopColor="#fffbe6" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffd86a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff9a3a" stopOpacity="0" />
        </radialGradient>
      </defs>
      {streaks.map((s, i) => (
        <line
          key={i}
          className="cb-pv-streak"
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          strokeWidth={u * 0.035}
          style={{ animationDelay: `${s.d}s` }}
        />
      ))}
      <g transform={`translate(${hx} ${hy})`}>
        <circle className="cb-pv-wave" r={u * 0.55} strokeWidth={u * 0.035} />
        <g className="cb-pv-burst">
          <circle r={u * 0.62} fill={`url(#cb-pv-glow-${className})`} />
          <path d={star(0, 0, u * 0.5, u * 0.2, 9, -0.3)} className="cb-pv-star-out" />
          <path d={star(0, 0, u * 0.3, u * 0.13, 9, -0.1)} className="cb-pv-star-in" />
        </g>
      </g>
    </svg>
  );
}

export function CulbutePreview() {
  return (
    <div className="cb-preview">
      <div className="cb-preview-frame">
        <picture>
          <source media={TALL_FROM} srcSet={TALL.src} width={TALL.w} height={TALL.h} />
          <img src={WIDE.src} width={WIDE.w} height={WIDE.h} alt="" loading="lazy" decoding="async" />
        </picture>
        <Life p={WIDE} className="is-wide" />
        <Life p={TALL} className="is-tall" />
      </div>
    </div>
  );
}
