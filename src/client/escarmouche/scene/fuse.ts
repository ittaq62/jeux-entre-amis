// Fondre les pièces fixes d'un objet par matière : un soldat ou une arme faits de dizaines de formes ne coûtent plus
// qu'un appel de dessin par matière et par articulation. Les groupes enfants (ce qui bouge : un membre, un chargeur)
// sont fondus chacun de leur côté et gardent leur place.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Fond les maillages directement sous `parent` (sauf les transparents et ceux marqués `keep`), puis ses sous-groupes */
export function fuse(parent: THREE.Object3D, shadows = true) {
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const meshes: THREE.Mesh[] = [];
  for (const c of [...parent.children]) {
    if (c instanceof THREE.Mesh && !Array.isArray(c.material) && !c.material.transparent && !c.userData.keep) {
      c.updateMatrix();
      const geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
      geo.applyMatrix4(c.matrix);
      for (const name of Object.keys(geo.attributes))
        if (name !== "position" && name !== "normal" && name !== "uv") geo.deleteAttribute(name);
      if (!geo.attributes.uv)
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position!.count * 2), 2));
      const list = groups.get(c.material) ?? [];
      list.push(geo);
      groups.set(c.material, list);
      meshes.push(c);
    } else if (!(c instanceof THREE.Mesh) && c.children.length > 0) fuse(c, shadows);
  }
  for (const m of meshes) {
    parent.remove(m);
    m.geometry.dispose();
  }
  for (const [mat, list] of groups) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    parent.add(mesh);
  }
}
