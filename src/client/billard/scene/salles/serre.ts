// La serre : une orangerie de fer forgé et de verre, à la tombée de la nuit. Des palmiers en pleine terre, des orangers
// en caisse, des fougères, des lanternes qui pendent, un sol de tomettes, et la pluie fine sur la verrière. Les
// abat-jour de rotin tressé au-dessus de la table.

import * as THREE from "three";
import { seeded } from "../textures.ts";
import { bin, block, canvasTex, glow, phys, poolLamp, roundBlock, std, type Salle } from "./common.ts";
import { FLOOR } from "./decor.ts";
import { floorPlane, palm, pottedPlant, rainTexture, tileTexture } from "./decor2.ts";

export function serre(touch: boolean): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const W = 5.2,
    D = 3.8,
    H = 3.0;
  const ceil = FLOOR + H;

  root.add(floorPlane(keep, 2 * W, 2 * D, tileTexture(keep, "#a8684c", "#8e5440", 8), 1.4, 0.6, 0.2));

  // Le jardin au crépuscule derrière les vitres : un dégradé, des arbres en silhouette
  const dusk = keep(
    canvasTex(2048, 512, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, "#1a2448");
      grd.addColorStop(0.55, "#4a4a70");
      grd.addColorStop(0.8, "#c87a5a");
      grd.addColorStop(1, "#2a2a30");
      g.fillStyle = grd;
      g.fillRect(0, 0, 2048, 512);
      const rnd = seeded(6);
      g.fillStyle = "#14161c";
      for (let k = 0; k < 40; k++) {
        const x = rnd() * 2048,
          r = 30 + rnd() * 60;
        g.beginPath();
        g.arc(x, 420 - rnd() * 40, r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(0, 440, 2048, 72);
    }),
  );
  dusk.wrapS = THREE.RepeatWrapping;
  const outside = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(14, 14, 14, 32, 1, true)),
    keep(new THREE.MeshBasicMaterial({ map: dusk, side: THREE.BackSide, fog: false })),
  );
  outside.position.y = FLOOR + 4;
  outside.userData.live = true;
  root.add(outside);

  // Les murs de verre dans leur fer forgé blanc, la verrière en bâtière
  const iron = std(keep, "#e8e6e0", 0.5, 0.4);
  const glass = phys(keep, { color: "#cfe8e0", roughness: 0.08, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
  const sides: [number, number, number, number][] = [
    [-W, -D, W, -D],
    [W, -D, W, D],
    [W, D, -W, D],
    [-W, D, -W, -D],
  ];
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    const yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(len, H)), glass);
    pane.position.set(cx, FLOOR + H / 2, cz);
    pane.rotation.y = yaw;
    root.add(pane);
    // Le soubassement de briques blanches, les montants, la traverse
    const sb = block(len, 0.5, 0.15, std(keep, "#e0dcd4", 0.8), cx, FLOOR, cz, keep);
    sb.rotation.y = yaw;
    root.add(sb);
    const n = Math.round(len / 0.8);
    for (let k = 0; k <= n; k++) {
      const u = k / n - 0.5;
      const m = block(0.05, H, 0.06, iron, cx + (x1 - x0) * u, FLOOR, cz + (z1 - z0) * u, keep);
      m.rotation.y = yaw;
      root.add(m);
    }
    for (const y of [FLOOR + 0.5, FLOOR + 1.9]) {
      const tr = block(len, 0.05, 0.06, iron, cx, y, cz, keep);
      tr.rotation.y = yaw;
      root.add(tr);
    }
  }
  // La verrière : deux pans inclinés et leurs fers
  const ridge = ceil + 1.3;
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * W, Math.hypot(D, 1.3))), glass);
    roof.position.set(0, (ceil + ridge) / 2, (s * D) / 2);
    roof.rotation.x = -s * (Math.PI / 2 - Math.atan2(D, 1.3));
    roof.rotation.order = "YXZ";
    root.add(roof);
    for (let k = 0; k <= 12; k++) {
      const x = -W + (k * 2 * W) / 12;
      const rafter = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(D, 1.3), 6)), iron);
      rafter.position.set(x, (ceil + ridge) / 2, (s * D) / 2);
      rafter.rotation.x = s * Math.atan2(D, 1.3);
      root.add(rafter);
    }
  }
  root.add(block(2 * W, 0.08, 0.08, iron, 0, ridge - 0.04, 0, keep));
  // La pluie fine sur la verrière
  const rain = rainTexture(keep);
  rain.repeat.set(4, 2);
  const rainMat = keep(new THREE.MeshBasicMaterial({ map: rain, transparent: true, depthWrite: false, opacity: 0.25 }));
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * W, Math.hypot(D, 1.3))), rainMat);
    r.position.set(0, (ceil + ridge) / 2 - 0.02, (s * D) / 2);
    r.rotation.x = -s * (Math.PI / 2 - Math.atan2(D, 1.3));
    r.userData.live = true;
    root.add(r);
  }

  // Les palmiers, les orangers en caisse, les fougères
  const trunk = std(keep, "#6a5038", 0.9);
  const leaf = std(keep, "#2f6a34", 0.7, 0, { side: THREE.DoubleSide });
  const leaf2 = std(keep, "#3e7a3a", 0.7, 0, { side: THREE.DoubleSide });
  root.add(palm(keep, -4.3, -3.0, 3.4, 3, trunk, leaf));
  root.add(palm(keep, 4.4, -3.1, 3.0, 7, trunk, leaf2));
  root.add(palm(keep, 4.3, 3.0, 3.6, 11, trunk, leaf));
  const crate = std(keep, "#5a3a1e", 0.8);
  const orange = std(keep, "#ff8a1a", 0.5, 0, { emissive: new THREE.Color("#4a1a00") });
  const rnd = seeded(9);
  for (const [x, z] of [
    [-4.3, 2.6],
    [-1.8, -3.2],
    [1.8, -3.2],
    [0, 3.2],
  ] as [number, number][]) {
    root.add(block(0.6, 0.55, 0.6, crate, x, FLOOR, z, keep));
    const tree = pottedPlant(keep, x, z, 1.2, crate, leaf2, Math.floor(rnd() * 100));
    tree.position.y = 0.3;
    root.add(tree);
    for (let k = 0; k < 7; k++) {
      const o = new THREE.Mesh(keep(new THREE.SphereGeometry(0.045, 8, 6)), orange);
      o.position.set(x + (rnd() - 0.5) * 0.6, FLOOR + 1.2 + rnd() * 0.8, z + (rnd() - 0.5) * 0.6);
      root.add(o);
    }
  }
  const pot = std(keep, "#a85a3a", 0.85);
  for (const [x, z, sc] of [
    [-2.8, 3.1, 0.9],
    [2.8, 3.2, 1.0],
    [-4.6, -0.4, 0.8],
    [4.6, 0.6, 0.9],
  ] as [number, number, number][])
    root.add(pottedPlant(keep, x, z, sc, pot, leaf, Math.floor(rnd() * 100)));

  // Un banc de fer forgé, une petite table de jardin
  const bench = new THREE.Group();
  bench.add(roundBlock(1.5, 0.06, 0.45, 0.02, iron, 0, FLOOR + 0.44, 0, keep));
  bench.add(roundBlock(1.5, 0.45, 0.04, 0.02, iron, 0, FLOOR + 0.5, -0.22, keep));
  for (const sx of [-0.7, 0.7]) bench.add(block(0.05, 0.44, 0.4, iron, sx, FLOOR, 0, keep));
  bench.position.set(-2.6, 0, -2.9);
  root.add(bench);

  // Des lanternes qui pendent de la verrière
  const lanterns = new THREE.Group();
  lanterns.userData.live = true;
  const lanternGlass = glow(keep, "#ffc878", 1.8);
  const lanternFrame = std(keep, "#2a2a2a", 0.5, 0.6);
  const lpos: [number, number][] = [
    [-3.4, -1.6],
    [3.4, -1.6],
    [-3.4, 1.6],
    [3.4, 1.6],
    [0, -2.8],
    [0, 2.8],
  ];
  for (const [x, z] of lpos) {
    const l = new THREE.Group();
    const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 6)), lanternGlass);
    l.add(body);
    const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(0.12, 0.08, 6)), lanternFrame);
    cap.position.y = 0.15;
    l.add(cap);
    const chain = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, 1.0, 4)), lanternFrame);
    chain.position.y = 0.68;
    l.add(chain);
    l.position.set(x, ceil - 0.6, z);
    body.userData.reflect = true;
    lanterns.add(l);
  }
  root.add(lanterns);
  const lanternLights = [new THREE.PointLight("#ffb860", 1.1, 5, 1.6), new THREE.PointLight("#ffb860", 1.1, 5, 1.6)];
  lanternLights[0]!.position.set(-3.4, ceil - 0.7, 0);
  lanternLights[1]!.position.set(3.4, ceil - 0.7, 0);
  root.add(...lanternLights);

  const lamp = poolLamp(keep, { kind: "rotin", height: 0.98, ceiling: ceil + 0.6, color: "#ffdcb0", intensity: 4.2, touch });
  root.add(lamp.group);
  const sky = new THREE.HemisphereLight("#8a90c8", "#3a2418", 0.35);
  root.add(sky);

  return {
    table: { wood: "teck", trim: "cuivre", legs: "tournes", leather: "#3a2410" },
    root,
    background: new THREE.Color("#141a30"),
    fog: null,
    hemi: ["#ffe0c0", "#2a2418", 0.4],
    env: 0.6,
    exposure: 1.0,
    bloom: [0.45, 0.5, 0.9],
    grade: { warm: 0.06, sat: 1.08, vignette: 0.38 },
    lamps: lamp.lamps,
    intro: { from: new THREE.Vector3(-4.0, 2.6, 2.8), look: new THREE.Vector3(3, 2.5, -3) },
    spots: [
      { x: -2.9, y: FLOOR + 0.48, z: -2.9, yaw: 0, sit: true },
      { x: -2.3, y: FLOOR + 0.48, z: -2.9, yaw: 0, sit: true },
      { x: 3.6, y: FLOOR, z: -0.8, yaw: -1.6, sit: false },
      { x: -3.6, y: FLOOR, z: 1.2, yaw: 1.6, sit: false },
      { x: 1.0, y: FLOOR, z: 2.6, yaw: 3.1, sit: false },
      { x: -1.2, y: FLOOR, z: 2.6, yaw: 3.1, sit: false },
    ],
    ambience: "jardin",
    update: (t) => {
      rain.offset.y = -t * 0.12;
      lanterns.children.forEach((l, i) => (l.rotation.z = Math.sin(t * 0.8 + i) * 0.03));
    },
    dispose,
  };
}
