// Le wagon-salon : le salon d'un train de nuit. Des panneaux de marqueterie, un plafond en voûte, des porte-bagages de
// laiton, des fauteuils de velours, un tapis tout du long, et des deux côtés les fenêtres où le paysage défile : la lune,
// les montagnes au loin, les sapins et les poteaux tout près, plus vite. La lampe balance doucement avec le train.

import * as THREE from "three";
import { seeded } from "../textures.ts";
import { bin, block, canvasTex, glow, phys, poolLamp, roundBlock, std, type Salle } from "./common.ts";
import { armchair, FLOOR, rug } from "./decor.ts";

/** Le paysage de nuit au loin : un ciel étoilé, la lune, des crêtes de montagnes, quelques lumières de village */
function farLandscape(keep: <T extends { dispose: () => void }>(x: T) => T, seed: number): THREE.CanvasTexture {
  const t = keep(
    canvasTex(
      2048,
      512,
      (g) => {
        const grd = g.createLinearGradient(0, 0, 0, 512);
        grd.addColorStop(0, "#050a1c");
        grd.addColorStop(0.6, "#152040");
        grd.addColorStop(1, "#1a2238");
        g.fillStyle = grd;
        g.fillRect(0, 0, 2048, 512);
        const rnd = seeded(seed);
        for (let k = 0; k < 220; k++) {
          g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
          g.fillRect(rnd() * 2048, rnd() * 260, 1.6, 1.6);
        }
        g.fillStyle = "#eef2ff";
        g.beginPath();
        g.arc(600, 110, 26, 0, Math.PI * 2);
        g.fill();
        const glowM = g.createRadialGradient(600, 110, 20, 600, 110, 110);
        glowM.addColorStop(0, "rgba(200,210,255,0.35)");
        glowM.addColorStop(1, "rgba(200,210,255,0)");
        g.fillStyle = glowM;
        g.fillRect(480, 0, 240, 240);
        for (const [base, amp, col] of [
          [300, 90, "#1a2240"],
          [360, 60, "#121830"],
          [420, 40, "#0c1020"],
        ] as [number, number, string][]) {
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(0, 512);
          for (let x = 0; x <= 2048; x += 16) {
            const y = base - Math.abs(Math.sin(x / 160 + base)) * amp - Math.sin(x / 37) * amp * 0.15;
            g.lineTo(x, y);
          }
          g.lineTo(2048, 512);
          g.fill();
        }
        // Des lumières de villages
        for (let k = 0; k < 40; k++) {
          g.fillStyle = `rgba(255,${190 + rnd() * 40},120,${0.6 + rnd() * 0.4})`;
          g.fillRect(rnd() * 2048, 420 + rnd() * 50, 2.5, 2.5);
        }
      },
      true,
    ),
  );
  return t;
}

/** Tout près de la voie : des sapins et des poteaux en silhouette, sur fond transparent */
function nearLandscape(keep: <T extends { dispose: () => void }>(x: T) => T, seed: number): THREE.CanvasTexture {
  return keep(
    canvasTex(
      2048,
      512,
      (g) => {
        g.clearRect(0, 0, 2048, 512);
        const rnd = seeded(seed);
        g.fillStyle = "#04060c";
        g.fillRect(0, 430, 2048, 82);
        let x = 0;
        while (x < 2048) {
          if (rnd() < 0.15) {
            // Un poteau et ses fils
            g.fillRect(x, 120, 8, 320);
            g.fillRect(x - 30, 130, 68, 6);
            x += 60;
          } else {
            const h = 120 + rnd() * 200,
              w = 50 + rnd() * 60;
            g.beginPath();
            g.moveTo(x, 440);
            for (let k = 0; k < 6; k++) {
              const y = 440 - (h * (k + 1)) / 6;
              const ww = (w * (6 - k)) / 6;
              g.lineTo(x + w / 2 - ww / 2, y + 18);
              g.lineTo(x + w / 2, y);
              g.lineTo(x + w / 2 + ww / 2, y + 18);
            }
            g.lineTo(x + w, 440);
            g.fill();
            x += w * (0.5 + rnd() * 1.6);
          }
        }
      },
      true,
    ),
  );
}

export function wagon(touch: boolean): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const W = 5.5,
    D = 1.75,
    H = 2.75;
  const ceil = FLOOR + H;

  // Le plancher et le long tapis
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * W, 2 * D)), std(keep, "#2a1a10", 0.7));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  floor.receiveShadow = true;
  root.add(floor);
  root.add(rug(keep, 2 * W - 0.4, 2 * D - 0.3, ["#4a0e18", "#c8a050", "#1a2a3a"]));

  // Les parois : soubassement de marqueterie, fenêtres, bandeau, voûte
  const cherry = phys(keep, { color: "#6a2a12", roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 });
  const inlay = std(keep, "#d8b878", 0.4, 0.3);
  const brass = std(keep, "#c09a40", 0.28, 1);
  const winTop = FLOOR + 2.0,
    winBot = FLOOR + 0.95;
  const far = farLandscape(keep, 3);
  const far2 = farLandscape(keep, 7);
  const near = nearLandscape(keep, 5);
  const near2 = nearLandscape(keep, 9);
  const farMats = [far, far2].map((t) => keep(new THREE.MeshBasicMaterial({ map: t, fog: false })));
  const nearMats = [near, near2].map((t) => keep(new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false })));
  for (const [side, s] of [
    [1, 0],
    [-1, 1],
  ] as [number, number][]) {
    const z = side * D;
    const yaw = side > 0 ? Math.PI : 0;
    // Le soubassement
    const low = block(2 * W, winBot - FLOOR, 0.06, cherry, 0, FLOOR, z, keep);
    root.add(low);
    // Le bandeau au-dessus des fenêtres
    root.add(block(2 * W, ceil - winTop, 0.06, cherry, 0, winTop, z, keep));
    // Les trumeaux entre les fenêtres
    const nWin = 6;
    for (let k = 0; k <= nWin; k++) {
      const x = -W + (k * 2 * W) / nWin;
      root.add(block(0.42, winTop - winBot, 0.08, cherry, x, winBot, z, keep));
      root.add(block(0.02, winTop - winBot - 0.1, 0.09, inlay, x, winBot + 0.05, z, keep));
    }
    // Des filets de marqueterie sur le soubassement
    root.add(block(2 * W, 0.015, 0.07, inlay, 0, FLOOR + 0.55, z, keep));
    root.add(block(2 * W, 0.015, 0.07, inlay, 0, FLOOR + 0.25, z, keep));
    // Le porte-bagages de laiton
    for (const dz of [0.05, 0.25]) {
      const bar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.012, 2 * W, 8)), brass);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, winTop + 0.25, z - side * dz);
      root.add(bar);
    }
    // Le paysage, loin, puis tout près (il défile plus vite)
    const farP = new THREE.Mesh(keep(new THREE.PlaneGeometry(30, 7.5)), farMats[s]!);
    farP.position.set(0, FLOOR + 1.4, z + side * 6);
    farP.rotation.y = yaw;
    farP.userData.live = true;
    root.add(farP);
    const nearP = new THREE.Mesh(keep(new THREE.PlaneGeometry(14, 3.5)), nearMats[s]!);
    nearP.position.set(0, FLOOR + 1.2, z + side * 1.4);
    nearP.rotation.y = yaw;
    nearP.userData.live = true;
    root.add(nearP);
  }
  // Les deux bouts du wagon : des portes de bois à vitre dépolie
  for (const sx of [-1, 1]) {
    root.add(block(0.06, H, 2 * D, cherry, sx * W, FLOOR, 0, keep));
    const door = block(0.02, 1.9, 0.8, glow(keep, "#ffd9a0", 0.5), sx * (W - 0.04), FLOOR + 0.2, 0, keep);
    root.add(door);
  }
  // La voûte du plafond : un demi-cylindre aplati, posé sur le haut des parois, et ses arceaux de bois
  const vault = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(D, D, 2 * W, 32, 1, true, 0, Math.PI)),
    std(keep, "#efe2c8", 0.8, 0, { side: THREE.BackSide }),
  );
  vault.rotation.z = Math.PI / 2;
  vault.position.y = ceil;
  vault.scale.set(1, 0.32, 1);
  root.add(vault);
  for (let k = -5; k <= 5; k++) {
    const rib = new THREE.Mesh(keep(new THREE.TorusGeometry(D - 0.02, 0.03, 6, 24, Math.PI)), cherry);
    rib.rotation.y = Math.PI / 2;
    rib.position.set(k, ceil, 0);
    rib.scale.set(1, 0.32, 1);
    root.add(rib);
  }

  // Les fauteuils de velours, face à face aux deux bouts
  const velvet = phys(keep, { color: "#6a1020", roughness: 0.8, sheen: 1, sheenColor: new THREE.Color("#d04050"), sheenRoughness: 0.5 });
  for (const [x, z, yaw] of [
    [-4.4, 0.9, Math.PI / 2 + 0.3],
    [-4.4, -0.9, Math.PI / 2 - 0.3],
    [4.4, 0.9, -Math.PI / 2 - 0.3],
    [4.4, -0.9, -Math.PI / 2 + 0.3],
  ] as [number, number, number][])
    root.add(armchair(keep, velvet, x, z, yaw, !touch));
  // De petites tables et leurs lampes à abat-jour
  for (const x of [-4.6, 4.6]) {
    root.add(roundBlock(0.5, 0.04, 0.5, 0.02, cherry, x, FLOOR + 0.62, 0, keep));
    root.add(block(0.05, 0.62, 0.05, brass, x, FLOOR, 0, keep));
    const shade = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.12, 0.13, 16, 1, true)), glow(keep, "#ffcf8a", 1.2));
    shade.position.set(x, FLOOR + 0.92, 0);
    shade.userData.reflect = true;
    root.add(shade);
  }

  const lamp = poolLamp(keep, { kind: "tiffany", height: 0.92, ceiling: ceil + 0.5, color: "#ffd8a8", intensity: 4.0, touch });
  lamp.group.userData.live = true;
  root.add(lamp.group);
  const moonLight = new THREE.DirectionalLight("#8aa0ff", 0.25);
  moonLight.position.set(2, 4, 6);
  root.add(moonLight);
  const warm = new THREE.PointLight("#ffc890", 0.8, 6, 1.6);
  warm.position.set(-4.4, FLOOR + 1.2, 0);
  const warm2 = new THREE.PointLight("#ffc890", 0.8, 6, 1.6);
  warm2.position.set(4.4, FLOOR + 1.2, 0);
  root.add(warm, warm2);

  return {
    table: { wood: "merisier", trim: "laiton", legs: "lyre", leather: "#2a1008" },
    root,
    background: new THREE.Color("#04060c"),
    fog: null,
    hemi: ["#ffe2c4", "#2a1408", 0.4],
    env: 0.55,
    exposure: 1.0,
    bloom: [0.45, 0.3, 1.1],
    grade: { warm: 0.05, sat: 1.05, vignette: 0.45 },
    lamps: lamp.lamps,
    intro: { from: new THREE.Vector3(-4.9, 1.3, 0.0), look: new THREE.Vector3(1, 0.2, 0) },
    spots: [
      { x: -4.4, y: FLOOR + 0.48, z: 0.9, yaw: Math.PI / 2 + 0.3, sit: true },
      { x: -4.4, y: FLOOR + 0.48, z: -0.9, yaw: Math.PI / 2 - 0.3, sit: true },
      { x: 4.4, y: FLOOR + 0.48, z: 0.9, yaw: -Math.PI / 2 - 0.3, sit: true },
      { x: 4.4, y: FLOOR + 0.48, z: -0.9, yaw: -Math.PI / 2 + 0.3, sit: true },
      { x: -2.6, y: FLOOR, z: 1.35, yaw: 3.1, sit: false },
      { x: 2.6, y: FLOOR, z: -1.35, yaw: 0, sit: false },
    ],
    ambience: "train",
    update: (t) => {
      // Le paysage défile : loin lentement, près vite
      far.offset.x = (t * 0.004) % 1;
      far2.offset.x = -(t * 0.004) % 1;
      near.offset.x = (t * 0.05) % 1;
      near2.offset.x = -(t * 0.05) % 1;
      // La lampe balance un peu avec le train
      lamp.group.rotation.x = Math.sin(t * 1.3) * 0.006 + Math.sin(t * 3.1) * 0.002;
    },
    dispose,
  };
}
