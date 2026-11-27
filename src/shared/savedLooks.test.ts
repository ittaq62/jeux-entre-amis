import { describe, expect, it } from "vitest";
import { cleanSavedLooks, patchSavedLooks, SAVED_LOOKS_MAX } from "./savedLooks.ts";

describe("les apparences gardées sur le compte", () => {
  it("ne garde que des clés connues aux valeurs acceptables", () => {
    expect(
      cleanSavedLooks({
        "p:bolidesVehicle": "soucoupe",
        "p:inconnu": "x",
        "p:unoBack": "<script>",
        "s:billard-skin": { cue: "rouge" },
        "s:autre": { a: 1 },
        "s:bowling-skin": "pas un objet",
      }),
    ).toEqual({ "p:bolidesVehicle": "soucoupe", "s:billard-skin": { cue: "rouge" } });
    expect(cleanSavedLooks(null)).toEqual({});
    expect(cleanSavedLooks([1, 2])).toEqual({});
  });

  it("une modification remplace, null efface, l'inconnu est ignoré", () => {
    const base = { "p:unoBack": "or", "p:navalSkin": "pirate" };
    expect(patchSavedLooks(base, { "p:unoBack": "neon", "p:navalSkin": null, "p:pirate": "x" })).toEqual({ "p:unoBack": "neon" });
  });

  it("refuse un ensemble trop gros", () => {
    const big = { "s:billard-skin": { x: "a".repeat(900) }, "s:bowling-skin": { x: "a".repeat(900) } };
    const out = patchSavedLooks({}, { ...big, "s:minigolf-balle": { x: "a".repeat(900) }, "s:culbute-combattant": { x: "a".repeat(900) } });
    expect(out === null || JSON.stringify(out).length <= SAVED_LOOKS_MAX).toBe(true);
    expect(patchSavedLooks({}, { "s:billard-skin": { x: "a".repeat(2000) } })).toEqual({});
  });
});
