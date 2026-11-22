// Le bowling du quartier : une salle des années soixante. Sept pistes côte à côte sous un plafond sombre et ses rampes de
// lumière chaude, des cadres bleu nuit aux étoiles atomiques au-dessus des quilles (chacun son numéro), les retours de
// boules et leurs boules de couleur, les écrans de score suspendus, la banquette de skaï rouge en arc où l'on attend son
// tour, la moquette à motifs ; au fond le comptoir à milk-shakes et ses tabourets, le juke-box qui luit, l'enseigne au
// néon ; des néons ondulés le long des murs lambrissés.

import * as THREE from "three";
import { CUSHION, HEAD_PIN } from "../../../../shared/games/bowling/lane.ts";
import { LANE_PITCH } from "../laneMesh.ts";
import { seeded } from "../textures.ts";
import {
  bin,
  block,
  canvasTex,
  glowSign,
  mergeStatic,
  neighborPinsInstanced,
  neon,
  phys,
  roundBlock,
  std,
  type BenchSpot,
  type Salle,
} from "./common.ts";

const NEIGHBORS = 3;
const HALL = (NEIGHBORS + 0.5) * LANE_PITCH + 0.7;
const BACK = 12.5;
const CEIL = 3.4;
const LANE_CEIL = 3.0;
/** Le numéro de notre piste (les voisines ont les numéros d'à côté) */
const OUR_LANE = 7;

/** Le cadre au-dessus des quilles : bleu nuit, étoiles atomiques, boomerangs, et le numéro de la piste */
function maskingArt(n: number): THREE.CanvasTexture {
  return canvasTex(1024, 320, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 320);
    grd.addColorStop(0, "#1b2350");
    grd.addColorStop(1, "#0d1230");
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 320);
    const r = seeded(n * 17 + 3);
    const star = (x: number, y: number, s: number, c: string) => {
      g.strokeStyle = c;
      g.lineWidth = s * 0.08;
      g.lineCap = "round";
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI;
        const l = k % 2 ? s * 0.55 : s;
        g.beginPath();
        g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, s * 0.12, 0, Math.PI * 2);
      g.fill();
    };
    const cols = ["#4fe3d4", "#ff6fae", "#ffd166", "#ffffff"];
    for (let i = 0; i < 14; i++) star(120 + r() * 800, 40 + r() * 240, 10 + r() * 30, cols[i % cols.length]!);
    // Des boomerangs
    for (let i = 0; i < 6; i++) {
      const x = 80 + r() * 860,
        y = 50 + r() * 220;
      g.fillStyle = cols[(i + 1) % 3]!;
      g.save();
      g.translate(x, y);
      g.rotate(r() * Math.PI);
      g.beginPath();
      g.moveTo(-40, 0);
      g.quadraticCurveTo(0, -38, 40, 0);
      g.quadraticCurveTo(0, -18, -40, 0);
      g.fill();
      g.restore();
    }
    // Le bandeau de chevrons
    g.fillStyle = "#ffd166";
    for (let x = 0; x < 1024; x += 36) {
      g.beginPath();
      g.moveTo(x, 296);
      g.lineTo(x + 18, 280);
      g.lineTo(x + 36, 296);
      g.lineTo(x + 18, 312);
      g.fill();
    }
    // Le numéro de la piste, dans son rond
    g.fillStyle = "#ff6fae";
    g.beginPath();
    g.arc(512, 140, 92, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#0d1230";
    g.beginPath();
    g.arc(512, 140, 78, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = "bold 120px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), 512, 148);
  });
}

/** La moquette : bleu canard, semée de boomerangs, de ronds et d'étoiles */
function carpet(): THREE.CanvasTexture {
  return canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = "#123b42";
      g.fillRect(0, 0, 512, 512);
      const r = seeded(77);
      const cols = ["#e8a33d", "#d9455f", "#5fd0c4", "#f2e3c6"];
      for (let i = 0; i < 70; i++) {
        const x = r() * 512,
          y = r() * 512,
          c = cols[i % cols.length]!;
        g.fillStyle = c;
        g.strokeStyle = c;
        const k = i % 3;
        if (k === 0) {
          g.beginPath();
          g.arc(x, y, 4 + r() * 6, 0, Math.PI * 2);
          g.fill();
        } else if (k === 1) {
          g.lineWidth = 3;
          g.beginPath();
          g.arc(x, y, 10 + r() * 8, 0.3, Math.PI - 0.3);
          g.stroke();
        } else {
          g.lineWidth = 2.5;
          for (let a = 0; a < 4; a++) {
            const an = (a / 4) * Math.PI;
            g.beginPath();
            g.moveTo(x - Math.cos(an) * 9, y - Math.sin(an) * 9);
            g.lineTo(x + Math.cos(an) * 9, y + Math.sin(an) * 9);
            g.stroke();
          }
        }
      }
    },
    true,
  );
}

/** Les lambris : de longues planches de noyer */
function paneling(): THREE.CanvasTexture {
  return canvasTex(
    512,
    512,
    (g) => {
      const r = seeded(9);
      for (let i = 0; i < 8; i++) {
        const k = 0.85 + r() * 0.25;
        g.fillStyle = `rgb(${Math.round(110 * k)},${Math.round(68 * k)},${Math.round(40 * k)})`;
        g.fillRect(i * 64, 0, 64, 512);
        for (let l = 0; l < 10; l++) {
          g.strokeStyle = `rgba(40,20,8,${0.15 + r() * 0.2})`;
          g.lineWidth = 1;
          const x = i * 64 + r() * 64;
          g.beginPath();
          for (let y = 0; y <= 512; y += 16) g.lineTo(x + Math.sin(y * 0.02 + l) * 3, y);
          g.stroke();
        }
        g.fillStyle = "rgba(20,10,4,0.6)";
        g.fillRect(i * 64 + 62, 0, 2, 512);
      }
    },
    true,
  );
}

/** L'écran de score suspendu (la grille des frames, des noms en lettres de lumière) */
function scoreScreen(n: number): THREE.CanvasTexture {
  return canvasTex(512, 320, (g) => {
    g.fillStyle = "#06121c";
    g.fillRect(0, 0, 512, 320);
    g.fillStyle = "#5fe1ff";
    g.font = "bold 30px monospace";
    g.fillText(`PISTE ${n}`, 24, 44);
    g.strokeStyle = "rgba(95,225,255,0.6)";
    g.lineWidth = 2;
    for (let row = 0; row < 4; row++) {
      for (let f = 0; f < 10; f++) g.strokeRect(24 + f * 46, 70 + row * 58, 46, 50);
    }
    g.fillStyle = "#ffd166";
    g.font = "20px monospace";
    const r = seeded(n);
    for (let row = 0; row < 4; row++)
      for (let f = 0; f < 6; f++) g.fillText(r() < 0.3 ? "X" : `${Math.floor(r() * 9)}`, 32 + f * 46, 96 + row * 58);
  });
}

export function retroSalle(): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const masks = Array.from({ length: NEIGHBORS * 2 + 1 }, (_, i) => OUR_LANE - NEIGHBORS + i);
  const maskMats = new Map<number, THREE.Material>();
  for (const n of masks) {
    const t = keep(maskingArt(n));
    maskMats.set(n, std(keep, 0xffffff, 0.6, 0, { map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55 }));
  }
  const style = {
    gutter: 0x34373e,
    gutterMetal: 0.7,
    capping: phys(keep, { color: 0xe9dcc0, roughness: 0.32, clearcoat: 0.8 }),
    kickback: phys(keep, { color: 0x7b1e2b, roughness: 0.4, clearcoat: 0.6 }),
    masking: maskMats.get(OUR_LANE)!,
    deckLight: 0xfff1da,
    deckLightPower: 2.2,
    reflect: 0.55,
    wood: 0xffffff,
  };

  // Le sol de la salle : la moquette derrière l'élan, un sol sombre sous les pistes
  const carpetTex = keep(carpet());
  carpetTex.repeat.set(HALL / 1.6, (BACK - 4.6) / 1.6);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, BACK - 4.62)), std(keep, 0xffffff, 0.95, 0, { map: carpetTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.001, (BACK + 4.62) / 2);
  floor.receiveShadow = true;
  root.add(floor);
  const under = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, CUSHION + 5)), std(keep, 0x1a1410, 0.9));
  under.rotation.x = -Math.PI / 2;
  under.position.set(0, -0.08, -(CUSHION - 5) / 2);
  root.add(under);

  // Les murs : lambris en bas, moutarde en haut, et un néon ondulé tout du long
  const panelTex = keep(paneling());
  panelTex.repeat.set((CUSHION + BACK) / 2.4, 1);
  const panelMat = std(keep, 0xffffff, 0.55, 0, { map: panelTex });
  const paint = std(keep, 0xc89b3c, 0.85);
  for (const side of [-1, 1]) {
    const lower = new THREE.Mesh(keep(new THREE.PlaneGeometry(CUSHION + BACK + 1, 1.4)), panelMat);
    lower.position.set(side * HALL, 0.7, (BACK - CUSHION) / 2);
    lower.rotation.y = -side * (Math.PI / 2);
    const upper = new THREE.Mesh(keep(new THREE.PlaneGeometry(CUSHION + BACK + 1, CEIL - 1.4)), paint);
    upper.position.set(side * HALL, 1.4 + (CEIL - 1.4) / 2, (BACK - CUSHION) / 2);
    upper.rotation.y = -side * (Math.PI / 2);
    root.add(lower, upper);
    const pts: THREE.Vector3[] = [];
    for (let z = BACK - 0.5; z > -HEAD_PIN; z -= 0.6) pts.push(new THREE.Vector3(side * (HALL - 0.03), 2.25 + Math.sin(z * 1.4) * 0.12, z));
    root.add(neon(pts, side < 0 ? 0xff4fa3 : 0x37e0d0, keep, 0.02));
  }
  // Le mur du fond (derrière les joueurs)
  const backWall = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, CEIL)), panelMat);
  backWall.position.set(0, CEIL / 2, BACK);
  backWall.rotation.y = Math.PI;
  root.add(backWall);

  // Les plafonds : clair au-dessus de l'élan et de la banquette, sombre au-dessus des pistes
  const ceilLight = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, BACK + 1)), std(keep, 0x3a2a22, 0.9));
  ceilLight.rotation.x = Math.PI / 2;
  ceilLight.position.set(0, CEIL, (BACK - 1) / 2);
  root.add(ceilLight);
  const ceilDark = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL, CUSHION + 2)), std(keep, 0x0e0c0c, 1));
  ceilDark.rotation.x = Math.PI / 2;
  ceilDark.position.set(0, LANE_CEIL, -(CUSHION + 2) / 2 + 1);
  root.add(ceilDark);
  // Le bandeau qui descend du haut plafond au bas plafond, avec le nom de la salle en lettres de néon
  const soffit = block(2 * HALL, CEIL - LANE_CEIL + 0.3, 0.2, std(keep, 0x2a1d18, 0.8), 0, LANE_CEIL - 0.3, -1, keep);
  root.add(soffit);
  // Les rampes de lumière au-dessus des pistes, en travers, tous les trois mètres
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a6).multiplyScalar(1.15) }));
  for (let z = -2.5; z > -HEAD_PIN + 1; z -= 3) {
    const lamp = new THREE.Mesh(keep(new THREE.BoxGeometry(2 * HALL - 0.6, 0.04, 0.18)), lampMat);
    lamp.position.set(0, LANE_CEIL - 0.03, z);
    lamp.userData.reflect = true;
    root.add(lamp);
  }
  // Les spots ronds du haut plafond
  const spotMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2b8).multiplyScalar(1.8) }));
  for (let x = -HALL + 1; x < HALL; x += 2.2)
    for (const z of [2.5, 6.5, 10]) {
      const s = new THREE.Mesh(keep(new THREE.CircleGeometry(0.16, 20)), spotMat);
      s.rotation.x = Math.PI / 2;
      s.position.set(x, CEIL - 0.005, z);
      root.add(s);
    }

  // Les quilles des pistes voisines
  const neighborXs: number[] = [];
  for (let i = 1; i <= NEIGHBORS; i++) neighborXs.push(-i * LANE_PITCH, i * LANE_PITCH);
  root.add(neighborPinsInstanced(keep, neighborXs));

  // Les retours de boules, entre deux pistes, avec leurs boules de couleur
  const hoodMat = phys(keep, { color: 0x8a1f2c, roughness: 0.35, clearcoat: 0.8 });
  const chrome = std(keep, 0xd8dde3, 0.18, 1);
  const ballCols = [0x1d3c8f, 0xee7a1e, 0x6b3cc9, 0x1f7a4a, 0xc8263a, 0x1fb5b0, 0xf2c12e];
  const ballGeo = keep(new THREE.SphereGeometry(0.1085, 24, 16));
  for (const k of [-3, -1, 1]) {
    const x = (k + 0.5) * LANE_PITCH;
    const i = k;
    const hood = roundBlock(0.42, 0.42, 1.6, 0.12, hoodMat, x, 0.0, 2.6, keep);
    root.add(hood);
    const rail = roundBlock(0.46, 0.05, 1.7, 0.02, chrome, x, 0.42, 2.6, keep);
    root.add(rail);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(ballGeo, phys(keep, { color: ballCols[(k + i + 7) % ballCols.length]!, roughness: 0.15, clearcoat: 1 }));
      b.position.set(x + (k % 2 ? 0.11 : -0.11), 0.55, 3.15 - Math.floor(k / 2) * 0.24 + (k % 2) * 0.05);
      b.castShadow = true;
      root.add(b);
    }
  }

  // Les écrans de score suspendus, au-dessus de l'élan
  const caseMat = std(keep, 0x2b2b30, 0.5, 0.2);
  for (let i = -NEIGHBORS; i <= NEIGHBORS; i++) {
    const x = i * LANE_PITCH;
    const n = OUR_LANE + i;
    const box = block(1.1, 0.7, 0.35, caseMat, x, CEIL - 0.95, -0.4, keep);
    box.rotation.x = 0.28;
    root.add(box);
    const t = keep(scoreScreen(n));
    const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.96, 0.58)), keep(new THREE.MeshBasicMaterial({ map: t })));
    screen.position.set(0, 0, 0.18);
    box.add(screen);
    box.position.y -= 0.0;
    const pole = block(0.04, 0.3, 0.04, chrome, x, CEIL - 0.3, -0.4, keep);
    root.add(pole);
  }

  // La banquette de skaï rouge, en arc, face aux pistes, et sa table ronde
  const vinyl = phys(keep, { color: 0xb3242f, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const bench: BenchSpot[] = [];
  const cz = 7.4,
    R = 1.55;
  const arcShape = (r0: number, r1: number, a0: number, a1: number) => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r1, a0, a1, false);
    s.absarc(0, 0, r0, a1, a0, true);
    return s;
  };
  const a0 = Math.PI * 1.12,
    a1 = Math.PI * 1.88;
  const seat = new THREE.Mesh(
    keep(
      new THREE.ExtrudeGeometry(arcShape(R - 0.32, R + 0.22, a0, a1), {
        depth: 0.42,
        bevelEnabled: true,
        bevelSize: 0.03,
        bevelThickness: 0.03,
        bevelSegments: 2,
        curveSegments: 40,
      }),
    ),
    vinyl,
  );
  seat.rotation.x = -Math.PI / 2;
  seat.position.set(0, 0, cz);
  seat.castShadow = seat.receiveShadow = true;
  root.add(seat);
  const back = new THREE.Mesh(
    keep(
      new THREE.ExtrudeGeometry(arcShape(R + 0.22, R + 0.42, a0, a1), {
        depth: 0.95,
        bevelEnabled: true,
        bevelSize: 0.05,
        bevelThickness: 0.05,
        bevelSegments: 3,
        curveSegments: 40,
      }),
    ),
    vinyl,
  );
  back.rotation.x = -Math.PI / 2;
  back.position.set(0, 0, cz);
  back.castShadow = back.receiveShadow = true;
  root.add(back);
  // Le capitonnage : des boutons sur le dossier
  const tuft = keep(new THREE.SphereGeometry(0.018, 8, 6));
  const tuftMat = std(keep, 0x6e1219, 0.5);
  for (let k = 0; k < 14; k++) {
    const a = a0 + ((k + 0.5) / 14) * (a1 - a0);
    for (const y of [0.62, 0.84]) {
      const t = new THREE.Mesh(tuft, tuftMat);
      t.position.set(Math.cos(a) * (R + 0.2), y, cz - Math.sin(a) * (R + 0.2));
      root.add(t);
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = a0 + ((k + 0.5) / 8) * (a1 - a0);
    bench.push({ x: Math.cos(a) * R, y: 0.45, z: cz - Math.sin(a) * R, yaw: Math.atan2(-Math.cos(a), Math.sin(a)) + Math.PI });
  }
  const table = new THREE.Group();
  table.add(block(0.08, 0.62, 0.08, chrome, 0, 0, 0, keep));
  const top = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 32)),
    phys(keep, { color: 0xf2e6cf, roughness: 0.3, clearcoat: 0.8 }),
  );
  top.position.y = 0.64;
  top.castShadow = top.receiveShadow = true;
  table.add(top);
  const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(0.42, 0.015, 8, 40)), chrome);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.64;
  table.add(rim);
  table.position.set(0, 0, cz - 0.15);
  root.add(table);
  // Deux milk-shakes posés sur la table
  const glass = phys(keep, { color: 0xeaf4ff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1 });
  const shake = std(keep, 0xf6a8c8, 0.6);
  for (const [dx, col] of [
    [-0.12, 0xf6a8c8],
    [0.14, 0xf3e2b5],
  ] as const) {
    const cup = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.045, 0.032, 0.16, 16)), glass);
    cup.position.set(dx, 0.74, cz - 0.1);
    const cream = new THREE.Mesh(keep(new THREE.SphereGeometry(0.045, 12, 8)), col === 0xf6a8c8 ? shake : std(keep, col, 0.6));
    cream.position.set(dx, 0.83, cz - 0.1);
    const straw = block(0.008, 0.16, 0.008, std(keep, 0xe63946, 0.5), dx + 0.015, 0.82, cz - 0.1, keep);
    straw.rotation.z = 0.25;
    root.add(cup, cream, straw);
  }

  // Le comptoir à milk-shakes, ses tabourets, le juke-box, l'enseigne
  const counterMat = phys(keep, { color: 0x2ab3a6, roughness: 0.3, clearcoat: 0.9 });
  const counterTop = phys(keep, { color: 0xf2ead8, roughness: 0.25, clearcoat: 0.8 });
  root.add(roundBlock(5, 1.05, 0.7, 0.06, counterMat, 2.6, 0, BACK - 1.1, keep));
  root.add(roundBlock(5.2, 0.06, 0.85, 0.03, counterTop, 2.6, 1.05, BACK - 1.1, keep));
  root.add(block(5, 0.05, 0.02, chrome, 2.6, 0.5, BACK - 1.46, keep));
  for (let k = 0; k < 5; k++) {
    const sx = 0.8 + k * 0.9;
    root.add(block(0.06, 0.7, 0.06, chrome, sx, 0, BACK - 2.0, keep));
    const cushion = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.18, 0.1, 24)), vinyl);
    cushion.position.set(sx, 0.75, BACK - 2.0);
    cushion.castShadow = true;
    root.add(cushion);
  }
  // Le juke-box : une arche qui luit, ses bandes de couleur, sa vitre
  const juke = new THREE.Group();
  const jbody = roundBlock(0.9, 1.25, 0.6, 0.08, phys(keep, { color: 0x6b3a1e, roughness: 0.3, clearcoat: 1 }), 0, 0, 0, keep);
  juke.add(jbody);
  const arch = new THREE.Mesh(
    keep(new THREE.TorusGeometry(0.45, 0.07, 12, 32, Math.PI)),
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb347).multiplyScalar(2) })),
  );
  arch.position.set(0, 1.25, 0.05);
  juke.add(arch);
  const archFill = new THREE.Mesh(
    keep(new THREE.CircleGeometry(0.42, 32, 0, Math.PI)),
    phys(keep, { color: 0x3a1a10, roughness: 0.2, clearcoat: 1 }),
  );
  archFill.position.set(0, 1.25, 0.06);
  juke.add(archFill);
  for (let k = 0; k < 3; k++) {
    const band = new THREE.Mesh(
      keep(new THREE.BoxGeometry(0.06, 1.05, 0.02)),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color([0xff4fa3, 0x37e0d0, 0xffd166][k]!).multiplyScalar(1.6) })),
    );
    band.position.set(-0.25 + k * 0.25, 0.62, 0.31);
    juke.add(band);
  }
  juke.position.set(-3.6, 0, BACK - 0.55);
  juke.rotation.y = Math.PI;
  root.add(juke);
  const jukeLight = new THREE.PointLight(0xffa04a, 2.5, 4, 1.8);
  jukeLight.position.set(-3.6, 1.2, BACK - 1.2);
  root.add(jukeLight);
  // L'enseigne au néon au-dessus du comptoir : « Bowling » en lettres attachées, et une quille
  const sign = new THREE.Group();
  const pin: THREE.Vector3[] = [];
  for (let k = 0; k <= 32; k++) {
    const t = (k / 32) * Math.PI * 2;
    const y = 0.32 * Math.sin(t - Math.PI / 2) + 0.32;
    const w = 0.035 + 0.075 * Math.exp(-(((y - 0.17) / 0.12) ** 2)) + 0.04 * Math.exp(-(((y - 0.56) / 0.06) ** 2));
    pin.push(new THREE.Vector3(Math.cos(t) * w, y, 0));
  }
  const pinNeon = neon(pin, 0xffffff, keep, 0.012, true);
  pinNeon.position.set(-1.25, 0.05, 0);
  sign.add(pinNeon);
  const word = glowSign("Bowling", "#ff4fa3", "'Great Vibes', 'Brush Script MT', 'Segoe Script', cursive", 0.75, keep);
  word.position.set(0.25, 0.35, 0);
  sign.add(word);
  sign.position.set(2.4, 2.05, BACK - 0.06);
  sign.rotation.y = Math.PI;
  root.add(sign);

  // La lumière : chaude, venue d'en haut ; une lampe sur l'élan pour l'ombre du joueur
  const key = new THREE.SpotLight(0xffd7a8, 16, 12, 0.75, 0.5, 1.3);
  key.position.set(0.4, CEIL - 0.1, 3.2);
  key.target.position.set(0, 0, 0.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  root.add(key, key.target);
  const benchLight = new THREE.PointLight(0xffc98a, 4, 7, 1.5);
  benchLight.position.set(0, CEIL - 0.3, cz - 0.5);
  root.add(benchLight);
  const counterLight = new THREE.PointLight(0x9ff0ff, 3, 6, 1.6);
  counterLight.position.set(2.6, 2.4, BACK - 1.5);
  root.add(counterLight);
  // Les pistes : une lumière douce de haut en bas
  const laneFill = new THREE.DirectionalLight(0xffe0b8, 0.35);
  laneFill.position.set(1.5, 8, 4);
  laneFill.target.position.set(0, 0, -10);
  root.add(laneFill, laneFill.target);

  // Le juke-box et sa lumière restent à part ; tout le reste du décor se fond en quelques formes
  mergeStatic(root, keep);

  return {
    style,
    neighbors: NEIGHBORS,
    neighborPins: (group, x) => {
      // Chaque piste voisine porte le cadre de son numéro
      const n = OUR_LANE + Math.round(x / LANE_PITCH);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material === style.masking) o.material = maskMats.get(n) ?? style.masking;
      });
    },
    root,
    background: new THREE.Color(0x120d0b),
    fog: new THREE.Fog(0x1a120d, 14, 40),
    hemi: [0xffe2c0, 0x3a2418, 0.32],
    env: 0.6,
    exposure: 0.95,
    bloom: [0.4, 0.4, 0.92],
    grade: { warm: 0.05, sat: 1.1, vignette: 0.34 },
    bench,
    update: (t) => {
      // Le juke-box respire
      jukeLight.intensity = 2.2 + Math.sin(t * 2.1) * 0.5;
    },
    dispose,
  };
}
