import { describe, expect, it } from "vitest";
import { coachAt, type CoachStep } from "./coach.tsx";

const STEPS: CoachStep[] = [
  {
    say: "appuie et glisse",
    path: [
      { x: 0.2, y: 0.5, t: 0 },
      { x: 0.2, y: 0.5, t: 100, down: true },
      { x: 0.6, y: 0.5, t: 500, down: true },
      { x: 0.6, y: 0.4, t: 600 },
    ],
  },
  {
    say: "vise",
    path: [
      { x: 0.5, y: 0.2, t: 0 },
      { x: 0.7, y: 0.2, t: 400, down: true },
    ],
  },
];

describe("le coach : la main fantôme suit le geste", () => {
  it("elle part du premier point, appuie, glisse jusqu'au bout", () => {
    expect(coachAt(STEPS, 0)).toMatchObject({ step: 0, x: 0.2, y: 0.5, down: false });
    const mid = coachAt(STEPS, 300);
    expect(mid.down).toBe(true);
    expect(mid.x).toBeGreaterThan(0.3);
    expect(mid.x).toBeLessThan(0.5);
    expect(mid.since).toBeCloseTo(200);
  });

  it("après une pause, l'étape suivante, puis on recommence", () => {
    // La première étape dure 600 ms, plus 700 ms de pause
    expect(coachAt(STEPS, 1300 + 10).step).toBe(1);
    expect(coachAt(STEPS, 1300 + 1100 + 5).step).toBe(0);
  });
});
