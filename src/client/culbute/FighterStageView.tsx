// Le combattant en 3D, dans une vitrine (scene/stage.ts) : au salon pour voir son choix, à la boutique avant d'acheter
// une tenue. Il ne bouge que lorsqu'on le voit, une seule image si les animations sont coupées ; sans 3D, on montre le
// dessin prévu à la place.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AVATAR_BACKGROUNDS, type AvatarConfig } from "../../shared/avatar.ts";
import { avatarPalette, HABITUES, PALETTES, type FighterPick, type TenueId } from "../../shared/games/culbute/fighters.ts";
import type { HabitueId } from "../../shared/games/culbute/model.ts";
import { usePrefs } from "../stores/prefs.ts";
import type { FighterLook } from "./scene/fighter.ts";
import { FighterStage } from "./scene/stage.ts";

const FILL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" };

/** Le dessin d'un choix : un Habitué dans une tenue, ou son propre personnage avec le style d'un Habitué */
export function lookOfPick(pick: FighterPick, me: { name: string; avatar: AvatarConfig } | null, tenue?: TenueId): FighterLook {
  if (pick.who === "moi" && me) {
    return {
      slot: 0,
      name: me.name,
      avatar: me.avatar,
      style: pick.style,
      palette: avatarPalette(AVATAR_BACKGROUNDS[me.avatar.bg] ?? "#3f7fd8", pick.style),
      color: "#f2c94c",
      me: false,
      outfit: "moi",
    };
  }
  const who: HabitueId = pick.who === "moi" ? pick.style : pick.who;
  const t = tenue ?? (pick.who !== "moi" ? pick.tenue : undefined) ?? "dimanche";
  return {
    slot: 0,
    name: HABITUES[who].name,
    avatar: HABITUES[who].avatar,
    style: who,
    palette: PALETTES[who][t],
    color: "#f2c94c",
    me: false,
    outfit: who,
  };
}

export function FighterStageView({
  look,
  ratio = 1,
  fallback,
  label,
  className,
  mode = "show",
}: {
  look: FighterLook;
  /** Montrer quelques coups (le salon, la boutique), ou fêter la victoire (la fin du combat) */
  mode?: "show" | "victory";
  ratio?: number;
  fallback?: ReactNode;
  label: string;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<FighterStage | null>(null);
  const [failed, setFailed] = useState(false);
  const reduced = usePrefs((p) => p.reducedEffects);
  const lookKey = JSON.stringify(look);

  // La scène, sur une toile à elle (une toile rendue par la carte graphique ne resservirait plus)
  useEffect(() => {
    const box = wrap.current!;
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, FILL);
    box.prepend(canvas);
    let s: FighterStage;
    try {
      s = new FighterStage(canvas);
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

  // Ces réglages passent après la création de la scène (même quand React rejoue tous les effets)
  useEffect(() => {
    stage.current?.setLook(JSON.parse(lookKey) as FighterLook);
  }, [lookKey]);
  useEffect(() => stage.current?.setStill(reduced), [reduced]);
  useEffect(() => stage.current?.setMode(mode), [mode]);

  if (failed) return fallback ? <>{fallback}</> : null;
  return (
    <div
      ref={wrap}
      className={className}
      role="img"
      aria-label={label}
      style={{ position: "relative", width: "100%", aspectRatio: String(ratio) }}
    />
  );
}
