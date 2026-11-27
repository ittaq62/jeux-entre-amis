// Les commandes d'un chef : le clavier (ZQSD, WASD ou les flèches ; Espace pour prendre et poser, E pour utiliser, Maj
// pour l'élan, Tab pour changer de chef), la manette (le stick, A, X, B, Y) et le doigt (un joystick et des boutons,
// posés par l'écran). Le stick est donné dans le repère de l'écran (x vers la droite, y vers le haut).

import { DASH, GRAB, SWAP, USE } from "../../shared/games/toque/sim.ts";

export interface Sample {
  sx: number;
  sy: number;
  held: number;
  pressed: number;
}

const KEYS = {
  left: ["KeyA", "KeyQ", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["KeyW", "KeyZ", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  grab: ["Space", "KeyJ", "Enter"],
  use: ["KeyE", "KeyK", "ControlLeft", "ControlRight"],
  dash: ["ShiftLeft", "ShiftRight", "KeyL"],
  swap: ["Tab", "KeyC"],
};

/** Le doigt : le joystick et les boutons, mis à jour par l'écran */
export interface TouchState {
  sx: number;
  sy: number;
  grab: boolean;
  use: boolean;
  dash: boolean;
  swap: boolean;
}

export class ToqueControls {
  readonly touch: TouchState = { sx: 0, sy: 0, grab: false, use: false, dash: false, swap: false };
  paused = false;
  private keys = new Set<string>();
  /** Les appuis depuis le dernier échantillon (qu'un appui très bref ne se perde pas) */
  private edges = 0;
  private padPrev = 0;
  /** Manette ou clavier utilisé en dernier (pour l'aide affichée) */
  last: "clavier" | "manette" | "doigt" = "clavier";

  constructor() {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.clear);
  }

  private typing(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return Boolean(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable));
  }

  private down = (e: KeyboardEvent) => {
    if (this.typing(e)) return;
    const code = e.code;
    const known = Object.values(KEYS).some((list) => list.includes(code));
    if (!known) return;
    // L'espace et les flèches ne font pas défiler la page, Tab ne change pas de champ
    e.preventDefault();
    this.last = "clavier";
    if (!this.keys.has(code)) {
      if (KEYS.grab.includes(code)) this.edges |= GRAB;
      if (KEYS.use.includes(code)) this.edges |= USE;
      if (KEYS.dash.includes(code)) this.edges |= DASH;
      if (KEYS.swap.includes(code)) this.edges |= SWAP;
    }
    this.keys.add(code);
  };

  private up = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clear = () => {
    this.keys.clear();
  };

  /** Un bouton au doigt, enfoncé ou relâché */
  touchButton(which: "grab" | "use" | "dash" | "swap", down: boolean) {
    this.last = "doigt";
    if (down && !this.touch[which]) this.edges |= which === "grab" ? GRAB : which === "use" ? USE : which === "dash" ? DASH : SWAP;
    this.touch[which] = down;
  }

  /** La commande de ce pas */
  sample(): Sample {
    if (this.paused) {
      this.edges = 0;
      return { sx: 0, sy: 0, held: 0, pressed: 0 };
    }
    const k = (list: string[]) => list.some((c) => this.keys.has(c));
    let sx = (k(KEYS.right) ? 1 : 0) - (k(KEYS.left) ? 1 : 0);
    let sy = (k(KEYS.up) ? 1 : 0) - (k(KEYS.down) ? 1 : 0);
    let held = (k(KEYS.grab) ? GRAB : 0) | (k(KEYS.use) ? USE : 0) | (k(KEYS.dash) ? DASH : 0);
    // Le doigt
    if (this.touch.sx !== 0 || this.touch.sy !== 0) {
      sx = this.touch.sx;
      sy = this.touch.sy;
    }
    held |= (this.touch.grab ? GRAB : 0) | (this.touch.use ? USE : 0) | (this.touch.dash ? DASH : 0);
    // La manette
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const dz = Math.hypot(ax, ay) > 0.22;
      let px = dz ? ax : 0;
      let py = dz ? -ay : 0;
      if (pad.buttons[14]?.pressed) px = -1;
      if (pad.buttons[15]?.pressed) px = 1;
      if (pad.buttons[12]?.pressed) py = 1;
      if (pad.buttons[13]?.pressed) py = -1;
      const b = (i: number) => Boolean(pad.buttons[i]?.pressed);
      const padHeld = (b(0) ? GRAB : 0) | (b(2) ? USE : 0) | (b(7) ? USE : 0) | (b(1) ? DASH : 0) | (b(3) || b(4) || b(5) ? SWAP : 0);
      if (px !== 0 || py !== 0 || padHeld) {
        this.last = "manette";
        if (px !== 0 || py !== 0) {
          sx = px;
          sy = py;
        }
      }
      this.edges |= padHeld & ~this.padPrev;
      held |= padHeld & ~SWAP;
      this.padPrev = padHeld;
    }
    const l = Math.hypot(sx, sy);
    if (l > 1) {
      sx /= l;
      sy /= l;
    }
    const pressed = this.edges;
    this.edges = 0;
    return { sx, sy, held: held & USE, pressed };
  }

  dispose() {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.clear);
  }
}
