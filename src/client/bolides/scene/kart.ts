// Un kart dessiné : une coque arrondie à la couleur de sa place, des pontons, des pare-chocs, un aileron qui porte
// le nom du pilote, des roues qui tournent et braquent, le pilote (fait d'après son avatar) au volant, et tout ce
// qui bouge : suspension, tangage, roulis, dérapage, figure en l'air, tête-à-queue, étincelles, flammes, bouclier.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AvatarConfig } from "../../../shared/avatar.ts";
import type { SkinId, VehicleId } from "../../../shared/games/bolides/garage.ts";
import type { ItemKind } from "../../../shared/games/bolides/items.ts";
import { driftLevel, SPIN_TIME, TOP_SPEED, type Kart } from "../../../shared/games/bolides/physics.ts";
import { backOut, flatScale, giantScale } from "./fxCurves.ts";
import type { ItemModel, ItemModels } from "./itemModels.ts";
import { mergeStatic } from "./merge.ts";
import { PilotModel } from "./pilot.ts";
import { paintFor } from "./skins.ts";
import { buildVehicle, type VehicleSpec } from "./vehicles.ts";
import { blobTexture, flameBurstTexture, sparkTexture } from "./textures.ts";

export interface KartLook {
  color: string;
  name: string;
  /** Son visage (avatar ou photo), déjà dessiné sur une toile, pour l'étiquette */
  face: HTMLCanvasElement | null;
  /** Son avatar, pour le pilote en 3D, et la peau de sa tête déjà peinte */
  avatar: AvatarConfig;
  head: HTMLCanvasElement | null;
  /** Le véhicule choisi et son skin */
  vehicle: VehicleId;
  skin: SkinId;
  /** Le kart du joueur lui-même : pas d'étiquette au-dessus */
  me: boolean;
  /** C'est la nuit : les phares sont allumés */
  night?: boolean;
}

/** Ce qu'on sait d'un kart à cette image, en plus de sa conduite */
export interface KartExtras {
  /** Son volant (estimé pour les autres) */
  steer: number;
  shield: boolean;
  /** Arrivé : le pilote fête ça */
  done: boolean;
  /** Sous l'arc-en-ciel */
  star?: boolean;
  /** La potion géante, l'aimant */
  giant?: boolean;
  magnet?: boolean;
  /** L'objet qu'il transporte (on le voit sur le kart) */
  held?: ItemKind | null;
  /** Touché à l'instant : intouchable un moment (il clignote) */
  safe?: boolean;
  /** Sous l'eau : l'hélice tourne */
  under?: boolean;
}

const SPARK_COLORS = [0xfff3c4, 0x45c8ff, 0xff9a2e, 0xc77dff];
let sharedSpark: THREE.Texture | null = null;
let sharedBlob: THREE.Texture | null = null;
let sharedFlame: THREE.Texture | null = null;

/**
 * La bulle du bouclier (et de l'arc-en-ciel) : seul son bord brille, parcouru d'un quadrillage et d'un reflet qui monte.
 * Le kart reste à ses vraies couleurs à l'intérieur.
 */
function bubbleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uStar: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalMatrix * normal;
        vV = -mv.xyz;
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHit;
      uniform float uStar;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      vec3 hue(float h) {
        return clamp(abs(fract(vec3(h) + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
      }
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.3);
        vec3 d = normalize(vP);
        float lon = abs(sin(atan(d.z, d.x) * 6.0 + d.y * 2.0));
        float lat = abs(sin(asin(clamp(d.y, -1.0, 1.0)) * 7.0));
        float grid = 1.0 - smoothstep(0.0, 0.1, min(lon, lat));
        float sweep = smoothstep(0.86, 1.0, sin(d.y * 4.5 - uTime * 3.2));
        vec3 color = mix(vec3(0.18, 0.66, 1.0), vec3(0.86, 0.98, 1.0), rim);
        color = mix(color, hue(d.x * 0.45 + d.y * 0.4 + uTime * 1.2), uStar);
        float a = rim * 1.15 + grid * (0.08 + rim * 0.55) + sweep * 0.14 + uHit * 0.8;
        gl_FragColor = vec4(color, clamp(a, 0.0, 1.0));
      }`,
  });
}

/** L'étiquette au-dessus d'un kart : son visage dans un rond, et son nom */
function tagCanvas(look: KartLook): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 80;
  const g = c.getContext("2d")!;
  g.font = "700 30px 'Libre Franklin Variable', system-ui, sans-serif";
  const textW = Math.min(220, g.measureText(look.name).width);
  const w = 70 + textW + 22;
  const x = (320 - w) / 2;
  g.fillStyle = "rgba(20,14,10,0.78)";
  g.beginPath();
  g.roundRect(x, 8, w, 64, 32);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(x + 32, 40, 26, 0, Math.PI * 2);
  g.clip();
  if (look.face) g.drawImage(look.face, x + 6, 14, 52, 52);
  else {
    g.fillStyle = look.color;
    g.fillRect(x + 6, 14, 52, 52);
  }
  g.restore();
  g.strokeStyle = look.color;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(x + 32, 40, 26, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#fff";
  g.textBaseline = "middle";
  g.fillText(look.name, x + 66, 41, 220);
  return c;
}

/** L'arrière de l'aileron : le nom du pilote en grand, sur sa couleur */
function spoilerCanvas(look: KartLook): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = look.color;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = "rgba(0,0,0,0.22)";
  g.fillRect(0, 76, 512, 20);
  g.fillStyle = "#fff";
  g.font = "800 60px 'Libre Franklin Variable', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(look.name.toUpperCase(), 256, 42, 480);
  return c;
}

/** Un pneu au profil arrondi (tourné autour de l'axe x) */
function tyreGeometry(radius: number, width: number): THREE.LatheGeometry {
  const inner = radius * 0.55;
  const w = width / 2;
  const r = Math.min(0.08, w * 0.6);
  const pts: THREE.Vector2[] = [new THREE.Vector2(inner, -w)];
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - r + Math.cos(a) * r, -w + r + Math.sin(a) * r));
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - r + Math.cos(a) * r, w - r + Math.sin(a) * r));
  }
  pts.push(new THREE.Vector2(inner, w));
  const geo = new THREE.LatheGeometry(pts, 20);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

export class KartModel {
  readonly group = new THREE.Group();
  /** Le pivot au milieu du kart : il saute, penche, tangue et tourne sur lui-même ; la caisse est dedans */
  private tilt = new THREE.Group();
  private body = new THREE.Group();
  private pilot: PilotModel;
  private wheels: THREE.Group[] = [];
  private front: THREE.Group[] = [];
  private sparks: THREE.Points[] = [];
  private flames: THREE.Mesh[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private shield: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Le bouclier vient de casser : il flashe encore un instant */
  private bubbleHit = 0;
  /** Les gerbes de flammes du turbo, vues de derrière */
  private flameGlows: THREE.Sprite[] = [];
  private flameGlowMat!: THREE.SpriteMaterial;
  /** L'objet transporté : son support, les exemplaires déjà sortis, celui qu'on montre, et son arrivée */
  private heldSlot = new THREE.Group();
  private heldBase = 1;
  private heldModels = new Map<ItemKind, ItemModel>();
  private heldNow: ItemKind | null = null;
  private heldPop = 0;
  private heldOn = true;
  /** Écrasé par un géant : depuis combien de temps (-1 : il ne l'est pas) */
  private flatT = -1;
  private wasGiant = false;
  private everGiant = false;
  private growT = 0;
  /** L'ombre douce posée sous le kart (elle reste au sol quand il saute) */
  private blob: THREE.Mesh;
  private blobMat: THREE.MeshBasicMaterial;
  private blobAlpha: number;
  private tag: THREE.Sprite | null = null;
  private disposables: { dispose: () => void }[] = [];
  private roll = 0;
  /** La suspension : l'écart et sa vitesse ; le tangage ; le pivot du dérapage ; la figure en cours */
  private squash = 0;
  private squashV = 0;
  private pitch = 0;
  private yawOff = 0;
  private lastV = 0;
  private lastAir = 0;
  private trickT = -1;
  private wasTrick = false;
  /** L'effacement en cours, et l'état d'origine de chaque matière */
  private alpha = 1;
  private solid = new Map<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();
  /** La peinture, et sa couleur d'origine (l'arc-en-ciel la fait changer) */
  private paint!: THREE.MeshStandardMaterial;
  private tickPaint: (time: number) => void = () => {};
  private starShown = false;
  private spec!: VehicleSpec;
  private spinner: THREE.Group | null = null;
  private radii: number[] = [];
  private leanNow = 0;
  /** Les ondes de l'aimant, qui se resserrent sur le véhicule */
  private magnetRings: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private magnetR = 2;
  /** Le deltaplane, replié tant qu'on ne vole pas, et l'hélice sous l'eau */
  private wing = new THREE.Group();
  private wingOpen = 0;
  private propeller!: THREE.Mesh;
  /** Le drone de dépannage, qui descend chercher le kart ; le câble qui l'y accroche */
  private drone = new THREE.Group();
  private droneOpen = 0;
  private droneRotors: THREE.Mesh | null = null;
  private droneBase = 3;
  private beam: THREE.Mesh | null = null;
  /** La taille du véhicule (la potion géante le fait grandir, en douceur) */
  private growth = 1;

  constructor(
    look: KartLook,
    shadows: boolean,
    private items: ItemModels | null = null,
  ) {
    const keep = <T extends { dispose: () => void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };
    const set = paintFor(look.skin, look.color);
    const paint = keep(set.paint);
    const paintDark = keep(set.paintDark);
    this.paint = paint;
    this.tickPaint = set.tick;
    const dark = keep(new THREE.MeshStandardMaterial({ color: 0x25272c, roughness: 0.6 }));
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0xc5ccd4, roughness: 0.28, metalness: 0.85 }));
    const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.92 }));
    const seat = keep(new THREE.MeshStandardMaterial({ color: 0x3a2f2a, roughness: 0.8 }));
    const white = keep(new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.4 }));
    const glass = keep(
      new THREE.MeshStandardMaterial({ color: 0xbfe3f5, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.38 }),
    );
    const lamp = keep(new THREE.MeshStandardMaterial({ color: 0xfff4cf, emissive: 0xfff0b8, emissiveIntensity: 1.3 }));
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, cast = shadows) => {
      const m = new THREE.Mesh(keep(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      this.body.add(m);
      return m;
    };

    // Le nom du pilote, à l'arrière
    const nameTex = keep(new THREE.CanvasTexture(spoilerCanvas(look)));
    nameTex.colorSpace = THREE.SRGBColorSpace;
    nameTex.anisotropy = 4;
    const name = keep(new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.35 }));

    // La carrosserie du véhicule choisi
    const spec = buildVehicle(look.vehicle, add, { paint, paintDark, dark, metal, seat, white, rubber, glass, lamp, name });
    this.spec = spec;
    if (spec.spinner) {
      this.spinner = spec.spinner;
      this.spinner.traverse((o) => {
        if (o instanceof THREE.Mesh) keep(o.geometry);
      });
      this.body.add(this.spinner);
    }
    // Les flammes du turbo, à la sortie des pots
    this.flameMat = keep(new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, depthWrite: false }));
    const flameGeo = keep(new THREE.ConeGeometry(0.14, 0.8, 10));
    for (const [x, y, z] of spec.flames) {
      const flame = new THREE.Mesh(flameGeo, this.flameMat);
      flame.position.set(x, y, z);
      flame.rotation.x = -Math.PI / 2 + 0.25;
      flame.visible = false;
      this.body.add(flame);
      this.flames.push(flame);
    }
    // De derrière, une flamme n'est qu'un rond : une gerbe en étoile, toujours face à la caméra
    sharedFlame ??= flameBurstTexture();
    this.flameGlowMat = keep(
      new THREE.SpriteMaterial({
        map: sharedFlame,
        color: new THREE.Color(1.25, 1.02, 0.78),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    for (const [x, y, z] of spec.flames) {
      const glow = new THREE.Sprite(this.flameGlowMat);
      glow.position.set(x, y, z - 0.25);
      glow.visible = false;
      this.body.add(glow);
      this.flameGlows.push(glow);
    }
    // Toutes ces pièces bougent ensemble : une forme par matière (les flammes restent à part, elles s'allument)
    mergeStatic(this.body, keep, [...this.flames, ...(this.spinner ? [this.spinner] : [])]);

    // Le pilote et son volant
    this.pilot = new PilotModel(look.avatar, look.head, look.color, keep, shadows, spec.rig);
    this.body.add(this.pilot.group);

    // Les roues : celles de devant braquent
    const rimGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 14));
    rimGeo.rotateZ(Math.PI / 2);
    const capMat = keep(new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.3, metalness: 0.4 }));
    const tyres = new Map<string, THREE.BufferGeometry>();
    for (const w of spec.wheels) {
      const key = `${w.r}-${w.w}`;
      let tyre = tyres.get(key);
      if (!tyre) {
        tyre = keep(tyreGeometry(w.r, w.w));
        tyres.set(key, tyre);
      }
      const holder = new THREE.Group();
      holder.position.set(w.x, w.r, w.z);
      const spin = new THREE.Group();
      const t = new THREE.Mesh(tyre, rubber);
      t.castShadow = shadows;
      spin.add(t);
      const rim = new THREE.Mesh(rimGeo, metal);
      rim.scale.set(w.w * 0.9, w.r * 0.55, w.r * 0.55);
      spin.add(rim);
      const cap = new THREE.Mesh(rimGeo, capMat);
      cap.scale.set(w.w * 0.94, w.r * 0.25, w.r * 0.25);
      spin.add(cap);
      holder.add(spin);
      this.body.add(holder);
      this.wheels.push(spin);
      this.radii.push(w.r);
      if (w.front) this.front.push(holder);
    }

    // Les étincelles du dérapage, derrière chaque roue arrière
    sharedSpark ??= sparkTexture();
    for (const at of spec.sparks) {
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
      const pts = new THREE.Points(
        geo,
        keep(
          new THREE.PointsMaterial({
            size: 0.42,
            map: sharedSpark,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            color: 0xffffff,
          }),
        ),
      );
      pts.position.set(at.x, 0.12, at.z);
      pts.visible = false;
      this.body.add(pts);
      this.sparks.push(pts);
    }
    // Le bouclier
    this.shield = new THREE.Mesh(keep(new THREE.SphereGeometry(spec.shield[0], 28, 20)), keep(bubbleMaterial()));
    this.shield.position.y = spec.shield[1];
    this.shield.visible = false;
    this.body.add(this.shield);
    // L'aimant : des ondes bleues qui se resserrent sur le véhicule (ça attire)
    this.magnetR = spec.shield[0] * 2.6;
    const ringGeo = keep(new THREE.RingGeometry(0.955, 1, 48).rotateX(-Math.PI / 2));
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        ringGeo,
        keep(
          new THREE.MeshBasicMaterial({
            color: 0x6fd2ff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
          }),
        ),
      );
      ring.position.y = 0.3;
      ring.visible = false;
      ring.userData.noFade = true;
      this.group.add(ring);
      this.magnetRings.push(ring);
    }
    // L'objet transporté flotte à côté du pilote : on le voit de derrière, et il ne cache pas la route
    this.heldBase = spec.shield[1] + 0.2;
    this.heldSlot.position.set(spec.shield[0] * 0.5, this.heldBase, -0.55);
    this.heldSlot.visible = false;
    this.tilt.add(this.heldSlot);
    this.body.position.y = -spec.pivot;
    this.tilt.add(this.body);
    this.group.add(this.tilt);
    this.buildWing(look.color, spec.tag + 0.15, keep);
    this.buildPropeller(spec.flames[0] ?? [0, 0.55, -1.45], keep);
    this.buildDrone(spec.tag + 1.15, keep);
    if (look.night) this.buildLights(spec.flames[0]?.[2] ?? -1.4, keep);
    sharedBlob ??= blobTexture();
    this.blobAlpha = shadows ? 0.4 : 0.7;
    this.blobMat = keep(new THREE.MeshBasicMaterial({ map: sharedBlob, transparent: true, depthWrite: false, opacity: this.blobAlpha }));
    this.blob = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.4, 3.3)), this.blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;
    this.group.add(this.blob);
    if (!look.me) {
      const tex = keep(new THREE.CanvasTexture(tagCanvas(look)));
      tex.colorSpace = THREE.SRGBColorSpace;
      this.tag = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true })));
      this.tag.scale.set(3.2, 0.8, 1);
      this.tag.position.y = spec.tag;
      this.tag.renderOrder = 10;
      this.group.add(this.tag);
    }
  }

  /** Une aile delta à sa couleur, et sa structure */
  private buildWing(color: string, y: number, keep: <T extends { dispose: () => void }>(x: T) => T) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#fff4dc";
    for (let k = 0; k < 4; k++) g.fillRect(0, 8 + k * 32, 128, 14);
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const sail = keep(new THREE.BufferGeometry());
    const nose = [0, 0.1, 1.75];
    const left = [-3.1, -0.32, -1.15];
    const mid = [0, 0.32, -0.6];
    const right = [3.1, -0.32, -1.15];
    sail.setAttribute("position", new THREE.Float32BufferAttribute([...nose, ...left, ...mid, ...nose, ...mid, ...right], 3));
    sail.setAttribute("uv", new THREE.Float32BufferAttribute([0.5, 1, 0, 0, 0.5, 0.2, 0.5, 1, 0.5, 0.2, 1, 0], 2));
    sail.computeVertexNormals();
    this.wing.add(new THREE.Mesh(sail, keep(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }))));
    const frame = keep(new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
    const bar = (a: THREE.Vector3, b: THREE.Vector3) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.035, 0.035, len, 5)), frame);
      m.position.copy(a).lerp(b, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.wing.add(m);
    };
    const hub = new THREE.Vector3(0, 0.1, 0.1);
    bar(new THREE.Vector3(...(left as [number, number, number])), new THREE.Vector3(...(right as [number, number, number])));
    bar(new THREE.Vector3(...(nose as [number, number, number])), new THREE.Vector3(...(mid as [number, number, number])));
    bar(hub, new THREE.Vector3(-0.42, -y * 0.55, 0.2));
    bar(hub, new THREE.Vector3(0.42, -y * 0.55, 0.2));
    this.wing.position.y = y;
    this.wing.visible = false;
    this.group.add(this.wing);
  }

  /** Le drone : un petit châssis jaune à quatre rotors, un gyrophare, et un câble qui descend vers le kart */
  private buildDrone(y: number, keep: <T extends { dispose: () => void }>(x: T) => T) {
    const yellow = keep(new THREE.MeshStandardMaterial({ color: 0xf2b51c, roughness: 0.4, metalness: 0.15 }));
    const dark = keep(new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
    const body = new THREE.Mesh(keep(new THREE.BoxGeometry(1.1, 0.34, 1.1)), yellow);
    this.drone.add(body);
    const light = new THREE.Mesh(
      keep(new THREE.SphereGeometry(0.15, 10, 8)),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.6, 0.2) })),
    );
    light.position.y = 0.27;
    this.drone.add(light);
    const armGeo = keep(new THREE.BoxGeometry(2.6, 0.08, 0.12));
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const arm = new THREE.Mesh(armGeo, dark);
      arm.rotation.y = a;
      this.drone.add(arm);
    }
    // Les quatre rotors : des disques flous, en une seule forme
    const disc = new THREE.CylinderGeometry(0.62, 0.62, 0.02, 18);
    const discs = [
      [-0.92, -0.92],
      [0.92, -0.92],
      [-0.92, 0.92],
      [0.92, 0.92],
    ].map(([x, z]) => disc.clone().translate(x!, 0.12, z!).toNonIndexed());
    disc.dispose();
    const rotors = new THREE.Mesh(
      keep(mergeGeometries(discs, false)!),
      keep(new THREE.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.42, depthWrite: false })),
    );
    this.drone.add(rotors);
    this.droneRotors = rotors;
    const cable = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, y - 0.8, 5).translate(0, -(y - 0.8) / 2 - 0.15, 0)), dark);
    this.drone.add(cable);
    const hook = new THREE.Mesh(keep(new THREE.TorusGeometry(0.16, 0.05, 6, 12)), dark);
    hook.position.y = -(y - 0.8) - 0.3;
    this.drone.add(hook);
    this.droneBase = y;
    this.drone.position.y = y;
    this.drone.visible = false;
    this.group.add(this.drone);
  }

  /** La nuit : deux phares devant, deux feux rouges derrière, et le pinceau de lumière sur la route */
  private buildLights(rear: number, keep: <T extends { dispose: () => void }>(x: T) => T) {
    const lamp = keep(new THREE.SphereGeometry(0.1, 8, 6));
    const white = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 1.6) }));
    const red = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.08, 0.06) }));
    const front = Math.abs(rear) + 0.1;
    for (const side of [-1, 1]) {
      const a = new THREE.Mesh(lamp, white);
      a.position.set(side * 0.45, 0.55, front);
      const b = new THREE.Mesh(lamp, red);
      b.position.set(side * 0.48, 0.6, rear);
      this.tilt.add(a, b);
    }
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, "rgba(255,226,170,0.26)");
    grad.addColorStop(1, "rgba(255,226,170,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(24, 128);
    g.lineTo(40, 128);
    g.lineTo(64, 0);
    g.lineTo(0, 0);
    g.closePath();
    g.fill();
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const beam = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(5.5, 11).rotateX(-Math.PI / 2).translate(0, 0.1, front + 5.5)),
      keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })),
    );
    // Sa toile a le pied en bas : le pied doit être près du kart
    this.group.add(beam);
    this.beam = beam;
  }

  /** L'hélice, à l'arrière : elle ne sort que sous l'eau */
  private buildPropeller(at: [number, number, number], keep: <T extends { dispose: () => void }>(x: T) => T) {
    const blade = new THREE.BoxGeometry(0.12, 0.42, 0.03).translate(0, 0.22, 0);
    const parts = [0, 1, 2].map((k) => blade.clone().rotateZ((k / 3) * Math.PI * 2));
    const hub = new THREE.SphereGeometry(0.11, 8, 6);
    const flat = [...parts, hub].map((g) => (g.index ? g.toNonIndexed() : g));
    const geo = keep(mergeGeometries(flat, false)!);
    this.propeller = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ color: 0xf2c94c, metalness: 0.6, roughness: 0.3 })));
    this.propeller.position.set(0, at[1], at[2] - 0.3);
    this.propeller.visible = false;
    this.tilt.add(this.propeller);
  }

  /** Le kart à cet instant : sa place, ce qu'il fait, et ses effets */
  update(k: Kart, dt: number, x: KartExtras, time: number) {
    this.group.position.set(k.x, k.y + k.air + 0.02, k.z);
    this.group.rotation.y = k.h;
    // L'ombre reste sur la route, plus petite et plus pâle quand le kart est haut
    this.blob.visible = k.air > -0.05;
    this.blob.position.y = -k.air + 0.07;
    this.blob.scale.setScalar(1 / (1 + Math.max(0, k.air) * 0.22));
    this.blobMat.opacity = this.blobAlpha / (1 + Math.max(0, k.air) * 0.6);
    const step = Math.max(1e-3, dt);
    // Le tangage : le nez se lève quand on accélère, plonge au freinage
    const accel = (k.v - this.lastV) / step;
    this.lastV = k.v;
    this.pitch += (Math.max(-0.07, Math.min(0.07, -accel * 0.004)) - this.pitch) * Math.min(1, dt * 6);
    // La suspension : un ressort amorti, secoué à l'atterrissage et dans l'herbe
    if (this.lastAir > 0.35 && k.air === 0) this.squashV -= 2.2 + this.lastAir * 0.8;
    this.lastAir = k.air;
    if (k.offroad && k.v > 4) this.squashV += (Math.random() - 0.5) * 2.4 * Math.min(1, k.v / TOP_SPEED);
    this.squashV += (-this.squash * 220 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    this.squash = Math.max(-0.18, Math.min(0.18, this.squash));
    // La figure : un tonneau complet, le pilote les bras en l'air
    if (k.trick && !this.wasTrick) this.trickT = 0;
    this.wasTrick = k.trick;
    let barrel = 0;
    if (this.trickT >= 0) {
      this.trickT += dt;
      const f = Math.min(1, this.trickT / 0.5);
      barrel = (1 - (1 - f) * (1 - f)) * Math.PI * 2;
      if (f >= 1) this.trickT = -1;
    }
    // Le tête-à-queue : deux tours complets ; le dérapage : le kart pivote vers l'intérieur, en douceur
    const spinAngle = k.spin > 0 ? (1 - k.spin / SPIN_TIME) * Math.PI * 4 : 0;
    // Plus on serre le dérapage, plus le kart se met en travers
    const into = Math.max(-1, Math.min(1, x.steer * k.drift));
    this.yawOff += ((k.drift !== 0 ? -k.drift * (0.34 + 0.14 * into) : 0) - this.yawOff) * Math.min(1, dt * 9);
    const hop = k.hop > 0 ? Math.sin((1 - k.hop / 0.22) * Math.PI) * 0.32 : 0;
    const hover = this.spec.hover ? 0.42 + Math.sin(time * 2.6 + this.roll * 0.02) * 0.09 : 0;
    this.tilt.position.y = this.spec.pivot + Math.max(0, hop) + this.squash + hover;
    this.tilt.rotation.set(
      this.pitch + (k.glide ? -0.14 : k.air > 0.3 ? -0.08 : 0),
      spinAngle + this.yawOff,
      // La moto et la soucoupe se couchent dans les virages (vers la droite : z positif) ; les autres roulent un peu
      (this.spec.lean > 0
        ? (this.leanNow += (Math.max(-1.1, Math.min(1.1, x.steer + k.drift * 0.45)) * this.spec.lean - this.leanNow) * Math.min(1, dt * 7))
        : Math.max(-0.12, Math.min(0.12, k.slip * 0.02))) +
        barrel +
        (k.glide ? x.steer * 0.32 : 0),
      "YXZ",
    );
    this.roll += k.v * dt;
    this.wheels.forEach((w, i) => (w.rotation.x = this.roll / this.radii[i]!));
    if (this.spinner) this.spinner.rotation.y = time * 2.4;
    this.tickPaint(time);
    for (const f of this.front) f.rotation.y = -x.steer * 0.45;
    // Les flammes du turbo, qui vacillent
    const boosting = k.boost > 0;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) f.scale.set(1, 0.75 + Math.random() * 0.7, 1);
    }
    for (const g of this.flameGlows) {
      g.visible = boosting;
      if (boosting) g.scale.setScalar(0.5 + Math.random() * 0.34);
    }
    if (boosting) this.flameGlowMat.rotation = time * 17;
    if (boosting) this.flameMat.color.setHex(Math.random() < 0.5 ? 0xffb347 : 0xffe07a);
    // Les étincelles : leur couleur dit le niveau du mini-turbo qui charge
    const drifting = k.drift !== 0 && k.spin === 0 && k.air < 0.3;
    const level = drifting ? driftLevel(k.charge) : 0;
    for (const p of this.sparks) {
      p.visible = drifting;
      if (!drifting) continue;
      (p.material as THREE.PointsMaterial).color.setHex(SPARK_COLORS[level]!);
      (p.material as THREE.PointsMaterial).size = level === 0 ? 0.26 : 0.42 + level * 0.1;
      const arr = (p.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = (Math.random() - 0.5) * 0.5;
        arr[i + 1] = Math.random() * 0.45;
        arr[i + 2] = -Math.random() * (0.6 + level * 0.25);
      }
      p.geometry.attributes.position!.needsUpdate = true;
    }
    // L'arc-en-ciel : toutes les couleurs, très vite, et une lueur
    const star = Boolean(x.star);
    if (star) this.paint.emissive.setHSL((time * 1.8) % 1, 0.95, 0.42);
    else if (this.starShown) this.paint.emissive.setHex(0x000000);
    this.starShown = star;
    // La potion : il grandit par à-coups, et rétrécit de même
    const giant = Boolean(x.giant);
    if (giant !== this.wasGiant) {
      this.wasGiant = giant;
      this.everGiant = true;
      this.growT = 0;
    }
    this.growT += dt;
    this.growth = this.everGiant ? giantScale(giant, this.growT) : 1;
    this.group.scale.setScalar(this.growth);
    // Écrasé : plat comme une crêpe, puis il se regonfle d'un coup
    if (this.flatT >= 0) {
      this.flatT += dt;
      const flat = this.flatT > 0.8 ? 1 : flatScale(this.flatT);
      this.tilt.scale.set(1 + (1 - flat) * 0.35, flat, 1 + (1 - flat) * 0.35);
      if (this.flatT > 0.8) this.flatT = -1;
    }
    this.showHeldNow(x.held ?? null, dt, time);
    // Le deltaplane s'ouvre d'un coup, puis ondule et penche dans les virages
    this.wingOpen += ((k.glide ? 1 : 0) - this.wingOpen) * Math.min(1, dt * (k.glide ? 11 : 16));
    this.wing.visible = this.wingOpen > 0.03;
    if (this.wing.visible) {
      this.wing.scale.set(this.wingOpen, 0.5 + 0.5 * this.wingOpen, 0.4 + 0.6 * this.wingOpen);
      this.wing.rotation.set(Math.sin(time * 5) * 0.03 + 0.32, 0, -x.steer * 0.28);
    }
    if (this.beam) this.beam.visible = k.air < 0.6;
    // Le drone descend du ciel, porte le kart, puis repart
    const called = k.rescue > 0 ? 1 : 0;
    this.droneOpen += (called - this.droneOpen) * Math.min(1, dt * (called ? 9 : 5));
    this.drone.visible = this.droneOpen > 0.02;
    if (this.drone.visible) {
      this.drone.position.y = this.droneBase + (1 - this.droneOpen) * 12 + Math.sin(time * 7) * 0.05;
      this.drone.rotation.set(Math.sin(time * 3.1) * 0.05, time * 0.8, Math.cos(time * 2.7) * 0.05);
      if (this.droneRotors) this.droneRotors.rotation.y = time * 6;
    }
    this.propeller.visible = Boolean(x.under);
    if (x.under) this.propeller.rotation.z = time * 34;
    this.magnetRings.forEach((ring, i) => {
      ring.visible = Boolean(x.magnet);
      if (!x.magnet) return;
      const u = (time * 1.25 + i / 3) % 1;
      ring.scale.setScalar(this.magnetR * (1 - u * 0.86));
      ring.material.opacity = Math.sin(u * Math.PI) * 0.85;
    });
    this.bubbleHit = Math.max(0, this.bubbleHit - dt * 4.2);
    const bubble = x.shield || star || this.bubbleHit > 0;
    this.shield.visible = bubble;
    if (bubble) {
      const u = this.shield.material.uniforms;
      u.uTime!.value = time;
      u.uHit!.value = this.bubbleHit;
      u.uStar!.value = star ? 1 : 0;
      this.shield.scale.setScalar(1 + (this.bubbleHit > 0 ? (1 - this.bubbleHit) * 0.35 : Math.sin(time * 5) * 0.012));
    }
    // Le pilote : penché dans le virage, plus fort en dérapage
    this.pilot.update({
      steer: k.spin > 0 ? 0 : x.steer,
      drift: k.drift,
      lean: Math.max(-0.26, Math.min(0.26, x.steer * 0.14 + k.drift * 0.1)),
      spinning: k.spin > 0,
      boosting,
      trick: this.trickT >= 0 || (k.trick && k.air > 0),
      celebrate: x.done,
      speed: Math.abs(k.v) / TOP_SPEED,
      time,
      dt,
    });
  }

  /** Le kart s'efface (1 : bien là, 0 : invisible) quand il est collé à la caméra */
  fade(alpha: number) {
    const a = Math.round(alpha * 20) / 20;
    if (a === this.alpha) return;
    this.alpha = a;
    this.group.visible = a > 0;
    this.group.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats || o === this.blob || o === this.shield || o.userData.noFade || o instanceof THREE.Points || o instanceof THREE.Sprite)
        return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        if (!this.solid.has(m)) this.solid.set(m, { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
        const base = this.solid.get(m)!;
        m.transparent = a < 1 || base.transparent;
        m.opacity = base.opacity * a;
        m.depthWrite = a >= 1 && base.depthWrite;
      }
    });
  }

  /** Ce qu'il transporte : il arrive en rebondissant, et flotte en se balançant */
  private showHeldNow(want: ItemKind | null, dt: number, time: number) {
    const kind = this.heldOn && this.items ? want : null;
    if (kind !== this.heldNow) {
      if (this.heldNow) this.heldModels.get(this.heldNow)!.root.visible = false;
      this.heldNow = kind;
      this.heldPop = 0;
      if (kind) {
        let model = this.heldModels.get(kind);
        if (!model) {
          model = this.items!.make(kind);
          // Ces matières sont partagées entre tous les karts : elles ne s'effacent pas avec celui-ci
          model.root.traverse((o) => (o.userData.noFade = true));
          this.heldSlot.add(model.root);
          this.heldModels.set(kind, model);
        }
        model.root.visible = true;
      }
    }
    this.heldSlot.visible = kind !== null;
    if (!kind) return;
    this.heldPop = Math.min(1, this.heldPop + dt / 0.24);
    this.heldSlot.scale.setScalar(Math.max(0.01, backOut(this.heldPop, 2.6)) * 0.58);
    this.heldSlot.position.y = this.heldBase + Math.sin(time * 3.4) * 0.06;
    this.heldSlot.rotation.set(Math.sin(time * 2.1) * 0.08, Math.PI + Math.sin(time * 1.5) * 0.45 - 0.35, Math.sin(time * 2.6) * 0.07);
  }

  /** Le bouclier casse : un dernier éclat */
  flashShield() {
    this.bubbleHit = 1;
  }

  /** Écrasé par un géant */
  crush() {
    this.flatT = 0;
  }

  /** La taille actuelle du véhicule (la caméra recule devant un géant) */
  get size() {
    return this.growth;
  }

  /** Montrer ou non ce qu'il transporte (trop loin, ça ne se verrait pas) */
  showHeld(on: boolean) {
    this.heldOn = on;
  }

  /** L'étiquette du nom : visible ou pas (on la cache quand le kart est trop loin ou trop près) */
  showTag(on: boolean) {
    if (this.tag) this.tag.visible = on;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

/** Les couleurs des karts, dans l'ordre des places à la table */
export const KART_COLORS = ["#e2483d", "#2f80ed", "#27ae60", "#f2c94c", "#9b51e0", "#f2994a", "#2fc4c4", "#eb5ea8"];
