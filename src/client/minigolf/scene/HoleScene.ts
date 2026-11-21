// La scène 3D d'un trou : le rendu, le ciel et le soleil du thème, le trou et son décor, les balles, la flèche de
// visée, et la caméra (que le jeu pilote). La qualité s'allège d'elle-même sur un appareil qui peine.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BALL_R, tileAt, tileHeight, type Course } from "../../../shared/games/minigolf/course.ts";
import type { CourseId } from "../../../shared/games/minigolf/courses.ts";
import { segClosest } from "../../../shared/games/minigolf/geom.ts";
import type { BallLook } from "../../../shared/games/minigolf/looks.ts";
import { AutoQuality } from "../../lib/autoQuality.ts";
import { BallModel } from "./ball.ts";
import { buildHoleMeshes, type HoleMeshes } from "./holeMesh.ts";
import { Sky } from "./sky.ts";
import { seeded, type Theme } from "./themes/common.ts";
import { themeOf } from "./themes/index.ts";

const TOUCH = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);

export class HoleScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.05, 900);
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private sky: Sky | null = null;
  private themeId: CourseId | null = null;
  private theme: Theme | null = null;
  private envMap: THREE.Texture | null = null;
  private hole: HoleMeshes | null = null;
  private decor: THREE.Group | null = null;
  private course: Course | null = null;
  private balls = new Map<string, BallModel>();
  private aim: THREE.Group;
  private aimArrow: THREE.Mesh;
  private aimLine: THREE.Mesh;
  private aimMat: THREE.MeshBasicMaterial;
  private host: HTMLElement;
  private baseRatio = Math.min(window.devicePixelRatio || 1, TOUCH ? 2 : 2);
  /** Les effets de l'image (le halo des lumières, l'étalonnage) : le premier cran qu'on retire si l'appareil peine */
  private composer: EffectComposer | null = null;
  private grade: ShaderPass | null = null;
  private effects = true;
  private quality = new AutoQuality({ levers: ["effets", "pixels", "pixels", "ombres"], apply: (on) => this.applyQuality(on) });
  private ro: ResizeObserver;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: !TOUCH || this.baseRatio < 2, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.baseRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "mg-canvas";
    host.appendChild(this.renderer.domElement);
    this.sun.castShadow = true;
    const size = TOUCH ? 2048 : 4096;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    // La flèche de visée : un trait pointillé jusqu'au premier mur, et une flèche dont la longueur dit la force
    this.aim = new THREE.Group();
    this.aimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    const arrow = new THREE.Shape();
    arrow.moveTo(-0.03, 0);
    arrow.lineTo(0.03, 0);
    arrow.lineTo(0.03, 0.8);
    arrow.lineTo(0.08, 0.8);
    arrow.lineTo(0, 1);
    arrow.lineTo(-0.08, 0.8);
    arrow.lineTo(-0.03, 0.8);
    this.aimArrow = new THREE.Mesh(new THREE.ShapeGeometry(arrow), this.aimMat);
    this.aimArrow.rotation.x = -Math.PI / 2;
    this.aimArrow.renderOrder = 10;
    const dots = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03, 1),
      new THREE.MeshBasicMaterial({ map: dotsTex(), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    dots.rotation.x = -Math.PI / 2;
    dots.renderOrder = 9;
    this.aimLine = dots;
    this.aim.add(this.aimArrow, this.aimLine);
    this.aim.visible = false;
    this.scene.add(this.aim);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  private applyQuality(on: readonly boolean[]) {
    this.effects = !on[0];
    this.renderer.setPixelRatio(this.baseRatio * (on[2] ? 0.66 : on[1] ? 0.82 : 1));
    this.renderer.shadowMap.enabled = !on[3];
    this.sun.castShadow = !on[3];
    this.resize();
  }

  /** Le halo des lumières et l'étalonnage de l'image (une image un peu plus chaude, un peu plus franche, les bords assombris) */
  private makeComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: TOUCH ? 0 : 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.5, 1.05));
    composer.addPass(new OutputPass());
    const grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uWarm: { value: 0.04 }, uSat: { value: 1.08 }, uVignette: { value: 0.32 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uWarm;
        uniform float uSat;
        uniform float uVignette;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(grey), c, uSat);
          c += vec3(uWarm, uWarm * 0.35, -uWarm * 0.6) * (1.0 - grey);
          c = (c - 0.5) * 1.04 + 0.5;
          vec2 d = vUv - 0.5;
          c *= 1.0 - uVignette * smoothstep(0.32, 0.85, length(d * vec2(1.15, 1.0)));
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
    });
    composer.addPass(grade);
    this.grade = grade;
    const g = this.theme?.sky.grade;
    if (g) {
      grade.uniforms.uWarm!.value = g.warm;
      grade.uniforms.uSat!.value = g.sat;
      grade.uniforms.uVignette!.value = g.vignette;
    }
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    this.composer = composer;
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Le trou à montrer (et son thème) ; `seed` tire le décor, toujours le même pour un trou */
  setHole(course: Course, courseId: CourseId, seed: number) {
    if (this.themeId !== courseId) this.setTheme(courseId);
    const theme = this.theme!;
    if (this.hole) {
      this.scene.remove(this.hole.root);
      this.hole.dispose();
    }
    if (this.decor) {
      this.scene.remove(this.decor);
      this.decor.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    }
    this.course = course;
    this.hole = buildHoleMeshes(course, theme.kit);
    this.scene.add(this.hole.root);
    this.decor = theme.decor(course, seeded(seed));
    this.scene.add(this.decor);
    // Les ombres nettes couvrent le trou et un peu autour
    const b = course.box;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const r = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 3;
    const dir = new THREE.Vector3(...theme.sky.sun).normalize();
    this.sun.position.set(cx + dir.x * 40, dir.y * 40, cz + dir.z * 40);
    this.sun.target.position.set(cx, 0, cz);
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 90;
    cam.updateProjectionMatrix();
  }

  private setTheme(id: CourseId) {
    this.themeId = id;
    const theme = themeOf(id);
    this.theme = theme;
    const s = theme.sky;
    if (this.sky) {
      this.scene.remove(this.sky.mesh);
      this.sky.dispose();
    }
    this.sky = new Sky(s);
    this.scene.add(this.sky.mesh);
    this.envMap?.dispose();
    this.envMap = this.sky.environment(this.renderer);
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.85;
    this.scene.fog = new THREE.Fog(s.fog, s.fogNear, s.fogFar);
    this.sun.color.set(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.hemi.color.set(s.hemiSky);
    this.hemi.groundColor.set(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.renderer.toneMappingExposure = s.exposure;
    if (this.grade) {
      this.grade.uniforms.uWarm!.value = s.grade?.warm ?? 0.04;
      this.grade.uniforms.uSat!.value = s.grade?.sat ?? 1.08;
      this.grade.uniforms.uVignette!.value = s.grade?.vignette ?? 0.32;
    }
  }

  /** La balle d'un joueur (créée la première fois) */
  ball(id: string, look: BallLook, mine: boolean, name?: string): BallModel {
    let b = this.balls.get(id);
    if (!b) {
      b = new BallModel(look, mine, name);
      this.balls.set(id, b);
      this.scene.add(b.group);
    }
    return b;
  }

  dropBall(id: string) {
    const b = this.balls.get(id);
    if (!b) return;
    this.scene.remove(b.group);
    b.dispose();
    this.balls.delete(id);
  }

  /** La hauteur du sol sous un point (pour poser les balles et leur ombre) */
  groundAt(x: number, z: number): number {
    const c = this.course;
    if (!c) return 0;
    const t = tileAt(c, x, z);
    return t >= 0 ? tileHeight(c, t, x, z) : c.outY;
  }

  /** La visée : depuis la balle, dans la direction `angle`, de force `power` (0 à 1) ; null pour la cacher */
  setAim(at: { x: number; y: number; z: number } | null, angle = 0, power = 0) {
    if (!at || !this.course) {
      this.aim.visible = false;
      return;
    }
    this.aim.visible = true;
    const y = this.groundAt(at.x, at.z) + 0.012;
    this.aim.position.set(at.x, y, at.z);
    this.aim.rotation.y = -angle - Math.PI / 2;
    // La flèche : jusqu'à 1,4 m, du vert au rouge
    const len = 0.2 + power * 1.2;
    this.aimArrow.scale.set(1, len, 1);
    this.aimArrow.position.z = 0;
    this.aimMat.color.setHSL(0.33 - power * 0.33, 0.85, 0.55);
    // Le pointillé : tout droit jusqu'au premier mur
    const reach = Math.min(rayToWall(this.course, at.x, at.z, angle, 12), 12);
    this.aimLine.scale.set(1, reach, 1);
    this.aimLine.position.set(0, -0.002, -reach / 2);
    const tex = (this.aimLine.material as THREE.MeshBasicMaterial).map!;
    tex.repeat.set(1, reach * 6);
    void BALL_R;
  }

  /** Le trou bouge selon son temps ; le ciel et l'eau vivent ; on dessine */
  render(t: number, dt: number) {
    this.quality.tick(performance.now());
    this.hole?.update(t, dt);
    this.theme?.tick?.(t, this.decor);
    this.sky?.update(t);
    if (this.sky) this.sky.mesh.position.copy(this.camera.position);
    if (this.effects) {
      if (!this.composer) this.makeComposer();
      this.composer!.render(dt);
    } else this.renderer.render(this.scene, this.camera);
  }

  /** Les drapeaux, pour les lever quand une balle approche */
  get flags(): THREE.Object3D[] {
    return this.hole?.flags ?? [];
  }

  get fps(): number {
    return this.quality.fps;
  }

  dispose() {
    this.ro.disconnect();
    for (const id of [...this.balls.keys()]) this.dropBall(id);
    this.hole?.dispose();
    this.decor?.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    this.sky?.dispose();
    this.envMap?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Jusqu'où va une ligne droite depuis (x, z) avant de toucher une bordure ou un mur */
function rayToWall(c: Course, x: number, z: number, angle: number, max: number): number {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let best = max;
  for (const w of c.walls) {
    if (w.kind === "cliff") continue;
    // Intersection de la demi-droite et du segment
    const ex = w.bx - w.ax;
    const ez = w.bz - w.az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((w.ax - x) * ez - (w.az - z) * ex) / den;
    const s = ((w.ax - x) * dz - (w.az - z) * dx) / den;
    if (t > 0.02 && s >= 0 && s <= 1) best = Math.min(best, t - BALL_R - w.t);
  }
  for (const p of c.posts) {
    const { d2, s } = segClosest(p.x, p.z, x, z, x + dx * max, z + dz * max);
    if (d2 < (p.r + BALL_R) ** 2) best = Math.min(best, s * max - Math.sqrt((p.r + BALL_R) ** 2 - d2));
  }
  return Math.max(0.1, best);
}

let dots: THREE.Texture | null = null;
function dotsTex(): THREE.Texture {
  if (dots) return dots;
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(8, 8, 6, 0, Math.PI * 2);
  g.fill();
  dots = new THREE.CanvasTexture(c);
  dots.wrapT = THREE.RepeatWrapping;
  return dots;
}
