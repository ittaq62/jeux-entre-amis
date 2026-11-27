// Le Sablé à l'écran : de grandes tables de goûter sous des parasols, nappes à carreaux, un tabouret et une boîte en fer
// par candidat. Pendant le choix, quatre grandes boîtes sur l'estrade ; puis chacun ouvre la sienne : un sablé doré au
// bord festonné, une forme gravée. En gros plan, mon biscuit : je suis le trait avec l'aiguille (au doigt, elle se tient
// un peu au-dessus pour qu'on la voie), le trait se creuse, les fêlures courent. Un biscuit cassé : la tarte à la crème
// jaillit de la table.

import * as THREE from "three";
import { carvePoints, newCarve, shapeOf, unhex, type BiscuitView, type Carve } from "../../../../shared/games/cour/ep/biscuit.ts";
import { OUTLINE_N, outline, SHAPE_NAMES, type ShapeId } from "../../../../shared/games/cour/ep/shapes.ts";
import type { EpView, MatchView } from "../../../../shared/games/cour/match.ts";
import type { ActorTarget } from "../crowd.ts";
import { Batch } from "../world.ts";
import { clamp, path, shot, type PointerInfo, type Shot, type Stage, type StageCtx } from "../stage.ts";

const TABLE_Y = 0.74;
const BISCUIT_R = 0.11;
const SEAT_GAP = 1.05;
const PER_SIDE = 8;
export const BOX_COLORS = ["#d9344d", "#2f6fd1", "#f2b632", "#2f9a62"];
export const BOX_SYMBOLS = ["●", "▲", "■", "★"];

/** La place de chacun : sa table, son côté ; la position du biscuit et du tabouret */
function seatOf(i: number): { x: number; z: number; face: number; bx: number; bz: number } {
  const table = Math.floor(i / (PER_SIDE * 2));
  const k = i % (PER_SIDE * 2);
  const side = k < PER_SIDE ? 1 : -1;
  const col = k % PER_SIDE;
  const tz = table * 5.2;
  const x = (col - (PER_SIDE - 1) / 2) * SEAT_GAP;
  return { x, z: tz + side * 0.95, face: side > 0 ? Math.PI : 0, bx: x, bz: tz + side * 0.3 };
}

/** Le dessus du sablé : la pâte dorée, le sucre, le trait gravé, les parties creusées, les fêlures */
function drawBiscuit(g: CanvasRenderingContext2D, shape: ShapeId | null, c: Carve | null, broken: boolean) {
  g.clearRect(0, 0, 512, 512);
  const grad = g.createRadialGradient(256, 236, 40, 256, 256, 260);
  grad.addColorStop(0, "#f0c27a");
  grad.addColorStop(0.7, "#e2a35a");
  grad.addColorStop(1, "#b9792f");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  // Le grain de la pâte, le sucre
  let s = 1234;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 1600; k++) {
    g.fillStyle = r() < 0.5 ? "rgba(120,70,20,0.13)" : "rgba(255,240,200,0.22)";
    g.fillRect(r() * 512, r() * 512, 2, 2);
  }
  for (let k = 0; k < 120; k++) {
    g.fillStyle = "rgba(255,255,255,0.65)";
    g.fillRect(r() * 512, r() * 512, 2.4, 2.4);
  }
  if (!shape) return;
  const o = outline(shape);
  const px = (k: number) => 256 + o.pts[k * 2]! * 256;
  const py = (k: number) => 256 - o.pts[k * 2 + 1]! * 256;
  // Le trait gravé
  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = "rgba(120,62,20,0.6)";
  g.lineWidth = 4;
  g.beginPath();
  for (let k = 0; k <= OUTLINE_N; k++) (k ? g.lineTo : g.moveTo).call(g, px(k % OUTLINE_N), py(k % OUTLINE_N));
  g.stroke();
  if (c) {
    // Ce qui est creusé : un sillon profond, avec sa lèvre claire
    g.lineWidth = 8;
    for (let k = 0; k < OUTLINE_N; k++) {
      if (!c.bits[k] || !c.bits[(k + 1) % OUTLINE_N]) continue;
      g.strokeStyle = "#5a2e0e";
      g.beginPath();
      g.moveTo(px(k), py(k));
      g.lineTo(px((k + 1) % OUTLINE_N), py((k + 1) % OUTLINE_N));
      g.stroke();
    }
    // Les fêlures : des zigzags qui partent de là où l'aiguille a forcé
    g.strokeStyle = "rgba(70,35,10,0.85)";
    g.lineWidth = 2.2;
    for (const [mx, my, size] of c.marks) {
      let x = 256 + mx * 256;
      let y = 256 - my * 256;
      let a = Math.atan2(y - 256, x - 256) + (r() - 0.5);
      const len = 30 + size * 260;
      g.beginPath();
      g.moveTo(x, y);
      for (let d = 0; d < len; d += 9) {
        a += (r() - 0.5) * 0.9;
        x += Math.cos(a) * 9;
        y += Math.sin(a) * 9;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  if (broken) {
    g.strokeStyle = "#3a1a06";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(40, 120);
    g.lineTo(200, 260);
    g.lineTo(250, 230);
    g.lineTo(470, 400);
    g.stroke();
  }
}

/** Le sablé : un disque épais au bord festonné, le dessus dessiné */
function biscuitGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let k = 0; k <= 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    const rr = 1 + Math.cos(a * 16) * 0.035;
    (k ? shape.lineTo : shape.moveTo).call(shape, Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelSize: 0.04,
    bevelThickness: 0.05,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 0);
  return g;
}

export class BiscuitStage implements Stage {
  private root = new THREE.Group();
  private boxes: THREE.Group[] = [];
  private biscuits: THREE.Mesh[] = [];
  private tops: THREE.Mesh[] = [];
  private shapeTex = new Map<string, THREE.CanvasTexture>();
  private myCanvas: HTMLCanvasElement;
  private myTex: THREE.CanvasTexture;
  private myTop: THREE.Mesh | null = null;
  private needle: THREE.Group;
  private carve: Carve | null = null;
  private dirty = true;
  private pending: [number, number, number][] = [];
  private lastSend = 0;
  private drawing = false;
  private myIdx = -1;
  private hasPie = new Set<string>();
  private pies: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; at: number }[] = [];
  private pieGeo: THREE.BufferGeometry;
  private pieMat: THREE.Material;
  private crumbs = 0;
  private broken = false;

  constructor(private ctx: StageCtx) {
    const keep = ctx.world.keep;
    const b = new Batch();
    // Trois grandes tables (jusqu'à 48 candidats), nappes à carreaux en bandes, parasols
    for (let t = 0; t < 3; t++) {
      const tz = t * 5.2;
      const len = PER_SIDE * SEAT_GAP + 0.8;
      for (let k = 0; k < 16; k++)
        b.put(
          new THREE.BoxGeometry(len / 16 + 0.002, 0.05, 1.3),
          k % 2 ? "#ffffff" : "#e0485c",
          -len / 2 + (k + 0.5) * (len / 16),
          TABLE_Y - 0.025,
          tz,
        );
      for (const s of [-1, 1])
        for (const e of [-1, 1])
          b.put(new THREE.CylinderGeometry(0.05, 0.05, TABLE_Y, 8), "#8a5a2e", (e * len) / 2 - e * 0.3, TABLE_Y / 2, tz + s * 0.5);
      for (let col = 0; col < PER_SIDE; col++)
        for (const s of [-1, 1]) {
          const x = (col - (PER_SIDE - 1) / 2) * SEAT_GAP;
          b.put(new THREE.CylinderGeometry(0.2, 0.18, 0.06, 14), "#f2b632", x, 0.4, tz + s * 0.95);
          b.put(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 8), "#5a3f28", x, 0.2, tz + s * 0.95);
        }
      for (const px of [-2.6, 2.6]) {
        b.put(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), "#e8dfcf", px, 1.3, tz);
        for (let k = 0; k < 10; k++) {
          const seg = new THREE.ConeGeometry(1.7, 0.6, 10, 1, true, (k / 10) * Math.PI * 2, Math.PI / 5);
          b.put(seg, k % 2 ? "#ffffff" : t % 2 ? "#2f6fd1" : "#2f9a62", px, 2.75, tz);
        }
      }
    }
    // L'estrade des quatre boîtes, devant les tables
    b.put(new THREE.BoxGeometry(7, 0.5, 2), "#f4efe6", 0, 0.25, -3.4);
    b.put(new THREE.BoxGeometry(7.1, 0.06, 2.1), "#d9344d", 0, 0.52, -3.4);
    const set = b.build(ctx.world.paint, keep);
    if (set) {
      set.castShadow = true;
      set.receiveShadow = true;
      this.root.add(set);
    }
    // Les grandes boîtes en fer, avec leur symbole
    for (let k = 0; k < 4; k++) {
      const g = new THREE.Group();
      const mat = keep(new THREE.MeshStandardMaterial({ color: BOX_COLORS[k], metalness: 0.25, roughness: 0.32 }));
      const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.55, 0.55, 0.55, 32)), mat);
      body.position.y = 0.28;
      const lid = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.58, 0.58, 0.12, 32)), mat);
      lid.position.y = 0.6;
      lid.name = "lid";
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const cg = c.getContext("2d")!;
      cg.fillStyle = "#fff8e8";
      cg.beginPath();
      cg.arc(64, 64, 56, 0, Math.PI * 2);
      cg.fill();
      cg.fillStyle = BOX_COLORS[k]!;
      cg.font = "900 76px system-ui, sans-serif";
      cg.textAlign = "center";
      cg.textBaseline = "middle";
      cg.fillText(BOX_SYMBOLS[k]!, 64, 70);
      const tex = keep(new THREE.CanvasTexture(c));
      tex.colorSpace = THREE.SRGBColorSpace;
      const badge = new THREE.Mesh(
        keep(new THREE.CircleGeometry(0.3, 24)),
        keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })),
      );
      // Le symbole regarde la caméra du choix (vers −z)
      badge.position.set(0, 0.3, -0.56);
      badge.rotation.y = Math.PI;
      g.add(body, lid, badge);
      // Vues depuis la caméra du choix (qui regarde vers +z), la première boîte est à gauche
      g.position.set((1.5 - k) * 1.6, 0.55, -3.4);
      g.traverse((o) => (o.castShadow = true));
      this.boxes.push(g);
      this.root.add(g);
    }
    // Les sablés, un par place
    const geo = keep(biscuitGeometry());
    const side = keep(new THREE.MeshStandardMaterial({ color: "#d4974c", roughness: 0.85 }));
    const topGeo = keep(new THREE.CircleGeometry(1, 48));
    topGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 48; i++) {
      const p = seatOf(i);
      const m = new THREE.Mesh(geo, side);
      m.scale.setScalar(BISCUIT_R);
      m.position.set(p.bx, TABLE_Y, p.bz);
      m.rotation.y = p.face + Math.PI;
      m.castShadow = true;
      m.visible = false;
      const top = new THREE.Mesh(topGeo, side);
      top.position.y = 0.212;
      m.add(top);
      this.biscuits.push(m);
      this.tops.push(top);
      this.root.add(m);
    }
    for (const sh of ["goutte", "lune", "coeur", "etoile"] as ShapeId[]) {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const g = c.getContext("2d")!;
      g.scale(0.5, 0.5);
      drawBiscuit(g, sh, null, false);
      const t = keep(new THREE.CanvasTexture(c));
      t.colorSpace = THREE.SRGBColorSpace;
      this.shapeTex.set(sh, t);
    }
    this.myCanvas = document.createElement("canvas");
    this.myCanvas.width = 512;
    this.myCanvas.height = 512;
    this.myTex = keep(new THREE.CanvasTexture(this.myCanvas));
    this.myTex.colorSpace = THREE.SRGBColorSpace;
    this.myTex.anisotropy = 8;
    // L'aiguille
    this.needle = new THREE.Group();
    const steel = keep(new THREE.MeshStandardMaterial({ color: "#d8dde2", metalness: 0.95, roughness: 0.2 }));
    const shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0016, 0.0002, 0.09, 8)), steel);
    shaft.position.y = 0.045;
    const head = new THREE.Mesh(
      keep(new THREE.SphereGeometry(0.004, 10, 8)),
      keep(new THREE.MeshStandardMaterial({ color: "#d9344d", roughness: 0.3 })),
    );
    head.position.y = 0.09;
    this.needle.add(shaft, head);
    this.needle.rotation.z = 0.35;
    this.needle.visible = false;
    this.root.add(this.needle);
    this.pieGeo = keep(new THREE.CylinderGeometry(0.16, 0.13, 0.07, 18));
    this.pieMat = keep(new THREE.MeshStandardMaterial({ color: "#fff1d8", roughness: 0.6 }));
    this.root.position.set(0, 0, 6);
    ctx.world.stage.add(this.root);
  }

  private worldOfSeat(i: number) {
    const p = seatOf(i);
    return {
      ...p,
      x: p.x + this.root.position.x,
      z: p.z + this.root.position.z,
      bx: p.bx + this.root.position.x,
      bz: p.bz + this.root.position.z,
    };
  }

  frame(ev: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget> {
    const v = ev as BiscuitView;
    const out = new Map<string, ActorTarget>();
    this.myIdx = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    // Les boîtes : celle que j'ai choisie se soulève ; à la révélation, les couvercles sautent
    const myBox = this.myIdx >= 0 ? v.box[this.myIdx]! : -1;
    this.boxes.forEach((g, k) => {
      const lid = g.getObjectByName("lid")!;
      const open = v.stage !== "choix";
      lid.position.y += ((open ? 1.2 : 0.6) - lid.position.y) * Math.min(1, dt * 6);
      lid.rotation.x += ((open ? -0.9 : 0) - lid.rotation.x) * Math.min(1, dt * 6);
      g.position.y += ((myBox === k ? 0.85 : 0.55) - g.position.y) * Math.min(1, dt * 8);
      g.rotation.y = myBox === k ? Math.sin(now / 300) * 0.15 : 0;
    });
    // Mon travail : la vue du serveur fait foi, mon geste est montré tout de suite
    if (this.myIdx >= 0 && v.stage === "jeu") {
      const shape = shapeOf(v, this.myIdx);
      const srv = this.ctx.me ? v.carve[this.ctx.me] : undefined;
      if (shape && (!this.carve || this.carve.shape !== shape)) {
        this.carve = newCarve(shape);
        this.dirty = true;
      }
      if (this.carve && srv) {
        // Le serveur a pu creuser plus (un geste joué par l'ordinateur) : on garde le plus creusé des deux
        const bits = unhex(srv.bits);
        bits.forEach((b, k) => {
          if (b && !this.carve!.bits[k]) {
            this.carve!.bits[k] = 1;
            this.dirty = true;
          }
        });
        if (srv.crack > this.carve.crack + 0.05) {
          this.carve.crack = srv.crack;
          this.carve.marks = srv.marks;
          this.dirty = true;
        }
      }
      this.broken = v.st[this.myIdx] === 2;
    }
    if (this.pending.length && now - this.lastSend > 110) this.flush(now);
    // Les biscuits sur les tables
    v.ids.forEach((id, i) => {
      const seat = this.worldOfSeat(i);
      const st = v.st[i]!;
      const bis = this.biscuits[i];
      const shape = shapeOf(v, i);
      if (bis) {
        bis.visible = v.stage !== "choix";
        const top = this.tops[i]!;
        const mine = i === this.myIdx;
        const mat = top.material as THREE.MeshStandardMaterial;
        const want = mine ? this.myTex : shape ? this.shapeTex.get(shape)! : null;
        if (want && top.material === bis.material) top.material = new THREE.MeshStandardMaterial({ map: want, roughness: 0.75 });
        else if (want && mat.map !== want) {
          mat.map = want;
          mat.needsUpdate = true;
        }
        if (mine) this.myTop = top;
        // Cassé : en deux, de travers
        bis.rotation.z = st === 2 ? 0.25 : 0;
        bis.position.y = TABLE_Y + (st === 1 ? 0.05 : 0);
      }
      const act = v.stage === "jeu" ? (st === 0 ? "carve" : st === 1 ? "celebrate" : "sad") : "sit";
      const standing = act === "celebrate" || act === "sad";
      out.set(id, { x: seat.x, z: seat.z + (standing ? Math.cos(seat.face) * -0.35 : 0), face: seat.face, act, stiff: 6 });
      if (st === 2 && !this.hasPie.has(id)) {
        this.hasPie.add(id);
        const mesh = new THREE.Mesh(this.pieGeo, this.pieMat);
        this.root.parent!.add(mesh);
        this.pies.push({ mesh, from: new THREE.Vector3(seat.bx, TABLE_Y, seat.bz), to: new THREE.Vector3(seat.x, 1.25, seat.z), at: now });
      }
    });
    if (this.dirty && this.myIdx >= 0) {
      this.dirty = false;
      drawBiscuit(this.myCanvas.getContext("2d")!, this.carve?.shape ?? shapeOf(v, this.myIdx), this.carve, this.broken);
      this.myTex.needsUpdate = true;
    }
    for (const p of this.pies) {
      const k = clamp((now - p.at) / 450, 0, 1);
      const pos = p.from.clone().lerp(p.to, k);
      pos.y += Math.sin(k * Math.PI) * 0.5;
      p.mesh.position.copy(pos);
      p.mesh.rotation.x = -k * 1.4;
      if (k >= 1 && p.mesh.parent) {
        p.mesh.removeFromParent();
        this.ctx.burst("tarte", p.to.x, p.to.y, p.to.z, { count: 30 });
        this.ctx.sound("pie", { x: p.to.x, z: p.to.z });
      }
    }
    void m;
    return out;
  }

  /** Le point du biscuit sous le doigt (dans le repère du biscuit : son rayon vaut 1) */
  private biscuitPoint(nx: number, ny: number, touch: boolean): [number, number] | null {
    const top = this.myTop;
    if (!top) return null;
    const ray = new THREE.Raycaster();
    // Au doigt, l'aiguille se tient un peu au-dessus de lui (sinon il la cache)
    ray.setFromCamera(new THREE.Vector2(nx, ny + (touch ? 0.16 : 0)), this.ctx.world.camera);
    top.updateMatrixWorld(true);
    const inv = top.matrixWorld.clone().invert();
    const o = ray.ray.origin.clone().applyMatrix4(inv);
    const d = ray.ray.direction.clone().transformDirection(inv).normalize();
    if (Math.abs(d.y) < 1e-6) return null;
    const t = -o.y / d.y;
    const p = o.add(d.multiplyScalar(t));
    return [p.x, -p.z];
  }

  pointer(p: PointerInfo, ev: EpView | null) {
    const v = ev as BiscuitView | null;
    if (!v || this.myIdx < 0) return;
    if (v.stage === "choix") return;
    if (v.stage !== "jeu" || v.st[this.myIdx] !== 0 || !this.carve) {
      this.needle.visible = false;
      return;
    }
    const pt = this.biscuitPoint(p.nx, p.ny, p.touch);
    if (p.kind === "down") this.drawing = true;
    if (p.kind === "up") {
      this.drawing = false;
      this.carve.last = null;
      this.flush(this.ctx.serverNow());
    }
    if (pt && this.myTop) {
      const w = new THREE.Vector3(pt[0], 0.002, -pt[1]).applyMatrix4(this.myTop.matrixWorld);
      this.needle.visible = true;
      this.needle.position.copy(w).sub(this.root.position);
    }
    if (!this.drawing || !pt) return;
    const sample: [number, number, number] = [Math.round(pt[0] * 1000) / 1000, Math.round(pt[1] * 1000) / 1000, Math.round(p.t)];
    const broke = carvePoints(this.carve, [sample]);
    this.pending.push(sample);
    this.dirty = true;
    if (Math.random() < 0.3) this.ctx.sound("scratch", { gain: 0.5 });
    if (this.carve.crack > this.crumbs + 0.08) {
      this.crumbs = this.carve.crack;
      this.ctx.sound("crack", { gain: 0.4 + this.carve.crack * 0.5 });
    }
    if (broke) this.broken = true;
  }

  private flush(now: number) {
    if (!this.pending.length) return;
    this.lastSend = now;
    this.ctx.send({ k: "trace", pts: this.pending.splice(0, 100) });
  }

  choose(box: number) {
    this.ctx.send({ k: "box", box });
    this.ctx.sound("tin");
  }

  hud(ev: EpView, now: number) {
    const v = ev as BiscuitView;
    const i = this.myIdx;
    const shape = i >= 0 ? shapeOf(v, i) : null;
    return {
      stage: v.stage,
      until: v.until,
      left: Math.max(0, Math.ceil((v.until - now) / 1000)),
      box: i >= 0 ? v.box[i] : null,
      shape,
      shapeName: shape ? SHAPE_NAMES[shape] : null,
      prog: this.carve ? this.carve.bits.reduce((a, b) => a + b, 0) / OUTLINE_N : i >= 0 ? v.prog[i] : 0,
      crack: this.carve ? Math.min(1, this.carve.crack) : i >= 0 ? v.crack[i] : 0,
      st: i >= 0 ? v.st[i] : null,
      done: v.st.filter((s) => s === 1).length,
      broken: v.st.filter((s) => s === 2).length,
    };
  }

  onFx(k: string, f: { id?: string }) {
    if (k === "ouvre") this.ctx.sound("tinOpen");
    else if (k === "casse" && f.id) this.ctx.sound("break", { gain: f.id === this.ctx.me ? 1 : 0.3 });
    else if (k === "detache" && f.id) this.ctx.sound("ding", { gain: f.id === this.ctx.me ? 1 : 0.2 });
    else if (k === "gong") this.ctx.sound("gong");
  }

  camera(ev: EpView | null, m: MatchView, now: number): Shot {
    const v = ev as BiscuitView | null;
    void m;
    void now;
    if (v && v.stage === "choix") return shot(0, 3.6, this.root.position.z - 10.5, 0, 1.2, this.root.position.z - 1.5, 44);
    if (v && this.myIdx >= 0 && v.stage === "jeu" && v.st[this.myIdx] === 0) {
      const s = this.worldOfSeat(this.myIdx);
      const back = Math.cos(s.face) * -1;
      // Au-dessus de mon biscuit, presque à la verticale, le haut de la forme en haut de l'écran
      return shot(s.bx, TABLE_Y + 0.36, s.bz + back * 0.1, s.bx, TABLE_Y, s.bz - back * 0.005, 38, { ease: 2.5 });
    }
    if (v && this.myIdx >= 0) {
      const s = this.worldOfSeat(this.myIdx);
      const back = Math.cos(s.face) * -1;
      return shot(s.bx + 1.2, 1.7, s.bz + back * 2.2, s.bx, 0.9, s.bz, 46);
    }
    return shot(-7, 5, this.root.position.z - 6, 0, 0.8, this.root.position.z + 4, 48, { ease: 0.6 });
  }

  reveal(k: number): Shot {
    const z = this.root.position.z;
    return path([shot(14, 9, z + 18, 0, 1, z + 4, 48), shot(6, 3, z - 6, 0, 1, z + 2, 46), shot(0, 1.6, z - 6.5, 0, 1, z - 3.4, 40)], k);
  }

  lineup(ids: string[]): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    ids.forEach((id, i) => {
      const s = this.worldOfSeat(i);
      out.set(id, { x: s.x, z: s.z, face: s.face, act: "sit", stiff: 3 });
    });
    return out;
  }

  dispose() {
    for (const p of this.pies) p.mesh.removeFromParent();
    for (const t of this.tops) if (t.material !== this.biscuits[0]?.material) (t.material as THREE.Material).dispose();
    this.root.removeFromParent();
  }
}
