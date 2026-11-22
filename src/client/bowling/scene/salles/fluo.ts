// Nuit fluo : la salle plongée dans la lumière noire. Tout ce qui est peint brille : la moquette semée de planètes et
// d'éclairs, les fresques des murs, les cadres au-dessus des quilles. La boule à facettes tourne au-dessus de l'élan et
// promène ses taches de lumière sur les murs, le plafond et le sol ; des lasers balaient les pistes ; les néons pulsent.

import * as THREE from "three";
import { CUSHION, HEAD_PIN } from "../../../../shared/games/bowling/lane.ts";
import { LANE_PITCH } from "../laneMesh.ts";
import { seeded } from "../textures.ts";
import {
  arcBench,
  ballReturn,
  bin,
  canvasTex,
  glowSign,
  mergeStatic,
  neighborPinsInstanced,
  neon,
  phys,
  std,
  type Salle,
} from "./common.ts";

const NEIGHBORS = 3;
const HALL = (NEIGHBORS + 0.5) * LANE_PITCH + 0.7;
const BACK = 12.5;
const CEIL = 3.4;
const OUR_LANE = 7;
const NEONS = ["#39ff88", "#ff3fd1", "#37e0ff", "#ffe14d", "#ff8a3d", "#b46bff"];

/** Un motif peint qui brille sous la lumière noire : planètes, étoiles, éclairs, gribouillis */
function uvPaint(seed: number, w: number, h: number, dense: number): THREE.CanvasTexture {
  return canvasTex(
    w,
    h,
    (g) => {
      g.fillStyle = "#07030f";
      g.fillRect(0, 0, w, h);
      const r = seeded(seed);
      for (let i = 0; i < dense; i++) {
        const c = NEONS[i % NEONS.length]!;
        const x = r() * w,
          y = r() * h,
          s = 6 + r() * 22;
        g.strokeStyle = c;
        g.fillStyle = c;
        g.lineWidth = 2 + r() * 3;
        const k = i % 5;
        if (k === 0) {
          // Une planète et son anneau
          g.beginPath();
          g.arc(x, y, s, 0, Math.PI * 2);
          g.stroke();
          g.beginPath();
          g.ellipse(x, y, s * 1.8, s * 0.45, -0.4, 0, Math.PI * 2);
          g.stroke();
        } else if (k === 1) {
          // Une étoile à quatre branches
          g.beginPath();
          g.moveTo(x, y - s);
          g.lineTo(x + s * 0.25, y - s * 0.25);
          g.lineTo(x + s, y);
          g.lineTo(x + s * 0.25, y + s * 0.25);
          g.lineTo(x, y + s);
          g.lineTo(x - s * 0.25, y + s * 0.25);
          g.lineTo(x - s, y);
          g.lineTo(x - s * 0.25, y - s * 0.25);
          g.closePath();
          g.fill();
        } else if (k === 2) {
          // Un éclair
          g.beginPath();
          g.moveTo(x, y - s);
          g.lineTo(x - s * 0.4, y + s * 0.1);
          g.lineTo(x + s * 0.1, y + s * 0.1);
          g.lineTo(x - s * 0.2, y + s);
          g.stroke();
        } else if (k === 3) {
          // Un gribouillis
          g.beginPath();
          g.moveTo(x - s * 2, y);
          for (let t = 0; t <= 8; t++) g.lineTo(x - s * 2 + t * s * 0.5, y + (t % 2 ? -s * 0.5 : s * 0.5));
          g.stroke();
        } else {
          g.beginPath();
          g.arc(x, y, s * 0.25, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
    true,
  );
}

/** Le cadre au-dessus des quilles : une nuit de planètes, et le numéro de la piste en néon */
function maskingArt(n: number): THREE.CanvasTexture {
  return canvasTex(1024, 320, (g) => {
    g.fillStyle = "#05020c";
    g.fillRect(0, 0, 1024, 320);
    const r = seeded(n * 31);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      g.fillRect(r() * 1024, r() * 320, 2, 2);
    }
    const planet = (x: number, y: number, s: number, c: string, ring: boolean) => {
      const grd = g.createRadialGradient(x - s * 0.3, y - s * 0.3, s * 0.1, x, y, s);
      grd.addColorStop(0, "#ffffff");
      grd.addColorStop(0.25, c);
      grd.addColorStop(1, "#05020c");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
      if (ring) {
        g.strokeStyle = c;
        g.lineWidth = 5;
        g.beginPath();
        g.ellipse(x, y, s * 1.9, s * 0.45, -0.3, 0, Math.PI * 2);
        g.stroke();
      }
    };
    planet(170, 150, 70, NEONS[(n + 1) % 6]!, true);
    planet(860, 120, 50, NEONS[(n + 3) % 6]!, false);
    planet(700, 250, 26, NEONS[(n + 4) % 6]!, true);
    g.shadowColor = NEONS[n % 6]!;
    g.shadowBlur = 24;
    g.strokeStyle = NEONS[n % 6]!;
    g.lineWidth = 8;
    g.font = "bold 170px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.strokeText(String(n), 512, 170);
    g.shadowBlur = 0;
    g.strokeStyle = "#ffffff";
    g.lineWidth = 2;
    g.strokeText(String(n), 512, 170);
  });
}

export function fluoSalle(): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const masks = new Map<number, THREE.Material>();
  for (let i = -NEIGHBORS; i <= NEIGHBORS; i++) {
    const t = keep(maskingArt(OUR_LANE + i));
    masks.set(OUR_LANE + i, std(keep, 0xffffff, 0.6, 0, { map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1 }));
  }
  const kickTex = keep(uvPaint(5, 512, 256, 26));
  const style = {
    gutter: 0x1b1626,
    gutterMetal: 0.8,
    capping: phys(keep, { color: 0x15121f, roughness: 0.25, clearcoat: 1, emissive: 0x0a3a40, emissiveIntensity: 0.6 }),
    kickback: std(keep, 0xffffff, 0.5, 0, { map: kickTex, emissiveMap: kickTex, emissive: 0xffffff, emissiveIntensity: 0.8 }),
    masking: masks.get(OUR_LANE)!,
    deckLight: 0xd9c4ff,
    deckLightPower: 2.4,
    reflect: 0.75,
    wood: 0x9b8cb4,
  };

  // Le sol : une moquette noire semée de motifs qui brillent
  const carpetTex = keep(uvPaint(11, 512, 512, 60));
  carpetTex.repeat.set(HALL / 2, (BACK - 4.6) / 2);
  const floor = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(2 * HALL, BACK - 4.62)),
    std(keep, 0xffffff, 0.95, 0, { map: carpetTex, emissiveMap: carpetTex, emissive: 0xffffff, emissiveIntensity: 0.55 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.001, (BACK + 4.62) / 2);
  floor.receiveShadow = true;
  root.add(floor);
  const under = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, CUSHION + 5)), std(keep, 0x07040c, 0.9));
  under.rotation.x = -Math.PI / 2;
  under.position.set(0, -0.08, -(CUSHION - 5) / 2);
  root.add(under);

  // Les murs : des fresques qui brillent ; le mur du fond ; le plafond noir
  const muralTex = keep(uvPaint(23, 1024, 256, 70));
  muralTex.repeat.set((CUSHION + BACK) / 8, 1);
  const mural = std(keep, 0xffffff, 0.7, 0, { map: muralTex, emissiveMap: muralTex, emissive: 0xffffff, emissiveIntensity: 0.7 });
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(keep(new THREE.PlaneGeometry(CUSHION + BACK + 1, CEIL)), mural);
    w.position.set(side * HALL, CEIL / 2, (BACK - CUSHION) / 2);
    w.rotation.y = -side * (Math.PI / 2);
    root.add(w);
  }
  const backTex = keep(uvPaint(29, 1024, 256, 40));
  const backWall = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(2 * HALL, CEIL)),
    std(keep, 0xffffff, 0.7, 0, { map: backTex, emissiveMap: backTex, emissive: 0xffffff, emissiveIntensity: 0.6 }),
  );
  backWall.position.set(0, CEIL / 2, BACK);
  backWall.rotation.y = Math.PI;
  root.add(backWall);
  const ceil = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, CUSHION + BACK + 2)), std(keep, 0x05030a, 1));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL, (BACK - CUSHION) / 2);
  root.add(ceil);
  // Les tubes de lumière noire, en travers des pistes
  const uvMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a4dff).multiplyScalar(1.4) }));
  for (let z = -2; z > -HEAD_PIN + 1; z -= 3.2) {
    const tube = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 2 * HALL - 0.6, 10)), uvMat);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, CEIL - 0.25, z);
    tube.userData.reflect = true;
    root.add(tube);
  }
  // Des néons le long des murs, en zigzag
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let z = BACK - 0.5, k = 0; z > -HEAD_PIN; z -= 0.9, k++) pts.push(new THREE.Vector3(side * (HALL - 0.03), k % 2 ? 2.6 : 2.3, z));
    root.add(neon(pts, side < 0 ? 0x39ff88 : 0xff3fd1, keep, 0.02));
  }

  // Les quilles et les retours de boules des pistes voisines
  const xs: number[] = [];
  for (let i = 1; i <= NEIGHBORS; i++) xs.push(-i * LANE_PITCH, i * LANE_PITCH);
  root.add(neighborPinsInstanced(keep, xs, "neon"));
  const hood = phys(keep, { color: 0x15121f, roughness: 0.3, clearcoat: 1, emissive: 0x3a0a40, emissiveIntensity: 0.6 });
  const chrome = std(keep, 0xd8dde3, 0.18, 1);
  for (const k of [-3, -1, 1]) ballReturn(root, keep, (k + 0.5) * LANE_PITCH, hood, chrome, k + 5);

  // La banquette noire et brillante, et l'enseigne
  const vinyl = phys(keep, { color: 0x14101c, roughness: 0.3, clearcoat: 1, emissive: 0x24004a, emissiveIntensity: 0.4 });
  const bench = arcBench(root, keep, vinyl, 7.4, 1.55, std(keep, 0x39ff88, 0.4, 0, { emissive: 0x39ff88, emissiveIntensity: 1 }));
  const sign = glowSign("Nuit fluo", "#37e0ff", "'Big Shoulders Display', 'Arial Black', sans-serif", 0.7, keep);
  sign.position.set(0, 2.45, BACK - 0.06);
  sign.rotation.y = Math.PI;
  root.add(sign);

  // La boule à facettes, au-dessus de l'élan, et ses taches de lumière
  const disco = new THREE.Group();
  disco.userData.live = true;
  const ball = new THREE.Mesh(
    keep(new THREE.IcosahedronGeometry(0.32, 3)),
    keep(new THREE.MeshStandardMaterial({ color: 0xdfe4ff, metalness: 1, roughness: 0.08, flatShading: true })),
  );
  disco.add(ball);
  const wire = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4)), std(keep, 0x444444, 0.6));
  wire.position.y = 0.55;
  disco.add(wire);
  const DISCO = new THREE.Vector3(-1.6, CEIL - 0.5, 0.6);
  disco.position.copy(DISCO);
  root.add(disco);
  const spotGeo = keep(new THREE.CircleGeometry(0.06, 10));
  const spotMats = NEONS.map((c) =>
    keep(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(c).multiplyScalar(1.6),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    ),
  );
  const r = seeded(77);
  const spots = Array.from({ length: 70 }, (_, i) => {
    const m = new THREE.Mesh(spotGeo, spotMats[i % spotMats.length]!);
    m.userData.live = true;
    root.add(m);
    // Une direction au hasard sur la sphère (dans le plan, puis la hauteur)
    const y = r() * 1.6 - 0.8;
    const a = r() * Math.PI * 2;
    const k = Math.sqrt(1 - y * y);
    return { m, dir: new THREE.Vector3(Math.cos(a) * k, y, Math.sin(a) * k) };
  });
  // Les lasers : des rais de lumière qui balaient les pistes depuis le fond
  const lasers = [0, 1, 2, 3].map((i) => {
    const m = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.008, 0.008, 22, 6, 1, true)),
      keep(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(NEONS[i]!).multiplyScalar(1.8),
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    m.geometry.translate(0, 11, 0);
    m.position.set((i - 1.5) * 2.2, CEIL - 0.3, -HEAD_PIN + 1.2);
    m.userData.live = true;
    root.add(m);
    return m;
  });

  // La lumière : une lumière noire partout, deux couleurs, et une lampe sur l'élan pour l'ombre du joueur
  const key = new THREE.SpotLight(0xc8b4ff, 12, 12, 0.75, 0.5, 1.3);
  key.position.set(0.4, CEIL - 0.1, 3.2);
  key.target.position.set(0, 0, 0.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  root.add(key, key.target);
  const pink = new THREE.PointLight(0xff3fd1, 5, 9, 1.6);
  pink.position.set(-3, 2.4, 5);
  const cyan = new THREE.PointLight(0x37e0ff, 5, 9, 1.6);
  cyan.position.set(3, 2.4, 5);
  root.add(pink, cyan);
  const laneFill = new THREE.DirectionalLight(0x9f8cff, 0.4);
  laneFill.position.set(1.5, 8, 4);
  laneFill.target.position.set(0, 0, -10);
  root.add(laneFill, laneFill.target);

  mergeStatic(root, keep);

  const box = new THREE.Box3(new THREE.Vector3(-HALL + 0.02, 0.01, -HEAD_PIN), new THREE.Vector3(HALL - 0.02, CEIL - 0.01, BACK - 0.02));
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  return {
    style,
    neighbors: NEIGHBORS,
    neighborPins: (group, x) => {
      const n = OUR_LANE + Math.round(x / LANE_PITCH);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material === style.masking) o.material = masks.get(n) ?? style.masking;
      });
    },
    root,
    background: new THREE.Color(0x05020c),
    fog: new THREE.Fog(0x0b0418, 14, 42),
    hemi: [0x9a7cff, 0x1a0a30, 0.45],
    env: 0.55,
    exposure: 1.0,
    bloom: [0.75, 0.5, 0.75],
    grade: { warm: -0.02, sat: 1.25, vignette: 0.4 },
    bench,
    update: (t) => {
      // La boule à facettes tourne ; ses taches glissent sur les murs, le plafond et le sol
      ball.rotation.y = t * 0.5;
      q.setFromAxisAngle(axis, t * 0.5);
      for (const s of spots) {
        ray.set(DISCO, s.dir.clone().applyQuaternion(q));
        if (ray.intersectBox(box, hit)) {
          s.m.position.copy(hit);
          s.m.lookAt(DISCO);
        }
      }
      // Les lasers balaient, chacun à son rythme
      lasers.forEach((m, i) => {
        m.rotation.set(-Math.PI / 2 + 0.25 + Math.sin(t * (0.7 + i * 0.23) + i) * 0.12, 0, Math.sin(t * (0.9 + i * 0.17) + i * 2) * 0.5);
      });
      const pulse = 4 + Math.sin(t * 3) * 1.5;
      pink.intensity = pulse;
      cyan.intensity = 8 - pulse;
    },
    dispose,
  };
}
