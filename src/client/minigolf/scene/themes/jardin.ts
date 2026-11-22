// Le Jardin du château : une fin d'après-midi dorée, des pistes de gazon bordées de buis taillé, des allées de gravier
// blond, des parterres de fleurs, des ifs en cône, des orangers en caisse, des urnes de pierre, de grands tilleuls, et
// au bout du jardin le château, ses toits d'ardoise et ses hautes fenêtres.

import * as THREE from "three";
import type { Course, MoverDef } from "../../../../shared/games/minigolf/course.ts";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { barkTex, gravelTex, grassTex, hedgeTex, sandTex, stoneTex, woodTex } from "../textures.ts";
import {
  boxMeters,
  broadleafTree,
  canvasTex,
  courseBox,
  feltMat,
  flowWater,
  groundDisc,
  leafyBall,
  onCourse,
  planeMeters,
  plainKit,
  roundedSlab,
  Scatter,
  shadows,
  surfaceMat,
  waterMat,
  type Theme,
} from "./common.ts";

const FELT = 0x3f9a46;

let made: Theme | null = null;

export function jardinTheme(): Theme {
  if (made) return made;
  const hedge = surfaceMat(hedgeTex(), { color: 0xffffff, roughness: 0.95 });
  const hedgeTall = surfaceMat(hedgeTex(), { color: 0xe6f0e0, roughness: 0.95, scale: 1.3 });
  const stone = surfaceMat(stoneTex(), { color: 0xffffff, roughness: 0.85 });
  const stoneSide = surfaceMat(stoneTex(), { color: 0xe8dfcf, roughness: 0.9, side: THREE.DoubleSide, scale: 0.8 });
  const gravel = surfaceMat(gravelTex(), { color: 0xffffff, roughness: 1 });
  const sand = surfaceMat(sandTex(), { color: 0xffffff, roughness: 1 });
  const wood = surfaceMat(woodTex(), { color: 0xffffff, roughness: 0.75 });
  const felt = feltMat(FELT, 0.5, 0.075);
  const water = waterMat(0x2f6f6a, 0.84);
  const iron = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.45, metalness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a842, roughness: 0.3, metalness: 0.9 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.9 });
  // Le feuillage des grands arbres : la texture du buis, plus grande, teintée arbre par arbre, plus sombre dessous
  const foliage = surfaceMat(hedgeTex(), { color: 0xffffff, roughness: 0.92, scale: 0.18, vertexColors: true });
  const bark = surfaceMat(barkTex(), { color: 0xffffff, roughness: 0.95 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 });
  // Le château
  const facade = new THREE.MeshStandardMaterial({ map: facadeTex(), roughness: 0.86 });
  const chateauStone = surfaceMat(stoneTex(), { color: 0xf7efde, roughness: 0.85, scale: 0.7 });
  const slate = new THREE.MeshStandardMaterial({ map: slateTex(), roughness: 0.5, metalness: 0.15 });
  const zinc = new THREE.MeshStandardMaterial({ color: 0x8a9399, roughness: 0.38, metalness: 0.65 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x23344a, roughness: 0.12, metalness: 0.5 });
  const door = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.6 });
  const pot = new THREE.MeshStandardMaterial({ color: 0xb8643a, roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.6 });
  const green = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf08a1c, roughness: 0.55 });
  const canvas = new THREE.MeshStandardMaterial({ color: 0xf3ead4, roughness: 0.85, side: THREE.DoubleSide });
  const beam = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 });

  const post = (look: string | undefined, r: number, h: number): THREE.Object3D => {
    const g = new THREE.Group();
    if (look === "if") {
      // Un if taillé en cône, dans un pot de terre cuite
      const p = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.75, 0.16, 16), pot);
      p.position.y = 0.08;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 1.05, h * 1.25, 18, 4), hedge);
      cone.position.y = 0.16 + (h * 1.25) / 2;
      g.add(p, cone);
    } else if (look === "oranger") {
      // La caisse de Versailles, blanche et verte, et l'oranger taillé en boule
      const boxM = new THREE.Mesh(new THREE.BoxGeometry(r * 1.9, 0.34, r * 1.9), white);
      boxM.position.y = 0.17;
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), green);
        knob.position.set((x! * r * 1.9) / 2, 0.36, (z! * r * 1.9) / 2);
        g.add(knob);
      }
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 8), beam);
      trunk.position.y = 0.55;
      const crown = new THREE.Mesh(leafyBall(2, 0.1, 7), leaf);
      crown.scale.setScalar(0.34);
      crown.position.y = 0.95;
      g.add(boxM, trunk, crown);
      for (let k = 0; k < 9; k++) {
        const o = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), orange);
        const a = k * 2.4;
        const y = 0.85 + (k % 3) * 0.1;
        o.position.set(Math.cos(a) * 0.31, y, Math.sin(a) * 0.31);
        g.add(o);
      }
    } else if (look === "statue") {
      // Un piédestal de pierre et une grande urne
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.5, 24), stone);
      base.position.y = 0.25;
      const prof = [
        [0.0, 0],
        [0.18, 0],
        [0.2, 0.04],
        [0.1, 0.12],
        [0.12, 0.2],
        [0.28, 0.38],
        [0.32, 0.55],
        [0.27, 0.68],
        [0.3, 0.72],
        [0.0, 0.72],
      ].map(([x, y]) => new THREE.Vector2(x! * (r / 0.36), y!));
      const urn = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), stone);
      urn.position.y = 0.5;
      g.add(base, urn);
    } else {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), stone);
      m.position.y = h / 2;
      g.add(m);
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
    if (def.look === "grille") {
      // Une grille de fer forgé : un cadre, des barreaux, des pointes dorées
      const g = new THREE.Group();
      for (const p of def.parts) {
        if (p.k === "wall") {
          const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
          const frame = new THREE.Group();
          const top = 0.62;
          const bars = Math.round(len / 0.09);
          for (let i = 0; i <= bars; i++) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, top, 6), iron);
            bar.position.set(-len / 2 + (i * len) / bars, top / 2, 0);
            frame.add(bar);
            if (i % 2 === 0) {
              const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 8), gold);
              tip.position.set(-len / 2 + (i * len) / bars, top + 0.025, 0);
              frame.add(tip);
            }
          }
          for (const y of [0.05, 0.3, top]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.022, 0.022), iron);
            rail.position.y = y;
            frame.add(rail);
          }
          // Des volutes au milieu
          for (const side of [-1, 1]) {
            const curl = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.007, 6, 18, Math.PI * 1.5), gold);
            curl.position.set(side * len * 0.22, 0.42, 0);
            curl.rotation.z = side > 0 ? 0 : Math.PI;
            frame.add(curl);
          }
          frame.position.set((p.a[0] + p.b[0]) / 2, 0, (p.a[1] + p.b[1]) / 2);
          frame.rotation.y = -Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);
          g.add(frame);
        } else if (p.k === "post") {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.1, p.y1 + 0.02, 12), iron);
          m.position.set(p.c[0], (p.y1 + 0.02) / 2, p.c[1]);
          const ball = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.4, 12, 10), gold);
          ball.position.set(p.c[0], p.y1 + 0.05, p.c[1]);
          g.add(m, ball);
        }
      }
      g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      return g;
    }
    if (def.look === "moulin") {
      // Les ailes : un bras de bois, un treillis, une toile tendue
      const g = new THREE.Group();
      const caps = def.parts.filter((p) => p.k === "cap");
      let hub: THREE.Vector3 | null = null;
      for (let i = 0; i < caps.length; i += 2) {
        const arm = caps[i]!;
        const sail = caps[i + 1];
        if (arm.k !== "cap") continue;
        const a = new THREE.Vector3(...arm.a);
        const b = new THREE.Vector3(...arm.b);
        const dir = b.clone().sub(a).normalize();
        hub = a.clone().sub(dir.clone().multiplyScalar(0.12));
        const len = a.distanceTo(b) + 0.12;
        const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.05), beam);
        armMesh.position.copy(hub).add(dir.clone().multiplyScalar(len / 2));
        armMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        g.add(armMesh);
        if (sail && sail.k === "cap") {
          const sa = new THREE.Vector3(...sail.a);
          const sb = new THREE.Vector3(...sail.b);
          const slen = sa.distanceTo(sb);
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.2, slen + 0.08), canvas);
          cloth.position.copy(sa).add(sb).multiplyScalar(0.5);
          cloth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          cloth.position.z += 0.02;
          g.add(cloth);
          for (let k = 0; k <= 5; k++) {
            const rung = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.014, 0.014), beam);
            rung.position.copy(sa).add(dir.clone().multiplyScalar(-0.04 + (k * (slen + 0.08)) / 5));
            rung.quaternion.copy(cloth.quaternion);
            g.add(rung);
          }
        }
      }
      if (hub) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 16), beam);
        cap.rotation.x = Math.PI / 2;
        cap.position.copy(hub);
        g.add(cap);
      }
      g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      return g;
    }
    return null;
  };

  const kit = plainKit({
    felt,
    ground: (mat, look) => {
      if (mat === "sand") return look === "gravier" ? gravel : sand;
      if (mat === "wood") return wood;
      if (mat === "stone") return stone;
      return null;
    },
    side: stoneSide,
    rail: (look) =>
      look === "pierre" ? { material: stone, extra: 0.02, widen: 0.01 } : { material: hedge, extra: 0.07, widen: 0.022, bevel: 0.05 },
    wall: (look) => (look === "haie" ? hedgeTall : stone),
    post,
    mover,
    water: () => water,
    flag: 0xd83a3a,
  });

  made = {
    sky: {
      top: 0x5d93d6,
      horizon: 0xf6d6a8,
      bottom: 0x8a9a6a,
      sun: [0.72, 0.4, 0.3],
      sunColor: 0xffd49a,
      sunIntensity: 3.3,
      hemiSky: 0xb9d4ff,
      hemiGround: 0x6f8a4a,
      hemiIntensity: 0.85,
      clouds: 0.42,
      cloudColor: 0xfff1df,
      ridges: { kind: "arbres", height: 0.05, far: 0xa7b596, near: 0x5f7a4f },
      fog: 0xe9d7b8,
      fogNear: 40,
      fogFar: 250,
      exposure: 1.06,
      grade: { warm: 0.055, sat: 1.12, vignette: 0.3 },
    },
    kit,
    ambience: "jardin",
    tick: (t) => flowWater(water, t),
    decor: (c, rng) =>
      jardinDecor(c, rng, {
        hedge,
        hedgeTall,
        stone,
        gravel,
        leaf: foliage,
        bark,
        soil,
        water,
        white,
        beam,
        canvas,
        iron,
        gold,
        facade,
        chateauStone,
        slate,
        zinc,
        glass,
        door,
      }),
  };
  return made;
}

interface Mats {
  hedge: THREE.Material;
  hedgeTall: THREE.Material;
  stone: THREE.Material;
  gravel: THREE.Material;
  leaf: THREE.Material;
  bark: THREE.Material;
  soil: THREE.Material;
  water: THREE.Material;
  facade: THREE.Material;
  chateauStone: THREE.Material;
  slate: THREE.Material;
  zinc: THREE.Material;
  glass: THREE.Material;
  door: THREE.Material;
  white: THREE.Material;
  beam: THREE.Material;
  canvas: THREE.Material;
  iron: THREE.Material;
  gold: THREE.Material;
}

const grassMat = () => surfaceMat(grassTex(), { color: 0xffffff, roughness: 1 });
let grass: THREE.Material | null = null;

function jardinDecor(c: Course, rng: () => number, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const box = courseBox(c);
  const base = c.outY;
  grass ??= grassMat();
  g.add(groundDisc(grass, base - 0.002));

  // Le lit de gravier blond sous les pistes, un peu plus large qu'elles
  const pad = 1.3;
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(box.x1 - box.x0 + 2 + pad * 2, box.z1 - box.z0 + 2 + pad * 2), m.gravel);
  const uv = apron.geometry.attributes.uv as THREE.BufferAttribute;
  const ap = apron.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < ap.count; i++) uv.setXY(i, ap.getX(i), ap.getY(i));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(box.cx, base + 0.002, box.cz);
  apron.receiveShadow = true;
  g.add(apron);

  // Les haies qui encadrent, taillées aux arêtes arrondies, avec des ouvertures gardées par deux urnes ; un if en cône
  // à chaque coin
  const hx0 = box.x0 - 1 - pad - 0.4;
  const hx1 = box.x1 + 1 + pad + 0.4;
  const hz0 = box.z0 - 1 - pad - 0.4;
  const hz1 = box.z1 + 1 + pad + 0.4;
  const hedgeGeos: THREE.BufferGeometry[] = [];
  const cones = new Scatter(new THREE.ConeGeometry(1, 1, 16, 3), m.hedge);
  const balls = new Scatter(leafyBall(1, 0.04, 3), m.hedge);
  const urns = new Scatter(urnGeometry(), m.stone);
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const pieces = Math.max(1, Math.round(len / 3.2));
    const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let i = 0; i < pieces; i++) {
      const a = i / pieces;
      const b = (i + 0.92) / pieces;
      const cx = x0 + (x1 - x0) * ((a + b) / 2);
      const cz = z0 + (z1 - z0) * ((a + b) / 2);
      // Une ouverture de temps en temps, gardée par deux urnes sur leur socle
      if (pieces > 2 && i === Math.floor(pieces / 2)) {
        for (const s of [-1, 1]) {
          const off = (len / pieces) * 0.32 * s;
          urns.add(horiz ? cx + off : cx, base, horiz ? cz : cz + off, 1, 0);
        }
        continue;
      }
      const l = len * (b - a);
      const geo = roundedSlab(horiz ? l : 0.62, 0.86, horiz ? 0.62 : l, 0.16, 0.012, hedgeGeos.length + 1);
      geo.translate(cx, base + 0.43, cz);
      hedgeGeos.push(geo);
      if (i % 2 === 0) balls.add(cx, base + 1.04, cz, 0.24);
    }
  };
  run(hx0, hz0, hx1, hz0);
  run(hx0, hz1, hx1, hz1);
  run(hx0, hz0, hx0, hz1);
  run(hx1, hz0, hx1, hz1);
  for (const [x, z] of [
    [hx0, hz0],
    [hx1, hz0],
    [hx0, hz1],
    [hx1, hz1],
  ]) {
    cones.add(x!, base + 0.95, z!, [0.45, 1.9, 0.45]);
  }

  // Le long du gravier : des ifs en cône, et des massifs ronds bordés d'un anneau de buis, une butte de feuilles et
  // ses fleurs dessus
  // (des fleurs à vingt facettes : à cette taille, on ne voit pas la différence avec une sphère)
  const flowers = new Scatter(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), false);
  const rims = new Scatter(new THREE.TorusGeometry(1, 0.09, 6, 28).rotateX(Math.PI / 2), m.hedge);
  const soil = new Scatter(new THREE.CylinderGeometry(1, 1, 1, 24), m.soil, false);
  const mounds = new Scatter(leafyBall(2, 0.1, 7), m.hedge);
  const palette = [0xe8455a, 0xf3a8c0, 0xfbf3e4, 0x9a6ad8, 0xf6c445, 0xe86a2e];
  // Ce qui est déjà posé sur le gravier (chaque chose sa place, sans chevauchement)
  const placed: [number, number, number][] = [];
  const free = (x: number, z: number, r: number) => placed.every(([px, pz, pr]) => Math.hypot(x - px, z - pz) > r + pr + 0.12);
  for (let k = 0; k < 90; k++) {
    const side = Math.floor(rng() * 4);
    const t = rng();
    const x = side < 2 ? box.x0 - 1 + t * (box.x1 - box.x0 + 2) : side === 2 ? hx0 + 0.9 + rng() * 0.6 : hx1 - 0.9 - rng() * 0.6;
    const z = side >= 2 ? box.z0 - 1 + t * (box.z1 - box.z0 + 2) : side === 0 ? hz0 + 0.9 + rng() * 0.6 : hz1 - 0.9 - rng() * 0.6;
    if (onCourse(c, x, z, 0.7)) continue;
    if (k % 5 === 0) {
      if (!free(x, z, 0.24)) continue;
      placed.push([x, z, 0.24]);
      cones.add(x, base + 0.5, z, [0.22, 1.0, 0.22]);
    } else {
      const R = 0.32 + rng() * 0.22;
      if (!free(x, z, R + 0.1)) continue;
      placed.push([x, z, R + 0.1]);
      rims.add(x, base + 0.05, z, [R, 0.9, R]);
      soil.add(x, base + 0.03, z, [R * 0.96, 0.06, R * 0.96]);
      const mh = 0.1 + rng() * 0.06;
      mounds.add(
        x,
        base + 0.05,
        z,
        [R * 0.82, mh, R * 0.82],
        rng() * 6,
        new THREE.Color(0x4d8a3c).offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.08),
      );
      const col = palette[Math.floor(rng() * palette.length)]!;
      const col2 = palette[Math.floor(rng() * palette.length)]!;
      const n = Math.round(R * R * 220);
      for (let f = 0; f < n; f++) {
        // Sur la butte : plus haut au milieu
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * R * 0.78;
        const fy = base + 0.05 + mh * Math.sqrt(Math.max(0, 1 - (rr / (R * 0.82)) ** 2)) + 0.01;
        const tint = new THREE.Color(rr < R * 0.4 ? col2 : col).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.14);
        const s = 0.02 + rng() * 0.012;
        flowers.add(x + Math.cos(a) * rr, fy, z + Math.sin(a) * rr, [s, s * 0.6, s], rng() * 6, tint);
      }
    }
  }

  // Le château, au bout du jardin, derrière le trou ; une allée de gravier y mène, bordée d'ifs, coupée d'un bassin rond
  const cup = c.cups[0]!;
  const dx = cup.x - c.tee.x;
  const dz = cup.z - c.tee.z;
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l;
  const uz = dz / l;
  const chateau = chateauModel(m);
  const castleD = 44;
  chateau.position.set(cup.x + ux * castleD, base, cup.z + uz * castleD);
  chateau.rotation.y = Math.atan2(dx, dz) + Math.PI;
  g.add(chateau);
  // Où commence l'allée : au-delà des haies, dans l'axe du trou
  let a0 = 2;
  while (
    a0 < 30 &&
    cup.x + ux * a0 > hx0 - 0.5 &&
    cup.x + ux * a0 < hx1 + 0.5 &&
    cup.z + uz * a0 > hz0 - 0.5 &&
    cup.z + uz * a0 < hz1 + 0.5
  )
    a0 += 0.5;
  a0 += 0.6;
  const a1 = castleD - 11.6;
  const AW = 5.2;
  const avenue = new THREE.Mesh(planeMeters(AW, a1 - a0), m.gravel);
  avenue.geometry.rotateX(-Math.PI / 2);
  avenue.position.set(cup.x + ux * ((a0 + a1) / 2), base + 0.003, cup.z + uz * ((a0 + a1) / 2));
  avenue.rotation.y = Math.atan2(dx, dz);
  avenue.receiveShadow = true;
  g.add(avenue);
  const court = new THREE.Mesh(planeMeters(31, 9), m.gravel);
  court.geometry.rotateX(-Math.PI / 2);
  court.position.set(cup.x + ux * (castleD - 8), base + 0.003, cup.z + uz * (castleD - 8));
  court.rotation.y = Math.atan2(dx, dz);
  court.receiveShadow = true;
  g.add(court);
  // Le bassin, au milieu de l'allée, et son jet
  const bm = (a0 + a1) / 2 + 2;
  const bx = cup.x + ux * bm;
  const bz = cup.z + uz * bm;
  const basin = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 8, 48).rotateX(Math.PI / 2), m.stone);
  rim.position.y = 0.2;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.25, 0.36, 48, 1, true), m.stone);
  wall.position.y = 0.06;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.15, 48).rotateX(-Math.PI / 2), m.water);
  pool.position.y = 0.12;
  const vase = new THREE.Mesh(urnGeometry(), m.stone);
  vase.scale.setScalar(1.4);
  vase.position.y = 0.05;
  basin.add(rim, wall, pool, vase, fountainJets(0, 0, 1.95));
  basin.position.set(bx, base, bz);
  shadows(basin);
  g.add(basin);
  // Les ifs le long de l'allée, de part et d'autre, tous les quatre mètres (pas autour du bassin)
  for (let a = a0 + 1; a < a1 - 1; a += 3.6) {
    if (Math.abs(a - bm) < 3.4) continue;
    for (const s of [-1, 1]) {
      const px = cup.x + ux * a - uz * s * (AW / 2 + 0.5);
      const pz = cup.z + uz * a + ux * s * (AW / 2 + 0.5);
      cones.add(px, base + 0.85, pz, [0.36, 1.7, 0.36]);
    }
  }
  // Sur l'allée ? (les arbres s'en écartent)
  const onAvenue = (x: number, z: number, pad: number) => {
    const rx = x - cup.x;
    const rz = z - cup.z;
    const along = rx * ux + rz * uz;
    const across = Math.abs(-rx * uz + rz * ux);
    return along > a0 - pad && along < castleD + 14 && across < (along > castleD - 15 ? 27 : AW / 2 + pad);
  };

  // Les grands arbres au-delà des haies : des tilleuls (quelques variantes, tournées, à leur taille) et des peupliers
  const kinds = treeVariants();
  // Ceux qui sont près du parcours portent une ombre (la carte des ombres ne couvre que lui et un peu autour) ; les
  // autres non, pour ne pas les dessiner une seconde fois pour rien
  const woodSc = kinds.map((v) => new Scatter(v.wood, m.bark));
  const leafSc = kinds.map((v) => new Scatter(v.leaves, m.leaf));
  const woodFar = kinds.map((v) => new Scatter(v.wood, m.bark, false));
  const leafFar = kinds.map((v) => new Scatter(v.leaves, m.leaf, false));
  const shadowR = Math.max(c.box.x1 - c.box.x0, c.box.z1 - c.box.z0) / 2 + 3 + 4;
  const tint = () => new THREE.Color(0x74b25c).offsetHSL((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.08);
  for (let k = 0; k < 52; k++) {
    const a = rng() * Math.PI * 2;
    const r = 6 + rng() * 24;
    const x = box.cx + Math.cos(a) * (r + (box.x1 - box.x0) / 2);
    const z = box.cz + Math.sin(a) * (r + (box.z1 - box.z0) / 2);
    if (x > hx0 - 1.8 && x < hx1 + 1.8 && z > hz0 - 1.8 && z < hz1 + 1.8) continue;
    if (onAvenue(x, z, 2.6)) continue;
    const v = rng() < 0.22 ? 3 + Math.floor(rng() * 2) : Math.floor(rng() * 3);
    const s = 0.85 + rng() * 0.4;
    const rot = rng() * Math.PI * 2;
    const near = Math.hypot(x - box.cx, z - box.cz) < shadowR;
    (near ? woodSc : woodFar)[v]!.add(x, base, z, s, rot);
    (near ? leafSc : leafFar)[v]!.add(x, base, z, s, rot, tint());
  }

  for (const sc of [cones, balls, urns, flowers, rims, soil, mounds, ...woodSc, ...leafSc, ...woodFar, ...leafFar]) {
    const mesh = sc.build();
    if (mesh) g.add(mesh);
  }
  if (hedgeGeos.length) {
    const hedgesMesh = new THREE.Mesh(mergeGeometries(hedgeGeos)!, m.hedgeTall);
    for (const h of hedgeGeos) h.dispose();
    shadows(hedgesMesh);
    g.add(hedgesMesh);
  }

  // Ce que le trou demande en particulier : le moulin, les jets de la fontaine
  for (const d of c.def.decos) {
    if (d.k === "moulin") g.add(windmillHouse(d.at[0], d.at[1], c, m));
    if (d.k === "jets") g.add(fountainJets(d.at[0], d.at[1], d.s ?? 1.3));
  }
  return g;
}

/** Les arbres du jardin, faits une fois : trois tilleuls et deux peupliers */
let trees: { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry }[] | null = null;
function treeVariants() {
  trees ??= [
    broadleafTree(11, "rond", 5.6),
    broadleafTree(12, "rond", 5),
    broadleafTree(13, "rond", 6.2),
    broadleafTree(14, "haut", 8),
    broadleafTree(15, "haut", 7),
  ];
  return trees;
}

/** Une urne de pierre sur son socle carré (tournée autour de son axe) : 1,1 m de haut */
let urnGeo: THREE.BufferGeometry | null = null;
function urnGeometry(): THREE.BufferGeometry {
  if (urnGeo) return urnGeo;
  const prof: [number, number][] = [
    [0.0, 0.5],
    [0.17, 0.5],
    [0.17, 0.53],
    [0.11, 0.56],
    [0.08, 0.62],
    [0.1, 0.66],
    [0.2, 0.72],
    [0.25, 0.82],
    [0.24, 0.92],
    [0.2, 0.98],
    [0.27, 1.02],
    [0.27, 1.06],
    [0.2, 1.06],
    [0.0, 1.05],
  ];
  const bowl = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  );
  const plinth = boxMeters(0.36, 0.5, 0.36).translate(0, 0.25, 0);
  const cap = boxMeters(0.42, 0.05, 0.42).translate(0, 0.5, 0);
  const foot = boxMeters(0.42, 0.06, 0.42).translate(0, 0.03, 0);
  const all = [bowl, plinth, cap, foot].map((x) => x.toNonIndexed());
  urnGeo = mergeGeometries(all)!;
  for (const x of all) x.dispose();
  return urnGeo;
}

/**
 * Le château : un corps de logis, un avant-corps central sous son dôme carré et son fronton, deux ailes en retour qui
 * ferment la cour ; des façades de pierre blonde à hautes fenêtres (cintrées en bas, à clé en haut), un soubassement,
 * un bandeau entre les étages, une corniche saillante, des chaînes d'angle ; des toits d'ardoise à la Mansart percés de
 * lucarnes, de hautes cheminées ; devant, une terrasse et sa balustrade, un grand perron.
 */
function chateauModel(m: Mats): THREE.Group {
  const g = new THREE.Group();
  const parts: Record<"facade" | "stone" | "slate" | "zinc" | "glass" | "door", THREE.BufferGeometry[]> = {
    facade: [],
    stone: [],
    slate: [],
    zinc: [],
    glass: [],
    door: [],
  };
  const put = (k: keyof typeof parts, geo: THREE.BufferGeometry) => parts[k].push(geo.index ? geo.toNonIndexed() : geo);
  const boxAt = (k: keyof typeof parts, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(k, boxMeters(w, h, d).translate(x, y, z));
  /** Une façade : quatre murs, des travées de fenêtres (une texture qui se répète travée par travée) */
  const walls = (w: number, h: number, d: number, x: number, z: number) => {
    const pos: number[] = [];
    const uv: number[] = [];
    const corners: [number, number][] = [
      [x - w / 2, z + d / 2],
      [x + w / 2, z + d / 2],
      [x + w / 2, z - d / 2],
      [x - w / 2, z - d / 2],
    ];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i]!;
      const [bx, bz] = corners[(i + 1) % 4]!;
      const len = Math.hypot(bx - ax, bz - az);
      const bays = Math.max(1, Math.round(len / 3.1));
      const quad = [
        [ax, 0, az, 0, 0],
        [bx, 0, bz, bays, 0],
        [bx, h, bz, bays, 1],
        [ax, h, az, 0, 1],
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const q = quad[k]!;
        pos.push(q[0]!, q[1]!, q[2]!);
        uv.push(q[3]!, q[4]!);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    put("facade", geo);
  };
  /** Un toit en tronc de pyramide, de (w0, d0) à la hauteur y0 jusqu'à (w1, d1) à y1, fermé dessus */
  const frustum = (k: keyof typeof parts, w0: number, d0: number, w1: number, d1: number, y0: number, y1: number, x: number, z: number) => {
    const lo: [number, number][] = [
      [-w0 / 2, d0 / 2],
      [w0 / 2, d0 / 2],
      [w0 / 2, -d0 / 2],
      [-w0 / 2, -d0 / 2],
    ];
    const hi: [number, number][] = [
      [-w1 / 2, d1 / 2],
      [w1 / 2, d1 / 2],
      [w1 / 2, -d1 / 2],
      [-w1 / 2, -d1 / 2],
    ];
    const pos: number[] = [];
    const uv: number[] = [];
    const slope = Math.hypot(y1 - y0, (w0 - w1) / 2);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = lo[i]!;
      const b = lo[j]!;
      const c2 = hi[j]!;
      const d2 = hi[i]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const inset = (len - Math.hypot(c2[0] - d2[0], c2[1] - d2[1])) / 2;
      const quad = [
        [a[0], y0, a[1], 0, 0],
        [b[0], y0, b[1], len, 0],
        [c2[0], y1, c2[1], len - inset, slope],
        [d2[0], y1, d2[1], inset, slope],
      ];
      for (const q of [0, 1, 2, 0, 2, 3]) {
        const p = quad[q]!;
        pos.push(p[0]! + x, p[1]!, p[2]! + z);
        uv.push(p[3]!, p[4]!);
      }
    }
    // Le dessus
    for (const q of [0, 1, 2, 0, 2, 3]) {
      const p = hi[q]!;
      pos.push(p[0] + x, y1, p[1] + z);
      uv.push(p[0], p[1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    put(k, geo);
  };
  /** Un corps de bâtiment complet : ses murs, sa modénature, son toit, ses lucarnes et ses cheminées */
  const block = (w: number, h: number, d: number, x: number, z: number, o: { dome?: boolean; chimneys?: number } = {}) => {
    walls(w, h, d, x, z);
    // Le soubassement, le bandeau, la corniche (deux ressauts)
    boxAt("stone", w + 0.3, 1.0, d + 0.3, x, 0.5, z);
    boxAt("stone", w + 0.16, 0.32, d + 0.16, x, h * 0.5, z);
    boxAt("stone", w + 0.34, 0.3, d + 0.34, x, h - 0.5, z);
    boxAt("stone", w + 0.62, 0.42, d + 0.62, x, h - 0.17, z);
    // Les chaînes d'angle : des pierres alternées, longues et courtes, aux quatre coins
    for (const [sx, sz] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ] as const) {
      for (let y = 1.0, i = 0; y < h - 0.8; y += 0.62, i++) {
        const long = i % 2 === 0 ? 0.95 : 0.6;
        const cx = x + sx * (w / 2 - long / 2 + 0.06);
        const cz = z + sz * (d / 2 + 0.03);
        boxAt("stone", long, 0.56, 0.1, cx, y + 0.28, cz);
        const cx2 = x + sx * (w / 2 + 0.03);
        const cz2 = z + sz * (d / 2 - (i % 2 === 0 ? 0.6 : 0.95) / 2 + 0.06);
        boxAt("stone", 0.1, 0.56, i % 2 === 0 ? 0.6 : 0.95, cx2, y + 0.28, cz2);
      }
    }
    if (o.dome) {
      // Le dôme carré à l'impériale, son lanternon et son épi
      frustum("slate", w + 0.5, d + 0.5, w * 0.62, d * 0.62, h, h + 3.6, x, z);
      frustum("slate", w * 0.62, d * 0.62, w * 0.2, d * 0.2, h + 3.6, h + 5.8, x, z);
      boxAt("stone", 1.6, 1.4, 1.6, x, h + 6.4, z);
      frustum("zinc", 1.9, 1.9, 0.3, 0.3, h + 7.1, h + 8.0, x, z);
      put("zinc", new THREE.CylinderGeometry(0.05, 0.08, 1.4, 6).translate(x, h + 8.6, z));
      // Des œils-de-bœuf sur le dôme, devant et derrière
      for (const s of [-1, 1]) {
        put("stone", new THREE.TorusGeometry(0.55, 0.12, 6, 16).translate(x, h + 1.8, z + s * (d / 2 - 0.35)));
        put("glass", new THREE.CircleGeometry(0.5, 16).rotateY(s < 0 ? Math.PI : 0).translate(x, h + 1.8, z + s * (d / 2 - 0.3)));
      }
      return;
    }
    // Le toit à la Mansart : le brisis raide, puis le terrasson presque plat ; le faîte de zinc
    frustum("slate", w + 0.5, d + 0.5, w - 2.4, d - 2.4, h, h + 3.3, x, z);
    frustum("slate", w - 2.4, d - 2.4, w - 4.2, Math.max(0.6, d - 6.5), h + 3.3, h + 4.4, x, z);
    boxAt("zinc", w - 2.3, 0.14, d - 2.3, x, h + 3.32, z);
    // Les lucarnes sur le brisis, devant et derrière : un fronton cintré, une fenêtre
    const bays = Math.max(1, Math.round(w / 3.1));
    for (let i = 0; i < bays; i++) {
      const bx = x - w / 2 + (w / bays) * (i + 0.5);
      if (Math.abs(bx - x) > w / 2 - 1.4) continue;
      for (const s of [-1, 1]) {
        const fz = z + s * (d / 2 + 0.12);
        boxAt("stone", 1.4, 2.0, 1.6, bx, h + 1.0, fz - s * 0.8);
        put(
          "stone",
          new THREE.CylinderGeometry(0.78, 0.78, 1.7, 12, 1, false, 0, Math.PI)
            .rotateZ(Math.PI / 2)
            .rotateY(Math.PI / 2)
            .translate(bx, h + 2.0, fz - s * 0.85),
        );
        boxAt("glass", 0.82, 1.3, 0.05, bx, h + 0.95, fz + s * 0.01);
      }
    }
    // Les cheminées
    const nc = o.chimneys ?? 2;
    for (let i = 0; i < nc; i++) {
      const cx = x - w / 2 + (w / nc) * (i + 0.5);
      boxAt("stone", 1.1, 3.0, 0.7, cx, h + 4.4, z);
      boxAt("stone", 1.35, 0.25, 0.95, cx, h + 5.95, z);
    }
  };
  // Le corps de logis, l'avant-corps et son dôme, les deux ailes
  block(34, 12, 11, 0, 0, { chimneys: 4 });
  block(11.4, 13.2, 12.4, 0, 0.8, { dome: true });
  block(9, 12.2, 17, -21.5, 3, { chimneys: 2 });
  block(9, 12.2, 17, 21.5, 3, { chimneys: 2 });
  // Le fronton triangulaire de l'avant-corps, son tympan
  const front = 0.8 + 6.2;
  const tri = new THREE.Shape([new THREE.Vector2(-6, 0), new THREE.Vector2(6, 0), new THREE.Vector2(0, 2.4)]);
  put("stone", new THREE.ExtrudeGeometry(tri, { depth: 0.7, bevelEnabled: false }).translate(0, 13.2, front - 0.6));
  // Les colonnes de l'entrée, le balcon qu'elles portent et sa balustrade, la porte
  for (const cx of [-3.3, -1.6, 1.6, 3.3]) {
    put("stone", new THREE.CylinderGeometry(0.32, 0.36, 5.2, 12).translate(cx, 3.6, front + 0.9));
    boxAt("stone", 0.9, 0.3, 0.9, cx, 1.15, front + 0.9);
    boxAt("stone", 0.85, 0.35, 0.85, cx, 6.35, front + 0.9);
  }
  boxAt("stone", 9.4, 0.4, 2.2, 0, 6.7, front + 0.75);
  balustrade(put, -4.6, 4.6, 6.9, front + 1.75, 0.9);
  boxAt("door", 2.2, 4.0, 0.1, 0, 3.0, front + 0.02);
  // La terrasse devant le corps de logis, sa balustrade (ouverte au milieu), le grand perron
  const tz = 5.5 + 2.6;
  boxAt("stone", 25, 1.0, 5.2, 0, 0.5, tz);
  balustrade(put, -12.4, -3.4, 1.0, tz + 2.5, 0.85);
  balustrade(put, 3.4, 12.4, 1.0, tz + 2.5, 0.85);
  for (let i = 0; i < 4; i++) boxAt("stone", 6.8 + i * 0.5, 0.8 - i * 0.2, 0.45, 0, (0.8 - i * 0.2) / 2, tz + 2.6 + 0.225 + i * 0.45);
  // Tout, rassemblé par matière
  const mats = { facade: m.facade, stone: m.chateauStone, slate: m.slate, zinc: m.zinc, glass: m.glass, door: m.door };
  for (const k of Object.keys(parts) as (keyof typeof parts)[]) {
    if (!parts[k].length) continue;
    const geo = mergeGeometries(parts[k])!;
    for (const p of parts[k]) p.dispose();
    const mesh = new THREE.Mesh(geo, mats[k]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.scale.setScalar(0.95);
  return g;
}

/** Une balustrade de x0 à x1 (le long de x), posée à la hauteur y, en z : socle, balustres tournés, main courante */
function balustrade(put: (k: "stone", g: THREE.BufferGeometry) => void, x0: number, x1: number, y: number, z: number, h: number) {
  const len = x1 - x0;
  put("stone", boxMeters(len, 0.16, 0.4).translate((x0 + x1) / 2, y + 0.08, z));
  put("stone", boxMeters(len + 0.1, 0.14, 0.46).translate((x0 + x1) / 2, y + h - 0.07, z));
  const n = Math.floor(len / 0.32);
  const prof = [
    [0.07, 0],
    [0.07, 0.06],
    [0.05, 0.1],
    [0.1, 0.3],
    [0.05, 0.52],
    [0.07, 0.58],
    [0.07, 0.62],
  ].map(([r, yy]) => new THREE.Vector2(r!, yy! * ((h - 0.3) / 0.62)));
  for (let i = 0; i <= n; i++) {
    const x = x0 + (len * i) / n;
    put("stone", new THREE.LatheGeometry(prof, 6).translate(x, y + 0.16, z));
  }
}

/** La maison du moulin : un pignon blanchi à la chaux, le passage voûté de la balle, un toit de chaume */
function windmillHouse(x: number, z: number, c: Course, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const w = 1.8;
  const h = 1.3;
  const depth = 1.6;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, h);
  shape.lineTo(0, h + 0.8);
  shape.lineTo(-w / 2, h);
  shape.closePath();
  const arch = new THREE.Path();
  arch.moveTo(-0.29, 0);
  arch.lineTo(0.29, 0);
  arch.lineTo(0.29, 0.26);
  arch.absarc(0, 0.26, 0.29, 0, Math.PI, false);
  arch.lineTo(-0.29, 0);
  shape.holes.push(arch);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), m.white);
  body.position.set(0, 0, -depth);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // Le toit de chaume
  const thatch = new THREE.MeshStandardMaterial({ color: 0xb89252, roughness: 1 });
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, depth + 0.3), thatch);
    roof.position.set((s * w) / 4.1, h + 0.42, -depth / 2);
    roof.rotation.z = -s * 0.73;
    roof.castShadow = true;
    g.add(roof);
  }
  // La face avant du moulin est en z (le passage s'enfonce derrière)
  g.position.set(x, c.tee.y - 0.055, z);
  return g;
}

/** Des jets d'eau en arc autour du bassin */
function fountainJets(x: number, z: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.1, transparent: true, opacity: 0.55, emissive: 0x335566 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const p0 = new THREE.Vector3(Math.cos(a) * (r + 0.05), -0.12, Math.sin(a) * (r + 0.05));
    const p2 = new THREE.Vector3(Math.cos(a) * r * 0.45, -0.14, Math.sin(a) * r * 0.45);
    const p1 = p0.clone().lerp(p2, 0.5).setY(0.75);
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.012, 6, false), mat));
  }
  g.position.set(x, 0, z);
  return g;
}

/**
 * Une travée de façade (3,1 m de large, toute la hauteur) : la pierre blonde et ses joints ; en bas une haute
 * porte-fenêtre cintrée, en haut une fenêtre à clé et son balconnet de fer ; leurs encadrements, leurs appuis, l'ombre
 * de leur embrasure, les petits bois des vitres et le ciel qui s'y reflète ; les coulures sous les appuis.
 */
function facadeTex(): THREE.CanvasTexture {
  const W = 128;
  const H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  const Y = (m: number) => H - (m / 12) * H;
  const X = (m: number) => (m / 3.1) * W;
  g.fillStyle = "#ece1c8";
  g.fillRect(0, 0, W, H);
  // Les assises de pierre, de légères nuances
  for (let row = 0; row < 24; row++) {
    const y0 = Y((row + 1) * 0.5);
    const off = row % 2 ? X(0.6) : 0;
    for (let k = -1; k < 4; k++) {
      const x0 = off + k * X(1.2);
      const tone = 226 + ((row * 37 + k * 53) % 13) - 6;
      g.fillStyle = `rgb(${tone + 10},${tone},${tone - 26})`;
      g.fillRect(x0 + 1, y0 + 1, X(1.2) - 2, Y(0) - Y(0.5) - 2);
    }
    g.fillStyle = "rgba(140,118,86,0.45)";
    g.fillRect(0, y0, W, 1);
    for (let k = -1; k < 4; k++) g.fillRect(off + k * X(1.2), y0, 1, Y(0) - Y(0.5));
  }
  const glassAt = (x0: number, y0: number, w: number, h: number) => {
    const grd = g.createLinearGradient(0, y0, 0, y0 + h);
    grd.addColorStop(0, "#a9c2d4");
    grd.addColorStop(0.45, "#5f7a92");
    grd.addColorStop(1, "#2a3a4e");
    g.fillStyle = grd;
    g.fillRect(x0, y0, w, h);
    // Un reflet en biais
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, h);
    g.clip();
    g.fillStyle = "rgba(255,255,255,0.13)";
    g.beginPath();
    g.moveTo(x0 + w * 0.2, y0);
    g.lineTo(x0 + w * 0.55, y0);
    g.lineTo(x0 + w * 0.05, y0 + h * 0.6);
    g.lineTo(x0 - w * 0.3, y0 + h * 0.6);
    g.fill();
    g.restore();
    // Les petits bois : un meneau, des traverses
    g.fillStyle = "#f4efe4";
    g.fillRect(x0 + w / 2 - 1.5, y0, 3, h);
    for (let yy = y0 + h / 5; yy < y0 + h - 2; yy += h / 5) g.fillRect(x0, yy - 1, w, 2);
  };
  const surround = (x0: number, y0: number, w: number, h: number) => {
    g.fillStyle = "#f7f0e0";
    g.fillRect(x0 - 7, y0 - 7, w + 14, h + 14);
    g.fillStyle = "rgba(120,96,64,0.35)";
    g.fillRect(x0 - 7, y0 - 7, w + 14, 1);
    g.fillRect(x0 - 7, y0 - 7, 1, h + 14);
  };
  const sill = (x0: number, y: number, w: number) => {
    // Les coulures sous l'appui
    const grd = g.createLinearGradient(0, y, 0, y + 46);
    grd.addColorStop(0, "rgba(110,96,74,0.28)");
    grd.addColorStop(1, "rgba(110,96,74,0)");
    g.fillStyle = grd;
    g.fillRect(x0 - 4, y, w + 8, 46);
    g.fillStyle = "#fbf6ea";
    g.fillRect(x0 - 11, y - 4, w + 22, 7);
    g.fillStyle = "rgba(80,64,40,0.45)";
    g.fillRect(x0 - 11, y + 3, w + 22, 2);
  };
  // En bas : la porte-fenêtre cintrée
  {
    const w = X(1.5);
    const x0 = (W - w) / 2;
    const yTop = Y(4.6);
    const yBot = Y(1.25);
    const r = w / 2;
    g.fillStyle = "#f7f0e0";
    g.beginPath();
    g.arc(W / 2, yTop, r + 7, Math.PI, 0);
    g.lineTo(x0 + w + 7, yBot + 6);
    g.lineTo(x0 - 7, yBot + 6);
    g.fill();
    // La clé de l'arc
    g.fillStyle = "#fffaf0";
    g.beginPath();
    g.moveTo(W / 2 - 6, yTop - r - 9);
    g.lineTo(W / 2 + 6, yTop - r - 9);
    g.lineTo(W / 2 + 4, yTop - r + 6);
    g.lineTo(W / 2 - 4, yTop - r + 6);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(W / 2, yTop, r, Math.PI, 0);
    g.lineTo(x0 + w, yBot);
    g.lineTo(x0, yBot);
    g.closePath();
    g.clip();
    glassAt(x0, yTop - r, w, yBot - (yTop - r));
    // L'embrasure : son ombre en haut et à gauche
    g.fillStyle = "rgba(30,24,16,0.35)";
    g.fillRect(x0, yTop - r, 5, yBot - yTop + r);
    g.beginPath();
    g.arc(W / 2, yTop, r, Math.PI, 0);
    g.arc(W / 2, yTop + 5, r, 0, Math.PI, true);
    g.fill();
    g.restore();
    sill(x0, yBot + 4, w);
  }
  // En haut : la fenêtre à clé et son balconnet
  {
    const w = X(1.4);
    const x0 = (W - w) / 2;
    const y0 = Y(10.4);
    const y1 = Y(6.75);
    surround(x0, y0, w, y1 - y0);
    glassAt(x0, y0, w, y1 - y0);
    g.fillStyle = "rgba(30,24,16,0.35)";
    g.fillRect(x0, y0, w, 5);
    g.fillRect(x0, y0, 5, y1 - y0);
    // La clé, et la corniche du linteau
    g.fillStyle = "#fffaf0";
    g.beginPath();
    g.moveTo(W / 2 - 8, y0 - 16);
    g.lineTo(W / 2 + 8, y0 - 16);
    g.lineTo(W / 2 + 5, y0 + 2);
    g.lineTo(W / 2 - 5, y0 + 2);
    g.fill();
    g.fillStyle = "#fbf6ea";
    g.fillRect(x0 - 13, y0 - 20, w + 26, 6);
    g.fillStyle = "rgba(80,64,40,0.4)";
    g.fillRect(x0 - 13, y0 - 14, w + 26, 2);
    // Le balconnet de fer forgé
    const by0 = y1 - 30;
    g.strokeStyle = "#23262a";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0 - 4, by0);
    g.lineTo(x0 + w + 4, by0);
    g.moveTo(x0 - 4, y1 - 2);
    g.lineTo(x0 + w + 4, y1 - 2);
    g.stroke();
    g.lineWidth = 1.2;
    for (let xx = x0; xx <= x0 + w; xx += 6) {
      g.beginPath();
      g.moveTo(xx, by0);
      g.lineTo(xx, y1 - 2);
      g.stroke();
    }
    for (let xx = x0 + 9; xx < x0 + w - 4; xx += 18) {
      g.beginPath();
      g.arc(xx, (by0 + y1) / 2, 6, 0, Math.PI * 2);
      g.stroke();
    }
    sill(x0, y1 + 3, w);
  }
  // La frise sous la corniche
  g.fillStyle = "rgba(150,126,92,0.35)";
  g.fillRect(0, Y(11.55), W, 2);
  g.fillRect(0, Y(11.1), W, 1);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

/** Les ardoises : des rangées en quinconce, chacune son ton de bleu-gris, un liseré clair en haut, l'ombre dessous */
function slateTex(): THREE.CanvasTexture {
  const t = canvasTex(256, (g, S) => {
    g.fillStyle = "#2c333d";
    g.fillRect(0, 0, S, S);
    const rows = 10;
    const cols = 6;
    const rh = S / rows;
    const cw = S / cols;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? cw / 2 : 0;
      for (let k = -1; k <= cols; k++) {
        const x0 = off + k * cw;
        const v = ((r * 7 + k * 13) % 9) - 4;
        const base = [72 + v * 3, 82 + v * 3, 98 + v * 3];
        const grd = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
        grd.addColorStop(0, `rgb(${base[0]! + 18},${base[1]! + 18},${base[2]! + 18})`);
        grd.addColorStop(1, `rgb(${base[0]! - 14},${base[1]! - 14},${base[2]! - 12})`);
        g.fillStyle = grd;
        g.fillRect(x0 + 1.5, r * rh + 1, cw - 3, rh - 2.5);
      }
    }
  });
  t.repeat.set(1 / 1.1, 1 / 1.1);
  return t;
}
