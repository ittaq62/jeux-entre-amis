// La Marelle à l'écran : une grande cour goudronnée, une marelle à la craie par candidat, des cases numérotées jusqu'au
// Ciel. Pendant la démonstration, les cases s'allument toutes ensemble, chacune avec sa couleur et sa note ; puis
// chacun saute sur sa propre marelle. Mon candidat saute dès que je touche une case. Une erreur : le canon à mousse.

import * as THREE from "three";
import { CASE_NAMES, MARELLE_CASES, type MarelleView } from "../../../../shared/games/cour/ep/marelle.ts";
import type { EpView, MatchView } from "../../../../shared/games/cour/match.ts";
import type { ActorTarget } from "../crowd.ts";
import { Batch } from "../world.ts";
import { path, shot, type PointerInfo, type Shot, type Stage, type StageCtx } from "../stage.ts";

const COLS = 8;
const GAP_X = 2.6;
const GAP_Z = 9.5;
const CASE = 0.86;
export const CASE_COLORS = ["#ff5d6c", "#ffa94d", "#ffd43b", "#69db7c", "#38d9a9", "#4dabf7", "#748ffc", "#b197fc", "#f783ac", "#ffffff"];

function gridAt(k: number): { x: number; z: number } {
  return { x: ((k % COLS) - (COLS - 1) / 2) * GAP_X, z: Math.floor(k / COLS) * GAP_Z };
}

/** Le dessin à la craie : le contour de chaque case et son numéro, à la place exacte des cases */
const PX = 140;
const CHALK = { x0: -0.95, x1: 0.95, z0: -0.48, z1: 7.22 };
function chalkTexture(keep: <T extends { dispose: () => void }>(x: T) => T): THREE.CanvasTexture {
  const w = Math.round((CHALK.x1 - CHALK.x0) * PX);
  const h = Math.round((CHALK.z1 - CHALK.z0) * PX);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, w, h);
  MARELLE_CASES.forEach(([cx, cz], k) => {
    // Vue depuis le pied de la marelle : le haut de la toile est le Ciel (+z), sa droite est le côté −x
    const x = (CHALK.x1 - cx) * PX;
    const y = (CHALK.z1 - cz) * PX;
    const half = (CASE / 2) * PX;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 5;
    if (k === MARELLE_CASES.length - 1) {
      g.beginPath();
      g.arc(x, y + half * 0.4, half * 1.05, Math.PI, 0);
      g.lineTo(x + half, y + half);
      g.lineTo(x - half, y + half);
      g.closePath();
      g.stroke();
    } else g.strokeRect(x - half + 3, y - half + 3, half * 2 - 6, half * 2 - 6);
    const name = CASE_NAMES[k]!;
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.font = `800 ${name.length > 1 ? 34 : 62}px 'Big Shoulders Display Variable', Impact, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(name, x, y + 4);
  });
  const t = keep(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MarelleStage implements Stage {
  private root = new THREE.Group();
  private cells: THREE.InstancedMesh;
  private labels: THREE.InstancedMesh;
  private built = 0;
  private myIdx = -1;
  private myProg = 0;
  private myRound = 0;
  private lit = new Map<number, number>();
  private flash: { c: number; at: number } | null = null;
  private hopAt = new Map<string, { c: number; at: number; from: number }>();
  private lastProg = new Map<string, number>();
  private shown = 0;
  private col = new THREE.Color();
  private cannon: { at: number; id: string }[] = [];

  constructor(private ctx: StageCtx) {
    const keep = ctx.world.keep;
    const n = 48;
    this.cells = new THREE.InstancedMesh(
      keep(new THREE.BoxGeometry(CASE, 0.02, CASE)),
      keep(new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: new THREE.Color("#000000") })),
      n * 10,
    );
    this.cells.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 10 * 3), 3);
    this.cells.count = 0;
    this.cells.receiveShadow = true;
    this.root.add(this.cells);
    // Les contours et les numéros à la craie : une même toile posée sur chaque marelle
    this.labels = new THREE.InstancedMesh(
      keep(new THREE.PlaneGeometry(CHALK.x1 - CHALK.x0, CHALK.z1 - CHALK.z0)),
      keep(new THREE.MeshBasicMaterial({ map: chalkTexture(keep), transparent: true, depthWrite: false })),
      n,
    );
    this.labels.count = 0;
    this.root.add(this.labels);
    this.root.position.set(0, 0, 2);
    ctx.world.stage.add(this.root);
  }

  private build(n: number) {
    if (n === this.built) return;
    this.built = n;
    const keep = this.ctx.world.keep;
    const b = new Batch();
    const rows = Math.ceil(n / COLS);
    // La cour goudronnée
    b.put(new THREE.BoxGeometry(COLS * GAP_X + 3, 0.04, rows * GAP_Z + 2), "#5a5d66", 0, 0.02, ((rows - 1) * GAP_Z) / 2 + 3.2);
    const set = b.build(this.ctx.world.paint, keep);
    if (set) {
      set.receiveShadow = true;
      this.root.add(set);
    }
    // Les étiquettes de craie : un grand rectangle couché le long de chaque marelle (les cases simples)
    const m = new THREE.Matrix4();
    for (let k = 0; k < n; k++) {
      const p = gridAt(k);
      m.compose(
        new THREE.Vector3(p.x + (CHALK.x0 + CHALK.x1) / 2, 0.075, p.z + (CHALK.z0 + CHALK.z1) / 2),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.PI, 0, "YXZ")),
        new THREE.Vector3(1, 1, 1),
      );
      this.labels.setMatrixAt(k, m);
    }
    this.labels.count = n;
    this.labels.instanceMatrix.needsUpdate = true;
  }

  frame(ev: EpView, m: MatchView, now: number, dt: number): Map<string, ActorTarget> {
    const v = ev as MarelleView;
    const out = new Map<string, ActorTarget>();
    this.build(v.ids.length);
    this.myIdx = this.ctx.me ? v.ids.indexOf(this.ctx.me) : -1;
    if (v.round !== this.myRound) {
      this.myRound = v.round;
      this.myProg = 0;
      this.shown = 0;
    }
    if (this.myIdx >= 0 && v.prog[this.myIdx]! > this.myProg) this.myProg = v.prog[this.myIdx]!;
    if (v.stage !== "saute") this.myProg = this.myIdx >= 0 ? v.prog[this.myIdx]! : 0;
    // Les cases qui s'allument pendant la démonstration
    if (v.stage === "montre") {
      while (this.shown < v.seq.length) {
        const c = v.seq[this.shown]!;
        this.lit.set(c, now);
        this.ctx.sound("note", { rate: c });
        this.shown++;
      }
    }
    const o = this.root.position;
    let n = 0;
    const mm = new THREE.Matrix4();
    v.ids.forEach((id, i) => {
      const p = gridAt(i);
      const st = v.st[i]!;
      const mine = i === this.myIdx;
      MARELLE_CASES.forEach(([cx, cz], c) => {
        const litAt = this.lit.get(c) ?? -1e9;
        const glow = Math.max(0, 1 - (now - litAt) / 520);
        const flash = mine && this.flash && this.flash.c === c ? Math.max(0, 1 - (now - this.flash.at) / 350) : 0;
        const base = st === 2 ? "#6b6f78" : "#7d818c";
        this.col.set(base).lerp(this.col.clone().set(CASE_COLORS[c]!), Math.max(glow, flash, mine && v.stage === "saute" ? 0.18 : 0));
        mm.makeTranslation(p.x + cx, 0.05 + glow * 0.04, p.z + cz);
        this.cells.setMatrixAt(n, mm);
        this.cells.setColorAt(n, this.col);
        n++;
      });
      // Le candidat : au pied de sa marelle, puis sur la dernière case sautée
      let prog = mine ? this.myProg : v.prog[i]!;
      if (v.stage !== "saute" && v.stage !== "bilan") prog = 0;
      const lastCase = prog > 0 ? (v.stage === "saute" || v.stage === "bilan" ? this.caseOf(v, i, prog - 1, mine) : -1) : -1;
      const [cx, cz] = lastCase >= 0 ? MARELLE_CASES[lastCase]! : [0, -0.9];
      const prev = this.lastProg.get(id) ?? 0;
      if (prog !== prev) {
        this.hopAt.set(id, { c: lastCase, at: now, from: prev });
        this.lastProg.set(id, prog);
      }
      const hop = this.hopAt.get(id);
      const hopping = hop && now - hop.at < 420;
      const act =
        st === 2
          ? "flail"
          : st === 1
            ? v.stage === "saute"
              ? "celebrate"
              : "idle"
            : hopping
              ? "hop"
              : v.stage === "montre"
                ? "think"
                : "idle";
      out.set(id, {
        x: o.x + p.x + cx,
        y: hopping ? Math.sin(((now - hop!.at) / 420) * Math.PI) * 0.35 : 0,
        z: o.z + p.z + cz,
        face: 0,
        act,
        stiff: 14,
      });
    });
    this.cells.count = n;
    this.cells.instanceMatrix.needsUpdate = true;
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;
    // Le canon à mousse : un jet de mousse sur celui qui s'est trompé
    for (const c of this.cannon) {
      const a = this.ctx.actors.get(c.id);
      if (!a) continue;
      const age = now - c.at;
      if (age < 900 && Math.random() < dt * 30) this.ctx.burst("canon", a.x - 1.5 + (age / 900) * 1.2, 1.3, a.z, { count: 4, power: 0.6 });
    }
    void m;
    return out;
  }

  /** La case qu'il a sautée en n-ième (la mienne : ce que j'ai touché ; les autres : l'ordre, connu au bilan) */
  private mine: number[] = [];
  private caseOf(v: MarelleView, i: number, k: number, mine: boolean): number {
    if (mine && this.mine[k] !== undefined) return this.mine[k]!;
    return v.seq[k] ?? Math.abs((i * 7 + k * 3) % 10);
  }

  hop(c: number, v: MarelleView) {
    if (this.myIdx < 0 || v.stage !== "saute" || v.st[this.myIdx] !== 0) return;
    const j = this.myProg;
    this.mine[j] = c;
    this.myProg = j + 1;
    this.flash = { c, at: this.ctx.serverNow() };
    this.ctx.sound("note", { rate: c, gain: 0.7 });
    this.ctx.send({ k: "hop", c, j });
  }

  pointer(p: PointerInfo, ev: EpView | null) {
    const v = ev as MarelleView | null;
    if (!v || p.kind !== "down" || this.myIdx < 0) return;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(p.nx, p.ny), this.ctx.world.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.05), new THREE.Vector3());
    if (!hit) return;
    const g = gridAt(this.myIdx);
    const lx = hit.x - this.root.position.x - g.x;
    const lz = hit.z - this.root.position.z - g.z;
    let best = -1;
    let bd = 0.62;
    MARELLE_CASES.forEach(([cx, cz], c) => {
      const d = Math.max(Math.abs(lx - cx), Math.abs(lz - cz));
      if (d < bd) {
        bd = d;
        best = c;
      }
    });
    if (best >= 0) this.hop(best, v);
  }

  key(code: string, down: boolean, ev: EpView | null) {
    const v = ev as MarelleView | null;
    if (!down || !v) return;
    const m = /^(Digit|Numpad)(\d)$/.exec(code);
    if (!m) return;
    const d = Number(m[2]);
    this.hop(d === 0 ? 9 : d - 1, v);
  }

  hud(ev: EpView, now: number) {
    const v = ev as MarelleView;
    const i = this.myIdx;
    if (v.stage === "montre" && this.mine.length) this.mine = [];
    return {
      stage: v.stage,
      round: v.round,
      len: v.len,
      prog: this.myProg,
      st: i >= 0 ? v.st[i] : null,
      left: Math.max(0, Math.ceil((v.until - now) / 1000)),
      alive: v.st.filter((s) => s !== 2).length,
    };
  }

  onFx(k: string, f: { id?: string; a?: number }) {
    if (k === "rate" && f.id) {
      this.cannon.push({ at: this.ctx.serverNow(), id: f.id });
      this.ctx.sound("cannon", { gain: f.id === this.ctx.me ? 1 : 0.35 });
    } else if (k === "saut" && f.id && f.id !== this.ctx.me && Math.random() < 0.2) this.ctx.sound("hop", { gain: 0.15 });
    else if (k === "ciel" && f.id === this.ctx.me) this.ctx.sound("ding");
    else if (k === "saute") this.ctx.sound("whistle", { gain: 0.6 });
  }

  camera(ev: EpView | null, m: MatchView, now: number): Shot {
    const v = ev as MarelleView | null;
    void m;
    void now;
    const o = this.root.position;
    if (v && this.myIdx >= 0 && v.st[this.myIdx] !== 2) {
      const g = gridAt(this.myIdx);
      // Ma marelle de trois quarts, d'assez haut pour toucher chaque case
      return shot(o.x + g.x, 6.2, o.z + g.z - 3.2, o.x + g.x, 0, o.z + g.z + 3.6, 50, { ease: 1.2 });
    }
    return shot(o.x, 16, o.z - 8, o.x, 0, o.z + 8, 50, { ease: 0.6 });
  }

  reveal(k: number): Shot {
    const o = this.root.position;
    return path(
      [
        shot(o.x - 14, 14, o.z - 10, o.x, 0, o.z + 6, 46),
        shot(o.x + 1, 1.2, o.z - 1.5, o.x, 0.2, o.z + 4, 48),
        shot(o.x, 16, o.z - 8, o.x, 0, o.z + 8, 50),
      ],
      k,
    );
  }

  lineup(ids: string[]): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    const o = this.root.position;
    ids.forEach((id, i) => {
      const g = gridAt(i);
      out.set(id, { x: o.x + g.x, z: o.z + g.z - 0.9, face: 0, act: "idle", stiff: 3 });
    });
    return out;
  }

  dispose() {
    this.root.removeFromParent();
  }
}
