// Le bâtiment fantôme qui suit la souris en Builder : à chaque case visée, un nouveau modèle. L'ancien doit être libéré,
// sinon la mémoire graphique grossit de quelques modèles à chaque mouvement de souris pendant tout le chantier.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

// Pas de canvas hors du navigateur : un faux qui accepte tout (les textures ne sont jamais envoyées à une carte graphique ici)
const anything: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 1 : k === "then" ? undefined : anything),
  apply: () => anything,
  set: () => true,
});
beforeAll(() => {
  vi.stubGlobal("document", { createElement: () => anything });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const { BuilderCity } = await import("./builderCity.ts");

const hooks = {
  rise: () => {},
  popIn: () => {},
  remove: () => {},
  dust: () => {},
  lookAt: () => {},
  flag: () => {},
  dirty: () => {},
  now: () => 0,
};

describe("Builder : le bâtiment fantôme", () => {
  it("à chaque case visée, l'ancien fantôme, ses cases colorées et son cadre sont libérés", () => {
    const city = new BuilderCity(hooks);
    const inside = city as unknown as { ghost: { obj: THREE.Object3D } | null; overlay: THREE.Mesh | null; selectFrame: THREE.Mesh | null };
    const freed = new Set<unknown>();
    const geo = vi.spyOn(THREE.BufferGeometry.prototype, "dispose").mockImplementation(function (this: unknown) {
      freed.add(this);
    });
    const mat = vi.spyOn(THREE.Material.prototype, "dispose").mockImplementation(function (this: unknown) {
      freed.add(this);
    });
    const shown: unknown[] = [];
    for (let k = 0; k < 30; k++) {
      city.setPreview({
        cells: [{ cell: 30 * 36 + 30 + (k % 3), tone: "ok" }],
        ghost: { id: 0, kind: "maison", x: 30 + (k % 3), z: 30, rot: 0, square: 39, ok: true, color: "#3a6fd8" },
        selected: { x: 30, z: 30, w: 1, d: 1 },
      });
      inside.ghost!.obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) shown.push((o as THREE.Mesh).geometry);
      });
      shown.push(inside.overlay!.geometry, inside.overlay!.material, inside.selectFrame!.geometry, inside.selectFrame!.material);
    }
    // On lâche le chantier : tout ce qui a été montré est libéré
    city.setPreview(null);
    expect(shown.filter((x) => !freed.has(x))).toEqual([]);
    city.dispose();
    geo.mockRestore();
    mat.mockRestore();
  });
});
