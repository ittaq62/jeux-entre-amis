// D'autres pièces de décor pour les salles : des murs de briques, un carrelage, du béton ciré, des planches, une fenêtre
// et ce qu'on voit au travers (la rue sous la pluie, la ville la nuit, la mer), des plantes (palmiers, plantes en pot,
// fougères), une guirlande de lampions, des tabourets, des étagères de bouteilles.

import * as THREE from "three";
import { fbm, seeded, valueNoise } from "../textures.ts";
import { block, canvasTex, glow, phys, roundBlock, std, type Keep } from "./common.ts";
import { FLOOR } from "./decor.ts";

/** Un mur de briques (une texture qui se répète : une brique fait 24 cm sur 7) */
export function brickTexture(keep: Keep, base: string, mortar: string, seed = 3): THREE.CanvasTexture {
  return keep(
    canvasTex(
      512,
      512,
      (g) => {
        g.fillStyle = mortar;
        g.fillRect(0, 0, 512, 512);
        const rnd = seeded(seed);
        const c = new THREE.Color(base);
        const n = valueNoise(seed + 2, 32);
        const bh = 512 / 14,
          bw = 512 / 4;
        for (let row = 0; row < 14; row++) {
          const off = row % 2 ? bw / 2 : 0;
          for (let k = -1; k < 5; k++) {
            const x = k * bw + off;
            const v = 0.75 + rnd() * 0.4;
            const col = c.clone().multiplyScalar(v);
            col.offsetHSL((rnd() - 0.5) * 0.03, 0, 0);
            g.fillStyle = col.getStyle();
            g.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
          }
        }
        const img = g.getImageData(0, 0, 512, 512);
        for (let y = 0; y < 512; y++)
          for (let x = 0; x < 512; x++) {
            const k = 0.82 + fbm(n, x / 12, y / 12, 3) * 0.3;
            const i = (y * 512 + x) * 4;
            img.data[i] = img.data[i]! * k;
            img.data[i + 1] = img.data[i + 1]! * k;
            img.data[i + 2] = img.data[i + 2]! * k;
          }
        g.putImageData(img, 0, 0);
      },
      true,
    ),
  );
}

/** Un carrelage (damier, ou carreaux de ciment) qui se répète */
export function tileTexture(keep: Keep, a: string, b: string, n = 8, pattern: "damier" | "ciment" = "damier"): THREE.CanvasTexture {
  return keep(
    canvasTex(
      512,
      512,
      (g) => {
        const s = 512 / n;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            g.fillStyle = pattern === "damier" ? ((i + j) % 2 ? a : b) : a;
            g.fillRect(i * s, j * s, s, s);
            if (pattern === "ciment") {
              g.fillStyle = b;
              g.beginPath();
              g.arc(i * s + s / 2, j * s + s / 2, s * 0.32, 0, Math.PI * 2);
              g.fill();
              g.fillStyle = a;
              g.beginPath();
              g.arc(i * s + s / 2, j * s + s / 2, s * 0.18, 0, Math.PI * 2);
              g.fill();
              g.fillStyle = b;
              for (const [cx, cy] of [
                [0, 0],
                [s, 0],
                [0, s],
                [s, s],
              ] as [number, number][]) {
                g.beginPath();
                g.arc(i * s + cx, j * s + cy, s * 0.22, 0, Math.PI * 2);
                g.fill();
              }
            }
            g.strokeStyle = "rgba(0,0,0,0.35)";
            g.lineWidth = 2;
            g.strokeRect(i * s, j * s, s, s);
          }
        // Un peu d'usure
        const nn = valueNoise(17, 32);
        const img = g.getImageData(0, 0, 512, 512);
        for (let y = 0; y < 512; y++)
          for (let x = 0; x < 512; x++) {
            const k = 0.9 + fbm(nn, x / 30, y / 30, 3) * 0.16;
            const i = (y * 512 + x) * 4;
            img.data[i] = img.data[i]! * k;
            img.data[i + 1] = img.data[i + 1]! * k;
            img.data[i + 2] = img.data[i + 2]! * k;
          }
        g.putImageData(img, 0, 0);
      },
      true,
    ),
  );
}

/** Un sol plat avec cette texture répétée tous les `tile` mètres */
export function floorPlane(keep: Keep, w: number, d: number, map: THREE.Texture, tile: number, rough = 0.5, coat = 0.3): THREE.Mesh {
  const t = map.clone();
  keep(t);
  t.repeat.set(w / tile, d / tile);
  t.needsUpdate = true;
  const m = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(w, d)),
    phys(keep, { map: t, roughness: rough, clearcoat: coat, clearcoatRoughness: 0.3 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = FLOOR;
  m.receiveShadow = true;
  return m;
}

/** Du béton (mur ou sol), à peine taché */
export function concreteTexture(keep: Keep, base: string, seed = 5): THREE.CanvasTexture {
  return keep(
    canvasTex(
      512,
      512,
      (g) => {
        const c = new THREE.Color(base);
        const n = valueNoise(seed, 32),
          m = valueNoise(seed + 9, 64);
        const img = g.createImageData(512, 512);
        for (let y = 0; y < 512; y++)
          for (let x = 0; x < 512; x++) {
            const k = 0.8 + fbm(n, x / 60, y / 60, 4) * 0.3 + (m(x / 3, y / 3) - 0.5) * 0.06;
            const i = (y * 512 + x) * 4;
            img.data[i] = c.r * 255 * k;
            img.data[i + 1] = c.g * 255 * k;
            img.data[i + 2] = c.b * 255 * k;
            img.data[i + 3] = 255;
          }
        g.putImageData(img, 0, 0);
      },
      true,
    ),
  );
}

/** Le cadre d'une fenêtre (montants et traverses) devant une vue ; `view` : la matière de ce qu'on voit au travers */
export function windowPane(
  keep: Keep,
  w: number,
  h: number,
  cols: number,
  rows: number,
  frame: THREE.Material,
  view: THREE.Material,
  x: number,
  y: number,
  z: number,
  yaw: number,
): THREE.Group {
  const g = new THREE.Group();
  const v = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), view);
  v.position.z = -0.03;
  v.userData.live = true;
  g.add(v);
  const t = 0.05;
  for (let i = 0; i <= cols; i++) g.add(block(t, h + t, t, frame, -w / 2 + (i * w) / cols, -h / 2 - t / 2, 0, keep));
  for (let j = 0; j <= rows; j++) {
    const b = block(w + t, t, t, frame, 0, -h / 2 + (j * h) / rows - t / 2, 0, keep);
    g.add(b);
  }
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return g;
}

/** La ville la nuit : des immeubles en silhouette, des fenêtres allumées, des lumières au loin */
export function skylineTexture(keep: Keep, seed = 4, dusk = false): THREE.CanvasTexture {
  return keep(
    canvasTex(1024, 512, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, dusk ? "#1a2350" : "#060a18");
      grd.addColorStop(0.55, dusk ? "#5a3a6a" : "#141a34");
      grd.addColorStop(1, dusk ? "#e08a5a" : "#2a2440");
      g.fillStyle = grd;
      g.fillRect(0, 0, 1024, 512);
      const rnd = seeded(seed);
      // Des étoiles
      g.fillStyle = "rgba(255,255,255,0.7)";
      for (let k = 0; k < 80; k++) g.fillRect(rnd() * 1024, rnd() * 200, 1.5, 1.5);
      for (let layer = 0; layer < 3; layer++) {
        const base = 300 + layer * 70;
        let x = -20;
        while (x < 1044) {
          const bw = 30 + rnd() * 70,
            bh = 60 + rnd() * (220 - layer * 50);
          const shade = 14 + layer * 8;
          g.fillStyle = `rgb(${shade},${shade + 2},${shade + 10})`;
          g.fillRect(x, base - bh, bw, bh + 300);
          // Les fenêtres allumées
          for (let wy = base - bh + 8; wy < 512; wy += 10)
            for (let wx = x + 5; wx < x + bw - 5; wx += 8) {
              if (rnd() < 0.32) {
                g.fillStyle =
                  rnd() < 0.8 ? `rgba(255,${200 + rnd() * 40},${120 + rnd() * 60},${0.5 + rnd() * 0.5})` : "rgba(170,210,255,0.8)";
                g.fillRect(wx, wy, 4, 5);
              }
            }
          x += bw + 2;
        }
      }
    }),
  );
}

/** La rue sous la pluie vue par la vitrine : des façades, des réverbères, des reflets sur le pavé mouillé */
export function streetTexture(keep: Keep): THREE.CanvasTexture {
  return keep(
    canvasTex(1024, 512, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, "#0b0e1a");
      grd.addColorStop(0.6, "#1a1c2a");
      grd.addColorStop(1, "#101218");
      g.fillStyle = grd;
      g.fillRect(0, 0, 1024, 512);
      const rnd = seeded(9);
      // Les façades d'en face
      for (let k = 0; k < 7; k++) {
        const x = k * 150 - 20;
        g.fillStyle = `rgb(${24 + k * 3},${22 + k * 2},${30 + k * 2})`;
        g.fillRect(x, 40, 146, 300);
        for (let wy = 70; wy < 300; wy += 60)
          for (let wx = x + 20; wx < x + 130; wx += 45) {
            g.fillStyle = rnd() < 0.5 ? "rgba(255,190,110,0.85)" : "rgba(40,40,60,0.9)";
            g.fillRect(wx, wy, 24, 34);
          }
      }
      // Les réverbères et leur halo
      for (const x of [180, 560, 900]) {
        const h = g.createRadialGradient(x, 200, 2, x, 200, 120);
        h.addColorStop(0, "rgba(255,210,140,0.9)");
        h.addColorStop(1, "rgba(255,210,140,0)");
        g.fillStyle = h;
        g.fillRect(x - 120, 80, 240, 240);
        g.fillStyle = "#0a0a0e";
        g.fillRect(x - 3, 200, 6, 200);
      }
      // Le pavé mouillé : les lumières s'y étirent
      g.fillStyle = "#0c0d12";
      g.fillRect(0, 380, 1024, 132);
      for (const x of [180, 560, 900]) {
        const r = g.createLinearGradient(0, 380, 0, 512);
        r.addColorStop(0, "rgba(255,200,130,0.5)");
        r.addColorStop(1, "rgba(255,200,130,0)");
        g.fillStyle = r;
        g.fillRect(x - 14, 380, 28, 132);
      }
    }),
  );
}

/** Des gouttes qui glissent sur une vitre : une texture transparente qu'on fait défiler */
export function rainTexture(keep: Keep): THREE.CanvasTexture {
  const t = keep(
    canvasTex(
      256,
      512,
      (g) => {
        g.clearRect(0, 0, 256, 512);
        const rnd = seeded(21);
        for (let k = 0; k < 140; k++) {
          const x = rnd() * 256,
            y = rnd() * 512,
            l = 8 + rnd() * 40;
          g.strokeStyle = `rgba(200,220,255,${0.15 + rnd() * 0.3})`;
          g.lineWidth = 1 + rnd();
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 1, y + l);
          g.stroke();
        }
        for (let k = 0; k < 60; k++) {
          g.fillStyle = `rgba(210,230,255,${0.25 + rnd() * 0.3})`;
          g.beginPath();
          g.arc(rnd() * 256, rnd() * 512, 1 + rnd() * 2.5, 0, Math.PI * 2);
          g.fill();
        }
      },
      true,
    ),
  );
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Un palmier : un tronc annelé qui se courbe, une couronne de palmes */
export function palm(
  keep: Keep,
  x: number,
  z: number,
  h: number,
  seed: number,
  trunkMat: THREE.Material,
  leafMat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const rnd = seeded(seed);
  const lean = (rnd() - 0.5) * 0.5;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    pts.push(new THREE.Vector3(Math.sin(u * 1.4) * lean * h * 0.3, FLOOR + u * h, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 16, 0.08, 8)), trunkMat));
  const top = pts[pts.length - 1]!;
  const leafGeo = keep(new THREE.PlaneGeometry(0.35, 1.5, 1, 6));
  {
    // La palme retombe
    const p = leafGeo.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 0.75;
      p.setZ(i, -y * y * 0.35);
      p.setX(i, p.getX(i) * (1 - y / 1.6));
    }
    leafGeo.translate(0, 0.75, 0);
    leafGeo.computeVertexNormals();
  }
  for (let k = 0; k < 9; k++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.copy(top);
    leaf.rotation.set(-1.0 - rnd() * 0.4, (k / 9) * Math.PI * 2 + rnd() * 0.3, 0, "YXZ");
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  return g;
}

/** Une plante en pot : un pot de terre cuite, un feuillage en boules */
export function pottedPlant(
  keep: Keep,
  x: number,
  z: number,
  scale: number,
  potMat: THREE.Material,
  leafMat: THREE.Material,
  seed: number,
): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.22, 0.16, 0.42, 16)), potMat);
  pot.position.y = FLOOR + 0.21;
  g.add(pot);
  const rnd = seeded(seed);
  const blob = keep(new THREE.IcosahedronGeometry(0.2, 1));
  for (let k = 0; k < 9; k++) {
    const b = new THREE.Mesh(blob, leafMat);
    b.position.set((rnd() - 0.5) * 0.45, FLOOR + 0.6 + rnd() * 0.7, (rnd() - 0.5) * 0.45);
    b.scale.setScalar(0.8 + rnd() * 0.8);
    g.add(b);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

/** Une guirlande de lampions entre deux points : un fil qui pend, et des boules de couleur qui luisent */
export function lampions(a: THREE.Vector3, b: THREE.Vector3, sag: number, colors: number[], keep: Keep, n = 14): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0)));
  }
  g.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.005, 4)), std(keep, "#222222", 0.8)));
  const geo = keep(new THREE.SphereGeometry(0.07, 12, 8));
  const mats = colors.map((c) => glow(keep, c, 1.4));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u) - 0.08, 0));
    const m = new THREE.Mesh(geo, mats[i % mats.length]!);
    m.position.copy(p);
    m.scale.set(1, 1.25, 1);
    m.userData.reflect = true;
    g.add(m);
  }
  return g;
}

/** Un tabouret de bar (pied chromé, assise ronde) */
export function stool(keep: Keep, x: number, z: number, seatMat: THREE.Material, metal: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const leg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 10)), metal);
  leg.position.y = FLOOR + 0.36;
  g.add(leg);
  const foot = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20)), metal);
  foot.position.y = FLOOR + 0.015;
  g.add(foot);
  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.17, 0.012, 6, 24)), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = FLOOR + 0.3;
  g.add(ring);
  g.add(roundBlock(0.38, 0.09, 0.38, 0.04, seatMat, 0, FLOOR + 0.72, 0, keep));
  g.position.set(x, 0, z);
  return g;
}

/** Des étagères de bouteilles éclairées par derrière (le fond du bar) */
export function bottleShelves(keep: Keep, w: number, x: number, z: number, yaw: number, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const wood = std(keep, "#2a1a10", 0.5);
  const backlight = glow(keep, "#ffb86a", 0.9);
  g.add(block(w, 1.5, 0.02, backlight, 0, FLOOR + 1.0, -0.02, keep));
  const rnd = seeded(seed);
  const cols = ["#3a6a2a", "#7a3a1a", "#c8a040", "#2a3a6a", "#e8e0d0", "#5a1a2a", "#1a4a3a"];
  const glassMats = cols.map((c) => phys(keep, { color: c, roughness: 0.1, transparent: true, opacity: 0.8, clearcoat: 1 }));
  const bottle = keep(
    new THREE.LatheGeometry(
      [0.001, 0.035, 0.035, 0.034, 0.014, 0.012, 0.013].map((r, i) => new THREE.Vector2(r, [0, 0.01, 0.17, 0.2, 0.24, 0.29, 0.3][i]!)),
      10,
    ),
  );
  for (const y of [1.05, 1.5, 1.95]) {
    g.add(block(w, 0.03, 0.22, wood, 0, FLOOR + y - 0.03, 0.08, keep));
    for (let k = 0; k < Math.floor(w / 0.11); k++) {
      const b = new THREE.Mesh(bottle, glassMats[Math.floor(rnd() * glassMats.length)]!);
      b.position.set(-w / 2 + 0.07 + k * 0.11, FLOOR + y, 0.08);
      b.scale.setScalar(0.9 + rnd() * 0.3);
      g.add(b);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}
