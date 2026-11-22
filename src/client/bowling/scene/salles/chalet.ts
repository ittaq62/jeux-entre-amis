// Le chalet : trois pistes dans un grand chalet de montagne. Des murs de rondins, une charpente de poutres, de grandes
// fenêtres sur les sommets enneigés et la forêt de sapins, la cheminée de pierre où le feu crépite derrière la banquette
// de tissu écossais, des lanternes chaudes, des skis croisés au mur.

import * as THREE from "three";
import { CUSHION, HEAD_PIN } from "../../../../shared/games/bowling/lane.ts";
import { LANE_PITCH } from "../laneMesh.ts";
import { seeded } from "../textures.ts";
import {
  arcBench,
  ballReturn,
  bin,
  block,
  canvasTex,
  glowSign,
  mergeStatic,
  neighborPinsInstanced,
  phys,
  std,
  type Salle,
} from "./common.ts";

const NEIGHBORS = 1;
const HALL = (NEIGHBORS + 0.5) * LANE_PITCH + 0.9;
const BACK = 11;
const CEIL = 3.6;
const OUR_LANE = 2;

/** Les rondins des murs, couchés les uns sur les autres */
function logs(): THREE.CanvasTexture {
  return canvasTex(
    512,
    512,
    (g) => {
      const r = seeded(4);
      const h = 64;
      for (let y = 0; y < 512; y += h) {
        const grd = g.createLinearGradient(0, y, 0, y + h);
        const k = 0.85 + r() * 0.2;
        grd.addColorStop(0, `rgb(${70 * k},${42 * k},${22 * k})`);
        grd.addColorStop(0.3, `rgb(${150 * k},${96 * k},${54 * k})`);
        grd.addColorStop(0.7, `rgb(${128 * k},${80 * k},${44 * k})`);
        grd.addColorStop(1, `rgb(${52 * k},${30 * k},${16 * k})`);
        g.fillStyle = grd;
        g.fillRect(0, y, 512, h);
        for (let i = 0; i < 12; i++) {
          g.strokeStyle = `rgba(60,34,16,${0.2 + r() * 0.2})`;
          g.beginPath();
          const yy = y + 10 + r() * (h - 20);
          g.moveTo(0, yy);
          g.bezierCurveTo(170, yy + r() * 6 - 3, 340, yy + r() * 6 - 3, 512, yy);
          g.stroke();
        }
      }
    },
    true,
  );
}

/** Le plancher : de larges planches de mélèze */
function planks(): THREE.CanvasTexture {
  return canvasTex(
    512,
    512,
    (g) => {
      const r = seeded(8);
      for (let x = 0; x < 512; x += 64) {
        const k = 0.85 + r() * 0.25;
        g.fillStyle = `rgb(${156 * k},${108 * k},${66 * k})`;
        g.fillRect(x, 0, 64, 512);
        for (let i = 0; i < 6; i++) {
          g.strokeStyle = `rgba(90,56,26,${0.15 + r() * 0.2})`;
          const xx = x + r() * 64;
          g.beginPath();
          g.moveTo(xx, 0);
          g.lineTo(xx + r() * 6 - 3, 512);
          g.stroke();
        }
        g.fillStyle = "rgba(50,30,12,0.6)";
        g.fillRect(x + 62, 0, 2, 512);
        g.fillRect(x, r() * 512, 64, 2);
      }
    },
    true,
  );
}

/** La vue par la fenêtre : les sommets au soleil, la forêt de sapins dans la neige */
function view(seed: number): THREE.CanvasTexture {
  return canvasTex(512, 384, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 260);
    sky.addColorStop(0, "#5c8fd6");
    sky.addColorStop(1, "#cfe4f6");
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 384);
    const r = seeded(seed);
    const range = (base: number, amp: number, col: string, snow: boolean) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, 384);
      const pts: [number, number][] = [];
      for (let x = 0; x <= 512; x += 32) pts.push([x, base - r() * amp]);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(512, 384);
      g.fill();
      if (snow) {
        g.fillStyle = "#f4f8fc";
        for (const [x, y] of pts) {
          g.beginPath();
          g.moveTo(x - 14, y + 22);
          g.lineTo(x, y);
          g.lineTo(x + 14, y + 22);
          g.fill();
        }
      }
    };
    range(190, 120, "#8ea4bf", true);
    range(250, 70, "#6d86a3", true);
    g.fillStyle = "#eef4fa";
    g.fillRect(0, 290, 512, 94);
    for (let i = 0; i < 26; i++) {
      const x = r() * 512,
        y = 300 + r() * 60,
        s = 14 + r() * 26;
      g.fillStyle = "#1f4a32";
      g.beginPath();
      g.moveTo(x, y - s * 2);
      g.lineTo(x + s * 0.6, y);
      g.lineTo(x - s * 0.6, y);
      g.fill();
      g.fillStyle = "#f4f8fc";
      g.beginPath();
      g.moveTo(x, y - s * 2);
      g.lineTo(x + s * 0.25, y - s * 1.3);
      g.lineTo(x - s * 0.25, y - s * 1.3);
      g.fill();
    }
  });
}

/** Le cadre au-dessus des quilles : une enseigne de bois peint, les sommets, et le numéro */
function maskingArt(n: number): THREE.CanvasTexture {
  return canvasTex(1024, 320, (g) => {
    g.fillStyle = "#6b3f1f";
    g.fillRect(0, 0, 1024, 320);
    for (let y = 0; y < 320; y += 40) {
      g.fillStyle = y % 80 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.05)";
      g.fillRect(0, y, 1024, 40);
    }
    g.fillStyle = "#e9f1f8";
    g.beginPath();
    g.moveTo(80, 270);
    g.lineTo(260, 70);
    g.lineTo(440, 270);
    g.moveTo(580, 270);
    g.lineTo(760, 90);
    g.lineTo(940, 270);
    g.fill();
    g.fillStyle = "#b3242f";
    g.beginPath();
    g.arc(512, 160, 100, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff6e6";
    g.font = "bold 140px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), 512, 168);
    g.strokeStyle = "#3a2210";
    g.lineWidth = 14;
    g.strokeRect(7, 7, 1010, 306);
  });
}

/** Le tissu écossais de la banquette */
function plaid(): THREE.CanvasTexture {
  return canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = "#a31f2a";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "rgba(20,20,30,0.45)";
      for (const v of [16, 80]) {
        g.fillRect(v, 0, 28, 128);
        g.fillRect(0, v, 128, 28);
      }
      g.fillStyle = "rgba(255,220,120,0.5)";
      g.fillRect(60, 0, 3, 128);
      g.fillRect(0, 60, 128, 3);
    },
    true,
  );
}

export function chaletSalle(): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const masks = new Map<number, THREE.Material>();
  for (let i = -NEIGHBORS; i <= NEIGHBORS; i++) {
    const t = keep(maskingArt(OUR_LANE + i));
    masks.set(OUR_LANE + i, std(keep, 0xffffff, 0.7, 0, { map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  }
  const darkWood = phys(keep, { color: 0x5a3417, roughness: 0.55, clearcoat: 0.4 });
  const style = {
    gutter: 0x3a2a1c,
    gutterMetal: 0.3,
    capping: phys(keep, { color: 0x8a5a2e, roughness: 0.4, clearcoat: 0.7 }),
    kickback: darkWood,
    masking: masks.get(OUR_LANE)!,
    deckLight: 0xfff0d8,
    deckLightPower: 2.4,
    reflect: 0.5,
    wood: 0xfff0e0,
  };

  // Le plancher, les murs de rondins, le plafond et ses poutres
  const floorTex = keep(planks());
  floorTex.repeat.set(HALL / 1.5, (BACK - 4.6) / 1.5);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, BACK - 4.62)), std(keep, 0xffffff, 0.6, 0, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.001, (BACK + 4.62) / 2);
  floor.receiveShadow = true;
  root.add(floor);
  const under = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, CUSHION + 5)), std(keep, 0x2a1a0e, 0.9));
  under.rotation.x = -Math.PI / 2;
  under.position.set(0, -0.08, -(CUSHION - 5) / 2);
  root.add(under);
  const logTex = keep(logs());
  logTex.repeat.set((CUSHION + BACK) / 3, CEIL / 3);
  const logMat = std(keep, 0xffffff, 0.8, 0, { map: logTex });
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(keep(new THREE.PlaneGeometry(CUSHION + BACK + 1, CEIL)), logMat);
    w.position.set(side * HALL, CEIL / 2, (BACK - CUSHION) / 2);
    w.rotation.y = -side * (Math.PI / 2);
    root.add(w);
  }
  const backTex = keep(logs());
  backTex.repeat.set((2 * HALL) / 3, CEIL / 3);
  const backWall = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, CEIL)), std(keep, 0xffffff, 0.8, 0, { map: backTex }));
  backWall.position.set(0, CEIL / 2, BACK);
  backWall.rotation.y = Math.PI;
  root.add(backWall);
  const ceil = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, CUSHION + BACK + 2)), std(keep, 0x4a2c16, 0.8));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL, (BACK - CUSHION) / 2);
  root.add(ceil);
  for (let z = BACK - 1; z > -HEAD_PIN; z -= 2.4) root.add(block(2 * HALL, 0.22, 0.24, darkWood, 0, CEIL - 0.22, z, keep));
  for (const x of [-HALL + 0.25, HALL - 0.25])
    root.add(block(0.24, 0.24, CUSHION + BACK, darkWood, x, CEIL - 0.46, (BACK - CUSHION) / 2, keep));

  // Les grandes fenêtres sur la montagne, le long des murs
  const frame = phys(keep, { color: 0x3a2210, roughness: 0.6 });
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const z = 5 - k * 4.2;
      const t = keep(view(k * 3 + (side > 0 ? 1 : 2)));
      const pane = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(2.6, 1.7)),
        keep(new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.25, 1.25, 1.3), fog: false })),
      );
      pane.position.set(side * (HALL - 0.02), 1.7, z);
      pane.rotation.y = -side * (Math.PI / 2);
      pane.userData.reflect = true;
      root.add(pane);
      for (const dz of [-1.35, 0, 1.35]) root.add(block(0.1, 1.86, 0.1, frame, side * (HALL - 0.05), 0.77, z + dz, keep));
      for (const y of [0.8, 2.56]) root.add(block(0.12, 0.1, 2.8, frame, side * (HALL - 0.05), y, z, keep));
    }
  }

  // La cheminée de pierre, derrière la banquette, et son feu
  const stoneTex = keep(
    canvasTex(
      256,
      256,
      (g) => {
        const r = seeded(15);
        g.fillStyle = "#6f6a64";
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 40; i++) {
          const k = 0.7 + r() * 0.5;
          g.fillStyle = `rgb(${140 * k},${132 * k},${120 * k})`;
          g.beginPath();
          g.ellipse(r() * 256, r() * 256, 18 + r() * 22, 12 + r() * 14, r() * 3, 0, Math.PI * 2);
          g.fill();
        }
      },
      true,
    ),
  );
  const stone = std(keep, 0xffffff, 0.95, 0, { map: stoneTex });
  root.add(block(2.6, CEIL, 0.9, stone, 0, 0, BACK - 0.45, keep));
  const hearth = block(1.3, 0.9, 0.5, std(keep, 0x140c08, 1), 0, 0.2, BACK - 0.86, keep);
  root.add(hearth);
  root.add(block(3.0, 0.16, 0.4, darkWood, 0, 1.4, BACK - 1.0, keep));
  const fire = new THREE.Group();
  fire.userData.live = true;
  const flames = [0xff7a1a, 0xffb02e, 0xffe08a].map((c, i) => {
    const m = new THREE.Mesh(
      keep(new THREE.ConeGeometry(0.16 - i * 0.04, 0.5 - i * 0.12, 8)),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2) })),
    );
    m.position.set((i - 1) * 0.18, 0.45, BACK - 0.95);
    fire.add(m);
    return m;
  });
  root.add(fire);
  for (const dx of [-0.25, 0.25]) {
    const log = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 10)), darkWood);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = dx * 2;
    log.position.set(dx * 0.4, 0.26, BACK - 0.95);
    root.add(log);
  }
  const fireLight = new THREE.PointLight(0xff8a3a, 6, 8, 1.6);
  fireLight.position.set(0, 0.8, BACK - 1.5);
  root.add(fireLight);
  // Deux paires de skis croisés de chaque côté de la cheminée
  for (const x of [-2.2, 2.2]) {
    for (const a of [-0.3, 0.3]) {
      const ski = block(0.08, 1.7, 0.02, phys(keep, { color: x < 0 ? 0xc8263a : 0x1d3c8f, roughness: 0.3, clearcoat: 1 }), 0, 0, 0, keep);
      ski.position.set(x, 1.1, BACK - 0.04);
      ski.rotation.z = a;
      root.add(ski);
    }
  }

  // Les lanternes au plafond
  const glass = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc870).multiplyScalar(1.6) }));
  const iron = std(keep, 0x202020, 0.6, 0.4);
  for (const z of [6, 2, -3, -8, -13]) {
    for (const x of z > 0 ? [-1.4, 1.4] : [-(HALL - 0.7), HALL - 0.7]) {
      const lamp = new THREE.Group();
      const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.1, 0.26, 8)), glass);
      const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(0.17, 0.12, 8)), iron);
      cap.position.y = 0.19;
      const chain = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4)), iron);
      chain.position.y = 0.55;
      lamp.add(body, cap, chain);
      lamp.position.set(x, CEIL - 0.95, z);
      lamp.userData.reflect = true;
      root.add(lamp);
    }
  }

  // Les quilles et le retour de boules de la piste voisine ; la banquette écossaise ; l'enseigne
  root.add(neighborPinsInstanced(keep, [-LANE_PITCH, LANE_PITCH], "bois"));
  ballReturn(root, keep, -0.5 * LANE_PITCH, darkWood, std(keep, 0xc0a070, 0.3, 0.8), 2);
  const plaidTex = keep(plaid());
  plaidTex.repeat.set(4, 2);
  const bench = arcBench(root, keep, std(keep, 0xffffff, 0.9, 0, { map: plaidTex }), 7.0, 1.5);
  // Un tapis de fourrure devant la cheminée
  const rug = new THREE.Mesh(keep(new THREE.CircleGeometry(1.1, 32)), std(keep, 0xe8dcc6, 1));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, BACK - 2.3);
  rug.scale.set(1.4, 1, 1);
  root.add(rug);
  const sign = glowSign("Le chalet", "#ffb347", "Georgia, serif", 0.55, keep);
  sign.position.set(0, 2.35, BACK - 0.95);
  sign.rotation.y = Math.PI;
  root.add(sign);

  // La lumière : chaude au-dedans, le jour froid par les fenêtres, le feu
  const key = new THREE.SpotLight(0xffe0b8, 15, 12, 0.75, 0.5, 1.3);
  key.position.set(0.4, CEIL - 0.1, 3.2);
  key.target.position.set(0, 0, 0.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  root.add(key, key.target);
  const day = new THREE.DirectionalLight(0xd8e8ff, 0.9);
  day.position.set(-6, 5, 2);
  day.target.position.set(0, 0, -4);
  root.add(day, day.target);
  const lanterns = new THREE.PointLight(0xffc870, 4, 10, 1.5);
  lanterns.position.set(0, CEIL - 1, 3);
  root.add(lanterns);

  mergeStatic(root, keep);

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
    background: new THREE.Color(0x2a1a10),
    fog: new THREE.Fog(0x3a2818, 16, 40),
    hemi: [0xffe6c8, 0x4a2a14, 0.5],
    env: 0.6,
    exposure: 1.0,
    bloom: [0.45, 0.45, 0.88],
    grade: { warm: 0.07, sat: 1.08, vignette: 0.34 },
    bench,
    update: (t) => {
      // Le feu danse et sa lumière vacille
      flames.forEach((m, i) => {
        const s = 1 + Math.sin(t * (9 + i * 3) + i) * 0.15 + Math.sin(t * 17 + i * 2) * 0.08;
        m.scale.set(1, s, 1);
      });
      fireLight.intensity = 5 + Math.sin(t * 13) * 0.8 + Math.sin(t * 29) * 0.5;
    },
    dispose,
  };
}
