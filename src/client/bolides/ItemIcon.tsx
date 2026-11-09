import { useMemo, type CSSProperties } from "react";
import { ITEM_KINDS, rouletteStrip, type ItemKind } from "../../shared/games/bolides/items.ts";
import atlasUrl from "./items-atlas.webp";

/** La planche d'images : une case par objet, dans l'ordre de ITEM_KINDS (elle se refait sur /dev/objets) */
export const ATLAS_COLS = 5;
export const ATLAS_ROWS = 3;
export const ATLAS_CELL = 220;
export { atlasUrl };

/** La famille d'un objet : elle donne la couleur de la case */
export type ItemFamily = "elan" | "attaque" | "piege" | "defense" | "pouvoir";

export const ITEM_FAMILY: Record<ItemKind, ItemFamily> = {
  turbo: "elan",
  turbo3: "elan",
  ressort: "elan",
  petard: "attaque",
  fusee: "attaque",
  bowling: "attaque",
  tarte: "attaque",
  bombe: "attaque",
  orage: "attaque",
  klaxon: "attaque",
  huile: "piege",
  bouclier: "defense",
  arc: "pouvoir",
  geant: "pouvoir",
  aimant: "pouvoir",
};

/** La position d'un objet dans la planche, en pourcentages (pour background-position) */
export function atlasPosition(item: ItemKind): string {
  const i = ITEM_KINDS.indexOf(item);
  return `${((i % ATLAS_COLS) / (ATLAS_COLS - 1)) * 100}% ${(Math.floor(i / ATLAS_COLS) / (ATLAS_ROWS - 1)) * 100}%`;
}

/** L'image de chaque objet, dans sa case */
export function ItemIcon({ item, size = 48 }: { item: ItemKind; size?: number }) {
  return (
    <span
      className="item-icon"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${atlasUrl})`,
        backgroundSize: `${ATLAS_COLS * 100}% ${ATLAS_ROWS * 100}%`,
        backgroundPosition: atlasPosition(item),
      }}
    />
  );
}

/**
 * La roue qui tourne dans la case : un ruban d'images qui défile, freine, dépasse un peu et revient sur l'objet gagné.
 * Tout est dans une seule animation CSS : rien à recalculer pendant qu'elle tourne. Le `key` la relance à chaque caisse.
 */
export function ItemReel({ final, size }: { final: ItemKind; size: number }) {
  const strip = useMemo(() => rouletteStrip(final, Math.random), [final]);
  const style = { "--cell": `${size}px`, "--cells": strip.length - 1 } as CSSProperties;
  return (
    <span className="item-reel" style={style} aria-hidden="true">
      <span className="item-reel-strip">
        {strip.map((item, i) => (
          <ItemIcon key={i} item={item} size={size} />
        ))}
      </span>
    </span>
  );
}
