import { describe, expect, it } from "vitest";
import { chronoStars, ghostAt, ghostRun, ghostTargets, simulateGhost } from "./ghost.ts";
import { BOLIDES_STARS, CHRONO_GOALS, STAR_TRACKS } from "./stars.ts";
import { validRule } from "../../stars.ts";
import { getTrack, locate, TRACK_IDS, TRACKS } from "./track.ts";

describe("les fantômes du contre-la-montre", () => {
  it("refont exactement la même course : le serveur et le jeu voient le même fantôme", () => {
    const t = getTrack("foire");
    const a = simulateGhost(t, "or", 3);
    const b = simulateGhost(t, "or", 3);
    expect(b.total).toBe(a.total);
    expect(b.path).toEqual(a.path);
  });

  it.each(TRACK_IDS.flatMap((id) => [id, `${id}-miroir` as const]))(
    "%s : le bronze, l'argent puis l'or, chacun nettement plus rapide",
    (id) => {
      const g = ghostTargets(id);
      expect(g.bronze).toBeGreaterThan(g.argent * 1.03);
      expect(g.argent).toBeGreaterThan(g.or * 1.03);
      // Trois tours en moins de quatre minutes, même pour le bronze
      expect(g.bronze).toBeLessThan(240_000);
      expect(ghostRun(id, "or").laps).toHaveLength(3);
    },
  );

  it("une étoile par fantôme battu", () => {
    const g = ghostTargets("port");
    expect(chronoStars("port", g.bronze + 1)).toBe(0);
    expect(chronoStars("port", g.bronze)).toBe(1);
    expect(chronoStars("port", g.argent - 1)).toBe(2);
    expect(chronoStars("port", g.or - 1)).toBe(3);
  });

  it("se rejoue le long de la route, et disparaît à l'arrivée", () => {
    const t = getTrack("vignes");
    const run = ghostRun("vignes", "argent");
    for (const ms of [0, 5_000, 40_000, run.total - 500]) {
      const p = ghostAt(run, ms)!;
      expect(Math.abs(locate(t, p.x, p.z).d)).toBeLessThan(t.wall);
    }
    expect(ghostAt(run, run.total + 1000)).toBeNull();
  });

  it("les seuils des étoiles du contre-la-montre sont bien les temps des fantômes (sinon, recopier ghostTargets ici)", () => {
    for (const id of TRACK_IDS.flatMap((x) => [x, `${x}-miroir` as const])) {
      const g = ghostTargets(id);
      expect(CHRONO_GOALS[id], id).toEqual([g.bronze, g.argent, g.or]);
    }
    for (const m of BOLIDES_STARS.maps) expect(validRule(m.rule), m.id).toBe(true);
    expect(BOLIDES_STARS.maps).toHaveLength(4 + 20);
    // Les noms recopiés pour l'accueil suivent les vrais circuits
    expect(STAR_TRACKS.map(([id]) => id)).toEqual(TRACK_IDS);
    for (const [id, name] of STAR_TRACKS) expect(name).toBe(TRACKS[id].name);
  });
});
