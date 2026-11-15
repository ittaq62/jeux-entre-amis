// Une page réservée au développement : l'affiche de Crampons pour l'accueil, composée avec le vrai moteur du jeu (le stade,
// la foule, les joueurs, le ballon), puis photographiée en image (public/crampons-apercu.webp). La 3D ne se charge qu'à table.
// /dev/affiche?cam=33,2.2,9&vise=48,1.6,-0.5  (pour régler le cadre ; le reste est la composition retenue)
// &ballon=neon : un ballon de la boutique, pour le voir dans le vrai stade

import { useEffect, useRef } from "react";
import { isBallId, type BallId } from "../../shared/games/crampons/boutique.ts";
import { stepMatch } from "../../shared/games/crampons/match.ts";
import { DT, HALF_L } from "../../shared/games/crampons/pitch.ts";
import { setupFilm, steerStriker, type FilmPlan } from "./afficheFilm.ts";
import { CramponsScene, type SceneFrame, type Shot } from "./scene/CramponsScene.ts";
import { KICK_CONTACT, KICK_HOLD, type FootballerView, type Kit } from "./scene/footballers.ts";

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
// &film : l'action en mouvement, pour la vidéo de l'accueil (public/crampons-film.mp4), jouée par le vrai moteur du jeu
// (afficheFilm.ts : le 9 conduit le ballon et frappe, tous les autres sont des bots) et montrée comme à table (le geste de
// frappe calé sur le départ du ballon, le plongeon dans le sens du mouvement, la fête et la tête basse après le but).
// Un pilote, à 1200 × 900, appelle window.__film.step() image par image (un pas du moteur par image, 30 par seconde) et
// enregistre ce que rend le canevas. L'image où le ballon arrive en lucarne est l'affiche (public/crampons-apercu.webp) :
// la boucle part d'elle, va jusqu'à la fin de la fête (gros plan du buteur), revient en fondu (12 images) sur la course
// du 9 (à partir de l'image 4, quand il entre dans le cadre) et s'arrête juste avant elle, donc elle reprend sans saut.
// Encodée en H.264, 800 × 600, 24 images par seconde (ffmpeg -crf 35), muette.
// &graine=1&force=0.9&visee=-0.95&frappe=0.5 : une autre action que celle retenue
// ---------------------------------------------------------------------------------------------------------------------

/** L'action retenue parmi celles essayées sous Node (rehearse) : frappe de (38,2 ; 5,1), en lucarne, du côté où le gardien plonge */
const PLAN: FilmPlan = { seed: 2, power: 0.94, aim: 0.8, shotAt: 0.45 };
/** Le geste de frappe montré à l'écran commence juste avant le contact, comme à table (runtime.ts) */
const KICK_START = KICK_CONTACT - 0.02;
/** Ce qu'on filme de la fête, après le but */
const AFTER = 3.2;
/** Le ballon au fond, on passe au gros plan du buteur qui fête, comme à table (et l'angle de ce plan, réglable) */
const CUT = 0.6;

interface Film {
  /** L'image suivante : rendue et renvoyée en PNG, avec son temps de jeu ; null quand le film est fini */
  step: () => { png: string; t: number; poster: boolean } | null;
}

function planFrom(params: URLSearchParams): FilmPlan {
  const num = (k: string, d: number) => (params.has(k) && !Number.isNaN(Number(params.get(k))) ? Number(params.get(k)) : d);
  return {
    seed: num("graine", PLAN.seed),
    power: num("force", PLAN.power),
    aim: num("visee", PLAN.aim),
    shotAt: num("frappe", PLAN.shotAt),
  };
}

function film(canvas: HTMLCanvasElement, params: URLSearchParams, shot: Shot): { scene: CramponsScene; film: Film } {
  const plan = planFrom(params);
  const angle = Number(params.get("angle") ?? 0) || 0;
  const { m, striker } = setupFilm(plan);
  // La scène donne à chacun son allure selon sa place : le buteur prend la première, celle du 9 de l'affiche (les autres
  // gardent la leur), et il porte le 9
  const slot = m.players.map((p) => p.i);
  slot[0] = striker.i;
  slot[striker.i] = 0;
  const shown = slot.map((i) => m.players[i]!);
  const shirts = shown.map((p) => p.shirt);
  const nine = shown.findIndex((p) => p.team === 0 && p.shirt === 9 && p !== striker);
  if (nine >= 0) shirts[nine] = striker.shirt;
  shirts[0] = 9;
  const scene = new CramponsScene(canvas, {
    count: m.players.length,
    kits: KITS,
    gkKits: KEEPERS,
    keepers: shown.map((p) => p.role === "GK"),
    shirts,
    ambience: (params.get("ciel") as "jour" | "soir" | "nuit") ?? "nuit",
    weather: (params.get("meteo") as "clair" | "pluie" | "neige") ?? "clair",
    lowQuality: false,
    ball: ballParam(params.get("ballon")),
  });
  scene.resize(innerWidth, innerHeight);
  scene.setShot(shot);

  const views: FootballerView[] = shown.map((p) => view({ x: p.x, z: p.z, team: p.team, h: p.h, keeper: p.role === "GK" }));
  const last = shown.map((p) => [p.x, p.z] as [number, number]);
  const kickShow = new Map<number, number>();
  let t = 0;
  let started = false;
  let goalAt = -1;
  let posterDone = false;
  let close: { x: number; z: number } | null = null;

  const frame = (): SceneFrame => {
    const scorer = m.phase === "goal" ? (m.goals.at(-1)?.team ?? null) : null;
    shown.forEach((p, i) => {
      const v = views[i]!;
      const [lx, lz] = last[i]!;
      const dx = p.x - lx;
      const dz = p.z - lz;
      last[i] = [p.x, p.z];
      v.x = p.x;
      v.z = p.z;
      v.h = p.h;
      v.v = p.seen ?? Math.hypot(p.vx, p.vz);
      v.act = p.act;
      v.off = p.off;
      v.dirX = p.dirX;
      v.dirZ = p.dirZ;
      // Le plongeon et le tacle glissé partent dans le sens où le joueur se déplace vraiment
      const moved = Math.hypot(dx, dz);
      if ((p.act === "dive" || p.act === "slide") && moved > 0.02) {
        v.dirX = dx / moved;
        v.dirZ = dz / moved;
      }
      // La fête et la tête basse attendent la fin du geste en cours : le gardien finit son plongeon, retombe, puis se relève
      const busy = p.act !== "none";
      v.cheer = scorer !== null && p.team === scorer && !busy;
      v.sad = scorer !== null && p.team !== scorer && !busy;
      v.kickT = undefined;
      const kickAt = kickShow.get(p.i);
      if (kickAt !== undefined) {
        const age = t - kickAt;
        if (KICK_START + age > KICK_HOLD) kickShow.delete(p.i);
        else if (v.act === "none" || v.act === "kick") {
          v.act = "kick";
          v.kickT = KICK_START + age;
        }
      }
      // Le sens de sa marche par rapport à son regard : le gardien qui recule face au jeu marche à reculons
      v.gait = moved / DT > 0.5 ? (dx * Math.cos(p.h) + dz * Math.sin(p.h)) / moved : 1;
    });
    return {
      players: views,
      ball: { x: m.ball.x, y: m.ball.y, z: m.ball.z, vx: m.ball.vx, vz: m.ball.vz },
      active: -1,
      attackSide: 1,
      excitement: scorer !== null ? 1 : 0.55,
      cuts: 0,
      charge: 0,
      aim: null,
      receiver: -1,
    };
  };

  return {
    scene,
    film: {
      step() {
        if (goalAt >= 0 && t > goalAt + AFTER) return null;
        if (!started) {
          // Avant la première image, le public s'installe (le match, lui, ne bouge pas)
          for (let i = 0; i < 90; i++) scene.render(DT, frame());
          started = true;
        } else {
          steerStriker(m, plan, t, DT);
          const events = stepMatch(m);
          t += DT;
          for (const e of events) {
            if (e.k === "kick") kickShow.set(e.p, t);
            if (e.k === "shot" && e.power > 0.45) scene.impact(m.players[e.p]!.x, m.players[e.p]!.z, e.power);
            if (e.k === "goal") {
              const end = m.ball.x > 0 ? 1 : -1;
              const kit = KITS[e.team];
              scene.shakeNet(end);
              scene.celebrate(end, [kit.shirt, kit.sleeves, kit.shorts, "#ffffff", "#f8d866"]);
              goalAt = t;
            }
          }
        }
        // Le gros plan du buteur : la caméra se pose face à lui et le suit en douceur pendant qu'il court vers son coin
        if (goalAt >= 0 && t >= goalAt + CUT) {
          const k = close ? Math.min(1, DT * 10) : 1;
          close ??= { x: striker.x, z: striker.z };
          close.x += (striker.x - close.x) * k;
          close.z += (striker.z - close.z) * k;
          scene.setShot({ kind: "scorer", x: close.x, z: close.z, t: t - goalAt - CUT, angle, high: false });
        }
        scene.render(DT, frame());
        // L'affiche : le ballon arrive en lucarne, juste avant la ligne
        const poster = !posterDone && m.ball.x >= HALF_L - 0.45 && m.ball.vx > 0;
        if (poster) posterDone = true;
        return { png: canvas.toDataURL("image/png"), t, poster };
      },
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
    const shot: Shot = { kind: "free", x: cx, y: cy, z: cz, tx, ty, tz };
    if (params.has("film")) {
      const made = film(canvas.current!, params, shot);
      (window as unknown as { __film: Film }).__film = made.film;
      return () => made.scene.dispose();
    }
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
    scene.setShot(shot);
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
