// Fondre les pièces fixes d'un objet par matière : un soldat ou une arme faits de dizaines de formes ne coûtent plus
// qu'un appel de dessin par matière et par articulation. Les groupes enfants (ce qui bouge : un membre, un chargeur)
// sont fondus chacun de leur côté et gardent leur place. Les matières sans image qui ne diffèrent que par la couleur
// (le pantalon, le ceinturon, les poches…) se fondent aussi : la couleur passe dans les sommets (voir sameLook.ts),
// l'image est la même.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { colorless, lookKey, paintVertices } from "../../lib/sameLook.ts";

/**
 * Les matières blanches à couleurs par sommet, une par façon de rendre : partagées par tous les soldats et toutes les
 * armes, et gardées toute la partie (il n'y en a que quelques dizaines, sans image).
 */
const COLORLESS = new Map<string, THREE.Material>();

/** La façon de rendre d'une matière sans image (null : elle a une image, ou ne se fond qu'avec elle-même) */
function plainKey(m: THREE.Material): string | null {
  for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) return null;
  return lookKey(m);
}

/** Fond les maillages directement sous `parent` (sauf les transparents et ceux marqués `keep`), puis ses sous-groupes */
export function fuse(parent: THREE.Object3D, shadows = true) {
  const groups = new Map<string | THREE.Material, { mats: THREE.Material[]; geos: THREE.BufferGeometry[] }>();
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
      const key = plainKey(c.material) ?? c.material;
      const group = groups.get(key) ?? { mats: [], geos: [] };
      group.mats.push(c.material);
      group.geos.push(geo);
      groups.set(key, group);
      meshes.push(c);
    } else if (!(c instanceof THREE.Mesh) && c.children.length > 0) fuse(c, shadows);
  }
  for (const m of meshes) {
    parent.remove(m);
    m.geometry.dispose();
  }
  for (const [key, { mats, geos: list }] of groups) {
    let mat = mats[0]!;
    const color = (m: THREE.Material) => (m as THREE.MeshStandardMaterial).color;
    if (typeof key === "string" && mats.some((m) => !color(m).equals(color(mat)))) {
      list.forEach((g, i) => paintVertices(g, color(mats[i]!)));
      let shared = COLORLESS.get(key);
      if (!shared) {
        shared = colorless(mat as THREE.MeshStandardMaterial);
        COLORLESS.set(key, shared);
      }
      mat = shared;
    }
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    parent.add(mesh);
  }
}
