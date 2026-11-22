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
    const col = new Float32Array(g.attributes.position!.count * 3).fill(0.32);
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
 * Des tonneaux couchés sur leur chantier (deux poutres), le fond tourné vers l'allée : des douelles plus ou moins
 * foncées, quatre cercles de fer, le fond plus sombre
 */
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
  const L = 1.08;
  const prof: THREE.Vector2[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    prof.push(new THREE.Vector2(0.36 + Math.sin(t * Math.PI) * 0.08, -L / 2 + t * L));
  }
  const seg = low ? 10 : 16;
  const iron = new THREE.Color("#2c2926");
  for (let i = 0; i < n; i++) {
    const x = d.x0 + gap * (i + 0.5);
    const y = 0.16 + 0.44;
    const wood = new THREE.Color().setHSL(0.07 + ((i * 7) % 5) * 0.006, 0.45, 0.25 + ((i * 3) % 4) * 0.02);
    const body = new THREE.LatheGeometry(prof, seg);
    body.rotateX(Math.PI / 2);
    body.translate(x, y, d.z);
    // Une douelle sur deux un peu plus foncée
    const bp = body.index ? body.toNonIndexed() : body;
    const pp = bp.attributes.position as THREE.BufferAttribute;
    const shades: number[] = [];
    for (let v = 0; v < pp.count; v += 3) {
      const cx = (pp.getX(v) + pp.getX(v + 1) + pp.getX(v + 2)) / 3 - x;
      const cy = (pp.getY(v) + pp.getY(v + 1) + pp.getY(v + 2)) / 3 - y;
      const stave = Math.floor(((Math.atan2(cy, cx) + Math.PI) / (Math.PI * 2)) * seg);
      const k = stave % 2 === 0 ? 1 : 0.86;
      shades.push(k, k, k);
    }
    pushTinted(parts, bp, wood, (v) => shades[v]!);
    if (bp !== body) body.dispose();
    for (const t of [-0.44, -0.2, 0.2, 0.44]) {
      const rr = 0.36 + Math.sin((t / L + 0.5) * Math.PI) * 0.08 + 0.012;
      const h = new THREE.CylinderGeometry(rr, rr, 0.05, seg, 1, true);
      h.rotateX(Math.PI / 2);
      h.translate(x, y, d.z + t);
      pushTinted(parts, h, iron);
    }
    for (const e of [-1, 1]) {
      const c = new THREE.CircleGeometry(0.355, seg);
      if (e < 0) c.rotateY(Math.PI);
      c.translate(x, y, d.z + (e * L) / 2 - e * 0.02);
      pushTinted(parts, c, wood, () => 0.7);
    }
  }
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
      const m = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.x1 - d.x0, low ? 10 : 18), matMaterial("metal", q, false));
      m.rotation.z = Math.PI / 2;
      m.position.set((d.x0 + d.x1) / 2, d.y + 0.2, d.z);
      m.castShadow = true;
      group.add(m);
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

/** Des sacs de sable posés en quinconce, rang par rang, un peu de travers, de teintes un peu différentes */
function sandbagMesh(boxes: THREE.Box3[], q: Quality): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const base = new RoundedBoxGeometry(0.56, 0.17, 0.34, q === "haut" ? 2 : 1, 0.07);
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
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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
