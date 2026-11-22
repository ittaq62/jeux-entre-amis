// Le salon sous la mer : une salle ronde aux parois de métal riveté, de grandes baies sur les fonds marins (le bleu qui
// s'assombrit vers le bas, les rayons du soleil qui tombent de la surface, les algues qui ondulent, les bancs de poissons
// qui passent, les bulles qui remontent), un plancher de laiton et de teck où dansent les reflets de l'eau. Des globes
// de verre au-dessus de la table.

import * as THREE from "three";
import { seeded } from "../textures.ts";
import { bin, block, canvasTex, glow, phys, poolLamp, roundBlock, std, type Salle } from "./common.ts";
import { FLOOR, parquet } from "./decor.ts";

export function sousmarin(touch: boolean): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const RAD = 4.6,
    H = 3.4;
  const ceil = FLOOR + H;

  // Le plancher de teck, et les reflets de l'eau qui y dansent
  root.add(parquet(keep, 2 * RAD + 1, 2 * RAD + 1, ["#8a5a2e", "#5a3618"], false, 2.5));
  const caustics = keep(
    canvasTex(
      256,
      256,
      (g) => {
        g.fillStyle = "#000";
        g.fillRect(0, 0, 256, 256);
        // Un réseau de cellules aux bords lumineux, comme la lumière qui traverse les vagues
        const rnd = seeded(4);
        const pts: [number, number][] = [];
        for (let k = 0; k < 26; k++) pts.push([rnd() * 256, rnd() * 256]);
        const img = g.createImageData(256, 256);
        for (let y = 0; y < 256; y++)
          for (let x = 0; x < 256; x++) {
            let d1 = 1e9,
              d2 = 1e9;
            for (const [px, py] of pts)
              for (const ox of [-256, 0, 256])
                for (const oy of [-256, 0, 256]) {
                  const d = Math.hypot(x - px - ox, y - py - oy);
                  if (d < d1) {
                    d2 = d1;
                    d1 = d;
                  } else if (d < d2) d2 = d;
                }
            const edge = Math.max(0, 1 - (d2 - d1) / 7);
            const i = (y * 256 + x) * 4;
            img.data[i] = 120 * edge;
            img.data[i + 1] = 220 * edge;
            img.data[i + 2] = 255 * edge;
            img.data[i + 3] = 255;
          }
        g.putImageData(img, 0, 0);
      },
      true,
    ),
  );
  caustics.repeat.set(7, 7);
  const causticMat = keep(
    new THREE.MeshBasicMaterial({ map: caustics, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.16 }),
  );
  const causticPlane = new THREE.Mesh(keep(new THREE.CircleGeometry(RAD, 48)), causticMat);
  causticPlane.rotation.x = -Math.PI / 2;
  causticPlane.position.y = FLOOR + 0.006;
  causticPlane.userData.live = true;
  root.add(causticPlane);

  // La mer derrière les baies : un grand cylindre peint (le bleu, les rayons, le sable, les algues)
  const sea = keep(
    canvasTex(2048, 512, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, "#3ab0d8");
      grd.addColorStop(0.45, "#0c5a8a");
      grd.addColorStop(1, "#021a30");
      g.fillStyle = grd;
      g.fillRect(0, 0, 2048, 512);
      const rnd = seeded(8);
      // Les rayons du soleil
      for (let k = 0; k < 14; k++) {
        const x = rnd() * 2048;
        const r = g.createLinearGradient(x, 0, x + 60, 400);
        r.addColorStop(0, "rgba(200,240,255,0.32)");
        r.addColorStop(1, "rgba(200,240,255,0)");
        g.fillStyle = r;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 30 + rnd() * 30, 0);
        g.lineTo(x + 120 + rnd() * 80, 420);
        g.lineTo(x + 60, 420);
        g.fill();
      }
      // Le sable, les rochers, les coraux
      g.fillStyle = "#c8b080";
      g.beginPath();
      g.moveTo(0, 512);
      for (let x = 0; x <= 2048; x += 32) g.lineTo(x, 440 - Math.sin(x / 90) * 14 - rnd() * 8);
      g.lineTo(2048, 512);
      g.fill();
      for (let k = 0; k < 30; k++) {
        const x = rnd() * 2048;
        g.fillStyle = ["#e86a5a", "#f0a040", "#c84a8a", "#5ab0a0"][k % 4]!;
        for (let b = 0; b < 5; b++) {
          g.beginPath();
          g.ellipse(x + rnd() * 30, 430 - rnd() * 40, 6 + rnd() * 10, 10 + rnd() * 18, rnd(), 0, Math.PI * 2);
          g.fill();
        }
      }
    }),
  );
  sea.wrapS = THREE.RepeatWrapping;
  const seaMat = keep(new THREE.MeshBasicMaterial({ map: sea, side: THREE.BackSide, fog: false }));
  const seaCyl = new THREE.Mesh(keep(new THREE.CylinderGeometry(RAD + 3, RAD + 3, 12, 48, 1, true)), seaMat);
  seaCyl.position.y = FLOOR + 3.5;
  seaCyl.userData.live = true;
  root.add(seaCyl);

  // La paroi ronde : du métal riveté, percé de grandes baies (les trumeaux entre elles)
  const metal = std(keep, "#2a5a5a", 0.45, 0.7);
  const brass = std(keep, "#b8913c", 0.3, 1);
  const nBays = 8;
  for (let k = 0; k < nBays; k++) {
    const a = (k / nBays) * Math.PI * 2;
    const pier = block(0.7, H, 0.2, metal, Math.cos(a) * RAD, FLOOR, Math.sin(a) * RAD, keep);
    pier.rotation.y = -a + Math.PI / 2;
    root.add(pier);
    // Les rivets
    for (let r = 0; r < 8; r++) {
      const rivet = new THREE.Mesh(keep(new THREE.SphereGeometry(0.018, 6, 4)), brass);
      rivet.position.set(Math.cos(a) * (RAD - 0.11), FLOOR + 0.3 + r * 0.38, Math.sin(a) * (RAD - 0.11));
      root.add(rivet);
    }
  }
  // Le bas et le haut de la paroi, et les cerclages de laiton des baies
  const lowerRing = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(RAD, RAD, 0.7, 48, 1, true)),
    std(keep, "#1e4646", 0.5, 0.7, { side: THREE.BackSide }),
  );
  lowerRing.position.y = FLOOR + 0.35;
  root.add(lowerRing);
  const upperRing = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(RAD, RAD, 0.6, 48, 1, true)),
    std(keep, "#1e4646", 0.5, 0.7, { side: THREE.BackSide }),
  );
  upperRing.position.y = ceil - 0.3;
  root.add(upperRing);
  for (const y of [FLOOR + 0.7, ceil - 0.6]) {
    const band = new THREE.Mesh(keep(new THREE.TorusGeometry(RAD - 0.02, 0.04, 8, 64)), brass);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    root.add(band);
  }
  // La coupole de verre et son armature
  const dome = new THREE.Mesh(
    keep(new THREE.SphereGeometry(RAD, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2)),
    phys(keep, { color: "#8ad0e8", roughness: 0.1, transparent: true, opacity: 0.18, side: THREE.BackSide }),
  );
  dome.position.y = ceil;
  dome.scale.y = 0.35;
  root.add(dome);
  for (let k = 0; k < 8; k++) {
    const rib = new THREE.Mesh(keep(new THREE.TorusGeometry(RAD, 0.03, 6, 32, Math.PI)), brass);
    rib.rotation.y = (k / 8) * Math.PI;
    rib.position.y = ceil;
    rib.scale.y = 0.35;
    root.add(rib);
  }

  // Des poissons qui passent derrière les baies, en bancs ; des bulles qui remontent
  const fishGroup = new THREE.Group();
  fishGroup.userData.live = true;
  const fishGeo = keep(new THREE.ConeGeometry(0.06, 0.24, 6));
  fishGeo.rotateZ(-Math.PI / 2);
  const fishMats = ["#ffb040", "#f0e8d0", "#40c0e0", "#ff7a5a"].map((c) =>
    std(keep, c, 0.5, 0.2, { emissive: new THREE.Color(c).multiplyScalar(0.15) }),
  );
  const schools: { g: THREE.Group; r: number; y: number; speed: number; phase: number }[] = [];
  const rnd = seeded(14);
  for (let s = 0; s < 5; s++) {
    const g = new THREE.Group();
    const n = 6 + Math.floor(rnd() * 8);
    for (let k = 0; k < n; k++) {
      const f = new THREE.Mesh(fishGeo, fishMats[s % fishMats.length]!);
      f.position.set((rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.8);
      f.scale.setScalar(0.7 + rnd() * 0.6);
      g.add(f);
    }
    fishGroup.add(g);
    schools.push({
      g,
      r: RAD + 1.0 + rnd() * 1.5,
      y: FLOOR + 1.0 + rnd() * 2.5,
      speed: (0.06 + rnd() * 0.08) * (s % 2 ? 1 : -1),
      phase: rnd() * 6.28,
    });
  }
  // Une grande raie qui passe, lentement
  const ray = new THREE.Mesh(keep(new THREE.CircleGeometry(0.7, 4)), std(keep, "#1a2a3a", 0.8, 0, { side: THREE.DoubleSide }));
  ray.rotation.x = -Math.PI / 2;
  ray.scale.set(1.4, 0.8, 1);
  const rayG = new THREE.Group();
  rayG.add(ray);
  fishGroup.add(rayG);
  root.add(fishGroup);
  const bubbleGeo = keep(new THREE.SphereGeometry(0.025, 8, 6));
  const bubbleMat = phys(keep, { color: "#dff6ff", roughness: 0.05, transparent: true, opacity: 0.5 });
  const bubbles: THREE.Mesh[] = [];
  for (let k = 0; k < (touch ? 18 : 36); k++) {
    const b = new THREE.Mesh(bubbleGeo, bubbleMat);
    const a = rnd() * Math.PI * 2;
    b.position.set(Math.cos(a) * (RAD + 0.4 + rnd()), FLOOR + rnd() * H, Math.sin(a) * (RAD + 0.4 + rnd()));
    b.scale.setScalar(0.6 + rnd() * 1.4);
    b.userData.speed = 0.3 + rnd() * 0.4;
    b.userData.off = rnd() * (H + 1);
    fishGroup.add(b);
    bubbles.push(b);
  }

  // Deux banquettes rondes de cuir crème, une table basse avec un aquarium-bocal
  const cream = phys(keep, { color: "#e8dcc4", roughness: 0.55, clearcoat: 0.4 });
  for (const a of [0.9, 3.9]) {
    const seat = new THREE.Mesh(keep(new THREE.CylinderGeometry(3.6, 3.6, 0.42, 40, 1, false, a - 0.35, 0.7)), cream);
    seat.position.y = FLOOR + 0.21;
    root.add(seat);
    const back = new THREE.Mesh(keep(new THREE.CylinderGeometry(4.1, 4.1, 0.9, 40, 1, true, a - 0.35, 0.7)), cream);
    back.position.y = FLOOR + 0.45;
    root.add(back);
  }
  root.add(roundBlock(0.7, 0.05, 0.7, 0.02, brass, 3.0, FLOOR + 0.45, 0.6, keep));

  const lamp = poolLamp(keep, { kind: "verre", height: 0.95, ceiling: ceil + 0.6, color: "#e8f4ff", intensity: 4.2, touch });
  root.add(lamp.group);
  // La lumière bleue de la mer, qui entre par les baies
  const seaLight = new THREE.HemisphereLight("#6ad0ff", "#0a2a3a", 0.4);
  root.add(seaLight);
  const sun = new THREE.DirectionalLight("#9ae6ff", 0.6);
  sun.position.set(2, 8, 1);
  root.add(sun);
  const glowRing = new THREE.Mesh(keep(new THREE.TorusGeometry(RAD - 0.1, 0.02, 6, 64)), glow(keep, "#6ae0ff", 1.6));
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = FLOOR + 0.02;
  root.add(glowRing);

  return {
    table: { wood: "blanc", trim: "chrome", legs: "metal", leather: "#e8e2d8" },
    root,
    background: new THREE.Color("#021422"),
    fog: null,
    hemi: ["#a8e8ff", "#1a3a40", 0.4],
    env: 0.65,
    exposure: 1.0,
    bloom: [0.5, 0.55, 0.88],
    grade: { warm: -0.04, sat: 1.1, vignette: 0.4 },
    lamps: lamp.lamps,
    intro: { from: new THREE.Vector3(3.4, 2.2, 2.8), look: new THREE.Vector3(-3, 2.4, -5) },
    spots: [
      { x: Math.cos(0.9) * 3.55, y: FLOOR + 0.45, z: Math.sin(0.9) * 3.55, yaw: -0.9 - Math.PI / 2, sit: true },
      { x: Math.cos(3.9) * 3.55, y: FLOOR + 0.45, z: Math.sin(3.9) * 3.55, yaw: -3.9 - Math.PI / 2, sit: true },
      { x: 3.0, y: FLOOR, z: -1.4, yaw: -1.2, sit: false },
      { x: -3.2, y: FLOOR, z: 0.6, yaw: 1.8, sit: false },
      { x: 0.4, y: FLOOR, z: 3.2, yaw: 3.1, sit: false },
      { x: -1.0, y: FLOOR, z: -3.1, yaw: 0, sit: false },
    ],
    ambience: "bulles",
    update: (t) => {
      caustics.offset.set(Math.sin(t * 0.21) * 0.08 + t * 0.01, Math.cos(t * 0.17) * 0.08);
      causticMat.opacity = 0.13 + 0.04 * Math.sin(t * 1.3);
      sea.offset.x = (t * 0.002) % 1;
      for (const s of schools) {
        const a = s.phase + t * s.speed;
        s.g.position.set(Math.cos(a) * s.r, s.y + Math.sin(t * 0.5 + s.phase) * 0.2, Math.sin(a) * s.r);
        s.g.rotation.y = -a + (s.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      const ra = t * 0.03 + 2;
      rayG.position.set(Math.cos(ra) * (RAD + 2.5), FLOOR + 3.6 + Math.sin(t * 0.3) * 0.3, Math.sin(ra) * (RAD + 2.5));
      rayG.rotation.y = -ra;
      ray.rotation.z = Math.sin(t * 1.2) * 0.15;
      for (const b of bubbles) b.position.y = FLOOR + ((t * (b.userData.speed as number) + (b.userData.off as number)) % (H + 1));
    },
    dispose,
  };
}
