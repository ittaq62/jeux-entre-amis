// La garde-robe du personnage de profil, en volume, pour que son soldat lui ressemble vraiment : les coiffures et les
// couvre-chefs achetés (melon, casque de chantier, toque, oreilles de chat, hélice, couronne de fleurs, casque audio,
// tricorne, chapeau de sorcier, casque à cornes ; hérisson, couettes, banane, tresses, afro) et sa tenue (chemise,
// marinière, sweat à capuche, collier de fleurs, smoking, armure, cape, grosse écharpe). Des formes simples, à
// l'échelle des têtes de pilote (rayon R), tournées vers +z comme elles.

import * as THREE from "three";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

const std = (keep: Keep, color: THREE.ColorRepresentation, roughness = 0.75, metalness = 0) =>
  keep(new THREE.MeshStandardMaterial({ color, roughness, metalness }));

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, keep?: Keep) {
  const m = new THREE.Mesh(keep ? keep(geo) : geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Ce que la garde-robe change à la tenue « Ma tenue » : la couleur de la veste, un motif */
export function outfitCoat(outfit: string | undefined): { coat?: string; stripes?: [string, string] } {
  switch (outfit) {
    case "chemise":
      return { coat: "#ece8dc" };
    case "mariniere":
      return { stripes: ["#f1eee6", "#1f3560"] };
    case "smoking":
      return { coat: "#18181c" };
    case "armure":
      return { coat: "#9aa1a8" };
    default:
      return {};
  }
}

/** Les coiffures de la garde-robe : de quoi s'ajouter (ou remplacer) la coiffure de base */
export function wearHair(id: string | undefined, R: number, color: string, keep: Keep): THREE.Group | null {
  if (!id) return null;
  const g = new THREE.Group();
  const mat = std(keep, color, 0.85);
  switch (id) {
    case "afro":
      // Une grosse boule de cheveux derrière et au-dessus : le visage reste dégagé
      add(g, new THREE.SphereGeometry(R * 1.32, 16, 12), mat, 0, R * 0.32, -R * 0.45, keep).scale.set(1.05, 0.95, 1);
      break;
    case "couettes":
      for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(R * 0.38, 10, 8), mat, s * R * 1.15, R * 0.15, -R * 0.2, keep);
      add(g, new THREE.SphereGeometry(R * 1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), mat, 0, 0, 0, keep);
      break;
    case "banane": {
      add(g, new THREE.SphereGeometry(R * 1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), mat, 0, 0, 0, keep);
      const roll = add(g, new THREE.CapsuleGeometry(R * 0.32, R * 0.9, 4, 10), mat, 0, R * 0.95, R * 0.45, keep);
      roll.rotation.x = Math.PI / 2 - 0.35;
      break;
    }
    case "epis":
      add(g, new THREE.SphereGeometry(R * 1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), mat, 0, 0, 0, keep);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const spike = add(
          g,
          new THREE.ConeGeometry(R * 0.16, R * 0.62, 5),
          mat,
          Math.cos(a) * R * 0.55,
          R * 1.05,
          Math.sin(a) * R * 0.55,
          keep,
        );
        spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      }
      break;
    case "tresses":
      add(g, new THREE.SphereGeometry(R * 1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), mat, 0, 0, 0, keep);
      for (const s of [-1, 1]) {
        const braid = add(g, new THREE.CapsuleGeometry(R * 0.13, R * 1.4, 4, 8), mat, s * R * 0.75, -R * 0.75, -R * 0.35, keep);
        braid.rotation.z = s * 0.15;
      }
      break;
    default:
      return null;
  }
  return g;
}

/** Les couvre-chefs de la garde-robe */
export function wearHat(id: string | undefined, R: number, keep: Keep): THREE.Group | null {
  if (!id) return null;
  const g = new THREE.Group();
  const top = R * 0.8;
  switch (id) {
    case "melon": {
      const black = std(keep, "#15161a", 0.5);
      add(g, new THREE.SphereGeometry(R * 0.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, top - R * 0.1, 0, keep).scale.y = 0.85;
      add(g, new THREE.CylinderGeometry(R * 1.3, R * 1.3, R * 0.05, 22), black, 0, top - R * 0.08, 0, keep);
      add(g, new THREE.CylinderGeometry(R * 0.91, R * 0.91, R * 0.12, 18, 1, true), std(keep, "#5a2f2a", 0.6), 0, top, 0, keep);
      break;
    }
    case "chantier": {
      const yellow = std(keep, "#f2c230", 0.45);
      add(g, new THREE.SphereGeometry(R * 1.08, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), yellow, 0, R * 0.12, 0, keep);
      const brim = add(g, new THREE.CylinderGeometry(R * 1.2, R * 1.22, R * 0.06, 20), yellow, 0, R * 0.12, R * 0.12, keep);
      brim.scale.z = 1.12;
      add(g, new THREE.BoxGeometry(R * 0.18, R * 0.12, R * 1.9), yellow, 0, R * 1.18, 0, keep);
      break;
    }
    case "toque": {
      const white = std(keep, "#f4f2ec", 0.8);
      add(g, new THREE.CylinderGeometry(R * 0.85, R * 0.8, R * 0.9, 18), white, 0, top + R * 0.35, 0, keep);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(g, new THREE.SphereGeometry(R * 0.5, 10, 8), white, Math.cos(a) * R * 0.45, top + R * 0.95, Math.sin(a) * R * 0.45, keep);
      }
      break;
    }
    case "oreilles-chat": {
      const fur = std(keep, "#2f2a28", 0.9);
      const pink = std(keep, "#f2a6b4", 0.8);
      for (const s of [-1, 1]) {
        const ear = add(g, new THREE.ConeGeometry(R * 0.32, R * 0.6, 4), fur, s * R * 0.55, top + R * 0.15, 0, keep);
        ear.rotation.z = -s * 0.35;
        const inner = add(g, new THREE.ConeGeometry(R * 0.18, R * 0.4, 4), pink, s * R * 0.55, top + R * 0.12, R * 0.08, keep);
        inner.rotation.z = -s * 0.35;
      }
      add(g, new THREE.TorusGeometry(R * 0.95, R * 0.05, 6, 20, Math.PI), fur, 0, R * 0.1, 0, keep).rotation.y = Math.PI / 2;
      break;
    }
    case "helice": {
      const red = std(keep, "#d6413a", 0.7);
      const blue = std(keep, "#2f6fd0", 0.7);
      add(g, new THREE.SphereGeometry(R * 1.06, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), red, 0, 0, 0, keep);
      const visor = add(
        g,
        new THREE.CylinderGeometry(R * 0.8, R * 0.8, R * 0.05, 18, 1, false, -Math.PI / 2, Math.PI),
        blue,
        0,
        R * 0.35,
        R * 0.75,
        keep,
      );
      visor.rotation.x = 0.15;
      add(g, new THREE.CylinderGeometry(R * 0.04, R * 0.04, R * 0.3, 6), blue, 0, R * 1.15, 0, keep);
      for (const [c, r] of [
        ["#f2c230", 0],
        ["#2fa864", Math.PI],
      ] as const) {
        const blade = add(g, new THREE.BoxGeometry(R * 0.7, R * 0.03, R * 0.16), std(keep, c, 0.6), 0, R * 1.3, 0, keep);
        blade.geometry.translate(R * 0.35, 0, 0);
        blade.rotation.set(0.15, r, 0);
      }
      break;
    }
    case "couronne-fleurs": {
      add(g, new THREE.TorusGeometry(R * 0.92, R * 0.07, 6, 22), std(keep, "#4f7a3a", 0.8), 0, top - R * 0.05, 0, keep).rotation.x =
        Math.PI / 2;
      const petals = ["#f28fb0", "#ffd75e", "#ffffff", "#ff8a5c", "#c58cf2"];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        add(
          g,
          new THREE.SphereGeometry(R * 0.13, 8, 6),
          std(keep, petals[i % petals.length]!, 0.7),
          Math.cos(a) * R * 0.92,
          top,
          Math.sin(a) * R * 0.92,
          keep,
        );
      }
      break;
    }
    case "casque-audio": {
      const dark = std(keep, "#202226", 0.45, 0.3);
      add(g, new THREE.TorusGeometry(R * 1.05, R * 0.07, 8, 20, Math.PI), dark, 0, 0, 0, keep);
      for (const s of [-1, 1])
        add(g, new THREE.CylinderGeometry(R * 0.32, R * 0.32, R * 0.2, 14), dark, s * R * 1.02, -R * 0.05, 0, keep).rotation.z =
          Math.PI / 2;
      break;
    }
    case "tricorne": {
      const black = std(keep, "#1d1b1a", 0.7);
      const brim = add(g, new THREE.CylinderGeometry(R * 1.4, R * 1.4, R * 0.08, 3), black, 0, top - R * 0.05, 0, keep);
      brim.rotation.y = Math.PI / 6;
      add(g, new THREE.SphereGeometry(R * 0.82, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, top - R * 0.05, 0, keep);
      add(g, new THREE.TorusGeometry(R * 1.2, R * 0.04, 4, 3), std(keep, "#d9b45a", 0.4, 0.6), 0, top - R * 0.02, 0, keep).rotation.set(
        Math.PI / 2,
        0,
        Math.PI / 6,
      );
      break;
    }
    case "sorcier": {
      const purple = std(keep, "#4b2a7a", 0.75);
      add(g, new THREE.CylinderGeometry(R * 1.45, R * 1.45, R * 0.05, 24), purple, 0, top - R * 0.08, 0, keep);
      const cone = add(g, new THREE.ConeGeometry(R * 0.85, R * 2.2, 18), purple, 0, top + R * 1.0, 0, keep);
      cone.rotation.z = 0.12;
      add(
        g,
        new THREE.CylinderGeometry(R * 0.86, R * 0.86, R * 0.14, 18, 1, true),
        std(keep, "#f2c230", 0.4, 0.5),
        0,
        top + R * 0.02,
        0,
        keep,
      );
      break;
    }
    case "viking": {
      const steel = std(keep, "#8e9399", 0.4, 0.7);
      const horn = std(keep, "#efe6cf", 0.6);
      add(g, new THREE.SphereGeometry(R * 1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, R * 0.1, 0, keep);
      add(g, new THREE.TorusGeometry(R * 1.1, R * 0.07, 6, 22), steel, 0, R * 0.12, 0, keep).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        const h = add(g, new THREE.ConeGeometry(R * 0.2, R * 0.9, 10), horn, s * R * 1.2, R * 0.75, 0, keep);
        h.rotation.z = -s * 0.75;
      }
      break;
    }
    default:
      return null;
  }
  return g;
}

/** Ce qui s'ajoute au buste dans sa propre tenue : capuche, cape, collier de fleurs, nœud du smoking, épaulières */
export function outfitExtras(id: string | undefined, coat: string, keep: Keep): THREE.Group | null {
  if (!id) return null;
  const g = new THREE.Group();
  switch (id) {
    case "capuche": {
      const hood = add(
        g,
        new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        std(keep, coat, 0.9),
        0,
        0.52,
        0.12,
        keep,
      );
      hood.rotation.x = -1.3;
      hood.scale.set(1, 0.6, 1);
      break;
    }
    case "cape": {
      const cape = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(0.46, 0.85, 1, 4)),
        keep(new THREE.MeshStandardMaterial({ color: "#a3242c", roughness: 0.8, side: THREE.DoubleSide })),
      );
      const pos = cape.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.pow(Math.max(0, (0.425 - pos.getY(i)) / 0.85), 1.5) * 0.12);
      cape.geometry.computeVertexNormals();
      cape.position.set(0, 0.12, 0.17);
      g.add(cape);
      add(g, new THREE.TorusGeometry(0.11, 0.025, 6, 14), std(keep, "#d9b45a", 0.35, 0.7), 0, 0.53, -0.02, keep).rotation.x = Math.PI / 2;
      break;
    }
    case "collier-fleurs": {
      const petals = ["#f28fb0", "#ffd75e", "#ffffff", "#ff8a5c", "#c58cf2"];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        add(
          g,
          new THREE.SphereGeometry(0.03, 8, 6),
          std(keep, petals[i % petals.length]!, 0.7),
          Math.cos(a) * 0.12,
          0.49 - Math.max(0, -Math.sin(a)) * 0.06,
          Math.sin(a) * 0.1,
          keep,
        );
      }
      break;
    }
    case "smoking": {
      add(g, new THREE.BoxGeometry(0.1, 0.22, 0.02), std(keep, "#f4f2ec", 0.6), 0, 0.42, -0.135, keep);
      for (const s of [-1, 1]) {
        const bow = add(g, new THREE.ConeGeometry(0.03, 0.06, 4), std(keep, "#111114", 0.4), s * 0.03, 0.51, -0.14, keep);
        bow.rotation.z = (s * Math.PI) / 2;
      }
      break;
    }
    case "armure": {
      const steel = std(keep, "#b4bbc2", 0.3, 0.85);
      for (const s of [-1, 1]) {
        const pad = add(g, new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel, s * 0.21, 0.48, 0, keep);
        pad.scale.set(1, 0.7, 1.1);
      }
      add(g, new THREE.BoxGeometry(0.3, 0.26, 0.04), steel, 0, 0.33, -0.13, keep);
      break;
    }
    case "echarpe": {
      add(g, new THREE.TorusGeometry(0.09, 0.04, 8, 16), std(keep, "#c7463a", 0.95), 0, 0.53, 0, keep).rotation.x = Math.PI / 2;
      add(g, new THREE.BoxGeometry(0.07, 0.24, 0.03), std(keep, "#c7463a", 0.95), 0.06, 0.4, -0.12, keep);
      break;
    }
    default:
      return null;
  }
  return g;
}
