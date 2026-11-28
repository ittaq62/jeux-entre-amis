// Le décor autour de chaque cuisine : ce qui fait qu'on sait où l'on est d'un coup d'œil. Le bistrot et ses fenêtres
// sur les toits de Paris, la crêperie sur son bateau au milieu de la mer, la cantine et sa cour d'école, la pizzeria sur
// les toits de Nice au soleil couchant, la brasserie et ses étals, le chalet sous la neige, le train de nuit et le
// paysage qui défile, la guinguette au bord de l'eau et ses lampions, la salle des fêtes en guirlandes. Tout est fait de
// formes simples, fondues par matière (peu d'appels de dessin), avec quelques pièces qui s'animent.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Kitchen } from "../../../shared/games/toque/kitchens.ts";
import { gust } from "../../../shared/games/toque/hazards.ts";
import { canvasTexture, seeded, type Keep } from "./textures.ts";
import type { Theme } from "./themes.ts";

export interface Decor {
  root: THREE.Group;
  update(clock: number, dt: number, t: number): void;
  dispose(): void;
}

/** Un petit atelier : des formes qu'on pose, fondues par couleur à la fin */
class Builder {
  private byColor = new Map<string, THREE.BufferGeometry[]>();
  readonly root = new THREE.Group();
  constructor(private keep: Keep) {}

  put(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.rotateX(rx);
    g.rotateZ(rz);
    g.rotateY(ry);
    g.translate(x, y, z);
    if (!g.getAttribute("uv"))
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    const list = this.byColor.get(color) ?? [];
    list.push(g);
    this.byColor.set(color, list);
  }

  box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, ry = 0) {
    this.put(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry);
  }

  cyl(rt: number, rb: number, h: number, color: string, x: number, y: number, z: number, seg = 12) {
    this.put(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z);
  }

  cone(r: number, h: number, color: string, x: number, y: number, z: number, seg = 10) {
    this.put(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z);
  }

  sphere(r: number, color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.SphereGeometry(r, 12, 8);
    g.scale(sx, sy, sz);
    this.put(g, color, x, y, z);
  }

  /** Tout fondre : un objet par couleur ; `glow` : ces couleurs-là brillent */
  done(glow: string[] = [], rough = 0.8, shadows = true) {
    for (const [color, geos] of this.byColor) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      this.keep(merged);
      const lit = glow.includes(color);
      const mat = this.keep(
        lit ? new THREE.MeshBasicMaterial({ color, toneMapped: false }) : new THREE.MeshStandardMaterial({ color, roughness: rough }),
      );
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = shadows && !lit;
      m.receiveShadow = !lit;
      this.root.add(m);
    }
    this.byColor.clear();
    return this.root;
  }
}

/** Une plaque peinte (une fenêtre, une ardoise, un paysage) */
function painted(
  keep: Keep,
  w: number,
  h: number,
  px: number,
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void,
  basic = false,
) {
  const tex = canvasTexture(keep, px, Math.round((px * h) / w), draw);
  const mat = keep(
    basic ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }),
  );
  return new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), mat);
}

/** L'eau : une grande nappe qui ondule doucement, plus claire sous le soleil */
function water(keep: Keep, color: string, deep: string, size: number): { mesh: THREE.Mesh; tick: (t: number) => void } {
  const mat = keep(
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) } },
      vertexShader: `varying vec2 vP; uniform float uTime; void main(){ vec3 p = position; vP = p.xy;
        p.z += sin(p.x * 0.7 + uTime * 1.3) * 0.05 + cos(p.y * 0.9 + uTime * 1.1) * 0.05;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `varying vec2 vP; uniform float uTime; uniform vec3 uColor; uniform vec3 uDeep;
        float n(vec2 p){ return sin(p.x) * cos(p.y); }
        void main(){
          vec2 q = vP * 1.6;
          float w = n(q + vec2(uTime * 0.6, uTime * 0.4)) + n(q * 1.7 - vec2(uTime * 0.5, -uTime * 0.3)) * 0.6;
          float glint = smoothstep(1.15, 1.5, w);
          vec3 c = mix(uDeep, uColor, 0.55 + 0.25 * w);
          c += vec3(1.0, 0.97, 0.9) * glint * 0.45;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(size, size, 60, 60)), mat);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, tick: (t) => (mat.uniforms.uTime!.value = t) };
}

/** Des lampions sur un fil, entre deux points */
function garland(b: Builder, a: [number, number, number], c: [number, number, number], n: number, colors: string[], sag = 0.5) {
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = a[0] + (c[0] - a[0]) * u;
    const z = a[2] + (c[2] - a[2]) * u;
    const y = a[1] + (c[1] - a[1]) * u - Math.sin(u * Math.PI) * sag;
    if (i > 0) {
      const pu = (i - 1) / n;
      const px = a[0] + (c[0] - a[0]) * pu;
      const pz = a[2] + (c[2] - a[2]) * pu;
      const py = a[1] + (c[1] - a[1]) * pu - Math.sin(pu * Math.PI) * sag;
      const len = Math.hypot(x - px, y - py, z - pz);
      const g = new THREE.CylinderGeometry(0.008, 0.008, len, 4);
      const mid = new THREE.Vector3((x + px) / 2, (y + py) / 2, (z + pz) / 2);
      const dir = new THREE.Vector3(x - px, y - py, z - pz).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.applyQuaternion(q);
      b.put(g, "#2a2622", mid.x, mid.y, mid.z);
    }
    if (i > 0 && i < n) b.sphere(0.09, colors[i % colors.length]!, x, y - 0.12, z, 1, 1.2, 1);
  }
}

export function buildDecor(k: Kitchen, theme: Theme, keep: Keep, touch: boolean): Decor {
  const root = new THREE.Group();
  const ticks: ((clock: number, dt: number, t: number) => void)[] = [];
  const W = k.W;
  const H = k.H;
  const x0 = -W / 2;
  const x1 = W / 2;
  const z0 = -H / 2;
  const z1 = H / 2;
  const rand = seeded(k.id.length * 97);
  const b = new Builder(keep);

  switch (k.id) {
    case "bistrot": {
      // Le mur du fond : deux fenêtres sur les toits de Paris, l'ardoise du jour, la rampe des casseroles de cuivre
      for (const wx of [x0 + 2.6, x1 - 2.6]) {
        const win = painted(
          keep,
          2.1,
          1.3,
          256,
          (g, w, h) => {
            const sky = g.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, "#f2b46a");
            sky.addColorStop(1, "#f8dcaa");
            g.fillStyle = sky;
            g.fillRect(0, 0, w, h);
            // Les toits de zinc, les cheminées, une tour au loin
            g.fillStyle = "#6a7a8a";
            for (let i = 0; i < 8; i++) {
              const bx = i * 36 - 10;
              const bh = 40 + ((i * 37) % 30);
              g.fillRect(bx, h - bh, 34, bh);
              g.fillStyle = "#4a5866";
              g.beginPath();
              g.moveTo(bx - 2, h - bh);
              g.lineTo(bx + 17, h - bh - 14);
              g.lineTo(bx + 36, h - bh);
              g.fill();
              g.fillStyle = "#8a5a3a";
              g.fillRect(bx + 8, h - bh - 18, 6, 10);
              g.fillStyle = "#6a7a8a";
            }
            g.fillStyle = "#5a4a5a";
            g.beginPath();
            g.moveTo(w * 0.72, h * 0.55);
            g.lineTo(w * 0.76, h * 0.08);
            g.lineTo(w * 0.8, h * 0.55);
            g.fill();
            // Le croisillon de la fenêtre
            g.fillStyle = "#f4f1ea";
            g.fillRect(w / 2 - 4, 0, 8, h);
            g.fillRect(0, h / 2 - 4, w, 8);
            g.strokeStyle = "#f4f1ea";
            g.lineWidth = 14;
            g.strokeRect(0, 0, w, h);
          },
          true,
        );
        win.position.set(wx, 1.75, z0 + 0.02);
        root.add(win);
      }
      const slate = painted(keep, 1.6, 1.0, 256, (g, w, h) => {
        g.fillStyle = "#6a4a2a";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#2a2e2c";
        g.fillRect(10, 10, w - 20, h - 20);
        g.fillStyle = "#f4f1ea";
        g.font = "italic 26px 'Great Vibes', cursive";
        g.textAlign = "center";
        g.fillText("Le plat du jour", w / 2, 50);
        g.font = "18px 'Young Serif', serif";
        g.fillText("Soupe à l'oignon", w / 2, 92);
        g.fillText("Salade du marché", w / 2, 122);
        g.fillText("— Mémé", w / 2, 150);
      });
      slate.position.set(0, 1.9, z0 + 0.02);
      root.add(slate);
      for (let i = 0; i < 6; i++) {
        const px = x0 + 3 + i * ((W - 6) / 5);
        b.cyl(0.14 + (i % 3) * 0.03, 0.12 + (i % 3) * 0.03, 0.08, "#c07a3a", px, 1.95, z0 + 0.3);
        b.box(0.03, 0.28, 0.03, "#8a5a2a", px, 2.0, z0 + 0.3);
      }
      // La rampe : posée en travers, haut sur le mur
      b.put(new THREE.CylinderGeometry(0.025, 0.025, W - 4, 8), "#b87333", 0, 2.32, z0 + 0.3, 0, 0, Math.PI / 2);
      // Deux appliques de cuivre de part et d'autre de l'ardoise
      for (const lx of [-1.4, 1.4]) {
        b.box(0.05, 0.3, 0.12, "#b87333", lx, 2.0, z0 + 0.05);
        b.sphere(0.1, "#ffe2a8", lx, 2.38, z0 + 0.14);
      }
      break;
    }
    case "creperie": {
      // La mer tout autour, le bateau sous la cuisine (sa coque, son bastingage), le mât, le port au loin
      const sea = water(keep, "#3f9ac0", "#1a5a7a", 140);
      sea.mesh.position.y = -0.35;
      root.add(sea.mesh);
      ticks.push((c) => sea.tick(c));
      // La coque : une caisse de bois bleu qui s'enfonce dans l'eau, plus large que le pont
      b.box(W + 0.6, 1.0, H + 0.6, "#2a4a6a", 0, -1.06, 0);
      // Le liseré blanc du pont, juste sous le plancher de la cuisine (au-dessus, il cachait les planches)
      b.box(W + 0.7, 0.12, H + 0.7, "#e8e2d2", 0, -0.15, 0);
      // La proue, pointue, à droite ; la poupe à gauche
      const bow = new THREE.ConeGeometry((H + 0.6) / 2, 2.6, 4, 1);
      bow.rotateZ(-Math.PI / 2);
      bow.rotateX(Math.PI / 4);
      bow.scale(1, 0.38, 1);
      b.put(bow, "#2a4a6a", x1 + 1.6, -0.55, 0);
      // Le bastingage, devant et derrière (les côtés de la cuisine sont des rambardes)
      for (let x = x0; x <= x1; x += 1) {
        b.box(0.06, 0.6, 0.06, "#e8e2d2", x, 0, z0 - 0.25);
      }
      b.box(W, 0.06, 0.08, "#c8a878", 0, 0.6, z0 - 0.25);
      // Le mât et sa voile roulée, derrière ; les lanternes
      b.cyl(0.09, 0.11, 6.5, "#8a6a42", x0 + 2.5, 0, z0 - 0.9);
      b.put(new THREE.CylinderGeometry(0.06, 0.06, 4.5, 8), "#8a6a42", x0 + 4.4, 3.2, z0 - 0.9, 0, 0, Math.PI / 2);
      b.put(new THREE.CylinderGeometry(0.16, 0.16, 4.2, 10), "#e8dcc0", x0 + 4.4, 3.38, z0 - 0.9, 0, 0, Math.PI / 2);
      b.sphere(0.12, "#ffd27a", x0 + 2.5, 2.2, z0 - 0.75);
      // La bouée, sur le bastingage
      b.put(new THREE.TorusGeometry(0.22, 0.07, 8, 16), "#e8402e", x1 - 2, 0.5, z0 - 0.3);
      // Le port au loin : un phare, des maisons colorées sur le quai
      b.box(30, 0.8, 3, "#8a8278", 0, -0.4, z0 - 16);
      const houses = ["#e8b84a", "#d86a4a", "#f2efe6", "#6aa0c8", "#e89a8a", "#a8c890"];
      for (let i = 0; i < 12; i++) {
        const hx = -14 + i * 2.4;
        const hh = 2 + rand() * 1.6;
        b.box(2.2, hh, 1.6, houses[i % houses.length]!, hx, 0.4, z0 - 16.5);
        b.put(new THREE.ConeGeometry(1.6, 1, 4), "#5a4a48", hx, 0.4 + hh + 0.5, z0 - 16.5, Math.PI / 4);
      }
      b.cyl(0.6, 0.8, 6, "#f4f1ea", 16, -0.3, z0 - 14);
      b.cyl(0.62, 0.62, 0.8, "#d8402e", 16, 2.2, z0 - 14);
      b.cyl(0.4, 0.5, 0.8, "#ffd27a", 16, 5.7, z0 - 14);
      // Des mouettes qui tournent
      const gulls = new THREE.Group();
      const gullMat = keep(new THREE.MeshBasicMaterial({ color: "#f8f8f4" }));
      for (let i = 0; i < 4; i++) {
        const gull = new THREE.Group();
        for (const s of [-1, 1]) {
          const wing = new THREE.Mesh(keep(new THREE.BoxGeometry(0.35, 0.02, 0.1)), gullMat);
          wing.position.x = s * 0.17;
          wing.rotation.z = s * 0.35;
          gull.add(wing);
        }
        gulls.add(gull);
      }
      root.add(gulls);
      ticks.push((c) =>
        gulls.children.forEach((g, i) => {
          const a = c * 0.3 + i * 1.7;
          g.position.set(Math.cos(a) * (8 + i), 5 + Math.sin(c + i) * 0.4, z0 - 4 + Math.sin(a) * 4);
          g.rotation.y = -a;
          g.children.forEach((w, j) => (w.rotation.z = (j ? -1 : 1) * (0.2 + Math.sin(c * 6 + i) * 0.3)));
        }),
      );
      break;
    }
    case "cantine": {
      // Les grandes fenêtres sur la cour, l'horloge de l'école, les dessins des enfants, les rails des tables
      for (let i = 0; i < 3; i++) {
        const win = painted(
          keep,
          2.4,
          1.4,
          256,
          (g, w, h) => {
            g.fillStyle = "#bfe0f4";
            g.fillRect(0, 0, w, h);
            g.fillStyle = "#e0d0a8";
            g.fillRect(0, h * 0.7, w, h * 0.3);
            // Le marronnier de la cour, le préau
            g.fillStyle = "#6a4a2a";
            g.fillRect(w * 0.3, h * 0.42, 10, h * 0.3);
            g.fillStyle = "#5a9a4a";
            g.beginPath();
            g.arc(w * 0.3 + 5, h * 0.38, 40, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = "#c8583a";
            g.fillRect(w * 0.6, h * 0.45, w * 0.35, h * 0.26);
            g.fillStyle = "#f4f1ea";
            g.fillRect(w / 3 - 3, 0, 6, h);
            g.fillRect((2 * w) / 3 - 3, 0, 6, h);
            g.strokeStyle = "#f4f1ea";
            g.lineWidth = 12;
            g.strokeRect(0, 0, w, h);
          },
          true,
        );
        win.position.set(x0 + 2.5 + i * ((W - 5) / 2), 1.8, z0 + 0.02);
        root.add(win);
      }
      const clock = painted(keep, 0.7, 0.7, 128, (g, w) => {
        g.fillStyle = "#fbf8ef";
        g.beginPath();
        g.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#2a2a2a";
        g.lineWidth = 6;
        g.stroke();
        g.fillStyle = "#2a2a2a";
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.fillRect(w / 2 + Math.cos(a) * 46 - 2, w / 2 + Math.sin(a) * 46 - 2, 4, 4);
        }
      });
      clock.position.set(0, 2.45, z0 + 0.03);
      root.add(clock);
      const hand = new THREE.Mesh(keep(new THREE.BoxGeometry(0.02, 0.24, 0.01)), keep(new THREE.MeshBasicMaterial({ color: "#2a2a2a" })));
      hand.geometry.translate(0, 0.1, 0);
      hand.position.set(0, 2.45, z0 + 0.05);
      root.add(hand);
      ticks.push((_c, _dt, t) => (hand.rotation.z = -t * 0.35));
      const drawings = ["#e8402e", "#3a8ad8", "#f2c94a", "#5ab85a", "#c85ab8"];
      for (let i = 0; i < 6; i++) b.box(0.45, 0.35, 0.01, drawings[i % 5]!, x0 + 1.2 + i * 0.6, 0.95, z0 + 0.02);
      // Les rails des tables qui glissent
      for (const s of [1, 2]) {
        const cells = k.moving[s] ?? [];
        if (cells.length === 0) continue;
        const row = Math.floor(cells[0]! / W);
        const m = k.motions[s]!;
        const xs = cells.map((c) => (c % W) + 0.5 - W / 2);
        const lo = Math.min(...xs, ...m.moves.flatMap((mv) => xs.map((x) => x + mv.dx))) - 0.5;
        const hi = Math.max(...xs, ...m.moves.flatMap((mv) => xs.map((x) => x + mv.dx))) + 0.5;
        for (const dz of [-0.3, 0.3]) b.box(hi - lo, 0.012, 0.05, "#8a9098", (lo + hi) / 2, 0.001, row + 0.5 - H / 2 + dz);
      }
      break;
    }
    case "pizzeria": {
      // Sous les deux toits, la rue profonde ; autour, les toits de tuiles de la vieille ville, la mer, le couchant
      b.box(W + 0.4, 6, H + 0.4, "#d8a878", 0, -6.02, 0);
      // La faille entre les deux toits : on voit la rue, tout en bas
      b.box(1, 0.02, H + 6, "#3a3028", 0.5 - W / 2 + 7, -6, 0);
      const roofs = ["#c8643a", "#b85a32", "#d07040", "#a84e2c"];
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : -1;
        const rx = side * (W / 2 + 2 + rand() * 10);
        const rz = (rand() - 0.5) * 22 - 4;
        const rh = -1 - rand() * 4;
        const rw = 2 + rand() * 2.5;
        b.box(rw, 6, rw * 0.9, ["#e8c89a", "#f2d8b0", "#e0b888", "#f4e0c0"][i % 4]!, rx, rh - 6, rz);
        b.put(new THREE.ConeGeometry(rw * 0.75, 0.9, 4), roofs[i % 4]!, rx, rh + 0.45, rz, Math.PI / 4);
      }
      for (let i = 0; i < 12; i++) {
        const rz = z0 - 3 - rand() * 12;
        const rx = (rand() - 0.5) * 30;
        const rh = -2 - rand() * 3;
        const rw = 2 + rand() * 2;
        b.box(rw, 6, rw, "#f0d4a8", rx, rh - 6, rz);
        b.put(new THREE.ConeGeometry(rw * 0.75, 0.9, 4), roofs[i % 4]!, rx, rh + 0.45, rz, Math.PI / 4);
      }
      // Les cheminées et les antennes des toits
      for (const [cx, cz] of [
        [x0 + 0.5, z0 - 0.4],
        [x1 - 1, z0 - 0.4],
      ] as const) {
        b.box(0.5, 0.9, 0.5, "#e0b888", cx, 0, cz);
        b.box(0.6, 0.1, 0.6, "#a84e2c", cx, 0.9, cz);
      }
      // Les lampions entre les deux toits, et le citronnier en pot
      garland(b, [x0 + 0.5, 2.2, z0 + 0.5], [x1 - 0.5, 2.2, z0 + 0.5], 14, ["#ffcf5a", "#ff8a5a", "#ffe8a0", "#ff6a4a"], 0.6);
      b.cyl(0.3, 0.24, 0.5, "#c8643a", x1 + 0.8, 0, z1 - 1.5);
      b.sphere(0.55, "#4a8a3a", x1 + 0.8, 1.1, z1 - 1.5);
      for (let i = 0; i < 5; i++)
        b.sphere(0.07, "#f2d23a", x1 + 0.8 + Math.cos(i * 1.3) * 0.45, 1.1 + Math.sin(i * 2) * 0.3, z1 - 1.5 + Math.sin(i * 1.3) * 0.45);
      // La mer au loin
      const sea = water(keep, "#4aa0c8", "#1e5a8a", 300);
      sea.mesh.position.set(0, -9, -70);
      root.add(sea.mesh);
      ticks.push((c) => sea.tick(c * 0.5));
      // Le drapeau qui annonce le vent : il claque du côté où soufflera la rafale
      const pole = new THREE.Mesh(
        keep(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 8)),
        keep(new THREE.MeshStandardMaterial({ color: "#d8d8d4", metalness: 0.6, roughness: 0.3 })),
      );
      pole.position.set(x0 + 7.5, 1.3, z0 - 0.4);
      root.add(pole);
      const flag = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(0.9, 0.55, 8, 1)),
        keep(new THREE.MeshStandardMaterial({ color: "#e8402e", side: THREE.DoubleSide, roughness: 0.7 })),
      );
      flag.geometry.translate(0.45, 0, 0);
      flag.position.set(x0 + 7.5, 2.3, z0 - 0.4);
      root.add(flag);
      const fp = flag.geometry.getAttribute("position") as THREE.BufferAttribute;
      const base = Float32Array.from(fp.array as Float32Array);
      ticks.push((c, _dt, t) => {
        const g = gust(t);
        const k = g.warn ? 0.8 : g.k > 0 ? 1 : 0.25;
        flag.rotation.y = g.k > 0 || g.warn ? -Math.atan2(g.dy, g.dx) : 0.4 + Math.sin(c * 0.5) * 0.3;
        for (let i = 0; i < fp.count; i++) {
          const x = base[i * 3]!;
          fp.setZ(i, Math.sin(x * 6 - c * (6 + k * 10)) * 0.08 * x * (0.4 + k));
        }
        fp.needsUpdate = true;
      });
      break;
    }
    case "brasserie": {
      // Les étals du marché au bout de l'allée, les auvents rayés, les cagettes de légumes
      const lane = (k.def.lane ?? 4) + 0.5 - H / 2;
      for (const side of [-1, 1]) {
        const ex = side * (W / 2 + 1.8);
        b.box(2.4, 0.8, 1.2, "#8a5a3a", ex, 0, lane - 1.6);
        b.box(2.4, 0.8, 1.2, "#8a5a3a", ex, 0, lane + 1.6);
        for (let i = 0; i < 4; i++) {
          b.box(0.5, 0.22, 0.38, "#c8a070", ex - 0.8 + (i % 2) * 0.9, 0.8, lane - 1.6 + (i < 2 ? -0.2 : 0.2));
          b.sphere(
            0.12,
            ["#e0392b", "#f2a23a", "#5ab84a", "#9a4a8a"][i]!,
            ex - 0.8 + (i % 2) * 0.9,
            1.06,
            lane - 1.6 + (i < 2 ? -0.2 : 0.2),
            1.6,
            0.7,
            1.2,
          );
        }
        for (let s = 0; s < 6; s++) b.box(0.4, 0.04, 1.6, s % 2 ? "#f4f1ea" : "#c8402e", ex - 1 + s * 0.4, 2.0, lane - 1.6, 0);
      }
      // L'ardoise de la brasserie
      const slate = painted(keep, 1.8, 0.9, 256, (g, w, h) => {
        g.fillStyle = "#2a2e2c";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#f4f1ea";
        g.font = "22px 'Young Serif', serif";
        g.textAlign = "center";
        g.fillText("Chez Paulette", w / 2, 36);
        g.font = "16px 'Young Serif', serif";
        g.fillText("Steak-frites · Croque-monsieur", w / 2, 72);
        g.fillText("Le marché, c'est samedi !", w / 2, 102);
      });
      slate.position.set(0, 1.9, z0 + 0.02);
      root.add(slate);
      break;
    }
    case "chalet": {
      // La neige autour, les sapins, les montagnes, la cheminée qui rougeoie
      b.box(80, 0.2, 80, "#f4f8fc", 0, -0.21, -10);
      for (let i = 0; i < 18; i++) {
        const px = x1 + 1 + rand() * 6;
        const pz = (rand() - 0.5) * (H + 6);
        const s = 0.7 + rand() * 0.6;
        b.cyl(0.08 * s, 0.1 * s, 0.4 * s, "#5a3a22", px, 0, pz, 6);
        b.cone(0.6 * s, 1.1 * s, "#2f5a3a", px, 0.3 * s, pz, 8);
        b.cone(0.45 * s, 0.9 * s, "#356a42", px, 0.9 * s, pz, 8);
        b.cone(0.22 * s, 0.32 * s, "#f4f8fc", px, 1.55 * s, pz, 8);
      }
      for (let i = 0; i < 7; i++) {
        const mx = -24 + i * 8;
        const mh = 9 + rand() * 7;
        b.cone(7 + rand() * 3, mh, "#6a7a96", mx, -0.2, z0 - 22 - rand() * 6, 6);
        b.cone(3, mh * 0.32, "#f4f8fc", mx, -0.2 + mh * 0.68, z0 - 22, 6);
      }
      // La cheminée de pierre au fond, et son feu
      b.box(1.6, 2.2, 0.5, "#8a8174", x0 + 3.5, 0, z0 + 0.1);
      b.box(1.0, 0.8, 0.52, "#2a201a", x0 + 3.5, 0.2, z0 + 0.12);
      b.box(0.5, 0.2, 0.3, "#f08a24", x0 + 3.5, 0.2, z0 + 0.3);
      const ember = new THREE.PointLight("#ff8a3a", 1.2, 4, 1.8);
      ember.position.set(x0 + 3.5, 0.6, z0 + 0.6);
      root.add(ember);
      ticks.push((c) => (ember.intensity = 1.1 + Math.sin(c * 9) * 0.2 + Math.sin(c * 23) * 0.12));
      // Les skis contre le mur, la luge
      for (let i = 0; i < 2; i++) b.box(0.08, 1.6, 0.03, i ? "#d8402e" : "#2a6ad8", x0 + 6 + i * 0.15, 0, z0 + 0.15);
      break;
    }
    case "train": {
      // La nuit qui défile par les fenêtres, la lune, les villages ; sous l'attelage, les rails
      const land = painted(
        keep,
        120,
        3.2,
        2048,
        (g, w, h) => {
          const sky = g.createLinearGradient(0, 0, 0, h);
          sky.addColorStop(0, "#0a1030");
          sky.addColorStop(1, "#2a3a6a");
          g.fillStyle = sky;
          g.fillRect(0, 0, w, h);
          g.fillStyle = "#fff";
          for (let i = 0; i < 260; i++) g.fillRect(rand() * w, rand() * h * 0.5, 1.5, 1.5);
          g.fillStyle = "#121a2e";
          g.beginPath();
          g.moveTo(0, h);
          for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.62 + Math.sin(x * 0.01) * 10 + Math.sin(x * 0.043) * 6);
          g.lineTo(w, h);
          g.fill();
          for (let i = 0; i < 40; i++) {
            const vx = rand() * w;
            g.fillStyle = "#ffd27a";
            for (let j = 0; j < 4; j++) g.fillRect(vx + j * 7, h * 0.66 + rand() * 6, 3, 3);
          }
        },
        true,
      );
      const tex = (land.material as THREE.MeshBasicMaterial).map!;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(3, 1);
      land.position.set(0, 1.8, z0 - 2.5);
      root.add(land);
      const moon = new THREE.Mesh(
        keep(new THREE.CircleGeometry(0.6, 24)),
        keep(new THREE.MeshBasicMaterial({ color: "#fff6d8", toneMapped: false })),
      );
      moon.position.set(4, 2.8, z0 - 2.4);
      root.add(moon);
      ticks.push((_c, dt) => (tex.offset.x += dt * 0.025));
      // Les rails et les traverses sous le train, qui filent
      const track = painted(keep, 6, 30, 512, (g, w, h) => {
        g.fillStyle = "#3a3028";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#5a4a38";
        for (let y = 0; y < h; y += 40) g.fillRect(0, y, w, 16);
        g.fillStyle = "#9aa0a8";
        g.fillRect(w * 0.3, 0, 8, h);
        g.fillRect(w * 0.7, 0, 8, h);
      });
      track.rotation.x = -Math.PI / 2;
      track.rotation.z = Math.PI / 2;
      track.position.set(0, -0.6, 0);
      const ttex = (track.material as THREE.MeshStandardMaterial).map!;
      ttex.wrapT = THREE.RepeatWrapping;
      ttex.repeat.set(1, 6);
      root.add(track);
      ticks.push((_c, dt) => (ttex.offset.y -= dt * 2.2));
      // Les lampes à abat-jour de la voiture-restaurant
      for (let i = 0; i < 4; i++) {
        const lx = x0 + 2 + i * 4;
        b.box(0.04, 0.4, 0.04, "#c9a35a", lx, 1.6, z0 + 0.2);
        b.sphere(0.13, "#ffd8a0", lx, 2.05, z0 + 0.25, 1, 0.8, 1);
      }
      break;
    }
    case "guinguette": {
      // La rivière qui coule, l'herbe des berges, les saules, les lampions, le petit orchestre
      const river = water(keep, "#5aa888", "#24604a", 120);
      river.mesh.position.y = -0.3;
      root.add(river.mesh);
      ticks.push((c) => river.tick(c));
      for (const side of [-1, 1]) {
        b.box(20, 0.3, H + 14, "#6aa84a", side * (W / 2 + 10 - 1), -0.32, 0);
        for (let i = 0; i < 4; i++) {
          const tx = side * (W / 2 + 1.6 + rand() * 4);
          const tz = (rand() - 0.5) * (H + 4);
          b.cyl(0.14, 0.2, 1.4, "#6a4a2a", tx, 0, tz, 8);
          for (let j = 0; j < 6; j++)
            b.sphere(0.6, "#7ab85a", tx + Math.cos(j) * 0.4, 1.6 + Math.sin(j * 2) * 0.2, tz + Math.sin(j) * 0.4, 1, 1.4, 1);
        }
      }
      garland(b, [x0 + 0.5, 2.0, z0 - 0.3], [x1 - 0.5, 2.0, z0 - 0.3], 16, ["#ff6a5a", "#ffd25a", "#5ab8ff", "#ff9ad8", "#8ae86a"], 0.5);
      garland(b, [x0 + 0.5, 2.0, z1 + 0.3], [x1 - 0.5, 2.0, z1 + 0.3], 16, ["#ffd25a", "#ff6a5a", "#8ae86a", "#5ab8ff"], 0.5);
      // La barque amarrée
      const boat = new THREE.SphereGeometry(0.8, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      boat.scale(1.8, 0.5, 0.7);
      b.put(boat, "#c8583a", 0.5, -0.1, z1 + 2.5);
      break;
    }
    case "banquet": {
      // La salle des fêtes : les fanions, la scène et sa banderole, les ballons
      const flags = ["#e8402e", "#f2c94a", "#3a8ad8", "#5ab84a", "#f4f1ea"];
      for (let row = 0; row < 3; row++) {
        const zz = z0 + 1 + row * 3;
        for (let i = 0; i < 18; i++) {
          const fx = x0 + 0.5 + i * ((W - 1) / 17);
          const tri = new THREE.ConeGeometry(0.13, 0.28, 3);
          tri.rotateZ(Math.PI);
          b.put(tri, flags[(i + row) % 5]!, fx, 2.55 - Math.sin((i / 17) * Math.PI) * 0.35, zz);
        }
      }
      const banner = painted(keep, 4.5, 0.7, 512, (g, w, h) => {
        g.fillStyle = "#8a2a2a";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#f8e0a0";
        g.font = "bold 46px 'Young Serif', serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("Fête du village", w / 2, h / 2 + 2);
      });
      banner.position.set(0, 2.3, z0 + 0.03);
      root.add(banner);
      for (let i = 0; i < 9; i++)
        b.sphere(0.22, flags[i % 5]!, x0 + 1 + rand() * (W - 2), 2.3 + rand() * 0.4, z0 + 0.4 + rand() * 0.6, 1, 1.2, 1);
      break;
    }
  }

  // Autour des cuisines fermées : le sol continue un peu (on ne voit pas le bord du monde)
  if (theme.around === "murs") b.box(W + 8, 0.02, H + 8, "#1a1412", 0, -0.03, 2);
  root.add(
    b.done([
      "#ffe2a8",
      "#ffd27a",
      "#ffcf5a",
      "#ff8a5a",
      "#ffe8a0",
      "#ff6a4a",
      "#ffd8a0",
      "#ff6a5a",
      "#ffd25a",
      "#5ab8ff",
      "#ff9ad8",
      "#8ae86a",
      "#f08a24",
    ]),
  );
  void touch;
  return {
    root,
    update(clock, dt, t) {
      for (const f of ticks) f(clock, dt, t);
    },
    dispose() {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
