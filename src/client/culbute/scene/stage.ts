// La vitrine d'un combattant : lui seul sur un petit socle rond, sous une lumière de studio. Il respire, se tourne un
// peu vers nous, puis montre quelques coups de son style. Sert au choix du combattant (salon) et à la boutique (tenues).

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { moveDef } from "../../../shared/games/culbute/engine.ts";
import { headCanvas } from "../../bolides/scene/faces.ts";
import type { RenderFighter } from "../runtime.ts";
import { FighterModel, type FighterLook } from "./fighter.ts";

/** Ce qu'il montre, l'un après l'autre : attendre, frapper de côté, attendre, le spécial, attendre, frapper vers le haut */
const SHOW: { move: string; hold: number }[] = [
  { move: "", hold: 1.6 },
  { move: "s", hold: 0 },
  { move: "", hold: 1.2 },
  { move: "pn", hold: 0 },
  { move: "", hold: 1.2 },
  { move: "u", hold: 0 },
  { move: "", hold: 1.2 },
  { move: "g:taunt", hold: 0 },
];

function idle(): RenderFighter {
  return {
    x: 0,
    y: 0,
    face: 1,
    state: "stand",
    move: "",
    mt: 0,
    dmg: 0,
    stocks: 0,
    score: 0,
    flags: 0,
    shield: 50,
    item: "",
    charge: 0,
    t: 0,
    kb: 0,
    slot: 0,
    ground: 0,
    me: false,
  };
}

export class FighterStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  private holder = new THREE.Group();
  private model: FighterModel | null = null;
  private look: FighterLook | null = null;
  private env: THREE.Texture;
  private disposables: { dispose: () => void }[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private step = 0;
  private stepAt = 0;
  private still = false;
  /** La vitrine du salon (quelques coups), ou la victoire (des sauts de joie) */
  private mode: "show" | "victory" = "show";
  private visible = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.45;
    const keep = <T extends { dispose: () => void }>(x: T) => {
      this.disposables.push(x);
      return x;
    };
    // La lumière : une principale de trois quarts, un contre-jour qui dessine le bord, le ciel
    const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
    key.position.set(2.5, 4, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -1;
    key.shadow.bias = -0.0006;
    const rim = new THREE.DirectionalLight(0xbcd6ff, 1.6);
    rim.position.set(-3, 2.5, -3);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x6a5a4a, 0.7));
    // Le socle : un disque de bois verni, avec un liseré doré
    const base = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.95, 1.02, 0.16, 48)),
      keep(new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.45 })),
    );
    base.position.y = -0.08;
    base.receiveShadow = true;
    const ring = new THREE.Mesh(
      keep(new THREE.TorusGeometry(0.985, 0.025, 8, 64)),
      keep(new THREE.MeshStandardMaterial({ color: 0xe2b84a, roughness: 0.3, metalness: 0.85 })),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.0;
    this.scene.add(base, ring, this.holder);
    this.camera.position.set(0, 1.3, 6.3);
    this.camera.lookAt(0, 0.8, 0);
  }

  setLook(look: FighterLook) {
    if (this.model) {
      this.holder.remove(this.model.group);
      this.scene.remove(this.model.trail);
      this.model.dispose();
    }
    this.look = look;
    const model = new FighterModel({ ...look, me: false, bot: true, slot: 0 });
    // Pas de repère au-dessus de la tête dans la vitrine
    model.group.children.forEach((c) => {
      if (c instanceof THREE.Group && c.children[0] instanceof THREE.Sprite) c.visible = false;
    });
    // Cadrée serré : la bulle de la provocation à côté de la tête, un peu plus petite
    model.placeQuip(0.7, 1.85, 0.75);
    model.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.model = model;
    this.holder.add(model.group);
    this.scene.add(model.trail);
    this.step = 0;
    this.stepAt = this.time;
    void headCanvas(look.avatar).then((c) => {
      if (this.look === look && this.model === model) {
        model.setHead(c);
        if (!this.raf) this.frame(0);
      }
    });
    this.frame(0);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    if (!this.raf) this.frame(0);
  }

  setMode(mode: "show" | "victory") {
    this.mode = mode;
    this.step = 0;
    this.stepAt = this.time;
  }

  /** Animations coupées : une seule image, de trois quarts */
  setStill(on: boolean) {
    this.still = on;
    this.update();
  }

  setVisible(on: boolean) {
    this.visible = on;
    this.update();
  }

  private update() {
    const run = this.visible && !this.still;
    if (run && !this.raf) {
      this.last = performance.now();
      const loop = (now: number) => {
        this.raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.frame(dt);
      };
      this.raf = requestAnimationFrame(loop);
    } else if (!run && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.frame(0);
    }
  }

  private frame(dt: number) {
    if (!this.model || !this.look) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.time += dt;
    const f = idle();
    this.holder.position.y = 0;
    if (!this.still && this.mode === "victory") {
      // La victoire : deux sauts de joie bras levés, puis un tour sur lui-même, et on recommence
      const cycle = this.time % 2.6;
      const up = moveDef(this.look.style, "cu");
      const armsUp = up ? Math.max(...up.hits.map((h) => h.from)) + 1 : 14;
      if (cycle < 1.4) {
        const k = (cycle % 0.7) / 0.7;
        this.holder.position.y = Math.sin(k * Math.PI) * 0.75;
        f.state = "move";
        f.move = "cu";
        f.mt = armsUp;
      }
      const spin = cycle >= 1.6 && cycle < 2.3 ? ((cycle - 1.6) / 0.7) * Math.PI * 2 : 0;
      this.holder.rotation.y = -0.7 + Math.sin(this.time * 0.8) * 0.2 + spin;
    } else if (!this.still) {
      const cur = SHOW[this.step % SHOW.length]!;
      const elapsed = this.time - this.stepAt;
      const def = cur.move ? moveDef(this.look.style, cur.move) : null;
      const length = def ? def.frames / 60 + 0.25 : cur.hold;
      if (def) {
        const mt = Math.floor(elapsed * 60);
        if (mt < def.frames) {
          f.state = "move";
          f.move = cur.move;
          f.mt = mt;
        }
      }
      if (elapsed >= length) {
        this.step++;
        this.stepAt = this.time;
      }
      this.holder.rotation.y = Math.sin(this.time * 0.5) * 0.35 - 0.7;
    } else this.holder.rotation.y = -0.7;
    this.model.update(dt || 1 / 60, f, this.time);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.model?.dispose();
    for (const d of this.disposables) d.dispose();
    this.env.dispose();
    this.renderer.dispose();
  }
}
