import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { route } from "./people.ts";

const HX = 1.62,
  HZ = 1.06;

/** Le segment ab entre-t-il dans le rectangle (un peu réduit : longer un bord est permis) ? */
function enters(a: THREE.Vector3, b: THREE.Vector3): boolean {
  for (let i = 1; i < 50; i++) {
    const p = a.clone().lerp(b, i / 50);
    if (Math.abs(p.x) < HX - 0.01 && Math.abs(p.z) < HZ - 0.01) return true;
  }
  return false;
}

function check(a: THREE.Vector3, b: THREE.Vector3) {
  const path = route(a, b, HX, HZ);
  expect(path[path.length - 1]!.distanceTo(b)).toBeLessThan(1e-9);
  // Le premier pas peut sortir d'une place collée à la table ; ensuite, plus rien ne traverse
  const aInside = Math.abs(a.x) < HX && Math.abs(a.z) < HZ;
  let from = a;
  path.forEach((p, i) => {
    if (!(i === 0 && aInside)) expect(enters(from, p)).toBe(false);
    from = p;
  });
  return path;
}

describe("le chemin autour de la table", () => {
  it("va tout droit quand rien ne gêne", () => {
    const path = check(new THREE.Vector3(-3, 0, 2), new THREE.Vector3(3, 0, 2));
    expect(path).toHaveLength(1);
  });

  it("passe par un coin pour aller d'un bout à un long côté", () => {
    const path = check(new THREE.Vector3(-2.5, 0, 0), new THREE.Vector3(0.5, 0, 1.6));
    expect(path).toHaveLength(2);
  });

  it("passe par deux coins pour aller d'un long côté à l'autre", () => {
    const path = check(new THREE.Vector3(0.2, 0, -1.8), new THREE.Vector3(-0.3, 0, 1.8));
    expect(path).toHaveLength(3);
    // Par les coins les plus proches (le chemin court), pas en faisant le tour par l'autre bout
    const len = path.reduce((s, p, i) => s + p.distanceTo(i ? path[i - 1]! : new THREE.Vector3(0.2, 0, -1.8)), 0);
    expect(len).toBeLessThan(6.2);
  });

  it("sort d'abord d'une place collée à la table", () => {
    const a = new THREE.Vector3(1.0, 0, 1.0);
    const path = check(a, new THREE.Vector3(1.0, 0, -1.9));
    expect(Math.abs(path[0]!.z) > HZ || Math.abs(path[0]!.x) > HX).toBe(true);
  });
});
