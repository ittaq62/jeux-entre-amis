// Les skins de chacun : ce qu'il a choisi à la boutique pour chaque jeu, gardé sur son appareil. Dans une tournée, on ne
// passe pas par le salon de chaque jeu : la tournée reçoit les skins de chaque joueur et les confie aux tables qu'elle
// crée, pour que chacun retrouve ses choix habituels dès le départ (son véhicule à Bolides, son pion à Capitale…).

import { isSkinId as isKartSkinId, isVehicleId, type SkinId as KartSkinId, type VehicleId } from "./games/bolides/garage.ts";
import { isTokenId, type TokenId } from "./games/capitale/tokens.ts";
import { isFeteId, type FeteId } from "./games/crampons/boutique.ts";
import { isSkinId as isNavalSkinId, type SkinId as NavalSkinId } from "./games/naval/skins.ts";
import { isBackId, type BackId } from "./games/uno/backs.ts";
import { canUse, feteItem, kartItem, navalItem, tokenItem, unoItem, vehicleItem } from "./shop.ts";

/** Le ballon de Crampons n'y est pas : chacun ne voit que le sien, sur son appareil, sans passer par la table */
export interface Looks {
  unoBack?: BackId;
  navalSkin?: NavalSkinId;
  capitaleToken?: TokenId;
  bolidesVehicle?: VehicleId;
  bolidesSkin?: KartSkinId;
  cramponsFete?: FeteId;
}

/** Seulement des articles connus, chacun à sa place ; le reste est oublié */
export function cleanLooks(raw: unknown): Looks {
  const o = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Looks = {};
  if (isBackId(o.unoBack)) out.unoBack = o.unoBack;
  if (isNavalSkinId(o.navalSkin)) out.navalSkin = o.navalSkin;
  if (isTokenId(o.capitaleToken)) out.capitaleToken = o.capitaleToken;
  if (isVehicleId(o.bolidesVehicle)) out.bolidesVehicle = o.bolidesVehicle;
  if (isKartSkinId(o.bolidesSkin)) out.bolidesSkin = o.bolidesSkin;
  if (isFeteId(o.cramponsFete)) out.cramponsFete = o.cramponsFete;
  return out;
}

/** Seulement ce que le joueur a le droit d'utiliser : ce qui est offert à tous, et ce qu'il a acheté */
export function usableLooks(looks: Looks, owned: ReadonlySet<string>): Looks {
  const out: Looks = {};
  if (looks.unoBack && canUse(unoItem(looks.unoBack), owned)) out.unoBack = looks.unoBack;
  if (looks.navalSkin && canUse(navalItem(looks.navalSkin), owned)) out.navalSkin = looks.navalSkin;
  if (looks.capitaleToken && canUse(tokenItem(looks.capitaleToken), owned)) out.capitaleToken = looks.capitaleToken;
  if (looks.bolidesVehicle && canUse(vehicleItem(looks.bolidesVehicle), owned)) out.bolidesVehicle = looks.bolidesVehicle;
  if (looks.bolidesSkin && canUse(kartItem(looks.bolidesSkin), owned)) out.bolidesSkin = looks.bolidesSkin;
  if (looks.cramponsFete && canUse(feteItem(looks.cramponsFete), owned)) out.cramponsFete = looks.cramponsFete;
  return out;
}

/** Les skins d'un joueur parmi ceux que la tournée confie à une table (déjà vérifiés par la tournée) */
export function lookOf(looks: Record<string, Looks> | null | undefined, userId: string): Looks {
  return cleanLooks(looks?.[userId]);
}
