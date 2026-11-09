// Les objets de Bolides, sculptés une seule fois : ce sont les mêmes formes qui servent pour l'image dans la case, pour
// l'objet que le pilote transporte, et pour ce qui file sur la route. On reconnaît ainsi tout de suite ce qu'on voit.
// Des jouets dodus, aux couleurs franches, cernés d'un trait sombre qui les détache du décor. Chaque modèle tient dans
// un cube d'environ 1 de côté, centré ; il regarde vers +z (le sens où il part quand on le lance).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ItemKind } from "../../../shared/games/bolides/items.ts";

type Keep = <T extends { dispose: () => void }>(x: T) => T;
type Finish = "plastic" | "metal" | "glow";
type Vec3 = readonly [number, number, number];

interface PartOptions {
  /** Une couleur, ou une couleur selon l'endroit (dans le repère du morceau, avant de le placer) */
  color: number | ((x: number, y: number, z: number) => number);
  at?: Vec3;
  rot?: Vec3;
  scale?: number | Vec3;
  finish?: Finish;
}

const TAU = Math.PI * 2;
const INK = 0x17121f;
const tmpColor = new THREE.Color();

/** Un profil tourné autour de l'axe y, lissé (les points vont du bas vers le haut) */
function lathe(points: [number, number][], segments: number, sharp = false): THREE.BufferGeometry {
  const v = points.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(sharp ? v : new THREE.SplineCurve(v).getPoints(Math.max(18, points.length * 5)), segments);
}

function extrude(shape: THREE.Shape, depth: number, bevel = 0.022, curve = 6): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    steps: 1,
    curveSegments: curve,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function tube(points: Vec3[], radius: number, segments: number, radial = 8): THREE.BufferGeometry {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))),
    segments,
    radius,
    radial,
  );
}

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private radius: number,
    private height: number,
    private turns: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * this.turns * TAU;
    return target.set(Math.cos(a) * this.radius, (t - 0.5) * this.height, Math.sin(a) * this.radius);
  }
}

/** L'éclair : la forme qui signe la vitesse et l'orage */
function boltShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.12 * w, 0.5 * h);
  s.lineTo(-0.42 * w, -0.06 * h);
  s.lineTo(-0.04 * w, -0.06 * h);
  s.lineTo(-0.16 * w, -0.5 * h);
  s.lineTo(0.42 * w, 0.12 * h);
  s.lineTo(0.04 * w, 0.12 * h);
  s.lineTo(0.3 * w, 0.5 * h);
  s.closePath();
  return s;
}

/** Une flèche vers le haut */
function arrowShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5 * h);
  s.lineTo(0.5 * w, 0);
  s.lineTo(0.2 * w, 0);
  s.lineTo(0.2 * w, -0.5 * h);
  s.lineTo(-0.2 * w, -0.5 * h);
  s.lineTo(-0.2 * w, 0);
  s.lineTo(-0.5 * w, 0);
  s.closePath();
  return s;
}

/** Un écusson : `grow` l'élargit de tous les côtés (pour la bordure) */
function crest(grow = 0): THREE.Shape {
  const w = 0.4 + grow;
  const top = 0.44 + grow;
  const low = -0.5 - grow * 1.2;
  const s = new THREE.Shape();
  s.moveTo(0, top + 0.07);
  s.quadraticCurveTo(w * 0.55, top + 0.02, w, top - 0.04);
  s.bezierCurveTo(w + 0.03, 0.02, w * 0.9, -0.28, 0, low);
  s.bezierCurveTo(-w * 0.9, -0.28, -w - 0.03, 0.02, -w, top - 0.04);
  s.quadraticCurveTo(-w * 0.55, top + 0.02, 0, top + 0.07);
  return s;
}

/** Ce qu'on assemble pour un objet : les morceaux, rangés par matière, avec leur couleur peinte dans la forme */
class Sculpt {
  readonly parts: Record<Finish, THREE.BufferGeometry[]> = { plastic: [], metal: [], glow: [] };
  /** Là où l'on visse les morceaux suivants (une bouteille dans un trio, par exemple) */
  frame = new THREE.Matrix4();

  constructor(readonly detail: 1 | 2) {}

  /** Un nombre de segments, plus fin pour les images que pour la course */
  seg(n: number) {
    return n * this.detail;
  }

  add(source: THREE.BufferGeometry, o: PartOptions) {
    const geo = source.index ? source.toNonIndexed() : source;
    if (geo !== source) source.dispose();
    for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
    geo.clearGroups();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      tmpColor.setHex(typeof o.color === "number" ? o.color : o.color(pos.getX(i), pos.getY(i), pos.getZ(i)));
      colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const scale = typeof o.scale === "number" ? ([o.scale, o.scale, o.scale] as const) : (o.scale ?? ([1, 1, 1] as const));
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(o.at ?? ([0, 0, 0] as const))),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? ([0, 0, 0] as const)))),
      new THREE.Vector3(...scale),
    );
    geo.applyMatrix4(this.frame.clone().multiply(m));
    this.parts[o.finish ?? "plastic"].push(geo);
  }

  ball(r: number, o: PartOptions, across = 16, up = 12) {
    this.add(new THREE.SphereGeometry(r, this.seg(across), this.seg(up)), o);
  }

  /** Une série de morceaux placés autrement que le reste */
  within(at: Vec3, rot: Vec3, scale: number, build: () => void) {
    const before = this.frame;
    this.frame = before
      .clone()
      .multiply(
        new THREE.Matrix4().compose(
          new THREE.Vector3(...at),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
          new THREE.Vector3(scale, scale, scale),
        ),
      );
    build();
    this.frame = before;
  }
}

/** Une étincelle : une bille vive et ses pointes (au bout des mèches) */
function spark(s: Sculpt, at: Vec3, size = 1) {
  s.ball(0.05 * size, { color: 0xfffbe0, at, finish: "glow" }, 8, 6);
  s.ball(0.085 * size, { color: 0xffc83a, at, finish: "glow", scale: 0.92 }, 8, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    s.add(new THREE.ConeGeometry(0.035 * size, i % 2 ? 0.16 * size : 0.24 * size, 5), {
      color: i % 2 ? 0xff8a1f : 0xffd84a,
      at: [at[0] + Math.cos(a) * 0.1 * size, at[1] + Math.sin(a) * 0.1 * size, at[2]],
      rot: [0, 0, a - Math.PI / 2],
      finish: "glow",
    });
  }
}

/** Une flamme de réacteur, pointée vers le bas */
function flame(s: Sculpt, y: number, r: number, h: number) {
  s.add(new THREE.ConeGeometry(r, h, s.seg(10)), { color: 0xff7a18, at: [0, y - h / 2, 0], rot: [Math.PI, 0, 0], finish: "glow" });
  s.add(new THREE.ConeGeometry(r * 0.62, h * 0.66, s.seg(10)), {
    color: 0xffd84a,
    at: [0, y - h * 0.3, 0],
    rot: [Math.PI, 0, 0],
    finish: "glow",
    scale: [1, 1, 1],
  });
}

/** La bouteille de nitro : bien ronde, cerclée d'orange, un éclair sur le ventre, sa flamme en dessous */
function tank(s: Sculpt) {
  const cyan = 0x12c4ff;
  s.add(
    lathe(
      [
        [0.001, -0.38],
        [0.18, -0.38],
        [0.28, -0.29],
        [0.3, -0.1],
        [0.3, 0.16],
        [0.25, 0.3],
        [0.13, 0.37],
        [0.001, 0.39],
      ],
      s.seg(18),
    ),
    { color: cyan },
  );
  for (const y of [0.17, -0.22])
    s.add(new THREE.TorusGeometry(0.297, 0.038, 8, s.seg(22)), { color: 0xff7a18, at: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
  s.add(new THREE.CylinderGeometry(0.075, 0.1, 0.09, s.seg(10)), { color: 0xcfd6df, at: [0, 0.43, 0], finish: "metal" });
  s.add(new THREE.CylinderGeometry(0.14, 0.14, 0.075, s.seg(14)), { color: 0xe23028, at: [0, 0.5, 0] });
  s.add(new THREE.CylinderGeometry(0.13, 0.075, 0.13, s.seg(12)), { color: 0xaab2bd, at: [0, -0.44, 0], finish: "metal" });
  s.add(extrude(boltShape(0.3, 0.42), 0.03, 0.012, 2), { color: 0xffe14a, at: [0, -0.02, 0.3] });
  flame(s, -0.49, 0.13, 0.27);
}

/** Une quille de bowling, avec ses rayures rouges */
function pin(s: Sculpt) {
  s.add(
    lathe(
      [
        [0.001, -0.42],
        [0.11, -0.41],
        [0.16, -0.22],
        [0.12, -0.02],
        [0.065, 0.12],
        [0.075, 0.22],
        [0.09, 0.31],
        [0.05, 0.4],
        [0.001, 0.42],
      ],
      s.seg(14),
    ),
    { color: (_x, y) => (y > 0.08 && y < 0.15 ? 0xe6302a : 0xfdfaf2) },
  );
}

const SCULPTORS: Record<ItemKind | "quille", (s: Sculpt, icon: boolean) => void> = {
  quille(s) {
    pin(s);
  },

  turbo(s) {
    tank(s);
  },

  turbo3(s) {
    s.within([-0.33, -0.08, -0.08], [0, 0.1, 0.34], 0.7, () => tank(s));
    s.within([0.33, -0.08, -0.08], [0, -0.1, -0.34], 0.7, () => tank(s));
    s.within([0, 0.04, 0.1], [0, 0, 0], 0.84, () => tank(s));
  },

  // La burette : une silhouette qu'on ne confond pas avec une goutte d'eau
  huile(s, icon) {
    const tin = 0xf9b418;
    s.add(
      lathe(
        [
          [0.001, -0.4],
          [0.31, -0.4],
          [0.355, -0.34],
          [0.29, -0.14],
          [0.15, 0.08],
          [0.075, 0.2],
          [0.06, 0.28],
          [0.001, 0.3],
        ],
        s.seg(16),
      ),
      { color: tin },
    );
    s.add(new THREE.TorusGeometry(0.34, 0.035, 8, s.seg(20)), { color: 0x22202a, at: [0, -0.33, 0], rot: [Math.PI / 2, 0, 0] });
    s.add(new THREE.TorusGeometry(0.262, 0.03, 8, s.seg(20)), { color: 0xe23028, at: [0, -0.2, 0], rot: [Math.PI / 2, 0, 0] });
    s.add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, s.seg(10)), { color: 0xcfd6df, at: [0, 0.3, 0], finish: "metal" });
    s.add(
      tube(
        [
          [0.1, 0.0, 0],
          [0.24, 0.13, 0],
          [0.4, 0.34, 0],
          [0.55, 0.47, 0],
        ],
        0.038,
        s.seg(12),
      ),
      { color: 0xcfd6df, finish: "metal" },
    );
    s.add(new THREE.TorusGeometry(0.19, 0.04, 8, s.seg(14), Math.PI), {
      color: 0xe23028,
      at: [-0.26, -0.02, 0],
      rot: [0, 0, Math.PI * 0.62],
    });
    // La goutte noire, avec son reflet
    s.ball(0.075, { color: 0x14101c, at: [0.6, 0.31, 0], scale: [0.85, 1.25, 0.85] }, 10, 8);
    s.ball(0.021, { color: 0xeaf6ff, at: [0.585, 0.335, 0.056], finish: "glow" }, 6, 4);
    if (icon) {
      s.add(
        lathe(
          [
            [0.001, 0.035],
            [0.4, 0.03],
            [0.5, 0],
            [0.001, -0.01],
          ].reverse() as [number, number][],
          s.seg(18),
        ),
        {
          color: 0x1c1626,
          at: [0.2, -0.45, 0.04],
          scale: [1.08, 1, 0.7],
        },
      );
    }
  },

  petard(s) {
    const stick = (color: number, y: number, h: number, r = 0.17) =>
      s.add(new THREE.CylinderGeometry(r, r, h, s.seg(14)), { color, at: [0, y, 0] });
    stick(0xe6302a, 0.21, 0.34);
    stick(0xfff0d0, -0.015, 0.11);
    stick(0xe6302a, -0.2, 0.26);
    s.add(
      lathe(
        [
          [0.001, 0.05],
          [0.17, 0.04],
          [0.195, 0],
          [0.17, -0.04],
          [0.001, -0.05],
        ].reverse() as [number, number][],
        s.seg(14),
      ),
      {
        color: 0xffc62e,
        at: [0, 0.385, 0],
      },
    );
    s.add(
      lathe(
        [
          [0.001, 0.05],
          [0.17, 0.04],
          [0.195, 0],
          [0.17, -0.04],
          [0.001, -0.05],
        ].reverse() as [number, number][],
        s.seg(14),
      ),
      {
        color: 0xffc62e,
        at: [0, -0.345, 0],
      },
    );
    s.add(
      tube(
        [
          [0, 0.42, 0],
          [0.015, 0.52, 0.01],
          [0.1, 0.6, 0],
          [0.2, 0.61, 0],
        ],
        0.024,
        s.seg(8),
        6,
      ),
      { color: 0x4a3a2a },
    );
    spark(s, [0.23, 0.62, 0]);
  },

  bouclier(s) {
    s.add(extrude(crest(0.06), 0.1, 0.03, 10), { color: 0xffc62e, at: [0, 0, -0.03] });
    s.add(extrude(crest(), 0.1, 0.02, 10), { color: 0x2276ff, at: [0, 0, 0.035] });
    // La moitié claire, comme un blason
    const half = new THREE.Shape();
    half.moveTo(0, 0.5);
    half.quadraticCurveTo(0.22, 0.46, 0.39, 0.4);
    half.bezierCurveTo(0.42, 0.02, 0.35, -0.27, 0, -0.48);
    half.closePath();
    s.add(extrude(half, 0.04, 0.008, 10), { color: 0x6ab6ff, at: [0, 0, 0.1] });
    s.add(
      lathe(
        [
          [0.001, 0.07],
          [0.09, 0.055],
          [0.15, 0.02],
          [0.16, 0],
          [0.001, -0.01],
        ].reverse() as [number, number][],
        s.seg(14),
      ),
      {
        color: 0xffd84a,
        at: [0, 0.02, 0.14],
        rot: [Math.PI / 2, 0, 0],
      },
    );
  },

  // La trompe à poire : un cuivre et une poire rouge, pouet pouet
  klaxon(s) {
    s.within([0.02, 0.03, 0], [0, 0, -Math.PI / 2], 1, () => {
      s.add(
        lathe(
          [
            [0.05, -0.36],
            [0.052, -0.14],
            [0.075, 0.06],
            [0.14, 0.24],
            [0.33, 0.42],
          ],
          s.seg(18),
        ),
        { color: 0xffc32e, finish: "metal" },
      );
      s.add(new THREE.TorusGeometry(0.33, 0.032, 8, s.seg(24)), {
        color: 0xffe17a,
        at: [0, 0.42, 0],
        rot: [Math.PI / 2, 0, 0],
        finish: "metal",
      });
      s.add(new THREE.CircleGeometry(0.32, s.seg(20)), { color: 0x4a2a10, at: [0, 0.36, 0], rot: [-Math.PI / 2, 0, 0] });
      s.add(new THREE.CylinderGeometry(0.075, 0.075, 0.07, s.seg(12)), { color: 0xe6302a, at: [0, -0.36, 0] });
    });
    s.ball(0.2, { color: 0xe6302a, at: [-0.5, 0.03, 0], scale: [1.15, 1, 1] });
  },

  fusee(s) {
    s.within([0, 0.03, 0], [0, 0, 0], 1, () => {
      s.add(
        lathe(
          [
            [0.15, -0.4],
            [0.25, -0.26],
            [0.29, -0.06],
            [0.27, 0.1],
            [0.235, 0.17],
          ],
          s.seg(18),
        ),
        { color: 0xfaf6ec },
      );
      s.add(
        lathe(
          [
            [0.24, 0.16],
            [0.2, 0.28],
            [0.11, 0.44],
            [0.04, 0.53],
            [0.001, 0.56],
          ],
          s.seg(18),
        ),
        { color: 0xe6302a },
      );
      s.add(new THREE.TorusGeometry(0.244, 0.024, 8, s.seg(20)), { color: 0xffc62e, at: [0, 0.165, 0], rot: [Math.PI / 2, 0, 0] });
      for (let i = 0; i < 3; i++) {
        const fin = new THREE.Shape();
        fin.moveTo(0, 0.14);
        fin.quadraticCurveTo(0.17, 0.02, 0.27, -0.26);
        fin.lineTo(0.1, -0.14);
        fin.lineTo(0, -0.17);
        fin.closePath();
        // Aucun aileron devant le hublot
        const a = (i / 3) * TAU + Math.PI;
        s.add(extrude(fin, 0.04, 0.012, 6), {
          color: 0xe6302a,
          at: [Math.sin(a) * 0.24, -0.27, Math.cos(a) * 0.24],
          rot: [0, a - Math.PI / 2, 0],
        });
      }
      s.add(new THREE.TorusGeometry(0.105, 0.03, 8, s.seg(16)), { color: 0xcfd6df, at: [0, 0.02, 0.27], finish: "metal" });
      s.ball(0.095, { color: 0x4cc7ff, at: [0, 0.02, 0.25] }, 12, 8);
      s.ball(0.03, { color: 0xffffff, at: [-0.03, 0.05, 0.335], finish: "glow" }, 6, 4);
      s.add(new THREE.CylinderGeometry(0.15, 0.1, 0.11, s.seg(12)), { color: 0x8e96a2, at: [0, -0.45, 0], finish: "metal" });
      flame(s, -0.5, 0.13, 0.3);
    });
  },

  // Un arc de cinq couleurs, posé sur ses deux nuages
  arc(s) {
    const bands = [0xf0343c, 0xff8a1f, 0xffd93a, 0x35c75a, 0x2b8cff];
    bands.forEach((color, i) => {
      s.add(new THREE.TorusGeometry(0.47 - i * 0.078, 0.046, 8, s.seg(26), Math.PI), { color, at: [0, -0.2, 0] });
    });
    const puffs: [number, number, number, number][] = [
      [0, 0, 0.09, 0.14],
      [-0.12, -0.03, 0.05, 0.12],
      [0.13, -0.03, 0.05, 0.13],
      [0.02, 0.07, 0, 0.11],
      [0.02, -0.04, -0.06, 0.13],
    ];
    for (const side of [-1, 1])
      for (const [x, y, z, r] of puffs) s.ball(r, { color: 0xfdfcff, at: [side * 0.31 + x, -0.27 + y, z] }, 12, 8);
  },

  bowling(s, icon) {
    const marble = (x: number, y: number, z: number) => {
      const u = Math.sin(x * 8.5 + Math.sin(y * 7) * 2.3) + Math.sin(z * 7.5 + Math.sin(x * 6.5) * 2.1) * 0.8;
      return u > 0.95 ? 0xd65cff : u > 0.32 ? 0x6d33ec : u > -0.5 ? 0x3a22d2 : 0x24169a;
    };
    const at: Vec3 = icon ? [-0.1, -0.05, 0] : [0, 0, 0];
    s.ball(0.44, { color: marble, at }, 26, 20);
    for (const [x, y] of [
      [-0.11, 0.17],
      [0.11, 0.17],
      [0, -0.03],
    ] as const) {
      const z = Math.sqrt(Math.max(0, 0.44 * 0.44 - x * x - y * y));
      s.ball(0.062, { color: 0x07040f, at: [at[0] + x, at[1] + y, at[2] + z - 0.012], scale: [1, 1, 0.6] }, 10, 8);
    }
    if (icon) {
      // Une quille qui s'envole, pour qu'on ne la prenne pas pour une planète
      s.within([0.4, 0.2, -0.1], [0.2, 0.2, -0.5], 0.92, () => pin(s));
    }
  },

  tarte(s) {
    const gold = 0xe0a04e;
    s.add(
      lathe(
        [
          [0.001, -0.25],
          [0.4, -0.25],
          [0.5, -0.14],
          [0.54, -0.05],
          [0.47, -0.02],
          [0.001, -0.02],
        ],
        s.seg(20),
        true,
      ),
      { color: (_x, y) => (y < -0.19 ? 0xb9772e : gold) },
    );
    const n = s.detail === 2 ? 22 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      s.ball(0.075, { color: 0xeab063, at: [Math.cos(a) * 0.5, -0.04, Math.sin(a) * 0.5], scale: [1, 0.72, 1] }, 8, 6);
    }
    s.add(
      lathe(
        [
          [0.47, -0.03],
          [0.44, 0.07],
          [0.33, 0.17],
          [0.16, 0.25],
          [0.001, 0.28],
        ],
        s.seg(20),
      ),
      { color: 0xfffaf0 },
    );
    // Les rosaces de crème, et la cerise
    const m = s.detail === 2 ? 11 : 8;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU + 0.2;
      s.ball(0.082, { color: 0xfff4e0, at: [Math.cos(a) * 0.34, 0.14, Math.sin(a) * 0.34] }, 8, 6);
    }
    s.add(new THREE.TorusGeometry(0.11, 0.058, 8, s.seg(14)), { color: 0xfffaf0, at: [0, 0.3, 0], rot: [Math.PI / 2, 0, 0] });
    s.ball(0.1, { color: 0xe01b34, at: [0, 0.42, 0] }, 12, 10);
    s.ball(0.024, { color: 0xffffff, at: [-0.03, 0.47, 0.07], finish: "glow" }, 6, 4);
    s.add(
      tube(
        [
          [0, 0.5, 0],
          [0.04, 0.58, 0],
          [0.12, 0.62, 0],
        ],
        0.014,
        s.seg(6),
        5,
      ),
      { color: 0x2d7a33 },
    );
  },

  ressort(s) {
    s.add(new THREE.TubeGeometry(new Helix(0.27, 0.62, 4.5), s.seg(70), 0.058, 8), { color: 0xdbe2ea, finish: "metal" });
    s.add(
      lathe(
        [
          [0.001, 0.06],
          [0.33, 0.06],
          [0.39, 0.02],
          [0.39, -0.03],
          [0.33, -0.06],
          [0.001, -0.06],
        ].reverse() as [number, number][],
        s.seg(20),
        true,
      ),
      {
        color: 0x3a3f4a,
        at: [0, -0.41, 0],
      },
    );
    s.add(
      lathe(
        [
          [0.001, -0.07],
          [0.34, -0.07],
          [0.4, -0.03],
          [0.38, 0.03],
          [0.22, 0.09],
          [0.001, 0.11],
        ],
        s.seg(20),
      ),
      { color: 0xe6302a, at: [0, 0.38, 0] },
    );
    s.add(extrude(arrowShape(0.22, 0.2), 0.03, 0.01, 2), {
      color: 0xffe14a,
      at: [0, 0.385, 0.385],
      rot: [-0.05, 0, 0],
      scale: [1, 0.46, 1],
    });
  },

  geant(s) {
    // Le liquide, le verre au-dessus, le bouchon : tout est plein, pour rester lisible de loin
    s.add(
      lathe(
        [
          [0.001, -0.46],
          [0.26, -0.44],
          [0.42, -0.28],
          [0.46, -0.1],
          [0.41, 0.06],
          [0.34, 0.12],
          [0.001, 0.13],
        ],
        s.seg(20),
      ),
      { color: (_x, y) => (y > 0.1 ? 0xd287ff : 0x9326f0) },
    );
    s.add(
      lathe(
        [
          [0.35, 0.1],
          [0.26, 0.2],
          [0.145, 0.27],
          [0.125, 0.36],
          [0.135, 0.42],
        ],
        s.seg(18),
      ),
      { color: 0xe9dcff },
    );
    s.add(new THREE.TorusGeometry(0.135, 0.028, 8, s.seg(16)), { color: 0xf6efff, at: [0, 0.42, 0], rot: [Math.PI / 2, 0, 0] });
    s.add(new THREE.CylinderGeometry(0.135, 0.105, 0.16, s.seg(14)), { color: 0xb9823f, at: [0, 0.5, 0] });
    for (const [x, y, z, r] of [
      [-0.2, -0.22, 0.33, 0.058],
      [0.17, -0.02, 0.36, 0.04],
      [0.27, -0.27, 0.27, 0.03],
    ] as const)
      s.ball(r, { color: 0xeeb9ff, at: [x, y, z] }, 8, 6);
    s.ball(0.032, { color: 0xffffff, at: [-0.27, 0.0, 0.33], scale: [0.8, 1.7, 0.6], finish: "glow" }, 8, 6);
    s.add(extrude(arrowShape(0.32, 0.34), 0.03, 0.012, 2), { color: 0xffd93a, at: [0.02, -0.15, 0.43], rot: [-0.05, 0, 0] });
  },

  orage(s) {
    const shade = (_x: number, y: number) => (y > 0.03 ? 0x8290a8 : y > -0.05 ? 0x5e6a82 : 0x3e4860);
    const clouds: [number, number, number, number][] = [
      [0, 0.16, 0, 0.24],
      [-0.25, 0.08, 0.02, 0.19],
      [0.26, 0.09, 0.02, 0.2],
      [-0.1, 0.27, -0.04, 0.17],
      [0.13, 0.28, -0.03, 0.15],
      [-0.42, 0.01, 0, 0.12],
      [0.43, 0.02, 0, 0.13],
      [0, 0.04, 0.14, 0.18],
    ];
    for (const [x, y, z, r] of clouds) s.ball(r, { color: shade, at: [x, y, z] }, 12, 10);
    s.add(extrude(boltShape(0.42, 0.68), 0.05, 0.012, 2), { color: 0xffdf34, at: [0.0, -0.26, 0.2], rot: [0, 0, -0.08], finish: "glow" });
    for (const [x, y] of [
      [-0.3, -0.22],
      [0.32, -0.26],
    ] as const)
      s.ball(0.048, { color: 0x53c1ff, at: [x, y, 0.1], scale: [0.8, 1.5, 0.8] }, 8, 6);
  },

  aimant(s, icon) {
    const R = 0.44;
    const r = 0.2;
    const shape = new THREE.Shape();
    shape.moveTo(-R, 0.36);
    shape.lineTo(-R, -0.06);
    shape.absarc(0, -0.06, R, Math.PI, TAU, false);
    shape.lineTo(R, 0.36);
    shape.lineTo(r, 0.36);
    shape.lineTo(r, -0.06);
    shape.absarc(0, -0.06, r, 0, Math.PI, true);
    shape.lineTo(-R, 0.36);
    s.add(extrude(shape, 0.2, 0.03, 16), { color: 0xe6302a });
    for (const side of [-1, 1]) {
      const tip = new THREE.BoxGeometry(0.27, 0.15, 0.27);
      s.add(tip, { color: 0xeef2f6, at: [side * (R + r) * 0.5, 0.44, 0], finish: "metal" });
    }
    if (icon) {
      // Deux pièces qu'il attire
      for (const [x, y, rz] of [
        [-0.1, 0.76, 0.5],
        [0.13, 0.6, -0.4],
      ] as const)
        s.add(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 16), {
          color: 0xffcf2e,
          at: [x, y, 0.08],
          rot: [Math.PI / 2, 0, rz],
          finish: "metal",
        });
    }
  },

  bombe(s) {
    s.ball(0.42, { color: 0x262938, at: [0, -0.08, 0] }, 22, 16);
    // Le ruban jaune et noir, qui la distingue d'une boule
    const n = 16;
    for (let i = 0; i < n; i++) {
      const arc = (TAU / n) * 1.04;
      s.add(new THREE.TorusGeometry(0.41, 0.052, 6, s.seg(3), arc), {
        color: i % 2 ? 0x17141f : 0xffcd2e,
        at: [0, -0.08, 0],
        rot: [Math.PI / 2 - 0.42, 0, (i / n) * TAU],
      });
    }
    s.add(new THREE.CylinderGeometry(0.14, 0.17, 0.14, s.seg(14)), {
      color: 0xcfd6df,
      at: [0.1, 0.33, 0],
      rot: [0, 0, -0.26],
      finish: "metal",
    });
    s.add(
      tube(
        [
          [0.14, 0.38, 0],
          [0.2, 0.5, 0],
          [0.3, 0.55, 0],
          [0.37, 0.53, 0],
        ],
        0.026,
        s.seg(8),
        6,
      ),
      { color: 0xd8c08a },
    );
    spark(s, [0.4, 0.55, 0], 1.15);
  },
};

/** Un exemplaire d'objet : sa racine, et ce qui, dans le modèle, brille */
export interface ItemModel {
  root: THREE.Group;
  glow: THREE.Mesh | null;
}

/** La matière du trait : la forme regonflée le long de ses normales, vue de l'intérieur */
function outlineMaterial(width: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `vec3 transformed = position + normal * ${width.toFixed(4)};`,
    );
  };
  mat.customProgramCacheKey = () => `bolides-outline-${width.toFixed(4)}`;
  return mat;
}

/** Une copie de la forme aux normales moyennées : le trait reste fermé, même sur les arêtes vives */
function smoothed(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const pos = source.attributes.position as THREE.BufferAttribute;
  const nor = source.attributes.normal as THREE.BufferAttribute;
  const sum = new Map<string, [number, number, number]>();
  const key = (i: number) => `${Math.round(pos.getX(i) * 400)},${Math.round(pos.getY(i) * 400)},${Math.round(pos.getZ(i) * 400)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const n = sum.get(k) ?? [0, 0, 0];
    n[0] += nor.getX(i);
    n[1] += nor.getY(i);
    n[2] += nor.getZ(i);
    sum.set(k, n);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = sum.get(key(i))!;
    const len = Math.hypot(x, y, z) || 1;
    out.set([x / len, y / len, z / len], i * 3);
  }
  geo.setAttribute("position", pos);
  geo.setAttribute("normal", new THREE.BufferAttribute(out, 3));
  return geo;
}

export interface ItemModelOptions {
  /** 2 : les images, très fines ; 1 : la course */
  detail: 1 | 2;
  shadows: boolean;
  /** La largeur du trait (dans le cube de 1 du modèle) */
  outline: number;
  /** Les extras des images (la flaque sous la burette, la quille près de la boule) */
  icon: boolean;
}

/** Tous les objets, une forme par matière ; chaque exemplaire les partage */
export class ItemModels {
  private plastic: THREE.MeshStandardMaterial;
  private metal: THREE.MeshStandardMaterial;
  private glow: THREE.MeshBasicMaterial;
  private ink: THREE.MeshBasicMaterial;
  private shapes = new Map<ItemKind | "quille", Partial<Record<Finish | "outline", THREE.BufferGeometry>>>();

  constructor(
    private keep: Keep,
    private opts: ItemModelOptions,
  ) {
    this.plastic = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0 }));
    // Les couleurs restent franches même à l'ombre, dans un tunnel ou de nuit : ce sont des jouets, pas des objets réalistes
    this.plastic.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 0.13;",
      );
    };
    this.plastic.customProgramCacheKey = () => "bolides-item-plastic";
    this.metal = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.75 }));
    this.glow = keep(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.ink = keep(outlineMaterial(opts.outline));
  }

  private shape(kind: ItemKind | "quille") {
    let found = this.shapes.get(kind);
    if (found) return found;
    const s = new Sculpt(this.opts.detail);
    SCULPTORS[kind](s, this.opts.icon);
    found = {};
    const all: THREE.BufferGeometry[] = [];
    for (const finish of ["plastic", "metal", "glow"] as const) {
      const list = s.parts[finish];
      if (list.length === 0) continue;
      const merged = this.keep(mergeGeometries(list, false));
      found[finish] = merged;
      if (finish !== "glow") all.push(merged);
      for (const g of list) g.dispose();
    }
    const whole = mergeGeometries(
      all.map((g) => g.clone()),
      false,
    );
    found.outline = this.keep(smoothed(whole));
    this.shapes.set(kind, found);
    return found;
  }

  /** Préparer les formes de tous les objets d'avance */
  prepare(kind: ItemKind) {
    this.shape(kind);
  }

  /** Une quille de bowling (ce n'est pas un objet qu'on ramasse : elle vole quand la boule renverse quelqu'un) */
  makePin(): ItemModel {
    return this.make("quille");
  }

  /** Un exemplaire de cet objet (les formes et les matières sont partagées) */
  make(kind: ItemKind | "quille"): ItemModel {
    const shape = this.shape(kind);
    const root = new THREE.Group();
    let glow: THREE.Mesh | null = null;
    if (shape.outline) root.add(new THREE.Mesh(shape.outline, this.ink));
    if (shape.plastic) {
      const m = new THREE.Mesh(shape.plastic, this.plastic);
      m.castShadow = this.opts.shadows;
      root.add(m);
    }
    if (shape.metal) {
      const m = new THREE.Mesh(shape.metal, this.metal);
      m.castShadow = this.opts.shadows;
      root.add(m);
    }
    if (shape.glow) {
      glow = new THREE.Mesh(shape.glow, this.glow);
      root.add(glow);
    }
    return { root, glow };
  }
}

/** Comment poser chaque objet pour son image : orientation, taille, décalage vertical */
export const ICON_POSE: Record<ItemKind, { rot: Vec3; scale: number; y?: number; x?: number }> = {
  turbo: { rot: [0.12, -0.32, -0.34], scale: 0.98, x: -0.03, y: 0.09 },
  turbo3: { rot: [0.1, -0.12, 0], scale: 1.0, y: 0.09 },
  huile: { rot: [0.2, -0.3, 0], scale: 1.02, x: -0.09, y: 0.02 },
  petard: { rot: [0.1, -0.3, -0.62], scale: 1.04, x: -0.12, y: -0.1 },
  bouclier: { rot: [0.05, -0.34, 0], scale: 1.05 },
  klaxon: { rot: [0.24, -0.32, 0.26], scale: 1.0, x: 0.07 },
  fusee: { rot: [0.12, -0.3, -0.7], scale: 0.86, x: 0.05, y: 0.06 },
  arc: { rot: [0.22, -0.32, 0], scale: 1.26, y: -0.05 },
  bowling: { rot: [0.1, -0.2, 0.05], scale: 1.16, x: -0.03, y: -0.02 },
  tarte: { rot: [0.58, -0.25, 0.05], scale: 1.06, y: -0.04 },
  ressort: { rot: [0.3, -0.3, 0.06], scale: 1.14 },
  geant: { rot: [0.12, -0.22, 0.1], scale: 1.04, y: -0.03 },
  orage: { rot: [0.12, -0.24, 0], scale: 1.1, y: 0.1 },
  aimant: { rot: [0.22, -0.34, 0.22], scale: 0.9, y: -0.16 },
  bombe: { rot: [0.22, -0.32, 0.08], scale: 1.0, x: -0.1, y: -0.13 },
};
