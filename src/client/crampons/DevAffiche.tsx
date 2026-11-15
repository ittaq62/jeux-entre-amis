// Une page réservée au développement : l'affiche de Crampons pour l'accueil, composée avec le vrai moteur du jeu (le stade,
// la foule, les joueurs, le ballon), puis photographiée en image (public/crampons-apercu.webp). La 3D ne se charge qu'à table.
// /dev/affiche?cam=33,2.2,9&vise=48,1.6,-0.5  (pour régler le cadre ; le reste est la composition retenue)
// &ballon=neon : un ballon de la boutique, pour le voir dans le vrai stade

import { useEffect, useRef } from "react";
import { isBallId, type BallId } from "../../shared/games/crampons/boutique.ts";
import { HALF_L } from "../../shared/games/crampons/pitch.ts";
import { CramponsScene, type SceneFrame } from "./scene/CramponsScene.ts";
import { KICK_CONTACT, type FootballerView, type Kit } from "./scene/footballers.ts";

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

// ---------------------------------------------------------------------------------------------------------------------
// &film : la même action en mouvement, pour la vidéo de l'accueil (public/crampons-film.mp4). Un pilote, à 1200 × 900,
// appelle window.__film.step() image par image (30 par seconde de film) et enregistre ce que rend le canevas. L'image où
// le ballon touche la lucarne est l'affiche (public/crampons-apercu.webp) : la boucle part d'elle, va jusqu'à la fin de
// la fête, revient en fondu (15 images) au début de l'élan et s'arrête juste avant elle, donc elle reprend sans saut.
// Encodée en H.264, 800 × 600, 24 images par seconde (ffmpeg -crf 33), muette.
// ---------------------------------------------------------------------------------------------------------------------

const FPS = 30;
/** Le buteur prend son élan, frappe (le pied touche le ballon à KICK_CONTACT), le ballon vole jusqu'à la lucarne */
const RUN = 0.6;
const CONTACT = RUN + KICK_CONTACT;
const FLIGHT = 0.45;
const POSTER = CONTACT + FLIGHT;
/** Après le but : la fête, puis la vidéo revient en fondu au début de l'élan */
const AFTER = 2.6;
/** Le ralenti, du moment où le pied arme au ballon dans le filet */
const SLOW_FROM = CONTACT - 0.1;
const SLOW_TO = POSTER + 0.05;
const SLOW = 0.4;

const BALL_FROM = { x: 38.3, y: 0.16, z: 4.6 };
const BALL_TO = { x: GOAL - 0.6, y: 2.05, z: -2.75 };

interface Film {
  /** L'image suivante : rendue et renvoyée en PNG, avec son temps de jeu ; null quand le film est fini */
  step: () => { png: string; g: number; poster: boolean } | null;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));
const ease = (k: number) => {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
};

/** Où en est la scène au temps de jeu g (en secondes depuis le début de l'élan) */
function filmPlayers(g: number): FootballerView[] {
  const toGoal = (x: number, z: number) => Math.atan2(-z, GOAL - x);
  const party = g >= POSTER + 0.3;
  // Le buteur : l'élan, la frappe, puis il part fêter le but vers l'avant
  const sx = g < RUN ? lerp(35.9, 37.5, g / RUN) : lerp(37.5, 37.7, (g - RUN) / 0.4);
  const sz = g < RUN ? lerp(6.6, 5.3, g / RUN) : lerp(5.3, 5.15, (g - RUN) / 0.4);
  const runAway = ease((g - POSTER - 0.45) / 1.3);
  const striker = party
    ? view({
        x: lerp(sx, 40.6, runAway),
        z: lerp(sz, 3.9, runAway),
        team: 0,
        h: toGoal(sx, sz) - 0.35,
        v: runAway < 1 ? 3.2 : 0,
        cheer: true,
      })
    : g < RUN
      ? view({ x: sx, z: sz, team: 0, h: toGoal(37.6, 5.2) - 0.12, v: 6.5 })
      : view({ x: sx, z: sz, team: 0, h: toGoal(37.6, 5.2) - 0.12, act: "kick", kickT: g - RUN });
  // Le coéquipier qui suit l'action, puis rejoint le buteur
  const mateDir = toGoal(42.2, -6.5) - 0.2;
  const mx = 42.2 + Math.cos(mateDir) * 9.5 * (Math.min(g, POSTER + 0.2) - POSTER);
  const mz = -6.5 + Math.sin(mateDir) * 9.5 * (Math.min(g, POSTER + 0.2) - POSTER);
  const join = ease((g - POSTER - 0.5) / 1.6);
  const mate = view({
    x: lerp(mx, 42.4, join),
    z: lerp(mz, 1.2, join),
    team: 0,
    h: join > 0 ? Math.atan2(1.2 - mz, 42.4 - mx) : mateDir,
    v: party ? (join < 1 ? 7 : 0) : 9.5,
    cheer: party,
  });
  // Le gardien : prêt au milieu de son but, il plonge vers sa lucarne, puis retombe
  const diveK = (g - (CONTACT + 0.03)) / (FLIGHT - 0.03);
  const keeper =
    diveK < 0
      ? view({ x: GOAL - 1.0, z: 0.25, team: 1, keeper: true, h: Math.PI, v: 0 })
      : g < POSTER + 0.4
        ? view({
            x: GOAL - lerp(1.0, 1.15, diveK),
            z: lerp(0.25, -1.4, diveK) + (g > POSTER ? -(g - POSTER) * 1.2 : 0),
            team: 1,
            keeper: true,
            h: Math.PI,
            act: "dive",
            dirX: 0,
            dirZ: -1,
          })
        : view({ x: GOAL - 1.2, z: -1.9, team: 1, keeper: true, h: Math.PI, act: "down" });
  // Le défenseur qui tente le tacle, trop tard : il court, glisse, reste assis
  const slideH = Math.atan2(1.6, -1.5);
  const tackler =
    g < 0.45
      ? view({ x: lerp(41.2, 40.3, g / 0.45), z: lerp(1.3, 2.3, g / 0.45), team: 1, h: slideH, v: 7 })
      : view({
          x: lerp(40.3, 39.4, ease((g - 0.45) / 0.7)),
          z: lerp(2.3, 3.5, ease((g - 0.45) / 0.7)),
          team: 1,
          h: slideH,
          act: "slide",
          dirX: -0.6,
          dirZ: 0.8,
        });
  // Deux défenseurs qui reviennent, puis s'arrêtent, dépités
  const back = (x: number, z: number, h: number, v: number) => {
    const t = Math.min(g, POSTER + 0.35) - POSTER;
    return view({ x: x + Math.cos(h) * v * t, z: z + Math.sin(h) * v * t, team: 1, h, v: g < POSTER + 0.35 ? v : 0, sad: party });
  };
  const reds = [striker, mate];
  const blues = [keeper, tackler, back(45.5, 7.8, toGoal(45.5, 7.8) + 0.5, 8.5), back(47.6, -4.4, Math.atan2(2, -1), 6)];
  const hidden = (team: 0 | 1) => view({ x: -40, z: 0, team, off: true });
  while (reds.length < 11) reds.push(hidden(0));
  while (blues.length < 11) blues.push(hidden(1));
  return [...reds, ...blues];
}

/** Le ballon au temps de jeu g : posé, frappé, en lucarne, dans le filet */
function filmBall(g: number): SceneFrame["ball"] {
  if (g < CONTACT) return { ...BALL_FROM, vx: 0, vz: 0 };
  if (g < POSTER) {
    const k = (g - CONTACT) / FLIGHT;
    return {
      x: lerp(BALL_FROM.x, BALL_TO.x, k),
      y: lerp(BALL_FROM.y, BALL_TO.y, k) + Math.sin(k * Math.PI) * 0.9,
      z: lerp(BALL_FROM.z, BALL_TO.z, k),
      vx: 34,
      vz: -12,
    };
  }
  // Il gonfle le filet, puis tombe au fond du but
  const k = (g - POSTER) / 0.14;
  if (k < 1) return { x: lerp(BALL_TO.x, GOAL + 1.3, k), y: lerp(BALL_TO.y, 1.75, k), z: lerp(BALL_TO.z, -2.95, k), vx: 10, vz: -1 };
  const fall = g - POSTER - 0.14;
  const y = Math.max(0.16, 1.75 - 4.9 * fall * fall);
  return { x: GOAL + 1.3 + Math.min(fall, 0.5) * 0.4, y, z: -2.95, vx: y > 0.16 ? 2 : 0, vz: 0 };
}

const WARMUP = 120;

function frameAt(g: number): SceneFrame {
  return {
    players: filmPlayers(g),
    ball: filmBall(g),
    active: -1,
    attackSide: 1,
    excitement: g < POSTER ? 0.55 : lerp(0.55, 1, (g - POSTER) / 0.3),
    cuts: 0,
    charge: 0,
    aim: null,
    receiver: -1,
  };
}

function film(scene: CramponsScene, canvas: HTMLCanvasElement): Film {
  let g = 0;
  let started = false;
  let posterDone = false;
  const once = new Set<string>();
  const event = (key: string, at: number, run: () => void) => {
    if (g >= at && !once.has(key)) {
      once.add(key);
      run();
    }
  };
  return {
    step() {
      if (g > POSTER + AFTER) return null;
      // Avant la première image, la caméra se pose sur son plan et le public s'installe
      if (!started) for (let i = 0; i < WARMUP; i++) scene.render(1 / FPS, frameAt(0));
      // Le temps de jeu avance moins vite pendant le ralenti, et y entre et en sort en douceur
      const rate = g < SLOW_FROM ? 1 : g < SLOW_TO ? SLOW : lerp(SLOW, 1, (g - SLOW_TO) / 0.25);
      const dt = started ? rate / FPS : 1 / FPS;
      if (started) g += dt;
      started = true;
      event("frappe", CONTACT, () => scene.impact(BALL_FROM.x, BALL_FROM.z, 0.8));
      event("filet", POSTER + 0.05, () => scene.shakeNet(1));
      event("fete", POSTER + 0.2, () => scene.celebrate(1, [KITS[0].shirt, "#ffffff"]));
      scene.render(dt, frameAt(g));
      const poster = !posterDone && g >= POSTER;
      if (poster) posterDone = true;
      return { png: canvas.toDataURL("image/png"), g, poster };
    },
  };
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
    if (params.has("film")) {
      (window as unknown as { __film: Film }).__film = film(scene, canvas.current!);
      return () => scene.dispose();
    }
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
