// Les commandes du kart : le clavier (flèches, ou ZQSD/WASD : on lit la place des touches, pas leur lettre),
// une manette, et les boutons à l'écran sur téléphone. Tout se résume en un volant, deux pédales, le bouton de
// dérapage, et deux boutons qui ne comptent qu'au moment où on les enfonce (l'objet, repartir).

import type { Input } from "../../shared/games/bolides/physics.ts";

export interface Pad extends Input {
  /** Vrai une seule fois par appui */
  item: boolean;
  respawn: boolean;
  /** L'objet partira dans l'autre sens (le frein tenu, ou un glissement du doigt) */
  flip: boolean;
  /** Regarder derrière soi */
  look: boolean;
}

/** Les boutons de l'écran tactile, tenus ou non */
export interface TouchState {
  left: boolean;
  right: boolean;
  drift: boolean;
  brake: boolean;
  /** Des appuis à servir */
  item: number;
  /** Le prochain objet part dans l'autre sens */
  flip: boolean;
}

const KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  gas: ["ArrowUp", "KeyW"],
  brake: ["ArrowDown", "KeyS"],
  drift: ["Space", "ShiftLeft", "ShiftRight"],
  item: ["KeyE", "KeyX", "KeyC", "KeyF", "KeyV", "Enter", "NumpadEnter", "Numpad0"],
  respawn: ["KeyR"],
  look: ["KeyB"],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());

export class Controls {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private steer = 0;
  private padItem = false;
  private padRespawn = false;
  readonly touch: TouchState = { left: false, right: false, drift: false, brake: false, item: 0, flip: false };
  /** Accélérer sans rien tenir (sur téléphone) */
  autoGas = false;

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
    if (!this.held.has(e.code)) this.pressed.add(e.code);
    this.held.add(e.code);
  };

  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
  };

  private any(codes: string[]) {
    return codes.some((c) => this.held.has(c));
  }

  private took(codes: string[]) {
    const hit = codes.some((c) => this.pressed.has(c));
    for (const c of codes) this.pressed.delete(c);
    return hit;
  }

  /** Ce que demande le pilote à cet instant ; `dt` : le temps depuis la dernière fois, pour adoucir le volant */
  read(dt: number): Pad {
    const pad = this.gamepad();
    const t = this.touch;
    const left = this.any(KEYS.left) || t.left;
    const right = this.any(KEYS.right) || t.right;
    // Le volant du clavier se tourne vite mais pas d'un coup, et revient encore plus vite
    const want = (right ? 1 : 0) - (left ? 1 : 0);
    const rate = want === 0 || Math.sign(want) !== Math.sign(this.steer) ? 9 : 6;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, want - this.steer));
    const steer = pad && Math.abs(pad.steer) > 0.12 ? pad.steer : this.steer;
    const brake = this.any(KEYS.brake) || t.brake || Boolean(pad?.brake);
    const item = this.took(KEYS.item) || t.item > 0 || Boolean(pad?.item);
    if (t.item > 0) t.item -= 1;
    const flip = brake || t.flip;
    if (item) t.flip = false;
    return {
      steer: Math.max(-1, Math.min(1, steer)),
      gas: (this.autoGas && !brake) || this.any(KEYS.gas) || Boolean(pad?.gas),
      brake,
      drift: this.any(KEYS.drift) || t.drift || Boolean(pad?.drift),
      item,
      respawn: this.took(KEYS.respawn) || Boolean(pad?.respawn),
      flip,
      look: this.any(KEYS.look) || Boolean(pad?.look),
    };
  }

  /** Une manette branchée : stick gauche ou croix, A/gâchette droite pour accélérer, B/gâchette gauche pour freiner */
  private gamepad(): Pad | null {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const b = (i: number) => Boolean(gp.buttons[i]?.pressed);
    const axis = gp.axes[0] ?? 0;
    const dpad = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    const item = b(4) || b(2);
    const respawn = b(3);
    const out: Pad = {
      steer: dpad !== 0 ? dpad : Math.abs(axis) > 0.12 ? axis : 0,
      gas: b(0) || b(7),
      brake: b(1) || b(6),
      drift: b(5),
      item: item && !this.padItem,
      respawn: respawn && !this.padRespawn,
      flip: b(1) || b(6),
      look: b(10),
    };
    this.padItem = item;
    this.padRespawn = respawn;
    return out;
  }
}
