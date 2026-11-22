// Le petit panneau des premières secondes d'une partie (avec « ?perf » dans l'adresse) : le temps de la première image
// après le départ, les à-coups des dix premières secondes et le plus long. Voir lib/firstSeconds.ts.

import { useState } from "react";
import { perfPanelOn, useFirstSeconds } from "../lib/firstSeconds.ts";

export function FirstSecondsPanel() {
  const [on] = useState(perfPanelOn);
  const r = useFirstSeconds();
  if (!on || !r) return null;
  return (
    <div className="first-seconds num" aria-hidden="true">
      <b>{r.game}</b> · 1re image {r.firstFrameMs === null ? "…" : `${r.firstFrameMs} ms`} · à-coups {r.slow}
      {r.done ? " en 10 s" : "…"} · pire {r.worst} ms
    </div>
  );
}
