// L'illustration d'Escarmouche sur l'accueil : le lever du jour sur le Hameau. Le soleil sort derrière le clocher, la fumée
// monte du village et de la gare de triage, une fusée éclairante descend sous son parachute ; au premier plan, une section
// avance à contre-jour : l'un vise à genoux derrière des sacs de sable sous un filet de camouflage, un autre court, le
// dernier montre le village. Tout est dessiné (SVG) : la 3D ne se charge qu'à table. Ce qui bouge (fumée, brume, rayons,
// poussière, fusée) est en CSS dans escarmouchePreview.css, et s'arrête avec le reste des décors (banners.css).
//
// Le dessin est plus grand que ce qu'on montre : le cadre garde toujours l'essentiel (la section et le clocher) et montre
// autour ce que sa forme permet, du cadre haut de l'ordinateur à la bande très large de la tablette.

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./escarmouche.css";
import "./escarmouchePreview.css";

/** L'essentiel, toujours visible, et ce qu'on aime montrer autour quand le cadre le permet (repère du dessin) */
const FOCUS = { x: 548, y: 404, w: 600, h: 556 };
const ROOM = { x: 270, y: 150, w: 1140, h: 850 };
/** Le soleil, derrière le village : il donne le liseré de lumière sur les silhouettes */
const SUN = { x: 930, y: 586 };
const HORIZON = 624;

/** Le morceau du dessin à montrer dans un cadre de ce format (largeur / hauteur) */
export function frameFor(aspect: number): string {
  let w: number;
  let h: number;
  if (ROOM.w / ROOM.h > aspect) {
    h = ROOM.h;
    w = h * aspect;
  } else {
    w = ROOM.w;
    h = w / aspect;
  }
  if (w < FOCUS.w || h < FOCUS.h) {
    if (FOCUS.w / FOCUS.h > aspect) {
      w = FOCUS.w;
      h = w / aspect;
    } else {
      h = FOCUS.h;
      w = h * aspect;
    }
  }
  let x = FOCUS.x + FOCUS.w / 2 - w / 2;
  if (w <= ROOM.w) x = Math.min(Math.max(x, ROOM.x), ROOM.x + ROOM.w - w);
  x = Math.max(Math.min(x, FOCUS.x), FOCUS.x + FOCUS.w - w);
  let y = ROOM.y + ROOM.h - h;
  y = Math.max(Math.min(y, FOCUS.y), FOCUS.y + FOCUS.h - h);
  return [x, y, w, h].map((v) => v.toFixed(1)).join(" ");
}

// ---------------------------------------------------------------------------
// De petits outils de dessin
// ---------------------------------------------------------------------------

/** Un tirage pseudo-aléatoire répétable */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Une tache aux bords souples (le camouflage) */
function blob(cx: number, cy: number, rx: number, ry: number, seed: number): string {
  const rnd = random(seed);
  const n = 7;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const k = 0.62 + rnd() * 0.5;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as const;
  });
  const mid = (i: number) => {
    const a = pts[i % n]!;
    const b = pts[(i + 1) % n]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  };
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(mid(0)[0])} ${f(mid(0)[1])}`;
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n]!;
    const m = mid(i);
    d += `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
}

/** Les taches d'un motif de camouflage, recopiées de l'autre côté quand elles dépassent (pas de couture) */
function camoBlobs(w: number, h: number, colors: string[], count: number, seed: number) {
  const rnd = random(seed);
  const out: { d: string; fill: string }[] = [];
  for (let i = 0; i < count; i++) {
    const cx = rnd() * w;
    const cy = rnd() * h;
    const rx = w * (0.1 + rnd() * 0.14);
    const ry = h * (0.1 + rnd() * 0.16);
    const fill = colors[i % colors.length]!;
    const s = seed * 31 + i;
    for (const dx of [-w, 0, w])
      for (const dy of [-h, 0, h]) {
        const x = cx + dx;
        const y = cy + dy;
        if (x + rx < 0 || x - rx > w || y + ry < 0 || y - ry > h) continue;
        out.push({ d: blob(x, y, rx, ry, s), fill });
      }
  }
  return out;
}

const CAMO_NET = camoBlobs(96, 64, ["#6e6342", "#2e2c1c", "#86774f", "#3f3524", "#57553a"], 11, 7);
const CAMO_DARK = camoBlobs(44, 30, ["#1d2117", "#121409", "#1f2118"], 7, 3);

/** Une colonne de fumée : des bouffées qui montent en s'élargissant, poussées par le vent */
function plume(x: number, y: number, height: number, lean: number, width: number, seed: number) {
  const rnd = random(seed);
  const n = 16;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return {
      cx: x + lean * height * t ** 1.6 + (rnd() - 0.5) * width * 0.5,
      cy: y - height * t + (rnd() - 0.5) * 10,
      r: width * (0.45 + t * 1.15) * (0.85 + rnd() * 0.3),
      lit: t > 0.25,
    };
  });
}

const PLUMES = [
  { puffs: plume(826, 606, 560, 0.42, 58, 11), cls: "is-1" },
  { puffs: plume(1442, 600, 430, 0.36, 44, 23), cls: "is-2" },
  { puffs: plume(392, 618, 300, 0.4, 28, 37), cls: "is-3" },
];

/** Des grains de poussière dans la lumière */
const MOTES = (() => {
  const rnd = random(5);
  return Array.from({ length: 18 }, () => ({
    x: 560 + rnd() * 700,
    y: 470 + rnd() * 420,
    r: 1.2 + rnd() * 1.8,
    d: 7 + rnd() * 8,
    t: -rnd() * 15,
    dx: (rnd() - 0.3) * 40,
  }));
})();

/** Un sac de sable, bombé */
function bag(x: number, y: number, w: number, h: number): string {
  return (
    `M${x + 7} ${y}C${x + w * 0.3} ${y - 3} ${x + w * 0.7} ${y - 3} ${x + w - 7} ${y}` +
    `Q${x + w + 1} ${y + 1} ${x + w} ${y + h / 2}Q${x + w + 1} ${y + h - 1} ${x + w - 7} ${y + h}` +
    `C${x + w * 0.7} ${y + h + 3} ${x + w * 0.3} ${y + h + 3} ${x + 7} ${y + h}` +
    `Q${x - 1} ${y + h - 1} ${x} ${y + h / 2}Q${x - 1} ${y + 1} ${x + 7} ${y}Z`
  );
}

/** La haie qui longe le champ, de plus en plus loin vers la gauche */
const HEDGE = (() => {
  const rnd = random(17);
  let d = "M-500 712";
  for (let x = -500; x <= 560; x += 22) {
    const t = (x + 500) / 1060;
    const top = 690 - t * 34 - rnd() * (14 - t * 8);
    d += `Q${x + 11} ${(top - 6).toFixed(1)} ${x + 22} ${(top + 2).toFixed(1)}`;
  }
  return `${d}Q600 690 618 700Q640 714 680 724L-500 732Z`;
})();

/** Les sacs de sable devant celui qui vise : [x, y, largeur, hauteur] */
const BAGS: [number, number, number, number][] = [
  [548, 934, 68, 32],
  [614, 936, 68, 32],
  [680, 934, 68, 32],
  [746, 937, 64, 30],
  [566, 905, 66, 31],
  [630, 907, 66, 31],
  [694, 905, 64, 31],
  [756, 909, 50, 29],
  [588, 876, 64, 30],
  [650, 878, 62, 30],
  [710, 877, 60, 30],
];
/** Les lanières de toile qui pendent du filet : [x, y, longueur, couleur] */
const FRINGES: [number, number, number, string][] = [
  [580, 933, 14, "#5f583a"],
  [610, 937, 10, "#3b3824"],
  [646, 936, 16, "#6e6342"],
  [684, 935, 11, "#4b4730"],
  [722, 934, 15, "#7a6c48"],
  [772, 936, 9, "#3b3824"],
];

// ---------------------------------------------------------------------------
// Les soldats : des silhouettes tournées vers la droite, les pieds en (0, 0)
// ---------------------------------------------------------------------------

type Paint = { fill: string; rim?: boolean };

/** Un fusil, couché le long de l'axe x, la crosse vers la gauche et la poignée en (4, 8) */
function Rifle({ fill }: Paint) {
  return (
    <g fill={fill}>
      <path d="M-33 -5L-8 -4L-6 6L-31 9Z" />
      <rect x={-8} y={-6} width={39} height={10} rx={1.5} />
      <path d="M2 3L9 3L7 15L0 14Z" />
      <path d="M13 3L21 3L26 18L17 19Z" />
      <rect x={30} y={-5} width={27} height={8} rx={1.5} />
      <rect x={56} y={-2.6} width={29} height={3.2} />
      <rect x={50} y={-9} width={3} height={5} />
      <rect x={-2} y={-9.5} width={5} height={4} />
    </g>
  );
}

function Limb({ points, width, fill }: { points: number[]; width: number } & Paint) {
  return <polyline points={points.join(" ")} fill="none" stroke={fill} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />;
}

/** Le casque (une calotte et son bord) posé sur une tête en (x, y) */
function Helmet({ x, y, fill }: { x: number; y: number } & Paint) {
  return (
    <g fill={fill}>
      <circle cx={x} cy={y} r={10.5} />
      <path d={`M${x - 16} ${y - 2}C${x - 17} ${y - 21} ${x + 15} ${y - 24} ${x + 17} ${y - 4}L${x + 20} ${y - 1}L${x - 19} ${y}Z`} />
    </g>
  );
}

/** Celui qui court, le fusil pointé vers l'avant */
function Runner({ fill, rim = false }: Paint) {
  return (
    <g>
      <Limb fill={fill} width={20} points={[-2, -102, -27, -64, -64, -54]} />
      <Limb fill={fill} width={15} points={[-64, -56, -79, -44]} />
      <Limb fill={fill} width={20} points={[8, -102, 40, -76, 36, -24]} />
      <Limb fill={fill} width={16} points={[35, -16, 56, -10]} />
      <path fill={fill} d="M-12 -96L19 -99L39 -146L38 -170L10 -177L-5 -140Z" />
      <rect fill={fill} x={-24} y={-170} width={25} height={48} rx={7} transform="rotate(-22 -11 -146)" />
      <Limb fill={fill} width={11} points={[30, -174, 37, -184]} />
      <Helmet fill={fill} x={41} y={-193} />
      <g transform="translate(30 -142) rotate(10)">{!rim && <Rifle fill={fill} />}</g>
      <Limb fill={fill} width={13} points={[16, -166, 8, -142, 32, -134]} />
      <Limb fill={fill} width={13} points={[34, -168, 55, -150, 69, -136]} />
      <circle fill={fill} cx={32} cy={-134} r={6} />
      <circle fill={fill} cx={69} cy={-136} r={6} />
    </g>
  );
}

/** Celui qui vise, un genou à terre */
function Kneeler({ fill, rim = false }: Paint) {
  return (
    <g>
      <Limb fill={fill} width={21} points={[-6, -62, -10, -9, -44, -7]} />
      <Limb fill={fill} width={14} points={[-44, -8, -58, -4]} />
      <Limb fill={fill} width={21} points={[4, -62, 34, -58, 36, -12]} />
      <Limb fill={fill} width={15} points={[33, -6, 53, -5]} />
      <path fill={fill} d="M-15 -56L17 -60L24 -108L20 -130L-8 -132L-18 -96Z" />
      <rect fill={fill} x={-33} y={-134} width={24} height={50} rx={7} transform="rotate(-6 -21 -109)" />
      <Limb fill={fill} width={11} points={[14, -128, 20, -136]} />
      <Helmet fill={fill} x={25} y={-142} />
      <g transform="translate(36 -127) rotate(-2)">{!rim && <Rifle fill={fill} />}</g>
      <Limb fill={fill} width={13} points={[6, -126, -4, -108, 39, -119]} />
      <Limb fill={fill} width={13} points={[19, -128, 42, -112, 77, -127]} />
      <circle fill={fill} cx={39} cy={-119} r={6} />
      <circle fill={fill} cx={77} cy={-127} r={6} />
    </g>
  );
}

/** Celui qui montre le village, le fusil à la main, canon vers le sol */
function Pointer({ fill, rim = false }: Paint) {
  return (
    <g>
      <Limb fill={fill} width={21} points={[-4, -100, -12, -52, -18, -12]} />
      <Limb fill={fill} width={15} points={[-22, -6, -2, -4]} />
      <Limb fill={fill} width={21} points={[8, -100, 17, -52, 21, -12]} />
      <Limb fill={fill} width={15} points={[17, -5, 37, -4]} />
      <path fill={fill} d="M-15 -96L19 -98L23 -140L18 -173L-15 -175L-21 -136Z" />
      <rect fill={fill} x={-37} y={-178} width={24} height={58} rx={7} />
      <Limb fill={fill} width={11} points={[2, -174, 6, -182]} />
      <Helmet fill={fill} x={8} y={-190} />
      <g transform="translate(-1.7 -121.9) rotate(55)">{!rim && <Rifle fill={fill} />}</g>
      <Limb fill={fill} width={13} points={[-10, -166, -17, -136, -6, -114]} />
      <circle fill={fill} cx={-6} cy={-114} r={6} />
      <Limb fill={fill} width={13} points={[13, -166, 40, -177, 64, -191]} />
      <Limb fill={fill} width={6} points={[64, -191, 79, -199]} />
      <circle fill={fill} cx={64} cy={-191} r={6.5} />
    </g>
  );
}

const SOLDIERS: Record<string, (p: Paint) => ReactNode> = { runner: Runner, kneeler: Kneeler, pointer: Pointer };

/** Un soldat à contre-jour : sa silhouette en tenue camouflée sombre, et un liseré du côté du soleil */
function Soldier({ kind, x, y, s, far = false }: { kind: keyof typeof SOLDIERS; x: number; y: number; s: number; far?: boolean }) {
  const Draw = SOLDIERS[kind]!;
  // Le liseré : la silhouette décalée vers le soleil, en lumière, sous la silhouette sombre
  const dx = SUN.x - x;
  const dy = SUN.y - (y - 110 * s);
  const len = Math.hypot(dx, dy) || 1;
  const k = (far ? 1.1 : 1.7) / s;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={4} cy={1} rx={58} ry={7} fill="#0d0f09" opacity={far ? 0.25 : 0.45} />
      <g transform={`translate(${((dx / len) * k).toFixed(2)} ${((dy / len) * k - k * 0.7).toFixed(2)})`} opacity={far ? 0.55 : 0.95}>
        <Draw fill="url(#esc-pv-rim)" rim />
      </g>
      <Draw fill={far ? "#2e2f22" : "url(#esc-pv-camo-dark)"} />
      {!far && <Draw fill="url(#esc-pv-body)" />}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Le décor
// ---------------------------------------------------------------------------

/** Une maison du hameau : un mur et un toit à deux pans */
const house = (x: number, w: number, h: number, roof: number) =>
  `M${x} ${HORIZON}V${HORIZON - h}L${x + w / 2} ${HORIZON - h - roof}L${x + w} ${HORIZON - h}V${HORIZON}Z`;

const VILLAGE = [
  house(560, 70, 34, 22),
  house(618, 58, 48, 26),
  house(668, 84, 38, 24),
  house(744, 62, 54, 28),
  house(870, 60, 50, 26),
  house(1062, 72, 44, 25),
  house(1126, 62, 36, 22),
  house(1180, 84, 48, 26),
  // L'église : la nef, puis le clocher et sa flèche
  `M942 ${HORIZON}V574L996 548L1050 574V${HORIZON}Z`,
  `M984 ${HORIZON}V488H1018V${HORIZON}Z`,
  `M980 490L1001 424L1022 490Z`,
].join("");

/** La maison au toit crevé, d'où monte la fumée : le pignon reste, la charpente se voit */
const RUIN = `M796 ${HORIZON}V570L812 556L820 566L828 548L846 562V${HORIZON}Z`;

export function EscarmouchePreview() {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(() => frameFor(494 / 529));

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      if (w > 0 && h > 0) setView(frameFor(w / h));
    };
    apply(el.clientWidth, el.clientHeight);
    const observer = new ResizeObserver(([entry]) => entry && apply(entry.contentRect.width, entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={host} className="esc-preview">
      <svg viewBox={view} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="esc-pv-sky" gradientUnits="userSpaceOnUse" x1="0" y1="-600" x2="0" y2={HORIZON}>
            <stop offset="0" stopColor="#151d1c" />
            <stop offset="0.34" stopColor="#25302b" />
            <stop offset="0.55" stopColor="#4a5442" />
            <stop offset="0.7" stopColor="#857f56" />
            <stop offset="0.82" stopColor="#c49f61" />
            <stop offset="0.91" stopColor="#e6bd76" />
            <stop offset="1" stopColor="#f6dca2" />
          </linearGradient>
          <radialGradient id="esc-pv-glow" gradientUnits="userSpaceOnUse" cx={SUN.x} cy={SUN.y} r="560">
            <stop offset="0" stopColor="#fff3cc" stopOpacity="0.95" />
            <stop offset="0.07" stopColor="#ffe2a0" stopOpacity="0.62" />
            <stop offset="0.28" stopColor="#efb565" stopOpacity="0.24" />
            <stop offset="1" stopColor="#e09a4d" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="esc-pv-ray" gradientUnits="userSpaceOnUse" cx={SUN.x} cy={SUN.y} r="900">
            <stop offset="0" stopColor="#fff2c8" stopOpacity="0.32" />
            <stop offset="0.6" stopColor="#ffe2a2" stopOpacity="0.08" />
            <stop offset="1" stopColor="#ffe2a2" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="esc-pv-puff-lit">
            <stop offset="0" stopColor="#d2bd94" stopOpacity="0.62" />
            <stop offset="0.55" stopColor="#a8987a" stopOpacity="0.36" />
            <stop offset="1" stopColor="#8b806a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="esc-pv-puff-dark">
            <stop offset="0" stopColor="#4b463b" stopOpacity="0.85" />
            <stop offset="0.6" stopColor="#4b463b" stopOpacity="0.45" />
            <stop offset="1" stopColor="#4b463b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="esc-pv-mist">
            <stop offset="0" stopColor="#f3d9a6" stopOpacity="0.42" />
            <stop offset="1" stopColor="#f3d9a6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="esc-pv-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ecc888" stopOpacity="0" />
            <stop offset="0.55" stopColor="#ecc888" stopOpacity="0.5" />
            <stop offset="1" stopColor="#c9a46a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="esc-pv-field" gradientUnits="userSpaceOnUse" x1="0" y1={HORIZON} x2="0" y2="1000">
            <stop offset="0" stopColor="#6f684a" />
            <stop offset="0.12" stopColor="#4d4a33" />
            <stop offset="0.45" stopColor="#333320" />
            <stop offset="1" stopColor="#1b1c12" />
          </linearGradient>
          <linearGradient id="esc-pv-furrow" gradientUnits="userSpaceOnUse" x1="0" y1={HORIZON} x2="0" y2="1000">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.26" />
          </linearGradient>
          <linearGradient id="esc-pv-road" gradientUnits="userSpaceOnUse" x1="0" y1={HORIZON} x2="0" y2="1000">
            <stop offset="0" stopColor="#b59b66" />
            <stop offset="0.3" stopColor="#7d6c49" />
            <stop offset="1" stopColor="#3f3826" />
          </linearGradient>
          <linearGradient id="esc-pv-bag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9a8760" />
            <stop offset="0.4" stopColor="#6c5e40" />
            <stop offset="1" stopColor="#2f2a1c" />
          </linearGradient>
          <linearGradient id="esc-pv-rim" gradientUnits="userSpaceOnUse" x1="0" y1="-220" x2="0" y2="0">
            <stop offset="0" stopColor="#ffe3a4" />
            <stop offset="1" stopColor="#d99a4e" />
          </linearGradient>
          <linearGradient id="esc-pv-body" gradientUnits="userSpaceOnUse" x1="0" y1="-215" x2="0" y2="0">
            <stop offset="0" stopColor="#4a4a33" stopOpacity="0.3" />
            <stop offset="0.45" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="esc-pv-crate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5b5737" />
            <stop offset="1" stopColor="#2a2919" />
          </linearGradient>
          <radialGradient id="esc-pv-flare">
            <stop offset="0" stopColor="#fffdf0" stopOpacity="1" />
            <stop offset="0.12" stopColor="#fff1c4" stopOpacity="0.8" />
            <stop offset="0.45" stopColor="#ffd98a" stopOpacity="0.22" />
            <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
          <pattern id="esc-pv-camo-dark" patternUnits="userSpaceOnUse" width="44" height="30">
            <rect width="44" height="30" fill="#181b13" />
            {CAMO_DARK.map((b, i) => (
              <path key={i} d={b.d} fill={b.fill} />
            ))}
          </pattern>
          <pattern id="esc-pv-camo" patternUnits="userSpaceOnUse" width="96" height="64">
            <rect width="96" height="64" fill="#4b4730" />
            {CAMO_NET.map((b, i) => (
              <path key={i} d={b.d} fill={b.fill} />
            ))}
          </pattern>
          <linearGradient id="esc-pv-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="0.45" stopColor="#000" stopOpacity="0.08" />
            <stop offset="1" stopColor="#000" stopOpacity="0.55" />
          </linearGradient>
          <clipPath id="esc-pv-net">
            {BAGS.filter(([, y]) => y < 930).map(([x, y, w, h], i) => (
              <path key={i} d={bag(x, y, w, h)} />
            ))}
          </clipPath>
          <pattern id="esc-pv-mesh" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(38)">
            <path d="M0 0H9M0 0V9" stroke="#1d1c12" strokeWidth="1.1" opacity="0.55" />
          </pattern>
        </defs>

        {/* Le ciel, le soleil et ses rayons */}
        <rect x="-500" y="-700" width="2600" height="1400" fill="url(#esc-pv-sky)" />
        <circle cx={SUN.x} cy={SUN.y} r="560" fill="url(#esc-pv-glow)" />
        <g className="esc-pv-rays" opacity="0.62">
          {[-168, -146, -121, -98, -66, -38, -14].map((a) => {
            const r = (deg: number) => (deg * Math.PI) / 180;
            const p = (deg: number) => `${(SUN.x + Math.cos(r(deg)) * 1100).toFixed(0)} ${(SUN.y + Math.sin(r(deg)) * 1100).toFixed(0)}`;
            return <path key={a} d={`M${SUN.x} ${SUN.y}L${p(a - 2.6)}L${p(a + 2.6)}Z`} fill="url(#esc-pv-ray)" />;
          })}
        </g>
        <ellipse cx="420" cy="280" rx="520" ry="9" fill="#e9b978" opacity="0.22" />
        <ellipse cx="1260" cy="352" rx="430" ry="7" fill="#f0c98a" opacity="0.26" />
        <ellipse cx="760" cy="430" rx="560" ry="10" fill="#f4cf91" opacity="0.2" />
        <circle cx={SUN.x} cy={SUN.y} r="31" fill="#fff6dd" />

        {/* Les collines au loin */}
        <path
          d="M-500 640V604C-300 590-120 600 80 593C280 586 460 602 660 598C860 594 1040 606 1240 595C1440 584 1660 600 1860 593L2100 596V640Z"
          fill="#857957"
          opacity="0.8"
        />
        <path
          d="M-500 640V614C-320 604-140 618 60 610C260 602 420 616 620 612C820 608 1000 620 1200 612C1400 604 1640 618 2100 610V640Z"
          fill="#62603f"
        />

        {/* La fumée, derrière le village */}
        {PLUMES.map(({ puffs, cls }) => (
          <g key={cls} className={`esc-pv-smoke ${cls}`}>
            {puffs.map((p, i) => (
              <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.lit ? "url(#esc-pv-puff-lit)" : "url(#esc-pv-puff-dark)"} />
            ))}
          </g>
        ))}

        {/* Le hameau, à contre-jour, et la gare de triage sur son talus */}
        <g fill="#3a3a2a">
          {[530, 548, 1262].map((x, i) => (
            <ellipse key={x} cx={x} cy={HORIZON - 34 - i * 4} rx={8} ry={40 + i * 4} />
          ))}
          <path d={VILLAGE} />
          <path d={RUIN} />
          <path d="M1240 624V608H2100V624Z" />
          <rect x="1290" y="584" width="92" height="22" />
          <rect x="1388" y="586" width="88" height="20" />
          <rect x="1484" y="588" width="82" height="18" rx="9" />
          <rect x="1222" y="560" width="32" height="22" rx="3" />
          <path d="M1226 582L1222 610H1226L1232 582ZM1250 582L1256 610H1252L1246 582Z" />
          <path d="M1584 610V546H1588V610ZM1664 610V546H1668V610ZM1580 544H1672V550H1580Z" />
          {[1600, 1620, 1640].map((x) => (
            <rect key={x} x={x} y={550} width={7} height={11} />
          ))}
          {/* La croix de fer de la girouette, au bout de la flèche */}
          <path d="M1000 424V408H1002V424ZM995 413H1007V415H995Z" />
        </g>
        <path d="M800 568L842 564M806 576L840 571M812 556L830 586" stroke="#2a2a1e" strokeWidth="1.6" />
        <rect x="694" y="596" width="7" height="8" fill="#ffcf78" opacity="0.85" />
        <rect x="1144" y="602" width="6" height="7" fill="#f6c06a" opacity="0.6" />
        <rect x="998" y="500" width="6" height="14" fill="#f3d39a" opacity="0.55" />
        <rect x="-500" y="540" width="2600" height="150" fill="url(#esc-pv-haze)" />

        {/* Les champs, la route qui mène au village et sa ligne de poteaux */}
        <rect x="-500" y={HORIZON - 4} width="2600" height="1000" fill="url(#esc-pv-field)" />
        <g stroke="url(#esc-pv-furrow)" strokeWidth="2.4">
          {Array.from({ length: 17 }, (_, i) => {
            const bx = -1100 + i * 260;
            return <line key={i} x1={SUN.x + (bx - SUN.x) * 0.02} y1={HORIZON} x2={bx} y2={1000} />;
          })}
        </g>
        <path d={`M1170 1000C1140 860 1070 720 1004 ${HORIZON}H1016C1100 720 1250 860 1430 1000Z`} fill="url(#esc-pv-road)" opacity="0.9" />
        <g fill="#24241a">
          {[
            [1318, 892, 214],
            [1182, 768, 124],
            [1105, 697, 72],
            [1058, 658, 40],
            [1034, 639, 22],
          ].map(([x, y, h]) => (
            <g key={x}>
              <rect x={x! - h! * 0.022} y={y! - h!} width={Math.max(1.4, h! * 0.044)} height={h} />
              <rect x={x! - h! * 0.12} y={y! - h! * 0.94} width={h! * 0.24} height={Math.max(1, h! * 0.025)} />
            </g>
          ))}
        </g>
        <path
          d="M1308 684Q1240 698 1176 650Q1138 640 1100 629Q1080 631 1058 620Q1046 623 1034 619"
          fill="none"
          stroke="#24241a"
          strokeWidth="1.2"
        />
        <path d="M1328 690Q1250 706 1188 655" fill="none" stroke="#24241a" strokeWidth="1.2" />

        {/* La haie et le muret effondré */}
        <g fill="#2c2e1e">
          <path d={HEDGE} />
          <path d="M300 800V770L330 764L336 754L372 758L380 742L420 748L428 762L470 760L478 778L520 782V800Z" />
        </g>
        <path d="M300 770L330 764L336 754L372 758L380 742L420 748" fill="none" stroke="#8c7a52" strokeWidth="2" opacity="0.6" />

        {/* La brume qui traîne sur les champs */}
        <g className="esc-pv-mist">
          <ellipse cx="520" cy="704" rx="440" ry="28" fill="url(#esc-pv-mist)" />
          <ellipse cx="1180" cy="690" rx="400" ry="22" fill="url(#esc-pv-mist)" />
          <ellipse cx="820" cy="770" rx="640" ry="34" fill="url(#esc-pv-mist)" opacity="0.7" />
        </g>

        {/* La fusée éclairante, sous son petit parachute */}
        <g className="esc-pv-flare">
          <g transform="translate(-150 40)">
            <path
              d="M1268 252C1252 210 1282 170 1262 120C1250 90 1270 60 1256 20"
              fill="none"
              stroke="#c8b998"
              strokeWidth="5"
              opacity="0.18"
            />
            <path d="M1268 252C1252 210 1282 170 1262 120" fill="none" stroke="#e2d4b2" strokeWidth="1.6" opacity="0.35" />
            <path d="M1252 236Q1268 220 1284 236Z" fill="#5b5639" />
            <path d="M1253 236Q1268 231 1283 236" fill="none" stroke="#ffe0a0" strokeWidth="1.4" />
            <path d="M1254 237L1268 262M1282 237L1268 262M1268 236V262" stroke="#4a4632" strokeWidth="0.8" />
            <circle className="esc-pv-flare-glow" cx="1268" cy="266" r="78" fill="url(#esc-pv-flare)" />
            <circle cx="1268" cy="266" r="3.6" fill="#fffef6" />
          </g>
        </g>

        {/* Plus loin, deux autres de la section */}
        <Soldier kind="runner" x={1222} y={782} s={0.4} far />
        <Soldier kind="kneeler" x={1356} y={770} s={0.36} far />

        {/* La poussière dans la lumière */}
        <g fill="#ffe6b2">
          {MOTES.map((m, i) => (
            <circle
              key={i}
              className="esc-pv-mote"
              cx={m.x}
              cy={m.y}
              r={m.r}
              style={{ "--d": `${m.d.toFixed(1)}s`, "--t": `${m.t.toFixed(1)}s`, "--dx": `${m.dx.toFixed(0)}px` } as CSSProperties}
            />
          ))}
        </g>

        {/* La section : celui qui court, celui qui vise derrière les sacs, celui qui montre le village */}
        <Soldier kind="pointer" x={1062} y={918} s={1.02} />
        <Soldier kind="runner" x={872} y={944} s={1.12} />
        <Soldier kind="kneeler" x={676} y={914} s={1} />

        {/* Les sacs de sable : les deux rangs du haut sous une bâche camouflée et son filet */}
        <g>
          {BAGS.map(([x, y, w, h], i) => (
            <path
              key={i}
              d={bag(x, y, w, h)}
              fill={y < 930 ? "url(#esc-pv-camo)" : "url(#esc-pv-bag)"}
              stroke="#1c1910"
              strokeWidth="1.3"
            />
          ))}
          {BAGS.map(([x, y, w, h], i) => (
            <path key={i} d={bag(x, y, w, h)} fill="url(#esc-pv-shade)" />
          ))}
          <g clipPath="url(#esc-pv-net)">
            <rect x="550" y="860" width="270" height="90" fill="url(#esc-pv-mesh)" />
          </g>
          {FRINGES.map(([x, y, l, c], i) => (
            <path key={i} d={`M${x} ${y}q2 ${l / 2} -1 ${l}`} stroke={c} strokeWidth="3.2" strokeLinecap="round" fill="none" />
          ))}
          <path
            d="M592 878C610 872 690 872 766 879M760 911C770 907 796 908 804 912"
            fill="none"
            stroke="#efc882"
            strokeWidth="1.8"
            opacity="0.55"
          />
        </g>

        {/* La caisse de munitions, sa bâche camouflée */}
        <g>
          <rect x="1150" y="938" width="120" height="56" rx="3" fill="url(#esc-pv-crate)" stroke="#1c1c12" strokeWidth="2" />
          <path d="M1150 956H1270M1150 976H1270M1170 938V994M1250 938V994" stroke="#1c1c12" strokeWidth="2" opacity="0.6" />
          <path
            d="M1186 934C1214 926 1252 928 1282 940C1290 960 1286 984 1276 1000H1214C1206 980 1196 956 1186 934Z"
            fill="url(#esc-pv-camo)"
          />
          <path d="M1188 934C1216 927 1252 929 1281 941" fill="none" stroke="#e8c27f" strokeWidth="2" opacity="0.5" />
        </g>

        {/* L'herbe du premier plan */}
        <path
          d="M-500 1000V980C-300 974 -100 986 100 976L140 948L150 978L240 968L262 940L270 970L420 980L440 952L452 982C600 986 760 978 900 986L930 954L942 986L1100 980L1132 956L1142 984C1300 988 1460 976 1620 984L1650 950L1660 982L2100 978V1000Z"
          fill="#12140d"
        />
      </svg>
    </div>
  );
}

/** Le titre d'Escarmouche au pochoir : les lettres de la police des cartes, coupées de leurs ponts comme une plaque de tôle */
const STENCIL_LETTERS = "ESCARMOUCHE";
/** Où commence chaque lettre (police des cartes à 200, graisse 800, mesuré dans le navigateur), et ses ponts :
 *  [x, y, largeur, hauteur] depuis le début de la lettre, la ligne de base en y = 0 */
const STENCIL: { x: number; cuts: [number, number, number, number][] }[] = [
  { x: 0, cuts: [[34.5, -170, 6, 176]] },
  {
    x: 76.3,
    cuts: [
      [40.7, -170, 6, 32],
      [40.7, -32, 6, 34],
    ],
  },
  {
    x: 164.5,
    cuts: [
      [42.5, -170, 6, 32],
      [42.5, -32, 6, 34],
    ],
  },
  { x: 254.4, cuts: [[40.6, -170, 6, 40]] },
  { x: 343, cuts: [[34.5, -170, 6, 118]] },
  {
    x: 431.9,
    cuts: [
      [33.6, -170, 6, 90],
      [98.6, -170, 6, 90],
    ],
  },
  {
    x: 570,
    cuts: [
      [42.5, -170, 6, 32],
      [42.5, -32, 6, 34],
    ],
  },
  { x: 662.4, cuts: [[41.6, -32, 6, 34]] },
  {
    x: 753,
    cuts: [
      [43, -170, 6, 32],
      [43, -32, 6, 34],
    ],
  },
  {
    x: 844,
    cuts: [
      [33.5, -100, 5, 34],
      [52.5, -100, 5, 34],
    ],
  },
  { x: 935, cuts: [[34.5, -170, 6, 176]] },
];
const SPACING = 7;

export function EscarmoucheTitle() {
  const xs = STENCIL.map((l, i) => l.x + i * SPACING);
  const width = xs[xs.length - 1]! + 82;
  return (
    <>
      <span className="visually-hidden">Escarmouche</span>
      <svg className="esc-title" viewBox={`0 -178 ${width} 192`} aria-hidden="true">
        <defs>
          <mask id="esc-title-cut" maskUnits="userSpaceOnUse" x="0" y="-200" width={width} height="240">
            <rect x="0" y="-200" width={width} height="240" fill="#fff" />
            {STENCIL.map((l, i) =>
              l.cuts.map(([cx, cy, cw, ch], k) => <rect key={`${i}-${k}`} x={xs[i]! + cx} y={cy} width={cw} height={ch} fill="#000" />),
            )}
          </mask>
          <filter id="esc-title-worn" x="-2%" y="-10%" width="104%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="4" result="grain" />
            <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -18 13" result="holes" />
            <feComposite in="SourceGraphic" in2="holes" operator="in" result="sprayed" />
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" result="wave" />
            <feDisplacementMap in="sprayed" in2="wave" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g mask="url(#esc-title-cut)">
          <text className="esc-title-shadow" x={0} y={0}>
            {STENCIL_LETTERS.split("").map((c, i) => (
              <tspan key={i} x={xs[i]! + 5} y={6}>
                {c}
              </tspan>
            ))}
          </text>
          <text className="esc-title-paint" x={0} y={0} filter="url(#esc-title-worn)">
            {STENCIL_LETTERS.split("").map((c, i) => (
              <tspan key={i} x={xs[i]} y={0}>
                {c}
              </tspan>
            ))}
          </text>
        </g>
      </svg>
    </>
  );
}
