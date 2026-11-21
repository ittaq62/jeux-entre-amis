// Les images de la ville, dessinées au chargement : les façades d'immeubles et leurs fenêtres (allumées ou non, avec
// leur image lumineuse à part pour qu'elles brillent la nuit), les devantures du rez-de-chaussée et leurs enseignes,
// les toits de zinc et leurs lucarnes, la verrière de la halle, l'eau du fleuve.

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

function toTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Les étages d'une façade : une image qui couvre FACADE_COLS fenêtres de large et FACADE_ROWS étages de haut */
export const FACADE_COLS = 8;
export const FACADE_ROWS = 8;
/** La largeur d'une travée (une fenêtre) et la hauteur d'un étage, en mètres */
export const BAY = 3;
export const FLOOR = 3.2;

/**
 * Les étages d'immeuble : de la pierre claire (teintée ensuite immeuble par immeuble), de hautes fenêtres, des
 * balcons de fer forgé, des corniches. `lit` : l'image des fenêtres allumées seulement (le reste noir), pour qu'elles
 * brillent dans la nuit.
 */
export function facadeTextures(): { color: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const cw = 64;
  const ch = 80;
  const W = cw * FACADE_COLS;
  const H = ch * FACADE_ROWS;
  const [c, g] = canvas(W, H);
  const [cl, gl] = canvas(W, H);
  gl.fillStyle = "#000";
  gl.fillRect(0, 0, W, H);
  // La pierre, presque blanche : chaque immeuble prend sa teinte en la multipliant
  g.fillStyle = "#e9e3d6";
  g.fillRect(0, 0, W, H);
  const r = rng(71);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)";
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2);
  }
  // Les traînées de pluie sous chaque appui de fenêtre
  for (let row = 0; row < FACADE_ROWS; row++) {
    const y = row * ch;
    // La corniche entre deux étages
    g.fillStyle = "rgba(60,50,40,0.22)";
    g.fillRect(0, y + ch - 6, W, 3);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(0, y + ch - 9, W, 3);
    for (let col = 0; col < FACADE_COLS; col++) {
      const x = col * cw;
      const wx = x + 16;
      const wy = y + 14;
      const ww = cw - 32;
      const wh = ch - 34;
      // Un appartement sur trois a de la lumière, plus ou moins chaude ; certains ont les volets fermés
      const lit = r() < 0.36;
      const shut = !lit && r() < 0.22;
      if (shut) {
        g.fillStyle = r() < 0.5 ? "#5d6f63" : "#7b6a58";
        g.fillRect(wx - 6, wy, ww / 2 + 6, wh);
        g.fillRect(wx + ww / 2, wy, ww / 2 + 6, wh);
        g.fillStyle = "rgba(0,0,0,0.25)";
        for (let k = wy + 3; k < wy + wh; k += 5) {
          g.fillRect(wx - 6, k, ww + 12, 1);
        }
      } else {
        const warm = ["#ffd98a", "#ffc670", "#ffe6b0", "#f7b860", "#cfe0ff"][Math.floor(r() * 5)]!;
        g.fillStyle = lit ? warm : "#1d2330";
        g.fillRect(wx, wy, ww, wh);
        if (lit) {
          // Le rideau, la lampe au plafond : la lumière n'est pas uniforme
          const grad = gl.createLinearGradient(0, wy, 0, wy + wh);
          grad.addColorStop(0, warm);
          grad.addColorStop(1, "#7a5a30");
          gl.fillStyle = grad;
          gl.fillRect(wx, wy, ww, wh);
          g.fillStyle = "rgba(255,255,255,0.25)";
          g.fillRect(wx + 2, wy + 2, ww / 2 - 3, wh - 4);
        } else {
          g.fillStyle = "rgba(120,140,170,0.18)";
          g.fillRect(wx + 2, wy + 2, ww - 4, 6);
        }
        // Les croisillons de la fenêtre
        g.fillStyle = "#e8e2d4";
        g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        g.fillRect(wx, wy + wh * 0.4, ww, 2);
        gl.fillStyle = "#000";
        gl.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        gl.fillRect(wx, wy + wh * 0.4, ww, 2);
      }
      // Le linteau, l'appui
      g.fillStyle = "rgba(90,80,64,0.35)";
      g.fillRect(wx - 4, wy - 4, ww + 8, 3);
      g.fillRect(wx - 3, wy + wh, ww + 6, 3);
      // Les balcons de fer forgé, au 2e et au 5e étage, filants
      if (row === FACADE_ROWS - 2 || row === FACADE_ROWS - 5) {
        g.fillStyle = "#1e2124";
        g.fillRect(x, wy + wh - 12, cw, 2);
        g.fillRect(x, wy + wh + 1, cw, 3);
        for (let k = x + 2; k < x + cw; k += 4) g.fillRect(k, wy + wh - 12, 1, 13);
        gl.fillStyle = "#000";
        gl.fillRect(x, wy + wh - 12, cw, 16);
      }
      // La pluie qui coule sous l'appui
      const drip = g.createLinearGradient(0, wy + wh + 3, 0, wy + wh + 22);
      drip.addColorStop(0, "rgba(40,40,40,0.18)");
      drip.addColorStop(1, "rgba(40,40,40,0)");
      g.fillStyle = drip;
      g.fillRect(wx, wy + wh + 3, ww, 19);
    }
  }
  const color = toTexture(c);
  const lit = toTexture(cl);
  return { color, lit };
}

/** Les commerces au rez-de-chaussée, chacun large de SHOP mètres ; l'image en aligne SHOP_COUNT */
export const SHOP = 6;
export const SHOP_COUNT = 14;
export const SHOP_HEIGHT = 4.4;

const SHOPS: { name: string; front: string; awning: [string, string] | null; sign: string; text: string; cross?: boolean }[] = [
  { name: "BOULANGERIE", front: "#6b2a24", awning: ["#c9302c", "#f3ead8"], sign: "#2a1410", text: "#ffd98a" },
  { name: "CAFÉ", front: "#1f3a2c", awning: ["#1f5c3a", "#f3ead8"], sign: "#0e1c14", text: "#ffe7b4" },
  { name: "PHARMACIE", front: "#e9ece8", awning: null, sign: "#103d22", text: "#4dff8a", cross: true },
  { name: "FLEURS", front: "#3d4a2a", awning: ["#d06a2c", "#f3ead8"], sign: "#24301a", text: "#fff0c8" },
  { name: "LIBRAIRIE", front: "#2a2f4a", awning: ["#2b3f7a", "#f3ead8"], sign: "#141830", text: "#ffd98a" },
  { name: "BISTROT", front: "#5a2030", awning: ["#8a1f3a", "#f3ead8"], sign: "#2a0c16", text: "#ff8ab0" },
  { name: "FROMAGES", front: "#5a4a20", awning: ["#e0b030", "#3a2a10"], sign: "#2a2208", text: "#fff3c0" },
  { name: "HÔTEL", front: "#20262e", awning: null, sign: "#0c1016", text: "#7fd6ff" },
  { name: "PÂTISSERIE", front: "#e8c8d0", awning: ["#e07a9a", "#fff4f6"], sign: "#5a2a38", text: "#ffe0ea" },
  { name: "CRÊPERIE", front: "#2e4a5a", awning: ["#2c7aa0", "#f3ead8"], sign: "#102430", text: "#ffd98a" },
  { name: "BOUCHERIE", front: "#7a1f22", awning: ["#a8282c", "#f3ead8"], sign: "#3a0e10", text: "#fff0c8" },
  { name: "PRIMEUR", front: "#2f5a24", awning: ["#3f8a2c", "#f3ead8"], sign: "#183010", text: "#d8ff9a" },
  { name: "CINÉMA", front: "#1a1420", awning: null, sign: "#2a0a10", text: "#ff4a5a" },
  { name: "BRASSERIE", front: "#3a2614", awning: ["#c08a2a", "#3a2614"], sign: "#1a1008", text: "#ffcf6a" },
];

/**
 * La façade de l'église : la pierre et ses contreforts, le grand portail en ogive éclairé de l'intérieur, deux
 * lancettes, une galerie d'arcades ; la rosace, elle, est posée devant. `lit` : ce qui brille la nuit.
 */
export function churchTextures(): { color: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const W = 512;
  const H = 640;
  const [c, g] = canvas(W, H);
  const [cl, gl] = canvas(W, H);
  gl.fillStyle = "#000";
  gl.fillRect(0, 0, W, H);
  g.fillStyle = "#cfc5ae";
  g.fillRect(0, 0, W, H);
  const r = rng(131);
  // Les assises de pierre
  for (let y = 0; y < H; y += 16) {
    g.fillStyle = "rgba(80,70,55,0.16)";
    g.fillRect(0, y, W, 1.5);
    for (let x = (y / 16) % 2 ? 0 : 24; x < W; x += 48) g.fillRect(x, y, 1.5, 16);
  }
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.07)";
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
  // Les quatre contreforts, plus clairs, avec leur ombre
  for (const x of [0, 150, 338, 488]) {
    g.fillStyle = "#ddd3bd";
    g.fillRect(x, 0, 24, H);
    g.fillStyle = "rgba(60,50,40,0.25)";
    g.fillRect(x + 24, 0, 5, H);
  }
  // Une ogive : un arc brisé, de la largeur donnée, dont le pied est à `base`
  const ogive = (ctx: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, base);
    ctx.lineTo(cx - w / 2, base - h + w * 0.55);
    ctx.quadraticCurveTo(cx - w / 2, base - h + w * 0.1, cx, base - h);
    ctx.quadraticCurveTo(cx + w / 2, base - h + w * 0.1, cx + w / 2, base - h + w * 0.55);
    ctx.lineTo(cx + w / 2, base);
    ctx.closePath();
  };
  // Le portail : ses voussures en retrait, sa porte de bois, la lumière qui passe au-dessus
  for (const [w, h, color] of [
    [150, 250, "#b8ad96"],
    [128, 232, "#a49982"],
    [106, 214, "#8f8570"],
  ] as const) {
    g.fillStyle = color;
    ogive(g, W / 2, H, w, h);
    g.fill();
  }
  g.fillStyle = "#4a2e1c";
  g.fillRect(W / 2 - 46, H - 150, 92, 150);
  g.fillStyle = "#ffcf7a";
  ogive(g, W / 2, H - 150, 92, 60);
  g.fill();
  gl.fillStyle = "#e8a850";
  ogive(gl, W / 2, H - 150, 92, 60);
  gl.fill();
  g.fillStyle = "#2a1a10";
  g.fillRect(W / 2 - 1.5, H - 150, 3, 150);
  // Les deux lancettes, de chaque côté du portail, éclairées en bleu et en rouge
  for (const [x, glass] of [
    [86, "#6a8aff"],
    [426, "#ff6a6a"],
  ] as const) {
    g.fillStyle = "#3a3040";
    ogive(g, x, H - 200, 40, 150);
    g.fill();
    gl.fillStyle = glass;
    ogive(gl, x, H - 206, 30, 138);
    gl.fill();
    g.fillStyle = glass;
    ogive(g, x, H - 206, 30, 138);
    g.fill();
  }
  // La galerie d'arcades sous la rosace
  for (let k = 0; k < 7; k++) {
    const x = 120 + k * 45;
    g.fillStyle = "#3a3346";
    ogive(g, x, 330, 26, 56);
    g.fill();
    gl.fillStyle = "#9a7a50";
    ogive(gl, x, 326, 18, 46);
    gl.fill();
  }
  // Le cercle de la rosace (elle-même est posée devant)
  g.fillStyle = "#a89d86";
  g.beginPath();
  g.arc(W / 2, 170, 118, 0, Math.PI * 2);
  g.fill();
  return { color: toTexture(c), lit: toTexture(cl) };
}

/** Les devantures, côte à côte, et leur image lumineuse (vitrines éclairées, enseignes au néon) */
export function shopTextures(): { color: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const sw = 192;
  const H = 140;
  const W = sw * SHOP_COUNT;
  const [c, g] = canvas(W, H);
  const [cl, gl] = canvas(W, H);
  gl.fillStyle = "#000";
  gl.fillRect(0, 0, W, H);
  g.fillStyle = "#d8d1c2";
  g.fillRect(0, 0, W, H);
  SHOPS.forEach((shop, i) => {
    const x = i * sw;
    // La devanture de bois peint, la vitrine éclairée, la porte
    g.fillStyle = shop.front;
    g.fillRect(x + 6, 30, sw - 12, H - 30);
    const glow = gl.createLinearGradient(0, 62, 0, H);
    glow.addColorStop(0, "#ffe4a8");
    glow.addColorStop(1, "#b8803a");
    g.fillStyle = "#ffe2a0";
    g.fillRect(x + 16, 62, sw - 70, H - 72);
    gl.fillStyle = glow;
    gl.fillRect(x + 16, 62, sw - 70, H - 72);
    // Ce qu'on voit derrière la vitrine : des étagères, des silhouettes de marchandises
    g.fillStyle = "rgba(90,60,30,0.45)";
    for (let k = 0; k < 3; k++) g.fillRect(x + 18, 80 + k * 18, sw - 74, 3);
    const r = rng(100 + i);
    for (let k = 0; k < 9; k++) {
      g.fillStyle = `rgba(${60 + r() * 120},${40 + r() * 80},${30 + r() * 60},0.6)`;
      g.fillRect(x + 20 + r() * (sw - 84), 68 + Math.floor(r() * 3) * 18, 8 + r() * 10, 10);
    }
    gl.fillStyle = "rgba(0,0,0,0.5)";
    gl.fillRect(x + 18, 78, sw - 74, 40);
    g.fillStyle = "#2a1c14";
    g.fillRect(x + sw - 48, 62, 32, H - 62);
    g.fillStyle = "#ffd98a";
    g.fillRect(x + sw - 44, 66, 24, 34);
    gl.fillStyle = "#c89048";
    gl.fillRect(x + sw - 44, 66, 24, 34);
    // L'enseigne, et son nom qui brille
    g.fillStyle = shop.sign;
    g.fillRect(x + 10, 30, sw - 20, 26);
    g.font = `bold ${shop.name.length > 9 ? 17 : 20}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = shop.text;
    g.fillText(shop.name, x + sw / 2, 44);
    gl.font = g.font;
    gl.textAlign = "center";
    gl.textBaseline = "middle";
    gl.fillStyle = shop.text;
    gl.shadowColor = shop.text;
    gl.shadowBlur = 10;
    gl.fillText(shop.name, x + sw / 2, 44);
    gl.shadowBlur = 0;
    // Le store rayé au-dessus de la vitrine
    if (shop.awning) {
      for (let k = 0; k < 12; k++) {
        g.fillStyle = shop.awning[k % 2]!;
        g.fillRect(x + 10 + k * ((sw - 20) / 12), 56, (sw - 20) / 12, 8);
      }
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(x + 10, 63, sw - 20, 2);
    }
    // La croix verte de la pharmacie
    if (shop.cross) {
      const cx = x + sw - 26;
      for (const [ctx, color] of [
        [g, "#2bd86a"],
        [gl, "#4dff8a"],
      ] as const) {
        ctx.fillStyle = color;
        ctx.fillRect(cx - 4, 2, 8, 24);
        ctx.fillRect(cx - 12, 10, 24, 8);
      }
    }
  });
  // Le soubassement de pierre et le bandeau au-dessus
  g.fillStyle = "#b9b2a4";
  g.fillRect(0, 0, W, 6);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(0, H - 4, W, 4);
  return { color: toTexture(c), lit: toTexture(cl) };
}

/** Le toit de zinc : des joints debout, des lucarnes dont certaines sont éclairées */
export function roofTextures(): { color: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const W = 256;
  const H = 64;
  const [c, g] = canvas(W, H);
  const [cl, gl] = canvas(W, H);
  gl.fillStyle = "#000";
  gl.fillRect(0, 0, W, H);
  g.fillStyle = "#6c7681";
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 8) {
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(x, 0, 1, H);
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(x + 1, 0, 1, H);
  }
  const r = rng(83);
  for (let x = 14; x < W - 20; x += 64) {
    // Une lucarne : un petit fronton de pierre, une fenêtre
    g.fillStyle = "#d9d2c3";
    g.fillRect(x, 18, 30, 34);
    g.beginPath();
    g.moveTo(x - 3, 20);
    g.lineTo(x + 15, 8);
    g.lineTo(x + 33, 20);
    g.fill();
    const lit = r() < 0.4;
    g.fillStyle = lit ? "#ffd27a" : "#1d2330";
    g.fillRect(x + 7, 24, 16, 24);
    if (lit) {
      gl.fillStyle = "#f2b860";
      gl.fillRect(x + 7, 24, 16, 24);
    }
  }
  return { color: toTexture(c), lit: toTexture(cl) };
}

/** La lumière d'un réverbère, ronde et douce (à additionner) */
export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,235,190,1)");
  grad.addColorStop(0.25, "rgba(255,200,120,0.55)");
  grad.addColorStop(1, "rgba(255,170,80,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Le reflet d'un réverbère sur les pavés mouillés : une traînée qui s'étire vers celui qui regarde */
export function streakTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(32, 128);
  const grad = g.createRadialGradient(16, 64, 0, 16, 64, 64);
  grad.addColorStop(0, "rgba(255,210,140,0.9)");
  grad.addColorStop(0.4, "rgba(255,180,100,0.3)");
  grad.addColorStop(1, "rgba(255,160,80,0)");
  g.fillStyle = grad;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillRect(0, 0, 32, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** L'eau sombre du fleuve, ridée par la pluie */
export function riverTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#101820";
  g.fillRect(0, 0, 256, 256);
  const r = rng(91);
  for (let i = 0; i < 420; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const rad = 2 + r() * 7;
    g.strokeStyle = `rgba(150,170,200,${0.05 + r() * 0.12})`;
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x, y, rad, rad * 0.45, 0, 0, Math.PI * 2);
    g.stroke();
  }
  return toTexture(c);
}

/** Les carreaux de la verrière de la halle : des montants de fer, du verre embué */
export function glassRoofTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = "rgba(160,180,200,0.55)";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#1f2a26";
  for (let k = 0; k <= 128; k += 32) {
    g.fillRect(k - 2, 0, 4, 128);
    g.fillRect(0, k - 2, 128, 4);
  }
  return toTexture(c);
}

/** Le tablier du pont-levant, qui sert de tremplin : des tôles d'acier rivetées, des flèches, un bord jaune et noir */
export function leafTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = "#3e4a48";
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 64) {
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(x, 0, 2, 128);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(x + 2, 0, 1, 128);
    // Les rivets le long de chaque tôle
    g.fillStyle = "#7d8a86";
    for (let y = 22; y < 128; y += 12) {
      g.beginPath();
      g.arc(x + 7, y, 1.6, 0, Math.PI * 2);
      g.arc(x + 57, y, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = "#ffd23a";
  for (const cx of [64, 192]) {
    g.beginPath();
    g.moveTo(cx - 30, 96);
    g.lineTo(cx, 54);
    g.lineTo(cx + 30, 96);
    g.lineTo(cx + 16, 96);
    g.lineTo(cx, 74);
    g.lineTo(cx - 16, 96);
    g.closePath();
    g.fill();
  }
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = (x / 32) % 2 === 0 ? "#1d1d1d" : "#ffd23a";
    g.fillRect(x, 0, 32, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
