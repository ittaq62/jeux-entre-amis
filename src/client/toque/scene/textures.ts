// Les textures dessinées à la main (sur une toile) des cuisines : carrelages, parquets, pont de bateau, lino, tuiles,
// pavés, bois du chalet, moquette du train, faïence des murs. Faites une fois par scène et rendues avec elle.

import * as THREE from "three";

export type Keep = <T extends { dispose: () => void }>(x: T) => T;

/** Un nombre au hasard, toujours le même pour la même graine */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(
  keep: Keep,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat?: [number, number],
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = keep(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Un léger grain par-dessus (la matière ne fait pas plastique) */
function grain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, rand: () => number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i]! + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n));
  }
  g.putImageData(img, 0, 0);
}

export type FloorStyle = "damier" | "pont" | "lino" | "tuiles" | "pave" | "planches" | "moquette" | "ponton" | "parquet";

/** Le sol : une case de la cuisine = un motif (la texture se répète par case) */
export function floorTexture(keep: Keep, style: FloorStyle, seed = 1): THREE.CanvasTexture {
  const rand = seeded(seed);
  return canvasTexture(keep, 256, 256, (g, w, h) => {
    switch (style) {
      case "damier": {
        // Le carrelage noir et blanc des bistrots, un peu usé (quatre carreaux par case)
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 2; x++) {
            g.fillStyle = (x + y) % 2 ? "#3a3634" : "#e8e0cf";
            g.fillRect((x * w) / 2, (y * h) / 2, w / 2, h / 2);
          }
        g.strokeStyle = "rgba(90,80,70,0.4)";
        g.lineWidth = 3;
        for (let i = 0; i <= 2; i++) {
          g.beginPath();
          g.moveTo((i * w) / 2, 0);
          g.lineTo((i * w) / 2, h);
          g.moveTo(0, (i * h) / 2);
          g.lineTo(w, (i * h) / 2);
          g.stroke();
        }
        grain(g, w, h, 14, rand);
        break;
      }
      case "pont":
      case "ponton":
      case "planches":
      case "parquet": {
        const base = style === "pont" ? "#b88a5a" : style === "ponton" ? "#9a7a58" : style === "planches" ? "#a8744a" : "#c08a52";
        g.fillStyle = base;
        g.fillRect(0, 0, w, h);
        const boards = style === "parquet" ? 8 : 4;
        for (let i = 0; i < boards; i++) {
          const y0 = (i * h) / boards;
          const shade = (rand() - 0.5) * 30;
          g.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 230 : 0},${shade > 0 ? 200 : 0},${Math.abs(shade) / 255})`;
          if (style === "parquet") {
            // Des lames en chevrons, courtes
            const off = i % 2 ? w / 4 : 0;
            for (let x = -1; x < 3; x++) g.fillRect(off + (x * w) / 2 + 2, y0 + 1, w / 2 - 4, h / boards - 2);
          } else g.fillRect(0, y0 + 1, w, h / boards - 2);
          // Les veines
          g.strokeStyle = "rgba(60,35,15,0.18)";
          g.lineWidth = 1;
          for (let k = 0; k < 5; k++) {
            const yy = y0 + 4 + rand() * (h / boards - 8);
            g.beginPath();
            g.moveTo(0, yy);
            for (let x = 0; x <= w; x += 16) g.lineTo(x, yy + Math.sin(x * 0.05 + k) * 1.5);
            g.stroke();
          }
          // Le joint entre les planches, les clous
          g.fillStyle = "rgba(40,24,12,0.55)";
          g.fillRect(0, y0, w, 2);
          if (style !== "parquet") {
            g.fillStyle = "rgba(30,30,30,0.6)";
            const nx = rand() * w;
            g.fillRect(nx, y0 + 6, 3, 3);
            g.fillRect((nx + w / 2) % w, y0 + h / boards - 9, 3, 3);
          }
        }
        grain(g, w, h, 16, rand);
        break;
      }
      case "lino": {
        g.fillStyle = "#cfc2a2";
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 120; i++) {
          g.fillStyle = rand() < 0.5 ? "rgba(120,100,70,0.18)" : "rgba(255,255,240,0.2)";
          g.fillRect(rand() * w, rand() * h, 3 + rand() * 6, 2 + rand() * 4);
        }
        g.strokeStyle = "rgba(90,80,60,0.35)";
        g.lineWidth = 2;
        g.strokeRect(1, 1, w - 2, h - 2);
        grain(g, w, h, 8, rand);
        break;
      }
      case "tuiles": {
        // Les tomettes d'un toit-terrasse, hexagonales, ocre et rouge
        g.fillStyle = "#8a4a2e";
        g.fillRect(0, 0, w, h);
        const r = w / 6;
        for (let row = -1; row < 6; row++)
          for (let col = -1; col < 5; col++) {
            const cx = col * r * 1.75 + (row % 2 ? r * 0.875 : 0);
            const cy = row * r * 1.5;
            const tone = 160 + rand() * 50;
            g.fillStyle = `rgb(${tone}, ${tone * 0.48}, ${tone * 0.3})`;
            g.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
              g.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
            }
            g.closePath();
            g.fill();
          }
        grain(g, w, h, 18, rand);
        break;
      }
      case "pave": {
        g.fillStyle = "#6e675e";
        g.fillRect(0, 0, w, h);
        const n = 4;
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            const tone = 120 + rand() * 40;
            g.fillStyle = `rgb(${tone}, ${tone * 0.96}, ${tone * 0.9})`;
            const ox = (y % 2 ? w / n / 2 : 0) + (x * w) / n;
            g.beginPath();
            g.roundRect(ox + 3, (y * h) / n + 3, w / n - 6, h / n - 6, 10);
            g.fill();
          }
        grain(g, w, h, 20, rand);
        break;
      }
      case "moquette": {
        g.fillStyle = "#6a1f2a";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "rgba(230,190,100,0.5)";
        g.lineWidth = 3;
        for (let k = 0; k < 2; k++) {
          const c = w / 2;
          g.beginPath();
          g.moveTo(c, 20 + k * 30);
          g.lineTo(w - 20 - k * 30, c);
          g.lineTo(c, h - 20 - k * 30);
          g.lineTo(20 + k * 30, c);
          g.closePath();
          g.stroke();
        }
        grain(g, w, h, 18, rand);
        break;
      }
    }
  });
}

/** La glace du chalet : bleutée, rayée, brillante */
export function iceTexture(keep: Keep): THREE.CanvasTexture {
  const rand = seeded(7);
  return canvasTexture(keep, 256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#d9eef8");
    grad.addColorStop(1, "#b8d8ec");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 0.5 + rand() * 1.5;
      const x = rand() * w;
      const y = rand() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 120, y + (rand() - 0.5) * 60);
      g.stroke();
    }
    grain(g, w, h, 10, rand);
  });
}

export type WallStyle = "faience" | "lambris" | "cantine" | "crepi" | "pierre" | "rondins" | "wagon" | "planches" | "salle";

/** Le mur du fond (sa texture couvre un mètre de large et toute sa hauteur) */
export function wallTexture(keep: Keep, style: WallStyle): THREE.CanvasTexture {
  const rand = seeded(style.length * 13);
  return canvasTexture(keep, 256, 512, (g, w, h) => {
    switch (style) {
      case "faience": {
        // Les carreaux blancs biseautés du métro, une frise bleue, la boiserie en bas
        g.fillStyle = "#f1ede2";
        g.fillRect(0, 0, w, h);
        const tw = w / 2;
        const th = h / 16;
        for (let r = 0; r < 12; r++)
          for (let c = -1; c < 3; c++) {
            const x = c * tw + (r % 2 ? tw / 2 : 0);
            const y = r * th;
            const grd = g.createLinearGradient(x, y, x, y + th);
            grd.addColorStop(0, "#fbf8ef");
            grd.addColorStop(1, "#ddd6c6");
            g.fillStyle = grd;
            g.beginPath();
            g.roundRect(x + 2, y + 2, tw - 4, th - 4, 6);
            g.fill();
          }
        g.fillStyle = "#2c5a8c";
        g.fillRect(0, th * 12, w, th * 0.7);
        g.fillStyle = "#7a4a2c";
        g.fillRect(0, th * 12.7, w, h - th * 12.7);
        g.fillStyle = "rgba(0,0,0,0.25)";
        for (let x = 0; x < w; x += w / 2) g.fillRect(x, th * 12.7, 3, h);
        break;
      }
      case "lambris":
      case "wagon": {
        const wood = style === "wagon" ? "#5a2e1e" : "#7a5434";
        g.fillStyle = wood;
        g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += w / 4) {
          g.fillStyle = "rgba(0,0,0,0.25)";
          g.fillRect(x, 0, 3, h);
          g.fillStyle = "rgba(255,220,170,0.08)";
          g.fillRect(x + 4, 0, 8, h);
        }
        if (style === "wagon") {
          g.fillStyle = "#c9a35a";
          g.fillRect(0, h * 0.62, w, 6);
          g.fillRect(0, h * 0.95, w, 6);
        }
        break;
      }
      case "cantine": {
        g.fillStyle = "#e8e2c8";
        g.fillRect(0, 0, w, h * 0.55);
        g.fillStyle = "#6f9a6a";
        g.fillRect(0, h * 0.55, w, h * 0.45);
        g.fillStyle = "#4f7a4a";
        g.fillRect(0, h * 0.55, w, 10);
        break;
      }
      case "crepi":
      case "salle": {
        g.fillStyle = style === "crepi" ? "#e8c89a" : "#f0e0c0";
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = rand() < 0.5 ? "rgba(140,100,60,0.12)" : "rgba(255,255,240,0.15)";
          g.fillRect(rand() * w, rand() * h, 2, 2);
        }
        if (style === "salle") {
          g.fillStyle = "#8a4a3a";
          g.fillRect(0, h * 0.7, w, h * 0.3);
          g.fillStyle = "#d8b060";
          g.fillRect(0, h * 0.7, w, 6);
        }
        break;
      }
      case "pierre": {
        g.fillStyle = "#8a8174";
        g.fillRect(0, 0, w, h);
        let y = 0;
        while (y < h) {
          const hh = 34 + rand() * 20;
          let x = -rand() * 40;
          while (x < w) {
            const ww = 50 + rand() * 50;
            const t = 130 + rand() * 50;
            g.fillStyle = `rgb(${t}, ${t * 0.94}, ${t * 0.86})`;
            g.beginPath();
            g.roundRect(x + 3, y + 3, ww - 6, hh - 6, 8);
            g.fill();
            x += ww;
          }
          y += hh;
        }
        break;
      }
      case "rondins": {
        g.fillStyle = "#6a4426";
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 42) {
          const grd = g.createLinearGradient(0, y, 0, y + 42);
          grd.addColorStop(0, "#9a6a3e");
          grd.addColorStop(0.5, "#7a5230");
          grd.addColorStop(1, "#4a2e18");
          g.fillStyle = grd;
          g.fillRect(0, y + 1, w, 40);
        }
        break;
      }
      case "planches": {
        g.fillStyle = "#8aa8b0";
        g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += w / 5) {
          g.fillStyle = "rgba(0,0,0,0.2)";
          g.fillRect(x, 0, 3, h);
        }
        break;
      }
    }
    grain(g, w, h, 10, rand);
  });
}

/** Le dessus des plans de travail : bois, inox, zinc, marbre, carrelage */
export type TopStyle = "bois" | "inox" | "zinc" | "marbre" | "carreaux";

export function topTexture(keep: Keep, style: TopStyle): THREE.CanvasTexture {
  const rand = seeded(style.length * 31);
  return canvasTexture(keep, 128, 128, (g, w, h) => {
    switch (style) {
      case "bois": {
        g.fillStyle = "#c79a62";
        g.fillRect(0, 0, w, h);
        for (let k = 0; k < 10; k++) {
          g.strokeStyle = `rgba(110,70,30,${0.1 + rand() * 0.15})`;
          g.lineWidth = 1 + rand();
          const y = rand() * h;
          g.beginPath();
          g.moveTo(0, y);
          for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.08 + k) * 2);
          g.stroke();
        }
        break;
      }
      case "inox":
      case "zinc": {
        const grd = g.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, style === "inox" ? "#e4e8ec" : "#b8bcbc");
        grd.addColorStop(1, style === "inox" ? "#b8c0c8" : "#8e9494");
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "rgba(255,255,255,0.18)";
        for (let i = 0; i < 60; i++) {
          const y = rand() * h;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(w, y + (rand() - 0.5) * 4);
          g.stroke();
        }
        break;
      }
      case "marbre": {
        g.fillStyle = "#efece6";
        g.fillRect(0, 0, w, h);
        for (let k = 0; k < 5; k++) {
          g.strokeStyle = `rgba(120,115,110,${0.15 + rand() * 0.2})`;
          g.lineWidth = 0.6 + rand() * 1.4;
          let x = rand() * w;
          let y = 0;
          g.beginPath();
          g.moveTo(x, y);
          while (y < h) {
            x += (rand() - 0.5) * 18;
            y += 6 + rand() * 10;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        break;
      }
      case "carreaux": {
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            g.fillStyle = (x + y) % 2 ? "#f2efe6" : "#e6dfcc";
            g.fillRect((x * w) / 4, (y * h) / 4, w / 4, h / 4);
          }
        g.strokeStyle = "rgba(150,140,120,0.5)";
        for (let i = 0; i <= 4; i++) {
          g.beginPath();
          g.moveTo((i * w) / 4, 0);
          g.lineTo((i * w) / 4, h);
          g.moveTo(0, (i * h) / 4);
          g.lineTo(w, (i * h) / 4);
          g.stroke();
        }
        break;
      }
    }
    grain(g, w, h, 8, rand);
  });
}
