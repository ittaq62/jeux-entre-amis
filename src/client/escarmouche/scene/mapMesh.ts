// Une carte en trois dimensions : ses boîtes fondues en un seul maillage par matière (peu d'appels de dessin, même au
// téléphone), puis le décor : toits, clochers, arbres, voies ferrées, lampadaires, citernes.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Decor, GameMap } from "../../../shared/games/escarmouche/maps.ts";
import type { Box, Mat } from "../../../shared/games/escarmouche/world.ts";
import { addContainer, addCrane, addHouse, addQuay, addWagon, instancedParts, type Ctx, type Paint } from "./architecture.ts";
import { addBox, addChamferBox, addCrate, addRock, Bucket, pushFace, tintOf } from "./geom.ts";
import type { Quality } from "./quality.ts";
import { boardTexture, clothTexture, corrugatedTexture, matTexture, normalFrom, normalTexture, TILE } from "./textures.ts";
import { smokeTexture } from "./effects.ts";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/** Les teintes de base : elles colorent la toile (et la remplacent quand il n'y en a pas) */
const TINT: Partial<Record<Mat, string>> = {
  invisible: "#000000",
};

/** Comment chaque matière prend la lumière : sa rugosité, son éclat de métal, la force de son relief */
const LOOK: Partial<Record<Mat, { rough: number; metal?: number; bump: number }>> = {
  pierre: { rough: 0.92, bump: 1.6 },
  sable: { rough: 1, bump: 0.9 },
  ocre: { rough: 0.95, bump: 0.8 },
  brique: { rough: 0.9, bump: 1.6 },
  roche: { rough: 0.94, bump: 1.9 },
  crepi: { rough: 0.96, bump: 0.7 },
  crepi2: { rough: 0.96, bump: 0.7 },
  bois: { rough: 0.82, bump: 1.1 },
  neige: { rough: 0.88, bump: 0.45 },
  glace: { rough: 0.1, metal: 0.15, bump: 0.15 },
  planche: { rough: 0.8, bump: 1.0 },
  tuile: { rough: 0.72, bump: 1.4 },
  beton: { rough: 0.9, bump: 0.6 },
  // La tôle peinte : un éclat mat, sans miroir (au ras d'un toit, le ciel s'y reflétait en une ligne blanche)
  metal: { rough: 0.62, metal: 0.42, bump: 0.6 },
  rouille: { rough: 0.85, metal: 0.25, bump: 1.2 },
  wagon: { rough: 0.68, metal: 0.2, bump: 0.7 },
  wagon2: { rough: 0.68, metal: 0.2, bump: 0.7 },
  gravier: { rough: 1, bump: 1.8 },
  pave: { rough: 0.86, bump: 1.9 },
  herbe: { rough: 1, bump: 0.9 },
  terre: { rough: 1, bump: 1.0 },
  sol: { rough: 1, bump: 1.0 },
  foin: { rough: 1, bump: 1.2 },
  caisse: { rough: 0.85, bump: 1.0 },
};

/**
 * Les sols et les murs qui couvrent de grandes surfaces : leur dessin se répète tous les quelques mètres, et l'œil le voit
 * de loin. Des taches plus claires ou plus sombres, larges de plusieurs mètres, les cassent (la force de l'effet).
 */
const MACRO: Partial<Record<Mat, number>> = {
  sable: 0.3,
  ocre: 0.18,
  brique: 0.14,
  roche: 0.22,
  pave: 0.3,
  sol: 0.3,
  terre: 0.3,
  herbe: 0.32,
  gravier: 0.26,
  beton: 0.24,
  neige: 0.12,
  pierre: 0.16,
  crepi: 0.16,
  crepi2: 0.16,
};

/** Ajoute à une matière ses taches à grande échelle, d'après la position dans le monde (le même endroit, la même tache) */
/** Le sol mouillé (de 0, sec, à 1, sous la bruine) : partagé par toutes les matières, réglé par la scène selon le temps */
const WET = { value: 0 };
export function setWetness(k: number) {
  WET.value = k;
}

function macroVariation(mat: THREE.MeshStandardMaterial, strength: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.macroK = { value: strength };
    shader.uniforms.wetK = WET;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vMacro;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vMacro = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vMacro;
uniform float macroK;
uniform float wetK;
float macroHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float macroNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(macroHash(i), macroHash(i + vec2(1.0, 0.0)), u.x), mix(macroHash(i + vec2(0.0, 1.0)), macroHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  vec2 mp = vMacro.xz + vec2(vMacro.y * 0.37, -vMacro.y * 0.21);
  float mn = macroNoise(mp * 0.055) * 0.6 + macroNoise(mp * 0.19 + 7.3) * 0.3 + macroNoise(mp * 0.7 + 3.1) * 0.1;
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb *= 1.0 + (mn - 0.5) * 2.0 * macroK;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), (0.5 - mn) * macroK * 0.6);
}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
// Mouillé : ce qui regarde le ciel s'assombrit et brille, plus encore par plaques (là où l'eau s'attarde)
if (wetK > 0.0) {
  float wetUp = smoothstep(0.55, 0.92, (vec4(normal, 0.0) * viewMatrix).y);
  float pool = smoothstep(0.38, 0.68, macroNoise(vMacro.xz * 0.11 + 11.0));
  float w = wetUp * wetK * (0.5 + 0.5 * pool);
  roughnessFactor = mix(roughnessFactor, 0.14, w);
  diffuseColor.rgb *= 1.0 - 0.3 * w;
}`,
      );
  };
  mat.customProgramCacheKey = () => `macro:${strength}`;
}

const materials = new Map<string, THREE.Material>();
export function matMaterial(m: Mat, q: Quality, vertexColors = true): THREE.Material {
  const key = `${m}:${q}:${vertexColors}`;
  const known = materials.get(key);
  if (known) return known;
  const size = q === "bas" ? 128 : 256;
  const tex = matTexture(m, size);
  let mat: THREE.Material;
  if (q === "bas") mat = new THREE.MeshLambertMaterial({ map: tex ?? undefined, color: TINT[m] ?? "#ffffff", vertexColors });
  else {
    const look = LOOK[m] ?? { rough: 0.9, bump: 0.8 };
    const std = new THREE.MeshStandardMaterial({
      map: tex ?? undefined,
      normalMap: normalTexture(m, size, look.bump) ?? undefined,
      color: TINT[m] ?? "#ffffff",
      roughness: look.rough,
      metalness: look.metal ?? 0,
      vertexColors,
    });
    if (MACRO[m]) macroVariation(std, MACRO[m]!);
    mat = std;
  }
  materials.set(key, mat);
  return mat;
}

/** Les pièces d'habillage : la pierre de taille, le fer, les planches peintes des volets et des portes */
export function paintMaterial(k: Paint, q: Quality): THREE.Material {
  if (!k.startsWith("volet:") && !k.startsWith("cont:") && k !== "taille" && k !== "fer" && k !== "lumiere")
    return matMaterial(k as Mat, q);
  const key = `${k}:${q}`;
  const known = materials.get(key);
  if (known) return known;
  const low = q === "bas";
  let mat: THREE.Material;
  if (k === "lumiere")
    // Une vitre allumée, la nuit : une lumière chaude derrière un rideau
    mat = new THREE.MeshStandardMaterial({ color: "#3a2410", emissive: "#ffb35c", emissiveIntensity: low ? 1.1 : 1.7, roughness: 0.5 });
  else if (k === "fer")
    mat = low
      ? new THREE.MeshLambertMaterial({ color: "#3a3734", vertexColors: true })
      : new THREE.MeshStandardMaterial({ color: "#3d3a36", roughness: 0.55, metalness: 0.55, vertexColors: true });
  else if (k === "taille") {
    const tex = matTexture("crepi2", low ? 128 : 256);
    mat = low
      ? new THREE.MeshLambertMaterial({ map: tex ?? undefined, color: "#f4ecdc", vertexColors: true })
      : new THREE.MeshStandardMaterial({
          map: tex ?? undefined,
          normalMap: normalTexture("crepi2", 256, 0.9) ?? undefined,
          color: "#f6eedf",
          roughness: 0.9,
          vertexColors: true,
        });
  } else if (k.startsWith("cont:")) {
    // La tôle ondulée d'un conteneur, peinte à sa couleur
    const color = k.slice("cont:".length);
    const tex = corrugatedTexture();
    mat = low
      ? new THREE.MeshLambertMaterial({ map: tex, color, vertexColors: true })
      : new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: normalFrom(tex, "normal:tole", 2.4),
          color,
          roughness: 0.62,
          metalness: 0.35,
          vertexColors: true,
        });
  } else {
    const color = k.slice("volet:".length);
    const tex = boardTexture(128);
    mat = low
      ? new THREE.MeshLambertMaterial({ map: tex, color, vertexColors: true })
      : new THREE.MeshStandardMaterial({
          map: tex,
          normalMap: normalFrom(tex, "normal:board", 1.2),
          color,
          roughness: 0.78,
          vertexColors: true,
        });
  }
  materials.set(key, mat);
  return mat;
}

export interface MapMesh {
  group: THREE.Group;
  /** Ce qui bouge avec le temps : les vaguelettes de la mer */
  update(t: number): void;
  dispose(): void;
}

/** Les matières dont les blocs isolés et les poteaux prennent des arêtes chanfreinées */
const CHAMFER = new Set<Mat>(["pierre", "crepi", "crepi2", "bois", "planche", "beton", "metal", "rouille", "ocre", "brique", "roche"]);
/** Les matières qui reçoivent de la neige sur le dessus, au col */
const SNOWY = new Set<Mat>(["pierre", "crepi", "crepi2", "bois", "planche", "beton", "metal", "rouille", "tuile", "wagon", "wagon2"]);

/** Deux boîtes qui se touchent par une face (pas seulement par une arête) */
function touching(a: Box, b: Box): boolean {
  const E = 0.02;
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  if (ox < -E || oy < -E || oz < -E) return false;
  return (ox > E ? 1 : 0) + (oy > E ? 1 : 0) + (oz > E ? 1 : 0) >= 2;
}

/** Un petit hasard toujours le même pour une même boîte */
function seeded(seed: number) {
  let v = (seed * 2654435761) >>> 0 || 1;
  return () => {
    v ^= v << 13;
    v ^= v >>> 17;
    v ^= v << 5;
    return (v >>> 0) / 4294967296;
  };
}

/**
 * Ce qui casse les formes de boîte, sans rien changer aux collisions : un chaperon sur les murets, la neige sur ce qui
 * est à plat au col, le sommet ébréché des murs en ruine (des pierres posées de travers).
 */
function addDetails(
  gm: GameMap,
  bucket: (m: Paint) => Bucket,
  isGround: (b: Box) => boolean,
  covered: (b: Box) => boolean,
  rocks: Set<Box>,
) {
  const snow = gm.light === "neige";
  gm.boxes.forEach((bx, i) => {
    if (isGround(bx) || bx.m === "invisible" || covered(bx) || rocks.has(bx)) return;
    const w = bx.x1 - bx.x0;
    const h = bx.y1 - bx.y0;
    const d = bx.z1 - bx.z0;
    const tile = TILE[bx.m] ?? 3;
    const rnd = seeded(i + 17);
    const thin = Math.min(w, d);
    const long = Math.max(w, d);
    // Le muret : une pierre de chaperon qui déborde un peu
    const muret =
      bx.y0 <= 0.01 &&
      h >= 0.5 &&
      h <= 1.6 &&
      thin <= 0.8 &&
      long >= 1.5 &&
      (bx.m === "pierre" || bx.m === "crepi" || bx.m === "crepi2" || bx.m === "beton" || bx.m === "ocre" || bx.m === "brique");
    if (muret)
      addChamferBox(
        bucket(bx.m),
        bx.x0 - 0.05,
        bx.y1 - 0.06,
        bx.z0 - 0.05,
        bx.x1 + 0.05,
        bx.y1 + 0.05,
        bx.z1 + 0.05,
        tile,
        tintOf(i) * 1.12,
        0.025,
        false,
      );
    const capTop = muret ? bx.y1 + 0.05 : bx.y1;
    // Le mur en ruine du col : son sommet n'est pas droit, des pierres y restent posées, la neige par-dessus
    if (snow && bx.m === "pierre" && h >= 1.6 && thin <= 1.2 && long >= 1.2) {
      const alongX = w >= d;
      for (let u = 0.12; u < long - 0.25;) {
        const len = 0.25 + rnd() * 0.3;
        if (rnd() > 0.4) {
          const rise = 0.08 + rnd() * 0.18;
          const inset = 0.02 + rnd() * 0.03;
          const a0 = (alongX ? bx.x0 : bx.z0) + u;
          const a1 = Math.min(a0 + len, (alongX ? bx.x1 : bx.z1) - 0.08);
          const tone = tintOf(i) * (0.94 + rnd() * 0.1);
          const top = bx.y1 + 0.04 + rise;
          const [sx0, sz0, sx1, sz1] = alongX ? [a0, bx.z0 + inset, a1, bx.z1 - inset] : [bx.x0 + inset, a0, bx.x1 - inset, a1];
          addChamferBox(bucket("pierre"), sx0, bx.y1 - 0.05, sz0, sx1, top, sz1, tile, tone, 0.03, false);
          addChamferBox(
            bucket("neige"),
            sx0 - 0.015,
            top - 0.02,
            sz0 - 0.015,
            sx1 + 0.015,
            top + 0.045,
            sz1 + 0.015,
            TILE.neige ?? 3,
            1,
            0.025,
            false,
          );
        }
        u += len + 0.03;
      }
    }
    // La neige : une couche arrondie sur tout ce qui est à plat et à découvert (rien au-dessus)
    if (snow && SNOWY.has(bx.m) && h > 0.25) {
      const above = gm.boxes.some(
        (o) => o !== bx && o.y0 >= bx.y1 - 0.05 && o.y0 <= bx.y1 + 0.3 && o.x0 < bx.x1 && o.x1 > bx.x0 && o.z0 < bx.z1 && o.z1 > bx.z0,
      );
      if (!above) {
        const o = muret ? 0.07 : 0.03;
        const depth = 0.05 + Math.min(0.07, thin * 0.04);
        addChamferBox(
          bucket("neige"),
          bx.x0 - o,
          capTop - 0.03,
          bx.z0 - o,
          bx.x1 + o,
          capTop + depth,
          bx.z1 + o,
          TILE.neige ?? 3,
          1,
          Math.min(0.045, depth * 0.6),
          false,
        );
      }
    }
  });
}

/** La carte entière : boîtes, toits et décor */
export function buildMap(gm: GameMap, q: Quality, night = false): MapMesh {
  const group = new THREE.Group();
  const buckets = new Map<Paint, Bucket>();
  const bucket = (m: Paint) => {
    let b = buckets.get(m);
    if (!b) {
      b = new Bucket();
      buckets.set(m, b);
    }
    return b;
  };
  const bags: THREE.Box3[] = [];
  const bales: THREE.Box3[] = [];
  const isGround = (b: Box) => b.y1 <= 0.001 && b.y0 < -0.5;
  // Ce qui est sous un toit ou fait partie d'une maison : on n'y touche pas (les murs se raccordent entre eux)
  const roofs = gm.decor.filter((d): d is Extract<Decor, { k: "house" | "roof" }> => d.k === "house" || d.k === "roof");
  const covered = (b: Box) => {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    return roofs.some((r) => cx > r.x0 - 0.4 && cx < r.x1 + 0.4 && cz > r.z0 - 0.4 && cz < r.z1 + 0.4);
  };
  // Les blocs posés seuls (qui ne touchent aucune autre boîte) et les poteaux : arêtes chanfreinées (sauf au téléphone)
  const solids = gm.boxes.filter((b) => !isGround(b) && b.m !== "invisible");
  const chamfered = (bx: Box) => {
    if (q === "bas" || !CHAMFER.has(bx.m)) return false;
    const w = bx.x1 - bx.x0;
    const d = bx.z1 - bx.z0;
    if (w <= 0.75 && d <= 0.75 && bx.y1 - bx.y0 >= 1.8) return true;
    return !covered(bx) && !solids.some((o) => o !== bx && touching(o, bx));
  };
  // Les rochers du col (des blocs de pierre trapus, posés seuls) : une vraie roche facettée, la neige sur le dessus
  // (et les gravats de la ville en ruines : des blocs de béton éboulés, sans neige)
  const rockMat: Mat | null = gm.light === "neige" ? "pierre" : gm.id === "ruines" ? "beton" : gm.id === "carriere" ? "roche" : null;
  const rocks = new Set<Box>(
    !rockMat
      ? []
      : solids.filter((b) => {
          const w = b.x1 - b.x0;
          const d = b.z1 - b.z0;
          const h = b.y1 - b.y0;
          const small =
            rockMat === "pierre" ? Math.min(w, d) >= 0.9 && h <= 2.6 : Math.min(w, d) >= 0.5 && h <= (rockMat === "roche" ? 1.8 : 1.5);
          if (b.m !== rockMat || covered(b) || !small || Math.max(w, d) / Math.min(w, d) > 2.4) return false;
          return !solids.some((o) => o !== b && o.m !== rockMat && touching(o, b));
        }),
  );
  gm.boxes.forEach((bx, i) => {
    if (bx.m === "invisible" || bx.m === "bidon" || bx.m === "conteneur" || bx.m === "caisse" || bx.m === "decor") return;
    if (rocks.has(bx)) {
      const snowy = gm.light === "neige";
      addRock(
        bucket(bx.m),
        snowy ? bucket("neige") : null,
        bx.x0,
        bx.y0,
        bx.z0,
        bx.x1,
        bx.y1,
        bx.z1,
        TILE[bx.m] ?? 3,
        tintOf(i),
        i,
        bx.y0 <= 0.001,
      );
      return;
    }
    // Les congères : de la neige amoncelée, arrondie (pas un bloc)
    if (bx.m === "neige" && bx.y0 >= -0.01 && bx.y1 - bx.y0 < 1.4) {
      const w = bx.x1 - bx.x0;
      const h = bx.y1 - bx.y0;
      const d = bx.z1 - bx.z0;
      const mound = new THREE.Mesh(
        new RoundedBoxGeometry(w + 0.2, h + 0.25, d + 0.2, q === "bas" ? 2 : 4, Math.min(h * 0.6, w / 2, d / 2) + 0.1),
        matMaterial("neige", q, false),
      );
      mound.position.set((bx.x0 + bx.x1) / 2, bx.y0 + h / 2 - 0.12, (bx.z0 + bx.z1) / 2);
      mound.castShadow = true;
      mound.receiveShadow = true;
      group.add(mound);
      return;
    }
    // Les sacs de sable et les bottes de foin ont leur propre forme
    if (bx.m === "sacs" || bx.m === "foin") {
      (bx.m === "sacs" ? bags : bales).push(new THREE.Box3(new THREE.Vector3(bx.x0, bx.y0, bx.z0), new THREE.Vector3(bx.x1, bx.y1, bx.z1)));
      return;
    }
    // Le sol n'a qu'une face, celle du dessus
    if (bx.y1 <= 0.001 && bx.y0 < -0.5) {
      const b = bucket(bx.m);
      const t = 1 / (TILE[bx.m] ?? 3);
      const p = [
        [bx.x0, 0, bx.z1],
        [bx.x1, 0, bx.z1],
        [bx.x1, 0, bx.z0],
        [bx.x0, 0, bx.z0],
      ];
      pushFace(
        b,
        p,
        [0, 1, 0],
        p.map((q) => [q[0]! * t, -q[2]! * t]),
        p.map(() => [1, 1, 1]),
      );
      return;
    }
    // Les petites caisses en bois (empilées ou non) : un vrai cadre en relief
    const cw = bx.x1 - bx.x0;
    const ch = bx.y1 - bx.y0;
    const cd = bx.z1 - bx.z0;
    if (q !== "bas" && bx.m === "bois" && !covered(bx) && Math.min(cw, ch, cd) >= 0.5 && Math.max(cw, ch, cd) <= 1.8) {
      addCrate(bucket(bx.m), bx.x0, bx.y0, bx.z0, bx.x1, bx.y1, bx.z1, TILE[bx.m] ?? 3, tintOf(i), bx.y0 <= 0.001);
      return;
    }
    if (chamfered(bx)) {
      const e = Math.min(0.06, 0.12 * Math.min(bx.x1 - bx.x0, bx.y1 - bx.y0, bx.z1 - bx.z0));
      addChamferBox(bucket(bx.m), bx.x0, bx.y0, bx.z0, bx.x1, bx.y1, bx.z1, TILE[bx.m] ?? 3, tintOf(i), e, bx.y0 <= 0.001);
    } else addBox(bucket(bx.m), bx.x0, bx.y0, bx.z0, bx.x1, bx.y1, bx.z1, TILE[bx.m] ?? 3, tintOf(i), bx.y0 <= 0.001);
  });
  if (q !== "bas") addDetails(gm, bucket, isGround, covered, rocks);
  const parts = new Map<"wheel" | "buffer", THREE.Matrix4[]>([
    ["wheel", []],
    ["buffer", []],
  ]);
  const ctx: Ctx = { bucket, group, low: q === "bas", night, instance: (kind, m) => parts.get(kind)!.push(m.clone()) };
  for (const d of gm.decor) addDecor(d, ctx, q);
  const smoke = chimneys(
    gm.decor.filter((d): d is Extract<Decor, { k: "chimney" }> => d.k === "chimney"),
    group,
    q,
  );
  instancedParts(parts, q === "bas", group);
  if (bags.length > 0) group.add(sandbagMesh(bags, q));
  if (bales.length > 0) group.add(baleMesh(bales, q));
  for (const [m, b] of buckets) {
    if (b.pos.length === 0) continue;
    const mesh = new THREE.Mesh(b.geometry(), paintMaterial(m, q));
    mesh.receiveShadow = true;
    mesh.castShadow = m !== "sol" && m !== "pave" && m !== "gravier";
    group.add(mesh);
  }
  return {
    group,
    update(t: number) {
      smoke(t);
      const n = (seaMaterial as THREE.MeshStandardMaterial).normalMap;
      if (n) n.offset.set(t * 0.012, t * 0.007);
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
    },
  };
}

/**
 * Les caisses en bois de la carte, chacune son maillage (elle peut voler en éclats), et ce qui en reste : quelques
 * planches éparpillées au sol, cachées tant qu'elle tient debout
 */
export function buildCrates(gm: GameMap, q: Quality): Map<number, { whole: THREE.Mesh; wreck: THREE.Group }> {
  const out = new Map<number, { whole: THREE.Mesh; wreck: THREE.Group }>();
  const mat = paintMaterial("caisse", q);
  const plank = paintMaterial("planche", q);
  gm.boxes.forEach((bx, i) => {
    if (bx.m !== "caisse") return;
    const b = new Bucket();
    if (q === "bas") addBox(b, bx.x0, bx.y0, bx.z0, bx.x1, bx.y1, bx.z1, TILE.caisse ?? 3, tintOf(i), bx.y0 <= 0.001);
    else addCrate(b, bx.x0, bx.y0, bx.z0, bx.x1, bx.y1, bx.z1, TILE.caisse ?? 3, tintOf(i), bx.y0 <= 0.001);
    const whole = new THREE.Mesh(b.geometry(), mat);
    whole.castShadow = true;
    whole.receiveShadow = true;
    const wreck = new THREE.Group();
    // Toujours le même désordre pour la même caisse
    let seed = i * 9301 + 49297;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const w = bx.x1 - bx.x0;
    const d = bx.z1 - bx.z0;
    const floor = bx.y0 <= 0.001 ? 0 : bx.y0;
    for (let k = 0; k < 6; k++) {
      const len = 0.5 + rnd() * 0.7;
      const pb = new Bucket();
      addBox(pb, -len / 2, 0, -0.07, len / 2, 0.035, 0.07, 1.5, tintOf(i + k), false);
      const piece = new THREE.Mesh(pb.geometry(), k % 3 === 0 ? mat : plank);
      piece.position.set(bx.x0 + w * (0.1 + rnd() * 0.8), floor + 0.02 + k * 0.012, bx.z0 + d * (0.1 + rnd() * 0.8));
      piece.rotation.set((rnd() - 0.5) * 0.25, rnd() * Math.PI, (rnd() - 0.5) * 0.25);
      piece.castShadow = q !== "bas";
      wreck.add(piece);
    }
    wreck.visible = false;
    out.set(i, { whole, wreck });
  });
  return out;
}

const leafMats = new Map<string, THREE.Material>();
function leafMaterial(q: Quality): THREE.Material {
  let m = leafMats.get(q);
  if (!m) {
    m =
      q === "bas"
        ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    leafMats.set(q, m);
  }
  return m;
}
const barkMats = new Map<string, THREE.Material>();
function barkMaterial(q: Quality): THREE.Material {
  let m = barkMats.get(q);
  if (!m) {
    const tex = matTexture("bois", 128)!.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, 3);
    m =
      q === "bas"
        ? new THREE.MeshLambertMaterial({ map: tex, color: "#8a7a68" })
        : new THREE.MeshStandardMaterial({
            map: tex,
            color: "#8a7a68",
            roughness: 0.95,
            normalMap: normalTexture("bois", 128, 1.4) ?? undefined,
          });
    barkMats.set(q, m);
  }
  return m;
}
const LEAVES = ["#3f5226", "#4b5f2b", "#55682f", "#36461f", "#5f6f33"];
const BRANCH = new THREE.Color("#4a3a2c");

/** Un arbre : son tronc rond (il cache le pied carré qui arrête les balles), trois branches, sept grappes de feuilles */
/** Un sapin sous la neige : son tronc, des étages de branches en cônes, la neige posée sur chacun */
function pine(d: Extract<Decor, { k: "pine" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const trunkH = d.h * 0.35;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, trunkH, low ? 6 : 8), barkMaterial(q));
  trunk.position.set(d.x, trunkH / 2, d.z);
  trunk.castShadow = true;
  group.add(trunk);
  const parts: THREE.BufferGeometry[] = [];
  const green = new THREE.Color("#25402c");
  const dark = new THREE.Color("#1a2e20");
  const white = new THREE.Color("#eef3f6");
  const tiers = low ? 3 : 4;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const r = d.r * (1 - t * 0.7);
    const h = d.h * 0.36;
    const g = new THREE.ConeGeometry(r, h, low ? 7 : 11, 2);
    const y = trunkH * 0.7 + k * d.h * 0.17 + h / 2;
    g.translate(d.x, y, d.z);
    g.rotateY(0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      // La neige sur le haut de chaque étage et au bout des branches, plus sombre dessous
      const ly = (pos.getY(i) - (y - h / 2)) / h;
      const edge = Math.sin(pos.getX(i) * 9.1 + pos.getZ(i) * 7.3 + k) * 0.5 + 0.5;
      c.copy(ly < 0.15 ? dark : green);
      if (ly > 0.35 + edge * 0.3) c.lerp(white, 0.85);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) return;
  merged.computeVertexNormals();
  const crown = new THREE.Mesh(
    merged,
    low
      ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
  );
  crown.castShadow = true;
  crown.receiveShadow = q === "haut";
  group.add(crown);
}

function tree(d: Extract<Decor, { k: "tree" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const trunkH = d.h * 0.62;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, trunkH, low ? 6 : 10), barkMaterial(q));
  trunk.position.set(d.x, trunkH / 2, d.z);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);
  let seed = Math.abs(Math.round(d.x * 73 + d.z * 31)) + 1;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + r();
    const len = d.r * 0.75;
    const g = new THREE.CylinderGeometry(0.07, 0.13, len, 5);
    g.translate(0, len / 2, 0);
    g.rotateZ(-0.9);
    g.rotateY(a);
    g.translate(d.x, trunkH * (0.75 + k * 0.08), d.z);
    // Le brun de l'écorce (en couleur linéaire : un gris à 0,32 sortait presque blanc)
    const col = new Float32Array(g.attributes.position!.count * 3);
    for (let i = 0; i < col.length; i += 3) {
      col[i] = BRANCH.r;
      col[i + 1] = BRANCH.g;
      col[i + 2] = BRANCH.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const clusters = low ? 4 : 7;
  for (let k = 0; k < clusters; k++) {
    const a = r() * Math.PI * 2;
    const rad = k === 0 ? 0 : d.r * (0.35 + r() * 0.35);
    const y = d.h * (0.62 + r() * 0.3) + (k === 0 ? d.h * 0.12 : 0);
    const size = d.r * (k === 0 ? 0.85 : 0.5 + r() * 0.25);
    const g = new THREE.IcosahedronGeometry(1, low ? 0 : 1);
    // Une grappe un peu cabossée, jamais une boule parfaite
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const j = 0.82 + Math.sin(pos.getX(i) * 7.1 + k) * 0.1 + Math.cos(pos.getZ(i) * 5.3 + k * 2) * 0.1;
      pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j * 0.86, pos.getZ(i) * j);
    }
    g.scale(size, size, size);
    g.translate(d.x + Math.cos(a) * rad, y, d.z + Math.sin(a) * rad);
    color.set(LEAVES[(k + Math.floor(r() * 5)) % LEAVES.length]!);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // Le dessous des grappes est plus sombre
      const shade = 0.75 + Math.max(0, Math.min(1, (pos.getY(i) - (y - size)) / (size * 2))) * 0.35;
      col[i * 3] = color.r * shade;
      col[i * 3 + 1] = color.g * shade;
      col[i * 3 + 2] = color.b * shade;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.deleteAttribute("uv");
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  for (const g of parts) if (g.attributes.uv) g.deleteAttribute("uv");
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) return;
  merged.computeVertexNormals();
  const crown = new THREE.Mesh(merged, leafMaterial(q));
  crown.castShadow = true;
  group.add(crown);
}
/**
 * Un palmier : un stipe annelé qui se courbe un peu (penché d'un côté toujours le même pour un même palmier), et une
 * couronne de palmes longues qui retombent, chacune pliée en gouttière, plus claires au-dessus
 */
function palm(d: Extract<Decor, { k: "palm" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  let seed = Math.abs(Math.round(d.x * 59 + d.z * 37)) + 3;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const lean = r() * Math.PI * 2;
  const bend = 0.08 + r() * 0.1;
  const trunkH = d.h * 0.86;
  const segs = low ? 4 : 7;
  const parts: THREE.BufferGeometry[] = [];
  let top = new THREE.Vector3(d.x, 0, d.z);
  for (let k = 0; k < segs; k++) {
    const t0 = k / segs;
    const t1 = (k + 1) / segs;
    const off = (t: number) => bend * trunkH * t * t;
    const a = new THREE.Vector3(d.x + Math.cos(lean) * off(t0), trunkH * t0, d.z + Math.sin(lean) * off(t0));
    const b = new THREE.Vector3(d.x + Math.cos(lean) * off(t1), trunkH * t1, d.z + Math.sin(lean) * off(t1));
    const len = a.distanceTo(b);
    // Un anneau un peu renflé à chaque tronçon
    const g = new THREE.CylinderGeometry(0.17 - t1 * 0.04, 0.2 - t0 * 0.04, len, low ? 6 : 9);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push(g.index ? g.toNonIndexed() : g);
    top = b;
  }
  const trunkGeo = mergeGeometries(
    parts.map((g) => {
      g.deleteAttribute("uv");
      return g;
    }),
    false,
  );
  for (const g of parts) g.dispose();
  if (trunkGeo) {
    trunkGeo.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeo, palmBark);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);
  }
  // Les palmes
  const fronds: THREE.BufferGeometry[] = [];
  const n = low ? 8 : 13;
  const green = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.4;
    const len = d.h * (0.32 + r() * 0.12);
    const droop = 0.5 + r() * 0.5;
    const rise = k % 3 === 0 ? 0.35 : 0;
    const steps = low ? 4 : 7;
    const pos: number[] = [];
    const col: number[] = [];
    green.set(r() < 0.3 ? "#6b8a35" : r() < 0.6 ? "#557a2c" : "#4a6b28");
    // Une palme : une bande qui s'élargit puis s'effile, pliée en V le long de sa nervure, qui retombe vers son bout
    const ring = (i: number) => {
      const t = i / steps;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.42 + 0.04;
      const along = t * len;
      const y = rise * t * len - droop * (t * t) * len * 0.7;
      return { along, y, w };
    };
    const pt = (along: number, y: number, side: number, fold: number) => {
      const x = Math.cos(a) * along - Math.sin(a) * side;
      const z = Math.sin(a) * along + Math.cos(a) * side;
      return [top.x + x, top.y + y + fold, top.z + z];
    };
    for (let i = 0; i < steps; i++) {
      const p = ring(i);
      const q2 = ring(i + 1);
      const mid0 = pt(p.along, p.y, 0, 0.06);
      const mid1 = pt(q2.along, q2.y, 0, 0.06);
      for (const side of [-1, 1]) {
        const e0 = pt(p.along, p.y, side * p.w, -0.08);
        const e1 = pt(q2.along, q2.y, side * q2.w, -0.08);
        pos.push(...mid0, ...e0, ...e1, ...mid0, ...e1, ...mid1);
        const sh = 0.75 + (i / steps) * 0.35;
        for (let v = 0; v < 6; v++) col.push(green.r * sh, green.g * sh, green.b * sh);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    fronds.push(g);
  }
  const crownGeo = mergeGeometries(fronds, false);
  for (const g of fronds) g.dispose();
  if (!crownGeo) return;
  crownGeo.computeVertexNormals();
  const crown = new THREE.Mesh(crownGeo, palmLeaf(q));
  crown.castShadow = true;
  group.add(crown);
}
const palmBark = new THREE.MeshStandardMaterial({ color: "#7d6448", roughness: 0.95, flatShading: true });
const palmLeaves = new Map<string, THREE.Material>();
function palmLeaf(q: Quality): THREE.Material {
  let m = palmLeaves.get(q);
  if (!m) {
    m =
      q === "bas"
        ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    palmLeaves.set(q, m);
  }
  return m;
}

/** La toile rayée d'un auvent : la couleur et un blanc cassé, en larges bandes */
const awningMats = new Map<string, THREE.Material>();
function awningMaterial(color: string): THREE.Material {
  let m = awningMats.get(color);
  if (!m) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 === 0 ? color : "#efe4cc";
      g.fillRect(k * 16, 0, 16, 64);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, side: THREE.DoubleSide });
    awningMats.set(color, m);
  }
  return m;
}

/** Un auvent : une toile tendue qui se creuse un peu en son milieu, ses bandes le long du plus petit côté */
function awning(d: Extract<Decor, { k: "awning" }>, group: THREE.Group) {
  const w = d.x1 - d.x0;
  const dd = d.z1 - d.z0;
  const g = new THREE.PlaneGeometry(w, dd, 10, 10);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const alongX = w >= dd;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w + 0.5;
    const v = pos.getZ(i) / dd + 0.5;
    const sag = 0.28 * (1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2);
    pos.setY(i, -sag);
    // Les bandes : une tous les 0,5 m, en travers du plus long côté
    uv.setXY(i, alongX ? (u * w) / 2 : (v * dd) / 2, alongX ? v : u);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, awningMaterial(d.color));
  m.position.set((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
}

/**
 * Les cheminées d'usine : une colonne de brique qui s'amincit vers le haut, cerclée de fer, son couronnement sombre ; et
 * leur fumée, quelques nuages qui montent, s'élargissent, dérivent avec le vent et s'effacent (sans fin, toujours les
 * mêmes : rien à créer pendant la partie). Renvoie ce qui anime la fumée.
 */
function chimneys(list: Extract<Decor, { k: "chimney" }>[], group: THREE.Group, q: Quality): (t: number) => void {
  const low = q === "bas";
  const puffs: { s: THREE.Sprite; m: THREE.SpriteMaterial; x: number; y: number; z: number; phase: number }[] = [];
  const smokeTex = list.length > 0 && !low ? smokeTexture() : null;
  for (const d of list) {
    const tex = matTexture("brique", 256)!.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set((Math.PI * 2 * d.r) / 2.4, d.h / 2.4);
    const brick = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 0.72, d.r, d.h, low ? 10 : 20, 1, true), brick);
    col.position.set(d.x, d.h / 2, d.z);
    col.castShadow = true;
    group.add(col);
    const iron = new THREE.MeshStandardMaterial({ color: "#2a2724", roughness: 0.6, metalness: 0.5 });
    for (const k of [0.3, 0.55, 0.78]) {
      const r = d.r * (1 - 0.28 * k) + 0.03;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, low ? 10 : 20, 1, true), iron);
      band.position.set(d.x, d.h * k, d.z);
      group.add(band);
    }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 0.8, d.r * 0.74, 0.7, low ? 10 : 20), iron);
    crown.position.set(d.x, d.h + 0.2, d.z);
    group.add(crown);
    if (low) continue;
    for (let i = 0; i < 12; i++) {
      const m = new THREE.SpriteMaterial({ map: smokeTex, color: "#8a8681", transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(m);
      group.add(s);
      puffs.push({ s, m, x: d.x, y: d.h + 0.6, z: d.z, phase: i / 12 });
    }
  }
  const c = new THREE.Color();
  return (t: number) => {
    for (const p of puffs) {
      const age = (t * 0.06 + p.phase) % 1;
      p.s.position.set(p.x + age * 11 + Math.sin(t * 0.3 + p.phase * 9) * 0.8, p.y + age * 12, p.z + age * 4);
      p.s.scale.setScalar(2 + age * 10);
      p.m.rotation = p.phase * 6 + age * 1.2;
      p.m.opacity = 0.42 * Math.min(1, age * 8) * (1 - age) ** 1.4;
      p.m.color.copy(c.set("#6a6661").lerp(c.clone().set("#c2beb8"), age));
    }
  };
}

/** La voûte d'un hangar : une demi-coque de tôle ondulée (on la voit dedans comme dehors), cerclée à ses deux bouts */
function hangarVault(d: Extract<Decor, { k: "hangar" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const len = d.x1 - d.x0;
  const w = (d.z1 - d.z0) / 2;
  const tex = corrugatedTexture().clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((Math.PI * w) / 2.4, len / 2.4);
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: "#9aa3a8", roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide });
  const g = new THREE.CylinderGeometry(1, 1, len, low ? 14 : 28, 1, true, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.scale(1, d.h, w);
  const vault = new THREE.Mesh(g, mat);
  vault.position.set((d.x0 + d.x1) / 2, 0, (d.z0 + d.z1) / 2);
  vault.castShadow = true;
  vault.receiveShadow = true;
  group.add(vault);
  const rib = new THREE.MeshStandardMaterial({ color: "#3b3f42", roughness: 0.6, metalness: 0.5 });
  for (const x of [d.x0, d.x1]) {
    const tg = new THREE.TorusGeometry(1, 0.06, 6, low ? 14 : 28, Math.PI);
    tg.scale(w, d.h, 1);
    const ring = new THREE.Mesh(tg, rib);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x, 0, (d.z0 + d.z1) / 2);
    group.add(ring);
  }
}

/** Un avion garé : son fuselage qui s'effile, son capot et son hélice, ses ailes, son empennage, sa verrière, ses roues */
function parkedPlane(d: Extract<Decor, { k: "plane" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const seg = low ? 8 : 14;
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.55, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: "#26282a", roughness: 0.5, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: "#1b2a34", roughness: 0.1, metalness: 0.6 });
  const L = d.L;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const body = new THREE.CylinderGeometry(0.85, 0.3, L * 0.82, seg);
  body.rotateZ(-Math.PI / 2);
  add(body, paint, -L * 0.06, 1.4, 0);
  const cowl = new THREE.SphereGeometry(0.86, seg, 8);
  cowl.scale(0.7, 1, 1);
  add(cowl, dark, L * 0.35, 1.4, 0);
  for (let k = 0; k < 3; k++) {
    const blade = add(new THREE.BoxGeometry(0.06, 1.3, 0.16), dark, L * 0.35 + 0.66, 1.4, 0);
    blade.rotation.x = (k / 3) * Math.PI * 2;
    blade.geometry.translate(0, 0.65, 0);
  }
  const canopy = new THREE.SphereGeometry(0.5, seg, 8);
  canopy.scale(1.3, 0.65, 0.62);
  add(canopy, glass, L * 0.06, 2.1, 0);
  add(new THREE.BoxGeometry(2.2, 0.2, d.span), paint, 0.6, 1.2, 0);
  add(new THREE.BoxGeometry(1.1, 0.12, d.span * 0.38), paint, -L * 0.42, 1.55, 0);
  add(new THREE.BoxGeometry(1.1, 1.3, 0.12), paint, -L * 0.44, 2.85, 0);
  const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.18, seg);
  wheel.rotateX(Math.PI / 2);
  for (const z of [-1.6, 1.6]) {
    add(wheel, dark, 0.9, 0.34, z);
    add(new THREE.BoxGeometry(0.1, 0.85, 0.1), dark, 0.9, 0.78, z);
  }
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.1, seg).rotateX(Math.PI / 2), dark, -L * 0.44, 0.45, 0);
  g.rotation.y = d.dir === "+x" ? 0 : d.dir === "-x" ? Math.PI : d.dir === "+z" ? -Math.PI / 2 : Math.PI / 2;
  g.position.set(d.x, 0, d.z);
  group.add(g);
}

/** La manche à air : son mât, et la manche rayée qui retombe un peu au bout */
function windsock(d: Extract<Decor, { k: "windsock" }>, group: THREE.Group) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5, 6), steel);
  pole.position.set(d.x, 2.5, d.z);
  group.add(pole);
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 8;
  const g = c.getContext("2d")!;
  for (let k = 0; k < 5; k++) {
    g.fillStyle = k % 2 === 0 ? "#e2622c" : "#f2ede2";
    g.fillRect((k * 64) / 5, 0, 64 / 5 + 1, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cone = new THREE.CylinderGeometry(0.32, 0.14, 1.8, 10, 1, true);
  cone.rotateZ(-Math.PI / 2 - 0.25);
  // Le dessin des bandes court le long de la manche
  const uv = cone.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  const sock = new THREE.Mesh(cone, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
  sock.position.set(d.x + 0.9, 4.75, d.z);
  sock.castShadow = true;
  group.add(sock);
}

/** Une ligne peinte en tirets, au ras du sol (décalée pour ne pas scintiller) */
function groundMarks(d: Extract<Decor, { k: "marks" }>, group: THREE.Group) {
  const pos: number[] = [];
  for (let x = d.x0; x < d.x1; x += 5.5) {
    const a = x;
    const b = Math.min(d.x1, x + 3);
    pos.push(a, 0.02, d.z - 0.18, a, 0.02, d.z + 0.18, b, 0.02, d.z + 0.18, a, 0.02, d.z - 0.18, b, 0.02, d.z + 0.18, b, 0.02, d.z - 0.18);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      color: d.color,
      roughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide,
    }),
  );
  m.receiveShadow = true;
  group.add(m);
}

/** Un tapis roulant : la bande sombre entre deux longerons, des rouleaux dessous, des pieds jusqu'au sol */
function conveyor(d: Extract<Decor, { k: "conveyor" }>, group: THREE.Group) {
  const a = new THREE.Vector3(d.x0, d.y0, d.z0);
  const b = new THREE.Vector3(d.x1, d.y1, d.z1);
  const len = a.distanceTo(b);
  const g = new THREE.Group();
  const belt = new THREE.MeshStandardMaterial({ color: "#2b2a28", roughness: 0.9 });
  const frame = new THREE.MeshStandardMaterial({ color: "#c9902c", roughness: 0.6, metalness: 0.4 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  };
  add(new THREE.BoxGeometry(0.8, 0.06, len), belt, 0, 0, 0);
  for (const x of [-0.46, 0.46]) add(new THREE.BoxGeometry(0.1, 0.22, len), frame, x, -0.06, 0);
  for (let k = -len / 2 + 0.4; k < len / 2; k += 0.8) {
    const r = new THREE.CylinderGeometry(0.05, 0.05, 0.86, 6);
    r.rotateZ(Math.PI / 2);
    add(r, frame, 0, -0.08, k);
  }
  g.position.copy(a).add(b).multiplyScalar(0.5);
  g.lookAt(b);
  group.add(g);
  // Les pieds : du dessous de la bande jusqu'au sol, tous les 2,5 m
  const legs = Math.max(1, Math.floor(len / 2.5));
  for (let k = 1; k <= legs; k++) {
    const p = a.clone().lerp(b, k / (legs + 1));
    for (const side of [-0.42, 0.42]) {
      const dir = b.clone().sub(a).setY(0).normalize();
      const off = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side);
      const h = p.y - 0.12;
      if (h < 0.2) continue;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), frame);
      leg.position.set(p.x + off.x, h / 2, p.z + off.z);
      leg.castShadow = true;
      group.add(leg);
    }
  }
}

/** Range une pièce teintée (couleur par sommet, sans uv ni normales : elles sont refaites après la fusion) */
function pushTinted(parts: THREE.BufferGeometry[], g: THREE.BufferGeometry, c: THREE.Color, shade?: (i: number) => number) {
  const src = g.index ? g.toNonIndexed() : g;
  if (src !== g) g.dispose();
  const n = src.attributes.position!.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = shade ? shade(i) : 1;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  src.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (src.attributes.uv) src.deleteAttribute("uv");
  if (src.attributes.normal) src.deleteAttribute("normal");
  parts.push(src);
}

/** Fond les pièces teintées en un maillage */
function mergeTinted(parts: THREE.BufferGeometry[], mat: THREE.Material, group: THREE.Group, shadow: boolean) {
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) return;
  merged.computeVertexNormals();
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  group.add(m);
}

const tintedMats = new Map<string, THREE.Material>();
/** Le bois, le fer et la toile des objets du décor : leur couleur est dans les sommets */
function tintedMaterial(q: Quality): THREE.Material {
  let m = tintedMats.get(q);
  if (!m) {
    m =
      q === "bas"
        ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true });
    tintedMats.set(q, m);
  }
  return m;
}

/**
 * Un rang de vigne : les ceps tordus au pied, des piquets et trois fils, une haie de feuillage serrée (deux étages de
 * touffes cabossées, plus sombres dessous) et des grappes qui pendent sous les feuilles, des deux côtés
 */
function vines(d: Extract<Decor, { k: "vines" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  let seed = Math.abs(Math.round(d.x0 * 31 + d.z * 17)) + 7;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const bark = new THREE.Color("#4a3626");
  for (let x = d.x0 + 0.35; x < d.x1 - 0.2; x += 1) {
    const h = 0.42 + r() * 0.08;
    const g = new THREE.CylinderGeometry(0.035, 0.06, h, 5);
    g.translate(0, h / 2, 0);
    g.rotateZ((r() - 0.5) * 0.5);
    g.rotateX((r() - 0.5) * 0.3);
    g.translate(x, 0, d.z);
    pushTinted(parts, g, bark);
  }
  const wood = new THREE.Color("#6b5137");
  for (let x = d.x0 + 0.1; x <= d.x1 - 0.05; x += 2.4) {
    const p = new THREE.BoxGeometry(0.06, 1.38, 0.06);
    p.translate(x, 0.69, d.z);
    pushTinted(parts, p, wood);
  }
  const wire = new THREE.Color("#55554f");
  for (const y of [0.5, 0.95, 1.3]) {
    const w = new THREE.BoxGeometry(d.x1 - d.x0, 0.012, 0.012);
    w.translate((d.x0 + d.x1) / 2, y, d.z);
    pushTinted(parts, w, wire);
  }
  const greens = ["#4f6e2a", "#5a7a2e", "#46632a", "#68843a", "#3f5a22"].map((c) => new THREE.Color(c));
  const grape = new THREE.Color("#33203c");
  const detail = q === "haut" ? 1 : 0;
  const step = low ? 0.75 : 0.42;
  for (const [y0, sy] of low
    ? ([[0.95, 0.42]] as const)
    : ([
        [0.74, 0.27],
        [1.14, 0.25],
      ] as const)) {
    for (let x = d.x0 + 0.25; x < d.x1 - 0.15; x += step * (0.85 + r() * 0.3)) {
      const g = new THREE.IcosahedronGeometry(1, detail);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const k = r() * 10;
      for (let i = 0; i < pos.count; i++) {
        const j = 0.84 + Math.sin(pos.getX(i) * 6.3 + k) * 0.09 + Math.cos(pos.getZ(i) * 5.1 + k) * 0.09;
        pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j);
      }
      const sx = 0.32 + r() * 0.1;
      const syy = sy + r() * 0.06;
      g.scale(sx, syy, 0.24 + r() * 0.05);
      const y = y0 + (r() - 0.5) * 0.08;
      g.translate(x + (r() - 0.5) * 0.12, y, d.z + (r() - 0.5) * 0.08);
      const gp = g.attributes.position as THREE.BufferAttribute;
      const ys = Array.from({ length: gp.count }, (_, i) => gp.getY(i));
      pushTinted(
        parts,
        g,
        greens[Math.floor(r() * greens.length)]!,
        (i) => 0.7 + Math.max(0, Math.min(1, (ys[i]! - (y - syy)) / (syy * 2))) * 0.42,
      );
      if (!low && r() < 0.5) {
        const side = r() < 0.5 ? -1 : 1;
        const c = new THREE.ConeGeometry(0.07, 0.2, 6);
        c.rotateX(Math.PI);
        c.translate(x + (r() - 0.5) * 0.3, 0.42 + r() * 0.06, d.z + side * (0.17 + r() * 0.04));
        pushTinted(parts, c, grape);
      }
    }
  }
  mergeTinted(parts, leafMaterial(q), group, !low);
}

/**
 * Un tonneau, debout (`lying` faux) ou couché le long de z, son milieu en (x, y, z) : des douelles plus ou moins
 * foncées, quatre cercles de fer, les fonds plus sombres
 */
function barrelParts(
  parts: THREE.BufferGeometry[],
  x: number,
  y: number,
  z: number,
  lying: boolean,
  seg: number,
  wood: THREE.Color,
  L = 1.08,
  R = 0.36,
) {
  const prof: THREE.Vector2[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    prof.push(new THREE.Vector2(R + Math.sin(t * Math.PI) * R * 0.22, -L / 2 + t * L));
  }
  const pose = (g: THREE.BufferGeometry) => {
    if (lying) g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
  };
  const body = new THREE.LatheGeometry(prof, seg);
  const bp = body.toNonIndexed();
  body.dispose();
  // Une douelle sur deux un peu plus foncée (l'angle autour de l'axe, avant de coucher le tonneau)
  const pp = bp.attributes.position as THREE.BufferAttribute;
  const shades: number[] = [];
  for (let v = 0; v < pp.count; v += 3) {
    const cx = (pp.getX(v) + pp.getX(v + 1) + pp.getX(v + 2)) / 3;
    const cz = (pp.getZ(v) + pp.getZ(v + 1) + pp.getZ(v + 2)) / 3;
    const stave = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * seg);
    const k = stave % 2 === 0 ? 1 : 0.86;
    shades.push(k, k, k);
  }
  pose(bp);
  pushTinted(parts, bp, wood, (v) => shades[v]!);
  const iron = new THREE.Color("#2c2926");
  for (const t of [-0.41, -0.19, 0.19, 0.41]) {
    const rr = R + Math.sin((t + 0.5) * Math.PI) * R * 0.22 + 0.012;
    const h = new THREE.CylinderGeometry(rr, rr, 0.05, seg, 1, true);
    h.translate(0, t * L, 0);
    pose(h);
    pushTinted(parts, h, iron);
  }
  for (const e of [-1, 1]) {
    const c = new THREE.CircleGeometry(R - 0.005, seg);
    c.rotateX(e > 0 ? -Math.PI / 2 : Math.PI / 2);
    c.translate(0, (e * L) / 2 - e * 0.02, 0);
    pose(c);
    pushTinted(parts, c, wood, () => 0.7);
  }
}

/** La teinte d'un tonneau : un brun de chêne, un peu différent d'un tonneau à l'autre */
function caskWood(i: number) {
  return new THREE.Color().setHSL(0.07 + ((i * 7) % 5) * 0.006, 0.45, 0.25 + ((i * 3) % 4) * 0.02);
}

/** Des tonneaux couchés sur leur chantier (deux poutres), le fond tourné vers l'allée */
function casks(d: Extract<Decor, { k: "casks" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  const beam = new THREE.Color("#4a3828");
  for (const side of [-0.3, 0.3]) {
    const g = new THREE.BoxGeometry(d.x1 - d.x0, 0.16, 0.14);
    g.translate((d.x0 + d.x1) / 2, 0.08, d.z + side);
    pushTinted(parts, g, beam);
  }
  const n = Math.max(1, Math.floor((d.x1 - d.x0) / 0.98));
  const gap = (d.x1 - d.x0) / n;
  for (let i = 0; i < n; i++) barrelParts(parts, d.x0 + gap * (i + 0.5), 0.6, d.z, true, low ? 10 : 16, caskWood(i + Math.round(d.x0)));
  mergeTinted(parts, tintedMaterial(q), group, !low);
}

/** Un tonneau debout */
function tun(d: Extract<Decor, { k: "tun" }>, group: THREE.Group, q: Quality) {
  const parts: THREE.BufferGeometry[] = [];
  barrelParts(parts, d.x, 0.5, d.z, false, q === "bas" ? 10 : 16, caskWood(Math.round(d.x * 3 + d.z)), 0.98, 0.3);
  mergeTinted(parts, tintedMaterial(q), group, q !== "bas");
}

/**
 * Ce qui se pose dans une boîte (x0, z0, x1, z1) le long de sa plus grande longueur : on le construit le long de x autour
 * de l'origine, l'avant vers +x, puis on le tourne et on le pose
 */
function boxFrame(d: { x0: number; z0: number; x1: number; z1: number }, front: 1 | -1 = 1) {
  const alongX = d.x1 - d.x0 >= d.z1 - d.z0;
  const L = alongX ? d.x1 - d.x0 : d.z1 - d.z0;
  const W = alongX ? d.z1 - d.z0 : d.x1 - d.x0;
  const cx = (d.x0 + d.x1) / 2;
  const cz = (d.z0 + d.z1) / 2;
  const place = (g: THREE.BufferGeometry) => {
    const turn = (alongX ? 0 : -Math.PI / 2) + (front < 0 ? Math.PI : 0);
    if (turn) g.rotateY(turn);
    g.translate(cx, 0, cz);
    return g;
  };
  return { L, W, place };
}

/** Un petit générateur pseudo-aléatoire, toujours le même pour un même objet */
function seededRand(x: number, z: number, salt: number) {
  let seed = Math.abs(Math.round(x * 31 + z * 17 + salt * 7)) + 1;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/**
 * Un étal du marché : la table sur ses pieds, une toile dessus, des cagettes de fruits et de légumes (oranges, pommes,
 * choux, pommes de terre), deux paniers dessous
 */
function stall(d: Extract<Decor, { k: "stall" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  const { L, W, place } = boxFrame(d);
  const r = seededRand(d.x0, d.z0, 3);
  const wood = new THREE.Color("#7a5a3a");
  const top = new THREE.BoxGeometry(L, 0.05, W);
  top.translate(0, 0.86, 0);
  pushTinted(parts, place(top), wood);
  const cloth = new THREE.BoxGeometry(L - 0.12, 0.012, W - 0.12);
  cloth.translate(0, 0.89, 0);
  pushTinted(parts, place(cloth), new THREE.Color(r() < 0.5 ? "#b8452f" : "#3f6a8a"));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.07, 0.84, 0.07);
      leg.translate(sx * (L / 2 - 0.12), 0.42, sz * (W / 2 - 0.12));
      pushTinted(parts, place(leg), wood, () => 0.75);
    }
  for (const sz of [-1, 1]) {
    const bar = new THREE.BoxGeometry(L - 0.24, 0.05, 0.05);
    bar.translate(0, 0.22, sz * (W / 2 - 0.12));
    pushTinted(parts, place(bar), wood, () => 0.75);
  }
  // Les cagettes et ce qu'il y a dedans
  const produce: [string, number][] = [
    ["#d9822b", 0.075],
    ["#a8322a", 0.07],
    ["#6f8f3a", 0.12],
    ["#9a7a4a", 0.065],
    ["#c9b23a", 0.07],
  ];
  const crate = new THREE.Color("#a0805a");
  const cols = 2;
  const rows = 2;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const cx = -L / 2 + (L / cols) * (i + 0.5);
      const cz = -W / 2 + (W / rows) * (j + 0.5);
      const cw = L / cols - 0.18;
      const cd = W / rows - 0.2;
      const base = new THREE.BoxGeometry(cw, 0.03, cd);
      base.translate(cx, 0.91, cz);
      pushTinted(parts, place(base), crate);
      for (const s of [-1, 1]) {
        const side = new THREE.BoxGeometry(cw, 0.14, 0.025);
        side.translate(cx, 0.97, cz + (s * cd) / 2);
        pushTinted(parts, place(side), crate, () => 0.9);
        const end = new THREE.BoxGeometry(0.025, 0.14, cd);
        end.translate(cx + (s * cw) / 2, 0.97, cz);
        pushTinted(parts, place(end), crate, () => 0.9);
      }
      const [color, rad] = produce[Math.floor(r() * produce.length)]!;
      const c = new THREE.Color(color);
      const nx = Math.max(1, Math.floor(cw / (rad * 2.1)));
      const nz = Math.max(1, Math.floor(cd / (rad * 2.1)));
      for (let a = 0; a < nx; a++)
        for (let b = 0; b < nz; b++) {
          if (low && (a + b) % 2) continue;
          const g = new THREE.IcosahedronGeometry(rad * (0.9 + r() * 0.2), 0);
          g.translate(cx - cw / 2 + (cw / nx) * (a + 0.5), 0.94 + rad * 0.8, cz - cd / 2 + (cd / nz) * (b + 0.5));
          pushTinted(parts, place(g), c, () => 0.85 + r() * 0.3);
        }
    }
  // Deux paniers sous la table
  if (!low)
    for (const s of [-1, 1]) {
      const basket = new THREE.CylinderGeometry(0.24, 0.18, 0.26, 10, 1, true);
      basket.translate(s * L * 0.22, 0.13, 0);
      pushTinted(parts, place(basket), new THREE.Color("#9c7a48"));
      const bottom = new THREE.CircleGeometry(0.18, 10);
      bottom.rotateX(-Math.PI / 2);
      bottom.translate(s * L * 0.22, 0.01, 0);
      pushTinted(parts, place(bottom), new THREE.Color("#7c5e36"));
    }
  mergeTinted(parts, tintedMaterial(q), group, !low);
}

/**
 * Un chariot à bagages : un plateau bas sur quatre petites roues, des ridelles aux deux bouts, le timon d'attelage ; des
 * valises et des sacs entassés dessus
 */
function baggage(d: Extract<Decor, { k: "baggage" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  const { L, W, place } = boxFrame(d);
  const r = seededRand(d.x0, d.z0, 5);
  const frame = new THREE.Color("#5e6266");
  const rubber = new THREE.Color("#1c1c1b");
  const deck = new THREE.BoxGeometry(L, 0.06, W);
  deck.translate(0, 0.36, 0);
  pushTinted(parts, place(deck), frame);
  const skirt = new THREE.BoxGeometry(L - 0.1, 0.12, W - 0.16);
  skirt.translate(0, 0.27, 0);
  pushTinted(parts, place(skirt), frame, () => 0.7);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const wheel = new THREE.CylinderGeometry(0.13, 0.13, 0.09, low ? 8 : 12);
      wheel.rotateX(Math.PI / 2);
      wheel.translate(sx * (L / 2 - 0.22), 0.13, sz * (W / 2 - 0.08));
      pushTinted(parts, place(wheel), rubber);
    }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.BoxGeometry(0.04, 0.62, 0.04);
      post.translate(sx * (L / 2 - 0.03), 0.7, sz * (W / 2 - 0.04));
      pushTinted(parts, place(post), frame);
    }
    for (const y of [0.68, 1.0]) {
      const bar = new THREE.BoxGeometry(0.04, 0.04, W - 0.08);
      bar.translate(sx * (L / 2 - 0.03), y, 0);
      pushTinted(parts, place(bar), frame);
    }
  }
  const tow = new THREE.BoxGeometry(0.75, 0.05, 0.05);
  tow.rotateZ(-0.38);
  tow.translate(L / 2 + 0.32, 0.22, 0);
  pushTinted(parts, place(tow), frame, () => 0.8);
  // Les bagages : deux rangées de valises couchées, d'autres posées dessus, un sac de toile
  const colors = ["#6b2f2a", "#2f4a6b", "#3d3d3a", "#7a6a4a", "#4f5f3a", "#8a5a2a"].map((c) => new THREE.Color(c));
  let y0 = 0.39;
  for (let layer = 0; layer < 2; layer++) {
    let x = -L / 2 + 0.1;
    while (x < L / 2 - 0.3) {
      const w = 0.42 + r() * 0.2;
      if (x + w > L / 2 - 0.08) break;
      const h = layer === 0 ? 0.26 : 0.18 + r() * 0.08;
      const dz = W - 0.2 - r() * 0.12;
      if (layer === 1 && r() < 0.35) {
        x += w + 0.05;
        continue;
      }
      const g = new THREE.BoxGeometry(w, h, dz);
      g.rotateY((r() - 0.5) * 0.12);
      g.translate(x + w / 2, y0 + h / 2, (r() - 0.5) * 0.06);
      const c = colors[Math.floor(r() * colors.length)]!;
      pushTinted(parts, place(g), c, () => 0.9 + r() * 0.1);
      const handle = new THREE.BoxGeometry(0.16, 0.03, 0.03);
      handle.translate(x + w / 2, y0 + h + 0.015, 0);
      pushTinted(parts, place(handle), rubber);
      x += w + 0.04;
    }
    y0 += 0.27;
  }
  if (!low) {
    const bag = new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8);
    bag.rotateZ(Math.PI / 2);
    bag.scale(1, 0.8, 1);
    bag.translate(L * 0.18, 0.39 + 0.27 * 2 + 0.06, 0.05);
    pushTinted(parts, place(bag), new THREE.Color("#6e6a50"));
  }
  mergeTinted(parts, tintedMaterial(q), group, !low);
}

/**
 * Un abribus : le panneau du fond sur son cadre (une affiche délavée à un bout, de la tôle ailleurs), le toit en
 * porte-à-faux un peu de travers, le banc ; l'abri s'ouvre du côté `front`
 */
function shelter(d: Extract<Decor, { k: "shelter" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  const { L, W, place } = boxFrame(d);
  // boxFrame tourne pour mettre la longueur sur x ; l'ouverture est vers +z local quand front vaut 1
  const open = d.front;
  const back = (-open * W) / 2;
  const frame = new THREE.Color("#2f3d36");
  const sheet = new THREE.Color("#55605a");
  const bx = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c: THREE.Color, k = 1) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    pushTinted(parts, place(g), c, () => k);
  };
  const wallZ = back + open * 0.15;
  // Les montants et les traverses du cadre
  const posts = 4;
  for (let k = 0; k < posts; k++) bx(0.08, 2.5, 0.08, -L / 2 + 0.04 + (k * (L - 0.08)) / (posts - 1), 1.25, wallZ, frame);
  for (const y of [0.18, 2.3]) bx(L, 0.06, 0.06, 0, y, wallZ, frame);
  // Les panneaux : une affiche au bout, de la tôle cabossée ailleurs
  const panel = (L - 0.08) / (posts - 1);
  for (let k = 0; k < posts - 1; k++) {
    const x = -L / 2 + 0.04 + panel * (k + 0.5);
    if (k === 0) {
      bx(panel - 0.1, 2.06, 0.05, x, 1.24, wallZ, new THREE.Color("#d8d2c0"));
      // L'affiche délavée : un ciel, une bande, un soleil
      bx(panel - 0.3, 0.9, 0.02, x, 1.6, wallZ + open * 0.035, new THREE.Color("#6f9ab0"));
      bx(panel - 0.3, 0.5, 0.02, x, 0.86, wallZ + open * 0.035, new THREE.Color("#c9a24a"));
      const sun = new THREE.CircleGeometry(0.16, 12);
      if (open < 0) sun.rotateY(Math.PI);
      sun.translate(x + 0.15, 1.75, wallZ + open * 0.05);
      pushTinted(parts, place(sun), new THREE.Color("#e6d9a0"));
    } else bx(panel - 0.1, 2.06, 0.04, x, 1.24, wallZ, sheet, k === 1 ? 0.92 : 1.04);
  }
  // Le toit, en porte-à-faux, un peu affaissé
  const roof = new THREE.BoxGeometry(L + 0.15, 0.07, 1.6);
  roof.rotateZ(0.04);
  roof.rotateX(open * 0.06);
  roof.translate(0, 2.5, back + open * 0.75);
  pushTinted(parts, place(roof), frame, () => 0.9);
  // Le banc
  bx(L - 0.6, 0.05, 0.34, 0, 0.46, back + open * 0.5, new THREE.Color("#7a5a3a"));
  for (const s of [-1, 1]) bx(0.05, 0.44, 0.3, s * (L / 2 - 0.5), 0.22, back + open * 0.5, frame);
  mergeTinted(parts, tintedMaterial(q), group, !low);
}

/**
 * Un wagon-citerne sur sa voie (le long de x) : le châssis et ses tampons, deux bogies et leurs roues, la citerne aux
 * fonds bombés, sale et piquée de rouille, ses cerclages, le dôme du dessus, la rambarde, une échelle de chaque côté
 */
function tankCar(d: Extract<Decor, { k: "tankcar" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  const r = seededRand(d.x0, d.z, 9);
  const len = d.x1 - d.x0;
  const cx = (d.x0 + d.x1) / 2;
  const z = d.z;
  const dark = new THREE.Color("#26262a");
  const iron = new THREE.Color("#3b3a38");
  const body = new THREE.Color(d.color);
  const grime = () => 0.78 + r() * 0.3;
  const bx = (sx: number, sy: number, sz: number, x: number, y: number, zz: number, c: THREE.Color, k = 1) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, zz);
    pushTinted(parts, g, c, () => k);
  };
  // Le châssis, les traverses des bouts, les tampons
  bx(len - 0.4, 0.26, 2.0, cx, 1.0, z, dark);
  for (const s of [-1, 1]) {
    bx(0.22, 0.36, 2.5, cx + (s * (len - 0.3)) / 2, 1.0, z, iron);
    for (const t of [-0.85, 0.85]) {
      const buf = new THREE.CylinderGeometry(0.16, 0.16, 0.42, 10);
      buf.rotateZ(Math.PI / 2);
      buf.translate(cx + s * (len / 2 + 0.03), 1.0, z + t);
      pushTinted(parts, buf, iron);
    }
  }
  // Les bogies : un cadre, deux essieux, quatre roues
  const segW = low ? 10 : 16;
  for (const s of [-1, 1]) {
    const bxc = cx + s * (len / 2 - 2.1);
    bx(2.3, 0.3, 1.7, bxc, 0.62, z, dark, 0.9);
    for (const a of [-0.75, 0.75])
      for (const t of [-0.72, 0.72]) {
        const w = new THREE.CylinderGeometry(0.42, 0.42, 0.12, segW);
        w.rotateX(Math.PI / 2);
        w.translate(bxc + a, 0.42, z + t);
        pushTinted(parts, w, iron);
        const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8);
        hub.rotateX(Math.PI / 2);
        hub.translate(bxc + a, 0.42, z + t * 1.08);
        pushTinted(parts, hub, dark);
      }
  }
  // La citerne, ses fonds bombés
  const R = d.r;
  const y = 1.13 + R;
  const tl = len - 1.4;
  const tank = new THREE.CylinderGeometry(R, R, tl, low ? 14 : 24, 1, true);
  tank.rotateZ(Math.PI / 2);
  tank.translate(cx, y, z);
  pushTinted(parts, tank, body, grime);
  for (const s of [-1, 1]) {
    const end = new THREE.SphereGeometry(R, low ? 14 : 24, low ? 5 : 8, 0, Math.PI * 2, 0, Math.PI / 2);
    end.rotateZ((-s * Math.PI) / 2);
    end.scale(0.32, 1, 1);
    end.translate(cx + (s * tl) / 2, y, z);
    pushTinted(parts, end, body, grime);
  }
  // Les cerclages
  for (const f of [-0.42, -0.14, 0.14, 0.42]) {
    const band = new THREE.CylinderGeometry(R + 0.025, R + 0.025, 0.1, low ? 14 : 24, 1, true);
    band.rotateZ(Math.PI / 2);
    band.translate(cx + f * tl, y, z);
    pushTinted(parts, band, iron);
  }
  // Le dôme et son couvercle
  const dome = new THREE.CylinderGeometry(0.42, 0.46, 0.34, 14);
  dome.translate(cx, y + R + 0.1, z);
  pushTinted(parts, dome, body, () => 0.9);
  const lid = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12);
  lid.translate(cx, y + R + 0.3, z);
  pushTinted(parts, lid, iron);
  // La rambarde le long du dessus, l'échelle au milieu de chaque flanc
  if (!low) {
    for (const t of [-0.55, 0.55]) {
      bx(tl * 0.5, 0.03, 0.03, cx, y + R + 0.35, z + t, iron);
      for (const f of [-0.24, 0, 0.24]) bx(0.03, 0.55, 0.03, cx + f * tl, y + R + 0.075, z + t, iron);
    }
    for (const s of [-1, 1]) {
      const zz = z + s * (R + 0.08);
      for (const t of [-0.22, 0.22]) bx(0.04, y + R * 0.4 - 1.1, 0.04, cx + t, (y + R * 0.4 + 1.1) / 2, zz, iron);
      for (let k = 0; k < 6; k++) bx(0.44, 0.03, 0.03, cx, 1.3 + k * ((y + R * 0.4 - 1.4) / 5), zz, iron);
    }
  }
  mergeTinted(parts, tintedMaterial(q), group, !low);
}

/** Une pile de grumes en pyramide : l'écorce, les bouts sciés plus clairs au cœur ; dehors en hiver, la neige dessus */
function logs(d: Extract<Decor, { k: "logs" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  const { L, W, place } = boxFrame(d);
  const dd = W / d.n;
  let seed = Math.abs(Math.round(d.x0 * 13 + d.z0 * 7)) + 3;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const seg = low ? 7 : 10;
  for (let k = 0; k < d.n; k++) {
    const count = d.n - k;
    for (let i = 0; i < count; i++) {
      const rad = (dd / 2) * (0.88 + r() * 0.1);
      const len = L - r() * 0.35;
      const off = (r() - 0.5) * (L - len);
      const z = -((count - 1) * dd) / 2 + i * dd;
      const y = dd / 2 + k * dd * 0.866;
      const bark = new THREE.Color().setHSL(0.07 + r() * 0.02, 0.3 + r() * 0.1, 0.2 + r() * 0.06, THREE.SRGBColorSpace);
      const body = new THREE.CylinderGeometry(rad, rad * (0.96 + r() * 0.06), len, seg, 1, true);
      body.rotateZ(Math.PI / 2);
      body.translate(off, y, z);
      pushTinted(parts, place(body), bark);
      if (d.snow) {
        const cap = new THREE.CylinderGeometry(rad * 1.04, rad * 1.04, len * 0.94, seg, 1, true, Math.PI / 2 - 0.95, 1.9);
        cap.rotateZ(Math.PI / 2);
        cap.translate(off, y, z);
        pushTinted(parts, place(cap), new THREE.Color("#eef3f6"));
      }
      const wood = new THREE.Color().setHSL(0.09, 0.45, 0.58 + r() * 0.08, THREE.SRGBColorSpace);
      for (const e of [-1, 1]) {
        const c = new THREE.CircleGeometry(rad * 0.97, seg);
        c.rotateY((e * Math.PI) / 2);
        c.translate(off + (e * len) / 2, y, z);
        // Le cœur clair (le centre est le troisième sommet de chaque triangle), l'aubier plus sombre vers l'écorce
        pushTinted(parts, place(c), wood, (v) => (v % 3 === 2 ? 1.08 : 0.8));
      }
    }
  }
  mergeTinted(parts, tintedMaterial(q), group, !low);
}

/** La scie de la scierie : un établi sur ses pieds, la lame ronde qui dépasse, le moteur dessous, une grume à couper */
function saw(d: Extract<Decor, { k: "saw" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  const { L, W, place } = boxFrame(d);
  const plank = new THREE.Color("#7a5a3a");
  const dark = new THREE.Color("#3a3a36");
  const top = new THREE.BoxGeometry(L, 0.08, W);
  top.translate(0, 0.84, 0);
  pushTinted(parts, place(top), plank);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.1, 0.8, 0.1);
      leg.translate(sx * (L / 2 - 0.15), 0.4, sz * (W / 2 - 0.1));
      pushTinted(parts, place(leg), plank, () => 0.75);
    }
  const rail = new THREE.BoxGeometry(L - 0.3, 0.08, 0.06);
  rail.translate(0, 0.3, 0);
  pushTinted(parts, place(rail), plank, () => 0.75);
  const motor = new THREE.BoxGeometry(0.55, 0.4, 0.45);
  motor.translate(0.3, 0.45, 0);
  pushTinted(parts, place(motor), new THREE.Color("#3f5a46"));
  const blade = new THREE.CylinderGeometry(0.42, 0.42, 0.02, low ? 14 : 28);
  blade.rotateX(Math.PI / 2);
  blade.translate(0.3, 0.88, 0);
  pushTinted(parts, place(blade), new THREE.Color("#a3a8ab"));
  const hub = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8);
  hub.rotateX(Math.PI / 2);
  hub.translate(0.3, 0.88, 0);
  pushTinted(parts, place(hub), dark);
  const log = new THREE.CylinderGeometry(0.2, 0.21, Math.min(1.6, L * 0.4), 9);
  log.rotateZ(Math.PI / 2);
  log.translate(-L * 0.25, 0.88 + 0.2, 0);
  pushTinted(parts, place(log), new THREE.Color("#4e3a2a"));
  mergeTinted(parts, tintedMaterial(q), group, !low);
}

/**
 * Un camion bâché abandonné : le châssis et ses six roues, le plateau et ses ridelles, la bâche tendue sur ses arceaux,
 * la cabine (le capot, la calandre, les phares, les vitres noires) ; la peinture passée, piquée de rouille
 */
function truck(d: Extract<Decor, { k: "truck" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  const { L, W, place } = boxFrame(d, d.front);
  let seed = Math.abs(Math.round(d.x0 * 17 + d.z0 * 5)) + 11;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const paint = new THREE.Color(d.color);
  const rubber = new THREE.Color("#1c1c1b");
  const steelC = new THREE.Color("#55554f");
  const glass = new THREE.Color("#141a1e");
  const canvas = new THREE.Color("#6b6a4b");
  const plank = new THREE.Color("#5a4a38");
  const rusty = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.index ? g.index.count : g.attributes.position!.count;
    const k = Array.from({ length: n }, () => 0.8 + r() * 0.22);
    pushTinted(parts, place(g), c, (v) => k[v] ?? 1);
  };
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c: THREE.Color, rust = false) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    if (rust) rusty(g, c);
    else pushTinted(parts, place(g), c);
  };
  const cabL = Math.min(2.2, L * 0.27);
  const hoodL = cabL * 0.42;
  const cargoL = L - cabL - 0.1;
  const cargoX = -L / 2 + cargoL / 2;
  const front = L / 2;
  // Le châssis, les roues (une à l'avant, deux à l'arrière de chaque côté)
  box(L - 0.5, 0.2, W - 0.7, 0, 0.62, 0, rubber);
  const R = 0.46;
  for (const x of [front - hoodL - 0.2, -L / 2 + 1.1, -L / 2 + 2.15])
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - 0.2);
      const t = new THREE.CylinderGeometry(R, R, 0.32, low ? 10 : 16);
      t.rotateX(Math.PI / 2);
      t.translate(x, R, z);
      pushTinted(parts, place(t), rubber);
      const h = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8);
      h.rotateX(Math.PI / 2);
      h.translate(x, R, z);
      pushTinted(parts, place(h), steelC);
    }
  if (d.kind === "benne") {
    // La benne d'acier, ses renforts, son bouclier au-dessus de la cabine, le tas de gravier dedans
    const steelBox = new THREE.Color(d.color).multiplyScalar(0.85);
    box(cargoL, 0.14, W - 0.1, cargoX, 1.06, 0, steelBox, true);
    for (const s of [-1, 1]) {
      box(cargoL, 0.86, 0.07, cargoX, 1.56, s * (W / 2 - 0.08), steelBox, true);
      for (let k = 0; k < 4; k++) box(0.08, 0.86, 0.05, -L / 2 + 0.3 + (k * (cargoL - 0.5)) / 3, 1.56, s * (W / 2 - 0.02), steelBox, true);
    }
    box(0.08, 0.86, W - 0.1, -L / 2 + 0.06, 1.56, 0, steelBox, true);
    box(0.1, 1.08, W - 0.1, cargoX + cargoL / 2 - 0.05, 1.67, 0, steelBox, true);
    box(0.5, 0.06, W - 0.3, cargoX + cargoL / 2 + 0.2, 2.2, 0, steelBox, true);
    const heap = new THREE.IcosahedronGeometry(1, low ? 1 : 2);
    const hp = heap.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) {
      const j = 0.9 + Math.sin(hp.getX(i) * 9.1) * 0.06 + Math.cos(hp.getZ(i) * 7.7) * 0.06;
      hp.setXYZ(i, hp.getX(i) * j, Math.max(0, hp.getY(i)) * j, hp.getZ(i) * j);
    }
    heap.scale(cargoL * 0.44, 0.75, (W - 0.3) / 2);
    heap.translate(cargoX - 0.1, 1.12, 0);
    pushTinted(parts, place(heap), new THREE.Color("#9a9184"), () => 0.85 + r() * 0.25);
  } else {
    // Le plateau, ses ridelles, la bâche sur ses arceaux
    box(cargoL, 0.12, W, cargoX, 1.0, 0, plank);
    for (const s of [-1, 1]) box(cargoL, 0.5, 0.06, cargoX, 1.31, s * (W / 2 - 0.03), paint, true);
    box(0.06, 0.5, W, -L / 2 + 0.03, 1.31, 0, paint, true);
    const sideH = 0.68;
    const cover = new THREE.BoxGeometry(cargoL - 0.04, sideH, W - 0.02);
    cover.translate(cargoX, 1.56 + sideH / 2, 0);
    pushTinted(parts, place(cover), canvas, () => 0.94);
    const roofR = (W - 0.02) / 2;
    const roofH = Math.max(0.2, 2.7 - (1.56 + sideH));
    const roof = new THREE.CylinderGeometry(roofR, roofR, cargoL - 0.04, low ? 8 : 14, 1, false, 0, Math.PI);
    roof.rotateZ(Math.PI / 2);
    roof.scale(1, roofH / roofR, 1);
    roof.translate(cargoX, 1.56 + sideH, 0);
    pushTinted(parts, place(roof), canvas);
    // Les arceaux qui marquent la bâche
    for (let k = 1; k < 4; k++) {
      const x = -L / 2 + (cargoL * k) / 4;
      box(0.05, sideH, W + 0.01, x, 1.56 + sideH / 2, 0, canvas, false);
      const arc = new THREE.CylinderGeometry(roofR + 0.01, roofR + 0.01, 0.05, low ? 8 : 14, 1, true, 0, Math.PI);
      arc.rotateZ(Math.PI / 2);
      arc.scale(1, roofH / roofR, 1);
      arc.translate(x, 1.56 + sideH, 0);
      pushTinted(parts, place(arc), canvas, () => 0.8);
    }
  }
  // La cabine : la caisse, le capot, la calandre, les phares, le pare-chocs, les vitres
  const cab0 = front - cabL;
  box(cabL - hoodL, 0.77, W - 0.4, cab0 + (cabL - hoodL) / 2, 1.165, 0, paint, true);
  box(cabL - hoodL - 0.1, 0.55, W - 0.5, cab0 + (cabL - hoodL) / 2 - 0.05, 1.825, 0, paint, true);
  box(hoodL, 0.65, W - 0.7, front - hoodL / 2, 1.125, 0, paint, true);
  box(0.05, 0.46, W - 0.9, front + 0.01, 1.1, 0, rubber);
  box(0.12, 0.14, W - 0.3, front + 0.04, 0.72, 0, rubber);
  for (const s of [-1, 1]) {
    const lamp = new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10);
    lamp.rotateZ(Math.PI / 2);
    lamp.translate(front + 0.02, 1.28, s * (W / 2 - 0.5));
    pushTinted(parts, place(lamp), new THREE.Color("#c9c1a0"));
    // Les ailes au-dessus des roues avant
    box(0.95, 0.08, 0.36, front - hoodL - 0.2, 0.98, s * (W / 2 - 0.2), paint, true);
    // La vitre de la portière
    box((cabL - hoodL) * 0.55, 0.32, 0.03, cab0 + (cabL - hoodL) * 0.45, 1.86, s * ((W - 0.5) / 2 + 0.01), glass);
  }
  box(0.03, 0.32, W - 0.7, cab0 + (cabL - hoodL) - 0.09, 1.86, 0, glass);
  mergeTinted(parts, tintedMaterial(q), group, !low);
}

/**
 * Une charrette : un plateau de planches et ses ridelles, deux grandes roues à rayons sur leur essieu, les brancards
 * posés au sol à l'avant ; quelques caisses de vendange dessus
 */
function farmCart(d: Extract<Decor, { k: "cart" }>, group: THREE.Group, q: Quality) {
  const low = q === "bas";
  const parts: THREE.BufferGeometry[] = [];
  const alongX = d.x1 - d.x0 >= d.z1 - d.z0;
  const L = alongX ? d.x1 - d.x0 : d.z1 - d.z0;
  const W = alongX ? d.z1 - d.z0 : d.x1 - d.x0;
  const cx = (d.x0 + d.x1) / 2;
  const cz = (d.z0 + d.z1) / 2;
  // Tout est construit le long de x autour de l'origine, puis tourné et posé
  const place = (g: THREE.BufferGeometry) => {
    if (!alongX) g.rotateY(-Math.PI / 2);
    g.translate(cx, 0, cz);
    return g;
  };
  const plank = new THREE.Color("#7a5a3a");
  const dark = new THREE.Color("#4e3a28");
  const iron = new THREE.Color("#2c2926");
  const w = W - 0.3;
  const bedL = L - 0.1;
  const bedY = 0.74;
  const bed = new THREE.BoxGeometry(bedL, 0.08, w);
  bed.translate(0, bedY, 0);
  pushTinted(parts, place(bed), plank);
  for (const s of [-1, 1]) {
    const side = new THREE.BoxGeometry(bedL, 0.3, 0.05);
    side.translate(0, bedY + 0.19, (s * (w - 0.05)) / 2);
    pushTinted(parts, place(side), plank, () => 0.92);
    for (let k = 0; k < 4; k++) {
      const post = new THREE.BoxGeometry(0.06, 0.42, 0.07);
      post.translate(-bedL / 2 + 0.05 + (k * (bedL - 0.1)) / 3, bedY + 0.16, (s * (w + 0.02)) / 2);
      pushTinted(parts, place(post), dark);
    }
  }
  const back = new THREE.BoxGeometry(0.05, 0.3, w);
  back.translate((-d.front * (bedL - 0.05)) / 2, bedY + 0.19, 0);
  pushTinted(parts, place(back), plank, () => 0.92);
  // L'essieu et les roues, au milieu
  const R = Math.min(0.62, bedY + 0.02);
  const axle = new THREE.CylinderGeometry(0.05, 0.05, w + 0.5, 6);
  axle.rotateX(Math.PI / 2);
  axle.translate(0, R, 0);
  pushTinted(parts, place(axle), dark);
  for (const s of [-1, 1]) {
    const z = s * (w / 2 + 0.16);
    const rim = new THREE.TorusGeometry(R - 0.05, 0.05, low ? 4 : 6, low ? 12 : 20);
    rim.translate(0, R, z);
    pushTinted(parts, place(rim), dark);
    const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8);
    hub.rotateX(Math.PI / 2);
    hub.translate(0, R, z);
    pushTinted(parts, place(hub), iron);
    const spokes = low ? 6 : 10;
    for (let k = 0; k < spokes; k++) {
      const sp = new THREE.BoxGeometry(0.04, R - 0.1, 0.04);
      sp.translate(0, (R - 0.1) / 2, 0);
      sp.rotateZ((k / spokes) * Math.PI * 2);
      sp.translate(0, R, z);
      pushTinted(parts, place(sp), plank, () => 0.8);
    }
  }
  // Les brancards : de l'avant du plateau jusqu'au sol
  for (const s of [-1, 1]) {
    const len = 1.9;
    const sh = new THREE.BoxGeometry(len, 0.07, 0.07);
    const drop = bedY - 0.06;
    sh.rotateZ(-Math.atan2(drop, len) * d.front);
    sh.translate(d.front * (bedL / 2 + len / 2 - 0.15), bedY / 2 + 0.03, (s * (w - 0.2)) / 2);
    pushTinted(parts, place(sh), dark);
  }
  // Des caisses de vendange sur le plateau, des grappes dedans
  if (!low) {
    const grape = new THREE.Color("#3a2242");
    for (const [ox, oz] of [
      [-0.35, -0.22],
      [-0.35, 0.24],
      [0.3, 0.05],
    ] as const) {
      const c = new THREE.BoxGeometry(0.55, 0.28, 0.4);
      c.translate(ox * (bedL / 2), bedY + 0.18, oz * (w / 2) * 1.2);
      pushTinted(parts, place(c), plank, () => 1.08);
      const g = new THREE.BoxGeometry(0.5, 0.05, 0.35);
      g.translate(ox * (bedL / 2), bedY + 0.32, oz * (w / 2) * 1.2);
      pushTinted(parts, place(g), grape);
    }
  }
  mergeTinted(parts, tintedMaterial(q), group, !low);
}

const steel = new THREE.MeshLambertMaterial({ color: "#3e4246" });
const lampGlow = new THREE.MeshBasicMaterial({ color: "#ffe2a8" });
const water = new THREE.MeshLambertMaterial({ color: "#3f5f6a", transparent: true, opacity: 0.82, emissive: "#0d1a1f" });
/** La mer : sombre, lisse, des vaguelettes qui glissent, le ciel qui s'y reflète */
const seaMaterial = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 128, 128);
  let seed = 3;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 220; i++) {
    const v = Math.floor(90 + r() * 90);
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.beginPath();
    g.ellipse(r() * 128, r() * 128, 4 + r() * 12, 1.5 + r() * 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  const height = new THREE.CanvasTexture(c);
  const normal = normalFrom(height, "normal:mer", 1.6);
  normal.repeat.set(60, 30);
  return new THREE.MeshStandardMaterial({
    color: "#23404a",
    roughness: 0.14,
    metalness: 0.1,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
})();
const wireMat = new THREE.LineBasicMaterial({ color: "#2b2b2b" });
const clockFace = new THREE.MeshLambertMaterial({ color: "#efe8d6" });
const clockHand = new THREE.MeshBasicMaterial({ color: "#1d1d1d" });

function addDecor(d: Decor, ctx: Ctx, q: Quality) {
  const low = q === "bas";
  const { bucket, group } = ctx;
  switch (d.k) {
    case "house":
      addHouse(d, ctx);
      return;
    case "container":
      addContainer(d, ctx);
      return;
    case "crane":
      addCrane(d, ctx);
      return;
    case "quay":
      addQuay(d, ctx);
      return;
    case "wagon":
      addWagon(d, ctx);
      return;
    case "roof": {
      roofExtras(d, ctx, q);
      const b = bucket(d.m);
      const t = 1 / (TILE[d.m] ?? 2);
      const { x0, x1, z0, z1, y, h } = d;
      const top = y + h;
      if (d.axis === "x") {
        const zm = (z0 + z1) / 2;
        const slope = Math.hypot(zm - z0, h);
        const ny = (zm - z0) / slope;
        const nz = h / slope;
        // Le pan sud puis le pan nord
        pushFace(
          b,
          [
            [x1, y, z0],
            [x0, y, z0],
            [x0, top, zm],
            [x1, top, zm],
          ],
          [0, ny, -nz],
          [
            [x0 * t, 0],
            [x1 * t, 0],
            [x1 * t, slope * t],
            [x0 * t, slope * t],
          ],
          [
            [0.85, 0.85, 0.85],
            [0.85, 0.85, 0.85],
            [1, 1, 1],
            [1, 1, 1],
          ],
        );
        pushFace(
          b,
          [
            [x0, y, z1],
            [x1, y, z1],
            [x1, top, zm],
            [x0, top, zm],
          ],
          [0, ny, nz],
          [
            [x1 * t, 0],
            [x0 * t, 0],
            [x0 * t, slope * t],
            [x1 * t, slope * t],
          ],
          [
            [0.85, 0.85, 0.85],
            [0.85, 0.85, 0.85],
            [1, 1, 1],
            [1, 1, 1],
          ],
        );
        const g = bucket(d.wall ?? "crepi2");
        for (const [x, s] of [
          [x0 + 0.3, -1],
          [x1 - 0.3, 1],
        ] as const) {
          const p =
            s > 0
              ? [
                  [x, y, z1 - 0.3],
                  [x, y, z0 + 0.3],
                  [x, top - 0.1, zm],
                ]
              : [
                  [x, y, z0 + 0.3],
                  [x, y, z1 - 0.3],
                  [x, top - 0.1, zm],
                ];
          for (const q of p) {
            g.pos.push(...q);
            g.nor.push(s, 0, 0);
            g.uv.push(q[2]! / 3, q[1]! / 3);
            g.col.push(0.9, 0.9, 0.9);
          }
        }
      } else {
        const xm = (x0 + x1) / 2;
        const slope = Math.hypot(xm - x0, h);
        const ny = (xm - x0) / slope;
        const nx = h / slope;
        pushFace(
          b,
          [
            [x0, y, z0],
            [x0, y, z1],
            [xm, top, z1],
            [xm, top, z0],
          ],
          [-nx, ny, 0],
          [
            [z1 * t, 0],
            [z0 * t, 0],
            [z0 * t, slope * t],
            [z1 * t, slope * t],
          ],
          [
            [0.85, 0.85, 0.85],
            [0.85, 0.85, 0.85],
            [1, 1, 1],
            [1, 1, 1],
          ],
        );
        pushFace(
          b,
          [
            [x1, y, z1],
            [x1, y, z0],
            [xm, top, z0],
            [xm, top, z1],
          ],
          [nx, ny, 0],
          [
            [z0 * t, 0],
            [z1 * t, 0],
            [z1 * t, slope * t],
            [z0 * t, slope * t],
          ],
          [
            [0.85, 0.85, 0.85],
            [0.85, 0.85, 0.85],
            [1, 1, 1],
            [1, 1, 1],
          ],
        );
        const g = bucket(d.wall ?? "crepi2");
        for (const [z, s] of [
          [z0 + 0.3, -1],
          [z1 - 0.3, 1],
        ] as const) {
          const p =
            s > 0
              ? [
                  [x0 + 0.3, y, z],
                  [x1 - 0.3, y, z],
                  [xm, top - 0.1, z],
                ]
              : [
                  [x1 - 0.3, y, z],
                  [x0 + 0.3, y, z],
                  [xm, top - 0.1, z],
                ];
          for (const q of p) {
            g.pos.push(...q);
            g.nor.push(0, 0, s);
            g.uv.push(q[0]! / 3, q[1]! / 3);
            g.col.push(0.9, 0.9, 0.9);
          }
        }
      }
      return;
    }
    case "spire": {
      const b = bucket(d.m);
      const xm = (d.x0 + d.x1) / 2;
      const zm = (d.z0 + d.z1) / 2;
      const apex = [xm, d.y + d.h, zm];
      const c = [
        [d.x0, d.y, d.z1],
        [d.x1, d.y, d.z1],
        [d.x1, d.y, d.z0],
        [d.x0, d.y, d.z0],
      ];
      for (let k = 0; k < 4; k++) {
        const a = c[k]!;
        const e = c[(k + 1) % 4]!;
        const n = new THREE.Vector3()
          .subVectors(new THREE.Vector3(...e), new THREE.Vector3(...a))
          .cross(new THREE.Vector3(apex[0]! - a[0]!, apex[1]! - a[1]!, apex[2]! - a[2]!))
          .normalize();
        b.tri(
          [a, e, apex],
          [n.x, n.y, n.z],
          [
            [0, 0],
            [1, 0],
            [0.5, d.h / 2],
          ],
          [0.9, 0.9, 0.9],
        );
      }
      return;
    }
    case "tree": {
      tree(d, group, q);
      return;
    }
    case "pine": {
      pine(d, group, q);
      return;
    }
    case "rail": {
      const b = bucket("metal");
      const s = bucket("bois");
      for (const dz of [-0.72, 0.72]) addBox(b, d.x0, 0, d.z + dz - 0.04, d.x1, 0.14, d.z + dz + 0.04, 2, 0.7, true);
      for (let x = d.x0 + 0.3; x < d.x1; x += 0.65) addBox(s, x - 0.12, 0, d.z - 1.2, x + 0.12, 0.08, d.z + 1.2, 2, 0.6, true);
      return;
    }
    case "lamp": {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, d.h, 6), steel);
      pole.position.set(d.x, d.h / 2, d.z);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.35), steel);
      head.position.set(d.x, d.h, d.z);
      group.add(head);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.26), lampGlow);
      glow.position.set(d.x, d.h - 0.12, d.z);
      group.add(glow);
      return;
    }
    case "patch": {
      const b = bucket(d.m);
      const t = 1 / (TILE[d.m] ?? 3);
      const y = 0.012;
      const p = [
        [d.x0, y, d.z1],
        [d.x1, y, d.z1],
        [d.x1, y, d.z0],
        [d.x0, y, d.z0],
      ];
      pushFace(
        b,
        p,
        [0, 1, 0],
        p.map((q) => [q[0]! * t, -q[2]! * t]),
        p.map(() => [1, 1, 1]),
      );
      return;
    }
    case "water": {
      const big = d.x1 - d.x0 > 100;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.x1 - d.x0, d.z1 - d.z0), big && !low ? seaMaterial : water);
      m.rotation.x = -Math.PI / 2;
      m.position.set((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2);
      group.add(m);
      return;
    }
    case "tank": {
      // Les tuyaux restent des cylindres de tôle ; une vraie citerne a des fonds bombés, une peinture lisse, des cerclages
      if (d.r < 0.8) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.x1 - d.x0, low ? 10 : 18), matMaterial("metal", q, false));
        m.rotation.z = Math.PI / 2;
        m.position.set((d.x0 + d.x1) / 2, d.y + 0.2, d.z);
        m.castShadow = true;
        group.add(m);
        return;
      }
      const parts: THREE.BufferGeometry[] = [];
      const r = seededRand(d.x0, d.z, 13);
      const paint = new THREE.Color("#8d978f");
      const iron = new THREE.Color("#4a4c4a");
      const cx = (d.x0 + d.x1) / 2;
      const y = d.y + 0.2;
      const dome = d.r * 0.35;
      const len = d.x1 - d.x0 - dome * 2;
      const seg = low ? 14 : 24;
      const grime = () => 0.92 + r() * 0.1;
      const body = new THREE.CylinderGeometry(d.r, d.r, len, seg, 1, true);
      body.rotateZ(Math.PI / 2);
      body.translate(cx, y, d.z);
      pushTinted(parts, body, paint, grime);
      for (const s of [-1, 1]) {
        const end = new THREE.SphereGeometry(d.r, seg, low ? 5 : 8, 0, Math.PI * 2, 0, Math.PI / 2);
        end.rotateZ((-s * Math.PI) / 2);
        end.scale(0.35, 1, 1);
        end.translate(cx + (s * len) / 2, y, d.z);
        pushTinted(parts, end, paint, grime);
      }
      for (const f of [-0.38, 0, 0.38]) {
        const band = new THREE.CylinderGeometry(d.r + 0.025, d.r + 0.025, 0.12, seg, 1, true);
        band.rotateZ(Math.PI / 2);
        band.translate(cx + f * len, y, d.z);
        pushTinted(parts, band, iron);
      }
      const hatch = new THREE.CylinderGeometry(0.32, 0.36, 0.3, 12);
      hatch.translate(cx + len * 0.2, y + d.r + 0.08, d.z);
      pushTinted(parts, hatch, paint, () => 0.85);
      mergeTinted(parts, tintedMaterial(q), group, true);
      return;
    }
    case "tower": {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.h, low ? 10 : 18), matMaterial("rouille", q, false));
      tank.position.set(d.x, d.y + d.h / 2, d.z);
      tank.castShadow = true;
      group.add(tank);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(d.r * 1.05, 1.2, low ? 10 : 18), matMaterial("metal", q, false));
      cap.position.set(d.x, d.y + d.h + 0.6, d.z);
      group.add(cap);
      return;
    }
    case "wire": {
      const pts: THREE.Vector3[] = [];
      const n = 18;
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        const x = d.x0 + (d.x1 - d.x0) * f;
        const z = d.z0 + (d.z1 - d.z0) * f;
        pts.push(new THREE.Vector3(x, 0.4 + Math.sin(k * 1.7) * 0.25 + (k % 2) * 0.3, z + Math.cos(k * 2.3) * 0.15));
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      const posts = bucket("bois");
      addBox(posts, d.x0 - 0.04, 0, d.z0 - 0.04, d.x0 + 0.04, 1, d.z0 + 0.04, 1, 0.7, true);
      addBox(posts, d.x1 - 0.04, 0, d.z1 - 0.04, d.x1 + 0.04, 1, d.z1 + 0.04, 1, 0.7, true);
      return;
    }
    case "clock": {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), clockFace);
      face.position.set(d.x + d.nx * 0.02, d.y, d.z + d.nz * 0.02);
      face.lookAt(d.x + d.nx * 2, d.y, d.z + d.nz * 2);
      group.add(face);
      for (const [len, a] of [
        [0.6, 0.6],
        [0.42, 2.4],
      ] as const) {
        const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.06, len), clockHand);
        hand.position.copy(face.position).add(new THREE.Vector3(d.nx * 0.01, 0, d.nz * 0.01));
        hand.lookAt(d.x + d.nx * 2, d.y, d.z + d.nz * 2);
        hand.rotateZ(a);
        hand.translateY(len / 2);
        group.add(hand);
      }
      return;
    }
    case "car":
      addCar(d, ctx);
      return;
    case "palm":
      palm(d, group, q);
      return;
    case "hangar":
      hangarVault(d, group, q);
      return;
    case "plane":
      parkedPlane(d, group, q);
      return;
    case "windsock":
      windsock(d, group);
      return;
    case "marks":
      groundMarks(d, group);
      return;
    case "conveyor":
      conveyor(d, group);
      return;
    case "vines":
      vines(d, group, q);
      return;
    case "casks":
      casks(d, group, q);
      return;
    case "cart":
      farmCart(d, group, q);
      return;
    case "tun":
      tun(d, group, q);
      return;
    case "logs":
      logs(d, group, q);
      return;
    case "saw":
      saw(d, group, q);
      return;
    case "truck":
      truck(d, group, q);
      return;
    case "stall":
      stall(d, group, q);
      return;
    case "baggage":
      baggage(d, group, q);
      return;
    case "shelter":
      shelter(d, group, q);
      return;
    case "tankcar":
      tankCar(d, group, q);
      return;
    case "awning":
      awning(d, group);
      return;
  }
}

const carPaints = new Map<string, THREE.Material>();
const sootGlass = new THREE.MeshStandardMaterial({ color: "#0d0e10", roughness: 0.35, metalness: 0.2 });
/**
 * Une voiture brûlée : la tôle rouillée (ses boîtes), et par-dessus ses roues, sa couleur qui reste sous la suie le long
 * des flancs, ses vitres noires et crevées, ses pare-chocs. Un autobus, s'il est long.
 */
function addCar(d: Extract<Decor, { k: "car" }>, ctx: Ctx) {
  const alongX = d.x1 - d.x0 >= d.z1 - d.z0;
  const L = alongX ? d.x1 - d.x0 : d.z1 - d.z0;
  const W = alongX ? d.z1 - d.z0 : d.x1 - d.x0;
  const bus = L > 7;
  const r = bus ? 0.48 : 0.34;
  // Les roues : celles des wagons, ramenées à la taille d'une roue de voiture
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(alongX ? 1 : 0, 0, alongX ? 0 : 1), Math.PI / 2);
  const scale = new THREE.Vector3(r / 0.44, 0.24 / 0.13, r / 0.44);
  for (const k of bus ? [0.14, 0.78] : [0.18, 0.82])
    for (const side of [-1, 1]) {
      const along = (alongX ? d.x0 : d.z0) + L * k;
      const across = (alongX ? (d.z0 + d.z1) / 2 : (d.x0 + d.x1) / 2) + side * (W / 2 + 0.02);
      const pos = alongX ? new THREE.Vector3(along, r, across) : new THREE.Vector3(across, r, along);
      ctx.instance("wheel", m4.compose(pos, q, scale));
    }
  // La couleur d'origine, en bande sur les flancs (noircie), les vitres noires, les pare-chocs
  let paint = carPaints.get(d.color);
  if (!paint) {
    paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color).multiplyScalar(0.62), roughness: 0.75, metalness: 0.3 });
    carPaints.set(d.color, paint);
  }
  const slab = (a0: number, a1: number, y0: number, y1: number, c0: number, c1: number, mat: THREE.Material) => {
    const g = new THREE.BoxGeometry(alongX ? a1 - a0 : c1 - c0, y1 - y0, alongX ? c1 - c0 : a1 - a0);
    const m = new THREE.Mesh(g, mat);
    const ca = (a0 + a1) / 2;
    const cc = (c0 + c1) / 2;
    m.position.set(alongX ? ca : cc, (y0 + y1) / 2, alongX ? cc : ca);
    m.castShadow = !ctx.low;
    ctx.group.add(m);
  };
  const a0 = alongX ? d.x0 : d.z0;
  const c0 = alongX ? d.z0 : d.x0;
  const c1 = alongX ? d.z1 : d.x1;
  for (const [p, q2] of [
    [c0 - 0.015, c0 + 0.01],
    [c1 - 0.01, c1 + 0.015],
  ] as const) {
    slab(a0 + 0.15, a0 + L - 0.15, 0.48, 0.82, p, q2, paint);
    // Les vitres de l'habitacle (ou toute la rangée de fenêtres d'un autobus)
    if (bus) slab(a0 + 0.4, a0 + L - 0.6, 1.0, 1.4, p, q2, sootGlass);
    else slab(a0 + L * 0.34, a0 + L * 0.78, 1.0, 1.4, p + (p < c0 ? 0.12 : -0.12), q2 + (p < c0 ? 0.12 : -0.12), sootGlass);
  }
  // Le pare-brise et la lunette arrière, les pare-chocs
  if (!bus) {
    slab(a0 + L * 0.32 - 0.02, a0 + L * 0.32 + 0.01, 1.0, 1.4, c0 + 0.2, c1 - 0.2, sootGlass);
    slab(a0 + L * 0.8 - 0.01, a0 + L * 0.8 + 0.02, 1.0, 1.4, c0 + 0.2, c1 - 0.2, sootGlass);
  }
  slab(a0 - 0.06, a0 + 0.02, 0.3, 0.5, c0 + 0.1, c1 - 0.1, sootGlass);
  slab(a0 + L - 0.02, a0 + L + 0.06, 0.3, 0.5, c0 + 0.1, c1 - 0.1, sootGlass);
}

/**
 * Ce qui finit un toit : le dessous du débord (on ne voit plus le ciel au travers en levant les yeux sous l'avant-toit),
 * la planche de rive, les tuiles faîtières, et une cheminée sur les toits de tuiles
 */
function roofExtras(d: Extract<Decor, { k: "roof" }>, ctx: Ctx, q: Quality) {
  const { x0, x1, z0, z1, y, h } = d;
  const top = y + h;
  const under = ctx.bucket(d.m === "metal" ? "metal" : "planche");
  const dark = [0.55, 0.55, 0.55];
  const t = 1 / 1.6;
  if (d.axis === "x") {
    const zm = (z0 + z1) / 2;
    // Les dessous des deux pans, tournés vers le bas
    pushFace(
      under,
      [
        [x0, y - 0.02, z0],
        [x1, y - 0.02, z0],
        [x1, top - 0.02, zm],
        [x0, top - 0.02, zm],
      ],
      [0, -1, 0],
      [
        [0, 0],
        [(x1 - x0) * t, 0],
        [(x1 - x0) * t, 1],
        [0, 1],
      ],
      [dark, dark, dark, dark],
    );
    pushFace(
      under,
      [
        [x1, y - 0.02, z1],
        [x0, y - 0.02, z1],
        [x0, top - 0.02, zm],
        [x1, top - 0.02, zm],
      ],
      [0, -1, 0],
      [
        [0, 0],
        [(x1 - x0) * t, 0],
        [(x1 - x0) * t, 1],
        [0, 1],
      ],
      [dark, dark, dark, dark],
    );
    for (const z of [z0, z1]) addBox(ctx.bucket("bois"), x0, y - 0.16, z - 0.03, x1, y + 0.02, z + 0.03, 2, 0.7, false);
  } else {
    const xm = (x0 + x1) / 2;
    pushFace(
      under,
      [
        [x0, y - 0.02, z1],
        [x0, y - 0.02, z0],
        [xm, top - 0.02, z0],
        [xm, top - 0.02, z1],
      ],
      [0, -1, 0],
      [
        [0, 0],
        [(z1 - z0) * t, 0],
        [(z1 - z0) * t, 1],
        [0, 1],
      ],
      [dark, dark, dark, dark],
    );
    pushFace(
      under,
      [
        [x1, y - 0.02, z0],
        [x1, y - 0.02, z1],
        [xm, top - 0.02, z1],
        [xm, top - 0.02, z0],
      ],
      [0, -1, 0],
      [
        [0, 0],
        [(z1 - z0) * t, 0],
        [(z1 - z0) * t, 1],
        [0, 1],
      ],
      [dark, dark, dark, dark],
    );
    for (const x of [x0, x1]) addBox(ctx.bucket("bois"), x - 0.03, y - 0.16, z0, x + 0.03, y + 0.02, z1, 2, 0.7, false);
  }
  if (d.m !== "tuile") return;
  // Les tuiles faîtières, le long du faîte
  const len = d.axis === "x" ? x1 - x0 : z1 - z0;
  // Un demi-cylindre couché, bombé vers le haut, le long du faîte
  const ridgeGeo = new THREE.CylinderGeometry(0.13, 0.13, len, ctx.low ? 6 : 10, 1, false, 0, Math.PI);
  ridgeGeo.rotateZ(Math.PI / 2);
  if (d.axis === "z") ridgeGeo.rotateY(Math.PI / 2);
  const ridge = new THREE.Mesh(ridgeGeo, matMaterial("tuile", q, false));
  ridge.position.set((x0 + x1) / 2, top - 0.02, (z0 + z1) / 2);
  ridge.castShadow = true;
  ctx.group.add(ridge);
  // Une cheminée, sur un pan, au quart du faîte
  const span = d.axis === "x" ? z1 - z0 : x1 - x0;
  if (span < 4.5) return;
  const stone = ctx.bucket(d.wall === "bois" || !d.wall ? "pierre" : d.wall);
  const cap = ctx.bucket("taille");
  const [cx, cz] = d.axis === "x" ? [x0 + len * 0.27, (z0 + z1) / 2 + 0.75] : [(x0 + x1) / 2 + 0.75, z0 + len * 0.27];
  const roofAt = top - (0.75 / (span / 2)) * h;
  addBox(stone, cx - 0.36, roofAt - 0.6, cz - 0.36, cx + 0.36, top + 0.95, cz + 0.36, 1.2, 0.95, false);
  addBox(cap, cx - 0.44, top + 0.95, cz - 0.44, cx + 0.44, top + 1.05, cz + 0.44, 1, 0.9, false);
  addBox(ctx.bucket("tuile"), cx - 0.12, top + 1.05, cz - 0.12, cx + 0.12, top + 1.3, cz + 0.12, 1, 0.85, true);
}

/**
 * Un sac de sable, en coussin : le dessus et le dessous à plat, les flancs arrondis, les deux bouts pincés (64
 * triangles, ombré en douceur), de la taille d'un vrai sac (0,56 × 0,17 × 0,34)
 */
function pillowGeometry(): THREE.BufferGeometry {
  const P: [number, number][] = [
    [-0.36, 0.5],
    [0.36, 0.5],
    [0.5, 0.28],
    [0.5, -0.32],
    [0.4, -0.5],
    [-0.4, -0.5],
    [-0.5, -0.32],
    [-0.5, 0.28],
  ];
  const rings: [number, number][] = [
    [-0.5, 0.72],
    [-0.4, 1],
    [0.4, 1],
    [0.5, 0.72],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const [x, k] of rings)
    for (let i = 0; i < 8; i++) {
      const [z, y] = P[i]!;
      pos.push(x, y * k, z * k);
      uv.push(x + 0.5, i / 8);
    }
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 8; i++) {
      const a = r * 8 + i;
      const b = r * 8 + ((i + 1) % 8);
      const c = (r + 1) * 8 + ((i + 1) % 8);
      const d = (r + 1) * 8 + i;
      idx.push(a, b, c, a, c, d);
    }
  const c0 = pos.length / 3;
  pos.push(-0.5, 0, 0);
  uv.push(0, 0.5);
  const c1 = pos.length / 3;
  pos.push(0.5, 0, 0);
  uv.push(1, 0.5);
  for (let i = 0; i < 8; i++) idx.push(c0, (i + 1) % 8, i, c1, 24 + i, 24 + ((i + 1) % 8));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.scale(0.56, 0.17, 0.34);
  g.computeVertexNormals();
  return g;
}

/**
 * Des sacs de sable posés en quinconce, rang par rang, un peu de travers, de teintes un peu différentes. Un rempart en
 * aligne des milliers : chaque sac est un coussin léger (64 triangles), les rangs du milieu d'un mur épais (qu'on ne voit
 * pas) ne sont pas dessinés, et l'ombre vient d'une boîte invisible par mur, pas de chaque sac
 */
function sandbagMesh(boxes: THREE.Box3[], q: Quality): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const base = pillowGeometry();
  const tints = ["#a8996f", "#9c8d64", "#b3a479", "#8f835e", "#a39270"];
  const c = new THREE.Color();
  let n = 0;
  for (const b of boxes) {
    const dx = b.max.x - b.min.x;
    const dz = b.max.z - b.min.z;
    const alongX = dx >= dz;
    const len = alongX ? dx : dz;
    const depth = alongX ? dz : dx;
    const rows = Math.max(1, Math.round(depth / 0.32));
    const layers = Math.max(1, Math.round((b.max.y - b.min.y) / 0.16));
    const per = Math.max(1, Math.round(len / 0.55));
    const step = len / per;
    for (let l = 0; l < layers; l++) {
      for (let r = 0; r < rows; r++) {
        if (rows > 2 && r > 0 && r < rows - 1 && l < layers - 1) continue;
        const shift = (l + r) % 2 ? step / 2 : 0;
        for (let k = 0; k < per + (shift ? 1 : 0); k++) {
          const a = -len / 2 + step * (k + 0.5) - shift;
          if (a < -len / 2 + 0.1 || a > len / 2 - 0.1) continue;
          const across = -depth / 2 + (depth / rows) * (r + 0.5);
          const g = base.clone();
          const h = Math.sin(n * 12.9898) * 43758.5453;
          const j = h - Math.floor(h);
          n++;
          g.scale((step / 0.56) * 1.02, 1, (depth / rows / 0.34) * 1.05);
          g.rotateY((j - 0.5) * 0.12 + (alongX ? 0 : Math.PI / 2));
          const y = b.min.y + 0.085 + l * ((b.max.y - b.min.y - 0.17) / Math.max(1, layers - 1));
          g.translate((b.min.x + b.max.x) / 2 + (alongX ? a : across), y, (b.min.z + b.max.z) / 2 + (alongX ? across : a));
          c.set(tints[Math.floor(j * tints.length)]!);
          const col = new Float32Array(g.attributes.position!.count * 3);
          for (let i = 0; i < col.length; i += 3) {
            col[i] = c.r;
            col[i + 1] = c.g;
            col[i + 2] = c.b;
          }
          g.setAttribute("color", new THREE.BufferAttribute(col, 3));
          parts.push(g);
        }
      }
    }
  }
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  base.dispose();
  const tex = clothTexture("#d8d0b8", ["#c4b998", "#e4dcc4"], "taches");
  const mat =
    q === "bas"
      ? new THREE.MeshLambertMaterial({ map: tex, vertexColors: true })
      : new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 1, normalMap: normalFrom(tex, "normal:jute", 1.5) });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // L'ombre des murs de sacs : une boîte par mur, invisible à l'écran (et pour l'occlusion ambiante)
  const shadow = mergeGeometries(
    boxes.map((b) => {
      const g = new THREE.BoxGeometry(b.max.x - b.min.x - 0.04, b.max.y - b.min.y - 0.02, b.max.z - b.min.z - 0.04);
      g.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2 - 0.01, (b.min.z + b.max.z) / 2);
      return g;
    }),
    false,
  );
  if (shadow) {
    const caster = new THREE.Mesh(
      shadow,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    caster.castShadow = true;
    caster.receiveShadow = false;
    mesh.add(caster);
  }
  return mesh;
}

/** Les bottes de foin : des blocs aux arêtes arrondies, serrés de deux ficelles */
function baleMesh(boxes: THREE.Box3[], q: Quality): THREE.Group {
  const g = new THREE.Group();
  const straw: THREE.BufferGeometry[] = [];
  const twine: THREE.BufferGeometry[] = [];
  for (const b of boxes) {
    const size = b.getSize(new THREE.Vector3());
    const center = b.getCenter(new THREE.Vector3());
    const bale = new RoundedBoxGeometry(size.x - 0.02, size.y - 0.02, size.z - 0.02, q === "bas" ? 1 : 3, 0.12);
    // La toile du foin, à l'échelle de la botte
    const uv = bale.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(size.x, size.z) * 0.8, uv.getY(i) * size.y * 0.8);
    bale.translate(center.x, center.y, center.z);
    straw.push(bale);
    const alongX = size.x >= size.z;
    for (const f of [-0.25, 0.25]) {
      const t = new THREE.BoxGeometry(alongX ? 0.03 : size.x + 0.01, size.y + 0.01, alongX ? size.z + 0.01 : 0.03).toNonIndexed();
      t.translate(center.x + (alongX ? f * size.x : 0), center.y, center.z + (alongX ? 0 : f * size.z));
      twine.push(t);
    }
  }
  const strawMat =
    q === "bas"
      ? new THREE.MeshLambertMaterial({ map: matTexture("foin", 128) ?? undefined })
      : new THREE.MeshStandardMaterial({
          map: matTexture("foin", 256) ?? undefined,
          normalMap: normalTexture("foin", 256, 2) ?? undefined,
          roughness: 1,
        });
  const s = new THREE.Mesh(mergeGeometries(straw, false)!, strawMat);
  s.castShadow = true;
  s.receiveShadow = true;
  g.add(s);
  const tw = new THREE.Mesh(mergeGeometries(twine, false)!, new THREE.MeshLambertMaterial({ color: "#6e5a3a" }));
  g.add(tw);
  for (const p of [...straw, ...twine]) p.dispose();
  return g;
}
