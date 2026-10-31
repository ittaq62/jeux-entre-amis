import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HOTEL, SQUARES, UTILITIES, type DeckId, type SpecialKind } from "../../../shared/games/capitale/board.ts";
import { play } from "../../lib/sound.ts";
import * as B from "./buildings.ts";
import { DIE, diceMeshes, restingQuaternion, simulateThrow, type Throw } from "./dice.ts";
import * as L from "./layout.ts";
import { drawBoard, fontsReady, hatchTexture, makeCanvas, signTexture } from "./textures.ts";

// La scène 3D de Capitale : le plateau, la ville au centre, les pions, les dés.
// Elle ne connaît que ce qu'on lui montre (setState) ; les animations partent des différences.

export interface ScenePlayer {
  id: string;
  color: string;
  position: number;
  inJail: boolean;
  bankrupt: boolean;
}

export interface SceneDeed {
  owner: string | null;
  houses: number;
  mortgaged: boolean;
  /** Le bâtiment spécial posé sur le terrain, et qui l'a posé */
  special?: { kind: SpecialKind; by: string };
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
}

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
  lot: L.Lot;
  root: THREE.Group;
  houses: THREE.Group[];
  tower: THREE.Group | null;
  flag: THREE.Group | null;
  sale: THREE.Group | null;
  fence: THREE.Group | null;
  outline: THREE.Mesh | null;
  special: THREE.Group | null;
  /** Les maisons ont reculé pour laisser l'avant-cour au bâtiment spécial */
  yard: boolean;
  shown: SceneDeed;
}

const HOP_SECONDS = 0.17;
const JUMP_SECONDS = 0.55;
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

  private pawns = new Map<string, PawnObj>();
  private turnRing: THREE.Mesh;
  private lots = new Map<number, LotObj>();
  private ringOwner = new Map<number, THREE.Mesh>();
  private ringHatch = new Map<number, THREE.Mesh>();
  private utilityFlags = new Map<number, THREE.Group>();
  private highlightFrame: THREE.Group;
  private highlightLot: THREE.Group;
  private hoverFrame: THREE.Group;
  private highlightAt: number | null = null;
  private marker: THREE.Mesh;
  private hover: { square: number; rect: L.WRect } | null = null;

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
  /** La vapeur des centrales */
  private steams: THREE.Object3D[] = [];
  private water: THREE.Mesh | null = null;
  private jet: THREE.Mesh | null = null;
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
    this.pitch = opts.phone ? 1.08 : 0.94;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "cap-canvas";
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.addLights();

    // Le plateau : une toile en haute définition, filtrée de biais pour rester nette même vue de loin
    const size = Math.min(this.renderer.capabilities.maxTextureSize, opts.phone ? 2048 : 3072);
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
    this.highlightLot = this.frame("#ffb000", 0.07, 0.28);
    this.hoverFrame = this.frame("#46a8ff", 0.045, 0.16);
    // Une flèche dorée qui flotte au-dessus de la parcelle mise en avant
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: "#ffb000", emissive: "#7a4a00", roughness: 0.3, metalness: 0.4 }),
    );
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.marker.castShadow = true;
    this.scene.add(this.highlightFrame, this.highlightLot, this.hoverFrame, this.marker);

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
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(L.BOARD, L.BOARD),
      new THREE.MeshStandardMaterial({ map: this.boardTex, roughness: 0.82, metalness: 0 }),
    );
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
      const strip = this.outerStrip(r, 0.08);
      const owner = new THREE.Mesh(
        new THREE.BoxGeometry(strip.w, 0.012, strip.d),
        new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }),
      );
      owner.position.set(strip.x + strip.w / 2, 0.006, strip.z + strip.d / 2);
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
    for (const lot of L.LOTS) {
      const root = new THREE.Group();
      root.position.set(lot.x + lot.w / 2, 0, lot.z + lot.d / 2);
      root.rotation.y = lot.facing;
      root.userData.square = lot.square;
      this.scene.add(root);
      if (lot.kind === "station") root.add(B.station(LIVERIES[lot.square] ?? "#2f5bb8"));
      else if (lot.kind === "tax") root.add(B.taxOffice());
      else if (lot.kind === "toll") root.add(B.tollBooth());
      this.pickables.push(root);
      if (lot.kind === "property" || lot.kind === "station") {
        const obj: LotObj = {
          lot,
          root,
          houses: [],
          tower: null,
          flag: null,
          sale: null,
          fence: null,
          outline: null,
          special: null,
          yard: false,
          shown: { owner: null, houses: 0, mortgaged: false },
        };
        this.lots.set(lot.square, obj);
        if (lot.kind === "property") {
          obj.sale = B.forSale();
          obj.sale.position.set(0, 0, 0.05);
          root.add(obj.sale);
        }
      }
    }

    // La place : la banque, le barrage, le parc, les éoliennes
    const bank = B.bank();
    bank.position.set(L.LANDMARKS.bank.x, 0, L.LANDMARKS.bank.z);
    bank.rotation.y = Math.atan2(-L.LANDMARKS.bank.x, -L.LANDMARKS.bank.z);
    this.decor.add(bank);
    const dam = B.dam();
    dam.group.position.set(L.LANDMARKS.dam.x, 0, L.LANDMARKS.dam.z);
    dam.group.userData.square = 12;
    this.water = dam.water;
    this.scene.add(dam.group);
    this.pickables.push(dam.group);
    const wind = new THREE.Group();
    wind.position.set(L.LANDMARKS.wind.x, 0, L.LANDMARKS.wind.z);
    wind.userData.square = 28;
    for (const [x, z, h] of [
      [-0.25, 0.22, 0.85],
      [0.18, -0.05, 1],
      [-0.12, -0.3, 0.75],
    ] as const) {
      const t = B.turbine(h);
      t.group.position.set(x, 0, z);
      t.group.rotation.y = Math.PI * 0.8;
      wind.add(t.group);
      this.rotors.push({ obj: t.rotor, speed: 1.4 + h * 0.6 });
    }
    this.scene.add(wind);
    this.pickables.push(wind);
    const f = B.fountain();
    f.group.position.set(L.LANDMARKS.park.x, 0, L.LANDMARKS.park.z);
    this.jet = f.jet;
    this.decor.add(f.group);
    for (const sq of UTILITIES) {
      const spot = L.UTILITY_SPOT[sq]!;
      const fl = B.flag("#ffffff");
      fl.position.set(spot.x + 0.36 * Math.sign(spot.x), 0, spot.z + 0.36 * Math.sign(spot.z));
      fl.visible = false;
      this.scene.add(fl);
      this.utilityFlags.set(sq, fl);
      this.flags.push(fl.getObjectByName("cloth")!);
    }

    // Les deux paquets de cartes
    for (const deck of ["hasard", "courrier"] as DeckId[]) {
      const g = new THREE.Group();
      const spot = L.DECK_SPOT[deck];
      g.position.set(spot.x, 0, spot.z);
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
      const geo = new THREE.BoxGeometry(0.58, 0.012, 0.38);
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

    // Les arbres : autour de la place, dans le parc, au bord du lac
    const spots: { x: number; z: number; s: number; kind: number }[] = [];
    const edge = L.ARENA + 0.1 + L.PLAZA_CORNER.size / 2;
    for (const t of [-1.12, -0.72, 0.72, 1.12]) {
      spots.push({ x: t, z: edge + 0.18, s: 0.8, kind: 0 }, { x: t, z: -edge - 0.18, s: 0.8, kind: 0 });
    }
    for (const t of [-1.05, -0.35, 0.35, 1.05]) {
      spots.push({ x: edge + 0.18, z: t, s: 0.8, kind: 0 }, { x: -edge - 0.18, z: t, s: 0.8, kind: 0 });
    }
    // Des massifs de fleurs, des réverbères et des bancs autour de la rose des vents
    let seed = 1;
    const inner = edge - 0.28;
    for (const a of [-0.95, 0.95]) {
      for (const b of [-inner, inner]) {
        const across = B.flowerBed(0.42, 0.16, seed++);
        across.position.set(a, 0, b);
        const along = B.flowerBed(0.16, 0.42, seed++);
        along.position.set(b, 0, a);
        this.decor.add(across, along);
      }
    }
    for (const [x, z] of [
      [-1.42, -1.42],
      [1.42, -1.42],
      [-1.42, 1.42],
      [1.42, 1.42],
      [-edge + 0.05, 0],
      [edge - 0.05, 0],
    ] as const) {
      const l = B.lamp();
      l.position.set(x, 0, z);
      this.decor.add(l);
    }
    for (const [x, z, r] of [
      [-0.45, edge - 0.3, 0],
      [0.45, edge - 0.3, 0],
      [-0.45, -edge + 0.3, Math.PI],
      [0.45, -edge + 0.3, Math.PI],
      [edge - 0.3, -0.45, -Math.PI / 2],
      [edge - 0.3, 0.45, -Math.PI / 2],
      [-edge + 0.3, -0.45, Math.PI / 2],
      [-edge + 0.3, 0.45, Math.PI / 2],
    ] as const) {
      const bn = B.bench();
      bn.position.set(x, 0, z);
      bn.rotation.y = r;
      this.decor.add(bn);
    }
    const p = L.LANDMARKS.park;
    for (const [dx, dz] of [
      [-0.32, -0.32],
      [0.32, -0.32],
      [-0.32, 0.32],
      [0.32, 0.32],
      [0, -0.38],
    ] as const) {
      spots.push({ x: p.x + dx, z: p.z + dz, s: 1.15, kind: 0 });
    }
    const d = L.LANDMARKS.dam;
    for (const [dx, dz] of [
      [-0.38, 0.3],
      [0.32, -0.36],
      [-0.4, -0.25],
    ] as const) {
      spots.push({ x: d.x + dx, z: d.z + dz, s: 1.1, kind: 1 });
    }
    const b = L.LANDMARKS.bank;
    spots.push({ x: b.x + 0.38, z: b.z - 0.36, s: 0.9, kind: 0 }, { x: b.x - 0.36, z: b.z + 0.38, s: 0.9, kind: 0 });
    this.decor.add(B.trees(spots));

    // La circulation : la rocade et la rue intérieure, dans les deux sens
    const colors = ["#d6433a", "#f2f2ee", "#2f5bb8", "#e8b12f", "#3c3f44", "#2fa864", "#e07a3a", "#9fb4c4"];
    const lanes = [
      { half: L.OUTER_ROAD + 0.055, n: 6, reverse: false },
      { half: L.OUTER_ROAD - 0.055, n: 5, reverse: true },
      { half: L.INNER_ROAD + 0.055, n: 3, reverse: false },
      { half: L.INNER_ROAD - 0.055, n: 3, reverse: true },
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
        const group = B.pawn(p.color);
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
      const strip = this.ringOwner.get(i);
      if (strip) {
        strip.visible = d.owner !== null;
        if (d.owner) (strip.material as THREE.MeshStandardMaterial).color.set(colorOf(d.owner));
      }
      const hatch = this.ringHatch.get(i);
      if (hatch) hatch.visible = d.mortgaged;
      const uf = this.utilityFlags.get(i);
      if (uf) {
        uf.visible = d.owner !== null;
        if (d.owner) ((uf.getObjectByName("cloth") as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(colorOf(d.owner));
      }
      const lot = this.lots.get(i);
      if (lot) this.syncLot(lot, d, colorOf(d.owner), first, colorOf(d.special?.by ?? null));
    }
  }

  private syncLot(o: LotObj, d: SceneDeed, color: string, first: boolean, byColor: string) {
    const prev = o.shown;
    const animate = !first && !this.opts.reduced;
    const property = o.lot.kind === "property";
    const halfW = lotHalfWidth(o.lot);
    // Le propriétaire : son drapeau, le liseré de la parcelle ; le panneau « à vendre » s'en va
    if (d.owner !== prev.owner) {
      if (o.flag) this.removeObj(o.flag, animate);
      if (o.outline) {
        o.root.remove(o.outline);
        o.outline.geometry.dispose();
      }
      o.flag = null;
      o.outline = null;
      if (d.owner) {
        o.flag = B.flag(color);
        o.flag.position.set(halfW - 0.07, 0, L.DEPTH / 2 - 0.3);
        o.root.add(o.flag);
        this.flags.push(o.flag.getObjectByName("cloth")!);
        if (animate) this.popIn(o.flag);
        o.outline = this.outline(halfW * 2, L.DEPTH, color);
        o.root.add(o.outline);
      }
      if (o.sale) o.sale.visible = d.owner === null;
      if (animate && d.owner) this.lookAtSoon(o.root.position.clone());
    }
    // Hypothèque : une palissade
    if (d.mortgaged !== prev.mortgaged) {
      if (o.fence) this.removeObj(o.fence, animate);
      o.fence = null;
      if (d.mortgaged) {
        o.fence = B.fence(halfW * 2 - 0.08, L.DEPTH - 0.32);
        o.fence.position.z = -0.12;
        o.root.add(o.fence);
        if (animate) this.popIn(o.fence);
      }
    }
    // Le bâtiment spécial, dans l'avant-cour : les maisons reculent d'abord pour lui faire de la place
    const specialKey = (x: SceneDeed) => (x.special ? `${x.special.kind}|${x.special.by}` : "");
    if (property && specialKey(d) !== specialKey(prev)) {
      if (o.special) {
        const old = o.special;
        this.removeObj(old, animate);
        this.steams = this.steams.filter((s) => !isDescendant(s, old));
      }
      o.special = null;
      const yard = Boolean(d.special);
      if (yard !== o.yard) {
        o.yard = yard;
        this.slideHouses(o, animate, yard ? 0 : 0.3);
      }
      if (d.special) {
        const b = B.specialBuilding(d.special.kind, color, byColor);
        o.special = b.group;
        o.special.position.set(d.special.kind === "tour" ? -0.12 : -0.04, 0, YARD_Z);
        o.root.add(o.special);
        this.steams.push(...b.steam);
        if (animate) {
          this.rise(o.special, d.special.kind === "tour" ? 1.0 : 0.6, 0.35);
          this.dust(o.root, o.special.position.x, YARD_Z, 0.35);
          this.lookAtSoon(o.root.position.clone());
        }
      }
    }
    // Les constructions
    if (property && d.houses !== prev.houses) {
      const group = o.lot.group!;
      if (d.houses === HOTEL) {
        o.houses.forEach((h, k) => this.removeObj(h, animate, k * 0.06));
        o.houses = [];
        if (!o.tower) {
          o.tower = B.skyscraper(group, color, o.lot.square === 39);
          o.tower.position.set(0, 0, towerZ(o.yard));
          o.root.add(o.tower);
          if (animate) {
            this.rise(o.tower, 1.1, 0.35);
            this.dust(o.root, 0, -0.1, 0.55);
            this.lookAtSoon(o.root.position.clone());
          }
        }
      } else {
        if (o.tower) {
          this.removeObj(o.tower, animate);
          o.tower = null;
        }
        while (o.houses.length > d.houses) this.removeObj(o.houses.pop()!, animate);
        while (o.houses.length < d.houses) {
          const k = o.houses.length + 1;
          const h = B.houseBuilding(group, k, color);
          h.position.copy(houseSpot(k, o.yard, halfW));
          o.root.add(h);
          o.houses.push(h);
          if (animate) {
            this.rise(h, 0.55, (o.houses.length - prev.houses - 1) * 0.12);
            this.dust(o.root, h.position.x, h.position.z, 0.3);
            this.lookAtSoon(o.root.position.clone());
          }
        }
      }
    }
    o.shown = { ...d };
  }

  /** Les maisons et le gratte-ciel glissent à leur place : au fond de la parcelle quand l'avant-cour est prise */
  private slideHouses(o: LotObj, animate: boolean, delay = 0) {
    const halfW = lotHalfWidth(o.lot);
    const moves = o.houses.map((h, k) => ({ obj: h as THREE.Object3D, to: houseSpot(k + 1, o.yard, halfW) }));
    if (o.tower) moves.push({ obj: o.tower, to: new THREE.Vector3(0, 0, towerZ(o.yard)) });
    for (const m of moves) {
      if (!animate) {
        m.obj.position.copy(m.to);
        continue;
      }
      const from = m.obj.position.clone();
      this.tween(0.45, (t) => m.obj.position.lerpVectors(from, m.to, easeInOut(t)), undefined, delay);
    }
  }

  /** Un liseré à plat autour de la parcelle */
  private outline(w: number, d: number, color: string): THREE.Mesh {
    const t = 0.035;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -d / 2);
    shape.lineTo(w / 2, -d / 2);
    shape.lineTo(w / 2, d / 2);
    shape.lineTo(-w / 2, d / 2);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-w / 2 + t, -d / 2 + t);
    hole.lineTo(-w / 2 + t, d / 2 - t);
    hole.lineTo(w / 2 - t, d / 2 - t);
    hole.lineTo(w / 2 - t, -d / 2 + t);
    hole.closePath();
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, B.mat(color, { rough: 0.5 }));
    m.position.y = 0.004;
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
      this.potStack.position.set(L.LANDMARKS.park.x + 0.28, 0, L.LANDMARKS.park.z + 0.05);
      this.scene.add(this.potStack);
    }
  }

  private updateFrames() {
    this.dirty = true;
    const h = this.highlightAt;
    this.highlightFrame.visible = h !== null;
    if (h !== null) this.placeFrame(this.highlightFrame, L.squareRect(h));
    const lot = h !== null ? cityRect(h) : null;
    this.highlightLot.visible = lot !== null;
    this.marker.visible = lot !== null;
    if (lot) {
      this.placeFrame(this.highlightLot, lot);
      this.marker.position.set(lot.x + lot.w / 2, 1, lot.z + lot.d / 2);
    }
    const hv = this.hover && this.hover.square !== h ? this.hover.rect : null;
    this.hoverFrame.visible = hv !== null;
    if (hv) this.placeFrame(this.hoverFrame, hv);
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
    const data = simulateThrow(values, from, L.ARENA - 0.06, Math.random);
    this.diceThrow = { data, t0: this.time, values, sounded: 0 };
    for (const d of this.dice) d.visible = true;
    for (const g of this.diceGlow) (g.material as THREE.MeshBasicMaterial).opacity = 0;
    play("capDiceShake", { volume: 0.7 });
    this.focus = { point: new THREE.Vector3(0, 0, 0), until: this.time + data.duration + 0.4 };
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
  private rise(o: THREE.Object3D, dur: number, delay = 0) {
    o.scale.set(1, 0.001, 1);
    this.tween(
      dur,
      (t) => {
        const e = springOut(t);
        o.scale.set(1 + Math.sin(t * Math.PI) * 0.04, Math.max(0.001, e), 1 + Math.sin(t * Math.PI) * 0.04);
      },
      () => o.scale.set(1, 1, 1),
      delay,
    );
    this.tween(
      0.01,
      () => {},
      () => play(dur > 0.8 ? "capBuildBig" : "capBuild", { volume: 0.8 }),
      delay,
    );
  }

  private popIn(o: THREE.Object3D) {
    o.scale.setScalar(0.001);
    this.tween(
      0.45,
      (t) => o.scale.setScalar(Math.max(0.001, springOut(t))),
      () => o.scale.setScalar(1),
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
    for (const s of this.steams) B.placeSteam(s, this.time * 0.3);
    this.flags.forEach((f, k) => (f.rotation.y = Math.sin(this.time * 2.2 + k) * 0.35));
    if (this.water) {
      const m = this.water.material as THREE.MeshStandardMaterial;
      m.color.setHSL(0.56, 0.52, 0.5 + Math.sin(this.time * 1.3) * 0.03);
    }
    if (this.jet) this.jet.scale.y = 0.75 + Math.sin(this.time * 3.1) * 0.25 + Math.sin(this.time * 7.7) * 0.06;
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
    for (const f of [this.highlightFrame, this.highlightLot]) {
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
    // Le plus court chemin vers le quart de tour voulu
    const want = (this.rot * Math.PI) / 2;
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
    for (let iter = 0; iter < 3; iter++) {
      let lo = 5;
      let hi = 80;
      for (let n = 0; n < 24; n++) {
        const mid = (lo + hi) / 2;
        this.placeCamera(this.yaw, this.pitch, mid, target);
        const fits = corners.every((c) => {
          const p = c.clone().project(this.camera);
          return Math.abs(p.x) <= 0.93 && Math.abs(p.y) <= 0.92;
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
      const off = (minY + maxY) / 2;
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
    const goal = this.baseTarget.clone();
    let dist = this.distance * this.zoom;
    if (focusing && this.focus) {
      goal.lerp(this.focus.point, 0.08);
      dist *= 0.97;
    }
    this.camTarget.lerp(goal, k * 0.6);
    this.camDist += (dist - this.camDist) * k * 0.6;
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
    el.addEventListener("pointerleave", this.onLeave);
    if (!this.opts.phone) el.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onDown = (e: PointerEvent) => {
    this.pointer = { down: true, x: e.clientX, y: e.clientY, moved: false };
  };

  private onMove = (e: PointerEvent) => {
    if (this.pointer.down && Math.hypot(e.clientX - this.pointer.x, e.clientY - this.pointer.y) > 6) this.pointer.moved = true;
    if (e.pointerType === "mouse") this.hoverRay = { x: e.clientX, y: e.clientY };
  };

  private onUp = (e: PointerEvent) => {
    const wasClick = this.pointer.down && !this.pointer.moved;
    this.pointer.down = false;
    if (!wasClick) return;
    const hit = this.pick(e.clientX, e.clientY);
    if (hit) this.opts.onSquare(hit.square);
  };

  private onLeave = () => {
    this.hoverRay = null;
    if (this.hover) {
      this.hover = null;
      this.updateFrames();
    }
    this.renderer.domElement.style.cursor = "";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 1.06 : 0.94), 0.62, 1.12);
    this.dirty = true;
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
        return { square, rect: cityRect(square) ?? L.squareRect(square) };
      }
      const ring = L.squareAt(h.point.x, h.point.z);
      if (ring !== null) return { square: ring, rect: L.squareRect(ring) };
      const city = L.citySquareAt(h.point.x, h.point.z);
      if (city !== null) return { square: city, rect: cityRect(city)! };
      return null;
    }
    return null;
  }

  private updateHover() {
    if (!this.hoverRay) return;
    const hit = this.pick(this.hoverRay.x, this.hoverRay.y);
    this.hoverRay = null;
    this.renderer.domElement.style.cursor = hit ? "pointer" : "";
    const same = hit && this.hover && hit.square === this.hover.square && hit.rect === this.hover.rect;
    if (!same && (hit || this.hover)) {
      this.hover = hit;
      this.updateFrames();
    }
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
      bank: new THREE.Vector3(L.LANDMARKS.bank.x, 0.45, L.LANDMARKS.bank.z),
      pot: new THREE.Vector3(L.LANDMARKS.park.x + 0.28, 0.12, L.LANDMARKS.park.z),
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
    if (this.tweens.length > 0 || this.diceThrow) return true;
    for (const o of this.pawns.values()) if (o.hop || o.queue.length > 0) return true;
    return Math.abs(this.targetYaw() - this.yaw) > 0.002 || (this.focus !== null && this.time < this.focus.until + 1);
  }

  private frameLoop() {
    // Le temps des images sautées n'est pas perdu : les voitures gardent leur vitesse à 30 images par seconde
    this.pending += this.clock.getDelta();
    this.frames++;
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

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("wheel", this.onWheel);
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

/** Où se posent les quatre maisons d'une parcelle (repère de la parcelle, façade vers +z) : devant les petites, derrière les grandes */
const HOUSE_SLOTS: [number, number][] = [
  [-0.21, 0.24],
  [0.21, 0.22],
  [-0.2, -0.33],
  [0.2, -0.36],
];
/** Les mêmes, reculées quand un bâtiment spécial occupe l'avant-cour (entre les maisons et la bande au nom de la ville) */
const HOUSE_SLOTS_YARD: [number, number][] = [
  [-0.21, 0.0],
  [0.21, -0.01],
  [-0.2, -0.47],
  [0.2, -0.48],
];
/** Le milieu de l'avant-cour, devant les maisons */
const YARD_Z = 0.34;

const lotHalfWidth = (lot: L.Lot) => (lot.side === "bottom" || lot.side === "top" ? lot.w : lot.d) / 2;
const houseSpot = (k: number, yard: boolean, halfW: number) => {
  const slot = (yard ? HOUSE_SLOTS_YARD : HOUSE_SLOTS)[k - 1]!;
  return new THREE.Vector3(slot[0] * (halfW / 0.42), 0, slot[1]);
};
const towerZ = (yard: boolean) => (yard ? -0.27 : -0.1);

/** La parcelle de la ville qui représente une case (ou le coin de la place pour le barrage et les éoliennes) */
function cityRect(square: number): L.WRect | null {
  const lot = L.LOT_OF[square];
  if (lot) return lot;
  const spot = L.UTILITY_SPOT[square];
  if (!spot) return null;
  const s = L.PLAZA_CORNER.size;
  return { x: spot.x - s / 2, z: spot.z - s / 2, w: s, d: s };
}

function isDescendant(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}
