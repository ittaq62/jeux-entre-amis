import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { dieFace } from "./textures.ts";

// Les dés : un vrai lancer. On simule d'avance la trajectoire (rebonds, roulis, frottements) sur l'arène,
// puis on la rejoue. La face du dessus à l'arrêt est celle qu'a tirée le serveur : on tourne le dé
// dans sa propre symétrie (le cube reste le même cube) pour que cette face-là soit en haut.

export const DIE = 0.4;
const H = DIE / 2;
const GRAVITY = 32;
const STEP = 1 / 240;
const MAX_STEPS = 240 * 1.4;

/** Les faces du dé dans l'ordre de BoxGeometry : +x, -x, +y, -y, +z, -z (les faces opposées font 7) */
const FACE_VALUES = [2, 5, 1, 6, 3, 4];
const AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

/** Les 24 rotations qui laissent un cube identique à lui-même */
const SYMMETRIES: THREE.Quaternion[] = (() => {
  const out: THREE.Quaternion[] = [];
  const m = new THREE.Matrix4();
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      const x = AXES[a]!;
      const y = AXES[b]!;
      if (Math.abs(x.dot(y)) > 0.5) continue;
      const z = new THREE.Vector3().crossVectors(x, y);
      m.makeBasis(x, y, z);
      out.push(new THREE.Quaternion().setFromRotationMatrix(m));
    }
  }
  return out;
})();

export interface Frame {
  p: THREE.Vector3;
  q: THREE.Quaternion;
}

export interface Throw {
  frames: Frame[][];
  /** Les chocs assez forts pour s'entendre : moment (s) et force */
  hits: { t: number; force: number }[];
  duration: number;
}

interface Body {
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  resting: number;
}

const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new THREE.Vector3(x * H, y * H, z * H))));
const tmp = new THREE.Vector3();
const r = new THREE.Vector3();
const vc = new THREE.Vector3();
const n = new THREE.Vector3();

/** L'inertie d'un cube plein de masse 1 : la même sur tous les axes */
const INV_I = 6 / (DIE * DIE);

function impulse(b: Body, rr: THREE.Vector3, dir: THREE.Vector3, j: number) {
  b.v.addScaledVector(dir, j);
  tmp.crossVectors(rr, dir).multiplyScalar(j * INV_I);
  b.w.add(tmp);
}

/** Un contact avec un plan (normale n, à la distance d de l'origine) : rebond, frottement, et on ressort du plan */
function collidePlane(b: Body, normal: THREE.Vector3, offset: number, hits: number[]) {
  let deepest = 0;
  for (const c of CORNERS) {
    r.copy(c).applyQuaternion(b.q);
    const depth = offset - (b.p.dot(normal) + r.dot(normal));
    if (depth <= 0) continue;
    deepest = Math.max(deepest, depth);
    vc.crossVectors(b.w, r).add(b.v);
    const vn = vc.dot(normal);
    if (vn >= 0) continue;
    const rn = tmp.crossVectors(r, normal).lengthSq();
    const bounce = vn < -1.2 ? 0.38 : 0.05;
    const jn = (-(1 + bounce) * vn) / (1 + rn * INV_I);
    impulse(b, r, normal, jn);
    if (-vn > 1.4) hits.push(-vn);
    // Frottement : on freine le glissement, au plus 0,5 fois la poussée
    vc.crossVectors(b.w, r).add(b.v);
    n.copy(normal).multiplyScalar(vc.dot(normal));
    const vt = vc.sub(n);
    const speed = vt.length();
    if (speed > 1e-5) {
      vt.divideScalar(speed);
      const rt = tmp.crossVectors(r, vt).lengthSq();
      const jt = Math.min(speed / (1 + rt * INV_I), 0.5 * jn);
      impulse(b, r, vt, -jt);
    }
  }
  if (deepest > 0) b.p.addScaledVector(normal, deepest);
}

const UP = new THREE.Vector3(0, 1, 0);
const WALLS = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];

/**
 * Simule un lancer de deux dés vers l'arène (centrée en 0, demi-côté arena).
 * from : la direction d'où vient le lancer (vers la caméra), values : les faces à obtenir.
 */
export function simulateThrow(values: [number, number], from: THREE.Vector3, arena: number, rand: () => number): Throw {
  const side = new THREE.Vector3(-from.z, 0, from.x);
  const bodies: Body[] = values.map((_, k) => {
    const lateral = (k === 0 ? -1 : 1) * (0.28 + rand() * 0.12);
    const start = from
      .clone()
      .multiplyScalar(arena + 0.9)
      .addScaledVector(side, lateral);
    start.y = 2.6 + rand() * 0.4;
    // On vise un point de l'arène, côté lanceur, pour que les dés roulent ensuite vers le milieu
    const target = from
      .clone()
      .multiplyScalar(0.35 + rand() * 0.25)
      .addScaledVector(side, lateral * 0.7 + (rand() - 0.5) * 0.3);
    target.y = H;
    const T = 0.42 + rand() * 0.08;
    const v = target.clone().sub(start).divideScalar(T);
    v.y = (target.y - start.y) / T + 0.5 * GRAVITY * T;
    // Un peu plus de vitesse vers l'avant : ils glissent et roulent après l'impact
    v.addScaledVector(from, -1.2);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.3, rand() * 6.3, rand() * 6.3));
    const w = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(12 + rand() * 7);
    return { p: start, v, q, w, resting: 0 };
  });
  const frames: Frame[][] = bodies.map(() => []);
  const hits: { t: number; force: number }[] = [];
  let steps = 0;
  const contactHits: number[] = [];
  for (; steps < MAX_STEPS; steps++) {
    const late = steps > MAX_STEPS * 0.66;
    for (const b of bodies) {
      b.v.y -= GRAVITY * STEP;
      b.p.addScaledVector(b.v, STEP);
      // La rotation : q += ½ w q dt
      const wq = new THREE.Quaternion(b.w.x * STEP * 0.5, b.w.y * STEP * 0.5, b.w.z * STEP * 0.5, 0).multiply(b.q);
      b.q.set(b.q.x + wq.x, b.q.y + wq.y, b.q.z + wq.z, b.q.w + wq.w).normalize();
      contactHits.length = 0;
      collidePlane(b, UP, 0, contactHits);
      // Les bords de l'arène, une fois les dés arrivés dessus
      if (b.p.y < 0.9) for (const wall of WALLS) collidePlane(b, wall, -arena, contactHits);
      for (const f of contactHits) hits.push({ t: steps * STEP, force: f });
      const grounded = b.p.y < H * 1.8;
      // Un peu de résistance au roulement quand le dé touche le sol ; plus forte vers la fin
      if (grounded) {
        b.v.multiplyScalar(late ? 0.972 : 0.994);
        b.w.multiplyScalar(late ? 0.955 : 0.988);
      }
      b.resting = grounded && b.v.lengthSq() < 0.01 && b.w.lengthSq() < 0.05 ? b.resting + 1 : 0;
    }
    // Les deux dés se cognent : on les écarte comme deux boules
    const [a, b] = bodies as [Body, Body];
    tmp.subVectors(b.p, a.p);
    tmp.y = 0;
    const dist = tmp.length();
    const min = DIE * 1.05;
    if (dist < min && dist > 1e-6) {
      tmp.divideScalar(dist);
      const push = (min - dist) / 2;
      a.p.addScaledVector(tmp, -push);
      b.p.addScaledVector(tmp, push);
      const rel = b.v.dot(tmp) - a.v.dot(tmp);
      if (rel < 0) {
        a.v.addScaledVector(tmp, rel * 0.65);
        b.v.addScaledVector(tmp, -rel * 0.65);
        if (-rel > 1) hits.push({ t: steps * STEP, force: -rel });
      }
    }
    if (steps % 2 === 0) bodies.forEach((bd, k) => frames[k]!.push({ p: bd.p.clone(), q: bd.q.clone() }));
    if (bodies.every((bd) => bd.resting > 24)) break;
  }

  // À l'arrêt, chaque dé se pose bien à plat ; puis on choisit sa symétrie pour montrer la bonne face
  bodies.forEach((b, k) => {
    const flat = snapFlat(b.q);
    const settle = 10;
    const list = frames[k]!;
    const from0 = list[list.length - 1]!;
    for (let s = 1; s <= settle; s++) {
      const t = s / settle;
      const p = from0.p.clone();
      p.y = THREE.MathUtils.lerp(from0.p.y, H, t);
      list.push({ p, q: from0.q.clone().slerp(flat, t) });
    }
    const topAxis = upAxisOf(flat);
    const want = FACE_VALUES.indexOf(values[k]!);
    const options = SYMMETRIES.filter((s) => AXES[want]!.clone().applyQuaternion(s).dot(AXES[topAxis]!) > 0.9);
    const fix = options[Math.floor(rand() * options.length)] ?? new THREE.Quaternion();
    for (const f of list) f.q.multiply(fix);
  });
  const length = Math.max(...frames.map((f) => f.length));
  for (const list of frames) while (list.length < length) list.push(list[list.length - 1]!);
  // Les chocs trop rapprochés ne font qu'un son
  const sounds: { t: number; force: number }[] = [];
  for (const h of hits.sort((x, y) => x.t - y.t)) {
    const last = sounds[sounds.length - 1];
    if (last && h.t - last.t < 0.05) last.force = Math.max(last.force, h.force);
    else sounds.push({ ...h });
  }
  return { frames, hits: sounds, duration: length * 2 * STEP };
}

/** L'axe local du dé qui pointe vers le haut */
function upAxisOf(q: THREE.Quaternion): number {
  let best = 0;
  let bestDot = -2;
  AXES.forEach((a, k) => {
    const d = a.clone().applyQuaternion(q).y;
    if (d > bestDot) {
      bestDot = d;
      best = k;
    }
  });
  return best;
}

/** La même orientation, posée exactement à plat sur une face */
function snapFlat(q: THREE.Quaternion): THREE.Quaternion {
  const up = AXES[upAxisOf(q)]!.clone().applyQuaternion(q);
  const fix = new THREE.Quaternion().setFromUnitVectors(up, UP);
  return fix.multiply(q).normalize();
}

/** Les deux dés : arrondis, ivoire, points noirs (et le 1 en rouge) */
export function diceMeshes(): THREE.Mesh[] {
  const geo = new RoundedBoxGeometry(DIE, DIE, DIE, 4, DIE * 0.14);
  const mats = FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: dieFace(v), roughness: 0.32, metalness: 0 }));
  return [0, 1].map(() => {
    const m = new THREE.Mesh(geo, mats);
    m.castShadow = true;
    return m;
  });
}

/** Une orientation au repos qui montre une face donnée */
export function restingQuaternion(value: number, yaw: number): THREE.Quaternion {
  const want = FACE_VALUES.indexOf(value);
  const toUp = new THREE.Quaternion().setFromUnitVectors(AXES[want]!, UP);
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(toUp);
}
