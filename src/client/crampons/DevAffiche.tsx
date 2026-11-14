// Une page réservée au développement : l'affiche de Crampons pour l'accueil, composée avec le vrai moteur du jeu (le stade,
// la foule, les joueurs, le ballon), puis photographiée en image (public/crampons-apercu.webp). La 3D ne se charge qu'à table.
// /dev/affiche?cam=33,2.2,9&vise=48,1.6,-0.5  (pour régler le cadre ; le reste est la composition retenue)
// &ballon=neon : un ballon de la boutique, pour le voir dans le vrai stade

import { useEffect, useRef } from "react";
import { isBallId, type BallId } from "../../shared/games/crampons/boutique.ts";
import { HALF_L } from "../../shared/games/crampons/pitch.ts";
import { CramponsScene, type SceneFrame } from "./scene/CramponsScene.ts";
import type { FootballerView, Kit } from "./scene/footballers.ts";

// Les rouges attaquent, en rayures sombres ; les adversaires en blanc et bleu
const KITS: [Kit, Kit] = [
  { shirt: "#d6322e", sleeves: "#d6322e", shorts: "#ffffff", socks: "#d6322e" },
  { shirt: "#f4f4f0", sleeves: "#1f4fa8", shorts: "#1f4fa8", socks: "#f4f4f0" },
];
const KEEPERS: [Kit, Kit] = [
  { shirt: "#55c26c", sleeves: "#55c26c", shorts: "#143a24", socks: "#55c26c" },
  { shirt: "#f2b632", sleeves: "#f2b632", shorts: "#2b2b33", socks: "#f2b632" },
];

const GOAL = HALF_L;
const ballParam = (v: string | null): BallId => (isBallId(v) ? v : "classique");

/** Un joueur de la scène */
function view(over: Partial<FootballerView> & { x: number; z: number; team: 0 | 1 }): FootballerView {
  return { h: 0, v: 0, act: "none", keeper: false, dirX: 1, dirZ: 0, cheer: false, off: false, ...over };
}

/** Le moment de l'affiche : la frappe est partie, le ballon file en pleine lucarne, le gardien s'envole */
function composition(): FootballerView[] {
  const toGoal = (x: number, z: number) => Math.atan2(-z, GOAL - x);
  // Les maillots suivent la place dans la liste : la première moitié porte ceux des rouges, la seconde ceux des autres
  const reds: FootballerView[] = [
    // Le buteur, dans l'accompagnement de sa frappe
    view({ x: 37.6, z: 5.2, team: 0, h: toGoal(37.6, 5.2) - 0.12, act: "kick", kickT: 0.21 }),
    // Un coéquipier qui suit l'action
    view({ x: 42.2, z: -6.5, team: 0, h: toGoal(42.2, -6.5) - 0.2, v: 9.5 }),
  ];
  const blues: FootballerView[] = [
    // Le gardien, détendu de tout son long vers sa lucarne
    view({ x: GOAL - 1.1, z: -1.4, team: 1, keeper: true, h: Math.PI, act: "dive", dirX: 0, dirZ: -1 }),
    // Un défenseur qui a tenté le tacle, trop tard
    view({ x: 39.6, z: 3.2, team: 1, h: Math.atan2(1.6, -1.5), act: "slide", dirX: -0.6, dirZ: 0.8 }),
    // Deux défenseurs qui reviennent
    view({ x: 45.5, z: 7.8, team: 1, h: toGoal(45.5, 7.8) + 0.5, v: 8.5 }),
    view({ x: 47.6, z: -4.4, team: 1, h: Math.atan2(2, -1), v: 6 }),
  ];
  // Les autres joueurs ne sont pas dans le cadre
  const hidden = (team: 0 | 1) => view({ x: -40, z: 0, team, off: true });
  while (reds.length < 11) reds.push(hidden(0));
  while (blues.length < 11) blues.push(hidden(1));
  return [...reds, ...blues];
}

export function DevAffiche() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nums = (k: string, d: number[]) =>
      (params.get(k) ?? "")
        .split(",")
        .map(Number)
        .filter((n) => !Number.isNaN(n)).length === 3
        ? params.get(k)!.split(",").map(Number)
        : d;
    const [cx, cy, cz] = nums("cam", [31.2, 2.1, 10.5]);
    const [tx, ty, tz] = nums("vise", [48.5, 1.75, -1.2]);
    const players = composition();
    const scene = new CramponsScene(canvas.current!, {
      count: players.length,
      kits: KITS,
      gkKits: KEEPERS,
      keepers: players.map((p) => p.keeper),
      shirts: players.map((_, i) => [9, 10][i] ?? [1, 4, 5, 3][i - 11] ?? 20 + i),
      ambience: (params.get("ciel") as "jour" | "soir" | "nuit") ?? "nuit",
      weather: (params.get("meteo") as "clair" | "pluie" | "neige") ?? "clair",
      lowQuality: false,
      ball: ballParam(params.get("ballon")),
    });
    scene.resize(innerWidth, innerHeight);
    scene.setShot({ kind: "free", x: cx, y: cy, z: cz, tx, ty, tz });
    // Le ballon a quitté le pied du buteur et arrive dans la lucarne : on le fait voler un instant pour que sa traînée se dessine
    const from = { x: 38.3, y: 0.25, z: 4.6 };
    const to = { x: GOAL - 0.6, y: 2.05, z: -2.75 };
    const frames = 26;
    let n = 0;
    let raf = 0;
    const frame = (): SceneFrame => {
      const k = Math.min(1, n / frames);
      const y = from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 0.9;
      return {
        players,
        ball: { x: from.x + (to.x - from.x) * k, y, z: from.z + (to.z - from.z) * k, vx: 34, vz: -12 },
        active: -1,
        attackSide: 1,
        excitement: 0.9,
        cuts: 0,
        charge: 0,
        aim: null,
        receiver: -1,
      };
    };
    const loop = () => {
      n++;
      scene.render(1 / 60, frame());
      if (n < frames + Number(params.get("apres") ?? 0)) raf = requestAnimationFrame(loop);
      else (window as unknown as { __afficheReady: boolean }).__afficheReady = true;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      scene.dispose();
    };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
