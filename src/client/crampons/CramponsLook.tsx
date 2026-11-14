// L'aperçu d'un article Crampons de la boutique (un club de légende, un ballon, une célébration) : dans les rayons, et en
// grand sur la fiche d'achat, à la boutique comme au salon.

import { lazy, Suspense } from "react";
import { FETE_BY_ID, type BallId, type FeteId } from "../../shared/games/crampons/boutique.ts";
import { CLUB_BY_ID, CLUBS, type KitColors } from "../../shared/games/crampons/clubs.ts";
import type { ShopItem, ShopKind } from "../../shared/shop.ts";
import { FetePicto } from "./FetePicto.tsx";
import { KitShirt } from "./KitShirt.tsx";
import { ballThumbnail } from "./scene/balls.ts";

// La vitrine 3D ne se charge qu'à l'ouverture d'une fiche d'achat : la boutique reste légère
const PlayerStageView = lazy(() => import("./PlayerStage.tsx"));

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

/**
 * `big` : la fiche d'achat, où l'on voit un joueur du club en 3D, ou la célébration jouée par un joueur (dans `kit`, le
 * maillot de son équipe au salon ; à la boutique, celui du premier club).
 */
export function CramponsLook({ item, big = false, kit }: { item: ShopItem; big?: boolean; kit?: KitColors }) {
  if (item.kind === "club") {
    const club = CLUB_BY_ID.get(item.ref);
    if (!club) return null;
    const flat = <KitShirt club={club} size={big ? 110 : 56} />;
    if (!big) return flat;
    return (
      <div className="cr-look-stage">
        <Suspense fallback={flat}>
          <PlayerStageView
            actors={[{ kit: club.home, shirt: 10 }]}
            framing="solo"
            ratio={4 / 3}
            fallback={flat}
            label={`Un joueur ${club.name} dans son maillot`}
          />
        </Suspense>
      </div>
    );
  }
  if (item.kind === "ballon") {
    const size = big ? 120 : 64;
    return <img src={thumb(item.ref as BallId, size / 2)} alt="" width={size} height={size} draggable={false} />;
  }
  if (item.kind === "fete") {
    const fete = FETE_BY_ID.get(item.ref as FeteId);
    const flat = <FetePicto fete={item.ref as FeteId} size={big ? 90 : 44} />;
    if (!big || !fete) return flat;
    return (
      <div className="cr-look-stage">
        <Suspense fallback={flat}>
          <PlayerStageView
            actors={[{ kit: kit ?? CLUBS[0]!.home, shirt: 10 }]}
            pose={fete.pose}
            framing="celebration"
            ratio={4 / 3}
            fallback={flat}
            label={`La célébration : ${fete.blurb}`}
          />
        </Suspense>
      </div>
    );
  }
  return null;
}
