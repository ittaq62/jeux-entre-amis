// 1, 2, 3, Tournesol ! à l'écran : la grande allée de pelouse entre la ligne de départ et le ruban d'arrivée, et au bout
// le Tournesol géant, gardien de la cour : une tige de neuf mètres, de grandes feuilles, une couronne de pétales et un
// visage dans son cœur de graines. Il chante dos tourné (sa tête regarde ailleurs), pivote, et ses yeux balaient la
// foule ; qui bouge encore reçoit une boule de peinture crachée en cloche.
//
// Ma course est prédite sur mon écran (le même élan que le serveur) pour répondre tout de suite au doigt.

import * as THREE from "three";
import type { SoleilView } from "../../../../shared/games/cour/ep/soleil.ts";
import { SOLEIL_ACC, SOLEIL_DEC, SOLEIL_GRACE, SOLEIL_LEN, SOLEIL_VMAX } from "../../../../shared/games/cour/ep/soleil.ts";
import type { EpView, MatchView } from "../../../../shared/games/cour/match.ts";
import type { ActorTarget } from "../crowd.ts";
import { Batch } from "../world.ts";
import { clamp, path, shot, standsPlaces, type Shot, type Stage, type StageCtx } from "../stage.ts";

const FLOWER_Z = SOLEIL_LEN + 9;
const HEAD_Y = 9.2;

/** Le cœur du tournesol : des graines en spirale, et un visage */
function seedTexture(keep: <T extends { dispose: () => void }>(x: T) => T): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  grad.addColorStop(0, "#5a3417");
  grad.addColorStop(0.7, "#3f230f");
  grad.addColorStop(1, "#2a1608");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < 900; k++) {
    const r = Math.sqrt(k / 900) * 245;
    const a = k * phi;
    g.fillStyle = k % 3 ? "#6e4521" : "#8a5a2b";
    g.beginPath();
    g.ellipse(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 4.5, 3, a, 0, Math.PI * 2);
    g.fill();
  }
  const t = keep(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Les yeux et le sourire du tournesol (sur une toile à part, pour cligner et briller quand il regarde) */
function faceCanvas(state: "doux" | "regarde" | "content"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  const eye = (x: number) => {
    g.fillStyle = "#fffdf4";
    g.beginPath();
    g.ellipse(x, 110, 34, state === "regarde" ? 30 : 40, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = state === "regarde" ? "#d61f3c" : "#1d140c";
    g.beginPath();
    g.arc(x + (state === "regarde" ? 0 : 4), state === "regarde" ? 112 : 118, state === "regarde" ? 17 : 19, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(x + 10, 102, 7, 0, Math.PI * 2);
    g.fill();
    if (state === "regarde") {
      // Les sourcils froncés
      g.strokeStyle = "#1d140c";
      g.lineWidth = 9;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(x - 32, x < 128 ? 64 : 78);
      g.lineTo(x + 30, x < 128 ? 80 : 62);
      g.stroke();
    }
  };
  eye(82);
  eye(174);
  g.strokeStyle = "#1d140c";
  g.lineWidth = 9;
  g.lineCap = "round";
  g.beginPath();
  if (state === "regarde") {
    g.ellipse(128, 190, 20, 14, 0, 0, Math.PI * 2);
    g.fillStyle = "#3a0d0d";
    g.fill();
  } else g.arc(128, 160, 46, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  g.fillStyle = "rgba(255, 120, 120, 0.45)";
  g.beginPath();
  g.ellipse(48, 168, 18, 10, 0, 0, Math.PI * 2);
  g.ellipse(208, 168, 18, 10, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

interface Splat {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  at: number;
  dur: number;
  id: string;
  done: boolean;
}

export class SoleilStage implements Stage {
  private root = new THREE.Group();
  private head = new THREE.Group();
  private face: THREE.Mesh;
  private faces: Record<string, THREE.CanvasTexture> = {};
  private faceState = "";
  private splats: Splat[] = [];
  private ballGeo: THREE.SphereGeometry;
  private ballMat: THREE.MeshStandardMaterial;
  private headYaw = Math.PI * 2;
  /** Ma course prédite */
  private my = { z: 0, v: 0, run: false, set: false };
  private stands: [number, number, number][] = [];

  constructor(private ctx: StageCtx) {
    const keep = ctx.world.keep;
    const b = new Batch();
    // L'allée : deux lignes de craie, le départ, l'arrivée et son ruban, des pots de fleurs le long
    const W = 34;
    b.put(new THREE.BoxGeometry(W, 0.02, 0.18), "#ffffff", 0, 0.012, 0.3);
    b.put(new THREE.BoxGeometry(W, 0.02, 0.4), "#ffffff", 0, 0.012, SOLEIL_LEN);
    for (let k = 0; k < 22; k++) {
      const z = (k / 21) * SOLEIL_LEN;
      for (const s of [-1, 1]) b.put(new THREE.BoxGeometry(0.12, 0.02, 0.9), "#f4f1e8", (s * W) / 2, 0.012, z);
    }
    for (const s of [-1, 1]) {
      b.put(new THREE.CylinderGeometry(0.12, 0.14, 2.4, 8), "#f4efe6", (s * W) / 2, 1.2, SOLEIL_LEN);
      b.put(new THREE.SphereGeometry(0.22, 10, 8), "#d9344d", (s * W) / 2, 2.5, SOLEIL_LEN);
    }
    for (let k = 0; k < 18; k++) {
      const x = -W / 2 + (k / 17) * W;
      b.put(new THREE.BoxGeometry(W / 18 + 0.02, 0.32, 0.03), k % 2 ? "#ffffff" : "#d9344d", x, 1.7, SOLEIL_LEN);
    }
    // Des pots de fleurs sur les côtés
    for (let k = 0; k < 12; k++) {
      const z = 2 + k * 3.8;
      for (const s of [-1, 1]) {
        const x = s * (W / 2 + 2.2);
        b.put(new THREE.CylinderGeometry(0.45, 0.32, 0.6, 10), "#c46a3a", x, 0.3, z);
        for (let f = 0; f < 5; f++) {
          const a = (f / 5) * Math.PI * 2 + k;
          b.put(
            new THREE.SphereGeometry(0.16, 8, 6),
            ["#ff6b8b", "#ffd84a", "#ffffff", "#ff9d4a"][(f + k) % 4]!,
            x + Math.cos(a) * 0.25,
            0.78,
            z + Math.sin(a) * 0.25,
          );
        }
        b.put(new THREE.SphereGeometry(0.35, 8, 6), "#4e8f3a", x, 0.62, z, 0, 1, 0.5, 1);
      }
    }
    // Les gradins pour les éliminés, à droite de l'allée
    for (let r = 0; r < 3; r++)
      b.put(
        new THREE.BoxGeometry(2.4, 0.5 * (r + 1), 36),
        r % 2 ? "#e9e1cf" : "#d4cab3",
        W / 2 + 5.5 + r * 1.2,
        0.25 * (r + 1),
        SOLEIL_LEN / 2,
      );
    // La tige du tournesol, ses feuilles, le pot de terre. Elle s'attache derrière la tête (côté +z), pas en son milieu :
    // sinon elle ressort à travers le visage quand il regarde les candidats.
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, FLOWER_Z),
      new THREE.Vector3(0.3, 3, FLOWER_Z + 0.4),
      new THREE.Vector3(-0.2, 6.2, FLOWER_Z + 0.6),
      new THREE.Vector3(0, HEAD_Y - 1, FLOWER_Z + 0.68),
    ]);
    b.add(new THREE.TubeGeometry(stemCurve, 24, 0.42, 10), "#4f9a3a");
    for (const [y, s, rot] of [
      [3.2, 1, 0.4],
      [4.6, -1, -0.3],
      [6.2, 1, 0.6],
    ] as const) {
      const leaf = new THREE.SphereGeometry(1, 14, 8);
      leaf.scale(1.9, 0.12, 0.9);
      leaf.translate(1.6, 0, 0);
      b.put(leaf, "#5aa845", 0, y, FLOWER_Z, rot, s, 1, 1, 0, s * 0.35);
    }
    b.put(new THREE.CylinderGeometry(2.2, 1.7, 1.6, 18), "#b9663a", 0, 0.8, FLOWER_Z);
    b.put(new THREE.CylinderGeometry(2.3, 2.3, 0.3, 18), "#9c5230", 0, 1.6, FLOWER_Z);
    const set = b.build(ctx.world.paint, keep);
    if (set) {
      set.castShadow = true;
      set.receiveShadow = true;
      this.root.add(set);
    }
    // La tête : le cœur de graines, son visage, deux couronnes de pétales
    const disc = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(2.1, 2.1, 0.5, 40)),
      keep(new THREE.MeshStandardMaterial({ map: seedTexture(keep), roughness: 0.9 })),
    );
    disc.rotation.x = Math.PI / 2;
    this.head.add(disc);
    const petals = new Batch();
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 22 : 18;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.14;
        const petal = new THREE.SphereGeometry(1, 10, 6);
        petal.scale(0.5, 1.45, 0.12);
        petal.translate(0, 2.9 + ring * 0.25, 0);
        petals.put(petal, ring ? "#f6b21a" : "#ffd23f", 0, 0, -0.05 - ring * 0.12, 0, 1, 1, 1, 0, a);
      }
    }
    const pm = petals.build(ctx.world.paint, keep);
    if (pm) this.head.add(pm);
    for (const s of ["doux", "regarde", "content"] as const) {
      const t = keep(new THREE.CanvasTexture(faceCanvas(s)));
      t.colorSpace = THREE.SRGBColorSpace;
      this.faces[s] = t;
    }
    this.face = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(3.2, 3.2)),
      keep(new THREE.MeshStandardMaterial({ map: this.faces.doux!, transparent: true, roughness: 0.6 })),
    );
    this.face.position.z = 0.27;
    this.head.add(this.face);
    this.head.position.set(0, HEAD_Y, FLOWER_Z);
    this.head.traverse((o) => (o.castShadow = true));
    this.root.add(this.head);
    this.ballGeo = keep(new THREE.SphereGeometry(0.28, 14, 10));
    this.ballMat = keep(new THREE.MeshStandardMaterial({ color: "#ff3f86", roughness: 0.35 }));
    ctx.world.stage.add(this.root);
  }

  private setFace(s: string) {
    if (s === this.faceState) return;
    this.faceState = s;
    (this.face.material as THREE.MeshStandardMaterial).map = this.faces[s]!;
    (this.face.material as THREE.MeshStandardMaterial).needsUpdate = true;
  }

  /** Mon doigt sur « courir » : on le prédit tout de suite, le serveur suit */
  setRun(on: boolean) {
    if (this.my.run === on) return;
    this.my.run = on;
    this.ctx.send({ k: "run", on });
  }

  frame(ev: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget> {
    const v = ev as SoleilView;
    const out = new Map<string, ActorTarget>();
    // La tête du tournesol : dos tourné pendant le chant (visage vers le fond, +z), de face quand il regarde (visage
    // vers les candidats, −z). Le visage est du côté +z de la tête : un angle de π le tourne vers l'allée.
    const facing = v.head === "regarde" || (v.head === "tourne" && now - v.headAt > 250);
    const want =
      v.head === "dos"
        ? Math.PI * 2
        : v.head === "retourne"
          ? Math.PI * 1.5 + Math.PI * Math.min(1, (now - v.headAt) / 450) * 0.5
          : facing
            ? Math.PI
            : Math.PI * (2 - Math.min(1, (now - v.headAt) / 500));
    this.headYaw += (want - this.headYaw) * Math.min(1, dt * 14);
    const sway = v.head === "dos" ? Math.sin(now / 260) * 0.08 : 0;
    this.head.rotation.set(0.12 + (v.head === "regarde" ? -0.12 : 0), this.headYaw + sway, sway * 0.5);
    this.setFace(v.head === "regarde" && now >= v.headAt + SOLEIL_GRACE * 1000 ? "regarde" : v.stage === "fin" ? "content" : "doux");
    // Ma course prédite
    const meIdx = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    if (meIdx >= 0) {
      const srvZ = v.z[meIdx]!;
      if (!this.my.set || v.st[meIdx] !== 0) {
        this.my.z = srvZ;
        this.my.v = v.v[meIdx]!;
        this.my.set = true;
      } else {
        const step = Math.min(0.1, dt);
        const v0 = this.my.v;
        this.my.v = this.my.run ? Math.min(SOLEIL_VMAX, v0 + SOLEIL_ACC * step) : Math.max(0, v0 - SOLEIL_DEC * step);
        this.my.z += ((v0 + this.my.v) / 2) * step;
        // On rejoint doucement le serveur (qui a reçu le doigt un peu plus tard)
        this.my.z += (srvZ + v.v[meIdx]! * 0.08 - this.my.z) * Math.min(1, dt * 2.5);
      }
    }
    // Les éliminés d'avant dans les gradins
    const before = m.cands.filter((c) => !c.alive && c.outRound < m.round);
    if (this.stands.length !== before.length)
      this.stands = standsPlaces(before.length, 17 + 5.5, SOLEIL_LEN / 2, 0, 0, 0).map((_, k) => [
        17 + 5.5 + Math.floor(k / 26) * 1.2,
        0.5 * (Math.floor(k / 26) + 1),
        4 + (k % 26) * 1.3,
      ]);
    before.forEach((c, k) => {
      const p = this.stands[k];
      if (p) out.set(c.id, { x: p[0], y: p[1], z: p[2], face: -Math.PI / 2, act: "sit", snap: true });
    });
    const t = (now - v.startAt) / 1000;
    v.ids.forEach((id, i) => {
      const st = v.st[i]!;
      const mine = i === meIdx;
      let z = mine ? this.my.z : v.z[i]!;
      const speed = mine ? this.my.v : v.v[i]!;
      if (st === 1) {
        // Arrivé : il file un peu plus loin, et fête ça
        z = Math.max(z, SOLEIL_LEN + 1.2 + ((i * 37) % 5) * 0.4);
        out.set(id, { x: v.x[i]!, z, face: 0, act: t - (v.fin[i] ?? 0) < 4 ? "celebrate" : "idle", stiff: 4 });
        return;
      }
      if (st === 2) {
        out.set(id, { x: v.x[i]!, z: Math.min(z, SOLEIL_LEN - 0.5), face: 0, act: "lie", stiff: 6 });
        return;
      }
      const act = speed > 0.5 ? "run" : speed > 0.06 ? "walk" : v.head === "regarde" || v.head === "tourne" ? "freeze" : "idle";
      out.set(id, { x: v.x[i]!, z, face: 0, act, speed, stiff: mine ? 30 : 14 });
    });
    // Les boules de peinture en vol
    for (const s of this.splats) {
      if (s.done) continue;
      const k = (now - s.at) / s.dur;
      if (k >= 1) {
        s.done = true;
        s.mesh.removeFromParent();
        this.ctx.burst("peinture", s.to.x, s.to.y, s.to.z, { color: "#ff3f86", count: 40 });
        this.ctx.sound("splat", { x: s.to.x, z: s.to.z });
        const a = this.ctx.actors.get(s.id);
        a?.stainWith("peinture", 0.85);
        continue;
      }
      const p = s.from.clone().lerp(s.to, k);
      p.y += Math.sin(k * Math.PI) * 6;
      s.mesh.position.copy(p);
    }
    return out;
  }

  /** Ce que l'interface affiche : le chant, ma distance, le temps */
  hud(ev: EpView, now: number) {
    const v = ev as SoleilView;
    const i = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    return {
      head: v.head,
      headAt: v.headAt,
      headUntil: v.headUntil,
      watching: v.head === "regarde" && now >= v.headAt + SOLEIL_GRACE * 1000,
      stage: v.stage,
      startAt: v.startAt,
      endsAt: v.endsAt,
      dist: i >= 0 ? clamp(this.my.z / SOLEIL_LEN, 0, 1) : null,
      st: i >= 0 ? v.st[i] : null,
      others: v.z.map((z, k) => (v.st[k] === 2 ? -1 : clamp(z / SOLEIL_LEN, 0, 1))),
      running: this.my.run,
    };
  }

  onFx(k: string, f: { id?: string; a?: number }, ev: EpView | null, now: number) {
    const v = ev as SoleilView | null;
    if (k === "peinture" && f.id && v) {
      const i = v.ids.indexOf(f.id);
      const a = this.ctx.actors.get(f.id);
      const from = new THREE.Vector3(0, HEAD_Y - 0.8, FLOWER_Z - 0.6);
      const to = new THREE.Vector3(a?.x ?? v.x[i] ?? 0, 1.2, a?.z ?? v.z[i] ?? 0);
      const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
      this.root.add(mesh);
      const dist = from.distanceTo(to);
      this.splats.push({ mesh, from, to, at: now, dur: 380 + dist * 14, id: f.id, done: false });
      this.ctx.sound("spit", { x: 0, z: FLOWER_Z });
    } else if (k === "chant") this.ctx.sound("chant", { rate: f.a ?? 3000 });
    else if (k === "tourne") this.ctx.sound("turn");
    else if (k === "regarde") this.ctx.sound("look");
    else if (k === "arrive") this.ctx.sound("ding", { gain: f.id === this.ctx.me ? 1 : 0.25 });
    else if (k === "fane") this.ctx.sound("wah");
  }

  key(code: string, down: boolean) {
    if (code === "Space" || code === "ArrowUp" || code === "KeyW" || code === "KeyZ") this.setRun(down);
  }

  camera(ev: EpView | null, m: MatchView, now: number): Shot {
    const v = ev as SoleilView | null;
    const i = v && this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    if (v && i >= 0 && v.st[i] === 0) {
      // Derrière moi, à hauteur d'épaule, le tournesol au bout de l'allée
      const x = v.x[i]!;
      const z = this.my.z;
      const tense = v.head === "regarde" ? 1 : 0;
      return shot(x * 0.7, 2.6 - tense * 0.3, z - 6.2 + tense * 0.6, x * 0.3, 2.4 + tense * 1.2, z + 14, 52 - tense * 6, { ease: 1.6 });
    }
    // Les autres (ou moi, sorti ou arrivé) : la foule de trois quarts, le tournesol au fond
    const alive = v ? v.z.filter((_, k) => v.st[k] === 0) : [];
    const mid = alive.length ? alive.reduce((a, b) => a + b, 0) / alive.length : SOLEIL_LEN / 2;
    void m;
    void now;
    return shot(-14, 7, mid - 12, 0, 2, mid + 10, 52, { ease: 0.8 });
  }

  reveal(k: number): Shot {
    return path(
      [
        shot(26, 16, FLOWER_Z + 22, 0, HEAD_Y, FLOWER_Z, 48),
        shot(10, 11, FLOWER_Z + 7, 0, HEAD_Y, FLOWER_Z, 40),
        shot(-4, HEAD_Y + 1, FLOWER_Z - 7, 0, HEAD_Y, FLOWER_Z, 38),
        shot(0, 4, -9, 0, 3, 20, 55),
      ],
      k,
    );
  }

  lineup(ids: string[]): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    const n = ids.length;
    const perRow = n > 22 ? Math.ceil(n / 2) : n;
    const width = Math.min(30, perRow * 1.5);
    ids.forEach((id, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const x = -width / 2 + (width * ((i % perRow) + 0.5 + (row ? 0.25 : 0))) / inRow;
      out.set(id, { x, z: -row * 1.6 - 0.5, face: 0, act: "idle", stiff: 3 });
    });
    return out;
  }

  dispose() {
    for (const s of this.splats) s.mesh.removeFromParent();
    this.root.removeFromParent();
  }
}
