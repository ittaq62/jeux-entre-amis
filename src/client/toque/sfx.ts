// Les bruits de la cuisine, fabriqués à la volée (Web Audio, la boîte commune sfxKit) pour sonner comme de vrais objets :
// le couteau sur la planche, la porcelaine des assiettes, la fonte des marmites, le laiton de la sonnette du passe, le
// papier d'une commande qui tombe ; et ce qui dure tant que ça cuit : la poêle qui grésille, la marmite qui bouillonne,
// la friteuse, le feu qui crépite, l'extincteur qui siffle, l'eau de l'évier. Tout sonne dans une petite pièce carrelée.

import { BELL, contact, limiterOut, METAL_BAR, noiseBuffer, PLASTIC, roomOut, strike, vary, WOOD, type Body } from "../lib/sfxKit.ts";
import { audioOut, effectsLevel } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { Cell, buildKitchen } from "../../shared/games/toque/kitchens.ts";
import { ACT_CHOP, ACT_SPRAY, ACT_WASH, type ToqueEvent, type World } from "../../shared/games/toque/sim.ts";

/** La porcelaine : des modes aigus et assez longs */
const PORCELAIN: Body = { ratios: [1, 2.32, 4.25, 6.63], decays: [0.18, 0.11, 0.06, 0.04], amps: [1, 0.55, 0.3, 0.18] };
/** La fonte d'une marmite, d'une poêle */
const CAST_IRON: Body = { ratios: [1, 1.71, 2.85, 4.1], decays: [0.32, 0.2, 0.1, 0.06], amps: [1, 0.5, 0.3, 0.15] };

interface Loop {
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class KitchenSound {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private level: GainNode | null = null;
  private loops = new Map<string, Loop>();
  private chopAt = new Map<number, number>();
  private beepAt = 0;
  private crackleAt = 0;
  private bubbleAt = 0;
  private stopped = false;
  private unsub: (() => void) | null = null;

  start() {
    const a = audioOut();
    if (!a) return;
    this.ctx = a.ctx;
    this.level = a.ctx.createGain();
    this.level.gain.value = effectsLevel();
    this.level.connect(a.out);
    // Le limiteur d'abord (créé tôt, voir sfxKit), puis la petite pièce carrelée
    const lim = limiterOut(a.ctx, this.level, { input: 0.7 });
    this.out = roomOut(a.ctx, lim, { rt60: 0.42, wet: 0.16 });
    this.unsub = usePrefs.subscribe(() => {
      if (this.level && this.ctx) this.level.gain.setTargetAtTime(effectsLevel(), this.ctx.currentTime, 0.1);
    });
  }

  private now() {
    return this.ctx?.currentTime ?? 0;
  }

  /** Un bruit filtré qui dure (la poêle, l'eau…), créé une fois, dont on règle le niveau */
  private loop(name: string, type: BiquadFilterType, freq: number, q = 0.8): Loop | null {
    if (!this.ctx || !this.out) return null;
    let l = this.loops.get(name);
    if (l) return l;
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuffer(this.ctx);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.out);
    src.start(this.now(), Math.random());
    l = { src, gain, filter };
    this.loops.set(name, l);
    return l;
  }

  private setLoop(name: string, type: BiquadFilterType, freq: number, level: number, q?: number) {
    const l = this.loop(name, type, freq, q);
    if (!l || !this.ctx) return;
    l.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.15);
  }

  // ---------------------------------------------------------------------------
  // Les bruits d'un instant
  // ---------------------------------------------------------------------------

  private knife(gain: number) {
    if (!this.ctx || !this.out) return;
    const t = this.now();
    strike(this.ctx, this.out, t, WOOD, vary(520, 0.12), { gain: 0.22 * gain, hardness: 6000, click: 0.9 });
    contact(this.ctx, this.out, t, 0.12 * gain, 9000, 0.004);
  }

  private plate(gain = 1) {
    if (!this.ctx || !this.out) return;
    strike(this.ctx, this.out, this.now(), PORCELAIN, vary(1450, 0.08), { gain: 0.16 * gain, hardness: 8000, click: 0.5 });
  }

  private pot(gain = 1) {
    if (!this.ctx || !this.out) return;
    strike(this.ctx, this.out, this.now(), CAST_IRON, vary(240, 0.1), { gain: 0.2 * gain, hardness: 3500, click: 0.4 });
  }

  private thud(gain = 1) {
    if (!this.ctx || !this.out) return;
    strike(this.ctx, this.out, this.now(), PLASTIC, vary(180, 0.15), { gain: 0.18 * gain, hardness: 1600, click: 0.6, velocity: 0.5 });
  }

  /** La sonnette de laiton du passe */
  bell(gain = 1) {
    if (!this.ctx || !this.out) return;
    const t = this.now();
    strike(this.ctx, this.out, t, BELL, 1320, { gain: 0.28 * gain, hardness: 9000, click: 0.3 });
  }

  /** Le papier de la commande qui tombe sur le rail, et un petit tintement */
  private ticket() {
    if (!this.ctx || !this.out) return;
    const t = this.now();
    this.burst(t, 0.12, 2400, 0.09, "bandpass");
    strike(this.ctx, this.out, t + 0.05, METAL_BAR, 1760, { gain: 0.08, hardness: 9000, click: 0.2 });
  }

  /** Une rafale de bruit filtré (un souffle, un froissement, un plouf) */
  private burst(t: number, dur: number, freq: number, gain: number, type: BiquadFilterType = "lowpass", sweep = 0) {
    if (!this.ctx || !this.out) return;
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuffer(this.ctx);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.02);
  }

  /** Deux notes qui descendent : une commande perdue */
  private sad() {
    if (!this.ctx || !this.out) return;
    const t = this.now();
    for (const [i, f] of [392, 330].entries())
      strike(this.ctx, this.out, t + i * 0.16, WOOD, f, { gain: 0.25, hardness: 1800, velocity: 0.6 });
  }

  /** Un plat servi : la sonnette, et un petit arpège joyeux d'autant plus haut que l'enchaînement grimpe */
  private served(mult: number) {
    if (!this.ctx || !this.out) return;
    this.bell(1);
    const t = this.now();
    const base = 660 * (1 + (mult - 1) * 0.12);
    [1, 1.25, 1.5].forEach((r, i) =>
      strike(this.ctx!, this.out!, t + 0.12 + i * 0.07, METAL_BAR, base * r, { gain: 0.07, hardness: 8000, click: 0.1 }),
    );
  }

  /** Ce qui vient d'arriver (les sons ; ce qu'on voit est ailleurs) */
  event(e: ToqueEvent, w: World, mine: number) {
    if (!this.ctx || this.stopped) return;
    const t = this.now();
    const near = (slot: number) => (slot === mine ? 1 : 0.55);
    switch (e.k) {
      case "take":
      case "put":
      case "pickup":
      case "drop": {
        const c = "c" in e ? w.chefs[e.c] : undefined;
        const held = c?.held;
        const cell = "cell" in e ? e.cell : -1;
        const on = cell >= 0 ? w.items[cell] : null;
        const thing = held ?? on;
        const g = "c" in e ? near(e.c) : 0.5;
        if (thing?.k === "plate") this.plate(g);
        else if (thing?.k === "pot" || thing?.k === "pan" || thing?.k === "ext") this.pot(g);
        else this.thud(g);
        break;
      }
      case "chopped":
        this.knife(1.3);
        break;
      case "washed":
        this.plate(0.8);
        break;
      case "refuse":
        if (e.c === mine) this.burst(t, 0.08, 300, 0.12);
        break;
      case "trash":
        this.burst(t, 0.18, 900, 0.12, "lowpass", 0.4);
        this.thud(0.7);
        break;
      case "throw":
      case "dash":
        this.burst(t, 0.22, 1800, 0.07, "bandpass", 0.5);
        break;
      case "catch":
        this.thud(0.9);
        break;
      case "serve":
        this.served(e.mult);
        break;
      case "order":
        this.ticket();
        break;
      case "fail":
        this.sad();
        break;
      case "cooked":
        strike(this.ctx, this.out!, t, METAL_BAR, 2093, { gain: 0.06, hardness: 9000, click: 0.1 });
        break;
      case "burn":
      case "fire":
        this.burst(t, 0.5, 600, 0.22, "lowpass", 2.5);
        break;
      case "out":
        this.burst(t, 0.3, 3000, 0.08, "highpass");
        break;
      case "splash":
        this.burst(t, 0.5, 1200, 0.2, "lowpass", 0.3);
        break;
      case "fall":
        this.burst(t, 0.4, 900, 0.1, "bandpass", 0.3);
        break;
      case "bump":
      case "hit":
        this.thud(1);
        break;
      case "go":
        this.bell(1.2);
        window.setTimeout(() => this.bell(1), 180);
        break;
      case "end":
        this.bell(1.4);
        window.setTimeout(() => this.bell(1.2), 220);
        window.setTimeout(() => this.bell(1), 440);
        break;
      default:
        break;
    }
  }

  /** Ce qui dure : la poêle, la marmite, la friteuse, le feu, l'eau, l'extincteur ; et le couteau de chacun qui coupe */
  update(w: World, mine: number) {
    if (!this.ctx || this.stopped) return;
    const k = buildKitchen(w.kitchen, w.duel);
    let pans = 0;
    let pots = 0;
    let fryers = 0;
    let burning = 0;
    let fire = 0;
    w.items.forEach((it, i) => {
      if (!it) return;
      const cell = k.cells[i];
      const p = it.p ?? 0;
      const cooking = p > 0 && p < 2 && w.fire[i] === 0;
      if (cell === Cell.Stove && it.k === "pan" && (it.c ?? []).length > 0 && cooking) pans++;
      if (cell === Cell.Stove && it.k === "pot" && (it.c ?? []).length > 0 && cooking) pots++;
      if (cell === Cell.Fryer && it.k === "food" && cooking) fryers++;
      if (cooking && p > 1.4) burning++;
    });
    for (const f of w.fire) if (f > 0) fire += f;
    const live = w.phase === 1;
    this.setLoop("poele", "highpass", 3200, live ? Math.min(0.09, pans * 0.04) : 0, 0.6);
    this.setLoop("friture", "bandpass", 2000, live ? Math.min(0.08, fryers * 0.045) : 0, 0.5);
    this.setLoop("feu", "lowpass", 700, live ? Math.min(0.22, fire * 0.06) : 0, 0.9);
    const washing = w.chefs.some((c) => c.act === ACT_WASH);
    this.setLoop("eau", "bandpass", 900, live && washing ? 0.07 : 0, 1.2);
    const spraying = w.chefs.some((c) => c.act === ACT_SPRAY);
    this.setLoop("mousse", "highpass", 4500, live && spraying ? 0.12 : 0, 0.7);
    const t = this.now();
    // La marmite qui bouillonne : des bulles graves au hasard
    if (live && pots > 0 && t > this.bubbleAt) {
      this.bubbleAt = t + 0.06 + (Math.random() * 0.18) / pots;
      strike(this.ctx, this.out!, t, PLASTIC, vary(140, 0.3), { gain: 0.05, hardness: 500, click: 0.2, velocity: 0.4 });
    }
    // Le feu qui crépite
    if (live && fire > 0 && t > this.crackleAt) {
      this.crackleAt = t + 0.03 + Math.random() * 0.15;
      contact(this.ctx, this.out!, t, 0.08 + Math.random() * 0.08, 5000, 0.003);
    }
    // Ce qui va brûler : le bip d'alerte
    if (live && burning > 0 && t > this.beepAt) {
      this.beepAt = t + 0.5;
      strike(this.ctx, this.out!, t, METAL_BAR, 1660, { gain: 0.06, hardness: 9000, click: 0.05 });
    }
    // Le couteau de chacun qui coupe : un coup tous les dixièmes de seconde
    for (const c of w.chefs) {
      if (c.act !== ACT_CHOP || !live) {
        this.chopAt.delete(c.slot);
        continue;
      }
      const next = this.chopAt.get(c.slot) ?? 0;
      if (t >= next) {
        this.chopAt.set(c.slot, t + 0.13 + Math.random() * 0.03);
        this.knife(c.slot === mine ? 1 : 0.5);
      }
    }
  }

  stop() {
    this.stopped = true;
    this.unsub?.();
    for (const l of this.loops.values()) {
      try {
        l.gain.gain.setTargetAtTime(0, this.now(), 0.1);
        l.src.stop(this.now() + 0.4);
      } catch {
        // déjà arrêté
      }
    }
    this.loops.clear();
    this.level?.disconnect();
  }
}
