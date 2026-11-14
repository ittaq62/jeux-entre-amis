import { describe, expect, it } from "vitest";
import { SKIN_IDS, VEHICLE_IDS } from "./games/bolides/garage.ts";
import { TOKENS } from "./games/capitale/tokens.ts";
import { FETES } from "./games/crampons/boutique.ts";
import { SKINS as NAVAL_SKINS } from "./games/naval/skins.ts";
import { BACKS } from "./games/uno/backs.ts";
import { cleanLooks, lookOf, usableLooks, type Looks } from "./looks.ts";
import { feteItem, kartItem, navalItem, SHOP_BY_ID, tokenItem, unoItem, vehicleItem } from "./shop.ts";

const price = (item: string) => SHOP_BY_ID.get(item)!.price;
// Pour chaque jeu, un article offert à tous et un article qui s'achète
const freeBack = BACKS.find((b) => price(unoItem(b.id)) === 0)!.id;
const paidBack = BACKS.find((b) => price(unoItem(b.id)) > 0)!.id;
const paidNaval = NAVAL_SKINS.find((s) => price(navalItem(s.id)) > 0)!.id;
const freeToken = TOKENS.find((t) => price(tokenItem(t.id)) === 0)!.id;
const paidToken = TOKENS.find((t) => price(tokenItem(t.id)) > 0)!.id;
const paidVehicle = VEHICLE_IDS.find((id) => price(vehicleItem(id)) > 0)!;
const freeKart = SKIN_IDS.find((id) => price(kartItem(id)) === 0)!;
const paidKart = SKIN_IDS.find((id) => price(kartItem(id)) > 0)!;
const paidFete = FETES.find((f) => price(feteItem(f.id)) > 0)!.id;

const everything: Looks = {
  unoBack: paidBack,
  navalSkin: paidNaval,
  capitaleToken: paidToken,
  bolidesVehicle: paidVehicle,
  bolidesSkin: paidKart,
  cramponsFete: paidFete,
};

describe("skins de chacun", () => {
  it("ne garde que des articles connus, chacun à sa place", () => {
    expect(cleanLooks(everything)).toEqual(everything);
    expect(
      cleanLooks({
        unoBack: "inconnu",
        navalSkin: paidBack,
        capitaleToken: 3,
        bolidesVehicle: null,
        bolidesSkin: { id: paidKart },
        cramponsFete: paidFete,
        triche: "oui",
      }),
    ).toEqual({ cramponsFete: paidFete });
    for (const raw of [null, undefined, "kart", 12, []]) expect(cleanLooks(raw)).toEqual({});
  });

  it("ne garde que ce que le joueur a le droit d'utiliser", () => {
    // Rien d'acheté : seuls les articles offerts passent
    expect(usableLooks({ ...everything, unoBack: freeBack, capitaleToken: freeToken, bolidesSkin: freeKart }, new Set())).toEqual({
      unoBack: freeBack,
      capitaleToken: freeToken,
      bolidesSkin: freeKart,
    });
    // Tout acheté : tout passe
    const owned = new Set([
      unoItem(paidBack),
      navalItem(paidNaval),
      tokenItem(paidToken),
      vehicleItem(paidVehicle),
      kartItem(paidKart),
      feteItem(paidFete),
    ]);
    expect(usableLooks(everything, owned)).toEqual(everything);
    // Un seul article acheté
    expect(usableLooks(everything, new Set([vehicleItem(paidVehicle)]))).toEqual({ bolidesVehicle: paidVehicle });
  });

  it("donne à une table les skins d'un joueur, ou rien s'il n'en a pas envoyé", () => {
    const looks = { u1: { bolidesVehicle: paidVehicle, bolidesSkin: paidKart }, u2: { unoBack: "faux" } as unknown as Looks };
    expect(lookOf(looks, "u1")).toEqual({ bolidesVehicle: paidVehicle, bolidesSkin: paidKart });
    expect(lookOf(looks, "u2")).toEqual({});
    expect(lookOf(looks, "u3")).toEqual({});
    expect(lookOf(undefined, "u1")).toEqual({});
  });
});
