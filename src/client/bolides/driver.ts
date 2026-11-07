// Le kart du joueur, conduit chez lui : pas fixes de 1/60 s quel que soit l'écran, les chocs avec les autres karts
// (seul le sien est poussé), le départ canon, le mauvais sens, et repartir quand on est coincé. On le montre entre
// ses deux derniers pas, au prorata du temps : sans cela, un écran à 90 ou 120 images par seconde, ou une image en
// retard, le ferait avancer par à-coups.

import { bump, DT, newKart, SPIN_TIME, step, type Input, type Kart, type KartEvent } from "../../shared/games/bolides/physics.ts";
import { deltaS, pointAt, wrapAngle, type Track } from "../../shared/games/bolides/track.ts";

/** Accélérer dans cette fenêtre juste avant le feu vert donne un départ canon */
const ROCKET_WINDOW_MS = 800;

export class LocalDriver {
  private acc = 0;
  /** Le premier appui sur l'accélérateur pendant le compte à rebours (heure du serveur) */
  private gasSince: number | null = null;
  private launched = false;
  /** Ce qu'il a reculé le long de la route ces derniers temps (mauvais sens) */
  private backward = 0;
  private stuckFor = 0;
  /** Le kart au pas d'avant, et le kart tel qu'on le montre (entre les deux) */
  private prev: Kart;
  private shown: Kart;

  constructor(
    readonly track: Track,
    public kart: Kart,
    public top: number,
  ) {
    this.prev = { ...kart };
    this.shown = { ...kart };
  }

  /** Avance de `dt` secondes ; `others` : les autres karts tels qu'on les voit (on ne pousse que le sien) */
  update(dt: number, input: Input, others: Kart[]): KartEvent[] {
    const events: KartEvent[] = [];
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      Object.assign(this.prev, this.kart);
      const s0 = this.kart.s;
      step(this.kart, input, this.track, { top: this.top }, events);
      for (const o of others) bump(this.kart, o, true, false);
      // Le mauvais sens : on recule le long de la route en roulant vraiment
      const moved = deltaS(this.track, s0, this.kart.s);
      this.backward = Math.max(0, this.backward * 0.995 - moved);
      this.stuckFor = Math.abs(this.kart.v) < 1 && this.kart.spin === 0 ? this.stuckFor + DT : 0;
    }
    return events;
  }

  /** Le kart à montrer à cette image : entre son avant-dernier et son dernier pas */
  view(): Kart {
    const a = this.prev;
    const b = this.kart;
    const f = Math.max(0, Math.min(1, this.acc / DT));
    const out = Object.assign(this.shown, b);
    // Un saut de plus de quelques mètres (repartir) ne se lisse pas
    if (Math.hypot(b.x - a.x, b.z - a.z) > 6) return out;
    out.x = a.x + (b.x - a.x) * f;
    out.z = a.z + (b.z - a.z) * f;
    out.y = a.y + (b.y - a.y) * f;
    out.air = a.air + (b.air - a.air) * f;
    out.h = a.h + wrapAngle(b.h - a.h) * f;
    out.v = a.v + (b.v - a.v) * f;
    out.slip = a.slip + (b.slip - a.slip) * f;
    out.dist = a.dist + (b.dist - a.dist) * f;
    return out;
  }

  /** Pendant le compte à rebours : le kart ne bouge pas, mais on note quand l'accélérateur a été enfoncé */
  waiting(gas: boolean, serverNow: number, goAt: number) {
    if (!gas) this.gasSince = null;
    else this.gasSince ??= serverNow;
    if (serverNow >= goAt && !this.launched) this.launch(goAt);
  }

  /** Au feu vert : un départ canon si l'accélérateur a été enfoncé juste à temps (ni trop tôt, ni pas du tout) */
  launch(goAt: number): boolean {
    if (this.launched) return false;
    this.launched = true;
    const since = this.gasSince;
    if (since !== null && goAt - since <= ROCKET_WINDOW_MS) {
      this.kart.boost = Math.max(this.kart.boost, 0.9);
      return true;
    }
    return false;
  }

  get wrongWay(): boolean {
    return this.backward > 12;
  }

  /** Coincé depuis un moment : on propose de repartir */
  get stuck(): boolean {
    return this.stuckFor > 2.5;
  }

  /** Touché : le tête-à-queue */
  hit() {
    this.kart.spin = SPIN_TIME;
    this.kart.v *= 0.6;
    this.kart.boost = 0;
    this.kart.drift = 0;
    this.kart.charge = 0;
  }

  boost(seconds: number) {
    this.kart.boost = Math.max(this.kart.boost, seconds);
  }

  /** Repartir : au milieu de la route, là où l'on était, dans le bon sens, arrêté */
  respawn() {
    const k = this.kart;
    const p = pointAt(this.track, k.s, 0);
    const fresh = newKart(this.track, p.x, p.z, Math.atan2(p.tx, p.tz));
    this.kart = { ...fresh, dist: k.dist, boost: 0 };
    Object.assign(this.prev, this.kart);
    this.backward = 0;
    this.stuckFor = 0;
  }
}
