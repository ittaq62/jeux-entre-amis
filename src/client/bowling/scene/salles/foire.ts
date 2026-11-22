// La fête foraine : le jeu de quilles au milieu de l'allée, un soir de fête. Des arches d'ampoules enjambent la piste et
// s'allument en vagues, au bout la grande façade peinte du stand clignote de toutes ses ampoules entre deux tourelles
// rayées ; à droite le manège de chevaux de bois tourne, les chevaux montent et descendent ; à gauche les stands (la
// pêche aux canards, la barbe à papa, le tir), à droite les gaufres ; au loin la grande roue tourne lentement sous les
// étoiles, et un bouquet de ballons se balance près de l'élan.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { APPROACH, CUSHION, GUTTER_OUTER, HEAD_PIN, PIT_DEPTH } from "../../../../shared/games/bowling/lane.ts";
import { CEIL_Y } from "../laneMesh.ts";
import { seeded } from "../textures.ts";
import {
  arcBench,
  ballReturn,
  bin,
  block,
  canvasTex,
  glowSign,
  mergeStatic,
  phys,
  roundBlock,
  skyDome,
  std,
  type Keep,
  type Salle,
} from "./common.ts";

const INNER = GUTTER_OUTER + 0.1;
const FAR = 80;
const BEHIND = 30;
const FACADE_Z = -(HEAD_PIN - 0.83);
const BOOTH_Z = -(CUSHION + 0.25);
const UNDER = -PIT_DEPTH - 0.06;
/** La façade du stand : sa demi-largeur, le haut de ses côtés, son sommet */
const FW = 2.6;
const FH_LOW = CEIL_Y + 0.62;
const FH_SIDE = 3.0;
const FH_TOP = 4.0;
/** La grande roue, au loin */
const WHEEL = new THREE.Vector3(-12, 12.5, -52);
const WHEEL_R = 10;
/** Le manège */
const CAROUSEL = new THREE.Vector3(8.4, 0, -5.5);
const HORSES = 12;

const FONT_CIRCUS = "'Arial Black', Impact, 'Segoe UI Black', sans-serif";
const FONT_SCRIPT = "'Great Vibes', 'Brush Script MT', 'Segoe Script', cursive";

/** Des ampoules : toutes d'un seul dessin, chacune sa couleur, et une force qu'on peut faire varier */
class Bulbs {
  readonly mesh: THREE.InstancedMesh;
  private base: THREE.Color[];
  private c = new THREE.Color();

  constructor(points: THREE.Vector3[], colors: number[], keep: Keep, r = 0.05) {
    this.mesh = new THREE.InstancedMesh(
      keep(new THREE.SphereGeometry(r, 8, 6)),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4) })),
      points.length,
    );
    const m = new THREE.Matrix4();
    this.base = points.map((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, m);
      const c = new THREE.Color(colors[i % colors.length]!);
      this.mesh.setColorAt(i, c);
      return c;
    });
    this.mesh.computeBoundingSphere();
    keep({ dispose: () => this.mesh.dispose() });
  }

  /** La force de chaque ampoule (0 : éteinte, 1 : pleine) */
  light(f: (i: number) => number) {
    for (let i = 0; i < this.base.length; i++) this.mesh.setColorAt(i, this.c.copy(this.base[i]!).multiplyScalar(f(i)));
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

/** Des rayures verticales (pour les toits, les auvents, les barrières) */
function stripes(colors: string[], n: number): THREE.CanvasTexture {
  return canvasTex(
    256,
    16,
    (g) => {
      const w = 256 / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = colors[i % colors.length]!;
        g.fillRect(i * w, 0, Math.ceil(w), 16);
      }
    },
    true,
  );
}

/** Des rayures en spirale (les tourelles, les poteaux) */
function spiral(a: string, b: string): THREE.CanvasTexture {
  return canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = a;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = b;
      for (let k = -2; k < 4; k++) {
        g.beginPath();
        g.moveTo(k * 64, 128);
        g.lineTo(k * 64 + 32, 128);
        g.lineTo(k * 64 + 160, 0);
        g.lineTo(k * 64 + 128, 0);
        g.fill();
      }
    },
    true,
  );
}

/** La terre battue de l'allée, semée de confettis */
function groundArt(): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#4a3a30";
      g.fillRect(0, 0, 256, 256);
      const r = seeded(31);
      for (let i = 0; i < 1400; i++) {
        const k = 0.7 + r() * 0.6;
        g.fillStyle = `rgba(${90 * k},${74 * k},${60 * k},0.5)`;
        g.fillRect(r() * 256, r() * 256, 2, 2);
      }
      const conf = ["#ff5a7a", "#ffd23a", "#5ad0ff", "#8af06a", "#ffffff", "#c58cf2"];
      for (let i = 0; i < 22; i++) {
        g.fillStyle = conf[i % conf.length]!;
        g.save();
        g.translate(r() * 256, r() * 256);
        g.rotate(r() * 3);
        g.globalAlpha = 0.7;
        g.fillRect(-1.5, -1, 3, 2);
        g.globalAlpha = 1;
        g.restore();
      }
    },
    true,
  );
}

/** La grande façade peinte du stand : un soleil de rayons, et le nom en lettres de cirque */
function facadeArt(): THREE.CanvasTexture {
  return canvasTex(1024, 384, (g) => {
    const W = 1024,
      H = 384;
    g.fillStyle = "#b81e30";
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2, H + 40);
    for (let k = 0; k < 28; k++) {
      g.fillStyle = k % 2 ? "#e2483a" : "#c8263a";
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, 1200, Math.PI + (k / 28) * Math.PI, Math.PI + ((k + 1) / 28) * Math.PI);
      g.fill();
    }
    g.restore();
    // Le bandeau bleu du bas, ses pois dorés
    g.fillStyle = "#1d3c8f";
    g.fillRect(0, H - 56, W, 56);
    g.fillStyle = "#ffd23a";
    for (let x = 24; x < W; x += 48) {
      g.beginPath();
      g.arc(x, H - 28, 7, 0, Math.PI * 2);
      g.fill();
    }
    // Le nom, en grosses lettres jaunes cernées de rouge sombre
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `bold 92px ${FONT_CIRCUS}`;
    g.lineJoin = "round";
    g.lineWidth = 18;
    g.strokeStyle = "#5a0a14";
    g.strokeText("JEU DE QUILLES", W / 2, 214);
    g.fillStyle = "#ffd23a";
    g.fillText("JEU DE QUILLES", W / 2, 214);
    g.fillStyle = "#fff4c8";
    g.font = `bold 30px ${FONT_CIRCUS}`;
    g.fillText("★  ADRESSE  ★  FOU RIRE  ★  GROS LOTS  ★", W / 2, 132);
    // Des étoiles
    const r = seeded(5);
    for (let i = 0; i < 18; i++) {
      const x = r() * W,
        y = 40 + r() * 240;
      if (Math.abs(y - 214) < 60 && Math.abs(x - W / 2) < 420) continue;
      g.fillStyle = r() < 0.5 ? "#ffffff" : "#ffd23a";
      star(g, x, y, 6 + r() * 8);
    }
  });
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** Le cadre au-dessus des quilles : la promesse du stand */
function maskingArt(): THREE.CanvasTexture {
  return canvasTex(1024, 320, (g) => {
    g.fillStyle = "#14204a";
    g.fillRect(0, 0, 1024, 320);
    g.strokeStyle = "#ffd23a";
    g.lineWidth = 8;
    g.strokeRect(14, 14, 996, 292);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `100px ${FONT_SCRIPT}`;
    g.fillStyle = "#fff4c8";
    g.fillText("Un strike, un gros lot !", 512, 168);
    const r = seeded(8);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? "#ffd23a" : "#ff7aa0";
      star(g, i < 8 ? 40 + r() * 80 : 904 + r() * 80, 40 + r() * 240, 7 + r() * 6);
    }
  });
}

/** Un cheval de bois, au galop (tout d'une pièce ; il regarde vers +x) */
function horseGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
    g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  add(new THREE.CapsuleGeometry(0.15, 0.4, 4, 12), 0, 0, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.075, 0.11, 0.36, 10), 0.26, 0.19, 0, -0.55);
  add(new THREE.CapsuleGeometry(0.075, 0.18, 4, 10), 0.44, 0.33, 0, 1.04);
  for (const z of [-0.035, 0.035]) add(new THREE.ConeGeometry(0.025, 0.08, 6), 0.4, 0.46, z, 0.3);
  for (const z of [-0.075, 0.075]) {
    add(new THREE.CylinderGeometry(0.035, 0.028, 0.42, 8), 0.24, -0.2, z, 0.6);
    add(new THREE.CylinderGeometry(0.035, 0.028, 0.42, 8), -0.24, -0.2, z, -0.6);
  }
  add(new THREE.ConeGeometry(0.06, 0.34, 8), -0.38, -0.06, 0, 2.5);
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

/** Une poutre droite entre deux points */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, keep: Keep): THREE.Mesh {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(r, r, d.length(), 8)), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export function foireSalle(): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const r = seeded(17);
  const maskTex = keep(maskingArt());
  const gold = phys(keep, { color: 0xd9a93a, metalness: 0.8, roughness: 0.42 });
  const white = std(keep, 0xf4efe4, 0.5);
  const plum = std(keep, 0x3a1830, 0.8);
  const style = {
    gutter: 0x2a2a30,
    gutterMetal: 0.6,
    capping: phys(keep, { color: 0xb81e30, roughness: 0.35, clearcoat: 0.8 }),
    kickback: phys(keep, { color: 0x1d3c8f, roughness: 0.5 }),
    masking: std(keep, 0xffffff, 0.7, 0, { map: maskTex, emissiveMap: maskTex, emissive: 0xffffff, emissiveIntensity: 0.4 }),
    deckLight: 0xfff0d8,
    deckLightPower: 2.6,
    reflect: 0.55,
    wood: 0xfff2e0,
  };
  const warm = [0xfff0c0, 0xffd23a, 0xff5a5a, 0xfff0c0, 0x7ad8ff, 0xffd23a];

  // Le ciel de nuit, ses étoiles, la lueur de la fête à l'horizon
  root.add(
    skyDome(keep, [
      [0, "#050a1e"],
      [0.32, "#121a44"],
      [0.45, "#38204e"],
      [0.5, "#7a3a5a"],
      [0.52, "#160c18"],
      [1, "#050505"],
    ]),
  );
  const starPos: number[] = [];
  for (let i = 0; i < 700; i++) {
    const a = r() * Math.PI * 2,
      h = 0.08 + r() * 0.92;
    const rr = Math.sqrt(1 - h * h);
    starPos.push(Math.cos(a) * rr * 160, h * 160, Math.sin(a) * rr * 160);
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    keep(new THREE.PointsMaterial({ color: new THREE.Color(1.5, 1.5, 1.7), size: 1.6, sizeAttenuation: false, fog: false })),
  );
  root.add(stars);

  // Le sol : la terre battue de l'allée tout autour de la piste
  const groundTex = keep(groundArt());
  const groundMat = std(keep, 0xffffff, 0.95, 0, { map: groundTex });
  const ground = (x0: number, x1: number, z0: number, z1: number, y = -0.002) => {
    const g = keep(new THREE.PlaneGeometry(x1 - x0, z1 - z0));
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 3, (z0 + uv.getY(i) * (z1 - z0)) / 3);
    const m = new THREE.Mesh(g, groundMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    root.add(m);
  };
  // (z0 < z1 : de loin vers l'arrière)
  ground(-FAR, -INNER, -FAR, BEHIND);
  ground(INNER, FAR, -FAR, BEHIND);
  ground(-INNER, INNER, APPROACH, BEHIND);
  ground(-INNER, INNER, -FAR, BOOTH_Z);
  ground(-INNER, INNER, BOOTH_Z, 0, UNDER);

  // Les barrières peintes de chaque côté de la piste
  const fenceTex = keep(stripes(["#f4efe4", "#c8263a"], 2));
  const fenceLen = HEAD_PIN - 1.6;
  fenceTex.repeat.set(fenceLen / 0.5, 1);
  const fenceMat = std(keep, 0xffffff, 0.6, 0, { map: fenceTex });
  for (const side of [-1, 1]) {
    root.add(block(0.06, 0.5, fenceLen, fenceMat, side * (INNER + 0.32), 0, -fenceLen / 2 - 0.3, keep));
    root.add(roundBlock(0.1, 0.06, fenceLen, 0.02, gold, side * (INNER + 0.32), 0.5, -fenceLen / 2 - 0.3, keep));
  }

  // Les arches d'ampoules qui enjambent la piste
  const archPts: THREE.Vector3[] = [];
  const archPhase: number[] = [];
  const archX = 1.75,
    archY = 2.9,
    archRise = 1.0;
  const postTex = keep(spiral("#f4efe4", "#c8263a"));
  postTex.repeat.set(1, 6);
  const postMat = std(keep, 0xffffff, 0.5, 0, { map: postTex });
  const starShape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? 0.11 : 0.26;
    if (k === 0) starShape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else starShape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const starGeom = keep(new THREE.ExtrudeGeometry(starShape, { depth: 0.05, bevelEnabled: false }));
  for (let a = 0, z = -1; z > -12; a++, z -= 3.4) {
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.055, 0.07, archY, 10)), postMat);
      p.position.set(side * archX, archY / 2, z);
      root.add(p);
    }
    const curve: THREE.Vector3[] = [];
    for (let k = 0; k <= 24; k++) {
      const u = Math.PI - (k / 24) * Math.PI;
      curve.push(new THREE.Vector3(Math.cos(u) * archX, archY + Math.sin(u) * archRise, z));
    }
    root.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve), 48, 0.045, 6)), white));
    const s = new THREE.Mesh(starGeom, gold);
    s.position.set(0, archY + archRise + 0.22, z - 0.025);
    root.add(s);
    // Les ampoules : en montant à gauche, par-dessus, en descendant à droite
    let k = 0;
    for (let y = 0.3; y < archY; y += 0.3, k++) {
      archPts.push(new THREE.Vector3(-archX - 0.07, y, z + 0.04));
      archPhase.push(k + a * 3);
    }
    for (let j = 1; j < 18; j++, k++) {
      const u = Math.PI - (j / 18) * Math.PI;
      archPts.push(new THREE.Vector3(Math.cos(u) * (archX + 0.07), archY + Math.sin(u) * (archRise + 0.07), z + 0.04));
      archPhase.push(k + a * 3);
    }
    for (let y = archY - 0.3; y > 0.2; y -= 0.3, k++) {
      archPts.push(new THREE.Vector3(archX + 0.07, y, z + 0.04));
      archPhase.push(k + a * 3);
    }
  }
  const archBulbs = new Bulbs(archPts, warm, keep, 0.045);
  archBulbs.mesh.userData.reflect = true;
  root.add(archBulbs.mesh);

  // La façade du stand, au bout : ses côtés, son fronton peint au sommet arrondi, ses tourelles
  const fac = new THREE.Shape();
  fac.moveTo(-FW, FH_LOW);
  fac.lineTo(FW, FH_LOW);
  fac.lineTo(FW, FH_SIDE);
  fac.bezierCurveTo(FW, FH_TOP - 0.2, FW * 0.45, FH_TOP, 0, FH_TOP);
  fac.bezierCurveTo(-FW * 0.45, FH_TOP, -FW, FH_TOP - 0.2, -FW, FH_SIDE);
  fac.lineTo(-FW, FH_LOW);
  const facTex = keep(facadeArt());
  facTex.repeat.set(1 / (2 * FW), 1 / (FH_TOP - FH_LOW));
  facTex.offset.set(0.5, -FH_LOW / (FH_TOP - FH_LOW));
  const facMat = std(keep, 0xffffff, 0.6, 0, { map: facTex, emissiveMap: facTex, emissive: 0xffffff, emissiveIntensity: 0.18 });
  const facade = new THREE.Mesh(keep(new THREE.ExtrudeGeometry(fac, { depth: 0.12, bevelEnabled: false, curveSegments: 24 })), facMat);
  facade.position.z = FACADE_Z - 0.06;
  root.add(facade);
  const sideMat = std(keep, 0x8a1424, 0.6);
  for (const side of [-1, 1]) {
    root.add(block(FW - 0.87, FH_LOW, 0.12, sideMat, (side * (FW + 0.87)) / 2, 0, FACADE_Z, keep));
    root.add(block(0.06, FH_LOW, 0.16, gold, side * 0.9, 0, FACADE_Z, keep));
  }
  root.add(block(2 * FW, 0.08, 0.18, gold, 0, FH_LOW - 0.04, FACADE_Z, keep));
  // Les tourelles rayées, leur chapeau pointu et leur fanion
  const towerTex = keep(spiral("#f4efe4", "#1d3c8f"));
  towerTex.repeat.set(2, 4);
  const towerMat = std(keep, 0xffffff, 0.5, 0, { map: towerTex });
  const red = std(keep, 0xc8263a, 0.5);
  const flagMat = keep(new THREE.MeshStandardMaterial({ color: 0xffd23a, side: THREE.DoubleSide, roughness: 0.6 }));
  const facPts: THREE.Vector3[] = [];
  const facPhase: number[] = [];
  for (const side of [-1, 1]) {
    const x = side * (FW + 0.3);
    const t = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.3, 0.34, FH_TOP, 20)), towerMat);
    t.position.set(x, FH_TOP / 2, FACADE_Z);
    root.add(t);
    const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(0.46, 0.9, 20)), red);
    cone.position.set(x, FH_TOP + 0.45, FACADE_Z);
    root.add(cone);
    const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 8)), gold);
    ball.position.set(x, FH_TOP + 0.95, FACADE_Z);
    root.add(ball);
    const flag = new THREE.Mesh(
      keep(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, -0.22, 0),
          new THREE.Vector3(side * 0.42, -0.11, 0),
        ]),
      ),
      flagMat,
    );
    flag.geometry.computeVertexNormals();
    flag.position.set(x, FH_TOP + 1.25, FACADE_Z);
    root.add(flag, strut(new THREE.Vector3(x, FH_TOP + 0.9, FACADE_Z), new THREE.Vector3(x, FH_TOP + 1.26, FACADE_Z), 0.012, gold, keep));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      facPts.push(new THREE.Vector3(x + Math.cos(a) * 0.36, FH_TOP - 0.1, FACADE_Z + Math.sin(a) * 0.36));
      facPhase.push(k);
    }
  }
  // Les ampoules de la façade : tout le tour du fronton, puis le long de l'ouverture
  const top = new THREE.CurvePath<THREE.Vector2>();
  top.add(new THREE.LineCurve(new THREE.Vector2(-FW, FH_LOW + 0.1), new THREE.Vector2(-FW, FH_SIDE)));
  top.add(
    new THREE.CubicBezierCurve(
      new THREE.Vector2(-FW, FH_SIDE),
      new THREE.Vector2(-FW, FH_TOP - 0.2),
      new THREE.Vector2(-FW * 0.45, FH_TOP),
      new THREE.Vector2(0, FH_TOP),
    ),
  );
  top.add(
    new THREE.CubicBezierCurve(
      new THREE.Vector2(0, FH_TOP),
      new THREE.Vector2(FW * 0.45, FH_TOP),
      new THREE.Vector2(FW, FH_TOP - 0.2),
      new THREE.Vector2(FW, FH_SIDE),
    ),
  );
  top.add(new THREE.LineCurve(new THREE.Vector2(FW, FH_SIDE), new THREE.Vector2(FW, FH_LOW + 0.1)));
  const n = Math.round(top.getLength() / 0.2);
  for (let k = 0; k <= n; k++) {
    const p = top.getPointAt(k / n);
    const inward = 0.1;
    facPts.push(
      new THREE.Vector3(
        p.x - Math.sign(p.x) * (Math.abs(p.x) > FW - 0.01 ? inward : 0),
        p.y - (p.y > FH_SIDE ? inward : 0),
        FACADE_Z + 0.09,
      ),
    );
    facPhase.push(k);
  }
  for (const side of [-1, 1]) {
    for (let y = 0.15, k = 0; y < FH_LOW; y += 0.2, k++) {
      facPts.push(new THREE.Vector3(side * 1.02, y, FACADE_Z + 0.09));
      facPhase.push(k);
    }
  }
  const facBulbs = new Bulbs(facPts, [0xfff0c0, 0xffd23a], keep, 0.04);
  facBulbs.mesh.userData.reflect = true;
  root.add(facBulbs.mesh);

  // Derrière la façade, la baraque de la machine
  for (const side of [-1, 1])
    root.add(block(0.14, 2.9 - UNDER, BOOTH_Z - FACADE_Z, plum, side * (INNER + 0.03), UNDER, (FACADE_Z + BOOTH_Z) / 2, keep));
  root.add(block(2 * INNER + 0.2, 2.9 - UNDER, 0.12, plum, 0, UNDER, BOOTH_Z, keep));
  root.add(block(2 * INNER + 0.2, 0.1, FACADE_Z - BOOTH_Z, plum, 0, 2.9, (FACADE_Z + BOOTH_Z) / 2, keep));

  // La grande roue, au loin : ses pieds, sa roue qui tourne, ses nacelles qui restent droites
  const frame = std(keep, 0xe8e8f0, 0.4, 0.5);
  for (const dz of [-1.4, 1.4]) {
    for (const dx of [-6, 6])
      root.add(
        strut(new THREE.Vector3(WHEEL.x + dx, 0, WHEEL.z + dz), new THREE.Vector3(WHEEL.x, WHEEL.y, WHEEL.z + dz), 0.18, frame, keep),
      );
    root.add(
      strut(
        new THREE.Vector3(WHEEL.x - 3, WHEEL.y / 2, WHEEL.z + dz),
        new THREE.Vector3(WHEEL.x + 3, WHEEL.y / 2, WHEEL.z + dz),
        0.12,
        frame,
        keep,
      ),
    );
  }
  const wheel = new THREE.Group();
  wheel.position.copy(WHEEL);
  wheel.userData.live = true;
  root.add(wheel);
  const wheelParts: THREE.BufferGeometry[] = [];
  for (const dz of [-0.7, 0.7]) {
    for (const rr of [WHEEL_R, WHEEL_R * 0.55]) {
      const t = new THREE.TorusGeometry(rr, rr === WHEEL_R ? 0.14 : 0.09, 6, 72);
      t.translate(0, 0, dz);
      wheelParts.push(t);
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const s = new THREE.CylinderGeometry(0.06, 0.06, WHEEL_R, 6, 1);
      s.translate(0, WHEEL_R / 2, 0);
      s.rotateZ(a);
      s.translate(0, 0, dz);
      wheelParts.push(s);
    }
  }
  const hub = new THREE.CylinderGeometry(0.7, 0.7, 2.2, 16);
  hub.rotateX(Math.PI / 2);
  wheelParts.push(hub);
  const wheelGeo = keep(
    mergeGeometries(
      wheelParts.map((g) => (g.index ? g.toNonIndexed() : g)),
      false,
    )!,
  );
  for (const g of wheelParts) g.dispose();
  wheel.add(new THREE.Mesh(wheelGeo, frame));
  const wheelPts: THREE.Vector3[] = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    wheelPts.push(new THREE.Vector3(Math.cos(a) * (WHEEL_R + 0.2), Math.sin(a) * (WHEEL_R + 0.2), 0.75));
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (let j = 1; j <= 6; j++) wheelPts.push(new THREE.Vector3(Math.cos(a) * j * 1.5, Math.sin(a) * j * 1.5, 0.78));
  }
  const wheelBulbs = new Bulbs(wheelPts, [0xfff0c0, 0xff7aa0, 0x7ad8ff, 0xffd23a], keep, 0.13);
  wheel.add(wheelBulbs.mesh);
  const gondolas: THREE.Group[] = [];
  const gondolaColors = [0xc8263a, 0xffd23a, 0x1d6fc8, 0x2fa05a, 0xff7aa0, 0xff8a2a];
  const roofCone = keep(new THREE.ConeGeometry(0.7, 0.35, 4));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, 0);
    const mat = std(keep, gondolaColors[k % gondolaColors.length]!, 0.5);
    g.add(roundBlock(1.1, 0.75, 0.9, 0.12, mat, 0, -1.45, 0, keep));
    const roofM = new THREE.Mesh(roofCone, white);
    roofM.position.y = -0.42;
    roofM.rotation.y = Math.PI / 4;
    g.add(roofM);
    g.add(block(0.06, 0.5, 0.06, frame, 0, -0.55, 0, keep));
    wheel.add(g);
    gondolas.push(g);
  }

  // Le manège : son plancher, sa colonne de miroirs, son toit rayé, ses chevaux de bois qui montent et descendent
  const carousel = new THREE.Group();
  carousel.position.copy(CAROUSEL);
  carousel.userData.live = true;
  root.add(carousel);
  const stripeTex = keep(stripes(["#c8263a", "#f4efe4"], 24));
  const stripeMat = std(keep, 0xffffff, 0.55, 0, { map: stripeTex, side: THREE.DoubleSide });
  const plate = new THREE.Mesh(keep(new THREE.CylinderGeometry(3.3, 3.3, 0.3, 48)), std(keep, 0x8a1424, 0.5));
  plate.position.y = 0.15;
  carousel.add(plate);
  const plateRim = new THREE.Mesh(keep(new THREE.TorusGeometry(3.3, 0.04, 6, 64)), gold);
  plateRim.rotation.x = Math.PI / 2;
  plateRim.position.y = 0.3;
  carousel.add(plateRim);
  const column = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.5, 0.5, 2.7, 12)),
    phys(keep, { color: 0xffffff, metalness: 1, roughness: 0.08 }),
  );
  column.position.y = 1.65;
  carousel.add(column);
  const under = new THREE.Mesh(keep(new THREE.CircleGeometry(3.75, 48)), std(keep, 0xf4e2b8, 0.7));
  under.rotation.x = Math.PI / 2;
  under.position.y = 3.0;
  carousel.add(under);
  const roofC = new THREE.Mesh(keep(new THREE.ConeGeometry(3.85, 1.5, 48, 1)), stripeMat);
  roofC.position.y = 3.75;
  carousel.add(roofC);
  const valance = new THREE.Mesh(keep(new THREE.CylinderGeometry(3.85, 3.85, 0.45, 48, 1, true)), stripeMat);
  valance.position.y = 2.82;
  carousel.add(valance);
  const finial = new THREE.Mesh(keep(new THREE.SphereGeometry(0.2, 14, 10)), gold);
  finial.position.y = 4.6;
  carousel.add(finial);
  const poles = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.025, 0.025, 2.7, 8)), gold, HORSES);
  const horses = new THREE.InstancedMesh(keep(horseGeometry()), phys(keep, { color: 0xffffff, roughness: 0.3, clearcoat: 0.8 }), HORSES);
  const horseColors = [0xf8f4ec, 0x3a2a24, 0xe8d0a8, 0xbfc4cc, 0xf2c4d0, 0xc4dcf0];
  const horseRot: THREE.Quaternion[] = [];
  const horseAt: THREE.Vector3[] = [];
  const mm = new THREE.Matrix4();
  for (let i = 0; i < HORSES; i++) {
    const a = (i / HORSES) * Math.PI * 2;
    const at = new THREE.Vector3(Math.cos(a) * 2.55, 1.05, Math.sin(a) * 2.55);
    horseAt.push(at);
    horseRot.push(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - a));
    mm.makeTranslation(at.x, 1.65, at.z);
    poles.setMatrixAt(i, mm);
    horses.setColorAt(i, new THREE.Color(horseColors[i % horseColors.length]!));
  }
  poles.castShadow = horses.castShadow = false;
  horses.frustumCulled = poles.frustumCulled = false;
  carousel.add(poles, horses);
  keep({ dispose: () => (poles.dispose(), horses.dispose()) });
  const carPts: THREE.Vector3[] = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    carPts.push(new THREE.Vector3(Math.cos(a) * 3.9, 2.58, Math.sin(a) * 3.9));
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    for (let j = 0; j < 5; j++) {
      const u = j / 5;
      carPts.push(new THREE.Vector3(Math.cos(a) * 3.9 * (1 - u), 3.02 + u * 1.5, Math.sin(a) * 3.9 * (1 - u)));
    }
  }
  const carBulbs = new Bulbs(carPts, [0xfff0c0, 0xffd23a], keep, 0.05);
  carousel.add(carBulbs.mesh);
  const carLight = new THREE.PointLight(0xffb0a0, 7, 11, 1.4);
  carLight.position.set(CAROUSEL.x - 2, 2.2, CAROUSEL.z + 1);
  root.add(carLight);

  // Les stands : un mur du fond, deux côtés, un comptoir, un auvent rayé festonné, une enseigne qui brille
  const stall = (x: number, z: number, face: number, colors: [string, string], title: string, glow: string) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = face;
    const wall = std(keep, colors[0], 0.7);
    g.add(block(3, 2.4, 0.08, wall, 0, 0, -0.8, keep));
    for (const s of [-1, 1]) g.add(block(0.08, 2.4, 1.6, wall, s * 1.5, 0, 0, keep));
    const awTex = keep(stripes(colors, 12));
    const awning = new THREE.Mesh(keep(new THREE.BoxGeometry(3.3, 0.05, 1.3)), std(keep, 0xffffff, 0.6, 0, { map: awTex }));
    awning.position.set(0, 2.5, 0.55);
    awning.rotation.x = 0.28;
    g.add(awning);
    const scallop = keep(new THREE.CircleGeometry(0.14, 10, Math.PI, Math.PI));
    const scMats = colors.map((c) => std(keep, c, 0.6, 0, { side: THREE.DoubleSide }));
    for (let k = 0; k < 11; k++) {
      const m = new THREE.Mesh(scallop, scMats[k % 2]!);
      m.position.set(-1.5 + 0.15 + k * 0.27, 2.31, 1.19);
      m.rotation.x = 0.28;
      g.add(m);
    }
    g.add(block(3, 0.95, 0.4, std(keep, colors[1], 0.6), 0, 0, 0.6, keep));
    g.add(block(3.06, 0.05, 0.46, gold, 0, 0.95, 0.6, keep));
    const sign = glowSign(title, glow, FONT_SCRIPT, 0.42, keep);
    sign.position.set(0, 2.95, 1.05);
    sign.rotation.x = -0.05;
    sign.userData.sign = true;
    g.add(sign);
    root.add(g);
    return g;
  };
  // La pêche aux canards
  const peche = stall(-5.3, 3.4, Math.PI / 2 - 0.35, ["#1d6fc8", "#f4efe4"], "Pêche aux canards", "#7ad8ff");
  const pool = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.0, 1.0, 0.55, 28)), std(keep, 0x1d6fc8, 0.5));
  pool.position.set(0, 1.25, -0.15);
  pool.scale.set(1.2, 1, 0.5);
  peche.add(pool);
  const water = new THREE.Mesh(keep(new THREE.CircleGeometry(0.95, 28)), phys(keep, { color: 0x3aa8e8, roughness: 0.1, clearcoat: 1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 1.53, -0.15);
  water.scale.set(1.2, 0.5, 1);
  peche.add(water);
  const duckBody = keep(new THREE.SphereGeometry(0.08, 12, 8));
  const duckHead = keep(new THREE.SphereGeometry(0.05, 10, 8));
  const yellow = std(keep, 0xffd23a, 0.4);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const b = new THREE.Mesh(duckBody, yellow);
    b.position.set(Math.cos(a) * 0.8, 1.57, -0.15 + Math.sin(a) * 0.32);
    b.scale.set(1.2, 0.8, 1);
    const h = new THREE.Mesh(duckHead, yellow);
    h.position.set(b.position.x + 0.06, 1.67, b.position.z);
    peche.add(b, h);
  }
  // La barbe à papa
  const barbe = stall(-5.3, -2.6, Math.PI / 2 - 0.28, ["#ff7aa0", "#f4efe4"], "Barbe à papa", "#ff8ac0");
  const fluff = keep(new THREE.IcosahedronGeometry(0.16, 2));
  const pink = std(keep, 0xffb0d0, 0.95, 0, { emissive: 0x401020, emissiveIntensity: 0.4 });
  const blueFluff = std(keep, 0xa8d8ff, 0.95, 0, { emissive: 0x102040, emissiveIntensity: 0.4 });
  for (let k = 0; k < 8; k++) {
    const f = new THREE.Mesh(fluff, k % 3 ? pink : blueFluff);
    f.position.set(-1.15 + k * 0.33, 1.55 + (k % 2) * 0.12, -0.55);
    f.scale.set(1, 1.25, 1);
    barbe.add(f, block(0.015, 0.4, 0.015, white, f.position.x, 1.05, -0.55, keep));
  }
  const drum = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.35, 0.3, 0.3, 24)), std(keep, 0xd8d8e0, 0.3, 0.8));
  drum.position.set(0.6, 1.12, 0.55);
  barbe.add(drum);
  // Le tir : des cibles au mur du fond, et des peluches à gagner
  const tir = stall(-5.3, -8.6, Math.PI / 2 - 0.2, ["#2fa05a", "#ffd23a"], "Tir aux ballons", "#8af06a");
  const balloonGeo = keep(new THREE.SphereGeometry(0.09, 12, 10));
  const balloonCols = [0xff4f5a, 0xffd23a, 0x5ad0ff, 0xff8ac0, 0x8af06a, 0xffffff];
  const balloonMats = balloonCols.map((c) => phys(keep, { color: c, roughness: 0.2, clearcoat: 1 }));
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 9; k++) {
      const b = new THREE.Mesh(balloonGeo, balloonMats[(k + row * 2) % balloonMats.length]!);
      b.position.set(-1.2 + k * 0.3, 1.3 + row * 0.28, -0.7);
      b.scale.set(1, 1.2, 1);
      tir.add(b);
    }
  }
  const plushBody = keep(new THREE.SphereGeometry(0.14, 14, 10));
  const plushHead = keep(new THREE.SphereGeometry(0.1, 14, 10));
  const plushEar = keep(new THREE.SphereGeometry(0.04, 8, 6));
  const plushCols = [0xc89060, 0xff9ac0, 0x9ac8ff, 0xf4efe4];
  for (const [st, xs] of [
    [tir, [-1.25, 1.25]],
    [barbe, [-1.25]],
  ] as const) {
    for (const x of xs) {
      for (let k = 0; k < 3; k++) {
        const m = std(keep, plushCols[(k + (x > 0 ? 1 : 0)) % plushCols.length]!, 0.95);
        const y = 1.3 + k * 0.38;
        const b = new THREE.Mesh(plushBody, m);
        b.position.set(x, y, -0.62);
        const h = new THREE.Mesh(plushHead, m);
        h.position.set(x, y + 0.18, -0.6);
        st.add(b, h);
        for (const e of [-0.07, 0.07]) {
          const ear = new THREE.Mesh(plushEar, m);
          ear.position.set(x + e, y + 0.27, -0.6);
          st.add(ear);
        }
      }
    }
  }
  // Les gaufres, de l'autre côté
  const gaufres = stall(5.2, 3.2, -(Math.PI / 2 - 0.35), ["#ff8a2a", "#f4efe4"], "Gaufres & chichis", "#ffb347");
  const waffle = keep(new THREE.BoxGeometry(0.22, 0.03, 0.16));
  const waffleMat = std(keep, 0xd8a050, 0.8);
  for (let k = 0; k < 6; k++) {
    const w = new THREE.Mesh(waffle, waffleMat);
    w.position.set(-1 + k * 0.4, 1.0 + (k % 2) * 0.035, 0.55);
    gaufres.add(w);
  }
  const stallLight = new THREE.PointLight(0xffc890, 6, 14, 1.4);
  stallLight.position.set(-3.6, 2.4, -2.5);
  root.add(stallLight);
  const waffleLight = new THREE.PointLight(0xffb070, 3, 6, 1.5);
  waffleLight.position.set(4.2, 2.2, 3.6);
  root.add(waffleLight);

  // Des tentes rayées au loin, tout autour
  const tentCols: [string, string][] = [
    ["#c8263a", "#f4efe4"],
    ["#1d6fc8", "#f4efe4"],
    ["#ffd23a", "#c8263a"],
    ["#2fa05a", "#f4efe4"],
  ];
  const tentMats = tentCols.map((c) => std(keep, 0xffffff, 0.7, 0, { map: keep(stripes(c, 16)) }));
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * (0.15 + (k / 13) * 0.7);
    const d = 30 + r() * 18;
    const x = -Math.cos(a) * d,
      z = -Math.sin(a) * d + 4;
    const rad = 2.5 + r() * 2.5,
      h = 2.5 + r() * 1.5;
    const m = tentMats[k % tentMats.length]!;
    const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(rad, rad, h, 20, 1, true)), m);
    body.position.set(x, h / 2, z);
    const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(rad * 1.1, h * 0.8, 20)), m);
    cone.position.set(x, h + h * 0.4, z);
    root.add(body, cone);
  }

  // Le banc des joueurs, de velours rouge, et le retour de boules
  const bench = arcBench(root, keep, std(keep, 0x9a1a2a, 0.85), 7.4, 1.55, gold);
  ballReturn(root, keep, -(GUTTER_OUTER + 0.42), red, gold, 1);

  // Un bouquet de ballons attaché près de l'élan
  const balloons = new THREE.Group();
  balloons.position.set(2.5, 0, 5.2);
  balloons.userData.live = true;
  root.add(balloons);
  balloons.add(roundBlock(0.5, 0.7, 0.4, 0.05, std(keep, 0x1d6fc8, 0.5), 0, 0, 0, keep));
  const bGeo = keep(new THREE.SphereGeometry(0.2, 18, 12));
  const strings: number[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * 0.35 * (k % 2 ? 1 : 0.6), 2.0 + (k % 3) * 0.28, Math.sin(a) * 0.3);
    const b = new THREE.Mesh(bGeo, balloonMats[k % balloonMats.length]!);
    b.position.copy(p);
    b.scale.set(1, 1.18, 1);
    balloons.add(b);
    strings.push(0, 0.72, 0, p.x, p.y - 0.24, p.z);
  }
  const strGeo = keep(new THREE.BufferGeometry());
  strGeo.setAttribute("position", new THREE.Float32BufferAttribute(strings, 3));
  balloons.add(new THREE.LineSegments(strGeo, keep(new THREE.LineBasicMaterial({ color: 0xdddddd }))));

  // La lumière : la nuit bleue, une grande lampe chaude sur l'élan, la lueur des ampoules sur la piste
  const key = new THREE.SpotLight(0xffe2c0, 11, 14, 0.8, 0.5, 1.3);
  key.position.set(0.5, 4.6, 4.4);
  key.target.position.set(0, 0, 0.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  root.add(key, key.target);
  const moon = new THREE.DirectionalLight(0x8aa0ff, 0.5);
  moon.position.set(6, 10, 4);
  root.add(moon);
  const archGlow = new THREE.PointLight(0xffd8a0, 4, 14, 1.3);
  archGlow.position.set(0, 3.2, -7);
  root.add(archGlow);
  const facGlow = new THREE.PointLight(0xffc890, 3, 6, 1.5);
  facGlow.position.set(0, 2.6, FACADE_Z + 1.6);
  root.add(facGlow);

  mergeStatic(root, keep);

  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  return {
    style,
    neighbors: 0,
    root,
    background: new THREE.Color(0x0c0e26),
    fog: new THREE.Fog(0x1d1235, 45, 170),
    hemi: [0x6a5aa0, 0x2a1a14, 0.55],
    env: 0.7,
    exposure: 1.0,
    bloom: [0.55, 0.45, 0.85],
    grade: { warm: 0.04, sat: 1.15, vignette: 0.36 },
    bench,
    update: (t) => {
      // Les ampoules : des vagues le long des arches, la façade qui clignote en chenillard
      archBulbs.light((i) => 0.35 + 0.65 * Math.max(0, Math.sin(t * 4 - archPhase[i]! * 0.55)));
      facBulbs.light((i) => ((Math.floor(t * 5) + facPhase[i]!) % 3 === 0 ? 0.3 : 1));
      carBulbs.light((i) => ((Math.floor(t * 2.5) + i) % 2 ? 1 : 0.45));
      wheelBulbs.light((i) => 0.5 + 0.5 * Math.max(0, Math.sin(t * 2 - (i % 16) * 0.4)));
      // La grande roue tourne, ses nacelles restent droites
      wheel.rotation.z = t * 0.1;
      for (const g of gondolas) g.rotation.z = -wheel.rotation.z;
      // Le manège tourne, les chevaux montent et descendent
      carousel.rotation.y = t * 0.42;
      for (let i = 0; i < HORSES; i++) {
        const at = horseAt[i]!;
        pos.set(at.x, at.y + Math.sin(t * 2.2 + i * 1.7) * 0.17, at.z);
        q.copy(horseRot[i]!);
        horses.setMatrixAt(i, mm.compose(pos, q, one));
      }
      horses.instanceMatrix.needsUpdate = true;
      // Les ballons se balancent
      balloons.rotation.z = Math.sin(t * 0.7) * 0.04;
      balloons.rotation.x = Math.sin(t * 0.53 + 1) * 0.03;
    },
    dispose,
  };
}
