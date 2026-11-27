// La Finale des Polochons à l'écran : le grand bassin de mousse, une poutre de bois vernie tendue au-dessus, et tout
// autour les gradins pleins des candidats éliminés qui crient. Les deux finalistes face à face sur la poutre, un
// polochon rayé chacun dans la main droite : il monte (coup haut) ou part en arrière (coup bas) quand on arme, part d'un
// coup, s'écrase sur l'autre ou se fait renvoyer.

import * as THREE from "three";
import { type PolochonsView } from "../../../../shared/games/cour/ep/polochons.ts";
import type { EpView, MatchView } from "../../../../shared/games/cour/match.ts";
import { BONES } from "../candidate.ts";
import type { Act, ActorTarget } from "../crowd.ts";
import { FoamPool } from "../pool.ts";
import { Batch } from "../world.ts";
import { path, shot, type Shot, type Stage, type StageCtx } from "../stage.ts";

const BEAM_Y = 2.2;
const GAP = 1.05;

export class PolochonsStage implements Stage {
  private root = new THREE.Group();
  private pool: FoamPool;
  private pillows: THREE.Mesh[] = [];
  private fallAt = new Map<string, number>();
  private myIdx = -1;
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();

  constructor(private ctx: StageCtx) {
    const keep = ctx.world.keep;
    this.pool = new FoamPool(ctx.world, 9, 6, 0.6);
    this.root.add(this.pool.root);
    const b = new Batch();
    // La poutre et ses deux tréteaux
    b.put(new THREE.BoxGeometry(8.6, 0.24, 0.34), "#b77b42", 0, BEAM_Y, 0);
    b.put(new THREE.BoxGeometry(8.6, 0.03, 0.36), "#d9a066", 0, BEAM_Y + 0.13, 0);
    for (const s of [-1, 1]) {
      for (const z of [-0.5, 0.5]) b.put(new THREE.BoxGeometry(0.16, BEAM_Y, 0.16), "#8a5a2e", s * 4.1, BEAM_Y / 2, z, 0, 1, 1, 1, z * 0.3);
      b.put(new THREE.BoxGeometry(0.2, 0.2, 1.3), "#8a5a2e", s * 4.1, BEAM_Y - 0.2, 0);
    }
    // Les gradins des éliminés, en arc autour du bassin
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * (0.12 + (k / 8) * 0.76);
        const rad = 8 + r * 1.3;
        b.put(
          new THREE.BoxGeometry(2.6, 0.45 * (r + 1), 1.2),
          r % 2 ? "#e9e1cf" : "#d9344d",
          Math.cos(a) * rad,
          0.225 * (r + 1),
          Math.sin(a) * rad,
          Math.PI / 2 - a,
        );
      }
    }
    const set = b.build(ctx.world.paint, keep);
    if (set) {
      set.castShadow = true;
      set.receiveShadow = true;
      this.root.add(set);
    }
    // Les polochons rayés
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    for (let k = 0; k < 8; k++) {
      g.fillStyle = k % 2 ? "#ffffff" : "#5aa0e0";
      g.fillRect(0, k * 8, 64, 8);
    }
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = keep(new THREE.CapsuleGeometry(0.16, 0.62, 6, 14));
    geo.scale(1.25, 1, 0.8);
    for (let k = 0; k < 2; k++) {
      const p = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, color: k ? "#ffd6dc" : "#ffffff" })));
      p.castShadow = true;
      this.pillows.push(p);
      this.root.add(p);
    }
    ctx.world.stage.add(this.root);
  }

  frame(ev: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget> {
    const v = ev as PolochonsView;
    const out = new Map<string, ActorTarget>();
    this.pool.update(now);
    this.myIdx = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    // Les gradins : tous les éliminés, qui crient
    const fans = m.cands.filter((c) => !v.ids.includes(c.id));
    fans.slice(0, 36).forEach((c, k) => {
      const r = Math.floor(k / 9);
      const a = Math.PI * (0.12 + ((k % 9) / 8) * 0.76);
      const rad = 8 + r * 1.3;
      out.set(c.id, {
        x: Math.cos(a) * rad,
        y: 0.45 * (r + 1),
        z: Math.sin(a) * rad,
        face: Math.atan2(-Math.cos(a), -Math.sin(a)),
        act: "cheer",
        snap: true,
      });
    });
    v.ids.forEach((id, i) => {
      const f = v.f[i]!;
      const side = i === 0 ? -1 : 1;
      let act: Act = "pilGuardH";
      if (f.act === "wind") act = f.side === "h" ? "pilHigh" : "pilLow";
      else if (f.act === "recover") act = "pilHit";
      else if (f.act === "parry") act = f.side === "h" ? "pilGuardH" : "pilGuardL";
      else if (f.act === "stun") act = "stun";
      else if (f.act === "fall") act = "plunge";
      else if (v.stage === "fin" && v.winner === i) act = "celebrate";
      // Il recule un peu sous les coups, chancelle quand il n'a plus d'équilibre
      const wobble = f.bal < 35 ? Math.sin(now / 90 + i) * (0.35 - f.bal / 100) * 0.4 : 0;
      let y = BEAM_Y + 0.12;
      let x = side * (GAP + (100 - f.bal) * 0.004);
      let z = wobble;
      if (f.act === "fall") {
        if (!this.fallAt.has(id)) {
          this.fallAt.set(id, now);
          this.pool.dent(x, 0.8, now + 500);
          setTimeout(() => this.ctx.burst("mousse", x, 0.8, 1, { count: 60, power: 1.3 }), 500);
        }
        const age = (now - this.fallAt.get(id)!) / 1000;
        y = Math.max(0.25, BEAM_Y + 0.12 + 1.5 * age - 9 * age * age);
        z = Math.min(1, age * 1.5);
        x = side * (GAP + age * 0.6);
        if (age > 0.7) act = "flail";
      }
      out.set(id, { x, y, z, face: side < 0 ? Math.PI / 2 : -Math.PI / 2, act, stiff: 14 });
      // Le polochon, dans sa main droite
      const a = this.ctx.actors.get(id);
      const p = this.pillows[i];
      if (a && p) {
        const fore = a.model.bones[BONES.foreR]!;
        fore.updateWorldMatrix(true, false);
        p.position.copy(this.v.set(0, -0.34, 0.04).applyMatrix4(fore.matrixWorld));
        fore.getWorldQuaternion(this.q);
        p.quaternion.copy(this.q);
        p.visible = a.visible;
      }
    });
    void dt;
    return out;
  }

  act(a: "hh" | "hb" | "ph" | "pb") {
    this.ctx.send({ k: "pol", a });
  }

  key(code: string, down: boolean) {
    if (!down) return;
    if (code === "ArrowUp" || code === "KeyW" || code === "KeyZ") this.act("hh");
    else if (code === "ArrowDown" || code === "KeyS") this.act("hb");
    else if (code === "ArrowLeft" || code === "KeyQ" || code === "KeyA") this.act("ph");
    else if (code === "ArrowRight" || code === "KeyD") this.act("pb");
  }

  hud(ev: EpView, now: number) {
    const v = ev as PolochonsView;
    const i = this.myIdx;
    const o = i === 0 ? 1 : 0;
    const them = v.f[i >= 0 ? o : 1]!;
    return {
      stage: v.stage,
      left: Math.max(0, Math.ceil((v.until - now) / 1000)),
      me: i >= 0 ? v.f[i] : null,
      them,
      a: v.f[0],
      b: v.f[1],
      ids: v.ids,
      playing: i >= 0 && v.stage === "duel" && v.st[i] === 0,
      // L'autre arme : il reste ce temps avant le coup
      incoming: them.act === "wind" ? { side: them.side, left: Math.max(0, v.wind - (now - them.at)) } : null,
      winner: v.winner >= 0 ? v.ids[v.winner] : null,
    };
  }

  onFx(k: string, f: { id?: string; a?: number }) {
    if (k === "arme") this.ctx.sound("swing", { gain: 0.6 });
    else if (k === "touche") this.ctx.sound("thump", { gain: f.id === this.ctx.me ? 1 : 0.7 });
    else if (k === "pare") this.ctx.sound("parry");
    else if (k === "chute") this.ctx.sound("splashFoam");
    else if (k === "gong") this.ctx.sound("gong");
    else if (k === "bascule") this.ctx.sound("creak");
  }

  camera(ev: EpView | null, m: MatchView, now: number): Shot {
    const v = ev as PolochonsView | null;
    void m;
    const sway = Math.sin(now / 3000) * 0.8;
    if (v && this.myIdx >= 0 && v.stage !== "fin") {
      const side = this.myIdx === 0 ? -1 : 1;
      return shot(side * 3.2 + sway * 0.3, BEAM_Y + 1.5, -4.2, -side * 0.3, BEAM_Y + 0.9, 0, 50, { ease: 1.2 });
    }
    return shot(sway, BEAM_Y + 1.8, -6.5, 0, BEAM_Y + 0.6, 0, 48, { ease: 0.9 });
  }

  reveal(k: number): Shot {
    return path(
      [
        shot(0, 14, -20, 0, 1, 0, 44),
        shot(-6, 3.4, -5, 0, BEAM_Y, 0, 46),
        shot(4, BEAM_Y + 0.4, -2, 0, BEAM_Y + 0.6, 0, 50),
        shot(0, BEAM_Y + 1.8, -6.5, 0, BEAM_Y + 0.6, 0, 48),
      ],
      k,
    );
  }

  lineup(ids: string[]): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    ids.forEach((id, i) =>
      out.set(id, {
        x: i === 0 ? -GAP - 2 : GAP + 2,
        y: BEAM_Y + 0.12,
        z: 0,
        face: i === 0 ? Math.PI / 2 : -Math.PI / 2,
        act: "idle",
        stiff: 3,
      }),
    );
    return out;
  }

  dispose() {
    this.pool.dispose();
    this.root.removeFromParent();
  }
}
