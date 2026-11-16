// Les accessoires des six styles (le sac de Ginette, la chaise de Marcel…), ce qui vole dans l'arène et les objets
// qu'on ramasse : des formes simples, assez lisibles pour un écran de téléphone.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { HabitueId, ItemKind } from "../../../shared/games/culbute/model.ts";
import { knitTexture } from "./body.ts";

export type Keep = <T extends { dispose: () => void }>(x: T) => T;

export const std = (color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mesh(keep: Keep, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(keep(geo), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * L'accessoire d'un style, tenu dans la main : la main est à l'origine, l'accessoire part le long de +y (dans le
 * prolongement de l'avant-bras). L'accordéon est à part : il se tend entre les deux mains (voir fighter.ts).
 */
export function propModel(style: HabitueId, color: string, accent: string, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const main = keep(std(color, 0.55));
  const acc = keep(std(accent, 0.5));
  const dark = keep(std(0x2a2a30, 0.5, 0.2));
  const metal = keep(std(0xc4ccd4, 0.28, 0.85));
  const gold = keep(std(0xe2b84a, 0.3, 0.85));
  switch (style) {
    case "ginette": {
      // Le sac à main : une anse de cuir, un sac rebondi aux coins ronds, son rabat et son fermoir doré
      const handle = new THREE.Mesh(
        keep(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(-0.13, 0.13, 0),
              new THREE.Vector3(-0.07, 0.02, 0),
              new THREE.Vector3(0, -0.01, 0),
              new THREE.Vector3(0.07, 0.02, 0),
              new THREE.Vector3(0.13, 0.13, 0),
            ]),
            16,
            0.018,
            6,
          ),
        ),
        dark,
      );
      handle.castShadow = true;
      g.add(handle);
      g.add(mesh(keep, new RoundedBoxGeometry(0.38, 0.28, 0.16, 3, 0.06), main, 0, 0.26, 0));
      const flap = mesh(keep, new RoundedBoxGeometry(0.39, 0.12, 0.17, 2, 0.04), keep(std(shade(color, -0.25), 0.5)), 0, 0.33, 0.004);
      g.add(flap);
      g.add(mesh(keep, new THREE.SphereGeometry(0.03, 10, 8), gold, 0, 0.28, 0.09));
      break;
    }
    case "marcel": {
      // La chaise pliante, tenue par le haut du dossier : tubes de métal, assise et dossier de couleur
      const tube = (a: THREE.Vector3, b: THREE.Vector3) => {
        const d = new THREE.Vector3().subVectors(b, a);
        const t = mesh(keep, new THREE.CylinderGeometry(0.018, 0.018, d.length(), 8), metal);
        t.position.copy(a).add(b).multiplyScalar(0.5);
        t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        g.add(t);
      };
      for (const side of [-1, 1]) {
        const x = side * 0.19;
        tube(new THREE.Vector3(x, -0.02, 0), new THREE.Vector3(x, 0.86, 0));
        tube(new THREE.Vector3(x, 0.42, 0.33), new THREE.Vector3(x, 0.88, -0.08));
        g.add(mesh(keep, new THREE.SphereGeometry(0.026, 8, 6), dark, x, 0.87, 0));
        g.add(mesh(keep, new THREE.SphereGeometry(0.026, 8, 6), dark, x, 0.88, -0.08));
      }
      g.add(mesh(keep, new RoundedBoxGeometry(0.42, 0.24, 0.035, 2, 0.015), main, 0, 0.14, 0));
      g.add(mesh(keep, new RoundedBoxGeometry(0.42, 0.035, 0.38, 2, 0.015), main, 0, 0.42, 0.16));
      g.add(mesh(keep, new THREE.BoxGeometry(0.43, 0.05, 0.04), acc, 0, 0.2, 0.002));
      break;
    }
    case "huguette": {
      // Deux longues aiguilles à tricoter, et l'écharpe en cours qui pend entre elles
      for (const tilt of [-0.16, 0.16]) {
        const n = mesh(keep, new THREE.CylinderGeometry(0.012, 0.012, 0.62, 8), metal, Math.sin(tilt) * 0.3, 0.3, 0);
        n.rotation.z = -tilt;
        g.add(n);
        g.add(mesh(keep, new THREE.SphereGeometry(0.03, 10, 8), acc, -Math.sin(tilt) * 0.0, 0, 0));
      }
      const knit = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, map: keep(knitTexture(color, shade(color, -0.3))) });
      knit.side = THREE.DoubleSide;
      const scarf = mesh(keep, new RoundedBoxGeometry(0.24, 0.26, 0.03, 2, 0.012), keep(knit), 0, 0.36, 0.02);
      scarf.rotation.z = 0.05;
      g.add(scarf);
      break;
    }
    case "raymond": {
      // Une boule de pétanque d'acier, avec ses stries
      g.add(mesh(keep, new THREE.SphereGeometry(0.12, 24, 16), keep(std(0xb6bec8, 0.22, 0.95)), 0, 0.09, 0));
      for (const r of [0, Math.PI / 2]) {
        const groove = mesh(keep, new THREE.TorusGeometry(0.12, 0.006, 6, 32), dark, 0, 0.09, 0);
        groove.rotation.set(Math.PI / 2, r, 0);
        g.add(groove);
      }
      break;
    }
    case "simone": {
      // L'éventail ouvert : un demi-disque plissé, ses brins et son ruban
      const folds = 16;
      const pos: number[] = [];
      for (let i = 0; i < folds; i++) {
        const a0 = Math.PI * 0.12 + (i / folds) * Math.PI * 0.76;
        const a1 = Math.PI * 0.12 + ((i + 1) / folds) * Math.PI * 0.76;
        const z0 = i % 2 === 0 ? 0.02 : -0.02;
        const z1 = -z0;
        const p = (a: number, r: number, z: number) => [Math.cos(a) * r, Math.sin(a) * r + 0.03, z];
        pos.push(...p(a0, 0.07, 0), ...p(a0, 0.38, z0), ...p(a1, 0.38, z1));
        pos.push(...p(a0, 0.07, 0), ...p(a1, 0.38, z1), ...p(a1, 0.07, 0));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const paper = keep(std(color, 0.55));
      paper.side = THREE.DoubleSide;
      g.add(mesh(keep, geo, paper));
      const edge = mesh(keep, new THREE.TorusGeometry(0.38, 0.012, 4, 30, Math.PI * 0.76), acc, 0, 0.03, 0);
      edge.rotation.z = Math.PI * 0.12;
      g.add(edge);
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * 0.12 + (i / 8) * Math.PI * 0.76;
        const rib = mesh(keep, new THREE.BoxGeometry(0.012, 0.36, 0.012), gold, Math.cos(a) * 0.19, Math.sin(a) * 0.19 + 0.03, 0);
        rib.rotation.z = a - Math.PI / 2;
        g.add(rib);
      }
      break;
    }
    case "lucien":
      // L'accordéon se dessine entre les deux mains
      break;
  }
  return g;
}

/** Une couleur un peu plus claire (k > 0) ou plus foncée (k < 0) */
function shade(c: string, k: number): string {
  const col = new THREE.Color(c);
  if (k > 0) col.lerp(new THREE.Color(0xffffff), k);
  else col.multiplyScalar(1 + k);
  return `#${col.getHexString()}`;
}

/** L'accordéon de Lucien : deux caisses, et un soufflet qui s'étire entre les mains */
export interface Accordion {
  group: THREE.Group;
  left: THREE.Mesh;
  right: THREE.Mesh;
  bellows: THREE.Mesh;
}

export function accordionModel(color: string, accent: string, keep: Keep): Accordion {
  const group = new THREE.Group();
  const box = keep(std(color, 0.35));
  const left = mesh(keep, new RoundedBoxGeometry(0.12, 0.4, 0.32, 2, 0.03), box);
  const right = mesh(keep, new RoundedBoxGeometry(0.12, 0.4, 0.32, 2, 0.03), box);
  // Le clavier, sur la caisse de droite ; les boutons des basses, sur celle de gauche
  const keys = document.createElement("canvas");
  keys.width = 16;
  keys.height = 64;
  const kg = keys.getContext("2d")!;
  kg.fillStyle = "#f6f1e6";
  kg.fillRect(0, 0, 16, 64);
  kg.fillStyle = "#1c1c22";
  for (let i = 0; i < 8; i++) kg.fillRect(0, i * 8 + 7, 16, 1);
  for (let i = 0; i < 8; i++) if (i % 7 !== 2 && i % 7 !== 6) kg.fillRect(0, i * 8 + 3, 9, 4);
  const keyTex = keep(new THREE.CanvasTexture(keys));
  keyTex.colorSpace = THREE.SRGBColorSpace;
  const board = mesh(
    keep,
    new THREE.BoxGeometry(0.03, 0.36, 0.08),
    keep(new THREE.MeshStandardMaterial({ map: keyTex, roughness: 0.4 })),
    0.07,
    0,
    0.1,
  );
  right.add(board);
  const pearl = keep(std(0xf6f1e6, 0.3));
  for (let i = 0; i < 6; i++)
    left.add(mesh(keep, new THREE.SphereGeometry(0.018, 8, 6), pearl, -0.065, -0.12 + i * 0.05, 0.08 - (i % 2) * 0.04));
  // Le soufflet : des plis clairs et sombres, le long de x
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 8;
  const g2 = c.getContext("2d")!;
  for (let i = 0; i < 16; i++) {
    g2.fillStyle = i % 2 === 0 ? accent : "#2b2b33";
    g2.fillRect(i * 4, 0, 4, 8);
  }
  const tex = keep(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  const bellows = mesh(keep, new THREE.BoxGeometry(1, 0.32, 0.27), keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })));
  group.add(left, right, bellows);
  return { group, left, right, bellows };
}

/** Une petite note de musique (ce que joue Lucien) */
function noteModel(keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const black = keep(std(0x1c1c22, 0.4));
  const head = mesh(keep, new THREE.SphereGeometry(0.14, 12, 8), black, 0, 0, 0);
  head.scale.set(1.25, 0.9, 0.7);
  g.add(head);
  g.add(mesh(keep, new THREE.BoxGeometry(0.04, 0.5, 0.04), black, 0.15, 0.26, 0));
  g.add(mesh(keep, new THREE.BoxGeometry(0.2, 0.06, 0.04), black, 0.24, 0.5, 0));
  return g;
}

function swirlModel(keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const mat = keep(new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.35 + i * 0.22, 0.04, 6, 20, Math.PI * 1.3)), mat);
    ring.rotation.set(0, Math.PI / 2, i * 0.8);
    g.add(ring);
  }
  return g;
}

/** Ce qui vole : chaque sorte de projectile a sa forme */
export function shotModel(kind: string, keep: Keep): THREE.Object3D {
  const g = new THREE.Group();
  const metal = keep(std(0xa9b2bc, 0.25, 0.9));
  switch (kind) {
    case "boule":
    case "tir":
    case "roulee":
      g.add(mesh(keep, new THREE.SphereGeometry(0.3, 16, 12), metal));
      break;
    case "cles": {
      const gold = keep(std(0xe8c34a, 0.3, 0.8));
      g.add(mesh(keep, new THREE.TorusGeometry(0.12, 0.03, 6, 14), gold));
      g.add(mesh(keep, new THREE.BoxGeometry(0.28, 0.06, 0.03), gold, 0.18, 0, 0));
      break;
    }
    case "poudrier": {
      const p = mesh(keep, new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16), keep(std(0xe86aa6, 0.4)));
      p.rotation.x = Math.PI / 2;
      g.add(p);
      break;
    }
    case "bonbons": {
      const colors = [0xe2483d, 0x3f7fd8, 0xf2c94c];
      colors.forEach((c, i) =>
        g.add(mesh(keep, new THREE.SphereGeometry(0.12, 10, 8), keep(std(c, 0.3)), (i - 1) * 0.15, (i % 2) * 0.1, 0)),
      );
      break;
    }
    case "portemonnaie":
      g.add(mesh(keep, new THREE.BoxGeometry(0.42, 0.3, 0.12), keep(std(0x6d4c2f, 0.6))));
      g.add(mesh(keep, new THREE.BoxGeometry(0.44, 0.05, 0.13), keep(std(0xf2c94c, 0.3, 0.7)), 0, 0.12, 0));
      break;
    case "chaise": {
      const chair = propModel("marcel", "#8a5a3b", "#3f7fd8", keep);
      chair.scale.setScalar(1.3);
      chair.position.y = -0.5;
      g.add(chair);
      break;
    }
    case "pelote":
      g.add(mesh(keep, new THREE.SphereGeometry(0.3, 12, 10), keep(std(0xe86aa6, 0.95))));
      g.add(mesh(keep, new THREE.TorusGeometry(0.3, 0.025, 6, 20), keep(std(0xc2185b, 0.95))));
      break;
    case "lasso":
      g.add(mesh(keep, new THREE.TorusGeometry(0.26, 0.04, 6, 18), keep(std(0xe86aa6, 0.95))));
      break;
    case "souffle":
      g.add(swirlModel(keep));
      break;
    case "note":
      g.add(noteModel(keep));
      break;
    case "tricot":
      g.add(mesh(keep, new THREE.BoxGeometry(0.5, 0.1, 0.4), keep(std(0x8e7cc3, 0.95))));
      break;
    default:
      return itemModel(kind as ItemKind, keep);
  }
  return g;
}

/** Les objets qui tombent dans l'arène */
export function itemModel(kind: ItemKind, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case "tarte": {
      g.add(mesh(keep, new THREE.CylinderGeometry(0.34, 0.28, 0.12, 18), keep(std(0xd59a4a, 0.8)), 0, 0.06, 0));
      const cream = mesh(keep, new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), keep(std(0xfffaf0, 0.6)), 0, 0.11, 0);
      cream.scale.y = 0.6;
      g.add(cream);
      g.add(mesh(keep, new THREE.SphereGeometry(0.06, 8, 6), keep(std(0xd62b3a, 0.4)), 0, 0.3, 0));
      break;
    }
    case "petard": {
      g.add(mesh(keep, new THREE.CylinderGeometry(0.11, 0.11, 0.42, 12), keep(std(0xd6413a, 0.6)), 0, 0.21, 0));
      g.add(mesh(keep, new THREE.CylinderGeometry(0.115, 0.115, 0.06, 12), keep(std(0xf2c94c, 0.5)), 0, 0.3, 0));
      g.add(mesh(keep, new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), keep(std(0x3a2f25, 0.9)), 0, 0.5, 0));
      g.add(mesh(keep, new THREE.SphereGeometry(0.05, 8, 6), keep(new THREE.MeshBasicMaterial({ color: 0xffd25a })), 0, 0.59, 0));
      break;
    }
    case "pot": {
      g.add(mesh(keep, new THREE.CylinderGeometry(0.22, 0.16, 0.34, 14), keep(std(0xc0653a, 0.85)), 0, 0.17, 0));
      g.add(mesh(keep, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), keep(std(0x4a3426, 0.9)), 0, 0.33, 0));
      g.add(mesh(keep, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 5), keep(std(0x3f8f3a, 0.8)), 0, 0.48, 0));
      g.add(mesh(keep, new THREE.SphereGeometry(0.1, 10, 8), keep(std(0xe2483d, 0.5)), 0, 0.64, 0));
      break;
    }
    case "baguette": {
      g.add(mesh(keep, new THREE.CapsuleGeometry(0.07, 0.9, 4, 10), keep(std(0xd8a55a, 0.8)), 0, 0.5, 0));
      for (let i = 0; i < 4; i++) {
        const cut = mesh(keep, new THREE.BoxGeometry(0.1, 0.02, 0.05), keep(std(0xf3d9a4, 0.9)), 0.04, 0.2 + i * 0.2, 0.06);
        cut.rotation.z = 0.6;
        g.add(cut);
      }
      break;
    }
    case "gateau": {
      const slice = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 3, 1, false, 0, Math.PI / 3);
      g.add(mesh(keep, slice, keep(std(0xf3d9a4, 0.8)), 0, 0.12, 0));
      const top = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 3, 1, false, 0, Math.PI / 3);
      g.add(mesh(keep, top, keep(std(0xe86aa6, 0.6)), 0, 0.27, 0));
      g.add(mesh(keep, new THREE.SphereGeometry(0.05, 8, 6), keep(std(0xd62b3a, 0.4)), 0.12, 0.33, 0.05));
      break;
    }
    case "cafe": {
      g.add(mesh(keep, new THREE.CylinderGeometry(0.13, 0.1, 0.18, 14), keep(std(0xf4efe2, 0.4)), 0, 0.09, 0));
      g.add(mesh(keep, new THREE.CylinderGeometry(0.12, 0.12, 0.01, 14), keep(std(0x3b2414, 0.3)), 0, 0.175, 0));
      g.add(mesh(keep, new THREE.TorusGeometry(0.05, 0.015, 6, 12), keep(std(0xf4efe2, 0.4)), 0.15, 0.1, 0));
      g.add(mesh(keep, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), keep(std(0xf4efe2, 0.4)), 0, 0.01, 0));
      break;
    }
  }
  return g;
}
