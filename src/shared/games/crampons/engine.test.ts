import { describe, expect, it } from "vitest";
import { BALL_R, groundSpeedFor, makeBall, rollTime, stepBall } from "./ball.ts";
import type { TeamSetup } from "./clubs.ts";
import { createMatch, pushAction, setInput, stepMatch } from "./match.ts";
import { attackDir, type Match, type MatchEvent, type MatchSettings, type Team } from "./model.ts";
import { DT, GOAL_H, GOAL_HALF, HALF_L, HALF_W } from "./pitch.ts";

const teams: [TeamSetup, TeamSetup] = [
  { name: "A", formation: "433", rating: 76 },
  { name: "B", formation: "442", rating: 76 },
];
const settings = (over: Partial<MatchSettings> = {}): MatchSettings => ({
  halfMinutes: 2,
  side: 11,
  level: 2,
  offside: true,
  fouls: true,
  draw: "none",
  ...over,
});

function play(m: Match, until: (e: MatchEvent[]) => boolean, limit = 60000): MatchEvent[] {
  for (let i = 0; i < limit && m.phase !== "over"; i++) {
    const ev = stepMatch(m);
    if (until(ev)) return ev;
  }
  return [];
}

/** Attend que le jeu ait repris après le coup d'envoi */
function toPlay(m: Match) {
  for (let i = 0; i < 400 && m.phase !== "play"; i++) stepMatch(m);
  expect(m.phase).toBe("play");
}

/** Pose le ballon libre à un endroit, avec une vitesse */
function setBall(m: Match, x: number, y: number, z: number, vx: number, vy: number, vz: number, last: number) {
  Object.assign(m.ball, { x, y, z, vx, vy, vz, curl: 0 });
  m.owner = -1;
  m.lastTouch = last;
  m.pass = null;
  for (const p of m.players) {
    if (Math.abs(p.x - x) < 25 && Math.abs(p.z - z) < 25 && p.role !== "GK") p.x = -attackDir(m, p.team) * 30;
    if (p.role === "GK") p.x = attackDir(m, p.team) * -HALF_L + attackDir(m, p.team) * 0.5;
    p.lockedUntil = m.t + 1;
  }
}

describe("le ballon", () => {
  it("une passe à terre s'arrête là où la formule le prévoit", () => {
    const b = makeBall(0, 0);
    const v = groundSpeedFor(20, 0);
    b.vx = v;
    for (let i = 0; i < 600; i++) stepBall(b, DT);
    expect(b.x).toBeCloseTo(20, 0);
    expect(b.vx).toBe(0);
  });

  it("le temps de trajet d'une passe est juste", () => {
    const b = makeBall(0, 0);
    const v = groundSpeedFor(15, 8);
    const t = rollTime(v, 15);
    b.vx = v;
    let time = 0;
    while (b.x < 15 && time < 10) {
      stepBall(b, DT);
      time += DT;
    }
    expect(Math.abs(time - t)).toBeLessThan(0.08);
  });

  it("il retombe et finit par rouler", () => {
    const b = makeBall(0, 0);
    b.vy = 8;
    b.vx = 6;
    for (let i = 0; i < 300; i++) stepBall(b, DT);
    expect(b.y).toBeCloseTo(BALL_R, 2);
    expect(b.vy).toBe(0);
  });

  it("une frappe sur le poteau rebondit au lieu de le traverser", () => {
    const b = makeBall(HALF_L - 2, GOAL_HALF);
    b.y = 1;
    b.vx = 30;
    b.vy = 2;
    const hits: string[] = [];
    for (let i = 0; i < 12; i++) hits.push(...stepBall(b, DT));
    expect(hits).toContain("post");
    expect(b.x).toBeLessThan(HALF_L);
  });

  it("une frappe sous la barre finit dans les filets sans passer au travers", () => {
    const b = makeBall(HALF_L - 3, 0);
    b.y = 1.2;
    b.vx = 34;
    b.vy = 3;
    for (let i = 0; i < 60; i++) stepBall(b, DT);
    expect(b.x).toBeLessThan(HALF_L + 2.4);
    expect(b.y).toBeLessThan(GOAL_H);
  });
});

describe("un match", () => {
  it("l'ordinateur joue un match entier, sans valeur absurde, ballon et joueurs restant au stade", () => {
    for (const seed of [11, 22, 33]) {
      const m = createMatch(settings(), teams, [], seed);
      let steps = 0;
      let sane = true;
      while (m.phase !== "over" && steps++ < 30000) {
        stepMatch(m);
        const b = m.ball;
        sane &&= Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz);
        for (const p of m.players) {
          sane &&= Number.isFinite(p.x + p.z + p.h);
          if (!p.off) sane &&= Math.abs(p.x) < HALF_L + 4 && Math.abs(p.z) < HALF_W + 4;
        }
      }
      expect(sane).toBe(true);
      expect(m.phase).toBe("over");
      expect(m.period).toBe(2);
      expect(m.flipped).toBe(true);
      expect(m.goals.length).toBe(m.score[0] + m.score[1]);
    }
  });

  it("à graine égale, deux matchs sont identiques", () => {
    const run = () => {
      const m = createMatch(settings(), teams, [], 7);
      while (m.phase !== "over") stepMatch(m);
      return [m.score, m.stats, m.t];
    };
    expect(run()).toEqual(run());
  });

  it("on joue aussi à 5 et à 7", () => {
    for (const side of [5, 7]) {
      const m = createMatch(settings({ side }), teams, [], 5);
      expect(m.players.length).toBe(side * 2);
      while (m.phase !== "over") stepMatch(m);
      expect(m.stats[0].passes + m.stats[1].passes).toBeGreaterThan(5);
    }
  });

  it("un ballon qui entre dans le but compte pour l'attaquant, et le coup d'envoi revient à l'équipe qui a encaissé", () => {
    const m = createMatch(settings(), teams, [], 3);
    toPlay(m);
    const end = attackDir(m, 0);
    setBall(m, end * (HALF_L - 1), 1, 0, end * 25, 0, 0, 9);
    const ev = play(m, (e) => e.some((x) => x.k === "goal"), 60);
    expect(ev.find((x) => x.k === "goal")).toMatchObject({ team: 0 });
    expect(m.score).toEqual([1, 0]);
    expect(m.goals[0]!.own).toBe(false);
    expect(m.phase).toBe("goal");
    expect(m.restart?.team).toBe(1);
  });

  it("marquer contre son camp donne le but à l'adversaire", () => {
    const m = createMatch(settings(), teams, [], 3);
    toPlay(m);
    const end = attackDir(m, 0);
    setBall(m, end * (HALF_L - 1), 1, 0, end * 25, 0, 0, 12);
    play(m, (e) => e.some((x) => x.k === "goal"), 60);
    expect(m.score).toEqual([1, 0]);
    expect(m.goals[0]!.own).toBe(true);
  });

  it("une frappe repoussée dans son but reste le but du tireur", () => {
    const m = createMatch(settings(), teams, [], 3);
    toPlay(m);
    const end = attackDir(m, 0);
    const shooter = m.players.find((p) => p.team === 0 && p.role === "ST")!;
    const keeper = m.players.find((p) => p.team === 1 && p.role === "GK")!;
    setBall(m, end * (HALF_L - 1), 1, 0, end * 25, 0, 0, keeper.i);
    m.shotBy = shooter.i;
    m.shotAt = m.t;
    play(m, (e) => e.some((x) => x.k === "goal"), 60);
    expect(m.score).toEqual([1, 0]);
    expect(m.goals[0]).toMatchObject({ own: false, scorer: shooter.name });
  });

  it("en touche, le ballon revient à l'équipe qui ne l'a pas sorti", () => {
    const m = createMatch(settings(), teams, [], 4);
    toPlay(m);
    setBall(m, 0, BALL_R, HALF_W - 0.5, 0, 0, 9, 3);
    const ev = play(m, (e) => e.some((x) => x.k === "restart"), 60);
    expect(ev.find((x) => x.k === "restart")).toMatchObject({ kind: "throw", team: 1 });
  });

  it("corner ou six mètres, selon qui a touché le ballon en dernier", () => {
    const corner = createMatch(settings(), teams, [], 5);
    toPlay(corner);
    const end = attackDir(corner, 0);
    setBall(corner, end * (HALF_L - 0.5), BALL_R, 12, end * 8, 0, 0, 15);
    expect(play(corner, (e) => e.some((x) => x.k === "restart"), 60).find((x) => x.k === "restart")).toMatchObject({
      kind: "corner",
      team: 0,
    });

    const six = createMatch(settings(), teams, [], 5);
    toPlay(six);
    setBall(six, end * (HALF_L - 0.5), BALL_R, 12, end * 8, 0, 0, 5);
    expect(play(six, (e) => e.some((x) => x.k === "restart"), 60).find((x) => x.k === "restart")).toMatchObject({
      kind: "goalkick",
      team: 1,
    });
  });

  it("les équipes changent de côté à la mi-temps", () => {
    const m = createMatch(settings(), teams, [], 8);
    const before = attackDir(m, 0);
    toPlay(m);
    m.clock = 45 * 60 - 0.01;
    m.ball.x = 0;
    for (let i = 0; i < 400 && m.period === 1; i++) stepMatch(m);
    expect(m.period).toBe(2);
    expect(attackDir(m, 0)).toBe(-before);
  });

  it("les tirs au but désignent un vainqueur", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const m = createMatch(settings({ draw: "penalties" }), teams, [], seed);
      toPlay(m);
      m.period = 2;
      m.clock = 90 * 60 - 0.01;
      m.ball.x = 0;
      m.score = [1, 1];
      for (let i = 0; i < 30000 && m.phase !== "over"; i++) stepMatch(m);
      expect(m.phase).toBe("over");
      expect(m.shootout).not.toBeNull();
      expect([0, 1]).toContain(m.winner);
      const [a, b] = m.shootout!.kicks;
      expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(1);
      expect(a.length).toBeGreaterThanOrEqual(3);
      // En mort subite, l'autre équipe a toujours droit à sa réponse
      if (a.length > 5) expect(b.length).toBe(a.length);
    }
  });

  it("un penalty est marqué le plus souvent, mais pas toujours", () => {
    let kicks = 0;
    let scored = 0;
    for (let seed = 1; seed <= 14; seed++) {
      const m = createMatch(settings({ draw: "penalties" }), teams, [], seed);
      toPlay(m);
      m.period = 2;
      m.clock = 90 * 60 - 0.01;
      m.ball.x = 0;
      m.score = [1, 1];
      for (let i = 0; i < 30000 && m.phase !== "over"; i++) {
        for (const e of stepMatch(m)) {
          if (e.k !== "penalty") continue;
          kicks++;
          if (e.scored) scored++;
        }
      }
    }
    expect(kicks).toBeGreaterThan(100);
    expect(scored / kicks).toBeGreaterThan(0.6);
    expect(scored / kicks).toBeLessThan(0.88);
  });

  it("une équipe garde toujours assez de joueurs, même avec beaucoup de cartons", () => {
    const m = createMatch(settings({ side: 5 }), teams, [], 4);
    toPlay(m);
    // Des fautes de dernier défenseur à répétition : rouge à chaque fois, tant qu'il en reste assez
    let reds = 0;
    for (let k = 0; k < 6; k++) {
      const dir = attackDir(m, 0);
      const left = m.players.filter((p) => p.team === 1 && !p.off && p.role !== "GK");
      const foul = left[0]!;
      const victim = m.players.find((p) => p.team === 0 && p.role !== "GK" && !p.off)!;
      m.phase = "play";
      m.restart = null;
      victim.x = dir * 30;
      victim.z = 0;
      victim.h = dir > 0 ? 0 : Math.PI;
      victim.act = "none";
      for (const p of left) if (p !== foul) p.x = victim.x - dir * 12;
      foul.x = victim.x - dir * 0.6;
      foul.z = 0;
      foul.act = "slide";
      foul.actT = 0.2;
      foul.dirX = dir;
      foul.dirZ = 0;
      foul.lockedUntil = 0;
      m.owner = victim.i;
      m.ball.x = dir * 45;
      m.ball.z = 0;
      for (const e of stepMatch(m)) if (e.k === "card" && e.red) reds++;
    }
    expect(reds).toBe(2);
    expect(m.players.filter((p) => p.team === 1 && !p.off).length).toBe(3);
    // Et le match continue sans accroc jusqu'au bout
    for (let i = 0; i < 20000 && m.phase !== "over"; i++) stepMatch(m);
    expect(m.phase).toBe("over");
  });

  it("après un match nul avec prolongations, on joue jusqu'à 120 minutes", () => {
    const m = createMatch(settings({ draw: "extra" }), teams, [], 9);
    toPlay(m);
    m.period = 2;
    m.clock = 90 * 60 - 0.01;
    m.ball.x = 0;
    m.score = [0, 0];
    let saw3 = false;
    for (let i = 0; i < 40000 && m.phase !== "over"; i++) {
      stepMatch(m);
      if (m.period === 3) saw3 = true;
    }
    expect(saw3).toBe(true);
    expect(m.clock).toBeGreaterThanOrEqual(105 * 60);
  });
});

describe("les commandes", () => {
  const human = (team: Team = 0) => createMatch(settings(), teams, [{ id: "moi", team }], 21);

  it("l'humain dirige un joueur de champ", () => {
    const m = human();
    const h = m.humans[0]!;
    expect(h.active).toBeGreaterThanOrEqual(0);
    expect(m.players[h.active]!.role).not.toBe("GK");
    expect(m.players[h.active]!.human).toBe("moi");
  });

  it("son joueur va où on lui dit", () => {
    const m = human();
    toPlay(m);
    // Personne ne touche le ballon pendant l'essai : l'humain garde le même joueur
    setBall(m, 0, BALL_R, 0, 0, 0, 0, 2);
    for (const q of m.players) q.lockedUntil = m.t + 10;
    const p = m.players[m.humans[0]!.active]!;
    p.x = 20;
    p.z = 0;
    setInput(m, "moi", 0, 1, false, false);
    for (let i = 0; i < 30; i++) stepMatch(m);
    expect(m.players[m.humans[0]!.active]).toBe(p);
    expect(p.z).toBeGreaterThan(1);
  });

  it("il donne le coup d'envoi, puis passe le ballon", () => {
    const m = human();
    for (let i = 0; i < 100 && !m.restart?.ready; i++) stepMatch(m);
    const h = m.humans[0]!;
    expect(m.restart!.taker).toBe(h.active);
    pushAction(m, "moi", "pass", 0.4, -1, 0);
    for (let i = 0; i < 30 && m.phase !== "play"; i++) stepMatch(m);
    expect(m.phase).toBe("play");
    expect(m.stats[0].passes).toBe(1);
  });

  /** Un joueur humain, le ballon au pied, un coéquipier à une distance donnée, personne autour */
  function duo(gap: number) {
    const m = human();
    toPlay(m);
    const h = m.humans[0]!;
    const p = m.players[h.active]!;
    const q = m.players.find((o) => o.team === 0 && o.i !== p.i && o.role !== "GK")!;
    for (const o of m.players) {
      o.x = o.team === 0 ? -20 : 30;
      o.z = -30 + o.i * 2.5;
      o.vx = o.vz = 0;
      o.tx = o.x;
      o.tz = o.z;
      o.act = "none";
    }
    p.x = 0;
    p.z = 0;
    p.h = 0;
    q.x = gap;
    q.z = 6;
    m.owner = p.i;
    m.lastTouch = p.i;
    m.pass = null;
    p.order = null;
    p.lockedUntil = 0;
    return { m, h, p, q };
  }

  it("une passe arrive au receveur même si la touche de direction reste enfoncée", () => {
    const { m, h, q } = duo(20);
    setInput(m, "moi", -1, 0, false, false);
    pushAction(m, "moi", "pass", 0.5, 1, 0.3, q.i);
    for (let i = 0; i < 90 && m.owner !== q.i; i++) stepMatch(m);
    expect(m.owner).toBe(q.i);
    expect(h.active).toBe(q.i);
  });

  it("le ballon va au coéquipier désigné à l'écran, pas à celui qui est dans l'axe", () => {
    const { m, q } = duo(14);
    const autre = m.players.find((o) => o.team === 0 && o.i !== q.i && o.human === null && o.role !== "GK")!;
    autre.x = 18;
    autre.z = -2;
    pushAction(m, "moi", "pass", 0.5, 1, -0.1, q.i);
    stepMatch(m);
    stepMatch(m);
    expect(m.pass?.to).toBe(q.i);
  });

  it("le joueur retrouve ses touches au contrôle", () => {
    const { m, q } = duo(14);
    setInput(m, "moi", 0, 1, false, false);
    pushAction(m, "moi", "pass", 0.5, 1, 0.3, q.i);
    for (let i = 0; i < 90 && m.owner !== q.i; i++) stepMatch(m);
    expect(m.owner).toBe(q.i);
    const z = q.z;
    for (let i = 0; i < 15; i++) stepMatch(m);
    expect(q.z).toBeGreaterThan(z + 1.5);
  });

  it("le crochet donne un coup d'accélération, et il faut attendre avant d'en refaire un", () => {
    const { m, p } = duo(14);
    setInput(m, "moi", 1, 0, false, false);
    for (let i = 0; i < 15; i++) stepMatch(m);
    const normal = Math.hypot(p.vx, p.vz);
    pushAction(m, "moi", "skill", 0, 1, 0);
    for (let i = 0; i < 6; i++) stepMatch(m);
    expect(Math.hypot(p.vx, p.vz)).toBeGreaterThan(normal * 1.25);
    const ready = p.burstReady;
    for (let i = 0; i < 15; i++) stepMatch(m);
    pushAction(m, "moi", "skill", 0, 1, 0);
    stepMatch(m);
    expect(p.burstReady).toBe(ready);
  });

  it("un joueur lancé change de direction sans traîner", () => {
    const { m, p } = duo(14);
    setInput(m, "moi", 1, 0, true, false);
    for (let i = 0; i < 20; i++) stepMatch(m);
    setInput(m, "moi", 0, 1, true, false);
    for (let i = 0; i < 12; i++) stepMatch(m);
    // En 0,4 seconde, il court franchement dans la nouvelle direction
    expect(p.vz).toBeGreaterThan(7);
    expect(Math.abs(p.vx)).toBeLessThan(2);
  });

  it("une action adverse ne fait rien à un joueur qui n'a pas le ballon, et changer de joueur en donne un autre", () => {
    const m = human();
    toPlay(m);
    const h = m.humans[0]!;
    const before = h.active;
    m.owner = -1;
    pushAction(m, "moi", "switch", 0, 0, 0);
    stepMatch(m);
    expect(h.active).not.toBe(before);
    expect(m.players[h.active]!.team).toBe(0);
  });

  it("une frappe fait partir le ballon vers le but adverse", () => {
    const m = human();
    toPlay(m);
    const h = m.humans[0]!;
    const p = m.players[h.active]!;
    const end = attackDir(m, 0);
    p.x = end * 34;
    p.z = 0;
    p.vx = p.vz = 0;
    m.owner = p.i;
    m.lastTouch = p.i;
    pushAction(m, "moi", "shot", 0.7, 0, 0);
    const ev = play(m, (e) => e.some((x) => x.k === "shot"), 30);
    expect(ev.some((x) => x.k === "shot")).toBe(true);
    expect(m.ball.vx * end).toBeGreaterThan(10);
    expect(m.stats[0].shots).toBe(1);
  });
});

describe("le changement de joueur", () => {
  it("quand l'adversaire prend le ballon, l'humain reprend un joueur nettement mieux placé", () => {
    const m = createMatch(settings(), teams, [{ id: "moi", team: 0 }], 31);
    toPlay(m);
    const h = m.humans[0]!;
    const end = attackDir(m, 0);
    const far = m.players[h.active]!;
    far.x = end * 45;
    far.z = 30;
    // Un adversaire seul, au milieu du terrain, sur un ballon arrêté à ses pieds
    const foe = m.players.find((p) => p.team === 1 && p.role !== "GK")!;
    const near = m.players.find((p) => p.team === 0 && p.role !== "GK" && p.i !== far.i)!;
    for (const p of m.players) {
      if (p !== foe && p !== near && p !== far && p.role !== "GK") p.x = -end * 40;
      p.lockedUntil = m.t + 3;
    }
    foe.x = 0;
    foe.z = 0;
    foe.lockedUntil = 0;
    near.x = -end * 3;
    near.z = 2;
    Object.assign(m.ball, { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0 });
    m.owner = -1;
    m.lastTouch = far.i;
    m.pass = null;
    play(m, () => m.owner === foe.i, 30);
    expect(m.owner).toBe(foe.i);
    expect(h.active).toBe(near.i);
  });

  it("après un six mètres, l'humain ne reste pas sur son gardien", () => {
    const m = createMatch(settings(), teams, [{ id: "moi", team: 0 }], 32);
    toPlay(m);
    const end = attackDir(m, 1);
    setBall(m, end * (HALF_L - 0.5), BALL_R, 12, end * 8, 0, 0, 13);
    play(m, (e) => e.some((x) => x.k === "restart"), 60);
    expect(m.restart).toMatchObject({ kind: "goalkick", team: 0 });
    for (let i = 0; i < 120 && !m.restart?.ready; i++) stepMatch(m);
    const h = m.humans[0]!;
    expect(m.players[h.active]!.role).toBe("GK");
    pushAction(m, "moi", "clear", 0.7, attackDir(m, 0), 0);
    for (let i = 0; i < 30 && m.phase !== "play"; i++) stepMatch(m);
    expect(m.phase).toBe("play");
    expect(m.players[h.active]!.role).not.toBe("GK");
  });
});

describe("les remises en jeu", () => {
  it("à l'engagement et sur un coup franc, l'adversaire reste à 9 m 15 du ballon", () => {
    const m = createMatch(settings(), teams, [{ id: "moi", team: 1 }], 21);
    for (let i = 0; i < 400 && !m.restart?.ready; i++) stepMatch(m);
    // L'humain de l'équipe qui n'engage pas fonce vers le ballon : il s'arrête au bord du rond
    const h = m.humans[0]!;
    for (let i = 0; i < 60 && m.phase === "kickoff"; i++) {
      const p = m.players[h.active]!;
      setInput(m, "moi", -p.x, -p.z, true, false);
      stepMatch(m);
      if (m.phase !== "kickoff") break;
      for (const q of m.players) if (q.team === 1 && !q.off) expect(Math.hypot(q.x, q.z)).toBeGreaterThan(9);
    }
  });

  it("un gardien qui tient le ballon ne se le fait pas prendre", () => {
    const m = createMatch(settings(), teams, [{ id: "moi", team: 0 }], 5);
    toPlay(m);
    const end = attackDir(m, 0);
    const gk = m.players.find((p) => p.team === 1 && p.role === "GK")!;
    const me = m.players[m.humans[0]!.active]!;
    gk.x = end * (HALF_L - 6);
    gk.z = 0;
    gk.act = "hold";
    gk.thinkAt = m.t + 5;
    m.owner = gk.i;
    m.lastTouch = gk.i;
    me.x = gk.x - end * 1;
    me.z = 0;
    for (let k = 0; k < 10; k++) {
      pushAction(m, "moi", "tackle", 1, 0, 0);
      for (let i = 0; i < 12; i++) stepMatch(m);
      expect(m.owner).toBe(gk.i);
    }
  });
});

describe("son gardien qui capte le ballon", () => {
  /** Une frappe adverse molle droit sur le gardien de l'humain, jusqu'à ce qu'il la capte dans les mains */
  function caught(seed: number) {
    for (let s = seed; s < seed + 40; s++) {
      const m = createMatch(settings({ offside: false, fouls: false }), teams, [{ id: "moi", team: 0 }], s);
      toPlay(m);
      const dir = attackDir(m, 0);
      const gk = m.players.find((p) => p.team === 0 && p.role === "GK")!;
      const foe = m.players.find((p) => p.team === 1 && p.role !== "GK")!;
      setBall(m, -dir * (HALF_L - 14), 0.3, gk.z, -dir * 11, 0, 0, foe.i);
      for (let i = 0; i < 120 && m.owner !== gk.i; i++) stepMatch(m);
      if (m.owner === gk.i && gk.act === "hold") return { m, gk, dir };
    }
    throw new Error("le gardien n'a jamais capté");
  }

  it("l'humain prend son gardien et relance lui-même, puis retrouve le receveur", () => {
    const { m, gk, dir } = caught(3);
    expect(m.humans[0]!.active).toBe(gk.i);
    // Rien ne part tout seul tant qu'il réfléchit
    for (let i = 0; i < 90; i++) stepMatch(m);
    expect(m.owner).toBe(gk.i);
    const mate = m.players
      .filter((p) => p.team === 0 && p.role !== "GK")
      .sort((a, b) => Math.hypot(a.x - gk.x, a.z - gk.z) - Math.hypot(b.x - gk.x, b.z - gk.z))[0]!;
    const d = Math.hypot(mate.x - gk.x, mate.z - gk.z);
    pushAction(m, "moi", "pass", 0.5, (mate.x - gk.x) / d, (mate.z - gk.z) / d, mate.i);
    for (let i = 0; i < 30 && m.owner === gk.i; i++) stepMatch(m);
    expect(m.owner).not.toBe(gk.i);
    expect(m.pass?.to).toBe(mate.i);
    expect(m.humans[0]!.active).toBe(mate.i);
    expect(Math.sign(m.ball.vx) === dir || Math.abs(m.ball.vz) > Math.abs(m.ball.vx)).toBe(true);
  });

  it("sa frappe est un dégagement vers l'avant, même la touche tournée vers son but", () => {
    const { m, gk, dir } = caught(5);
    for (let i = 0; i < 20; i++) stepMatch(m);
    pushAction(m, "moi", "shot", 0.8, -dir, 0);
    for (let i = 0; i < 30 && m.owner === gk.i; i++) stepMatch(m);
    expect(m.owner).toBe(-1);
    expect(m.ball.vx * dir).toBeGreaterThan(10);
    expect(m.players[m.humans[0]!.active]!.role).not.toBe("GK");
  });

  it("s'il ne fait rien, l'ordinateur relance à sa place au bout de quelques secondes", () => {
    const { m, gk } = caught(7);
    for (let i = 0; i < Math.round(4 / DT) && m.owner === gk.i; i++) stepMatch(m);
    expect(m.owner).toBe(gk.i);
    for (let i = 0; i < Math.round(4 / DT) && m.owner === gk.i; i++) stepMatch(m);
    expect(m.owner).not.toBe(gk.i);
    expect(m.players[m.humans[0]!.active]!.role).not.toBe("GK");
  });

  it("un attaquant collé au gardien ne lui vole pas sa relance", () => {
    let lost = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = createMatch(settings({ offside: false }), teams, [], seed);
      toPlay(m);
      const dir = attackDir(m, 0);
      const gk = m.players.find((p) => p.team === 0 && p.role === "GK")!;
      const foe = m.players.find((p) => p.team === 1 && p.role === "ST")!;
      gk.x = -dir * (HALF_L - 0.5);
      gk.z = 1;
      foe.x = gk.x + dir;
      foe.z = 1.4;
      Object.assign(m.ball, { vx: 0, vy: 0, vz: 0 });
      m.owner = gk.i;
      m.lastTouch = gk.i;
      m.pass = null;
      gk.act = "hold";
      gk.gotAt = m.t;
      gk.thinkAt = m.t + 1.5;
      for (let i = 0; i < 240; i++) {
        stepMatch(m);
        if (m.owner >= 0 && m.players[m.owner]!.team === 1) {
          lost++;
          break;
        }
        if (m.owner >= 0 && m.owner !== gk.i) break;
      }
    }
    expect(lost).toBeLessThanOrEqual(1);
  });
});

describe("le gardien", () => {
  /** Un humain seul face au gardien, à `dist` mètres du but, frappe en visant `az` (1 : le coin) ; rend vrai s'il marque */
  function duel(seed: number, dist: number, az: number): boolean {
    const m = createMatch(settings({ offside: false, fouls: false }), teams, [{ id: "moi", team: 0 }], seed);
    toPlay(m);
    const dir = attackDir(m, 0);
    const me = m.players[m.humans[0]!.active]!;
    for (const p of m.players) {
      if (p === me || (p.team === 1 && p.role === "GK")) continue;
      p.x = -dir * 30 + (p.i % 5);
      p.z = (p.i % 7) * 4 - 12;
      p.vx = p.vz = 0;
    }
    me.x = dir * (HALF_L - dist);
    me.z = 0;
    me.h = dir > 0 ? 0 : Math.PI;
    m.owner = me.i;
    m.lastTouch = me.i;
    for (let i = 0; i < 45; i++) stepMatch(m);
    pushAction(m, "moi", "shot", 0.7, 0, az);
    return play(m, (e) => e.some((x) => x.k === "goal"), 150).length > 0;
  }

  it("une frappe placée dans le coin a ses chances ; une frappe sur le gardien est arrêtée", () => {
    let corner = 0;
    let central = 0;
    const N = 24;
    for (let s = 1; s <= N; s++) {
      if (duel(s * 7 + 1, 16, s % 2 ? 1 : -1)) corner++;
      if (duel(s * 7 + 1, 16, s % 2 ? 0.3 : -0.3)) central++;
    }
    expect(corner / N).toBeGreaterThan(0.25);
    expect(corner / N).toBeLessThan(0.85);
    expect(central / N).toBeLessThan(0.3);
  });
});

describe("la fête d'un but", () => {
  it("le ralenti ne se passe que lorsque tous les humains le demandent", () => {
    const m = createMatch(
      settings(),
      teams,
      [
        { id: "a", team: 0 },
        { id: "b", team: 1 },
      ],
      8,
    );
    toPlay(m);
    const end = attackDir(m, 0);
    const st = m.players.find((p) => p.team === 0 && p.role !== "GK")!;
    setBall(m, end * (HALF_L + 0.3), 0.5, 0, end * 10, 0, 0, st.i);
    play(m, (e) => e.some((x) => x.k === "goal"), 20);
    expect(m.phase).toBe("goal");
    const until = m.phaseUntil;
    // Le premier veut passer : on attend l'autre
    for (let i = 0; i < 90; i++) {
      pushAction(m, "a", "skip", 0, 0, 0);
      stepMatch(m);
    }
    expect(m.phase).toBe("goal");
    expect(m.phaseUntil).toBe(until);
    pushAction(m, "b", "skip", 0, 0, 0);
    play(m, () => m.phase !== "goal", 30);
    expect(m.phase).not.toBe("goal");
    expect(m.t).toBeLessThan(until);
  });
});

describe("le hors-jeu", () => {
  it("un attaquant derrière la défense au départ de la passe est signalé, et sifflé s'il touche le ballon", () => {
    const m = createMatch(settings(), teams, [{ id: "moi", team: 0 }], 13);
    toPlay(m);
    const end = attackDir(m, 0);
    const h = m.humans[0]!;
    const passer = m.players[h.active]!;
    const runner = m.players.find((p) => p.team === 0 && p.i !== passer.i && p.role !== "GK")!;
    for (const p of m.players) {
      if (p.team === 1 && p.role !== "GK") {
        // La ligne de défense, loin de la trajectoire de la passe
        p.x = end * 10;
        p.z = (p.i % 2 ? 1 : -1) * (24 + (p.i % 4));
        p.vx = p.vz = 0;
      }
      if (p.team === 0 && p.i !== passer.i && p.i !== runner.i) p.x = -end * 20;
    }
    passer.x = end * 2;
    passer.z = 0;
    passer.h = end > 0 ? 0 : Math.PI;
    runner.x = end * 24;
    runner.z = 0;
    m.owner = passer.i;
    m.lastTouch = passer.i;
    pushAction(m, "moi", "pass", 0.7, end, 0);
    const ev = play(m, (e) => e.some((x) => x.k === "offside") || e.some((x) => x.k === "restart"), 240);
    expect(ev.some((x) => x.k === "offside")).toBe(true);
    expect(m.restart?.team).toBe(1);
  });
});
