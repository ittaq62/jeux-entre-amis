// Les commandes d'un match : le clavier (on lit la place des touches, pas leur lettre), la souris pour viser, une manette,
// et l'écran tactile. Pour jouer il suffit de Passe, Tir et Sprint : le reste vient quand on veut progresser.

export type GameButton = "pass" | "shoot" | "through" | "lob";

/** La façon de jouer repérée à l'instant : c'est elle que rappelle la bande des touches */
export type Scheme = "fleches" | "zqsd" | "souris" | "manette" | "tactile";

export interface ButtonPress {
  button: GameButton;
  /** De 0 à 1 : le temps pendant lequel il a été tenu */
  power: number;
  /** Lâché à la souris : la visée vient du curseur */
  mouse: boolean;
}

export interface PadState {
  /** Le stick, en repère écran : x vers la droite, y vers le bas */
  sx: number;
  sy: number;
  sprint: boolean;
  released: ButtonPress[];
  pressed: GameButton[];
  held: Record<GameButton, boolean>;
  /** La force en cours, pour la jauge : le plus long des boutons tenus */
  charge: number;
  swap: boolean;
  finesse: boolean;
  chip: boolean;
  scheme: Scheme;
  /** Le curseur, en pixels, s'il a bougé récemment */
  mouse: { x: number; y: number } | null;
}

/** Il faut tenir le bouton ce temps-là pour la pleine puissance */
export const FULL_CHARGE_MS = 800;

const KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  sprint: ["ShiftLeft", "ShiftRight"],
  pass: ["Space", "KeyJ"],
  shoot: ["KeyC", "KeyK", "Enter"],
  through: ["KeyX", "KeyI"],
  lob: ["KeyV", "KeyL"],
  swap: ["KeyE", "KeyU", "Tab"],
  finesse: ["KeyF", "KeyH"],
  chip: ["KeyG"],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());
const BUTTONS: GameButton[] = ["pass", "shoot", "through", "lob"];
const MOUSE_BUTTON: Record<number, GameButton> = { 0: "pass", 2: "shoot", 1: "lob" };

export class CramponsControls {
  private held = new Set<string>();
  /** Les touches enfoncées depuis la dernière lecture : un appui très bref entre deux images compte quand même */
  private tapped = new Set<string>();
  private touchTapped = new Set<GameButton>();
  private mouseHeld = new Set<GameButton>();
  private mouseTapped = new Set<GameButton>();
  private startedAt: Partial<Record<GameButton, number>> = {};
  private padDown: Partial<Record<GameButton, boolean>> = {};
  private padSwap = false;
  private swapTaken = false;
  private touchSwap = false;
  private cursor: { x: number; y: number; at: number } | null = null;
  private scheme: Scheme = "fleches";
  private target: HTMLElement | null = null;
  /** L'écran tactile : le stick et les boutons tenus */
  readonly touch = {
    sx: 0,
    sy: 0,
    sprint: false,
    held: { pass: false, shoot: false, through: false, lob: false } as Record<GameButton, boolean>,
    finesse: false,
    chip: false,
  };

  constructor(private enabled: () => boolean) {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  /** La souris sert sur le terrain lui-même : cliquer sur le score ou le chat ne fait pas de passe */
  attachMouse(el: HTMLElement) {
    this.target = el;
    el.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("contextmenu", this.onContext);
  }

  dispose() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointermove", this.onPointerMove);
    this.target?.removeEventListener("pointerdown", this.onPointerDown);
    this.target?.removeEventListener("contextmenu", this.onContext);
  }

  private onContext = (e: Event) => e.preventDefault();

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !this.enabled()) return;
    const b = MOUSE_BUTTON[e.button];
    if (!b) return;
    e.preventDefault();
    this.scheme = "souris";
    this.mouseHeld.add(b);
    this.mouseTapped.add(b);
    this.cursor = { x: e.clientX, y: e.clientY, at: performance.now() };
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const b = MOUSE_BUTTON[e.button];
    if (b) this.mouseHeld.delete(b);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse") this.cursor = { x: e.clientX, y: e.clientY, at: performance.now() };
  };

  private onDown = (e: KeyboardEvent) => {
    if (!this.enabled() || !GAME_KEYS.has(e.code)) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    this.held.add(e.code);
    this.tapped.add(e.code);
    if (e.code.startsWith("Arrow")) this.scheme = this.scheme === "souris" ? "souris" : "fleches";
    else if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code) && this.scheme !== "souris") this.scheme = "zqsd";
  };

  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    if (KEYS.swap.includes(e.code)) this.swapTaken = false;
  };

  private onBlur = () => {
    this.held.clear();
    this.mouseHeld.clear();
  };

  private any(codes: string[]) {
    return codes.some((c) => this.held.has(c) || this.tapped.has(c));
  }

  /** Un doigt se pose ou se lève sur un bouton de l'écran */
  touchButton(button: GameButton, down: boolean) {
    this.scheme = "tactile";
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
        this.scheme = "manette";
      }
      if (pb(14) || pb(15) || pb(12) || pb(13)) {
        sx = (pb(15) ? 1 : 0) - (pb(14) ? 1 : 0);
        sy = (pb(13) ? 1 : 0) - (pb(12) ? 1 : 0);
        this.scheme = "manette";
      }
    }
    if (Math.hypot(this.touch.sx, this.touch.sy) > 0.05) {
      sx = this.touch.sx;
      sy = this.touch.sy;
      this.scheme = "tactile";
    }
    const now = performance.now();
    const isDown = (b: GameButton, pad: number) =>
      this.any(KEYS[b]) || pb(pad) || this.touch.held[b] || this.touchTapped.has(b) || this.mouseHeld.has(b) || this.mouseTapped.has(b);
    const held: Record<GameButton, boolean> = {
      pass: isDown("pass", 0),
      through: isDown("through", 3),
      lob: isDown("lob", 2),
      shoot: isDown("shoot", 1),
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
        released.push({ button: b, power: Math.min(1, t / FULL_CHARGE_MS), mouse: this.scheme === "souris" });
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
    this.mouseTapped.clear();
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
      scheme: this.scheme,
      mouse: this.cursor && now - this.cursor.at < 4000 ? { x: this.cursor.x, y: this.cursor.y } : null,
    };
  }
}
