import type { CSSProperties } from "react";
import type { BombId } from "../../../shared/games/meche/bombs.ts";
import type { SoundName } from "../../lib/sound.ts";

/**
 * Ce que chaque bombe change autour d'elle : la couleur de la mèche et de l'étincelle (la lueur de la table, l'anneau
 * de celui qui la tient, la flamme qui saute de main en main), l'éclair à l'écran, les débris qui volent, ses sons et
 * le temps que dure sa fin. La zone rouge de la corde, elle, reste rouge pour toutes : c'est elle qu'on surveille.
 */
export interface BombTheme {
  /** La corde, ses torons, l'étincelle et sa lueur, la lueur quand ça chauffe, l'éclair à l'écran */
  rope: string;
  ropeDark: string;
  spark: string;
  sparkHot: string;
  glow: string;
  flash: string;
  /** Les débris qui volent chez celui qui la reçoit */
  debris: { colors: string[]; shapes: ("circle" | "square" | "star")[]; count: number; gravity: number; speed: number };
  /** La corde qui brûle, en boucle, et la fin */
  fuse: SoundName;
  boom: SoundName;
  /** Ce que dure la fin chez celui qui la reçoit (ms), et combien de temps il en garde la trace */
  fxMs: number;
  markMs: number;
}

export const BOMB_THEMES: Record<BombId, BombTheme> = {
  dynamite: {
    rope: "#c9a06a",
    ropeDark: "#8d6a3e",
    spark: "#ffb347",
    sparkHot: "#ff6a3c",
    glow: "rgba(255, 150, 60, 0.3)",
    flash: "#fff1cf",
    debris: {
      colors: ["#2a211a", "#ff9a3c", "#ffd36b", "#7a6a5c", "#e5442c"],
      shapes: ["circle", "square"],
      count: 54,
      gravity: 0.9,
      speed: 28,
    },
    fuse: "mecheFuse",
    boom: "mecheBoom",
    fxMs: 1600,
    markMs: 2600,
  },
  ballon: {
    rope: "#f1ece4",
    ropeDark: "#c8bfb2",
    spark: "#ff6fa8",
    sparkHot: "#ff3d6e",
    glow: "rgba(255, 110, 170, 0.32)",
    flash: "#ffe1ee",
    debris: { colors: ["#ff4d7d", "#e8335f", "#ff9ec0", "#ffffff"], shapes: ["square"], count: 40, gravity: 1.1, speed: 26 },
    fuse: "mecheFuseBallon",
    boom: "mecheBoomBallon",
    fxMs: 1500,
    markMs: 2400,
  },
  neige: {
    rope: "#dceaf3",
    ropeDark: "#9fb9cb",
    spark: "#8fdcff",
    sparkHot: "#4fb6ff",
    glow: "rgba(140, 215, 255, 0.34)",
    flash: "#e6f6ff",
    debris: { colors: ["#ffffff", "#e3f3ff", "#bfe3ff"], shapes: ["circle"], count: 60, gravity: 0.45, speed: 22 },
    fuse: "mecheFuseNeige",
    boom: "mecheBoomNeige",
    fxMs: 1700,
    markMs: 3000,
  },
  gateau: {
    rope: "#f6c5d6",
    ropeDark: "#d98aa7",
    spark: "#ffd36b",
    sparkHot: "#ff8a5c",
    glow: "rgba(255, 200, 110, 0.32)",
    flash: "#fff4e4",
    debris: { colors: ["#ff5d8f", "#ffd23f", "#43c6ac", "#6a8dff", "#fff7ef"], shapes: ["square"], count: 50, gravity: 0.9, speed: 24 },
    fuse: "mecheFuseGateau",
    boom: "mecheBoomGateau",
    fxMs: 1600,
    markMs: 3000,
  },
  reveil: {
    rope: "#d8b46a",
    ropeDark: "#8f6c2c",
    spark: "#ffe07a",
    sparkHot: "#ffb02e",
    glow: "rgba(255, 220, 110, 0.32)",
    flash: "#fff8d6",
    debris: { colors: ["#c9ced6", "#8a929c", "#e2b84d", "#4b5260"], shapes: ["square", "circle"], count: 34, gravity: 1, speed: 24 },
    fuse: "mecheFuseReveil",
    boom: "mecheBoomReveil",
    fxMs: 1700,
    markMs: 2400,
  },
  ruche: {
    rope: "#e2ac46",
    ropeDark: "#9c6c18",
    spark: "#ffc93c",
    sparkHot: "#ff9a1f",
    glow: "rgba(255, 195, 60, 0.32)",
    flash: "#fff2c8",
    debris: { colors: ["#ffcc33", "#1c1610", "#e8a317"], shapes: ["circle"], count: 30, gravity: 0.7, speed: 20 },
    fuse: "mecheFuseRuche",
    boom: "mecheBoomRuche",
    fxMs: 2100,
    markMs: 3000,
  },
  fusee: {
    rope: "#e9e2d2",
    ropeDark: "#c0392b",
    spark: "#fff07a",
    sparkHot: "#ff7a3c",
    glow: "rgba(255, 240, 140, 0.34)",
    flash: "#fffbe6",
    debris: {
      colors: ["#ff4d6d", "#ffd23f", "#4dd2ff", "#7cff6b", "#c77dff"],
      shapes: ["star", "circle"],
      count: 70,
      gravity: 0.6,
      speed: 32,
    },
    fuse: "mecheFuseFusee",
    boom: "mecheBoomFusee",
    fxMs: 1900,
    markMs: 2600,
  },
  gaz: {
    rope: "#6d7a4e",
    ropeDark: "#454e2f",
    spark: "#a8e65a",
    sparkHot: "#d6f04a",
    glow: "rgba(160, 230, 90, 0.34)",
    flash: "#e9ffd0",
    debris: { colors: ["#9be15d", "#5fae3a", "#d6f04a", "#3c6e2a"], shapes: ["circle"], count: 36, gravity: -0.15, speed: 12 },
    fuse: "mecheFuseGaz",
    boom: "mecheBoomGaz",
    fxMs: 2600,
    markMs: 3400,
  },
};

export const bombTheme = (id: BombId | null | undefined): BombTheme => BOMB_THEMES[id ?? "dynamite"] ?? BOMB_THEMES.dynamite;

/** Les couleurs de la bombe, à poser sur la table (ou sur l'aperçu) : la corde, l'étincelle et tout ce qui en reprend la lueur */
export function bombVars(id: BombId | null | undefined): CSSProperties {
  const t = bombTheme(id);
  return {
    "--rope": t.rope,
    "--rope-dark": t.ropeDark,
    "--spark": t.spark,
    "--spark-hot": t.sparkHot,
    "--spark-glow": t.glow,
    "--flash": t.flash,
  } as CSSProperties;
}

/** Tous les sons des bombes de la table, pour les précharger */
export function bombSounds(ids: Iterable<BombId>): SoundName[] {
  const out = new Set<SoundName>();
  for (const id of ids) {
    const t = bombTheme(id);
    out.add(t.fuse);
    out.add(t.boom);
  }
  return [...out];
}
