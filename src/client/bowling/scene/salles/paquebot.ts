// Le paquebot : trois pistes sur le pont d'un grand navire, en plein jour. Le pont de teck aux joints noirs, le
// bastingage blanc et ses bouées, les canots de sauvetage suspendus de chaque côté, des transats ; la mer jusqu'à
// l'horizon, des nuages, un phare au loin, des mouettes qui tournent ; au bout des pistes, le rouf blanc et ses hublots,
// puis le mât et son pavois de fanions jusqu'à la proue ; derrière le banc, les ponts supérieurs et la grande cheminée
// rouge. L'horizon roule doucement.

import * as THREE from "three";
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
/** Les pistes, puis le pont tout autour (en x) */
const LANES_HALF = (NEIGHBORS + 0.5) * LANE_PITCH;
const HALL = LANES_HALF + 1.7;
const BACK = 11;
/** Le rouf au bout des pistes (distances vers l'avant), et la pointe de la proue */
const HOUSE_Z0 = HEAD_PIN - 0.83;
const HOUSE_Z1 = CUSHION + 0.4;
const HOUSE_X = LANES_HALF + 0.3;
const BOW = 34;
const SEA = -9;
const UNDER = -PIT_DEPTH - 0.06;
const MAST = new THREE.Vector3(0, 13, -26);

/** Le teck du pont : de longues lattes dorées aux joints noirs */
function teak(): THREE.CanvasTexture {
  return canvasTex(
    512,
    512,
    (g) => {
      const r = seeded(14);
      for (let x = 0; x < 512; x += 34) {
        let y = -r() * 300;
        while (y < 512) {
          const len = 220 + r() * 260;
          const k = 0.82 + r() * 0.3;
          g.fillStyle = `rgb(${172 * k},${118 * k},${72 * k})`;
          g.fillRect(x, y, 34, len);
          for (let i = 0; i < 4; i++) {
            g.strokeStyle = `rgba(110,70,36,${0.15 + r() * 0.2})`;
            const xx = x + 3 + r() * 28;
            g.beginPath();
            g.moveTo(xx, y);
            g.lineTo(xx + r() * 3 - 1.5, y + len);
            g.stroke();
          }
          g.fillStyle = "#1a120c";
          g.fillRect(x, y + len - 2, 34, 2);
          y += len;
        }
        g.fillStyle = "#1a120c";
        g.fillRect(x + 32, 0, 2, 512);
      }
    },
    true,
  );
}

/** Une paroi blanche percée de hublots cerclés de laiton (et, en haut, un bandeau peint) */
function portholes(title?: string): THREE.CanvasTexture {
  return canvasTex(
    1024,
    256,
    (g) => {
      g.fillStyle = "#f4f2ec";
      g.fillRect(0, 0, 1024, 256);
      g.fillStyle = "rgba(0,0,0,0.05)";
      for (let x = 0; x < 1024; x += 128) g.fillRect(x, 0, 2, 256);
      const y = title ? 170 : 128;
      if (title) {
        g.fillStyle = "#14305a";
        g.fillRect(0, 0, 1024, 82);
        g.fillStyle = "#e8c060";
        g.fillRect(0, 82, 1024, 6);
        g.font = "bold 50px Georgia, serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(title, 512, 44);
      }
      for (let x = 64; x < 1024; x += 128) {
        g.fillStyle = "#b88a3a";
        g.beginPath();
        g.arc(x, y, 34, 0, Math.PI * 2);
        g.fill();
        const grd = g.createLinearGradient(x - 26, y - 26, x + 26, y + 26);
        grd.addColorStop(0, "#9ad0f0");
        grd.addColorStop(0.5, "#2a5a8a");
        grd.addColorStop(1, "#163050");
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, 26, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.6)";
        g.beginPath();
        g.ellipse(x - 9, y - 10, 8, 4, -0.7, 0, Math.PI * 2);
        g.fill();
      }
    },
    true,
  );
}

/** De grandes baies (le pont supérieur) */
function windows(): THREE.CanvasTexture {
  return canvasTex(
    512,
    128,
    (g) => {
      g.fillStyle = "#f4f2ec";
      g.fillRect(0, 0, 512, 128);
      for (let x = 16; x < 512; x += 64) {
        const grd = g.createLinearGradient(0, 30, 0, 100);
        grd.addColorStop(0, "#8ac4e8");
        grd.addColorStop(1, "#1e4060");
        g.fillStyle = grd;
        g.fillRect(x, 30, 48, 64);
      }
      g.fillStyle = "#14305a";
      g.fillRect(0, 118, 512, 10);
    },
    true,
  );
}

/** La coque : bleu marine sous un liseré doré, blanche au-dessus */
function hullArt(): THREE.CanvasTexture {
  return canvasTex(4, 256, (g) => {
    g.fillStyle = "#f4f2ec";
    g.fillRect(0, 0, 4, 256);
    g.fillStyle = "#14243f";
    g.fillRect(0, 70, 4, 186);
    g.fillStyle = "#d8b050";
    g.fillRect(0, 66, 4, 4);
  });
}

/** La mer : un bleu profond, des rides plus claires et des moutons d'écume */
function seaArt(): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#1d5f8e";
      g.fillRect(0, 0, 256, 256);
      const r = seeded(23);
      for (let i = 0; i < 220; i++) {
        const x = r() * 256,
          y = r() * 256,
          w = 8 + r() * 30;
        g.strokeStyle = r() < 0.7 ? "rgba(90,160,210,0.55)" : "rgba(10,40,80,0.5)";
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + w / 2, y - 2.5, x + w, y);
        g.stroke();
      }
      for (let i = 0; i < 26; i++) {
        g.fillStyle = "rgba(255,255,255,0.75)";
        g.fillRect(r() * 256, r() * 256, 3 + r() * 4, 1.5);
      }
    },
    true,
  );
}

/** Un nuage moelleux */
function cloudArt(seed: number): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    const r = seeded(seed);
    for (let i = 0; i < 14; i++) {
      const x = 40 + r() * 176,
        y = 50 + r() * 40 - Math.abs(x - 128) * 0.15,
        rad = 18 + r() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, "rgba(255,255,255,0.95)");
      grd.addColorStop(0.6, "rgba(250,252,255,0.7)");
      grd.addColorStop(1, "rgba(240,246,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Le cadre au-dessus des quilles : bleu marine, cordage doré, une bouée et le numéro de la piste */
function maskingArt(n: number): THREE.CanvasTexture {
  return canvasTex(1024, 320, (g) => {
    g.fillStyle = "#14305a";
    g.fillRect(0, 0, 1024, 320);
    g.strokeStyle = "#e8c060";
    g.lineWidth = 8;
    g.setLineDash([18, 8]);
    g.strokeRect(18, 18, 988, 284);
    g.setLineDash([]);
    // La bouée et son numéro
    for (let k = 0; k < 8; k++) {
      g.strokeStyle = k % 2 ? "#f4f2ec" : "#d8283a";
      g.lineWidth = 30;
      g.beginPath();
      g.arc(170, 160, 82, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "#f4f2ec";
    g.font = "bold 92px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), 170, 166);
    g.font = "italic 62px Georgia, serif";
    g.fillText(["Bon vent !", "Pont des sports", "Cap au strike"][(n - 1) % 3]!, 610, 164);
  });
}

/** Une bande dressée le long d'un tracé (la coque) : du bas jusqu'à une hauteur propre à chaque point */
function ribbon(pts: { x: number; z: number; top: number }[], bottom: number, mat: THREE.Material, keep: Keep): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let len = 0;
  pts.forEach((p, i) => {
    if (i) len += Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z);
    pos.push(p.x, bottom, p.z, p.x, p.top, p.z);
    uv.push(len / 4, 0, len / 4, 1);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = keep(new THREE.BufferGeometry());
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** Un tube droit entre deux points */
function rail(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, keep: Keep): THREE.Mesh {
  return new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 2, r, 8)), mat);
}

export function paquebotSalle(): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const r = seeded(29);
  const masks = new Map<number, THREE.Material>();
  for (let i = -NEIGHBORS; i <= NEIGHBORS; i++) {
    const t = keep(maskingArt(OUR_LANE + i));
    masks.set(OUR_LANE + i, std(keep, 0xffffff, 0.7, 0, { map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.2 }));
  }
  const white = phys(keep, { color: 0xf4f2ec, roughness: 0.35, clearcoat: 0.6 });
  const navy = std(keep, 0x14305a, 0.5);
  const brass = phys(keep, { color: 0xc89a48, metalness: 0.85, roughness: 0.3 });
  const teakWood = phys(keep, { color: 0xb07a48, roughness: 0.45, clearcoat: 0.5 });
  const style = {
    gutter: 0x30343c,
    gutterMetal: 0.6,
    capping: teakWood,
    kickback: phys(keep, { color: 0xf4f2ec, roughness: 0.4 }),
    masking: masks.get(OUR_LANE)!,
    deckLight: 0xfff6e8,
    deckLightPower: 2.2,
    reflect: 0.45,
    wood: 0xfff6ea,
  };

  // Le monde autour du navire (le ciel, la mer, les nuages, le phare) : il roule doucement
  const world = new THREE.Group();
  world.userData.live = true;
  root.add(world);
  world.add(
    skyDome(
      keep,
      [
        [0, "#2f78c8"],
        [0.3, "#5ea2e0"],
        [0.46, "#a8d4f4"],
        [0.5, "#dceefa"],
        [0.56, "#bcdaf0"],
        [1, "#7aa6c8"],
      ],
      200,
    ),
  );
  const seaTex = keep(seaArt());
  seaTex.repeat.set(90, 90);
  const sea = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(560, 560)),
    std(keep, 0xffffff, 0.22, 0.3, { map: seaTex, emissive: 0x0a2a48, emissiveIntensity: 0.4 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA;
  world.add(sea);
  for (let k = 0; k < 11; k++) {
    const t = keep(cloudArt(40 + k));
    const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false })));
    const a = -Math.PI * 0.95 + (k / 10) * Math.PI * 0.9 + r() * 0.15;
    const d = 120 + r() * 55;
    s.position.set(Math.cos(a) * d, 16 + r() * 24, Math.sin(a) * d);
    s.scale.set(38 + r() * 30, 17 + r() * 10, 1);
    world.add(s);
  }
  // Une île au loin et son phare
  const island = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 20, 10)), std(keep, 0x5a7a4a, 0.95));
  island.position.set(80, SEA, -150);
  island.scale.set(26, 6, 14);
  world.add(island);
  const lighthouse = new THREE.Group();
  lighthouse.position.set(73, SEA + 5.5, -148);
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.9 - k * 0.1, 1 - k * 0.1, 2.2, 16)),
      std(keep, k % 2 ? 0xd8283a : 0xf4f2ec, 0.6),
    );
    m.position.y = 1.1 + k * 2.2;
    lighthouse.add(m);
  }
  const lamp = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.7, 14, 10)),
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.8, 1.2) })),
  );
  lamp.position.y = 9.4;
  lighthouse.add(lamp);
  world.add(lighthouse);

  // Le pont de teck, de la poupe à la proue, autour des pistes
  const deckTex = keep(teak());
  const outline = new THREE.Shape();
  outline.moveTo(-HALL, -(BACK + 12));
  outline.lineTo(HALL, -(BACK + 12));
  outline.lineTo(HALL, HOUSE_Z1 + 1);
  outline.bezierCurveTo(HALL, BOW - 5, HALL * 0.45, BOW - 0.6, 0, BOW);
  outline.bezierCurveTo(-HALL * 0.45, BOW - 0.6, -HALL, BOW - 5, -HALL, HOUSE_Z1 + 1);
  outline.lineTo(-HALL, -(BACK + 12));
  const hole = new THREE.Path();
  hole.moveTo(-LANES_HALF, -APPROACH);
  hole.lineTo(LANES_HALF, -APPROACH);
  hole.lineTo(LANES_HALF, HOUSE_Z1 - 0.2);
  hole.lineTo(-LANES_HALF, HOUSE_Z1 - 0.2);
  hole.lineTo(-LANES_HALF, -APPROACH);
  outline.holes.push(hole);
  const deckGeo = keep(new THREE.ShapeGeometry(outline, 24));
  deckGeo.rotateX(-Math.PI / 2);
  const dp = deckGeo.getAttribute("position") as THREE.BufferAttribute;
  const duv = deckGeo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < dp.count; i++) duv.setXY(i, dp.getX(i) / 2, dp.getZ(i) / 2);
  const deck = new THREE.Mesh(deckGeo, std(keep, 0xffffff, 0.6, 0, { map: deckTex }));
  deck.position.y = -0.002;
  deck.receiveShadow = true;
  root.add(deck);
  const pit = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * LANES_HALF, HOUSE_Z1)), std(keep, 0x101010, 1));
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(0, UNDER, -HOUSE_Z1 / 2);
  root.add(pit);

  // La coque : ses flancs plongent dans la mer, elle monte en pavois à la proue
  const bowCurve = (side: number) =>
    new THREE.CubicBezierCurve(
      new THREE.Vector2(side * HALL, HOUSE_Z1 + 1),
      new THREE.Vector2(side * HALL, BOW - 5),
      new THREE.Vector2(side * HALL * 0.45, BOW - 0.6),
      new THREE.Vector2(0, BOW),
    );
  const hullPts: { x: number; z: number; top: number }[] = [];
  const topAt = (along: number) => Math.max(0, Math.min(1, (along - HOUSE_Z1 - 1) / 5)) * 1.0;
  hullPts.push({ x: -HALL, z: BACK + 12, top: 0 });
  for (const p of bowCurve(-1).getPoints(30)) hullPts.push({ x: p.x, z: -p.y, top: topAt(p.y) });
  for (const p of bowCurve(1).getPoints(30).reverse().slice(1)) hullPts.push({ x: p.x, z: -p.y, top: topAt(p.y) });
  hullPts.push({ x: HALL, z: BACK + 12, top: 0 });
  const hullTex = keep(hullArt());
  root.add(ribbon(hullPts, SEA - 1, std(keep, 0xffffff, 0.5, 0, { map: hullTex, side: THREE.DoubleSide }), keep));

  // Le bastingage : des montants, trois lisses, une main courante sur le pavois de la proue
  const railTop = 1.05;
  for (const side of [-1, 1]) {
    const x = side * (HALL - 0.05);
    const z0 = BACK - 0.2,
      z1 = -(HOUSE_Z1 + 1);
    for (let z = z0; z >= z1; z -= 1.5) root.add(block(0.04, railTop, 0.04, white, x, 0, z, keep));
    root.add(rail(new THREE.Vector3(x, railTop, z0), new THREE.Vector3(x, railTop, z1), 0.032, white, keep));
    for (const y of [0.38, 0.72]) root.add(rail(new THREE.Vector3(x, y, z0), new THREE.Vector3(x, y, z1), 0.012, white, keep));
    const bow = bowCurve(side)
      .getPoints(24)
      .map((p) => new THREE.Vector3(p.x - side * 0.04, Math.max(railTop, topAt(p.y) + 0.05), -p.y));
    root.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bow), 48, 0.032, 8)), teakWood));
    // Les bouées accrochées au bastingage
    const buoyTex = keep(
      canvasTex(64, 8, (g) =>
        ["#d8283a", "#f4f2ec", "#d8283a", "#f4f2ec"].forEach((c, k) => ((g.fillStyle = c), g.fillRect(k * 16, 0, 16, 8))),
      ),
    );
    const buoyMat = std(keep, 0xffffff, 0.5, 0, { map: buoyTex });
    for (const z of [2.2, -6.5, -14]) {
      const b = new THREE.Mesh(keep(new THREE.TorusGeometry(0.26, 0.07, 10, 28)), buoyMat);
      b.position.set(x - side * 0.1, 0.62, z);
      b.rotation.y = Math.PI / 2;
      root.add(b);
    }
  }

  // Les canots de sauvetage, suspendus à leurs bossoirs par-dessus le bastingage
  const davit = std(keep, 0xf4f2ec, 0.5);
  const boatHull = phys(keep, { color: 0xf4f2ec, roughness: 0.35, clearcoat: 0.6 });
  const boatCover = std(keep, 0xff7a1a, 0.6);
  for (const side of [-1, 1]) {
    for (const z of [-3.5, -11]) {
      const x = side * (HALL + 1.0);
      const hull = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.6, 2.6, 6, 16)), boatHull);
      hull.rotation.x = Math.PI / 2;
      hull.scale.set(1, 1, 0.55);
      hull.position.set(x, 1.7, z);
      const cover = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.56, 2.5, 6, 16)), boatCover);
      cover.rotation.x = Math.PI / 2;
      cover.scale.set(1, 1, 0.5);
      cover.position.set(x, 1.95, z);
      root.add(hull, cover);
      for (const dz of [-1.4, 1.4]) {
        const arm = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(side * (HALL - 0.35), 0, z + dz),
          new THREE.Vector3(side * (HALL - 0.35), 3.4, z + dz),
          new THREE.Vector3(x, 3.1, z + dz),
        );
        root.add(new THREE.Mesh(keep(new THREE.TubeGeometry(arm, 16, 0.07, 8)), davit));
        root.add(rail(new THREE.Vector3(x, 3.05, z + dz), new THREE.Vector3(x, 2.2, z + dz * 0.8), 0.012, navy, keep));
      }
    }
  }

  // Des transats rayés sur les côtés
  const canvasTexr = keep(
    canvasTex(
      64,
      64,
      (g) => [0, 1, 2, 3].forEach((k) => ((g.fillStyle = k % 2 ? "#f4f2ec" : "#2a6ab8"), g.fillRect(k * 16, 0, 16, 64))),
      true,
    ),
  );
  const canvasMat = std(keep, 0xffffff, 0.8, 0, { map: canvasTexr, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    for (const z of [3.2, 0.6]) {
      const g = new THREE.Group();
      g.position.set(side * (HALL - 0.75), 0, z);
      g.add(block(0.5, 0.03, 0.9, canvasMat, 0, 0.3, 0.1, keep));
      const back = block(0.5, 0.03, 0.75, canvasMat, 0, 0, 0, keep);
      back.position.set(0, 0.6, 0.78);
      back.rotation.x = -1.0;
      g.add(back);
      for (const dx of [-0.26, 0.26]) {
        g.add(block(0.03, 0.3, 0.03, teakWood, dx, 0, -0.3, keep));
        g.add(block(0.03, 0.3, 0.03, teakWood, dx, 0, 0.5, keep));
      }
      root.add(g);
    }
  }

  // Le rouf au bout des pistes : sa façade de hublots et son nom, ses côtés, son toit et sa rambarde
  const facadeTex = keep(portholes("PONT DES SPORTS"));
  facadeTex.repeat.set(1, 1);
  const facade = std(keep, 0xffffff, 0.5, 0, { map: facadeTex });
  root.add(block(2 * HOUSE_X, 3.0 - CEIL_Y - 0.62, 0.12, facade, 0, CEIL_Y + 0.62, -HOUSE_Z0 - 0.06, keep));
  for (const side of [-1, 1]) {
    root.add(
      block(HOUSE_X - LANES_HALF, CEIL_Y + 0.62 - UNDER, 0.12, white, (side * (LANES_HALF + HOUSE_X)) / 2, UNDER, -HOUSE_Z0 - 0.06, keep),
    );
    const sideTex = keep(portholes());
    sideTex.repeat.set((HOUSE_Z1 - HOUSE_Z0) / 6, 1);
    root.add(
      block(
        0.12,
        3.0 - UNDER,
        HOUSE_Z1 - HOUSE_Z0,
        std(keep, 0xffffff, 0.5, 0, { map: sideTex }),
        side * HOUSE_X,
        UNDER,
        -(HOUSE_Z0 + HOUSE_Z1) / 2,
        keep,
      ),
    );
  }
  root.add(block(2 * HOUSE_X, 3.0 - UNDER, 0.12, white, 0, UNDER, -HOUSE_Z1, keep));
  root.add(block(2 * HOUSE_X + 0.2, 0.12, HOUSE_Z1 - HOUSE_Z0 + 0.2, white, 0, 3.0, -(HOUSE_Z0 + HOUSE_Z1) / 2, keep));
  root.add(block(2 * HOUSE_X + 0.22, 0.05, 0.14, brass, 0, CEIL_Y + 0.6, -HOUSE_Z0 + 0.02, keep));
  for (const side of [-1, 1]) {
    for (let z = HOUSE_Z0; z <= HOUSE_Z1 + 0.01; z += (HOUSE_Z1 - HOUSE_Z0) / 3)
      root.add(block(0.03, 0.7, 0.03, white, side * (HOUSE_X + 0.05), 3.12, -z, keep));
    root.add(
      rail(
        new THREE.Vector3(side * (HOUSE_X + 0.05), 3.82, -HOUSE_Z0),
        new THREE.Vector3(side * (HOUSE_X + 0.05), 3.82, -HOUSE_Z1),
        0.022,
        white,
        keep,
      ),
    );
  }
  root.add(
    rail(new THREE.Vector3(-HOUSE_X - 0.05, 3.82, -HOUSE_Z0), new THREE.Vector3(HOUSE_X + 0.05, 3.82, -HOUSE_Z0), 0.022, white, keep),
  );
  // Une cloche de laiton sur le toit du rouf
  const bell = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.1, 0.18, 0.28, 16, 1, true)), brass);
  bell.position.set(1.6, 3.55, -HOUSE_Z0 - 0.4);
  root.add(bell, block(0.04, 0.42, 0.04, brass, 1.6, 3.12, -HOUSE_Z0 - 0.4, keep));

  // Le mât, sa vergue, et le grand pavois de fanions jusqu'à la proue
  const mastMat = std(keep, 0xd8c8a8, 0.6);
  const mast = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.18, MAST.y, 12)), mastMat);
  mast.position.set(MAST.x, MAST.y / 2, MAST.z);
  root.add(mast);
  const yardY = MAST.y - 3.5;
  root.add(rail(new THREE.Vector3(-2.2, yardY, MAST.z), new THREE.Vector3(2.2, yardY, MAST.z), 0.06, mastMat, keep));
  const topLight = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.14, 12, 8)),
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.6) })),
  );
  topLight.position.set(MAST.x, MAST.y + 0.1, MAST.z);
  root.add(topLight);
  const flagColors = [0xd8283a, 0xffd23a, 0x2a6ab8, 0xf4f2ec, 0x2fa05a, 0xff7a1a];
  const flagMats = flagColors.map((c) => std(keep, c, 0.7, 0, { side: THREE.DoubleSide }));
  const flagGeo = keep(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.13, 0, 0),
      new THREE.Vector3(0.13, 0, 0),
      new THREE.Vector3(0, -0.32, 0),
    ]),
  );
  flagGeo.computeVertexNormals();
  const lineMat = std(keep, 0x333333, 0.8);
  const bunting = (a: THREE.Vector3, b: THREE.Vector3, sag: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    root.add(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 32, 0.008, 4)), lineMat));
    const n = Math.round(a.distanceTo(b) / 0.42);
    for (let i = 1; i < n; i++) {
      const p = curve.getPointAt(i / n);
      const t = curve.getTangentAt(i / n);
      const f = new THREE.Mesh(flagGeo, flagMats[i % flagMats.length]!);
      f.position.copy(p);
      f.rotation.y = Math.atan2(-t.z, t.x);
      root.add(f);
    }
  };
  bunting(MAST.clone().setY(MAST.y - 0.2), new THREE.Vector3(0, 1.3, -BOW + 0.3), 0.8);
  bunting(MAST.clone().setY(MAST.y - 0.2), new THREE.Vector3(0, 3.85, -HOUSE_Z0 - 0.1), 0.7);
  for (const side of [-1, 1])
    bunting(new THREE.Vector3(side * 2.1, yardY, MAST.z), new THREE.Vector3(side * (HALL - 0.1), railTop, -HOUSE_Z1 - 1.5), 0.4);

  // Derrière le banc : les ponts supérieurs, leurs hublots et leurs baies, la grande cheminée rouge
  const aftTex = keep(portholes());
  aftTex.repeat.set((2 * HALL) / 6, 1);
  root.add(block(2 * HALL, 3.0, 10, std(keep, 0xffffff, 0.5, 0, { map: aftTex }), 0, 0, BACK + 5, keep));
  const winTex = keep(windows());
  winTex.repeat.set(1.4, 1);
  root.add(block(6.4, 2.4, 7, std(keep, 0xffffff, 0.5, 0, { map: winTex }), 0, 3.0, BACK + 5.5, keep));
  root.add(block(6.8, 0.1, 7.4, white, 0, 5.4, BACK + 5.5, keep));
  for (const x of [-1.4, 1.4]) root.add(block(0.9, 2.0, 0.06, navy, x, 0, BACK - 0.02, keep));
  const funnel = new THREE.Group();
  funnel.position.set(0, 5.5, BACK + 6.5);
  funnel.rotation.x = 0.08;
  const fun = (rTop: number, rBot: number, h: number, y: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(rTop, rBot, h, 28)), mat);
    m.position.y = y;
    m.scale.z = 1.45;
    funnel.add(m);
  };
  fun(1.3, 1.45, 5.2, 2.6, std(keep, 0xc8283a, 0.45));
  fun(1.33, 1.36, 0.5, 4.0, std(keep, 0xf4f2ec, 0.5));
  fun(1.3, 1.31, 1.2, 5.8, std(keep, 0x1a1a1e, 0.6));
  root.add(funnel);

  // Le banc des joueurs, et le retour de boules
  const bench = straightBench(root, keep, teakWood, 7.0, 4.8);
  ballReturn(root, keep, -0.5 * LANE_PITCH, navy, brass, 4);
  root.add(neighborPinsInstanced(keep, [-LANE_PITCH, LANE_PITCH]));

  // Les mouettes qui tournent au-dessus de la mer
  const gullMat = std(keep, 0xf8f8f8, 0.6);
  const wingGeo = keep(new THREE.BoxGeometry(0.62, 0.015, 0.17));
  wingGeo.translate(0.31, 0, 0);
  const tipGeo = keep(new THREE.BoxGeometry(0.16, 0.017, 0.12));
  tipGeo.translate(0.56, 0, -0.01);
  const bodyGeo = keep(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8));
  bodyGeo.rotateX(Math.PI / 2);
  const tipMat = std(keep, 0x303034, 0.6);
  const gulls: { g: THREE.Group; wl: THREE.Group; wr: THREE.Group; c: THREE.Vector3; rad: number; w: number; ph: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const g = new THREE.Group();
    g.userData.live = true;
    g.add(new THREE.Mesh(bodyGeo, gullMat));
    const wing = (s: number) => {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(wingGeo, gullMat), new THREE.Mesh(tipGeo, tipMat));
      w.scale.x = s;
      g.add(w);
      return w;
    };
    const wl = wing(-1),
      wr = wing(1);
    root.add(g);
    gulls.push({
      g,
      wl,
      wr,
      c: new THREE.Vector3((k % 2 ? 1 : -1) * (9 + r() * 10), 6 + r() * 7, -6 - r() * 22),
      rad: 5 + r() * 7,
      w: (0.25 + r() * 0.2) * (k % 3 ? 1 : -1),
      ph: r() * 6,
    });
  }

  // La lumière : le grand soleil, le ciel, la mer qui éclaire par en dessous
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.7);
  sun.position.set(9, 16, -5);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -8;
  sc.right = 8;
  sc.top = 10;
  sc.bottom = -10;
  sc.near = 1;
  sc.far = 50;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  root.add(sun, sun.target);

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
    background: new THREE.Color(0x8ac4f0),
    fog: new THREE.Fog(0xd4e9f8, 60, 240),
    hemi: [0xcfe8ff, 0x2a5a7a, 0.9],
    env: 0.85,
    exposure: 1.0,
    bloom: [0.22, 0.4, 0.95],
    grade: { warm: 0.02, sat: 1.1, vignette: 0.22 },
    bench,
    update: (t) => {
      // L'horizon roule doucement, la mer avance
      world.rotation.z = Math.sin(t * 0.33) * 0.006;
      world.rotation.x = Math.sin(t * 0.25 + 1) * 0.004;
      seaTex.offset.set(t * 0.002, -t * 0.012);
      // Les mouettes tournent en battant des ailes, puis planent
      for (const m of gulls) {
        const a = m.ph + t * m.w;
        m.g.position.set(m.c.x + Math.cos(a) * m.rad, m.c.y + Math.sin(t * 0.5 + m.ph) * 0.6, m.c.z + Math.sin(a) * m.rad);
        m.g.rotation.y = m.w > 0 ? -a : Math.PI - a;
        m.g.rotation.z = m.w > 0 ? -0.25 : 0.25;
        const flap = Math.sin(t * 1.3 + m.ph) > 0.2 ? Math.sin(t * 8 + m.ph) * 0.5 : 0.1;
        m.wr.rotation.z = 0.15 + flap;
        m.wl.rotation.z = -(0.15 + flap);
      }
    },
    dispose,
  };
}
