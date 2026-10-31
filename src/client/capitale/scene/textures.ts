import * as THREE from "three";
import { GROUPS, SQUARES } from "../../../shared/games/capitale/board.ts";
import { ARENA, KIOSK_PARCEL, PARCELS, parcelPoint, PLAZA_PARCEL, type Parcel, type Pt } from "./city.ts";
import { bandRect, BOARD, C, CELL, HALF, INNER, OUTER_ROAD, squareRect, type WRect } from "./layout.ts";

// Tout ce qui est imprimé est dessiné ici, sur des toiles : le plateau (cases et sol de la ville), les façades, les dés.
// Le texte du plateau est tourné vers la caméra : on le redessine quand on fait tourner le plateau.

const FONT_TEXT = '"Libre Franklin Variable", "Segoe UI", sans-serif';
const FONT_TITLE = '"Young Serif", Georgia, serif';
const FONT_NUM = '"Big Shoulders Display Variable", "Arial Narrow", sans-serif';

export const PAPER = "#f4eddc";
const INK = "#26211a";
const GRASS = "#b3cb8c";
const ASPHALT = "#5f646b";
const SIDEWALK = "#d9d1bf";
const PAVING = "#e8dec8";

/** Les polices du site doivent être chargées avant de dessiner, sinon la toile prend celle par défaut */
export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`700 40px ${FONT_TEXT}`),
      document.fonts.load(`40px ${FONT_TITLE}`),
      document.fonts.load(`800 40px ${FONT_NUM}`),
    ]);
  } catch {
    // tant pis : la police de secours fera l'affaire
  }
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** Un mélange de deux couleurs (#rrggbb), t = 0 donne a, t = 1 donne b */
export function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa
    .map((v, k) =>
      Math.round(v + (pb[k]! - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Le texte le plus grand possible (jusqu'à size) qui tient dans maxW */
function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number, weight: string, family: string) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 6 && ctx.measureText(text).width > maxW) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

/** Coupe un nom en deux lignes au plus, au blanc ou au trait d'union le plus central */
function splitName(text: string): string[] {
  if (text.length <= 9) return [text];
  const cuts: number[] = [];
  for (let i = 1; i < text.length - 1; i++) if (text[i] === " " || text[i] === "-") cuts.push(i);
  if (cuts.length === 0) return [text];
  const mid = text.length / 2;
  const at = cuts.reduce((best, c) => (Math.abs(c - mid) < Math.abs(best - mid) ? c : best), cuts[0]!);
  return text[at] === "-" ? [text.slice(0, at + 1), text.slice(at + 1)] : [text.slice(0, at), text.slice(at + 1)];
}

// ---------------------------------------------------------------------------
// Le plateau
// ---------------------------------------------------------------------------

interface Pen {
  ctx: CanvasRenderingContext2D;
  /** Pixels par unité du monde */
  k: number;
  /** L'angle du texte (radians, sens de la toile) pour qu'il se lise de face */
  alpha: number;
}

const px = (p: Pen, x: number) => (x + HALF) * p.k;

function rectPx(p: Pen, r: WRect): [number, number, number, number] {
  return [px(p, r.x), px(p, r.z), r.w * p.k, r.d * p.k];
}

/** Dessine dans un cadre centré sur (cx, cy), tourné vers la caméra : draw reçoit la largeur et la hauteur vues de face */
function framed(p: Pen, cx: number, cy: number, w: number, h: number, draw: (w: number, h: number) => void) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(p.alpha);
  const odd = Math.round(Math.abs(p.alpha) / (Math.PI / 2)) % 2 === 1;
  draw(odd ? h : w, odd ? w : h);
  ctx.restore();
}

function textLine(p: Pen, text: string, x: number, y: number, size: number, maxW: number, weight = "700", family = FONT_TEXT, color = INK) {
  const { ctx } = p;
  fitFont(ctx, text, size, maxW, weight, family);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

/** Un nom sur une ou deux lignes, centré en (0, y) */
function nameBlock(p: Pen, text: string, y: number, size: number, maxW: number, color = INK) {
  const lines = splitName(text.toUpperCase());
  const { ctx } = p;
  let s = size;
  for (const l of lines) s = Math.min(s, fitFont(ctx, l, size, maxW, "700", FONT_TEXT));
  ctx.font = `700 ${s}px ${FONT_TEXT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lh = s * 1.08;
  lines.forEach((l, k) => ctx.fillText(l, 0, y + (k - (lines.length - 1) / 2) * lh));
}

function price(p: Pen, text: string, y: number, size: number, maxW: number) {
  textLine(p, text, 0, y, size, maxW, "800", FONT_NUM, INK);
}

function trainIcon(p: Pen, x: number, y: number, s: number, color = INK) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = color;
  ctx.beginPath();
  // Un TGV de profil : le nez effilé à gauche
  ctx.moveTo(-50, 18);
  ctx.bezierCurveTo(-48, -2, -30, -18, 0, -18);
  ctx.lineTo(48, -18);
  ctx.lineTo(48, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.fillRect(-12, -10, 14, 10);
  ctx.fillRect(8, -10, 14, 10);
  ctx.fillRect(28, -10, 14, 10);
  ctx.beginPath();
  ctx.moveTo(-36, 0);
  ctx.quadraticCurveTo(-30, -10, -20, -10);
  ctx.lineTo(-20, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(-52, 24, 104, 5);
  ctx.restore();
}

function dropIcon(p: Pen, x: number, y: number, s: number) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = "#2f7fc0";
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.bezierCurveTo(10, -26, 32, -4, 32, 14);
  ctx.arc(0, 14, 32, 0, Math.PI);
  ctx.bezierCurveTo(-32, -4, -10, -26, 0, -44);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-12, 12, 7, 12, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function turbineIcon(p: Pen, x: number, y: number, s: number) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-4, -8);
  ctx.lineTo(4, -8);
  ctx.lineTo(7, 48);
  ctx.lineTo(-7, 48);
  ctx.closePath();
  ctx.fill();
  for (let k = 0; k < 3; k++) {
    ctx.save();
    ctx.translate(0, -10);
    ctx.rotate((k * Math.PI * 2) / 3 + 0.3);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(-6, -24, 0, -44);
    ctx.quadraticCurveTo(5, -24, 4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, -10, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function envelopeIcon(p: Pen, x: number, y: number, s: number) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = "#2f6fb8";
  ctx.beginPath();
  ctx.roundRect(-46, -30, 92, 60, 8);
  ctx.fill();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-40, -24);
  ctx.lineTo(0, 6);
  ctx.lineTo(40, -24);
  ctx.stroke();
  ctx.restore();
}

function questionIcon(p: Pen, x: number, y: number, s: number) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#e07a2c";
  ctx.font = `${s}px ${FONT_TITLE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 0, s * 0.04);
  ctx.restore();
}

function taxIcon(p: Pen, x: number, y: number, s: number, toll: boolean) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  if (toll) {
    // Une barrière de péage, rayée rouge et blanc
    ctx.fillStyle = INK;
    ctx.fillRect(-44, -10, 12, 46);
    ctx.save();
    ctx.translate(-38, -4);
    ctx.rotate(-0.12);
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = k % 2 ? "#ffffff" : "#d6433a";
      ctx.fillRect(k * 14, -6, 14, 12);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, -6, 84, 12);
    ctx.restore();
  } else {
    // Un tampon officiel
    ctx.strokeStyle = "#b8332c";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#b8332c";
    ctx.font = `800 30px ${FONT_NUM}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₣", 0, 2);
  }
  ctx.restore();
}

/** Une case du tour */
function drawSquare(p: Pen, i: number) {
  const { ctx, k } = p;
  const sq = SQUARES[i]!;
  const r = squareRect(i);
  const [x, y, w, h] = rectPx(p, r);
  ctx.fillStyle = PAPER;
  ctx.fillRect(x, y, w, h);

  // Le contenu, hors de la bande de couleur
  let box: WRect = r;
  if (sq.kind === "property") {
    const b = bandRect(i);
    ctx.fillStyle = GROUPS[sq.group!].color;
    ctx.fillRect(...rectPx(p, b));
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.012 * k;
    ctx.strokeRect(...rectPx(p, b));
    if (r.side === "bottom") box = { ...r, z: r.z + b.d, d: r.d - b.d };
    else if (r.side === "left") box = { ...r, w: r.w - b.w };
    else if (r.side === "top") box = { ...r, d: r.d - b.d };
    else box = { ...r, x: r.x + b.w, w: r.w - b.w };
  }
  const [bx, by, bw, bh] = rectPx(p, box);
  const pad = 0.07 * k;

  if (sq.kind === "go" || sq.kind === "jail" || sq.kind === "rest" || sq.kind === "toJail") {
    drawCorner(p, i, x, y, w, h);
  } else {
    framed(p, bx + bw / 2, by + bh / 2, bw, bh, (fw, fh) => {
      const maxW = fw - 2 * pad;
      const top = -fh / 2 + pad;
      const bottom = fh / 2 - pad;
      switch (sq.kind) {
        case "property":
          nameBlock(p, sq.name, top + 0.2 * k, 0.17 * k, maxW);
          price(p, `${sq.price} ₣`, bottom - 0.11 * k, 0.2 * k, maxW);
          break;
        case "station":
          nameBlock(p, sq.name, top + 0.2 * k, 0.145 * k, maxW);
          trainIcon(p, 0, 0.06 * k, Math.min(maxW, 0.62 * k));
          price(p, `${sq.price} ₣`, bottom - 0.11 * k, 0.2 * k, maxW);
          break;
        case "utility":
          nameBlock(p, sq.name, top + 0.2 * k, 0.145 * k, maxW);
          if (i === 12) dropIcon(p, 0, 0.06 * k, 0.5 * k);
          else turbineIcon(p, 0, 0.04 * k, 0.5 * k);
          price(p, `${sq.price} ₣`, bottom - 0.11 * k, 0.2 * k, maxW);
          break;
        case "card":
          if (sq.deck === "hasard") questionIcon(p, 0, -0.08 * k, 0.6 * k);
          else envelopeIcon(p, 0, -0.08 * k, 0.5 * k);
          nameBlock(p, sq.name, bottom - 0.16 * k, 0.13 * k, maxW);
          break;
        case "tax":
          nameBlock(p, sq.name, top + 0.18 * k, 0.15 * k, maxW);
          taxIcon(p, 0, 0.02 * k, 0.42 * k, i === 38);
          textLine(p, `Payez ${sq.tax} ₣`, 0, bottom - 0.1 * k, 0.14 * k, maxW, "600");
          break;
        default:
          break;
      }
    });
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.016 * k;
  ctx.strokeRect(x, y, w, h);
}

function drawCorner(p: Pen, i: number, x: number, y: number, w: number, h: number) {
  const { ctx, k } = p;
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (i === 0) {
    // Départ : la grande flèche suit le sens du jeu (vers la gauche sur le bord du bas)
    ctx.fillStyle = "#f7e7c4";
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.translate(cx, y + h * 0.8);
    ctx.fillStyle = "#cf3b2f";
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, 0);
    ctx.lineTo(-w * 0.22, -h * 0.11);
    ctx.lineTo(-w * 0.22, -h * 0.045);
    ctx.lineTo(w * 0.4, -h * 0.045);
    ctx.lineTo(w * 0.4, h * 0.045);
    ctx.lineTo(-w * 0.22, h * 0.045);
    ctx.lineTo(-w * 0.22, h * 0.11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    framed(p, cx, y + h * 0.4, w, h * 0.6, (fw) => {
      textLine(p, "DÉPART", 0, -0.12 * k, 0.3 * k, fw - 0.2 * k, "400", FONT_TITLE, "#b8332c");
      textLine(p, "Recevez 200 ₣", 0, 0.2 * k, 0.14 * k, fw - 0.2 * k, "600");
    });
    return;
  }
  if (i === 10) {
    // La prison : la cellule côté ville, la simple visite le long des bords
    ctx.fillStyle = "#f0e3c6";
    ctx.fillRect(x, y, w, h);
    const [cx0, cy0, cw, ch] = rectPx(p, CELL);
    ctx.fillStyle = "#e9a23b";
    ctx.fillRect(cx0, cy0, cw, ch);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.016 * k;
    ctx.strokeRect(cx0, cy0, cw, ch);
    framed(p, cx0 + cw / 2, cy0 + ch / 2, cw, ch, (fw) => {
      textLine(p, "PRISON", 0, 0, 0.17 * k, fw - 0.12 * k, "800");
    });
    // « Simple visite » le long des deux bandes extérieures
    const strip = 0.36 * C * k;
    ctx.save();
    ctx.translate(x + strip / 2, y + (h - strip) / 2);
    ctx.rotate(Math.PI / 2);
    textLine(p, "SIMPLE", 0, 0, 0.13 * k, h - strip - 0.1 * k, "700");
    ctx.restore();
    textLine(p, "VISITE", x + strip + (w - strip) / 2, y + h - strip / 2, 0.13 * k, w - strip - 0.1 * k, "700");
    return;
  }
  if (i === 20) {
    ctx.fillStyle = "#e3ecd2";
    ctx.fillRect(x, y, w, h);
    framed(p, cx, cy, w, h, (fw) => {
      ctx.fillStyle = "#2f6fb8";
      ctx.beginPath();
      ctx.roundRect(-0.2 * k, -0.42 * k, 0.4 * k, 0.4 * k, 0.06 * k);
      ctx.fill();
      textLine(p, "P", 0, -0.215 * k, 0.32 * k, 0.4 * k, "800", FONT_TEXT, "#ffffff");
      textLine(p, "AIRE", 0, 0.16 * k, 0.17 * k, fw - 0.2 * k, "800");
      textLine(p, "DE REPOS", 0, 0.38 * k, 0.17 * k, fw - 0.2 * k, "800");
    });
    return;
  }
  // Allez en prison
  ctx.fillStyle = "#e6e0f0";
  ctx.fillRect(x, y, w, h);
  framed(p, cx, cy, w, h, (fw) => {
    // Un écusson bleu
    ctx.fillStyle = "#24407f";
    ctx.beginPath();
    ctx.moveTo(0, -0.5 * k);
    ctx.lineTo(0.2 * k, -0.42 * k);
    ctx.lineTo(0.18 * k, -0.18 * k);
    ctx.quadraticCurveTo(0.12 * k, -0.06 * k, 0, 0);
    ctx.quadraticCurveTo(-0.12 * k, -0.06 * k, -0.18 * k, -0.18 * k);
    ctx.lineTo(-0.2 * k, -0.42 * k);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f2c94c";
    ctx.beginPath();
    for (let a = 0; a < 10; a++) {
      const rr = (a % 2 ? 0.045 : 0.1) * k;
      const t = (a * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(Math.cos(t) * rr, -0.27 * k + Math.sin(t) * rr);
    }
    ctx.fill();
    textLine(p, "ALLEZ EN", 0, 0.18 * k, 0.17 * k, fw - 0.2 * k, "800");
    textLine(p, "PRISON", 0, 0.4 * k, 0.17 * k, fw - 0.2 * k, "800");
  });
}

/** Un polygone aux coins arrondis */
function roundPoly(p: Pen, poly: Pt[], radius: number) {
  const { ctx, k } = p;
  const pts = poly.map((q) => [px(p, q.x), px(p, q.z)] as const);
  const n = pts.length;
  ctx.beginPath();
  const mid = (i: number) => {
    const a = pts[i % n]!;
    const b = pts[(i + 1) % n]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  };
  const start = mid(n - 1);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const c = pts[i]!;
    const m = mid(i);
    ctx.arcTo(c[0], c[1], m[0], m[1], radius * k);
  }
  ctx.closePath();
}

/** Un nom posé au sol, lisible face à la caméra */
function groundText(p: Pen, text: string, at: Pt, size: number, maxW: number, color: string, weight = "800") {
  const { ctx, k } = p;
  ctx.save();
  ctx.translate(px(p, at.x), px(p, at.z));
  ctx.rotate(p.alpha);
  // Un liseré clair autour des lettres : le nom se lit sur n'importe quel sol
  fitFont(ctx, text, size * k, maxW * k, weight, FONT_TEXT);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * k * 0.28;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

const GROUND: Partial<Record<Parcel["kind"], string>> = {
  station: "#d3cbbb",
  utility: "#a9cd86",
  tax: "#ddd6c6",
  toll: "#cfd2d4",
  bank: "#e6dcc6",
  kiosk: PAVING,
  garden: "#93c46d",
  plaza: PAVING,
};

function drawParcel(p: Pen, l: Parcel) {
  const { ctx, k } = p;
  if (l.kind === "property") {
    const color = GROUPS[l.group!].color;
    roundPoly(p, l.poly, 0.09);
    ctx.fillStyle = mix(color, "#ffffff", 0.62);
    ctx.fill();
    ctx.lineWidth = 0.05 * k;
    ctx.strokeStyle = color;
    ctx.stroke();
    // Le nom de la rue, vers le bord extérieur de la parcelle, dans la couleur du quartier
    const at = parcelPoint(l, 0, l.room * 0.72);
    groundText(p, SQUARES[l.square]!.name.replace("Clermont-Ferrand", "Clermont"), at, 0.16, l.room * 1.9, mix(color, INK, 0.45));
    return;
  }
  roundPoly(p, l.poly, 0.09);
  ctx.fillStyle = GROUND[l.kind] ?? "#ddd6c6";
  ctx.fill();
  if (l.kind === "utility" && l.square === 12) {
    // Le barrage : un lac
    ctx.fillStyle = "#4f97c4";
    ctx.beginPath();
    ctx.ellipse(px(p, l.center.x), px(p, l.center.z), l.room * 0.85 * k, l.room * 0.7 * k, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (l.kind === "plaza") return;
  const label: Partial<Record<Parcel["kind"], string>> = {
    bank: "BANQUE",
    kiosk: "CARTES",
    tax: "IMPÔTS",
    toll: "PÉAGE",
  };
  const name = l.square >= 0 && l.kind !== "tax" && l.kind !== "toll" ? SQUARES[l.square]!.name.toUpperCase() : label[l.kind];
  if (name) groundText(p, name, parcelPoint(l, 0, l.room * 0.75), 0.105, l.room * 1.9, INK);
}

function drawCity(p: Pen) {
  const { ctx, k } = p;
  // Tout est rue, sauf les parcelles posées dessus
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(px(p, -INNER), px(p, -INNER), 2 * INNER * k, 2 * INNER * k);
  ctx.strokeStyle = "rgba(244, 241, 232, 0.9)";
  ctx.lineWidth = 0.014 * k;
  ctx.setLineDash([0.09 * k, 0.07 * k]);
  ctx.beginPath();
  ctx.roundRect(px(p, -OUTER_ROAD), px(p, -OUTER_ROAD), 2 * OUTER_ROAD * k, 2 * OUTER_ROAD * k, 0.2 * k);
  ctx.stroke();
  ctx.setLineDash([]);
  // Un trottoir clair autour de chaque parcelle, puis la parcelle
  for (const l of PARCELS) {
    roundPoly(p, l.poly, 0.11);
    ctx.lineWidth = 0.07 * k;
    ctx.strokeStyle = SIDEWALK;
    ctx.stroke();
  }
  for (const l of PARCELS) drawParcel(p, l);
  // Les paquets de cartes : leur emplacement sur le parvis du kiosque
  for (const x of [-0.16, 0.16]) {
    const at = parcelPoint(KIOSK_PARCEL, x, 0.12);
    ctx.fillStyle = "rgba(90, 70, 40, 0.18)";
    ctx.beginPath();
    ctx.arc(px(p, at.x), px(p, at.z), 0.2 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  drawArena(p);
}

function drawArena(p: Pen) {
  const { ctx, k } = p;
  const c = PLAZA_PARCEL.center;
  const R = ARENA * k * 1.08;
  ctx.save();
  ctx.translate(px(p, c.x), px(p, c.z));
  // Une rose des vents en mosaïque, sur laquelle roulent les dés
  ctx.fillStyle = "#efe4cb";
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.05 * k;
  ctx.strokeStyle = "#a6773f";
  ctx.beginPath();
  ctx.arc(0, 0, R - 0.03 * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.016 * k;
  ctx.strokeStyle = "#c9a66b";
  ctx.beginPath();
  ctx.arc(0, 0, R - 0.24 * k, 0, Math.PI * 2);
  ctx.stroke();
  for (let a = 0; a < 16; a++) {
    const long = a % 4 === 0 ? 0.92 : a % 2 === 0 ? 0.62 : 0.4;
    const t = (a * Math.PI) / 8;
    ctx.fillStyle = a % 2 ? "#d9b878" : a % 4 === 0 ? "#b8332c" : "#2f5b8c";
    ctx.beginPath();
    ctx.moveTo(Math.cos(t) * R * long, Math.sin(t) * R * long);
    ctx.lineTo(Math.cos(t + 0.16) * R * 0.14, Math.sin(t + 0.16) * R * 0.14);
    ctx.lineTo(0, 0);
    ctx.lineTo(Math.cos(t - 0.16) * R * 0.14, Math.sin(t - 0.16) * R * 0.14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#f6efdc";
  ctx.beginPath();
  ctx.arc(0, 0, 0.12 * k, 0, Math.PI * 2);
  ctx.fill();
  // « CAPITALE » en couronne, lisible de face
  ctx.rotate(p.alpha);
  ctx.fillStyle = "#8a5a2c";
  ctx.font = `${0.15 * k}px ${FONT_TITLE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const word = "CAPITALE";
  const rr = R - 0.135 * k;
  const span = 1.05;
  [...word].forEach((ch, n) => {
    const t = Math.PI / 2 + span / 2 - (n * span) / (word.length - 1);
    ctx.save();
    ctx.translate(Math.cos(t) * rr, Math.sin(t) * rr);
    ctx.rotate(t - Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

/** Le plateau entier : les cases tout autour, le sol de la ville au milieu. rot = quarts de tour de la caméra. */
export function drawBoard(canvas: HTMLCanvasElement, rot: number) {
  const ctx = canvas.getContext("2d")!;
  const size = canvas.width;
  const p: Pen = { ctx, k: size / BOARD, alpha: (-rot * Math.PI) / 2 };
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = GRASS;
  ctx.fillRect(px(p, -INNER), px(p, -INNER), 2 * INNER * p.k, 2 * INNER * p.k);
  drawCity(p);
  for (let i = 0; i < 40; i++) drawSquare(p, i);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.05 * p.k;
  ctx.strokeRect(px(p, -INNER), px(p, -INNER), 2 * INNER * p.k, 2 * INNER * p.k);
  ctx.lineWidth = 0.06 * p.k;
  ctx.strokeRect(0.03 * p.k, 0.03 * p.k, size - 0.06 * p.k, size - 0.06 * p.k);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Les façades : une travée d'un étage (une fenêtre), répétée sur tout le mur
// ---------------------------------------------------------------------------

export interface FacadeLook {
  wall: string;
  glass?: string;
  frame?: string;
  shutters?: string;
  /** Pans de bois (colombages) */
  timber?: string;
  brick?: boolean;
  /** Un garde-corps sous la fenêtre (balcon haussmannien) */
  balcony?: boolean;
  /** Mur-rideau : du verre presque partout */
  curtain?: boolean;
  /** Fenêtres plus étroites (maisons de pierre, chalets) */
  narrow?: boolean;
}

const facadeCache = new Map<string, THREE.CanvasTexture>();

export function facadeTexture(look: FacadeLook): THREE.CanvasTexture {
  const key = JSON.stringify(look);
  const hit = facadeCache.get(key);
  if (hit) return hit;
  const S = 128;
  const [canvas, ctx] = makeCanvas(S, S);
  ctx.fillStyle = look.wall;
  ctx.fillRect(0, 0, S, S);
  if (look.brick) {
    for (let row = 0; row < 16; row++) {
      for (let col = -1; col < 8; col++) {
        const off = row % 2 ? 8 : 0;
        ctx.fillStyle = mix(look.wall, row * 7 + col * 3 > 40 ? "#ffffff" : "#000000", ((row * 13 + col * 7) % 5) * 0.025);
        ctx.fillRect(col * 16 + off + 1, row * 8 + 1, 14, 6);
      }
    }
  }
  const glass = look.glass ?? "#46627a";
  const frame = look.frame ?? "#f6f1e6";
  if (look.curtain) {
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, mix(glass, "#ffffff", 0.35));
    g.addColorStop(0.55, glass);
    g.addColorStop(1, mix(glass, "#000000", 0.25));
    ctx.fillStyle = g;
    ctx.fillRect(6, 6, S - 12, S - 18);
    ctx.fillStyle = frame;
    ctx.fillRect(0, S - 12, S, 12);
    ctx.fillRect(S / 2 - 2, 0, 4, S);
  } else {
    const ww = look.narrow ? 34 : 48;
    const wh = look.narrow ? 60 : 66;
    const wx = (S - ww) / 2;
    const wy = 26;
    if (look.timber) {
      ctx.strokeStyle = look.timber;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(S, 4);
      ctx.moveTo(0, S - 4);
      ctx.lineTo(S, S - 4);
      ctx.moveTo(4, 0);
      ctx.lineTo(4, S);
      ctx.moveTo(10, S - 8);
      ctx.lineTo(wx - 6, wy + wh);
      ctx.moveTo(S - 10, S - 8);
      ctx.lineTo(wx + ww + 6, wy + wh);
      ctx.stroke();
    }
    if (look.shutters) {
      ctx.fillStyle = look.shutters;
      ctx.fillRect(wx - 16, wy, 14, wh);
      ctx.fillRect(wx + ww + 2, wy, 14, wh);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let n = 0; n < 6; n++) {
        ctx.fillRect(wx - 16, wy + 6 + n * 10, 14, 2);
        ctx.fillRect(wx + ww + 2, wy + 6 + n * 10, 14, 2);
      }
    }
    ctx.fillStyle = frame;
    ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
    const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    g.addColorStop(0, mix(glass, "#ffffff", 0.3));
    g.addColorStop(0.6, glass);
    g.addColorStop(1, mix(glass, "#000000", 0.2));
    ctx.fillStyle = g;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = frame;
    ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    ctx.fillRect(wx, wy + wh * 0.38, ww, 3);
    if (look.balcony) {
      ctx.fillStyle = "#2c2a27";
      ctx.fillRect(wx - 10, wy + wh - 4, ww + 20, 4);
      for (let n = 0; n <= 8; n++) ctx.fillRect(wx - 10 + (n * (ww + 18)) / 8, wy + wh - 18, 2, 16);
      ctx.fillRect(wx - 10, wy + wh - 18, ww + 20, 2);
    }
    // Le bandeau entre deux étages
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fillRect(0, S - 6, S, 6);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  facadeCache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Les dés, les panneaux
// ---------------------------------------------------------------------------

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.27, 0.27],
    [0.73, 0.73],
  ],
  3: [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
  ],
  4: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  5: [
    [0.26, 0.26],
    [0.74, 0.26],
    [0.5, 0.5],
    [0.26, 0.74],
    [0.74, 0.74],
  ],
  6: [
    [0.27, 0.23],
    [0.73, 0.23],
    [0.27, 0.5],
    [0.73, 0.5],
    [0.27, 0.77],
    [0.73, 0.77],
  ],
};

export function dieFace(value: number): THREE.CanvasTexture {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S * 0.4, S * 0.35, S * 0.1, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, "#fffdf6");
  g.addColorStop(1, "#ece3cf");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (const [x, y] of PIPS[value]!) {
    const r = value === 1 ? S * 0.12 : S * 0.085;
    const pg = ctx.createRadialGradient(x * S - r * 0.3, y * S - r * 0.3, r * 0.1, x * S, y * S, r);
    pg.addColorStop(0, value === 1 ? "#d0483c" : "#3a352f");
    pg.addColorStop(1, value === 1 ? "#8f1f17" : "#0e0c0a");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x * S, y * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Un panneau de texte (à vendre, la banque…) */
export function signTexture(text: string, bg: string, fg: string, w = 256, h = 96, family = FONT_TEXT, border?: string) {
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = h * 0.08;
    ctx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  }
  ctx.fillStyle = fg;
  fitFont(ctx, text, h * 0.5, w * 0.84, "800", family);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + h * 0.03);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Le texte lisible sur un fond : foncé sur les couleurs claires, blanc sur les autres */
function inkOn(bg: string): string {
  const c = new THREE.Color(bg);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.62 ? INK : "#ffffff";
}

/**
 * L'étiquette au-dessus d'une case : le prix d'une case libre (fond crème), le loyer chez son propriétaire (à sa couleur),
 * avec des points pour le niveau ; grisée si elle est hypothéquée
 */
export function tagTexture(text: string, color: string | null, level: number, muted: boolean): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [canvas, ctx] = makeCanvas(W, H);
  const bg = muted ? "#a9adb1" : (color ?? "#fffaf0");
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(10, 8, W - 20, 70, 26);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 5;
  ctx.strokeStyle = color && !muted ? "#ffffff" : "rgba(40, 32, 20, 0.55)";
  ctx.stroke();
  ctx.fillStyle = muted ? "#ffffff" : color ? inkOn(color) : INK;
  fitFont(ctx, text, 50, W - 50, "800", FONT_NUM);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, 45);
  // Le niveau : cinq points, pleins jusqu'au niveau atteint
  if (level > 0) {
    for (let k = 0; k < 5; k++) {
      const x = W / 2 + (k - 2) * 26;
      ctx.beginPath();
      ctx.arc(x, 101, 9, 0, Math.PI * 2);
      ctx.fillStyle = k < level ? (color ?? "#e2bd6e") : "rgba(255, 255, 255, 0.85)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Des hachures pour une case hypothéquée */
export function hatchTexture() {
  const S = 64;
  const [canvas, ctx] = makeCanvas(S, S);
  ctx.fillStyle = "rgba(30, 26, 20, 0.42)";
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(240, 200, 60, 0.75)";
  ctx.lineWidth = 9;
  for (let n = -2; n < 4; n++) {
    ctx.beginPath();
    ctx.moveTo(n * 32, S);
    ctx.lineTo(n * 32 + S, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export { FONT_NUM, FONT_TEXT, FONT_TITLE, INK };
