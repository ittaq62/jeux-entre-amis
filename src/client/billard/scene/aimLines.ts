// Les aides de visée, posées sur le tapis : la ligne de la blanche jusqu'à la bille visée, la bille fantôme (là où la
// blanche la touchera), la direction que prendra la bille visée et celle de la blanche, les poches à annoncer, la zone
// de la bille en main. Des rubans plats, à peine au-dessus du feutre, qui ne portent pas d'ombre.

import * as THREE from "three";

const Y = 0.0015;

function dashTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 8;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 40, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Un ruban plat entre deux points du tapis (coordonnées de la physique) */
class Ribbon {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private uv: Float32Array;
  constructor(
    private width: number,
    readonly mat: THREE.MeshBasicMaterial,
    private dash: number,
  ) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(12);
    this.uv = new Float32Array(8);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
  }

  set(ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax,
      dy = by - ay;
    const l = Math.hypot(dx, dy);
    if (l < 1e-5) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const nx = (-dy / l) * (this.width / 2),
      ny = (dx / l) * (this.width / 2);
    const p = this.pos;
    // (x, y) de la physique → (x, Y, −y)
    p.set([ax + nx, Y, -(ay + ny), ax - nx, Y, -(ay - ny), bx + nx, Y, -(by + ny), bx - nx, Y, -(by - ny)]);
    const u = this.dash > 0 ? l / this.dash : 1;
    this.uv.set([0, 0, 0, 1, u, 0, u, 1]);
    const g = this.mesh.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.uv!.needsUpdate = true;
    g.computeBoundingSphere();
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}

export class AimLines {
  readonly group = new THREE.Group();
  private toGhost: Ribbon;
  private objPath: Ribbon;
  private cuePath: Ribbon;
  private bounce: Ribbon;
  private ghost: THREE.Mesh;
  private ghostMat: THREE.MeshBasicMaterial;
  private markers: THREE.Mesh[] = [];
  private markerMat: THREE.MeshBasicMaterial;
  private markerOn: THREE.MeshBasicMaterial;
  private zone: THREE.Mesh;
  private mats: THREE.Material[] = [];
  private tex: THREE.Texture;

  constructor(R: number, pockets: readonly { x: number; y: number }[], kitchen: { x0: number; x1: number; y: number } | null) {
    this.tex = dashTexture();
    const mk = (color: string, opacity: number, dashed: boolean) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, map: dashed ? this.tex : null });
      this.mats.push(m);
      return m;
    };
    this.toGhost = new Ribbon(0.004, mk("#ffffff", 0.75, true), 0.028);
    this.objPath = new Ribbon(0.005, mk("#ffe27a", 0.8, false), 0);
    this.cuePath = new Ribbon(0.0035, mk("#ffffff", 0.45, true), 0.02);
    this.bounce = new Ribbon(0.0035, mk("#ffffff", 0.4, true), 0.024);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false });
    this.mats.push(this.ghostMat);
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(R * 0.86, R, 40), this.ghostMat);
    this.ghost.rotation.x = -Math.PI / 2;
    this.ghost.renderOrder = 7;
    this.markerMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false });
    this.markerOn = new THREE.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.9, depthWrite: false });
    this.mats.push(this.markerMat, this.markerOn);
    const mg = new THREE.RingGeometry(0.045, 0.058, 36);
    mg.rotateX(-Math.PI / 2);
    for (const p of pockets) {
      const m = new THREE.Mesh(mg, this.markerMat);
      m.position.set(p.x, 0.003, -p.y);
      m.renderOrder = 7;
      m.visible = false;
      this.markers.push(m);
      this.group.add(m);
    }
    // La zone de la bille en main, derrière la ligne de tête
    const zm = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.07, depthWrite: false });
    this.mats.push(zm);
    this.zone = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), zm);
    this.zone.rotation.x = -Math.PI / 2;
    this.zone.renderOrder = 5;
    this.zone.visible = false;
    if (kitchen) {
      this.zone.scale.set(kitchen.x1 - kitchen.x0, 2 * kitchen.y, 1);
      this.zone.position.set((kitchen.x0 + kitchen.x1) / 2, 0.001, 0);
    }
    this.group.add(this.toGhost.mesh, this.objPath.mesh, this.cuePath.mesh, this.bounce.mesh, this.ghost, this.zone);
    this.hide();
  }

  hide() {
    this.toGhost.mesh.visible = false;
    this.objPath.mesh.visible = false;
    this.cuePath.mesh.visible = false;
    this.bounce.mesh.visible = false;
    this.ghost.visible = false;
  }

  /**
   * La visée : la blanche en (cx, cy) vers (gx, gy) ; la bille visée part selon (ox, oy) sur `objLen`, la blanche selon
   * (tx, ty) sur `cueLen` ; ou, sans bille touchée, le rebond sur la bande selon (rx, ry).
   */
  show(o: {
    cx: number;
    cy: number;
    gx: number;
    gy: number;
    ball: boolean;
    ox: number;
    oy: number;
    objLen: number;
    tx: number;
    ty: number;
    cueLen: number;
    bounceLen: number;
    legal: boolean;
    level: "longue" | "courte" | "aucune";
    R: number;
  }) {
    const { cx, cy, gx, gy } = o;
    if (o.level === "aucune") {
      const dx = gx - cx,
        dy = gy - cy;
      const l = Math.hypot(dx, dy) || 1;
      const k = Math.min(l, 0.22);
      this.toGhost.set(cx + (dx / l) * o.R, cy + (dy / l) * o.R, cx + (dx / l) * (o.R + k), cy + (dy / l) * (o.R + k));
      this.ghost.visible = false;
      this.objPath.mesh.visible = false;
      this.cuePath.mesh.visible = false;
      this.bounce.mesh.visible = false;
      return;
    }
    const dx = gx - cx,
      dy = gy - cy;
    const l = Math.hypot(dx, dy) || 1;
    this.toGhost.set(cx + (dx / l) * o.R, cy + (dy / l) * o.R, gx, gy);
    this.ghost.visible = true;
    this.ghost.position.set(gx, 0.002, -gy);
    this.ghostMat.color.set(o.legal ? "#ffffff" : "#ff5a5a");
    const long = o.level === "longue";
    if (o.ball) {
      this.bounce.mesh.visible = false;
      if (long && o.legal) {
        // La bille visée part du point de contact, à deux rayons de la fantôme
        const sx = gx + o.ox * 2 * o.R,
          sy = gy + o.oy * 2 * o.R;
        this.objPath.set(sx, sy, sx + o.ox * o.objLen, sy + o.oy * o.objLen);
        if (o.cueLen > 0.01) this.cuePath.set(gx, gy, gx + o.tx * o.cueLen, gy + o.ty * o.cueLen);
        else this.cuePath.mesh.visible = false;
      } else {
        this.objPath.mesh.visible = false;
        this.cuePath.mesh.visible = false;
      }
    } else {
      this.objPath.mesh.visible = false;
      this.cuePath.mesh.visible = false;
      if (long) this.bounce.set(gx, gy, gx + o.ox * o.bounceLen, gy + o.oy * o.bounceLen);
      else this.bounce.mesh.visible = false;
    }
  }

  /** Les poches à annoncer (pleines et rayées, pour la noire) : `on` celle qui est annoncée */
  pockets(show: boolean, on: number | null) {
    this.markers.forEach((m, i) => {
      m.visible = show;
      m.material = i === on ? this.markerOn : this.markerMat;
    });
  }

  /** Les marqueurs des poches (pour savoir laquelle on touche) */
  get pocketMarkers(): readonly THREE.Mesh[] {
    return this.markers;
  }

  kitchen(show: boolean) {
    this.zone.visible = show;
  }

  dispose() {
    for (const r of [this.toGhost, this.objPath, this.cuePath, this.bounce]) r.dispose();
    this.ghost.geometry.dispose();
    this.markers[0]?.geometry.dispose();
    this.zone.geometry.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
  }
}
