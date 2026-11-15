import * as THREE from "three";
import { bake, box, cyl, facadeBox, gableRoof, hipRoof, mat, shadowed } from "./buildings.ts";
import { makeCanvas, mix, type FacadeLook } from "./textures.ts";

// Le dernier niveau de chaque ville : son monument, en petit volume de jouet. De vrais monuments (aucune marque),
// reconnaissables à leur silhouette : la tour Eiffel à Paris, la cathédrale à deux flèches de Chartres, le beffroi de Lille…
// Repère local : le sol au centre de l'emprise (environ 0,5 × 0,5), la façade vers +z. Chaque monument a un socle bordé
// de la couleur du propriétaire et un fanion à son sommet : on voit à qui il est, même de loin.

// ---------------------------------------------------------------------------
// Les briques de base
// ---------------------------------------------------------------------------

function cone(r: number, h: number, m: THREE.Material, seg = 8, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.ConeGeometry(r, h, seg);
  if (seg === 4) geo.rotateY(Math.PI / 4);
  geo.translate(x, y + h / 2, z);
  return new THREE.Mesh(geo, m);
}

/** Une demi-sphère posée en y */
function dome(r: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  const geo = new THREE.SphereGeometry(r, seg, Math.max(4, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2);
  geo.translate(x, y, z);
  return new THREE.Mesh(geo, m);
}

/** Un prisme octogonal (tour, clocher) */
function octo(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, rTop = r): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, r, h, 8);
  geo.rotateY(Math.PI / 8);
  geo.translate(x, y + h / 2, z);
  return new THREE.Mesh(geo, m);
}

/** Des merlons sur le pourtour d'un rectangle (une tour carrée, un mur) */
function crenels(w: number, d: number, y: number, m: THREE.Material, g: THREE.Group, x0 = 0, z0 = 0, size = 0.026) {
  const along = (len: number) => Math.max(2, Math.round(len / (size * 2)));
  for (const side of [-1, 1]) {
    const n = along(w);
    for (let k = 0; k < n; k++)
      g.add(box(size, size, size * 0.8, m, x0 - w / 2 + ((k + 0.5) * w) / n, y, z0 + (side * (d - size * 0.8)) / 2));
    const n2 = along(d);
    for (let k = 1; k < n2 - 1; k++)
      g.add(box(size * 0.8, size, size, m, x0 + (side * (w - size * 0.8)) / 2, y, z0 - d / 2 + ((k + 0.5) * d) / n2));
  }
}

/** Des merlons autour d'une tour ronde */
function crenelRing(r: number, y: number, m: THREE.Material, g: THREE.Group, x0 = 0, z0 = 0, n = 10, size = 0.022) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const b = box(size, size, size, m);
    b.position.set(x0 + Math.cos(a) * (r - size / 2), y, z0 + Math.sin(a) * (r - size / 2));
    b.rotation.y = -a;
    g.add(b);
  }
}

/** Un mur percé d'une arche en plein cintre (porte, arc de triomphe), d'épaisseur d */
function archWall(w: number, h: number, d: number, archW: number, archH: number, m: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  const hole = new THREE.Path();
  const r = archW / 2;
  hole.moveTo(-r, 0);
  hole.lineTo(-r, archH - r);
  hole.absarc(0, archH - r, r, Math.PI, 0, true);
  hole.lineTo(r, 0);
  hole.closePath();
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -d / 2);
  return new THREE.Mesh(geo, m);
}

/** Un fronton triangulaire de largeur w, de hauteur h, d'épaisseur d (centré en z) */
function triangle(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return new THREE.Mesh(geo, m);
}

/** Un toit à deux pans dont le faîtage suit la profondeur (une nef, vue depuis son portail) */
function naveRoof(w: number, d: number, h: number, color: string): THREE.Mesh {
  const r = gableRoof(d, w, h, color, 0.012);
  r.rotation.y = Math.PI / 2;
  return r;
}

/** Une rosace de vitrail */
let roseTex: THREE.CanvasTexture | null = null;
function rose(r: number, x: number, y: number, z: number): THREE.Mesh {
  if (!roseTex) {
    const [c, ctx] = makeCanvas(128, 128);
    ctx.fillStyle = "#e6dcc6";
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();
    const colors = ["#2f4f9a", "#b0302a", "#2f7a9a", "#e2b33a"];
    for (let k = 0; k < 16; k++) {
      ctx.fillStyle = colors[k % colors.length]!;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.arc(64, 64, 54, (k / 16) * Math.PI * 2, ((k + 0.8) / 16) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#e2b33a";
    ctx.beginPath();
    ctx.arc(64, 64, 14, 0, Math.PI * 2);
    ctx.fill();
    roseTex = new THREE.CanvasTexture(c);
    roseTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshStandardMaterial({ map: roseTex, roughness: 0.4 }));
  m.position.set(x, y, z);
  return m;
}

/** Un cadran d'horloge */
function clock(r: number, x: number, y: number, z: number, face = "#f6f0dc"): THREE.Group {
  const g = new THREE.Group();
  const disc = cyl(r, r, 0.008, mat(face, { rough: 0.5 }), 16);
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  const hands = mat("#22313a");
  g.add(box(r * 0.12, r * 0.7, 0.004, hands, 0, 0, 0.006), box(r * 0.55, r * 0.12, 0.004, hands, r * 0.25, 0, 0.006));
  g.position.set(x, y, z);
  return g;
}

/** Le socle du monument : une dalle de pierre, bordée de la couleur du propriétaire */
function plinth(w: number, d: number, accent: string, stone = "#d9cfba"): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 0.018, d, mat(stone, { rough: 0.85 })));
  g.add(box(w + 0.012, 0.012, d + 0.012, mat(accent, { rough: 0.45 }), 0, 0.003, 0));
  return g;
}

/** Le fanion du propriétaire, au sommet du monument */
function pennant(accent: string, x: number, y: number, z: number, h = 0.1): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.004, 0.004, h, mat("#d8c58a", { metal: 0.7, rough: 0.3 }), 5));
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.06, -0.016);
  s.lineTo(0, -0.032);
  s.closePath();
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(s),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, side: THREE.DoubleSide }),
  );
  flag.position.set(0.003, h, 0);
  g.add(flag);
  g.position.set(x, y, z);
  return g;
}

/** Une flèche gothique : un cône à huit pans et quatre clochetons à sa base */
function gothicSpire(r: number, h: number, stone: THREE.Material, x: number, y: number, z: number, g: THREE.Group, pinnacles = true) {
  g.add(cone(r, h, stone, 8, x, y, z));
  if (!pinnacles) return;
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    g.add(cone(r * 0.22, h * 0.3, stone, 6, x + dx * r * 0.85, y, z + dz * r * 0.85));
  }
}

const gothic = (wall: string, glass = "#2f4a7a"): FacadeLook => ({
  wall,
  glass,
  frame: mix(wall, "#000000", 0.18),
  narrow: true,
  arched: true,
});

/** Un grand trait de rue : la façade d'une cathédrale (nef, deux tours) */
function cathedral(opts: {
  stone: string;
  roof: string;
  left: number;
  right: number;
  leftSpire: number;
  rightSpire: number;
  pinnaclesLeft?: boolean;
  pinnaclesRight?: boolean;
  accent: string;
}): THREE.Group {
  const g = new THREE.Group();
  const s = mat(opts.stone, { rough: 0.85 });
  const look = gothic(opts.stone);
  const top = mat(mix(opts.stone, "#000000", 0.15));
  g.add(plinth(0.48, 0.5, opts.accent, mix(opts.stone, "#ffffff", 0.2)));
  // La nef, de la façade vers le fond, son toit pentu
  const nef = facadeBox(0.2, 0.24, 0.36, look, top);
  nef.position.set(0, 0.018, -0.05);
  g.add(nef);
  const roof = naveRoof(0.2, 0.36, 0.13, opts.roof);
  roof.position.set(0, 0.258, -0.05);
  g.add(roof);
  // Les bas-côtés et les contreforts
  for (const side of [-1, 1]) {
    const aisle = facadeBox(0.06, 0.13, 0.32, look, top);
    aisle.position.set(side * 0.13, 0.018, -0.07);
    g.add(aisle);
    for (let k = 0; k < 4; k++) g.add(box(0.02, 0.17, 0.02, s, side * 0.165, 0.018, -0.2 + k * 0.08));
  }
  // La façade : le portail, la rosace
  const front = facadeBox(0.22, 0.26, 0.05, look, top);
  front.position.set(0, 0.018, 0.14);
  g.add(front);
  g.add(rose(0.05, 0, 0.2, 0.166));
  g.add(box(0.06, 0.08, 0.01, mat(mix(opts.stone, "#000000", 0.45)), 0, 0.018, 0.166));
  // Les deux tours et leurs flèches
  for (const [x, h, spire, pin] of [
    [-0.13, opts.left, opts.leftSpire, opts.pinnaclesLeft ?? true],
    [0.13, opts.right, opts.rightSpire, opts.pinnaclesRight ?? true],
  ] as const) {
    const t = facadeBox(0.1, h, 0.1, look, top);
    t.position.set(x, 0.018, 0.13);
    g.add(t);
    if (spire > 0) gothicSpire(0.055, spire, mat(mix(opts.roof, opts.stone, 0.3), { rough: 0.7 }), x, 0.018 + h, 0.13, g, pin);
  }
  const tallest = opts.left + opts.leftSpire >= opts.right + opts.rightSpire ? -0.13 : 0.13;
  g.add(pennant(opts.accent, tallest, 0.018 + Math.max(opts.left + opts.leftSpire, opts.right + opts.rightSpire), 0.13, 0.07));
  return g;
}

/** Un château fort : un donjon, des tours rondes, des courtines crénelées */
function roundTower(r: number, h: number, stone: THREE.Material, x: number, z: number, g: THREE.Group, roof?: string) {
  g.add(cyl(r, r * 1.05, h, stone, 14, x, 0.018, z));
  if (roof) {
    g.add(cyl(r * 1.08, r * 1.08, 0.02, stone, 14, x, 0.018 + h, z));
    g.add(cone(r * 1.12, r * 2.3, mat(roof, { rough: 0.75, flat: true }), 12, x, 0.038 + h, z));
  } else crenelRing(r * 1.06, 0.018 + h, stone, g, x, z, 9);
}

// ---------------------------------------------------------------------------
// Les monuments, ville par ville
// ---------------------------------------------------------------------------

const SLATE = "#4a535d";
const COPPER = "#5f9a86";
const GOLD = "#e0b64a";

function gueret(accent: string): THREE.Group {
  // L'hôtel des Moneyroux : un logis Renaissance de granit, sa tourelle d'escalier ronde
  const g = new THREE.Group();
  g.add(plinth(0.46, 0.4, accent));
  const look: FacadeLook = { wall: "#cbc1ad", glass: "#3e5568", frame: "#efe8da", narrow: true, ashlar: true };
  const top = mat("#9a9080");
  const body = facadeBox(0.34, 0.3, 0.24, look, top);
  body.position.set(0.03, 0.018, -0.03);
  g.add(body);
  const roof = hipRoof(0.34, 0.24, 0.2, SLATE);
  roof.position.set(0.03, 0.318, -0.03);
  g.add(roof);
  const stone = mat("#c4b9a4", { rough: 0.85 });
  g.add(cyl(0.065, 0.068, 0.42, stone, 16, -0.15, 0.018, 0.08));
  g.add(cone(0.085, 0.2, mat(SLATE, { flat: true }), 16, -0.15, 0.438, 0.08));
  for (const x of [-0.04, 0.1]) {
    g.add(box(0.06, 0.07, 0.05, mat("#efe8da"), x, 0.33, 0.07));
    const t = gableRoof(0.07, 0.06, 0.05, SLATE, 0.006);
    t.position.set(x, 0.4, 0.07);
    g.add(t);
  }
  g.add(box(0.07, 0.11, 0.01, mat(accent, { rough: 0.5 }), 0.06, 0.018, 0.095));
  g.add(pennant(accent, -0.15, 0.638, 0.08));
  return g;
}

function aurillac(accent: string): THREE.Group {
  // Le château Saint-Étienne : un donjon carré sur son rocher, dominant la ville
  const g = new THREE.Group();
  g.add(plinth(0.46, 0.46, accent, "#b8b2a6"));
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), mat("#7d776e", { flat: true, rough: 1 }));
  rock.scale.set(1.15, 0.45, 1);
  rock.position.set(0, 0.04, -0.02);
  g.add(rock);
  const look: FacadeLook = { wall: "#a39d92", glass: "#2f3a44", frame: "#cfc8bc", narrow: true, ashlar: true };
  const top = mat("#8d877c");
  const keep = facadeBox(0.17, 0.42, 0.17, look, top);
  keep.position.set(-0.04, 0.1, -0.03);
  g.add(keep);
  const stone = mat("#a39d92", { rough: 0.9 });
  crenels(0.19, 0.19, 0.52, stone, g, -0.04, -0.03);
  g.add(box(0.19, 0.02, 0.19, stone, -0.04, 0.5, -0.03));
  const lodge = facadeBox(0.18, 0.14, 0.14, look, top);
  lodge.position.set(0.11, 0.07, 0.07);
  g.add(lodge);
  const r = hipRoof(0.18, 0.14, 0.1, "#55585e");
  r.position.set(0.11, 0.21, 0.07);
  g.add(r);
  g.add(pennant(accent, -0.04, 0.546, -0.03));
  return g;
}

function mende(accent: string): THREE.Group {
  // La cathédrale de Mende : deux clochers inégaux, le plus haut à gauche
  return cathedral({
    stone: "#cdbfa6",
    roof: "#6c6a68",
    left: 0.38,
    right: 0.3,
    leftSpire: 0.24,
    rightSpire: 0.12,
    pinnaclesRight: false,
    accent,
  });
}

function vesoul(accent: string): THREE.Group {
  // La Motte de Vesoul : la colline, sa petite chapelle et la grande Vierge sur sa colonne
  const g = new THREE.Group();
  g.add(plinth(0.48, 0.48, accent, "#a9b88e"));
  const hill = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#7fae5a", { rough: 1 }));
  hill.scale.set(1, 0.62, 1);
  hill.position.y = 0.018;
  g.add(hill);
  // Quelques arbres sur les pentes
  const leaf = mat("#4f8a3d", { flat: true, rough: 0.9 });
  for (const [x, z, s] of [
    [-0.15, 0.06, 1],
    [0.14, -0.08, 0.9],
    [0.08, 0.15, 0.8],
    [-0.08, -0.16, 0.85],
  ] as const) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.1 * s, 7), leaf);
    t.position.set(x, 0.07 + 0.05 * s, z);
    g.add(t);
  }
  // La chapelle
  const look: FacadeLook = { wall: "#efe6d2", glass: "#3e5568", frame: "#efe6d2", narrow: true, arched: true };
  const ch = facadeBox(0.1, 0.08, 0.13, look, mat("#d8ccb5"));
  ch.position.set(0.05, 0.16, 0.0);
  g.add(ch);
  const roof = naveRoof(0.1, 0.13, 0.06, "#8a4a31");
  roof.position.set(0.05, 0.24, 0);
  g.add(roof);
  // La colonne et la statue
  const stone = mat("#e9e1cf", { rough: 0.6 });
  g.add(box(0.05, 0.03, 0.05, stone, -0.06, 0.15, -0.02));
  g.add(cyl(0.014, 0.017, 0.26, stone, 10, -0.06, 0.18, -0.02));
  g.add(cyl(0.012, 0.022, 0.06, mat("#f4f1ea", { rough: 0.5 }), 10, -0.06, 0.44, -0.02));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), mat("#f4f1ea"));
  head.position.set(-0.06, 0.51, -0.02);
  g.add(head);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, 6, 16), mat(GOLD, { metal: 0.8, rough: 0.3 }));
  halo.position.set(-0.06, 0.52, -0.024);
  g.add(halo);
  g.add(pennant(accent, 0.05, 0.3, 0.0, 0.08));
  return g;
}

function foix(accent: string): THREE.Group {
  // Le château de Foix : trois tours sur leur éperon rocheux, deux carrées et une ronde
  const g = new THREE.Group();
  g.add(plinth(0.48, 0.44, accent, "#a9a59a"));
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.21, 0), mat("#867f74", { flat: true, rough: 1 }));
  rock.scale.set(1.2, 0.62, 0.95);
  rock.position.set(0, 0.06, 0);
  g.add(rock);
  const look: FacadeLook = { wall: "#b5ad9e", glass: "#2f3a44", frame: "#cfc8bc", narrow: true, ashlar: true };
  const top = mat("#9a9285");
  const stone = mat("#b5ad9e", { rough: 0.9 });
  // La courtine entre les tours
  g.add(box(0.34, 0.1, 0.06, stone, 0, 0.16, 0.0));
  crenels(0.34, 0.06, 0.26, stone, g, 0, 0, 0.022);
  for (const [x, h] of [
    [-0.14, 0.3],
    [0.02, 0.36],
  ] as const) {
    const t = facadeBox(0.1, h, 0.1, look, top);
    t.position.set(x, 0.16, 0);
    g.add(t);
    crenels(0.11, 0.11, 0.16 + h, stone, g, x, 0, 0.022);
  }
  g.add(cyl(0.055, 0.058, 0.3, stone, 14, 0.16, 0.16, 0));
  crenelRing(0.058, 0.46, stone, g, 0.16, 0, 9);
  g.add(pennant(accent, 0.02, 0.546, 0));
  return g;
}

function perigueux(accent: string): THREE.Group {
  // La cathédrale Saint-Front : la croix grecque, ses cinq coupoles à lanternons, le grand clocher
  const g = new THREE.Group();
  g.add(plinth(0.5, 0.5, accent, "#e6dcc4"));
  const look: FacadeLook = { wall: "#efe5cf", glass: "#3e5568", frame: "#dacfb8", narrow: true, arched: true };
  const top = mat("#ded2b9");
  const arm1 = facadeBox(0.36, 0.13, 0.12, look, top);
  arm1.position.y = 0.018;
  const arm2 = facadeBox(0.12, 0.13, 0.36, look, top);
  arm2.position.y = 0.018;
  g.add(arm1, arm2);
  const stone = mat("#ece2cb", { rough: 0.7 });
  for (const [x, z, r] of [
    [0, 0, 0.075],
    [0.13, 0, 0.055],
    [-0.13, 0, 0.055],
    [0, 0.13, 0.055],
    [0, -0.13, 0.055],
  ] as const) {
    g.add(cyl(r, r, 0.03, stone, 16, x, 0.148, z));
    g.add(dome(r, stone, x, 0.178, z));
    g.add(cyl(r * 0.18, r * 0.18, 0.04, stone, 8, x, 0.178 + r * 0.92, z));
    g.add(cone(r * 0.26, 0.035, stone, 8, x, 0.218 + r * 0.92, z));
  }
  // Le clocher, à l'arrière : des étages, une colonnade, le toit en écailles
  const t1 = facadeBox(0.1, 0.24, 0.1, look, top);
  t1.position.set(0.14, 0.018, -0.15);
  g.add(t1);
  const t2 = facadeBox(0.08, 0.1, 0.08, look, top);
  t2.position.set(0.14, 0.258, -0.15);
  g.add(t2);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.add(cyl(0.006, 0.006, 0.06, stone, 6, 0.14 + Math.cos(a) * 0.045, 0.358, -0.15 + Math.sin(a) * 0.045));
  }
  g.add(cyl(0.052, 0.052, 0.012, stone, 16, 0.14, 0.418, -0.15));
  const cap = new THREE.Mesh(
    new THREE.LatheGeometry(
      [0, 0.045, 0.05, 0.04, 0.02, 0.003].map((r, k) => new THREE.Vector2(r || 0.0001, k * 0.024)),
      12,
    ),
    stone,
  );
  cap.position.set(0.14, 0.43, -0.15);
  g.add(cap);
  g.add(pennant(accent, 0.14, 0.55, -0.15, 0.07));
  return g;
}

function auxerre(accent: string): THREE.Group {
  // La tour de l'Horloge : une porte de ville, son cadran doré, sa flèche d'ardoise, entre deux maisons à pans de bois
  const g = new THREE.Group();
  g.add(plinth(0.48, 0.42, accent));
  const stone = mat("#ddd2bb", { rough: 0.85 });
  const gate = archWall(0.16, 0.42, 0.14, 0.08, 0.13, stone);
  gate.position.set(0, 0.018, 0);
  g.add(gate);
  const look: FacadeLook = { wall: "#ddd2bb", glass: "#2f3a44", frame: "#cfc2a6", narrow: true };
  const upper = facadeBox(0.16, 0.12, 0.14, look, stone);
  upper.position.set(0, 0.32, 0);
  g.add(upper);
  g.add(clock(0.042, 0, 0.26, 0.076, "#2f4f8a"));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 4), mat(SLATE, { flat: true }));
  roof.geometry.rotateY(Math.PI / 4);
  roof.position.set(0, 0.438 + 0.13, 0);
  g.add(roof);
  g.add(cone(0.012, 0.08, mat(GOLD, { metal: 0.7, rough: 0.35 }), 6, 0, 0.69, 0));
  // Les maisons à pans de bois de part et d'autre
  for (const side of [-1, 1]) {
    const hl: FacadeLook = { wall: side < 0 ? "#efd9b8" : "#e8cfc4", timber: "#6a3f2a", frame: "#f6efe1" };
    const h = facadeBox(0.14, 0.28, 0.16, hl, mat("#8a4a31"));
    h.position.set(side * 0.16, 0.018, -0.02);
    g.add(h);
    const r = naveRoof(0.14, 0.16, 0.12, "#8a4a31");
    r.position.set(side * 0.16, 0.298, -0.02);
    g.add(r);
  }
  g.add(pennant(accent, 0, 0.77, 0, 0.06));
  return g;
}

function chartres(accent: string): THREE.Group {
  // La cathédrale de Chartres : la flèche romane, sobre, et la flèche gothique, ciselée et plus haute ; le toit de cuivre vert
  return cathedral({
    stone: "#d9ccb0",
    roof: COPPER,
    left: 0.34,
    right: 0.34,
    leftSpire: 0.36,
    rightSpire: 0.26,
    pinnaclesLeft: true,
    pinnaclesRight: false,
    accent,
  });
}

function limoges(accent: string): THREE.Group {
  // La gare des Bénédictins : le grand hall, son dôme de cuivre et son campanile à horloge
  const g = new THREE.Group();
  g.add(plinth(0.5, 0.42, accent, "#e6dcc4"));
  const look: FacadeLook = { wall: "#f1ebdc", glass: "#3b5a78", frame: "#e2d8c2", arched: true };
  const top = mat("#ddd4c0");
  const hall = facadeBox(0.46, 0.15, 0.2, look, top);
  hall.position.set(0, 0.018, -0.02);
  g.add(hall);
  const copper = mat(COPPER, { rough: 0.5, metal: 0.3 });
  const roof = gableRoof(0.46, 0.2, 0.06, COPPER, 0.01);
  roof.position.set(0, 0.168, -0.02);
  g.add(roof);
  g.add(cyl(0.085, 0.085, 0.06, mat("#f1ebdc"), 16, -0.06, 0.168, -0.02));
  g.add(dome(0.09, copper, -0.06, 0.228, -0.02));
  g.add(cyl(0.012, 0.012, 0.04, copper, 8, -0.06, 0.31, -0.02));
  // Le campanile
  const tl: FacadeLook = { wall: "#f1ebdc", glass: "#3b5a78", frame: "#e2d8c2", narrow: true, arched: true };
  const tower = facadeBox(0.08, 0.5, 0.08, tl, top);
  tower.position.set(0.17, 0.018, 0.04);
  g.add(tower);
  for (const [dx, dz, ry] of [
    [0, 0.041, 0],
    [0.041, 0, Math.PI / 2],
  ] as const) {
    const c = clock(0.026, 0.17 + dx, 0.45, 0.04 + dz);
    c.rotation.y = ry;
    g.add(c);
  }
  g.add(box(0.09, 0.02, 0.09, mat("#e2d8c2"), 0.17, 0.518, 0.04));
  g.add(cone(0.06, 0.16, copper, 4, 0.17, 0.538, 0.04));
  g.add(pennant(accent, 0.17, 0.698, 0.04, 0.06));
  return g;
}

function brest(accent: string): THREE.Group {
  // Le pont de Recouvrance : deux paires de pylônes de béton et le tablier levant, au-dessus de la Penfeld
  const g = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.008, 0.2),
    new THREE.MeshStandardMaterial({ color: "#3f7fb0", roughness: 0.15, metalness: 0.3 }),
  );
  water.position.y = 0.004;
  g.add(water);
  for (const z of [-0.16, 0.16]) g.add(box(0.52, 0.03, 0.12, mat("#a9a59a"), 0, 0, z));
  g.add(box(0.53, 0.012, 0.46, mat(accent, { rough: 0.45 }), 0, -0.002, 0));
  const concrete = mat("#d6d3cb", { rough: 0.8 });
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.08, 0.08]) g.add(box(0.05, 0.6, 0.05, concrete, x, 0.03, z));
    g.add(box(0.05, 0.05, 0.21, concrete, x, 0.6, 0));
    g.add(box(0.05, 0.03, 0.21, concrete, x, 0.42, 0));
    // Le contrepoids, entre les pylônes
    g.add(box(0.035, 0.08, 0.1, mat("#9aa1a8", { metal: 0.4 }), x, 0.48, 0));
  }
  // Le tablier, à la couleur du propriétaire, à mi-hauteur (il monte pour laisser passer les bateaux)
  const deck = mat(accent, { rough: 0.5 });
  g.add(box(0.36, 0.035, 0.13, deck, 0, 0.22, 0));
  g.add(box(0.36, 0.012, 0.004, mat("#f4f4f0"), 0, 0.257, 0.063), box(0.36, 0.012, 0.004, mat("#f4f4f0"), 0, 0.257, -0.063));
  // Les câbles de levage
  const cable = mat("#4a4f55", { metal: 0.6 });
  for (const x of [-0.18, 0.18]) for (const z of [-0.06, 0.06]) g.add(cyl(0.003, 0.003, 0.4, cable, 4, x, 0.25, z));
  g.add(pennant(accent, 0.2, 0.65, 0, 0.07));
  return g;
}

function poitiers(accent: string): THREE.Group {
  // Notre-Dame-la-Grande : la façade romane sculptée, ses deux tourelles coiffées de cônes en écailles de pin
  const g = new THREE.Group();
  g.add(plinth(0.46, 0.46, accent, "#e6dcc4"));
  const look: FacadeLook = { wall: "#e7d5ad", glass: "#3e5568", frame: "#cdb98e", narrow: true, arched: true, ashlar: true };
  const top = mat("#d9c69c");
  const nave = facadeBox(0.2, 0.22, 0.32, look, top);
  nave.position.set(0, 0.018, -0.07);
  g.add(nave);
  const r = naveRoof(0.2, 0.32, 0.1, "#b5583a");
  r.position.set(0, 0.238, -0.07);
  g.add(r);
  const front = facadeBox(0.24, 0.26, 0.04, { ...look, arched: true }, top);
  front.position.set(0, 0.018, 0.1);
  g.add(front);
  const gable = triangle(0.24, 0.08, 0.04, mat("#e7d5ad", { flat: true }));
  gable.position.set(0, 0.278, 0.1);
  g.add(gable);
  const stone = mat("#e2cfa4", { rough: 0.8 });
  const scales = mat("#cdb07c", { rough: 0.9, flat: true });
  for (const x of [-0.13, 0.13]) {
    g.add(cyl(0.035, 0.035, 0.3, stone, 12, x, 0.018, 0.1));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.add(cyl(0.005, 0.005, 0.05, stone, 5, x + Math.cos(a) * 0.03, 0.318, 0.1 + Math.sin(a) * 0.03));
    }
    const pine = new THREE.Mesh(
      new THREE.LatheGeometry(
        [0.04, 0.042, 0.036, 0.024, 0.01, 0.001].map((rr, k) => new THREE.Vector2(rr, k * 0.022)),
        10,
      ),
      scales,
    );
    pine.position.set(x, 0.368, 0.1);
    g.add(pine);
  }
  // Le clocher de la croisée
  const t = facadeBox(0.08, 0.14, 0.08, look, top);
  t.position.set(0, 0.24, -0.1);
  g.add(t);
  g.add(cone(0.06, 0.12, scales, 12, 0, 0.38, -0.1));
  g.add(pennant(accent, 0, 0.5, -0.1, 0.06));
  return g;
}

function clermont(accent: string): THREE.Group {
  // La cathédrale de Clermont : la pierre de lave noire de Volvic, deux flèches jumelles
  return cathedral({ stone: "#4c4b4c", roof: "#3d4249", left: 0.36, right: 0.36, leftSpire: 0.3, rightSpire: 0.3, accent });
}

/** Les tuiles vernissées de Bourgogne, en losanges de couleur */
let glazedTex: THREE.CanvasTexture | null = null;
function glazedTiles(): THREE.MeshStandardMaterial {
  if (!glazedTex) {
    const [c, ctx] = makeCanvas(128, 128);
    const colors = ["#c9962c", "#2f6b3f", "#8a3a22", "#2b2a28"];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = colors[(x + y) % 2 ? ((x - y + 16) % 4 < 2 ? 0 : 1) : (x + y) % 4 === 0 ? 2 : 3]!;
        ctx.beginPath();
        const cx = x * 16 + (y % 2 ? 8 : 0);
        const cy = y * 16 + 8;
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx + 8, cy);
        ctx.lineTo(cx, cy + 8);
        ctx.lineTo(cx - 8, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
    glazedTex = new THREE.CanvasTexture(c);
    glazedTex.colorSpace = THREE.SRGBColorSpace;
    glazedTex.wrapS = glazedTex.wrapT = THREE.RepeatWrapping;
    glazedTex.repeat.set(3, 3);
  }
  return new THREE.MeshStandardMaterial({ map: glazedTex, roughness: 0.35, metalness: 0.1, flatShading: true });
}

function dijon(accent: string): THREE.Group {
  // Le palais des Ducs : son toit de tuiles vernissées en losanges, et la tour Philippe-le-Bon
  const g = new THREE.Group();
  g.add(plinth(0.48, 0.44, accent, "#e6dcc4"));
  const look: FacadeLook = { wall: "#efe3c9", glass: "#3e5568", frame: "#dfd2b4", narrow: true, ashlar: true };
  const top = mat("#ded2b4");
  const body = facadeBox(0.34, 0.2, 0.2, look, top);
  body.position.set(-0.06, 0.018, 0.02);
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 0.2, 4, 1), glazedTiles());
  roof.geometry.rotateY(Math.PI / 4);
  roof.geometry.scale(0.36 / 2 / Math.SQRT1_2, 1, 0.22 / 2 / Math.SQRT1_2);
  roof.geometry.translate(0, 0.1, 0);
  roof.position.set(-0.06, 0.218, 0.02);
  g.add(roof);
  // La tour, et sa terrasse crénelée
  const tl: FacadeLook = { wall: "#e9dcc0", glass: "#2f3a44", frame: "#d6c8a8", narrow: true, ashlar: true };
  const tower = facadeBox(0.11, 0.56, 0.11, tl, top);
  tower.position.set(0.16, 0.018, -0.08);
  g.add(tower);
  const stone = mat("#e2d5b8", { rough: 0.85 });
  g.add(box(0.13, 0.025, 0.13, stone, 0.16, 0.578, -0.08));
  crenels(0.13, 0.13, 0.603, stone, g, 0.16, -0.08, 0.02);
  g.add(cyl(0.022, 0.022, 0.06, stone, 10, 0.2, 0.603, -0.04));
  g.add(cone(0.026, 0.05, mat(SLATE), 10, 0.2, 0.663, -0.04));
  g.add(pennant(accent, 0.13, 0.603, -0.11, 0.07));
  return g;
}

function rennes(accent: string): THREE.Group {
  // Le parlement de Bretagne : la longue façade classique, le haut toit d'ardoise, les ornements dorés
  const g = new THREE.Group();
  g.add(plinth(0.5, 0.4, accent, "#e2dccb"));
  const look: FacadeLook = { wall: "#ece4d0", glass: "#3e5568", frame: "#f6f1e4", ashlar: true };
  const top = mat("#d6cdb8");
  const body = facadeBox(0.46, 0.2, 0.24, look, top);
  body.position.set(0, 0.018, 0);
  g.add(body);
  // Le rez-de-chaussée en bossages, plus sombre
  g.add(box(0.47, 0.07, 0.245, mat("#d9cfb7", { rough: 0.9 }), 0, 0.018, 0));
  const roof = hipRoof(0.46, 0.24, 0.2, "#3f4852");
  roof.position.set(0, 0.218, 0);
  g.add(roof);
  const gold = mat(GOLD, { metal: 0.8, rough: 0.3 });
  g.add(box(0.2, 0.008, 0.012, gold, 0, 0.416, 0));
  for (const x of [-0.16, -0.05, 0.06, 0.17]) {
    g.add(box(0.05, 0.06, 0.05, mat("#f6f1e4"), x, 0.23, 0.08));
    const t = gableRoof(0.06, 0.055, 0.04, "#3f4852", 0.006);
    t.position.set(x, 0.29, 0.08);
    g.add(t);
  }
  // Le fronton du milieu
  const pediment = triangle(0.16, 0.05, 0.02, mat("#efe7d4", { flat: true }));
  pediment.position.set(0, 0.2, 0.125);
  g.add(pediment);
  for (const x of [-0.1, 0.1]) g.add(cyl(0.008, 0.012, 0.04, gold, 8, x, 0.4, 0));
  g.add(pennant(accent, 0, 0.42, 0, 0.08));
  return g;
}

function montpellier(accent: string): THREE.Group {
  // L'arc de triomphe du Peyrou, au bout de sa promenade, entre deux pins parasols
  const g = new THREE.Group();
  g.add(plinth(0.48, 0.44, accent, "#ede3cc"));
  const stone = mat("#ebdfc3", { rough: 0.75 });
  const arch = archWall(0.32, 0.3, 0.12, 0.12, 0.22, stone);
  arch.position.set(0, 0.018, 0);
  g.add(arch);
  g.add(box(0.35, 0.025, 0.14, mat("#e2d4b4"), 0, 0.318, 0));
  g.add(box(0.3, 0.07, 0.11, stone, 0, 0.343, 0));
  g.add(box(0.32, 0.015, 0.13, mat("#e2d4b4"), 0, 0.413, 0));
  // Les médaillons et les pilastres de la façade
  for (const x of [-0.11, 0.11]) {
    g.add(box(0.025, 0.28, 0.008, mat("#e2d4b4"), x, 0.03, 0.062));
    const m = cyl(0.025, 0.025, 0.006, mat("#d8c79e"), 14);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, 0.24, 0.066);
    g.add(m);
  }
  const trunk = mat("#8a6a48");
  const canopy = mat("#3f7a45", { flat: true, rough: 0.9 });
  for (const x of [-0.2, 0.2]) {
    g.add(cyl(0.01, 0.014, 0.22, trunk, 6, x, 0.018, 0.13));
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), canopy);
    c.scale.set(1, 0.45, 1);
    c.position.set(x, 0.25, 0.13);
    g.add(c);
  }
  g.add(pennant(accent, 0, 0.428, 0, 0.08));
  return g;
}

function strasbourg(accent: string): THREE.Group {
  // La cathédrale de Strasbourg : le grès rose, la grande rosace, une seule flèche (à gauche), si haute et si fine
  const g = new THREE.Group();
  g.add(plinth(0.48, 0.5, accent, "#d9b8a8"));
  const sandstone = "#c88a78";
  const look = gothic(sandstone, "#3b4f7a");
  const top = mat(mix(sandstone, "#000000", 0.15));
  const nave = facadeBox(0.2, 0.24, 0.34, look, top);
  nave.position.set(0, 0.018, -0.07);
  g.add(nave);
  const r = naveRoof(0.2, 0.34, 0.12, "#a24d38");
  r.position.set(0, 0.258, -0.07);
  g.add(r);
  const front = facadeBox(0.32, 0.4, 0.07, look, top);
  front.position.set(0, 0.018, 0.13);
  g.add(front);
  g.add(rose(0.065, 0, 0.27, 0.166));
  g.add(box(0.07, 0.1, 0.01, mat("#5a3a32"), 0, 0.018, 0.166));
  const stone = mat(sandstone, { rough: 0.8 });
  // La tour nord, octogonale, puis la flèche ajourée
  g.add(octo(0.06, 0.2, stone, -0.1, 0.418, 0.13));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(cyl(0.012, 0.012, 0.2, stone, 6, -0.1 + Math.cos(a) * 0.072, 0.418, 0.13 + Math.sin(a) * 0.072));
  }
  const spire = mat(mix(sandstone, "#000000", 0.08), { rough: 0.8 });
  for (let k = 0; k < 4; k++) g.add(octo(0.056 - k * 0.012, 0.07, spire, -0.1, 0.618 + k * 0.07, 0.13, 0.05 - k * 0.012));
  g.add(cone(0.012, 0.08, spire, 8, -0.1, 0.898, 0.13));
  // La terrasse de la tour sud, inachevée
  g.add(box(0.12, 0.02, 0.08, stone, 0.1, 0.418, 0.13));
  g.add(pennant(accent, -0.1, 0.978, 0.13, 0.06));
  return g;
}

function toulouse(accent: string): THREE.Group {
  // La basilique Saint-Sernin : la brique rose et son clocher octogonal à étages d'arcades
  const g = new THREE.Group();
  g.add(plinth(0.48, 0.5, accent, "#e2c9b8"));
  const brick = "#c9705a";
  const look: FacadeLook = { wall: brick, brick: true, glass: "#3e4f68", frame: "#ead8c6", narrow: true, arched: true };
  const top = mat(mix(brick, "#000000", 0.15));
  const nave = facadeBox(0.2, 0.2, 0.42, look, top);
  nave.position.set(0, 0.018, 0);
  g.add(nave);
  const r = naveRoof(0.2, 0.42, 0.08, "#c8683f");
  r.position.set(0, 0.218, 0);
  g.add(r);
  const transept = facadeBox(0.4, 0.18, 0.12, look, top);
  transept.position.set(0, 0.018, -0.04);
  g.add(transept);
  const r2 = gableRoof(0.4, 0.12, 0.07, "#c8683f", 0.01);
  r2.position.set(0, 0.198, -0.04);
  g.add(r2);
  // Le clocher : cinq étages octogonaux qui rétrécissent, puis la flèche
  const tlook: FacadeLook = { wall: brick, brick: true, glass: "#3a2d2a", frame: "#ead8c6", narrow: true, arched: true };
  let y = 0.24;
  for (let k = 0; k < 5; k++) {
    const rr = 0.085 - k * 0.011;
    const h = 0.085 - k * 0.006;
    const ringGeo = new THREE.CylinderGeometry(rr, rr, h, 8);
    // Une arcade par pan : la texture se répète huit fois autour
    const uv = ringGeo.attributes.uv as THREE.BufferAttribute;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) * 8, uv.getY(n));
    ringGeo.rotateY(Math.PI / 8);
    const ring = new THREE.Mesh(ringGeo, facadeLikeMat(tlook));
    ring.position.set(0, y + h / 2, -0.04);
    g.add(ring);
    g.add(octo(rr + 0.006, 0.008, mat("#ead8c6"), 0, y + h, -0.04));
    y += h + 0.008;
  }
  g.add(octo(0.034, 0.16, mat("#b7a99a", { rough: 0.7 }), 0, y, -0.04, 0.003));
  g.add(pennant(accent, 0, y + 0.16, -0.04, 0.06));
  return g;
}

/** Une matière de façade pour un cylindre (les fenêtres se répètent autour) */
function facadeLikeMat(look: FacadeLook): THREE.Material {
  const m = facadeBox(0.1, 0.1, 0.1, look, mat("#000000")).material as THREE.Material[];
  return m[0]!;
}

function nantes(accent: string): THREE.Group {
  // Le château des ducs de Bretagne : le tuffeau blanc, ses grosses tours rondes, et le grand logis aux lucarnes
  const g = new THREE.Group();
  g.add(plinth(0.5, 0.5, accent, "#e9e6dc"));
  const tuffeau = mat("#f0ece0", { rough: 0.85 });
  // Les courtines
  for (const [x, z, w, d] of [
    [0, 0.17, 0.32, 0.05],
    [0, -0.17, 0.32, 0.05],
    [-0.17, 0, 0.05, 0.32],
    [0.17, 0, 0.05, 0.32],
  ] as const) {
    g.add(box(w, 0.15, d, tuffeau, x, 0.018, z));
    crenels(w, d, 0.168, tuffeau, g, x, z, 0.02);
  }
  for (const [x, z] of [
    [-0.17, 0.17],
    [0.17, 0.17],
    [-0.17, -0.17],
    [0.17, -0.17],
  ] as const) {
    roundTower(0.065, 0.22, tuffeau, x, z, g, z < 0 ? "#465059" : undefined);
  }
  // Le grand logis, dans la cour
  const look: FacadeLook = { wall: "#f2eee2", glass: "#3e5568", frame: "#fbf9f2", ashlar: true };
  const logis = facadeBox(0.22, 0.2, 0.12, look, tuffeau);
  logis.position.set(0, 0.018, -0.02);
  g.add(logis);
  const roof = gableRoof(0.22, 0.12, 0.13, "#465059", 0.01);
  roof.position.set(0, 0.218, -0.02);
  g.add(roof);
  for (const x of [-0.06, 0.06]) {
    g.add(box(0.04, 0.09, 0.03, tuffeau, x, 0.218, 0.03));
    g.add(cone(0.028, 0.05, tuffeau, 4, x, 0.308, 0.03));
  }
  g.add(pennant(accent, 0, 0.35, -0.02, 0.06));
  return g;
}

function lille(accent: string): THREE.Group {
  // Le beffroi de Lille : la haute tour de brique aux chaînages de pierre, sa lanterne et sa flèche, au-dessus de l'hôtel de ville
  const g = new THREE.Group();
  g.add(plinth(0.48, 0.46, accent, "#ddd2c4"));
  const brick = "#a8513c";
  const look: FacadeLook = { wall: brick, brick: true, glass: "#2f3a44", frame: "#efe7d8", narrow: true };
  const top = mat(mix(brick, "#000000", 0.15));
  const hall = facadeBox(0.36, 0.17, 0.18, look, top);
  hall.position.set(-0.04, 0.018, 0.06);
  g.add(hall);
  const hr = gableRoof(0.36, 0.18, 0.09, "#3b424a", 0.01);
  hr.position.set(-0.04, 0.188, 0.06);
  g.add(hr);
  const tower = facadeBox(0.12, 0.62, 0.12, look, top);
  tower.position.set(0.12, 0.018, -0.1);
  g.add(tower);
  const stone = mat("#e9e1cf", { rough: 0.8 });
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) g.add(box(0.016, 0.62, 0.016, stone, 0.12 + dx * 0.057, 0.018, -0.1 + dz * 0.057));
  // La galerie, la lanterne, la flèche et sa couronne de clochetons
  g.add(box(0.15, 0.02, 0.15, stone, 0.12, 0.638, -0.1));
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) g.add(cone(0.014, 0.07, stone, 6, 0.12 + dx * 0.065, 0.658, -0.1 + dz * 0.065));
  g.add(octo(0.045, 0.08, stone, 0.12, 0.658, -0.1));
  g.add(cone(0.05, 0.16, mat("#3b424a", { flat: true }), 8, 0.12, 0.738, -0.1));
  g.add(clock(0.03, 0.12, 0.54, -0.039));
  g.add(pennant(accent, 0.12, 0.898, -0.1, 0.06));
  return g;
}

function bordeaux(accent: string): THREE.Group {
  // La Grosse Cloche : la porte entre ses deux tours rondes coiffées d'ardoise, la cloche dorée au sommet
  const g = new THREE.Group();
  g.add(plinth(0.46, 0.4, accent, "#e8dcc0"));
  const stone = mat("#e9dcbc", { rough: 0.8 });
  const gate = archWall(0.18, 0.3, 0.12, 0.08, 0.13, stone);
  gate.position.set(0, 0.018, 0);
  g.add(gate);
  g.add(clock(0.035, 0, 0.23, 0.062, "#f2e9cf"));
  for (const x of [-0.13, 0.13]) {
    g.add(cyl(0.065, 0.068, 0.32, stone, 16, x, 0.018, 0));
    g.add(cyl(0.07, 0.07, 0.02, mat("#ddd0b0"), 16, x, 0.338, 0));
    g.add(cone(0.072, 0.2, mat("#3b424a", { flat: true }), 16, x, 0.358, 0));
    g.add(cone(0.008, 0.04, mat(GOLD, { metal: 0.8 }), 6, x, 0.558, 0));
  }
  // Le beffroi de la cloche : deux montants, la cloche, un toit pointu
  g.add(box(0.12, 0.02, 0.1, stone, 0, 0.318, 0));
  for (const x of [-0.045, 0.045]) g.add(box(0.012, 0.12, 0.012, stone, x, 0.338, 0));
  const bell = new THREE.Mesh(
    new THREE.LatheGeometry(
      [0.034, 0.03, 0.022, 0.018, 0.014, 0.001].map((r, k) => new THREE.Vector2(r, k * 0.014)),
      14,
    ),
    mat(GOLD, { metal: 0.85, rough: 0.3 }),
  );
  bell.position.set(0, 0.36, 0);
  g.add(bell);
  g.add(cone(0.065, 0.1, mat("#3b424a", { flat: true }), 4, 0, 0.458, 0));
  g.add(pennant(accent, 0, 0.558, 0, 0.06));
  return g;
}

function lyon(accent: string): THREE.Group {
  // La basilique de Fourvière : le marbre blanc, ses quatre tours octogonales crénelées, la Vierge dorée de la chapelle
  const g = new THREE.Group();
  g.add(plinth(0.5, 0.46, accent, "#e9e6dc"));
  const white = "#f4f1ea";
  const look: FacadeLook = { wall: white, glass: "#3e5568", frame: "#e2ddd0", narrow: true, arched: true, ashlar: true };
  const top = mat("#e2ddd0");
  const body = facadeBox(0.3, 0.24, 0.26, look, top);
  body.position.set(-0.02, 0.018, 0);
  g.add(body);
  const r = naveRoof(0.24, 0.26, 0.08, "#b8b2a6");
  r.position.set(-0.02, 0.258, 0);
  g.add(r);
  const marble = mat(white, { rough: 0.55 });
  for (const [x, z] of [
    [-0.17, 0.13],
    [0.13, 0.13],
    [-0.17, -0.13],
    [0.13, -0.13],
  ] as const) {
    g.add(octo(0.045, 0.34, marble, x, 0.018, z));
    g.add(octo(0.052, 0.015, marble, x, 0.358, z));
    crenelRing(0.05, 0.373, marble, g, x, z, 8, 0.016);
  }
  // Le fronton et ses colonnes
  for (let k = 0; k < 4; k++) g.add(cyl(0.01, 0.01, 0.16, marble, 8, -0.08 + k * 0.04, 0.018, 0.145));
  g.add(box(0.18, 0.025, 0.04, marble, -0.02, 0.178, 0.145));
  // La chapelle et sa Vierge dorée
  g.add(box(0.06, 0.18, 0.06, marble, 0.2, 0.018, -0.02));
  g.add(dome(0.034, marble, 0.2, 0.198, -0.02));
  g.add(cyl(0.008, 0.016, 0.07, mat(GOLD, { metal: 0.85, rough: 0.3 }), 10, 0.2, 0.23, -0.02));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), mat(GOLD, { metal: 0.85, rough: 0.3 }));
  head.position.set(0.2, 0.307, -0.02);
  g.add(head);
  g.add(pennant(accent, -0.17, 0.39, 0.13, 0.06));
  return g;
}

/** La dentelle de fer de la tour Eiffel : des croisillons sur fond transparent, une arche au pied */
function ironLattice(arch: boolean): THREE.MeshStandardMaterial {
  const [c, ctx] = makeCanvas(128, 256);
  ctx.clearRect(0, 0, 128, 256);
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "square";
  // Les montants, sur les bords
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.lineTo(4, 256);
  ctx.moveTo(124, 0);
  ctx.lineTo(124, 256);
  ctx.stroke();
  // Les croisillons
  ctx.lineWidth = 4;
  const rows = 8;
  for (let k = 0; k < rows; k++) {
    const y0 = (k * 256) / rows;
    const y1 = ((k + 1) * 256) / rows;
    if (arch && y0 > 150) continue;
    ctx.beginPath();
    ctx.moveTo(4, y0);
    ctx.lineTo(124, y1);
    ctx.moveTo(124, y0);
    ctx.lineTo(4, y1);
    ctx.moveTo(4, y0);
    ctx.lineTo(124, y0);
    ctx.stroke();
  }
  if (arch) {
    // L'arche du pied, entre les deux montants
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(64, 256, 60, 100, 0, Math.PI, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return new THREE.MeshStandardMaterial({
    color: "#8a5f3e",
    map: tex,
    alphaTest: 0.5,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.55,
    metalness: 0.35,
  });
}

let eiffelMats: { arch: THREE.MeshStandardMaterial; plain: THREE.MeshStandardMaterial } | null = null;

/** Un tronc de pyramide à quatre faces ajourées (une section de la tour), de la base (demi-côté a) au sommet (b) */
function frustum(a: number, b: number, h: number, m: THREE.Material, y: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(b * Math.SQRT2, a * Math.SQRT2, h, 4, 1, true);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, y + h / 2, 0);
  return new THREE.Mesh(geo, m);
}

function paris(accent: string): THREE.Group {
  // La tour Eiffel : quatre piliers arqués, deux plateformes, la flèche, toute en dentelle de fer
  const g = new THREE.Group();
  g.add(plinth(0.5, 0.5, accent, "#cfd8b8"));
  // Le Champ-de-Mars : deux pelouses
  g.add(box(0.44, 0.006, 0.12, mat("#7fb05a", { rough: 1 }), 0, 0.018, 0.17));
  eiffelMats ??= { arch: ironLattice(true), plain: ironLattice(false) };
  const iron = mat("#7d5638", { rough: 0.5, metal: 0.4 });
  g.add(frustum(0.2, 0.115, 0.26, eiffelMats.arch, 0.024));
  // Les quatre pieds massifs
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) g.add(box(0.05, 0.04, 0.05, iron, dx * 0.185, 0.018, dz * 0.185));
  // Première plateforme
  g.add(box(0.27, 0.03, 0.27, iron, 0, 0.284, 0));
  g.add(box(0.28, 0.008, 0.28, mat(accent, { rough: 0.5 }), 0, 0.314, 0));
  g.add(frustum(0.105, 0.065, 0.24, eiffelMats.plain, 0.322));
  // Deuxième plateforme
  g.add(box(0.15, 0.022, 0.15, iron, 0, 0.562, 0));
  g.add(frustum(0.055, 0.016, 0.52, eiffelMats.plain, 0.584));
  // Le sommet, le campanile, l'antenne
  g.add(box(0.045, 0.03, 0.045, iron, 0, 1.104, 0));
  g.add(cyl(0.012, 0.016, 0.04, iron, 8, 0, 1.134, 0));
  g.add(cyl(0.003, 0.004, 0.09, mat("#d6d9dc", { metal: 0.7, rough: 0.3 }), 6, 0, 1.174, 0));
  g.add(pennant(accent, 0, 1.264, 0, 0.04));
  return g;
}

const BUILDERS: Record<number, (accent: string) => THREE.Group> = {
  1: gueret,
  3: aurillac,
  6: mende,
  8: vesoul,
  9: foix,
  11: perigueux,
  13: auxerre,
  14: chartres,
  16: limoges,
  18: brest,
  19: poitiers,
  21: clermont,
  23: dijon,
  24: rennes,
  26: montpellier,
  27: strasbourg,
  29: toulouse,
  31: nantes,
  32: lille,
  34: bordeaux,
  37: lyon,
  39: paris,
};

/** Le monument d'une ville (le niveau 5 de sa rue), au couleur de son propriétaire */
export function landmark(index: number, accent: string): THREE.Group {
  const make = BUILDERS[index] ?? paris;
  return bake(shadowed(make(accent)));
}

/** Un gratte-ciel Art déco, pour la carte de l'album (il n'est plus sur le plateau) */
export function skyscraper(accent: string): THREE.Group {
  const g = new THREE.Group();
  const look: FacadeLook = { wall: "#e9e2d2", glass: "#4f7fae", frame: "#d8cfbb", narrow: true };
  const top = mat("#cfc6b2");
  g.add(plinth(0.5, 0.5, accent, "#d8d2c4"));
  const tiers: [number, number][] = [
    [0.36, 0.4],
    [0.28, 0.3],
    [0.2, 0.22],
    [0.13, 0.14],
  ];
  let y = 0.018;
  for (const [w, h] of tiers) {
    const t = facadeBox(w, h, w, look, top);
    t.position.y = y;
    g.add(t);
    // Les pilastres d'angle, dorés au dernier étage
    for (const dx of [-1, 1])
      for (const dz of [-1, 1]) g.add(box(0.014, h, 0.014, mat(w < 0.15 ? GOLD : "#d8cfbb"), (dx * w) / 2, y, (dz * w) / 2));
    y += h;
    g.add(box(w + 0.012, 0.012, w + 0.012, mat(accent, { rough: 0.45 }), 0, y - 0.012, 0));
  }
  g.add(cone(0.05, 0.14, mat(GOLD, { metal: 0.8, rough: 0.3 }), 8, 0, y, 0));
  g.add(cyl(0.003, 0.004, 0.16, mat("#d6d9dc", { metal: 0.7 }), 6, 0, y + 0.14, 0));
  return bake(shadowed(g));
}
