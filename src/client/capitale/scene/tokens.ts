import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TOKENS, type TokenId } from "../../../shared/games/capitale/tokens.ts";
import { bake, mat } from "./buildings.ts";
import { mix } from "./textures.ts";

// Les pions des joueurs : de petites figurines de métal laqué, chacune sur son palet.
// Repère local : le sol au centre du palet (y = 0), l'avant vers +z. Environ 0,5 de haut, 0,22 de rayon au plus.

type Pt = readonly [number, number];

const BASE_R = 0.17;
const BASE_H = 0.03;

/** La laque à la couleur du joueur */
const paint = (color: string) => mat(color, { rough: 0.28, metal: 0.2 });
/** Le métal doré des détails */
const gold = () => mat("#d8b24a", { rough: 0.3, metal: 0.72 });
/** L'émail blanc */
const white = () => mat("#f3efe6", { rough: 0.3 });
/** Le gris sombre : pneus, vitres, hublot, tuyère */
const dark = () => mat("#2c3137", { rough: 0.3, metal: 0.4 });

// ---------------------------------------------------------------------------
// Les outils de modelage
// ---------------------------------------------------------------------------

/** Un solide de révolution : le profil va de l'axe en bas vers l'extérieur, puis remonte */
function lathe(pts: readonly Pt[], m: THREE.Material, seg = 24, y = 0): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.LatheGeometry(
      pts.map(([px, py]) => new THREE.Vector2(px, py + y)),
      seg,
    ),
    m,
  );
}

/** Un profil adouci (une spline qui passe par les points) */
function smooth(pts: readonly Pt[], n: number): Pt[] {
  const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return curve.getPoints(n).map((p) => [Math.max(0, p.x), p.y] as const);
}

/** Une boule (ou un ellipsoïde) */
function ball(r: number, m: THREE.Material, x: number, y: number, z: number, w = 12, h = 8): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Un anneau horizontal (un tore couché) */
function ring(r: number, tube: number, m: THREE.Material, y: number, seg = 36, radial = 5): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, radial, seg), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/** Une barre entre deux points */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 6): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), seg, 1), m);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/** Une plaque mince en triangle posée sur trois points (une voile, une flamme) ; le bord b→c peut se bomber */
function plate(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number, m: THREE.Material, roach = 0): THREE.Mesh {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const ex = ab.clone().normalize();
  const ez = new THREE.Vector3().crossVectors(ex, ac).normalize();
  const ey = new THREE.Vector3().crossVectors(ez, ex);
  const pb = new THREE.Vector2(ab.length(), 0);
  const pc = new THREE.Vector2(ac.dot(ex), ac.dot(ey));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(pb.x, pb.y);
  if (roach) {
    // Le bord bombé vers l'extérieur du triangle
    const mid = pb.clone().add(pc).multiplyScalar(0.5);
    const edge = pc.clone().sub(pb);
    const out = new THREE.Vector2(edge.y, -edge.x).normalize();
    if (out.dot(mid.clone().sub(pb.clone().add(pc).divideScalar(3))) < 0) out.negate();
    const ctrl = mid.addScaledVector(out, roach);
    shape.quadraticCurveTo(ctrl.x, ctrl.y, pc.x, pc.y);
  } else {
    shape.lineTo(pc.x, pc.y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(a));
  return new THREE.Mesh(geo, m);
}

/** Un profil extrudé aux arêtes arrondies, posé de chant : x du profil devient +z (l'avant), l'épaisseur va selon x */
function side(shape: THREE.Shape, width: number, bevel: number, m: THREE.Material): THREE.Mesh {
  const depth = width - 2 * bevel;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2);
  return new THREE.Mesh(geo, m);
}

/** Des normales lissées après déformation (les coutures recousues), et des uv vides pour la fusion */
function smoothNormals(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  const merged = mergeVertices(geo, 1e-5);
  merged.computeVertexNormals();
  merged.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(merged.getAttribute("position").count * 2), 2));
  return merged;
}

/** Déplace chaque sommet d'une géométrie */
function deform(geo: THREE.BufferGeometry, f: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    f(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  return geo;
}

/** Le palet : à la couleur du joueur, cerclé d'or */
function base(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(
    lathe(
      [
        [0, 0],
        [BASE_R - 0.008, 0],
        [BASE_R, 0.008],
        [BASE_R, BASE_H - 0.008],
        [BASE_R - 0.01, BASE_H],
        [0, BASE_H],
      ],
      paint(color),
      32,
    ),
  );
  g.add(ring(BASE_R + 0.001, 0.0055, gold(), BASE_H * 0.5, 32, 4));
  return g;
}

// ---------------------------------------------------------------------------
// Les dix pions
// ---------------------------------------------------------------------------

/** Le pion classique, verni, une collerette dorée sous la tête */
function pion(color: string): THREE.Group {
  const g = base(color);
  const m = paint(color);
  g.add(
    lathe(
      [
        [0, 0],
        [0.135, 0],
        [0.14, 0.02],
        [0.126, 0.042],
        [0.092, 0.066],
        [0.07, 0.12],
        [0.056, 0.24],
        [0, 0.24],
      ],
      m,
      28,
      BASE_H,
    ),
  );
  g.add(
    lathe(
      [
        [0, 0.232],
        [0.08, 0.234],
        [0.093, 0.247],
        [0.08, 0.262],
        [0, 0.264],
      ],
      gold(),
      28,
      BASE_H,
    ),
  );
  g.add(ball(0.1, m, 0, BASE_H + 0.36, 0, 22, 16));
  return g;
}

/** La voiture : une petite auto ronde d'autrefois, passages de roue, toit bombé, pare-chocs dorés */
function voiture(color: string): THREE.Group {
  const g = base(color);
  const body = paint(color);
  const car = new THREE.Group();
  const wr = 0.06;
  const wb = 0.1;
  const arch = 0.078;
  // La caisse vue de profil (x : la longueur, l'avant à droite)
  const s = new THREE.Shape();
  s.moveTo(-0.19, wr);
  s.absarc(-wb, wr, arch, Math.PI, 0, true);
  s.absarc(wb, wr, arch, Math.PI, 0, true);
  s.lineTo(0.19, wr);
  s.quadraticCurveTo(0.197, 0.155, 0.12, 0.17);
  s.lineTo(-0.12, 0.175);
  s.quadraticCurveTo(-0.197, 0.17, -0.19, wr);
  car.add(side(s, 0.15, 0.012, body));
  // L'habitacle vitré, puis le toit et le montant à la couleur de la caisse
  const c = new THREE.Shape();
  c.moveTo(-0.13, 0.165);
  c.lineTo(0.075, 0.165);
  c.quadraticCurveTo(0.045, 0.27, 0.0, 0.282);
  c.lineTo(-0.082, 0.282);
  c.quadraticCurveTo(-0.118, 0.276, -0.13, 0.165);
  car.add(side(c, 0.13, 0.01, dark()));
  const r = new THREE.Shape();
  r.moveTo(0.036, 0.252);
  r.quadraticCurveTo(0.024, 0.286, -0.004, 0.288);
  r.lineTo(-0.084, 0.288);
  r.quadraticCurveTo(-0.112, 0.284, -0.116, 0.252);
  r.closePath();
  car.add(side(r, 0.136, 0.012, body));
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.152, 0.09, 0.018), body);
  pillar.position.set(0, 0.215, -0.04);
  car.add(pillar);
  // Les roues : pneus sombres, enjoliveurs dorés
  for (const [x, z] of [
    [-0.07, -wb],
    [0.07, -wb],
    [-0.07, wb],
    [0.07, wb],
  ] as const) {
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, 0.036, 14), dark());
    tyre.rotation.z = Math.PI / 2;
    tyre.position.set(x, wr, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.04, 10), gold());
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, wr, z);
    car.add(tyre, hub);
  }
  // Les phares et les pare-chocs
  for (const x of [-0.052, 0.052]) car.add(ball(0.019, white(), x, 0.135, 0.19, 8, 6));
  for (const z of [-0.203, 0.203]) {
    const bumper = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.13, 2, 6), gold());
    bumper.rotation.z = Math.PI / 2;
    bumper.position.set(0, 0.078, z);
    car.add(bumper);
  }
  car.position.y = BASE_H;
  g.add(car);
  return g;
}

/** Le béret : porté de travers sur un buste de modiste en porcelaine */
function beret(color: string): THREE.Group {
  const g = base(color);
  const porcelain = white();
  // Les épaules (plus larges que profondes), le cou, la tête
  const shoulders = lathe(
    smooth(
      [
        [0.118, 0],
        [0.116, 0.03],
        [0.098, 0.066],
        [0.062, 0.094],
        [0.03, 0.108],
      ],
      10,
    ).concat([[0, 0.108]]),
    porcelain,
    24,
    BASE_H,
  );
  shoulders.scale.z = 0.6;
  g.add(shoulders);
  const headY = BASE_H + 0.235;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.037, 0.16, 12, 1, true), porcelain);
  neck.position.y = BASE_H + 0.17;
  g.add(neck);
  const head = ball(0.082, porcelain, 0, headY, 0.004, 18, 12);
  head.scale.set(1, 1.15, 1.03);
  g.add(head);
  const hat = new THREE.Group();
  // Le bandeau sombre, le drap qui retombe, la queue sur le dessus
  hat.add(
    lathe(
      [
        [0, 0],
        [0.081, 0],
        [0.083, 0.018],
        [0, 0.018],
      ],
      dark(),
      24,
    ),
  );
  hat.add(
    lathe(
      smooth(
        [
          [0.082, 0.012],
          [0.118, 0.014],
          [0.139, 0.028],
          [0.143, 0.045],
          [0.128, 0.062],
          [0.092, 0.077],
          [0.045, 0.085],
          [0, 0.087],
        ],
        14,
      ),
      paint(color),
      28,
    ),
  );
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.04, 8), paint(color));
  stalk.position.y = 0.1;
  stalk.rotation.z = 0.25;
  hat.add(stalk);
  hat.position.set(0.006, headY + 0.03, 0);
  hat.rotation.set(-0.1, 0, -0.3);
  g.add(hat);
  return g;
}

/** La coque du voilier : une demi-sphère étirée, l'étrave pincée, l'arrière coupé, le pont qui se relève vers l'avant */
function hullPoint(p: THREE.Vector3): void {
  let x = p.x * 0.1;
  let z = p.z * 0.19;
  const y = p.y * 0.075 + 0.022 * Math.max(0, p.z) ** 2 * (1 + p.y);
  if (z > 0) x *= 1 - 0.6 * (z / 0.19) ** 1.5;
  if (z < -0.13) z = -0.13 + (z + 0.13) * 0.2;
  p.set(x, y, z);
}

/** Le bateau : un voilier, voiles blanches en ciseaux, mât doré, flamme à la couleur du joueur */
function bateau(color: string): THREE.Group {
  const g = base(color);
  const deckY = BASE_H + 0.062;
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(
    smoothNormals(deform(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), hullPoint)),
    paint(color),
  );
  const deckGeo = deform(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), hullPoint);
  deckGeo.translate(0, -0.004, 0);
  deckGeo.computeVertexNormals();
  const deck = new THREE.Mesh(deckGeo, mat(mix(color, "#000000", 0.35), { rough: 0.45 }));
  // Le liston blanc tout autour du pont
  const rim: THREE.Vector3[] = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    hullPoint(v);
    rim.push(v);
  }
  const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 64, 0.006, 5, true), white());
  boat.add(hull, deck, rail);
  boat.position.y = deckY;
  g.add(boat);
  // Le gréement
  const zm = 0.035;
  const top = 0.53;
  const brass = gold();
  g.add(strut(new THREE.Vector3(0, deckY - 0.01, zm), new THREE.Vector3(0, top, zm), 0.008, brass, 8));
  const tack = new THREE.Vector3(0, deckY + 0.045, zm);
  const swing = 0.95;
  const clew = tack.clone().add(new THREE.Vector3(-Math.sin(swing), 0, -Math.cos(swing)).multiplyScalar(0.17));
  g.add(strut(tack, clew, 0.006, brass, 6));
  const sail = white();
  g.add(plate(tack, new THREE.Vector3(0, top - 0.035, zm), clew, 0.006, sail, 0.025));
  g.add(
    plate(
      new THREE.Vector3(0, deckY + 0.04, 0.17),
      new THREE.Vector3(0, top - 0.07, zm + 0.008),
      new THREE.Vector3(0.105, deckY + 0.075, zm + 0.075),
      0.006,
      sail,
      0.02,
    ),
  );
  g.add(
    plate(
      new THREE.Vector3(0, top, zm),
      new THREE.Vector3(0, top - 0.03, zm),
      new THREE.Vector3(0.012, top - 0.012, zm - 0.075),
      0.006,
      paint(color),
    ),
  );
  return g;
}

/** Le croissant : un boudin doré en arc, gonflé de rouleaux, les cornes effilées ; couché en arrière sur le palet */
function croissant(color: string): THREE.Group {
  const g = base(color);
  const golden = mat("#dda04f", { rough: 0.38, metal: 0.1 });
  const crust = mat("#b2672b", { rough: 0.38, metal: 0.1 });
  // L'âme du croissant : un arc dont les cornes se recourbent vers l'intérieur
  const span = 1.9;
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 16; k++) {
    const u = (k / 16) * 2 - 1;
    const rr = 0.15 * (1 - 0.25 * u ** 4);
    pts.push(new THREE.Vector3(rr * Math.sin(u * span), rr * Math.cos(u * span), 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubular = 56;
  const radial = 10;
  const rolls = 5;
  const tube = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  // Le boudin : ventru au milieu, presque rien aux pointes, un bourrelet par rouleau, un peu aplati
  const pos = tube.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const u = t * 2 - 1;
    const center = curve.getPointAt(t);
    const r = 0.084 * (1 - u * u) ** 0.55 * (1 + 0.16 * Math.cos(Math.PI * rolls * u)) + 0.003;
    for (let j = 0; j <= radial; j++) {
      const n = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, n).sub(center).multiplyScalar(r);
      pos.setXYZ(n, center.x + v.x, center.y + v.y, center.z + v.z * 0.85);
    }
  }
  // Le dessus des rouleaux plus cuit que les creux
  tube.clearGroups();
  for (let i = 0; i < tubular; i++) {
    const u = ((i + 0.5) / tubular) * 2 - 1;
    tube.addGroup(i * radial * 6, radial * 6, Math.cos(Math.PI * rolls * u) > -0.15 ? 1 : 0);
  }
  const c = new THREE.Mesh(smoothNormals(tube), [golden, crust]);
  c.rotation.x = -1.0;
  c.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(c);
  c.position.y = BASE_H - box.min.y - 0.006;
  c.position.z = -(box.min.z + box.max.z) / 2;
  g.add(c);
  return g;
}

/** La fusée : un corps fuselé, trois ailerons, la pointe blanche, un hublot cerclé d'or */
function fusee(color: string): THREE.Group {
  const g = base(color);
  const m = paint(color);
  const y0 = BASE_H + 0.045;
  const cut = 0.32;
  const body: Pt[] = [
    [0, 0],
    ...smooth(
      [
        [0.05, 0],
        [0.066, 0.03],
        [0.077, 0.1],
        [0.079, 0.18],
        [0.074, 0.26],
        [0.063, cut],
      ],
      10,
    ),
    [0, cut],
  ];
  g.add(lathe(body, m, 20, y0));
  const nose: Pt[] = [
    [0, cut - 0.005],
    ...smooth(
      [
        [0.064, cut - 0.005],
        [0.052, cut + 0.04],
        [0.033, cut + 0.08],
        [0.013, cut + 0.112],
        [0, cut + 0.12],
      ],
      8,
    ),
  ];
  g.add(lathe(nose, white(), 20, y0));
  g.add(ring(0.064, 0.0055, gold(), y0 + cut - 0.004, 28, 4));
  // Le hublot
  const port = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0068, 5, 16), gold());
  port.position.set(0, y0 + 0.2, 0.077);
  const glass = ball(0.026, dark(), 0, y0 + 0.2, 0.073, 10, 6);
  glass.scale.z = 0.45;
  g.add(port, glass);
  // La tuyère
  g.add(
    lathe(
      [
        [0, 0],
        [0.046, 0],
        [0.042, 0.014],
        [0.03, 0.034],
        [0.036, 0.055],
        [0, 0.055],
      ],
      dark(),
      14,
      BASE_H,
    ),
  );
  // Les ailerons, un derrière et deux vers l'avant
  const fin = new THREE.Shape();
  fin.moveTo(0.05, 0.215);
  fin.quadraticCurveTo(0.128, 0.16, 0.142, 0.0);
  fin.lineTo(0.104, 0.0);
  fin.quadraticCurveTo(0.094, 0.06, 0.055, 0.08);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 1,
    curveSegments: 5,
  });
  finGeo.translate(0, BASE_H, -0.006);
  for (const a of [Math.PI / 2, -Math.PI / 6, (-5 * Math.PI) / 6]) {
    const f = new THREE.Mesh(finGeo, m);
    f.rotation.y = a;
    g.add(f);
  }
  return g;
}

/** La montgolfière : l'enveloppe en fuseaux de couleur et blancs, la nacelle d'osier pendue à ses cordes */
function montgolfiere(color: string): THREE.Group {
  const g = base(color);
  const yb = BASE_H + 0.15;
  const prof = smooth(
    [
      [0.04, 0],
      [0.05, 0.03],
      [0.08, 0.07],
      [0.118, 0.12],
      [0.143, 0.17],
      [0.15, 0.215],
      [0.142, 0.262],
      [0.115, 0.3],
      [0.07, 0.328],
      [0, 0.338],
    ],
    24,
  ).map(([x, y]) => new THREE.Vector2(x, y + yb));
  const gores = 10;
  for (let k = 0; k < gores; k++) {
    const geo = new THREE.LatheGeometry(prof, 3, (k * Math.PI * 2) / gores, (Math.PI * 2) / gores);
    g.add(new THREE.Mesh(geo, k % 2 ? white() : paint(color)));
  }
  g.add(ring(0.042, 0.007, gold(), yb + 0.004, 20, 5));
  // La nacelle et ses cordes
  const wicker = mat("#a8743f", { rough: 0.6 });
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.065, 8, 1), wicker);
  basket.rotation.y = Math.PI / 8;
  basket.position.y = BASE_H + 0.0325;
  g.add(basket);
  g.add(ring(0.05, 0.007, mat("#7a5230", { rough: 0.6 }), BASE_H + 0.065, 16, 4));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const [s, c] = [Math.sin(a), Math.cos(a)];
    g.add(
      strut(new THREE.Vector3(0.045 * s, BASE_H + 0.065, 0.045 * c), new THREE.Vector3(0.04 * s, yb + 0.005, 0.04 * c), 0.0035, dark(), 4),
    );
  }
  return g;
}

/** La tour : quatre pieds cambrés, les arches, deux plateformes dorées, une flèche en treillis */
function tour(color: string): THREE.Group {
  const g = base(color);
  const iron = paint(color);
  const brass = gold();
  const y0 = BASE_H;
  const p1 = y0 + 0.15;
  const p2 = y0 + 0.315;
  const top = y0 + 0.475;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const corners = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const;
  // Les pieds, cambrés comme il faut
  for (const [sx, sz] of corners) {
    const curve = new THREE.QuadraticBezierCurve3(
      V(0.104 * sx, y0, 0.104 * sz),
      V(0.074 * sx, y0 + 0.045, 0.074 * sz),
      V(0.06 * sx, p1, 0.06 * sz),
    );
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.017, 4), iron));
    g.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.038), iron)
        .translateX(0.104 * sx)
        .translateY(y0 + 0.007)
        .translateZ(0.104 * sz),
    );
  }
  // Les grandes arches entre les pieds
  for (let k = 0; k < 4; k++) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.0075, 4, 12, Math.PI), iron);
    const a = (k * Math.PI) / 2;
    arch.position.set(Math.sin(a) * 0.088, y0 + 0.028, Math.cos(a) * 0.088);
    arch.rotation.y = a;
    g.add(arch);
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, 0.17), brass).translateY(p1 + 0.01));
  /** Un étage en treillis : quatre montants qui se resserrent, des croix sur chaque face */
  const section = (ya: number, ha: number, yb: number, hb: number, r: number, levels: number) => {
    const at = (k: number, sx: number, sz: number) => {
      const t = k / levels;
      const h = ha + (hb - ha) * t;
      return V(h * sx, ya + (yb - ya) * t, h * sz);
    };
    for (const [sx, sz] of corners) g.add(strut(at(0, sx, sz), at(levels, sx, sz), r, iron, 4));
    for (let f = 0; f < 4; f++) {
      const [ax, az] = corners[f]!;
      const [bx, bz] = corners[(f + 1) % 4]!;
      for (let k = 0; k < levels; k++) {
        g.add(strut(at(k, ax, az), at(k + 1, bx, bz), r * 0.45, iron, 4));
        g.add(strut(at(k, bx, bz), at(k + 1, ax, az), r * 0.45, iron, 4));
      }
    }
  };
  section(p1 + 0.02, 0.05, p2, 0.028, 0.011, 2);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.08), brass).translateY(p2 + 0.007));
  section(p2 + 0.014, 0.024, top, 0.009, 0.008, 3);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.026, 0.032), brass).translateY(top + 0.013));
  g.add(strut(V(0, top + 0.02, 0), V(0, top + 0.1, 0), 0.0045, brass, 6));
  return g;
}

/** Le diamant : une pierre taillée à facettes, la pointe en bas dans un pied doré, tenue par quatre griffes */
function diamant(color: string): THREE.Group {
  const g = base(color);
  const brass = gold();
  const yg = BASE_H + 0.1;
  g.add(
    lathe(
      [
        [0, 0],
        [0.064, 0],
        [0.06, 0.013],
        [0.03, 0.036],
        [0.017, 0.07],
        [0.017, yg - BASE_H + 0.03],
        [0, yg - BASE_H + 0.03],
      ],
      brass,
      16,
      BASE_H,
    ),
  );
  // Le profil de la taille : culasse profonde, rondiste, couronne, table
  const prof: Pt[] = [
    [0, 0],
    [0.1, 0.118],
    [0.158, 0.212],
    [0.158, 0.226],
    [0.126, 0.264],
    [0.088, 0.292],
    [0, 0.292],
  ];
  const geo = new THREE.LatheGeometry(
    prof.map(([x, y]) => new THREE.Vector2(x, y)),
    8,
  );
  // Une rangée sur deux tournée d'un demi-pan : les pans se découpent en facettes triangulaires
  const twist = new Set([prof[1]![1], prof[4]![1]]);
  deform(geo, (v) => {
    if ([...twist].some((y) => Math.abs(v.y - y) < 1e-6)) v.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 8);
  });
  const gem = new THREE.Group();
  gem.add(new THREE.Mesh(geo, mat(color, { rough: 0.08, metal: 0.35, flat: true })));
  // Les griffes, le long de la culasse puis repliées sur la couronne
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const [s, c] = [Math.sin(a), Math.cos(a)];
    const girdle = new THREE.Vector3(0.163 * s, 0.219, 0.163 * c);
    const tip = new THREE.Vector3(0.137 * s, 0.258, 0.137 * c);
    gem.add(strut(new THREE.Vector3(0.012 * s, 0.012, 0.012 * c), girdle, 0.0062, brass, 5));
    gem.add(strut(girdle, tip, 0.0062, brass, 5));
    gem.add(ball(0.0085, brass, tip.x, tip.y, tip.z, 8, 6));
  }
  gem.position.y = yg;
  gem.rotation.x = -0.3;
  g.add(gem);
  return g;
}

/** Le bandeau d'une couronne : un anneau épais dont le bord haut monte en pointes */
function crownBand(R: number, thick: number, hb: number, hs: number, n: number): THREE.BufferGeometry {
  const cols = n * 6;
  const pos: number[] = [];
  const nor: number[] = [];
  const height = (a: number) => {
    const p = ((a / (Math.PI * 2)) * n) % 1;
    return hb + hs * (1 - Math.abs(2 * p - 1)) ** 1.8;
  };
  const tri = (p: THREE.Vector3[], ns: THREE.Vector3[]) => {
    // Le bon sens de rotation, d'après la normale voulue
    const face = new THREE.Vector3().subVectors(p[1]!, p[0]!).cross(new THREE.Vector3().subVectors(p[2]!, p[0]!));
    const avg = ns[0]!.clone().add(ns[1]!).add(ns[2]!);
    const order = face.dot(avg) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const i of order) {
      pos.push(p[i]!.x, p[i]!.y, p[i]!.z);
      nor.push(ns[i]!.x, ns[i]!.y, ns[i]!.z);
    }
  };
  const quad = (p: THREE.Vector3[], ns: THREE.Vector3[]) => {
    tri([p[0]!, p[1]!, p[2]!], [ns[0]!, ns[1]!, ns[2]!]);
    tri([p[0]!, p[2]!, p[3]!], [ns[0]!, ns[2]!, ns[3]!]);
  };
  const down = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < cols; i++) {
    const a0 = (i / cols) * Math.PI * 2;
    const a1 = ((i + 1) / cols) * Math.PI * 2;
    const r0 = new THREE.Vector3(Math.sin(a0), 0, Math.cos(a0));
    const r1 = new THREE.Vector3(Math.sin(a1), 0, Math.cos(a1));
    const h0 = height(a0);
    const h1 = i === cols - 1 ? height(0) : height(a1);
    const ri = R - thick;
    const o0 = r0.clone().multiplyScalar(R);
    const o1 = r1.clone().multiplyScalar(R);
    const i0 = r0.clone().multiplyScalar(ri);
    const i1 = r1.clone().multiplyScalar(ri);
    const lift = (v: THREE.Vector3, h: number) => v.clone().setY(h);
    quad([o0, o1, lift(o1, h1), lift(o0, h0)], [r0, r1, r1, r0]);
    const n0 = r0.clone().negate();
    const n1 = r1.clone().negate();
    quad([i0, i1, lift(i1, h1), lift(i0, h0)], [n0, n1, n1, n0]);
    // Le chant du haut suit la pente des pointes
    const mid = r0.clone().add(r1).normalize();
    const edge = new THREE.Vector3().subVectors(lift(o1, h1), lift(o0, h0));
    const rim = new THREE.Vector3().crossVectors(mid, edge).normalize();
    quad([lift(o0, h0), lift(o1, h1), lift(i1, h1), lift(i0, h0)], [rim, rim, rim, rim]);
    quad([o0, o1, i1, i0], [down, down, down, down]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return geo;
}

/** La couronne : un bandeau à pointes perlées, deux arceaux dorés sur un bonnet de velours, l'orbe et la croix */
function couronne(color: string): THREE.Group {
  const g = base(color);
  const brass = gold();
  const R = 0.14;
  const hb = 0.1;
  const hs = 0.11;
  const n = 8;
  const y0 = BASE_H;
  const band = new THREE.Mesh(crownBand(R, 0.014, hb, hs, n), paint(color));
  band.position.y = y0;
  g.add(band);
  g.add(ring(R + 0.002, 0.008, brass, y0 + 0.012, 32, 4));
  g.add(ring(R + 0.002, 0.007, brass, y0 + hb - 0.006, 32, 4));
  // Les perles au bout des pointes
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) * Math.PI * 2) / n;
    g.add(ball(0.017, white(), (R - 0.007) * Math.sin(a), y0 + hb + hs + 0.01, (R - 0.007) * Math.cos(a), 8, 6));
  }
  // Le bonnet de velours, d'un ton plus sombre
  const velvet = new THREE.Mesh(
    new THREE.SphereGeometry(0.122, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(mix(color, "#000000", 0.35), { rough: 0.55 }),
  );
  velvet.scale.y = 1.35;
  velvet.position.y = y0 + 0.07;
  g.add(velvet);
  // Les arceaux, l'orbe et la croix
  const archR = R - 0.008;
  const lift = 1.32;
  for (const a of [0, Math.PI / 2]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(archR, 0.0085, 4, 18, Math.PI), brass);
    arch.scale.y = lift;
    arch.rotation.y = a;
    arch.position.y = y0 + hb - 0.01;
    g.add(arch);
  }
  const crest = y0 + hb - 0.01 + archR * lift;
  g.add(ball(0.024, brass, 0, crest + 0.018, 0, 14, 10));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.06, 0.014), brass).translateY(crest + 0.065));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.014, 0.014), brass).translateY(crest + 0.072));
  return g;
}

const BUILDERS: Record<TokenId, (color: string) => THREE.Group> = {
  pion,
  voiture,
  beret,
  bateau,
  croissant,
  fusee,
  montgolfiere,
  tour,
  diamant,
  couronne,
};

/** Le pion d'un joueur, prêt à poser : le palet au sol, l'avant vers +z, un maillage par matière */
export function tokenModel(id: TokenId, color: string): THREE.Group {
  const g = BUILDERS[id](color);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  const out = bake(g);
  out.name = `token-${id}`;
  return out;
}

// ---------------------------------------------------------------------------
// Les vignettes pour les menus
// ---------------------------------------------------------------------------

const thumbCache = new Map<string, Record<TokenId, string>>();

/** Les vignettes des pions (PNG au fond transparent), rendues une fois par couleur hors de l'écran */
export function tokenThumbnails(color: string, size = 128): Record<TokenId, string> {
  const key = `${color}|${size}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const out = Object.fromEntries(TOKENS.map((t) => [t.id, ""])) as Record<TokenId, string>;
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    scene.add(new THREE.HemisphereLight("#fff6e6", "#5d6b4c", 0.75));
    const sun = new THREE.DirectionalLight("#fff1dc", 2.3);
    sun.position.set(-1.2, 3, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    Object.assign(sun.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.5, far: 6 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.01;
    scene.add(sun);
    // Une ombre douce sous le palet, sur un sol invisible
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShadowMaterial({ opacity: 0.22 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 10);
    const dist = 1.68;
    const yaw = 0.5;
    const pitch = 0.42;
    const target = new THREE.Vector3(0, 0.255, 0);
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
    for (const t of TOKENS) {
      const model = tokenModel(t.id, color);
      scene.add(model);
      renderer.render(scene, camera);
      out[t.id] = renderer.domElement.toDataURL("image/png");
      scene.remove(model);
      model.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    floor.geometry.dispose();
    (floor.material as THREE.Material).dispose();
    env.dispose();
  } catch {
    // Pas de WebGL : des vignettes vides, l'interface garde ses noms
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  thumbCache.set(key, out);
  return out;
}
