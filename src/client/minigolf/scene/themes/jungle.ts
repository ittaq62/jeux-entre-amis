// Le Temple dans la jungle : un temple de pierre gagné par la forêt, en fin de matinée. Des allées de mousse et de
// dalles moussues, des marches, le bois d'un pont de lianes ; autour, de grands arbres à contreforts et leurs lianes, des
// palmiers, des bananiers, des fougères, des fleurs, des ruines, une pyramide dans la brume, la rivière et sa chute ;
// des rayons de soleil à travers le feuillage, des grains de poussière qui flottent, des papillons.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { heightAt, tileAt, type Course, type MoverDef } from "../../../../shared/games/minigolf/course.ts";
import { hedgeTex, sandTex, stoneTex, surface, type SurfaceTex } from "../textures.ts";
import { feltMat, leafyBall, onCourse, plainKit, Scatter, seeded, surfaceMat, waterMat, type Theme } from "./common.ts";

let made: Theme | null = null;

// ---------------------------------------------------------------------------
// Les textures
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Des dalles de pierre grise de tailles inégales, la mousse dans les joints et par plaques */
function pavingTex(): SurfaceTex {
  return surface("jungle-dalle", 512, 2.4, 131, 4, (u, v, n) => {
    const rows = 5;
    const row = Math.floor(v * rows);
    const cv = v * rows - row;
    // Chaque rangée a ses propres longueurs de dalles
    const shift = n(row * 3.7, 0.3, 64, 1);
    const cols = 3 + (row % 2);
    const cu = (u * cols + shift * 2) % 1;
    const col = Math.floor((u * cols + shift * 2) % cols);
    const edge = Math.min(cu, 1 - cu) / cols / (1 / rows);
    const e = Math.min(edge, cv, 1 - cv);
    const joint = e < 0.045;
    const tone = n(col * 5.3 + row * 1.7, row * 2.1, 64, 1);
    const grit = n(u * 140, v * 140, 140, 2);
    const moss = clamp01((n(u * 9, v * 9, 9, 4) - 0.56) * 4);
    const chip = n(u * 40, v * 40, 40, 2) > 0.74 ? 0.88 : 1;
    if (joint) {
      const m = n(u * 60, v * 60, 60, 2);
      return [mix(48, 70, m), mix(70, 104, m), mix(30, 40, m), 0.05];
    }
    const k = (0.66 + tone * 0.2 + grit * 0.14) * chip;
    const r = 178 * k;
    const g = 176 * k;
    const b = 160 * k;
    return [
      mix(r, 82, moss * 0.85),
      mix(g, 118, moss * 0.85),
      mix(b, 52, moss * 0.85),
      0.5 + grit * 0.3 + moss * 0.15 - (chip < 1 ? 0.2 : 0),
    ];
  });
}

/** Les planches du pont, en travers, et les jours entre elles */
function planksTex(): SurfaceTex {
  return surface("jungle-pont", 256, 0.8, 137, 5, (u, v, n) => {
    const plank = Math.floor(v * 4);
    const pv = v * 4 - plank;
    const gap = pv < 0.1;
    const shade = n(plank * 4.1, 0.2, 64, 1);
    const fibre = n(u * 3 + plank * 7, pv * 40, 3, 3);
    const k = 0.58 + shade * 0.2 + fibre * 0.14;
    if (gap) return [26, 22, 16, 0];
    // La corde qui lie chaque planche, sur les bords
    const rope = (u < 0.06 || u > 0.94) && pv > 0.3 && pv < 0.7;
    if (rope) return [160, 132, 90, 0.9];
    return [170 * k, 128 * k, 84 * k, 0.6 + fibre * 0.2];
  });
}

/** Des galets ronds sous l'eau du gué */
function pebblesTex(): SurfaceTex {
  return surface("jungle-galets", 512, 1.2, 139, 6, (u, v, n) => {
    // Des cellules : la distance au centre le plus proche fait le galet
    const cells = 12;
    let best = 9;
    let id = 0;
    const cx = Math.floor(u * cells);
    const cy = Math.floor(v * cells);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        const wx = ((gx % cells) + cells) % cells;
        const wy = ((gy % cells) + cells) % cells;
        const ox = n(wx * 13.1, wy * 7.3, 256, 1);
        const oy = n(wx * 5.7, wy * 11.9, 256, 1);
        const d = Math.hypot(u * cells - (gx + 0.2 + ox * 0.6), v * cells - (gy + 0.2 + oy * 0.6));
        if (d < best) {
          best = d;
          id = wx * 31 + wy;
        }
      }
    const dome = clamp01(1 - best * 1.6);
    const tone = n(id * 1.3, 0.5, 512, 1);
    const k = 0.45 + dome * 0.4 + tone * 0.25;
    return [mix(120, 170, tone) * k, mix(112, 150, tone) * k, mix(90, 120, tone) * k, dome];
  });
}

/** L'écorce des grands arbres : des fibres en long, des fentes */
function barkTex(): SurfaceTex {
  return surface("jungle-ecorce", 256, 1.6, 149, 5, (u, v, n) => {
    const fibre = n(u * 24, v * 3, 24, 3);
    const crack = Math.abs(n(u * 10, v * 1.5, 10, 2) - 0.5) < 0.04 ? 0.55 : 1;
    const lichen = clamp01((n(u * 6, v * 6, 6, 3) - 0.6) * 3);
    const k = (0.55 + fibre * 0.35) * crack;
    return [mix(96 * k, 120, lichen * 0.5), mix(82 * k, 128, lichen * 0.5), mix(64 * k, 96, lichen * 0.5), fibre * crack];
  });
}

/** Le grand disque de pierre gravé : des anneaux, des glyphes, un soleil au centre (une seule fois, 2,5 m de côté) */
function discTex(): SurfaceTex {
  return surface("jungle-disque", 512, 2.5, 151, 7, (u, v, n) => {
    const x = (u - 0.5) * 2;
    const y = (v - 0.5) * 2;
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    const grit = n(u * 90, v * 90, 90, 2);
    let h = 0.6;
    // Les anneaux en creux
    for (const ring of [0.22, 0.24, 0.5, 0.53, 0.8, 0.83, 0.97]) if (Math.abs(r - ring) < 0.012) h = 0.15;
    // Le soleil : des rayons autour du centre
    if (r < 0.22) h = 0.75 + Math.cos(a * 8) * 0.1 - r;
    // Les glyphes : des cases entre les anneaux, chacune son motif
    if (r > 0.25 && r < 0.49) {
      const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12);
      const lr = (r - 0.25) / 0.24;
      const la = ((((a + Math.PI) / (Math.PI * 2)) * 12) % 1) - 0.5;
      const pat = (k * 7) % 4;
      const cut =
        pat === 0
          ? Math.abs(la) < 0.12
          : pat === 1
            ? Math.abs(lr - 0.5) < 0.12
            : pat === 2
              ? Math.hypot(la * 2, lr - 0.5) < 0.3 && Math.hypot(la * 2, lr - 0.5) > 0.18
              : Math.abs(la) < 0.3 && lr > 0.3 && lr < 0.7 && Math.abs(la * 2 - (lr - 0.5) * 2) < 0.15;
      if (Math.abs(la) > 0.46) h = 0.2;
      else if (cut) h = 0.3;
    }
    if (r > 0.54 && r < 0.79) {
      const k = (((a + Math.PI) / (Math.PI * 2)) * 24) % 1;
      if (k < 0.08) h = 0.2;
      else if (Math.abs(k - 0.5) < 0.12 && Math.abs(r - 0.66) < 0.06) h = 0.32;
    }
    if (r > 1) h = 0.5;
    const moss = clamp01((n(u * 7, v * 7, 7, 4) - 0.62) * 3) * (r > 0.85 ? 1 : 0.4);
    const k = 0.5 + h * 0.42 + grit * 0.12;
    return [mix(176 * k, 84, moss), mix(170 * k, 116, moss), mix(150 * k, 54, moss), h + grit * 0.05];
  });
}

/** Le sol de la forêt : de la terre sombre, des plaques de mousse, des feuilles mortes, quelques brindilles */
function floorTex(): SurfaceTex {
  return surface("jungle-sol", 512, 7, 157, 2.2, (u, v, n) => {
    const patch = n(u * 5, v * 5, 5, 4);
    const fine = n(u * 110, v * 110, 110, 2);
    const leaves = n(u * 36, v * 36, 36, 2);
    const twig = Math.abs(n(u * 14, v * 14, 14, 2) - 0.5) < 0.008 ? 1 : 0;
    const moss = clamp01((patch - 0.42) * 3.2);
    const litter = clamp01((leaves - 0.6) * 5) * (1 - moss * 0.75);
    const k = 0.78 + fine * 0.3;
    let r = mix(58, 62, moss) * k;
    let g = mix(48, 92, moss) * k;
    let b = mix(34, 38, moss) * k;
    r = mix(r, 118 * k, litter);
    g = mix(g, 90 * k, litter);
    b = mix(b, 46 * k, litter);
    if (twig) {
      r = 92;
      g = 70;
      b = 44;
    }
    return [r, g, b, moss * 0.45 + litter * 0.35 + fine * 0.2 + twig * 0.3];
  });
}

/** Une texture dessinée à la main */
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, alpha = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  if (alpha) g.clearRect(0, 0, size, size);
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Des glyphes gravés en frise (linteaux, stèles, autel) */
function glyphTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#9c9784";
    g.fillRect(0, 0, s, s);
    let seed = 17;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 2200; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "60,60,50" : "200,196,180"},${rnd() * 0.15})`;
      g.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    g.strokeStyle = "rgba(40,38,30,0.75)";
    g.lineWidth = 4;
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 4; col++) {
        const x = col * 64 + 8;
        const y = row * 128 + 14;
        g.strokeRect(x, y, 48, 100);
        g.beginPath();
        const kind = (row * 4 + col) % 5;
        if (kind === 0) {
          g.arc(x + 24, y + 34, 13, 0, Math.PI * 2);
          g.moveTo(x + 10, y + 70);
          g.lineTo(x + 38, y + 70);
        } else if (kind === 1) {
          g.moveTo(x + 10, y + 20);
          g.lineTo(x + 38, y + 50);
          g.lineTo(x + 10, y + 80);
        } else if (kind === 2) {
          g.rect(x + 12, y + 20, 24, 24);
          g.moveTo(x + 24, y + 50);
          g.lineTo(x + 24, y + 86);
        } else if (kind === 3) {
          g.arc(x + 24, y + 60, 16, Math.PI, 0);
          g.moveTo(x + 14, y + 30);
          g.arc(x + 14, y + 30, 3, 0, Math.PI * 2);
          g.moveTo(x + 37, y + 30);
          g.arc(x + 34, y + 30, 3, 0, Math.PI * 2);
        } else {
          for (let k = 0; k < 4; k++) {
            g.moveTo(x + 10, y + 20 + k * 18);
            g.lineTo(x + 38, y + 20 + k * 18);
          }
        }
        g.stroke();
      }
  });
}

/** Une corde tressée */
function ropeTex(): THREE.CanvasTexture {
  return canvasTex(64, (g, s) => {
    g.fillStyle = "#a88a5a";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(70,52,28,0.6)";
    g.lineWidth = 3;
    for (let k = -s; k < s * 2; k += 10) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + s * 0.6, s);
      g.stroke();
    }
  });
}

// ---------------------------------------------------------------------------
// La mousse : ce qui regarde le ciel se couvre de vert
// ---------------------------------------------------------------------------

function mossy<M extends THREE.MeshStandardMaterial>(m: M, amount = 0.85, moss = 0x557d34): M {
  const mc = new THREE.Color(moss);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.mossColor = { value: mc };
    shader.uniforms.mossAmount = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vMossUp;\nvarying vec3 vMossPos;")
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        vMossUp = (vec4(transformedNormal, 0.0) * viewMatrix).y;
        vec4 mossWP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mossWP = instanceMatrix * mossWP;
        #endif
        vMossPos = (modelMatrix * mossWP).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vMossUp;\nvarying vec3 vMossPos;\nuniform vec3 mossColor;\nuniform float mossAmount;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float mossN = 0.5 + 0.25 * sin(vMossPos.x * 2.3 + vMossPos.z * 1.7) + 0.25 * sin(vMossPos.x * -1.9 + vMossPos.z * 2.6 + vMossPos.y * 1.3);
        float mossK = smoothstep(0.35, 0.8, vMossUp) * smoothstep(0.25, 0.7, mossN) * mossAmount;
        diffuseColor.rgb = mix(diffuseColor.rgb, mossColor * (0.75 + 0.5 * mossN), mossK);`,
      );
  };
  m.customProgramCacheKey = () => `mossy-${amount}-${moss}`;
  return m;
}

// ---------------------------------------------------------------------------
// Les formes des plantes
// ---------------------------------------------------------------------------

/** Une palme (ou une fronde de fougère) : la nervure qui s'incline, des folioles de chaque côté ; vers +x */
function frondGeo(len: number, width: number, droop: number, n: number, lift = 0.5): THREE.BufferGeometry {
  const pos: number[] = [];
  const rib = (s: number): [number, number, number] => {
    const x = s * len * Math.cos(lift * (1 - s));
    const y = s * len * Math.sin(lift * (1 - s)) - droop * len * s * s;
    return [x, y, 0];
  };
  for (let i = 0; i < n; i++) {
    const s0 = 0.1 + (0.86 * i) / n;
    const s1 = s0 + (0.86 / n) * 0.9;
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, s0 * 1.05)), 0.6) * (1 - 0.25 * s0);
    const a = rib(s0);
    const b = rib(s1);
    const t = rib(Math.min(1, s0 + 0.14));
    for (const side of [-1, 1]) {
      const tip: [number, number, number] = [t[0], t[1] - w * 0.25, side * w];
      if (side > 0) pos.push(...a, ...b, ...tip);
      else pos.push(...b, ...a, ...tip);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Une fougère : sept frondes en rosette, qui montent puis retombent */
function fernGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const f = frondGeo(0.9 + (k % 3) * 0.15, 0.13, 0.55, 16, 1.0);
    f.rotateY((k / 7) * Math.PI * 2 + k * 0.3);
    parts.push(f);
  }
  return mergeGeometries(parts)!;
}

/** La couronne d'un palmier : neuf palmes */
function palmCrownGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const f = frondGeo(3.0 + (k % 2) * 0.5, 0.42, 0.45, 22, 0.6);
    f.rotateY((k / 9) * Math.PI * 2 + (k % 3) * 0.2);
    parts.push(f);
  }
  return mergeGeometries(parts)!;
}

/** Un bananier : six grandes feuilles ovales sur leurs pétioles, et le tronc */
function bananaGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.07, 0.12, 1.6, 8);
  stem.translate(0, 0.8, 0);
  parts.push(stem.toNonIndexed());
  for (let k = 0; k < 6; k++) {
    const leaf = new THREE.PlaneGeometry(1.9, 0.6, 10, 2);
    const p = leaf.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 0.95;
      const s = x / 1.9;
      const half = Math.sin(Math.PI * Math.min(1, s * 1.02)) * 0.3;
      const y = p.getY(i);
      const side = Math.sign(y);
      // La feuille : sa largeur, pliée le long de la nervure, qui s'incline vers le bas
      p.setXYZ(i, x, -0.6 * s * s + Math.abs(y) * 0.2, side * half * (Math.abs(y) / 0.3));
    }
    leaf.computeVertexNormals();
    leaf.rotateZ(0.55 + (k % 2) * 0.2);
    leaf.translate(0, 1.5 + (k % 3) * 0.15, 0);
    leaf.rotateY((k / 6) * Math.PI * 2 + k);
    parts.push(leaf.toNonIndexed());
  }
  for (const g of parts) g.deleteAttribute("uv");
  return mergeGeometries(parts)!;
}

/** Les contreforts d'un grand arbre : quatre ailes qui s'élargissent vers le sol */
function buttressGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.6, 0.15, 1.7, 0);
  shape.quadraticCurveTo(0.5, 0.6, 0, 2.4);
  shape.lineTo(0, 0);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false, curveSegments: 6 });
    g.translate(0.25, 0, -0.08);
    g.rotateY((k / 4) * Math.PI * 2 + 0.4);
    parts.push(g.toNonIndexed());
  }
  for (const g of parts) g.deleteAttribute("uv");
  return mergeGeometries(parts)!;
}

/** Un tronc de palmier, un peu courbé (sa couronne se pose en `top`) */
function palmTrunk(): { geo: THREE.BufferGeometry; top: THREE.Vector3 } {
  const top = new THREE.Vector3(0.9, 6.6, 0);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.1, 2.4, 0),
    new THREE.Vector3(0.45, 4.8, 0),
    top,
  ]);
  const geo = new THREE.TubeGeometry(curve, 16, 0.16, 8, false);
  return { geo, top };
}

/** Une boîte dont les uv sont en mètres */
function boxMeters(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // L'ordre des faces : +x, −x, +y, −y, +z, −z (quatre sommets chacune)
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f]![0], uv.getY(i) * dims[f]![1]);
    }
  return g;
}

/** Un rectangle dont les uv sont en mètres */
function planeMeters(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  return g;
}

function shadows(o: THREE.Object3D, cast = true) {
  o.traverse((q) => {
    if (q instanceof THREE.Mesh) {
      q.castShadow = cast;
      q.receiveShadow = true;
    }
  });
}

// ---------------------------------------------------------------------------
// Le thème
// ---------------------------------------------------------------------------

interface Mats {
  stone: THREE.MeshStandardMaterial;
  darkStone: THREE.MeshStandardMaterial;
  carved: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  jade: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  river: THREE.MeshStandardMaterial;
  ford: THREE.MeshStandardMaterial;
  disc: THREE.MeshStandardMaterial;
}

let discMap: { map: THREE.Texture; normal: THREE.Texture } | null = null;
/** Le disque qui tourne dans le trou en cours (son centre en uv, sa vitesse) */
let discSpin: { w: number } | null = null;

export function jungleTheme(): Theme {
  if (made) return made;
  const felt = feltMat(0x4d8a3c, 0.5, 0.05);
  const paving = surfaceMat(pavingTex(), { roughness: 0.88 });
  const steps = surfaceMat(pavingTex(), { color: 0xd9d2bf, roughness: 0.9, scale: 0.7 });
  const planks = surfaceMat(planksTex(), { roughness: 0.82 });
  const pebbles = surfaceMat(pebblesTex(), { roughness: 0.55 });
  // Les sables mouvants : un sable brun, mouillé, qui luit un peu
  const quicksand = surfaceMat(sandTex(), { color: 0x8a7352, roughness: 0.55, scale: 2.2 });
  const sand = surfaceMat(sandTex(), { color: 0xeadbb0, roughness: 1 });
  const dt = discTex();
  const dmap = dt.map.clone();
  const dnor = dt.normal.clone();
  dmap.needsUpdate = dnor.needsUpdate = true;
  discMap = { map: dmap, normal: dnor };
  const disc = new THREE.MeshStandardMaterial({ map: dmap, normalMap: dnor, roughness: 0.85 });
  const stone = mossy(surfaceMat(stoneTex(), { color: 0xb3ae98, roughness: 0.92 }), 0.9);
  const darkStone = mossy(surfaceMat(stoneTex(), { color: 0x8e8a78, roughness: 0.95 }), 0.75);
  const glyphs = glyphTex();
  glyphs.repeat.set(1 / 1.2, 1 / 1.2);
  const carved = mossy(new THREE.MeshStandardMaterial({ map: glyphs, roughness: 0.9 }), 0.7);
  const bt = barkTex();
  const bark = new THREE.MeshStandardMaterial({ map: bt.map, normalMap: bt.normal, roughness: 0.95 });
  const rt = ropeTex();
  rt.repeat.set(6, 1);
  const rope = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.95 });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xe8b648,
    roughness: 0.22,
    metalness: 1,
    emissive: 0x3a2400,
    emissiveIntensity: 0.4,
  });
  const jade = new THREE.MeshStandardMaterial({ color: 0x3fbf8a, roughness: 0.2, emissive: 0x1a8a5a, emissiveIntensity: 1.6 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a32, roughness: 0.75, side: THREE.DoubleSide });
  const river = waterMat(0x3d7a64, 0.88);
  const ford = waterMat(0x5a9a84, 0.5);
  const m: Mats = { stone, darkStone, carved, bark, rope, gold, jade, leaf, river, ford, disc };

  const post = (look: string | undefined, r: number, h: number): THREE.Object3D => {
    const g = new THREE.Group();
    if (look === "serpent") {
      // Un serpent de pierre dressé sur son socle, la tête tournée vers le départ, les yeux de jade
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.4, 0.16, 20), darkStone);
      base.position.y = 0.08;
      g.add(base);
      for (let k = 0; k < 2; k++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(r * (0.85 - k * 0.2), r * 0.32, 10, 24), stone);
        coil.rotation.x = Math.PI / 2;
        coil.position.y = 0.2 + k * r * 0.5;
        g.add(coil);
      }
      const neck = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.3, -r * 0.4),
        new THREE.Vector3(0, h * 0.55, -r * 0.2),
        new THREE.Vector3(0, h * 0.82, r * 0.15),
        new THREE.Vector3(0, h * 0.9, r * 0.45),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(neck, 20, r * 0.28, 10, false), stone));
      const hood = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 18, 12), stone);
      hood.scale.set(1.15, 1.45, 0.2);
      hood.position.set(0, h * 0.76, r * 0.1);
      hood.rotation.x = -0.25;
      const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.36, 14, 10), stone);
      head.scale.set(1, 0.7, 1.5);
      head.position.set(0, h * 0.92, r * 0.6);
      g.add(hood, head);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 6), jade);
        eye.position.set(s * r * 0.2, h * 0.95, r * 0.85);
        g.add(eye);
      }
    } else if (look === "colonne" || look === "colonne-brisee") {
      // Une colonne de pierre, son socle, son chapiteau (ou sa cassure), une liane qui s'y enroule
      const broken = look === "colonne-brisee";
      const sh = broken ? h * 0.7 : h - 0.22;
      const base = new THREE.Mesh(boxMeters(r * 2.5, 0.12, r * 2.5), darkStone);
      base.position.y = 0.06;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, sh, 14, 3), stone);
      if (broken) {
        // Le haut cassé : des sommets du dessus décalés au hasard
        const p = shaft.geometry.attributes.position as THREE.BufferAttribute;
        const rnd = seeded(Math.round(r * 1000 + h * 100));
        for (let i = 0; i < p.count; i++) if (p.getY(i) > sh / 2 - 0.01) p.setY(i, p.getY(i) - rnd() * 0.18);
        shaft.geometry.computeVertexNormals();
      }
      shaft.position.y = 0.12 + sh / 2;
      g.add(base, shaft);
      if (!broken) {
        const cap = new THREE.Mesh(boxMeters(r * 2.6, 0.16, r * 2.6), darkStone);
        cap.position.y = 0.12 + sh + 0.08;
        g.add(cap);
      }
      const spiral: THREE.Vector3[] = [];
      for (let k = 0; k <= 24; k++) {
        const a = k * 0.55;
        spiral.push(new THREE.Vector3(Math.cos(a) * r * 1.02, 0.1 + (k / 24) * sh * 0.95, Math.sin(a) * r * 1.02));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiral), 60, 0.018, 5, false), leafVine));
      const leaves = new Scatter(leafyBall(0, 0.2, 7), leafVine);
      for (let k = 2; k < 24; k += 3) {
        const p = spiral[k]!;
        leaves.add(p.x * 1.08, p.y, p.z * 1.08, [0.07, 0.035, 0.05], k);
      }
      const lm = leaves.build();
      if (lm) g.add(lm);
    } else {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), stone);
      shaft.position.y = h / 2;
      g.add(shaft);
    }
    shadows(g);
    return g;
  };
  const leafVine = new THREE.MeshStandardMaterial({ color: 0x3d7a2e, roughness: 0.8 });

  const mover = (def: MoverDef, c: Course): THREE.Object3D | null => {
    const g = new THREE.Group();
    if (def.look === "rocher") {
      // Un gros rocher moussu, qui roule pour de bon en allant et venant
      for (const p of def.parts) {
        if (p.k !== "post") continue;
        const ground = heightAt(c, p.c[0], p.c[1]);
        const rock = new THREE.Mesh(leafyBall(2, 0.12, Math.round(p.c[1] * 10)), stone);
        rock.scale.setScalar(p.r * 1.05);
        const holder = new THREE.Group();
        holder.position.set(p.c[0], ground + p.r, p.c[1]);
        holder.add(rock);
        g.add(holder);
        const dir = def.motion.k === "slide" ? new THREE.Vector3(def.motion.d[0], 0, def.motion.d[2]) : new THREE.Vector3(1, 0, 0);
        const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
        const len = Math.hypot(dir.x, dir.z) || 1;
        g.userData.onPose = (move: readonly number[]) => {
          const along = ((move[0] ?? 0) * dir.x + (move[2] ?? 0) * dir.z) / len;
          rock.quaternion.setFromAxisAngle(axis, along / p.r);
        };
      }
      shadows(g);
      return g;
    }
    if (def.look === "serpents") {
      // Deux serpents de pierre verte, couchés, la tête dressée vers l'extérieur, qui tournent autour du trou
      const scales = canvasTex(64, (gg, s) => {
        gg.fillStyle = "#5f7a4a";
        gg.fillRect(0, 0, s, s);
        gg.strokeStyle = "rgba(30,44,22,0.6)";
        gg.lineWidth = 2;
        for (let y = 0; y < s; y += 8)
          for (let x = (y / 8) % 2 ? 4 : 0; x < s; x += 8) {
            gg.beginPath();
            gg.arc(x, y, 5, 0, Math.PI);
            gg.stroke();
          }
      });
      scales.repeat.set(8, 1);
      const skin = mossy(new THREE.MeshStandardMaterial({ map: scales, roughness: 0.7 }), 0.5, 0x6a8a3a);
      for (const p of def.parts) {
        if (p.k !== "wall") continue;
        const a = new THREE.Vector3(p.a[0], 0, p.a[1]);
        const b = new THREE.Vector3(p.b[0], 0, p.b[1]);
        const ground = heightAt(c, (p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2);
        const dir = b.clone().sub(a).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 8; k++) {
          const s = k / 8;
          const q = a
            .clone()
            .lerp(b, s)
            .addScaledVector(side, Math.sin(s * Math.PI * 2) * p.t * 0.6);
          q.y = ground + 0.075 + s * s * 0.05;
          pts.push(q);
        }
        const body = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.072, 10, false), skin);
        g.add(body);
        // La queue qui s'effile vers le trou
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.22, 10), skin);
        tail.position.copy(pts[0]!).addScaledVector(dir, -0.1);
        tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
        g.add(tail);
        // La tête dressée, son capuchon, ses yeux
        const tip = pts[8]!;
        const neck = new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([
              tip,
              tip
                .clone()
                .addScaledVector(dir, 0.08)
                .setY(tip.y + 0.14),
              tip
                .clone()
                .addScaledVector(dir, 0.1)
                .setY(tip.y + 0.3),
            ]),
            12,
            0.06,
            10,
            false,
          ),
          skin,
        );
        const hood = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
        hood.scale.set(1, 1.2, 0.25);
        hood.position
          .copy(tip)
          .addScaledVector(dir, 0.08)
          .setY(tip.y + 0.26);
        hood.lookAt(hood.position.clone().add(dir));
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), skin);
        head.scale.set(1, 0.7, 1.5);
        head.position
          .copy(tip)
          .addScaledVector(dir, 0.17)
          .setY(tip.y + 0.32);
        head.lookAt(head.position.clone().add(dir));
        g.add(neck, hood, head);
        for (const s of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), jade);
          eye.position
            .copy(head.position)
            .addScaledVector(side, s * 0.04)
            .addScaledVector(dir, 0.05)
            .setY(head.position.y + 0.025);
          g.add(eye);
        }
      }
      shadows(g);
      return g;
    }
    if (def.look === "balancier") {
      // Une bûche pendue à deux lianes, qui se balance en travers de l'allée
      for (const p of def.parts) {
        if (p.k !== "cap") continue;
        const a = new THREE.Vector3(...p.a);
        const b = new THREE.Vector3(...p.b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = Math.min(a.distanceTo(b), 1.74);
        const log = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.05, len, 16), bark);
        log.rotation.z = Math.PI / 2;
        log.position.copy(mid);
        g.add(log);
        const ringTex = canvasTex(64, (gg, s) => {
          gg.fillStyle = "#c9a26a";
          gg.fillRect(0, 0, s, s);
          gg.strokeStyle = "rgba(120,80,40,0.5)";
          for (let k = 4; k < s / 2; k += 4) {
            gg.beginPath();
            gg.arc(s / 2, s / 2, k, 0, Math.PI * 2);
            gg.stroke();
          }
        });
        for (const s of [-1, 1]) {
          const end = new THREE.Mesh(
            new THREE.CircleGeometry(p.r * 0.98, 16),
            new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.9 }),
          );
          end.position.copy(mid).add(new THREE.Vector3((s * len) / 2 + s * 0.001, 0, 0));
          end.rotation.y = (s * Math.PI) / 2;
          g.add(end);
        }
        if (def.motion.k === "swing") {
          const pivotY = def.motion.c[1];
          for (const s of [-1, 1]) {
            const x = mid.x + s * len * 0.36;
            const ropeLen = pivotY - mid.y;
            const line = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ropeLen, 6), rope);
            line.position.set(x, mid.y + ropeLen / 2, mid.z);
            const knot = new THREE.Mesh(new THREE.TorusGeometry(p.r * 1.06, 0.022, 6, 16), rope);
            knot.rotation.y = Math.PI / 2;
            knot.position.set(x, mid.y, mid.z);
            g.add(line, knot);
          }
        }
      }
      shadows(g);
      return g;
    }
    return null;
  };

  const kit = plainKit({
    felt,
    ground: (mat, look) => {
      if (look === "dalle") return paving;
      if (look === "marche") return steps;
      if (look === "pont") return planks;
      if (look === "gue") return pebbles;
      if (look === "sables") return quicksand;
      if (look === "sable") return sand;
      if (look === "disque") return disc;
      if (mat === "stone") return paving;
      return null;
    },
    side: darkStone,
    rail: (look) => {
      if (look === "pont") return { material: rope, extra: -0.02, widen: -0.01, round: true };
      return { material: stone, extra: 0.04, widen: 0.03 };
    },
    // Les troncs et les racines sont dessinés par le décor
    wall: (look) => (look === "tronc" || look === "racine" ? hiddenMat : look === "autel" ? carved : stone),
    post,
    mover,
    water: () => river,
    flag: 0xd8402a,
  });
  const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });

  made = {
    sky: {
      top: 0x76aacb,
      horizon: 0xcfe2c6,
      bottom: 0x2e4428,
      sun: [0.5, 0.72, 0.3],
      sunColor: 0xfff0c8,
      sunIntensity: 2.7,
      hemiSky: 0xd2e8cf,
      hemiGround: 0x3a4a28,
      hemiIntensity: 0.8,
      clouds: 0.25,
      cloudColor: 0xffffff,
      fog: 0xa6c2a0,
      fogNear: 24,
      fogFar: 90,
      exposure: 1.0,
      grade: { warm: 0.03, sat: 1.12, vignette: 0.36 },
    },
    kit,
    ambience: "jungle",
    tick: (t, decor) => {
      if (discSpin && discMap) discMap.map.rotation = discMap.normal.rotation = discSpin.w * t;
      if (decor) jungleLife(decor, t);
    },
    decor: (c, rng) => jungleDecor(c, rng, m),
  };
  return made;
}

// ---------------------------------------------------------------------------
// La vie : les papillons, les poussières dans la lumière, l'eau qui coule, les flammes
// ---------------------------------------------------------------------------

interface Life {
  butterflies: { o: THREE.Object3D; wings: THREE.Object3D[]; c: THREE.Vector3; ph: number; rx: number; rz: number; sp: number }[];
  motes: { pts: THREE.Points; base: Float32Array } | null;
  flows: { tex: THREE.Texture; u: number; v: number }[];
  flames: { o: THREE.Object3D; ph: number }[];
  foam: { o: THREE.Object3D; ph: number }[];
  shafts: THREE.MeshBasicMaterial[];
}

function jungleLife(decor: THREE.Object3D, t: number) {
  const life = decor.userData.life as Life | undefined;
  if (!life) return;
  for (const b of life.butterflies) {
    const a = t * b.sp + b.ph;
    const x = b.c.x + Math.sin(a) * b.rx + Math.sin(a * 2.3) * 0.3;
    const z = b.c.z + Math.cos(a * 0.8) * b.rz;
    const y = b.c.y + Math.sin(a * 1.7) * 0.35 + Math.sin(t * 7 + b.ph) * 0.04;
    const dx = x - b.o.position.x;
    const dz = z - b.o.position.z;
    b.o.position.set(x, y, z);
    if (dx * dx + dz * dz > 1e-8) b.o.rotation.y = Math.atan2(dx, dz);
    const flap = Math.sin(t * 16 + b.ph * 5) * 0.9;
    b.wings[0]!.rotation.z = flap;
    b.wings[1]!.rotation.z = -flap;
  }
  if (life.motes) {
    const p = life.motes.pts.geometry.attributes.position as THREE.BufferAttribute;
    const base = life.motes.base;
    for (let i = 0; i < p.count; i++) {
      const k = i * 3;
      p.setXYZ(
        i,
        base[k]! + Math.sin(t * 0.21 + i) * 0.4,
        base[k + 1]! + Math.sin(t * 0.17 + i * 1.3) * 0.25,
        base[k + 2]! + Math.cos(t * 0.19 + i * 0.7) * 0.4,
      );
    }
    p.needsUpdate = true;
  }
  for (const f of life.flows) {
    f.tex.offset.x = -t * f.u;
    f.tex.offset.y = -t * f.v;
  }
  for (const f of life.flames) {
    const k = 1 + Math.sin(t * 13 + f.ph) * 0.12 + Math.sin(t * 7.3 + f.ph * 2) * 0.1;
    f.o.scale.set(1 + (k - 1) * 0.4, k, 1 + (k - 1) * 0.4);
  }
  for (const f of life.foam) {
    const k = 1 + Math.sin(t * 5 + f.ph) * 0.15;
    f.o.scale.set(k, 1, k);
  }
  for (let i = 0; i < life.shafts.length; i++) life.shafts[i]!.opacity = 0.07 + Math.sin(t * 0.4 + i * 1.7) * 0.025;
}

// ---------------------------------------------------------------------------
// Le décor
// ---------------------------------------------------------------------------

let decoMats: {
  ground: THREE.Material;
  litter: THREE.Material;
  canopy: THREE.Material;
  palm: THREE.Material;
  fern: THREE.Material;
  banana: THREE.Material;
  bush: THREE.Material;
  flower: THREE.Material;
  liana: THREE.Material;
  mud: THREE.Material;
} | null = null;

/** Une bande d'eau qui coule (rivière, gué, chute) : sa matière propre, sa texture qui défile */
function flowingWater(base: THREE.MeshStandardMaterial, life: Life, u: number, v: number): THREE.MeshStandardMaterial {
  const m = base.clone();
  const n = (base.userData.flow as THREE.Texture).clone();
  n.needsUpdate = true;
  m.normalMap = n;
  life.flows.push({ tex: n, u, v });
  return m;
}

function jungleDecor(c: Course, rng: () => number, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const life: Life = { butterflies: [], motes: null, flows: [], flames: [], foam: [], shafts: [] };
  g.userData.life = life;
  const above: THREE.Object3D[] = [];
  g.userData.hideAbove = above;
  const b = c.box;
  const base = c.outY;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;

  if (!decoMats) {
    const floor = surfaceMat(floorTex(), { roughness: 1 });
    floor.normalScale = new THREE.Vector2(0.6, 0.6);
    const ht = hedgeTex();
    decoMats = {
      ground: floor,
      litter: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }),
      canopy: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: false }),
      palm: new THREE.MeshStandardMaterial({ color: 0x4f8a36, roughness: 0.7, side: THREE.DoubleSide }),
      fern: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }),
      banana: new THREE.MeshStandardMaterial({ color: 0x5c9a3a, roughness: 0.6, side: THREE.DoubleSide }),
      bush: new THREE.MeshStandardMaterial({ map: ht.map, normalMap: ht.normal, roughness: 0.85 }),
      flower: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
      liana: new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 0.9 }),
      mud: surfaceMat(stoneTex(), { color: 0x5a4a34, roughness: 1 }),
    };
  }
  const dm = decoMats;

  // Les zones où le sol s'ouvre : la rivière sous le pont, la gorge sous la chute
  const cuts: { x0: number; x1: number; z0: number; z1: number; kind: "riviere" | "chute" }[] = [];
  for (const d of c.def.decos) {
    const half = (d.s ?? 2) / 2;
    if (d.k === "riviere") cuts.push({ x0: -70, x1: 70, z0: d.at[1] - half, z1: d.at[1] + half, kind: "riviere" });
    if (d.k === "chute") {
      const sgn = d.at[0] >= 0 ? 1 : -1;
      const xa = d.at[0] + sgn * 0.02;
      cuts.push({
        x0: Math.min(xa, xa + sgn * 70),
        x1: Math.max(xa, xa + sgn * 70),
        z0: d.at[1] - half,
        z1: d.at[1] + half,
        kind: "chute",
      });
    }
  }
  const inCut = (x: number, z: number, pad: number) =>
    cuts.some((k) => x > k.x0 - pad && x < k.x1 + pad && z > k.z0 - pad && z < k.z1 + pad);

  // Le sol de la forêt, percé là où coule l'eau
  const shape = new THREE.Shape();
  const R = 170;
  // La forme est tracée en (x, −z) : une fois couchée (rotation de −90° autour de x), elle regarde le ciel
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
  const ground = new THREE.Mesh(groundGeo, dm.ground);
  ground.position.y = base - 0.002;
  ground.receiveShadow = true;
  g.add(ground);

  // Où l'on peut poser quelque chose : hors des pistes, hors de l'eau, hors du couloir de la caméra derrière le départ
  const teeX = c.tee.x;
  const teeZ = c.tee.z;
  const free = (x: number, z: number, pad: number, tall: boolean) => {
    if (onCourse(c, x, z, pad)) return false;
    if (inCut(x, z, pad * 0.6)) return false;
    if (tall && Math.abs(x - teeX) < 3.5 + pad && z > teeZ - 1 && z < teeZ + 12) return false;
    return true;
  };
  const spot = (minD: number, maxD: number, pad: number, tall: boolean): [number, number] | null => {
    for (let k = 0; k < 30; k++) {
      const a = rng() * Math.PI * 2;
      const d = minD + rng() * (maxD - minD);
      const x = cx + Math.cos(a) * ((b.x1 - b.x0) / 2 + d);
      const z = cz + Math.sin(a) * ((b.z1 - b.z0) / 2 + d);
      if (free(x, z, pad, tall)) return [x, z];
    }
    return null;
  };

  // Les grands arbres : le tronc et ses contreforts, la couronne en nuages de feuilles, les lianes qui pendent
  const trunks = new Scatter(new THREE.CylinderGeometry(0.42, 0.62, 1, 12).translate(0, 0.5, 0), m.bark);
  const fins = new Scatter(buttressGeo(), m.bark);
  const crowns = new Scatter(leafyBall(2, 0.16, 5), dm.canopy);
  const lianaGeos: THREE.BufferGeometry[] = [];
  const greens = [0x2f5a26, 0x3a6a2c, 0x46783a, 0x2a4f2a, 0x527f3a];
  const nTrees = 16;
  for (let k = 0; k < nTrees; k++) {
    const p = spot(5, 26, 4.5, true);
    if (!p) continue;
    const [x, z] = p;
    const h = 11 + rng() * 7;
    const s = 0.8 + rng() * 0.5;
    trunks.add(x, base, z, [s, h, s], rng() * 6);
    fins.add(x, base, z, s * (0.8 + rng() * 0.4), rng() * 6);
    const n = 5 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + rng();
      const d = j === 0 ? 0 : 2 + rng() * 2.2;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const py = base + h + (j === 0 ? 1.2 : -0.6 + rng() * 1.4);
      const sc = 2.4 + rng() * 1.6;
      crowns.add(px, py, pz, [sc, sc * 0.55, sc], rng() * 6, greens[Math.floor(rng() * greens.length)]!);
      // Une liane qui pend sous chaque nuage de feuilles, une fois sur deux
      if (j > 0 && rng() < 0.55) {
        const drop = 3 + rng() * (h - 5);
        const sway = rng() * 0.8;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(px, py - sc * 0.3, pz),
          new THREE.Vector3(px + sway * 0.5, py - drop * 0.5, pz + sway * 0.3),
          new THREE.Vector3(px + sway, py - drop, pz - sway * 0.2),
        ]);
        lianaGeos.push(new THREE.TubeGeometry(curve, 10, 0.03 + rng() * 0.03, 5, false));
      }
    }
  }
  for (const s of [trunks, fins]) {
    const mesh = s.build();
    if (mesh) g.add(mesh);
  }
  const crownMesh = crowns.build();
  if (crownMesh) {
    g.add(crownMesh);
    above.push(crownMesh);
  }
  if (lianaGeos.length) {
    const lm = new THREE.Mesh(mergeGeometries(lianaGeos)!, dm.liana);
    lm.castShadow = true;
    g.add(lm);
    above.push(lm);
  }

  // Les palmiers
  const pt = palmTrunk();
  const palmTrunks = new Scatter(pt.geo, m.bark);
  const palmCrowns = new Scatter(palmCrownGeo().translate(pt.top.x, pt.top.y, pt.top.z), dm.palm);
  for (let k = 0; k < 10; k++) {
    const p = spot(3, 18, 3, true);
    if (!p) continue;
    const s = 0.8 + rng() * 0.45;
    const r = rng() * 6;
    palmTrunks.add(p[0], base, p[1], s, r);
    palmCrowns.add(p[0], base, p[1], s, r);
  }
  for (const s of [palmTrunks, palmCrowns]) {
    const mesh = s.build();
    if (mesh) {
      g.add(mesh);
      if (s === palmCrowns) above.push(mesh);
    }
  }

  // Les bananiers, les fougères, les buissons en fleurs, au bord des pistes
  const bananas = new Scatter(bananaGeo(), dm.banana);
  for (let k = 0; k < 12; k++) {
    const p = spot(1.6, 10, 1.6, true);
    if (p) bananas.add(p[0], base, p[1], 0.8 + rng() * 0.5, rng() * 6);
  }
  const ferns = new Scatter(fernGeo(), dm.fern);
  const fernCols = [0x4f8f3a, 0x5f9a3e, 0x3f7a30, 0x6aa046];
  for (let k = 0; k < 90; k++) {
    const p = spot(0.6, 9, 0.6, false);
    if (p) ferns.add(p[0], base, p[1], 0.6 + rng() * 0.7, rng() * 6, fernCols[k % fernCols.length]!);
  }
  const bushes = new Scatter(leafyBall(2, 0.16, 9), dm.bush);
  const flowers = new Scatter(new THREE.IcosahedronGeometry(1, 0), dm.flower, false);
  const petals = [0xe8402a, 0xf0a020, 0xe04a8a, 0xffd24a, 0xf26a3a];
  for (let k = 0; k < 40; k++) {
    const p = spot(1.2, 12, 1.2, true);
    if (!p) continue;
    const s = 0.45 + rng() * 0.5;
    for (let j = 0; j < 3; j++) {
      const a = rng() * Math.PI * 2;
      const sj = s * (j === 0 ? 1 : 0.6 + rng() * 0.25);
      bushes.add(
        p[0] + (j === 0 ? 0 : Math.cos(a) * s * 0.8),
        base + sj * 0.55,
        p[1] + (j === 0 ? 0 : Math.sin(a) * s * 0.8),
        [sj, sj * 0.8, sj],
        rng() * 6,
        greens[(k + j * 2) % greens.length]!,
      );
    }
    if (k % 2 === 0)
      for (let j = 0; j < 5; j++) {
        const a = rng() * Math.PI * 2;
        flowers.add(
          p[0] + Math.cos(a) * s * 0.8,
          base + s * (0.5 + rng() * 0.4),
          p[1] + Math.sin(a) * s * 0.8,
          0.07 + rng() * 0.04,
          rng() * 6,
          petals[k % petals.length]!,
        );
      }
  }
  // Les feuilles mortes sur le sol
  const litter = new Scatter(new THREE.PlaneGeometry(0.11, 0.05).rotateX(-Math.PI / 2), dm.litter, false);
  const litterCols = [0x5e4a26, 0x6a5630, 0x4e5a26, 0x735a2e, 0x4a3a1e];
  for (let k = 0; k < 240; k++) {
    const x = b.x0 - 8 + rng() * (b.x1 - b.x0 + 16);
    const z = b.z0 - 8 + rng() * (b.z1 - b.z0 + 16);
    if (!free(x, z, 0.15, false)) continue;
    litter.add(x, base + 0.004, z, 0.7 + rng() * 0.8, rng() * 6, litterCols[k % litterCols.length]!, (rng() - 0.5) * 0.3);
  }
  for (const s of [bananas, ferns, bushes, flowers, litter]) {
    const mesh = s.build();
    if (mesh) g.add(mesh);
  }

  // Les rochers moussus et les ruines : des blocs taillés, des tambours de colonnes couchés, des stèles gravées
  const rocks = new Scatter(leafyBall(1, 0.3, 13).scale(1, 0.7, 1), m.darkStone);
  for (let k = 0; k < 22; k++) {
    const p = spot(0.8, 14, 0.8, false);
    if (p) rocks.add(p[0], base + 0.05, p[1], 0.25 + rng() * 0.6, rng() * 6);
  }
  const blocks = new Scatter(boxMeters(1, 1, 1), m.stone);
  const drums = new Scatter(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 14).rotateZ(Math.PI / 2), m.stone);
  for (let k = 0; k < 14; k++) {
    const p = spot(1.5, 12, 1.5, true);
    if (!p) continue;
    if (k % 3 === 0) drums.add(p[0], base + 0.42, p[1], 1, rng() * 6);
    else {
      const w = 0.7 + rng() * 0.7;
      const h = 0.4 + rng() * 0.6;
      blocks.add(p[0], base + h / 2 - 0.05, p[1], [w, h, w * (0.6 + rng() * 0.5)], rng() * 6, undefined, (rng() - 0.5) * 0.15);
    }
  }
  for (const s of [rocks, blocks, drums]) {
    const mesh = s.build();
    if (mesh) g.add(mesh);
  }
  for (let k = 0; k < 3; k++) {
    const p = spot(2, 10, 1.5, true);
    if (!p) continue;
    const stele = new THREE.Mesh(boxMeters(0.9, 2.2, 0.35), m.carved);
    stele.position.set(p[0], base + 1.05, p[1]);
    stele.rotation.set((rng() - 0.5) * 0.12, Math.atan2(cx - p[0], cz - p[1]), (rng() - 0.5) * 0.1);
    shadows(stele);
    g.add(stele);
  }

  // La forêt au loin, tout autour : de grands troncs et leurs couronnes, qui ferment l'horizon dans la brume
  const farTrunks = new Scatter(new THREE.CylinderGeometry(0.5, 0.7, 1, 8).translate(0, 0.5, 0), m.bark, false);
  const farCrowns = new Scatter(leafyBall(1, 0.2, 17), dm.canopy, false);
  for (let k = 0; k < 70; k++) {
    const a = (k / 70) * Math.PI * 2 + rng() * 0.08;
    const d = 34 + rng() * 26;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    if (inCut(x, z, 2)) continue;
    const h = 12 + rng() * 10;
    farTrunks.add(x, base, z, [1.2, h, 1.2], rng() * 6);
    const sc = 5 + rng() * 4;
    farCrowns.add(x, base + h + sc * 0.2, z, [sc, sc * 0.6, sc], rng() * 6, greens[k % greens.length]!);
  }
  for (const s of [farTrunks, farCrowns]) {
    const mesh = s.build();
    if (mesh) {
      g.add(mesh);
      if (s === farCrowns) above.push(mesh);
    }
  }

  // La pyramide dans la brume, au loin, derrière le trou (tout près au trou des marches)
  const near = c.def.decos.some((d) => d.k === "pyramide");
  const pyr = new THREE.Group();
  const tiers = 7;
  const W0 = near ? 24 : 30;
  const tierH = near ? 1.9 : 2.6;
  for (let k = 0; k < tiers; k++) {
    const w = W0 * (1 - k / (tiers + 1.5));
    const tier = new THREE.Mesh(boxMeters(w, tierH, w), m.stone);
    tier.position.y = tierH * (k + 0.5);
    pyr.add(tier);
  }
  // L'escalier au milieu de la face et le temple au sommet
  const stair = new THREE.Mesh(boxMeters(W0 * 0.16, tierH * tiers, W0 * 0.5), m.darkStone);
  stair.position.set(0, (tierH * tiers) / 2 - tierH * 0.6, W0 * 0.28);
  stair.rotation.x = 0.62;
  pyr.add(stair);
  const shrine = new THREE.Mesh(boxMeters(W0 * 0.22, tierH * 1.6, W0 * 0.2), m.carved);
  shrine.position.y = tierH * tiers + tierH * 0.8;
  pyr.add(shrine);
  pyr.position.set(near ? cx : cx + 8, base, b.z0 - (near ? 18 : 42));
  shadows(pyr, near);
  g.add(pyr);

  // Les rayons du soleil à travers le feuillage, et les poussières qui y flottent
  const ray = canvasTex(
    64,
    (gg, s) => {
      const grd = gg.createLinearGradient(0, 0, s, 0);
      grd.addColorStop(0, "rgba(255,240,200,0)");
      grd.addColorStop(0.5, "rgba(255,240,200,1)");
      grd.addColorStop(1, "rgba(255,240,200,0)");
      gg.fillStyle = grd;
      gg.fillRect(0, 0, s, s);
      const fade = gg.createLinearGradient(0, 0, 0, s);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.15, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,1)");
      gg.globalCompositeOperation = "destination-out";
      gg.fillStyle = fade;
      gg.fillRect(0, 0, s, s);
    },
    true,
  );
  const sun = new THREE.Vector3(0.5, 0.72, 0.3).normalize();
  for (let k = 0; k < 7; k++) {
    const p = spot(-1, 6, -1, false) ?? [cx, cz];
    const mat = new THREE.MeshBasicMaterial({
      map: ray,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    life.shafts.push(mat);
    const len = 18;
    const shaft = new THREE.Group();
    for (let j = 0; j < 2; j++) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + rng() * 1.2, len), mat);
      plane.rotation.y = j * (Math.PI / 2);
      plane.position.y = len / 2;
      shaft.add(plane);
    }
    // Le rayon part du sol et monte vers le soleil
    shaft.position.set(p[0], base, p[1]);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sun);
    g.add(shaft);
    above.push(shaft);
  }
  const nMotes = 220;
  const mp = new Float32Array(nMotes * 3);
  for (let i = 0; i < nMotes; i++) {
    mp[i * 3] = b.x0 - 5 + rng() * (b.x1 - b.x0 + 10);
    mp[i * 3 + 1] = base + 0.3 + rng() * 4.5;
    mp[i * 3 + 2] = b.z0 - 5 + rng() * (b.z1 - b.z0 + 10);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.BufferAttribute(mp.slice(), 3));
  const dot = canvasTex(
    32,
    (gg, s) => {
      const grd = gg.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, "rgba(255,250,220,1)");
      grd.addColorStop(1, "rgba(255,250,220,0)");
      gg.fillStyle = grd;
      gg.fillRect(0, 0, s, s);
    },
    true,
  );
  const motes = new THREE.Points(
    mg,
    new THREE.PointsMaterial({
      size: 0.04,
      map: dot,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  g.add(motes);
  life.motes = { pts: motes, base: mp };

  // Les papillons : des morphos bleus, des orangés, des jaunes
  const wingCols = [
    ["#2a7fff", "#0a1a3a"],
    ["#ff8a1a", "#2a1405"],
    ["#ffe04a", "#3a2a05"],
  ];
  const wingMats = wingCols.map(
    ([a, e]) =>
      new THREE.MeshStandardMaterial({
        map: canvasTex(
          64,
          (gg, s) => {
            gg.fillStyle = e!;
            gg.beginPath();
            gg.ellipse(s * 0.5, s * 0.38, s * 0.46, s * 0.34, 0, 0, Math.PI * 2);
            gg.ellipse(s * 0.38, s * 0.78, s * 0.3, s * 0.2, 0.3, 0, Math.PI * 2);
            gg.fill();
            gg.fillStyle = a!;
            gg.beginPath();
            gg.ellipse(s * 0.48, s * 0.4, s * 0.36, s * 0.26, 0, 0, Math.PI * 2);
            gg.ellipse(s * 0.38, s * 0.78, s * 0.22, s * 0.14, 0.3, 0, Math.PI * 2);
            gg.fill();
          },
          true,
        ),
        transparent: true,
        alphaTest: 0.3,
        side: THREE.DoubleSide,
        roughness: 0.5,
        emissive: new THREE.Color(a!),
        emissiveIntensity: 0.15,
      }),
  );
  for (let k = 0; k < 9; k++) {
    const p = spot(0.5, 5, 0.5, true) ?? [cx, cz];
    const o = new THREE.Group();
    const wings: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), wingMats[k % wingMats.length]!);
      wing.rotation.x = -Math.PI / 2;
      wing.position.x = s * 0.045;
      if (s < 0) wing.scale.x = -1;
      pivot.add(wing);
      o.add(pivot);
      wings.push(pivot);
    }
    g.add(o);
    life.butterflies.push({
      o,
      wings,
      c: new THREE.Vector3(p[0], base + 0.8 + rng() * 1.6, p[1]),
      ph: rng() * 10,
      rx: 0.8 + rng() * 1.6,
      rz: 0.8 + rng() * 1.6,
      sp: 0.25 + rng() * 0.3,
    });
  }

  holeDecor(c, g, m, base, life, cuts, rng);
  return g;
}

/** Ce que chaque trou demande */
function holeDecor(
  c: Course,
  g: THREE.Group,
  m: Mats,
  base: number,
  life: Life,
  cuts: { x0: number; x1: number; z0: number; z1: number; kind: "riviere" | "chute" }[],
  rng: () => number,
) {
  const def = c.def;
  const dm = decoMats!;

  // Les troncs couchés et les racines : dessinés le long de leur mur (qui ne se voit pas)
  for (const w of def.walls) {
    if (w.look !== "tronc" && w.look !== "racine") continue;
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const a = w.pts[i]!;
      const e = w.pts[i + 1]!;
      const ga = heightAt(c, a[0], a[1]);
      const ge = heightAt(c, e[0], e[1]);
      if (w.look === "tronc") {
        const r = w.h / 2;
        const len = Math.hypot(e[0] - a[0], e[1] - a[1]) + r * 0.6;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, len, 18), m.bark);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = -Math.atan2(e[1] - a[1], e[0] - a[0]);
        const wrap = new THREE.Group();
        wrap.position.set((a[0] + e[0]) / 2, (ga + ge) / 2 + r, (a[1] + e[1]) / 2);
        wrap.rotation.y = -Math.atan2(e[1] - a[1], e[0] - a[0]);
        log.rotation.y = 0;
        wrap.add(log);
        // De la mousse sur le dessus, et des champignons
        const moss = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 1.03, r * 1.1, len * 0.8, 18, 1, true, -0.9, 1.8),
          new THREE.MeshStandardMaterial({ color: 0x5a8a34, roughness: 1 }),
        );
        moss.rotation.z = Math.PI / 2;
        moss.rotation.x = -Math.PI / 2;
        wrap.add(moss);
        for (let k = 0; k < 4; k++) {
          const cap = new THREE.Mesh(
            new THREE.SphereGeometry(0.05 + rng() * 0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: k % 2 ? 0xe8d2a0 : 0xd8642a, roughness: 0.7 }),
          );
          cap.scale.y = 0.6;
          cap.position.set((rng() - 0.5) * len * 0.8, r * 0.92, (rng() - 0.5) * r * 0.6);
          wrap.add(cap);
        }
        shadows(wrap);
        g.add(wrap);
      } else {
        // Une racine noueuse qui serpente au ras du sol
        const len = Math.hypot(e[0] - a[0], e[1] - a[1]);
        const dir = new THREE.Vector3((e[0] - a[0]) / len, 0, (e[1] - a[1]) / len);
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 10; k++) {
          const s = k / 10;
          const p = new THREE.Vector3(a[0], 0, a[1])
            .addScaledVector(dir, s * len)
            .addScaledVector(side, Math.sin(s * 9 + a[0]) * (w.t ?? 0.08) * 0.5);
          p.y = ga + (ge - ga) * s + w.h * (0.45 + Math.sin(s * 5) * 0.1);
          pts.push(p);
        }
        const root = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, w.h * 0.55, 9, false), m.bark);
        shadows(root);
        g.add(root);
      }
    }
  }

  // Le puits et sa sortie : un rebord de pierre au ras du sol autour d'un trou sombre
  for (const p of def.portals) {
    if (p.look !== "puits") continue;
    for (const [pt, r] of [
      [p.a, p.r],
      [p.b, p.r * 0.8],
    ] as const) {
      const y = heightAt(c, pt[0], pt[1]);
      const rim = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.12, 36), m.darkStone);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(pt[0], y + 0.006, pt[1]);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 28), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(pt[0], y + 0.005, pt[1]);
      rim.receiveShadow = true;
      g.add(rim, hole);
    }
  }

  // Le grand disque gravé : son image se centre sur lui, et tourne avec lui
  discSpin = null;
  for (let i = 0; i < def.tiles.length; i++) {
    const t = def.tiles[i]!;
    if (t.look !== "disque" || !t.flow || t.flow.k !== "spin") continue;
    const ring = t.rings[0]!;
    const dcx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const dcz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const r = Math.max(...ring.map((p) => Math.hypot(p[0] - dcx, p[1] - dcz)));
    if (discMap)
      for (const tex of [discMap.map, discMap.normal]) {
        tex.repeat.set(1 / (r * 2), 1 / (r * 2));
        tex.center.set(dcx, dcz);
        tex.offset.set(0.5 - dcx, 0.5 - dcz);
      }
    discSpin = { w: t.flow.w };
  }

  for (const d of def.decos) {
    if (d.k === "porte") templeFront(c, g, m, d.at, base);
    else if (d.k === "riviere") riverUnderBridge(c, g, m, base, life, cuts, rng);
    else if (d.k === "chute") waterfall(c, g, m, base, life, d.at, d.s ?? 2);
    else if (d.k === "masque") sanctum(c, g, m, base, life, d.at);
  }

  // La poutre où pend la bûche : deux poteaux de bois de part et d'autre de l'allée
  for (const mv of def.movers) {
    if (mv.look !== "balancier" || mv.motion.k !== "swing") continue;
    const [px, py, pz] = mv.motion.c;
    let l = px;
    let r = px;
    while (l > px - 8 && onCourse(c, l - 0.05, pz, 0)) l -= 0.05;
    while (r < px + 8 && onCourse(c, r + 0.05, pz, 0)) r += 0.05;
    l -= 0.35;
    r += 0.35;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, r - l + 0.4, 12), m.bark);
    beam.rotation.z = Math.PI / 2;
    beam.position.set((l + r) / 2, py + 0.05, pz);
    g.add(beam);
    for (const x of [l, r]) {
      const postH = py + 0.25 - base;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, postH, 10), m.bark);
      pole.position.set(x, base + postH / 2, pz);
      g.add(pole);
    }
    for (const x of [px - 0.6, px + 0.6]) {
      const knot = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 14), m.rope);
      knot.rotation.y = Math.PI / 2;
      knot.position.set(x, py + 0.05, pz);
      g.add(knot);
    }
    shadows(g);
  }
  void dm;
}

/** La façade du temple derrière le parvis : un mur de grands blocs, la porte sombre, le linteau gravé, des lianes */
function templeFront(c: Course, g: THREE.Group, m: Mats, at: readonly [number, number], base: number) {
  const z = at[1] - 0.45;
  const H = 3.6;
  const door = 1.1;
  const front = new THREE.Group();
  for (const s of [-1, 1]) {
    const w = 6;
    const wall = new THREE.Mesh(boxMeters(w, H, 1.2), m.stone);
    wall.position.set(at[0] + s * (door + w / 2), base + H / 2, z - 0.6);
    front.add(wall);
    const jamb = new THREE.Mesh(boxMeters(0.5, 2.6, 1.4), m.carved);
    jamb.position.set(at[0] + s * (door + 0.25), base + 1.3, z - 0.5);
    front.add(jamb);
  }
  const lintel = new THREE.Mesh(boxMeters(door * 2 + 1.2, 0.7, 1.5), m.carved);
  lintel.position.set(at[0], base + 2.95, z - 0.55);
  const top = new THREE.Mesh(boxMeters(door * 2 + 0.2, H - 3.3, 1.2), m.stone);
  top.position.set(at[0], base + 3.3 + (H - 3.3) / 2, z - 0.6);
  const cornice = new THREE.Mesh(boxMeters(15, 0.35, 1.6), m.darkStone);
  cornice.position.set(at[0], base + H + 0.17, z - 0.55);
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(door * 2, 2.6), new THREE.MeshBasicMaterial({ color: 0x0b0906 }));
  dark.position.set(at[0], base + 1.3, z - 1.0);
  front.add(lintel, top, cornice, dark);
  // Un masque de pierre au-dessus de la porte
  const mask = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), m.carved);
  mask.position.set(at[0], base + 2.95, z + 0.21);
  front.add(mask);
  // Des lianes qui tombent du haut du mur
  const vines: THREE.BufferGeometry[] = [];
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 14; k++) {
    const x = at[0] - 7 + rnd() * 14;
    if (Math.abs(x - at[0]) < door + 0.1) continue;
    const drop = 1 + rnd() * 2.6;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, base + H + 0.3, z + 0.1),
      new THREE.Vector3(x + 0.1, base + H - drop * 0.5, z + 0.12),
      new THREE.Vector3(x - 0.05, base + H - drop, z + 0.1),
    ]);
    vines.push(new THREE.TubeGeometry(curve, 8, 0.025, 5, false));
  }
  if (vines.length) front.add(new THREE.Mesh(mergeGeometries(vines)!, decoMats!.liana));
  shadows(front);
  g.add(front);
  void c;
}

/** La rivière sous le pont de lianes : l'eau qui coule en contrebas, ses berges de terre, les garde-corps de corde */
function riverUnderBridge(
  c: Course,
  g: THREE.Group,
  m: Mats,
  base: number,
  life: Life,
  cuts: { x0: number; x1: number; z0: number; z1: number; kind: string }[],
  rng: () => number,
) {
  const cut = cuts.find((k) => k.kind === "riviere");
  if (!cut) return;
  const wy = base - 0.5;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(cut.x1 - cut.x0, cut.z1 - cut.z0 + 0.4), flowingWater(m.river, life, 0.25, 0));
  water.rotation.x = -Math.PI / 2;
  water.position.set((cut.x0 + cut.x1) / 2, wy, (cut.z0 + cut.z1) / 2);
  water.receiveShadow = true;
  g.add(water);
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(cut.x1 - cut.x0, cut.z1 - cut.z0 + 0.4),
    new THREE.MeshStandardMaterial({ color: 0x23301e, roughness: 1 }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set((cut.x0 + cut.x1) / 2, wy - 0.4, (cut.z0 + cut.z1) / 2);
  g.add(bed);
  // Les berges : des flancs de terre, des rochers au bord de l'eau
  for (const z of [cut.z0, cut.z1]) {
    const bank = new THREE.Mesh(planeMeters(cut.x1 - cut.x0, 1.2), decoMats!.mud);
    bank.position.set((cut.x0 + cut.x1) / 2, base - 0.6, z);
    bank.rotation.y = z === cut.z0 ? 0 : Math.PI;
    bank.receiveShadow = true;
    g.add(bank);
  }
  const rocks = new Scatter(leafyBall(1, 0.3, 21).scale(1, 0.6, 1), m.darkStone);
  for (let k = 0; k < 40; k++) {
    const x = cut.x0 + 50 + rng() * (cut.x1 - cut.x0 - 100);
    const z = rng() < 0.5 ? cut.z0 + 0.15 + rng() * 0.3 : cut.z1 - 0.15 - rng() * 0.3;
    if (onCourse(c, x, z, 0.5)) continue;
    rocks.add(x, wy + 0.02, z, 0.15 + rng() * 0.3, rng() * 6);
  }
  const rm = rocks.build();
  if (rm) g.add(rm);
  // Les garde-corps du pont : des poteaux, une main courante de corde qui pend entre eux, des cordes verticales
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const t of c.def.tiles) {
    if (t.look !== "pont") continue;
    for (const p of t.rings[0]!) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      z0 = Math.min(z0, p[1]);
      z1 = Math.max(z1, p[1]);
    }
  }
  if (!Number.isFinite(x0)) return;
  const n = Math.max(2, Math.round((z1 - z0) / 1.5));
  const ropes: THREE.BufferGeometry[] = [];
  const poles = new Scatter(new THREE.CylinderGeometry(0.045, 0.055, 1, 8).translate(0, 0.5, 0), m.bark);
  for (const x of [x0 - 0.07, x1 + 0.07]) {
    const tops: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const z = z0 + ((z1 - z0) * k) / n;
      const y = heightAt(c, (x0 + x1) / 2, Math.min(z1 - 0.01, Math.max(z0 + 0.01, z)));
      const h = 0.75;
      poles.add(x, y - 0.25, z, [1, h + 0.25, 1]);
      tops.push(new THREE.Vector3(x, y + h - 0.03, z));
    }
    // La main courante pend un peu entre deux poteaux
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      const a = tops[k]!;
      const e = tops[k + 1]!;
      for (let j = 0; j < 6; j++) {
        const s = j / 6;
        pts.push(
          a
            .clone()
            .lerp(e, s)
            .add(new THREE.Vector3(0, -Math.sin(s * Math.PI) * 0.12, 0)),
        );
      }
    }
    pts.push(tops[n]!);
    ropes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 12, 0.022, 6, false));
    // Les cordes verticales entre la main courante et le plancher
    for (let j = 0; j < pts.length; j += 2) {
      const p = pts[j]!;
      const y = heightAt(c, (x0 + x1) / 2, Math.min(z1 - 0.01, Math.max(z0 + 0.01, p.z)));
      const len = p.y - y;
      if (len < 0.1) continue;
      const v = new THREE.CylinderGeometry(0.008, 0.008, len, 4);
      v.translate(p.x, y + len / 2, p.z);
      ropes.push(v);
    }
  }
  const merged = mergeGeometries(
    ropes.map((r) => {
      const flat = r.index ? r.toNonIndexed() : r;
      flat.deleteAttribute("uv");
      return flat;
    }),
  );
  if (merged) {
    const mesh = new THREE.Mesh(merged, m.rope);
    mesh.castShadow = true;
    g.add(mesh);
  }
  const pm = poles.build();
  if (pm) g.add(pm);
}

/** Le gué : l'eau qui coule sur les galets ; en amont, l'eau tombe de la gueule d'un jaguar de pierre ; en aval, la chute */
function waterfall(c: Course, g: THREE.Group, m: Mats, base: number, life: Life, at: readonly [number, number], width: number) {
  const half = width / 2;
  const z0 = at[1] - half;
  const z1 = at[1] + half;
  const sgn = at[0] >= 0 ? 1 : -1;
  // L'eau peu profonde au-dessus du gué (sur la piste), qui file vers la chute
  let fx0 = Infinity;
  let fx1 = -Infinity;
  for (const t of c.def.tiles) {
    if (t.look !== "gue") continue;
    for (const p of t.rings[0]!) {
      fx0 = Math.min(fx0, p[0]);
      fx1 = Math.max(fx1, p[0]);
    }
  }
  if (Number.isFinite(fx0)) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(fx1 - fx0, width), flowingWater(m.ford, life, 0.5 * sgn, 0));
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set((fx0 + fx1) / 2, 0.028, at[1]);
    sheet.renderOrder = 2;
    g.add(sheet);
  }
  // La gorge : ses parois de roche, la chute, le bassin en bas, l'écume et la brume
  const deep = base - 3.2;
  const xa = at[0] + sgn * 0.02;
  const far = xa + sgn * 70;
  for (const z of [z0, z1]) {
    const wall = new THREE.Mesh(planeMeters(70, base - deep + 0.4), m.darkStone);
    wall.position.set((xa + far) / 2, (base + deep) / 2, z);
    wall.rotation.y = z === z0 ? 0 : Math.PI;
    wall.receiveShadow = true;
    g.add(wall);
  }
  const face = new THREE.Mesh(planeMeters(width, base - deep + 0.2), m.darkStone);
  face.position.set(xa, (base + deep) / 2, at[1]);
  face.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
  g.add(face);
  const streaks = canvasTex(
    64,
    (gg, s) => {
      gg.fillStyle = "rgba(230,245,240,0.55)";
      gg.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 2) {
        gg.fillStyle = `rgba(255,255,255,${0.2 + ((x * 37) % 11) / 16})`;
        gg.fillRect(x, 0, 1, s);
      }
    },
    true,
  );
  streaks.repeat.set(3, 1);
  const fallMat = new THREE.MeshStandardMaterial({
    map: streaks,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  life.flows.push({ tex: streaks, u: 0, v: -1.4 });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.98, 0.03 - deep), fallMat);
  fall.position.set(xa + sgn * 0.08, (0.03 + deep) / 2, at[1]);
  fall.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
  g.add(fall);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(70, width + 0.2), flowingWater(m.river, life, 0.3 * sgn, 0));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set((xa + far) / 2, deep, at[1]);
  g.add(pool);
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.8 });
  for (let k = 0; k < 7; k++) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), foamMat);
    blob.scale.y = 0.35;
    blob.position.set(xa + sgn * (0.4 + (k % 3) * 0.35), deep + 0.05, z0 + 0.2 + (k / 6) * (width - 0.4));
    life.foam.push({ o: blob, ph: k * 1.3 });
    g.add(blob);
  }
  // En amont : la tête de jaguar sculptée dans un bloc, l'eau qui sort de sa gueule et tombe dans le gué
  const up = fx0 - sgn * 0.02;
  const upX = sgn > 0 ? Math.min(up, fx0) : Math.max(up, fx1);
  const blockX = (sgn > 0 ? fx0 : fx1) - sgn * 0.85;
  const block = new THREE.Mesh(boxMeters(1.5, 1.9, width + 1.4), m.carved);
  block.position.set(blockX, base + 0.95, at[1]);
  g.add(block);
  const head = new THREE.Group();
  const muzzle = new THREE.Mesh(boxMeters(0.55, 0.5, 0.9), m.stone);
  muzzle.position.set(0, 0, 0);
  const brow = new THREE.Mesh(boxMeters(0.4, 0.18, 1.1), m.darkStone);
  brow.position.set(-0.05, 0.4, 0);
  head.add(muzzle, brow);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), m.jade);
    eye.position.set(0.16, 0.3, s * 0.27);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.25, 4), m.stone);
    ear.position.set(-0.1, 0.62, s * 0.38);
    head.add(eye, ear);
  }
  head.position.set(blockX + sgn * 0.85, base + 1.05, at[1]);
  if (sgn < 0) head.rotation.y = Math.PI;
  g.add(head);
  const spoutH = base + 0.85 - 0.03;
  const pour = new THREE.Mesh(new THREE.PlaneGeometry(0.55, spoutH), fallMat);
  pour.position.set(upX - sgn * 0.08, 0.03 + spoutH / 2, at[1]);
  pour.rotation.y = Math.PI / 2;
  g.add(pour);
  for (let k = 0; k < 3; k++) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), foamMat);
    blob.scale.y = 0.3;
    blob.position.set(upX + sgn * 0.12, 0.04, at[1] - 0.18 + k * 0.18);
    life.foam.push({ o: blob, ph: k * 2.1 });
    g.add(blob);
  }
  shadows(block);
  shadows(head);
}

/** Le sanctuaire : les murs en ruine autour de la salle, les braseros derrière l'autel, le masque d'or */
function sanctum(c: Course, g: THREE.Group, m: Mats, base: number, life: Life, at: readonly [number, number]) {
  // Le masque d'or, posé sur l'autel, tourné vers le départ
  let top = 0;
  for (const w of c.def.walls) if (w.look === "autel") top = Math.max(top, heightAt(c, at[0], at[1] + 0.8) + w.h);
  const mask = new THREE.Group();
  const stand = new THREE.Mesh(boxMeters(0.3, 0.32, 0.22), m.darkStone);
  stand.position.y = 0.16;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 32), m.gold);
  face.rotation.x = Math.PI / 2;
  face.position.y = 0.66;
  mask.add(stand, face);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), m.gold);
    ray.position.set(Math.cos(a) * 0.43, 0.66 + Math.sin(a) * 0.43, 0);
    ray.rotation.z = a - Math.PI / 2;
    mask.add(ray);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.06), m.gold);
  brow.position.set(0, 0.78, 0.05);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), m.gold);
  nose.position.set(0, 0.64, 0.06);
  nose.rotation.x = Math.PI;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), m.gold);
  mouth.position.set(0, 0.52, 0.05);
  mask.add(brow, nose, mouth);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), m.jade);
    eye.scale.set(1.4, 0.8, 0.6);
    eye.position.set(s * 0.12, 0.71, 0.04);
    mask.add(eye);
  }
  mask.position.set(at[0], top, at[1]);
  shadows(mask);
  g.add(mask);

  // Les murs en ruine autour de la salle, hors de la piste
  const hall = tileAt(c, at[0], at[1] + 1);
  if (hall >= 0) {
    const { x0, x1, z0, z1 } = c.tiles[hall]!.box;
    const ruins = new THREE.Group();
    const segs: [number, number, number, number][] = [
      [x0 - 0.5, z0 - 0.4, x0 - 0.5, z1],
      [x1 + 0.5, z0 - 0.4, x1 + 0.5, z1],
      [x0 - 0.5, z0 - 0.5, x1 + 0.5, z0 - 0.5],
    ];
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [ax, az, bx, bz] of segs) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.ceil(len / 1.2);
      for (let k = 0; k < n; k++) {
        const s = (k + 0.5) / n;
        const h = 0.9 + rnd() * 1.4;
        const blk = new THREE.Mesh(boxMeters(len / n - 0.04, h, 0.7), rnd() < 0.3 ? m.carved : m.stone);
        blk.position.set(ax + (bx - ax) * s, base + h / 2, az + (bz - az) * s);
        blk.rotation.y = -Math.atan2(bz - az, bx - ax);
        ruins.add(blk);
      }
    }
    shadows(ruins);
    g.add(ruins);
    // Les braseros derrière l'autel, leurs flammes
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xffb040,
      emissive: 0xff7a10,
      emissiveIntensity: 2.4,
      transparent: true,
      opacity: 0.9,
    });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xfff0a0, emissive: 0xffe060, emissiveIntensity: 3 });
    for (const s of [-1, 1]) {
      const bx = at[0] + s * 1.35;
      const bz = z0 - 0.26;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.0, 12), m.darkStone);
      pillar.position.set(bx, base + 1.0, bz);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.22, 16), m.gold);
      bowl.position.set(bx, base + 2.1, bz);
      const flame = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), flameMat);
      outer.position.y = 0.3;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 10), coreMat);
      inner.position.y = 0.17;
      flame.add(outer, inner);
      flame.position.set(bx, base + 2.2, bz);
      life.flames.push({ o: flame, ph: s * 2 });
      shadows(pillar);
      g.add(pillar, bowl, flame);
    }
  }
  void life;
}
