// La queue de billard en 3D : un fût tourné (le procédé, la virole, le fût d'érable qui s'épaissit, le joint, l'avant-
// talon et ses pointes, la poignée, le talon) habillé selon la queue du joueur. On la pose derrière la blanche, un peu
// relevée, sa pointe face au point de frappe ; elle recule quand on dose la force et part d'un coup sec.

import * as THREE from "three";
import { CUE_PARTS, CUE_STYLES, cueTexture } from "./textures.ts";

export const CUE_LENGTH = 1.47;
/** L'inclinaison de la queue (elle passe au-dessus des bandes) */
export const CUE_TILT = 0.085;

/** Le profil : rayon à chaque hauteur (part de la longueur), de la pointe au talon */
const PROFILE: [number, number][] = [
  [0, 0.0045],
  [0.002, 0.0063],
  [CUE_PARTS.tip, 0.0064],
  [CUE_PARTS.ferrule, 0.0066],
  [0.2, 0.0068],
  [0.4, 0.0085],
  [CUE_PARTS.joint - 0.005, 0.0102],
  [CUE_PARTS.joint + 0.005, 0.0106],
  [CUE_PARTS.forearm, 0.0123],
  [CUE_PARTS.wrapEnd, 0.0138],
  [CUE_PARTS.sleeve, 0.0149],
  [0.997, 0.0148],
  [1, 0.0125],
];

export class CueStick {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private geo: THREE.LatheGeometry;
  private mat: THREE.MeshPhysicalMaterial;
  private map: THREE.Texture | null = null;
  private style = "";
  private up = new THREE.Vector3(0, 1, 0);
  private back = new THREE.Vector3();

  constructor(touch: boolean) {
    const pts = PROFILE.map(([v, r]) => new THREE.Vector2(r, v * CUE_LENGTH));
    this.geo = new THREE.LatheGeometry(pts, touch ? 16 : 24);
    this.mat = new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.castShadow = true;
    this.mesh.userData.reflect = true;
    this.group.add(this.mesh);
    this.group.name = "queue";
    this.setStyle("erable");
  }

  setStyle(style: string) {
    if (style === this.style) return;
    this.style = style;
    this.map?.dispose();
    this.map = cueTexture(style);
    const st = CUE_STYLES[style] ?? CUE_STYLES.erable!;
    this.mat.map = this.map;
    this.mat.emissive.set(st.glow ? "#ffffff" : "#000000");
    this.mat.emissiveMap = st.glow ? this.map : null;
    this.mat.emissiveIntensity = st.glow ? 0.6 : 0;
    this.mat.transparent = Boolean(st.glass);
    this.mat.opacity = st.glass ? 0.72 : 1;
    this.mat.roughness = st.glass ? 0.05 : st.carbon ? 0.4 : 0.32;
    this.mat.needsUpdate = true;
  }

  /**
   * La queue en place : sa pointe en `tip` (monde), dirigée selon `dir` (le sens du coup, à plat, unitaire). La queue
   * part en arrière et un peu vers le haut.
   */
  pose(tip: THREE.Vector3, dirX: number, dirZ: number) {
    const c = Math.cos(CUE_TILT),
      s = Math.sin(CUE_TILT);
    this.back.set(-dirX * c, s, -dirZ * c).normalize();
    this.mesh.quaternion.setFromUnitVectors(this.up, this.back);
    this.mesh.position.copy(tip);
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  get visible() {
    return this.group.visible;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.map?.dispose();
  }
}
