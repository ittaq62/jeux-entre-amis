// Les accessoires des six styles (le sac de Ginette, la chaise de Marcel…), ce qui vole dans l'arène et les objets
// qu'on ramasse : des formes simples, assez lisibles pour un écran de téléphone.

import * as THREE from "three";
import type { HabitueId, ItemKind } from "../../../shared/games/culbute/model.ts";

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
  const main = keep(std(color, 0.6));
  const acc = keep(std(accent, 0.5));
  const dark = keep(std(0x2a2a30, 0.5, 0.2));
  switch (style) {
    case "ginette": {
      // Le sac à main : une anse, un sac rebondi, un fermoir doré
      const handle = mesh(keep, new THREE.TorusGeometry(0.11, 0.02, 6, 16, Math.PI), dark, 0, 0.02, 0);
      handle.rotation.z = Math.PI;
      g.add(handle);
      const bag = mesh(keep, new THREE.BoxGeometry(0.34, 0.26, 0.14), main, 0, 0.2, 0);
      g.add(bag);
      g.add(mesh(keep, new THREE.SphereGeometry(0.035, 8, 6), keep(std(0xf2c94c, 0.3, 0.7)), 0, 0.31, 0.07));
      g.add(mesh(keep, new THREE.BoxGeometry(0.36, 0.05, 0.15), acc, 0, 0.3, 0));
      break;
    }
    case "marcel": {
      // La chaise pliante : deux montants, l'assise, le dossier
      for (const side of [-1, 1]) {
        const leg = mesh(keep, new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), dark, side * 0.17, 0.35, 0);
        g.add(leg);
      }
      g.add(mesh(keep, new THREE.BoxGeometry(0.4, 0.05, 0.36), main, 0, 0.32, 0.1));
      g.add(mesh(keep, new THREE.BoxGeometry(0.4, 0.22, 0.04), main, 0, 0.62, 0));
      g.add(mesh(keep, new THREE.BoxGeometry(0.42, 0.04, 0.04), acc, 0, 0.75, 0));
      break;
    }
    case "huguette": {
      // Deux aiguilles à tricoter croisées, et le début d'un tricot
      for (const tilt of [-0.18, 0.18]) {
        const n = mesh(keep, new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), keep(std(0xd8d4cc, 0.3, 0.6)), 0, 0.25, 0);
        n.rotation.z = tilt;
        g.add(n);
        g.add(mesh(keep, new THREE.SphereGeometry(0.03, 8, 6), acc, 0, 0, 0));
      }
      g.add(mesh(keep, new THREE.BoxGeometry(0.2, 0.12, 0.03), main, 0, 0.38, 0));
      break;
    }
    case "raymond": {
      // Une boule de pétanque dans la main
      g.add(mesh(keep, new THREE.SphereGeometry(0.11, 16, 12), keep(std(0xa9b2bc, 0.25, 0.9)), 0, 0.08, 0));
      break;
    }
    case "simone": {
      // L'éventail ouvert : un demi-disque plissé
      const fan = mesh(keep, new THREE.CircleGeometry(0.34, 14, Math.PI * 0.15, Math.PI * 0.7), keep(std(color, 0.6)), 0, 0.02, 0);
      (fan.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      g.add(fan);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * 0.15 + (i / 6) * Math.PI * 0.7;
        const rib = mesh(keep, new THREE.BoxGeometry(0.012, 0.34, 0.012), acc, Math.cos(a) * 0.17, Math.sin(a) * 0.17 + 0.02, 0.005);
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

/** L'accordéon de Lucien : deux caisses, et un soufflet qui s'étire entre les mains */
export interface Accordion {
  group: THREE.Group;
  left: THREE.Mesh;
  right: THREE.Mesh;
  bellows: THREE.Mesh;
}

export function accordionModel(color: string, accent: string, keep: Keep): Accordion {
  const group = new THREE.Group();
  const box = keep(std(color, 0.4));
  const left = mesh(keep, new THREE.BoxGeometry(0.1, 0.36, 0.3), box);
  const right = mesh(keep, new THREE.BoxGeometry(0.1, 0.36, 0.3), box);
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
