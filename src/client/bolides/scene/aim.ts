// La visée : pendant qu'on tient un objet, on voit où il partira. Des flèches qui défilent sur la route pour ce qui
// file droit, un cercle au sol là où ça retombe ou là où ça frappe, un viseur sur le kart qu'une tarte ou une fusée ira
// chercher. On sait ce qu'on va faire avant d'appuyer.

import * as THREE from "three";
import { pointAt, type Track } from "../../../shared/games/bolides/track.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

/** Ce qu'il faut montrer à cette image */
export type Aim =
  /** Des flèches le long de la route, à partir de s, sur `len` mètres (négatif : vers l'arrière) */
  | { kind: "road"; s: number; d: number; len: number }
  /** Un cercle au sol */
  | { kind: "ring"; x: number; y: number; z: number; r: number }
  /** Un viseur sur un kart */
  | { kind: "target"; x: number; y: number; z: number };

const SEGMENTS = 18;
const WIDTH = 3;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

export class AimGuide {
  readonly group = new THREE.Group();
  private strip: THREE.Mesh;
  private pos: Float32Array;
  private tex: THREE.CanvasTexture;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private target: THREE.Sprite;
  private geo: THREE.BufferGeometry;

  constructor(
    private t: Track,
    keep: Keep,
  ) {
    // Des chevrons qui pointent vers le haut de la toile : ils montrent le sens du trajet
    const [c, g] = canvas(128, 128);
    g.fillStyle = "#ffd23a";
    g.strokeStyle = "rgba(40,24,6,0.65)";
    g.lineWidth = 5;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(14, 104);
    g.lineTo(64, 40);
    g.lineTo(114, 104);
    g.lineTo(92, 104);
    g.lineTo(64, 70);
    g.lineTo(36, 104);
    g.closePath();
    g.stroke();
    g.fill();
    this.tex = keep(new THREE.CanvasTexture(c));
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.anisotropy = 4;
    const n = SEGMENTS + 1;
    this.pos = new Float32Array(n * 6);
    const uv = new Float32Array(n * 4);
    const color = new Float32Array(n * 8);
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      const f = i / SEGMENTS;
      uv.set([0, f * 6, 1, f * 6], i * 4);
      // Les flèches s'effacent au loin
      const a = Math.min(1, f * 7) * (1 - f * f);
      color.set([1, 1, 1, a, 1, 1, 1, a], i * 8);
      if (i < SEGMENTS) {
        const v = i * 2;
        index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    this.geo = keep(new THREE.BufferGeometry());
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.geo.setAttribute("color", new THREE.BufferAttribute(color, 4));
    this.geo.setIndex(index);
    this.strip = new THREE.Mesh(
      this.geo,
      keep(
        new THREE.MeshBasicMaterial({
          map: this.tex,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      ),
    );
    this.strip.frustumCulled = false;
    this.strip.visible = false;
    this.group.add(this.strip);

    this.ringMat = keep(
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.9, 1, 56).rotateX(-Math.PI / 2)), this.ringMat);
    this.ring.visible = false;
    this.group.add(this.ring);

    const [rc, rg] = canvas(128, 128);
    rg.strokeStyle = "#ff3b2a";
    rg.lineWidth = 9;
    rg.beginPath();
    rg.arc(64, 64, 42, 0, Math.PI * 2);
    rg.stroke();
    rg.lineWidth = 11;
    rg.lineCap = "round";
    for (const [x0, y0, x1, y1] of [
      [64, 6, 64, 30],
      [64, 98, 64, 122],
      [6, 64, 30, 64],
      [98, 64, 122, 64],
    ] as const) {
      rg.beginPath();
      rg.moveTo(x0, y0);
      rg.lineTo(x1, y1);
      rg.stroke();
    }
    const reticle = keep(new THREE.CanvasTexture(rc));
    reticle.colorSpace = THREE.SRGBColorSpace;
    this.target = new THREE.Sprite(
      keep(
        new THREE.SpriteMaterial({ map: reticle, depthTest: false, depthWrite: false, fog: false, toneMapped: false, transparent: true }),
      ),
    );
    this.target.renderOrder = 20;
    this.target.visible = false;
    this.group.add(this.target);
  }

  update(aim: Aim | null, time: number, camera: THREE.Vector3) {
    this.strip.visible = aim?.kind === "road";
    this.ring.visible = aim?.kind === "ring";
    this.target.visible = aim?.kind === "target";
    if (!aim) return;
    if (aim.kind === "road") {
      for (let i = 0; i <= SEGMENTS; i++) {
        const s = aim.s + (aim.len * i) / SEGMENTS;
        const a = pointAt(this.t, s, aim.d - WIDTH / 2);
        const b = pointAt(this.t, s, aim.d + WIDTH / 2);
        this.pos.set([a.x, a.y + 0.14, a.z, b.x, b.y + 0.14, b.z], i * 6);
      }
      (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      this.tex.offset.y = -(time * 1.4) % 1;
    } else if (aim.kind === "ring") {
      this.ring.position.set(aim.x, aim.y + 0.16, aim.z);
      const beat = 1 + Math.sin(time * 7) * 0.03;
      this.ring.scale.set(aim.r * beat, 1, aim.r * beat);
      this.ringMat.opacity = 0.55 + 0.3 * Math.abs(Math.sin(time * 5));
    } else {
      this.target.position.set(aim.x, aim.y + 1.2, aim.z);
      // Il reste lisible de loin
      const far = Math.hypot(aim.x - camera.x, aim.z - camera.z);
      const size = Math.max(3.4, far * 0.075) * (1 + Math.sin(time * 9) * 0.08);
      this.target.scale.setScalar(size);
      this.target.material.rotation = time * 1.5;
    }
  }
}
