import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./games/crampons/view.ts";
import { DEFAULT_SETTINGS as BOLIDES_DEFAULTS } from "./games/bolides/race.ts";
import { DEFAULT_SETTINGS as BRICKS_DEFAULTS } from "./games/bricks/engine.ts";
import { DEFAULT_SETTINGS as CAPITALE_DEFAULTS } from "./games/capitale/engine.ts";
import { DEFAULT_SETTINGS as MECHE_DEFAULTS } from "./games/meche/engine.ts";
import { DEFAULT_SETTINGS as NAVAL_DEFAULTS } from "./games/naval/engine.ts";
import { DEFAULT_SETTINGS as UNO_DEFAULTS } from "./games/uno/engine.ts";
import type { GameId } from "./protocol.ts";
import {
  applyDrawnRules,
  cleanDraw,
  drawnKeys,
  drawNotice,
  drawnRules,
  drawRules,
  hostDraw,
  hostPatch,
  withoutDrawnKeys,
} from "./randomRules.ts";
import { random } from "./rng.ts";
import { findVariant, TOUR_GAMES, variantSettings } from "./tour.ts";

const DEFAULTS: Record<GameId, object> = {
  uno: UNO_DEFAULTS,
  naval: NAVAL_DEFAULTS,
  bricks: BRICKS_DEFAULTS,
  capitale: CAPITALE_DEFAULTS,
  meche: MECHE_DEFAULTS,
  bolides: BOLIDES_DEFAULTS,
  crampons: DEFAULT_CONFIG,
};

const seeded = (seed: number) => {
  const h = { rng: seed };
  return () => random(h);
};

describe("règles au hasard d'une table", () => {
  it("tire, pour chaque jeu du site, une variante de la tournée qui existe", () => {
    for (const game of TOUR_GAMES) {
      const rnd = seeded(7);
      for (let k = 0; k < 40; k++) expect(findVariant(game, drawRules(game, rnd))).not.toBeNull();
    }
  });

  it("au UNO, « pas de UNO d'avance » tombe parfois, parfois pas, avec les deux jeux de cartes", () => {
    const rnd = seeded(13);
    const seen = new Set(Array.from({ length: 300 }, () => drawRules("uno", rnd)));
    for (const base of ["classique", "no-mercy"]) {
      expect(seen).toContain(base);
      expect(seen).toContain(`${base}+sans-avance`);
    }
  });

  it("chaque jeu peut tomber sur chacune de ses variantes", () => {
    for (const game of TOUR_GAMES) {
      const rnd = seeded(11);
      const seen = new Set(Array.from({ length: 300 }, () => drawRules(game, rnd).split("+")[0]));
      expect(seen.size).toBeGreaterThan(2);
    }
  });

  it("un nouveau tirage change de règles quand il y a le choix", () => {
    const rnd = seeded(3);
    let previous = drawRules("uno", rnd);
    for (let k = 0; k < 50; k++) {
      const next = drawRules("uno", rnd, previous);
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it("les réglages tirés sont ceux de la variante, partis des réglages habituels du jeu", () => {
    for (const game of TOUR_GAMES) {
      const defaults = DEFAULTS[game];
      const rnd = seeded(5);
      for (let k = 0; k < 30; k++) {
        const id = drawRules(game, rnd);
        const out = applyDrawnRules(game, defaults, defaults, id) as Record<string, unknown>;
        expect(out).toEqual({ ...defaults, ...variantSettings(game as "uno", id) });
      }
    }
  });

  it("garde les réglages de l'hôte qui ne sont pas des règles, et remet les autres à leur valeur habituelle", () => {
    const host = { ...UNO_DEFAULTS, jumpIn: true, stacking: false, turnSeconds: 60, endMode: "points" as const, noEarlyUno: true };
    const out = applyDrawnRules("uno", host, UNO_DEFAULTS, "classique");
    // Classique : les +2 et les +4 se cumulent, pas d'interception, et le UNO d'avance permis (rien tiré à part)
    expect(out.stacking).toBe(true);
    expect(out.jumpIn).toBe(false);
    expect(out.noEarlyUno).toBe(false);
    // Le chrono et la fin de partie restent ceux de l'hôte
    expect(out.turnSeconds).toBe(60);
    expect(out.endMode).toBe("points");
    // « Pas de UNO d'avance » tiré à part, Classique comme No Mercy, quel que soit le choix de l'hôte
    const off = { ...host, noEarlyUno: false };
    expect(applyDrawnRules("uno", off, UNO_DEFAULTS, "classique+sans-avance")).toMatchObject({ noEarlyUno: true, variant: "classic" });
    expect(applyDrawnRules("uno", off, UNO_DEFAULTS, "no-mercy+sans-avance")).toMatchObject({ noEarlyUno: true, variant: "nomercy" });

    const naval = applyDrawnRules(
      "naval",
      { ...NAVAL_DEFAULTS, touching: true, botLevel: "amiral" as const },
      NAVAL_DEFAULTS,
      "salve+colles",
    );
    expect(naval).toMatchObject({ shots: "salvo", touching: true, grid: 10, botLevel: "amiral" });
    const capitale = applyDrawnRules(
      "capitale",
      { ...CAPITALE_DEFAULTS, teamCount: 2 as const, minutes: 60 },
      CAPITALE_DEFAULTS,
      "monopole",
    );
    expect(capitale).toMatchObject({ monopoly: true, teamCount: 2, minutes: 60, specials: true });
  });

  it("sans tirage, ou avec un tirage inconnu, les réglages ne changent pas", () => {
    const s = { ...NAVAL_DEFAULTS, grid: 12 as const };
    expect(applyDrawnRules("naval", s, NAVAL_DEFAULTS, null)).toBe(s);
    expect(applyDrawnRules("naval", s, NAVAL_DEFAULTS, "inconnue")).toBe(s);
    expect(cleanDraw("naval", "inconnue")).toBeNull();
    expect(cleanDraw("naval", "arsenal+colles")).toBe("arsenal+colles");
    expect(cleanDraw("naval", 3)).toBeNull();
  });

  it("pendant un tirage, l'hôte ne règle plus à la main ce que le tirage décide", () => {
    expect(drawnKeys("naval").sort()).toEqual(["arsenal", "grid", "shots", "touching"]);
    expect(drawnKeys("uno")).toContain("stacking");
    // Au UNO, « pas de UNO d'avance » est tiré à part : il se verrouille avec le reste
    expect(drawnKeys("uno")).toContain("noEarlyUno");
    expect(withoutDrawnKeys("uno", { noEarlyUno: true, turnSeconds: 15 })).toEqual({ turnSeconds: 15 });
    expect(drawnKeys("capitale")).not.toContain("teamCount");
    expect(withoutDrawnKeys("naval", { grid: 8, turnSeconds: 15 })).toEqual({ turnSeconds: 15 });
    expect(hostPatch("naval", "salve", { grid: 8, botLevel: "mousse" })).toEqual({ botLevel: "mousse" });
    expect(hostPatch("naval", null, { grid: 8 })).toEqual({ grid: 8 });
  });

  it("la demande de l'hôte : tirer, retirer, revenir aux règles au choix en gardant celles tirées", () => {
    const rnd = seeded(9);
    expect(hostDraw("naval", null, NAVAL_DEFAULTS, NAVAL_DEFAULTS, undefined, rnd)).toBeNull();
    expect(hostDraw("naval", null, NAVAL_DEFAULTS, NAVAL_DEFAULTS, false, rnd)).toBeNull();
    const on = hostDraw("naval", null, NAVAL_DEFAULTS, NAVAL_DEFAULTS, true, rnd)!;
    expect(findVariant("naval", on.draw)).not.toBeNull();
    expect(on.notice).toContain("Règles tirées au sort");
    const again = hostDraw("naval", on.draw, NAVAL_DEFAULTS, NAVAL_DEFAULTS, true, rnd)!;
    expect(again.draw).not.toBe(on.draw);
    const off = hostDraw("naval", "eclair", NAVAL_DEFAULTS, NAVAL_DEFAULTS, false, rnd)!;
    expect(off.draw).toBeNull();
    expect(off.settings.grid).toBe(8);
    expect(off.notice).toContain("l'hôte les choisit");
  });

  it("annonce les règles tirées par leur nom et ce qu'elles changent, avec les mots d'une table", () => {
    expect(drawNotice("bolides", "sprint", "start")).toBe(
      "Règles tirées au sort pour cette partie : Sprint. Deux tours seulement : pas le droit à l'erreur.",
    );
    expect(drawNotice("naval", "salve+colles", "next")).toContain(
      "Pour la prochaine partie, règles tirées au sort : Salve, navires collés.",
    );
    expect(drawNotice("uno", "no-mercy+sans-avance", "start")).toContain(
      "Règles tirées au sort pour cette partie : No Mercy, pas de UNO d'avance. ",
    );
    // À une table, Capitale ne dure pas les 20 minutes de la tournée : c'est l'hôte qui règle la durée
    expect(drawnRules("capitale", "classique")!.blurb).not.toContain("20 minutes");
    expect(drawnRules("capitale", "monopole")).toEqual(findVariant("capitale", "monopole"));
  });
});
