// Page de travail (seulement en développement) : une partie de minigolf jouée sur l'appareil, sans serveur, avec la même
// logique que la table. /dev/minigolf?parcours=jardin&trou=3&bots=2&envers&bonus&motif=pois&trace=flammes&vite (vite : pas de
// présentation du trou).
// En console, `__mg` donne la partie (`m`) et l'écran (`rt`).

import { useEffect, useRef, useState } from "react";
import { planShot } from "../../shared/games/minigolf/bot.ts";
import { courseOf, isCourseId } from "../../shared/games/minigolf/courses.ts";
import { BALL_COLORS } from "../../shared/games/minigolf/looks.ts";
import {
  createMatch,
  currentRef,
  DEFAULT_CONFIG,
  mergeConfig,
  nowTick,
  physOf,
  readyToShoot,
  shoot,
  startHole,
  tickMatch,
} from "../../shared/games/minigolf/match.ts";
import { GolfRuntime, type HudState } from "./runtime.ts";
import * as sfx from "./sfx.ts";
import "./minigolf.css";

export function DevMinigolf() {
  const host = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [info, setInfo] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const course = q.get("parcours");
    const trou = Math.max(1, Math.min(9, Number(q.get("trou") ?? "1"))) - 1;
    const bots = Math.max(0, Math.min(7, Number(q.get("bots") ?? "0")));
    const cfg = mergeConfig(DEFAULT_CONFIG, {
      course: isCourseId(course) ? course : "jardin",
      holes: 9,
      mirror: q.has("envers"),
      lune: q.has("lune"),
      glace: q.has("glace"),
      bonus: q.has("bonus"),
    });
    const seats = [{ id: "moi", team: 0 as const }, ...Array.from({ length: bots }, (_, i) => ({ id: `bot-${i + 1}`, team: 0 as const }))];
    const m = createMatch(cfg, seats, 7, Date.now());
    if (trou > 0) startHole(m, trou, Date.now());
    if (q.has("vite")) {
      m.holeStart = Date.now();
      m.deadline = Date.now() + 10 * 60_000;
      m.phase = "play";
    }
    const rt = new GolfRuntime(host.current!, {
      me: q.has("spectateur") ? null : "moi",
      serverNow: () => Date.now(),
      onShoot: (_h, a, p, at) => {
        const r = shoot(m, "moi", a, p, at, Date.now());
        if (typeof r === "string") console.warn(r);
        rt.setView(structuredClone(m));
      },
      onShot: (_id, mine, power) => sfx.putt(power, mine ? 1 : 0.35),
      onHud: setHud,
    });
    (window as unknown as { __mg: unknown }).__mg = { m, rt };
    rt.setPlayers(
      seats.map((s, i) => ({
        id: s.id,
        name: s.id === "moi" ? "Moi" : `Bot ${i}`,
        // Sa propre balle : &motif=pois&trace=flammes pour essayer un skin
        look: {
          color: BALL_COLORS[i % BALL_COLORS.length]!.id,
          pattern: (s.id === "moi" && q.get("motif")) || (i % 2 ? "rayure" : "unie"),
          trail: (s.id === "moi" && q.get("trace")) || "fil",
        },
      })),
    );
    rt.setView(structuredClone(m));
    const botAt = new Map<string, number>();
    const timer = setInterval(() => {
      const now = Date.now();
      let changed = tickMatch(m, now);
      for (const p of readyToShoot(m, now)) {
        if (p.id === "moi") continue;
        const due = botAt.get(p.id);
        if (due === undefined) {
          botAt.set(p.id, now + 1500 + Math.random() * 2000);
          continue;
        }
        if (now < due) continue;
        botAt.delete(p.id);
        const ref = currentRef(m);
        const plan = planShot(courseOf(ref), { x: p.ball[0], y: p.ball[1], z: p.ball[2] }, nowTick(m, now), physOf(m.cfg, ref), "moyen", {
          rng: now,
        });
        if (typeof shoot(m, p.id, plan.a, plan.p, nowTick(m, now), now) !== "string") changed = true;
      }
      if (changed) rt.setView(structuredClone(m));
      const me = m.players[0]!;
      const c = courseOf(currentRef(m));
      setInfo(`Trou ${m.hole + 1} · ${c.def.name} · par ${c.def.par} · coups : ${me.cur}${me.done ? " (fini)" : ""} · ${m.phase}`);
    }, 100);
    return () => {
      clearInterval(timer);
      rt.dispose();
    };
  }, []);

  return (
    <div className="mg-game">
      <div ref={host} className="mg-stage" />
      <p className="mg-dev-info">
        {info} · {hud?.fps ?? 0} i/s
      </p>
      {hud?.power !== null && hud?.power !== undefined && (
        <div className="mg-power" aria-hidden="true">
          <span style={{ width: `${Math.round(hud.power * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
