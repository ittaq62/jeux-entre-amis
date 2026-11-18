import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { bake } from "../culbute/scene/decor.ts";
import { fuse } from "../escarmouche/scene/fuse.ts";
import { lookKey } from "./sameLook.ts";

const std = (color: string, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
const box = (m: THREE.Material, x = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), m);
  mesh.position.x = x;
  return mesh;
};
const meshes = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  o.traverse((x) => {
    if (x instanceof THREE.Mesh) out.push(x);
  });
  return out;
};

describe("les matières qui rendent pareil", () => {
  it("ne diffèrent que par la couleur : même signature", () => {
    expect(lookKey(std("#ff0000"))).toBe(lookKey(std("#00ff00")));
    expect(lookKey(std("#ff0000"))).not.toBe(lookKey(std("#ff0000", 0.3)));
    expect(lookKey(new THREE.MeshLambertMaterial({ color: "#fff" }))).not.toBe(lookKey(std("#fff")));
  });

  it("ne se fondent pas avec d'autres si elles sont transparentes, déjà en couleurs par sommet ou porteuses de données", () => {
    expect(lookKey(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 }))).toBeNull();
    expect(lookKey(new THREE.MeshStandardMaterial({ vertexColors: true }))).toBeNull();
    const tagged = std("#fff");
    tagged.userData.flash = true;
    expect(lookKey(tagged)).toBeNull();
    expect(lookKey(new THREE.MeshBasicMaterial())).toBeNull();
  });

  it("une image différente fait une autre façon de rendre", () => {
    const a = std("#fff");
    a.map = new THREE.Texture();
    const b = std("#fff");
    b.map = new THREE.Texture();
    expect(lookKey(a)).not.toBe(lookKey(b));
  });
});

describe("la fonte des pièces d'un soldat (Escarmouche)", () => {
  it("fond les pièces qui ne diffèrent que par la couleur, et garde chaque couleur dans les sommets", () => {
    const g = new THREE.Group();
    g.add(box(std("#ff0000"), 0), box(std("#0000ff"), 1), box(std("#ff0000", 0.2), 2));
    fuse(g);
    const out = meshes(g);
    expect(out).toHaveLength(2);
    const painted = out.find((m) => (m.material as THREE.MeshStandardMaterial).vertexColors)!;
    expect((painted.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff);
    const colors = painted.geometry.getAttribute("color");
    const red = new THREE.Color("#ff0000");
    const blue = new THREE.Color("#0000ff");
    const seen = new Set<string>();
    for (let i = 0; i < colors.count; i++) seen.add(`${colors.getX(i)},${colors.getY(i)},${colors.getZ(i)}`);
    expect(seen).toEqual(new Set([`${red.r},${red.g},${red.b}`, `${blue.r},${blue.g},${blue.b}`]));
  });

  it("une seule couleur : la matière d'origine est gardée telle quelle", () => {
    const m = std("#ff0000");
    const g = new THREE.Group();
    g.add(box(m, 0), box(m, 1));
    fuse(g);
    const out = meshes(g);
    expect(out).toHaveLength(1);
    expect(out[0]!.material).toBe(m);
  });
});

describe("le décor cuit d'une arène (Culbute)", () => {
  it("fond les pièces de même rendu, mais laisse à part ce qui porte des données (une lanterne qui vacille)", () => {
    const root = new THREE.Group();
    const lamp = box(std("#ffee00"), 5);
    lamp.userData.flicker = 1;
    root.add(box(std("#ff0000"), 0), box(std("#00ff00"), 1), box(std("#0000ff"), 2), lamp);
    bake(root, (x) => x);
    const out = meshes(root);
    expect(out).toHaveLength(2);
    expect(out).toContain(lamp);
  });
});
