// Les volumes des combattants : des formes lisses faites d'anneaux empilés (le buste, la robe, la chaussure), des membres
// qui s'affinent du haut vers le bas, et une matière de tissu qui garde un liseré clair au bord pour bien se détacher du
// décor. Tout est construit une fois, puis étiré et tourné à chaque image.

import * as THREE from "three";

/** Un anneau : sa hauteur, sa demi-largeur, sa demi-profondeur, et un décalage vers l'avant */
export type Ring = [y: number, halfWidth: number, halfDepth: number, zOffset?: number];

/** Un volume fait d'anneaux empilés du bas vers le haut, fermé aux deux bouts */
export function loft(rings: Ring[], seg = 20, open = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = rings.length;
  const minY = rings[0]![0];
  const maxY = rings[n - 1]![0];
  for (let j = 0; j < n; j++) {
    const [y, w, d, off = 0] = rings[j]!;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.sin(a) * w, y, Math.cos(a) * d + off);
      uv.push(i / seg, (y - minY) / (maxY - minY || 1));
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + 1;
      const d = a + seg + 1;
      const c = d + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  if (!open) {
    const top = pos.length / 3;
    pos.push(0, maxY, rings[n - 1]![3] ?? 0);
    uv.push(0.5, 1);
    const bottom = pos.length / 3;
    pos.push(0, minY, rings[0]![3] ?? 0);
    uv.push(0.5, 0);
    for (let i = 0; i < seg; i++) {
      idx.push((n - 1) * (seg + 1) + i, (n - 1) * (seg + 1) + i + 1, top);
      idx.push(i + 1, i, bottom);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  sealSeam(g, n, seg);
  return g;
}

/** La première et la dernière colonne se touchent : on leur donne la même normale, pour ne pas voir de couture */
function sealSeam(g: THREE.BufferGeometry, rows: number, seg: number) {
  const nor = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let j = 0; j < rows; j++) {
    const a = j * (seg + 1);
    const b = a + seg;
    const x = nor.getX(a) + nor.getX(b);
    const y = nor.getY(a) + nor.getY(b);
    const z = nor.getZ(a) + nor.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(a, x / l, y / l, z / l);
    nor.setXYZ(b, x / l, y / l, z / l);
  }
}

/**
 * Un membre de longueur `len`, de son attache (y = 0) vers son bout (y = len) : `r(u)` donne son rayon le long du
 * segment (u de 0 à 1). Les deux bouts sont arrondis, pour que les articulations se fondent sans boule visible.
 */
export function limb(r: (u: number) => number, len: number, seg = 14): THREE.BufferGeometry {
  const rings: Ring[] = [];
  const cap = 4;
  // Le bout arrondi, côté attache (sous le zéro)
  for (let k = cap; k >= 1; k--) {
    const a = (k / cap) * (Math.PI / 2);
    rings.push([-Math.sin(a) * r(0) * 0.9, Math.cos(a) * r(0), Math.cos(a) * r(0)]);
  }
  const steps = 8;
  for (let k = 0; k <= steps; k++) {
    const u = k / steps;
    rings.push([u * len, r(u), r(u)]);
  }
  for (let k = 1; k <= cap; k++) {
    const a = (k / cap) * (Math.PI / 2);
    rings.push([len + Math.sin(a) * r(1) * 0.9, Math.cos(a) * r(1), Math.cos(a) * r(1)]);
  }
  // Les anneaux de rayon nul se replient : on garde un tout petit rayon
  for (const ring of rings) {
    ring[1] = Math.max(ring[1], 0.002);
    ring[2] = Math.max(ring[2], 0.002);
  }
  return loft(rings, seg, true);
}

/** Une main en moufle, le pouce un peu écarté : le poignet à l'origine, les doigts vers -y */
export function mitten(size: number): THREE.BufferGeometry {
  const palm = loft(
    [
      [-1.0 * size, 0.02 * size, 0.02 * size],
      [-0.92 * size, 0.42 * size, 0.24 * size],
      [-0.7 * size, 0.62 * size, 0.34 * size],
      [-0.4 * size, 0.62 * size, 0.36 * size],
      [-0.1 * size, 0.5 * size, 0.32 * size],
      [0.05 * size, 0.36 * size, 0.3 * size],
      [0.12 * size, 0.02 * size, 0.02 * size],
    ],
    14,
  );
  const thumb = new THREE.SphereGeometry(0.2 * size, 10, 8);
  thumb.scale(1, 1.6, 1);
  thumb.rotateZ(0.5);
  thumb.translate(0.45 * size, -0.35 * size, 0.12 * size);
  return merge([palm, thumb]);
}

/** Une chaussure : la semelle à plat, la pointe vers +z, le talon à l'origine */
export function shoe(len: number, wide: number): THREE.BufferGeometry {
  const upper = loft(
    [
      [0.0, 0.5 * wide, 0.5 * len, 0.22 * len],
      [0.03 * len, 0.56 * wide, 0.56 * len, 0.25 * len],
      [0.16 * len, 0.5 * wide, 0.5 * len, 0.24 * len],
      [0.26 * len, 0.36 * wide, 0.32 * len, 0.1 * len],
      [0.3 * len, 0.02 * wide, 0.02 * len, 0.08 * len],
    ],
    16,
  );
  return upper;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Toutes les parties avec les mêmes attributs (position, normale, uv), sans index
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (!g.getAttribute("uv")) {
      const n = g.getAttribute("position").count;
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    return g;
  });
  let count = 0;
  for (const g of flat) count += g.getAttribute("position").count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of flat) {
    const n = g.getAttribute("position").count;
    pos.set(g.getAttribute("position").array as Float32Array, o * 3);
    nor.set(g.getAttribute("normal").array as Float32Array, o * 3);
    uv.set(g.getAttribute("uv").array as Float32Array, o * 2);
    o += n;
  }
  for (const p of parts) p.dispose();
  for (const g of flat) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}

/** Une matière de tissu ou de peau, avec un liseré de lumière au bord des volumes */
export function cloth(color: THREE.ColorRepresentation, roughness = 0.82, rim = 0.32, map?: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, map: map ?? null });
  mat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float rimLight = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 2.6);
outgoingLight += (diffuseColor.rgb * 0.5 + vec3(0.5)) * rimLight * ${rim.toFixed(2)};
#include <opaque_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => `culbute-tissu-${rim.toFixed(2)}`;
  return mat;
}

/** Un tricot : de petites mailles en V, pour le gilet de Marcel ou le châle de Huguette */
export function knitTexture(base: string, dark: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = dark;
  g.lineWidth = 2.2;
  g.globalAlpha = 0.55;
  for (let y = 0; y < 64; y += 8)
    for (let x = 0; x < 64; x += 8) {
      g.beginPath();
      g.moveTo(x + 1, y + 1);
      g.lineTo(x + 4, y + 7);
      g.lineTo(x + 7, y + 1);
      g.stroke();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

/** Des petits motifs pour une robe : des pois, ou des fleurs */
export function dotsTexture(base: string, dot: string, flowers = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = dot;
  const spots: [number, number][] = [
    [12, 12],
    [44, 20],
    [26, 40],
    [56, 52],
    [6, 54],
  ];
  for (const [x, y] of spots) {
    if (flowers) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}
