// Une page réservée au développement : un match complet qui tourne dans le navigateur, sans serveur.

import { useEffect, useRef, useState } from "react";
import { createMatch, pushAction, setInput, stepMatch } from "../../shared/games/crampons/match.ts";
import { attackDir, type Match } from "../../shared/games/crampons/model.ts";
import { DT } from "../../shared/games/crampons/pitch.ts";
import { CramponsScene, type SceneFrame } from "./scene/CramponsScene.ts";
import type { FootballerView, Kit } from "./scene/footballers.ts";

const KITS: [Kit, Kit] = [
  { shirt: "#d6322e", sleeves: "#d6322e", shorts: "#ffffff", socks: "#d6322e" },
  { shirt: "#2452b8", sleeves: "#f4c64e", shorts: "#1a2a55", socks: "#f4c64e" },
];
const KEEPERS: [Kit, Kit] = [
  { shirt: "#55c26c", sleeves: "#55c26c", shorts: "#143a24", socks: "#55c26c" },
  { shirt: "#f08a3c", sleeves: "#f08a3c", shorts: "#3a2412", socks: "#f08a3c" },
];

function frameOf(m: Match, active: number): SceneFrame {
  const scorerTeam = m.phase === "goal" ? (m.goals.at(-1)?.team ?? null) : null;
  const players: FootballerView[] = m.players.map((p) => ({
    x: p.x,
    z: p.z,
    h: p.h,
    v: Math.hypot(p.vx, p.vz),
    act: m.restart?.ready && m.restart.kind === "throw" && m.restart.taker === p.i ? "throw" : p.act,
    team: p.team,
    keeper: p.role === "GK",
    dirX: p.dirX,
    dirZ: p.dirZ,
    cheer: scorerTeam !== null && p.team === scorerTeam,
    off: p.off,
  }));
  return {
    players,
    ball: { x: m.ball.x, y: m.ball.y, z: m.ball.z, vx: m.ball.vx, vz: m.ball.vz },
    active,
    attackSide: attackDir(m, m.humans[0]?.team ?? 0),
    excitement: m.phase === "goal" ? 1 : 0.1,
    cuts: m.cuts,
    charge: 0,
  };
}

export function DevMatch() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const watch = params.has("auto");
    const side = Number(params.get("side") ?? 11);
    const m = createMatch(
      { halfMinutes: Number(params.get("half") ?? 4), side, level: 2, offside: true, fouls: true, draw: "none" },
      [
        { name: "Rouges", formation: "433", rating: 76 },
        { name: "Bleus", formation: "442", rating: 76 },
      ],
      watch ? [] : [{ id: "moi", team: 0 }],
      Number(params.get("seed") ?? 42),
    );
    (window as unknown as { __match: Match }).__match = m;
    const scene = new CramponsScene(canvas.current!, {
      count: side * 2,
      kits: KITS,
      gkKits: KEEPERS,
      keepers: m.players.map((p) => p.role === "GK"),
      shirts: m.players.map((p) => p.shirt),
      ambience: (params.get("sky") as "jour" | "soir" | "nuit") ?? "soir",
      lowQuality: false,
    });
    (window as unknown as { __scene: CramponsScene }).__scene = scene;
    const fit = () => scene.resize(innerWidth, innerHeight);
    fit();
    addEventListener("resize", fit);
    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if (keys.has(e.code)) return;
      keys.add(e.code);
      const dir = stick();
      const kinds: Record<string, "pass" | "through" | "lob" | "shot" | "switch" | "slide" | "tackle"> = {
        KeyJ: "pass",
        KeyI: "through",
        KeyL: "lob",
        KeyK: "shot",
        KeyU: "switch",
        KeyO: "slide",
        KeyP: "tackle",
      };
      const k = kinds[e.code];
      if (k) pushAction(m, "moi", k, 0.65, dir[0], dir[1]);
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const stick = (): [number, number] => {
      const sx = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
      const sy = (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0);
      return scene.screenToWorld(sx, sy);
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frames = 0;
    let fpsAt = last;
    let fps = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      const [mx, mz] = stick();
      setInput(m, "moi", mx, mz, keys.has("ShiftLeft") || keys.has("ShiftRight"), keys.has("KeyM"));
      while (acc >= DT) {
        acc -= DT;
        stepMatch(m);
      }
      scene.render(dt, frameOf(m, m.humans[0]?.active ?? -1));
      frames++;
      if (now - fpsAt > 500) {
        fps = Math.round((frames * 1000) / (now - fpsAt));
        frames = 0;
        fpsAt = now;
        const clock = Math.floor(m.clock / 60);
        setHud(`${m.score[0]} - ${m.score[1]}   ${clock}'   ${m.phase}   ${fps} i/s`);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", fit);
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      scene.dispose();
    };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} />
      <div style={{ position: "fixed", top: 8, left: 8, color: "#fff", font: "600 16px sans-serif", textShadow: "0 1px 3px #000" }}>
        {hud}
      </div>
    </div>
  );
}
