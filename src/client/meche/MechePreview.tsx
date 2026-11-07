// Les joueurs autour de la table : leur angle, leur couleur ; celui qui tient la mèche est à -30°
const SEATS: [number, string][] = [
  [-90, "#3f7fd8"],
  [-30, "#2fa864"],
  [30, "#d4453c"],
  [90, "#e2bd6e"],
  [150, "#9b6bff"],
  [210, "#e08a3c"],
];
const HOLDER = -30;

/** L'illustration de Mèche sur l'accueil : la table ronde, sa mèche, l'aiguille qui montre le joueur, et ses lettres. */
export function MechePreview() {
  const rope = "M191.2 46.3A80 80 0 1 1 128.8 46.3";
  return (
    <div className="meche-preview">
      <svg viewBox="0 0 320 240" role="img" aria-label="Une table ronde, sa mèche allumée et des joueurs autour">
        <defs>
          <radialGradient id="meche-preview-wood">
            <stop offset="0" stopColor="#7d5435" />
            <stop offset="0.6" stopColor="#62402a" />
            <stop offset="1" stopColor="#3b2515" />
          </radialGradient>
          <radialGradient id="meche-preview-paper" cy="0.35">
            <stop offset="0" stopColor="#fff9ec" />
            <stop offset="1" stopColor="#e4cda3" />
          </radialGradient>
        </defs>
        {SEATS.map(([angle, color]) => {
          const x = 160 + 106 * Math.cos((angle * Math.PI) / 180);
          const y = 120 + 106 * Math.sin((angle * Math.PI) / 180);
          return (
            <g key={angle}>
              {angle === HOLDER && <circle cx={x} cy={y} r={16} fill="#ffb347" opacity={0.35} />}
              <circle
                cx={x}
                cy={y}
                r={11.5}
                fill={color}
                stroke={angle === HOLDER ? "#ffb347" : "rgba(255,255,255,0.25)"}
                strokeWidth={2.5}
              />
              <circle cx={x} cy={y - 2} r={4.2} fill="rgba(255,240,220,0.85)" />
            </g>
          );
        })}
        <circle cx="160" cy="120" r="88" fill="#2c1c10" />
        <circle cx="160" cy="120" r="82" fill="url(#meche-preview-wood)" />
        <path d={rope} fill="none" stroke="#1d130b" strokeWidth="8" />
        <path d={rope} fill="none" stroke="#c9a06a" strokeWidth="5.5" />
        <path d={rope} fill="none" stroke="#8d6a3e" strokeWidth="5.5" strokeDasharray="2 5" />
        <path d={rope} fill="none" stroke="#d8402f" strokeWidth="5.5" pathLength={100} strokeDasharray="0 74 26 0" />
        <path d={rope} fill="none" stroke="#2a211a" strokeWidth="5.5" pathLength={100} strokeDasharray="40 60" />
        <g transform={`translate(160 120) rotate(${HOLDER})`}>
          <path d="M0 -5 L54 -4 L54 -9 L74 0 L54 9 L54 4 L0 5Z" fill="#ec7a30" stroke="#2a1406" strokeWidth="1.4" strokeLinejoin="round" />
        </g>
        <circle cx="160" cy="120" r="52" fill="#2a1c11" />
        <circle cx="160" cy="120" r="49" fill="#b98f55" />
        <circle cx="160" cy="120" r="47" fill="url(#meche-preview-paper)" />
        <text
          x="160"
          y="126"
          textAnchor="middle"
          fontSize="40"
          fontWeight="800"
          fill="#2a1c11"
          fontFamily="var(--font-card)"
          letterSpacing="2"
        >
          OU
        </text>
        <text
          x="160"
          y="146"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="#2a1c11"
          fontFamily="var(--font-card)"
          letterSpacing="1"
        >
          B<tspan fill="#c4421f">OU</tspan>TEILLE
        </text>
        <rect x="138" y="31" width="44" height="15" rx="3.5" fill="#b8352b" />
        <rect x="138" y="31" width="44" height="5" rx="2.5" fill="#d9554a" />
        <text
          x="160"
          y="42.5"
          textAnchor="middle"
          fontSize="10"
          fontWeight="800"
          fill="#f7e9d2"
          fontFamily="var(--font-card)"
          letterSpacing="1.2"
        >
          BOUM
        </text>
        <g className="meche-preview-spark" transform="translate(201.7 188.3)">
          <circle r="12" fill="#ff9a3c" opacity="0.35" />
          <circle r="5.5" fill="#ffb347" />
          <circle r="2.6" fill="#fff4cf" />
        </g>
      </svg>
    </div>
  );
}
