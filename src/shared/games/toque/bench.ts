// Un service entier joué par des commis, sans écran : pour les tests, et pour régler les seuils des étoiles.

import { botInput, newBotTable, newBrain, type BotLevel } from "./bot.ts";
import type { KitchenId } from "./kitchens.ts";
import { createWorld, step, type Input, type ToqueEvent, type World } from "./sim.ts";

export interface ServiceRun {
  world: World;
  score: number;
  served: number;
  failed: number;
  fires: number;
  burnt: number;
  /** Le plus long moment (en secondes) sans rien servir, après la première minute */
  longestDry: number;
  events: Record<string, number>;
}

export function playService(kitchen: KitchenId, bots: number, level: BotLevel, seed: number, duel = false): ServiceRun {
  const owners = Array.from({ length: bots * (duel ? 2 : 1) }, (_, i) => ({
    team: duel ? i % 2 : 0,
    chefs: 1 as const,
    bot: true,
  }));
  const w = createWorld(kitchen, duel, owners, seed);
  const table = newBotTable();
  const brains = w.chefs.map((c) => newBrain(c.slot, level, seed + c.slot * 31));
  const events: Record<string, number> = {};
  let lastServe = 0;
  let longestDry = 0;
  while (w.phase < 2) {
    const inputs: Input[] = w.chefs.map((c) => botInput(w, c.slot, brains[c.slot]!, table));
    const ev: ToqueEvent[] = step(w, inputs);
    for (const e of ev) {
      events[e.k] = (events[e.k] ?? 0) + 1;
      if (e.k === "serve") {
        if (w.frame > w.service + 60 * 30) longestDry = Math.max(longestDry, (w.frame - lastServe) / 30);
        lastServe = w.frame;
      }
    }
  }
  const t = w.teams[0]!;
  return {
    world: w,
    score: t.score,
    served: t.served,
    failed: t.failed,
    fires: events.fire ?? 0,
    burnt: events.burn ?? 0,
    longestDry,
    events,
  };
}
