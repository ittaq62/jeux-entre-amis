// La station spatiale : une piste dans le long module de loisirs d'une station en orbite. À droite, derrière les
// grandes baies, la Terre immense, ses nuages et le bleu de son atmosphère ; à gauche, les panneaux solaires sur leur
// poutre, leurs feux qui clignotent, un satellite qui dérive ; au bout de la piste, un hublot rond ouvert sur la Lune.
// Des bandeaux de lumière au plafond, des mains courantes, un mur de plantes sous leurs lampes roses, et un globe en
// hologramme qui tourne près du banc.

import * as THREE from "three";
import { APPROACH, CUSHION, GUTTER_OUTER, HEAD_PIN, PIT_DEPTH } from "../../../../shared/games/bowling/lane.ts";
import { CEIL_Y } from "../laneMesh.ts";
import { fbm, seeded, valueNoise } from "../textures.ts";
import { arcBench, ballReturn, bin, block, canvasTex, mergeStatic, phys, std, type Keep, type Salle } from "./common.ts";

const INNER = GUTTER_OUTER + 0.1;
const HALL = INNER + 1.8;
const CEIL = 3.5;
const BACK = 11;
const END_Z = HEAD_PIN - 0.83;
const HOUSE_Z1 = CUSHION + 0.4;
const UNDER = -PIT_DEPTH - 0.06;
/** Les baies : leur bas, leur haut, de quel z à quel z de chaque côté */
const WIN_LOW = 0.55;
const WIN_HIGH = 2.95;
const WIN_FROM = { left: 2.6, right: 7.6 };
const WIN_TO = -(END_Z - 0.8);
/** Le hublot rond au bout de la piste */
const PORT_Y = 2.55;
const PORT_R = 0.78;
const EARTH = new THREE.Vector3(58, -74, -82);
const EARTH_R = 70;

/** Des panneaux blancs, leurs joints, quelques vis */
function panels(seed: number, tint = "#e9edf2"): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (g) => {
      const r = seeded(seed);
      g.fillStyle = tint;
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const k = 0.97 + r() * 0.04;
          g.fillStyle = `rgba(${200 * k},${208 * k},${218 * k},0.35)`;
          g.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
          g.fillStyle = "#9aa4b0";
          for (const [dx, dy] of [
            [10, 10],
            [114, 10],
            [10, 114],
            [114, 114],
          ] as const)
            g.fillRect(i * 128 + dx, j * 128 + dy, 3, 3);
        }
      }
      g.fillStyle = "#a8b2be";
      g.fillRect(0, 0, 256, 2);
      g.fillRect(0, 128, 256, 2);
      g.fillRect(0, 0, 2, 256);
      g.fillRect(128, 0, 2, 256);
    },
    true,
  );
}

/** La Terre : des océans, des continents, des déserts, la glace aux pôles */
function earthArt(): THREE.CanvasTexture {
  const W = 1024,
    H = 512;
  return canvasTex(W, H, (g) => {
    const img = g.createImageData(W, H);
    const land = valueNoise(5, 8);
    const dry = valueNoise(9, 8);
    for (let j = 0; j < H; j++) {
      const lat = Math.abs(j / H - 0.5) * 2;
      for (let i = 0; i < W; i++) {
        const u = (i / W) * 8,
          v = (j / H) * 4;
        const n = fbm(land, u, v, 4);
        const d = fbm(dry, u + 3, v, 3);
        let c: [number, number, number];
        if (lat > 0.86 + (n - 0.5) * 0.2) c = [235, 242, 250];
        else if (n > 0.54) {
          const h = Math.min(1, (n - 0.54) * 5);
          c = d > 0.55 && lat < 0.55 ? [196 - h * 30, 168 - h * 30, 118 - h * 20] : [62 + h * 50, 112 + h * 20, 58 + h * 10];
        } else {
          const deep = Math.min(1, (0.54 - n) * 6);
          c = [22 + (1 - deep) * 30, 64 + (1 - deep) * 70, 128 + (1 - deep) * 60];
        }
        const o = (j * W + i) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/** Les nuages de la Terre : des tourbillons blancs, transparents ailleurs */
function cloudsArt(): THREE.CanvasTexture {
  const W = 1024,
    H = 512;
  return canvasTex(W, H, (g) => {
    const img = g.createImageData(W, H);
    const noise = valueNoise(13, 16);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const n = fbm(noise, (i / W) * 16, (j / H) * 8 + Math.sin((i / W) * Math.PI * 6) * 0.4, 4);
        const a = Math.max(0, Math.min(1, (n - 0.5) * 4));
        const o = (j * W + i) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = a * 230;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/** Les cellules des panneaux solaires */
function solarArt(): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#c8a040";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const grd = g.createLinearGradient(0, j * 32, 0, j * 32 + 30);
          grd.addColorStop(0, "#1e3a7a");
          grd.addColorStop(1, "#0e1e4a");
          g.fillStyle = grd;
          g.fillRect(i * 32 + 1, j * 32 + 1, 30, 30);
        }
      }
    },
    true,
  );
}

/** Le cadre au-dessus des quilles : un écran bleu nuit, une grille, la piste orbitale */
function maskingArt(): THREE.CanvasTexture {
  return canvasTex(1024, 320, (g) => {
    g.fillStyle = "#070d24";
    g.fillRect(0, 0, 1024, 320);
    g.strokeStyle = "rgba(90,216,255,0.25)";
    g.lineWidth = 1.5;
    for (let x = 0; x < 1024; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 320);
      g.stroke();
    }
    for (let y = 0; y < 320; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(1024, y);
      g.stroke();
    }
    g.strokeStyle = "#5ad8ff";
    g.lineWidth = 6;
    g.strokeRect(12, 12, 1000, 296);
    // Une petite planète et son anneau
    g.fillStyle = "#ff8ac0";
    g.beginPath();
    g.arc(150, 160, 52, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#ffd23a";
    g.lineWidth = 7;
    g.beginPath();
    g.ellipse(150, 160, 92, 24, -0.3, 0, Math.PI * 2);
    g.stroke();
    g.font = "bold 74px 'Segoe UI', 'Arial Black', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#e8f8ff";
    g.shadowColor = "#5ad8ff";
    g.shadowBlur = 18;
    g.fillText("PISTE ORBITALE", 600, 166);
  });
}

/** Un halo bleu au bord de la Terre : plus fort là où on la voit par la tranche */
function atmosphere(keep: Keep): THREE.ShaderMaterial {
  return keep(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vP;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          vP = p.xyz;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vP;
        void main() {
          float rim = 1.0 - abs(dot(normalize(vN), normalize(-vP)));
          float a = pow(rim, 2.6);
          gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * 1.7 * a, a);
        }`,
    }),
  );
}

export function stationSalle(): Salle {
  const { keep, dispose } = bin();
  const root = new THREE.Group();
  const r = seeded(53);
  const maskTex = keep(maskingArt());
  const white = phys(keep, { color: 0xeef1f5, roughness: 0.35, clearcoat: 0.6 });
  const grey = std(keep, 0x8a929e, 0.5, 0.4);
  const metal = phys(keep, { color: 0xc8ced8, metalness: 0.85, roughness: 0.3 });
  const cyan = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.9, 2.4) }));
  const style = {
    gutter: 0x3a404a,
    gutterMetal: 0.7,
    capping: phys(keep, { color: 0xdfe4ea, roughness: 0.25, clearcoat: 0.8 }),
    kickback: white,
    masking: std(keep, 0xffffff, 0.6, 0, { map: maskTex, emissiveMap: maskTex, emissive: 0xffffff, emissiveIntensity: 0.6 }),
    deckLight: 0xe8f4ff,
    deckLightPower: 2.4,
    reflect: 0.55,
    wood: 0xf4f6ff,
  };

  // L'espace : les étoiles tout autour, la Terre, ses nuages, son atmosphère, la Lune au loin
  const starPos: number[] = [];
  const starCol: number[] = [];
  for (let i = 0; i < 1600; i++) {
    const u = r() * 2 - 1,
      a = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos.push(Math.cos(a) * s * 220, u * 220, Math.sin(a) * s * 220);
    const k = 0.7 + r() * 0.8;
    const warm = r();
    starCol.push(k * (warm > 0.8 ? 1.2 : 1), k, k * (warm < 0.2 ? 1.3 : 1));
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.Float32BufferAttribute(starCol, 3));
  root.add(new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true }))));
  const earth = new THREE.Group();
  earth.position.copy(EARTH);
  earth.rotation.set(0.35, 0, 0.2);
  earth.userData.live = true;
  root.add(earth);
  const ground = new THREE.Mesh(
    keep(new THREE.SphereGeometry(EARTH_R, 96, 64)),
    std(keep, 0xffffff, 0.75, 0, { map: keep(earthArt()), emissive: 0x0a1430, emissiveIntensity: 0.35 }),
  );
  const cloudLayer = new THREE.Mesh(
    keep(new THREE.SphereGeometry(EARTH_R * 1.012, 96, 64)),
    keep(new THREE.MeshStandardMaterial({ map: keep(cloudsArt()), transparent: true, depthWrite: false, roughness: 1 })),
  );
  const air = new THREE.Mesh(keep(new THREE.SphereGeometry(EARTH_R * 1.04, 96, 64)), atmosphere(keep));
  earth.add(ground, cloudLayer, air);
  const moon = new THREE.Mesh(
    keep(new THREE.SphereGeometry(4.2, 40, 28)),
    std(keep, 0xd8d4cc, 0.95, 0, {
      map: keep(
        canvasTex(256, 128, (g) => {
          g.fillStyle = "#cfcac0";
          g.fillRect(0, 0, 256, 128);
          const rr = seeded(77);
          for (let i = 0; i < 70; i++) {
            g.fillStyle = `rgba(120,116,108,${0.15 + rr() * 0.3})`;
            g.beginPath();
            g.arc(rr() * 256, rr() * 128, 2 + rr() * 12, 0, Math.PI * 2);
            g.fill();
          }
        }),
      ),
      emissive: 0x303030,
      emissiveIntensity: 0.4,
    }),
  );
  moon.position.set(0.6, PORT_Y - 1.2, -175);
  root.add(moon);

  // Dehors, à gauche : la poutre et ses panneaux solaires, leurs feux, et un satellite qui dérive
  const solar = std(keep, 0xffffff, 0.35, 0.3, { map: keep(solarArt()), side: THREE.DoubleSide });
  const truss = std(keep, 0x9aa2ae, 0.5, 0.6);
  root.add(block(0.8, 0.8, 90, truss, -17, 2.6, -25, keep));
  for (let k = 0; k < 6; k++) {
    const z = 4 - k * 13;
    for (const dy of [-1, 1]) {
      const p = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.2, 11)), solar);
      p.position.set(-17, 3 + dy * 6.4, z);
      p.rotation.y = Math.PI / 2 - 0.35;
      p.rotation.x = 0;
      root.add(p);
      root.add(block(0.1, 1.6, 0.1, truss, -17, dy > 0 ? 3.4 : 1.4, z, keep));
    }
  }
  const blinkMats = [
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 0.3) })),
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 0.5) })),
  ];
  const blinkGeo = keep(new THREE.SphereGeometry(0.12, 10, 8));
  const blinkers = new THREE.Group();
  blinkers.userData.live = true;
  for (let k = 0; k < 8; k++) {
    const b = new THREE.Mesh(blinkGeo, blinkMats[k % 2]!);
    b.position.set(-16.5, 3.5, 6 - k * 10);
    blinkers.add(b);
  }
  root.add(blinkers);
  const sat = new THREE.Group();
  sat.userData.live = true;
  const foil = phys(keep, { color: 0xd8a83a, metalness: 0.9, roughness: 0.35 });
  sat.add(block(0.8, 0.8, 1.1, foil, 0, -0.4, 0, keep));
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.2, 0.8)), solar);
    w.position.set(s * 1.55, 0, 0);
    sat.add(w);
  }
  const dish = new THREE.Mesh(keep(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3)), metal);
  dish.position.set(0, 0.5, 0);
  sat.add(dish);
  root.add(sat);

  // Le sol : des dalles claires autour de la piste, des bandes de lumière bleue le long des murs
  const floorTex = keep(panels(4, "#dfe4ea"));
  const floorMat = phys(keep, { color: 0xffffff, map: floorTex, roughness: 0.3, clearcoat: 0.4 });
  const floorPiece = (x0: number, x1: number, z0: number, z1: number, y = -0.002) => {
    const g = keep(new THREE.PlaneGeometry(x1 - x0, z1 - z0));
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 1.6, (z0 + uv.getY(i) * (z1 - z0)) / 1.6);
    const m = new THREE.Mesh(g, floorMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    root.add(m);
  };
  floorPiece(-HALL, -INNER, -END_Z, APPROACH);
  floorPiece(INNER, HALL, -END_Z, APPROACH);
  floorPiece(-HALL, HALL, APPROACH, BACK);
  floorPiece(-INNER, INNER, -HOUSE_Z1, 0, UNDER);
  for (const side of [-1, 1]) root.add(block(0.05, 0.012, END_Z + BACK, cyan, side * (HALL - 0.25), 0, (BACK - END_Z) / 2, keep));

  // Les murs : des panneaux blancs, de grandes baies, des montants, des mains courantes
  const wallTex = keep(panels(8));
  wallTex.repeat.set((END_Z + BACK) / 1.6, 1);
  const wallMat = std(keep, 0xffffff, 0.4, 0, { map: wallTex });
  const glass = phys(keep, { color: 0xcfe4ff, roughness: 0.05, transparent: true, opacity: 0.08, depthWrite: false });
  const len = END_Z + BACK;
  const zc = (BACK - END_Z) / 2;
  for (const side of [-1, 1]) {
    const x = side * (HALL + 0.1);
    const from = side < 0 ? WIN_FROM.left : WIN_FROM.right;
    root.add(block(0.2, WIN_LOW, len, wallMat, x, 0, zc, keep));
    root.add(block(0.2, CEIL - WIN_HIGH, len, wallMat, x, WIN_HIGH, zc, keep));
    // Le mur plein, de l'arrière jusqu'aux baies
    root.add(block(0.2, WIN_HIGH - WIN_LOW, BACK - from, wallMat, x, WIN_LOW, (BACK + from) / 2, keep));
    root.add(block(0.2, WIN_HIGH - WIN_LOW, END_Z + WIN_TO, wallMat, x, WIN_LOW, (WIN_TO - END_Z) / 2, keep));
    for (let z = from; z >= WIN_TO - 0.01; z -= (from - WIN_TO) / Math.round((from - WIN_TO) / 2.3)) {
      root.add(block(0.16, WIN_HIGH - WIN_LOW, 0.14, metal, x - side * 0.04, WIN_LOW, z, keep));
    }
    for (const y of [WIN_LOW, WIN_HIGH])
      root.add(block(0.26, 0.06, from - WIN_TO, metal, x - side * 0.03, y - 0.03, (from + WIN_TO) / 2, keep));
    const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(from - WIN_TO, WIN_HIGH - WIN_LOW)), glass);
    pane.position.set(x, (WIN_LOW + WIN_HIGH) / 2, (from + WIN_TO) / 2);
    pane.rotation.y = Math.PI / 2;
    root.add(pane);
    // Les mains courantes jaunes sous les baies
    const hr = new THREE.Mesh(
      keep(
        new THREE.TubeGeometry(
          new THREE.LineCurve3(new THREE.Vector3(x - side * 0.18, 0.4, BACK - 0.4), new THREE.Vector3(x - side * 0.18, 0.4, -END_Z + 0.4)),
          2,
          0.025,
          8,
        ),
      ),
      std(keep, 0xf2c12e, 0.4),
    );
    root.add(hr);
  }
  // Le plafond et ses deux bandeaux de lumière
  const ceilTex = keep(panels(12));
  ceilTex.repeat.set((2 * HALL) / 1.6, len / 1.6);
  root.add(block(2 * HALL + 0.4, 0.12, len, std(keep, 0xffffff, 0.5, 0, { map: ceilTex }), 0, CEIL, zc, keep));
  const stripMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.32, 1.5) }));
  for (const x of [-0.95, 0.95]) {
    const s = block(0.14, 0.03, len - 1, stripMat, x, CEIL - 0.03, zc, keep);
    s.userData.reflect = true;
    root.add(s);
  }

  // Au bout de la piste : la cloison, son cadre de lumière autour des quilles, et le hublot rond sur la Lune
  const wall = new THREE.Shape();
  wall.moveTo(-HALL - 0.2, CEIL_Y + 0.62);
  wall.lineTo(HALL + 0.2, CEIL_Y + 0.62);
  wall.lineTo(HALL + 0.2, CEIL);
  wall.lineTo(-HALL - 0.2, CEIL);
  wall.lineTo(-HALL - 0.2, CEIL_Y + 0.62);
  const port = new THREE.Path();
  port.absarc(0, PORT_Y, PORT_R, 0, Math.PI * 2, true);
  wall.holes.push(port);
  const endTex = keep(panels(15));
  endTex.repeat.set(1 / 1.6, 1 / 1.6);
  const endWall = new THREE.Mesh(
    keep(new THREE.ExtrudeGeometry(wall, { depth: 0.16, bevelEnabled: false, curveSegments: 48 })),
    std(keep, 0xffffff, 0.4, 0, { map: endTex }),
  );
  endWall.position.z = -END_Z - 0.16;
  root.add(endWall);
  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(PORT_R + 0.04, 0.08, 12, 64)), metal);
  ring.position.set(0, PORT_Y, -END_Z + 0.02);
  const glowRing = new THREE.Mesh(keep(new THREE.TorusGeometry(PORT_R + 0.17, 0.022, 8, 64)), cyan);
  glowRing.position.set(0, PORT_Y, -END_Z + 0.03);
  glowRing.userData.reflect = true;
  root.add(ring, glowRing);
  for (const side of [-1, 1])
    root.add(
      block(HALL - INNER + 0.2, CEIL_Y + 0.62 - UNDER, 0.16, wallMat, (side * (HALL + INNER + 0.2)) / 2, UNDER, -END_Z - 0.08, keep),
    );
  // Le cadre lumineux autour de l'ouverture des quilles
  const fx = INNER + 0.06,
    fyTop = CEIL_Y + 0.68,
    rr = 0.12;
  const framePath = new THREE.CurvePath<THREE.Vector3>();
  const P = (x: number, y: number) => new THREE.Vector3(x, y, -END_Z + 0.05);
  framePath.add(new THREE.LineCurve3(P(-fx, 0.02), P(-fx, fyTop - rr)));
  framePath.add(new THREE.QuadraticBezierCurve3(P(-fx, fyTop - rr), P(-fx, fyTop), P(-fx + rr, fyTop)));
  framePath.add(new THREE.LineCurve3(P(-fx + rr, fyTop), P(fx - rr, fyTop)));
  framePath.add(new THREE.QuadraticBezierCurve3(P(fx - rr, fyTop), P(fx, fyTop), P(fx, fyTop - rr)));
  framePath.add(new THREE.LineCurve3(P(fx, fyTop - rr), P(fx, 0.02)));
  const frame = new THREE.Mesh(keep(new THREE.TubeGeometry(framePath, 80, 0.03, 8)), cyan);
  frame.userData.reflect = true;
  root.add(frame);
  // Des bandes jaunes et noires au pied de la cloison
  const hazard = keep(
    canvasTex(
      128,
      16,
      (g) => {
        g.fillStyle = "#f2c12e";
        g.fillRect(0, 0, 128, 16);
        g.fillStyle = "#1a1a1a";
        for (let x = -16; x < 128; x += 32) {
          g.beginPath();
          g.moveTo(x, 16);
          g.lineTo(x + 16, 16);
          g.lineTo(x + 32, 0);
          g.lineTo(x + 16, 0);
          g.fill();
        }
      },
      true,
    ),
  );
  hazard.repeat.set((HALL - INNER) / 0.6, 1);
  for (const side of [-1, 1])
    root.add(
      block(
        HALL - INNER - 0.1,
        0.16,
        0.02,
        std(keep, 0xffffff, 0.5, 0, { map: hazard }),
        (side * (HALL + INNER)) / 2,
        0,
        -END_Z + 0.01,
        keep,
      ),
    );
  // Derrière, la baraque de la machine, basse pour laisser voir le hublot
  for (const side of [-1, 1])
    root.add(block(0.1, 1.65 - UNDER, HOUSE_Z1 - END_Z, grey, side * (INNER + 0.03), UNDER, -(END_Z + HOUSE_Z1) / 2, keep));
  root.add(block(2 * INNER + 0.16, 1.65 - UNDER, 0.1, grey, 0, UNDER, -HOUSE_Z1, keep));
  root.add(block(2 * INNER + 0.16, 0.08, HOUSE_Z1 - END_Z, grey, 0, 1.6, -(END_Z + HOUSE_Z1) / 2, keep));

  // Le mur du fond, derrière le banc : un sas rond rayé de jaune, des voyants
  const backTex = keep(panels(21));
  backTex.repeat.set((2 * HALL) / 1.6, CEIL / 1.6);
  root.add(block(2 * HALL + 0.4, CEIL, 0.2, std(keep, 0xffffff, 0.4, 0, { map: backTex }), 0, 0, BACK + 0.1, keep));
  const hatchTex = keep(
    canvasTex(
      256,
      16,
      (g) => {
        for (let k = 0; k < 16; k++) {
          g.fillStyle = k % 2 ? "#1a1a1a" : "#f2c12e";
          g.fillRect(k * 16, 0, 16, 16);
        }
      },
      true,
    ),
  );
  const hatchRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.95, 0.12, 12, 64)), std(keep, 0xffffff, 0.5, 0, { map: hatchTex }));
  hatchRing.position.set(0, 1.25, BACK - 0.02);
  const hatchDoor = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.88, 0.88, 0.08, 48)), grey);
  hatchDoor.rotation.x = Math.PI / 2;
  hatchDoor.position.set(0, 1.25, BACK - 0.02);
  const hatchWin = new THREE.Mesh(keep(new THREE.CircleGeometry(0.22, 32)), phys(keep, { color: 0x0a1428, roughness: 0.05, clearcoat: 1 }));
  hatchWin.position.set(0, 1.45, BACK - 0.07);
  hatchWin.rotation.y = Math.PI;
  root.add(hatchRing, hatchDoor, hatchWin);
  const lights = new THREE.Group();
  lights.userData.live = true;
  const ledGeo = keep(new THREE.BoxGeometry(0.06, 0.06, 0.02));
  const ledMats = [0x5ad8ff, 0x8af06a, 0xffd23a, 0xff5a7a].map((c) =>
    keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2) })),
  );
  const leds: THREE.Mesh[] = [];
  for (let k = 0; k < 18; k++) {
    const m = new THREE.Mesh(ledGeo, ledMats[k % 4]!);
    m.position.set(1.6 + (k % 6) * 0.12, 1.2 + Math.floor(k / 6) * 0.14, BACK - 0.01);
    lights.add(m);
    leds.push(m);
  }
  root.add(lights);
  root.add(block(0.9, 0.6, 0.02, std(keep, 0x101820, 0.4), 1.9, 1.1, BACK - 0.005, keep));

  // Le mur de plantes sous ses lampes roses, à gauche du banc
  const leaf = std(keep, 0x3a9a4a, 0.8);
  const leaf2 = std(keep, 0x6ac04a, 0.8);
  const leafGeo = keep(new THREE.IcosahedronGeometry(0.13, 1));
  const grow = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.6, 1.9) }));
  for (let row = 0; row < 3; row++) {
    const y = 0.7 + row * 0.75;
    root.add(block(0.4, 0.05, BACK - WIN_FROM.left - 0.6, white, -HALL + 0.2, y, (BACK + WIN_FROM.left) / 2, keep));
    const s = block(0.05, 0.02, BACK - WIN_FROM.left - 0.8, grow, -HALL + 0.25, y + 0.62, (BACK + WIN_FROM.left) / 2, keep);
    root.add(s);
    for (let z = WIN_FROM.left + 0.5; z < BACK - 0.4; z += 0.32) {
      const l = new THREE.Mesh(leafGeo, r() < 0.5 ? leaf : leaf2);
      l.position.set(-HALL + 0.2 + (r() - 0.5) * 0.15, y + 0.16 + r() * 0.08, z);
      l.scale.setScalar(0.8 + r() * 0.6);
      root.add(l);
    }
  }

  // Le globe en hologramme, près du banc
  const holo = new THREE.Group();
  holo.position.set(2.0, 0, 6.0);
  holo.userData.live = true;
  holo.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 24)), white));
  const lens = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24)), cyan);
  lens.position.y = 0.91;
  holo.add(lens);
  const beam = new THREE.Mesh(
    keep(new THREE.ConeGeometry(0.34, 0.5, 24, 1, true)),
    keep(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.2, 0.6, 0.8),
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ),
  );
  beam.position.y = 1.17;
  beam.rotation.x = Math.PI;
  const globe = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.28, 20, 14)),
    keep(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.22, 0.75, 1.05),
        wireframe: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  globe.position.y = 1.7;
  holo.add(beam, globe);
  root.add(holo);

  // Le banc, le retour de boules
  const bench = arcBench(root, keep, std(keep, 0x2a5a9a, 0.6), 7.0, 1.5, cyan);
  ballReturn(root, keep, -(GUTTER_OUTER + 0.42), white, metal, 6);

  // La lumière : le soleil qui entre par la gauche et éclaire la Terre, le bleu de la Terre par la droite, le plafond
  const sun = new THREE.DirectionalLight(0xfff6ea, 2.4);
  sun.position.set(-14, 9, 8);
  sun.target.position.set(0, 0, -2);
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
  const earthshine = new THREE.DirectionalLight(0x6aa0ff, 0.7);
  earthshine.position.set(10, -3, -6);
  root.add(earthshine);
  const ceilingGlow = new THREE.PointLight(0xe8f2ff, 2.6, 14, 1.3);
  ceilingGlow.position.set(0, CEIL - 0.3, 2);
  root.add(ceilingGlow);
  const ceilingGlow2 = new THREE.PointLight(0xe8f2ff, 2, 14, 1.3);
  ceilingGlow2.position.set(0, CEIL - 0.3, -9);
  root.add(ceilingGlow2);

  mergeStatic(root, keep);

  return {
    style,
    neighbors: 0,
    root,
    background: new THREE.Color(0x02030a),
    fog: null,
    hemi: [0xdfe8ff, 0x5a6a80, 0.5],
    env: 0.75,
    exposure: 0.95,
    bloom: [0.3, 0.4, 0.9],
    grade: { warm: -0.03, sat: 1.08, vignette: 0.3 },
    bench,
    update: (t) => {
      // La Terre tourne, ses nuages un peu plus vite
      ground.rotation.y = t * 0.004;
      cloudLayer.rotation.y = t * 0.006;
      // Le satellite dérive en tournant sur lui-même
      sat.position.set(-24 + Math.sin(t * 0.07) * 4, 7 + Math.sin(t * 0.11) * 2, -22 + Math.sin(t * 0.05) * 18);
      sat.rotation.set(t * 0.13, t * 0.2, 0.3);
      // Les feux de la poutre clignotent, les voyants changent
      blinkers.visible = Math.floor(t * 1.3) % 2 === 0;
      leds.forEach((m, i) => (m.visible = Math.sin(t * (1.5 + (i % 5) * 0.7) + i * 2) > -0.3));
      globe.rotation.y = t * 0.6;
    },
    dispose,
  };
}
