import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "../../shared/protocol.ts";

const get = vi.fn<(path: string) => Promise<unknown>>();
vi.mock("../lib/api.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/api.ts")>();
  return { ...real, api: { ...real.api, get: (path: string) => get(path) } };
});

const { ApiError } = await import("../lib/api.ts");
const { useSession } = await import("./session.ts");

const me = {
  user: { id: "u1", pseudo: "Neuf", email: "neuf@example.test", avatar: {}, photo: 0, admin: false },
  pending: null,
  games: ["uno", "naval"],
  tour: true,
} as unknown as MeResponse;

describe("la vérification de la session", () => {
  beforeEach(() => {
    useSession.setState({ loaded: false, unreachable: false, user: null, pending: null, games: ["uno"], tour: false, beta: [] });
    get.mockReset();
  });

  it("charge le compte connecté", async () => {
    get.mockResolvedValue(me);
    await useSession.getState().load();
    const s = useSession.getState();
    expect(s.loaded).toBe(true);
    expect(s.unreachable).toBe(false);
    expect(s.user?.pseudo).toBe("Neuf");
    expect(s.games).toEqual(["uno", "naval"]);
  });

  it("sans session, on n'est pas connecté (ce n'est pas une panne)", async () => {
    get.mockResolvedValue({ user: null, pending: null });
    await useSession.getState().load();
    expect(useSession.getState()).toMatchObject({ loaded: true, unreachable: false, user: null });
  });

  it("une coupure au chargement ne fait pas croire qu'on est déconnecté", async () => {
    get.mockRejectedValue(new ApiError("Connexion impossible. Vérifie ta connexion internet.", 0));
    await useSession.getState().load();
    expect(useSession.getState()).toMatchObject({ loaded: true, unreachable: true, user: null });
    // Le réseau revient : le compte arrive, sans repasser par la connexion
    get.mockResolvedValue(me);
    await useSession.getState().load();
    expect(useSession.getState()).toMatchObject({ unreachable: false, user: { pseudo: "Neuf" } });
  });

  it("une coupure plus tard ne déconnecte pas un compte déjà chargé", async () => {
    get.mockResolvedValue(me);
    await useSession.getState().load();
    get.mockRejectedValue(new ApiError("Une erreur est survenue.", 502));
    await useSession.getState().load();
    expect(useSession.getState()).toMatchObject({ unreachable: true, user: { pseudo: "Neuf" }, games: ["uno", "naval"] });
  });
});
