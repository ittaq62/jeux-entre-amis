// Les cérémonies : l'arrivée des candidats (le grand portail de la Cour, le tapis rouge, la foule qui passe dessous en
// saluant), et le podium du vainqueur (trois marches, la Cloche d'or qui descend sous un bouquet de ballons, les
// canons à confettis). Chacune a sa caméra et place la foule au fil du temps.

import * as THREE from "three";
import type { ActorTarget } from "./crowd.ts";
import { Batch, type World } from "./world.ts";
import { path, shot, type Shot } from "./stage.ts";

/** Le panneau du portail : le nom du jeu en lettres d'ampoules */
function signTexture(keep: <T extends { dispose: () => void }>(x: T) => T): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#d9344d");
  grad.addColorStop(1, "#a01f37");
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(8, 8, 1008, 240, 40);
  g.fill();
  g.strokeStyle = "#ffd84a";
  g.lineWidth = 10;
  g.stroke();
  for (let k = 0; k < 40; k++) {
    const x = 28 + (k * 968) / 39;
    for (const y of [26, 230]) {
      g.fillStyle = k % 2 ? "#fff6c8" : "#ffd84a";
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = "#fff7e0";
  g.font = "900 104px 'Big Shoulders Display Variable', 'Big Shoulders Display', Impact, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowOffsetY = 6;
  g.fillText("LA COUR DES GRANDS", 512, 134);
  const t = keep(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Le chemin de l'arrivée : du bout de l'île jusqu'à la cour, en passant sous le portail */
const ARCH_Z = 24;
const START_Z = 78;

export class Arrival {
  readonly root = new THREE.Group();

  constructor(world: World) {
    const keep = world.keep;
    const b = new Batch();
    for (const s of [-1, 1]) {
      b.put(new THREE.CylinderGeometry(0.55, 0.65, 7, 14), "#f4efe6", s * 5.2, 3.5, ARCH_Z);
      for (let k = 0; k < 5; k++)
        b.put(
          new THREE.TorusGeometry(0.6, 0.08, 6, 20),
          k % 2 ? "#d9344d" : "#2f6fd1",
          s * 5.2,
          0.8 + k * 1.4,
          ARCH_Z,
          0,
          1,
          1,
          1,
          Math.PI / 2,
        );
      b.put(new THREE.SphereGeometry(0.75, 16, 12), "#ffd84a", s * 5.2, 7.5, ARCH_Z);
    }
    b.put(new THREE.BoxGeometry(11.4, 0.35, 0.6), "#ffd84a", 0, 6.7, ARCH_Z);
    // Le tapis rouge
    b.put(new THREE.BoxGeometry(3.2, 0.03, START_Z - 6), "#c42a42", 0, 0.015, (START_Z + 6) / 2);
    for (let k = 0; k < 14; k++)
      for (const s of [-1, 1]) b.put(new THREE.CylinderGeometry(0.06, 0.08, 1, 8), "#d9b45a", s * 2.1, 0.5, 8 + k * 5);
    const m = b.build(world.paint, keep);
    if (m) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
    }
    const sign = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(9.6, 2.4)),
      keep(
        new THREE.MeshStandardMaterial({
          map: signTexture(keep),
          roughness: 0.5,
          emissive: new THREE.Color("#3a0a10"),
          side: THREE.DoubleSide,
        }),
      ),
    );
    sign.position.set(0, 8.2, ARCH_Z);
    sign.rotation.y = Math.PI;
    this.root.add(sign);
    world.stage.add(this.root);
  }

  /** Où est chacun, à l'instant k (0 à 1) de l'arrivée : en file sur le tapis, puis rangés dans la cour */
  targets(ids: string[], k: number, seconds: number): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    const n = ids.length;
    const cols = Math.min(8, Math.ceil(Math.sqrt(n * 1.6)));
    const walkS = seconds * 0.72;
    ids.forEach((id, i) => {
      const delay = (i / n) * seconds * 0.45;
      const t = k * seconds - delay;
      const row = Math.floor(i / cols);
      const col = i % cols;
      const fx = (col - (cols - 1) / 2) * 1.5;
      const fz = 6 + row * 1.5;
      if (t <= 0) {
        out.set(id, { x: ((i % 2) - 0.5) * 1.1, z: START_Z + 2, face: Math.PI, act: "idle", snap: true });
        return;
      }
      const u = Math.min(1, t / walkS);
      // Sur le tapis, deux par deux, puis chacun à sa place
      const lane = ((i % 2) - 0.5) * 1.1;
      const carpetZ = START_Z - u * (START_Z - 10);
      const onCarpet = carpetZ > fz + 3;
      const x = onCarpet ? lane : lane + (fx - lane) * Math.min(1, (fz + 3 - carpetZ) / 3);
      const z = onCarpet ? carpetZ : Math.max(fz, carpetZ);
      const arrived = u >= 1 || (!onCarpet && z <= fz + 0.05);
      out.set(id, {
        x,
        z,
        face: arrived ? Math.PI : undefined,
        act: arrived ? (i % 5 === 0 ? "wave" : "idle") : near(z, ARCH_Z, 3) ? "wave" : "walk",
        speed: 1.4,
        stiff: 8,
      });
    });
    return out;
  }

  camera(k: number): Shot {
    return path(
      [
        shot(90, 46, 150, 0, 4, 20, 46),
        shot(26, 12, START_Z + 14, 0, 2, START_Z - 10, 46),
        shot(9, 4, ARCH_Z + 9, 0, 3.5, ARCH_Z - 2, 52),
        shot(-3, 2.8, ARCH_Z - 4, 0, 4, ARCH_Z + 4, 58),
        shot(0, 3.4, -4, 0, 1.8, 10, 50),
      ],
      k,
    );
  }

  dispose() {
    this.root.removeFromParent();
  }
}

const near = (a: number, b: number, d: number) => Math.abs(a - b) < d;

export class Podium {
  readonly root = new THREE.Group();
  private trophy = new THREE.Group();
  private balloons = new THREE.Group();

  constructor(world: World) {
    const keep = world.keep;
    const b = new Batch();
    b.put(new THREE.BoxGeometry(2.4, 1.6, 2.4), "#f6efe2", 0, 0.8, 0);
    b.put(new THREE.BoxGeometry(2.4, 1.0, 2.4), "#e9e1cf", -2.5, 0.5, 0);
    b.put(new THREE.BoxGeometry(2.4, 0.6, 2.4), "#e9e1cf", 2.5, 0.3, 0);
    for (const [x, h, col] of [
      [0, 1.6, "#ffd84a"],
      [-2.5, 1.0, "#cfd6dd"],
      [2.5, 0.6, "#d79a5e"],
    ] as const)
      b.put(new THREE.BoxGeometry(2.42, 0.18, 2.42), col, x, h - 0.09, 0);
    // L'estrade et les canons à confettis
    b.put(new THREE.CylinderGeometry(9, 9.5, 0.3, 40), "#2f6fd1", 0, 0.15, 0);
    for (const s of [-1, 1]) {
      b.put(new THREE.CylinderGeometry(0.4, 0.5, 1.2, 12), "#3a3f4a", s * 6, 0.9, -1, 0, 1, 1, 1, 0.5, s * 0.3);
    }
    const m = b.build(world.paint, keep);
    if (m) {
      m.receiveShadow = true;
      m.castShadow = true;
      this.root.add(m);
    }
    // La Cloche d'or
    const gold = keep(
      new THREE.MeshStandardMaterial({ color: "#f2c94c", metalness: 0.95, roughness: 0.18, emissive: new THREE.Color("#3a2800") }),
    );
    const profile: THREE.Vector2[] = [];
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      profile.push(new THREE.Vector2(0.12 + 0.28 * Math.pow(t, 1.7) + (t > 0.85 ? (t - 0.85) * 0.8 : 0), 0.8 - t * 0.8));
    }
    const bell = new THREE.Mesh(keep(new THREE.LatheGeometry(profile, 28)), gold);
    bell.material.side = THREE.DoubleSide;
    this.trophy.add(bell);
    const handle = new THREE.Mesh(keep(new THREE.TorusGeometry(0.13, 0.04, 8, 18)), gold);
    handle.position.y = 0.9;
    this.trophy.add(handle);
    this.trophy.traverse((o) => (o.castShadow = true));
    this.root.add(this.trophy);
    for (let k = 0; k < 7; k++) {
      const ball = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.45, 14, 10)),
        keep(
          new THREE.MeshStandardMaterial({
            color: ["#d9344d", "#f2b632", "#2f6fd1", "#2f9a62", "#e85fa0", "#8a4fd1", "#ffffff"][k]!,
            roughness: 0.35,
          }),
        ),
      );
      const a = (k / 7) * Math.PI * 2;
      ball.position.set(Math.cos(a) * 0.55, 2.2 + (k % 2) * 0.4, Math.sin(a) * 0.55);
      ball.scale.y = 1.15;
      this.balloons.add(ball);
    }
    this.trophy.add(this.balloons);
    world.stage.add(this.root);
  }

  /** Le vainqueur sur la plus haute marche, le finaliste à côté, les autres autour qui applaudissent */
  targets(winner: string | null, second: string | null, others: string[], k: number): Map<string, ActorTarget> {
    const out = new Map<string, ActorTarget>();
    if (winner) out.set(winner, { x: 0, y: 1.6, z: 0, face: 0, act: k > 0.3 ? "celebrate" : "wave", snap: true });
    if (second) out.set(second, { x: -2.5, y: 1.0, z: 0, face: 0.2, act: "cheer", snap: true });
    others.forEach((id, i) => {
      const a = Math.PI * 0.15 + (i / Math.max(1, others.length - 1)) * Math.PI * 0.7;
      const r = 6.5 + (i % 3) * 1.1;
      out.set(id, { x: -Math.cos(a) * r, z: Math.sin(a) * r, face: Math.atan2(Math.cos(a), -Math.sin(a)), act: "cheer", snap: true });
    });
    return out;
  }

  /** La cloche descend sous ses ballons, jusqu'aux mains du vainqueur */
  update(k: number, now: number) {
    const d = Math.min(1, k / 0.45);
    this.trophy.position.set(0, 1.6 + 1.9 + (1 - d) * 9, 0.25);
    this.trophy.rotation.y = now / 700;
    this.balloons.visible = d < 1 || k < 0.6;
  }

  camera(k: number): Shot {
    return path(
      [shot(0, 9, 16, 0, 2.5, 0, 44), shot(5, 3.6, 8.5, 0, 2.6, 0, 40), shot(-2, 2.7, 5, 0, 3, 0, 46), shot(0, 5, 12, 0, 3, 0, 50)],
      k,
    );
  }

  dispose() {
    this.root.removeFromParent();
  }
}
