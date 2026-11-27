// Les Nénuphars à l'écran : un étang aux eaux vertes, des roseaux, un ponton de départ et la berge d'arrivée ; entre
// les deux, les rangées de nénuphars par paires. On attend son tour sur le ponton, dans l'ordre des numéros. Celui qui
// est devant saute de nénuphar en nénuphar ; un mauvais choix et le nénuphar plonge avec lui (il nage jusqu'à la rive).
// Parfois, une libellule se pose un instant sur le bon.

import * as THREE from "three";
import { DECIDE_S, type NenupharsView } from "../../../../shared/games/cour/ep/nenuphars.ts";
import type { EpView, MatchView } from "../../../../shared/games/cour/match.ts";
import type { ActorTarget } from "../crowd.ts";
import { Batch } from "../world.ts";
import { groundHit, path, shot, type PointerInfo, type Shot, type Stage, type StageCtx } from "../stage.ts";

const ROW = 2.3;
const SIDE_X = 1.25;
const START = 0;

const rowZ = (r: number) => START + 2.6 + r * ROW;

export class NenupharsStage implements Stage {
  private root = new THREE.Group();
  private pads: THREE.Mesh[][] = [];
  private water: THREE.Mesh;
  private waterMat: THREE.ShaderMaterial;
  private fly: THREE.Group;
  private rows = 0;
  private sunk = new Map<string, number>();
  private hops = new Map<string, { from: [number, number]; to: [number, number]; at: number }>();
  private lastPos = new Map<string, number>();
  private myIdx = -1;
  private padMat: THREE.MeshStandardMaterial;
  private goodMat: THREE.MeshStandardMaterial;
  private choiceMat: THREE.MeshStandardMaterial;

  constructor(private ctx: StageCtx) {
    const keep = ctx.world.keep;
    this.waterMat = keep(
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: `varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vPos,1.0); }`,
        fragmentShader: `uniform float time; varying vec2 vUv; varying vec3 vPos;
          void main(){
            float w = sin(vPos.x * 2.1 + time * 1.3) * 0.5 + sin(vPos.z * 1.7 - time) * 0.5 + sin((vPos.x - vPos.z) * 4.0 + time * 2.0) * 0.25;
            vec3 deep = vec3(0.03, 0.15, 0.16), light = vec3(0.1, 0.32, 0.3);
            vec3 c = mix(deep, light, 0.5 + w * 0.18);
            float edge = smoothstep(0.0, 0.08, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
            c = mix(vec3(0.42, 0.55, 0.32), c, edge);
            c += vec3(1.0, 0.9, 0.7) * pow(max(0.0, w), 6.0) * 0.12;
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.water = new THREE.Mesh(keep(new THREE.PlaneGeometry(9, 44)), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0.06, 22);
    this.root.add(this.water);
    const b = new Batch();
    // Le ponton de départ et la berge d'arrivée en bois clair, des roseaux sur les bords, des pierres
    b.put(new THREE.BoxGeometry(5.4, 0.25, 3), "#c99a62", 0, 0.3, START);
    for (let k = 0; k < 5; k++)
      b.put(new THREE.BoxGeometry(5.4, 0.02, 0.55), k % 2 ? "#b88a54" : "#d4a46c", 0, 0.43, START - 1.2 + k * 0.6);
    for (let k = 0; k < 40; k++) {
      const s = k % 2 ? 1 : -1;
      const z = 2 + (k / 40) * 40;
      for (let r = 0; r < 4; r++)
        b.put(
          new THREE.CylinderGeometry(0.03, 0.04, 1.2 + (r % 3) * 0.4, 5),
          "#6f8f3a",
          s * (4.6 + r * 0.12),
          0.6,
          z + r * 0.25,
          0,
          1,
          1,
          1,
          0,
          s * 0.1 * (r - 1.5),
        );
      b.put(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 6), "#7a4b26", s * 4.7, 1.35, z);
    }
    for (let k = 0; k < 24; k++) {
      const s = k % 2 ? 1 : -1;
      b.put(new THREE.DodecahedronGeometry(0.45, 0), "#9c9a90", s * (4.8 + (k % 3) * 0.3), 0.15, 3 + k * 1.75, k, 1, 0.5, 1);
    }
    const set = b.build(ctx.world.paint, keep);
    if (set) {
      set.receiveShadow = true;
      set.castShadow = true;
      this.root.add(set);
    }
    this.padMat = keep(new THREE.MeshStandardMaterial({ color: "#3f8f3a", roughness: 0.7 }));
    this.goodMat = keep(new THREE.MeshStandardMaterial({ color: "#5dbb4f", roughness: 0.55, emissive: new THREE.Color("#183a10") }));
    this.choiceMat = keep(new THREE.MeshStandardMaterial({ color: "#7fdc6a", roughness: 0.5, emissive: new THREE.Color("#2a5a1a") }));
    // La libellule
    this.fly = new THREE.Group();
    const body = new THREE.Mesh(
      keep(new THREE.CapsuleGeometry(0.035, 0.32, 4, 8)),
      keep(new THREE.MeshStandardMaterial({ color: "#2fa6d9", metalness: 0.6, roughness: 0.3 })),
    );
    body.rotation.x = Math.PI / 2;
    this.fly.add(body);
    for (const s of [-1, 1])
      for (const f of [-0.06, 0.06]) {
        const wing = new THREE.Mesh(
          keep(new THREE.PlaneGeometry(0.34, 0.08)),
          keep(new THREE.MeshStandardMaterial({ color: "#e8f8ff", transparent: true, opacity: 0.6, side: THREE.DoubleSide })),
        );
        wing.position.set(s * 0.18, 0.02, f);
        wing.rotation.x = -Math.PI / 2;
        wing.name = "wing";
        this.fly.add(wing);
      }
    this.fly.visible = false;
    this.root.add(this.fly);
    this.root.position.set(0, 0, -2);
    ctx.world.stage.add(this.root);
  }

  private buildPads(rows: number) {
    if (rows === this.rows) return;
    this.rows = rows;
    const keep = this.ctx.world.keep;
    const geo = keep(new THREE.CircleGeometry(0.85, 24, 0.25, Math.PI * 2 - 0.5));
    geo.rotateX(-Math.PI / 2);
    for (let r = 0; r < rows; r++) {
      const pair: THREE.Mesh[] = [];
      for (const s of [0, 1]) {
        const pad = new THREE.Mesh(geo, this.padMat);
        pad.position.set(s ? SIDE_X : -SIDE_X, 0.12, rowZ(r));
        pad.rotation.y = r * 1.7 + s;
        pad.receiveShadow = true;
        pad.userData = { row: r, side: s };
        this.root.add(pad);
        pair.push(pad);
      }
      this.pads.push(pair);
    }
    // La berge d'arrivée, après la dernière rangée
    const b = new Batch();
    b.put(new THREE.BoxGeometry(6, 0.3, 4), "#8fbf5a", 0, 0.15, rowZ(rows) + 1.2);
    const bank = b.build(this.ctx.world.paint, keep);
    if (bank) this.root.add(bank);
  }

  /** Où se tient un candidat : sur le ponton (dans la file), sur un nénuphar, ou sur la berge */
  private spot(v: NenupharsView, i: number): [number, number] {
    const pos = v.pos[i]!;
    if (pos < 0) {
      // La file sur le ponton, dans l'ordre des numéros
      const ahead = v.ids.filter((_, k) => v.st[k] === 0 && v.pos[k]! < 0 && v.order[k]! < v.order[i]!).length;
      const col = ahead % 4;
      const row = Math.floor(ahead / 4);
      return [(col - 1.5) * 1.1, START - 0.4 - row * 0.9 + (ahead === 0 ? 1 : 0)];
    }
    if (pos >= v.rows) return [0, rowZ(v.rows) + 1.2];
    const side = v.known[pos]!;
    return [side === 1 ? SIDE_X : side === 0 ? -SIDE_X : 0, rowZ(pos)];
  }

  frame(ev: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget> {
    const v = ev as NenupharsView;
    const out = new Map<string, ActorTarget>();
    this.buildPads(v.rows);
    this.myIdx = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    this.waterMat.uniforms.time!.value = now / 1000;
    const origin = this.root.position;
    // Les nénuphars : ceux qu'on sait bons brillent un peu ; le mauvais d'une rangée connue a coulé
    const facing = v.leader >= 0 ? v.pos[v.leader]! + 1 : -1;
    const myTurn = this.myIdx >= 0 && v.leader === this.myIdx && facing >= 0 && facing < v.rows && v.known[facing] === -1;
    this.pads.forEach((pair, r) => {
      pair.forEach((pad, s) => {
        const known = v.known[r]!;
        const sunk = known !== -1 && known !== s;
        const key = `${r}:${s}`;
        if (sunk && !this.sunk.has(key)) this.sunk.set(key, now);
        const age = sunk ? (now - this.sunk.get(key)!) / 1000 : 0;
        pad.position.y = sunk ? 0.12 - Math.min(1.2, age * 0.9) : 0.12 + Math.sin(now / 700 + r + s) * 0.015;
        pad.visible = !sunk || age < 1.6;
        pad.material = myTurn && r === facing ? this.choiceMat : known === s ? this.goodMat : this.padMat;
      });
    });
    // La libellule
    if (v.hint) {
      this.fly.visible = true;
      const tx = v.hint.side ? SIDE_X : -SIDE_X;
      const tz = rowZ(v.hint.row);
      this.fly.position.lerp(new THREE.Vector3(tx, 0.3, tz), Math.min(1, dt * 6));
      this.fly.children.forEach((c) => c.name === "wing" && (c.rotation.z = Math.sin(now / 18) * 0.4));
    } else if (this.fly.visible) {
      this.fly.position.y += dt * 1.5;
      this.fly.position.x += dt * 2;
      if (this.fly.position.y > 4) this.fly.visible = false;
    }
    // Les candidats
    v.ids.forEach((id, i) => {
      const st = v.st[i]!;
      let [x, z] = this.spot(v, i);
      const pos = v.pos[i]!;
      const prev = this.lastPos.get(id);
      if (prev !== undefined && prev !== pos) {
        const from = this.hops.get(id)?.to ?? [x, z];
        this.hops.set(id, { from, to: [x, z], at: now });
      }
      this.lastPos.set(id, pos);
      if (st === 2) {
        // À l'eau : il nage vers la rive de droite
        const fall = v.last && v.last.i === i ? v.last : null;
        const fx = fall ? (fall.side ? SIDE_X : -SIDE_X) : 4;
        const fz = fall ? rowZ(fall.row) : z;
        const age = fall ? (now - fall.at) / 1000 : 10;
        const sx = age < 0.6 ? fx : fx + Math.min(1, (age - 0.6) / 4) * (5.6 - fx);
        out.set(id, {
          x: origin.x + sx,
          y: age < 0.6 ? 0.1 : age < 4.6 ? -0.35 : 0,
          z: origin.z + fz,
          face: Math.PI / 2,
          act: age < 0.6 ? "plunge" : age < 4.6 ? "swim" : "sad",
          stiff: 8,
        });
        return;
      }
      let y = pos >= 0 && pos < v.rows ? 0.15 : 0.45;
      let act: ActorTarget["act"] = st === 1 ? "celebrate" : i === v.leader && v.decideBy > now && atFront(v, i) ? "think" : "idle";
      const hop = this.hops.get(id);
      if (hop && now - hop.at < 450) {
        const k = (now - hop.at) / 450;
        x = hop.from[0] + (hop.to[0] - hop.from[0]) * k;
        z = hop.from[1] + (hop.to[1] - hop.from[1]) * k;
        y += Math.sin(k * Math.PI) * 0.9;
        act = "hop";
      }
      out.set(id, { x: origin.x + x, y, z: origin.z + z, face: 0, act, stiff: 20, snap: Boolean(hop && now - hop.at < 450) });
    });
    void m;
    return out;
  }

  pointer(p: PointerInfo, ev: EpView | null) {
    const v = ev as NenupharsView | null;
    if (!v || p.kind !== "down" || this.myIdx < 0 || v.leader !== this.myIdx) return;
    const hit = groundHit(this.ctx.world, p.nx, p.ny, 0.12);
    if (!hit) return;
    const row = v.pos[this.myIdx]! + 1;
    const z = rowZ(row) + this.root.position.z;
    if (Math.abs(hit.z - z) > 1.6) return;
    this.jump(hit.x > this.root.position.x ? 1 : 0);
  }

  jump(side: number) {
    this.ctx.send({ k: "jump", side });
  }

  pick(n: number) {
    this.ctx.send({ k: "num", n });
  }

  key(code: string, down: boolean, ev: EpView | null) {
    const v = ev as NenupharsView | null;
    if (!down || !v || v.leader !== this.myIdx) return;
    if (code === "ArrowLeft" || code === "KeyQ" || code === "KeyA") this.jump(0);
    if (code === "ArrowRight" || code === "KeyD") this.jump(1);
  }

  hud(ev: EpView, now: number) {
    const v = ev as NenupharsView;
    const i = this.myIdx;
    const leader = v.leader;
    return {
      stage: v.stage,
      until: v.until,
      left: Math.max(0, Math.ceil((v.until - now) / 1000)),
      order: v.order,
      ids: v.ids,
      myOrder: i >= 0 ? v.order[i] : null,
      myTurn: i >= 0 && leader === i && atFront(v, i),
      decide: leader >= 0 && v.decideBy > now ? Math.max(0, Math.ceil((v.decideBy - now) / 1000)) : null,
      decideS: DECIDE_S,
      leader: leader >= 0 ? v.ids[leader] : null,
      ahead: i >= 0 && v.st[i] === 0 ? v.ids.filter((_, k) => v.st[k] === 0 && v.order[k]! < v.order[i]!).length : null,
      rows: v.rows,
      known: v.known.filter((k) => k !== -1).length,
      st: i >= 0 ? v.st[i] : null,
    };
  }

  onFx(k: string, f: { id?: string }) {
    if (k === "coule") this.ctx.sound("plouf", { gain: f.id === this.ctx.me ? 1 : 0.6 });
    else if (k === "tient") this.ctx.sound("pad");
    else if (k === "traverse") this.ctx.sound("cheer");
    else if (k === "pousse") this.ctx.sound("whistle", { gain: 0.5 });
  }

  camera(ev: EpView | null, m: MatchView, now: number): Shot {
    const v = ev as NenupharsView | null;
    void m;
    void now;
    const o = this.root.position;
    if (v && v.leader >= 0) {
      const pos = v.pos[v.leader]!;
      const z = pos < 0 ? START : rowZ(Math.min(v.rows - 1, pos));
      const mine = v.leader === this.myIdx;
      return shot(
        o.x + (mine ? 0 : 3.5),
        mine ? 3.4 : 5.5,
        o.z + z - (mine ? 4.2 : 7),
        o.x,
        0.4,
        o.z + z + (mine ? 3 : 2),
        mine ? 52 : 50,
        { ease: 0.8 },
      );
    }
    return shot(o.x + 7, 9, o.z - 6, o.x, 0, o.z + 12, 50, { ease: 0.6 });
  }

  reveal(k: number): Shot {
    const o = this.root.position;
    return path(
      [
        shot(o.x + 14, 12, o.z + 40, o.x, 0, o.z + 16, 46),
        shot(o.x - 4, 2.5, o.z + 18, o.x, 0.5, o.z + 10, 50),
        shot(o.x, 3.4, o.z - 4.2, o.x, 0.4, o.z + 6, 52),
      ],
      k,
    );
  }

  lineup(ids: string[]): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    const o = this.root.position;
    ids.forEach((id, i) =>
      out.set(id, { x: o.x + ((i % 4) - 1.5) * 1.1, z: o.z + START - 0.4 - Math.floor(i / 4) * 0.9, face: 0, act: "idle", stiff: 3 }),
    );
    return out;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

const atFront = (v: NenupharsView, i: number) => {
  const next = v.pos[i]! + 1;
  return next < v.rows && v.known[next] === -1;
};
