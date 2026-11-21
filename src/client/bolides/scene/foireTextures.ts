// Les images de la fête foraine, dessinées au chargement : les stands (leur comptoir, ce qu'on y gagne ou ce qu'on y
// mange, leur enseigne bordée d'ampoules, avec leur image lumineuse à part pour qu'ils brillent au crépuscule), les
// stores rayés, la toile du chapiteau, les enseignes des manèges, le tremplin peint du cerceau de feu.

import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000003) / 1000003;
  };
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Une ampoule : un point brillant et son halo (sur l'image lumineuse), une petite perle claire (sur l'image du jour) */
function bulb(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lit: boolean) {
  if (lit) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 2.6);
    grad.addColorStop(0, "rgba(255,250,230,1)");
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
  } else {
    g.fillStyle = "#fff6dc";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

/** Une étoile à cinq branches */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rad = k % 2 === 0 ? r : r * 0.45;
    g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
}

/** Les stands : leur enseigne, leurs couleurs, et ce qu'on voit sur le comptoir et les étagères */
const STALLS: { name: string; wall: string; trim: string; sign: string; text: string; goods: Goods }[] = [
  { name: "CONFISERIE", wall: "#f6d6e4", trim: "#e0559a", sign: "#7a1a4a", text: "#fff0f6", goods: "jars" },
  { name: "TIR À LA CARABINE", wall: "#2a3a5a", trim: "#f2c230", sign: "#1a2440", text: "#ffd23a", goods: "targets" },
  { name: "PÊCHE AUX CANARDS", wall: "#bfe3f2", trim: "#2f7fe0", sign: "#0f4a7a", text: "#fff6c4", goods: "ducks" },
  { name: "LOTERIE", wall: "#3a1f4a", trim: "#f2c230", sign: "#5a1a6a", text: "#ffe680", goods: "wheel" },
  { name: "CHURROS", wall: "#f5e2b8", trim: "#c8302b", sign: "#8a2a14", text: "#fff2c4", goods: "churros" },
  { name: "BARBE À PAPA", wall: "#fbe3f0", trim: "#5bc0eb", sign: "#2a6aa0", text: "#ffffff", goods: "candy" },
  { name: "CHAMBOULE-TOUT", wall: "#2f5a3a", trim: "#f2c230", sign: "#1c3a24", text: "#ffd23a", goods: "cans" },
  { name: "GAUFRES", wall: "#fff0cc", trim: "#d98a1f", sign: "#6a3a10", text: "#ffe2a0", goods: "waffles" },
  { name: "POMMES D'AMOUR", wall: "#fde4dc", trim: "#c8102e", sign: "#7a0a1a", text: "#fff0e6", goods: "apples" },
  { name: "NOUGAT", wall: "#f2ead8", trim: "#8a5a2a", sign: "#4a2a10", text: "#fff2d0", goods: "nougat" },
  { name: "ANNEAUX", wall: "#1f4a5a", trim: "#ff8a2a", sign: "#0f2a34", text: "#ffb35a", goods: "bottles" },
  { name: "PELUCHES", wall: "#e8d8f6", trim: "#9a5ce0", sign: "#3a1a6a", text: "#ffe6ff", goods: "plush" },
];
type Goods = "jars" | "targets" | "ducks" | "wheel" | "churros" | "candy" | "cans" | "waffles" | "apples" | "nougat" | "bottles" | "plush";

export const STALL_COUNT = STALLS.length;
/** La couleur des montants de chaque stand (ses côtés et son dos en sont peints) */
export const STALL_TRIMS = STALLS.map((s) => s.trim);
/** L'image d'un stand : 4 colonnes, 3 rangées de cases de 512 × 320 (en haut l'enseigne, 96 px ; le devant, 224 px) */
export const STALL_COLS = 4;
export const STALL_ROWS = 3;
export const STALL_SIGN = 96 / 320;

const PRIZE_COLORS = ["#e8413a", "#f7c531", "#2f7fe0", "#3fb86a", "#ee6fb0", "#ff8a2a", "#9a5ce0", "#ffffff"];

/** Ce que montre un stand sur ses étagères et son comptoir (dans une case de 512 × 224) */
function drawGoods(g: CanvasRenderingContext2D, kind: Goods, r: () => number) {
  const shelf = (y: number) => {
    g.fillStyle = "#6a4a2a";
    g.fillRect(20, y, 472, 6);
  };
  if (kind === "jars") {
    // De grands bocaux de bonbons sur deux étagères
    for (const y of [70, 140]) {
      shelf(y);
      for (let x = 40; x < 480; x += 52) {
        g.fillStyle = "rgba(220,240,255,0.55)";
        g.fillRect(x, y - 46, 38, 46);
        for (let i = 0; i < 14; i++) {
          g.fillStyle = PRIZE_COLORS[Math.floor(r() * PRIZE_COLORS.length)]!;
          g.beginPath();
          g.arc(x + 6 + r() * 26, y - 6 - r() * 34, 4, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#c8302b";
        g.fillRect(x - 2, y - 52, 42, 7);
      }
    }
  } else if (kind === "targets") {
    // Des cibles rondes et des ballons accrochés au fond
    for (let x = 50; x < 480; x += 64) {
      for (const [rad, c] of [
        [24, "#ffffff"],
        [18, "#c8302b"],
        [12, "#ffffff"],
        [6, "#c8302b"],
      ] as const) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, 56, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let x = 34; x < 490; x += 22) {
      g.fillStyle = PRIZE_COLORS[Math.floor(r() * 6)]!;
      g.beginPath();
      g.ellipse(x, 120 + (x % 3) * 6, 9, 12, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === "ducks") {
    // Le bassin où tournent les canards, des lots accrochés au-dessus
    g.fillStyle = "#3a8ad0";
    g.fillRect(24, 120, 464, 40);
    for (let x = 40; x < 480; x += 30) {
      g.fillStyle = "#ffd21f";
      g.beginPath();
      g.ellipse(x, 124, 10, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x + 6, 114, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ff7a1a";
      g.fillRect(x + 10, 113, 5, 3);
    }
    for (let x = 40; x < 480; x += 40) {
      g.fillStyle = PRIZE_COLORS[Math.floor(r() * PRIZE_COLORS.length)]!;
      g.beginPath();
      g.arc(x, 48, 12, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x - 1, 20, 2, 18);
    }
  } else if (kind === "wheel") {
    // La roue de la loterie et ses quartiers, et des ours en peluche de chaque côté
    const cx = 256;
    for (let k = 0; k < 16; k++) {
      g.fillStyle = k % 2 === 0 ? "#f2c230" : PRIZE_COLORS[k % 7]!;
      g.beginPath();
      g.moveTo(cx, 90);
      g.arc(cx, 90, 70, (k / 16) * Math.PI * 2, ((k + 1) / 16) * Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#2a1a10";
    g.beginPath();
    g.arc(cx, 90, 10, 0, Math.PI * 2);
    g.fill();
    for (const x of [60, 130, 382, 452]) {
      g.fillStyle = x % 2 === 0 ? "#c98a4a" : "#f0e0c8";
      g.beginPath();
      g.arc(x, 120, 26, 0, Math.PI * 2);
      g.arc(x, 82, 18, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x - 14, 68, 7, 0, Math.PI * 2);
      g.arc(x + 14, 68, 7, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === "churros") {
    shelf(130);
    for (let x = 40; x < 480; x += 14) {
      g.save();
      g.translate(x, 128);
      g.rotate(-0.25 + r() * 0.5);
      g.fillStyle = "#c98a3a";
      g.fillRect(-4, -70, 8, 70);
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.fillRect(-1, -68, 2, 66);
      g.restore();
    }
  } else if (kind === "candy") {
    // Les nuages roses et bleus de barbe à papa, piqués sur leur bâton
    for (let x = 46; x < 480; x += 48) {
      g.fillStyle = "#e8d8b8";
      g.fillRect(x - 2, 80, 4, 70);
      g.fillStyle = (x / 48) % 2 < 1 ? "#ffb6dc" : "#a6dcff";
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.arc(x - 12 + r() * 24, 56 + r() * 28, 12 + r() * 6, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (kind === "cans") {
    // Des pyramides de boîtes de conserve
    for (const cx of [110, 256, 402]) {
      shelf(150);
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k <= row; k++) {
          const x = cx - row * 15 + k * 30 - 12;
          const y = 150 - (4 - row) * 30;
          g.fillStyle = PRIZE_COLORS[(row + k) % 6]!;
          g.fillRect(x, y, 24, 28);
          g.fillStyle = "rgba(255,255,255,0.45)";
          g.fillRect(x + 3, y + 2, 4, 24);
        }
      }
    }
  } else if (kind === "waffles") {
    shelf(120);
    for (let x = 40; x < 470; x += 72) {
      g.fillStyle = "#e0a24a";
      g.fillRect(x, 60, 56, 56);
      g.strokeStyle = "#a8661c";
      g.lineWidth = 3;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.moveTo(x + k * 14, 60);
        g.lineTo(x + k * 14, 116);
        g.moveTo(x, 60 + k * 14);
        g.lineTo(x + 56, 60 + k * 14);
        g.stroke();
      }
      g.fillStyle = "#ffffff";
      for (let i = 0; i < 10; i++) g.fillRect(x + r() * 52, 60 + r() * 20, 3, 3);
    }
  } else if (kind === "apples") {
    shelf(140);
    for (let x = 40; x < 480; x += 34) {
      for (const y of [70, 128]) {
        g.fillStyle = "#e8d8b8";
        g.fillRect(x - 1, y - 40, 3, 26);
        const grad = g.createRadialGradient(x - 4, y - 6, 2, x, y, 15);
        grad.addColorStop(0, "#ff8a8a");
        grad.addColorStop(0.4, "#d81a2a");
        grad.addColorStop(1, "#7a0a14");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, 14, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (kind === "nougat") {
    shelf(100);
    shelf(160);
    for (const y of [100, 160]) {
      for (let x = 30; x < 480; x += 56) {
        g.fillStyle = "#f4ead0";
        g.fillRect(x, y - 30, 46, 28);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = r() < 0.5 ? "#9a6a2a" : "#3fb86a";
          g.fillRect(x + 4 + r() * 38, y - 26 + r() * 20, 5, 4);
        }
      }
    }
  } else if (kind === "bottles") {
    shelf(150);
    for (let x = 36; x < 480; x += 26) {
      g.fillStyle = ["#2f8a4a", "#8a5a2a", "#3a6ad0"][Math.floor(r() * 3)]!;
      g.fillRect(x, 100, 16, 50);
      g.fillRect(x + 5, 84, 6, 18);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(x + 3, 104, 3, 40);
    }
    g.strokeStyle = "#f2c230";
    g.lineWidth = 4;
    for (let x = 60; x < 480; x += 90) {
      g.beginPath();
      g.ellipse(x, 50, 18, 7, 0, 0, Math.PI * 2);
      g.stroke();
    }
  } else {
    // Des peluches empilées, de toutes les couleurs
    for (let i = 0; i < 26; i++) {
      const x = 30 + r() * 452;
      const y = 50 + r() * 100;
      g.fillStyle = PRIZE_COLORS[Math.floor(r() * PRIZE_COLORS.length)]!;
      g.beginPath();
      g.arc(x, y + 12, 18, 0, Math.PI * 2);
      g.arc(x, y - 10, 13, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x - 10, y - 20, 5, 0, Math.PI * 2);
      g.arc(x + 10, y - 20, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#1a1a1a";
      g.fillRect(x - 5, y - 12, 3, 3);
      g.fillRect(x + 3, y - 12, 3, 3);
    }
  }
}

/**
 * Les stands : chaque case a son enseigne en haut et son devant en dessous (le fond, les lots ou les gourmandises, le
 * comptoir). `lit` : ce qui brille (les ampoules, l'enseigne, la lumière chaude au fond du stand), le reste noir.
 */
export function stallTextures(): { color: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const W = 512;
  const H = 320;
  const [c, g] = canvas(W * STALL_COLS, H * STALL_ROWS);
  const [lc, lg] = canvas(W * STALL_COLS, H * STALL_ROWS);
  lg.fillStyle = "#000";
  lg.fillRect(0, 0, lc.width, lc.height);
  STALLS.forEach((st, k) => {
    const x0 = (k % STALL_COLS) * W;
    const y0 = Math.floor(k / STALL_COLS) * H;
    const r = rng(17 + k * 31);
    // L'enseigne : un panneau bordé de sa couleur, le nom, des ampoules tout autour
    g.fillStyle = st.trim;
    g.fillRect(x0, y0, W, 96);
    g.fillStyle = st.sign;
    g.fillRect(x0 + 10, y0 + 10, W - 20, 76);
    g.fillStyle = st.text;
    g.font = `bold ${st.name.length > 14 ? 40 : 50}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(st.name, x0 + W / 2, y0 + 50);
    lg.fillStyle = st.text;
    lg.globalAlpha = 0.85;
    lg.font = g.font;
    lg.textAlign = "center";
    lg.textBaseline = "middle";
    lg.fillText(st.name, x0 + W / 2, y0 + 50);
    lg.globalAlpha = 1;
    for (let x = 18; x < W; x += 28) {
      for (const y of [5, 91]) {
        bulb(g, x0 + x, y0 + y, 4, "", false);
        bulb(lg, x0 + x, y0 + y, 4, "rgba(255,200,90,0.9)", true);
      }
    }
    // Le devant : le fond du stand, ses lots, son comptoir
    const fy = y0 + 96;
    g.fillStyle = st.wall;
    g.save();
    g.beginPath();
    g.rect(x0, fy, W, 224);
    g.clip();
    g.fillRect(x0, fy, W, 224);
    // Des rayures douces au fond
    for (let x = 0; x < W; x += 40) {
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(x0 + x, fy, 20, 224);
    }
    g.translate(x0, fy);
    drawGoods(g, STALLS[k]!.goods, r);
    g.restore();
    // La lumière chaude du stand, plus forte en haut (les néons sous le store)
    const glow = lg.createLinearGradient(0, fy, 0, fy + 224);
    glow.addColorStop(0, "rgba(255,214,150,0.55)");
    glow.addColorStop(0.6, "rgba(255,190,120,0.22)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    lg.fillStyle = glow;
    lg.fillRect(x0 + 8, fy, W - 16, 170);
    // Les tubes lumineux sous le store
    lg.fillStyle = "rgba(255,246,220,1)";
    lg.fillRect(x0 + 30, fy + 4, W - 60, 5);
    g.fillStyle = "#fffbe8";
    g.fillRect(x0 + 30, fy + 4, W - 60, 5);
    // Le comptoir, sa planche, sa frise
    g.fillStyle = st.trim;
    g.fillRect(x0, fy + 164, W, 60);
    g.fillStyle = "#f4ead8";
    g.fillRect(x0, fy + 160, W, 8);
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let x = 12; x < W; x += 40) star(g, x0 + x + 8, fy + 196, 10);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(x0, fy + 216, W, 8);
    // Les montants peints de chaque côté
    g.fillStyle = st.trim;
    g.fillRect(x0, fy, 10, 224);
    g.fillRect(x0 + W - 10, fy, 10, 224);
  });
  const color = toTexture(c, false);
  const lit = toTexture(lc, false);
  for (const t of [color, lit]) {
    t.anisotropy = 8;
    t.generateMipmaps = true;
  }
  return { color, lit };
}

/** Les stores rayés : quatre jeux de couleurs (une rangée chacun), le bas découpé en festons (transparent) */
export const AWNING_KINDS = 4;
export function awningTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const schemes = [
    ["#d8352a", "#fff6ea"],
    ["#2f6fd0", "#fff6ea"],
    ["#2f9a5a", "#fff6ea"],
    ["#f2c230", "#d8352a"],
  ];
  schemes.forEach(([a, b], k) => {
    const y0 = k * 64;
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = (x / 32) % 2 === 0 ? a! : b!;
      g.fillRect(x, y0, 32, 46);
      // Le feston : un demi-rond sous chaque bande
      g.beginPath();
      g.arc(x + 16, y0 + 46, 16, 0, Math.PI);
      g.fill();
    }
    // Un peu d'ombre dans les plis
    for (let x = 0; x < 256; x += 32) {
      const grad = g.createLinearGradient(x, 0, x + 32, 0);
      grad.addColorStop(0, "rgba(0,0,0,0.12)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.08)");
      grad.addColorStop(1, "rgba(0,0,0,0.12)");
      g.fillStyle = grad;
      g.fillRect(x, y0, 32, 46);
    }
  });
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** La toile du chapiteau : de larges bandes rouges et blanches, un peu usées */
export function tentTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  for (let x = 0; x < 512; x += 64) {
    g.fillStyle = (x / 64) % 2 === 0 ? "#c62a24" : "#f6efe2";
    g.fillRect(x, 0, 64, 256);
  }
  const r = rng(7);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    g.fillRect(r() * 512, r() * 256, 2 + r() * 6, 1 + r() * 3);
  }
  // Les coutures
  g.fillStyle = "rgba(0,0,0,0.18)";
  for (let x = 0; x < 512; x += 64) g.fillRect(x, 0, 2, 256);
  return toTexture(c);
}

/** Le bandeau festonné en haut du mur du chapiteau : jaune et bleu, ses étoiles, le bas découpé (transparent) */
export function valanceTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 64);
  for (let x = 0; x < 512; x += 64) {
    g.fillStyle = "#f2c230";
    g.fillRect(x, 0, 64, 40);
    g.beginPath();
    g.arc(x + 32, 40, 32, 0, Math.PI);
    g.fill();
    g.fillStyle = "#1f4fa8";
    star(g, x + 32, 26, 12);
  }
  g.fillStyle = "#1f4fa8";
  g.fillRect(0, 0, 512, 6);
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Une enseigne de manège : un panneau de couleur, son texte, une bordure d'ampoules. `lit` dessine ce qui brille (les
 * ampoules et le texte), pour une matière qui brille un peu d'elle-même.
 */
export function marqueeTexture(
  text: string,
  bg: string,
  fg: string,
  width = 1024,
): { color: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const H = 160;
  const [c, g] = canvas(width, H);
  const [lc, lg] = canvas(width, H);
  lg.fillStyle = "#000";
  lg.fillRect(0, 0, width, H);
  g.fillStyle = "#f2c230";
  g.fillRect(0, 0, width, H);
  g.fillStyle = bg;
  g.fillRect(14, 14, width - 28, H - 28);
  const size = Math.min(92, Math.floor(((width - 80) / Math.max(4, text.length)) * 1.6));
  for (const [ctx, color] of [
    [g, fg],
    [lg, fg],
  ] as const) {
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, H / 2 + 4);
  }
  for (let x = 14; x < width; x += 30) {
    for (const y of [7, H - 7]) {
      bulb(g, x, y, 5, "", false);
      bulb(lg, x, y, 5, "rgba(255,200,90,0.9)", true);
    }
  }
  for (let y = 37; y < H - 20; y += 30) {
    for (const x of [7, width - 7]) {
      bulb(g, x, y, 5, "", false);
      bulb(lg, x, y, 5, "rgba(255,200,90,0.9)", true);
    }
  }
  return { color: toTexture(c, false), lit: toTexture(lc, false) };
}

/** Le dessus du tremplin du cerceau de feu : des planches peintes en rouge et jaune, des flammes, une bande au bord */
export function circusRampTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = (x / 32) % 2 === 0 ? "#c62a24" : "#f2c230";
    g.fillRect(x, 0, 32, 128);
    g.fillStyle = "rgba(0,0,0,0.2)";
    g.fillRect(x, 0, 2, 128);
  }
  // Des flammes qui montent vers le bord (le haut de la toile)
  for (const cx of [64, 192]) {
    g.fillStyle = "#ff8a1a";
    g.beginPath();
    g.moveTo(cx - 26, 110);
    g.quadraticCurveTo(cx - 30, 70, cx - 6, 40);
    g.quadraticCurveTo(cx - 4, 64, cx + 6, 70);
    g.quadraticCurveTo(cx + 10, 46, cx + 4, 30);
    g.quadraticCurveTo(cx + 34, 62, cx + 26, 110);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffe36a";
    g.beginPath();
    g.moveTo(cx - 12, 110);
    g.quadraticCurveTo(cx - 12, 84, cx, 66);
    g.quadraticCurveTo(cx + 14, 86, cx + 12, 110);
    g.closePath();
    g.fill();
  }
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = (x / 32) % 2 === 0 ? "#1d1d1d" : "#ffffff";
    g.fillRect(x, 0, 32, 14);
  }
  return toTexture(c, false);
}

/** Une flamme pour le cerceau de feu (blanche au cœur, jaune, orange, puis transparente) */
export function flameTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  const grad = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  grad.addColorStop(0, "rgba(255,255,230,1)");
  grad.addColorStop(0.2, "rgba(255,226,110,0.95)");
  grad.addColorStop(0.5, "rgba(255,130,30,0.7)");
  grad.addColorStop(1, "rgba(200,40,10,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 2);
  g.quadraticCurveTo(64, 70, 54, 110);
  g.quadraticCurveTo(32, 128, 10, 110);
  g.quadraticCurveTo(0, 70, 32, 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Le lambrequin du manège : des festons blancs et rouges sous une baguette dorée (le bas découpé, transparent) */
export function carouselTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = (x / 32) % 2 === 0 ? "#f6efe2" : "#d8352a";
    g.fillRect(x, 0, 32, 48);
    g.beginPath();
    g.arc(x + 16, 48, 16, 0, Math.PI);
    g.fill();
  }
  g.fillStyle = "#f2c230";
  g.fillRect(0, 0, 256, 6);
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
