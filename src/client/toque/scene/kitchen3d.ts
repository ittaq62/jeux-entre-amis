// La cuisine en 3D, construite d'après son plan : le sol, les murs, les plans de travail et chaque poste (la caisse et
// ce qu'elle contient, la planche, le feu et sa flamme, le four voûté et sa braise, la friteuse et son huile, l'évier et
// son robinet, l'égouttoir, le passe et sa sonnette, le retour, la poubelle). Ce qui ne bouge pas est fondu en quelques
// formes (peu d'appels de dessin) ; chaque morceau mobile (tables qui glissent, wagon, radeau) a son propre groupe.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Cell, crateGood, walkable, type Kitchen } from "../../../shared/games/toque/kitchens.ts";
import type { FoodKit } from "./food3d.ts";
import { floorTexture, iceTexture, topTexture, wallTexture, type Keep } from "./textures.ts";
import type { Theme } from "./themes.ts";

/** La hauteur des plans de travail */
export const COUNTER_H = 0.58;

/** Le centre d'une case dans la scène (sans le décalage de son morceau mobile) */
export function cellCenter(k: Kitchen, i: number): [number, number] {
  return [(i % k.W) + 0.5 - k.W / 2, Math.floor(i / k.W) + 0.5 - k.H / 2];
}

/** Ce qui s'anime sur un poste */
export interface StationFx {
  cell: number;
  kind: Cell;
  /** La flamme sous la marmite ou la poêle, la braise du four, l'huile qui frémit, l'eau de l'évier */
  flame?: THREE.Mesh;
  glow?: THREE.Mesh;
  oil?: THREE.Mesh;
  water?: THREE.Mesh;
  /** La hauteur où se pose ce qu'on y met */
  seat: number;
  /** Le côté d'où l'on s'en sert (vers le sol voisin) : un angle autour de la verticale */
  face: number;
}

export interface Kitchen3D {
  root: THREE.Group;
  /** Un groupe par morceau de cuisine (0 : immobile), déplacé par la scène */
  sections: THREE.Group[];
  stations: Map<number, StationFx>;
  /** Les bords de ce qu'on voit de la cuisine (pour cadrer la caméra) */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Le côté d'où l'on se sert d'une case : vers sa première voisine où l'on marche (le bas de l'écran d'abord) */
function faceOf(k: Kitchen, i: number): number {
  const x = i % k.W;
  const y = Math.floor(i / k.W);
  const dirs: [number, number, number][] = [
    [0, 1, 0],
    [0, -1, Math.PI],
    [1, 0, Math.PI / 2],
    [-1, 0, -Math.PI / 2],
  ];
  for (const [dx, dy, a] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= k.W || ny >= k.H) continue;
    const j = ny * k.W + nx;
    if (walkable(k.cells[j]!) && k.section[j] === k.section[i]) return a;
  }
  return 0;
}

export function buildKitchen3D(k: Kitchen, theme: Theme, kit: FoodKit, keep: Keep, touch: boolean): Kitchen3D {
  const root = new THREE.Group();
  const sectionCount = Math.max(1, k.moving.length);
  const sections: THREE.Group[] = [];
  for (let s = 0; s < sectionCount; s++) {
    const g = new THREE.Group();
    sections.push(g);
    root.add(g);
  }
  const stations = new Map<number, StationFx>();

  // Les matières
  const floorTex = floorTexture(keep, theme.floor, k.id.length);
  const floorMat = keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78 }));
  const iceMat = keep(new THREE.MeshStandardMaterial({ map: iceTexture(keep), roughness: 0.12, metalness: 0.05 }));
  const topMat = keep(
    new THREE.MeshStandardMaterial({
      map: topTexture(keep, theme.top),
      // Mat : un dessus trop brillant renverrait le soleil en plein dans la caméra (une tache blanche)
      roughness: theme.top === "inox" || theme.top === "zinc" ? 0.55 : theme.top === "marbre" ? 0.42 : 0.68,
      metalness: theme.top === "inox" || theme.top === "zinc" ? 0.35 : 0,
    }),
  );
  const bodyMat = keep(new THREE.MeshStandardMaterial({ color: theme.body, roughness: 0.62 }));
  const darkMat = keep(new THREE.MeshStandardMaterial({ color: "#1c1c20", roughness: 0.55 }));
  const steelMat = keep(new THREE.MeshStandardMaterial({ color: "#b8bec6", roughness: 0.42, metalness: 0.7 }));
  const brassMat = keep(new THREE.MeshStandardMaterial({ color: "#d4a648", roughness: 0.3, metalness: 0.9 }));
  const woodMat = keep(new THREE.MeshStandardMaterial({ color: "#c08a50", roughness: 0.7 }));
  const crateMat = keep(new THREE.MeshStandardMaterial({ color: "#b98a54", roughness: 0.85 }));
  const brickMat = keep(new THREE.MeshStandardMaterial({ color: "#b0583a", roughness: 0.9 }));

  // Le sol : une plaque par case de sol, fondues par morceau et par matière
  const floors: THREE.BufferGeometry[][] = sections.map(() => []);
  const ices: THREE.BufferGeometry[][] = sections.map(() => []);
  const bodies: THREE.BufferGeometry[][] = sections.map(() => []);
  const tops: THREE.BufferGeometry[][] = sections.map(() => []);
  const darks: THREE.BufferGeometry[][] = sections.map(() => []);
  const steels: THREE.BufferGeometry[][] = sections.map(() => []);
  const woods: THREE.BufferGeometry[][] = sections.map(() => []);
  const crates: THREE.BufferGeometry[][] = sections.map(() => []);
  const bricks: THREE.BufferGeometry[][] = sections.map(() => []);
  const walls: THREE.BufferGeometry[][] = sections.map(() => []);
  const brassTops: THREE.BufferGeometry[][] = sections.map(() => []);
  const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    return geo;
  };
  const bevel = touch ? 1 : 2;
  const box = (w: number, h: number, d: number, r = 0.03) =>
    r > 0 ? new RoundedBoxGeometry(w, h, d, bevel, r) : new THREE.BoxGeometry(w, h, d);

  const minX = -k.W / 2;
  const minZ = -k.H / 2;
  let maxX = k.W / 2;
  for (let s = 1; s < k.moving.length; s++) {
    const m = k.motions[s];
    if (!m) continue;
    for (const mv of m.moves) maxX = Math.max(maxX, k.W / 2 + mv.dx);
  }

  for (let i = 0; i < k.cells.length; i++) {
    const cell = k.cells[i]!;
    const sec = k.section[i]!;
    const [x, z] = cellCenter(k, i);
    // Sous ce qui bouge en glissant sur le sol (les tables), le sol immobile continue
    if (sec > 0 && k.under[i] !== Cell.Void && k.motions[sec]?.ground !== "void") {
      floors[0]!.push(at(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), x, 0, z));
    }
    if (cell === Cell.Void) continue;
    if (walkable(cell)) {
      (cell === Cell.Ice ? ices : floors)[sec]!.push(at(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), x, 0, z));
      continue;
    }
    // Sous chaque meuble, le sol aussi (on le voit entre les meubles)
    if (sec === 0 || k.motions[sec]?.ground === "void") floors[sec]!.push(at(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), x, 0, z));
    const face = faceOf(k, i);
    if (cell === Cell.Wall) {
      walls[sec]!.push(at(box(1, 1.05, 1, 0.02), x, 0.525, z));
      continue;
    }
    const fx: StationFx = { cell: i, kind: cell, seat: COUNTER_H, face };
    stations.set(i, fx);
    const sg = sections[sec]!;
    switch (cell) {
      case Cell.Crate: {
        // La caisse : des lattes, et l'aliment qu'elle contient bien en vue
        crates[sec]!.push(at(box(0.92, 0.46, 0.92, 0.02), x, 0.23, z));
        for (const dz of [-0.2, 0.05, 0.3]) darks[sec]!.push(at(new THREE.BoxGeometry(0.94, 0.012, 0.02), x, 0.33, z + dz - 0.05));
        const good = k.crate[i];
        if (good) {
          const g = crateGood(good);
          const show = new THREE.Group();
          const foodId = "food" in g ? g.food : g.base === "croque" ? "pain" : "patePizza";
          for (let n = 0; n < 3; n++) {
            const one = new THREE.Group();
            kit.food(one, foodId, 0.75);
            one.position.set((n - 1) * 0.24, 0.46, (n % 2) * 0.1 - 0.05);
            one.rotation.y = n * 1.7;
            show.add(one);
          }
          show.position.set(x, 0, z);
          sg.add(show);
        }
        fx.seat = 0.47;
        break;
      }
      case Cell.Trash: {
        const bin = new THREE.Mesh(
          keep(new THREE.CylinderGeometry(0.36, 0.3, 0.6, touch ? 14 : 22)),
          keep(new THREE.MeshStandardMaterial({ color: "#3f5a46", roughness: 0.5, metalness: 0.3 })),
        );
        bin.position.set(x, 0.3, z);
        bin.castShadow = bin.receiveShadow = true;
        sg.add(bin);
        const lid = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.37, 0.37, 0.05, touch ? 14 : 22)), steelMat);
        lid.position.set(x, 0.62, z);
        lid.rotation.x = 0.15;
        sg.add(lid);
        fx.glow = lid;
        fx.seat = 0.65;
        break;
      }
      default: {
        // Le meuble et son dessus
        const isOven = cell === Cell.Oven;
        bodies[sec]!.push(at(box(0.96, COUNTER_H - 0.05, 0.96, 0.03), x, (COUNTER_H - 0.05) / 2, z));
        if (cell !== Cell.Stove && cell !== Cell.Fryer && cell !== Cell.Sink && !isOven)
          tops[sec]!.push(at(box(1.0, 0.05, 1.0, 0.012), x, COUNTER_H - 0.025, z));
        // Le pied du meuble, en retrait et sombre
        darks[sec]!.push(at(new THREE.BoxGeometry(0.9, 0.06, 0.9), x, 0.03, z));
        stationDetail(cell, i, x, z, face, fx, sg, sec);
      }
    }
  }

  function stationDetail(cell: Cell, _i: number, x: number, z: number, face: number, fx: StationFx, sg: THREE.Group, sec: number) {
    // Un point devant le poste (du côté où l'on se tient), et un point au fond
    const fdx = Math.sin(face);
    const fdz = Math.cos(face);
    switch (cell) {
      case Cell.Board: {
        woods[sec]!.push(at(box(0.66, 0.035, 0.5, 0.012), x, COUNTER_H + 0.017, z, face));
        fx.seat = COUNTER_H + 0.035;
        break;
      }
      case Cell.Stove: {
        darks[sec]!.push(at(box(1.0, 0.06, 1.0, 0.012), x, COUNTER_H - 0.03, z));
        // Le brûleur, et sa flamme qui s'allume quand ça cuit
        steels[sec]!.push(at(new THREE.TorusGeometry(0.2, 0.025, 6, 20).rotateX(Math.PI / 2), x, COUNTER_H + 0.005, z));
        // Les boutons sur le devant
        for (const s of [-0.18, 0.18])
          darks[sec]!.push(
            at(
              new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10).rotateX(Math.PI / 2),
              x + fdx * 0.49 + Math.cos(face) * s,
              COUNTER_H - 0.14,
              z + fdz * 0.49 - Math.sin(face) * s,
            ),
          );
        const flame = new THREE.Mesh(
          keep(new THREE.TorusGeometry(0.17, 0.04, 6, 24).rotateX(Math.PI / 2)),
          keep(new THREE.MeshBasicMaterial({ color: "#5aa8ff", transparent: true, opacity: 0.85, toneMapped: false })),
        );
        flame.position.set(x, COUNTER_H + 0.02, z);
        flame.visible = false;
        sg.add(flame);
        fx.flame = flame;
        fx.seat = COUNTER_H + 0.03;
        break;
      }
      case Cell.Oven: {
        // Le four à pizza : une voûte de briques sur le meuble, la gueule tournée vers le cuisinier
        darks[sec]!.push(at(box(1.0, 0.05, 1.0, 0.012), x, COUNTER_H - 0.025, z));
        const dome = new THREE.SphereGeometry(0.46, touch ? 14 : 22, touch ? 8 : 12, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.scale(1, 0.95, 1);
        bricks[sec]!.push(at(dome, x - fdx * 0.04, COUNTER_H, z - fdz * 0.04));
        bricks[sec]!.push(at(new THREE.CylinderGeometry(0.09, 0.1, 0.32, 10), x - fdx * 0.22, COUNTER_H + 0.55, z - fdz * 0.22));
        // La gueule (une arche sombre) et la braise au fond
        const mouth = new THREE.Mesh(keep(new THREE.CircleGeometry(0.24, 18, 0, Math.PI)), darkMat);
        mouth.position.set(x + fdx * 0.43, COUNTER_H + 0.005, z + fdz * 0.43);
        mouth.rotation.y = face;
        sg.add(mouth);
        const glow = new THREE.Mesh(
          keep(new THREE.CircleGeometry(0.2, 16, 0, Math.PI)),
          keep(new THREE.MeshBasicMaterial({ color: "#ff8a3a", transparent: true, opacity: 0.0, toneMapped: false })),
        );
        glow.position.set(x + fdx * 0.44, COUNTER_H + 0.01, z + fdz * 0.44);
        glow.rotation.y = face;
        sg.add(glow);
        fx.glow = glow;
        fx.seat = COUNTER_H + 0.005;
        break;
      }
      case Cell.Fryer: {
        steels[sec]!.push(at(box(1.0, 0.05, 1.0, 0.012), x, COUNTER_H - 0.025, z));
        darks[sec]!.push(at(new THREE.BoxGeometry(0.7, 0.03, 0.62), x, COUNTER_H + 0.003, z));
        const oil = new THREE.Mesh(
          keep(new THREE.PlaneGeometry(0.64, 0.56).rotateX(-Math.PI / 2)),
          keep(
            new THREE.MeshStandardMaterial({
              color: "#e0a830",
              roughness: 0.15,
              metalness: 0.1,
              emissive: "#6a3a08",
              emissiveIntensity: 0.2,
            }),
          ),
        );
        oil.position.set(x, COUNTER_H + 0.02, z);
        oil.rotation.y = face;
        sg.add(oil);
        fx.oil = oil;
        // La poignée du panier
        steels[sec]!.push(at(new THREE.BoxGeometry(0.04, 0.04, 0.3), x + fdx * 0.32, COUNTER_H + 0.06, z + fdz * 0.32, face));
        fx.seat = COUNTER_H + 0.0;
        break;
      }
      case Cell.Sink: {
        steels[sec]!.push(at(box(1.0, 0.05, 1.0, 0.012), x, COUNTER_H - 0.025, z));
        darks[sec]!.push(at(new THREE.BoxGeometry(0.74, 0.02, 0.62), x, COUNTER_H + 0.002, z));
        const water = new THREE.Mesh(
          keep(new THREE.PlaneGeometry(0.7, 0.58).rotateX(-Math.PI / 2)),
          keep(new THREE.MeshStandardMaterial({ color: "#8ec8e0", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7 })),
        );
        water.position.set(x, COUNTER_H + 0.01, z);
        water.rotation.y = face;
        sg.add(water);
        fx.water = water;
        // Le robinet, au fond
        const bx = x - fdx * 0.4;
        const bz = z - fdz * 0.4;
        steels[sec]!.push(at(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 10), bx, COUNTER_H + 0.16, bz));
        steels[sec]!.push(
          at(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 10).rotateX(Math.PI / 2), bx + fdx * 0.1, COUNTER_H + 0.31, bz + fdz * 0.1, 0),
        );
        fx.seat = COUNTER_H + 0.01;
        break;
      }
      case Cell.Rack: {
        // L'égouttoir : un cadre de fil, où les assiettes propres se rangent debout
        for (let n = 0; n < 6; n++) {
          const off = (n - 2.5) * 0.12;
          steels[sec]!.push(
            at(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 5), x + Math.cos(face) * off, COUNTER_H + 0.11, z - Math.sin(face) * off),
          );
        }
        steels[sec]!.push(at(new THREE.BoxGeometry(0.78, 0.02, 0.36), x, COUNTER_H + 0.01, z, face));
        fx.seat = COUNTER_H + 0.02;
        break;
      }
      case Cell.Pass: {
        // Le passe : un dessus de cuivre, la sonnette, et la lampe chauffante au-dessus
        brassTops[sec]!.push(at(box(1.0, 0.05, 1.0, 0.012), x, COUNTER_H + 0.005, z));
        const bell = new THREE.Group();
        const dome = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), brassMat);
        const foot = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14)), darkMat);
        const knob = new THREE.Mesh(keep(new THREE.SphereGeometry(0.018, 8, 6)), brassMat);
        knob.position.y = 0.075;
        bell.add(dome, foot, knob);
        bell.position.set(x - fdx * 0.32 + Math.cos(face) * 0.3, COUNTER_H + 0.04, z - fdz * 0.32 - Math.sin(face) * 0.3);
        sg.add(bell);
        fx.glow = dome;
        const lamp = new THREE.Mesh(
          keep(new THREE.ConeGeometry(0.16, 0.16, 14, 1, true)),
          keep(new THREE.MeshStandardMaterial({ color: "#c83a2a", roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide })),
        );
        lamp.position.set(x - fdx * 0.1, COUNTER_H + 0.95, z - fdz * 0.1);
        sg.add(lamp);
        const bulb = new THREE.Mesh(
          keep(new THREE.SphereGeometry(0.06, 10, 8)),
          keep(new THREE.MeshBasicMaterial({ color: "#ffb060", toneMapped: false })),
        );
        bulb.position.set(x - fdx * 0.1, COUNTER_H + 0.88, z - fdz * 0.1);
        sg.add(bulb);
        steels[sec]!.push(at(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 5), x - fdx * 0.1, COUNTER_H + 1.3, z - fdz * 0.1));
        fx.seat = COUNTER_H + 0.03;
        break;
      }
      case Cell.Return: {
        // Le retour : un passe-plat sombre où reviennent les assiettes
        darks[sec]!.push(at(box(0.8, 0.02, 0.8, 0.01), x, COUNTER_H + 0.0, z));
        steels[sec]!.push(at(new THREE.BoxGeometry(0.86, 0.4, 0.04), x - fdx * 0.44, COUNTER_H + 0.2, z - fdz * 0.44, face));
        fx.seat = COUNTER_H + 0.012;
        break;
      }
    }
  }
  // On fond tout ce qui ne bouge pas, par morceau et par matière
  const fused = (list: THREE.BufferGeometry[][], mat: THREE.Material, shadows: [boolean, boolean]) => {
    list.forEach((geos, s) => {
      if (geos.length === 0) return;
      const norm = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      for (const g of norm) {
        if (!g.getAttribute("uv"))
          g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
        g.deleteAttribute("uv1");
      }
      const merged = mergeGeometries(norm, false);
      for (const g of geos) g.dispose();
      for (const g of norm) g.dispose();
      if (!merged) return;
      keep(merged);
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = shadows[0];
      m.receiveShadow = shadows[1];
      sections[s]!.add(m);
    });
  };
  // Le sol : chaque case reprend la texture entière (une case = un motif)
  fused(floors, floorMat, [false, true]);
  fused(ices, iceMat, [false, true]);
  fused(bodies, bodyMat, [true, true]);
  fused(tops, topMat, [true, true]);
  fused(darks, darkMat, [true, true]);
  fused(steels, steelMat, [true, true]);
  fused(woods, woodMat, [true, true]);
  fused(crates, crateMat, [true, true]);
  fused(bricks, brickMat, [true, true]);
  fused(brassTops, keep(new THREE.MeshStandardMaterial({ color: "#c89a50", roughness: 0.35, metalness: 0.8 })), [true, true]);
  if (walls.some((w) => w.length > 0)) {
    const wallMat = keep(new THREE.MeshStandardMaterial({ color: theme.wall ? "#d8cfc0" : "#8a6a48", roughness: 0.8 }));
    fused(walls, wallMat, [true, true]);
  }

  // Les murs du fond et des côtés (les cuisines en plein air n'en ont pas)
  if (theme.wall) {
    const tex = wallTexture(keep, theme.wall);
    tex.wrapS = THREE.RepeatWrapping;
    const backW = maxX - minX + 2;
    const back = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(backW, 2.8)),
      keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })),
    );
    (back.material as THREE.MeshStandardMaterial).map!.repeat.set(backW, 1);
    back.position.set((minX + maxX) / 2, 1.4, minZ - 0.01);
    back.receiveShadow = true;
    root.add(back);
    // Les murs des côtés : bas (une cloison), pour ne rien cacher de la cuisine ; un rebord de bois dessus
    const sideMat = keep(new THREE.MeshStandardMaterial({ color: theme.body, roughness: 0.75 }));
    const trim = keep(new THREE.MeshStandardMaterial({ color: "#5a3a26", roughness: 0.6 }));
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(0.16, 1.0, k.H + 0.16)), sideMat);
      wall.position.set(side < 0 ? minX - 0.08 : maxX + 0.08, 0.5, 0);
      wall.castShadow = wall.receiveShadow = true;
      wall.name = side < 0 ? "mur-gauche" : "mur-droit";
      root.add(wall);
      const cap = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 0.05, k.H + 0.22)), trim);
      cap.position.set(side < 0 ? minX - 0.08 : maxX + 0.08, 1.02, 0);
      cap.name = wall.name;
      root.add(cap);
    }
  }
  return { root, sections, stations, bounds: { minX, maxX, minZ, maxZ: k.H / 2 } };
}
