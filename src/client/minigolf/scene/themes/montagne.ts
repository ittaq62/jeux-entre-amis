// La Montagne enneigée : un matin d'hiver éclatant, le ciel bleu dur, la neige qui scintille. Des pistes de gazon
// tracées dans la neige, bordées de rondins ; la glace bleutée qui brille ; des sapins poudrés, des chalets aux
// fenêtres allumées, les cimes tout autour, le téléphérique qui passe, et une neige fine qui tombe.

import * as THREE from "three";
import type { Course, MoverDef } from "../../../../shared/games/minigolf/course.ts";
import { iceTex, snowTex, stoneTex, woodTex } from "../textures.ts";
import { courseBox, feltMat, groundDisc, leafyBall, onCourse, plainKit, Scatter, surfaceMat, type Theme } from "./common.ts";

const FELT = 0x2f8a55;

let made: Theme | null = null;

/** Un sapin : trois cônes empilés, verts, la neige sur leurs épaules ; l'origine au pied */
function firGeometries(): { green: THREE.BufferGeometry; snow: THREE.BufferGeometry; trunk: THREE.BufferGeometry } {
  const greens: THREE.BufferGeometry[] = [];
  const snows: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const r = 0.62 - k * 0.16;
    const h = 0.75 - k * 0.1;
    const y = 0.35 + k * 0.42;
    const cone = new THREE.ConeGeometry(r, h, 10, 1, false);
    cone.translate(0, y + h / 2, 0);
    greens.push(cone);
    const cap = new THREE.ConeGeometry(r * 0.72, h * 0.42, 10, 1, false);
    cap.translate(0, y + h * 0.82, 0);
    snows.push(cap);
  }
  const trunk = new THREE.CylinderGeometry(0.07, 0.1, 0.45, 6);
  trunk.translate(0, 0.22, 0);
  return { green: mergeAll(greens), snow: mergeAll(snows), trunk };
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  let count = 0;
  for (const g of list) count += (g.index ? g.index.count : g.attributes.position!.count) * 3;
  const pos = new Float32Array(count);
  const nor = new Float32Array(count);
  let o = 0;
  for (const src of list) {
    const g = src.index ? src.toNonIndexed() : src;
    g.computeVertexNormals();
    pos.set(g.attributes.position!.array as Float32Array, o);
    nor.set(g.attributes.normal!.array as Float32Array, o);
    o += g.attributes.position!.array.length;
  }
  out.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, o), 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor.subarray(0, o), 3));
  return out;
}

export function montagneTheme(): Theme {
  if (made) return made;
  const felt = feltMat(FELT, 0.5, 0.06);
  const ice = surfaceMat(iceTex(), { color: 0xdaf1ff, roughness: 0.08, metalness: 0.05, envMapIntensity: 1.6 });
  const snow = surfaceMat(snowTex(), { color: 0xffffff, roughness: 0.95 });
  const bark = surfaceMat(woodTex(), { color: 0x8a6a4c, roughness: 0.9 });
  // L'écorce des rondins : la texture du bois, enroulée autour du tronc
  const logBark = new THREE.MeshStandardMaterial({ map: woodTex().map, normalMap: woodTex().normal, color: 0x8d6b4c, roughness: 0.92 });
  const rock = surfaceMat(stoneTex(), { color: 0xd5dbe3, roughness: 0.95, side: THREE.DoubleSide, scale: 1.4 });
  const iceWall = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.1, transparent: true, opacity: 0.75, clearcoat: 1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfbfdff, roughness: 0.85 });
  const coal = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 });
  const carrot = new THREE.MeshStandardMaterial({ color: 0xf07a1f, roughness: 0.6 });
  const scarf = new THREE.MeshStandardMaterial({ color: 0xd8352f, roughness: 0.8 });
  const firGreen = new THREE.MeshStandardMaterial({ color: 0x2c5a3a, roughness: 0.9, flatShading: true });
  const firSnow = new THREE.MeshStandardMaterial({ color: 0xf6faff, roughness: 0.9, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0x5a6270, roughness: 0.4, metalness: 0.7 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x2a6fd1, roughness: 0.5 });
  const fir = firGeometries();

  const snowman = (r: number, h: number) => {
    const g = new THREE.Group();
    const s1 = h * 0.42;
    const s2 = s1 * 0.72;
    const s3 = s2 * 0.7;
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r, s1 * 0.5), 20, 14), white);
    b1.position.y = Math.max(r, s1 * 0.5);
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(s2 * 0.5, 18, 12), white);
    b2.position.y = b1.position.y * 2 + s2 * 0.4;
    const b3 = new THREE.Mesh(new THREE.SphereGeometry(s3 * 0.5, 16, 12), white);
    b3.position.y = b2.position.y + s2 * 0.45 + s3 * 0.42;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(s3 * 0.08, s3 * 0.45, 8), carrot);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, b3.position.y, s3 * 0.6);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(s3 * 0.32, s3 * 0.32, s3 * 0.42, 14), coal);
    hat.position.y = b3.position.y + s3 * 0.5;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(s3 * 0.5, s3 * 0.5, 0.02, 14), coal);
    brim.position.y = b3.position.y + s3 * 0.3;
    const sc = new THREE.Mesh(new THREE.TorusGeometry(s2 * 0.32, s2 * 0.08, 6, 16), scarf);
    sc.rotation.x = Math.PI / 2;
    sc.position.y = b2.position.y + s2 * 0.38;
    g.add(b1, b2, b3, nose, hat, brim, sc);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(s3 * 0.06, 6, 6), coal);
      eye.position.set(s * s3 * 0.15, b3.position.y + s3 * 0.12, s3 * 0.43);
      g.add(eye);
    }
    return g;
  };

  const post = (look: string | undefined, r: number, h: number): THREE.Object3D => {
    let g: THREE.Object3D;
    if (look === "bonhomme") g = snowman(r, h);
    else if (look === "sapin") {
      const t = new THREE.Group();
      const s = h / 1.5;
      for (const [geo, mat] of [
        [fir.green, firGreen],
        [fir.snow, firSnow],
        [fir.trunk, bark],
      ] as const) {
        const m = new THREE.Mesh(geo, mat);
        m.scale.setScalar(s);
        t.add(m);
      }
      g = t;
    } else {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), rock);
      m.position.y = h / 2;
      g = new THREE.Group().add(m);
    }
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return g;
  };

  const mover = (def: MoverDef): THREE.Object3D | null => {
    const g = new THREE.Group();
    if (def.look === "telesiege") {
      // Des sièges suspendus à leur perche, qui défilent sous le câble
      for (const p of def.parts) {
        if (p.k !== "wall") continue;
        const cx = (p.a[0] + p.b[0]) / 2;
        const cz = (p.a[1] + p.b[1]) / 2;
        const chair = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.32), seatMat);
        seat.position.y = 0.18;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.36, 0.05), seatMat);
        back.position.set(0, 0.36, -0.14);
        const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.4, 6), metal);
        hanger.position.set(0, 1.4, -0.12);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.66, 6), metal);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, 0.42, 0.14);
        chair.add(seat, back, hanger, bar);
        chair.position.set(cx, 0, cz);
        g.add(chair);
      }
      // Le câble, dans l'axe où glissent les sièges : il a l'air immobile
      const first = def.parts.find((p) => p.k === "wall");
      if (first && first.k === "wall") {
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 30, 6), metal);
        cable.rotation.z = Math.PI / 2;
        cable.position.set(0, 2.6, first.a[1] - 0.12);
        g.add(cable);
      }
      g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      return g;
    }
    if (def.look === "bonhomme") {
      for (const p of def.parts) {
        if (p.k === "post") {
          const s = snowman(p.r, 1.5);
          s.position.set(p.c[0], 0, p.c[1]);
          g.add(s);
        } else if (p.k === "wall") {
          // Les bras : deux branches de bois, avec leurs brindilles
          const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, len, 8), bark);
          arm.rotation.z = Math.PI / 2;
          arm.position.set((p.a[0] + p.b[0]) / 2, 0.1, (p.a[1] + p.b[1]) / 2);
          g.add(arm);
          for (const s of [-1, 1]) {
            for (const k of [0, 1]) {
              const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.25, 5), bark);
              twig.position.set(p.a[0] + (len / 2) * (1 + s * (0.8 + k * 0.1)), 0.18, p.a[1] + (k ? 0.06 : -0.06));
              twig.rotation.z = s * 0.7;
              twig.rotation.x = k ? 0.5 : -0.5;
              g.add(twig);
            }
          }
        }
      }
      g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      return g;
    }
    return null;
  };

  const kit = plainKit({
    felt,
    ground: (mat) => {
      if (mat === "ice") return ice;
      if (mat === "snow") return snow;
      if (mat === "stone") return rock;
      return null;
    },
    side: rock,
    rail: (look) =>
      look === "luge" ? { material: iceWall, extra: 0.05, widen: 0.01 } : { material: logBark, extra: 0.035, widen: 0.03, round: true },
    wall: () => bark,
    post,
    mover,
    water: () => ice,
    flag: 0xd8352f,
  });

  made = {
    sky: {
      top: 0x2f7fd8,
      horizon: 0xdbe9f6,
      bottom: 0xe7eef6,
      sun: [0.45, 0.62, 0.35],
      sunColor: 0xfff4e6,
      sunIntensity: 3.4,
      hemiSky: 0xcfe2ff,
      hemiGround: 0xdfe8f2,
      hemiIntensity: 0.75,
      clouds: 0.25,
      cloudColor: 0xffffff,
      fog: 0xe4edf7,
      fogNear: 45,
      fogFar: 220,
      exposure: 0.82,
      grade: { warm: -0.01, sat: 1.12, vignette: 0.26 },
    },
    kit,
    ambience: "montagne",
    tick: (t, decor) => {
      const flakes = decor?.getObjectByName("flocons") as THREE.Points | undefined;
      if (flakes) {
        const m = flakes.material as THREE.ShaderMaterial;
        m.uniforms.time!.value = t;
      }
      const cabins = decor?.getObjectByName("cabines");
      if (cabins)
        cabins.children.forEach((cab, i) => {
          const d = cab.userData as { from: THREE.Vector3; to: THREE.Vector3; speed: number; a: number };
          const k = (((t * d.speed + d.a) % 1) + 1) % 1;
          cab.position.lerpVectors(d.from, d.to, k);
          cab.rotation.z = Math.sin(t * 1.3 + i) * 0.04;
        });
    },
    decor: (c, rng) => montagneDecor(c, rng, { snow, bark, firGreen, firSnow, fir, metal, white, rock }),
  };
  return made;
}

interface Mats {
  snow: THREE.Material;
  bark: THREE.Material;
  firGreen: THREE.Material;
  firSnow: THREE.Material;
  fir: { green: THREE.BufferGeometry; snow: THREE.BufferGeometry; trunk: THREE.BufferGeometry };
  metal: THREE.Material;
  white: THREE.Material;
  rock: THREE.Material;
}

const FLAKE_VERT = /* glsl */ `
uniform float time;
attribute float seed;
varying float vAlpha;
void main() {
  vec3 p = position;
  float fall = mod(p.y - time * (0.5 + seed * 0.5), 14.0);
  p.y = fall - 2.0;
  p.x += sin(time * 0.6 + seed * 20.0) * 0.6;
  p.z += cos(time * 0.5 + seed * 13.0) * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (2.0 + seed * 3.0) * (18.0 / -mv.z);
  vAlpha = smoothstep(0.0, 1.5, fall) * 0.9;
}`;
const FLAKE_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(d)) * vAlpha;
  gl_FragColor = vec4(1.0, 1.0, 1.0, a);
}`;

function montagneDecor(c: Course, rng: () => number, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const box = courseBox(c);
  const base = c.outY;
  g.add(groundDisc(m.snow, base - 0.002, 200));

  // Des bosses de neige autour des pistes
  const drifts = new Scatter(leafyBall(1, 0.06, 4), m.snow, false);
  for (let k = 0; k < 40; k++) {
    const x = box.x0 - 6 + rng() * (box.x1 - box.x0 + 12);
    const z = box.z0 - 6 + rng() * (box.z1 - box.z0 + 12);
    if (onCourse(c, x, z, 1.4)) continue;
    const s = 0.6 + rng() * 1.4;
    drifts.add(x, base - s * 0.75, z, [s * 1.4, s, s * 1.2], rng() * 6);
  }

  // Les sapins, en forêt tout autour
  const firs = [new Scatter(m.fir.green, m.firGreen), new Scatter(m.fir.snow, m.firSnow), new Scatter(m.fir.trunk, m.bark)];
  for (let k = 0; k < 150; k++) {
    const a = rng() * Math.PI * 2;
    const r = 3 + rng() * 40;
    const x = box.cx + Math.cos(a) * (r + (box.x1 - box.x0) / 2);
    const z = box.cz + Math.sin(a) * (r + (box.z1 - box.z0) / 2);
    if (onCourse(c, x, z, 1.6)) continue;
    const s = 1.6 + rng() * 2.8;
    for (const f of firs) f.add(x, base, z, [s, s * (0.9 + rng() * 0.3), s], rng() * 6);
  }

  // Les cimes tout autour, blanches en haut
  const peakRock = new THREE.MeshStandardMaterial({ color: 0x8b95a3, roughness: 1, flatShading: true });
  const peakSnow = new THREE.MeshStandardMaterial({ color: 0xf5f8fc, roughness: 0.9, flatShading: true });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rng() * 0.4;
    const r = 120 + rng() * 60;
    const h = 40 + rng() * 45;
    const w = 45 + rng() * 30;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(w, h, 7, 3), peakRock);
    peak.position.set(box.cx + Math.cos(a) * r, base + h / 2 - 4, box.cz + Math.sin(a) * r);
    peak.rotation.y = rng() * 6;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.42, h * 0.42, 7, 1), peakSnow);
    cap.position.copy(peak.position).add(new THREE.Vector3(0, h * 0.29 + 0.3, 0));
    cap.rotation.y = peak.rotation.y;
    g.add(peak, cap);
  }

  // Des chalets de bois aux toits enneigés, les fenêtres allumées
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8c5a34, roughness: 0.85 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb24a, emissiveIntensity: 1.4 });
  for (let k = 0; k < 6; k++) {
    const a = rng() * Math.PI * 2;
    const r = 7 + rng() * 12;
    const x = box.cx + Math.cos(a) * (r + (box.x1 - box.x0) / 2);
    const z = box.cz + Math.sin(a) * (r + (box.z1 - box.z0) / 2);
    if (onCourse(c, x, z, 4)) continue;
    const ch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2.6), wallMat);
    body.position.y = 1;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.4, 4), m.white);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.25, 1, 1.05);
    roof.position.y = 2.7;
    ch.add(body, roof);
    for (const s of [-0.75, 0.75]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), windowMat);
      w.position.set(s, 1.2, 1.31);
      ch.add(w);
    }
    ch.traverse((o) => o instanceof THREE.Mesh && ((o.castShadow = true), (o.receiveShadow = true)));
    ch.position.set(x, base, z);
    ch.rotation.y = Math.atan2(box.cx - x, box.cz - z);
    g.add(ch);
  }

  // Le téléphérique : deux pylônes, le câble, des cabines rouges qui montent
  const from = new THREE.Vector3(box.cx - 30, base + 9, box.z0 - 16);
  const to = new THREE.Vector3(box.cx + 34, base + 26, box.z0 - 52);
  for (const p of [from, to]) {
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, p.y - base + 1, 6), m.metal);
    pylon.position.set(p.x, (p.y + base) / 2, p.z);
    g.add(pylon);
  }
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, from.distanceTo(to), 4), m.metal);
  cable.position.copy(from).add(to).multiplyScalar(0.5);
  cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  g.add(cable);
  const cabins = new THREE.Group();
  cabins.name = "cabines";
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xd8352f, roughness: 0.5 });
  for (let k = 0; k < 3; k++) {
    const cab = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.2), cabinMat);
    body.position.y = -1.3;
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.42, 0.45, 1.22),
      new THREE.MeshStandardMaterial({ color: 0x9fc4e6, roughness: 0.1, metalness: 0.3 }),
    );
    glass.position.y = -1.05;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 4), m.metal);
    arm.position.y = -0.4;
    cab.add(body, glass, arm);
    cab.userData = { from, to, speed: 0.012, a: k / 3 };
    cabins.add(cab);
  }
  g.add(cabins);

  // La neige qui tombe, autour de la caméra et du trou
  const n = 900;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    pos[k * 3] = box.cx + (rng() - 0.5) * (box.x1 - box.x0 + 16);
    pos[k * 3 + 1] = rng() * 14;
    pos[k * 3 + 2] = box.cz + (rng() - 0.5) * (box.z1 - box.z0 + 16);
    seed[k] = rng();
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  fg.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const flakes = new THREE.Points(
    fg,
    new THREE.ShaderMaterial({
      vertexShader: FLAKE_VERT,
      fragmentShader: FLAKE_FRAG,
      uniforms: { time: { value: 0 } },
      transparent: true,
      depthWrite: false,
    }),
  );
  flakes.name = "flocons";
  flakes.frustumCulled = false;
  flakes.position.y = base;
  g.add(flakes);

  for (const sc of [drifts, ...firs]) {
    const mesh = sc.build();
    if (mesh) g.add(mesh);
  }
  void m.rock;
  return g;
}
