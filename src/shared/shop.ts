// La boutique : tout ce qui se débloque dans les jeux s'achète avec les points gagnés en jouant, dans l'ordre qu'on veut.
// Les prix sont dans le catalogue de chaque jeu ; un article à 0 point est à tout le monde.

import {
  SKIN_IDS as KART_SKIN_IDS,
  SKINS as KART_SKINS,
  VEHICLE_IDS,
  VEHICLES,
  type SkinId as KartSkinId,
  type VehicleId,
} from "./games/bolides/garage.ts";
import { TOKENS, type TokenId } from "./games/capitale/tokens.ts";
import { SKINS as NAVAL_SKINS, type SkinId as NavalSkinId } from "./games/naval/skins.ts";
import { BACKS, type BackId } from "./games/uno/backs.ts";

export type ShopKind = "naval" | "token" | "vehicle" | "kart" | "uno";

export interface ShopItem {
  id: string;
  kind: ShopKind;
  /** Son identifiant dans le catalogue de son jeu */
  ref: string;
  name: string;
  price: number;
}

export const navalItem = (id: NavalSkinId) => `naval:${id}`;
export const tokenItem = (id: TokenId) => `token:${id}`;
export const vehicleItem = (id: VehicleId) => `vehicle:${id}`;
export const kartItem = (id: KartSkinId) => `kart:${id}`;
export const unoItem = (id: BackId) => `uno:${id}`;

export const SHOP_ITEMS: ShopItem[] = [
  ...NAVAL_SKINS.map((s): ShopItem => ({ id: navalItem(s.id), kind: "naval", ref: s.id, name: s.name, price: s.price })),
  ...TOKENS.map((t): ShopItem => ({ id: tokenItem(t.id), kind: "token", ref: t.id, name: t.name, price: t.price })),
  ...VEHICLE_IDS.map((id): ShopItem => ({
    id: vehicleItem(id),
    kind: "vehicle",
    ref: id,
    name: VEHICLES[id].name,
    price: VEHICLES[id].price,
  })),
  ...KART_SKIN_IDS.map((id): ShopItem => ({
    id: kartItem(id),
    kind: "kart",
    ref: id,
    name: KART_SKINS[id].name,
    price: KART_SKINS[id].price,
  })),
  ...BACKS.map((b): ShopItem => ({ id: unoItem(b.id), kind: "uno", ref: b.id, name: b.name, price: b.price })),
];

export const SHOP_BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

/** Un article s'utilise s'il est offert à tous, ou si le joueur l'a déjà. Un article inconnu ne s'utilise pas. */
export function canUse(item: string, owned: ReadonlySet<string>): boolean {
  return SHOP_BY_ID.get(item)?.price === 0 || owned.has(item);
}

export interface ShopResponse {
  /** Les points qu'il reste à dépenser */
  balance: number;
  owned: string[];
}
