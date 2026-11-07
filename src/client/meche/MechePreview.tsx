/** L'illustration de Mèche sur l'accueil : la caisse, ses lettres, et l'étincelle qui fait le tour de la corde. */
export function MechePreview() {
  const rope = "M162 12H262a18 18 0 0 1 18 18V142a18 18 0 0 1-18 18H38a18 18 0 0 1-18-18V30a18 18 0 0 1 18-18H118";
  return (
    <div className="meche-preview">
      <svg viewBox="0 0 300 172" role="img" aria-label="Une caisse de pétards et sa mèche">
        <rect x="8" y="2" width="284" height="168" rx="24" fill="#3a2717" />
        {[32, 62, 92, 122, 152].map((y) => (
          <path key={y} d={`M12 ${y}H288`} stroke="#2a1b10" strokeWidth="2" />
        ))}
        <path d={rope} fill="none" stroke="#1d130b" strokeWidth="9" strokeLinecap="round" />
        <path d={rope} fill="none" stroke="#c9a06a" strokeWidth="6" strokeLinecap="round" />
        <path d={rope} fill="none" stroke="#8d6a3e" strokeWidth="6" strokeDasharray="2 6" />
        <path d={rope} fill="none" stroke="#d8402f" strokeWidth="6" pathLength={100} strokeDasharray="0 74 26 0" />
        <path d={rope} fill="none" stroke="#2a211a" strokeWidth="6" pathLength={100} strokeDasharray="38 62" />
        <rect x="120" y="1" width="60" height="22" rx="5" fill="#b8352b" />
        <rect x="120" y="1" width="60" height="7" rx="3" fill="#d9554a" />
        <text
          x="150"
          y="17"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fill="#f7e9d2"
          fontFamily="var(--font-card)"
          letterSpacing="1.5"
        >
          BOUM
        </text>
        <text
          x="150"
          y="102"
          textAnchor="middle"
          fontSize="66"
          fontWeight="800"
          fill="#f7e9d2"
          fontFamily="var(--font-card)"
          letterSpacing="4"
        >
          OU
        </text>
        <text
          x="150"
          y="134"
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill="#f7e9d2"
          opacity="0.85"
          fontFamily="var(--font-card)"
          letterSpacing="2"
        >
          B<tspan fill="#ffb347">OU</tspan>
          TEILLE
        </text>
        <g className="meche-preview-spark" transform="translate(280 112)">
          <circle r="13" fill="#ff9a3c" opacity="0.35" />
          <circle r="6" fill="#ffb347" />
          <circle r="2.8" fill="#fff4cf" />
        </g>
      </svg>
    </div>
  );
}
