// La piste en 3D : l'élan, la piste vernie (et le reflet des quilles dans le vernis), le plateau, les repères peints,
// les rigoles, les séparations, les murs de côté, la fosse et son rideau, le cadre au-dessus des quilles et la lumière
// qui les éclaire. La salle choisit les couleurs ; les pistes voisines sont les mêmes, sans reflet.

import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import {
  APPROACH,
  CUSHION,
  DECK_END,
  GUTTER_OUTER,
  GUTTER_R,
  GUTTER_XC,
  GUTTER_YC,
  HEAD_PIN,
  KICKBACK_FROM,
  LANE_HALF,
  OIL_END,
  PIT_DEPTH,
  RACK,
  WALL_HIGH,
  WALL_LOW,
} from "../../../shared/games/bowling/lane.ts";
import { approachMarks, laneMarks, laneWood } from "./textures.ts";

/** Ce que la salle décide de la piste */
export interface LaneStyle {
  /** La rigole (métal, plastique) */
  gutter: THREE.ColorRepresentation;
  gutterMetal: number;
  /** La séparation entre deux pistes, et les murs de côté du plateau */
  capping: THREE.Material;
  kickback: THREE.Material;
  /** Le cadre au-dessus des quilles (son dessin) */
  masking: THREE.Material;
  /** La lumière qui tombe sur les quilles */
  deckLight: THREE.ColorRepresentation;
  deckLightPower: number;
  /** La teinte et la force du reflet dans le vernis */
  reflect: number;
  /** La teinte du bois (blanc : tel quel) */
  wood: THREE.ColorRepresentation;
}

/** La distance entre deux pistes voisines (d'un axe à l'autre) */
export const LANE_PITCH = 2 * GUTTER_OUTER + 0.2;
const DECK_START = HEAD_PIN - 0.62;

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Le creux d'une rigole, d'un bout à l'autre */
function gutterGeometry(side: number): THREE.BufferGeometry {
  const half = Math.asin((GUTTER_OUTER - LANE_HALF) / 2 / GUTTER_R);
  const shape: THREE.Vector2[] = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const a = -half + (2 * half * i) / N;
    shape.push(new THREE.Vector2(side * GUTTER_XC + Math.sin(a) * GUTTER_R, GUTTER_YC - Math.cos(a) * GUTTER_R));
  }
  const pos: number[] = [];
  const idx: number[] = [];
  const zs = [0.02, -DECK_END];
  for (const z of zs) for (const p of shape) pos.push(p.x, p.y, z);
  for (let i = 0; i < N; i++) {
    const a = i,
      b = i + 1,
      c = N + 1 + i,
      d = N + 2 + i;
    if (side > 0) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** La séparation entre deux pistes : une barre arrondie posée entre les rigoles */
function cappingGeometry(length: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const w = 0.1,
    h = WALL_LOW,
    r = 0.025;
  s.moveTo(-w, -0.06);
  s.lineTo(-w, h - r);
  s.quadraticCurveTo(-w, h, -w + r, h);
  s.lineTo(w - r, h);
  s.quadraticCurveTo(w, h, w, h - r);
  s.lineTo(w, -0.06);
  s.lineTo(-w, -0.06);
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -length);
  return g;
}

export interface LaneMeshes {
  group: THREE.Group;
  reflector: Reflector | null;
  /** Le balai de la machine (il descend devant les quilles et pousse les quilles couchées dans la fosse) */
  sweep: THREE.Group;
  /** La table de la machine (elle descend reposer les quilles) */
  table: THREE.Group;
  dispose: () => void;
}

/** Une piste entière, posée en `x` (0 : la sienne) ; `main` : celle où l'on joue (reflet, machine) */
export function buildLane(style: LaneStyle, x = 0, main = true, reflectSize = 512): LaneMeshes {
  const group = new THREE.Group();
  group.position.x = x;
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(t: T) => (disposables.push(t), t);

  const woodLane = keep(laneWood("lane", 7));
  woodLane.repeat.set(1, (DECK_START + 0.02) / 4);
  const woodDeck = keep(laneWood("deck", 19));
  woodDeck.repeat.set(1, (DECK_END - DECK_START) / 4);
  const woodApproach = keep(laneWood("approach", 31));
  woodApproach.repeat.set(1.45, APPROACH / 4);

  // La piste : un vernis épais (le reflet net vient du miroir posé dessus)
  const laneMat = keep(
    new THREE.MeshPhysicalMaterial({ map: woodLane, color: style.wood, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.08 }),
  );
  const lane = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * LANE_HALF, DECK_START)), laneMat);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0, -DECK_START / 2);
  lane.receiveShadow = true;
  group.add(lane);
  const deckMat = keep(
    new THREE.MeshPhysicalMaterial({ map: woodDeck, color: style.wood, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
  );
  const deck = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * LANE_HALF, DECK_END - DECK_START)), deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0, -(DECK_START + DECK_END) / 2);
  deck.receiveShadow = true;
  group.add(deck);
  // L'élan, plus large, un peu moins brillant
  const approachMat = keep(
    new THREE.MeshPhysicalMaterial({ map: woodApproach, color: style.wood, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  );
  const approach = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * GUTTER_OUTER + 0.2, APPROACH)), approachMat);
  approach.rotation.x = -Math.PI / 2;
  approach.position.set(0, 0, APPROACH / 2 + 0.02);
  approach.receiveShadow = true;
  group.add(approach);

  // Les repères peints
  const marks = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(2 * LANE_HALF, DECK_END)),
    keep(
      new THREE.MeshStandardMaterial({
        map: keep(laneMarks(DECK_END, RACK)),
        transparent: true,
        roughness: 0.4,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    ),
  );
  marks.rotation.x = -Math.PI / 2;
  marks.position.set(0, 0.0002, -DECK_END / 2);
  marks.receiveShadow = true;
  group.add(marks);
  const amarks = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(2 * LANE_HALF, APPROACH)),
    keep(
      new THREE.MeshStandardMaterial({
        map: keep(approachMarks(APPROACH)),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    ),
  );
  amarks.rotation.x = -Math.PI / 2;
  amarks.position.set(0, 0.0002, APPROACH / 2);
  group.add(amarks);

  // Les rigoles
  const gutterMat = keep(
    new THREE.MeshPhysicalMaterial({
      color: style.gutter,
      metalness: style.gutterMetal,
      roughness: 0.28,
      clearcoat: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  for (const side of [-1, 1]) {
    const g = new THREE.Mesh(keep(gutterGeometry(side)), gutterMat);
    g.receiveShadow = true;
    group.add(g);
  }
  // Les séparations, de la ligne de faute au plateau
  const cap = keep(cappingGeometry(KICKBACK_FROM));
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(cap, style.capping);
    m.position.set(side * (GUTTER_OUTER + 0.1), 0, 0.02);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  // Les murs de côté du plateau
  for (const side of [-1, 1]) {
    const w = box(
      0.04,
      WALL_HIGH + 0.1,
      CUSHION - KICKBACK_FROM,
      style.kickback,
      side * (GUTTER_OUTER + 0.02),
      (WALL_HIGH + 0.1) / 2 - 0.1,
      -(KICKBACK_FROM + CUSHION) / 2,
    );
    w.receiveShadow = true;
    group.add(w);
  }

  // La fosse et le rideau noir du fond
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 1 }));
  const pit = box(2 * GUTTER_OUTER, 0.02, CUSHION - DECK_END + 0.1, dark, 0, -PIT_DEPTH - 0.01, -(DECK_END + CUSHION) / 2);
  group.add(pit);
  const curtainGeo = keep(new THREE.PlaneGeometry(2 * GUTTER_OUTER, 1.4, 40, 1));
  const cp = curtainGeo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 38) * 0.02);
  curtainGeo.computeVertexNormals();
  const curtain = new THREE.Mesh(curtainGeo, keep(new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.95 })));
  curtain.position.set(0, 0.35, -CUSHION - 0.02);
  group.add(curtain);
  // La face avant de la fosse, sous le bord du plateau
  const lip = box(2 * GUTTER_OUTER, PIT_DEPTH, 0.03, dark, 0, -PIT_DEPTH / 2, -DECK_END - 0.015);
  group.add(lip);

  // Le cadre au-dessus des quilles, et la boîte noire de la machine derrière
  const maskW = LANE_PITCH;
  const masking = box(maskW, 0.62, 0.05, style.masking, 0, CEIL_Y + 0.31, -DECK_START + 0.25);
  group.add(masking);
  const machine = keep(new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 }));
  group.add(box(maskW, 0.03, CUSHION - DECK_START + 0.3, machine, 0, CEIL_Y + 0.02, -(DECK_START + CUSHION) / 2 - 0.1));
  // La rampe de lumière sous le cadre, qui éclaire les quilles
  const strip = box(
    2 * GUTTER_OUTER,
    0.03,
    0.06,
    keep(new THREE.MeshBasicMaterial({ color: style.deckLight })),
    0,
    CEIL_Y - 0.02,
    -DECK_START + 0.18,
  );
  group.add(strip);

  let reflector: Reflector | null = null;
  const sweep = new THREE.Group();
  const table = new THREE.Group();
  if (main) {
    const spot = new THREE.SpotLight(style.deckLight, style.deckLightPower, 4, 0.9, 0.6, 1.2);
    spot.position.set(0, CEIL_Y - 0.05, -DECK_START + 0.15);
    spot.target.position.set(0, 0, -(HEAD_PIN + 0.45));
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    spot.shadow.normalBias = 0.01;
    group.add(spot, spot.target);

    // Le reflet dans le vernis : un miroir transparent posé sur la piste, plus fort sur l'huile
    reflector = new Reflector(keep(new THREE.PlaneGeometry(2 * LANE_HALF, DECK_END + APPROACH * 0.4)), {
      textureWidth: reflectSize,
      textureHeight: reflectSize,
      clipBias: 0.002,
      shader: REFLECT_SHADER,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, 0.0006, -(DECK_END - APPROACH * 0.4) / 2);
    const rm = reflector.material as THREE.ShaderMaterial;
    rm.transparent = true;
    rm.depthWrite = false;
    rm.uniforms.uStrength = { value: style.reflect };
    reflector.renderOrder = 2;
    group.add(reflector);

    // Le balai : une barre et sa grille, qui descend devant les quilles
    const barMat = keep(new THREE.MeshStandardMaterial({ color: 0x2c2d33, metalness: 0.7, roughness: 0.35 }));
    const bar = box(2 * GUTTER_OUTER - 0.04, 0.05, 0.05, barMat, 0, 0.3, 0);
    const grille = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(2 * GUTTER_OUTER - 0.06, 0.26, 1, 1)),
      keep(
        new THREE.MeshStandardMaterial({
          color: 0x15161a,
          metalness: 0.5,
          roughness: 0.6,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        }),
      ),
    );
    grille.position.set(0, 0.15, 0);
    sweep.add(bar, grille);
    sweep.position.set(0, 0.9, -(HEAD_PIN - 0.3));
    sweep.visible = false;
    group.add(sweep);
    // La table : une plaque sombre qui descend au-dessus du plateau
    const plate = box(
      2 * LANE_HALF + 0.05,
      0.04,
      1.1,
      keep(new THREE.MeshStandardMaterial({ color: 0x1b1c20, metalness: 0.4, roughness: 0.5 })),
      0,
      0,
      0,
    );
    table.add(plate);
    table.position.set(0, 1.2, -(HEAD_PIN + 0.4));
    table.visible = false;
    group.add(table);
  }

  return {
    group,
    reflector,
    sweep,
    table,
    dispose: () => {
      for (const d of disposables) d.dispose();
      reflector?.dispose();
    },
  };
}

/** La hauteur du cadre au-dessus du plateau */
export const CEIL_Y = 0.9;

/** Le reflet : la scène vue dans le miroir, un peu floue, plus forte en rasant (Fresnel) et sur l'huile */
const REFLECT_SHADER = {
  name: "LaneReflection",
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uStrength: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec2 uv = vUv.xy / vUv.w;
      float s = 0.0025;
      vec3 c = texture2D(tDiffuse, uv).rgb * 0.4
        + texture2D(tDiffuse, uv + vec2(s, 0.0)).rgb * 0.15
        + texture2D(tDiffuse, uv - vec2(s, 0.0)).rgb * 0.15
        + texture2D(tDiffuse, uv + vec2(0.0, s * 1.6)).rgb * 0.15
        + texture2D(tDiffuse, uv - vec2(0.0, s * 1.6)).rgb * 0.15;
      vec3 v = normalize(cameraPosition - vWorld);
      float fres = 0.06 + 0.94 * pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
      // L'huile brille plus que le fond sec ; l'élan, à peine
      float d = -vWorld.z;
      float oil = d < 0.0 ? 0.35 : d < ${OIL_END.toFixed(1)} ? 1.0 : mix(1.0, 0.65, clamp((d - ${OIL_END.toFixed(1)}) / 2.0, 0.0, 1.0));
      // Pas de reflet au-delà du bord de la piste
      float edge = smoothstep(${LANE_HALF.toFixed(3)}, ${(LANE_HALF - 0.01).toFixed(3)}, abs(vWorld.x));
      // Les lampes se reflètent sans éblouir : le reflet ne dépasse pas le blanc
      c = min(c, vec3(1.0)) * 0.9;
      gl_FragColor = vec4(c, clamp(uStrength * fres * oil * edge, 0.0, 0.85));
    }`,
};
