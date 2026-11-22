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
import { buildGrenade, buildGun, buildKnife, NO_GEAR, type Gear, type Gun } from "./guns.ts";
import { buildCrates, buildMap, setWetness, type MapMesh } from "./mapMesh.ts";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { fuse } from "./fuse.ts";
import { DEPOT_NAMES, POINT_NAMES } from "../../../shared/games/escarmouche/match.ts";
import {
  nameSprite,
  segment,
  SoldierModel,
  soldierKey,
  uniformMats,
  type SoldierLook,
  type SoldierPose,
  setRimStrength,
} from "./soldiers.ts";
import { buildDistant, type Distant } from "./distant.ts";
import { worldOf } from "../../../shared/games/escarmouche/match.ts";
import { buildDecals } from "./decals.ts";
import { Snow } from "./snow.ts";
import { buildGrass, grassTime } from "./grass.ts";
import { Post } from "./post.ts";
import { Rain } from "./rain.ts";
import type { Quality } from "./quality.ts";
import { SKIES, skyEnvironment, skyMaterial, sunDirection, type Light } from "./sky.ts";

export const TEAM_HEX = ["#d4453c", "#3f7fd8"] as const;

/** Ce que fait son arme en main, pour l'animer */
export interface ViewState {
  weapon: WeaponId;
  camo: CamoId;
  /** Les accessoires de son arme principale */
  gear?: Gear;
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
  private soldiers = new Map<number, { model: SoldierModel; name: THREE.Sprite; mark: THREE.Sprite; cross: THREE.Sprite }>();
  /** Les bidons d'essence : debout, ou carcasse noircie qui fume encore */
  private barrels = new Map<number, { whole: THREE.Group; wreck: THREE.Group; down: boolean }>();
  /** Les repères de son équipe : une épingle jaune, vue à travers les murs */
  private pins: { sprite: THREE.Sprite; at: THREE.Vector3 }[] = [];
  /** Sabotage : les deux dépôts (debout, piégés, détruits), leur lettre, leur feu rouge */
  private depots: { whole: THREE.Group; wreck: THREE.Group; beacon: THREE.Sprite; letter: THREE.Sprite; at: THREE.Vector3 }[] = [];
  /** Les caisses de munitions de ses lieux de ravitaillement, et le cercle discret autour */
  private supplies: { group: THREE.Group; ring: THREE.Mesh }[] = [];
  /** Les caisses en bois : debout, ou quelques planches au sol */
  private crates = new Map<number, { whole: THREE.Mesh; wreck: THREE.Group; down: boolean }>();
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
  /** Le dernier coup vu par l'arme en main (pour la pompe, la culasse et le sens du recul) */
  private vmShotAt = -9;
  private vmShotRoll = 0;
  private vmLastKick = 0;
  private vmLastT = 0;
  /** De 0 à 1 : l'arme qui se couche pour courir (en douceur) */
  private vmSprint = 0;
  private shells: { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; age: number }[] = [];
  private shellNext = 0;
  private grenades: THREE.Mesh[] = [];
  private flags: { group: THREE.Group; cloth: THREE.Mesh; stand: THREE.Mesh }[] = [];
  private zone: { ring: THREE.Mesh; wall: THREE.Mesh } | null = null;
  private points: { cloth: THREE.Mesh; ring: THREE.Mesh; letter: THREE.Sprite; at: THREE.Vector3 }[] = [];
  private basePixelRatio: number;
  private skyMat: THREE.ShaderMaterial;
  private distant: Distant;
  private post: Post | null = null;
  private grass: THREE.Mesh | null = null;
  private rain: Rain | null = null;
  private snow: Snow | null = null;
  private sunDir: THREE.Vector3;
  private shadowSpan = 30;
  /** La force des rayons du soleil : franche au couchant et à l'aube, nulle sous un ciel couvert */
  private rayPower = 0;
  private size: [number, number] = [1, 1];
  readonly quality: Quality;
  private resolution = 1;
  private t = 0;
  readonly low: boolean;
  private tmp = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, gm: GameMap, opts: { quality: Quality; teams: boolean; night?: boolean }) {
    const q = opts.quality;
    this.quality = q;
    this.low = q === "bas";
    const light: Light = opts.night ? "nuit" : gm.light;
    const night = light === "nuit";
    setRimStrength(night ? 0.3 : light === "gris" || light === "neige" ? 0.14 : 0.1);
    // Le sol mouillé : sous la bruine de la gare, et un peu le matin au port
    setWetness(gm.light === "gris" ? 0.9 : gm.light === "aube" ? 0.3 : 0);
    const look = SKIES[light];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q === "moyen", powerPreference: "high-performance" });
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, q === "bas" ? 1.25 : q === "moyen" ? 1.5 : 1.75);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = night ? 1.3 : light === "neige" ? 1.02 : light === "soir" ? 1.12 : 1.15;
    this.renderer.autoClear = false;
    if (q !== "bas") {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
    this.camera.rotation.order = "YXZ";
    this.vmCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);

    // La brume, de la couleur de l'horizon : le loin se fond dans le ciel
    this.scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
    // La lumière : le ciel tout autour (plus doux là où les matières le reflètent), et le soleil
    const hemi = new THREE.HemisphereLight(look.zenith, look.ground, q === "bas" ? 1.3 : 1.0);
    hemi.color.lerp(new THREE.Color(look.horizon), 0.5);
    // La nuit : la clarté bleutée de la lune, assez pour y voir
    if (night) {
      hemi.color.set("#3d4d72");
      hemi.groundColor.set("#14171f");
      hemi.intensity = q === "bas" ? 2.6 : 2.1;
    }
    this.scene.add(hemi);
    this.sunDir = sunDirection(light);
    this.rayPower = light === "gris" || night ? 0 : light === "neige" ? 0.4 : light === "aube" ? 0.9 : 1;
    this.sun = new THREE.DirectionalLight(
      look.sunColor,
      night ? 0.85 : light === "neige" ? 2 : light === "soir" ? 2.8 : light === "aube" ? 2.6 : 1.7,
    );
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
    // La nuit sur la gare et sur le col : il bruine ou il neige, le ciel est couvert, pas d'étoiles
    if (night && (gm.light === "gris" || gm.light === "neige")) {
      this.skyMat.uniforms.clouds!.value = 0.85;
      this.skyMat.uniforms.stars!.value = 0.15;
    }
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.distant = buildDistant(gm, q, gm.light);
    this.scene.add(this.distant.group);

    this.map = buildMap(gm, q, night);
    this.scene.add(this.map.group);
    for (const [i, c] of buildCrates(gm, q)) {
      this.scene.add(c.whole, c.wreck);
      this.crates.set(i, { ...c, down: false });
    }
    // L'herbe des prés, la bruine du matin sur la gare
    this.grass = buildGrass(gm, worldOf(gm.id), q);
    if (this.grass) this.scene.add(this.grass);
    // Les flaques et les taches au sol
    const decals = buildDecals(gm, worldOf(gm.id), q);
    if (decals) this.scene.add(decals);
    if (night) this.lightLamps(gm, q);
    // La neige qui tombe sur le col
    if (gm.light === "neige") {
      this.snow = new Snow(q === "haut" ? 1800 : q === "moyen" ? 900 : 300);
      this.scene.add(this.snow.points);
    }
    // La bruine de la gare : des gouttes clairsemées, des éclaboussures et des gouttières (au téléphone, peu de gouttes
    // et rien d'autre)
    if (gm.light === "gris") {
      this.rain = new Rain(q === "haut" ? 700 : q === "moyen" ? 420 : 160, worldOf(gm.id), q !== "bas");
      this.scene.add(this.rain.group);
    }
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
    if (night) {
      vmHemi.color.set("#5a6d9a");
      vmHemi.groundColor.set("#1c2029");
      vmHemi.intensity = 3.2;
    }
    this.vmScene.add(vmHemi);
    const vmSun = new THREE.DirectionalLight(look.sunColor, night ? 3.2 : light === "soir" ? 2.3 : 1.8);
    vmSun.position.set(-1, 2, 1);
    this.vmScene.add(vmSun);
    // Une lumière froide venue de devant, en haut à droite : elle accroche les arêtes du dessus de l'arme
    const vmEdge = new THREE.DirectionalLight("#dfe8ff", night ? 0.6 : 1.1);
    vmEdge.position.set(0.8, 1.2, -1.6);
    this.vmScene.add(vmEdge);
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
        night
          ? { tint: "#dfe7ff", saturation: 0.8, contrast: 1.1, bloom: 0.55 }
          : light === "neige"
            ? { tint: "#f1f6ff", saturation: 0.9, contrast: 1.08, bloom: 0.2 }
            : light === "soir"
              ? { tint: "#fff7ee", saturation: 1.04, contrast: 1.06, bloom: 0.3 }
              : light === "aube"
                ? { tint: "#fff4f0", saturation: 1.02, contrast: 1.07, bloom: 0.2 }
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

  /** L'ombre dans les recoins (qualité haute) : la première chose qu'on retire quand l'appareil peine */
  setAo(on: boolean) {
    this.post?.setAo(on);
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
      known.model.setCamo(look.camo, look.gear);
      return;
    }
    if (known) this.removeSoldier(i);
    const model = new SoldierModel(look, this.low);
    const label = nameSprite(name, nameColor);
    const mark = new THREE.Sprite(markMaterial());
    mark.scale.set(0.34, 0.34, 1);
    mark.renderOrder = 10;
    mark.visible = false;
    const cross = new THREE.Sprite(crossMaterial());
    cross.renderOrder = 10;
    cross.visible = false;
    this.scene.add(model.root);
    this.scene.add(label);
    this.scene.add(mark);
    this.scene.add(cross);
    this.soldiers.set(i, { model, name: label, mark, cross });
  }

  removeSoldier(i: number) {
    const s = this.soldiers.get(i);
    if (!s) return;
    this.scene.remove(s.model.root);
    this.scene.remove(s.name);
    this.scene.remove(s.mark);
    this.scene.remove(s.cross);
    s.model.dispose();
    // Son nom : une texture à lui (la marque et la croix sont partagées)
    s.name.material.map?.dispose();
    s.name.material.dispose();
    this.soldiers.delete(i);
  }

  /** Le soldat `i` n'est plus envoyé (on ne peut ni le voir ni l'entendre) : il disparaît, avec son nom et ses marques */
  hideSoldier(i: number) {
    const s = this.soldiers.get(i);
    if (!s) return;
    s.model.hide();
    s.name.visible = false;
    s.mark.visible = false;
    s.cross.visible = false;
  }

  /** Le soldat `i`, et son nom (montré ou non) */
  updateSoldier(i: number, pose: SoldierPose, dt: number, showName: boolean, flagColor: string | null, marked = false, fallen = false) {
    const s = this.soldiers.get(i);
    if (!s) return;
    s.model.update(pose, dt, flagColor);
    s.name.visible = showName && pose.alive && s.model.root.visible;
    // Repéré : un losange rouge au-dessus de sa tête, qu'on voit même à travers les murs
    s.mark.visible = marked && pose.alive;
    if (s.name.visible || s.mark.visible) s.model.headWorld(this.tmp);
    if (s.name.visible) s.name.position.set(this.tmp.x, this.tmp.y + 0.5, this.tmp.z);
    // Un coéquipier tombé : une croix verte au-dessus de lui, qu'on voit de loin, pour venir le relever
    s.cross.visible = fallen && s.model.root.visible;
    if (s.cross.visible) {
      s.cross.position.set(pose.x, pose.y + 0.9, pose.z);
      const d = this.camera.position.distanceTo(s.cross.position);
      s.cross.scale.setScalar(Math.max(0.32, d * 0.03) * (1 + Math.sin(this.t * 5) * 0.08));
    }
    if (s.mark.visible) {
      s.mark.position.set(this.tmp.x, this.tmp.y + (s.name.visible ? 0.82 : 0.55), this.tmp.z);
      const d = this.camera.position.distanceTo(s.mark.position);
      s.mark.scale.setScalar(Math.max(0.3, d * 0.028) * (1 + Math.sin(this.t * 6) * 0.06));
    }
  }

  /**
   * Sabotage : les dépôts de munitions (une pile de caisses bâchées, un poste radio et son antenne) ; piégé, son feu
   * rouge clignote de plus en plus vite ; détruit, il n'en reste que des caisses noircies
   */
  setDepots(at: readonly { x: number; y: number; z: number }[], state: readonly number[] | null) {
    if (!state) return;
    if (this.depots.length === 0) {
      const halo = glowTexture();
      at.forEach((p, k) => {
        const whole = buildDepot(this.low);
        whole.position.set(p.x, p.y, p.z);
        whole.rotation.y = k * 1.3 + 0.4;
        const wreck = buildDepotWreck();
        wreck.position.copy(whole.position);
        wreck.rotation.y = whole.rotation.y;
        wreck.visible = false;
        const beacon = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: halo, color: "#ff3020", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        beacon.position.set(p.x, p.y + 1.55, p.z);
        beacon.scale.setScalar(0.9);
        beacon.visible = false;
        const letter = new THREE.Sprite(letterMaterial(DEPOT_NAMES[k] ?? "?"));
        letter.position.set(p.x, p.y + 3.4, p.z);
        letter.renderOrder = 10;
        this.scene.add(whole, wreck, beacon, letter);
        this.depots.push({ whole, wreck, beacon, letter, at: new THREE.Vector3(p.x, p.y + 3.4, p.z) });
      });
    }
    const cam = this.camera.position;
    this.depots.forEach((d, k) => {
      const st = state[k * 2] ?? 0;
      const left = (state[k * 2 + 1] ?? 0) / 10;
      d.whole.visible = st !== 2;
      d.wreck.visible = st === 2;
      d.letter.visible = st !== 2;
      // Le feu rouge : de plus en plus vite à mesure que l'heure approche
      const rate = st === 1 ? 1.2 + (1 - Math.min(1, left / 25)) * 7 : 0;
      const on = st === 1 && Math.sin(this.t * rate * Math.PI * 2) > 0;
      d.beacon.visible = on;
      const color = st === 1 ? (on ? "#ff5a3a" : "#ffb020") : TEAM_HEX[1];
      (d.letter.material as THREE.SpriteMaterial).color.set(color);
      const s = Math.max(0.9, cam.distanceTo(d.at) * 0.04);
      d.letter.scale.set(s, s, 1);
    });
  }

  /** Les repères de son équipe, là où ils ont été posés ; ils pulsent un peu */
  setPings(list: readonly { x: number; y: number; z: number }[]) {
    while (this.pins.length < list.length) {
      const sprite = new THREE.Sprite(pinMaterial());
      sprite.renderOrder = 10;
      sprite.center.set(0.5, 0);
      this.scene.add(sprite);
      this.pins.push({ sprite, at: new THREE.Vector3() });
    }
    const cam = this.camera.position;
    this.pins.forEach((p, k) => {
      const q = list[k];
      p.sprite.visible = Boolean(q);
      if (!q) return;
      p.at.set(q.x, q.y, q.z);
      p.sprite.position.copy(p.at);
      const s = Math.max(0.5, cam.distanceTo(p.at) * 0.035) * (1 + Math.sin(this.t * 5) * 0.06);
      p.sprite.scale.set(s * 0.7, s, 1);
    });
  }

  /** Ses lieux de ravitaillement : des caisses de munitions vert armée, un cercle au sol pour en voir la portée */
  setSupply(points: readonly { x: number; y: number; z: number }[], reach: number) {
    while (this.supplies.length < points.length) {
      const group = buildAmmoCrates(this.low);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(reach - 0.08, reach, 48),
        new THREE.MeshBasicMaterial({ color: "#d9c25a", transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(group, ring);
      this.supplies.push({ group, ring });
    }
    this.supplies.forEach((sp, k) => {
      const p = points[k];
      sp.group.visible = sp.ring.visible = Boolean(p);
      if (!p) return;
      sp.group.position.set(p.x + 1.3, p.y, p.z + 1.3);
      sp.group.rotation.y = 0.6 + k;
      sp.ring.position.set(p.x, p.y + 0.04, p.z);
    });
  }

  /**
   * La nuit, les lampadaires s'allument : une vraie lumière chaude (sauf en qualité basse), le halo de l'ampoule, et la
   * flaque de lumière au sol
   */
  private lightLamps(gm: GameMap, q: Quality) {
    const halo = glowTexture();
    for (const d of gm.decor) {
      if (d.k !== "lamp") continue;
      if (q !== "bas") {
        const lamp = new THREE.PointLight("#ffcf8a", q === "haut" ? 34 : 26, d.h * 4.5, 1.6);
        lamp.position.set(d.x, d.h - 0.35, d.z);
        this.scene.add(lamp);
      }
      const bulb = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: halo, color: "#ffd9a0", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      bulb.position.set(d.x, d.h - 0.2, d.z);
      bulb.scale.setScalar(1.8);
      this.scene.add(bulb);
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: halo,
          color: "#ffcf8a",
          transparent: true,
          opacity: q === "bas" ? 0.45 : 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(d.x, 0.04, d.z);
      pool.scale.setScalar(d.h * 2.4);
      this.scene.add(pool);
    }
  }

  /** Où respire ce soldat (devant sa bouche), s'il est là et visible ; null sinon */
  mouthOf(i: number, out: THREE.Vector3): THREE.Vector3 | null {
    const s = this.soldiers.get(i);
    if (!s || !s.model.root.visible) return null;
    s.model.headWorld(out);
    const yaw = s.model.root.rotation.y;
    return out.set(out.x - Math.sin(yaw) * 0.22, out.y - 0.06, out.z - Math.cos(yaw) * 0.22);
  }

  /** Les caisses cassées (leurs boîtes) : à leur place, quelques planches */
  setCrates(down: ReadonlySet<number>) {
    for (const [i, c] of this.crates) {
      const isDown = down.has(i);
      if (isDown === c.down) continue;
      c.down = isDown;
      c.whole.visible = !isDown;
      c.wreck.visible = isDown;
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

  /** Ce soldat vient d'être touché : il tressaille */
  soldierHit(i: number, head: boolean) {
    this.soldiers.get(i)?.model.hit(head);
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

  /**
   * Conquête : les trois drapeaux. Le drapeau monte le long du mât à mesure qu'une équipe le prend, aux couleurs de
   * celle vers qui il penche ; le cercle au sol et la lettre (vue à travers les murs) sont aux couleurs de qui le tient,
   * et clignotent tant qu'il n'est pas tenu bien en main.
   */
  setPoints(at: readonly { x: number; y: number; z: number }[], state: readonly number[] | null, r: number) {
    if (!state) return;
    if (this.points.length === 0) {
      at.forEach((p, k) => {
        const group = new THREE.Group();
        group.position.set(p.x, p.y, p.z);
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.05, 4.2, 8),
          new THREE.MeshStandardMaterial({ color: "#3a3a38", roughness: 0.45, metalness: 0.7 }),
        );
        pole.position.y = 2.1;
        pole.castShadow = !this.low;
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.42, 0.22, 12),
          new THREE.MeshStandardMaterial({ color: "#8c8a83", roughness: 0.9 }),
        );
        foot.position.y = 0.11;
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 0.7, 8, 2),
          new THREE.MeshStandardMaterial({ color: "#f2efe6", side: THREE.DoubleSide, roughness: 0.9 }),
        );
        cloth.position.set(0.55, 1, 0);
        cloth.castShadow = !this.low;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r - 0.16, r, 64),
          new THREE.MeshBasicMaterial({ color: "#f2efe6", transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        const letter = new THREE.Sprite(letterMaterial(POINT_NAMES[k] ?? "?"));
        letter.position.y = 5.2;
        letter.renderOrder = 10;
        group.add(pole, foot, cloth, ring, letter);
        this.scene.add(group);
        this.points.push({ cloth, ring, letter, at: new THREE.Vector3(p.x, p.y + 5.2, p.z) });
      });
    }
    const cam = this.camera.position;
    this.points.forEach((pt, k) => {
      const owner = state[k * 2] ?? -1;
      const v = (state[k * 2 + 1] ?? 0) / 100;
      const lean = v < -0.01 ? 0 : v > 0.01 ? 1 : -1;
      (pt.cloth.material as THREE.MeshStandardMaterial).color.set(lean >= 0 ? TEAM_HEX[lean as 0 | 1] : "#f2efe6");
      pt.cloth.position.y = 0.75 + 3.0 * Math.abs(v);
      const pos = pt.cloth.geometry.attributes.position as THREE.BufferAttribute;
      for (let n = 0; n < pos.count; n++) {
        const x = pos.getX(n);
        pos.setZ(n, Math.sin(this.t * 4 + x * 5 + k) * 0.09 * (x + 0.55));
      }
      pos.needsUpdate = true;
      const held = owner >= 0 ? TEAM_HEX[owner === 1 ? 1 : 0] : "#f2efe6";
      const shaky = owner >= 0 ? Math.abs(v - (owner === 1 ? 1 : -1)) > 0.02 : Math.abs(v) > 0.02;
      const color = shaky && Math.floor(this.t * 4) % 2 === 0 ? "#ffb020" : held;
      (pt.ring.material as THREE.MeshBasicMaterial).color.set(color);
      (pt.letter.material as THREE.SpriteMaterial).color.set(color);
      const s = Math.max(0.9, cam.distanceTo(pt.at) * 0.04);
      pt.letter.scale.set(s, s, 1);
    });
  }

  /** Son personnage et sa tenue : les manches et les mains de son arme en main */
  setLocalLook(avatar: AvatarConfig, tenue: UniformId) {
    const key = `${tenue}|${JSON.stringify(avatar)}`;
    if (key === this.vmLookKey) return;
    this.vmLookKey = key;
    this.vmLook = { avatar, tenue };
  }

  private setViewGun(weapon: WeaponId, camo: CamoId, gear: Gear) {
    const key = `${weapon}:${camo}:${gear.muzzle}:${gear.extra}:${this.vmLookKey}`;
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
    this.vmGun = buildGun(weapon, camo, this.low, gear);
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
    // Les manches : plus fines, elles s'affinent vers le poignet, avec les plis du tissu ; le coude arrondi
    limb(rElbow.clone().add(V(0.08, -0.12, 0.32)), rElbow, 0.056, 0.047, m.coat, arms, 2);
    limb(rElbow, rWrist, 0.046, 0.034, m.coat, arms, 3);
    limb(lElbow.clone().add(V(-0.08, -0.14, 0.32)), lElbow, 0.056, 0.047, m.coat, arms, 2);
    limb(lElbow, lWrist, 0.046, 0.034, m.coat, arms, 3);
    for (const e of [rElbow, lElbow]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.047, 12, 8), m.coat);
      ball.position.copy(e);
      arms.add(ball);
    }
    // Le poignet de la manche, un ton plus sombre, un peu évasé
    for (const [w, e] of [
      [rWrist, rElbow],
      [lWrist, lElbow],
    ] as const) {
      limb(w.clone().lerp(e, 0.03), w.clone().lerp(e, 0.15), 0.039, 0.037, m.pouch, arms);
    }
    const piece = (w: number, h: number, d: number, at: THREE.Vector3, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.45), m.glove);
      mesh.position.copy(at);
      mesh.rotation.set(rx, ry, rz);
      arms.add(mesh);
    };
    /** Un doigt : des phalanges qui suivent les points donnés */
    const finger = (pts: THREE.Vector3[], r: number) => {
      for (let k = 1; k < pts.length; k++) segment(pts[k - 1]!, pts[k]!, r * (1 - k * 0.06), m.glove, arms, 6);
    };
    // Le repère de la poignée (inclinée) : la main droite s'y referme
    const frame = new THREE.Object3D();
    frame.position.set(0, -0.015, 0.012);
    frame.rotation.x = -0.28;
    frame.updateMatrix();
    const P = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(frame.matrix);
    // La main droite : la paume sur le flanc droit de la poignée, trois doigts qui l'entourent devant, l'index le
    // long du pontet, le pouce par-dessus
    piece(0.026, 0.078, 0.07, P(0.031, 0.0, 0.004));
    piece(0.03, 0.05, 0.05, P(0.03, -0.01, 0.04), 0.2);
    [0.008, -0.016, -0.038].forEach((y, k) => {
      const r = [0.0098, 0.0094, 0.0084][k]!;
      finger([P(0.028, y, -0.012), P(0.014, y, -0.034), P(-0.012, y, -0.034), P(-0.026, y, -0.016)], r);
    });
    finger([P(0.028, 0.034, -0.006), V(0.02, -0.006, -0.05), V(0.012, -0.01, -0.072)], 0.0095);
    finger([P(0.03, 0.04, 0.026), P(0.004, 0.058, 0.012), P(-0.016, 0.056, -0.004)], 0.0105);
    if (gun.pistol) {
      // Les deux mains sur la poignée : la gauche enveloppe la droite
      piece(0.022, 0.062, 0.058, P(-0.027, -0.008, 0.004));
      [-0.006, -0.026, -0.044].forEach((y, k) =>
        finger([P(-0.025, y, -0.016), P(-0.025, y, -0.039), P(0.0, y, -0.045), P(0.02, y, -0.037)], [0.0084, 0.0082, 0.0074][k]!),
      );
      finger([P(-0.026, 0.026, 0.018), P(-0.018, 0.044, -0.016)], 0.0094);
    } else {
      // La main gauche sous le garde-main : la paume dessous, quatre doigts qui remontent à gauche, le pouce à droite
      piece(0.058, 0.026, 0.085, support.clone().add(V(0.004, -0.008, 0.0)));
      [-0.03, -0.01, 0.01, 0.03].forEach((dz, k) => {
        const z = support.z + dz;
        const r = [0.0092, 0.0098, 0.0094, 0.0084][k]!;
        finger(
          [
            V(-0.026, support.y - 0.006, z),
            V(-0.042, support.y + 0.018, z),
            V(-0.04, support.y + 0.04, z - 0.004),
            V(-0.03, support.y + 0.054, z - 0.008),
          ],
          r,
        );
      });
      finger(
        [
          V(0.026, support.y - 0.004, support.z + 0.03),
          V(0.04, support.y + 0.02, support.z),
          V(0.036, support.y + 0.036, support.z - 0.026),
        ],
        0.0105,
      );
    }
    fuse(arms, false);
    gun.group.add(arms);
    this.vmKey = key;
  }

  /** Son arme en main : à la hanche ou épaulée, qui se balance, recule, se recharge */
  updateViewmodel(v: ViewState) {
    this.setViewGun(v.weapon, v.camo, v.gear ?? NO_GEAR);
    const gun = this.vmGun!;
    this.vmRoot.visible = v.alive && !v.scoped;
    // À la hanche : en bas à droite, assez loin pour ne pas boucher la vue ; épaulée : le viseur au milieu de l'écran
    const hip = gun.pistol ? new THREE.Vector3(0.17, -0.17, -0.42) : new THREE.Vector3(0.2, -0.21, -0.5);
    const sight = gun.sight * 0.62;
    const ads = new THREE.Vector3(0, -sight, gun.pistol ? -0.34 : -0.4);
    const p = hip.lerp(ads, v.ads);
    const dt = Math.min(0.1, Math.max(0, this.t - this.vmLastT));
    this.vmLastT = this.t;
    // Un nouveau coup : le recul repart de 1 (on retient l'heure, et de quel côté l'arme va rouler)
    if (v.kick > this.vmLastKick + 0.4) {
      this.vmShotAt = this.t;
      this.vmShotRoll = Math.random() - 0.5;
    }
    this.vmLastKick = v.kick;
    this.vmSprint += ((v.sprint ? 1 : 0) - this.vmSprint) * Math.min(1, dt * 10);
    const run = this.vmSprint;
    const bob = Math.sin(v.bob) * v.bobAmp * (1 - v.ads * 0.8);
    p.x += Math.cos(v.bob * 0.5) * v.bobAmp * 0.5 * (1 - v.ads) - v.swayX * 0.04;
    // Au changement d'arme, elle remonte d'en bas, la bouche d'abord basse, vite puis en douceur
    const down = (1 - v.raise) * (1 - v.raise);
    p.y += Math.abs(bob) * 0.4 - v.swayY * 0.03 - down * 0.32;
    // Le recul : un coup sec vers l'arrière, la bouche qui se relève et roule un peu, d'autant plus fort que l'arme cogne
    const heavy =
      v.weapon === "pompe" || v.weapon === "double" || v.weapon === "precision"
        ? 1.5
        : v.weapon === "pm" || v.weapon === "mitraillette"
          ? 0.75
          : 1;
    const k = v.kick * heavy;
    const flip = gun.pistol ? 0.16 : 0.09;
    p.z += k * 0.055;
    gun.group.position.copy(p);
    gun.group.rotation.set(
      k * flip + v.swayY * 0.08 - down * 0.8,
      (v.swayX * 0.1 + 0.05 * (1 - v.ads)) * (1 - run) + 0.5 * run,
      k * this.vmShotRoll * 0.08 + 0.5 * run + down * 0.3,
    );
    gun.group.position.x += 0.05 * run;
    gun.group.position.y -= 0.05 * run;
    // Le fusil à pompe qu'on réarme, la culasse du fusil de précision : juste après le coup, au son
    const since = this.t - this.vmShotAt;
    const rack = since > 0.3 && since < 0.62 ? Math.sin(((since - 0.3) / 0.32) * Math.PI) : 0;
    if (v.weapon === "precision" && rack > 0) {
      gun.group.rotation.z += rack * 0.22;
      gun.group.rotation.x -= rack * 0.06;
      gun.group.position.y -= rack * 0.02;
    }
    let pumpBack = rack * 0.09;
    if (v.reload >= 0) {
      const t = Math.min(1, v.reload);
      const ease = (a: number, b: number) => {
        const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
        return x * x * (3 - 2 * x);
      };
      // L'arme vient vers le milieu et se couche sur la droite, le flanc gauche tourné vers soi (on voit le chargeur
      // partir et revenir), le temps du geste, puis se redresse
      const tilt = ease(0, 0.16) - ease(0.84, 1);
      gun.group.rotation.z -= tilt * 0.45;
      gun.group.rotation.y += tilt * 0.15;
      gun.group.position.x -= tilt * 0.08;
      gun.group.position.y += tilt * 0.02;
      gun.group.position.z += tilt * 0.02;
      // Le chargeur vide tombe hors de vue ; le plein remonte, puis s'enfonce d'un coup sec qui secoue l'arme
      if (gun.mag) {
        const out = ease(0.16, 0.32);
        const back = ease(0.46, 0.7);
        gun.mag.position.y = gun.magRest.y - (t < 0.39 ? out * out * 0.34 : (1 - back) * 0.24);
        gun.mag.visible = t < 0.33 || t > 0.45;
      }
      const seat = t > 0.7 && t < 0.8 ? Math.sin(((t - 0.7) / 0.1) * Math.PI) : 0;
      gun.group.position.y += seat * 0.014;
      gun.group.rotation.x += seat * 0.06;
      // Les canons qui basculent, le barillet qui sort : ouverts au début, refermés d'un coup à la fin
      if (gun.hinge) {
        const open = ease(0.1, 0.24) - ease(0.76, 0.84);
        gun.hinge.rotation[gun.hingeAxis] = gun.hingeAxis === "x" ? -open * 0.55 : open * 1.3;
      }
      // Le fusil à pompe : on réarme à la fin
      if (t > 0.84) pumpBack = Math.sin(((t - 0.84) / 0.16) * Math.PI) * 0.09;
    } else {
      if (gun.mag) {
        gun.mag.position.y = gun.magRest.y;
        gun.mag.visible = true;
      }
      if (gun.hinge) gun.hinge.rotation[gun.hingeAxis] = 0;
    }
    if (gun.pump) gun.pump.position.z = gun.pumpRest + pumpBack;
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
  viewFlash(weapon: WeaponId, quiet = false) {
    // Au silencieux : pas de flamme, à peine une lueur
    if (quiet) return;
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
    grassTime.value = this.t;
    this.rain?.update(dt, this.camera);
    this.snow?.update(dt, this.camera);
    this.updateViewFx(dt);
    this.skyMat.uniforms.time!.value = this.t;
    this.map.update(this.t);
    if (this.post) {
      // Le soleil à l'écran : ses rayons ne valent que s'il est devant soi, et faiblissent vers les bords
      const p = this.tmp.copy(this.sunDir).multiplyScalar(300).add(this.camera.position).project(this.camera);
      const facing = this.tmp.set(0, 0, -1).applyQuaternion(this.camera.quaternion).dot(this.sunDir);
      const onScreen = Math.max(0, 1 - Math.max(Math.abs(p.x), Math.abs(p.y)) / 1.6);
      this.post.setSun(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, facing > 0 ? onScreen * Math.min(1, facing * 2) * this.rayPower : 0);
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
    if (this.grass) {
      this.grass.geometry.dispose();
      (this.grass.material as THREE.Material).dispose();
    }
    this.rain?.dispose();
    this.snow?.dispose();
    this.post?.dispose();
    this.skyMat.dispose();
    this.env.dispose();
    // Tout le reste (caisses, bidons, dépôts, drapeaux, effets, l'arme en main, les textures gardées par les modules) :
    // le prochain moteur reprend le même canvas, donc le même contexte, où ce qui n'est pas libéré resterait orphelin.
    // Une matière ou une texture partagée, libérée ici, est simplement renvoyée à la carte graphique à sa prochaine image.
    for (const root of [this.scene, this.vmScene]) disposeTree(root);
    this.renderer.dispose();
  }
}

/** Libère les géométries, matières et textures de tout ce qui est sous `root` */
function disposeTree(root: THREE.Object3D) {
  const done = new Set<unknown>();
  const free = (x: { dispose: () => void } | null | undefined) => {
    if (!x || done.has(x)) return;
    done.add(x);
    x.dispose();
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    free(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) free(v);
      free(mat);
    }
  });
  if (root instanceof THREE.Scene) {
    if (root.background instanceof THREE.Texture) free(root.background);
    if (root.environment instanceof THREE.Texture) free(root.environment);
  }
}

/** Un bras, une manche : un tronc de cône du coude au poignet, qui s'affine, avec `folds` plis du tissu */
function limb(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, parent: THREE.Object3D, folds = 0) {
  const d = new THREE.Vector3().subVectors(to, from);
  const len = d.length();
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.0001, 0)];
  const n = folds > 0 ? 16 : 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r = r0 + (r1 - r0) * t;
    if (folds > 0) r *= 1 + 0.07 * Math.sin(t * Math.PI * folds * 2) * Math.sin(t * Math.PI);
    pts.push(new THREE.Vector2(r, t * len));
  }
  pts.push(new THREE.Vector2(0.0001, len));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), mat);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(m);
  return m;
}

/** La lettre d'un drapeau de la conquête : blanche dans un rond, teintée ensuite aux couleurs de qui le tient */
function letterMaterial(letter: string): THREE.SpriteMaterial {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fillStyle = "rgba(0,0,0,.5)";
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = "#fff";
  g.stroke();
  g.fillStyle = "#fff";
  g.font = "bold 32px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true });
}

let pinMat: THREE.SpriteMaterial | null = null;
/** Un repère : une épingle jaune cerclée de noir, la pointe en bas sur l'endroit visé */
function pinMaterial(): THREE.SpriteMaterial {
  if (pinMat) return pinMat;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 92;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.arc(32, 30, 24, Math.PI * 0.82, Math.PI * 0.18);
  g.lineTo(32, 88);
  g.closePath();
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,.8)";
  g.stroke();
  g.fillStyle = "#ffd23a";
  g.fill();
  g.beginPath();
  g.arc(32, 30, 9, 0, Math.PI * 2);
  g.fillStyle = "#3a2c00";
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  pinMat = new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true });
  return pinMat;
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

/** Une tache de lumière ronde, pleine au centre et qui s'efface (le halo d'une ampoule, sa flaque au sol) */
let glowTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** Un dépôt de munitions : des caisses bâchées, cerclées de bandes rouges et blanches, un poste radio et son antenne */
function buildDepot(low: boolean): THREE.Group {
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: "#4b5134", roughness: 0.85 });
  const tarp = new THREE.MeshStandardMaterial({ color: "#5d6146", roughness: 0.95 });
  const red = new THREE.MeshStandardMaterial({ color: "#b8241c", roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: "#e8e4da", roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: "#26282a", roughness: 0.5, metalness: 0.5 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.rotation.y = ry;
    g.add(b);
    return b;
  };
  box(1.3, 0.6, 0.8, olive, -0.35, 0.3, 0);
  box(1.0, 0.55, 0.75, olive, 0.6, 0.28, 0.2, 0.2);
  box(1.1, 0.5, 0.7, tarp, -0.2, 0.85, 0.05, -0.1);
  // Les bandes de danger
  for (let k = 0; k < 5; k++) box(0.14, 0.12, 0.82, k % 2 ? white : red, -0.9 + k * 0.28, 0.42, 0);
  // Le poste radio, son antenne, son voyant
  box(0.4, 0.3, 0.3, dark, 0.55, 0.7, 0.15, 0.2);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.8, 5), dark);
  ant.position.set(0.66, 1.25, 0.1);
  g.add(ant);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = !low;
      o.receiveShadow = true;
    }
  });
  return g;
}

/** Ce qu'il reste d'un dépôt qui a sauté : des caisses noircies, éventrées, de travers */
function buildDepotWreck(): THREE.Group {
  const g = new THREE.Group();
  const burnt = new THREE.MeshStandardMaterial({ color: "#1d1b18", roughness: 0.95 });
  const ash = new THREE.MeshStandardMaterial({ color: "#3a3631", roughness: 1 });
  for (const [w, h, d, x, z, ry, rz] of [
    [1.1, 0.35, 0.7, -0.4, 0.1, 0.3, 0.25],
    [0.8, 0.3, 0.6, 0.6, -0.3, -0.5, -0.3],
    [0.5, 0.2, 0.9, 0.1, 0.6, 1.1, 0.1],
  ] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), burnt);
    b.position.set(x, h / 2, z);
    b.rotation.set(0, ry, rz);
    g.add(b);
  }
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), ash);
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.02;
  g.add(scorch);
  return g;
}

/** Deux caisses de munitions vert armée, l'une sur l'autre, cerclées de jaune, aux poignées de corde */
function buildAmmoCrates(low: boolean): THREE.Group {
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: "#4a5233", roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2f3421", roughness: 0.85 });
  const yellow = new THREE.MeshStandardMaterial({ color: "#d8b23a", roughness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: "#3a3836", roughness: 0.45, metalness: 0.7 });
  const crate = (w: number, h: number, d: number, y: number, ry: number) => {
    const c = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), olive);
    body.position.y = h / 2;
    c.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02), dark);
    lid.position.y = h - 0.02;
    c.add(lid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.05, d + 0.01), yellow);
    band.position.y = h * 0.45;
    c.add(band);
    if (!low)
      for (const s of [-1, 1]) {
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.02), steel);
        latch.position.set(s * w * 0.3, h - 0.06, d / 2 + 0.01);
        c.add(latch);
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 10, Math.PI), dark);
        handle.position.set(s * (w / 2 + 0.01), h * 0.7, 0);
        handle.rotation.set(0, Math.PI / 2, 0);
        c.add(handle);
      }
    c.position.y = y;
    c.rotation.y = ry;
    g.add(c);
  };
  crate(0.75, 0.42, 0.45, 0, 0);
  crate(0.6, 0.34, 0.38, 0.42, 0.25);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = !low;
      o.receiveShadow = true;
    }
  });
  return g;
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

let crossMat: THREE.SpriteMaterial | null = null;
/** La croix verte d'un coéquipier à relever */
function crossMaterial(): THREE.SpriteMaterial {
  if (crossMat) return crossMat;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,.7)";
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#4fd36b";
  g.fillRect(25, 12, 14, 40);
  g.fillRect(12, 25, 40, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  crossMat = new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true });
  return crossMat;
}
