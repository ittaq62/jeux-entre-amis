// Moins de choses à dessiner : les pièces immobiles qui partagent une matière deviennent une seule forme. Une
// voiture faite de vingt morceaux ne coûte plus que quelques appels de dessin (ça compte sur téléphone).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

const KEPT = ["position", "normal", "uv"];

/** Une copie de la forme, placée comme le morceau, avec seulement les attributs que toutes partagent */
function placed(m: THREE.Mesh, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(matrix);
  for (const name of Object.keys(g.attributes)) if (!KEPT.includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv)
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position!.count ?? 0) * 2), 2));
  g.clearGroups();
  return g;
}

function fuse(groups: Map<THREE.Material, { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[]>, parent: THREE.Object3D, keep: Keep) {
  for (const [mat, parts] of groups) {
    if (parts.length < 2) continue;
    const geos = parts.map((p) => placed(p.mesh, p.matrix));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(keep(merged), mat);
    mesh.castShadow = parts.some((p) => p.mesh.castShadow);
    mesh.receiveShadow = parts.some((p) => p.mesh.receiveShadow);
    for (const p of parts) p.mesh.removeFromParent();
    parent.add(mesh);
  }
}

/** Les enfants directs de `parent` (sauf ceux de `skip`), regroupés par matière */
export function mergeStatic(parent: THREE.Object3D, keep: Keep, skip: Iterable<THREE.Object3D> = []) {
  const skipped = new Set(skip);
  const groups = new Map<THREE.Material, { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[]>();
  for (const child of [...parent.children]) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || skipped.has(child)) continue;
    if (Array.isArray(child.material) || !child.visible) continue;
    child.updateMatrix();
    const list = groups.get(child.material) ?? [];
    list.push({ mesh: child, matrix: child.matrix.clone() });
    groups.set(child.material, list);
  }
  fuse(groups, parent, keep);
}

/** Tous les morceaux sous `root`, à toute profondeur, regroupés par matière (root doit encore être à sa place d'origine) */
export function mergeDeep(root: THREE.Object3D, keep: Keep) {
  const inverse = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  inverse.copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[]>();
  root.traverse((o) => {
    if (o === root || !(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    if (Array.isArray(o.material) || !o.visible) return;
    const list = groups.get(o.material) ?? [];
    list.push({ mesh: o, matrix: inverse.clone().multiply(o.matrixWorld) });
    groups.set(o.material, list);
  });
  fuse(groups, root, keep);
}
