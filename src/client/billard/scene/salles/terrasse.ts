// La terrasse : un plancher de teck au bord de la mer, au soleil couchant. Une balustrade blanche, la mer qui scintille
// jusqu'à l'horizon, le soleil bas et rouge, des palmiers en silhouette, des voiles au loin, une pergola et ses
// guirlandes de lampions, des transats. La lampe aux abat-jour de verre ambré.

import * as THREE from "three";
import { seeded } from "../textures.ts";
import { bin, block, canvasTex, glow, phys, poolLamp, roundBlock, skyDome, std, type Salle } from "./common.ts";
import { FLOOR, parquet } from "./decor.ts";
import { lampions, palm } from "./decor2.ts";

export function terrasse(touch: boolean): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const W = 5.0,
    D = 3.6;

  // Le ciel du soir, et le soleil bas
  root.add(
    skyDome(keep, [
      [0, "#1c2c5a"],
      [0.3, "#5a4a8a"],
      [0.44, "#e07a5a"],
      [0.5, "#ffb060"],
      [0.52, "#ff9a50"],
      [1, "#0e1a2a"],
    ]),
  );
  const sunMat = glow(keep, "#ffb070", 2.4);
  const sun = new THREE.Mesh(keep(new THREE.CircleGeometry(4, 40)), sunMat);
  sun.position.set(0, 3, -110);
  sun.userData.live = true;
  root.add(sun);
  // La mer : un grand plan, des reflets du soleil qui scintillent
  const seaTex = keep(
    canvasTex(
      512,
      512,
      (g) => {
        g.fillStyle = "#1a2a48";
        g.fillRect(0, 0, 512, 512);
        const rnd = seeded(5);
        for (let k = 0; k < 900; k++) {
          const y = rnd() * 512;
          g.fillStyle = `rgba(${200 + rnd() * 55},${140 + rnd() * 60},${90 + rnd() * 40},${0.15 + rnd() * 0.35})`;
          g.fillRect(rnd() * 512, y, 6 + rnd() * 18, 1.5);
        }
      },
      true,
    ),
  );
  seaTex.repeat.set(30, 30);
  const seaMat = keep(new THREE.MeshBasicMaterial({ map: seaTex, fog: true }));
  const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(400, 400)), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = FLOOR - 3;
  sea.userData.live = true;
  root.add(sea);
  // Le chemin de lumière du soleil sur l'eau
  const path = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(14, 110)),
    keep(
      new THREE.MeshBasicMaterial({
        map: keep(
          canvasTex(64, 256, (g) => {
            const grd = g.createLinearGradient(0, 0, 64, 0);
            grd.addColorStop(0, "rgba(255,170,90,0)");
            grd.addColorStop(0.5, "rgba(255,190,110,0.8)");
            grd.addColorStop(1, "rgba(255,170,90,0)");
            g.fillStyle = grd;
            g.fillRect(0, 0, 64, 256);
          }),
        ),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    ),
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, FLOOR - 2.98, -60);
  path.userData.live = true;
  root.add(path);
  // Des voiliers au loin, des îles
  const sail = std(keep, "#2a2030", 0.9);
  for (const [x, z, s] of [
    [-30, -80, 1.6],
    [22, -95, 1.2],
    [48, -70, 1.0],
  ] as [number, number, number][]) {
    const b = new THREE.Mesh(keep(new THREE.ConeGeometry(0.9 * s, 3 * s, 3)), sail);
    b.position.set(x, FLOOR - 3 + 1.5 * s, z);
    root.add(b);
  }
  const isle = std(keep, "#1a1a2e", 0.9);
  for (const [x, z, sx, sy] of [
    [-70, -120, 30, 6],
    [80, -130, 40, 9],
  ] as [number, number, number, number][]) {
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2)), isle);
    m.scale.set(sx, sy, 8);
    m.position.set(x, FLOOR - 3, z);
    root.add(m);
  }

  // Le plancher de teck, la balustrade blanche
  root.add(parquet(keep, 2 * W, 2 * D, ["#a8784a", "#7a5030"], false, 2.5));
  const white = std(keep, "#f2eee6", 0.6);
  for (const [x0, z0, x1, z1] of [
    [-W, -D, W, -D],
    [W, -D, W, D],
    [-W, D, -W, -D],
  ] as [number, number, number, number][]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const rail = roundBlock(len, 0.08, 0.12, 0.03, white, (x0 + x1) / 2, FLOOR + 0.95, (z0 + z1) / 2, keep);
    rail.rotation.y = yaw;
    root.add(rail);
    const n = Math.round(len / 0.16);
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const baluster = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.035, 0.9, 8)), white);
      baluster.position.set(x0 + (x1 - x0) * u, FLOOR + 0.45, z0 + (z1 - z0) * u);
      root.add(baluster);
    }
  }
  // La maison, derrière : un mur blanc, des portes-fenêtres éclairées
  root.add(block(2 * W, 3.2, 0.2, std(keep, "#efe6d6", 0.85), 0, FLOOR, D + 0.1, keep));
  for (const x of [-3, 0, 3]) root.add(block(1.1, 2.2, 0.02, glow(keep, "#ffcf90", 0.85), x, FLOOR + 0.1, D - 0.01, keep));

  // La pergola : quatre poteaux, des poutres, les guirlandes de lampions
  const wood = phys(keep, { color: "#8a6a4a", roughness: 0.7 });
  const top = FLOOR + 2.9;
  for (const [x, z] of [
    [-3.4, -2.6],
    [3.4, -2.6],
    [-3.4, 2.6],
    [3.4, 2.6],
  ] as [number, number][])
    root.add(block(0.14, 2.9, 0.14, wood, x, FLOOR, z, keep));
  for (const z of [-2.6, 2.6]) root.add(block(7.1, 0.16, 0.12, wood, 0, top, z, keep));
  for (let k = -3; k <= 3; k++) root.add(block(0.08, 0.1, 5.5, wood, k * 1.1, top + 0.16, 0, keep));
  const colors = [0xffb347, 0xff6b6b, 0xfff2a8, 0x7ad9ff, 0xb8ff8a];
  const garland = new THREE.Group();
  garland.add(lampions(new THREE.Vector3(-3.4, top, -2.6), new THREE.Vector3(3.4, top, 2.6), 0.6, colors, keep, 16));
  garland.add(lampions(new THREE.Vector3(3.4, top, -2.6), new THREE.Vector3(-3.4, top, 2.6), 0.6, colors, keep, 16));
  garland.add(lampions(new THREE.Vector3(-3.4, top, -2.6), new THREE.Vector3(3.4, top, -2.6), 0.4, colors, keep, 12));
  garland.add(lampions(new THREE.Vector3(-3.4, top, 2.6), new THREE.Vector3(3.4, top, 2.6), 0.4, colors, keep, 12));
  root.add(garland);

  // Des palmiers à côté, des transats, une glacière
  const trunk = std(keep, "#5a4030", 0.9);
  const leaf = std(keep, "#1e3a22", 0.8, 0, { side: THREE.DoubleSide });
  root.add(palm(keep, -W - 0.8, -D + 0.4, 5.5, 4, trunk, leaf));
  root.add(palm(keep, W + 0.6, -D - 0.2, 6.2, 9, trunk, leaf));
  root.add(palm(keep, W + 1.2, 1.4, 4.8, 13, trunk, leaf));
  const canvasBlue = std(keep, "#2a6aa8", 0.8);
  for (const [x, z, yaw] of [
    [-3.9, 1.2, 1.3],
    [-3.9, -0.4, 1.6],
  ] as [number, number, number][]) {
    const chair = new THREE.Group();
    chair.add(roundBlock(0.55, 0.04, 1.3, 0.02, canvasBlue, 0, FLOOR + 0.3, 0, keep));
    const back = roundBlock(0.55, 0.04, 0.7, 0.02, canvasBlue, 0, FLOOR + 0.55, -0.75, keep);
    back.rotation.x = -0.9;
    chair.add(back);
    for (const sx of [-0.25, 0.25]) chair.add(block(0.04, 0.3, 1.2, wood, sx, FLOOR, 0, keep));
    chair.position.set(x, 0, z);
    chair.rotation.y = yaw;
    root.add(chair);
  }

  const lamp = poolLamp(keep, { kind: "tiffany", height: 0.98, ceiling: top + 0.2, color: "#ffd8a8", intensity: 3.8, touch });
  root.add(lamp.group);
  // Le soleil couchant : une lumière rasante, orange, qui vient de la mer
  const sunLight = new THREE.DirectionalLight("#ff9a5a", 0.75);
  sunLight.position.set(0, 3, -20);
  root.add(sunLight);
  const garlandGlow = new THREE.PointLight("#ffc080", 0.9, 7, 1.5);
  garlandGlow.position.set(0, top - 0.5, 0);
  root.add(garlandGlow);

  const fog = new THREE.Fog("#c87a6a", 40, 160);
  return {
    table: { wood: "teck", trim: "laiton", legs: "tournes", leather: "#3a2410" },
    root,
    background: new THREE.Color("#1c2c5a"),
    fog,
    hemi: ["#ffc8a0", "#3a2a30", 0.55],
    env: 0.7,
    exposure: 1.0,
    bloom: [0.38, 0.5, 0.93],
    grade: { warm: 0.08, sat: 1.1, vignette: 0.32 },
    lamps: lamp.lamps,
    intro: { from: new THREE.Vector3(0.5, 1.4, 3.2), look: new THREE.Vector3(0, 0.6, -40) },
    spots: [
      { x: -3.9, y: FLOOR + 0.35, z: 1.2, yaw: 1.3, sit: true },
      { x: -3.9, y: FLOOR + 0.35, z: -0.4, yaw: 1.6, sit: true },
      { x: 3.4, y: FLOOR, z: -1.0, yaw: -1.6, sit: false },
      { x: 3.4, y: FLOOR, z: 1.0, yaw: -1.6, sit: false },
      { x: 0.8, y: FLOOR, z: 2.8, yaw: 3.1, sit: false },
      { x: -1.0, y: FLOOR, z: -3.0, yaw: 0, sit: false },
    ],
    ambience: "mer",
    update: (t) => {
      seaTex.offset.set(t * 0.002, t * 0.004);
      (path.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.15 * Math.sin(t * 2.3);
    },
    dispose,
  };
}
