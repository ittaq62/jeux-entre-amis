// Les quatre arènes en 3D : un grand plateau qui flotte, ses plateformes, et un décor derrière (la place et son
// kiosque, l'estrade du bal sous les lampions, les étals du marché, le toit du clocher au-dessus du village).

import * as THREE from "three";
import { ARENAS, type ArenaId, type PlatformNow } from "../../../shared/games/culbute/arenas.ts";
import { std, type Keep } from "./props.ts";

export interface ArenaScene {
  group: THREE.Group;
  /** Les plateformes, dans l'ordre de l'arène : on les déplace quand elles bougent */
  platforms: THREE.Object3D[];
  sky: THREE.Color;
  fog: THREE.Color;
  /** Lumière : jour, soir ou nuit */
  light: { sun: number; sunColor: number; sky: number; ground: number; ambient: number };
  update: (time: number, plats: PlatformNow[]) => void;
}

function box(keep: Keep, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(keep: Keep, r0: number, r1: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(r0, r1, h, seg)), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Une texture dessinée à la main (pavés, planches, toile rayée) */
function canvasTex(keep: Keep, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = keep(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  return t;
}

function cobbles(keep: Keep, base: string, light: string, repeat: [number, number]) {
  return canvasTex(
    keep,
    128,
    128,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          g.fillStyle = (x + y) % 2 === 0 ? light : base;
          const ox = y % 2 === 0 ? 0 : 16;
          g.beginPath();
          g.roundRect((x * 32 + ox) % 128, y * 32 + 2, 28, 28, 7);
          g.fill();
        }
    },
    repeat,
  );
}

function planks(keep: Keep, base: string, line: string, repeat: [number, number]) {
  return canvasTex(
    keep,
    128,
    64,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = line;
      for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 3, 64);
      g.fillRect(0, 31, 128, 2);
    },
    repeat,
  );
}

function stripes(keep: Keep, a: string, b: string) {
  return canvasTex(keep, 64, 8, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 === 0 ? a : b;
      g.fillRect(i * 8, 0, 8, 8);
    }
  });
}

/** Le grand plateau : son dessus, ses flancs, et la motte de terre qui pend dessous */
function mainStage(
  keep: Keep,
  x0: number,
  x1: number,
  y: number,
  bottom: number,
  top: THREE.Material,
  side: THREE.Material,
  earth: number,
) {
  const g = new THREE.Group();
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  g.add(box(keep, w, 0.3, 3.2, top, cx, y - 0.15, 0));
  g.add(box(keep, w, Math.max(0.4, y - 0.3 - bottom), 3, side, cx, (y - 0.3 + bottom) / 2, 0));
  const lump = new THREE.Mesh(keep(new THREE.ConeGeometry(w * 0.42, 2.6, 7)), keep(std(earth, 0.95)));
  lump.rotation.x = Math.PI;
  lump.scale.z = 0.35;
  lump.position.set(cx, bottom - 1.25, -0.2);
  g.add(lump);
  return g;
}

function tree(keep: Keep, x: number, z: number, h: number, leaf: number): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(keep, 0.14, 0.2, h, keep(std(0x6b4a32, 0.9)), 0, h / 2, 0, 8));
  const crown = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(h * 0.42, 0)), keep(std(leaf, 0.9)));
  crown.position.y = h + h * 0.2;
  crown.scale.set(1.2, 0.85, 1);
  g.add(crown);
  g.position.set(x, 0, z);
  return g;
}

function house(keep: Keep, x: number, w: number, h: number, wall: number, roof: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(keep, w, h, 2, keep(std(wall, 0.9)), 0, h / 2, 0));
  const r = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.01, w * 0.62, h * 0.38, 4, 1)), keep(std(roof, 0.8)));
  r.rotation.y = Math.PI / 4;
  r.scale.z = 0.7;
  r.position.y = h + h * 0.19;
  g.add(r);
  const shutter = keep(std(0x3f7fd8, 0.8));
  const glass = keep(std(0x2b3542, 0.3));
  for (let i = 0; i < Math.max(1, Math.floor(w / 1.6)); i++) {
    for (const fy of [h * 0.35, h * 0.72]) {
      const wx = -w / 2 + 0.9 + i * 1.6;
      if (wx > w / 2 - 0.5) continue;
      g.add(box(keep, 0.55, 0.75, 0.05, glass, wx, fy, 1.02));
      g.add(box(keep, 0.22, 0.8, 0.06, shutter, wx - 0.4, fy, 1.03));
      g.add(box(keep, 0.22, 0.8, 0.06, shutter, wx + 0.4, fy, 1.03));
    }
  }
  g.position.set(x, -4, z);
  return g;
}

function cloud(keep: Keep, x: number, y: number, z: number, s: number): THREE.Group {
  const g = new THREE.Group();
  const mat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  for (const [dx, dy, r] of [
    [0, 0, 1],
    [1.1, -0.2, 0.75],
    [-1.1, -0.25, 0.7],
    [0.4, 0.45, 0.65],
  ] as const) {
    const m = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(r * s, 1)), mat);
    m.position.set(dx * s, dy * s, 0);
    g.add(m);
  }
  g.position.set(x, y, z);
  return g;
}

/** Une guirlande de lampions entre deux points */
function garland(keep: Keep, a: THREE.Vector3, b: THREE.Vector3, sag: number, colors: number[]): THREE.Group {
  const g = new THREE.Group();
  const n = 9;
  const wire = keep(std(0x222222, 0.9));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const p = a.clone().lerp(b, k);
    p.y -= Math.sin(k * Math.PI) * sag;
    if (i > 0 && i < n) {
      const lamp = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.2, 10, 8)),
        keep(
          new THREE.MeshStandardMaterial({ color: colors[i % colors.length], emissive: colors[i % colors.length], emissiveIntensity: 0.8 }),
        ),
      );
      lamp.scale.y = 1.25;
      lamp.position.copy(p).add(new THREE.Vector3(0, -0.25, 0));
      g.add(lamp);
    }
    if (i < n) {
      const q = a.clone().lerp(b, (i + 1) / n);
      q.y -= Math.sin(((i + 1) / n) * Math.PI) * sag;
      const seg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.015, 0.015, p.distanceTo(q), 4)), wire);
      seg.position.copy(p).lerp(q, 0.5);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
      g.add(seg);
    }
  }
  return g;
}

/** Une plateforme fine : planche, banc, toit de kiosque… selon l'arène */
function thinPlatform(keep: Keep, w: number, kind: "bench" | "kiosque" | "plank" | "lamps" | "awning" | "van" | "belfry"): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case "bench": {
      const wood = keep(new THREE.MeshStandardMaterial({ map: planks(keep, "#9a6a43", "#6e4a2e", [w / 2, 1]), roughness: 0.85 }));
      g.add(box(keep, w, 0.18, 1.1, wood, 0, -0.09, 0));
      g.add(box(keep, w * 0.95, 0.06, 0.08, keep(std(0x2f3a2f, 0.6, 0.4)), 0, -0.2, 0.5));
      break;
    }
    case "kiosque": {
      const roof = new THREE.Mesh(keep(new THREE.ConeGeometry(w * 0.62, 1.4, 8)), keep(std(0x3d7a5a, 0.6, 0.3)));
      roof.position.y = 0.72;
      g.add(roof);
      g.add(box(keep, w, 0.16, 1.4, keep(std(0xe8e0cc, 0.7)), 0, -0.08, 0));
      g.add(cyl(keep, 0.06, 0.06, 0.5, keep(std(0xf2c94c, 0.3, 0.7)), 0, 1.55, 0, 8));
      break;
    }
    case "plank": {
      const wood = keep(new THREE.MeshStandardMaterial({ map: planks(keep, "#b07a4f", "#7a5233", [w / 2, 1]), roughness: 0.85 }));
      g.add(box(keep, w, 0.2, 1.2, wood, 0, -0.1, 0));
      const rope = keep(std(0xd8c7a0, 0.9));
      for (const side of [-1, 1]) g.add(cyl(keep, 0.025, 0.025, 8, rope, side * (w / 2 - 0.2), 4, 0, 4));
      break;
    }
    case "lamps": {
      g.add(box(keep, w, 0.18, 1.0, keep(std(0x8a3b2e, 0.7)), 0, -0.09, 0));
      g.add(
        garland(keep, new THREE.Vector3(-w / 2, -0.15, 0.55), new THREE.Vector3(w / 2, -0.15, 0.55), 0.3, [0xe2483d, 0xf2c94c, 0x3f7fd8]),
      );
      const rope = keep(std(0xd8c7a0, 0.9));
      g.add(cyl(keep, 0.025, 0.025, 8, rope, 0, 4, 0, 4));
      break;
    }
    case "awning": {
      const canvas = keep(
        new THREE.MeshStandardMaterial({ map: stripes(keep, "#e2483d", "#f4efe2"), roughness: 0.9, side: THREE.DoubleSide }),
      );
      const a = box(keep, w, 0.12, 1.6, canvas, 0, -0.06, 0);
      a.rotation.x = 0.12;
      g.add(a);
      const frill = keep(std(0xe2483d, 0.9));
      for (let i = 0; i < Math.floor(w / 0.4); i++) {
        const c = new THREE.Mesh(keep(new THREE.ConeGeometry(0.18, 0.25, 3)), frill);
        c.rotation.x = Math.PI;
        c.position.set(-w / 2 + 0.2 + i * 0.4, -0.2, 0.8);
        g.add(c);
      }
      const pole = keep(std(0x5d4037, 0.8));
      for (const side of [-1, 1]) g.add(cyl(keep, 0.05, 0.05, 2.1, pole, side * (w / 2 - 0.1), -1.1, 0.7, 6));
      break;
    }
    case "van": {
      g.add(box(keep, w, 0.14, 1.8, keep(std(0xf4efe2, 0.5, 0.2)), 0, -0.07, 0));
      g.add(box(keep, w * 1.02, 3.2, 1.9, keep(std(0x3f7fd8, 0.5, 0.2)), 0, -1.75, -0.2));
      g.add(box(keep, w * 0.7, 0.9, 0.05, keep(std(0xf2c94c, 0.6)), 0, -1.2, 0.77));
      for (const side of [-1, 1]) {
        const wheel = cyl(keep, 0.38, 0.38, 0.3, keep(std(0x1b1b1f, 0.8)), side * (w / 2 - 0.5), -3.3, 0.8, 14);
        wheel.rotation.x = Math.PI / 2;
        g.add(wheel);
      }
      break;
    }
    case "belfry": {
      g.add(box(keep, w, 0.2, 1.4, keep(std(0x5a5f6a, 0.8)), 0, -0.1, 0));
      g.add(box(keep, w * 0.9, 2.8, 1.2, keep(std(0xcfc3a8, 0.9)), 0, -1.6, -0.2));
      const bell = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.25, 0.5, 0.7, 14, 1, true)), keep(std(0xc59a3a, 0.3, 0.8)));
      bell.material.side = THREE.DoubleSide;
      bell.position.set(0, -0.9, 0.42);
      g.add(bell);
      break;
    }
  }
  return g;
}

export function buildArena(id: ArenaId, scale: number, keep: Keep): ArenaScene {
  const def = ARENAS[id];
  const group = new THREE.Group();
  const platforms: THREE.Object3D[] = [];
  const solid = def.platforms[0]!;
  const x0 = solid.x0 * scale;
  const x1 = solid.x1 * scale;
  let sky = new THREE.Color(0x9fd3f2);
  let fog = new THREE.Color(0xcfe8f5);
  let light = { sun: 2.1, sunColor: 0xfff1d6, sky: 0xd6ecff, ground: 0x8a7a5a, ambient: 0.55 };
  let update: ArenaScene["update"] = () => {};

  const thin = (i: number, kind: Parameters<typeof thinPlatform>[2]) => {
    const p = def.platforms[i]!;
    const g = thinPlatform(keep, (p.x1 - p.x0) * scale, kind);
    g.position.set(((p.x0 + p.x1) / 2) * scale, p.y, 0);
    group.add(g);
    platforms[i] = g;
  };

  switch (id) {
    case "place": {
      const top = keep(new THREE.MeshStandardMaterial({ map: cobbles(keep, "#9c9384", "#b7ad9b", [(x1 - x0) / 2, 1.5]), roughness: 0.95 }));
      const stage = mainStage(keep, x0, x1, 0, solid.bottom!, top, keep(std(0x8a7d6a, 0.95)), 0x6b5a45);
      group.add(stage);
      platforms[0] = stage;
      thin(1, "bench");
      thin(2, "bench");
      thin(3, "kiosque");
      // Les colonnes du kiosque, derrière
      const iron = keep(std(0x2f4a3a, 0.5, 0.5));
      for (const dx of [-1.4, 1.4]) group.add(cyl(keep, 0.08, 0.08, 5.1, iron, dx, 2.55, -0.9, 8));
      // Les maisons de la place, les platanes, et des nuages
      const walls = [0xe8d8b8, 0xd9b38c, 0xf0e2c8, 0xc9a27e, 0xe6cfa4];
      for (let i = 0; i < 7; i++) group.add(house(keep, -15 + i * 5, 4.4, 7 + (i % 3), walls[i % walls.length]!, 0xb5523b, -9));
      for (let i = 0; i < 6; i++) group.add(tree(keep, -12.5 + i * 5, -5, 4.2 + (i % 2) * 0.6, 0x5f9a46));
      group.add(cloud(keep, -9, 11, -20, 1.6), cloud(keep, 8, 12.5, -22, 2), cloud(keep, 18, 9, -25, 1.4));
      break;
    }
    case "bal": {
      sky = new THREE.Color(0x1d2650);
      fog = new THREE.Color(0x2a3466);
      light = { sun: 1.1, sunColor: 0xffd8a8, sky: 0x6b7dd6, ground: 0x3a2f45, ambient: 0.75 };
      const top = keep(new THREE.MeshStandardMaterial({ map: planks(keep, "#a87048", "#7a4e30", [(x1 - x0) / 2, 1.5]), roughness: 0.85 }));
      const stage = mainStage(keep, x0, x1, 0, solid.bottom!, top, keep(std(0x7b2d2d, 0.8)), 0x3e2f2a);
      group.add(stage);
      platforms[0] = stage;
      thin(1, "plank");
      thin(2, "plank");
      thin(3, "lamps");
      // Les mâts et les guirlandes au-dessus de la piste
      const pole = keep(std(0x4a3a2e, 0.8));
      for (const px of [-9, 9]) group.add(cyl(keep, 0.12, 0.15, 11, pole, px * scale, 3.5, -2.5, 8));
      group.add(
        garland(
          keep,
          new THREE.Vector3(-9 * scale, 8.5, -2.5),
          new THREE.Vector3(9 * scale, 8.5, -2.5),
          1.4,
          [0xe2483d, 0xf4efe2, 0x3f7fd8],
        ),
      );
      group.add(
        garland(keep, new THREE.Vector3(-9 * scale, 7.2, -4), new THREE.Vector3(9 * scale, 7.6, -4), 1.1, [0xf2c94c, 0xe86aa6, 0x2f9e6a]),
      );
      // Les étoiles, et les feux d'artifice de temps en temps
      const stars = new THREE.Group();
      const starMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
      for (let i = 0; i < 70; i++) {
        const s = new THREE.Mesh(keep(new THREE.SphereGeometry(0.05 + (i % 3) * 0.03, 4, 3)), starMat);
        s.position.set(((i * 37) % 80) - 40, 6 + ((i * 53) % 22), -30);
        stars.add(s);
      }
      group.add(stars);
      const bursts: { mesh: THREE.Points; born: number }[] = [];
      const colors = [0xff5a5a, 0xffd25a, 0x6ad1ff, 0xff8ae2, 0x8aff8a];
      let next = 2;
      update = (time) => {
        if (time > next) {
          next = time + 1.6 + ((time * 7.3) % 1.5);
          const geo = keep(new THREE.BufferGeometry());
          const pts: number[] = [];
          for (let k = 0; k < 60; k++) {
            const a = (k / 60) * Math.PI * 2;
            const b = ((k * 7) % 13) / 13 - 0.5;
            pts.push(Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b));
          }
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
          const mat = keep(new THREE.PointsMaterial({ color: colors[Math.floor(time) % colors.length], size: 0.5, transparent: true }));
          const p = new THREE.Points(geo, mat);
          p.position.set(-18 + ((time * 13.7) % 36), 14 + ((time * 3.1) % 6), -26);
          group.add(p);
          bursts.push({ mesh: p, born: time });
        }
        for (let k = bursts.length - 1; k >= 0; k--) {
          const b = bursts[k]!;
          const age = time - b.born;
          b.mesh.scale.setScalar(1 + age * 5);
          (b.mesh.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age / 1.4);
          if (age > 1.4) {
            group.remove(b.mesh);
            bursts.splice(k, 1);
          }
        }
      };
      break;
    }
    case "marche": {
      light = { sun: 2.2, sunColor: 0xffe7c2, sky: 0xdbefff, ground: 0x9a8566, ambient: 0.55 };
      const top = keep(new THREE.MeshStandardMaterial({ map: cobbles(keep, "#b4a58c", "#c9bba0", [(x1 - x0) / 2, 1.5]), roughness: 0.95 }));
      const stage = mainStage(keep, x0, x1, 0, solid.bottom!, top, keep(std(0x9b8b72, 0.95)), 0x6b5a45);
      group.add(stage);
      platforms[0] = stage;
      thin(1, "awning");
      thin(2, "awning");
      thin(3, "van");
      // Les cagettes de légumes au pied des étals
      const crate = keep(std(0xb58a5a, 0.9));
      const veg = [0xe2483d, 0xf2994a, 0x5f9a46, 0x8e44ad];
      for (const cx of [-6.1, -5.2, 5.2, 6.1]) {
        group.add(box(keep, 0.8, 0.45, 0.6, crate, cx * scale, 0.22, -0.9));
        for (let k = 0; k < 3; k++) {
          const v = new THREE.Mesh(keep(new THREE.SphereGeometry(0.14, 8, 6)), keep(std(veg[Math.floor(k + Math.abs(cx)) % 4]!, 0.6)));
          v.position.set(cx * scale - 0.25 + k * 0.25, 0.5, -0.9);
          group.add(v);
        }
      }
      const walls = [0xf0e2c8, 0xe8c49a, 0xd8e2e8, 0xe6cfa4];
      for (let i = 0; i < 8; i++) group.add(house(keep, -18 + i * 5, 4.6, 8 + (i % 2) * 2, walls[i % walls.length]!, 0x8a5a44, -10));
      group.add(cloud(keep, -12, 12, -22, 1.8), cloud(keep, 10, 13, -24, 2.2));
      break;
    }
    case "clocher": {
      sky = new THREE.Color(0xf2a86b);
      fog = new THREE.Color(0xf6c69a);
      light = { sun: 2.4, sunColor: 0xffb070, sky: 0xffd2a6, ground: 0x6a5a6e, ambient: 0.6 };
      const slate = keep(
        new THREE.MeshStandardMaterial({
          map: canvasTex(
            keep,
            64,
            64,
            (g) => {
              g.fillStyle = "#4f5662";
              g.fillRect(0, 0, 64, 64);
              g.fillStyle = "#5e6674";
              for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillRect(x * 16 + (y % 2) * 8, y * 16 + 1, 14, 14);
            },
            [(x1 - x0) / 1.5, 1.5],
          ),
          roughness: 0.6,
        }),
      );
      const stone = keep(std(0xcfc3a8, 0.95));
      const stage = mainStage(keep, x0, x1, 0, solid.bottom!, slate, stone, 0xa89a80);
      group.add(stage);
      platforms[0] = stage;
      thin(1, "belfry");
      // La flèche du clocher au-dessus, l'horloge, et le village tout en bas
      const spire = new THREE.Mesh(keep(new THREE.ConeGeometry(1.4, 4.5, 8)), keep(std(0x4f5662, 0.6)));
      spire.position.set(0, 6.6, -1.2);
      group.add(spire);
      const clock = cyl(keep, 0.9, 0.9, 0.1, keep(std(0xf4efe2, 0.5)), 0, -2.2, 1.55, 24);
      clock.rotation.x = Math.PI / 2;
      group.add(clock);
      const hand = box(keep, 0.08, 0.7, 0.04, keep(std(0x1c1c22, 0.4)), 0, -2.0, 1.62);
      group.add(hand);
      const roofs = [0xb5523b, 0xa8483a, 0xc0653a];
      for (let i = 0; i < 26; i++) {
        const h = house(keep, -40 + ((i * 37) % 80), 2.4, 2.2, 0xe8d8b8, roofs[i % 3]!, -30 - (i % 4) * 4);
        h.position.y = -22 + (i % 3);
        group.add(h);
      }
      for (let i = 0; i < 10; i++) {
        const t = tree(keep, -36 + i * 8, -26, 2.5, 0x6f9a4a);
        t.position.y = -22;
        group.add(t);
      }
      update = (time) => {
        hand.rotation.z = -time * 0.2;
      };
      break;
    }
  }

  const fullUpdate: ArenaScene["update"] = (time, plats) => {
    for (let i = 0; i < def.platforms.length; i++) {
      if (!def.platforms[i]!.move) continue;
      const p = plats[i];
      const m = platforms[i];
      if (p && m) m.position.set((p.x0 + p.x1) / 2, p.y, 0);
    }
    update(time, plats);
  };
  return { group, platforms, sky, fog, light, update: fullUpdate };
}
