// Ce que chaque joueur a le droit de savoir des autres soldats. Le serveur connaît la place de tout le monde, mais
// n'envoie à chacun que ce qu'il pourrait voir ou entendre : ses coéquipiers ; les adversaires dans sa ligne de vue,
// avec une marge (un peu en avance sur ses pas, un peu de côté), et encore un moment après qu'ils sont sortis du champ
// pour qu'ils ne clignotent pas à l'écran ; ceux qu'on entend (un tir, des pas de course, un rechargement tout près) ;
// celui qui vient de le toucher ; ceux que son équipe a repérés ; le porteur d'un drapeau. Les autres lui arrivent
// « cachés », sans rien d'eux : un client trafiqué ne voit plus à travers les murs.
//
// Les bots ne passent pas par là (ils sont sur le serveur et suivent leurs propres règles de vue), ni les spectateurs
// (ils reçoivent tout, mais en différé : voir la salle).

import { isTeamMode, matchWorld, type EscEvent, type Match } from "./match.ts";
import { eyeOf, heightOf, type Soldier } from "./soldier.ts";
import { P_STRIDE, PF, type EscTick } from "./view.ts";
import type { WeaponId } from "./weapons.ts";
import type { World } from "./world.ts";

export const SIGHT = {
  /** Un adversaire aperçu reste envoyé encore ce temps-là (s) : pas de clignotement au coin d'un mur */
  hold: 1,
  /**
   * On regarde là où chacun sera dans ce temps-là (s) : ce que le serveur sait d'un joueur a du retard sur son écran,
   * et son écran montre les autres un peu dans le passé. Sans ça, un adversaire surgirait d'un coup au coin d'un mur.
   */
  lead: 0.3,
  /** Les yeux un peu de côté (se décaler pour jeter un œil), et les épaules de l'adversaire un peu plus larges (m) */
  eyeSide: 0.6,
  bodySide: 0.36,
  /** Un tir s'entend de partout, et se voit au radar, pendant ce temps-là (s) */
  loud: 2.5,
  /** Au silencieux, on ne l'entend que de près */
  quiet: { r: 35, t: 1 },
  /** Les pas de qui court (m) */
  steps: 26,
  /** Recharger, lancer une grenade, frapper au couteau : tout près */
  noise: { r: 16, t: 1.2 },
  /** Celui qui vient de le toucher (s), et celui qui l'a éliminé (jusqu'à son retour au combat, à peu près) */
  hurt: 2,
  killed: 4.5,
  /** Chaque paire joueur-adversaire est revue au plus souvent tous ces temps-là (s) ; entre deux, le dernier avis vaut */
  every: 0.1,
};

/** Qui est envoyé à un joueur : 1 vu (ou entendu), 0 caché */
export type SightMask = Uint8Array;

export class Sight {
  private n = 0;
  /** Pour chaque paire (joueur v, adversaire t), en `v * n + t` : jusqu'à quand t est envoyé à v (heure de partie) */
  private until = new Float64Array(0);
  /** La dernière ligne de vue trouvée, et quand la chercher de nouveau */
  private los = new Uint8Array(0);
  private checkAt = new Float64Array(0);
  /** Les bruits de chacun : un tir qu'on entend de partout, un bruit qu'on n'entend que de près */
  private loudUntil: number[] = [];
  private noiseUntil: number[] = [];
  private noiseR: number[] = [];
  /** Pour la mesure : combien de rayons tirés, combien de paires revues */
  rays = 0;
  checks = 0;

  /** À la taille de la partie (un soldat de plus en cours de route garde ce qu'on savait des autres) */
  private fit(n: number) {
    if (n === this.n) return;
    const until = new Float64Array(n * n);
    const los = new Uint8Array(n * n);
    const checkAt = new Float64Array(n * n);
    const keep = Math.min(n, this.n);
    for (let v = 0; v < keep; v++) {
      for (let t = 0; t < keep; t++) {
        until[v * n + t] = this.until[v * this.n + t]!;
        los[v * n + t] = this.los[v * this.n + t]!;
        checkAt[v * n + t] = this.checkAt[v * this.n + t]!;
      }
    }
    this.until = until;
    this.los = los;
    this.checkAt = checkAt;
    for (let i = this.n; i < n; i++) {
      this.loudUntil[i] = -1;
      this.noiseUntil[i] = -1;
      this.noiseR[i] = 0;
    }
    this.n = n;
  }

  /**
   * Ce qui s'est passé à ce pas : les tirs et les bruits, qui se font entendre ; les coups, qui montrent le tireur à sa
   * victime ; les retours au combat, après lesquels on ne sait plus rien de celui qui revient. `quiet` : ce tir est-il
   * étouffé par un silencieux ?
   */
  hear(m: Match, events: readonly EscEvent[], quiet: (i: number, w: WeaponId) => boolean) {
    this.fit(m.fighters.length);
    const t = m.t;
    const noise = (i: number, r: number, time: number) => {
      if (i < 0 || i >= this.n) return;
      if (this.noiseUntil[i]! > t && this.noiseR[i]! > r) return;
      this.noiseUntil[i] = t + time;
      this.noiseR[i] = r;
    };
    const reveal = (v: number, a: number, time: number) => {
      if (v < 0 || a < 0 || v === a || v >= this.n || a >= this.n) return;
      const k = v * this.n + a;
      this.until[k] = Math.max(this.until[k]!, t + time);
    };
    for (const e of events) {
      switch (e.k) {
        case "shot":
          if (e.i < 0 || e.i >= this.n) break;
          if (quiet(e.i, e.w)) noise(e.i, SIGHT.quiet.r, SIGHT.quiet.t);
          else this.loudUntil[e.i] = t + SIGHT.loud;
          break;
        case "reload":
        case "throw":
        case "knife":
          noise(e.i, SIGHT.noise.r, SIGHT.noise.t);
          break;
        case "hit":
          reveal(e.v, e.a, SIGHT.hurt);
          break;
        case "kill":
          reveal(e.v, e.a, SIGHT.killed);
          break;
        case "spawn":
          // Il revient ailleurs : ce qu'on voyait de lui ne vaut plus
          for (let v = 0; v < this.n; v++) {
            const k = v * this.n + e.i;
            this.until[k] = 0;
            this.los[k] = 0;
            this.checkAt[k] = 0;
          }
          break;
      }
    }
  }

  /** Pour le joueur `v` : qui lui est envoyé, et qui reste caché */
  mask(m: Match, v: number): SightMask {
    const n = m.fighters.length;
    this.fit(n);
    const out = new Uint8Array(n);
    const me = m.fighters[v];
    if (!me) return out.fill(1);
    const teams = isTeamMode(m.mode);
    const world = matchWorld(m);
    let eyes: number[] | null = null;
    for (let t = 0; t < n; t++) {
      const g = m.fighters[t]!;
      if (t === v || (teams && g.team === me.team)) {
        out[t] = 1;
        continue;
      }
      const k = v * n + t;
      let now = this.heard(me.s, g.s, t, m.t) || this.marked(m, v, t, teams) || (m.flags !== null && g.carrying >= 0);
      if (!now) {
        if (m.t >= this.checkAt[k]!) {
          eyes ??= eyesOf(world, me.s);
          this.los[k] = this.lineOfSight(world, eyes, me.s, g.s) ? 1 : 0;
          this.checkAt[k] = m.t + SIGHT.every;
          this.checks++;
        }
        now = this.los[k] === 1;
      }
      if (now) this.until[k] = Math.max(this.until[k]!, m.t + SIGHT.hold);
      out[t] = this.until[k]! > m.t ? 1 : 0;
    }
    return out;
  }

  /** On l'entend (à l'heure `now`) : il vient de tirer, il fait du bruit tout près, ou il court tout près */
  private heard(a: Soldier, b: Soldier, t: number, now: number): boolean {
    if (this.loudUntil[t]! > now) return true;
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    if (this.noiseUntil[t]! > now && dist < this.noiseR[t]!) return true;
    return b.alive && b.ground && !b.crouch && Math.hypot(b.vx, b.vz) > 3 && dist < SIGHT.steps;
  }

  /** Son équipe (ou lui seul, en chacun pour soi) l'a repéré */
  private marked(m: Match, v: number, t: number, teams: boolean): boolean {
    const team = m.fighters[v]!.team;
    return m.marks.some((k) => k.target === t && (teams ? k.team === team : k.by === v));
  }

  /** Une ligne de vue, avec la marge : des yeux de `a` (et autour) jusqu'à un bout du corps de `b` (et autour) */
  private lineOfSight(world: World, eyes: readonly number[], a: Soldier, b: Soldier): boolean {
    const h = heightOf(b);
    // Les épaules : de côté par rapport à la ligne entre les deux
    let px = -(b.z - a.z);
    let pz = b.x - a.x;
    const l = Math.hypot(px, pz) || 1;
    px = (px / l) * SIGHT.bodySide;
    pz = (pz / l) * SIGHT.bodySide;
    const chest = b.y + h * 0.62;
    const points = [b.x, chest, b.z, b.x, eyeOf(b) + 0.06, b.z, b.x, b.y + 0.35, b.z, b.x + px, chest, b.z + pz, b.x - px, chest, b.z - pz];
    // Et là où il sera bientôt, s'il y va sans traverser de mur
    const lx = b.x + b.vx * SIGHT.lead;
    const lz = b.z + b.vz * SIGHT.lead;
    if (b.alive && Math.hypot(lx - b.x, lz - b.z) > 0.3 && world.sees(b.x, chest, b.z, lx, chest, lz)) {
      this.rays++;
      points.push(lx, chest, lz);
    }
    for (let e = 0; e < eyes.length; e += 3) {
      for (let p = 0; p < points.length; p += 3) {
        this.rays++;
        if (world.sees(eyes[e]!, eyes[e + 1]!, eyes[e + 2]!, points[p]!, points[p + 1]!, points[p + 2]!)) return true;
      }
    }
    return false;
  }
}

/**
 * Les yeux d'un joueur, avec la marge : où ils sont, debout s'il est accroupi (il peut se lever), un peu de côté (il peut
 * se décaler pour jeter un œil) et là où il va (s'il y va sans traverser de mur)
 */
function eyesOf(world: World, a: Soldier): number[] {
  const y = eyeOf(a);
  const out = [a.x, y, a.z];
  const up = eyeOf({ y: a.y, crouch: false });
  if (up > y + 0.05 && world.sees(a.x, y, a.z, a.x, up, a.z)) out.push(a.x, up, a.z);
  const rx = Math.cos(a.yaw) * SIGHT.eyeSide;
  const rz = -Math.sin(a.yaw) * SIGHT.eyeSide;
  for (const s of [1, -1]) {
    if (world.sees(a.x, y, a.z, a.x + rx * s, y, a.z + rz * s)) out.push(a.x + rx * s, y, a.z + rz * s);
  }
  const lx = a.x + a.vx * SIGHT.lead;
  const lz = a.z + a.vz * SIGHT.lead;
  if (Math.hypot(lx - a.x, lz - a.z) > 0.3 && world.sees(a.x, y, a.z, lx, y, lz)) out.push(lx, y, lz);
  return out;
}

/**
 * Ce que le joueur `v` reçoit des positions et des évènements de ce pas : les soldats cachés vidés, et rien de ce qui
 * dirait où ils sont (le coup qu'ils prennent, l'endroit où s'arrête la balle qui les touche, leurs munitions ramassées,
 * leur retour au combat, les repères de l'autre équipe)
 */
export function tickFor(m: Match, tick: EscTick, v: number, mask: SightMask): Pick<EscTick, "p" | "e" | "mk" | "pg"> {
  const p = tick.p.slice();
  for (let t = 0; t < mask.length; t++) {
    if (mask[t]) continue;
    const k = t * P_STRIDE;
    p.fill(0, k, k + P_STRIDE);
    p[k + 5] = PF.hidden;
  }
  const teams = isTeamMode(m.mode);
  const team = m.fighters[v]?.team;
  const ally = (i: number) => i === v || (teams && m.fighters[i]?.team === team);
  const e: EscEvent[] = [];
  for (const ev of tick.e) {
    switch (ev.k) {
      case "shot": {
        if (ev.i !== v && !mask[ev.i]) continue;
        // La balle s'arrête sur un soldat caché : on la laisse filer jusqu'au mur d'après, comme s'il n'y était pas
        const onHidden =
          ev.n === 0 && tick.e.some((h) => h.k === "hit" && h.a === ev.i && !mask[h.v] && h.x === ev.x && h.y === ev.y && h.z === ev.z);
        e.push(onHidden ? pastHidden(m, ev) : ev);
        continue;
      }
      case "hit":
        if (ev.a === v || ev.v === v || mask[ev.v]) e.push(ev);
        continue;
      case "ping":
      case "spawn":
        if (ally(ev.i)) e.push(ev);
        continue;
      case "ammo":
        if (ev.i === v) e.push(ev);
        continue;
      default:
        e.push(ev);
    }
  }
  const out: Pick<EscTick, "p" | "e" | "mk" | "pg"> = { p, e };
  if (tick.mk) {
    const mk: number[] = [];
    for (let k = 0; k + 2 < tick.mk.length; k += 3) {
      if (teams ? tick.mk[k + 1] === team : tick.mk[k + 2] === v) mk.push(tick.mk[k]!, tick.mk[k + 1]!, tick.mk[k + 2]!);
    }
    if (mk.length > 0) out.mk = mk;
  }
  if (tick.pg) {
    const pg: number[] = [];
    for (let k = 0; k + 4 < tick.pg.length; k += 5) {
      if (teams ? tick.pg[k] === team : tick.pg[k + 1] === v) pg.push(...tick.pg.slice(k, k + 5));
    }
    if (pg.length > 0) out.pg = pg;
  }
  return out;
}

/** Une balle qui touchait un soldat caché : elle continue tout droit jusqu'au mur suivant (ou se perd au loin) */
function pastHidden(m: Match, ev: Extract<EscEvent, { k: "shot" }>): EscEvent {
  const s = m.fighters[ev.i]?.s;
  if (!s) return ev;
  const ox = s.x;
  const oy = eyeOf(s);
  const oz = s.z;
  let dx = ev.x - ox;
  let dy = ev.y - oy;
  let dz = ev.z - oz;
  const l = Math.hypot(dx, dy, dz);
  if (l < 1e-3) return ev;
  dx /= l;
  dy /= l;
  dz /= l;
  // Le mur qu'elle aurait touché sans lui (il était avant ce mur, puisqu'elle l'a touché)
  const hit = matchWorld(m).raycast(ox, oy, oz, dx, dy, dz, 300);
  const t = hit ? hit.t : 300;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const n = hit ? 1 + hit.axis * 2 + (hit.sign > 0 ? 1 : 0) : 0;
  return { ...ev, x: r2(ox + dx * t), y: r2(oy + dy * t), z: r2(oz + dz * t), n };
}
