// Deux matières qui ne diffèrent que par leur couleur peuvent n'en faire qu'une : la couleur passe dans les sommets
// (le moteur la multiplie à la matière, devenue blanche, exactement comme il l'aurait multipliée à la couleur de la
// matière), et toutes les pièces se dessinent d'un seul appel au lieu d'un par couleur. L'image est la même ; sur un
// téléphone, chaque appel de dessin évité compte (c'est là que le processeur passe l'essentiel de son temps).

import * as THREE from "three";

/** Ce qui ne compte pas pour dire que deux matières rendent pareil (la couleur, justement, et l'identité) */
const IGNORED = new Set(["uuid", "name", "color", "version", "userData", "_listeners"]);

/**
 * La signature d'une matière sans sa couleur : deux matières de même signature rendent pareil à la couleur près.
 * null : une matière qu'on ne fond pas avec d'autres (déjà en couleurs par sommet, transparente, avec un shader sur
 * mesure, ou avec un réglage qu'on ne sait pas comparer).
 */
export function lookKey(m: THREE.Material): string | null {
  if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial)) return null;
  if (m.vertexColors || m.transparent || Object.keys(m.userData).length > 0) return null;
  const parts: string[] = [m.type];
  const record = m as unknown as Record<string, unknown>;
  for (const k of Object.keys(record).sort()) {
    if (IGNORED.has(k)) continue;
    const v = record[k];
    if (typeof v === "function") return null;
    if (v === null || v === undefined || typeof v !== "object") parts.push(`${k}=${String(v)}`);
    else if ((v as THREE.Color).isColor) parts.push(`${k}=${(v as THREE.Color).getHexString()}`);
    else if ((v as THREE.Texture).isTexture) parts.push(`${k}=${(v as THREE.Texture).uuid}`);
    else if ((v as THREE.Vector2).isVector2 || (v as THREE.Vector3).isVector3 || (v as THREE.Euler).isEuler)
      parts.push(`${k}=${(v as THREE.Vector3).toArray().join(",")}`);
    else if (Array.isArray(v) && v.length === 0) parts.push(`${k}=[]`);
    else if (Object.getPrototypeOf(v) === Object.prototype) parts.push(`${k}=${JSON.stringify(v)}`);
    else return null;
  }
  return parts.join("|");
}

/** La même matière, blanche, qui prend sa couleur dans les sommets */
export function colorless(m: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial) {
  const out = m.clone();
  out.color.set(0xffffff);
  out.vertexColors = true;
  return out;
}

/** Porte la couleur d'une matière dans les sommets d'une forme (en valeurs linéaires, comme la couleur d'une matière) */
export function paintVertices(geo: THREE.BufferGeometry, color: THREE.Color) {
  const n = geo.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
}
