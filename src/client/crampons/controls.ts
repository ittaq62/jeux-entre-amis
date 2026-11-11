// Les commandes d'un match : clavier et souris selon les réglages du joueur, une manette, et l'écran tactile.

import type { ActionId, Bindings } from "./bindings.ts";

export type GameButton = "pass" | "shoot" | "through" | "lob";

/** La façon de jouer repérée à l'instant : c'est elle que rappelle la bande des touches */
export type Scheme = "clavier" | "manette" | "tactile";

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
  released: ButtonPress[];
  pressed: GameButton[];
  held: Record<GameButton, boolean>;
  /** La force en cours, pour la jauge : le plus long des boutons tenus */
  charge: number;
  swap: boolean;
  /** Le crochet vient d'être demandé */
  skill: boolean;
  finesse: boolean;
  chip: boolean;
  scheme: Scheme;
  /** Le curseur, en pixels, s'il est connu */
  mouse: { x: number; y: number } | null;
  /** Depuis combien de temps la souris n'a pas bougé (ms) : un curseur oublié dans un coin ne doit pas viser */
  mouseIdle: number;
}

/** Il faut tenir le bouton ce temps-là pour la pleine puissance */
export const FULL_CHARGE_MS = 800;

const BUTTONS: GameButton[] = ["pass", "shoot", "through", "lob"];
/** Les boutons de la souris, dans le champ `buttons` des événements, et leur nom dans les réglages */
const MOUSE_BITS: [number, string][] = [
  [1, "Mouse0"],
  [2, "Mouse2"],
  [4, "Mouse1"],
  [8, "Mouse3"],
  [16, "Mouse4"],
];

export class CramponsControls {
  private held = new Set<string>();
  /** Les touches enfoncées depuis la dernière lecture : un appui très bref entre deux images compte quand même */
  private tapped = new Set<string>();
  private touchTapped = new Set<GameButton>();
  private startedAt: Partial<Record<GameButton, number>> = {};
  private padDown: Partial<Record<GameButton, boolean>> = {};
  private padSwap = false;
  private swapTaken = false;
  private skillTaken = false;
  private touchSwap = false;
  private cursor: { x: number; y: number } | null = null;
  private cursorMovedAt = -Infinity;
  private scheme: Scheme = "clavier";
  private target: HTMLElement | null = null;
  private known = new Set<string>();
  private bindings: Bindings;
  /** Pendant qu'on règle ses touches, le match n'écoute plus */
  paused = false;
  /** L'écran tactile : le stick et les boutons tenus */
  readonly touch = {
    sx: 0,
    sy: 0,
    sprint: false,
    held: { pass: false, shoot: false, through: false, lob: false } as Record<GameButton, boolean>,
    finesse: false,
    chip: false,
  };

  constructor(bindings: Bindings) {
    this.bindings = bindings;
    this.setBindings(bindings);
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  setBindings(b: Bindings) {
    this.bindings = b;
    this.known = new Set(Object.values(b).flat());
    this.held.clear();
    this.tapped.clear();
  }

  /** La souris sert sur le terrain lui-même : cliquer sur le score ou le chat ne fait pas de passe */
  attachMouse(el: HTMLElement) {
    this.target = el;
    el.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("contextmenu", this.onContext);
    el.addEventListener("auxclick", this.onContext);
  }

  dispose() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointermove", this.onPointerMove);
    this.target?.removeEventListener("pointerdown", this.onPointerDown);
    this.target?.removeEventListener("contextmenu", this.onContext);
    this.target?.removeEventListener("auxclick", this.onContext);
  }

  private onContext = (e: Event) => e.preventDefault();

  /**
   * Les boutons de la souris d'après le champ `buttons` : un deuxième bouton enfoncé pendant le premier n'envoie pas
   * de pointerdown, et seul le dernier relâché envoie un pointerup. `fresh` : on accepte de nouveaux appuis.
   */
  private syncMouse(buttons: number, fresh: boolean) {
    for (const [bit, code] of MOUSE_BITS) {
      const down = (buttons & bit) !== 0;
      if (!down) this.held.delete(code);
      else if (fresh && !this.held.has(code) && this.known.has(code) && !this.paused) {
        this.scheme = "clavier";
        this.held.add(code);
        this.tapped.add(code);
      }
    }
  }

  private mouseHeld() {
    return MOUSE_BITS.some(([, code]) => this.held.has(code));
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || this.paused) return;
    this.cursor = { x: e.clientX, y: e.clientY };
    if (!this.known.has(`Mouse${e.button}`)) return;
    e.preventDefault();
    this.syncMouse(e.buttons, true);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse") this.syncMouse(e.buttons, false);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (!this.cursor || Math.hypot(e.clientX - this.cursor.x, e.clientY - this.cursor.y) > 2) this.cursorMovedAt = performance.now();
    this.cursor = { x: e.clientX, y: e.clientY };
    // Un bouton de plus pendant qu'un autre est tenu sur le terrain, ou un bouton relâché hors de la fenêtre
    this.syncMouse(e.buttons, this.mouseHeld());
  };

  private onDown = (e: KeyboardEvent) => {
    if (this.paused || !this.known.has(e.code)) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    this.scheme = "clavier";
    this.held.add(e.code);
    this.tapped.add(e.code);
  };

  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    if (this.bindings.swap.includes(e.code)) this.swapTaken = false;
  };

  private onBlur = () => {
    this.held.clear();
  };

  private any(action: ActionId) {
    return this.bindings[action].some((c) => this.held.has(c) || this.tapped.has(c));
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
    let sx = (this.any("right") ? 1 : 0) - (this.any("left") ? 1 : 0);
    let sy = (this.any("down") ? 1 : 0) - (this.any("up") ? 1 : 0);
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
      !this.paused && (this.any(b) || pb(pad) || this.touch.held[b] || this.touchTapped.has(b));
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
        released.push({ button: b, power: Math.min(1, t / FULL_CHARGE_MS) });
      }
      // Seule la frappe se charge : les passes partent dès l'appui
      if (held[b] && b === "shoot") charge = Math.min(1, (now - (this.startedAt[b] ?? now)) / FULL_CHARGE_MS);
      this.padDown[b] = held[b];
    }
    const padSwap = pb(4);
    let swap = padSwap && !this.padSwap;
    this.padSwap = padSwap;
    if (this.any("swap") && !this.swapTaken) {
      this.swapTaken = true;
      swap = true;
    }
    if (this.touchSwap) {
      this.touchSwap = false;
      swap = true;
    }
    const skillHeld = this.any("skill");
    const skill = skillHeld && !this.skillTaken;
    this.skillTaken = skillHeld;
    const sprint = this.any("sprint") || this.touch.sprint || pb(5);
    const finesse = this.any("finesse") || this.touch.finesse || pb(6);
    const chip = this.any("chip") || this.touch.chip || pb(7);
    this.tapped.clear();
    this.touchTapped.clear();
    return {
      sx: this.paused ? 0 : sx,
      sy: this.paused ? 0 : sy,
      sprint: !this.paused && sprint,
      released,
      pressed,
      held,
      charge,
      swap: !this.paused && swap,
      skill: !this.paused && skill,
      finesse,
      chip,
      scheme: this.scheme,
      mouse: this.cursor,
      mouseIdle: now - this.cursorMovedAt,
    };
  }
}
