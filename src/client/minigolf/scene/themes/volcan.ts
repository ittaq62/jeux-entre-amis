// Le Volcan : un ciel de cendre rougeoyant, la lave qui luit et coule lentement. Des allées de basalte en orgues, des
// ponts de pierre taillée, la cendre grise, l'obsidienne noire et brillante, le sol de fer de la forge. Autour : le
// grand volcan et son panache, des cônes plus petits, des coulées et des cascades de lave au loin, des rochers fendus,
// des arbres calcinés, des éclats d'obsidienne, les braises qui montent, la fumée des fumerolles et des geysers.

import * as THREE from "three";
import { heightAt, type Course, type MoverDef } from "../../../../shared/games/minigolf/course.ts";
import { hash01, makeCells, sandTex, stoneTex, surface, type SurfaceTex } from "../textures.ts";
import { boxMeters, canvasTex, leafyBall, onCourse, plainKit, Scatter, shadows, surfaceMat, type Theme } from "./common.ts";

let made: Theme | null = null;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Le basalte en orgues : le dessus des colonnes, des hexagones sombres et leurs joints */
function basaltTex(): SurfaceTex {
  return surface("volcan-basalte", 512, 2.2, 171, 4, (u, v, n) => {
    // Une grille d'hexagones (en coordonnées axiales), qui se répète sans couture : 8 colonnes, 8 rangées
    const cols = 8;
    const x = u * cols;
    const y = v * cols * 1.1547;
    let best = 9;
    let second = 9;
    let id = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const row = Math.floor(y) + dy;
        const col = Math.floor(x - (row % 2) * 0.5) + dx;
        const cx = col + 0.5 + (row % 2) * 0.5;
        const cy = row + 0.5;
        const d = Math.hypot(x - cx, (y - cy) * 0.866);
        if (d < best) {
          second = best;
          best = d;
          id = ((((col % cols) + cols) % cols) * 13 + (((row % 9) + 9) % 9) * 7) % 97;
        } else if (d < second) second = d;
      }
    const joint = second - best < 0.06;
    const tone = n(id * 3.1, 0.5, 256, 1);
    const grit = n(u * 150, v * 150, 150, 2);
    const k = joint ? 0.35 : 0.62 + tone * 0.2 + grit * 0.18;
    return [92 * k, 88 * k, 86 * k, joint ? 0 : 0.6 + grit * 0.3];
  });
}

/**
 * La roche volcanique du décor : des dalles de lave refroidie, fendues, chacune son ton ; des pores, du grain, et dans
 * quelques fentes une lueur rouge éteinte
 */
function rockTex(): SurfaceTex {
  const P = 12;
  const plates = makeCells(173, P);
  const chips = makeCells(174, 40);
  return surface("volcan-roche3", 512, 5, 173, 4, (u, v, n) => {
    const c = plates(u * P, v * P);
    const crack = clamp01((c.f2 - c.f1) * (6 + hash01(c.id, 5) * 6));
    const tone = hash01(c.id, 11);
    const ember = hash01(c.id, 13) > 0.88 ? Math.pow(1 - crack, 3) : 0;
    const d = chips(u * 40, v * 40);
    const fine = clamp01((d.f2 - d.f1) * 7);
    const grain = n(u * 160, v * 160, 160, 2);
    const swell = n(u * 4, v * 4, 4, 3);
    const k = (0.27 + tone * 0.13 + grain * 0.12 + swell * 0.12) * (0.5 + 0.5 * Math.pow(crack, 0.5)) * (0.82 + 0.18 * fine);
    return [
      clamp01(k + ember * 0.2) * 255 * 0.95,
      clamp01(k + ember * 0.05) * 255 * 0.83,
      clamp01(k) * 255 * 0.78,
      Math.pow(crack, 0.4) * (0.6 + swell * 0.3) + fine * 0.12 + grain * 0.12,
    ];
  });
}

/**
 * Creuse les flancs d'un volcan tourné (LatheGeometry) de ravines qui descendent du sommet, et lui donne des uv à peu
 * près en mètres (`around` : le tour, `up` : le flanc)
 */
function gullies<T extends THREE.BufferGeometry>(g: T, amp: number, around: number, up: number, seed: number): T {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  let y1 = 0;
  for (let i = 0; i < p.count; i++) y1 = Math.max(y1, p.getY(i));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i) / (y1 || 1);
    const a = Math.atan2(z, x);
    const ridge = 0.5 + 0.5 * Math.sin(a * 11 + seed + Math.sin(a * 3 + seed * 2) * 1.8);
    const fine = 0.5 + 0.5 * Math.sin(a * 29 + seed * 3 + Math.sin(a * 7) * 2);
    const k = Math.sin(Math.min(1, y / 0.92) * Math.PI) * amp;
    const s = 1 - k * (0.7 * ridge + 0.3 * fine);
    p.setXYZ(i, x * s, p.getY(i), z * s);
    uv.setXY(i, uv.getX(i) * around, uv.getY(i) * up);
  }
  g.computeVertexNormals();
  return g;
}

/** Un volcan lointain : des flancs qui se creusent en montant, un rebord de cratère ; 1 de haut, 1,6 de rayon au pied */
let farConeGeo: THREE.BufferGeometry | null = null;
function farCone(): THREE.BufferGeometry {
  farConeGeo ??= gullies(
    new THREE.LatheGeometry(
      [
        [1.6, 0],
        [1.2, 0.07],
        [0.82, 0.26],
        [0.5, 0.58],
        [0.28, 0.9],
        [0.22, 1.0],
        [0.15, 0.97],
        [0, 0.9],
      ].map(([r, y]) => new THREE.Vector2(r!, y!)),
      40,
    ),
    0.12,
    50,
    18,
    1.3,
  );
  return farConeGeo;
}

/** La lave : une croûte sombre en plaques, et le feu qui luit entre elles */
function lavaTex(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const draw = (glowOnly: boolean) =>
    canvasTex(256, (g, s) => {
      g.fillStyle = glowOnly ? "#ff7a10" : "#ff8a20";
      g.fillRect(0, 0, s, s);
      let seed = 31;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      // Des plaques de croûte : des polygones sombres, bordés d'un liseré rouge
      for (let k = 0; k < 42; k++) {
        const cx = rnd() * s;
        const cy = rnd() * s;
        const r = 10 + rnd() * 22;
        for (const [ox, oy] of [
          [0, 0],
          [s, 0],
          [-s, 0],
          [0, s],
          [0, -s],
        ] as const) {
          g.beginPath();
          const n = 6 + Math.floor(rnd() * 3);
          for (let j = 0; j < n; j++) {
            const a = (j / n) * Math.PI * 2;
            const rr = r * (0.7 + ((j * 37 + k) % 10) / 30);
            const px = cx + ox + Math.cos(a) * rr;
            const py = cy + oy + Math.sin(a) * rr;
            if (j === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
          g.fillStyle = glowOnly ? "#200400" : "#2a1410";
          g.fill();
          g.strokeStyle = glowOnly ? "#a01800" : "#6a1a08";
          g.lineWidth = 2;
          g.stroke();
        }
      }
      // Les points les plus chauds : des lueurs jaunes, diffuses, entre les plaques
      for (let k = 0; k < 26; k++) {
        const x = rnd() * s;
        const y = rnd() * s;
        const r = 8 + rnd() * 16;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, glowOnly ? "rgba(255,236,140,0.9)" : "rgba(255,224,110,0.8)");
        grd.addColorStop(1, "rgba(255,200,80,0)");
        g.fillStyle = grd;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
  return { map: draw(false), glow: draw(true) };
}

interface Mats {
  rock: THREE.MeshStandardMaterial;
  basalt: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  lava: THREE.MeshStandardMaterial;
  obsidian: THREE.MeshStandardMaterial;
  ember: THREE.MeshStandardMaterial;
  charred: THREE.MeshStandardMaterial;
}

/** La lave du thème : sa texture qui coule, sa lueur qui respire */
let lavaFlow: { mats: THREE.MeshStandardMaterial[]; tex: THREE.Texture[] } | null = null;

export function volcanTheme(): Theme {
  if (made) return made;
  const bt = basaltTex();
  const basalt = surfaceMat(bt, { roughness: 0.85 });
  const bridge = surfaceMat(stoneTex(), { color: 0x6a5a50, roughness: 0.9 });
  const ash = surfaceMat(sandTex(), { color: 0x5a5654, roughness: 1, scale: 0.8 });
  const rt = rockTex();
  const rock = surfaceMat(rt, { roughness: 0.95 });
  const obsidian = new THREE.MeshPhysicalMaterial({
    color: 0x0c0a12,
    roughness: 0.05,
    metalness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    sheen: 0.4,
    sheenColor: new THREE.Color(0x5a3a8a),
  });
  const ironTex = canvasTex(128, (g, s) => {
    g.fillStyle = "#3a3634";
    g.fillRect(0, 0, s, s);
    let seed = 13;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 600; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "20,16,14" : "120,90,70"},${rnd() * 0.25})`;
      g.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    g.fillStyle = "rgba(10,8,6,0.8)";
    g.fillRect(0, 0, s, 3);
    g.fillRect(0, 0, 3, s);
    for (const [x, y] of [
      [10, 10],
      [s - 10, 10],
      [10, s - 10],
      [s - 10, s - 10],
    ] as const) {
      g.fillStyle = "#6a625c";
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
  });
  ironTex.repeat.set(1 / 1.1, 1 / 1.1);
  const iron = new THREE.MeshStandardMaterial({ map: ironTex, roughness: 0.55, metalness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.85 });
  const lt = lavaTex();
  lt.map.repeat.set(1 / 1.6, 1 / 1.6);
  lt.glow.repeat.set(1 / 1.6, 1 / 1.6);
  const lava = new THREE.MeshStandardMaterial({
    map: lt.map,
    emissive: 0xffffff,
    emissiveMap: lt.glow,
    emissiveIntensity: 1.6,
    roughness: 0.7,
  });
  lavaFlow = { mats: [lava], tex: [lt.map, lt.glow] };
  const ember = new THREE.MeshStandardMaterial({ color: 0xff8030, emissive: 0xff5010, emissiveIntensity: 2.5 });
  const charred = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.95 });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const m: Mats = { rock, basalt, iron, wood, lava, obsidian, ember, charred };

  const post = (look: string | undefined, r: number, h: number): THREE.Object3D => {
    const g = new THREE.Group();
    // Une roche de lave fendue, une lueur dans ses fentes
    const stone = new THREE.Mesh(leafyBall(1, 0.3, Math.round(r * 97 + h * 31)), rock);
    stone.scale.set(r * 1.15, h * 0.85, r * 1.1);
    stone.position.y = h * 0.42;
    const crack = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, 0.012, 4, 20, Math.PI * 0.9), ember);
    crack.position.y = h * 0.4;
    crack.rotation.set(Math.PI / 2 + 0.3, 0, r * 5);
    g.add(stone, crack);
    void look;
    shadows(g);
    return g;
  };

  const mover = (def: MoverDef, c: Course): THREE.Object3D | null => {
    const g = new THREE.Group();
    if (def.look === "marteau" && def.motion.k === "swing") {
      // Le marteau-pilon : une tête de fer, son manche de bois cerclé de fer qui monte jusqu'au pivot
      for (const p of def.parts) {
        if (p.k !== "cap") continue;
        const a = new THREE.Vector3(...p.a);
        const b = new THREE.Vector3(...p.b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = Math.min(a.distanceTo(b) + p.r * 1.2, 1.8);
        const head = new THREE.Mesh(boxMeters(len, p.r * 2, p.r * 2), iron);
        head.position.copy(mid);
        const face = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, p.r * 0.3, p.r * 1.7), m.iron);
        face.position.copy(mid).add(new THREE.Vector3(0, -p.r * 0.95, 0));
        const pivotY = def.motion.c[1];
        const shaft = pivotY - mid.y;
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, shaft, 12), wood);
        handle.position.set(mid.x, mid.y + shaft / 2, mid.z);
        g.add(head, face, handle);
        for (const k of [0.25, 0.6]) {
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), iron);
          band.position.set(mid.x, mid.y + shaft * k, mid.z);
          g.add(band);
        }
        // La tête est encore rouge d'avoir frappé
        const hot = new THREE.Mesh(
          new THREE.BoxGeometry(len * 0.92, 0.012, p.r * 1.6),
          new THREE.MeshStandardMaterial({ color: 0x8a2a10, emissive: 0xb02a08, emissiveIntensity: 0.9 }),
        );
        hot.position.copy(face.position).add(new THREE.Vector3(0, -p.r * 0.16, 0));
        g.add(hot);
        void c;
      }
      shadows(g);
      return g;
    }
    return null;
  };

  const kit = plainKit({
    felt: basalt,
    ground: (mat, look) => {
      if (look === "basalte") return basalt;
      if (look === "pont") return bridge;
      if (look === "cendre" || mat === "dirt") return ash;
      if (look === "obsidienne" || mat === "glass") return obsidian;
      if (look === "dalle-forge") return iron;
      if (mat === "lava") return lava;
      if (mat === "stone") return basalt;
      return null;
    },
    side: rock,
    rail: () => ({ material: rock, extra: 0.04, widen: 0.025 }),
    wall: (look) => (look === "enclume" ? hidden : rock),
    post,
    mover,
    water: () => lava,
    flag: 0xffc020,
    // Le tapis de départ : une dalle de basalte, le point de départ et les chapeaux qui rougeoient
    tee: { rim: 0x3a2a24, pad: 0x1e1714, spot: 0xffb060, post: 0x2a201c, cap: 0xffc020, glow: true },
  });

  made = {
    sky: {
      top: 0x150a0a,
      horizon: 0x6a2e1a,
      bottom: 0x1a100c,
      sun: [-0.35, 0.6, -0.55],
      sunColor: 0xffc49a,
      sunIntensity: 2.7,
      hemiSky: 0xa06a58,
      hemiGround: 0x9a4418,
      hemiIntensity: 0.95,
      clouds: 0.65,
      cloudColor: 0x4a3430,
      ridges: { kind: "mont", height: 0.075, far: 0x4a2216, near: 0x24110b, seed: 2.2 },
      fog: 0x2e1610,
      fogNear: 26,
      fogFar: 120,
      exposure: 1.25,
      grade: { warm: 0.03, sat: 1.05, vignette: 0.42 },
      bloom: 0.95,
    },
    kit,
    ambience: "volcan",
    tick: (t, decor) => {
      if (lavaFlow) {
        for (const tex of lavaFlow.tex) tex.offset.set(t * 0.012, t * 0.02);
        for (const mat of lavaFlow.mats) mat.emissiveIntensity = 1.5 + Math.sin(t * 0.9) * 0.18;
      }
      if (decor) volcanoLife(decor, t);
    },
    decor: (c, rng) => volcanoDecor(c, rng, m),
  };
  return made;
}

interface Life {
  embers: { pts: THREE.Points; base: Float32Array; speed: Float32Array } | null;
  smoke: {
    o: THREE.Sprite;
    ph: number;
    y0: number;
    x0: number;
    z0: number;
    rise: number;
    drift: [number, number];
    size: number;
    alpha: number;
    h: number;
  }[];
  plumes: { o: THREE.Object3D; period: number; on: number; a0: number; h: number }[];
  jets: { o: THREE.Object3D; puffs: THREE.Sprite[]; period: number; on: number; dir: number }[];
}

function volcanoLife(decor: THREE.Object3D, t: number) {
  const life = decor.userData.life as Life | undefined;
  if (!life) return;
  if (life.embers) {
    const p = life.embers.pts.geometry.attributes.position as THREE.BufferAttribute;
    const base = life.embers.base;
    const sp = life.embers.speed;
    for (let i = 0; i < p.count; i++) {
      const k = i * 3;
      const rise = (t * sp[i]! + i * 0.37) % 6;
      p.setXYZ(i, base[k]! + Math.sin(t * 0.7 + i) * 0.4, base[k + 1]! + rise, base[k + 2]! + Math.cos(t * 0.6 + i) * 0.4);
    }
    p.needsUpdate = true;
  }
  for (const s of life.smoke) {
    const ph = (t * s.rise + s.ph) % 1;
    s.o.position.set(s.x0 + s.drift[0] * ph, s.y0 + ph * s.h, s.z0 + s.drift[1] * ph);
    const k = s.size * (0.5 + ph * 1.6);
    s.o.scale.set(k, k, 1);
    s.o.material.opacity = s.alpha * Math.sin(ph * Math.PI);
  }
  // Les geysers : le panache ne monte que quand le geyser souffle (même calcul que la physique)
  for (const p of life.plumes) {
    const ph = t / p.period + p.a0;
    const f = ph - Math.floor(ph);
    const on = f <= p.on;
    const k = on ? Math.sin((f / p.on) * Math.PI) : 0;
    p.o.scale.set(0.6 + k * 0.6, 0.05 + k * p.h, 0.6 + k * 0.6);
    p.o.visible = k > 0.02;
  }
  // Les fumerolles : pendant les bouffées, des nuages de vapeur filent en travers depuis l'évent, gonflent et s'effacent
  for (const j of life.jets) {
    const ph = t / j.period;
    const f = ph - Math.floor(ph);
    const k = f <= j.on ? Math.sin((f / j.on) * Math.PI) : 0;
    j.o.visible = k > 0.02;
    if (!j.o.visible) continue;
    j.puffs.forEach((s, i) => {
      const q = (t * 1.6 + i / j.puffs.length) % 1;
      s.position.set(j.dir * (0.1 + q * 4.2), 0.05 + q * 0.55 + Math.sin(i * 2.3) * 0.08, Math.sin(i * 4.1 + t) * 0.18 * q);
      const sz = 0.3 + q * 1.3;
      s.scale.set(sz, sz, 1);
      s.material.opacity = k * Math.min(1, q * 6) * (1 - q) * 0.75;
    });
  }
}

let decoMats: { ground: THREE.Material } | null = null;

function volcanoDecor(c: Course, rng: () => number, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const life: Life = { embers: null, smoke: [], plumes: [], jets: [] };
  g.userData.life = life;
  const above: THREE.Object3D[] = [];
  g.userData.hideAbove = above;
  const b = c.box;
  const base = c.outY;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  if (!decoMats) decoMats = { ground: surfaceMat(rockTex(), { color: 0xb0a8a4, roughness: 1, scale: 1.4 }) };

  // Le sol de roche sombre
  const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 64).rotateX(-Math.PI / 2), decoMats.ground);
  const gp = ground.geometry.attributes.position as THREE.BufferAttribute;
  const guv = ground.geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < gp.count; i++) guv.setXY(i, gp.getX(i), gp.getZ(i));
  ground.position.set(cx, base - 0.002, cz);
  ground.receiveShadow = true;
  g.add(ground);

  const teeX = c.tee.x;
  const teeZ = c.tee.z;
  const free = (x: number, z: number, pad: number, tall: boolean) =>
    !onCourse(c, x, z, pad) && !(tall && Math.abs(x - teeX) < 3.5 + pad && z > teeZ - 1 && z < teeZ + 12);
  const spot = (minD: number, maxD: number, pad: number, tall: boolean): [number, number] | null => {
    for (let k = 0; k < 40; k++) {
      const a = rng() * Math.PI * 2;
      const d = minD + rng() * (maxD - minD);
      const x = cx + Math.cos(a) * ((b.x1 - b.x0) / 2 + d);
      const z = cz + Math.sin(a) * ((b.z1 - b.z0) / 2 + d);
      if (free(x, z, pad, tall)) return [x, z];
    }
    return null;
  };

  // Le grand volcan derrière le trou : son cône, la lueur de son cratère, son panache de fumée
  // Le profil, du pied au sommet ; le cratère se creuse un peu sous le rebord
  const cone = new THREE.LatheGeometry(
    [
      new THREE.Vector2(80, 0),
      new THREE.Vector2(62, 4),
      new THREE.Vector2(40, 16),
      new THREE.Vector2(22, 34),
      new THREE.Vector2(11, 50),
      new THREE.Vector2(9, 52),
      new THREE.Vector2(0, 51),
    ],
    64,
  );
  gullies(cone, 0.09, 260, 70, 0.4);
  const flank = m.rock.clone();
  flank.side = THREE.DoubleSide;
  const volcano = new THREE.Mesh(cone, flank);
  volcano.position.set(cx + 20, base - 1, b.z0 - 120);
  g.add(volcano);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2), m.lava);
  crater.position.set(volcano.position.x, base + 50.6, volcano.position.z);
  g.add(crater);
  // Une coulée qui descend sur le flanc du volcan, vers nous
  const flow = new THREE.Mesh(new THREE.PlaneGeometry(4, 60, 1, 12), m.lava);
  const fp = flow.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i);
    const s = (y + 30) / 60;
    fp.setX(i, fp.getX(i) * (0.6 + (1 - s) * 1.6) + Math.sin(s * 7) * 2);
  }
  flow.geometry.computeVertexNormals();
  flow.position.set(volcano.position.x - 6, base + 25, volcano.position.z + 38);
  flow.rotation.x = -0.95;
  g.add(flow);
  for (let k = 0; k < 12; k++) {
    const p = puff(0x4a3c38);
    p.material.fog = false;
    life.smoke.push({
      o: p,
      ph: k / 12,
      y0: base + 52,
      x0: volcano.position.x,
      z0: volcano.position.z,
      rise: 0.02,
      drift: [22, 6],
      size: 16,
      alpha: 0.6,
      h: 30,
    });
    g.add(p);
  }
  // Des cônes plus petits, tout autour, et leur fumée
  const cones = new Scatter(farCone(), m.rock, false);
  for (let k = 0; k < 10; k++) {
    const a = rng() * Math.PI * 2;
    const d = 60 + rng() * 90;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const h = 6 + rng() * 14;
    cones.add(x, base - 0.5, z, [h * 1.1, h, h * 1.1], rng() * 6);
  }
  const cm = cones.build();
  if (cm) g.add(cm);

  // Des coulées de lave à la surface, autour des pistes, qui éclairent le sol
  for (let k = 0; k < 7; k++) {
    const p = spot(3, 28, 2.5, false);
    if (!p) continue;
    const w = 1.2 + rng() * 2.5;
    const len = 6 + rng() * 14;
    const shape = new THREE.Shape();
    const steps = 10;
    const side: [number, number][] = [];
    for (let j = 0; j <= steps; j++) {
      const s = j / steps;
      side.push([Math.sin(s * 5 + k) * 1.2, s * len]);
    }
    shape.moveTo(side[0]![0] - w / 2, side[0]![1]);
    for (const [x, y] of side) shape.lineTo(x - (w / 2) * (0.6 + Math.sin(y + k) * 0.3 + 0.4), y);
    for (const [x, y] of [...side].reverse()) shape.lineTo(x + (w / 2) * (0.6 + Math.cos(y + k) * 0.3 + 0.4), y);
    const geo = new THREE.ShapeGeometry(shape, 2);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pp = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i), pp.getZ(i));
    const river = new THREE.Mesh(geo, m.lava);
    river.position.set(p[0], base + 0.01, p[1]);
    river.rotation.y = rng() * Math.PI * 2;
    // Pas de coulée sur les pistes : on la raccourcit si elle y passe
    let ok = true;
    for (let j = 0; j <= 8 && ok; j++) {
      const v = new THREE.Vector3(0, 0, (j / 8) * len).applyEuler(river.rotation).add(river.position);
      if (!free(v.x, v.z, 1.6, false)) ok = false;
    }
    if (!ok) continue;
    g.add(river);
  }

  // Des rochers fendus, des arbres calcinés, des éclats d'obsidienne
  const rocks = new Scatter(leafyBall(1, 0.35, 61), m.rock);
  for (let k = 0; k < 45; k++) {
    const p = spot(0.6, 30, 0.6, false);
    if (!p) continue;
    const s = 0.15 + rng() * 0.9;
    rocks.add(p[0], base + s * 0.3, p[1], [s, s * 0.7, s * 0.9], rng() * 6);
  }
  const trunks = new Scatter(new THREE.CylinderGeometry(0.08, 0.16, 1, 7).translate(0, 0.5, 0), m.charred);
  const branches = new Scatter(new THREE.CylinderGeometry(0.03, 0.06, 1, 5).translate(0, 0.5, 0), m.charred);
  for (let k = 0; k < 14; k++) {
    const p = spot(2, 22, 1.2, true);
    if (!p) continue;
    const h = 2 + rng() * 3;
    trunks.add(p[0], base, p[1], [1, h, 1], rng() * 6, undefined, (rng() - 0.5) * 0.2);
    for (let j = 0; j < 3; j++)
      branches.add(p[0], base + h * (0.5 + j * 0.15), p[1], [1, 0.8 + rng() * 0.8, 1], rng() * 6, undefined, 0.6 + rng() * 0.4);
  }
  const shards = new Scatter(new THREE.OctahedronGeometry(1, 0), m.obsidian);
  for (let k = 0; k < 24; k++) {
    const p = spot(0.8, 18, 0.8, false);
    if (!p) continue;
    const s = 0.1 + rng() * 0.35;
    shards.add(p[0], base + s * 0.6, p[1], [s * 0.6, s * 1.6, s * 0.5], rng() * 6, undefined, (rng() - 0.5) * 0.6);
  }
  for (const s of [rocks, trunks, branches, shards]) {
    const mesh = s.build();
    if (mesh) g.add(mesh);
  }

  // Des cascades de lave au loin, sur une falaise
  for (let k = 0; k < 2; k++) {
    const a = (k ? -0.4 : 0.5) + Math.PI * 1.5;
    const d = 85 + rng() * 20;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const cliff = new THREE.Mesh(leafyBall(1, 0.25, 90 + k), m.rock);
    cliff.scale.set(16, 13, 9);
    cliff.position.set(x, base + 4, z);
    cliff.lookAt(cx, base + 4, cz);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 15), m.lava);
    fall.position.copy(cliff.position).add(new THREE.Vector3(cx - x, 0, cz - z).normalize().multiplyScalar(8.4));
    fall.lookAt(cx, base + 4, cz);
    g.add(cliff, fall);
  }

  // Les braises qui montent dans l'air chaud
  const n = 180;
  const ep = new Float32Array(n * 3);
  const es = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ep[i * 3] = b.x0 - 6 + rng() * (b.x1 - b.x0 + 12);
    ep[i * 3 + 1] = base + rng() * 0.5;
    ep[i * 3 + 2] = b.z0 - 6 + rng() * (b.z1 - b.z0 + 12);
    es[i] = 0.3 + rng() * 0.6;
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute("position", new THREE.BufferAttribute(ep.slice(), 3));
  const dot = canvasTex(
    32,
    (gg, s) => {
      const grd = gg.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, "rgba(255,220,120,1)");
      grd.addColorStop(0.4, "rgba(255,120,30,0.8)");
      grd.addColorStop(1, "rgba(255,60,0,0)");
      gg.fillStyle = grd;
      gg.fillRect(0, 0, s, s);
    },
    true,
  );
  const embers = new THREE.Points(
    eg,
    new THREE.PointsMaterial({ size: 0.07, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  g.add(embers);
  life.embers = { pts: embers, base: ep, speed: es };

  holeDecor(c, g, m, base, life, above);
  return g;
}

/** Une bouffée de fumée ou de vapeur : un disque flou, toujours tourné vers nous */
let puffTex: THREE.Texture | null = null;
function puff(color: number): THREE.Sprite {
  puffTex ??= canvasTex(
    64,
    (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, "rgba(255,255,255,0.9)");
      grd.addColorStop(0.5, "rgba(255,255,255,0.45)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    },
    true,
  );
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, opacity: 0, depthWrite: false }));
}

function holeDecor(c: Course, g: THREE.Group, m: Mats, base: number, life: Life, above: THREE.Object3D[]) {
  const def = c.def;

  // Les geysers : un cône de roche percé, et le panache de vapeur quand il souffle
  for (const p of def.pads) {
    if (p.look !== "geyser") continue;
    const y = heightAt(c, p.c[0], p.c[1]);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.04, 0.05, 8, 28), m.rock);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(p.c[0], y + 0.015, p.c[1]);
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(p.r * 0.6, 24),
      new THREE.MeshStandardMaterial({ color: 0xff9040, emissive: 0xff5010, emissiveIntensity: 0.8 }),
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(p.c[0], y + 0.006, p.c[1]);
    g.add(rim, hole);
    const plume = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, p.r * 0.9, 1, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xf4f0ec,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 1,
      }),
    );
    plume.geometry.translate(0, 0.5, 0);
    plume.position.set(p.c[0], y, p.c[1]);
    g.add(plume);
    life.plumes.push({ o: plume, period: p.period ?? 3, on: p.on ?? 0.5, a0: p.a0 ?? 0, h: 2.2 });
    for (let k = 0; k < 3; k++) {
      const s = puff(0xe8e0dc);
      life.smoke.push({
        o: s,
        ph: k / 3,
        y0: y + 0.1,
        x0: p.c[0],
        z0: p.c[1],
        rise: 0.14,
        drift: [0.4, -0.3],
        size: 0.7,
        alpha: 0.3,
        h: 2.2,
      });
      g.add(s);
    }
  }

  // Les fumerolles : un évent de roche au bord de la lave, d'où jaillit la vapeur pendant les bouffées
  for (const w of def.winds) {
    if (w.look !== "vapeur") continue;
    const xs = w.ring.map((p) => p[0]);
    const zs = w.ring.map((p) => p[1]);
    const z = (Math.min(...zs) + Math.max(...zs)) / 2;
    const fromLeft = w.acc[0] > 0;
    const x = fromLeft ? Math.min(...xs) - 0.2 : Math.max(...xs) + 0.2;
    const vent = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.6, 12, 1, true), m.rock);
    vent.position.set(x, base + 0.25, z);
    vent.rotation.z = fromLeft ? -1.2 : 1.2;
    g.add(vent);
    const holder = new THREE.Group();
    holder.position.set(x, 0.3, z);
    const puffs = Array.from({ length: 12 }, () => puff(0xf2eeea));
    holder.add(...puffs);
    holder.visible = false;
    g.add(holder);
    life.jets.push({ o: holder, puffs, period: w.period ?? 3, on: w.on ?? 0.5, dir: fromLeft ? 1 : -1 });
  }

  // Le tunnel de lave : un boyau de roche autour du tube, qui cache la balle le temps du passage
  for (const r of def.rails) {
    if (r.look !== "tube-lave") continue;
    const curve = new THREE.CatmullRomCurve3(r.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const shell = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.2, 12, false), m.rock);
    shell.castShadow = true;
    g.add(shell);
    for (const s of [0, 1]) {
      const pt = curve.getPointAt(s);
      const tangent = curve.getTangentAt(s);
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.06, 8, 20), m.rock);
      mouth.position.copy(pt);
      mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      g.add(mouth);
    }
  }

  // La forge : l'enclume, la potence du marteau, le foyer qui rougeoie
  for (const w of def.walls) {
    if (w.look !== "enclume" || !w.closed) continue;
    const wx = w.pts.reduce((s, p) => s + p[0], 0) / w.pts.length;
    const wz = w.pts.reduce((s, p) => s + p[1], 0) / w.pts.length;
    const sx = Math.max(...w.pts.map((p) => Math.abs(p[0] - wx))) * 2;
    const sz = Math.max(...w.pts.map((p) => Math.abs(p[1] - wz))) * 2;
    const y = heightAt(c, wx, wz);
    const anvil = new THREE.Group();
    const foot = new THREE.Mesh(boxMeters(sx, w.h * 0.35, sz), m.iron);
    foot.position.y = w.h * 0.175;
    const waist = new THREE.Mesh(boxMeters(sx * 0.55, w.h * 0.3, sz * 0.6), m.iron);
    waist.position.y = w.h * 0.5;
    const top = new THREE.Mesh(boxMeters(sx * 1.15, w.h * 0.3, sz * 0.95), m.iron);
    top.position.y = w.h * 0.8;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(sz * 0.4, sx * 0.6, 12), m.iron);
    horn.rotation.z = -Math.PI / 2;
    horn.position.set(sx * 0.85, w.h * 0.8, 0);
    const glowBar = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.4, 0.04, 0.06), m.ember);
    glowBar.position.set(-sx * 0.1, w.h * 0.96, 0);
    anvil.add(foot, waist, top, horn, glowBar);
    anvil.position.set(wx, y, wz);
    shadows(anvil);
    g.add(anvil);
  }
  for (const mv of def.movers) {
    if (mv.look !== "marteau" || mv.motion.k !== "swing") continue;
    const [px, py, pz] = mv.motion.c;
    let l = px;
    let r = px;
    while (l > px - 8 && onCourse(c, l - 0.05, pz, 0)) l -= 0.05;
    while (r < px + 8 && onCourse(c, r + 0.05, pz, 0)) r += 0.05;
    l -= 0.45;
    r += 0.45;
    const frame = new THREE.Group();
    const beam = new THREE.Mesh(boxMeters(r - l + 0.5, 0.3, 0.3), m.iron);
    beam.position.set((l + r) / 2, py + 0.1, pz);
    frame.add(beam);
    for (const x of [l, r]) {
      const h = py + 0.25 - base;
      const pole = new THREE.Mesh(boxMeters(0.3, h, 0.3), m.iron);
      pole.position.set(x, base + h / 2, pz);
      frame.add(pole);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12), m.iron);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(px, py, pz);
    frame.add(axle);
    // Le foyer à côté, sur la roche : des braises sous une hotte
    const hearth = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.5, 16), m.rock);
    bed.position.y = 0.25;
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16).rotateX(-Math.PI / 2), m.ember);
    coals.position.y = 0.51;
    hearth.add(bed, coals);
    hearth.position.set(r + 1.4, base, pz - 0.5);
    frame.add(hearth);
    for (let k = 0; k < 3; k++) {
      const s = puff(0x5a4c48);
      life.smoke.push({
        o: s,
        ph: k / 3,
        y0: base + 0.6,
        x0: r + 1.4,
        z0: pz - 0.5,
        rise: 0.1,
        drift: [0.6, 0.2],
        size: 1.0,
        alpha: 0.35,
        h: 3,
      });
      g.add(s);
    }
    shadows(frame);
    g.add(frame);
    above.push(beam);
  }
}
