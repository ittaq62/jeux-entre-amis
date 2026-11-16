// Les quatre arènes en 3D, chacune une île qui flotte dans son ciel : la place du village (son kiosque, ses bancs, ses
// platanes et ses maisons), le bal du 14 juillet (l'estrade sous les lampions, la nuit et les feux d'artifice), le marché
// (les étals rayés, la camionnette, les boutiques) et le toit du clocher (au soleil couchant, le village tout en bas).
// Rien ne passe devant les combattants : le décor reste derrière eux, ou sous le plateau.

import * as THREE from "three";
import { ARENAS, type ArenaId, type PlatformNow } from "../../../shared/games/culbute/arenas.ts";
import {
  bake,
  bunting,
  cloud,
  cobbleTex,
  fireflies,
  flock,
  haloTexture,
  house,
  island,
  lanterns,
  mat,
  plankTex,
  seeded,
  skyDome,
  slateTex,
  stoneTex,
  tree,
  canvasTex,
  type HouseOpts,
} from "./decor.ts";
import type { Keep } from "./props.ts";

export interface ArenaScene {
  group: THREE.Group;
  /** Les plateformes, dans l'ordre de l'arène : on les déplace quand elles bougent */
  platforms: THREE.Object3D[];
  /** Le ciel : il suit la caméra */
  dome: THREE.Mesh;
  fog: THREE.Color;
  /** Lumière : jour, soir ou nuit ; d'où vient le soleil */
  light: { sun: number; sunColor: number; sky: number; ground: number; ambient: number; dir: THREE.Vector3; env: number };
  update: (time: number, plats: PlatformNow[]) => void;
}

function box(keep: Keep, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const b = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  b.receiveShadow = true;
  return b;
}

function cyl(keep: Keep, r0: number, r1: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const c = new THREE.Mesh(keep(new THREE.CylinderGeometry(r0, r1, h, seg)), m);
  c.position.set(x, y, z);
  c.castShadow = true;
  c.receiveShadow = true;
  return c;
}

/** Une rue de maisons, côte à côte, d'un bout à l'autre */
function street(
  keep: Keep,
  cache: Map<string, THREE.Material>,
  from: number,
  to: number,
  z: number,
  y: number,
  seed: number,
  palette: { walls: string[]; roofs: string[]; shutters: string[]; shops?: string[]; floors: [number, number] },
): THREE.Group {
  const g = new THREE.Group();
  const rnd = seeded(seed);
  let x = from;
  let i = 0;
  while (x < to) {
    const w = 3.2 + rnd() * 1.8;
    const o: HouseOpts = {
      w,
      floors: palette.floors[0] + Math.floor(rnd() * (palette.floors[1] - palette.floors[0] + 1)),
      wall: palette.walls[i % palette.walls.length]!,
      roof: palette.roofs[Math.floor(rnd() * palette.roofs.length)]!,
      shutter: palette.shutters[Math.floor(rnd() * palette.shutters.length)]!,
      door: rnd() < 0.6 ? "#6b4a32" : "#3f5f7f",
      flowers: rnd() < 0.7,
      chimney: rnd() < 0.6,
      shop: palette.shops && rnd() < 0.5 ? palette.shops[Math.floor(rnd() * palette.shops.length)] : undefined,
      seed: seed * 13 + i,
    };
    const h = house(keep, o, cache);
    h.position.set(x + w / 2, y, z + (rnd() - 0.5) * 0.6);
    g.add(h);
    x += w + 0.05;
    i++;
  }
  return g;
}

/** Une église au fond de la place : la nef et son clocher pointu */
function church(keep: Keep, cache: Map<string, THREE.Material>): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(keep, 0xffffff, 0.95, 0, stoneTex(keep, "#d9ccb0", [2, 3]));
  g.add(box(keep, 6, 6, 4, stone, 0, 3, 0));
  const tower = box(keep, 2.6, 11, 2.6, stone, 0, 5.5, 1.2);
  g.add(tower);
  const spire = new THREE.Mesh(keep(new THREE.ConeGeometry(1.9, 5, 4)), mat(keep, 0xffffff, 0.7, 0, slateTex(keep, "#5a6070", [3, 3])));
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0, 13.5, 1.2);
  g.add(spire);
  const clock = cyl(keep, 0.75, 0.75, 0.1, mat(keep, 0xf6f1e4, 0.5), 0, 8.6, 2.55, 24);
  clock.rotation.x = Math.PI / 2;
  g.add(clock);
  const hands = new THREE.Group();
  const ink = mat(keep, 0x1c1c22, 0.4);
  hands.add(box(keep, 0.08, 0.55, 0.04, ink, 0, 0.22, 0), box(keep, 0.4, 0.07, 0.04, ink, 0.17, 0, 0));
  hands.position.set(0, 8.6, 2.62);
  g.add(hands);
  const arch = mat(keep, 0x2a2420, 0.9);
  g.add(box(keep, 0.9, 1.4, 0.1, arch, 0, 10.2, 2.52));
  void cache;
  return g;
}

/** Un réverbère de fonte */
function lamp(keep: Keep, iron: THREE.Material, glow: THREE.Material, h = 3.2): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(keep, 0.06, 0.1, h, iron, 0, h / 2, 0, 8));
  g.add(cyl(keep, 0.22, 0.12, 0.35, iron, 0, h + 0.1, 0, 6));
  g.add(cyl(keep, 0.16, 0.16, 0.3, glow, 0, h - 0.12, 0, 6));
  return g;
}

/** Un banc qui flotte : des lattes de bois, des côtés de fonte verte et un dossier */
function benchPlatform(keep: Keep, w: number, wood: THREE.Material, iron: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) g.add(box(keep, w, 0.07, 0.24, wood, 0, -0.04, 0.45 - k * 0.27));
  for (let k = 0; k < 3; k++) {
    const slat = box(keep, w, 0.18, 0.06, wood, 0, 0.34 + k * 0.22, -0.72);
    slat.rotation.x = -0.12;
    g.add(slat);
  }
  for (const side of [-1, 1]) {
    const x = side * (w / 2 - 0.15);
    g.add(box(keep, 0.08, 0.08, 1.3, iron, x, -0.12, -0.1));
    g.add(box(keep, 0.08, 1.0, 0.08, iron, x, 0.38, -0.78));
    const curl = new THREE.Mesh(keep(new THREE.TorusGeometry(0.12, 0.035, 6, 12, Math.PI * 1.5)), iron);
    curl.position.set(x, 0.05, 0.62);
    curl.rotation.y = Math.PI / 2;
    g.add(curl);
  }
  return g;
}

/** Le toit du kiosque à musique : un octogone de cuivre vert, plat sur le dessus, avec sa frise */
function kiosqueRoof(keep: Keep, w: number): THREE.Group {
  const g = new THREE.Group();
  const copper = mat(keep, 0x4e9a7a, 0.45, 0.35);
  const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(w * 0.5, w * 0.62, 0.32, 8)), copper);
  top.rotation.y = Math.PI / 8;
  top.scale.z = 0.62;
  top.position.y = -0.16;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  const frieze = new THREE.Mesh(keep(new THREE.CylinderGeometry(w * 0.63, w * 0.63, 0.22, 8, 1, true)), mat(keep, 0xf4efe2, 0.7));
  frieze.rotation.y = Math.PI / 8;
  frieze.scale.z = 0.62;
  frieze.position.y = -0.42;
  g.add(frieze);
  const lace = mat(keep, 0xd9b34a, 0.4, 0.6);
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Mesh(keep(new THREE.ConeGeometry(0.1, 0.2, 4)), lace);
    c.rotation.x = Math.PI;
    c.position.set(-w * 0.55 + (i / 11) * w * 1.1, -0.62, 0.42);
    g.add(c);
  }
  // Le petit lanternon au milieu, en arrière (il ne gêne pas ceux qui se battent dessus)
  const finial = cyl(keep, 0.05, 0.05, 1.2, lace, 0, 0.5, -0.65, 8);
  g.add(finial);
  const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.14, 12, 8)), lace);
  ball.position.set(0, 1.15, -0.65);
  g.add(ball);
  return g;
}

/** Une planche du bal, pendue à deux cordes */
function swingPlank(keep: Keep, w: number, wood: THREE.Material, rope: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(box(keep, w, 0.2, 1.2, wood, 0, -0.1, -0.1));
  g.add(box(keep, w + 0.1, 0.06, 1.25, mat(keep, 0x7a2a2a, 0.7), 0, -0.22, -0.1));
  for (const side of [-1, 1]) g.add(cyl(keep, 0.025, 0.025, 10, rope, side * (w / 2 - 0.2), 5, -0.3, 4));
  return g;
}

/** L'auvent rayé d'un étal : la toile tendue (on rebondit dessus), ses franges, ses montants */
function awningPlatform(keep: Keep, w: number, a: string, b: string): THREE.Group {
  const g = new THREE.Group();
  const stripe = canvasTex(keep, 128, 8, (c) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 === 0 ? a : b;
      c.fillRect(i * 16, 0, 16, 8);
    }
  });
  stripe.repeat.set(w / 2.4, 1);
  const canvas = keep(new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.9, side: THREE.DoubleSide }));
  // Une toile bombée : le dessus à la hauteur de la plateforme, qui retombe devant et derrière
  const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 1, w, 24, 1, true, Math.PI / 2 - 0.8, 1.6)), canvas);
  top.rotation.z = Math.PI / 2;
  top.scale.set(0.35, 1, 1.2);
  top.position.set(0, -0.35, -0.2);
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  const frill = keep(new THREE.MeshStandardMaterial({ color: a, roughness: 0.9 }));
  const n = Math.floor(w / 0.3);
  for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(keep(new THREE.ConeGeometry(0.14, 0.22, 3)), frill);
    c.rotation.x = Math.PI;
    c.position.set(-w / 2 + 0.15 + (i * (w - 0.3)) / (n - 1), -0.2, 0.64);
    g.add(c);
  }
  const pole = mat(keep, 0x5d4037, 0.8);
  for (const side of [-1, 1]) g.add(cyl(keep, 0.05, 0.05, 2.1, pole, side * (w / 2 - 0.15), -1.15, -1.2, 6));
  return g;
}

/** L'étal sous l'auvent : le comptoir et ses cagettes, derrière les combattants */
function stall(keep: Keep, w: number, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(keep, 0xb58a5a, 0.85);
  g.add(box(keep, w - 0.3, 0.9, 0.9, wood, 0, 0.45, -1.35));
  const veg = [0xe2483d, 0xf2994a, 0x5f9a46, 0x8e44ad, 0xf2c94c];
  const fruit: THREE.BufferGeometry[] = [];
  const crateMat = mat(keep, 0xd8b07a, 0.9);
  for (let k = 0; k < Math.floor(w / 0.8); k++) {
    const cx = -w / 2 + 0.55 + k * 0.8;
    g.add(box(keep, 0.7, 0.22, 0.55, crateMat, cx, 1.0, -1.3));
    const c = new THREE.Color(veg[Math.floor(rnd() * veg.length)]!);
    for (let j = 0; j < 5; j++) {
      const s = new THREE.IcosahedronGeometry(0.11, 1);
      s.translate(cx - 0.22 + j * 0.11, 1.17 + rnd() * 0.04, -1.3 + (rnd() - 0.5) * 0.3);
      const n = s.getAttribute("position").count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      s.setAttribute("color", new THREE.BufferAttribute(col, 3));
      fruit.push(s);
    }
  }
  const merged = new THREE.Mesh(keep(mergeGeo(fruit)), keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
  g.add(merged);
  return g;
}

function mergeGeo(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let count = 0;
  for (const f of flat) count += f.getAttribute("position").count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const f of flat) {
    const n = f.getAttribute("position").count;
    pos.set(f.getAttribute("position").array as Float32Array, o * 3);
    nor.set(f.getAttribute("normal").array as Float32Array, o * 3);
    col.set(f.getAttribute("color").array as Float32Array, o * 3);
    o += n;
  }
  for (const p of parts) p.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** La camionnette du marché : la caisse est derrière, son toit (où l'on se bat) déborde vers l'avant en terrasse */
function vanPlatform(keep: Keep, w: number): THREE.Group {
  const g = new THREE.Group();
  const paint = mat(keep, 0x3f7fd8, 0.35, 0.2);
  const cream = mat(keep, 0xf4efe2, 0.5);
  // Le toit-terrasse, ses rambardes arrière
  g.add(box(keep, w, 0.14, 2.2, cream, 0, -0.07, -0.5));
  g.add(box(keep, w, 0.05, 0.05, mat(keep, 0xc9cfd6, 0.3, 0.8), 0, 0.3, -1.55));
  // La caisse, derrière
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(w * 1.05, 3.1, 1.6)), paint);
  body.position.set(0, -1.7, -1.6);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const sign = canvasTex(keep, 256, 64, (c) => {
    c.fillStyle = "#f2c94c";
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = "#7a3b2e";
    c.font = "bold 40px 'Libre Franklin Variable', system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("PRIMEURS", 128, 34);
  });
  sign.wrapS = sign.wrapT = THREE.ClampToEdgeWrapping;
  const plate = box(keep, w * 0.8, 0.7, 0.04, keep(new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 })), 0, -0.75, -0.78);
  g.add(plate);
  // Le comptoir ouvert sur le côté, des roues
  g.add(box(keep, w * 0.7, 0.9, 0.04, mat(keep, 0x2a3442, 0.3), 0, -1.75, -0.78));
  for (const side of [-1, 1]) {
    const wheel = cyl(keep, 0.42, 0.42, 0.3, mat(keep, 0x1b1b1f, 0.8), side * (w / 2 - 0.4), -3.3, -0.85, 18);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
    const hub = cyl(keep, 0.18, 0.18, 0.32, mat(keep, 0xc9cfd6, 0.3, 0.8), side * (w / 2 - 0.4), -3.3, -0.84, 12);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
  }
  return g;
}

/** Le petit campanile du clocher : son toit plat où l'on se bat, sa cloche dessous */
function belfryPlatform(keep: Keep, w: number, stone: THREE.Material, slate: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(box(keep, w + 0.2, 0.22, 1.6, slate, 0, -0.11, -0.3));
  for (const side of [-1, 1]) g.add(box(keep, 0.32, 3.0, 0.32, stone, side * (w / 2 - 0.2), -1.6, -0.75));
  g.add(box(keep, w, 0.3, 0.4, stone, 0, -0.4, -0.75));
  const bronze = keep(new THREE.MeshStandardMaterial({ color: 0xd8a64a, roughness: 0.32, metalness: 0.7, side: THREE.DoubleSide }));
  const profile = [
    [0.0, 0.0],
    [0.16, -0.01],
    [0.25, -0.06],
    [0.29, -0.16],
    [0.29, -0.3],
    [0.31, -0.42],
    [0.37, -0.53],
    [0.46, -0.62],
    [0.5, -0.67],
    [0.47, -0.69],
  ].map(([r, y]) => new THREE.Vector2(r!, y!));
  const bell = new THREE.Group();
  const shell = new THREE.Mesh(keep(new THREE.LatheGeometry(profile, 28)), bronze);
  shell.castShadow = true;
  const clapper = new THREE.Mesh(keep(new THREE.SphereGeometry(0.09, 10, 8)), mat(keep, 0x4a3a2a, 0.5, 0.6));
  clapper.position.y = -0.6;
  const yoke = box(keep, 0.9, 0.14, 0.18, mat(keep, 0x5a3a24, 0.85), 0, 0.07, 0);
  bell.add(shell, clapper, yoke);
  bell.position.set(0, -0.62, -0.75);
  bell.userData.bell = true;
  g.add(bell);
  return g;
}

/** Le sol du village, derrière l'arène : une grande île à lui, pavée ou herbue, qui part loin dans la brume */
function townGround(
  keep: Keep,
  top: THREE.Material,
  earth: number,
  rock: number,
  grass: number | undefined,
  y: number,
  seed: number,
  haze: THREE.Color,
): THREE.Group {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(170, 60)), top);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, y, -39);
  ground.receiveShadow = true;
  g.add(ground);
  // La falaise du village est loin : ses couleurs se perdent un peu dans l'air
  const far = (c: number) => new THREE.Color(c).lerp(haze, 0.45).getHex();
  const cliff = island(
    keep,
    -85,
    85,
    y,
    { top, rim: top, earth: far(earth), rock: far(rock), grass: grass === undefined ? undefined : far(grass), depth: 9 },
    seed,
  );
  cliff.position.z = -9.6;
  g.add(cliff);
  return g;
}

export function buildArena(id: ArenaId, scale: number, keep: Keep): ArenaScene {
  const def = ARENAS[id];
  const group = new THREE.Group();
  const platforms: THREE.Object3D[] = [];
  const solid = def.platforms[0]!;
  const x0 = solid.x0 * scale;
  const x1 = solid.x1 * scale;
  const cache = new Map<string, THREE.Material>();
  const rnd = seeded(id.length * 7 + 3);
  const W = x1 - x0;
  let update: ArenaScene["update"] = () => {};
  /** Ce qui vit dans le décor : les oiseaux, les lucioles */
  const lives: { group?: THREE.Group; update: (time: number) => void }[] = [];
  /** Le décor de fond, fusionné matière par matière (beaucoup moins d'appels de dessin) */
  const scenery = new THREE.Group();
  group.add(scenery);

  const thin = (i: number, make: (w: number) => THREE.Group) => {
    const p = def.platforms[i]!;
    const g = make((p.x1 - p.x0) * scale);
    g.position.set(((p.x0 + p.x1) / 2) * scale, p.y, 0);
    group.add(g);
    platforms[i] = g;
  };

  let dome: THREE.Mesh;
  let fog: THREE.Color;
  let light: ArenaScene["light"];
  const cloudMat = (c: number) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 1, emissive: c, emissiveIntensity: 0.35 }));

  switch (id) {
    case "place": {
      const sun = new THREE.Vector3(0.45, 0.5, -0.75);
      dome = skyDome(keep, { top: 0x2f7fd6, horizon: 0xd8eef9, bottom: 0xc4dceb, sun, glow: 0xfff1c8, glowSize: 0.6 });
      fog = new THREE.Color(0xcfe6f3);
      light = { sun: 2.4, sunColor: 0xfff0d6, sky: 0xdcecff, ground: 0x8a7a5a, ambient: 0.55, dir: new THREE.Vector3(5, 12, 9), env: 0.25 };
      const stage = island(
        keep,
        x0,
        x1,
        0,
        {
          top: mat(keep, 0xffffff, 0.92, 0, cobbleTex(keep, "#a89e8c", [W / 2.2, 1.6])),
          rim: mat(keep, 0xffffff, 0.95, 0, stoneTex(keep, "#a49a86", [W / 3, 0.4])),
          earth: 0x8a6440,
          rock: 0x6e6a66,
          grass: 0x6aa84f,
          depth: 3.6,
        },
        11,
      );
      group.add(stage);
      platforms[0] = stage;
      const wood = mat(keep, 0xffffff, 0.8, 0, plankTex(keep, "#a0703f", [1, 0.25]));
      const iron = mat(keep, 0x2f4a3a, 0.45, 0.5);
      thin(1, (w) => benchPlatform(keep, w, wood, iron));
      thin(2, (w) => benchPlatform(keep, w, wood, iron));
      thin(3, (w) => kiosqueRoof(keep, w));
      // Le kiosque lui-même, derrière : son socle de pierre et ses colonnes
      const kiosque = new THREE.Group();
      kiosque.add(cyl(keep, 2.4, 2.6, 0.5, mat(keep, 0xffffff, 0.95, 0, stoneTex(keep, "#c9bea6", [3, 0.4])), 0, 0.25, -2.4, 8));
      for (const dx of [-1.5, -0.55, 0.55, 1.5]) kiosque.add(cyl(keep, 0.08, 0.1, 4.7, iron, dx, 2.8, -1.2, 8));
      group.add(kiosque);
      // La place : les maisons, l'église, les platanes, les réverbères, des fanions, des nuages
      scenery.add(
        street(keep, cache, -34, 34, -12.6, -0.6, 3, {
          walls: ["#efe0c4", "#e8c99c", "#f3e8d4", "#d9b48e", "#e9d2a8", "#f0d9c0"],
          roofs: ["#b5523b", "#a8483a", "#c0653a"],
          shutters: ["#3f7fd8", "#5f8a5a", "#7a9cc4", "#c0653a"],
          shops: ["#c0392b", "#2f6f9a"],
          floors: [2, 3],
        }),
      );
      const back = street(keep, cache, -40, 40, -21, 0.4, 9, {
        walls: ["#e6d6bc", "#dcc29e", "#ece2d0"],
        roofs: ["#b5523b", "#a8483a"],
        shutters: ["#6f8faf", "#7a8a6a"],
        floors: [2, 4],
      });
      scenery.add(back);
      scenery.add(
        townGround(keep, mat(keep, 0xffffff, 0.95, 0, cobbleTex(keep, "#a39a88", [60, 24])), 0x8a6440, 0x6e6a66, 0x6aa84f, -0.62, 51, fog),
      );
      const ch = church(keep, cache);
      ch.position.set(4, 0.2, -18.5);
      scenery.add(ch);
      // Les platanes, entre la place et les maisons, sur les côtés (le kiosque reste dégagé)
      for (const tx of [-21, -15, -9.5, 9.5, 15, 21]) {
        const t = tree(keep, 3.8 + rnd() * 1.2, 0x5f9a46, 40 + Math.round(tx), cache);
        t.position.set(tx * scale + (rnd() - 0.5), -0.62, -10.4 - rnd() * 0.6);
        scenery.add(t);
      }
      const glowMat = keep(new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe6a0, emissiveIntensity: 0.6 }));
      for (const lx of [-12, 12]) {
        const l = lamp(keep, iron, glowMat);
        l.position.set(lx * scale, -0.62, -9.4);
        scenery.add(l);
      }
      scenery.add(
        bunting(keep, new THREE.Vector3(-16, 7.4, -11.2), new THREE.Vector3(0, 7.8, -11.2), 1.2, [0xe2483d, 0xf4efe2, 0x3f7fd8, 0xf2c94c]),
      );
      scenery.add(
        bunting(keep, new THREE.Vector3(0, 7.8, -11.2), new THREE.Vector3(16, 7.4, -11.2), 1.2, [0x2f9e6a, 0xf2c94c, 0xe86aa6, 0xf4efe2]),
      );
      const cm = cloudMat(0xffffff);
      group.add(
        cloud(keep, cm, -14, 14, -40, 3.2, 1),
        cloud(keep, cm, 10, 17, -46, 4, 2),
        cloud(keep, cm, 30, 12, -50, 3.6, 3),
        cloud(keep, cm, -34, 11, -48, 3, 4),
      );
      lives.push(flock(keep, 0x55606e, 61, 11.5, -26));
      break;
    }
    case "bal": {
      const moon = new THREE.Vector3(-0.45, 0.45, -0.77);
      dome = skyDome(keep, { top: 0x080c26, horizon: 0x2c2f6a, bottom: 0x14143a, sun: moon, glow: 0xc8d8ff, glowSize: 0.2 });
      fog = new THREE.Color(0x232860);
      light = { sun: 1.3, sunColor: 0xffd2a0, sky: 0x7d8be0, ground: 0x3a2f45, ambient: 0.85, dir: new THREE.Vector3(3, 10, 8), env: 0.35 };
      const top = mat(keep, 0xffffff, 0.75, 0, plankTex(keep, "#b07a4c", [W / 3, 2]));
      const stage = island(keep, x0, x1, 0, { top, rim: mat(keep, 0x5a3424, 0.8), earth: 0x4a3530, rock: 0x2c2a38, depth: 3.0 }, 23);
      group.add(stage);
      platforms[0] = stage;
      // Le tour de l'estrade : une draperie bleu, blanc, rouge, plissée
      const drape = canvasTex(keep, 96, 32, (c) => {
        ["#2a4fb0", "#f4efe2", "#c92a2a"].forEach((col, i) => {
          c.fillStyle = col;
          c.fillRect(i * 32, 0, 32, 32);
        });
      });
      drape.repeat.set(W / 3, 1);
      const pleats = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(W, 0.9, Math.floor(W * 6), 1)),
        keep(new THREE.MeshStandardMaterial({ map: drape, roughness: 0.85, side: THREE.DoubleSide })),
      );
      const pp = pleats.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getX(i) * 9) * 0.06 + (pp.getY(i) < 0 ? 0.04 : 0));
      pleats.geometry.computeVertexNormals();
      // Un peu en avant : la motte, bosselée, ne doit pas percer la draperie
      pleats.position.set((x0 + x1) / 2, -0.75, 1.56);
      group.add(pleats);
      const wood = mat(keep, 0xffffff, 0.8, 0, plankTex(keep, "#b98a5a", [1, 0.3]));
      const rope = mat(keep, 0xd8c7a0, 0.9);
      thin(1, (w) => swingPlank(keep, w, wood, rope));
      thin(2, (w) => swingPlank(keep, w, wood, rope));
      thin(3, (w) => {
        const g = swingPlank(keep, w, wood, rope);
        g.add(
          lanterns(
            keep,
            new THREE.Vector3(-w / 2, -0.2, 0.55),
            new THREE.Vector3(w / 2, -0.2, 0.55),
            0.3,
            [0xe2483d, 0xf2c94c, 0x3f7fd8],
            5,
          ),
        );
        return g;
      });
      // Les mâts, les lampions au-dessus de la piste, les maisons du village la nuit
      const pole = mat(keep, 0x3a2e26, 0.8);
      for (const px of [-11, 11]) group.add(cyl(keep, 0.13, 0.17, 13, pole, px * scale, 3.5, -3, 8));
      group.add(
        lanterns(
          keep,
          new THREE.Vector3(-11 * scale, 9.4, -3),
          new THREE.Vector3(11 * scale, 9.4, -3),
          1.6,
          [0xe2483d, 0xf4efe2, 0x3f7fd8],
          14,
        ),
      );
      group.add(
        lanterns(
          keep,
          new THREE.Vector3(-11 * scale, 8.2, -4.5),
          new THREE.Vector3(11 * scale, 8.6, -4.5),
          1.2,
          [0xf2c94c, 0xe86aa6, 0x2f9e6a],
          12,
        ),
      );
      const night = street(keep, cache, -40, 40, -14.5, -1.5, 17, {
        walls: ["#5a5a7a", "#4f5170", "#615f7c"],
        roofs: ["#3a2f45", "#40354a"],
        shutters: ["#2a3050"],
        floors: [2, 3],
      });
      // La nuit, les fenêtres sont allumées
      const lit = keep(new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffc860, emissiveIntensity: 0.9 }));
      night.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material === cache.get("vitre")) o.material = lit;
      });
      scenery.add(night);
      scenery.add(townGround(keep, mat(keep, 0x2c3a34, 1), 0x3a3030, 0x24222e, 0x2f4a3a, -1.52, 53, fog));
      for (let i = 0; i < 8; i++) {
        const t = tree(keep, 4.5 + rnd(), 0x1d2c2a, 70 + i, cache);
        t.position.set(-24 + i * 7 + rnd(), -1.52, -11 - rnd() * 1.5);
        scenery.add(t);
      }
      const flies = fireflies(keep, 46, 73, { x0: -26, x1: 26, y0: -0.8, y1: 4.5, z0: -10.5, z1: -5 });
      group.add(flies.points);
      lives.push({ update: flies.update });
      // La lune, les étoiles, et les feux d'artifice
      const moonMesh = new THREE.Mesh(
        keep(new THREE.SphereGeometry(3, 24, 16)),
        keep(new THREE.MeshBasicMaterial({ color: 0xf4f2e4, fog: false })),
      );
      moonMesh.position.copy(moon.clone().multiplyScalar(120));
      group.add(moonMesh);
      const starGeo = keep(new THREE.BufferGeometry());
      const sp: number[] = [];
      for (let i = 0; i < 260; i++) {
        const a = rnd() * Math.PI * 2;
        const h = 0.08 + rnd() * 0.9;
        sp.push(Math.cos(a) * 150 * Math.cos(h), Math.sin(h) * 150, -Math.abs(Math.sin(a)) * 150 * Math.cos(h) - 20);
      }
      starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
      group.add(
        new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true, fog: false }))),
      );
      const halo = haloTexture(keep);
      const bursts: { pts: THREE.Points; born: number; vel: Float32Array }[] = [];
      const colors = [0xff5a5a, 0xffd25a, 0x6ad1ff, 0xff8ae2, 0x8aff8a, 0xffffff];
      let next = 1.5;
      update = (time) => {
        if (time > next) {
          next = time + 1.2 + ((time * 7.3) % 1.4);
          const n = 90;
          const geo = keep(new THREE.BufferGeometry());
          const pos = new Float32Array(n * 3);
          const vel = new Float32Array(n * 3);
          for (let k = 0; k < n; k++) {
            const u = Math.random() * 2 - 1;
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(1 - u * u);
            vel.set([Math.cos(a) * r * 9, u * 9, Math.sin(a) * r * 4], k * 3);
          }
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          const m = keep(
            new THREE.PointsMaterial({
              color: colors[Math.floor(Math.random() * colors.length)],
              size: 1.1,
              map: halo,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              fog: false,
            }),
          );
          const p = new THREE.Points(geo, m);
          p.position.set(-26 + Math.random() * 52, 15 + Math.random() * 8, -34);
          group.add(p);
          bursts.push({ pts: p, born: time, vel });
        }
        for (let k = bursts.length - 1; k >= 0; k--) {
          const b = bursts[k]!;
          const age = time - b.born;
          const pos = b.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
          const spread = 1 - Math.exp(-age * 2.2);
          for (let i = 0; i < pos.count; i++)
            pos.setXYZ(i, b.vel[i * 3]! * spread, b.vel[i * 3 + 1]! * spread - age * age * 1.6, b.vel[i * 3 + 2]! * spread);
          pos.needsUpdate = true;
          (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age / 1.8);
          if (age > 1.8) {
            group.remove(b.pts);
            bursts.splice(k, 1);
          }
        }
      };
      break;
    }
    case "marche": {
      const sun = new THREE.Vector3(-0.5, 0.55, -0.68);
      dome = skyDome(keep, { top: 0x3b8ee0, horizon: 0xe3f2fa, bottom: 0xc8deea, sun, glow: 0xfff6d6, glowSize: 0.5 });
      fog = new THREE.Color(0xd8ecf6);
      light = {
        sun: 2.4,
        sunColor: 0xffecc8,
        sky: 0xdbefff,
        ground: 0x9a8566,
        ambient: 0.55,
        dir: new THREE.Vector3(-5, 12, 9),
        env: 0.25,
      };
      const stage = island(
        keep,
        x0,
        x1,
        0,
        {
          top: mat(keep, 0xffffff, 0.92, 0, cobbleTex(keep, "#b9aa8e", [W / 2.2, 1.6])),
          rim: mat(keep, 0xffffff, 0.95, 0, stoneTex(keep, "#b0a284", [W / 3, 0.4])),
          earth: 0x8a6440,
          rock: 0x75706a,
          grass: 0x78b04f,
          depth: 3.4,
        },
        31,
      );
      group.add(stage);
      platforms[0] = stage;
      thin(1, (w) => awningPlatform(keep, w, "#e2483d", "#f6f1e6"));
      thin(2, (w) => awningPlatform(keep, w, "#2f9e6a", "#f6f1e6"));
      thin(3, (w) => vanPlatform(keep, w));
      // Les étals sous les auvents
      for (const i of [1, 2]) {
        const p = def.platforms[i]!;
        const s = stall(keep, (p.x1 - p.x0) * scale, rnd);
        s.position.x = ((p.x0 + p.x1) / 2) * scale;
        group.add(s);
      }
      scenery.add(
        street(keep, cache, -36, 36, -12.6, -0.6, 21, {
          walls: ["#f3e6cf", "#eccaa0", "#dfe6ea", "#ecd3aa", "#f0dcc6"],
          roofs: ["#8a5a44", "#9a4a3a", "#b5523b"],
          shutters: ["#3f7fd8", "#2f9e6a", "#e2483d", "#7a9cc4"],
          shops: ["#e2483d", "#2f9e6a", "#f2994a", "#3f7fd8"],
          floors: [2, 3],
        }),
      );
      scenery.add(
        street(keep, cache, -44, 44, -21, 0.4, 27, {
          walls: ["#e6dac4", "#e2cfb0", "#dde2e4"],
          roofs: ["#8a5a44", "#9a4a3a"],
          shutters: ["#6f8faf", "#7a8a6a"],
          floors: [3, 4],
        }),
      );
      scenery.add(
        townGround(keep, mat(keep, 0xffffff, 0.95, 0, cobbleTex(keep, "#b4a58c", [60, 24])), 0x8a6440, 0x75706a, 0x78b04f, -0.62, 57, fog),
      );
      for (let i = 0; i < 7; i++) {
        const t = tree(keep, 4 + rnd() * 1.2, 0x6aa84f, 90 + i, cache);
        t.position.set(-24 + i * 8 + rnd() * 2, -0.62, -10.4 - rnd());
        scenery.add(t);
      }
      scenery.add(
        bunting(
          keep,
          new THREE.Vector3(-20, 7.6, -11.2),
          new THREE.Vector3(20, 7.6, -11.2),
          1.6,
          [0xe2483d, 0xf2c94c, 0x3f7fd8, 0x2f9e6a, 0xf4efe2],
          26,
        ),
      );
      const cm = cloudMat(0xffffff);
      group.add(cloud(keep, cm, -20, 15, -44, 3.6, 5), cloud(keep, cm, 6, 18, -48, 4.2, 6), cloud(keep, cm, 26, 13, -42, 3, 7));
      lives.push(flock(keep, 0x5a6270, 67, 12, -27, 4));
      break;
    }
    case "clocher":
    default: {
      const sun = new THREE.Vector3(0.62, 0.1, -0.78);
      dome = skyDome(keep, { top: 0x352a68, horizon: 0xffb27a, bottom: 0x8a5a7a, sun, glow: 0xffc27a, glowSize: 1.6 });
      fog = new THREE.Color(0xe9a07c);
      light = { sun: 2.6, sunColor: 0xffb47a, sky: 0xffcfa6, ground: 0x6a5a7e, ambient: 0.6, dir: new THREE.Vector3(9, 6, 7), env: 0.4 };
      const stone = mat(keep, 0xffffff, 0.95, 0, stoneTex(keep, "#c4b08c", [W / 2.5, 5]));
      const slate = mat(keep, 0xffffff, 0.6, 0.1, slateTex(keep, "#596274", [W / 1.5, 2]));
      // Le haut de la tour : une corniche de pierre, puis la tour qui descend loin dans le vide
      const stage = new THREE.Group();
      const deck = new THREE.Mesh(keep(new THREE.BoxGeometry(W + 0.3, 0.4, 3.4)), [stone, stone, slate, stone, stone, stone]);
      deck.position.set((x0 + x1) / 2, -0.2, -0.4);
      deck.receiveShadow = true;
      deck.castShadow = true;
      stage.add(deck);
      stage.add(box(keep, W - 0.4, 16, 2.8, stone, (x0 + x1) / 2, -8.4, -0.7));
      // Les abat-sons de la chambre des cloches, l'horloge
      const louvre = mat(keep, 0x3a2e26, 0.9);
      for (const ax of [-2.6, 2.6]) {
        stage.add(box(keep, 1.2, 2.4, 0.1, louvre, ax, -3.2, 0.72));
        // Le haut de l'ouverture, en plein cintre
        const arc = new THREE.Mesh(keep(new THREE.CircleGeometry(0.6, 16, 0, Math.PI)), louvre);
        arc.position.set(ax, -2.0, 0.78);
        stage.add(arc);
      }
      const clock = cyl(keep, 1.05, 1.05, 0.12, mat(keep, 0xf6f1e4, 0.5), 0, -2.6, 0.76, 28);
      clock.rotation.x = Math.PI / 2;
      stage.add(clock);
      const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(1.05, 0.07, 6, 28)), mat(keep, 0xc59a3a, 0.35, 0.8));
      ring.position.set(0, -2.6, 0.84);
      stage.add(ring);
      const ink = mat(keep, 0x1c1c22, 0.4);
      const hourHand = box(keep, 0.09, 0.55, 0.04, ink, 0, 0, 0);
      hourHand.geometry.translate(0, 0.25, 0);
      const minHand = box(keep, 0.06, 0.85, 0.04, ink, 0, 0, 0);
      minHand.geometry.translate(0, 0.4, 0);
      hourHand.position.set(0, -2.6, 0.88);
      minHand.position.set(0, -2.6, 0.9);
      stage.add(hourHand, minHand);
      group.add(stage);
      platforms[0] = stage;
      thin(1, (w) => belfryPlatform(keep, w, stone, slate));
      // Le village tout en bas, dans la lumière du soir
      const below = new THREE.Group();
      below.add(
        street(keep, cache, -50, 50, 0, 0, 41, {
          walls: ["#f2d6b4", "#e8c49a", "#f0dcc6"],
          roofs: ["#b5523b", "#a8483a", "#c0653a"],
          shutters: ["#3f7fd8", "#5f8a5a"],
          floors: [1, 2],
        }),
      );
      const row2 = street(keep, cache, -60, 60, -14, 0, 43, {
        walls: ["#e6caa8", "#dcc0a0"],
        roofs: ["#a8483a", "#b5523b"],
        shutters: ["#6f8faf"],
        floors: [1, 2],
      });
      below.add(row2);
      for (let i = 0; i < 14; i++) {
        const t = tree(keep, 3 + rnd(), 0x6f8a4a, 120 + i, cache);
        t.position.set(-48 + i * 7.5 + rnd() * 2, 0, -6 - rnd() * 3);
        below.add(t);
      }
      const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(240, 120)), mat(keep, 0x8a8a5a, 1));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.2, -30);
      below.add(ground);
      below.position.set(0, -24, -26);
      below.scale.setScalar(1);
      scenery.add(below);
      const cm = cloudMat(0xffd6b8);
      group.add(
        cloud(keep, cm, -22, 4, -50, 4.2, 8),
        cloud(keep, cm, 18, 1, -46, 3.4, 9),
        cloud(keep, cm, 34, 8, -58, 5, 10),
        cloud(keep, cm, -40, -2, -55, 4.6, 11),
      );
      lives.push(flock(keep, 0x3a2a3a, 79, 5.5, -22, 6));
      const bells: THREE.Object3D[] = [];
      group.traverse((o) => {
        if (o.userData.bell) bells.push(o);
      });
      update = (time) => {
        minHand.rotation.z = -time * 0.25;
        hourHand.rotation.z = -time * 0.02 - 1.2;
        // La cloche sonne de temps en temps : elle se balance, puis s'apaise
        const since = time % 24;
        for (const b of bells) b.rotation.z = since < 6 ? Math.sin(since * 4.2) * 0.32 * (1 - since / 6) : 0;
      };
      break;
    }
  }

  bake(scenery, keep);
  for (const l of lives) if (l.group) group.add(l.group);

  // Les nuages dérivent lentement (les plus loin, plus lentement), et s'effacent avant de revenir de l'autre côté
  const clouds = group.children
    .filter((o) => o.userData.cloud)
    .map((o) => ({ o, x: o.position.x, s: o.scale.clone(), v: 0.5 * (40 / -o.position.z) }));
  // Les lampions vacillent un peu, chacun à son rythme
  const flickers: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.userData.flicker !== undefined) flickers.push(o);
  });

  const fullUpdate: ArenaScene["update"] = (time, plats) => {
    for (const c of clouds) {
      const x = ((((c.x + time * c.v + 75) % 150) + 150) % 150) - 75;
      const fade = Math.min(1, (75 - Math.abs(x)) / 14);
      c.o.position.x = x;
      c.o.scale.copy(c.s).multiplyScalar(Math.max(0.001, fade));
    }
    for (const o of flickers) {
      const ph = o.userData.flicker as number;
      const v = 0.86 + 0.09 * Math.sin(time * 6.1 + ph) + 0.05 * Math.sin(time * 15.3 + ph * 2.3);
      if (o instanceof THREE.Sprite) o.material.opacity = 0.55 * v;
      else if (o instanceof THREE.Mesh) (o.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 * v;
    }
    for (const l of lives) l.update(time);
    for (let i = 0; i < def.platforms.length; i++) {
      if (!def.platforms[i]!.move) continue;
      const p = plats[i];
      const m = platforms[i];
      if (p && m) m.position.set((p.x0 + p.x1) / 2, p.y, 0);
    }
    update(time, plats);
  };
  return { group, platforms, dome: dome!, fog: fog!, light: light!, update: fullUpdate };
}
