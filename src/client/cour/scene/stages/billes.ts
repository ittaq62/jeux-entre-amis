// Les Billes à l'écran : des carrés de sable cerclés de bois, un par duel, rangés au fond du jardin ; un petit pot creusé
// vers le fond de chacun. Les deux adversaires s'accroupissent tour à tour sur la ligne et pichenettent leurs billes de
// verre (chacun sa couleur) ; on voit la bille rouler, en choquer une autre, tomber dans le pot. Pour lancer : on tire
// vers soi depuis sa bille (une flèche montre la direction et la force), on lâche. Le perdant reçoit le seau de gelée.

import * as THREE from "three";
import { MARBLE_R, PIT, POT, powerSpeed, simulate, startX, type BillesView, type Duel } from "../../../../shared/games/cour/ep/billes.ts";
import type { EpView, MatchView } from "../../../../shared/games/cour/match.ts";
import type { ActorTarget } from "../crowd.ts";
import { Batch } from "../world.ts";
import { path, shot, type PointerInfo, type Shot, type Stage, type StageCtx } from "../stage.ts";

const COLS = 4;
const GAP_X = 3.4;
const GAP_Z = 5.2;
const MARBLE_SCALE = 1;
const COLORS: [string, string] = ["#e0303e", "#2f6fd1"];

/** Où est un duel (le coin de son carré), et la ligne de lancer */
function pitAt(k: number): { x: number; z: number } {
  const col = k % COLS;
  const row = Math.floor(k / COLS);
  return { x: (col - (COLS - 1) / 2) * GAP_X, z: row * GAP_Z };
}

interface Anim {
  frames: Float64Array[];
  at: number;
  count: number;
  owners: (0 | 1)[];
  hits: [number, number][];
  played: number;
  potAt: number;
}

export class BillesStage implements Stage {
  private root = new THREE.Group();
  private marbles: THREE.InstancedMesh;
  private anims = new Map<number, Anim>();
  private lastShot = new Map<number, number>();
  private aim: THREE.Group;
  private aimBar: THREE.Mesh;
  private drag: { x: number; y: number } | null = null;
  private aimState = { angle: 0, power: 0 };
  private myIdx = -1;
  private myDuel = -1;
  private built = 0;
  private buckets = new Map<number, { mesh: THREE.Group; at: number }>();
  private bucketProto: THREE.Group;
  private m4 = new THREE.Matrix4();
  private col = new THREE.Color();

  constructor(private ctx: StageCtx) {
    const keep = ctx.world.keep;
    this.marbles = new THREE.InstancedMesh(
      keep(new THREE.SphereGeometry(MARBLE_R * MARBLE_SCALE, 14, 10)),
      keep(new THREE.MeshPhysicalMaterial({ roughness: 0.05, metalness: 0, transmission: 0.35, thickness: 0.02, clearcoat: 1, ior: 1.5 })),
      20 * 7,
    );
    this.marbles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(20 * 7 * 3), 3);
    this.marbles.count = 0;
    this.marbles.castShadow = true;
    this.root.add(this.marbles);
    // La flèche de visée
    this.aim = new THREE.Group();
    this.aimBar = new THREE.Mesh(
      keep(new THREE.BoxGeometry(0.03, 0.004, 1)),
      keep(new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.85 })),
    );
    this.aimBar.geometry.translate(0, 0, 0.5);
    this.aim.add(this.aimBar);
    const tip = new THREE.Mesh(keep(new THREE.ConeGeometry(0.06, 0.14, 12)), keep(new THREE.MeshBasicMaterial({ color: "#ffd84a" })));
    tip.rotation.x = Math.PI / 2;
    tip.name = "tip";
    this.aim.add(tip);
    this.aim.visible = false;
    this.root.add(this.aim);
    // Le seau de gelée
    this.bucketProto = new THREE.Group();
    const pail = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.32, 0.24, 0.42, 18, 1, true)),
      keep(new THREE.MeshStandardMaterial({ color: "#c7ccd2", metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide })),
    );
    const jelly = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 18)),
      keep(new THREE.MeshStandardMaterial({ color: "#7ddf64", roughness: 0.2, emissive: new THREE.Color("#173a10") })),
    );
    jelly.position.y = 0.12;
    this.bucketProto.add(pail, jelly);
    this.root.position.set(0, 0, 4);
    ctx.world.stage.add(this.root);
  }

  private buildPits(n: number) {
    if (n === this.built) return;
    this.built = n;
    const keep = this.ctx.world.keep;
    const b = new Batch();
    for (let k = 0; k < n; k++) {
      const { x, z } = pitAt(k);
      b.put(new THREE.BoxGeometry(PIT.w * 2, 0.06, PIT.y1 - PIT.y0), "#e6cf98", x, 0.03, z + (PIT.y0 + PIT.y1) / 2);
      // Le cadre de bois
      for (const s of [-1, 1])
        b.put(new THREE.BoxGeometry(0.1, 0.14, PIT.y1 - PIT.y0 + 0.1), "#9a6a3c", x + s * (PIT.w + 0.05), 0.07, z + (PIT.y0 + PIT.y1) / 2);
      b.put(new THREE.BoxGeometry(PIT.w * 2 + 0.2, 0.14, 0.1), "#9a6a3c", x, 0.07, z + PIT.y1 + 0.05);
      // La ligne de lancer à la craie, le pot
      b.put(new THREE.BoxGeometry(PIT.w * 2, 0.005, 0.03), "#ffffff", x, 0.063, z);
      b.put(new THREE.CylinderGeometry(POT.r, POT.r * 0.8, 0.02, 20), "#5a3a1a", x + POT.x, 0.06, z + POT.y);
    }
    const set = b.build(this.ctx.world.paint, keep);
    if (set) {
      set.receiveShadow = true;
      this.root.add(set);
    }
  }

  frame(ev: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget> {
    const v = ev as BillesView;
    const out = new Map<string, ActorTarget>();
    this.buildPits(v.duels.length);
    this.myIdx = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    this.myDuel = this.myIdx >= 0 ? v.duelOf[this.myIdx]! : -1;
    const o = this.root.position;
    let n = 0;
    v.duels.forEach((d, k) => {
      const pit = pitAt(k);
      // Un nouveau lancer : on le rejoue avec la même physique
      if (d.last && this.lastShot.get(k) !== d.last.at) {
        this.lastShot.set(k, d.last.at);
        const frames: Float64Array[] = [];
        const roll = simulate(d.last.before, d.last.shot, (pos) => frames.push(pos.slice()));
        this.anims.set(k, {
          frames,
          at: d.last.at,
          count: d.last.before.length + 1,
          owners: [...d.last.before.map((mm) => mm.o), d.last.shot.o],
          hits: roll.hits,
          played: 0,
          potAt: roll.potAt,
        });
        if (k === this.myDuel || this.myDuel < 0) this.ctx.sound("flick", { gain: k === this.myDuel ? 1 : 0.3 });
      }
      const anim = this.anims.get(k);
      const elapsed = anim ? (now - anim.at) / 1000 : 99;
      const animating = anim && anim.frames.length && elapsed < anim.frames.length / 60;
      if (anim && animating) {
        const f = anim.frames[Math.min(anim.frames.length - 1, Math.floor(elapsed * 60))]!;
        for (let j = 0; j < anim.count; j++) {
          this.place(n++, o.x + pit.x + f[j * 2]!, o.z + pit.z + f[j * 2 + 1]!, anim.owners[j]!, false);
        }
        // Les chocs, au bon moment, pour le son (dans mon duel)
        while (anim.played < anim.hits.length && anim.hits[anim.played]![0] <= elapsed) {
          if (k === this.myDuel) this.ctx.sound("clack", { gain: Math.min(1, anim.hits[anim.played]![1] / 2) });
          anim.played++;
        }
        if (anim.potAt >= 0 && elapsed >= anim.potAt && anim.potAt > -0.5) {
          anim.potAt = -1;
          if (k === this.myDuel || this.myDuel < 0) this.ctx.sound("pot");
        }
      } else {
        for (const mm of d.marbles) this.place(n++, o.x + pit.x + mm.x, o.z + pit.z + mm.y, mm.o, mm.pot > 0);
      }
      // Les deux joueurs : celui qui lance accroupi sur la ligne, l'autre debout à côté
      for (const side of [0, 1] as const) {
        const i = side === 0 ? d.a : d.b;
        const id = v.ids[i]!;
        const throwing = d.winner < 0 && (d.turn === 0 ? d.a : d.b) === i && now >= d.ready - 400;
        const justThrew = anim && anim.owners[anim.count - 1] === side && elapsed < 0.5;
        const st = v.st[i]!;
        const x = o.x + pit.x + (throwing || justThrew ? startX(side) * 1.4 : (side === 0 ? -1 : 1) * (PIT.w + 0.6));
        const z = o.z + pit.z + (throwing || justThrew ? -0.55 : 0.4);
        out.set(id, {
          x,
          z,
          face: throwing || justThrew ? 0 : side === 0 ? Math.PI / 2 : -Math.PI / 2,
          act: st === 2 ? "sad" : d.winner >= 0 ? "celebrate" : justThrew ? "flick" : throwing ? "crouch" : "idle",
          stiff: 6,
        });
        if (st === 2 && !this.buckets.has(i)) {
          const g = this.bucketProto.clone();
          this.ctx.world.stage.add(g);
          this.buckets.set(i, { mesh: g, at: now });
        }
        const bk = this.buckets.get(i);
        if (bk) {
          const age = (now - bk.at) / 1000;
          bk.mesh.position.set(x, 2.6 + Math.max(0, 0.4 - age) * 3, z);
          bk.mesh.rotation.z = Math.min(Math.PI * 0.9, Math.max(0, age - 0.3) * 6);
          if (age > 0.45 && !bk.mesh.userData.done) {
            bk.mesh.userData.done = true;
            this.ctx.burst("gelee", x, 2.1, z, { count: 45, power: 0.7 });
            this.ctx.sound("slime", { gain: i === this.myIdx ? 1 : 0.5 });
          }
          bk.mesh.visible = age < 2.2;
        }
      }
    });
    // Les exemptés : au bord, ils regardent
    v.ids.forEach((id, i) => {
      if (v.duelOf[i]! >= 0) return;
      out.set(id, { x: o.x + (COLS / 2) * GAP_X + 1.5, z: o.z + 1 + (i % 4) * 0.8, face: -Math.PI / 2, act: "cheer", stiff: 4 });
    });
    this.marbles.count = n;
    this.marbles.instanceMatrix.needsUpdate = true;
    if (this.marbles.instanceColor) this.marbles.instanceColor.needsUpdate = true;
    // Ma visée
    const d = this.myDuel >= 0 ? v.duels[this.myDuel] : undefined;
    const myTurn = this.isMyTurn(v, now);
    this.aim.visible = Boolean(myTurn && this.drag && d);
    if (this.aim.visible && d) {
      const pit = pitAt(this.myDuel);
      const side = d.a === this.myIdx ? 0 : 1;
      this.aim.position.set(pit.x + startX(side), 0.07, pit.z);
      this.aim.rotation.y = this.aimState.angle;
      const len = 0.3 + powerSpeed(this.aimState.power) * 0.55;
      this.aimBar.scale.z = len;
      this.aim.getObjectByName("tip")!.position.z = len;
    }
    void dt;
    void m;
    return out;
  }

  private place(k: number, x: number, z: number, o: 0 | 1, pot: boolean) {
    this.m4.makeTranslation(x - this.root.position.x, pot ? 0.04 : 0.06 + MARBLE_R, z - this.root.position.z);
    this.marbles.setMatrixAt(k, this.m4);
    this.marbles.setColorAt(k, this.col.set(COLORS[o]));
  }

  private isMyTurn(v: BillesView, now: number) {
    const d: Duel | undefined = this.myDuel >= 0 ? v.duels[this.myDuel] : undefined;
    return Boolean(d && d.winner < 0 && v.stage === "jeu" && (d.turn === 0 ? d.a : d.b) === this.myIdx && now >= d.ready);
  }

  pointer(p: PointerInfo, ev: EpView | null) {
    const v = ev as BillesView | null;
    if (!v || !this.isMyTurn(v, this.ctx.serverNow())) {
      this.drag = null;
      return;
    }
    const scale = Math.min(window.innerWidth, window.innerHeight) * 0.45;
    if (p.kind === "down") this.drag = { x: p.x, y: p.y };
    if (!this.drag) return;
    // On tire vers soi : la bille part dans l'autre sens, d'autant plus fort qu'on a tiré loin
    const dx = p.x - this.drag.x;
    const dy = p.y - this.drag.y;
    // Vue de derrière la ligne, la droite de l'écran est le côté −x : tirer vers la droite envoie la bille à gauche
    this.aimState.angle = Math.max(-0.6, Math.min(0.6, Math.atan2(dx, Math.max(8, dy)) * 0.6));
    this.aimState.power = Math.max(0, Math.min(1, Math.hypot(dx, dy) / scale));
    if (p.kind === "up") {
      const d = this.drag;
      this.drag = null;
      if (Math.hypot(p.x - d.x, p.y - d.y) < 12 || dy < 4) return;
      this.ctx.send({ k: "throw", angle: this.aimState.angle, power: this.aimState.power });
    }
  }

  hud(ev: EpView, now: number) {
    const v = ev as BillesView;
    const d = this.myDuel >= 0 ? v.duels[this.myDuel] : undefined;
    const me = d ? (d.a === this.myIdx ? 0 : 1) : 0;
    return {
      stage: v.stage,
      until: v.until,
      exempt: this.myIdx >= 0 && v.duelOf[this.myIdx] === -1,
      myTurn: this.isMyTurn(v, now),
      wins: d ? [d.wins[me], d.wins[me === 0 ? 1 : 0]] : null,
      manche: d?.manche ?? null,
      thrown: d?.thrown ?? 0,
      opp: d ? v.ids[me === 0 ? d.b : d.a] : null,
      left: d && d.winner < 0 ? Math.max(0, Math.ceil((d.deadline - now) / 1000)) : null,
      power: this.drag ? this.aimState.power : null,
      done: v.duels.filter((x) => x.winner >= 0).length,
      duels: v.duels.length,
      st: this.myIdx >= 0 ? v.st[this.myIdx] : null,
    };
  }

  onFx(k: string, f: { id?: string; a?: number }) {
    if (k === "manche") this.ctx.sound("ding", { gain: 0.3 });
    else if (k === "billes") this.ctx.sound("whistle", { gain: 0.6 });
    void f;
  }

  camera(ev: EpView | null, m: MatchView, now: number): Shot {
    const v = ev as BillesView | null;
    void m;
    void now;
    const o = this.root.position;
    if (v && this.myDuel >= 0) {
      const pit = pitAt(this.myDuel);
      return shot(o.x + pit.x, 1.9, o.z + pit.z - 2.1, o.x + pit.x, 0, o.z + pit.z + 1.6, 50, { ease: 1.2 });
    }
    const rows = Math.ceil((v?.duels.length ?? 8) / COLS);
    return shot(o.x - 9, 9, o.z - 6, o.x, 0, o.z + (rows * GAP_Z) / 2, 50, { ease: 0.6 });
  }

  reveal(k: number): Shot {
    const o = this.root.position;
    return path(
      [
        shot(o.x + 12, 10, o.z + 26, o.x, 0, o.z + 8, 46),
        shot(o.x + 1, 0.8, o.z + 0.9, o.x, 0.05, o.z + 2.4, 44),
        shot(o.x - 9, 9, o.z - 6, o.x, 0, o.z + 8, 50),
      ],
      k,
    );
  }

  lineup(ids: string[]): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    const o = this.root.position;
    ids.forEach((id, i) =>
      out.set(id, { x: o.x + ((i % 8) - 3.5) * 1.3, z: o.z - 2.5 - Math.floor(i / 8) * 1.2, face: 0, act: "idle", stiff: 3 }),
    );
    return out;
  }

  dispose() {
    for (const b of this.buckets.values()) b.mesh.removeFromParent();
    this.root.removeFromParent();
  }
}
