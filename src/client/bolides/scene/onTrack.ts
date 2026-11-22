// Ce qui est posé sur la piste ou sur son bord (entre la route et le muret, là où les karts peuvent rouler) : soit on
// le traverse et ça se voit (l'herbe, un tremplin, un trampoline, un anneau de vol, un rayon de lumière), soit c'est un
// obstacle que la conduite connaît (un îlot au milieu de la route), soit ça bouge et la course s'en occupe (ce qui
// traverse, ce qui tombe). Tout le reste du décor reste derrière le muret, qui arrête les karts : un test le vérifie
// sur chaque circuit.

import type * as THREE from "three";

export type OnTrack = "traversable" | "solid" | "moving";

/** Marque un objet (et tout ce qu'il contient) */
export function onTrack<T extends THREE.Object3D>(o: T, kind: OnTrack): T {
  o.userData.onTrack = kind;
  return o;
}

/** Le plus près du milieu de la route qu'un poteau ou un pilier peut se tenir : juste derrière le muret */
export function roadside(wall: number): number {
  return wall + 0.9;
}
