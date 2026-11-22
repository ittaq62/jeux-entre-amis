// Le bar à néons : des murs de briques, un damier noir et blanc usé, le comptoir et ses bouteilles éclairées par
// derrière, les tabourets chromés, le juke-box qui luit, une cible de fléchettes, des enseignes au néon (dont une qui
// grésille), et la grande vitrine sur la rue où la pluie ruisselle. Les abat-jour de tôle émaillée, verts.

import * as THREE from "three";
import { bin, block, glow, glowSign, neon, phys, poolLamp, roundBlock, std, type Salle } from "./common.ts";
import { cueRack, FLOOR, wall } from "./decor.ts";
import { bottleShelves, brickTexture, floorPlane, rainTexture, stool, streetTexture, tileTexture, windowPane } from "./decor2.ts";

export function bar(touch: boolean): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const W = 4.4,
    D = 3.4,
    H = 3.2;
  const ceil = FLOOR + H;

  root.add(floorPlane(keep, 2 * W, 2 * D, tileTexture(keep, "#cfc6b4", "#232327", 8), 2.4, 0.35, 0.5));

  // Les murs : briques au fond et à gauche, briques peintes en sombre ailleurs
  const brick = brickTexture(keep, "#8a3a26", "#c8b8a0", 4);
  brick.repeat.set(5, 2);
  const brickMat = std(keep, "#ffffff", 0.85, 0, { map: brick });
  const darkBrick = brick.clone();
  keep(darkBrick);
  darkBrick.repeat.set(5, 2);
  darkBrick.needsUpdate = true;
  const paintMat = std(keep, "#3a3a46", 0.9, 0, { map: darkBrick });
  root.add(wall(keep, brickMat, -W, -D, W, -D, H));
  root.add(wall(keep, brickMat, -W, D, -W, -D, H));
  root.add(wall(keep, paintMat, W, -D, W, D, H));
  // Le mur de la vitrine : un soubassement, la vitrine, un linteau
  const front = std(keep, "#1c1c22", 0.6);
  root.add(wall(keep, front, W, D, -W, D, 0.9));
  root.add(wall(keep, front, W, D, -W, D, 0.5, ceil - 0.5));
  const street = new THREE.MeshBasicMaterial({ map: streetTexture(keep) });
  keep(street);
  const frameMat = std(keep, "#0e0e12", 0.4, 0.6);
  root.add(windowPane(keep, 7.6, H - 1.4, 4, 2, frameMat, street, 0, FLOOR + 0.9 + (H - 1.4) / 2, D - 0.04, Math.PI));
  // La pluie qui ruisselle sur la vitre
  const rain = rainTexture(keep);
  rain.repeat.set(6, 2);
  const rainMat = keep(new THREE.MeshBasicMaterial({ map: rain, transparent: true, depthWrite: false, opacity: 0.45 }));
  const rainPane = new THREE.Mesh(keep(new THREE.PlaneGeometry(7.6, H - 1.4)), rainMat);
  rainPane.position.set(0, FLOOR + 0.9 + (H - 1.4) / 2, D - 0.08);
  rainPane.rotation.y = Math.PI;
  rainPane.userData.live = true;
  root.add(rainPane);
  // « Ouvert » au néon dans la vitrine, tourné vers la rue (on le lit à l'envers)
  const open = glowSign("Ouvert", "#ff3b3b", '"Great Vibes", cursive', 0.4, keep);
  open.position.set(2.6, FLOOR + 2.2, D - 0.12);
  root.add(open);

  // Le plafond : des tuyaux, des poutres de métal
  const ceiling = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * W, 2 * D)), std(keep, "#1a1a20", 0.9));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ceil;
  root.add(ceiling);
  const steel = std(keep, "#2a2c30", 0.5, 0.7);
  for (const z of [-1.6, 0, 1.6]) root.add(block(2 * W, 0.2, 0.12, steel, 0, ceil - 0.2, z, keep));
  const pipe = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.05, 2 * D, 10)), std(keep, "#6a5a48", 0.4, 0.8));
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(-W + 0.4, ceil - 0.35, 0);
  root.add(pipe);

  // Le comptoir à droite, ses bouteilles, ses tabourets
  const counterWood = phys(keep, { color: "#3a1c10", roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  root.add(roundBlock(0.7, 1.05, 4.6, 0.04, counterWood, W - 1.35, FLOOR, -0.3, keep));
  root.add(
    roundBlock(0.85, 0.06, 4.8, 0.03, phys(keep, { color: "#1a0c06", roughness: 0.15, clearcoat: 1 }), W - 1.35, FLOOR + 1.05, -0.3, keep),
  );
  const brass = std(keep, "#b8913c", 0.3, 1);
  const rail = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02, 0.02, 4.6, 8)), brass);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(W - 1.75, FLOOR + 0.2, -0.3);
  root.add(rail);
  root.add(bottleShelves(keep, 4.2, W - 0.12, -0.3, -Math.PI / 2, 3));
  const seat = phys(keep, { color: "#8a1a22", roughness: 0.45, clearcoat: 0.6 });
  const chrome = std(keep, "#c8ccd0", 0.2, 1);
  for (const z of [-2.0, -1.0, 0.0, 1.0]) root.add(stool(keep, W - 1.95, z, seat, chrome));
  const barSign = glowSign("Bar", "#38e0ff", '"Big Shoulders Display Variable", sans-serif', 0.5, keep);
  barSign.position.set(W - 0.06, FLOOR + 2.55, -0.3);
  barSign.rotation.y = -Math.PI / 2;
  root.add(barSign);

  // « Billard » au néon sur les briques du fond, et une flèche qui grésille
  const sign = glowSign("Billard", "#ff4fa3", '"Great Vibes", cursive', 0.8, keep);
  sign.position.set(-0.6, FLOOR + 2.3, -D + 0.05);
  root.add(sign);
  const arrow = neon(
    [
      new THREE.Vector3(1.3, FLOOR + 2.15, -D + 0.06),
      new THREE.Vector3(2.4, FLOOR + 2.15, -D + 0.06),
      new THREE.Vector3(2.15, FLOOR + 2.35, -D + 0.06),
    ],
    "#ffd24a",
    keep,
    0.012,
  );
  arrow.userData.live = true;
  root.add(arrow);

  // Le juke-box, contre le mur de gauche
  const jx = -W + 0.45,
    jz = -1.4;
  const juke = new THREE.Group();
  juke.add(roundBlock(0.75, 1.15, 0.55, 0.06, phys(keep, { color: "#5a1a10", roughness: 0.3, clearcoat: 1 }), 0, FLOOR, 0, keep));
  const arch = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.375, 0.375, 0.55, 24, 1, false, -Math.PI / 2, Math.PI)),
    phys(keep, { color: "#5a1a10", roughness: 0.3, clearcoat: 1 }),
  );
  arch.rotation.x = Math.PI / 2;
  arch.position.set(0, FLOOR + 1.15, 0);
  juke.add(arch);
  for (const [r, c] of [
    [0.33, "#ff7a1a"],
    [0.28, "#ffd24a"],
    [0.23, "#38e0ff"],
  ] as [number, string][]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI * (i / 16);
      pts.push(new THREE.Vector3(Math.cos(a) * r, FLOOR + 1.15 + Math.sin(a) * r, 0.29));
    }
    pts.unshift(new THREE.Vector3(r, FLOOR + 0.25, 0.29));
    pts.push(new THREE.Vector3(-r, FLOOR + 0.25, 0.29));
    const tube = neon(pts, c, keep, 0.012);
    (tube.material as THREE.MeshBasicMaterial).color.multiplyScalar(0.55);
    juke.add(tube);
  }
  juke.add(block(0.4, 0.3, 0.02, glow(keep, "#ffe2a8", 0.9), 0, FLOOR + 0.62, 0.28, keep));
  juke.position.set(jx, 0, jz);
  juke.rotation.y = Math.PI / 2;
  root.add(juke);

  // La cible de fléchettes, le râtelier
  const board = new THREE.Group();
  const rings: [number, string][] = [
    [0.23, "#1a1a1a"],
    [0.2, "#e8dcc0"],
    [0.15, "#1a6a3a"],
    [0.1, "#e8dcc0"],
    [0.05, "#c82a2a"],
    [0.02, "#1a6a3a"],
  ];
  rings.forEach(([r, c], i) => {
    const d = new THREE.Mesh(keep(new THREE.CylinderGeometry(r, r, 0.03 + i * 0.002, 24)), std(keep, c, 0.8));
    d.rotation.x = Math.PI / 2;
    board.add(d);
  });
  board.position.set(-2.4, FLOOR + 1.75, -D + 0.04);
  root.add(board);
  root.add(cueRack(keep, std(keep, "#2a1a10", 0.5), -W + 0.05, 1.2, Math.PI / 2, 7));

  // Une petite table haute et deux tabourets près de la vitrine
  root.add(roundBlock(0.6, 0.05, 0.6, 0.02, counterWood, -2.4, FLOOR + 1.0, 2.2, keep));
  root.add(block(0.06, 1.0, 0.06, chrome, -2.4, FLOOR, 2.2, keep));
  for (const x of [-2.95, -1.85]) root.add(stool(keep, x, 2.2, seat, chrome));

  const lamp = poolLamp(keep, { kind: "metal", height: 0.95, ceiling: ceil, color: "#ffe6c0", intensity: 3.6, touch });
  root.add(lamp.group);
  // Les lueurs colorées des néons, la lumière chaude du comptoir
  const pink = new THREE.PointLight("#ff4fa3", 1.6, 5, 1.6);
  pink.position.set(-0.6, FLOOR + 2.1, -D + 0.6);
  const cyan = new THREE.PointLight("#38e0ff", 1.2, 5, 1.6);
  cyan.position.set(W - 0.8, FLOOR + 2.3, -0.3);
  const warm = new THREE.PointLight("#ffb070", 1.4, 6, 1.6);
  warm.position.set(W - 0.6, FLOOR + 1.3, -0.3);
  root.add(pink, cyan, warm);

  const signMat = sign.material as THREE.MeshBasicMaterial;
  const arrowMat = arrow.material as THREE.MeshBasicMaterial;
  const arrowColor = arrowMat.color.clone();
  return {
    table: { wood: "laque", trim: "chrome", legs: "massifs", leather: "#141416" },
    root,
    background: new THREE.Color("#07070a"),
    fog: null,
    hemi: ["#d8d0ff", "#2a1a20", 0.45],
    env: 0.6,
    exposure: 0.95,
    bloom: [0.55, 0.5, 0.9],
    grade: { warm: 0.0, sat: 1.12, vignette: 0.45 },
    lamps: lamp.lamps,
    intro: { from: new THREE.Vector3(2.6, 1.0, 2.6), look: new THREE.Vector3(-0.6, 0.6, -D) },
    spots: [
      { x: W - 1.95, y: FLOOR + 0.78, z: -2.0, yaw: -1.57, sit: true },
      { x: W - 1.95, y: FLOOR + 0.78, z: -1.0, yaw: -1.57, sit: true },
      { x: W - 1.95, y: FLOOR + 0.78, z: 0.0, yaw: -1.57, sit: true },
      { x: -2.95, y: FLOOR + 0.78, z: 2.2, yaw: 3.1, sit: true },
      { x: -1.85, y: FLOOR + 0.78, z: 2.2, yaw: 3.1, sit: true },
      { x: -3.4, y: FLOOR, z: -0.2, yaw: 1.6, sit: false },
      { x: 0.8, y: FLOOR, z: -2.6, yaw: 0, sit: false },
    ],
    ambience: "pluie",
    update: (t) => {
      rain.offset.y = -t * 0.22;
      // L'enseigne qui respire, la flèche qui grésille de temps en temps
      signMat.color.setScalar(1.6 + 0.2 * Math.sin(t * 2.1));
      const flick = Math.sin(t * 37) > 0.6 && Math.sin(t * 0.7) > 0.85;
      arrowMat.color.copy(arrowColor).multiplyScalar(flick ? 0.25 : 1);
    },
    dispose,
  };
}
