import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
const { parseAvatar, toPublic, withoutPaidWear } = await import("./users.ts");
const { seededAvatar } = await import("../shared/avatar.ts");

const OLD = { bg: 4, skin: 2, hair: 3, hairColor: 1, eyes: 5, mouth: 2, hat: 3, extra: 2 };

describe("l'avatar lu en base", () => {
  it("un compte d'avant la garde-robe garde exactement son avatar", () => {
    expect(parseAvatar(JSON.stringify(OLD), "u1")).toEqual(OLD);
    // Jamais enregistré, ou abîmé : celui tiré du compte, comme avant
    expect(parseAvatar("{}", "u_8f3k2m9qa")).toEqual(seededAvatar("u_8f3k2m9qa"));
    expect(parseAvatar("pas du json", "u1")).toEqual(seededAvatar("u1"));
  });

  it("ce qu'il porte arrive partout avec lui ; ce qui n'est plus au catalogue est oublié", () => {
    const raw = JSON.stringify({ ...OLD, wear: { hat: "viking", fx: "disparu" } });
    expect(parseAvatar(raw, "u1")).toEqual({ ...OLD, wear: { hat: "viking" } });
    expect(toPublic({ id: "u1", pseudo: "Testeur", avatar: raw, photo_version: 0 }).avatar).toEqual({ ...OLD, wear: { hat: "viking" } });
  });

  it("quand ses achats sont effacés, son avatar perd ce qui s'achète et garde le reste", () => {
    expect(withoutPaidWear(JSON.stringify(OLD))).toBeNull();
    expect(withoutPaidWear("{}")).toBeNull();
    expect(withoutPaidWear("cassé")).toBeNull();
    expect(withoutPaidWear(JSON.stringify({ ...OLD, wear: { outfit: "tshirt" } }))).toBeNull();
    expect(JSON.parse(withoutPaidWear(JSON.stringify({ ...OLD, wear: { hat: "viking", outfit: "tshirt" } }))!)).toEqual({
      ...OLD,
      wear: { outfit: "tshirt" },
    });
    expect(JSON.parse(withoutPaidWear(JSON.stringify({ ...OLD, wear: { hat: "viking" } }))!)).toEqual(OLD);
  });
});
