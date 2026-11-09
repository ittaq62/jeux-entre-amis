// Ce qu'on voit d'un match : le stade, les joueurs, le ballon, et la caméra qui suit l'action comme à la télévision.

import * as THREE from "three";
import { BALL_R } from "../../../shared/games/crampons/ball.ts";
import { clamp, HALF_L, HALF_W } from "../../../shared/games/crampons/pitch.ts";
import { Footballers, type FootballerView, type Kit } from "./footballers.ts";
import { buildStadium, type Ambience, type Stadium } from "./stadium.ts";

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
}

export type CameraMode = "tele" | "large" | "pres";

const BALL_VIEW_R = BALL_R * 1.25;

function ballTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbf7ec";
  g.fillRect(0, 0, 256, 128);
  // Des bandes et des étoiles : le ballon de Crampons
  g.fillStyle = "#e0453a";
  for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 6, 0, 18, 128);
  g.fillStyle = "#1f3f8f";
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(i * 64 + 44, 64);
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 7 : 16;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CramponsScene {
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 900);
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private stadium: Stadium;
  private crowd: Footballers;
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private ring: THREE.Mesh;
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
    opts: { count: number; kits: [Kit, Kit]; gkKits: [Kit, Kit]; keepers: boolean[]; ambience: Ambience; lowQuality: boolean },
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowQuality, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.lowQuality ? 1.25 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.stadium = buildStadium(this.scene, opts.ambience, opts.lowQuality);
    this.crowd = new Footballers(this.scene, opts.count, opts.kits, opts.gkKits, opts.keepers);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_VIEW_R, 16, 12), new THREE.MeshLambertMaterial({ map: ballTexture() }));
    this.scene.add(this.ball);
    const shadowGeo = new THREE.CircleGeometry(BALL_VIEW_R * 1.4, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    this.ballShadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.ballShadow.renderOrder = 2;
    this.scene.add(this.ballShadow);
    const ringGeo = new THREE.RingGeometry(0.62, 0.88, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.ring.renderOrder = 3;
    this.scene.add(this.ring);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = h > w * 1.05;
    this.camera.fov = this.portrait ? 52 : 28;
    this.camera.updateProjectionMatrix();
    this.stadium.showNearStand(this.portrait);
  }

  /** Vers où pointe « haut de l'écran » et « droite de l'écran » sur le terrain, pour traduire le stick */
  screenToWorld(sx: number, sy: number): [number, number] {
    if (this.portrait) return [-sy * this.side, sx * this.side];
    return [sx, sy];
  }

  render(dt: number, frame: SceneFrame) {
    this.time += dt;
    const b = frame.ball;
    this.side = frame.attackSide;
    this.ball.position.set(b.x, b.y * 1.0 + (BALL_VIEW_R - BALL_R), b.z);
    const v = Math.hypot(b.vx, b.vz);
    if (v > 0.1) {
      const ax = new THREE.Vector3(b.vz, 0, -b.vx).normalize();
      this.ball.rotateOnWorldAxis(ax, (v * dt) / BALL_VIEW_R);
    }
    this.ballShadow.position.set(b.x, 0.035, b.z);
    const fade = clamp(1 - (b.y - BALL_R) / 7, 0.25, 1);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = 0.42 * fade;

    const p = frame.players[frame.active];
    this.ring.visible = Boolean(p) && !p?.off;
    if (p) {
      this.ring.position.set(p.x, 0.05, p.z);
      this.ring.scale.setScalar(1 + Math.sin(this.time * 6) * 0.06);
    }

    this.crowd.update(dt, this.time, frame.players);
    this.stadium.update(this.time, frame.excitement);
    this.moveCamera(dt, frame);
    this.renderer.render(this.scene, this.camera);
  }

  private moveCamera(dt: number, frame: SceneFrame) {
    const b = frame.ball;
    const snap = frame.cuts !== this.lastCuts;
    this.lastCuts = frame.cuts;
    // On regarde un peu devant le ballon, là où il va
    const gx = b.x + clamp(b.vx * 0.25, -6, 6);
    const gz = b.z + clamp(b.vz * 0.12, -3, 3);
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.6);
    this.cx += (gx - this.cx) * k;
    this.cz += (gz - this.cz) * k;
    const nearGoal = clamp((Math.abs(this.cx) - (HALF_L - 34)) / 30, 0, 1);
    const baseZoom = this.mode === "pres" ? 0.72 : this.mode === "large" ? 1.32 : 1;
    const goalZoom = baseZoom * (1 - nearGoal * 0.1);
    this.zoom += (goalZoom - this.zoom) * (snap ? 1 : 1 - Math.exp(-dt * 1.4));

    if (this.portrait) {
      // Sur un téléphone tenu droit : on regarde dans la longueur, le but adverse en haut de l'écran
      const s = frame.attackSide;
      const dist = 30 * this.zoom;
      const height = 38 * this.zoom;
      const lx = clamp(this.cx, -HALF_L - 2, HALF_L + 2);
      const lz = clamp(this.cz, -HALF_W + 8, HALF_W - 8);
      this.camera.position.set(lx - s * dist, height, lz);
      this.camera.lookAt(lx + s * 13, 0, lz);
      return;
    }
    // À la télévision : depuis la tribune, le long de la ligne de touche
    const dist = 58 * this.zoom;
    const height = 30 * this.zoom;
    const lx = clamp(this.cx * 0.94, -HALF_L + 15, HALF_L - 15);
    const lz = clamp(this.cz * 0.5, -HALF_W + 16, HALF_W - 10);
    this.camera.position.set(lx, height, lz + dist);
    this.camera.lookAt(lx, 0, lz - 4);
  }

  dispose() {
    this.stadium.dispose();
    this.crowd.dispose();
    this.renderer.dispose();
  }
}
