// Ce qu'on voit d'une partie d'Escarmouche : la carte, le ciel et la brume, les autres soldats, son arme en main
// (dessinée à part, par-dessus, pour ne jamais rentrer dans un mur), les grenades, les drapeaux et la zone.

import * as THREE from "three";
import type { AvatarConfig } from "../../../shared/avatar.ts";
import { seededAvatar } from "../../../shared/avatar.ts";
import type { CamoId } from "../../../shared/games/escarmouche/camos.ts";
import { UNIFORM_BY_ID, type UniformId } from "../../../shared/games/escarmouche/uniforms.ts";
import type { GameMap } from "../../../shared/games/escarmouche/maps.ts";
import type { WeaponId } from "../../../shared/games/escarmouche/weapons.ts";
import { Effects, flashTexture } from "./effects.ts";
import { buildGrenade, buildGun, buildKnife, type Gun } from "./guns.ts";
import { buildMap, type MapMesh } from "./mapMesh.ts";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { fuse } from "./fuse.ts";
import { nameSprite, segment, SoldierModel, soldierKey, uniformMats, type SoldierLook, type SoldierPose } from "./soldiers.ts";
import { buildDistant, type Distant } from "./distant.ts";
import { Post } from "./post.ts";
import type { Quality } from "./quality.ts";
import { SKIES, skyEnvironment, skyMaterial, sunDirection, type Light } from "./sky.ts";

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
  private env: THREE.Texture;
  readonly effects: Effects;
  private soldiers = new Map<number, { model: SoldierModel; name: THREE.Sprite; mark: THREE.Sprite }>();
  /** Les bidons d'essence : debout, ou carcasse noircie qui fume encore */
  private barrels = new Map<number, { whole: THREE.Group; wreck: THREE.Group; down: boolean }>();
  private vmRoot = new THREE.Group();
  private vmGun: Gun | null = null;
  private vmKey = "";
  private vmLook: { avatar: AvatarConfig; tenue: UniformId } = { avatar: seededAvatar("soldat"), tenue: "perso" };
  private vmLookKey = "";
  private vmTrash: { dispose: () => void }[] = [];
  private vmKnife: THREE.Group;
  private vmNade: THREE.Mesh;
  /** La flamme de son arme (sur l'arme, dans son propre dessin) et les douilles qui sautent */
  private vmFlash = new THREE.Group();
  private vmFlashUntil = 0;
  private shells: { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; age: number }[] = [];
  private shellNext = 0;
  private grenades: THREE.Mesh[] = [];
  private flags: { group: THREE.Group; cloth: THREE.Mesh; stand: THREE.Mesh }[] = [];
  private zone: { ring: THREE.Mesh; wall: THREE.Mesh } | null = null;
  private basePixelRatio: number;
  private skyMat: THREE.ShaderMaterial;
  private distant: Distant;
  private post: Post | null = null;
  private sunDir: THREE.Vector3;
  private shadowSpan = 30;
  private size: [number, number] = [1, 1];
  readonly quality: Quality;
  private resolution = 1;
  private t = 0;
  readonly low: boolean;
  private tmp = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, gm: GameMap, opts: { quality: Quality; teams: boolean }) {
    const q = opts.quality;
    this.quality = q;
    this.low = q === "bas";
    const light: Light = gm.light;
    const look = SKIES[light];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q === "moyen", powerPreference: "high-performance" });
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, q === "bas" ? 1.25 : q === "moyen" ? 1.5 : 1.75);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = light === "soir" ? 1.12 : 1.15;
    this.renderer.autoClear = false;
    if (q !== "bas") {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
    this.camera.rotation.order = "YXZ";
    this.vmCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);

    // La brume, de la couleur de l'horizon : le loin se fond dans le ciel
    this.scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
    // La lumière : le ciel tout autour (plus doux là où les matières le reflètent), et le soleil
    const hemi = new THREE.HemisphereLight(look.zenith, look.ground, q === "bas" ? 1.3 : 1.0);
    hemi.color.lerp(new THREE.Color(look.horizon), 0.5);
    this.scene.add(hemi);
    this.sunDir = sunDirection(light);
    this.sun = new THREE.DirectionalLight(look.sunColor, light === "soir" ? 2.8 : 1.7);
    this.sun.position.copy(this.sunDir).multiplyScalar(90);
    if (q !== "bas") {
      this.sun.castShadow = true;
      const size = q === "haut" ? 2048 : 1024;
      this.sun.shadow.mapSize.set(size, size);
      // Les ombres suivent le joueur : bien plus fines que si elles couvraient toute la carte
      this.shadowSpan = q === "haut" ? 34 : 30;
      const cam = this.sun.shadow.camera;
      cam.left = -this.shadowSpan;
      cam.right = this.shadowSpan;
      cam.top = this.shadowSpan;
      cam.bottom = -this.shadowSpan;
      cam.near = 1;
      cam.far = 220;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.035;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Le reflet du ciel sur le métal et les surfaces lisses
    this.env = skyEnvironment(this.renderer, light);
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.85;
    this.vmScene.environment = this.env;
    this.vmScene.environmentIntensity = 1.0;

    // Le ciel, qui suit la caméra, et le pays tout autour
    this.skyMat = skyMaterial(light);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.distant = buildDistant(gm, q, light);
    this.scene.add(this.distant.group);

    this.map = buildMap(gm, q);
    this.scene.add(this.map.group);
    this.effects = new Effects(this.low);
    this.scene.add(this.effects.group);

    // Les drapeaux et la zone
    for (let t = 0; t < 2; t++) {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6),
        new THREE.MeshStandardMaterial({ color: "#2f2f2f", roughness: 0.4, metalness: 0.7 }),
      );
      pole.position.y = 1.2;
      group.add(pole);
      const cloth = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.55, 6, 2),
        new THREE.MeshStandardMaterial({ color: TEAM_HEX[t], side: THREE.DoubleSide, roughness: 0.9 }),
      );
      cloth.position.set(0.45, 2.05, 0);
      group.add(cloth);
      group.visible = false;
      this.scene.add(group);
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1, 0.12, 20),
        new THREE.MeshStandardMaterial({ color: TEAM_HEX[t], emissive: TEAM_HEX[t], emissiveIntensity: 0.6, roughness: 0.5 }),
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

    // L'arme en main, dessinée par-dessus le reste, éclairée comme la scène
    const vmHemi = new THREE.HemisphereLight(look.zenith, look.ground, 1.3);
    vmHemi.color.lerp(new THREE.Color(look.horizon), 0.5);
    this.vmScene.add(vmHemi);
    const vmSun = new THREE.DirectionalLight(look.sunColor, light === "soir" ? 2.3 : 1.8);
    vmSun.position.set(-1, 2, 1);
    this.vmScene.add(vmSun);
    this.vmScene.add(this.vmRoot);
    this.vmKnife = buildKnife();
    this.vmKnife.visible = false;
    this.vmScene.add(this.vmKnife);
    this.vmNade = buildGrenade();
    this.vmNade.visible = false;
    this.vmScene.add(this.vmNade);
    // La flamme de son arme : une étoile vue de face, deux langues vues de côté
    const star = flashTexture();
    const flashMat = new THREE.MeshBasicMaterial({
      map: star,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat);
    this.vmFlash.add(front);
    for (const r of [0, Math.PI / 2]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.26), flashMat);
      side.geometry.rotateX(Math.PI / 2);
      side.geometry.translate(0, 0, -0.11);
      side.rotation.z = r;
      this.vmFlash.add(side);
    }
    this.vmFlash.visible = false;
    this.vmScene.add(this.vmFlash);
    // Les douilles : un petit cylindre de laiton (ou une cartouche rouge du fusil à pompe)
    const brass = new THREE.MeshStandardMaterial({ color: "#c79a3e", roughness: 0.3, metalness: 0.9 });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.02, 8), brass);
      m.visible = false;
      this.vmScene.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), age: 9 });
    }

    // Le traitement de l'image (qualité haute seulement)
    if (q === "haut")
      this.post = new Post(
        this.renderer,
        this.scene,
        this.camera,
        this.vmScene,
        this.vmCam,
        light === "soir"
          ? { tint: "#fff7ee", saturation: 1.04, contrast: 1.06, bloom: 0.3 }
          : { tint: "#eef3f6", saturation: 0.9, contrast: 1.12, bloom: 0.22 },
      );
    void opts.teams;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCam.aspect = w / h;
    this.vmCam.updateProjectionMatrix();
    this.size = [w, h];
    this.post?.setSize(w, h, this.renderer.getPixelRatio());
  }

  /** Moins de pixels quand l'appareil peine */
  setResolution(scale: number) {
    this.resolution = scale;
    this.renderer.setPixelRatio(this.basePixelRatio * scale);
    this.post?.setSize(this.size[0], this.size[1], this.renderer.getPixelRatio());
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
    // Le soleil et sa carte d'ombres suivent le joueur, calés sur la grille des texels pour ne pas scintiller
    if (this.sun.castShadow) {
      const texel = (this.shadowSpan * 2) / this.sun.shadow.mapSize.x;
      const tx = Math.round(x / texel) * texel;
      const tz = Math.round(z / texel) * texel;
      this.sun.target.position.set(tx, 0, tz);
      this.sun.position.set(tx + this.sunDir.x * 90, this.sunDir.y * 90, tz + this.sunDir.z * 90);
    }
  }

  /** Un soldat apparaît (ou change d'allure) */
  ensureSoldier(i: number, look: SoldierLook, name: string, nameColor: string) {
    const known = this.soldiers.get(i);
    if (known && known.model.key === soldierKey(look)) {
      known.model.setCamo(look.camo);
      return;
    }
    if (known) this.removeSoldier(i);
    const model = new SoldierModel(look, this.low);
    const label = nameSprite(name, nameColor);
    const mark = new THREE.Sprite(markMaterial());
    mark.scale.set(0.34, 0.34, 1);
    mark.renderOrder = 10;
    mark.visible = false;
    this.scene.add(model.root);
    this.scene.add(label);
    this.scene.add(mark);
    this.soldiers.set(i, { model, name: label, mark });
  }

  removeSoldier(i: number) {
    const s = this.soldiers.get(i);
    if (!s) return;
    this.scene.remove(s.model.root);
    this.scene.remove(s.name);
    this.scene.remove(s.mark);
    s.model.dispose();
    this.soldiers.delete(i);
  }

  /** Le soldat `i`, et son nom (montré ou non) */
  updateSoldier(i: number, pose: SoldierPose, dt: number, showName: boolean, flagColor: string | null, marked = false) {
    const s = this.soldiers.get(i);
    if (!s) return;
    s.model.update(pose, dt, flagColor);
    s.name.visible = showName && pose.alive && s.model.root.visible;
    // Repéré : un losange rouge au-dessus de sa tête, qu'on voit même à travers les murs
    s.mark.visible = marked && pose.alive;
    if (s.name.visible || s.mark.visible) s.model.headWorld(this.tmp);
    if (s.name.visible) s.name.position.set(this.tmp.x, this.tmp.y + 0.5, this.tmp.z);
    if (s.mark.visible) {
      s.mark.position.set(this.tmp.x, this.tmp.y + (s.name.visible ? 0.82 : 0.55), this.tmp.z);
      const d = this.camera.position.distanceTo(s.mark.position);
      s.mark.scale.setScalar(Math.max(0.3, d * 0.028) * (1 + Math.sin(this.t * 6) * 0.06));
    }
  }

  /** Les bidons de la carte, debout ou qui ont sauté */
  setBarrels(boxes: { i: number; x: number; z: number }[], down: ReadonlySet<number>) {
    for (const b of boxes) {
      let k = this.barrels.get(b.i);
      if (!k) {
        k = buildBarrel(b.x, b.z, this.low);
        this.scene.add(k.whole);
        this.scene.add(k.wreck);
        this.barrels.set(b.i, k);
      }
      const isDown = down.has(b.i);
      if (isDown !== k.down) {
        k.down = isDown;
        k.whole.visible = !isDown;
        k.wreck.visible = isDown;
      }
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

  /** Son personnage et sa tenue : les manches et les mains de son arme en main */
  setLocalLook(avatar: AvatarConfig, tenue: UniformId) {
    const key = `${tenue}|${JSON.stringify(avatar)}`;
    if (key === this.vmLookKey) return;
    this.vmLookKey = key;
    this.vmLook = { avatar, tenue };
  }

  private setViewGun(weapon: WeaponId, camo: CamoId) {
    const key = `${weapon}:${camo}:${this.vmLookKey}`;
    if (key === this.vmKey) return;
    if (this.vmGun) {
      this.vmRoot.remove(this.vmGun.group);
      this.vmGun.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    for (const d of this.vmTrash) d.dispose();
    this.vmTrash = [];
    const keep = <T extends { dispose: () => void }>(x: T) => {
      this.vmTrash.push(x);
      return x;
    };
    this.vmGun = buildGun(weapon, camo, this.low);
    this.vmGun.group.scale.setScalar(0.62);
    this.vmRoot.add(this.vmGun.group);
    const gun = this.vmGun;
    // Les bras dans la tenue choisie, et les mains : nues dans sa propre tenue, gantées sinon
    const u = UNIFORM_BY_ID.get(this.vmLook.tenue) ?? UNIFORM_BY_ID.get("perso")!;
    const m = uniformMats(u, this.vmLook.avatar, keep);
    const arms = new THREE.Group();
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // La main droite tient la poignée ; la gauche, le garde-main (ou la poignée, pour une arme de poing)
    const grip = V(0.012, -0.03, 0.03);
    const support = gun.pistol ? V(-0.03, -0.045, 0.02) : V(0, 0.005, gun.front);
    const rWrist = grip.clone().add(V(0.02, -0.04, 0.07));
    const rElbow = V(0.15, -0.2, 0.32);
    const lWrist = support.clone().add(gun.pistol ? V(-0.03, -0.04, 0.06) : V(-0.03, -0.035, 0.06));
    const lElbow = gun.pistol ? V(-0.16, -0.22, 0.3) : V(-0.2, -0.17, support.z + 0.3);
    segment(rElbow.clone().add(V(0.08, -0.12, 0.32)), rElbow, 0.062, m.coat, arms);
    segment(rElbow, rWrist, 0.05, m.coat, arms);
    segment(lElbow.clone().add(V(-0.08, -0.14, 0.32)), lElbow, 0.062, m.coat, arms);
    segment(lElbow, lWrist, 0.05, m.coat, arms);
    // Le poignet de la manche, un ton plus sombre
    for (const [w, e] of [
      [rWrist, rElbow],
      [lWrist, lElbow],
    ] as const) {
      const cuffA = w.clone().lerp(e, 0.05);
      const cuffB = w.clone().lerp(e, 0.16);
      segment(cuffA, cuffB, 0.054, m.pouch, arms);
    }
    const piece = (w: number, h: number, d: number, at: THREE.Vector3, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.45), m.glove);
      mesh.position.copy(at);
      mesh.rotation.set(rx, ry, rz);
      arms.add(mesh);
    };
    // La main droite : la paume sur le flanc droit de la poignée, les doigts qui l'entourent devant, le pouce dessus
    piece(0.032, 0.085, 0.075, grip.clone().add(V(0.03, 0.0, 0.0)), -0.28);
    piece(0.07, 0.07, 0.03, grip.clone().add(V(0.0, -0.005, -0.04)), -0.28);
    segment(grip.clone().add(V(0.035, 0.035, 0.02)), grip.clone().add(V(-0.01, 0.045, -0.02)), 0.012, m.glove, arms);
    // L'index, tendu le long du pontet
    segment(grip.clone().add(V(0.025, 0.02, -0.03)), grip.clone().add(V(0.02, 0.02, -0.075)), 0.01, m.glove, arms);
    if (gun.pistol) {
      // Les deux mains sur la poignée : la gauche enveloppe la droite
      piece(0.035, 0.08, 0.075, support.clone().add(V(-0.02, 0.0, 0.0)), -0.28);
      piece(0.07, 0.06, 0.03, support.clone().add(V(0.01, 0.0, -0.045)), -0.28);
    } else {
      // La main gauche sous le garde-main : la paume dessous, les doigts qui remontent à gauche, le pouce à droite
      piece(0.07, 0.03, 0.09, support.clone().add(V(0.0, -0.01, 0.0)));
      piece(0.025, 0.06, 0.08, support.clone().add(V(-0.04, 0.025, 0.0)));
      segment(support.clone().add(V(0.03, -0.005, 0.03)), support.clone().add(V(0.042, 0.035, -0.02)), 0.011, m.glove, arms);
    }
    fuse(arms, false);
    gun.group.add(arms);
    this.vmKey = key;
  }

  /** Son arme en main : à la hanche ou épaulée, qui se balance, recule, se recharge */
  updateViewmodel(v: ViewState) {
    this.setViewGun(v.weapon, v.camo);
    const gun = this.vmGun!;
    this.vmRoot.visible = v.alive && !v.scoped;
    // À la hanche : en bas à droite, assez loin pour ne pas boucher la vue ; épaulée : le viseur au milieu de l'écran
    const hip = gun.pistol ? new THREE.Vector3(0.17, -0.17, -0.42) : new THREE.Vector3(0.2, -0.21, -0.5);
    const sight = gun.sight * 0.62;
    const ads = new THREE.Vector3(0, -sight, gun.pistol ? -0.34 : -0.4);
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
      if (gun.mag) gun.mag.position.y = gun.magRest.y - r * 0.16;
      if (gun.hinge) gun.hinge.rotation[gun.hingeAxis] = gun.hingeAxis === "x" ? -r * 0.55 : r * 1.3;
    } else {
      if (gun.mag) gun.mag.position.y = gun.magRest.y;
      if (gun.hinge) gun.hinge.rotation[gun.hingeAxis] = 0;
    }
    // La pompe recule puis revient après chaque coup
    if (gun.pump)
      gun.pump.position.z = gun.pumpRest + (v.kick > 0 && v.kick < 0.85 ? Math.sin(((0.85 - v.kick) / 0.85) * Math.PI) * 0.09 : 0);
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

  /** Son arme vient de tirer : la flamme, sur l'arme même */
  viewFlash(weapon: WeaponId) {
    const big =
      weapon === "pompe" || weapon === "double" ? 1.6 : weapon === "precision" || weapon === "carabine" || weapon === "fm" ? 1.25 : 1;
    const small = weapon === "pistolet" || weapon === "pa" || weapon === "mitraillette" ? 0.75 : 1;
    this.vmFlash.scale.setScalar(big * small * (0.85 + Math.random() * 0.35));
    this.vmFlash.children[0]!.rotation.z = Math.random() * Math.PI;
    this.vmFlashUntil = this.t + 0.045;
  }

  /** Une douille saute par la fenêtre d'éjection */
  ejectShell(weapon: WeaponId) {
    if (!this.vmGun || weapon === "revolver" || weapon === "double") return;
    const s = this.shells[this.shellNext]!;
    this.shellNext = (this.shellNext + 1) % this.shells.length;
    this.vmGun.eject.getWorldPosition(s.mesh.position);
    const shotgun = weapon === "pompe";
    (s.mesh.material as THREE.MeshStandardMaterial).color.set(shotgun ? "#a3261e" : "#c79a3e");
    s.mesh.scale.set(shotgun ? 2.4 : 1, shotgun ? 2.2 : weapon === "pistolet" || weapon === "pa" ? 0.8 : 1.3, shotgun ? 2.4 : 1);
    s.vel.set(0.9 + Math.random() * 0.5, 0.8 + Math.random() * 0.5, 0.15 + Math.random() * 0.25);
    s.spin.set(Math.random() * 20, Math.random() * 10, 10 + Math.random() * 20);
    s.mesh.rotation.set(0, 0, Math.PI / 2);
    s.mesh.visible = true;
    s.age = 0;
  }

  private updateViewFx(dt: number) {
    const on = this.vmGun !== null && this.vmRoot.visible && this.t < this.vmFlashUntil;
    this.vmFlash.visible = on;
    if (on) {
      this.vmGun!.muzzle.getWorldPosition(this.vmFlash.position);
      this.vmGun!.group.getWorldQuaternion(this.vmFlash.quaternion);
    }
    for (const s of this.shells) {
      if (!s.mesh.visible) continue;
      s.age += dt;
      if (s.age > 0.7) {
        s.mesh.visible = false;
        continue;
      }
      s.vel.y -= 7 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
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

  /** La douleur, de 0 à 1 (l'image pâlit et rougit sur les bords, en qualité haute) */
  setHurt(k: number) {
    this.post?.setHurt(k);
  }

  render(dt: number) {
    this.t += dt;
    this.effects.update(dt, this.camera);
    this.updateViewFx(dt);
    this.skyMat.uniforms.time!.value = this.t;
    if (this.post) {
      this.post.render(dt);
      return;
    }
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.vmScene, this.vmCam);
  }

  dispose() {
    for (const i of [...this.soldiers.keys()]) this.removeSoldier(i);
    this.map.dispose();
    this.distant.dispose();
    this.post?.dispose();
    this.skyMat.dispose();
    this.env.dispose();
    this.renderer.dispose();
  }
}

let markMat: THREE.SpriteMaterial | null = null;
/** Le repère d'un ennemi : un losange rouge cerclé de noir, dessiné par-dessus tout */
function markMaterial(): THREE.SpriteMaterial {
  if (markMat) return markMat;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.moveTo(32, 6);
  g.lineTo(54, 30);
  g.lineTo(32, 58);
  g.lineTo(10, 30);
  g.closePath();
  g.lineWidth = 7;
  g.strokeStyle = "rgba(0,0,0,.75)";
  g.stroke();
  g.fillStyle = "#ff3b2a";
  g.fill();
  g.fillStyle = "rgba(255,255,255,.55)";
  g.beginPath();
  g.moveTo(32, 14);
  g.lineTo(44, 30);
  g.lineTo(32, 30);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  markMat = new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true });
  return markMat;
}

/** Un bidon d'essence rouge cerclé, et sa carcasse ouverte et noircie */
function buildBarrel(x: number, z: number, low: boolean) {
  const seg = low ? 10 : 18;
  const red = new THREE.MeshStandardMaterial({ color: "#a3231b", roughness: 0.5, metalness: 0.45 });
  const band = new THREE.MeshStandardMaterial({ color: "#e0b030", roughness: 0.5, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: "#3a3836", roughness: 0.45, metalness: 0.7 });
  const burnt = new THREE.MeshStandardMaterial({ color: "#1d1b19", roughness: 0.9, metalness: 0.3 });
  const whole = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, seg), red);
  body.position.y = 0.45;
  whole.add(body);
  for (const y of [0.3, 0.6]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.302, 0.012, 6, seg), steel);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = y;
    whole.add(rib);
  }
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.303, 0.303, 0.12, seg, 1, true), band);
  stripe.position.y = 0.45;
  whole.add(stripe);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, seg), steel);
  lid.position.y = 0.91;
  whole.add(lid);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), steel);
  cap.position.set(0.15, 0.93, 0.05);
  whole.add(cap);
  whole.position.set(x, 0, z);
  whole.rotation.y = x * 3.1 + z;
  whole.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  const wreck = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.55, seg, 1, true), burnt);
  shell.material.side = THREE.DoubleSide;
  shell.position.y = 0.27;
  shell.scale.set(1, 1, 0.8);
  wreck.add(shell);
  const scorch = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 16),
    new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.55, depthWrite: false }),
  );
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.02;
  wreck.add(scorch);
  wreck.position.set(x, 0, z);
  wreck.rotation.set(0.12, x, 0.08);
  wreck.visible = false;
  return { whole, wreck, down: false };
}
