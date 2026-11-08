// Ce qui vit sur la piste : les pièces dorées qui tournent (et disparaissent quand on les prend), et les engins qui
// traversent la route à leur passage (chariot élévateur au port, tracteur et sa remorque de raisin aux vignes,
// chasse-neige au col), avec leur gyrophare, le passage peint au sol et les panneaux qui préviennent.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { crosserAt, pointAt, type Theme, type Track } from "../../../shared/games/bolides/track.ts";
import { mergeStatic } from "./merge.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;

const std = (color: THREE.ColorRepresentation, roughness = 0.6, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Les pièces de la piste, toutes en une seule forme répétée */
export class CoinField {
  readonly mesh: THREE.InstancedMesh;
  private scale: number[];
  private shown: boolean[];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private t: Track,
    keep: Keep,
  ) {
    // Une pièce : un disque doré épais, debout, avec un liseré en relief
    const body = new THREE.CylinderGeometry(0.72, 0.72, 0.16, 24);
    body.rotateX(Math.PI / 2);
    const rim = new THREE.TorusGeometry(0.66, 0.08, 6, 24);
    const geo = keep(mergeGeometries([body, rim], false)!);
    body.dispose();
    rim.dispose();
    // Brillante même de loin : un peu de lumière propre ; une étoile frappée au milieu, pour qu'on la reconnaisse
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(52, 48, 6, 64, 64, 66);
    grad.addColorStop(0, "#fff0a0");
    grad.addColorStop(0.6, "#ffcc3a");
    grad.addColorStop(1, "#d9931a");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const star = (cx: number, cy: number, r: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const rad = k % 2 === 0 ? r : r * 0.46;
        g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      g.closePath();
      g.fill();
    };
    star(66, 67, 40, "#b5700f");
    star(64, 64, 38, "#fff4b8");
    g.strokeStyle = "#b5700f";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(64, 64, 57, 0, Math.PI * 2);
    g.stroke();
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = keep(
      new THREE.MeshStandardMaterial({ map: tex, emissive: 0x9a6400, emissiveIntensity: 0.4, roughness: 0.34, metalness: 0.35 }),
    );
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, t.coins.length));
    this.mesh.count = t.coins.length;
    this.scale = t.coins.map(() => 1);
    this.shown = t.coins.map(() => true);
    this.mesh.frustumCulled = false;
  }

  /** Celles qui sont là (les autres rétrécissent puis reviennent en grandissant) */
  set(available: (i: number) => boolean) {
    for (let i = 0; i < this.shown.length; i++) this.shown[i] = available(i);
  }

  update(time: number, dt: number) {
    const coins = this.t.coins;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i]!;
      const target = this.shown[i] ? 1 : 0;
      this.scale[i]! += (target - this.scale[i]!) * Math.min(1, dt * (target ? 4 : 18));
      const sc = Math.max(0.001, this.scale[i]!);
      const y = pointAt(this.t, c.s, c.d).y + 1.15 + Math.sin(time * 2.5 + i * 0.7) * 0.12 + (1 - sc) * 0.8;
      this.q.setFromAxisAngle(this.up, time * 3 + i * 0.5);
      this.mesh.setMatrixAt(i, this.m.compose(this.p.set(c.x, y, c.z), this.q, this.s.setScalar(sc)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Un engin, selon le décor ; son avant regarde vers +z, ses roues touchent y = 0 */
function vehicle(theme: Theme, keep: Keep, shadows: boolean): { group: THREE.Group; beacon: THREE.Mesh } {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = shadows;
    g.add(m);
    return m;
  };
  const tyre = keep(std(0x1c1c1f, 0.9));
  const dark = keep(std(0x2a2d33, 0.6));
  const glass = keep(
    new THREE.MeshStandardMaterial({ color: 0x9ecbe6, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55 }),
  );
  const wheel = (x: number, z: number, r: number, w: number) => {
    const geo = new THREE.CylinderGeometry(r, r, w, 14);
    geo.rotateZ(Math.PI / 2);
    add(geo, tyre, x, r, z);
  };
  let beaconY = 2.6;
  if (theme === "port") {
    // Le chariot élévateur : jaune, sa cabine grillagée, son mât et ses fourches chargées de caisses
    const yellow = keep(std(0xf2b51c, 0.45));
    add(new RoundedBoxGeometry(1.7, 0.9, 2.4, 2, 0.12), yellow, 0, 0.9, -0.2);
    add(new RoundedBoxGeometry(1.5, 0.7, 0.8, 2, 0.1), dark, 0, 1.05, -1.25);
    for (const [x, z] of [
      [-0.7, -0.6],
      [0.7, -0.6],
      [-0.7, 0.55],
      [0.7, 0.55],
    ] as const)
      add(new THREE.BoxGeometry(0.08, 1.3, 0.08), dark, x, 2.0, z);
    add(new THREE.BoxGeometry(1.6, 0.08, 1.3), yellow, 0, 2.66, 0);
    add(new THREE.BoxGeometry(0.5, 0.5, 0.4), dark, 0, 1.55, -0.1);
    for (const x of [-0.45, 0.45]) add(new THREE.BoxGeometry(0.12, 2.6, 0.14), dark, x, 1.6, 1.15);
    for (const x of [-0.35, 0.35]) add(new THREE.BoxGeometry(0.14, 0.06, 1.2), dark, x, 0.45, 1.75);
    const wood = keep(std(0xa8743e, 0.85));
    add(new THREE.BoxGeometry(1.2, 0.14, 1.1), wood, 0, 0.55, 1.8);
    const crate = keep(std(0xc98b4a, 0.8));
    add(new THREE.BoxGeometry(1.1, 0.7, 1.0), crate, 0, 0.98, 1.8);
    add(new THREE.BoxGeometry(0.9, 0.55, 0.8), keep(std(0x3f7fb5, 0.7)), 0.05, 1.6, 1.8);
    wheel(-0.8, 0.7, 0.36, 0.3);
    wheel(0.8, 0.7, 0.36, 0.3);
    wheel(-0.78, -0.9, 0.3, 0.26);
    wheel(0.78, -0.9, 0.3, 0.26);
    beaconY = 2.8;
  } else if (theme === "vignes") {
    // Le tracteur rouge et sa remorque pleine de raisin
    const red = keep(std(0xc8302b, 0.45));
    add(new RoundedBoxGeometry(1.2, 0.9, 1.9, 2, 0.15), red, 0, 1.25, 0.9);
    add(new RoundedBoxGeometry(1.5, 0.5, 1.2, 2, 0.1), red, 0, 1.0, -0.4);
    add(new THREE.BoxGeometry(0.06, 1.2, 0.06), dark, -0.55, 2.0, -0.85);
    add(new THREE.BoxGeometry(0.06, 1.2, 0.06), dark, 0.55, 2.0, -0.85);
    add(new THREE.BoxGeometry(0.06, 1.2, 0.06), dark, -0.55, 2.0, 0.05);
    add(new THREE.BoxGeometry(0.06, 1.2, 0.06), dark, 0.55, 2.0, 0.05);
    add(new THREE.BoxGeometry(1.25, 0.08, 1.1), red, 0, 2.62, -0.4);
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 8), dark, 0.35, 2.0, 1.55);
    add(new THREE.BoxGeometry(0.5, 0.4, 0.5), dark, 0, 1.45, -0.4);
    wheel(-0.85, -0.45, 0.75, 0.42);
    wheel(0.85, -0.45, 0.75, 0.42);
    wheel(-0.6, 1.4, 0.42, 0.28);
    wheel(0.6, 1.4, 0.42, 0.28);
    // Des cagettes de raisin sur le plateau arrière
    const wood = keep(std(0x8a5a33, 0.85));
    add(new THREE.BoxGeometry(1.5, 0.12, 0.9), wood, 0, 1.3, -1.45);
    const grapes = keep(std(0x5b2a6b, 0.7));
    for (const x of [-0.4, 0.4]) {
      add(new THREE.BoxGeometry(0.62, 0.36, 0.7), wood, x, 1.55, -1.45);
      add(new THREE.SphereGeometry(0.3, 10, 8), grapes, x, 1.78, -1.45);
    }
    beaconY = 2.75;
  } else {
    // Le chasse-neige orange : sa cabine vitrée, sa grosse lame en biais devant
    const orange = keep(std(0xf07a1a, 0.45));
    add(new RoundedBoxGeometry(2.0, 1.4, 1.4, 2, 0.15), orange, 0, 1.55, 0.6);
    add(new RoundedBoxGeometry(1.9, 0.75, 1.1, 2, 0.08), glass, 0, 2.55, 0.55);
    add(new RoundedBoxGeometry(2.1, 1.0, 1.9, 2, 0.12), orange, 0, 1.35, -1.15);
    add(new THREE.BoxGeometry(2.0, 0.25, 1.8), keep(std(0xf4f7fa, 0.9)), 0, 1.95, -1.15);
    const blade = add(new THREE.BoxGeometry(2.6, 0.9, 0.16), keep(std(0x3b3f46, 0.5, 0.4)), 0, 0.6, 1.75);
    blade.rotation.y = 0.32;
    blade.rotation.x = -0.2;
    wheel(-1.0, 0.7, 0.55, 0.4);
    wheel(1.0, 0.7, 0.55, 0.4);
    wheel(-1.0, -1.5, 0.55, 0.4);
    wheel(1.0, -1.5, 0.55, 0.4);
    beaconY = 3.05;
  }
  // Le gyrophare : il clignote (sa lumière propre s'allume et s'éteint)
  const beacon = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 12)),
    keep(new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0xff7a00, emissiveIntensity: 1, roughness: 0.3 })),
  );
  beacon.position.set(0, beaconY, 0);
  g.add(beacon);
  mergeStatic(g, keep, [beacon]);
  return { group: g, beacon };
}

/** Les engins qui traversent, le passage peint au sol, et les panneaux qui préviennent */
export class Crossers {
  readonly group = new THREE.Group();
  private items: { crosser: Track["crossers"][number]; model: THREE.Group; beacon: THREE.Mesh; heading: number }[] = [];

  constructor(
    private t: Track,
    theme: Theme,
    keep: Keep,
    shadows: boolean,
    heightAt: (x: number, z: number) => number,
  ) {
    const hatch = document.createElement("canvas");
    hatch.width = 128;
    hatch.height = 64;
    const g = hatch.getContext("2d")!;
    g.fillStyle = "#f2c230";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#222";
    for (let x = -64; x < 160; x += 32) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 16, 64);
      g.lineTo(x + 48, 0);
      g.lineTo(x + 32, 0);
      g.fill();
    }
    const hatchTex = keep(new THREE.CanvasTexture(hatch));
    hatchTex.colorSpace = THREE.SRGBColorSpace;
    hatchTex.wrapS = THREE.RepeatWrapping;
    // Le panneau : un triangle rouge et blanc, avec l'engin dessiné dedans
    const sign = document.createElement("canvas");
    sign.width = sign.height = 128;
    const sg = sign.getContext("2d")!;
    sg.fillStyle = "#d8352a";
    sg.beginPath();
    sg.moveTo(64, 6);
    sg.lineTo(122, 116);
    sg.lineTo(6, 116);
    sg.closePath();
    sg.fill();
    sg.fillStyle = "#fff";
    sg.beginPath();
    sg.moveTo(64, 30);
    sg.lineTo(104, 104);
    sg.lineTo(24, 104);
    sg.closePath();
    sg.fill();
    sg.fillStyle = "#222";
    sg.fillRect(44, 72, 40, 16);
    sg.fillRect(52, 60, 18, 14);
    sg.beginPath();
    sg.arc(50, 92, 7, 0, Math.PI * 2);
    sg.arc(78, 92, 7, 0, Math.PI * 2);
    sg.fill();
    const signTex = keep(new THREE.CanvasTexture(sign));
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMat = keep(new THREE.MeshLambertMaterial({ map: signTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    const postMat = keep(new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
    const postGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6));
    const signGeo = keep(new THREE.PlaneGeometry(1.3, 1.3));
    for (const crosser of t.crossers) {
      // Le passage peint en travers de la route
      const p = pointAt(t, crosser.s, 0);
      const width = (t.half + 1.2) * 2;
      hatchTex.repeat.set(width / 4, 1);
      const mark = new THREE.Mesh(keep(new THREE.PlaneGeometry(width, 3.4)), keep(new THREE.MeshLambertMaterial({ map: hatchTex })));
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = Math.atan2(p.tx, p.tz) + Math.PI;
      mark.position.set(p.x, p.y + 0.085, p.z);
      this.group.add(mark);
      // Les panneaux, 40 m avant, des deux côtés, tournés vers ceux qui arrivent
      for (const side of [-1, 1]) {
        const at = pointAt(t, crosser.s - 40, side * (t.half + 2.2));
        const back = pointAt(t, crosser.s - 70, 0);
        const y = heightAt(at.x, at.z);
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(at.x, y + 1.1, at.z);
        this.group.add(post);
        const board = new THREE.Mesh(signGeo, signMat);
        board.position.set(at.x, y + 2.3, at.z);
        board.rotation.y = Math.atan2(back.x - at.x, back.z - at.z);
        this.group.add(board);
      }
      const { group, beacon } = vehicle(theme, keep, shadows);
      this.group.add(group);
      this.items.push({ crosser, model: group, beacon, heading: 0 });
    }
  }

  /** `time` : l'heure du serveur en secondes (le même horaire que la conduite) */
  update(time: number) {
    for (const it of this.items) {
      const pos = crosserAt(it.crosser, time);
      const p = pointAt(this.t, it.crosser.s, pos.d);
      // Il regarde là où il va (à droite de la route quand vd > 0), et garde son cap à l'arrêt
      if (pos.vd !== 0) it.heading = Math.atan2(-p.tz * Math.sign(pos.vd), p.tx * Math.sign(pos.vd));
      it.model.position.set(p.x, p.y + 0.06, p.z);
      it.model.rotation.y = it.heading;
      const on = Math.sin(time * 9) > 0;
      (it.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2.2 : 0.15;
    }
  }
}
