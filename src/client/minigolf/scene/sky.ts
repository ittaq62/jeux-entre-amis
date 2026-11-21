// Le ciel d'un thème : un dôme peint en dégradé, le halo du soleil, des nuages doux qui passent ; il sert aussi à
// éclairer la scène (les reflets de la balle, de l'eau, du métal viennent de lui).

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
}

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
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 32.0) * 0.35 + pow(s, 4.0) * 0.12);
  if (h > 0.0 && clouds > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.6 + vec2(time * 0.006, time * 0.002);
    float c = fbm(uv);
    float cover = smoothstep(1.0 - clouds * 0.75, 1.0 - clouds * 0.75 + 0.28, c);
    vec3 lit = cloudColor * (0.82 + 0.3 * pow(s, 3.0));
    col = mix(col, lit, cover * smoothstep(0.0, 0.18, h) * 0.92);
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
