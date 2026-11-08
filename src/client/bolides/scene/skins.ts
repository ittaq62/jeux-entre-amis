// La peinture d'un véhicule : une matière standard à laquelle on ajoute un motif calculé d'après la position sur la
// carrosserie (donc valable pour toutes les formes de véhicules, sans texture à dessiner).

import * as THREE from "three";
import type { SkinId } from "../../../shared/games/bolides/garage.ts";

/** Le motif de chaque skin, en GLSL : `c` est la couleur, `e` la lumière propre, `p` la position sur la carrosserie */
const PATTERNS: Partial<Record<SkinId, string>> = {
  bandes: `
    float a = abs(p.x);
    float band = smoothstep(0.075, 0.085, a) * (1.0 - smoothstep(0.235, 0.245, a));
    c = mix(c, vec3(0.96), band);`,
  damier: `
    float k = mod(floor(p.x * 4.5 + 100.0) + floor(p.z * 4.5 + 100.0) + floor(p.y * 4.5 + 100.0), 2.0);
    c = mix(vec3(0.05), vec3(0.92), k);`,
  camo: `
    float n = sNoise(p.xz * 2.3 + p.y * 1.9) * 0.65 + sNoise(p.zx * 5.1 - p.y) * 0.35;
    c = n < 0.42 ? vec3(0.13, 0.17, 0.08) : n < 0.56 ? vec3(0.26, 0.3, 0.14) : vec3(0.46, 0.42, 0.24);`,
  flammes: `
    float f = (p.z + 0.5) / 1.9 + 0.13 * sin(p.x * 13.0 + p.y * 4.0) + 0.07 * sin(p.x * 29.0 + p.y * 11.0);
    vec3 hot = mix(vec3(0.85, 0.07, 0.02), vec3(1.0, 0.75, 0.12), smoothstep(0.55, 0.95, f));
    c = mix(vec3(0.03), hot, smoothstep(0.42, 0.45, f));
    e = hot * 0.25 * smoothstep(0.42, 0.45, f);`,
  carbone: `
    float w = step(0.5, fract((p.x + p.z) * 16.0)) * 0.5 + step(0.5, fract((p.x - p.z) * 16.0)) * 0.5;
    c = mix(vec3(0.035), vec3(0.11), w);`,
  neon: `
    c = vec3(0.025, 0.012, 0.07);
    float l = max(smoothstep(0.92, 1.0, fract(p.z * 3.5)), smoothstep(0.92, 1.0, fract(p.x * 3.5 + 0.5)));
    vec3 glow = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.15, 0.75), 0.5 + 0.5 * sin(uSkinTime * 1.4 + p.z * 1.5));
    c = mix(c, glow, l * 0.7);
    e = glow * l * 1.3;`,
  arcenciel: `
    float h = fract((p.x + p.z) * 0.32 + p.y * 0.15 + uSkinTime * 0.3) * 6.0;
    c = clamp(abs(mod(h + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    c = c * c * 0.85 + 0.05;
    e = c * 0.14;`,
  galaxie: `
    float g = sNoise(p.xz * 1.6 + p.y) * 0.7 + sNoise(p.xz * 4.0 - p.y) * 0.3;
    c = mix(vec3(0.03, 0.012, 0.13), vec3(0.3, 0.09, 0.55), smoothstep(0.35, 0.8, g));
    float s = step(0.965, sHash(floor(p.xz * 24.0) + floor(p.y * 24.0)));
    float tw = 0.55 + 0.45 * sin(uSkinTime * 3.0 + sHash(floor(p.xz * 24.0)) * 40.0);
    c += vec3(s * tw);
    e = vec3(s * tw) * 0.9;`,
};

export interface PaintSet {
  paint: THREE.MeshStandardMaterial;
  paintDark: THREE.MeshStandardMaterial;
  /** À appeler à chaque image pour les skins animés */
  tick: (time: number) => void;
}

/** La peinture (et sa version plus sombre) d'un véhicule, à la couleur de son pilote pour le skin d'usine */
export function paintFor(skin: SkinId, color: string): PaintSet {
  const time = { value: 0 };
  const make = (shade: number): THREE.MeshStandardMaterial => {
    const base = new THREE.Color(color).multiplyScalar(shade);
    const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.32, metalness: 0.15 });
    if (skin === "chrome") {
      mat.color.set(0xe8edf2).multiplyScalar(shade);
      mat.metalness = 1;
      mat.roughness = 0.08;
    } else if (skin === "or") {
      mat.color.set(0xffc95a).multiplyScalar(shade);
      mat.metalness = 1;
      mat.roughness = 0.18;
    } else if (skin === "carbone") {
      mat.roughness = 0.42;
      mat.metalness = 0.4;
    } else if (skin === "camo") {
      mat.roughness = 0.75;
      mat.metalness = 0;
    }
    const pattern = PATTERNS[skin];
    if (!pattern) return mat;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSkinTime = time;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSkinPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSkinPos = position;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vSkinPos;
          uniform float uSkinTime;
          vec3 skinGlow = vec3(0.0);
          float sHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
          float sNoise(vec2 q) {
            vec2 i = floor(q);
            vec2 f = fract(q);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          {
            vec3 p = vSkinPos;
            vec3 c = diffuseColor.rgb;
            vec3 e = vec3(0.0);
            ${pattern}
            diffuseColor.rgb = c * ${shade.toFixed(2)};
            skinGlow = e;
          }`,
        )
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += skinGlow;");
    };
    mat.customProgramCacheKey = () => `skin-${skin}-${shade}`;
    return mat;
  };
  return {
    paint: make(1),
    paintDark: make(0.72),
    tick: (t) => {
      time.value = t;
    },
  };
}
