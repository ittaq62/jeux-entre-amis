// Le Bord de mer : le soleil se couche sur la mer, le ciel passe du bleu nuit au pêche, les nuages sont roses. Des
// pistes de gazon bordées de planches blanchies, la promenade et la jetée en bois, la plage tout autour, la mer qui
// ondule jusqu'à l'horizon avec ses bateaux, les cabines rayées, les parasols, les châteaux de sable, le phare blanc
// et rouge, les rochers, les dunes et leurs pins.

import * as THREE from "three";
import type { Course, MoverDef } from "../../../../shared/games/minigolf/course.ts";
import { grassTex, paintTex, sandTex, stoneTex, woodTex } from "../textures.ts";
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

const FELT = 0x6cbb66;

let made: Theme | null = null;

/** Des rayures verticales (cabines, parasols, phare) */
function stripes(a: string, b: string, n: number, vertical = true): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    if (vertical) g.fillRect((i * 256) / n, 0, 256 / n + 1, 256);
    else g.fillRect(0, (i * 256) / n, 256, 256 / n + 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Un rocher : une boule cabossée, aplatie */
function rockGeo(seed: number): THREE.BufferGeometry {
  const g = leafyBall(1, 0.32, seed);
  g.scale(1, 0.72, 1);
  g.computeVertexNormals();
  return g;
}

export function merTheme(): Theme {
  if (made) return made;
  const felt = feltMat(FELT, 0.45, 0.07);
  const deck = surfaceMat(woodTex(), { color: 0xf0e6da, roughness: 0.78 });
  const pier = surfaceMat(woodTex(), { color: 0xc9b7a2, roughness: 0.82 });
  const painted = surfaceMat(paintTex(), { color: 0xffffff, roughness: 0.55 });
  const darkWood = surfaceMat(woodTex(), { color: 0x9a8574, roughness: 0.85, side: THREE.DoubleSide });
  const sand = surfaceMat(sandTex(), { color: 0xffffff, roughness: 1 });
  const wetSand = surfaceMat(sandTex(), { color: 0xc9b089, roughness: 0.9 });
  const castleSand = surfaceMat(sandTex(), { color: 0xf0d6a0, roughness: 1, scale: 0.6 });
  const sea = waterMat(0x1d6c86, 0.9);
  const pool = waterMat(0x2a8ea0, 0.82);
  const stone = surfaceMat(stoneTex(), { color: 0xbfb3a3, roughness: 0.9 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd9352e, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.5 });
  const hutTex = stripes("#f4f1ea", "#2f6fb5", 8);
  const hutMat = new THREE.MeshStandardMaterial({ map: hutTex, roughness: 0.7 });
  const foam = new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.3, transparent: true, opacity: 0.92 });
  const waveMat = new THREE.MeshStandardMaterial({ color: 0x3aa6c4, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.85 });

  const post = (look: string | undefined, r: number, h: number): THREE.Object3D => {
    const g = new THREE.Group();
    if (look === "ballon") {
      // Un ballon de plage à quartiers colorés
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 128;
      const x = c.getContext("2d")!;
      const cols = ["#e8423b", "#ffffff", "#f5c537", "#ffffff", "#2f7fd6", "#ffffff"];
      cols.forEach((col, i) => {
        x.fillStyle = col;
        x.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 128);
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
      ball.position.y = r;
      g.add(ball);
    } else if (look === "bitte") {
      // Une bitte d'amarrage en fonte, son chapeau, et un bout de cordage
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 16), iron);
      body.position.y = h / 2;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.45, r * 1.2, 0.05, 16), iron);
      cap.position.y = h + 0.02;
      const rope = new THREE.Mesh(
        new THREE.TorusGeometry(r * 1.2, 0.012, 6, 20),
        new THREE.MeshStandardMaterial({ color: 0xc9a56a, roughness: 1 }),
      );
      rope.rotation.x = Math.PI / 2;
      rope.position.y = h * 0.55;
      g.add(body, cap, rope);
    } else if (look === "rocher") {
      const m = new THREE.Mesh(rockGeo(Math.round(r * 100)), rock);
      m.scale.set(r * 1.05, Math.max(h, r) * 0.9, r * 1.05);
      m.position.y = Math.max(h, r) * 0.25;
      g.add(m);
    } else if (look === "bouee") {
      // Une bouée rouge et blanche sur un piquet
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), iron);
      pole.position.y = 0.15;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.78, r * 0.3, 12, 24),
        new THREE.MeshStandardMaterial({ map: stripes("#e23b33", "#ffffff", 8), roughness: 0.4 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.11;
      g.add(pole, ring);
    } else {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), stone);
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
    const g = new THREE.Group();
    if (def.look === "vague") {
      // La vague : une crête d'eau qui s'enroule, frangée d'écume
      for (const p of def.parts) {
        if (p.k !== "wall") continue;
        const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
        const shape = new THREE.Shape();
        shape.moveTo(-0.34, 0);
        shape.quadraticCurveTo(-0.05, 0.05, 0.02, 0.38);
        shape.quadraticCurveTo(0.1, 0.42, 0.14, 0.32);
        shape.lineTo(0.12, 0);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
        geo.translate(0, 0, -len / 2);
        geo.rotateY(Math.PI / 2);
        const body = new THREE.Mesh(geo, waveMat);
        const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 10), foam);
        crest.rotation.z = Math.PI / 2;
        crest.position.set(0, 0.36, 0.06);
        const holder = new THREE.Group();
        holder.add(body, crest);
        holder.position.set((p.a[0] + p.b[0]) / 2, p.y1 - 0.36, (p.a[1] + p.b[1]) / 2);
        // La crête regarde vers le départ (z croissants)
        holder.rotation.y = Math.PI;
        g.add(holder);
      }
      return g;
    }
    if (def.look === "parasol") {
      for (const p of def.parts) {
        if (p.k === "post") {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), white);
          pole.position.set(p.c[0], 0.8, p.c[1]);
          const canopy = new THREE.Mesh(
            new THREE.ConeGeometry(0.95, 0.32, 16, 1, true),
            new THREE.MeshStandardMaterial({ map: stripes("#e9483f", "#fbf3e2", 16), side: THREE.DoubleSide, roughness: 0.7 }),
          );
          canopy.position.set(p.c[0], 1.55, p.c[1]);
          g.add(pole, canopy);
        } else if (p.k === "wall") {
          const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
          const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.06), painted);
          bar.position.set((p.a[0] + p.b[0]) / 2, 0.06, (p.a[1] + p.b[1]) / 2);
          g.add(bar);
        }
      }
      g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      return g;
    }
    if (def.look === "crabe") {
      // Un crabe rouge : la carapace, deux pinces, six pattes, deux yeux sur leurs tiges
      for (const p of def.parts) {
        if (p.k !== "post") continue;
        const crab = new THREE.Group();
        const shell = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 20, 12),
          new THREE.MeshStandardMaterial({ color: 0xd8432c, roughness: 0.45 }),
        );
        shell.scale.set(1, 0.45, 0.8);
        shell.position.y = 0.09;
        crab.add(shell);
        const clawMat = new THREE.MeshStandardMaterial({ color: 0xe75a37, roughness: 0.45 });
        for (const s of [-1, 1]) {
          const claw = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), clawMat);
          claw.scale.set(1.3, 0.7, 1);
          claw.position.set(s * 0.19, 0.1, 0.12);
          crab.add(claw);
          for (let k = 0; k < 3; k++) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.16, 5), clawMat);
            leg.position.set(s * 0.18, 0.05, -0.06 + k * 0.06);
            leg.rotation.z = s * 1.1;
            crab.add(leg);
          }
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
          eye.position.set(s * 0.05, 0.19, 0.1);
          crab.add(eye);
        }
        crab.position.set(p.c[0], 0, p.c[1]);
        g.add(crab);
      }
      g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
      return g;
    }
    return null;
  };

  const kit = plainKit({
    felt,
    ground: (mat, look) => {
      if (mat === "wood") return look === "jetee" ? pier : deck;
      if (mat === "sand") return sand;
      if (mat === "stone") return stone;
      return null;
    },
    side: darkWood,
    rail: (look) => (look === "pierre" ? { material: stone, extra: 0.02, widen: 0.01 } : { material: painted, extra: 0.03, widen: 0.012 }),
    wall: (look) => (look === "cabine" ? hutMat : look === "chateau" ? castleSand : painted),
    post,
    mover,
    water: (look) => (look === "flaque" ? pool : sea),
    flag: 0x2f6fb5,
  });

  const seaFar = waterMat(0x1a5f7a, 1);
  made = {
    sky: {
      top: 0x3b4a92,
      horizon: 0xffb27e,
      bottom: 0xe7a37a,
      sun: [0.5, 0.2, -0.84],
      sunColor: 0xffc58a,
      sunIntensity: 3.1,
      hemiSky: 0xc9b6ff,
      hemiGround: 0xe0b48a,
      hemiIntensity: 1.0,
      clouds: 0.5,
      cloudColor: 0xffc6b4,
      ridges: { kind: "iles", height: 0.04, far: 0xd8a08c, near: 0x96707a, seed: 5.3 },
      fog: 0xf0b592,
      fogNear: 30,
      fogFar: 160,
      exposure: 1.08,
      grade: { warm: 0.07, sat: 1.14, vignette: 0.3 },
    },
    kit,
    ambience: "mer",
    tick: (t, decor) => {
      flowWater(sea, t);
      flowWater(pool, t);
      flowWater(seaFar, t * 0.6);
      if (decor) merLife(decor, t);
    },
    decor: (c, rng) => merDecor(c, rng, { sand, wetSand, seaFar, foam, rock, hutMat, white, red, iron, darkWood, castleSand }),
  };
  return made;
}

interface Mats {
  sand: THREE.Material;
  wetSand: THREE.Material;
  seaFar: THREE.Material;
  foam: THREE.Material;
  rock: THREE.Material;
  hutMat: THREE.Material;
  white: THREE.Material;
  red: THREE.Material;
  iron: THREE.Material;
  darkWood: THREE.Material;
  castleSand: THREE.Material;
}

let grass: THREE.Material | null = null;
let pine: THREE.Material | null = null;

function merDecor(c: Course, rng: () => number, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const box = courseBox(c);
  const base = c.outY;
  g.add(groundDisc(m.sand, base - 0.002, 180));
  grass ??= surfaceMat(grassTex(), { color: 0xc9c08a, roughness: 1 });
  pine ??= new THREE.MeshStandardMaterial({ color: 0x3c5a3a, roughness: 0.9, flatShading: true });

  // La mer, au-delà du trou : le rivage perpendiculaire à l'axe du départ au trou, le sable mouillé, l'écume
  const cup = c.cups[0]!;
  const ax = cup.x - c.tee.x;
  const az = cup.z - c.tee.z;
  const al = Math.hypot(ax, az) || 1;
  const dx = ax / al;
  const dz = az / al;
  const span = Math.max(box.x1 - box.x0, box.z1 - box.z0);
  const shoreDist = span / 2 + 5;
  const shore = new THREE.Vector3(box.cx + dx * shoreDist, base, box.cz + dz * shoreDist);
  const angle = Math.atan2(dx, dz);
  const seaPlane = new THREE.Mesh(new THREE.PlaneGeometry(420, 220), m.seaFar);
  {
    const uv = seaPlane.geometry.attributes.uv as THREE.BufferAttribute;
    const pos = seaPlane.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
  }
  seaPlane.rotation.x = -Math.PI / 2;
  const seaHolder = new THREE.Group();
  seaHolder.add(seaPlane);
  seaPlane.position.set(0, 0, 110);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(420, 3.2), m.wetSand);
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(0, -0.0005, -1.4);
  const foamLine = new THREE.Mesh(new THREE.PlaneGeometry(420, 0.35), m.foam);
  foamLine.rotation.x = -Math.PI / 2;
  foamLine.position.set(0, 0.012, 0.1);
  foamLine.name = "foam";
  seaHolder.add(wet, foamLine);
  seaHolder.position.set(shore.x, base + 0.01, shore.z);
  seaHolder.rotation.y = angle;
  g.add(seaHolder);

  // Des bateaux au loin, voiles blanches
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x7a3b2a, roughness: 0.6 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xfaf3e4, roughness: 0.8, side: THREE.DoubleSide });
  for (let k = 0; k < 5; k++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.6), hullMat);
    hull.position.y = 0.2;
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 3, 1, true), sailMat);
    sail.scale.set(1, 1, 0.08);
    sail.position.y = 1.6;
    boat.add(hull, sail);
    const along = (rng() - 0.5) * 120;
    const out = 25 + rng() * 60;
    boat.position.set(shore.x + dx * out + -dz * along, base, shore.z + dz * out + dx * along);
    boat.rotation.y = rng() * 6;
    boat.scale.setScalar(1 + rng() * 0.8);
    g.add(boat);
  }

  // Le phare, sur la pointe rocheuse à droite du rivage (celui du trou du phare est au centre de son allée)
  const lighthouseAt = (x: number, z: number, s: number) => {
    const L = new THREE.Group();
    const bands = new THREE.MeshStandardMaterial({ map: stripes("#f4f1ea", "#d33a32", 6, false), roughness: 0.55 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 6, 24), bands);
    tower.position.y = 3;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.15, 24), m.iron);
    gallery.position.y = 6.05;
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.7, 16),
      new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffd36a, emissiveIntensity: 2.2, roughness: 0.2 }),
    );
    lantern.position.y = 6.5;
    const dome = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 16), m.red);
    dome.position.y = 7.1;
    L.add(tower, gallery, lantern, dome);
    L.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
    L.position.set(x, base, z);
    L.scale.setScalar(s);
    return L;
  };
  const pointX = shore.x + -dz * 26 + dx * 6;
  const pointZ = shore.z + dx * 26 + dz * 6;
  g.add(lighthouseAt(pointX, pointZ, 1.4));
  const rocks = new Scatter(rockGeo(5), m.rock);
  for (let k = 0; k < 26; k++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 6;
    rocks.add(pointX + Math.cos(a) * r, base - 0.2, pointZ + Math.sin(a) * r, [1 + rng() * 2, 0.8 + rng() * 1.5, 1 + rng() * 2], rng() * 6);
  }

  // Les cabines de plage, en rang le long du rivage, et des parasols plantés dans le sable
  const huts = new THREE.Group();
  const hutStripes = ["#2f6fb5", "#d9352e", "#2f9a6a", "#e8a53a"].map(
    (col) => new THREE.MeshStandardMaterial({ map: stripes("#f4f1ea", col, 8), roughness: 0.7 }),
  );
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
  const hut = (x: number, z: number, rot: number, k: number) => {
    const h = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 1.1), hutStripes[k % hutStripes.length]);
    body.position.y = 0.75;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.55, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 1.78;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.95), m.darkWood);
    door.position.set(0, 0.55, 0.552);
    h.add(body, roof, door);
    h.traverse((o) => o instanceof THREE.Mesh && ((o.castShadow = true), (o.receiveShadow = true)));
    h.position.set(x, base, z);
    h.rotation.y = rot;
    huts.add(h);
  };
  // (en deux rangs, de part et d'autre de l'axe du trou : au milieu, on voit la mer et l'horizon)
  for (let k = -9; k <= 9; k++) {
    if (Math.abs(k) < 4) continue;
    const along = k * 1.7 + Math.sign(k) * 1.5;
    const back = 3.2 + Math.abs(k) * 0.25;
    const x = shore.x - dx * back + -dz * along;
    const z = shore.z - dz * back + dx * along;
    if (onCourse(c, x, z, 1.2)) continue;
    hut(x, z, angle + Math.PI - Math.sign(k) * 0.12, k + 9);
  }
  g.add(huts);
  const umbrellaMats = ["#e9483f", "#2f7fd6", "#f5c537"].map(
    (col) => new THREE.MeshStandardMaterial({ map: stripes("#fbf3e2", col, 16), side: THREE.DoubleSide, roughness: 0.7 }),
  );
  for (let k = 0; k < 14; k++) {
    // (pas dans l'axe du trou, pour ne pas cacher la mer)
    const side = k % 2 ? 1 : -1;
    const along = side * (5 + rng() * 16);
    const back = 0.5 + rng() * 2;
    const x = shore.x - dx * back + -dz * along;
    const z = shore.z - dz * back + dx * along;
    if (onCourse(c, x, z, 1.5)) continue;
    const u = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6), m.white);
    pole.position.y = 0.9;
    const top = new THREE.Mesh(new THREE.ConeGeometry(1, 0.35, 16, 1, true), umbrellaMats[k % umbrellaMats.length]);
    top.position.y = 1.75;
    u.add(pole, top);
    // Une serviette dessous
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), umbrellaMats[(k + 1) % umbrellaMats.length]);
    towel.rotation.x = -Math.PI / 2;
    towel.position.set(0.4, 0.01, 0.2);
    u.add(towel);
    u.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
    u.position.set(x, base, z);
    u.rotation.y = rng() * 6;
    u.rotation.z = (rng() - 0.5) * 0.15;
    g.add(u);
  }

  // Derrière le départ : les dunes, leurs oyats et quelques pins maritimes
  const dunes = new Scatter(leafyBall(1, 0.1, 9), m.sand, false);
  const tufts = new Scatter(new THREE.ConeGeometry(0.12, 0.45, 5, 1, true), grass, false);
  const trunks = new Scatter(new THREE.CylinderGeometry(0.1, 0.16, 1, 6), m.darkWood);
  const crowns = new Scatter(leafyBall(1, 0.2, 13), pine);
  for (let k = 0; k < 40; k++) {
    const along = (rng() - 0.5) * 70;
    const back = span / 2 + 4 + rng() * 22;
    const x = box.cx - dx * back + -dz * along;
    const z = box.cz - dz * back + dx * along;
    if (onCourse(c, x, z, 2.5)) continue;
    const s = 2 + rng() * 4;
    dunes.add(x, base - s * 0.55, z, [s * 1.6, s, s * 1.3], rng() * 6);
    for (let t = 0; t < 7; t++) {
      const tx = x + (rng() - 0.5) * s * 1.6;
      const tz = z + (rng() - 0.5) * s * 1.2;
      tufts.add(tx, base + s * 0.35 + rng() * 0.1, tz, 1 + rng(), rng() * 6, undefined, (rng() - 0.5) * 0.4);
    }
    if (k % 3 === 0) {
      const h = 3 + rng() * 2.5;
      trunks.add(x, base + h / 2, z, [1, h, 1], 0, undefined, (rng() - 0.5) * 0.25);
      crowns.add(x, base + h + 0.4, z, [1.8 + rng(), 0.8, 1.6 + rng()], rng() * 6);
    }
  }
  for (const sc of [rocks, dunes, tufts, trunks, crowns]) {
    const mesh = sc.build();
    if (mesh) g.add(mesh);
  }

  // Les mouettes qui tournent au-dessus de la plage
  const gullMat = new THREE.MeshStandardMaterial({ color: 0xfbfbf8, roughness: 0.6, side: THREE.DoubleSide });
  const gulls = new THREE.Group();
  gulls.name = "mouettes";
  for (let k = 0; k < 6; k++) {
    const gull = new THREE.Group();
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.1), gullMat);
      wing.position.x = s * 0.2;
      wing.rotation.z = s * 0.25;
      gull.add(wing);
    }
    gull.userData = { r: 6 + rng() * 10, h: 5 + rng() * 4, w: 0.15 + rng() * 0.2, a: rng() * 6 };
    gulls.add(gull);
  }
  gulls.position.set(shore.x - dx * 4, base, shore.z - dz * 4);
  g.add(gulls);

  // Ce que le trou demande : le château de sable crénelé, le phare au milieu de son allée, les toits des cabines
  for (const d of c.def.decos) {
    if (d.k === "phare") g.add(lighthouseAt(d.at[0], d.at[1], 0.62));
    if (d.k === "chateau-sable") g.add(sandCastle(d.at[0], d.at[1], c, m));
  }
  for (const w of c.def.walls) {
    if (!w.closed || w.look !== "cabine") continue;
    const xs = w.pts.map((p) => p[0]);
    const zs = w.pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 }));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(
      ((Math.max(...xs) - Math.min(...xs)) / 2) * Math.SQRT2 + 0.1,
      1,
      ((Math.max(...zs) - Math.min(...zs)) / 2) * Math.SQRT2 + 0.1,
    );
    roof.position.set(cx, c.tee.y - 0.055 + w.h + 0.25, cz);
    roof.castShadow = true;
    g.add(roof);
  }
  return g;
}

/** Les tours et les créneaux du château de sable, posés sur ses deux blocs */
function sandCastle(x: number, z: number, c: Course, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const y = c.tee.y - 0.055 + 0.42;
  for (const [tx, tz] of [
    [-0.85, -0.65],
    [-0.85, 0.65],
    [0.85, -0.65],
    [0.85, 0.65],
  ] as const) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 14), m.castleSand);
    tower.position.set(x + tx, y + 0.2, z + tz);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 14), m.castleSand);
    cone.position.set(x + tx, y + 0.55, z + tz);
    g.add(tower, cone);
  }
  // Un drapeau sur la porte
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), m.white);
  pole.position.set(x, y + 0.25, z);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xd9352e, side: THREE.DoubleSide }),
  );
  flag.position.set(x + 0.09, y + 0.44, z);
  g.add(pole, flag);
  // Les créneaux le long des murs
  for (let k = -4; k <= 4; k++) {
    if (Math.abs(k) < 1) continue;
    for (const s of [-1, 1]) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.09), m.castleSand);
      merlon.position.set(x + k * 0.21, y + 0.04, z + s * 0.78);
      g.add(merlon);
    }
  }
  g.traverse((o) => o instanceof THREE.Mesh && ((o.castShadow = true), (o.receiveShadow = true)));
  return g;
}

/** Les mouettes tournent (appelé à chaque image par le thème) */
export function merLife(root: THREE.Object3D, t: number) {
  const gulls = root.getObjectByName("mouettes");
  if (!gulls) return;
  for (const gull of gulls.children) {
    const d = gull.userData as { r: number; h: number; w: number; a: number };
    const a = d.a + t * d.w;
    gull.position.set(Math.cos(a) * d.r, d.h + Math.sin(t * 0.7 + d.a) * 0.6, Math.sin(a) * d.r);
    gull.rotation.y = -a;
    const flap = Math.sin(t * 7 + d.a * 3) * 0.35;
    gull.children[0]!.rotation.z = -0.25 - flap;
    gull.children[1]!.rotation.z = 0.25 + flap;
  }
}
