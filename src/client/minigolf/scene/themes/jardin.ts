// Le Jardin du château : une fin d'après-midi dorée, des pistes de gazon bordées de buis taillé, des allées de gravier
// blond, des parterres de fleurs, des ifs en cône, des orangers en caisse, des urnes de pierre, de grands tilleuls, et
// au bout du jardin le château, ses toits d'ardoise et ses hautes fenêtres.

import * as THREE from "three";
import type { Course, MoverDef } from "../../../../shared/games/minigolf/course.ts";
import { gravelTex, grassTex, hedgeTex, sandTex, stoneTex, woodTex } from "../textures.ts";
import {
  courseBox,
  feltMat,
  flowWater,
  groundDisc,
  leafyBall,
  onCourse,
  plainKit,
  Scatter,
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
  // Le feuillage des grands arbres : la texture du buis, plus grande, teintée arbre par arbre
  const foliage = surfaceMat(hedgeTex(), { color: 0xffffff, roughness: 0.92, scale: 0.18 });
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
    rail: (look) => (look === "pierre" ? { material: stone, extra: 0.02, widen: 0.01 } : { material: hedge, extra: 0.07, widen: 0.022 }),
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
      fog: 0xe9d7b8,
      fogNear: 35,
      fogFar: 150,
      exposure: 1.06,
      grade: { warm: 0.055, sat: 1.12, vignette: 0.3 },
    },
    kit,
    ambience: "jardin",
    tick: (t) => flowWater(water, t),
    decor: (c, rng) => jardinDecor(c, rng, { hedge, hedgeTall, stone, gravel, leaf: foliage, white, beam, canvas, iron, gold }),
  };
  return made;
}

interface Mats {
  hedge: THREE.Material;
  hedgeTall: THREE.Material;
  stone: THREE.Material;
  gravel: THREE.Material;
  leaf: THREE.Material;
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

  // Les haies qui encadrent, avec des ouvertures, et un if en cône à chaque coin
  const hx0 = box.x0 - 1 - pad - 0.4;
  const hx1 = box.x1 + 1 + pad + 0.4;
  const hz0 = box.z0 - 1 - pad - 0.4;
  const hz1 = box.z1 + 1 + pad + 0.4;
  const hedges = new Scatter(new THREE.BoxGeometry(1, 1, 1), m.hedgeTall);
  const cones = new Scatter(new THREE.ConeGeometry(1, 1, 16, 3), m.hedge);
  const balls = new Scatter(leafyBall(1, 0.04, 3), m.hedge);
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const pieces = Math.max(1, Math.round(len / 3.2));
    for (let i = 0; i < pieces; i++) {
      // Une ouverture de temps en temps
      if (pieces > 2 && i === Math.floor(pieces / 2)) continue;
      const a = i / pieces;
      const b = (i + 0.92) / pieces;
      const cx = x0 + (x1 - x0) * ((a + b) / 2);
      const cz = z0 + (z1 - z0) * ((a + b) / 2);
      const l = len * (b - a);
      const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      hedges.add(cx, base + 0.42, cz, horiz ? [l, 0.84, 0.6] : [0.6, 0.84, l]);
      if (i % 2 === 0) balls.add(cx, base + 0.98, cz, 0.24);
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

  // Des ifs en cône et des urnes le long du gravier, des massifs de fleurs dans les coins libres
  const flowers = new Scatter(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshStandardMaterial({ roughness: 0.8 }), false);
  const beds = new Scatter(new THREE.BoxGeometry(1, 1, 1), m.hedge);
  const palette = [0xe8455a, 0xf3a8c0, 0xfbf3e4, 0x9a6ad8, 0xf6c445, 0xe86a2e];
  for (let k = 0; k < 60; k++) {
    const side = Math.floor(rng() * 4);
    const t = rng();
    const x = side < 2 ? box.x0 - 1 + t * (box.x1 - box.x0 + 2) : side === 2 ? hx0 + 0.9 + rng() * 0.6 : hx1 - 0.9 - rng() * 0.6;
    const z = side >= 2 ? box.z0 - 1 + t * (box.z1 - box.z0 + 2) : side === 0 ? hz0 + 0.9 + rng() * 0.6 : hz1 - 0.9 - rng() * 0.6;
    if (onCourse(c, x, z, 0.7)) continue;
    if (k % 5 === 0) cones.add(x, base + 0.5, z, [0.22, 1.0, 0.22]);
    else {
      // Un petit massif bordé de buis, plein de fleurs
      const w = 0.7 + rng() * 0.5;
      beds.add(x, base + 0.07, z, [w, 0.14, w]);
      const col = palette[Math.floor(rng() * palette.length)]!;
      for (let f = 0; f < 34; f++) {
        const fx = x + (rng() - 0.5) * w * 0.86;
        const fz = z + (rng() - 0.5) * w * 0.86;
        const tint = new THREE.Color(col).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.14);
        flowers.add(fx, base + 0.16 + rng() * 0.05, fz, [0.022 + rng() * 0.01, 0.014, 0.022 + rng() * 0.01], rng() * 6, tint);
      }
    }
  }

  // Les grands tilleuls, en rangées au-delà des haies
  const trunks = new Scatter(new THREE.CylinderGeometry(0.12, 0.2, 1, 8), m.beam);
  const crowns = new Scatter(leafyBall(2, 0.16, 11), m.leaf);
  const tint = () => new THREE.Color(0x3d7a34).offsetHSL((rng() - 0.5) * 0.04, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.08);
  for (let k = 0; k < 46; k++) {
    const a = rng() * Math.PI * 2;
    const r = 6 + rng() * 22;
    const x = box.cx + Math.cos(a) * (r + (box.x1 - box.x0) / 2);
    const z = box.cz + Math.sin(a) * (r + (box.z1 - box.z0) / 2);
    if (x > hx0 - 1.5 && x < hx1 + 1.5 && z > hz0 - 1.5 && z < hz1 + 1.5) continue;
    const h = 3.2 + rng() * 2.2;
    trunks.add(x, base + h / 2, z, [1, h, 1]);
    const s = 1.4 + rng() * 1.1;
    const tone = tint();
    // Un houppier en plusieurs boules
    crowns.add(x, base + h + s * 0.5, z, [s, s * 1.05, s], rng() * 6, tone);
    for (let k2 = 0; k2 < 3; k2++) {
      const a2 = rng() * Math.PI * 2;
      const s2 = s * (0.55 + rng() * 0.25);
      crowns.add(
        x + Math.cos(a2) * s * 0.6,
        base + h + s * (0.2 + rng() * 0.6),
        z + Math.sin(a2) * s * 0.6,
        s2,
        rng() * 6,
        tone.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.06),
      );
    }
  }

  for (const sc of [hedges, cones, balls, flowers, beds, trunks, crowns]) {
    const mesh = sc.build();
    if (mesh) g.add(mesh);
  }

  // Le château, au bout du jardin, derrière le trou
  const cup = c.cups[0]!;
  const dx = cup.x - c.tee.x;
  const dz = cup.z - c.tee.z;
  const l = Math.hypot(dx, dz) || 1;
  const chateau = chateauModel(m);
  chateau.position.set(cup.x + (dx / l) * 42, base, cup.z + (dz / l) * 42);
  chateau.rotation.y = Math.atan2(dx, dz) + Math.PI;
  g.add(chateau);

  // Ce que le trou demande en particulier : le moulin, les jets de la fontaine
  for (const d of c.def.decos) {
    if (d.k === "moulin") g.add(windmillHouse(d.at[0], d.at[1], c, m));
    if (d.k === "jets") g.add(fountainJets(d.at[0], d.at[1], d.s ?? 1.3));
  }
  return g;
}

/** Le château : un grand corps de logis, deux pavillons, des toits d'ardoise à la Mansart, de hautes fenêtres */
function chateauModel(m: Mats): THREE.Group {
  const g = new THREE.Group();
  const facade = (() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const x = c.getContext("2d")!;
    x.fillStyle = "#efe5cf";
    x.fillRect(0, 0, 512, 256);
    x.fillStyle = "#d9ccb0";
    for (let y = 0; y < 256; y += 16) x.fillRect(0, y, 512, 1);
    for (let i = 0; i < 9; i++) {
      for (const [y, hgt] of [
        [40, 86],
        [160, 70],
      ] as const) {
        const wx = 18 + i * 55;
        x.fillStyle = "#fbf8f0";
        x.fillRect(wx - 3, y - 3, 30, hgt + 6);
        const grd = x.createLinearGradient(0, y, 0, y + hgt);
        grd.addColorStop(0, "#5a7a96");
        grd.addColorStop(1, "#2c3d52");
        x.fillStyle = grd;
        x.fillRect(wx, y, 24, hgt);
        x.fillStyle = "#fbf8f0";
        x.fillRect(wx + 11, y, 2, hgt);
        for (let r = 1; r < 4; r++) x.fillRect(wx, y + (hgt * r) / 4, 24, 2);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const wallMat = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85 });
  const plain = new THREE.MeshStandardMaterial({ color: 0xece2cb, roughness: 0.9 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x4a5566, roughness: 0.55, metalness: 0.2 });
  const body = (w: number, h: number, d: number, x: number, z: number) => {
    const mats = [plain, plain, plain, plain, wallMat, plain];
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    b.position.set(x, h / 2, z);
    g.add(b);
    // Le toit à la Mansart : un brisis raide puis un terrasson
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1, 1, 4, 1), slate);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((w * 1.02) / Math.SQRT2, h * 0.32, (d * 1.02) / Math.SQRT2);
    roof.position.set(x, h + h * 0.16, z);
    g.add(roof);
    for (const cx of [-w * 0.3, w * 0.3]) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.6), plain);
      ch.position.set(x + cx, h + h * 0.32 + 0.6, z);
      g.add(ch);
    }
  };
  body(34, 12, 11, 0, 0);
  body(11, 14, 13, 0, 1.5);
  body(9, 11, 18, -21, 4);
  body(9, 11, 18, 21, 4);
  // Le perron et l'escalier
  const steps = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 3), m.stone);
  steps.position.set(0, 0.4, 9);
  g.add(steps);
  g.scale.setScalar(0.95);
  return g;
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
