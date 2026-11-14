// L'aperçu d'un article Crampons de la boutique (un club de légende, un ballon, une célébration) : dans les rayons, et en
// grand sur la fiche d'achat, à la boutique comme au salon.

import type { BallId, FeteId } from "../../shared/games/crampons/boutique.ts";
import { CLUB_BY_ID } from "../../shared/games/crampons/clubs.ts";
import type { ShopItem, ShopKind } from "../../shared/shop.ts";
import { FetePicto } from "./FetePicto.tsx";
import { KitShirt } from "./KitShirt.tsx";
import { ballThumbnail } from "./scene/balls.ts";

export const isCramponsKind = (kind: ShopKind) => kind === "club" || kind === "ballon" || kind === "fete";

/** Les vignettes de ballon déjà peintes (une peinture de ballon coûte quelques millisecondes) */
const thumbs = new Map<string, string>();
function thumb(id: BallId, size: number): string {
  const key = `${id}:${size}`;
  let src = thumbs.get(key);
  if (!src) {
    src = ballThumbnail(id, size);
    thumbs.set(key, src);
  }
  return src;
}

export function CramponsLook({ item, big = false }: { item: ShopItem; big?: boolean }) {
  if (item.kind === "club") {
    const club = CLUB_BY_ID.get(item.ref);
    return club ? <KitShirt club={club} size={big ? 110 : 56} /> : null;
  }
  if (item.kind === "ballon") {
    const size = big ? 120 : 64;
    return <img src={thumb(item.ref as BallId, size / 2)} alt="" width={size} height={size} draggable={false} />;
  }
  if (item.kind === "fete") return <FetePicto fete={item.ref as FeteId} size={big ? 90 : 44} />;
  return null;
}
