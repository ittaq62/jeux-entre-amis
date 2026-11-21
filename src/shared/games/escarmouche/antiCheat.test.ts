import { describe, expect, it } from "vitest";
import { worldOf } from "./match.ts";
import { B, newSoldier, spreadOf, stepSoldier, type Cmd } from "./soldier.ts";
import { ViewLag } from "./viewLag.ts";

const cmd = (s: number, over: Partial<Cmd> = {}): Cmd => ({ s, mx: 0, mz: 0, yaw: 0, pitch: 0, b: 0, vt: 0, ...over });

describe("Escarmouche : la dispersion, tirée par le serveur", () => {
  const world = worldOf("hameau");

  it("sans hasard donné (l'appareil), les plombs suivent le tirage fixe ; avec celui du serveur, ils s'en écartent", () => {
    const a = newSoldier(-40, 0, 0, 0, "pompe");
    const b = newSoldier(-40, 0, 0, 0, "pompe");
    const c = newSoldier(-40, 0, 0, 0, "pompe");
    const fixedA = stepSoldier(a, cmd(1, { b: B.fire }), world).shots[0]!.dirs;
    const fixedB = stepSoldier(b, cmd(1, { b: B.fire }), world).shots[0]!.dirs;
    // Deux appareils qui jouent le même pas voient les mêmes plombs (de quoi montrer ses impacts tout de suite)
    expect(fixedB).toEqual(fixedA);
    let draws = 0;
    const rand = () => {
      draws++;
      return (draws * 0.618034) % 1;
    };
    const server = stepSoldier(c, cmd(1, { b: B.fire }), world, true, undefined, rand).shots[0]!.dirs;
    // Huit plombs, deux tirages chacun (l'écart et son angle), pris au hasard du serveur
    expect(draws).toBe(16);
    expect(server).toHaveLength(8);
    expect(server).not.toEqual(fixedA);
  });

  it("le hasard du serveur garde la dispersion de l'arme : chaque plomb reste dans son cône", () => {
    for (let k = 0; k < 20; k++) {
      const s = newSoldier(-40, 0, 0, 0, "pompe");
      const half = (spreadOf(s) / 2) * (Math.PI / 180);
      const dirs = stepSoldier(s, cmd(1, { b: B.fire }), world, true, undefined, Math.random).shots[0]!.dirs;
      expect(dirs).toHaveLength(8);
      // Regardant vers -z : l'écart de chaque plomb à l'axe
      for (const d of dirs) expect(Math.acos(Math.min(1, -d[2]))).toBeLessThanOrEqual(half + 1e-9);
    }
  });
});

describe("Escarmouche : l'heure du tir, bridée par le retard habituel", () => {
  it("un joueur régulier tire à l'heure qu'il annonce", () => {
    const lag = new ViewLag();
    let now = 10_000;
    for (let k = 0; k < 120; k++) {
      now += 16;
      expect(lag.admit(cmd(k, { vt: now - 140 - (k % 7) * 3 }), now)).toBe(now - 140 - (k % 7) * 3);
    }
    now += 16;
    expect(lag.admit(cmd(200, { vt: now - 150, b: B.fire }), now)).toBe(now - 150);
  });

  it("un tir qui prétend voir 300 ms plus tôt que d'habitude est ramené au retard habituel, plus la marge", () => {
    const lag = new ViewLag();
    let now = 10_000;
    for (let k = 0; k < 120; k++) {
      now += 16;
      lag.admit(cmd(k, { vt: now - 120 }), now);
    }
    now += 16;
    const vt = lag.admit(cmd(200, { vt: now - 420, b: B.fire }), now);
    expect(now - vt).toBe(120 + 45);
    // Le couteau aussi
    now += 16;
    expect(now - lag.admit(cmd(201, { vt: now - 420, b: B.melee }), now)).toBe(120 + 45);
  });

  it("des tirs qui avancent l'heure ne changent pas la mesure ; tant qu'on en sait trop peu, pas de bride", () => {
    const lag = new ViewLag();
    let now = 10_000;
    for (let k = 0; k < 10; k++) {
      now += 16;
      lag.admit(cmd(k, { vt: now - 100 }), now);
    }
    expect(lag.limit()).toBeNull();
    now += 16;
    expect(lag.admit(cmd(50, { vt: now - 330, b: B.fire }), now)).toBe(now - 330);
    for (let k = 10; k < 60; k++) {
      now += 16;
      lag.admit(cmd(k, { vt: now - 100 }), now);
      now += 16;
      lag.admit(cmd(1000 + k, { vt: now - 330, b: B.fire }), now);
    }
    expect(lag.limit()).toBe(145);
  });

  it("une connexion qui ralentit pour de bon relève la bride en quelques dixièmes de seconde", () => {
    const lag = new ViewLag();
    let now = 10_000;
    for (let k = 0; k < 180; k++) {
      now += 16;
      lag.admit(cmd(k, { vt: now - 80 }), now);
    }
    for (let k = 0; k < 30; k++) {
      now += 16;
      lag.admit(cmd(500 + k, { vt: now - 260 }), now);
    }
    now += 16;
    expect(lag.admit(cmd(900, { vt: now - 260, b: B.fire }), now)).toBe(now - 260);
  });
});
