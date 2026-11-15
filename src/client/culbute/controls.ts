// Les commandes d'un combat : le clavier (ZQSD ou les flèches, et quatre touches), une manette, ou l'écran tactile
// (un stick sous le pouce gauche, trois boutons sous le droit, la garde en posant le pouce sur Frapper et Spécial à la fois).
// Une fois par image, tout devient une seule commande : le stick, les boutons tenus et ceux qu'on vient d'enfoncer.

import { ATK, JMP, SHD, SPC, type Input } from "../../shared/games/culbute/model.ts";

export type Scheme = "clavier" | "manette" | "tactile";

/** Les touches, par position (les mêmes sur un clavier AZERTY ou QWERTY) */
const KEYS: Record<string, { dir?: [number, number]; bit?: number }> = {
  KeyW: { dir: [0, 1] },
  KeyS: { dir: [0, -1] },
  KeyA: { dir: [-1, 0] },
  KeyD: { dir: [1, 0] },
  ArrowUp: { dir: [0, 1] },
  ArrowDown: { dir: [0, -1] },
  ArrowLeft: { dir: [-1, 0] },
  ArrowRight: { dir: [1, 0] },
  KeyJ: { bit: ATK },
  KeyX: { bit: ATK },
  KeyK: { bit: SPC },
  KeyC: { bit: SPC },
  Space: { bit: JMP },
  KeyI: { bit: JMP },
  KeyL: { bit: SHD },
  KeyV: { bit: SHD },
  ShiftLeft: { bit: SHD },
  ShiftRight: { bit: SHD },
};

/** Ce que montre l'aide : la touche principale de chaque action */
export const KEY_HELP = [
  { keys: "ZQSD ou ←↑→↓", what: "Se déplacer (et viser les coups)" },
  { keys: "J ou X", what: "Frapper (tenir : attaque chargée)" },
  { keys: "K ou C", what: "Spécial (↑ + Spécial : remonter)" },
  { keys: "Espace", what: "Sauter (deux fois en l'air)" },
  { keys: "L ou Maj", what: "Garde (+ direction : esquive)" },
];

export class CulbuteControls {
  private held = new Set<string>();
  /** Les touches enfoncées depuis la dernière lecture : un appui très bref entre deux images compte quand même */
  private tapped = new Set<string>();
  private padPrev = 0;
  private touchPrevHeld = 0;
  private scheme: Scheme = "clavier";
  /** Pendant que l'aide ou le menu est ouvert, le combat n'écoute plus */
  paused = false;
  /** Au doigt : sauter en poussant le stick vers le haut (et pas de bouton Saut) */
  stickJump = false;
  readonly touch = { sx: 0, sy: 0, atk: false, spc: false, jmp: false, taps: 0 };

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
  }

  get current(): Scheme {
    return this.scheme;
  }

  private onDown = (e: KeyboardEvent) => {
    if (this.paused || !(e.code in KEYS)) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    this.scheme = "clavier";
    if (!this.held.has(e.code)) this.tapped.add(e.code);
    this.held.add(e.code);
  };

  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
  };

  /** Un doigt sur un bouton de l'écran */
  touchButton(which: "atk" | "spc" | "jmp", down: boolean) {
    this.scheme = "tactile";
    this.touch[which] = down;
    if (down) this.touch.taps |= which === "atk" ? ATK : which === "spc" ? SPC : JMP;
  }

  /** La commande de cette image */
  sample(): Input {
    if (this.paused) {
      this.tapped.clear();
      this.touch.taps = 0;
      return { x: 0, y: 0, held: 0, pressed: 0 };
    }
    let x = 0;
    let y = 0;
    let held = 0;
    let tapped = 0;
    for (const code of new Set([...this.held, ...this.tapped])) {
      const k = KEYS[code]!;
      if (k.dir && this.held.has(code)) {
        x += k.dir[0];
        y += k.dir[1];
      }
      if (k.bit) {
        if (this.held.has(code)) held |= k.bit;
        if (this.tapped.has(code)) tapped |= k.bit;
      }
    }
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    this.tapped.clear();

    // La manette : stick gauche ou croix, A ou Y pour sauter, X pour frapper, B pour le spécial, les gâchettes pour la garde
    const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected) ?? null;
    if (gp) {
      const pb = (i: number) => Boolean(gp.buttons[i]?.pressed);
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      let pad = 0;
      if (pb(0) || pb(3)) pad |= JMP;
      if (pb(2)) pad |= ATK;
      if (pb(1)) pad |= SPC;
      if (pb(4) || pb(5) || pb(6) || pb(7)) pad |= SHD;
      if (Math.hypot(ax, ay) > 0.2) {
        x = ax;
        y = -ay;
        this.scheme = "manette";
      }
      if (pb(12) || pb(13) || pb(14) || pb(15)) {
        x = (pb(15) ? 1 : 0) - (pb(14) ? 1 : 0);
        y = (pb(12) ? 1 : 0) - (pb(13) ? 1 : 0);
        this.scheme = "manette";
      }
      if (pad) this.scheme = "manette";
      tapped |= pad & ~this.padPrev;
      held |= pad;
      this.padPrev = pad;
    }

    // L'écran tactile : Frapper et Spécial tenus ensemble font la garde
    const t = this.touch;
    if (Math.hypot(t.sx, t.sy) > 0.08) {
      x = t.sx;
      y = t.sy;
    }
    let touchHeld = (t.atk ? ATK : 0) | (t.spc ? SPC : 0) | (t.jmp ? JMP : 0);
    if (t.atk && t.spc) touchHeld = SHD | (t.jmp ? JMP : 0);
    if (this.stickJump && t.sy > 0.65) touchHeld |= JMP;
    let touchTaps = t.taps;
    if (touchHeld & SHD) touchTaps = (touchTaps & JMP) | SHD;
    touchTaps |= touchHeld & ~this.touchPrevHeld & (SHD | JMP);
    this.touchPrevHeld = touchHeld;
    t.taps = 0;
    held |= touchHeld;
    tapped |= touchTaps;

    // Chaque façon de jouer compte ses propres appuis : relâcher Spécial en gardant Frapper (fin de la garde au doigt)
    // n'est pas un nouvel appui sur Frapper
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), held, pressed: tapped };
  }
}
