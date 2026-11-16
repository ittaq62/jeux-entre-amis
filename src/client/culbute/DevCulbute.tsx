// Une page réservée au développement : un combat de Culbute entre bots, dans le navigateur, sans serveur, pour regarder
// l'arène, les combattants et les effets de près. Réglages dans l'adresse : ?arene=bal&n=4&lune=1&joue=1 (on joue le
// premier au clavier et à la souris), ?vitrine=1 (les six Habitués alignés, immobiles).

import { useEffect, useRef, useState } from "react";
import { AVATAR_BACKGROUNDS } from "../../shared/avatar.ts";
import { isArenaId, platformsAt, type ArenaId } from "../../shared/games/culbute/arenas.ts";
import { botInput, newBotMemory } from "../../shared/games/culbute/bot.ts";
import { createFight, DEFAULT_FIGHT_SETTINGS, stepFight } from "../../shared/games/culbute/engine.ts";
import { avatarPalette, HABITUES, isTenueId, PALETTES, type TenueId } from "../../shared/games/culbute/fighters.ts";
import { HABITUE_IDS, isHabitueId, type Fight, type FightEvent, type HabitueId } from "../../shared/games/culbute/model.ts";
import { packFighter, unpackFighter } from "../../shared/games/culbute/view.ts";
import { PLAYER_COLORS } from "./CulbuteFight.tsx";
import { CulbuteControls } from "./controls.ts";
import type { RenderFrame } from "./runtime.ts";
import { CulbuteScene, type FighterLook } from "./scene/CulbuteScene.ts";

const STEP = 1 / 60;

function frameOf(f: Fight, me: number): RenderFrame {
  return {
    frame: f.frame,
    fighters: f.fighters.map((ft, slot) => ({ ...unpackFighter(packFighter(ft, f.frame), 0), slot, ground: ft.ground, me: slot === me })),
    shots: f.projectiles.map((q) => ({ id: q.id, kind: q.kind, x: q.x, y: q.y, vx: q.vx, vy: q.vy, owner: q.owner, t: q.t })),
    items: f.items.map((it) => ({ id: it.id, kind: it.kind, x: it.x, y: it.y, ground: it.ground })),
    traps: f.traps.map((t) => ({ id: t.id, x: t.x, y: t.y, owner: t.owner })),
    plats: platformsAt(f.arena as ArenaId, f.scale, f.frame),
  };
}

export function DevCulbute() {
  const host = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const arena: ArenaId = isArenaId(q.get("arene")) ? (q.get("arene") as ArenaId) : "place";
    const vitrine = q.get("vitrine") === "1";
    const n = vitrine ? 6 : Math.max(1, Math.min(8, Number(q.get("n")) || 4));
    const tenue: TenueId = isTenueId(q.get("tenue")) ? (q.get("tenue") as TenueId) : "dimanche";
    const asked = (q.get("styles") ?? "").split(",").filter(isHabitueId);
    const styles: HabitueId[] = Array.from({ length: n }, (_, i) => asked[i] ?? HABITUE_IDS[i % HABITUE_IDS.length]!);
    const play = q.get("joue") === "1";
    /** ?bots=0 : les autres ne bougent pas ; ?niveau=fort : leur niveau */
    const idle = q.get("bots") === "0";
    const level = q.get("niveau") === "facile" ? "facile" : q.get("niveau") === "fort" ? "fort" : "moyen";
    const moi = q.get("moi") === "1";
    const seed = Number(q.get("graine")) || 3;
    const f = createFight(
      {
        ...DEFAULT_FIGHT_SETTINGS,
        items: q.get("objets") === "aucun" ? "aucun" : q.get("objets") === "beaucoup" ? "beaucoup" : "peu",
        lune: q.get("lune") === "1",
      },
      arena,
      styles.map((style, i) => ({ id: `f${i}`, team: i % 2, style })),
      seed,
    );
    const looks: FighterLook[] = styles.map((style, slot) => {
      if (moi && slot === 0) {
        const avatar = { bg: 2, skin: 2, hair: 6, hairColor: 3, eyes: 1, mouth: 1, hat: 0, extra: 0 };
        return {
          slot,
          name: "Moi",
          avatar,
          style,
          palette: avatarPalette(AVATAR_BACKGROUNDS[avatar.bg] ?? "#3f7fd8", style),
          color: PLAYER_COLORS[slot]!,
          me: play,
          outfit: "moi",
        };
      }
      return {
        slot,
        name: HABITUES[style].name,
        avatar: HABITUES[style].avatar,
        style,
        palette: PALETTES[style][tenue],
        color: PLAYER_COLORS[slot % PLAYER_COLORS.length]!,
        me: play && slot === 0,
        bot: !(play && slot === 0),
        outfit: style,
      };
    });
    const scene = new CulbuteScene(host.current!, arena, f.scale, looks);
    const mem = styles.map((_, i) => newBotMemory(seed * 97 + i));
    const controls = play ? new CulbuteControls() : null;
    let paused = q.get("pause") === "1";
    let speed = 1;
    let pending: FightEvent[] = [];
    if (vitrine) {
      while (f.phase === "intro") stepFight(f, []);
      f.fighters.forEach((ft, i) => {
        Object.assign(ft, { x: -5 + i * 2, y: 0, ground: 0, state: "stand", vx: 0, vy: 0, face: 1 });
      });
      paused = true;
    }
    const step = () => {
      const inputs = f.fighters.map((_, i) =>
        controls && i === 0 ? controls.sample() : idle ? { x: 0, y: 0, held: 0, pressed: 0 } : botInput(f, i, mem[i]!, level),
      );
      pending.push(...stepFight(f, inputs));
    };
    const resize = () => scene.resize(host.current!.clientWidth, host.current!.clientHeight);
    resize();
    window.addEventListener("resize", resize);
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let frames = 0;
    let fpsAt = last;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!paused) {
        acc += dt * speed;
        while (acc >= STEP) {
          acc -= STEP;
          step();
        }
      }
      const frame = frameOf(f, play ? 0 : -1);
      for (const e of pending) scene.effect(e, frame);
      pending = [];
      scene.render(paused ? 0 : dt, frame);
      frames++;
      if (now - fpsAt > 500) {
        setInfo(`${Math.round((frames * 1000) / (now - fpsAt))} i/s · image ${f.frame} · ${f.phase}`);
        frames = 0;
        fpsAt = now;
      }
    };
    raf = requestAnimationFrame(loop);
    // Pour piloter la page depuis la console : figer, avancer d'images, placer les combattants, poser la caméra
    (window as unknown as { __cbDev: unknown }).__cbDev = {
      fight: f,
      scene,
      pause: (on = true) => {
        paused = on;
      },
      speed: (k: number) => {
        speed = k;
      },
      step: (k = 1) => {
        for (let i = 0; i < k; i++) step();
      },
      render: () => scene.render(1 / 60, frameOf(f, play ? 0 : -1)),
      /** Les effets en attente, puis `n` images : ce qu'on verrait un instant plus tard */
      settle: (n = 60) => {
        const frame = frameOf(f, play ? 0 : -1);
        for (const e of pending) scene.effect(e, frame);
        pending = [];
        for (let i = 0; i < n; i++) scene.render(1 / 60, frameOf(f, play ? 0 : -1));
      },
    };
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      controls?.dispose();
      scene.dispose();
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", left: 8, top: 8, color: "#fff", font: "12px monospace", textShadow: "0 1px 2px #000" }}>
        {info}
      </div>
    </div>
  );
}
