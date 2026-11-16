// Le ciel d'une carte, peint par la carte graphique : un dégradé du zénith à l'horizon, le soleil et son halo, des
// nuages qui avancent lentement (éclairés du côté du soleil, liserés d'argent tout près de lui). Le même ciel sert aux
// reflets du métal et des surfaces lisses.

import * as THREE from "three";

export type Light = "soir" | "gris" | "aube" | "nuit" | "neige";

export interface SkyLook {
  zenith: string;
  horizon: string;
  ground: string;
  sunColor: string;
  /** La direction du soleil (vers lui) */
  sun: [number, number, number];
  /** Le rayon apparent du disque, en radians, et la force du halo */
  sunSize: number;
  glow: number;
  /** De 0 (ciel clair) à 1 (couvert) */
  clouds: number;
  cloudLit: string;
  cloudShade: string;
  /** Le brouillard au loin : sa couleur, d'où à où */
  fog: string;
  fogNear: number;
  fogFar: number;
}

export const SKIES: Record<Light, SkyLook> = {
  // Le hameau au soleil couchant : un ciel bleu profond, l'horizon doré, de longs nuages roses
  soir: {
    zenith: "#35609a",
    horizon: "#efcaa2",
    ground: "#5a4c3d",
    sunColor: "#ffdcb2",
    sun: [-0.7, 0.36, 0.42],
    sunSize: 0.03,
    glow: 1.3,
    clouds: 0.45,
    cloudLit: "#ffe2c8",
    cloudShade: "#7d7088",
    fog: "#d6bb9e",
    fogNear: 40,
    fogFar: 240,
  },
  // Le port à l'aube : le soleil se lève sur la mer, rose et doré, une brume légère sur l'eau
  aube: {
    zenith: "#4f6c94",
    horizon: "#f2c2a6",
    ground: "#4a4a50",
    sunColor: "#ffd6ae",
    sun: [0.82, 0.16, 0.5],
    sunSize: 0.034,
    glow: 1.1,
    clouds: 0.38,
    cloudLit: "#ffd9c4",
    cloudShade: "#727496",
    fog: "#cdbdbb",
    fogNear: 34,
    fogFar: 250,
  },
  // La nuit : un ciel d'encre et d'étoiles, la lune pâle, quelques nuages qu'elle éclaire par en dessous
  nuit: {
    zenith: "#060b17",
    horizon: "#1b2639",
    ground: "#0b0e13",
    sunColor: "#c9d7ff",
    sun: [-0.35, 0.55, -0.62],
    sunSize: 0.02,
    glow: 0.4,
    clouds: 0.3,
    cloudLit: "#56627c",
    cloudShade: "#121824",
    fog: "#0c1220",
    fogNear: 16,
    fogFar: 150,
  },
  // Le col en hiver : un ciel blanc et bleuté, un soleil pâle derrière les nuages de neige, l'horizon qui se fond
  neige: {
    zenith: "#9cb0c4",
    horizon: "#e2e8ed",
    ground: "#b9c1c7",
    sunColor: "#fff3e4",
    sun: [0.45, 0.42, 0.55],
    sunSize: 0.04,
    glow: 0.7,
    clouds: 0.6,
    cloudLit: "#f3f6f8",
    cloudShade: "#98a4b0",
    fog: "#dbe3e9",
    fogNear: 24,
    fogFar: 170,
  },
  // La gare un matin couvert : des gris bleutés, un soleil voilé, des nuages bas et lourds
  gris: {
    zenith: "#56677a",
    horizon: "#b8bfc4",
    ground: "#58594f",
    sunColor: "#f2ede0",
    sun: [0.34, 0.6, -0.5],
    sunSize: 0.045,
    glow: 0.6,
    clouds: 0.72,
    cloudLit: "#d9dcdd",
    cloudShade: "#6f7780",
    fog: "#a9b0b4",
    fogNear: 28,
    fogFar: 190,
  },
};

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const FRAG = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 cloudLit;
uniform vec3 cloudShade;
uniform float sunSize;
uniform float glow;
uniform float clouds;
uniform float time;
uniform float disk;
uniform float stars;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 3.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(horizon, ground, pow(clamp(-h * 4.0, 0.0, 1.0), 0.7));
  float s = max(dot(d, sunDir), 0.0);
  // Le halo : large et doux, plus serré tout près du disque
  col += sunColor * glow * (pow(s, 6.0) * 0.28 + pow(s, 48.0) * 0.55);
  float cover = 0.0;
  if (h > 0.0 && clouds > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.4 + vec2(time * 0.006, time * 0.002);
    float n = fbm(uv);
    float n2 = fbm(uv * 2.3 + 5.0);
    float c = smoothstep(1.0 - clouds, 1.0 - clouds + 0.32, n * 0.8 + n2 * 0.3);
    float lit = clamp(n2 * 1.2 - 0.1 + dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))) * 0.25, 0.0, 1.0);
    vec3 cc = mix(cloudShade, cloudLit, lit);
    cc += sunColor * pow(s, 10.0) * 0.9 * (1.0 - c * 0.5);
    float fade = smoothstep(0.0, 0.2, h);
    col = mix(col, cc, c * fade * 0.95);
    cover = c * fade;
  }
  // Les étoiles : une sur soixante-dix cases du ciel, à une place au hasard dans sa case, plus ou moins brillante,
  // qui scintille ; cachées derrière les nuages
  if (stars > 0.0 && h > 0.0) {
    vec2 sp = vec2(atan(d.z, d.x) * 130.0, d.y * 130.0);
    vec2 cell = floor(sp);
    float r = hash(cell);
    if (r > 0.986) {
      vec2 at = cell + 0.5 + (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
      float mag = (r - 0.986) / 0.014;
      float tw = 0.65 + 0.35 * sin(time * 1.9 + r * 300.0);
      float star = smoothstep(0.42, 0.0, length(sp - at)) * (0.35 + 1.9 * mag * mag) * tw;
      col += vec3(0.86, 0.9, 1.0) * star * stars * smoothstep(0.02, 0.25, h) * (1.0 - cover);
    }
  }
  // Le disque du soleil, très clair : il fait briller l'image autour de lui
  float sd = smoothstep(cos(sunSize), cos(sunSize * 0.6), s);
  col += sunColor * sd * disk;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function sunDirection(light: Light): THREE.Vector3 {
  const [x, y, z] = SKIES[light].sun;
  return new THREE.Vector3(x, y, z).normalize();
}

/** La matière du ciel (sur une sphère vue de l'intérieur, centrée sur la caméra) */
export function skyMaterial(light: Light, disk = 9): THREE.ShaderMaterial {
  const k = SKIES[light];
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(k.zenith) },
      horizon: { value: new THREE.Color(k.horizon) },
      ground: { value: new THREE.Color(k.ground) },
      sunDir: { value: sunDirection(light) },
      sunColor: { value: new THREE.Color(k.sunColor) },
      cloudLit: { value: new THREE.Color(k.cloudLit) },
      cloudShade: { value: new THREE.Color(k.cloudShade) },
      sunSize: { value: k.sunSize },
      glow: { value: k.glow },
      clouds: { value: k.clouds },
      time: { value: 0 },
      // La lune brille moins qu'un soleil
      disk: { value: light === "nuit" ? disk * 0.4 : disk },
      stars: { value: light === "nuit" ? 1 : 0 },
    },
  });
}

/** Le reflet du ciel, filtré une fois pour les matières qui brillent */
export function skyEnvironment(renderer: THREE.WebGLRenderer, light: Light): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const mat = skyMaterial(light, 3);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat);
  scene.add(sphere);
  const env = pmrem.fromScene(scene, 0.015).texture;
  pmrem.dispose();
  sphere.geometry.dispose();
  mat.dispose();
  return env;
}
