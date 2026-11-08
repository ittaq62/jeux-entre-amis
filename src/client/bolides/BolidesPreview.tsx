// L'illustration de Bolides sur l'accueil : au coucher du soleil, un kart vu de dos part en dérapage sur une route qui
// file vers l'horizon, un rival devant, une caisse d'objets qui flotte, et un deltaplane dans le ciel. La route est
// calculée en perspective : ses vibreurs et ses pointillés rétrécissent vraiment vers le lointain.

const HORIZON = 216;
const BOTTOM = 446;

interface Slice {
  y: number;
  cx: number;
  hw: number;
}

/** La route à un endroit : `u` va de 0 (sous nos roues) à 1 (l'horizon) */
function slice(u: number): Slice {
  return {
    y: BOTTOM + (HORIZON - BOTTOM) * u,
    cx: 238 + 110 * Math.sin(u * Math.PI * 1.15) * (1 - 0.55 * u),
    hw: 196 * (1 - u) + 0.8,
  };
}

const SLICES = Array.from({ length: 150 }, (_, n) => slice(1 - 1 / (1 + n * 0.22)));

/** Un morceau de route entre deux tranches, de `from` à `to` en part de sa demi-largeur */
function quad(a: Slice, b: Slice, from: number, to: number): string {
  const p = (s: Slice, r: number) => `${(s.cx + s.hw * r).toFixed(1)} ${s.y.toFixed(1)}`;
  return `M${p(a, from)}L${p(a, to)}L${p(b, to)}L${p(b, from)}Z`;
}

const pieces = (keep: (n: number) => boolean, from: number, to: number) =>
  SLICES.slice(0, -1)
    .map((s, n) => (keep(n) ? quad(s, SLICES[n + 1]!, from, to) : ""))
    .join("");

const ROAD = `M${SLICES.map((s) => `${(s.cx - s.hw).toFixed(1)} ${s.y.toFixed(1)}`).join("L")}L${[...SLICES]
  .reverse()
  .map((s) => `${(s.cx + s.hw).toFixed(1)} ${s.y.toFixed(1)}`)
  .join("L")}Z`;
const CURB_RED = pieces((n) => n % 2 === 0, -1.12, -1) + pieces((n) => n % 2 === 1, 1, 1.12);
const CURB_PALE = pieces((n) => n % 2 === 1, -1.12, -1) + pieces((n) => n % 2 === 0, 1, 1.12);
const EDGE_LINES = pieces(() => true, -0.95, -0.92) + pieces(() => true, 0.92, 0.95);
const DASHES = pieces((n) => n % 3 === 0, -0.025, 0.025);

/** Des buissons le long de la route, de plus en plus petits */
const BUSHES = [3, 5, 6, 8, 10, 12, 15, 18, 22, 26, 31, 37, 44].map((n, i) => {
  const s = SLICES[n]!;
  const side = i % 2 === 0 ? -1 : 1;
  const r = 1.34 + ((i * 7) % 5) * 0.2;
  return { x: s.cx + side * s.hw * r, y: s.y, size: Math.max(2.4, s.hw * 0.17) };
});

/** Une étoile à quatre branches */
function star(x: number, y: number, r: number): string {
  const c = r * 0.18;
  return `M${x} ${y - r}L${x + c} ${y - c}L${x + r} ${y}L${x + c} ${y + c}L${x} ${y + r}L${x - c} ${y + c}L${x - r} ${y}L${x - c} ${y - c}Z`;
}

/** Un kart vu de dos ; (0, 0) : le sol, au milieu de l'essieu arrière */
function RearKart({
  id,
  body,
  bodyDark,
  suit,
  helmet,
  helmetDark,
  stripe,
  label,
  x,
  y,
  scale,
  tilt = 0,
  skew = 0,
}: {
  id: string;
  body: string;
  bodyDark: string;
  suit: string;
  helmet: string;
  helmetDark: string;
  stripe: string;
  label?: string;
  x: number;
  y: number;
  scale: number;
  tilt?: number;
  skew?: number;
}) {
  const tyre = (cx: number) => (
    <g>
      <rect x={cx - 29} y={-90} width={58} height={90} rx={16} fill="url(#bp-tyre)" />
      {[-15, 0, 15].map((d) => (
        <rect key={d} x={cx + d - 1.6} y={-86} width={3.2} height={82} rx={1.6} fill="#000" opacity={0.42} />
      ))}
      {[-70, -54, -38, -22].map((yy) => (
        <path key={yy} d={`M${cx - 26} ${yy}l13 5l13-5l13 5l13-5`} stroke="#000" strokeWidth={2.2} fill="none" opacity={0.3} />
      ))}
      <path d={`M${cx - 20} -89.4h40`} stroke="#ffb777" strokeWidth={2.6} strokeLinecap="round" opacity={0.9} />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) skewX(${skew}) scale(${scale})`}>
      <ellipse cx={0} cy={2} rx={126} ry={15} fill="#07060c" opacity={0.55} filter="url(#bp-soft)" />
      {/* Les roues avant, plus loin */}
      <rect x={-68} y={-52} width={30} height={44} rx={9} fill="#101116" />
      <rect x={38} y={-52} width={30} height={44} rx={9} fill="#101116" />
      {/* La coque */}
      <path d="M-70 -52C-62 -86-46-102-34-104H34C46-102 62-86 70-52L58-30H-58Z" fill={`url(#bp-body-${id})`} />
      {/* Le pilote : ses épaules, puis son casque, tout en longueur, avec ses bandes */}
      <path d="M-56 -100C-54 -142-30-156 0-156S54-142 56-100Z" fill={suit} />
      <path d="M-8 -156H8L10-104H-10Z" fill="#fff" opacity={0.9} />
      <path d="M-16 -150C-10 -158 10-158 16-150L14-140H-14Z" fill="#14151b" />
      <path d="M-36 -176C-36 -204-20-220 0-220S36-204 36-176C36-158 26-144 12-142H-12C-26-144-36-158-36-176Z" fill={`url(#bp-helmet-${id})`} />
      <path d="M-12 -219.4C-13 -196-13-166-10-142.4H-3C-5-168-5-198-4-220Z" fill={stripe} />
      <path d="M12 -219.4C13 -196 13-166 10-142.4H3C5-168 5-198 4-220Z" fill={stripe} />
      <path d="M-35.4 -184C-29 -176-28-166-30-155C-34-161-36-168-36-176Z" fill="#14151b" opacity={0.9} />
      <path d="M35.4 -184C29 -176 28-166 30-155C34-161 36-168 36-176Z" fill="#14151b" opacity={0.9} />
      <path d="M-14 -143C-6 -140 6-140 14-143L12-136C6-134-6-134-12-136Z" fill={helmetDark} />
      <path d="M-26 -206C-14-222 14-222 26-206" stroke="#ffe4b8" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.95} />
      {/* Le siège */}
      <path d="M-42 -96C-42-126-20-130 0-130S42-126 42-96L36-66H-36Z" fill="#23252c" />
      <path d="M-30 -122C-16-128 16-128 30-122" stroke="#4a4e59" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      {/* Le moteur */}
      <rect x={-40} y={-74} width={80} height={48} rx={7} fill="url(#bp-engine)" />
      {[-62, -54, -46].map((yy) => (
        <path key={yy} d={`M-32 ${yy}H32`} stroke="#000" strokeWidth={2.4} opacity={0.35} />
      ))}
      {/* L'essieu */}
      <rect x={-76} y={-36} width={152} height={15} rx={6} fill="#2d3037" />
      <path d="M-70 -35h140" stroke="#666b78" strokeWidth={1.6} opacity={0.8} />
      {tyre(-84)}
      {tyre(84)}
      {/* L'aileron */}
      <path d="M-40 -108L-30 -66H-20L-30 -108ZM40 -108L30 -66H20L30 -108Z" fill="#2a2c33" />
      <rect x={-120} y={-136} width={240} height={32} rx={7} fill={`url(#bp-body-${id})`} />
      <path d="M-114 -135.2H114" stroke="#ffd0a0" strokeWidth={2.2} strokeLinecap="round" opacity={0.85} />
      <rect x={-120} y={-112} width={240} height={8} rx={4} fill={bodyDark} opacity={0.75} />
      <rect x={-132} y={-152} width={13} height={58} rx={4} fill="#22242b" />
      <rect x={119} y={-152} width={13} height={58} rx={4} fill="#22242b" />
      {label && (
        <text
          x={0}
          y={-114}
          textAnchor="middle"
          fontFamily="'Libre Franklin Variable', system-ui, sans-serif"
          fontWeight={900}
          fontSize={22}
          letterSpacing={5}
          fill="#fff7e8"
        >
          {label}
        </text>
      )}
      {/* Les pots, et le turbo qui en sort */}
      {[-22, 22].map((px) => (
        <g key={px}>
          <circle cx={px} cy={-42} r={13} fill="#aeb4bf" />
          <circle cx={px} cy={-42} r={9} fill="#16171c" />
          <g className="bolides-preview-flame" style={{ transformOrigin: `${px}px -42px` }}>
            <path
              d={`M${px - 10} -44C${px - 17} -22 ${px - 8} -2 ${px} 12C${px + 8} -2 ${px + 17} -22 ${px + 10} -44C${px + 5} -38 ${px - 5} -38 ${px - 10} -44Z`}
              fill="url(#bp-flame)"
            />
            <path
              d={`M${px - 5} -43C${px - 8} -30 ${px - 3} -20 ${px} -12C${px + 3} -20 ${px + 8} -30 ${px + 5} -43Z`}
              fill="#fffbe6"
            />
          </g>
        </g>
      ))}
    </g>
  );
}

const STREAKS: [number, number, number, number, string][] = [
  [156, 416, 134, 404, "#ffd36b"],
  [152, 424, 124, 420, "#ff9a2e"],
  [156, 410, 142, 390, "#45c8ff"],
  [150, 430, 122, 436, "#ffd36b"],
  [160, 408, 154, 384, "#fff3c4"],
];
const SPARKS: [number, number, number, string][] = [
  [126, 396, 7.5, "#fff3c4"],
  [108, 414, 5.5, "#ffd36b"],
  [138, 376, 5.5, "#45c8ff"],
  [100, 432, 4.5, "#ff9a2e"],
  [114, 384, 3.6, "#ffffff"],
  [150, 366, 3.2, "#ff9a2e"],
  [94, 402, 3, "#45c8ff"],
];

export function BolidesPreview() {
  return (
    <div className="bolides-preview">
      <svg
        viewBox="0 0 480 440"
        preserveAspectRatio="xMidYMax slice"
        role="img"
        aria-label="Au coucher du soleil, un kart part en dérapage vers l'horizon, sous un deltaplane"
      >
        <defs>
          <linearGradient id="bp-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a2559" />
            <stop offset="0.42" stopColor="#6b3a83" />
            <stop offset="0.72" stopColor="#e2684f" />
            <stop offset="0.92" stopColor="#ffb763" />
            <stop offset="1" stopColor="#ffdc9a" />
          </linearGradient>
          <radialGradient id="bp-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fffbe0" />
            <stop offset="0.7" stopColor="#ffe6a0" />
            <stop offset="1" stopColor="#ffc56b" />
          </radialGradient>
          <radialGradient id="bp-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffd58f" stopOpacity="0.85" />
            <stop offset="0.45" stopColor="#ff9f62" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ff8a5a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bp-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b86f4c" />
            <stop offset="0.28" stopColor="#5b5a43" />
            <stop offset="1" stopColor="#14322a" />
          </linearGradient>
          <linearGradient id="bp-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e6a877" />
            <stop offset="0.16" stopColor="#8b6168" />
            <stop offset="0.55" stopColor="#3f3a4d" />
            <stop offset="1" stopColor="#25242f" />
          </linearGradient>
          <radialGradient id="bp-shine" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffe0a8" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ffb07a" stopOpacity="0" />
          </radialGradient>
          <clipPath id="bp-road-clip">
            <path d={ROAD} />
          </clipPath>
          <linearGradient id="bp-tyre" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0d0e12" />
            <stop offset="0.5" stopColor="#2c2e36" />
            <stop offset="1" stopColor="#0d0e12" />
          </linearGradient>
          <linearGradient id="bp-engine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#50545f" />
            <stop offset="1" stopColor="#1e2026" />
          </linearGradient>
          <radialGradient id="bp-flame" cx="0.5" cy="0.12" r="0.95">
            <stop offset="0" stopColor="#fff3b0" />
            <stop offset="0.4" stopColor="#ffb43a" />
            <stop offset="0.8" stopColor="#ff5a1e" />
            <stop offset="1" stopColor="#ff5a1e" stopOpacity="0.1" />
          </radialGradient>
          <linearGradient id="bp-body-hero" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff6a55" />
            <stop offset="1" stopColor="#b3261e" />
          </linearGradient>
          <linearGradient id="bp-body-rival" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#62b0ff" />
            <stop offset="1" stopColor="#1d57b8" />
          </linearGradient>
          <linearGradient id="bp-helmet-hero" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd55e" />
            <stop offset="1" stopColor="#d98a12" />
          </linearGradient>
          <linearGradient id="bp-helmet-rival" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6f7fb" />
            <stop offset="1" stopColor="#a9b2c4" />
          </linearGradient>
          <linearGradient id="bp-crate-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e9a95a" />
            <stop offset="1" stopColor="#a96a2e" />
          </linearGradient>
          <linearGradient id="bp-crate-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b87a3a" />
            <stop offset="1" stopColor="#74451f" />
          </linearGradient>
          <pattern id="bp-check" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill="#f7f1e4" />
            <rect width="8" height="8" fill="#17161c" />
            <rect x="8" y="8" width="8" height="8" fill="#17161c" />
          </pattern>
          <filter id="bp-soft" x="-30%" y="-80%" width="160%" height="260%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="bp-smoke" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* Le ciel, ses étoiles, le soleil */}
        <rect width="480" height={HORIZON + 8} fill="url(#bp-sky)" />
        <g fill="#fff4dc">
          <circle cx="42" cy="26" r="1.3" />
          <circle cx="118" cy="16" r="1" />
          <circle cx="196" cy="42" r="1.4" />
          <circle cx="288" cy="18" r="1" />
          <circle cx="348" cy="44" r="1.2" />
          <circle cx="442" cy="24" r="1.4" />
          <circle cx="24" cy="74" r="0.9" />
          <circle cx="236" cy="12" r="0.9" />
        </g>
        <circle cx="262" cy="172" r="190" fill="url(#bp-glow)" />
        <circle cx="262" cy="172" r="60" fill="url(#bp-sun)" />
        <g fill="#ffb68c" opacity="0.72">
          <path d="M18 118c36-12 70-9 104-4s54 3 76 8c-44 5-92 5-122 3s-46-3-58-7z" />
          <path d="M286 92c32-9 62-8 96-3s66 4 90 7c-40 6-82 8-116 5s-54-5-70-9z" />
        </g>
        <path d="M322 142c26-6 52-5 78-2s44 3 62 6c-34 4-66 5-92 3s-38-4-48-7z" fill="#ffcd9c" opacity="0.65" />

        {/* Le volcan, les montagnes */}
        <path
          d="M0 216V176l26-14 22 10 26-30 18-14 10 2 22 22 24 20 28-12 40 26 40-16 34 14 34-20 30 10 24-16 38 18 44-12 20 12v28z"
          fill="#8a4a70"
          opacity="0.92"
        />
        <path d="M92 128c-6-14 2-22-4-34M100 126c4-12-4-20 4-32" stroke="#d8a58c" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.35" />
        <path d="M84 130l8-3 9 1 7 4-6 5-6-3-8 3z" fill="#ffb24a" />
        <path d="M0 216v-14l40-10 44 8 54-14 46 18 66-10 58 14 54-16 46 12 40-10 32 8v14z" fill="#54305b" />

        {/* Le sol */}
        <rect y={HORIZON} width="480" height={440 - HORIZON + 8} fill="url(#bp-ground)" />
        {BUSHES.map((b) => (
          <g key={`${b.x}-${b.y}`}>
            <ellipse cx={b.x} cy={b.y} rx={b.size * 1.5} ry={b.size * 0.34} fill="#000" opacity="0.28" />
            <circle cx={b.x - b.size * 0.55} cy={b.y - b.size * 0.55} r={b.size * 0.72} fill="#1d4a3a" />
            <circle cx={b.x + b.size * 0.5} cy={b.y - b.size * 0.5} r={b.size * 0.66} fill="#173f33" />
            <circle cx={b.x} cy={b.y - b.size * 0.92} r={b.size * 0.76} fill="#266049" />
            <circle cx={b.x - b.size * 0.2} cy={b.y - b.size * 1.12} r={b.size * 0.42} fill="#3d7a55" />
            <circle cx={b.x + b.size * 0.16} cy={b.y - b.size * 1.28} r={b.size * 0.2} fill="#c9a064" opacity="0.8" />
          </g>
        ))}

        {/* La route */}
        <path d={ROAD} fill="url(#bp-road)" />
        <ellipse cx="256" cy={HORIZON + 8} rx="130" ry="128" fill="url(#bp-shine)" clipPath="url(#bp-road-clip)" />
        <path d={EDGE_LINES} fill="#f6e8cf" opacity="0.5" />
        <path d={DASHES} fill="#fff1d6" opacity="0.85" />
        <path d={CURB_RED} fill="#d8362c" />
        <path d={CURB_PALE} fill="#f7ecd8" />

        {/* Le deltaplane */}
        <g className="bolides-preview-glider" transform="translate(128 66) rotate(-9) scale(1.18)">
          <path d="M-58 8C-30-18 30-18 58 8L0-2Z" fill="#f7ecd8" />
          <path d="M-58 8C-46-3-33-8-20-11L0-2Z" fill="#e2483d" />
          <path d="M58 8C46-3 33-8 20-11L0-2Z" fill="#2f80ed" />
          <path d="M0-2V26M-34 2 0 26M34 2 0 26" stroke="#1c1b26" strokeWidth="1.3" opacity="0.8" />
          <rect x="-14" y="26" width="28" height="8" rx="3" fill="#f2c94c" />
          <rect x="-18" y="28" width="7" height="9" rx="2.5" fill="#15151b" />
          <rect x="11" y="28" width="7" height="9" rx="2.5" fill="#15151b" />
          <path d="M-7 26c0-6 3-9 7-9s7 3 7 9z" fill="#1d2a5c" />
        </g>

        {/* Le drapeau à damier */}
        <g transform="translate(392 92) rotate(5) scale(0.86)">
          <rect x="-3" y="-4" width="6" height="150" rx="3" fill="#1d1c26" />
          <path d="M3 0C22-8 40 6 60 0s26-5 32-2v52c-8-3-16-2-32 2s-38-8-57 0z" fill="url(#bp-check)" stroke="#17161c" strokeWidth="1.5" />
        </g>

        {/* Le rival, loin devant */}
        <RearKart
          id="rival"
          body="#3b8ae6"
          bodyDark="#1d57b8"
          suit="#7b3fa0"
          helmet="#eef0f6"
          helmetDark="#7b8399"
          stripe="#e2483d"
          x={SLICES[10]!.cx + SLICES[10]!.hw * 0.3}
          y={SLICES[10]!.y}
          scale={0.27}
          tilt={2}
        />

        {/* La caisse d'objets, qui flotte */}
        <g className="bolides-preview-crate" transform="translate(388 292) scale(0.72)">
          <circle cx="0" cy="0" r="48" fill="url(#bp-glow)" />
          <ellipse cx="0" cy="56" rx="26" ry="6" fill="#050409" opacity="0.5" />
          <path d="M0-34 32-20 0-6-32-20z" fill="#f2c084" />
          <path d="M-32-20 0-6V32L-32 18z" fill="url(#bp-crate-a)" />
          <path d="M32-20 0-6V32L32 18z" fill="url(#bp-crate-b)" />
          <path d="M-32-20 0-6 32-20M0-6V32" stroke="#5c3515" strokeWidth="2.6" fill="none" strokeLinejoin="round" />
          <path d="M0-34 32-20V18L0 32-32 18V-20z" stroke="#5c3515" strokeWidth="3.2" fill="none" strokeLinejoin="round" />
          <path d="M-14-4-24 9l6 2-5 12 12-15-6-2 5-9z" fill="#ffe15a" stroke="#6a3400" strokeWidth="1.4" strokeLinejoin="round" />
        </g>

        {/* La fumée des pneus */}
        <g filter="url(#bp-smoke)" fill="#f1c9b0">
          <circle cx="132" cy="424" r="24" opacity="0.5" />
          <circle cx="104" cy="408" r="18" opacity="0.3" />
          <circle cx="330" cy="432" r="18" opacity="0.3" />
        </g>
        <circle cx="152" cy="420" r="30" fill="url(#bp-glow)" />

        {/* Le kart de tête, en plein dérapage */}
        <RearKart
          id="hero"
          body="#e2483d"
          bodyDark="#8f1d17"
          suit="#20407f"
          helmet="#ffc83d"
          helmetDark="#8d5a0e"
          stripe="#d8362c"
          label="BOLIDES"
          x={226}
          y={428}
          scale={0.8}
          tilt={-5}
          skew={-3}
        />

        {/* Les étincelles du mini-turbo */}
        <g className="bolides-preview-sparks">
          {STREAKS.map(([x1, y1, x2, y2, c]) => (
            <path key={`${x2}-${y2}`} d={`M${x1} ${y1}L${x2} ${y2}`} stroke={c} strokeWidth="2.6" strokeLinecap="round" />
          ))}
          {SPARKS.map(([x, y, r, c]) => (
            <path key={`${x}-${y}`} d={star(x, y, r)} fill={c} />
          ))}
        </g>

        {/* Le palmier, tout devant */}
        <g fill="#0f2a28">
          <path d="M-8 446C6 360 12 256 44 154l9 3C28 258 30 364 22 446z" />
          <path d="M46 154C18 128-14 128-40 158c26-14 54-14 86-4z" />
          <path d="M46 154C30 116 2 96-34 92c26 12 52 30 80 62z" />
          <path d="M46 154C52 112 84 86 126 88c-32 10-56 32-80 66z" />
          <path d="M46 154c30-26 66-30 98-6-32-8-64-6-98 6z" />
          <path d="M46 154c32-4 58 12 72 48-20-24-44-40-72-48z" />
          <path d="M46 154C18 160-4 182-10 216c14-26 32-46 56-62z" />
        </g>
        <path d="M46 154C30 116 2 96-34 92M46 154C52 112 84 86 126 88M46 154c30-26 66-30 98-6" stroke="#ffae72" strokeWidth="1.4" fill="none" opacity="0.7" />
      </svg>
    </div>
  );
}
