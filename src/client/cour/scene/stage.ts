// Ce que partagent les épreuves à l'écran : ce qu'elles reçoivent (le monde, la foule, l'heure du serveur, de quoi
// envoyer un geste) et ce qu'elles rendent (où se tient chaque candidat et ce qu'il fait, le plan de la caméra, les
// plans de leur révélation), plus quelques outils de caméra.

import * as THREE from "three";
import type { EpView, EpInput, MatchView } from "../../../shared/games/cour/match.ts";
import type { Candidate } from "../../../shared/games/cour/net.ts";
import type { Actor, ActorTarget } from "./crowd.ts";
import type { World } from "./world.ts";

export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** Aller au plan d'un coup (une coupe) au lieu d'y glisser */
  cut?: boolean;
  /** La vitesse à laquelle on y glisse (1 : normal) */
  ease?: number;
}

export const shot = (
  px: number,
  py: number,
  pz: number,
  lx: number,
  ly: number,
  lz: number,
  fov = 50,
  extra: Partial<Shot> = {},
): Shot => ({
  pos: new THREE.Vector3(px, py, pz),
  look: new THREE.Vector3(lx, ly, lz),
  fov,
  ...extra,
});

/** Entre deux plans, en douceur (pour les mouvements de caméra des cinématiques) */
export function between(a: Shot, b: Shot, k: number): Shot {
  const e = k * k * (3 - 2 * k);
  return { pos: a.pos.clone().lerp(b.pos, e), look: a.look.clone().lerp(b.look, e), fov: a.fov + (b.fov - a.fov) * e };
}

/** Un mouvement de caméra en plusieurs plans, de 0 à 1 */
export function path(shots: Shot[], k: number): Shot {
  const n = shots.length - 1;
  const t = Math.max(0, Math.min(1, k)) * n;
  const i = Math.min(n - 1, Math.floor(t));
  return between(shots[i]!, shots[i + 1]!, t - i);
}

export interface PointerInfo {
  kind: "down" | "move" | "up";
  /** Dans l'écran, de -1 à 1 (comme three.js) */
  nx: number;
  ny: number;
  /** En pixels */
  x: number;
  y: number;
  /** L'heure de l'écran */
  t: number;
  id: number;
  touch: boolean;
}

export interface StageCtx {
  world: World;
  actors: Map<string, Actor>;
  roster: Candidate[];
  /** Mon siège (null : je regarde) */
  me: string | null;
  serverNow: () => number;
  send: (i: EpInput) => void;
  /** Un effet sonore de l'épreuve */
  sound: (name: string, opts?: { gain?: number; at?: number; x?: number; z?: number; rate?: number }) => void;
  /** Un éclat d'effets (peinture, mousse, confettis…) à cet endroit */
  burst: (kind: string, x: number, y: number, z: number, opts?: { color?: string; count?: number; power?: number }) => void;
}

export interface Stage {
  /** À chaque image : la vue de l'épreuve, la partie, l'heure (serveur), le temps écoulé ; rend les places des candidats */
  frame(v: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget>;
  /** Le plan de jeu */
  camera(v: EpView | null, m: MatchView, now: number): Shot;
  /** Les plans de la révélation, au fil de k (0 à 1) */
  reveal(k: number): Shot;
  /** Là où se place la foule pendant la révélation (avant que l'épreuve commence) */
  lineup(ids: string[], k: number): Map<string, ActorTarget>;
  /** Un événement de la partie (le stage en fait un son, un effet, un geste) */
  onFx?(k: string, f: { id?: string; a?: number; b?: number; c?: number }, v: EpView | null, now: number): void;
  pointer?(p: PointerInfo, v: EpView | null): void;
  key?(code: string, down: boolean, v: EpView | null): void;
  /** Ce que la partie affiche par-dessus (consignes, état), pour l'interface */
  hud?(v: EpView, now: number): Record<string, unknown>;
  dispose(): void;
}

/** Le rayon de la souris ou du doigt vers le sol (ou vers un plan horizontal à cette hauteur) */
export function groundHit(world: World, nx: number, ny: number, y = 0): THREE.Vector3 | null {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(nx, ny), world.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
  const out = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, out) ? out : null;
}

/** L'endroit d'un objet à l'écran (en pixels), ou null s'il est derrière la caméra */
export function toScreen(world: World, p: THREE.Vector3): { x: number; y: number } | null {
  const v = p.clone().project(world.camera);
  if (v.z > 1) return null;
  const el = world.renderer.domElement;
  return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
}

/** Les éliminés des épreuves d'avant, assis dans les gradins (une rangée de places autour de la cour) */
export function standsPlaces(n: number, cx: number, cz: number, radius: number, from: number, to: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const perRow = Math.max(6, Math.ceil(n / 2));
  for (let k = 0; k < n; k++) {
    const row = Math.floor(k / perRow);
    const t = perRow > 1 ? (k % perRow) / (perRow - 1) : 0.5;
    const a = from + (to - from) * t;
    const r = radius + row * 1.2;
    out.push([cx + Math.cos(a) * r, row * 0.5, cz + Math.sin(a) * r]);
  }
  return out;
}

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
