// Le loft : sur les toits, une grande verrière d'usine (des carreaux dans un quadrillage d'acier) sur la ville allumée,
// un mur de briques, du béton ciré, des poutres métalliques, un canapé de cuir, des plantes, une guirlande d'ampoules à
// filament. Les abat-jour industriels, noirs, laissent tomber une lumière franche.

import * as THREE from "three";
import { bin, block, glow, phys, poolLamp, roundBlock, std, type Salle } from "./common.ts";
import { cueRack, FLOOR, rug, wall } from "./decor.ts";
import { brickTexture, concreteTexture, floorPlane, pottedPlant, skylineTexture, windowPane } from "./decor2.ts";

export function loft(touch: boolean): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const W = 5.0,
    D = 3.8,
    H = 4.0;
  const ceil = FLOOR + H;

  root.add(floorPlane(keep, 2 * W, 2 * D, concreteTexture(keep, "#8a8680", 5), 3, 0.35, 0.6));
  root.add(rug(keep, 4.0, 2.8, ["#3a3a3e", "#c8c0b0", "#8a4a2a"]));

  const brick = brickTexture(keep, "#9a4a32", "#d0c4b0", 7);
  brick.repeat.set(6, 3);
  const brickMat = std(keep, "#ffffff", 0.85, 0, { map: brick });
  const concrete = concreteTexture(keep, "#6a6862", 11);
  concrete.repeat.set(3, 2);
  const concMat = std(keep, "#ffffff", 0.9, 0, { map: concrete });
  root.add(wall(keep, brickMat, -W, -D, W, -D, H));
  root.add(wall(keep, concMat, -W, D, -W, -D, H));
  // La verrière : tout le mur d'en face et celui de droite donnent sur la ville
  const city = new THREE.MeshBasicMaterial({ map: skylineTexture(keep, 4) });
  keep(city);
  const city2 = new THREE.MeshBasicMaterial({ map: skylineTexture(keep, 9) });
  keep(city2);
  const steel = std(keep, "#1c1e22", 0.45, 0.8);
  root.add(wall(keep, steel, W, D, -W, D, 0.5));
  root.add(windowPane(keep, 2 * W - 0.2, H - 0.7, 10, 4, steel, city, 0, FLOOR + 0.5 + (H - 0.7) / 2, D - 0.04, Math.PI));
  root.add(wall(keep, steel, W, -D, W, D, 0.5));
  root.add(windowPane(keep, 2 * D - 0.2, H - 0.7, 8, 4, steel, city2, W - 0.04, FLOOR + 0.5 + (H - 0.7) / 2, 0, -Math.PI / 2));

  // Le plafond : des poutres en I, un toit de tôle
  const ceiling = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * W, 2 * D)), std(keep, "#2a2c30", 0.8, 0.3));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ceil;
  root.add(ceiling);
  for (const x of [-3.2, -1.1, 1.1, 3.2]) {
    root.add(block(0.08, 0.35, 2 * D, steel, x, ceil - 0.35, 0, keep));
    root.add(block(0.22, 0.03, 2 * D, steel, x, ceil - 0.35, 0, keep));
  }
  // Des poteaux d'acier rivetés
  for (const [x, z] of [
    [-3.2, -1.8],
    [3.2, -1.8],
  ] as [number, number][])
    root.add(block(0.2, H, 0.2, steel, x, FLOOR, z, keep));

  // Le coin salon : un canapé de cuir, une table basse, des plantes
  const leather = phys(keep, { color: "#6a3a1c", roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.4 });
  const sofa = new THREE.Group();
  sofa.add(roundBlock(2.2, 0.42, 0.9, 0.1, leather, 0, FLOOR + 0.08, 0, keep));
  sofa.add(roundBlock(2.2, 0.5, 0.22, 0.1, leather, 0, FLOOR + 0.4, -0.38, keep));
  for (const sx of [-1, 1]) sofa.add(roundBlock(0.22, 0.32, 0.9, 0.1, leather, sx * 1.0, FLOOR + 0.4, 0, keep));
  for (const sx of [-0.5, 0.5]) sofa.add(roundBlock(1.0, 0.14, 0.7, 0.07, leather, sx, FLOOR + 0.5, 0.08, keep));
  sofa.position.set(-2.4, 0, -2.9);
  root.add(sofa);
  const oak = phys(keep, { color: "#7a5a3a", roughness: 0.5, clearcoat: 0.4 });
  root.add(roundBlock(1.1, 0.06, 0.55, 0.02, oak, -2.4, FLOOR + 0.4, -1.9, keep));
  for (const [dx, dz] of [
    [-0.48, -0.22],
    [0.48, -0.22],
    [-0.48, 0.22],
    [0.48, 0.22],
  ])
    root.add(block(0.04, 0.4, 0.04, steel, -2.4 + dx!, FLOOR, -1.9 + dz!, keep));
  const pot = std(keep, "#d8d4cc", 0.7);
  const leaves = std(keep, "#2a5a2a", 0.75);
  root.add(pottedPlant(keep, -4.4, -3.2, 1.3, pot, leaves, 3));
  root.add(pottedPlant(keep, 4.3, 3.1, 1.6, pot, leaves, 8));
  root.add(pottedPlant(keep, -4.3, 3.1, 1.1, pot, leaves, 13));
  root.add(cueRack(keep, oak, -W + 0.05, 0.3, Math.PI / 2));

  // Une guirlande d'ampoules à filament, d'un mur à l'autre
  const bulbs = new THREE.Group();
  const bulbMat = glow(keep, "#ffb860", 2.2);
  const bulbGeo = keep(new THREE.SphereGeometry(0.04, 10, 8));
  const wire = std(keep, "#111111", 0.8);
  for (const z of [-2.6, 2.6]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      pts.push(new THREE.Vector3(-W + u * 2 * W, ceil - 0.7 - Math.sin(u * Math.PI) * 0.5, z));
    }
    bulbs.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.005, 4)), wire));
    for (let i = 1; i < 12; i++) {
      const u = i / 12;
      const b = new THREE.Mesh(bulbGeo, bulbMat);
      b.position.set(-W + u * 2 * W, ceil - 0.78 - Math.sin(u * Math.PI) * 0.5, z);
      b.scale.set(1, 1.4, 1);
      b.userData.reflect = true;
      bulbs.add(b);
    }
  }
  root.add(bulbs);

  const lamp = poolLamp(keep, { kind: "metal", height: 1.0, ceiling: ceil - 0.35, color: "#fff0d8", intensity: 4.0, touch });
  root.add(lamp.group);
  // La lueur bleutée de la ville, la chaleur des ampoules
  const cityGlow = new THREE.PointLight("#7a90ff", 1.0, 9, 1.4);
  cityGlow.position.set(2.5, FLOOR + 2.2, 2.6);
  const warm = new THREE.PointLight("#ffb060", 1.2, 8, 1.6);
  warm.position.set(0, ceil - 1.0, 0);
  root.add(cityGlow, warm);

  return {
    table: { wood: "chene", trim: "noir", legs: "massifs", leather: "#1a1a1a" },
    root,
    background: new THREE.Color("#05060c"),
    fog: null,
    hemi: ["#c8d0ff", "#2a2420", 0.5],
    env: 0.6,
    exposure: 1.0,
    bloom: [0.45, 0.3, 1.1],
    grade: { warm: 0.01, sat: 1.06, vignette: 0.38 },
    lamps: lamp.lamps,
    intro: { from: new THREE.Vector3(-3.8, 1.5, 3.0), look: new THREE.Vector3(2, 1.2, 3.8) },
    spots: [
      { x: -2.8, y: FLOOR + 0.5, z: -2.85, yaw: 0, sit: true },
      { x: -2.0, y: FLOOR + 0.5, z: -2.85, yaw: 0, sit: true },
      { x: 3.4, y: FLOOR, z: 0.2, yaw: -1.6, sit: false },
      { x: -3.6, y: FLOOR, z: 1.2, yaw: 1.7, sit: false },
      { x: 1.2, y: FLOOR, z: 2.8, yaw: 3.1, sit: false },
      { x: -0.8, y: FLOOR, z: 2.9, yaw: 3.1, sit: false },
    ],
    ambience: "ville",
    dispose,
  };
}
