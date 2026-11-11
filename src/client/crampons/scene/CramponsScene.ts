// Ce qu'on voit d'un match : le stade, les joueurs, le ballon, les ombres, et la caméra qui suit l'action comme à la télévision.

import * as THREE from "three";
import { clamp, HALF_L, HALF_W } from "../../../shared/games/crampons/pitch.ts";
import { Effects, type Weather } from "./effects.ts";
import { Footballers, type FootballerView, type Kit } from "./footballers.ts";
import { buildStadium, themeFor, type Ambience, type ScoreboardData, type Stadium } from "./stadium.ts";

export interface BallView {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
}

export interface SceneFrame {
  players: FootballerView[];
  ball: BallView;
  /** Le joueur dirigé par ici, souligné d'un anneau */
  active: number;
  /** De quel côté attaque l'équipe qu'on suit (+1 ou -1), pour la vue en portrait */
  attackSide: number;
  /** Le stade s'enflamme : de 0 à 1 */
  excitement: number;
  /** Un changement de plan : la caméra saute au lieu de glisser */
  cuts: number;
  /** La force du tir en préparation, de 0 à 1 */
  charge: number;
  /** Là où vise le curseur */
  aim: [number, number] | null;
  /** Le coéquipier qui recevrait la passe, ou -1 */
  receiver: number;
  /** Ce que la caméra suit à la place du ballon (le buteur pendant la fête) */
  focus?: [number, number] | null;
}

export type CameraMode = "tele" | "large" | "pres";

/** Un plan de cinéma, le temps d'une présentation, d'un but ou d'un ralenti */
export type Shot =
  | { kind: "free"; x: number; y: number; z: number; tx: number; ty: number; tz: number }
  | { kind: "intro"; t: number }
  | { kind: "scorer"; x: number; z: number; side: number; t: number; base: number }
  | { kind: "replay"; end: number };

/** À quelle distance du buteur se place la caméra : assez loin pour le voir en entier sous le bandeau */
export const SCORER_CAM_DIST = 10;

/** Le ballon se voit de loin : un peu plus gros qu'en vrai */
const BALL_VIEW_R = 0.25;
const GAUGE_SEGMENTS = 48;

function ballTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fdfaf0";
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#e0453a";
  for (let i = 0; i < 4; i++) g.fillRect(i * 128 + 12, 0, 34, 256);
  g.fillStyle = "#1f3f8f";
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(i * 128 + 88, 128);
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 14 : 32;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class CramponsScene {
  readonly camera = new THREE.PerspectiveCamera(28, 16 / 9, 1, 1500);
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private stadium: Stadium;
  private crowd: Footballers;
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh | null = null;
  private ring: THREE.Mesh;
  private gauge: THREE.Mesh;
  private arrow: THREE.Mesh;
  private fx: Effects;
  private reticle: THREE.Mesh;
  private target: THREE.Mesh;
  private basePixelRatio = 1;
  private resolution = 1;
  /** Au-delà, la finesse ne se voit plus à cette distance, mais la carte graphique la paie très cher */
  private maxPixels = 2.3e6;
  private shake = 0;
  private baseFov = 26;
  private mateArrow: THREE.Mesh;
  private width = 1;
  private height = 1;
  private sun: THREE.DirectionalLight;
  private sunOffset: THREE.Vector3;
  private shadows: boolean;
  private cx = 0;
  private cz = 0;
  private zoom = 1;
  private lastCuts = -1;
  private time = 0;
  private portrait = false;
  private side = 1;
  mode: CameraMode = "tele";

  constructor(
    canvas: HTMLCanvasElement,
    opts: {
      count: number;
      kits: [Kit, Kit];
      gkKits: [Kit, Kit];
      keepers: boolean[];
      shirts: number[];
      ambience: Ambience;
      lowQuality: boolean;
      weather?: Weather;
    },
  ) {
    const theme = themeFor(opts.ambience, opts.weather ?? "clair");
    this.shadows = !opts.lowQuality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowQuality, powerPreference: "high-performance" });
    this.basePixelRatio = Math.min(window.devicePixelRatio, opts.lowQuality ? 1.25 : 2);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = theme.exposure;
    // Vérifier chaque programme fige le navigateur au démarrage : en ligne, on s'en passe
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    if (this.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.scene.add(new THREE.HemisphereLight("#ffffff", "#6f9a5f", theme.hemi));
    this.sun = new THREE.DirectionalLight(theme.sunColor, theme.sun);
    this.sunOffset = new THREE.Vector3(...theme.sunDir).normalize().multiplyScalar(120);
    this.sun.position.copy(this.sunOffset);
    if (this.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera;
      c.left = -50;
      c.right = 50;
      c.top = 38;
      c.bottom = -38;
      c.near = 20;
      c.far = 260;
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.04;
    }
    this.scene.add(this.sun, this.sun.target);
    // Une lumière de contour, depuis l'autre côté : les personnages se détachent de la pelouse
    const rim = new THREE.DirectionalLight("#cfe0ff", theme.rim);
    rim.position.set(50, 40, -70);
    this.scene.add(rim);

    this.stadium = buildStadium(
      this.scene,
      opts.ambience,
      opts.lowQuality,
      {
        home: [opts.kits[0].shirt, opts.kits[0].sleeves, opts.kits[0].shorts],
        away: [opts.kits[1].shirt, opts.kits[1].sleeves, opts.kits[1].shorts],
      },
      this.shadows,
      opts.weather ?? "clair",
    );
    this.crowd = new Footballers(this.scene, opts.count, opts.kits, opts.gkKits, opts.keepers, opts.shirts, this.shadows);
    this.fx = new Effects(this.scene, opts.weather ?? "clair", opts.lowQuality);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_VIEW_R, 20, 14),
      new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.42, color: opts.weather === "neige" ? "#ff9a30" : "#ffffff" }),
    );
    this.ball.castShadow = this.shadows;
    this.scene.add(this.ball);
    if (!this.shadows) {
      const shadowGeo = new THREE.CircleGeometry(BALL_VIEW_R * 1.3, 16);
      shadowGeo.rotateX(-Math.PI / 2);
      this.ballShadow = new THREE.Mesh(
        shadowGeo,
        new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.4, depthWrite: false }),
      );
      this.ballShadow.renderOrder = 2;
      this.scene.add(this.ballShadow);
    }

    // Le joueur dirigé : un anneau au sol, une flèche au-dessus de la tête, et la jauge autour de ses pieds
    const ringGeo = new THREE.RingGeometry(0.78, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    );
    this.ring.renderOrder = 3;
    this.scene.add(this.ring);
    const gaugeGeo = new THREE.RingGeometry(1.06, 1.36, GAUGE_SEGMENTS, 1, Math.PI / 2, Math.PI * 2);
    gaugeGeo.rotateX(-Math.PI / 2);
    this.gauge = new THREE.Mesh(
      gaugeGeo,
      new THREE.MeshBasicMaterial({ color: "#ffb02e", transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.gauge.renderOrder = 4;
    this.scene.add(this.gauge);
    const reticleGeo = new THREE.RingGeometry(0.42, 0.56, 28);
    reticleGeo.rotateX(-Math.PI / 2);
    this.reticle = new THREE.Mesh(
      reticleGeo,
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    );
    this.reticle.renderOrder = 5;
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    const targetGeo = new THREE.RingGeometry(0.72, 0.92, 32);
    targetGeo.rotateX(-Math.PI / 2);
    this.target = new THREE.Mesh(
      targetGeo,
      new THREE.MeshBasicMaterial({ color: "#6fe3ff", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    );
    this.target.renderOrder = 3;
    this.target.visible = false;
    this.scene.add(this.target);
    const arrowGeo = new THREE.ConeGeometry(0.34, 0.56, 4);
    arrowGeo.rotateX(Math.PI);
    this.arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: "#ffe066", toneMapped: false }));
    this.scene.add(this.arrow);
    this.mateArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: "#6fe3ff", toneMapped: false }));
    this.mateArrow.visible = false;
    this.mateArrow.scale.setScalar(0.8);
    this.scene.add(this.mateArrow);
    // Tout est préparé d'un coup, derrière le rideau : sinon le jeu se fige en pleine partie à la première apparition de chaque matière
    this.renderer.compile(this.scene, this.camera);
  }

  /** Allège ou affine l'image, sans toucher à ce qu'on voit */
  setResolution(scale: number, maxPixels: number) {
    this.resolution = scale;
    this.maxPixels = maxPixels;
    this.applyPixels();
  }

  private applyPixels() {
    const cap = Math.sqrt(this.maxPixels / Math.max(1, this.width * this.height));
    this.renderer.setPixelRatio(Math.min(this.basePixelRatio, cap) * this.resolution);
    this.renderer.setSize(this.width, this.height, false);
  }

  /** Une grosse frappe : un peu de poussière, un éclat, et la caméra qui encaisse le choc */
  impact(x: number, z: number, power: number) {
    this.fx.puff(x, z, 7, 0.6 + power);
    this.fx.flash(x, z, power);
    this.shake = Math.max(this.shake, 0.35 + power * 0.65);
  }

  setShadows(on: boolean) {
    if (!this.shadows) return;
    this.sun.castShadow = on;
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.applyPixels();
    this.camera.aspect = w / h;
    this.portrait = h > w * 1.05;
    this.baseFov = this.portrait ? 50 : 26;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.stadium.showNearStand(this.portrait);
  }

  setScoreboard(data: ScoreboardData) {
    this.stadium.setScoreboard(data);
  }

  shakeNet(end: number) {
    this.stadium.shakeNet(end);
  }

  puff(x: number, z: number, count = 5, strength = 1) {
    this.fx.puff(x, z, count, strength);
  }

  celebrate(end: number, colors: string[]) {
    this.fx.celebrate(end, colors);
  }

  /** Une image, avec éventuellement un plan de cinéma à la place de la caméra de match */
  private shot: Shot | null = null;
  private tmpPos = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  setShot(shot: Shot | null) {
    this.shot = shot;
  }

  /** Vers où pointe « haut de l'écran » et « droite de l'écran » sur le terrain, pour traduire le stick */
  screenToWorld(sx: number, sy: number): [number, number] {
    if (this.portrait) return [-sy * this.side, sx * this.side];
    return [sx, sy];
  }

  /** Le point du terrain sous un pixel de l'écran */
  pickGround(px: number, py: number): [number, number] | null {
    const ndc = new THREE.Vector3((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    if (Math.abs(dir.y) < 1e-4) return null;
    const t = -this.camera.position.y / dir.y;
    if (t < 0) return null;
    return [this.camera.position.x + dir.x * t, this.camera.position.z + dir.z * t];
  }

  render(dt: number, frame: SceneFrame) {
    this.time += dt;
    const b = frame.ball;
    this.side = frame.attackSide;
    this.ball.position.set(b.x, b.y + (BALL_VIEW_R - 0.16), b.z);
    const v = Math.hypot(b.vx, b.vz);
    if (v > 0.1) {
      const ax = new THREE.Vector3(b.vz, 0, -b.vx).normalize();
      this.ball.rotateOnWorldAxis(ax, (v * dt) / BALL_VIEW_R);
    }
    if (this.ballShadow) {
      this.ballShadow.position.set(b.x, 0.035, b.z);
      (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = 0.42 * clamp(1 - (b.y - 0.16) / 7, 0.25, 1);
    }

    const p = frame.players[frame.active];
    const shown = Boolean(p) && !p?.off;
    this.ring.visible = shown;
    this.arrow.visible = shown;
    this.gauge.visible = shown && frame.charge > 0.02;
    if (p && shown) {
      this.ring.position.set(p.x, 0.05, p.z);
      this.ring.scale.setScalar(1 + Math.sin(this.time * 6) * 0.05);
      this.arrow.position.set(p.x, 3.05 + Math.sin(this.time * 5) * 0.12, p.z);
      this.arrow.rotation.y = this.time * 2;
      this.gauge.position.set(p.x, 0.06, p.z);
      this.gauge.geometry.setDrawRange(0, Math.round(frame.charge * GAUGE_SEGMENTS) * 6);
      (this.gauge.material as THREE.MeshBasicMaterial).color.set(frame.charge > 0.86 ? "#e94a3a" : "#ffb02e");
    }

    this.reticle.visible = frame.aim !== null;
    if (frame.aim) this.reticle.position.set(frame.aim[0], 0.07, frame.aim[1]);
    const mate = frame.receiver >= 0 ? frame.players[frame.receiver] : null;
    this.target.visible = Boolean(mate);
    this.mateArrow.visible = Boolean(mate);
    if (mate) {
      this.target.position.set(mate.x, 0.05, mate.z);
      this.target.scale.setScalar(1 + Math.sin(this.time * 8) * 0.08);
      this.mateArrow.position.set(mate.x, 2.95 + Math.sin(this.time * 7) * 0.1, mate.z);
    }
    // Le joueur qui sprinte soulève un peu d'herbe derrière lui
    if (p && shown && p.v > 9.5 && Math.random() < dt * 16) this.fx.puff(p.x, p.z, 1, 0.3);

    this.crowd.update(dt, this.time, frame.players);
    this.stadium.update(this.time, frame.excitement, dt);
    if (this.shot) this.cinema(dt, frame, this.shot);
    else this.moveCamera(dt, frame);
    // Le choc d'une frappe : la caméra resserre d'un rien, puis revient
    if (this.shake > 0.002 || this.camera.fov !== this.baseFov) {
      this.shake *= Math.exp(-dt * 9);
      this.camera.fov = this.shake > 0.002 ? this.baseFov * (1 - this.shake * 0.028) : this.baseFov;
      this.camera.updateProjectionMatrix();
    }
    this.fx.update(dt, this.time, b, this.cx, this.cz, this.camera.position);
    if (this.shadows) {
      // L'ombre suit le jeu, calée sur sa grille pour ne pas scintiller quand la caméra glisse
      const step = 100 / 2048;
      const tx = Math.round(this.cx / step) * step;
      const tz = Math.round(this.cz / step) * step;
      this.sun.target.position.set(tx, 0, tz);
      this.sun.position.set(tx + this.sunOffset.x, this.sunOffset.y, tz + this.sunOffset.z);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Les plans de cinéma : le tour du stade, le buteur de près, le ralenti depuis le bord du terrain */
  private cinema(dt: number, frame: SceneFrame, shot: Shot) {
    const b = frame.ball;
    this.ring.visible = false;
    this.arrow.visible = false;
    this.gauge.visible = false;
    this.reticle.visible = false;
    this.target.visible = false;
    this.mateArrow.visible = false;
    if (shot.kind === "free") {
      this.camera.position.set(shot.x, shot.y, shot.z);
      this.camera.lookAt(shot.tx, shot.ty, shot.tz);
      return;
    }
    if (shot.kind === "intro") {
      // Un survol qui reste à l'intérieur du stade, et qui se pose exactement là où commence la caméra de match
      const k = clamp(shot.t, 0, 1);
      this.moveCamera(dt, frame);
      const endPos = this.tmpPos.copy(this.camera.position);
      const endQ = this.tmpQuat.copy(this.camera.quaternion);
      const ease = k * k * (3 - 2 * k);
      const a = -1.1 + ease * 0.75;
      const r = 40 + ease * 8;
      this.camera.position.set(Math.sin(a) * r, 5.5 + ease * 11, Math.cos(a) * r);
      this.camera.lookAt(-5 * (1 - ease), 1.4, 0);
      const f = clamp((k - 0.55) / 0.45, 0, 1);
      const land = f * f * (3 - 2 * f);
      this.camera.position.lerp(endPos, land);
      this.camera.quaternion.slerp(endQ, land);
      return;
    }
    if (shot.kind === "scorer") {
      // Tout près de celui qui vient de marquer, la caméra tourne doucement autour de lui
      const a = shot.base + (shot.t - 1.2) * 0.3;
      // La caméra reste du côté du terrain, jamais derrière le filet ni dans les panneaux
      this.camera.position.set(
        clamp(shot.x - Math.cos(a) * SCORER_CAM_DIST * shot.side, -HALF_L - 6, HALF_L + 6),
        2.8,
        clamp(shot.z + Math.sin(a) * SCORER_CAM_DIST, -HALF_W - 6, HALF_W + 6),
      );
      this.camera.lookAt(shot.x, 2, shot.z);
      return;
    }
    // Le ralenti : au ras du sol, à côté du but, on voit le ballon arriver
    const k = 1 - Math.exp(-dt * 7);
    this.cx += (b.x - this.cx) * k;
    this.cz += (b.z - this.cz) * k;
    this.camera.position.set(shot.end * (HALF_L + 9), 4.2, clamp(this.cz * 0.5, -14, 14) + 13);
    this.camera.lookAt(this.cx, 1, this.cz);
  }

  private moveCamera(dt: number, frame: SceneFrame) {
    const b = frame.focus ? { x: frame.focus[0], z: frame.focus[1], vx: 0, vz: 0 } : frame.ball;
    const snap = frame.cuts !== this.lastCuts;
    this.lastCuts = frame.cuts;
    // On regarde un peu devant le ballon, là où il va
    const gx = b.x + clamp(b.vx * 0.22, -7.5, 7.5);
    const gz = b.z + clamp(b.vz * 0.12, -3, 3);
    const k = snap ? 1 : 1 - Math.exp(-dt * 4.2);
    this.cx += (gx - this.cx) * k;
    this.cz += (gz - this.cz) * k;
    const nearGoal = clamp((Math.abs(this.cx) - (HALF_L - 34)) / 30, 0, 1);
    const baseZoom = this.mode === "pres" ? 0.72 : this.mode === "large" ? 1.34 : 1;
    const goalZoom = baseZoom * (1 - nearGoal * 0.08);
    this.zoom += (goalZoom - this.zoom) * (snap ? 1 : 1 - Math.exp(-dt * 1.4));

    if (this.portrait) {
      // Sur un téléphone tenu droit : on regarde dans la longueur, le but adverse en haut de l'écran
      const s = frame.attackSide;
      const dist = 30 * this.zoom;
      const height = 34 * this.zoom;
      const lx = clamp(this.cx, -HALF_L - 2, HALF_L + 2);
      const lz = clamp(this.cz, -HALF_W + 8, HALF_W - 8);
      this.camera.position.set(lx - s * dist, height, lz);
      this.camera.lookAt(lx + s * 13, 0, lz);
      return;
    }
    // À la télévision : depuis la tribune, plus bas, plus près du jeu
    const dist = 54 * this.zoom;
    const height = 23 * this.zoom;
    const lx = clamp(this.cx * 0.96, -HALF_L + 14, HALF_L - 14);
    const lz = clamp(this.cz * 0.62, -HALF_W + 12, HALF_W - 13);
    this.camera.position.set(lx, height, lz + dist);
    this.camera.lookAt(lx, 0.6, lz - 2);
  }

  dispose() {
    this.stadium.dispose();
    this.crowd.dispose();
    this.fx.dispose();
    // Ce qui reste (le ballon et sa texture, la mire, les flèches…) : tout est rendu à la carte graphique
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
  }
}
