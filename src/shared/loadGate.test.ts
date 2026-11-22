import { describe, expect, it } from "vitest";
import {
  forgetPlayer,
  gatePassed,
  gateWakeAt,
  LOAD_COUNTDOWN_MS,
  LOAD_MAX_MS,
  markLoaded,
  openGate,
  settleGate,
  stillLoading,
} from "./loadGate.ts";

describe("le chargement de tous avant le départ", () => {
  it("attend que chacun ait chargé, puis lance un court compte à rebours", () => {
    const g = openGate(["a", "b"], 1000);
    expect(stillLoading(g)).toEqual(["a", "b"]);
    expect(markLoaded(g, "a", g.id)).toBe(true);
    expect(settleGate(g, 2000)).toBe(false);
    expect(gatePassed(g, 2000)).toBe(false);
    expect(markLoaded(g, "b", g.id)).toBe(true);
    expect(settleGate(g, 3000)).toBe(true);
    expect(g.goAt).toBe(3000 + LOAD_COUNTDOWN_MS);
    expect(gatePassed(g, 3000 + LOAD_COUNTDOWN_MS - 1)).toBe(false);
    expect(gatePassed(g, 3000 + LOAD_COUNTDOWN_MS)).toBe(true);
    // Une seule fois
    expect(settleGate(g, 4000)).toBe(false);
  });

  it("ne bloque pas les autres au-delà du délai maximum", () => {
    const g = openGate(["a", "lent"], 0);
    markLoaded(g, "a", g.id);
    expect(settleGate(g, LOAD_MAX_MS - 1)).toBe(false);
    expect(gateWakeAt(g, LOAD_MAX_MS - 1)).toBe(LOAD_MAX_MS);
    expect(settleGate(g, LOAD_MAX_MS)).toBe(true);
    expect(gatePassed(g, LOAD_MAX_MS + LOAD_COUNTDOWN_MS)).toBe(true);
    // Le retardataire arrive après : rien ne change
    expect(markLoaded(g, "lent", g.id)).toBe(true);
    expect(settleGate(g, LOAD_MAX_MS + 10)).toBe(false);
  });

  it("n'attend plus un joueur parti ou déconnecté", () => {
    const g = openGate(["a", "parti"], 0);
    markLoaded(g, "a", g.id);
    expect(forgetPlayer(g, "parti")).toBe(true);
    expect(settleGate(g, 10)).toBe(true);
    expect(stillLoading(g)).toEqual([]);
  });

  it("sans personne à attendre (que des bots, ou tout le monde parti), le compte à rebours part tout de suite", () => {
    const g = openGate([], 500);
    expect(g.goAt).toBe(500 + LOAD_COUNTDOWN_MS);
  });

  it("un « chargé » d'un départ précédent (revanche) ne compte pas", () => {
    const first = openGate(["a"], 1000);
    const second = openGate(["a"], 1000, first);
    expect(second.id).not.toBe(first.id);
    expect(markLoaded(second, "a", first.id)).toBe(false);
    expect(markLoaded(second, "a", second.id)).toBe(true);
    expect(markLoaded(second, "a", second.id)).toBe(false);
  });

  it("sans chargement en cours, rien n'est retenu", () => {
    expect(gatePassed(null, 0)).toBe(true);
    expect(gateWakeAt(null, 0)).toBeNull();
    expect(stillLoading(null)).toEqual([]);
  });
});
