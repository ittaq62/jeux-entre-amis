// La guinguette : une seule piste posée sur un ponton au bord de l'eau, au soleil couchant. Le ciel passe du bleu au
// rose et à l'orange, le soleil descend derrière les arbres de la rive d'en face, l'eau miroite tout autour ; des
// guirlandes de lampions traversent au-dessus de la piste entre des poteaux de bois, des tables à nappe à carreaux
// attendent sur la terrasse ; au fond, la petite cabane de la machine porte son enseigne peinte. Des lucioles s'allument
// au-dessus de l'eau.

import * as THREE from "three";
import { APPROACH, CUSHION, GUTTER_OUTER, HEAD_PIN, PIT_DEPTH } from "../../../../shared/games/bowling/lane.ts";
import { CEIL_Y } from "../laneMesh.ts";
import { seeded } from "../textures.ts";
import {
  ballReturn,
  bin,
  block,
  canvasTex,
  lampions,
  mergeStatic,
  phys,
  skyDome,
  std,
  straightBench,
  type Keep,
  type Salle,
} from "./common.ts";

/** La largeur du ponton le long de la piste, puis celle de la terrasse derrière l'élan */
const DECK_W = GUTTER_OUTER + 1.6;
const TERRACE = 4.4;
const BACK = 9.8;
const FRONT = CUSHION + 0.35;
/** Le dessus du ponton, et le dessous des planches (sous la fosse de la machine) */
const TOP = -0.002;
const UNDER = -PIT_DEPTH - 0.06;
const WATER = -0.5;
/** Les poteaux des guirlandes : assez hauts pour que les lampions passent au-dessus de la caméra */
const POST_H = 4.4;

/** L'enseigne peinte de la cabane, au-dessus des quilles */
function maskingArt(): THREE.CanvasTexture {
  return canvasTex(1024, 360, (g) => {
    g.fillStyle = "#2e6b5e";
    g.fillRect(0, 0, 1024, 360);
    g.strokeStyle = "#f3e2b5";
    g.lineWidth = 10;
    g.strokeRect(16, 16, 992, 328);
    g.fillStyle = "#f6d98a";
    g.font = "italic bold 132px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,0.35)";
    g.shadowOffsetY = 6;
    g.fillText("Guinguette", 512, 168);
    g.shadowColor = "transparent";
    g.font = "italic 42px Georgia, serif";
    g.fillStyle = "#f3e2b5";
    g.fillText("~ quilles & bal du dimanche ~", 512, 282);
    // Des fleurs peintes dans les coins
    const r = seeded(6);
    for (let i = 0; i < 14; i++) {
      const x = i < 7 ? 50 + r() * 90 : 884 + r() * 90,
        y = 50 + r() * 260;
      g.fillStyle = ["#ff7a8a", "#ffd166", "#ffffff", "#c58cf2"][i % 4]!;
      for (let p = 0; p < 5; p++) {
        g.beginPath();
        g.arc(x + Math.cos((p / 5) * Math.PI * 2) * 9, y + Math.sin((p / 5) * Math.PI * 2) * 9, 7, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#ffcc33";
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Les planches du ponton, grises de soleil et d'eau */
function deckPlanks(): THREE.CanvasTexture {
  return canvasTex(
    512,
    512,
    (g) => {
      const r = seeded(12);
      for (let x = 0; x < 512; x += 43) {
        const k = 0.82 + r() * 0.28;
        g.fillStyle = `rgb(${150 * k},${112 * k},${78 * k})`;
        g.fillRect(x, 0, 43, 512);
        for (let i = 0; i < 6; i++) {
          g.strokeStyle = `rgba(80,54,30,${0.15 + r() * 0.2})`;
          const xx = x + r() * 40;
          g.beginPath();
          g.moveTo(xx, 0);
          g.lineTo(xx + r() * 4 - 2, 512);
          g.stroke();
        }
        // Les bouts des planches et leurs clous
        const cut = r() * 512;
        g.fillStyle = "rgba(40,24,12,0.7)";
        g.fillRect(x, cut, 43, 2);
        g.fillStyle = "rgba(40,40,40,0.8)";
        for (const dy of [-8, 8]) {
          g.fillRect(x + 8, cut + dy, 3, 3);
          g.fillRect(x + 32, cut + dy, 3, 3);
        }
        g.fillStyle = "rgba(25,14,6,0.85)";
        g.fillRect(x + 41, 0, 2, 512);
      }
    },
    true,
  );
}

/** Les rides de l'eau, qui renvoient le couchant */
function ripples(): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#4a5a8a";
      g.fillRect(0, 0, 256, 256);
      const r = seeded(21);
      for (let i = 0; i < 160; i++) {
        const y = r() * 256,
          x = r() * 256,
          w = 10 + r() * 40;
        g.strokeStyle = r() < 0.5 ? "rgba(255,170,130,0.5)" : "rgba(40,50,90,0.5)";
        g.lineWidth = 1.5 + r() * 1.5;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + w / 2, y - 2, x + w, y);
        g.stroke();
      }
    },
    true,
  );
}

/** Les nappes à carreaux rouges et blancs */
function checks(): THREE.CanvasTexture {
  return canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = "#f8f3e8";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "rgba(200,38,58,0.55)";
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 16, 0, 8, 64);
        g.fillRect(0, i * 16, 64, 8);
      }
    },
    true,
  );
}

/** Un toit à deux pentes, son faîte le long de z */
function gableRoof(w: number, h: number, d: number, mat: THREE.Material, keep: Keep): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const geo = keep(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }));
  geo.translate(0, 0, -d / 2);
  return new THREE.Mesh(geo, mat);
}

export function guinguetteSalle(): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const r = seeded(9);
  const maskTex = keep(maskingArt());
  const wood = std(keep, 0x7a5232, 0.75);
  const paint = std(keep, 0x2e6b5e, 0.7);
  const style = {
    gutter: 0x4a4a48,
    gutterMetal: 0.5,
    capping: phys(keep, { color: 0x8a6440, roughness: 0.5, clearcoat: 0.4 }),
    kickback: phys(keep, { color: 0x2e6b5e, roughness: 0.6 }),
    masking: std(keep, 0xffffff, 0.7, 0, { map: maskTex, emissiveMap: maskTex, emissive: 0xffffff, emissiveIntensity: 0.3 }),
    deckLight: 0xffe8c8,
    deckLightPower: 2.4,
    reflect: 0.5,
    wood: 0xffe8d2,
  };

  // Le ciel au couchant, et le soleil bas qui passe derrière les arbres d'en face
  root.add(
    skyDome(keep, [
      [0, "#1f2f6a"],
      [0.3, "#5a4f9a"],
      [0.42, "#d9789a"],
      [0.47, "#ffa070"],
      [0.5, "#ffd49a"],
      [0.52, "#c08a7a"],
      [1, "#2a2a3a"],
    ]),
  );
  const sun = new THREE.Mesh(
    keep(new THREE.CircleGeometry(6, 48)),
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.8), fog: false })),
  );
  sun.position.set(-62, 11, -128);
  sun.lookAt(0, 2, 0);
  root.add(sun);

  // L'eau tout autour, qui miroite
  const waterTex = keep(ripples());
  waterTex.repeat.set(60, 60);
  const water = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(420, 420)),
    std(keep, 0xffffff, 0.12, 0.35, { map: waterTex, emissive: 0x2a2040, emissiveIntensity: 0.6 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER;
  water.userData.live = true;
  root.add(water);

  // Les rives : une ligne d'arbres sombres en face et sur les côtés, quelques maisons
  const treeMat = std(keep, 0x1c2e28, 0.95);
  const treeGeo = keep(new THREE.SphereGeometry(1, 10, 8));
  const tree = (x: number, z: number, s: number) => {
    const t = new THREE.Mesh(treeGeo, treeMat);
    t.position.set(x, WATER + s * 0.7, z);
    t.scale.set(s * (0.8 + r() * 0.5), s * (1 + r() * 0.6), s * (0.8 + r() * 0.5));
    root.add(t);
  };
  for (let i = 0; i < 70; i++) tree(-110 + i * 3.2 + r() * 2, -78 - r() * 10, 3 + r() * 3);
  for (let i = 0; i < 44; i++) {
    const side = i % 2 ? 1 : -1;
    tree(side * (34 + r() * 12), -70 + (i >> 1) * 4 + r() * 2, 2.5 + r() * 3);
  }
  const walls = [0xe8d8c0, 0xd9b8a0, 0xf0e6d0];
  const roofMat = std(keep, 0x8a3e32, 0.85);
  for (let i = 0; i < 9; i++) {
    const x = -44 + i * 11 + r() * 4,
      z = -74 + r() * 3;
    const w = 3 + r() * 2;
    root.add(block(w, 2.4 + r(), 3, std(keep, walls[i % 3]!, 0.85), x, WATER, z, keep));
    const roof = gableRoof(w + 0.4, 1.4, 3.4, roofMat, keep);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(x, WATER + 2.9, z);
    root.add(roof);
  }

  // Le ponton : ses planches le long de la piste, puis la terrasse
  const deckTex = keep(deckPlanks());
  const deckMat = std(keep, 0xffffff, 0.8, 0, { map: deckTex });
  const planks = (x0: number, x1: number, z0: number, z1: number) => {
    const g = keep(new THREE.PlaneGeometry(x1 - x0, z1 - z0));
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    // Les planches en travers du ponton
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (z0 + uv.getY(i) * (z1 - z0)) / 1.3, (x0 + uv.getX(i) * (x1 - x0)) / 1.3);
    const m = new THREE.Mesh(g, deckMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, TOP, -(z0 + z1) / 2);
    m.receiveShadow = true;
    root.add(m);
  };
  // Le long de la piste, de chaque côté (la piste et son élan ont leur propre plancher)
  const inner = GUTTER_OUTER + 0.1;
  planks(inner, DECK_W, -APPROACH, FRONT);
  planks(-DECK_W, -inner, -APPROACH, FRONT);
  // La terrasse derrière l'élan
  planks(-TERRACE, TERRACE, -BACK, -APPROACH);
  // L'épaisseur du ponton, ses bords, et les pieux dans l'eau
  const under = std(keep, 0x5a3c24, 0.9);
  root.add(block(2 * DECK_W, UNDER - WATER, FRONT + APPROACH, under, 0, WATER, (APPROACH - FRONT) / 2, keep));
  root.add(block(2 * TERRACE, UNDER - WATER, BACK - APPROACH, under, 0, WATER, (BACK + APPROACH) / 2, keep));
  for (const side of [-1, 1]) {
    root.add(block(0.1, TOP - WATER, FRONT + APPROACH, wood, side * (DECK_W - 0.05), WATER, (APPROACH - FRONT) / 2, keep));
    root.add(block(0.1, TOP - WATER, BACK - APPROACH, wood, side * (TERRACE - 0.05), WATER, (BACK + APPROACH) / 2, keep));
    root.add(block(TERRACE - DECK_W, TOP - WATER, 0.1, wood, (side * (TERRACE + DECK_W)) / 2, WATER, APPROACH + 0.05, keep));
  }
  root.add(block(2 * TERRACE, TOP - WATER, 0.1, wood, 0, WATER, BACK - 0.05, keep));
  root.add(block(2 * DECK_W, TOP - WATER, 0.1, wood, 0, WATER, -FRONT + 0.05, keep));
  const pile = keep(new THREE.CylinderGeometry(0.09, 0.1, 1, 10));
  for (let z = BACK - 0.3; z > -FRONT; z -= 2.2) {
    const w = z > APPROACH ? TERRACE : DECK_W;
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(pile, under);
      p.position.set(side * (w + 0.06), WATER + 0.2, z);
      root.add(p);
    }
  }

  // Les poteaux, la rambarde de corde, et les guirlandes de lampions
  const postGeo = keep(new THREE.CylinderGeometry(0.06, 0.075, POST_H, 10));
  const lane: THREE.Vector3[][] = [[], []];
  const post = (x: number, z: number) => {
    const p = new THREE.Mesh(postGeo, wood);
    p.position.set(x, POST_H / 2, z);
    root.add(p);
    return new THREE.Vector3(x, POST_H - 0.1, z);
  };
  for (let z = APPROACH - 0.4; z > -HEAD_PIN + 1; z -= 3.3) {
    lane[0]!.push(post(-(DECK_W - 0.12), z));
    lane[1]!.push(post(DECK_W - 0.12, z));
  }
  const tl = post(-(TERRACE - 0.12), BACK - 0.25),
    tr = post(TERRACE - 0.12, BACK - 0.25),
    fl = post(-(TERRACE - 0.12), APPROACH + 0.15),
    fr = post(TERRACE - 0.12, APPROACH + 0.15);
  const ropeMat = std(keep, 0xd9c49a, 0.9);
  for (const row of lane) {
    const pts = row.map((p) => new THREE.Vector3(p.x, 0.8, p.z));
    root.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.018, 6)), ropeMat));
  }
  for (const [a, b] of [
    [tl, fl],
    [tr, fr],
    [tl, tr],
  ] as const) {
    const line = new THREE.LineCurve3(new THREE.Vector3(a.x, 0.8, a.z), new THREE.Vector3(b.x, 0.8, b.z));
    root.add(new THREE.Mesh(keep(new THREE.TubeGeometry(line, 4, 0.018, 6)), ropeMat));
  }
  const colors = [0xff6b6b, 0xffd166, 0x6bd0ff, 0x9df06b, 0xff9de0, 0xffa94d];
  const [left, right] = lane as [THREE.Vector3[], THREE.Vector3[]];
  // En travers de la piste, d'un poteau à l'autre
  for (let i = 0; i < left.length; i++) root.add(lampions(left[i]!, right[i]!, 0.45, colors, keep, 13));
  // Le long, de poteau en poteau
  for (const row of lane) for (let i = 0; i + 1 < row.length; i++) root.add(lampions(row[i]!, row[i + 1]!, 0.22, colors, keep, 9));
  // Au-dessus de la terrasse, le long des bords
  root.add(lampions(tl, tr, 0.4, colors, keep, 18), lampions(tl, fl, 0.3, colors, keep, 12), lampions(tr, fr, 0.3, colors, keep, 12));
  root.add(lampions(fl, left[0]!, 0.2, colors, keep, 6), lampions(fr, right[0]!, 0.2, colors, keep, 6));

  // La cabane de la machine, au bout de la piste : ses côtés, son fond, sa façade au-dessus de l'enseigne, son toit
  const cabZ0 = HEAD_PIN - 0.83,
    cabZ1 = CUSHION + 0.25,
    cabX = GUTTER_OUTER + 0.1;
  for (const side of [-1, 1]) root.add(block(0.14, 2.7, cabZ1 - cabZ0, paint, side * (cabX + 0.03), UNDER, -(cabZ0 + cabZ1) / 2, keep));
  root.add(block(2 * cabX + 0.2, 2.7, 0.12, paint, 0, UNDER, -cabZ1, keep));
  root.add(block(2 * cabX + 0.2, 2.35 - CEIL_Y - 0.62, 0.1, paint, 0, CEIL_Y + 0.62, -cabZ0 - 0.05, keep));
  // La planche peinte au-dessus de l'enseigne
  root.add(block(2 * cabX + 0.3, 0.06, 0.16, std(keep, 0xf3e2b5, 0.6), 0, CEIL_Y + 0.62, -cabZ0, keep));
  const roof = gableRoof(2 * cabX + 0.9, 0.9, cabZ1 - cabZ0 + 0.8, roofMat, keep);
  roof.position.set(0, 2.32, -(cabZ0 + cabZ1) / 2);
  root.add(roof);
  // Une lanterne de chaque côté de l'enseigne
  const lampGeo = keep(new THREE.SphereGeometry(0.07, 14, 10));
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 1.0) }));
  for (const side of [-1, 1]) {
    const l = new THREE.Mesh(lampGeo, lampMat);
    l.position.set(side * (cabX + 0.2), 1.25, -cabZ0 + 0.12);
    l.userData.reflect = true;
    root.add(l);
  }

  // Le retour de boules, à gauche de l'élan
  ballReturn(root, keep, -(GUTTER_OUTER + 0.42), wood, std(keep, 0xc0a070, 0.3, 0.8), 3);

  // La terrasse : des tables à nappe à carreaux, leurs chaises, des bouteilles, et le banc des joueurs
  const checksTex = keep(checks());
  checksTex.repeat.set(3, 2);
  const cloth = std(keep, 0xffffff, 0.9, 0, { map: checksTex });
  const glass = phys(keep, { color: 0x2e6b3a, roughness: 0.1, transparent: true, opacity: 0.85 });
  const bottleGeo = keep(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 10));
  const chairMat = std(keep, 0x3a6ea5, 0.6);
  for (const [x, z] of [
    [-3.3, 5.6],
    [3.3, 5.6],
    [-3.3, 8.2],
    [3.3, 8.2],
  ] as const) {
    root.add(block(1.1, 0.04, 0.8, cloth, x, 0.72, z, keep));
    root.add(block(1.12, 0.14, 0.82, cloth, x, 0.6, z, keep));
    root.add(block(0.08, 0.6, 0.08, wood, x, 0, z, keep));
    for (const dx of [-0.72, 0.72]) {
      root.add(block(0.4, 0.04, 0.4, chairMat, x + dx, 0.42, z, keep));
      root.add(block(0.04, 0.42, 0.04, chairMat, x + dx, 0, z, keep));
      root.add(block(0.04, 0.42, 0.4, chairMat, x + dx + Math.sign(dx) * 0.2, 0.46, z, keep));
    }
    const b = new THREE.Mesh(bottleGeo, glass);
    b.position.set(x + 0.15, 0.89, z - 0.1);
    root.add(b);
  }
  const bench = straightBench(root, keep, wood, 6.9, 4.4);

  // Les lucioles, au-dessus de l'eau
  const N = 110;
  const fp = new Float32Array(N * 3);
  const base = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const side = i % 2 ? 1 : -1;
    base[i * 3] = fp[i * 3] = side * (DECK_W + 0.6 + r() * 7);
    base[i * 3 + 1] = fp[i * 3 + 1] = 0.1 + r() * 2.2;
    base[i * 3 + 2] = fp[i * 3 + 2] = 9 - r() * 30;
  }
  const flyGeo = keep(new THREE.BufferGeometry());
  flyGeo.setAttribute("position", new THREE.BufferAttribute(fp, 3));
  const flies = new THREE.Points(
    flyGeo,
    keep(
      new THREE.PointsMaterial({
        color: new THREE.Color(2.0, 1.9, 0.7),
        size: 0.07,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  flies.frustumCulled = false;
  flies.userData.live = true;
  root.add(flies);

  // La lumière : le soleil bas et chaud, le ciel, la chaleur des lampions
  const sunLight = new THREE.DirectionalLight(0xffb27a, 2.0);
  sunLight.position.set(-12, 7, -14);
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  const sc = sunLight.shadow.camera;
  sc.left = -7;
  sc.right = 7;
  sc.top = 9;
  sc.bottom = -9;
  sc.near = 1;
  sc.far = 45;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  root.add(sunLight, sunLight.target);
  const glow = new THREE.PointLight(0xffc27a, 5, 12, 1.5);
  glow.position.set(0, 2.6, 6);
  root.add(glow);
  const glow2 = new THREE.PointLight(0xffb070, 3, 10, 1.5);
  glow2.position.set(0, 2.4, -6);
  root.add(glow2);

  mergeStatic(root, keep);

  return {
    style,
    neighbors: 0,
    root,
    background: new THREE.Color(0x5a4f9a),
    fog: new THREE.Fog(0xd99a88, 28, 175),
    hemi: [0xffc6a8, 0x3a3050, 0.75],
    env: 0.75,
    exposure: 1.0,
    bloom: [0.38, 0.4, 0.9],
    grade: { warm: 0.07, sat: 1.12, vignette: 0.3 },
    bench,
    update: (t) => {
      waterTex.offset.set(t * 0.004, t * 0.01);
      for (let i = 0; i < N; i++) {
        fp[i * 3] = base[i * 3]! + Math.sin(t * 0.6 + i) * 0.4;
        fp[i * 3 + 1] = base[i * 3 + 1]! + Math.sin(t * 1.1 + i * 2) * 0.25;
        fp[i * 3 + 2] = base[i * 3 + 2]! + Math.cos(t * 0.45 + i) * 0.4;
      }
      (flyGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    },
    dispose,
  };
}
