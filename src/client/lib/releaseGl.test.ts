import { describe, expect, it } from "vitest";
import { releaseRenderer } from "./releaseGl.ts";

function renderer(connected: boolean) {
  const calls: string[] = [];
  return {
    calls,
    domElement: { isConnected: connected } as HTMLCanvasElement,
    dispose: () => calls.push("dispose"),
    forceContextLoss: () => calls.push("perdu"),
  };
}

describe("rendre le contexte WebGL en quittant un jeu", () => {
  it("une toile qui a quitté la page : le moteur est vidé, puis son contexte rendu", () => {
    const r = renderer(false);
    releaseRenderer(r);
    expect(r.calls).toEqual(["dispose", "perdu"]);
  });

  it("une toile encore affichée (la revanche la reprend) garde son contexte", () => {
    const r = renderer(true);
    releaseRenderer(r);
    expect(r.calls).toEqual(["dispose"]);
  });
});
