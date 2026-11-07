/** Un kart vu de trois quarts, à la couleur donnée, avec son pilote casqué */
function Kart({
  color,
  helmet,
  x,
  y,
  scale = 1,
  flip = false,
}: {
  color: string;
  helmet: string;
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <ellipse cx="0" cy="34" rx="62" ry="9" fill="rgba(0,0,0,0.32)" />
      {/* Les roues arrière */}
      <ellipse cx="-40" cy="22" rx="14" ry="15" fill="#1b1b1e" />
      <ellipse cx="-40" cy="22" rx="6" ry="7" fill="#9aa1ab" />
      {/* Le châssis et la carrosserie */}
      <path d="M-58 14h112c6 0 9 4 9 9v4H-62v-4c0-5 0-9 4-9z" fill="#2a2c31" />
      <path d="M-46 14c2-14 14-20 34-20h30c18 0 32 8 40 20z" fill={color} />
      <path d="M-30 4c4-6 12-8 24-8h28c10 0 18 3 24 8z" fill="#ffffff" opacity="0.28" />
      <path d="M44 6l20 2c4 1 6 4 6 8H48z" fill={color} />
      <rect x="58" y="16" width="12" height="7" rx="2" fill="#2a2c31" />
      {/* L'aileron */}
      <rect x="-62" y="-14" width="8" height="26" rx="2" fill="#2a2c31" />
      <rect x="-72" y="-20" width="26" height="8" rx="3" fill={color} />
      {/* Le pilote */}
      <path d="M-14 4c0-12 6-18 16-18s16 6 16 18z" fill="#3a3f47" />
      <circle cx="4" cy="-22" r="15" fill={helmet} />
      <path d="M4 -29c8 0 13 4 14 10H6z" fill="#1d2430" />
      <path d="M-11 -24a15 15 0 0 1 30 0" stroke="#fff" strokeWidth="3" fill="none" opacity="0.9" />
      <path d="M14 -6l14 6" stroke="#2a2c31" strokeWidth="4" strokeLinecap="round" />
      {/* Les roues avant */}
      <ellipse cx="44" cy="24" rx="12" ry="13" fill="#1b1b1e" />
      <ellipse cx="44" cy="24" rx="5" ry="6" fill="#9aa1ab" />
      {/* Les pots, la flamme du turbo */}
      <rect x="-70" y="6" width="12" height="5" rx="2" fill="#9aa1ab" />
      <path d="M-70 8c-10-5-20-3-26 0 6 3 16 5 26 0z" fill="#ff9a2e" />
      <path d="M-70 8c-6-2-12-1-15 0 3 2 9 2 15 0z" fill="#ffe08a" />
    </g>
  );
}

/**
 * L'illustration de Bolides sur l'accueil : deux karts lancés dans un virage, des étincelles de dérapage, une
 * caisse d'objets et le drapeau à damier.
 */
export function BolidesPreview() {
  return (
    <div className="bolides-preview">
      <svg viewBox="0 0 320 220" role="img" aria-label="Deux karts dans un virage, une caisse d'objets et le drapeau à damier">
        <defs>
          <linearGradient id="bolides-preview-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a5d63" />
            <stop offset="1" stopColor="#3f4247" />
          </linearGradient>
          <pattern id="bolides-preview-check" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#f4f4f4" />
            <rect width="6" height="6" fill="#151515" />
            <rect x="6" y="6" width="6" height="6" fill="#151515" />
          </pattern>
          <pattern id="bolides-preview-curb" width="24" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#d8352a" />
            <rect x="12" width="12" height="12" fill="#f4f1ea" />
          </pattern>
        </defs>

        {/* La route qui tourne, ses vibreurs */}
        <path d="M-20 228C40 150 110 120 200 118s120-40 150-70v190z" fill="url(#bolides-preview-road)" />
        <path d="M-20 228C40 150 110 120 200 118s120-40 150-70" stroke="url(#bolides-preview-curb)" strokeWidth="9" fill="none" />
        <path
          d="M60 236C96 196 140 178 210 176s110-26 140-50"
          stroke="url(#bolides-preview-curb)"
          strokeWidth="9"
          fill="none"
          opacity="0.9"
        />
        <path
          d="M30 220C80 168 132 150 205 147s115-33 145-60"
          stroke="#f2efe6"
          strokeWidth="3"
          strokeDasharray="14 12"
          fill="none"
          opacity="0.7"
        />

        {/* Le drapeau à damier */}
        <g transform="translate(262 22) rotate(8)">
          <rect x="-2" y="0" width="4" height="72" rx="2" fill="#3a3f47" />
          <path
            d="M2 2c14-4 26 4 40 0s20-4 26 0v34c-8-4-14-4-26 0s-26-4-40 0z"
            fill="url(#bolides-preview-check)"
            stroke="#151515"
            strokeWidth="1.5"
          />
        </g>

        {/* La caisse d'objets, qui flotte */}
        <g className="bolides-preview-crate" transform="translate(70 62) rotate(-10)">
          <ellipse cx="0" cy="44" rx="18" ry="4" fill="rgba(0,0,0,0.25)" />
          <rect x="-20" y="-20" width="40" height="40" rx="4" fill="#c08542" stroke="#6b4220" strokeWidth="5" />
          <path d="M-14 -6h28M-14 6h28" stroke="#a46a33" strokeWidth="3" />
          <path d="M4 -16-10 3h8l-4 15 16-21H2z" fill="#ffd23a" stroke="#7a3d00" strokeWidth="2" strokeLinejoin="round" />
        </g>

        {/* Les traits de vitesse */}
        <g stroke="#fff" strokeLinecap="round" opacity="0.55">
          <path d="M8 130h46" strokeWidth="3" />
          <path d="M20 146h40" strokeWidth="2.5" />
          <path d="M2 162h50" strokeWidth="3" />
        </g>

        {/* Le kart de derrière, puis celui qui mène, en plein dérapage */}
        <Kart color="#2f80ed" helmet="#f2c94c" x={118} y={120} scale={0.62} />
        <Kart color="#e2483d" helmet="#ffffff" x={196} y={150} scale={0.92} />

        {/* Les étincelles du mini-turbo */}
        <g className="bolides-preview-sparks">
          <circle cx="130" cy="180" r="3.4" fill="#ff9a2e" />
          <circle cx="122" cy="172" r="2.4" fill="#ffd36b" />
          <circle cx="138" cy="186" r="2" fill="#45c8ff" />
          <circle cx="116" cy="184" r="1.8" fill="#ff9a2e" />
        </g>
      </svg>
    </div>
  );
}
