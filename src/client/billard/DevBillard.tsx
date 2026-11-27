// Page de travail (seulement en développement) : une partie de billard jouée sur l'appareil, sans serveur, avec la même
// logique que la table. /dev/billard?jeu=huit&salle=club&bots=1&niveau=moyen&tapis=vert&billes=classiques&queue=noyer
// (jeu : huit, neuf, killer, carambole ; spectateur : seulement des bots ; vite : pas de présentation).
// En console, `__bl` donne la partie (`m`) et l'écran (`rt`).

import { useEffect, useRef, useState } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import { planShot, thinkTime } from "../../shared/games/billard/bot.ts";
import {
  createMatch,
  DEFAULT_CONFIG,
  mergeConfig,
  takeShot,
  tickMatch,
  timedOut,
  WINDUP_MS,
  type BillardConfig,
  type BotLevel,
  type Match,
} from "../../shared/games/billard/match.ts";
import type { BillardView } from "../../shared/games/billard/net.ts";
import { isSalle } from "../../shared/games/billard/salles.ts";
import { FineAim, PowerBar, TipPicker } from "./BillardGame.tsx";
import { BillardCoach } from "./coach.tsx";
import { BillardRuntime, type HudState } from "./runtime.ts";
import { Board } from "./Scoreboard.tsx";
import * as sfx from "./sfx.ts";
import "./billard.css";

const NAMES = ["Toi", "Dédé", "Lulu", "Jojo", "Nénette", "Totor", "Mimile", "Fanfan"];

export function DevBillard() {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [view, setView] = useState<BillardView | null>(null);
  const [text, setText] = useState("");
  const q = new URLSearchParams(location.search);
  useEffect(() => {
    if (!host.current) return;
    const watch = q.has("spectateur");
    const bots = Math.max(1, Math.min(7, Number(q.get("bots") ?? 1)));
    const level = (q.get("niveau") ?? "moyen") as BotLevel;
    const salle = q.get("salle");
    const patch: Partial<BillardConfig> = {
      variant: (q.get("jeu") ?? "huit") as BillardConfig["variant"],
      ...(isSalle(salle) ? { salle } : {}),
    };
    for (const k of ["races", "lives", "points", "bandes"] as const) if (q.get(k)) patch[k] = Number(q.get(k));
    if (q.has("equipes")) patch.teams = true;
    if (q.get("aide")) patch.aide = q.get("aide") as BillardConfig["aide"];
    const cfg = mergeConfig(DEFAULT_CONFIG, patch);
    const seats = Array.from({ length: bots + 1 }, (_, i) => ({ id: i === 0 ? "moi" : `bot-${i}`, team: (i % 2) as 0 | 1 }));
    let now = Date.now();
    const m: Match = createMatch(cfg, seats, Number(q.get("graine") ?? Date.now() % 100000), now, {
      cloth: q.get("tapis") ?? "vert",
      set: q.get("billes") ?? "classiques",
    });
    if (q.has("vite")) m.deadline = now;
    const me = watch ? null : "moi";
    const rng = { rng: 12345 };
    let botAt: { n: number; at: number } | null = null;
    const push = () => setView({ ...structuredClone(m) });
    const rt = new BillardRuntime(host.current, {
      me,
      serverNow: () => Date.now(),
      onShot: (n, shot, place, call) => {
        if (n !== m.shots) return;
        const r = takeShot(m, "moi", { shot, place, call }, Date.now());
        if (typeof r === "string") setText(r);
        push();
        rt.setView(structuredClone(m));
      },
      onAim: () => {},
      onHud: setHud,
      onPhys: (e, v) => sfx.phys(e, v),
      onRoll: (s) => sfx.roll(s),
      onMoment: (mo) => {
        if (mo.k === "strike") sfx.strike(mo.p, mo.mine);
        if (mo.k === "result") setText(`${mo.rec.outcome.text}${mo.rec.outcome.sub ? ` · ${mo.rec.outcome.sub}` : ""}`);
      },
    });
    rt.setPlayers(
      seats.map((s, i) => ({
        id: s.id,
        name: NAMES[i] ?? s.id,
        cue: i === 0 ? (q.get("queue") ?? "noyer") : "erable",
        fx: "confettis",
        avatar: seededAvatar(`${NAMES[i] ?? s.id}-dev`),
        accent: ["#2c2c30", "#5c2420", "#1a3a6a", "#2a5a2a"][i % 4]!,
      })),
    );
    rt.holdIntro(false);
    // Pour les essais à la main : window.__bl.ctl.paused fige la partie (les bots ne jouent plus)
    const ctl = { paused: false };
    (window as unknown as { __bl: unknown }).__bl = { m, rt, ctl };
    push();
    rt.setView(structuredClone(m));
    const timer = setInterval(() => {
      if (ctl.paused) return;
      now = Date.now();
      let changed = tickMatch(m, now);
      if (m.phase === "aim") {
        const isBot = m.shooter !== me;
        if (isBot) {
          if (!botAt || botAt.n !== m.shots) botAt = { n: m.shots, at: now + thinkTime(level, rng) };
          else if (now >= botAt.at) {
            botAt = null;
            const r = takeShot(m, m.shooter, planShot(m, level, rng), now, true, WINDUP_MS);
            if (typeof r !== "string") changed = true;
          }
        } else if (timedOut(m, now)) {
          takeShot(m, m.shooter, planShot(m, "moyen", rng), now, true, WINDUP_MS);
          changed = true;
        }
      }
      if (changed) {
        push();
        rt.setView(structuredClone(m));
      }
    }, 100);
    return () => {
      clearInterval(timer);
      rt.dispose();
      sfx.stopRoll();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={root} className="bl-game">
      <BillardCoach root={root} active={Boolean(hud?.canShoot && !hud.placing && !hud.mustCall)} turn={view?.shots ?? 0} />
      <div ref={host} className="bl-stage" />
      {view && (
        <header className="bl-top">
          <Board v={view} players={NAMES.map((n, i) => ({ id: i === 0 ? "moi" : `bot-${i}`, name: n }))} me="moi" />
        </header>
      )}
      {hud?.canShoot && (
        <>
          <PowerBar
            pull={hud.pull}
            onPull={(k) => (window as unknown as { __bl: { rt: BillardRuntime } }).__bl.rt.setPull(k)}
            onRelease={() => (window as unknown as { __bl: { rt: BillardRuntime } }).__bl.rt.release()}
          />
          <TipPicker
            a={hud.tip.a}
            b={hud.tip.b}
            onChange={(a, b) => (window as unknown as { __bl: { rt: BillardRuntime } }).__bl.rt.setTip(a, b)}
          />
          {!hud.placing && <FineAim onTurn={(d) => (window as unknown as { __bl: { rt: BillardRuntime } }).__bl.rt.nudge(d)} />}
        </>
      )}
      <p className="bl-tip" style={{ bottom: 16 }}>
        {view ? `${view.phase} · ${view.shooter} · ${text}` : ""}
      </p>
    </div>
  );
}
