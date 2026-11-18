// Les objets lancés, ramassés et posés de Culbute : des centaines par combat. Leurs géométries et matières ne doivent pas
// s'entasser jusqu'à la fin de la scène (qui survit aux revanches quand les combattants et l'arène ne changent pas).
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ITEM_KINDS } from "../../../shared/games/culbute/model.ts";
import { CulbuteScene } from "./CulbuteScene.ts";

type Inside = {
  scene: THREE.Scene;
  keepList: { dispose: () => void }[];
  keep: <T extends { dispose: () => void }>(x: T) => T;
  syncShots(frame: unknown, dt: number): void;
  syncItems(frame: unknown): void;
  syncTraps(frame: unknown): void;
};

/** Une scène sans carte graphique : seulement ce que les objets utilisent */
function bareScene(): Inside {
  const sc = Object.create(CulbuteScene.prototype) as Inside & Record<string, unknown>;
  Object.assign(sc, {
    scene: new THREE.Scene(),
    shots: new Map(),
    items: new Map(),
    traps: new Map(),
    protos: new Map(),
    keepList: [],
    lasso: new THREE.Mesh(),
    seen: new Set(),
    tmpA: new THREE.Vector3(),
    tmpB: new THREE.Vector3(),
    time: 0,
  });
  sc.keep = (x) => {
    sc.keepList.push(x);
    return x;
  };
  return sc;
}

describe("Culbute : les objets de la scène", () => {
  it("trois cents tirs, objets et pièges : ce que la scène garde ne grossit pas avec eux", () => {
    const sc = bareScene();
    const shot = (id: number) => ({ id, kind: "tarte", x: 0, y: 0, vx: 1, vy: 0, owner: 0, t: 0 });
    for (let id = 0; id < 300; id++) {
      sc.syncShots({ shots: [shot(id)], fighters: [] }, 0.016);
      sc.syncItems({ items: [{ id, kind: ITEM_KINDS[id % ITEM_KINDS.length]!, x: 0, y: 0, ground: true }] });
      sc.syncTraps({ traps: [{ id, x: 0, y: 0, owner: 0 }] });
    }
    sc.syncShots({ shots: [], fighters: [] }, 0.016);
    sc.syncItems({ items: [] });
    sc.syncTraps({ traps: [] });
    expect(sc.scene.children).toHaveLength(0);
    expect(sc.keepList.length).toBeLessThan(150);
  });
});
