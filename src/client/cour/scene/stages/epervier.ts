// L'Épervier à l'écran : la grande cour de récré, ses deux camps peints aux bouts et la bande rouge des éperviers au
// milieu. Les éperviers de la cour sont des mascottes en costume d'oiseau (ventre crème, bec orange, ailes qui battent) ;
// les candidats attrapés les rejoignent, une crête de plumes sur la tête, les bras en ailes. Au coup de sifflet, toute
// la foule traverse.
//
// Ma course est prédite sur mon écran (la même vitesse que le serveur), à la manette ou au clavier.

import * as THREE from "three";
import { DASH_COOLDOWN, FIELD, isMascot, type EpervierView } from "../../../../shared/games/cour/ep/epervier.ts";
import type { EpView, MatchView } from "../../../../shared/games/cour/match.ts";
import { BONES } from "../candidate.ts";
import type { ActorTarget } from "../crowd.ts";
import { Batch } from "../world.ts";
import { path, shot, type Shot, type Stage, type StageCtx } from "../stage.ts";

class Mascot {
  readonly group = new THREE.Group();
  private wings: THREE.Mesh[] = [];
  private body: THREE.Mesh;
  heading = 0;

  constructor(keep: <T extends { dispose: () => void }>(x: T) => T, paint: THREE.Material) {
    const b = new Batch();
    b.put(new THREE.SphereGeometry(0.62, 18, 14), "#8a5a2e", 0, 1.05, 0, 0, 1, 1.15, 1);
    b.put(new THREE.SphereGeometry(0.45, 16, 12), "#f4e7c8", 0, 1.0, 0.25, 0, 1, 1.15, 0.8);
    b.put(new THREE.SphereGeometry(0.42, 16, 12), "#9c6a38", 0, 1.95, 0.05);
    for (const s of [-1, 1]) {
      b.put(new THREE.SphereGeometry(0.13, 12, 10), "#ffffff", s * 0.16, 2.05, 0.33);
      b.put(new THREE.SphereGeometry(0.06, 10, 8), "#16120c", s * 0.16, 2.06, 0.44);
      b.put(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), "#f2a23a", s * 0.18, 0.25, 0);
      b.put(new THREE.BoxGeometry(0.22, 0.05, 0.3), "#f2a23a", s * 0.18, 0.03, 0.08);
    }
    const beak = new THREE.ConeGeometry(0.12, 0.32, 10);
    beak.rotateX(Math.PI / 2);
    b.put(beak, "#f2a23a", 0, 1.88, 0.5);
    for (let k = 0; k < 3; k++)
      b.put(new THREE.ConeGeometry(0.06, 0.35, 6), "#d9344d", (k - 1) * 0.1, 2.42, -0.05, 0, 1, 1, 1, -0.3, (k - 1) * 0.3);
    this.body = b.build(paint, keep)!;
    this.body.castShadow = true;
    this.group.add(this.body);
    const wingGeo = keep(new THREE.SphereGeometry(0.5, 12, 8));
    wingGeo.scale(1.1, 0.25, 0.6);
    wingGeo.translate(0.5, 0, 0);
    const wingMat = keep(new THREE.MeshStandardMaterial({ color: "#7a4b26", roughness: 0.9 }));
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.position.set(s * 0.5, 1.25, -0.05);
      w.scale.x = s;
      w.castShadow = true;
      this.wings.push(w);
      this.group.add(w);
    }
  }

  update(now: number, speed: number) {
    const f = Math.sin(now / (speed > 1 ? 90 : 260)) * (speed > 1 ? 0.6 : 0.25);
    this.wings[0]!.rotation.z = -0.3 - f;
    this.wings[1]!.rotation.z = 0.3 + f;
    this.body.position.y = Math.abs(Math.sin(now / 140)) * (speed > 1 ? 0.12 : 0.03);
  }
}

export class EpervierStage implements Stage {
  private root = new THREE.Group();
  private mascots = new Map<string, Mascot>();
  private crests = new Map<string, THREE.Mesh>();
  private crestGeo: THREE.BufferGeometry;
  private crestMat: THREE.Material;
  private my = { x: 0, z: 0, vx: 0, vz: 0, set: false };
  private input = { x: 0, z: 0 };
  private keys = new Set<string>();
  private lastSent = 0;
  private sentX = 0;
  private sentZ = 0;
  private dir: 1 | -1 = 1;
  private myIdx = -1;
  private v = new THREE.Vector3();

  constructor(private ctx: StageCtx) {
    const keep = ctx.world.keep;
    const b = new Batch();
    const W = FIELD.w * 2;
    const D = FIELD.d * 2;
    b.put(new THREE.BoxGeometry(W + 1, 0.04, D + 1), "#c8b48e", 0, 0.02, 0);
    // Les deux camps, la bande des éperviers
    for (const s of [-1, 1])
      b.put(
        new THREE.BoxGeometry(FIELD.w - FIELD.safe, 0.01, D),
        s < 0 ? "#5aa0e0" : "#5cbf6a",
        s * (FIELD.safe + (FIELD.w - FIELD.safe) / 2),
        0.045,
        0,
      );
    b.put(new THREE.BoxGeometry(FIELD.hawk * 2, 0.01, D), "#e88a7a", 0, 0.045, 0);
    for (const x of [-FIELD.safe, -FIELD.hawk, FIELD.hawk, FIELD.safe]) b.put(new THREE.BoxGeometry(0.12, 0.012, D), "#ffffff", x, 0.05, 0);
    // Le muret autour, des bancs, un arbre au coin
    for (const s of [-1, 1]) {
      b.put(new THREE.BoxGeometry(W + 1.6, 0.7, 0.4), "#d4cab3", 0, 0.35, s * (FIELD.d + 0.7));
      b.put(new THREE.BoxGeometry(0.4, 0.7, D + 1.8), "#d4cab3", s * (FIELD.w + 0.7), 0.35, 0);
      for (let k = 0; k < 4; k++) b.put(new THREE.BoxGeometry(2.2, 0.08, 0.5), "#8a5a2e", -9 + k * 6, 0.5, s * (FIELD.d + 1.6));
    }
    const set = b.build(ctx.world.paint, keep);
    if (set) {
      set.receiveShadow = true;
      set.castShadow = true;
      this.root.add(set);
    }
    this.crestGeo = keep(new THREE.ConeGeometry(0.07, 0.42, 6));
    this.crestMat = keep(new THREE.MeshStandardMaterial({ color: "#e0602c", roughness: 0.7 }));
    this.root.position.set(0, 0, 10);
    ctx.world.stage.add(this.root);
  }

  /** La manette : x vers la droite de l'écran, y vers le haut */
  move(jx: number, jy: number) {
    this.input.x = jx;
    this.input.z = jy;
  }

  dash() {
    this.ctx.send({ k: "dash" });
  }

  private keyVector() {
    const k = this.keys;
    const x = (k.has("ArrowRight") || k.has("KeyD") ? 1 : 0) - (k.has("ArrowLeft") || k.has("KeyA") || k.has("KeyQ") ? 1 : 0);
    const y = (k.has("ArrowUp") || k.has("KeyW") || k.has("KeyZ") ? 1 : 0) - (k.has("ArrowDown") || k.has("KeyS") ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l, any: x !== 0 || y !== 0 };
  }

  key(code: string, down: boolean) {
    if (code === "Space" && down) return this.dash();
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    const kv = this.keyVector();
    this.move(kv.x, kv.y);
  }

  frame(ev: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget> {
    const v = ev as EpervierView;
    const out = new Map<string, ActorTarget>();
    const o = this.root.position;
    this.dir = v.dir;
    this.myIdx = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    // Ma manette : la caméra regarde dans le sens de la traversée, la droite de l'écran est le côté +z (ou −z au retour)
    const wx = this.input.z * this.dir;
    const wz = this.input.x * this.dir;
    const mine = this.ctx.me ? v.run.find((r) => r.id === this.ctx.me) : undefined;
    if (mine && !mine.caught && v.stage === "course") {
      if (!this.my.set) {
        Object.assign(this.my, { x: mine.x, z: mine.z, vx: mine.vx, vz: mine.vz, set: true });
      }
      const max = mine.role === "c" ? 5.1 : 4.85;
      const dashing = now - mine.dashAt < 240;
      const tvx = dashing ? mine.vx : wx * max;
      const tvz = dashing ? mine.vz : wz * max;
      const k = Math.min(1, 14 * dt);
      this.my.vx += (tvx - this.my.vx) * k;
      this.my.vz += (tvz - this.my.vz) * k;
      this.my.x += this.my.vx * dt;
      this.my.z += this.my.vz * dt;
      // Rejoindre le serveur sans à-coup
      this.my.x += (mine.x + mine.vx * 0.06 - this.my.x) * Math.min(1, dt * 3);
      this.my.z += (mine.z + mine.vz * 0.06 - this.my.z) * Math.min(1, dt * 3);
      if (now - this.lastSent > 60 && (Math.abs(wx - this.sentX) > 0.05 || Math.abs(wz - this.sentZ) > 0.05 || now - this.lastSent > 600)) {
        this.lastSent = now;
        this.sentX = wx;
        this.sentZ = wz;
        this.ctx.send({ k: "move", x: Math.round(wx * 100) / 100, z: Math.round(wz * 100) / 100 });
      }
    } else if (mine) Object.assign(this.my, { x: mine.x, z: mine.z, set: v.stage === "course" });
    // Les éliminés d'avant (qui ne jouent pas les éperviers) sur les bancs
    const playingIds = new Set(v.run.map((r) => r.id));
    m.cands
      .filter((c) => !c.alive && !playingIds.has(c.id))
      .slice(0, 30)
      .forEach((c, k) => {
        const s = k % 2 ? 1 : -1;
        out.set(c.id, {
          x: o.x - 10 + Math.floor(k / 2) * 1.4,
          y: 0.1,
          z: o.z + s * (FIELD.d + 1.6),
          face: s > 0 ? Math.PI : 0,
          act: "cheer",
          snap: true,
        });
      });
    for (const r of v.run) {
      const isMe = r.id === this.ctx.me && v.stage === "course" && !r.caught;
      const x = isMe ? this.my.x : r.x;
      const z = isMe ? this.my.z : r.z;
      const sp = Math.hypot(r.vx, r.vz);
      const face = sp > 0.3 ? Math.atan2(r.vx, r.vz) : this.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      if (isMascot(r.id)) {
        let ms = this.mascots.get(r.id);
        if (!ms) {
          ms = new Mascot(this.ctx.world.keep, this.ctx.world.paint);
          this.mascots.set(r.id, ms);
          this.root.add(ms.group);
        }
        ms.group.position.lerp(this.v.set(x, 0, z), Math.min(1, dt * 12));
        let d = face - ms.heading;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        ms.heading += d * Math.min(1, dt * 8);
        ms.group.rotation.y = ms.heading;
        ms.update(now, sp);
        continue;
      }
      const caughtAge = r.caught ? (now - r.caught) / 1000 : 0;
      const act: ActorTarget["act"] = r.caught
        ? caughtAge < 1.2
          ? "fallBack"
          : "sad"
        : r.role === "h"
          ? "hawk"
          : sp > 3
            ? now - r.dashAt < 300
              ? "dash"
              : "run"
            : sp > 0.4
              ? "walk"
              : "idle";
      out.set(r.id, { x: o.x + x, z: o.z + z, face, act, speed: sp, stiff: isMe ? 30 : 14 });
      // Une crête de plumes pour les candidats devenus éperviers
      const a = this.ctx.actors.get(r.id);
      let crest = this.crests.get(r.id);
      if (r.role === "h" && a) {
        if (!crest) {
          crest = new THREE.Mesh(this.crestGeo, this.crestMat);
          this.ctx.world.stage.add(crest);
          this.crests.set(r.id, crest);
        }
        const head = a.model.bones[BONES.head]!;
        head.updateWorldMatrix(true, false);
        crest.position.setFromMatrixPosition(head.matrixWorld).add(this.v.set(0, 0.38, 0));
        crest.visible = a.visible;
      } else if (crest) crest.visible = false;
    }
    for (const [id, ms] of this.mascots) if (!v.run.some((r) => r.id === id)) ms.group.visible = false;
    return out;
  }

  hud(ev: EpView, now: number) {
    const v = ev as EpervierView;
    const r = this.ctx.me ? v.run.find((x) => x.id === this.ctx.me) : undefined;
    return {
      stage: v.stage,
      crossing: v.crossing,
      dir: v.dir,
      left: Math.max(0, Math.ceil((v.until - now) / 1000)),
      role: r ? r.role : null,
      caught: r ? r.caught > 0 : false,
      dashIn: r ? Math.max(0, (r.dashReady - now) / 1000) : 0,
      dashMax: DASH_COOLDOWN,
      hawks: v.run.filter((x) => x.role === "h").length,
      runners: v.run.filter((x) => x.role === "c" && !x.caught).length,
      st: this.myIdx >= 0 ? v.st[this.myIdx] : null,
    };
  }

  onFx(k: string, f: { id?: string }) {
    if (k === "sifflet") this.ctx.sound("whistle");
    else if (k === "pris") this.ctx.sound("feathers", { gain: f.id === this.ctx.me ? 1 : 0.4 });
    else if (k === "bond" && f.id === this.ctx.me) this.ctx.sound("whoosh");
    else if (k === "repos") this.ctx.sound("ding", { gain: 0.3 });
  }

  camera(ev: EpView | null, m: MatchView, now: number): Shot {
    const v = ev as EpervierView | null;
    void m;
    void now;
    const o = this.root.position;
    const mine = v && this.ctx.me ? v.run.find((r) => r.id === this.ctx.me) : undefined;
    const d = v?.dir ?? 1;
    if (mine && !mine.caught) {
      const x = this.my.set ? this.my.x : mine.x;
      const z = this.my.set ? this.my.z : mine.z;
      return shot(o.x + x - d * 8.5, 9.5, o.z + z * 0.85, o.x + x + d * 4, 0, o.z + z * 0.9, 50, { ease: 1.6 });
    }
    return shot(o.x - d * 22, 16, o.z, o.x + d * 2, 0, o.z, 50, { ease: 0.6 });
  }

  reveal(k: number): Shot {
    const o = this.root.position;
    return path(
      [
        shot(o.x, 30, o.z - 26, o.x, 0, o.z, 44),
        shot(o.x + 4, 2.6, o.z - 4, o.x, 1.6, o.z + 2, 46),
        shot(o.x - 22, 16, o.z, o.x + 2, 0, o.z, 50),
      ],
      k,
    );
  }

  lineup(ids: string[]): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    const o = this.root.position;
    const n = ids.length;
    ids.forEach((id, k) => {
      const z = -FIELD.d + 0.8 + ((2 * FIELD.d - 1.6) * (k + 0.5)) / n;
      out.set(id, { x: o.x - FIELD.w + 1.2 + (k % 3) * 0.7, z: o.z + z, face: Math.PI / 2, act: "idle", stiff: 3 });
    });
    return out;
  }

  dispose() {
    for (const c of this.crests.values()) c.removeFromParent();
    this.root.removeFromParent();
  }
}
