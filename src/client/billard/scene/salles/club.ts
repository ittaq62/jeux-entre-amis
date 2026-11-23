// Le club anglais : des boiseries d'acajou à hauteur d'appui, un papier peint damassé vert bouteille, des tableaux dans
// leurs cadres dorés, la cheminée de marbre où le feu crépite, deux fauteuils de cuir capitonnés, le râtelier des queues,
// un tapis d'Orient sous la table, un plafond à caissons. La lampe aux abat-jour de verre vert, très bas.

import * as THREE from "three";
import { bin, block, canvasTex, glow, phys, poolLamp, roundBlock, std, type Salle } from "./common.ts";
import { armchair, cueRack, damask, fire, FLOOR, painting, parquet, rug, scoreBeads, wall } from "./decor.ts";

export function club(touch: boolean): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const W = 4.6,
    D = 3.6,
    H = 3.0;
  const ceil = FLOOR + H;

  root.add(parquet(keep, 2 * W, 2 * D, ["#6a3a1e", "#3e2010"], true, 3));
  root.add(rug(keep, 4.2, 2.9, ["#5a1418", "#c8a050", "#1a2a48"]));

  // Les murs : en bas, les boiseries ; en haut, le damas vert
  const paper = damask(keep, "#123522", "#1d4a30", 1);
  paper.repeat.set(8, 2);
  const paperMat = std(keep, "#ffffff", 0.85, 0, { map: paper });
  const panelWood = phys(keep, { color: "#4a1e10", roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const molding = phys(keep, { color: "#2e1208", roughness: 0.4, clearcoat: 0.7 });
  const walls: [number, number, number, number][] = [
    [-W, -D, W, -D],
    [W, -D, W, D],
    [W, D, -W, D],
    [-W, D, -W, -D],
  ];
  for (const [x0, z0, x1, z1] of walls) {
    root.add(wall(keep, paperMat, x0, z0, x1, z1, H - 1.1, FLOOR + 1.1));
    root.add(wall(keep, panelWood, x0, z0, x1, z1, 1.1));
  }
  // La cimaise et la plinthe, et des panneaux moulurés dans les boiseries
  for (const [x0, z0, x1, z1] of walls) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    const yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const nx = -Math.sin(yaw + Math.PI),
      nz = -Math.cos(yaw + Math.PI);
    for (const [y, h, dd] of [
      [FLOOR + 1.08, 0.06, 0.05],
      [FLOOR, 0.16, 0.03],
      [ceil - 0.18, 0.18, 0.08],
    ] as [number, number, number][]) {
      const m = block(len, h, dd, molding, 0, y, 0, keep);
      m.position.x = cx + nx * dd * 0.5;
      m.position.z = cz + nz * dd * 0.5;
      m.rotation.y = yaw;
      root.add(m);
    }
    const n = Math.floor(len / 1.1);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n - 0.5;
      const px = cx + (x1 - x0) * u + nx * 0.012,
        pz = cz + (z1 - z0) * u + nz * 0.012;
      const p = roundBlock(len / n - 0.22, 0.6, 0.025, 0.01, molding, px, FLOOR + 0.3, pz, keep);
      p.rotation.y = yaw;
      root.add(p);
    }
  }
  // Le plafond à caissons
  const ceilMat = std(keep, "#2a160c", 0.7);
  const ceiling = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * W, 2 * D)), std(keep, "#3a2416", 0.8));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ceil;
  root.add(ceiling);
  for (let i = -3; i <= 3; i++) root.add(block(0.14, 0.16, 2 * D, ceilMat, (i * W) / 3.5, ceil - 0.16, 0, keep));
  for (let j = -2; j <= 2; j++) root.add(block(2 * W, 0.16, 0.14, ceilMat, 0, ceil - 0.16, (j * D) / 2.4, keep));

  // La cheminée, au fond (côté −z)
  const marble = phys(keep, { color: "#d8d2c4", roughness: 0.25, clearcoat: 0.5 });
  const fx = 0,
    fz = -D + 0.25;
  root.add(roundBlock(1.9, 1.25, 0.36, 0.02, marble, fx, FLOOR, fz, keep));
  root.add(roundBlock(2.15, 0.09, 0.48, 0.02, marble, fx, FLOOR + 1.25, fz + 0.04, keep));
  root.add(block(1.05, 0.78, 0.38, std(keep, "#0c0806", 0.9), fx, FLOOR, fz + 0.01, keep));
  const fireplace = fire(keep, fx, fz + 0.12, 0);
  root.add(fireplace.group);
  // Au-dessus de la cheminée, un grand tableau ; sur la tablette, une pendule et deux chandeliers
  const big = painting(keep, 1.3, 0.85, 3, ["#5a6a7a", "#3a4a2a", "#1a2a14", "#c8b080"]);
  big.position.set(fx, FLOOR + 1.95, -D + 0.03);
  root.add(big);
  const brass = std(keep, "#b8913c", 0.3, 1);
  root.add(roundBlock(0.26, 0.3, 0.12, 0.04, std(keep, "#1a0e08", 0.4), fx, FLOOR + 1.34, fz + 0.06, keep));
  for (const sx of [-0.75, 0.75]) {
    const stick = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.03, 0.26, 10)), brass);
    stick.position.set(fx + sx, FLOOR + 1.47, fz + 0.06);
    root.add(stick);
    const flame = new THREE.Mesh(keep(new THREE.SphereGeometry(0.012, 8, 6)), glow(keep, "#ffc070", 3));
    flame.scale.set(1, 1.8, 1);
    flame.position.set(fx + sx, FLOOR + 1.63, fz + 0.06);
    flame.userData.reflect = true;
    root.add(flame);
  }

  // Les tableaux des autres murs
  const pals: [string, string, string, string][] = [
    ["#6a7a8a", "#4a5a2a", "#22301a", "#d8c090"],
    ["#8a6a4a", "#5a4a2a", "#2a1a0a", "#e8c080"],
    ["#4a5a6a", "#3a3a2a", "#1a1a12", "#b8a888"],
  ];
  for (const [i, [x, z, yaw]] of (
    [
      [-W + 0.02, -1.2, Math.PI / 2],
      [-W + 0.02, 1.2, Math.PI / 2],
      [W - 0.02, -1.2, -Math.PI / 2],
      [W - 0.02, 1.2, -Math.PI / 2],
    ] as [number, number, number][]
  ).entries()) {
    const p = painting(keep, 0.8, 0.6, 10 + i, pals[i % pals.length]!);
    p.position.set(x, FLOOR + 1.85, z);
    p.rotation.y = yaw;
    root.add(p);
  }

  // Les fauteuils près du feu, le guéridon et sa carafe
  const leather = phys(keep, {
    color: "#4a160e",
    roughness: 0.45,
    clearcoat: 0.6,
    clearcoatRoughness: 0.35,
    sheen: 0.3,
    sheenColor: new THREE.Color("#8a4a30"),
  });
  root.add(armchair(keep, leather, -1.75, -2.35, 0.5, !touch));
  root.add(armchair(keep, leather, 1.75, -2.35, -0.5, !touch));
  const darkWood = phys(keep, { color: "#2a1208", roughness: 0.35, clearcoat: 0.9 });
  const table = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 28)), darkWood);
  table.position.set(-2.6, FLOOR + 0.6, -1.95);
  root.add(table);
  root.add(block(0.06, 0.6, 0.06, darkWood, -2.6, FLOOR, -1.95, keep));
  const glass = phys(keep, { color: "#e8f0f0", roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1 });
  const decanter = new THREE.Mesh(
    keep(
      new THREE.LatheGeometry(
        [0.001, 0.07, 0.075, 0.06, 0.025, 0.025, 0.035].map((r, i) => new THREE.Vector2(r, i * 0.045)),
        18,
      ),
    ),
    glass,
  );
  decanter.position.set(-2.6, FLOOR + 0.615, -1.95);
  root.add(decanter);
  const whisky = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.066, 0.07, 0.07, 18)),
    phys(keep, { color: "#b8641a", roughness: 0.1, transparent: true, opacity: 0.75 }),
  );
  whisky.position.set(-2.6, FLOOR + 0.655, -1.95);
  root.add(whisky);

  // Le râtelier, le boulier des scores
  root.add(cueRack(keep, darkWood, W - 0.06, 0.2, -Math.PI / 2));
  root.add(scoreBeads(keep, W - 0.05, FLOOR + 2.0, 0.2, -Math.PI / 2));

  // Les fenêtres du mur d'en face, la nuit, et leurs lourds rideaux de velours
  const night = keep(
    canvasTex(128, 256, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, "#0a1426");
      grd.addColorStop(1, "#1a2a40");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = "#e8eef8";
      g.beginPath();
      g.arc(84, 52, 12, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#1a0e08";
      g.lineWidth = 6;
      g.strokeRect(3, 3, 122, 250);
      g.beginPath();
      g.moveTo(64, 0);
      g.lineTo(64, 256);
      g.moveTo(0, 90);
      g.lineTo(128, 90);
      g.moveTo(0, 170);
      g.lineTo(128, 170);
      g.stroke();
    }),
  );
  const velvet = phys(keep, { color: "#5a0e14", roughness: 0.8, sheen: 1, sheenColor: new THREE.Color("#c84050"), sheenRoughness: 0.5 });
  const curtainGeo = keep(new THREE.PlaneGeometry(0.55, H - 0.3, 24, 1));
  {
    const p = curtainGeo.attributes.position!;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 36) * 0.035);
    curtainGeo.computeVertexNormals();
  }
  for (const x of [-2.4, 2.4]) {
    const win = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.9, 1.7)), keep(new THREE.MeshBasicMaterial({ map: night })));
    win.position.set(x, FLOOR + 1.6, D - 0.02);
    win.rotation.y = Math.PI;
    root.add(win);
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(curtainGeo, velvet);
      c.position.set(x + s * 0.62, FLOOR + (H - 0.3) / 2 + 0.05, D - 0.08);
      c.rotation.y = Math.PI;
      root.add(c);
    }
    root.add(roundBlock(1.9, 0.08, 0.08, 0.03, brass, x, ceil - 0.32, D - 0.1, keep));
  }

  // Des appliques entre les fenêtres
  for (const x of [-W / 2 - 1.1, 0, W / 2 + 1.1]) {
    const sconce = new THREE.Mesh(keep(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), glow(keep, "#ffcf8a", 2.1));
    sconce.position.set(x, FLOOR + 1.9, D - 0.06);
    sconce.rotation.x = Math.PI;
    sconce.userData.reflect = true;
    root.add(sconce);
  }

  const lamp = poolLamp(keep, { kind: "vert", height: 0.92, ceiling: ceil, color: "#ffd9a8", intensity: 4.2, touch });
  root.add(lamp.group);
  // Une faible lueur chaude du côté des fenêtres
  const fill = new THREE.PointLight("#ffb070", 2.2, 8, 1.5);
  fill.position.set(0, FLOOR + 2.2, D - 0.6);
  root.add(fill);

  return {
    table: { wood: "acajou", trim: "laiton", legs: "tournes", leather: "#2a140c" },
    root,
    background: new THREE.Color("#0a0604"),
    fog: null,
    hemi: ["#ffe2c0", "#2a1408", 0.42],
    env: 0.55,
    exposure: 1.0,
    bloom: [0.38, 0.3, 1.2],
    grade: { warm: 0.06, sat: 1.06, vignette: 0.42 },
    lamps: lamp.lamps,
    intro: { from: new THREE.Vector3(-3.6, 1.2, -2.6), look: new THREE.Vector3(0, -0.2, 0) },
    spots: [
      { x: -1.75, y: FLOOR + 0.48, z: -2.35, yaw: 0.5, sit: true },
      { x: 1.75, y: FLOOR + 0.48, z: -2.35, yaw: -0.5, sit: true },
      { x: -2.8, y: FLOOR, z: 1.6, yaw: 2.3, sit: false },
      { x: 2.9, y: FLOOR, z: 1.5, yaw: -2.3, sit: false },
      { x: 3.6, y: FLOOR, z: -0.8, yaw: -1.6, sit: false },
      { x: -3.6, y: FLOOR, z: 0.2, yaw: 1.6, sit: false },
      { x: 0.6, y: FLOOR, z: 2.6, yaw: 3.1, sit: false },
    ],
    ambience: "feu",
    update: (t) => fireplace.update(t),
    dispose,
  };
}
