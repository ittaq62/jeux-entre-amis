import { useEffect, useRef, useState } from "react";
import type { BombId } from "../../shared/games/meche/bombs.ts";
import { ropeLeft } from "../../shared/games/meche/engine.ts";
import { fuseProgress, type FuseView } from "../../shared/games/meche/view.ts";
import { BombArt } from "./bombs/BombArt.tsx";

interface Props {
  fuse: FuseView | null;
  /** La même corde qui recule (mèche à rallonge) : elle repart en arrière en glissant. Sinon, c'est une autre mèche. */
  glide: boolean;
  serverOffset: number;
  /** L'étincelle vient d'entrer dans la zone rouge (ou d'en sortir, à la mèche suivante) */
  onHot?: (hot: boolean) => void;
  /** Ce qui saute au bout : la bombe de celui qui a allumé la mèche */
  bomb: BombId;
  /** La bombe a sauté : elle n'est plus sur la table jusqu'à la mèche suivante */
  bombGone: boolean;
  hot: boolean;
}

/** La corde court sur le rebord de la table */
const MARGIN = 7;
/** La place laissée en haut pour la bombe, où la corde finit */
const GAP = 40;

/** Le point de départ de la corde (là où on l'allume), dans le carré de la table */
export function ropeStart(tableR: number): { x: number; y: number } {
  const r = tableR - MARGIN;
  const phi = Math.min(0.5, GAP / r);
  return { x: tableR + r * Math.sin(phi), y: tableR - r * Math.cos(phi) };
}

/** La corde fait le tour de la table ronde dans le sens des aiguilles d'une montre, de la bombe jusqu'à la bombe */
function ropePath(w: number, h: number): string {
  const r = Math.min(w, h) / 2 - MARGIN;
  const cx = w / 2;
  const cy = h / 2;
  const phi = Math.min(0.5, GAP / r);
  const x = r * Math.sin(phi);
  const y = cy - r * Math.cos(phi);
  return `M${cx + x} ${y} A${r} ${r} 0 1 1 ${cx - x} ${y}`;
}

/**
 * La mèche : une corde claire qui finit rouge. L'étincelle y avance toute seule, image par image, sans passer par
 * React ; quand un mot la fait reculer (mèche à rallonge), elle repart en arrière en glissant. Quand c'est une autre
 * mèche (le tour suivant à la classique, le joueur suivant à chacun la sienne), elle y saute d'un coup, avec un éclat.
 * Les pointillés ont toujours un vide plus long que la corde : jamais un bout de motif ne repasse au bout de la corde.
 * La part brûlée est aussi posée en `--p` sur la table : certaines bombes la suivent (le ballon gonfle, la jauge monte…).
 */
export function FuseRope({ fuse, glide, serverOffset, onHot, bomb, bombGone, hot }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<SVGPathElement>(null);
  const burnt = useRef<SVGPathElement>(null);
  const burntCore = useRef<SVGPathElement>(null);
  const spark = useRef<SVGGElement>(null);
  const flash = useRef<SVGCircleElement>(null);
  const gain = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const hotRef = useRef(false);
  const onHotRef = useRef(onHot);
  onHotRef.current = onHot;
  // Ce qui est dessiné : il rattrape l'avancée réelle, en glissant quand la mèche recule
  const drawn = useRef(0);
  // La mèche d'avant, pour savoir ce qu'un mot a fait gagner
  const previous = useRef<FuseView | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = fuse;
    if (!fuse || size.w === 0) {
      box.current?.style.setProperty("--p", "0");
      burnt.current?.setAttribute("stroke-dasharray", "0 3000");
      burntCore.current?.setAttribute("stroke-dasharray", "0 3000");
      drawn.current = 0;
      if (hotRef.current) {
        hotRef.current = false;
        onHotRef.current?.(false);
      }
      return;
    }
    // La même corde qui recule : ce que le mot a fait gagner s'envole de l'étincelle, en secondes à la vitesse du moment
    if (glide && before && before !== fuse) {
      const now = Date.now() + serverOffset;
      const won = (ropeLeft(fuse, now) - ropeLeft(before, now)) / Math.max(0.1, fuse.speed) / 1000;
      const path = line.current;
      if (won >= 0.5 && path && gain.current) {
        const at = path.getPointAtLength(drawn.current * path.getTotalLength());
        const half = Math.round(won * 2) / 2;
        gain.current.textContent = `+${String(half).replace(".", ",")} s`;
        gain.current.style.left = `${at.x}px`;
        gain.current.style.top = `${at.y}px`;
        gain.current.animate(
          [
            { opacity: 0, transform: "translate(-50%, -30%) scale(0.7)" },
            { opacity: 1, transform: "translate(-50%, -110%) scale(1.05)", offset: 0.2 },
            { opacity: 0, transform: "translate(-50%, -260%) scale(1)" },
          ],
          { duration: 1300, easing: "ease-out" },
        );
      }
    }
    let frame = 0;
    let last = performance.now();
    const draw = () => {
      const t = performance.now();
      const dt = (t - last) / 1000;
      last = t;
      const target = fuseProgress(fuse, Date.now() + serverOffset);
      if (target < drawn.current - 0.01 && !glide) {
        // Une autre mèche : on y saute, et l'étincelle jaillit de nouveau
        drawn.current = target;
        flash.current?.animate(
          [
            { opacity: 0.95, transform: "scale(0.35)" },
            { opacity: 0, transform: "scale(1.9)" },
          ],
          { duration: 480, easing: "ease-out" },
        );
      }
      // En avant, on suit ; en arrière, on glisse (toute la corde en 0,7 s au plus vite)
      drawn.current = target < drawn.current ? Math.max(target, drawn.current - dt * 1.4) : target;
      const p = drawn.current;
      box.current?.style.setProperty("--p", p.toFixed(3));
      const dash = `${p * 1000} 3000`;
      burnt.current?.setAttribute("stroke-dasharray", dash);
      burntCore.current?.setAttribute("stroke-dasharray", dash);
      const path = line.current;
      if (path && spark.current) {
        const at = path.getPointAtLength(p * path.getTotalLength());
        spark.current.setAttribute("transform", `translate(${at.x} ${at.y})`);
      }
      const nowHot = target >= fuse.risk;
      if (nowHot !== hotRef.current) {
        hotRef.current = nowHot;
        onHotRef.current?.(nowHot);
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [fuse, glide, serverOffset, size.w, size.h]);

  const d = size.w > 0 ? ropePath(size.w, size.h) : "";
  const risk = fuse ? Math.min(1, Math.max(0, fuse.risk)) : 1;
  const red = `0 ${risk * 1000} 3000`;
  return (
    <div ref={box} className={`meche-rope bomb-${bomb} ${fuse ? "is-lit" : ""}`} aria-hidden="true">
      <div className="bomb-haze" />
      {size.w > 0 && (
        <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
          <path d={d} className="rope-shadow" />
          <path ref={line} d={d} className="rope-body" />
          <path d={d} className="rope-strand" />
          {fuse && <path d={d} className="rope-red" pathLength={1000} strokeDasharray={red} />}
          {fuse && <path d={d} className="rope-red-strand" pathLength={1000} strokeDasharray={red} />}
          <path ref={burnt} d={d} className="rope-burnt" pathLength={1000} strokeDasharray="0 3000" />
          <path ref={burntCore} d={d} className="rope-burnt-core" pathLength={1000} strokeDasharray="0 3000" />
          {fuse && (
            <g ref={spark} className="rope-spark">
              <circle ref={flash} r={22} className="spark-flash" />
              <circle r={15} className="spark-glow" />
              <circle r={6.5} className="spark-flame" />
              <circle r={3} className="spark-core" />
              <path d="M0-12V-7M0 7V12M-12 0H-7M7 0H12M-8.5-8.5-5-5M5 5 8.5 8.5M-8.5 8.5-5 5M5-5 8.5-8.5" className="spark-rays" />
              <circle r={1.6} className="spark-ember is-a" />
              <circle r={1.3} className="spark-ember is-b" />
              <circle r={1.5} className="spark-ember is-c" />
            </g>
          )}
        </svg>
      )}
      <span ref={gain} className="rope-gain" />
      <div className={`meche-bomb ${hot ? "is-hot" : ""} ${bombGone ? "is-gone" : ""}`}>
        <BombArt id={bomb} />
      </div>
    </div>
  );
}
