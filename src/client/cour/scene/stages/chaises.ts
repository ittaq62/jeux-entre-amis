// Les Chaises musicales à l'écran : un grand plancher de bal rond sous une guirlande d'ampoules, la fanfare sur son
// kiosque, et le cercle des chaises de bois peintes, dossier vers le centre. La foule tourne autour tant que la musique
// joue ; elle s'arrête, tout le monde fonce, et sous ceux qui restent debout une trappe s'ouvre sur la piscine à balles
// (les balles giclent).

import * as THREE from "three";
import { chairPos, dashPos, walkPos, WALK_GAP, type ChaisesView } from "../../../../shared/games/cour/ep/chaises.ts";
import type { EpView, MatchView } from "../../../../shared/games/cour/match.ts";
import type { ActorTarget } from "../crowd.ts";
import { Batch } from "../world.ts";
import { path, shot, type Shot, type Stage, type StageCtx } from "../stage.ts";

const CHAIR_COLORS = ["#d9344d", "#2f6fd1", "#f2b632", "#2f9a62", "#e85fa0", "#8a4fd1"];

function chairGeometry(color: string, b: Batch, x: number, z: number, ry: number) {
  const wood = "#8a5a2e";
  const put = (geo: THREE.BufferGeometry, col: string, px: number, py: number, pz: number) => {
    const m = new THREE.Matrix4().makeRotationY(ry);
    const p = new THREE.Vector3(px, py, pz).applyMatrix4(m);
    b.put(geo, col, x + p.x, p.y, z + p.z, ry);
  };
  put(new THREE.BoxGeometry(0.46, 0.06, 0.44), color, 0, 0.45, 0);
  for (const [lx, lz] of [
    [-0.19, -0.18],
    [0.19, -0.18],
    [-0.19, 0.18],
    [0.19, 0.18],
  ])
    put(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), wood, lx!, 0.225, lz!);
  // Le dossier, derrière (vers le centre du cercle : -z dans le repère de la chaise)
  for (const lx of [-0.19, 0.19]) put(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), wood, lx, 0.72, -0.2);
  put(new THREE.BoxGeometry(0.46, 0.14, 0.04), color, 0, 0.92, -0.2);
}

export class ChaisesStage implements Stage {
  private root = new THREE.Group();
  private chairs: THREE.Mesh | null = null;
  private chairKey = "";
  private bulbs: THREE.InstancedMesh;
  private holes: { mesh: THREE.Mesh; at: number }[] = [];
  private holeGeo: THREE.CircleGeometry;
  private holeMat: THREE.MeshBasicMaterial;
  private fell = new Map<string, { x: number; z: number; at: number }>();
  private myIdx = -1;
  private stopSeen = 0;
  private pressedAt = 0;

  constructor(private ctx: StageCtx) {
    const keep = ctx.world.keep;
    const b = new Batch();
    // Le plancher de bal, en lattes rayonnantes
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const seg = new THREE.CylinderGeometry(7.5, 7.5, 0.12, 2, 1, false, a, (Math.PI * 2) / 36 + 0.002);
      b.add(seg, k % 2 ? "#d4a46c" : "#c99a62", new THREE.Matrix4().makeTranslation(0, 0.06, 0));
    }
    b.put(new THREE.TorusGeometry(7.55, 0.1, 6, 64), "#8a5a2e", 0, 0.1, 0, 0, 1, 1, 1, Math.PI / 2);
    // Le kiosque de la fanfare, au bord
    b.put(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 12), "#f4efe6", 0, 0.3, -11);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.put(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), "#f4efe6", Math.cos(a) * 2.1, 1.9, -11 + Math.sin(a) * 2.1);
    }
    b.put(new THREE.ConeGeometry(3, 1.4, 12), "#d9344d", 0, 3.9, -11);
    // Les mâts de la guirlande
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.put(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 8), "#3a3f4a", Math.cos(a) * 9, 2.1, Math.sin(a) * 9);
    }
    const set = b.build(ctx.world.paint, keep);
    if (set) {
      set.receiveShadow = true;
      set.castShadow = true;
      this.root.add(set);
    }
    // La guirlande d'ampoules, du haut d'un mât à l'autre
    const n = 8 * 14;
    this.bulbs = new THREE.InstancedMesh(
      keep(new THREE.SphereGeometry(0.09, 8, 6)),
      keep(new THREE.MeshStandardMaterial({ color: "#fff4c2", emissive: new THREE.Color("#ffcc66"), emissiveIntensity: 1.4 })),
      n,
    );
    const mm = new THREE.Matrix4();
    let c = 0;
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2;
      const a1 = ((k + 1) / 8) * Math.PI * 2;
      for (let j = 0; j < 14; j++) {
        const t = (j + 0.5) / 14;
        const x = Math.cos(a0) * 9 * (1 - t) + Math.cos(a1) * 9 * t;
        const z = Math.sin(a0) * 9 * (1 - t) + Math.sin(a1) * 9 * t;
        mm.makeTranslation(x, 4.1 - Math.sin(t * Math.PI) * 0.7, z);
        this.bulbs.setMatrixAt(c++, mm);
      }
    }
    this.root.add(this.bulbs);
    this.holeGeo = keep(new THREE.CircleGeometry(0.55, 24));
    this.holeGeo.rotateX(-Math.PI / 2);
    this.holeMat = keep(new THREE.MeshBasicMaterial({ color: "#1a1a24" }));
    this.root.position.set(0, 0, 10);
    ctx.world.stage.add(this.root);
  }

  private buildChairs(v: ChaisesView) {
    const key = `${v.round}:${v.chairAng.length}:${v.R}`;
    if (key === this.chairKey) return;
    this.chairKey = key;
    this.chairs?.removeFromParent();
    this.chairs?.geometry.dispose();
    const b = new Batch();
    v.chairAng.forEach((a, c) => {
      const [x, z] = chairPos(v, c, 0);
      // Le dossier vers le centre : la chaise regarde vers l'extérieur
      chairGeometry(CHAIR_COLORS[c % CHAIR_COLORS.length]!, b, x, z, Math.atan2(Math.cos(a), Math.sin(a)));
    });
    this.chairs = b.build(this.ctx.world.paint, this.ctx.world.keep);
    if (this.chairs) {
      this.chairs.castShadow = true;
      this.root.add(this.chairs);
    }
  }

  frame(ev: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget> {
    const v = ev as ChaisesView;
    const out = new Map<string, ActorTarget>();
    this.buildChairs(v);
    this.myIdx = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    const o = this.root.position;
    // Les ampoules clignotent en rythme tant que la musique joue
    (this.bulbs.material as THREE.MeshStandardMaterial).emissiveIntensity = v.stage === "tour" ? 1.1 + Math.sin(now / 160) * 0.5 : 0.6;
    v.ids.forEach((id, i) => {
      const st = v.st[i]!;
      if (!v.inRound.includes(i) && st !== 2) return;
      if (st === 2) {
        // Tombé par la trappe : il disparaît sous le plancher (on le revoit dans les gradins à l'épreuve suivante)
        let f = this.fell.get(id);
        if (!f) {
          const [x, z] = v.from[i]!;
          f = { x, z, at: now };
          this.fell.set(id, f);
          const hole = new THREE.Mesh(this.holeGeo, this.holeMat);
          hole.position.set(x, 0.125, z);
          this.root.add(hole);
          this.holes.push({ mesh: hole, at: now });
          this.ctx.burst("balles", o.x + x, 0.3, o.z + z, { count: 40, power: 1.2 });
        }
        const age = (now - f.at) / 1000;
        if (age > 1.2) return;
        out.set(id, { x: o.x + f.x, y: -Math.max(0, age - 0.15) * 4, z: o.z + f.z, act: "plunge", stiff: 30 });
        return;
      }
      const sat = v.sat[i]!;
      if (sat >= 0) {
        const [x, z] = chairPos(v, sat);
        const a = v.chairAng[sat]!;
        out.set(id, { x: o.x + x, z: o.z + z, face: Math.atan2(Math.cos(a), Math.sin(a)), act: "sit", stiff: 14 });
        return;
      }
      if (v.go[i]! > 0 && v.tgt[i]! >= 0) {
        const [x, z] = dashPos(v, i, now);
        const [cx, cz] = chairPos(v, v.tgt[i]!);
        out.set(id, { x: o.x + x, z: o.z + z, face: Math.atan2(cx - x, cz - z), act: "dash", speed: 4.2, stiff: 25 });
        return;
      }
      // En marche autour du cercle (le sens des aiguilles d'une montre vu d'en haut), ou figé après l'arrêt
      const [x, z] = walkPos(v, v.ang[i]!);
      const tangent = v.ang[i]! + Math.PI / 2;
      const walking = v.stage === "tour" && now >= v.stageAt;
      out.set(id, {
        x: o.x + x,
        z: o.z + z,
        face: Math.atan2(Math.cos(tangent), Math.sin(tangent)),
        act: walking ? (v.faux[i] ? "wobble" : "walk") : v.stage === "course" ? "think" : "idle",
        speed: 1.25,
        stiff: 12,
      });
    });
    for (const h of this.holes) {
      const k = Math.min(1, (now - h.at) / 250);
      h.mesh.scale.setScalar(k * (now - h.at > 2200 ? Math.max(0, 1 - (now - h.at - 2200) / 400) : 1));
    }
    void dt;
    void m;
    void WALK_GAP;
    return out;
  }

  /** Je veux m'asseoir : mon temps de réaction depuis que j'ai entendu la musique s'arrêter */
  sit() {
    const now = this.ctx.serverNow();
    if (this.pressedAt && now - this.pressedAt < 400) return;
    this.pressedAt = now;
    this.ctx.send({ k: "sit", react: this.stopSeen ? Math.round(performance.now() - this.stopSeen) : 0 });
  }

  key(code: string, down: boolean) {
    if (down && (code === "Space" || code === "Enter" || code === "ArrowDown" || code === "KeyS")) this.sit();
  }

  hud(ev: EpView, now: number) {
    const v = ev as ChaisesView;
    const i = this.myIdx;
    return {
      stage: v.stage,
      round: v.round,
      chairs: v.chairAng.length,
      players: v.inRound.length,
      st: i >= 0 ? v.st[i] : null,
      inRound: i >= 0 && v.inRound.includes(i),
      sat: i >= 0 ? v.sat[i]! >= 0 : false,
      going: i >= 0 ? v.go[i]! > 0 : false,
      faux: i >= 0 ? v.faux[i]! > 0 : false,
      music: v.stage === "tour" && now >= v.stageAt,
    };
  }

  onFx(k: string, f: { id?: string }) {
    if (k === "musique") this.ctx.sound("chairsMusic");
    else if (k === "stop") {
      this.stopSeen = performance.now();
      this.ctx.sound("chairsStop");
    } else if (k === "assis") this.ctx.sound("sit", { gain: f.id === this.ctx.me ? 1 : 0.3 });
    else if (k === "trappe") this.ctx.sound("trapdoor", { gain: f.id === this.ctx.me ? 1 : 0.5 });
    else if (k === "siffle") this.ctx.sound("whistle", { gain: f.id === this.ctx.me ? 1 : 0.4 });
  }

  camera(ev: EpView | null, m: MatchView, now: number): Shot {
    const v = ev as ChaisesView | null;
    void m;
    const o = this.root.position;
    if (v && this.myIdx >= 0 && v.st[this.myIdx] === 0 && v.inRound.includes(this.myIdx)) {
      const [x, z] =
        v.sat[this.myIdx]! >= 0
          ? chairPos(v, v.sat[this.myIdx]!)
          : v.go[this.myIdx]
            ? dashPos(v, this.myIdx, now)
            : walkPos(v, v.ang[this.myIdx]!);
      const r = Math.hypot(x, z) || 1;
      // Au-dessus de mon épaule, de l'extérieur du cercle, les chaises devant
      return shot(o.x + (x / r) * (r + 4.5), 4.2, o.z + (z / r) * (r + 4.5), o.x + x * 0.3, 0.6, o.z + z * 0.3, 52, { ease: 1.2 });
    }
    const a = now / 9000;
    return shot(o.x + Math.cos(a) * 13, 8.5, o.z + Math.sin(a) * 13, o.x, 0.5, o.z, 50, { ease: 0.6 });
  }

  reveal(k: number): Shot {
    const o = this.root.position;
    return path(
      [
        shot(o.x, 18, o.z + 22, o.x, 0, o.z, 46),
        shot(o.x + 9, 3.5, o.z - 8, o.x, 1, o.z, 50),
        shot(o.x - 2, 2.2, o.z - 9.5, o.x, 3, o.z - 11, 50),
        shot(o.x, 9, o.z + 14, o.x, 0.5, o.z, 50),
      ],
      k,
    );
  }

  lineup(ids: string[]): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    const o = this.root.position;
    const R = 6.5;
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2;
      out.set(id, {
        x: o.x + Math.cos(a) * R,
        z: o.z + Math.sin(a) * R,
        face: Math.atan2(-Math.cos(a), -Math.sin(a)),
        act: "idle",
        stiff: 3,
      });
    });
    return out;
  }

  dispose() {
    this.chairs?.geometry.dispose();
    this.root.removeFromParent();
  }
}
