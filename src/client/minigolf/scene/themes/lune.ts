// La Base lunaire : la nuit noire et ses étoiles, la Terre bleue au-dessus de l'horizon, le soleil rasant qui allonge
// des ombres dures. Des passerelles de métal, le régolithe gris, la parabole blanche, les portes du sas ; autour, les
// cratères, les rochers, les dômes et les modules de la base, leurs hublots allumés, les panneaux solaires, les antennes
// et leurs feux qui clignotent, un rover garé, le module d'arrivée, la fusée sur son pas de tir, les montagnes au loin.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { heightAt, type Course, type MoverDef } from "../../../../shared/games/minigolf/course.ts";
import { surface, type SurfaceTex } from "../textures.ts";
import { boxMeters, canvasTex, leafyBall, onCourse, planeMeters, plainKit, Scatter, shadows, surfaceMat, type Theme } from "./common.ts";

let made: Theme | null = null;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Le régolithe : une poussière grise, fine, semée de petits cratères et de cailloux */
function regolithTex(): SurfaceTex {
  return surface("lune-regolithe", 512, 6, 163, 5, (u, v, n) => {
    const fine = n(u * 160, v * 160, 160, 2);
    const mid = n(u * 12, v * 12, 12, 4);
    // De petits cratères : une cuvette sombre, un rebord clair
    const cells = 7;
    let crater = 0;
    let rim = 0;
    const cx = Math.floor(u * cells);
    const cy = Math.floor(v * cells);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const gx = (((cx + dx) % cells) + cells) % cells;
        const gy = (((cy + dy) % cells) + cells) % cells;
        const ox = n(gx * 9.1, gy * 4.7, 256, 1);
        const oy = n(gx * 3.3, gy * 8.9, 256, 1);
        const rr = 0.12 + n(gx * 2.2, gy * 6.1, 256, 1) * 0.3;
        const d = Math.hypot(u * cells - (cx + dx + ox), v * cells - (cy + dy + oy)) / rr;
        if (d < 1) crater = Math.max(crater, 1 - d * d);
        else if (d < 1.35) rim = Math.max(rim, 1 - Math.abs(d - 1.12) / 0.23);
      }
    const pebble = n(u * 70, v * 70, 70, 1) > 0.78 ? 1 : 0;
    const k = 0.5 + mid * 0.18 + fine * 0.2 - crater * 0.12 + rim * 0.12 + pebble * 0.08;
    const c = 255 * clamp01(k);
    return [c * 0.98, c * 0.97, c * 0.95, 0.5 + fine * 0.2 - crater * 0.35 + rim * 0.2 + pebble * 0.15];
  });
}

/** Le plancher de métal de la base : des plaques perforées et leurs joints */
function grateTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#9aa0a8";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#3a3e44";
    for (let y = 8; y < s; y += 16)
      for (let x = 8; x < s; x += 16) {
        g.beginPath();
        g.arc(x + ((y / 16) % 2) * 8, y, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    g.fillStyle = "rgba(30,34,40,0.8)";
    g.fillRect(0, 0, s, 3);
    g.fillRect(0, 0, 3, s);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(0, 3, s, 1);
    g.fillRect(3, 0, 1, s);
  });
}

/** Des bandes jaunes et noires en biais (le tremplin, les portes) */
function hazardTex(): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = "#f0c020";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#1a1a1e";
    for (let k = -s; k < s * 2; k += 32) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 16, 0);
      g.lineTo(k + 16 - s, s);
      g.lineTo(k - s, s);
      g.closePath();
      g.fill();
    }
  });
}

/** Les grandes dalles du sol de la base */
function slabTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#b4b8bc";
    g.fillRect(0, 0, s, s);
    let seed = 9;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 1500; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "60,64,70" : "230,232,236"},${rnd() * 0.12})`;
      g.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    g.fillStyle = "rgba(40,44,50,0.7)";
    g.fillRect(0, 0, s, 4);
    g.fillRect(0, 0, 4, s);
    g.fillRect(0, s / 2, s, 2);
    g.fillRect(s / 2, 0, 2, s);
  });
}

/** La parabole : des panneaux blancs en rayons et en couronnes (une seule fois, centrée sur l'antenne) */
function dishTex(): THREE.CanvasTexture {
  return canvasTex(512, (g, s) => {
    const c = s / 2;
    g.fillStyle = "#e8ecf0";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(90,100,112,0.55)";
    g.lineWidth = 3;
    for (const r of [0.12, 0.3, 0.5, 0.72, 0.95]) {
      g.beginPath();
      g.arc(c, c, c * r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * c * 0.12, c + Math.sin(a) * c * 0.12);
      g.lineTo(c + Math.cos(a) * c * 0.95, c + Math.sin(a) * c * 0.95);
      g.stroke();
    }
  });
}

/** La Terre : les océans, les continents, les nuages, la calotte blanche */
function earthTex(): THREE.CanvasTexture {
  return canvasTex(512, (g, s) => {
    g.fillStyle = "#1d4f9a";
    g.fillRect(0, 0, s, s);
    let seed = 21;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 26; k++) {
      g.fillStyle = rnd() < 0.6 ? "#3f7a3a" : "#a08a56";
      g.beginPath();
      const x = rnd() * s;
      const y = s * (0.2 + rnd() * 0.6);
      g.ellipse(x, y, 20 + rnd() * 60, 14 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(255,255,255,0.75)";
    for (let k = 0; k < 60; k++) {
      g.beginPath();
      g.ellipse(rnd() * s, rnd() * s, 10 + rnd() * 50, 3 + rnd() * 8, rnd() * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#f4f8ff";
    g.fillRect(0, 0, s, s * 0.06);
    g.fillRect(0, s * 0.94, s, s * 0.06);
  });
}

interface Mats {
  white: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  hazard: THREE.MeshStandardMaterial;
  cyan: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  solar: THREE.MeshStandardMaterial;
}

let dishMap: THREE.Texture | null = null;

export function luneTheme(): Theme {
  if (made) return made;
  const rt = regolithTex();
  const regolith = surfaceMat(rt, { color: 0xd8d6d2, roughness: 1 });
  const ground = surfaceMat(rt, { color: 0xa8a6a2, roughness: 1, scale: 1.6 });
  const gt = grateTex();
  gt.repeat.set(1 / 1.2, 1 / 1.2);
  const grate = new THREE.MeshStandardMaterial({ map: gt, roughness: 0.45, metalness: 0.6 });
  const catwalk = new THREE.MeshStandardMaterial({ map: gt, color: 0x8a8f96, roughness: 0.5, metalness: 0.6 });
  const ht = hazardTex();
  ht.repeat.set(1 / 0.6, 1 / 0.6);
  const hazard = new THREE.MeshStandardMaterial({ map: ht, roughness: 0.5, metalness: 0.2 });
  const st = slabTex();
  st.repeat.set(1 / 2, 1 / 2);
  const slabs = new THREE.MeshStandardMaterial({ map: st, roughness: 0.7 });
  const dm = dishTex();
  // Une seule fois, centrée sur l'antenne : au-delà de son bord, le blanc uni continue (pas de répétition)
  dm.wrapS = dm.wrapT = THREE.ClampToEdgeWrapping;
  dishMap = dm;
  const dish = new THREE.MeshStandardMaterial({ map: dm, roughness: 0.35, metalness: 0.2 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eaee, roughness: 0.4, metalness: 0.15 });
  const panel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.35, metalness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.5, metalness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a83a, roughness: 0.35, metalness: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xffc060, emissiveIntensity: 1.4, roughness: 0.2 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x8e8c88, roughness: 0.95, flatShading: true });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x60f0ff, emissive: 0x30d8ff, emissiveIntensity: 2.2, roughness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 2.5 });
  const solar = new THREE.MeshStandardMaterial({
    map: canvasTex(64, (g, s) => {
      g.fillStyle = "#1a2c5a";
      g.fillRect(0, 0, s, s);
      g.strokeStyle = "#8a96b0";
      g.lineWidth = 1;
      for (let k = 0; k <= s; k += 16) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k, s);
        g.moveTo(0, k);
        g.lineTo(s, k);
        g.stroke();
      }
    }),
    roughness: 0.15,
    metalness: 0.6,
  });
  const crates = new THREE.MeshStandardMaterial({
    map: canvasTex(128, (g, s) => {
      g.fillStyle = "#d8702a";
      g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x, 0, 3, s);
        g.fillStyle = "rgba(255,255,255,0.15)";
        g.fillRect(x + 3, 0, 2, s);
      }
    }),
    roughness: 0.6,
    metalness: 0.3,
  });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const m: Mats = { white, panel, metal, dark, gold, glass, rock, hazard, cyan, red, solar };

  const post = (look: string | undefined, r: number, h: number): THREE.Object3D => {
    const g = new THREE.Group();
    if (look === "rocher") {
      const stone = new THREE.Mesh(leafyBall(1, 0.35, Math.round(r * 100)), rock);
      stone.scale.set(r * 1.1, h * 0.9, r * 1.1);
      stone.position.y = h * 0.4;
      g.add(stone);
    } else {
      const m2 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), panel);
      m2.position.y = h / 2;
      g.add(m2);
    }
    shadows(g);
    return g;
  };

  const mover = (def: MoverDef, c: Course): THREE.Object3D | null => {
    const g = new THREE.Group();
    if (def.look === "trepied" && def.motion.k === "spin") {
      // Le récepteur de la parabole, perché sur trois pieds qui tournent autour du trou
      const [cx, cz] = def.motion.c;
      const top = new THREE.Vector3(cx, heightAt(c, cx, cz) + 1.7, cz);
      for (const p of def.parts) {
        if (p.k !== "post") continue;
        const foot = new THREE.Vector3(p.c[0], heightAt(c, p.c[0], p.c[1]), p.c[1]);
        const len = foot.distanceTo(top);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.5, p.r, len, 10), white);
        leg.position.copy(foot).add(top).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
        const shoe = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.2, p.r * 1.4, 0.12, 14), dark);
        shoe.position.copy(foot).add(new THREE.Vector3(0, 0.06, 0));
        g.add(leg, shoe);
      }
      const receiver = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.4, 16), white);
      receiver.position.copy(top);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 16, 1, true), gold);
      horn.rotation.x = Math.PI;
      horn.position.copy(top).add(new THREE.Vector3(0, -0.3, 0));
      const blink = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), red);
      blink.position.copy(top).add(new THREE.Vector3(0, 0.26, 0));
      g.add(receiver, horn, blink);
      shadows(g);
      return g;
    }
    if (def.look === "porte-sas") {
      // Une porte de sas : un panneau de métal, ses bandes jaunes et noires, un hublot
      for (const p of def.parts) {
        if (p.k !== "wall") continue;
        const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
        const h = p.y1 - p.y0;
        const door = new THREE.Mesh(boxMeters(len, h, p.t * 2), panel);
        door.position.set((p.a[0] + p.b[0]) / 2, p.y0 + h / 2, (p.a[1] + p.b[1]) / 2);
        const stripe = new THREE.Mesh(planeMeters(len, h * 0.25), hazard);
        stripe.position.set(door.position.x, p.y0 + h * 0.14, door.position.z + p.t + 0.002);
        const back = stripe.clone();
        back.position.z = door.position.z - p.t - 0.002;
        back.rotation.y = Math.PI;
        const port = new THREE.Mesh(new THREE.CircleGeometry(h * 0.16, 20), glass);
        port.position.set(door.position.x, p.y0 + h * 0.65, door.position.z + p.t + 0.003);
        g.add(door, stripe, back, port);
      }
      shadows(g);
      return g;
    }
    if (def.look === "radar") {
      // Le radar : un mât, une petite parabole qui tourne, et sa perche au ras du sol
      for (const p of def.parts) {
        if (p.k === "post") {
          const ground = heightAt(c, p.c[0], p.c[1]);
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.6, p.r, p.y1 - ground, 14), white);
          mast.position.set(p.c[0], ground + (p.y1 - ground) / 2, p.c[1]);
          const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 3), white);
          bowl.material = white.clone();
          (bowl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
          bowl.rotation.z = -Math.PI / 2 - 0.5;
          bowl.position.set(p.c[0] + 0.1, p.y1 + 0.2, p.c[1]);
          const blink = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), red);
          blink.position.set(p.c[0], p.y1 + 0.05, p.c[1]);
          g.add(mast, bowl, blink);
        } else if (p.k === "wall") {
          const ground = heightAt(c, (p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2);
          const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
          const boom = new THREE.Mesh(boxMeters(len, p.y1 - ground - 0.02, p.t * 2), hazard);
          boom.position.set((p.a[0] + p.b[0]) / 2, ground + (p.y1 - ground) / 2, (p.a[1] + p.b[1]) / 2);
          boom.rotation.y = -Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);
          g.add(boom);
        }
      }
      shadows(g);
      return g;
    }
    return null;
  };

  const kit = plainKit({
    felt: regolith,
    ground: (mat, look) => {
      if (look === "grille") return grate;
      if (look === "passerelle") return catwalk;
      if (look === "tremplin") return hazard;
      if (look === "parabole") return dish;
      if (look === "pas-de-tir") return pad;
      if (look === "dalle-base") return slabs;
      if (mat === "moon") return regolith;
      if (mat === "metal") return grate;
      return null;
    },
    side: dark,
    rail: () => ({ material: panel, extra: 0.02, widen: 0.01 }),
    wall: (look) => (look === "caisse" ? crates : look === "dome" ? hidden : panel),
    post,
    mover,
    water: () => dark,
    flag: 0xff5030,
  });

  made = {
    sky: {
      top: 0x010208,
      horizon: 0x0a0d18,
      bottom: 0x3a3a3c,
      sun: [0.62, 0.32, 0.25],
      sunColor: 0xfffaf0,
      sunIntensity: 3.4,
      hemiSky: 0x2a3448,
      hemiGround: 0x4a4a4a,
      hemiIntensity: 0.45,
      clouds: 0,
      cloudColor: 0xffffff,
      ridges: { kind: "collines", height: 0.03, far: 0x2e2e33, near: 0x1f1f23, seed: 6.6 },
      fog: 0x05060c,
      fogNear: 140,
      fogFar: 420,
      exposure: 1.0,
      stars: 1,
      grade: { warm: -0.02, sat: 0.95, vignette: 0.45 },
      bloom: 1.3,
    },
    kit,
    ambience: "lune",
    tick: (t, decor) => {
      if (decor) moonLife(decor, t);
    },
    decor: (c, rng) => moonDecor(c, rng, m, ground),
  };
  return made;
}

interface Life {
  blinks: { o: THREE.Mesh; ph: number }[];
  beams: { o: THREE.Object3D; ph: number }[];
  smoke: { o: THREE.Mesh; ph: number; y0: number }[];
}

function moonLife(decor: THREE.Object3D, t: number) {
  const life = decor.userData.life as Life | undefined;
  if (!life) return;
  for (const b of life.blinks) b.o.visible = (t * 0.8 + b.ph) % 1 < 0.18;
  for (const b of life.beams) {
    const k = 0.75 + Math.sin(t * 3 + b.ph) * 0.25;
    b.o.scale.set(1, k, 1);
  }
  for (const s of life.smoke) {
    const ph = (t * 0.15 + s.ph) % 1;
    s.o.position.y = s.y0 + ph * 2.5;
    s.o.scale.setScalar(0.6 + ph * 2.2);
    (s.o.material as THREE.MeshStandardMaterial).opacity = 0.35 * Math.sin(ph * Math.PI);
  }
}

function moonDecor(c: Course, rng: () => number, m: Mats, groundMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const life: Life = { blinks: [], beams: [], smoke: [] };
  g.userData.life = life;
  const above: THREE.Object3D[] = [];
  g.userData.hideAbove = above;
  const b = c.box;
  const base = c.outY;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;

  // Les crevasses : là, le sol s'ouvre
  const cuts: { x0: number; x1: number; z0: number; z1: number }[] = [];
  for (const d of c.def.decos)
    if (d.k === "crevasse") {
      const half = (d.s ?? 3) / 2;
      cuts.push({ x0: -70, x1: 70, z0: d.at[1] - half, z1: d.at[1] + half });
    }
  const inCut = (x: number, z: number, pad: number) =>
    cuts.some((k) => x > k.x0 - pad && x < k.x1 + pad && z > k.z0 - pad && z < k.z1 + pad);

  // Le sol gris jusqu'à l'horizon, percé là où s'ouvre une crevasse
  const R = 260;
  const shape = new THREE.Shape();
  shape.moveTo(cx - R, -(cz - R));
  shape.lineTo(cx + R, -(cz - R));
  shape.lineTo(cx + R, -(cz + R));
  shape.lineTo(cx - R, -(cz + R));
  shape.lineTo(cx - R, -(cz - R));
  for (const k of cuts) {
    const h = new THREE.Path();
    h.moveTo(k.x0, -k.z0);
    h.lineTo(k.x1, -k.z0);
    h.lineTo(k.x1, -k.z1);
    h.lineTo(k.x0, -k.z1);
    h.lineTo(k.x0, -k.z0);
    shape.holes.push(h);
  }
  const groundGeo = new THREE.ShapeGeometry(shape, 4);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  const guv = groundGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < gp.count; i++) guv.setXY(i, gp.getX(i), gp.getZ(i));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = base - 0.002;
  ground.receiveShadow = true;
  g.add(ground);
  // Les parois des crevasses, qui plongent dans le noir
  for (const k of cuts)
    for (const z of [k.z0, k.z1]) {
      const wall = new THREE.Mesh(planeMeters(k.x1 - k.x0, 6), m.rock);
      wall.position.set((k.x0 + k.x1) / 2, base - 3, z);
      wall.rotation.y = z === k.z0 ? 0 : Math.PI;
      g.add(wall);
    }

  // La Terre, au-dessus de l'horizon, derrière le trou ; éclairée de côté par le soleil
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(15, 48, 32),
    new THREE.MeshStandardMaterial({ map: earthTex(), roughness: 0.8, emissive: 0x0a1830, emissiveIntensity: 0.6, fog: false }),
  );
  earth.position.set(cx - 40, base + 25, b.z0 - 210);
  earth.rotation.set(0.4, 1.2, 0.2);
  g.add(earth);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(15.9, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x6ab0ff, transparent: true, opacity: 0.18, side: THREE.BackSide, fog: false }),
  );
  halo.position.copy(earth.position);
  g.add(halo);

  // Les montagnes au loin, tout autour : des massifs arrondis, usés par les météorites
  const hills = new THREE.MeshStandardMaterial({ color: 0x9a9894, roughness: 1 });
  const ridges = new Scatter(leafyBall(2, 0.22, 77), hills, false);
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2 + rng() * 0.12;
    const d = 230 + rng() * 90;
    const h = 10 + rng() * 22;
    ridges.add(cx + Math.cos(a) * d, base - h * 0.15, cz + Math.sin(a) * d, [30 + rng() * 40, h, 24 + rng() * 30], rng() * 6);
  }
  const rm = ridges.build();
  if (rm) g.add(rm);

  // Où l'on peut poser quelque chose : hors des pistes, hors des crevasses, hors du couloir de la caméra
  const teeX = c.tee.x;
  const teeZ = c.tee.z;
  const free = (x: number, z: number, pad: number, tall: boolean) =>
    !onCourse(c, x, z, pad) && !inCut(x, z, pad) && !(tall && Math.abs(x - teeX) < 3.5 + pad && z > teeZ - 1 && z < teeZ + 12);
  const taken: { x: number; z: number; r: number }[] = [];
  const spot = (minD: number, maxD: number, r: number, tall: boolean): [number, number] | null => {
    for (let k = 0; k < 40; k++) {
      const a = rng() * Math.PI * 2;
      const d = minD + rng() * (maxD - minD);
      const x = cx + Math.cos(a) * ((b.x1 - b.x0) / 2 + d);
      const z = cz + Math.sin(a) * ((b.z1 - b.z0) / 2 + d);
      if (!free(x, z, r + 1, tall)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r + 1)) continue;
      taken.push({ x, z, r });
      return [x, z];
    }
    return null;
  };

  // Les cratères : un rebord qui se relève doucement, et l'ombre du creux au milieu
  const rimGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.78, -0.02),
      new THREE.Vector2(0.9, 0.06),
      new THREE.Vector2(1.0, 0.1),
      new THREE.Vector2(1.12, 0.06),
      new THREE.Vector2(1.35, 0.0),
      new THREE.Vector2(1.5, -0.02),
    ],
    48,
  );
  const rims = new Scatter(rimGeo, m.rock, false);
  const hollow = canvasTex(
    128,
    (gg, sz) => {
      const grd = gg.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
      grd.addColorStop(0, "rgba(20,20,22,0.75)");
      grd.addColorStop(0.7, "rgba(40,40,42,0.45)");
      grd.addColorStop(1, "rgba(60,60,62,0)");
      gg.fillStyle = grd;
      gg.fillRect(0, 0, sz, sz);
    },
    true,
  );
  const floors = new Scatter(
    new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: hollow, transparent: true, depthWrite: false, roughness: 1 }),
    false,
  );
  for (let k = 0; k < 14; k++) {
    const r = 0.8 + rng() * 3.5;
    const p = spot(1.5, 40, r, false);
    if (!p) continue;
    rims.add(p[0], base, p[1], [r, r * 0.6, r]);
    floors.add(p[0], base + 0.004, p[1], r * 0.85);
  }
  const rocks = new Scatter(leafyBall(1, 0.35, 41), m.rock);
  for (let k = 0; k < 40; k++) {
    const p = spot(0.5, 30, 0.6, false);
    if (!p) continue;
    const s = 0.12 + rng() * 0.7;
    rocks.add(p[0], base + s * 0.3, p[1], [s, s * 0.7, s * 0.9], rng() * 6);
  }
  for (const s of [rims, floors, rocks]) {
    const mesh = s.build();
    if (mesh) g.add(mesh);
  }

  // Les dômes et les modules de la base, leurs hublots allumés, les tubes qui les relient
  const domeGeo = new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  const ribs = new THREE.TorusGeometry(1.005, 0.012, 6, 64);
  const built: THREE.Vector3[] = [];
  for (let k = 0; k < 5; k++) {
    const r = 2.4 + rng() * 2.6;
    const p = spot(6, 26, r, true);
    if (!p) continue;
    const dome = new THREE.Group();
    const shell = new THREE.Mesh(domeGeo, m.white);
    shell.scale.setScalar(r);
    dome.add(shell);
    for (let j = 1; j < 4; j++) {
      const rib = new THREE.Mesh(ribs, m.panel);
      const y = Math.sin((j / 4) * (Math.PI / 2));
      rib.scale.setScalar(r * Math.cos((j / 4) * (Math.PI / 2)));
      rib.rotation.x = Math.PI / 2;
      rib.position.y = y * r;
      dome.add(rib);
    }
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2;
      const win = new THREE.Mesh(new THREE.CircleGeometry(r * 0.08, 16), m.glass);
      win.position.set(Math.cos(a) * r * 0.93, r * 0.33, Math.sin(a) * r * 0.93);
      win.lookAt(win.position.clone().multiplyScalar(2));
      dome.add(win);
    }
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.05, 0.4, 40), m.panel);
    ring.position.y = 0.2;
    dome.add(ring);
    dome.position.set(p[0], base, p[1]);
    shadows(dome);
    g.add(dome);
    built.push(new THREE.Vector3(p[0], base, p[1]));
  }
  for (let k = 0; k < 4; k++) {
    const p = spot(5, 24, 3.5, true);
    if (!p) continue;
    const mod = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 6, 28), m.white);
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.5;
    mod.add(body);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.panel);
      cap.rotation.z = (-s * Math.PI) / 2;
      cap.position.set(s * 3, 1.5, 0);
      mod.add(cap);
    }
    for (let j = 0; j < 5; j++) {
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), m.glass);
      win.position.set(-2.2 + j * 1.1, 1.7, 1.31);
      mod.add(win);
    }
    for (const x of [-2, 2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 2.2), m.dark);
      leg.position.set(x, 0.3, 0);
      mod.add(leg);
    }
    mod.position.set(p[0], base, p[1]);
    mod.rotation.y = rng() * Math.PI;
    shadows(mod);
    g.add(mod);
    built.push(new THREE.Vector3(p[0], base, p[1]));
  }
  // Des tubes entre les bâtiments voisins
  const tubes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < built.length; i++)
    for (let j = i + 1; j < built.length; j++) {
      const a = built[i]!;
      const e = built[j]!;
      if (a.distanceTo(e) > 16) continue;
      const mid = a.clone().add(e).multiplyScalar(0.5);
      if (onCourse(c, mid.x, mid.z, 2)) continue;
      const tube = new THREE.CylinderGeometry(0.45, 0.45, a.distanceTo(e), 14);
      tube.rotateZ(Math.PI / 2);
      tube.rotateY(-Math.atan2(e.z - a.z, e.x - a.x));
      tube.translate(mid.x, base + 0.6, mid.z);
      tubes.push(tube);
    }
  if (tubes.length) {
    const tm = new THREE.Mesh(mergeGeometries(tubes)!, m.panel);
    tm.castShadow = tm.receiveShadow = true;
    g.add(tm);
  }

  // Les panneaux solaires, alignés et tournés vers le soleil
  const panels = new Scatter(new THREE.BoxGeometry(3, 0.06, 1.6), m.solar);
  const stands = new Scatter(new THREE.CylinderGeometry(0.06, 0.08, 1.2, 8).translate(0, 0.6, 0), m.metal);
  for (let k = 0; k < 3; k++) {
    const p = spot(4, 22, 5, true);
    if (!p) continue;
    for (let j = 0; j < 4; j++) {
      const x = p[0] + (j - 1.5) * 3.4;
      if (!free(x, p[1], 1, true)) continue;
      panels.add(x, base + 1.25, p[1], 1, 0, undefined, -0.5);
      stands.add(x, base, p[1], 1);
    }
  }
  for (const s of [panels, stands]) {
    const mesh = s.build();
    if (mesh) g.add(mesh);
  }

  // Les antennes et leurs feux rouges qui clignotent
  for (let k = 0; k < 4; k++) {
    const p = spot(3, 20, 0.6, true);
    if (!p) continue;
    const h = 5 + rng() * 6;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, h, 8), m.metal);
    mast.position.set(p[0], base + h / 2, p[1]);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m.red);
    light.position.set(p[0], base + h + 0.1, p[1]);
    g.add(mast, light);
    life.blinks.push({ o: light, ph: rng() });
  }

  // Un rover garé
  const rover = new THREE.Group();
  const chassis = new THREE.Mesh(boxMeters(3.2, 0.4, 1.8), m.panel);
  chassis.position.y = 0.9;
  const seat = new THREE.Mesh(boxMeters(1.0, 0.6, 1.4), m.dark);
  seat.position.set(-0.4, 1.4, 0);
  const dishR = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), m.white);
  dishR.position.set(1.1, 2.0, 0);
  dishR.rotation.z = 0.8;
  rover.add(chassis, seat, dishR);
  for (const x of [-1.2, 0, 1.2])
    for (const s of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 18), m.dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.45, s * 1.05);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12), m.gold);
      hub.rotation.x = Math.PI / 2;
      hub.position.copy(wheel.position);
      rover.add(wheel, hub);
    }
  const rp = spot(3, 14, 2.2, true);
  if (rp) {
    rover.position.set(rp[0], base, rp[1]);
    rover.rotation.y = rng() * Math.PI * 2;
    shadows(rover);
    g.add(rover);
  }

  holeDecor(c, g, m, base, life, above);
  return g;
}

function holeDecor(c: Course, g: THREE.Group, m: Mats, base: number, life: Life, above: THREE.Object3D[]) {
  const def = c.def;

  // Les dômes du trou : posés sur leur mur rond
  for (const w of def.walls) {
    if (w.look !== "dome" || !w.closed) continue;
    const wx = w.pts.reduce((s, p) => s + p[0], 0) / w.pts.length;
    const wz = w.pts.reduce((s, p) => s + p[1], 0) / w.pts.length;
    const r = Math.max(...w.pts.map((p) => Math.hypot(p[0] - wx, p[1] - wz))) + (w.t ?? 0.05);
    const y = heightAt(c, wx, wz);
    const dome = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w.h, 40), m.panel);
    wall.position.y = w.h / 2;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.white);
    shell.position.y = w.h;
    dome.add(wall, shell);
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2;
      const win = new THREE.Mesh(new THREE.CircleGeometry(r * 0.12, 16), m.glass);
      win.position.set(Math.cos(a) * (r + 0.005), w.h * 0.55, Math.sin(a) * (r + 0.005));
      win.lookAt(
        win.position
          .clone()
          .multiplyScalar(2)
          .setY(w.h * 0.55),
      );
      dome.add(win);
    }
    dome.position.set(wx, y, wz);
    shadows(dome);
    g.add(dome);
    above.push(shell);
  }

  // Les téléporteurs : un anneau de métal, un disque qui brille, une colonne de lumière
  const beamTex = canvasTex(
    64,
    (gg, s) => {
      const grd = gg.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, "rgba(120,240,255,0)");
      grd.addColorStop(1, "rgba(120,240,255,0.9)");
      gg.fillStyle = grd;
      gg.fillRect(0, 0, s, s);
    },
    true,
  );
  for (const p of def.portals) {
    if (p.look !== "tele") continue;
    for (const [pt, r, entry] of [
      [p.a, p.r, true],
      [p.b, p.r * 0.8, false],
    ] as const) {
      const y = heightAt(c, pt[0], pt[1]);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.035, 8, 32), m.metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(pt[0], y + 0.01, pt[1]);
      g.add(ring);
      if (entry) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.9, r * 0.9, 1.4, 24, 1, true),
          new THREE.MeshBasicMaterial({
            map: beamTex,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        );
        beam.geometry.translate(0, 0.7, 0);
        beam.position.set(pt[0], y, pt[1]);
        g.add(beam);
        life.beams.push({ o: beam, ph: pt[0] * 3 + pt[1] });
      }
    }
  }

  // Le propulseur : une grille ronde qui rougeoie
  for (const p of def.pads) {
    if (p.look !== "propulseur") continue;
    const y = heightAt(c, p.c[0], p.c[1]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.04, 0.03, 8, 32), m.metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.c[0], y + 0.01, p.c[1]);
    g.add(ring);
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(p.r * 1.7 - Math.abs(k) * 0.08, 0.008, 0.025), m.dark);
      bar.position.set(p.c[0], y + 0.008, p.c[1] + k * p.r * 0.32);
      g.add(bar);
    }
  }

  for (const d of def.decos) {
    if (d.k === "module") lander(g, m, base, d.at);
    else if (d.k === "dome") {
      const r = d.s ?? 1.6;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.white);
      shell.position.set(d.at[0], base, d.at[1]);
      const door = new THREE.Mesh(boxMeters(0.9, 1.1, 0.4), m.panel);
      door.position.set(d.at[0], base + 0.55, d.at[1] + r * 0.92);
      const light = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), m.glass);
      light.position.set(d.at[0], base + 0.55, d.at[1] + r * 0.92 + 0.21);
      shadows(shell);
      g.add(shell, door, light);
    } else if (d.k === "fusee") rocket(g, m, base, d.at, life);
    else if (d.k === "antenne") {
      // Le bord de la parabole : un anneau blanc, et ses haubans
      const r = d.s ?? 2.8;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.12, 0.08, 10, 80, Math.PI * 1.75), m.white);
      rim.rotation.x = Math.PI / 2;
      rim.rotation.z = Math.PI * 0.625;
      rim.position.set(d.at[0], heightAt(c, d.at[0], d.at[1] - r) + 0.08, d.at[1]);
      g.add(rim);
      if (dishMap) {
        dishMap.repeat.set(1 / (r * 2), 1 / (r * 2));
        dishMap.center.set(d.at[0], d.at[1]);
        dishMap.offset.set(0.5 - d.at[0], 0.5 - d.at[1]);
      }
    } else if (d.k === "sas") {
      // Le tunnel du sas : ses murs de part et d'autre, ses arceaux et ses hublots
      let l = d.at[0];
      let r = d.at[0];
      while (l > d.at[0] - 8 && onCourse(c, l - 0.05, d.at[1], 0)) l -= 0.05;
      while (r < d.at[0] + 8 && onCourse(c, r + 0.05, d.at[1], 0)) r += 0.05;
      const doors = def.movers.filter((mv) => mv.look === "porte-sas").map((mv) => (mv.parts[0]?.k === "wall" ? mv.parts[0].a[1] : 0));
      const z0 = Math.min(...doors);
      const z1 = Math.max(...doors);
      const tunnel = new THREE.Group();
      for (const x of [l - 0.2, r + 0.2]) {
        const wall = new THREE.Mesh(boxMeters(0.3, 1.4, z1 - z0 + 0.6), m.panel);
        wall.position.set(x, base + 0.7, (z0 + z1) / 2);
        tunnel.add(wall);
        for (let k = 0; k < 3; k++) {
          const win = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), m.glass);
          win.position.set(x + (x < d.at[0] ? 0.16 : -0.16), base + 0.9, z0 + ((k + 1) / 4) * (z1 - z0));
          win.rotation.y = x < d.at[0] ? Math.PI / 2 : -Math.PI / 2;
          tunnel.add(win);
        }
      }
      for (const z of [z0, z1]) {
        const frame = new THREE.Mesh(boxMeters(r - l + 0.7, 0.3, 0.4), m.dark);
        frame.position.set((l + r) / 2, 1.0, z);
        tunnel.add(frame);
        above.push(frame);
        for (const x of [l - 0.2, r + 0.2]) {
          const post = new THREE.Mesh(boxMeters(0.35, 1.15 - base, 0.45), m.dark);
          post.position.set(x, base + (1.15 - base) / 2, z);
          tunnel.add(post);
        }
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), m.red);
        lamp.position.set((l + r) / 2, 1.2, z);
        tunnel.add(lamp);
        life.blinks.push({ o: lamp, ph: z });
      }
      // Une demi-voûte le long de l'allée : la moitié « arrière » du cylindre, couchée, devient le dessus
      const roof = new THREE.Mesh(
        new THREE.CylinderGeometry((r - l) / 2 + 0.35, (r - l) / 2 + 0.35, z1 - z0, 24, 1, true, Math.PI / 2, Math.PI),
        m.white,
      );
      roof.rotation.x = Math.PI / 2;
      roof.position.set((l + r) / 2, 1.15, (z0 + z1) / 2);
      roof.material = (m.white as THREE.MeshStandardMaterial).clone();
      (roof.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      tunnel.add(roof);
      above.push(roof);
      shadows(tunnel);
      g.add(tunnel);
    }
  }
}

/** Le module d'arrivée : quatre pieds, son corps couvert de feuille d'or, son échelle, son antenne */
function lander(g: THREE.Group, m: Mats, base: number, at: readonly [number, number]) {
  const o = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.2, 8), m.gold);
  body.position.y = 1.7;
  const cabin = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 1.0, 8), m.white);
  cabin.position.y = 2.8;
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), m.glass);
  win.position.set(0, 2.85, 0.93);
  win.rotation.x = -0.2;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), m.metal);
  antenna.position.set(0.4, 3.8, 0);
  o.add(body, cabin, win, antenna);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), m.metal);
    leg.position.set(Math.cos(a) * 1.3, 0.85, Math.sin(a) * 1.3);
    leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    const footPad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), m.metal);
    footPad.position.set(Math.cos(a) * 1.75, 0.03, Math.sin(a) * 1.75);
    o.add(leg, footPad);
  }
  for (let k = 0; k < 5; k++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.03), m.metal);
    rung.position.set(0, 0.3 + k * 0.25, 1.4);
    o.add(rung);
  }
  o.position.set(at[0], base, at[1]);
  o.rotation.y = 0.6;
  shadows(o);
  g.add(o);
}

/** La fusée, debout près du pas de tir, et la vapeur qui s'échappe à son pied */
function rocket(g: THREE.Group, m: Mats, base: number, at: readonly [number, number], life: Life) {
  const o = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 28), m.white);
  body.position.y = 3.6;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 28), m.white);
  nose.position.y = 7.4;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.61, 0.61, 0.5, 28), m.hazard);
  band.position.y = 5.6;
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), m.glass);
  win.position.set(0, 6.2, 0.61);
  o.add(body, nose, band, win);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.9), m.dark);
    fin.position.set(Math.cos(a) * 0.75, 1.2, Math.sin(a) * 0.75);
    fin.rotation.y = -a;
    o.add(fin);
  }
  const engine = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 16, 1, true), m.dark);
  engine.position.y = 0.4;
  o.add(engine);
  o.position.set(at[0], base, at[1]);
  shadows(o);
  g.add(o);
  for (let k = 0; k < 5; k++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.3, depthWrite: false, roughness: 1 }),
    );
    puff.position.set(at[0] + (k - 2) * 0.3, base + 0.2, at[1] + (k % 2) * 0.4);
    life.smoke.push({ o: puff, ph: k / 5, y0: base + 0.2 });
    g.add(puff);
  }
}
