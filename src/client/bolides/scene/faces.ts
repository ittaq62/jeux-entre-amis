// Le visage de chaque pilote, dessiné sur une toile : sa photo de profil s'il en a une, sinon son avatar dessiné.

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { AvatarConfig } from "../../../shared/avatar.ts";
import { AvatarDrawing } from "../../components/Avatar.tsx";
import { photoUrl } from "../../lib/api.ts";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** L'avatar dessiné, en SVG autonome */
function avatarSvg(avatar: AvatarConfig, size: number): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(createElement(AvatarDrawing, { avatar, size })));
  let markup = host.querySelector("svg")?.outerHTML ?? "";
  root.unmount();
  if (markup && !markup.includes("xmlns=")) markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return markup;
}

/** Le visage d'un pilote sur une toile carrée (null si rien n'a pu être dessiné) */
export async function faceCanvas(
  seat: { avatar: AvatarConfig; userId: string | null; photo: number },
  size = 128,
): Promise<HTMLCanvasElement | null> {
  try {
    // Hors du rendu de React : l'avatar se dessine dans sa propre petite racine
    await new Promise((r) => setTimeout(r, 0));
    const url = seat.userId ? photoUrl(seat.userId, seat.photo) : null;
    const src = url ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(seat.avatar, size))}`;
    const img = await loadImage(src);
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
