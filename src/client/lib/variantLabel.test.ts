import { describe, expect, it } from "vitest";
import { TRACK_IDS, TRACKS } from "../../shared/games/bolides/track.ts";
import { MODES as ESC_MODES } from "../../shared/games/escarmouche/rules.ts";
import { COURSES } from "../../shared/games/minigolf/courses.ts";
import { VARIANT_NAMES as BILLARD_VARIANTS } from "../../shared/games/billard/match.ts";
import { BILLARD_NAMES, COURSE_NAMES, ESCARMOUCHE_NAMES, TRACK_NAMES, tableLabel, variantName } from "./variantLabel.ts";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

describe("les noms recopiés suivent ceux des jeux", () => {
  it("chaque circuit de Bolides, miroirs compris", () => {
    for (const [id, track] of Object.entries(TRACKS)) expect(variantName("bolides", id)).toBe(track.name);
    expect(Object.keys(TRACK_NAMES).sort()).toEqual([...TRACK_IDS].sort());
  });

  it("chaque parcours du minigolf", () => {
    expect(Object.keys(COURSE_NAMES).sort()).toEqual(Object.keys(COURSES).sort());
    for (const [id, course] of Object.entries(COURSES)) expect(COURSE_NAMES[id]).toBe(course.name);
  });

  it("chaque jeu du billard", () => {
    expect(Object.keys(BILLARD_NAMES).sort()).toEqual(Object.keys(BILLARD_VARIANTS).sort());
    for (const [id, name] of Object.entries(BILLARD_VARIANTS)) expect(BILLARD_NAMES[id]).toBe(lowerFirst(name));
  });

  it("chaque mode d'Escarmouche a un nom", () => {
    for (const mode of ESC_MODES) expect(ESCARMOUCHE_NAMES[mode]).toBeTruthy();
  });
});

describe("tableLabel", () => {
  it("lit la variante à la suite du nom du jeu", () => {
    expect(tableLabel("uno", "classic")).toBe("UNO classique");
    expect(tableLabel("uno", "nomercy")).toBe("UNO No Mercy");
    expect(tableLabel("naval", "teams")).toBe("Bataille navale en équipes");
    expect(tableLabel("bricks", "sprint")).toBe("Briques solo 40 lignes");
    expect(tableLabel("capitale", "bankrupt")).toBe("Capitale jusqu'à la faillite");
    expect(tableLabel("capitale", "timed")).toBe("Capitale en partie rapide");
    expect(tableLabel("meche", "commune")).toBe("Mèche classique");
    expect(tableLabel("meche", "rallonge")).toBe("Mèche à rallonge");
    expect(tableLabel("culbute", "subite")).toBe("Culbute en mort subite");
  });

  it("met une virgule quand la variante est un nom", () => {
    expect(tableLabel("meche", "chacun")).toBe("Mèche, chacun sa mèche");
    expect(tableLabel("meche", "hasard")).toBe("Mèche, mode au hasard");
    expect(tableLabel("bolides", "volcan")).toBe("Bolides, Le Volcan");
    expect(tableLabel("bolides", "foret-miroir")).toBe("Bolides, La Forêt (miroir)");
    expect(tableLabel("bolides", "hasard")).toBe("Bolides, circuit au hasard");
    expect(tableLabel("crampons", "7")).toBe("Crampons, 7 contre 7");
    expect(tableLabel("escarmouche", "conquete")).toBe("Escarmouche, conquête");
    expect(tableLabel("minigolf", "lune")).toBe("Minigolf, Base lunaire");
    expect(tableLabel("bowling", "spares")).toBe("Bowling, défi des spares");
    expect(tableLabel("billard", "neuf")).toBe("Billard, la bille 9");
  });

  it("garde le nom du jeu seul pour une variante sans nom ou inconnue", () => {
    expect(tableLabel("bowling", "classique")).toBe("Bowling");
    expect(tableLabel("bolides", "circuit-disparu")).toBe("Bolides");
    expect(tableLabel("escarmouche", "")).toBe("Escarmouche");
  });
});
