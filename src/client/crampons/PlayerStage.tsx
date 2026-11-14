// La vitrine à l'écran : des joueurs en 3D, de près (scene/stage.ts). Le film ne tourne que lorsqu'on le voit, une seule
// image si les animations sont coupées ; sans 3D (vieux téléphone), on montre le dessin prévu à la place.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePrefs } from "../stores/prefs.ts";
import { celebrationScript, lineupScript, PlayerStage, type StageActor, type StageCamera } from "./scene/stage.ts";

/** Les cadrages : un joueur qui arrive en courant et célèbre ; deux joueurs debout face à nous ; un seul */
const CAMERAS: Record<StageFraming, StageCamera> = {
  celebration: { x: 1.0, y: 1.32, z: 5.3, tx: 0.05, ty: 1.16, tz: 0, fov: 31 },
  lineup: { x: 0, y: 1.25, z: 5.3, tx: 0, ty: 1.0, tz: 0, fov: 27 },
  solo: { x: 0.35, y: 1.2, z: 4.6, tx: 0, ty: 1.02, tz: 0, fov: 27 },
};

export type StageFraming = "celebration" | "lineup" | "solo";

const FILL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" };

export function PlayerStageView({
  actors,
  pose,
  framing,
  seed = 11,
  ratio = 16 / 10,
  fallback,
  children,
  className,
  label,
}: {
  actors: StageActor[];
  /** Une célébration (le numéro de la boutique, null : « à sa façon ») ; absent : les joueurs debout */
  pose?: number | null;
  framing: StageFraming;
  seed?: number;
  ratio?: number;
  /** Ce qu'on montre si la 3D n'est pas disponible */
  fallback?: ReactNode;
  /** Par-dessus la vitrine (les noms des clubs…) */
  children?: ReactNode;
  className?: string;
  /** Ce que la vitrine montre, pour les lecteurs d'écran */
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<PlayerStage | null>(null);
  const [failed, setFailed] = useState(false);
  const reduced = usePrefs((p) => p.reducedEffects);
  const actorsKey = JSON.stringify(actors);
  const celebrating = pose !== undefined;
  const script = useMemo(
    () => (celebrating ? celebrationScript(pose ?? null) : lineupScript(actors.length)),
    // Un nouveau film quand la célébration ou le nombre de joueurs change
    [celebrating, pose, actors.length],
  );

  // La scène, sur une toile à elle : la carte graphique la rend en partant, et une toile rendue ne resservirait plus
  useEffect(() => {
    const box = wrap.current!;
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, FILL, { transition: "opacity 0.12s linear" });
    box.prepend(canvas);
    let s: PlayerStage;
    try {
      s = new PlayerStage(canvas);
    } catch {
      canvas.remove();
      setFailed(true);
      return;
    }
    stage.current = s;
    const size = new ResizeObserver(() => s.resize(box.clientWidth, box.clientHeight));
    size.observe(box);
    s.resize(box.clientWidth, box.clientHeight);
    let onScreen = false;
    const update = () => s.setVisible(onScreen && document.visibilityState === "visible");
    const seen = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      update();
    });
    seen.observe(box);
    document.addEventListener("visibilitychange", update);
    return () => {
      size.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", update);
      stage.current = null;
      s.dispose();
      canvas.remove();
    };
  }, []);

  // Les réglages : ces effets passent toujours après celui qui crée la scène (même quand React les rejoue tous)
  useEffect(() => stage.current?.setCamera(CAMERAS[framing]), [framing]);
  useEffect(() => {
    stage.current?.setActors(JSON.parse(actorsKey) as StageActor[], seed);
  }, [actorsKey, seed]);
  useEffect(() => stage.current?.setScript(script), [script]);
  useEffect(() => stage.current?.setStill(reduced), [reduced]);

  if (failed) return fallback ? <>{fallback}</> : null;
  return (
    <div
      ref={wrap}
      className={className}
      role="img"
      aria-label={label}
      style={{ position: "relative", width: "100%", aspectRatio: String(ratio) }}
    >
      {children}
    </div>
  );
}

export default PlayerStageView;
