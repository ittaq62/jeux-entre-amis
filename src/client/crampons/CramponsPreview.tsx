// L'illustration de Crampons sur l'accueil : un coin de pelouse, un but, un ballon qui part en lucarne.

import "./crampons.css";

export function CramponsPreview() {
  return (
    <svg className="crampons-preview" viewBox="0 0 480 340" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      {/* Les lignes de la surface */}
      <g fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="4">
        <path d="M30 318 L90 136 H392 L452 318" />
        <path d="M150 170 L142 212 H338 L330 170" />
        <path d="M172 318 Q240 268 308 318" />
      </g>
      {/* Le but */}
      <path d="M166 136 V58 H314 V136" fill="rgba(255,255,255,0.12)" />
      <g stroke="rgba(255,255,255,0.4)" strokeWidth="1.4">
        {Array.from({ length: 13 }, (_, i) => (
          <path key={`v${i}`} d={`M${172 + i * 11.4} 60 V134`} />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <path key={`h${i}`} d={`M168 ${68 + i * 11} H312`} />
        ))}
      </g>
      <path d="M164 138 V56 H316 V138" fill="none" stroke="#fbfbf6" strokeWidth="7" strokeLinejoin="round" />
      {/* La trajectoire et le ballon */}
      <path
        d="M254 292 Q330 180 290 88"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="5"
        strokeDasharray="2 13"
        strokeLinecap="round"
      />
      <g transform="translate(288 82)">
        <circle r="24" fill="#fbf7ec" stroke="#2a2a2a" strokeWidth="2" />
        <path d="M-24 -4 Q0 -16 24 -4 M-24 8 Q0 20 24 8" stroke="#e0453a" strokeWidth="6" fill="none" />
        <path d="M0 -8 l3 6 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z" fill="#1f3f8f" />
      </g>
      {/* Une chaussure à crampons */}
      <g transform="translate(150 270) rotate(-14)">
        <path
          d="M-74 16 Q-78 -24 -46 -32 L-12 -34 Q12 -8 56 -6 Q84 -2 84 18 Q84 26 70 26 H-62 Q-74 26 -74 16Z"
          fill="#d6322e"
          stroke="#7a1712"
          strokeWidth="4"
        />
        <path d="M-10 -32 L24 -2 M2 -34 L34 -3" stroke="#fbfbf6" strokeWidth="5" />
        <path d="M-74 22 H84" stroke="#fbfbf6" strokeWidth="6" />
        {[-54, -22, 26, 62].map((x) => (
          <path key={x} d={`M${x - 7} 28 h14 l-4 12 h-6z`} fill="#f2c230" stroke="#7a5a10" strokeWidth="2" />
        ))}
      </g>
    </svg>
  );
}
