// Le temple antique : trois pistes dans la nef d'un temple de marbre, ouverte sur le ciel du soir. Deux colonnades
// cannelées portent leur frise de triglyphes, des braseros de bronze brûlent entre les colonnes et au bout des pistes ;
// des statues drapées veillent sur leurs socles devant les murs peints de rouge pompéien ; au fond, le grand fronton
// sculpté (une boule et ses quilles entre deux branches de laurier) ; derrière le banc de pierre, la grande porte ouvre
// sur les cyprès et la lune.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { APPROACH, CUSHION, HEAD_PIN, PIT_DEPTH } from "../../../../shared/games/bowling/lane.ts";
import { CEIL_Y, LANE_PITCH } from "../laneMesh.ts";
import { seeded } from "../textures.ts";
import {
  ballReturn,
  bin,
  block,
  canvasTex,
  mergeStatic,
  neighborPinsInstanced,
  phys,
  skyDome,
  std,
  straightBench,
  type Keep,
  type Salle,
} from "./common.ts";

const NEIGHBORS = 1;
const OUR_LANE = 2;
const LANES_HALF = (NEIGHBORS + 0.5) * LANE_PITCH;
/** L'axe des colonnes, puis le mur du fond des bas-côtés */
const COL_X = LANES_HALF + 1.7;
const WALL_X = COL_X + 2.2;
const BACK = 10.5;
const END_Z = HEAD_PIN - 0.83;
const HOUSE_Z1 = CUSHION + 0.4;
const HOUSE_X = LANES_HALF + 0.3;
const UNDER = -PIT_DEPTH - 0.06;
/** La hauteur des colonnes (de la base au tailloir), puis de l'entablement */
const SHAFT = 5.0;
const COL_H = SHAFT + 0.68;
const ENT_TOP = COL_H + 1.25;
const PED_H = 2.6;

/** Le marbre : des dalles claires veinées de gris, en quinconce */
function marbleArt(seed: number, base: [number, number, number], slabs = 2): THREE.CanvasTexture {
  return canvasTex(
    512,
    512,
    (g) => {
      const r = seeded(seed);
      const s = 512 / slabs;
      for (let i = 0; i < slabs; i++) {
        for (let j = 0; j < slabs; j++) {
          const k = 0.92 + r() * 0.1;
          g.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
          g.fillRect(i * s, j * s, s, s);
          for (let v = 0; v < 5; v++) {
            g.strokeStyle = `rgba(120,110,100,${0.08 + r() * 0.14})`;
            g.lineWidth = 0.8 + r() * 1.6;
            g.beginPath();
            let x = i * s + r() * s,
              y = j * s;
            g.moveTo(x, y);
            for (let t = 0; t < 8; t++) {
              x += (r() - 0.5) * 40;
              y += s / 8;
              g.lineTo(x, y);
            }
            g.stroke();
          }
          g.fillStyle = "rgba(60,50,40,0.35)";
          g.fillRect(i * s, j * s, s, 2);
          g.fillRect(i * s, j * s, 2, s);
        }
      }
    },
    true,
  );
}

/** Les assises de pierre des murs */
function ashlar(): THREE.CanvasTexture {
  return canvasTex(
    512,
    256,
    (g) => {
      const r = seeded(19);
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? 128 : 0;
        for (let x = -off; x < 512; x += 256) {
          const k = 0.9 + r() * 0.1;
          g.fillStyle = `rgb(${232 * k},${222 * k},${204 * k})`;
          g.fillRect(x, row * 64, 256, 64);
          g.fillStyle = "rgba(80,66,50,0.35)";
          g.fillRect(x, row * 64, 2, 64);
        }
        g.fillStyle = "rgba(80,66,50,0.35)";
        g.fillRect(0, row * 64, 512, 2);
      }
    },
    true,
  );
}

/** La frise de triglyphes et de métopes */
function frieze(): THREE.CanvasTexture {
  return canvasTex(
    512,
    128,
    (g) => {
      g.fillStyle = "#e8dcc4";
      g.fillRect(0, 0, 512, 128);
      for (let x = 0; x < 512; x += 128) {
        g.fillStyle = "#c8b898";
        g.fillRect(x, 8, 44, 112);
        g.fillStyle = "#9a8a6c";
        for (const dx of [10, 22, 34]) g.fillRect(x + dx - 3, 14, 6, 100);
        // La métope : une petite couronne de laurier
        g.strokeStyle = "#a89878";
        g.lineWidth = 4;
        g.beginPath();
        g.arc(x + 86, 64, 22, 0.4, Math.PI * 2 - 0.4);
        g.stroke();
      }
      g.fillStyle = "#b8a888";
      g.fillRect(0, 0, 512, 8);
      g.fillRect(0, 120, 512, 8);
    },
    true,
  );
}

/** Les murs peints des bas-côtés : des panneaux rouge pompéien entre des bandes noires, des filets dorés */
function fresco(): THREE.CanvasTexture {
  return canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = "#1e1612";
      g.fillRect(0, 0, 512, 512);
      g.fillStyle = "#9a2a20";
      g.fillRect(24, 90, 464, 330);
      g.strokeStyle = "#d8b060";
      g.lineWidth = 3;
      g.strokeRect(40, 106, 432, 298);
      g.fillStyle = "#c8a070";
      g.fillRect(0, 440, 512, 72);
      g.fillStyle = "#1e1612";
      for (let x = 0; x < 512; x += 32) {
        // La grecque du soubassement
        g.fillRect(x, 452, 24, 4);
        g.fillRect(x + 20, 452, 4, 40);
        g.fillRect(x + 8, 488, 16, 4);
        g.fillRect(x + 8, 466, 4, 26);
      }
      // Un oiseau et une guirlande peints au milieu du panneau
      g.strokeStyle = "#e8c88a";
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(140, 200);
      g.quadraticCurveTo(256, 280, 372, 200);
      g.stroke();
      for (let k = 0; k < 9; k++) {
        const u = k / 8;
        const x = 140 + u * 232,
          y = 200 + Math.sin(u * Math.PI) * 40;
        g.fillStyle = k % 2 ? "#5a8a3a" : "#7aa84a";
        g.beginPath();
        g.ellipse(x, y, 9, 5, u * 2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#e8c88a";
      g.beginPath();
      g.ellipse(256, 320, 20, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(240, 316);
      g.lineTo(206, 296);
      g.lineTo(234, 326);
      g.fill();
      g.beginPath();
      g.arc(274, 312, 8, 0, Math.PI * 2);
      g.fill();
    },
    true,
  );
}

/** Le tympan du fronton : une boule et ses quilles sculptées entre deux branches de laurier, et une inscription */
function pedimentArt(): THREE.CanvasTexture {
  return canvasTex(2048, 404, (g) => {
    const W = 2048,
      H = 404;
    // Le fond du tympan, en retrait (dans l'ombre)
    g.fillStyle = "#a8987c";
    g.fillRect(0, 0, W, H);
    // Le relief : une ombre portée en bas à droite, une arête de lumière en haut à gauche
    const carve = (draw: () => void) => {
      g.save();
      g.translate(9, 9);
      g.fillStyle = "rgba(50,38,24,0.8)";
      draw();
      g.restore();
      g.save();
      g.translate(-3, -3);
      g.fillStyle = "#fffaf0";
      draw();
      g.restore();
      g.fillStyle = "#f0e6d0";
      draw();
    };
    const pin = (x: number, s: number) => {
      g.beginPath();
      g.ellipse(x, H - 40 - 150 * s, 16 * s, 22 * s, 0, 0, Math.PI * 2);
      g.ellipse(x, H - 40 - 60 * s, 30 * s, 62 * s, 0, 0, Math.PI * 2);
      g.rect(x - 9 * s, H - 40 - 140 * s, 18 * s, 70 * s);
      g.fill();
    };
    carve(() => {
      g.beginPath();
      g.arc(W / 2, H - 150, 110, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = "rgba(90,74,54,0.6)";
    for (const [dx, dy] of [
      [-30, -40],
      [10, -52],
      [-4, -8],
    ] as const) {
      g.beginPath();
      g.arc(W / 2 + dx, H - 150 + dy, 13, 0, Math.PI * 2);
      g.fill();
    }
    for (const [x, s] of [
      [W / 2 - 230, 1.15],
      [W / 2 - 330, 1.0],
      [W / 2 + 230, 1.15],
      [W / 2 + 330, 1.0],
      [W / 2 - 430, 0.85],
      [W / 2 + 430, 0.85],
    ] as const)
      carve(() => pin(x, s));
    // Les branches de laurier, jusque dans les angles
    for (const side of [-1, 1]) {
      carve(() => {
        for (let k = 0; k < 14; k++) {
          const u = k / 13;
          const x = W / 2 + side * (520 + u * 380),
            y = H - 60 - (1 - u) * 120;
          g.beginPath();
          g.ellipse(x, y - 14, 26, 10, side * (0.6 + u), 0, Math.PI * 2);
          g.ellipse(x + side * 10, y + 14, 26, 10, -side * (0.6 + u), 0, Math.PI * 2);
          g.fill();
        }
      });
    }
    g.fillStyle = "rgba(90,74,54,0.55)";
    g.fillRect(0, H - 14, W, 14);
  });
}

/** Le cadre au-dessus des quilles : une grecque, et le numéro de la piste en chiffres romains */
function maskingArt(n: number): THREE.CanvasTexture {
  return canvasTex(1024, 320, (g) => {
    g.fillStyle = "#1e1612";
    g.fillRect(0, 0, 1024, 320);
    g.fillStyle = "#9a2a20";
    g.fillRect(20, 60, 984, 200);
    g.fillStyle = "#d8b060";
    for (let x = 0; x < 1024; x += 40) {
      for (const y of [14, 270]) {
        g.fillRect(x, y, 30, 6);
        g.fillRect(x + 24, y, 6, 36);
        g.fillRect(x + 10, y + 30, 20, 6);
        g.fillRect(x + 10, y + 16, 6, 20);
      }
    }
    g.font = "bold 120px 'Times New Roman', Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#f0dca0";
    g.fillText(["I", "II", "III"][(n - 1) % 3]!, 512, 168);
  });
}

/** Une colonne dorique : la base, le fût cannelé qui s'affine un peu, le chapiteau */
function columnGeometry(r: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const plinth = new THREE.BoxGeometry(r * 2.7, 0.18, r * 2.7);
  plinth.translate(0, 0.09, 0);
  const torus = new THREE.TorusGeometry(r * 1.06, 0.08, 8, 40);
  torus.rotateX(Math.PI / 2);
  torus.translate(0, 0.24, 0);
  const shaft = new THREE.CylinderGeometry(r * 0.84, r, SHAFT, 60, 6, true);
  const p = shaft.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    const a = Math.atan2(z, x);
    const f = 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * 10)), 0.7);
    p.setXYZ(i, x * f, p.getY(i), z * f);
  }
  shaft.computeVertexNormals();
  shaft.translate(0, 0.3 + SHAFT / 2, 0);
  const echinus = new THREE.CylinderGeometry(r * 1.18, r * 0.84, 0.22, 40);
  echinus.translate(0, 0.3 + SHAFT + 0.11, 0);
  const abacus = new THREE.BoxGeometry(r * 2.6, 0.16, r * 2.6);
  abacus.translate(0, 0.3 + SHAFT + 0.3, 0);
  parts.push(plinth, torus, shaft, echinus, abacus);
  const g = mergeGeometries(
    parts.map((x) => x.toNonIndexed()),
    false,
  )!;
  for (const x of parts) x.dispose();
  return g;
}

/** Une statue drapée sur son socle ; ses bras selon la pose, une boule de pierre dans une main levée */
function statue(root: THREE.Object3D, keep: Keep, mat: THREE.Material, x: number, z: number, yaw: number, pose: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  g.add(block(0.72, 1.0, 0.72, mat, 0, 0, 0, keep));
  g.add(block(0.84, 0.08, 0.84, mat, 0, 1.0, 0, keep));
  g.add(block(0.84, 0.08, 0.84, mat, 0, 0, 0, keep));
  const robe = new THREE.LatheGeometry(
    [
      [0.001, 0],
      [0.25, 0],
      [0.27, 0.08],
      [0.23, 0.5],
      [0.19, 0.95],
      [0.2, 1.12],
      [0.22, 1.24],
      [0.17, 1.36],
      [0.07, 1.42],
      [0.001, 1.44],
    ].map(([a, b]) => new THREE.Vector2(a!, b!)),
    24,
  );
  const body = new THREE.Mesh(keep(robe), mat);
  body.position.y = 1.08;
  body.scale.set(1, 1, 0.75);
  g.add(body);
  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.115, 16, 12)), mat);
  head.position.set(0, 2.66, 0.01);
  const bun = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 8)), mat);
  bun.position.set(0, 2.72, -0.09);
  g.add(head, bun);
  const arm = (side: number, a: number, b: number, len = 0.62) => {
    const m = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.045, len, 4, 8)), mat);
    const sh = new THREE.Vector3(side * 0.22, 2.42, 0);
    const dir = new THREE.Vector3(Math.sin(a) * side, -Math.cos(a), Math.sin(b)).normalize();
    m.position.copy(sh).addScaledVector(dir, len / 2 + 0.02);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    g.add(m);
    return sh.clone().addScaledVector(dir, len + 0.08);
  };
  if (pose === 0) {
    const hand = arm(1, 2.6, 0.3);
    const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.12, 16, 12)), mat);
    ball.position.copy(hand).add(new THREE.Vector3(0, 0.08, 0));
    g.add(ball);
    arm(-1, 0.25, 0.1);
  } else if (pose === 1) {
    arm(1, 0.3, 0.5);
    arm(-1, 0.5, 0.9, 0.5);
  } else {
    const hand = arm(-1, 1.4, 1.2);
    const wreath = new THREE.Mesh(keep(new THREE.TorusGeometry(0.1, 0.025, 8, 20)), mat);
    wreath.position.copy(hand);
    g.add(wreath);
    arm(1, 0.2, 0.2);
  }
  root.add(g);
}

/** Un brasero de bronze sur son trépied, ses flammes qui dansent */
function brazier(root: THREE.Object3D, keep: Keep, bronze: THREE.Material, x: number, z: number, h: number): THREE.Mesh[] {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.03, h, 6)), bronze);
    leg.position.set(x + Math.cos(a) * 0.16, h / 2, z + Math.sin(a) * 0.16);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    root.add(leg);
  }
  const bowl = new THREE.Mesh(keep(new THREE.SphereGeometry(0.32, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), bronze);
  bowl.position.set(x, h + 0.28, z);
  root.add(bowl);
  const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(0.32, 0.025, 6, 24)), bronze);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, h + 0.28, z);
  root.add(rim);
  const embers = new THREE.Mesh(
    keep(new THREE.CircleGeometry(0.3, 20)),
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.6, 0.15) })),
  );
  embers.rotation.x = -Math.PI / 2;
  embers.position.set(x, h + 0.25, z);
  root.add(embers);
  const fire = new THREE.Group();
  fire.userData.live = true;
  const flames = [0xff6a1a, 0xffa02e, 0xffe08a].map((c, i) => {
    const m = new THREE.Mesh(
      keep(new THREE.ConeGeometry(0.2 - i * 0.05, 0.6 - i * 0.14, 8)),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), transparent: true, opacity: 0.9 })),
    );
    m.position.set(x + (i - 1) * 0.07, h + 0.5, z + (i % 2) * 0.05);
    fire.add(m);
    return m;
  });
  root.add(fire);
  return flames;
}

export function templeSalle(): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const r = seeded(41);
  const masks = new Map<number, THREE.Material>();
  for (let i = -NEIGHBORS; i <= NEIGHBORS; i++) {
    const t = keep(maskingArt(OUR_LANE + i));
    masks.set(OUR_LANE + i, std(keep, 0xffffff, 0.7, 0, { map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.15 }));
  }
  const marble = std(keep, 0xf2ece0, 0.45);
  const bronze = phys(keep, { color: 0xa87a3a, metalness: 0.85, roughness: 0.38 });
  const gold = phys(keep, { color: 0xd8b060, metalness: 0.9, roughness: 0.3 });
  const style = {
    gutter: 0x2a2420,
    gutterMetal: 0.15,
    capping: phys(keep, { color: 0xe8e0d0, roughness: 0.3, clearcoat: 0.6 }),
    kickback: std(keep, 0x9a2a20, 0.6),
    masking: masks.get(OUR_LANE)!,
    deckLight: 0xffe8c8,
    deckLightPower: 2.4,
    reflect: 0.5,
    wood: 0xfff0e0,
  };

  // Le ciel du soir au-dessus de la nef, ses premières étoiles, la lune
  root.add(
    skyDome(keep, [
      [0, "#0a1230"],
      [0.3, "#1c2a5c"],
      [0.42, "#4a3a6c"],
      [0.48, "#b8705c"],
      [0.5, "#e2a070"],
      [0.52, "#2a1a18"],
      [1, "#100808"],
    ]),
  );
  const starPos: number[] = [];
  for (let i = 0; i < 400; i++) {
    const a = r() * Math.PI * 2,
      h = 0.25 + r() * 0.75;
    const rr = Math.sqrt(1 - h * h);
    starPos.push(Math.cos(a) * rr * 160, h * 160, Math.sin(a) * rr * 160);
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  root.add(
    new THREE.Points(
      starGeo,
      keep(new THREE.PointsMaterial({ color: new THREE.Color(1.3, 1.3, 1.5), size: 1.4, sizeAttenuation: false, fog: false })),
    ),
  );
  const moonTex = keep(
    canvasTex(128, 128, (g) => {
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, "rgba(255,250,235,1)");
      grd.addColorStop(0.42, "rgba(250,244,225,1)");
      grd.addColorStop(0.5, "rgba(220,225,255,0.35)");
      grd.addColorStop(1, "rgba(200,210,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "rgba(200,190,170,0.5)";
      for (const [x, y, s] of [
        [52, 54, 9],
        [74, 70, 6],
        [60, 78, 5],
      ] as const) {
        g.beginPath();
        g.arc(x, y, s, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
  const moon = new THREE.Sprite(
    keep(new THREE.SpriteMaterial({ map: moonTex, color: new THREE.Color(1.6, 1.6, 1.6), fog: false, depthWrite: false })),
  );
  moon.position.set(-32, 34, -150);
  moon.scale.set(16, 16, 1);
  root.add(moon);

  // Le sol de marbre de la nef et des bas-côtés (les pistes et leur élan ont le leur)
  const floorTex = keep(marbleArt(3, [236, 228, 214], 2));
  const floorShape = new THREE.Shape();
  floorShape.moveTo(-WALL_X, -BACK);
  floorShape.lineTo(WALL_X, -BACK);
  floorShape.lineTo(WALL_X, END_Z + 0.1);
  floorShape.lineTo(-WALL_X, END_Z + 0.1);
  floorShape.lineTo(-WALL_X, -BACK);
  const hole = new THREE.Path();
  hole.moveTo(-LANES_HALF, -APPROACH);
  hole.lineTo(LANES_HALF, -APPROACH);
  hole.lineTo(LANES_HALF, END_Z + 0.2);
  hole.lineTo(-LANES_HALF, END_Z + 0.2);
  hole.lineTo(-LANES_HALF, -APPROACH);
  floorShape.holes.push(hole);
  const floorGeo = keep(new THREE.ShapeGeometry(floorShape));
  floorGeo.rotateX(-Math.PI / 2);
  const fp = floorGeo.getAttribute("position") as THREE.BufferAttribute;
  const fuv = floorGeo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) fuv.setXY(i, fp.getX(i) / 2.4, fp.getZ(i) / 2.4);
  const floor = new THREE.Mesh(floorGeo, phys(keep, { color: 0xffffff, map: floorTex, roughness: 0.25, clearcoat: 0.5 }));
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  root.add(floor);
  const pit = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * LANES_HALF, HOUSE_Z1)), std(keep, 0x100c08, 1));
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(0, UNDER, -HOUSE_Z1 / 2);
  root.add(pit);

  // Les deux colonnades et leur entablement
  const colGeo = keep(columnGeometry(0.36));
  const colZ: number[] = [];
  for (let z = BACK - 2.6; z > -END_Z + 1; z -= 3.0) colZ.push(z);
  for (const side of [-1, 1]) {
    for (const z of colZ) {
      const c = new THREE.Mesh(colGeo, marble);
      c.position.set(side * COL_X, 0, z);
      root.add(c);
    }
    const len = BACK + END_Z;
    const zc = (BACK - END_Z) / 2;
    const ash = keep(ashlar());
    ash.repeat.set(len / 4, 1);
    root.add(block(1.05, 0.55, len, std(keep, 0xffffff, 0.5, 0, { map: ash }), side * COL_X, COL_H, zc, keep));
    const fr = keep(frieze());
    fr.repeat.set(len / 2.2, 1);
    root.add(block(1.0, 0.6, len, std(keep, 0xffffff, 0.55, 0, { map: fr }), side * COL_X, COL_H + 0.55, zc, keep));
    root.add(block(1.3, 0.12, len, marble, side * COL_X, COL_H + 1.13, zc, keep));
    // Le plafond des bas-côtés, sombre, à caissons
    const coffer = keep(
      canvasTex(
        128,
        128,
        (g) => {
          g.fillStyle = "#3a2c20";
          g.fillRect(0, 0, 128, 128);
          g.fillStyle = "#24180e";
          g.fillRect(14, 14, 100, 100);
          g.fillStyle = "#1a2a5a";
          g.fillRect(30, 30, 68, 68);
          g.fillStyle = "#d8b060";
          g.beginPath();
          g.arc(64, 64, 8, 0, Math.PI * 2);
          g.fill();
        },
        true,
      ),
    );
    coffer.repeat.set(2, len / 1.2);
    root.add(
      block(
        WALL_X - COL_X + 0.5,
        0.1,
        len,
        std(keep, 0xffffff, 0.9, 0, { map: coffer }),
        (side * (WALL_X + COL_X)) / 2,
        COL_H + 1.13,
        zc,
        keep,
      ),
    );
    // Le mur peint, ses statues et ses braseros
    const fres = keep(fresco());
    fres.repeat.set(len / 3, 1);
    root.add(block(0.3, COL_H + 1.25, len, std(keep, 0xffffff, 0.8, 0, { map: fres }), side * (WALL_X + 0.15), 0, zc, keep));
  }
  const flames: THREE.Mesh[] = [];
  colZ.slice(0, -1).forEach((z, i) => {
    const mid = z - 1.5;
    for (const side of [-1, 1]) {
      if (i % 2 === 0)
        statue(root, keep, marble, side * (WALL_X - 0.6), mid, side > 0 ? -Math.PI / 2 : Math.PI / 2, (i / 2 + (side > 0 ? 1 : 0)) % 3);
      else flames.push(...brazier(root, keep, bronze, side * (WALL_X - 0.8), mid, 1.05));
    }
  });

  // Au bout des pistes : le mur de pierre, puis le grand fronton sculpté
  const endTex = keep(ashlar());
  endTex.repeat.set((2 * WALL_X) / 4, (ENT_TOP - CEIL_Y - 0.62) / 2);
  const endMat = std(keep, 0xffffff, 0.55, 0, { map: endTex });
  root.add(block(2 * WALL_X, ENT_TOP - CEIL_Y - 0.62, 0.3, endMat, 0, CEIL_Y + 0.62, -END_Z - 0.15, keep));
  const lowTex = keep(ashlar());
  lowTex.repeat.set((WALL_X - LANES_HALF) / 4, 0.4);
  for (const side of [-1, 1])
    root.add(
      block(
        WALL_X - LANES_HALF,
        CEIL_Y + 0.62 - UNDER,
        0.3,
        std(keep, 0xffffff, 0.55, 0, { map: lowTex }),
        (side * (WALL_X + LANES_HALF)) / 2,
        UNDER,
        -END_Z - 0.15,
        keep,
      ),
    );
  root.add(block(2 * HOUSE_X + 0.3, 0.1, 0.36, gold, 0, CEIL_Y + 0.6, -END_Z - 0.12, keep));
  const fr = keep(frieze());
  fr.repeat.set((2 * WALL_X) / 2.2, 1);
  root.add(block(2 * WALL_X + 0.1, 0.6, 0.4, std(keep, 0xffffff, 0.55, 0, { map: fr }), 0, ENT_TOP - 0.72, -END_Z - 0.1, keep));
  root.add(block(2 * WALL_X + 0.5, 0.12, 0.6, marble, 0, ENT_TOP - 0.12, -END_Z - 0.1, keep));
  const ped = new THREE.Shape();
  const PW = WALL_X + 0.2;
  ped.moveTo(-PW, 0);
  ped.lineTo(PW, 0);
  ped.lineTo(0, PED_H);
  ped.lineTo(-PW, 0);
  const pedTex = keep(pedimentArt());
  pedTex.repeat.set(1 / (2 * PW), 1 / PED_H);
  pedTex.offset.set(0.5, 0);
  const pediment = new THREE.Mesh(
    keep(new THREE.ExtrudeGeometry(ped, { depth: 0.4, bevelEnabled: false })),
    std(keep, 0xffffff, 0.5, 0, { map: pedTex, emissiveMap: pedTex, emissive: 0xffd8a0, emissiveIntensity: 0.14 }),
  );
  pediment.position.set(0, ENT_TOP, -END_Z - 0.4);
  root.add(pediment);
  // Sur le mur, l'inscription dorée entre deux boucliers
  const insTex = keep(
    canvasTex(1024, 128, (g) => {
      g.fillStyle = "#6a1610";
      g.fillRect(0, 0, 1024, 128);
      g.strokeStyle = "#d8b060";
      g.lineWidth = 5;
      g.strokeRect(8, 8, 1008, 112);
      g.font = "bold 74px 'Times New Roman', Georgia, serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#f0cc78";
      g.fillText("LVDVS · PILARVM", 512, 68);
    }),
  );
  root.add(
    block(
      5.4,
      0.68,
      0.04,
      std(keep, 0xffffff, 0.5, 0, { map: insTex, emissiveMap: insTex, emissive: 0xffffff, emissiveIntensity: 0.12 }),
      0,
      3.4,
      -END_Z + 0.02,
      keep,
    ),
  );
  for (const side of [-1, 1]) {
    const shield = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.48, 0.48, 0.06, 40)), gold);
    shield.rotation.x = Math.PI / 2;
    shield.position.set(side * 3.75, 3.74, -END_Z + 0.04);
    const boss = new THREE.Mesh(keep(new THREE.SphereGeometry(0.12, 16, 10)), gold);
    boss.position.set(side * 3.75, 3.74, -END_Z + 0.08);
    root.add(shield, boss);
  }
  const slope = Math.atan2(PED_H, PW);
  const rakeLen = Math.hypot(PW, PED_H) + 0.3;
  for (const side of [-1, 1]) {
    const rake = block(rakeLen, 0.16, 0.6, marble, 0, 0, 0, keep);
    rake.position.set((side * PW) / 2, ENT_TOP + PED_H / 2 + 0.1, -END_Z - 0.1);
    rake.rotation.z = -side * slope;
    root.add(rake);
    const acro = new THREE.Mesh(keep(new THREE.ConeGeometry(0.22, 0.5, 4)), gold);
    acro.position.set(side * (PW + 0.1), ENT_TOP + 0.35, -END_Z - 0.1);
    root.add(acro);
  }
  const apex = new THREE.Mesh(keep(new THREE.SphereGeometry(0.22, 16, 10)), gold);
  apex.position.set(0, ENT_TOP + PED_H + 0.3, -END_Z - 0.1);
  root.add(apex);
  // Derrière, la baraque de la machine
  for (const side of [-1, 1])
    root.add(block(0.12, 3.0 - UNDER, HOUSE_Z1 - END_Z, std(keep, 0x2a201a, 0.9), side * HOUSE_X, UNDER, -(END_Z + HOUSE_Z1) / 2, keep));
  root.add(block(2 * HOUSE_X, 3.0 - UNDER, 0.12, std(keep, 0x2a201a, 0.9), 0, UNDER, -HOUSE_Z1, keep));
  root.add(block(2 * HOUSE_X, 0.1, HOUSE_Z1 - END_Z, std(keep, 0x2a201a, 0.9), 0, 3.0, -(END_Z + HOUSE_Z1) / 2, keep));
  // Les deux grands braseros au bout des pistes
  for (const side of [-1, 1]) flames.push(...brazier(root, keep, bronze, side * (LANES_HALF + 0.75), -END_Z + 0.9, 1.25));

  // Le mur de l'entrée derrière le banc, sa grande porte ouverte sur la nuit, les cyprès dehors
  const doorW = 1.3,
    doorH = 4.2;
  const entTex = keep(ashlar());
  entTex.repeat.set((WALL_X - doorW) / 4, ENT_TOP / 2);
  const entMat = std(keep, 0xffffff, 0.55, 0, { map: entTex });
  for (const side of [-1, 1]) root.add(block(WALL_X - doorW, ENT_TOP, 0.4, entMat, (side * (WALL_X + doorW)) / 2, 0, BACK + 0.2, keep));
  root.add(block(2 * doorW, ENT_TOP - doorH, 0.4, entMat, 0, doorH, BACK + 0.2, keep));
  root.add(block(2 * doorW + 0.5, 0.25, 0.5, marble, 0, doorH, BACK, keep));
  for (const side of [-1, 1]) root.add(block(0.25, doorH, 0.5, marble, side * (doorW + 0.12), 0, BACK, keep));
  const outside = new THREE.Mesh(keep(new THREE.PlaneGeometry(60, 40)), std(keep, 0x1a1a14, 1));
  outside.rotation.x = -Math.PI / 2;
  outside.position.set(0, -0.01, BACK + 20.4);
  root.add(outside);
  const cypress = std(keep, 0x14241a, 0.95);
  for (let k = 0; k < 9; k++) {
    const c = new THREE.Mesh(keep(new THREE.ConeGeometry(0.7 + r() * 0.4, 5 + r() * 3, 10)), cypress);
    c.position.set(-9 + k * 2.3 + r(), 3, BACK + 7 + r() * 6);
    root.add(c);
  }

  // Le banc de pierre, des amphores, le retour de boules
  const bench = straightBench(root, keep, marble, 7.0, 4.8);
  const amphoraGeo = keep(
    new THREE.LatheGeometry(
      [
        [0.001, 0],
        [0.06, 0.02],
        [0.16, 0.2],
        [0.24, 0.45],
        [0.22, 0.7],
        [0.1, 0.86],
        [0.08, 1.0],
        [0.11, 1.04],
        [0.001, 1.05],
      ].map(([a, b]) => new THREE.Vector2(a!, b!)),
      20,
    ),
  );
  const terracotta = std(keep, 0xb8603a, 0.7);
  for (const [x, z] of [
    [-3.4, 8.8],
    [-2.9, 9.4],
    [3.3, 9.0],
  ] as const) {
    const a = new THREE.Mesh(amphoraGeo, terracotta);
    a.position.set(x, 0, z);
    root.add(a);
  }
  ballReturn(root, keep, -0.5 * LANE_PITCH, marble, gold, 5);
  root.add(neighborPinsInstanced(keep, [-LANE_PITCH, LANE_PITCH]));

  // La lumière : la nuit bleue par la nef ouverte, une grande lampe chaude sur l'élan, le feu des braseros
  const key = new THREE.SpotLight(0xffd0a0, 14, 14, 0.8, 0.5, 1.3);
  key.position.set(0.4, ENT_TOP - 0.4, 4.4);
  key.target.position.set(0, 0, 0.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  root.add(key, key.target);
  const moonLight = new THREE.DirectionalLight(0x8aa0ff, 0.6);
  moonLight.position.set(-6, 14, -10);
  root.add(moonLight);
  const fireLights = [
    [0, 2.0, -END_Z + 1.4, 6, 12],
    [-(WALL_X - 1.2), 2.0, -6, 4, 12],
    [WALL_X - 1.2, 2.0, -6, 4, 12],
  ].map(([x, y, z, i, d]) => {
    const l = new THREE.PointLight(0xff9040, i, d, 1.5);
    l.position.set(x!, y!, z!);
    root.add(l);
    return l;
  });

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
    background: new THREE.Color(0x141a3a),
    fog: new THREE.Fog(0x1a1a30, 40, 150),
    hemi: [0x4a5a8a, 0x3a2414, 0.5],
    env: 0.6,
    exposure: 1.0,
    bloom: [0.45, 0.45, 0.85],
    grade: { warm: 0.08, sat: 1.05, vignette: 0.38 },
    bench,
    update: (t) => {
      // Les flammes dansent, la lumière des braseros vacille
      flames.forEach((m, i) => {
        const s = 1 + Math.sin(t * (8 + (i % 3) * 3) + i) * 0.16 + Math.sin(t * 17 + i * 2) * 0.08;
        m.scale.set(1, s, 1);
      });
      fireLights.forEach((l, i) => {
        l.intensity = (i ? 4 : 6) + Math.sin(t * 13 + i) * 0.7 + Math.sin(t * 29 + i * 3) * 0.4;
      });
    },
    dispose,
  };
}
