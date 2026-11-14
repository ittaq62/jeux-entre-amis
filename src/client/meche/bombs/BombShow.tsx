import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { seededAvatar, type AvatarConfig } from "../../../shared/avatar.ts";
import type { BombId } from "../../../shared/games/meche/bombs.ts";
import type { FuseView } from "../../../shared/games/meche/view.ts";
import { Avatar } from "../../components/Avatar.tsx";
import { play, preloadSounds } from "../../lib/sound.ts";
import { FuseRope } from "../FuseRope.tsx";
import { BombBlast, BombBurst } from "./BombFx.tsx";
import { bombTheme, bombVars } from "./theme.ts";
import "../meche.css";

/** Une mèche de l'aperçu : elle brûle ce temps-là, après un court instant posée sur la table */
const BURN_MS = 2700;
const LIGHT_MS = 350;
/** Le temps de voir la fin avant que tout recommence */
const AFTER_MS = 2900;

/**
 * L'aperçu d'une bombe, en boucle : une petite table de Mèche, la mèche qui brûle jusqu'à la zone rouge, puis la bombe
 * qui saute sur un joueur avec sa fin à elle, son cri et la trace qu'elle lui laisse. `audible` : à chaque fois qu'il
 * change (on vient de toucher la bombe), le tour suivant se fait entendre ; sinon l'aperçu reste muet. `loud` : le
 * premier tour s'entend aussi (la fiche d'achat, ouverte d'un geste).
 */
export function BombShow({
  bomb,
  audible = 0,
  loud = false,
  avatar,
  className = "",
}: {
  bomb: BombId;
  audible?: number;
  loud?: boolean;
  avatar?: AvatarConfig;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cycle, setCycle] = useState(0);
  const [fuse, setFuse] = useState<FuseView | null>(null);
  const [hot, setHot] = useState(false);
  const [gone, setGone] = useState(false);
  const [boom, setBoom] = useState<number | null>(null);
  const [mark, setMark] = useState(false);
  const heard = useRef(loud ? Number.NaN : audible);
  const face = useRef(avatar ?? seededAvatar("meche-apercu")).current;
  const theme = bombTheme(bomb);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => preloadSounds([theme.fuse, theme.boom]), [theme.fuse, theme.boom]);

  // Une autre bombe, ou on vient de la toucher : on reprend du début
  useEffect(() => setCycle((c) => c + 1), [bomb, audible]);

  useEffect(() => {
    if (cycle === 0) return;
    const loud = heard.current !== audible;
    heard.current = audible;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    setGone(false);
    setBoom(null);
    setMark(false);
    setFuse({ at: Date.now() + LIGHT_MS, left: BURN_MS, length: BURN_MS, speed: 1, accel: 0, risk: 0.62 });
    if (loud) at(LIGHT_MS, () => play(theme.fuse, { volume: 0.9 }));
    at(LIGHT_MS + BURN_MS, () => {
      setFuse(null);
      setGone(true);
      setBoom(cycle);
      setMark(true);
      if (loud) play(theme.boom);
    });
    at(LIGHT_MS + BURN_MS + 1500, () => setBoom(null));
    at(LIGHT_MS + BURN_MS + theme.markMs, () => setMark(false));
    at(LIGHT_MS + BURN_MS + AFTER_MS, () => setCycle((c) => c + 1));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle]);

  // La table à gauche, le joueur qui tient la mèche à droite : tout se calcule sur la taille de l'aperçu
  const D = Math.max(60, Math.min(size.w * 0.52, size.h * 0.8));
  const R = D / 2;
  const cx = size.w * 0.4;
  const cy = size.h * 0.56;
  const a = Math.round(Math.max(30, Math.min(64, D * 0.34)));
  const victim = { x: Math.min(size.w - a * 0.7, cx + R + a * 0.95), y: cy + R * 0.18 };
  const from = { x: cx, y: cy - R + 14 * (D / 300) };
  const phone = D < 230;

  return (
    <div
      ref={box}
      className={`meche-root bomb-show ${phone ? "is-phone" : ""} ${className}`}
      style={{ ...bombVars(bomb), "--burst": `${Math.round(D * 0.2)}px` } as CSSProperties}
      aria-hidden="true"
    >
      {size.w > 0 && (
        <>
          <div className={`meche-table ${hot ? "is-hot" : ""}`} style={{ left: cx - R, top: cy - R, width: D, height: D }}>
            <FuseRope fuse={fuse} glide={false} serverOffset={0} onHot={setHot} hot={hot} bomb={bomb} bombGone={gone} />
          </div>
          <div
            className={`bomb-show-seat ${fuse ? "is-holder" : ""} ${hot ? "is-hot" : ""}`}
            style={{ left: victim.x, top: victim.y, "--a": `${a}px` } as CSSProperties}
          >
            <div
              className={`bomb-show-avatar ${mark ? `bomb-mark bomb-mark-${bomb}` : ""}`}
              style={{ "--mark": `${theme.markMs}ms` } as CSSProperties}
            >
              <Avatar avatar={face} size={a} />
            </div>
          </div>
          <AnimatePresence>
            {boom !== null && <BombBlast key={`b${boom}`} bomb={bomb} at={victim} from={from} avatar={a} />}
          </AnimatePresence>
          <AnimatePresence>
            {boom !== null && <BombBurst key={`w${boom}`} bomb={bomb} at={{ x: cx, y: cy }} width={D * 0.98} />}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
