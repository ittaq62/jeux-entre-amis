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
import { BALLS, FETES, type BallId, type FeteId } from "./games/crampons/boutique.ts";
import { CLUBS } from "./games/crampons/clubs.ts";
import { CAMOS, type CamoId } from "./games/escarmouche/camos.ts";
import { BOMBS, type BombId } from "./games/meche/bombs.ts";
import { SKINS as NAVAL_SKINS, type SkinId as NavalSkinId } from "./games/naval/skins.ts";
import { BACKS, type BackId } from "./games/uno/backs.ts";
import { WEAR, WEAR_SLOTS, WEAR_BY_ID, type AvatarWear, type WearInfo } from "./wardrobe.ts";

export type ShopKind = "perso" | "naval" | "token" | "vehicle" | "kart" | "uno" | "club" | "ballon" | "fete" | "bombe" | "camo";

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
/** Crampons : un club (ceux de légende s'achètent), un ballon, une célébration de but */
export const clubItem = (id: string) => `club:${id}`;
export const ballItem = (id: BallId) => `ballon:${id}`;
export const feteItem = (id: FeteId) => `fete:${id}`;
/** Mèche : ce qui saute au bout de la mèche */
export const bombItem = (id: BombId) => `bombe:${id}`;
/** Escarmouche : le camouflage des armes */
export const camoItem = (id: CamoId) => `camo:${id}`;
/** Le personnage de profil : ce qu'il porte (wardrobe.ts) */
export const wearItem = (id: string) => `perso:${id}`;

export const SHOP_ITEMS: ShopItem[] = [
  ...WEAR.map((i): ShopItem => ({ id: wearItem(i.id), kind: "perso", ref: i.id, name: i.name, price: i.price })),
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
  ...CLUBS.map((c): ShopItem => ({ id: clubItem(c.id), kind: "club", ref: c.id, name: c.name, price: c.price ?? 0 })),
  ...BALLS.map((b): ShopItem => ({ id: ballItem(b.id), kind: "ballon", ref: b.id, name: b.name, price: b.price })),
  ...FETES.map((f): ShopItem => ({ id: feteItem(f.id), kind: "fete", ref: f.id, name: f.name, price: f.price })),
  ...BOMBS.map((b): ShopItem => ({ id: bombItem(b.id), kind: "bombe", ref: b.id, name: b.name, price: b.price })),
  ...CAMOS.map((c): ShopItem => ({ id: camoItem(c.id), kind: "camo", ref: c.id, name: c.name, price: c.price })),
];

export const SHOP_BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

/** Un article s'utilise s'il est offert à tous, ou si le joueur l'a déjà. Un article inconnu ne s'utilise pas. */
export function canUse(item: string, owned: ReadonlySet<string>): boolean {
  return SHOP_BY_ID.get(item)?.price === 0 || owned.has(item);
}

/** La première chose que porte le personnage sans l'avoir (ni offerte ni achetée), null si tout est à lui */
export function unownedWear(wear: AvatarWear | undefined, owned: ReadonlySet<string>): WearInfo | null {
  for (const slot of WEAR_SLOTS) {
    const info = wear?.[slot] ? WEAR_BY_ID.get(wear[slot]!) : undefined;
    if (info && !canUse(wearItem(info.id), owned)) return info;
  }
  return null;
}

/** Ce qu'il porte, sans ce qui n'est plus à lui (undefined s'il ne lui reste rien) */
export function usableWear(wear: AvatarWear | undefined, owned: ReadonlySet<string>): AvatarWear | undefined {
  const out: AvatarWear = {};
  for (const slot of WEAR_SLOTS) {
    const id = wear?.[slot];
    if (id && WEAR_BY_ID.get(id)?.slot === slot && canUse(wearItem(id), owned)) out[slot] = id;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface ShopResponse {
  /** Les points qu'il reste à dépenser */
  balance: number;
  owned: string[];
}
