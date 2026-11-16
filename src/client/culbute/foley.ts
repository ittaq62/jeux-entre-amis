// Les bruits du corps, lus image par image sur ce qu'on voit : le souffle d'un coup qui part (plus ample s'il est fort),
// le saut, la réception, la main qui attrape le rebord, l'esquive. Plus discrets pour les autres que pour soi.

import { moveDef } from "../../shared/games/culbute/engine.ts";
import type { HabitueId } from "../../shared/games/culbute/model.ts";
import type { RenderFrame } from "./runtime.ts";
import * as sfx from "./sfx.ts";

interface Seen {
  state: string;
  move: string;
  mt: number;
}

const AIRBORNE = new Set(["air", "move", "helpless", "airdodge", "hurt"]);

export class Foley {
  private seen: (Seen | undefined)[] = [];
  private styles: HabitueId[];

  constructor(styles: HabitueId[]) {
    this.styles = styles;
  }

  /** Une image de plus à l'écran : ce qui vient de commencer fait son bruit */
  frame(frame: RenderFrame) {
    if (frame.frame <= 0) return;
    frame.fighters.forEach((f, i) => {
      const was = this.seen[i];
      this.seen[i] = { state: f.state, move: f.move, mt: f.mt };
      if (!was || f.state === "dead" || f.state === "out" || f.state === "respawn") return;
      const gain = f.me ? 1 : 0.55;
      // Il nargue : sa petite ritournelle
      if (f.state === "move" && f.move === "g:taunt" && (was.state !== "move" || was.move !== f.move)) {
        sfx.taunt(gain);
        return;
      }
      // Le coup part : au moment où il frappe (sa première image active)
      if (f.state === "move") {
        const style = this.styles[i];
        const def = style ? moveDef(style, f.move) : null;
        if (def && def.hits.length > 0 && f.move !== "g:pummel") {
          const first = Math.min(...def.hits.map((h) => h.from));
          const fresh = was.state !== "move" || was.move !== f.move || was.mt > f.mt;
          const before = fresh ? -1 : was.mt;
          if (before < first && f.mt >= first) {
            const dmg = Math.max(...def.hits.map((h) => h.dmg));
            sfx.whoosh(Math.min(1, dmg / 18), gain);
          }
        }
        return;
      }
      if (f.state === was.state) return;
      if (f.state === "air" && was.state === "squat") sfx.hop(gain);
      else if (f.state === "land" && AIRBORNE.has(was.state)) sfx.land(gain);
      else if ((f.state === "down" || f.state === "tech") && was.state === "hurt") sfx.land(gain * 1.4);
      else if (f.state === "ledge") sfx.ledge(gain);
      else if (f.state === "dodge" || f.state === "roll" || f.state === "airdodge") sfx.whoosh(0.15, gain * 0.8);
    });
  }
}
