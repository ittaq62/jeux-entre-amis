// La table en 3D, aux mesures exactes de la physique : le tapis (troué aux poches), les bandes en caoutchouc habillées
// de feutre (leur nez arrondi juste au-dessus du centre des billes, coupées en biais aux mâchoires des poches), le cadre
// de bois verni, les mouches de nacre, les coins et les poches (le cuir, la fonte), le filet sous chaque poche, le
// tablier et les pieds.
//
// Le repère : x le long de la table comme la physique, y vers le haut, z = −y de la physique ; le tapis est à y = 0.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Table } from "../../../shared/games/billard/table.ts";
import { feltNormal, feltTile, feltTop, woodTexture } from "./textures.ts";

export type Trim = "laiton" | "chrome" | "noir" | "or" | "cuivre";
export type Legs = "tournes" | "massifs" | "metal" | "lyre";

export interface TableStyle {
  wood: string;
  trim: Trim;
  legs: Legs;
  /** La couleur du feutre et son ombre */
  cloth: [string, string];
  /** Le cuir des poches */
  leather: string;
}

export interface TableMeshes {
  group: THREE.Group;
  /** Où posent les billes tombées dans chaque poche (le fond du filet) */
  nets: THREE.Vector3[];
  /** La hauteur du sol sous la table */
  floorY: number;
  clothMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

/** La hauteur du tapis au-dessus du sol */
export const TABLE_HEIGHT = 0.79;

const TRIMS: Record<Trim, THREE.MeshPhysicalMaterialParameters> = {
  laiton: { color: "#9a7a3a", metalness: 1, roughness: 0.42 },
  or: { color: "#c09a40", metalness: 1, roughness: 0.32 },
  chrome: { color: "#b8bec4", metalness: 1, roughness: 0.25 },
  noir: { color: "#1a1a1c", metalness: 0.6, roughness: 0.4 },
  cuivre: { color: "#a06040", metalness: 1, roughness: 0.4 },
};

/** Le profil d'une bande, vu en coupe : (recul depuis le nez, hauteur), et si le point est une arête vive */
function cushionProfile(nose: number, top: number, depth: number): [number, number, boolean][] {
  return [
    [depth, 0, true],
    [0.016, 0, true],
    [0.006, nose * 0.55, false],
    [0.0012, nose * 0.86, false],
    [0, nose, false],
    [0.0012, nose + (top - nose) * 0.45, false],
    [0.005, top - 0.0008, false],
    [0.012, top, true],
    [depth, top, true],
  ];
}

/**
 * Une bande : le profil tiré le long du nez, de P à Q (en coordonnées de la physique), `n` vers l'extérieur. Aux deux
 * bouts, le recul fait glisser la coupe le long de la bande (`ea`, `eb` : 1 pour une coupe à 45°, 0 pour une coupe droite).
 */
function cushionGeometry(
  px: number,
  py: number,
  qx: number,
  qy: number,
  nx: number,
  ny: number,
  ea: number,
  eb: number,
  profile: [number, number, boolean][],
): THREE.BufferGeometry {
  let tx = qx - px,
    ty = qy - py;
  const len = Math.sqrt(tx * tx + ty * ty);
  tx /= len;
  ty /= len;
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const P = (u: number, h: number, end: 0 | 1) => {
    const bx = end === 0 ? px - tx * ea * u : qx + tx * eb * u;
    const by = end === 0 ? py - ty * ea * u : qy + ty * eb * u;
    return [bx + nx * u, h, -(by + ny * u)];
  };
  // Le long du profil : chaque segment a ses propres sommets (les normales lisses dans l'arrondi du nez, vives ailleurs)
  const k = profile.length;
  const pn = (i: number): [number, number] => {
    // La normale 2D d'un segment du profil (vers l'extérieur de la matière)
    const a = profile[i]!,
      b = profile[i + 1]!;
    const du = b[0] - a[0],
      dh = b[1] - a[1];
    const l = Math.sqrt(du * du + dh * dh) || 1;
    return [dh / l, -du / l];
  };
  let vAcc = 0;
  for (let i = 0; i < k - 1; i++) {
    const a = profile[i]!,
      b = profile[i + 1]!;
    const nA = a[2] || i === 0 ? pn(i) : avg(pn(i - 1), pn(i));
    const nB = b[2] || i === k - 2 ? pn(i) : avg(pn(i), pn(i + 1));
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const base = pos.length / 3;
    for (const [pt, nn, v] of [
      [a, nA, vAcc],
      [b, nB, vAcc + segLen],
    ] as const) {
      for (const end of [0, 1] as const) {
        pos.push(...P(pt[0], pt[1], end));
        // La normale : (recul, hauteur) → dans le monde, le recul va selon n
        const wx = nx * nn[0],
          wz = -ny * nn[0];
        nor.push(wx, nn[1], wz);
        uv.push((end === 0 ? 0 : len) * 6, v * 6);
      }
    }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    vAcc += segLen;
  }
  // Les deux bouts : le profil rempli
  const shape2 = profile.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(shape2, []);
  for (const end of [0, 1] as const) {
    const base = pos.length / 3;
    // La normale du bout : le long de la bande, vers l'extérieur du bout
    const sgn = end === 0 ? -1 : 1;
    for (const p of profile) {
      pos.push(...P(p[0], p[1], end));
      nor.push(sgn * tx, 0, -sgn * ty);
      uv.push(p[0] * 6, p[1] * 6);
    }
    for (const t of tris) {
      if (end === 0) idx.push(base + t[0]!, base + t[2]!, base + t[1]!);
      else idx.push(base + t[0]!, base + t[1]!, base + t[2]!);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // Le sens des triangles dépend du côté de la bande : on garde des faces tournées vers l'extérieur
  fixWinding(g);
  return g;
}

function avg(a: [number, number], b: [number, number]): [number, number] {
  const x = a[0] + b[0],
    y = a[1] + b[1];
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** Remet chaque triangle dans le sens de sa normale (les faces vues de l'extérieur) */
function fixWinding(g: THREE.BufferGeometry) {
  const p = g.attributes.position!,
    n = g.attributes.normal!;
  const idx = g.index!.array as unknown as number[];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    nn = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(p, idx[i]!);
    b.fromBufferAttribute(p, idx[i + 1]!);
    c.fromBufferAttribute(p, idx[i + 2]!);
    nn.fromBufferAttribute(n, idx[i]!);
    const face = b.sub(a).cross(c.sub(a));
    if (face.dot(nn) < 0) {
      const t = idx[i + 1]!;
      idx[i + 1] = idx[i + 2]!;
      idx[i + 2] = t;
    }
  }
  g.index!.needsUpdate = true;
}

/** Un arc (de a0 à a1, sens trigonométrique si a1 > a0) ajouté à un chemin, en coordonnées de la physique */
function arcTo(path: THREE.Path, cx: number, cy: number, r: number, a0: number, a1: number, n = 20) {
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    path.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}

export function buildTable(t: Table, style: TableStyle, touch: boolean): TableMeshes {
  const list: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (list.push(x), x);
  const group = new THREE.Group();
  group.name = "table";
  const lx = t.lx,
    ly = t.ly;
  const cw = t.cushionW,
    rw = t.rail;
  const R = t.R;
  const pool = t.kind === "poches";
  const nose = R * 1.27;
  const top = nose + 0.008;
  const railTop = top + 0.001;
  const OX = lx + cw + rw,
    OY = ly + cw + rw;

  // ---- Les matières
  const clothTop = feltTop(
    style.cloth[0],
    style.cloth[1],
    2 * lx,
    2 * ly,
    pool ? [t.headSpot, t.footSpot, [0, 0]] : [t.headSpot, t.footSpot, [t.headSpot[0], -0.1825]],
    `top:${style.cloth.join()}:${t.kind}`,
  );
  const normal = feltNormal().clone();
  keep(normal);
  normal.repeat.set(18, 9);
  normal.needsUpdate = true;
  const clothMat = keep(
    new THREE.MeshPhysicalMaterial({
      map: clothTop,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.92,
      metalness: 0,
      // Un velouté discret : trop fort, le feutre blanchit quand on le regarde à ras (la vue de la queue)
      sheen: touch ? 0 : 0.28,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(style.cloth[0]).lerp(new THREE.Color("#ffffff"), 0.12),
      envMapIntensity: 0.25,
    }),
  );
  const tile = feltTile(style.cloth[0]);
  const cushionMat = keep(
    new THREE.MeshPhysicalMaterial({
      map: tile,
      color: new THREE.Color("#ffffff").multiplyScalar(0.92),
      normalMap: normal,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.9,
      sheen: touch ? 0 : 0.3,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(style.cloth[0]).lerp(new THREE.Color("#ffffff"), 0.12),
      envMapIntensity: 0.3,
    }),
  );
  const woodMap = woodTexture(style.wood, 3).clone();
  keep(woodMap);
  woodMap.repeat.set(1.6, 1.6);
  woodMap.needsUpdate = true;
  const woodMat = keep(
    new THREE.MeshPhysicalMaterial({
      map: woodMap,
      roughness: 0.42,
      clearcoat: 1,
      clearcoatRoughness: 0.16,
      metalness: 0,
      envMapIntensity: 0.45,
    }),
  );
  const darkWood = keep(
    new THREE.MeshPhysicalMaterial({
      map: woodMap,
      color: "#8a8a8a",
      roughness: 0.5,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.25,
    }),
  );
  const trimMat = keep(new THREE.MeshPhysicalMaterial({ ...TRIMS[style.trim], envMapIntensity: 0.4 }));
  const leatherMat = keep(new THREE.MeshStandardMaterial({ color: style.leather, roughness: 0.55, metalness: 0.05 }));
  const holeMat = keep(new THREE.MeshBasicMaterial({ color: "#050505", side: THREE.DoubleSide }));
  const pearlMat = keep(
    new THREE.MeshPhysicalMaterial({ color: "#f4f1ea", roughness: 0.15, clearcoat: 1, iridescence: 0.6, emissive: "#2a2824" }),
  );

  // ---- Le tapis, troué aux poches
  const holeR = (corner: boolean) => (corner ? 0.06 : 0.062);
  const bedShape = new THREE.Shape();
  const bx = lx + cw + 0.08,
    by = ly + cw + 0.08;
  bedShape.moveTo(-bx, -by);
  bedShape.lineTo(bx, -by);
  bedShape.lineTo(bx, by);
  bedShape.lineTo(-bx, by);
  bedShape.closePath();
  for (const p of t.pockets) {
    const h = new THREE.Path();
    h.absarc(p.x, p.y, holeR(p.corner), 0, Math.PI * 2, true);
    bedShape.holes.push(h);
  }
  const bedGeo = keep(new THREE.ShapeGeometry(bedShape, 24));
  {
    const pa = bedGeo.attributes.position!,
      ua = bedGeo.attributes.uv!;
    for (let i = 0; i < pa.count; i++) ua.setXY(i, (pa.getX(i) + lx) / (2 * lx), (pa.getY(i) + ly) / (2 * ly));
    // Le tapis (le dessin de la physique, y vers le haut) passe à plat : (x, y) → (x, 0, −y)
    bedGeo.rotateX(-Math.PI / 2);
  }
  clothTop.wrapS = clothTop.wrapT = THREE.ClampToEdgeWrapping;
  const bed = new THREE.Mesh(bedGeo, clothMat);
  bed.receiveShadow = true;
  bed.name = "tapis";
  group.add(bed);
  // Le dessous du tapis (l'ardoise), pour ne pas voir à travers vu d'en bas
  const slate = new THREE.Mesh(
    keep(new THREE.BoxGeometry(2 * bx, 0.03, 2 * by)),
    keep(new THREE.MeshStandardMaterial({ color: "#1a1c1e" })),
  );
  slate.position.y = -0.016;
  group.add(slate);

  // ---- Les bandes
  const profile = cushionProfile(nose, top, cw);
  const cushionGeos: THREE.BufferGeometry[] = [];
  if (pool) {
    const cc = 0.124 * 0.7071067811865476 * (t.pockets[0]!.mouth / 0.124);
    const m = t.pockets[4]!.mouth / 2;
    // Haut (y = ly), bout droit, bas, bout gauche ; à chaque bout, 45° vers une poche de coin, droit vers une poche du milieu
    const segs: [number, number, number, number, number, number, number, number][] = [
      [-lx + cc, ly, -m, ly, 0, 1, 1, 0],
      [m, ly, lx - cc, ly, 0, 1, 0, 1],
      [lx, ly - cc, lx, -ly + cc, 1, 0, 1, 1],
      [lx - cc, -ly, m, -ly, 0, -1, 1, 0],
      [-m, -ly, -lx + cc, -ly, 0, -1, 0, 1],
      [-lx, -ly + cc, -lx, ly - cc, -1, 0, 1, 1],
    ];
    for (const s of segs) cushionGeos.push(cushionGeometry(...s, profile));
  } else {
    const segs: [number, number, number, number, number, number, number, number][] = [
      [-lx, ly, lx, ly, 0, 1, 1, 1],
      [lx, ly, lx, -ly, 1, 0, 1, 1],
      [lx, -ly, -lx, -ly, 0, -1, 1, 1],
      [-lx, -ly, -lx, ly, -1, 0, 1, 1],
    ];
    for (const s of segs) cushionGeos.push(cushionGeometry(...s, profile));
  }
  const cushions = new THREE.Mesh(keep(mergeGeometries(cushionGeos)), cushionMat);
  for (const g of cushionGeos) g.dispose();
  // Seules les billes et la queue portent une ombre (l'ombre au pied des bandes est peinte dans le tapis)
  cushions.castShadow = false;
  cushions.receiveShadow = true;
  cushions.name = "bandes";
  group.add(cushions);

  // ---- Le cadre de bois : un rectangle arrondi, évidé jusqu'au dos des bandes et aux poches
  const frame = new THREE.Shape();
  const cr = 0.075;
  frame.moveTo(-OX + cr, -OY);
  frame.lineTo(OX - cr, -OY);
  frame.quadraticCurveTo(OX, -OY, OX, -OY + cr);
  frame.lineTo(OX, OY - cr);
  frame.quadraticCurveTo(OX, OY, OX - cr, OY);
  frame.lineTo(-OX + cr, OY);
  frame.quadraticCurveTo(-OX, OY, -OX, OY - cr);
  frame.lineTo(-OX, -OY + cr);
  frame.quadraticCurveTo(-OX, -OY, -OX + cr, -OY);
  const IX = lx + cw,
    IY = ly + cw;
  const hole = new THREE.Path();
  // Les entailles des poches : un cercle un peu au-delà du coin (il mange le coin du dos des bandes), un demi-cercle au milieu
  const cornerCut = { off: 0.022, r: 0.082 };
  const sideCut = 0.072;
  if (pool) {
    // On tourne dans le sens trigonométrique, depuis le bas, entre la poche du milieu et le coin bas-droit ; à chaque
    // poche, on contourne l'entaille par l'extérieur de la table
    const via = (cx: number, cy: number, r: number, p1: [number, number], p2: [number, number], out: number, n: number) => {
      hole.lineTo(p1[0], p1[1]);
      const a = Math.atan2(p1[1] - cy, p1[0] - cx);
      let b = Math.atan2(p2[1] - cy, p2[0] - cx);
      const turn = (x: number) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      // Dans le sens trigonométrique si l'extérieur est sur ce chemin-là, sinon dans l'autre
      if (turn(out - a) < turn(b - a)) b = a + turn(b - a);
      else b = a - turn(a - b);
      arcTo(hole, cx, cy, r, a, b, n);
    };
    const corner = (sx: number, sy: number, onLongFirst: boolean) => {
      const cx = sx * (lx + cornerCut.off),
        cy = sy * (ly + cornerCut.off);
      const d = Math.sqrt(cornerCut.r * cornerCut.r - (IY - Math.abs(cy)) ** 2);
      const dE = Math.sqrt(cornerCut.r * cornerCut.r - (IX - Math.abs(cx)) ** 2);
      const onLong: [number, number] = [cx - sx * d, sy * IY];
      const onEnd: [number, number] = [sx * IX, cy - sy * dE];
      via(cx, cy, cornerCut.r, onLongFirst ? onLong : onEnd, onLongFirst ? onEnd : onLong, Math.atan2(sy, sx), 26);
    };
    const side = (sy: number, fromLeft: boolean) => {
      const cy = sy * (ly + 0.012);
      const dx = Math.sqrt(sideCut * sideCut - (IY - Math.abs(cy)) ** 2);
      via(0, cy, sideCut, [fromLeft ? -dx : dx, sy * IY], [fromLeft ? dx : -dx, sy * IY], sy > 0 ? Math.PI / 2 : -Math.PI / 2, 20);
    };
    hole.moveTo(lx / 2, -IY);
    corner(1, -1, true);
    corner(1, 1, false);
    side(1, false);
    corner(-1, 1, true);
    corner(-1, -1, false);
    side(-1, true);
    hole.lineTo(lx / 2, -IY);
  } else {
    hole.moveTo(-IX, -IY);
    hole.lineTo(IX, -IY);
    hole.lineTo(IX, IY);
    hole.lineTo(-IX, IY);
    hole.lineTo(-IX, -IY);
  }
  frame.holes.push(hole);
  const capH = 0.034;
  const capGeo = keep(
    new THREE.ExtrudeGeometry(frame, {
      depth: capH - 0.012,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.007,
      bevelSegments: touch ? 2 : 4,
      curveSegments: 10,
    }),
  );
  // L'extrusion part de z = 0 vers z = depth : on la couche (z → y), le dessus à railTop
  capGeo.rotateX(-Math.PI / 2);
  capGeo.translate(0, railTop - capH + 0.006, 0);
  woodUV(capGeo);
  const cap = new THREE.Mesh(capGeo, woodMat);
  cap.castShadow = false;
  cap.receiveShadow = true;
  cap.name = "cadre";
  group.add(cap);

  // ---- Le tablier sous le cadre, et sa moulure
  const apronH = 0.17;
  const apron = new THREE.Shape();
  const AX = OX - 0.012,
    AY = OY - 0.012;
  roundRect(apron, AX, AY, cr - 0.01);
  const apronHole = new THREE.Path();
  roundRectPath(apronHole, AX - 0.05, AY - 0.05, 0.02);
  apron.holes.push(apronHole);
  const apronGeo = keep(
    new THREE.ExtrudeGeometry(apron, {
      depth: apronH,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 2,
      curveSegments: 8,
    }),
  );
  apronGeo.rotateX(-Math.PI / 2);
  apronGeo.translate(0, railTop - capH - apronH - 0.004, 0);
  woodUV(apronGeo);
  const apronMesh = new THREE.Mesh(apronGeo, darkWood);
  apronMesh.receiveShadow = true;
  apronMesh.castShadow = false;
  group.add(apronMesh);
  // Un filet de métal au bas du tablier
  const trimLine = new THREE.Shape();
  roundRect(trimLine, AX + 0.004, AY + 0.004, cr - 0.006);
  const trimHole = new THREE.Path();
  roundRectPath(trimHole, AX - 0.01, AY - 0.01, cr - 0.02);
  trimLine.holes.push(trimHole);
  const trimGeo = keep(new THREE.ExtrudeGeometry(trimLine, { depth: 0.008, bevelEnabled: false, curveSegments: 8 }));
  trimGeo.rotateX(-Math.PI / 2);
  trimGeo.translate(0, railTop - capH - apronH - 0.01, 0);
  group.add(new THREE.Mesh(trimGeo, trimMat));

  // ---- Les mouches de nacre sur le cadre
  const diamonds: [number, number][] = [];
  const mid = cw + rw * 0.42;
  for (let k = 1; k <= 3; k++) {
    for (const s of [-1, 1]) {
      for (const side of [-1, 1]) diamonds.push([(s * k * lx) / 4, side * (ly + mid)]);
    }
  }
  for (const yy of [-ly / 2, 0, ly / 2]) for (const s of [-1, 1]) diamonds.push([s * (lx + mid), yy]);
  const dGeo = keep(new THREE.CylinderGeometry(0.0085, 0.0085, 0.002, 4));
  dGeo.scale(1, 1, 0.55);
  const dMesh = new THREE.InstancedMesh(dGeo, pearlMat, diamonds.length);
  const mtx = new THREE.Matrix4();
  diamonds.forEach(([x, y], i) => {
    const vertical = Math.abs(x) > lx;
    mtx.makeRotationY(vertical ? Math.PI / 2 : 0);
    mtx.setPosition(x, railTop + 0.0008, -y);
    dMesh.setMatrixAt(i, mtx);
  });
  keep({ dispose: () => dMesh.dispose() });
  group.add(dMesh);

  // ---- Les poches : le cuir dans l'entaille, le trou, le filet, les coins de métal
  const nets: THREE.Vector3[] = [];
  if (pool) {
    const liners: THREE.BufferGeometry[] = [];
    const holes: THREE.BufferGeometry[] = [];
    const castings: THREE.BufferGeometry[] = [];
    const netGeos: THREE.BufferGeometry[] = [];
    const floors: THREE.BufferGeometry[] = [];
    for (const p of t.pockets) {
      const corner = p.corner;
      // L'entaille du cadre, centrée sur le cercle de coupe
      const cx = corner ? Math.sign(p.ox) * (lx + cornerCut.off) : 0;
      const cy = corner ? Math.sign(p.oy) * (ly + cornerCut.off) : Math.sign(p.oy) * (ly + 0.012);
      const r = corner ? cornerCut.r : sideCut;
      const out = Math.atan2(p.ny, p.nx);
      const span = corner ? 4.1 : 3.3;
      // Le cuir qui tapisse l'entaille, du dessus du cadre jusqu'au tapis
      // (un angle φ de la physique, vu de dessus, est l'angle φ + 90° des cylindres de three)
      const lin = new THREE.CylinderGeometry(r, r, railTop + 0.002, 28, 1, true, out - span / 2 + Math.PI / 2, span);
      lin.translate(cx, railTop / 2, -cy);
      liners.push(lin);
      // Le fond de la poche : du cuir sombre au-delà de l'embouchure, troué là où la bille tombe
      const floor = new THREE.Shape();
      const hr = holeR(corner);
      if (corner) floor.absarc(cx, cy, r, 0, Math.PI * 2, false);
      else {
        // Seulement au-delà de la ligne de l'embouchure (le tapis reste du feutre jusqu'aux pointes)
        const sy = Math.sign(p.oy);
        const dy = Math.abs(ly - Math.abs(cy));
        const dx = Math.sqrt(r * r - dy * dy);
        floor.moveTo(-dx, sy * ly);
        floor.lineTo(dx, sy * ly);
        const a0 = Math.atan2(sy * ly - cy, dx),
          a1 = Math.atan2(sy * ly - cy, -dx);
        for (let k = 1; k <= 24; k++) {
          const a = sy > 0 ? a0 + ((a1 - a0) * k) / 24 : a0 - ((a0 - (a1 - Math.PI * 2)) * k) / 24;
          floor.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
      }
      const fh = new THREE.Path();
      fh.absarc(p.x, p.y, hr, 0, Math.PI * 2, true);
      floor.holes.push(fh);
      const fg = new THREE.ShapeGeometry(floor, 24);
      fg.rotateX(-Math.PI / 2);
      fg.translate(0, 0.0006, 0);
      floors.push(fg);
      // Le trou, qui descend dans le noir
      const h = new THREE.CylinderGeometry(hr, hr * 0.85, 0.12, 24, 1, true);
      h.translate(p.x, -0.06, -p.y);
      holes.push(h);
      // La plaque de métal (ou de cuir) qui couvre le coin du cadre autour de l'entaille, aux bords arrondis
      const ring = new THREE.Shape();
      const a0 = out - span / 2,
        a1 = out + span / 2;
      const ro = r + (corner ? 0.042 : 0.03);
      ring.moveTo(cx + Math.cos(a0) * ro, cy + Math.sin(a0) * ro);
      arcTo(ring, cx, cy, ro, a0, a1, 32);
      ring.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      arcTo(ring, cx, cy, r, a1, a0, 32);
      ring.closePath();
      const cg = new THREE.ExtrudeGeometry(ring, {
        depth: 0.001,
        bevelEnabled: true,
        bevelThickness: 0.004,
        bevelSize: 0.005,
        bevelSegments: 4,
        curveSegments: 1,
      });
      cg.rotateX(-Math.PI / 2);
      cg.translate(0, railTop - 0.001, 0);
      castings.push(cg);
      // Le filet sous la poche
      const net = new THREE.SphereGeometry(0.072, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      net.translate(p.x + p.nx * 0.01, -0.12, -(p.y + p.ny * 0.01));
      netGeos.push(net);
      nets.push(new THREE.Vector3(p.x + p.nx * 0.01, -0.12 - 0.072 + R + 0.004, -(p.y + p.ny * 0.01)));
    }
    group.add(
      new THREE.Mesh(
        keep(mergeGeometries(floors)),
        keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(style.leather).multiplyScalar(0.6), roughness: 0.7 })),
      ),
    );
    const linerMesh = new THREE.Mesh(
      keep(mergeGeometries(liners)),
      keep(new THREE.MeshStandardMaterial({ color: style.leather, roughness: 0.6, side: THREE.DoubleSide })),
    );
    group.add(linerMesh);
    group.add(new THREE.Mesh(keep(mergeGeometries(holes)), holeMat));
    const castMesh = new THREE.Mesh(keep(mergeGeometries(castings)), style.trim === "noir" ? leatherMat : trimMat);
    castMesh.castShadow = false;
    group.add(castMesh);
    const netMat = keep(
      new THREE.MeshStandardMaterial({ map: netTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: "#d8d0c0" }),
    );
    group.add(new THREE.Mesh(keep(mergeGeometries(netGeos)), netMat));
    for (const g of [...liners, ...holes, ...castings, ...netGeos, ...floors]) g.dispose();
  }

  // ---- Les pieds
  const floorY = -TABLE_HEIGHT;
  const legTop = railTop - capH - apronH - 0.01;
  const legGeo = keep(legGeometry(style.legs, legTop - floorY));
  const legMat = style.legs === "metal" ? trimMat : darkWood;
  const legSpots: [number, number][] =
    style.legs === "lyre"
      ? [
          [-(lx - 0.25), 0],
          [lx - 0.25, 0],
        ]
      : [
          [-(OX - 0.16), -(OY - 0.16)],
          [OX - 0.16, -(OY - 0.16)],
          [OX - 0.16, OY - 0.16],
          [-(OX - 0.16), OY - 0.16],
          ...(style.legs === "massifs"
            ? ([] as [number, number][])
            : ([
                [0, OY - 0.16],
                [0, -(OY - 0.16)],
              ] as [number, number][])),
        ];
  for (const [x, y] of legSpots) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, floorY, -y);
    leg.castShadow = false;
    leg.receiveShadow = true;
    group.add(leg);
  }
  if (style.legs === "lyre" || style.legs === "metal") {
    // Une traverse entre les pieds
    const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(2 * lx - 0.4, 0.05, 0.08)), legMat);
    bar.position.set(0, floorY + 0.12, 0);
    group.add(bar);
  }

  // L'ombre de la table sur le sol : une tache douce, peinte (la table ne porte pas d'ombre calculée)
  {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(128, 64, 10, 128, 64, 128);
    grd.addColorStop(0, "rgba(0,0,0,0.85)");
    grd.addColorStop(0.55, "rgba(0,0,0,0.6)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.setTransform(1, 0, 0, 0.5, 0, 32);
    g.fillStyle = grd;
    g.fillRect(0, -64, 256, 256);
    const t = keep(new THREE.CanvasTexture(c));
    const blob = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(OX * 2.7, OY * 3.2)),
      keep(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.75 })),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = floorY + 0.006;
    blob.renderOrder = 1;
    group.add(blob);
  }

  return {
    group,
    nets,
    floorY,
    clothMat,
    dispose: () => {
      for (const x of list) x.dispose();
      list.length = 0;
    },
  };
}

function roundRect(s: THREE.Shape, X: number, Y: number, r: number) {
  s.moveTo(-X + r, -Y);
  s.lineTo(X - r, -Y);
  s.quadraticCurveTo(X, -Y, X, -Y + r);
  s.lineTo(X, Y - r);
  s.quadraticCurveTo(X, Y, X - r, Y);
  s.lineTo(-X + r, Y);
  s.quadraticCurveTo(-X, Y, -X, Y - r);
  s.lineTo(-X, -Y + r);
  s.quadraticCurveTo(-X, -Y, -X + r, -Y);
}

function roundRectPath(s: THREE.Path, X: number, Y: number, r: number) {
  s.moveTo(-X + r, -Y);
  s.quadraticCurveTo(-X, -Y, -X, -Y + r);
  s.lineTo(-X, Y - r);
  s.quadraticCurveTo(-X, Y, -X + r, Y);
  s.lineTo(X - r, Y);
  s.quadraticCurveTo(X, Y, X, Y - r);
  s.lineTo(X, -Y + r);
  s.quadraticCurveTo(X, -Y, X - r, -Y);
  s.lineTo(-X + r, -Y);
}

/** Les veines du bois le long de la table (x), sur le dessus comme sur les flancs */
function woodUV(g: THREE.BufferGeometry) {
  const p = g.attributes.position!,
    n = g.attributes.normal!;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const ny = Math.abs(n.getY(i)),
      nx = Math.abs(n.getX(i));
    // Les veines suivent le grand côté de la pièce de bois la plus proche
    const along = Math.abs(z) > Math.abs(x) * 0.48 ? x : z;
    const across = Math.abs(z) > Math.abs(x) * 0.48 ? z : x;
    uv[i * 2] = along * 0.9;
    uv[i * 2 + 1] = ny > 0.5 ? across * 2.2 : nx > 0.5 ? y * 2.2 + 0.3 : y * 2.2 + across;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** Un pied de table : tourné (les bagues, le bulbe), massif (carré, mouluré), en métal, ou la lyre (deux grands pieds) */
function legGeometry(kind: Legs, h: number): THREE.BufferGeometry {
  if (kind === "tournes") {
    const pts: THREE.Vector2[] = [];
    const prof: [number, number][] = [
      [0.055, 0],
      [0.06, 0.03],
      [0.045, 0.06],
      [0.052, 0.1],
      [0.075, 0.2],
      [0.072, 0.3],
      [0.05, 0.42],
      [0.04, 0.5],
      [0.055, 0.53],
      [0.045, 0.56],
      [0.07, 0.6],
      [0.07, 1],
    ];
    for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y * h));
    return new THREE.LatheGeometry(pts, 20);
  }
  if (kind === "metal") {
    const g = new THREE.CylinderGeometry(0.025, 0.03, h, 14);
    g.translate(0, h / 2, 0);
    return g;
  }
  if (kind === "lyre") {
    // Un grand pied plat qui s'évase vers le sol
    const s = new THREE.Shape();
    s.moveTo(-0.32, 0);
    s.lineTo(0.32, 0);
    s.lineTo(0.3, 0.06);
    s.quadraticCurveTo(0.08, 0.12, 0.09, h * 0.55);
    s.lineTo(0.14, h);
    s.lineTo(-0.14, h);
    s.lineTo(-0.09, h * 0.55);
    s.quadraticCurveTo(-0.08, 0.12, -0.3, 0.06);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
    g.translate(0, 0, -0.45);
    g.rotateY(Math.PI / 2);
    return g;
  }
  // Massif : un pilier carré aux arêtes adoucies, une base plus large
  const a = new THREE.BoxGeometry(0.15, h - 0.1, 0.15);
  a.translate(0, (h - 0.1) / 2 + 0.1, 0);
  const b = new THREE.BoxGeometry(0.2, 0.1, 0.2);
  b.translate(0, 0.05, 0);
  const g = mergeGeometries([a.toNonIndexed(), b.toNonIndexed()])!;
  a.dispose();
  b.dispose();
  return g;
}

let netTex: THREE.CanvasTexture | null = null;
/** Le filet d'une poche : des mailles en losange */
function netTexture(): THREE.CanvasTexture {
  if (netTex) return netTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 5;
  for (let i = -128; i < 256; i += 21) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(i + 128, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  netTex = new THREE.CanvasTexture(c);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(3, 2);
  return netTex;
}
