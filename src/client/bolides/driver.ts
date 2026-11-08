// Le kart du joueur, conduit chez lui : pas fixes de 1/60 s quel que soit l'écran, les chocs avec les autres karts
// (seul le sien est poussé), le départ canon, le mauvais sens, et repartir quand on est coincé. On le montre entre
// ses deux derniers pas, au prorata du temps : sans cela, un écran à 90 ou 120 images par seconde, ou une image en
// retard, le ferait avancer par à-coups.

import { VEHICLES, type VehicleStats } from "../../shared/games/bolides/garage.ts";
import { RESSORT_VY } from "../../shared/games/bolides/items.ts";
import {
  beginRescue,
  bump,
  draftStep,
  DT,
  SPIN_TIME,
  step,
  type Input,
  type Kart,
  type KartEvent,
} from "../../shared/games/bolides/physics.ts";
import { deltaS, wrapAngle, type Track } from "../../shared/games/bolides/track.ts";

/** Accélérer dans cette fenêtre juste avant le feu vert donne un départ canon */
const ROCKET_WINDOW_MS = 800;
/** Bloqué : pendant combien de secondes, et en bougeant de moins de combien de mètres, avant que le drone vienne */
const RESCUE_AFTER = 2.3;
const RESCUE_MOVED = 3;

export class LocalDriver {
  private acc = 0;
  /** Le premier appui sur l'accélérateur pendant le compte à rebours (heure du serveur) */
  private gasSince: number | null = null;
  private launched = false;
  /** Ce qu'il a reculé le long de la route ces derniers temps (mauvais sens) */
  private backward = 0;
  /** Où il était ces dernières secondes, pour savoir s'il avance encore */
  private track2: { x: number; z: number; t: number }[] = [];
  private clock = 0;
  private wrongFor = 0;
  /** Le kart au pas d'avant, et le kart tel qu'on le montre (entre les deux) */
  private prev: Kart;
  private shown: Kart;

  constructor(
    readonly track: Track,
    public kart: Kart,
    public top: number,
    private vehicle: VehicleStats = VEHICLES.kart.stats,
  ) {
    this.prev = { ...kart };
    this.shown = { ...kart };
  }

  /** Avance de `dt` secondes ; `others` : les autres karts tels qu'on les voit (on ne pousse que le sien) */
  /** `time` : l'heure du serveur en secondes (les engins qui traversent la route en dépendent) */
  update(dt: number, input: Input, others: Kart[], time?: number, star = false, weights?: number[], myWeight = 1): KartEvent[] {
    const events: KartEvent[] = [];
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      Object.assign(this.prev, this.kart);
      const s0 = this.kart.s;
      draftStep(this.kart, others, DT, events);
      step(this.kart, input, this.track, { top: this.top, time, star, vehicle: this.vehicle }, events);
      others.forEach((o, i) => {
        if (bump(this.kart, o, true, false, this.vehicle.weight * myWeight, weights?.[i] ?? 1) > 4) events.push("bump");
      });
      // Le mauvais sens : on recule le long de la route en roulant vraiment
      const moved = deltaS(this.track, s0, this.kart.s);
      this.backward = Math.max(0, this.backward * 0.995 - moved);
    }
    this.watchProgress(dt, input);
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

  /** Il essaie d'avancer, et il ne bouge plus (ou presque) : on garde sa trace sur quelques secondes */
  private watchProgress(dt: number, input: Input) {
    this.clock += dt;
    this.wrongFor = this.wrongWay ? this.wrongFor + dt : 0;
    const k = this.kart;
    if ((!input.gas && !input.brake) || k.spin > 0 || k.fall > 0 || k.rescue > 0 || k.air > 0.05) {
      this.track2.length = 0;
      return;
    }
    const last = this.track2.at(-1);
    if (!last || this.clock - last.t >= 0.15) this.track2.push({ x: k.x, z: k.z, t: this.clock });
    while (this.track2.length > 2 && this.clock - this.track2[1]!.t >= RESCUE_AFTER) this.track2.shift();
  }

  /** Sur combien de temps on l'observe, et de combien il a bougé */
  private progress(): { span: number; moved: number } {
    const first = this.track2[0];
    if (!first) return { span: 0, moved: Infinity };
    return { span: this.clock - first.t, moved: Math.hypot(this.kart.x - first.x, this.kart.z - first.z) };
  }

  /** Bloqué depuis un instant : on propose de repartir tout de suite */
  get stuck(): boolean {
    const { span, moved } = this.progress();
    return span >= 0.9 && moved < 1.6;
  }

  /** Bloqué pour de bon (ou à contresens depuis trop longtemps) : le drone vient */
  get rescueDue(): boolean {
    if (this.kart.rescue > 0 || this.kart.fall > 0) return false;
    const { span, moved } = this.progress();
    return (span >= RESCUE_AFTER && moved < RESCUE_MOVED) || this.wrongFor > 6;
  }

  /** Touché : le tête-à-queue */
  hit() {
    this.kart.spin = SPIN_TIME;
    this.kart.v *= 0.6;
    this.kart.boost = 0;
    this.kart.drift = 0;
    this.kart.charge = 0;
  }

  /** Le ressort : un grand saut, tout de suite */
  spring() {
    this.kart.vy = RESSORT_VY;
    this.kart.air = Math.max(this.kart.air, 0.05);
    this.kart.trick = false;
  }

  boost(seconds: number) {
    this.kart.boost = Math.max(this.kart.boost, seconds);
  }

  /** Le drone vient chercher le kart et le repose sur la route */
  rescue(events?: KartEvent[]) {
    beginRescue(this.track, this.kart, events);
    this.backward = 0;
    this.wrongFor = 0;
    this.track2.length = 0;
  }
}
