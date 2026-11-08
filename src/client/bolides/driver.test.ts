import { describe, expect, it } from "vitest";
import { newKart } from "../../shared/games/bolides/physics.ts";
import { getTrack, gridSlot } from "../../shared/games/bolides/track.ts";
import { LATE_BOOST, LocalDriver, ROCKET_BOOST } from "./driver.ts";

const GO = 100_000;

function driver() {
  const t = getTrack("port");
  const slot = gridSlot(t, 0);
  return new LocalDriver(t, newKart(t, slot.x, slot.z, slot.h), 30);
}

/** Le compte à rebours, image par image ; `presses` : quand le bouton est tenu, en millisecondes avant le vert, [début, fin] */
function countdown(d: LocalDriver, ...presses: [number, number][]) {
  for (let left = 3400; left > 0; left -= 16)
    d.waiting(
      presses.some(([from, to]) => left <= from && left > to),
      GO - left,
      GO,
    );
}

describe("le départ canon", () => {
  it("part fort pour qui appuie pendant le 2e feu, même sans garder le bouton", () => {
    const d = driver();
    countdown(d, [1500, 1400]);
    expect(d.launchPress).toBe("canon");
    expect(d.launch()).toBe("canon");
    expect(d.kart.boost).toBe(ROCKET_BOOST);
  });

  it("donne un petit élan à qui appuie au dernier feu", () => {
    const d = driver();
    countdown(d, [600, 0]);
    expect(d.launch()).toBe("late");
    expect(d.kart.boost).toBe(LATE_BOOST);
  });

  it("ne donne rien à qui appuie trop tôt, même en appuyant de nouveau au bon moment", () => {
    const d = driver();
    countdown(d, [2600, 2400], [1500, 1400]);
    expect(d.launch()).toBe("early");
    expect(d.kart.boost).toBe(0);
  });

  it("ne compte pas un bouton déjà enfoncé quand les feux commencent", () => {
    const d = driver();
    countdown(d, [3400, 0]);
    expect(d.launchPress).toBeNull();
    expect(d.launch()).toBeNull();
    expect(d.kart.boost).toBe(0);
  });

  it("accepte de relâcher un bouton tenu avant les feux, puis d'appuyer au bon moment", () => {
    const d = driver();
    countdown(d, [3400, 2900], [1800, 1700]);
    expect(d.launchPress).toBe("canon");
  });

  it("ne donne le turbo qu'une fois", () => {
    const d = driver();
    countdown(d, [1500, 1400]);
    d.launch();
    d.kart.boost = 0;
    expect(d.launch()).toBeNull();
    expect(d.kart.boost).toBe(0);
  });

  it("ne donne rien à qui n'appuie pas", () => {
    const d = driver();
    countdown(d);
    expect(d.launch()).toBeNull();
    expect(d.kart.boost).toBe(0);
  });
});
