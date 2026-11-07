// Les braises qui s'échappent de l'étincelle : [x, y, rayon, couleur, retard de l'animation]
const EMBERS: [number, number, number, string, number][] = [
  [273, 23, 2, "#ffd36b", 0],
  [248, 15, 1.6, "#ff9a3c", 0.25],
  [277, 47, 1.4, "#ff6a3c", 0.5],
  [260, 7, 1.7, "#ffb347", 0.15],
  [238, 33, 1.2, "#ffd36b", 0.4],
];

/** Un bâton de dynamite couché, son bout à gauche : `y`, le haut du bâton */
function Stick({ y }: { y: number }) {
  return (
    <g>
      <rect x="-82" y={y} width="164" height="28" rx="14" fill="url(#meche-preview-stick)" />
      <rect x="-74" y={y + 4} width="150" height="5" rx="2.5" fill="#f39a84" opacity="0.5" />
      <rect x="-76" y={y + 21} width="154" height="3.5" rx="1.75" fill="#5e1610" opacity="0.35" />
      <ellipse cx="-80" cy={y + 14} rx="7" ry="14" fill="#c84639" stroke="#5e1610" strokeWidth="1.3" />
      <ellipse cx="-80" cy={y + 14} rx="3.4" ry="8" fill="#8f241c" />
    </g>
  );
}

/** Une allumette, debout sur son pied : grattée ou pas */
function MatchStick({ burnt = false }: { burnt?: boolean }) {
  return burnt ? (
    <g>
      <path d="M0 0V-34c0-5 3-7 2-12s-3-6-2-10" fill="none" stroke="#3a2f28" strokeWidth="4.6" strokeLinecap="round" />
      <circle cx="0.4" cy="-57" r="3.6" fill="#8d847a" />
    </g>
  ) : (
    <g>
      <rect x="-2.6" y="-56" width="5.2" height="56" rx="2" fill="#ecd29d" stroke="#8d6a3e" strokeWidth="0.8" />
      <ellipse cx="0" cy="-58" rx="5.4" ry="7.4" fill="#d8402f" stroke="#7d1f19" strokeWidth="0.8" />
      <ellipse cx="-1.6" cy="-60.5" rx="1.7" ry="2.4" fill="#f4a08f" />
    </g>
  );
}

/**
 * L'illustration de Mèche sur l'accueil : la dynamite et sa mèche qui crépite, le médaillon des lettres à placer avec
 * le mot qui les contient, et les allumettes, dont une déjà brûlée.
 */
export function MechePreview() {
  const fuse = "M159 87C157 64 192 70 199 50S229 20 252 30";
  return (
    <div className="meche-preview">
      <svg viewBox="0 0 320 220" role="img" aria-label="Une dynamite à la mèche allumée, les lettres OU à placer et des allumettes">
        <defs>
          <linearGradient id="meche-preview-stick" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#de4f40" />
            <stop offset="0.55" stopColor="#b3302a" />
            <stop offset="1" stopColor="#7d1f19" />
          </linearGradient>
          <radialGradient id="meche-preview-paper" cy="0.35">
            <stop offset="0" stopColor="#fffaef" />
            <stop offset="1" stopColor="#e6cfa4" />
          </radialGradient>
          <radialGradient id="meche-preview-glow">
            <stop offset="0" stopColor="#ffe3a0" stopOpacity="0.95" />
            <stop offset="0.4" stopColor="#ff9a3c" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ff6a3c" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Les ombres sur l'établi */}
        <ellipse cx="156" cy="186" rx="104" ry="11" fill="rgba(0,0,0,0.38)" />
        <ellipse cx="246" cy="194" rx="44" ry="7" fill="rgba(0,0,0,0.32)" />

        {/* La mèche : sa corde torsadée, noircie là où elle brûle */}
        <path d={fuse} fill="none" stroke="#1d130b" strokeWidth="7.5" strokeLinecap="round" />
        <path d={fuse} fill="none" stroke="#c9a06a" strokeWidth="4.8" strokeLinecap="round" />
        <path d={fuse} fill="none" stroke="#8d6a3e" strokeWidth="4.8" strokeDasharray="2.2 4" />
        <path d={fuse} fill="none" stroke="#2a211a" strokeWidth="5" pathLength={100} strokeDasharray="0 84 16 0" />

        {/* La dynamite : trois bâtons ficelés, son étiquette */}
        <g transform="translate(156 134) rotate(-8)">
          <Stick y={-45} />
          <Stick y={-15} />
          <Stick y={15} />
          <rect x="-54" y="-49" width="13" height="96" rx="3" fill="#2b211b" />
          <rect x="38" y="-49" width="13" height="96" rx="3" fill="#2b211b" />
          <rect x="-52" y="-49" width="3" height="96" rx="1.5" fill="#4a3a2e" />
          <rect x="40" y="-49" width="3" height="96" rx="1.5" fill="#4a3a2e" />
          <rect x="-33" y="-20" width="64" height="38" rx="4" fill="#f3e4c4" stroke="#2b211b" strokeWidth="2.2" />
          <text
            x="-1"
            y="7.5"
            textAnchor="middle"
            fontSize="21"
            fontWeight="800"
            fill="#b8302a"
            fontFamily="var(--font-card)"
            letterSpacing="1.2"
          >
            BOUM
          </text>
        </g>

        {/* L'étincelle au bout de la mèche */}
        <g transform="translate(252 30)">
          <g className="meche-preview-spark">
            <circle r="26" fill="url(#meche-preview-glow)" />
            <path
              d="M0-15 3.2-4.6 13-7.5 6-1 14 5.4 4 4.4 3.6 14-1.6 5.6-9.6 11.6-5.4 2.4-14-1.6-4.6-3.6-8.4-12.4-1.4-6.6Z"
              fill="#ffd36b"
              stroke="#ff9a3c"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <circle r="4.4" fill="#fff6d6" />
          </g>
        </g>
        {EMBERS.map(([x, y, r, color, delay]) => (
          <circle
            key={`${x}-${y}`}
            className="meche-preview-ember"
            cx={x}
            cy={y}
            r={r}
            fill={color}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}

        {/* Les allumettes de chacun : deux neuves, une brûlée */}
        <g transform="translate(30 198)">
          <g transform="rotate(-26)">
            <MatchStick />
          </g>
          <g transform="translate(15 2) rotate(-9)">
            <MatchStick />
          </g>
          <g transform="translate(31 3) rotate(8)">
            <MatchStick burnt />
          </g>
        </g>

        {/* Le médaillon : les lettres à placer, et le mot qui les contient */}
        <g transform="translate(246 158) rotate(7)">
          <circle r="47" fill="#2a1c11" />
          <circle r="44.5" fill="#b98f55" />
          <circle r="42" fill="url(#meche-preview-paper)" />
          <circle r="35" fill="none" stroke="#b98f55" strokeWidth="1" opacity="0.6" />
          <text y="9" textAnchor="middle" fontSize="36" fontWeight="800" fill="#2a1c11" fontFamily="var(--font-card)" letterSpacing="2">
            OU
          </text>
          <text y="26" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#2a1c11" fontFamily="var(--font-card)" letterSpacing="1">
            B<tspan fill="#c4421f">OU</tspan>TEILLE
          </text>
        </g>
      </svg>
    </div>
  );
}
