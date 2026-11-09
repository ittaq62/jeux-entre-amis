// Le stade de Crampons : la pelouse, deux étages de tribunes garnies de supporters, les toits, les pylônes, les panneaux
// lumineux, les écrans géants et les buts. Tout est construit au lancement, sans aucune image à télécharger.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GOAL_DEPTH, GOAL_H, GOAL_HALF, HALF_L, HALF_W } from "../../../shared/games/crampons/pitch.ts";
import { Crowd, type Seat } from "./crowd.ts";
import type { Weather } from "./effects.ts";
import { buildGrass, type GrassColors } from "./grass.ts";

export type Ambience = "jour" | "soir" | "nuit";

interface Theme {
  skyTop: string;
  skyBottom: string;
  haze: string;
  sun: number;
  hemi: number;
  sunColor: string;
  sunDir: [number, number, number];
  rim: number;
  grass: GrassColors;
  roof: string;
  concrete: string;
  glow: number;
  exposure: number;
}

export const THEMES: Record<Ambience, Theme> = {
  jour: {
    skyTop: "#2f7fd6",
    skyBottom: "#cbe7f7",
    haze: "#d9ecf6",
    sun: 2.9,
    hemi: 1.15,
    sunColor: "#fff1d9",
    sunDir: [-0.45, 1, 0.5],
    rim: 0.5,
    grass: { a: "#4fae42", b: "#3f9a38", dirt: "#9a8452", outside: "#2c6b2b" },
    roof: "#e6e9ee",
    concrete: "#7c8798",
    glow: 0,
    exposure: 1,
  },
  soir: {
    skyTop: "#27347c",
    skyBottom: "#ffae74",
    haze: "#f3b98f",
    sun: 2.7,
    hemi: 0.95,
    sunColor: "#ffc690",
    sunDir: [-0.85, 0.62, 0.32],
    rim: 0.9,
    grass: { a: "#4ea440", b: "#3c9036", dirt: "#8f7648", outside: "#2a6329" },
    roof: "#8f8ba3",
    concrete: "#5f6680",
    glow: 0.55,
    exposure: 1.02,
  },
  nuit: {
    skyTop: "#040713",
    skyBottom: "#141f47",
    haze: "#10183a",
    sun: 2.5,
    hemi: 0.7,
    sunColor: "#e9f0ff",
    sunDir: [-0.2, 1, 0.35],
    rim: 1.1,
    grass: { a: "#45a03c", b: "#368a33", dirt: "#7c6a46", outside: "#1f5527" },
    roof: "#3a4158",
    concrete: "#3f465e",
    glow: 1,
    exposure: 1.08,
  },
};

/** Sous la pluie ou la neige, le ciel se couvre et la lumière perd son éclat */
export function themeFor(ambience: Ambience, weather: Weather): Theme {
  const base = THEMES[ambience];
  if (weather === "clair") return base;
  const cover = new THREE.Color(
    ambience === "jour" ? (weather === "neige" ? "#c6cfda" : "#7f8b9a") : ambience === "soir" ? "#565a6c" : "#1a2029",
  );
  const toward = (c: string, k: number) => `#${new THREE.Color(c).lerp(cover, k).getHexString()}`;
  // La nuit, ce sont les projecteurs qui éclairent : le temps ne change presque rien
  const sun = ambience === "nuit" ? 0.9 : weather === "pluie" ? 0.48 : 0.62;
  return {
    ...base,
    skyTop: toward(base.skyTop, 0.88),
    skyBottom: toward(base.skyBottom, 0.82),
    haze: toward(base.haze, 0.85),
    sun: base.sun * sun,
    hemi: base.hemi * 1.1,
    sunColor: toward(base.sunColor, 0.35),
  };
}

const MARGIN = 9;
const ROW_H = 0.62;
const ROW_D = 0.92;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g.toNonIndexed();
}

function ledTexture(colors: [string, string]): THREE.CanvasTexture {
  const [c, g] = canvas(2048, 96);
  const messages: [string, string, string][] = [
    ["#0d5c3f", "#f3d68a", "LA TABLÉE"],
    [colors[0], "#ffffff", "ALLEZ !"],
    ["#c8362f", "#ffffff", "CRAMPONS"],
    ["#1a3f8f", "#ffd24d", "ENTRE AMIS"],
    [colors[1], "#ffffff", "ON JOUE ?"],
    ["#f4c64e", "#2a1c08", "BUUUT !"],
  ];
  const w = 2048 / messages.length;
  messages.forEach(([bg, fg, text], i) => {
    g.fillStyle = bg;
    g.fillRect(i * w, 0, w, 96);
    g.fillStyle = "rgba(255,255,255,0.09)";
    for (let x = 0; x < w; x += 6) g.fillRect(i * w + x, 0, 1, 96);
    g.fillStyle = fg;
    g.font = "900 46px 'Arial Black', Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, (i + 0.5) * w, 50);
  });
  return texture(c, true);
}

/** Les banderoles accrochées au bas des tribunes, aux couleurs des deux clubs */
function bannerTexture(colors: [string, string]): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 64);
  const w = 1024 / 8;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = colors[i % 2]!;
    g.fillRect(i * w, 0, w, 64);
    g.fillStyle = "rgba(255,255,255,0.85)";
    for (let k = 0; k < 4; k++) {
      const x = i * w + 22 + k * 28;
      g.beginPath();
      g.moveTo(x, 12);
      g.lineTo(x + 10, 32);
      g.lineTo(x, 52);
      g.lineTo(x - 10, 32);
      g.closePath();
      g.fill();
    }
  }
  return texture(c, true);
}

function netTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,0.8)";
  g.lineWidth = 3;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  return texture(c, true);
}

interface GoalParts {
  group: THREE.Group;
  back: THREE.Mesh;
  backX: number;
  end: number;
}

function buildGoal(end: number, netTex: THREE.Texture, shadows: boolean): GoalParts {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: "#fbfbf6", roughness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({ color: "#c9ced8", roughness: 0.5 });
  const R = 0.085;
  const line = end * HALF_L;
  const addBar = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = shadows;
    group.add(m);
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  addBar(v(line, 0, -GOAL_HALF), v(line, GOAL_H, -GOAL_HALF), R, white);
  addBar(v(line, 0, GOAL_HALF), v(line, GOAL_H, GOAL_HALF), R, white);
  addBar(v(line, GOAL_H, -GOAL_HALF - R), v(line, GOAL_H, GOAL_HALF + R), R, white);
  const backX = line + end * GOAL_DEPTH;
  const r = 0.03;
  for (const side of [-1, 1]) {
    addBar(v(line, GOAL_H, side * GOAL_HALF), v(backX, 1.15, side * GOAL_HALF), r, steel);
    addBar(v(backX, 1.15, side * GOAL_HALF), v(backX, 0, side * GOAL_HALF), r, steel);
    addBar(v(line, 0, side * GOAL_HALF), v(backX, 0, side * GOAL_HALF), r, steel);
  }
  addBar(v(backX, 1.15, -GOAL_HALF), v(backX, 1.15, GOAL_HALF), r, steel);

  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.82 });
  const part = (w: number, h: number, repeatX: number, repeatY: number) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
    return new THREE.Mesh(g, netMat);
  };
  const back = part(GOAL_HALF * 2, 1.15, 20, 3);
  back.rotation.y = Math.PI / 2;
  back.position.set(backX, 0.575, 0);
  group.add(back);
  // Le toit du filet descend de la barre vers l'arrière
  const roofL = Math.hypot(GOAL_DEPTH, GOAL_H - 1.15);
  const roof = part(roofL, GOAL_HALF * 2, 6, 20);
  roof.rotation.x = -Math.PI / 2;
  roof.rotation.y = end * Math.atan2(GOAL_H - 1.15, GOAL_DEPTH);
  roof.rotation.order = "YXZ";
  roof.position.set(line + (end * GOAL_DEPTH) / 2, (GOAL_H + 1.15) / 2, 0);
  group.add(roof);
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(end * GOAL_DEPTH, 0);
    shape.lineTo(end * GOAL_DEPTH, 1.15);
    shape.lineTo(0, GOAL_H);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) * 2.6;
      uv[i * 2 + 1] = pos.getY(i) * 2.6;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const s = new THREE.Mesh(g, netMat);
    s.position.set(line, 0, side * GOAL_HALF);
    group.add(s);
  }
  return { group, back, backX, end };
}

export interface StandColors {
  home: string[];
  away: string[];
}

interface StandBuild {
  group: THREE.Group;
  seats: Seat[];
  frontY: number;
}

/** Une tribune en deux étages, vue d'en face : l'axe z local regarde le terrain */
function buildStand(
  length: number,
  low: boolean,
  theme: Theme,
  led: THREE.Texture,
  pickColor: (u: number) => THREE.Color,
  banner: THREE.Texture,
): StandBuild {
  const group = new THREE.Group();
  const lowerRows = low ? 9 : 15;
  const upperRows = low ? 0 : 14;
  const spacing = low ? 1.3 : 0.78;
  const seats: Seat[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const baseY = 1.9;
  for (let i = 0; i < lowerRows; i++) {
    const y = baseY + i * ROW_H;
    geos.push(box(length, y, ROW_D + 0.02, 0, y / 2, -i * ROW_D));
    for (let x = -length / 2 + 0.5; x < length / 2; x += spacing) {
      if (Math.random() < 0.05) continue;
      seats.push({ x: x + Math.random() * 0.14, y, z: -i * ROW_D - 0.06, color: pickColor((x + length / 2) / length) });
    }
  }
  const topLower = baseY + lowerRows * ROW_H;
  const backLower = -lowerRows * ROW_D;
  const upperStartY = topLower + 3.3;
  const upperStartZ = backLower - 0.6;
  for (let j = 0; j < upperRows; j++) {
    const y = upperStartY + j * ROW_H * 1.12;
    const z = upperStartZ - j * ROW_D;
    geos.push(box(length, 1.4, ROW_D + 0.02, 0, y - 0.7, z));
    for (let x = -length / 2 + 0.5; x < length / 2; x += spacing) {
      if (Math.random() < 0.07) continue;
      seats.push({ x: x + Math.random() * 0.14, y, z: z - 0.06, color: pickColor((x + length / 2) / length) });
    }
  }
  const topY = upperRows ? upperStartY + upperRows * ROW_H * 1.12 : topLower;
  const backZ = upperRows ? upperStartZ - upperRows * ROW_D : backLower;
  // Le mur du fond, qui ferme la tribune
  geos.push(box(length + 4, topY + 8, 1, 0, (topY + 8) / 2, backZ - 0.6));
  const concrete = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color: theme.concrete }));
  group.add(concrete);

  // Les banderoles qui habillent le bas de la tribune
  const flagsDown = new THREE.Mesh(new THREE.PlaneGeometry(length, 1.7), new THREE.MeshBasicMaterial({ map: banner, color: "#b4b4b4" }));
  flagsDown.position.set(0, 0.95, ROW_D / 2 + 0.03);
  group.add(flagsDown);

  if (upperRows) {
    // Le bandeau lumineux entre les deux étages
    const band = new THREE.Mesh(new THREE.BoxGeometry(length, 2.1, 0.3), new THREE.MeshBasicMaterial({ map: led }));
    band.position.set(0, topLower + 1.5, backLower + 0.2);
    group.add(band);
  }

  // Le toit, porté par des poteaux, avec sa rampe de lumière
  const roofDepth = -backZ + (upperRows ? 3 : 6);
  const roofMat = new THREE.MeshLambertMaterial({ color: theme.roof });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 6, 0.7, roofDepth), roofMat);
  roof.position.set(0, topY + 8.2, backZ + roofDepth / 2 - 0.6);
  roof.rotation.x = -0.06;
  group.add(roof);
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.22, 0.6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff6d8").multiplyScalar(0.4 + theme.glow * 1.1) }),
  );
  strip.position.set(0, topY + 7.55, backZ + roofDepth * 0.72);
  group.add(strip);
  const columns: THREE.BufferGeometry[] = [];
  for (let x = -length / 2 + 6; x < length / 2; x += 18) columns.push(box(0.5, topY + 8, 0.5, x, (topY + 8) / 2, backZ + 0.2));
  const colMesh = new THREE.Mesh(mergeGeometries(columns), roofMat);
  group.add(colMesh);
  for (const g of geos) g.dispose();
  for (const g of columns) g.dispose();
  return { group, seats, frontY: baseY };
}

export interface ScoreboardData {
  left: string;
  right: string;
  score: [number, number];
}

export interface Stadium {
  /** À appeler à chaque image : le public s'agite d'autant plus que `excitement` (de 0 à 1) est grand */
  update(t: number, excitement: number, dt: number): void;
  /** La tribune du premier plan gênerait la caméra de télévision : on la montre seulement quand la vue passe dans l'axe */
  showNearStand(on: boolean): void;
  /** Le filet qui tremble quand le ballon y entre */
  shakeNet(end: number): void;
  setScoreboard(data: ScoreboardData): void;
  dispose(): void;
}

/** Construit le stade dans `scene` et rend la poignée qui permet de l'animer */
export function buildStadium(
  scene: THREE.Scene,
  ambience: Ambience,
  low: boolean,
  colors: StandColors,
  shadows: boolean,
  weather: Weather = "clair",
): Stadium {
  const theme = themeFor(ambience, weather);
  const root = new THREE.Group();
  scene.add(root);
  scene.fog = weather === "clair" ? new THREE.Fog(theme.haze, 220, 620) : new THREE.Fog(theme.haze, 70, 380);

  // Le ciel : un dôme dégradé
  const skyGeo = new THREE.SphereGeometry(700, 24, 14);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(theme.skyTop) }, bottom: { value: new THREE.Color(theme.skyBottom) } },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader:
      "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 1.8 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);\n#include <colorspace_fragment>\n}",
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  root.add(sky);

  const grass = buildGrass(theme.grass, shadows, weather);
  root.add(grass.mesh);

  // Sous les tribunes et tout autour : le sol, pour que la caméra ne voie jamais le vide
  const under = new THREE.Mesh(new THREE.PlaneGeometry(1200, 900), new THREE.MeshLambertMaterial({ color: theme.grass.outside }));
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.05;
  root.add(under);

  const netTex = netTexture();
  const goals = [buildGoal(1, netTex, shadows), buildGoal(-1, netTex, shadows)];
  for (const g of goals) root.add(g.group);

  // Les supporters : chaque côté a ses couleurs
  const homeColors = colors.home.map((c) => new THREE.Color(c));
  const awayColors = colors.away.map((c) => new THREE.Color(c));
  const neutral = ["#d8d4c8", "#6d7f9c", "#a8886a", "#8d9aa8", "#c9b58d"].map((c) => new THREE.Color(c));
  const pick = (list: THREE.Color[]) => list[Math.floor(Math.random() * list.length)]!.clone().multiplyScalar(0.72 + Math.random() * 0.34);
  const mixed = (home: number, away: number) => () => {
    const r = Math.random();
    return pick(r < home ? homeColors : r < home + away ? awayColors : neutral);
  };

  const banner = bannerTexture([colors.home[0]!, colors.away[0]!]);
  banner.repeat.set(6, 1);
  const led = ledTexture([colors.home[0]!, colors.away[0]!]);
  led.repeat.set(5, 1);
  const crowds: Crowd[] = [];
  const front = HALF_W + MARGIN + 3;
  const side = HALF_L + MARGIN + 3;
  const longLength = HALF_L * 2 + 44;
  const endLength = HALF_W * 2 + 44;
  const place = (build: StandBuild, x: number, z: number, ry: number): Crowd => {
    build.group.position.set(x, 0, z);
    build.group.rotation.y = ry;
    root.add(build.group);
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const world = build.seats.map((p) => ({ ...p, x: x + p.x * c + p.z * s, z: z - p.x * s + p.z * c }));
    const crowd = new Crowd(world);
    root.add(crowd.mesh);
    crowds.push(crowd);
    return crowd;
  };
  const far = buildStand(longLength, low, theme, led, () => mixed(0.42, 0.26)(), banner);
  place(far, 0, -front, 0);
  const near = buildStand(longLength, low, theme, led, () => mixed(0.42, 0.26)(), banner);
  const nearCrowd = place(near, 0, front, Math.PI);
  const west = buildStand(endLength, low, theme, led, () => mixed(0.9, 0.02)(), banner);
  place(west, -side, 0, Math.PI / 2);
  const east = buildStand(endLength, low, theme, led, () => mixed(0.02, 0.9)(), banner);
  place(east, side, 0, -Math.PI / 2);

  // Les angles, fermés par des blocs : la tribune fait tout le tour
  const cornerMat = new THREE.MeshLambertMaterial({ color: theme.concrete });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(26, 26, 26), cornerMat);
      m.position.set(sx * (side + 13), 13, sz * (front + 13));
      root.add(m);
    }
  }

  // Le tour du terrain, en panneaux lumineux
  const adMat = new THREE.MeshBasicMaterial({ map: led });
  const boardGeo: THREE.BufferGeometry[] = [];
  const longBoard = HALF_L * 2 + 8;
  boardGeo.push(box(longBoard, 1.1, 0.25, 0, 0.55, -(HALF_W + 4.5)));
  boardGeo.push(box(longBoard, 1.1, 0.25, 0, 0.55, HALF_W + 4.5));
  const boards = new THREE.Mesh(mergeGeometries(boardGeo), adMat);
  root.add(boards);
  for (const g of boardGeo) g.dispose();
  for (const sz of [-1, 1]) {
    for (const end of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(HALF_W - 6, 1.1, 0.25), adMat);
      m.position.set(end * (HALF_L + 5), 0.55, sz * (HALF_W / 2 + 6));
      m.rotation.y = (end * Math.PI) / 2;
      root.add(m);
    }
  }

  // Les bancs de touche
  const benchMat = new THREE.MeshLambertMaterial({ color: "#22303f" });
  const benchGlass = new THREE.MeshLambertMaterial({ color: "#7fb2d6", transparent: true, opacity: 0.55 });
  for (const x of [-11, 11]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 1), benchMat);
    b.position.set(x, 0.25, -(HALF_W + 2.6));
    root.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.08, 1.5), benchGlass);
    top.position.set(x, 2, -(HALF_W + 2.6));
    root.add(top);
    const backB = new THREE.Mesh(new THREE.BoxGeometry(8.3, 2, 0.08), benchGlass);
    backB.position.set(x, 1, -(HALF_W + 3.3));
    root.add(backB);
  }

  // Les poteaux de corner
  const flagMat = new THREE.MeshBasicMaterial({ color: "#f8d33c", side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: "#f4f4ee", roughness: 0.5 });
  const flags: THREE.Mesh[] = [];
  for (const x of [-HALF_L, HALF_L]) {
    for (const z of [-HALF_W, HALF_W]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8), poleMat);
      pole.position.set(x, 0.85, z);
      pole.castShadow = shadows;
      root.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), flagMat);
      flag.position.set(x + 0.3, 1.5, z);
      root.add(flag);
      flags.push(flag);
    }
  }

  // Les pylônes d'éclairage, derrière les coins
  const mast = new THREE.MeshLambertMaterial({ color: "#6b7388" });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff8df").multiplyScalar(ambience === "jour" ? 0.75 : 1.25) });
  const glowTex = (() => {
    const [c, g] = canvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,250,230,1)");
    grad.addColorStop(0.3, "rgba(255,244,210,0.45)");
    grad.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return texture(c);
  })();
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const px = x * (side + 18);
      const pz = z * (front + 18);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 62, 8), mast);
      m.position.set(px, 31, pz);
      root.add(m);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 0.8), lamp);
      panel.position.set(px, 63, pz);
      panel.lookAt(0, 0, 0);
      root.add(panel);
      if (theme.glow > 0) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            color: "#fff4d6",
            transparent: true,
            opacity: theme.glow * 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
          }),
        );
        sprite.scale.setScalar(46);
        sprite.position.set(px, 63, pz);
        root.add(sprite);
      }
    }
  }

  // Les nuages, ou les étoiles
  const cloudTex = (() => {
    const [c, g] = canvas(256, 128);
    for (let i = 0; i < 26; i++) {
      const x = 40 + Math.random() * 176;
      const y = 44 + Math.random() * 44;
      const r = 14 + Math.random() * 28;
      const grad = g.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, "rgba(255,255,255,0.5)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return texture(c);
  })();
  const clouds: THREE.Sprite[] = [];
  if (ambience !== "nuit") {
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: cloudTex,
          color: ambience === "soir" ? "#ffd9bd" : "#ffffff",
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
          fog: false,
        }),
      );
      s.scale.set(190 + Math.random() * 160, 70 + Math.random() * 40, 1);
      s.position.set(Math.cos(a) * 480, 120 + Math.random() * 90, Math.sin(a) * 480);
      root.add(s);
      clouds.push(s);
    }
  } else {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = 0.12 + Math.random() * 0.85;
      const r = Math.sqrt(1 - h * h) * 620;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = h * 620;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    root.add(new THREE.Points(g, new THREE.PointsMaterial({ color: "#dfe7ff", size: 1.6, sizeAttenuation: false, fog: false })));
  }

  // Les écrans géants, au-dessus de chaque virage
  const [screenCanvas, sg] = canvas(512, 256);
  const screenTex = texture(screenCanvas);
  const drawScreen = (d: ScoreboardData) => {
    sg.fillStyle = "#07120d";
    sg.fillRect(0, 0, 512, 256);
    sg.fillStyle = "#f4c64e";
    sg.font = "900 44px 'Arial Black', Arial, sans-serif";
    sg.textAlign = "center";
    sg.textBaseline = "middle";
    sg.fillText(d.left, 128, 70);
    sg.fillText(d.right, 384, 70);
    sg.fillStyle = "#ffffff";
    sg.font = "900 110px 'Arial Black', Arial, sans-serif";
    sg.fillText(`${d.score[0]} - ${d.score[1]}`, 256, 170);
    screenTex.needsUpdate = true;
  };
  drawScreen({ left: "", right: "", score: [0, 0] });
  const frameMat = new THREE.MeshLambertMaterial({ color: "#20252f" });
  for (const end of [-1, 1]) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(34, 18, 1.4), frameMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(32, 16), new THREE.MeshBasicMaterial({ map: screenTex, fog: false }));
    screen.position.z = 0.75;
    g.add(frame, screen);
    g.position.set(end * (side + (low ? 16 : 34)), low ? 22 : 45, end * 0);
    g.rotation.y = -end * (Math.PI / 2);
    root.add(g);
  }

  let shake = [0, 0];
  let adScroll = 0;
  const backBase = goals.map((g) => g.back.position.x);
  return {
    update(t, excitement, dt) {
      for (const c of crowds) c.update(t, excitement);
      adScroll += dt * 0.015;
      led.offset.x = adScroll;
      for (let i = 0; i < flags.length; i++) flags[i]!.rotation.y = Math.sin(t * 3 + i) * 0.25;
      for (let k = 0; k < goals.length; k++) {
        const g = goals[k]!;
        if (shake[k]! > 0.001) {
          shake[k] = shake[k]! * Math.exp(-dt * 3.2);
          g.back.position.x = backBase[k]! + g.end * Math.sin(t * 30) * shake[k]! * 0.28;
        } else g.back.position.x = backBase[k]!;
      }
    },
    showNearStand(on) {
      near.group.visible = on;
      nearCrowd.mesh.visible = on;
    },
    shakeNet(end) {
      shake = end > 0 ? [1, shake[1]!] : [shake[0]!, 1];
    },
    setScoreboard: drawScreen,
    dispose() {
      for (const c of crowds) c.dispose();
      grass.dispose();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !(m instanceof THREE.InstancedMesh)) m.geometry.dispose();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose?.();
      });
      for (const t of [netTex, led, banner, glowTex, cloudTex, screenTex]) t.dispose();
      root.removeFromParent();
    },
  };
}
