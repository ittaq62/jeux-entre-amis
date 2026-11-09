// Le stade de Crampons : la pelouse tondue, les lignes, les buts et leurs filets, les panneaux, les tribunes, les projecteurs.

import * as THREE from "three";
import {
  BOX_HALF,
  BOX_L,
  CIRCLE_R,
  GOAL_DEPTH,
  GOAL_H,
  GOAL_HALF,
  HALF_L,
  HALF_W,
  SIX_HALF,
  SIX_L,
  SPOT_L,
} from "../../../shared/games/crampons/pitch.ts";

export type Ambience = "jour" | "soir" | "nuit";

const SKY: Record<Ambience, { top: string; bottom: string; sun: number; hemi: number; sunColor: string; grass: [string, string] }> = {
  jour: { top: "#4a9fe0", bottom: "#d7eefb", sun: 2.4, hemi: 1.15, sunColor: "#fff4dd", grass: ["#4fa33f", "#45963a"] },
  soir: { top: "#3a3f7f", bottom: "#ffb37a", sun: 1.9, hemi: 0.95, sunColor: "#ffc891", grass: ["#4a9a3e", "#3f8c37"] },
  nuit: { top: "#070b1e", bottom: "#1c2a55", sun: 2.1, hemi: 0.75, sunColor: "#e9f1ff", grass: ["#3f8f3a", "#367f33"] },
};

/** La marge d'herbe autour des lignes, en mètres */
const MARGIN = 9;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** La pelouse : bandes de tonte, lignes blanches, un peu de grain pour qu'elle ne soit pas lisse comme une table */
function pitchTexture(a: Ambience): THREE.CanvasTexture {
  const fullL = (HALF_L + MARGIN) * 2;
  const fullW = (HALF_W + MARGIN) * 2;
  const k = 2048 / fullL;
  const [c, g] = canvas(2048, Math.round(fullW * k));
  const [g1, g2] = SKY[a].grass;
  g.fillStyle = g1;
  g.fillRect(0, 0, c.width, c.height);
  const band = 105 / 14;
  for (let i = -2; i < 18; i += 2) {
    g.fillStyle = g2;
    g.fillRect((MARGIN + i * band) * k, 0, band * k, c.height);
  }
  // Le grain de l'herbe
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = i % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 3);
  }
  const X = (x: number) => (x + HALF_L + MARGIN) * k;
  const Z = (z: number) => (z + HALF_W + MARGIN) * k;
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.lineWidth = Math.max(2.6, 0.16 * k);
  const rect = (x0: number, z0: number, x1: number, z1: number) => g.strokeRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
  rect(-HALF_L, -HALF_W, HALF_L, HALF_W);
  g.beginPath();
  g.moveTo(X(0), Z(-HALF_W));
  g.lineTo(X(0), Z(HALF_W));
  g.stroke();
  g.beginPath();
  g.arc(X(0), Z(0), CIRCLE_R * k, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(X(0), Z(0), 0.3 * k, 0, Math.PI * 2);
  g.fill();
  for (const end of [-1, 1]) {
    const line = end * HALF_L;
    const box = end * (HALF_L - BOX_L);
    const six = end * (HALF_L - SIX_L);
    rect(Math.min(line, box), -BOX_HALF, Math.max(line, box), BOX_HALF);
    rect(Math.min(line, six), -SIX_HALF, Math.max(line, six), SIX_HALF);
    const spot = end * (HALF_L - SPOT_L);
    g.beginPath();
    g.arc(X(spot), Z(0), 0.28 * k, 0, Math.PI * 2);
    g.fill();
    // L'arc de la surface : seulement la partie à l'extérieur
    const a0 = Math.acos((BOX_L - SPOT_L) / CIRCLE_R);
    g.beginPath();
    if (end > 0) g.arc(X(spot), Z(0), CIRCLE_R * k, Math.PI - a0, Math.PI + a0);
    else g.arc(X(spot), Z(0), CIRCLE_R * k, -a0, a0);
    g.stroke();
    for (const side of [-1, 1]) {
      g.beginPath();
      const from = end > 0 ? (side > 0 ? Math.PI : Math.PI / 2) : side > 0 ? -Math.PI / 2 : 0;
      const start = end > 0 ? (side > 0 ? Math.PI : Math.PI / 2) : side > 0 ? -Math.PI / 2 : 0;
      void from;
      g.arc(X(line), Z(side * HALF_W), 1 * k, start + (end > 0 && side > 0 ? 0 : 0), start + Math.PI / 2);
      g.stroke();
    }
  }
  return texture(c);
}

function netTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,0.75)";
  g.lineWidth = 3;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  const t = texture(c, true);
  return t;
}

function crowdTexture(night: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = night ? "#10162b" : "#2e3a52";
  g.fillRect(0, 0, 1024, 512);
  // Des couleurs adoucies : de loin, un public trop contrasté scintille
  const colors = ["#a85a4e", "#b89a58", "#5a7fae", "#b5b0a4", "#6a9a74", "#a57a9a", "#b1835a", "#7d76a8", "#c0bcae", "#3b4656"];
  const rows = 16;
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * (512 / rows);
    for (let x = (r % 2) * 10; x < 1024; x += 20) {
      if (Math.random() < 0.08) continue;
      const col = colors[Math.floor(Math.random() * colors.length)]!;
      g.fillStyle = col;
      g.fillRect(x, y - 3, 14, 14);
      g.fillStyle = ["#f0c9a2", "#d9a077", "#a0704c", "#6e4a31"][Math.floor(Math.random() * 4)]!;
      g.beginPath();
      g.arc(x + 7, y - 7, 6, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = texture(c, true);
  return t;
}

function boardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(2048, 128);
  const messages = [
    ["#0d5c3f", "#f3d68a", "LA TABLÉE"],
    ["#c8362f", "#ffffff", "CRAMPONS"],
    ["#1a3f8f", "#ffd24d", "ENTRE AMIS"],
    ["#f4c64e", "#2a1c08", "ON JOUE ?"],
  ] as const;
  const w = 2048 / messages.length;
  messages.forEach(([bg, fg, text], i) => {
    g.fillStyle = bg;
    g.fillRect(i * w, 0, w, 128);
    g.fillStyle = fg;
    g.font = "900 62px 'Arial Black', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, (i + 0.5) * w, 68);
  });
  return texture(c, true);
}

/** Une tribune en pente, avec son public et son toit */
function stand(length: number, crowd: THREE.Material, roof: THREE.Material, wall: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const depth = 34;
  const slope = 0.58;
  const seats = new THREE.Mesh(new THREE.PlaneGeometry(length, depth), crowd);
  seats.rotation.x = -Math.PI / 2 + slope;
  seats.position.set(0, Math.sin(slope) * depth * 0.5 + 1.5, -Math.cos(slope) * depth * 0.5);
  group.add(seats);
  const top = Math.sin(slope) * depth + 1.5;
  const back = -Math.cos(slope) * depth;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(length + 4, 1, depth * 0.72), roof);
  lid.position.set(0, top + 8, back * 0.72);
  lid.rotation.x = 0.05;
  group.add(lid);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(length + 4, top + 9, 1), wall);
  rear.position.set(0, (top + 9) / 2, back - 0.5);
  group.add(rear);
  const front = new THREE.Mesh(new THREE.BoxGeometry(length, 1.6, 0.6), wall);
  front.position.set(0, 0.8, 0.2);
  group.add(front);
  return group;
}

function goal(end: number, netTex: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: "#fbfbf6", roughness: 0.4 });
  const R = 0.085;
  const post = (x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, GOAL_H, 12), white);
    m.position.set(x, GOAL_H / 2, z);
    group.add(m);
  };
  const line = end * HALF_L;
  post(line, -GOAL_HALF);
  post(line, GOAL_HALF);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(R, R, GOAL_HALF * 2 + 0.15, 12), white);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(line, GOAL_H, 0);
  group.add(bar);

  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 });
  const part = (w: number, h: number, repeatX: number, repeatY: number) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
    return new THREE.Mesh(g, netMat);
  };
  const backX = line + end * GOAL_DEPTH;
  const back = part(GOAL_HALF * 2, GOAL_H, 18, 6);
  back.rotation.y = Math.PI / 2;
  back.position.set(backX, GOAL_H / 2, 0);
  group.add(back);
  const roof = part(GOAL_DEPTH, GOAL_HALF * 2, 5, 18);
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(line + (end * GOAL_DEPTH) / 2, GOAL_H, 0);
  group.add(roof);
  for (const side of [-1, 1]) {
    const s = part(GOAL_DEPTH, GOAL_H, 5, 6);
    s.position.set(line + (end * GOAL_DEPTH) / 2, GOAL_H / 2, side * GOAL_HALF);
    group.add(s);
  }
  return group;
}

export interface Stadium {
  /** À appeler à chaque image : le public s'agite d'autant plus que `excitement` (de 0 à 1) est grand */
  update(t: number, excitement: number): void;
  /** La tribune du premier plan gênerait la caméra de télévision : on la montre seulement quand la vue passe dans l'axe */
  showNearStand(on: boolean): void;
  dispose(): void;
}

/** Construit le stade dans `scene` et rend la poignée qui permet de l'animer */
export function buildStadium(scene: THREE.Scene, ambience: Ambience, lowQuality: boolean): Stadium {
  const sky = SKY[ambience];
  const made: (THREE.Texture | THREE.Material | THREE.BufferGeometry)[] = [];

  const [skyCanvas, g] = canvas(16, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, sky.top);
  grad.addColorStop(1, sky.bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const skyTex = texture(skyCanvas);
  scene.background = skyTex;
  made.push(skyTex);

  scene.add(new THREE.HemisphereLight("#ffffff", "#587a4a", sky.hemi));
  const sun = new THREE.DirectionalLight(sky.sunColor, sky.sun);
  sun.position.set(-30, 70, 40);
  scene.add(sun);

  const grassTex = pitchTexture(ambience);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry((HALF_L + MARGIN) * 2, (HALF_W + MARGIN) * 2),
    new THREE.MeshLambertMaterial({ map: grassTex }),
  );
  grass.rotation.x = -Math.PI / 2;
  scene.add(grass);
  made.push(grassTex, grass.geometry, grass.material as THREE.Material);

  // Tout autour, l'herbe continue jusque sous les tribunes : la caméra ne voit jamais le vide
  const under = new THREE.Mesh(new THREE.PlaneGeometry(420, 320), new THREE.MeshLambertMaterial({ color: sky.grass[1] }));
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.02;
  scene.add(under);
  made.push(under.geometry, under.material as THREE.Material);

  const netTex = netTexture();
  made.push(netTex);
  scene.add(goal(1, netTex), goal(-1, netTex));

  const crowdTex = crowdTexture(ambience === "nuit");
  crowdTex.repeat.set(8, 2);
  const crowdEnds = crowdTex.clone();
  crowdEnds.needsUpdate = true;
  crowdEnds.repeat.set(5, 2);
  made.push(crowdTex, crowdEnds);
  const seats = new THREE.MeshLambertMaterial({ map: crowdTex });
  const seatsEnds = new THREE.MeshLambertMaterial({ map: crowdEnds });
  const roof = new THREE.MeshLambertMaterial({ color: ambience === "jour" ? "#d8dee8" : "#3c465c" });
  const wall = new THREE.MeshLambertMaterial({ color: "#39435a" });
  made.push(seats, seatsEnds, roof, wall);
  const near = HALF_W + MARGIN + 3;
  const north = stand(HALF_L * 2 + 40, seats, roof, wall);
  north.position.set(0, 0, -near);
  scene.add(north);
  const south = stand(HALF_L * 2 + 40, seats, roof, wall);
  south.position.set(0, 0, near);
  south.rotation.y = Math.PI;
  scene.add(south);
  const farX = HALF_L + MARGIN + 3;
  const west = stand(HALF_W * 2 + 40, seatsEnds, roof, wall);
  west.position.set(-farX, 0, 0);
  west.rotation.y = Math.PI / 2;
  scene.add(west);
  const east = stand(HALF_W * 2 + 40, seatsEnds, roof, wall);
  east.position.set(farX, 0, 0);
  east.rotation.y = -Math.PI / 2;
  scene.add(east);

  // Le tour du terrain, en panneaux publicitaires
  const adTex = boardTexture();
  adTex.repeat.set(3, 1);
  const adMat = new THREE.MeshBasicMaterial({ map: adTex });
  made.push(adTex, adMat);
  const board = (w: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, 0.25), adMat);
    m.position.set(x, 0.55, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  board(HALF_L * 2 + 8, 0, -(HALF_W + 4.5), 0);
  board(HALF_L * 2 + 8, 0, HALF_W + 4.5, Math.PI);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) board(HALF_W - 6, end * (HALF_L + 5), side * (HALF_W / 2 + 6), (end * Math.PI) / 2);
  }

  // Les poteaux de corner
  const flagMat = new THREE.MeshBasicMaterial({ color: "#f8d33c", side: THREE.DoubleSide });
  const poleMat = new THREE.MeshLambertMaterial({ color: "#f4f4ee" });
  made.push(flagMat, poleMat);
  for (const x of [-HALF_L, HALF_L]) {
    for (const z of [-HALF_W, HALF_W]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), poleMat);
      pole.position.set(x, 0.8, z);
      scene.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), flagMat);
      flag.position.set(x + 0.25, 1.42, z);
      scene.add(flag);
    }
  }

  // Les pylônes d'éclairage, allumés la nuit et le soir
  if (!lowQuality) {
    const mast = new THREE.MeshLambertMaterial({ color: "#6b7388" });
    const lamp = new THREE.MeshBasicMaterial({ color: ambience === "jour" ? "#cfd5e2" : "#fffbe6" });
    made.push(mast, lamp);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const px = x * (HALF_L + 22);
        const pz = z * (HALF_W + 22);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 44, 8), mast);
        m.position.set(px, 22, pz);
        scene.add(m);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.6), lamp);
        panel.position.set(px, 45, pz);
        panel.lookAt(0, 0, 0);
        scene.add(panel);
      }
    }
  }

  return {
    update(t, excitement) {
      // Le public qui saute : un petit décalage de l'image, d'autant plus grand que le stade s'enflamme
      const amp = 0.004 + excitement * 0.03;
      const y = Math.abs(Math.sin(t * (3 + excitement * 7))) * amp;
      crowdTex.offset.y = y;
      crowdEnds.offset.y = y;
    },
    showNearStand(on) {
      south.visible = on;
    },
    dispose() {
      for (const m of made) m.dispose();
    },
  };
}
