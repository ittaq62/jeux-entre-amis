// Le visage de chaque pilote, dessiné sur une toile : sa photo de profil s'il en a une, sinon son avatar dessiné
// (pour l'étiquette au-dessus des karts) ; et la peau de sa tête en 3D, avec les traits de son avatar devant.

import { createElement, type FunctionComponent } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import { AvatarDrawing, AvatarFace } from "../../components/Avatar.tsx";
import { photoUrl } from "../../lib/api.ts";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** Un dessin de React (l'avatar, le visage seul), en SVG autonome */
function svgOf<P extends object>(component: FunctionComponent<P>, props: P): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(createElement(component, props)));
  let markup = host.querySelector("svg")?.outerHTML ?? "";
  root.unmount();
  if (markup && !markup.includes("xmlns=")) markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return markup;
}

const svgUrl = (markup: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

/** Le visage d'un pilote sur une toile carrée (null si rien n'a pu être dessiné) */
export async function faceCanvas(
  seat: { avatar: AvatarConfig; userId: string | null; photo: number },
  size = 128,
): Promise<HTMLCanvasElement | null> {
  try {
    // Hors du rendu de React : l'avatar se dessine dans sa propre petite racine
    await new Promise((r) => setTimeout(r, 0));
    const url = seat.userId ? photoUrl(seat.userId, seat.photo) : null;
    const img = await loadImage(url ?? svgUrl(svgOf(AvatarDrawing, { avatar: seat.avatar, size })));
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d")!;
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return c;
  } catch {
    return null;
  }
}

/** La taille de la peau dépliée d'une tête : 360° de large, 180° de haut */
const HEAD_W = 512;
const HEAD_H = 256;
/** Le visage couvre 110° autour du devant de la tête (en largeur comme en hauteur) */
const FACE_SPAN = 110 / 360;

/**
 * La peau de la tête en 3D, dépliée comme une carte du monde : le teint partout, et les yeux, la bouche, les
 * lunettes de l'avatar au milieu du devant (là où une sphère de three.js regarde vers +z).
 */
export async function headCanvas(avatar: AvatarConfig): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = HEAD_W;
  c.height = HEAD_H;
  const g = c.getContext("2d")!;
  g.fillStyle = AVATAR_SKINS[avatar.skin] ?? AVATAR_SKINS[0]!;
  g.fillRect(0, 0, HEAD_W, HEAD_H);
  try {
    await new Promise((r) => setTimeout(r, 0));
    const img = await loadImage(svgUrl(svgOf(AvatarFace, { avatar, size: 256 })));
    const size = HEAD_W * FACE_SPAN;
    g.drawImage(img, HEAD_W * 0.25 - size / 2, HEAD_H * 0.5 - size / 2, size, size);
  } catch {
    // Sans le dessin, la tête reste au teint de l'avatar
  }
  return c;
}
