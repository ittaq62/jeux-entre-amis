// La cérémonie d'après la course : un podium posé sur la route juste après la ligne, un tapis rouge, et un trophée qui
// tourne au-dessus du vainqueur. Les trois premiers montent sur les marches, les autres regardent depuis le bord.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pointAt, type Track } from "../../../shared/games/bolides/track.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

/** Où se place un kart pendant la cérémonie */
export interface PodiumSpot {
  x: number;
  y: number;
  z: number;
  h: number;
}

/** À combien de mètres après la ligne on l'installe (la ligne droite du départ est toujours dégagée) */
const AT = 18;
const WIDTH = 3.9;
const DEPTH = 4.8;
const SINK = 1.2;
/** Les marches, de la première à la troisième place ; `across` : leur place sur la largeur de la route */
const STEPS = [
  { across: 0, height: 2.1, top: 0xf2c450 },
  { across: 4.15, height: 1.45, top: 0xd9dee8 },
  { across: -4.15, height: 0.9, top: 0xd39a66 },
];

/** Le rang derrière le podium : où se garent les autres, en part de la demi-largeur de la route */
const BACK_ROW = [0.5, -0.5, 1, -1, 0];

/** La face avant d'une marche, avec son numéro */
function stepFace(n: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const scale = 88;
  c.width = Math.round(WIDTH * scale);
  c.height = Math.round((height + SINK) * scale);
  const g = c.getContext("2d")!;
  const shade = g.createLinearGradient(0, 0, 0, height * scale);
  shade.addColorStop(0, "#fbf0d8");
  shade.addColorStop(1, "#d6bd92");
  g.fillStyle = shade;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#e2b45c";
  g.fillRect(0, 0, c.width, 12);
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-title").trim() || "serif";
  g.fillStyle = "#8f2230";
  g.font = `${Math.round(Math.min(height * scale * 0.72, 150))}px ${family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), c.width / 2, (height * scale) / 2 + 8);
  return c;
}

function trophyGeometry(): THREE.BufferGeometry {
  const profile = [
    [0.34, 0],
    [0.34, 0.07],
    [0.13, 0.11],
    [0.08, 0.3],
    [0.17, 0.42],
    [0.1, 0.5],
    [0.26, 0.62],
    [0.37, 0.86],
    [0.41, 1.12],
    [0.37, 1.12],
    [0.3, 0.9],
    [0, 0.74],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.LatheGeometry(profile, 28);
  const left = new THREE.TorusGeometry(0.2, 0.042, 8, 18).translate(-0.44, 0.88, 0);
  const right = new THREE.TorusGeometry(0.2, 0.042, 8, 18).translate(0.44, 0.88, 0);
  const merged = mergeGeometries([cup, left, right], false)!;
  cup.dispose();
  left.dispose();
  right.dispose();
  return merged;
}

export class Podium {
  readonly group = new THREE.Group();
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Vers où il regarde (le long de la route, côté caméra), et sa largeur */
  readonly fx: number;
  readonly fz: number;
  readonly sx: number;
  readonly sz: number;
  private h: number;
  private trophy: THREE.Mesh;
  private trophyY: number;

  constructor(
    private t: Track,
    keep: Keep,
    shadows: boolean,
  ) {
    const center = pointAt(t, AT, 0);
    const ahead = pointAt(t, AT + 1, 0);
    const beside = pointAt(t, AT, 1);
    this.x = center.x;
    this.y = center.y;
    this.z = center.z;
    this.h = Math.atan2(ahead.x - center.x, ahead.z - center.z);
    this.fx = Math.sin(this.h);
    this.fz = Math.cos(this.h);
    this.sx = beside.x - center.x;
    this.sz = beside.z - center.z;
    const sideMat = keep(new THREE.MeshStandardMaterial({ color: 0xe9d5ad, roughness: 0.7 }));
    STEPS.forEach((step, i) => {
      const geo = keep(new THREE.BoxGeometry(WIDTH, step.height + SINK, DEPTH));
      const tex = keep(new THREE.CanvasTexture(stepFace(i + 1, step.height)));
      tex.colorSpace = THREE.SRGBColorSpace;
      const face = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      const top = keep(new THREE.MeshStandardMaterial({ color: step.top, roughness: 0.32, metalness: 0.45 }));
      const mesh = new THREE.Mesh(geo, [sideMat, sideMat, top, sideMat, face, sideMat]);
      const at = pointAt(t, AT, step.across);
      mesh.position.set(at.x, at.y + (step.height - SINK) / 2, at.z);
      mesh.rotation.y = this.h;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      this.group.add(mesh);
    });
    this.group.add(this.carpet(keep));
    this.trophy = new THREE.Mesh(
      keep(trophyGeometry()),
      keep(
        new THREE.MeshStandardMaterial({ color: 0xffd257, metalness: 0.7, roughness: 0.28, emissive: 0x8a5a00, emissiveIntensity: 0.85 }),
      ),
    );
    this.trophy.scale.setScalar(1.45);
    this.trophyY = this.y + STEPS[0]!.height + 4.05;
    this.trophy.position.set(this.x, this.trophyY, this.z);
    this.trophy.castShadow = shadows;
    this.group.add(this.trophy);
  }

  /** Le tapis rouge, de la première marche jusque devant la caméra : il suit le relief de la route */
  private carpet(keep: Keep): THREE.Mesh {
    const pos: number[] = [];
    const index: number[] = [];
    const n = 30;
    for (let i = 0; i <= n; i++) {
      const s = AT + DEPTH / 2 + i;
      const a = pointAt(this.t, s, -2.5);
      const b = pointAt(this.t, s, 2.5);
      pos.push(a.x, a.y + 0.07, a.z, b.x, b.y + 0.07, b.z);
      if (i < n) {
        const v = i * 2;
        index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ color: 0xb3242f, roughness: 0.9, side: THREE.DoubleSide })));
    mesh.receiveShadow = true;
    return mesh;
  }

  /** La place de chacun, du premier au dernier */
  spots(count: number): PodiumSpot[] {
    const t = this.t;
    return Array.from({ length: count }, (_, i) => {
      const step = STEPS[i];
      if (step) {
        const p = pointAt(t, AT, step.across);
        return { x: p.x, y: p.y + step.height, z: p.z, h: this.h };
      }
      // Les autres, en rang derrière le podium : ils regardent, sans jamais boucher la vue
      const p = pointAt(t, AT - 7.5, BACK_ROW[(i - 3) % BACK_ROW.length]! * (t.half - 1.8));
      return { x: p.x, y: p.y, z: p.z, h: this.h };
    });
  }

  update(time: number) {
    this.trophy.rotation.y = time * 1.3;
    this.trophy.position.y = this.trophyY + Math.sin(time * 2.1) * 0.14;
  }
}
