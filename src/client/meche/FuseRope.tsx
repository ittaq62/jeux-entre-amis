import { useEffect, useRef, useState } from "react";

interface Props {
  litAt: number;
  safeUntil: number;
  maxUntil: number;
  lit: boolean;
  serverOffset: number;
  /** L'étincelle vient d'entrer dans la zone rouge (ou d'en sortir, à la mèche suivante) */
  onHot?: (hot: boolean) => void;
}

const RADIUS = 28;
const MARGIN = 9;
/** La place laissée en haut pour le pétard, où la corde finit */
const GAP = 34;

/** La corde fait le tour de la caisse dans le sens des aiguilles d'une montre, du pétard jusqu'au pétard */
function ropePath(w: number, h: number): string {
  const m = MARGIN;
  const r = RADIUS;
  const cx = w / 2;
  return [
    `M${cx + GAP} ${m}`,
    `H${w - m - r}`,
    `A${r} ${r} 0 0 1 ${w - m} ${m + r}`,
    `V${h - m - r}`,
    `A${r} ${r} 0 0 1 ${w - m - r} ${h - m}`,
    `H${m + r}`,
    `A${r} ${r} 0 0 1 ${m} ${h - m - r}`,
    `V${m + r}`,
    `A${r} ${r} 0 0 1 ${m + r} ${m}`,
    `H${cx - GAP}`,
  ].join(" ");
}

/**
 * La mèche : une corde claire qui finit rouge. L'étincelle y avance toute seule, image par image, sans passer par
 * React. Elle peut sauter n'importe quand dans le rouge : seul le serveur sait où.
 */
export function FuseRope({ litAt, safeUntil, maxUntil, lit, serverOffset, onHot }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<SVGPathElement>(null);
  const burnt = useRef<SVGPathElement>(null);
  const burntCore = useRef<SVGPathElement>(null);
  const spark = useRef<SVGGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const hotRef = useRef(false);
  const onHotRef = useRef(onHot);
  onHotRef.current = onHot;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const span = Math.max(1, maxUntil - litAt);
  const safe = lit ? Math.min(1, (safeUntil - litAt) / span) : 1;

  useEffect(() => {
    if (!lit || size.w === 0) {
      burnt.current?.setAttribute("stroke-dasharray", "0 1000");
      burntCore.current?.setAttribute("stroke-dasharray", "0 1000");
      if (hotRef.current) {
        hotRef.current = false;
        onHotRef.current?.(false);
      }
      return;
    }
    let frame = 0;
    const draw = () => {
      const now = Date.now() + serverOffset;
      const p = Math.max(0, Math.min(1, (now - litAt) / span));
      const dash = `${p * 1000} ${1000 - p * 1000}`;
      burnt.current?.setAttribute("stroke-dasharray", dash);
      burntCore.current?.setAttribute("stroke-dasharray", dash);
      const path = line.current;
      if (path && spark.current) {
        const at = path.getPointAtLength(p * path.getTotalLength());
        spark.current.setAttribute("transform", `translate(${at.x} ${at.y})`);
      }
      const hot = now >= safeUntil;
      if (hot !== hotRef.current) {
        hotRef.current = hot;
        onHotRef.current?.(hot);
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [lit, litAt, span, safeUntil, serverOffset, size.w, size.h]);

  const d = size.w > 0 ? ropePath(size.w, size.h) : "";
  return (
    <div ref={box} className={`meche-rope ${lit ? "is-lit" : ""}`} aria-hidden="true">
      {size.w > 0 && (
        <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
          <path d={d} className="rope-shadow" />
          <path ref={line} d={d} className="rope-body" />
          <path d={d} className="rope-strand" />
          <path d={d} className="rope-red" pathLength={1000} strokeDasharray={`0 ${safe * 1000} ${(1 - safe) * 1000} 0`} />
          <path d={d} className="rope-red-strand" pathLength={1000} strokeDasharray={`0 ${safe * 1000} ${(1 - safe) * 1000} 0`} />
          <path ref={burnt} d={d} className="rope-burnt" pathLength={1000} strokeDasharray="0 1000" />
          <path ref={burntCore} d={d} className="rope-burnt-core" pathLength={1000} strokeDasharray="0 1000" />
          {lit && (
            <g ref={spark} className="rope-spark">
              <circle r={15} className="spark-glow" />
              <circle r={6.5} className="spark-flame" />
              <circle r={3} className="spark-core" />
              <path d="M0-12V-7M0 7V12M-12 0H-7M7 0H12M-8.5-8.5-5-5M5 5 8.5 8.5M-8.5 8.5-5 5M5-5 8.5-8.5" className="spark-rays" />
            </g>
          )}
        </svg>
      )}
      <Dynamite />
    </div>
  );
}

/** Le pétard au bout de la corde */
function Dynamite() {
  return (
    <svg className="meche-dynamite" viewBox="0 0 64 28" width="64" height="28">
      <rect x="3" y="5" width="58" height="18" rx="4" fill="#b8352b" />
      <rect x="3" y="5" width="58" height="6" rx="3" fill="#d9554a" />
      <rect x="11" y="4" width="4" height="20" fill="#7d211a" />
      <rect x="49" y="4" width="4" height="20" fill="#7d211a" />
      <text
        x="32"
        y="19.5"
        textAnchor="middle"
        fontSize="13"
        fontWeight="800"
        fontFamily="var(--font-card)"
        fill="#f7e9d2"
        letterSpacing="1.5"
      >
        BOUM
      </text>
    </svg>
  );
}
