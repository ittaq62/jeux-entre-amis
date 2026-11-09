// La pelouse : calculée point par point par la carte graphique, pour que les lignes restent nettes à toutes les distances
// et que l'herbe ait du grain, des bandes de tonte croisées et un peu d'usure devant les buts.

import * as THREE from "three";
import { BOX_HALF, BOX_L, CIRCLE_R, HALF_L, HALF_W, SIX_HALF, SIX_L, SPOT_L } from "../../../shared/games/crampons/pitch.ts";

export interface GrassColors {
  a: string;
  b: string;
  dirt: string;
  outside: string;
}

/** Du bruit qui se répète sans raccord : fin dans le rouge, large dans le vert */
function noiseTexture(): THREE.DataTexture {
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  const cells = 24;
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = Math.random();
  const at = (x: number, y: number) => lattice[((y + cells) % cells) * cells + ((x + cells) % cells)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * cells;
      const fy = (y / n) * cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = smooth(fx - ix);
      const ty = smooth(fy - iy);
      const low = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
      const k = (y * n + x) * 4;
      data[k] = 70 + Math.random() * 185;
      data[k + 1] = low * 255;
      data[k + 2] = Math.random() * 255;
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const GLSL = /* glsl */ `
  uniform sampler2D uNoise;
  uniform vec3 uGrassA;
  uniform vec3 uGrassB;
  uniform vec3 uDirt;
  uniform vec3 uOutside;
  varying vec3 vWorldP;
  const float L = ${HALF_L.toFixed(2)};
  const float W = ${HALF_W.toFixed(2)};

  float rectLine(vec2 q, vec2 half_) {
    return abs(max(q.x - half_.x, q.y - half_.y));
  }

  float pitchLines(vec2 p) {
    vec2 q = abs(p);
    float d = rectLine(q, vec2(L, W));
    if (q.y < W) d = min(d, q.x > 0.0 ? abs(p.x) : 0.0);
    d = min(d, abs(length(p) - ${CIRCLE_R.toFixed(2)}));
    vec2 b = vec2(q.x - (L - ${(BOX_L / 2).toFixed(3)}), q.y);
    d = min(d, rectLine(vec2(abs(b.x), b.y), vec2(${(BOX_L / 2).toFixed(3)}, ${BOX_HALF.toFixed(2)})));
    vec2 s = vec2(q.x - (L - ${(SIX_L / 2).toFixed(3)}), q.y);
    d = min(d, rectLine(vec2(abs(s.x), s.y), vec2(${(SIX_L / 2).toFixed(3)}, ${SIX_HALF.toFixed(2)})));
    float arc = abs(length(q - vec2(L - ${SPOT_L.toFixed(2)}, 0.0)) - ${CIRCLE_R.toFixed(2)});
    if (q.x < L - ${BOX_L.toFixed(2)}) d = min(d, arc);
    float corner = abs(length(q - vec2(L, W)) - 1.0);
    if (q.x < L && q.y < W) d = min(d, corner);
    float aa = fwidth(d) * 1.3;
    float m = 1.0 - smoothstep(0.075 - aa, 0.075 + aa, d);
    float spot = min(length(p) - 0.2, length(q - vec2(L - ${SPOT_L.toFixed(2)}, 0.0)) - 0.17);
    float aa2 = fwidth(spot) * 1.3;
    return max(m, 1.0 - smoothstep(-aa2, aa2, spot));
  }

  vec3 grassColor() {
    vec2 p = vWorldP.xz;
    float fine = texture2D(uNoise, p * 1.3).r;
    float blade = texture2D(uNoise, p * vec2(4.0, 7.0)).b;
    float broad = texture2D(uNoise, p * 0.035).g;
    float patchy = texture2D(uNoise, p * 0.17).g;
    float inside = step(abs(p.x), L + 2.5) * step(abs(p.y), W + 2.5);
    // Deux passages de tondeuse croisés
    float bx = mod(floor((p.x + L) / 7.5), 2.0);
    float bz = mod(floor((p.y + W) / 6.8), 2.0);
    float stripe = (bx * 0.78 + bz * 0.22);
    vec3 col = mix(uGrassA, uGrassB, stripe);
    col *= 0.84 + 0.3 * fine * (0.65 + 0.7 * blade);
    col *= 0.86 + 0.28 * broad;
    col *= 0.94 + 0.12 * patchy;
    // L'usure : devant les buts et au rond central
    float mouth = smoothstep(9.5, 1.0, length(vec2((abs(p.x) - (L - 5.0)) * 0.8, p.y * 0.55)));
    float centre = smoothstep(5.0, 0.5, length(p)) * 0.4;
    float wear = clamp((mouth * 0.42 + centre * 0.45) * (0.2 + patchy * 1.1 + fine * 0.4), 0.0, 0.42);
    col = mix(col, uDirt, wear * inside);
    col = mix(uOutside * (0.86 + 0.3 * fine), col, inside);
    float line = pitchLines(p);
    return mix(col, vec3(0.93, 0.94, 0.9), line * 0.94);
  }
`;

/** La pelouse, à poser dans la scène */
export function buildGrass(colors: GrassColors, shadows: boolean): { mesh: THREE.Mesh; dispose: () => void } {
  const noise = noiseTexture();
  const geo = new THREE.PlaneGeometry((HALF_L + 22) * 2, (HALF_W + 22) * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uGrassA = { value: new THREE.Color(colors.a) };
    shader.uniforms.uGrassB = { value: new THREE.Color(colors.b) };
    shader.uniforms.uDirt = { value: new THREE.Color(colors.dirt) };
    shader.uniforms.uOutside = { value: new THREE.Color(colors.outside) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(position, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${GLSL}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = grassColor();");
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = shadows;
  return {
    mesh,
    dispose() {
      noise.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}
