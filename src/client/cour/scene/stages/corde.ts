// Le Tir à la corde à l'écran : deux plongeoirs de bois face à face, le grand bassin de mousse entre les deux, et la
// corde tendue de l'un à l'autre, un ruban rouge au milieu. Les deux équipes de la rencontre tirent sur leur plongeoir
// (penchées en arrière, un coup de rein à chaque « hisse ! ») ; les autres attendent au pied des plongeoirs. L'équipe
// tirée au bord bascule dans la mousse.

import * as THREE from "three";
import { BEAT_MS, ROPE_WIN, type CordeView } from "../../../../shared/games/cour/ep/corde.ts";
import type { EpView, MatchView } from "../../../../shared/games/cour/match.ts";
import type { ActorTarget } from "../crowd.ts";
import { FoamPool } from "../pool.ts";
import { Batch } from "../world.ts";
import { path, shot, type Shot, type Stage, type StageCtx } from "../stage.ts";

const DECK_Y = 1.5;
const EDGE = 6.2;
const POOL_W = 12;

export const TEAM_NAMES = ["les Rouges", "les Bleus", "les Jaunes", "les Verts"];
export const TEAM_COLORS = ["#d9344d", "#2f6fd1", "#f2b632", "#2f9a62"];

export class CordeStage implements Stage {
  private root = new THREE.Group();
  private pool: FoamPool;
  private rope: THREE.Group;
  private ropeX = 0;
  private fell = new Map<string, number>();
  private myIdx = -1;

  constructor(private ctx: StageCtx) {
    const keep = ctx.world.keep;
    this.pool = new FoamPool(ctx.world, POOL_W, 7, 0.55);
    this.root.add(this.pool.root);
    const b = new Batch();
    for (const s of [-1, 1]) {
      // Le plongeoir : un plancher sur pilotis, une rambarde au fond, une échelle
      const cx = s * (EDGE + 4);
      b.put(new THREE.BoxGeometry(8, 0.2, 3.4), "#c99a62", cx, DECK_Y, 0);
      for (let k = 0; k < 8; k++)
        b.put(new THREE.BoxGeometry(0.98, 0.02, 3.4), k % 2 ? "#b88a54" : "#d4a46c", cx - 3.5 + k, DECK_Y + 0.11, 0);
      for (const px of [-3.8, 0, 3.8])
        for (const pz of [-1.5, 1.5]) b.put(new THREE.CylinderGeometry(0.12, 0.14, DECK_Y, 8), "#8a6238", cx + px, DECK_Y / 2, pz);
      b.put(new THREE.BoxGeometry(0.12, 1.1, 3.4), "#f4efe6", cx + s * 4, DECK_Y + 0.6, 0);
      b.put(new THREE.BoxGeometry(0.16, 0.12, 3.6), TEAM_COLORS[s < 0 ? 0 : 1]!, cx + s * 4, DECK_Y + 1.15, 0);
      // La planche qui avance au-dessus de la mousse
      b.put(new THREE.BoxGeometry(1.6, 0.14, 1.2), "#e2b27a", s * (EDGE - 0.6), DECK_Y, 0);
    }
    const set = b.build(ctx.world.paint, keep);
    if (set) {
      set.castShadow = true;
      set.receiveShadow = true;
      this.root.add(set);
    }
    // La corde : une tresse épaisse, et le ruban au milieu
    this.rope = new THREE.Group();
    const ropeMat = keep(new THREE.MeshStandardMaterial({ color: "#d8b77a", roughness: 0.95 }));
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-14, 0, 0),
      new THREE.Vector3(-5, -0.25, 0),
      new THREE.Vector3(5, -0.25, 0),
      new THREE.Vector3(14, 0, 0),
    ]);
    const tube = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 64, 0.045, 8)), ropeMat);
    tube.castShadow = true;
    this.rope.add(tube);
    const ribbon = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(0.22, 0.7)),
      keep(new THREE.MeshStandardMaterial({ color: "#e0303e", side: THREE.DoubleSide })),
    );
    ribbon.position.set(0, -0.6, 0);
    ribbon.name = "ribbon";
    this.rope.add(ribbon);
    this.rope.position.y = DECK_Y + 0.95;
    this.root.add(this.rope);
    ctx.world.stage.add(this.root);
  }

  frame(ev: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget> {
    const v = ev as CordeView;
    const out = new Map<string, ActorTarget>();
    this.myIdx = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    this.pool.update(now);
    const match = v.matches[v.cur];
    const active = v.stage === "match" || v.stage === "fin" || (v.stage === "pause" && false);
    // La corde avance vers la première équipe (à gauche) quand elle est positive
    const want = active && match ? -v.rope : 0;
    this.ropeX += (want - this.ropeX) * Math.min(1, dt * 8);
    this.rope.position.x = this.ropeX;
    const ribbon = this.rope.getObjectByName("ribbon")!;
    ribbon.rotation.y = Math.sin(now / 200) * 0.3;
    const pulling = v.stage === "match" && now >= v.beat0;
    const beatK = ((now - v.beat0) / BEAT_MS) % 1;
    // Les équipes : celles de la rencontre sur les plongeoirs, les autres au pied, les gagnants sur le côté
    const teams = new Set(v.team);
    const teamList = [...teams].sort();
    for (const t of teamList) {
      const members = v.ids.map((_, i) => i).filter((i) => v.team[i] === t);
      const inMatch = match && (match[0] === t || match[1] === t) && v.stage !== "equipes";
      const side = match ? (match[0] === t ? -1 : 1) : t % 2 ? 1 : -1;
      const done =
        v.winners.length > v.matches.findIndex((mm) => mm.includes(t)) &&
        v.matches.findIndex((mm) => mm.includes(t)) >= 0 &&
        !(inMatch && v.stage === "match");
      members.forEach((i, j) => {
        const id = v.ids[i]!;
        const st = v.st[i]!;
        if (st === 2) {
          // Dans la mousse : il glisse du bord, puis barbote
          if (!this.fell.has(id)) {
            this.fell.set(id, now);
            this.pool.dent(side * (EDGE - 1.5 - (j % 3)), (j % 2 ? 1 : -1) * 0.8, now);
          }
          const age = (now - this.fell.get(id)!) / 1000;
          const fx = side * Math.max(1, EDGE - 1.2 - j * 0.6);
          out.set(id, {
            x: fx,
            y: age < 0.6 ? DECK_Y * (1 - age / 0.6) + 0.2 : 0.25,
            z: ((j % 4) - 1.5) * 1.3,
            face: side > 0 ? -Math.PI / 2 : Math.PI / 2,
            act: age < 0.6 ? "plunge" : "flail",
            stiff: 6,
          });
          return;
        }
        if (inMatch && !done) {
          const x = side * (EDGE + 0.7 + j * 0.85) + this.ropeX * (v.stage === "match" ? 1 : 0);
          out.set(id, {
            x,
            y: DECK_Y + 0.1,
            z: j % 2 ? 0.28 : -0.28,
            face: side < 0 ? Math.PI / 2 : -Math.PI / 2,
            act: pulling || v.stage === "fin" ? "pull" : "idle",
            speed: 1.2,
            stiff: 12,
          });
          return;
        }
        // En attente (ou déjà qualifiés) au pied des plongeoirs
        const row = Math.floor(j / 5);
        out.set(id, {
          x: side * (EDGE + 1 + (j % 5) * 0.9),
          z: (t >= 2 ? -1 : 1) * (3.2 + row * 0.9) * (match && (match[0] === t || match[1] === t) ? 1 : 1),
          face: t >= 2 ? 0 : Math.PI,
          act: done ? "cheer" : "idle",
          stiff: 4,
        });
      });
    }
    void m;
    void beatK;
    return out;
  }

  /** Mon coup sur la corde, à l'heure du serveur que je vois */
  tap() {
    this.ctx.send({ k: "tap", at: Math.round(this.ctx.serverNow()) });
  }

  key(code: string, down: boolean) {
    if (down && (code === "Space" || code === "Enter" || code === "KeyH")) this.tap();
  }

  hud(ev: EpView, now: number) {
    const v = ev as CordeView;
    const i = this.myIdx;
    const match = v.matches[v.cur];
    const myTeam = i >= 0 ? v.team[i]! : -1;
    const playing = Boolean(match && i >= 0 && match.includes(myTeam) && v.st[i] === 0 && v.stage === "match");
    return {
      stage: v.stage,
      beat0: v.beat0,
      beatMs: BEAT_MS,
      rope: v.rope / ROPE_WIN,
      force: v.force,
      match: match ?? null,
      cur: v.cur,
      count: v.matches.length,
      myTeam,
      side: match ? (match[0] === myTeam ? -1 : match[1] === myTeam ? 1 : 0) : 0,
      playing,
      q: i >= 0 ? v.q[i] : 0,
      until: v.until,
      left: Math.max(0, Math.ceil((v.until - now) / 1000)),
    };
  }

  onFx(k: string, f: { a?: number; id?: string }) {
    if (k === "hisse") this.ctx.sound("heave");
    else if (k === "tombe") this.ctx.sound("splashFoam");
    else if (k === "pret") this.ctx.sound("whistle");
    else if (k === "parfait" && f.id === this.ctx.me) this.ctx.sound("tick", { gain: 0.6 });
    else if (k === "glisse" && f.id === this.ctx.me) this.ctx.sound("slip");
  }

  camera(ev: EpView | null, m: MatchView, now: number): Shot {
    const v = ev as CordeView | null;
    void m;
    void now;
    const i = this.myIdx;
    if (v && i >= 0 && v.st[i] === 0) {
      const match = v.matches[v.cur];
      const t = v.team[i]!;
      if (match && match.includes(t) && v.stage !== "equipes") {
        const side = match[0] === t ? -1 : 1;
        return shot(side * 15, 5.5, -7.5, side * 2, 2.2, 0, 50, { ease: 0.9 });
      }
    }
    return shot(0, 7.5, -17, 0, 1.8, 0, 50, { ease: 0.7 });
  }

  reveal(k: number): Shot {
    return path(
      [shot(-18, 10, 18, 0, 1, 0, 48), shot(-3, 3.4, 6, 0, 1.2, 0, 50), shot(4, 2.6, -6, -2, 2.4, 0, 48), shot(0, 7.5, -17, 0, 1.8, 0, 50)],
      k,
    );
  }

  lineup(ids: string[]): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    ids.forEach((id, i) => {
      const side = i % 2 ? 1 : -1;
      const j = Math.floor(i / 2);
      out.set(id, { x: side * (EDGE + 1 + (j % 6) * 0.9), z: 3.2 + Math.floor(j / 6) * 0.9, face: Math.PI, act: "idle", stiff: 3 });
    });
    return out;
  }

  dispose() {
    this.pool.dispose();
    this.root.removeFromParent();
  }
}
