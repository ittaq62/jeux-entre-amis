// L'illustration de la Tournée sur l'accueil : une scène de théâtre, le trophée sur le podium, et des tickets « ? » qui
// volent, parce que les jeux sortent au hasard. Elle ne montre aucun jeu en particulier : on peut en ajouter sans y toucher.

/** Le bord intérieur du rideau, à la hauteur y : il est tiré sur le côté */
const curtainEdge = (y: number) => 34 + 104 * (1 - y / 440) ** 2.4;

const FOLDS = 6;

/** Un pli du rideau de gauche (de `k / FOLDS` à `(k + 1) / FOLDS` de sa largeur) */
function fold(k: number, mirror: boolean): string {
  const ys = Array.from({ length: 12 }, (_, i) => (i / 11) * 450);
  const at = (t: number, y: number) => {
    const x = t * curtainEdge(y) + Math.sin(y * 0.03 + k) * 1.6;
    return `${(mirror ? 480 - x : x).toFixed(1)} ${y.toFixed(1)}`;
  };
  const a = k / FOLDS;
  const b = (k + 1) / FOLDS;
  return `M${ys.map((y) => at(a, y)).join("L")}L${[...ys]
    .reverse()
    .map((y) => at(b, y))
    .join("L")}Z`;
}

const CONFETTI_COLORS = ["#f4c64e", "#e2483d", "#2fc4c4", "#f6ecd6", "#2f80ed", "#eb5ea8"];
// Des confettis répartis sans hasard (la même image à chaque affichage), qui ne se posent ni sur le trophée ni sur le podium
const CONFETTI = Array.from({ length: 56 }, (_, i) => ({
  x: 70 + ((i * 0.618034) % 1) * 340,
  y: 56 + ((i * 0.754878) % 1) * 200,
  r: (i * 67) % 180,
  w: 3.6 + (i % 3) * 1.2,
  h: 6.5 + (i % 4) * 1.3,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
  late: i % 2 === 0,
})).filter((c) => Math.abs(c.x - 240) > 78 && (c.y < 226 || c.x < 90 || c.x > 390));

function star(x: number, y: number, r: number): string {
  const c = r * 0.2;
  return `M${x} ${y - r}L${x + c} ${y - c}L${x + r} ${y}L${x + c} ${y + c}L${x} ${y + r}L${x - c} ${y + c}L${x - r} ${y}L${x - c} ${y - c}Z`;
}

/** Une étoile à cinq branches (l'emblème du trophée) */
function badge(x: number, y: number, r: number): string {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 === 0 ? r : r * 0.45;
    return `${(x + Math.cos(a) * d).toFixed(1)} ${(y + Math.sin(a) * d).toFixed(1)}`;
  });
  return `M${pts.join("L")}Z`;
}

function Ticket({ x, y, rot, scale, slow }: { x: number; y: number; rot: number; scale: number; slow?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`}>
      <g className={slow ? "tour-preview-ticket is-slow" : "tour-preview-ticket"}>
        <path
          d="M-52-30H52V-11A11 11 0 0 0 52 11V30H-52V11A11 11 0 0 0-52-11Z"
          fill="url(#tp-ticket)"
          stroke="#8f6a2a"
          strokeWidth="1.5"
        />
        <path d="M-27-25V25" stroke="#b08a48" strokeWidth="1.8" strokeDasharray="3 4" />
        <path d="M-44-22H44V-11A11 11 0 0 0 44 11V22H-44V11A11 11 0 0 0-44-11Z" fill="none" stroke="#c9a15a" strokeWidth="1.1" opacity="0.8" />
        <path d={badge(-35, 0, 6.5)} fill="#c8362e" />
        <text
          x="11"
          y="17"
          textAnchor="middle"
          fontSize="48"
          fill="#c8362e"
          style={{ fontFamily: "var(--font-title)" }}
        >
          ?
        </text>
      </g>
    </g>
  );
}

function Step({ x, w, top, n, shade }: { x: number; w: number; top: number; n: number; shade: string }) {
  return (
    <g>
      <path d={`M${x + 6} ${top - 10}H${x + w - 6}L${x + w} ${top}H${x}Z`} fill="#fff6e2" />
      <rect x={x} y={top} width={w} height={344 - top} fill={shade} />
      <rect x={x} y={top} width={w} height={5} fill="#e2b45c" />
      <text
        x={x + w / 2}
        y={top + (344 - top) / 2 + 17}
        textAnchor="middle"
        fontSize={n === 1 ? 54 : 44}
        fill="#8f2230"
        style={{ fontFamily: "var(--font-title)" }}
      >
        {n}
      </text>
    </g>
  );
}

export function TourPreview() {
  return (
    <div className="tour-preview">
      <svg viewBox="0 0 480 440" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Un trophée sur un podium, au milieu d'une scène de théâtre">
        <defs>
          <linearGradient id="tp-fold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3f0a16" />
            <stop offset="0.45" stopColor="#b52d40" />
            <stop offset="0.72" stopColor="#8a1d2e" />
            <stop offset="1" stopColor="#3f0a16" />
          </linearGradient>
          <linearGradient id="tp-swag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6e1524" />
            <stop offset="1" stopColor="#c23246" />
          </linearGradient>
          <linearGradient id="tp-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffeec4" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffeec4" stopOpacity="0.02" />
          </linearGradient>
          <radialGradient id="tp-pool" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffe6b0" stopOpacity="0.62" />
            <stop offset="1" stopColor="#ffe6b0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tp-back" cx="0.5" cy="0.42" r="0.62">
            <stop offset="0" stopColor="#6d2233" />
            <stop offset="0.6" stopColor="#2f0d17" />
            <stop offset="1" stopColor="#14050a" />
          </radialGradient>
          <linearGradient id="tp-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a5430" />
            <stop offset="1" stopColor="#2e170c" />
          </linearGradient>
          <linearGradient id="tp-gold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#a06a12" />
            <stop offset="0.3" stopColor="#ffeeb0" />
            <stop offset="0.55" stopColor="#f3c04e" />
            <stop offset="1" stopColor="#94600e" />
          </linearGradient>
          <linearGradient id="tp-gold-v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe9a4" />
            <stop offset="1" stopColor="#b47d18" />
          </linearGradient>
          <linearGradient id="tp-ticket" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6df" />
            <stop offset="1" stopColor="#ecd9b0" />
          </linearGradient>
          <linearGradient id="tp-step-1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbeed2" />
            <stop offset="1" stopColor="#d9bd8a" />
          </linearGradient>
          <linearGradient id="tp-step-2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#efdfc0" />
            <stop offset="1" stopColor="#c4a776" />
          </linearGradient>
          <filter id="tp-soft" x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* Le fond de scène */}
        <rect width="480" height="440" fill="url(#tp-back)" />

        {/* Le plancher, dont les lames filent vers le fond */}
        <rect y="312" width="480" height="128" fill="url(#tp-floor)" />
        <g stroke="#1e0f07" strokeWidth="1.4" opacity="0.55">
          {[-340, -230, -130, -40, 40, 130, 230, 340].map((dx) => (
            <path key={dx} d={`M${240 + dx * 0.3} 312L${240 + dx * 1.3} 440`} />
          ))}
          <path d="M0 340H480M0 384H480" opacity="0.5" />
        </g>
        <rect y="312" width="480" height="3" fill="#2a130a" opacity="0.8" />

        {/* Les poursuites */}
        <path d="M142-10 206 62 290 344H96Z" fill="url(#tp-beam)" style={{ mixBlendMode: "screen" }} />
        <path d="M338-10 274 62 384 344H190Z" fill="url(#tp-beam)" style={{ mixBlendMode: "screen" }} />
        <ellipse cx="240" cy="346" rx="208" ry="34" fill="url(#tp-pool)" />

        {/* Le podium */}
        <ellipse cx="240" cy="348" rx="150" ry="12" fill="#090305" opacity="0.6" filter="url(#tp-soft)" />
        <Step x={102} w={92} top={276} n={2} shade="url(#tp-step-2)" />
        <Step x={286} w={92} top={294} n={3} shade="url(#tp-step-2)" />
        <Step x={192} w={96} top={244} n={1} shade="url(#tp-step-1)" />

        {/* Le trophée */}
        <g transform="translate(240 236) scale(0.85) translate(-240 -236)">
          <ellipse cx="240" cy="236" rx="40" ry="5" fill="#6a4a1c" opacity="0.5" />
          <rect x="206" y="222" width="68" height="14" rx="3" fill="#5a2c14" />
          <rect x="206" y="222" width="68" height="3" fill="#8a4f28" />
          <rect x="216" y="208" width="48" height="14" rx="3" fill="url(#tp-gold)" />
          <path d="M231 208C233 196 235 188 235 178H245C245 188 247 196 249 208Z" fill="url(#tp-gold)" />
          <ellipse cx="240" cy="178" rx="14" ry="5.5" fill="url(#tp-gold)" />
          {/* Les anses */}
          <path d="M193 84C160 76 150 126 198 138" stroke="#7d5310" strokeWidth="12" fill="none" strokeLinecap="round" />
          <path d="M287 84C320 76 330 126 282 138" stroke="#7d5310" strokeWidth="12" fill="none" strokeLinecap="round" />
          <path d="M193 84C160 76 150 126 198 138" stroke="url(#tp-gold-v)" strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d="M287 84C320 76 330 126 282 138" stroke="url(#tp-gold-v)" strokeWidth="8" fill="none" strokeLinecap="round" />
          {/* La coupe */}
          <path d="M186 72H294C294 124 276 168 240 174C204 168 186 124 186 72Z" fill="url(#tp-gold)" />
          <ellipse cx="240" cy="72" rx="54" ry="10" fill="#8c5c10" />
          <ellipse cx="240" cy="72" rx="54" ry="10" fill="none" stroke="#ffeeb4" strokeWidth="2.4" />
          <path d="M240 74.6C222 74.6 208 73.4 199 71.2C208 69 222 67.6 240 67.6S272 69 281 71.2C272 73.4 258 74.6 240 74.6Z" fill="#5c3a08" />
          <path d="M201 86C203 118 212 146 226 160C214 158 196 124 196 86Z" fill="#fff6d0" opacity="0.7" />
          <path d={badge(240, 118, 25)} fill="#c8862a" />
          <path d={badge(240, 118, 25)} fill="none" stroke="#fff0bc" strokeWidth="2" strokeLinejoin="round" />
          <path d={star(292, 78, 15)} fill="#fff8df" className="tour-preview-glint" />
          <path d={star(186, 150, 10)} fill="#fff8df" className="tour-preview-glint is-late" />
        </g>

        {/* Les confettis */}
        {[false, true].map((late) => (
          <g key={String(late)} className={late ? "tour-preview-confetti is-late" : "tour-preview-confetti"}>
            {CONFETTI.filter((c) => c.late === late).map((c) => (
              <rect
                key={`${c.x}-${c.y}`}
                x={-c.w / 2}
                y={-c.h / 2}
                width={c.w}
                height={c.h}
                rx="1"
                fill={c.color}
                transform={`translate(${c.x} ${c.y}) rotate(${c.r})`}
              />
            ))}
          </g>
        ))}

        {/* Les tickets : le prochain jeu, on ne sait jamais lequel */}
        <Ticket x={112} y={176} rot={-16} scale={0.8} />
        <Ticket x={354} y={146} rot={13} scale={0.82} slow />
        <Ticket x={364} y={238} rot={-9} scale={0.56} />

        {/* Le rideau, tiré sur les côtés, et ses embrasses */}
        {[false, true].map((mirror) => (
          <g key={String(mirror)}>
            {Array.from({ length: FOLDS }, (_, k) => (
              <path key={k} d={fold(k, mirror)} fill="url(#tp-fold)" />
            ))}
            <g transform={mirror ? "translate(480 0) scale(-1 1)" : undefined}>
              <path d={`M-4 296C20 306 40 302 ${curtainEdge(300) + 6} 290`} stroke="#7d5310" strokeWidth="9" fill="none" strokeLinecap="round" />
              <path d={`M-4 296C20 306 40 302 ${curtainEdge(300) + 6} 290`} stroke="url(#tp-gold-v)" strokeWidth="5.5" fill="none" strokeLinecap="round" />
              <circle cx={curtainEdge(300) + 6} cy="291" r="7.5" fill="url(#tp-gold-v)" />
              <path d={`M${curtainEdge(300) + 1} 297L${curtainEdge(300) - 2} 322H${curtainEdge(300) + 14}L${curtainEdge(300) + 11} 297Z`} fill="url(#tp-gold-v)" />
            </g>
          </g>
        ))}

        {/* Le lambrequin, en haut */}
        <g>
          {Array.from({ length: 6 }, (_, i) => {
            const x = i * 80;
            const d = `M${x} 0H${x + 80}V20A40 28 0 0 1 ${x} 20Z`;
            return (
              <g key={i}>
                <path d={d} fill="url(#tp-swag)" />
                <path d={`M${x + 80} 20A40 28 0 0 1 ${x} 20`} stroke="#e3ae4a" strokeWidth="3.4" fill="none" />
                <path d={`M${x + 80} 25A40 28 0 0 1 ${x} 25`} stroke="#e3ae4a" strokeWidth="6.5" strokeDasharray="1.8 3.2" fill="none" />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
