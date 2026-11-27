// Le monde de La Cour des Grands : l'île de Récré, un soir d'été. Une grande pelouse tondue en bandes au milieu (là où
// se montent les épreuves), des arbres ronds, des haies, des tentes rayées de kermesse, des guirlandes de fanions, des
// mâts de projecteurs du plateau de télé, une grande roue au loin, des montgolfières qui dérivent, la mer tout autour
// jusqu'à l'horizon, et le soleil bas qui dore tout.
//
// Le rendu : une lumière de fin d'après-midi (soleil chaud et rasant, ciel bleu en reflet), des ombres sur ordinateur,
// des taches douces sous les personnages partout, un léger brouillard qui fond le lointain. La qualité s'allège d'elle-
// même sur un appareil qui peine (les pixels d'abord, puis les ombres).

import * as THREE from "three";
import { AutoQuality } from "../../lib/autoQuality.ts";
import { releaseRenderer } from "../../lib/releaseGl.ts";

export const TOUCH = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);

const SUN_DIR = new THREE.Vector3(-0.62, 0.42, -0.66).normalize();
const SKY_TOP = new THREE.Color("#2f74d0");
const SKY_HORIZON = new THREE.Color("#ffd4a3");
const FOG = new THREE.Color("#f3d6b4");

type Keep = <T extends { dispose: () => void }>(x: T) => T;

/** Une petite graine de hasard pour le décor (toujours le même décor) */
function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, keep: Keep, srgb = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = keep(new THREE.CanvasTexture(c));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** La pelouse tondue : des bandes claires et foncées, des brins, quelques fleurs */
function lawnTexture(keep: Keep): THREE.CanvasTexture {
  const r = rand(7);
  return canvasTex(
    512,
    512,
    (g) => {
      for (let k = 0; k < 8; k++) {
        g.fillStyle = k % 2 ? "#6fae46" : "#7dbb4f";
        g.fillRect(0, k * 64, 512, 64);
      }
      for (let i = 0; i < 9000; i++) {
        const x = r() * 512;
        const y = r() * 512;
        const v = r();
        g.fillStyle = v < 0.5 ? "rgba(40,90,25,0.22)" : "rgba(190,230,120,0.18)";
        g.fillRect(x, y, 1.2, 2.5 + r() * 3);
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = ["#ffffff", "#fff3a0", "#ffd0e0"][i % 3]!;
        g.beginPath();
        g.arc(r() * 512, r() * 512, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    },
    keep,
  );
}

function sandTexture(keep: Keep): THREE.CanvasTexture {
  const r = rand(11);
  return canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#e9d3a4";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(160,120,70,0.12)" : "rgba(255,250,230,0.2)";
        g.fillRect(r() * 256, r() * 256, 1.4, 1.4);
      }
    },
    keep,
  );
}

/** Le ciel : un dégradé du bleu au doré, le soleil et son halo */
function skyDome(keep: Keep): THREE.Mesh {
  const mat = keep(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: SKY_TOP.clone() },
        horizon: { value: SKY_HORIZON.clone() },
        sun: { value: SUN_DIR.clone() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.1, 1.0);
          vec3 c = mix(horizon, top, pow(smoothstep(0.0, 0.55, max(h, 0.0)), 0.6));
          c = mix(c, vec3(0.98,0.86,0.72), smoothstep(0.02, -0.1, h));
          float s = max(dot(normalize(vDir), sun), 0.0);
          c += vec3(1.0, 0.82, 0.55) * pow(s, 18.0) * 0.55 + vec3(1.0, 0.95, 0.8) * pow(s, 900.0) * 3.0;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  const m = new THREE.Mesh(keep(new THREE.SphereGeometry(900, 32, 16)), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/** La mer : un grand disque qui scintille au soleil */
function seaMesh(keep: Keep): { mesh: THREE.Mesh; tick: (t: number) => void } {
  const uniforms = { time: { value: 0 }, sun: { value: SUN_DIR.clone() } };
  const mat = keep(
    new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsLib.fog, ...uniforms },
      fog: true,
      vertexShader: `varying vec3 vPos; varying float vFogDepth;
        void main(){ vPos = (modelMatrix * vec4(position,1.0)).xyz; vec4 mv = viewMatrix * vec4(vPos,1.0); vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float time; uniform vec3 sun; varying vec3 vPos; varying float vFogDepth;
        uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
        void main(){
          vec2 p = vPos.xz * 0.08;
          float w = sin(p.x * 3.1 + time * 0.9) * 0.5 + sin(p.y * 2.7 - time * 0.7) * 0.5 + sin((p.x + p.y) * 5.3 + time * 1.6) * 0.25;
          vec3 n = normalize(vec3(cos(p.x * 3.1 + time) * 0.12, 1.0, cos(p.y * 2.7 - time) * 0.12 + w * 0.04));
          vec3 v = normalize(cameraPosition - vPos);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 deep = vec3(0.07, 0.32, 0.45), shallow = vec3(0.2, 0.62, 0.68);
          float d = clamp(length(vPos.xz) / 260.0, 0.0, 1.0);
          vec3 c = mix(shallow, deep, d);
          c = mix(c, vec3(0.86, 0.78, 0.68), fres * 0.55);
          vec3 h = normalize(sun + v);
          c += vec3(1.0, 0.85, 0.6) * pow(max(dot(n, h), 0.0), 220.0) * 1.6;
          float f = smoothstep(fogNear, fogFar, vFogDepth);
          gl_FragColor = vec4(mix(c, fogColor, f), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  const geo = keep(new THREE.CircleGeometry(900, 64));
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.9;
  return { mesh, tick: (t) => (uniforms.time.value = t) };
}

/** Une forme faite de morceaux de couleurs (une seule pour tout le décor d'une matière) */
export class Batch {
  private parts: THREE.BufferGeometry[] = [];
  private col = new THREE.Color();
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (m) g.applyMatrix4(m);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    this.col.set(color);
    const n = g.getAttribute("position").count;
    const c = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      c[k * 3] = this.col.r;
      c[k * 3 + 1] = this.col.g;
      c[k * 3 + 2] = this.col.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(name)) g.deleteAttribute(name);
    this.parts.push(g);
  }
  /** Un morceau placé : position, rotation (y puis x), échelle */
  put(
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    ry = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    rx = 0,
    rz = 0,
  ) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")),
      new THREE.Vector3(sx, sy, sz),
    );
    this.add(geo, color, m);
  }
  build(mat: THREE.Material, keep: Keep): THREE.Mesh | null {
    if (!this.parts.length) return null;
    let count = 0;
    for (const p of this.parts) count += p.getAttribute("position").count;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let o = 0;
    for (const p of this.parts) {
      const n = p.getAttribute("position").count;
      pos.set(p.getAttribute("position").array as Float32Array, o * 3);
      nor.set(p.getAttribute("normal").array as Float32Array, o * 3);
      col.set(p.getAttribute("color").array as Float32Array, o * 3);
      o += n;
      p.dispose();
    }
    this.parts = [];
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** Ce qui est à l'épreuve en cours (monté et démonté par elle) */
  readonly stage = new THREE.Group();
  /** Les personnages */
  readonly people = new THREE.Group();
  /** La matière commune du décor en couleurs de sommets */
  readonly paint: THREE.MeshStandardMaterial;
  readonly quality: AutoQuality;
  private bin: { dispose: () => void }[] = [];
  private host: HTMLElement;
  private ro: ResizeObserver;
  private baseRatio = Math.min(window.devicePixelRatio || 1, TOUCH ? 1.75 : 2);
  private sea: { tick: (t: number) => void };
  private balloons: { g: THREE.Group; a: number; r: number; h: number; s: number }[] = [];
  private wheel: THREE.Group | null = null;
  private flags: THREE.InstancedMesh | null = null;
  private flagBase: { m: THREE.Matrix4; phase: number }[] = [];
  readonly keep: Keep = (x) => {
    this.bin.push(x);
    return x;
  };

  constructor(host: HTMLElement, opts: { fixed?: boolean } = {}) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !TOUCH || this.baseRatio < 2,
      powerPreference: "high-performance",
      preserveDrawingBuffer: Boolean(opts.fixed),
    });
    this.renderer.setPixelRatio(this.baseRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = !TOUCH;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "cg-canvas";
    host.appendChild(this.renderer.domElement);

    const keep = this.keep;
    this.scene.fog = new THREE.Fog(FOG, 90, 520);
    this.scene.background = FOG.clone();
    this.paint = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));

    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x5c7a3a, 1.05);
    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
    this.sun.position.copy(SUN_DIR).multiplyScalar(80);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 20;
    sc.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target, skyDome(keep), this.stage, this.people);
    const sea = seaMesh(keep);
    this.sea = sea;
    this.scene.add(sea.mesh);
    this.buildIsland();

    this.quality = new AutoQuality({ levers: ["pixels", "ombres", "pixels"], apply: (on) => this.applyQuality(on) });
    if (opts.fixed) this.quality.tick = () => {};
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  private applyQuality(on: readonly boolean[]) {
    this.renderer.setPixelRatio(this.baseRatio * (on[2] ? 0.62 : on[0] ? 0.8 : 1));
    if (!TOUCH) {
      this.renderer.shadowMap.enabled = !on[1];
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.needsUpdate = true;
      });
    }
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** L'île : la pelouse, la plage, les collines, les arbres, les tentes, les guirlandes, la grande roue, les montgolfières */
  private buildIsland() {
    const keep = this.keep;
    const lawn = lawnTexture(keep);
    lawn.repeat.set(26, 26);
    lawn.anisotropy = 8;
    // La pelouse : un grand disque, plat au milieu, qui monte doucement en collines vers les bords
    // Des anneaux jusqu'au bord (un simple disque n'a que des triangles du centre au bord : ses collines en feraient un cône)
    const groundGeo = keep(new THREE.RingGeometry(0.01, 150, 96, 60));
    groundGeo.rotateX(-Math.PI / 2);
    const pos = groundGeo.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const tint = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const r = Math.hypot(x, z);
      const hill = Math.max(0, r - 62) / 60;
      const y = hill * hill * 9 * (0.75 + 0.25 * Math.sin(Math.atan2(z, x) * 3)) - Math.max(0, r - 138) * 0.25;
      pos.setY(k, y);
      tint.setHSL(0.27 + Math.sin(x * 0.05) * 0.015, 0.45, 0.62 + Math.cos(z * 0.04) * 0.04 - hill * 0.06);
      colors[k * 3] = tint.r;
      colors[k * 3 + 1] = tint.g;
      colors[k * 3 + 2] = tint.b;
    }
    groundGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, keep(new THREE.MeshStandardMaterial({ map: lawn, vertexColors: true, roughness: 0.95 })));
    ground.receiveShadow = true;
    this.scene.add(ground);
    // La plage autour
    const sand = sandTexture(keep);
    sand.repeat.set(30, 30);
    const beachGeo = keep(new THREE.RingGeometry(140, 175, 96, 2));
    beachGeo.rotateX(-Math.PI / 2);
    const bp = beachGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < bp.count; k++) {
      const r = Math.hypot(bp.getX(k), bp.getZ(k));
      bp.setY(k, -0.2 - (r - 140) * 0.03);
    }
    beachGeo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(beachGeo, keep(new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }))));

    const r = rand(42);
    // Les arbres : un tronc et une couronne de boules, tous en deux formes (troncs, feuillages)
    const trunkGeo = keep(new THREE.CylinderGeometry(0.25, 0.4, 1, 7));
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = keep(new THREE.IcosahedronGeometry(1, 2));
    const trees: { x: number; z: number; h: number; s: number }[] = [];
    for (let k = 0; k < 140; k++) {
      const a = r() * Math.PI * 2;
      const d = 48 + r() * 85;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      // Pas devant la caméra des épreuves (qui regarde vers −z) : le côté +z reste dégagé près de la cour
      if (z > 20 && d < 70 && Math.abs(x) < 40) continue;
      trees.push({ x, z, h: 3 + r() * 4, s: 2.2 + r() * 2.2 });
    }
    const trunks = new THREE.InstancedMesh(
      trunkGeo,
      keep(new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 })),
      trees.length,
    );
    const crowns = new THREE.InstancedMesh(
      crownGeo,
      keep(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: false })),
      trees.length * 3,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const leaf = new THREE.Color();
    let c = 0;
    trees.forEach((t, k) => {
      const gy = this.groundAt(t.x, t.z);
      m.compose(v.set(t.x, gy, t.z), q.identity(), sc.set(1, t.h, 1));
      trunks.setMatrixAt(k, m);
      for (let j = 0; j < 3; j++) {
        const ox = (r() - 0.5) * t.s * 0.8;
        const oz = (r() - 0.5) * t.s * 0.8;
        const s = t.s * (0.7 + r() * 0.45);
        m.compose(v.set(t.x + ox, gy + t.h + s * 0.55 + j * 0.5, t.z + oz), q.identity(), sc.set(s, s * 0.9, s));
        crowns.setMatrixAt(c, m);
        leaf.setHSL(0.22 + r() * 0.08, 0.45 + r() * 0.15, 0.32 + r() * 0.1);
        crowns.setColorAt(c, leaf);
        c++;
      }
    });
    trunks.castShadow = crowns.castShadow = true;
    this.scene.add(trunks, crowns);

    // Les tentes rayées de kermesse, les mâts de projecteurs, les haies, la grande roue
    const b = new Batch();
    const tentGeo = new THREE.ConeGeometry(1, 1, 12, 1, true);
    const tents = [
      [-38, -30],
      [38, -32],
      [-46, 6],
      [46, 4],
      [-30, -48],
      [28, -50],
    ];
    tents.forEach(([x, z], k) => {
      const col = ["#d9344d", "#2f6fd1", "#f2b632", "#2f9a62"][k % 4]!;
      for (let s = 0; s < 12; s++) {
        const seg = new THREE.CylinderGeometry(4, 4, 3.2, 12, 1, true, (s / 12) * Math.PI * 2, Math.PI / 6);
        b.put(seg, s % 2 ? "#f6efe2" : col, x!, this.groundAt(x!, z!) + 1.6, z!);
      }
      b.put(tentGeo.clone(), col, x!, this.groundAt(x!, z!) + 4.4, z!, 0, 4.6, 2.6, 4.6);
      b.put(new THREE.SphereGeometry(0.25, 8, 6), "#ffd84a", x!, this.groundAt(x!, z!) + 5.8, z!);
    });
    tentGeo.dispose();
    // Des haies basses autour de la cour
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      if (Math.sin(a) > 0.55) continue;
      const x = Math.cos(a) * 34;
      const z = Math.sin(a) * 28;
      b.put(new THREE.BoxGeometry(5, 1.2, 1.1), "#3f7d34", x, 0.6, z, -a + Math.PI / 2);
    }
    // Les mâts de projecteurs du plateau
    for (const [x, z] of [
      [-26, -22],
      [26, -22],
      [-26, 18],
      [26, 18],
    ]) {
      b.put(new THREE.CylinderGeometry(0.18, 0.25, 12, 8), "#3a3f4a", x!, 6, z!);
      b.put(new THREE.BoxGeometry(3, 0.25, 0.25), "#3a3f4a", x!, 12, z!);
      for (const o of [-1.2, 0, 1.2])
        b.put(new THREE.CylinderGeometry(0.32, 0.22, 0.5, 10), "#22252c", x! + o, 11.7, z!, 0, 1, 1, 1, 0.6 * Math.sign(-z!));
    }
    // Le phare, au bout de l'île
    b.put(new THREE.CylinderGeometry(1.6, 2.4, 16, 14), "#f4efe6", 96, this.groundAt(96, -80) + 8, -80);
    for (let k = 0; k < 3; k++)
      b.put(new THREE.CylinderGeometry(1.75 - k * 0.2, 1.85 - k * 0.2, 2, 14), "#d9344d", 96, this.groundAt(96, -80) + 3 + k * 5, -80);
    b.put(new THREE.CylinderGeometry(1.3, 1.3, 2, 10), "#ffe7a8", 96, this.groundAt(96, -80) + 17, -80);
    b.put(new THREE.ConeGeometry(1.8, 2.2, 10), "#2b2f3a", 96, this.groundAt(96, -80) + 19.1, -80);
    const decor = b.build(this.paint, keep);
    if (decor) {
      decor.castShadow = true;
      decor.receiveShadow = true;
      this.scene.add(decor);
    }

    // La grande roue, au loin, qui tourne lentement
    const wheel = new THREE.Group();
    const wb = new Batch();
    const R = 14;
    wb.add(new THREE.TorusGeometry(R, 0.25, 6, 48), "#f4efe6");
    wb.add(new THREE.TorusGeometry(R * 0.35, 0.2, 6, 24), "#f4efe6");
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      wb.put(
        new THREE.BoxGeometry(0.16, R, 0.16),
        "#f4efe6",
        (Math.cos(a) * R) / 2,
        (Math.sin(a) * R) / 2,
        0,
        0,
        1,
        1,
        1,
        0,
        a - Math.PI / 2,
      );
      wb.put(
        new THREE.BoxGeometry(1.6, 1.3, 1.3),
        ["#d9344d", "#f2b632", "#2f6fd1", "#2f9a62"][k % 4]!,
        Math.cos(a) * R,
        Math.sin(a) * R - 0.9,
        0,
      );
    }
    const wm = wb.build(this.paint, keep);
    if (wm) wheel.add(wm);
    const wx = -70;
    const wz = -95;
    const stand = new Batch();
    for (const s of [-1, 1])
      stand.put(
        new THREE.BoxGeometry(0.5, R + 3, 0.5),
        "#c9c2b3",
        wx + s * 4,
        this.groundAt(wx, wz) + (R + 3) / 2,
        wz,
        0,
        1,
        1,
        1,
        0,
        s * 0.28,
      );
    const st = stand.build(this.paint, keep);
    if (st) this.scene.add(st);
    wheel.position.set(wx, this.groundAt(wx, wz) + R + 2.5, wz);
    this.scene.add(wheel);
    this.wheel = wheel;

    // Les montgolfières
    const envGeo = keep(
      new THREE.LatheGeometry(
        Array.from({ length: 14 }, (_, k) => {
          const t = k / 13;
          const rad = Math.sin(t * Math.PI * 0.92 + 0.12) * (t < 0.2 ? 0.55 + t * 2 : 1);
          return new THREE.Vector2(rad * 3, t * 7.5 - 3.6);
        }),
        18,
      ),
    );
    for (let k = 0; k < 5; k++) {
      const g = new THREE.Group();
      const colors = [
        ["#d9344d", "#f6efe2"],
        ["#2f6fd1", "#f2b632"],
        ["#2f9a62", "#f6efe2"],
        ["#f2b632", "#d9344d"],
        ["#8a4fd1", "#f6efe2"],
      ][k]!;
      const envB = new Batch();
      // L'enveloppe en quartiers de deux couleurs
      const geo = envGeo.clone();
      const p = geo.getAttribute("position") as THREE.BufferAttribute;
      const cols = new Float32Array(p.count * 3);
      const ca = new THREE.Color(colors[0]);
      const cb = new THREE.Color(colors[1]);
      for (let i = 0; i < p.count; i++) {
        const seg = Math.floor(((Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / (Math.PI * 2)) * 12);
        const cc = seg % 2 ? ca : cb;
        cols[i * 3] = cc.r;
        cols[i * 3 + 1] = cc.g;
        cols[i * 3 + 2] = cc.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      for (const n of Object.keys(geo.attributes)) if (!["position", "normal", "color"].includes(n)) geo.deleteAttribute(n);
      const env = new THREE.Mesh(keep(geo), this.paint);
      g.add(env);
      envB.put(new THREE.CylinderGeometry(0.7, 0.55, 0.8, 10), "#8a5a2e", 0, -5.3, 0);
      const basket = envB.build(this.paint, keep);
      if (basket) g.add(basket);
      this.scene.add(g);
      this.balloons.push({ g, a: r() * Math.PI * 2, r: 70 + r() * 60, h: 26 + r() * 22, s: 0.008 + r() * 0.01 });
    }

    // Les guirlandes de fanions, de mât en mât autour de la cour
    const flagGeo = keep(new THREE.BufferGeometry());
    flagGeo.setAttribute("position", new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.42, 0], 3));
    flagGeo.computeVertexNormals();
    const posts: [number, number][] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      posts.push([Math.cos(a) * 31, Math.sin(a) * 25]);
    }
    const flagsPer = 18;
    const flags = new THREE.InstancedMesh(
      flagGeo,
      keep(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 })),
      posts.length * flagsPer,
    );
    const pb = new Batch();
    const fc = new THREE.Color();
    let f = 0;
    posts.forEach(([x, z], k) => {
      pb.put(new THREE.CylinderGeometry(0.07, 0.09, 5, 6), "#e8dfcf", x, 2.5, z);
      const [nx, nz] = posts[(k + 1) % posts.length]!;
      for (let j = 0; j < flagsPer; j++) {
        const t = (j + 0.5) / flagsPer;
        const sag = Math.sin(t * Math.PI) * 0.9;
        const px = x + (nx - x) * t;
        const pz = z + (nz - z) * t;
        const mm = new THREE.Matrix4().compose(
          new THREE.Vector3(px, 4.9 - sag, pz),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(nx - x, nz - z) + Math.PI / 2, 0)),
          new THREE.Vector3(1, 1, 1),
        );
        flags.setMatrixAt(f, mm);
        this.flagBase.push({ m: mm, phase: r() * 6 });
        fc.set(["#d9344d", "#f2b632", "#2f6fd1", "#2f9a62", "#f6efe2", "#e85fa0"][(j + k) % 6]!);
        flags.setColorAt(f, fc);
        f++;
      }
    });
    const pm = pb.build(this.paint, keep);
    if (pm) this.scene.add(pm);
    this.scene.add(flags);
    this.flags = flags;
  }

  /** La hauteur du sol (la cour est plate) */
  groundAt(x: number, z: number): number {
    const r = Math.hypot(x, z);
    const hill = Math.max(0, r - 62) / 60;
    return hill * hill * 9 * (0.75 + 0.25 * Math.sin(Math.atan2(z, x) * 3));
  }

  /** Ce qui vit dans le décor : la mer, les montgolfières, la grande roue, les fanions dans le vent */
  animate(t: number) {
    this.sea.tick(t);
    for (const b of this.balloons) {
      const a = b.a + t * b.s;
      b.g.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.3 + b.a) * 1.5, Math.sin(a) * b.r - 20);
      b.g.rotation.y = t * 0.05 + b.a;
    }
    if (this.wheel) this.wheel.rotation.z = t * 0.06;
    if (this.flags) {
      const m = new THREE.Matrix4();
      const rot = new THREE.Matrix4();
      this.flagBase.forEach((fb, k) => {
        rot.makeRotationX(Math.sin(t * 2.2 + fb.phase) * 0.35);
        m.multiplyMatrices(fb.m, rot);
        this.flags!.setMatrixAt(k, m);
      });
      this.flags.instanceMatrix.needsUpdate = true;
    }
  }

  /** La zone des ombres suit ce qu'on regarde */
  aimShadows(x: number, z: number) {
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + SUN_DIR.x * 80, SUN_DIR.y * 80, z + SUN_DIR.z * 80);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ro.disconnect();
    for (const x of this.bin) x.dispose();
    this.bin = [];
    this.renderer.domElement.remove();
    releaseRenderer(this.renderer);
  }
}
