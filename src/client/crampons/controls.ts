// Les commandes d'un match : le clavier (on lit la place des touches, pas leur lettre), une manette, et l'écran tactile.
// Quatre boutons de geste : leur sens dépend de qui a le ballon, et on dose la force en les tenant enfoncés.

export type GameButton = "a" | "b" | "x" | "y";

export interface ButtonPress {
  button: GameButton;
  /** De 0 à 1 : le temps pendant lequel il a été tenu */
  power: number;
}

export interface PadState {
  /** Le stick, en repère écran : x vers la droite, y vers le bas */
  sx: number;
  sy: number;
  sprint: boolean;
  /** Les boutons tout juste relâchés, avec leur force */
  released: ButtonPress[];
  /** Les boutons tout juste enfoncés */
  pressed: GameButton[];
  /** Les boutons tenus */
  held: Record<GameButton, boolean>;
  /** Force en cours, pour la jauge : le plus long des boutons tenus */
  charge: number;
  /** Changer de joueur */
  swap: boolean;
  /** Le prochain tir sera enroulé, ou piqué */
  finesse: boolean;
  chip: boolean;
}

/** Il faut tenir le bouton ce temps-là pour la pleine puissance */
export const FULL_CHARGE_MS = 850;

const KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  sprint: ["ShiftLeft", "ShiftRight"],
  a: ["KeyJ", "KeyX", "Numpad1"],
  b: ["KeyI", "KeyC", "Numpad2"],
  x: ["KeyL", "KeyV", "Numpad3"],
  y: ["KeyK", "Space", "Numpad0"],
  swap: ["KeyU", "KeyE", "Tab"],
  finesse: ["KeyH"],
  chip: ["KeyG"],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());
const BUTTONS: GameButton[] = ["a", "b", "x", "y"];

export class CramponsControls {
  private held = new Set<string>();
  /** Les touches enfoncées depuis la dernière lecture : un appui très bref entre deux images compte quand même */
  private tapped = new Set<string>();
  private touchTapped = new Set<GameButton>();
  private startedAt: Partial<Record<GameButton, number>> = {};
  private padDown: Partial<Record<GameButton, boolean>> = {};
  private padSwap = false;
  private swapTaken = false;
  private touchSwap = false;
  /** L'écran tactile : le stick et les boutons tenus */
  readonly touch = {
    sx: 0,
    sy: 0,
    sprint: false,
    held: { a: false, b: false, x: false, y: false } as Record<GameButton, boolean>,
    finesse: false,
    chip: false,
  };

  constructor(private enabled: () => boolean) {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private onDown = (e: KeyboardEvent) => {
    if (!this.enabled() || !GAME_KEYS.has(e.code)) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    this.held.add(e.code);
    this.tapped.add(e.code);
  };

  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    if (KEYS.swap.includes(e.code)) this.swapTaken = false;
  };

  private onBlur = () => this.held.clear();

  private any(codes: string[]) {
    return codes.some((c) => this.held.has(c) || this.tapped.has(c));
  }

  /** Un doigt se pose ou se lève sur un bouton de l'écran */
  touchButton(button: GameButton, down: boolean) {
    this.touch.held[button] = down;
    if (down) this.touchTapped.add(button);
  }

  swapNow() {
    this.touchSwap = true;
  }

  read(): PadState {
    const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected) ?? null;
    const pb = (i: number) => Boolean(gp?.buttons[i]?.pressed);
    let sx = (this.any(KEYS.right) ? 1 : 0) - (this.any(KEYS.left) ? 1 : 0);
    let sy = (this.any(KEYS.down) ? 1 : 0) - (this.any(KEYS.up) ? 1 : 0);
    if (sx !== 0 && sy !== 0) {
      sx *= Math.SQRT1_2;
      sy *= Math.SQRT1_2;
    }
    if (gp) {
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.18) {
        sx = ax;
        sy = ay;
      }
      if (pb(14) || pb(15) || pb(12) || pb(13)) {
        sx = (pb(15) ? 1 : 0) - (pb(14) ? 1 : 0);
        sy = (pb(13) ? 1 : 0) - (pb(12) ? 1 : 0);
      }
    }
    if (Math.hypot(this.touch.sx, this.touch.sy) > 0.05) {
      sx = this.touch.sx;
      sy = this.touch.sy;
    }
    const now = performance.now();
    const held: Record<GameButton, boolean> = {
      a: this.any(KEYS.a) || pb(0) || this.touch.held.a || this.touchTapped.has("a"),
      b: this.any(KEYS.b) || pb(3) || this.touch.held.b || this.touchTapped.has("b"),
      x: this.any(KEYS.x) || pb(2) || this.touch.held.x || this.touchTapped.has("x"),
      y: this.any(KEYS.y) || pb(1) || this.touch.held.y || this.touchTapped.has("y"),
    };
    const released: ButtonPress[] = [];
    const pressed: GameButton[] = [];
    let charge = 0;
    for (const b of BUTTONS) {
      const was = this.padDown[b] ?? false;
      if (held[b] && !was) {
        this.startedAt[b] = now;
        pressed.push(b);
      }
      if (!held[b] && was) {
        const t = now - (this.startedAt[b] ?? now);
        released.push({ button: b, power: Math.min(1, t / FULL_CHARGE_MS) });
      }
      if (held[b]) charge = Math.max(charge, Math.min(1, (now - (this.startedAt[b] ?? now)) / FULL_CHARGE_MS));
      this.padDown[b] = held[b];
    }
    const padSwap = pb(4);
    let swap = padSwap && !this.padSwap;
    this.padSwap = padSwap;
    if (this.any(KEYS.swap) && !this.swapTaken) {
      this.swapTaken = true;
      swap = true;
    }
    if (this.touchSwap) {
      this.touchSwap = false;
      swap = true;
    }
    const sprint = this.any(KEYS.sprint) || this.touch.sprint || pb(5);
    const finesse = this.any(KEYS.finesse) || this.touch.finesse || pb(6);
    const chip = this.any(KEYS.chip) || this.touch.chip || pb(7);
    this.tapped.clear();
    this.touchTapped.clear();
    return {
      sx,
      sy,
      sprint,
      released,
      pressed,
      held,
      charge,
      swap,
      finesse,
      chip,
    };
  }
}
