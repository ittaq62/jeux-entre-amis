// Une vitrine : des joueurs de près, hors du match, sur un rond de pelouse qui se fond dans la page. Les mêmes joueurs
// qu'en match (footballers.ts) : les maillots des clubs au salon, une célébration avant de l'acheter.

import * as THREE from "three";
import type { KitColors } from "../../../shared/games/crampons/clubs.ts";
import { Footballers, type FootballerView } from "./footballers.ts";

/** Ce qu'on met en vitrine : chaque joueur avec son maillot et son numéro */
export interface StageActor {
  kit: KitColors;
  shirt: number;
}

/** Ce que fait chaque joueur à cet instant (et la vitrine qui s'éteint un instant, le temps de recommencer la boucle) */
export interface StageFrame {
  views: FootballerView[];
  /** De 0 (visible) à 1 (éteinte) */
  fade: number;
}

/**
 * Un petit film : `frame` est appelé à chaque image, `reset` le reprend au début. `still` : l'instant à montrer quand
 * il n'est pas joué (les animations coupées, ou un film sans mouvement : `fixed`).
 */
export interface StageScript {
  frame: (t: number, dt: number) => StageFrame;
  reset: () => void;
  still: number;
  fixed?: boolean;
}

export interface StageCamera {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
}

const GROUND_R = 5;

/** La pelouse : des bandes de tonte, qui s'effacent vers le bord */
function groundTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? "#3f9a38" : "#4aa940";
    g.fillRect((i * size) / 8, 0, size / 8 + 1, size);
  }
  // Le bord se fond dans la page : on efface en cercle
  g.globalCompositeOperation = "destination-in";
  const fade = g.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PlayerStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private ground: THREE.Mesh;
  private crowd: Footballers | null = null;
  private script: StageScript | null = null;
  private raf = 0;
  private last = 0;
  private t = 0;
  private visible = false;
  private still = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // La lumière d'un plein jour : les maillots gardent leurs vraies couleurs
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#6f9a5f", 1.15));
    const sun = new THREE.DirectionalLight("#fff1d9", 2.9);
    sun.position.set(-9, 20, 10);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight("#cfe0ff", 0.6);
    rim.position.set(12, 8, -14);
    this.scene.add(rim);
    const map = groundTexture();
    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(GROUND_R, 48),
      new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.95 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.renderOrder = -1;
    this.scene.add(this.ground);
  }

  /** Les joueurs : chaque changement de maillot repeint tout (une vitrine n'en a qu'un ou deux) */
  setActors(actors: StageActor[], seed: number) {
    this.crowd?.dispose();
    const kits = [actors[0]!.kit, (actors[1] ?? actors[0]!).kit] as [KitColors, KitColors];
    this.crowd = new Footballers(
      this.scene,
      actors.length,
      kits,
      kits,
      actors.map(() => false),
      actors.map((a) => a.shirt),
      false,
      seed,
    );
    this.sync();
  }

  setCamera(c: StageCamera) {
    this.camera.fov = c.fov;
    this.camera.position.set(c.x, c.y, c.z);
    this.camera.lookAt(c.tx, c.ty, c.tz);
    this.camera.updateProjectionMatrix();
    this.ground.position.set(c.tx, 0, c.tz);
  }

  /** Un nouveau film, repris au début */
  setScript(script: StageScript) {
    this.script = script;
    this.t = 0;
    script.reset();
    this.sync();
  }

  /** Les animations coupées (réglage « effets réduits ») : une seule image */
  setStill(still: boolean) {
    this.still = still;
    this.sync();
  }

  /** À l'écran ou pas (hors de la fenêtre, page cachée) : on ne joue le film que lorsqu'on le voit */
  setVisible(visible: boolean) {
    this.visible = visible;
    this.sync();
  }

  resize(width: number, height: number) {
    if (width < 2 || height < 2) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Le dessin s'efface quand la taille change : on le refait
    if (this.raf === 0) this.renderer.render(this.scene, this.camera);
  }

  private sync() {
    if (!this.crowd || !this.script) return;
    const animate = this.visible && !this.still && !this.script.fixed;
    if (animate && this.raf === 0) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    } else if (!animate) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.drawStill();
    }
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const f = this.script!.frame(this.t, dt);
    this.crowd!.update(dt, this.t, f.views);
    this.canvas.style.opacity = String(1 - f.fade);
    this.renderer.render(this.scene, this.camera);
  };

  /** L'image fixe : on rejoue le film jusqu'à l'instant `still`, pour que les gestes se posent comme en vrai */
  private drawStill() {
    const script = this.script!;
    script.reset();
    const step = 1 / 30;
    let t = 0;
    while (t + step <= script.still) {
      t += step;
      this.crowd!.update(step, t, script.frame(t, step).views);
    }
    this.t = 0;
    script.reset();
    this.canvas.style.opacity = "1";
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.crowd?.dispose();
    const mat = this.ground.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.ground.geometry.dispose();
    this.renderer.dispose();
    // La vitrine rend sa carte graphique tout de suite : on en ouvre et ferme souvent (fiches d'achat)
    this.renderer.forceContextLoss();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Les films
// ---------------------------------------------------------------------------------------------------------------------

const base = (i: number, x: number, z: number, h: number): FootballerView => ({
  x,
  z,
  h,
  v: 0,
  act: "none",
  team: (i === 0 ? 0 : 1) as 0 | 1,
  keeper: false,
  dirX: 0,
  dirZ: 0,
  cheer: false,
  off: false,
});

/** Face à la caméra (qui regarde depuis +z) */
const FACING = Math.PI / 2;

/** Les joueurs d'un ou deux clubs, debout face à nous, un peu tournés l'un vers l'autre */
export function lineupScript(count: number): StageScript {
  const spots = count === 1 ? [0] : [-0.72, 0.72];
  return {
    still: 1.2,
    fixed: true,
    reset: () => {},
    frame: () => ({
      views: spots.map((x, i) => base(i, x, 0, FACING + (count === 1 ? 0.2 : i === 0 ? -0.28 : 0.28))),
      fade: 0,
    }),
  };
}

/** La boucle d'une célébration : la course vers le coin, la célébration, puis on recommence */
const LOOP = 5.6;
const START_X = -5.5;
const FADE = 0.3;

/**
 * Une célébration : il arrive en courant (de la gauche), s'arrête et la fait, face à nous. `pose` : celle de la boutique
 * (boutique.ts) ; null, « à sa façon » : une des quatre de chaque joueur, une autre à chaque boucle.
 */
export function celebrationScript(pose: number | null): StageScript {
  let x = START_X;
  let h = 0;
  let loop = -1;
  const knee = pose === 8;
  const top = knee ? 8.6 : 6.4;
  return {
    // Arrêtée, la vitrine le montre en pleine célébration
    still: 3.2,
    reset: () => {
      loop = -1;
    },
    frame: (t, dt) => {
      const n = Math.floor(t / LOOP);
      const k = t - n * LOOP;
      const fresh = n !== loop;
      if (fresh) {
        loop = n;
        x = START_X;
        h = 0;
      }
      // Il ralentit sur les deux derniers mètres, comme en match (la glissade à genoux : sur sa lancée)
      const left = -x;
      const v = left <= 0.01 ? 0 : Math.min(top, left * (knee ? 6 : 4.5) + 0.6);
      x = Math.min(0, x + v * dt);
      // Arrivé, il se tourne vers nous
      if (v < 0.35) h += (FACING - h) * Math.min(1, dt * 7);
      const view: FootballerView = {
        ...base(0, x, 0, h),
        v,
        // Le tout premier instant d'une boucle, il ne fête pas : la glissade repart de zéro (footballers.ts)
        cheer: !fresh,
        joy: pose ?? n % 4,
      };
      const fade = k > LOOP - FADE ? (k - (LOOP - FADE)) / FADE : k < FADE ? 1 - k / FADE : 0;
      return { views: [view], fade };
    },
  };
}
