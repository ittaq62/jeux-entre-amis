// Des pièces de décor communes à plusieurs salles : le parquet, les murs, les tableaux, les fauteuils de cuir capitonnés,
// le râtelier à queues, le tableau des scores à boules, un tapis d'Orient, le feu de cheminée. Tout se dessine à la volée.

import * as THREE from "three";
import { fbm, seeded, valueNoise } from "../textures.ts";
import { block, canvasTex, glow, phys, roundBlock, std, type Keep } from "./common.ts";

/** Le sol de la salle, à cette hauteur (sous la table) */
export const FLOOR = -0.79;

/** Un parquet à bâtons rompus (ou à lames droites), verni */
export function parquet(keep: Keep, w: number, d: number, tone: [string, string], herring = true, repeat = 4): THREE.Mesh {
  const t = keep(
    canvasTex(
      1024,
      1024,
      (g) => {
        const rnd = seeded(7);
        const n = valueNoise(3, 32);
        const pw = herring ? 64 : 1024,
          ph = herring ? 256 : 96;
        const [a, b] = tone;
        const col = (k: number) => {
          const ca = new THREE.Color(a),
            cb = new THREE.Color(b);
          return `#${ca.lerp(cb, k).getHexString()}`;
        };
        if (herring) {
          for (let row = -1; row < 6; row++) {
            for (let i = 0; i < 18; i++) {
              for (const dir of [1, -1]) {
                g.save();
                const x = i * 64 + (dir > 0 ? 0 : 32),
                  y = row * 192 + (dir > 0 ? 0 : 96);
                g.translate(x, y);
                g.rotate((dir * Math.PI) / 4);
                g.fillStyle = col(rnd());
                g.fillRect(0, 0, pw * 0.7, ph * 0.7);
                g.strokeStyle = "rgba(0,0,0,0.35)";
                g.lineWidth = 2;
                g.strokeRect(0, 0, pw * 0.7, ph * 0.7);
                g.restore();
              }
            }
          }
        } else {
          for (let y = 0; y < 1024; y += ph) {
            let x = -rnd() * 400;
            while (x < 1024) {
              const len = 280 + rnd() * 380;
              g.fillStyle = col(rnd());
              g.fillRect(x, y, len, ph);
              g.strokeStyle = "rgba(0,0,0,0.4)";
              g.lineWidth = 2;
              g.strokeRect(x, y, len, ph);
              x += len;
            }
          }
        }
        // Les veines
        const img = g.getImageData(0, 0, 1024, 1024);
        for (let y = 0; y < 1024; y++)
          for (let x = 0; x < 1024; x++) {
            const k = 0.88 + fbm(n, x / 18, y / 90, 3) * 0.22;
            const i = (y * 1024 + x) * 4;
            img.data[i] = img.data[i]! * k;
            img.data[i + 1] = img.data[i + 1]! * k;
            img.data[i + 2] = img.data[i + 2]! * k;
          }
        g.putImageData(img, 0, 0);
      },
      true,
    ),
  );
  t.repeat.set(w / repeat, d / repeat);
  const m = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(w, d)),
    phys(keep, { map: t, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = FLOOR;
  m.receiveShadow = true;
  return m;
}

/** Un papier peint à motifs (damas) qui se répète */
export function damask(keep: Keep, base: string, ink: string, tile = 1): THREE.CanvasTexture {
  const t = keep(
    canvasTex(
      256,
      256,
      (g) => {
        g.fillStyle = base;
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = ink;
        g.strokeStyle = ink;
        const motif = (cx: number, cy: number, s: number) => {
          g.save();
          g.translate(cx, cy);
          g.scale(s, s);
          g.beginPath();
          g.moveTo(0, -60);
          g.bezierCurveTo(30, -40, 34, -10, 0, 0);
          g.bezierCurveTo(-34, -10, -30, -40, 0, -60);
          g.fill();
          g.beginPath();
          g.moveTo(0, 60);
          g.bezierCurveTo(30, 40, 34, 10, 0, 0);
          g.bezierCurveTo(-34, 10, -30, 40, 0, 60);
          g.fill();
          g.lineWidth = 5;
          for (const sx of [-1, 1]) {
            g.beginPath();
            g.moveTo(0, 0);
            g.bezierCurveTo(sx * 30, -20, sx * 55, 10, sx * 40, 35);
            g.stroke();
            g.beginPath();
            g.arc(sx * 40, 35, 7, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
        };
        motif(128, 128, 1);
        for (const [x, y] of [
          [0, 0],
          [256, 0],
          [0, 256],
          [256, 256],
        ] as [number, number][])
          motif(x, y, 1);
      },
      true,
    ),
  );
  t.repeat.set(tile, tile);
  return t;
}

/** Un tableau : un paysage peint à grands traits (le ciel, des collines, des arbres), dans un cadre doré */
export function painting(keep: Keep, w: number, h: number, seed: number, palette: [string, string, string, string]): THREE.Group {
  const grp = new THREE.Group();
  const t = keep(
    canvasTex(256, Math.round((256 * h) / w), (g) => {
      const W = 256,
        H = Math.round((256 * h) / w);
      const rnd = seeded(seed);
      const [sky, hill, tree, light] = palette;
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, sky);
      grd.addColorStop(0.6, light);
      grd.addColorStop(1, hill);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      for (let k = 0; k < 3; k++) {
        g.fillStyle = new THREE.Color(hill).multiplyScalar(0.7 + k * 0.15).getStyle();
        g.beginPath();
        g.moveTo(0, H);
        const base = H * (0.55 + k * 0.12);
        for (let x = 0; x <= W; x += 8) g.lineTo(x, base - Math.sin(x / 40 + seed + k) * 14 - rnd() * 4);
        g.lineTo(W, H);
        g.fill();
      }
      for (let k = 0; k < 9; k++) {
        const x = rnd() * W,
          y = H * (0.6 + rnd() * 0.3),
          r = 6 + rnd() * 14;
        g.fillStyle = tree;
        g.beginPath();
        g.ellipse(x, y - r, r * 0.7, r, 0, 0, Math.PI * 2);
        g.fill();
      }
      // Le vernis jauni et les coups de pinceau
      g.fillStyle = "rgba(120,80,20,0.12)";
      g.fillRect(0, 0, W, H);
    }),
  );
  const canvasMat = std(keep, "#ffffff", 0.6, 0, { map: t });
  const pic = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), canvasMat);
  pic.position.z = 0.03;
  grp.add(pic);
  const gold = std(keep, "#b8913c", 0.35, 1);
  const f = 0.07;
  grp.add(roundBlock(w + 2 * f, f, 0.05, 0.015, gold, 0, h / 2, 0, keep));
  grp.add(roundBlock(w + 2 * f, f, 0.05, 0.015, gold, 0, -h / 2 - f, 0, keep));
  grp.add(roundBlock(f, h, 0.05, 0.015, gold, -w / 2 - f / 2, -h / 2, 0, keep));
  grp.add(roundBlock(f, h, 0.05, 0.015, gold, w / 2 + f / 2, -h / 2, 0, keep));
  // La petite lampe de tableau, au-dessus
  grp.add(roundBlock(w * 0.5, 0.03, 0.05, 0.012, gold, 0, h / 2 + f + 0.06, 0.08, keep));
  const lit = new THREE.Mesh(keep(new THREE.PlaneGeometry(w * 0.45, 0.012)), glow(keep, "#ffd9a0", 2.5));
  lit.position.set(0, h / 2 + f + 0.06, 0.106);
  lit.rotation.x = Math.PI / 2;
  grp.add(lit);
  return grp;
}

/** Un fauteuil de cuir capitonné (assise, dossier enveloppant, accoudoirs roulés, boutons), tourné de `yaw` */
export function armchair(keep: Keep, leather: THREE.Material, x: number, z: number, yaw: number, tufts = true): THREE.Group {
  const g = new THREE.Group();
  const y0 = FLOOR + 0.1;
  g.add(roundBlock(0.82, 0.32, 0.78, 0.08, leather, 0, y0, 0, keep));
  g.add(roundBlock(0.82, 0.55, 0.22, 0.09, leather, 0, y0 + 0.28, -0.3, keep));
  for (const sx of [-1, 1]) {
    g.add(roundBlock(0.18, 0.42, 0.78, 0.08, leather, sx * 0.36, y0 + 0.22, 0, keep));
    // Le rouleau de l'accoudoir
    const roll = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 16)), leather);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(sx * 0.37, y0 + 0.64, 0);
    g.add(roll);
  }
  g.add(roundBlock(0.6, 0.1, 0.55, 0.05, leather, 0, y0 + 0.32, 0.05, keep));
  if (tufts) {
    const btn = keep(new THREE.SphereGeometry(0.012, 6, 4));
    const dark = std(keep, "#1a0c08", 0.5);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) {
        const b = new THREE.Mesh(btn, dark);
        b.position.set(-0.27 + i * 0.18, y0 + 0.42 + j * 0.14, -0.19);
        g.add(b);
      }
  }
  // Les pieds de bois tourné
  const foot = std(keep, "#2a160c", 0.4);
  for (const [fx, fz] of [
    [-0.33, -0.3],
    [0.33, -0.3],
    [-0.33, 0.3],
    [0.33, 0.3],
  ])
    g.add(block(0.05, 0.1, 0.05, foot, fx!, FLOOR, fz!, keep));
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

/** Le râtelier mural et ses queues (les queues de la maison, des bois variés) */
export function cueRack(keep: Keep, wood: THREE.Material, x: number, z: number, yaw: number, n = 8): THREE.Group {
  const g = new THREE.Group();
  g.add(roundBlock(0.1 * n + 0.2, 0.08, 0.1, 0.02, wood, 0, FLOOR + 0.25, 0.05, keep));
  g.add(roundBlock(0.1 * n + 0.2, 0.06, 0.08, 0.02, wood, 0, FLOOR + 1.35, 0.04, keep));
  const cueWoods = ["#d8b884", "#5a3a22", "#2a1a12", "#9a6a3a", "#c89a5a", "#3a2416", "#b07848", "#1a1a1c"];
  const geo = keep(new THREE.CylinderGeometry(0.0065, 0.014, 1.45, 10));
  for (let k = 0; k < n; k++) {
    const c = new THREE.Mesh(geo, std(keep, cueWoods[k % cueWoods.length]!, 0.35, 0));
    c.position.set(-0.05 * n + 0.1 * k + 0.05, FLOOR + 0.2 + 0.72, 0.08);
    c.rotation.z = 0.02 * ((k % 3) - 1);
    g.add(c);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

/** Le boulier des scores au mur : une tringle et des boules de bois */
export function scoreBeads(keep: Keep, x: number, y: number, z: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  const wood = std(keep, "#3a2214", 0.5);
  g.add(roundBlock(1.4, 0.04, 0.05, 0.012, wood, 0, -0.02, 0, keep));
  const rod = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, 1.3, 6)), std(keep, "#b8913c", 0.3, 1));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, 0.06, 0.03);
  g.add(rod);
  const bead = keep(new THREE.SphereGeometry(0.022, 10, 8));
  bead.scale(1.4, 1, 1);
  const light = std(keep, "#e6d2a8", 0.4),
    dark = std(keep, "#2a1a10", 0.4);
  for (let k = 0; k < 20; k++) {
    const b = new THREE.Mesh(bead, k % 5 === 4 ? dark : light);
    b.position.set(-0.6 + k * 0.045 + (k > 11 ? 0.25 : 0), 0.06, 0.03);
    g.add(b);
  }
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return g;
}

/**
 * Un tapis d'Orient : un champ semé de petits motifs en losange, un médaillon central à lobes, des écoinçons, une
 * bordure à rinceaux entre deux galons ; la laine un peu usée.
 */
export function rug(keep: Keep, w: number, d: number, colors: [string, string, string]): THREE.Mesh {
  const [ground, border, motif] = colors;
  const W = 1024,
    H = Math.round((1024 * d) / w);
  const t = keep(
    canvasTex(W, H, (g) => {
      const mixC = (a: string, b: string, k: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
      const deep = mixC(ground, "#000000", 0.35);
      g.fillStyle = ground;
      g.fillRect(0, 0, W, H);
      const bw = Math.round(W * 0.075);
      // Le champ : un treillis de petits losanges
      g.save();
      g.beginPath();
      g.rect(bw + 14, bw + 14, W - 2 * bw - 28, H - 2 * bw - 28);
      g.clip();
      const step = 46;
      for (let y = 0; y < H + step; y += step)
        for (let x = 0; x < W + step; x += step) {
          const ox = (y / step) % 2 ? step / 2 : 0;
          g.fillStyle = mixC(ground, motif, 0.35);
          g.beginPath();
          g.moveTo(x + ox, y - 9);
          g.lineTo(x + ox + 7, y);
          g.lineTo(x + ox, y + 9);
          g.lineTo(x + ox - 7, y);
          g.fill();
          g.fillStyle = mixC(ground, border, 0.5);
          g.fillRect(x + ox - 1.5, y - 1.5, 3, 3);
        }
      g.restore();
      // Le médaillon : des lobes, de plus en plus petits
      const cx = W / 2,
        cy = H / 2;
      const lobes = (r: number, n: number, depth: number, fill: string) => {
        g.fillStyle = fill;
        g.beginPath();
        for (let k = 0; k <= 200; k++) {
          const a = (k / 200) * Math.PI * 2;
          const rr = r * (1 + depth * Math.cos(a * n));
          g.lineTo(cx + Math.cos(a) * rr * 1.5, cy + Math.sin(a) * rr);
        }
        g.fill();
      };
      lobes(H * 0.26, 8, 0.12, deep);
      lobes(H * 0.23, 8, 0.12, border);
      lobes(H * 0.17, 16, 0.08, mixC(motif, ground, 0.2));
      lobes(H * 0.1, 8, 0.15, border);
      lobes(H * 0.05, 4, 0.2, ground);
      // Les écoinçons : des quarts de médaillon dans les coins du champ
      for (const [sx, sy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as [number, number][]) {
        const ex = sx ? W - bw - 14 : bw + 14,
          ey = sy ? H - bw - 14 : bw + 14;
        g.fillStyle = border;
        g.beginPath();
        g.ellipse(ex, ey, W * 0.12, H * 0.14, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = mixC(motif, ground, 0.2);
        g.beginPath();
        g.ellipse(ex, ey, W * 0.08, H * 0.09, 0, 0, Math.PI * 2);
        g.fill();
      }
      // La bordure : un galon, une bande à rinceaux, un galon
      g.fillStyle = deep;
      g.fillRect(0, 0, W, bw);
      g.fillRect(0, H - bw, W, bw);
      g.fillRect(0, 0, bw, H);
      g.fillRect(W - bw, 0, bw, H);
      g.strokeStyle = border;
      g.lineWidth = 6;
      g.strokeRect(8, 8, W - 16, H - 16);
      g.strokeRect(bw + 6, bw + 6, W - 2 * bw - 12, H - 2 * bw - 12);
      g.strokeStyle = mixC(motif, border, 0.3);
      g.lineWidth = 4;
      const vine = (x0: number, y0: number, x1: number, y1: number) => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const ux = (x1 - x0) / len,
          uy = (y1 - y0) / len;
        g.beginPath();
        for (let s = 0; s <= len; s += 4) {
          const off = Math.sin(s / 18) * bw * 0.22;
          g.lineTo(x0 + ux * s - uy * off, y0 + uy * s + ux * off);
        }
        g.stroke();
        g.fillStyle = border;
        for (let s = 18; s < len; s += 56) {
          g.beginPath();
          g.arc(x0 + ux * s, y0 + uy * s, 5, 0, Math.PI * 2);
          g.fill();
        }
      };
      const m = bw / 2 + 4;
      vine(m, m, W - m, m);
      vine(m, H - m, W - m, H - m);
      vine(m, m, m, H - m);
      vine(W - m, m, W - m, H - m);
      // La laine : un grain fin, un peu d'usure au milieu
      const n = valueNoise(8, 64);
      const img = g.getImageData(0, 0, W, H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const dx = (x - cx) / W,
            dy = (y - cy) / H;
          const wear = 1 - 0.12 * Math.exp(-(dx * dx + dy * dy) * 8);
          const k = (0.86 + fbm(n, x / 3, y / 3, 2) * 0.2) * wear;
          const i = (y * W + x) * 4;
          img.data[i] = img.data[i]! * k;
          img.data[i + 1] = img.data[i + 1]! * k;
          img.data[i + 2] = img.data[i + 2]! * k;
        }
      g.putImageData(img, 0, 0);
    }),
  );
  const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), std(keep, "#ffffff", 0.95, 0, { map: t }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = FLOOR + 0.004;
  m.receiveShadow = true;
  return m;
}

/** Un mur plat d'un point à l'autre (au sol), de cette hauteur, tourné vers l'intérieur de la pièce */
export function wall(keep: Keep, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, h: number, y = FLOOR): THREE.Mesh {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(len, h)), mat);
  m.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
  m.rotation.y = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

/** Le feu de cheminée : des bûches, des flammes qui dansent, une lueur qui vacille. `update` les fait vivre. */
export function fire(
  keep: Keep,
  x: number,
  z: number,
  yaw: number,
): { group: THREE.Group; light: THREE.PointLight; update: (t: number) => void } {
  const g = new THREE.Group();
  g.userData.live = true;
  const logMat = std(keep, "#3a2414", 0.9);
  const ember = glow(keep, "#ff5a1a", 1.6);
  for (let k = 0; k < 3; k++) {
    const log = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.055, 0.6, 10)), logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (k - 1) * 0.35;
    log.position.set(0, FLOOR + 0.12 + (k === 1 ? 0.08 : 0), (k - 1) * 0.06);
    g.add(log);
  }
  const bed = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.62, 0.22)), ember);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = FLOOR + 0.07;
  g.add(bed);
  const flameTex = keep(
    canvasTex(64, 128, (c) => {
      const grd = c.createRadialGradient(32, 110, 4, 32, 80, 60);
      grd.addColorStop(0, "rgba(255,250,200,1)");
      grd.addColorStop(0.3, "rgba(255,180,60,0.9)");
      grd.addColorStop(0.65, "rgba(240,80,20,0.5)");
      grd.addColorStop(1, "rgba(200,40,10,0)");
      c.fillStyle = grd;
      c.beginPath();
      c.moveTo(32, 0);
      c.quadraticCurveTo(64, 70, 54, 110);
      c.quadraticCurveTo(32, 128, 10, 110);
      c.quadraticCurveTo(0, 70, 32, 0);
      c.fill();
    }),
  );
  const flames: THREE.Mesh[] = [];
  const fmat = keep(
    new THREE.MeshBasicMaterial({
      map: flameTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(2, 1.6, 1.2),
    }),
  );
  const fgeo = keep(new THREE.PlaneGeometry(0.22, 0.42));
  fgeo.translate(0, 0.21, 0);
  for (let k = 0; k < 5; k++) {
    const f = new THREE.Mesh(fgeo, fmat);
    f.position.set(-0.22 + k * 0.11, FLOOR + 0.12, 0.02 * (k % 2));
    flames.push(f);
    g.add(f);
  }
  const light = new THREE.PointLight("#ff9a4a", 2.2, 6, 1.6);
  light.position.set(0, FLOOR + 0.45, 0.35);
  g.add(light);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return {
    group: g,
    light,
    update: (t: number) => {
      flames.forEach((f, k) => {
        const s = 0.75 + 0.3 * Math.sin(t * (7 + k) + k * 1.7) + 0.15 * Math.sin(t * 13.3 + k);
        f.scale.set(0.9 + 0.15 * Math.sin(t * 5 + k), s, 1);
      });
      light.intensity = 2 + 0.5 * Math.sin(t * 11) + 0.35 * Math.sin(t * 17.3 + 1);
    },
  };
}
