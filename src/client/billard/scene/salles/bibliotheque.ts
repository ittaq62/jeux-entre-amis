// La bibliothèque : des livres du sol au plafond tout autour, une échelle sur son rail de laiton, un lustre de cristal,
// une horloge comtoise dont le balancier bat, le globe terrestre sur son pied, deux fauteuils de lecture et une lampe de
// banquier verte sur le bureau, de hautes fenêtres sous la lune. La lampe du billard aux abat-jour de laiton.

import * as THREE from "three";
import { seeded } from "../textures.ts";
import { bin, block, canvasTex, glow, phys, poolLamp, roundBlock, std, type Salle } from "./common.ts";
import { armchair, FLOOR, parquet, rug, wall } from "./decor.ts";

/** Un pan de bibliothèque : des étagères et des rangées de livres de toutes les couleurs (une seule texture) */
function bookWall(keep: <T extends { dispose: () => void }>(x: T) => T, w: number, h: number, seed: number): THREE.MeshStandardMaterial {
  const t = keep(
    canvasTex(
      1024,
      1024,
      (g) => {
        g.fillStyle = "#1e0f08";
        g.fillRect(0, 0, 1024, 1024);
        const rnd = seeded(seed);
        const shelves = 7;
        const sh = 1024 / shelves;
        const colors = [
          "#6a1a1a",
          "#1a3a5a",
          "#2a4a2a",
          "#5a3a1a",
          "#3a2a4a",
          "#7a5a2a",
          "#1a1a1a",
          "#8a2a1a",
          "#2a2a3a",
          "#4a3020",
          "#c8b890",
        ];
        for (let s = 0; s < shelves; s++) {
          const base = (s + 1) * sh - 14;
          g.fillStyle = "#3a1e10";
          g.fillRect(0, base, 1024, 14);
          let x = 6;
          while (x < 1018) {
            const bw = 10 + rnd() * 18,
              bh = sh * (0.55 + rnd() * 0.35);
            if (rnd() < 0.06) {
              x += 20 + rnd() * 30;
              continue;
            }
            const c = new THREE.Color(colors[Math.floor(rnd() * colors.length)]!);
            c.multiplyScalar(0.7 + rnd() * 0.5);
            g.fillStyle = c.getStyle();
            // Certains penchent
            const lean = rnd() < 0.05;
            g.save();
            if (lean) {
              g.translate(x, base);
              g.rotate(-0.25);
              g.fillRect(0, -bh, bw, bh);
            } else g.fillRect(x, base - bh, bw, bh);
            g.restore();
            // Les nerfs dorés du dos
            if (!lean && rnd() < 0.6) {
              g.fillStyle = "rgba(220,180,90,0.7)";
              g.fillRect(x + 1, base - bh * 0.85, bw - 2, 2);
              g.fillRect(x + 1, base - bh * 0.2, bw - 2, 2);
            }
            x += bw + 1 + (lean ? 12 : 0);
          }
        }
        // L'ombre sous chaque planche
        for (let s = 0; s < shelves; s++) {
          const grd = g.createLinearGradient(0, s * sh, 0, s * sh + 40);
          grd.addColorStop(0, "rgba(0,0,0,0.55)");
          grd.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = grd;
          g.fillRect(0, s * sh, 1024, 40);
        }
      },
      true,
    ),
  );
  t.repeat.set(w / 2.2, h / 2.6);
  return std(keep, "#ffffff", 0.8, 0, { map: t });
}

export function bibliotheque(touch: boolean): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const W = 4.6,
    D = 3.8,
    H = 3.6;
  const ceil = FLOOR + H;

  root.add(parquet(keep, 2 * W, 2 * D, ["#5a3418", "#3a200e"], false, 3));
  root.add(rug(keep, 4.4, 3.0, ["#1a2a4a", "#c8a050", "#6a1418"]));

  const books = bookWall(keep, 2 * W, H, 3);
  const books2 = bookWall(keep, 2 * D, H, 8);
  root.add(wall(keep, books, -W, -D, W, -D, H));
  root.add(wall(keep, books2, W, -D, W, D, H));
  root.add(wall(keep, books2, -W, D, -W, -D, H));
  // Le mur d'en face : boiseries et hautes fenêtres sous la lune
  const panel = phys(keep, { color: "#3a1c0c", roughness: 0.45, clearcoat: 0.6 });
  root.add(wall(keep, panel, W, D, -W, D, H));
  const moon = keep(
    canvasTex(128, 320, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 320);
      grd.addColorStop(0, "#0a1430");
      grd.addColorStop(1, "#24304e");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 320);
      g.fillStyle = "#f2f4ff";
      g.beginPath();
      g.arc(70, 70, 16, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#1a0e06";
      g.lineWidth = 7;
      g.strokeRect(3, 3, 122, 314);
      g.beginPath();
      g.arc(64, 70, 60, Math.PI, 0);
      g.stroke();
      g.beginPath();
      g.moveTo(64, 10);
      g.lineTo(64, 320);
      for (const y of [110, 180, 250]) {
        g.moveTo(0, y);
        g.lineTo(128, y);
      }
      g.stroke();
    }),
  );
  for (const x of [-2.6, 0, 2.6]) {
    const win = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.0, 2.5)), keep(new THREE.MeshBasicMaterial({ map: moon })));
    win.position.set(x, FLOOR + 1.85, D - 0.03);
    win.rotation.y = Math.PI;
    root.add(win);
  }
  // Les corniches et le rail de l'échelle
  const dark = phys(keep, { color: "#2a1206", roughness: 0.4, clearcoat: 0.7 });
  for (const [x0, z0, x1, z1] of [
    [-W, -D, W, -D],
    [W, -D, W, D],
    [-W, D, -W, -D],
  ] as [number, number, number, number][]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = block(len, 0.2, 0.14, dark, (x0 + x1) / 2, ceil - 0.2, (z0 + z1) / 2, keep);
    m.rotation.y = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    root.add(m);
    const base = block(len, 0.5, 0.3, dark, (x0 + x1) / 2, FLOOR, (z0 + z1) / 2, keep);
    base.rotation.y = m.rotation.y;
    root.add(base);
  }
  const brass = std(keep, "#b8913c", 0.3, 1);
  const railBar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.015, 0.015, 2 * W, 8)), brass);
  railBar.rotation.z = Math.PI / 2;
  railBar.position.set(0, FLOOR + 2.6, -D + 0.25);
  root.add(railBar);
  // L'échelle, appuyée sur le rail
  const ladder = new THREE.Group();
  for (const sx of [-0.22, 0.22]) {
    const side = block(0.05, 2.75, 0.05, dark, sx, 0, 0, keep);
    ladder.add(side);
  }
  for (let k = 0; k < 8; k++) ladder.add(block(0.44, 0.03, 0.06, dark, 0, 0.3 + k * 0.32, 0, keep));
  ladder.position.set(1.6, FLOOR, -D + 0.6);
  ladder.rotation.x = -0.15;
  root.add(ladder);

  // Le plafond à caissons et le lustre
  const ceiling = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * W, 2 * D)), std(keep, "#2a1a10", 0.8));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ceil;
  root.add(ceiling);
  for (let i = -3; i <= 3; i++) root.add(block(0.12, 0.14, 2 * D, dark, (i * W) / 3.5, ceil - 0.14, 0, keep));
  for (let j = -2; j <= 2; j++) root.add(block(2 * W, 0.14, 0.12, dark, 0, ceil - 0.14, (j * D) / 2.6, keep));
  const crystal = glow(keep, "#fff4d8", 1.6);
  const chand = new THREE.Group();
  chand.userData.live = true;
  const ringGeo = keep(new THREE.TorusGeometry(0.4, 0.015, 6, 32));
  const ring = new THREE.Mesh(ringGeo, brass);
  ring.rotation.x = Math.PI / 2;
  chand.add(ring);
  const drop = keep(new THREE.OctahedronGeometry(0.025, 0));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const c = new THREE.Mesh(drop, crystal);
    c.position.set(Math.cos(a) * 0.4, -0.06 - (k % 2) * 0.05, Math.sin(a) * 0.4);
    c.scale.set(1, 2, 1);
    chand.add(c);
    if (k % 2 === 0) {
      const candle = new THREE.Mesh(keep(new THREE.SphereGeometry(0.03, 8, 6)), crystal);
      candle.position.set(Math.cos(a) * 0.4, 0.07, Math.sin(a) * 0.4);
      chand.add(candle);
    }
  }
  chand.position.set(-3.0, ceil - 0.8, 1.6);
  root.add(chand);
  const chandLight = new THREE.PointLight("#ffd8a0", 1.8, 6, 1.6);
  chandLight.position.copy(chand.position);
  root.add(chandLight);

  // L'horloge comtoise et son balancier
  const clock = new THREE.Group();
  const clockWood = phys(keep, { color: "#4a1e0c", roughness: 0.35, clearcoat: 1 });
  clock.add(roundBlock(0.5, 2.1, 0.32, 0.03, clockWood, 0, FLOOR, 0, keep));
  const face = new THREE.Mesh(
    keep(new THREE.CircleGeometry(0.19, 32)),
    std(keep, "#ffffff", 0.5, 0, {
      map: keep(
        canvasTex(256, 256, (g) => {
          g.fillStyle = "#efe6d0";
          g.fillRect(0, 0, 256, 256);
          g.strokeStyle = "#2a1a10";
          g.lineWidth = 6;
          g.beginPath();
          g.arc(128, 128, 118, 0, Math.PI * 2);
          g.stroke();
          g.font = "bold 26px serif";
          g.fillStyle = "#2a1a10";
          g.textAlign = "center";
          g.textBaseline = "middle";
          const romans = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
          romans.forEach((r, i) => {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
            g.fillText(r, 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
          });
          g.lineWidth = 7;
          g.beginPath();
          g.moveTo(128, 128);
          g.lineTo(128 + 50, 128 - 30);
          g.moveTo(128, 128);
          g.lineTo(128 - 10, 128 - 80);
          g.stroke();
        }),
      ),
    }),
  );
  face.position.set(0, FLOOR + 1.75, 0.165);
  clock.add(face);
  const pendulum = new THREE.Group();
  pendulum.userData.live = true;
  const rod = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 6)), brass);
  rod.position.y = -0.3;
  pendulum.add(rod);
  const bob = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 20)), brass);
  bob.rotation.x = Math.PI / 2;
  bob.position.y = -0.62;
  pendulum.add(bob);
  pendulum.position.set(0, FLOOR + 1.45, 0.17);
  clock.add(pendulum);
  clock.position.set(W - 0.35, 0, 1.9);
  clock.rotation.y = -Math.PI / 2;
  root.add(clock);

  // Le globe sur son pied
  const globe = new THREE.Group();
  globe.userData.live = true;
  const earth = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.26, 32, 20)),
    std(keep, "#ffffff", 0.45, 0, {
      map: keep(
        canvasTex(512, 256, (g) => {
          g.fillStyle = "#c8b880";
          g.fillRect(0, 0, 512, 256);
          const rnd = seeded(12);
          g.fillStyle = "#8a7a4a";
          for (let k = 0; k < 14; k++) {
            g.beginPath();
            g.ellipse(rnd() * 512, 40 + rnd() * 180, 20 + rnd() * 50, 15 + rnd() * 35, rnd() * 3, 0, Math.PI * 2);
            g.fill();
          }
          g.strokeStyle = "rgba(60,40,20,0.35)";
          for (let k = 0; k < 12; k++) {
            g.beginPath();
            g.moveTo((k * 512) / 12, 0);
            g.lineTo((k * 512) / 12, 256);
            g.stroke();
          }
        }),
      ),
    }),
  );
  globe.add(earth);
  const meridian = new THREE.Mesh(keep(new THREE.TorusGeometry(0.29, 0.008, 6, 40, Math.PI * 1.2)), brass);
  meridian.rotation.z = Math.PI / 2;
  globe.add(meridian);
  globe.position.set(-3.6, FLOOR + 1.15, 2.6);
  root.add(globe);
  const stand = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.18, 0.86, 12)), clockWood);
  stand.position.set(-3.6, FLOOR + 0.43, 2.6);
  root.add(stand);

  // Les fauteuils de lecture et le bureau à la lampe verte
  const leather = phys(keep, { color: "#2a3a22", roughness: 0.5, clearcoat: 0.5, sheen: 0.3 });
  root.add(armchair(keep, leather, -3.0, -2.5, 0.6, !touch));
  root.add(armchair(keep, leather, 3.0, -2.6, -0.6, !touch));
  root.add(roundBlock(1.4, 0.06, 0.7, 0.02, clockWood, -3.2, FLOOR + 0.76, -0.4, keep));
  for (const [dx, dz] of [
    [-0.62, -0.28],
    [0.62, -0.28],
    [-0.62, 0.28],
    [0.62, 0.28],
  ])
    root.add(block(0.06, 0.76, 0.06, clockWood, -3.2 + dx!, FLOOR, -0.4 + dz!, keep));
  const banker = phys(keep, { color: "#0f5a32", roughness: 0.2, clearcoat: 1 });
  const shade = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.16, 0.1, 20, 1, true, 0, Math.PI)), banker);
  shade.rotation.z = Math.PI / 2;
  shade.rotation.y = Math.PI / 2;
  shade.position.set(-3.2, FLOOR + 1.12, -0.4);
  root.add(shade);
  root.add(block(0.02, 0.3, 0.02, brass, -3.2, FLOOR + 0.8, -0.4, keep));
  const deskGlow = new THREE.PointLight("#ffe0a0", 0.8, 2.2, 1.6);
  deskGlow.position.set(-3.2, FLOOR + 1.0, -0.4);
  root.add(deskGlow);
  // Des piles de livres sur le bureau
  const rnd = seeded(5);
  for (let k = 0; k < 5; k++) {
    const b = block(
      0.2 + rnd() * 0.06,
      0.04,
      0.14,
      std(keep, ["#6a1a1a", "#1a3a5a", "#2a4a2a", "#7a5a2a"][k % 4]!, 0.7),
      -3.6 + (k > 2 ? 0.05 : 0),
      FLOOR + 0.79 + (k % 3) * 0.04,
      -0.5,
      keep,
    );
    b.rotation.y = rnd() * 0.3;
    root.add(b);
  }

  const lamp = poolLamp(keep, { kind: "laiton", height: 0.95, ceiling: ceil, color: "#ffdcb0", intensity: 4.0, touch });
  root.add(lamp.group);
  const moonLight = new THREE.PointLight("#9ab0ff", 0.6, 7, 1.5);
  moonLight.position.set(0, FLOOR + 2.0, D - 0.8);
  root.add(moonLight);

  return {
    table: { wood: "noyer", trim: "or", legs: "tournes", leather: "#1e1008" },
    root,
    background: new THREE.Color("#080504"),
    fog: null,
    hemi: ["#ffe6c8", "#2a1408", 0.4],
    env: 0.55,
    exposure: 1.0,
    bloom: [0.4, 0.5, 0.9],
    grade: { warm: 0.07, sat: 1.04, vignette: 0.42 },
    lamps: lamp.lamps,
    intro: { from: new THREE.Vector3(3.6, 1.6, 3.0), look: new THREE.Vector3(-2, 0.8, -D) },
    spots: [
      { x: -3.0, y: FLOOR + 0.48, z: -2.5, yaw: 0.6, sit: true },
      { x: 3.0, y: FLOOR + 0.48, z: -2.6, yaw: -0.6, sit: true },
      { x: -2.7, y: FLOOR, z: 0.6, yaw: 1.7, sit: false },
      { x: 3.5, y: FLOOR, z: 0.4, yaw: -1.6, sit: false },
      { x: 0.8, y: FLOOR, z: 2.9, yaw: 3.1, sit: false },
      { x: -1.2, y: FLOOR, z: 2.9, yaw: 3.1, sit: false },
    ],
    ambience: "horloge",
    update: (t) => {
      pendulum.rotation.z = Math.sin(t * Math.PI) * 0.18;
      globe.rotation.y = t * 0.05;
    },
    dispose,
  };
}
