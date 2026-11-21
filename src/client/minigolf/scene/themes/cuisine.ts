// La Cuisine géante : la balle, grosse comme un petit pois, roule sur un plan de travail immense, dans la lumière du
// matin qui entre par la fenêtre. La nappe à carreaux rouges, les planches à découper, le marbre veiné, l'inox de
// l'évier ; autour, le plan de travail de pierre sombre, la crédence de carreaux blancs, les placards vert d'eau, la
// fenêtre et ses rideaux, un grille-pain, une bouilloire, une théière grands comme des maisons, des bocaux, une
// corbeille de fruits, une miche de pain, un pot de basilic, des miettes.

import * as THREE from "three";
import { heightAt, type Course, type MoverDef } from "../../../../shared/games/minigolf/course.ts";
import { feltTex, sandTex, woodTex } from "../textures.ts";
import { feltMat, flowWater, leafyBall, onCourse, plainKit, Scatter, surfaceMat, waterMat, type Theme } from "./common.ts";

let made: Theme | null = null;

/** Une texture dessinée à la main, répétée */
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Un petit générateur pour les dessins (toujours le même) */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** La nappe à carreaux rouges et blancs : les bandes se croisent, plus foncées là où elles se superposent */
function ginghamTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#fbf6ee";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(200,36,42,0.52)";
    for (let i = 0; i < 4; i++) {
      g.fillRect((i * s) / 4, 0, s / 8, s);
      g.fillRect(0, (i * s) / 4, s, s / 8);
    }
    // Le tissage
    const rnd = noise(7);
    for (let y = 0; y < s; y += 2) {
      g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.03})`;
      g.fillRect(0, y, s, 1);
    }
    for (let x = 0; x < s; x += 2) {
      g.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.03})`;
      g.fillRect(x, 0, 1, s);
    }
  });
}

/** Le marbre blanc et ses veines grises qui ondulent */
function marbleTex(): THREE.CanvasTexture {
  return canvasTex(512, (g, s) => {
    g.fillStyle = "#f2efea";
    g.fillRect(0, 0, s, s);
    const rnd = noise(11);
    for (let k = 0; k < 7; k++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const grd = g.createRadialGradient(x, y, 0, x, y, s * 0.6);
      grd.addColorStop(0, "rgba(220,214,206,0.35)");
      grd.addColorStop(1, "rgba(220,214,206,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    }
    for (let k = 0; k < 16; k++) {
      g.strokeStyle = `rgba(${110 + k * 3},${112 + k * 3},${122 + k * 2},${0.12 + rnd() * 0.22})`;
      g.lineWidth = 0.6 + rnd() * 2.4;
      // Une veine en biais, coupée en morceaux là où elle repasse de l'autre côté (la texture se répète)
      const x0 = rnd() * s;
      const ph = rnd() * 6;
      let last = -1;
      g.beginPath();
      for (let y = -10; y <= s + 10; y += 6) {
        const x = x0 + y * 0.6 + Math.sin(y * 0.03 + ph) * 18 + Math.sin(y * 0.11 + ph) * 5;
        const xx = ((x % s) + s) % s;
        if (last < 0 || Math.abs(xx - last) > s / 2) g.moveTo(xx, y);
        else g.lineTo(xx, y);
        last = xx;
      }
      g.stroke();
    }
  });
}

/** L'inox brossé de l'évier : de fines rayures dans un seul sens */
function brushedTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#b9bfc6";
    g.fillRect(0, 0, s, s);
    const rnd = noise(5);
    for (let k = 0; k < 900; k++) {
      const v = 150 + Math.floor(rnd() * 90);
      g.fillStyle = `rgba(${v},${v + 3},${v + 8},0.35)`;
      g.fillRect(rnd() * s, rnd() * s, 20 + rnd() * 80, 1);
    }
  });
}

/** L'égouttoir de bambou : des lattes claires, leurs joints et leurs nœuds */
function slatsTex(): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    for (let k = 0; k < 4; k++) {
      const x = (k * s) / 4;
      const grd = g.createLinearGradient(x, 0, x + s / 4, 0);
      grd.addColorStop(0, "#c9a66a");
      grd.addColorStop(0.15, "#e9cf96");
      grd.addColorStop(0.85, "#e3c58a");
      grd.addColorStop(1, "#b48c50");
      g.fillStyle = grd;
      g.fillRect(x, 0, s / 4, s);
      g.fillStyle = "rgba(120,84,40,0.5)";
      g.fillRect(x + 2, ((k * 37) % s) + 4, s / 4 - 4, 3);
    }
  });
}

/** Le carrelage du plan de travail : de grands carreaux émaillés bleu-gris, chacun sa nuance, et des joints blancs */
function counterTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#e8e4dc";
    g.fillRect(0, 0, s, s);
    const rnd = noise(23);
    const n = 2;
    const w = s / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = rnd();
        const r = 118 + v * 22;
        const gg = 150 + v * 20;
        const b = 168 + v * 16;
        const grd = g.createLinearGradient(x * w, y * w, x * w + w, y * w + w);
        grd.addColorStop(0, `rgb(${r + 14},${gg + 14},${b + 12})`);
        grd.addColorStop(1, `rgb(${r - 6},${gg - 6},${b - 4})`);
        g.fillStyle = grd;
        g.fillRect(x * w + 3, y * w + 3, w - 6, w - 6);
        // L'émail : quelques taches plus claires
        for (let k = 0; k < 30; k++) {
          g.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`;
          g.beginPath();
          g.arc(x * w + 6 + rnd() * (w - 12), y * w + 6 + rnd() * (w - 12), 2 + rnd() * 10, 0, Math.PI * 2);
          g.fill();
        }
      }
  });
}

/** Les uv d'une forme plane en mètres divisés par `size` (une texture de `size` mètres de côté) */
function meterUV(geo: THREE.BufferGeometry, w: number, h: number, size: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / size, (uv.getY(i) * h) / size);
}

/** La crédence : des carreaux de métro blancs posés en quinconce, et leurs joints */
function metroTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#cfc8bd";
    g.fillRect(0, 0, s, s);
    for (let row = 0; row < 8; row++)
      for (let k = -1; k < 4; k++) {
        const x = k * 64 + (row % 2) * 32;
        const grd = g.createLinearGradient(0, row * 32, 0, row * 32 + 32);
        grd.addColorStop(0, "#ffffff");
        grd.addColorStop(1, "#ece9e2");
        g.fillStyle = grd;
        g.fillRect(x + 2, row * 32 + 2, 60, 28);
      }
  });
}

/** Ce qu'on voit par la fenêtre : un ciel clair, des arbres, une pelouse */
function windowTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    const sky = g.createLinearGradient(0, 0, 0, s);
    sky.addColorStop(0, "#9fd0f5");
    sky.addColorStop(0.7, "#fff1d6");
    sky.addColorStop(1, "#fff8ea");
    g.fillStyle = sky;
    g.fillRect(0, 0, s, s);
    const rnd = noise(3);
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(${90 + rnd() * 40},${150 + rnd() * 40},${80 + rnd() * 30},0.9)`;
      g.beginPath();
      g.arc(rnd() * s, s * (0.62 + rnd() * 0.2), 18 + rnd() * 34, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#6aa257";
    g.fillRect(0, s * 0.86, s, s * 0.14);
  });
}

/** Une porte de placard : un cadre, un panneau en relief */
function doorTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#86ad9f";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(40,70,60,0.35)";
    g.lineWidth = 6;
    g.strokeRect(10, 10, s - 20, s - 20);
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.lineWidth = 3;
    g.strokeRect(34, 34, s - 68, s - 68);
    g.strokeStyle = "rgba(40,70,60,0.25)";
    g.strokeRect(38, 38, s - 76, s - 76);
  });
}

/** Le carrelage du sol, tout en bas : des tomettes */
function floorTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#7d4a34";
    g.fillRect(0, 0, s, s);
    const rnd = noise(9);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const v = Math.floor(rnd() * 30);
        g.fillStyle = `rgb(${170 + v},${92 + v / 2},${62 + v / 3})`;
        g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
  });
}

/** Une étiquette de boîte de conserve (blanche : la couleur vient de chaque boîte) */
function labelTex(): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#f6f0e2";
    g.fillRect(0, s * 0.32, s, s * 0.36);
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, s * 0.3, s, 3);
    g.fillRect(0, s * 0.68, s, 3);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath();
    g.arc(s * 0.5, s * 0.5, s * 0.12, 0, Math.PI * 2);
    g.fill();
  });
}

/** Une boucle de fil de fouet, dans le plan (x, y) : du haut du manche jusqu'au sol, et retour */
function whiskLoop(w: number, top: number): THREE.CatmullRomCurve3 {
  const pts = [
    [0, top],
    [w * 0.45, top - 0.28],
    [w * 0.92, 0.32],
    [w, 0.12],
    [w * 0.7, 0.03],
    [0, 0.02],
    [-w * 0.7, 0.03],
    [-w, 0.12],
    [-w * 0.92, 0.32],
    [-w * 0.45, top - 0.28],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  return new THREE.CatmullRomCurve3(pts, true, "centripetal");
}

function shadows(o: THREE.Object3D, cast = true) {
  o.traverse((q) => {
    if (q instanceof THREE.Mesh) {
      q.castShadow = cast;
      q.receiveShadow = true;
    }
  });
}

export function cuisineTheme(): Theme {
  if (made) return made;
  // La nappe : du tissu à carreaux, sans bandes de tonte (les uv sont en mètres : un carreau fait 28 cm)
  const felt = feltMat(0xf2ece4, 0.5, 0.0);
  const gingham = ginghamTex();
  gingham.repeat.set(0.9, 0.9);
  felt.map = gingham;
  felt.normalScale.set(0.35, 0.35);
  const board = surfaceMat(woodTex(), { color: 0xf6d6ae, roughness: 0.72, scale: 1.8 });
  const marbleMap = marbleTex();
  marbleMap.repeat.set(0.3, 0.3);
  const marble = new THREE.MeshPhysicalMaterial({ map: marbleMap, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const brushed = brushedTex();
  brushed.repeat.set(0.6, 0.6);
  const steel = new THREE.MeshStandardMaterial({ color: 0xc2c9d1, map: brushed, roughness: 0.4, metalness: 0.75, envMapIntensity: 1.1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.14, metalness: 1, envMapIntensity: 1.3 });
  const slats = slatsTex();
  slats.repeat.set(3.1, 0.6);
  const bamboo = new THREE.MeshStandardMaterial({ map: slats, roughness: 0.6 });
  const flour = surfaceMat(sandTex(), { color: 0xfffefa, roughness: 1, scale: 0.4 });
  const doughMap = canvasTex(128, (g, s) => {
    g.fillStyle = "#f6e2b8";
    g.fillRect(0, 0, s, s);
    const rnd = noise(31);
    for (let k = 0; k < 60; k++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const grd = g.createRadialGradient(x, y, 0, x, y, 6 + rnd() * 16);
      grd.addColorStop(0, rnd() < 0.5 ? "rgba(255,255,255,0.35)" : "rgba(200,160,100,0.18)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    }
  });
  doughMap.repeat.set(0.8, 0.8);
  const dough = new THREE.MeshStandardMaterial({ map: doughMap, roughness: 0.62 });
  // Les pages des livres, sur leurs tranches
  const pagesMap = canvasTex(64, (g, s) => {
    g.fillStyle = "#efe6d2";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) {
      g.fillStyle = `rgba(150,130,100,${0.12 + (y % 6) * 0.03})`;
      g.fillRect(0, y, s, 1);
    }
  });
  pagesMap.repeat.set(1, 6);
  const pages = new THREE.MeshStandardMaterial({ map: pagesMap, roughness: 0.85 });
  const cloth = feltTex();
  const book = (color: number) => surfaceMat(cloth, { color, roughness: 0.8, scale: 0.6 });
  const books: Record<string, { top: THREE.Material; edge: THREE.Material }> = {
    "livre-rouge": { top: book(0xa8302c), edge: book(0x7a1f1d) },
    "livre-vert": { top: book(0x2f6a4a), edge: book(0x1f4a33) },
    "livre-bleu": { top: book(0x2c4f86), edge: book(0x1c3560) },
  };
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xeeeae2, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const water = waterMat(0x6fb0bf, 0.8);
  const cream = new THREE.MeshStandardMaterial({ color: 0xe6dac4, roughness: 0.7 });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const red = new THREE.MeshPhysicalMaterial({ color: 0xd62a24, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3e8a35, roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 0.45, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0b040, roughness: 0.28, metalness: 0.9 });
  const biscuit = new THREE.MeshStandardMaterial({ color: 0xd29a55, roughness: 0.92 });
  const choco = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.7 });
  const icing = new THREE.MeshStandardMaterial({ color: 0xfff6ea, roughness: 0.6 });
  const mint = new THREE.MeshPhysicalMaterial({ color: 0x9fd6c2, roughness: 0.35, clearcoat: 0.7 });
  const pinWood = surfaceMat(woodTex(), { color: 0xf5d7aa, roughness: 0.55, scale: 0.5 });

  const post = (look: string | undefined, r: number, h: number): THREE.Object3D => {
    const g = new THREE.Group();
    if (look === "tomate") {
      // Une tomate cerise brillante, sa collerette de sépales et sa queue
      const t = new THREE.Mesh(new THREE.SphereGeometry(r, 26, 18), red);
      t.scale.y = 0.88;
      t.position.y = r * 0.88;
      g.add(t);
      for (let k = 0; k < 5; k++) {
        const sepal = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.6, 4), leaf);
        const a = (k / 5) * Math.PI * 2;
        sepal.position.set(Math.cos(a) * r * 0.22, r * 1.72, Math.sin(a) * r * 0.22);
        sepal.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
        g.add(sepal);
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.07, r * 0.45, 6), leaf);
      stem.position.y = r * 1.95;
      g.add(stem);
    } else if (look === "biscuit") {
      // Deux biscuits dorés et leur crème au milieu, des pépites de chocolat sur le dessus
      const one = new THREE.CylinderGeometry(r, r * 0.97, h * 0.4, 28);
      const low = new THREE.Mesh(one, biscuit);
      low.position.y = h * 0.2;
      const mid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * 0.2, 28), icing);
      mid.position.y = h * 0.5;
      const up = new THREE.Mesh(one, biscuit);
      up.position.y = h * 0.8;
      g.add(low, mid, up);
      for (let k = 0; k < 7; k++) {
        const chip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 6, 4), choco);
        const a = k * 2.4;
        const d = k === 0 ? 0 : r * (0.35 + (k % 3) * 0.18);
        chip.position.set(Math.cos(a) * d, h + r * 0.02, Math.sin(a) * d);
        chip.scale.y = 0.6;
        g.add(chip);
      }
    } else {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), cream);
      m.position.y = h / 2;
      g.add(m);
    }
    shadows(g);
    return g;
  };

  const mover = (def: MoverDef): THREE.Object3D | null => {
    const g = new THREE.Group();
    if (def.look === "fouet") {
      // Un fouet plat : trois boucles de fil d'acier dans le plan de la barre qui tourne, et son manche
      for (const p of def.parts) {
        if (p.k === "post") {
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 10), chrome);
          shaft.position.set(p.c[0], 1.22, p.c[1]);
          g.add(shaft);
        } else if (p.k === "wall") {
          const cx = (p.a[0] + p.b[0]) / 2;
          const cz = (p.a[1] + p.b[1]) / 2;
          const half = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) / 2;
          const turn = Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);
          for (const w of [half, half * 0.7, half * 0.42]) {
            const wire = new THREE.Mesh(new THREE.TubeGeometry(whiskLoop(w, 1.0), 72, 0.011, 6, true), chrome);
            wire.position.set(cx, 0, cz);
            wire.rotation.y = -turn;
            g.add(wire);
          }
        }
      }
      shadows(g);
      return g;
    }
    if (def.look === "train") {
      // La locomotive rouge (sa chaudière, sa cabine, sa cheminée) et son wagon vert chargé de bonbons
      const walls = def.parts.filter((p) => p.k === "wall");
      walls.forEach((p, i) => {
        if (p.k !== "wall") return;
        const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
        const cx = (p.a[0] + p.b[0]) / 2;
        const cz = (p.a[1] + p.b[1]) / 2;
        const depth = p.t * 2;
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, depth), black);
        chassis.position.set(cx, 0.12, cz);
        g.add(chassis);
        const n = i === 0 ? 3 : 2;
        for (const s of [-1, 1])
          for (let k = 0; k < n; k++) {
            const x = cx + (k / (n - 1) - 0.5) * len * 0.7;
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.035, 18), i === 0 ? red : black);
            wheel.rotation.x = Math.PI / 2;
            wheel.position.set(x, 0.085, cz + s * (depth / 2 + 0.01));
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), gold);
            hub.rotation.x = Math.PI / 2;
            hub.position.copy(wheel.position);
            hub.position.z += s * 0.008;
            g.add(wheel, hub);
          }
        if (i === 0) {
          const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, len * 0.68, 22), red);
          boiler.rotation.z = Math.PI / 2;
          boiler.position.set(cx + len * 0.16, 0.3, cz);
          const front = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.03, 22), black);
          front.rotation.z = Math.PI / 2;
          front.position.set(cx + len * 0.5, 0.3, cz);
          const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 12, 8),
            new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd870, emissiveIntensity: 1.4 }),
          );
          lamp.position.set(cx + len * 0.51, 0.4, cz);
          const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.24, 14), black);
          chimney.position.set(cx + len * 0.36, 0.55, cz);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold);
          dome.position.set(cx + len * 0.08, 0.44, cz);
          const cab = new THREE.Mesh(new THREE.BoxGeometry(len * 0.3, 0.38, depth * 1.02), red);
          cab.position.set(cx - len * 0.35, 0.35, cz);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(len * 0.36, 0.04, depth * 1.2), black);
          roof.position.set(cx - len * 0.35, 0.56, cz);
          const win = new THREE.Mesh(
            new THREE.BoxGeometry(len * 0.16, 0.12, depth * 1.04),
            new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc860, emissiveIntensity: 0.5 }),
          );
          win.position.set(cx - len * 0.35, 0.44, cz);
          for (const k of [-0.1, 0.12, 0.34]) {
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.008, 6, 26), gold);
            band.rotation.y = Math.PI / 2;
            band.position.set(cx + len * k, 0.3, cz);
            g.add(band);
          }
          g.add(boiler, front, lamp, chimney, dome, cab, roof, win);
        } else {
          const tub = new THREE.Mesh(
            new THREE.BoxGeometry(len * 0.92, 0.2, depth),
            new THREE.MeshPhysicalMaterial({ color: 0x2f8a4a, roughness: 0.35, clearcoat: 0.6 }),
          );
          tub.position.set(cx, 0.25, cz);
          g.add(tub);
          const sweets = [0xff5a8a, 0xffd23a, 0x5ac8ff, 0xffffff, 0x9a6aff, 0xff8a2a];
          for (let k = 0; k < 16; k++) {
            const b = new THREE.Mesh(
              new THREE.SphereGeometry(0.045, 10, 8),
              new THREE.MeshPhysicalMaterial({ color: sweets[k % sweets.length]!, roughness: 0.25, clearcoat: 1 }),
            );
            b.position.set(cx + ((k % 8) / 7 - 0.5) * len * 0.75, 0.37 + (k >> 3) * 0.04, cz + ((k >> 3) - 0.5) * depth * 0.5);
            g.add(b);
          }
        }
      });
      shadows(g);
      return g;
    }
    if (def.look === "rouleau") {
      // Un rouleau à pâtisserie de bois clair, sans poignées, aux bouts arrondis : il tient pile entre les bordures
      for (const p of def.parts) {
        if (p.k !== "cap") continue;
        const a = new THREE.Vector3(...p.a);
        const b = new THREE.Vector3(...p.b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = Math.min(a.distanceTo(b), 1.9);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, len - p.r * 0.6, 32), pinWood);
        body.rotation.z = Math.PI / 2;
        body.position.copy(mid);
        g.add(body);
        for (const s of [-1, 1]) {
          const end = new THREE.Mesh(new THREE.SphereGeometry(p.r, 24, 12), pinWood);
          end.scale.x = 0.3;
          end.position.copy(mid).add(new THREE.Vector3((s * (len - p.r * 0.6)) / 2, 0, 0));
          g.add(end);
        }
      }
      shadows(g);
      return g;
    }
    return null;
  };

  const kit = plainKit({
    felt,
    ground: (mat, look) => {
      const bk = look ? books[look] : undefined;
      if (bk) return mat === "wood" ? bk.edge : bk.top;
      if (mat === "wood") return look === "egouttoir" ? bamboo : board;
      if (mat === "stone") return look === "assiette" ? porcelain : marble;
      if (mat === "metal") return steel;
      if (mat === "sand") return flour;
      if (mat === "dirt") return dough;
      return null;
    },
    side: cream,
    rail: (look) => {
      const bk = look ? books[look] : undefined;
      if (bk) return { material: bk.edge, extra: 0.02, widen: 0.01 };
      if (look === "inox") return { material: chrome, extra: 0.015, widen: 0.005 };
      if (look === "marbre") return { material: marble, extra: 0.02, widen: 0.01 };
      if (look === "planche-cuisine") return { material: board, extra: 0.03, widen: 0.015 };
      return { material: cream, extra: 0.03, widen: 0.015 };
    },
    // Les conserves et la corbeille sont dessinées par le décor : leur mur ne se voit pas
    wall: (look) => (look === "conserves" || look === "corbeille" ? hidden : cream),
    post,
    mover,
    water: () => water,
    flag: 0xd62a24,
  });

  // Les flancs de l'évier sont en inox, comme le reste
  const sideOf = kit.side;
  kit.side = (look) => (look === "inox" || look === "eau-evier" ? steel : look?.startsWith("livre") ? pages : sideOf(look));

  made = {
    sky: {
      top: 0xf2ede4,
      horizon: 0xf6e4c4,
      bottom: 0x5a5248,
      sun: [-0.62, 0.62, -0.22],
      sunColor: 0xfff0d6,
      sunIntensity: 2.5,
      hemiSky: 0xfff4e6,
      hemiGround: 0x8a7460,
      hemiIntensity: 0.85,
      clouds: 0,
      cloudColor: 0xffffff,
      fog: 0xefe2cc,
      fogNear: 30,
      fogFar: 110,
      exposure: 1.05,
      bloom: 2.4,
      grade: { warm: 0.05, sat: 1.1, vignette: 0.3 },
    },
    kit,
    ambience: "cuisine",
    tick: (t, decor) => {
      flowWater(water, t * 0.5);
      if (decor) cuisineLife(decor, t);
    },
    decor: (c, rng) => cuisineDecor(c, rng, { steel, chrome, cream, red, leaf, black, gold, board, porcelain, mint }),
  };
  return made;
}

interface Mats {
  steel: THREE.Material;
  chrome: THREE.Material;
  cream: THREE.Material;
  red: THREE.Material;
  leaf: THREE.Material;
  black: THREE.Material;
  gold: THREE.Material;
  board: THREE.Material;
  porcelain: THREE.Material;
  mint: THREE.Material;
}

/** Ce qui bouge dans la cuisine : la vapeur de la bouilloire, le filet d'eau du robinet et ses ronds dans l'eau */
function cuisineLife(decor: THREE.Object3D, t: number) {
  const life = decor.userData.life as THREE.Mesh[] | undefined;
  if (!life) return;
  for (const o of life) {
    const k = o.userData.kind as string;
    const mat = o.material as THREE.MeshStandardMaterial;
    if (k === "steam") {
      const ph = (t * 0.35 + (o.userData.ph as number)) % 1;
      o.position.y = (o.userData.y0 as number) + ph * 3.2;
      o.position.x = (o.userData.x0 as number) + Math.sin(t * 0.8 + ph * 4) * 0.35 * ph;
      o.scale.setScalar(0.5 + ph * 1.6);
      mat.opacity = 0.3 * Math.sin(ph * Math.PI);
    } else if (k === "stream") {
      if (mat.map) mat.map.offset.y = -t * 1.6;
    } else if (k === "ripple") {
      const ph = (t * 0.8 + (o.userData.ph as number)) % 1;
      o.scale.setScalar(0.3 + ph * 1.4);
      mat.opacity = 0.5 * (1 - ph);
    }
  }
}

let roomMats: {
  top: THREE.Material;
  edge: THREE.Material;
  wall: THREE.Material;
  tiles: THREE.Material;
  doors: THREE.Material;
  floor: THREE.Material;
} | null = null;

function cuisineDecor(c: Course, rng: () => number, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const life: THREE.Mesh[] = [];
  g.userData.life = life;
  const b = c.box;
  const base = c.outY;
  const cx = (b.x0 + b.x1) / 2;
  const farZ = b.z0 - 8;
  const frontZ = b.z1 + 12;
  const left = b.x0 - 30;
  const right = b.x1 + 30;

  if (!roomMats) {
    const counter = counterTex();
    const tiles = metroTex();
    const doors = doorTex();
    doors.repeat.set(9, 1);
    const floor = floorTex();
    floor.repeat.set(40, 40);
    roomMats = {
      top: new THREE.MeshPhysicalMaterial({ map: counter, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
      edge: new THREE.MeshStandardMaterial({ color: 0xe9e3d8, roughness: 0.6 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xf2e5cc, roughness: 0.9, side: THREE.BackSide }),
      tiles: new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.25 }),
      doors: new THREE.MeshStandardMaterial({ map: doors, roughness: 0.6 }),
      floor: new THREE.MeshStandardMaterial({ map: floor, roughness: 0.7 }),
    };
  }
  const rm = roomMats;

  // Le plan de travail carrelé, d'un mur à l'autre (un carreau fait 1,4 m : 10 cm à l'échelle de la balle) ; ses
  // portes de placard en dessous ; le sol tout en bas
  const W = right - left;
  const D = frontZ - farZ;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 1.2, D), rm.edge);
  slab.position.set((left + right) / 2, base - 0.61, (farZ + frontZ) / 2);
  g.add(slab);
  const topGeo = new THREE.PlaneGeometry(W, D);
  meterUV(topGeo, W, D, 2.8);
  const top = new THREE.Mesh(topGeo, rm.top);
  top.rotation.x = -Math.PI / 2;
  top.position.set((left + right) / 2, base, (farZ + frontZ) / 2);
  top.receiveShadow = true;
  g.add(top);
  const cabinets = new THREE.Mesh(new THREE.BoxGeometry(W, 12, 3), rm.doors);
  cabinets.position.set((left + right) / 2, base - 7.2, frontZ - 2.2);
  g.add(cabinets);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), rm.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, base - 13.2, frontZ + 40);
  g.add(floor);
  // La pièce : ses murs peints, de loin dans la brume
  const room = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 80, 200), rm.wall);
  room.position.set((left + right) / 2, base + 20, farZ - 0.3 + 100);
  g.add(room);

  // La crédence de carreaux blancs, au fond, au ras du plan de travail
  const splashGeo = new THREE.PlaneGeometry(W, 15);
  meterUV(splashGeo, W, 15, 8);
  const splash = new THREE.Mesh(splashGeo, rm.tiles);
  splash.position.set((left + right) / 2, base + 7.5, farZ);
  splash.receiveShadow = true;
  g.add(splash);
  // La fenêtre au milieu, le jardin derrière, son cadre, son appui et ses rideaux à carreaux
  const view = windowTex();
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 12),
    new THREE.MeshStandardMaterial({ map: view, emissive: 0xffffff, emissiveMap: view, emissiveIntensity: 1.25 }),
  );
  win.position.set(cx, base + 13, farZ + 0.05);
  g.add(win);
  const frame = new THREE.MeshStandardMaterial({ color: 0xfbf7ee, roughness: 0.45 });
  for (const [w, h, x, y] of [
    [11.8, 0.6, 0, 6.2],
    [12.6, 0.5, 0, -6.2],
    [0.6, 12.8, -5.8, 0],
    [0.6, 12.8, 5.8, 0],
    [0.3, 12, 0, 0],
    [11, 0.3, 0, 1.5],
  ] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), frame);
    bar.position.set(cx + x, base + 13 + y, farZ + 0.25);
    g.add(bar);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 1.6), frame);
  sill.position.set(cx, base + 6.7, farZ + 0.8);
  sill.castShadow = true;
  g.add(sill);
  const curtainTex = ginghamTex();
  curtainTex.repeat.set(2.5, 6);
  const curtain = new THREE.MeshStandardMaterial({ map: curtainTex, side: THREE.DoubleSide, roughness: 0.95 });
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(3.4, 13.5, 16, 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3.4) * 0.28);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, curtain);
    mesh.position.set(cx + s * 7.2, base + 12.6, farZ + 0.9);
    g.add(mesh);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 18, 10), m.gold);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(cx, base + 19.5, farZ + 0.9);
  g.add(rod);
  // Les placards vert d'eau, en haut, des deux côtés de la fenêtre, et leurs boutons de laiton
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const x = cx + s * (12.2 + k * 7.4);
      const box = new THREE.Mesh(new THREE.BoxGeometry(7.2, 10, 4.5), rm.doors);
      box.position.set(x, base + 14.5, farZ + 2.25);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), m.gold);
      knob.position.set(x - s * 2.8, base + 10.3, farZ + 4.6);
      g.add(box, knob);
    }
  // Des bocaux de pâtes, de café, de sucre et de lentilles contre la crédence
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xe6f4f8, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
  const fills = [0xe9c766, 0x4f3322, 0xf7f4ee, 0xd46a3a].map((col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 }));
  for (let k = 0; k < 4; k++) {
    const jar = new THREE.Group();
    const h = 2.4 + (k % 2) * 0.9;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, h, 28, 1, true), glass);
    body.position.y = h / 2;
    body.renderOrder = 2;
    const level = h * (0.55 + rng() * 0.3);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, level, 24), fills[k]!);
    fill.position.y = level / 2;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.32, 28), m.board);
    lid.position.y = h + 0.16;
    jar.add(body, fill, lid);
    jar.position.set(cx - 17 + k * 2.3, base, farZ + 2.0);
    shadows(jar);
    g.add(jar);
  }

  // Des objets grands comme des maisons, posés sur le plan de travail, loin des pistes
  // Chacun sa place (r : le rayon qu'il occupe), à quelques mètres des pistes, sans se chevaucher
  const taken: { x: number; z: number; r: number }[] = [];
  const place = (o: THREE.Object3D, r: number, side: number) => {
    for (let k = 0; k < 30; k++) {
      const off = 4 + r + rng() * 9;
      const x = side < 0 ? b.x0 - off : b.x1 + off;
      const z = b.z0 + 1 + rng() * Math.max(1, b.z1 - b.z0 - 2);
      if (onCourse(c, x, z, r + 1.5)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r + 0.8)) continue;
      taken.push({ x, z, r });
      o.position.set(x, base, z);
      o.rotation.y = rng() * Math.PI * 2;
      shadows(o);
      g.add(o);
      return true;
    }
    return false;
  };
  // Le grille-pain chromé, ses deux tranches qui dépassent, sa manette
  const toaster = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3, 2.6), m.chrome);
  tb.position.y = 1.5;
  toaster.add(tb);
  for (const s of [-0.55, 0.55]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.42), m.black);
    slot.position.set(0, 3.02, s);
    const toast = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.0, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xd9a25a, roughness: 0.95 }),
    );
    toast.position.set(0, 3.2, s);
    toaster.add(slot, toast);
  }
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.5), m.black);
  lever.position.set(2.25, 1.9, 0);
  toaster.add(lever);
  place(toaster, 2.6, -1);
  // La bouilloire rouge, et sa vapeur
  const kettle = new THREE.Group();
  const kb = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.95, 3.2, 32), m.red);
  kb.position.y = 1.6;
  const lid = new THREE.Mesh(new THREE.SphereGeometry(1.4, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.red);
  lid.position.y = 3.2;
  lid.scale.y = 0.5;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), m.black);
  knob.position.y = 3.9;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.17, 10, 28, Math.PI), m.black);
  handle.position.y = 3.55;
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.38, 1.8, 14), m.red);
  spout.position.set(1.95, 2.3, 0);
  spout.rotation.z = -0.95;
  kettle.add(kb, lid, knob, handle, spout);
  if (place(kettle, 2.8, 1)) {
    kettle.updateMatrixWorld();
    const tip = new THREE.Vector3(2.75, 2.95, 0).applyMatrix4(kettle.matrix);
    const puff = new THREE.SphereGeometry(0.5, 12, 8);
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(
        puff,
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, roughness: 1 }),
      );
      s.position.copy(tip);
      s.userData = { kind: "steam", ph: k / 6, y0: tip.y, x0: tip.x };
      life.push(s);
      g.add(s);
    }
  }
  // La théière de porcelaine et ses deux tasses de thé
  const pot = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 20), m.porcelain);
  pb.scale.y = 0.8;
  pb.position.y = 1.3;
  const plid = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.porcelain);
  plid.position.y = 2.45;
  const pknob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), m.gold);
  pknob.position.y = 3.2;
  const pspout = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.32, 1.6, 14), m.porcelain);
  pspout.position.set(1.7, 1.9, 0);
  pspout.rotation.z = -0.8;
  const phandle = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.13, 10, 24, Math.PI * 1.3), m.porcelain);
  phandle.position.set(-1.55, 1.5, 0);
  phandle.rotation.z = Math.PI * 0.35;
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.05, 6, 40),
    new THREE.MeshStandardMaterial({ color: 0x3a6ab8, roughness: 0.3 }),
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.3;
  pot.add(pb, plid, pknob, pspout, phandle, band);
  for (const [dx, dz] of [
    [3.4, 1.2],
    [2.6, -2.4],
  ] as const) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 1.0, 24, 1, true), m.porcelain);
    cup.position.set(dx, 0.62, dz);
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 0.12, 28), m.porcelain);
    saucer.position.set(dx, 0.06, dz);
    const tea = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshStandardMaterial({ color: 0x8a4a1a, roughness: 0.1 }));
    tea.rotation.x = -Math.PI / 2;
    tea.position.set(dx, 0.95, dz);
    pot.add(cup, saucer, tea);
  }
  place(pot, 4.6, -1);
  // La corbeille de fruits
  const bowl = new THREE.Group();
  const wicker = new THREE.MeshStandardMaterial({ color: 0xb07a3e, roughness: 0.95 });
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.8, 1.4, 28, 1, true), wicker);
  basket.position.y = 0.7;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.14, 8, 36), wicker);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.4;
  bowl.add(basket, rim);
  const fruitCols = [0xd8302a, 0xf2a020, 0xead23a, 0x6ab03a];
  // Six fruits en couronne, trois par-dessus, un tout en haut
  const heap: [number, number, number][] = [];
  for (let k = 0; k < 6; k++) heap.push([1.45, (k / 6) * Math.PI * 2, 1.2]);
  for (let k = 0; k < 3; k++) heap.push([0.7, (k / 3) * Math.PI * 2 + 0.5, 1.95]);
  heap.push([0, 0, 2.6]);
  heap.forEach(([d, a, y], k) => {
    const f = new THREE.Mesh(
      new THREE.SphereGeometry(0.62 + rng() * 0.12, 20, 14),
      new THREE.MeshPhysicalMaterial({ color: fruitCols[(k * 3) % 4]!, roughness: 0.35, clearcoat: 0.5 }),
    );
    f.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
    bowl.add(f);
  });
  place(bowl, 2.9, 1);
  // Une miche de pain et ses entailles
  const loaf = new THREE.Group();
  const bread = new THREE.Mesh(leafyBall(3, 0.03, 21), new THREE.MeshStandardMaterial({ color: 0xc98845, roughness: 0.85 }));
  bread.scale.set(3.0, 1.15, 1.5);
  bread.position.y = 0.85;
  loaf.add(bread);
  for (let k = 0; k < 4; k++) {
    const cut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.6), new THREE.MeshStandardMaterial({ color: 0xf0d6a0, roughness: 1 }));
    cut.position.set(-1.5 + k, 1.96, 0);
    cut.rotation.y = 0.5;
    loaf.add(cut);
  }
  place(loaf, 3.2, -1);
  // Un pot de basilic
  const plant = new THREE.Group();
  const terracotta = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.1, 2.2, 24),
    new THREE.MeshStandardMaterial({ color: 0xbc6a3e, roughness: 0.85 }),
  );
  terracotta.position.y = 1.1;
  plant.add(terracotta);
  const leaves = new Scatter(leafyBall(1, 0.1, 31), m.leaf);
  for (let k = 0; k < 30; k++)
    leaves.add((rng() - 0.5) * 2.6, 2.4 + rng() * 2.2, (rng() - 0.5) * 2.6, [0.55, 0.22, 0.4], rng() * 6, undefined, rng() - 0.5);
  const lm = leaves.build();
  if (lm) plant.add(lm);
  place(plant, 1.9, 1);
  // Une grande cuillère de bois, couchée
  const spoon = new THREE.Group();
  const handleS = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 9, 12), m.board);
  handleS.rotation.z = Math.PI / 2;
  handleS.position.set(-1.5, 0.25, 0);
  const bowlS = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 12), m.board);
  bowlS.scale.set(1.3, 0.3, 0.9);
  bowlS.position.set(3.9, 0.3, 0);
  spoon.add(handleS, bowlS);
  place(spoon, 5.6, rng() < 0.5 ? -1 : 1);
  // Des miettes et des grains de sucre semés sur la pierre
  const crumbs = new Scatter(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xd9a868, roughness: 1 }),
    false,
  );
  const sugar = new Scatter(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), false);
  for (let k = 0; k < 120; k++) {
    const x = b.x0 - 8 + rng() * (b.x1 - b.x0 + 16);
    const z = b.z0 - 4 + rng() * (b.z1 - b.z0 + 10);
    if (onCourse(c, x, z, 0.3)) continue;
    if (k % 4 === 0) sugar.add(x, base + 0.025, z, 0.05, rng() * 6);
    else crumbs.add(x, base + 0.02, z, 0.03 + rng() * 0.06, rng() * 6, undefined, rng());
  }
  for (const s of [crumbs, sugar]) {
    const mesh = s.build();
    if (mesh) g.add(mesh);
  }

  holeDecor(c, g, m, base, life);
  return g;
}

/** Le bord de la piste le long d'une ligne z = cte, en partant de x vers la gauche (dir −1) ou la droite (+1) */
function edgeAlong(c: Course, x: number, z: number, dir: number): number {
  let e = x;
  for (let k = 0; k < 400 && onCourse(c, e + dir * 0.05, z, 0); k++) e += dir * 0.05;
  return e;
}

/** Ce que chaque trou demande : la tête du batteur, le grille-pain, les conserves, la corbeille, la voie du petit train
 * et ses tunnels, l'entrée du tunnel de carton, le robinet de l'évier et la mousse */
function holeDecor(c: Course, g: THREE.Group, m: Mats, base: number, life: THREE.Mesh[]) {
  const def = c.def;
  for (const d of def.decos) {
    if (d.k === "batteur") {
      // Un batteur sur pied : la tête au-dessus des deux fouets, la colonne sur le côté, hors de la piste
      const head = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.9, 8, 24), m.mint);
      body.rotation.z = Math.PI / 2;
      body.position.set(0.35, 1.45, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 8, 28), m.chrome);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(-0.6, 1.45, 0);
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), m.gold);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(0.9, 1.5, 0.44);
      const colH = 1.45 - base;
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.62, colH, 0.62), m.mint);
      column.position.set(1.95, base + colH / 2, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1.3), m.mint);
      foot.position.set(2.0, base + 0.07, 0);
      head.add(body, ring, dial, column, foot);
      head.position.set(d.at[0], 0, d.at[1]);
      shadows(head);
      g.add(head);
      // Vu d'en haut, la tête cacherait les fouets : elle s'efface
      ((g.userData.hideAbove ??= []) as THREE.Object3D[]).push(body, ring, dial);
    } else if (d.k === "grille-pain") {
      // Le grille-pain encastré dans la planche : son cadre chromé et ses résistances qui rougeoient
      const t = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.018, 8, 36), m.chrome);
      frame.rotation.x = -Math.PI / 2;
      frame.position.y = 0.01;
      t.add(frame);
      const hot = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff4a10, emissiveIntensity: 2.2 });
      for (let k = -2; k <= 2; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34 - Math.abs(k) * 0.05, 0.008, 0.02), hot);
        bar.position.set(0, 0.008, k * 0.07);
        t.add(bar);
      }
      t.position.set(d.at[0], 0, d.at[1]);
      g.add(t);
    }
  }

  // Les assiettes : un liseré bleu sur l'aile et un filet doré au bord du creux, qui suivent le relief
  const blue = new THREE.MeshStandardMaterial({ color: 0x2f5fae, roughness: 0.3 });
  for (const t of def.tiles) {
    if (t.look !== "assiette") continue;
    const ring = t.rings[0]!;
    const pcx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const pcz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const r = Math.max(...ring.map((p) => Math.hypot(p[0] - pcx, p[1] - pcz)));
    for (const [k, mat, w] of [
      [0.9, blue, 0.012],
      [0.58, m.gold, 0.006],
    ] as const) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const x = pcx + Math.cos(a) * r * k;
        const z = pcz + Math.sin(a) * r * k;
        pts.push(new THREE.Vector3(x, heightAt(c, x, z) + 0.002, z));
      }
      const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, w, 4, true), mat);
      line.scale.y = 0.25;
      line.position.y = 0.75 * pts[0]!.y;
      g.add(line);
    }
  }

  // Les conserves : une rangée de boîtes empilées le long du mur (le mur lui-même ne se voit pas)
  for (const w of def.walls) {
    if (w.look === "conserves") {
      const r = w.t ?? 0.1;
      const h = w.h / 2;
      const tins = new Scatter(new THREE.CylinderGeometry(r * 0.98, r * 0.98, h * 0.97, 20), m.steel);
      const labels = new Scatter(
        new THREE.CylinderGeometry(r, r, h * 0.62, 20, 1, true),
        new THREE.MeshStandardMaterial({ map: labelTex(), roughness: 0.5 }),
      );
      const cols = [0xd8302a, 0x2f6fb5, 0xe8a53a, 0x3d8a3a, 0x8a3ab5];
      let n = 0;
      for (let i = 0; i + 1 < w.pts.length; i++) {
        const a = w.pts[i]!;
        const bb = w.pts[i + 1]!;
        const len = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
        const count = Math.max(1, Math.round(len / (r * 2)));
        for (let k = 0; k < count; k++) {
          const s = (k + 0.5) / count;
          const x = a[0] + (bb[0] - a[0]) * s;
          const z = a[1] + (bb[1] - a[1]) * s;
          for (let level = 0; level < 2; level++) {
            const y = h * (level + 0.5);
            tins.add(x, y, z, 1, n * 0.7);
            labels.add(x, y, z, 1, n * 0.7, cols[(n * 3 + level) % cols.length]!);
            n++;
          }
        }
      }
      for (const s of [tins, labels]) {
        const mesh = s.build();
        if (mesh) g.add(mesh);
      }
    } else if (w.look === "corbeille" && w.closed) {
      // La corbeille de fruits au milieu du marbre : l'osier tressé, et des fruits par-dessus le bord
      const cxw = w.pts.reduce((s, p) => s + p[0], 0) / w.pts.length;
      const czw = w.pts.reduce((s, p) => s + p[1], 0) / w.pts.length;
      const r = Math.max(...w.pts.map((p) => Math.hypot(p[0] - cxw, p[1] - czw))) + (w.t ?? 0.05);
      const bowl = new THREE.Group();
      const weave = canvasTex(128, (gg, s) => {
        gg.fillStyle = "#a8743c";
        gg.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 16)
          for (let x = 0; x < s; x += 16) {
            gg.fillStyle = (x + y) % 32 ? "#c48f50" : "#8e5f2e";
            gg.fillRect(x + 1, y + 1, 14, 14);
          }
      });
      weave.repeat.set(10, 2);
      const wick = new THREE.MeshStandardMaterial({ map: weave, roughness: 0.95 });
      const side = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 0.92, w.h, 36, 1, true), wick);
      side.position.y = w.h / 2;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 1.04, 0.035, 8, 40), wick);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = w.h;
      const inside = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 1 }));
      inside.rotation.x = -Math.PI / 2;
      inside.position.y = w.h * 0.6;
      bowl.add(side, lip, inside);
      const fruit = [0xd8302a, 0xf2a020, 0x6ab03a, 0xead23a, 0x7a2a6a];
      for (let k = 0; k < 9; k++) {
        const fr = 0.16 + (k % 3) * 0.04;
        const f = new THREE.Mesh(
          new THREE.SphereGeometry(fr, 18, 12),
          new THREE.MeshPhysicalMaterial({ color: fruit[k % fruit.length]!, roughness: 0.35, clearcoat: 0.5 }),
        );
        const a = k * 2.2;
        const d = k === 0 ? 0 : r * (0.35 + (k % 2) * 0.3);
        f.position.set(Math.cos(a) * d, w.h * 0.6 + fr + (k === 0 ? 0.18 : 0.04), Math.sin(a) * d);
        bowl.add(f);
      }
      // Une banane couchée sur les autres
      const banana = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.07, 10, 20, Math.PI * 0.8),
        new THREE.MeshStandardMaterial({ color: 0xf2d23a, roughness: 0.5 }),
      );
      banana.position.set(0.05, w.h + 0.18, 0.05);
      banana.rotation.set(Math.PI / 2.4, 0, 0.6);
      bowl.add(banana);
      bowl.position.set(cxw, 0, czw);
      shadows(bowl);
      g.add(bowl);
    }
  }

  // Le petit train : sa voie qui traverse la nappe, et un tunnel de carton de chaque côté, où il disparaît
  for (const mv of def.movers) {
    if (mv.look !== "train" || mv.motion.k !== "slide") continue;
    const xs: number[] = [];
    let z = 0;
    const dx = mv.motion.d[0];
    for (const p of mv.parts)
      if (p.k === "wall") {
        xs.push(p.a[0], p.b[0], p.a[0] + dx, p.b[0] + dx);
        z = p.a[1];
      }
    if (xs.length === 0) continue;
    const x0 = Math.min(...xs) - 0.25;
    const x1 = Math.max(...xs) + 0.25;
    const sleepers = new Scatter(
      new THREE.BoxGeometry(0.08, 0.008, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.9 }),
      false,
    );
    for (let x = x0; x <= x1; x += 0.2) if (onCourse(c, x, z, 0)) sleepers.add(x, 0.004, z, 1);
    const sm = sleepers.build();
    if (sm) g.add(sm);
    const inL = edgeAlong(c, 0, z, -1);
    const inR = edgeAlong(c, 0, z, 1);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(inR - inL, 0.01, 0.025), m.chrome);
      rail.position.set((inL + inR) / 2, 0.012, z + s * 0.14);
      g.add(rail);
    }
    const card = new THREE.MeshStandardMaterial({ color: 0xc89c68, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a2814, roughness: 1, side: THREE.BackSide });
    const paint = new THREE.MeshStandardMaterial({ color: 0xb8423a, roughness: 0.7 });
    for (const [a, e, mouthX] of [
      [x0 - 0.3, inL - 0.04, inL - 0.04],
      [inR + 0.04, x1 + 0.3, inR + 0.04],
    ] as const) {
      const len = e - a;
      if (len <= 0.05) continue;
      const geo = new THREE.CylinderGeometry(0.9, 0.9, len, 28, 1, true, 0, Math.PI);
      geo.rotateZ(Math.PI / 2);
      const shell = new THREE.Mesh(geo, card);
      const inner = new THREE.Mesh(geo, dark);
      shell.position.set((a + e) / 2, base, z);
      inner.position.copy(shell.position);
      shell.castShadow = true;
      // L'arche peinte à l'entrée du tunnel, du côté de la piste
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.07, 8, 28, Math.PI), paint);
      mouth.rotation.y = Math.PI / 2;
      mouth.position.set(mouthX, base, z);
      g.add(shell, inner, mouth);
    }
  }

  // Le tunnel de carton (un téléporteur) : un trou rond cerclé de carton, à l'entrée comme à la sortie
  for (const p of def.portals) {
    if (p.look !== "tunnel") continue;
    for (const [pt, r] of [
      [p.a, p.r],
      [p.b, p.r * 0.8],
    ] as const) {
      const lip = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.07, 32),
        new THREE.MeshStandardMaterial({ color: 0xc89c68, roughness: 0.95 }),
      );
      lip.rotation.x = -Math.PI / 2;
      lip.position.set(pt[0], 0.007, pt[1]);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 28), new THREE.MeshBasicMaterial({ color: 0x1a120a }));
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(pt[0], 0.006, pt[1]);
      g.add(lip, hole);
    }
  }

  // L'évier : un robinet chromé qui coule dans le bac, des ronds dans l'eau, de la mousse et une éponge
  const sinkWater = def.tiles.filter((t) => t.look === "eau-evier");
  if (sinkWater.length > 0) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const t of sinkWater)
      for (const ring of t.rings)
        for (const p of ring) {
          x0 = Math.min(x0, p[0]);
          x1 = Math.max(x1, p[0]);
          z0 = Math.min(z0, p[1]);
          z1 = Math.max(z1, p[1]);
        }
    const h0 = sinkWater[0]!.h;
    const wy = typeof h0 === "number" ? h0 : 0;
    const midZ = (z0 + z1) / 2;
    // Le robinet monte du bord de l'évier (hors de la piste) et se penche au-dessus de l'eau, à droite
    const edge = edgeAlong(c, x1, midZ, 1);
    const spoutX = x1 - 0.55;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(edge + 0.5, base, midZ),
      new THREE.Vector3(edge + 0.5, 1.6, midZ),
      new THREE.Vector3(edge + 0.2, 2.3, midZ),
      new THREE.Vector3((edge + spoutX) / 2, 2.5, midZ),
      new THREE.Vector3(spoutX + 0.15, 2.1, midZ),
      new THREE.Vector3(spoutX, 1.7, midZ),
    ]);
    const tap = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.09, 14, false), m.chrome);
    tap.castShadow = true;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 20), m.chrome);
    foot.position.set(edge + 0.5, base + 0.1, midZ);
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), m.chrome);
    lever.position.set(edge + 0.5, 1.0, midZ + 0.25);
    lever.rotation.x = 1.0;
    g.add(tap, foot, lever);
    const streamTex = canvasTex(64, (gg, s) => {
      for (let y = 0; y < s; y++) {
        gg.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(y * 0.6) ** 2})`;
        gg.fillRect(0, y, s, 1);
      }
    });
    streamTex.repeat.set(1, 3);
    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.05, 1.7 - wy, 10, 1, true),
      new THREE.MeshStandardMaterial({
        map: streamTex,
        color: 0xdff4ff,
        transparent: true,
        opacity: 0.6,
        roughness: 0.05,
        depthWrite: false,
      }),
    );
    stream.position.set(spoutX, (1.7 + wy) / 2, midZ);
    stream.userData = { kind: "stream" };
    life.push(stream);
    g.add(stream);
    for (let k = 0; k < 3; k++) {
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(0.16, 0.2, 28),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(spoutX, wy + 0.004, midZ);
      ripple.userData = { kind: "ripple", ph: k / 3 };
      life.push(ripple);
      g.add(ripple);
    }
    // La mousse dans les coins du bac
    const foam = new Scatter(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.85, clearcoat: 1 }),
      false,
    );
    const r01 = noise(13);
    for (const [fx, fz] of [
      [x0 + 0.25, z0 + 0.3],
      [x1 - 0.3, z1 - 0.35],
      [x0 + 0.3, z1 - 0.25],
    ] as const)
      for (let k = 0; k < 14; k++)
        foam.add(fx + (r01() - 0.5) * 0.45, wy + 0.01, fz + (r01() - 0.5) * 0.45, [
          0.05 + r01() * 0.06,
          0.03 + r01() * 0.03,
          0.05 + r01() * 0.06,
        ]);
    const fm = foam.build();
    if (fm) g.add(fm);
    // L'éponge, posée sur le plan de travail à gauche de l'évier
    const sponge = new THREE.Group();
    const soft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.55), new THREE.MeshStandardMaterial({ color: 0xf2d84a, roughness: 1 }));
    soft.position.y = 0.14;
    const scrub = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.55), new THREE.MeshStandardMaterial({ color: 0x3a8a4a, roughness: 1 }));
    scrub.position.y = 0.33;
    sponge.add(soft, scrub);
    sponge.position.set(edgeAlong(c, x0, midZ, -1) - 0.9, base, midZ + 0.8);
    sponge.rotation.y = 0.4;
    shadows(sponge);
    g.add(sponge);
  }
}
