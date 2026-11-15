// Ce qu'on voit d'une partie d'Escarmouche : la carte, le ciel et la brume, les autres soldats, son arme en main
// (dessinée à part, par-dessus, pour ne jamais rentrer dans un mur), les grenades, les drapeaux et la zone.

import * as THREE from "three";
import type { AvatarConfig } from "../../../shared/avatar.ts";
import type { CamoId } from "../../../shared/games/escarmouche/camos.ts";
import type { GameMap } from "../../../shared/games/escarmouche/maps.ts";
import type { WeaponId } from "../../../shared/games/escarmouche/weapons.ts";
import { Effects } from "./effects.ts";
import { buildGrenade, buildGun, buildKnife, type Gun } from "./guns.ts";
import { buildMap, type MapMesh } from "./mapMesh.ts";
import { nameSprite, SoldierModel, type Kit, type SoldierPose } from "./soldiers.ts";
import { skyTexture } from "./textures.ts";

export const TEAM_HEX = ["#d4453c", "#3f7fd8"] as const;

/** Ce que fait son arme en main, pour l'animer */
export interface ViewState {
  weapon: WeaponId;
  camo: CamoId;
  /** De 0 à 1 : l'épaulé */
  ads: number;
  /** De 0 à 1 : en train de recharger (la progression), -1 sinon */
  reload: number;
  /** De 0 à 1 : l'arme qui remonte après un changement */
  raise: number;
  /** Le recul du dernier coup, de 1 à 0 */
  kick: number;
  /** Le pas : phase et ampleur */
  bob: number;
  bobAmp: number;
  /** Ce que la vue vient de tourner (pour le balancement) */
  swayX: number;
  swayY: number;
  sprint: boolean;
  /** Le geste du couteau ou du lancer, de 0 à 1, -1 sinon */
  melee: number;
  throwing: number;
  alive: boolean;
  /** À la lunette du fusil de précision : l'arme disparaît */
  scoped: boolean;
}

export class EscScene {
  private renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private vmScene = new THREE.Scene();
  private vmCam: THREE.PerspectiveCamera;
  private map: MapMesh;
  private sky: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  readonly effects: Effects;
  private soldiers = new Map<number, { model: SoldierModel; name: THREE.Sprite }>();
  private vmRoot = new THREE.Group();
  private vmGun: Gun | null = null;
  private vmKey = "";
  private vmKnife: THREE.Group;
  private vmNade: THREE.Mesh;
  private grenades: THREE.Mesh[] = [];
  private flags: { group: THREE.Group; cloth: THREE.Mesh; stand: THREE.Mesh }[] = [];
  private zone: { ring: THREE.Mesh; wall: THREE.Mesh } | null = null;
  private basePixelRatio: number;
  private resolution = 1;
  private t = 0;
  readonly low: boolean;
  private tmp = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, gm: GameMap, opts: { low: boolean; teams: boolean }) {
    this.low = opts.low;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.low, powerPreference: "high-performance" });
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, opts.low ? 1.25 : 1.75);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = gm.light === "soir" ? 1.05 : 1.15;
    this.renderer.autoClear = false;
    if (!opts.low) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 400);
    this.camera.rotation.order = "YXZ";
    this.vmCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);

    // La lumière : un soleil bas le soir au hameau, un ciel couvert à la gare
    const fogColor = gm.light === "soir" ? "#b9a993" : "#9ea4a6";
    this.scene.fog = new THREE.Fog(fogColor, 45, 190);
    this.scene.background = new THREE.Color(fogColor);
    const hemi = new THREE.HemisphereLight(gm.light === "soir" ? "#cfd8e6" : "#c4cbd1", gm.light === "soir" ? "#5a4a36" : "#4b4a44", 1.1);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(gm.light === "soir" ? "#ffd7a3" : "#e6e9ec", gm.light === "soir" ? 2.2 : 1.4);
    this.sun.position.set(gm.light === "soir" ? -60 : 30, gm.light === "soir" ? 42 : 80, gm.light === "soir" ? 35 : -40);
    if (!opts.low) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const cam = this.sun.shadow.camera;
      const span = Math.max(gm.bounds.x1 - gm.bounds.x0, gm.bounds.z1 - gm.bounds.z0) * 0.62;
      cam.left = -span;
      cam.right = span;
      cam.top = span;
      cam.bottom = -span;
      cam.near = 1;
      cam.far = 220;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Le ciel, qui suit la caméra, et des collines au loin
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(gm.light), side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), skyMat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.addHills(gm);

    this.map = buildMap(gm, opts.low);
    this.scene.add(this.map.group);
    this.effects = new Effects(opts.low);
    this.scene.add(this.effects.group);

    // Les drapeaux et la zone
    for (let t = 0; t < 2; t++) {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), new THREE.MeshLambertMaterial({ color: "#2f2f2f" }));
      pole.position.y = 1.2;
      group.add(pole);
      const cloth = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.55, 6, 2),
        new THREE.MeshLambertMaterial({ color: TEAM_HEX[t], side: THREE.DoubleSide }),
      );
      cloth.position.set(0.45, 2.05, 0);
      group.add(cloth);
      group.visible = false;
      this.scene.add(group);
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1, 0.12, 20),
        new THREE.MeshLambertMaterial({ color: TEAM_HEX[t], emissive: TEAM_HEX[t], emissiveIntensity: 0.25 }),
      );
      stand.visible = false;
      this.scene.add(stand);
      this.flags.push({ group, cloth, stand });
    }
    for (let i = 0; i < 8; i++) {
      const g = buildGrenade();
      g.visible = false;
      this.scene.add(g);
      this.grenades.push(g);
    }

    // L'arme en main, dessinée par-dessus le reste
    this.vmScene.add(new THREE.HemisphereLight("#dfe5ee", "#4d4639", 1.4));
    const vmSun = new THREE.DirectionalLight("#fff1dc", 1.6);
    vmSun.position.set(-1, 2, 1);
    this.vmScene.add(vmSun);
    this.vmScene.add(this.vmRoot);
    this.vmKnife = buildKnife();
    this.vmKnife.visible = false;
    this.vmScene.add(this.vmKnife);
    this.vmNade = buildGrenade();
    this.vmNade.visible = false;
    this.vmScene.add(this.vmNade);
    void opts.teams;
  }

  private addHills(gm: GameMap) {
    const mat = new THREE.MeshLambertMaterial({ color: gm.light === "soir" ? "#6e7262" : "#6d7470", flatShading: true });
    const cx = (gm.bounds.x0 + gm.bounds.x1) / 2;
    const cz = (gm.bounds.z0 + gm.bounds.z1) / 2;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + Math.sin(k * 3.1) * 0.1;
      const r = 150 + Math.sin(k * 7.3) * 20;
      const h = 18 + (Math.sin(k * 5.7) + 1) * 14;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(38 + (k % 3) * 12, h, 6), mat);
      hill.position.set(cx + Math.cos(a) * r, h / 2 - 2, cz + Math.sin(a) * r);
      hill.rotation.y = k;
      this.scene.add(hill);
    }
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCam.aspect = w / h;
    this.vmCam.updateProjectionMatrix();
  }

  /** Moins de pixels quand l'appareil peine */
  setResolution(scale: number) {
    this.resolution = scale;
    this.renderer.setPixelRatio(this.basePixelRatio * scale);
  }

  get pixelScale() {
    return this.resolution;
  }

  setShadows(on: boolean) {
    this.renderer.shadowMap.enabled = on && !this.low;
    this.sun.castShadow = on && !this.low;
  }

  /** La caméra, à ses yeux */
  setView(x: number, y: number, z: number, yaw: number, pitch: number, fov: number, roll = 0) {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(pitch, yaw, roll);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.sky.position.copy(this.camera.position);
    this.camera.updateMatrixWorld();
  }

  /** Un soldat apparaît (ou change d'allure) */
  ensureSoldier(i: number, kit: Kit, avatar: AvatarConfig, camo: CamoId, name: string, nameColor: string) {
    const known = this.soldiers.get(i);
    if (known && known.model.kit.band === kit.band && known.model.kit.uniform === kit.uniform) {
      known.model.setCamo(camo);
      return;
    }
    if (known) this.removeSoldier(i);
    const model = new SoldierModel(kit, avatar, camo, this.low);
    const label = nameSprite(name, nameColor);
    this.scene.add(model.root);
    this.scene.add(label);
    this.soldiers.set(i, { model, name: label });
  }

  removeSoldier(i: number) {
    const s = this.soldiers.get(i);
    if (!s) return;
    this.scene.remove(s.model.root);
    this.scene.remove(s.name);
    s.model.dispose();
    this.soldiers.delete(i);
  }

  /** Le soldat `i`, et son nom (montré ou non) */
  updateSoldier(i: number, pose: SoldierPose, dt: number, showName: boolean, flagColor: string | null) {
    const s = this.soldiers.get(i);
    if (!s) return;
    s.model.update(pose, dt, flagColor);
    s.name.visible = showName && pose.alive && s.model.root.visible;
    if (s.name.visible) {
      s.model.headWorld(this.tmp);
      s.name.position.set(this.tmp.x, this.tmp.y + 0.5, this.tmp.z);
    }
  }

  soldierFired(i: number) {
    this.soldiers.get(i)?.model.fired();
  }

  /** Là où naît la balle d'un autre soldat */
  muzzleOf(i: number, out: THREE.Vector3): boolean {
    const s = this.soldiers.get(i);
    if (!s || !s.model.root.visible) return false;
    out.copy(s.model.muzzle);
    return true;
  }

  setGrenades(list: { x: number; y: number; z: number }[]) {
    this.grenades.forEach((g, k) => {
      const p = list[k];
      g.visible = Boolean(p);
      if (p) {
        g.position.set(p.x, p.y, p.z);
        g.rotation.x += 0.3;
        g.rotation.z += 0.2;
      }
    });
  }

  /** Les drapeaux : chez eux sur leur socle, tombés au sol, ou portés (dans le dos du porteur) */
  setFlags(flags: { at: number; x: number; y: number; z: number }[] | null, bases: { x: number; y: number; z: number }[]) {
    this.flags.forEach((f, t) => {
      const st = flags?.[t];
      const base = bases[t];
      f.stand.visible = Boolean(flags && base);
      if (base) f.stand.position.set(base.x, base.y + 0.06, base.z);
      f.group.visible = Boolean(st && st.at !== 1);
      if (st && st.at !== 1) {
        f.group.position.set(st.x, st.y, st.z);
        f.group.rotation.z = st.at === 2 ? 0.5 : 0;
      }
      const pos = f.cloth.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k);
        pos.setZ(k, Math.sin(this.t * 4 + x * 5) * 0.08 * (x + 0.45));
      }
      pos.needsUpdate = true;
    });
  }

  setZone(center: { x: number; z: number; r: number } | null, owner: number, contested: boolean) {
    if (!center) return;
    if (!this.zone) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(center.r - 0.25, center.r, 48),
        new THREE.MeshBasicMaterial({ color: "#fff", transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(center.x, 0.45, center.z);
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(center.r, center.r, 2.6, 48, 1, true),
        new THREE.MeshBasicMaterial({ color: "#fff", transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
      );
      wall.position.set(center.x, 1.3, center.z);
      this.scene.add(ring);
      this.scene.add(wall);
      this.zone = { ring, wall };
    }
    const color = contested ? (Math.floor(this.t * 4) % 2 ? "#ffffff" : "#ffb020") : owner >= 0 ? TEAM_HEX[owner as 0 | 1] : "#f2efe6";
    (this.zone.ring.material as THREE.MeshBasicMaterial).color.set(color);
    (this.zone.wall.material as THREE.MeshBasicMaterial).color.set(color);
  }

  private setViewGun(weapon: WeaponId, camo: CamoId) {
    const key = `${weapon}:${camo}`;
    if (key === this.vmKey) return;
    if (this.vmGun) this.vmRoot.remove(this.vmGun.group);
    this.vmGun = buildGun(weapon, camo, this.low);
    this.vmGun.group.scale.setScalar(0.62);
    this.vmRoot.add(this.vmGun.group);
    // Les mains gantées, et un bout de manche
    const glove = new THREE.MeshLambertMaterial({ color: "#2a2620" });
    const sleeve = new THREE.MeshLambertMaterial({ color: "#5d5640" });
    const hand = (x: number, y: number, z: number, rx: number) => {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.11), glove);
      h.position.set(x, y, z);
      h.rotation.x = rx;
      this.vmGun!.group.add(h);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), sleeve);
      s.position.set(x + 0.02, y - 0.06, z + 0.2);
      s.rotation.x = rx - 0.25;
      this.vmGun!.group.add(s);
    };
    hand(0.01, -0.02, 0.03, 0.3);
    hand(-0.02, 0.0, weapon === "pistolet" ? -0.02 : -0.4, 0.15);
    this.vmKey = key;
  }

  /** Son arme en main : à la hanche ou épaulée, qui se balance, recule, se recharge */
  updateViewmodel(v: ViewState) {
    this.setViewGun(v.weapon, v.camo);
    const gun = this.vmGun!;
    this.vmRoot.visible = v.alive && !v.scoped;
    // À la hanche : en bas à droite, assez loin pour ne pas boucher la vue ; épaulée : le viseur au milieu de l'écran
    const hip = v.weapon === "pistolet" ? new THREE.Vector3(0.17, -0.17, -0.42) : new THREE.Vector3(0.2, -0.21, -0.5);
    const sight = (v.weapon === "precision" ? 0.15 : v.weapon === "pistolet" ? 0.1 : 0.13) * 0.62;
    const ads = new THREE.Vector3(0, -sight - 0.012, v.weapon === "pistolet" ? -0.34 : -0.4);
    const p = hip.lerp(ads, v.ads);
    const bob = Math.sin(v.bob) * v.bobAmp * (1 - v.ads * 0.8);
    p.x += Math.cos(v.bob * 0.5) * v.bobAmp * 0.5 * (1 - v.ads) - v.swayX * 0.04;
    p.y += Math.abs(bob) * 0.4 - v.swayY * 0.03 - (1 - v.raise) * 0.3;
    p.z += v.kick * 0.055;
    gun.group.position.copy(p);
    gun.group.rotation.set(v.kick * 0.09 + v.swayY * 0.08, v.swayX * 0.1 + 0.05 * (1 - v.ads), v.sprint ? 0.5 : 0);
    if (v.sprint) {
      gun.group.position.x += 0.05;
      gun.group.position.y -= 0.05;
      gun.group.rotation.y = 0.5;
    }
    if (v.reload >= 0) {
      // L'arme bascule, le chargeur sort et revient
      const r = Math.sin(Math.min(1, v.reload) * Math.PI);
      gun.group.rotation.z = r * 0.6;
      gun.group.rotation.x -= r * 0.35;
      gun.group.position.y -= r * 0.06;
      if (gun.mag) gun.mag.position.y = (v.weapon === "pompe" ? 0.025 : -0.06) - r * 0.14;
    } else if (gun.mag)
      gun.mag.position.y = v.weapon === "pompe" ? 0.025 : v.weapon === "pistolet" ? -0.02 : v.weapon === "pm" ? -0.1 : -0.06;
    // Le couteau et la grenade passent devant
    this.vmKnife.visible = v.alive && v.melee >= 0;
    if (this.vmKnife.visible) {
      const k = Math.sin(v.melee * Math.PI);
      this.vmKnife.position.set(0.12 - k * 0.15, -0.16 + k * 0.03, -0.3 - k * 0.2);
      this.vmKnife.rotation.set(-0.3, 0.6 - k * 1.2, 0);
      gun.group.position.y -= 0.25 * k;
    }
    gun.group.updateMatrixWorld(true);
    this.vmNade.visible = v.alive && v.throwing >= 0 && v.throwing < 0.5;
    if (this.vmNade.visible) {
      const k = v.throwing / 0.5;
      this.vmNade.position.set(-0.1 + k * 0.1, -0.15 + k * 0.2, -0.3 - k * 0.4);
      gun.group.position.y -= 0.2;
    }
  }

  /** Le bout du canon de son arme, dans le monde (pour la flamme et la traçante) */
  viewMuzzle(out: THREE.Vector3): THREE.Vector3 {
    if (!this.vmGun) return out.copy(this.camera.position);
    this.vmGun.muzzle.getWorldPosition(out);
    // Du repère de l'arme (devant la caméra de l'arme) au monde : même place devant les yeux
    out.applyMatrix4(this.vmCam.matrixWorldInverse);
    return out.applyMatrix4(this.camera.matrixWorld);
  }

  render(dt: number) {
    this.t += dt;
    this.effects.update(dt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.vmScene, this.vmCam);
  }

  dispose() {
    for (const i of [...this.soldiers.keys()]) this.removeSoldier(i);
    this.map.dispose();
    this.renderer.dispose();
  }
}
