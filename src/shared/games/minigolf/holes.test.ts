import { describe, expect, it } from "vitest";
import { navDist, navOf, planShot, type BotLevel } from "./bot.ts";
import { BALL_R, motionPeriod, poseAt, posePoint, strokeLimit, tileAt, type Course, type Part } from "./course.ts";
import { COURSES, courseOf, readyCourses, type HoleRef } from "./courses.ts";
import { inRing, inRingSlow, inRings } from "./geom.ts";
import { pathHeightSlow, specHeight, stripHeightSlow, type HeightSpec } from "./height.ts";
import { DEFAULT_PHYS, simulateShot, type PhysOpts } from "./physics.ts";

const refs: HoleRef[] = readyCourses().flatMap((c) => COURSES[c].holes.map((_, i) => ({ c, i, m: false })));

function physOf(ref: HoleRef): PhysOpts {
  return { ...DEFAULT_PHYS, g: COURSES[ref.c].g };
}

/** Un bot joue le trou seul ; renvoie ses coups (pénalités comprises), ou la limite + 1 */
function botPlays(ref: HoleRef, level: BotLevel, seed: number): number {
  const c = courseOf(ref);
  const phys = physOf(ref);
  const rng = { rng: seed };
  let ball = { x: c.tee.x, y: c.tee.y, z: c.tee.z };
  let strokes = 0;
  let tick = 0;
  const limit = strokeLimit(c.def.par);
  while (strokes < limit) {
    const plan = planShot(c, ball, tick, phys, level, rng);
    tick += plan.wait;
    const r = simulateShot(c, ball, plan.a, plan.p, tick, phys);
    strokes++;
    tick = r.end + 240;
    if (r.outcome === "in") return strokes;
    if (r.outcome === "lost") strokes++;
    else ball = { x: r.x, y: r.y, z: r.z };
  }
  return limit + 1;
}

/** Les allées en coupes et les chemins d'une forme de sol (dans les sommes et les maximums aussi) */
function lanes(spec: HeightSpec): Extract<HeightSpec, { k: "strip" | "path" }>[] {
  if (typeof spec === "number") return [];
  if (spec.k === "strip" || spec.k === "path") return [spec];
  if (spec.k === "sum" || spec.k === "max") return spec.of.flatMap(lanes);
  return [];
}

/** Une pièce mobile vue comme une suite de boules (un mur : son épaisseur ; un poteau, un cylindre : leur rayon) */
function partBalls(part: Part): { p: [number, number, number]; r: number }[] {
  const out: { p: [number, number, number]; r: number }[] = [];
  if (part.k === "wall") {
    const n = Math.max(1, Math.ceil(Math.hypot(part.b[0] - part.a[0], part.b[1] - part.a[1]) / Math.max(0.01, part.t)));
    const ny = Math.max(1, Math.ceil((part.y1 - part.y0) / Math.max(0.01, part.t)));
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= ny; j++)
        out.push({
          p: [
            part.a[0] + ((part.b[0] - part.a[0]) * i) / n,
            part.y0 + ((part.y1 - part.y0) * j) / ny,
            part.a[1] + ((part.b[1] - part.a[1]) * i) / n,
          ],
          r: part.t,
        });
  } else if (part.k === "post") {
    const ny = Math.max(1, Math.ceil((part.y1 - part.y0) / Math.max(0.01, part.r)));
    for (let j = 0; j <= ny; j++) out.push({ p: [part.c[0], part.y0 + ((part.y1 - part.y0) * j) / ny, part.c[1]], r: part.r });
  } else {
    const n = Math.max(
      1,
      Math.ceil(Math.hypot(part.b[0] - part.a[0], part.b[1] - part.a[1], part.b[2] - part.a[2]) / Math.max(0.01, part.r)),
    );
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      out.push({
        p: [part.a[0] + (part.b[0] - part.a[0]) * k, part.a[1] + (part.b[1] - part.a[1]) * k, part.a[2] + (part.b[2] - part.a[2]) * k],
        r: part.r,
      });
    }
  }
  return out;
}

/** Les murs et les bordures fixes que traverse une pièce mobile pendant un tour de son mouvement (au centimètre près) */
function moverCrossings(c: Course): string[] {
  const out = new Set<string>();
  for (const mv of c.movers) {
    const per = motionPeriod(mv.def.motion);
    const balls = mv.def.parts.flatMap(partBalls);
    for (let s = 0; s < 48; s++) {
      const pose = poseAt(mv.def.motion, (per * s) / 48);
      for (const b of balls) {
        const [x, y, z] = posePoint(pose, b.p[0], b.p[1], b.p[2]);
        for (const w of c.walls) {
          const ex = w.bx - w.ax;
          const ez = w.bz - w.az;
          const l2 = ex * ex + ez * ez || 1;
          const t = Math.max(0, Math.min(1, ((x - w.ax) * ex + (z - w.az) * ez) / l2));
          const lim = b.r + w.t - 0.01;
          if (lim <= 0 || (w.ax + ex * t - x) ** 2 + (w.az + ez * t - z) ** 2 >= lim * lim) continue;
          const bot = w.a0 + (w.b0 - w.a0) * t;
          const top = w.a1 + (w.b1 - w.a1) * t;
          if (y + b.r - 0.01 <= bot || y - b.r + 0.01 >= top) continue;
          out.add(`${mv.def.look} → ${w.kind}:${w.look ?? ""}`);
        }
      }
    }
  }
  return [...out];
}

/**
 * Ce qui traverse exprès : la porte du coucou glisse dans son cadre (la façade), la tige des pistons sort de la
 * bordure d'acier (le corps du piston est dehors)
 */
const MOVER_CROSSINGS_OK = new Set(["porte → wall:facade", "piston → rail:acier"]);

describe("minigolf : les trous des parcours", () => {
  it.each(refs.map((r) => [`${r.c} ${r.i + 1}`, r] as const))(
    "%s : rien de ce qui bouge ne passe à travers une bordure ou un mur",
    (_, ref) => {
      const bad = moverCrossings(courseOf(ref)).filter((k) => !MOVER_CROSSINGS_OK.has(k));
      expect(bad).toEqual([]);
    },
  );

  it("la hauteur d'une allée en coupes ou d'un chemin, trouvée vite, est exactement celle de la boucle complète", () => {
    let n = 0;
    for (const ref of refs)
      for (const m of [false, true]) {
        const c = courseOf({ ...ref, m });
        for (const t of c.tiles)
          for (const st of lanes(t.h)) {
            const pts = st.k === "strip" ? [...st.left, ...st.right] : st.pts;
            const xs = pts.map((p) => p[0]);
            const zs = pts.map((p) => p[1]);
            // Sur l'allée, sur ses bords, et bien au-delà (la hauteur est définie partout)
            for (let x = Math.min(...xs) - 1.5; x <= Math.max(...xs) + 1.5; x += 0.071)
              for (let z = Math.min(...zs) - 1.5; z <= Math.max(...zs) + 1.5; z += 0.083) {
                const fast = specHeight(st, x, z);
                const slow = st.k === "strip" ? stripHeightSlow(st, x, z) : pathHeightSlow(st, x, z);
                if (!Object.is(fast, slow)) expect(fast, `${ref.c} ${ref.i + 1}${m ? " (envers)" : ""} en (${x}, ${z})`).toBe(slow);
                n++;
              }
          }
      }
    expect(n).toBeGreaterThan(10_000);
  });

  it("un long contour, vu par bandes, dit exactement la même chose que côté par côté", () => {
    let n = 0;
    for (const ref of refs)
      for (const m of [false, true]) {
        const c = courseOf({ ...ref, m });
        for (const t of c.tiles)
          for (const ring of t.rings) {
            if (ring.length <= 24) continue;
            const xs = ring.map((p) => p[0]);
            const zs = ring.map((p) => p[1]);
            // Une grille serrée, plus les sommets eux-mêmes (les cas limites)
            for (let x = Math.min(...xs) - 0.3; x <= Math.max(...xs) + 0.3; x += 0.047)
              for (let z = Math.min(...zs) - 0.3; z <= Math.max(...zs) + 0.3; z += 0.053) {
                if (inRing(x, z, ring) !== inRingSlow(x, z, ring))
                  expect(inRing(x, z, ring), `${ref.c} ${ref.i + 1} en (${x}, ${z})`).toBe(inRingSlow(x, z, ring));
                n++;
              }
            for (const p of ring) expect(inRing(p[0], p[1], ring)).toBe(inRingSlow(p[0], p[1], ring));
          }
      }
    expect(n).toBeGreaterThan(10_000);
  });

  it.each(refs.map((r) => [`${r.c} ${r.i + 1}`, r] as const))("%s est bien formé", (_, ref) => {
    const c = courseOf(ref);
    // Les morceaux ne se chevauchent pas
    for (let x = c.box.x0 + 0.0137; x < c.box.x1; x += 0.093) {
      for (let z = c.box.z0 + 0.0071; z < c.box.z1; z += 0.093) {
        let n = 0;
        for (const t of c.tiles) if (inRings(x, z, t.rings)) n++;
        expect(n, `deux morceaux en (${x.toFixed(2)}, ${z.toFixed(2)})`).toBeLessThanOrEqual(1);
      }
    }
    // Le départ et les trous sont sur du sol jouable, loin des murs
    for (const p of [[c.tee.x, c.tee.z], ...c.cups.map((k) => [k.x, k.z])] as [number, number][]) {
      const t = tileAt(c, p[0], p[1]);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(c.tiles[t]!.phys.hazard).toBeFalsy();
    }
    // Le départ mène au trou
    expect(navDist(navOf(c), c.tee.x, c.tee.z)).toBeLessThan(Infinity);
    // Une balle posée au départ ne bouge pas
    const still = simulateShot(c, { x: c.tee.x, y: c.tee.y, z: c.tee.z }, c.tee.aim, 0, 0, physOf(ref));
    expect(Math.hypot(still.x - c.tee.x, still.z - c.tee.z)).toBeLessThan(0.5);
    expect(c.tee.y).toBeGreaterThan(BALL_R - 1);
  });

  it.each(refs.map((r) => [`${r.c} ${r.i + 1}`, r] as const))("%s se joue : un bot fort finit près du par", (_, ref) => {
    const c = courseOf(ref);
    const scores = [1, 2, 3].map((s) => botPlays(ref, "fort", s * 7919 + ref.i));
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(Math.max(...scores), `coups : ${scores.join(", ")}`).toBeLessThanOrEqual(strokeLimit(c.def.par));
    expect(avg, `coups : ${scores.join(", ")}`).toBeLessThanOrEqual(c.def.par + 1.5);
  });
});
