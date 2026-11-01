import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SQUARES, type DeckId, type SpecialKind } from "../../../shared/games/capitale/board.ts";
import { play } from "../../lib/sound.ts";
import type { TokenId } from "../../../shared/games/capitale/tokens.ts";
import * as B from "./buildings.ts";
import * as C from "./city.ts";
import { tokenModel } from "./tokens.ts";
import { DIE, diceMeshes, restingQuaternion, simulateThrow, type Throw } from "./dice.ts";
import * as L from "./layout.ts";
import { drawBoard, fontsReady, hatchTexture, makeCanvas, signTexture, tagTexture } from "./textures.ts";

// La scène 3D de Capitale : le plateau, la ville au centre, les pions, les dés.
// Elle ne connaît que ce qu'on lui montre (setState) ; les animations partent des différences.

export interface ScenePlayer {
  id: string;
  color: string;
  /** Le pion choisi (le pion classique par défaut) */
  token?: TokenId;
  position: number;
  inJail: boolean;
  bankrupt: boolean;
}

export interface SceneDeed {
  owner: string | null;
  mortgaged: boolean;
  /** Les rues : leur niveau (0 à 5) et leur bâtiment spécial */
  level?: number;
  special?: { kind: SpecialKind; by: string } | null;
}

export interface SceneState {
  players: ScenePlayer[];
  /** Le joueur dont c'est le tour */
  turn: string | null;
  deeds: Record<number, SceneDeed>;
  highlight: number | null;
  /** La cagnotte de l'aire de repos, ou null si la règle n'est pas jouée */
  pot: number | null;
}

export interface SceneOptions {
  phone: boolean;
  reduced: boolean;
  onSquare: (index: number) => void;
  /** La case sous la souris (ou plus rien), et où elle est à l'écran : pour la bulle qui explique */
  onHover?: (square: number | null, x: number, y: number) => void;
  /** Ce qu'affiche l'étiquette d'une case achetable : le prix, ou le loyer chez son propriétaire */
  tagOf: (square: number) => { text: string; color: string | null; level: number; muted: boolean };
  /** La vue a été déplacée à la main (ou remise en place) : le bouton « Recentrer » apparaît ou s'en va */
  onView?: (moved: boolean) => void;
}

/** Les gros plans automatiques, au choix du joueur */
export interface CloseUps {
  /** La caméra s'approche des dés à chaque lancer */
  dice: boolean;
  /** La caméra suit le pion qui avance */
  follow: boolean;
}

/** Les villes qu'on veut voir : celles des propriétaires retenus restent en couleur, les autres passent en maquette */
export type OwnerFilter = ((owner: string) => boolean) | null;

/** Une petite animation : t va de 0 à 1 sur dur secondes */
interface Tween {
  t0: number;
  dur: number;
  step: (t: number) => void;
  done?: () => void;
}

interface Hop {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
  dur: number;
  height: number;
  /** Un son à l'arrivée */
  land: boolean;
}

interface PawnObj {
  id: string;
  group: THREE.Group;
  pos: THREE.Vector3;
  /** Où il doit aller (case et place sur la case) */
  target: THREE.Vector3;
  square: number;
  hop: Hop | null;
  queue: { to: THREE.Vector3; square: number; jump: boolean }[];
  out: boolean;
}

interface LotObj {
  parcel: C.Parcel;
  root: THREE.Group;
  /** Les bâtiments du niveau, et ce qu'ils représentent ("3:a"), tels qu'affichés */
  set: THREE.Object3D | null;
  setKey: string;
  special: THREE.Object3D | null;
  specialKey: string;
  flag: THREE.Group | null;
  sale: THREE.Group | null;
  fence: THREE.Group | null;
  outline: THREE.Mesh | null;
  shown: { owner: string | null; mortgaged: boolean };
}

/** Ce qui vit dans un bâtiment : le jet d'eau du parc, les mouettes de la décharge, la vapeur de la centrale */
interface Living {
  kind: "jet" | "birds" | "steam";
  obj: THREE.Object3D;
}

const HOP_SECONDS = 0.17;
const JUMP_SECONDS = 0.55;
/** Le zoom permis : de tout près (une rue) jusqu'à un peu plus loin que le plateau entier */
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.15;
/** La distance des gros plans, en part de la vue d'ensemble */
const DICE_CLOSE = 0.27;
const FOLLOW_CLOSE = 0.48;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** Un ressort : dépasse un peu, puis se pose */
const springOut = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const LIVERIES: Record<number, string> = { 5: "#2f5bb8", 15: "#e07a2c", 25: "#8b97a3", 35: "#c0392b" };

export class CapitaleScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private opts: SceneOptions;
  private clock = new THREE.Clock();
  private time = 0;
  private tweens: Tween[] = [];
  private disposed = false;
  /** Quelque chose a changé depuis la dernière image (en mode sobre, on ne redessine que dans ce cas) */
  private dirty = true;
  private frames = 0;
  /** La finesse du rendu : sur PC on dessine plus fin que l'écran (moins de flou), et on redescend si la machine peine */
  private ratio = 1;
  private slow = { time: 0, frames: 0 };
  private pending = 0;

  private boardCanvas: HTMLCanvasElement;
  private boardTex: THREE.CanvasTexture;
  private pickables: THREE.Object3D[] = [];

  // La caméra : un quart de tour par rotation, un léger mouvement de respiration, un regard vers l'action
  private rot = 0;
  private drawnRot = 0;
  private yaw = 0;
  private pitch: number;
  private distance = 20;
  private zoom = 1;
  private baseTarget = new THREE.Vector3();
  private focus: { point: THREE.Vector3; until: number } | null = null;
  private camTarget = new THREE.Vector3();
  private camDist = 20;
  private placed = false;
  /** Ce que le joueur a fait de la vue : la cible glissée sur le plateau (le zoom est dans zoom) */
  private pan = new THREE.Vector3();
  private viewMoved = false;
  /** Le dernier geste du joueur sur la vue : les gros plans automatiques le laissent faire un moment */
  private grabbedAt = -10;
  /** Les gros plans demandés, et celui en cours (sur les dés, sur un pion) */
  private closeUps: CloseUps = { dice: false, follow: false };
  private closeUp: { point: THREE.Vector3; dist: number; until: number; pawn?: string; dice?: boolean } | null = null;
  /** La caméra est encore en route vers sa place : on redessine */
  private settling = false;
  /** Les doigts (ou la souris) posés sur le plateau, et le pincement en cours */
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { spread: number; zoom: number; mid: { x: number; y: number } } | null = null;
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** Le filtre des villes, la matière « maquette » des autres, et les contours des villes retenues */
  private filter: OwnerFilter = null;
  private filterKey = "";
  private filterRings: THREE.Mesh[] = [];
  private ghostMat = new THREE.MeshStandardMaterial({ color: "#dfe1da", roughness: 0.95, metalness: 0 });
  /** Un voile clair sur les parcelles et les cases qu'on ne regarde pas : seules les villes retenues gardent leurs couleurs */
  private veils = new Map<string, THREE.Mesh>();
  private veilMat = new THREE.MeshBasicMaterial({ color: "#f4f5f0", transparent: true, opacity: 0.74, depthWrite: false });
  /** Le pion à suivre dès que le gros plan sur les dés aura laissé lire le résultat */
  private pendingFollow: { id: string; seconds: number } | null = null;

  private pawns = new Map<string, PawnObj>();
  private turnRing: THREE.Mesh;
  private lots = new Map<number, LotObj>();
  private ringOwner = new Map<number, THREE.Group>();
  private ringHatch = new Map<number, THREE.Mesh>();
  private highlightFrame: THREE.Group;
  private hoverFrame: THREE.Group;
  /** Le contour doré de la parcelle mise en avant, et celui de la parcelle survolée */
  private highlightRing: THREE.Mesh | null = null;
  private hoverRing: THREE.Mesh | null = null;
  private highlightAt: number | null = null;
  private marker: THREE.Mesh;
  private hover: { square: number; rect: L.WRect } | null = null;
  private living: Living[] = [];
  /** Les étiquettes au-dessus des cases achetables : prix ou loyer, toujours face à l'écran */
  private tags = new Map<number, { sprite: THREE.Sprite; key: string }>();

  private dice: THREE.Mesh[];
  private diceThrow: { data: Throw; t0: number; values: [number, number]; sounded: number } | null = null;
  private diceGlow: THREE.Mesh[] = [];
  private decks: Record<DeckId, THREE.Group> = {} as Record<DeckId, THREE.Group>;
  private potStack: THREE.Group | null = null;
  private potShown = -1;

  // La vie de la ville
  private cars: { half: number; speed: number; s: number; reverse: boolean }[] = [];
  private fleet: B.CarFleet | null = null;
  private decor = new THREE.Group();
  private cardParts: Record<DeckId, { geo: THREE.BufferGeometry; mats: THREE.Material[] }> = {} as Record<
    DeckId,
    { geo: THREE.BufferGeometry; mats: THREE.Material[] }
  >;
  private rotors: { obj: THREE.Group; speed: number }[] = [];
  private flags: THREE.Object3D[] = [];
  private water: THREE.Mesh | null = null;
  private siren: THREE.Mesh | null = null;

  private anchors: Record<string, HTMLElement | null> = {};
  private state: SceneState | null = null;
  private pointer = { down: false, x: 0, y: 0, moved: false };
  private hoverRay: { x: number; y: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, opts: SceneOptions) {
    this.container = container;
    this.opts = opts;
    // Vu de trois quarts, le plateau en losange : les coins de l'écran restent libres pour les joueurs
    this.pitch = opts.phone ? 1.1 : 0.92;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    const dpr = window.devicePixelRatio || 1;
    this.ratio = opts.phone ? Math.min(dpr, 2) : Math.min(2, Math.max(dpr, 1.5));
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Des couleurs franches, sans le voile gris de l'ACES
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "cap-canvas";
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.addLights();

    // Le plateau : une toile en haute définition, filtrée de biais pour rester nette même vue de loin
    const size = Math.min(this.renderer.capabilities.maxTextureSize, opts.phone ? 2048 : 4096);
    [this.boardCanvas] = makeCanvas(size, size);
    drawBoard(this.boardCanvas, 0);
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.boardTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.boardTex.generateMipmaps = true;
    this.boardTex.minFilter = THREE.LinearMipmapLinearFilter;
    void fontsReady().then(() => {
      if (this.disposed) return;
      drawBoard(this.boardCanvas, this.drawnRot);
      this.boardTex.needsUpdate = true;
    });
    this.addBoard();
    this.addCity();

    this.turnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.17, 0.215, 40),
      new THREE.MeshBasicMaterial({ color: "#ffd66b", transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.turnRing.rotation.x = -Math.PI / 2;
    this.turnRing.visible = false;
    this.scene.add(this.turnRing);

    this.highlightFrame = this.frame("#ffb000", 0.07, 0.28);
    this.hoverFrame = this.frame("#46a8ff", 0.045, 0.16);
    // Une flèche dorée qui flotte au-dessus de la parcelle mise en avant
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: "#ffb000", emissive: "#7a4a00", roughness: 0.3, metalness: 0.4 }),
    );
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.marker.castShadow = true;
    this.scene.add(this.highlightFrame, this.hoverFrame, this.marker);
    this.addTags();

    this.dice = diceMeshes();
    for (const d of this.dice) {
      d.visible = false;
      this.scene.add(d);
    }
    for (let k = 0; k < 2; k++) {
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(DIE * 0.75, DIE * 0.95, 32),
        new THREE.MeshBasicMaterial({ color: "#ffd66b", transparent: true, opacity: 0, depthWrite: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.006;
      this.diceGlow.push(glow);
      this.scene.add(glow);
    }

    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frameLoop());
  }

  // -------------------------------------------------------------------------
  // La mise en place
  // -------------------------------------------------------------------------

  private addLights() {
    this.scene.add(new THREE.HemisphereLight("#fff6e6", "#5d6b4c", 0.75));
    const sun = new THREE.DirectionalLight("#fff1dc", 2.3);
    sun.position.set(-6, 14, 7);
    sun.castShadow = true;
    const s = this.opts.phone ? 1024 : 2048;
    sun.shadow.mapSize.set(s, s);
    const cam = sun.shadow.camera;
    cam.left = -8;
    cam.right = 8;
    cam.top = 8;
    cam.bottom = -8;
    cam.near = 1;
    cam.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
  }

  private addBoard() {
    // Un plateau épais, en bois, avec son impression sur le dessus
    const wood = new THREE.MeshStandardMaterial({ color: "#5a3d26", roughness: 0.6 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(L.BOARD + 0.24, 0.32, L.BOARD + 0.24), wood);
    slab.position.y = -0.165;
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.scene.add(slab);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(L.BOARD, L.BOARD), sharpMaterial(this.boardTex));
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    top.name = "board";
    this.scene.add(top);
    this.pickables.push(top);
    // L'ombre du plateau sur la table
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.33;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Les repères dynamiques du tour : la couleur du propriétaire, les hachures d'hypothèque
    const hatch = hatchTexture();
    for (let i = 0; i < 40; i++) {
      if (SQUARES[i]!.price === undefined) continue;
      const r = L.squareRect(i);
      // La case prend la couleur de son propriétaire : un voile sur toute la case, une bande pleine côté extérieur
      const owner = new THREE.Group();
      const tint = new THREE.Mesh(
        new THREE.PlaneGeometry(r.w - 0.03, r.d - 0.03),
        new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.3, depthWrite: false }),
      );
      tint.rotation.x = -Math.PI / 2;
      tint.position.set(r.x + r.w / 2, 0.003, r.z + r.d / 2);
      const strip = this.outerStrip(r, 0.13);
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(strip.w, 0.014, strip.d),
        new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }),
      );
      band.position.set(strip.x + strip.w / 2, 0.007, strip.z + strip.d / 2);
      owner.add(tint, band);
      owner.visible = false;
      this.scene.add(owner);
      this.ringOwner.set(i, owner);
      const tex = hatch.clone();
      tex.repeat.set(r.w * 4, r.d * 4);
      tex.needsUpdate = true;
      const h = new THREE.Mesh(
        new THREE.PlaneGeometry(r.w, r.d),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      h.rotation.x = -Math.PI / 2;
      h.position.set(r.x + r.w / 2, 0.004, r.z + r.d / 2);
      h.visible = false;
      this.scene.add(h);
      this.ringHatch.set(i, h);
    }

    // Les coins : la cellule de la prison, la voiture de gendarmerie, le drapeau du départ, l'aire de repos
    const bars = B.jailBars(L.CELL.w, L.CELL.d);
    bars.position.set(L.CELL.x + L.CELL.w / 2, 0, L.CELL.z + L.CELL.d / 2);
    this.decor.add(bars);
    const police = B.car("#24407f", true);
    const go30 = L.squareRect(30);
    police.position.set(go30.x + 0.32, 0, go30.z + 0.3);
    police.rotation.y = Math.PI * 0.75;
    this.siren = police.getObjectByName("siren") as THREE.Mesh;
    this.decor.add(police);
    const go0 = L.squareRect(0);
    const start = B.flag("#d6433a");
    start.position.set(go0.x + go0.w - 0.18, 0, go0.z + go0.d - 0.18);
    this.flags.push(start.getObjectByName("cloth")!);
    this.decor.add(start);
    const rest = L.squareRect(20);
    this.decor.add(
      B.trees([
        { x: rest.x + 0.2, z: rest.z + 0.22, s: 1.2, kind: 0 },
        { x: rest.x + 0.42, z: rest.z + 0.16, s: 1, kind: 1 },
        { x: rest.x + 0.17, z: rest.z + 0.48, s: 0.9, kind: 0 },
      ]),
    );
    const parked = B.car("#e8b12f");
    parked.position.set(rest.x + rest.w - 0.3, 0, rest.z + rest.d - 0.3);
    parked.rotation.y = 0.6;
    this.decor.add(parked);
  }

  /** La bordure extérieure d'une case (là où se met la couleur du propriétaire) */
  private outerStrip(r: L.SquareRect, t: number): L.WRect {
    if (r.side === "bottom") return { x: r.x + 0.04, z: r.z + r.d - t - 0.02, w: r.w - 0.08, d: t };
    if (r.side === "left") return { x: r.x + 0.02, z: r.z + 0.04, w: t, d: r.d - 0.08 };
    if (r.side === "top") return { x: r.x + 0.04, z: r.z + 0.02, w: r.w - 0.08, d: t };
    return { x: r.x + r.w - t - 0.02, z: r.z + 0.04, w: t, d: r.d - 0.08 };
  }

  private addCity() {
    for (const p of C.PARCELS) {
      const root = new THREE.Group();
      root.position.set(p.center.x, 0, p.center.z);
      root.rotation.y = p.facing;
      if (p.square >= 0) root.userData.square = p.square;
      this.scene.add(root);
      if (p.square >= 0) this.pickables.push(root);
      // Les lieux sont dimensionnés pour une parcelle d'un demi-côté de 0,5 : on les ajuste à la place qu'il y a
      const fit = Math.min(1.25, Math.max(0.7, p.room / 0.5));
      const add = (o: THREE.Object3D, scale = fit) => {
        o.scale.setScalar(scale);
        root.add(o);
        return o;
      };
      switch (p.kind) {
        case "station":
          add(B.station(LIVERIES[p.square] ?? "#2f5bb8"), fit * 0.85);
          break;
        case "tax":
          add(B.taxOffice());
          break;
        case "toll":
          add(B.tollBooth(), fit * 0.85);
          break;
        case "bank":
          add(B.bank(), fit * 1.1);
          break;
        case "kiosk":
          add(B.kiosk()).position.z = -p.room * 0.55;
          break;
        case "garden": {
          const pts: { x: number; z: number; s: number; kind: number }[] = [];
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + p.center.x;
            const r = p.room * (k % 2 ? 0.55 : 0.3);
            pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 1 + (k % 3) * 0.15, kind: k % 3 === 0 ? 1 : 0 });
          }
          root.add(B.trees(pts));
          break;
        }
        case "utility":
          if (p.square === 12) {
            const dam = B.dam();
            add(dam.group);
            this.water = dam.water;
          } else {
            for (const [x, z, h] of [
              [-0.22, 0.1, 0.85],
              [0.2, -0.08, 1],
              [-0.06, -0.3, 0.75],
            ] as const) {
              const t = B.turbine(h);
              t.group.position.set(x * fit * 1.6, 0, z * fit * 1.6);
              t.group.rotation.y = Math.PI * 0.8 - p.facing;
              root.add(t.group);
              this.rotors.push({ obj: t.rotor, speed: 1.4 + h * 0.6 });
            }
          }
          break;
        default:
          break;
      }
      if (p.kind === "property" || p.kind === "station" || p.kind === "utility") {
        const obj: LotObj = {
          parcel: p,
          root,
          set: null,
          setKey: "",
          special: null,
          specialKey: "",
          flag: null,
          sale: null,
          fence: null,
          outline: null,
          shown: { owner: null, mortgaged: false },
        };
        this.lots.set(p.square, obj);
        if (p.kind === "property") {
          obj.sale = B.forSale();
          root.add(obj.sale);
        }
      }
    }

    // Les deux paquets de cartes, sur le parvis du kiosque
    const kiosk = C.KIOSK_PARCEL;
    for (const deck of ["hasard", "courrier"] as DeckId[]) {
      const g = new THREE.Group();
      const spot = C.parcelPoint(kiosk, deck === "hasard" ? -0.16 : 0.16, 0.12);
      g.position.set(spot.x, 0, spot.z);
      g.rotation.y = kiosk.facing;
      const face = new THREE.MeshStandardMaterial({
        map: signTexture(
          deck === "hasard" ? "HASARD" : "COURRIER",
          deck === "hasard" ? "#e07a2c" : "#2f6fb8",
          "#fff8ea",
          256,
          170,
          '"Young Serif", Georgia, serif',
        ),
        roughness: 0.55,
      });
      const edge = new THREE.MeshStandardMaterial({ color: "#f3ecdc", roughness: 0.8 });
      const geo = new THREE.BoxGeometry(0.28, 0.012, 0.19);
      const mats = [edge, edge, face, edge, edge, edge];
      this.cardParts[deck] = { geo, mats };
      for (let n = 0; n < 8; n++) {
        const c = new THREE.Mesh(geo, mats);
        c.position.y = 0.006 + n * 0.013;
        c.rotation.y = Math.sin(n * 2.3) * 0.04;
        c.castShadow = true;
        g.add(c);
      }
      this.decks[deck] = g;
      this.decor.add(g);
    }

    // La place : des réverbères et quelques arbres autour de la rose des vents
    const plaza = C.PLAZA_PARCEL;
    const spots: { x: number; z: number; s: number; kind: number }[] = [];
    plaza.poly.forEach((v, k) => {
      const x = plaza.center.x + (v.x - plaza.center.x) * 0.86;
      const z = plaza.center.z + (v.z - plaza.center.z) * 0.86;
      if (k % 2) spots.push({ x, z, s: 0.8, kind: 0 });
      else {
        const l = B.lamp();
        l.position.set(x, 0, z);
        this.decor.add(l);
      }
    });
    this.decor.add(B.trees(spots));

    // La circulation : la rocade, dans les deux sens
    const colors = ["#d6433a", "#f2f2ee", "#2f5bb8", "#e8b12f", "#3c3f44", "#2fa864", "#e07a3a", "#9fb4c4"];
    const lanes = [
      { half: L.OUTER_ROAD + 0.055, n: 7, reverse: false },
      { half: L.OUTER_ROAD - 0.055, n: 6, reverse: true },
    ];
    let k = 0;
    const fleetColors: string[] = [];
    for (const lane of lanes) {
      const len = L.loopLength(lane.half, 0.2);
      for (let n = 0; n < lane.n; n++) {
        fleetColors.push(colors[k++ % colors.length]!);
        this.cars.push({ half: lane.half, speed: 0.42 + ((k * 37) % 10) / 60, s: (n / lane.n) * len + k * 0.13, reverse: lane.reverse });
      }
    }
    this.fleet = new B.CarFleet(fleetColors);
    this.scene.add(...this.fleet.meshes);
    this.placeCars();
    // Tout le décor qui ne bouge pas, fondu en quelques maillages
    this.scene.add(B.bake(this.decor));
  }

  /** Les étiquettes des cases achetables, posées sur le bord extérieur de chaque case */
  private addTags() {
    for (let i = 0; i < 40; i++) {
      if (SQUARES[i]!.price === undefined) continue;
      const r = L.squareRect(i);
      const out = this.outerStrip(r, 0.3);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      sprite.position.set(out.x + out.w / 2, 0.2, out.z + out.d / 2);
      sprite.scale.set(1.08, 0.54, 1);
      sprite.renderOrder = 2;
      this.scene.add(sprite);
      this.tags.set(i, { sprite, key: "" });
    }
  }

  private syncTags() {
    for (const [i, t] of this.tags) {
      const tag = this.opts.tagOf(i);
      const key = `${tag.text}|${tag.color}|${tag.level}|${tag.muted}`;
      if (key === t.key) continue;
      t.key = key;
      const mat = t.sprite.material;
      mat.map?.dispose();
      mat.map = tagTexture(tag.text, tag.color, tag.level, tag.muted);
      mat.needsUpdate = true;
    }
  }

  /** Un cadre lumineux autour d'une case ou d'une parcelle */
  private frame(color: string, t: number, fill: number): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    for (let k = 0; k < 4; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, t), m);
      bar.userData.side = k;
      g.add(bar);
    }
    // Un voile de la même couleur sur toute la surface
    const veil = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fill, depthWrite: false }),
    );
    veil.rotation.x = -Math.PI / 2;
    veil.userData.side = -1;
    veil.userData.fill = fill;
    g.add(veil);
    g.visible = false;
    g.userData.t = t;
    return g;
  }

  private placeFrame(f: THREE.Group, r: L.WRect) {
    const t = f.userData.t as number;
    const cx = r.x + r.w / 2;
    const cz = r.z + r.d / 2;
    f.children.forEach((bar) => {
      const side = bar.userData.side as number;
      if (side < 0) {
        bar.scale.set(r.w, r.d, 1);
        bar.position.set(cx, 0.01, cz);
      } else if (side < 2) {
        bar.scale.set(r.w + t, 1, 1);
        bar.position.set(cx, 0.012, side === 0 ? r.z : r.z + r.d);
        bar.rotation.y = 0;
      } else {
        bar.scale.set(r.d + t, 1, 1);
        bar.position.set(side === 2 ? r.x : r.x + r.w, 0.012, cz);
        bar.rotation.y = Math.PI / 2;
      }
    });
  }

  // -------------------------------------------------------------------------
  // L'état
  // -------------------------------------------------------------------------

  setState(s: SceneState) {
    this.dirty = true;
    const first = this.state === null;
    this.state = s;
    this.syncPawns(s, first);
    this.syncDeeds(s, first);
    this.syncPot(s.pot);
    this.highlightAt = s.highlight;
    this.updateFrames();
  }

  private spotOf(p: ScenePlayer, slot: number, count: number): THREE.Vector3 {
    if (p.position === L_JAIL) {
      const j = L.jailSpot(p.inJail, slot);
      return new THREE.Vector3(j.x, 0, j.z);
    }
    const c = L.squareSpot(p.position);
    const [dx, dz] = L.slotOffset(slot, count);
    return new THREE.Vector3(c.x + dx, 0, c.z + dz);
  }

  private syncPawns(s: SceneState, first: boolean) {
    const live = s.players.filter((p) => !p.bankrupt);
    for (const p of s.players) {
      let obj = this.pawns.get(p.id);
      if (!obj) {
        const group = tokenModel(p.token ?? "pion", p.color);
        this.scene.add(group);
        obj = {
          id: p.id,
          group,
          pos: new THREE.Vector3(),
          target: new THREE.Vector3(),
          square: p.position,
          hop: null,
          queue: [],
          out: false,
        };
        this.pawns.set(p.id, obj);
      }
      const same = live.filter((x) => x.position === p.position && (p.position !== L_JAIL || x.inJail === p.inJail));
      const slot = Math.max(
        0,
        same.findIndex((x) => x.id === p.id),
      );
      const to = this.spotOf(p, slot, same.length);
      if (first || this.opts.reduced) {
        obj.pos.copy(to);
        obj.target.copy(to);
        obj.square = p.position;
        obj.hop = null;
        obj.queue = [];
      } else if (p.position !== obj.square) {
        const step = (p.position - obj.square + 40) % 40;
        const jump = !(step === 1 || step === 39);
        obj.queue.push({ to, square: p.position, jump });
        obj.square = p.position;
        obj.target.copy(to);
        this.lookAtSoon(to);
        if (this.closeUps.follow) this.followPawn(p.id, jump ? JUMP_SECONDS + 1.1 : 1);
      } else if (!obj.target.equals(to)) {
        // Même case, autre place (quelqu'un arrive ou s'en va)
        if (obj.queue.length > 0) obj.queue[obj.queue.length - 1]!.to = to;
        else if (obj.hop) obj.hop.to.copy(to);
        else obj.queue.push({ to, square: p.position, jump: false });
        obj.target.copy(to);
      }
      if (p.bankrupt && !obj.out) {
        obj.out = true;
        this.tween(
          0.5,
          (t) => obj.group.scale.setScalar(1 - easeInOut(t)),
          () => (obj.group.visible = false),
        );
      }
    }
  }

  private syncDeeds(s: SceneState, first: boolean) {
    const colorOf = (id: string | null) => s.players.find((p) => p.id === id)?.color ?? "#ffffff";
    for (let i = 0; i < 40; i++) {
      const d = s.deeds[i];
      if (!d) continue;
      const tinted = this.ringOwner.get(i);
      if (tinted) {
        tinted.visible = d.owner !== null;
        if (d.owner) {
          for (const m of tinted.children) ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(colorOf(d.owner));
        }
      }
      const hatch = this.ringHatch.get(i);
      if (hatch) hatch.visible = d.mortgaged;
      const lot = this.lots.get(i);
      if (lot) this.syncLot(lot, d, colorOf, first);
    }
    this.syncTags();
    if (this.filter) this.applyFilter();
  }

  private syncLot(o: LotObj, d: SceneDeed, colorOf: (id: string | null) => string, first: boolean) {
    const prev = o.shown;
    const animate = !first && !this.opts.reduced;
    const p = o.parcel;
    const color = colorOf(d.owner);
    // Le propriétaire : son drapeau au fond, le liseré de la parcelle ; le panneau « à vendre » s'en va
    if (d.owner !== prev.owner) {
      if (o.flag) this.removeObj(o.flag, animate);
      if (o.outline) {
        this.scene.remove(o.outline);
        o.outline.geometry.dispose();
      }
      o.flag = null;
      o.outline = null;
      if (d.owner) {
        o.flag = B.flag(color);
        o.flag.position.set(p.room * 0.7, 0, -p.room * 0.7);
        o.root.add(o.flag);
        this.flags.push(o.flag.getObjectByName("cloth")!);
        if (animate) this.popIn(o.flag);
        o.outline = this.parcelRing(p, color, 0.045);
        this.scene.add(o.outline);
      }
      if (o.sale) o.sale.visible = d.owner === null;
      if (animate && d.owner) this.lookAtSoon(o.root.position.clone());
    }
    // Hypothèque : une palissade
    if (d.mortgaged !== prev.mortgaged) {
      if (o.fence) this.removeObj(o.fence, animate);
      o.fence = null;
      if (d.mortgaged) {
        o.fence = B.fence(p.room * 1.3, p.room * 1.3);
        o.root.add(o.fence);
        if (animate) this.popIn(o.fence);
      }
    }
    if (p.kind !== "property") {
      o.shown = { owner: d.owner, mortgaged: d.mortgaged };
      return;
    }
    // Le niveau : les bâtiments poussent, de la maison au gratte-ciel
    const level = d.level ?? 0;
    const setKey = level > 0 ? `${level}:${d.owner}` : "";
    if (setKey !== o.setKey) {
      const grew = level > Number(o.setKey.split(":")[0] || 0);
      o.setKey = setKey;
      if (o.set) this.removeObj(o.set, animate);
      o.set = null;
      if (level > 0) {
        o.set = this.levelSet(level, p, color);
        o.root.add(o.set);
        if (animate) {
          o.set.children.forEach((b, k) => this.rise(b, level === 5 ? 1.1 : 0.55, k * 0.08, grew));
          this.dust(o.root, 0, 0, p.room * 0.8);
          this.lookAtSoon(o.root.position.clone());
        }
      }
    }
    // Le bâtiment spécial, au fond de la parcelle
    const sp = d.special ?? null;
    const specialKey = sp ? `${sp.kind}:${sp.by}` : "";
    if (specialKey !== o.specialKey) {
      o.specialKey = specialKey;
      if (o.special) {
        const old = o.special;
        this.living = this.living.filter((x) => !isDescendant(x.obj, old));
        this.removeObj(old, animate);
      }
      o.special = null;
      if (sp) {
        o.special = this.specialModel(sp.kind, colorOf(sp.by));
        const s = Math.min(1.1, Math.max(0.7, p.room / 0.5)) * 0.9;
        o.special.scale.setScalar(s);
        o.special.position.set(-p.room * 0.45, 0, -p.room * 0.45);
        o.root.add(o.special);
        if (animate) {
          this.popIn(o.special);
          play("capBuild", { volume: 0.7 });
          this.lookAtSoon(o.root.position.clone());
        }
      }
    }
    o.shown = { owner: d.owner, mortgaged: d.mortgaged };
  }

  /** Les bâtiments d'un niveau, à leur place dans la parcelle (repère de la parcelle, façade vers +z) */
  private levelSet(level: number, p: C.Parcel, color: string): THREE.Group {
    const g = new THREE.Group();
    const group = p.group!;
    const s = Math.min(1.45, Math.max(0.8, p.room / 0.42));
    const d = p.room * 0.42;
    const put = (o: THREE.Object3D, x: number, z: number, k = 1) => {
      o.position.set(x, 0, z);
      o.scale.setScalar(s * k);
      g.add(o);
    };
    if (level === 1) put(B.maison(group, color), 0, 0.05);
    else if (level === 2) {
      put(B.maison(group, color), -d, 0.08);
      put(B.maison(group, color), d, -0.04);
    } else if (level === 3) {
      put(B.immeuble(group, color), -d * 0.45, -0.05);
      put(B.maison(group, color), d, 0.12, 0.85);
    } else if (level === 4) {
      put(B.immeuble(group, color), -d * 0.6, 0);
      put(B.immeuble(group, color), d * 0.6, 0.05);
    } else put(B.gratteCiel(group, color, p.square === 39), 0, 0, 1.05);
    return g;
  }

  /** Le modèle d'un bâtiment spécial, avec ce qui bouge dedans */
  private specialModel(kind: SpecialKind, color: string): THREE.Object3D {
    switch (kind) {
      case "monument":
        return B.monument(color);
      case "parc": {
        const p = B.parc();
        this.living.push({ kind: "jet", obj: p.jet });
        return p.group;
      }
      case "stade":
        return B.stade(color);
      case "decharge": {
        const p = B.decharge();
        this.living.push({ kind: "birds", obj: p.birds });
        return p.group;
      }
      case "centrale": {
        const p = B.centrale();
        this.living.push({ kind: "steam", obj: p.steam });
        return p.group;
      }
    }
  }

  /** Un liseré à plat qui suit le contour d'une parcelle (dans le monde) */
  private parcelRing(p: C.Parcel, color: string, t: number, opacity = 1): THREE.Mesh {
    const shape = new THREE.Shape(p.poly.map((q) => new THREE.Vector2(q.x, -q.z)));
    const c = p.center;
    const hole = new THREE.Path(
      p.poly.map((q) => {
        const dx = q.x - c.x;
        const dz = q.z - c.z;
        const len = Math.hypot(dx, dz) || 1;
        const k = Math.max(0, 1 - t / (len * 0.7));
        return new THREE.Vector2(c.x + dx * k, -(c.z + dz * k));
      }),
    );
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(
      geo,
      opacity < 1 ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }) : B.mat(color, { rough: 0.5 }),
    );
    m.position.y = 0.006;
    m.receiveShadow = true;
    return m;
  }

  private syncPot(pot: number | null) {
    const count = pot === null ? 0 : Math.min(40, Math.ceil(pot / 40));
    if (count === this.potShown) return;
    this.potShown = count;
    if (this.potStack) {
      this.scene.remove(this.potStack);
      this.potStack.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
    }
    this.potStack = null;
    if (count > 0) {
      this.potStack = B.coinStack(count);
      const pot = C.parcelPoint(C.BANK_PARCEL, C.BANK_PARCEL.room * 0.6, C.BANK_PARCEL.room * 0.5);
      this.potStack.position.set(pot.x, 0, pot.z);
      this.scene.add(this.potStack);
    }
  }

  private updateFrames() {
    this.dirty = true;
    const h = this.highlightAt;
    this.highlightFrame.visible = h !== null;
    if (h !== null) this.placeFrame(this.highlightFrame, L.squareRect(h));
    // La parcelle mise en avant : un contour doré, une flèche qui flotte au-dessus
    const parcel = h !== null ? C.PARCEL_OF[h] : undefined;
    if (this.highlightRing) {
      this.scene.remove(this.highlightRing);
      this.highlightRing.geometry.dispose();
      this.highlightRing = null;
    }
    this.marker.visible = Boolean(parcel);
    if (parcel) {
      this.highlightRing = this.parcelRing(parcel, "#ffb000", 0.1, 0.9);
      this.scene.add(this.highlightRing);
      this.marker.position.set(parcel.center.x, 1, parcel.center.z);
    }
    const hv = this.hover && this.hover.square !== h ? this.hover : null;
    this.hoverFrame.visible = hv !== null;
    if (hv) this.placeFrame(this.hoverFrame, L.squareRect(hv.square));
    if (this.hoverRing) {
      this.scene.remove(this.hoverRing);
      this.hoverRing.geometry.dispose();
      this.hoverRing = null;
    }
    const hp = hv ? C.PARCEL_OF[hv.square] : undefined;
    if (hp) {
      this.hoverRing = this.parcelRing(hp, "#46a8ff", 0.07, 0.85);
      this.scene.add(this.hoverRing);
    }
  }

  // -------------------------------------------------------------------------
  // Les dés, les cartes
  // -------------------------------------------------------------------------

  /** Lance les dés : ils viennent du côté de la caméra et roulent jusqu'à montrer ces valeurs */
  throwDice(values: [number, number]) {
    const from = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (this.opts.reduced || document.visibilityState !== "visible") {
      this.restDice(values);
      play("tourThrow");
      return;
    }
    const data = simulateThrow(values, from, C.ARENA - 0.06, Math.random);
    this.diceThrow = { data, t0: this.time, values, sounded: 0 };
    for (const d of this.dice) d.visible = true;
    for (const g of this.diceGlow) (g.material as THREE.MeshBasicMaterial).opacity = 0;
    play("capDiceShake", { volume: 0.7 });
    this.focus = { point: new THREE.Vector3(0, 0, 0), until: this.time + data.duration + 0.4 };
    // Gros plan : la caméra plonge vers les dés et les garde le temps de lire le résultat
    if (this.closeUps.dice && this.time - this.grabbedAt > 2)
      this.closeUp = { point: new THREE.Vector3(), dist: DICE_CLOSE, until: this.time + data.duration + 1.2, dice: true };
  }

  /** Les dés posés, sans lancer (à l'arrivée à la table, ou en mode sobre) */
  restDice(values: [number, number] | null) {
    if (!values) return;
    this.dirty = true;
    const from = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const side = new THREE.Vector3(-from.z, 0, from.x);
    this.dice.forEach((d, k) => {
      d.visible = true;
      d.position
        .copy(side)
        .multiplyScalar(k === 0 ? -0.3 : 0.3)
        .addScaledVector(from, -0.2);
      d.position.y = DIE / 2;
      d.quaternion.copy(restingQuaternion(values[k]!, this.yaw + (k ? 0.25 : -0.15)));
    });
  }

  /** Une carte se soulève du paquet, se retourne et file vers la caméra */
  drawCard(deck: DeckId) {
    if (this.opts.reduced) return;
    const pile = this.decks[deck];
    const parts = this.cardParts[deck];
    const card = new THREE.Mesh(parts.geo, parts.mats);
    card.position.copy(pile.position).add(new THREE.Vector3(0, 0.12, 0));
    this.scene.add(card);
    const toward = this.camera.position.clone().sub(card.position).normalize().multiplyScalar(1.4);
    const start = card.position.clone();
    this.tween(
      0.6,
      (t) => {
        const e = easeOut(t);
        card.position.copy(start).addScaledVector(toward, e);
        card.position.y += Math.sin(t * Math.PI) * 0.6;
        card.rotation.x = -e * Math.PI * 0.9;
        card.rotation.z = e * 0.3;
        card.scale.setScalar(1 + e * 0.3);
      },
      () => this.scene.remove(card),
    );
  }

  private playDice() {
    const th = this.diceThrow;
    if (!th) return;
    const t = this.time - th.t0;
    const fps = 120;
    const at = Math.min(th.data.frames[0]!.length - 1, Math.floor(t * fps));
    this.dice.forEach((d, k) => {
      const f = th.data.frames[k]![at]!;
      d.position.copy(f.p);
      d.quaternion.copy(f.q);
    });
    if (this.closeUp?.dice)
      this.closeUp.point.set(
        (this.dice[0]!.position.x + this.dice[1]!.position.x) / 2,
        0,
        (this.dice[0]!.position.z + this.dice[1]!.position.z) / 2,
      );
    // Le bruit des dés : chaque choc, plus ou moins fort
    while (th.sounded < th.data.hits.length && th.data.hits[th.sounded]!.t <= t) {
      const h = th.data.hits[th.sounded]!;
      play("capDiceHit", { volume: Math.min(1, 0.25 + h.force / 9), rate: 0.9 + Math.random() * 0.25 });
      th.sounded++;
    }
    if (t >= th.data.duration) {
      this.diceThrow = null;
      if (th.values[0] === th.values[1]) {
        this.diceGlow.forEach((g, k) => {
          g.position.x = this.dice[k]!.position.x;
          g.position.z = this.dice[k]!.position.z;
        });
        this.tween(1.6, (u) =>
          this.diceGlow.forEach((g) => ((g.material as THREE.MeshBasicMaterial).opacity = Math.sin(u * Math.PI) * 0.85)),
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Les animations
  // -------------------------------------------------------------------------

  private tween(dur: number, step: (t: number) => void, done?: () => void, delay = 0) {
    this.tweens.push({ t0: this.time + delay, dur, step, done });
  }

  /** Un bâtiment sort de terre, avec un petit rebond */
  private rise(o: THREE.Object3D, dur: number, delay = 0, sound = true) {
    const base = o.scale.x;
    o.scale.set(base, 0.001, base);
    this.tween(
      dur,
      (t) => {
        const e = springOut(t);
        const w = base * (1 + Math.sin(t * Math.PI) * 0.04);
        o.scale.set(w, Math.max(0.001, base * e), w);
      },
      () => o.scale.setScalar(base),
      delay,
    );
    if (!sound) return;
    this.tween(
      0.01,
      () => {},
      () => play(dur > 0.8 ? "capBuildBig" : "capBuild", { volume: 0.8 }),
      delay,
    );
  }

  private popIn(o: THREE.Object3D) {
    const base = o.scale.x;
    o.scale.setScalar(0.001);
    this.tween(
      0.45,
      (t) => o.scale.setScalar(Math.max(0.001, base * springOut(t))),
      () => o.scale.setScalar(base),
    );
  }

  private removeObj(o: THREE.Object3D, animate: boolean, delay = 0) {
    const done = () => {
      o.parent?.remove(o);
      this.flags = this.flags.filter((f) => !isDescendant(f, o));
    };
    if (!animate) return done();
    const sy = o.scale.y;
    this.tween(0.35, (t) => o.scale.set(1 - t * 0.2, Math.max(0.001, sy * (1 - easeInOut(t))), 1 - t * 0.2), done, delay);
  }

  /** Un nuage de poussière au pied d'une construction */
  private dust(parent: THREE.Object3D, x: number, z: number, size: number) {
    const m = new THREE.MeshStandardMaterial({ color: "#e8dcc4", transparent: true, opacity: 0.8, roughness: 1, depthWrite: false });
    const puffs: THREE.Mesh[] = [];
    const geo = new THREE.IcosahedronGeometry(0.05, 0);
    for (let k = 0; k < 9; k++) {
      const p = new THREE.Mesh(geo, m);
      const a = (k / 9) * Math.PI * 2;
      p.userData.dir = new THREE.Vector3(Math.cos(a), 0.3 + (k % 3) * 0.15, Math.sin(a));
      p.position.set(x, 0.03, z);
      parent.add(p);
      puffs.push(p);
    }
    this.tween(
      0.9,
      (t) => {
        const e = easeOut(t);
        for (const p of puffs) {
          const dir = p.userData.dir as THREE.Vector3;
          p.position.set(x + dir.x * size * e, 0.03 + dir.y * size * 0.5 * e, z + dir.z * size * e);
          p.scale.setScalar(0.6 + e * 1.4);
        }
        m.opacity = 0.75 * (1 - t);
      },
      () => {
        for (const p of puffs) parent.remove(p);
        geo.dispose();
        m.dispose();
      },
    );
  }

  /** Regarde un peu vers là où ça se passe */
  private lookAtSoon(p: THREE.Vector3) {
    if (this.opts.reduced) return;
    const point = p.clone();
    point.y = 0;
    this.focus = { point, until: this.time + 2.2 };
  }

  private updatePawns() {
    const turn = this.state?.turn ?? null;
    for (const o of this.pawns.values()) {
      if (!o.hop && o.queue.length > 0) {
        const next = o.queue.shift()!;
        const sameSquare = next.to.distanceTo(o.pos) < 0.5 && !next.jump;
        o.hop = {
          from: o.pos.clone(),
          to: next.to.clone(),
          t0: this.time,
          dur: next.jump ? JUMP_SECONDS : sameSquare ? 0.22 : HOP_SECONDS,
          height: next.jump ? 1.3 : sameSquare ? 0 : 0.32,
          land: !sameSquare,
        };
        // Plusieurs sauts en attente : on accélère pour rattraper
        if (o.queue.length > 2) o.hop.dur *= 0.6;
      }
      let squash = 1;
      if (o.hop) {
        const h = o.hop;
        const t = Math.min(1, (this.time - h.t0) / h.dur);
        const e = h.height > 1 ? easeInOut(t) : t;
        o.pos.lerpVectors(h.from, h.to, e);
        o.pos.y = Math.sin(t * Math.PI) * h.height;
        squash = h.height > 0 ? 1 + Math.sin(t * Math.PI) * 0.12 : 1;
        if (t >= 1) {
          o.hop = null;
          o.pos.copy(h.to);
          if (h.land) {
            play(h.height > 1 ? "capJump" : "capHop", { volume: h.height > 1 ? 0.9 : 0.55 });
            o.group.userData.landed = this.time;
          }
        }
      }
      // Un petit écrasement à l'atterrissage
      const since = this.time - ((o.group.userData.landed as number | undefined) ?? -10);
      if (since < 0.18) squash = 1 - Math.sin((since / 0.18) * Math.PI) * 0.16;
      const bob = turn === o.id && !o.hop ? Math.sin(this.time * 4) * 0.025 + 0.025 : 0;
      o.group.position.set(o.pos.x, o.pos.y + bob, o.pos.z);
      if (!o.out) o.group.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    }
    const current = turn ? this.pawns.get(turn) : undefined;
    this.turnRing.visible = Boolean(current && !current.out);
    if (current) {
      this.turnRing.position.set(current.pos.x, 0.008, current.pos.z);
      const pulse = 1 + Math.sin(this.time * 4) * 0.08;
      this.turnRing.scale.set(pulse, pulse, 1);
    }
  }

  private placeCars() {
    if (!this.fleet) return;
    this.cars.forEach((c, k) => {
      const pt = L.loopPoint(c.half, 0.2, c.s);
      this.fleet!.place(k, pt.x, pt.z, pt.angle + (c.reverse ? Math.PI : 0));
    });
    this.fleet.commit();
  }

  private updateLife(dt: number) {
    if (this.opts.reduced) return;
    for (const c of this.cars) c.s += c.speed * dt * (c.reverse ? -1 : 1);
    this.placeCars();
    for (const r of this.rotors) r.obj.rotation.z -= r.speed * dt;
    this.flags.forEach((f, k) => (f.rotation.y = Math.sin(this.time * 2.2 + k) * 0.35));
    if (this.water) {
      const m = this.water.material as THREE.MeshStandardMaterial;
      m.color.setHSL(0.56, 0.52, 0.5 + Math.sin(this.time * 1.3) * 0.03);
    }
    for (const l of this.living) {
      if (l.kind === "jet") l.obj.scale.y = 0.75 + Math.sin(this.time * 3.1) * 0.25 + Math.sin(this.time * 7.7) * 0.06;
      else if (l.kind === "birds") l.obj.rotation.y = this.time * 0.9;
      else {
        // La vapeur monte, grossit et s'efface, en boucle
        for (const p of l.obj.children) {
          const t = (this.time * 0.35 + (p.userData.phase as number)) % 1;
          p.position.y = 0.32 + t * 0.35;
          p.scale.setScalar(0.6 + t * 1.2);
        }
      }
    }

    if (this.siren) {
      const m = this.siren.material as THREE.MeshStandardMaterial;
      const on = Math.floor(this.time * 3) % 2 === 0;
      m.emissive.set(on ? "#2b6cff" : "#ff3b3b");
      m.color.set(on ? "#2b6cff" : "#ff3b3b");
    }
    // Ce qui est sous le doigt ou mis en avant brille un peu
    const glow = 0.5 + Math.sin(this.time * 5) * 0.5;
    if (this.marker.visible) {
      this.marker.position.y = 1.05 + Math.sin(this.time * 3) * 0.12;
      this.marker.rotation.y = this.time * 1.5;
    }
    if (this.highlightRing) (this.highlightRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + glow * 0.45;
    for (const r of this.filterRings) (r.material as THREE.MeshBasicMaterial).opacity = 0.6 + glow * 0.4;
    for (const f of [this.highlightFrame]) {
      for (const bar of f.children) {
        const m = (bar as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const fill = bar.userData.fill as number | undefined;
        m.opacity = fill !== undefined ? fill * (0.4 + glow * 0.9) : 0.55 + glow * 0.45;
      }
    }
  }

  // -------------------------------------------------------------------------
  // La caméra
  // -------------------------------------------------------------------------

  /** Un quart de tour du plateau ; le texte se remet à l'endroit une fois arrivé */
  rotate(dir: 1 | -1) {
    this.rot = (this.rot + dir + 4) % 4;
    this.dirty = true;
  }

  private targetYaw() {
    // Le plus court chemin vers le quart de tour voulu ; sur PC le plateau en losange, sur téléphone de face (plus grand)
    const want = (this.rot * Math.PI) / 2 + (this.opts.phone ? 0 : Math.PI / 4);
    let diff = want - this.yaw;
    diff = ((((diff + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    return this.yaw + diff;
  }

  private fit() {
    // La distance où tout le plateau tient dans l'image (avec une marge), le plateau bien centré
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const corners: THREE.Vector3[] = [];
    const e = L.HALF + 0.15;
    for (const x of [-e, e]) for (const z of [-e, e]) for (const y of [-0.3, 0.25]) corners.push(new THREE.Vector3(x, y, z));
    let target = new THREE.Vector3();
    let dist = 20;
    // L'annonce du coup passe en haut du plateau (sur téléphone, sous les boutons de la vue) : on le descend un peu
    const lift = this.opts.phone ? 0.1 : 0.06;
    for (let iter = 0; iter < 3; iter++) {
      let lo = 5;
      let hi = 80;
      for (let n = 0; n < 24; n++) {
        const mid = (lo + hi) / 2;
        this.placeCamera(this.yaw, this.pitch, mid, target);
        const fits = corners.every((c) => {
          const p = c.clone().project(this.camera);
          return Math.abs(p.x) <= 0.93 && Math.abs(p.y + lift) <= (this.opts.phone ? 0.92 : 0.895);
        });
        if (fits) hi = mid;
        else lo = mid;
      }
      dist = hi;
      this.placeCamera(this.yaw, this.pitch, dist, target);
      let minY = Infinity;
      let maxY = -Infinity;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      // Recentrer : déplacer la cible vers le fond du plateau si l'image penche vers le bas
      const off = (minY + maxY) / 2 + lift;
      const away = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      target = target.clone().addScaledVector(away, off * dist * 0.28);
    }
    this.baseTarget.copy(target);
    this.distance = dist;
  }

  private placeCamera(yaw: number, pitch: number, dist: number, target: THREE.Vector3) {
    this.camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }

  private updateCamera(dt: number) {
    const k = 1 - Math.exp(-dt * 4);
    const want = this.targetYaw();
    const rotating = Math.abs(want - this.yaw) > 0.002;
    this.yaw += (want - this.yaw) * (1 - Math.exp(-dt * 5));
    if (!rotating && this.drawnRot !== this.rot) {
      this.drawnRot = this.rot;
      drawBoard(this.boardCanvas, this.rot);
      this.boardTex.needsUpdate = true;
    }
    if (rotating) this.fit();
    const focusing = this.focus && this.time < this.focus.until;
    // La vue du joueur : la cible glissée, le zoom choisi
    const goal = this.baseTarget.clone().add(this.pan);
    let dist = this.distance * this.zoom;
    // Un léger regard vers l'action, seulement quand la vue est à sa place
    if (focusing && this.focus && !this.viewMoved) {
      goal.lerp(this.focus.point, 0.08);
      dist *= 0.97;
    }
    // Un gros plan en cours (les dés, le pion qui avance, un joueur montré) : la caméra y va, puis revient
    let speed = k * 0.6;
    const cu = this.closeUp;
    if (cu && this.time < cu.until) {
      if (cu.pawn) {
        const o = this.pawns.get(cu.pawn);
        if (o) cu.point.set(o.pos.x, 0, o.pos.z);
      }
      goal.copy(cu.point);
      dist = this.distance * Math.min(cu.dist, this.zoom);
      speed = k * 0.9;
    } else if (cu) {
      this.closeUp = null;
      // Les dés sont lus : la caméra rejoint le pion s'il est encore en route
      const next = this.pendingFollow;
      this.pendingFollow = null;
      const o = next ? this.pawns.get(next.id) : undefined;
      if (next && o && (o.hop || o.queue.length > 0)) this.followPawn(next.id, next.seconds);
    }
    // Sous le doigt, la vue suit sans retard
    if (this.touches.size > 0 && this.pointer.moved && !cu) speed = 1;
    this.settling = this.camTarget.distanceToSquared(goal) > 1e-6 || Math.abs(dist - this.camDist) > 1e-3;
    this.camTarget.lerp(goal, speed);
    this.camDist += (dist - this.camDist) * speed;
    const sway = this.opts.reduced ? 0 : 1;
    this.placeCamera(
      this.yaw + Math.sin(this.time * 0.21) * 0.012 * sway,
      this.pitch + Math.sin(this.time * 0.17) * 0.008 * sway,
      this.camDist,
      this.camTarget,
    );
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.dirty = true;
    this.fit();
    if (!this.placed) {
      this.placed = true;
      this.camDist = this.distance * this.zoom;
      this.camTarget.copy(this.baseTarget);
    }
  }

  // -------------------------------------------------------------------------
  // Les clics, le survol
  // -------------------------------------------------------------------------

  private bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onCancel);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // le pointeur est déjà parti
    }
    if (this.touches.size === 1) this.pointer = { down: true, x: e.clientX, y: e.clientY, moved: false };
    else {
      // Deux doigts : on pince pour zoomer, on glisse pour déplacer ; ce n'est plus un appui sur une case
      this.pointer.moved = true;
      this.pinch = { spread: this.spread(), zoom: this.zoom, mid: this.middle() };
    }
  };

  private onMove = (e: PointerEvent) => {
    const prev = this.touches.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === "mouse") this.hoverRay = { x: e.clientX, y: e.clientY };
      return;
    }
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.touches.size >= 2) {
      const mid = this.middle();
      this.zoomTo((this.pinch.zoom * this.pinch.spread) / Math.max(1, this.spread()), mid);
      this.panBy(this.pinch.mid, mid);
      this.pinch.mid = mid;
      return;
    }
    if (!this.pointer.moved && Math.hypot(e.clientX - this.pointer.x, e.clientY - this.pointer.y) > 6) {
      this.pointer.moved = true;
      // On glisse : la bulle de la case survolée s'en va
      this.hoverRay = null;
      if (this.hover) {
        this.hover = null;
        this.updateFrames();
        this.opts.onHover?.(null, 0, 0);
      }
    }
    if (this.pointer.moved) {
      this.panBy(prev, { x: e.clientX, y: e.clientY });
      this.renderer.domElement.style.cursor = "grabbing";
    }
  };

  private onUp = (e: PointerEvent) => {
    if (!this.touches.delete(e.pointerId)) return;
    if (this.touches.size < 2) this.pinch = null;
    if (this.touches.size > 0) return;
    const wasClick = this.pointer.down && !this.pointer.moved;
    this.pointer.down = false;
    this.renderer.domElement.style.cursor = "";
    if (!wasClick) return;
    const hit = this.pick(e.clientX, e.clientY);
    if (hit) this.opts.onSquare(hit.square);
  };

  private onCancel = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    if (this.touches.size === 0) this.pointer.down = false;
  };

  private spread(): number {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  }

  private middle(): { x: number; y: number } {
    const [a, b] = [...this.touches.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : (a ?? { x: 0, y: 0 });
  }

  /** Le point du plateau sous un point de l'écran */
  private groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  /** Glisse la vue : le point du plateau sous le doigt reste sous le doigt */
  private panBy(from: { x: number; y: number }, to: { x: number; y: number }) {
    const a = this.groundAt(from.x, from.y);
    const b = this.groundAt(to.x, to.y);
    if (!a || !b) return;
    const delta = a.sub(b);
    delta.y = 0;
    this.pan.add(delta);
    this.clampPan();
    this.camTarget.copy(this.baseTarget).add(this.pan);
    this.closeUp = null;
    this.pendingFollow = null;
    this.grabbedAt = this.time;
    this.viewChanged();
  }

  /** Zoome vers un point de l'écran (la souris, le milieu des deux doigts) */
  private zoomTo(zoom: number, at?: { x: number; y: number }) {
    const next = THREE.MathUtils.clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    const ratio = next / this.zoom;
    if (Math.abs(ratio - 1) < 1e-4) return;
    const point = at ? this.groundAt(at.x, at.y) : null;
    if (point) {
      const target = this.baseTarget.clone().add(this.pan);
      const shift = point.sub(target).multiplyScalar(1 - ratio);
      shift.y = 0;
      this.pan.add(shift);
      this.clampPan();
    }
    this.zoom = next;
    this.camDist = this.distance * this.zoom;
    this.camTarget.copy(this.baseTarget).add(this.pan);
    this.closeUp = null;
    this.grabbedAt = this.time;
    this.viewChanged();
  }

  /** La vue ne quitte pas le plateau */
  private clampPan() {
    const lim = L.HALF * 0.92;
    this.pan.x = THREE.MathUtils.clamp(this.pan.x, -lim - this.baseTarget.x, lim - this.baseTarget.x);
    this.pan.z = THREE.MathUtils.clamp(this.pan.z, -lim - this.baseTarget.z, lim - this.baseTarget.z);
  }

  private viewChanged() {
    this.dirty = true;
    const moved = this.pan.lengthSq() > 0.0025 || Math.abs(this.zoom - 1) > 0.02;
    if (moved === this.viewMoved) return;
    this.viewMoved = moved;
    this.opts.onView?.(moved);
  }

  /** Remet la vue d'ensemble : tout le plateau, bien centré */
  resetView() {
    this.pan.set(0, 0, 0);
    this.zoom = 1;
    this.closeUp = null;
    this.viewChanged();
  }

  /** Les gros plans automatiques que le joueur a choisis */
  setCloseUps(c: CloseUps) {
    this.closeUps = c;
    if (!c.follow) this.pendingFollow = null;
    if (!c.dice && this.closeUp?.dice) this.closeUp = null;
    if (!c.follow && this.closeUp?.pawn) this.closeUp = null;
  }

  /** La caméra va voir un pion quelques secondes (un clic sur le portrait d'un joueur) */
  showPawn(id: string) {
    if (!this.pawns.has(id)) return;
    this.grabbedAt = -10;
    this.followPawn(id, 2.6, 0.42);
  }

  private followPawn(id: string, seconds: number, dist = FOLLOW_CLOSE) {
    if (this.opts.reduced || this.time - this.grabbedAt < 2) return;
    if (this.closeUp?.dice && this.time < this.closeUp.until) {
      this.pendingFollow = { id, seconds };
      return;
    }
    const o = this.pawns.get(id);
    if (!o || o.out) return;
    this.dirty = true;
    const until = this.time + seconds;
    if (this.closeUp?.pawn === id) this.closeUp.until = Math.max(this.closeUp.until, until);
    else this.closeUp = { point: new THREE.Vector3(o.pos.x, 0, o.pos.z), dist, until, pawn: id };
  }

  // -------------------------------------------------------------------------
  // Le filtre des villes
  // -------------------------------------------------------------------------

  /** Montre ou cache le voile d'une parcelle (p12) ou d'une case du tour (s12), créé à la première demande */
  private setVeil(key: string, on: boolean, shape: () => THREE.BufferGeometry) {
    let v = this.veils.get(key);
    if (!v) {
      if (!on) return;
      v = new THREE.Mesh(shape(), this.veilMat);
      v.position.y = 0.009;
      v.renderOrder = 1;
      this.scene.add(v);
      this.veils.set(key, v);
    }
    v.visible = on;
  }

  /** Ne garder en couleur que les villes de certains propriétaires (null : toutes) */
  setFilter(f: OwnerFilter) {
    this.filter = f;
    this.filterKey = "";
    this.applyFilter();
  }

  private applyFilter() {
    this.dirty = true;
    const s = this.state;
    const ownerOf = (i: number) => s?.deeds[i]?.owner ?? null;
    const kept = (i: number) => {
      const owner = ownerOf(i);
      return this.filter === null || (owner !== null && this.filter(owner));
    };
    for (const [i, lot] of this.lots) {
      const on = kept(i);
      lot.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (!on && m.userData.mat0 === undefined) {
          m.userData.mat0 = m.material;
          m.material = this.ghostMat;
        } else if (on && m.userData.mat0 !== undefined) {
          m.material = m.userData.mat0 as THREE.Material;
          delete m.userData.mat0;
        }
      });
      if (lot.outline) lot.outline.visible = on;
      this.setVeil(`p${i}`, this.filter !== null && !on, () => {
        const shape = new THREE.Shape(lot.parcel.poly.map((q) => new THREE.Vector2(q.x, -q.z)));
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        return geo;
      });
    }
    for (const [i, tint] of this.ringOwner) {
      tint.visible = ownerOf(i) !== null && kept(i);
      const r = L.squareRect(i);
      this.setVeil(`s${i}`, this.filter !== null && !kept(i), () => {
        const geo = new THREE.PlaneGeometry(r.w, r.d);
        geo.rotateX(-Math.PI / 2);
        geo.translate(r.x + r.w / 2, 0, r.z + r.d / 2);
        return geo;
      });
    }
    for (const [i, t] of this.tags) t.sprite.material.opacity = kept(i) ? 1 : 0.25;
    // Les contours brillants des villes retenues : refaits seulement si les propriétaires ont changé
    const key = this.filter ? [...this.lots.keys()].map((i) => (kept(i) ? `${i}:${ownerOf(i)}` : "")).join(",") : "";
    if (key === this.filterKey) return;
    this.filterKey = key;
    for (const r of this.filterRings) {
      this.scene.remove(r);
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    }
    this.filterRings = [];
    if (!this.filter || !s) return;
    for (const [i, lot] of this.lots) {
      const owner = ownerOf(i);
      if (!owner || !kept(i)) continue;
      const ring = this.parcelRing(lot.parcel, s.players.find((p) => p.id === owner)?.color ?? "#ffffff", 0.11, 0.95);
      ring.position.y = 0.012;
      this.scene.add(ring);
      this.filterRings.push(ring);
    }
  }

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    this.hoverRay = null;
    if (this.hover) {
      this.hover = null;
      this.updateFrames();
      this.opts.onHover?.(null, 0, 0);
    }
    this.renderer.domElement.style.cursor = "";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Un cran de molette, ou le pincement du pavé tactile (deltaY fin, ctrlKey)
    const step = e.ctrlKey ? Math.exp(e.deltaY * 0.01) : e.deltaY > 0 ? 1.1 : 1 / 1.1;
    this.zoomTo(this.zoom * step, { x: e.clientX, y: e.clientY });
  };

  private pick(clientX: number, clientY: number): { square: number; rect: L.WRect } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.square === undefined && o.name !== "board") o = o.parent;
      if (!o) continue;
      if (o.userData.square !== undefined) {
        const square = o.userData.square as number;
        return { square, rect: L.squareRect(square) };
      }
      const ring = L.squareAt(h.point.x, h.point.z);
      if (ring !== null) return { square: ring, rect: L.squareRect(ring) };
      const parcel = C.parcelAt(h.point.x, h.point.z);
      if (parcel && parcel.square >= 0) return { square: parcel.square, rect: L.squareRect(parcel.square) };
      return null;
    }
    return null;
  }

  private updateHover() {
    if (!this.hoverRay) return;
    const ray = this.hoverRay;
    const hit = this.pick(ray.x, ray.y);
    this.hoverRay = null;
    this.renderer.domElement.style.cursor = hit ? "pointer" : "";
    const same = hit && this.hover && hit.square === this.hover.square;
    if (!same && (hit || this.hover)) {
      this.hover = hit;
      this.updateFrames();
    }
    if (hit) this.opts.onHover?.(hit.square, ray.x, ray.y);
    else if (!same) this.opts.onHover?.(null, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Les repères à l'écran (la banque, la cagnotte) pour les billets qui volent
  // -------------------------------------------------------------------------

  /** Où se trouve une case à l'écran */
  screenOfSquare(i: number): { x: number; y: number } {
    const c = L.squareSpot(i);
    const p = new THREE.Vector3(c.x, 0, c.z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  setAnchors(anchors: Record<string, HTMLElement | null>) {
    this.anchors = anchors;
  }

  private updateAnchors() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const spots: Record<string, THREE.Vector3> = {
      bank: new THREE.Vector3(C.BANK_PARCEL.center.x, 0.5, C.BANK_PARCEL.center.z),
      pot: new THREE.Vector3(C.BANK_PARCEL.center.x, 0.12, C.BANK_PARCEL.center.z),
    };
    for (const [name, el] of Object.entries(this.anchors)) {
      const at = spots[name];
      if (!el || !at) continue;
      const p = at.clone().project(this.camera);
      el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`;
    }
  }

  // -------------------------------------------------------------------------
  // La boucle
  // -------------------------------------------------------------------------

  /** Ce qui demande une image à chaque passage : une animation, un lancer, un pion en route, la caméra qui tourne */
  private busy() {
    if (this.tweens.length > 0 || this.diceThrow || this.settling || this.closeUp) return true;
    for (const o of this.pawns.values()) if (o.hop || o.queue.length > 0) return true;
    return Math.abs(this.targetYaw() - this.yaw) > 0.002 || (this.focus !== null && this.time < this.focus.until + 1);
  }

  private frameLoop() {
    // Le temps des images sautées n'est pas perdu : les voitures gardent leur vitesse à 30 images par seconde
    this.pending += this.clock.getDelta();
    this.frames++;
    this.watchSpeed();
    const busy = this.busy();
    // Mode sobre : rien ne vit tout seul, on ne redessine que ce qui change.
    // Téléphone : la vie de la ville à 30 images par seconde, le reste à 60.
    if (this.opts.reduced && !busy && !this.dirty) return;
    if (this.opts.phone && !busy && !this.dirty && this.frames % 2 === 1) return;
    this.dirty = false;
    const dt = Math.min(0.05, this.pending);
    this.pending = 0;
    this.time += dt;
    const now = this.time;
    this.tweens = this.tweens.filter((tw) => {
      if (now < tw.t0) return true;
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      tw.step(t);
      if (t >= 1) {
        tw.done?.();
        return false;
      }
      return true;
    });
    this.playDice();
    this.updatePawns();
    this.updateLife(dt);
    this.updateHover();
    this.updateCamera(dt);
    this.updateAnchors();
    this.renderer.render(this.scene, this.camera);
  }

  /** Si les images tardent (moins de 40 par seconde pendant 3 s), on rend à la finesse de l'écran */
  private watchSpeed() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.opts.phone || this.ratio <= dpr) return;
    const dt = this.clock.elapsedTime - this.slow.time;
    this.slow.frames++;
    if (dt < 3) return;
    const fps = this.slow.frames / dt;
    this.slow = { time: this.clock.elapsedTime, frames: 0 };
    if (fps < 40 && !this.opts.reduced) {
      this.ratio = dpr;
      this.renderer.setPixelRatio(dpr);
      this.resize();
    }
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onCancel);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("wheel", this.onWheel);
    this.ghostMat.dispose();
    this.veilMat.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
    this.boardTex.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    el.remove();
  }
}

const L_JAIL = 10;

/** La matière du plateau : le texte imprimé lu un cran plus net que ce que choisirait la carte graphique */
function sharpMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "vec4 sampledDiffuseColor = texture2D( map, vMapUv );",
      "vec4 sampledDiffuseColor = texture2D( map, vMapUv, -0.6 );",
    );
  };
  return m;
}

function isDescendant(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}
