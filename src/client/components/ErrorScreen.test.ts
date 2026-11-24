import { describe, expect, it } from "vitest";
import { isStaleChunk } from "./ErrorScreen.tsx";

describe("isStaleChunk", () => {
  it("reconnaît un morceau du site qui n'arrive plus, selon les navigateurs", () => {
    // Chrome et Edge
    expect(isStaleChunk(new TypeError("Failed to fetch dynamically imported module: https://x/assets/HomePage-abc.js"))).toBe(true);
    // Safari
    expect(isStaleChunk(new TypeError("Importing a module script failed."))).toBe(true);
    // Firefox
    expect(isStaleChunk(new TypeError("error loading dynamically imported module: https://x/assets/a.js"))).toBe(true);
    // Le préchargement de Vite
    expect(isStaleChunk(new Error("Unable to preload CSS for /assets/HomePage-abc.css"))).toBe(true);
  });

  it("laisse passer les vraies erreurs de la page", () => {
    expect(isStaleChunk(new TypeError("Cannot read properties of undefined (reading 'pseudo')"))).toBe(false);
    expect(isStaleChunk("quelque chose")).toBe(false);
    expect(isStaleChunk(null)).toBe(false);
  });
});
