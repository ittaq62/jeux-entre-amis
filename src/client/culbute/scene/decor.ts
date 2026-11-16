// Le décor des arènes : un ciel en dégradé, des îles qui flottent (un plateau posé sur une motte de terre et de roche),
// des maisons de village (crépi, volets, jardinières, tuiles, cheminées), des arbres touffus, des nuages, des guirlandes
// de lampions et des fanions. Tout est dessiné ici, sans image à charger.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Keep } from "./props.ts";

export const mat = (keep: Keep, color: THREE.ColorRepresentation, roughness = 0.85, metalness = 0, map?: THREE.Texture | null) =>
  keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, map: map ?? null }));

/** Un générateur de nombres reproductible : le décor est le même à chaque combat */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Les textures dessinées
// ---------------------------------------------------------------------------

export function canvasTex(
  keep: Keep,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
  repeat: [number, number] = [1, 1],
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = keep(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.repeat.set(repeat[0], repeat[1]);
  return t;
}

const hex = (c: THREE.ColorRepresentation, k = 0) => {
  const col = new THREE.Color(c);
  if (k > 0) col.lerp(new THREE.Color(0xffffff), k);
  else if (k < 0) col.multiplyScalar(1 + k);
  return `#${col.getHexString()}`;
};

/** Des pavés irréguliers, avec leurs joints et un reflet sur le dessus */
export function cobbleTex(keep: Keep, base: string, repeat: [number, number]) {
  const rnd = seeded(7);
  return canvasTex(
    keep,
    256,
    256,
    (g) => {
      g.fillStyle = hex(base, -0.45);
      g.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) * 16;
        for (let col = -1; col < 9; col++) {
          const x = col * 32 + off + 2;
          const y = row * 32 + 2;
          const k = (rnd() - 0.5) * 0.22;
          g.fillStyle = hex(base, k);
          g.beginPath();
          g.roundRect(x + rnd() * 2, y + rnd() * 2, 27 + rnd() * 2, 27 + rnd() * 2, 9);
          g.fill();
          g.fillStyle = "rgba(255,255,255,0.13)";
          g.beginPath();
          g.roundRect(x + 4, y + 3, 18, 8, 4);
          g.fill();
        }
      }
    },
    repeat,
  );
}

/** Des planches, avec leurs veines et leurs clous */
export function plankTex(keep: Keep, base: string, repeat: [number, number]) {
  const rnd = seeded(11);
  return canvasTex(
    keep,
    256,
    128,
    (g) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = hex(base, (rnd() - 0.5) * 0.18);
        g.fillRect(0, i * 32, 256, 32);
        g.strokeStyle = hex(base, -0.25);
        g.globalAlpha = 0.35;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          const y = i * 32 + 5 + rnd() * 22;
          g.moveTo(0, y);
          g.bezierCurveTo(80, y + rnd() * 6 - 3, 170, y + rnd() * 6 - 3, 256, y);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = hex(base, -0.5);
        g.fillRect(0, i * 32, 256, 2);
        const cut = 40 + rnd() * 170;
        g.fillRect(cut, i * 32, 2, 32);
        g.fillStyle = "#3a332c";
        g.fillRect(cut + 6, i * 32 + 8, 3, 3);
        g.fillRect(cut + 6, i * 32 + 22, 3, 3);
      }
    },
    repeat,
  );
}

/** Des tuiles rondes, rang par rang */
export function tileTex(keep: Keep, base: string) {
  return canvasTex(
    keep,
    128,
    128,
    (g) => {
      g.fillStyle = hex(base, -0.35);
      g.fillRect(0, 0, 128, 128);
      for (let row = 0; row < 8; row++)
        for (let col = 0; col < 9; col++) {
          const x = col * 16 - (row % 2) * 8;
          const y = row * 16;
          const grd = g.createLinearGradient(0, y, 0, y + 16);
          grd.addColorStop(0, hex(base, 0.12));
          grd.addColorStop(1, hex(base, -0.2));
          g.fillStyle = grd;
          g.beginPath();
          g.roundRect(x + 1, y, 14, 15, [0, 0, 7, 7]);
          g.fill();
        }
    },
    [3, 2],
  );
}

/** Du crépi : une couleur à peine tachée */
export function plasterTex(keep: Keep, base: string) {
  const rnd = seeded(base.length * 31 + base.charCodeAt(2));
  return canvasTex(keep, 128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = rnd() < 0.5 ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.05)";
      const r = 1 + rnd() * 5;
      g.beginPath();
      g.arc(rnd() * 128, rnd() * 128, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Des pierres de taille (le clocher), des ardoises (son toit) */
export function stoneTex(keep: Keep, base: string, repeat: [number, number]) {
  const rnd = seeded(5);
  return canvasTex(
    keep,
    256,
    256,
    (g) => {
      g.fillStyle = hex(base, -0.3);
      g.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) * 32;
        for (let col = -1; col < 5; col++) {
          g.fillStyle = hex(base, (rnd() - 0.5) * 0.16);
          g.fillRect(col * 64 + off + 2, row * 32 + 2, 60, 28);
        }
      }
    },
    repeat,
  );
}

export function slateTex(keep: Keep, base: string, repeat: [number, number]) {
  const rnd = seeded(13);
  return canvasTex(
    keep,
    128,
    128,
    (g) => {
      g.fillStyle = hex(base, -0.35);
      g.fillRect(0, 0, 128, 128);
      for (let row = 0; row < 8; row++)
        for (let col = 0; col < 9; col++) {
          g.fillStyle = hex(base, (rnd() - 0.5) * 0.2);
          g.beginPath();
          g.roundRect(col * 16 - (row % 2) * 8 + 1, row * 16 + 1, 14, 15, [0, 0, 4, 4]);
          g.fill();
        }
    },
    repeat,
  );
}

// ---------------------------------------------------------------------------
// Le ciel
// ---------------------------------------------------------------------------

export interface SkyColors {
  top: number;
  horizon: number;
  bottom: number;
  /** D'où vient la lueur du soleil (ou de la lune), et sa couleur */
  sun: THREE.Vector3;
  glow: number;
  glowSize: number;
}

/** Un grand dôme en dégradé, qui suit la caméra */
export function skyDome(keep: Keep, c: SkyColors): THREE.Mesh {
  const m = new THREE.Mesh(
    keep(new THREE.SphereGeometry(180, 32, 16)),
    keep(
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color(c.top) },
          uHorizon: { value: new THREE.Color(c.horizon) },
          uBottom: { value: new THREE.Color(c.bottom) },
          uSun: { value: c.sun.clone().normalize() },
          uGlow: { value: new THREE.Color(c.glow) },
          uGlowSize: { value: c.glowSize },
        },
        vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSun; uniform vec3 uGlow; uniform float uGlowSize; varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.75, h), 0.8)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.35, h));
  float s = max(0.0, dot(normalize(vDir), uSun));
  col += uGlow * (pow(s, 1.0 / max(0.001, uGlowSize) * 8.0) * 0.55 + pow(s, 400.0) * 1.2);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    ),
  );
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/** Un nuage dodu : quelques boules fondues, le dessous à plat */
export function cloud(keep: Keep, material: THREE.Material, x: number, y: number, z: number, s: number, seed: number): THREE.Mesh {
  const rnd = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const r = (0.55 + rnd() * 0.5) * (1 - Math.abs(i - n / 2) / n);
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate((i - (n - 1) / 2) * 0.62, r * 0.35 + rnd() * 0.2, (rnd() - 0.5) * 0.4);
    parts.push(g);
  }
  const merged = mergeParts(parts);
  // Le dessous à plat
  const pos = merged.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.25);
  merged.computeVertexNormals();
  const m = new THREE.Mesh(keep(merged), material);
  m.scale.set(s * 1.2, s, s * 0.7);
  m.position.set(x, y, z);
  m.userData.cloud = true;
  return m;
}

/** Une volée d'oiseaux en V qui traverse le ciel de temps en temps : ils battent des ailes, puis planent un peu */
export function flock(
  keep: Keep,
  color: number,
  seed: number,
  y: number,
  z: number,
  count = 5,
): { group: THREE.Group; update: (time: number) => void } {
  const rnd = seeded(seed);
  const group = new THREE.Group();
  const m = keep(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  // Une aile : un triangle effilé, du corps vers le bout, un peu en arrière
  const wing = keep(new THREE.BufferGeometry());
  wing.setAttribute("position", new THREE.Float32BufferAttribute([0.2, 0, 0, -0.16, 0, 0, -0.14, 0, 0.66], 3));
  wing.computeVertexNormals();
  const body = keep(new THREE.SphereGeometry(0.09, 6, 4));
  body.scale(2.6, 0.8, 0.8);
  const birds: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; dy: number; ph: number }[] = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const l = new THREE.Mesh(wing, m);
    const r = new THREE.Mesh(wing, m);
    r.scale.z = -1;
    g.add(new THREE.Mesh(body, m), l, r);
    // En V : le premier devant, les autres derrière lui de part et d'autre
    const rank = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    g.position.set(-rank * 1.25, 0, side * rank * 0.9);
    g.scale.setScalar(0.85 + rnd() * 0.3);
    group.add(g);
    birds.push({ g, l, r, dy: rank * 0.18 + rnd() * 0.25, ph: rnd() * 6.3 });
  }
  const period = 30 + rnd() * 14;
  const offset = rnd() * period;
  const crossing = 20;
  group.visible = false;
  const update = (time: number) => {
    const t = time + offset;
    const u = (t % period) / crossing;
    group.visible = u < 1;
    if (!group.visible) return;
    // Une fois de gauche à droite, la fois suivante de droite à gauche
    const dir = Math.floor(t / period) % 2 ? -1 : 1;
    group.position.set(dir * (-50 + 100 * u), y + Math.sin(t * 0.45) * 0.9, z);
    // Un peu tournés vers nous : on voit leurs ailes s'ouvrir (de profil, elles ne seraient qu'un trait)
    group.rotation.y = (dir > 0 ? -0.6 : Math.PI + 0.6) + Math.sin(t * 0.3) * 0.1;
    for (const b of birds) {
      const glide = Math.min(1, Math.max(0, (0.55 - Math.sin(t * 0.6 + b.ph)) * 2.5));
      const flap = 0.08 + Math.sin(t * 10.5 + b.ph) * 0.6 * glide;
      b.l.rotation.x = -flap;
      b.r.rotation.x = flap;
      b.g.position.y = b.dy + Math.sin(t * 1.3 + b.ph) * 0.12 - flap * 0.05;
    }
  };
  return { group, update };
}

/** Des lucioles qui flânent et clignotent dans le noir, devant les arbres */
export function fireflies(
  keep: Keep,
  n: number,
  seed: number,
  area: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number },
): { points: THREE.Points; update: (time: number) => void } {
  const rnd = seeded(seed);
  const geo = keep(new THREE.BufferGeometry());
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const base = Array.from({ length: n }, () => ({
    x: area.x0 + rnd() * (area.x1 - area.x0),
    y: area.y0 + rnd() * (area.y1 - area.y0),
    z: area.z0 + rnd() * (area.z1 - area.z0),
    ph: rnd() * 6.3,
    w: 0.6 + rnd() * 0.9,
  }));
  const points = new THREE.Points(
    geo,
    keep(
      new THREE.PointsMaterial({
        // Rapetisse avec l'éloignement (mais pas en unités du monde : 2,2 donne un halo d'une demi-unité environ)
        size: 2.2,
        map: haloTexture(keep),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    ),
  );
  const update = (time: number) => {
    base.forEach((b, i) => {
      pos[i * 3] = b.x + Math.sin(time * 0.31 * b.w + b.ph) * 1.2;
      pos[i * 3 + 1] = b.y + Math.sin(time * 0.53 * b.w + b.ph * 2) * 0.6;
      pos[i * 3 + 2] = b.z + Math.cos(time * 0.27 * b.w + b.ph) * 0.8;
      const on = Math.max(0, Math.sin(time * 1.1 * b.w + b.ph));
      const k = on * on * on;
      col[i * 3] = 0.85 * k;
      col[i * 3 + 1] = 1.0 * k;
      col[i * 3 + 2] = 0.45 * k;
    });
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  };
  update(0);
  return { points, update };
}

export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "color") g.deleteAttribute(name);
    return g;
  });
  let count = 0;
  for (const g of flat) count += g.getAttribute("position").count;
  const hasColor = flat.every((g) => g.getAttribute("color"));
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = hasColor ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const g of flat) {
    const n = g.getAttribute("position").count;
    pos.set(g.getAttribute("position").array as Float32Array, o * 3);
    nor.set(g.getAttribute("normal").array as Float32Array, o * 3);
    if (col) col.set(g.getAttribute("color").array as Float32Array, o * 3);
    o += n;
  }
  for (const p of parts) p.dispose();
  for (const g of flat) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return out;
}

function tinted(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute("position").count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

// ---------------------------------------------------------------------------
// L'île qui flotte
// ---------------------------------------------------------------------------

export interface IslandStyle {
  /** Le dessus (pavés, planches, ardoises) */
  top: THREE.Material;
  /** Le rebord du plateau, vu de face */
  rim: THREE.Material;
  /** La terre sous le plateau, puis la roche plus bas */
  earth: number;
  rock: number;
  /** Une bande d'herbe qui dépasse au bord */
  grass?: number;
  /** Combien la motte descend sous le plateau */
  depth: number;
}

/**
 * Le grand plateau : une dalle épaisse aux bords arrondis, et dessous une motte de terre et de roche qui s'affine vers
 * le bas, un peu cabossée, avec des racines qui pendent.
 */
export function island(keep: Keep, x0: number, x1: number, y: number, s: IslandStyle, seed: number): THREE.Group {
  const g = new THREE.Group();
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const deck = new THREE.Mesh(keep(new RoundedBoxGeometry(w + 0.1, 0.42, 3.4, 3, 0.12)), [s.rim, s.rim, s.top, s.rim, s.rim, s.rim]);
  deck.position.set(cx, y - 0.21, -0.4);
  deck.castShadow = true;
  deck.receiveShadow = true;
  g.add(deck);

  // La motte : une boîte très découpée, rétrécie vers le bas et bosselée, de la terre vers la roche
  const rnd = seeded(seed);
  const depth = s.depth;
  const geo = new THREE.BoxGeometry(w - 0.1, depth, 3.2, 28, 10, 6);
  geo.translate(0, -depth / 2, 0);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const earth = new THREE.Color(s.earth);
  const rock = new THREE.Color(s.rock);
  const tmp = new THREE.Color();
  const bumps = Array.from({ length: 9 }, () => [rnd() * 2 - 1, rnd(), rnd() * 0.5 + 0.2] as const);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    // Bornée : une erreur d'arrondi en haut de la motte donnerait une profondeur à peine négative (et une puissance invalide)
    const t = Math.max(0, Math.min(1, -vy / depth));
    const nx = vx / (w / 2);
    // Plus étroit en bas, avec une pointe pas tout à fait au milieu
    const narrow = 1 - 0.78 * Math.pow(t, 1.25);
    let bump = 0;
    for (const [bx, by, br] of bumps) bump += Math.exp(-(((nx - bx) / br) ** 2 + ((t - by) / 0.25) ** 2)) * 0.35;
    const wob = Math.sin(nx * 9 + seed) * 0.12 + Math.sin(t * 7 + nx * 3) * 0.1;
    pos.setX(i, vx * narrow + (t > 0.05 ? wob * 0.6 : 0) + Math.sin(t * 3.1) * 0.3 * t);
    pos.setZ(i, vz * (1 - 0.6 * t) * (1 + bump * 0.3) - 0.4);
    pos.setY(i, vy - (t > 0.05 ? bump * 0.6 * t + Math.abs(wob) * t : 0));
    // La couleur : la terre en haut, la roche en bas, des strates
    const strata = 0.5 + 0.5 * Math.sin(vy * 5.5 + nx * 1.5);
    tmp.copy(earth).lerp(rock, Math.min(1, t * 1.6));
    tmp.multiplyScalar(0.82 + strata * 0.22 - t * 0.25);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const lump = new THREE.Mesh(
    keep(geo.toNonIndexed()),
    keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })),
  );
  geo.dispose();
  lump.geometry.computeVertexNormals();
  lump.position.set(cx, y - 0.38, 0);
  lump.receiveShadow = true;
  g.add(lump);

  // L'herbe qui dépasse au bord, et quelques racines
  if (s.grass !== undefined) {
    // Une lèvre d'herbe le long du bord, d'où pendent de petites touffes de deux verts
    const grassMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    const tufts: THREE.BufferGeometry[] = [];
    const light = new THREE.Color(s.grass).lerp(new THREE.Color(0xfff2a0), 0.15);
    const dark = new THREE.Color(s.grass).multiplyScalar(0.75);
    const lip = new THREE.BoxGeometry(w + 0.05, 0.1, 0.16);
    lip.translate(cx, y - 0.4, 1.3);
    tufts.push(tinted(lip, dark));
    for (let i = 0; i < Math.floor(w * 7); i++) {
      const c = new THREE.ConeGeometry(0.04 + rnd() * 0.04, 0.1 + rnd() * 0.16, 4);
      c.rotateX(Math.PI + (rnd() - 0.5) * 0.6);
      c.rotateZ((rnd() - 0.5) * 0.5);
      c.translate(x0 + 0.05 + rnd() * (w - 0.1), y - 0.47 - rnd() * 0.04, 1.32 + rnd() * 0.06);
      tufts.push(tinted(c, rnd() < 0.5 ? light : dark));
    }
    g.add(new THREE.Mesh(keep(mergeParts(tufts)), grassMat));
    const root = keep(new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 0.95 }));
    for (let i = 0; i < 6; i++) {
      const len = 0.8 + rnd() * 1.6;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3((rnd() - 0.5) * 0.4, -len * 0.5, 0.1),
        new THREE.Vector3((rnd() - 0.5) * 0.6, -len, 0.05),
      ]);
      const r = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 8, 0.035, 5)), root);
      r.position.set(x0 + 0.6 + rnd() * (w - 1.2), y - 0.6 - rnd() * 0.4, 1.0);
      g.add(r);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Les maisons, les arbres
// ---------------------------------------------------------------------------

export interface HouseOpts {
  w: number;
  floors: number;
  wall: string;
  roof: string;
  shutter: string;
  door?: string;
  flowers?: boolean;
  chimney?: boolean;
  /** Une enseigne au rez-de-chaussée (boulangerie, café) : sa couleur */
  shop?: string;
  seed: number;
}

const FLOOR = 1.7;

/** Une maison de village vue de face : crépi, fenêtres à volets, jardinières, toit de tuiles, cheminée */
export function house(keep: Keep, o: HouseOpts, cache: Map<string, THREE.Material>): THREE.Group {
  const g = new THREE.Group();
  const rnd = seeded(o.seed);
  const get = (key: string, make: () => THREE.Material) => {
    let m = cache.get(key);
    if (!m) {
      m = make();
      cache.set(key, m);
    }
    return m;
  };
  const h = o.floors * FLOOR + 0.5;
  const wallMat = get(`mur-${o.wall}`, () => mat(keep, 0xffffff, 0.95, 0, plasterTex(keep, o.wall)));
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(o.w, h, 2.4)), wallMat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // Le soubassement, plus sombre
  const base = new THREE.Mesh(
    keep(new THREE.BoxGeometry(o.w + 0.04, 0.45, 2.44)),
    get(`base-${o.wall}`, () => mat(keep, hex(o.wall, -0.3), 0.95)),
  );
  base.position.y = 0.22;
  g.add(base);
  // Le toit : un prisme couvert de tuiles qui déborde un peu ; on en voit la pente de devant
  const roofH = 1.1 + rnd() * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-1.5, 0);
  shape.lineTo(0, roofH);
  shape.lineTo(1.5, 0);
  shape.lineTo(-1.5, 0);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: o.w + 0.4, bevelEnabled: false });
  roofGeo.translate(0, 0, -(o.w + 0.4) / 2);
  roofGeo.rotateY(Math.PI / 2);
  const roofMat = get(`toit-${o.roof}`, () => mat(keep, 0xffffff, 0.8, 0, tileTex(keep, o.roof)));
  const roof = new THREE.Mesh(keep(roofGeo), roofMat);
  roof.position.y = h;
  roof.castShadow = true;
  g.add(roof);
  if (o.chimney) {
    const ch = new THREE.Mesh(
      keep(new THREE.BoxGeometry(0.35, 0.9, 0.35)),
      get(`base-${o.wall}`, () => mat(keep, hex(o.wall, -0.3), 0.95)),
    );
    ch.position.set(o.w * 0.25, h + roofH * 0.6, -0.3);
    g.add(ch);
  }
  // Les fenêtres : vitre, encadrement clair, volets ouverts, une jardinière fleurie au premier
  const glass = get("vitre", () => mat(keep, 0x2c3a4a, 0.25, 0.3));
  const frame = get("cadre", () => mat(keep, 0xf4efe2, 0.7));
  const shutter = get(`volet-${o.shutter}`, () => mat(keep, o.shutter, 0.75));
  const pot = get("jardiniere", () => mat(keep, 0x9a5a3a, 0.8));
  const blooms = [0xe2483d, 0xf2c94c, 0xe86aa6, 0xffffff];
  const cols = Math.max(1, Math.floor((o.w - 0.4) / 1.25));
  for (let fl = 0; fl < o.floors; fl++) {
    for (let c = 0; c < cols; c++) {
      const wx = -o.w / 2 + (o.w / cols) * (c + 0.5);
      const wy = 0.5 + fl * FLOOR + FLOOR * 0.55;
      const ground = fl === 0;
      if (ground && c === Math.floor(cols / 2) && o.door) {
        const door = new THREE.Mesh(
          keep(new THREE.BoxGeometry(0.75, 1.35, 0.08)),
          get(`porte-${o.door}`, () => mat(keep, o.door!, 0.7)),
        );
        door.position.set(wx, 0.5 + 0.68, 1.22);
        g.add(door);
        const lintel = new THREE.Mesh(keep(new THREE.BoxGeometry(0.95, 0.12, 0.12)), frame);
        lintel.position.set(wx, 0.5 + 1.42, 1.24);
        g.add(lintel);
        continue;
      }
      if (ground && o.shop) {
        // Une vitrine de boutique, avec son store
        const win = new THREE.Mesh(keep(new THREE.BoxGeometry(0.95, 0.9, 0.06)), glass);
        win.position.set(wx, 0.5 + 0.75, 1.22);
        g.add(win);
        const awning = new THREE.Mesh(
          keep(new THREE.BoxGeometry(1.15, 0.08, 0.6)),
          get(`store-${o.shop}`, () => mat(keep, o.shop!, 0.8)),
        );
        awning.position.set(wx, 0.5 + 1.35, 1.45);
        awning.rotation.x = 0.35;
        g.add(awning);
        continue;
      }
      const win = new THREE.Mesh(keep(new THREE.BoxGeometry(0.62, 0.86, 0.06)), glass);
      win.position.set(wx, wy, 1.22);
      g.add(win);
      const sill = new THREE.Mesh(keep(new THREE.BoxGeometry(0.78, 0.07, 0.18)), frame);
      sill.position.set(wx, wy - 0.47, 1.26);
      g.add(sill);
      const top = new THREE.Mesh(keep(new THREE.BoxGeometry(0.74, 0.07, 0.1)), frame);
      top.position.set(wx, wy + 0.46, 1.24);
      g.add(top);
      for (const side of [-1, 1]) {
        const sh = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 0.88, 0.05)), shutter);
        sh.position.set(wx + side * 0.48, wy, 1.25);
        sh.rotation.y = side * 0.25;
        g.add(sh);
      }
      if (o.flowers && fl === 1 && rnd() < 0.8) {
        const box = new THREE.Mesh(keep(new THREE.BoxGeometry(0.68, 0.16, 0.2)), pot);
        box.position.set(wx, wy - 0.38, 1.36);
        g.add(box);
        const parts: THREE.BufferGeometry[] = [];
        for (let k = 0; k < 6; k++) {
          const s = new THREE.IcosahedronGeometry(0.07 + rnd() * 0.03, 0);
          s.translate(wx - 0.27 + k * 0.11, wy - 0.27 + rnd() * 0.06, 1.38 + rnd() * 0.06);
          parts.push(tinted(s, new THREE.Color(blooms[Math.floor(rnd() * blooms.length)]!)));
        }
        for (let k = 0; k < 5; k++) {
          const s = new THREE.IcosahedronGeometry(0.08, 0);
          s.translate(wx - 0.24 + k * 0.12, wy - 0.3, 1.33);
          parts.push(tinted(s, new THREE.Color(0x4f8a3c)));
        }
        g.add(
          new THREE.Mesh(
            keep(mergeParts(parts)),
            get("fleurs", () => keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }))),
          ),
        );
      }
    }
  }
  return g;
}

/** Un arbre au feuillage touffu : un tronc, et des boules de feuilles de deux verts */
export function tree(keep: Keep, h: number, leaf: number, seed: number, cache: Map<string, THREE.Material>): THREE.Group {
  const g = new THREE.Group();
  const rnd = seeded(seed);
  let trunkMat = cache.get("tronc");
  if (!trunkMat) {
    trunkMat = mat(keep, 0x7a5a3e, 0.95);
    cache.set("tronc", trunkMat);
  }
  const trunk = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.14, 0.24, h, 8)), trunkMat);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const light = new THREE.Color(leaf).lerp(new THREE.Color(0xfff2a0), 0.18);
  const dark = new THREE.Color(leaf).multiplyScalar(0.72);
  const parts: THREE.BufferGeometry[] = [];
  const n = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const r = h * (0.22 + rnd() * 0.12);
    const s = new THREE.IcosahedronGeometry(r, 1);
    const a = rnd() * Math.PI * 2;
    const up = rnd();
    s.translate(Math.cos(a) * h * 0.28 * (1 - up * 0.5), h * (0.95 + up * 0.45), Math.sin(a) * h * 0.2);
    parts.push(tinted(s, up > 0.55 ? light : up > 0.25 ? new THREE.Color(leaf) : dark));
  }
  let leafMat = cache.get("feuilles");
  if (!leafMat) {
    leafMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    cache.set("feuilles", leafMat);
  }
  const crown = new THREE.Mesh(keep(mergeParts(parts)), leafMat);
  crown.castShadow = true;
  g.add(crown);
  return g;
}

// ---------------------------------------------------------------------------
// Ce qui pend : lampions, fanions
// ---------------------------------------------------------------------------

function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, k: number) {
  const p = a.clone().lerp(b, k);
  p.y -= Math.sin(k * Math.PI) * sag;
  return p;
}

/** Une guirlande de lampions qui brillent, avec un halo autour de chacun */
export function lanterns(keep: Keep, a: THREE.Vector3, b: THREE.Vector3, sag: number, colors: number[], n = 10): THREE.Group {
  const g = new THREE.Group();
  const pts = Array.from({ length: 24 }, (_, i) => catenary(a, b, sag, i / 23));
  const wire = new THREE.Mesh(
    keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 4)),
    keep(new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })),
  );
  g.add(wire);
  const halo = haloTexture(keep);
  for (let i = 1; i < n; i++) {
    const p = catenary(a, b, sag, i / n);
    const c = colors[i % colors.length]!;
    const lamp = new THREE.Mesh(
      keep(new THREE.SphereGeometry(0.2, 14, 10)),
      keep(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.5 })),
    );
    lamp.scale.y = 1.25;
    lamp.position.copy(p).add(new THREE.Vector3(0, -0.24, 0));
    lamp.userData.flicker = i * 1.7 + a.x * 0.3;
    g.add(lamp);
    const glow = new THREE.Sprite(
      keep(
        new THREE.SpriteMaterial({
          map: halo,
          color: c,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    glow.position.copy(lamp.position);
    glow.scale.setScalar(1.3);
    glow.userData.flicker = i * 1.7 + a.x * 0.3;
    g.add(glow);
  }
  return g;
}

let haloCache: THREE.Texture | null = null;
export function haloTexture(keep: Keep): THREE.Texture {
  if (haloCache && (haloCache.image as HTMLCanvasElement | undefined)) return haloCache;
  const t = canvasTex(keep, 64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.3, "rgba(255,255,255,0.45)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  haloCache = t;
  return t;
}

/** Des fanions triangulaires le long d'un fil */
export function bunting(keep: Keep, a: THREE.Vector3, b: THREE.Vector3, sag: number, colors: number[], n = 14): THREE.Group {
  const g = new THREE.Group();
  const pts = Array.from({ length: 24 }, (_, i) => catenary(a, b, sag, i / 23));
  g.add(
    new THREE.Mesh(
      keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.015, 4)),
      keep(new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.9 })),
    ),
  );
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const k0 = (i + 0.1) / n;
    const k1 = (i + 0.9) / n;
    const p0 = catenary(a, b, sag, k0);
    const p1 = catenary(a, b, sag, k1);
    const mid = p0.clone().lerp(p1, 0.5);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([p0.x, p0.y, p0.z, mid.x, mid.y - 0.42, mid.z + 0.02, p1.x, p1.y, p1.z], 3),
    );
    tri.computeVertexNormals();
    parts.push(tinted(tri, new THREE.Color(colors[i % colors.length]!)));
  }
  g.add(
    new THREE.Mesh(
      keep(mergeParts(parts)),
      keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })),
    ),
  );
  return g;
}

/**
 * Moins de choses à dessiner : sous `root`, tous les morceaux immobiles qui partagent une matière deviennent une seule
 * forme (en gardant les couleurs par sommet quand la matière s'en sert).
 */
export function bake(root: THREE.Object3D, keep: Keep) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  root.traverse((o) => {
    if (o === root || !(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    if (Array.isArray(o.material) || !o.visible) return;
    const list = groups.get(o.material) ?? [];
    list.push(o);
    groups.set(o.material, list);
  });
  for (const [m, meshes] of groups) {
    if (meshes.length < 2) continue;
    const colored = (m as THREE.MeshStandardMaterial).vertexColors === true;
    const parts = meshes.map((mesh) => {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      const n = g.getAttribute("position").count;
      if (!g.getAttribute("normal")) g.computeVertexNormals();
      if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      if (colored && !g.getAttribute("color"))
        g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      return g;
    });
    const names = colored ? ["position", "normal", "uv", "color"] : ["position", "normal", "uv"];
    let count = 0;
    for (const p of parts) count += p.getAttribute("position").count;
    const out = new THREE.BufferGeometry();
    for (const name of names) {
      const size = name === "uv" ? 2 : 3;
      const arr = new Float32Array(count * size);
      let o = 0;
      for (const p of parts) {
        const a = p.getAttribute(name) as THREE.BufferAttribute;
        arr.set(a.array as Float32Array, o * size);
        o += a.count;
      }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    for (const p of parts) p.dispose();
    const merged = new THREE.Mesh(keep(out), m);
    merged.castShadow = meshes.some((x) => x.castShadow);
    merged.receiveShadow = meshes.some((x) => x.receiveShadow);
    for (const x of meshes) x.removeFromParent();
    root.add(merged);
  }
}
