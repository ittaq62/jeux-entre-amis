// Les calques plein écran de la course : la crème d'une tarte, l'éclair de la foudre, l'aura d'un bonus, et le choc
// d'un coup reçu (l'huile, le pétard, la fusée…). Ils sont frères dans la page : chacun doit avoir sa propre clé.
// Avec deux compteurs différents comme clés (l'éclair et le choc), il suffisait qu'ils tombent sur le même numéro
// pour que React recrée le calque à chaque rafraîchissement : son animation repartait de zéro, et le choc restait
// à l'écran jusqu'au coup suivant.

import type { Hud } from "./runtime.ts";

export interface ScreenLayer {
  key: string;
  className: string;
  /** Les taches d'huile à dessiner dedans */
  oil: boolean;
}

/** Les calques à montrer, dans l'ordre où ils s'empilent ; `reduced` : sans les effets qui bougent */
export function screenLayers(h: Pick<Hud, "pie" | "flash" | "aura" | "burst">, reduced: boolean): ScreenLayer[] {
  const layers: ScreenLayer[] = [{ key: "pie", className: `hud-pie ${h.pie ? "is-on" : ""}`, oil: false }];
  if (reduced) return layers;
  // Un nouvel éclair, un nouveau choc : une nouvelle clé, pour rejouer leur animation une fois
  if (h.flash > 0) layers.push({ key: `flash-${h.flash}`, className: "hud-flash", oil: false });
  layers.push({ key: "aura", className: `hud-aura ${h.aura ? `is-${h.aura}` : ""}`, oil: false });
  if (h.burst) layers.push({ key: `burst-${h.burst.key}`, className: `hud-burst is-${h.burst.kind}`, oil: h.burst.kind === "oil" });
  return layers;
}
