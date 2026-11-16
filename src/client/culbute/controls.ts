// Les commandes d'un combat : le clavier et la souris (réglables, voir bindings.ts), une manette, ou l'écran tactile
// (un stick sous le pouce gauche, trois boutons sous le droit, la garde en posant le pouce sur Frapper et Spécial à la fois).
// Une fois par image, tout devient une seule commande : le stick, les boutons tenus et ceux qu'on vient d'enfoncer.

import { ATK, GRB, JMP, SHD, SPC, type Input } from "../../shared/games/culbute/model.ts";
import { ACTION_IDS, loadSettings, type ActionId, type CulbuteSettings } from "./bindings.ts";

export type Scheme = "clavier" | "manette" | "tactile";

const BITS: Partial<Record<ActionId, number>> = { attack: ATK, special: SPC, jump: JMP, shield: SHD, grab: GRB };

/** Un clic sur l'interface (boutons, menus, discussion) n'est pas un coup */
const UI = "button, a, input, textarea, select, label, summary, [role='dialog'], [role='menu'], .panel";

export class CulbuteControls {
  /** Les touches et boutons de souris enfoncés (`KeyW`, `Mouse0`…) */
  private held = new Set<string>();
  /** Ceux enfoncés depuis la dernière lecture : un appui très bref entre deux images compte quand même */
  private tapped = new Set<string>();
  private byCode = new Map<string, ActionId[]>();
  private padPrev = 0;
  private touchPrevHeld = 0;
  private scheme: Scheme = "clavier";
  private settings: CulbuteSettings;
  /** Pendant que l'aide, le menu ou les réglages sont ouverts, le combat n'écoute plus */
  paused = false;
  readonly touch = { sx: 0, sy: 0, atk: false, spc: false, jmp: false, grb: false, taps: 0 };

  constructor(settings: CulbuteSettings = loadSettings()) {
    this.settings = settings;
    this.index();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("blur", this.onBlur);
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("blur", this.onBlur);
  }

  get current(): Scheme {
    return this.scheme;
  }

  get stickJump(): boolean {
    return this.settings.stickJump;
  }

  setSettings(s: CulbuteSettings) {
    this.settings = s;
    this.index();
    this.held.clear();
    this.tapped.clear();
  }

  private index() {
    this.byCode.clear();
    for (const id of ACTION_IDS) {
      for (const code of this.settings.bindings[id]) {
        const list = this.byCode.get(code) ?? [];
        list.push(id);
        this.byCode.set(code, list);
      }
    }
  }

  private press(code: string) {
    this.scheme = "clavier";
    if (!this.held.has(code)) this.tapped.add(code);
    this.held.add(code);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused || !this.byCode.has(e.code)) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return;
    e.preventDefault();
    this.press(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    const code = `Mouse${e.button}`;
    if (this.paused || !this.byCode.has(code)) return;
    if (e.target instanceof Element && e.target.closest(UI)) return;
    // Pas de défilement automatique (molette) ni de sélection de texte pendant le combat
    e.preventDefault();
    this.press(code);
  };

  private onMouseUp = (e: MouseEvent) => {
    const code = `Mouse${e.button}`;
    this.held.delete(code);
    // Les boutons de côté de la souris feraient revenir le navigateur en arrière
    if (!this.paused && this.byCode.has(code) && e.button >= 3) e.preventDefault();
  };

  /** Le clic droit sert au combat : pas de menu du navigateur, sauf sur l'interface */
  private onContextMenu = (e: MouseEvent) => {
    if (this.paused || !this.byCode.has("Mouse2")) return;
    if (e.target instanceof Element && e.target.closest(UI)) return;
    e.preventDefault();
  };

  private onBlur = () => {
    this.held.clear();
  };

  /** Un doigt sur un bouton de l'écran */
  touchButton(which: "atk" | "spc" | "jmp" | "grb", down: boolean) {
    this.scheme = "tactile";
    this.touch[which] = down;
    if (down) this.touch.taps |= which === "atk" ? ATK : which === "spc" ? SPC : which === "grb" ? GRB : JMP;
  }

  /** L'action est-elle tenue, ou vient-elle d'être enfoncée ? */
  private state(): { held: Set<ActionId>; tapped: Set<ActionId> } {
    const held = new Set<ActionId>();
    const tapped = new Set<ActionId>();
    for (const code of this.held) for (const id of this.byCode.get(code) ?? []) held.add(id);
    for (const code of this.tapped) for (const id of this.byCode.get(code) ?? []) tapped.add(id);
    return { held, tapped };
  }

  /** La commande de cette image */
  sample(): Input {
    if (this.paused) {
      this.tapped.clear();
      this.touch.taps = 0;
      return { x: 0, y: 0, held: 0, pressed: 0 };
    }
    const keys = this.state();
    this.tapped.clear();
    let x = (keys.held.has("right") ? 1 : 0) - (keys.held.has("left") ? 1 : 0);
    let y = (keys.held.has("up") ? 1 : 0) - (keys.held.has("down") ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    let held = 0;
    let tapped = 0;
    for (const [id, bit] of Object.entries(BITS) as [ActionId, number][]) {
      if (keys.held.has(id)) held |= bit;
      if (keys.tapped.has(id)) tapped |= bit;
    }
    // La touche du haut fait sauter (un appui, un saut)
    if (this.settings.upJumps && keys.tapped.has("up")) tapped |= JMP;

    // La manette : stick gauche ou croix, A ou Y pour sauter, X pour frapper, B pour le spécial, la gâchette haute droite
    // pour saisir, les autres gâchettes pour la garde
    const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected) ?? null;
    if (gp) {
      const pb = (i: number) => Boolean(gp.buttons[i]?.pressed);
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      let pad = 0;
      if (pb(0) || pb(3)) pad |= JMP;
      if (pb(2)) pad |= ATK;
      if (pb(1)) pad |= SPC;
      if (pb(4) || pb(6) || pb(7)) pad |= SHD;
      if (pb(5)) pad |= GRB;
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
    let touchHeld = (t.atk ? ATK : 0) | (t.spc ? SPC : 0) | (t.jmp ? JMP : 0) | (t.grb ? GRB : 0);
    if (t.atk && t.spc) touchHeld = SHD | (t.jmp ? JMP : 0);
    if (this.settings.stickJump && t.sy > 0.65) touchHeld |= JMP;
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
