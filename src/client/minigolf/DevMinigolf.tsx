// Page de travail (seulement en développement) : une partie de minigolf jouée sur l'appareil, sans serveur, avec la même
// logique que la table. /dev/minigolf?parcours=jardin&trou=3&bots=2&envers&bonus&motif=pois&trace=flammes&vite (vite : pas de
// présentation du trou ; simultane : tout le monde en même temps plutôt que chacun son tour ; affiche : la scène de
// l'affiche de l'accueil, au troisième trou du Jardin).
// En console, `__mg` donne la partie (`m`), l'écran (`rt`) et un pas de la boucle de la table (`tick`).

import { useEffect, useRef, useState } from "react";
import { planShot } from "../../shared/games/minigolf/bot.ts";
import { courseOf, isCourseId } from "../../shared/games/minigolf/courses.ts";
import { BALL_COLORS } from "../../shared/games/minigolf/looks.ts";
import {
  ballsInPlay,
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
import { PowerGauge } from "./MinigolfGame.tsx";
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
      turns: !q.has("simultane"),
    });
    // L'aventure : le survol du parcours au premier trou (&aventure)
    if (q.has("aventure")) cfg.adventure = true;
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
    const dev = { m, rt, tick: () => {} };
    (window as unknown as { __mg: unknown }).__mg = dev;
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
    // L'affiche de l'accueil : un Habitué qui joue, à cadrer puis photographier
    // (en développement, l'écran est monté deux fois : seulement sur celui qui reste)
    let live = true;
    if (q.has("affiche")) void import("./afficheGolfer.ts").then((x) => live && x.stageAffiche(rt, m));
    const botAt = new Map<string, number>();
    // Comme à la table : chacun son tour, le bot vise un moment avant de frapper
    const botPlan = new Map<string, { a: number; p: number; at: number }>();
    const loop = () => {
      const now = Date.now();
      let changed = tickMatch(m, now);
      for (const p of readyToShoot(m, now)) {
        if (p.id === "moi") continue;
        const planned = botPlan.get(p.id);
        if (planned) {
          if (now < planned.at - 600) continue;
          if (now < planned.at) {
            rt.setOtherAim(p.id, planned.a, planned.p);
            continue;
          }
          botPlan.delete(p.id);
          if (typeof shoot(m, p.id, planned.a, planned.p, nowTick(m, now), now) !== "string") changed = true;
          continue;
        }
        const due = botAt.get(p.id);
        if (due === undefined) {
          botAt.set(p.id, now + 1500 + Math.random() * 2000);
          continue;
        }
        if (now < due) continue;
        botAt.delete(p.id);
        const ref = currentRef(m);
        const plan = planShot(
          courseOf(ref),
          { x: p.ball[0], y: p.ball[1], z: p.ball[2] },
          nowTick(m, now),
          physOf(m.cfg, ref),
          "moyen",
          { rng: now },
          ballsInPlay(m, p.id).map((q) => ({ x: q.ball[0], y: q.ball[1], z: q.ball[2] })),
        );
        if (m.cfg.turns) {
          botPlan.set(p.id, { a: plan.a, p: plan.p, at: now + 1200 });
          rt.setOtherAim(p.id, plan.a, 0);
          continue;
        }
        if (typeof shoot(m, p.id, plan.a, plan.p, nowTick(m, now), now) !== "string") changed = true;
      }
      if (changed) rt.setView(structuredClone(m));
      const me = m.players[0]!;
      const c = courseOf(currentRef(m));
      setInfo(`Trou ${m.hole + 1} · ${c.def.name} · par ${c.def.par} · coups : ${me.cur}${me.done ? " (fini)" : ""} · ${m.phase}`);
    };
    dev.tick = loop;
    const timer = setInterval(loop, 100);
    return () => {
      live = false;
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
      {hud?.power !== null && hud?.power !== undefined && <PowerGauge power={hud.power} last={hud.lastPower} />}
    </div>
  );
}
