// Le ciel d'un thème : un dôme peint en dégradé, le halo du soleil, des nuages qui passent (leur ventre plus sombre,
// leur bord éclairé du côté du soleil), et au loin, sur l'horizon, deux plans de silhouettes dans la brume (une
// forêt, des crêtes, des îles). Il sert aussi à éclairer la scène (les reflets de la balle, de l'eau, du métal).

import * as THREE from "three";

export interface SkyDef {
  /** Haut du ciel, horizon, et le bas (sous l'horizon) */
  top: number;
  horizon: number;
  bottom: number;
  /** Direction du soleil (vers lui), sa couleur et sa force */
  sun: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  /** La lumière du ciel et celle qui remonte du sol */
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** Les nuages : quantité (0 à 1) et couleur */
  clouds: number;
  cloudColor: number;
  /** Brume au loin */
  fog: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
  /** Des étoiles (la nuit) */
  stars?: number;
  /** L'étalonnage de l'image : chaleur, saturation, bords assombris */
  grade?: { warm: number; sat: number; vignette: number };
  /** À partir de quelle lumière les choses ont un halo (1,05 par défaut ; plus haut pour une scène très claire) */
  bloom?: number;
  /**
   * Des silhouettes au loin, sur l'horizon : le plan lointain (pâle, dans la brume) et le plan proche (plus sombre,
   * plus bas). `height` : leur hauteur (en sinus de l'angle au-dessus de l'horizon) ; `caps` : la couleur des sommets.
   */
  ridges?: { kind: RidgeKind; height: number; far: number; near: number; caps?: number; seed?: number };
}

/** Une ligne d'arbres, des montagnes, des collines douces, des îles et des caps posés çà et là */
export type RidgeKind = "arbres" | "mont" | "collines" | "iles";
const RIDGE_KINDS: RidgeKind[] = ["mont", "arbres", "collines", "iles"];

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 bottom;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 cloudColor;
uniform float clouds;
uniform float stars;
uniform float time;
uniform vec4 ridge;
uniform vec3 ridgeFar;
uniform vec3 ridgeNear;
uniform vec3 ridgeCaps;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; } return s; }
float fbm3(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 3; i++) { s += noise(p) * a; p *= 2.07; a *= 0.5; } return s; }
// La hauteur d'une silhouette dans la direction dir (0 à 1 environ), selon sa sorte
float ridgeAt(vec2 dir, float k, float seed, float kind) {
  vec2 p = dir * k + vec2(seed, seed * 0.37);
  if (kind < 0.5) {
    // Des crêtes : un bruit replié, des pics francs
    float n = 0.0; float a = 0.55; vec2 q = p;
    for (int i = 0; i < 4; i++) { n += (1.0 - abs(noise(q) * 2.0 - 1.0)) * a; q *= 2.13; a *= 0.48; }
    return n * 1.05 - 0.25;
  } else if (kind < 1.5) {
    // Une forêt : des cimes serrées, une ligne qui ondule
    return 0.45 + 0.3 * fbm3(p) + 0.16 * noise(p * 26.0) + 0.12 * noise(p * 70.0);
  } else if (kind < 2.5) {
    return 0.2 + 0.8 * fbm3(p * 0.8);
  }
  // Des îles et des caps : seulement là où le bruit dépasse
  return max(0.0, fbm3(p) - 0.5) * 3.2 + max(0.0, noise(p * 3.0) - 0.8) * 1.5;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 32.0) * 0.35 + pow(s, 4.0) * 0.12);
  if (h > 0.0 && clouds > 0.0) {
    vec2 wind = vec2(time * 0.006, time * 0.002);
    vec2 uv = d.xz / (h + 0.18) * 1.6 + wind;
    float c = fbm(uv);
    float th = 1.0 - clouds * 0.75;
    float cover = smoothstep(th, th + 0.28, c);
    // Plus dense vers le soleil : ce coin du nuage est dans son ombre ; ses bords minces s'allument
    vec2 toSun = normalize(sunDir.xz + vec2(1e-4)) * 0.09;
    float c2 = fbm(uv + toSun);
    float lightK = clamp(0.62 + (c - c2) * 3.2, 0.18, 1.0);
    vec3 lit = cloudColor * mix(0.62, 1.06, lightK) * (0.86 + 0.24 * pow(s, 3.0));
    float edge = cover * (1.0 - cover) * 4.0;
    lit += sunColor * edge * (0.12 + 0.5 * pow(s, 6.0));
    // Plus haut, des voiles étirés
    float veil = smoothstep(0.55, 0.85, fbm3(uv * vec2(0.45, 2.6) + vec2(3.1, 7.7))) * clouds * 0.35;
    col = mix(col, cloudColor * (0.95 + 0.2 * pow(s, 4.0)), veil * smoothstep(0.05, 0.4, h));
    col = mix(col, lit, cover * smoothstep(0.0, 0.18, h) * 0.94);
  }
  if (ridge.x > 0.0 && h < ridge.x * 1.3) {
    // Les silhouettes au loin : le plan lointain d'abord, puis le proche par-dessus
    vec2 dir = normalize(d.xz + vec2(1e-5));
    float aa = 0.0018;
    float far = ridgeAt(dir, 2.4, ridge.z, ridge.y) * ridge.x;
    float mf = smoothstep(far + aa, far - aa, h);
    vec3 fc = mix(ridgeFar, horizon, smoothstep(far, far - 0.05, h) * 0.35);
    fc = mix(fc, mix(ridgeCaps, horizon, 0.25), ridge.w * smoothstep(far * 0.7, far * 0.84, h));
    col = mix(col, fc, mf);
    float near = ridgeAt(dir, 1.5, ridge.z + 17.0, ridge.y) * ridge.x * 0.62;
    float mn = smoothstep(near + aa, near - aa, h);
    // Le pied dans la brume, les sommets parfois enneigés
    vec3 nc = mix(ridgeNear, mix(ridgeFar, horizon, 0.3), smoothstep(near * 0.7, -0.03, h) * 0.4);
    nc = mix(nc, ridgeCaps, ridge.w * smoothstep(near * 0.72, near * 0.86, h));
    col = mix(col, nc, mn);
  }
  if (stars > 0.0 && h > 0.0) {
    vec2 g = d.xz / (h + 0.3) * 160.0;
    float st = step(0.996, hash(floor(g))) * smoothstep(0.0, 0.3, h);
    col += vec3(st) * stars * (0.6 + 0.4 * sin(time * 2.0 + hash(floor(g)) * 30.0));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(def: SkyDef) {
    const c = (n: number) => new THREE.Color(n);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        top: { value: c(def.top) },
        horizon: { value: c(def.horizon) },
        bottom: { value: c(def.bottom) },
        sunDir: { value: new THREE.Vector3(...def.sun).normalize() },
        sunColor: { value: c(def.sunColor) },
        cloudColor: { value: c(def.cloudColor) },
        clouds: { value: def.clouds },
        stars: { value: def.stars ?? 0 },
        time: { value: 0 },
        // x : la hauteur (0 : pas de silhouettes), y : la sorte, z : la graine, w : des sommets d'une autre couleur
        ridge: {
          value: new THREE.Vector4(
            def.ridges?.height ?? 0,
            RIDGE_KINDS.indexOf(def.ridges?.kind ?? "mont"),
            def.ridges?.seed ?? 3.7,
            def.ridges?.caps !== undefined ? 1 : 0,
          ),
        },
        ridgeFar: { value: c(def.ridges?.far ?? 0) },
        ridgeNear: { value: c(def.ridges?.near ?? 0) },
        ridgeCaps: { value: c(def.ridges?.caps ?? 0xffffff) },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(t: number) {
    this.mat.uniforms.time!.value = t;
  }

  /** Une carte d'environnement tirée de ce ciel (les reflets) */
  environment(renderer: THREE.WebGLRenderer): THREE.Texture | null {
    try {
      const scene = new THREE.Scene();
      const copy = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.mat.clone());
      (copy.material as THREE.ShaderMaterial).uniforms.time!.value = 0;
      scene.add(copy);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const tex = pmrem.fromScene(scene, 0.02).texture;
      pmrem.dispose();
      copy.geometry.dispose();
      (copy.material as THREE.Material).dispose();
      return tex;
    } catch {
      return null;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
