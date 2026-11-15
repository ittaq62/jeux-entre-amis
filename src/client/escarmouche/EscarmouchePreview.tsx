// L'illustration d'Escarmouche sur l'accueil : le hameau au soleil couchant, en ombres chinoises. Un soldat à l'abri
// derrière un muret épaule son fusil ; une rafale file vers les toits d'en face, une fenêtre répond. La 3D ne se charge
// qu'à table : ici, tout est dessiné (SVG) et animé en CSS (banners.css n'y est pour rien : escarmouche.css).

import "./escarmouche.css";

export function EscarmouchePreview() {
  return (
    <svg className="esc-preview" viewBox="0 0 400 240" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="esc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b4f6b" />
          <stop offset="0.55" stopColor="#c99a6a" />
          <stop offset="1" stopColor="#e8b77c" />
        </linearGradient>
        <radialGradient id="esc-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3cf" />
          <stop offset="1" stopColor="#ffd28a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#esc-sky)" />
      <circle cx="292" cy="150" r="70" fill="url(#esc-sun)" />
      <circle cx="292" cy="150" r="20" fill="#fff0c8" opacity="0.9" />
      {/* Les collines, puis les toits du hameau et le clocher */}
      <path d="M0 168 Q 60 140 120 160 T 250 150 T 400 158 L400 240 L0 240 Z" fill="#5b5148" opacity="0.6" />
      <path
        d="M150 190 L150 150 L172 132 L194 150 L194 190 Z M200 190 L200 120 L208 120 L208 96 L214 78 L220 96 L220 120 L228 120 L228 190 Z M232 190 L232 158 L258 140 L284 158 L284 190 Z M288 190 L288 146 L306 132 L324 146 L324 190 Z M326 190 L326 162 L352 150 L378 162 L378 190 Z"
        fill="#2e2724"
      />
      <rect x="166" y="160" width="10" height="9" fill="#ffcf73" className="esc-preview-window" />
      <rect x="300" y="152" width="8" height="8" fill="#f2b85e" opacity="0.7" />
      {/* Le sol et le muret */}
      <rect y="190" width="400" height="50" fill="#231d1a" />
      <path d="M0 214 L150 206 L150 240 L0 240 Z" fill="#171310" />
      {/* Le soldat accroupi, fusil épaulé */}
      <g fill="#120f0d">
        <path d="M70 206 Q 72 184 86 180 L 98 182 Q 104 190 102 206 Z" />
        <ellipse cx="90" cy="172" rx="10" ry="8" />
        <path d="M80 166 Q 90 158 100 166 Z" />
        <path d="M96 182 L 150 176 L 151 180 L 100 188 Z" />
        <rect x="112" y="173" width="16" height="4" />
        <path d="M66 206 L 60 222 L 74 222 L 80 206 Z M 92 206 L 102 222 L 114 222 L 100 204 Z" />
      </g>
      {/* La rafale vers les toits, et la flamme au bout du canon */}
      <g className="esc-preview-burst">
        <circle cx="153" cy="177" r="6" fill="#ffd28a" className="esc-preview-flash" />
        <line x1="156" y1="176" x2="210" y2="158" stroke="#ffe1a8" strokeWidth="1.4" className="esc-preview-tracer is-1" />
        <line x1="156" y1="176" x2="240" y2="152" stroke="#ffe1a8" strokeWidth="1.2" className="esc-preview-tracer is-2" />
        <line x1="156" y1="176" x2="226" y2="163" stroke="#ffe1a8" strokeWidth="1.2" className="esc-preview-tracer is-3" />
      </g>
      <line x1="170" y1="164" x2="120" y2="178" stroke="#ffcf73" strokeWidth="1" className="esc-preview-reply" />
    </svg>
  );
}
